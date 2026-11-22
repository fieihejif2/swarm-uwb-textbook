import { sampleSigmaAr1 } from '../ch9_measure';
import { Rng } from '../rng';
import { McExperiment } from './types';

export interface SigmaMcParams {
  /** 로그의 표본 수 */
  n: number;
  /** 이웃한 표본끼리의 상관계수 (0 = 서로 독립) */
  rho: number;
}
/** "표본 n 개로 σ 를 재면 얼마나 맞을까": 참 σ = 1 인 정규 표본 n 개에서 추정한 σ̂ */
export const experiment: McExperiment<SigmaMcParams> = {
  id: 'ch9-sigma',
  run(prm, seed) {
    const ratio = sampleSigmaAr1(Math.max(2, Math.round(prm.n)), prm.rho ?? 0, new Rng(seed));
    return { ratio, errPct: Math.abs(ratio - 1) * 100 };
  },
};
