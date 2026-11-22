import { simulateConsensus } from '../consensus';
import { GraphKind, adjacency } from '../graph';
import { Rng } from '../rng';
import { McExperiment } from './types';

export interface ConsensusMcParams { graph: GraphKind; n: number; gain: number; tau: number; T: number; dt: number; mode: 'symmetric' | 'neighborOnly'; threshold: number }
/** 무작위 초기값에서 불일치가 처음의 threshold 배 아래로 내려가는 데 걸리는 시간 */
export const experiment: McExperiment<ConsensusMcParams> = {
  id: 'consensus',
  run(p, seed) {
    const rng = new Rng(seed);
    const x0 = Array.from({ length: p.n }, () => rng.range(-1, 1));
    const r = simulateConsensus({ A: adjacency(p.graph, p.n), x0, gain: p.gain, tau: p.tau, dt: p.dt, T: p.T, mode: p.mode, recordEvery: 5 });
    const d0 = r.disagreement[0];
    let settle = NaN;
    for (let i = r.disagreement.length - 1; i >= 0; i--) {
      if (!(r.disagreement[i] <= p.threshold * d0)) { settle = i + 1 < r.t.length ? r.t[i + 1] : NaN; break; }
      if (i === 0) settle = 0;
    }
    return { settleTime: settle, finalRatio: r.disagreement[r.disagreement.length - 1] / d0 };
  },
};
