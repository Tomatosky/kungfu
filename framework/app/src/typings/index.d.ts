import { DefineComponent, Component } from 'vue';
import { KfLayoutDirection, KfLayoutBoardType } from './enums';

declare global {
  namespace KfLayout {
    type ContentId = string;
    type BoardId = number;

    interface ContentObj {
      id: string;
      name?: string;
      component: string;
      closable?: boolean;
    }

    type Content = ContentObj | ContentId;

    type ContentNew = (Omit<ContentObj, 'id'> & { id?: string }) | ContentId;

    interface BaseBoardInfo {
      paId: number;
      id: BoardId;
      direction: KfLayoutDirection;
      width?: number | string;
      height?: number | string;
    }

    interface WrapperBoardInfo extends BaseBoardInfo {
      children: number[];
    }

    interface DefaultContentBoardInfo extends BaseBoardInfo {
      contents: Content[];
      current: ContentId;
      hideAdd?: boolean;
      type?: KfLayoutBoardType;
    }

    interface CustomContentBoardInfo extends BaseBoardInfo {
      type?: KfLayoutBoardType.Custom;
      component?: string;
    }

    type ContentBoardInfo = DefaultContentBoardInfo | CustomContentBoardInfo;

    type BoardInfo = WrapperBoardInfo | ContentBoardInfo;

    type BoardInfoKeys = keyof (WrapperBoardInfo &
      DefaultContentBoardInfo &
      CustomContentBoardInfo);

    interface BoardsMap {
      [prop: BoardId]: BoardInfo;
    }

    interface ContentData {
      content: Content;
      boardId: BoardId;
    }
  }
  interface AntTableColumn {
    title: string;
    dataIndex: string;
    key?: string;
    width?: number | string;
    minWidth?: number | string;
    sorter?:
      | boolean
      | {
          compare: (
            a: any,
            b: any,
            sorterOrder: '' | 'ascend' | 'descend',
          ) => number;
        };
    align?: string;
    fixed?: string;
    defaultSortOrder?: string;
  }

  type AntTableColumns = Array<AntTableColumn>;
  interface ExtraOrderInput {
    side: SideEnum;
    offset?: OffsetEnum;
    volume: number | bigint;
    price: number;
    accountId?: string;
  }

  interface KfTradingDataTableHeaderConfig {
    name: string;
    dataIndex: string;
    align?: 'left' | 'right' | 'center';
    width?: number;
    flex?: number;
    textOverflow?: 'visible' | 'hidden' | 'ellipsis' | 'clip';
    wrap?: boolean;
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
    sorter?: (a: any, b: any, sorterOrder: '' | 'ascend' | 'descend') => number;
  }

  type KfTradingDataTableSelection = Record<
    string,
    {
      disabled?: boolean;
    }
  >;

  type BuiltinComponents =
    | 'Pos'
    | 'PosGlobal'
    | 'Order'
    | 'Trade'
    | 'Td'
    | 'Md'
    | 'Strategy'
    | 'Operator'
    | 'TradingTask'
    | 'MarketData'
    | 'OrderBook'
    | 'MakeOrder'
    | 'FutureArbitrage'
    | 'BlockTrade'
    | 'OrderTriggerRecord'
    | 'TransferRecord'
    | 'KfBoards';

  interface BuiltinComponentPropsMap {
    TradingTask?: {
      taskFilter?: (task: Pm2ProcessStatusDetail) => boolean;
      taskSorter?: (
        a: Pm2ProcessStatusDetail,
        b: Pm2ProcessStatusDetail,
      ) => number;
      strategyFilter?: (
        strategyExtConfig: KungfuApi.KfStrategyExtConfig,
      ) => boolean;
    };
    MakeOrder?: {
      sideFilter?: (instrumentType: InstrumentTypeEnum) => string[];
    };
    KfBoards?: {
      boardId: number;
      boardsId: string;
      setBoardHeaderExtra: (extra: DefineComponent | Component) => void;
    };
  }

  // interface BuiltinComponentInjectKeysMap{
  //   Side:{
  //     sideFilter?: (instrumentType: InstrumentTypeEnum) => string[];
  //   }
  // }

  interface UIHelperProvideMap {
    KfBoards: {
      boardInfosMounter: (
        data: Required<BuiltinComponentPropsMap>['KfBoards'],
      ) => void;
    };
  }

  declare module 'worker-loader!*' {
    class WebpackWorker extends Worker {
      constructor();
    }

    export = WebpackWorker;
  }

  declare module '~icons/*';
  declare module '*.gif';
  declare module '*.svg';
}
