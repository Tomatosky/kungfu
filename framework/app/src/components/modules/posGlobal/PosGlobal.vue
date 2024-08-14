<script setup lang="ts">
import {
  searchByKeyword,
  useBrowserWindowMinimize,
  useDashboardBodySize,
  useTriggerMakeOrder,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import {
  VTable,
  ICustomActionOption,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';

import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  ref,
  toRaw,
} from 'vue';
import { storeToRefs } from 'pinia';
import KfDashboard from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboard.vue';
import KfDashboardItem from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboardItem.vue';
import KfCanvasTradingDataTable from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfCanvasTradingDataTable.vue';
import { categoryRegisterConfig, getColumns } from './config';
import { dealKfDecimalPrecision } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import {
  dealCurrency,
  getPrecisionByInstrumentType,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import {
  LedgerCategoryEnum,
  SideEnum,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import {
  getInstrumentByInstrumentPair,
  useCurrentGlobalKfLocation,
  useInstruments,
  useActiveInstruments,
  useQuote,
  useDealDataWithCaches,
  showTradingDataDetail,
  getPosClosableVolumeByOffset,
  useCoreBindPage,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import { dealPosition } from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';
import { resolveTriggerOffset } from '../pos/utils';
import { getKfGlobalSettings } from '@kungfu-trader/kungfu-js-api/config/globalSettings';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';

useCoreBindPage();

const { t } = VueI18n.global;

globalThis.HookKeeper.getHooks().dealTradingData.register(
  {
    category: categoryRegisterConfig.category,
    group: '*',
    name: '*',
    mode: '*',
  },
  categoryRegisterConfig,
);

const canvasRef = ref();

const app = getCurrentInstance();
const windowMinimized = useBrowserWindowMinimize();
const pos = ref<KungfuApi.PositionResolved[]>([]);
const { handleBodySizeChange } = useDashboardBodySize();
const searchKeyword = ref('');

const { setCurrentGlobalKfLocation } = useCurrentGlobalKfLocation(
  window.watcher,
);
const { instruments } = useInstruments();
const { getPositionLastPrice } = useQuote();
const { triggerOrderBook, triggerMakeOrder } = useTriggerMakeOrder();
const {
  getInstrumentCurrencyByIds,
  getInstrumentCurrency,
  getInstrumentName,
  getPriceTickAndPrecision,
} = useActiveInstruments();
const { dealDataWithCache } = useDealDataWithCaches<
  KungfuApi.Position,
  KungfuApi.PositionResolved
>(['uid_key', 'update_time']);
const { globalSetting } = storeToRefs(useGlobalStore());

const customLayout = computed<Record<string, ICustomActionOption[]>>(() => {
  return {
    instrument_id: [
      {
        type: 'text',
        dealValue: (record) => record.instrument_id_resolved,
        fontSize: 12,
        fill: '#ffffffd9',
        boundsPadding: [7, 10, 5, 10],
        key: 'instrument_id_resolved',
      },
      {
        type: 'text',
        dealValue: (record) =>
          globalSetting.value?.currency?.instrumentCurrency
            ? dealCurrency(
                getInstrumentCurrencyByIds(
                  record?.instrument_id || '',
                  record?.exchange_id || '',
                ),
              )?.name
            : '',
        fontSize: 12,
        fill: '#faad14',
        boundsPadding: [7, 10, 5, 10],
        key: 'currency',
      },
    ],
  };
});

const columns = computed(() => {
  const kfGlobalSettings = getKfGlobalSettings();
  const tradeSettings = kfGlobalSettings.filter(
    (item) => item.key === 'trade',
  )[0];
  const posTableColumnsOptions = tradeSettings.config
    .filter((item) => item.key === 'posTableColumns')[0]
    .options?.map((item) => item.value);
  const selectedOptions: string[] = globalSetting.value?.trade?.posTableColumns;
  if (!posTableColumnsOptions || !selectedOptions) {
    return getColumns();
  }
  const notSelectedOptions = posTableColumnsOptions.filter((item) => {
    return !selectedOptions.includes(item as string);
  });

  const columnsConfig = getColumns();

  return columnsConfig.filter((item) => {
    return !notSelectedOptions.includes(item.field as string);
  });
});

const setTableData = () => {
  const tableData = searchByKeyword<KungfuApi.PositionResolved>(
    searchKeyword.value,
    pos.value,
    ['instrument_id_resolved', 'instrument_id', 'exchange_id', 'direction'],
  );
  canvasRef.value?.setRecords(tableData);
};

onActivated(() => {
  if (app?.proxy) {
    const subscription = app.proxy.$tradingDataSubject.subscribe((data) => {
      const { watcher } = data;

      if (windowMinimized.value) return;

      const positions = watcher.ledger.Position.nofilter('volume', 0)
        .filter('ledger_category', LedgerCategoryEnum.td)
        .list();

      pos.value = toRaw(
        buildGlobalPositions(positions).map((position) => {
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
            { currency },
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

type PosStat = Record<string, KungfuApi.Position & { id: string }>;

function buildGlobalPositions(
  positions: KungfuApi.Position[],
): KungfuApi.Position[] {
  const posStatData: PosStat = positions.reduce((posStat, pos) => {
    const precision = getPrecisionByInstrumentType(pos.instrument_type);
    const id = `${pos.instrument_id}_${pos.exchange_id}_${pos.direction}`;
    const { price_precision } = getPriceTickAndPrecision(
      pos.instrument_id,
      pos.exchange_id,
    );
    if (!posStat[id]) {
      posStat[id] = Object.assign({}, pos, { id, uid_key: pos.uid_key });
    } else {
      const prePosStat = posStat[id];
      const {
        avg_open_price,
        volume,
        yesterday_volume,
        unrealized_pnl,
        update_time,
        static_yesterday,
        open_volume,
      } = prePosStat;
      posStat[id].yesterday_volume = dealKfDecimalPrecision(
        yesterday_volume + pos.yesterday_volume,
        precision,
      );
      posStat[id].volume = dealKfDecimalPrecision(
        volume + pos.volume,
        precision,
      );
      posStat[id].static_yesterday = dealKfDecimalPrecision(
        static_yesterday + pos.static_yesterday,
        precision,
      );
      posStat[id].open_volume = dealKfDecimalPrecision(
        open_volume + pos.open_volume,
        precision,
      );
      posStat[id].avg_open_price = dealKfDecimalPrecision(
        (avg_open_price * volume + pos.avg_open_price * pos.volume) /
          (volume + pos.volume),
        price_precision || precision,
      );
      posStat[id].unrealized_pnl = dealKfDecimalPrecision(
        unrealized_pnl + pos.unrealized_pnl,
        price_precision || precision,
      );
      posStat[id].update_time =
        update_time > pos.update_time ? update_time : pos.update_time;
    }
    return posStat;
  }, {} as PosStat);

  return Object.values(posStatData);
}

function handleClickRow(args: VTable.MousePointerCellEvent) {
  const row = args.originData;
  if (!row) return;
  const locationResolved: KungfuApi.KfExtraLocation = {
    category: categoryRegisterConfig.category,
    group: row.exchange_id,
    name: row.instrument_id,
    mode: 'live',
    direction: row.direction,
  };

  setCurrentGlobalKfLocation(locationResolved);
  tiggerOrderBookAndMakeOrder(row);
}

function tiggerOrderBookAndMakeOrder(record: KungfuApi.PositionResolved) {
  const { instrument_id, instrument_type, exchange_id } = record;
  const ensuredInstrument: KungfuApi.InstrumentResolved =
    getInstrumentByInstrumentPair(
      {
        instrument_id,
        instrument_type,
        exchange_id,
      },
      instruments.value,
    );

  const offset = resolveTriggerOffset(record);
  triggerOrderBook(ensuredInstrument);
  const extraOrderInput: ExtraOrderInput = {
    side: record.direction === 0 ? SideEnum.Sell : SideEnum.Buy,
    offset,
    volume: getPosClosableVolumeByOffset(record, offset),
    price: getPositionLastPrice(record) || 0,
  };
  triggerMakeOrder(ensuredInstrument, extraOrderInput);
}

function handleShowTradingDataDetail(args: VTable.MousePointerCellEvent) {
  const { originData } = args;
  if (!originData) return;
  originData.last_price = getPositionLastPrice(
    originData,
    'last_price_resolved',
  );
  showTradingDataDetail(originData, t('posGlobalConfig.pos_detail_header'), [
    'account_id_resolved',
    'last_price_resolved',
    'holder_uid',
  ]);
}
</script>
<template>
  <div class="kf-position-global__warp kf-translateZ">
    <KfDashboard @boardSizeChange="handleBodySizeChange">
      <template #header>
        <KfDashboardItem>
          <a-input-search
            v-model:value="searchKeyword"
            :placeholder="$t('keyword_input')"
            style="width: 120px"
          />
        </KfDashboardItem>
      </template>
      <KfCanvasTradingDataTable
        ref="canvasRef"
        table-key="PosGlobal"
        :columns="columns"
        :custom-layout="customLayout"
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
.kf-position-global__warp {
  height: 100%;
}
</style>
