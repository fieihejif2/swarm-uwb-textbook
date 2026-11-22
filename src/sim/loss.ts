/** 7장: 패킷 손실 모델. */
import { Rng } from './rng';

export interface LossParams {
  model: 'none' | 'bernoulli' | 'ge';
  /** 베르누이 손실 확률 */
  p: number;
  /** 길버트-엘리엇: Good→Bad 전이 확률(패킷당) */
  pGB: number;
  /** Bad→Good 전이 확률(패킷당) */
  pBG: number;
  /** Good 상태에서의 손실 확률 */
  lossGood: number;
  /** Bad 상태에서의 손실 확률 */
  lossBad: number;
}
export const NO_LOSS: LossParams = { model: 'none', p: 0, pGB: 0, pBG: 1, lossGood: 0, lossBad: 1 };

/** 패킷 하나가 손실되었는지 차례로 알려주는 상태 기계 */
export class LossProcess {
  private bad = false;
  constructor(private prm: LossParams, private rng: Rng) {
    if (prm.model === 'ge') this.bad = rng.bernoulli(geStationaryBad(prm));
  }
  /** true = 손실 */
  next(): boolean {
    const m = this.prm;
    if (m.model === 'none') return false;
    if (m.model === 'bernoulli') return this.rng.bernoulli(m.p);
    const lost = this.rng.bernoulli(this.bad ? m.lossBad : m.lossGood);
    this.bad = this.bad ? !this.rng.bernoulli(m.pBG) : this.rng.bernoulli(m.pGB);
    return lost;
  }
  get inBadState(): boolean { return this.bad; }
}

/** 길버트-엘리엇 사슬의 정상상태 Bad 확률 π_B = pGB / (pGB + pBG) */
export const geStationaryBad = (m: LossParams): number => (m.pGB + m.pBG > 0 ? m.pGB / (m.pGB + m.pBG) : 0);
/** 정상상태 평균 손실률 */
export function stationaryLossRate(m: LossParams): number {
  if (m.model === 'none') return 0;
  if (m.model === 'bernoulli') return m.p;
  const pb = geStationaryBad(m);
  return (1 - pb) * m.lossGood + pb * m.lossBad;
}
/** Bad 상태 평균 지속 길이(패킷 수) = 1/pBG */
export const geMeanBadLength = (m: LossParams): number => 1 / m.pBG;

export function simulateLoss(m: LossParams, n: number, seed: number): Uint8Array {
  const proc = new LossProcess(m, new Rng(seed));
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = proc.next() ? 1 : 0;
  return out;
}
/** 연속 손실 길이들의 목록 */
export function lossRunLengths(seq: ArrayLike<number>): number[] {
  const runs: number[] = [];
  let run = 0;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i]) run++;
    else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);
  return runs;
}
/**
 * 임의의 패킷에서 시작해 L개가 연속으로 손실될 확률이 eps 이하가 되는 가장 작은 L.
 * 베르누이: P(L개 연속 손실) = p^L.  GE(lossBad=1, lossGood=0 근사): π_B (1−pBG)^(L−1).
 */
export function burstLengthQuantile(m: LossParams, eps = 1e-3): number {
  if (m.model === 'none') return 0;
  const rate = stationaryLossRate(m);
  if (rate <= 0) return 0;
  if (m.model === 'bernoulli') return rate >= 1 ? Infinity : Math.max(0, Math.ceil(Math.log(eps) / Math.log(rate)));
  // GE: 수치적으로 정확한 연속 손실 확률을 전이행렬로 계산
  let vG = (1 - geStationaryBad(m)) * m.lossGood, vB = geStationaryBad(m) * m.lossBad; // 첫 패킷 손실 & 그때의 상태
  for (let L = 1; L < 100000; L++) {
    if (vG + vB <= eps) return L;
    const nG = (vG * (1 - m.pGB) + vB * m.pBG) * m.lossGood;
    const nB = (vG * m.pGB + vB * (1 - m.pBG)) * m.lossBad;
    vG = nG; vB = nB;
  }
  return Infinity;
}
