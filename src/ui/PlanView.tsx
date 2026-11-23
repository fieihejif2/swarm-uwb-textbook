/** 강당 평면도(위에서 본 모습). 히트맵, 드래그 가능한 앵커, 임의의 SVG 겹쳐 그리기를 지원한다. */
import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { L, fmt, tr } from '../app/i18n';
import { isDark } from '../app/store';
import { Vec } from '../sim/linalg';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { niceTicks, useWidth } from './Plot';
import { sequentialCss, sequentialRgb } from './theme';

export interface PlanScale { sx: (x: number) => number; sy: (y: number) => number; k: number }
export interface HeatLayer {
  /** values[row = y 인덱스][col = x 인덱스] */
  values: number[][];
  min: number;
  max: number;
  label: L | string;
  unit?: string;
}
export interface PlanViewProps {
  hall: { x: number; y: number };
  heat?: HeatLayer;
  anchors?: Vec[];
  /** 주면 앵커를 끌어서(또는 포커스 후 방향키로) 옮길 수 있다 */
  onAnchorMove?: (i: number, x: number, y: number) => void;
  /** 평면 위를 가리키거나 눌렀을 때의 좌표[m] */
  onProbe?: (x: number, y: number) => void;
  probe?: Vec | null;
  children?: (s: PlanScale) => ComponentChildren;
  maxHeight?: number;
  src?: SrcRef;
  caption?: ComponentChildren;
  testId?: string;
}

export function PlanView(p: PlanViewProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const m = { l: 44, r: 14, t: 14, b: 40 };
  const maxH = p.maxHeight ?? 420;
  let iw = Math.max(120, width - m.l - m.r);
  let ih = (iw * p.hall.y) / p.hall.x;
  if (ih > maxH) { ih = maxH; iw = (ih * p.hall.x) / p.hall.y; }
  const k = iw / p.hall.x;
  const sx = (x: number) => m.l + x * k;
  const sy = (y: number) => m.t + ih - y * k; // y 는 위쪽이 +
  const W = m.l + iw + m.r, H = m.t + ih + m.b;
  const dark = isDark.value;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !p.heat || width === 0) return;
    const rows = p.heat.values.length, cols = p.heat.values[0]?.length ?? 0;
    if (!rows || !cols) return;
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(cols, rows);
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const v = p.heat.values[rows - 1 - r][q]; // 캔버스는 위가 0
        const o = 4 * (r * cols + q);
        if (!Number.isFinite(v)) {
          const g = (r + q) % 2 ? 150 : 110; // 풀 수 없는 곳: 회색 체크무늬
          img.data[o] = g; img.data[o + 1] = g; img.data[o + 2] = g; img.data[o + 3] = 255;
        } else {
          const [R, G, B] = sequentialRgb((v - p.heat.min) / (p.heat.max - p.heat.min), dark);
          img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
        }
      }
    ctx.putImageData(img, 0, 0);
  }, [p.heat, width, dark]);
  const toMeters = (e: PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const x = (e.clientX - r.left - m.l) / k, y = (m.t + ih - (e.clientY - r.top)) / k;
    return [Math.min(p.hall.x, Math.max(0, x)), Math.min(p.hall.y, Math.max(0, y))];
  };
  const xt = niceTicks(0, p.hall.x, 5), yt = niceTicks(0, p.hall.y, 4);
  return (
    <div class="plot" ref={ref} data-testid={p.testId}>
      {width > 0 && (
        <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, maxWidth: '100%' }}>
          {p.heat && <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', left: `${m.l}px`, top: `${m.t}px`, width: `${iw}px`, height: `${ih}px`, imageRendering: 'auto', borderRadius: '2px' }} />}
          <svg
            ref={svg} width={W} height={H} style={{ position: 'absolute', inset: 0, touchAction: drag !== null ? 'none' : 'pan-y' }} role="group"
            aria-label={tr({ ko: `강당 평면도 ${fmt(p.hall.x)} × ${fmt(p.hall.y)} m`, en: `Hall floor plan ${fmt(p.hall.x)} × ${fmt(p.hall.y)} m` })}
            onPointerMove={(e) => {
              if (drag !== null && p.onAnchorMove) { const [x, y] = toMeters(e); p.onAnchorMove(drag, Math.round(x * 20) / 20, Math.round(y * 20) / 20); }
              else if (p.onProbe && e.pointerType === 'mouse') { const [x, y] = toMeters(e); p.onProbe(x, y); }
            }}
            onPointerDown={(e) => { if (p.onProbe && drag === null) { const [x, y] = toMeters(e); p.onProbe(x, y); } }}
            onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
          >
            {!p.heat && <rect x={m.l} y={m.t} width={iw} height={ih} fill="var(--surface-2)" />}
            {xt.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={m.t} y2={m.t + ih} stroke="var(--text-3)" stroke-width="0.5" opacity="0.35" />)}
            {yt.map((v) => <line key={`gy${v}`} x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} stroke="var(--text-3)" stroke-width="0.5" opacity="0.35" />)}
            <rect x={m.l} y={m.t} width={iw} height={ih} fill="none" stroke="var(--text-2)" stroke-width="1.5" />
            {xt.map((v) => <text key={`tx${v}`} class="tick" x={sx(v)} y={m.t + ih + 20} text-anchor="middle">{fmt(v)}</text>)}
            {yt.map((v) => <text key={`ty${v}`} class="tick" x={m.l - 11} y={sy(v) + 4} text-anchor="end">{fmt(v)}</text>)}
            <text class="axis-label" x={m.l + iw / 2} y={H - 4} text-anchor="middle">x [m]</text>
            <text class="axis-label" transform={`translate(11 ${m.t + ih / 2}) rotate(-90)`} text-anchor="middle">y [m]</text>
            {p.children?.({ sx, sy, k })}
            {p.probe && (
              <g pointer-events="none">
                <circle cx={sx(p.probe[0])} cy={sy(p.probe[1])} r="6" fill="none" stroke="var(--text)" stroke-width="2" />
                <line x1={sx(p.probe[0]) - 10} x2={sx(p.probe[0]) + 10} y1={sy(p.probe[1])} y2={sy(p.probe[1])} stroke="var(--text)" stroke-width="1.5" />
                <line x1={sx(p.probe[0])} x2={sx(p.probe[0])} y1={sy(p.probe[1]) - 10} y2={sy(p.probe[1]) + 10} stroke="var(--text)" stroke-width="1.5" />
              </g>
            )}
            {(p.anchors ?? []).map((a, i) => {
              const movable = !!p.onAnchorMove;
              const anchors = p.anchors ?? [];
              const same = (j: number) => Math.hypot(anchors[j][0] - a[0], anchors[j][1] - a[1]) * k < 14;
              const labelOf = (idx: number) => {
                // 같은 자리(화면에서 14 px 이내)의 앵커 중 번호가 가장 작은 것만 라벨을 단다
                const group = anchors.map((_, j) => j).filter(same);
                if (group[0] !== idx) return null;
                return { names: group.map((j) => `A${j}`).join('·'), zs: group.map((j) => fmt(anchors[j][2], 2)).join(' / ') };
              };
              return (
                <g
                  key={i} transform={`translate(${sx(a[0])} ${sy(a[1])})`} {...((movable ? { tabindex: '0' } : {}) as any)} role={movable ? 'slider' : 'img'}
                  aria-label={tr({ ko: `앵커 ${i}: x ${fmt(a[0])} m, y ${fmt(a[1])} m, 높이 ${fmt(a[2])} m${movable ? '. 방향키로 이동' : ''}`, en: `Anchor ${i}: x ${fmt(a[0])} m, y ${fmt(a[1])} m, height ${fmt(a[2])} m${movable ? '. Move with arrow keys' : ''}` })}
                  aria-valuetext={`${fmt(a[0])}, ${fmt(a[1])}`}
                  style={{ cursor: movable ? 'grab' : 'default', touchAction: 'none' }} data-testid={`anchor-${i}`}
                  onPointerDown={(e) => { if (!movable) return; e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDrag(i); }}
                  onKeyDown={(e) => {
                    if (!movable) return;
                    const d = e.shiftKey ? 1 : 0.25;
                    const mv: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
                    const v = mv[e.key];
                    if (!v) return;
                    e.preventDefault();
                    p.onAnchorMove!(i, Math.min(p.hall.x, Math.max(0, a[0] + v[0])), Math.min(p.hall.y, Math.max(0, a[1] + v[1])));
                  }}
                >
                  <circle r="16" fill="transparent" />
                  <rect x="-7" y="-7" width="14" height="14" rx="2" transform="rotate(45)" fill="var(--series-2)" stroke="var(--surface)" stroke-width="2" />
                  {labelOf(i) && (() => {
                    // 라벨은 강당 안쪽으로 놓는다(벽·눈금과 겹치지 않게). 같은 자리의 앵커는 라벨 하나로 합친다.
                    const right = a[0] < p.hall.x / 2, below = a[1] > p.hall.y / 2;
                    const lab = labelOf(i)!;
                    return (
                      <text x={right ? 11 : -11} y={below ? 18 : -10} text-anchor={right ? 'start' : 'end'} class="ref-label">
                        <tspan style={{ fontWeight: 700 }}>{lab.names}</tspan><tspan dx="4">z {lab.zs}</tspan>
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {p.heat && (
        <div class="legend" style={{ marginTop: '6px' }}>
          <span>{tr(p.heat.label)}{p.heat.unit ? ` [${p.heat.unit}]` : ''}</span>
          <span class="item num">
            {fmt(p.heat.min, 2)}
            <span aria-hidden="true" style={{ display: 'inline-block', width: '110px', height: '10px', borderRadius: '5px', background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => sequentialCss(t, dark)).join(',')})` }} />
            {p.heat.values.some((r) => r.some((v) => Number.isFinite(v) && v > p.heat!.max * (1 + 1e-9))) ? '≥ ' : ''}{fmt(p.heat.max, 2)}
          </span>
          <span class="item"><span aria-hidden="true" style={{ display: 'inline-block', width: '12px', height: '10px', background: 'repeating-conic-gradient(#969696 0% 25%, #6e6e6e 0% 50%) 50% / 6px 6px' }} />{tr({ ko: '풀 수 없음', en: 'unsolvable' })}</span>
          {p.src && <SrcBadge src={p.src} />}
        </div>
      )}
      {p.caption && <p class="muted small" style={{ margin: '4px 0 0' }}>{p.caption}</p>}
    </div>
  );
}
