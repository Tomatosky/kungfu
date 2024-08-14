import { InjectionKey } from 'vue';

// 因为系统存在加载脚本插件的情况，所以不能用直接用 Symbol(xxx) 创建，因为 Symbol(xxx) !== Symbol(xxx)，这样会无法匹配
// 使用 Symbol.for(xxx) 会创建跨文件跨域的 symbol 对象

export const BuiltinComponentInjectKeysMap: {
  TradingTask: InjectionKey<BuiltinComponentPropsMap['TradingTask']>;
  KfBoards: InjectionKey<BuiltinComponentPropsMap['KfBoards']>;
  // MakeOrder: InjectionKey<BuiltinComponentPropsMap['MakeOrder']>;
} = {
  TradingTask: Symbol.for('TradingTask'),
  KfBoards: Symbol.for('KfBoards'),
  // Pos: Symbol.for('Pos'),
  // PosGlobal: Symbol.for('PosGlobal'),
  // Order: Symbol.for('Order'),
  // Trade: Symbol.for('Trade'),
  // Td: Symbol.for('Td'),
  // Md: Symbol.for('Md'),
  // Strategy: Symbol.for('Strategy'),
  // MarketData: Symbol.for('MarketData'),
  // OrderBook: Symbol.for('OrderBook'),
  // MakeOrder: Symbol.for('MakeOrder'),
  // FutureArbitrage: Symbol.for('FutureArbitrage'),                              `
  // BlockTrade: Symbol.for('BlockTrade'),
  // MakeOrder: Symbol.for('MakeOrder'),
};

// export const BuiltinFormInjectKeysMap:  {
//   Side:InjectionKey<BuiltinComponentInjectKeysMap['Side']>
// } = {
//   Side: Symbol.for('Side'),
// }

export const UIHelperInjectKeysMap: {
  KfBoards: InjectionKey<UIHelperProvideMap['KfBoards']>;
} = {
  KfBoards: Symbol.for('KfBoardsHelper'),
};
