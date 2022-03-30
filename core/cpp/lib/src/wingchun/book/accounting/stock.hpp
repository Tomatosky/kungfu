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

        book->asset_margin.avail_margin -= position.margin - margin_pre;
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
      if (is_valid_price(quote.last_price)) {
        double price_change = quote.last_price - position.last_price;
        if (price_change) {
          auto cd_mr =
              get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
          double market_value_change = price_change * position.volume;
          double avail_margin_change;

          auto &asset = book->asset;
          auto &asset_margin = book->asset_margin;
          asset_margin.total_asset += market_value_change;
          if (position.direction == Direction::Long) {
            avail_margin_change = cd_mr.discount_ratio * market_value_change;
            // position.margin would not be changed for Long direction, the margin depends on debt.
            // TODO: As non-margin position and margin position are combined together, need distinguish each volume.
            // asset_margin.margin_market_value += price_change * position.margin_volume;

            asset.market_value += market_value_change;  // Asset.market_value means Long positions only.
            //asset.margin += price_change * position.margin_volume;
            asset.unrealized_pnl += market_value_change;
          } else {
            double short_margin_change = cd_mr.short_margin_ratio * market_value_change;
            avail_margin_change = -cd_mr.discount_ratio * market_value_change - short_margin_change;
            position.margin += short_margin_change;
            asset_margin.short_margin += short_margin_change;
            asset_margin.short_market_value += market_value_change;
            //Asset.margin is combined with long_margin and short_margin.
            asset.margin += short_margin_change;
            asset.unrealized_pnl -= market_value_change;
          }
          asset_margin.avail_margin += avail_margin_change;

          position.last_price = quote.last_price;
          // update position.unrealized_pnl
          update_position(book, position);
        }
        
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
    } else if (input.side == Side::Buy) {  //Offset: Open
      // TODO: book->asset.frozen_fee += frozen_cash * fee_ratio;
      double frozen_fee = 0;
      double frozen_cash = input.volume * input.frozen_price + frozen_fee;
      book->asset.frozen_cash += frozen_cash;
      book->asset.avail -= frozen_cash;
    } else if (input.side == Side::RepayStock and  //Offset: Close
               position.yesterday_volume - position.frozen_yesterday >= input.volume) {
      // TODO: book->asset.frozen_fee += frozen_cash * fee_ratio;
      double frozen_fee = 0;
      double frozen_cash = input.volume * input.frozen_price + frozen_fee;
      book->asset.frozen_cash += frozen_cash;
      book->asset.avail -= frozen_cash;
      //Short position need frozen
      position.frozen_total += input.volume;
      position.frozen_yesterday += input.volume;
    } else if (input.side == Side::MarginTrade || input.side == Side::ShortSell) {
      auto cd_mr =
          get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
      // TODO: book->asset.frozen_fee += frozen_cash * fee_ratio;
      double frozen_fee = 0;
      double frozen_cash = input.volume * input.frozen_price + frozen_fee;

      double frozen_margin = frozen_cash * 
          (input.side == Side::MarginTrade ? cd_mr.long_margin_ratio: cd_mr.short_margin_ratio);
      book->asset.frozen_margin += frozen_margin;
      book->asset_margin.avail_margin -= frozen_margin;
      if (input.side == Side::MarginTrade) {
        book->asset_margin.cash_margin += frozen_margin;
      } else {
        book->asset_margin.short_margin += frozen_margin;
      }
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
      if (order.side == Side::Buy) {
        auto frozen = book->get_frozen_price(order.order_id) * order.volume_left;
        book->asset.frozen_cash -= frozen;
        book->asset.avail += frozen;
      } else if (order.side == Side::RepayStock) {
        double frozen = book->get_frozen_price(order.order_id) * order.volume_left;
        double frozen_fee = 0;
        frozen += frozen_fee;
        book->asset.frozen_cash -= frozen;
        book->asset.avail += frozen;
        position.frozen_total = std::max(position.frozen_total - order.volume_left, VOLUME_ZERO);
        position.frozen_yesterday = std::max(position.frozen_yesterday - order.volume_left, VOLUME_ZERO);
      } else if (order.side == Side::Sell || order.side == Side::RepayMargin) {
        // RepayMargin margin_debt frozen: asset_margin.cash_debt  (MarginTrade debt), yet as it can
        // repay debt from other position, so here does not track frozen part.
        // RepayMargin allows order amount more than margin case_debt, when all case_debt repaid, the left
        // cash would be put into asset.cash
        position.frozen_total = std::max(position.frozen_total - order.volume_left, VOLUME_ZERO);
        position.frozen_yesterday = std::max(position.frozen_yesterday - order.volume_left, VOLUME_ZERO);
      } else if (order.side == Side::MarginTrade || order.side == Side::ShortSell) {
        auto cd_mr =
            get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
        double frozen_margin = book->get_frozen_price(order.order_id) * order.volume_left *
                      (order.side == Side::MarginTrade ? cd_mr.long_margin_ratio : cd_mr.short_margin_ratio);
        double frozen_fee = 0;
        frozen_margin += frozen_fee;
        book->asset.frozen_margin -= frozen_margin;
        book->asset_margin.avail_margin += frozen_margin;
        if (order.side == Side::MarginTrade) {
          book->asset_margin.cash_margin -= frozen_margin;
        } else {
          book->asset_margin.short_margin -= frozen_margin;
        }
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
    double trade_amt = trade.price * trade.volume;
    double commission = calculate_commission(trade);
    double tax = calculate_tax(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price = (position.avg_open_price * position.volume + trade_amt) /
                                (double)(position.volume + trade.volume);
      position.position_cost_price = (position.position_cost_price * position.volume + trade_amt + commission + tax) /
                                     (double)(position.volume + trade.volume);
    }
    
    position.volume += trade.volume;

    update_position(book, position);

    double frozen = book->get_frozen_price(trade.order_id) * trade.volume;
    double frozen_fee = 0;
    frozen += frozen_fee;
    auto &asset = book->asset;
    asset.frozen_cash -= frozen;
    asset.avail -= commission;
    asset.avail -= tax;
    // A minor issue: the asset.avail should minus frozen including commission&tax;
    asset.avail += frozen;
    asset.avail -= trade_amt;
    asset.market_value += trade_amt;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;
    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    double avail_margin_changes = trade_amt * (cd_mr.discount_ratio - 1) - tax - commission;
    book->asset_margin.avail_margin += avail_margin_changes;
  }

  virtual void apply_shortsell(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    double trade_amt = trade.price * trade.volume;
    // TODO: margin_commission requires a dedicate calculate_margin_commission(Trade&);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price =
          (position.avg_open_price * position.volume + trade_amt) / (double)(position.volume + trade.volume);
      position.position_cost_price = 
          (position.position_cost_price * position.volume + trade_amt - commission - tax) /
                                     (double)(position.volume + trade.volume);
    }
    position.volume += trade.volume;
    // As Offset::Open Trade does not generate pnl, no need to calc pnl.
    //--update_position(book, position);

    auto &asset = book->asset;
    auto &asset_margin = book->asset_margin;

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    auto frozen = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.short_margin_ratio;
    //FIXME: commission&tax + order_market_value_frozen should be considered in the frozen_margin part. 
    book->asset.frozen_margin -= frozen;
    book->asset_margin.avail_margin += frozen;

    double short_margin_change = trade_amt * cd_mr.short_margin_ratio;
    double frozen_margin = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.short_margin_ratio;

    position.margin += short_margin_change;
        
    asset.margin += short_margin_change;
    asset.frozen_margin -= frozen_margin;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;

    double short_cash = trade_amt - commission - tax;
    asset_margin.total_asset += short_cash;
    asset_margin.short_cash += short_cash;
    asset_margin.short_margin += short_margin_change;
    asset_margin.avail_margin += frozen_margin;
    asset_margin.avail_margin -= short_margin_change + commission + tax;
    asset_margin.short_market_value += trade_amt;
    double interest = 0;
    asset_margin.collateral_ratio =
        asset_margin.total_asset / (asset_margin.cash_debt + asset_margin.short_market_value + interest);
  }

  virtual void apply_margintrade(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    double trade_amt = trade.price * trade.volume;
    // TODO: margin_commission requires a dedicate calculate_margin_commission(Trade&);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    if (position.volume + trade.volume > 0 && trade.price > 0) {
      position.avg_open_price =
          (position.avg_open_price * position.volume + trade_amt) / (double)(position.volume + trade.volume);
      position.position_cost_price = (position.position_cost_price * position.volume + trade_amt + commission + tax) /
                                     (double)(position.volume + trade.volume);
    }
    position.volume += trade.volume;
    // As Offset::Open Trade does not generate pnl
    //--update_position(book, position);

    auto &asset = book->asset;
    auto &asset_margin = book->asset_margin;
    
    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    double cash_margin_change = trade_amt * cd_mr.long_margin_ratio;
    double frozen_margin = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.long_margin_ratio;

    position.margin += cash_margin_change;

    asset.margin += cash_margin_change;
    asset.market_value += trade_amt;
    asset.frozen_margin -= frozen_margin;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;

    asset_margin.cash_debt += trade_amt + commission + tax;
    asset_margin.cash_margin += cash_margin_change;
    asset_margin.avail_margin += frozen_margin;
    asset_margin.avail_margin -= cash_margin_change + commission + tax;
    asset_margin.margin_market_value += trade_amt;
    //TODO: interest information is not available, ignore it.
    double interest = 0;
    asset_margin.collateral_ratio = asset_margin.total_asset / 
         (asset_margin.cash_debt + asset_margin.short_market_value + interest);
  }

  virtual void apply_repaymargin(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    // Use position_cost_price would be better than avg_open_price for realized_pnl 
    auto realized_pnl = (trade.price - position.avg_open_price) * trade.volume;
    position.realized_pnl += realized_pnl;
    position.unrealized_pnl -= realized_pnl;
    
    auto &asset = book->asset;
    asset.realized_pnl += realized_pnl;
    asset.unrealized_pnl -= realized_pnl;
    
    double trade_amt = trade.price * trade.volume;
    double income = trade_amt - (commission + tax);

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    auto &asset_margin = book->asset_margin;
    //TODO: need check repaymargin for a specified (same instrument contract) MarginDebt or not
    if (income >asset_margin.cash_debt) {
      book->asset.avail += income - asset_margin.cash_debt;
      asset_margin.avail_margin += asset_margin.cash_margin;
      
      // if total_asset contains the position market value, then repaymargin reduces the market value.
      asset_margin.total_asset -= asset_margin.cash_debt;
      //TODO: need check whether other cash_debt can be closed via this RepayMargin trade.
      asset_margin.cash_margin = 0;
      asset_margin.cash_debt = 0;
      asset_margin.margin_market_value -= trade_amt;
    } else {
      
      double released_margin = income * cd_mr.long_margin_ratio;
      position.margin = std::max(position.margin - released_margin, (double)VOLUME_ZERO);
      asset_margin.cash_debt -= income;
      asset_margin.cash_margin -= released_margin;
      asset_margin.avail_margin += released_margin - (commission + tax);
      asset_margin.total_asset -= trade_amt + commission + tax;
      asset_margin.margin_market_value -= trade_amt;
    }
    double interest = 0;
    if (asset_margin.short_market_value + interest > 0) {
      asset_margin.collateral_ratio =
          std::min(asset_margin.total_asset / (asset_margin.short_market_value + interest), 1000.0);
    } else {
      asset_margin.collateral_ratio = 1000; // Maximum
    }
    asset.market_value -= trade_amt;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;
  }

  virtual void apply_repaystock(Book_ptr &book, const Trade &trade) {

    auto &position = book->get_position_for(trade);
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    //Position Direction: Short
    position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    
    auto realized_pnl = (position.avg_open_price - trade.price) * trade.volume;
    double trade_amt = trade.price * trade.volume;
    double frozen_cash = book->get_frozen_price(trade.order_id) * trade.volume;
    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    double released_margin = trade_amt * cd_mr.short_margin_ratio; //-(commission + tax);
    
    position.realized_pnl += realized_pnl;
    position.unrealized_pnl -= realized_pnl;
    position.margin -= released_margin;

    auto &asset = book->asset;
    asset.realized_pnl += realized_pnl;
    asset.unrealized_pnl -= realized_pnl;   
    asset.frozen_cash -= frozen_cash;
    asset.avail -= commission + tax;
    //TODO: need confirm whether the cash from asset cash, ShortSell-cash(partially).
    asset.avail += frozen_cash;
    asset.avail -= trade_amt;
    asset.margin -= released_margin;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;

    auto &asset_margin = book->asset_margin;
    asset_margin.avail_margin += released_margin;
    asset_margin.short_market_value -= trade_amt;
    asset_margin.short_cash -= trade_amt;
    asset_margin.short_margin -= released_margin;
    asset_margin.total_asset -= trade_amt;
  }

  virtual void apply_sell(Book_ptr &book, const Trade &trade) {
    auto &position = book->get_position_for(trade);
    
    auto commission = calculate_commission(trade);
    auto tax = calculate_tax(trade);
    position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
    position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
    position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
    position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
    double realized_pnl = (trade.price - position.avg_open_price) * trade.volume;
    position.realized_pnl += realized_pnl;
    position.unrealized_pnl -= realized_pnl;

    update_position(book, position);
    auto &asset = book->asset;
    double trade_amt = trade.price * trade.volume;
    asset.realized_pnl += realized_pnl;
    asset.unrealized_pnl -= realized_pnl;
    asset.avail += trade_amt;
    asset.avail -= commission;
    asset.avail -= tax;
    asset.market_value -= trade_amt;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
    double avail_margin_changes = trade_amt * (1 - cd_mr.discount_ratio) - tax - commission;
    auto &asset_margin = book->asset_margin;
    asset_margin.avail_margin += avail_margin_changes;

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
      //SPDLOG_WARN("instrument information missing for {}@{}", instrument_id, exchange_id);
      cd_mr.contract_multiplier = DEFAULT_STOCK_CONTRACT_MULTIPLIER;
      cd_mr.margin_ratio = position.direction == Direction::Long ? DEFAULT_STOCK_LONG_MARGIN_RATIO
                                                                 : DEFAULT_STOCK_SHORT_MARGIN_RATIO;
      cd_mr.long_margin_ratio = DEFAULT_STOCK_LONG_MARGIN_RATIO;
      cd_mr.short_margin_ratio = DEFAULT_STOCK_SHORT_MARGIN_RATIO;
      return cd_mr;
    }

    auto &instrument = book->instruments.at(hashed_instrument_key);
    cd_mr.contract_multiplier = instrument.contract_multiplier;
    cd_mr.margin_ratio = margin_ratio(instrument, position);
    cd_mr.long_margin_ratio = instrument.long_margin_ratio;
    cd_mr.short_margin_ratio = instrument.short_margin_ratio;
    return cd_mr;
  }

  static double margin_ratio(const Instrument &instrument, const Position &position) {
    return position.direction == Direction::Long ? instrument.long_margin_ratio : instrument.short_margin_ratio;
  }
};
} // namespace kungfu::wingchun::book
#endif // WINGCHUN_ACCOUNTING_STOCK_H
