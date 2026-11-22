/**
 * 4장 데모용 계산 (순수 TypeScript, DOM 없음).
 *  - 가림 기하(어느 경로가 막혔는가)가 정해졌을 때의 측정 오차 표본과 이론 밀도
 *  - 예측값 기준 마할라노비스 게이트로 측정을 거른 뒤 / 거르지 않고 푼 위치의 비교
 *  - 게이트 통계(gatedErrorStats)의 몬테카를로 대조
 * 기존 엔진(nlos.ts, positioning.ts, kf.ts)의 함수만 조합한다.
 */
import { rangeModel, tdoaModel } from './kf';
import { Vec, dist } from './linalg';
import { Box, NlosModel, emgPdf, gateAccept, sampleRangeError, sampleTdoaError } from './nlos';
import { gaussNewtonRange, gaussNewtonTdoa, pairsFor } from './positioning';
import { Rng } from './rng';
import { normPdf } from './stats';

/** 바닥에 놓인 상자 장애물: 중심 (cx, cy), 가로 w(x 방향), 세로 d(y 방향), 높이 h */
export const obstacleBox = (cx: number, cy: number, w: number, d: number, h: number): Box =>
  ({ min: [cx - w / 2, cy - d / 2, 0], max: [cx + w / 2, cy + d / 2, h] });

/** 거리 오차의 이론 밀도: LOS 는 N(0,σ²), NLOS 는 지수수정 가우스 */
export const rangeErrorPdf = (x: number, sigma: number, biasMean: number, nlos: boolean): number =>
  nlos && biasMean > 0 ? emgPdf(x, sigma, biasMean) : normPdf(x, 0, sigma);

/**
 * TDoA 오차 e = e_j − e_i 의 이론 밀도 (잡음의 합은 N(0,σ²)).
 *  j 만 가림: +Exp → emg(x),  i 만 가림: −Exp → emg(−x),
 *  둘 다: 두 지수분포의 차(라플라스) = 반반 섞임 → ½[emg(x) + emg(−x)]
 */
export function tdoaErrorPdf(x: number, sigma: number, biasMean: number, nlosI: boolean, nlosJ: boolean): number {
  if (!(biasMean > 0) || (!nlosI && !nlosJ)) return normPdf(x, 0, sigma);
  if (nlosI && nlosJ) return 0.5 * (emgPdf(x, sigma, biasMean) + emgPdf(-x, sigma, biasMean));
  return nlosJ ? emgPdf(x, sigma, biasMean) : emgPdf(-x, sigma, biasMean);
}

/** 경로의 가림 여부가 정해진 거리 오차 표본 n 개 */
export function sampleRangeErrors(m: NlosModel, nlos: boolean, n: number, seed: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sampleRangeError(rng, m, nlos).err);
}
/** 두 경로의 가림 여부가 정해진 TDoA 오차 표본 n 개 */
export function sampleTdoaErrors(m: NlosModel, nlosI: boolean, nlosJ: boolean, n: number, seed: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sampleTdoaError(rng, m, nlosI, nlosJ).err);
}

export interface FixCompareParams {
  anchors: Vec[];
  /** 태그의 참 위치 [m] */
  p: Vec;
  /** 앵커별 가림 여부 (nlosFlags 의 결과) */
  flags: boolean[];
  mode: 'twr' | 'tdoa';
  /** sigma, biasMean 만 쓴다 (가림은 flags 가 정한다) */
  model: NlosModel;
  /** 게이트 문턱(σ). 0 이면 끔 */
  gateK: number;
  /** 필터 예측 위치의 불확실성 1σ(축당) [m] */
  predSigma: number;
  n: number;
  seed: number;
}
export interface FixCompareResult {
  /** 게이트 없이 푼 위치의 오차 벡터 (추정 − 참) */
  off: Vec[];
  /** 게이트를 통과한 측정만으로 푼 위치의 오차 벡터 */
  on: Vec[];
  /** 가려진 경로가 낀 측정 수 / 그중 버려진 수 */
  nlosTotal: number;
  nlosRejected: number;
  /** 가려지지 않은 측정 수 / 그중 버려진 수 */
  losTotal: number;
  losRejected: number;
  /** 남은 측정이 4개 미만이라 예측값을 그대로 쓴 횟수 */
  coasted: number;
}
/**
 * 같은 측정 묶음을 (a) 전부 써서, (b) 예측값 기준 게이트를 통과한 것만 써서 가우스-뉴턴으로 푼다.
 * 예측값은 참 위치 + N(0, predSigma²) (필터가 직전 추정에서 예측한 위치를 흉내 낸 것).
 * 혁신 분산은 S = predSigma²·‖H‖² + σ².
 */
export function compareGatedFixes(prm: FixCompareParams): FixCompareResult {
  const rng = new Rng(prm.seed);
  const pairs = pairsFor(prm.anchors.length, 'ring');
  const out: FixCompareResult = { off: [], on: [], nlosTotal: 0, nlosRejected: 0, losTotal: 0, losRejected: 0, coasted: 0 };
  const r = prm.model.sigma ** 2, pv = prm.predSigma ** 2;
  for (let t = 0; t < prm.n; t++) {
    const pred = prm.p.map((v) => v + rng.gauss(0, prm.predSigma));
    let z: number[], gated: number[], blocked: boolean[];
    const models: { h: number; H: Vec }[] = [];
    if (prm.mode === 'twr') {
      z = prm.anchors.map((a, i) => dist(prm.p, a) + sampleRangeError(rng, prm.model, prm.flags[i]).err);
      blocked = prm.flags.slice();
      prm.anchors.forEach((a) => models.push(rangeModel(pred, a, 3)));
    } else {
      z = pairs.map(([i, j]) => dist(prm.p, prm.anchors[j]) - dist(prm.p, prm.anchors[i]) + sampleTdoaError(rng, prm.model, prm.flags[i], prm.flags[j]).err);
      blocked = pairs.map(([i, j]) => prm.flags[i] || prm.flags[j]);
      pairs.forEach(([i, j]) => models.push(tdoaModel(pred, prm.anchors[i], prm.anchors[j], 3)));
    }
    gated = z.map((zi, q) => {
      const S = pv * models[q].H.reduce((s, h) => s + h * h, 0) + r;
      const ok = gateAccept(zi - models[q].h, S, prm.gateK);
      if (blocked[q]) { out.nlosTotal++; if (!ok) out.nlosRejected++; } else { out.losTotal++; if (!ok) out.losRejected++; }
      return ok ? zi : NaN;
    });
    const solve = (meas: number[]): Vec => {
      if (meas.filter(Number.isFinite).length < 4) { out.coasted++; return pred; }
      return (prm.mode === 'twr' ? gaussNewtonRange(prm.anchors, meas, pred) : gaussNewtonTdoa(prm.anchors, pairs, meas, pred)).x;
    };
    out.off.push(solve(z).map((v, k) => v - prm.p[k]));
    out.on.push(solve(gated).map((v, k) => v - prm.p[k]));
  }
  return out;
}

export interface GateMcResult { acceptLos: number[]; acceptNlos: number[]; rms: number[]; mean: number[] }
/**
 * gatedErrorStats 의 몬테카를로 대조: 오차 n 개(확률 pNlos 로 NLOS)를 뽑아
 * 문턱 ks 마다 |e| ≤ k·σ 를 통과한 것의 비율·RMS·평균을 센다. k ≤ 0 은 게이트 끔.
 */
export function gateMonteCarlo(m: NlosModel, ks: number[], n: number, seed: number): GateMcResult {
  const rng = new Rng(seed);
  const errs = new Float64Array(n), nl = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const s = sampleRangeError(rng, m); errs[i] = s.err; nl[i] = s.nlos ? 1 : 0; }
  const out: GateMcResult = { acceptLos: [], acceptNlos: [], rms: [], mean: [] };
  for (const k of ks) {
    let nLos = 0, nN = 0, aLos = 0, aN = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const ok = gateAccept(errs[i], m.sigma * m.sigma, k);
      if (nl[i]) { nN++; if (ok) aN++; } else { nLos++; if (ok) aLos++; }
      if (ok) { s1 += errs[i]; s2 += errs[i] * errs[i]; }
    }
    const a = aLos + aN;
    out.acceptLos.push(nLos ? aLos / nLos : NaN);
    out.acceptNlos.push(nN ? aN / nN : NaN);
    out.rms.push(a ? Math.sqrt(s2 / a) : NaN);
    out.mean.push(a ? s1 / a : NaN);
  }
  return out;
}

/**
 * 옆에서 본 그림용: 선분 a→p 를 바닥에 내린 그림자가 상자의 바닥 면적 위를 지나는 구간 [t0, t1] (0 = a, 1 = p).
 * 지나지 않으면 null. (가림 판정 자체는 nlos.ts 의 segmentHitsBox 가 3차원으로 한다.)
 */
export function footprintSpan(a: Vec, p: Vec, box: Box): [number, number] | null {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 2; k++) {
    const d = p[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return null;
    } else {
      let lo = (box.min[k] - a[k]) / d, hi = (box.max[k] - a[k]) / d;
      if (lo > hi) [lo, hi] = [hi, lo];
      t0 = Math.max(t0, lo);
      t1 = Math.min(t1, hi);
      if (t0 > t1) return null;
    }
  }
  return [t0, t1];
}
