export const mean = (x: number[]): number => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
export function variance(x: number[], ddof = 1): number {
  if (x.length <= ddof) return NaN;
  const m = mean(x);
  return x.reduce((s, v) => s + (v - m) * (v - m), 0) / (x.length - ddof);
}
export const std = (x: number[], ddof = 1): number => Math.sqrt(variance(x, ddof));
export const rms = (x: number[]): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
/** 선형보간 분위수 (numpy 기본 방식과 동일) */
export function quantile(x: number[], q: number): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const median = (x: number[]): number => quantile(x, 0.5);
export interface Histogram { edges: number[]; counts: number[]; n: number }
export function histogram(x: number[], bins = 30, lo?: number, hi?: number): Histogram {
  const finite = x.filter(Number.isFinite);
  let a = lo ?? Math.min(...finite), b = hi ?? Math.max(...finite);
  if (!(b > a)) { a -= 0.5; b += 0.5; }
  const counts = new Array<number>(bins).fill(0);
  for (const v of finite) {
    if (v < a || v > b) continue;
    counts[Math.min(bins - 1, Math.floor(((v - a) / (b - a)) * bins))]++;
  }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => a + ((b - a) * i) / bins), counts, n: finite.length };
}
/** 최소제곱 직선 y = a + b x */
export function linfit(x: number[], y: number[]): { a: number; b: number; r2: number } {
  const mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
}
/** y ≈ A·exp(−rate·t) 의 감쇠율을 log-선형 피팅으로 추정 */
export function fitDecayRate(t: number[], y: number[]): { rate: number; amp: number; r2: number } {
  const tt: number[] = [], ly: number[] = [];
  for (let i = 0; i < t.length; i++) if (y[i] > 0 && Number.isFinite(y[i])) { tt.push(t[i]); ly.push(Math.log(y[i])); }
  const f = linfit(tt, ly);
  return { rate: -f.b, amp: Math.exp(f.a), r2: f.r2 };
}
/** 표준정규 누적분포 (Abramowitz–Stegun 7.1.26 기반 erf, 절대오차 < 1.5e-7) */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
export const normPdf = (x: number, mu = 0, sigma = 1): number =>
  Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
