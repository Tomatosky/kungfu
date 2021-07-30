
/* eslint-disable */
import './errorCatch';
import './setKungfuParamsOnWindow';
import Vue from 'vue';
import path from 'path';
import fse from 'fs-extra';
import { remote } from 'electron';
import moment from 'moment';
import store from '@/store';
import router from './routers';
import { logger } from '__gUtils/logUtils';
import { delayMiliSeconds, openVueWin } from '__gUtils/busiUtils';
import { removeJournal } from '__gUtils/fileUtils';
import { KF_HOME, KUNGFU_RESOURCES_DIR } from '__gConfig/pathConfig';
import { watcher } from '__io/kungfu/watcher';
import { kungfu } from '__io/kungfu/kungfuUtils';
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
var adminWin = null;
window.admin = {
    login (password) {
        const hashedPassword = kungfu.formatStringToHashHex(password.toString());
        const rightPassword = fse.readJsonSync(path.resolve(`${KUNGFU_RESOURCES_DIR}/admin/password.json`));
    
        if (hashedPassword != rightPassword.password || '') {
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
            logger.info("Admin login")
            adminWin = win;
            adminWin.on('close', () => {
                logger.info("Admin logout")
                adminWin = null;
            })
        })
        console.log("管理员系统打开成功！")
        return
    },

    resetPassword (oldpassword, newpassword) {
        const targetJSONPath = path.resolve(`${KUNGFU_RESOURCES_DIR}/admin/password.json`);
        const oldHashedPassword = kungfu.formatStringToHashHex(oldpassword.toString());
        const rightOldPassword = fse.readJsonSync(targetJSONPath);
        
        if (oldHashedPassword != rightOldPassword.password || '') {
            console.error("管理员旧密码错误！")
            console.error("更新密码失败！")
            return;
        }

        const newHashedPassword = kungfu.formatStringToHashHex(newpassword.toString());
        fse.writeJSONSync(targetJSONPath, {
            password: newHashedPassword
        })
        console.log("管理员新密码设置成功！")
        console.log("请通过admin.login方法登录")
        return;
    }
};
