package com.kungfu;

public class Trade {
    long trade_id;                            //成交ID

    long order_id;        //订单ID
    long parent_order_id; //母订单ID

    long trade_time;                        //成交时间
    String trading_day; //交易日

    String instrument_id; //合约ID
    String exchange_id;     //交易所ID
    String source_id;         //柜台ID
    String account_id;       //账号ID
    String client_id;         // Client ID


    InstrumentType instrument_type; //合约类型

    Side side;            //买卖方向
    Offset offset;        //开平方向
    HedgeFlag hedge_flag; //投机套保标识

    double price;               //成交价格
    long volume;             //成交量
    long close_today_volume; //平今日仓量期货)

    double tax;       //税
    double commission; //手续费

    public Trade(long trade_id, long order_id, long parent_order_id, long trade_time, String trading_day, String instrument_id, String exchange_id, String source_id, String account_id, String client_id, InstrumentType instrument_type, Side side, Offset offset, HedgeFlag hedge_flag, double price, long volume, long close_today_volume, double tax, double commission) {
        this.trade_id = trade_id;
        this.order_id = order_id;
        this.parent_order_id = parent_order_id;
        this.trade_time = trade_time;
        this.trading_day = trading_day;
        this.instrument_id = instrument_id;
        this.exchange_id = exchange_id;
        this.source_id = source_id;
        this.account_id = account_id;
        this.client_id = client_id;
        this.instrument_type = instrument_type;
        this.side = side;
        this.offset = offset;
        this.hedge_flag = hedge_flag;
        this.price = price;
        this.volume = volume;
        this.close_today_volume = close_today_volume;
        this.tax = tax;
        this.commission = commission;
    }

    public long getTrade_id() {
        return trade_id;
    }

    public void setTrade_id(long trade_id) {
        this.trade_id = trade_id;
    }

    public long getOrder_id() {
        return order_id;
    }

    public void setOrder_id(long order_id) {
        this.order_id = order_id;
    }

    public long getParent_order_id() {
        return parent_order_id;
    }

    public void setParent_order_id(long parent_order_id) {
        this.parent_order_id = parent_order_id;
    }

    public long getTrade_time() {
        return trade_time;
    }

    public void setTrade_time(long trade_time) {
        this.trade_time = trade_time;
    }

    public String getTrading_day() {
        return trading_day;
    }

    public void setTrading_day(String trading_day) {
        this.trading_day = trading_day;
    }

    public String getInstrument_id() {
        return instrument_id;
    }

    public void setInstrument_id(String instrument_id) {
        this.instrument_id = instrument_id;
    }

    public String getExchange_id() {
        return exchange_id;
    }

    public void setExchange_id(String exchange_id) {
        this.exchange_id = exchange_id;
    }

    public String getSource_id() {
        return source_id;
    }

    public void setSource_id(String source_id) {
        this.source_id = source_id;
    }

    public String getAccount_id() {
        return account_id;
    }

    public void setAccount_id(String account_id) {
        this.account_id = account_id;
    }

    public String getClient_id() {
        return client_id;
    }

    public void setClient_id(String client_id) {
        this.client_id = client_id;
    }

    public InstrumentType getInstrument_type() {
        return instrument_type;
    }

    public void setInstrument_type(InstrumentType instrument_type) {
        this.instrument_type = instrument_type;
    }

    public Side getSide() {
        return side;
    }

    public void setSide(Side side) {
        this.side = side;
    }

    public Offset getOffset() {
        return offset;
    }

    public void setOffset(Offset offset) {
        this.offset = offset;
    }

    public HedgeFlag getHedge_flag() {
        return hedge_flag;
    }

    public void setHedge_flag(HedgeFlag hedge_flag) {
        this.hedge_flag = hedge_flag;
    }

    public double getPrice() {
        return price;
    }

    public void setPrice(double price) {
        this.price = price;
    }

    public long getVolume() {
        return volume;
    }

    public void setVolume(long volume) {
        this.volume = volume;
    }

    public long getClose_today_volume() {
        return close_today_volume;
    }

    public void setClose_today_volume(long close_today_volume) {
        this.close_today_volume = close_today_volume;
    }

    public double getTax() {
        return tax;
    }

    public void setTax(double tax) {
        this.tax = tax;
    }

    public double getCommission() {
        return commission;
    }

    public void setCommission(double commission) {
        this.commission = commission;
    }
}
