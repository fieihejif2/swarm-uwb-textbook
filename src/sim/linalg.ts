/** 작은 밀집 행렬용 선형대수. 행렬은 number[][] (행 우선). */
export type Vec = number[];
export type Mat = number[][];

export const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array<number>(c).fill(0));
export const eye = (n: number): Mat => {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
};
export const diag = (d: Vec): Mat => {
  const m = zeros(d.length, d.length);
  d.forEach((v, i) => (m[i][i] = v));
  return m;
};
export const clone = (a: Mat): Mat => a.map((r) => r.slice());
export const transpose = (a: Mat): Mat => a[0].map((_, j) => a.map((r) => r[j]));
export function matmul(a: Mat, b: Mat): Mat {
  const r = a.length, c = b[0].length, k = b.length;
  const out = zeros(r, c);
  for (let i = 0; i < r; i++)
    for (let l = 0; l < k; l++) {
      const ail = a[i][l];
      if (ail === 0) continue;
      for (let j = 0; j < c; j++) out[i][j] += ail * b[l][j];
    }
  return out;
}
export const matvec = (a: Mat, v: Vec): Vec => a.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
export const madd = (a: Mat, b: Mat): Mat => a.map((r, i) => r.map((x, j) => x + b[i][j]));
export const msub = (a: Mat, b: Mat): Mat => a.map((r, i) => r.map((x, j) => x - b[i][j]));
export const mscale = (a: Mat, s: number): Mat => a.map((r) => r.map((x) => x * s));
export const trace = (a: Mat): number => a.reduce((s, r, i) => s + r[i], 0);
export const symmetrize = (a: Mat): Mat => a.map((r, i) => r.map((x, j) => 0.5 * (x + a[j][i])));

export const vadd = (a: Vec, b: Vec): Vec => a.map((x, i) => x + b[i]);
export const vsub = (a: Vec, b: Vec): Vec => a.map((x, i) => x - b[i]);
export const vscale = (a: Vec, s: number): Vec => a.map((x) => x * s);
export const dot = (a: Vec, b: Vec): number => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a: Vec): number => Math.sqrt(dot(a, a));
export const dist = (a: Vec, b: Vec): number => norm(vsub(a, b));
export const outer = (a: Vec, b: Vec): Mat => a.map((x) => b.map((y) => x * y));

/** 가우스-조던 소거(부분 피벗)로 A x = B 를 푼다. 특이하면 예외. */
export function solve(a: Mat, b: Mat): Mat {
  const n = a.length;
  const m = b[0].length;
  const aug = a.map((r, i) => [...r, ...b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
    if (Math.abs(aug[piv][col]) < 1e-14) throw new Error('singular matrix');
    if (piv !== col) [aug[piv], aug[col]] = [aug[col], aug[piv]];
    const p = aug[col][col];
    for (let j = col; j < n + m; j++) aug[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      if (f === 0) continue;
      for (let j = col; j < n + m; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map((r) => r.slice(n));
}
export const inv = (a: Mat): Mat => solve(a, eye(a.length));
export const solveVec = (a: Mat, b: Vec): Vec => solve(a, b.map((x) => [x])).map((r) => r[0]);

/** 대칭행렬 고유분해(야코비 회전). 고유값 오름차순, vectors[k] 가 k번째 고유벡터. */
export function eigSym(a: Mat): { values: Vec; vectors: Mat } {
  const n = a.length;
  const A = clone(a);
  const V = eye(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const order = A.map((_, i) => i).sort((i, j) => A[i][i] - A[j][j]);
  return { values: order.map((i) => A[i][i]), vectors: order.map((i) => V.map((r) => r[i])) };
}

/** 2×2 공분산의 1σ 타원(반축 길이와 회전각). */
export function covEllipse(pxx: number, pxy: number, pyy: number): { a: number; b: number; angle: number } {
  const tr = pxx + pyy, det = pxx * pyy - pxy * pxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  const angle = 0.5 * Math.atan2(2 * pxy, pxx - pyy);
  return { a: Math.sqrt(l1), b: Math.sqrt(l2), angle };
}
