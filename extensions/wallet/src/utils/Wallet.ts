import axios, { AxiosInstance } from 'axios';

import { CURRENT_STAGE } from '@kungfu-trader/kfx-ui-login-authing/src/configs/authing';
import { delayMilliSeconds } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { WalletData, WalletInvoiceData, WalletTransData } from '../typings';
import {
  WalletTransTypeEnum,
  WalletTransStatusEnum,
  WalletStatusEnum,
  WalletInvoiceStatusEnum,
} from '../typings/enum';
import dayjs from 'dayjs';

const DefaultWalletName = 'Prepaid';

export class Wallet {
  walletAxios: AxiosInstance;

  name: string;
  walletData?: WalletData;

  transactions: {
    map: Record<string, WalletTransData>;
    all: WalletTransData[];
    byType: Record<WalletTransTypeEnum, WalletTransData[]>;
    byDay: Record<
      number,
      {
        dayStartTs: number;
        [WalletTransTypeEnum.Inbound]: number;
        [WalletTransTypeEnum.Outbound]: number;
        list: WalletTransData[];
      }
    >;
  };

  invoices: {
    map: Record<string, WalletInvoiceData>;
    all: WalletInvoiceData[];
    byStatus: Record<WalletInvoiceStatusEnum, WalletInvoiceData[]>;
  };

  currentTransPage = 1;
  lastTansCreatedAt: number | null = null;

  constructor(token: string, name = DefaultWalletName) {
    this.name = name;
    this.transactions = {
      map: {},
      all: [],
      byType: {
        [WalletTransTypeEnum.Outbound]: [],
        [WalletTransTypeEnum.Inbound]: [],
      },
      byDay: {},
    };
    this.invoices = {
      map: {},
      all: [],
      byStatus: {
        [WalletInvoiceStatusEnum.Pending]: [],
        [WalletInvoiceStatusEnum.Finalized]: [],
      },
    };
    this.walletAxios = axios.create({
      baseURL: `https://api.kungfu-trader.com/${CURRENT_STAGE}/billing`,
      timeout: 10000,
      headers: {
        authorization: token,
      },
    });
    this.walletAxios.interceptors.response.use(
      (res) => res,
      (err) => {
        console.error(err);

        const originalConfig = err.config;
        originalConfig.retryCount = originalConfig.retryCount ?? 0;
        if (originalConfig && originalConfig.retryCount++ < 3) {
          return delayMilliSeconds(200).then(() =>
            this.walletAxios(originalConfig),
          );
        } else {
          return Promise.reject(err);
        }
      },
    );
  }

  private dealTimeStr(timeStr: string) {
    const date = new Date(timeStr);
    return date.toString() !== 'Invalid Date' ? date.getTime() : null;
  }

  private dealNumStr(numStr: string, type?: WalletTransTypeEnum) {
    const direction =
      type === undefined ? 1 : type === WalletTransTypeEnum.Inbound ? +1 : -1;
    return Number.isNaN(Number(numStr)) ? null : Number(numStr) * direction;
  }

  private listAllWallets(): Promise<WalletData[]> {
    return this.walletAxios.get('/wallets').then(
      (res) =>
        res.data.data?.wallets.map((item) => ({
          ...item,
          rate_amount: this.dealNumStr(item.rate_amount),
          balance: item.balance_cents / 100,
          created_at: this.dealTimeStr(item.created_at),
          expiration_at: this.dealTimeStr(item.expiration_at),
          last_balance_sync_at: this.dealTimeStr(item.last_balance_sync_at),
          last_consumed_credit_at: this.dealTimeStr(
            item.last_consumed_credit_at,
          ),
          terminated_at: this.dealTimeStr(item.terminated_at),
          expiration_date: this.dealTimeStr(item.expiration_date),
        })) || [],
    );
  }

  private listTransactionsCommand(
    page: number,
    size = 1000,
    transType?: WalletTransTypeEnum,
    transStatus?: WalletTransStatusEnum,
  ): Promise<WalletTransData[]> {
    if (!this.walletData) return Promise.resolve([]);

    return this.walletAxios
      .get(`/wallets/${this.walletData.lago_id}/wallet_transactions`, {
        params: {
          page,
          per_page: size,
          status: transStatus,
          transaction_type: transType,
        },
      })
      .then((res) => {
        const trans: WalletTransData[] = res.data.data?.wallet_transactions.map(
          (item) => {
            return {
              ...item,
              amount: this.dealNumStr(item.amount, item.transaction_type),
              credit_amount: this.dealNumStr(
                item.credit_amount,
                item.transaction_type,
              ),
              created_at: this.dealTimeStr(item.created_at),
              settled_at: this.dealTimeStr(item.settled_at),
            };
          },
        );
        return trans;
      });
  }

  private updateTransactions(trans: WalletTransData[], reset = false) {
    if (reset) {
      this.transactions = {
        map: {},
        all: [],
        byType: {
          [WalletTransTypeEnum.Outbound]: [],
          [WalletTransTypeEnum.Inbound]: [],
        },
        byDay: {},
      };
    }

    const transSorted = trans.sort(
      (a, b) => (a.created_at || 0) - (b.created_at || 0),
    );

    return transSorted.filter((item) => {
      if (!(item.lago_id in this.transactions.map)) {
        this.transactions.map[item.lago_id] = item;
        this.transactions.all.unshift(item);
        this.transactions.byType[item.transaction_type].unshift(item);

        if (item.created_at) {
          const ts = item.created_at;
          if (item.amount) {
            const dayTs = dayjs(ts).startOf('day').valueOf();
            if (!(dayTs in this.transactions.byDay)) {
              this.transactions.byDay[dayTs] = {
                dayStartTs: dayTs,
                [WalletTransTypeEnum.Inbound]: 0,
                [WalletTransTypeEnum.Outbound]: 0,
                list: [],
              };
            }

            const type = item.transaction_type;
            this.transactions.byDay[dayTs][type] += Math.abs(item.amount);
            this.transactions.byDay[dayTs].list.unshift(item);
          }
        }
        return true;
      }

      return false;
    });
  }

  private listInvoices(paymentStatus: WalletInvoiceStatusEnum) {
    return this.walletAxios
      .get(`/invoices?payment_status=${paymentStatus}`)
      .then((res) => {
        const list = res.data.data?.invoices;
        return list.map(
          (item) =>
            ({
              ...item,
              amount: item.amount_cents / 100,
            } as WalletInvoiceData),
        );
      });
  }

  private updateInvoices(invoices: WalletInvoiceData[], reset = false) {
    if (reset) {
      this.invoices = {
        map: {},
        all: [],
        byStatus: {
          [WalletInvoiceStatusEnum.Pending]: [],
          [WalletInvoiceStatusEnum.Finalized]: [],
        },
      };
    }

    return invoices.filter((item) => {
      if (!(item.lago_id in this.invoices.map)) {
        this.invoices.map[item.lago_id] = item;
        this.invoices.all.unshift(item);
        this.invoices.byStatus[item.payment_status].unshift(item);
        return true;
      }

      return false;
    });
  }

  private getActivePrepaidWallet() {
    return this.listAllWallets().then((res) => {
      const wallet = res
        .filter((item) => item.status === WalletStatusEnum.Active)
        .find((item) => item.name === this.name);
      return wallet;
    });
  }

  initWallet() {
    return this.walletData
      ? Promise.resolve(this.walletData)
      : this.refreshWalletData();
  }

  refreshWalletData() {
    return this.getActivePrepaidWallet().then((res) => {
      this.walletData = res;
      return this.walletData;
    });
  }

  loadTransactions(
    page = this.currentTransPage++,
    size = 1000,
  ): Promise<WalletTransData[]> {
    return this.listTransactionsCommand(page, size).then((trans) => {
      return this.updateTransactions(trans);
    });
  }

  refreshTransactions() {
    return this.listTransactionsCommand(1, 1000).then((trans) => {
      return this.updateTransactions(trans);
    });
  }

  listPendingInvoices() {
    return this.listInvoices(WalletInvoiceStatusEnum.Pending).then(
      (pendingInvoices) => {
        return this.updateInvoices(pendingInvoices);
      },
    );
  }

  refreshAll() {
    return Promise.all([
      this.getActivePrepaidWallet(),
      this.listTransactionsCommand(1, 1000),
      // this.listInvoices(WalletInvoiceStatusEnum.Pending),
    ]).then(([wallet, trans]) => {
      this.walletData = wallet;
      this.updateTransactions(trans, true);
      // this.updateInvoices(invoices, true);
    });
  }
}
