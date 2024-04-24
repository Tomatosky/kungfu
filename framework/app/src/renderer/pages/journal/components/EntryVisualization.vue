<template>
  <div class="kf-visualization_wrap">
    <div class="kf-strategy_wrap">
      <a-table
        class="kf-ant-table"
        :columns="columns"
        :data-source="strategyData"
        size="small"
        :pagination="false"
        :row-class-name="dealRowClassName"
        :custom-row="customRow"
        :scroll="{ y: dashboardBodyHeight - 4 }"
        :empty-text="$t('empty_text')"
      >
        <template
          #bodyCell="{
            column,
            record,
          }: {
            column: AntTableColumn,
            record: KungfuApi.SessionResolved,
          }"
        >
          <template v-if="column.dataIndex === 'status'">
            <span
              :title="SessionStatus[record[column.dataIndex]].name"
              :style="{
                backgroundColor: SessionStatus[record[column.dataIndex]].color,
                width: '12px',
                height: '12px',
                margin: '0 auto',
                borderRadius: '50%',
                display: 'inline-block',
              }"
            ></span>
          </template>
        </template>
      </a-table>
    </div>
    <div class="kf-visualization_data_content">
      <div class="kf-instrument_wrap">
        <div class="search-input">
          <KfDashboardItem>
            <a-input-search
              v-model:value="searchInstrument"
              :placeholder="$t('journalConfig.search_instrument')"
              @change="handleInputChange"
            />
          </KfDashboardItem>
        </div>
        <div class="instrument-list">
          <template v-if="instrumentList.length > 0">
            <div
              v-for="item in instrumentList"
              :key="item"
              :class="{
                'instrument-item_wrap': true,
                'color-default': true,
                'selected-status': selectedInstrument.includes(item),
              }"
              @click="getCurInstrument(item)"
            >
              <span>{{ item }}</span>
            </div>
          </template>

          <a-empty
            v-else
            :image="simpleImage"
            :description="t('empty_text')"
          ></a-empty>
        </div>
      </div>
      <div ref="chartWrapper" class="kf-chart_wrap">
        <a-input-search
          v-show="instrumentList.length > 0"
          v-model:value="searchOrderId"
          class="chart-search-order-id"
          :placeholder="$t('journalConfig.search_order_id')"
          @search="handleSearchOrderId"
        />
        <div
          v-show="showChartWrap"
          id="strategyChart"
          class="kf-chart_content"
        ></div>
        <a-empty
          v-show="instrumentList.length === 0 || !hasInit"
          :image="simpleImage"
          :description="t('empty_text')"
        ></a-empty>
      </div>
      <a-spin
        class="kf-journal-spin"
        :spinning="visualizationLoading"
        :tip="$t('journalConfig.loading_journal')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useJournalStore } from '../store/journalStore';
import {
  getChartOption,
  getStrategyColumns,
  SeriesData,
  SessionStatus,
  PosFun,
} from '../config';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import fse from 'fs-extra';
import path from 'path';
import { Empty } from 'ant-design-vue';
import * as echarts from 'echarts';

import {
  buildInstrumentSelectOptionLabel,
  messagePrompt,
  useDashboardBodySize,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import KfDashboardItem from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboardItem.vue';
import { KF_CONFIG_DIR } from '@kungfu-trader/kungfu-js-api/config/pathConfig';
import {
  getNanoDateString,
  hashInstrumentUKey,
} from '@kungfu-trader/kungfu-js-api/kungfu';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import {
  ExchangeIds,
  sideOffsetMap,
} from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import {
  OffsetEnum,
  SideEnum,
  OrderActionFlagEnum,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import {
  delayMilliSeconds,
  debounce,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';

const { t } = VueI18n.global;

type WithTableRowInfo<T> = T & {
  tableRowId: string;
  msgTypeName: string;
  index?: number;
};
type QuoteChartResolved = WithTableRowInfo<KungfuApi.Quote>;
type OrderInputChartResolved = WithTableRowInfo<KungfuApi.OrderInput>;
type OrderChartResolved = WithTableRowInfo<KungfuApi.Order>;
type OrderActionResolved = WithTableRowInfo<KungfuApi.OrderAction> & {
  instrument_id: string;
  exchange_id: string;
  limit_price: number;
};

type FrameDataType =
  | KungfuApi.Quote
  | KungfuApi.OrderInput
  | KungfuApi.Order
  | KungfuApi.OrderAction;
type FrameResolvedDataType =
  | QuoteChartResolved
  | OrderInputChartResolved
  | OrderChartResolved
  | OrderActionResolved;

const props = withDefaults(
  defineProps<{
    category: string;
  }>(),
  {
    category: 'strategy',
  },
);

const DEFAULT_MIN_Y_SPLIT = 5;
const DFEAUKT_Y_SPACE = 50;
const DEFAULT_ORDER_LENGTH = 30;
const DEFAULT_CHART_LENGTH_RATE = 30;
const DEFAULT_SYMBOL_SIZE = 10;
const ACTIVE_SYMBOL_SIZE = 20;
const DATA_RANGE_SIZE = 20;
const DEFALUT_HALF_TOOLTIP_WIDTH = 200;

const { setCurrentSession, setSelectedChartItem, setCurrentFrameId } =
  useJournalStore();
const {
  sessions,
  journalLoadingType,
  currentSessionKey,
  currentFrameList,
  currentFrame,
  currentTime,
  isBuildingTracer,
} = storeToRefs(useJournalStore());
const { dashboardBodyHeight } = useDashboardBodySize();
const columns = getStrategyColumns();
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const kfInstrumentsJSON: Record<string, KungfuApi.InstrumentResolved> =
  fse.readJsonSync(path.join(KF_CONFIG_DIR, 'defaultInstruments.json'));
const searchInstrument = ref<string>('');
const selectedInstrument = ref<string>('');
const xAxisData = ref<Record<string, (number | string | bigint)[]>>({});
const quoteXAxisData = ref<Record<string, number[]>>({});
const searchOrderId = ref<string>('');
const instrumentList = ref<string[]>([]);
const keepChartWrapAlice = ref<boolean>(true);
let selectedSign = false;
const chartWrapper = ref<HTMLElement>();
let myChart: echarts.ECharts;
const option = getChartOption();
const xAxisMinMax = ref<{
  min: number | string;
  max: number | string;
}>({
  min: 'dataMin',
  max: 'dataMax',
});
const hasInit = ref<boolean>(false);
const shouldResize = ref<boolean>(false);
const highlightOption = {
  time: 0n,
  type: '',
  orderId: 0n,
};
onMounted(() => {
  nextTick(async () => {
    await initChart();
    keepChartWrapAlice.value = false;
  });
  initChartData();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', () => handleResize());
  myChart && myChart.dispose();
});

defineExpose({
  handleResize,
});

const visualizationLoading = computed(() => {
  return (
    keepChartWrapAlice.value ||
    isBuildingTracer.value ||
    journalLoadingType.value === 'init'
  );
});

const strategyData = computed(() => {
  return sessions.value.filter((item) => {
    return item.category === props.category;
  });
});

const showChartWrap = computed(() => {
  return (
    (instrumentList.value.length > 0 && hasInit.value) ||
    keepChartWrapAlice.value
  );
});

const customRow = (record: KungfuApi.SessionResolved) => {
  return {
    onClick: () => {
      setCurrentSession(record);
      initChartData();
    },
  };
};

const dealRowClassName = (row) => {
  return row.begin_time === currentSessionKey.value
    ? 'current-global-kfLocation'
    : '';
};

watch(
  () => journalLoadingType.value,
  (newValue, oldValue) => {
    if (newValue === 'finish') {
      if (oldValue === 'init') {
        initChartData();
      } else {
        initChartData(false);
      }
    }
  },
);

const handleFrameChange = async (newCurrentFrame, retryCount = 0) => {
  if (retryCount > instrumentList.value.length) {
    console.error('Maximum retries reached.');
    return;
  }

  if (!newCurrentFrame) return;

  let dataTime = 0n;
  let hasFound = false;
  const chartData = newCurrentFrame.data as FrameResolvedDataType;
  const types = ['Quote', 'OrderInput', 'Order', 'OrderAction'];

  if (types.includes(newCurrentFrame.msgTypeName)) {
    let orderId: string | bigint = 0n;

    if ('data_time' in chartData && newCurrentFrame.msgTypeName === 'Quote') {
      dataTime = chartData.data_time;
    } else if (
      'insert_time' in chartData &&
      ['OrderInput', 'Order', 'OrderAction'].includes(
        newCurrentFrame.msgTypeName,
      )
    ) {
      dataTime = chartData.insert_time;
      orderId = chartData.order_id;
    }

    if (dataTime < currentTime.value) {
      messagePrompt().error(t('journalConfig.visual_vdata_error'));
      return;
    }

    if (newCurrentFrame.msgTypeName === 'Quote') {
      if ((chartData as QuoteChartResolved).last_price === 0) {
        messagePrompt().error(t('journalConfig.visual_vdata_error'));
        return;
      }
      const closestTimeIndex = findClosestTime(
        Number(dataTime),
        quoteXAxisData.value[selectedInstrument.value],
      );
      option.series[4].data.forEach((item, index) => {
        item.itemStyle = {
          color: index === closestTimeIndex ? '#0F6DA6' : 'transparent',
        };
        if (index === closestTimeIndex) {
          hasFound = true;
          highlightOption.orderId = item.customInfo?.orderId || 0n;
          highlightOption.time = item.customInfo?.time || 0n;
          highlightOption.type = item.customInfo?.msgTypeName || '';
        }
      });
      option.series
        .filter((_serie, index) => index !== 0 && index !== 4)
        .forEach((serie) => {
          serie.data.forEach((item) => {
            item.symbolSize = DEFAULT_SYMBOL_SIZE;
            item.itemStyle = {
              ...item.itemStyle,
              shadowBlur: 0,
              shadowColor: undefined,
            };
          });
        });
    } else {
      if (
        'limit_price' in chartData &&
        chartData.limit_price === 0 &&
        newCurrentFrame.msgTypeName !== 'OrderInput'
      ) {
        messagePrompt().error(t('journalConfig.visual_vdata_error'));
        return;
      }
      option.series
        .filter((_serie, index) => index !== 0 && index !== 4)
        .forEach((serie) => {
          serie.data.forEach((item) => {
            const isCurrentOrder = item.customInfo?.orderId === orderId;
            const defaultSize = getDefaultSize(serie.name);
            let shadowColor = '';
            if (item.customInfo?.msgTypeName === 'orderAction') {
              shadowColor = '#73F3F6';
            } else {
              shadowColor =
                item.itemStyle?.color === '#f21717' ? '#f37370' : '#8fd460';
            }
            item.symbolSize = isCurrentOrder ? ACTIVE_SYMBOL_SIZE : defaultSize;
            item.itemStyle = {
              ...item.itemStyle,
              shadowBlur: isCurrentOrder ? 10 : 0,
              shadowColor: isCurrentOrder ? shadowColor : undefined,
            };
            if (isCurrentOrder) {
              hasFound = true;
              highlightOption.orderId = item.customInfo?.orderId || 0n;
              highlightOption.time = item.customInfo?.time || 0n;
              highlightOption.type = item.customInfo?.msgTypeName || '';
            }
          });
        });
      option.series[4].data.forEach((item) => {
        item.itemStyle = {
          color: 'transparent',
        };
      });
    }

    if (!hasFound) {
      const targetInstrument = instrumentList.value.find((ins) =>
        ins.includes(chartData.instrument_id),
      );
      if (targetInstrument) {
        await getCurInstrument(targetInstrument);
        return handleFrameChange(newCurrentFrame, retryCount + 1);
      }
      return;
    } else {
      selectedSign = true;
    }
  } else {
    dataTime = newCurrentFrame.genTime;
  }

  setDataZoom(dataTime);
  myChart && myChart.setOption(option);
};

watch(
  () => currentFrame.value,
  (newCurrentFram) => {
    handleFrameChange(newCurrentFram);
  },
);

function reset(clearSelectedItem: boolean) {
  frameListResolved.value = {};
  chartSeriesData.value = {};
  xAxisData.value = {};
  quoteXAxisData.value = {};
  orderInfoMap.value = {};
  if (clearSelectedItem) {
    searchInstrument.value = '';
    searchOrderId.value = '';
    selectedInstrument.value = '';
  }
}

function initChartData(clearSelectedItem = true) {
  reset(clearSelectedItem);

  currentFrameList.value.forEach((item) => {
    if (item.msgTypeName === 'Order') {
      const tradingData = item.data as KungfuApi.Order;
      orderInfoMap.value[tradingData.order_id.toString()] = {
        instrumentId: tradingData.instrument_id,
        exchangeId: tradingData.exchange_id,
        limitPrice: tradingData.limit_price,
      };
    }
  });

  dealFrameData(clearSelectedItem);
  instrumentList.value = getInstrumentList(searchInstrument.value);

  if (instrumentList.value.length > 0) {
    nextTick(() => {
      let currentInstrument = '';
      if (
        selectedInstrument.value &&
        instrumentList.value.includes(selectedInstrument.value)
      ) {
        currentInstrument = selectedInstrument.value;
      } else {
        currentInstrument = instrumentList.value[0];
      }
      getCurInstrument(currentInstrument, clearSelectedItem);
    });
  } else {
    nextTick(() => {
      updateOption(clearSelectedItem);
    });
  }
}

const orderInfoMap = ref<
  Record<
    string,
    {
      instrumentId: string;
      exchangeId: string;
      limitPrice: number;
    }
  >
>({});

const frameListResolved = ref<
  Record<
    string,
    {
      Quote: QuoteChartResolved[];
      OrderInput: OrderInputChartResolved[];
      Order: OrderChartResolved[];
      OrderAction: OrderActionResolved[];
    }
  >
>({});

const chartSeriesData = ref<
  Record<
    string,
    {
      Quote: { line: SeriesData[]; symbol: SeriesData[] };
      OrderInput: SeriesData[];
      Order: SeriesData[];
      OrderAction: SeriesData[];
    }
  >
>({});

const setTooltipPosition: PosFun = (point, params, dom, rect, size) => {
  const domWidth = size.viewSize[0];
  const x = point[0];

  if (domWidth - x < DEFALUT_HALF_TOOLTIP_WIDTH) {
    return 'left';
  } else {
    return 'bottom';
  }
};

function dealFrameData(clearSelectedItem = true) {
  currentFrameList.value.forEach((item, index) => {
    if (
      !['Quote', 'OrderInput', 'Order', 'OrderAction'].includes(
        item.msgTypeName,
      )
    )
      return;

    const tradingDataResolved = resolveTradingData(item, index);
    if (!tradingDataResolved) return;

    const key = getKeyFromJSON(
      '',
      tradingDataResolved.instrument_id,
      tradingDataResolved.exchange_id,
    );

    if (!key) return;
    if (!frameListResolved.value[key]) initializeFrameListResolved(key);
    if (!chartSeriesData.value[key]) initializeChartSeriesData(key);

    frameListResolved.value[key][item.msgTypeName].push(tradingDataResolved);
    updateChartSeriesData(
      tradingDataResolved,
      key,
      item.msgTypeName,
      clearSelectedItem,
    );
  });
}

function resolveTradingData(item, index) {
  const { dataTime } = getTradingDataValueByKey(item.data, item.msgTypeName);

  if (dataTime < currentTime.value) return null;

  const tradingData = item.data;
  let uidKey = '';
  let key = '';

  if (item.msgTypeName === 'OrderAction') {
    const { instrumentId, exchangeId, limitPrice } =
      orderInfoMap.value[tradingData.order_id.toString()] || {};

    if (!instrumentId || !exchangeId) return null;

    uidKey = hashInstrumentUKey(instrumentId, exchangeId);
    key = getKeyFromJSON(uidKey, instrumentId, exchangeId);

    return {
      ...tradingData,
      instrument_id: instrumentId,
      exchange_id: exchangeId,
      limit_price: limitPrice,
      tableRowId: item.id,
      msgTypeName: item.msgTypeName,
      index,
    };
  }

  if ('instrument_id' in tradingData) {
    uidKey = hashInstrumentUKey(
      tradingData.instrument_id,
      tradingData.exchange_id,
    );

    key = getKeyFromJSON(
      uidKey,
      tradingData.instrument_id,
      tradingData.exchange_id,
    );
    if (!key) return null;
    return {
      ...tradingData,
      tableRowId: item.id,
      msgTypeName: item.msgTypeName,
      index,
    };
  }

  return null;
}

function getKeyFromJSON(
  uidKey: string,
  instrumentId: string,
  exchangeId: string,
) {
  return kfInstrumentsJSON[uidKey]
    ? buildInstrumentSelectOptionLabel(kfInstrumentsJSON[uidKey])
    : `${instrumentId} ${ExchangeIds[exchangeId.toUpperCase()]?.name || ''}`;
}

function initializeFrameListResolved(key: string) {
  frameListResolved.value[key] = {
    Quote: [],
    Order: [],
    OrderInput: [],
    OrderAction: [],
  };
}

function initializeChartSeriesData(key: string) {
  chartSeriesData.value[key] = {
    Quote: { line: [], symbol: [] },
    Order: [],
    OrderInput: [],
    OrderAction: [],
  };
}

function updateChartSeriesData(
  tradingDataResolved: FrameResolvedDataType,
  key: string,
  msgTypeName: string,
  clearSelectedItem = true,
) {
  let active = false;
  const { dataTime, price } = getTradingDataValueByKey(tradingDataResolved);
  if (msgTypeName !== 'OrderAction' && price === 0) return;
  xAxisData.value[key] = xAxisData.value[key] || [];
  xAxisData.value[key].push(dataTime.toString());

  if (
    !clearSelectedItem &&
    (('order_id' in tradingDataResolved &&
      highlightOption.orderId === tradingDataResolved.order_id &&
      msgTypeName !== 'Quote') ||
      (dataTime === highlightOption.time &&
        msgTypeName === highlightOption.type &&
        msgTypeName === 'Quote'))
  ) {
    active = true;
  }

  if (msgTypeName === 'Quote')
    updateQuoteData(
      tradingDataResolved as QuoteChartResolved,
      key,
      dataTime,
      price,
      active,
    );
  else if (msgTypeName === 'OrderInput')
    updateOrderInputData(
      tradingDataResolved as OrderInputChartResolved,
      key,
      dataTime,
      price,
      active,
    );
  else if (msgTypeName === 'Order')
    updateOrderData(
      tradingDataResolved as OrderChartResolved,
      key,
      dataTime,
      price,
      active,
    );
  else if (
    msgTypeName === 'OrderAction' &&
    (tradingDataResolved as OrderActionResolved).action_flag ===
      OrderActionFlagEnum.Cancel
  )
    updateOrderActionData(
      tradingDataResolved as OrderActionResolved,
      key,
      dataTime,
      price,
      active,
    );
}

function updateQuoteData(
  tradingData: QuoteChartResolved,
  key: string,
  dataTime: bigint,
  price: number,
  active?: boolean,
) {
  if (!quoteXAxisData.value[key]) {
    quoteXAxisData.value[key] = [];
  }
  quoteXAxisData.value[key].push(Number(dataTime));
  chartSeriesData.value[key].Quote.line.push({
    value: [dataTime.toString(), price],
  });
  chartSeriesData.value[key].Quote.symbol.push({
    value: [dataTime.toString(), price],
    tooltip: {
      position: setTooltipPosition,
      formatter: tooltipFormatter(tradingData, 'Quote'),
    },
    customInfo: {
      tableRowId: tradingData.tableRowId,
      time: tradingData.data_time,
      msgTypeName: tradingData.msgTypeName,
    },
    itemStyle: {
      color: active ? '#0F6DA6' : 'transparent',
    },
  });
}

function updateOrderInputData(
  tradingData: OrderInputChartResolved,
  key: string,
  dataTime: bigint,
  price: number,
  active?: boolean,
) {
  const baseObject: SeriesData = {
    value: [dataTime.toString(), price],
    symbolRotate: tradingData.side === 0 ? 180 : 0,
    itemStyle: {
      color: tradingData.side === 0 ? '#f21717' : '#17b07f',
    },
    tooltip: {
      position: setTooltipPosition,
      formatter: tooltipFormatter(tradingData),
    },
    customInfo: {
      orderId: tradingData.order_id || 0n,
      tableRowId: tradingData.tableRowId,
      time: tradingData.insert_time,
      msgTypeName: tradingData.msgTypeName,
    },
  };

  if (active) {
    baseObject.symbolSize = ACTIVE_SYMBOL_SIZE;
    baseObject.itemStyle = {
      color: tradingData.side === 0 ? '#f21717' : '#17b07f',
      shadowColor: tradingData.side === 0 ? '#f37370' : '#8fd460',
    };
  }

  chartSeriesData.value[key].OrderInput.push(baseObject);
}

function updateOrderData(
  tradingData: OrderChartResolved,
  key: string,
  dataTime: bigint,
  price: number,
  active?: boolean,
) {
  const baseObject: SeriesData = {
    value: [dataTime.toString(), price],
    symbolRotate: tradingData.side === 0 ? 180 : 0,
    symbolOffset: tradingData.side === 0 ? [0, '-120%'] : [0, '120%'],
    itemStyle: {
      color: tradingData.side === 0 ? '#f21717' : '#17b07f',
    },
    tooltip: {
      position: setTooltipPosition,
      formatter: tooltipFormatter(tradingData),
    },
    customInfo: {
      orderId: tradingData.order_id || 0n,
      tableRowId: tradingData.tableRowId,
      time: tradingData.insert_time,
      msgTypeName: tradingData.msgTypeName,
    },
    label: {
      show: true,
      position: tradingData.side === 0 ? 'top' : 'bottom',
      color: tradingData.side === 0 ? '#f21717' : '#17b07f',
      formatter: () => {
        const side = tradingData.side ?? SideEnum.Unknown;
        const offset = tradingData.offset ?? OffsetEnum.Unknown;
        return sideOffsetMap[side] ? sideOffsetMap[side][offset] || '--' : '--';
      },
    },
  };

  if (active) {
    baseObject.symbolSize = ACTIVE_SYMBOL_SIZE;
    baseObject.itemStyle = {
      color: tradingData.side === 0 ? '#f21717' : '#17b07f',
      shadowColor: tradingData.side === 0 ? '#f37370' : '#8fd460',
    };
  }

  chartSeriesData.value[key].Order.push(baseObject);
}

function updateOrderActionData(
  tradingData: OrderActionResolved,
  key: string,
  dataTime: bigint,
  price: number,
  active?: boolean,
) {
  const baseObject: SeriesData = {
    value: [dataTime.toString(), price],
    symbolOffset: [0, '120%'],
    tooltip: {
      position: setTooltipPosition,
      formatter: tooltipFormatter(tradingData),
    },
    customInfo: {
      orderId: tradingData.order_id || 0n,
      tableRowId: tradingData.tableRowId,
      time: tradingData.insert_time,
      msgTypeName: tradingData.msgTypeName,
    },
  };

  if (active) {
    baseObject.symbolSize = ACTIVE_SYMBOL_SIZE;
    baseObject.itemStyle = {
      shadowColor: '#73F3F6',
      shadowBlur: 10,
    };
  }

  chartSeriesData.value[key].OrderAction.push(baseObject);
}

function getInstrumentList(searchKey?: string) {
  return searchKey
    ? Object.keys(frameListResolved.value).filter((item) => {
        return item.includes(searchKey);
      })
    : Object.keys(frameListResolved.value);
}

function getCurInstrument(instrument: string, clearSelectedItem = true) {
  if (clearSelectedItem) {
    selectedSign = false;
    resetHighlineOption();
    selectedInstrument.value = instrument || '';
    searchOrderId.value = '';
  }

  updateOption(clearSelectedItem);
}

function initChart() {
  const element = document.getElementById('strategyChart');
  if (element) {
    myChart = echarts.init(element as HTMLElement, '', { renderer: 'svg' });
    addChartEventListener(myChart);
  }
}

const getYAxisInterval = () => {
  const element = document.getElementById('strategyChart');
  const yHeight = element?.clientHeight;
  let interval = 2;
  if (yHeight) {
    let minYSplit = DEFAULT_MIN_Y_SPLIT;
    let ySpace = DFEAUKT_Y_SPACE;

    const dataRange =
      Number(xAxisMinMax.value.max) - Number(xAxisMinMax.value.min);
    let desiredPixelPerSection = yHeight / minYSplit;

    if (desiredPixelPerSection >= ySpace) {
      desiredPixelPerSection = ySpace;
      interval = (dataRange * desiredPixelPerSection) / yHeight;
    } else {
      interval = dataRange / minYSplit;
    }

    return interval.kfRound(2);
  }
  return (
    (Number(xAxisMinMax.value.max) - Number(xAxisMinMax.value.min)) / 4 ||
    interval
  );
};

const updateOption = async (clearSelectedItem = true) => {
  const currentData = chartSeriesData.value[selectedInstrument.value];
  if (!currentData) return;

  setXAxisMinMax();

  const { min, max } = xAxisMinMax.value;
  option.yAxis.interval = getYAxisInterval();
  option.yAxis.min = min;
  option.yAxis.max = max;

  const { Quote, OrderInput, Order, OrderAction } = currentData;
  [
    option.series[0].data,
    option.series[1].data,
    option.series[2].data,
    option.series[3].data,
    option.series[4].data,
  ] = [Quote.line, OrderInput, Order, OrderAction, Quote.symbol];

  const dataLength = option.series[1].data.length;
  const endZoomValue = (DEFAULT_ORDER_LENGTH / dataLength) * 100;
  const adjustedZoomValue =
    endZoomValue < DEFAULT_CHART_LENGTH_RATE
      ? DEFAULT_CHART_LENGTH_RATE
      : endZoomValue;

  if (clearSelectedItem) {
    option.dataZoom.forEach((item) => {
      item.start = 0;
      item.end = dataLength <= DEFAULT_ORDER_LENGTH ? 100 : adjustedZoomValue;
      item.labelFormatter = (value) =>
        getNanoDateString(BigInt(option.xAxis.data[value]), 6, 6);
    });
  }

  option.xAxis.data = xAxisData.value[selectedInstrument.value]
    .sort((a, b) => Number(a) - Number(b))
    .map((item) => item.toString());
  option.xAxis.axisLabel.formatter = (value) =>
    getNanoDateString(BigInt(value), 6, 6);

  if (quoteXAxisData.value[selectedInstrument.value]) {
    quoteXAxisData.value[selectedInstrument.value].sort((a, b) => a - b);
  }

  if (myChart) {
    myChart.setOption(option);
  }

  hasInit.value = true;

  if (shouldResize.value) {
    await delayMilliSeconds(0);
    myChart.resize();
  }
};

function handleResize(update = false) {
  if (myChart && hasInit.value) {
    if (update) {
      updateOption(false);
    }
    myChart.resize();
  } else {
    shouldResize.value = true;
  }
}
function getDefaultSize(name: string) {
  switch (name) {
    case t('journalConfig.order_input_legend'):
      return 8;
    case t('journalConfig.order_legend'):
      return 12;
    default:
      return DEFAULT_SYMBOL_SIZE;
  }
}

function resetHighlineOption() {
  highlightOption.time = 0n;
  highlightOption.type = '';
  highlightOption.orderId = 0n;
}

function addChartEventListener(myChart: echarts.ECharts) {
  window.addEventListener('resize', () => handleResize());

  myChart.on('click', (params) => {
    if (!option || !params.data) return;
    const serieItemData = params.data as SeriesData;
    if (!serieItemData.customInfo) return;
    const { msgTypeName, tableRowId, orderId } = serieItemData.customInfo;

    frameListResolved.value[selectedInstrument.value][msgTypeName].forEach(
      (fram) => {
        if (fram.tableRowId === tableRowId) {
          setCurrentFrameId(fram.tableRowId || '');
          setSelectedChartItem(fram.index ?? 0);
        }
      },
    );

    if (params.componentSubType === 'scatter') {
      selectedSign = orderId ? true : false;
      option.series
        .filter((_serie, index) => {
          return index !== 0 && index !== 4;
        })
        .forEach((serie) => {
          const defaultSize = getDefaultSize(serie.name);
          serie.data.forEach((item: SeriesData) => {
            if (item.customInfo?.orderId === orderId) {
              highlightOption.orderId = item.customInfo?.orderId || 0n;
              highlightOption.time = item.customInfo?.time || 0n;
              highlightOption.type = item.customInfo?.msgTypeName || '';

              let shadowColor = '';
              item.symbolSize = ACTIVE_SYMBOL_SIZE;
              if (item.customInfo?.msgTypeName === 'orderAction') {
                shadowColor = '#73F3F6';
              } else {
                shadowColor =
                  item.itemStyle?.color === '#f21717' ? '#f37370' : '#8fd460';
              }
              item.itemStyle = {
                ...item.itemStyle,
                shadowBlur: 10,
                shadowColor,
              };
            } else {
              item.symbolSize = defaultSize;
              item.itemStyle = {
                ...item.itemStyle,
                shadowBlur: 0,
              };
            }
          });
        });

      myChart && myChart.setOption(option);
    }
  });

  myChart.on('datazoom', (params) => {
    let { start, end } = params as {
      start: number;
      end: number;
    };

    option.dataZoom.forEach((item) => {
      item.start = start;
      item.end = end;
    });
  });

  myChart.getZr().on('click', (event) => {
    if (!event.target) {
      if (!selectedSign) return;
      option.series
        .filter((serie, index) => {
          return index !== 0 && index !== 4;
        })
        .forEach((serie) => {
          const defaultSize = getDefaultSize(serie.name);
          serie.data.forEach((item) => {
            if (item.symbolSize !== defaultSize) {
              setCurrentFrameId('');
              item.symbolSize = defaultSize;
            }

            item.itemStyle = {
              ...item.itemStyle,
              shadowBlur: 0,
            };
          });
        });
      option.series[4].data.forEach((item) => {
        if (item.itemStyle?.color !== 'transparen') {
          item.itemStyle = {
            color: 'transparent',
          };
          setCurrentFrameId('');
        }
      });
      myChart && myChart.setOption(option);
      selectedSign = false;
      resetHighlineOption();
    }
  });

  let lastIndex;
  myChart.getZr().on('mousemove', (e) => {
    if (!e.target || e.target.type !== 'ec-polyline') return;
    const { offsetX, offsetY } = e;
    const [index] = myChart.convertFromPixel({ seriesIndex: 0 }, [
      offsetX,
      offsetY,
    ]);

    let { dataTime } = getTradingDataValueByKey(chartFrameList.value[index]);
    let closestTimeIndex = findClosestTime(
      Number(dataTime),
      quoteXAxisData.value[selectedInstrument.value],
    );
    if (lastIndex !== undefined) {
      myChart.dispatchAction({
        type: 'downplay',
        seriesIndex: 0,
        dataIndex: lastIndex,
      });
    }
    myChart.dispatchAction({
      type: 'highlight',
      seriesIndex: 0,
      dataIndex: closestTimeIndex,
    });
    if (closestTimeIndex !== lastIndex) lastIndex = closestTimeIndex;
  });

  const element = document.getElementById('strategyChart');
  element &&
    element.addEventListener('mouseout', () => {
      if (lastIndex) {
        myChart.dispatchAction({
          type: 'downplay',
          seriesIndex: 0,
          dataIndex: lastIndex,
        });
      }
    });
}

const chartFrameList = computed(() => {
  return [
    ...(frameListResolved.value[selectedInstrument.value].Quote ?? []),
    ...(frameListResolved.value[selectedInstrument.value].Order ?? []),
    ...(frameListResolved.value[selectedInstrument.value].OrderInput ?? []),
    ...(frameListResolved.value[selectedInstrument.value].OrderAction ?? []),
  ].sort((a, b) => {
    let aDataTime = getTradingDataValueByKey(a).dataTime;
    let bDataTime = getTradingDataValueByKey(b).dataTime;
    return Number(aDataTime) - Number(bDataTime);
  });
});

function getTradingDataValueByKey(
  data: FrameResolvedDataType | FrameDataType,
  type?: string,
) {
  let dataTime = 0n,
    price = 0;
  if (!data)
    return {
      dataTime,
      price,
    };
  let msgTypeName = '';
  if ('msgTypeName' in data) {
    msgTypeName = data.msgTypeName;
  } else if (type) {
    msgTypeName = type;
  } else {
    return {
      dataTime,
      price,
    };
  }
  switch (msgTypeName) {
    case 'Quote':
      if ('data_time' in data) dataTime = data.data_time;
      if ('last_price' in data) price = data.last_price;
      break;
    case 'OrderInput':
      if ('insert_time' in data) dataTime = data.insert_time;
      if ('limit_price' in data) price = data.limit_price;
      break;
    case 'Order':
      if ('insert_time' in data) dataTime = data.insert_time;
      if ('limit_price' in data) price = data.limit_price;
      break;
    case 'OrderAction':
      if ('insert_time' in data) dataTime = data.insert_time;
      if ('limit_price' in data) price = data.limit_price;
      break;
  }

  return {
    dataTime,
    price,
  };
}

function tooltipFormatter(data: FrameResolvedDataType, type?: string) {
  let htmlTemplate;
  if (type) {
    htmlTemplate = Object.keys(data).reduce((pre, cur) => {
      if (cur === 'bid_volume' || cur === 'ask_volume') return pre;
      if (cur === 'bid_price' || cur === 'ask_price') {
        const side =
          cur === 'bid_price'
            ? t('tradingConfig.buy')
            : t('tradingConfig.sell');
        data[cur].forEach((item, index) => {
          if (index > 4) return;
          const volume =
            cur === 'bid_price'
              ? data['bid_volume'][index]
              : data['ask_volume'][index];
          pre += `<div class="tooltip-row">
          <span class="tooltip-item-key">${side}${index + 1}</span>
          <span class="tooltip-item-value">${item}--${volume}</span>
        </div>`;
        });

        return pre;
      }
      return (pre += `<div class="tooltip-row">
          <span class="tooltip-item-key">${cur}</span>
          <span class="tooltip-item-value">${
            cur === 'data_time' ? getNanoDateString(data[cur]) : data[cur]
          }</span>
        </div>`);
    }, '');
  } else {
    htmlTemplate = Object.keys(data).reduce((pre, cur) => {
      return (pre += `<div class="tooltip-row">
          <span class="tooltip-item-key">${cur}</span>
          <span class="tooltip-item-value">${
            ['insert_time', 'update_time'].includes(cur)
              ? getNanoDateString(data[cur])
              : data[cur]
          }</span>
        </div>`);
    }, '');
  }
  return `
    <div class="tooltip-container">
      ${htmlTemplate}
    </div>
  `;
}

function findClosestTime(targetTime: number, times: (number | string)[]) {
  if (!times || times.length === 0) {
    return 0;
  }
  let left = 0;
  let right = times.length - 1;
  let mid = 0;
  if (times.indexOf(targetTime) !== -1) {
    return times.indexOf(targetTime);
  }
  while (left <= right) {
    mid = Math.floor((left + right) / 2);
    if (times[mid] === targetTime) {
      return mid;
    } else if (Number(times[mid]) < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return Math.abs(targetTime - Number(times[mid])) <
    Math.abs(targetTime - Number(times[mid + 1]))
    ? mid
    : mid + 1;
}

function handleSearchOrderId() {
  if (!searchOrderId.value) return;
  const orderIdInfo = {
    hasId: false,
    tableRowId: '',
    msgTypeName: '',
  };
  let dataTime = 0n;

  option.series
    .filter((_serie, index) => {
      return index !== 0 && index !== 4;
    })
    .forEach((serie) => {
      serie.data.forEach((item) => {
        const defaultSize = getDefaultSize(serie.name);
        if (item.customInfo?.orderId?.toString() === searchOrderId.value) {
          orderIdInfo.hasId = true;
          orderIdInfo.msgTypeName = item.customInfo.msgTypeName;
          orderIdInfo.tableRowId = item.customInfo.tableRowId;
          frameListResolved.value[selectedInstrument.value][
            orderIdInfo.msgTypeName
          ].forEach((fram) => {
            if (fram.tableRowId === item.customInfo?.tableRowId) {
              setCurrentFrameId(fram.tableRowId || '');
              setSelectedChartItem(fram.index ?? 0);
            }
          });

          dataTime = item.customInfo.time;
          let shadowColor = '';
          item.symbolSize = ACTIVE_SYMBOL_SIZE;
          if (item.customInfo.msgTypeName === 'orderAction') {
            shadowColor = '#73F3F6';
          } else {
            shadowColor =
              item.itemStyle?.color === '#f21717' ? '#f37370' : '#8fd460';
          }
          item.itemStyle = {
            ...item.itemStyle,
            shadowBlur: 10,
            shadowColor,
          };
          highlightOption.orderId = item.customInfo?.orderId || 0n;
          highlightOption.time = item.customInfo?.time || 0n;
          highlightOption.type = item.customInfo?.msgTypeName || '';
        } else {
          item.symbolSize = defaultSize;
          item.itemStyle = {
            ...item.itemStyle,
            shadowBlur: 0,
          };
        }
      });
    });
  if (!orderIdInfo.hasId) {
    messagePrompt().error(t('journalConfig.search_order_id_error'));
    return;
  }

  frameListResolved.value[selectedInstrument.value][
    orderIdInfo.msgTypeName
  ].forEach((fram) => {
    if (fram.id === orderIdInfo.tableRowId) {
      setSelectedChartItem(fram.index ?? 0);
    }
  });

  selectedSign = searchOrderId.value ? true : false;
  setDataZoom(dataTime);
  myChart && myChart.setOption(option);
}

function setDataZoom(dataTime: bigint) {
  const timeList = xAxisData.value[selectedInstrument.value] as string[];

  if (!timeList || timeList.length === 0) return;
  let index = timeList.indexOf(dataTime.toString());
  if (index === -1) {
    index = findClosestTime(Number(dataTime), timeList);
  }
  const rate = (index + 1) / timeList.length;
  const start =
    rate * 100 - DATA_RANGE_SIZE < 0 ? 0 : rate * 100 - DATA_RANGE_SIZE;
  const end =
    rate * 100 + DATA_RANGE_SIZE > 100 ? 100 : rate * 100 + DATA_RANGE_SIZE;
  option.dataZoom.forEach((item) => {
    item.start = start;
    item.end = end;
  });
}

function setXAxisMinMax() {
  const frames = frameListResolved.value[selectedInstrument.value];

  if (!frames) {
    setDefaultMinMax();
    return;
  }

  if (frames.Quote.length > 0) {
    const { upper_limit_price, lower_limit_price, last_price } =
      frames.Quote[0];
    adjustXAxisByLimits(upper_limit_price, lower_limit_price, last_price);
  } else {
    const limitPrice = getLimitPriceFromOrderOrInput(frames);
    if (limitPrice) {
      adjustXAxisByLimitPrice(limitPrice);
    } else {
      setDefaultMinMax();
    }
  }
}

function adjustXAxisByLimits(upper, lower, last) {
  xAxisMinMax.value.max = upper
    ? Math.ceil(upper)
    : last
    ? Math.ceil(last * 1.2)
    : 'dataMax';
  xAxisMinMax.value.min = lower
    ? Math.floor(lower)
    : last
    ? Math.floor(last * 0.8)
    : 'dataMin';
}

function getLimitPriceFromOrderOrInput(frames) {
  if (frames.OrderInput.length > 0) {
    return frames.OrderInput[0].limit_price;
  } else if (frames.Order.length > 0) {
    return frames.Order[0].limit_price;
  }
  return null;
}

function adjustXAxisByLimitPrice(limitPrice) {
  xAxisMinMax.value.max = Math.ceil(limitPrice * 1.2);
  xAxisMinMax.value.min = Math.floor(limitPrice * 0.8);
}

function setDefaultMinMax() {
  xAxisMinMax.value = {
    max: 'dataMax',
    min: 'dataMin',
  };
}

const handleInputChange = debounce(() => {
  instrumentList.value = getInstrumentList(searchInstrument.value);
}, 300);
</script>

<style lang="less">
.kf-visualization_wrap {
  position: relative;
  display: flex;
  height: 100%;

  .ant-table {
    background-color: #1d1d1d;
    .ant-table-cell-fix-left,
    .ant-table-cell-fix-right {
      background-color: #1d1d1d;
    }
  }
  .kf-strategy_wrap {
    flex: 0 0 400px;
  }
  .kf-visualization_data_content {
    display: flex;
    position: relative;
    width: 100%;
    height: 100%;
    .ant-spin.ant-spin-spinning {
      position: absolute;
    }

    .kf-journal-spin {
      .ant-spin-text {
        margin-left: 8px;
      }
    }
    .ant-empty {
      height: auto;
      margin-top: 48px;

      .ant-empty-image {
        height: auto;
      }

      .ant-empty-description {
        color: @input-placeholder-color;
      }
    }
    .kf-instrument_wrap {
      flex: 0 0 200px;
      margin: 0 4px;
      background-color: #1d1d1d;
      .search-input {
        width: 100%;
        min-height: 28px;
        line-height: 28px;
      }
      .instrument-list {
        overflow: auto;
        height: calc(100% - 28px);
        .instrument-item_wrap {
          line-height: 28px;
          height: 28px;
          padding: 0 4px;
          font-size: 12px;
          text-align: left;
          color: #ffffffd9;
          cursor: pointer;
          &:hover {
            background: #434343;
          }
        }
        .selected-status {
          background: #434343;
        }
        .instrument-item {
          margin-right: 2px;
        }
      }
    }
    .kf-chart_wrap {
      flex: 1;
      overflow: visible;
      position: relative;
      color: #ffffff;
      background-color: #1d1d1d;
      .chart-search-order-id {
        position: absolute;
        top: 0;
        right: 0;
        width: 20%;
        max-width: 300px;
        z-index: 1;
      }
      .kf-chart_content {
        width: 100%;
        height: 100%;
      }
      .tooltip-container {
        width: 400px;
        color: #ffffffd9;
        .tooltip-row {
          display: flex;
          justify-content: space-between;
        }
      }
    }
  }
}
</style>
