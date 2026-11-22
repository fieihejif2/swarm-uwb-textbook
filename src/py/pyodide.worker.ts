/// <reference lib="webworker" />
/**
 * Pyodide 를 Web Worker 에서 돌린다(무한 루프에 빠진 코드를 terminate 로 끊을 수 있도록).
 * 런타임과 numpy 는 public/pyodide/ 의 로컬 번들에서만 읽는다. 네트워크(CDN) 요청 없음.
 */
import { GradeResult, makeGrader } from './grader';

type Req = { id: number; type: 'init'; baseUrl: string } | { id: number; type: 'grade'; userSrc: string; solution: string; tests: string };
let grader: Promise<(u: string, t: { solution: string; tests: string }) => GradeResult> | null = null;

async function boot(baseUrl: string) {
  const indexURL = new URL('pyodide/', baseUrl).href;
  const mod = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
  const pyodide = await mod.loadPyodide({ indexURL });
  return makeGrader(pyodide);
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      grader ??= boot(msg.baseUrl);
      await grader;
      (self as any).postMessage({ id: msg.id, ok: true });
    } else {
      if (!grader) throw new Error('not initialised');
      const g = await grader;
      (self as any).postMessage({ id: msg.id, ok: true, result: g(msg.userSrc, { solution: msg.solution, tests: msg.tests }) });
    }
  } catch (e) {
    (self as any).postMessage({ id: msg.id, ok: false, error: String((e as Error)?.message ?? e) });
  }
};
