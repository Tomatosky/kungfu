package com.kungfu;

public enum OrderStatus {
    Unknown,
    Submitted,
    Pending,
    Cancelled,
    Error,
    Filled,
    PartialFilledNotActive,
    PartialFilledActive,
    Lost
}
