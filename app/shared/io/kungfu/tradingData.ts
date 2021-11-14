import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { 
    watcher,
    dealGatewayStates, 
    transformTradingItemListToData, 
    transformAssetItemListToData,
    dealPos,
    dealAsset,
} from '__io/kungfu/watcher';

import { setTimerPromiseTask, ensureLedgerData } from '__gUtils/busiUtils';


const deamonDataSubject: any = new Subject();
const appDataSubject: any = new Subject();


(() => {

    if (watcher.noWatcher) {
        return;
    };
    
    if (process.env.APP_TYPE !== 'daemon') {
        return
    };

    setTimerPromiseTask(async () => {
            const ledgerData = watcher.ledger;
            const positions = ensureLedgerData(ledgerData.Position).map((item: PosOriginData) => dealPos(item));
            const positionsByTicker = transformTradingItemListToData(positions, 'ticker');
            const assets = ensureLedgerData(ledgerData.Asset).map((item: AssetOriginData) => dealAsset(item));
            const quotes = ensureLedgerData(ledgerData.Quote);

            const accountTradingDataPipeData = {
                positions: transformTradingItemListToData(positions, 'account'),
                positionsByTicker,
            }
    
            deamonDataSubject.next({
                accountTradingDataPipeData,
                quotes,
                globalPipeData: {
                    daemonIsLive: watcher.isLive(),
                }
            })

            return true

    }, 1000)

})();

(() => {

    if (watcher.noWatcher) {
        return;
    }

    if (process.env.RENDERER_TYPE !== 'app') {
        if (process.env.APP_TYPE !== 'cli') {
            return;
        };
    }

    setTimerPromiseTask(() => {
        return new Promise(resolve => {
            const ledgerData = watcher.ledger;

            appDataSubject.next({
                instruments: ledgerData.instruments,
                gatewayStates: dealGatewayStates(watcher.appStates)
            })

            resolve(true)
        })
       
    }, 1000)

})();


export const buildMarketDataPipe = () => {
    return deamonDataSubject.pipe(
        map((data: any) => {
            return data.quotes
        })
    )
}

export const buildKungfuGlobalDataPipe = () => {
    return deamonDataSubject.pipe(
        map((data: any) => {
            return data.globalPipeData
        })
    )
}

export const buildKungfuDataByAppPipe = () => {
    return appDataSubject
}

export const buildGatewayStatePipe = () => {
    return appDataSubject.pipe(
        map((data: any) => {
            return {
                gatewayStates: data.gatewayStates
            }
        })
    )
}

export const buildInstrumentsDataPipe = () => {
    return appDataSubject.pipe(
        map((data: any) => {
            return {
                instruments: data.instruments
            }
        })
    )
}

