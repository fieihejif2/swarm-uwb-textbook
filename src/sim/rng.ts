/** 시드 고정 난수 생성기. 같은 시드 → 같은 수열(브라우저·Node 동일). */
export class Rng {
  private s: number;
  private spare: number | null = null;
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  /** mulberry32: [0,1) 균등분포 */
  uniform(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.uniform();
  }
  /** 표준정규분포 (Box–Muller) */
  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u < 1e-300) u = this.uniform();
    const v = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  gauss(mean: number, sigma: number): number {
    return mean + sigma * this.normal();
  }
  /** |x| ≤ k·σ 로 잘린 정규분포(기각 샘플링). 오차 "한계"가 필요한 실험용. */
  truncGauss(sigma: number, k = 3): number {
    for (;;) {
      const x = this.normal();
      if (Math.abs(x) <= k) return x * sigma;
    }
  }
  exponential(mean: number): number {
    let u = 0;
    while (u < 1e-300) u = this.uniform();
    return -mean * Math.log(u);
  }
  bernoulli(p: number): boolean {
    return this.uniform() < p;
  }
  int(n: number): number {
    return Math.floor(this.uniform() * n);
  }
  /** 길이 ≤ radius 인 dim차원 벡터(공 안에서 균등) */
  inBall(dim: number, radius: number): number[] {
    for (;;) {
      const v = Array.from({ length: dim }, () => this.range(-1, 1));
      const n2 = v.reduce((a, b) => a + b * b, 0);
      if (n2 <= 1) return v.map((x) => x * radius);
    }
  }
}
