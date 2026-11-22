/** 5·6장: 칼만 필터 구성 요소. */
import { Mat, Vec, dist, eye, inv, madd, matmul, matvec, msub, symmetrize, transpose, vadd, vsub, zeros } from './linalg';

export interface KfState { x: Vec; P: Mat }

export function kfPredict(s: KfState, F: Mat, Q: Mat, Bu?: Vec): KfState {
  let x = matvec(F, s.x);
  if (Bu) x = vadd(x, Bu);
  return { x, P: symmetrize(madd(matmul(matmul(F, s.P), transpose(F)), Q)) };
}

export interface KfUpdateResult { state: KfState; innov: Vec; S: Mat; K: Mat }
/** 선형 측정 z = H x + v, v~N(0,R). 조지프 형태로 공분산을 갱신한다. */
export function kfUpdate(s: KfState, H: Mat, z: Vec, R: Mat): KfUpdateResult {
  const Ht = transpose(H);
  const S = madd(matmul(matmul(H, s.P), Ht), R);
  const K = matmul(matmul(s.P, Ht), inv(S));
  const innov = vsub(z, matvec(H, s.x));
  const x = vadd(s.x, matvec(K, innov));
  const IKH = msub(eye(s.x.length), matmul(K, H));
  const P = symmetrize(madd(matmul(matmul(IKH, s.P), transpose(IKH)), matmul(matmul(K, R), transpose(K))));
  return { state: { x, P }, innov, S, K };
}

export interface ScalarUpdateResult { state: KfState; innov: number; S: number; K: Vec; accepted: boolean; nis: number }
/**
 * 스칼라 측정 1개로 EKF 갱신 (Crazyflie 온보드 필터처럼 측정을 하나씩 넣는 방식).
 * hx: 예측 측정값 h(x), Hrow: 야코비안 행, r: 측정 분산.
 * gateK > 0 이면 ν²/S > gateK² 인 측정은 버린다. weight < 1 이면 R 을 1/weight 배 키운다(강건 갱신).
 */
export function ekfScalarUpdate(s: KfState, hx: number, Hrow: Vec, z: number, r: number, gateK = 0, weight = 1): ScalarUpdateResult {
  const PHt = matvec(s.P, Hrow);
  const rEff = r / Math.max(weight, 1e-9);
  const S = Hrow.reduce((acc, h, i) => acc + h * PHt[i], 0) + rEff;
  const innov = z - hx;
  const nis = (innov * innov) / S;
  const K = PHt.map((v) => v / S);
  if (gateK > 0 && nis > gateK * gateK) return { state: s, innov, S, K, accepted: false, nis };
  const x = s.x.map((v, i) => v + K[i] * innov);
  const n = s.x.length;
  const P = zeros(n, n);
  // 조지프 형태: (I−KH) P (I−KH)ᵀ + K r Kᵀ
  const A = eye(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] -= K[i] * Hrow[j];
  const AP = matmul(A, s.P);
  const APAt = matmul(AP, transpose(A));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] = APAt[i][j] + K[i] * rEff * K[j];
  return { state: { x, P: symmetrize(P) }, innov, S, K, accepted: true, nis };
}

/** 거리 측정 모델: h = ‖p − a‖. 상태 앞쪽 dims 개가 위치. */
export function rangeModel(x: Vec, anchor: Vec, dims: number): { h: number; H: Vec } {
  const p = x.slice(0, dims), a = anchor.slice(0, dims);
  const d = Math.max(dist(p, a), 1e-9);
  const H = new Array<number>(x.length).fill(0);
  for (let k = 0; k < dims; k++) H[k] = (p[k] - a[k]) / d;
  return { h: d, H };
}
/** TDoA 측정 모델: h = ‖p − a_j‖ − ‖p − a_i‖ */
export function tdoaModel(x: Vec, ai: Vec, aj: Vec, dims: number): { h: number; H: Vec } {
  const p = x.slice(0, dims);
  const di = Math.max(dist(p, ai.slice(0, dims)), 1e-9), dj = Math.max(dist(p, aj.slice(0, dims)), 1e-9);
  const H = new Array<number>(x.length).fill(0);
  for (let k = 0; k < dims; k++) H[k] = (p[k] - aj[k]) / dj - (p[k] - ai[k]) / di;
  return { h: dj - di, H };
}

/**
 * 등속(CV) 모델. 상태 = [p(dims), v(dims)].
 * 가속도를 평균 0, 표준편차 sigmaA 인 구간별 상수 백색잡음으로 본다:
 * Q = σ_a² [[dt⁴/4, dt³/2],[dt³/2, dt²]] (축마다).
 */
export function cvModel(dt: number, sigmaA: number, dims: number): { F: Mat; Q: Mat; B: Mat } {
  const n = 2 * dims;
  const F = eye(n), Q = zeros(n, n), B = zeros(n, dims);
  const q = sigmaA * sigmaA;
  for (let k = 0; k < dims; k++) {
    F[k][dims + k] = dt;
    Q[k][k] = (q * dt ** 4) / 4;
    Q[k][dims + k] = Q[dims + k][k] = (q * dt ** 3) / 2;
    Q[dims + k][dims + k] = q * dt * dt;
    B[k][k] = 0.5 * dt * dt;
    B[dims + k][k] = dt;
  }
  return { F, Q, B };
}

/** 리카티 반복으로 정상상태 공분산을 구한다. Pprior = F Ppost Fᵀ + Q 의 고정점. */
export function dareSteadyState(F: Mat, H: Mat, Q: Mat, R: Mat, maxIter = 100000, tol = 1e-13) {
  const n = F.length;
  let P = madd(Q, eye(n));
  const Ft = transpose(F), Ht = transpose(H);
  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const S = madd(matmul(matmul(H, P), Ht), R);
    const K = matmul(matmul(P, Ht), inv(S));
    const Ppost = msub(P, matmul(matmul(K, H), P));
    const Pn = symmetrize(madd(matmul(matmul(F, Ppost), Ft), Q));
    let diff = 0, scale = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { diff = Math.max(diff, Math.abs(Pn[i][j] - P[i][j])); scale = Math.max(scale, Math.abs(Pn[i][j])); }
    P = Pn;
    if (diff <= tol * Math.max(scale, 1e-300)) break;
  }
  const S = madd(matmul(matmul(H, P), Ht), R);
  const K = matmul(matmul(P, Ht), inv(S));
  const Ppost = symmetrize(msub(P, matmul(matmul(K, H), P)));
  return { Pprior: P, Ppost, K, iterations };
}

/** 1축 CV 필터의 정상상태 위치 추정 표준편차(갱신 직후). */
export function steadyStatePosSigma(measSigma: number, rateHz: number, sigmaA: number): number {
  if (!(measSigma > 0) || !(rateHz > 0)) return measSigma;
  const { F, Q } = cvModel(1 / rateHz, sigmaA, 1);
  const { Ppost } = dareSteadyState(F, [[1, 0]], Q, [[measSigma * measSigma]]);
  return Math.sqrt(Math.max(Ppost[0][0], 0));
}

interface HistEntry { prior: KfState; meas: { H: Mat; z: Vec; R: Mat }[]; Bu?: Vec }
/**
 * 지연된 측정을 "버퍼 후 재전파"로 처리하는 선형 칼만 필터.
 * step() 으로 한 스텝 예측하고, updateDelayed(…, stepsAgo) 로 과거 시각의 측정을 넣으면
 * 그 시각으로 되돌아가 갱신한 뒤 현재까지 다시 전파한다.
 */
export class BufferedKf {
  state: KfState;
  private hist: HistEntry[] = [];
  constructor(x0: Vec, P0: Mat, private F: Mat, private Q: Mat, private maxSteps = 200) {
    this.state = { x: x0.slice(), P: P0.map((r) => r.slice()) };
    this.hist.push({ prior: this.state, meas: [] });
  }
  /** 한 스텝 예측. Bu 는 입력 항(없으면 생략). */
  step(Bu?: Vec): void {
    this.state = kfPredict(this.state, this.F, this.Q, Bu);
    this.hist.push({ prior: this.state, meas: [], Bu });
    if (this.hist.length > this.maxSteps) this.hist.shift();
  }
  /** 지금 시각의 측정으로 갱신 */
  updateNow(H: Mat, z: Vec, R: Mat): void {
    this.hist[this.hist.length - 1].meas.push({ H, z, R });
    this.state = kfUpdate(this.state, H, z, R).state;
  }
  /** stepsAgo 스텝 전에 "측정된" 값을 지금 받았을 때의 올바른 처리 */
  updateDelayed(H: Mat, z: Vec, R: Mat, stepsAgo: number): boolean {
    const idx = this.hist.length - 1 - stepsAgo;
    if (idx < 0) return false; // 버퍼보다 오래된 측정은 버린다
    this.hist[idx].meas.push({ H, z, R });
    let s = this.hist[idx].prior;
    for (let k = idx; k < this.hist.length; k++) {
      if (k > idx) {
        s = kfPredict(s, this.F, this.Q, this.hist[k].Bu);
        this.hist[k].prior = s;
      }
      for (const m of this.hist[k].meas) s = kfUpdate(s, m.H, m.z, m.R).state;
    }
    this.state = s;
    return true;
  }
}
