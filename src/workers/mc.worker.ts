/// <reference lib="webworker" />
/** 몬테카를로 실험을 UI 스레드 밖에서 돌린다. src/sim/mc/*.ts 가 export 하는 experiment 를 자동으로 등록한다. */
import type { McExperiment } from '../sim/mc/types';

const mods = import.meta.glob<{ experiment?: McExperiment }>('../sim/mc/*.ts', { eager: true });
const registry = new Map<string, McExperiment>();
for (const m of Object.values(mods)) if (m.experiment) registry.set(m.experiment.id, m.experiment);

interface Req { id: number; experiment: string; params: unknown; seeds: number[] }
self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, experiment, params, seeds } = ev.data;
  const exp = registry.get(experiment);
  if (!exp) { (self as any).postMessage({ id, type: 'error', error: `unknown experiment: ${experiment}` }); return; }
  try {
    const out: Record<string, number>[] = [];
    let lastPost = performance.now();
    for (let i = 0; i < seeds.length; i++) {
      out.push(exp.run(params, seeds[i]));
      if (performance.now() - lastPost > 120) { (self as any).postMessage({ id, type: 'progress', done: i + 1, total: seeds.length }); lastPost = performance.now(); }
    }
    (self as any).postMessage({ id, type: 'done', results: out });
  } catch (e) {
    (self as any).postMessage({ id, type: 'error', error: String((e as Error)?.message ?? e) });
  }
};
