<script lang="ts" setup>
import Icon, {
  ClusterOutlined,
  FileTextOutlined,
  HistoryOutlined,
  EyeOutlined,
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import { notification } from 'ant-design-vue';

import KfProcessStatus from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfProcessStatus.vue';
import KfReplaySettingModal from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfReplaySettingModal.vue';

import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
  nextTick,
} from 'vue';
import { SystemProcessName } from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import {
  getInstrumentTypeColor,
  handleOpenLogview,
  handleOpenJournalView,
  onClickOutside,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import {
  getKfCategoryData,
  getIfProcessRunning,
  getPropertyFromProcessStatusDetailDataByKfLocation,
  getIfProcessStopping,
  isTdMd,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import {
  buildMasterLocation,
  buildLedgerLocation,
} from '@kungfu-trader/kungfu-js-api/utils/systemUtils';
import { getProcessIdByKfLocation } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import {
  handleSwitchProcessStatusGenerator,
  useAllKfConfigData,
  useExtConfigsRelated,
  usePreStartAndQuitApp,
  useProcessStatusDetailData,
  useReplay,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';
import { KfCategoryTypes } from '@kungfu-trader/kungfu-js-api/typings/enums';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import loadingGif from '@kungfu-trader/kungfu-app/src/renderer/assets/imgs/loading.gif';

const { t } = VueI18n.global;

const { testCase } = storeToRefs(useGlobalStore());

const app = getCurrentInstance();
const handleSwitchProcessStatus = handleSwitchProcessStatusGenerator();
const processControllerBoardVisible = ref<boolean>(false);
const categoryList: KfCategoryTypes[] = [
  'system',
  'td',
  'md',
  'operator',
  'strategy',
];
const allKfConfigData = useAllKfConfigData();
const {
  appStates,
  processStatusData,
  processStatusDetailData,
  getProcessStatusName,
} = useProcessStatusDetailData();
const { preStartSystemLoading, preQuitSystemLoading } = usePreStartAndQuitApp();

const {
  replayConfig,
  setReplayModalVisible,
  sessionOptions,
  handleOpenReplayConfirmView,
  handleReplayModal,
} = useReplay();
const { tdExtTypeMap, mdExtTypeMap } = useExtConfigsRelated();

let canBacktest = false;

let isClosingWindow = false;
let isRestartSystem = 0;
let hasAlertMasterStop = false;
let hasAlertLedgerStop = false;

const getNotificationType = (flag: number) => {
  return flag ? 'warning' : 'error';
};

const systemLoading = computed(
  () => preStartSystemLoading.value || preQuitSystemLoading.value,
);

watch(processStatusData, (newPSD, oldPSD) => {
  if (isClosingWindow) return;

  if (newPSD.master !== 'online' && oldPSD.master === 'online') {
    if (isRestartSystem || !hasAlertMasterStop) {
      hasAlertMasterStop = true;
      notification[getNotificationType(isRestartSystem)]({
        message: t('master_interrupt'),
        description: t('master_desc'),
        duration: 8,
        placement: 'bottomRight',
      });
      isRestartSystem && isRestartSystem++;
    }
  }

  if (newPSD.ledger !== 'online' && oldPSD.ledger === 'online') {
    if (isRestartSystem || !hasAlertLedgerStop) {
      hasAlertLedgerStop = true;
      notification[getNotificationType(isRestartSystem)]({
        message: t('ledger_interrupt'),
        description: t('ledger_desc'),
        duration: 8,
        placement: 'bottomRight',
      });
      isRestartSystem && isRestartSystem++;
    }
  }

  if (isRestartSystem >= 4) {
    isRestartSystem = 0;
  }
});

watch(appStates, (newAppStates, oldAppStates) => {
  Object.keys(newAppStates || {}).forEach((key: string) => {
    const newState = newAppStates[key];
    const oldState = oldAppStates[key];

    if (
      newState === 'DisConnected' &&
      oldState !== 'DisConnected' &&
      processStatusData.value[key] === 'online'
    ) {
      notification.warning({
        message: t('state_interrupt_msg', {
          state: key,
        }),
        description: t('state_interrupt_desc', {
          state: key,
        }),
        duration: 8,
        placement: 'bottomRight',
      });
    }
  });
});

const mainStatusWell = computed(() => {
  const masterLocation = buildMasterLocation();
  const ledgerLocation = buildLedgerLocation();
  const masterIsLive =
    processStatusData.value[getProcessIdByKfLocation(masterLocation)] ===
    'online';
  const ledgerIsLive =
    processStatusData.value[getProcessIdByKfLocation(ledgerLocation)] ===
    'online';
  return masterIsLive && ledgerIsLive;
});

const getContainer = () => {
  const el = document.querySelector('.kf-layout > section');

  return el;
};

function handleOpenProcessControllerBoard(): void {
  processControllerBoardVisible.value = true;
}

function handleClickReplay(config: KungfuApi.KfLocation) {
  canBacktest = config.category === 'strategy';
  nextTick(() => {
    handleOpenReplayConfirmView(config);
  });
}

const prefixMap = ref({});

watch(
  () => processControllerBoardVisible.value,
  (newVal) => {
    if (newVal) {
      const deregister = onClickOutside(
        '.kf-process-status-controller-board__warp > .ant-drawer-content-wrapper',
        () => {
          processControllerBoardVisible.value = false;
          deregister?.();
        },
      );
    }
  },
);

watch(
  () => allKfConfigData,
  () => {
    prefixMap.value = categoryList.reduce((map, category) => {
      allKfConfigData[category].forEach((location) => {
        map[getProcessIdByKfLocation(location)] =
          globalThis.HookKeeper.getHooks().prefix.trigger(location);
      });
      return map;
    }, {});
  },
  { deep: true },
);

onMounted(() => {
  if (app?.proxy) {
    const subscription = app.proxy.$globalBus.subscribe((data) => {
      if (data.tag === 'main') {
        if (data.name === 'clear-process-before-quit-start') {
          isClosingWindow = true;
        }
      }
      if (data.tag === 'processStatus') {
        if (data.name === 'system' && data.status === 'waiting restart') {
          !isRestartSystem && (isRestartSystem = 1);
        }
      }
    });
    onBeforeUnmount(() => {
      subscription.unsubscribe();
    });
  }
});
</script>

<template>
  <div
    :class="{
      'kf-process-status-controller__warp': true,
      'some-process-error': !mainStatusWell,
    }"
    @click="handleOpenProcessControllerBoard"
  >
    <div v-if="systemLoading" class="process-loading">
      <img :src="loadingGif" width="56" height="6" />
    </div>
    <div v-else>
      <ClusterOutlined style="font-size: 14px; padding-right: 4px" />
      <span class="title">{{ $t('baseConfig.control_center') }}</span>
    </div>
    <a-drawer
      v-model:visible="processControllerBoardVisible"
      :width="650"
      class="kf-process-status-controller-board__warp"
      :title="$t('baseConfig.control_center')"
      :get-container="getContainer"
      placement="right"
      @close="processControllerBoardVisible = false"
    >
      <div
        v-for="category in categoryList"
        :key="category"
        class="process-controller-item"
      >
        <template v-if="allKfConfigData[category].length">
          <div class="kf-config-list">
            <div
              v-for="config in allKfConfigData[category]"
              :key="config"
              class="kf-config-item"
            >
              <div class="process-info">
                <div class="category info-item">
                  <a-tag :color="getKfCategoryData(config.category).color">
                    {{ getKfCategoryData(config.category).name }}
                  </a-tag>
                </div>
                <div
                  v-if="config.category === 'system'"
                  class="process-id info-item"
                >
                  {{
                    (SystemProcessName[config.name] || { name: config.name })
                      .name || ''
                  }}
                </div>
                <div
                  v-else-if="config.category !== 'strategy'"
                  class="process-id info-item"
                >
                  <div class="item">
                    <div>
                      <a-tag
                        v-if="isTdMd(config.category)"
                        :color="
                          getInstrumentTypeColor(
                            tdExtTypeMap[config.group] ||
                              mdExtTypeMap[config.group],
                          )
                        "
                      >
                        {{ config.group }}
                      </a-tag>
                    </div>
                    <div>
                      {{ config.name }}
                    </div>
                  </div>
                </div>
                <div v-else class="process-id info-item">
                  {{ config.name }}
                </div>
                <Icon
                  v-if="
                    prefixMap[getProcessIdByKfLocation(config)]?.prefixType ===
                    'icon'
                  "
                  :component="
                    prefixMap[getProcessIdByKfLocation(config)].prefix
                  "
                  style="font-size: 12px"
                />
              </div>
              <div class="state-status">
                <KfProcessStatus
                  :status-name="getProcessStatusName(config)"
                ></KfProcessStatus>
              </div>
              <div class="switch">
                <a-switch
                  size="small"
                  :checked="
                    getIfProcessRunning(
                      processStatusData,
                      getProcessIdByKfLocation(config),
                    )
                  "
                  :loading="
                    getIfProcessStopping(
                      processStatusData,
                      getProcessIdByKfLocation(config),
                    )
                  "
                  @click="(checked: boolean, Event: MouseEvent) =>
                      handleSwitchProcessStatus(
                        checked,
                        Event,
                        config,
                      )
                      "
                ></a-switch>
              </div>
              <div class="cpu">
                CPU:
                {{
                  getPropertyFromProcessStatusDetailDataByKfLocation(
                    processStatusDetailData,
                    config,
                  ).cpu + '%'
                }}
              </div>
              <div class="memory">
                MEM:
                {{
                  getPropertyFromProcessStatusDetailDataByKfLocation(
                    processStatusDetailData,
                    config,
                  ).memory + 'M'
                }}
              </div>
              <div class="actions kf-actions__warp">
                <HistoryOutlined
                  v-if="
                    testCase.replayEnabled[config.category] ||
                    (config.category === 'system' && config.name === 'ledger')
                  "
                  style="font-size: 12px"
                  @click.stop="handleClickReplay(config)"
                ></HistoryOutlined>
                <EyeOutlined
                  style="font-size: 14px"
                  @click.stop="handleOpenJournalView(config)"
                ></EyeOutlined>
                <FileTextOutlined
                  style="font-size: 14px"
                  @click="handleOpenLogview(config)"
                ></FileTextOutlined>
              </div>
            </div>
          </div>
        </template>
      </div>
    </a-drawer>

    <KfReplaySettingModal
      v-if="setReplayModalVisible"
      v-model:visible="setReplayModalVisible"
      :width="720"
      :can-backtest="canBacktest"
      :session-options="sessionOptions"
      :session-info="replayConfig.session_info"
      :begin-time="replayConfig.begin_time"
      :end-time="replayConfig.end_time ? replayConfig.end_time : ''"
      :log-level="replayConfig.log_level"
      @close="setReplayModalVisible = false"
      @confirm="(event) => handleReplayModal(event)"
    ></KfReplaySettingModal>
  </div>
</template>

<style lang="less">
@import '@kungfu-trader/kungfu-app/src/renderer/assets/less/variables.less';

.kf-process-status-controller__warp {
  display: flex;
  align-items: center;

  &.some-process-error {
    .title {
      color: lighten(@red2-base, 10%);
      font-weight: bold;
    }

    .anticon {
      color: lighten(@red2-base, 10%);
    }
  }

  .process-loading {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
}

.kf-process-status-controller-board__warp {
  height: calc(100% - 28px);

  .process-controller-item {
    margin-bottom: 24px;

    .category-title {
      font-size: 18px;
      font-weight: bold;
      padding-bottom: 8px;
    }

    .kf-config-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .process-info {
        flex: 1;
        display: flex;
        justify-content: flex-start;
        align-items: center;
        margin-right: 8px;
        word-break: break-all;

        .process-id {
          width: 112px;
        }

        .info-item {
          margin-right: 8px;

          .item {
            display: flex;
            justify-content: flex-start;
            align-items: center;
          }

          &.category {
            width: 70px;
          }
        }
      }

      .state-status {
        width: 96px;
      }

      .switch {
        width: 40px;
      }

      .cpu {
        width: 80px;
      }

      .memory {
        width: 120px;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        width: 90px;
      }
    }
  }
}
</style>
