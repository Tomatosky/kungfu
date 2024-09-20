import { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { getGlobalStorage } from '@kungfu-trader/kungfu-js-api/utils/globalStorage';
import { readRootPackageJsonSync } from '@kungfu-trader/kungfu-js-api/utils/fileUtils';
import {
  BASE_DB_DIR,
  LAST_VERSION_BASE_DB_DIR,
} from '@kungfu-trader/kungfu-js-api/config/pathConfig';
import { booleanProcessEnv } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import path from 'path';
import dayjs from 'dayjs';
import fse from 'fs-extra';
const globalStorage = getGlobalStorage();

export function reqRecordBeforeQuit(
  mainWindow: BrowserWindow,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mainWindow || !mainWindow.webContents) {
      resolve(false);
      return;
    }

    //10s后强制关闭
    console.time('record before quit');
    const timer = setTimeout(() => {
      resolve(false);
      console.timeEnd('record before quit');
      console.log('record before quit timeout');
      clearTimeout(timer);
    }, 10000);

    sendMsgToMainWindow(mainWindow, 'record-before-quit');

    ipcMain.on('record-before-quit-done', () => {
      resolve(true);
      if (!timer) return; // if timer has been cleared
      console.timeEnd('record before quit');
      clearTimeout(timer);
    });
  });
}

export function clearProcessBeforeQuitStart(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'clear-process-before-quit-start');
}

export function clearProcessBeforeQuitEnd(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'clear-process-before-quit-end');
}

export function openSettingDialog(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'open-setting-dialog');
}

export function clearJournal(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'clear-journal');
}

export function clearDB(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'clear-db');
}

export function resetCurDashboard(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'reset-current-dashboard');
}

export function openLogFile(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'open-log');
}

export function exportAllTradingData(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'export-all-trading-data');
}

export function exportInstrumentWhitelists(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'export-instrument-whitelists');
}

export function viewAllJournal(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'view-all-journal');
}

export function foundNewVersion(
  mainWindow: BrowserWindow,
  newVersion: string,
): void {
  sendMsgToMainWindow(mainWindow, 'auto-update-find-new-version', {
    newVersion,
  });
}

export function skipVersion(mainWindow: BrowserWindow, version: string): void {
  sendMsgToMainWindow(mainWindow, 'auto-update-skip-version', { version });
}

export function startDownloadNewVersion(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'auto-update-start-download');
}

export function downloadProcessUpdate(
  mainWindow: BrowserWindow,
  process: number,
): void {
  sendMsgToMainWindow(
    mainWindow,
    'auto-update-download-process',
    { process },
    { slient: true },
  );
}

export function updateNotAvailable(mainWindow: BrowserWindow): void {
  sendMsgToMainWindow(mainWindow, 'auto-update-up-to-date', { slient: true });
}

export function sendUpdatingError(
  mainWindow: BrowserWindow,
  error: Error,
): void {
  sendMsgToMainWindow(mainWindow, 'auto-update-error', { error });
}

function sendMsgToMainWindow(
  mainWindow: BrowserWindow,
  msg: string,
  payload: object = {},
  options?: {
    slient?: boolean;
  },
): void {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('main-process-messages', msg, payload);
    !options?.slient && mainWindow.focus();
  }
}

export function copyConfigDBToLatestVersionDir() {
  if (booleanProcessEnv(process.env.IF_CUR_VERSION_FIRST_RUNNING)) {
    //如果上一个版本存在config.db，则将其复制到到BASE_DB_DIR
    if (
      fse.pathExistsSync(path.join(LAST_VERSION_BASE_DB_DIR, 'config.db')) &&
      !fse.pathExistsSync(path.join(BASE_DB_DIR, 'config.db'))
    ) {
      fse.copySync(
        path.join(LAST_VERSION_BASE_DB_DIR, 'config.db'),
        path.join(BASE_DB_DIR, 'config.db'),
      );
    }
  }
}

export function performSystemActions() {
  const rootPackageJson = readRootPackageJsonSync();
  const versions = globalStorage.getItem('historicalUsedVersions') ?? [];
  if (
    versions &&
    rootPackageJson.version &&
    !versions.includes(rootPackageJson.version)
  ) {
    globalStorage.setItem('historicalUsedVersions', [
      ...versions,
      rootPackageJson.version,
    ]);
  }
  globalStorage.setItem('isKungfuFirstRunning', false);
  globalStorage.setItem(
    'lastStartDateTime',
    dayjs().format('YYYY-MM-DD HH:mm:ss'),
  );
}
