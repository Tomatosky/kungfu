import os from 'os';
import { dialog, shell } from '@electron/remote';
import { ensureRemoveLocation } from '@kungfu-trader/kungfu-js-api/actions';
import {
  hashInstrumentUKey,
  longfist,
} from '@kungfu-trader/kungfu-js-api/kungfu';
import {
  dealPosition,
  dealTradingDataItem,
  kfRequestMarketData,
  getKungfuHistoryData,
  isShowPosition,
  isStock,
  getPrecisionByInstrumentType,
  kfFormatTime,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';

import {
  setKfConfig,
  getAllSessions,
} from '@kungfu-trader/kungfu-js-api/kungfu/store';
import { KfCategoryNameMap } from '@kungfu-trader/kungfu-js-api/config/systemConfig';
import {
  BrokerStateStatusTypes,
  DirectionEnum,
  HistoryDateEnum,
  InstrumentTypeEnum,
  InstrumentTypes,
  KfCategoryTypes,
  OffsetEnum,
  PriceTypeEnum,
  ProcessStatusTypes,
  SideEnum,
  StrategyExtTypes,
  OrderInputKeyEnum,
  CurrencyEnum,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import {
  getKfCategoryData,
  switchKfLocation,
  getAppStateStatusName,
  dealCategory,
  getStrategyStateStatusName,
  isBrokerStateReady,
  getTradingDataSortKey,
  isUpdateVersionLogicEnable,
  isCheckVersionLogicEnable,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import {
  flattenExtensionModuleDirs,
  getAvailExtServiceList,
  buildExtTypeMap,
} from '@kungfu-trader/kungfu-js-api/utils/extUtils';
import {
  isT0,
  transformSearchInstrumentResultToInstrument,
  isShotable,
  buildTradingDataHeaders,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import {
  getIdByKfLocation,
  getProcessIdByKfLocation,
  dealKfNumber,
  countDecimalPlaces,
  findTargetFromArray,
  getMdTdKfLocationByProcessId,
  dealKfDecimalPrecision,
  ASSET_PRECISION,
} from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { booleanProcessEnv } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import {
  buildMasterLocation,
  buildArchiveLocation,
  buildLedgerLocation,
} from '@kungfu-trader/kungfu-js-api/utils/systemUtils';
import { BasketVolumeType } from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import { writeCsvWithUTF8Bom } from '@kungfu-trader/kungfu-js-api/utils/fileUtils';
import {
  isAllMainProcessRunning,
  Pm2ProcessStatusData,
  Pm2ProcessStatusDetailData,
  stopProcess,
} from '@kungfu-trader/kungfu-js-api/utils/processUtils';
import { Modal } from 'ant-design-vue';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';

import path from 'path';
import Fuse from 'fuse.js';
import { Proc } from 'pm2';
import {
  computed,
  ComputedRef,
  getCurrentInstance,
  h,
  isRef,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onActivated,
  onDeactivated,
  reactive,
  ref,
  Ref,
  toRaw,
  toRefs,
  watch,
  createVNode,
} from 'vue';
import dayjs from 'dayjs';
import { Row } from '@fast-csv/format';
import {
  AbleSubscribeInstrumentTypesBySourceType,
  OrderInputKeySetting,
} from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import {
  buildInstrumentSelectOptionLabel,
  buildInstrumentSelectOptionValue,
  confirmModal,
  extraConfirmModal,
  makeSearchOptionFormInstruments,
  handleOpenReplayView,
  getJournalReplayConfigs,
} from './uiUtils';
import { storeToRefs } from 'pinia';
import { ipcRenderer } from 'electron';
import { throttleTime } from 'rxjs';
import { useGlobalStore } from '../../pages/index/store/global';
import { getGlobalStorage } from '@kungfu-trader/kungfu-js-api/utils/globalStorage';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { messagePrompt } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import sound from 'sound-play';
import {
  KUNGFU_RESOURCES_DIR,
  EXTENSION_DIRS,
} from '@kungfu-trader/kungfu-js-api/config/pathConfig';
import { RuleObject } from 'ant-design-vue/lib/form';
import { TradeAccountingUsageMap } from '@kungfu-trader/kungfu-js-api/utils/accounting';
import { readRootPackageJsonSync } from '@kungfu-trader/kungfu-js-api/utils/fileUtils';
import fse from 'fs-extra';
import { kfLogger } from '@kungfu-trader/kungfu-js-api/utils/logUtils';
import { useRouter } from 'vue-router';
import {
  LifeCycleHook,
  LifeCycleKeys,
} from '@kungfu-trader/kungfu-js-api/hooks/lifeCycleHook';

const { t } = VueI18n.global;
const globalStorage = getGlobalStorage();
const { success, error } = messagePrompt();

export const useUpdateVersion = () => {
  const vueInstance = getCurrentInstance();
  const packageJson = readRootPackageJsonSync();
  const currentVersion = ref(packageJson?.version);
  const newVersion = ref('');
  const lastSkippedVersion = ref('');
  const hasSkiped = ref(false);
  const popoverVisible = ref(false);
  const hasNewVersion = ref(false);
  const checkingUpdate = ref(false);
  const downloadStarted = ref<boolean>(false);
  const progressStatus = ref<'success' | 'active' | 'exception' | 'normal'>(
    'normal',
  );
  const errorMessage = ref('');
  const process = ref<number>();
  const skippedVersionList = globalStorage.getItem('skippedVersions');
  if (skippedVersionList && skippedVersionList.length > 0) {
    hasSkiped.value = true;
    const list = skippedVersionList;
    lastSkippedVersion.value = list[list.length - 1];
    newVersion.value = lastSkippedVersion.value;
  }

  const handleToRetryCheckUpdate = () => {
    ipcRenderer.send('auto-update-retry-check-update');
    checkingUpdate.value = true;
    // 超过 10 秒视为检测完成

    const timer = setTimeout(() => {
      checkingUpdate.value = false;
      clearTimeout(timer);
    }, 10000);
  };

  const handleToConfirmStartUpdate = (newVersion: string) => {
    popoverVisible.value = false;
    extraConfirmModal(
      t('autoUpdater.update_version'),
      t('autoUpdater.find_new_version', {
        version: newVersion,
      }),
      t('confirm'),
      t('cancel'),
      [{ text: t('autoUpdater.skip_version'), value: 1 }],
    ).then((action) => {
      if (action === 'ok') {
        ipcRenderer.send('auto-update-confirm-result', true);
      } else if (action === 1) {
        ipcRenderer.send('auto-update-skip-version', newVersion);
      } else {
        ipcRenderer.send('auto-update-confirm-result', false);
      }
    });
  };

  const handleToStartDownload = () => {
    ipcRenderer.send('auto-update-to-start-download');
  };

  const handleDownloadLatest = () => {
    ipcRenderer.send('auto-update-to-download-latest');
  };

  const skipVersion = (version: string) => {
    ipcRenderer.send('auto-update-skip-version', version);
  };

  const handleQuitAndInstall = () => {
    confirmModal(
      t('autoUpdater.update_version'),
      t('autoUpdater.warning_before_install'),
    ).then((flag) => {
      if (flag) {
        ipcRenderer.send('auto-update-quit-and-install');
      }
    });
  };

  onMounted(() => {
    if (!isUpdateVersionLogicEnable()) return;

    vueInstance?.proxy?.$globalBus.subscribe((data) => {
      if (data.tag === 'app-is-already') {
        ipcRenderer.send('auto-update-renderer-ready');
      }

      if (data.tag === 'main') {
        if (data.name === 'auto-update-find-new-version') {
          checkingUpdate.value = false;
          hasNewVersion.value = true;
          newVersion.value = data.payload.newVersion;
          hasSkiped.value = newVersion.value === lastSkippedVersion.value;
          errorMessage.value = '';
          isCheckVersionLogicEnable() &&
            handleToConfirmStartUpdate(data.payload.newVersion);
        }

        if (data.name === 'auto-update-skip-version') {
          checkingUpdate.value = false;
          hasNewVersion.value = true;
          hasSkiped.value = true;
        }

        if (data.tag === 'auto-update-up-to-date') {
          checkingUpdate.value = false;
          hasNewVersion.value = false;
        }

        if (data.name === 'auto-update-start-download') {
          hasNewVersion.value = true;
          downloadStarted.value = true;
          progressStatus.value = 'active';
          popoverVisible.value = true;
          errorMessage.value = '';
        }

        if (data.name === 'auto-update-download-process') {
          process.value = Number((+data.payload.process).kfToFixed(2));
          if (process.value === 100) {
            progressStatus.value = 'success';
            errorMessage.value = '';
          } else {
            progressStatus.value = 'active';
          }
        }

        if (data.name === 'auto-update-error') {
          console.error(data.payload.error);
          errorMessage.value = (data.payload.error as Error).message;
          progressStatus.value = 'exception';
          popoverVisible.value = true;
        }
      }
    });
  });

  return {
    popoverVisible,
    newVersion,
    hasSkiped,
    currentVersion,
    checkingUpdate,
    hasNewVersion,
    downloadStarted,
    process,
    progressStatus,
    errorMessage,
    handleToRetryCheckUpdate,
    handleToStartDownload,
    handleDownloadLatest,
    skipVersion,
    handleQuitAndInstall,
  };
};

export const handleSwitchProcessStatusGenerator = (): ((
  checked: boolean,
  mouseEvent: MouseEvent,
  kfLocation: KungfuApi.KfLocation,
) => Promise<void | Proc>) => {
  const switchController = {};
  return (
    checked: boolean,
    mouseEvent: MouseEvent,
    kfLocation: KungfuApi.KfLocation,
  ) =>
    handleSwitchProcessStatus(
      checked,
      mouseEvent,
      kfLocation,
      switchController,
    );
};

export const handleSwitchProcessStatus = (
  checked: boolean,
  mouseEvent: MouseEvent,
  kfLocation: KungfuApi.KfLocation,
  switchController: Record<string, boolean>,
): Promise<void | Proc> => {
  mouseEvent.stopPropagation();
  const processId = getProcessIdByKfLocation(kfLocation);
  if (switchController[processId]) {
    messagePrompt().warn(t('please_wait'));
    return Promise.resolve();
  }

  switchController[processId] = true;
  return switchKfLocation(window.watcher, kfLocation, checked)
    .then(() => {
      success();
    })
    .catch((err: Error) => {
      error(err.message || t('operation_failed'));
    })
    .finally(() => {
      switchController[processId] = false;
    });
};

export const preQuitTasks = (tasks: Promise<void>[]): Promise<[]> => {
  return Promise.all(tasks).then(() => {
    return [];
  });
};

export const useSwitchAllConfig = (
  kfConfigs: Ref<KungfuApi.KfConfig[]> | Ref<KungfuApi.KfLocation[]>,
  processStatusData: Ref<Pm2ProcessStatusData>,
): {
  allProcessOnline: ComputedRef<boolean>;
  handleSwitchAllProcessStatus(checked: boolean): Promise<void>;
} => {
  const allProcessOnline = computed(() => {
    const onlineItemsCount: number = kfConfigs.value.filter(
      (item: KungfuApi.KfLocation | KungfuApi.KfConfig): boolean => {
        const processId = getProcessIdByKfLocation(item);
        return processStatusData.value[processId] === 'online';
      },
    ).length;
    if (
      onlineItemsCount === kfConfigs.value.length &&
      kfConfigs.value.length !== 0
    ) {
      return true;
    } else {
      return false;
    }
  });

  const handleSwitchAllProcessStatus = (checked: boolean): Promise<void> => {
    return Promise.all(
      kfConfigs.value.map(
        (item: KungfuApi.KfLocation): Promise<void | Proc> => {
          const processId = getProcessIdByKfLocation(item);
          if (checked && processStatusData.value[processId] === 'online')
            return Promise.resolve();

          return switchKfLocation(window.watcher, item, checked);
        },
      ),
    )
      .then(() => {
        success();
      })
      .catch((err: Error) => {
        error(err.message || t('operation_failed'));
      });
  };

  return {
    allProcessOnline,
    handleSwitchAllProcessStatus,
  };
};

export const useAddUpdateRemoveKfConfig = (): {
  handleRemoveKfConfig: (
    watcher: KungfuApi.Watcher,
    kfConfig: KungfuApi.KfConfig | KungfuApi.KfLocation,
    processStatusData: Pm2ProcessStatusData,
  ) => Promise<void>;
  handleConfirmAddUpdateKfConfig: (
    data: {
      formState: Record<string, KungfuApi.KfConfigValue>;
      configSettings: KungfuApi.KfConfigItem[];
      idByPrimaryKeys: string;
      changeType: KungfuApi.ModalChangeType;
    },
    category: KfCategoryTypes,
    group: string,
  ) => Promise<boolean>;
} => {
  const handleRemoveKfConfig = (
    watcher: KungfuApi.Watcher,
    kfConfig: KungfuApi.KfConfig | KungfuApi.KfLocation,
    processStatusData: Pm2ProcessStatusData,
  ): Promise<void> => {
    const categoryName = getKfCategoryData(kfConfig.category).name;
    const id = getIdByKfLocation(kfConfig);
    return new Promise((resolve, reject) => {
      Modal.confirm({
        title: `${t('delete')}${categoryName} ${id}`,
        content: t('delete_category', {
          category: `${categoryName} ${id}`,
          categoryName: categoryName,
        }),
        okText: t('confirm'),
        cancelText: t('cancel'),
        onOk() {
          return ensureRemoveLocation(watcher, kfConfig, processStatusData)
            .then(() => {
              return useGlobalStore().setKfConfigList();
            })
            .then(() => {
              resolve();
            })
            .catch((err) => {
              error(`${t('database_locked')}, ${t('please_wait_and_retry')}`);
              kfLogger.error(err);
              reject(err);
            });
        },
      });
    });
  };

  const handleConfirmAddUpdateKfConfig = (
    data: {
      formState: Record<string, KungfuApi.KfConfigValue>;
      configSettings: KungfuApi.KfConfigItem[];
      idByPrimaryKeys: string;
      changeType: KungfuApi.ModalChangeType;
    },
    category: KfCategoryTypes,
    group: string,
  ): Promise<boolean> => {
    const { formState, idByPrimaryKeys, changeType } = data;
    const changeTypename = changeType === 'add' ? t('add') : t('set');
    const categoryName = getKfCategoryData(category).name;

    const context =
      changeType === 'add'
        ? t('add_config_modal', {
            category: categoryName,
            changeTypename: changeTypename,
            key: `${changeTypename} ${idByPrimaryKeys}`,
          })
        : t('update_config_modal', {
            key: `${changeTypename} ${idByPrimaryKeys}`,
          });
    return new Promise((handleResolve) => {
      Modal.confirm({
        title: `${changeTypename}${categoryName} ${idByPrimaryKeys}`,
        content: context,
        okText: t('confirm'),
        cancelText: t('cancel'),
        onOk() {
          const kfLocation: KungfuApi.KfLocation = {
            category: category,
            group: group,
            name: idByPrimaryKeys.toString(),
            mode: 'live',
          };

          return new Promise<void>((modalResolve, reject) => {
            setKfConfig(
              kfLocation,
              JSON.stringify({
                ...formState,
                add_time: +new Date().getTime() * Math.pow(10, 6),
              }),
              window.watcher,
            )
              .then(() => {
                success();
              })
              .then(() => {
                useGlobalStore().setKfConfigList();
                modalResolve();
                handleResolve(true);
              })
              .catch((err: Error) => {
                error(`${t('database_locked')}, ${t('please_wait_and_retry')}`);
                kfLogger.error(err);
                reject(err);
              });
          });
        },
        onCancel() {
          handleResolve(false);
        },
      });
    });
  };

  return {
    handleRemoveKfConfig,
    handleConfirmAddUpdateKfConfig,
  };
};

export const useRemoveReplayProcess = (): {
  handleRemoveReplayProcess: (processId: string) => Promise<void>;
} => {
  const handleRemoveReplayProcess = (processId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      Modal.confirm({
        title: `${t('replay.stop_replay')}`,
        content: t('replay.stop_replay_warn_content'),
        okText: t('confirm'),
        cancelText: t('cancel'),
        icon: createVNode(ExclamationCircleOutlined),
        onOk() {
          return stopProcess(processId)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              reject(err);
            });
        },
      });
    });
  };

  return {
    handleRemoveReplayProcess,
  };
};

export const useDealExportHistoryTradingData = (): {
  exportDateModalVisible: Ref<boolean>;
  exportDataLoading: Ref<boolean>;
  exportEventData: Ref<KfEvent.ExportTradingDataEvent | undefined>;
  handleConfirmExportDate(formSate: {
    date: string;
    dateType: HistoryDateEnum;
  }): void;
} => {
  const app = getCurrentInstance();
  const exportDateModalVisible = ref<boolean>(false);
  const exportEventData = ref<KfEvent.ExportTradingDataEvent>();
  const exportDataLoading = ref<boolean>(false);

  const dealTradingDataItemResolved = (
    isShowOriginData = false,
  ): ((item: KungfuApi.TradingDataTypes) => Row) => {
    return (item) =>
      dealTradingDataItem(item, window.watcher, isShowOriginData) as Row;
  };

  const handleConfirmExportDate = async (formState: {
    date: string;
    dateType: HistoryDateEnum;
  }): Promise<void> => {
    if (!exportEventData.value) {
      throw new Error('exportEventData is undefined');
    }
    const { currentKfLocation, tradingDataType } =
      exportEventData.value || ({} as KfEvent.ExportTradingDataEvent);
    const { date, dateType } = formState;
    const dateResolved = dayjs(date).format('YYYYMMDD');
    exportDataLoading.value = true;

    if (tradingDataType === 'all') {
      let historyData: {
        tradingData: KungfuApi.TradingData;
      } | null = null;

      try {
        historyData = await getKungfuHistoryData(
          window.watcher,
          date,
          dateType,
          tradingDataType,
        );
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'database_locked') {
            error(t('export_database_locked'));
          } else {
            console.error(err);
          }
        } else {
          console.error(err);
        }
      }

      if (!historyData) {
        exportDataLoading.value = false;
        return;
      }

      const { tradingData } = historyData;
      const orderSortKey = getTradingDataSortKey('Order');
      const orders = tradingData.Order.sort(orderSortKey);
      const tradeSortKey = getTradingDataSortKey('Trade');
      const trades = tradingData.Trade.sort(tradeSortKey);
      const orderStatSortKey = getTradingDataSortKey('OrderStat');
      const orderStat = tradingData.OrderStat.sort(orderStatSortKey);
      const positionSortKey = getTradingDataSortKey('Position');
      const positions = (
        window.watcher as KungfuApi.Watcher
      ).ledger.Position.sort(positionSortKey);
      const assetSortKey = getTradingDataSortKey('Asset');
      const assets = tradingData.Asset.sort(assetSortKey);
      const orderInputSortKey = getTradingDataSortKey('OrderInput');
      const orderInputs = tradingData.OrderInput.sort(orderInputSortKey);

      exportDataLoading.value = false;

      const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });

      if (!filePaths) {
        return;
      }
      const targetFolder = filePaths[0];
      const ordersFilename = path.join(
        targetFolder,
        `orders-${dateResolved}.csv`,
      );
      const tradesFilename = path.join(
        targetFolder,
        `trades-${dateResolved}.csv`,
      );
      const orderStatFilename = path.join(
        targetFolder,
        `orderStats-${dateResolved}.csv`,
      );
      const posFilename = path.join(targetFolder, `pos-${dateResolved}.csv`);
      const assetFilename = path.join(
        targetFolder,
        `assets-${dateResolved}.csv`,
      );
      const orderInputsFilename = path.join(
        targetFolder,
        `orderInputs-${dateResolved}.csv`,
      );

      return Promise.all([
        writeCsvWithUTF8Bom(
          ordersFilename,
          orders,
          buildTradingDataHeaders('Order', orders),
          dealTradingDataItemResolved(),
        ),
        writeCsvWithUTF8Bom(
          tradesFilename,
          trades,
          buildTradingDataHeaders('Trade', trades),
          dealTradingDataItemResolved(),
        ),
        writeCsvWithUTF8Bom(
          orderStatFilename,
          orderStat,
          buildTradingDataHeaders('OrderStat', orderStat),
          dealTradingDataItemResolved(true),
        ),
        writeCsvWithUTF8Bom(
          posFilename,
          positions,
          buildTradingDataHeaders('Position', positions),
          dealTradingDataItemResolved(),
        ),
        writeCsvWithUTF8Bom(
          assetFilename,
          assets,
          buildTradingDataHeaders('Asset', assets),
          dealTradingDataItemResolved(),
        ),
        writeCsvWithUTF8Bom(
          orderInputsFilename,
          orderInputs,
          buildTradingDataHeaders('OrderInput', orderInputs),
          dealTradingDataItemResolved(),
        ),
      ])
        .then(() => {
          shell.showItemInFolder(ordersFilename);
          success();
        })
        .catch((err: Error) => {
          error(err.message);
        });
    }

    if (!currentKfLocation) {
      return;
    }

    let historyData: {
      tradingData: KungfuApi.TradingData;
    } | null = null;

    if ((tradingDataType as KungfuApi.TradingDataTypeName) === 'Position') {
      historyData = {
        tradingData: (window.watcher as KungfuApi.Watcher).ledger,
      };
    } else {
      try {
        historyData = await getKungfuHistoryData(
          window.watcher,
          date,
          dateType,
          tradingDataType,
          currentKfLocation,
        );
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'database_locked') {
            error(t('export_database_locked'));
          } else {
            console.error(err);
          }
        } else {
          console.error(err);
        }
      }
    }

    exportDataLoading.value = false;

    if (!historyData) return Promise.resolve();

    const { tradingData } = historyData;

    const processId = getProcessIdByKfLocation(currentKfLocation);
    const filename: string = await dialog
      .showSaveDialog({
        title: t('save_file'),
        defaultPath: path.join(
          os.homedir(),
          `${processId}-${tradingDataType}-${dateResolved}.csv`,
        ),
        filters: [
          {
            name: 'csv',
            extensions: ['csv'],
          },
        ],
      })
      .then(({ filePath }) => {
        return filePath || '';
      });

    if (!filename) {
      return Promise.resolve();
    }

    const exportDatas =
      globalThis.HookKeeper.getHooks().dealTradingData.trigger(
        window.watcher,
        currentKfLocation,
        tradingData[tradingDataType as KungfuApi.TradingDataTypeName] as
          | KungfuApi.DataTable<KungfuApi.Order>
          | KungfuApi.DataTable<KungfuApi.Trade>
          | KungfuApi.DataTable<KungfuApi.Position>,
        tradingDataType.toLowerCase(),
      );

    return writeCsvWithUTF8Bom(
      filename,
      exportDatas,
      buildTradingDataHeaders(tradingDataType, exportDatas),
      dealTradingDataItemResolved(),
    )
      .then(() => {
        shell.showItemInFolder(filename);
        success();
      })
      .catch((err: Error) => {
        error(err.message);
      });
  };

  onMounted(() => {
    if (app?.proxy) {
      const subscription = app.proxy.$globalBus.subscribe(
        (data: KfEvent.KfBusEvent) => {
          if (data.tag === 'export') {
            exportEventData.value = data;

            if (!exportEventData.value) return;

            if (exportEventData.value.tradingDataType !== 'all') {
              if (exportEventData.value.tradingDataType !== 'Order') {
                if (exportEventData.value.tradingDataType !== 'Trade') {
                  if (exportEventData.value.tradingDataType !== 'OrderInput') {
                    handleConfirmExportDate({
                      date: dayjs().format(),
                      dateType: HistoryDateEnum.naturalDate,
                    });
                    return;
                  }
                }
              }
            }

            exportDateModalVisible.value = true;
          }
        },
      );

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });
    }
  });

  return {
    exportDateModalVisible,
    exportDataLoading,
    exportEventData,
    handleConfirmExportDate,
  };
};

export const handleExportInstrumentWhitelists = async (): Promise<void> => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  if (!filePaths[0]) return;

  const dateResolved = dayjs(Date.now()).format('YYYYMMDD');
  const targetFolder = path.join(
    filePaths[0],
    `instrument-${dateResolved}.csv`,
  );
  const instrumentSortKey = getTradingDataSortKey('Instrument');
  const instrument = (
    window.watcher as KungfuApi.Watcher
  ).ledger.Instrument.sort(instrumentSortKey);
  const dealTradingDataItemResolved = (
    isShowOriginData = false,
  ): ((item: KungfuApi.TradingDataTypes) => Row) => {
    return (item) =>
      dealTradingDataItem(item, window.watcher, isShowOriginData) as Row;
  };
  writeCsvWithUTF8Bom(
    targetFolder,
    instrument,
    buildTradingDataHeaders('Instrument', instrument),
    dealTradingDataItemResolved(),
  )
    .then(() => {
      shell.showItemInFolder(targetFolder);
      success();
    })
    .catch((err: Error) => {
      error(err.message);
    });
};

export const showTradingDataDetail = <
  T extends Record<string, KungfuApi.KfConfigValue>,
>(
  item: T | (() => T),
  typename: string,
  filterKeys?: Array<keyof T>,
  renameValues?: Record<
    string,
    (item: KungfuApi.KfConfigValue) => KungfuApi.KfConfigValue
  >,
): Promise<boolean> => {
  const generateVnode = () => {
    const itemResolved = typeof item === 'function' ? item() : item;
    const dataResolved = dealTradingDataItem(
      itemResolved as unknown as KungfuApi.TradingDataTypes,
      window.watcher,
    );

    const vnode = Object.keys(dataResolved || {})
      .filter((key) => {
        if (filterKeys && (filterKeys as string[]).includes(key)) {
          return false;
        }
        if (dataResolved[key].toString() === '[object Object]') {
          return false;
        }
        return dataResolved[key] !== '';
      })
      .map((key) => {
        const value = renameValues?.[key]
          ? renameValues[key](dataResolved[key])
          : dataResolved[key];
        return h('div', { class: 'trading-data-detail-row' }, [
          h('span', { class: 'label' }, `${key}`),
          h('span', { class: 'value' }, `${value}`),
        ]);
      });

    return h(
      'div',
      {
        class: 'trading-data-detail__warp',
      },
      vnode,
    );
  };

  return confirmModal(
    `${typename} ${t('detail')}`,
    generateVnode,
    t('confirm'),
  );
};

const InstrumentFuse = new Fuse<KungfuApi.InstrumentResolved>([], {
  keys: ['id'],
  includeScore: true,
});
export const useInstruments = (): {
  instruments: Ref<KungfuApi.InstrumentResolved[]>;
  subscribedInstrumentsByLocal: Ref<KungfuApi.InstrumentResolved[]>;
  subscribeAllInstrumentByMdProcessId(
    processId: string,
    processStatus: Pm2ProcessStatusData,
    appStates: Record<string, BrokerStateStatusTypes>,
    mdExtTypeMap: Record<string, InstrumentTypes>,
    instrumentsForSubscribe: KungfuApi.InstrumentResolved[],
  ): Promise<Array<KungfuApi.InstrumentResolved>>;
  subscribeAllInstrumentByAppStates(
    processStatus: Pm2ProcessStatusData,
    appStates: Record<string, BrokerStateStatusTypes>,
    mdExtTypeMap: Record<string, InstrumentTypes>,
    instrumentsForSubscribe: KungfuApi.InstrumentResolved[],
  ): Promise<Array<KungfuApi.InstrumentResolved>>;

  searchInstrumentResult: Ref<string | undefined>;
  searchInstrumnetOptions: Ref<{ value: string; label: string }[]>;
  updateSearchInstrumnetOptions: (
    type: 'instrument' | 'instruments' | 'instrumentsCsv',
    value: string | string[],
  ) => Promise<{ value: string; label: string }[]>;
  handleSearchInstrument: (
    value: string,
  ) => Promise<{ value: string; label: string }[]>;
  handleConfirmSearchInstrumentResult: (
    value: string,
    callback?: (value: string) => void,
  ) => void;
} => {
  const { instruments, subscribedInstrumentsByLocal } = storeToRefs(
    useGlobalStore(),
  );

  watch(
    () => instruments.value.length,
    () => {
      InstrumentFuse.setCollection(instruments.value);
    },
    { immediate: true },
  );

  const subscribeAllInstrumentByMdProcessId = async (
    processId: string,
    processStatus: Pm2ProcessStatusData,
    appStates: Record<string, BrokerStateStatusTypes>,
    mdExtTypeMap: Record<string, InstrumentTypes>,
    instrumentsForSubscribe: KungfuApi.InstrumentForSub[],
  ): Promise<Array<KungfuApi.InstrumentForSub>> => {
    if (isBrokerStateReady(appStates[processId])) {
      if (processStatus[processId] === 'online') {
        if (processId.indexOf('md_') === 0) {
          const mdLocation = getMdTdKfLocationByProcessId(processId);
          if (mdLocation && mdLocation.category === 'md') {
            const sourceId = mdLocation.group;
            const sourceType = mdExtTypeMap[sourceId];
            const ableSubscribedInstrumentTypes =
              AbleSubscribeInstrumentTypesBySourceType[sourceType] || [];

            const instrumentsForSubscribeResolved =
              instrumentsForSubscribe.filter((item) =>
                ableSubscribedInstrumentTypes.includes(+item.instrumentType),
              );
            const subscribeResults = await Promise.all(
              instrumentsForSubscribeResolved.map((item) =>
                kfRequestMarketData(
                  window.watcher,
                  item.exchangeId,
                  item.instrumentId,
                  mdLocation,
                ),
              ),
            );
            return instrumentsForSubscribeResolved.filter(
              (_, index) => !!subscribeResults[index],
            );
          }
        }
      }
    }

    return [];
  };

  const subscribeAllInstrumentByAppStates = async (
    processStatus: Pm2ProcessStatusData,
    appStates: Record<string, BrokerStateStatusTypes>,
    mdExtTypeMap: Record<string, InstrumentTypes>,
    instrumentsForSubscribe: KungfuApi.InstrumentForSub[],
  ): Promise<Array<KungfuApi.InstrumentForSub>> => {
    const subscribedSuccessInstruments = await Promise.all(
      Object.keys(appStates || {}).map((processId) =>
        subscribeAllInstrumentByMdProcessId(
          processId,
          processStatus,
          appStates,
          mdExtTypeMap,
          instrumentsForSubscribe,
        ),
      ),
    );

    return subscribedSuccessInstruments.reduce((pre, instruments) => {
      return pre.concat(instruments);
    }, []);
  };

  const SearchResultsMaxCount = 500;
  const PriorityInstrumentTypes: InstrumentTypeEnum[] = [
    InstrumentTypeEnum.stock,
    InstrumentTypeEnum.future,
  ];
  const searchInstrumentResult = ref<string | undefined>(undefined);
  const searchInstrumnetOptions = ref<{ value: string; label: string }[]>([]);

  const updateSearchInstrumnetOptions = (
    type: 'instrument' | 'instruments' | 'instrumentsCsv',
    value: string | string[],
  ): Promise<{ value: string; label: string }[]> => {
    searchInstrumnetOptions.value = makeSearchOptionFormInstruments(
      type,
      value,
    );
    return Promise.resolve(searchInstrumnetOptions.value);
  };

  const filterInstrumentsByKeyword = (keywords: string) => {
    return InstrumentFuse.search(keywords, { limit: SearchResultsMaxCount })
      .sort((a, b) => {
        const aItem = a.item,
          aScore = Number(a.score);
        const bItem = b.item,
          bScore = Number(b.score);
        const aPriority = +PriorityInstrumentTypes.includes(
          aItem.instrumentType,
        );
        const bPriority = +PriorityInstrumentTypes.includes(
          bItem.instrumentType,
        );

        return aScore === bScore
          ? bPriority - aPriority
          : aScore < bScore
          ? -1
          : 1;
      })
      .map(({ item }) => ({
        value: buildInstrumentSelectOptionValue(item),
        label: buildInstrumentSelectOptionLabel(item),
      }));
  };

  let preResolve: ((res: { value: string; label: string }[]) => void) | null =
      null,
    timer: NodeJS.Timeout | null = null;
  const handleSearchInstrument = (
    val: string,
  ): Promise<{ value: string; label: string }[]> => {
    return new Promise((resolve) => {
      if (preResolve) preResolve(searchInstrumnetOptions.value);
      if (timer) clearTimeout(timer);

      preResolve = resolve;
      timer = setTimeout(() => {
        searchInstrumnetOptions.value = filterInstrumentsByKeyword(val);
        resolve(searchInstrumnetOptions.value);
        preResolve = null;
        timer = null;
      }, 250);
    });
  };

  const handleConfirmSearchInstrumentResult = (
    value: string,
    callback?: (value: string) => void,
  ) => {
    nextTick().then(() => {
      searchInstrumentResult.value = undefined;
    });
    callback && callback(value);
  };

  return {
    instruments,
    subscribedInstrumentsByLocal,
    subscribeAllInstrumentByMdProcessId,
    subscribeAllInstrumentByAppStates,

    searchInstrumentResult,
    searchInstrumnetOptions,
    updateSearchInstrumnetOptions,
    handleSearchInstrument,
    handleConfirmSearchInstrumentResult,
  };
};

export const useCoreBindPage = () => {
  const router = useRouter();
  const globalStore = useGlobalStore();
  const { coreBindRoutePaths } = storeToRefs(globalStore);

  onActivated(() => {
    const currentRoutePath = router.currentRoute.value.fullPath;

    if (!coreBindRoutePaths.value.has(currentRoutePath)) {
      coreBindRoutePaths.value.add(currentRoutePath);
    }
  });
};

export const usePreStartAndQuitApp = (): {
  preStartSystemLoadingData: Ref<
    Record<
      'archive' | 'watcher' | 'extraResourcesLoading' | 'cpusSafeNumChecking',
      'loading' | 'done'
    >
  >;
  preStartSystemLoading: ComputedRef<boolean>;
  showPreStartLoading: ComputedRef<boolean>;
  preQuitSystemLoadingData: Ref<
    Record<'record' | 'quit', 'loading' | 'done' | undefined>
  >;
  preQuitSystemLoading: ComputedRef<boolean>;
} => {
  const app = getCurrentInstance();
  const router = useRouter();
  const globalStore = useGlobalStore();
  const {
    coreBindRoutePaths,
    preStartSystemLoadingData,
    preQuitSystemLoadingData,
  } = storeToRefs(globalStore);

  const preStartSystemLoading = computed(() => {
    return (
      Object.values(preStartSystemLoadingData.value).filter(
        (item: string) => item !== 'done',
      ).length > 0
    );
  });

  const showPreStartLoading = computed(() => {
    return (
      coreBindRoutePaths.value.has(router.currentRoute.value.fullPath) &&
      preStartSystemLoading.value
    );
  });

  const watchStopHandle = watch(
    () => preStartSystemLoading.value,
    (newVal) => {
      if (!newVal) {
        app?.proxy?.$globalBus.next({ tag: 'app-is-already' });
        watchStopHandle();
      }
    },
  );

  const preQuitSystemLoading = computed(() => {
    return (
      Object.values(preQuitSystemLoadingData.value).filter(
        (item: string | undefined) => item !== undefined,
      ).length > 0
    );
  });

  const startGetWatcherStatus = () => {
    const timer = setInterval(() => {
      if (window.watcher?.isLive()) {
        preStartSystemLoadingData.value.watcher = 'done';
        clearInterval(timer);
      } else {
        preStartSystemLoadingData.value.watcher = 'loading';
      }
    }, 500);
  };

  startGetWatcherStatus();

  onMounted(() => {
    if (booleanProcessEnv(process.env.RELOAD_AFTER_CRASHED)) {
      isAllMainProcessRunning(true).then((flag) => {
        if (flag) {
          preStartSystemLoadingData.value.cpusSafeNumChecking = 'done';
          preStartSystemLoadingData.value.archive = 'done';
        }
      });
    }

    if (app?.proxy) {
      const subscription = app.proxy.$globalBus.subscribe(
        (data: KfEvent.KfBusEvent) => {
          if (data.tag === 'preStartCheck') {
            if (data.name === 'cpusNum') {
              preStartSystemLoadingData.value.cpusSafeNumChecking = 'done';
            }
          }

          if (data.tag === 'processStatus') {
            if (data.name && data.name === 'archive') {
              preStartSystemLoadingData.value.archive =
                data.status === 'online' ? 'loading' : 'done';
              startGetWatcherStatus();
            }

            if (data.name && data.name === 'extraResourcesLoading') {
              preStartSystemLoadingData.value.extraResourcesLoading =
                data.status === 'online' ? 'done' : 'loading';
            }

            if (data.name === 'system' && data.status === 'waiting restart') {
              preStartSystemLoadingData.value.archive = 'loading';
              preStartSystemLoadingData.value.watcher = 'loading';
              preStartSystemLoadingData.value.extraResourcesLoading = 'loading';
            }
          }

          if (data.tag === 'main') {
            switch (data.name) {
              case 'record-before-quit':
                preQuitSystemLoadingData.value.record = 'loading';
                preQuitTasks([
                  // removeNoDefaultStrategyFolders(),
                  (
                    globalThis.HookKeeper.getHooks().lifeCycle as LifeCycleHook
                  ).trigger(LifeCycleKeys.BeforeStopAllProcesses),
                ]).finally(() => {
                  ipcRenderer.send('record-before-quit-done');
                  preQuitSystemLoadingData.value.record = 'done';
                });
                break;
              case 'clear-process-before-quit-start':
                preQuitSystemLoadingData.value.quit = 'loading';
                break;
              case 'clear-process-before-quit-end':
                preQuitSystemLoadingData.value.quit = 'done';
                break;
            }
          }
        },
      );

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });
    }
  });

  return {
    preStartSystemLoadingData,
    preStartSystemLoading,
    showPreStartLoading,
    preQuitSystemLoadingData,
    preQuitSystemLoading,
  };
};

export const useSubscibeInstrumentAtEntry = (
  watcher: KungfuApi.Watcher | null,
  customInstrumentsForSubGetter?: (
    watcher: KungfuApi.Watcher,
  ) => KungfuApi.InstrumentForSub[],
): void => {
  const { currentGlobalKfLocation } = useCurrentGlobalKfLocation(watcher);
  const { appStates, processStatusData } = useProcessStatusDetailData();
  const { mdExtTypeMap } = useExtConfigsRelated();
  const { subscribedInstrumentsByLocal } = useInstruments();
  const { subscribeAllInstrumentByAppStates } = useInstruments();
  const { curSubscribedInstruments, setCurSubscribedInstruments } =
    useGlobalStore();

  const app = getCurrentInstance();
  const POSITION_SLICE_NUM = booleanProcessEnv(process.env.IF_CPUS_NUM_SAFE)
    ? 128
    : 0;

  const getCurrentPositionsForSub = (watcher: KungfuApi.Watcher) => {
    if (!currentGlobalKfLocation.value) return [];

    const positions = globalThis.HookKeeper.getHooks().dealTradingData.trigger(
      watcher,
      currentGlobalKfLocation.value,
      watcher.ledger.Position,
      'position',
    ) as KungfuApi.Position[];

    return positions
      .reverse()
      .slice(0, POSITION_SLICE_NUM) // default subscribe POSITION_SLICE_NUM tickers, then subscribe by clicking position or manually subscribing
      .map((item: KungfuApi.Position): KungfuApi.InstrumentForSub => {
        const uidKey = hashInstrumentUKey(item.instrument_id, item.exchange_id);
        return {
          uidKey,
          exchangeId: item.exchange_id,
          instrumentId: item.instrument_id,
          instrumentType: item.instrument_type,
          instrumentName: '',
          ukey: uidKey,
          id: uidKey,
        };
      });
  };

  const subscribeInstrumentsByCurPosAndProcessIds = (
    instrumentsForSub: KungfuApi.InstrumentForSub[],
    filterByCached = true,
  ) => {
    const instrumentsForSubResolved = instrumentsForSub.filter((item) => {
      if (!filterByCached) return true;
      if (filterByCached && !curSubscribedInstruments[item.uidKey]) {
        return true;
      }
      return false;
    });

    if (!instrumentsForSubResolved.length) return;

    subscribeAllInstrumentByAppStates(
      processStatusData.value,
      appStates.value,
      mdExtTypeMap.value,
      instrumentsForSubResolved,
    ).then((subscribedSuccessInstruments) => {
      const subscribedInstrumentsMap = (
        subscribedSuccessInstruments as KungfuApi.InstrumentForSub[]
      ).reduce((subscribedInstruments, item) => {
        subscribedInstruments[item.uidKey] = true;
        return subscribedInstruments;
      }, {} as Record<string, boolean>);

      setCurSubscribedInstruments(subscribedInstrumentsMap);
    });
  };

  onMounted(() => {
    if (app?.proxy) {
      const subscription = app.proxy.$tradingDataSubject
        .pipe(throttleTime(30000))
        .subscribe((data) => {
          const { watcher } = data;
          const instrumentsForSub = customInstrumentsForSubGetter
            ? customInstrumentsForSubGetter(watcher)
            : getCurrentPositionsForSub(watcher);
          subscribeInstrumentsByCurPosAndProcessIds(instrumentsForSub);
        });

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });
    }
  });
  watch(appStates, (newAppStates, oldAppStates) => {
    Object.keys(newAppStates || {}).forEach((processId: string) => {
      const newState = newAppStates[processId];
      const oldState = oldAppStates[processId];

      if (
        isBrokerStateReady(newState) &&
        !isBrokerStateReady(oldState) &&
        processStatusData.value[processId] === 'online' &&
        processId.includes('md_')
      ) {
        const instrumentsForSub = customInstrumentsForSubGetter
          ? customInstrumentsForSubGetter(window.watcher)
          : [
              ...subscribedInstrumentsByLocal.value.map((instrument) => ({
                ...instrument,
                uidKey: instrument.ukey,
              })),
              ...getCurrentPositionsForSub(window.watcher),
            ];

        subscribeInstrumentsByCurPosAndProcessIds(instrumentsForSub, false);
      }
    });
  });
};

export const getInstrumentByInstrumentPair = (
  instrumentPair: {
    instrument_id: string;
    instrument_type: InstrumentTypeEnum;
    exchange_id: string;
  },
  instruments: KungfuApi.InstrumentResolved[],
): KungfuApi.InstrumentResolved => {
  const { instrument_id, instrument_type, exchange_id } = instrumentPair;
  const ukey = hashInstrumentUKey(instrument_id, exchange_id);
  const targetInstrumnet: KungfuApi.InstrumentResolved | null =
    findTargetFromArray<KungfuApi.InstrumentResolved>(
      instruments,
      'ukey',
      ukey,
    );
  const instrumentName = targetInstrumnet?.instrumentName || '';
  const instrumentType = targetInstrumnet?.instrumentType;
  return {
    exchangeId: exchange_id,
    instrumentId: instrument_id,
    instrumentType: instrumentType || instrument_type,
    instrumentName,
    ukey,
    id: `${instrument_id}_${instrumentName}_${exchange_id}`.toLowerCase(),
  };
};

export const useQuote = (): {
  quotes: Ref<Record<string, KungfuApi.Quote>>;
  getQuoteByInstrument(
    instrument: KungfuApi.InstrumentResolved | undefined,
  ): KungfuApi.Quote | null;
  getQuoteByPosition(
    posiiton: KungfuApi.Position | undefined,
  ): KungfuApi.Quote | null;
  getPositionLastPrice: <
    T extends KungfuApi.Position | KungfuApi.PositionResolved,
  >(
    pos: T,
    lastPriceKey?: keyof T,
  ) => number;
  getLastPricePercent(
    instrument: KungfuApi.InstrumentResolved | undefined,
  ): string;
  getPreClosePrice(
    instrument: KungfuApi.InstrumentResolved | undefined,
  ): string;
  isInstrumentUpLimit: (instrument: KungfuApi.InstrumentResolved) => boolean;
  isInstrumentLowLimit: (instrument: KungfuApi.InstrumentResolved) => boolean;
  isInstrumentSuspension: (instrument: KungfuApi.InstrumentResolved) => boolean;
} => {
  const quotes = ref<Record<string, KungfuApi.Quote>>({});
  const app = getCurrentInstance();

  onActivated(() => {
    if (app?.proxy) {
      const subscription = app.proxy.$tradingDataSubject.subscribe((data) => {
        const { watcher } = data;
        quotes.value = toRaw({ ...watcher.ledger.Quote });
      });

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });

      onDeactivated(() => {
        subscription?.unsubscribe();
      });
    }
  });

  const getQuoteByInstrument = (
    instrument: KungfuApi.InstrumentResolved | undefined,
  ): KungfuApi.Quote | null => {
    if (!instrument) {
      return null;
    }

    const { ukey } = instrument;
    const quote = quotes.value[ukey] as KungfuApi.Quote | undefined;
    return quote || null;
  };

  const getQuoteByPosition = (
    position: KungfuApi.Position | undefined,
  ): KungfuApi.Quote | null => {
    if (!position) {
      return null;
    }

    const ukey = hashInstrumentUKey(
      position.instrument_id,
      position.exchange_id,
    );

    const instrumentResolved: KungfuApi.InstrumentResolved = {
      instrumentId: position.instrument_id,
      exchangeId: position.exchange_id,
      instrumentName: '',
      instrumentType: position.instrument_type,
      ukey,
      id: position.uid_key,
    };

    return getQuoteByInstrument(instrumentResolved);
  };

  const getPositionLastPrice = <
    T extends KungfuApi.Position | KungfuApi.PositionResolved,
  >(
    pos: T,
    lastPriceKey: keyof T = 'last_price',
  ) => {
    //有行情时，根据 quote 和 position 更新时间取最新 last_price,
    // 若 position 没有 last_price, 则取 quote 的 last_price
    const quote = getQuoteByPosition(pos);
    const precision = getPrecisionByInstrumentType(pos.instrument_type);
    if (quote) {
      return dealKfDecimalPrecision(
        quote.last_price || Number(pos[lastPriceKey]) || 0,
        precision,
      );
    }
    return dealKfDecimalPrecision(Number(pos[lastPriceKey]) || 0, precision);
  };

  const getLastPricePercent = (
    instrument: KungfuApi.InstrumentResolved,
  ): string => {
    const quote = getQuoteByInstrument(instrument);
    const precision = getPrecisionByInstrumentType(instrument.instrumentType);
    if (!quote) {
      return '--';
    }

    const { pre_close_price, last_price } = quote;
    if (!pre_close_price || !last_price) {
      return '--';
    }

    const percent = dealKfDecimalPrecision(
      (last_price - pre_close_price) / pre_close_price,
      precision,
    );
    if (percent === Infinity) {
      return '--';
    }

    if (percent === Number.MAX_VALUE || percent === Number.MIN_VALUE) {
      return '--';
    }

    return Number(percent * 100).kfToFixed(2) + '%';
  };

  const getPreClosePrice = (
    instrument: KungfuApi.InstrumentResolved,
  ): string => {
    const quote = getQuoteByInstrument(instrument);

    if (!quote) {
      return '--';
    }

    const { pre_close_price } = quote;
    return dealKfNumber(pre_close_price, 2);
  };

  const isInstrumentUpLimit = (instrument: KungfuApi.InstrumentResolved) => {
    const quote = getQuoteByInstrument(instrument);

    if (!quote) {
      return false;
    }

    const { last_price, upper_limit_price, pre_close_price } = quote;

    if (!last_price || !upper_limit_price || !pre_close_price) return false;

    return (
      last_price >= upper_limit_price || last_price >= pre_close_price * 1.1
    );
  };

  const isInstrumentLowLimit = (instrument: KungfuApi.InstrumentResolved) => {
    const quote = getQuoteByInstrument(instrument);

    if (!quote) {
      return false;
    }

    const { last_price, lower_limit_price, pre_close_price } = quote;

    if (!last_price || !lower_limit_price || !pre_close_price) return false;

    return (
      last_price <= lower_limit_price || last_price <= pre_close_price * 0.9
    );
  };

  const isInstrumentSuspension = (instrument: KungfuApi.InstrumentResolved) => {
    const quote = getQuoteByInstrument(instrument);

    if (!quote) {
      return false;
    }

    const { exchangeId } = instrument;
    const { trading_phase_code } = quote;

    if (!trading_phase_code) return false;

    switch (exchangeId) {
      case 'SSE':
        return trading_phase_code[0] === 'P' || trading_phase_code[0] === 'N';
      case 'SZE':
        return (
          trading_phase_code[0] === 'H' ||
          trading_phase_code[0] === 'V' ||
          trading_phase_code[1] === '1'
        );
      default:
        return false;
    }
  };

  return {
    quotes,
    getQuoteByInstrument,
    getQuoteByPosition,
    getPositionLastPrice,
    getLastPricePercent,
    getPreClosePrice,
    isInstrumentUpLimit,
    isInstrumentLowLimit,
    isInstrumentSuspension,
  };
};

export const useDealInstruments = (): void => {
  const app = getCurrentInstance();
  const dealInstrumentController = ref<boolean>(false);
  const existedInstrumentsLength = ref<number>(0);
  const dealedInstrumentsLength = ref<number>(0);

  onMounted(() => {
    if (app?.proxy) {
      dealInstrumentController.value = true;
      window.workers.dealInstruments.postMessage({
        tag: 'req_instruments',
      });

      const subscription = app.proxy.$tradingDataSubject
        .pipe(throttleTime(5000))
        .subscribe((data) => {
          const { watcher } = data;
          const instruments = watcher.ledger.Instrument.list();
          const instrumentsLength = instruments.length;
          if (!instruments || !instrumentsLength) {
            return;
          }

          if (
            !dealInstrumentController.value &&
            instrumentsLength > dealedInstrumentsLength.value
          ) {
            dealInstrumentController.value = true;
            dealedInstrumentsLength.value = instrumentsLength;
            instruments.forEach((item: KungfuApi.Instrument) => {
              item.ukey = item.uid_key;
            });
            window.workers.dealInstruments.postMessage({
              tag: 'req_dealInstruments',
              instruments: instruments,
            });
          }
        });

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });
    }
  });

  window.workers.dealInstruments.onmessage = (event: {
    data: {
      tag: string;
      instruments: Record<string, KungfuApi.InstrumentResolved>;
    };
  }) => {
    const { instruments } = event.data || {};

    const instrumentsValue = Object.values(instruments);
    dealInstrumentController.value = false;
    if (instrumentsValue.length) {
      existedInstrumentsLength.value = instrumentsValue.length || 0;
      const globalStore = useGlobalStore();
      globalStore.setInstruments(instrumentsValue);
      globalStore.setInstrumentsMap(instruments);
      globalStore.setSubscribedInstrumentsByLocal();
    }
  };
};

export const useActiveInstruments = () => {
  const { instrumentsMap } = storeToRefs(useGlobalStore());

  const getInstrumentByIds = (
    instrumentId: string,
    exchangeId: string,
    forceConvert = false,
  ) => {
    const ukey = hashInstrumentUKey(instrumentId, exchangeId);
    const instrumentResolved = instrumentsMap.value[ukey];
    if (instrumentResolved) {
      return instrumentResolved;
    } else {
      return forceConvert
        ? {
            instrumentId: instrumentId,
            exchangeId: exchangeId,
            instrumentType: window.watcher.getInstrumentType(
              exchangeId,
              instrumentId,
            ),
            ukey,
            instrumentName: '',
            id: `${instrumentId}_${''}_${exchangeId}`.toLowerCase(),
          }
        : null;
    }
  };

  const getInstrumentByIdsWithWatcher = (
    instrumentId: string,
    exchangeId: string,
  ) => {
    const ukey = hashInstrumentUKey(instrumentId, exchangeId);
    const watcher = window.watcher as KungfuApi.Watcher;
    const instrument = watcher.ledger.Instrument[ukey];
    if (instrument) return instrument;

    return null;
  };

  const getInstrumentCurrencyByIds = (
    instrumentId: string,
    exchangeId: string,
  ) => {
    const instrument = getInstrumentByIdsWithWatcher(instrumentId, exchangeId);
    if (instrument) {
      return instrument.currency;
    }

    return CurrencyEnum.Unknown;
  };

  const getPriceTickAndPrecision = (
    instrumentId: string,
    exchangeId: string,
    defaultTick = 1,
    defaultPrecision = 0,
  ) => {
    const instrument = getInstrumentByIdsWithWatcher(instrumentId, exchangeId);
    const price_tick = instrument?.price_tick || defaultTick;
    const price_precision = countDecimalPlaces(
      instrument?.price_tick || defaultPrecision,
    );
    return { price_tick, price_precision };
  };

  const getQuantityUnitAndPrecision = (
    instrumentId: string,
    exchangeId: string,
    defaultUnit = 0,
  ) => {
    const instrument = getInstrumentByIdsWithWatcher(instrumentId, exchangeId);
    const quantity_unit = instrument?.quantity_unit || defaultUnit;
    const volume_precision = countDecimalPlaces(quantity_unit || defaultUnit);
    return { quantity_unit, volume_precision };
  };

  const getInstrumentCurrency = (instrumentId: string, exchangeId: string) => {
    const instrument = getInstrumentByIdsWithWatcher(instrumentId, exchangeId);
    const currency = instrument?.currency || CurrencyEnum.Unknown;
    return currency;
  };

  const getInstrumentName = (
    instrumentId: string,
    exchangeId: string,
    instrumentType: InstrumentTypeEnum,
  ) => {
    if (!isStock(instrumentType)) {
      return '';
    }

    const ukey = hashInstrumentUKey(instrumentId, exchangeId);
    const instrumentResolved = instrumentsMap.value[ukey];
    return instrumentResolved ? instrumentResolved.instrumentName : '';
  };

  return {
    getInstrumentByIds,
    getInstrumentByIdsWithWatcher,
    getInstrumentCurrencyByIds,
    getPriceTickAndPrecision,
    getInstrumentCurrency,
    getInstrumentName,
    getQuantityUnitAndPrecision,
  };
};

export const useProcessStatusDetailData = (): {
  processStatusData: Ref<Pm2ProcessStatusData>;
  processStatusDetailData: Ref<Pm2ProcessStatusDetailData>;
  appStates: Ref<Record<string, BrokerStateStatusTypes>>;
  getProcessStatusName(
    kfConfig: KungfuApi.KfLocation,
  ): ProcessStatusTypes | undefined;
  getStrategyStatusName(
    kfConfig: KungfuApi.KfLocation,
  ): ProcessStatusTypes | undefined;
} => {
  const allProcessStatusData = reactive<{
    processStatusData: Pm2ProcessStatusData;
    processStatusDetailData: Pm2ProcessStatusDetailData;
    appStates: Record<string, BrokerStateStatusTypes>;
    strategyStates: Record<string, KungfuApi.StrategyStateData>;
  }>({
    processStatusData: {},
    processStatusDetailData: {},
    appStates: {},
    strategyStates: {},
  });

  onMounted(() => {
    const {
      processStatusData,
      processStatusWithDetail,
      appStates,
      strategyStates,
    } = storeToRefs(useGlobalStore());
    allProcessStatusData.processStatusData =
      processStatusData as unknown as Pm2ProcessStatusData;
    allProcessStatusData.processStatusDetailData =
      processStatusWithDetail as unknown as Pm2ProcessStatusDetailData;
    allProcessStatusData.appStates = appStates as unknown as Record<
      string,
      BrokerStateStatusTypes
    >;
    allProcessStatusData.strategyStates = strategyStates as unknown as Record<
      string,
      KungfuApi.StrategyStateData
    >;
  });

  const getProcessStatusName = (kfConfig: KungfuApi.KfLocation) => {
    return getAppStateStatusName(
      kfConfig,
      allProcessStatusData.processStatusData,
      allProcessStatusData.appStates,
    );
  };

  const getStrategyStatusName = (kfConfig: KungfuApi.KfLocation) => {
    return getStrategyStateStatusName(
      kfConfig,
      allProcessStatusData.processStatusData,
      allProcessStatusData.strategyStates,
    );
  };

  const { processStatusData, processStatusDetailData, appStates } =
    toRefs(allProcessStatusData);

  return {
    processStatusData,
    processStatusDetailData,
    appStates,
    getProcessStatusName,
    getStrategyStatusName,
  };
};

export const useExtConfigsRelated = (): {
  extConfigs: Ref<KungfuApi.KfExtConfigs>;
  uiExtConfigs: Ref<KungfuApi.KfUIExtConfigs>;
  tdExtTypeMap: ComputedRef<Record<string, InstrumentTypes>>;
  mdExtTypeMap: ComputedRef<Record<string, InstrumentTypes>>;
  strategyExtTypeMap: ComputedRef<Record<string, StrategyExtTypes>>;
} => {
  const { extConfigs, uiExtConfigs } = storeToRefs(useGlobalStore());
  const tdExtTypeMap = computed(
    () =>
      buildExtTypeMap(extConfigs.value, 'td') as Record<
        string,
        InstrumentTypes
      >,
  );
  const mdExtTypeMap = computed(
    () =>
      buildExtTypeMap(extConfigs.value, 'md') as Record<
        string,
        InstrumentTypes
      >,
  );

  const strategyExtTypeMap = computed(
    () =>
      buildExtTypeMap(extConfigs.value, 'strategy') as Record<
        string,
        StrategyExtTypes
      >,
  );

  return {
    extConfigs,
    uiExtConfigs,
    tdExtTypeMap,
    mdExtTypeMap,
    strategyExtTypeMap,
  };
};

export const useCurrentGlobalKfLocation = (
  watcher: KungfuApi.Watcher | null,
): {
  currentGlobalKfLocation: Ref<
    KungfuApi.KfLocation | KungfuApi.KfLocationGroup | KungfuApi.KfConfig | null
  >;
  currentCategoryData: ComputedRef<KungfuApi.KfTradeValueCommonData | null>;
  currentUID: ComputedRef<number>;
  setCurrentGlobalKfLocation(
    kfConfig:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ): void;
  resetCurrentGlobalKfLocation(): void;
  dealRowClassName(
    kfConfig:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ): string;
  customRow(
    kfConfig:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ): {
    onClick(): void;
  };
  getCurrentGlobalKfLocationId(
    kfConfig: KungfuApi.KfLocation | KungfuApi.KfConfig | null,
  ): string;
} => {
  const { currentGlobalKfLocation } = storeToRefs(useGlobalStore());

  const setCurrentGlobalKfLocation = (
    kfLocation:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ) => {
    useGlobalStore().setCurrentGlobalKfLocation(kfLocation);
  };

  const resetCurrentGlobalKfLocation = () => {
    useGlobalStore().setCurrentGlobalKfLocation(null);
    useGlobalStore().setDefaultCurrentGlobalKfLocation();
  };

  const dealRowClassName = (
    record:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ): string => {
    if (!currentGlobalKfLocation.value) return '';

    if (
      getIdByKfLocation(record) ===
      getIdByKfLocation(currentGlobalKfLocation.value)
    ) {
      return 'current-global-kfLocation';
    }

    return '';
  };

  const customRow = (
    record:
      | KungfuApi.KfLocation
      | KungfuApi.KfConfig
      | KungfuApi.KfExtraLocation,
  ) => {
    return {
      onClick: () => {
        setCurrentGlobalKfLocation(record);
      },
    };
  };

  const currentCategoryData = computed(() => {
    if (!currentGlobalKfLocation.value) {
      return null;
    }

    const extraCategory: Record<string, KungfuApi.KfTradeValueCommonData> =
      globalThis.HookKeeper.getHooks().dealTradingData.getCategoryMap();
    return dealCategory(currentGlobalKfLocation.value?.category, extraCategory);
  });

  const currentUID = computed(() => {
    if (!watcher) {
      return 0;
    }

    if (!currentGlobalKfLocation.value) {
      return 0;
    }

    return watcher.getLocationUID(currentGlobalKfLocation.value);
  });

  const getCurrentGlobalKfLocationId = (
    kfConfig: KungfuApi.KfLocation | KungfuApi.KfConfig | null,
  ): string => {
    if (!kfConfig) {
      return '';
    }

    return getIdByKfLocation(kfConfig) || '';
  };

  return {
    currentGlobalKfLocation,
    currentCategoryData,
    currentUID,
    setCurrentGlobalKfLocation,
    resetCurrentGlobalKfLocation,
    dealRowClassName,
    customRow,
    getCurrentGlobalKfLocationId,
  };
};

export const useAllKfConfigData = (): Record<
  KfCategoryTypes,
  KungfuApi.KfLocation[]
> => {
  const allKfConfigData: Record<KfCategoryTypes, KungfuApi.KfLocation[]> =
    reactive({
      system: ref<
        (
          | KungfuApi.KfConfig
          | KungfuApi.KfExtraLocation
          | KungfuApi.KfExtServiceLocation
        )[]
      >([
        ...(process.env.NODE_ENV === 'development'
          ? [
              {
                ...buildArchiveLocation(),
                location_uid: 0,
                value: '',
              },
            ]
          : []),
        {
          ...buildMasterLocation(),
          location_uid: 0,
          value: '',
        },
        {
          ...buildLedgerLocation(),
          location_uid: 0,
          value: '',
        },
      ]),

      md: [],
      td: [],
      strategy: [],
      operator: [],
    });

  onMounted(() => {
    const { mdList, tdList, strategyList, operatorList } = storeToRefs(
      useGlobalStore(),
    );

    allKfConfigData.md = mdList as unknown as KungfuApi.KfConfig[];
    allKfConfigData.td = tdList as unknown as KungfuApi.KfConfig[];
    allKfConfigData.strategy = strategyList as unknown as KungfuApi.KfConfig[];
    allKfConfigData.operator = operatorList as unknown as KungfuApi.KfConfig[];

    getAvailExtServiceList().then((extServiceList) => {
      allKfConfigData.system.push(...extServiceList);
    });
  });

  return allKfConfigData;
};

export const useTdGroups = (): Ref<KungfuApi.KfExtraLocation[]> => {
  const { tdGroupList } = storeToRefs(useGlobalStore());
  return tdGroupList;
};

export const useAssets = (): {
  assets: Ref<Record<string, KungfuApi.Asset>>;
  getAssetsByKfConfig(
    kfLocation: KungfuApi.KfLocation | KungfuApi.KfConfig,
  ): KungfuApi.Asset;
  getAssetsByTdGroup(
    tdGroup: KungfuApi.KfExtraLocation,
  ): KungfuApi.Asset | Record<string, never>;
  dealAssetPrecision(asset: KungfuApi.Asset): KungfuApi.Asset;
} => {
  const { assets } = storeToRefs(useGlobalStore());

  const dealAssetPrecision = (asset: KungfuApi.Asset) => {
    const assetCopy = { ...asset };
    Object.keys(assetCopy).forEach((key) => {
      if (typeof assetCopy[key] === 'number') {
        assetCopy[key] = dealKfDecimalPrecision(
          assetCopy[key],
          ASSET_PRECISION,
        );
      }
    });
    return assetCopy;
  };

  const getAssetsByKfConfig = (
    kfConfig: KungfuApi.KfLocation | KungfuApi.KfConfig,
  ): KungfuApi.Asset => {
    const processId = getProcessIdByKfLocation(kfConfig);
    return assets.value[processId] || ({} as KungfuApi.Asset);
  };

  const getAssetsByTdGroup = (
    tdGroup: KungfuApi.KfExtraLocation,
  ): KungfuApi.Asset | Record<string, never> => {
    const children = (tdGroup?.children || []) as KungfuApi.KfConfig[];
    return children.reduce((allAssets, item) => {
      const asset = getAssetsByKfConfig(item);
      if (Object.keys(asset).length === 0) return allAssets;
      allAssets.unrealized_pnl =
        (allAssets.unrealized_pnl || 0) + asset.unrealized_pnl;
      allAssets.market_value =
        (allAssets.market_value || 0) + asset.market_value;
      allAssets.margin = (allAssets.margin || 0) + asset.margin;
      allAssets.avail = (allAssets.avail || 0) + asset.avail;
      allAssets.avail_margin =
        (allAssets.avail_margin || 0) + asset.avail_margin;
      allAssets.net_assets = (allAssets.net_assets || 0) + asset.net_assets;
      allAssets.long_total_debt =
        (allAssets.long_total_debt || 0) + asset.long_total_debt;
      allAssets.total_debt = (allAssets.total_debt || 0) + asset.total_debt;
      allAssets.short_cash = (allAssets.short_cash || 0) + asset.short_cash;
      allAssets.frozen_cash = (allAssets.frozen_cash || 0) + asset.frozen_cash;
      allAssets.total_asset = (allAssets.total_asset || 0) + asset.total_asset;
      allAssets.short_total_debt =
        (allAssets.short_total_debt || 0) + asset.short_total_debt;
      return allAssets;
    }, {} as KungfuApi.Asset);
  };

  return {
    assets,
    getAssetsByKfConfig,
    getAssetsByTdGroup,
    dealAssetPrecision,
  };
};

export async function getOperatorPath(
  record: KungfuApi.KfConfig,
): Promise<string> {
  const extDirs = await flattenExtensionModuleDirs(EXTENSION_DIRS);
  let filePath = '';

  for (let i = 0; i < extDirs.length; i++) {
    if (extDirs[i].split('/').pop() === record.group) {
      const dir = extDirs[i];

      const files = await new Promise<string[]>((resolve, reject) => {
        fse.readdir(dir, (err, files) => {
          if (err) {
            reject('Unable to scan directory: ' + err);
          } else {
            resolve(files);
          }
        });
      });

      const soFiles = files.filter((file) => path.extname(file) === '.so');

      if (soFiles.length > 0) {
        filePath = path.join(dir, soFiles[0]);
        return filePath;
      }
    }
  }

  return filePath;
}

export const useReplay = (): {
  currentLocation: Ref<KungfuApi.KfConfig | null>;
  replayConfig: Ref<KungfuApi.ReplayConfig>;
  setReplayModalVisible: Ref<boolean>;
  journalReplayflag: Ref<number>;
  replayProcessParams: Ref<
    | {
        category: string;
        group: string;
        name: string;
        mode: string;
        replayConfig: KungfuApi.ReplayConfig;
      }
    | undefined
  >;
  formatSessionTime: (time: bigint) => string;
  handleOpenReplayConfirmView(
    record: KungfuApi.KfConfig | KungfuApi.KfLocation,
    session?: KungfuApi.Session,
  ): Promise<void>;
  handleReplayModal(
    data: {
      sessionInfo: string;
      beginTime: string;
      endTime: string;
      logLevel: string;
      enableMatcher: boolean;
    },
    isJournal?: boolean,
  ): void;
  sessionOptions: Ref<
    {
      label: string;
      value: string;
    }[]
  >;
  replayPreLoading: Ref<boolean>;
  startLoadingInterval: () => void;
  stopLoadingInterval: () => void;
} => {
  let loadingTimer: NodeJS.Timeout | null = null;
  const DEFAULT_PRE_LOADING_TIME = 10000;
  const replayPreLoading = ref(false);
  const setReplayModalVisible = ref(false);
  const journalReplayflag = ref(0);
  const replayProcessParams = ref<
    | {
        category: string;
        group: string;
        name: string;
        mode: string;
        replayConfig: KungfuApi.ReplayConfig;
      }
    | undefined
  >(undefined);

  const currentLocation = ref<KungfuApi.KfConfig | null>(null);
  const replaySetting = JSON.parse(
    localStorage.getItem('replaySetting') || '{}',
  );
  const replayConfig = ref<KungfuApi.ReplayConfig>({
    session_info: '',
    group: 'default',
    category: '',
    begin_time: '',
    end_time: '',
    log_level: replaySetting.log_level || '-l info',
    session_name: '',
    file_path: '',
    enable_matcher: false,
  });
  const sessionOptions = ref<
    {
      label: string;
      value: string;
    }[]
  >([]);

  const formatSessionTime = (time: bigint) => {
    return kfFormatTime(time, '%Y-%m-%d %H:%M:%S.%N');
  };

  const handleOpenReplayConfirmView = async (
    record: KungfuApi.KfConfig,
    curSession?: KungfuApi.Session,
  ) => {
    let isOperator = false;
    let filePath = '';
    if (record.category === 'operator' && record.group !== 'default') {
      isOperator = true;
      filePath = await getOperatorPath(record);
    }
    sessionOptions.value = [];

    let currentSession: KungfuApi.Session | null = curSession || null;
    let sessionInfo = '';
    if (currentSession) {
      const beginTimeStr = formatSessionTime(currentSession.begin_time);
      const endTimeStr = currentSession.end_time
        ? formatSessionTime(currentSession.end_time)
        : 'now';
      sessionInfo = `${beginTimeStr}--${endTimeStr}`;
      sessionOptions.value.push({
        label: `${beginTimeStr}--${endTimeStr}`,
        value: `${beginTimeStr}--${endTimeStr}`,
      });
    } else {
      const sessions = await getAllSessions(null, window?.watcher);
      if (!sessions || sessions.length === 0) {
        error(t('replay.process_has_not_been_started'));
        return;
      }
      for (let i = sessions.length - 1; i >= 0; i--) {
        const item = sessions[i];
        if (
          KfCategoryNameMap[item.category] === record.category &&
          item.group === record.group &&
          item.name === record.name
        ) {
          currentSession ||= item;

          const beginTimeStr = formatSessionTime(item.begin_time);
          const endTimeStr = item.end_time
            ? formatSessionTime(item.end_time)
            : 'now';
          sessionInfo ||= `${beginTimeStr}--${endTimeStr}`;
          sessionOptions.value.push({
            label: `${beginTimeStr}--${endTimeStr}`,
            value: `${beginTimeStr}--${endTimeStr}`,
          });
        }
      }
    }

    if (!currentSession) {
      error(t('replay.process_has_not_been_started'));
      return;
    }
    const replaySetting = JSON.parse(
      localStorage.getItem('replaySetting') || '{}',
    );
    const beginTime = formatSessionTime(currentSession.begin_time);
    const endTime =
      replaySetting.end_time && replaySetting.end_time > beginTime
        ? replaySetting.end_time
        : currentSession.end_time
        ? formatSessionTime(currentSession.end_time)
        : formatSessionTime(BigInt(new Date().getTime()) * 1000000n);
    const logLevel = replaySetting.log_level || '-l info';
    const params = record.value ? JSON.parse(record.value) : {};

    replayConfig.value = {
      session_info: sessionInfo,
      group: record.group,
      category: record.category,
      begin_time: beginTime,
      end_time: endTime,
      log_level: logLevel,
      session_name: currentSession.name,
      file_path: isOperator ? filePath : params.file_path,
      enable_matcher: false,
    };
    currentLocation.value = record;
    setReplayModalVisible.value = true;
    return Promise.resolve();
  };

  const handleReplayModal = async (
    data: {
      sessionInfo: string;
      beginTime: string;
      endTime: string;
      logLevel: string;
      enableMatcher: boolean;
    },
    isJournal = false,
  ) => {
    if (!currentLocation.value) {
      error();
      return;
    }
    const mode = data.enableMatcher ? 'backtest' : 'replay';
    const beginTime = data.beginTime;
    const endTime =
      data.endTime ||
      formatSessionTime(BigInt(new Date().getTime()) * 1000000n);
    const replaySetting = {
      begin_time: beginTime,
      end_time: endTime,
      log_level: data.logLevel,
    };
    localStorage.setItem('replaySetting', JSON.stringify(replaySetting));
    setReplayModalVisible.value = false;
    const processId = getProcessIdByKfLocation({
      category: currentLocation.value.category,
      group: currentLocation.value.group,
      name: currentLocation.value.name,
      mode: mode,
    });
    replayConfig.value.begin_time = beginTime;
    replayConfig.value.end_time = endTime;
    replayConfig.value.log_level = data.logLevel;
    replayConfig.value.enable_matcher = data.enableMatcher;
    const params = {
      category: currentLocation.value.category,
      group: currentLocation.value.group,
      name: currentLocation.value.name,
      mode: mode,
      replayConfig: replayConfig.value,
    };

    const replayArgsStr = localStorage.getItem('replayConfigs');
    const replayArgsObj = replayArgsStr ? JSON.parse(replayArgsStr) : {};
    replayArgsObj[processId] = {
      args: params,
      filePath: replayConfig.value.file_path,
    };
    localStorage.setItem('replayConfigs', JSON.stringify(replayArgsObj));

    if (isJournal) {
      const { startProcess, ProcessConfigs } = await getJournalReplayConfigs(
        currentLocation.value,
        replayConfig.value,
        journalReplayflag.value,
      );
      journalReplayflag.value = startProcess;
      replayProcessParams.value = ProcessConfigs;
    } else {
      await handleOpenReplayView(
        currentLocation.value,
        beginTime,
        endTime,
        data.logLevel,
        processId,
        replayConfig.value,
      );
    }
  };

  const startLoadingInterval = () => {
    if (loadingTimer) clearInterval(loadingTimer);
    replayPreLoading.value = true;
    loadingTimer = setInterval(() => {
      replayPreLoading.value = false;
    }, DEFAULT_PRE_LOADING_TIME);
  };

  const stopLoadingInterval = () => {
    if (loadingTimer) clearInterval(loadingTimer);
    replayPreLoading.value = false;
  };

  return {
    currentLocation,
    replayConfig,
    setReplayModalVisible,
    formatSessionTime,
    journalReplayflag,
    sessionOptions,
    replayProcessParams,
    handleOpenReplayConfirmView,
    handleReplayModal,
    startLoadingInterval,
    stopLoadingInterval,
    replayPreLoading,
  };
};

export const playSound = (type: 'ding' | 'warn' = 'ding'): void => {
  const soundPath = path.join(
    `${path.join(KUNGFU_RESOURCES_DIR, `music/${type}.mp3`)}`,
  );
  const { globalSetting } = storeToRefs(useGlobalStore());
  if (globalSetting.value?.trade?.sound) {
    sound.play(soundPath);
  }
};

export const useCurrentPositionList = () => {
  const app = getCurrentInstance();

  const { currentGlobalKfLocation } = useCurrentGlobalKfLocation(
    window.watcher,
  );
  const { dealDataWithCache } = useDealDataWithCaches<
    KungfuApi.Position,
    KungfuApi.PositionResolved
  >(['uid_key', 'update_time']);
  const currentPositionList = ref<KungfuApi.PositionResolved[]>([]);

  onActivated(() => {
    if (app?.proxy) {
      const subscription = app.proxy.$tradingDataSubject.subscribe((data) => {
        const { watcher } = data;
        if (!currentGlobalKfLocation.value) return;

        const currentPositions =
          globalThis.HookKeeper.getHooks().dealTradingData.trigger(
            window.watcher,
            currentGlobalKfLocation.value,
            watcher.ledger.Position,
            'position',
          ) as KungfuApi.Position[];
        currentPositionList.value = toRaw(
          currentPositions
            .reverse()
            .map((item) =>
              dealDataWithCache(item, () => dealPosition(watcher, item)),
            ),
        );
      });

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });

      onDeactivated(() => {
        subscription.unsubscribe();
      });
    }
  });

  return {
    currentPositionList,
  };
};

export const useFormCurrentState = (
  formState: Ref<Record<string, KungfuApi.KfConfigValue>>,
  keys?: {
    accountKey?: string;
    instrumentKey?: string;
  },
) => {
  const { currentGlobalKfLocation } = useCurrentGlobalKfLocation(
    window.watcher,
  );
  const accountKey = keys?.accountKey || 'account_id';
  const instrumentKey = keys?.instrumentKey || 'account_id';

  const curInstrumentResolved = computed(() => {
    const instrument = formState.value[instrumentKey];
    return instrument
      ? transformSearchInstrumentResultToInstrument(instrument)
      : null;
  });

  const currentAccountLocation = computed(() => {
    if (
      currentGlobalKfLocation.value &&
      currentGlobalKfLocation.value.category === 'td'
    ) {
      return currentGlobalKfLocation.value;
    } else if (formState.value[accountKey]) {
      const { source, id } = formState.value[accountKey].parseSourceAccountId();
      return {
        category: 'td',
        group: source,
        name: id,
        mode: 'live',
      } as KungfuApi.KfLocation;
    } else {
      return null;
    }
  });

  return {
    curInstrumentResolved,
    currentAccountLocation,
  };
};

export const getPosClosableVolumeByOffset = (
  position: KungfuApi.Position,
  offset: OffsetEnum,
) => {
  const {
    instrument_type,
    exchange_id,
    volume,
    yesterday_volume,
    frozen_total,
    frozen_yesterday,
  } = position;
  const precision = getPrecisionByInstrumentType(position.instrument_type);
  const today_volume = dealKfDecimalPrecision(
    volume - yesterday_volume,
    precision,
  );
  const frozen_today = frozen_total - frozen_yesterday;
  const shotable_closable_yesterday = dealKfDecimalPrecision(
    yesterday_volume - frozen_yesterday,
    precision,
  );
  const closable_yesterday = dealKfDecimalPrecision(
    yesterday_volume - frozen_total,
    precision,
  );
  const closable_today = dealKfDecimalPrecision(
    today_volume - frozen_today,
    precision,
  );
  const closable_total = dealKfDecimalPrecision(
    volume - frozen_total,
    precision,
  );

  if (isShotable(instrument_type) || isT0(instrument_type, exchange_id)) {
    if (offset === OffsetEnum.CloseYest) {
      return shotable_closable_yesterday;
    } else if (offset === OffsetEnum.CloseToday) {
      return closable_today;
    } else {
      return closable_total;
    }
  } else {
    return closable_yesterday;
  }
};

export const useCurrentAccountLocation = (
  currentGlobalKfLocation: Ref<
    KungfuApi.KfLocation | KungfuApi.KfLocationGroup | KungfuApi.KfConfig | null
  >,
  formState: Ref<Record<string, KungfuApi.KfConfigValue>>,
) => {
  const isCurrentCategoryIsTd = computed(
    () => currentGlobalKfLocation.value?.category === 'td',
  );
  const currentAccountLocation = computed(() => {
    if (currentGlobalKfLocation.value && isCurrentCategoryIsTd.value) {
      return currentGlobalKfLocation.value;
    } else if (formState.value.account_id) {
      const { source, id } = formState.value.account_id.parseSourceAccountId();
      return {
        category: 'td',
        group: source,
        name: id,
        mode: 'live',
      } as KungfuApi.KfLocation;
    } else {
      return null;
    }
  });

  return {
    currentAccountLocation,
  };
};

export const useMakeOrderInfo = (
  formState: Ref<Record<string, KungfuApi.KfConfigValue>>,
  isMarginMakeOrderSupport: Ref<boolean>,
) => {
  const { currentGlobalKfLocation } = useCurrentGlobalKfLocation(
    window.watcher,
  );
  const { currentAccountLocation } = useCurrentAccountLocation(
    currentGlobalKfLocation,
    formState,
  );
  const { getPositionLastPrice } = useQuote();
  const { currentPositionList } = useCurrentPositionList();
  const { getAssetsByKfConfig } = useAssets();

  const instrumentResolved = computed(() => {
    const { instrument } = formState.value;
    return instrument
      ? transformSearchInstrumentResultToInstrument(instrument)
      : null;
  });

  const isCurrentCategoryIsTd = computed(
    () => currentGlobalKfLocation.value?.category === 'td',
  );

  const isCurrentCategoryIsTdOrStrategy = computed(
    () =>
      isCurrentCategoryIsTd.value ||
      currentGlobalKfLocation.value?.category === 'strategy',
  );

  const isAccountOrInstrumentConfirmed = computed(() => {
    if (isMarginMakeOrderSupport.value) {
      return true;
    }
    if (formState.value?.side === SideEnum.Buy) {
      return isCurrentCategoryIsTd.value ? true : !!formState.value.account_id;
    } else if (formState.value.side === SideEnum.Sell) {
      return isCurrentCategoryIsTd.value
        ? !!formState.value.instrument
        : formState.value.account_id && formState.value.instrument;
    }
    return false;
  });

  const showAmountOrPosition = computed(() => {
    const { offset, side } = formState.value;
    if (isMarginMakeOrderSupport.value) {
      return isShowPosition(side) ? 'position' : 'amount';
    }
    return offset === OffsetEnum.Open ? 'amount' : 'position';
  });

  const currentPositionHolderLocation = computed(() => {
    if (
      currentGlobalKfLocation.value &&
      isCurrentCategoryIsTdOrStrategy.value
    ) {
      return currentGlobalKfLocation.value;
    } else if (formState.value.account_id) {
      const { source, id } = formState.value.account_id.parseSourceAccountId();
      return {
        category: 'td',
        group: source,
        name: id,
        mode: 'live',
      } as KungfuApi.KfLocation;
    } else {
      return null;
    }
  });

  const currentFormDirection = computed(() => {
    const { side, offset } = formState.value;

    if (side === SideEnum.Buy) {
      if (offset === OffsetEnum.Open) {
        return DirectionEnum.Long;
      } else {
        return DirectionEnum.Short;
      }
    } else if (side === SideEnum.Sell) {
      if (offset === OffsetEnum.Open) {
        return DirectionEnum.Short;
      } else {
        return DirectionEnum.Long;
      }
    }

    return null;
  });

  const getPositionByInstrumentAndDirection = (
    positionList: KungfuApi.PositionResolved[],
    instrument: KungfuApi.InstrumentResolved | null,
    direction: DirectionEnum,
  ) => {
    if (!currentPositionHolderLocation.value) return null;
    if (!positionList.length || !instrument) return null;

    const currentAccountLocationUID = (
      window.watcher as KungfuApi.Watcher
    ).getLocationUID(currentPositionHolderLocation.value);

    const { exchangeId, instrumentId, instrumentType } = instrument;
    const targetPositionList: KungfuApi.PositionResolved[] =
      positionList.filter(
        (position) =>
          position.exchange_id === exchangeId &&
          position.instrument_id === instrumentId &&
          position.instrument_type === instrumentType &&
          position.holder_uid === currentAccountLocationUID,
      );

    if (targetPositionList && targetPositionList.length) {
      const targetPositionWithLongDirection = targetPositionList.filter(
        (item) => item.direction === direction,
      );

      if (targetPositionWithLongDirection.length) {
        return targetPositionWithLongDirection[0];
      }
    }

    return null;
  };

  const currentPositionWithLongDirection = computed(() => {
    return getPositionByInstrumentAndDirection(
      currentPositionList.value,
      instrumentResolved.value,
      DirectionEnum.Long,
    );
  });

  const currentPositionWithShortDirection = computed(() => {
    return getPositionByInstrumentAndDirection(
      currentPositionList.value,
      instrumentResolved.value,
      DirectionEnum.Short,
    );
  });

  const currentPosition = computed(() => {
    if (isMarginMakeOrderSupport.value)
      return currentPositionWithLongDirection.value;
    if (currentFormDirection.value === DirectionEnum.Long) {
      return currentPositionWithLongDirection.value;
    } else if (currentFormDirection.value === DirectionEnum.Short) {
      return currentPositionWithShortDirection.value;
    }

    return null;
  });

  const currentAvailMoney = computed(() => {
    if (!currentAccountLocation.value) return '--';
    const precision = getPrecisionByInstrumentType(
      instrumentResolved.value?.instrumentType,
    );
    if (isMarginMakeOrderSupport.value) {
      const { side } = formState.value;
      if (side === SideEnum.GuaranteeStockBuy) {
        const avail = getAssetsByKfConfig(
          currentAccountLocation.value,
        ).gage_buy_fund_available;

        return dealKfNumber(avail, precision);
      } else if (side === SideEnum.MarginTrade || side === SideEnum.ShortSell) {
        const avail = getAssetsByKfConfig(
          currentAccountLocation.value,
        ).credit_buy_fund_available;

        return dealKfNumber(avail, precision);
      } else if (side === SideEnum.RepayStock) {
        const avail = getAssetsByKfConfig(
          currentAccountLocation.value,
        ).buyredeliver_fund_available;

        return dealKfNumber(avail, precision);
      }
    }

    const avail = getAssetsByKfConfig(currentAccountLocation.value).avail;

    return dealKfNumber(avail, precision);
  });

  const currentAvailPosVolume = computed(() => {
    const precision = getPrecisionByInstrumentType(
      instrumentResolved.value?.instrumentType,
    );
    if (!instrumentResolved.value) return '--';

    const { offset } = formState.value;

    if (currentPosition.value) {
      if (isMarginMakeOrderSupport.value) {
        return dealKfNumber(currentPosition.value.closable_volume, precision);
      }
      return getPosClosableVolumeByOffset(currentPosition.value, offset) + '';
    }

    return '0';
  });

  const currentPrice = computed(() => {
    const { price_type, limit_price } = formState.value;

    if (price_type === PriceTypeEnum.Limit) {
      return limit_price as number;
    } else if (price_type === PriceTypeEnum.Market) {
      if (currentPosition.value) {
        return getPositionLastPrice(currentPosition.value);
      }
    }

    return limit_price as number;
  });

  const currentTradeAmount = computed(() => {
    const { volume } = formState.value;
    const precision = getPrecisionByInstrumentType(
      instrumentResolved.value?.instrumentType,
    );
    if (instrumentResolved.value && currentAccountLocation.value) {
      const instrumentForAccounting: KungfuApi.InstrumentForAccounting = {
        ...instrumentResolved.value,
        price: currentPrice.value,
        volume: volume,
        direction: currentFormDirection.value || DirectionEnum.Long,
        accountUID: (window.watcher as KungfuApi.Watcher).getLocationUID(
          currentAccountLocation.value,
        ),
      };
      if (instrumentResolved.value.instrumentType in TradeAccountingUsageMap) {
        return dealKfNumber(
          TradeAccountingUsageMap[
            instrumentResolved.value.instrumentType as InstrumentTypeEnum
          ].getTradeAmount(window.watcher, instrumentForAccounting),
        );
      }
    }

    return dealKfNumber(
      dealKfDecimalPrecision(currentPrice.value * volume, precision),
    );
  });

  const currentResidueMoney = computed(() => {
    const { offset } = formState.value;
    const precision = getPrecisionByInstrumentType(
      instrumentResolved.value?.instrumentType,
    );
    if (currentAvailMoney.value !== '--') {
      if (currentTradeAmount.value !== '--') {
        if (offset === OffsetEnum.Open) {
          return dealKfNumber(
            Number(currentAvailMoney.value) - Number(currentTradeAmount.value),
            precision,
          );
        } else {
          return dealKfNumber(
            Number(currentAvailMoney.value) + Number(currentTradeAmount.value),
            precision,
          );
        }
      } else {
        return currentAvailMoney.value;
      }
    } else {
      return '--';
    }
  });

  const currentResiduePosVolume = computed(() => {
    const { volume, offset } = formState.value;
    const precision = getPrecisionByInstrumentType(
      instrumentResolved.value?.instrumentType,
    );
    if (currentAvailPosVolume.value !== '--') {
      if (volume && volume > 0) {
        if (isMarginMakeOrderSupport.value) {
          return dealKfDecimalPrecision(
            Number(currentAvailPosVolume.value) - volume,
            precision,
          );
        }
        if (offset === OffsetEnum.Open) {
          return dealKfDecimalPrecision(
            Number(currentAvailPosVolume.value) + volume,
            precision,
          );
        } else {
          return dealKfDecimalPrecision(
            Number(currentAvailPosVolume.value) - volume,
            precision,
          );
        }
      } else {
        return currentAvailPosVolume.value;
      }
    } else {
      return '--';
    }
  });

  return {
    currentAccountLocation,
    currentFormDirection,
    showAmountOrPosition,
    isAccountOrInstrumentConfirmed,
    instrumentResolved,
    currentPosition,
    currentPositionWithLongDirection,
    currentPositionWithShortDirection,
    currentAvailMoney,
    currentAvailPosVolume,
    currentPrice,
    currentTradeAmount,
    currentResidueMoney,
    currentResiduePosVolume,
  };
};

export const useTradeLimit = () => {
  const store = useGlobalStore();
  const app = getCurrentInstance();
  const { globalSetting } = storeToRefs(store);
  type LimitRuleType = {
    instrument: string;
    value: Record<OrderInputKeyEnum, number>;
  };
  type LimitRulesMapType = Record<string, LimitRuleType>;
  const limitRulesMapRef = ref<LimitRulesMapType>({});

  const setLimitRulesMap = () => {
    limitRulesMapRef.value = (
      (globalSetting?.value?.trade?.limit || []) as KungfuApi.TradeLimitItem[]
    ).reduce((map, item) => {
      const { instrument, orderInputKey, limitValue } = item;
      if (map[instrument]?.value) {
        const oldValue = map[instrument].value[orderInputKey]
          ? map[instrument].value[orderInputKey]
          : Infinity;
        map[instrument].value[orderInputKey] = Math.min(limitValue, oldValue);
      } else {
        map[instrument] = {
          instrument,
          value: {
            [orderInputKey]: limitValue,
          } as LimitRuleType['value'],
        };
      }

      return map;
    }, {} as LimitRulesMapType);
  };

  const createValidatorByLimitRule = (
    limitRule: LimitRuleType,
    orderInputKey: OrderInputKeyEnum,
  ) => {
    const orderInputKeyName = OrderInputKeySetting[orderInputKey].name;
    return function (_rule: RuleObject, value: string | number) {
      if (Number.isNaN(+value))
        return Promise.reject(new Error(t('blockTradeConfig.only_number')));
      value = Number(value);

      if (value < 0) {
        return Promise.reject(new Error(t('validate.no_negative_number')));
      }

      const limitValue = limitRule?.value?.[orderInputKey];

      if (limitValue !== undefined) {
        if (limitValue < value) {
          return Promise.reject(
            new Error(
              t('tradeConfig.greater_than_limit_value', {
                key: orderInputKeyName,
                value: limitValue,
              }),
            ),
          );
        }
      }

      return Promise.resolve();
    };
  };

  const getValidatorByOrderInputKey = (
    orderInputKey: OrderInputKeyEnum,
    instrument: string,
  ) => {
    const currentLimitRule = limitRulesMapRef.value[instrument];

    return createValidatorByLimitRule(currentLimitRule, orderInputKey);
  };

  onMounted(() => {
    setLimitRulesMap();

    if (app?.proxy) {
      const subscription = app.proxy.$globalBus.subscribe(
        (data: KfEvent.KfBusEvent) => {
          if (data.tag === 'saved:globalSetting') {
            setLimitRulesMap();
          }
        },
      );

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });
    }
  });

  return {
    getValidatorByOrderInputKey,
  };
};

export const useBrokerBehaviorManager = (
  currentGlobalKfLocation: Ref<KungfuApi.KfLocation | null>,
  formState: Ref<Record<string, KungfuApi.KfConfigValue>>,
) => {
  const { extConfigs } = useExtConfigsRelated();
  const { currentAccountLocation } = useCurrentAccountLocation(
    currentGlobalKfLocation,
    formState,
  );
  const isMarginMakeOrderSupport = computed(() => {
    const group = currentAccountLocation.value?.group;
    if (!group) return false;
    return extConfigs.value?.td?.[group]?.margin?.marginMakeOrder || false;
  });

  const isSpecifyContractSupport = computed(() => {
    const group = currentAccountLocation.value?.group;
    if (!group) return false;
    return extConfigs.value?.td?.[group]?.margin?.specifyContract || false;
  });

  const isCryptoSupport = computed(() => {
    const group = currentAccountLocation.value?.group;
    if (!group) return false;
    return extConfigs.value?.td?.[group]?.name === 'OKX' || false;
  });

  const dealMarginSideByTransFormType = (
    side: SideEnum,
    type: 'direction' | 'side' = 'side',
  ) => {
    if (side === SideEnum.Buy) {
      return SideEnum.GuaranteeStockBuy;
    } else if (side === SideEnum.Sell) {
      return type === 'side'
        ? SideEnum.GuaranteeStockSell
        : SideEnum.RepayStock;
    }
    return side;
  };

  return {
    isMarginMakeOrderSupport,
    isSpecifyContractSupport,
    isCryptoSupport,
    dealMarginSideByTransFormType,
  };
};

export const useMakeOrderSubscribe = (
  formState: Ref<Record<string, KungfuApi.KfConfigValue>>,
) => {
  const { currentGlobalKfLocation } = useCurrentGlobalKfLocation(
    window.watcher,
  );
  const { currentAccountLocation } = useCurrentAccountLocation(
    currentGlobalKfLocation,
    formState,
  );
  const { isMarginMakeOrderSupport, dealMarginSideByTransFormType } =
    useBrokerBehaviorManager(currentAccountLocation, formState);
  const app = getCurrentInstance();
  function closestNumber(target: number, numbers: number[]): number {
    if (numbers.length === 0) {
      return target;
    }

    return numbers.reduce((prev, curr) =>
      Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev,
    );
  }
  onActivated(() => {
    if (app?.proxy) {
      const subscription = app.proxy.$globalBus.subscribe(
        (data: KfEvent.KfBusEvent) => {
          if (data.tag === 'makeOrder') {
            const {
              offset,
              side,
              volume,
              price,
              instrumentType,
              accountId,
              instrumentId,
              exchangeId,
            } = (data as KfEvent.TriggerMakeOrder).orderInput;
            const uid = hashInstrumentUKey(instrumentId, exchangeId);
            const quote: KungfuApi.Quote = window.watcher.ledger.Quote[uid];
            const precision = getPrecisionByInstrumentType(+instrumentType);

            let dealPrice: number = price;
            if (quote) {
              if (dealPrice !== quote.last_price) {
                dealPrice = closestNumber(
                  price,
                  quote.ask_price
                    .concat(quote.bid_price)
                    .concat([quote.last_price]),
                );
                if (quote.lower_limit_price && quote.upper_limit_price)
                  if (dealPrice <= quote.lower_limit_price) {
                    dealPrice = quote.lower_limit_price;
                  } else if (dealPrice >= quote.upper_limit_price) {
                    dealPrice = quote.upper_limit_price;
                  }
              }
            }
            const instrumentValue = buildInstrumentSelectOptionValue(
              (data as KfEvent.TriggerMakeOrder).orderInput,
            );
            formState.value.instrument = instrumentValue;
            formState.value.offset = +offset;
            formState.value.side = isMarginMakeOrderSupport.value
              ? dealMarginSideByTransFormType(+side, 'direction')
              : +side;
            formState.value.volume = dealKfDecimalPrecision(volume, precision);
            formState.value.limit_price = dealKfDecimalPrecision(
              dealPrice,
              precision,
            );
            formState.value.instrument_type = +instrumentType;

            if (accountId) {
              formState.value.account_id = accountId;
            }
          }

          if (data.tag === 'orderBookUpdate') {
            const { side, price, volume, instrumentType } = (
              data as KfEvent.TriggerOrderBookUpdate
            ).orderInput;
            const precision = getPrecisionByInstrumentType(+instrumentType);

            const instrumentValue = buildInstrumentSelectOptionValue(
              (data as KfEvent.TriggerOrderBookUpdate).orderInput,
            );

            if (!formState.value.instrument) {
              formState.value.instrument = instrumentValue;
              formState.value.instrument_type = +instrumentType;
            }

            if (!!price && !Number.isNaN(+price)) {
              formState.value.limit_price = dealKfDecimalPrecision(
                +price,
                precision,
              );
            }
            formState.value.volume = dealKfDecimalPrecision(volume, precision);
            formState.value.side = isMarginMakeOrderSupport.value
              ? dealMarginSideByTransFormType(+side)
              : +side;
          }
        },
      );

      onBeforeUnmount(() => {
        subscription.unsubscribe();
      });

      onDeactivated(() => {
        subscription.unsubscribe();
      });
    }
  });
};

export const useBasket = () => {
  const app = getCurrentInstance();
  const store = useGlobalStore();

  const basketList = ref<KungfuApi.Basket[]>([]);

  onMounted(() => {
    if (app?.proxy) {
      updateBasketData();
    }
  });

  async function updateBasketData() {
    await store.setBasketList();

    basketList.value = store.basketList;
    return Promise.resolve();
  }

  function buildBasketOptionLabel(basket: KungfuApi.Basket) {
    return `${basket.name} ${BasketVolumeType[basket.volume_type].name}`;
  }

  function buildBasketOptionValue(basket: KungfuApi.Basket) {
    return `${basket.id}_${basket.name}`;
  }

  function parseBasketOptionValue(val: string): KungfuApi.Basket | null {
    const res = val.split('_');
    if (res.length !== 4) return null;
    const [id, name, volume_type, total_amount] = res;

    return {
      ...longfist.types.Basket(),
      id: Number(id),
      name,
      volume_type: Number(volume_type),
      total_amount: Number(total_amount),
    };
  }

  return {
    basketList,
    buildBasketOptionLabel,
    buildBasketOptionValue,
    parseBasketOptionValue,
    updateBasketData,
  };
};

export const useDealDataWithCaches = <T, U>(keys: Array<keyof T>) => {
  type ExtraKeys = Record<string, string | number | bigint>;
  const caches = new Map<string, { cache: U; extraKeys?: ExtraKeys }>();

  const dealDataWithCache = (
    data: T,
    dealer: () => U,
    extraKeys?: ExtraKeys,
  ): U => {
    const curKey = keys.map((key) => data[key]).join('_');
    if (caches.has(curKey)) {
      const value = caches.get(curKey);
      if (value) {
        if (value.extraKeys && extraKeys) {
          const shouldUpdate = Object.entries(value.extraKeys).find(
            ([key, value]) => extraKeys[key] !== value,
          );
          if (!shouldUpdate) {
            return value.cache;
          }
        } else {
          return value.cache;
        }
      }
    }

    const cache = dealer();
    caches.set(curKey, { cache, extraKeys });
    return cache;
  };

  const clearCaches = () => {
    caches.clear();
  };

  onBeforeUnmount(() => {
    caches.clear();
  });

  return {
    dealDataWithCache,
    clearCaches,
  };
};

export const useFastFindObjArrIndex = (
  keyField: string | Ref<string> | ComputedRef<string>,
) => {
  let objArray: Array<object> = [];
  let keyFieldResolved = isRef(keyField) ? keyField.value : keyField;
  let keyFieldValue2Index: Record<string, number> = {};
  let start = 0,
    end = 0;

  if (isRef(keyField)) {
    watch(
      () => keyField.value,
      (newKey, oldKey) => {
        if (newKey !== oldKey) {
          keyFieldResolved = newKey;
          keyFieldValue2Index = {};
          start = 0;
          end = 0;
        }
      },
    );
  }

  const findIndexByKeyFieldValue = (
    targetKeyFieldValue: string | number | bigint,
  ) => {
    const strTargetValue = `${targetKeyFieldValue}`;
    if (typeof keyFieldValue2Index[strTargetValue] === 'number') {
      return keyFieldValue2Index[strTargetValue];
    }
    for (let i = start; i < end; i++) {
      const curKeyFieldValue = `${objArray[i][keyFieldResolved]}`;
      keyFieldValue2Index[curKeyFieldValue] = i;
      if (curKeyFieldValue === strTargetValue) {
        return i;
      }
    }
    return -1;
  };

  const replaceArray = (arr: Array<object>) => {
    objArray = arr;
    keyFieldValue2Index = {};
    start = 0;
    end = arr.length;
  };

  return {
    findIndexByKeyFieldValue,
    replaceArray,
  };
};
