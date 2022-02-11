//
// Created by qianyong liu on 2021/7/27.
//

#ifndef WINGCHUN_ACCOUNTING_CRYPTO_H
#define WINGCHUN_ACCOUNTING_CRYPTO_H

#include <kungfu/wingchun/book/accounting.h>
#include <kungfu/wingchun/book/bookkeeper.h>

using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::wingchun;
using namespace kungfu::yijinjing;
using namespace kungfu::yijinjing::data;

namespace kungfu::wingchun::book {
    class CryptoAccountingMethod : public AccountingMethod {
    public:
        static constexpr double min_comission = 5;
        static constexpr double commission_ratio = 0.0008;

        void get_instrument(const Book_ptr &book, const Trade &trade, char * instrument_a, char * instrument_b, char * instrument_commission, int64_t &volume_a, int64_t &volume_b, int64_t &volume_commission)
        {
            auto instrument_hash = hash_instrument(trade.exchange_id, trade.instrument_id);
            auto &instrument = book->instruments.at(instrument_hash);
            strncpy(instrument_a, instrument.instrument_id, strlen(instrument.instrument_id)-instrument.delivery_year);
            strcpy(instrument_b, &(instrument.instrument_id[strlen(instrument.instrument_id)-instrument.delivery_year]));
            if (trade.hedge_flag == HedgeFlag::Speculation)
                strcpy(instrument_commission, "BNB");
            else if (trade.hedge_flag == HedgeFlag::Arbitrage)
                strcpy(instrument_commission, instrument_b);
            else
                strcpy(instrument_commission, instrument_a);
            volume_a = trade.volume;
            volume_b = trade.volume*trade.price;
            volume_commission = trade.commission;
        }

        CryptoAccountingMethod() = default;

        virtual void apply_trading_day(Book_ptr &book, int64_t trading_day) override {
          for (auto &pair : book->long_positions) {
            auto &position = pair.second;
            position.pre_close_price = 0;
            position.yesterday_volume = position.volume;
            position.close_price = 0;
            position.update_time = trading_day;
            position.trading_day = time::strftime(trading_day, KUNGFU_TRADING_DAY_FORMAT).c_str();
          }
        }

        virtual void apply_quote(Book_ptr &book, const Quote &quote) override {
        }

        virtual void apply_order_input(Book_ptr &book, const OrderInput &input) override {
          if (!book->has_position(input.exchange_id, input.instrument_id)) {
            auto &position = book->get_position_for(input);
            if (input.side == Side::Sell) {
              position.frozen_total += input.volume;
              position.frozen_yesterday += input.volume;
            } else {
              position.frozen_total -= input.volume;
              position.frozen_yesterday -= input.volume;
            }
          }
        }

        virtual void apply_order(Book_ptr &book, const Order &order) override {
          if (!book->has_position(order.exchange_id, order.instrument_id)) {
            if (is_final_status(order.status)) {
              auto &position = book->get_position_for(order);
              if (order.side == Side::Buy) {
                position.frozen_total = std::max(position.frozen_total + order.volume_left, VOLUME_ZERO);
                position.frozen_yesterday = std::max(position.frozen_yesterday + order.volume_left, VOLUME_ZERO);
              } else if (order.side == Side::Sell) {
                position.frozen_total = std::max(position.frozen_total - order.volume_left, VOLUME_ZERO);
                position.frozen_yesterday = std::max(position.frozen_yesterday - order.volume_left, VOLUME_ZERO);
              }
              update_position(book, position);
            }
          }
        }

        virtual void apply_trade(Book_ptr &book, const Trade &trade) override {
          if (!book->has_position(trade.exchange_id, trade.instrument_id)) {
            if (trade.side == Side::Sell) {
              apply_sell(book, trade);
            }
            if (trade.side == Side::Buy) {
              apply_buy(book, trade);
            }
          }
        }

        virtual void update_position(Book_ptr &book, Position &position) override {
            //  auto position_in = book->get_long_position(position.instrument_id, position.exchange_id);
            //  position_in.volume = position.volume;
            //  position_in.frozen_total = position.frozen_total;
        }

    protected:
        std::unordered_map<uint64_t, double> commission_map_ = {};

        virtual void apply_buy(Book_ptr &book, const Trade &trade) {
          auto &position = book->get_position_for(trade);
          if (position.volume + trade.volume > 0 && trade.price > 0) {
            position.avg_open_price = 0;
          }
          auto commission = calculate_commission(trade);
          auto tax = calculate_tax(trade);
          position.volume += trade.volume;
        }

        virtual void apply_sell(Book_ptr &book, const Trade &trade) {
          auto &position = book->get_position_for(trade);
          auto realized_pnl = (trade.price - position.avg_open_price) * trade.volume;
          auto commission = calculate_commission(trade);
          auto tax = calculate_tax(trade);
          position.frozen_total = std::max(position.frozen_total - trade.volume, VOLUME_ZERO);
          position.frozen_yesterday = std::max(position.frozen_yesterday - trade.volume, VOLUME_ZERO);
          position.yesterday_volume = std::max(position.yesterday_volume - trade.volume, VOLUME_ZERO);
          position.volume = std::max(position.volume - trade.volume, VOLUME_ZERO);
          position.realized_pnl += realized_pnl;
        }

        virtual double calculate_commission(const Trade &trade) {
            return 0;
        }

        virtual double calculate_tax(const Trade &trade) {
            return 0;
        }
    };
} // namespace kungfu::wingchun::book
#endif // WINGCHUN_ACCOUNTING_CRYPTO_H