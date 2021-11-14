import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const { _pm2 } = require('__gUtils/processUtils');

const baseDaemonDataObserver = new Subject();


_pm2.launchBus((err, pm2_bus) => {
    if (err) {
        console.log(err)
    }
    pm2_bus.on('process:msg', (packet) => {  
        baseDaemonDataObserver.next(packet.data || {})
    })
})


export const buildKungfuGlobalDataPipeByDaemon = () => {
    return baseDaemonDataObserver
        .pipe(
            filter(packet => {
                const { type } = packet || {};
                return type === "DEAMON_GLOBAL_DATA"
            }),
            map(packet => {
                const { body } = packet || {};
                return body.data
            })
        )
}