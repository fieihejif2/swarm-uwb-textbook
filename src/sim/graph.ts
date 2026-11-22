/** 7장: 통신 그래프와 라플라시안. */
import { Mat, eigSym, zeros } from './linalg';

export type GraphKind = 'complete' | 'ring' | 'star' | 'path';

/** 무방향 그래프의 인접행렬(가중치 1) */
export function adjacency(kind: GraphKind, n: number): Mat {
  const A = zeros(n, n);
  const link = (i: number, j: number) => { if (i !== j) { A[i][j] = 1; A[j][i] = 1; } };
  if (kind === 'complete') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j);
  else if (kind === 'ring') for (let i = 0; i < n; i++) link(i, (i + 1) % n);
  else if (kind === 'star') for (let i = 1; i < n; i++) link(0, i);
  else for (let i = 0; i + 1 < n; i++) link(i, i + 1);
  return A;
}
/** L = D − A */
export function laplacian(A: Mat): Mat {
  return A.map((row, i) => row.map((a, j) => (i === j ? row.reduce((s, v) => s + v, 0) - a : -a)));
}
/** 라플라시안 고유값(오름차순). λ₁ = 0, λ₂ = 대수적 연결도, λ_N = 최대 고유값 */
export function laplacianSpectrum(L: Mat): number[] {
  return eigSym(L).values.map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
}
export const lambda2 = (L: Mat): number => laplacianSpectrum(L)[1];
export const lambdaMax = (L: Mat): number => { const s = laplacianSpectrum(L); return s[s.length - 1]; };
export const maxDegree = (A: Mat): number => Math.max(...A.map((r) => r.reduce((s, v) => s + v, 0)));

/**
 * 균일 지연 합의 ẋ = −k L x(t−τ) 의 지연 한계 τ* = π / (2 k λ_N).
 * (Olfati-Saber & Murray 2004 의 조건을 게인 k 로 스케일한 것)
 */
export const delayMargin = (L: Mat, gain = 1): number => Math.PI / (2 * gain * lambdaMax(L));

export function isConnected(A: Mat): boolean {
  const n = A.length, seen = new Array<boolean>(n).fill(false), stack = [0];
  seen[0] = true;
  while (stack.length) {
    const i = stack.pop()!;
    for (let j = 0; j < n; j++) if (A[i][j] > 0 && !seen[j]) { seen[j] = true; stack.push(j); }
  }
  return seen.every(Boolean);
}
