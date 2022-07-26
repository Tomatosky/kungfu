package com.kungfu;


import java.util.Arrays;

public class Quote {
        String source_id;         //柜台ID
        String trading_day;            //交易日

        long data_time; //数据生成时间

        String instrument_id; //合约ID
        String exchange_id;    //交易所ID

        InstrumentType instrument_type; //合约类型

        double pre_close_price;      //昨收价
        double pre_settlement_price; //昨结价

        double last_price; //最新价
        long volume;    //数量
        double turnover;   //成交金额

        double pre_open_interest; //昨持仓量
        double open_interest;     //持仓量

        double open_price; //今开盘
        double high_price; //最高价
        double low_price;  //最低价

        double upper_limit_price; //涨停板价
        double lower_limit_price; //跌停板价

        double close_price;      //收盘价
        double settlement_price; //结算价
        double iopv;             //基金实时参考净值

        double[] bid_price;
        double[] ask_price;
        long[] bid_volume;
        long[] ask_volume;

        public Quote(String source_id, String trading_day, long data_time, String instrument_id, String exchange_id,
                     InstrumentType instrument_type, double pre_close_price, double pre_settlement_price, double last_price, long volume, double turnover, double pre_open_interest,
                     double open_interest, double open_price, double high_price, double low_price, double upper_limit_price, double lower_limit_price, double close_price,
                     double settlement_price, double iopv, double[] bid_price, double[] ask_price, long[] bid_volume, long[] ask_volume) {
                this.source_id = source_id;
                this.trading_day = trading_day;
                this.data_time = data_time;
                this.instrument_id = instrument_id;
                this.exchange_id = exchange_id;
                this.instrument_type = instrument_type;
                this.pre_close_price = pre_close_price;
                this.pre_settlement_price = pre_settlement_price;
                this.last_price = last_price;
                this.volume = volume;
                this.turnover = turnover;
                this.pre_open_interest = pre_open_interest;
                this.open_interest = open_interest;
                this.open_price = open_price;
                this.high_price = high_price;
                this.low_price = low_price;
                this.upper_limit_price = upper_limit_price;
                this.lower_limit_price = lower_limit_price;
                this.close_price = close_price;
                this.settlement_price = settlement_price;
                this.iopv = iopv;
                this.bid_price = bid_price;
                this.ask_price = ask_price;
                this.bid_volume = bid_volume;
                this.ask_volume = ask_volume;
        }

        public String getSource_id() {
                return source_id;
        }

        public void setSource_id(String source_id) {
                this.source_id = source_id;
        }

        public String getTrading_day() {
                return trading_day;
        }

        public void setTrading_day(String trading_day) {
                this.trading_day = trading_day;
        }

        public long getData_time() {
                return data_time;
        }

        public void setData_time(long data_time) {
                this.data_time = data_time;
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

        public InstrumentType getInstrument_type() {
                return instrument_type;
        }

        public void setInstrument_type(InstrumentType instrument_type) {
                this.instrument_type = instrument_type;
        }

        public double getPre_close_price() {
                return pre_close_price;
        }

        public void setPre_close_price(double pre_close_price) {
                this.pre_close_price = pre_close_price;
        }

        public double getPre_settlement_price() {
                return pre_settlement_price;
        }

        public void setPre_settlement_price(double pre_settlement_price) {
                this.pre_settlement_price = pre_settlement_price;
        }

        public double getLast_price() {
                return last_price;
        }

        public void setLast_price(double last_price) {
                this.last_price = last_price;
        }

        public long getVolume() {
                return volume;
        }

        public void setVolume(long volume) {
                this.volume = volume;
        }

        public double getTurnover() {
                return turnover;
        }

        public void setTurnover(double turnover) {
                this.turnover = turnover;
        }

        public double getPre_open_interest() {
                return pre_open_interest;
        }

        public void setPre_open_interest(double pre_open_interest) {
                this.pre_open_interest = pre_open_interest;
        }

        public double getOpen_interest() {
                return open_interest;
        }

        public void setOpen_interest(double open_interest) {
                this.open_interest = open_interest;
        }

        public double getOpen_price() {
                return open_price;
        }

        public void setOpen_price(double open_price) {
                this.open_price = open_price;
        }

        public double getHigh_price() {
                return high_price;
        }

        public void setHigh_price(double high_price) {
                this.high_price = high_price;
        }

        public double getLow_price() {
                return low_price;
        }

        public void setLow_price(double low_price) {
                this.low_price = low_price;
        }

        public double getUpper_limit_price() {
                return upper_limit_price;
        }

        public void setUpper_limit_price(double upper_limit_price) {
                this.upper_limit_price = upper_limit_price;
        }

        public double getLower_limit_price() {
                return lower_limit_price;
        }

        public void setLower_limit_price(double lower_limit_price) {
                this.lower_limit_price = lower_limit_price;
        }

        public double getClose_price() {
                return close_price;
        }

        public void setClose_price(double close_price) {
                this.close_price = close_price;
        }

        public double getSettlement_price() {
                return settlement_price;
        }

        public void setSettlement_price(double settlement_price) {
                this.settlement_price = settlement_price;
        }

        public double getIopv() {
                return iopv;
        }

        public void setIopv(double iopv) {
                this.iopv = iopv;
        }

        public double[] getBid_price() {
                return bid_price;
        }

        public void setBid_price(double[] bid_price) {
                this.bid_price = bid_price;
        }

        public double[] getAsk_price() {
                return ask_price;
        }

        public void setAsk_price(double[] ask_price) {
                this.ask_price = ask_price;
        }

        public long[] getBid_volume() {
                return bid_volume;
        }

        public void setBid_volume(long[] bid_volume) {
                this.bid_volume = bid_volume;
        }

        public long[] getAsk_volume() {
                return ask_volume;
        }

        public void setAsk_volume(long[] ask_volume) {
                this.ask_volume = ask_volume;
        }

        @Override
        public String toString() {
                return "Quote{" +
                        "source_id='" + source_id + '\'' +
                        ", trading_day='" + trading_day + '\'' +
                        ", data_time=" + data_time +
                        ", instrument_id='" + instrument_id + '\'' +
                        ", exchange_id='" + exchange_id + '\'' +
                        ", instrument_type=" + instrument_type +
                        ", pre_close_price=" + pre_close_price +
                        ", pre_settlement_price=" + pre_settlement_price +
                        ", last_price=" + last_price +
                        ", volume=" + volume +
                        ", turnover=" + turnover +
                        ", pre_open_interest=" + pre_open_interest +
                        ", open_interest=" + open_interest +
                        ", open_price=" + open_price +
                        ", high_price=" + high_price +
                        ", low_price=" + low_price +
                        ", upper_limit_price=" + upper_limit_price +
                        ", lower_limit_price=" + lower_limit_price +
                        ", close_price=" + close_price +
                        ", settlement_price=" + settlement_price +
                        ", iopv=" + iopv +
                        ", bid_price=" + Arrays.toString(bid_price) +
                        ", ask_price=" + Arrays.toString(ask_price) +
                        ", bid_volume=" + Arrays.toString(bid_volume) +
                        ", ask_volume=" + Arrays.toString(ask_volume) +
                        '}';
        }
}