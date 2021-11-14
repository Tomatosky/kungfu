<template>
    <MainContent>
        <div class="account-content">
            <el-row style="height: 55%">
                <el-col :span="14">
                    <el-tabs :value="currentAccountTabName" type="border-card" @tab-click="handleAccountTabClick">
                        <el-tab-pane :lazy="true" :label="getCurrentAccountTabLabelName('tdList')" name="tdList">
                            <TdAccount></TdAccount>
                        </el-tab-pane>
                        <el-tab-pane :lazy="true" :label="getCurrentAccountTabLabelName('mdList')" name="mdList">
                            <MdAccount></MdAccount>
                        </el-tab-pane>
                        <el-tab-pane :lazy="true" :label="getCurrentAccountTabLabelName('marketdata')" name="marketdata">
                            <MarketData 
                            :currentId="currentId"
                            :moduleType="moduleType"
                            :marketData="quoteData" 
                            ></MarketData>
                        </el-tab-pane>
                        <el-tab-pane :lazy="true" :label="getCurrentAccountTabLabelName('holdInstruments')" name="holdInstruments">
                            <Pos 
                            :noTitle="true"
                            moduleType="acocunt"
                            :kungfuData="positionsByTicker"
                            :currentTicker="currentTickerResolved"
                            @activeTicker="setCurrentTicker"
                            @makeOrder="handleMakeOrderByPos"
                            />
                        </el-tab-pane>
                        <el-tab-pane :lazy="false" v-if="proMode" :label="getCurrentAccountTabLabelName('tradingTask')" name="tradingTask" >
                            <Task :noTitle="true"></Task>
                        </el-tab-pane>
                    </el-tabs>
                </el-col>
                <el-col :span="10">
                    <el-row style="height: 45%">
                        <Pos 
                        :moduleType="moduleType"
                        :currentId="currentId" 
                        :accountType="accountType"
                        :kungfuData="positions"
                        @showMakeOrderDashboard="handleShowOrCloseMakeOrderDashboard(true)"
                        @makeOrder="handleMakeOrderByPos"
                        />
                    </el-row>
                    <el-row style="height: 55%" class="has-padding-bottom">
                        <el-tabs type="border-card" v-model="currentTradesPnlTabNum">
                            <el-tab-pane :lazy="true" :label="`成交记录 ${showCurrentIdInTabName(currentTradesPnlTabNum, 'trades')}`" name="trades">
                                <TradeRecord
                                :noTitle="true"
                                :moduleType="moduleType" 
                                :currentId="currentId"
                                :kungfuData="trades"
                                :orderStat="orderStat"
                                @showHistory="handleShowHistory"
                                />
                            </el-tab-pane>
                            <el-tab-pane :disabled="moduleType === 'ticker'" :lazy="true" :label="`盈利曲线 ${showCurrentIdInTabName(currentTradesPnlTabNum, 'pnl')}`" name="pnl">
                                <Pnl 
                                :noTitle="true"
                                :currentId="currentId" 
                                :moduleType="moduleType"
                                :minPnl="pnl"
                                :dailyPnl="dailyPnl"
                                />
                            </el-tab-pane>
                        </el-tabs>
                    </el-row>
                </el-col>
            </el-row>
            <el-row style="height: 45%">
                <el-col :span="14">
                    <el-tabs v-model="currentOrdesTabName" type="border-card">
                        <el-tab-pane :lazy="true" :label="`全部委托 ${showCurrentIdInTabName(currentOrdesTabName, 'orders')}`" name="orders">
                            <OrderRecord
                            :noTitle="true"
                            :moduleType="moduleType" 
                            :todayFinishPreSetting="true"
                            :currentId="currentId"
                            :kungfuData="orders"
                            :gatewayName="currentAccount.account_id"
                            :orderStat="orderStat"
                            @showHistory="handleShowHistory"
                            />   
                        </el-tab-pane>
                        <el-tab-pane :lazy="true" :label="`未完成委托 ${showCurrentIdInTabName(currentOrdesTabName, 'unfinishedOrders')}`" name="unfinishedOrders">
                            <OrderRecord
                            :noTitle="true"
                            :moduleType="moduleType" 
                            :todayFinishPreSetting="false"
                            :currentId="currentId"
                            :kungfuData="orders"
                            :gatewayName="currentAccount.account_id"
                            :orderStat="orderStat"
                            @showHistory="handleShowHistory"
                            />   
                        </el-tab-pane>
                        <el-tab-pane :lazy="true"  v-if="proMode" :label="`算法任务记录 ${currentTaskIdInTab}`" name="taskDetail">
                            <TaskRecord 
                            :currentId="currentId"
                            :moduleType="moduleType" 
                            ></TaskRecord>
                        </el-tab-pane>
                    </el-tabs>
                </el-col>
                <el-col :span="4">
                    <OrderBook
                        :marketData="quoteData"
                        :currentId="currentId"
                        :moduleType="moduleType"
                    ></OrderBook>
                </el-col>
                <el-col :span="6">
                    <MakeOrderDashboard
                    ></MakeOrderDashboard>
                </el-col>
            </el-row>
        </div>
    </MainContent>
</template>

<script>
import { mapGetters, mapState } from 'vuex'

import TdAccount from '@/components/Account/components/TdAccount';
import MdAccount from '@/components/Account//components/MdAccount';
import Task from '@/components/Task/Index';
import OrderRecord from '@/components/Base/tradingData/OrderRecord';
import TradeRecord from '@/components/Base/tradingData/TradeRecord';
import Pos from '@/components/Base/tradingData/Pos';
import Pnl from '@/components/Base/tradingData/pnl/Index';
import MakeOrderDashboard from '@/components/Base/makeOrder/MakeOrderDashboard';
import MainContent from '@/components/Layout/MainContent';
import TaskRecord from '@/components/Task/TaskRecord';
import OrderBook from '@/components/MarketFilter/components/OrderBook';
import MarketData from '@/components/MarketFilter/components/MarketData';

import { 
    watcher, 
    transformPositionByTickerByMerge, 
    transformTradingItemListToData,
    transformOrderStatListToData, 
    getOrdersBySourceDestInstrumentId, 
    getTradesBySourceDestInstrumentId, 
    getOrderStatByDest, 
    dealSnapshot,
    dealPos,
    dealQuote
} from '__io/kungfu/watcher';
import { encodeKungfuLocation } from '__io/kungfu/kungfuUtils';
import { buildKungfuDataByAppPipe } from '__io/kungfu/tradingData';

import accountStrategyMixins from '@/views/index/js/accountStrategyMixins';

export default {
    name: 'account',

    mixins: [ accountStrategyMixins ],

    data() {
        this.tradingDataPipe = null;
        this.dataDealing = false;

        return {
            orders: Object.freeze([]),
            trades: Object.freeze([]),
            pnl: Object.freeze([]),
            dailyPnl: Object.freeze([]),
            positions: Object.freeze([]),
            positionsByTicker: Object.freeze([]),
            orderStat: Object.freeze({}),
            quoteData: Object.freeze({}),

            currentOrdesTabName: "orders",
            currentTradesPnlTabNum: "trades",
        }
    },

    components: {
        TdAccount, MdAccount, Pos,
        Pnl,
        Task,
        OrderRecord, TradeRecord,
        MakeOrderDashboard,
        MainContent,
        TaskRecord,
        OrderBook,
        MarketData,
    },

    computed:{
        ...mapState({
            currentAccount: state => state.ACCOUNT.currentAccount, //选中的账户
            currentTicker: state => state.ACCOUNT.currentTicker,
            currentAccountTabName: state => state.ACCOUNT.currentAccountTabName,
            currentTaskId: state => (state.BASE.currentTask || {}).name || '',
            tdAccountSource: state => state.BASE.tdAccountSource || {},
            taskExtConfigList: state => state.BASE.taskExtConfigList || [],
            subscribedQuoteIds: state => state.MARKET.subscribedQuoteIds || {}
        }),

        ...mapGetters([
            "proMode"
        ]),

        currentTickerResolved () {
            if (this.currentAccountTabName === 'holdInstruments') {
                return this.currentTicker
            } else {
                return null
            }
        },

        //账户的类型，根据是哪个柜台的，可以判断是是期货还是股票还是证券
        accountType() {
            const source_name = this.currentAccount.source_name
            if(!source_name) return
            return (this.tdAccountSource[source_name] || {}).typeName || ''
        },

        moduleType () {
            if (this.currentAccountTabName === 'holdInstruments') {
                return 'ticker'
            } else {
                return 'account'
            }
        },

        currentId () {
            if (this.moduleType === 'ticker') {
                return `${this.currentTicker.instrumentId || ''} ${this.currentTicker.direction || ''}`
            } else {
                return this.currentAccount.account_id || ''
            }
        },

        currentAccountName () {
            return JSON.parse(this.currentAccount.config || "{}").account_id;
        },

        currentTickerId () {
            if (this.currentTicker.instrumentId) {
                return `${this.currentTicker.exchangeId}_${this.currentTicker.instrumentId}_${this.currentTicker.directionOrigin}`
            } else {
                return ''
            }
        },

        currentLocationUID () {
            if (!this.currentId) return 0;
            return watcher.getLocationUID(encodeKungfuLocation(this.currentId, 'td'));
        },

        currentTaskIdInTab () {
            if (this.currentOrdesTabName === 'taskDetail') {
                return this.currentTaskId
            }

            return ''
        }
    },

    watch: {
        moduleType (val) {
            if (val === 'ticker') {
                this.currentTradesPnlTabNum = 'trades'
            }
        },

        currentId () {
            this.updateMakeOrderDashboard();
        },

        currentTaskId () {
            this.currentOrdesTabName = "taskDetail"
        }
    },

    mounted ( ) {
   
        this.updateMakeOrderDashboard();
   
        this.tradingDataPipe = buildKungfuDataByAppPipe().subscribe(() => {
            
            if (this.dataDealing) return;
            this.dataDealing = true;

            window.requestIdleCallback(() => {
                if (this.moduleType !== 'ticker') {
                    this.dealTradingData();
                } else {
                    this.dealTradingDataByTiker();
                }
                
                console.time("deal quote")
                const quoteList = watcher.ledger.Quote
                    .list()
                    .filter(item => !!this.subscribedQuoteIds[`${item.exchange_id}_${item.instrument_id}`])
                    .map(item => Object.freeze(dealQuote(item)))
                this.quoteData = [{}, ...quoteList].reduce((target, quote2) => {
                    return {
                        ...target,
                        [`${quote2.exchangeId}_${quote2.instrumentId}`]: quote2
                    }
                })
                console.timeEnd("deal quote")

                this.dataDealing = false;
            }, { timeout: 2000 })
        })
    },

    destroyed ( ) {
        this.tradingDataPipe && this.tradingDataPipe.unsubscribe();
        this.orderStatPipe && this.orderStatPipe.unsubscribe();
        this.marketDataPipe && this.marketDataPipe.unsubscribe();
    },

    methods: {

        handleAccountTabClick (tab) {
            this.$store.dispatch('setCurrentAccountTabName', tab.name)
        },

        updateMakeOrderDashboard () {
            this.$bus.$emit("update:make-order", {
                currentId: this.currentId,
                moduleType: this.moduleType,
                orderInput: {}
            })
        },

        getCurrentAccountTabLabelName (name) {
            const isActive = this.currentAccountTabName === name;
            const isHoldInstrumentActive = this.currentAccountTabName === 'holdInstruments';

            switch (name) {
                case "tdList":
                    return isHoldInstrumentActive ? "账户列表" : `账户列表 ${this.currentId || ''}`;
                case "mdList":
                    return "行情源"
                case "marketdata":
                    return "行情订阅"
                case "holdInstruments":
                    return !isActive ? "持有标的" : `持有标的 ${(this.currentTickerResolved || {}).id || ''}`;
                case "tradingTask":
                    return !isActive ? "算法任务" : `算法任务 ${this.currentTaskId || ''}`;

            }
        },

        showCurrentIdInTabName (currentTabName, target) {
            return currentTabName === target ? this.currentId : ''
        },

        setCurrentTicker (item) {
            this.$store.dispatch('setCurrentTicker', item)
        },

        initSetCurrentTicker (tickerList) {
            if (!this.currentTicker || !this.currentTicker.instrumentId) {
                if (tickerList.length) {
                    const tickerListSort = tickerList.slice(0).sort((a, b) => {
                        const aid = a.instrumentId || ''
                        const bid = b.instrumentId || ''
                        const ad = a.direction || '';
                        const bd = b.direction || '';
                        const result = aid.localeCompare(bid);
                        return result === 0 ? ad.toString().localeCompare(bd.toString()) : result;
                    })

                    if (tickerListSort.length) {
                        this.$store.dispatch('setCurrentTicker', tickerListSort[0])
                    }
                }
            }
        },

        dealTradingData () {
            const ledgerData = watcher.ledger;

            console.time("deal order")
            if (!this.isHistoryDataOrder) {
                const orders = getOrdersBySourceDestInstrumentId(ledgerData.Order, 'source', this.currentLocationUID)
                this.orders = Object.freeze(orders || []);
            }
            console.timeEnd("deal order")

            console.time("deal trade")
            if (!this.isHistoryDataTrade) {
                const trades = getTradesBySourceDestInstrumentId(ledgerData.Trade, 'source', this.currentLocationUID)
                this.trades = Object.freeze(trades || []);
            }
            console.timeEnd("deal trade")

            console.time("deal order stats")
            const orderStat = getOrderStatByDest(ledgerData.OrderStat, 'dest', this.currentLocationUID)
            const orderStatResolved = transformOrderStatListToData(orderStat);
            this.orderStat = Object.freeze(orderStatResolved); 
            console.timeEnd("deal order stats")
      
            console.time("deal pos")
            this.positions = Object.freeze(
                ledgerData.Position
                    .filter('ledger_category', 0)
                    .nofilter("volume", BigInt(0))
                    .filter("source_id", this.currentAccount.source_name)
                    .filter("account_id", this.currentAccountName)
                    .list()
                    .map(item => Object.freeze(dealPos(item)))
            )
            console.timeEnd("deal pos")
            
            if (this.currentTradesPnlTabNum == 'pnl') {
                this.pnl = ledgerData.AssetSnapshot
                    .filter("ledger_category", 0)
                    .filter("dest", this.currentLocationUID)
                    .sort('update_time')
                    .map(item => Object.freeze(dealSnapshot(item)));

                this.dailyPnl = ledgerData.DailyAsset
                    .filter("ledger_category", 0)
                    .filter("dest", this.currentLocationUID)
                    .sort('update_time')
                    .map(item => Object.freeze(dealSnapshot(item)));
            }
        },


        dealTradingDataByTiker () {
            const ledgerData = watcher.ledger;
            const { exchangeId, instrumentId, directionOrigin } = this.currentTicker;

            if (!this.isHistoryDataOrder) {
                const orders = getOrdersBySourceDestInstrumentId(ledgerData.Order, 'instrument', instrumentId, exchangeId, directionOrigin);
                this.orders = Object.freeze(orders || []);
            }

            if (!this.isHistoryDataTrade) {
                const trades = getTradesBySourceDestInstrumentId(ledgerData.Trade, 'instrument', instrumentId, exchangeId, directionOrigin);
                this.trades = Object.freeze(trades || []);
            }

            const orderStat = getOrderStatByDest(ledgerData.OrderStat);
            const orderStatResolved = transformOrderStatListToData(orderStat);
            this.orderStat = Object.freeze(orderStatResolved); 

            
            const allPositions = ledgerData.Position
                .nofilter("volume", 0)
                .list()
                .map(item => Object.freeze(dealPos(item)))
            const positionsByTicker = transformTradingItemListToData(allPositions, 'ticker');
            this.positionsByTicker = Object.freeze(transformPositionByTickerByMerge(positionsByTicker, 'account') || []);
            this.initSetCurrentTicker(this.positionsByTicker);

            if (this.moduleType === 'ticker' && this.currentTickerId) {
                const positionsByTickerForAccount = positionsByTicker[this.currentTickerId]
                this.positions = Object.freeze(positionsByTickerForAccount)
            }
        },
    },
}
</script>

<style lang="scss" scoped>

@import '@/assets/scss/skin.scss';

.account-content{
    height: 100%;
}

.account-content>.el-row{
    height: 50%;

    >.tr-dashboard{
        padding-right: 0px;
    }

    &:last-child .tr-dashboard{
        padding-bottom: 0px;
    }

    .el-col:last-child {

        .tr-dashboard {
            padding-right: 0;
        }
    }
}

.el-row {

    &.has-padding-bottom {

        .tr-dashboard {
            padding-bottom: 8px !important;
        }
    }
}

.el-col {
    height: 100%;
}

</style>

