/** 4장: NLOS 편향, 가림 판정, 게이팅. */
import { Vec } from './linalg';
import { Rng } from './rng';
import { normCdf, normPdf } from './stats';

export interface Box { min: Vec; max: Vec }

/** 선분 a→b 가 축 정렬 상자와 만나는가 (슬랩 방법) */
export function segmentHitsBox(a: Vec, b: Vec, box: Box): boolean {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < a.length; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return false;
    } else {
      let lo = (box.min[k] - a[k]) / d, hi = (box.max[k] - a[k]) / d;
      if (lo > hi) [lo, hi] = [hi, lo];
      t0 = Math.max(t0, lo);
      t1 = Math.min(t1, hi);
      if (t0 > t1) return false;
    }
  }
  return true;
}
/** 각 앵커까지의 직선 경로가 장애물에 가려졌는지 */
export const nlosFlags = (anchors: Vec[], p: Vec, boxes: Box[]): boolean[] =>
  anchors.map((a) => boxes.some((b) => segmentHitsBox(a, p, b)));

export interface NlosModel {
  /** LOS 거리 잡음 표준편차 [m] */
  sigma: number;
  /** NLOS 발생 확률 */
  pNlos: number;
  /** NLOS 양의 편향의 평균 [m] (지수분포) */
  biasMean: number;
}
/** 거리 측정 오차 1개: n + (NLOS이면) b,  n~N(0,σ²), b~Exp(biasMean) */
export function sampleRangeError(rng: Rng, m: NlosModel, forceNlos?: boolean): { err: number; nlos: boolean } {
  const nlos = forceNlos ?? rng.bernoulli(m.pNlos);
  return { err: rng.gauss(0, m.sigma) + (nlos ? rng.exponential(m.biasMean) : 0), nlos };
}
/**
 * TDoA 측정 오차 1개: 두 앵커 도달 오차의 차 (e_j − e_i).
 * 각 도달 오차의 잡음은 σ/√2 (차의 표준편차가 σ 가 되도록), 편향은 경로마다 독립.
 */
export function sampleTdoaError(rng: Rng, m: NlosModel, nlosI?: boolean, nlosJ?: boolean): { err: number; nlos: boolean } {
  const ni = nlosI ?? rng.bernoulli(m.pNlos), nj = nlosJ ?? rng.bernoulli(m.pNlos);
  const s = m.sigma / Math.SQRT2;
  const ei = rng.gauss(0, s) + (ni ? rng.exponential(m.biasMean) : 0);
  const ej = rng.gauss(0, s) + (nj ? rng.exponential(m.biasMean) : 0);
  return { err: ej - ei, nlos: ni || nj };
}

/** 마할라노비스 게이트: 혁신 ν, 혁신 분산 S 에 대해 ν²/S ≤ k² 이면 통과 */
export const gateAccept = (innov: number, S: number, k: number): boolean => k <= 0 || (innov * innov) / S <= k * k;

/** 지수수정 가우스(EMG) 분포 밀도: N(0,σ²) + Exp(mean m) */
export function emgPdf(x: number, sigma: number, m: number): number {
  const lam = 1 / m;
  const arg = (x / sigma - lam * sigma);
  return lam * Math.exp(0.5 * lam * lam * sigma * sigma - lam * x) * normCdf(arg);
}

/**
 * 게이트 |e| ≤ k·s 를 통과한 거리 오차의 통계 (수치 적분).
 * s = sqrt(σ² + extraVar) 는 필터가 생각하는 혁신 표준편차.
 */
export function gatedErrorStats(m: NlosModel, gateK: number, extraVar = 0) {
  const s = Math.sqrt(m.sigma * m.sigma + extraVar);
  const lim = gateK > 0 ? gateK * s : Math.max(12 * m.sigma, 12 * m.sigma + 20 * m.biasMean);
  const N = 4000;
  const h = (2 * lim) / N;
  let accLos = 0, m2Los = 0, accN = 0, m1N = 0, m2N = 0;
  for (let i = 0; i <= N; i++) {
    const x = -lim + i * h;
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2; // 심프슨
    const fl = normPdf(x, 0, m.sigma);
    const fn = m.biasMean > 0 ? emgPdf(x, m.sigma, m.biasMean) : fl;
    accLos += w * fl; m2Los += w * fl * x * x;
    accN += w * fn; m1N += w * fn * x; m2N += w * fn * x * x;
  }
  const k3 = h / 3;
  accLos *= k3; m2Los *= k3; accN *= k3; m1N *= k3; m2N *= k3;
  const p = m.pNlos;
  const accept = (1 - p) * accLos + p * accN;
  const meanAcc = (p * m1N) / accept;
  const rmsAcc = Math.sqrt(((1 - p) * m2Los + p * m2N) / accept);
  return {
    /** 전체 측정 중 게이트 통과 비율 */
    acceptRate: accept,
    /** LOS 측정의 통과 비율 */
    acceptLos: accLos,
    /** NLOS 측정의 통과 비율(새어 들어온 비율) */
    acceptNlos: accN,
    /** 통과한 측정의 평균 오차(잔여 편향) [m] */
    meanAccepted: meanAcc,
    /** 통과한 측정의 RMS 오차(유효 σ) [m] */
    rmsAccepted: rmsAcc,
  };
}

/** 후버 가중치: |ν/√S| ≤ k 이면 1, 넘으면 k/|ν/√S| (R 을 1/w 배로 키우는 것과 같다) */
export function huberWeight(innov: number, S: number, k = 1.5): number {
  const z = Math.abs(innov) / Math.sqrt(S);
  return z <= k ? 1 : k / z;
}
