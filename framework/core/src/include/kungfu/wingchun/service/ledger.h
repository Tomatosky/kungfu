// SPDX-License-Identifier: Apache-2.0

//
// Created by Keren Dong on 2019-06-28.
//

#ifndef WINGCHUN_LEDGER_H
#define WINGCHUN_LEDGER_H

#include <kungfu/wingchun/book/book.h>
#include <kungfu/wingchun/book/bookkeeper.h>
#include <kungfu/wingchun/broker/client.h>
#include <kungfu/yijinjing/io.h>
#include <kungfu/yijinjing/log.h>
#include <kungfu/yijinjing/practice/apprentice.h>

namespace kungfu::wingchun::service {

class Ledger : public yijinjing::practice::apprentice {
  typedef std::unordered_map<uint32_t, longfist::types::BrokerStateUpdate> BrokerStateMap;
  typedef std::unordered_map<uint32_t, longfist::types::OperatorStateUpdate> OperatorStateMap;

public:
  explicit Ledger(yijinjing::data::locator_ptr locator, const std::string &group, const std::string &name,
                  longfist::enums::mode m, bool low_latency, const std::string &arguments = "{}");

  ~Ledger() override = default;

  void on_exit() override;

  book::Bookkeeper &get_bookkeeper();

protected:
  void on_start() override;

private:
  broker::AutoClient broker_client_;
  book::Bookkeeper bookkeeper_;
  std::unordered_map<uint32_t, book::Book> tmp_books_ = {};
  std::unordered_map<uint64_t, state<longfist::types::OrderStat>> order_stats_ = {};
  BrokerStateMap broker_states_ = {};
  OperatorStateMap operator_states_ = {};
  bool sync_asset_ = false;
  bool sync_position_ = false;

  static bool bypass_refresh_book();

  void on_deregister(const longfist::types::Deregister &deregister);

  void refresh_books();

  void refresh_account_book(int64_t trigger_time, uint32_t account_uid);

  longfist::types::OrderStat &ensure_order_stat(uint64_t order_id, const event_ptr &event);

  void update_order_stat(const event_ptr &event, const longfist::types::OrderInput &data);

  void update_order_stat(const event_ptr &event, const longfist::types::Order &data);

  void update_order_stat(const event_ptr &event, const longfist::types::Trade &data);

  void update_account_book(int64_t trigger_time, uint32_t account_uid);

  void inspect_channel(int64_t trigger_time, const longfist::types::Channel &channel);

  void keep_positions([[maybe_unused]] int64_t trigger_time, uint32_t strategy_uid);

  void rebuild_positions(int64_t trigger_time, uint32_t strategy_uid);

  int get_decimal_places(double num);

  double translate_by_price_tick(const char *exchange_id, const char *instrument_id, double price);

  template <typename AppStateMap, typename AppStateUpdate>
  void update_app_state_map(uint32_t location_uid, const AppStateUpdate &state_update, AppStateMap &app_states) {
    app_states.insert_or_assign(location_uid, state_update);
    write_app_state_to_public(app_states);
  };

  template <typename AppStateMap>
  void write_app_state(int64_t trigger_time, uint32_t source_id, const AppStateMap &app_states) {
    for (const auto &pair : app_states) {
      auto &app_state = pair.second;
      try_write_to(trigger_time, pair.second, source_id);
      SPDLOG_INFO("response to StateRequest, write to location {}, app {} state {}", get_location_uname(source_id),
                  get_location_uname(app_state.location_uid), static_cast<int>(app_state.state));
    }
  };

  template <typename AppStateMap> void write_app_state_to_public(const AppStateMap &app_states) {
    for (const auto &pair : app_states) {
      auto &app_state = pair.second;
      try_write_to(now(), app_state, yijinjing::data::location::PUBLIC);
      SPDLOG_INFO("write to public location app {} state {}", get_location_uname(app_state.location_uid),
                  static_cast<int>(app_state.state));
    }
  };

  void write_book_reset(int64_t trigger_time, uint32_t book_uid);

  void write_strategy_data(int64_t trigger_time, uint32_t strategy_uid);

  void write_positions(int64_t trigger_time, uint32_t dest, map::PositionMap &positions);

  void request_asset_sync(int64_t trigger_time);

  void request_position_sync(int64_t trigger_time);

  template <typename TradingData>
  void write_book(int64_t trigger_time, uint32_t account_uid, uint32_t strategy_uid, const TradingData &data) {
    write_book(trigger_time, account_uid, data);
    write_book(trigger_time, strategy_uid, data);
  }

  template <typename TradingData> void write_book(int64_t trigger_time, uint32_t book_uid, const TradingData &data) {
    if (not bookkeeper_.has_book(book_uid) or not has_writer(book_uid)) {
      return;
    }
    auto book = bookkeeper_.get_book(book_uid);
    auto apply = [&](auto &position) { try_write_to(trigger_time, position, book_uid); };
    book->apply_position_for(data, apply);
    write_to(trigger_time, book->asset, book_uid);
  }
};
} // namespace kungfu::wingchun::service

#endif // WINGCHUN_LEDGER_H
