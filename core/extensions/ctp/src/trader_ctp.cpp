//
// Created by qlu on 2019/1/14.
//

#include "trader_ctp.h"
#include "serialize_ctp.h"
#include "type_convert_ctp.h"
#include <chrono>
#include <kungfu/wingchun/encoding.h>

using namespace kungfu::longfist;
using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::yijinjing;
using namespace kungfu::yijinjing::data;

namespace kungfu::wingchun::ctp {
TraderCTP::TraderCTP(bool low_latency, locator_ptr locator, const std::string &account_id,
                     const std::string &json_config)
    : Trader(low_latency, std::move(locator), SOURCE_CTP, account_id), front_id_(-1), session_id_(-1),
      request_id_(0), order_ref_(0), system_info_len_(0), api_(nullptr) {
    yijinjing::log::copy_log_settings(get_io_device()->get_home(), SOURCE_CTP);
    config_ = nlohmann::json::parse(json_config);
}

TraderCTP::~TraderCTP() {
  if (api_ != nullptr) {
    api_->Release();
  }
}

void TraderCTP::on_trading_day(const event_ptr &event, int64_t daytime) {
  trading_day_ = yijinjing::time::strftime(daytime, KUNGFU_TRADING_DAY_FORMAT);
  SPDLOG_INFO("TRADING DAY RES {}", trading_day_);
}

bool TraderCTP::insert_order(const event_ptr &event) {
  const OrderInput &input = event->data<OrderInput>();

  order_ref_++;

  CThostFtdcInputOrderField ctp_input = {};
  memset(&ctp_input, 0, sizeof(ctp_input));
  to_ctp(ctp_input, input);
  strcpy(ctp_input.BrokerID, config_.broker_id.c_str());
  strcpy(ctp_input.InvestorID, config_.account_id.c_str());
  strcpy(ctp_input.OrderRef, std::to_string(order_ref_).c_str());

  int error_id = api_->ReqOrderInsert(&ctp_input, ++request_id_);
  
  auto nano = time::now_in_nano();
  auto writer = get_writer(event->source());
  Order &order = writer->open_data<Order>(event->gen_time());
  order_from_input(input, order);
  strcpy(order.trading_day, trading_day_.c_str());
  order.insert_time = nano;
  order.update_time = nano;

  if (error_id == 0) {
    outbound_orders_[input.order_id] = ctp_input.OrderRef;
    inbound_order_refs_[get_orderRef_key(front_id_, session_id_, ctp_input.OrderRef)] = input.order_id;
  } else {
    order.error_id = error_id;
    order.status = OrderStatus::Error;
  }

  writer->close_data();
  orders_.emplace(order.uid(), state<Order>(event->dest(), event->source(), nano, order));
  return error_id == 0;
}

bool TraderCTP::cancel_order(const event_ptr &event) {
  const OrderAction &action = event->data<OrderAction>();
  if (outbound_orders_.find(action.order_id) == outbound_orders_.end()) {
    SPDLOG_ERROR("FAILED TO CANCEL order {}, can't find related ctp order id", action.order_id);
    return false;
  }

  if (outbound_orders_.find(action.order_id) == outbound_orders_.end()) {
    SPDLOG_ERROR("CANNOT FIND order_id in outbound_orders_ {}", action.order_id);
    return false;
  }

  auto ctp_order_ref = outbound_orders_.at(action.order_id);
  auto order_state = orders_.at(action.order_id);
  auto status = order_state.data.status;

  if (status != OrderStatus::Pending and status != OrderStatus::PartialFilledActive) {
    SPDLOG_WARN("failed to cancel order {}, status {}", action.order_id, status);
    return false;
  }

  CThostFtdcInputOrderActionField ctp_action = {};
  strcpy(ctp_action.BrokerID, config_.broker_id.c_str());
  strcpy(ctp_action.InvestorID, config_.account_id.c_str());
  strcpy(ctp_action.OrderRef, ctp_order_ref.c_str());
  ctp_action.FrontID = front_id_;
  ctp_action.SessionID = session_id_;
  ctp_action.ActionFlag = THOST_FTDC_AF_Delete;
  strcpy(ctp_action.InstrumentID, order_state.data.instrument_id);
  strcpy(ctp_action.ExchangeID, order_state.data.exchange_id);

  int error_id = api_->ReqOrderAction(&ctp_action, ++request_id_);
  if (error_id == 0) {
    inbound_actions_.emplace(request_id_, action.uid());
    actions_.emplace(action.uid(), state<OrderAction>(event->dest(), event->source(), event->gen_time(), action));
  } else {
    auto writer = get_writer(event->source());
    OrderActionError &error = writer->open_data<OrderActionError>(event->gen_time());
    error.error_id = error_id;
    error.order_id = action.order_id;
    error.order_action_id = action.order_action_id;
    writer->close_data();
  }
  return error_id == 0;
}

void TraderCTP::OnFrontConnected() {
    auto version = api_->GetApiVersion();
    SPDLOG_INFO("CONNECTED API version {}", version);
    req_auth();
}

void TraderCTP::OnFrontDisconnected(int nReason) {
  SPDLOG_ERROR("DISCONNECTED nReason[{}] {}", nReason, disconnected_reason(nReason));
  update_broker_state(BrokerState::DisConnected);
  SPDLOG_ERROR("BrokerState::DisConnected");
}

void TraderCTP::OnRspAuthenticate(CThostFtdcRspAuthenticateField *pRspAuthenticateField,
                                  CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("AUTH RES error_id {}, error_msg {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }
  
  if (pRspAuthenticateField == nullptr) {
    SPDLOG_INFO("AUTH RES pRspAuthenticateField is nullptr, bIsLast {}", bIsLast);
  } else {
    SPDLOG_INFO("AUTH RES *pRspAuthenticateField {}, bIsLast {}", to_string(*pRspAuthenticateField), bIsLast);
  }

  if (bIsLast) {
    login();
  }
}

void TraderCTP::OnRspUserLogin(CThostFtdcRspUserLoginField *pRspUserLogin, CThostFtdcRspInfoField *pRspInfo,
                               int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("LOGIN RES error_id {} error_msg {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }

  if (pRspUserLogin == nullptr) {
    SPDLOG_INFO("LOGIN RES pRspUserLogin is nullptr, bIsLast {}", bIsLast);
  } else {
    SPDLOG_INFO("LOGIN RES *pRspUserLogin {}, bIsLast {}", to_string(*pRspUserLogin), bIsLast);
    session_id_ = pRspUserLogin->SessionID;
    front_id_ = pRspUserLogin->FrontID;
    order_ref_ = std::stoi(pRspUserLogin->MaxOrderRef);
    trading_day_ = pRspUserLogin->TradingDay;
  }

  if (bIsLast) {
    req_settlement_confirm();
  }
}

void TraderCTP::OnRspUserLogout(CThostFtdcUserLogoutField *pUserLogout, CThostFtdcRspInfoField *pRspInfo,
                                int nRequestID, bool bIsLast) {}

void TraderCTP::OnRspSettlementInfoConfirm(CThostFtdcSettlementInfoConfirmField *pSettlementInfoConfirm,
                                           CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("SETTLEMENT RES error_id: {}, error_msg: {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }

  if (pSettlementInfoConfirm == nullptr) {
    SPDLOG_INFO("SETTLEMENT RES pSettlementInfoConfirm is nullptr, bIsLast {}", bIsLast);
  } else {
    SPDLOG_INFO("SETTLEMENT RES *pSettlementInfoConfirm {}, bIsLast {}", to_string(*pSettlementInfoConfirm), bIsLast);
  }

  if (bIsLast) {
    if (check_if_stored_instruments(trading_day_)) {
      SPDLOG_INFO("CHECK_IF_STORED_INSTRUMENTS TRUE");
      update_broker_state(BrokerState::Ready);
      SPDLOG_INFO("BrokerState::Ready");
      return;
    } 

	  SPDLOG_INFO("CHECK_IF_STORED_INSTRUMENTS FALSE");
    req_qry_instrument();
  }
}

void TraderCTP::OnRspOrderInsert(CThostFtdcInputOrderField *pInputOrder, CThostFtdcRspInfoField *pRspInfo,
                                 int nRequestID, bool bIsLast) {

  uint64_t orderRef_key = get_orderRef_key(front_id_, session_id_, pInputOrder->OrderRef);

  if (inbound_order_refs_.find(orderRef_key) == inbound_order_refs_.end()) {
      SPDLOG_ERROR("CANNOT FIND OrderRef in inbound_order_refs_ {}", orderRef_key);
      return;
  }

  auto order_id = inbound_order_refs_.at(orderRef_key);

  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    if (orders_.find(order_id) != orders_.end()) {
      auto &order_state = orders_.at(order_id);
      order_state.data.status = OrderStatus::Error;
      order_state.data.error_id = pRspInfo->ErrorID;
      order_state.data.update_time = time::now_in_nano();
      strncpy(order_state.data.error_msg, gbk2utf8(pRspInfo->ErrorMsg).c_str(), ERROR_MSG_LEN);
      write_to(0, order_state.data, order_state.dest);
    }
    SPDLOG_ERROR("failed to insert order, ErrorId: {} ErrorMsg: {}, InputOrder: {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg), pInputOrder == nullptr ? "" : to_string(*pInputOrder));
  }

  if (orders_.find(order_id) != orders_.end()) {
    auto &order_state = orders_.at(order_id);
    order_state.data.status = OrderStatus::Pending;
  }
}

void TraderCTP::OnRspOrderAction(CThostFtdcInputOrderActionField *pInputOrderAction, CThostFtdcRspInfoField *pRspInfo,
                                 int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    auto action_id = inbound_actions_.at(nRequestID);
    if (actions_.find(action_id) != actions_.end()) {
      auto &action_state = actions_.at(action_id);
      auto &action = action_state.data;
      uint32_t source = (action.order_action_id >> 32u) xor get_home_uid();
      if (has_writer(source)) {
        auto writer = get_writer(source);
        OrderActionError &error = writer->open_data<OrderActionError>(0);
        error.error_id = pRspInfo->ErrorID;
        strncpy(error.error_msg, gbk2utf8(pRspInfo->ErrorMsg).c_str(), ERROR_MSG_LEN);
        error.order_id = action.order_id;
        error.order_action_id = action.order_action_id;
        writer->close_data();
      }
    }
    SPDLOG_ERROR("ErrorId: {} ErrorMsg: {} InputOrderAction: {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg),
                 pInputOrderAction == nullptr ? "" : to_string(*pInputOrderAction));
  }
}

void TraderCTP::OnRtnOrder(CThostFtdcOrderField *pOrder) {
  SPDLOG_TRACE(to_string(*pOrder));

  uint64_t orderRef_key = get_orderRef_key(pOrder->FrontID, pOrder->SessionID, pOrder->OrderRef);

  if (inbound_order_refs_.find(orderRef_key) == inbound_order_refs_.end()) {
    SPDLOG_ERROR("CANNOT FIND orderRef_key {} in inbound_order_refs_", orderRef_key);
    return;
  }

  auto order_id = inbound_order_refs_.at(orderRef_key);

  if (orders_.find(order_id) == orders_.end()) {
    SPDLOG_ERROR("CANNOT FIND ORDER order_id {} with orderRef_key {}", order_id, orderRef_key);
    return;
  }

  //该笔报单请求首次到达CTP，风控通过后返回的第1个OnRtnOrder回报，此时因为还没有报入到交易所，所以回报中OrderSysID为空
  if (strlen(pOrder->OrderSysID) != 0) {
    inbound_order_sysids_[get_orderSysId_key(pOrder->ExchangeID, pOrder->OrderSysID)] = order_id;
  }

  auto &order_state = orders_.at(order_id);
  auto writer = get_writer(order_state.dest);
  Order &order = writer->open_data<Order>(0);
  memcpy(&order, &(order_state.data), sizeof(order));
  from_ctp(*pOrder, order);
  order_state.data.status = order.status;
  order.update_time = time::now_in_nano();
  writer->close_data();
}

void TraderCTP::OnRtnTrade(CThostFtdcTradeField *pTrade) {
  if(pTrade->Price < 1 || pTrade->Price == 2.2250738585072014e-308 || pTrade->Price == 1.7976931348623158e+308 || pTrade->Volume == -2147483648 || pTrade->Volume == 2147483647){
    SPDLOG_ERROR("Order Price too low, Not True pTrade->Price {}, *pTrade {}", pTrade->Price, to_string(*pTrade));
    return;
  }

  SPDLOG_TRACE(to_string(*pTrade));

  uint64_t orderSysId_key = get_orderSysId_key(pTrade->ExchangeID, pTrade->OrderSysID);
  if (inbound_order_sysids_.find(orderSysId_key) == inbound_order_sysids_.end()) {
    SPDLOG_ERROR("CANNOT FIND orderSysId_key {} in inbound_order_sysids_", orderSysId_key);
    return;
  }

  auto order_id = inbound_order_sysids_.at(orderSysId_key);
  if (orders_.find(order_id) == orders_.end()) {
    SPDLOG_ERROR("CANNOT FIND ORDER order_id {} with orderSysId_key {}", order_id, orderSysId_key);
    return;
  }

  auto &order_state = orders_.at(order_id);
  auto writer = get_writer(order_state.dest);
  Trade &trade = writer->open_data<Trade>(0);
  from_ctp(*pTrade, trade);
  uint64_t trade_id = writer->current_frame_uid();
  trade.trade_id = trade_id;
  trade.order_id = order_state.data.order_id;
  trade.parent_order_id = order_state.data.parent_id;
  trade.trading_day = order_state.data.trading_day;
  trades_.emplace(trade.uid(), state<Trade>(order_state.source, order_state.dest, time::now_in_nano(), trade));
  writer->close_data();
}

void TraderCTP::OnRspQryTradingAccount(CThostFtdcTradingAccountField *pTradingAccount, CThostFtdcRspInfoField *pRspInfo,
                                       int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("ASSET RES error_id {}, error_msg {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }

  if (pTradingAccount == nullptr) {
    SPDLOG_INFO("ASSET RES pTradingAccount is nullptr, bIsLast {}", bIsLast);
    return;
  }

  SPDLOG_INFO("ASSET RES *pTradingAccount {}, bIsLast {}", to_string(*pTradingAccount), bIsLast);
  auto writer = get_writer(location::PUBLIC);
  Asset account = {};
  strcpy(account.account_id, get_account_id().c_str());
  from_ctp(*pTradingAccount, account);
  account.update_time = time::now_in_nano();
  account.holder_uid = get_io_device()->get_home()->uid;
  writer->write(now(), account);
}

void TraderCTP::OnRspQryInvestorPosition(CThostFtdcInvestorPositionField *pInvestorPosition,
                                         CThostFtdcRspInfoField *pRspInfo, int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("POS RES error_id {}, error_msg {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  } 
  
  if (pInvestorPosition == nullptr) {
    SPDLOG_INFO("POS RES pInvestorPosition is nullptr, bIsLast {}", bIsLast);
  } else {
    SPDLOG_INFO("POS RES *pInvestorPosition {}, bIsLast {}", to_string(*pInvestorPosition), bIsLast);
    auto direction = pInvestorPosition->PosiDirection == THOST_FTDC_PD_Long ? Direction::Long : Direction::Short;
    auto &position_map = direction == Direction::Long ? long_position_map_ : short_position_map_;
    if (position_map.find(pInvestorPosition->InstrumentID) == position_map.end()) {
      Position position = {};
      strncpy(position.trading_day, pInvestorPosition->TradingDay, DATE_LEN);
      strncpy(position.instrument_id, pInvestorPosition->InstrumentID, INSTRUMENT_ID_LEN);
      strncpy(position.exchange_id, pInvestorPosition->ExchangeID, EXCHANGE_ID_LEN);
      strncpy(position.account_id, pInvestorPosition->InvestorID, ACCOUNT_ID_LEN);
      strcpy(position.source_id, SOURCE_CTP);
      position.holder_uid = get_io_device()->get_home()->uid;
      position.direction = direction;
      position.instrument_type = get_instrument_type(position.exchange_id, position.instrument_id);
      position_map.emplace(pInvestorPosition->InstrumentID, position);
    }
    auto &position = position_map.at(pInvestorPosition->InstrumentID);
    auto &inst_info = instrument_map_[pInvestorPosition->InstrumentID];
    if (strcmp(pInvestorPosition->ExchangeID, EXCHANGE_SHFE) == 0) {
      if (pInvestorPosition->YdPosition > 0 && pInvestorPosition->TodayPosition <= 0) {
        position.yesterday_volume = pInvestorPosition->Position;
      }
    } else {
      position.yesterday_volume = pInvestorPosition->Position - pInvestorPosition->TodayPosition;
    }
    position.volume += pInvestorPosition->Position;
    position.margin += pInvestorPosition->ExchangeMargin;
    if (position.volume > 0 and inst_info.contract_multiplier > 0) {
      double cost = inst_info.contract_multiplier * position.avg_open_price * double(position.volume - pInvestorPosition->Position);
      position.avg_open_price = (cost + pInvestorPosition->OpenCost) / double(inst_info.contract_multiplier * position.volume);
    }
    position.update_time = time::now_in_nano();
  }

  if (bIsLast && (long_position_map_.size() != 0 || short_position_map_.size() != 0)) {
    auto writer = get_writer(location::PUBLIC);
    for (const auto &kv : long_position_map_) {
      const auto &position = kv.second;
      writer->write(now(), position);
    }
    for (const auto &kv : short_position_map_) {
      const auto &position = kv.second;
      writer->write(now(), position);
    }
    PositionEnd &end = writer->open_data<PositionEnd>(now());
    end.holder_uid = get_io_device()->get_home()->uid;
    writer->close_data();
    short_position_map_.clear();
    long_position_map_.clear();
  }
}

void TraderCTP::OnRspQryInstrument(CThostFtdcInstrumentField *pInstrument, CThostFtdcRspInfoField *pRspInfo,
                                   int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("INSTRUMENT RES error_id {}, error_msg {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }

  if (pInstrument == nullptr) {
    SPDLOG_INFO("INSTRUMENT RES pInstrument is nullptr, bIsLast {}", bIsLast);
  } else if (pInstrument->ProductClass == THOST_FTDC_PC_Futures) {
    //此处不写journal，需要等请求完margin ratio后再写入
    Instrument instrument = {};
    from_ctp(*pInstrument, instrument);
    instrument_map_[pInstrument->InstrumentID] = instrument;

    if (!config_.broker_margin_ratio) {
      auto writer = get_writer(location::PUBLIC);
      writer->write(now(), instrument);
    }
  }
 
  if (bIsLast) {
    SPDLOG_INFO("INSTRUMENT RES bIsLast {}", bIsLast);

    if (config_.broker_margin_ratio) {
      instrument_map_iter_ = instrument_map_.begin();
      req_marginRatio_count_ = 1;
      req_qry_instrumentMarginRate(instrument_map_iter_);
    } else {
      auto writer = get_writer(location::PUBLIC);
      writer->mark(now(), InstrumentEnd::tag);
      update_broker_state(BrokerState::Ready);
      SPDLOG_INFO("BrokerState::Ready");
    }
  }
}

int TraderCTP::req_qry_instrumentMarginRate(InstrumentMap::iterator& iter) {
  CThostFtdcQryInstrumentMarginRateField req = {};
  strncpy(req.BrokerID, config_.broker_id.c_str(), sizeof(req.BrokerID));
  strncpy(req.InvestorID, config_.account_id.c_str(), sizeof(req.InvestorID));
  strncpy(req.InstrumentID, iter->first.c_str(), sizeof(req.InstrumentID));
  strncpy(req.ExchangeID, iter->second.exchange_id.to_string().c_str(), sizeof(req.ExchangeID));
  req.HedgeFlag = THOST_FTDC_HF_Speculation;
  std::this_thread::sleep_for(std::chrono::seconds(1));
  int rtn = api_->ReqQryInstrumentMarginRate(&req, ++request_id_);
  SPDLOG_INFO("INSTRUMENT MARGIN RATE REQ rtn {}, req_marginRatio_count_ {}, total {}, req BrokerID {}, InvestorID {}, HedgeFlag {}, InstrumentID {}, ExchangeID {}", rtn, req_marginRatio_count_, instrument_map_.size(), req.BrokerID, req.InvestorID, req.HedgeFlag, req.InstrumentID, req.ExchangeID);
  return rtn;
}

void TraderCTP::OnRspQryInstrumentMarginRate(CThostFtdcInstrumentMarginRateField *pInstrumentMarginRate, CThostFtdcRspInfoField *pRspInfo,
                                   int nRequestID, bool bIsLast) {
  if (pRspInfo != nullptr && pRspInfo->ErrorID != 0) {
    SPDLOG_ERROR("INSTRUMENT MARGIN RATE RES (error_id) {} (error_msg) {}", pRspInfo->ErrorID, gbk2utf8(pRspInfo->ErrorMsg));
    return;
  }

  if (pInstrumentMarginRate == nullptr) {
    SPDLOG_INFO("INSTRUMENT MARGIN RATE RES pInstrumentMarginRate is nullptr, bIsLast {}", bIsLast);
  } else if (instrument_map_.find(pInstrumentMarginRate->InstrumentID) != instrument_map_.end()) {
    auto writer = get_writer(location::PUBLIC);
    auto& instrument = instrument_map_.at(pInstrumentMarginRate->InstrumentID);
    from_ctp(*pInstrumentMarginRate, instrument);
    SPDLOG_INFO("INSTRUMENT_MARGIN RATE instrument_id {}, lmr_money {}, smr_mony {}", pInstrumentMarginRate->InstrumentID, pInstrumentMarginRate->LongMarginRatioByMoney, pInstrumentMarginRate->ShortMarginRatioByMoney);
    writer->write(now(), instrument);
  }

  instrument_map_iter_++;
  req_marginRatio_count_++;

  if (instrument_map_iter_ != instrument_map_.end()) {
    req_qry_instrumentMarginRate(instrument_map_iter_);
  } else {
    record_instruments_stored_trading_day();
    auto writer = get_writer(location::PUBLIC);
    writer->mark(now(), InstrumentEnd::tag);
    update_broker_state(BrokerState::Ready);
    SPDLOG_INFO("BrokerState::Ready");
  }
}

void TraderCTP::on_start() {
  broker::Trader::on_start();

  std::string runtime_folder = get_runtime_folder();
  api_ = CThostFtdcTraderApi::CreateFtdcTraderApi(runtime_folder.c_str());
  api_->RegisterSpi(this);
  api_->RegisterFront((char *)config_.td_uri.c_str());
  api_->SubscribePublicTopic(THOST_TERT_QUICK);
  api_->SubscribePrivateTopic(THOST_TERT_QUICK);
  api_->Init();
}

bool TraderCTP::login() {
    CThostFtdcReqUserLoginField login_field = {};
    strcpy(login_field.BrokerID, config_.broker_id.c_str());
    strcpy(login_field.UserID, config_.account_id.c_str());
    strcpy(login_field.Password, config_.password.c_str());
    SPDLOG_INFO("LOGIN REQ");
    std::this_thread::sleep_for(std::chrono::seconds(1));
    int rtn = api_->ReqUserLogin(&login_field, ++request_id_);
    SPDLOG_INFO("LOGIN REQ rtn {}", rtn);
    return rtn == 0;
}

bool TraderCTP::req_settlement_confirm() {
  CThostFtdcSettlementInfoConfirmField req = {};
  strcpy(req.InvestorID, config_.account_id.c_str());
  strcpy(req.BrokerID, config_.broker_id.c_str());
  SPDLOG_INFO("SETTLEMENT REQ");
  std::this_thread::sleep_for(std::chrono::seconds(1));
  int rtn = api_->ReqSettlementInfoConfirm(&req, ++request_id_);
  SPDLOG_INFO("SETTLEMENT REQ rtn {}", rtn);
  return rtn == 0;
}

bool TraderCTP::req_auth() {
    struct CThostFtdcReqAuthenticateField req = {};
    strcpy(req.BrokerID, config_.broker_id.c_str());
    strcpy(req.UserID, config_.account_id.c_str());
    if (config_.product_info.length() > 0) {
        strcpy(req.UserProductInfo, config_.product_info.c_str());
    }
    strcpy(req.AppID, config_.app_id.c_str());
    strcpy(req.AuthCode, config_.auth_code.c_str());
    SPDLOG_INFO("AUTH REQ");
    std::this_thread::sleep_for(std::chrono::seconds(1));
    int rtn = this->api_->ReqAuthenticate(&req, ++request_id_);
    SPDLOG_INFO("AUTH REQ rtn {}", rtn);
    return rtn == 0;
}

bool TraderCTP::req_qry_instrument() {
  CThostFtdcQryInstrumentField req = {};
  SPDLOG_INFO("INSTRUMENT REQ");
  std::this_thread::sleep_for(std::chrono::seconds(1));
  int rtn = api_->ReqQryInstrument(&req, ++request_id_);
  SPDLOG_INFO("INSTRUMENT REQ rtn {}", rtn);
  return rtn == 0;
}

bool TraderCTP::req_account() {
  CThostFtdcQryTradingAccountField req = {};
  strcpy(req.BrokerID, config_.broker_id.c_str());
  strcpy(req.InvestorID, config_.account_id.c_str());
  SPDLOG_INFO("ASSET REQ");
  std::this_thread::sleep_for(std::chrono::seconds(1));
  int rtn = api_->ReqQryTradingAccount(&req, ++request_id_);
  SPDLOG_INFO("ASSET REQ rtn {}", rtn);
  return rtn == 0;
}

bool TraderCTP::req_position() {
  long_position_map_.clear();
  short_position_map_.clear();
  CThostFtdcQryInvestorPositionField req = {};
  strcpy(req.BrokerID, config_.broker_id.c_str());
  strcpy(req.InvestorID, config_.account_id.c_str());
  std::this_thread::sleep_for(std::chrono::seconds(1));
  SPDLOG_INFO("POS REQ");
  int rtn = api_->ReqQryInvestorPosition(&req, ++request_id_);
  SPDLOG_INFO("POS REQ rtn {}", rtn);
  return rtn == 0;
}


bool TraderCTP::req_position_detail() {
  SPDLOG_INFO("request account positions req_position_detail");
  CThostFtdcQryInvestorPositionDetailField req = {};
  strcpy(req.BrokerID, config_.broker_id.c_str());
  strcpy(req.InvestorID, config_.account_id.c_str());
  SPDLOG_INFO("POS_DETAIL REQ");
  std::this_thread::sleep_for(std::chrono::seconds(1));
  int rtn = api_->ReqQryInvestorPositionDetail(&req, ++request_id_);
  SPDLOG_INFO("POS_DETAIL REQ rtn {}", rtn);
  return rtn == 0;
}


bool TraderCTP::check_if_stored_instruments(const std::string& trading_day) {
  SPDLOG_INFO("CHECK_IF_STORED_INSTRUMENTS trading_day {}", trading_day);
  const cache::bank& state_bank = get_state_bank();
  for (auto &pair : state_bank[boost::hana::type_c<TimeKeyValue>]) {
    const TimeKeyValue& timeKeyValue = pair.second.data;
    if (timeKeyValue.key == "instrument_stored_trading_day" || timeKeyValue.key == "instrument_stored_trading_day_next_day") {
      if (timeKeyValue.value == trading_day) {
        return true;
      }
    }
  }
  return false;
}

void TraderCTP::record_instruments_stored_trading_day() {
  auto writer = get_writer(location::PUBLIC);
  TimeKeyValue instrument_stored_trading_day_tkv = {};
  instrument_stored_trading_day_tkv.update_time = now();
  instrument_stored_trading_day_tkv.key = "instrument_stored_trading_day";
  instrument_stored_trading_day_tkv.value = trading_day_;
  writer->write(now(), instrument_stored_trading_day_tkv);

  //为了解决夜盘的问题
  TimeKeyValue instrument_stored_trading_day_next_day_tkv = {};
  instrument_stored_trading_day_next_day_tkv.update_time = time::next_trading_day_end(now());
  instrument_stored_trading_day_next_day_tkv.key = "instrument_stored_trading_day_next_day";
  instrument_stored_trading_day_next_day_tkv.value = trading_day_;
  writer->write(now(), instrument_stored_trading_day_next_day_tkv);
  
  SPDLOG_INFO("INSTRUMENT_STORED_TRADING_DAY {}", trading_day_);
}

} // namespace kungfu::wingchun::ctp
