/** 7장: 지연이 있는 합의 프로토콜의 고정 스텝 시뮬레이션. */
import { Mat } from './linalg';
import { laplacian } from './graph';

export interface ConsensusParams {
  /** 인접행렬 */
  A: Mat;
  x0: number[];
  gain: number;
  /** 지연 [s]. dt 의 정수배로 반올림된다. */
  tau: number;
  dt: number;
  T: number;
  /**
   * symmetric: ẋ_i = k Σ a_ij (x_j(t−τ) − x_i(t−τ))   — 자기 상태도 지연(중앙집중 루프)
   * neighborOnly: ẋ_i = k Σ a_ij (x_j(t−τ) − x_i(t))  — 이웃 정보만 지연(온보드 분산)
   */
  mode?: 'symmetric' | 'neighborOnly';
  recordEvery?: number;
}
export interface ConsensusResult {
  t: number[];
  /** x[r][i]: r번째 기록 시각의 i번 에이전트 상태 */
  x: number[][];
  /** 불일치 노름 ‖x − mean(x)‖ */
  disagreement: number[];
  delaySteps: number;
}

export function simulateConsensus(p: ConsensusParams): ConsensusResult {
  const n = p.x0.length;
  const L = laplacian(p.A);
  const deg = p.A.map((r) => r.reduce((s, v) => s + v, 0));
  const d = Math.max(0, Math.round(p.tau / p.dt));
  const steps = Math.round(p.T / p.dt);
  const every = p.recordEvery ?? Math.max(1, Math.round(steps / 2000));
  const mode = p.mode ?? 'symmetric';
  // 원형 버퍼에 과거 상태를 저장. t ≤ 0 구간은 초기값으로 채운다.
  const buf: Float64Array[] = Array.from({ length: d + 1 }, () => Float64Array.from(p.x0));
  let head = 0; // buf[head] = 현재 상태
  const t: number[] = [], xs: number[][] = [], dis: number[] = [];
  const record = (k: number, x: Float64Array) => {
    let m = 0;
    for (let i = 0; i < n; i++) m += x[i];
    m /= n;
    let s = 0;
    for (let i = 0; i < n; i++) s += (x[i] - m) * (x[i] - m);
    t.push(k * p.dt);
    xs.push(Array.from(x));
    dis.push(Math.sqrt(s));
  };
  record(0, buf[head]);
  const kdt = p.gain * p.dt;
  for (let k = 1; k <= steps; k++) {
    const cur = buf[head];
    const old = buf[(head + 1) % (d + 1)]; // d 스텝 전 상태 (d=0 이면 cur)
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let u = 0;
      if (mode === 'symmetric') {
        for (let j = 0; j < n; j++) u -= L[i][j] * old[j];
      } else {
        for (let j = 0; j < n; j++) if (p.A[i][j] !== 0) u += p.A[i][j] * old[j];
        u -= deg[i] * cur[i];
      }
      next[i] = cur[i] + kdt * u;
    }
    head = (head + 1) % (d + 1);
    buf[head] = next;
    if (k % every === 0) record(k, next);
    if (!Number.isFinite(next[0]) || Math.abs(next[0]) > 1e150) break;
  }
  return { t, x: xs, disagreement: dis, delaySteps: d };
}

/** 불일치가 커지고 있는가: 뒤쪽 1/4 구간의 최댓값이 가운데 1/4 구간의 최댓값보다 큰지 본다. */
export function isDiverging(res: ConsensusResult): boolean {
  const n = res.disagreement.length;
  if (!Number.isFinite(res.disagreement[n - 1])) return true;
  const peak = (a: number, b: number) => {
    let m = 0;
    for (let i = Math.floor(a * n); i < Math.floor(b * n); i++) m = Math.max(m, res.disagreement[i]);
    return m;
  };
  return peak(0.75, 1.0) > peak(0.5, 0.75);
}

/**
 * 시뮬레이션에서 발산이 시작되는 지연을 이분법으로 찾는다(지연은 dt 의 정수배).
 * 반환값: 수렴하는 가장 큰 지연과 발산하는 가장 작은 지연의 중간값.
 */
export function findCriticalDelay(p: Omit<ConsensusParams, 'tau'>, tauMax: number): { tau: number; lo: number; hi: number } {
  let lo = 0, hi = Math.round(tauMax / p.dt);
  const diverges = (d: number) => isDiverging(simulateConsensus({ ...p, tau: d * p.dt, recordEvery: 20 }));
  if (!diverges(hi)) return { tau: Infinity, lo: hi * p.dt, hi: Infinity };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (diverges(mid)) hi = mid;
    else lo = mid;
  }
  return { tau: ((lo + hi) / 2) * p.dt, lo: lo * p.dt, hi: hi * p.dt };
}
