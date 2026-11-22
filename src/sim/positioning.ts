/** 2장: 거리/시간차 → 위치. 가우스-뉴턴과 DOP. */
import { Mat, Vec, dist, inv, matmul, norm, solveVec, transpose, vadd, vsub } from './linalg';

export interface GnOptions { maxIter?: number; tol?: number; dims?: 2 | 3 }
export interface GnResult { x: Vec; iterations: number; converged: boolean; path: Vec[]; cost: number }

function gnSolve(
  residualAndJac: (x: Vec) => { r: Vec; J: Mat },
  x0: Vec,
  opts: GnOptions = {},
): GnResult {
  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-10;
  let x = x0.slice();
  const path: Vec[] = [x.slice()];
  const costOf = (r: Vec) => 0.5 * r.reduce((s, v) => s + v * v, 0);
  let { r, J } = residualAndJac(x);
  let cost = costOf(r);
  let converged = false;
  let it = 0;
  for (; it < maxIter; it++) {
    const Jt = transpose(J);
    const JtJ = matmul(Jt, J);
    const g = Jt.map((row) => row.reduce((s, v, k) => s + v * r[k], 0));
    // 아주 작은 감쇠(수치 안정용). 순수 가우스-뉴턴과 사실상 같다.
    for (let i = 0; i < JtJ.length; i++) JtJ[i][i] += 1e-12;
    let dx: Vec;
    try {
      dx = solveVec(JtJ, g.map((v) => -v));
    } catch {
      break;
    }
    // 비용이 줄지 않으면 스텝을 절반씩 줄인다(백트래킹).
    let step = 1;
    let xn = vadd(x, dx);
    let next = residualAndJac(xn);
    let cn = costOf(next.r);
    while (cn > cost && step > 1e-6) {
      step *= 0.5;
      xn = vadd(x, dx.map((v) => v * step));
      next = residualAndJac(xn);
      cn = costOf(next.r);
    }
    const moved = norm(vsub(xn, x));
    x = xn;
    r = next.r;
    J = next.J;
    cost = cn;
    path.push(x.slice());
    if (moved < tol) {
      converged = true;
      it++;
      break;
    }
  }
  return { x, iterations: it, converged, path, cost };
}

/** 거리 측정(TWR)으로 위치 추정: min Σ (‖x − a_i‖ − r_i)² */
export function gaussNewtonRange(anchors: Vec[], ranges: number[], x0: Vec, opts: GnOptions = {}): GnResult {
  const dims = x0.length;
  return gnSolve((x) => {
    const r: Vec = [], J: Mat = [];
    for (let i = 0; i < anchors.length; i++) {
      if (!Number.isFinite(ranges[i])) continue;
      const a = anchors[i].slice(0, dims);
      const d = Math.max(dist(x, a), 1e-9);
      r.push(d - ranges[i]);
      J.push(x.map((xi, k) => (xi - a[k]) / d));
    }
    return { r, J };
  }, x0, opts);
}

/** TDoA 로 위치 추정: 측정 z_k = ‖x − a_j‖ − ‖x − a_i‖, pairs[k] = [i, j] */
export function gaussNewtonTdoa(anchors: Vec[], pairs: [number, number][], tdoas: number[], x0: Vec, opts: GnOptions = {}): GnResult {
  const dims = x0.length;
  return gnSolve((x) => {
    const r: Vec = [], J: Mat = [];
    for (let k = 0; k < pairs.length; k++) {
      if (!Number.isFinite(tdoas[k])) continue;
      const ai = anchors[pairs[k][0]].slice(0, dims), aj = anchors[pairs[k][1]].slice(0, dims);
      const di = Math.max(dist(x, ai), 1e-9), dj = Math.max(dist(x, aj), 1e-9);
      r.push(dj - di - tdoas[k]);
      J.push(x.map((xi, m) => (xi - aj[m]) / dj - (xi - ai[m]) / di));
    }
    return { r, J };
  }, x0, opts);
}

export type Pairing = 'ring' | 'all' | 'ref0';
/** TDoA 에 쓰는 앵커 쌍 목록. ring: (i, i+1), all: 모든 쌍, ref0: (0, j) */
export function pairsFor(n: number, pairing: Pairing): [number, number][] {
  const out: [number, number][] = [];
  if (pairing === 'ring') for (let i = 0; i < n; i++) out.push([i, (i + 1) % n]);
  else if (pairing === 'ref0') for (let j = 1; j < n; j++) out.push([0, j]);
  else for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

export interface Dop { pdop: number; hdop: number; vdop: number; xdop: number; ydop: number; gdop: number }
const INF_DOP: Dop = { pdop: Infinity, hdop: Infinity, vdop: Infinity, xdop: Infinity, ydop: Infinity, gdop: Infinity };

function dopFromH(H: Mat, posDims = 3): Dop {
  let Q: Mat;
  try {
    Q = inv(matmul(transpose(H), H));
  } catch {
    return INF_DOP;
  }
  for (let i = 0; i < Q.length; i++) if (!(Q[i][i] > 0) || !Number.isFinite(Q[i][i]) || Q[i][i] > 1e12) return INF_DOP;
  const qx = Q[0][0], qy = Q[1][1], qz = posDims >= 3 ? Q[2][2] : 0;
  let all = 0;
  for (let i = 0; i < Q.length; i++) all += Q[i][i];
  return {
    pdop: Math.sqrt(qx + qy + qz), hdop: Math.sqrt(qx + qy), vdop: Math.sqrt(qz),
    xdop: Math.sqrt(qx), ydop: Math.sqrt(qy), gdop: Math.sqrt(all),
  };
}

/** 거리 측정 기하행렬(각 행 = 앵커→태그 단위벡터). TWR 은 시계 미지수가 없어 GDOP = PDOP. */
export function rangeGeometry(anchors: Vec[], p: Vec): Mat {
  return anchors.map((a) => {
    const d = Math.max(dist(p, a), 1e-9);
    return p.map((x, k) => (x - a[k]) / d);
  });
}
export const dopRange = (anchors: Vec[], p: Vec): Dop => dopFromH(rangeGeometry(anchors, p));

/** TDoA 쌍 기하행렬(각 행 = e_j − e_i). 쌍마다 독립인 잡음 σ 를 가정한 DOP. */
export function tdoaGeometry(anchors: Vec[], p: Vec, pairs: [number, number][]): Mat {
  const E = rangeGeometry(anchors, p);
  return pairs.map(([i, j]) => E[j].map((v, k) => v - E[i][k]));
}
export const dopTdoa = (anchors: Vec[], p: Vec, pairing: Pairing = 'ring'): Dop =>
  dopFromH(tdoaGeometry(anchors, p, pairsFor(anchors.length, pairing)));

/** 의사거리(위치 3 + 시계 오프셋 1) 형태의 GDOP. GPS 교과서의 정의와 같다. */
export function dopPseudorange(anchors: Vec[], p: Vec): Dop {
  const H = rangeGeometry(anchors, p).map((r) => [...r, 1]);
  return dopFromH(H);
}

export function dopFor(mode: 'twr' | 'tdoa', anchors: Vec[], p: Vec, pairing: Pairing = 'ring'): Dop {
  return mode === 'twr' ? dopRange(anchors, p) : dopTdoa(anchors, p, pairing);
}

/** 평면 격자에서 DOP 지도를 계산한다(히트맵용). 반환값은 행=y, 열=x. */
export function dopGrid(
  mode: 'twr' | 'tdoa', anchors: Vec[], hall: { x: number; y: number }, z: number, nx: number, ny: number,
  which: keyof Dop = 'pdop', pairing: Pairing = 'ring',
): { xs: number[]; ys: number[]; values: number[][] } {
  const xs = Array.from({ length: nx }, (_, i) => ((i + 0.5) / nx) * hall.x);
  const ys = Array.from({ length: ny }, (_, j) => ((j + 0.5) / ny) * hall.y);
  const values = ys.map((y) => xs.map((x) => dopFor(mode, anchors, [x, y, z], pairing)[which]));
  return { xs, ys, values };
}

/** 점이 앵커들의 축 정렬 경계 상자 안에 있는가 (TDoA "앵커가 둘러싼 공간"의 간단한 판정) */
export function insideAnchorBox(anchors: Vec[], p: Vec, dims = 3): boolean {
  for (let k = 0; k < dims; k++) {
    const lo = Math.min(...anchors.map((a) => a[k])), hi = Math.max(...anchors.map((a) => a[k]));
    if (p[k] < lo || p[k] > hi) return false;
  }
  return true;
}
