/** ⑦ 몬테카를로 패널: Web Worker 에서 수백~수천 회를 돌려 분포를 히스토그램으로 보여준다. 시드 고정 가능. */
import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { L, fmt, tr } from '../app/i18n';
import { mean, quantile } from '../sim/stats';
import { SrcRef, der, ex } from '../sources';
import { SrcBadge } from './Badge';
import { Histogram, RefLine } from './Plot';
import { rich } from './Tx';

export interface McPanelProps {
  title: L;
  /** src/sim/mc/*.ts 의 experiment.id */
  experiment: string;
  /** 실험 파라미터(구조화 복제 가능한 값만. 함수 불가) */
  params: unknown;
  /** 히스토그램으로 그릴 지표 이름 */
  metric: string;
  xLabel: L;
  refLines?: RefLine[];
  /** 히스토그램에 겹쳐 그릴 이론 밀도 */
  theory?: { name: L | string; pdf: (x: number) => number };
  range?: [number, number];
  /** 이 값보다 작은(또는 flagAbove 면 큰) 결과의 비율을 따로 보여준다 */
  threshold?: { value: number; label: L; above?: boolean };
  defaultRuns?: number;
  src?: SrcRef;
  testId?: string;
  /** 결과 전체를 받아 추가 통계를 그리고 싶을 때 */
  children?: (results: Record<string, number>[]) => ComponentChildren;
  note?: L;
}

export function McPanel(p: McPanelProps) {
  const [runs, setRuns] = useState(p.defaultRuns ?? 300);
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, number>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  const stop = () => { worker.current?.terminate(); worker.current = null; setBusy(false); };
  const start = () => {
    stop();
    setBusy(true); setProgress(0); setError(null);
    const w = new Worker(new URL('../workers/mc.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const id = ++reqId.current;
    w.onmessage = (ev) => {
      if (ev.data.id !== id) return;
      if (ev.data.type === 'progress') setProgress(ev.data.done / ev.data.total);
      else if (ev.data.type === 'done') { setResults(ev.data.results); setBusy(false); setProgress(1); w.terminate(); worker.current = null; }
      else { setError(ev.data.error); setBusy(false); w.terminate(); worker.current = null; }
    };
    w.onerror = (e) => { setError(e.message); setBusy(false); };
    w.postMessage({ id, experiment: p.experiment, params: p.params, seeds: Array.from({ length: runs }, (_, i) => seed * 100003 + i) });
  };
  const vals = results ? results.map((r) => r[p.metric]).filter(Number.isFinite) : [];
  const flagged = p.threshold && results ? results.filter((r) => (p.threshold!.above ? r[p.metric] > p.threshold!.value : r[p.metric] < p.threshold!.value)).length : 0;
  const src = p.src ?? der(undefined, { ko: '설정값을 입력으로 교재의 모델을 반복 실행한 결과', en: 'Repeated runs of the textbook model with the current settings' });
  return (
    <div class="card demo" data-testid={p.testId}>
      <div class="card-title"><span class="tag">{tr({ ko: '몬테카를로', en: 'Monte Carlo' })}</span><span>{rich(p.title)}</span></div>
      {p.note && <p class="muted small">{rich(p.note)}</p>}
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <label class="ctl-label">{tr({ ko: '반복 횟수', en: 'Runs' })}<SrcBadge src={ex(undefined, { ko: '많을수록 분포가 매끈해지지만 오래 걸립니다', en: 'More runs give a smoother distribution but take longer' })} />
          <select class="input" style={{ width: 'auto' }} value={runs} onChange={(e) => setRuns(Number((e.target as HTMLSelectElement).value))} data-testid={p.testId ? `${p.testId}-runs` : undefined}>
            {[100, 300, 1000, 3000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label class="ctl-label">{tr({ ko: '시드', en: 'Seed' })}<SrcBadge src={ex(undefined, { ko: '같은 시드는 항상 같은 결과를 냅니다', en: 'The same seed always reproduces the same result' })} />
          <input class="input" type="number" style={{ width: '84px' }} value={seed} min={1} step={1} onChange={(e) => setSeed(Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1)))} />
        </label>
        {!busy
          ? <button type="button" class="btn primary" onClick={start} data-testid={p.testId ? `${p.testId}-run` : undefined}>{tr({ ko: '▶ 돌리기', en: '▶ Run' })}</button>
          : <button type="button" class="btn" onClick={stop}>{tr({ ko: '■ 중지', en: '■ Stop' })}</button>}
        {busy && <progress value={progress} max={1} aria-label={tr({ ko: '진행률', en: 'Progress' })} style={{ flex: 1, minWidth: '80px' }} />}
      </div>
      <div aria-live="polite">
        {error && <p><span class="status bad">✕ {error}</span></p>}
        {results && vals.length > 0 && (
          <div data-testid={p.testId ? `${p.testId}-result` : undefined}>
            <Histogram values={vals} xLabel={p.xLabel} refLines={p.refLines} range={p.range} theory={p.theory} src={src} />
            <div class="stat-row">
              <div class="stat"><div class="k">{tr({ ko: '평균', en: 'Mean' })}<SrcBadge src={src} /></div><div class="v">{fmt(mean(vals))}</div></div>
              <div class="stat"><div class="k">{tr({ ko: '5% ~ 95%', en: '5% – 95%' })}<SrcBadge src={src} /></div><div class="v">{fmt(quantile(vals, 0.05))} ~ {fmt(quantile(vals, 0.95))}</div></div>
              <div class="stat"><div class="k">{tr({ ko: '최소', en: 'Min' })}<SrcBadge src={src} /></div><div class="v">{fmt(Math.min(...vals))}</div></div>
              {p.threshold && (
                <div class="stat"><div class="k">{rich(p.threshold.label)}<SrcBadge src={src} /></div>
                  <div class="v" style={flagged ? { color: 'var(--critical-text)' } : undefined}>{flagged ? '✕ ' : '✓ '}{flagged} / {results.length}</div></div>
              )}
            </div>
            {p.children?.(results)}
          </div>
        )}
        {!results && !busy && <p class="muted small">{tr({ ko: '"돌리기"를 누르면 계산을 시작합니다. 계산은 이 브라우저 안에서만 이루어집니다.', en: 'Press Run to start. Everything is computed inside this browser.' })}</p>}
      </div>
    </div>
  );
}
