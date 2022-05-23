#include "com_kungfu_Context.h"
#include <kungfu/wingchun/strategy/context.h>
using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::wingchun::strategy;
using namespace kungfu::yijinjing::data;
using namespace kungfu::yijinjing::log;

using namespace std;
std::string getStringFromJstring(JNIEnv *env, jstring str) {
  const char *c = env->GetStringUTFChars(str, NULL);
  string s(c);
  env->ReleaseStringUTFChars(str, c);
  return s;
}

void check_callmethod_exception(JNIEnv *env, const char* msg) {
    if (env->ExceptionCheck()) {
      env->ExceptionClear();
      env->ThrowNew(env->FindClass("java/lang/RuntimeException"), msg);
      return;
    }
  }

static Context *getObject(JNIEnv *env, jobject self) {
  jclass cls = env->GetObjectClass(self);
  if (!cls)
    env->FatalError("GetObjectClass failed");

  jfieldID nativeObjectPointerID = env->GetFieldID(cls, "nativeObjectPointer", "J");
  if (!nativeObjectPointerID)
    env->FatalError("GetFieldID failed");

  jlong nativeObjectPointer = env->GetLongField(self, nativeObjectPointerID);
  return reinterpret_cast<Context *>(nativeObjectPointer);
}
extern "C" JNIEXPORT jlong JNICALL Java_com_kungfu_Context_nativeNew(JNIEnv *, jobject, jlong p) { return p; }

extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Context_add_1account(JNIEnv *env, jobject self, jstring source,
                                                                       jstring account, jdouble cashLimit) {
  Context *_self = getObject(env, self);
  const char *c_source = env->GetStringUTFChars(source, NULL);
  string s_source(c_source);
  env->ReleaseStringUTFChars(source, c_source);
  const char *c_account = env->GetStringUTFChars(account, NULL);
  string s_account(c_account);
  env->ReleaseStringUTFChars(account, c_account);
  _self->add_account(s_source, s_account, static_cast<double>(cashLimit));
}

extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Context_subscribe(JNIEnv *env, jobject self, jstring source,
                                                                    jobject jList, jstring exchangeIds) {
  // retrieve the java.util.List interface class
  jclass cList = env->FindClass("java/util/List");

  // retrieve the size and the get method
  jmethodID mSize = env->GetMethodID(cList, "size", "()I");
  jmethodID mGet = env->GetMethodID(cList, "get", "(I)Ljava/lang/Object;");

  if (mSize == NULL || mGet == NULL)
    return;

  // get the size of the list
  jint size = env->CallIntMethod(jList, mSize);
  check_callmethod_exception(env, "Java_com_kungfu_Context_subscribe: CallIntMethod Exception");
  std::vector<std::string> sVector;

  // walk through and fill the vector
  for (jint i = 0; i < size; i++) {
    jstring strObj = (jstring)env->CallObjectMethod(jList, mGet, i);
    check_callmethod_exception(env, "Java_com_kungfu_Context_subscribe: CallObjectMethod Exception");
    const char *chr = env->GetStringUTFChars(strObj, NULL);
    sVector.push_back(chr);
    env->ReleaseStringUTFChars(strObj, chr);
  }

  const char *c_source = env->GetStringUTFChars(source, NULL);
  string s_source(c_source);
  env->ReleaseStringUTFChars(source, c_source);
  const char *c_exchange = env->GetStringUTFChars(exchangeIds, NULL);
  string s_exchange(c_exchange);
  env->ReleaseStringUTFChars(exchangeIds, c_exchange);

  Context *_self = getObject(env, self);
  _self->subscribe(s_source, sVector, s_exchange);
}

extern "C" JNIEXPORT jlong JNICALL Java_com_kungfu_Context_insert_1order(
    JNIEnv *env, jobject self, jstring instrument_id, jstring exchange_id, jstring account, jdouble limit_price,
    jlong volume, jobject obj_type, jobject obj_side, jobject obj_offset, jobject obj_hedge_flag) {
  std::string str_instrument_id = getStringFromJstring(env, instrument_id);
  std::string str_exchange_id = getStringFromJstring(env, exchange_id);
  std::string str_account = getStringFromJstring(env, account);
  double d_limit_price = (double)limit_price;
  int64_t i64_volume = (int64_t)volume;

  jclass clazz_pricetype = env->FindClass("com/kungfu/PriceType");
  jmethodID j_method_pricetype_ordinal = env->GetMethodID(clazz_pricetype, "ordinal", "()I");
  kungfu::longfist::enums::PriceType price_type =
      (kungfu::longfist::enums::PriceType)(env->CallIntMethod(obj_type, j_method_pricetype_ordinal));
  check_callmethod_exception(env, "Java_com_kungfu_Context_insert_1order: CallIntMethod price_type Exception");

  jclass clazz_side = env->FindClass("com/kungfu/Side");
  jmethodID j_method_side_ordinal = env->GetMethodID(clazz_side, "ordinal", "()I");
  kungfu::longfist::enums::Side side =
      (kungfu::longfist::enums::Side)(env->CallIntMethod(obj_side, j_method_side_ordinal));
  check_callmethod_exception(env, "Java_com_kungfu_Context_subscribe: CallIntMethod side Exception");

  jclass clazz_offset = env->FindClass("com/kungfu/Offset");
  jmethodID j_method_offset_ordinal = env->GetMethodID(clazz_offset, "ordinal", "()I");
  kungfu::longfist::enums::Offset offset =
      (kungfu::longfist::enums::Offset)(env->CallIntMethod(obj_offset, j_method_offset_ordinal));
  check_callmethod_exception(env, "Java_com_kungfu_Context_subscribe: CallIntMethod Offset Exception");

  jclass clazz_hedgeFlag = env->FindClass("com/kungfu/HedgeFlag");
  jmethodID j_method_hedge_ordinal = env->GetMethodID(clazz_hedgeFlag, "ordinal", "()I");
  kungfu::longfist::enums::HedgeFlag hedge =
      (kungfu::longfist::enums::HedgeFlag)(env->CallIntMethod(obj_hedge_flag, j_method_hedge_ordinal));
  check_callmethod_exception(env, "Java_com_kungfu_Context_subscribe: CallIntMethod hedge Exception");

  Context *_self = getObject(env, self);
  uint64_t oid = _self->insert_order(str_instrument_id, str_exchange_id, str_account, d_limit_price, i64_volume,
                                     price_type, side, offset, hedge);
  return (jlong)oid;
}

extern "C" JNIEXPORT jlong JNICALL Java_com_kungfu_Context_cancel_1order(JNIEnv *env, jobject self, jlong order_id) {
  Context *_self = getObject(env, self);
  uint64_t oid = _self->cancel_order((uint64_t)order_id);
  return (jlong)oid;
}

extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Context_req_1history_1order(JNIEnv *env, jobject self,
                                                                              jstring jaccount) {
  std::string account = getStringFromJstring(env, jaccount);
  Context *_self = getObject(env, self);
  _self->req_history_order(account);
}

extern "C" JNIEXPORT void JNICALL Java_com_kungfu_Context_req_1history_1trade(JNIEnv *env, jobject self,
                                                                              jstring jaccount) {
  std::string account = getStringFromJstring(env, jaccount);
  Context *_self = getObject(env, self);
  _self->req_history_trade(account);
}
