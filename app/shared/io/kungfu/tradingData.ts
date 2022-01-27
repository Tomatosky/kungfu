import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { watcher, dealGatewayStates } from '__io/kungfu/watcher';

import { setTimerPromiseTask } from '__gUtils/busiUtils';

const deamonDataSubject: any = new Subject();
const appDataSubject: any = new Subject();

(() => {
  if (watcher.noWatcher) {
    return;
  }

  if (process.env.APP_TYPE !== 'daemon') {
    return;
  }

  setTimerPromiseTask(async () => {
    deamonDataSubject.next({
      globalPipeData: {
        daemonIsLive: watcher.isLive(),
      },
    });

    return true;
  }, 1000);
})();

(() => {
  if (watcher.noWatcher) {
    return;
  }

  if (process.env.RENDERER_TYPE !== 'app') {
    if (process.env.APP_TYPE !== 'cli') {
      return;
    }
  }

  setTimerPromiseTask(() => {
    return new Promise((resolve) => {
      const ledgerData = watcher.ledger;

      appDataSubject.next({
        instruments: ledgerData.instruments,
        gatewayStates: dealGatewayStates(watcher.appStates),
      });

      resolve(true);
    });
  }, 1000);
})();

export const buildKungfuGlobalDataPipe = () => {
  return deamonDataSubject.pipe(
    map((data: any) => {
      return data.globalPipeData;
    }),
  );
};

export const buildKungfuDataByAppPipe = () => {
  return appDataSubject;
};

export const buildGatewayStatePipe = () => {
  return appDataSubject.pipe(
    map((data: any) => {
      return {
        gatewayStates: data.gatewayStates,
      };
    }),
  );
};
