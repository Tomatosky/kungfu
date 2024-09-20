import {
  InstrumentTypeEnum,
  InstrumentTypes,
  ProcessStatusTypes,
  HedgeFlagEnum,
  PriceTypeEnum,
  VolumeConditionEnum,
  TimeConditionEnum,
  CommissionModeEnum,
  OffsetEnum,
  SideEnum,
  DirectionEnum,
  KfCategoryEnum,
  OrderStatusEnum,
  BrokerStateStatusTypes,
  StrategyStateStatusTypes,
  FutureArbitrageCodeEnum,
  SpaceTabSettingEnum,
  SpaceSizeSettingEnum,
  StrategyExtTypes,
  UnderweightEnum,
  OrderInputKeyEnum,
  AddOperatorTypeEnum,
  PriceLevelEnum,
  BasketVolumeTypeEnum,
  CurrencyEnum,
  OrderTriggerStatusEnum,
  FundTransEnum,
  OrderTriggerFlag,
} from '../typings/enums';
import {
  DEFAULT_PRECISION,
  CRYPTO_PRECISION,
} from '@kungfu-trader/kungfu-js-api/utils/commonUtils';

import { Pm2ProcessStatusTypes } from '../typings/common';

import { useLanguage } from '@kungfu-trader/kungfu-js-api/language';
const { t } = useLanguage();

export const Pm2ProcessStatus: Record<
  Pm2ProcessStatusTypes,
  KungfuApi.KfTradeValueCommonData
> = {
  ['online']: {
    name: t('tradingConfig.running'),
    color: 'kf-color-running',
    level: 2,
  },
  ['stopping']: {
    name: t('tradingConfig.stopping'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['stopped']: {
    name: t('tradingConfig.stopped'),
    color: 'kf-color-waiting',
    level: 0,
  },
  ['launching']: {
    name: t('tradingConfig.launching'),
    color: 'kf-color-waiting',
    level: 2,
  },
  ['errored']: {
    name: t('tradingConfig.error'),
    color: 'kf-color-error',
    level: -1,
  },
  ['waiting restart']: {
    name: t('tradingConfig.waiting_restart'),
    color: 'kf-color-waiting',
    level: 0,
  },
  ['one-launch-status']: {
    name: t('tradingConfig.launching'),
    color: 'kf-color-waiting',
    level: 2,
  },
};

export const StrategyStateStatus: Record<
  StrategyStateStatusTypes,
  KungfuApi.KfTradeValueCommonData
> = {
  ['Normal']: {
    name: t('正常'),
    color: 'kf-color-running',
    level: 2,
  },
  ['Warn']: {
    name: t('异常'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['Error']: {
    name: t('错误'),
    color: 'kf-color-error',
    level: -1,
  },
};

export const BrokerStateStatus: Record<
  BrokerStateStatusTypes,
  KungfuApi.KfTradeValueCommonData
> = {
  ['Pending']: {
    name: t('tradingConfig.pending'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['Idle']: {
    name: t('tradingConfig.Idle'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['DisConnected']: {
    name: t('tradingConfig.dis_connected'),
    color: 'kf-color-error',
    level: -1,
  },
  ['Connected']: {
    name: t('tradingConfig.connected'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['LoggedIn']: {
    name: t('tradingConfig.logged_in'),
    color: 'kf-color-waiting',
    level: 1,
  },
  ['LoginFailed']: {
    name: t('tradingConfig.login_failed'),
    color: 'kf-color-error',
    level: -1,
  },
  ['Ready']: {
    name: t('tradingConfig.ready'),
    color: 'kf-color-running',
    level: 2,
  },
};

export const AppStateStatus: Record<
  ProcessStatusTypes,
  KungfuApi.KfTradeValueCommonData
> = {
  ...StrategyStateStatus,
  ...Pm2ProcessStatus,
  ...BrokerStateStatus,
};

export const KfCategory: Record<
  KfCategoryEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [KfCategoryEnum.system]: {
    name: t('tradingConfig.system'),
    color: 'red',
    level: 100,
  },
  [KfCategoryEnum.md]: {
    name: t('tradingConfig.md'),
    color: 'orange',
    level: 80,
  },
  [KfCategoryEnum.td]: {
    name: t('tradingConfig.td'),
    color: 'blue',
    level: 70,
  },
  [KfCategoryEnum.strategy]: {
    name: t('tradingConfig.strategy'),
    color: 'cyan',
    level: 60,
  },
  [KfCategoryEnum.operator]: {
    name: t('tradingConfig.operator'),
    color: 'pink',
    level: 80,
  },
};

export const UnknownKfCategory: KungfuApi.KfTradeValueCommonData = {
  name: t('tradingConfig.unknown'),
  color: 'default',
  level: 0,
};

export const Offset: Record<OffsetEnum, KungfuApi.KfTradeValueCommonData> = {
  [OffsetEnum.Open]: { name: t('tradingConfig.open'), color: 'red' },
  [OffsetEnum.Close]: { name: t('tradingConfig.close'), color: 'green' },
  [OffsetEnum.CloseToday]: {
    name: t('tradingConfig.close_today'),
    color: 'green',
  },
  [OffsetEnum.CloseYest]: {
    name: t('tradingConfig.close_yesterday'),
    color: 'green',
  },
  [OffsetEnum.Unknown]: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
};

export const MarginSideConfig: Record<
  string,
  KungfuApi.KfTradeValueCommonData
> = {
  [SideEnum.GuaranteeStockBuy]: {
    name: t('tradingConfig.guarantee_stock_buy'),
    color: 'red',
    level: SideEnum.GuaranteeStockBuy,
  },
  [SideEnum.GuaranteeStockSell]: {
    name: t('tradingConfig.guarantee_stock_sell'),
    color: 'green',
    level: SideEnum.GuaranteeStockSell,
  },
  [SideEnum.MarginTrade]: {
    name: t('tradingConfig.margin_trade'),
    color: 'red',
    level: SideEnum.MarginTrade,
  },
  [SideEnum.ShortSell]: {
    name: t('tradingConfig.short_sell'),
    color: 'green',
    level: SideEnum.ShortSell,
  },
  [SideEnum.RepayStock]: {
    name: t('tradingConfig.repay_short'),
    color: 'red',
    level: SideEnum.RepayStock,
  },
  [SideEnum.RepayMargin]: {
    name: t('tradingConfig.repay_margin'),
    color: 'green',
    level: SideEnum.RepayMargin,
  },
};

export const CodeTabSetting: Record<
  SpaceTabSettingEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [SpaceTabSettingEnum.SPACES]: { name: 'Spaces' },
  [SpaceTabSettingEnum.TABS]: { name: 'Tabs' },
};

export const CodeSizeSetting: Record<
  SpaceSizeSettingEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [SpaceSizeSettingEnum.FOURINDENT]: { name: '4' },
  [SpaceSizeSettingEnum.TWOINDENT]: { name: '2' },
};

export const OrderInputKeySetting: Record<
  OrderInputKeyEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [OrderInputKeyEnum.VOLUME]: { name: t('tradingConfig.volume') },
  [OrderInputKeyEnum.PRICE]: { name: t('globalSettingConfig.single_price') },
};

export const Side: Record<SideEnum, KungfuApi.KfTradeValueCommonData> = {
  [SideEnum.Buy]: { name: t('tradingConfig.buy'), color: 'red' },
  [SideEnum.Sell]: { name: t('tradingConfig.sell'), color: 'green' },
  [SideEnum.Lock]: { name: t('tradingConfig.lock'), color: 'orange' },
  [SideEnum.Unlock]: { name: t('tradingConfig.unlock'), color: 'blue' },
  [SideEnum.Exec]: { name: t('tradingConfig.exec'), color: 'blue' },
  [SideEnum.Drop]: { name: t('tradingConfig.drop'), color: 'green' },
  [SideEnum.Purchase]: {
    name: t('tradingConfig.purchase'),
    color: 'red',
  },
  [SideEnum.Redemption]: {
    name: t('tradingConfig.redemption'),
    color: 'green',
  },
  [SideEnum.Split]: { name: t('tradingConfig.split'), color: 'red' },
  [SideEnum.Merge]: { name: t('tradingConfig.merge'), color: 'green' },
  [SideEnum.MarginTrade]: {
    name: t('tradingConfig.margin_trade'),
    color: 'red',
  },
  [SideEnum.ShortSell]: {
    name: t('tradingConfig.short_sell'),
    color: 'green',
  },
  [SideEnum.RepayMargin]: {
    name: t('tradingConfig.repay_margin'),
    color: 'green',
  },
  [SideEnum.RepayStock]: {
    name: t('tradingConfig.repay_short'),
    color: 'red',
  },
  [SideEnum.CashRepayMargin]: {
    name: t('tradingConfig.cash_repay_margin'),
    color: 'orange',
  },
  [SideEnum.StockRepayStock]: {
    name: t('tradingConfig.stock_repay_short'),
    color: 'blue',
  },
  [SideEnum.SurplusStockTransfer]: {
    name: t('tradingConfig.surplus_stock_transfer'),
    color: 'blue',
  },
  [SideEnum.GuaranteeStockTransferIn]: {
    name: t('tradingConfig.guarantee_stock_transfer'),
    color: 'red',
  },
  [SideEnum.GuaranteeStockTransferOut]: {
    name: t('tradingConfig.guarantee_stock_redeem'),
    color: 'green',
  },

  [SideEnum.GuaranteeStockBuy]: {
    name: t('tradingConfig.guarantee_stock_buy'),
    color: 'red',
  },
  [SideEnum.GuaranteeStockSell]: {
    name: t('tradingConfig.guarantee_stock_sell'),
    color: 'green',
  },
  [SideEnum.Unknown]: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
};

export const OrderStatus: Record<
  OrderStatusEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [OrderStatusEnum.Unknown]: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
  [OrderStatusEnum.Submitted]: {
    name: t('tradingConfig.submitted'),
    color: 'default',
  },
  [OrderStatusEnum.Pending]: {
    name: t('tradingConfig.pending'),
    color: 'default',
  },
  [OrderStatusEnum.Cancelling]: {
    name: t('tradingConfig.cancelling'),
    color: 'default',
  },
  [OrderStatusEnum.Cancelled]: {
    name: t('tradingConfig.cancelled'),
    color: 'default',
  },
  [OrderStatusEnum.Error]: {
    name: t('tradingConfig.error'),
    color: 'red',
  },
  [OrderStatusEnum.Filled]: {
    name: t('tradingConfig.filled'),
    color: 'green',
  },
  [OrderStatusEnum.PartialFilledNotActive]: {
    name: t('tradingConfig.partial_filled_not_active'),
    color: 'green',
  },
  [OrderStatusEnum.PartialFilledActive]: {
    name: t('tradingConfig.partial_filled_active'),
    color: 'default',
  },
  [OrderStatusEnum.Lost]: {
    name: t('tradingConfig.lost'),
    color: 'default',
  },
  [OrderStatusEnum.Pause]: {
    name: t('tradingConfig.pause'),
    color: 'default',
  },
  [OrderStatusEnum.PendingSettlement]: {
    name: t('tradingConfig.pending_settlement'),
    color: 'default',
  },
};

export const MarginSideStatus = [
  SideEnum.GuaranteeStockBuy,
  SideEnum.GuaranteeStockSell,
  SideEnum.MarginTrade,
  SideEnum.ShortSell,
  SideEnum.RepayStock,
  SideEnum.RepayMargin,
];

export const UnfinishedOrderStatus = [
  OrderStatusEnum.Submitted,
  OrderStatusEnum.Pending,
  OrderStatusEnum.Submitted,
  OrderStatusEnum.PartialFilledActive,
  OrderStatusEnum.Cancelling,
  OrderStatusEnum.PendingSettlement,
];

export const NotTradeAllOrderStatus = [
  OrderStatusEnum.Cancelled,
  OrderStatusEnum.Error,
  OrderStatusEnum.PartialFilledNotActive,
  OrderStatusEnum.Lost,
];

export const WellFinishedOrderStatus = [
  OrderStatusEnum.Cancelled,
  OrderStatusEnum.Filled,
  OrderStatusEnum.PartialFilledNotActive,
];

export const WellCancelledOrderStatus = [
  OrderStatusEnum.Cancelled,
  OrderStatusEnum.PartialFilledNotActive,
];

export const AllFinishedOrderStatus = [
  ...WellFinishedOrderStatus,
  OrderStatusEnum.Error,
  OrderStatusEnum.Lost,
];

export const OrderCancelledStatus = [
  OrderStatusEnum.Cancelled,
  OrderStatusEnum.PartialFilledNotActive,
];

export const Direction: Record<
  DirectionEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [DirectionEnum.Long]: { name: t('tradingConfig.long'), color: 'red' },
  [DirectionEnum.Short]: { name: t('tradingConfig.short'), color: 'green' },
};

export const PriceType: Record<
  PriceTypeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [PriceTypeEnum.Limit]: { name: t('tradingConfig.Limit') },
  [PriceTypeEnum.Market]: { name: t('tradingConfig.Market') },
  [PriceTypeEnum.FakBest5]: {
    name: t('tradingConfig.FakBest5'),
  },
  [PriceTypeEnum.ForwardBest]: {
    name: t('tradingConfig.Forward_best'),
  },
  [PriceTypeEnum.ReverseBest]: {
    name: t('tradingConfig.Reverse_best'),
  },
  [PriceTypeEnum.Fak]: {
    name: t('tradingConfig.Fak'),
  },
  [PriceTypeEnum.Fok]: {
    name: t('tradingConfig.Fok'),
  },
  [PriceTypeEnum.EnhancedLimit]: {
    name: t('tradingConfig.EnhancedLimit'),
  },
  [PriceTypeEnum.AtAuctionLimit]: {
    name: t('tradingConfig.AtAuctionLimit'),
  },
  [PriceTypeEnum.AtAuction]: {
    name: t('tradingConfig.AtAuction'),
  },
  [PriceTypeEnum.Unknown]: { name: t('tradingConfig.unknown') },
};

export const PriceLevel: Record<
  PriceLevelEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [PriceLevelEnum.Latest]: { name: t('tradingConfig.latest') },
  [PriceLevelEnum.Opposing5]: { name: t('tradingConfig.Opposing5') },
  [PriceLevelEnum.Opposing4]: { name: t('tradingConfig.Opposing4') },
  [PriceLevelEnum.Opposing3]: { name: t('tradingConfig.Opposing3') },
  [PriceLevelEnum.Opposing2]: { name: t('tradingConfig.Opposing2') },
  [PriceLevelEnum.Opposing1]: { name: t('tradingConfig.Opposing1') },
  [PriceLevelEnum.Own1]: { name: t('tradingConfig.Own1') },
  [PriceLevelEnum.Own2]: { name: t('tradingConfig.Own2') },
  [PriceLevelEnum.Own3]: { name: t('tradingConfig.Own3') },
  [PriceLevelEnum.Own4]: { name: t('tradingConfig.Own4') },
  [PriceLevelEnum.Own5]: { name: t('tradingConfig.Own5') },
  [PriceLevelEnum.UpperLimitPrice]: { name: t('tradingConfig.up_limit_price') },
  [PriceLevelEnum.LowerLimitPrice]: {
    name: t('tradingConfig.low_limit_price'),
  },
  [PriceLevelEnum.Unknown]: { name: t('tradingConfig.unknown') },
};

export const HedgeFlag: Record<
  HedgeFlagEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [HedgeFlagEnum.Speculation]: { name: t('tradingConfig.speculation') },
  [HedgeFlagEnum.Arbitrage]: { name: t('tradingConfig.arbitrage') },
  [HedgeFlagEnum.Hedge]: { name: t('tradingConfig.hedge') },
  [HedgeFlagEnum.Covered]: { name: t('tradingConfig.covered') },
};

export const VolumeCondition: Record<
  VolumeConditionEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [VolumeConditionEnum.Any]: { name: t('tradingConfig.any') },
  [VolumeConditionEnum.Min]: { name: t('tradingConfig.min') },
  [VolumeConditionEnum.All]: { name: t('tradingConfig.all') },
};

export const TimeCondition: Record<
  TimeConditionEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [TimeConditionEnum.IOC]: { name: t('tradingConfig.IOC') },
  [TimeConditionEnum.GFD]: { name: t('tradingConfig.GFD') },
  [TimeConditionEnum.GTC]: { name: t('tradingConfig.GTC') },
  [TimeConditionEnum.GFS]: { name: t('tradingConfig.GFS') },
  [TimeConditionEnum.GTD]: { name: t('tradingConfig.GTD') },
  [TimeConditionEnum.GFA]: { name: t('tradingConfig.GFA') },
  [TimeConditionEnum.Unknown]: { name: t('tradingConfig.unknown') },
};

export const OrderTriggerStatus: Record<
  OrderTriggerStatusEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [OrderTriggerStatusEnum.Unknown]: { name: '' },
  [OrderTriggerStatusEnum.Pending]: {
    name: t('tradingConfig.order_trigger_status_pending'),
    color: 'default',
  },
  [OrderTriggerStatusEnum.Submitted]: {
    name: t('tradingConfig.order_trigger_status_submitted'),
    color: 'default',
  },
  [OrderTriggerStatusEnum.Filled]: {
    name: t('tradingConfig.order_trigger_status_filled'),
    color: 'green',
  },
  [OrderTriggerStatusEnum.Cancelled]: {
    name: t('tradingConfig.order_trigger_status_cancelled'),
    color: 'red',
  },
  [OrderTriggerStatusEnum.Error]: {
    name: t('tradingConfig.order_trigger_status_error'),
    color: 'red',
  },
  [OrderTriggerStatusEnum.Cancelling]: {
    name: t('tradingConfig.order_trigger_status_cancelling'),
    color: 'default',
  },
};

export const CommissionMode: Record<
  CommissionModeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [CommissionModeEnum.ByAmount]: { name: t('tradingConfig.by_amount') },
  [CommissionModeEnum.ByVolume]: { name: t('tradingConfig.by_volume') },
};

export const BasketVolumeType: Record<
  BasketVolumeTypeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [BasketVolumeTypeEnum.Unknown]: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
  [BasketVolumeTypeEnum.Quantity]: {
    name: t('tradingConfig.by_quantity'),
    color: 'cyan',
  },
  [BasketVolumeTypeEnum.Proportion]: {
    name: t('tradingConfig.by_proportion'),
    color: 'purple',
  },
};

export const FundTransType: Record<
  FundTransEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [FundTransEnum.Error]: {
    name: t('fundTrans.error'),
    color: 'red',
  },
  [FundTransEnum.Pending]: {
    name: t('fundTrans.pending'),
    color: 'gray',
  },
  [FundTransEnum.Success]: {
    name: t('fundTrans.success'),
    color: 'green',
  },
};

export const InstrumentType: Record<
  InstrumentTypeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [InstrumentTypeEnum.unknown]: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
  [InstrumentTypeEnum.stock]: {
    name: t('tradingConfig.stock'),
    color: 'orange',
    level: 10,
  },
  [InstrumentTypeEnum.stockoption]: {
    name: t('tradingConfig.stock_option'),
    color: 'blue',
    level: 10,
  },
  [InstrumentTypeEnum.techstock]: {
    name: t('tradingConfig.tech_stock'),
    color: 'blue',
  },
  [InstrumentTypeEnum.future]: {
    name: t('tradingConfig.future'),
    color: 'red',
    level: 10,
  },
  [InstrumentTypeEnum.bond]: {
    name: t('tradingConfig.bond'),
    color: 'pink',
  },
  [InstrumentTypeEnum.fund]: {
    name: t('tradingConfig.fund'),
    color: 'purple',
  },
  [InstrumentTypeEnum.index]: {
    name: t('tradingConfig.index'),
    color: 'purple',
  },
  [InstrumentTypeEnum.repo]: {
    name: t('tradingConfig.repo'),
    color: 'red',
  },
  [InstrumentTypeEnum.crypto]: {
    name: t('tradingConfig.crypto'),
    color: 'orange',
    level: 10,
  },
  [InstrumentTypeEnum.cryptofuture]: {
    name: t('tradingConfig.crypto_future'),
    color: 'red',
    level: 10,
  },
  [InstrumentTypeEnum.cryptoufuture]: {
    name: t('tradingConfig.crypto_ufuture'),
    color: 'red',
    level: 10,
  },
  [InstrumentTypeEnum.multi]: {
    name: t('tradingConfig.multi'),
    color: 'green',
    level: 10,
  },
};

export const UnderweightType: Record<
  UnderweightEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [UnderweightEnum.UnrestrictedShares]: {
    name: t('blockTradeConfig.unrestricted_shares'),
    color: 'default',
  },
  [UnderweightEnum.RestrictedShares]: {
    name: t('blockTradeConfig.restricted_shares'),
    color: 'default',
  },
};

export const StrategyExtType: Record<
  StrategyExtTypes,
  KungfuApi.KfTradeValueCommonData
> = {
  unknown: {
    name: t('tradingConfig.unknown'),
    color: 'default',
  },
  default: {
    name: t('tradingConfig.default'),
    color: 'cyan',
    level: 9,
  },
  trade: {
    name: t('tradingConfig.order_task'),
    color: 'blue',
    level: 10,
  },
};

export const ShotableInstrumentTypes = [
  InstrumentTypeEnum.future,
  InstrumentTypeEnum.stockoption,
  InstrumentTypeEnum.cryptofuture,
  InstrumentTypeEnum.cryptoufuture,
  InstrumentTypeEnum.multi,
];

export const showVolumeSideTypes = [
  SideEnum.GuaranteeStockSell,
  SideEnum.RepayMargin,
];

export const T0InstrumentTypes = [
  InstrumentTypeEnum.future,
  InstrumentTypeEnum.bond,
  InstrumentTypeEnum.stockoption,
  InstrumentTypeEnum.crypto,
  InstrumentTypeEnum.cryptofuture,
  InstrumentTypeEnum.cryptoufuture,
];

export const T0ExchangeIds = ['US', 'HK', 'SHHK', 'SZHK'];

export const AbleSubscribeInstrumentTypesBySourceType: Record<
  InstrumentTypes,
  InstrumentTypeEnum[]
> = {
  unknown: [InstrumentTypeEnum.unknown],

  stock: [
    InstrumentTypeEnum.stock,
    InstrumentTypeEnum.bond,
    InstrumentTypeEnum.fund,
    InstrumentTypeEnum.techstock,
    InstrumentTypeEnum.index,
    InstrumentTypeEnum.repo,
    InstrumentTypeEnum.stockoption,
  ],

  future: [InstrumentTypeEnum.future],

  bond: [InstrumentTypeEnum.bond],

  stockoption: [InstrumentTypeEnum.stockoption],

  fund: [InstrumentTypeEnum.fund],

  techstock: [InstrumentTypeEnum.techstock],

  index: [InstrumentTypeEnum.index],

  repo: [InstrumentTypeEnum.repo],

  crypto: [
    InstrumentTypeEnum.crypto,
    InstrumentTypeEnum.cryptofuture,
    InstrumentTypeEnum.cryptoufuture,
  ],

  cryptofuture: [
    InstrumentTypeEnum.crypto,
    InstrumentTypeEnum.cryptofuture,
    InstrumentTypeEnum.cryptoufuture,
  ],

  cryptoufuture: [
    InstrumentTypeEnum.crypto,
    InstrumentTypeEnum.cryptofuture,
    InstrumentTypeEnum.cryptoufuture,
  ],

  multi: [
    InstrumentTypeEnum.stock,
    InstrumentTypeEnum.future,
    InstrumentTypeEnum.bond,
    InstrumentTypeEnum.stockoption,
    InstrumentTypeEnum.fund,
    InstrumentTypeEnum.techstock,
    InstrumentTypeEnum.index,
    InstrumentTypeEnum.repo,
    InstrumentTypeEnum.crypto,
    InstrumentTypeEnum.cryptofuture,
    InstrumentTypeEnum.cryptoufuture,
  ],
};

export const ExchangeIds: Record<string, KungfuApi.KfTradeValueCommonData> = {
  SSE: {
    name: t('tradingConfig.SSE'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SZE: {
    name: t('tradingConfig.SZE'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  BSE: {
    name: t('tradingConfig.BSE'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SHFE: {
    name: t('tradingConfig.SHFE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  GFEX: {
    name: t('tradingConfig.GFEX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  DCE: {
    name: t('tradingConfig.DCE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CZCE: {
    name: t('tradingConfig.CZCE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CFFEX: {
    name: t('tradingConfig.CFFEX'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  INE: {
    name: t('tradingConfig.INE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  HK: {
    name: t('tradingConfig.HK'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SHHK: {
    name: t('tradingConfig.SHHK'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SZHK: {
    name: t('tradingConfig.SZHK'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  HKFUT: {
    name: t('tradingConfig.HKFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  US: {
    name: t('tradingConfig.US'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  USFUT: {
    name: t('tradingConfig.USFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  SGX: {
    name: t('tradingConfig.SGX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SGXFUT: {
    name: t('tradingConfig.SGXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  EUR: {
    name: t('tradingConfig.EUR'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  EURFUT: {
    name: t('tradingConfig.EURFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  LON: {
    name: t('tradingConfig.LON'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  LONFUT: {
    name: t('tradingConfig.LONFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  AEX: {
    name: t('tradingConfig.AEX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  AUXFUT: {
    name: t('tradingConfig.AUXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  HEXS: {
    name: t('tradingConfig.HEXS'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  HEXSFUT: {
    name: t('tradingConfig.HEXSFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  IDX: {
    name: t('tradingConfig.IDX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  IDXFUT: {
    name: t('tradingConfig.IDXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  KORC: {
    name: t('tradingConfig.KORC'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  LME: {
    name: t('tradingConfig.LME'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  MYS: {
    name: t('tradingConfig.MYS'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  MYSFUT: {
    name: t('tradingConfig.MYSFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  ABB: {
    name: t('tradingConfig.ABB'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  PRX: {
    name: t('tradingConfig.PRX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  PRXFUT: {
    name: t('tradingConfig.PRXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  SIX: {
    name: t('tradingConfig.SIX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  SIXFUT: {
    name: t('tradingConfig.SIXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  TAX: {
    name: t('tradingConfig.TAX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  TAXFUT: {
    name: t('tradingConfig.TAXFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  JP: {
    name: t('tradingConfig.JP'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  JPFUT: {
    name: t('tradingConfig.JPFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  TSE: {
    name: t('tradingConfig.TSE'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  TSEFUT: {
    name: t('tradingConfig.TSEFUT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  XETRA: {
    name: t('tradingConfig.XETRA'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  GLFX: {
    name: t('tradingConfig.GLFX'),
    color: InstrumentType[InstrumentTypeEnum.stock].color,
  },
  IPE: {
    name: t('tradingConfig.IPE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CBOT: {
    name: t('tradingConfig.CBOT'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CEC: {
    name: t('tradingConfig.CEC'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  LIFE: {
    name: t('tradingConfig.LIFE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  MTIF: {
    name: t('tradingConfig.MTIF'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  NYCE: {
    name: t('tradingConfig.NYCE'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CMX: {
    name: t('tradingConfig.CMX'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  NYME: {
    name: t('tradingConfig.NYME'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  SIME: {
    name: t('tradingConfig.SIME'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  CME: {
    name: t('tradingConfig.CME'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  IMM: {
    name: t('tradingConfig.IMM'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  WIDX: {
    name: t('tradingConfig.WIDX'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  FREX: {
    name: t('tradingConfig.FREX'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  METL: {
    name: t('tradingConfig.METL'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  IPM: {
    name: t('tradingConfig.IPM'),
    color: InstrumentType[InstrumentTypeEnum.future].color,
  },
  'OKX-SPOT': {
    name: t('tradingConfig.OKX_SPOT'),
    color: InstrumentType[InstrumentTypeEnum.crypto].color,
  },
  'OKX-UFUT': {
    name: t('tradingConfig.OKX_USD_FUTURE'),
    color: InstrumentType[InstrumentTypeEnum.cryptoufuture].color,
  },
  'OKX-CFUT': {
    name: t('tradingConfig.OKX_COIN_FUTURE'),
    color: InstrumentType[InstrumentTypeEnum.cryptofuture].color,
  },
  'BINANCE-UFUT': {
    name: t('tradingConfig.BINANCE-UFUT'),
    color: InstrumentType[InstrumentTypeEnum.cryptoufuture].color,
  },
  'BINANCE-CFUT': {
    name: t('tradingConfig.BINANCE-CFUT'),
    color: InstrumentType[InstrumentTypeEnum.cryptofuture].color,
  },
};

export const FutureArbitrageCodes: Record<
  FutureArbitrageCodeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [FutureArbitrageCodeEnum.SP]: {
    name: t('tradingConfig.SP'),
  },
  [FutureArbitrageCodeEnum.SPC]: {
    name: t('tradingConfig.SPC'),
  },
  [FutureArbitrageCodeEnum.SPD]: {
    name: t('tradingConfig.SPD'),
  },
  [FutureArbitrageCodeEnum.IPS]: {
    name: t('tradingConfig.IPS'),
  },
};

export const SystemProcessName: Record<
  string,
  KungfuApi.KfTradeValueCommonData
> = {
  master: { name: t('tradingConfig.master') },
  ledger: { name: t('tradingConfig.ledger') },
  archive: { name: t('tradingConfig.archive') },
};

export const AddOperatorType: Record<
  AddOperatorTypeEnum,
  KungfuApi.KfTradeValueCommonData
> = {
  [AddOperatorTypeEnum.Extension]: {
    name: t('operatorConfig.add_operator_type.extension'),
    color: 'blue',
  },
  [AddOperatorTypeEnum.File]: {
    name: t('operatorConfig.add_operator_type.file'),
    color: 'pink',
  },
};

export const InstrumentMinOrderVolume = {
  [InstrumentTypeEnum.stock]: 100,
  [InstrumentTypeEnum.techstock]: 200,
  [InstrumentTypeEnum.future]: 1,
  [InstrumentTypeEnum.bond]: 1,
};

export const Currency: Record<CurrencyEnum, KungfuApi.KfTradeValueCommonData> =
  {
    [CurrencyEnum.Unknown]: { name: '' },
    [CurrencyEnum.CNY]: { name: t('tradingConfig.CNY') },
    [CurrencyEnum.HKD]: { name: t('tradingConfig.HKD') },
    [CurrencyEnum.USD]: { name: t('tradingConfig.USD') },
    [CurrencyEnum.JPY]: { name: t('tradingConfig.JPY') },
    [CurrencyEnum.GBP]: { name: t('tradingConfig.GBP') },
    [CurrencyEnum.EUR]: { name: t('tradingConfig.EURO') },
    [CurrencyEnum.CNH]: { name: t('tradingConfig.CNH') },
    [CurrencyEnum.SGD]: { name: t('tradingConfig.SGD') },
    [CurrencyEnum.MYR]: { name: t('tradingConfig.MYR') },
    [CurrencyEnum.CEN]: { name: t('tradingConfig.CEN') },
  };

export const ExportTradingDataColumnsToFilter: Record<
  KungfuApi.TradingDataTypeName,
  string[]
> = {
  Position: ['dest', 'source'],
  Trade: [],
  AlgoOrder: [],
  Order: [],
  Instrument: ['product_id', 'dest', 'source'],
  Asset: ['dest', 'source'],
  AlgoOrderInput: [],
  OrderInput: [],
  OrderStat: ['dest', 'source'],
  Quote: [],
  Basket: ['dest', 'source'],
  BasketInstrument: ['dest', 'source'],
  BasketOrder: [],
  InstrumentFactor: ['dest', 'source'],
  OrderTrigger: [],
  SyntheticData: [],
};

export const OrderTriggerCancelStatus = [
  OrderTriggerStatusEnum.Submitted,
  OrderTriggerStatusEnum.Pending,
];

export const TriggerFlag: Record<
  OrderTriggerFlag,
  KungfuApi.KfTradeValueCommonData
> = {
  [OrderTriggerFlag.TriggerInsert]: {
    name: t('orderTriggerConfig.trigger_insert'),
  },
  [OrderTriggerFlag.TriggerCancel]: {
    name: t('orderTriggerConfig.trigger_cancel'),
  },
};

export const OrderTriggerSide = [SideEnum.Buy, SideEnum.Sell];

export const OrderTriggerOffset = [
  OffsetEnum.Open,
  OffsetEnum.Close,
  OffsetEnum.CloseToday,
  OffsetEnum.CloseYest,
];

export const OrderTriggerPriceType = [
  PriceTypeEnum.Limit,
  PriceTypeEnum.Market,
  PriceTypeEnum.FakBest5,
  PriceTypeEnum.ForwardBest,
  PriceTypeEnum.ReverseBest,
  PriceTypeEnum.Fak,
  PriceTypeEnum.Fok,
  PriceTypeEnum.EnhancedLimit,
  PriceTypeEnum.AtAuctionLimit,
  PriceTypeEnum.AtAuction,
];

export const sideOffsetMap = {
  [SideEnum.Buy]: {
    [OffsetEnum.Open]: t('journalConfig.buy_open'),
    [OffsetEnum.Close]: t('journalConfig.buy_close'),
    [OffsetEnum.CloseToday]: t('journalConfig.buy_close'),
    [OffsetEnum.CloseYest]: t('journalConfig.buy_close'),
    [OffsetEnum.Unknown]: '--',
  },
  [SideEnum.Sell]: {
    [OffsetEnum.Open]: t('journalConfig.sell_open'),
    [OffsetEnum.Close]: t('journalConfig.sell_close'),
    [OffsetEnum.CloseToday]: t('journalConfig.sell_close'),
    [OffsetEnum.CloseYest]: t('journalConfig.sell_close'),
    [OffsetEnum.Unknown]: '--',
  },
  [SideEnum.Unknown]: '--',
};

export const CryptoInstrumentTypes = [
  InstrumentTypeEnum.crypto,
  InstrumentTypeEnum.cryptofuture,
  InstrumentTypeEnum.cryptoufuture,
];

export const InstrumentPrecision: Record<InstrumentTypeEnum, number> = {
  [InstrumentTypeEnum.unknown]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.stock]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.stockoption]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.techstock]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.future]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.bond]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.fund]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.index]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.repo]: DEFAULT_PRECISION,
  [InstrumentTypeEnum.crypto]: CRYPTO_PRECISION,
  [InstrumentTypeEnum.cryptofuture]: CRYPTO_PRECISION,
  [InstrumentTypeEnum.cryptoufuture]: CRYPTO_PRECISION,
  [InstrumentTypeEnum.multi]: DEFAULT_PRECISION,
};
