/**
 * 6장: 앵커 좌표를 잘못 알고 있을 때 생기는 위치 편향.
 * "참" 앵커에서 잡음 없는 측정을 만들고, 시스템이 "믿는" 앵커 좌표로 위치를 풀어 그 차이를 본다.
 * 순수 TypeScript (DOM 없음). 개념 모델이며 Crazyflie 펌웨어의 동작을 재현하지 않는다.
 */
import { Mat, Vec, dist, inv, matmul, transpose } from './linalg';
import { gaussNewtonRange, gaussNewtonTdoa, pairsFor, rangeGeometry, tdoaGeometry } from './positioning';
import { Rng } from './rng';

export type Mode = 'twr' | 'tdoa';
export type Blunder = 'none' | 'swap-ids' | 'height' | 'swap-xy';

/** 축마다 독립인 N(0, σ²) 측량 오차를 더한 "믿는" 앵커 좌표 */
export function perturbAnchors(anchors: Vec[], sigma: number, seed: number): Vec[] {
  const rng = new Rng(seed);
  return anchors.map((a) => a.map((v) => v + rng.gauss(0, sigma)));
}

/** 흔한 큰 실수를 "믿는" 좌표에 적용한다. 앵커가 3개 이상이라고 가정한다. */
export function applyBlunder(believed: Vec[], kind: Blunder): Vec[] {
  const b = believed.map((a) => a.slice());
  if (kind === 'swap-ids') [b[0], b[1]] = [b[1], b[0]]; // 앵커 0 과 1 의 좌표를 서로 바꿔 입력
  else if (kind === 'height') b[2][2] += 0.3; // 앵커 2 의 높이를 30 cm 높게 입력
  else if (kind === 'swap-xy') [b[1][0], b[1][1]] = [b[1][1], b[1][0]]; // 앵커 1 의 x, y 를 바꿔 입력
  return b;
}

/**
 * 한 지점 p 에서의 위치 편향 벡터(믿는 앵커로 푼 위치 − 참 위치).
 * 풀지 못했거나 해가 limit [m] 보다 멀리 달아나면(좌표가 서로 모순되어 반복이 발산) NaN.
 */
export function surveyBiasAt(trueAnchors: Vec[], believed: Vec[], mode: Mode, p: Vec, limit = 50): Vec {
  let x: Vec;
  if (mode === 'twr') {
    x = gaussNewtonRange(believed, trueAnchors.map((a) => dist(p, a)), p).x;
  } else {
    const pairs = pairsFor(trueAnchors.length, 'ring');
    x = gaussNewtonTdoa(believed, pairs, pairs.map(([i, j]) => dist(p, trueAnchors[j]) - dist(p, trueAnchors[i])), p).x;
  }
  const e = x.map((v, k) => v - p[k]);
  return e.every(Number.isFinite) && Math.hypot(e[0], e[1], e[2]) <= limit ? e : [NaN, NaN, NaN];
}

export interface BiasField {
  xs: number[]; ys: number[];
  /** 수평 편향 크기 [m], 행 = y, 열 = x */
  horiz: number[][];
  /** 편향 벡터 [m] */
  vec: Vec[][];
  meanH: number; maxH: number; rmsH: number; meanV: number; maxV: number;
  /** 풀지 못한(발산한) 격자점 수와 전체 격자점 수 */
  failed: number; total: number;
}
/** 비행 높이 z 의 평면 격자에서 편향을 계산한다. */
export function biasField(trueAnchors: Vec[], believed: Vec[], mode: Mode, hall: { x: number; y: number }, z: number, nx: number, ny: number): BiasField {
  const xs = Array.from({ length: nx }, (_, i) => ((i + 0.5) / nx) * hall.x);
  const ys = Array.from({ length: ny }, (_, j) => ((j + 0.5) / ny) * hall.y);
  const vec = ys.map((y) => xs.map((x) => surveyBiasAt(trueAnchors, believed, mode, [x, y, z])));
  const horiz = vec.map((row) => row.map((e) => Math.hypot(e[0], e[1])));
  const hs = horiz.flat().filter(Number.isFinite), vs = vec.flat().map((e) => Math.abs(e[2])).filter(Number.isFinite);
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  return {
    xs, ys, horiz, vec,
    meanH: avg(hs), maxH: hs.length ? Math.max(...hs) : NaN, rmsH: Math.sqrt(avg(hs.map((v) => v * v))),
    meanV: avg(vs), maxV: vs.length ? Math.max(...vs) : NaN,
    failed: nx * ny - hs.length, total: nx * ny,
  };
}

/**
 * 선형 이론: 앵커마다 축당 σ 의 독립 오차가 있을 때 위치 편향의 RMS.
 * 앵커 i 의 좌표 오차 δa_i 는 그 앵커까지의 거리 예측을 −e_i·δa_i 만큼 바꾼다(e_i = 앵커→태그 단위벡터, 분산 σ²).
 * TWR: 측정 오차가 앵커마다 독립 → 공분산 σ²(HᵀH)⁻¹ (= DOP·σ).
 * TDoA: 쌍 (i, j) 의 오차는 ε_j − ε_i 라 이웃한 쌍끼리 상관이 있다 → 공분산 σ² G D Dᵀ Gᵀ, G = (HᵀH)⁻¹Hᵀ.
 */
export function surveyBiasTheory(anchors: Vec[], mode: Mode, p: Vec, sigma: number): { rmsH: number; rmsV: number; rmsX: number; rmsY: number } {
  let C: Mat;
  try {
    if (mode === 'twr') {
      const H = rangeGeometry(anchors, p);
      C = inv(matmul(transpose(H), H));
    } else {
      const pairs = pairsFor(anchors.length, 'ring');
      const H = tdoaGeometry(anchors, p, pairs);
      const G = matmul(inv(matmul(transpose(H), H)), transpose(H));
      const D: Mat = pairs.map(([i, j]) => anchors.map((_, k) => (k === j ? 1 : 0) - (k === i ? 1 : 0)));
      const GD = matmul(G, D);
      C = matmul(GD, transpose(GD));
    }
  } catch {
    return { rmsH: Infinity, rmsV: Infinity, rmsX: Infinity, rmsY: Infinity };
  }
  return { rmsH: sigma * Math.sqrt(C[0][0] + C[1][1]), rmsV: sigma * Math.sqrt(C[2][2]), rmsX: sigma * Math.sqrt(C[0][0]), rmsY: sigma * Math.sqrt(C[1][1]) };
}

/**
 * "평균을 내도 남는 것": 한 지점에서 위치를 N 번 풀어 평균했을 때의 수평 오차.
 * 매번 측정 잡음(σ_meas)은 새로 뽑지만 믿는 앵커 좌표(편향의 원인)는 그대로다.
 * 같은 실험을 runs 번 반복해(잡음만 다르게) 누적 평균 오차의 RMS 를 낸다.
 * 반복은 두 번씩 짝을 지어 두 번째는 첫 번째 잡음의 부호를 뒤집어 쓴다(대조 변량법: 적은 반복으로도 편향×잡음 교차항이 지워진다).
 * 반환: N = 1..nMax 에 대한 수평 오차 RMS [m] 와 그 지점의 편향 크기.
 */
export function averagingExperiment(trueAnchors: Vec[], believed: Vec[], mode: Mode, p: Vec, sigmaMeas: number, nMax: number, seed: number, runs = 1): { n: number[]; err: number[]; biasH: number } {
  const pairs = pairsFor(trueAnchors.length, 'ring');
  const n = Array.from({ length: nMax }, (_, k) => k + 1);
  const sq = new Array<number>(nMax).fill(0);
  for (let r = 0; r < runs; r++) {
    const rng = new Rng(seed + 7919 * Math.floor(r / 2));
    const sign = r % 2 ? -1 : 1;
    let sx = 0, sy = 0;
    for (let k = 1; k <= nMax; k++) {
      const x = mode === 'twr'
        ? gaussNewtonRange(believed, trueAnchors.map((a) => dist(p, a) + sign * rng.gauss(0, sigmaMeas)), p).x
        : gaussNewtonTdoa(believed, pairs, pairs.map(([i, j]) => dist(p, trueAnchors[j]) - dist(p, trueAnchors[i]) + sign * rng.gauss(0, sigmaMeas)), p).x;
      sx += x[0] - p[0]; sy += x[1] - p[1];
      sq[k - 1] += (sx / k) ** 2 + (sy / k) ** 2;
    }
  }
  const b = surveyBiasAt(trueAnchors, believed, mode, p);
  return { n, err: sq.map((v) => Math.sqrt(v / runs)), biasH: Math.hypot(b[0], b[1]) };
}
