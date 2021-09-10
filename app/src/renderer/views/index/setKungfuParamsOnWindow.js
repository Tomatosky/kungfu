
//ELECTRON_RUN_AS_NODE 应用于通过process.execPath开启任务
process.env.ELECTRON_RUN_AS_NODE = true;
process.env.RENDERER_TYPE = 'app';
process.env.RELOAD_AFTER_CRASHED = process.argv.includes("reloadAfterCrashed") ? 1 : 0;


// debug export
const { kungfu, longfist, kungfuConfigStore, history, getKungfuDataByDateRange, commissionStore } = require('__io/kungfu/kungfuUtils')
const { watcher, startGetKungfuWatcherStep } = require('__io/kungfu/watcher');
const { KF_RUNTIME_DIR } = require("__gConfig/pathConfig");
const { _pm2 } = require("__gUtils/processUtils");

window.watcher = watcher;
window.longfist = longfist;
window.kungfu = kungfu;
window.kungfuConfigStore = kungfuConfigStore;
window.commissionStore = commissionStore;
window.kungfuHistory = history;
window.KF_RUNTIME_DIR = KF_RUNTIME_DIR;
window.ELEC_WIN_MAP = new Set();
window.pm2 = _pm2;

console.log("RELOAD_AFTER_CRASHED", process.env.RELOAD_AFTER_CRASHED)

//date: YYYY-MM-DD
//dataType: 1 tradingday, 0 normalday
window.checkIfDiffTradeWithSameOrderId = async (date, dateType = 0) => {
    const kungfuData = await getKungfuDataByDateRange(date, dateType);
    const hist_trades = kungfuData.Trade.sort("trade_time");

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

window.checkStepOverhead = () => {
    console.time("step");
    watcher.step();
    console.timeEnd("step");
}

window.crashTheWatcher = () => {
    const id = [process.env.APP_TYPE, process.env.RENDERER_TYPE].join('');
    return kungfu.watcher(KF_RUNTIME_DIR, kungfu.formatStringToHashHex(id), true, false);
}

startGetKungfuWatcherStep();


