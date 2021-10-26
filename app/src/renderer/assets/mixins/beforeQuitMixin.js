
import moment from 'moment';
import path from "path";
import { mapGetters, mapState } from 'vuex';

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
            const subscribedQuotes = this.$store.state.MARKET.quotes
                .filter(item => {
                    return tickerIds.includes(`${item.instrumentId}_${item.exchangeId}`)
                })
            
            if (!subscribedQuotes.length) {
                return Promise.resolve(false)
            }
            const fileName = moment().format('YYYY-MM-DD');
            return writeCSV(path.join(KF_DATASET_QUOTE_DIR, `${fileName}.csv`), subscribedQuotes)
        },
    }
}



