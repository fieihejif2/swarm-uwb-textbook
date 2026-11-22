/** 8장: 안전 거리와 CBF(제어 장벽 함수) 안전 필터. */
import { Vec, dot, norm, vadd, vscale, vsub } from './linalg';
import { Rng } from './rng';

/** 다운워시 타원체 거리: z 축을 1/kz 로 줄인 좌표에서의 유클리드 거리 (kz ≥ 1) */
export function ellipsoidDistance(r: Vec, kz: number): number {
  return Math.sqrt(r[0] * r[0] + r[1] * r[1] + (r.length > 2 ? (r[2] / kz) ** 2 : 0));
}
const scaleZ = (v: Vec, kz: number): Vec => (v.length > 2 ? [v[0], v[1], v[2] / kz] : v.slice());
const unscaleZ = (v: Vec, kz: number): Vec => (v.length > 2 ? [v[0], v[1], v[2] * kz] : v.slice());
export const clipNorm = (v: Vec, max: number): Vec => {
  const n = norm(v);
  return n > max && n > 0 ? vscale(v, max / n) : v;
};

/** 이웃 위치 외삽: 마지막으로 받은 위치·속도와 정보 나이로 현재 위치를 추정 */
export const extrapolate = (p: Vec, v: Vec, age: number): Vec => vadd(p, vscale(v, age));

export interface CbfInput {
  /** 내 위치(추정값) */
  pSelf: Vec;
  /** 상대 위치(내가 아는 값) */
  pOther: Vec;
  /** 원래 내리려던 속도 명령 */
  uNom: Vec;
  /** 지켜야 하는 최소 거리(타원체 거리 기준) [m] */
  dMin: number;
  /** CBF 게인 α [1/s] */
  alpha: number;
  /** 수직 방향 늘림 비율 kz (다운워시). 1 이면 구. */
  kz?: number;
  vMax: number;
  /** 상대 위치 오차 한계 E [m]. 0 이면 기본(비강건) 필터. */
  E?: number;
}
export interface CbfOutput { u: Vec; active: boolean; infeasible: boolean; h: number }

/**
 * 2대 사이 CBF 안전 필터 (책임 절반씩).
 * 장벽 함수 h = ‖r‖_E − dMin (r = S(p_self − p_other), S = diag(1,1,1/kz)).
 * 기본형:   n̂ᵀ w ≥ −(α/2) h                         (w = S u, n̂ = r/‖r‖)
 * 강건형:   n̂ᵀ w − β‖w‖ ≥ −(α/2)(‖r̂‖ − E − dMin),  β = 2E/‖r̂‖
 *   · 거리를 E 만큼 줄여 본다(얼마나 가까운지 모름)
 *   · 방향이 최대 β rad 틀릴 수 있으므로 접선 속도에 벌점을 준다
 */
export function cbfFilter(inp: CbfInput): CbfOutput {
  const kz = inp.kz ?? 1, E = inp.E ?? 0;
  const r = scaleZ(vsub(inp.pSelf, inp.pOther), kz);
  const d = Math.max(norm(r), 1e-9);
  const n = vscale(r, 1 / d);
  const uNom = clipNorm(inp.uNom, inp.vMax);
  const w0 = scaleZ(uNom, kz);
  const a = (inp.alpha / 2) * (d - E - inp.dMin);
  const beta = Math.min((2 * E) / d, 0.999);
  const wn0 = dot(n, w0);
  const wt = vsub(w0, vscale(n, wn0));
  const t0 = norm(wt);
  /** 접선 속도 크기 t 일 때 필요한 최소 법선 속도 */
  const wnMin = (t: number) => (-a + beta * Math.sqrt(a * a + (1 - beta * beta) * t * t)) / (1 - beta * beta);
  if (wn0 >= wnMin(t0) - 1e-12) return { u: uNom, active: false, infeasible: false, h: d - E - inp.dMin };
  const build = (s: number): Vec => {
    const t = s * t0;
    const wn = Math.max(wn0, wnMin(t));
    return unscaleZ(vadd(vscale(n, wn), vscale(wt, s)), kz);
  };
  let u = build(1);
  let infeasible = false;
  if (norm(u) > inp.vMax + 1e-12) {
    if (norm(build(0)) > inp.vMax + 1e-12) {
      // 순수 회피로도 속도 한계를 넘는다 → 최대 속도로 멀어진다(보장 불가 상태)
      infeasible = true;
      u = clipNorm(unscaleZ(n, kz), Infinity);
      u = vscale(u, inp.vMax / Math.max(norm(u), 1e-12));
    } else {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (norm(build(mid)) <= inp.vMax) lo = mid;
        else hi = mid;
      }
      u = build(lo);
    }
  }
  return { u, active: true, infeasible, h: d - E - inp.dMin };
}

export interface CbfPairParams {
  /** 지켜야 하는 실제 최소 타원체 거리 [m] */
  dMin: number;
  kz: number;
  vMax: number;
  /** 위치 추정 오차 한계(벡터 노름) [m] */
  eps: number;
  /** 이웃 정보의 최대 나이 [s] */
  ageMax: number;
  alpha: number;
  dt: number;
  T: number;
  mode: 'off' | 'basic' | 'robust';
  /** 시작 거리 [m] */
  startDist: number;
  /** 시작 위치를 직접 지정(검증용). 없으면 시드로 무작위 생성 */
  init?: { pA: Vec; pB: Vec };
}
/** 강건 CBF 가 보장되기 위한 조건과 그때 쓸 수 있는 가장 큰 α */
export function cbfRobustDesign(p: { dMin: number; kz: number; vMax: number; eps: number; ageMax: number }) {
  const E = 2 * p.eps + p.vMax * p.ageMax; // 상대 위치 오차 한계
  const betaMax = (2 * E) / (p.dMin - E);
  const feasible = p.dMin > 3 * E;
  // 최악(실제 거리 dMin, 추정 거리 dMin − E)에서 필요한 회피 속도 αE/(1−β) ≤ vMax/kz
  const alphaMax = feasible ? (p.vMax * (1 - betaMax)) / (p.kz * E) : 0;
  return { E, betaMax, feasible, alphaMax };
}

export interface CbfPairResult {
  /** 실제 타원체 거리의 최솟값 */
  minDist: number;
  /** dMin 위반 여부 */
  violated: boolean;
  infeasibleSteps: number;
  t: number[];
  pA: Vec[];
  pB: Vec[];
  d: number[];
  /** 두 기체가 목표에 도달했는가 */
  reached: boolean;
}

/**
 * 두 기체가 서로의 자리로 가려는(정면 교차) 상황의 몬테카를로 1회.
 * 운동 모델은 속도 명령을 그대로 따르는 질점(ṗ = u, ‖u‖ ≤ vMax).
 * 위치 오차는 노름 ≤ eps 로 제한, 이웃 정보 나이는 [0, ageMax] 에서 무작위.
 */
export function simulateCbfPair(p: CbfPairParams, seed: number, record = false): CbfPairResult {
  const rng = new Rng(seed);
  const steps = Math.round(p.T / p.dt);
  const half = p.startDist / 2;
  // 교차 방향과 높이 차이를 무작위로
  const ang = rng.range(0, 2 * Math.PI);
  const dz = rng.range(-0.6, 0.6) * half;
  const off = [rng.range(-0.1, 0.1), rng.range(-0.1, 0.1), 0];
  let pA: Vec = [half * Math.cos(ang) + off[0], half * Math.sin(ang) + off[1], 1.5 + dz];
  let pB: Vec = [-half * Math.cos(ang), -half * Math.sin(ang), 1.5 - dz];
  if (p.init) { pA = p.init.pA.slice(); pB = p.init.pB.slice(); }
  const gA = pB.slice(), gB = pA.slice();
  const E = p.mode === 'robust' ? 2 * p.eps + p.vMax * p.ageMax : 0;
  const maxAgeSteps = Math.round(p.ageMax / p.dt);
  const histA: Vec[] = [], histB: Vec[] = []; // 각자가 방송한 "자기 추정 위치" 이력
  const noisy = (q: Vec) => vadd(q, rng.inBall(3, p.eps));
  let minDist = ellipsoidDistance(vsub(pA, pB), p.kz);
  let infeasibleSteps = 0;
  const out: CbfPairResult = { minDist, violated: false, infeasibleSteps: 0, t: [], pA: [], pB: [], d: [], reached: false };
  const nominal = (q: Vec, g: Vec) => clipNorm(vscale(vsub(g, q), 1.5), p.vMax);
  for (let k = 0; k < steps; k++) {
    const estA = noisy(pA), estB = noisy(pB);
    histA.push(estA); histB.push(estB);
    const ageA = Math.min(rng.int(maxAgeSteps + 1), histB.length - 1); // A 가 가진 B 정보의 나이
    const ageB = Math.min(rng.int(maxAgeSteps + 1), histA.length - 1);
    const bSeenByA = histB[histB.length - 1 - ageA];
    const aSeenByB = histA[histA.length - 1 - ageB];
    let uA = nominal(estA, gA), uB = nominal(estB, gB);
    if (p.mode !== 'off') {
      const fa = cbfFilter({ pSelf: estA, pOther: bSeenByA, uNom: uA, dMin: p.dMin, alpha: p.alpha, kz: p.kz, vMax: p.vMax, E });
      const fb = cbfFilter({ pSelf: estB, pOther: aSeenByB, uNom: uB, dMin: p.dMin, alpha: p.alpha, kz: p.kz, vMax: p.vMax, E });
      uA = fa.u; uB = fb.u;
      if (fa.infeasible) infeasibleSteps++;
      if (fb.infeasible) infeasibleSteps++;
    }
    pA = vadd(pA, vscale(uA, p.dt));
    pB = vadd(pB, vscale(uB, p.dt));
    const d = ellipsoidDistance(vsub(pA, pB), p.kz);
    if (d < minDist) minDist = d;
    if (record && k % 2 === 0) { out.t.push((k + 1) * p.dt); out.pA.push(pA.slice()); out.pB.push(pB.slice()); out.d.push(d); }
  }
  out.minDist = minDist;
  out.violated = minDist < p.dMin - 1e-9;
  out.infeasibleSteps = infeasibleSteps;
  out.reached = norm(vsub(pA, gA)) < 0.3 && norm(vsub(pB, gB)) < 0.3;
  return out;
}
