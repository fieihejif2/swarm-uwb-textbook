/**
 * 가벼운 SVG 그래프 모음: LineChart, Histogram, Waterfall.
 * 공통 원칙: 축 라벨과 단위를 항상 표시, 계열은 색 + 선 모양(점선 패턴)으로 구분,
 * 계열이 2개 이상이면 범례, 마우스·키보드(←/→)로 값을 읽는 십자선, "표로 보기" 제공.
 */
import { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { L, fmt, tr } from '../app/i18n';
import { histogram } from '../sim/stats';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { linkHandlers, useLink } from './link';

export interface Series {
  name: L | string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** 색 슬롯 1~8 (기본: 순서대로) */
  slot?: number;
  /** SVG stroke-dasharray. 기본은 슬롯마다 다른 패턴 */
  dash?: string;
  width?: number;
  /** 수식·코드와 연동할 key */
  link?: string;
  /** 선 대신 점으로 */
  points?: boolean;
  /** 흐리게(배경용 계열) */
  faint?: boolean;
  /** false 이면 범례에 넣지 않는다(예: ±2σ 의 아래쪽 선처럼 같은 뜻의 두 번째 선) */
  legend?: boolean;
}
export interface RefLine {
  x?: number;
  y?: number;
  label?: L | string;
  slot?: number;
  link?: string;
}
export interface LineChartProps {
  series: Series[];
  xLabel: L | string;
  yLabel: L | string;
  title?: L | string;
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  yLog?: boolean;
  refLines?: RefLine[];
  /** 그래프 아래에 다는 출처 배지 (시뮬레이션 결과는 der) */
  src?: SrcRef;
  /** 툴팁·표의 유효숫자 */
  digits?: number;
  testId?: string;
  children?: ComponentChildren;
}

const DASHES = ['', '7 4', '2 3', '10 3 2 3', '1 4', '12 4', '4 2 1 2', '6 2'];
export const seriesColor = (slot: number): string => `var(--series-${((slot - 1) % 8) + 1})`;
export const seriesDash = (slot: number): string => DASHES[(slot - 1) % DASHES.length];

export function useWidth<T extends HTMLElement>(): [{ current: T | null }, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(Math.floor(el.clientWidth));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  const stride = Math.max(1, Math.ceil((b - a) / 6));
  // 범위가 좁으면(3자릿수 이하) 1-2-5 눈금을 함께 넣어 읽기 쉽게 한다
  const mults = b - a <= 3 ? [1, 2, 5] : [1];
  for (let e = a; e <= b; e += stride) for (const m of mults) out.push(m * Math.pow(10, e));
  return out.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
}
/** 축 라벨의 대괄호 안 단위('시간 [s]' → 's'). 툴팁 값 뒤에 붙인다. */
const unitOf = (label: L | string): string => { const m = tr(label).match(/\[([^\]]+)\]\s*$/); return m ? m[1] : ''; };
const tickFmt = (v: number, log?: boolean): string => {
  if (log) { const e = Math.round(Math.log10(v)); return e >= -2 && e <= 3 ? String(Number(v.toPrecision(1))) : `10^${e}`.replace('-', '−'); }
  return fmt(v, 4);
};
/** 눈금 글자. 10^n 꼴은 지수를 위첨자로 그린다. */
function TickText({ v, log, ...rest }: { v: number; log?: boolean } & Record<string, unknown>) {
  const s = tickFmt(v, log);
  const m = s.match(/^10\^(.+)$/);
  return <text class="tick" {...rest}>{m ? <>10<tspan dy="-5" font-size="8.5">{m[1]}</tspan></> : s}</text>;
}
function extent(arrs: ArrayLike<number>[], positive = false): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrs) for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v) || (positive && v <= 0)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return positive ? [1e-3, 1] : [0, 1];
  if (lo === hi) return positive ? [lo / 2, hi * 2] : [lo - 0.5, hi + 0.5];
  return [lo, hi];
}
/** 화소 열마다 최소·최대만 남겨 점 수를 줄인다(모양은 유지) */
function decimate(x: ArrayLike<number>, y: ArrayLike<number>, sx: (v: number) => number, sy: (v: number) => number, maxPts: number): string {
  const n = Math.min(x.length, y.length);
  const pts: string[] = [];
  let pen = false;
  const push = (px: number, py: number) => { pts.push(`${pen ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`); pen = true; };
  if (n <= maxPts) {
    for (let i = 0; i < n; i++) {
      const py = sy(y[i]);
      if (!Number.isFinite(py) || !Number.isFinite(x[i])) { pen = false; continue; }
      push(sx(x[i]), Math.max(-1e4, Math.min(1e4, py)));
    }
    return pts.join('');
  }
  const bucket = Math.ceil(n / (maxPts / 2));
  for (let s = 0; s < n; s += bucket) {
    let iMin = -1, iMax = -1;
    for (let i = s; i < Math.min(n, s + bucket); i++) {
      if (!Number.isFinite(y[i])) continue;
      if (iMin < 0 || y[i] < y[iMin]) iMin = i;
      if (iMax < 0 || y[i] > y[iMax]) iMax = i;
    }
    if (iMin < 0) { pen = false; continue; }
    const [a, b] = iMin < iMax ? [iMin, iMax] : [iMax, iMin];
    push(sx(x[a]), Math.max(-1e4, Math.min(1e4, sy(y[a]))));
    if (b !== a) push(sx(x[b]), Math.max(-1e4, Math.min(1e4, sy(y[b]))));
  }
  return pts.join('');
}
function nearestIndex(x: ArrayLike<number>, v: number): number {
  let lo = 0, hi = x.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= v) lo = mid; else hi = mid;
  }
  return Math.abs(x[lo] - v) <= Math.abs(x[hi] - v) ? lo : hi;
}

function Legend({ series }: { series: Series[] }) {
  const active = useLink();
  if (series.filter((s) => s.legend !== false).length < 2) return null;
  return (
    <div class="legend">
      {series.map((s, i) => {
        if (s.legend === false) return null;
        const slot = s.slot ?? i + 1;
        return (
          <span key={i} class={`item${s.link && active.value === s.link ? ' is-active' : ''}`} {...linkHandlers(active, s.link)} tabIndex={s.link ? 0 : undefined}>
            <svg width="28" height="10" aria-hidden="true">
              {s.points
                ? <circle cx="14" cy="5" r="3.5" fill={seriesColor(slot)} />
                : <line x1="1" y1="5" x2="27" y2="5" stroke={seriesColor(slot)} stroke-width={s.width ?? 2} stroke-dasharray={s.dash ?? seriesDash(slot)} stroke-linecap="round" />}
            </svg>
            {tr(s.name)}
          </span>
        );
      })}
    </div>
  );
}

function PlotFoot({ src, table, setTable, extra }: { src?: SrcRef; table: boolean; setTable: (v: boolean) => void; extra?: ComponentChildren }) {
  return (
    <div class="plot-foot">
      <span>{src && <SrcBadge src={src} />}{extra}</span>
      <button type="button" onClick={() => setTable(!table)} aria-expanded={table}>{tr(table ? { ko: '표 닫기', en: 'Hide table' } : { ko: '표로 보기', en: 'View as table' })}</button>
    </div>
  );
}

export function LineChart(p: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const active = useLink();
  const [hover, setHover] = useState<number | null>(null); // 데이터 x 좌표
  const [table, setTable] = useState(false);
  const height = p.height ?? 260;
  const m = { l: 54, r: 14, t: 10, b: 40 };
  const W = Math.max(width, 220), ih = height - m.t - m.b;
  const xd = p.xDomain ?? extent(p.series.map((s) => s.x));
  const yd0 = p.yDomain ?? extent([...p.series.map((s) => s.y), ...(p.refLines ?? []).filter((r) => r.y !== undefined).map((r) => [r.y!])], p.yLog);
  const yd: [number, number] = p.yDomain ? yd0 : p.yLog ? [yd0[0] / 1.5, yd0[1] * 1.5] : [yd0[0] - (yd0[1] - yd0[0]) * 0.06, yd0[1] + (yd0[1] - yd0[0]) * 0.06];
  const yt = p.yLog ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1], 5);
  m.l = Math.max(48, 26 + 6.2 * Math.max(...yt.map((v) => tickFmt(v, p.yLog).replace('^', '').length)));
  const iw = W - m.l - m.r;
  const sx = (v: number) => m.l + ((v - xd[0]) / (xd[1] - xd[0])) * iw;
  const sy = p.yLog
    ? (v: number) => (v > 0 ? m.t + ih - ((Math.log10(v) - Math.log10(yd[0])) / (Math.log10(yd[1]) - Math.log10(yd[0]))) * ih : NaN)
    : (v: number) => m.t + ih - ((v - yd[0]) / (yd[1] - yd[0])) * ih;
  const xt = niceTicks(xd[0], xd[1], W < 420 ? 4 : 6);
  const paths = useMemo(
    () => p.series.map((s) => (s.points ? '' : decimate(s.x, s.y, sx, sy, Math.max(200, iw * 2)))),
    [p.series, W, height, xd[0], xd[1], yd[0], yd[1], p.yLog],
  );
  const digits = p.digits ?? 3;
  const clipId = useMemo(() => `clip-${Math.random().toString(36).slice(2)}`, []);
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const v = xd[0] + ((e.clientX - r.left - m.l) / iw) * (xd[1] - xd[0]);
    setHover(Math.min(xd[1], Math.max(xd[0], v)));
  };
  const base = p.series[0];
  const onKey = (e: KeyboardEvent) => {
    if (!base || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const n = base.x.length;
    const cur = hover === null ? 0 : nearestIndex(base.x, hover);
    const stepN = Math.max(1, Math.round(n / (e.shiftKey ? 8 : 60)));
    setHover(base.x[Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? stepN : -stepN)))]);
  };
  const tipRows = hover === null ? [] : p.series.map((s, i) => {
    const k = nearestIndex(s.x, hover);
    return { s, i, k, x: k >= 0 ? s.x[k] : NaN, y: k >= 0 ? s.y[k] : NaN };
  });
  const tipX = hover === null ? 0 : sx(tipRows[0] && Number.isFinite(tipRows[0].x) ? tipRows[0].x : hover);
  const anyActive = p.series.some((s) => s.link && s.link === active.value) || (p.refLines ?? []).some((r) => r.link && r.link === active.value);
  return (
    <div class="plot" ref={ref} data-testid={p.testId}>
      {p.title && <div class="plot-title">{tr(p.title)}</div>}
      <Legend series={p.series} />
      {width > 0 && (
        <svg
          width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" {...({ tabindex: '0' } as any)}
          aria-label={`${p.title ? tr(p.title) + '. ' : ''}${tr(p.xLabel)} — ${tr(p.yLabel)}. ${tr({ ko: '좌우 방향키로 값을 읽을 수 있습니다.', en: 'Use left/right arrow keys to read values.' })}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
        >
          <defs><clipPath id={clipId}><rect x={m.l} y={m.t - 2} width={iw} height={ih + 4} /></clipPath></defs>
          {yt.map((v) => <line key={`gy${v}`} class="grid" x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} />)}
          {xt.map((v) => <text key={`tx${v}`} class="tick" x={sx(v)} y={m.t + ih + 15} text-anchor="middle">{tickFmt(v)}</text>)}
          {yt.map((v) => <TickText key={`ty${v}`} v={v} log={p.yLog} x={m.l - 6} y={sy(v) + 4} text-anchor="end" />)}
          <line class="axis" x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} />
          <line class="axis" x1={m.l} x2={m.l} y1={m.t} y2={m.t + ih} />
          <text class="axis-label" x={m.l + iw / 2} y={height - 4} text-anchor="middle">{tr(p.xLabel)}</text>
          <text class="axis-label" transform={`translate(12 ${m.t + ih / 2}) rotate(-90)`} text-anchor="middle">{tr(p.yLabel)}</text>
          <g clip-path={`url(#${clipId})`}>
            {(p.refLines ?? []).map((r, i) => {
              const on = r.link && r.link === active.value;
              const stroke = r.slot ? seriesColor(r.slot) : 'var(--text-2)';
              const common = { stroke, 'stroke-width': on ? 3 : 1.5, 'stroke-dasharray': '5 4', opacity: anyActive && !on ? 0.4 : 1 };
              return r.x !== undefined
                ? <line key={`r${i}`} x1={sx(r.x)} x2={sx(r.x)} y1={m.t} y2={m.t + ih} {...common} />
                : <line key={`r${i}`} x1={m.l} x2={m.l + iw} y1={sy(r.y!)} y2={sy(r.y!)} {...common} />;
            })}
            {p.series.map((s, i) => {
              const slot = s.slot ?? i + 1;
              const on = s.link && s.link === active.value;
              const opacity = (anyActive && !on ? 0.3 : 1) * (s.faint ? 0.45 : 1);
              if (s.points) {
                const n = Math.min(s.x.length, s.y.length), stride = Math.max(1, Math.ceil(n / 400));
                const dots = [];
                for (let k = 0; k < n; k += stride) {
                  const cy = sy(s.y[k]);
                  if (Number.isFinite(cy)) dots.push(<circle key={k} cx={sx(s.x[k])} cy={cy} r={on ? 4.5 : 3.5} fill={seriesColor(slot)} stroke="var(--surface)" stroke-width="1" />);
                }
                return <g key={i} opacity={opacity}>{dots}</g>;
              }
              return <path key={i} d={paths[i]} fill="none" stroke={seriesColor(slot)} stroke-width={(s.width ?? 2) + (on ? 1.5 : 0)} stroke-dasharray={s.dash ?? seriesDash(slot)} stroke-linejoin="round" stroke-linecap="round" opacity={opacity} />;
            })}
          </g>
          {(p.refLines ?? []).map((r, i) => r.label && (r.x !== undefined
            ? <text key={`rl${i}`} class="ref-label" x={Math.min(sx(r.x) + 5, m.l + iw - 4)} y={m.t + 12 + (i % 3) * 13} text-anchor={sx(r.x) > m.l + iw * 0.7 ? 'end' : 'start'} dx={sx(r.x) > m.l + iw * 0.7 ? -10 : 0}>{tr(r.label)}</text>
            : <text key={`rl${i}`} class="ref-label" x={m.l + iw - 4} y={sy(r.y!) - 5} text-anchor="end">{tr(r.label)}</text>))}
          {hover !== null && (
            <g pointer-events="none">
              <line x1={tipX} x2={tipX} y1={m.t} y2={m.t + ih} stroke="var(--text-3)" stroke-width="1" />
              {tipRows.map((r) => Number.isFinite(sy(r.y)) && sy(r.y) >= m.t - 2 && sy(r.y) <= m.t + ih + 2 && (
                <circle key={r.i} cx={sx(r.x)} cy={sy(r.y)} r="4" fill={seriesColor(r.s.slot ?? r.i + 1)} stroke="var(--surface)" stroke-width="2" />
              ))}
            </g>
          )}
          {p.children}
        </svg>
      )}
      {hover !== null && tipRows.length > 0 && (
        <div class="plot-tip" style={{ left: `${Math.min(Math.max(tipX + 10, 4), W - 170)}px`, top: `${m.t + 4}px` }}>
          <div class="t">{tr(p.xLabel)}: {fmt(tipRows[0].x, digits)}</div>
          {tipRows.map((r) => (
            <div key={r.i} class="tip-row">
              <svg width="16" height="8" aria-hidden="true" style={{ marginRight: '4px' }}><line x1="0" y1="4" x2="16" y2="4" stroke={seriesColor(r.s.slot ?? r.i + 1)} stroke-width="2" stroke-dasharray={r.s.dash ?? seriesDash(r.s.slot ?? r.i + 1)} /></svg>
              <b>{fmt(r.y, digits)}{unitOf(p.yLabel) ? ` ${unitOf(p.yLabel)}` : ''}</b> <span class="t">{tr(r.s.name)}</span>
            </div>
          ))}
        </div>
      )}
      <PlotFoot src={p.src} table={table} setTable={setTable} />
      {table && base && (
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th class="r">{tr(p.xLabel)}</th>{p.series.map((s, i) => <th key={i} class="r">{tr(s.name)}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: Math.min(12, base.x.length) }, (_, r) => {
                const k = Math.round((r * (base.x.length - 1)) / Math.max(1, Math.min(12, base.x.length) - 1));
                return (
                  <tr key={r}>
                    <td class="r">{fmt(base.x[k], digits)}</td>
                    {p.series.map((s, i) => { const j = nearestIndex(s.x, base.x[k]); const tol = 1e-6 * Math.max(1, Math.abs(xd[1] - xd[0])); return <td key={i} class="r">{j >= 0 && Math.abs(s.x[j] - base.x[k]) <= tol ? fmt(s.y[j], digits) : '—'}</td>; })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface HistogramProps {
  values: number[];
  xLabel: L | string;
  yLabel?: L | string;
  title?: L | string;
  bins?: number;
  range?: [number, number];
  height?: number;
  refLines?: RefLine[];
  /** 이론 밀도 f(x). 막대 높이(횟수)에 맞게 자동으로 스케일한다. */
  theory?: { name: L | string; pdf: (x: number) => number };
  /** 막대가 나타내는 자료의 이름(범례). 기본은 '시뮬레이션' */
  dataName?: L | string;
  slot?: number;
  src?: SrcRef;
  digits?: number;
  testId?: string;
}
export function Histogram(p: HistogramProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const active = useLink();
  const height = p.height ?? 220;
  const m = { l: 48, r: 12, t: 10, b: 40 };
  const W = Math.max(width, 220), iw = W - m.l - m.r, ih = height - m.t - m.b;
  const h = useMemo(() => histogram(p.values, p.bins ?? 30, p.range?.[0], p.range?.[1]), [p.values, p.bins, p.range?.[0], p.range?.[1]]);
  const xd: [number, number] = [h.edges[0], h.edges[h.edges.length - 1]];
  const bw = (xd[1] - xd[0]) / h.counts.length;
  const theoryPts = p.theory ? Array.from({ length: 121 }, (_, i) => { const x = xd[0] + ((xd[1] - xd[0]) * i) / 120; return [x, p.theory!.pdf(x) * h.n * bw]; }) : [];
  const ymax = Math.max(1, ...h.counts, ...theoryPts.map((q) => q[1])) * 1.08;
  const sx = (v: number) => m.l + ((v - xd[0]) / (xd[1] - xd[0])) * iw;
  const sy = (v: number) => m.t + ih - (v / ymax) * ih;
  const xt = niceTicks(xd[0], xd[1], W < 420 ? 4 : 6), yt = niceTicks(0, ymax, 4);
  const slot = p.slot ?? 1, digits = p.digits ?? 3;
  const yLabel = p.yLabel ?? { ko: '횟수', en: 'Count' };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover(Math.min(h.counts.length - 1, Math.max(0, (hover ?? -1) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  return (
    <div class="plot" ref={ref} data-testid={p.testId}>
      {p.title && <div class="plot-title">{tr(p.title)}</div>}
      {p.theory && (
        <div class="legend">
          <span class="item"><svg width="14" height="10" aria-hidden="true"><rect x="1" y="1" width="12" height="8" rx="2" fill={seriesColor(slot)} /></svg>{tr(p.dataName ?? { ko: '시뮬레이션', en: 'Simulation' })}</span>
          <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke="var(--text)" stroke-width="2" stroke-dasharray="6 3" /></svg>{tr(p.theory.name)}</span>
        </div>
      )}
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" {...({ tabindex: '0' } as any)} onKeyDown={onKey} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}
          aria-label={`${p.title ? tr(p.title) + '. ' : ''}${tr({ ko: '히스토그램', en: 'Histogram' })}: ${tr(p.xLabel)}. n = ${h.n}`}>
          {yt.map((v) => <line key={`g${v}`} class="grid" x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} />)}
          {yt.map((v) => <text key={`ty${v}`} class="tick" x={m.l - 6} y={sy(v) + 4} text-anchor="end">{tickFmt(v)}</text>)}
          {xt.map((v) => <text key={`tx${v}`} class="tick" x={sx(v)} y={m.t + ih + 15} text-anchor="middle">{tickFmt(v)}</text>)}
          {h.counts.map((c, i) => {
            const x0 = sx(h.edges[i]) + 1, x1 = sx(h.edges[i + 1]) - 1, y = sy(c);
            const w = Math.max(1, x1 - x0), r = Math.min(3, w / 2, (m.t + ih - y) / 2);
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={sx(h.edges[i])} y={m.t} width={Math.max(1, sx(h.edges[i + 1]) - sx(h.edges[i]))} height={ih} fill="transparent" />
                {c > 0 && <path d={`M${x0},${m.t + ih}V${y + r}Q${x0},${y} ${x0 + r},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${m.t + ih}Z`} fill={seriesColor(slot)} opacity={hover === null || hover === i ? 1 : 0.55} />}
              </g>
            );
          })}
          {p.theory && <path d={theoryPts.map((q, i) => `${i ? 'L' : 'M'}${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join('')} fill="none" stroke="var(--text)" stroke-width="2" stroke-dasharray="6 3" pointer-events="none" />}
          <line class="axis" x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} />
          {(p.refLines ?? []).filter((r) => r.x !== undefined && r.x >= xd[0] && r.x <= xd[1]).map((r, i) => {
            const on = r.link && r.link === active.value;
            return (
              <g key={`r${i}`} pointer-events="none">
                <line x1={sx(r.x!)} x2={sx(r.x!)} y1={m.t} y2={m.t + ih} stroke={r.slot ? seriesColor(r.slot) : 'var(--text-2)'} stroke-width={on ? 3 : 1.5} stroke-dasharray="5 4" />
                {r.label && <text class="ref-label" x={sx(r.x!)} y={m.t + 12 + (i % 3) * 13} dx={sx(r.x!) > m.l + iw * 0.7 ? -5 : 5} text-anchor={sx(r.x!) > m.l + iw * 0.7 ? 'end' : 'start'}>{tr(r.label)}</text>}
              </g>
            );
          })}
          <text class="axis-label" x={m.l + iw / 2} y={height - 4} text-anchor="middle">{tr(p.xLabel)}</text>
          <text class="axis-label" transform={`translate(12 ${m.t + ih / 2}) rotate(-90)`} text-anchor="middle">{tr(yLabel)}</text>
        </svg>
      )}
      {hover !== null && (
        <div class="plot-tip" style={{ left: `${Math.min(Math.max(sx(h.edges[hover]) + 8, 4), W - 160)}px`, top: `${m.t + 4}px` }}>
          <div class="t">{fmt(h.edges[hover], digits)} ~ {fmt(h.edges[hover + 1], digits)}</div>
          <div><b>{h.counts[hover]}</b> <span class="t">/ {h.n} ({fmt((100 * h.counts[hover]) / Math.max(1, h.n), 3)}%)</span></div>
        </div>
      )}
      <PlotFoot src={p.src} table={table} setTable={setTable} extra={<span> n = {h.n}</span>} />
      {table && (
        <div class="table-wrap" style={{ maxHeight: '240px', overflowY: 'auto' }}>
          <table class="tbl">
            <thead><tr><th class="r">{tr(p.xLabel)}</th><th class="r">{tr(yLabel)}</th></tr></thead>
            <tbody>{h.counts.map((c, i) => c > 0 && <tr key={i}><td class="r">{fmt(h.edges[i], digits)} ~ {fmt(h.edges[i + 1], digits)}</td><td class="r">{c}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface WaterfallItem { label: L | string; value: number; slot?: number; total?: boolean; src?: SrcRef; link?: string }
/** 누적 막대(워터폴): 항목이 차례로 더해져 합계가 되는 과정을 보여준다. 표 구조라 화면 낭독기에서도 읽힌다. */
export function Waterfall({ items, unit, digits = 3, testId, max }: { items: WaterfallItem[]; unit: string; digits?: number; testId?: string; max?: number }) {
  const active = useLink();
  let run = 0;
  const rows = items.map((it) => {
    const start = it.total ? 0 : run;
    if (!it.total) run += it.value;
    return { ...it, start, end: it.total ? it.value : run };
  });
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.end));
  return (
    <div class="table-wrap" data-testid={testId}>
      <table class="tbl" style={{ minWidth: '320px' }}>
        <tbody>
          {rows.map((r, i) => {
            const on = r.link && active.value === r.link;
            return (
              <tr key={i} class={r.total ? 'total' : ''} style={on ? { background: 'var(--hl)' } : undefined} {...linkHandlers(active, r.link)}>
                <td style={{ width: '38%', fontWeight: r.total ? 700 : 400 }}>{tr(r.label)}</td>
                <td style={{ width: '40%', verticalAlign: 'middle' }}>
                  <div style={{ position: 'relative', height: '18px', background: 'var(--surface-2)', borderRadius: '4px' }} aria-hidden="true">
                    <div style={{
                      position: 'absolute', top: '2px', bottom: '2px', left: `${(100 * r.start) / top}%`, width: `${Math.max(0.6, (100 * (r.end - r.start)) / top)}%`,
                      background: r.total ? 'var(--text-2)' : seriesColor(r.slot ?? 1), borderRadius: '0 4px 4px 0',
                    }} />
                  </div>
                </td>
                <td class="r" style={{ fontWeight: r.total ? 700 : 500 }}>{r.total ? '' : '+'}{fmt(r.value, digits)} {unit}{r.src && <SrcBadge src={r.src} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
