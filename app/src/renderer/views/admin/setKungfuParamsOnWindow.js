
process.env.ELECTRON_RUN_AS_NODE = true;
process.env.RENDERER_TYPE = 'admin';



// debug export
const { kungfu, longfist, kungfuConfigStore, history } = require('__io/kungfu/kungfuUtils')
const { watcher } = require('__io/kungfu/watcher');

window.watcher = watcher;
window.longfist = longfist;
window.kungfu = kungfu;
window.kungfuConfigStore = kungfuConfigStore;
window.kungfuHistory = history;


