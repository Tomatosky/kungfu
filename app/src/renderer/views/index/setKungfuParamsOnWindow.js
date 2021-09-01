
process.env.ELECTRON_RUN_AS_NODE = true;
process.env.RENDERER_TYPE = 'app';



// debug export
const { kungfu, longfist, kungfuConfigStore, history, getKungfuDataByDateRange } = require('__io/kungfu/kungfuUtils')
const { watcher, startGetKungfuWatcherStep } = require('__io/kungfu/watcher');

window.watcher = watcher;
window.longfist = longfist;
window.kungfu = kungfu;
window.kungfuConfigStore = kungfuConfigStore;
window.kungfuHistory = history;


//date: YYYY-MM-DD
//dataType: 1 tradingday, 0 normalday
window.checkIfDiffTradeWithSameOrderId = async (date, dateType = 0) => {
    const kungfuData = await getKungfuDataByDateRange(date, dateType);
    const hist_trades = kungfuData.Trade;

    let dict_by_order_id = {};
    let error_pairs = [];

    hist_trades.forEach(item => {
        const order_id = item.order_id.toString();
        if (!dict_by_order_id[order_id]) {
            dict_by_order_id[order_id] = [];
        }

        dict_by_order_id[order_id].push(item);
    })


    Object.values(dict_by_order_id || {}).forEach(tradeList => {
        let tmp_trade = null;
        let error_pair = [];

        for (let i = 0; i < tradeList.length; i++) {
            const trade = tradeList[i];
            if (!tmp_trade) {
                tmp_trade = trade;
                continue;
            };

            if (trade.instrument_id !== tmp_trade.instrument_id) {
                error_pair = [
                    trade,
                    tmp_trade
                ]
                break;
            }            
        }

        if (error_pair.length) {
            error_pairs.push(error_pair)
        }
    })

    return error_pairs;
}

startGetKungfuWatcherStep();

