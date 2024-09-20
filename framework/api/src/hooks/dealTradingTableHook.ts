import { kfLogger } from '../utils/logUtils';
import {
  VTable,
  IVTableColumn,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';
import { generateLocationCombinations } from '@kungfu-trader/kungfu-js-api/hooks/hookUtils';

export interface KfTradingDataTableHeaderConfig {
  name: string;
  dataIndex: string;
  width?: number;
  flex?: number;
  type?:
    | 'number'
    | 'string'
    | 'source'
    | 'nanoTime'
    | 'exchange'
    | 'offset'
    | 'side'
    | 'priceType'
    | 'direction'
    | 'actions';
  sorter?: (
    a: unknown,
    b: unknown,
    sorterOrder: '' | 'ascend' | 'descend',
  ) => number;
}

export interface AntTableColumn {
  title: string;
  dataIndex: string;
  key?: string;
  width?: number | string;
  minWidth?: number | string;
  sorter?:
    | boolean
    | {
        compare: (
          a: unknown,
          b: unknown,
          sorterOrder: '' | 'ascend' | 'descend',
        ) => number;
      };
  align?: string;
  fixed?: string;
}

export type TradingTableTypes =
  | 'position'
  | 'trade'
  | 'order'
  | 'td'
  | 'unkown';

export type TradingTableColumnsTypes =
  | AntTableColumn
  | KfTradingDataTableHeaderConfig
  | VTable.ColumnDefine
  | IVTableColumn;

export type TradingDataTypes =
  | KungfuApi.PositionResolved
  | KungfuApi.TradeResolved
  | KungfuApi.OrderResolved;

export class TradingTableDealer {
  locationKey: string;
  tradingTableType: TradingTableTypes;
  columnsDealers: Array<
    <ColumnsType extends TradingTableColumnsTypes>(
      columns: ColumnsType[],
    ) => ColumnsType[]
  >;
  dataResolvers: Array<
    <DataType extends TradingDataTypes>(datas: DataType[]) => DataType[]
  >;

  constructor(loactionKey: string, tradingTableType: TradingTableTypes) {
    this.locationKey = loactionKey;
    this.tradingTableType = tradingTableType;
    this.columnsDealers = [];
    this.dataResolvers = [];
  }

  getColumns<ColumnsType extends TradingTableColumnsTypes>(
    columns: ColumnsType[],
  ) {
    if (this.columnsDealers.length) {
      kfLogger.info(
        `DealTradingTable hook ${this.locationKey} ${this.tradingTableType} trigger getColumns success`,
      );

      return this.columnsDealers.reduce(
        (dealedColumns, dealer) => dealer(dealedColumns),
        columns,
      );
    }

    return columns;
  }

  resolveData<DataType extends TradingDataTypes>(datas: DataType[]) {
    if (this.dataResolvers.length) {
      kfLogger.info(
        `DealTradingTable hook ${this.locationKey} ${this.tradingTableType} trigger resolveDatas success`,
      );

      return this.dataResolvers.reduce(
        (resolvedDatas, resolver) => resolver(resolvedDatas),
        datas,
      );
    }

    return datas;
  }
}

export type TradingTableDealerMap = Partial<
  Record<TradingTableTypes, TradingTableDealer>
>;

const DefaultUnkownTrdaingTableDealerMap = {};

const DefaultTradingTableDealer = new TradingTableDealer('unkown', 'unkown');

export class DealTradingTableHooks {
  hooks: Record<string, TradingTableDealerMap>;
  constructor() {
    this.hooks = new Proxy(
      {},
      {
        get(target: Record<string, TradingTableDealerMap>, prop: string) {
          const locationPairs = prop.split('_');
          if (locationPairs.length != 4) {
            kfLogger.warn(`Invalid hook key: ${prop}`);
            return DefaultUnkownTrdaingTableDealerMap;
          }

          const [category, group, name, mode] = prop.split('_');
          const originalKeys: [string, string, string, string] = [
            category,
            group,
            name,
            mode,
          ];

          const findMatchingKey = () => {
            for (const key of generateLocationCombinations(originalKeys)) {
              if (target[key]) {
                return target[key];
              }
            }
            return DefaultUnkownTrdaingTableDealerMap;
          };

          return findMatchingKey();
        },

        set(
          target: Record<string, TradingTableDealerMap>,
          prop: string,
          value: Record<
            TradingTableTypes,
            {
              getColumns: <ColumnsType extends TradingTableColumnsTypes>(
                columns: ColumnsType[],
              ) => ColumnsType[];
              resolvedDatas: <DataType extends TradingDataTypes>(
                datas: DataType[],
              ) => DataType[];
            }
          >,
        ) {
          let exsitedDealerMap: TradingTableDealerMap = {};
          if (Reflect.has(target, prop)) {
            exsitedDealerMap = Reflect.get(target, prop);
          }

          Object.keys(value).forEach((key) => {
            const tradingTableType = key as TradingTableTypes;
            if (exsitedDealerMap[tradingTableType]) {
              value[tradingTableType].getColumns &&
                exsitedDealerMap[tradingTableType]?.columnsDealers.push(
                  value[tradingTableType].getColumns,
                );
              value[tradingTableType].resolvedDatas &&
                exsitedDealerMap[tradingTableType]?.dataResolvers.push(
                  value[tradingTableType].resolvedDatas,
                );
            } else {
              const newDealer = new TradingTableDealer(prop, tradingTableType);
              value[tradingTableType].getColumns &&
                newDealer.columnsDealers.push(
                  value[tradingTableType].getColumns,
                );
              value[tradingTableType].resolvedDatas &&
                newDealer.dataResolvers.push(
                  value[tradingTableType].resolvedDatas,
                );
              exsitedDealerMap[tradingTableType] = newDealer;
            }
          });

          Reflect.set(target, prop, exsitedDealerMap);
          kfLogger.info(`DealTradingTable hook ${prop} register success`);
          return true;
        },
      },
    );
  }

  register(
    kfLocation: KungfuApi.DerivedKfLocation,
    tradingTableType: TradingTableTypes,
    dealer: {
      getColumns?: (
        columns: TradingTableColumnsTypes[],
      ) => TradingTableColumnsTypes[];
      resolvedDatas?: (datas: TradingDataTypes[]) => TradingDataTypes[];
    },
  ) {
    const { category, group, name, mode } = kfLocation;
    const key = `${category}_${group}_${name}_${mode}`;
    Reflect.set(this.hooks, key, { [tradingTableType]: dealer });
  }

  trigger(
    kfLocation: KungfuApi.DerivedKfLocation,
    tradingTableType: TradingTableTypes,
  ) {
    const { category, group, name, mode } = kfLocation;
    const key = `${category}_${group}_${name}_${mode}`;
    const dealer = (Reflect.get(this.hooks, key) as TradingTableDealerMap)[
      tradingTableType
    ];

    return dealer ?? DefaultTradingTableDealer;
  }
}
