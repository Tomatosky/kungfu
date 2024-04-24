import { getAllKfConfigOriginData } from '@kungfu-trader/kungfu-js-api/actions';
import {
  BrokerStateStatusTypes,
  KfCategoryTypes,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import {
  delayMilliSeconds,
  deleteNNFiles,
  getAvailCliExtServiceList,
  getKfExtensionConfig,
  getProcessIdByKfLocation,
  getTaskListFromProcessStatusData,
  isExtService,
  kfLogger,
  removeArchiveBeforeToday,
  switchKfLocation,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import {
  killExtra,
  pm2Kill,
  Pm2ProcessStatusData,
  Pm2ProcessStatusDetailData,
  startArchiveMakeTask,
  startMaster,
  startLedger,
  startDzxy,
  startCacheD,
  processStatusDataObservable,
  Pm2ProcessStatusDetail,
} from '@kungfu-trader/kungfu-js-api/utils/processUtils';
import { combineLatest, Observable } from 'rxjs';
import { ProcessListItem, SwitchKfLocationPacketData } from '../../typings';
import colors from 'colors';
import { Widgets } from 'blessed';
import {
  dealStatus,
  getCategoryName,
  startAllExtServices,
} from '../methods/utils';
import { dealProcessName } from '../methods/utils';
import { ARCHIVE_DIR } from '@kungfu-trader/kungfu-js-api/config/pathConfig';
import { globalState } from './globalState';
import {
  LifeCycleHook,
  LifeCycleKeys,
} from '@kungfu-trader/kungfu-js-api/hooks/lifeCycleHook';

export const mdTdStrategyExtServiceObservable = () => {
  return new Observable<
    Record<KfCategoryTypes, KungfuApi.KfConfig[]> & {
      extService: KungfuApi.KfExtServiceLocation[];
    }
  >((observer) => {
    Promise.all([getAllKfConfigOriginData(), getAvailCliExtServiceList()]).then(
      (
        allConfigs: [
          Record<KfCategoryTypes, KungfuApi.KfConfig[]>,
          KungfuApi.KfExtServiceLocation[],
        ],
      ) => {
        observer.next({
          ...allConfigs[0],
          extService: allConfigs[1].map((item) => ({
            ...item,
            location_uid: 0,
            value: '',
          })),
        });
      },
    );
  });
};

export const appStatesObservable = () => {
  return globalState.APP_STATES_SUBJECT.asObservable();
};

const getProcessStatus = (
  kfLocation: KungfuApi.KfLocation,
  processStatus: Pm2ProcessStatusData,
  appStates: Record<string, BrokerStateStatusTypes>,
) => {
  const category = kfLocation.category;
  const processId = getProcessIdByKfLocation(kfLocation);
  if (category === 'md' || category === 'td') {
    return dealStatus(
      processStatus[processId]
        ? appStates[processId] || processStatus[processId] || '--'
        : '--',
    );
  } else {
    return dealStatus(processStatus[processId] || '--');
  }
};

export const getExtConfigObservable = () => {
  return new Observable<KungfuApi.KfExtConfigs>((observer) => {
    getKfExtensionConfig().then((kfExtConfigs) => {
      observer.next(kfExtConfigs);
    });
  });
};

export const specificProcessListObserver = (kfLocation: KungfuApi.KfConfig) =>
  combineLatest(
    mdTdStrategyExtServiceObservable(),
    processStatusDataObservable(),
    appStatesObservable(),
    (
      mdTdStrategyExtService: Record<KfCategoryTypes, KungfuApi.KfConfig[]> & {
        extService: KungfuApi.KfExtServiceLocation[];
      },
      ps: {
        processStatus: Pm2ProcessStatusData;
        processStatusWithDetail: Pm2ProcessStatusDetailData;
      },
      appStates: Record<string, BrokerStateStatusTypes>,
    ): ProcessListItem[] => {
      const { extService } = mdTdStrategyExtService;
      const { processStatus, processStatusWithDetail } = ps;
      const processId = getProcessIdByKfLocation(kfLocation);

      const extServiceList: ProcessListItem[] = extService.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';
        return {
          processId,
          processName: prefix + (dealProcessName(processId) || processId),
          typeName: getCategoryName(item.category as KfCategoryTypes),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName:
            getProcessStatus(
              {
                category: item.category,
                group: item.group,
                name: item.name,
                mode: item.mode,
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail[processId]?.monit,
          script: item.script,
          cwd: item.cwd,
        };
      });

      return [
        {
          processId: 'master',
          processName: colors.bold('MASTER'),
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'master',
          name: 'master',
          value: {},
          status: processStatus['master'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'master',
                name: 'master',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['master']?.monit,
        },
        {
          processId: 'cached',
          processName: 'CACHED',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'cached',
          value: {},
          status: processStatus['cached'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'cached',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',

          monit: processStatusWithDetail['cached']?.monit,
        },
        {
          processId: 'ledger',
          processName: 'LEDGER',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'ledger',
          value: {},
          status: processStatus['ledger'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'ledger',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['ledger']?.monit,
        },
        {
          processId: 'dzxy',
          processName: 'DZXY',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'dzxy',
          value: {},
          status: processStatus['dzxy'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'dzxy',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',

          monit: processStatusWithDetail['dzxy']?.monit,
        },
        ...extServiceList,
        {
          processId,
          processName: processId,
          typeName: getCategoryName(kfLocation.category),
          category: kfLocation.category,
          group: kfLocation.group,
          name: kfLocation.name,
          value: JSON.parse(kfLocation.value || '{}'),
          status: processStatus[processId] || '--',
          statusName:
            getProcessStatus(kfLocation, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
        },
      ];
    },
  );

export const processListObservable = () =>
  combineLatest(
    mdTdStrategyExtServiceObservable(),
    processStatusDataObservable(),
    appStatesObservable(),
    getExtConfigObservable(),
    (
      mdTdStrategyExtService: Record<KfCategoryTypes, KungfuApi.KfConfig[]> & {
        extService: KungfuApi.KfExtServiceLocation[];
      },
      ps: {
        processStatus: Pm2ProcessStatusData;
        processStatusWithDetail: Pm2ProcessStatusDetailData;
      },
      appStates: Record<string, BrokerStateStatusTypes>,
      extConfigs: KungfuApi.KfExtConfigs,
    ): ProcessListItem[] => {
      const { md, operator, td, strategy, extService } = mdTdStrategyExtService;
      const { processStatus, processStatusWithDetail } = ps;

      const mdList: ProcessListItem[] = md.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';
        return {
          processId,
          processName: prefix + processId,
          typeName: getCategoryName(item.category),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName: getProcessStatus(item, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
        };
      });

      const operatorList: ProcessListItem[] = operator.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';

        return {
          processId,
          processName: prefix + processId,
          typeName: getCategoryName(item.category),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName: getProcessStatus(item, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
        };
      });

      const tdList: ProcessListItem[] = td.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';
        return {
          processId,
          processName: prefix + processId,
          typeName: getCategoryName(item.category),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName: getProcessStatus(item, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
        };
      });

      const strategyList: ProcessListItem[] = strategy.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';
        return {
          processId,
          processName: prefix + processId,
          typeName: getCategoryName(item.category),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName: getProcessStatus(item, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
        };
      });

      const extServiceList: ProcessListItem[] = extService.map((item) => {
        const processId = getProcessIdByKfLocation(item);
        const prefixProps =
          globalThis.HookKeeper.getHooks().prefix.trigger(item);
        const prefix =
          prefixProps.prefixType === 'text' ? prefixProps.prefix : '';
        return {
          processId,
          processName: prefix + (dealProcessName(processId) || processId),
          typeName: getCategoryName(item.category as KfCategoryTypes),
          category: item.category,
          group: item.group,
          name: item.name,
          value: JSON.parse(item.value || '{}'),
          status: processStatus[processId] || '--',
          statusName: getProcessStatus(item, processStatus, appStates) || '--',
          monit: processStatusWithDetail[processId]?.monit,
          script: item.script,
          cwd: item.cwd,
        };
      });

      const taskPrefixs: string[] = Object.keys(
        extConfigs['strategy'] || {},
      ).map((key) => `strategy_${key}`);
      const taskList: Pm2ProcessStatusDetail[] =
        getTaskListFromProcessStatusData(
          taskPrefixs,
          ps.processStatusWithDetail,
        );
      const taskListResolved: ProcessListItem[] = taskList.map((item) => {
        return {
          processId: item.name || '',
          processName: `${item.name?.toKfGroup()}_${item.name?.toKfName()}`,
          typeName: colors.magenta('Task'),
          category: 'strategy',
          group: item.name?.toKfGroup() || '',
          name: item.name?.toKfName() || '',
          value: '',
          status: item.status || '--',
          statusName:
            getProcessStatus(
              {
                category: 'strategy',
                group: item.name?.toKfGroup() || '',
                name: item.name?.toKfName() || '',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: item.monit,
          script: item.script,
          cwd: item.cwd,
        };
      });

      const masterPrefixProps = globalThis.HookKeeper.getHooks().prefix.trigger(
        {
          category: 'system',
          group: 'master',
          name: 'master',
          mode: 'live',
        },
      );
      const masterPrefix =
        masterPrefixProps.prefixType === 'text' ? masterPrefixProps.prefix : '';

      return [
        {
          processId: 'archive',
          processName: '_archive_',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: '',
          name: '',
          value: {},
          status: processStatus['archive'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: '',
                name: 'archive',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['archive']?.monit,
        },
        {
          processId: 'master',
          processName: colors.bold(masterPrefix + 'MASTER'),
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'master',
          name: 'master',
          value: {},
          status: processStatus['master'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'master',
                name: 'master',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['master']?.monit,
        },
        {
          processId: 'cached',
          processName: 'CACHED',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'cached',
          value: {},
          status: processStatus['cached'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'cached',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['cached']?.monit,
        },
        {
          processId: 'ledger',
          processName: 'LEDGER',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'ledger',
          value: {},
          status: processStatus['ledger'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'ledger',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['ledger']?.monit,
        },
        {
          processId: 'dzxy',
          processName: 'DZXY',
          typeName: colors.bgMagenta('Sys'),
          category: 'system',
          group: 'service',
          name: 'dzxy',
          value: {},
          status: processStatus['dzxy'] || '--',
          statusName:
            getProcessStatus(
              {
                category: 'system',
                group: 'service',
                name: 'dzxy',
                mode: 'live',
              },
              processStatus,
              appStates,
            ) || '--',
          monit: processStatusWithDetail['dzxy']?.monit,
        },
        ...extServiceList,
        ...mdList,
        ...operatorList,
        ...tdList,
        ...taskListResolved,
        ...strategyList,
      ];
    },
  );

export const switchProcess = async (
  proc: ProcessListItem,
  messageBoard: Widgets.MessageElement,
  loading: Widgets.LoadingElement,
): Promise<void> => {
  const { watcher } = await import(
    '@kungfu-trader/kungfu-js-api/kungfu/watcher'
  );
  const status = proc.status !== '--';
  const startOrStop = status ? 'Stop' : 'Start';
  const { category, group, name, value, cwd, script } = proc;
  const isTargetExtService = isExtService({
    category,
    group,
    name,
    mode: 'live',
  });

  const switchProcessExceptMaster = () => {
    if (!watcher) {
      messageBoard.log('Watcher is NULL', 2, (err) => {
        if (err) {
          console.error(err);
        }
      });
      return;
    }

    if (!watcher.isLive()) {
      messageBoard.log(
        'Start master first, If did, Please wait...',
        2,
        (err) => {
          if (err) {
            console.error(err);
          }
        },
      );
      return;
    }

    swithKfLocationResolved(
      watcher,
      {
        category,
        group,
        name,
        value: JSON.stringify(value),
        status,
        cwd,
        script,
      },
      messageBoard,
    )
      .then(() => {
        messageBoard.log('Please wait...', 2, (err) => {
          if (err) {
            console.error(err);
          }
        });
      })
      .catch((err) => {
        messageBoard.log(err.message, 2, (err) => {
          if (err) {
            console.error(err);
          }
        });
      });
  };

  switch (category) {
    case 'system':
      if (proc.processId === 'master') {
        //开启，要归档, cli 需要clearjournal
        preSwitchMain(status, messageBoard, loading)
          .then(() => {
            loading.load(`${startOrStop} Master process`);
            return switchMaster(!status);
          })
          .then(() => {
            loading.stop();
            return messageBoard.log(
              `${startOrStop} Master process success`,
              2,
              (err) => {
                if (err) {
                  console.error(err);
                }
              },
            );
          })
          .catch((err: Error) => kfLogger.error(err));
      } else {
        if (isTargetExtService) {
          switchProcessExceptMaster();
          break;
        }

        if (status) {
          messageBoard.log('Stop master first', 2, (err) => {
            if (err) {
              console.error(err);
            }
          });
        } else {
          messageBoard.log(
            'Start master first, If did, Please wait...',
            2,
            (err) => {
              if (err) {
                console.error(err);
              }
            },
          );
        }
      }
      break;
    case 'md':
    case 'operator':
    case 'td':
    case 'strategy':
      switchProcessExceptMaster();
  }
};

function swithKfLocationResolved(
  watcher: KungfuApi.Watcher,
  data: SwitchKfLocationPacketData,
  messageBoard: Widgets.MessageElement,
) {
  const { category, group, name, value, status, cwd, script } = data;
  const targetLocation = {
    category,
    group,
    name,
    mode: 'live',
  };
  const isTargetExtService = isExtService(targetLocation);
  const kfConfig: KungfuApi.KfConfig | KungfuApi.KfExtServiceLocation = {
    ...targetLocation,
    value,
    location_uid: 0,
    ...(isTargetExtService ? { cwd, script } : {}),
  };

  // task dealing logic
  if (category === 'strategy' && group !== 'default') {
    if (!value) {
      return Promise.reject(new Error('Task cannot start in CLI'));
    }
  }

  return switchKfLocation(watcher, kfConfig, !status).catch((err) => {
    messageBoard.log(err.message, 2, (err) => {
      if (err) {
        console.error(err);
      }
    });
  });
}

function preSwitchMain(
  status: boolean,
  message: Widgets.MessageElement,
  loading: Widgets.LoadingElement,
) {
  if (!status) {
    loading.load(`Start Archive, Please wait...`);
    return startArchiveMakeTask().then(() => {
      loading.stop();
      return message.log(`Archive success`, 2, (err) => {
        if (err) {
          console.error(err);
        }
      });
    });
  }

  return Promise.resolve(true);
}

const switchMaster = async (status: boolean): Promise<void> => {
  if (!status) {
    await (globalThis.HookKeeper.getHooks().lifeCycle as LifeCycleHook).trigger(
      LifeCycleKeys.BeforeStopAllProcesses,
    );
    await pm2Kill();
    await killExtra(false);
    await delayMilliSeconds(1000);
    await deleteNNFiles();
  } else {
    await deleteNNFiles();
    await removeArchiveBeforeToday(ARCHIVE_DIR);
    await startMaster(false);
    await delayMilliSeconds(1000);
    await startCacheD(false);
    await delayMilliSeconds(2000);
    await startLedger(false);
    await delayMilliSeconds(1000);
    await startDzxy();
    await delayMilliSeconds(1000);
    await startAllExtServices();
  }
};
