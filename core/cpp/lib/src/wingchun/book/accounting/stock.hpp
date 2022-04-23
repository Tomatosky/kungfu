//
// Created by Keren Dong on 2020/4/6.
// Updated for Margin Account on 2022/2/18
//

#ifndef WINGCHUN_ACCOUNTING_STOCK_H
#define WINGCHUN_ACCOUNTING_STOCK_H

#include <mutex>
#include <kungfu/wingchun/book/accounting.h>
#include <kungfu/wingchun/book/bookkeeper.h>

using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::wingchun;
using namespace kungfu::yijinjing;
using namespace kungfu::yijinjing::data;

namespace kungfu::wingchun::book {

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

  static constexpr int DEFAULT_STOCK_CONTRACT_MULTIPLIER = 100;
  static constexpr float DEFAULT_STOCK_LONG_MARGIN_RATIO = 1.0;
  static constexpr float DEFAULT_STOCK_SHORT_MARGIN_RATIO = 0.6;
  static constexpr float DEFAULT_STOCK_DISCOUNT_RATIO = 0.7;

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
        
        if (position.direction == Direction::Short) {
          position.margin = position.pre_close_price * position.volume * margin_ratio;
        }
        

        position.yesterday_volume = position.volume;
        position.close_price = 0;
        position.update_time = trading_day;
        position.frozen_total = 0;
        position.frozen_yesterday = 0;
        position.trading_day = time::strftime(trading_day, KUNGFU_TRADING_DAY_FORMAT).c_str();

        update_position(book, position);
      }
    };

    apply(book->long_positions);
    apply(book->short_positions);
  }

  virtual void apply_quote(Book_ptr &book, const Quote &quote) override {
    static int counter = 0;
    auto apply = [&](Position &position) {
      if (is_valid_price(quote.last_price) and position.volume) {
        // std::lock_guard<std::mutex> my_lock_guard(accounting_mutex_);
        double price_change = quote.last_price - position.last_price;
        double short_margin_change = 0;
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
            asset.unrealized_pnl += market_value_change;
          } else {
            if (quote.last_price < position.avg_open_price) {
              short_margin_change = cd_mr.short_margin_ratio * market_value_change;
            } else {
              short_margin_change = market_value_change; // short_margin_ratio as 100% when last_price > avg_open_price;
            }
            avail_margin_change = -cd_mr.discount_ratio * market_value_change - short_margin_change;
            position.margin += short_margin_change;
            asset_margin.short_margin += short_margin_change;
            asset_margin.short_market_value += market_value_change;
            //Asset_margin.margin is combined with long_margin and short_margin.
            asset_margin.margin += short_margin_change;
            asset.unrealized_pnl -= market_value_change;
          }
          asset_margin.avail_margin += avail_margin_change;

          position.last_price = quote.last_price;
          // update position.unrealized_pnl
          update_position(book, position);
          if (counter > 20) {
            counter = 0;
            calculate_marketvalue(book);
		  }
        }
        
      }

    };
    apply(book->get_position_for(Direction::Long, quote));
    apply(book->get_position_for(Direction::Short, quote));
    ++counter;
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
  // Guard for multi-threaded 
  std::mutex accounting_mutex_;
  double short_market_value_;
  double long_market_value_;

  virtual void calculate_marketvalue(Book_ptr &book) {
    double short_market_value = 0;
    double long_market_value = 0;

    auto apply = [&](PositionMap &positions, double &market_value) {
      for (auto &pair : positions) {
        auto &position = pair.second;
        auto margin_pre = position.margin;
        if (is_valid_price(position.last_price)) {
          market_value += position.volume * position.last_price;
          SPDLOG_INFO("position.last_price {}  position.volume {} position.instrument_id {} ", 
                       position.last_price, position.volume, position.instrument_id);
        } else {
          if (is_valid_price(position.pre_close_price)) {
            market_value += position.volume * position.pre_close_price;
          } else if (is_valid_price(position.avg_open_price)) {
            market_value += position.volume * position.avg_open_price;
          } 
          
          SPDLOG_INFO( "position.pre_close_price {} position.avg_open_price {}  position.volume {} instrument_id {}", 
                        position.pre_close_price, position.avg_open_price, position.volume, position.instrument_id);
        }

        position.update_time = yijinjing::time::now_in_nano();
        

        update_position(book, position);
      }
    };
    
    apply(book->long_positions, long_market_value);
    long_market_value_ = long_market_value;
    apply(book->short_positions, short_market_value);
    short_market_value_ = short_market_value;
  }

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

    double frozen_cash = book->get_frozen_price(trade.order_id) * trade.volume;
    double frozen_fee = 0;
    frozen_cash += frozen_fee;
    auto &asset = book->asset;
    asset.frozen_cash = std::max(asset.frozen_cash - frozen_cash, 0.0);
    asset.avail -= commission;
    asset.avail -= tax;
    asset.avail += frozen_cash;
    asset.avail -= trade_amt;
    //Need update the original Position's market value (before trade_amt) because the last_price changed.
    double position_market_value_change = position.volume * (trade.price - position.last_price);
    asset.market_value += position_market_value_change;
    auto &asset_margin = book->asset_margin;
    //Trade is just Cash-to-Stock convertion (from cash to stock market value with commission&tax)
    asset_margin.total_asset += position_market_value_change - (commission + tax);
    
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
    // update_position(book, position);

    auto &asset = book->asset;
    auto &asset_margin = book->asset_margin;

    auto cd_mr = get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);

    double short_margin_change_ori = trade_amt * cd_mr.short_margin_ratio;
    double frozen_margin = book->get_frozen_price(trade.order_id) * trade.volume * cd_mr.short_margin_ratio;

    // There is tricky logic here as trade price maybe different with position last_price
    // position.margin += short_margin_change;  

    double prev_position_margin = position.margin;
    double prev_actual_position_margin = (position.volume - trade.volume)* position.last_price * cd_mr.short_margin_ratio;
    // Update position last_price with trade.price --- mark the price at the trading time for delta change calculation
    // as don't know the exact last_price at present
    position.last_price = trade.price;
    double curr_actual_position_margin = position.volume * position.last_price * cd_mr.short_margin_ratio;
    double short_margin_change = curr_actual_position_margin - prev_actual_position_margin;
    SPDLOG_INFO("short_margin_change {} short_margin_change_ori {} ", short_margin_change, short_margin_change_ori);
    position.margin += short_margin_change;  

    // asset_margin.margin should contain the frozen margin part, yet now it does not! see #avail_margin
    asset_margin.margin += short_margin_change;
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
    asset_margin.collateral_ratio =
        asset_margin.total_asset / (asset_margin.cash_debt + asset_margin.short_market_value + asset_margin.margin_interest);
    SPDLOG_INFO("curr_actual_position_margin {} prev_actual_position_margin {} frozen_margin {} short_margin_ratio {}", 
        curr_actual_position_margin, prev_actual_position_margin, frozen_margin, cd_mr.short_margin_ratio);
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
    double prev_position_last_price = position.last_price;

    double prev_position_margin = position.margin;
    double prev_position_market_value = (position.volume - trade.volume) * position.last_price;
    // double prev_actual_position_margin = prev_position_market_value * cd_mr.long_margin_ratio;
    // Update position last_price with trade.price --- mark the price at the trading time for delta change calculation
    // as don't know the exact last_price at present
    position.last_price = trade.price;
    double curr_position_market_value = position.volume * position.last_price;
    //FIXME: margin position is just part of the Position
    //double curr_actual_position_margin = curr_position_market_value * cd_mr.long_margin_ratio;
    //double cash_margin_change = curr_actual_position_margin - prev_actual_position_margin;
    double position_market_value_change = curr_position_market_value - prev_position_market_value;
    SPDLOG_INFO("cash_margin_change {} frozen_margin {} position_market_value_change {} trade_amt {}", 
        cash_margin_change, frozen_margin, position_market_value_change, trade_amt);

    position.margin += cash_margin_change;  
    // position.cash_debt += trade_amt + commission + tax;

    asset_margin.margin += cash_margin_change;
    asset.market_value += position_market_value_change;
    asset.frozen_margin -= frozen_margin;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;
    //TODO: If the commission&tax is taken as debt:
    asset_margin.cash_debt += trade_amt + commission + tax;
    asset_margin.cash_margin -= frozen_margin;
    asset_margin.cash_margin += cash_margin_change;
    asset_margin.avail_margin += frozen_margin;
    asset_margin.avail_margin -= cash_margin_change + commission + tax;
    //TODO: need confirm whether the commission & tax is taken from cash or marked as debt.
    // If marked as debt, then asset changes position_market_value_change.
    asset_margin.total_asset += position_market_value_change;

    double prev_position_margin_change = 0;
    //Position should consider a margin_volume to identify the long margin part.
    asset_margin.margin_market_value *= position.last_price / prev_position_last_price;
    asset_margin.margin_market_value += trade_amt; // position_market_value_change;
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
    // Need revise the unrealized_pnl since the price may change.
    double prev_unrealized_pnl = position.unrealized_pnl;
    position.unrealized_pnl *= trade.price / position.last_price;
    position.unrealized_pnl -= realized_pnl;
    
    double prev_position_market_value = (position.volume + trade.volume) * position.last_price;
    // double prev_actual_position_margin = prev_position_market_value * cd_mr.long_margin_ratio;
    // Update position last_price with trade.price --- mark the price at the trading time for delta change calculation
    // as don't know the exact last_price at present
    position.last_price = trade.price;
    double curr_position_market_value = position.volume * position.last_price;
    double position_market_value_change = curr_position_market_value - prev_position_market_value;

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
      double stock_to_cash_increased_margin = (income - asset_margin.cash_debt) * (1 - cd_mr.discount_ratio);
      asset_margin.avail_margin += asset_margin.cash_margin + stock_to_cash_increased_margin;

      SPDLOG_INFO("stock_to_cash_increased_margin {} asset_margin.cash_margin {}  asset_margin.avail_margin {}",
                  stock_to_cash_increased_margin, asset_margin.cash_margin, asset_margin.avail_margin);
      
      // if total_asset contains the position market value, then repaymargin reduces the market value.
      asset_margin.total_asset -= asset_margin.cash_debt;
      //TODO: need check whether other cash_debt can be closed via this RepayMargin trade.
      asset_margin.cash_margin = 0;
      asset_margin.cash_debt = 0;
      // asset_margin.margin_market_value -= trade_amt; --> replaced by:
      asset_margin.margin_market_value += position_market_value_change;
      position.margin = 0;
    } else {
      
      double released_margin = income * cd_mr.long_margin_ratio;
      // This is not true when the repaid margin debt instrument is not the one of this Position.
      position.margin = std::max(position.margin - released_margin, (double)VOLUME_ZERO);
      asset_margin.cash_debt -= income;
      asset_margin.cash_margin -= released_margin;
      asset_margin.avail_margin += released_margin - (commission + tax);
      asset_margin.total_asset += position_market_value_change - (commission + tax); //trade_amt
      //asset_margin.margin_market_value -= trade_amt; --> replaced by:

      // Below logic is not true:
      asset_margin.margin_market_value += position_market_value_change;

      SPDLOG_INFO("asset_margin.cash_margin {}  asset_margin.avail_margin {} position_market_value_change {}", 
                  asset_margin.cash_margin, asset_margin.avail_margin, position_market_value_change);
    }
    double interest = 0;
    if (asset_margin.short_market_value + interest > 0) {
      asset_margin.collateral_ratio =
          std::min(asset_margin.total_asset / (asset_margin.short_market_value + interest), 1000.0);
    } else {
      asset_margin.collateral_ratio = 1000; // Maximum
    }
    asset.market_value += position_market_value_change;
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
    asset.frozen_cash = std::max(asset.frozen_cash - frozen_cash, 0.0);
    asset.avail -= commission + tax;
    //TODO: need confirm whether the cash from asset cash, ShortSell-cash(partially).
    asset.avail += frozen_cash;
    asset.avail -= trade_amt;
    
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;

    auto &asset_margin = book->asset_margin;
    asset_margin.margin -= released_margin;

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
    
    double repay_margin = std::min(position.margin, (trade_amt - (commission + tax)));
    double cash_delivery = trade_amt - repay_margin - (commission + tax);

    asset.realized_pnl += realized_pnl;
    asset.unrealized_pnl -= realized_pnl;
    asset.avail += cash_delivery;
    asset.market_value -= trade_amt;
    asset.intraday_fee += commission + tax;
    asset.accumulated_fee += commission + tax;
    auto &asset_margin = book->asset_margin;
    if (asset_margin.total_asset) {
      auto cd_mr =
          get_instrument_discount_and_margin_ratio(book, position.exchange_id, position.instrument_id, position);
      double avail_margin_changes = (cash_delivery - trade_amt * cd_mr.discount_ratio) * cd_mr.long_margin_ratio;
      SPDLOG_INFO("cash_delivery {} trade_amt {} avail_margin_changes {} repay_margin {} cash_delivery {}",
                  cash_delivery, trade_amt, avail_margin_changes, repay_margin, cash_delivery);

      asset_margin.avail_margin += avail_margin_changes;
      asset_margin.margin -= repay_margin * cd_mr.long_margin_ratio;
      asset_margin.cash_margin -= repay_margin * cd_mr.long_margin_ratio;
      asset_margin.cash_debt -= repay_margin;

      asset_margin.total_asset += cash_delivery - trade_amt;

      // Not correct but better than no action. it depends on the RepayMargin targets (repay debts of instruments)
      // price.
      // Sigma instrument_x.margin_trade_price * repaid_volume  = repay_margin;
      // yet the actual margin_market_value change is: < Conclusion from HTS ITPMargin logic>
      // Sigma instrument_x.last_price/instrument_x.margin_trade_price * repaid_volume;

      asset_margin.margin_market_value -= repay_margin;
      asset_margin.collateral_ratio =
          asset_margin.total_asset /
          (asset_margin.cash_debt + asset_margin.short_market_value + asset_margin.margin_interest);
      SPDLOG_INFO("total_asset {} cash_debt {} short_market_value {} margin_interest {}  collateral_ratio {} ",
                  asset_margin.total_asset, asset_margin.cash_debt, asset_margin.short_market_value,
                  asset_margin.margin_interest, asset_margin.collateral_ratio);
    }
    
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
      cd_mr.discount_ratio = DEFAULT_STOCK_DISCOUNT_RATIO;
      return cd_mr;
    }

    auto &instrument = book->instruments.at(hashed_instrument_key);
    cd_mr.contract_multiplier = instrument.contract_multiplier;
    cd_mr.margin_ratio = margin_ratio(instrument, position);
    cd_mr.long_margin_ratio = instrument.long_margin_ratio;
    cd_mr.short_margin_ratio = instrument.short_margin_ratio;
    cd_mr.discount_ratio = instrument.discount_ratio;
    return cd_mr;
  }

  static double margin_ratio(const Instrument &instrument, const Position &position) {
    return position.direction == Direction::Long ? instrument.long_margin_ratio : instrument.short_margin_ratio;
  }
};
} // namespace kungfu::wingchun::book
#endif // WINGCHUN_ACCOUNTING_STOCK_H
