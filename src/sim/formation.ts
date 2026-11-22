import { Vec } from './linalg';

export type FormationShape = 'line' | 'v' | 'pentagon' | 'cross' | 'stack';

/** 5대 대형의 목표 오프셋(무게중심 = 원점). spacing = 이웃 간 간격 [m] */
export function formationOffsets(shape: FormationShape, spacing: number, n = 5): Vec[] {
  let pts: Vec[];
  const s = spacing;
  if (shape === 'line') pts = Array.from({ length: n }, (_, i) => [i * s, 0, 0]);
  else if (shape === 'v') {
    pts = [[0, 0, 0]];
    for (let i = 1; i < n; i++) {
      const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      pts.push([-k * s * Math.cos(Math.PI / 4), side * k * s * Math.sin(Math.PI / 4), 0]);
    }
  } else if (shape === 'pentagon') {
    const R = s / (2 * Math.sin(Math.PI / n));
    pts = Array.from({ length: n }, (_, i) => [R * Math.cos((2 * Math.PI * i) / n + Math.PI / 2), R * Math.sin((2 * Math.PI * i) / n + Math.PI / 2), 0]);
  } else if (shape === 'cross') {
    pts = [[0, 0, 0], [s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0]].slice(0, n);
  } else {
    // stack: 위아래로 겹쳐 쌓기 (다운워시 함정용)
    pts = Array.from({ length: n }, (_, i) => [0, 0, i * s]);
  }
  const c = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
  return pts.map((p) => p.map((v, k) => v - c[k]));
}

/** 대형 안에서 가장 가까운 두 기체 사이의 거리 */
export function minPairDistance(pts: Vec[]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], (pts[i][2] ?? 0) - (pts[j][2] ?? 0));
      if (d < m) m = d;
    }
  return m;
}
