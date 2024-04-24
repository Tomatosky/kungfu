import './setEnv';
import './injectGlobal';
import './injectWindow';
import { createApp } from 'vue';
import App from '@kungfu-trader/kungfu-app/src/renderer/pages/index/App.vue';
import router from '@kungfu-trader/kungfu-app/src/renderer/pages/index/router';
import store from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store';
import {
  Layout,
  Tabs,
  Button,
  Menu,
  Card,
  Input,
  Table,
  Switch,
  ConfigProvider,
  Modal,
  Radio,
  Tag,
  Form,
  InputNumber,
  Select,
  Drawer,
  Empty,
  DatePicker,
  Checkbox,
  Spin,
  Skeleton,
  Tree,
  List,
  Badge,
  Statistic,
  Row,
  Col,
  TimePicker,
  Divider,
  Dropdown,
  Progress,
  Popover,
  Tooltip,
} from 'ant-design-vue';

import {
  postStartAll,
  preStartAll,
  mergeExtLanguages,
  checkCpusNumAndConfirmModal,
  loadCustomFont,
  showInitAfterReloadConfirmDialog,
  clearLocalStorageWithNewVersion,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';
import {
  delayMilliSeconds,
  buildIfWatcherLiveObservable,
  kfLogger,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import { LifeCycleKeys } from '@kungfu-trader/kungfu-js-api/hooks/lifeCycleHook';
import { KfHookKeeper } from '@kungfu-trader/kungfu-js-api/hooks/index';
import { booleanProcessEnv } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import {
  Pm2ProcessStatusDetailData,
  Pm2ProcessStatusData,
  Pm2ProcessStatusTypes,
  startArchiveMakeTask,
  startGetProcessStatus,
  startLedger,
  startCacheD,
  startMaster,
  isAllMainProcessRunning,
  initClean,
} from '@kungfu-trader/kungfu-js-api/utils/processUtils';

import {
  tradingDataSubject,
  triggerStartStep,
} from '@kungfu-trader/kungfu-js-api/kungfu/tradingData';

import VueVirtualScroller from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { useComponents } from './useComponents';
import globalBus from '@kungfu-trader/kungfu-js-api/utils/globalBus';

import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import enUS from 'ant-design-vue/es/locale/en_US';
import { first } from 'rxjs';
import { getCurrentWebContents } from '@electron/remote';
const app = createApp(App);

app
  .use(store)
  .use(router)
  .use(Layout)
  .use(Tabs)
  .use(Row)
  .use(Col)
  .use(Button)
  .use(Menu)
  .use(Card)
  .use(Input)
  .use(Table)
  .use(Switch)
  .use(ConfigProvider)
  .use(Modal)
  .use(Radio)
  .use(Tag)
  .use(InputNumber)
  .use(Select)
  .use(Drawer)
  .use(Form)
  .use(Empty)
  .use(DatePicker)
  .use(TimePicker)
  .use(Checkbox)
  .use(Spin)
  .use(Skeleton)
  .use(Tree)
  .use(List)
  .use(Badge)
  .use(Tooltip)

  .use(Statistic)
  .use(Divider)
  .use(Dropdown)
  .use(Progress)
  .use(Popover)
  .use(VueVirtualScroller);

app.config.globalProperties.$antLocalesMap = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
app.config.globalProperties.$globalBus = globalBus;
app.config.globalProperties.$tradingDataSubject = tradingDataSubject;

app.use(VueI18n);

const globalStore = useGlobalStore();
let appMounted = false;

globalBus.subscribe((data) => {
  if (data.tag === 'appMounted') {
    appMounted = true;
  }
});

const tryArchive = async (bypassArchive = false) => {
  if (bypassArchive) {
    globalBus.next({
      tag: 'processStatus',
      name: 'archive',
      status: 'online',
    });
    await delayMilliSeconds(2000);
    globalBus.next({
      tag: 'processStatus',
      name: 'archive',
      status: 'stopped',
    });
    return;
  } else {
    return startArchiveMakeTask((archiveStatus: Pm2ProcessStatusTypes) => {
      globalBus.next({
        tag: 'processStatus',
        name: 'archive',
        status: archiveStatus,
      });
    });
  }
};

const afterWatchIsLive = () => {
  const watcherIsLiveObervable = buildIfWatcherLiveObservable(window.watcher);
  watcherIsLiveObervable.pipe(first()).subscribe(() => {
    kfLogger.info('watcher is live');
    delayMilliSeconds(2000)
      .then(() => startCacheD(false))
      .then(() => delayMilliSeconds(2000))
      .then(() => startLedger(false))
      .then(() => postStartAll())
      .then(() => delayMilliSeconds(1000))
      .then(() => {
        globalBus.next({
          tag: 'processStatus',
          name: 'extraResourcesLoading',
          status: 'online',
        });
      })
      .catch((err) => kfLogger.error(err.message));
  });
};

const syncProcessStatusToPinia = () => {
  startGetProcessStatus(
    (res: {
      processStatus: Pm2ProcessStatusData;
      processStatusWithDetail: Pm2ProcessStatusDetailData;
    }) => {
      const { processStatus, processStatusWithDetail } = res;
      globalStore.setProcessStatus(processStatus);
      globalStore.setProcessStatusWithDetail(processStatusWithDetail);
    },
  );
};

const initStartAll = (bypassArchive = false) => {
  const start = () => {
    preStartAll()
      .then(() => checkCpusNumAndConfirmModal())
      .then((res) => {
        return delayMilliSeconds(2000).then(() => {
          globalBus.next({
            tag: 'preStartCheck',
            name: 'cpusNum',
            status: res,
          });
        });
      })
      .then(() => tryArchive(bypassArchive))
      .then(() => startMaster(false))
      .catch((err) => kfLogger.error(err.message))
      .finally(() => syncProcessStatusToPinia());

    afterWatchIsLive();
  };

  if (appMounted) {
    start();
  } else {
    globalBus.subscribe((data) => {
      if (data.tag === 'appMounted') {
        start();
      }
    });
  }
};

loadCustomFont().then(async () => {
  await mergeExtLanguages();
  await useComponents(app, router);
  clearLocalStorageWithNewVersion();
  (globalThis.HookKeeper as KfHookKeeper)
    .getHooks()
    .lifeCycle.trigger(LifeCycleKeys.BeforeAppMount)
    .finally(() => {
      app.mount('#app');
    });

  if (!booleanProcessEnv(process.env.RELOAD_AFTER_CRASHED)) {
    await initStartAll();
    return;
  }

  // reload keep old process running as long as master running, even if ledger and cached down
  const isAllMainRunning: boolean = await isAllMainProcessRunning(true);
  if (isAllMainRunning) {
    afterWatchIsLive();
    syncProcessStatusToPinia();
    return;
  }

  kfLogger.warn('master down in reload ui process');
  showInitAfterReloadConfirmDialog().then((res) => {
    if (!res) return;
    initClean(false, false).finally(() => {
      // need pass archive, avoid read master public journal before master started
      initStartAll(true);
    });
  });
});

triggerStartStep(1000);

const webContents = getCurrentWebContents();
webContents.on('devtools-reload-page', () => {
  kfLogger.warn('devtools-reload-page');
  window.watcher && window.watcher.quit();
  localStorage.setItem('page-reloaded', '1');
});
