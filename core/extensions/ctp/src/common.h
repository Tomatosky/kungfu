//
// Created by qlu on 2019/8/5.
//

#ifndef KUNGFU_CTP_EXT_COMMON_H
#define KUNGFU_CTP_EXT_COMMON_H

#include <nlohmann/json.hpp>
#include <string>
#include <iostream>
#include "ThostFtdcUserApiStruct.h"

namespace kungfu::wingchun::ctp {
struct TDConfiguration {
  std::string td_uri;
  std::string account_id;
  std::string broker_id;
  std::string password;
  std::string auth_code;
  std::string product_info;
  std::string app_id;
  bool broker_margin_ratio;
  bool sync_external_order;
};

template <typename T>
void get_value_from_json(const nlohmann::json &j, const std::string &key, T &target, const T &dvalue) {
  try {
    j.at(key).get_to(target);
  } catch (nlohmann::json::exception &e) {
    target = dvalue;
  }
}

inline void from_json(const nlohmann::json &j, kungfu::wingchun::ctp::TDConfiguration &c) {
  j.at("td_uri").get_to(c.td_uri);
  j.at("account_id").get_to(c.account_id);
  j.at("broker_id").get_to(c.broker_id);
  j.at("password").get_to(c.password);
  j.at("auth_code").get_to(c.auth_code);
  j.at("app_id").get_to(c.app_id);
  j.at("broker_margin_ratio").get_to(c.broker_margin_ratio);
  c.product_info = j.value("product_info", "");

  get_value_from_json<bool>(j, "sync_external_order", c.sync_external_order, false);
}

struct MDConfiguration {
  std::string md_uri;
  std::string account_id;
  std::string broker_id;
  std::string password;
};

inline void from_json(const nlohmann::json &j, kungfu::wingchun::ctp::MDConfiguration &c) {
  j.at("md_uri").get_to(c.md_uri);
  j.at("account_id").get_to(c.account_id);
  j.at("broker_id").get_to(c.broker_id);
  j.at("password").get_to(c.password);
}

inline uint64_t get_orderSysId_key(const char* exchangeId, const char* orderSysId) {
  uint32_t hashed_exchangeId = kungfu::hash_32((const unsigned char*)exchangeId, sizeof(TThostFtdcExchangeIDType));
  uint32_t hashed_orderSysId = kungfu::hash_32((const unsigned char*)orderSysId, sizeof(TThostFtdcOrderSysIDType));
  return ((uint64_t)hashed_exchangeId << 32u) | hashed_orderSysId;
}

inline uint64_t get_orderRef_key(const int frontId, const int sessionId, const char* orderRef) {
    uint32_t front_session_id = ((uint32_t)frontId << 16u) | (uint16_t)sessionId;
    uint32_t hashed_orderRef = kungfu::hash_32((const unsigned char*)orderRef, sizeof(TThostFtdcOrderRefType));
    return ((uint64_t)front_session_id << 32u) | hashed_orderRef;
}

inline std::string disconnected_reason(int reason) {
  switch (reason) {
  case 0x1001:
    return "网络读失败";
  case 0x1002:
    return "网络写失败";
  case 0x2001:
    return "接收心跳超时";
  case 0x2002:
    return "发送心跳失败";
  case 0x2003:
    return "收到错误报文";
  default:
    return "Unknown";
  }
}
} // namespace kungfu::wingchun::ctp


#endif // KUNGFU_CTP_EXT_COMMON_H
