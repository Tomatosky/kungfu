export enum KfLayoutDirection {
  v = 'v',
  h = 'h',
  unset = '',
}

export enum KfLayoutBoardType {
  Tab = 'tab',
  Card = 'card',
  CardTab = 'card-tab',
  Custom = 'custom',
}

export enum KfLayoutTargetDirectionClassName {
  unset = '',
  center = 'drag-over',
  top = 'drag-over-top',
  bottom = 'drag-over-bottom',
  left = 'drag-over-left',
  right = 'drag-over-right',
}

export enum MsgType {
  Asset = 101,
  Position = 103,
  Order = 202,
  OrderInput = 201,
  Trade = 203,
  OrderAction = 204,
  OrderActionError = 205,
  BlockMessage = 207,
  Quote = 401,
}

export enum LogLevelType {
  '-l trace' = 'TRACE',
  '-l debug' = 'DEBUG',
  '-l info' = 'INFO',
  '-l warning' = 'WARN',
  '-l error' = 'ERROR',
  '-l critical' = 'CRITICAL',
}
