/** 몬테카를로 실험 1종: (파라미터, 시드) → 숫자 지표 묶음. Web Worker 와 Node 양쪽에서 돈다. */
export interface McExperiment<P = any> {
  id: string;
  run(params: P, seed: number): Record<string, number>;
}
