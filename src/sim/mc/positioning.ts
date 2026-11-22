import { Vec, dist } from '../linalg';
import { NlosModel, sampleRangeError, sampleTdoaError } from '../nlos';
import { gaussNewtonRange, gaussNewtonTdoa, pairsFor } from '../positioning';
import { Rng } from '../rng';
import { McExperiment } from './types';

export interface PositioningMcParams { anchors: Vec[]; p: Vec; mode: 'twr' | 'tdoa'; nlos: NlosModel }
/** 한 지점에서 측정 한 바퀴로 위치를 풀었을 때의 오차 */
export const experiment: McExperiment<PositioningMcParams> = {
  id: 'positioning',
  run(prm, seed) {
    const rng = new Rng(seed);
    const x0 = prm.p.map((v) => v + rng.range(-1, 1));
    let x: Vec;
    if (prm.mode === 'twr') {
      x = gaussNewtonRange(prm.anchors, prm.anchors.map((a) => dist(prm.p, a) + sampleRangeError(rng, prm.nlos).err), x0).x;
    } else {
      const pairs = pairsFor(prm.anchors.length, 'ring');
      x = gaussNewtonTdoa(prm.anchors, pairs, pairs.map(([i, j]) => dist(prm.p, prm.anchors[j]) - dist(prm.p, prm.anchors[i]) + sampleTdoaError(rng, prm.nlos).err), x0).x;
    }
    const e = x.map((v, k) => v - prm.p[k]);
    return { errH: Math.hypot(e[0], e[1]), errV: Math.abs(e[2]), err: Math.hypot(e[0], e[1], e[2]), ex: e[0], ey: e[1], ez: e[2] };
  },
};
