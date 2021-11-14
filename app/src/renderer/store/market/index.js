import Vue from 'vue';

export default {

    state: {
        tickerSets: [],

        currentTickerSet: null,

        currentTicker: null,

        marketAvgVolume: {},

        subscribedQuoteIds: {},
    },

    actions: {
        setTickerSets ({ commit }, tickerSets) {
            commit('SET_TICKER_SETS', tickerSets)
        },

        setCurrentTickerSet ({ commit }, tickerSet) {
            commit('SET_CURRENT_TICKER_SET', tickerSet)
        },

        setMarketAvgVolume ({ commit }, { days, data }) {
            commit('SET_MARKET_AVG_VOLUME', { days, data })
        },

        setSubscribedQuoteIds ({ commit }, quotes) {
            commit('SET_SUBSCRIBED_QUOTE_IDS', quotes)
        },
    },

    mutations: {
        SET_SUBSCRIBED_QUOTE_IDS (state, quotes) {
            quotes.forEach(quote => {
                const id = `${quote.exchangeId}_${quote.instrumentId}`
                Vue.set(state.subscribedQuoteIds, id, true)
            })
        },

        SET_TICKER_SETS (state, tickerSets) {
            Vue.set(state, 'tickerSets', tickerSets)
        },

        SET_CURRENT_TICKER_SET (state, tickerSet) {
            Vue.set(state, 'currentTickerSet', tickerSet)
        },

        SET_MARKET_AVG_VOLUME (state, { days, data }) {
            Vue.set(state.marketAvgVolume, days, data)
        }

    },

    getters: {
        flatternTickers (state) {
            let tickersList = [];
            (state.tickerSets || []).forEach(tickerSet => {
                const tickers = tickerSet.tickers || [];
                tickersList = [ ...tickersList, ...tickers]
            });

            return tickersList || []
        }
    }
}