import { CbfPairParams, simulateCbfPair } from '../safety';
import { McExperiment } from './types';

export const experiment: McExperiment<CbfPairParams> = {
  id: 'cbfPair',
  run(p, seed) {
    const r = simulateCbfPair(p, seed);
    return { minDist: r.minDist, violated: r.violated ? 1 : 0, infeasible: r.infeasibleSteps, reached: r.reached ? 1 : 0 };
  },
};
