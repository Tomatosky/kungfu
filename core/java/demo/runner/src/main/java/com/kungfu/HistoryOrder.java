package com.kungfu;

public class HistoryOrder {
    long parent_id;                                   //母订单ID
    long order_id;                                    //订单ID

    long insert_time; //订单写入时间
    long update_time; //订单更新时间

    String trading_day; //交易日

    String instrument_id; //合约ID
    String exchange_id;     //交易所ID

    String source_id;   //柜台ID
    String account_id; //账号ID
//    String client_id;   // Client ID

    boolean is_last;
    InstrumentType instrument_type; //合约类型

    double limit_price;  //价格
    double frozen_price; //冻结价格，市价单冻结价格为0

    long volume;        //数量
    long volume_traded; //成交数量
    long volume_left;   //剩余数量

    double tax;        //税
    double commission; //手续费

    OrderStatus status; //订单状态

    int error_id;                             //错误ID
    String error_msg; //错误信息

    Side side;                        //买卖方向
    Offset offset;                    //开平方向
    HedgeFlag hedge_flag;             //投机套保标识
    PriceType price_type;             //价格类型
    VolumeCondition volume_condition; //成交量类型

    public HistoryOrder(long parent_id, long order_id, long insert_time, long update_time, String trading_day, String instrument_id, String exchange_id, String source_id, String account_id, boolean is_last, InstrumentType instrument_type, double limit_price, double frozen_price, long volume, long volume_traded, long volume_left, double tax, double commission, OrderStatus status, int error_id, String error_msg, Side side, Offset offset, HedgeFlag hedge_flag, PriceType price_type, VolumeCondition volume_condition, TimeCondition time_condition) {
        this.parent_id = parent_id;
        this.order_id = order_id;
        this.insert_time = insert_time;
        this.update_time = update_time;
        this.trading_day = trading_day;
        this.instrument_id = instrument_id;
        this.exchange_id = exchange_id;
        this.source_id = source_id;
        this.account_id = account_id;
        this.is_last = is_last;
        this.instrument_type = instrument_type;
        this.limit_price = limit_price;
        this.frozen_price = frozen_price;
        this.volume = volume;
        this.volume_traded = volume_traded;
        this.volume_left = volume_left;
        this.tax = tax;
        this.commission = commission;
        this.status = status;
        this.error_id = error_id;
        this.error_msg = error_msg;
        this.side = side;
        this.offset = offset;
        this.hedge_flag = hedge_flag;
        this.price_type = price_type;
        this.volume_condition = volume_condition;
        this.time_condition = time_condition;
    }

    TimeCondition time_condition;      //成交时间类型

    public long getParent_id() {
        return parent_id;
    }

    public void setParent_id(long parent_id) {
        this.parent_id = parent_id;
    }

    public long getOrder_id() {
        return order_id;
    }

    public void setOrder_id(long order_id) {
        this.order_id = order_id;
    }

    public long getInsert_time() {
        return insert_time;
    }

    public void setInsert_time(long insert_time) {
        this.insert_time = insert_time;
    }

    public long getUpdate_time() {
        return update_time;
    }

    public void setUpdate_time(long update_time) {
        this.update_time = update_time;
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

    public boolean isIs_last() {
        return is_last;
    }

    public void setIs_last(boolean is_last) {
        this.is_last = is_last;
    }

    public InstrumentType getInstrument_type() {
        return instrument_type;
    }

    public void setInstrument_type(InstrumentType instrument_type) {
        this.instrument_type = instrument_type;
    }

    public double getLimit_price() {
        return limit_price;
    }

    public void setLimit_price(double limit_price) {
        this.limit_price = limit_price;
    }

    public double getFrozen_price() {
        return frozen_price;
    }

    public void setFrozen_price(double frozen_price) {
        this.frozen_price = frozen_price;
    }

    public long getVolume() {
        return volume;
    }

    public void setVolume(long volume) {
        this.volume = volume;
    }

    public long getVolume_traded() {
        return volume_traded;
    }

    public void setVolume_traded(long volume_traded) {
        this.volume_traded = volume_traded;
    }

    public long getVolume_left() {
        return volume_left;
    }

    public void setVolume_left(long volume_left) {
        this.volume_left = volume_left;
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

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public int getError_id() {
        return error_id;
    }

    public void setError_id(int error_id) {
        this.error_id = error_id;
    }

    public String getError_msg() {
        return error_msg;
    }

    public void setError_msg(String error_msg) {
        this.error_msg = error_msg;
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

    public PriceType getPrice_type() {
        return price_type;
    }

    public void setPrice_type(PriceType price_type) {
        this.price_type = price_type;
    }

    public VolumeCondition getVolume_condition() {
        return volume_condition;
    }

    public void setVolume_condition(VolumeCondition volume_condition) {
        this.volume_condition = volume_condition;
    }

    public TimeCondition getTime_condition() {
        return time_condition;
    }

    public void setTime_condition(TimeCondition time_condition) {
        this.time_condition = time_condition;
    }

    @Override
    public String toString() {
        return "HistoryOrder{" +
                "parent_id=" + parent_id +
                ", order_id=" + order_id +
                ", insert_time=" + insert_time +
                ", update_time=" + update_time +
                ", trading_day='" + trading_day + '\'' +
                ", instrument_id='" + instrument_id + '\'' +
                ", exchange_id='" + exchange_id + '\'' +
                ", source_id='" + source_id + '\'' +
                ", account_id='" + account_id + '\'' +
                ", is_last=" + is_last +
                ", instrument_type=" + instrument_type +
                ", limit_price=" + limit_price +
                ", frozen_price=" + frozen_price +
                ", volume=" + volume +
                ", volume_traded=" + volume_traded +
                ", volume_left=" + volume_left +
                ", tax=" + tax +
                ", commission=" + commission +
                ", status=" + status +
                ", error_id=" + error_id +
                ", error_msg='" + error_msg + '\'' +
                ", side=" + side +
                ", offset=" + offset +
                ", hedge_flag=" + hedge_flag +
                ", price_type=" + price_type +
                ", volume_condition=" + volume_condition +
                ", time_condition=" + time_condition +
                '}';
    }
}
