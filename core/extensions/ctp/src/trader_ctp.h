//
// Created by qlu on 2019/1/14.
//

#ifndef KUNGFU_CTP_EXT_TRADER_H
#define KUNGFU_CTP_EXT_TRADER_H

#include <kungfu/longfist/longfist.h>
#include <kungfu/wingchun/broker/trader.h>
#include <kungfu/yijinjing/common.h>

#include "common.h"

#include "ThostFtdcTraderApi.h"

namespace kungfu::wingchun::ctp {
typedef std::unordered_map<std::string, longfist::types::Position> PositionMap;
typedef std::unordered_map<std::string, longfist::types::Instrument> InstrumentMap;

#define TIME_FORMAT "%Y-%m-%d %H:%M:%S"

class TraderCTP : public CThostFtdcTraderSpi, public broker::Trader {
public:
  TraderCTP(bool low_latency, yijinjing::data::locator_ptr locator, const std::string &account_id,
            const std::string &json_config);

  ~TraderCTP() override;

  longfist::enums::AccountType get_account_type() const override { return longfist::enums::AccountType::Future; }

  void on_trading_day(const event_ptr &event, int64_t daytime) override;

  bool req_position() override;

  bool req_account() override;

  bool insert_order(const event_ptr &event) override;

  bool cancel_order(const event_ptr &event) override;

  bool req_history_order(const event_ptr &event) override;

  bool req_history_trade(const event_ptr &event) override;

  virtual void OnFrontConnected();

  virtual void OnFrontDisconnected(int nReason);

  virtual void OnRspAuthenticate(CThostFtdcRspAuthenticateField *pRspAuthenticateField,
                                 CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast);

  virtual void OnRspUserLogin(CThostFtdcRspUserLoginField *pRspUserLogin, CThostFtdcRspInfoField *pRspInfo,
                              int nRequestID, bool bIsLast);

  virtual void OnRspUserLogout(CThostFtdcUserLogoutField *pUserLogout, CThostFtdcRspInfoField *pRspInfo, int nRequestID,
                               bool bIsLast);

  virtual void OnRspOrderInsert(CThostFtdcInputOrderField *pInputOrder, CThostFtdcRspInfoField *pRspInfo,
                                int nRequestID, bool bIsLast);

  virtual void OnRspOrderAction(CThostFtdcInputOrderActionField *pInputOrderAction, CThostFtdcRspInfoField *pRspInfo,
                                int nRequestID, bool bIsLast);

  virtual void OnRtnOrder(CThostFtdcOrderField *pOrder);

  virtual void OnRtnTrade(CThostFtdcTradeField *pTrade);

  virtual void OnRspQryInvestorPosition(CThostFtdcInvestorPositionField *pInvestorPosition,
                                        CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast);

  virtual void OnRspQryTradingAccount(CThostFtdcTradingAccountField *pTradingAccount, CThostFtdcRspInfoField *pRspInfo,
                                      int nRequestID, bool bIsLast);

  virtual void OnRspQryInstrument(CThostFtdcInstrumentField *pInstrument, CThostFtdcRspInfoField *pRspInfo,
                                  int nRequestID, bool bIsLast);

  virtual void OnRspQryInstrumentMarginRate(CThostFtdcInstrumentMarginRateField *pInstrumentMarginRate,
                                            CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast);

  virtual void OnRspSettlementInfoConfirm(CThostFtdcSettlementInfoConfirmField *pSettlementInfoConfirm,
                                          CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast);
  virtual void OnRspQryInstrumentCommissionRate(CThostFtdcInstrumentCommissionRateField *pInstrumentCommissionRate,
                                                CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast);

  ///请求查询报单响应
  void OnRspQryOrder(CThostFtdcOrderField *pOrder, CThostFtdcRspInfoField *pRspInfo, int nRequestID,
                     bool bIsLast) override;
  ///请求查询成交响应
  void OnRspQryTrade(CThostFtdcTradeField *pTrade, CThostFtdcRspInfoField *pRspInfo, int nRequestID,
                     bool bIsLast) override;

protected:
  void on_start() override;

private:
  TDConfiguration config_;

  int front_id_;
  int session_id_;
  int request_id_;
  int order_ref_;

  char system_info_[344];
  int system_info_len_;
  CThostFtdcTraderApi *api_;

  std::unordered_map<uint64_t, uint64_t> inbound_order_refs_;
  std::unordered_map<uint64_t, uint64_t> inbound_order_sysids_;
  std::unordered_map<uint64_t, uint64_t> inbound_actions_;
  std::unordered_map<uint64_t, std::string> outbound_orders_;
  std::unordered_map<uint64_t, std::shared_ptr<CThostFtdcTradeField>> map_trades_;
  std::unordered_map<uint64_t, uint64_t> map_request_location_;
  std::unordered_set<std::string> set_rongh_trade_ids_{}; // 存储已处理过得trade_id, 防止重复处理

  PositionMap long_position_map_;
  PositionMap short_position_map_;

  InstrumentMap instrument_map_;
  InstrumentMap::iterator instrument_map_iter_;
  int req_marginRatio_count_;

  std::unordered_map<int, longfist::types::OrderAction> action_event_map_;

  std::string trading_day_;

  int instrument_count_ = 0;

  void doRtnTrade(uint64_t orderSysId_key);
  void doRtnTrade(uint64_t orderSysId_key, CThostFtdcTradeField *pTrade);

  bool login();

  bool req_settlement_confirm();

  bool req_auth();

  bool req_qry_instrument();

  void after_instrument();

  bool req_position_detail();

  int req_qry_instrumentMarginRate(InstrumentMap::iterator &iter);

  bool check_if_stored_instruments(const std::string &trading_day);

  void restore_instruments_from_bank();

  void record_instruments_stored_trading_day();

  void req_commission();

  yijinjing::journal::writer_ptr get_history_writer(uint64_t request_id);
};
} // namespace kungfu::wingchun::ctp
#endif // KUNGFU_CTP_EXT_TRADER_H
