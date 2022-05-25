#include <kungfu/longfist/longfist.h>
#include <kungfu/wingchun/strategy/context.h>
#include <kungfu/wingchun/strategy/runner.h>
#include <kungfu/wingchun/strategy/strategy.h>
#include "com_kungfu_Runner.h"

using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::wingchun::strategy;
using namespace kungfu::yijinjing::data;
using namespace kungfu::yijinjing::log;


std::shared_ptr<Runner> runner_;
class DemoStrategy : public Strategy {
public:
  DemoStrategy(JNIEnv * env, jobject r): env_(env), r_(r){};

  void pre_start(Context_ptr &context) override {
    jclass thisClass = env_->GetObjectClass(r_);
    jmethodID method_pre_start = env_->GetMethodID(thisClass, "pre_start", "(Lcom/kungfu/Context;)V");
    if (NULL == method_pre_start)
        return;
    jclass c = env_->FindClass("com/kungfu/Context");
    jmethodID ctor = env_->GetMethodID(c, "<init>", "(J)V");
    jobject obj_context = env_->NewObject(c, ctor, (jlong)(context.get()));

    env_->CallVoidMethod(r_, method_pre_start, obj_context);

  }

void post_start(Context_ptr &context) override {
    jclass thisClass = env_->GetObjectClass(r_);
    jmethodID method_post_start = env_->GetMethodID(thisClass, "post_start", "(Lcom/kungfu/Context;)V");
    if (NULL == method_post_start)
        return;
    jclass c = env_->FindClass("com/kungfu/Context");
    jmethodID ctor = env_->GetMethodID(c, "<init>", "(J)V");
    jobject obj_context = env_->NewObject(c, ctor, (jlong)(context.get()));

    env_->CallVoidMethod(r_, method_post_start, obj_context);

  }

jdoubleArray makeDoubleArray( const double* field_value){
    jdoubleArray double_array = env_->NewDoubleArray(10);
        jdouble fill[10];
        for (int i = 0; i < 10; i++)
        {
            fill[i] = (jdouble)(field_value[i]);
        }
        env_->SetDoubleArrayRegion(double_array, 0, 10, fill);
        return double_array;
}
jlongArray makeLongArray( const int64_t* field_value){
    jlongArray long_array = env_->NewLongArray(10);
        jlong fill[10];
        for (int i = 0; i < 10; i++)
        {
            fill[i] = (jlong)(field_value[i]);
        }
        env_->SetLongArrayRegion(long_array, 0, 10, fill);
        return long_array;
}
  void on_quote(Context_ptr &context, const kungfu::longfist::types::Quote &quote) override {
      jclass thisClass = env_->GetObjectClass(r_);
    jmethodID method_on_quote = env_->GetMethodID(thisClass, "on_quote", "(Lcom/kungfu/Context;Lcom/kungfu/Quote;)V");
    if (NULL == method_on_quote)
        return;
    jclass c = env_->FindClass("com/kungfu/Context");
    jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
    jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

std::cout << "jni on_quote source_id:" << quote.source_id << " trading_day:" <<  quote.trading_day << std::endl; 
    jstring source_id = env_->NewStringUTF(quote.source_id);
    jstring trading_day = env_->NewStringUTF(quote.trading_day);

    jlong data_time = (jlong)(quote.data_time);

    jstring instrument_id = env_->NewStringUTF(quote.instrument_id);
    jstring exchange_id = env_->NewStringUTF(quote.exchange_id);

    jclass clazz_InstrumentType = env_->FindClass("com/kungfu/InstrumentType"); 
    jfieldID fid_instrument_type = env_->GetStaticFieldID(clazz_InstrumentType, kungfu::wingchun::str_from_instrument_type(quote.instrument_type).c_str(), "Lcom/kungfu/InstrumentType;");
    jobject obj_instrument_type = env_->GetStaticObjectField(clazz_InstrumentType, fid_instrument_type);

    jdouble pre_close_price = (jdouble)quote.pre_close_price;
    jdouble pre_settlement_price = (jdouble)quote.pre_settlement_price;
    jdouble last_price = (jdouble)quote.last_price;
    jlong volume = (jlong)(quote.volume);
    jdouble turnover = (jdouble)quote.turnover;
    jdouble pre_open_interest = (jdouble)quote.pre_open_interest;
    jdouble open_interest = (jdouble)quote.open_interest;
    jdouble open_price = (jdouble)quote.open_price;
    jdouble high_price = (jdouble)quote.high_price;
    jdouble low_price = (jdouble)quote.low_price;
    jdouble upper_limit_price = (jdouble)quote.upper_limit_price;
    jdouble lower_limit_price = (jdouble)quote.lower_limit_price;
    jdouble close_price = (jdouble)quote.close_price;
    jdouble settlement_price = (jdouble)quote.settlement_price;
    jdouble iopv = (jdouble)quote.iopv;

    jdoubleArray bid_price = makeDoubleArray(quote.bid_price);
    jdoubleArray ask_price = makeDoubleArray(quote.ask_price);
    jlongArray bid_volume = makeLongArray(quote.bid_volume);
    jlongArray ask_volume = makeLongArray(quote.ask_volume);

    


    jclass clazz_quote = env_->FindClass("com/kungfu/Quote");
    jmethodID quote_constructor = env_->GetMethodID(clazz_quote, "<init>", "(Ljava/lang/String;Ljava/lang/String;JLjava/lang/String;Ljava/lang/String;Lcom/kungfu/InstrumentType;DDDJDDDDDDDDDDD[D[D[J[J)V");
    jobject obj_quote = env_->NewObject(clazz_quote, quote_constructor,
    source_id, trading_day, data_time, instrument_id, exchange_id, obj_instrument_type, pre_open_interest, pre_close_price, pre_settlement_price, last_price, volume,
    turnover, pre_open_interest, open_price, high_price, low_price, upper_limit_price,
    lower_limit_price, close_price, settlement_price, iopv, bid_price, ask_price,bid_volume,ask_volume );

    env_->CallVoidMethod(r_, method_on_quote, obj_context, obj_quote);


    // jfieldID  field_instrument_id = env_->GetFieldID(q, "instrument_id", "Ljava/lang/String;");
    // jstring jstring_instrument_id = env_->NewStringUTF(quote.instrument_id);
    // env_->SetObjectField(obj_quote, field_instrument_id, jstring_instrument_id);
    // jmethodID quote_constructor1 = env_->GetMethodID(q, "setInstrument_id", "(Ljava/lang/String;)V");
    // env_->CallVoidMethod(obj_quote, quote_constructor1, jstring_instrument_id);
    //  setStringField(q, obj_quote, "instrument_id", quote.instrument_id);

//     jclass jcB = e->FindClass("java/lang/String");
// jobject jbs = e->NewObject(jcB,e->GetMethodID(jcB, "<init>","()V"));

//     jstring jstr = (jstring) env_->GetObjectField( obj_quote, field_instrument_id);

//     const char *nativeString = env_->GetStringUTFChars(jstring_instrument_id, 0);
//     const char *nativeString1 = env_->GetStringUTFChars(jstr, 0);

// std::cout << "DemoStrategy on_quote " << quote.instrument_id << " " <<  nativeString << " " << nativeString1  << std::endl;
//    env_->ReleaseStringUTFChars(jstring_instrument_id, nativeString);
//    env_->ReleaseStringUTFChars(jstr, nativeString1);


    // jfieldID  field_last_price = env_->GetFieldID(q, "last_price", "D");
    // jdouble jdouble_last_price = (jdouble)(quote.last_price);
    // env_->SetDoubleField(obj_quote, field_last_price, jdouble_last_price);


  }


std::string str_from_side(kungfu::longfist::enums::Side s) {
  switch (s) {
  case kungfu::longfist::enums::Side::Buy:
    return "Buy";
  case kungfu::longfist::enums::Side::Sell:
    return "Sell";
  case kungfu::longfist::enums::Side::Lock:
    return "Lock";
  case kungfu::longfist::enums::Side::Unlock:
    return "Unlock";
  case kungfu::longfist::enums::Side::Exec:
    return "Exec";
  case kungfu::longfist::enums::Side::Drop:
    return "Drop";
  case kungfu::longfist::enums::Side::Purchase:
    return "Purchase";
  case kungfu::longfist::enums::Side::Redemption:
    return "Redemption";
  case kungfu::longfist::enums::Side::Split:
    return "Split";
  case kungfu::longfist::enums::Side::Merge:
    return "Merge";
  case kungfu::longfist::enums::Side::MarginTrade:
    return "MarginTrade";
  case kungfu::longfist::enums::Side::ShortSell:
    return "ShortSell";
  case kungfu::longfist::enums::Side::RepayMargin:
    return "RepayMargin";
  case kungfu::longfist::enums::Side::RepayStock:
    return "RepayStock";
  case kungfu::longfist::enums::Side::CashRepayMargin:
    return "CashRepayMargin";
  case kungfu::longfist::enums::Side::StockRepayStock:
    return "StockRepayStock";
  case kungfu::longfist::enums::Side::SurplusStockTransfer:
    return "SurplusStockTransfer";
  case kungfu::longfist::enums::Side::GuaranteeStockTransferIn:
    return "GuaranteeStockTransferIn";
  case kungfu::longfist::enums::Side::GuaranteeStockTransferOut:
    return "GuaranteeStockTransferOut";
  case kungfu::longfist::enums::Side::Unknown:
    return "Unknown";
  default:
    return "Unknown";
  }
}

std::string str_from_order_status(kungfu::longfist::enums::OrderStatus s) {
  switch (s) {
  case kungfu::longfist::enums::OrderStatus::Unknown:
    return "Unknown";
  case kungfu::longfist::enums::OrderStatus::Submitted:
    return "Submitted";
  case kungfu::longfist::enums::OrderStatus::Pending:
    return "Pending";
  case kungfu::longfist::enums::OrderStatus::Cancelled:
    return "Cancelled";
  case kungfu::longfist::enums::OrderStatus::Error:
    return "Error";
  case kungfu::longfist::enums::OrderStatus::Filled:
    return "Filled";
  case kungfu::longfist::enums::OrderStatus::PartialFilledNotActive:
    return "PartialFilledNotActive";
  case kungfu::longfist::enums::OrderStatus::PartialFilledActive:
    return "PartialFilledActive";
  case kungfu::longfist::enums::OrderStatus::Lost:
    return "Lost";
  default:
    return "Unknown";
  }
}

std::string str_from_offset(kungfu::longfist::enums::Offset s) {
  switch (s) {
  case kungfu::longfist::enums::Offset::Open:
    return "Open";
  case kungfu::longfist::enums::Offset::Close:
    return "Close";
  case kungfu::longfist::enums::Offset::CloseToday:
    return "CloseToday";
  case kungfu::longfist::enums::Offset::CloseYesterday:
    return "CloseYesterday";
  default:
    return "Open";
  }
}

std::string str_from_hedgeflag(kungfu::longfist::enums::HedgeFlag s) {
  switch (s) {
  case kungfu::longfist::enums::HedgeFlag::Speculation:
    return "Speculation";
  case kungfu::longfist::enums::HedgeFlag::Arbitrage:
    return "Arbitrage";
  case kungfu::longfist::enums::HedgeFlag::Hedge:
    return "Hedge";
  case kungfu::longfist::enums::HedgeFlag::Covered:
    return "Covered";
  default:
    return "Speculation";
  }
}

std::string str_from_pricetype(kungfu::longfist::enums::PriceType s) {
  switch (s) {
  case kungfu::longfist::enums::PriceType::Limit:
    return "Limit";
  case kungfu::longfist::enums::PriceType::Any:
    return "Any";
  case kungfu::longfist::enums::PriceType::FakBest5:
    return "FakBest5";
  case kungfu::longfist::enums::PriceType::ForwardBest:
    return "ForwardBest";
  case kungfu::longfist::enums::PriceType::ReverseBest:
    return "ReverseBest";
  case kungfu::longfist::enums::PriceType::Fak:
    return "Fak";
  case kungfu::longfist::enums::PriceType::Fok:
    return "Fok";
  default:
    return "UnKnown";
  }
}

std::string str_from_volumecondition(kungfu::longfist::enums::VolumeCondition s) {
  switch (s) {
  case kungfu::longfist::enums::VolumeCondition::Any:
    return "Any";
  case kungfu::longfist::enums::VolumeCondition::Min:
    return "Min";
  case kungfu::longfist::enums::VolumeCondition::All:
    return "All";
  default:
    return "Any";
  }
}

std::string str_from_timecondition(kungfu::longfist::enums::TimeCondition s) {
  switch (s) {
  case kungfu::longfist::enums::TimeCondition::IOC:
    return "IOC";
  case kungfu::longfist::enums::TimeCondition::GFD:
    return "GFD";
  case kungfu::longfist::enums::TimeCondition::GTC:
    return "GTC";
  default:
    return "IOC";
  }
}

std::string str_from_category(kungfu::longfist::enums::category c) {
  switch (c) {
  case category::MD:
    return "MD";
  case category::TD:
    return "TD";
  case category::STRATEGY:
    return "STRATEGY";
  case category::SYSTEM:
    return "SYSTEM";
  default:
    return "SYSTEM";
  }
}

std::string str_from_mode(kungfu::longfist::enums::mode c) {
  switch (c) {
  case mode::LIVE:
    return "LIVE";
  case mode::DATA:
    return "DATA";
  case mode::REPLAY:
    return "REPLAY";
  case mode::BACKTEST:
    return "BACKTEST";
  default:
    return "LIVE";
  }
}

std::string str_from_brokerstate(kungfu::longfist::enums::BrokerState c) {
  switch (c) {
  case BrokerState::Pending:
    return "Pending";
  case BrokerState::Idle:
    return "Idle";
  case BrokerState::DisConnected:
    return "DisConnected";
  case BrokerState::Connected:
    return "Connected";
  case BrokerState::LoggedIn:
    return "LoggedIn";
  case BrokerState::LoginFailed:
    return "LoginFailed";
  case BrokerState::Ready:
    return "Ready";
  default:
    return "DisConnected";
  }
}

void on_order(Context_ptr &context, const kungfu::longfist::types::Order &order) override {
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_order = env_->GetMethodID(thisClass, "on_order", "(Lcom/kungfu/Context;Lcom/kungfu/Order;)V");
  if (NULL == method_on_order)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

  jlong parent_id = (jlong)(order.parent_id);
  jlong order_id = (jlong)(order.order_id);
  jlong insert_time = (jlong)(order.insert_time);
  jlong update_time = (jlong)(order.update_time);

  jstring trading_day = env_->NewStringUTF(order.trading_day);
  jstring instrument_id = env_->NewStringUTF(order.instrument_id);
  jstring exchange_id = env_->NewStringUTF(order.exchange_id);
  jstring source_id = env_->NewStringUTF(order.source_id);
  jstring account_id = env_->NewStringUTF(order.account_id);
  jstring client_id = env_->NewStringUTF(order.client_id);

  jclass clazz_InstrumentType = env_->FindClass("com/kungfu/InstrumentType");
  jfieldID fid_instrument_type = env_->GetStaticFieldID(
      clazz_InstrumentType, kungfu::wingchun::str_from_instrument_type(order.instrument_type).c_str(),
      "Lcom/kungfu/InstrumentType;");
  jobject obj_instrument_type = env_->GetStaticObjectField(clazz_InstrumentType, fid_instrument_type);

  jdouble limit_price = (jdouble)order.limit_price;
  jdouble frozen_price = (jdouble)order.frozen_price;

  jlong volume = (jlong)(order.volume);
  jlong volume_traded = (jlong)(order.volume_traded);
  jlong volume_left = (jlong)(order.volume_left);

  jdouble tax = (jdouble)(order.tax);
  jdouble commission = (jdouble)(order.commission);

  jclass clazz_status = env_->FindClass("com/kungfu/OrderStatus");
  jfieldID fid_status =
      env_->GetStaticFieldID(clazz_status, str_from_order_status(order.status).c_str(), "Lcom/kungfu/OrderStatus;");
  jobject obj_status = env_->GetStaticObjectField(clazz_status, fid_status);

  jint error_id = (jint)(order.error_id);

  jstring error_msg = env_->NewStringUTF(order.error_msg);

  jclass clazz_side = env_->FindClass("com/kungfu/Side");
  jfieldID fid_side = env_->GetStaticFieldID(clazz_side, str_from_side(order.side).c_str(), "Lcom/kungfu/Side;");
  jobject obj_side = env_->GetStaticObjectField(clazz_side, fid_side);

  jclass clazz_offset = env_->FindClass("com/kungfu/Offset");
  jfieldID fid_offset =
      env_->GetStaticFieldID(clazz_offset, str_from_offset(order.offset).c_str(), "Lcom/kungfu/Offset;");
  jobject obj_offset = env_->GetStaticObjectField(clazz_offset, fid_offset);

  jclass clazz_hedgeflag = env_->FindClass("com/kungfu/HedgeFlag");
  jfieldID fid_hedgeflag =
      env_->GetStaticFieldID(clazz_hedgeflag, str_from_hedgeflag(order.hedge_flag).c_str(), "Lcom/kungfu/HedgeFlag;");
  jobject obj_hedgeflag = env_->GetStaticObjectField(clazz_hedgeflag, fid_hedgeflag);

  jclass clazz_pricetype = env_->FindClass("com/kungfu/PriceType");
  jfieldID fid_pricetype =
      env_->GetStaticFieldID(clazz_pricetype, str_from_pricetype(order.price_type).c_str(), "Lcom/kungfu/PriceType;");
  jobject obj_pricetype = env_->GetStaticObjectField(clazz_pricetype, fid_pricetype);

  jclass clazz_volumecondition = env_->FindClass("com/kungfu/VolumeCondition");
  jfieldID fid_volumecondition = env_->GetStaticFieldID(
      clazz_volumecondition, str_from_volumecondition(order.volume_condition).c_str(), "Lcom/kungfu/VolumeCondition;");
  jobject obj_volumecondition = env_->GetStaticObjectField(clazz_volumecondition, fid_volumecondition);

  jclass clazz_timecondition = env_->FindClass("com/kungfu/TimeCondition");
  jfieldID fid_timecondition = env_->GetStaticFieldID(
      clazz_timecondition, str_from_timecondition(order.time_condition).c_str(), "Lcom/kungfu/TimeCondition;");
  jobject obj_timecondition = env_->GetStaticObjectField(clazz_timecondition, fid_timecondition);

  jclass clazz_order = env_->FindClass("com/kungfu/Order");
  jmethodID order_constructor =
      env_->GetMethodID(clazz_order, "<init>",
                        "(JJJJLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/"
                        "String;Ljava/lang/String;Lcom/kungfu/InstrumentType;DDJJJDDLcom/kungfu/OrderStatus;ILjava/"
                        "lang/String;Lcom/kungfu/Side;Lcom/kungfu/Offset;Lcom/kungfu/HedgeFlag;Lcom/kungfu/"
                        "PriceType;Lcom/kungfu/VolumeCondition;Lcom/kungfu/TimeCondition;)V");
  jobject obj_order = env_->NewObject(clazz_order, order_constructor, parent_id, order_id, insert_time, update_time,
                                      trading_day, instrument_id, exchange_id, source_id, account_id, client_id,
                                      obj_instrument_type, limit_price, frozen_price, volume, volume_traded,
                                      volume_left, tax, commission, obj_status, error_id, error_msg, obj_side,
                                      obj_offset, obj_hedgeflag, obj_pricetype, obj_volumecondition, obj_timecondition);

  env_->CallVoidMethod(r_, method_on_order, obj_context, obj_order);
}

void on_history_order(Context_ptr &context, const kungfu::longfist::types::HistoryOrder &order) override {
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_history_order = env_->GetMethodID(thisClass, "on_history_order", "(Lcom/kungfu/Context;Lcom/kungfu/HistoryOrder;)V");
  if (NULL == method_on_history_order)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

  jlong parent_id = (jlong)(order.parent_id);
  jlong order_id = (jlong)(order.order_id);
  jlong insert_time = (jlong)(order.insert_time);
  jlong update_time = (jlong)(order.update_time);

  jstring trading_day = env_->NewStringUTF(order.trading_day);
  jstring instrument_id = env_->NewStringUTF(order.instrument_id);
  jstring exchange_id = env_->NewStringUTF(order.exchange_id);
  jstring source_id = env_->NewStringUTF(order.source_id);
  jstring account_id = env_->NewStringUTF(order.account_id);
  // jstring client_id = env_->NewStringUTF(order.client_id);
  jboolean is_last = (jboolean)(order.is_last);

  jclass clazz_InstrumentType = env_->FindClass("com/kungfu/InstrumentType");
  jfieldID fid_instrument_type = env_->GetStaticFieldID(
      clazz_InstrumentType, kungfu::wingchun::str_from_instrument_type(order.instrument_type).c_str(),
      "Lcom/kungfu/InstrumentType;");
  jobject obj_instrument_type = env_->GetStaticObjectField(clazz_InstrumentType, fid_instrument_type);

  jdouble limit_price = (jdouble)order.limit_price;
  jdouble frozen_price = (jdouble)order.frozen_price;

  jlong volume = (jlong)(order.volume);
  jlong volume_traded = (jlong)(order.volume_traded);
  jlong volume_left = (jlong)(order.volume_left);

  jdouble tax = (jdouble)(order.tax);
  jdouble commission = (jdouble)(order.commission);

  jclass clazz_status = env_->FindClass("com/kungfu/OrderStatus");
  jfieldID fid_status =
      env_->GetStaticFieldID(clazz_status, str_from_order_status(order.status).c_str(), "Lcom/kungfu/OrderStatus;");
  jobject obj_status = env_->GetStaticObjectField(clazz_status, fid_status);

  jint error_id = (jint)(order.error_id);

  jstring error_msg = env_->NewStringUTF(order.error_msg);

  jclass clazz_side = env_->FindClass("com/kungfu/Side");
  jfieldID fid_side = env_->GetStaticFieldID(clazz_side, str_from_side(order.side).c_str(), "Lcom/kungfu/Side;");
  jobject obj_side = env_->GetStaticObjectField(clazz_side, fid_side);

  jclass clazz_offset = env_->FindClass("com/kungfu/Offset");
  jfieldID fid_offset =
      env_->GetStaticFieldID(clazz_offset, str_from_offset(order.offset).c_str(), "Lcom/kungfu/Offset;");
  jobject obj_offset = env_->GetStaticObjectField(clazz_offset, fid_offset);

  jclass clazz_hedgeflag = env_->FindClass("com/kungfu/HedgeFlag");
  jfieldID fid_hedgeflag =
      env_->GetStaticFieldID(clazz_hedgeflag, str_from_hedgeflag(order.hedge_flag).c_str(), "Lcom/kungfu/HedgeFlag;");
  jobject obj_hedgeflag = env_->GetStaticObjectField(clazz_hedgeflag, fid_hedgeflag);

  jclass clazz_pricetype = env_->FindClass("com/kungfu/PriceType");
  jfieldID fid_pricetype =
      env_->GetStaticFieldID(clazz_pricetype, str_from_pricetype(order.price_type).c_str(), "Lcom/kungfu/PriceType;");
  jobject obj_pricetype = env_->GetStaticObjectField(clazz_pricetype, fid_pricetype);

  jclass clazz_volumecondition = env_->FindClass("com/kungfu/VolumeCondition");
  jfieldID fid_volumecondition = env_->GetStaticFieldID(
      clazz_volumecondition, str_from_volumecondition(order.volume_condition).c_str(), "Lcom/kungfu/VolumeCondition;");
  jobject obj_volumecondition = env_->GetStaticObjectField(clazz_volumecondition, fid_volumecondition);

  jclass clazz_timecondition = env_->FindClass("com/kungfu/TimeCondition");
  jfieldID fid_timecondition = env_->GetStaticFieldID(
      clazz_timecondition, str_from_timecondition(order.time_condition).c_str(), "Lcom/kungfu/TimeCondition;");
  jobject obj_timecondition = env_->GetStaticObjectField(clazz_timecondition, fid_timecondition);

  jclass clazz_order = env_->FindClass("com/kungfu/HistoryOrder");
  jmethodID order_constructor =
      env_->GetMethodID(clazz_order, "<init>",
                        "(JJJJLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ZLcom/kungfu/InstrumentType;DDJJJDDLcom/kungfu/OrderStatus;ILjava/lang/String;Lcom/kungfu/Side;Lcom/kungfu/Offset;Lcom/kungfu/HedgeFlag;Lcom/kungfu/PriceType;Lcom/kungfu/VolumeCondition;Lcom/kungfu/TimeCondition;)V");
  jobject obj_order = env_->NewObject(clazz_order, order_constructor, parent_id, order_id, insert_time, update_time,
                                      trading_day, instrument_id, exchange_id, source_id, account_id, is_last,
                                      obj_instrument_type, limit_price, frozen_price, volume, volume_traded,
                                      volume_left, tax, commission, obj_status, error_id, error_msg, obj_side,
                                      obj_offset, obj_hedgeflag, obj_pricetype, obj_volumecondition, obj_timecondition);

  env_->CallVoidMethod(r_, method_on_history_order, obj_context, obj_order);
}

void on_trade(Context_ptr &context, const kungfu::longfist::types::Trade &trade) override {
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_trade = env_->GetMethodID(thisClass, "on_trade", "(Lcom/kungfu/Context;Lcom/kungfu/Trade;)V");
  if (NULL == method_on_trade)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

  jlong trade_id = (jlong)(trade.trade_id);
  jlong order_id = (jlong)(trade.order_id);
  jlong parent_order_id = (jlong)(trade.parent_order_id);
  jlong trade_time = (jlong)(trade.trade_time);

  jstring trading_day = env_->NewStringUTF(trade.trading_day);
  jstring instrument_id = env_->NewStringUTF(trade.instrument_id);
  jstring exchange_id = env_->NewStringUTF(trade.exchange_id);
  jstring source_id = env_->NewStringUTF(trade.source_id);
  jstring account_id = env_->NewStringUTF(trade.account_id);
  jstring client_id = env_->NewStringUTF(trade.client_id);

  jclass clazz_InstrumentType = env_->FindClass("com/kungfu/InstrumentType");
  jfieldID fid_instrument_type = env_->GetStaticFieldID(
      clazz_InstrumentType, kungfu::wingchun::str_from_instrument_type(trade.instrument_type).c_str(),
      "Lcom/kungfu/InstrumentType;");
  jobject obj_instrument_type = env_->GetStaticObjectField(clazz_InstrumentType, fid_instrument_type);

  jclass clazz_side = env_->FindClass("com/kungfu/Side");
  jfieldID fid_side = env_->GetStaticFieldID(clazz_side, str_from_side(trade.side).c_str(), "Lcom/kungfu/Side;");
  jobject obj_side = env_->GetStaticObjectField(clazz_side, fid_side);

  jclass clazz_offset = env_->FindClass("com/kungfu/Offset");
  jfieldID fid_offset =
      env_->GetStaticFieldID(clazz_offset, str_from_offset(trade.offset).c_str(), "Lcom/kungfu/Offset;");
  jobject obj_offset = env_->GetStaticObjectField(clazz_offset, fid_offset);

  jclass clazz_hedgeflag = env_->FindClass("com/kungfu/HedgeFlag");
  jfieldID fid_hedgeflag =
      env_->GetStaticFieldID(clazz_hedgeflag, str_from_hedgeflag(trade.hedge_flag).c_str(), "Lcom/kungfu/HedgeFlag;");
  jobject obj_hedgeflag = env_->GetStaticObjectField(clazz_hedgeflag, fid_hedgeflag);

  jdouble price = (jdouble)trade.price;

  jlong volume = (jlong)(trade.volume);
  jlong close_today_volume = (jlong)(trade.close_today_volume);

  jdouble tax = (jdouble)(trade.tax);
  jdouble commission = (jdouble)(trade.commission);

  jclass clazz_trade = env_->FindClass("com/kungfu/Trade");
  jmethodID trade_constructor = env_->GetMethodID(
      clazz_trade, "<init>",
      "(JJJJLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/"
      "String;Lcom/kungfu/InstrumentType;Lcom/kungfu/Side;Lcom/kungfu/Offset;Lcom/kungfu/HedgeFlag;DJJDD)V");
  jobject obj_trade =
      env_->NewObject(clazz_trade, trade_constructor, trade_id, order_id, parent_order_id, trade_time, trading_day,
                      instrument_id, exchange_id, source_id, account_id, client_id, obj_instrument_type, obj_side,
                      obj_offset, obj_hedgeflag, price, volume, close_today_volume, tax, commission);

  env_->CallVoidMethod(r_, method_on_trade, obj_context, obj_trade);
}

void on_history_trade(Context_ptr &context, const kungfu::longfist::types::HistoryTrade &trade) override {
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_history_trade = env_->GetMethodID(thisClass, "on_history_trade", "(Lcom/kungfu/Context;Lcom/kungfu/HistoryTrade;)V");
  if (NULL == method_on_history_trade)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

  jlong trade_id = (jlong)(trade.trade_id);
  jlong order_id = (jlong)(trade.order_id);
  jlong parent_order_id = (jlong)(trade.parent_order_id);
  jlong trade_time = (jlong)(trade.trade_time);

  jstring trading_day = env_->NewStringUTF(trade.trading_day);
  jstring instrument_id = env_->NewStringUTF(trade.instrument_id);
  jstring exchange_id = env_->NewStringUTF(trade.exchange_id);
  jstring source_id = env_->NewStringUTF(trade.source_id);
  jstring account_id = env_->NewStringUTF(trade.account_id);
  // jstring client_id = env_->NewStringUTF(trade.client_id);
  jboolean is_last = (jboolean)(trade.is_last);

  jclass clazz_InstrumentType = env_->FindClass("com/kungfu/InstrumentType");
  jfieldID fid_instrument_type = env_->GetStaticFieldID(
      clazz_InstrumentType, kungfu::wingchun::str_from_instrument_type(trade.instrument_type).c_str(),
      "Lcom/kungfu/InstrumentType;");
  jobject obj_instrument_type = env_->GetStaticObjectField(clazz_InstrumentType, fid_instrument_type);

  jclass clazz_side = env_->FindClass("com/kungfu/Side");
  jfieldID fid_side = env_->GetStaticFieldID(clazz_side, str_from_side(trade.side).c_str(), "Lcom/kungfu/Side;");
  jobject obj_side = env_->GetStaticObjectField(clazz_side, fid_side);

  jclass clazz_offset = env_->FindClass("com/kungfu/Offset");
  jfieldID fid_offset =
      env_->GetStaticFieldID(clazz_offset, str_from_offset(trade.offset).c_str(), "Lcom/kungfu/Offset;");
  jobject obj_offset = env_->GetStaticObjectField(clazz_offset, fid_offset);

  jclass clazz_hedgeflag = env_->FindClass("com/kungfu/HedgeFlag");
  jfieldID fid_hedgeflag =
      env_->GetStaticFieldID(clazz_hedgeflag, str_from_hedgeflag(trade.hedge_flag).c_str(), "Lcom/kungfu/HedgeFlag;");
  jobject obj_hedgeflag = env_->GetStaticObjectField(clazz_hedgeflag, fid_hedgeflag);

  jdouble price = (jdouble)trade.price;

  jlong volume = (jlong)(trade.volume);
  jlong close_today_volume = (jlong)(trade.close_today_volume);

  jdouble tax = (jdouble)(trade.tax);
  jdouble commission = (jdouble)(trade.commission);

  jclass clazz_trade = env_->FindClass("com/kungfu/HistoryTrade");
  jmethodID trade_constructor = env_->GetMethodID(
      clazz_trade, "<init>",
      "(JJJJLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ZLcom/kungfu/InstrumentType;Lcom/kungfu/Side;Lcom/kungfu/Offset;Lcom/kungfu/HedgeFlag;DJJDD)V");
  jobject obj_trade =
      env_->NewObject(clazz_trade, trade_constructor, trade_id, order_id, parent_order_id, trade_time, trading_day,
                      instrument_id, exchange_id, source_id, account_id, is_last, obj_instrument_type, obj_side,
                      obj_offset, obj_hedgeflag, price, volume, close_today_volume, tax, commission);

  env_->CallVoidMethod(r_, method_on_history_trade, obj_context, obj_trade);
}

  void setStringField(jclass clazz, jobject obj, const char* field_name, const char* field_value){
     jfieldID  field_id = env_->GetFieldID(clazz, field_name, "Ljava/lang/String;");
    jstring jstring_field = env_->NewStringUTF(field_value);
    env_->SetObjectField(obj, field_id, jstring_field); 
  }

void on_deregister(Context_ptr &context, const kungfu::longfist::types::Deregister &deregister){
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_deregister = env_->GetMethodID(thisClass, "on_deregister", "(Lcom/kungfu/Context;Lcom/kungfu/Deregister;)V");
  if (NULL == method_on_deregister)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));

  jint location_uid = (jint)(deregister.location_uid);

  jclass clazz_category = env_->FindClass("com/kungfu/Category");
  jfieldID fid_category = env_->GetStaticFieldID(clazz_category, str_from_category(deregister.category).c_str(), "Lcom/kungfu/Category;");
  jobject obj_category = env_->GetStaticObjectField(clazz_category, fid_category);
  
  jclass clazz_mode = env_->FindClass("com/kungfu/Mode");
  jfieldID fid_mode = env_->GetStaticFieldID(clazz_mode, str_from_mode(deregister.mode).c_str(), "Lcom/kungfu/Mode;");
  jobject obj_mode = env_->GetStaticObjectField(clazz_mode, fid_mode);

  jstring group = env_->NewStringUTF(deregister.group.c_str());
  jstring name = env_->NewStringUTF(deregister.name.c_str());
  
  jclass clazz_deregister = env_->FindClass("com/kungfu/Deregister");
  jmethodID deregister_constructor = env_->GetMethodID(
      clazz_deregister, "<init>",
      "(ILcom/kungfu/Category;Lcom/kungfu/Mode;Ljava/lang/String;Ljava/lang/String;)V");
  jobject obj_deregister =
      env_->NewObject(clazz_deregister, deregister_constructor, location_uid, obj_category, obj_mode, group, name);

  env_->CallVoidMethod(r_, method_on_deregister, obj_context, obj_deregister);
}


void on_broker_state_change(Context_ptr &context, const kungfu::longfist::types::BrokerStateUpdate &brokerStateUpdate, const kungfu::yijinjing::data::location_ptr& location){
  jclass thisClass = env_->GetObjectClass(r_);
  jmethodID method_on_broker_state_change = env_->GetMethodID(thisClass, "on_broker_state_change", "(Lcom/kungfu/Context;Lcom/kungfu/BrokerStateUpdate;Lcom/kungfu/Location;)V");
  if (NULL == method_on_broker_state_change)
    return;
  jclass c = env_->FindClass("com/kungfu/Context");
  jmethodID context_constructor = env_->GetMethodID(c, "<init>", "(J)V");
  jobject obj_context = env_->NewObject(c, context_constructor, (jlong)(context.get()));


  jclass clazz_brokerstate = env_->FindClass("com/kungfu/BrokerState");
  jfieldID fid_brokerstate = env_->GetStaticFieldID(clazz_brokerstate, str_from_brokerstate(brokerStateUpdate.state).c_str(), "Lcom/kungfu/BrokerState;");
  jobject obj_brokerstate = env_->GetStaticObjectField(clazz_brokerstate, fid_brokerstate);

  jclass clazz_brokerstateupdate = env_->FindClass("com/kungfu/BrokerStateUpdate");
  jmethodID brokerstateupdate_constructor = env_->GetMethodID(
      clazz_brokerstateupdate, "<init>",
      "(Lcom/kungfu/BrokerState;)V");
  jobject obj_brokerstateupdate =
      env_->NewObject(clazz_brokerstateupdate, brokerstateupdate_constructor, obj_brokerstate);



  jint uid = (jint)(location->uid);

  jstring uname = env_->NewStringUTF(location->uname.c_str());
  jstring group = env_->NewStringUTF(location->group.c_str());
  jstring name = env_->NewStringUTF(location->name.c_str());

  jclass clazz_category = env_->FindClass("com/kungfu/Category");
  jfieldID fid_category = env_->GetStaticFieldID(clazz_category, str_from_category(location->category).c_str(), "Lcom/kungfu/Category;");
  jobject obj_category = env_->GetStaticObjectField(clazz_category, fid_category);
  
  jclass clazz_mode = env_->FindClass("com/kungfu/Mode");
  jfieldID fid_mode = env_->GetStaticFieldID(clazz_mode, str_from_mode(location->mode).c_str(), "Lcom/kungfu/Mode;");
  jobject obj_mode = env_->GetStaticObjectField(clazz_mode, fid_mode);
  
  jclass clazz_location = env_->FindClass("com/kungfu/Location");
  jmethodID location_constructor = env_->GetMethodID(
      clazz_location, "<init>",
      "(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Lcom/kungfu/Category;Lcom/kungfu/Mode;)V");
  jobject obj_location =
      env_->NewObject(clazz_location, location_constructor, uid, uname, group, name, obj_category, obj_mode);

  env_->CallVoidMethod(r_, method_on_broker_state_change, obj_context, obj_brokerstateupdate, obj_location);
}

JNIEnv * env_;
jobject r_;

};
Strategy_ptr demo_strategy;
/*
 * Class:     com_kungfu_Runner
 * Method:    init
 * Signature: (Lcom/kungfu/Runner;)V
 */
extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Runner_init(JNIEnv *env, jobject self, jobject obj) {
}
std::string jstring2string(JNIEnv *env, jstring jStr){
    const char *cstr = env->GetStringUTFChars(jStr, NULL);
    std::string str = std::string(cstr);
    env->ReleaseStringUTFChars(jStr, cstr);
    return str;
}
/*
 * Class:     com_kungfu_Runner
 * Method:    run
 * Signature: ()V
 */
extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Runner_run(JNIEnv *env, jobject self, jstring group, jstring name) {
  if (!runner_) {
    std::string g = jstring2string(env, group);
    std::string n = jstring2string(env, name);
    runner_ = std::make_shared<Runner>(std::make_shared<locator>(), g.c_str(), n.c_str(), mode::LIVE, false);
    demo_strategy = std::make_shared<DemoStrategy>(env, self);
    runner_->add_strategy(demo_strategy);
    std::cout << "runner is ready to run..." << std::endl;
    runner_->run();
  } else {
    jclass exp = env->FindClass("java/lang/RuntimeException");
    env->ThrowNew(  exp, "runner is running" );
  }
}

extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Runner_setup
  (JNIEnv *env, jobject self){
    if (runner_) {
      runner_->setup();
    }else{
      std::cout << "setup: runner is null" << std::endl;
    }
  }
extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Runner_step
  (JNIEnv *env, jobject self){
    if (runner_) {
      runner_->step();
    }else{
      std::cout << "step: runner is null" << std::endl;
    }
  }


extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Runner_add_1strategy
  (JNIEnv *env, jobject self, jstring group, jstring name){
  if (!runner_) {
    std::string g = jstring2string(env, group);
    std::string n = jstring2string(env, name);
    runner_ = std::make_shared<Runner>(std::make_shared<locator>(), g.c_str(), n.c_str(), mode::LIVE, false);
    demo_strategy = std::make_shared<DemoStrategy>(env, self);
    runner_->add_strategy(demo_strategy);
  } else {
    jclass exp = env->FindClass("java/lang/RuntimeException");
    env->ThrowNew(  exp, "runner is running" );
  }
  }