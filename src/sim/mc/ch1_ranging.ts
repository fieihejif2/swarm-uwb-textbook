import { twrEstimates, twrStamps } from '../ch1_ranging';
import { Rng } from '../rng';
import { McExperiment } from './types';

export interface Ch1RangingParams {
  /** 실제 거리 [m] */
  d: number;
  /** 응답 지연 [s]: reply1 은 B(앵커) 시계, reply2 는 A(태그) 시계 */
  reply1: number;
  reply2: number;
  /** 클럭 주파수 오차 (비율) */
  eA: number;
  eB: number;
  /** 타임스탬프 하나의 오차 표준편차 [s] */
  sigmaT: number;
}
/** DS-TWR 교환 한 번: 타임스탬프 6개에 평균 0 인 정규분포 오차를 더하고 거리 오차를 돌려준다 */
export const experiment: McExperiment<Ch1RangingParams> = {
  id: 'ch1-ranging',
  run(p, seed) {
    const rng = new Rng(seed);
    const noise = Array.from({ length: 6 }, () => rng.gauss(0, p.sigmaT));
    const est = twrEstimates(twrStamps(p.d, p.reply1, p.reply2, { eA: p.eA, eB: p.eB }, { noise }));
    const errDs = est.dDs - p.d, errSs = est.dSs - p.d;
    return { errDs, errSs, errDsCm: errDs * 100, errSsCm: errSs * 100 };
  },
};
