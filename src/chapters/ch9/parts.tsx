/** 9장 여러 곳에서 함께 쓰는 작은 부품들: 출처 배지, 데이터 히스토그램, 손실 띠, "설정에 반영" 줄. */
import { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { fieldMeta } from '../../app/fields';
import { L, fix, fmt, tr } from '../../app/i18n';
import { budget, config, getPath, markMeasured, setPath, unmarkMeasured } from '../../app/store';
import { computeBudget } from '../../sim/budget';
import { withPath } from '../../sim/ch9_measure';
import { histogram } from '../../sim/stats';
import { SrcRef, der } from '../../sources';
import { Button, CfgVal, LineChart, RefLine, SrcBadge, Status, Val, rich } from '../../ui';

/** "여러분의 파일에서 계산한 값" 배지. where 는 그 계산식을 유도한 카드. */
export const fromFile = (where: string, ko = '불러온 로그에서 이 장의 식으로 계산한 값', en = 'Computed from the loaded log with the formulas of this chapter'): SrcRef =>
  der(`ch9#${where}`, { ko, en });
export const PREVIEW = der('ch8#budget-sum', { ko: '이 값만 바꿔서 오차 예산을 다시 계산한 결과', en: 'The error budget recomputed with only this value changed' });

/** 숫자 하나 + 단위 + 유도 배지 (표의 칸에 쓴다) */
export function Num({ v, unit, digits = 3, src }: { v: number; unit?: string; digits?: number; src: SrcRef }) {
  return <Val v={v} unit={unit} digits={digits} src={src} />;
}

/**
 * 로그 데이터의 히스토그램(계단선) + 맞춘 분포 곡선.
 * 공용 Histogram 은 막대 범례가 "시뮬레이션"으로 고정되어 있어, 사용자가 올린 데이터에는 LineChart 로 직접 그린다.
 */
export function DataHist({ values, bins = 30, range, title, xLabel, dataName, fit, refLines, src, testId, height }: {
  values: number[]; bins?: number; range?: [number, number]; title: L; xLabel: L; dataName?: L;
  /** 표시 단위 기준의 확률밀도 */
  fit?: { name: L; pdf: (x: number) => number; link?: string };
  refLines?: RefLine[]; src: SrcRef; testId?: string; height?: number;
}) {
  const h = useMemo(() => histogram(values, bins, range?.[0], range?.[1]), [values, bins, range?.[0], range?.[1]]);
  const lo = h.edges[0], hi = h.edges[h.edges.length - 1];
  const bw = (hi - lo) / h.counts.length;
  const sx: number[] = [lo], sy: number[] = [0];
  h.counts.forEach((c, i) => { sx.push(h.edges[i], h.edges[i + 1]); sy.push(c, c); });
  sx.push(hi); sy.push(0);
  const cx = Array.from({ length: 161 }, (_, i) => lo + ((hi - lo) * i) / 160);
  const cy = fit ? cx.map((x) => fit.pdf(x) * h.n * bw) : [];
  const top = Math.max(1, ...h.counts, ...cy) * 1.1;
  return (
    <LineChart
      title={title} xLabel={xLabel} yLabel={{ ko: '횟수', en: 'Count' }} height={height ?? 230} xDomain={[lo, hi]} yDomain={[0, top]}
      series={[
        { name: dataName ?? { ko: '로그 데이터 (히스토그램)', en: 'Log data (histogram)' }, x: sx, y: sy, slot: 1, dash: '', width: 2 },
        ...(fit ? [{ name: fit.name, x: cx, y: cy, slot: 2, dash: '6 3', link: fit.link }] : []),
      ]}
      refLines={refLines} src={src} testId={testId} />
  );
}

/** 손실 띠: 순번마다 한 칸. 테두리가 있는 진한 칸이 돌아오지 않은 핑. */
export function LossStrip({ lost, first, max = 240 }: { lost: number[]; first: number; max?: number }) {
  const shown = lost.slice(0, max);
  const nLost = shown.filter(Boolean).length;
  const label = tr({ ko: `순번 ${first} 부터 ${shown.length}개 가운데 ${nLost}개 손실`, en: `${nLost} of the ${shown.length} pings from seq ${first} lost` });
  return (
    <div style={{ margin: '10px 0' }}>
      <div class="small muted">{tr({ ko: `손실 띠: 순번 ${first} 부터 ${shown.length}개 (진한 칸 = 돌아오지 않은 핑)`, en: `Loss strip: ${shown.length} pings from seq ${first} (dark cell = ping that never came back)` })}</div>
      <div role="img" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(60, 1fr)', gap: '1px', maxWidth: '620px' }}>
        {shown.map((v, i) => (
          <span key={i} style={{ height: '10px', borderRadius: '2px', background: v ? 'var(--critical)' : 'var(--surface-3)', outline: v ? '1px solid var(--text)' : 'none', outlineOffset: '-1px' }} />
        ))}
      </div>
    </div>
  );
}

const sameValue = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b);

/**
 * 피팅한 값 하나를 전역 설정에 반영하는 줄.
 * 누르기 전: 지금 값, 측정값, "반영하면 권장 간격이 얼마가 되는지" 미리 보기.
 * 누른 뒤: 이전 값 → 새 값, 권장 간격의 변화, 되돌리기.
 */
export function ApplyRow({ label, path, value, src, show, note, testId }: {
  label: L; path: string;
  /** 반영할 값 (SI 단위). 숫자 또는 객체(comm.loss) */
  value: unknown; src: SrcRef;
  /** 값을 화면에 적는 법(숫자 경로가 아니면 필요) */
  show?: (v: any) => string; note?: ComponentChildren; testId?: string;
}) {
  const cfg = config.value;
  const b = budget.value;
  const meta = fieldMeta(path);
  const cur = getPath(cfg, path);
  const text = (v: unknown): string => (show ? show(v) : typeof v === 'number' && meta ? `${fmt(v * meta.scale, 3)} ${meta.unit}` : String(v));
  const valid = typeof value === 'number' ? Number.isFinite(value) && value >= 0 : value != null;
  const next = useMemo(() => (valid ? withPath(cfg, path, value) : cfg), [cfg, path, JSON.stringify(value), valid]);
  const preview = useMemo(() => computeBudget(next), [next]);
  const [done, setDone] = useState<{ before: unknown; after: unknown; sepBefore: number; sepAfter: number } | null>(null);
  const already = sameValue(cur, getPath(next, path));
  const apply = () => {
    const before = structuredClone(cur);
    setPath(path, value);
    // 반영한 값은 예시값이 아니라 "내 로그에서 구한 값"(유도 배지)으로 표시된다
    markMeasured(path, src.kind === 'der' && src.anchor ? src.anchor : 'sigma-fit');
    setDone({ before, after: structuredClone(getPath(config.value, path)), sepBefore: b.minSepH, sepAfter: budget.value.minSepH });
  };
  const undo = () => { if (done) { setPath(path, done.before); unmarkMeasured(path); setDone(null); } };
  return (
    <div data-testid={testId} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', background: 'var(--surface)' }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{rich(label)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', alignItems: 'center' }}>
        <span>{tr({ ko: '지금 설정', en: 'Current setting' })}: {typeof cur === 'number' && meta && !show ? <CfgVal path={path} /> : <span class="val" style={{ whiteSpace: 'normal' }}><b>{text(cur)}</b><SrcBadge src={{ kind: 'ex', field: path }} /></span>}</span>
        <span>{tr({ ko: '로그에서 구한 값', en: 'From the log' })}: {valid ? <span class="val" style={{ whiteSpace: 'normal' }}><b>{text(value)}</b><SrcBadge src={src} /></span> : <span class="muted">–</span>}</span>
      </div>
      {valid && !done && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', marginTop: '8px' }}>
          <Button primary onClick={apply} disabled={already} testId={testId ? `${testId}-btn` : undefined}>{tr(already ? { ko: '이미 같은 값', en: 'Already this value' } : { ko: '전역 설정에 반영', en: 'Apply to global settings' })}</Button>
          {!already && (
            <span class="small">
              {tr({ ko: '반영하면 권장 수평 간격', en: 'Recommended horizontal spacing if applied' })}: <b class="num">{fix(b.minSepH, 3)} m → {fix(preview.minSepH, 3)} m</b><SrcBadge src={PREVIEW} />
            </span>
          )}
        </div>
      )}
      {done && (
        <div style={{ marginTop: '8px' }} data-testid={testId ? `${testId}-done` : undefined}>
          <Status kind="good">{tr({ ko: '반영했습니다', en: 'Applied' })}</Status>{' '}
          <span class="small">
            <b class="num">{text(done.before)} → {text(done.after)}</b><SrcBadge src={src} />{' · '}
            {tr({ ko: '권장 수평 간격', en: 'recommended horizontal spacing' })} <b class="num">{fix(done.sepBefore, 3)} m → {fix(done.sepAfter, 3)} m</b><SrcBadge src={PREVIEW} />
          </span>{' '}
          <button type="button" class="btn ghost small" onClick={undo} data-testid={testId ? `${testId}-undo` : undefined}>{tr({ ko: '되돌리기', en: 'Undo' })}</button>
        </div>
      )}
      {note && <div class="small muted" style={{ marginTop: '6px' }}>{note}</div>}
    </div>
  );
}
