import { Mode, perturbAnchors, surveyBiasAt } from '../ch6_survey';
import { Vec } from '../linalg';
import { McExperiment } from './types';

export interface SurveyMcParams {
  /** 참 앵커 좌표 [m] */
  anchors: Vec[];
  mode: Mode;
  /** 편향을 볼 지점 [m] */
  p: Vec;
  /** 앵커 좌표 측량 오차 1σ(축당) [m] */
  sigma: number;
  /** 이웃 기체까지의 수평 간격 [m] (상대 편향 계산용, x 방향으로 떨어져 있다고 본다) */
  spacing: number;
}
/** 앵커를 한 번 측량(=오차 한 벌)했을 때 한 지점에 생기는 위치 편향. 결과 단위는 cm. */
export const experiment: McExperiment<SurveyMcParams> = {
  id: 'ch6-survey',
  run(prm, seed) {
    const believed = perturbAnchors(prm.anchors, prm.sigma, seed);
    const b = surveyBiasAt(prm.anchors, believed, prm.mode, prm.p);
    const q = [prm.p[0] + prm.spacing, prm.p[1], prm.p[2]];
    const b2 = surveyBiasAt(prm.anchors, believed, prm.mode, q);
    return {
      biasH: 100 * Math.hypot(b[0], b[1]), biasV: 100 * Math.abs(b[2]), bx: 100 * b[0], by: 100 * b[1], bz: 100 * b[2],
      // 두 기체의 편향 차이(= 간격에 생기는 오차)
      relH: 100 * Math.hypot(b2[0] - b[0], b2[1] - b[1]),
    };
  },
};
