
/* eslint-disable */
import './errorCatch';
import './setKungfuParamsOnWindow';
import Vue from 'vue';
import path from 'path';
import fse from 'fs-extra';
import moment from 'moment';
import store from '@/store';
import router from './routers';
import { delayMiliSeconds, openVueWin } from '__gUtils/busiUtils';
import { removeJournal } from '__gUtils/fileUtils';
import { KF_HOME, KUNGFU_RESOURCES_DIR } from '__gConfig/pathConfig';
import { watcher } from '__io/kungfu/watcher';
import ElementUI from 'element-ui';
import Components from '@/assets/components';

import App from './App.vue';
import '@/assets/iconfont/iconfont.js';
import '@/assets/iconfont/iconfont.css';
import '@/assets/scss/makeOrder.scss';
import '__io/http/index';

Vue.use(ElementUI)
Vue.use(Components)

Vue.config.productionTip = false
Vue.store = Vue.prototype.$store = store
Vue.bus = Vue.prototype.$bus = new Vue();


new Vue({
    router,
    store,
    render: h => h(App)
}).$mount('#app', true)


const { startGetProcessStatus, startMaster, startLedger, startDaemon, startArchiveMakeTask, _pm2 } = require('__gUtils/processUtils');


beforeAll()
.then(() => {
    return startArchiveMakeTask((archiveStatus) => {
        window.archiveStatus = archiveStatus
    })
})
.then(() => startMaster(false))
.catch(err => console.error(err.message))
.finally(() => {
    startGetProcessStatus(res => {
        const { processStatus, processStatusWithDetail } = res;
        Vue.store.dispatch('setProcessStatus', processStatus)
        Vue.store.dispatch('setProcessStatusWithDetail', processStatusWithDetail)
    });

    delayMiliSeconds(1000)
        .then(() => startLedger(false))
        .catch(err => console.error(err.message))

    
    //保证ui watcher已经启动
    let timer = setInterval(() => {
        if (watcher.isLive() && watcher.isStarted() && watcher.isUsable()) {
            delayMiliSeconds(1000)
                .then(() => startDaemon())
                .catch(err => console.error(err.message))
            clearInterval(timer);
        }

    }, 100)

})

window.ELEC_WIN_MAP = new Set();
window.pm2 = _pm2;


function beforeAll () {
    if (process.env.NODE_ENV !== 'development') {
        const clearJournalDate = localStorage.getItem('clearJournalDate');
        const today = moment().format('YYYY-MM-DD');
        console.log( localStorage.getItem('clearJournalDate'), today)
        
        if (clearJournalDate !== today) {
            localStorage.setItem('clearJournalDate', today);
            console.log( localStorage.getItem('clearJournalDate'), today)
            return removeJournal(KF_HOME);
        } else {
            return Promise.resolve(true);
        }
    } else {
        return Promise.resolve(true);
    }
}


//admin manager
import { remote } from 'electron';
var adminWin = null;
window.admin = (password) => {
    const rightPassword = fse.readJsonSync(path.resolve(`${KUNGFU_RESOURCES_DIR}/admin/password.json`));

    if (password != rightPassword.password || '') {
        console.error("管理员密码错误！")
        return;
    }

    //防止重开
    if (adminWin) {
        adminWin.focus && adminWin.focus();
        return;
    }
    
    openVueWin(
        "admin",
        "/",
        remote
    ).then(win => {
        adminWin = win;

        adminWin.on('close', () => {
            adminWin = null;
        })
    })
    console.log("管理员系统打开成功！")
    return
}