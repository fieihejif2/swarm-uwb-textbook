import { FusionParams, simulateFusion } from '../fusion';
import { McExperiment } from './types';

export const experiment: McExperiment<FusionParams> = {
  id: 'fusion',
  run(p, seed) {
    const r = simulateFusion({ ...p, seed });
    return { rmse: r.rmse, rmseH: r.rmseH, rmseV: r.rmseV, meanNis: r.meanNis, rejectRatio: r.total ? r.rejected / r.total : 0 };
  },
};
