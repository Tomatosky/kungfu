package com.kungfu;

public enum Side {
    Buy(0),                      //买入
    Sell(1),                     //卖出
    Lock(2),                     //锁仓
    Unlock(3),                   //解锁
    Exec(4),                     //行权
    Drop(5),                     //放弃行权
    Purchase(6),                 //申购
    Redemption(7),               //赎回
    Split(8),                    //拆分
    Merge(9),                    //合并
    MarginTrade(10),              //融资买入
    ShortSell(11),                //融券卖出
    RepayMargin(12),              //卖券还款
    RepayStock(13),               //买券还券
    CashRepayMargin(14),          //现金还款
    StockRepayStock(15),          //现券还券
    SurplusStockTransfer(16),     //余券划转
    GuaranteeStockTransferIn(17), //担保品转入
    GuaranteeStockTransferOut(18), //担保品转出
    Unknown(127);
    public int code;
    private Side(int code){
        this.code = code;
    }
}
