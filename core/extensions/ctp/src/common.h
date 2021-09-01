//
// Created by qlu on 2019/8/5.
//

#ifndef KUNGFU_CTP_EXT_COMMON_H
#define KUNGFU_CTP_EXT_COMMON_H

#include <nlohmann/json.hpp>
#include <string>
#include <iostream>


namespace kungfu::wingchun::ctp {
struct TDConfiguration {
  std::string td_uri;
  std::string account_id;
  std::string broker_id;
  std::string password;
  std::string auth_code;
  std::string product_info;
  std::string app_id;
};

inline void from_json(const nlohmann::json &j, kungfu::wingchun::ctp::TDConfiguration &c) {
  j.at("td_uri").get_to(c.td_uri);
  j.at("account_id").get_to(c.account_id);
  j.at("broker_id").get_to(c.broker_id);
  j.at("password").get_to(c.password);
  j.at("auth_code").get_to(c.auth_code);
  j.at("app_id").get_to(c.app_id);
  c.product_info = j.value("product_info", "");
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

inline uint32_t get_orderSysId_hashed_key(const char* exchangeId, const char* orderSysId) { 
  uint32_t hashed_exchangeId = kungfu::hash_32((const unsigned char*)exchangeId, sizeof(exchangeId));
  uint32_t hashed_orderSysId = kungfu::hash_32((const unsigned char*)orderSysId, sizeof(orderSysId));
  return hashed_exchangeId xor hashed_orderSysId;
}

inline std::string get_OrderRef_key(int64_t nano_time) {
  return std::to_string(yijinjing::time::nano_hashed(nano_time));
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
