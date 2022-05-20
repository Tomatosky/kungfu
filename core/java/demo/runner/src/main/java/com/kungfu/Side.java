package com.kungfu;

public enum Side {
    Buy(1),                      //买入
    Sell(2),                     //卖出
    Lock(3),                     //锁仓
    Unlock(4),                   //解锁
    Exec(5),                     //行权
    Drop(6),                     //放弃行权
    Purchase(7),                 //申购
    Redemption(8),               //赎回
    Split(9),                    //拆分
    Merge(10),                    //合并
    MarginTrade(11),              //融资买入
    ShortSell(12),                //融券卖出
    RepayMargin(13),              //卖券还款
    RepayStock(14),               //买券还券
    CashRepayMargin(15),          //现金还款
    StockRepayStock(16),          //现券还券
    SurplusStockTransfer(17),     //余券划转
    GuaranteeStockTransferIn(18), //担保品转入
    GuaranteeStockTransferOut(19), //担保品转出
    Unknown(127);
    public int code;
    private Side(int code){
        this.code = code;
    }
}
