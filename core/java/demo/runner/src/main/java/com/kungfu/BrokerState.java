package com.kungfu;

public enum BrokerState {
    Pending(0),
    Idle(1),
    DisConnected(2),
    Connected(3),
    LoggedIn(4),
    LoginFailed(5),
    Ready(100);

    private final int value;

    BrokerState(int value) {
        this.value=value;
    }

    public int getValue() {
        return value;
    }
}
