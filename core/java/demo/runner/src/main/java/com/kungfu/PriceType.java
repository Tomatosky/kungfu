package com.kungfu;

public enum PriceType {
    Limit, //限价,证券通用
    Any, //市价，证券通用，对于股票上海为最优五档剩余撤销，深圳为即时成交剩余撤销，建议客户采用
    FakBest5,    //上海深圳最优五档即时成交剩余撤销，不需要报价
    ForwardBest, //深圳本方方最优价格申报, 不需要报价
    ReverseBest, //上海最优五档即时成交剩余转限价, 深圳对手方最优价格申报，不需要报价
    Fak,         //深圳即时成交剩余撤销，不需要报价
    Fok,         //深圳市价全额成交或者撤销，不需要报价
    UnKnown
}
