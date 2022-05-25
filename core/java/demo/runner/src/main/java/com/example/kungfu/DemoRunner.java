package com.example.kungfu;

import com.kungfu.*;

import java.util.ArrayList;

public class DemoRunner extends Runner {
    static long orderid = 0L;
    static long oid = 0L;

    public void pre_start(Context context){
        System.out.println("pre_start");
        context.add_account("sim", "1", 100000.0);
        ArrayList<String> instrumentIds = new ArrayList<String>();
        instrumentIds.add("600000");
        context.subscribe("sim", instrumentIds, "SSE");
    }

    public void post_start(Context context){
        System.out.println("post_start");
    }


    public void on_quote(Context context, Quote quote){
        System.out.println("on_quote: " + quote.getInstrument_id()+ " " + quote.getLast_price());
        if(orderid == 0L){
            try {
                orderid = context.insert_order("600000", "SSE", "12", 200, 500, PriceType.Any, Side.Buy, Offset.Open, HedgeFlag.Hedge);
            }catch(Exception e)
            {
                System.out.println(".........");
                System.out.println(e.getMessage());
            }
        }
        else{
            if(oid == 0L) {
                oid = context.cancel_order(orderid);
                System.out.println("on_quote cancel_order: " + oid);
            }
        }
        System.out.println("on_quote insert_order: " + orderid);
    }

    public void on_trade(Context context, Trade trade) {
        System.out.println("on_trade: " + trade.getInstrument_id() + " " + trade.getPrice());
    }

    public void on_order(Context context, Order order){
        System.out.println("on_order: " + order.instrument_id + " " + order.limit_price);
    }
    public void on_history_order(Context context, HistoryOrder history_order){
        System.out.println("on_history_order: order_id " + history_order.getOrder_id()+ " account_id " + history_order.getAccount_id()+ " instrument_id " + history_order.getInstrument_id());
    }


    public void on_history_trade(Context context, HistoryTrade history_trade){
        System.out.println("on_history_trade: order_id " + history_trade.getOrder_id() + " account_id " + history_trade.getAccount_id() + " instrument_id " + history_trade.getInstrument_id());
    }

    public void on_deregister(Context context, Deregister deregister){
        System.out.println("on_history_trade: order_id " + deregister.getName());
    }

    public static void main(String[] args) throws InterruptedException {
        Thread thread = new Thread(() -> {
            DemoRunner demoRunner = new DemoRunner();
            demoRunner.init("java", "test");
            System.out.println("demo runner init");
            
            demoRunner.setup();
            while (!Thread.currentThread().isInterrupted()){
                demoRunner.step();
            }
            
//             demoRunner.run();
        });
        thread.start();
        thread.join();
    }
}
