declare function __non_webpack_require__(id: string): unknown;
declare const __python_version: string;
declare const __git_commit_version: string;
declare const __build_timestamp: number;
declare const __resources: string;

type AnyFunction = (...args: unknown[]) => unknown;
type AnyPromiseFunction = (...args: unknown[]) => Promise<unknown>;

declare module 'tasklist' {
  function tasklist(options: {
    verbose: boolean;
  }): Promise<{ pid: number; imageName: string; username: string }[]>;

  export = tasklist;
}

declare namespace KungfuApi {
  import {
    BrokerStateStatusEnum,
    StrategyStateStatusEnum,
    StrategyStateStatusTypes,
    InstrumentTypeEnum,
    TdMdExtTypes,
    StrategyExtTypes,
    SystemExtTypes,
    ExtRunForEnvTypesEnum,
    PriceTypeEnum,
    SideEnum,
    OffsetEnum,
    HedgeFlagEnum,
    LedgerCategoryEnum,
    VolumeConditionEnum,
    TimeConditionEnum,
    CommissionModeEnum,
    DirectionEnum,
    OrderStatusEnum,
    KfCategoryEnum,
    KfCategoryTypes,
    KfUIExtLocatorTypes,
    KfModeEnum,
    KfModeTypes,
    OrderActionFlagEnum,
    OrderInputKeyEnum,
    KfExhibitConfigTypes,
    BasketVolumeTypeEnum,
    PriceLevelEnum,
    BasketOrderStatusEnum,
    SessionStatusEnum,
    CurrencyEnum,
    OrderTriggerTypeEnum,
    OrderTriggerConfigTypeEnum,
    OrderTriggerStatusEnum,
    FundTransEnum,
    FundTransTypeEnum,
    OrderTriggerFlag,
    ETFTypeEnum,
    CashReplaceFlagEnum,
    BasketTypeEnum,
  } from './enums';
  import { Dayjs } from 'dayjs';
  import { Row } from 'fast-csv';

  export type VCDepsVersionTypes =
    | '2008'
    | '2010'
    | '2012'
    | '2013'
    | '2015-2022';

  export type AntInKungfuColorTypes =
    | 'default'
    | 'orange'
    | 'yellow'
    | 'pink'
    | 'red'
    | 'blue'
    | 'gray'
    | 'purple'
    | 'cyan'
    | 'green'
    | 'text'
    | '#FAAD14'
    | 'kf-color-running'
    | 'kf-color-waiting'
    | 'kf-color-error';

  export interface KfTradeValueCommonData {
    name: string;
    color?: AntInKungfuColorTypes;
    level?: number;
  }

  type AnyEnumKeysAsStrings<TEnumType> = keyof TEnumType;

  type FunctionOrData<U extends 'func' | 'data', T> = U extends 'func'
    ? () => T
    : U extends 'data'
    ? T
    : never;

  export type KfConfigItemSupportedTypes =
    | 'str'
    | 'password'
    | 'file' // string
    | 'files' // string[]
    | 'directory' // string
    | 'folder' // string
    | 'table' // any[]
    | 'rangePicker' //string[]
    | 'dateTimePicker' //string
    | 'datePicker' //string
    | 'timePicker' //string
    | 'select'
    | 'multiSelect'
    | 'radio'
    | 'checkbox'
    | 'bool'
    | 'int'
    | 'float'
    | 'percent'
    | 'error'
    | 'side' // select - number
    | 'offset' // select - number
    | 'direction' // select - number
    | 'priceType' // select - number
    | 'priceLevel' // select - number
    | 'hedgeFlag' // select - number
    | 'volumeCondition' // select - number
    | 'timeCondition' // select - number
    | 'commissionMode' // select - number
    | 'instrumentType' // select - number
    | 'td'
    | 'tds'
    | 'md'
    | 'operator'
    | 'md&operator'
    | 'strategy'
    | 'basket'
    | 'instrument'
    | 'instruments'
    | 'instrumentsCsv'
    | 'csvTable'
    | 'basket'
    | 'checkboxGroup';

  export type KfConfigValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | boolean[]
    | any[]
    | Dayjs
    | Record<string, any>;

  export interface KfSelectOption {
    value: string | number;
    label: string | number;
    type?: 'tag' | 'text';
    color?: AntInKungfuColorTypes;
  }

  export interface KfConfigItemHeader {
    title: string;
    description: string;
    type?: 'str' | 'num' | 'percent' | 'bool';
    required?: boolean;
    default?: KfConfigValue;
  }

  export interface KfConfigItemTemplate {
    name: string;
    data: Array<Row>;
  }

  export interface KfConfigItemSearch {
    keys?: Array<string>;
  }

  export interface KfConfigItem {
    key: string;
    name: string;
    type: KfConfigItemSupportedTypes;
    columns?: KfConfigItem[];
    errMsg?: string;
    tip?: string;
    showTipWithIcon?: boolean;
    toolTipPlacement?: 'top' | 'bottom' | 'left' | 'right';
    default?: KfConfigValue;
    required?: boolean;
    max?: number;
    min?: number;
    step?: number;
    precision?: number;
    disabled?: boolean;
    primary?: boolean;
    options?: KfSelectOption[];
    data?: KfSelectOption[];
    headers?: KfConfigItemHeader[];
    extraHeadersTip?: string;
    template?: KfConfigItemTemplate[];
    search?: KfConfigItemSearch;
    importMode?: 'reset' | 'add';
    disableDateRange?: number; // 时间范围选择器不可选的日期范围
    maxlength?: number;
    showArg?: boolean; // 交易任务是否显示参数

    // ---- some ui releated ----;
    noDivider?: boolean;
    wrap?: string;
  }

  export interface KfExhibitConfigItem {
    key: string;
    source_key: string;
    name: string;
    type: KfConfigItemSupportedTypes;
  }

  export interface KfExtOriginConfig {
    key: string;
    name: string;
    extPath: string;
    ui_config?: {
      position: KfUIExtLocatorTypes;
      exhibit?: KfExhibitConfig;
      components?:
        | {
            index: string;
          }
        | {
            entry: string;
            page: string;
          };
      script?: string;
    };
    cli_config?: {
      exhibit?: KfExhibitConfig;
      components?: Record<
        string,
        {
          position: 'index' | 'dzxy';
          entry: string;
        }
      >;
      script?: string;
    };
    config?: {
      td?: {
        type?: TdMdExtTypes[] | TdMdExtTypes;
        order_trigger?: Record<string, Record<string, boolean>>;
        settings: KfConfigItem[];
        fund_trans?: KfExtFundTransConfig | null;
        show_asset_margin?: boolean;
      };
      md?: {
        type?: TdMdExtTypes[] | TdMdExtTypes;
        settings: KfConfigItem[];
      };
      strategy?: {
        type?: StrategyExtTypes[] | StrategyExtTypes;
        settings: KfConfigItem[];
      };
      operator?: {
        type?: StrategyExtTypes[] | StrategyExtTypes;
        settings: KfConfigItem[];
      };
      system?: Record<
        string,
        {
          type?: SystemExtTypes[] | SystemExtTypes;
          for: ExtRunForEnvTypesEnum[] | ExtRunForEnvTypesEnum;
          script: string;
          settings?: KfConfigItem[];
        }
      >;
    };
    language: {
      'zh-CN': Record<string, string>;
      'en-US': Record<string, string>;
      [langName: string]: Record<string, string>;
    };
  }

  interface KfExhibitConfig {
    type: KfExhibitConfigTypes;
    config: KfExhibitConfigItem[];
  }

  export type KfExhibitConfigs = Record<string, KfExhibitConfig>;

  export type KfExtFundTransConfig = Record<
    FundTransTypeEnum,
    { settings: KfConfigItem[] }
  >;

  interface KfExtConfigBase<C extends KfCategoryTypes> {
    name: string;
    category: C;
    key: string;
    extPath: string;
  }
  export interface KfTdExtConfig extends KfExtConfigBase<'td' | 'tdGroup'> {
    type: TdMdExtTypes[];
    orderTrigger: Partial<Record<OrderTriggerConfigTypeEnum, boolean>>;
    settings: KfConfigItem[];
    fundTrans?: KfExtFundTransConfig | null;
    showAssetMargin?: boolean;
  }

  export interface KfMdExtConfig extends KfExtConfigBase<'md'> {
    type: TdMdExtTypes[];
    settings: KfConfigItem[];
  }

  export interface KfStrategyExtConfig extends KfExtConfigBase<'strategy'> {
    type: StrategyExtTypes[];
    settings: KfConfigItem[];
  }

  export interface KfOperatorExtConfig extends KfExtConfigBase<'operator'> {
    type: StrategyExtTypes[];
    settings: KfConfigItem[];
  }

  export interface KfSystemExtConfig extends KfExtConfigBase<'system'> {
    type?: SystemExtTypes[];
    for: ExtRunForEnvTypesEnum[];
    script: string;
    settings?: KfConfigItem[];
  }

  export interface KfCustomExtConfig extends KfExtConfigBase<string> {
    type: string[];
    settings: KfConfigItem[];
  }
  export interface KfSystemExtConfigs {
    [name: string]: KfSystemExtConfig;
  }

  export type KfAddableExtConfig =
    | KfTdExtConfig
    | KfMdExtConfig
    | KfStrategyExtConfig
    | KfOperatorExtConfig;

  export type KfExtConfig =
    | KfTdExtConfig
    | KfMdExtConfig
    | KfStrategyExtConfig
    | KfOperatorExtConfig
    | KfSystemExtConfig
    | KfCustomExtConfig;

  export type KfExtConfigs = {
    td: Record<string, KfTdExtConfig>;
    md: Record<string, KfMdExtConfig>;
    strategy: Record<string, KfStrategyExtConfig>;
    operator: Record<string, KfOperatorExtConfig>;
    system: Record<string, KfSystemExtConfigs>;
  };

  export type KfUIExtConfigs = Record<
    string,
    {
      name: string;
      extPath: string;
      position: KfUIExtLocatorTypes;
      exhibit: KfExhibitConfig;
      components:
        | {
            index: string;
          }
        | {
            entry: string;
            page: string;
          }
        | null;
      script: string;
    }
  >;

  export type KfCliExtConfigs = Record<
    string,
    {
      name: string;
      extPath: string;
      exhibit: KfExhibitConfig;
      components: Record<
        string,
        {
          position: 'index' | 'dzxy';
          entry: string;
        }
      > | null;
      script: string;
    }
  >;

  export type KfExtLanguages = {
    'zh-CN': Record<string, Record<string, string>>;
    'en-US': Record<string, Record<string, string>>;
    [langName: string]: Record<string, Record<string, string>>;
  };

  export interface SetKfConfigPayload {
    type: KungfuApi.ModalChangeType;
    title: string;
    config: KfExtConfig;
    initValue?: Record<string, KfConfigValue>;
  }

  export type ModalChangeType = 'add' | 'update' | 'custom';

  export interface MakeOrderInput {
    instrument_id: string;
    instrument_type: InstrumentTypeEnum;
    exchange_id: string;
    limit_price: number;
    volume: number;
    price_type: PriceTypeEnum;
    side: SideEnum;
    offset: OffsetEnum;
    hedge_flag: HedgeFlagEnum;
    is_swap: boolean;
    parent_id: bigint;
  }
  export type MakeOrderTriggerInput = MakeOrderInput;

  export interface KfLogData {
    id: number;
    message: string;
  }

  export class KfFixedList<T> {
    list: T[];
    limit: number;
    insert(item: T): void;
  }

  export interface ConfigStore {
    getAllConfig(): Record<string, KfConfigOrigin> | false;
    setConfig(
      category: string,
      group: string,
      name: string,
      mode: string,
      configValue: string,
    ): boolean;
    removeConfig(
      category: string,
      group: string,
      name: string,
      mode: string,
    ): boolean;
    getConfig(
      category: string,
      group: string,
      name: string,
      mode: string,
    ): KungfuApi.KfConfig | false;
  }

  export interface HistoryStore {
    selectPeriod(from: string, to: string): TradingData | false;
  }

  export interface CommissionStore {
    getAllCommission(): Commission[] | false;
    setAllCommission(commissions: Commission[]): boolean;
  }

  export interface RiskSettingStore {
    getAllRiskSetting(): Record<string, RiskSettingOrigin> | false;
    setAllRiskSetting(riskSettings: RiskSettingOrigin[]): boolean;
  }

  export interface BasketStore {
    getAllBasket(): Basket[] | false;
    setAllBasket(baskets: Basket[]): boolean;
    setBasket(basket: Basket): boolean;
    setBaskets(baskets: Basket[]): boolean;
  }

  export interface BasketInstrumentStore {
    getAllBasketInstrument(): BasketInstrument[] | false;
    setAllBasketInstruments(basketInstruments: BasketInstrument[]): boolean;
    setBasketInstrument(basketInstrument: BasketInstrument): boolean;
    setBasketInstruments(basketInstruments: BasketInstrument[]): boolean;
    removeAllBasketInstruments(): boolean;
    removeAllBasketInstrumentsByBasket(basketId: number): boolean;
  }

  export interface DataTable<T> {
    [hashed: string]: Readonly<T>;
    filter(key: string, value: string | number | bigint): DataTable<T>;
    nofilter(key: string, value: string | number | bigint): DataTable<T>;
    sort(key: string): Readonly<T>[];
    list(): Readonly<T>[];
  }

  export interface Asset {
    update_time: bigint; //更新时间
    trading_day: string; //交易日

    holder_uid: number;
    ledger_category: LedgerCategoryEnum;

    initial_equity: number; //期初权益
    static_equity: number; //静态权益
    dynamic_equity: number; //动态权益
    realized_pnl: number; //累计收益
    unrealized_pnl: number;
    avail: number; //可用资金
    market_value: number; //市值(股票)
    margin: number; //保证金(期货)
    accumulated_fee: number; //累计手续费
    intraday_fee: number; //当日手续费
    frozen_cash: number; //冻结资金(股票: 买入挂单资金), 期货: 冻结保证金+冻结手续费)
    frozen_margin: number; //冻结保证金(期货)
    frozen_fee: number; //冻结手续费(期货)
    position_pnl: number; //持仓盈亏(期货)
    close_pnl: number; //平仓盈亏(期货)
  }

  export interface AssetMargin {
    update_time: bigint; //更新时间
    trading_day: string; //交易日

    holder_uid: number;
    ledger_category: LedgerCategoryEnum;

    total_asset: number; //总资产
    avail_margin: number; //可用保证金
    cash_margin: number; //融资占用保证金
    short_margin: number; //融券占用保证金
    margin: number; //总占用保证金

    cash_debt: number; //融资负债
    short_cash: number; //融券卖出金额

    short_market_value: number; //融券卖出证券市值
    margin_market_value: number; //融资买入证券市值
    margin_interest: number; //融资融券利息
    settlement: number; //融资融券清算资金

    credit: number; //信贷额度
    collateral_ratio: number; //担保比例
  }

  export interface Instrument {
    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID
    instrument_type: InstrumentTypeEnum; //合约类型

    product_id: number[]; //产品ID commit by JC

    contract_multiplier: number; //合约乘数
    price_tick: number; //最小变动价位
    quantity_unit: number; //最小数量单位

    open_date: string; //上市日
    create_date: string; //创建日
    expire_date: string; //到期日

    delivery_year: number; //交割年份
    delivery_month: number; //交割月
    currency: CurrencyEnum; // 币种

    uid_key: string;
    ukey: string;
  }

  export interface InstrumentFactor {
    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID
    instrument_type: InstrumentTypeEnum; //合约类型

    product_id: number[]; //产品ID commit by JC

    source_id: number;

    is_trading: boolean; //当前是否交易

    long_margin_ratio: number; //多头保证金率
    short_margin_ratio: number; //空头保证金率

    conversion_rate: number; // 担保品折扣率
    exchange_rate: number; // 利率
  }

  export interface Order {
    order_id: bigint; //订单ID
    external_order_id: string; //外部委托ID
    parent_id: bigint; //母单号
    insert_time: bigint; //订单写入时间
    update_time: bigint; //订单更新时间

    trading_day: string; //交易日
    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID

    instrument_type: InstrumentTypeEnum; //合约类型

    limit_price: number; //价格
    frozen_price: number; //冻结价格, 市价单冻结价格为0

    volume: bigint; //数量
    volume_left: bigint; //剩余数量

    tax: number; //税
    commission: number; //手续费

    status: OrderStatusEnum; //订单状态

    error_id: number; //错误ID
    error_msg: string; //错误信息

    is_swap: boolean;

    side: SideEnum; //买卖方向
    offset: OffsetEnum; //开平方向
    hedge_flag: HedgeFlagEnum; //投机套保标识
    price_type: PriceTypeEnum; //价格类型
    volume_condition: VolumeConditionEnum; //成交量类型
    time_condition: TimeConditionEnum; //成交时间类型

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface OrderResolvedWithoutStat extends Order {
    source_resolved_data: KungfuApi.KfTradeValueCommonData;
    dest_resolved_data: KungfuApi.KfTradeValueCommonData;
    source_uname: string;
    dest_uname: string;
    status_uname: string;
    status_color: AntInKungfuColorTypes;
    update_time_resolved: string;
    price_precision?: number;
    limit_price_resolved: string;
  }

  export interface OrderResolved extends OrderResolvedWithoutStat {
    latency_system: string;
    latency_network: string;
    avg_price: number;
    avg_price_resolved: string;
  }

  export interface OrderInput {
    order_id: bigint; //订单ID
    parent_id: bigint; //母单号

    instrument_id: string; //合约代码
    exchange_id: string; //交易所代码
    instrument_type: InstrumentTypeEnum; //合约类型

    limit_price: number; //价格
    frozen_price: number; //冻结价格

    volume: bigint; //数量

    is_swap: boolean;
    side: SideEnum; //买卖方向
    offset: OffsetEnum; //开平方向
    hedge_flag: HedgeFlagEnum; //投机套保标识
    price_type: PriceTypeEnum; //价格类型
    volume_condition: VolumeConditionEnum; //成交量类型
    time_condition: TimeConditionEnum; //成交时间类型
    block_id: bigint; // 大宗交易ID

    insert_time: bigint; //写入时间

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface OrderTrigger {
    trigger_id: bigint; // 触发器id
    order_id: bigint; // 预埋撤单, 被撤单的order_id
    external_trigger_id: string; // 柜台触发器id
    external_order_id: string; //外部委托ID
    action_flag: OrderTriggerFlag; // 预埋下单 or 预埋撤单

    insert_time: bigint; //订单写入时间
    update_time: bigint; //订单更新时间

    trading_day: string; //交易日

    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID
    instrument_type: InstrumentTypeEnum; //合约类型

    limit_price: number; //价格
    frozen_price: number; //冻结价格, 市价单冻结价格为0
    volume: bigint; //数量
    stop_price: number; // 条件触发价格

    status: OrderTriggerStatusEnum; // 触发器状态

    error_id: number; //错误ID
    error_msg: string; //错误信息

    is_swap: boolean; // 互换单
    side: SideEnum; //买卖方向
    offset: OffsetEnum; //开平方向
    hedge_flag: HedgeFlagEnum; //投机套保标识
    price_type: PriceTypeEnum; //价格类型
    volume_condition: VolumeConditionEnum; //成交量类型
    time_condition: TimeConditionEnum; //成交时间类型
    trigger_type: OrderTriggerTypeEnum; // 条件触发类型

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface OrderTriggerResolved extends OrderTrigger {
    update_time_resolved: string;
    insert_time_resolved: string;
    limit_price_resolved: string;
    dest_uname: string;
    source_uname: string;
    status_uname: string;
    source_resolved_data: KungfuApi.KfTradeValueCommonData;
    dest_resolved_data: KungfuApi.KfTradeValueCommonData;
    status_color: AntInKungfuColorTypes;
    price_precision?: number;
    key: number;
    action_flag_uname: string;
    time_condition_resolved: string;
  }

  export interface OrderTriggerInput {
    trigger_id: bigint; // 触发器id

    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID
    instrument_type: InstrumentTypeEnum; //合约类型

    limit_price: number; //价格
    frozen_price: number; //冻结价格, 市价单冻结价格为0
    volume: bigint; //数量
    stop_price: number; // 条件触发价格

    is_swap: boolean; // 互换单
    side: SideEnum; //买卖方向
    offset: OffsetEnum; //开平方向
    hedge_flag: HedgeFlagEnum; //投机套保标识
    price_type: PriceTypeEnum; //价格类型
    volume_condition: VolumeConditionEnum; //成交量类型
    time_condition: TimeConditionEnum; //成交时间类型
    trigger_type: OrderTriggerTypeEnum; // 条件触发类型

    insert_time: bigint;
  }

  export interface TimeKeyValue {
    key: string;
    update_time: bigint;
    tag_a: string;
    tag_b: string;
    tag_c: string;
    value: string;

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface SyntheticData {
    key: string;
    update_time: bigint;
    tag_a: string;
    tag_b: string;
    tag_c: string;
    value: string;

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface TransferRecordResolved {
    amount: number;
    source: string;
    target: string;
    update_time: bigint;
    trans_type: string;
    status: FundTransEnum;
    ret?: number;
    message?: string;
    trans_type_resolved?: string;
  }
  export interface BlockMessage {
    opponent_seat: string; // 对方手席位号
    match_number: bigint; // 成交约定号
    is_specific: boolean; // 是否受限股份
    insert_time: bigint;
    block_id: bigint;
  }

  export interface BasketOrderInput {
    side: SideEnum;
    price_type: PriceTypeEnum;
    price_level: PriceLevelEnum;
    price_offset: number;
    volume: bigint;
  }

  export interface BasketOrder {
    order_id: bigint; //订单ID
    parent_id: bigint; //母单号
    insert_time: bigint; //订单写入时间
    update_time: bigint; //订单更新时间
    side: SideEnum;
    price_type: PriceTypeEnum;
    price_level: PriceLevelEnum;
    price_offset: number; // 价格偏移
    volume: bigint;
    volume_left: bigint;
    status: BasketOrderStatusEnum;

    source_id: number; // 下单方
    dest_id: number;
  }

  export interface BasketOrderResolved extends BasketOrder {
    basket_order_location: KfExtraLocation;
    primary_time_resolved: string;
    source_uname: string;
    source_resolved_data: KfTradeValueCommonData;
    dest_uname: string;
    dest_resolved_data: KfTradeValueCommonData;
    status_uname: string;
    status_color: AntInKungfuColorTypes;
    progress: number;
  }

  export interface OrderStat {
    order_id: bigint;
    md_time: bigint;
    input_time: bigint;
    insert_time: bigint;
    ack_time: bigint;
    trade_time: bigint;
    total_price: number;
    total_volume: number;
    avg_price: number;

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface OrderAction {
    order_id: bigint;
    order_action_id: bigint;
    action_flag: OrderActionFlagEnum;
    insert_time: bigint;
  }

  export interface OrderTriggerAction {
    trigger_id: bigint;
    order_trigger_action_id: bigint;
    action_flag: OrderActionFlagEnum;
    insert_time: number;
  }

  export interface Position {
    update_time: bigint; //更新时间
    trading_day: string; //交易日

    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID

    instrument_type: InstrumentTypeEnum; //合约类型

    holder_uid: number;
    ledger_category: LedgerCategoryEnum;

    direction: DirectionEnum; //持仓方向

    volume: bigint; //数量
    static_yesterday: bigint; // 固定昨仓数量
    open_volume: bigint; // 今开数量
    yesterday_volume: bigint; //昨仓数量
    frozen_total: bigint; //冻结数量
    frozen_yesterday: bigint; //冻结昨仓

    last_price: number; //最新价
    avg_open_price: number; //开仓均价
    position_cost_price: number; //持仓成本价
    close_price: number; //收盘价(股票和债券)
    pre_close_price: number; //昨收价(股票和债券)
    settlement_price: number; //结算价(期货)
    pre_settlement_price: number; //昨结算(期货)
    margin: number; //保证金(期货)
    position_pnl: number; //持仓盈亏(期货)
    close_pnl: number; //平仓盈亏(期货)
    realized_pnl: number; //已实现盈亏
    unrealized_pnl: number; //未实现盈亏

    uid_key: string;
  }

  export interface PositionResolved extends Position {
    currency: CurrencyEnum;
    closable_volume: bigint;
    account_id_resolved: string;
    instrument_id_resolved: string;
    price_precision?: number;
    last_price_resolved: number | string;
    avg_open_price_resolved: number | string;
    unrealized_pnl_resolved: number | string;
    close_volume: number;
  }

  export interface Quote {
    trading_day: string; //交易日

    data_time: bigint; //数据生成时间

    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID

    instrument_type: InstrumentTypeEnum; //合约类型

    pre_close_price: number; //昨收价
    pre_settlement_price: number; //昨结价
    last_price: number; //最新价
    volume: bigint; //数量
    turnover: number; //成交金额
    pre_open_interest: number; //昨持仓量
    open_interest: number; //持仓量
    open_price: number; //今开盘
    high_price: number; //最高价
    low_price: number; //最低价
    upper_limit_price: number; //涨停板价
    lower_limit_price: number; //跌停板价
    close_price: number; //收盘价
    settlement_price: number; //结算价
    iopv: number;

    bid_price: number[]; //申买价
    ask_price: number[]; //申卖价
    bid_volume: bigint[]; //申买量
    ask_volume: bigint[]; //申卖量
    trading_phase_code: string; //标的状态
  }

  export interface Trade {
    trade_id: bigint; //成交ID
    order_id: bigint; //订单ID
    external_order_id: string; //外部委托ID
    external_trade_id: string; //外部委托ID
    trade_time: bigint; //成交时间

    trading_day: string; //交易日

    instrument_id: string; //合约ID
    exchange_id: string; //交易所ID

    instrument_type: InstrumentTypeEnum; //合约类型

    side: SideEnum; //买卖方向
    offset: OffsetEnum; //开平方向
    hedge_flag: HedgeFlagEnum; //投机套保标识

    price: number; //成交价格
    volume: bigint; //成交量
    close_today_volume: bigint; //平今日仓量(期货)

    tax: number; //税
    commission: number; //手续费

    source: number;
    dest: number;
    uid_key: string;
  }

  export interface TradeResolved extends Trade {
    source_resolved_data: KungfuApi.KfTradeValueCommonData;
    dest_resolved_data: KungfuApi.KfTradeValueCommonData;
    source_uname: string;
    dest_uname: string;
    trade_time_resolved: string;
    kf_time_resovlved: string;
    latency_trade: string;
    price_precision?: number;
    price_resolved: number | string;
  }

  export interface TradingData {
    Asset: DataTable<Asset>;
    AssetMargin: DataTable<AssetMargin>;
    Instrument: DataTable<Instrument>;
    InstrumentFactor: DataTable<InstrumentFactor>;
    Order: DataTable<Order>;
    OrderInput: DataTable<OrderInput>;
    OrderStat: DataTable<OrderStat>;
    Position: DataTable<Position>;
    Quote: DataTable<Quote>;
    Trade: DataTable<Trade>;
    Basket: DataTable<Basket>;
    BasketInstrument: DataTable<BasketInstrument>;
    BasketOrder: DataTable<BasketOrder>;
    OrderTrigger: DataTable<OrderTrigger>;
    SyntheticData: DataTable<SyntheticData>;
  }

  export type TradingDataItem =
    | KungfuApi.Position
    | KungfuApi.Order
    | KungfuApi.Trade
    | KungfuApi.Asset
    | KungfuApi.Basket
    | KungfuApi.AssetMargin;

  export type TradingDataTable =
    | KungfuApi.DataTable<KungfuApi.Position>
    | KungfuApi.DataTable<KungfuApi.Order>
    | KungfuApi.DataTable<KungfuApi.Trade>;

  export type MergedTradingDataTable = KungfuApi.DataTable<KungfuApi.Position> &
    KungfuApi.DataTable<KungfuApi.Order> &
    KungfuApi.DataTable<KungfuApi.Trade>;

  export type OrderTradingData =
    | KungfuApi.Order
    | KungfuApi.OrderInput
    | KungfuApi.Trade;

  export type LedgerTradingData =
    | KungfuApi.Asset
    | KungfuApi.AssetMargin
    | KungfuApi.Position;

  export type TradingDataTypes =
    | Asset
    | AssetMargin
    | Instrument
    | Order
    | OrderInput
    | OrderStat
    | Position
    | Quote
    | Trade
    | OrderTrigger
    | Basket
    | BasketInstrument;

  export type TradingDataTypeName = keyof TradingData;

  export interface Commission {
    product_id: string;
    exchange_id: string;
    instrument_type: InstrumentTypeEnum;
    mode: CommissionModeEnum;
    open_ratio: number;
    close_ratio: number;
    close_today_ratio: number;
    min_commission: number;
  }

  export interface Basket {
    id: number; // basket id
    name: string; // basket 名字
    volume_type: BasketVolumeTypeEnum; // 比例/数量
    total_amount: bigint; // 总数量
    basket_type: BasketTypeEnum; // 类型: Custom 或 ETF
    instrument_id: string; // ETF基金代码
    exchange_id: string; // ETF基金的市场
    net_unit_value: number; // 最小申赎单位净值
    etf_value: number; // 基金份额净值
    cash_difference: number; // 现金差额
    max_cash_ratio: number; // 现金替代比例上限
    max_purchase_volume: bigint; // 申购上限
    max_redemption_volume: bigint; // 赎回上限
    min_volume: bigint; // 最小申赎单位
    etf_type: ETFTypeEnum; // etf种类
    etf_status: ETFStatus; // etf状态
  }

  export interface BasketResolved extends Basket {
    basket_location: KfExtraLocation;
    location_id: string;
    volume_type_resolved: string;
  }

  export interface BasketInstrument {
    basket_uid: number;
    instrument_id: string;
    exchange_id: string;
    instrument_type: InstrumentTypeEnum;
    direction: DirectionEnum;
    volume: bigint; // 数量
    rate: number; // 比例
    replace_flag: CashReplaceFlagEnum; // 是否可以由现金替代
    cash_premium_ratio: number; // 现金替代溢价比率
    replace_balance: number; // 替代金额
  }

  export interface BasketInstrumentResolved
    extends BasketInstrument,
      InstrumentResolved {
    basketInstrumentName: string;
    basketInstrumentId: string;
    todayVolume?: string;
    yesterdayVolume?: string;
    posVolume?: string;
    lastPrice?: number;
  }

  export interface BasketInstrumentForOrder extends BasketInstrumentResolved {
    isNoQuote: boolean;
    sideResolved: SideEnum;
    offsetResolved: OffsetEnum;
    volumeResolved: number; // 最终下单量
    priceResolved: number; // 最终下单价
    strategyLocation?: KfLocation;
  }

  export interface RiskSetting {
    max_order_volume: number;
    max_daily_volume: number;
    white_list: string[];
    self_filled_check: boolean;
    max_cancel_ratio: number;
    account_id: string;
  }

  export interface RiskSettingOrigin extends KfLocationOrigin {
    value: string;
  }

  export interface RiskSettingForSave extends KfLocationOrigin {
    category: KfCategoryTypes;
    mode: KfModeTypes;
  }

  export interface StrategyStateDataOrigin {
    info_a: string;
    info_b: string;
    info_c: string; // 待定字段
    state: StrategyStateStatusEnum;
    update_time: number;
    value: string;
  }

  export interface StrategyStateData extends StrategyStateDataOrigin {
    state: StrategyStateStatusTypes;
  }

  export interface Watcher {
    appStates: Record<string, BrokerStateStatusEnum>;
    strategyStates: Record<string, StrategyStateDataOrigin>;
    ledger: TradingData;
    state: TradingData;

    isLive(): boolean;
    isStarted(): boolean;
    isUsable(): boolean;
    start(): void;
    sync(): void;
    isReadyToInteract(kfLocation: KfLocation | KfConfig): boolean;
    requestStop(kfLocation: KfLocation | KfConfig): void;
    getLocationUID(kfLocation: KfLocation | KfConfig): number;
    getLocation(hashedKey: string | number): KfLocation;
    hasLocation(hashedKey: string | number): KfLocation;
    getInstrumentType(
      exchangeId: string,
      instrumentId: string,
    ): InstrumentTypeEnum;
    requestMarketData(
      kfLocation: KfLocation,
      exchangeId: string,
      instrumentId: string,
    ): boolean;
    requestPosition(): boolean;
    cancelOrder(
      orderAction: OrderAction,
      tdLocation: KfLocation,
      strategyLocation?: KfLocation,
    ): bigint;
    cancelOrderTrigger(
      orderAction: OrderTriggerAction,
      tdLocation: KfLocation,
      strategyLocation?: KfLocation,
    ): bigint;
    issueOrder(
      orderInput: OrderInput,
      tdLocation: KfLocation,
      strategyLocation?: KfLocation,
    ): bigint;
    issueOrderTrigger(
      orderInput: OrderTriggerInput,
      tdLocation: KfLocation,
    ): bigint;
    issueMark(msgType: number, tdLocation: KfLocation): boolean;
    issueBlockMessage(
      blockMessage: BlockMessage,
      tdLocation: KfLocation,
    ): bigint;
    issueCustomData(message: TimeKeyValue, targetLocation: KfLocation): boolean;
    issueBasketOrder(basketOrder: BasketOrder, tdLocation: KfLocation): bigint;
    quit(): void;
    now(): bigint;
  }

  export interface Session {
    index: number;
    location_uid: number;
    category: KfCategoryEnum;
    group: string;
    name: string;
    mode: KfModeEnum;
    value: string;
    begin_time: bigint;
    end_time: bigint;
    update_time: bigint;
    data_size: bigint;
    frame_count: number;
  }

  export interface SessionResolved extends Session {
    sessionName: string;
    beginTimeResolved: string;
    endTimeResolved: string;
    status: SessionStatusEnum;
  }

  export interface FrameBuilder {
    msgType: () => number;
    dest: () => number;
    source: () => number;
    dataLength: () => number;
    genTime: () => bigint;
    triggerTime: () => bigint;
    dataAsString: () => string;
    data: () => unknown;
  }

  export interface Frame {
    dataLength: number;
    genTime: bigint;
    triggerTime: bigint;
    dataAsString: string;
    msgType: number;
    source: number;
    dest: number;
    data: unknown;
    frameId: number;
    pageId: number;
  }

  export interface FrameResolved extends Frame {
    id: string;
    msgTypeName: string;
    sourceToDest: string;
    genTimeResolved: string;
    triggerTimeResolved: string;
    msgTypeResolved: KfTradeValueCommonData;
    index?: number;
  }

  export interface Tracer {
    currentFrame(): FrameBuilder;
    currentFrameId(): number;
    currentPageId(): number;
    dataAvailable(): boolean;
    next(): void;
    seekToTime(nanotime: bigint): void;
    now(): bigint;
  }

  export interface Longfist {
    types: {
      Asset(): Asset;
      AssetMargin(): AssetMargin;
      Instrument(): Instrument;
      Order(): Order;
      OrderInput(): OrderInput;
      OrderAction(): OrderAction;
      OrderTrigger(): OrderTrigger;
      OrderTriggerInput(): OrderTriggerInput;
      OrderTriggerAction(): OrderTriggerAction;
      OrderStat(): OrderStat;
      Position(): Position;
      Quote(): Quote;
      Trade(): Trade;
      Commission(): Commission;
      RiskSetting(): RiskSettingOrigin;
      Basket(): Basket;
      BasketInstrument(): BasketInstrument;
      BasketOrder(): BasketOrder;
      TimeKeyValue(): TimeKeyValue;
      SyntheticData(): SyntheticData;
    };

    msgTypes: Record<number, string>;
  }

  export interface IODevice {
    getAllLocations(): Record<
      string,
      KfLocation & { uname: string; uid: number }
    >;
  }

  export interface SessionStore {
    getAllSessions(): Session[];
    getSessionsForLocation(kfLocation: KfLocation): Session[];
  }

  export interface Kungfu {
    shutdown(): void;
    ConfigStore(kfHome: string): ConfigStore;
    RiskSettingStore(kfHome: string): RiskSettingStore;
    CommissionStore(kfHome: string): CommissionStore;
    BasketStore(kfHome: string): BasketStore;
    BasketInstrumentStore(kfHome: string): BasketInstrumentStore;
    SessionStore(location: KfLocation, kfHome: string): SessionStore;
    History(kfHome: string): HistoryStore;
    IODevice(location: KfLocation, kfHome: string): IODevice;
    Longfist(): Longfist;
    tracer(
      location: KfLocation,
      kfHome: string,
      home: boolean,
      write: boolean,
      startTime: bigint,
      endTime: bigint,
    ): Tracer;
    watcher(
      kfHome: string,
      hashedId: string,
      bypassRestore = false,
      bypassAccounting = false,
      bypassTradingData = false,
      refreshTradingDataBeforeSync = false,
      bypassRefreshBook = false,
      millisecondsSleepAfterStep = 200,
    ): Watcher | null;
    formatStringToHashHex(id: string): string;
    formatTime(nano: bigint, format: string): string;
    hash(str: string | number): string;
  }

  export interface InstrumentResolved {
    instrumentId: string;
    instrumentType: InstrumentTypeEnum;
    instrumentName: string;
    exchangeId: string;
    id: string;
    ukey: string;
  }

  export interface InstrumentForSub extends InstrumentResolved {
    uidKey: string;
  }

  export interface InstrumentForAccounting extends InstrumentResolved {
    price: number;
    volume: number;
    direction: DirectionEnum;
    accountUID: number;
  }

  export interface KfLocationBase {
    group: string;
    name: string;
  }

  export interface KfLocationGroup extends KfLocation {
    children?: KfLocation[];
  }

  export interface KfLocation extends KfLocationBase {
    category: KfCategoryTypes;
    mode: KfModeTypes;
  }

  export interface KfLocationOrigin extends KfLocationBase {
    category: KfCategoryEnum;
    mode: KfModeEnum;
  }

  export interface KfConfigOrigin extends KfLocationOrigin {
    location_uid: number;
    value: string;
  }

  export interface KfConfig extends KfLocation {
    location_uid: number;
    value: string;
  }

  export interface KfExtraLocation extends KfLocation {
    category: string;
    group: string;
    name: string;
    [prop: string]: any;
  }

  export interface KfExtServiceLocation extends KfExtraLocation {
    category: 'system';
    group: 'service';
    cwd: string;
    script: string;
  }

  export type DerivedKfLocation =
    | KfLocation
    | KfExtraLocation
    | KfConfig
    | KfExtServiceLocation;

  export type ScheduleTaskMode = 'restart' | 'start' | 'stop';

  export interface ScheduleTask {
    hour: string;
    minute: string;
    second: string;
    mode: ScheduleTaskMode;
    processId: string;
  }

  export interface TradeLimitItem {
    instrument: string;
    orderInputKey: OrderInputKeyEnum;
    limitValue: number;
  }

  export interface BoardStyle {
    flex: string;
    height?: string;
  }
}

declare module '@kungfu-trader/kungfu-core' {
  export function kungfu(): KungfuApi.Kungfu;
}

declare namespace Code {
  import { Stats } from 'fs-extra';
  import { SpaceTabSettingEnum, SpaceSizeSettingEnum } from './enums';

  export interface CodeInfo {
    code_id: string;
    file_path: string;
  }

  export interface FileProps {
    root?: boolean;
    filePath?: string;
    ext?: string;
    isDir?: boolean;
  }

  export interface FileIds {
    file: Array<number | 'pending'>;
    folder: Array<number | 'pending'>;
  }
  export interface FileTreeByPath {
    ids: FileIds;
    fileTree: IFileTree;
  }
  export interface FileData {
    id: number;
    parentId: number | '';
    isDir: boolean;
    name: string;
    ext: string;
    filePath: string;
    children: FileIds;
    stats: Stats;
    root: boolean;
    open: boolean;
    fileId?: number;
    isEntryFile?: boolean;
  }

  export type IFileTree = Record<string, FileData>;

  export interface IFileNode {
    filePath: string;
    root?: string;
    children?: IFileNode;
    name: string;
  }

  export interface ICodeSetting {
    tabSpaceType: SpaceTabSettingEnum;
    tabSpaceSize: SpaceSizeSettingEnum;
  }
}

declare namespace KfEvent {
  export interface ResizeEvent {
    tag: 'resize';
  }

  export interface ProcessStatusChangeEvent {
    tag: 'processStatus';
    name: string;
    status: Pm2ProcessStatusTypes;
  }

  export interface MainProcessEvent {
    tag: 'main';
    name: string;
    payload?: object;
  }

  export interface TradingDataUpdateEvent {
    tag: 'tradingDataUpdate';
    tradingDataType: TradingDataTypeName;
  }

  export interface ExportTradingDataEvent {
    tag: 'export';
    tradingDataType: TradingDataTypeName | 'all';
    currentKfLocation?: KfLocation | KfConfig | undefined;
  }

  export interface TriggeOrderBook {
    tag: 'orderbook';
    instrument: InstrumentResolved;
  }

  export interface TriggerOrderBookUpdate {
    tag: 'orderBookUpdate';
    orderInput: InstrumentResolved | ExtraOrderInput;
  }

  export interface TriggerMakeOrder {
    tag: 'makeOrder';
    orderInput: InstrumentResolved | ExtraOrderInput;
  }

  export interface TriggerUpdateTdGroup {
    tag: 'update:tdGroup';
    tdGroups: KungfuApi.KfExtraLocation[];
  }

  export interface TriggerUpdateTd {
    tag: 'update:td';
    tds: KungfuApi.KfConfig[];
  }

  export interface TriggerUpdateRiskSetting {
    tag: 'update:riskSetting';
    riskSettings: RiskSetting[];
  }

  export interface TriggerUpdateMd {
    tag: 'update:md';
    mds: KungfuApi.KfConfig[];
  }

  export interface TriggerUpdateStrategy {
    tag: 'update:strategy';
    strategys: KungfuApi.KfConfig[];
  }

  export interface TriggerUpdateOperator {
    tag: 'update:operator';
    strategys: KungfuApi.KfConfig[];
  }

  export interface TriggerUpdateExtConfigs {
    tag: 'update:extConfigs';
    extConfigs: KungfuApi.KfExtConfigs;
  }

  export interface TriggerAddBoard {
    tag: 'addBoard';
    boardId: number;
  }

  export interface TriggerCurrentConfigModalReady {
    tag: 'ready:currentConfigModal';
    category: string;
    extKey: string;
    initValue: Record<string, KungfuApi.KfConfigValue>;
  }

  export interface TriggerCurrentConfigModalInput {
    tag: 'input:currentConfigModal';
    category: string;
    extKey: string;
    formState: KungfuApi.SetKfConfigPayload;
  }

  export interface TriggerOpenGlobalSettingModal {
    tag: 'open:globalSetting';
  }

  export interface TriggerCloseGlobalSettingModal {
    tag: 'close:globalSetting';
  }

  export interface TriggerSetCurrentConfigModalConfigSettings {
    tag: 'update:currentConfigModalConfigSettings';
    configSettings: KungfuApi.KfConfigItem[];
  }

  export type KfBusEvent =
    | ResizeEvent
    | ProcessStatusChangeEvent
    | MainProcessEvent
    | TradingDataUpdateEvent
    | TriggeOrderBook
    | TriggerOrderBookUpdate
    | TriggerMakeOrder
    | TriggerUpdateTdGroup
    | TriggerUpdateTd
    | TriggerUpdateRiskSetting
    | TriggerUpdateMd
    | TriggerUpdateStrategy
    | TriggerUpdateOperator
    | TriggerUpdateExtConfigs
    | TriggerAddBoard
    | ExportTradingDataEvent
    | TriggerConfigModalFormChanged
    | TriggerCurrentConfigModalReady
    | TriggerCurrentConfigModalInput
    | TriggerOpenGlobalSettingModal
    | TriggerCloseGlobalSettingModal
    | TriggerSetCurrentConfigModalConfigSettings;
}
