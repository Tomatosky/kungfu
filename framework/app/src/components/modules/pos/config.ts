import { DealTradingTableHooks } from '@kungfu-trader/kungfu-js-api/hooks/dealTradingTableHook';
import { isTd } from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import { defaultColorMap } from '@kungfu-trader/kungfu-js-api/config/systemConfig';

import { useQuote } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import {
  IVTableColumn,
  IVTableColumns,
  vTableSorter,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';
import {
  dealCurrency,
  dealDirection,
} from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';

const { t } = VueI18n.global;

const { getPositionLastPrice } = useQuote();
export { getPositionLastPrice };
const globalStore = useGlobalStore();

export const getColumns = (kfLocation: KungfuApi.KfLocation): IVTableColumns =>
  (globalThis.HookKeeper.getHooks().dealTradingTable as DealTradingTableHooks)
    .trigger(kfLocation, 'position')
    .getColumns<IVTableColumn>([
      {
        field: 'instrument_id_resolved',
        title: t('posGlobalConfig.instrument_id'),
        width: 156,
        sort: vTableSorter,
        customLayout: [
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
              globalStore.globalSetting?.currency?.instrumentCurrency
                ? dealCurrency(record.currency || 0).name
                : '',
            fontSize: 12,
            fill: '#faad14',
            boundsPadding: [7, 10, 5, 10],
            key: 'currency',
          },
        ],
      },
      ...(isTd(kfLocation.category)
        ? []
        : [
            {
              field: 'account_id_resolved',
              title: t('posGlobalConfig.account_id_resolved'),
              width: 78,
              sort: vTableSorter,
            },
          ]),
      {
        field: 'direction',
        title: '',
        width: 44,
        style: {
          color: (args) => {
            return defaultColorMap[
              dealDirection(args.dataValue).color || 'default'
            ];
          },
        },
        fieldFormat: (args) => {
          return dealDirection(args.direction).name;
        },
      },
      {
        field: 'static_yesterday',
        title: t('posGlobalConfig.static_yesterday'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'open_volume',
        title: t('posGlobalConfig.open_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'close_volume',
        title: t('posGlobalConfig.close_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'yesterday_volume',
        title: t('posGlobalConfig.yesterday_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'today_volume',
        title: t('posGlobalConfig.today_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'volume',
        title: t('posGlobalConfig.sum_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'frozen_total',
        title: t('posGlobalConfig.frozen_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'closable_volume',
        title: t('posGlobalConfig.closable_volume'),
        width: 74,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },

      {
        field: 'avg_open_price_resolved',
        title: t('posGlobalConfig.avg_open_price'),
        width: 98,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
      {
        field: 'last_price_resolved',
        title: t('posGlobalConfig.last_price'),
        width: 86,
        style: {
          textAlign: 'right',
        },
        headerStyle: {
          textAlign: 'right',
        },
        fieldFormat: (args) => {
          return getPositionLastPrice(args, 'last_price_resolved') ?? '--';
        },
        sort: vTableSorter,
      },
      {
        field: 'unrealized_pnl_resolved',
        title: t('posGlobalConfig.unrealized_pnl'),
        width: 98,
        style: {
          textAlign: 'right',
          color: (args) => {
            if (!Number(args.dataValue)) return defaultColorMap['text'];

            return +args.dataValue > 0
              ? defaultColorMap['red']
              : defaultColorMap['green'];
          },
        },
        headerStyle: {
          textAlign: 'right',
        },
        sort: vTableSorter,
      },
    ]);
