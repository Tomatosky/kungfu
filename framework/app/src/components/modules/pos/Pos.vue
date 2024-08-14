<script setup lang="ts">
import { VTable } from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';

import {
  useDownloadHistoryTradingData,
  useDashboardBodySize,
  useTriggerMakeOrder,
  searchByKeyword,
  useBrowserWindowMinimize,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import KfDashboard from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboard.vue';
import KfDashboardItem from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboardItem.vue';
import KfCanvasTradingDataTable from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfCanvasTradingDataTable.vue';

import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons-vue';

import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  ref,
  toRaw,
  watch,
} from 'vue';
import { storeToRefs } from 'pinia';
import { getColumns, getPositionLastPrice } from './config';
import { getIdByKfLocation } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { dealPosition } from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';
import { SideEnum } from '@kungfu-trader/kungfu-js-api/typings/enums';

import {
  getInstrumentByInstrumentPair,
  useCurrentGlobalKfLocation,
  useInstruments,
  useDealDataWithCaches,
  useActiveInstruments,
  showTradingDataDetail,
  getPosClosableVolumeByOffset,
  useCoreBindPage,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import { messagePrompt } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { resolveTriggerOffset } from './utils';
import { getKfGlobalSettings } from '@kungfu-trader/kungfu-js-api/config/globalSettings';

useCoreBindPage();

const { t } = VueI18n.global;
const { success, error } = messagePrompt();
const app = getCurrentInstance();
const windowMinimized = useBrowserWindowMinimize();
const { handleBodySizeChange } = useDashboardBodySize();

const pos = ref<KungfuApi.PositionResolved[]>([]);
const searchKeyword = ref('');
const {
  currentGlobalKfLocation,
  currentCategoryData,
  getCurrentGlobalKfLocationId,
} = useCurrentGlobalKfLocation(window.watcher);
const { handleDownload } = useDownloadHistoryTradingData();
const { triggerOrderBook, triggerMakeOrder } = useTriggerMakeOrder();
const { instruments } = useInstruments();

const { getInstrumentCurrency, getInstrumentName } = useActiveInstruments();
const { dealDataWithCache } = useDealDataWithCaches<
  KungfuApi.Position,
  KungfuApi.PositionResolved
>(['uid_key', 'update_time']);
const { globalSetting } = storeToRefs(useGlobalStore());

const canvasRef = ref();

const columns = computed(() => {
  const defaultLocation = {
    category: 'td',
    group: '*',
    name: '*',
    mode: '*',
  };

  const kfGlobalSettings = getKfGlobalSettings();
  const tradeSettings = kfGlobalSettings.filter(
    (item) => item.key === 'trade',
  )[0];
  const posTableColumnsOptions = tradeSettings.config
    .filter((item) => item.key === 'posTableColumns')[0]
    .options?.map((item) => item.value);
  const selectedOptions: string[] = globalSetting.value?.trade?.posTableColumns;
  if (!posTableColumnsOptions || !selectedOptions) {
    return getColumns(currentGlobalKfLocation.value || defaultLocation);
  }

  const notSelectedOptions = posTableColumnsOptions.filter((item) => {
    return !selectedOptions.includes(item as string);
  });

  const columnsConfig = getColumns(
    currentGlobalKfLocation.value || defaultLocation,
  );

  return columnsConfig.filter((item) => {
    return !notSelectedOptions.includes(item.field as string);
  });
});

const setTableData = () => {
  const tableData = searchByKeyword<KungfuApi.PositionResolved>(
    searchKeyword.value,
    pos.value,
    [
      'instrument_id_resolved',
      'exchange_id',
      'direction',
      'account_id_resolved',
    ],
  );
  canvasRef.value?.setRecords(tableData);
};

onActivated(() => {
  if (app?.proxy) {
    const subscription = app.proxy.$tradingDataSubject.subscribe((data) => {
      const { watcher } = data;

      if (windowMinimized.value) return;

      if (!currentGlobalKfLocation.value) return;

      const positions =
        globalThis.HookKeeper.getHooks().dealTradingData.trigger(
          watcher,
          currentGlobalKfLocation.value,
          watcher.ledger.Position,
          'position',
        ) as KungfuApi.Position[];

      pos.value = toRaw(
        positions.reverse().map((position) => {
          const currency = getInstrumentCurrency(
            position.instrument_id,
            position.exchange_id,
          );

          const instrumentName = getInstrumentName(
            position.instrument_id,
            position.exchange_id,
            position.instrument_type,
          );

          return dealDataWithCache(
            position,
            () => dealPosition(watcher, position, instrumentName),
            {
              currency,
            },
          );
        }),
      );

      setTableData();
    });

    onBeforeUnmount(() => {
      subscription.unsubscribe();
    });

    onDeactivated(() => {
      subscription.unsubscribe();
    });
  }
});

watch(currentGlobalKfLocation, () => {
  pos.value = [];
  setTableData();
});

function handleClickRow(args: VTable.MousePointerCellEvent) {
  const row = args.originData;
  if (!row) return;
  const { instrument_id, instrument_type, exchange_id } = row;
  const ensuredInstrument: KungfuApi.InstrumentResolved =
    getInstrumentByInstrumentPair(
      {
        instrument_id,
        instrument_type,
        exchange_id,
      },
      instruments.value,
    );

  triggerOrderBook(ensuredInstrument);

  const offset = resolveTriggerOffset(row);
  const extraOrderInput: ExtraOrderInput = {
    side: row.direction === 0 ? SideEnum.Sell : SideEnum.Buy,
    offset,
    volume: getPosClosableVolumeByOffset(row, offset),
    price: getPositionLastPrice(row) || row.avg_open_price || 0,
    accountId: dealLocationUIDResolved(row.source_id),
  };
  triggerMakeOrder(ensuredInstrument, extraOrderInput);
}

function dealLocationUIDResolved(holderUID: number): string {
  return getIdByKfLocation(window.watcher.getLocation(holderUID));
}

function handleRequestPosition() {
  const res = window.watcher.requestPosition(window.watcher);
  if (res) {
    success(t('operation_success'));
  } else {
    error(t('operation_failed'));
  }
}

function handleShowTradingDataDetail(args: VTable.MousePointerCellEvent) {
  const { originData } = args;
  if (!originData) return;
  originData.last_price = getPositionLastPrice(
    originData,
    'last_price_resolved',
  );
  showTradingDataDetail(originData, t('posGlobalConfig.pos_detail_header'), [
    'last_price_resolved',
    'holder_uid',
  ]);
}
</script>
<template>
  <div class="kf-position__warp kf-translateZ">
    <KfDashboard @boardSizeChange="handleBodySizeChange">
      <template #title>
        <span v-if="currentGlobalKfLocation">
          <a-tag
            v-if="currentCategoryData"
            :color="currentCategoryData?.color || 'default'"
          >
            {{ currentCategoryData?.name }}
          </a-tag>
          <span v-if="currentGlobalKfLocation" class="name">
            {{ getCurrentGlobalKfLocationId(currentGlobalKfLocation) }}
          </span>
        </span>
      </template>
      <template #header>
        <KfDashboardItem>
          <a-input-search
            v-model:value="searchKeyword"
            :placeholder="$t('keyword_input')"
            style="width: 120px"
          />
        </KfDashboardItem>
        <KfDashboardItem>
          <a-button size="small" @click="handleRequestPosition">
            <template #icon>
              <ReloadOutlined style="font-size: 14px" />
            </template>
          </a-button>
        </KfDashboardItem>
        <KfDashboardItem>
          <a-button
            size="small"
            @click="handleDownload('Position', currentGlobalKfLocation)"
          >
            <template #icon>
              <DownloadOutlined style="font-size: 14px" />
            </template>
          </a-button>
        </KfDashboardItem>
      </template>
      <KfCanvasTradingDataTable
        ref="canvasRef"
        table-key="Pos"
        :columns="columns"
        column-resize-mode="header"
        drag-header-mode="all"
        cache-column-resizable
        cache-column-change
        @click-cell="handleClickRow"
        @right-click-row="handleShowTradingDataDetail"
      />
    </KfDashboard>
  </div>
</template>
<style lang="less">
.kf-position__warp {
  width: 100%;
  height: 100%;

  .kf-table__warp {
    width: 100%;
    height: 100%;

    .kf-trading-data-table {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
