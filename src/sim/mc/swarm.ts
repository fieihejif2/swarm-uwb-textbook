import { SystemConfig } from '../config';
import { ScenarioOptions, StageFlags, swarmFromConfig } from '../scenario';
import { simulateSwarm } from '../swarm';
import { McExperiment } from './types';

export interface SwarmMcParams { cfg: SystemConfig; stage: StageFlags; opt?: ScenarioOptions }
export const experiment: McExperiment<SwarmMcParams> = {
  id: 'swarm',
  run(p, seed) {
    const r = simulateSwarm({ ...swarmFromConfig(p.cfg, p.stage, { ...p.opt, seed }), recordEvery: 1e9 });
    return { minDist: r.minDistOverall, steadyError: r.steadyError, collided: r.firstCollisionTime === null ? 0 : 1 };
  },
};
