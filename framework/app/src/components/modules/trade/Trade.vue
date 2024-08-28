<script setup lang="ts">
import { delayMilliSeconds } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';

import {
  messagePrompt,
  searchByKeyword,
  useBrowserWindowMinimize,
  useDashboardBodySize,
  useDownloadHistoryTradingData,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import KfDashboard from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboard.vue';
import KfDashboardItem from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboardItem.vue';
import KfCanvasTradingDataTable from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfCanvasTradingDataTable.vue';

import {
  DownloadOutlined,
  LoadingOutlined,
  CalendarOutlined,
  PieChartOutlined,
} from '@ant-design/icons-vue';
import { VTable } from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';

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
import {
  dealOffset,
  dealSide,
  dealTrade,
  getKungfuHistoryData,
  getOrderOrTradeListFromTradingDataKeeper,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import { getColumns } from './config';
import type { Dayjs } from 'dayjs';
import {
  showTradingDataDetail,
  useCoreBindPage,
  useCurrentGlobalKfLocation,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import TradeStatisticModal from './TradeStatisticModal.vue';
import { HistoryDateEnum } from '@kungfu-trader/kungfu-js-api/typings/enums';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';

useCoreBindPage();

const { t } = VueI18n.global;
const app = getCurrentInstance();
const windowMinimized = useBrowserWindowMinimize();
const { handleBodySizeChange } = useDashboardBodySize();
const allTrades = ref<KungfuApi.TradeResolved[]>([]);
const currentTradingData = ref<KungfuApi.TradingDataKeeper>();

const canvasRef = ref();
const historyDate = ref<Dayjs>();
const historyDataLoading = ref<boolean>();

const {
  currentGlobalKfLocation,
  currentCategoryData,
  getCurrentGlobalKfLocationId,
} = useCurrentGlobalKfLocation(window.watcher);

const columns = computed(() => {
  if (!currentGlobalKfLocation.value) {
    return getColumns({
      category: 'td',
      group: '*',
      name: '*',
      mode: '*',
    });
  } else {
    return getColumns(currentGlobalKfLocation.value);
  }
});

const { handleDownload } = useDownloadHistoryTradingData();
const statisticModalVisible = ref<boolean>(false);

const needProcessTradingData = ref<boolean>(true);
const isRendering = ref<boolean>(false);

const searchKeyword = ref<string>('');

const processTradingData = async (
  tradingDataKeeper: KungfuApi.TradingDataKeeper,
  keepProcessing = false,
) => {
  if (isRendering.value && !keepProcessing) return;
  currentTradingData.value = tradingDataKeeper;

  const tradeList = getOrderOrTradeListFromTradingDataKeeper({
    watcher: window.watcher,
    tradingDataKeeper: tradingDataKeeper as KungfuApi.TradingDataKeeper,
    currentGlobalKfLocation: currentGlobalKfLocation.value,
    type: 'trade',
  }) as KungfuApi.TradeResolved[];

  if (tradeList.length > 0) {
    const tableData = searchByKeyword(
      searchKeyword.value,
      tradeList,
      [
        'order_id',
        'trade_id',
        'instrument_id',
        'side',
        'offset',
        'exchange_id',
        'source_uname',
        'dest_uname',
      ],
      {
        side: (item) => dealSide(Number(item)).name,
        offset: (item) => dealOffset(Number(item)).name,
      },
    );

    allTrades.value = toRaw(tableData);
    canvasRef.value?.setRecords(tableData);
  } else {
    allTrades.value = [];
    canvasRef.value?.setRecords([]);
  }
};

onActivated(() => {
  const subscription = app?.proxy?.$tradingDataSubject.subscribe(
    async (data) => {
      const { tradingDataKeeper } = data;
      const { update } = tradingDataKeeper;

      if (windowMinimized.value) {
        needProcessTradingData.value = true;
        return;
      }

      if (historyDate.value) {
        return;
      }

      if (currentGlobalKfLocation.value === null) {
        return;
      }

      if (update || needProcessTradingData.value) {
        needProcessTradingData.value = false;
        await processTradingData(tradingDataKeeper);
      }
    },
  );

  onBeforeUnmount(() => {
    subscription?.unsubscribe();
  });

  onDeactivated(() => {
    needProcessTradingData.value = true;
    subscription?.unsubscribe();
  });
});

watch(
  () => currentGlobalKfLocation.value,
  async () => {
    historyDate.value = undefined;
    allTrades.value = [];
    if (currentGlobalKfLocation.value === null || !currentTradingData.value) {
      return;
    }
    isRendering.value = true;
    await processTradingData(currentTradingData.value, true);
    isRendering.value = false;
  },
  { immediate: true },
);

watch(historyDate, async (newDate) => {
  needProcessTradingData.value = true;
  if (!newDate) {
    return;
  }

  if (!currentGlobalKfLocation.value) return;

  allTrades.value = [];
  historyDataLoading.value = true;
  delayMilliSeconds(500)
    .then(() =>
      getKungfuHistoryData(
        window.watcher,
        newDate.format(),
        HistoryDateEnum.naturalDate,
        'Trade',
        currentGlobalKfLocation.value as KungfuApi.KfLocation,
      ),
    )
    .then((historyData) => {
      if (!historyData) return;

      const { tradingData } = historyData;

      const tradesResolved =
        globalThis.HookKeeper.getHooks().dealTradingData.trigger(
          window.watcher,
          currentGlobalKfLocation.value,
          tradingData.Trade,
          'trade',
        ) as KungfuApi.Trade[];

      const tempAllTrades = toRaw(
        tradesResolved.map((item) => {
          return toRaw(dealTrade(window.watcher, item, tradingData.OrderStat));
        }),
      );

      allTrades.value = tempAllTrades;
      canvasRef.value.getListTable()?.setRecords(allTrades.value);
    })
    .catch((err) => {
      if (err.message === 'database_locked') {
        messagePrompt().error(t('export_database_locked'));
      } else {
        console.error(err.message);
      }
    })
    .finally(() => {
      historyDataLoading.value = false;
    });
});

watch(searchKeyword, () => {
  needProcessTradingData.value = true;
});

function handleShowTradingDataDetail(args: VTable.MousePointerCellEvent) {
  const { originData } = args;
  if (!originData) return;
  showTradingDataDetail(originData as KungfuApi.TradeResolved, '成交');
}
</script>
<template>
  <div class="kf-trades__warp kf-translateZ">
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
          <a-date-picker
            v-model:value="historyDate"
            :disabled="historyDataLoading"
          >
            <template #suffixIcon>
              <LoadingOutlined v-if="historyDataLoading" />
              <CalendarOutlined v-else />
            </template>
          </a-date-picker>
        </KfDashboardItem>
        <KfDashboardItem>
          <a-button size="small" @click="statisticModalVisible = true">
            <template #icon>
              <PieChartOutlined style="font-size: 14px"></PieChartOutlined>
            </template>
          </a-button>
        </KfDashboardItem>
        <KfDashboardItem>
          <a-button
            size="small"
            @click="handleDownload('Trade', currentGlobalKfLocation)"
          >
            <template #icon>
              <DownloadOutlined style="font-size: 14px" />
            </template>
          </a-button>
        </KfDashboardItem>
      </template>
      <KfCanvasTradingDataTable
        ref="canvasRef"
        table-key="Trade"
        :columns="columns"
        column-resize-mode="header"
        drag-header-mode="all"
        cache-column-resizable
        cache-column-change
        @right-click-row="handleShowTradingDataDetail"
      />
    </KfDashboard>
    <TradeStatisticModal
      v-if="statisticModalVisible"
      v-model:visible="statisticModalVisible"
      :trades="allTrades"
      :history-date="historyDate"
    ></TradeStatisticModal>
  </div>
</template>
<style lang="less">
.kf-trades__warp {
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
