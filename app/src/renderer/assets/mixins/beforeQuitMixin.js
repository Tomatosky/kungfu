
import moment from 'moment';
import path from "path";
import { mapGetters, mapState } from 'vuex';

import { dealQuote } from '__io/kungfu/watcher';
import { writeCSV } from '__gUtils/fileUtils';
import { KF_DATASET_QUOTE_DIR } from '__gConfig/pathConfig';

export default {

    data () {
        
        return {
            recordBeforeQuitLoading: undefined,
            clearProcessBeforeQuitLoading: undefined,
        }
    },

    computed: {
        
        ...mapState({
            tickerSets: state => state.MARKET.tickerSets,
            subscribedQuoteIds: state => state.MARKET.subscribedQuoteIds
        }),

        ...mapGetters([
            "flatternTickers"
        ]),

        showBeforeQuitDialog () {
            return this.recordBeforeQuitLoading !== undefined && 
                this.clearProcessBeforeQuitLoading !== undefined
        }
    },

    methods: {
        setBeforeQuitLoading (status) {
            this.clearProcessBeforeQuitLoading = status;
        },

        recordBeforeQuit () {
            this.recordBeforeQuitLoading = true;
            return Promise.all([
                this.recordQuote()
            ]).finally(() => {
                this.recordBeforeQuitLoading = false;
            })
        },

        recordQuote () {
            const tickerIds = this.flatternTickers.map(item => `${item.instrumentId}_${item.exchangeId}`).join(',')
            const subscribedQuotes = watcher.ledger.Quote
                .list()
                .filter(item => !!tickerIds.includes(`${item.instrument_id}_${item.exchange_id}`))
                .map(item => Object.freeze(dealQuote(item)))
                
            if (!subscribedQuotes.length) {
                return Promise.resolve(false)
            }
            const fileName = moment().format('YYYY-MM-DD');
            return writeCSV(path.join(KF_DATASET_QUOTE_DIR, `${fileName}.csv`), subscribedQuotes)
        },
    }
}



