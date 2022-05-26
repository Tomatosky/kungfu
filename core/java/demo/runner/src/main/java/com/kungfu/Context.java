package com.kungfu;

import java.util.ArrayList;

public class Context {
    static {
        System.loadLibrary("context");
    }
    private long nativeObjectPointer;

    public Context(long context_ptr) {
        nativeObjectPointer = nativeNew(context_ptr);
    }
    private native long nativeNew(long ptr);

    public native void add_account(String source, String account, double cashLimit);

    public native void subscribe(String source, ArrayList<String> instrumentIds, String exchangeIds);

    public native long insert_order(String instrument_id, String exchange_id,
                                      String account, double limit_price, long volume, PriceType type,
                 Side side, Offset offset, HedgeFlag hedge_flag);

    public native long cancel_order(long orderId);

    public native void req_history_order(String source, String account);

    public native void req_history_trade(String source, String account);

    public native long make_order(String instrument_id, String exchange_id, String source,
                                    String account, double limit_price, long volume, PriceType type,
                                    Side side, Offset offset, HedgeFlag hedge_flag);


}
