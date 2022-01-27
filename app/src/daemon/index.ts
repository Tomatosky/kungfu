import { buildKungfuGlobalDataPipe } from '__io/kungfu/tradingData';
import { aliveOrderStatusList } from 'kungfu-shared/config/tradingConfig';
import {
  kungfuSubscribeInstrument,
  kungfuMakeOrder,
  kungfuCancelOrder,
} from '__io/kungfu/makeCancelOrder';
import {
  watcher,
  startGetKungfuWatcherStep,
  startUpdateKungfuWatcherQuotes,
  getTargetOrdersByParentId,
  decodeKungfuLocation,
} from '__io/kungfu/watcher';

import * as PM2_METHODS from './pm2Methods';

startGetKungfuWatcherStep(200);
startUpdateKungfuWatcherQuotes(200);

buildKungfuGlobalDataPipe().subscribe((data: any) => {
  //@ts-ignore
  process.send({
    type: 'process:msg',
    data: {
      type: 'DEAMON_GLOBAL_DATA',
      body: {
        timestamp: new Date().getTime(),
        data,
      },
    },
  });
});

// other process to daemon
const { _pm2 } = require('__gUtils/processUtils');
_pm2.launchBus((err: Error, pm2_bus: any) => {
  if (err) {
    console.error('pm2 launchBus Error', err);
  }

  pm2_bus.on('process:msg', (packet: any) => {
    const packetData = packet.data || {};
    const processData = packet.process || {};
    const pm2Id = processData.pm_id || 0;
    const processName = processData.name || '';
    const dataType = packetData.type || '';
    const { accountId, ticker, parentId, exchangeId, sourceId } =
      packetData.body || {
        accountId: '',
        ticker: '',
        parentId: BigInt(0),
        exchangeId: '',
        sourceId: '',
      };

    switch (dataType) {
      case 'REQ_LEDGER_DATA':
        PM2_METHODS.resLedgerData(
          parentId,
          pm2Id,
          accountId,
          ticker,
          processName,
        );
        break;
      case 'REQ_QUOTE_DATA':
        PM2_METHODS.resQuoteData(pm2Id, ticker, processName);
        PM2_METHODS.resInstrumentInfo(pm2Id, ticker, processName);
        break;
      case 'REQ_POS_ORDER_DATA':
        PM2_METHODS.resPosData(pm2Id, accountId, processName);
        PM2_METHODS.resOrderData(pm2Id, parentId, processName);
        break;
      case 'SUBSCRIBE_BY_TICKER':
        const sourceName = accountId
          ? (accountId || '').toSourceName()
          : sourceId;
        kungfuSubscribeInstrument(sourceName, exchangeId, ticker);
        break;
      case 'MAKE_ORDER_BY_PARENT_ID':
        const makeOrderData = packetData.body;
        const markOrderDataResolved = {
          ...makeOrderData,
          parent_id: BigInt(makeOrderData.parent_id),
        };
        kungfuMakeOrder(markOrderDataResolved, makeOrderData.name).catch(
          (err: Error) => {
            console.error(err);
          },
        );
        break;
      case 'CANCEL_ORDER_BY_PARENT_ID':
        const ordersByParentId = getTargetOrdersByParentId(
          watcher.ledger.Order,
          parentId,
        );
        ordersByParentId
          .filter((order: OrderData) =>
            aliveOrderStatusList.includes(+(order.status || 0)),
          )
          .forEach((order: OrderData) => {
            const kungfuLocation = decodeKungfuLocation(+order.source);
            const accountId = `${kungfuLocation.group}_${kungfuLocation.name}`;
            kungfuCancelOrder(order.orderId, accountId);
          });
        break;
    }
  });
});

// app -> daemon
process.on('message', (packet) => {
  const { type, topic, data } = packet;

  if (type !== 'process:msg') return;
  switch (topic) {
    default:
      return;
  }
});
