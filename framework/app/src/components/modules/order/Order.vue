<script setup lang="ts">
import {
  getIdByKfLocation,
  getProcessIdByKfLocation,
  delayMilliSeconds,
} from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import {
  useActiveInstruments,
  useCoreBindPage,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import {
  useDownloadHistoryTradingData,
  useDashboardBodySize,
  confirmModal,
  searchByKeyword,
  useBrowserWindowMinimize,
  messagePrompt,
  confirmModalSkippable,
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
  onDeactivated,
  reactive,
  ref,
  toRaw,
  watch,
  nextTick,
  onActivated,
} from 'vue';
import { getColumns } from './config';
import {
  dealOrder,
  getKungfuHistoryData,
  kfCancelAllOrders,
  kfCancelOrder,
  makeOrderByOrderInput,
  getOrderLatencyDataByOrderStat,
  dealOffset,
  dealSide,
  getOrderOrTradeListFromTradingDataKeeper,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import type { Dayjs } from 'dayjs';
import { UnfinishedOrderStatus } from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import {
  HistoryDateEnum,
  OrderStatusEnum,
  OrderActionFlagEnum,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import {
  showTradingDataDetail,
  useCurrentGlobalKfLocation,
  useDealDataWithCaches,
  useProcessStatusDetailData,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import StatisticModal from './OrderStatisticModal.vue';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';

useCoreBindPage();

const { t } = VueI18n.global;
const { success, error, warn } = messagePrompt();
const app = getCurrentInstance();
const windowMinimized = useBrowserWindowMinimize();
const { getPriceTickAndPrecision } = useActiveInstruments();

const { handleBodySizeChange } = useDashboardBodySize();

const { processStatusData } = useProcessStatusDetailData();
const { dealDataWithCache, clearCaches } = useDealDataWithCaches<
  KungfuApi.Order,
  KungfuApi.OrderResolvedWithoutStat
>(['uid_key', 'update_time']);

const adjustOrder = ref<KungfuApi.OrderResolved | null>(null);
const tableRef = ref();
const canvasRef = ref();
const adjustNumberInputRef = ref();
const adjustPriceTick = ref<number>();
const allOrders = ref<KungfuApi.OrderResolved[]>([]);
const unfinishedOrder = ref<boolean>(false);
const historyDate = ref<Dayjs>();
const historyDataLoading = ref<boolean>();
const searchKeyword = ref<string>('');
const currentTradingData = ref<KungfuApi.TradingDataKeeper>();
const cancelOrderLoading = ref<boolean>(false);

const {
  currentGlobalKfLocation,
  currentCategoryData,
  getCurrentGlobalKfLocationId,
} = useCurrentGlobalKfLocation(window.watcher);

const columns = computed(() => {
  if (!currentGlobalKfLocation.value) {
    return getColumns(
      {
        category: 'td',
        group: '*',
        name: '*',
        mode: '*',
      },
      !!historyDate.value,
    );
  } else {
    return getColumns(currentGlobalKfLocation.value, !!historyDate.value);
  }
});

const { handleDownload } = useDownloadHistoryTradingData();
const adjustOrderMaskVisible = ref(false);
const statisticModalVisible = ref<boolean>(false);

const needProcessTradingData = ref<boolean>(true);
const isRendering = ref(false);

const processTradingData = async (
  tradingDataKeeper: KungfuApi.TradingDataKeeper,
  keepProcessing = false,
) => {
  if (isRendering.value && !keepProcessing) return;
  currentTradingData.value = tradingDataKeeper;

  const orderList = getOrderOrTradeListFromTradingDataKeeper({
    watcher: window.watcher,
    tradingDataKeeper: tradingDataKeeper as KungfuApi.TradingDataKeeper,
    currentGlobalKfLocation: currentGlobalKfLocation.value,
    isGetUnfinishedOrder: unfinishedOrder.value,
    type: 'order',
  }) as KungfuApi.OrderResolved[];

  if (orderList.length > 0) {
    const tableData = searchByKeyword(
      searchKeyword.value,
      orderList,
      [
        'order_id',
        'instrument_id',
        'side',
        'offset',
        'status_uname',
        'exchange_id',
        'source_uname',
        'dest_uname',
      ],
      {
        side: (item) => dealSide(Number(item)).name,
        offset: (item) => dealOffset(Number(item)).name,
      },
    );
    allOrders.value = toRaw(tableData);

    canvasRef.value?.setRecords(tableData);
  } else {
    allOrders.value = [];
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

      if (adjustOrderMaskVisible.value) {
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
    subscription?.unsubscribe();
    needProcessTradingData.value = true;
  });
});

watch(currentGlobalKfLocation, async () => {
  historyDate.value = undefined;
  allOrders.value = [];
  clearCaches();
  if (currentGlobalKfLocation.value === null || !currentTradingData.value) {
    return;
  }
  isRendering.value = true;
  await processTradingData(currentTradingData.value, true);
  isRendering.value = false;
});

watch(unfinishedOrder, () => {
  needProcessTradingData.value = true;
});

watch(searchKeyword, () => {
  needProcessTradingData.value = true;
});

watch(historyDate, async (newDate) => {
  needProcessTradingData.value = true;
  clearCaches();
  if (!newDate) {
    return;
  }

  if (!currentGlobalKfLocation.value) return;

  allOrders.value = [];
  historyDataLoading.value = true;
  delayMilliSeconds(500)
    .then(() =>
      getKungfuHistoryData(
        window.watcher,
        newDate.format(),
        HistoryDateEnum.naturalDate,
        'Order',
        currentGlobalKfLocation.value as KungfuApi.KfLocation,
      ),
    )
    .then((historyData) => {
      if (!historyData) return;

      const { tradingData } = historyData;

      const orderResolved =
        globalThis.HookKeeper.getHooks().dealTradingData.trigger(
          window.watcher,
          currentGlobalKfLocation.value,
          tradingData.Order,
          'order',
        ) as KungfuApi.Order[];

      const tempAllOrders = toRaw(
        orderResolved.map((item) => {
          return toRaw({
            ...dealDataWithCache(item, () => dealOrder(window.watcher, item)),
            ...getOrderLatencyDataByOrderStat(item, tradingData.OrderStat),
          });
        }),
      );
      allOrders.value = tempAllOrders as KungfuApi.OrderResolved[];
      canvasRef.value?.setRecords(allOrders.value);
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

function isUnfinishedOrderStatus(orderStatus: OrderStatusEnum): boolean {
  return UnfinishedOrderStatus.includes(orderStatus);
}

function isFinishedOrderStatus(orderStatus: OrderStatusEnum): boolean {
  return !isUnfinishedOrderStatus(orderStatus);
}

function handleCancelOrder(order: KungfuApi.OrderResolved): void {
  if (!currentGlobalKfLocation.value || !window.watcher) {
    error();
    return;
  }

  if (!testOrderSourceIsOnline(order)) {
    return;
  }

  kfCancelOrder(window.watcher, order, OrderActionFlagEnum.Cancel)
    .then(() => {
      success(t('orderConfig.cancel_order_success'));
    })
    .catch(() => {
      error();
    });
}

function handleCancelAllOrders(): void {
  if (!currentGlobalKfLocation.value || !window.watcher) {
    error();
    return;
  }

  const name = getIdByKfLocation(currentGlobalKfLocation.value);

  confirmModal(
    t('orderConfig.confirm_cancel_all'),
    `${t('orderConfig.confirm')} ${currentCategoryData.value?.name} ${name} ${t(
      'orderConfig.cancel_all',
    )}`,
  ).then(async (flag) => {
    if (!flag || !currentGlobalKfLocation.value || !window.watcher) {
      return;
    }
    cancelOrderLoading.value = true;
    const orders = await getTargetCancelOrders();

    if (orders.length === 0) {
      cancelOrderLoading.value = false;
      warn(t('orderConfig.no_order_to_cancel'));
      return;
    }

    return kfCancelAllOrders(window.watcher, orders)
      .then(() => {
        success(t('orderConfig.cancel_all_order_success'));
      })
      .catch((err) => {
        error(err.message);
      })
      .finally(() => {
        cancelOrderLoading.value = false;
      });
  });
}

async function getTargetCancelOrders(): Promise<KungfuApi.OrderResolved[]> {
  if (
    !currentGlobalKfLocation.value ||
    !window.watcher ||
    !currentTradingData.value
  ) {
    return [];
  }
  const orderList = getOrderOrTradeListFromTradingDataKeeper({
    watcher: window.watcher,
    tradingDataKeeper:
      globalThis.TradingDataKeeper as KungfuApi.TradingDataKeeper,
    currentGlobalKfLocation: currentGlobalKfLocation.value,
    isGetUnfinishedOrder: true,
    type: 'order',
  }) as KungfuApi.OrderResolved[];
  return orderList;
}

const handleCancelOrderWithRemind = (order: KungfuApi.OrderResolved) => {
  if (isFinishedOrderStatus(order.status)) return;

  const storageKey = 'skipQuickCancelRemind';

  const promise = confirmModalSkippable(
    t('orderConfig.notice'),
    t('orderConfig.quick_cancel_context'),
    storageKey,
    {
      okText: t('orderConfig.ensure_cancel'),
      cancelText: t('orderConfig.cancel_cancel'),
    },
  );

  promise.then((flag) => {
    flag && handleCancelOrder(order);
  });
};

function handleClickCell(args: VTable.MousePointerCellEvent) {
  if (args.field === 'limit_price_resolved' && !historyDate.value) {
    handleAdjustOrder({
      event: args.event as MouseEvent,
      field: args.field,
      originData: args.originData,
      cellRange: args.cellRange as unknown as {
        bounds: { x1: number; y1: number; x2: number; y2: number };
      },
    });
  }
  if (args.value === t('orderConfig.cancel_order')) {
    handleCancelOrderWithRemind(args.originData);
  }
}

function handleDblClickCell(args: VTable.MousePointerCellEvent) {
  if (historyDate.value || !args.originData) return;
  handleCancelOrderWithRemind(args.originData);
}

function handleShowTradingDataDetail(args: VTable.MousePointerCellEvent) {
  const { originData } = args;
  if (!originData) return;
  showTradingDataDetail(
    originData as KungfuApi.OrderResolved,
    t('orderConfig.entrust'),
  );
}

const adjustOrderConfig = reactive({
  clientWidth: 0,
  clientHeight: 0,
  offsetLeft: 0,
  offsetTop: 0,
});
const adjustOrderForm = ref<{
  price: number;
  volume: number;
}>({
  price: 0,
  volume: 0,
});

function handleAdjustOrder(data: {
  event: MouseEvent;
  row?: KungfuApi.TradingDataItem;
  column?: KfTradingDataTableHeaderConfig;
  field?: string;
  originData?: KungfuApi.TradingDataItem;
  cellRange?: { bounds: { x1: number; y1: number; x2: number; y2: number } };
}): void {
  const { event, row, column, field, originData, cellRange } = data;
  if (!row && !originData) {
    return;
  }
  const order = (row || originData) as KungfuApi.OrderResolved;
  let target = event.target as HTMLElement | null;

  if (
    column?.dataIndex !== 'limit_price_resolved' &&
    field !== 'limit_price_resolved'
  ) {
    return;
  }

  if (!currentGlobalKfLocation.value || !window.watcher) {
    return;
  }

  if (
    !testOrderSourceIsOnline(order) ||
    order.status === OrderStatusEnum.Cancelling
  ) {
    return;
  }

  if (target) {
    if (target.tagName !== 'LI') {
      target = target.parentNode as HTMLElement;
    }
    adjustOrderMaskVisible.value = true;
    if (cellRange) {
      const rectData = cellRange.bounds;
      adjustOrderConfig.clientWidth = rectData.x2 - rectData.x1;
      adjustOrderConfig.clientHeight = rectData.y2 - rectData.y1;
      adjustOrderConfig.offsetTop = rectData.y1;
      adjustOrderConfig.offsetLeft = rectData.x1;
    } else {
      const rectData = target.getBoundingClientRect();
      const tableRectData = tableRef.value.getBoundingClientRect();
      const deltaTop = rectData.top - tableRectData.top;
      adjustOrderConfig.clientWidth = target.clientWidth;
      adjustOrderConfig.clientHeight = target.clientHeight;
      adjustOrderConfig.offsetTop = deltaTop;
      if (
        column?.dataIndex === 'limit_price_resolved' ||
        field === 'limit_price_resolved'
      ) {
        adjustOrderConfig.offsetLeft = target.offsetLeft;
      } else {
        adjustOrderConfig.offsetLeft = target.offsetLeft - target.clientWidth;
      }
    }

    adjustOrderForm.value.price = order.limit_price;
    adjustOrder.value = order;

    const { price_tick } = getPriceTickAndPrecision(
      order.instrument_id,
      order.exchange_id,
    );

    adjustPriceTick.value = price_tick;

    nextTick().then(() => {
      if (!adjustNumberInputRef.value) return;
      adjustNumberInputRef.value.focus();
    });
  }
}

function handleClickAdjustOrderMask(): void {
  if (!adjustOrderMaskVisible.value) {
    return;
  }
  const kfLocation = currentGlobalKfLocation.value;
  if (!kfLocation) {
    error(t('location_error'));
    adjustOrderMaskVisible.value = false;
    return;
  }

  const order = adjustOrder.value;
  if (!order) {
    adjustOrderMaskVisible.value = false;
    return;
  }

  if (!testOrderSourceIsOnline(order)) {
    adjustOrderMaskVisible.value = false;
    error(
      t('tradingConfig.finished_msg', {
        status: order.status,
      }),
    );
    return;
  }

  if (+adjustOrderForm.value.price <= 0) {
    return;
  }

  if (+order.limit_price === +adjustOrderForm.value.price) {
    adjustOrderMaskVisible.value = false;
    return;
  }

  adjustOrderMaskVisible.value = false;
  const { source } = order;
  const sourceLocation = window.watcher.getLocation(source);
  kfCancelOrder(window.watcher, order, OrderActionFlagEnum.Cancel)
    .then(() => {
      const makeOrderInput: KungfuApi.MakeOrderInput = {
        instrument_id: order.instrument_id,
        instrument_type: order.instrument_type,
        exchange_id: order.exchange_id,
        limit_price: +adjustOrderForm.value.price,
        volume: order.volume_left,
        price_type: +order.price_type,
        side: +order.side,
        offset: +order.offset,
        hedge_flag: +order.hedge_flag,
        is_swap: !!order.is_swap,
        parent_id: 0n,
        contract_id: '',
      };

      return makeOrderByOrderInput(
        window.watcher,
        makeOrderInput,
        sourceLocation,
        getIdByKfLocation(window.watcher.getLocation(order.source)),
      );
    })
    .then(() => {
      success();
    })
    .catch((err) => {
      error(err.message);
    })
    .finally(() => {
      adjustOrderMaskVisible.value = false;
    });
}

function handleCloseAdjustOrderMask() {
  adjustOrderMaskVisible.value = false;
}

function testOrderSourceIsOnline(order: KungfuApi.OrderResolved) {
  if (!window.watcher) {
    return false;
  }

  const { source, status } = order;
  const tdLocation = window.watcher.getLocation(source);
  const processId = getProcessIdByKfLocation(tdLocation);
  if (processStatusData.value[processId] !== 'online') {
    error(`${t('orderConfig.start')} ${processId} ${t('orderConfig.td')}`);
    return false;
  }

  if (isFinishedOrderStatus(status)) {
    return false;
  }

  return true;
}
</script>
<template>
  <div class="kf-orders__warp kf-translateZ">
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
          <a-checkbox v-model:checked="unfinishedOrder" size="small">
            {{ $t('orderConfig.show_unfinished_orders') }}
          </a-checkbox>
        </KfDashboardItem>
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
            :placeholder="$t('orderConfig.date_picker')"
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
            @click="handleDownload('Order', currentGlobalKfLocation)"
          >
            <template #icon>
              <DownloadOutlined style="font-size: 14px" />
            </template>
          </a-button>
        </KfDashboardItem>
        <KfDashboardItem>
          <a-button
            size="small"
            type="primary"
            danger
            :loading="cancelOrderLoading"
            @click="handleCancelAllOrders"
          >
            {{ $t('orderConfig.cancel_all') }}
          </a-button>
        </KfDashboardItem>
      </template>
      <div ref="tableRef" class="kf-table__warp">
        <div v-if="adjustOrderMaskVisible" class="kf-adjust-order-mask__warp">
          <div
            class="kf-adjust-order-mask"
            @click.stop.once="handleCloseAdjustOrderMask"
          ></div>
          <div
            class="adjust-order-wrap"
            :style="{
              top: adjustOrderConfig.offsetTop + 'px',
              left: adjustOrderConfig.offsetLeft + 'px',
            }"
          >
            <a-input-number
              v-if="adjustOrderConfig.clientWidth !== 0"
              ref="adjustNumberInputRef"
              v-model:value="adjustOrderForm.price"
              string-mode
              :step="adjustPriceTick"
              class="adjust-order-item price"
              :style="{
                width: adjustOrderConfig.clientWidth + 'px',
                height: adjustOrderConfig.clientHeight + 'px',
              }"
              @keyup.esc="handleCloseAdjustOrderMask"
              @blur="handleCloseAdjustOrderMask"
              @keyup.enter="handleClickAdjustOrderMask"
            ></a-input-number>
          </div>
        </div>
        <KfCanvasTradingDataTable
          ref="canvasRef"
          table-key="Order"
          :columns="columns"
          cache-column-resizable
          cache-column-change
          column-resize-mode="header"
          drag-header-mode="all"
          @click-cell="handleClickCell"
          @dblclick-cell="handleDblClickCell"
          @right-click-row="handleShowTradingDataDetail"
        />
      </div>
    </KfDashboard>
    <StatisticModal
      v-if="statisticModalVisible"
      v-model:visible="statisticModalVisible"
      :orders="allOrders"
      :is-unfinished-order="unfinishedOrder"
      :history-date="historyDate"
    ></StatisticModal>
  </div>
</template>
<style lang="less">
.kf-orders__warp {
  width: 100%;
  height: 100%;

  .kf-table__warp {
    width: 100%;
    height: 100%;
    position: relative;

    .kf-trading-data-table {
      width: 100%;
      height: 100%;
    }

    .kf-adjust-order-mask__warp {
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      z-index: 100;

      .kf-adjust-order-mask {
        position: absolute;
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        z-index: 100;
        background: rgba(0, 0, 0, 0.45);
      }

      .adjust-order-wrap {
        position: absolute;
        z-index: 101;
      }
      .adjust-order-item {
        background: #141414;

        .ant-input-number-input-wrap {
          height: 100%;

          .ant-input-number-input {
            height: 100%;
          }
        }
      }
    }
  }
}
</style>
