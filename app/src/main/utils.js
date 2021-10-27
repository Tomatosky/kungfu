import { app, dialog, shell } from 'electron';
import { KF_HOME, KUNGFU_ENGINE_PATH } from '__gConfig/pathConfig';
import { killGodDaemon, killKfc, killKungfu, killExtra, pm2KillAll } from '__gUtils/processUtils';
import { delayMilliSeconds } from "__gUtils/busiUtils";
import { platform } from '__gConfig/platformConfig';
import { reqRecordBeforeQuit, clearProcessBeforeQuitStart, clearProcessBeforeQuitEnd  } from "./events";

const path = require('path');
const packageJSON = require('__root/package.json');

var BeforeQuitLoading = false;

export function openUrl(url) {
	shell.openExternal(url)
}

export function showKungfuInfo () {
	const version = packageJSON.version;
	const electronVersion = packageJSON.devDependencies.electron;
	const info = `Version: ${version}\n`
	+ `electron: ${electronVersion} \n`
	+ `python: ${python_version}\n`
	+ `platform: ${platform} \n`
	+ `kungfu_home: ${KF_HOME} \n`
	+ `kungfu_engine: ${path.resolve(KUNGFU_ENGINE_PATH, 'kfc')} \n`
	+ `kungfu_resources: ${path.resolve(KUNGFU_ENGINE_PATH)} \n`
	+ `commit: ${git_commit_version}`
	dialog.showMessageBox({
		type: 'info',
		message: 'Kungfu',
		defaultId: 0,
		detail: info,
		buttons: ['好的'],
		icon: path.join(__resources, 'logo', 'icon.png')
	})
}

//结束所有进程
function KillAll () {
	return new Promise(resolve => {
		pm2KillAll()
			.catch(err => console.error(err)) 
			.finally(() => {
				killKfc()
					.catch(err => console.error(err)) 
					.finally(() => {
						killKungfu()
							.catch(err => console.error(err)) 
							.finally(() => {
								killGodDaemon()
									.catch(err => console.error(err)) 				
									.finally(() => {
										killExtra() // for keeping sure, kill again
											.catch(err => console.error(err)) 								
											.finally(() => {
												resolve(true)
											})
									})
							})
					})
			})
	})
}


export function killAllBeforeQuit (mainWindow) {
	console.time('quit clean')
	clearProcessBeforeQuitStart(mainWindow);
	return KillAll()
		.finally(() => {
			console.timeEnd('quit clean')
			clearProcessBeforeQuitEnd(mainWindow);
		})
}

//退出提示
export function showQuitMessageBox (mainWindow) {

	if (BeforeQuitLoading) {
		return Promise.reject(new Error("On Quitting Process"))
	}

	BeforeQuitLoading = true;

    return new Promise(resolve => {
        dialog.showMessageBox({
            type: 'question',
            title: '提示',
            defaultId: 0,
            cancelId: 1,
            message: "退出应用会结束所有交易进程，确认退出吗？",
            buttons: ['确认', '取消'],
            icon: path.join(__resources, 'logo', 'icon.png')
        }, (index) => {
            if(index === 0){
				Promise.all([
					reqRecordBeforeQuit(mainWindow),
					killAllBeforeQuit(mainWindow)
				])
				.finally(() => {
					resolve(true)
					delayMilliSeconds(1000)
						.then(() => {
							BeforeQuitLoading = false;
							app.quit();
						})
				})
            } else {
                resolve(false)
				BeforeQuitLoading = false;
            }
        })
    })
}

//崩溃提示
export function showCrashMessageBox () {
	return new Promise(resolve => {
        dialog.showMessageBox({
            type: 'question',
            title: '提示',
            defaultId: 0,
            cancelId: 1,
            message: "功夫图形进程中断，该中断不会影响交易，重新开启后出于安全考虑不会恢复之前交易数据，但可通过历史查询查看，是否重新开启界面？",
            buttons: ['确认', '取消'],
            icon: path.join(__resources, 'logo', 'icon.png')
        }, (index) => {
            if(index === 0){
				resolve(true)
            } else {
                resolve(false)
            }
        })
    })
}
