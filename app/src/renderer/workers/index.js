import CalcMarketDataAvgVolumeWorker from 'worker-loader!@/workers/calcMarketDataAvgVolume.js';
import GetLogWorker from 'worker-loader!@/workers/getLog.js';
import DealInstruments from 'worker-loader!@/workers/dealInstruments.js';

export default {
  calcMarketDataAvgVolumeWorker: new CalcMarketDataAvgVolumeWorker(),
  getLogWorker: new GetLogWorker(),
  dealInstruments: new DealInstruments(),
};
