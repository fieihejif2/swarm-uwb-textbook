import { signal } from '@preact/signals';
import type { CodingTask, GradeResult } from './grader';

export type PyStatus = 'idle' | 'loading' | 'ready' | 'error';
export const pyStatus = signal<PyStatus>('idle');

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function call(msg: Record<string, unknown>): Promise<any> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...msg, id });
  });
}
function start(): Promise<void> {
  if (ready) return ready;
  pyStatus.value = 'loading';
  worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const h = pending.get(ev.data.id);
    if (!h) return;
    pending.delete(ev.data.id);
    ev.data.ok ? h.resolve(ev.data.result) : h.reject(new Error(ev.data.error));
  };
  worker.onerror = (e) => { for (const h of pending.values()) h.reject(new Error(e.message || 'worker error')); pending.clear(); };
  ready = call({ type: 'init', baseUrl: document.baseURI }).then(
    () => { pyStatus.value = 'ready'; },
    (e) => { pyStatus.value = 'error'; ready = null; worker?.terminate(); worker = null; throw e; },
  );
  return ready;
}
function kill(): void {
  worker?.terminate();
  worker = null;
  ready = null;
  for (const h of pending.values()) h.reject(new Error('terminated'));
  pending.clear();
  pyStatus.value = 'idle';
}
/** Python 런타임을 미리 올려 둔다(첫 채점이 빨라진다) */
export const warmUpPython = (): void => { start().catch(() => undefined); };

export class GradeTimeout extends Error {}
/** 학생 코드를 채점한다. timeoutMs 안에 끝나지 않으면(무한 루프 등) 워커를 끊고 GradeTimeout 을 던진다. */
export async function gradeCode(userSrc: string, task: Pick<CodingTask, 'solution' | 'tests'>, timeoutMs = 15000): Promise<GradeResult> {
  await start();
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => { kill(); reject(new GradeTimeout('timeout')); }, timeoutMs);
  });
  try {
    return await Promise.race([call({ type: 'grade', userSrc, solution: task.solution, tests: task.tests }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
