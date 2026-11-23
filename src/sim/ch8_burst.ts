/**
 * 7·8장 보조: 연속 손실 확률과 연속 손실 길이의 분포.
 * a_L = P(어느 패킷에서 시작하든 L 개가 연속으로 손실). loss.ts 의 burstLengthQuantile 과 같은 전이 재귀를 쓴다
 * (L_99.9 = a_L ≤ eps 인 가장 작은 L 이 burstLengthQuantile 의 결과와 같다).
 */
import { LossParams, geStationaryBad } from './loss';

/** a[0..Lmax]: a[0] = 1, a[L] = L 개 연속 손실 확률 (정상 상태) */
export function runProbs(m: LossParams, Lmax: number): number[] {
  const a = [1];
  if (m.model === 'none') { for (let L = 1; L <= Lmax; L++) a.push(0); return a; }
  if (m.model === 'bernoulli') { for (let L = 1; L <= Lmax; L++) a.push(m.p ** L); return a; }
  const qB = geStationaryBad(m);
  let vG = (1 - qB) * m.lossGood, vB = qB * m.lossBad;
  for (let L = 1; L <= Lmax; L++) {
    a.push(vG + vB);
    const nG = (vG * (1 - m.pGB) + vB * m.pBG) * m.lossGood;
    const nB = (vG * m.pGB + vB * (1 - m.pBG)) * m.lossBad;
    vG = nG; vB = nB;
  }
  return a;
}

/** 연속 손실 길이가 정확히 L 일 확률: (a_L − 2a_{L+1} + a_{L+2}) / (a_1 − a_2) */
export function runLengthPmf(a: number[], L: number): number {
  const runs = a[1] - a[2];
  return runs > 0 ? (a[L] - 2 * a[L + 1] + a[L + 2]) / runs : 0;
}

/** 평균 연속 손실 길이: a_1 / (a_1 − a_2) */
export const meanRunLength = (a: number[]): number => (a[1] - a[2] > 0 ? a[1] / (a[1] - a[2]) : 0);

/** nPackets 개를 보내는 동안 L 보다 긴(≥ L+1) 연속 손실이 시작되는 평균 횟수: (a_{L+1} − a_{L+2})·nPackets */
export const runsLongerThan = (a: number[], L: number, nPackets: number): number => (a[L + 1] - a[L + 2]) * nPackets;
