package com.kungfu;

public class BrokerStateUpdate {
    public BrokerState getState() {
        return state;
    }

    public void setState(BrokerState state) {
        this.state = state;
    }

    BrokerState state;

    public BrokerStateUpdate(BrokerState state) {
        this.state = state;
    }
}
