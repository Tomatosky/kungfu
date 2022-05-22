package com.kungfu;

public class Runner {

    static {
        System.loadLibrary("kungfu");
        System.loadLibrary("runner");
    }

    public Runner() {}

    public native void init(String group, String name);

    public native void setup();

    public native void step();

    public native void run();

    public void pre_start(Context context) {}

    public void post_start(Context context) {}

    public void on_quote(Context context, Quote quote) {}

    public void on_order(Context context, Order order) {}

    public void on_trade(Context context, Trade trade) {}

    public void on_history_order(Context context, HistoryOrder history_order) {}

    public void on_history_trade(Context context, HistoryTrade history_trade) {}

    public void on_deregister(Context context, Deregister deregister) {}

    public void on_broker_state_change(Context context, BrokerStateUpdate brokerStateUpdate, Location location) {};
}
