//
// Created by Keren Dong on 2020/4/6.
// Updated for Margin Account on 2022/2/18
//

#ifndef WINGCHUN_ACCOUNTING_STOCK_H
#define WINGCHUN_ACCOUNTING_STOCK_H

#include <kungfu/wingchun/book/accounting.h>
#include <kungfu/wingchun/book/bookkeeper.h>

using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::wingchun;
using namespace kungfu::yijinjing;
using namespace kungfu::yijinjing::data;

namespace kungfu::wingchun::book {

#define DEFAULT_STOCK_CONTRACT_MULTIPLIER 100
#define DEFAULT_STOCK_LONG_MARGIN_RATIO 1.0
#define DEFAULT_STOCK_SHORT_MARGIN_RATIO 0.65
#define DEFAULT_STOCK_DISCOUNT_RATIO 0.6

struct contract_discount_and_margin_ratio {
  int32_t contract_multiplier;  //This is not required for Stock
  double long_margin_ratio;
  double short_margin_ratio;
  double margin_ratio;
  double discount_ratio; //For collateral/avail_margin calculation
};
class StockAccountingMethod : public AccountingMethod {
public:
  static constexpr double min_comission = 5;
  static constexpr double commission_ratio = 0.0008;

  StockAccountingMethod() = default;

  virtual void apply_trading_day(Book_ptr &book, int64_t trading_day) override {

      auto apply = [&](PositionMap &positions) {
      for (auto &pair : positions) {
        auto &position = pair.second;
        auto margin_pre = position.margin;
        if (is_valid_price(position.close_price)) {
          position.pre_close_price = position.close_price;
        } else if (is_valid_price(position.last_price)) {
          position.pre_close_price = position.last_price;
        }
       //collateral; security
        auto cd_mr =  get_instrument_discount_and_margin_ratio(book, position.exchange_id,
                                                                         position.instrument_id, position);
        auto margin_ratio = (position.direction == Direction::Long ? cd_mr.long_margin_ratio : cd_mr.short_margin_ratio);
        
        position.margin = position.pre_close_price * position.volume * margin_ratio;

        book->asset.avail -= position.margin - margin_pre;
        position.pre_close_price = position.close_price;
        position.last_price = position.pre_close_price;
        position.settlement_price = 0;

        position.yesterday_volume = position.volume;
        position.close_price = 0;
        position.update_time = trading_day;
        position.trading_day = time::strftime(trading_day, KUNGFU_TRADING_DAY_FORMAT).c_str();

        update_position(book, position);
      }
    };

    apply(book->long_positions);
    apply(book->short_positions);
  }

  virtual void apply_quote(Book_ptr &book, const Quote &quote) override {
    auto apply = [&](Position &position) {
      //auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
      //根据实时行情变化计算实时可用保证金过于复杂（持仓很多标的的情况下，计算量大)
      if (is_valid_price(quote.last_price)) {
        // auto margin_pre = position.margin;
        // cd_mr.contract_multiplier is not required
        // position.margin =  position.last_price * position.volume * cd_mr.margin_ratio;
        // book->asset.avail -= position.margin - margin_pre;
        position.last_price = quote.last_price;
        update_position(book, position);
      }
      if (is_valid_price(quote.pre_close_price)) {
        position.pre_close_price = quote.pre_close_price;
      }
    };
    apply(book->get_position_for(Direction::Long, quote));
    apply(book->get_position_for(Direction::Short, quote));

  }

  virtual void apply_order_input(Book_ptr &book, const OrderInput &input) override {
    auto &position = book->get_position_for(input);
    //Offset: Close
    if ((input.side == Side::Sell || input.side == Side::RepayMargin ) and
        position.yesterday_volume - position.frozen_yesterday >= input.volume) {
      position.frozen_total += input.volume;
      position.frozen_yesterday += input.volume;
    } else if (input.side == Side::Buy || input.side == Side::RepayStock) {
      book->asset.frozen_cash += input.volume * input.frozen_price;
      book->asset.avail -= input.volume * input.frozen_price;
    } else if (input.side == Side::MarginTrade || input.side == Side::ShortSell) {
      auto cd_mr =
          get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
      double frozen_margin = (input.volume * input.frozen_price) * (input.side == Side::MarginTrade ? cd_mr.long_margin_ratio: cd_mr.short_margin_ratio);
      book->asset.frozen_margin += frozen_margin;
      book->asset.avail_margin -= frozen_margin;
    }
    //This call can be commented as no pnl change (update_position() just update 'unrealized_pnl' at present)
    //update_position(book, position);
  }

  virtual void apply_order(Book_ptr &book, const Order &order) override {
    if (book->orders.find(order.order_id) == book->orders.end()) {
      book->orders.emplace(order.order_id, order);
    }

    if (is_final_status(order.status)) {
      auto &position = book->get_position_for(order);
      if (order.side == Side::Buy || order.side == Side::RepayStock) {
        auto frozen = book->get_frozen_price(order.order_id) * order.volume_left;
        book->asset.frozen_cash -= frozen;
        book->asset.avail += frozen;
      } else if (order.side == Side::Sell || order.side == Side::RepayMargin) {
        position.frozen_total = std::max(position.frozen_total - order.volume_left, VOLUME_ZERO);
        position.frozen_yesterday = std::max(position.frozen_yesterday - order.volume_left, VOLUME_ZERO);
      } else if (order.side == Side::MarginTrade || order.side == Side::ShortSell) {
        auto cd_mr =
            get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
        auto frozen = book->get_frozen_price(order.order_id) * order.volume_left *
                      (order.side == Side::MarginTrade ? cd_mr.long_margin_ratio : cd_mr.short_margin_ratio);
        book->asset.frozen_margin -= frozen;
        book->asset.avail_margin += frozen;
      } 
      //it assumes position.volume is changed already(apply_trade), otherwise position.volume would be inconsistant.
      update_position(book, position);
    }
  }

  virtual void apply_trade(Book_ptr &book, const Trade &trade) override {
    if (trade.side == Side::Sell) {
      apply_sell(book, trade);
    } else if (trade.side == Side::Buy) {
      apply_buy(book, trade);
    } else if (trade.side == Side::MarginTrade) {
      apply_margintrade(book, trade);
    } else if (trade.side == Side::ShortSell) {
      apply_shortsell(book, trade);
    } else if (trade.side == Side::RepayMargin) {
      apply_repaymargin(book, trade);
    } else if (trade.side == Side::RepayStock) {
      apply_repaystock(book, trade);
    };

    //update_position(book, book->get_position_for(trade));
  }

  virtual void update_position(Book_ptr &book, Position &position) override {
    if (position.last_price > 0) {
      double price_change = position.last_price - position.avg_open_price;
      position.unrealized_pnl =
          (position.direction == Direction::Long ? price_change : -price_change) * position.volume;
    }
  }

protected:
  std::unordered_map<uint64_t, double> commission_map_ = {};

  virtual void apply_buy(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price = (position.avg_open_price * position.volume + trade.price * trade.volume) /
                                (double)(position.volume + trade.volume);
    }
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.volume += trade.volume;

    update_position(book, position);

    auto frozen = book->get_frozen_price(trade.order_id) * trade.volume;
    book->asset.frozen_cash -= frozen;
    book->asset.avail -= commission;
    book->asset.avail -= tax;
    // A minor issue: the asset.avail should minus frozen including commission&tax;
    book->asset.avail += frozen;
    
    book->asset.avail -= trade.price * trade.volume;
    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;
  }

  virtual void apply_shortsell(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price = (position.avg_open_price * position.volume + trade.price * trade.volume) /
                                (double)(position.volume + trade.volume);
    }
    //TODO: setup calculate_margin_commission(Trade&);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.volume += trade.volume;

    update_position(book, position);

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    auto frozen = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.short_margin_ratio;
    book->asset.frozen_margin -= frozen;
    book->asset.avail_margin += frozen;
    //book->asset.avail_margin -= commission;  // could be -= commission * cd_mr.long_margin_ratio;
    //book->asset.avail_margin -= tax;   // could be -= tax * cd_mr.long_margin_ratio;
    //If commission&rate comes from the account cash, then should be done as below two statements.
    //book->asset.avail -= commission;
    //book->asset.avail -= tax;

    double rq_amt = trade.price * trade.volume + commission + tax; // 融券卖出成交资金 + 手续费 + 税费
    double rq_income = trade.price * trade.volume - (commission + tax); //融券卖出清算资金
    book->asset.rq_income += rq_income; // asset.rq_deb: 融券累计卖出清算资金 + (commission + tax) * 2， 即 融券累计卖出清算资金= trade.price * trade.volume - (commission + tax)
                                        
    book->asset.rq_margin += rq_amt * cd_mr.short_margin_ratio; // trade.price *trade.volume *cd_mr.long_margin_ratio;
    book->asset.total_asset += rq_income;
    book->asset.avail_margin -= rq_amt * cd_mr.short_margin_ratio;
    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;
  }

  virtual void apply_margintrade(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price = (position.avg_open_price * position.volume + trade.price * trade.volume) /
                                (double)(position.volume + trade.volume);
    }
    // TODO: setup calculate_margin_commission(Trade&);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.volume += trade.volume;

    update_position(book, position);

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    auto frozen = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.long_margin_ratio;
    book->asset.frozen_margin -= frozen;
    book->asset.avail_margin += frozen;
    // book->asset.avail_margin -= commission;  // could be -= commission * cd_mr.long_margin_ratio;
    // book->asset.avail_margin -= tax;   // could be -= tax * cd_mr.long_margin_ratio;
    // If commission&rate comes from the account cash, then should be done as below two statements.
    // book->asset.avail -= commission;
    // book->asset.avail -= tax;

    double rz_debt = trade.price * trade.volume + commission + tax;
    book->asset.rz_debt += rz_debt;
    book->asset.rz_margin += rz_debt * cd_mr.long_margin_ratio; // trade.price *trade.volume *cd_mr.long_margin_ratio;

    book->asset.avail_margin -= rz_debt * cd_mr.long_margin_ratio;
    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;
  }

  virtual void apply_repaymargin(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    auto realized_pnl = (trade.price - position.avg_open_price) * trade.volume;
    position.realized_pnl += realized_pnl;
    book->asset.realized_pnl += realized_pnl;
    update_position(book, position);

    double trade_amt = trade.price * trade.volume;
    double income = trade_amt - (commission + tax);

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);

    //TODO: need check whether repaymargin done for a specified (dedicated contract) MarginDebt, otherwise total margin debt.
    if (income > book->asset.rz_debt) {
      book->asset.avail += income - book->asset.rz_debt;
      book->asset.avail_margin += book->asset.rz_margin;
      
      // if total_asset contains the position market value, then repaymargin reduces the market value.
      book->asset.total_asset -= book->asset.rz_debt;

      book->asset.rz_margin = 0;
      book->asset.rz_debt = 0;
        
    } else {
      book->asset.rz_debt -= income;
      double released_margin = income * cd_mr.long_margin_ratio;
      book->asset.rz_margin -= released_margin;
      book->asset.avail_margin += released_margin;

      //if total_asset contains the position market value, then repaymargin reduces the market value. 
      book->asset.total_asset -= trade_amt + commission + tax;
    }
    book->asset.market_value -= trade_amt;

    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;
  }

  virtual void apply_repaystock(Book_ptr &book, const Trade &trade) {

    auto &position = book->get_position_for(trade);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    //Position Direction: Short
    //position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    //position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    auto realized_pnl = (position.avg_open_price - trade.price) * trade.volume;
    position.realized_pnl += realized_pnl;

    update_position(book, position);

    book->asset.realized_pnl += realized_pnl;

    auto frozen = book->get_frozen_price(trade.order_id) * trade.volume;
    book->asset.frozen_cash -= frozen;
    book->asset.avail -= commission;
    book->asset.avail -= tax;
    // A minor issue: the asset.avail should minus frozen including commission&tax;
    book->asset.avail += frozen;

    book->asset.avail -= trade.price * trade.volume;
    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    double released_margin = trade.price * trade.volume * cd_mr.short_margin_ratio +
                             trade.price * trade.volume * cd_mr.discount_ratio - trade.price * trade.volume -
                             (commission + tax);
    //commission & tax are paid by asset.avail (cash) instead of asset.avail_margin
    //As the asset.avail is changed, the total margin quota would be changed accordingly.
    book->asset.avail_margin += released_margin;
    
    double closed_rq_debt = trade.price * trade.volume;
    book->asset.rq_market_value -= closed_rq_debt;

  }



  virtual void apply_sell(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    auto realized_pnl = (trade.price - position.avg_open_price) * trade.volume;
    position.realized_pnl += realized_pnl;

    update_position(book, position);

    book->asset.realized_pnl += realized_pnl;
    book->asset.avail += trade.price * trade.volume;
    book->asset.avail -= commission;
    book->asset.avail -= tax;
    book->asset.intraday_fee += commission + tax;
    book->asset.accumulated_fee += commission + tax;
  }

  virtual double calculate_commission(const Trade &trade) {
    if (commission_map_.find(trade.order_id) == commission_map_.end()) {
      commission_map_.emplace(trade.order_id, min_comission);
    }
    auto commission = commission_map_[trade.order_id];    //commission of history trades of the order 
    auto amount = trade.price * trade.volume * commission_ratio;//this commission 
    if (commission == min_comission) {
      if (amount > commission) {
        commission_map_.emplace(trade.order_id, 0);
        return amount;
      } else {
        commission_map_[trade.order_id] = commission_map_[trade.order_id] - amount;
        return min_comission;
      }
    } else {
      if (amount > commission) {
        commission_map_.emplace(trade.order_id, 0);
        return amount - commission;
      } else {
        commission_map_[trade.order_id] = commission_map_[trade.order_id] - amount;
        return 0;
      }
    }
  }

  virtual double calculate_tax(const Trade &trade) {
    return trade.side == Side::Sell ? trade.price * trade.volume * 0.001 : 0;
  }

   static contract_discount_and_margin_ratio
  get_instrument_discount_and_margin_ratio(Book_ptr &book, const char *exchange_id,
                                                      const char *instrument_id, const Position &position) {
    auto hashed_instrument_key = hash_instrument(exchange_id, instrument_id);
    contract_discount_and_margin_ratio cd_mr = {};
    if (book->instruments.find(hashed_instrument_key) == book->instruments.end()) {
      SPDLOG_WARN("instrument information missing for {}@{}", instrument_id, exchange_id);
      cd_mr.contract_multiplier = DEFAULT_STOCK_CONTRACT_MULTIPLIER;
      cd_mr.margin_ratio = position.direction == Direction::Long ? DEFAULT_STOCK_LONG_MARGIN_RATIO
                                                                 : DEFAULT_STOCK_SHORT_MARGIN_RATIO;
      return cd_mr;
    }

    auto &instrument = book->instruments.at(hashed_instrument_key);
    cd_mr.contract_multiplier = instrument.contract_multiplier;
    cd_mr.margin_ratio = margin_ratio(instrument, position);
    return cd_mr;
  }

  static double margin_ratio(const Instrument &instrument, const Position &position) {
    return position.direction == Direction::Long ? instrument.long_margin_ratio : instrument.short_margin_ratio;
  }
};
} // namespace kungfu::wingchun::book
#endif // WINGCHUN_ACCOUNTING_STOCK_H
