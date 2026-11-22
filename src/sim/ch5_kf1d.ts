/**
 * 5장: 1차원 등속(CV) 칼만 필터 실험.
 *  - simulateKf1d: Q/R 튜닝 데모(참값·측정·추정·필터가 믿는 σ)
 *  - mismatchedSteadyState: 필터의 가정(Q, R)이 실제와 다를 때 "믿는 σ" 와 "실제 σ" (이론)
 *  - simulateDelayed1d: 지연된 측정을 세 가지 방식으로 처리했을 때의 오차
 * 순수 TypeScript. 필터 연산은 모두 kf.ts 의 것을 쓴다.
 */
import { BufferedKf, KfState, cvModel, dareSteadyState, kfPredict, kfUpdate } from './kf';
import { Mat, eye, madd, matmul, msub, transpose } from './linalg';
import { Rng } from './rng';

const H1: Mat = [[1, 0]];

/** 데모용 기동: 멈춤 → 이동 → 멈춤을 되풀이한다. 구간마다 코사인으로 부드럽게 잇는다. [m] */
const WAYPOINTS: [number, number][] = [[0, 0], [2, 0], [5, 1.5], [8, 1.5], [10, 0.5], [13, 0.5], [17, 2], [20, 2]];
export function maneuverPos(t: number): number {
  if (t <= WAYPOINTS[0][0]) return WAYPOINTS[0][1];
  for (let i = 1; i < WAYPOINTS.length; i++) {
    const [t0, a] = WAYPOINTS[i - 1], [t1, b] = WAYPOINTS[i];
    if (t <= t1) return a + ((b - a) * (1 - Math.cos((Math.PI * (t - t0)) / (t1 - t0)))) / 2;
  }
  return WAYPOINTS[WAYPOINTS.length - 1][1];
}
/** 위 기동의 가속도 크기 RMS [m/s²] (0~20 s, 수치 계산) */
export function maneuverAccelRms(): number {
  let s = 0, n = 0;
  const h = 0.01;
  for (let t = h; t < 20 - h; t += h) {
    const a = (maneuverPos(t + h) - 2 * maneuverPos(t) + maneuverPos(t - h)) / (h * h);
    s += a * a; n++;
  }
  return Math.sqrt(s / n);
}

export interface Kf1dParams {
  /** 측정(=필터 스텝) 주기의 역수 [Hz] */
  rate: number;
  T: number;
  /** 실제 측정 노이즈 1σ [m] */
  sigmaZTrue: number;
  /** 필터가 가정하는 측정 노이즈 1σ [m] (R = σ²) */
  sigmaZFilter: number;
  /** 필터가 가정하는 가속도 노이즈 1σ [m/s²] (Q) */
  sigmaAFilter: number;
  /** maneuver: 정해진 기동. random: 필터 모델과 같은 꼴의 무작위 가속(스텝마다 일정, 1σ = sigmaATrue) */
  truth: 'maneuver' | 'random';
  sigmaATrue: number;
  seed: number;
}
export interface Kf1dResult {
  t: number[];
  truth: number[];
  z: number[];
  est: number[];
  /** 갱신 직후 위치 공분산의 제곱근 = 필터가 믿는 1σ [m] */
  sigma: number[];
  /** 앞쪽 2초를 뺀 추정 오차 RMS [m] */
  rmse: number;
  /** 같은 구간의 측정 오차 RMS [m] */
  rmseMeas: number;
  /** 평균 NIS (ν²/S). 일관된 필터면 1 근처 */
  meanNis: number;
  /** 마지막 스텝의 칼만 이득 [K_p, K_v] */
  K: number[];
}

export function simulateKf1d(p: Kf1dParams): Kf1dResult {
  const rng = new Rng(p.seed);
  const dt = 1 / p.rate;
  const n = Math.round(p.T * p.rate);
  const { F, Q } = cvModel(dt, p.sigmaAFilter, 1);
  const R: Mat = [[p.sigmaZFilter ** 2]];
  const out: Kf1dResult = { t: [], truth: [], z: [], est: [], sigma: [], rmse: 0, rmseMeas: 0, meanNis: 0, K: [0, 0] };
  let pos = p.truth === 'maneuver' ? maneuverPos(0) : 0, vel = 0;
  let s: KfState = { x: [pos + rng.gauss(0, p.sigmaZTrue), 0], P: [[p.sigmaZFilter ** 2, 0], [0, 1]] };
  let se = 0, sm = 0, cnt = 0, nisSum = 0;
  for (let k = 1; k <= n; k++) {
    const t = k * dt;
    if (p.truth === 'maneuver') pos = maneuverPos(t);
    else {
      const a = rng.gauss(0, p.sigmaATrue);
      pos += vel * dt + 0.5 * a * dt * dt;
      vel += a * dt;
    }
    const z = pos + rng.gauss(0, p.sigmaZTrue);
    s = kfPredict(s, F, Q);
    const u = kfUpdate(s, H1, [z], R);
    s = u.state;
    out.t.push(t); out.truth.push(pos); out.z.push(z); out.est.push(s.x[0]); out.sigma.push(Math.sqrt(Math.max(s.P[0][0], 0)));
    out.K = [u.K[0][0], u.K[1][0]];
    if (t > 2) {
      se += (s.x[0] - pos) ** 2; sm += (z - pos) ** 2; nisSum += (u.innov[0] * u.innov[0]) / u.S[0][0]; cnt++;
    }
  }
  out.rmse = Math.sqrt(se / Math.max(cnt, 1)); out.rmseMeas = Math.sqrt(sm / Math.max(cnt, 1)); out.meanNis = nisSum / Math.max(cnt, 1);
  return out;
}

/**
 * 정상상태에서 필터가 "믿는" 위치 σ 와 "실제" 위치 오차 σ.
 * 필터는 (sigmaAFilter, sigmaZFilter) 로 이득 K 를 정하고, 세계는 (sigmaATrue, sigmaZTrue) 로 움직인다.
 * 실제 오차 e 는 e⁺ = (I − KH)(F e + w) − K v 를 따르므로 그 공분산의 고정점을 반복으로 구한다.
 */
export function mismatchedSteadyState(rate: number, sigmaATrue: number, sigmaZTrue: number, sigmaAFilter: number, sigmaZFilter: number) {
  const dt = 1 / rate;
  const f = cvModel(dt, sigmaAFilter, 1), w = cvModel(dt, sigmaATrue, 1);
  const ss = dareSteadyState(f.F, H1, f.Q, [[sigmaZFilter ** 2]], 20000, 1e-12);
  const K = ss.K;
  const A = msub(eye(2), matmul(K, H1)), At = transpose(A), Ft = transpose(f.F);
  const KRK = matmul(K, transpose(K)).map((r) => r.map((v) => v * sigmaZTrue ** 2));
  let P = ss.Ppost, Pp = ss.Pprior;
  for (let i = 0; i < 20000; i++) {
    Pp = madd(matmul(matmul(f.F, P), Ft), w.Q);
    const Pn = madd(matmul(matmul(A, Pp), At), KRK);
    const diff = Math.abs(Pn[0][0] - P[0][0]) + Math.abs(Pn[1][1] - P[1][1]);
    P = Pn;
    if (diff <= 1e-12 * (Math.abs(P[0][0]) + Math.abs(P[1][1]))) break;
  }
  return {
    believed: Math.sqrt(Math.max(ss.Ppost[0][0], 0)),
    actual: Math.sqrt(Math.max(P[0][0], 0)),
    K: [K[0][0], K[1][0]],
    /** 기대 NIS = 실제 혁신 분산 / 필터가 믿는 혁신 분산 */
    nis: (Pp[0][0] + sigmaZTrue ** 2) / (ss.Pprior[0][0] + sigmaZFilter ** 2),
  };
}

export interface Delay1dParams {
  /** 표적 속도 [m/s]. 전반은 +v, 후반은 −v 로 움직인다 */
  v: number;
  /** 측정 지연 [s] (dt 의 정수배로 반올림) */
  tau: number;
  /** 필터 스텝 [s] */
  dt: number;
  /** 몇 스텝마다 측정하는가 */
  measEvery: number;
  T: number;
  sigmaZ: number;
  sigmaA: number;
  seed: number;
}
export interface Delay1dResult {
  t: number[];
  /** 추정 − 참값 [m] */
  errNaive: number[];
  errBuffered: number[];
  errIdeal: number[];
  /** 이론: 수신 시각에 융합하면 −v·τ (움직이는 방향의 뒤쪽) */
  biasTheory: number[];
  /** 전반 정상 구간(T/4 ~ T/2)의 평균 오차 [m] */
  meanNaive: number;
  meanBuffered: number;
  meanIdeal: number;
  rmsNaive: number;
  rmsBuffered: number;
  rmsIdeal: number;
  delaySteps: number;
}

/** 지연 τ 뒤에 도착하는 위치 측정을 (a) 받은 시각에 융합 (b) 버퍼 후 재전파 (c) 지연이 없었다면 — 세 필터로 비교 */
export function simulateDelayed1d(p: Delay1dParams): Delay1dResult {
  const rng = new Rng(p.seed);
  const n = Math.round(p.T / p.dt);
  const d = Math.max(0, Math.round(p.tau / p.dt));
  const { F, Q } = cvModel(p.dt, p.sigmaA, 1);
  const R: Mat = [[p.sigmaZ ** 2]];
  const half = p.T / 2;
  const truth = (t: number) => (t <= half ? p.v * t : p.v * half - p.v * (t - half));
  const x0 = [0, p.v], P0: Mat = [[p.sigmaZ ** 2, 0], [0, 0.25]];
  const mk = () => new BufferedKf(x0, P0, F, Q, Math.max(200, d + 5));
  const naive = mk(), buffered = mk(), ideal = mk();
  const pending: { arrive: number; z: number }[] = [];
  const out: Delay1dResult = {
    t: [], errNaive: [], errBuffered: [], errIdeal: [], biasTheory: [],
    meanNaive: 0, meanBuffered: 0, meanIdeal: 0, rmsNaive: 0, rmsBuffered: 0, rmsIdeal: 0, delaySteps: d,
  };
  const acc = { n: 0, a: 0, b: 0, c: 0, a2: 0, b2: 0, c2: 0, m: 0 };
  for (let k = 1; k <= n; k++) {
    const t = k * p.dt;
    naive.step(); buffered.step(); ideal.step();
    if (k % p.measEvery === 0) {
      const z = truth(t) + rng.gauss(0, p.sigmaZ);
      ideal.updateNow(H1, [z], R);
      pending.push({ arrive: k + d, z });
    }
    while (pending.length && pending[0].arrive <= k) {
      const m = pending.shift()!;
      naive.updateNow(H1, [m.z], R);          // (a) 받은 시각의 측정인 것처럼
      buffered.updateDelayed(H1, [m.z], R, d); // (b) 측정된 시각으로 되돌아가 갱신하고 다시 전파
    }
    const tr = truth(t);
    const ea = naive.state.x[0] - tr, eb = buffered.state.x[0] - tr, ec = ideal.state.x[0] - tr;
    out.t.push(t); out.errNaive.push(ea); out.errBuffered.push(eb); out.errIdeal.push(ec);
    out.biasTheory.push(t <= half ? -p.v * d * p.dt : p.v * d * p.dt);
    if (t > p.T / 4 && t <= half) { acc.n++; acc.a += ea; acc.b += eb; acc.c += ec; acc.a2 += ea * ea; acc.b2 += eb * eb; acc.c2 += ec * ec; }
  }
  const m = Math.max(acc.n, 1);
  out.meanNaive = acc.a / m; out.meanBuffered = acc.b / m; out.meanIdeal = acc.c / m;
  out.rmsNaive = Math.sqrt(acc.a2 / m); out.rmsBuffered = Math.sqrt(acc.b2 / m); out.rmsIdeal = Math.sqrt(acc.c2 / m);
  return out;
}
