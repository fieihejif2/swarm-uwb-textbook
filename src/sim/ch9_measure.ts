/**
 * 9장: 측정 로그를 다루는 데 필요한 보조 계산.
 * (CSV 파싱과 기본 피팅은 logfit.ts 에 있다. 여기에는 형식 검사, 추세 제거 잔차, 유효 표본 수,
 *  NLOS 꼬리 피팅, "정지 시험에서 보일 σ" 예측과 역산, 함정 실험실용 합성 로그가 있다.)
 * 순수 TypeScript — DOM·브라우저 API 를 쓰지 않는다.
 */
import { positionRate } from './budget';
import { SystemConfig, sanitizeConfig } from './config';
import { cvModel, dareSteadyState, steadyStatePosSigma } from './kf';
import { Vec, dist, madd, matmul, msub, transpose } from './linalg';
import { CsvTable, column, missingColumns, parseCsv, synthLatencyLog, synthRangeLog, synthStaticLog } from './logfit';
import { gatedErrorStats } from './nlos';
import { dopFor, insideAnchorBox } from './positioning';
import { Rng } from './rng';
import { linfit, mean, quantile, std } from './stats';

export type LogKind = 'static' | 'range' | 'latency';
/** 로그 종류별 필수 열 이름(소문자) */
export const LOG_COLUMNS: Record<LogKind, string[]> = {
  static: ['t', 'x', 'y', 'z'],
  range: ['t', 'anchor_id', 'range_m'],
  latency: ['seq', 't_send', 't_recv'],
};
/** 피팅에 필요한 최소 줄 수 (그보다 적으면 표준편차·분위수가 의미 없다) */
export const MIN_ROWS: Record<LogKind, number> = { static: 10, range: 10, latency: 10 };

export type LogError = 'empty' | 'missing-columns' | 'no-rows' | 'too-few-rows';
export interface LogWarning { code: 'time-not-increasing' | 'negative-rtt' | 'duplicate-seq' | 'non-integer-seq' | 'zero-duration'; count: number }
export interface LogCheck {
  ok: boolean;
  error: LogError | null;
  table: CsvTable;
  /** 없어서 문제가 된 열 이름 */
  missing: string[];
  rows: number;
  skipped: number;
  warnings: LogWarning[];
}

/** CSV 글자를 읽어 형식을 검사한다. ok 가 true 일 때만 logfit.ts 의 fit* 함수를 불러야 한다. */
export function checkLog(kind: LogKind, text: string): LogCheck {
  const table = parseCsv(text);
  const base = { table, rows: table.rows.length, skipped: table.skipped, warnings: [] as LogWarning[] };
  if (!table.header.length) return { ...base, ok: false, error: 'empty', missing: [] };
  const missing = missingColumns(table, LOG_COLUMNS[kind]);
  if (missing.length) return { ...base, ok: false, error: 'missing-columns', missing };
  if (!table.rows.length) return { ...base, ok: false, error: 'no-rows', missing: [] };
  if (table.rows.length < MIN_ROWS[kind]) return { ...base, ok: false, error: 'too-few-rows', missing: [] };
  const warn = (code: LogWarning['code'], count: number) => { if (count > 0) base.warnings.push({ code, count }); };
  if (kind === 'latency') {
    const seq = column(table, 'seq')!, ts = column(table, 't_send')!, tr = column(table, 't_recv')!;
    warn('negative-rtt', ts.filter((s, i) => tr[i] - s < 0).length);
    warn('duplicate-seq', seq.length - new Set(seq).size);
    warn('non-integer-seq', seq.filter((s) => !Number.isInteger(s)).length);
  } else {
    const t = column(table, 't')!;
    let back = 0;
    for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1]) back++;
    warn('time-not-increasing', back);
    if (!(Math.max(...t) > Math.min(...t))) warn('zero-duration', 1);
  }
  return { ...base, ok: true, error: null, missing: [] };
}

/** 최소제곱 직선을 빼고 남은 잔차. 시간은 첫 표본 기준으로 옮겨 계산한다(큰 유닉스 시각에서도 수치적으로 안전). */
export function detrendSeries(t: number[], x: number[]): { resid: number[]; slope: number; intercept: number; trend: number[] } {
  const t0 = t[0] ?? 0;
  const tt = t.map((v) => v - t0);
  const f = linfit(tt, x);
  const ok = Number.isFinite(f.b);
  const slope = ok ? f.b : 0, intercept = ok ? f.a : mean(x);
  const trend = tt.map((v) => intercept + slope * v);
  return { resid: x.map((v, i) => v - trend[i]), slope, intercept, trend };
}

/** 이웃한 표본끼리의 상관계수(시차 1 자기상관) */
export function lag1(x: number[]): number {
  const m = mean(x);
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) {
    den += (x[i] - m) ** 2;
    if (i + 1 < x.length) num += (x[i] - m) * (x[i + 1] - m);
  }
  return den > 0 ? num / den : 0;
}
/**
 * σ 추정에 쓸 수 있는 "독립 표본 수"의 어림값.
 * 표본이 AR(1) 처럼 이웃과 ρ 만큼 닮아 있고 정규분포이면 x² 의 자기상관은 ρ² 이므로
 * 표본분산의 분산이 (1+ρ²)/(1−ρ²) 배 커진다 → n_eff = n (1−ρ²)/(1+ρ²).
 */
export function effectiveN(n: number, rho: number): number {
  const r2 = Math.min(0.999999, Math.max(0, rho) ** 2);
  return Math.max(2, (n * (1 - r2)) / (1 + r2));
}
/** σ̂ 의 상대 표준오차 ≈ 1/√(2(n−1)) (독립 정규 표본 n 개) */
export const sigmaRelStdErr = (n: number): number => (n > 1 ? 1 / Math.sqrt(2 * (n - 1)) : Infinity);
/** σ 를 상대오차 rel (1σ 신뢰) 안으로 알기 위한 독립 표본 수: n = 1 + 1/(2 rel²) */
export const samplesForSigma = (rel: number): number => 1 + 1 / (2 * rel * rel);

/** 받은 순번 목록 → 첫 순번부터 마지막 순번까지의 손실 수열 (1 = 빠진 순번) */
export function lossSequence(seq: number[]): { first: number; last: number; lost: number[] } {
  if (!seq.length) return { first: 0, last: -1, lost: [] };
  const first = Math.min(...seq), last = Math.max(...seq);
  const got = new Set(seq);
  const lost: number[] = [];
  for (let s = first; s <= last; s++) lost.push(got.has(s) ? 0 : 1);
  return { first, last, lost };
}

export interface RangeGroup { anchor: number; t: number[]; r: number[]; median: number; robustSigma: number; resid: number[] }
/** 거리 로그를 앵커별로 묶고, 앵커마다 중앙값을 뺀 잔차를 만든다 */
export function rangeGroups(tbl: CsvTable): RangeGroup[] {
  const t = column(tbl, 't')!, id = column(tbl, 'anchor_id')!, r = column(tbl, 'range_m')!;
  const map = new Map<number, { t: number[]; r: number[] }>();
  id.forEach((a, i) => {
    if (!map.has(a)) map.set(a, { t: [], r: [] });
    const g = map.get(a)!;
    g.t.push(t[i]); g.r.push(r[i]);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([anchor, g]) => {
    const median = quantile(g.r, 0.5);
    const resid = g.r.map((v) => v - median);
    return { anchor, t: g.t, r: g.r, median, robustSigma: quantile(resid.map(Math.abs), 0.5) * 1.4826, resid };
  });
}

/**
 * 양의 꼬리에서 NLOS 모델(확률 p 로 평균 m 인 지수분포 편향이 더해진다)을 거칠게 피팅한다.
 * 문턱 c = 3·σ_robust 를 넘는 잔차만 본다. 지수분포는 "기억이 없으므로" 문턱을 넘은 양의 평균 초과분이 곧 m 이고,
 * 문턱을 넘을 확률은 p·e^{−c/m} 이다 → m̂ = 평균(잔차 − c | 잔차 > c),  p̂ = (넘은 비율)·e^{c/m̂}.
 * (정규 잡음이 3σ 를 넘는 0.13 % 는 빼 준다. 표본이 적으면 매우 거친 값이다.)
 */
export function fitNlosTail(groups: { resid: number[]; robustSigma: number }[]): { n: number; nOut: number; ratio: number; threshold: number; biasMean: number; pNlos: number } {
  let n = 0, nOut = 0, excess = 0, thrSum = 0;
  for (const g of groups) {
    const c = 3 * g.robustSigma;
    n += g.resid.length;
    thrSum += c * g.resid.length;
    if (!(c > 0)) continue;
    for (const v of g.resid) if (v > c) { nOut++; excess += v - c; }
  }
  const threshold = n ? thrSum / n : NaN;
  const ratio = n ? nOut / n : NaN;
  const GAUSS_TAIL = 0.00135; // P(z > 3)
  const net = Math.max(0, ratio - GAUSS_TAIL);
  if (nOut < 3 || !(net > 0)) return { n, nOut, ratio, threshold, biasMean: 0, pNlos: 0 };
  const biasMean = excess / nOut;
  const pNlos = Math.min(1, net * Math.exp(threshold / biasMean));
  return { n, nOut, ratio, threshold, biasMean, pNlos };
}

/**
 * 정지한 기체에서 보일 추정값의 흔들림(1축, 1σ).
 * 정상상태 칼만 게인 K 로 도는 필터에 측정 잡음만 들어갈 때의 출력 분산:
 *   e⁺ = (I − K H) F e + K v   →   Σ = A Σ Aᵀ + K R Kᵀ,  A = (I − K H) F
 * 비행 중 추정 오차 σ_est(= √P∞⁺) 에는 여기에 "모델이 못 따라가는 몫"(프로세스 노이즈)이 더해지므로 σ_static ≤ σ_est.
 */
export function staticOutputSigma(measSigma: number, rateHz: number, sigmaA: number): number {
  if (!(measSigma > 0) || !(rateHz > 0)) return measSigma;
  const { F, Q } = cvModel(1 / rateHz, sigmaA, 1);
  const H = [[1, 0]];
  const R = [[measSigma * measSigma]];
  const { K } = dareSteadyState(F, H, Q, R);
  const A = matmul(msub([[1, 0], [0, 1]], matmul(K, H)), F);
  const At = transpose(A);
  const KRK = matmul(matmul(K, R), transpose(K));
  let S = KRK;
  for (let i = 0; i < 200000; i++) {
    const Sn = madd(matmul(matmul(A, S), At), KRK);
    const diff = Math.abs(Sn[0][0] - S[0][0]);
    S = Sn;
    if (diff <= 1e-14 * Math.max(S[0][0], 1e-300)) break;
  }
  return Math.sqrt(Math.max(S[0][0], 0));
}

export interface StaticPrediction {
  hdop: number; vdop: number; sigmaEff: number; posRate: number;
  /** 정지 시험에서 보일 흔들림 [m] */
  staticH: number; staticV: number;
  /** 같은 지점에서 비행 중 추정 오차(예산의 σ_est 와 같은 식) [m] */
  flightH: number; flightV: number;
  /** 시험 지점이 앵커가 둘러싼 상자 안인가 */
  inside: boolean;
}
/** 현재 설정의 모델이 "지점 p 에 세워 둔 기체"에 대해 예측하는 값들. measSigma 를 주면 그 값으로 바꿔 계산한다. */
export function predictStatic(cfg: SystemConfig, p: Vec, measSigma?: number): StaticPrediction {
  const sigma = measSigma ?? (cfg.uwb.mode === 'twr' ? cfg.uwb.sigmaTwr : cfg.uwb.sigmaTdoa);
  const sigmaEff = gatedErrorStats({ sigma, pNlos: cfg.uwb.pNlos, biasMean: cfg.uwb.nlosBiasMean }, cfg.uwb.gateSigma).rmsAccepted;
  const dop = dopFor(cfg.uwb.mode, cfg.anchors, p);
  const posRate = positionRate(cfg);
  const q = cfg.estimation.accelNoise;
  return {
    hdop: dop.hdop, vdop: dop.vdop, sigmaEff, posRate,
    // 수평은 오차 예산(budget.ts 의 sigmaEstH)과 같은 규약: 두 축 합 σ_H 를 축마다 σ_H/√2 로 나눠 1축 식을 적용한 뒤 √2 배
    staticH: Math.SQRT2 * staticOutputSigma((dop.hdop * sigmaEff) / Math.SQRT2, posRate, q), staticV: staticOutputSigma(dop.vdop * sigmaEff, posRate, q),
    flightH: Math.SQRT2 * steadyStatePosSigma((dop.hdop * sigmaEff) / Math.SQRT2, posRate, q), flightV: steadyStatePosSigma(dop.vdop * sigmaEff, posRate, q),
    inside: insideAnchorBox(cfg.anchors, p),
  };
}
/**
 * 역산: 지점 p 의 정지 시험에서 잰 수평 흔들림 measuredH 를 모델이 그대로 내놓게 하는 측정 노이즈 σ 를 이분법으로 찾는다.
 * 찾을 수 없으면(범위 밖) NaN.
 */
export function calibrateMeasSigma(cfg: SystemConfig, p: Vec, measuredH: number, model: 'static' | 'flight' = 'static'): number {
  if (!(measuredH > 0)) return NaN;
  // static: σ_a 를 "모르는 움직임"으로 보는 해석(정지 중에는 없음) / flight: σ_a 를 가속도계 잡음으로 보는 해석(정지 중에도 있음)
  const f = (s: number) => (model === 'static' ? predictStatic(cfg, p, s).staticH : predictStatic(cfg, p, s).flightH);
  let lo = 1e-4, hi = 5;
  if (!(f(lo) < measuredH) || !(f(hi) > measuredH)) return NaN;
  for (let i = 0; i < 50; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) < measuredH) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * 민감도(9장·리포트)에서 설정 하나를 "크게" 바꾼 값. 보통은 2배.
 * 확률(0~1)은 2배가 1 을 넘을 수 있으므로 min(2p, (1 + p)/2): 2배와 "1 까지 남은 거리의 절반" 중 작은 쪽(p ≤ 1/3 이면 2배와 같다).
 */
export function sensitivityValue(v: number, isProbability: boolean): number {
  return isProbability ? Math.min(2 * v, (1 + v) / 2) : 2 * v;
}

/** 설정의 한 경로를 바꾼 사본(전역 상태는 건드리지 않는다). "반영하면 어떻게 되나" 미리 보기용. */
export function withPath(cfg: SystemConfig, path: string, value: unknown): SystemConfig {
  const next = structuredClone(cfg) as any;
  const keys = path.split('.');
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  return sanitizeConfig(next).config;
}

/**
 * 편도 지연이 서로 독립인 U(μ−J, μ+J) 두 개이면 왕복의 절반은 μ ± J 의 삼각분포를 따른다.
 * 그 분포의 95 % 분위수는 μ + (1 − √0.1) J 이므로 (위쪽 꼬리 넓이 (J − x)²/(2J²) = 0.05 에서),
 * "p5 ~ p95 폭의 절반" w 를 (1 − √0.1) 로 나누면 편도의 균등 지터 J 가 된다.
 */
export const TRI_Q95 = 1 - Math.sqrt(0.1);
export const jitterFromHalfWidth = (halfWidth: number): number => halfWidth / TRI_Q95;
/**
 * 앵커별 편향(중앙값 − 실제 거리)에서 "앵커마다 다른" 몫의 크기를 어림한다.
 * 모든 앵커에 공통인 몫(안테나 지연 보정, NLOS 가 중앙값을 미는 몫)은 평균으로 빼고,
 * 중앙값 추정 자체의 흔들림(표준오차 ≈ 1.2533 σ/√n) 분산도 뺀다.
 */
export function anchorBiasSpread(bias: number[], robustSigma: number[], n: number[]): { common: number; spread: number; raw: number } {
  const k = bias.length;
  if (k < 2) return { common: NaN, spread: NaN, raw: NaN };
  const common = mean(bias);
  const raw = Math.sqrt(bias.reduce((s, v) => s + (v - common) ** 2, 0) / (k - 1));
  const seVar = mean(robustSigma.map((s, i) => (1.2533 * s) ** 2 / Math.max(1, n[i])));
  return { common, spread: Math.sqrt(Math.max(0, raw * raw - seVar)), raw };
}

/** 두 독립 균등분포 U(μ−J, μ+J) 의 평균이 따르는 삼각분포의 밀도 (왕복/2 의 모델) */
export function triangularPdf(x: number, mu: number, J: number): number {
  if (!(J > 0)) return 0;
  const d = Math.abs(x - mu);
  return d >= J ? 0 : (J - d) / (J * J);
}

// ── 합성 로그(함정 실험실·샘플용). 생성 파라미터를 결과와 함께 돌려준다.

export interface DriftLogParams { sigma: number; drift: number; rate: number; duration: number; seed: number }
/** 느린 드리프트(일정한 기울기)가 섞인 1축 정지 로그 */
export function synthDriftSeries(p: DriftLogParams): { t: number[]; x: number[] } {
  const rng = new Rng(p.seed);
  const n = Math.max(2, Math.round(p.rate * p.duration));
  const t: number[] = [], x: number[] = [];
  for (let i = 0; i < n; i++) {
    t.push(i / p.rate);
    x.push(p.drift * (i / p.rate) + rng.gauss(0, p.sigma));
  }
  return { t, x };
}
/** 드리프트가 섞인 정지 로그를 CSV 글자로 (열: t,x,y,z). x 축에만 드리프트를 넣는다. */
export function synthDriftLog(p: { sigmaH: number; sigmaV: number; drift: number; rate: number; duration: number; seed: number; pos: Vec }): string {
  const rng = new Rng(p.seed);
  const lines = [`# synthetic static log with slow drift on x: ${JSON.stringify(p)}`, 't,x,y,z'];
  const n = Math.round(p.rate * p.duration);
  const sx = p.sigmaH / Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const t = i / p.rate;
    lines.push([t.toFixed(4), (p.pos[0] + p.drift * t + rng.gauss(0, sx)).toFixed(4), (p.pos[1] + rng.gauss(0, sx)).toFixed(4), (p.pos[2] + rng.gauss(0, p.sigmaV)).toFixed(4)].join(','));
  }
  return lines.join('\n');
}
/** 길이 T 동안 기울기 b 로 흐른 직선의 표준편차는 |b|T/√12 → 추세를 빼지 않은 σ 의 이론값 */
export const rawSigmaWithDrift = (sigma: number, drift: number, duration: number): number => Math.hypot(sigma, (drift * duration) / Math.sqrt(12));

export interface TwoClockParams {
  n: number;
  /** 핑 주기 [Hz] */
  rate: number;
  /** 편도 지연 평균과 지터(± 균등) [s] */
  delayMean: number; delayJitter: number;
  /** 기체 시계가 PC 시계보다 앞선 양 [s] (t = 0 에서) */
  offset: number;
  /** 기체 시계의 주파수 오차 [ppm] */
  driftPpm: number;
  seed: number;
}
/**
 * 지상 PC 가 번호 붙인 핑을 보내고 기체가 그대로 돌려보내는 실험.
 * tSend, tEcho 는 PC 시계, tVehicle 은 기체가 핑을 받은 순간을 "기체 시계"로 찍은 값.
 */
export function synthTwoClock(p: TwoClockParams) {
  const rng = new Rng(p.seed);
  const d = () => Math.max(0, p.delayMean + rng.range(-p.delayJitter, p.delayJitter));
  const seq: number[] = [], tSend: number[] = [], tVehicle: number[] = [], tEcho: number[] = [], up: number[] = [];
  for (let i = 0; i < p.n; i++) {
    const ts = i / p.rate, d1 = d(), d2 = d();
    seq.push(i); tSend.push(ts); up.push(d1);
    tVehicle.push((ts + d1) * (1 + p.driftPpm * 1e-6) + p.offset);
    tEcho.push(ts + d1 + d2);
  }
  return {
    seq, tSend, tVehicle, tEcho,
    /** 참값: 올라가는 편도 지연 [s] */
    trueOneWay: up,
    /** 서로 다른 시계를 그대로 뺀 "편도 지연" [s] */
    naive: tVehicle.map((v, i) => v - tSend[i]),
    /** 한 시계로 잰 왕복의 절반 [s] */
    halfRtt: tEcho.map((v, i) => (v - tSend[i]) / 2),
  };
}

/** 표본 n 개(이웃 상관 ρ 인 AR(1), 참 σ = 1)에서 추정한 σ̂ (n−1 로 나눔) */
export function sampleSigmaAr1(n: number, rho: number, rng: Rng): number {
  const x: number[] = [];
  let v = rng.normal();
  const s = Math.sqrt(Math.max(0, 1 - rho * rho));
  for (let i = 0; i < n; i++) {
    x.push(v);
    v = rho * v + s * rng.normal();
  }
  return std(x);
}

// ── 샘플 로그: public/samples/*.csv 와 화면의 "샘플 불러오기" 버튼이 같은 함수를 쓴다.

const round = (v: number, d: number): number => Number(v.toFixed(d));
/**
 * 샘플 로그의 "예시 측정" 값. 일부러 기본 설정(σ_TDoA 15 cm, σ_TWR 10 cm, 지연 20 ms ± 5 ms)과 다르게 고정해,
 * 샘플을 전역 설정에 반영하면 무엇이 바뀌는지 화면에서 보이게 한다. 앵커 배치·모드·NLOS 등 나머지는 지금 설정을 쓴다.
 * (실제 측정값이 아니라 교재가 고른 예시값이다.)
 */
export const SAMPLE_MEASUREMENT = { sigmaTdoa: 0.2, sigmaTwr: 0.13, delayMean: 0.028, delayJitter: 0.008 } as const;
/** 지금 설정에 SAMPLE_MEASUREMENT 를 덮어쓴 설정(샘플 생성용) */
export function sampleMeasurementConfig(cfg: SystemConfig): SystemConfig {
  const m = SAMPLE_MEASUREMENT;
  return { ...cfg, uwb: { ...cfg.uwb, sigmaTdoa: m.sigmaTdoa, sigmaTwr: m.sigmaTwr }, comm: { ...cfg.comm, delayMean: m.delayMean, delayJitter: m.delayJitter } };
}
const SAMPLE_NOTE = `# example measurement: noise and delay are fixed sample values, NOT the current settings: ${JSON.stringify(SAMPLE_MEASUREMENT)}`;
/** 정지 로그 샘플의 고정 지점: 삼각대 위(높이 1 m). 기본 앵커 배치가 둘러싼 공간 안이다. [m] */
export const SAMPLE_STATIC_POINT: Vec = [3, 2, 1.0];
/** 정지 로그 샘플: 현재 설정의 모델이 그 지점에서 예측하는 흔들림으로 만든다. 10 Hz 로 60 초. */
export function sampleStaticLog(cfg: SystemConfig, seed = 11): string {
  const pr = predictStatic(sampleMeasurementConfig(cfg), SAMPLE_STATIC_POINT);
  return SAMPLE_NOTE + '\n' + synthStaticLog({ sigmaH: round(pr.staticH, 4), sigmaV: round(pr.staticV, 4), rate: 10, duration: 60, seed, pos: SAMPLE_STATIC_POINT });
}
/** 드리프트가 섞인 정지 로그 샘플: 삼각대 위(높이 1 m)에서 x 축으로 1 mm/s 씩 흐른다. */
export function sampleDriftLog(cfg: SystemConfig, seed = 14): string {
  const pos: Vec = [3, 2, 1];
  const pr = predictStatic(sampleMeasurementConfig(cfg), pos);
  return SAMPLE_NOTE + '\n' + synthDriftLog({ sigmaH: round(pr.staticH, 4), sigmaV: round(pr.staticV, 4), drift: 0.001, rate: 10, duration: 60, seed, pos });
}
/** 거리 로그 샘플: 강당 한가운데 높이 1 m 지점에서 각 앵커까지. dists 는 설정 좌표로 계산한 기준 거리이고, 앵커마다 고정 편향(1σ = anchorSurveyError)을 더해 "실제 앵커가 설정 좌표에서 어긋난 시선 방향 몫"을 흉내 낸다. */
export function sampleRangeLog(cfg: SystemConfig, seed = 12): { text: string; point: Vec; dists: number[]; biases: number[] } {
  const point: Vec = [cfg.hall.x / 2, cfg.hall.y / 2, 1];
  const rng = new Rng(seed);
  const dists = cfg.anchors.map((a) => round(dist(a, point), 3));
  const biases = cfg.anchors.map(() => round(rng.gauss(0, cfg.uwb.anchorSurveyError), 3));
  const text = SAMPLE_NOTE + '\n' + synthRangeLog({ dists, sigma: SAMPLE_MEASUREMENT.sigmaTwr, biases, pNlos: cfg.uwb.pNlos, biasMean: cfg.uwb.nlosBiasMean, perAnchor: 500, seed });
  return { text, point, dists, biases };
}
/** 왕복 지연 로그 샘플: 방송 주기로 1200 개(20 Hz 면 60 초)의 핑 */
export const sampleLatencyLog = (cfg: SystemConfig, seed = 13): string => SAMPLE_NOTE + '\n' + synthLatencyLog(sampleMeasurementConfig(cfg), 1200, seed);
