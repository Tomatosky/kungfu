import { remote } from 'electron'
import { logger } from '__gUtils/logUtils';
const { dialog } = remote;

process
    .on('unhandledRejection', (reason, p) => {
        console.error(reason, 'Unhandled Rejection', p);
        logger.error(reason, 'Unhandled Rejection', p);
    })
    .on('uncaughtException', (err) => {
        console.error('Uncaught Exception thrown', err);
        logger.error('Uncaught Exception thrown', err);

        if (!window.AFTER_APP_MOUNTED) {
            dialog.showErrorBox('错误', err, a, b)
        } 
    });

