import { useMemo, useRef, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { L, fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { compareGatedFixes, footprintSpan, gateMonteCarlo, obstacleBox, rangeErrorPdf, sampleRangeErrors, sampleTdoaErrors, tdoaErrorPdf, tdoaTwoPathGateStats, twoSidedTail } from '../../sim/ch4_nlos';
import type { SystemConfig } from '../../sim/config';
import { FusionParams, simulateFusion } from '../../sim/fusion';
import type { Vec } from '../../sim/linalg';
import { Box, NlosModel, gatedErrorStats, huberWeight, nlosFlags } from '../../sim/nlos';
import { pairsFor } from '../../sim/positioning';
import { mean, normCdf, quantile, rms } from '../../sim/stats';
import { SrcRef, der, ex, lit } from '../../sources';
import {
  Button, Caption, CfgSlider, CodeTask, CodeView, Demo, Derivation, Histogram, LineChart, LinkGroup, List, M, McPanel, Note, P, Pitfall, PlanScale, PlanView, Predict, Section,
  Segmented, Slider, SrcBadge, Stat, StatRow, Status, T, Toggle, niceTicks, useDebounced, useWidth,
} from '../../ui';
import { gatedUpdateTask, tasks } from './tasks';

const MODEL = der('ch4#nlos-positive', { ko: '이 장의 오차 모델 e = n + b (n 은 가우스, b 는 가려진 경로에서만 생기는 지수분포)로 만든 합성 표본', en: 'Synthetic samples from this chapter’s error model e = n + b (Gaussian n; exponential b only on a blocked path)' });
const FIXSRC = der('ch4#gate', { ko: '합성 측정 한 바퀴를 가우스-뉴턴으로 푼 위치 400개. 게이트는 예측 위치 기준 ν²/S ≤ k²', en: '400 positions solved by Gauss–Newton from synthetic measurement rounds; gate ν²/S ≤ k² around the predicted position' });
const SEFF = der('ch4#sigma-eff', { ko: '게이트를 통과한 오차의 분포를 수치 적분한 값', en: 'Numerical integration over the distribution of errors that pass the gate' });
const FUS = der('ch5#ekf', { ko: '5장의 UWB + IMU 필터 모델(확장 칼만 필터)을 이 조건으로 시뮬레이션한 결과', en: 'The UWB + IMU filter model of chapter 5 (extended Kalman filter) simulated under this condition' });
const LOCAL = { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' };
/** 후버 문턱 c_H. 5장 필터 엔진(fusion.ts → nlos.ts huberWeight)의 기본값과 같아야 한다. */
const HUBER_C = 1.5;
const PRESET = ex(undefined, { ko: '현상을 보여 주려고 고른 값입니다. 위 슬라이더로 바꿀 수 있습니다.', en: 'Values chosen to show the effect; change them with the sliders above.' });

/** 지금 측위 모드의 측정 노이즈 σ [m] 와 그 설정 경로 */
const sigmaOf = (cfg: SystemConfig, mode: 'twr' | 'tdoa' = cfg.uwb.mode) =>
  mode === 'twr' ? { sigma: cfg.uwb.sigmaTwr, path: 'uwb.sigmaTwr' } : { sigma: cfg.uwb.sigmaTdoa, path: 'uwb.sigmaTdoa' };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 수평 위치 오차의 산점도 (정사각형, 단위 cm) */
function Scatter({ title, pts, lim, square, src, testId }: { title: L; pts: Vec[]; lim: number; square?: boolean; src: SrcRef; testId?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const size = clamp(width, 220, 340);
  const m = { l: 46, r: 10, t: 8, b: 38 };
  const iw = size - m.l - m.r;
  const sx = (v: number) => m.l + ((v + lim) / (2 * lim)) * iw;
  const sy = (v: number) => m.t + iw - ((v + lim) / (2 * lim)) * iw;
  const ticks = niceTicks(-lim, lim, 4);
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const inside = pts.filter((p) => Math.abs(p[0]) <= lim && Math.abs(p[1]) <= lim);
  return (
    <div class="plot" ref={ref} data-testid={testId}>
      <div class="plot-title">{tr(title)}</div>
      {width > 0 && (
        <svg width={size} height={m.t + iw + m.b} role="img"
          aria-label={tr({ ko: `${tr(title)}. 수평 위치 오차 ${pts.length}개의 산점도. 평균 (${fmt(mx, 2)}, ${fmt(my, 2)}) cm`, en: `${tr(title)}. Scatter of ${pts.length} horizontal position errors. Mean (${fmt(mx, 2)}, ${fmt(my, 2)}) cm` })}>
          <rect x={m.l} y={m.t} width={iw} height={iw} fill="var(--surface-2)" stroke="var(--text-3)" />
          {ticks.map((v) => <line key={`gx${v}`} class="grid" x1={sx(v)} x2={sx(v)} y1={m.t} y2={m.t + iw} />)}
          {ticks.map((v) => <line key={`gy${v}`} class="grid" x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} />)}
          <line x1={sx(0)} x2={sx(0)} y1={m.t} y2={m.t + iw} stroke="var(--text-2)" stroke-width="1" />
          <line x1={m.l} x2={m.l + iw} y1={sy(0)} y2={sy(0)} stroke="var(--text-2)" stroke-width="1" />
          {ticks.map((v) => <text key={`tx${v}`} class="tick" x={sx(v)} y={m.t + iw + 14} text-anchor="middle">{fmt(v)}</text>)}
          {ticks.map((v) => <text key={`ty${v}`} class="tick" x={m.l - 6} y={sy(v) + 4} text-anchor="end">{fmt(v)}</text>)}
          {inside.map((p, i) => (square
            ? <rect key={i} x={sx(p[0]) - 2.2} y={sy(p[1]) - 2.2} width="4.4" height="4.4" fill="var(--series-3)" opacity="0.5" />
            : <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r="2.4" fill="var(--series-1)" opacity="0.5" />))}
          {Math.abs(mx) <= lim && Math.abs(my) <= lim && (
            <g pointer-events="none">
              <circle cx={sx(mx)} cy={sy(my)} r="8" fill="none" stroke="var(--text)" stroke-width="2" />
              <line x1={sx(mx) - 12} x2={sx(mx) + 12} y1={sy(my)} y2={sy(my)} stroke="var(--text)" stroke-width="2" />
              <line x1={sx(mx)} x2={sx(mx)} y1={sy(my) - 12} y2={sy(my) + 12} stroke="var(--text)" stroke-width="2" />
            </g>
          )}
          <text class="axis-label" x={m.l + iw / 2} y={m.t + iw + 32} text-anchor="middle">{tr({ ko: 'x 오차 [cm]', en: 'x error [cm]' })}</text>
          <text class="axis-label" transform={`translate(12 ${m.t + iw / 2}) rotate(-90)`} text-anchor="middle">{tr({ ko: 'y 오차 [cm]', en: 'y error [cm]' })}</text>
        </svg>
      )}
      <p class="muted small" style={{ margin: '2px 0 0' }}>
        {tr({ ko: `${square ? '■' : '●'} 위치 해 1개 · ⊕ 평균`, en: `${square ? '■' : '●'} one position fix · ⊕ mean` })}
        {inside.length < pts.length ? tr({ ko: ` · 그림 밖 ${pts.length - inside.length}개`, en: ` · ${pts.length - inside.length} outside the frame` }) : ''}
        <SrcBadge src={src} />
      </p>
    </div>
  );
}

/** 옆에서 본 그림: 앵커 → 태그 직선과 장애물의 높이 */
function SideView({ idx, a, p, boxes, blocked, hallZ }: { idx: number; a: Vec; p: Vec; boxes: Box[]; blocked: boolean; hallZ: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 220), H = 142;
  const m = { l: 46, r: 44, t: 16, b: 42 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const D = Math.max(Math.hypot(p[0] - a[0], p[1] - a[1]), 0.01);
  const sx = (d: number) => m.l + (d / D) * iw;
  const sz = (z: number) => m.t + ih - (z / hallZ) * ih;
  return (
    <div ref={ref} class="plot">
      {width > 0 && (
        <svg width={W} height={H} role="img"
          aria-label={tr({ ko: `옆에서 본 모습: 앵커 A${idx}(높이 ${fmt(a[2])} m)에서 태그(높이 ${fmt(p[2])} m)까지의 직선 경로. ${blocked ? '장애물에 가려짐' : '가려지지 않음'}`, en: `Side view: straight path from anchor A${idx} (height ${fmt(a[2])} m) to the tag (height ${fmt(p[2])} m). ${blocked ? 'Blocked by an obstacle' : 'Not blocked'}` })}>
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="var(--surface-2)" />
          {niceTicks(0, hallZ, 3).map((v) => <text key={`z${v}`} class="tick" x={m.l - 6} y={sz(v) + 4} text-anchor="end">{fmt(v)}</text>)}
          {niceTicks(0, D, 4).map((v) => <text key={`d${v}`} class="tick" x={sx(v)} y={m.t + ih + 14} text-anchor="middle">{fmt(v)}</text>)}
          {boxes.map((b, i) => {
            const sp = footprintSpan(a, p, b);
            return sp && (
              <g key={i}>
                <rect x={sx(sp[0] * D)} y={sz(b.max[2])} width={Math.max(2, sx(sp[1] * D) - sx(sp[0] * D))} height={sz(0) - sz(b.max[2])} fill="var(--surface-3)" stroke="var(--text)" stroke-width="1.5" />
                <text class="ref-label" x={(sx(sp[0] * D) + sx(sp[1] * D)) / 2} y={sz(b.max[2]) - 3} text-anchor="middle">{tr({ ko: `장애물 ${i + 1}`, en: `Obstacle ${i + 1}` })}</text>
              </g>
            );
          })}
          <line x1={m.l} x2={m.l + iw} y1={sz(0)} y2={sz(0)} stroke="var(--text-2)" stroke-width="1.5" />
          <line x1={sx(0)} y1={sz(a[2])} x2={sx(D)} y2={sz(p[2])} stroke={blocked ? 'var(--critical)' : 'var(--text-2)'} stroke-width="2" stroke-dasharray={blocked ? '6 4' : undefined} />
          <rect x={sx(0) - 5} y={sz(a[2]) - 5} width="10" height="10" transform={`rotate(45 ${sx(0)} ${sz(a[2])})`} fill="var(--series-2)" stroke="var(--surface)" stroke-width="1.5" />
          <circle cx={sx(D)} cy={sz(p[2])} r="6" fill="var(--series-1)" stroke="var(--surface)" stroke-width="1.5" />
          <text class="ref-label" x={sx(0) + 9} y={sz(a[2]) - 6} style={{ fontWeight: 700 }}>A{idx} {blocked ? '✕' : '✓'}</text>
          <text class="ref-label" x={sx(D) + 9} y={sz(p[2]) + 4}>{tr({ ko: '태그', en: 'Tag' })}</text>
          <text class="axis-label" x={m.l + iw / 2} y={H - 4} text-anchor="middle">{tr({ ko: `A${idx} 에서 태그 쪽으로 잰 수평 거리 [m]`, en: `Horizontal distance from A${idx} towards the tag [m]` })}</text>
          <text class="axis-label" transform={`translate(11 ${m.t + ih / 2}) rotate(-90)`} text-anchor="middle">z [m]</text>
        </svg>
      )}
    </div>
  );
}

interface Geo { tag: [number, number]; tagZ: number; b1: [number, number]; b2: [number, number]; boxH: number; two: boolean }

function ObstacleDemo() {
  const cfg = config.value;
  const hall = cfg.hall;
  const [mode, setMode] = useState<'twr' | 'tdoa'>(cfg.uwb.mode);
  const [geo, setGeo] = useState<Geo>({
    tag: [hall.x / 2, hall.y / 2], tagZ: Math.min(cfg.formation.height, hall.z), b1: [0.3 * hall.x, 0.3 * hall.y], b2: [0.72 * hall.x, 0.6 * hall.y], boxH: Math.min(2.5, hall.z), two: false,
  });
  const [sel, setSel] = useState(0);
  const [gateK, setGateK] = useState(cfg.uwb.gateSigma > 0 ? cfg.uwb.gateSigma : 3);
  const [predSigma, setPredSigma] = useState(0.1);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const { sigma, path: sigmaPath } = sigmaOf(cfg, mode);
  const bias = cfg.uwb.nlosBiasMean;
  const model: NlosModel = { sigma, pNlos: 0, biasMean: bias };
  const bw = Math.min(2, hall.x * 0.2), bd = Math.min(1.5, hall.y * 0.2);
  const boxesOf = (g: Geo): Box[] => [obstacleBox(g.b1[0], g.b1[1], bw, bd, g.boxH), ...(g.two ? [obstacleBox(g.b2[0], g.b2[1], bd, bd, g.boxH)] : [])];
  const boxes = boxesOf(geo);
  const p: Vec = [geo.tag[0], geo.tag[1], geo.tagZ];
  const flags = nlosFlags(cfg.anchors, p, boxes);
  const pairs = useMemo(() => pairsFor(cfg.anchors.length, 'ring'), [cfg.anchors.length]);
  const nMeas = mode === 'twr' ? cfg.anchors.length : pairs.length;
  const s = Math.min(sel, nMeas - 1);
  const [pi, pj] = pairs[s];
  const selBlocked = mode === 'twr' ? flags[s] : flags[pi] || flags[pj];
  const selI = mode === 'tdoa' && flags[pi], selJ = mode === 'tdoa' && flags[pj];

  // 선택한 측정의 오차 표본과 이론 밀도 (cm)
  const errs = useMemo(
    () => (mode === 'twr' ? sampleRangeErrors(model, flags[s], 4000, 7) : sampleTdoaErrors(model, flags[pi], flags[pj], 4000, 7)).map((v) => v * 100),
    [mode, sigma, bias, selBlocked, selI, selJ],
  );
  const pdfCm = (x: number) => (mode === 'twr' ? rangeErrorPdf(x / 100, sigma, bias, flags[s]) : tdoaErrorPdf(x / 100, sigma, bias, flags[pi], flags[pj])) / 100;
  const span = 4 * sigma + 4 * bias;
  const histRange: [number, number] = mode === 'twr' ? [-4 * sigma * 100, span * 100] : [-span * 100, span * 100];
  const theoMean = mode === 'twr' ? (flags[s] ? bias : 0) : (selJ ? bias : 0) - (selI ? bias : 0);

  // 게이트 유무에 따른 위치 해 (무거우므로 조작이 멈춘 뒤 계산)
  // 전역 값(σ, 편향)도 키에 넣어, 전역 슬라이더를 끄는 동안에는 무거운 위치 풀이(400회 × 2)를 미룬다
  const key = useDebounced(JSON.stringify({ geo, mode, gateK, predSigma, bias, sT: cfg.uwb.sigmaTwr, sD: cfg.uwb.sigmaTdoa }), 200);
  const cmp = useMemo(() => {
    const d = JSON.parse(key) as { geo: Geo; mode: 'twr' | 'tdoa'; gateK: number; predSigma: number };
    const pp: Vec = [d.geo.tag[0], d.geo.tag[1], d.geo.tagZ];
    const sg = sigmaOf(cfg, d.mode).sigma;
    const r = compareGatedFixes({ anchors: cfg.anchors, p: pp, flags: nlosFlags(cfg.anchors, pp, boxesOf(d.geo)), mode: d.mode, model: { sigma: sg, pNlos: 0, biasMean: bias }, gateK: d.gateK, predSigma: d.predSigma, n: 400, seed: 11 });
    const st = (e: Vec[]) => ({ rmsH: rms(e.map((v) => Math.hypot(v[0], v[1]))) * 100, shift: Math.hypot(mean(e.map((v) => v[0])), mean(e.map((v) => v[1]))) * 100, pts: e.map((v) => [v[0] * 100, v[1] * 100]) });
    const off = st(r.off), on = st(r.on);
    const lim = Math.max(20, Math.ceil(quantile(r.off.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1])) * 100), 0.98) / 10) * 10);
    return { r, off, on, lim, k: d.gateK };
  }, [key, cfg.anchors]);

  // 끌기 + 방향키
  const toM = (e: PointerEvent, sc: PlanScale): [number, number] => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    return [(e.clientX - r.left - sc.sx(0)) / sc.k, (sc.sy(0) - (e.clientY - r.top)) / sc.k];
  };
  const mover = (id: 'tag' | 'b1' | 'b2', sc: PlanScale) => {
    const cur = geo[id];
    const put = (x: number, y: number) => setGeo({ ...geo, [id]: [clamp(Math.round(x * 20) / 20, 0, hall.x), clamp(Math.round(y * 20) / 20, 0, hall.y)] });
    return {
      ...({ tabindex: '0' } as any), role: 'slider' as const, 'aria-valuetext': `x ${fmt(cur[0])} m, y ${fmt(cur[1])} m`, style: { cursor: 'grab', touchAction: 'none' },
      onPointerDown: (e: PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const [x, y] = toM(e, sc);
        drag.current = { id, dx: cur[0] - x, dy: cur[1] - y };
      },
      onPointerMove: (e: PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== id) return;
        e.stopPropagation();
        const [x, y] = toM(e, sc);
        put(x + d.dx, y + d.dy);
      },
      onPointerUp: () => { drag.current = null; },
      onPointerCancel: () => { drag.current = null; },
      onKeyDown: (e: KeyboardEvent) => {
        const st = e.shiftKey ? 1 : 0.25;
        const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
        const v = mv[e.key];
        if (!v) return;
        e.preventDefault();
        put(cur[0] + v[0], cur[1] + v[1]);
      },
    };
  };
  const blockedNames = flags.map((f, i) => (f ? `A${i}` : '')).filter(Boolean);
  const anchorOpts = cfg.anchors.map((_, i) => ({ value: i, label: `A${i} ${flags[i] ? '✕' : '✓'}` }));
  const pairOpts = pairs.map(([i, j], q) => ({ value: q, label: `d${j}−d${i} ${flags[i] || flags[j] ? '✕' : '✓'}` }));
  const sideIdx = mode === 'twr' ? [s] : [pi, pj];
  const gatedTitle = { ko: `게이트 켬 (k = ${fmt(cmp.k)})`, en: `Gate on (k = ${fmt(cmp.k)})` };
  const pending = key !== JSON.stringify({ geo, mode, gateK, predSigma, bias, sT: cfg.uwb.sigmaTwr, sD: cfg.uwb.sigmaTdoa });
  return (
    <>
    <Demo title={{ ko: '장애물을 놓으면 측정 분포가 바뀐다', en: 'Placing an obstacle changes the measurement distribution' }} testId="ch4-obstacle-demo">
      <P ko="강당을 위에서 본 그림입니다. 회색 상자(장애물)와 파란 원(태그 = 드론)을 **끌어서** 옮겨 보세요. 키보드로는 Tab 으로 고른 뒤 방향키(Shift 를 누르면 1 m 씩)로 옮깁니다. 앵커에서 태그까지의 직선이 상자를 지나면 그 경로는 NLOS 가 되고, 점선과 ✕ 로 표시됩니다."
        en="This is the hall seen from above. **Drag** the grey box (obstacle) and the blue circle (tag = drone). With the keyboard, Tab to one and use the arrow keys (Shift for 1 m steps). If the straight line from an anchor to the tag passes through a box, that path becomes NLOS and is drawn dashed with a ✕." />
      <Segmented label={{ ko: '측위 방식', en: 'Positioning mode' }} value={mode} onChange={setMode} testId="ch4-mode" options={[
        { value: 'twr', label: { ko: 'TWR (거리)', en: 'TWR (range)' } },
        { value: 'tdoa', label: { ko: 'TDoA (거리차)', en: 'TDoA (range difference)' } },
      ]} />
      <PlanView hall={hall} anchors={cfg.anchors} maxHeight={380} testId="ch4-plan">
        {(sc) => (
          <>
            {boxes.map((b, i) => {
              const id = i === 0 ? 'b1' : 'b2';
              return (
                <g key={id} {...mover(id, sc)} data-testid={`ch4-box-${i + 1}`}
                  aria-label={tr({ ko: `장애물 ${i + 1}. 높이 ${fmt(geo.boxH)} m. 방향키로 이동`, en: `Obstacle ${i + 1}. Height ${fmt(geo.boxH)} m. Move with arrow keys` })}>
                  <rect x={sc.sx(b.min[0])} y={sc.sy(b.max[1])} width={(b.max[0] - b.min[0]) * sc.k} height={(b.max[1] - b.min[1]) * sc.k} fill="var(--surface-3)" stroke="var(--text)" stroke-width="1.5" rx="2" />
                  <line x1={sc.sx(b.min[0])} y1={sc.sy(b.max[1])} x2={sc.sx(b.max[0])} y2={sc.sy(b.min[1])} stroke="var(--text-3)" stroke-width="1" />
                  <line x1={sc.sx(b.min[0])} y1={sc.sy(b.min[1])} x2={sc.sx(b.max[0])} y2={sc.sy(b.max[1])} stroke="var(--text-3)" stroke-width="1" />
                  <text class="ref-label" x={sc.sx((b.min[0] + b.max[0]) / 2)} y={sc.sy(b.min[1]) + 12} text-anchor="middle">{tr({ ko: `장애물 ${i + 1}`, en: `Obstacle ${i + 1}` })}</text>
                </g>
              );
            })}
            <g pointer-events="none">
              {cfg.anchors.map((a, i) => {
                // 같은 자리에 높이만 다른 앵커가 겹치므로 선을 조금 비켜 그린다
                const twin = cfg.anchors.findIndex((o, j) => j !== i && Math.abs(o[0] - a[0]) < 1e-6 && Math.abs(o[1] - a[1]) < 1e-6);
                const off = twin < 0 ? 0 : a[2] > cfg.anchors[twin][2] ? 3 : -3;
                const x1 = sc.sx(a[0]), y1 = sc.sy(a[1]), x2 = sc.sx(p[0]), y2 = sc.sy(p[1]);
                const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
                const nx = (-(y2 - y1) / len) * off, ny = ((x2 - x1) / len) * off;
                const on = mode === 'twr' ? i === s : i === pi || i === pj;
                const f = off > 0 ? 0.62 : 0.45;
                return (
                  <g key={i} opacity={on ? 1 : 0.75}>
                    <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} stroke={flags[i] ? 'var(--critical)' : 'var(--text-3)'} stroke-width={(flags[i] ? 2 : 1.2) + (on ? 1.5 : 0)} stroke-dasharray={flags[i] ? '6 4' : undefined} />
                    {flags[i] && <text class="ref-label" x={x1 + (x2 - x1) * f + nx * 3} y={y1 + (y2 - y1) * f + ny * 3 + 4} text-anchor="middle" style={{ fontWeight: 700, fill: 'var(--critical-text)' }}>✕A{i}</text>}
                  </g>
                );
              })}
            </g>
            <g {...mover('tag', sc)} data-testid="ch4-tag" aria-label={tr({ ko: `태그(드론). 높이 ${fmt(geo.tagZ)} m. 방향키로 이동`, en: `Tag (drone). Height ${fmt(geo.tagZ)} m. Move with arrow keys` })}>
              <circle cx={sc.sx(p[0])} cy={sc.sy(p[1])} r="18" fill="transparent" />
              <circle cx={sc.sx(p[0])} cy={sc.sy(p[1])} r="8" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" />
              <text class="ref-label" x={sc.sx(p[0])} y={sc.sy(p[1]) + 22} text-anchor="middle" style={{ fontWeight: 700 }}>{tr({ ko: '태그', en: 'Tag' })}</text>
            </g>
          </>
        )}
      </PlanView>
      <Caption>{tr({ ko: '실선 = LOS, 점선과 ✕ = NLOS. 마름모는 앵커(A번호, 높이 z). 같은 모서리에 높이가 다른 앵커 둘이 겹쳐 있으면 선을 조금 비켜 그렸습니다.', en: 'Solid = LOS, dashed with ✕ = NLOS. Diamonds are anchors (A-number, height z). Where two anchors of different height share a corner, their lines are drawn slightly apart.' })}</Caption>
      <div class="controls">
        <Slider label={{ ko: '장애물 높이', en: 'Obstacle height' }} value={geo.boxH} min={0.5} max={hall.z} step={0.1} unit="m" onChange={(v) => setGeo({ ...geo, boxH: v })} src={ex(undefined, { ko: '이 데모의 가정. 바닥에서 이 높이까지 꽉 찬 상자입니다.', en: 'An assumption of this demo: a solid box from the floor up to this height.' })} testId="ch4-box-h" />
        <Slider label={{ ko: '태그(드론) 높이', en: 'Tag (drone) height' }} value={geo.tagZ} min={0.2} max={hall.z} step={0.1} unit="m" onChange={(v) => setGeo({ ...geo, tagZ: v })} src={ex('formation.height', LOCAL)} testId="ch4-tag-z" />
        <CfgSlider path="uwb.nlosBiasMean" max={150} />
      </div>
      <Toggle label={{ ko: '장애물을 하나 더 놓기', en: 'Add a second obstacle' }} checked={geo.two} onChange={(v) => setGeo({ ...geo, two: v })} testId="ch4-two" />
      <p style={{ marginTop: '8px' }}>
        {blockedNames.length
          ? <Status kind="warn">{tr({ ko: `가려진 경로 ${blockedNames.length}개: ${blockedNames.join(', ')}`, en: `${blockedNames.length} blocked path(s): ${blockedNames.join(', ')}` })}</Status>
          : <Status kind="good">{tr({ ko: '모든 앵커가 보입니다 (전부 LOS)', en: 'Every anchor is visible (all LOS)' })}</Status>}
      </p>

      <h3>{tr({ ko: '① 측정 하나의 오차 분포', en: '① Error distribution of one measurement' })}</h3>
      <Segmented label={mode === 'twr' ? { ko: '어느 앵커까지의 거리를 볼까 (✕ = 가려짐)', en: 'Which anchor’s range to look at (✕ = blocked)' } : { ko: '어느 거리차를 볼까 (✕ = 둘 중 하나 이상 가려짐)', en: 'Which range difference to look at (✕ = at least one of the two blocked)' }}
        value={s} onChange={setSel} options={mode === 'twr' ? anchorOpts : pairOpts} testId="ch4-sel" />
      <div class="grid-2">
        <div>
          {sideIdx.map((i) => <SideView key={i} idx={i} a={cfg.anchors[i]} p={p} boxes={boxes} blocked={flags[i]} hallZ={hall.z} />)}
          <Caption>{tr({ ko: '옆에서 본 모습. 높이 달린 앵커는 낮은 장애물 위로 태그를 내려다볼 수 있습니다. 장애물 높이를 올려 보세요.', en: 'Side view. A high anchor can look down at the tag over a low obstacle. Try raising the obstacle.' })}</Caption>
        </div>
        <Histogram
          title={mode === 'twr'
            ? { ko: `A${s} 까지의 거리 오차 — ${flags[s] ? 'NLOS' : 'LOS'}`, en: `Range error to A${s} — ${flags[s] ? 'NLOS' : 'LOS'}` }
            : { ko: `거리차 d${pj}−d${pi} 의 오차 — ${selI && selJ ? '둘 다 가림' : selJ ? `A${pj} 가림` : selI ? `A${pi} 가림` : 'LOS'}`, en: `Error of d${pj}−d${pi} — ${selI && selJ ? 'both blocked' : selJ ? `A${pj} blocked` : selI ? `A${pi} blocked` : 'LOS'}` }}
          values={errs} bins={40} range={histRange} xLabel={{ ko: '측정 오차 (측정 − 참값) [cm]', en: 'Measurement error (measured − true) [cm]' }} slot={selBlocked ? 6 : 1}
          theory={{ name: selBlocked ? { ko: '이론: 지수수정 가우스', en: 'Theory: exponentially modified Gaussian' } : { ko: '이론: 가우스', en: 'Theory: Gaussian' }, pdf: pdfCm }}
          refLines={[{ x: 0, label: { ko: '참값', en: 'truth' } }]} src={MODEL} testId="ch4-hist" />
      </div>
      <StatRow>
        <Stat label={{ ko: '표본 평균 (편향)', en: 'Sample mean (bias)' }} value={mean(errs)} unit="cm" src={MODEL} status={selBlocked && Math.abs(theoMean) > 0 ? 'warn' : undefined} />
        <Stat label={{ ko: '모델의 평균', en: 'Mean of the model' }} value={theoMean * 100} unit="cm" src={der('ch4#nlos-positive', { ko: '가려진 경로마다 평균 b̄ 만큼. TDoA 는 j 쪽이면 +, i 쪽이면 −', en: 'b̄ per blocked path; for TDoA + on the j side, − on the i side' })} />
        <Stat label={{ ko: '표본 RMS', en: 'Sample RMS' }} value={rms(errs)} unit="cm" src={MODEL} />
        <Stat label={{ ko: 'LOS 의 σ', en: 'σ in LOS' }} value={sigma * 100} unit="cm" src={ex(sigmaPath)} />
      </StatRow>

    </Demo>
    <Demo title={{ ko: '② 그 측정들로 위치를 풀면 (위 카드의 장애물 배치 그대로)', en: '② Solving for position from those measurements (with the obstacle layout of the card above)' }} testId="ch4-fix-demo">
      <PlanView hall={hall} anchors={cfg.anchors} maxHeight={170} testId="ch4-fix-plan"
        caption={tr({ ko: `읽기 전용 축소판: 장애물과 태그는 위 카드에서 옮깁니다. 지금 가려진 경로 ${blockedNames.length}개${blockedNames.length ? ` (${blockedNames.join(', ')})` : ''}.`, en: `Read-only miniature: move the obstacles and the tag in the card above. Blocked paths now: ${blockedNames.length}${blockedNames.length ? ` (${blockedNames.join(', ')})` : ''}.` })}>
        {(sc) => (
          <g pointer-events="none">
            {boxes.map((bx, i) => <rect key={i} x={sc.sx(bx.min[0])} y={sc.sy(bx.max[1])} width={(bx.max[0] - bx.min[0]) * sc.k} height={(bx.max[1] - bx.min[1]) * sc.k} fill="var(--surface-3)" stroke="var(--text)" stroke-width="1.2" />)}
            {cfg.anchors.map((a, i) => flags[i] && <line key={i} x1={sc.sx(a[0])} y1={sc.sy(a[1])} x2={sc.sx(p[0])} y2={sc.sy(p[1])} stroke="var(--critical)" stroke-width="1.5" stroke-dasharray="5 3" />)}
            <circle cx={sc.sx(p[0])} cy={sc.sy(p[1])} r="6" fill="var(--series-1)" stroke="var(--surface)" stroke-width="1.5" />
          </g>
        )}
      </PlanView>
      <P ko="먼저 두 낱말만 정합니다(자세한 유도는 아래 '마할라노비스 게이팅'). **게이트**(gate)는 '예상과 $k$ 배 표준편차($k\sigma$)보다 더 다른 측정은 버린다'는 규칙이고, $k$ 를 **게이트 문턱**이라고 부릅니다. 여기서 '예상'은 필터가 직전 추정에서 예측해 둔 위치로 계산한 측정값입니다. 이 데모에는 필터가 없으므로, 참 위치에 축마다 표준편차 $\sigma_p$ 인 오차를 더한 **가짜 예측**을 매번 새로 만들어 씁니다. 그래서 $\sigma_p$ 가 클수록 '예상' 자체가 흐려집니다."
        en="First two words (derived in 'Mahalanobis gating' below). A **gate** is the rule 'reject a measurement that differs from what was expected by more than $k$ standard deviations ($k\sigma$)'; $k$ is the **gate threshold**. 'Expected' means the measurement computed from the position the filter predicted from its previous estimate. This demo has no filter, so each time it makes a **stand-in prediction**: the true position plus an error of standard deviation $\sigma_p$ on each axis. The larger $\sigma_p$, the blurrier the expectation itself." />
      <P ko="같은 측정 묶음을 두 가지로 풉니다. 왼쪽은 **전부** 써서, 오른쪽은 **게이트를 통과한 것만** 써서 2장의 가우스-뉴턴으로 풉니다. 점 하나가 위치 해 하나의 수평 오차입니다."
        en="The same measurement rounds are solved in two ways with the Gauss–Newton solver of chapter 2: on the left using **all** of them, on the right using **only those that pass the gate**. Each dot is the horizontal error of one position fix." />
      <div class="controls">
        <Slider label={{ ko: '게이트 문턱 $k$', en: 'Gate threshold $k$' }} value={gateK} min={1} max={6} step={0.5} unit="σ" onChange={setGateK} src={ex('uwb.gateSigma', LOCAL)} testId="ch4-demo-k" />
        <Slider label={{ ko: '예측 위치의 불확실성 $\\sigma_p$ (축당)', en: 'Uncertainty of the predicted position $\\sigma_p$ (per axis)' }} value={predSigma} min={0.02} max={0.5} step={0.01} scale={100} unit="cm" onChange={setPredSigma} src={ex(undefined, { ko: '필터가 직전 추정에서 예측한 위치가 참값에서 벗어나는 정도(가정). 5장에서 실제 값을 구합니다.', en: 'How far the filter’s predicted position is from the truth (assumed). Chapter 5 computes the real value.' })} testId="ch4-pred-sigma" />
      </div>
      <div class="grid-2">
        <Scatter title={{ ko: '게이트 끔: 모든 측정 사용', en: 'Gate off: all measurements used' }} pts={cmp.off.pts} lim={cmp.lim} src={FIXSRC} testId="ch4-scatter-off" />
        <Scatter title={gatedTitle} pts={cmp.on.pts} lim={cmp.lim} square src={FIXSRC} testId="ch4-scatter-on" />
      </div>
      <StatRow>
        <Stat label={{ ko: '수평 오차 RMS — 끔', en: 'Horizontal RMS error — off' }} value={cmp.off.rmsH} unit="cm" src={FIXSRC} />
        <Stat label={{ ko: '수평 오차 RMS — 켬', en: 'Horizontal RMS error — on' }} value={cmp.on.rmsH} unit="cm" src={FIXSRC} status={cmp.on.rmsH < 0.8 * cmp.off.rmsH ? 'good' : undefined} />
        <Stat label={{ ko: '평균이 밀린 거리 — 끔', en: 'Shift of the mean — off' }} value={cmp.off.shift} unit="cm" src={FIXSRC} status={cmp.off.shift > 3 ? 'warn' : undefined} />
        <Stat label={{ ko: '평균이 밀린 거리 — 켬', en: 'Shift of the mean — on' }} value={cmp.on.shift} unit="cm" src={FIXSRC} />
        <Stat label={{ ko: '가려진 측정 중 버린 비율', en: 'Blocked measurements rejected' }} value={cmp.r.nlosTotal ? (100 * cmp.r.nlosRejected) / cmp.r.nlosTotal : 0} unit="%" src={FIXSRC} />
        <Stat label={{ ko: '멀쩡한 측정 중 버린 비율', en: 'Good measurements rejected' }} value={cmp.r.losTotal ? (100 * cmp.r.losRejected) / cmp.r.losTotal : 0} unit="%" src={FIXSRC} />
      </StatRow>
      <P ko="눈여겨볼 점 세 가지. (1) 가려진 앵커가 하나만 있어도 게이트 없는 해는 **한쪽으로 통째로 밀립니다**. 잡음처럼 평균해서 없앨 수 없는 오차입니다. (2) 게이트는 가려진 측정을 전부 잡지 못합니다. 편향이 작은 것은 정상 측정과 구별되지 않아 새어 들어옵니다. (3) 예측이 불확실할수록($\sigma_p$ 를 키워 보세요) 게이트가 넓어져 더 많이 샙니다. 좋은 예측이 있어야 게이트가 날카로워집니다."
        en="Three things to notice. (1) A single blocked anchor is enough to **shift the whole cloud to one side** without a gate. Unlike noise, this error does not average out. (2) The gate does not catch every blocked measurement: small biases look like normal measurements and leak through. (3) The more uncertain the prediction (raise $\sigma_p$), the wider the gate and the more leaks. A sharp gate needs a good prediction." />
      {pending && <p class="small muted">{tr({ ko: '계산 중… (조작을 멈추면 다시 풉니다)', en: 'Computing… (re-solved once you stop adjusting)' })}</p>}
    </Demo>
    </>
  );
}

function SignDemo() {
  const cfg = config.value;
  const bias = cfg.uwb.nlosBiasMean;
  const [which, setWhich] = useState<'j' | 'i' | 'both'>('j');
  const sT = cfg.uwb.sigmaTwr, sD = cfg.uwb.sigmaTdoa;
  const nI = which !== 'j', nJ = which !== 'i';
  const r = useMemo(() => sampleRangeErrors({ sigma: sT, pNlos: 0, biasMean: bias }, true, 4000, 21).map((v) => v * 100), [sT, bias]);
  const d = useMemo(() => sampleTdoaErrors({ sigma: sD, pNlos: 0, biasMean: bias }, nI, nJ, 4000, 22).map((v) => v * 100), [sD, bias, which]);
  const lim = (4 * Math.max(sT, sD) + 4 * bias) * 100;
  return (
    <Demo title={{ ko: '같은 장애물, 다른 부호: 거리 대 거리차', en: 'Same obstacle, different sign: range versus range difference' }} testId="ch4-sign-demo">
      <P ko="왼쪽은 가려진 경로의 **거리** 오차, 오른쪽은 **거리차** $d_j - d_i$ 의 오차입니다. 어느 쪽 앵커가 가려졌는지 바꿔 보세요. 가로축 범위는 두 그림이 같습니다."
        en="Left: the error of a **range** on a blocked path. Right: the error of a **range difference** $d_j - d_i$. Switch which anchor is blocked. Both plots share the same horizontal range." />
      <Segmented label={{ ko: 'TDoA 에서 가려진 쪽', en: 'Blocked side in TDoA' }} value={which} onChange={setWhich} testId="ch4-sign-which" options={[
        { value: 'j', label: { ko: '앵커 j (더하는 쪽)', en: 'Anchor j (the added one)' } },
        { value: 'i', label: { ko: '앵커 i (빼는 쪽)', en: 'Anchor i (the subtracted one)' } },
        { value: 'both', label: { ko: '둘 다', en: 'Both' } },
      ]} />
      <div class="grid-2">
        <Histogram title={{ ko: 'TWR: 가려진 경로의 거리 오차', en: 'TWR: range error on a blocked path' }} values={r} bins={40} range={[-lim, lim]} slot={6} src={MODEL}
          xLabel={{ ko: '거리 오차 [cm]', en: 'Range error [cm]' }} refLines={[{ x: 0, label: { ko: '참값', en: 'truth' } }]}
          theory={{ name: { ko: '이론: 지수수정 가우스', en: 'Theory: exponentially modified Gaussian' }, pdf: (x) => rangeErrorPdf(x / 100, sT, bias, true) / 100 }} />
        <Histogram title={{ ko: 'TDoA: 거리차 오차', en: 'TDoA: range-difference error' }} values={d} bins={40} range={[-lim, lim]} slot={4} src={MODEL} testId="ch4-sign-hist"
          xLabel={{ ko: '거리차 오차 [cm]', en: 'Range-difference error [cm]' }} refLines={[{ x: 0, label: { ko: '참값', en: 'truth' } }]}
          theory={{ name: { ko: '이론: 지수수정 가우스(뒤집힘·섞임 포함)', en: 'Theory: EMG (mirrored / mixed as needed)' }, pdf: (x) => tdoaErrorPdf(x / 100, sD, bias, nI, nJ) / 100 }} />
      </div>
      <StatRow>
        <Stat label={{ ko: '거리 오차의 평균', en: 'Mean range error' }} value={mean(r)} unit="cm" src={MODEL} />
        <Stat label={{ ko: '거리차 오차의 평균', en: 'Mean range-difference error' }} value={mean(d)} unit="cm" src={MODEL} status={which === 'i' ? 'warn' : undefined} />
        <Stat label={{ ko: '거리차 오차의 RMS', en: 'RMS range-difference error' }} value={rms(d)} unit="cm" src={MODEL} />
      </StatRow>
      <P ko="거리 오차는 언제나 오른쪽(+)으로만 꼬리가 깁니다. 거리차는 가려진 쪽에 따라 꼬리가 **오른쪽으로도 왼쪽으로도** 갑니다. 둘 다 가려지면 평균은 0 근처로 돌아오지만 양쪽 꼬리가 모두 두꺼워집니다. 그래서 TDoA 에서는 '측정이 예상보다 크면 NLOS' 같은 한쪽 방향 규칙을 쓸 수 없고, 게이트도 양쪽을 다 봐야 합니다."
        en="A range error always has its long tail on the right (+). A range difference has its tail **on either side**, depending on which anchor is blocked. With both blocked the mean returns to about zero but both tails get heavy. So in TDoA a one-sided rule such as 'larger than expected means NLOS' does not work, and the gate must look at both sides." />
    </Demo>
  );
}

function GateDemo() {
  const cfg = config.value;
  const { sigma, path } = sigmaOf(cfg);
  const k = cfg.uwb.gateSigma;
  const model: NlosModel = { sigma, pNlos: cfg.uwb.pNlos, biasMean: cfg.uwb.nlosBiasMean };
  const sweep = useMemo(() => {
    const ks = Array.from({ length: 56 }, (_, i) => 0.5 + 0.1 * i);
    const g = ks.map((q) => gatedErrorStats(model, q));
    const mk = Array.from({ length: 12 }, (_, i) => 0.5 + 0.5 * i);
    const mc = gateMonteCarlo(model, mk, 40000, 5);
    return { ks, g, mk, mc, off: gatedErrorStats(model, 0) };
  }, [sigma, model.pNlos, model.biasMean]);
  const cur = gatedErrorStats(model, k);
  const falseRej = k > 0 ? 2 * (1 - normCdf(k)) : 0;
  const kLine = k > 0 ? [{ x: k, label: { ko: `지금 k = ${fmt(k)}`, en: `current k = ${fmt(k)}` }, slot: 3, link: 'gate' }] : [];
  const MC = der('ch4#sigma-eff', { ko: '선은 수치 적분(이론), 점은 오차 4만 개를 뽑아 직접 센 값(몬테카를로)', en: 'Lines: numerical integration (theory). Dots: counted from 40,000 sampled errors (Monte Carlo)' });
  return (
    <LinkGroup>
      <Demo title={{ ko: '문턱 k 를 어디에 둘까', en: 'Where to put the threshold k' }} testId="ch4-gate-demo">
        <M block tex={String.raw`\lk{innov}{\nu = z - h(\hat x)},\qquad \lk{S}{S = H P H^{\mathsf T} + R},\qquad \lk{gate}{\frac{\nu^{2}}{S} \le k^{2}}\ \Rightarrow\ \tx{받아들인다}{accept}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 아래 코드의 줄(맨 아래에 접혀 있음)과 그래프의 세로선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines (folded at the bottom) and the vertical line in the charts.' })}</p>
        <P ko="아래 네 값은 전역 설정입니다. 여기서 바꾸면 오차 예산의 $\sigma_{\text{eff}}$ 가 함께 바뀝니다. 그래프는 '측정 오차 $e$ 에 대해 $|e| \le k\sigma$ 이면 통과'라는 가장 단순한 경우(예측이 정확해서 혁신이 곧 측정 오차인 경우)를 그린 것입니다."
          en="The four values below are global settings; changing them here changes $\sigma_{\text{eff}}$ in the error budget. The charts show the simplest case, 'accept if $|e| \le k\sigma$ for measurement error $e$' (the prediction is exact, so the innovation is the measurement error)." />
        <div class="controls">
          <CfgSlider path="uwb.gateSigma" max={6} testId="ch4-gate-k" />
          <CfgSlider path="uwb.pNlos" max={50} />
          <CfgSlider path="uwb.nlosBiasMean" max={150} />
          <CfgSlider path={path} max={50} />
        </div>
        {k <= 0 && <p><Status kind="warn">{tr({ ko: '게이트가 꺼져 있습니다 (k = 0): 모든 측정을 받아들입니다', en: 'The gate is off (k = 0): every measurement is accepted' })}</Status></p>}
        <StatRow>
          <Stat label={{ ko: '멀쩡한 측정을 잘못 버릴 확률', en: 'Chance of rejecting a good measurement' }} value={falseRej * 100} unit="%" src={der('ch4#gate', { ko: '2(1 − Φ(k))', en: '2(1 − Φ(k))' })} status={k > 0 && falseRej > 0.05 ? 'bad' : undefined} />
          <Stat label={{ ko: 'NLOS 측정이 새어 들어올 확률', en: 'Chance an NLOS measurement leaks in' }} value={cur.acceptNlos * 100} unit="%" src={SEFF} />
          <Stat label={{ ko: '통과한 오차의 RMS $\\sigma_{\\text{eff}}$', en: 'RMS of accepted errors $\\sigma_{\\text{eff}}$' }} value={cur.rmsAccepted * 100} unit="cm" src={SEFF} />
          <Stat label={{ ko: '통과한 오차의 평균 (남은 편향)', en: 'Mean of accepted errors (residual bias)' }} value={cur.meanAccepted * 100} unit="cm" src={SEFF} />
          <Stat label={{ ko: '게이트를 끄면 $\\sigma_{\\text{eff}}$', en: '$\\sigma_{\\text{eff}}$ with the gate off' }} value={sweep.off.rmsAccepted * 100} unit="cm" src={SEFF} />
        </StatRow>
        <LineChart
          title={{ ko: '게이트를 통과하는 비율', en: 'Fraction passing the gate' }} xLabel={{ ko: '문턱 k [σ]', en: 'Threshold k [σ]' }} yLabel={{ ko: '통과 비율 [%]', en: 'Accepted [%]' }} height={240}
          series={[
            { name: { ko: 'LOS 측정 (이론) — 높을수록 좋음', en: 'LOS measurements (theory) — higher is better' }, x: sweep.ks, y: sweep.g.map((v) => v.acceptLos * 100), slot: 1, dash: '' },
            { name: { ko: 'NLOS 측정 (이론) — 낮을수록 좋음', en: 'NLOS measurements (theory) — lower is better' }, x: sweep.ks, y: sweep.g.map((v) => v.acceptNlos * 100), slot: 6, dash: '7 4' },
            { name: { ko: 'LOS (몬테카를로)', en: 'LOS (Monte Carlo)' }, x: sweep.mk, y: sweep.mc.acceptLos.map((v) => v * 100), slot: 1, points: true },
            { name: { ko: 'NLOS (몬테카를로)', en: 'NLOS (Monte Carlo)' }, x: sweep.mk, y: sweep.mc.acceptNlos.map((v) => v * 100), slot: 6, points: true },
          ]}
          refLines={kLine} yDomain={[0, 105]} src={MC} testId="ch4-accept-chart" />
        <LineChart
          title={{ ko: '통과한 오차의 크기', en: 'Size of the accepted errors' }} xLabel={{ ko: '문턱 k [σ]', en: 'Threshold k [σ]' }} yLabel={{ ko: '오차 [cm]', en: 'Error [cm]' }} height={240}
          series={[
            { name: { ko: 'σ_eff: 통과한 오차의 RMS (이론)', en: 'σ_eff: RMS of accepted errors (theory)' }, x: sweep.ks, y: sweep.g.map((v) => v.rmsAccepted * 100), slot: 1, dash: '' },
            { name: { ko: '남은 편향: 통과한 오차의 평균 (이론)', en: 'Residual bias: mean of accepted errors (theory)' }, x: sweep.ks, y: sweep.g.map((v) => v.meanAccepted * 100), slot: 4, dash: '2 3' },
            { name: { ko: 'σ_eff (몬테카를로)', en: 'σ_eff (Monte Carlo)' }, x: sweep.mk, y: sweep.mc.rms.map((v) => v * 100), slot: 1, points: true },
            { name: { ko: '남은 편향 (몬테카를로)', en: 'Residual bias (Monte Carlo)' }, x: sweep.mk, y: sweep.mc.mean.map((v) => v * 100), slot: 4, points: true },
          ]}
          refLines={[...kLine, { y: sigma * 100, label: { ko: 'LOS 만 있을 때의 σ', en: 'σ with LOS only' } }, { y: sweep.off.rmsAccepted * 100, label: { ko: '게이트 끔', en: 'gate off' }, slot: 6 }]}
          src={MC} testId="ch4-sigma-eff-chart" />
        <Caption>{tr({ ko: '왼쪽 끝(k 가 작음): σ_eff 는 작아 보이지만 LOS 측정까지 대부분 버린 결과입니다. 오른쪽 끝(k 가 큼): 아무것도 버리지 않아 "게이트 끔" 선에 다가갑니다. 쓸 만한 구간은 LOS 통과율이 100% 에 닿은 직후입니다.', en: 'Far left (small k): σ_eff looks small, but only because most LOS measurements were thrown away too. Far right (large k): nothing is rejected and the curve approaches the "gate off" line. The useful region is just after the LOS acceptance reaches 100%.' })}</Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch4-gate-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (아래 "손으로 짜 보기" 과제의 기준 구현입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference solution of the "Code it yourself" task below — keep it closed if you want to try first)' })}</summary>
          <CodeView code={gatedUpdateTask.solution} links={gatedUpdateTask.links} />
        </details>
      </Demo>
    </LinkGroup>
  );
}

/** 5장의 융합 필터를 빌려 쓰는 공통 조건 */
function fusionBase(cfg: SystemConfig): Omit<FusionParams, 'nlos' | 'gateK' | 'robust' | 'seed'> {
  return {
    anchors: cfg.anchors, hall: cfg.hall, height: Math.min(cfg.formation.height, cfg.hall.z - 0.5), uwbMode: cfg.uwb.mode, coupling: 'tight',
    uwbRate: 25, imuRate: 100, accelNoiseTrue: 0.3, accelNoiseFilter: cfg.estimation.accelNoise, measSigmaFilter: sigmaOf(cfg).sigma, speed: 1, T: 20,
  };
}
const FUSION_NOTE = {
  ko: '조건: 5장에서 만들 UWB + IMU 필터를 미리 빌려 씁니다. 측위 방식, 측정 노이즈 σ, 필터가 가정하는 가속도 노이즈({{cfg:estimation.accelNoise}})는 전역 설정을 따릅니다. 나머지는 **이 데모의 고정 가정**이라 여기서 바꿀 수 없고 전역 설정과도 무관합니다: 드론이 강당 안을 20초{{ex}} 동안 돌고, UWB 측정 한 바퀴는 25 Hz{{ex}}(3장에서 구한 갱신율 대신, 계산을 가볍게 하려고 고정), 참값을 만드는 가속도계 잡음은 0.3 m/s²{{ex}} 입니다. 필터는 이보다 큰 가속도 노이즈를 가정하므로 예측을 실제보다 덜 믿고, 그만큼 게이트도 실제 혁신 분포 기준으로는 $k\\sigma$ 보다 조금 느슨합니다. 예측 주기는 펌웨어 **소스 코드 상수**와 같은 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}} 로 골랐을 뿐, 이 모델이 펌웨어를 재현하는 것은 아닙니다(개념 모델).',
  en: 'Condition: we borrow the UWB + IMU filter that chapter 5 builds. The positioning mode, the measurement noise σ and the acceleration noise the filter assumes ({{cfg:estimation.accelNoise}}) follow the global settings. The rest are **fixed assumptions of this demo**: they cannot be changed here and are unrelated to the global settings. The drone circles inside the hall for 20 s{{ex}}; one UWB measurement round comes at 25 Hz{{ex}} (fixed to keep the computation light, instead of the rate found in chapter 3); the accelerometer noise used to generate the truth is 0.3 m/s²{{ex}}. The filter assumes a larger acceleration noise than that, so it trusts its prediction less than it could, and the gate is correspondingly a little looser than $k\\sigma$ measured against the real innovation distribution. The prediction period was simply set equal to the firmware **source-code constant** of 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}}; the model does not reproduce the firmware (a concept model).',
};

function RobustDemo() {
  const cfg = config.value;
  const [pN, setPN] = useState(cfg.uwb.pNlos);
  const [bias, setBias] = useState(cfg.uwb.nlosBiasMean);
  const [seed, setSeed] = useState(2);
  const k = cfg.uwb.gateSigma > 0 ? cfg.uwb.gateSigma : 3;
  // 전역 값도 키에 넣어, 전역 슬라이더를 끄는 동안에는 필터 시뮬레이션 3개를 미룬다
  const key = useDebounced(JSON.stringify({ pN, bias, seed, mode: cfg.uwb.mode, sT: cfg.uwb.sigmaTwr, sD: cfg.uwb.sigmaTdoa, an: cfg.estimation.accelNoise, h: cfg.formation.height, k }), 250);
  const runs = useMemo(() => {
    const d = JSON.parse(key) as { pN: number; bias: number; seed: number };
    const base = { ...fusionBase(cfg), nlos: { sigma: sigmaOf(cfg).sigma, pNlos: d.pN, biasMean: d.bias }, seed: d.seed };
    return [
      simulateFusion({ ...base, gateK: 0, robust: false }),
      simulateFusion({ ...base, gateK: k, robust: false }),
      simulateFusion({ ...base, gateK: 0, robust: true }),
    ];
  }, [key, cfg.anchors, cfg.hall]);
  const zs = Array.from({ length: 161 }, (_, i) => i * 0.05);
  const names: L[] = [
    { ko: '아무것도 안 함', en: 'Nothing' },
    { ko: `게이트 (k = ${fmt(k)})`, en: `Hard gate (k = ${fmt(k)})` },
    { ko: `후버 가중 (c_H = ${HUBER_C})`, en: `Huber weight (c_H = ${HUBER_C})` },
  ];
  const W = der('ch4#huber', { ko: '세 방법이 측정에 주는 가중치를 식 그대로 그린 것(게이트는 1 또는 0, 후버는 1 또는 c_H/u)', en: 'The weight each method gives a measurement, plotted from the formulas (gate: 1 or 0; Huber: 1 or c_H/u)' });
  return (
    <Demo title={{ ko: '버리기, 덜 믿기, 그냥 믿기', en: 'Reject, trust less, or just trust' }} testId="ch4-robust-demo">
      <LineChart
        title={{ ko: '혁신이 클수록 측정을 얼마나 믿는가', en: 'How much a measurement is trusted as the innovation grows' }}
        xLabel={{ ko: '정규화 혁신 |ν|/√S [σ]', en: 'Normalised innovation |ν|/√S [σ]' }} yLabel={{ ko: '가중치 w (1 = 그대로 믿음)', en: 'Weight w (1 = fully trusted)' }} height={210}
        series={[
          { name: names[0], x: zs, y: zs.map(() => 1), slot: 6, dash: '2 3' },
          { name: names[1], x: zs, y: zs.map((z) => (z <= k ? 1 : 0)), slot: 1, dash: '' },
          { name: names[2], x: zs, y: zs.map((z) => huberWeight(z, 1, HUBER_C)), slot: 3, dash: '7 4' },
        ]}
        yDomain={[-0.05, 1.1]} src={W} testId="ch4-weight-chart" />
      <P ko={`게이트는 문턱에서 가중치가 1 에서 0 으로 **뚝** 떨어집니다. 후버 가중은 문턱 $c_H$ 를 넘으면 $c_H/u$ 로 **서서히** 줄입니다. 0 이 되지는 않으므로, 필터가 틀린 자리에 있을 때도 측정이 조금씩은 끌어당겨 줍니다. 여기서 $c_H$ = ${HUBER_C}{{ex}} 는 5장 필터 엔진에 고정된 값이라 이 데모에서는 바꿀 수 없습니다. 아래에서 세 방법을 같은 비행, 같은 난수로 비교합니다.`}
        en={`The gate drops the weight from 1 to 0 **abruptly** at the threshold. The Huber weight decreases **gradually** as $c_H/u$ beyond its threshold $c_H$. It never reaches 0, so even when the filter sits in the wrong place the measurements still pull it a little. Here $c_H$ = ${HUBER_C}{{ex}} is fixed in the filter engine of chapter 5 and cannot be changed in this demo. Below, the three methods are compared on the same flight with the same random numbers.`} />
      <div class="controls">
        <Slider label={{ ko: 'NLOS 발생 확률', en: 'NLOS probability' }} value={pN} min={0} max={0.4} step={0.01} scale={100} unit="%" onChange={setPN} src={ex('uwb.pNlos', LOCAL)} testId="ch4-robust-p" />
        <Slider label={{ ko: 'NLOS 편향 평균 $\\bar b$', en: 'Mean NLOS bias $\\bar b$' }} value={bias} min={0} max={1.5} step={0.05} scale={100} unit="cm" onChange={setBias} src={ex('uwb.nlosBiasMean', LOCAL)} testId="ch4-robust-b" />
      </div>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => setSeed(seed + 1)} testId="ch4-robust-seed">{tr({ ko: '다른 난수로 다시', en: 'Different random numbers' })}</Button>
        <Button onClick={() => { setPN(0.2); setBias(1.0); }}>{tr({ ko: '심한 NLOS 로 (20 %, 100 cm)', en: 'Severe NLOS (20 %, 100 cm)' })}</Button>
        <SrcBadge src={PRESET} />
        <Button onClick={() => { setPN(cfg.uwb.pNlos); setBias(cfg.uwb.nlosBiasMean); }}>{tr({ ko: '설정값으로 되돌리기', en: 'Back to settings' })}</Button>
      </div>
      <LineChart
        title={{ ko: '위치 추정 오차', en: 'Position estimation error' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 오차 [cm]', en: 'Position error [cm]' }} yLog height={250}
        series={runs.map((r, i) => ({ name: names[i], x: r.t, y: r.err.map((v) => v * 100), slot: [6, 1, 3][i], dash: ['2 3', '', '7 4'][i], width: 1.6 }))}
        src={FUS} testId="ch4-robust-chart" />
      <StatRow>
        <Stat label={{ ko: 'RMSE — 아무것도 안 함', en: 'RMSE — nothing' }} value={runs[0].rmse * 100} unit="cm" src={FUS} />
        <Stat label={{ ko: 'RMSE — 게이트', en: 'RMSE — hard gate' }} value={runs[1].rmse * 100} unit="cm" src={FUS} status={runs[1].rmse > 2 * runs[2].rmse ? 'bad' : undefined} />
        <Stat label={{ ko: 'RMSE — 후버 가중', en: 'RMSE — Huber weight' }} value={runs[2].rmse * 100} unit="cm" src={FUS} />
        <Stat label={{ ko: '게이트가 버린 측정', en: 'Measurements the gate rejected' }} value={runs[1].total ? (100 * runs[1].rejected) / runs[1].total : 0} unit="%" src={FUS} status={runs[1].rejected > 0.5 * runs[1].total ? 'bad' : undefined} />
      </StatRow>
      <P class="muted small" ko={FUSION_NOTE.ko} en={FUSION_NOTE.en} />
      <P ko="설정값 근처에서는 게이트와 후버 가중이 비슷하게 좋습니다. '심한 NLOS' 단추를 누르고 난수를 몇 번 바꿔 보세요. 게이트 쪽이 가끔 **미터 단위로** 튀는 실행이 나옵니다. 버린 측정 비율이 갑자기 커졌다면 필터가 잠긴 것입니다. 왜 그런지는 아래 함정 실험실에서 다룹니다."
        en="Near the configured values the gate and the Huber weight do about equally well. Press 'Severe NLOS' and change the random numbers a few times: now and then the gated run jumps to **metres** of error. If the rejected fraction suddenly becomes large, the filter has locked itself out. The pitfall lab below explains why." />
    </Demo>
  );
}

function GatePitfall() {
  const cfg = config.value;
  const [obstacle, setObstacle] = useState(true);
  const [k, setK] = useState(0);
  const [pN, setPN] = useState(0.15);
  const [bias, setBias] = useState(0.6);
  const [seed, setSeed] = useState(2);
  const [sweep, setSweep] = useState<{ k: number[]; med: number[]; worst: number[]; tag: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sigma = sigmaOf(cfg).sigma;
  const tag = JSON.stringify({ obstacle, pN, bias, mode: cfg.uwb.mode, sigma });
  const key = useDebounced(JSON.stringify({ obstacle, k, pN, bias, seed, mode: cfg.uwb.mode, sigma, an: cfg.estimation.accelNoise, h: cfg.formation.height }), 250);
  const prm = (d: { obstacle: boolean; pN: number; bias: number }, gateK: number, sd: number): FusionParams =>
    ({ ...fusionBase(cfg), nlos: { sigma, pNlos: d.obstacle ? d.pN : 0, biasMean: d.bias }, gateK, robust: false, seed: sd });
  const runs = useMemo(() => {
    const d = JSON.parse(key) as { obstacle: boolean; k: number; pN: number; bias: number; seed: number };
    return { cur: simulateFusion(prm(d, d.k, d.seed)), ref: simulateFusion(prm(d, 3, d.seed)), k: d.k };
  }, [key, cfg.anchors, cfg.hall]);
  const rej = runs.cur.total ? runs.cur.rejected / runs.cur.total : 0;
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const ks = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
      const med: number[] = [], worst: number[] = [];
      for (const q of ks) {
        const e = [1, 2, 3, 4, 5, 6, 7].map((sd) => simulateFusion(prm({ obstacle, pN, bias }, q, sd)).rmse * 100);
        med.push(quantile(e, 0.5)); worst.push(Math.max(...e));
      }
      setSweep({ k: ks, med, worst, tag });
      setBusy(false);
    }, 30);
  };
  const offRmse = useMemo(() => mean([1, 2, 3, 4, 5, 6, 7].map((sd) => simulateFusion(prm({ obstacle, pN, bias }, 0, sd)).rmse * 100)), [sweep]);
  const curName = runs.k > 0 ? { ko: `지금: k = ${fmt(runs.k)}`, en: `Now: k = ${fmt(runs.k)}` } : { ko: '지금: 게이트 끔 (k = 0)', en: 'Now: gate off (k = 0)' };
  return (
    <Pitfall title={{ ko: '게이팅 없이 NLOS 를 받아들이기, 그리고 반대쪽 함정', en: 'Accepting NLOS without gating, and the opposite trap' }} testId="ch4-pitfall">
      <P ko="**함정 ①** '측정은 많을수록 좋으니 전부 넣자.' NLOS 측정은 평균이 0 이 아니어서, 넣을 때마다 추정값을 같은 쪽으로 끌고 갑니다. **함정 ②** '그럼 게이트를 바짝 조이자.' 문턱이 너무 좁으면 멀쩡한 측정까지 버립니다. 측정이 끊긴 필터는 IMU 만으로 버티다 조금씩 틀어지고, 틀어진 필터에게는 **맞는 측정이 이상치로 보입니다**. 그러면 더 버리고, 더 틀어집니다. 이렇게 스스로 측정을 잠가 버리는 것을 **잠김**(lock-out)이라고 부르겠습니다."
        en="**Trap ①** 'More measurements are better, so feed everything in.' NLOS measurements do not have zero mean, so every one of them drags the estimate the same way. **Trap ②** 'Then tighten the gate.' A threshold that is too narrow also rejects good measurements. A filter starved of measurements coasts on the IMU and slowly drifts, and to a drifted filter **the correct measurements look like outliers**. So it rejects more and drifts more. We will call this self-inflicted starvation **lock-out**." />
      <div class="controls">
        <Slider label={{ ko: '게이트 문턱 $k$ (0 = 끔)', en: 'Gate threshold $k$ (0 = off)' }} value={k} min={0} max={6} step={0.25} unit="σ" onChange={setK} src={ex('uwb.gateSigma', { ko: '이 실험에서만 바꾸는 값', en: 'Local to this experiment' })} testId="ch4-pitfall-k" />
        <Slider label={{ ko: 'NLOS 발생 확률', en: 'NLOS probability' }} value={pN} min={0.01} max={0.4} step={0.01} scale={100} unit="%" onChange={setPN} src={ex('uwb.pNlos', { ko: '이 실험에서만 쓰는 값. 일부러 전역 설정보다 나쁘게 잡았습니다.', en: 'Used only in this experiment; deliberately worse than the global setting.' })} testId="ch4-pitfall-p" />
        <Slider label={{ ko: 'NLOS 편향 평균 $\\bar b$', en: 'Mean NLOS bias $\\bar b$' }} value={bias} min={0.1} max={1.5} step={0.05} scale={100} unit="cm" onChange={setBias} src={ex('uwb.nlosBiasMean', { ko: '이 실험에서만 쓰는 값', en: 'Used only in this experiment' })} testId="ch4-pitfall-b" />
      </div>
      <Toggle label={{ ko: '장애물 있음 (끄면 NLOS 가 전혀 생기지 않습니다)', en: 'Obstacles present (off = no NLOS at all)' }} checked={obstacle} onChange={setObstacle} testId="ch4-pitfall-obstacle" />
      <div class="btn-row" style={{ margin: '8px 0 10px' }}>
        <Button onClick={() => { setObstacle(true); setK(0); }} testId="ch4-pitfall-off">{tr({ ko: '함정 ①: 게이트 끄기', en: 'Trap ①: gate off' })}</Button>
        <Button onClick={() => { setObstacle(true); setK(0.5); }} testId="ch4-pitfall-tight">{tr({ ko: '함정 ②: 바짝 조이기 (k = 0.5)', en: 'Trap ②: very tight (k = 0.5)' })}</Button>
        <Button onClick={() => setK(3)}>{tr({ ko: '비교 기준 (k = 3)', en: 'Reference (k = 3)' })}</Button>
        <SrcBadge src={PRESET} />
        <Button onClick={() => setSeed(seed + 1)}>{tr({ ko: '다른 난수로 다시', en: 'Different random numbers' })}</Button>
      </div>
      <LineChart
        title={{ ko: '위치 추정 오차 (세로축은 로그)', en: 'Position estimation error (log vertical axis)' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 오차 [cm]', en: 'Position error [cm]' }} yLog height={250}
        series={[
          { name: curName, x: runs.cur.t, y: runs.cur.err.map((v) => v * 100), slot: 6, dash: '', width: 2.2 },
          { name: { ko: '비교: k = 3', en: 'Reference: k = 3' }, x: runs.ref.t, y: runs.ref.err.map((v) => v * 100), slot: 1, dash: '7 4', width: 1.5 },
        ]}
        src={FUS} testId="ch4-pitfall-chart" />
      <StatRow>
        <Stat label={{ ko: 'RMSE — 지금 설정', en: 'RMSE — current setting' }} value={runs.cur.rmse * 100} unit="cm" src={FUS} status={runs.cur.rmse > 2 * runs.ref.rmse ? 'bad' : runs.cur.rmse > 1.3 * runs.ref.rmse ? 'warn' : 'good'} />
        <Stat label={{ ko: 'RMSE — k = 3', en: 'RMSE — k = 3' }} value={runs.ref.rmse * 100} unit="cm" src={FUS} />
        <Stat label={{ ko: '버린 측정의 비율', en: 'Fraction of measurements rejected' }} value={rej * 100} unit="%" src={FUS} status={rej > 0.5 ? 'bad' : rej > 0.25 ? 'warn' : undefined} />
      </StatRow>
      <p>
        {rej > 0.5
          ? <Status kind="bad">{tr({ ko: '잠김: 측정의 절반 이상을 버리고 있습니다. 필터는 거의 IMU 만으로 날고 있습니다.', en: 'Locked out: more than half of the measurements are rejected. The filter is flying almost on the IMU alone.' })}</Status>
          : runs.k <= 0 && obstacle
            ? <Status kind="warn">{tr({ ko: '게이트가 꺼져 있어 NLOS 측정이 그대로 추정값을 끌고 갑니다.', en: 'The gate is off, so NLOS measurements drag the estimate unchecked.' })}</Status>
            : <Status kind="good">{tr({ ko: '이 실행에서는 잠기지 않았습니다.', en: 'No lock-out in this run.' })}</Status>}
      </p>
      <P class="muted small" ko={FUSION_NOTE.ko} en={FUSION_NOTE.en} />
      <p class="small muted">{tr({ ko: '아래 단추를 누르면 그래프가 하나 그려집니다. 가로축은 게이트 문턱 k, 세로축은 20초 비행 한 번의 RMSE(위치 오차의 RMS, 0장의 통계 복습 참고, 로그 눈금)입니다. 같은 조건을 난수 7가지로 날려 가운데 값과 가장 나쁜 값을 그리고, 게이트를 끈 7번의 평균을 가로선으로 겹칩니다.', en: 'The button below draws one chart. Horizontal axis: gate threshold k; vertical axis: the RMSE of one 20 s flight (RMS of the position error, see the statistics review in chapter 0; log scale). The same condition is flown with seven random seeds; the median and the worst run are drawn, and the mean of seven gate-off runs is overlaid as a horizontal line.' })}</p>
      <Button primary onClick={run} disabled={busy} testId="ch4-pitfall-run">{busy ? tr({ ko: '계산 중…', en: 'Computing…' }) : tr({ ko: '▶ 문턱 k 를 바꿔 가며 RMSE 재기 (난수 7가지)', en: '▶ Measure RMSE across thresholds k (seven seeds)' })}</Button>
      {sweep && (
        <>
          <LineChart
            title={{ ko: '문턱에 따른 위치 오차 (세로축은 로그)', en: 'Position error versus threshold (log vertical axis)' }} xLabel={{ ko: '문턱 k [σ]', en: 'Threshold k [σ]' }} yLabel={{ ko: 'RMSE [cm]', en: 'RMSE [cm]' }} yLog height={250}
            series={[
              { name: { ko: '7번 중 가운데 값', en: 'Median of seven runs' }, x: sweep.k, y: sweep.med, slot: 1, dash: '' },
              { name: { ko: '7번 중 가장 나쁜 값', en: 'Worst of seven runs' }, x: sweep.k, y: sweep.worst, slot: 6, dash: '7 4' },
              { name: { ko: '가운데 값(점)', en: 'Median (points)' }, x: sweep.k, y: sweep.med, slot: 1, points: true },
              { name: { ko: '가장 나쁜 값(점)', en: 'Worst (points)' }, x: sweep.k, y: sweep.worst, slot: 6, points: true },
            ]}
            refLines={[{ y: offRmse, label: { ko: `게이트 끔 (평균 ${fmt(offRmse, 3)} cm)`, en: `gate off (mean ${fmt(offRmse, 3)} cm)` }, slot: 4 }]}
            src={FUS} testId="ch4-pitfall-sweep" />
          {sweep.tag !== tag && <p class="muted small">{tr({ ko: '조건이 바뀌었습니다. 단추를 다시 눌러 그래프를 갱신하세요.', en: 'The condition changed. Press the button again to refresh the chart.' })}</p>}
          <P ko="왼쪽 끝은 잠김으로 오차가 미터 단위입니다. 오른쪽으로 갈수록 '게이트 끔' 선에 다가갑니다. 그 사이에 바닥이 있습니다. 주의해서 볼 것은 **가운데 값과 가장 나쁜 값의 차이**입니다. 바닥 근처의 문턱에서도 일곱 번 중 한 번은 잠길 수 있습니다. 딱 끊는 게이트는 평균적으로는 좋지만, 한 번 잠기면 스스로 빠져나오지 못합니다."
            en="At the far left lock-out gives errors of metres. Towards the right the curve approaches the 'gate off' line. In between there is a floor. Watch **the gap between the median and the worst run**: even at a threshold near the floor, one run in seven may lock out. A hard gate is good on average, but once locked out it cannot get out by itself." />
        </>
      )}
      <McPanel
        title={{ ko: '같은 설정으로 반복했을 때의 RMSE 분포', en: 'Distribution of RMSE over repeated runs' }} experiment="fusion" metric="rmse" testId="ch4-mc" defaultRuns={100}
        params={prm({ obstacle, pN, bias }, k, 1)} xLabel={{ ko: '한 번의 비행에서 위치 RMSE [m]', en: 'Position RMSE of one flight [m]' }}
        threshold={{ value: 0.5, label: { ko: 'RMSE 가 0.5 m 를 넘은 비행 (잠김)', en: 'Flights with RMSE above 0.5 m (lock-out)' }, above: true }} src={FUS}
        note={{ ko: '위 슬라이더의 조건(문턱 k, NLOS 확률, 편향)으로 난수만 바꿔 반복합니다. 히스토그램의 가로축은 비행 한 번의 RMSE, 세로축은 그런 비행의 수입니다. 0.5 m{{ex}} 는 "잠겼다"고 볼 기준으로 잡은 값이고, 세로 기준선보다 오른쪽에 있는 비행이 잠긴 비행입니다. k 를 1.5 ~ 2 로 두고 돌려 보세요. 대부분은 멀쩡하고 몇 번만 크게 틀립니다.', en: 'Repeats the condition of the sliders above (threshold k, NLOS probability, bias) with different random numbers. The histogram\'s horizontal axis is the RMSE of one flight and the vertical axis the number of such flights. 0.5 m{{ex}} is the level we take to mean "locked out"; flights to the right of that vertical line are locked out. Try k between 1.5 and 2: most runs are fine and a few are badly wrong.' }} />
      <P ko="**대처.** (1) 문턱은 넉넉하게: 멀쩡한 측정을 버릴 확률을 1%{{ex}} 아래로 두기로 하면 $k \ge 2.6${{der:ch4#gate|2(1 − Φ(k)) ≤ 1% 를 풀면 k ≥ 2.58|Solving 2(1 − Φ(k)) ≤ 1% gives k ≥ 2.58}} 이고, 그쪽에서 시작합니다. (2) 버린 비율을 감시해서, 너무 많이 버리고 있으면 게이트를 **열어 줍니다**. Crazyflie 의 TDoA 이상치 필터가 바로 이렇게 합니다. 좋은 표본의 비율을 계속 세다가 10% 아래로 떨어지면 필터를 열고, 90% 위로 올라오면 다시 닫습니다{{lit:cf-firmware-docs/tdoa-outlier-filter}}. (3) 딱 끊지 말고 덜 믿는 강건 갱신을 씁니다."
        en="**What to do.** (1) Keep the threshold generous: if you decide to keep the chance of rejecting a good measurement below 1%{{ex}}, that means $k \ge 2.6${{der:ch4#gate|2(1 − Φ(k)) ≤ 1% 를 풀면 k ≥ 2.58|Solving 2(1 − Φ(k)) ≤ 1% gives k ≥ 2.58}}; start from there. (2) Monitor the rejected fraction and **open** the gate when too much is being rejected. The Crazyflie TDoA outlier filter does exactly that: it keeps counting the share of good samples, opens the filter when it falls below 10% and closes it again above 90%{{lit:cf-firmware-docs/tdoa-outlier-filter}}. (3) Use a robust update that trusts less instead of cutting off." />
    </Pitfall>
  );
}

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const { sigma, path } = sigmaOf(cfg);
  const bias = cfg.uwb.nlosBiasMean, pN = cfg.uwb.pNlos;
  const model: NlosModel = { sigma, pNlos: pN, biasMean: bias };
  const rmsNlos = Math.sqrt(sigma * sigma + 2 * bias * bias);
  const tail = gatedErrorStats({ sigma, pNlos: 1, biasMean: bias }, 3);
  const off = gatedErrorStats(model, 0);
  const rows = [1, 1.5, 2, 2.5, 3, 4].map((k) => ({ k, p: twoSidedTail(k) }));
  const two = tdoaTwoPathGateStats(model, cfg.uwb.gateSigma), twoOff = tdoaTwoPathGateStats(model, 0);
  const huberKeep = 1 - twoSidedTail(HUBER_C);
  const expX = Array.from({ length: 61 }, (_, i) => (i / 60) * 5 * bias * 100);
  const TWO = '{{der:ch4#sigma-eff|TDoA 의 두 경로 섞임 모델로 위와 같은 적분을 수치로 계산한 값|The same integrals evaluated numerically with the two-path mixture model of TDoA}}';
  const G = der('ch4#gate', { ko: '2(1 − Φ(k)) 를 계산한 값', en: '2(1 − Φ(k)) evaluated' });
  return (
    <>
      <Section id="why" title={{ ko: '가려진 전파는 어떻게 되나', en: 'What happens to a blocked signal' }}>
        <P ko="3장까지는 UWB 측정 오차를 **평균이 0 인 가우스 잡음**으로 다뤘습니다. 앵커와 태그 사이가 훤히 뚫린 **가시선**(line of sight, LOS) 조건에서는 쓸 만한 가정입니다. 그런데 강당에는 기둥, 철제 캐비닛, 사람, 그리고 다른 드론이 있습니다. 직선 경로가 가려진 **비가시선**(non-line of sight, NLOS) 조건에서는 오차의 모양이 달라집니다. 평균이 0 에서 벗어나고(**편향**, bias), 가끔 터무니없이 큰 값이 섞입니다(**이상치**, outlier)."
          en="Up to chapter 3 we treated the UWB measurement error as **zero-mean Gaussian noise**. With a clear **line of sight** (LOS) between anchor and tag that is a usable assumption. But a hall contains pillars, steel cabinets, people and other drones. When the straight path is blocked, **non-line of sight** (NLOS), the error changes shape: its mean moves away from zero (a **bias**) and now and then an absurdly large value appears (an **outlier**)." />
        <P ko="전파는 직선으로만 오지 않습니다. 벽과 바닥에 반사된 전파가 조금 늦게 함께 도착합니다. 이것을 **다중경로**(multipath)라고 합니다. 이 교재의 모델은 수신기가 거리를 '가장 먼저 도착한 신호의 도착 시각'으로 잰다고 둡니다(시각으로 거리를 재는 수신기의 일반적인 동작을 전제한 것이며, 특정 칩의 내부 동작을 옮긴 것은 아닙니다). 그러면 직선 경로가 살아 있는 동안에는 뒤따라오는 반사파가 큰 문제를 일으키지 않습니다. 문제는 직선 경로가 막혔을 때입니다."
          en="Radio does not arrive along the straight line only. Reflections off walls and the floor arrive slightly later. This is **multipath**. The model of this textbook assumes the receiver measures range from the arrival time of the earliest signal (the general behaviour of a time-of-arrival receiver, not the internals of a particular chip). Then, as long as the straight path survives, the reflections that follow do little harm. The trouble starts when the straight path is blocked." />
        <Predict id="ch4-range-sign"
          question={{ ko: '앵커와 드론 사이에 철제 캐비닛이 끼어들었습니다. UWB 로 잰 거리는 실제 직선거리와 비교해 어떻게 될까요?', en: 'A steel cabinet gets between an anchor and the drone. How does the UWB range compare with the true straight-line distance?' }}
          choices={[
            { label: { ko: '더 짧게 나온다 — 신호가 약해져서 가까운 것처럼 보인다', en: 'Shorter — the weaker signal makes it look closer' } },
            { label: { ko: '더 길게 나온다 — 신호가 늦게 도착한다', en: 'Longer — the signal arrives late' }, correct: true },
            { label: { ko: '길 때도 짧을 때도 있어서 평균은 그대로다', en: 'Sometimes longer, sometimes shorter; the mean is unchanged' } },
          ]}
          explain={{
            ko: '**더 길게 나옵니다.** UWB 는 신호의 세기가 아니라 **도착 시각**으로 거리를 잽니다. 가려진 신호는 장애물을 뚫고 오느라 느려지거나, 다른 곳에 반사되어 돌아서 옵니다. 어느 쪽이든 직선으로 올 때보다 **늦게** 도착하고, 일찍 도착하는 방법은 없습니다. 그래서 거리 오차는 한쪽(+)으로 치우칩니다.',
            en: '**Longer.** UWB measures range from the **arrival time**, not the signal strength. A blocked signal is either slowed down while passing through the obstacle or takes a detour via a reflection. Either way it arrives **later** than along the straight line, and there is no way to arrive earlier. So the range error is biased to one side (+).',
          }} />
        <Predict id="ch4-tdoa-sign"
          question={{ ko: '그럼 TDoA 는 어떨까요? TDoA 는 두 앵커까지의 거리의 **차** $d_j - d_i$ 를 잽니다. 두 앵커 중 하나로 가는 길이 가려지면 거리차 측정은?', en: 'What about TDoA? TDoA measures the **difference** of the distances to two anchors, $d_j - d_i$. If the path to one of the two anchors is blocked, the measured difference is…' }}
          choices={[
            { label: { ko: '거리와 마찬가지로 항상 커진다', en: 'always larger, just like a range' } },
            { label: { ko: '항상 작아진다', en: 'always smaller' } },
            { label: { ko: '어느 쪽 앵커가 가려졌느냐에 따라 커지기도 하고 작아지기도 한다', en: 'larger or smaller, depending on which anchor is blocked' }, correct: true },
          ]}
          explain={{
            ko: '**양쪽 다 가능합니다.** 앵커 $j$ 쪽 길이 가려지면 $d_j$ 가 길게 재어져 차가 **커지고**, 앵커 $i$ 쪽 길이 가려지면 $d_i$ 가 길게 재어져 차가 **작아집니다**. 거리에서는 "편향은 항상 +" 였지만 거리차에서는 부호가 장애물의 위치에 달려 있습니다. 아래 유도와 데모에서 확인합니다.',
            en: '**Both are possible.** If the path to anchor $j$ is blocked, $d_j$ is measured too long and the difference **grows**; if the path to anchor $i$ is blocked, $d_i$ is measured too long and the difference **shrinks**. For a range the bias is always +, but for a range difference its sign depends on where the obstacle is. The derivation and demo below confirm it.',
          }} />
        <Derivation id="nlos-positive" title={{ ko: '왜 거리의 편향은 항상 +이고, 거리차의 편향은 ± 인가', en: 'Why a range bias is always + and a range-difference bias is ±' }}>
          <P ko="먼저 이 유도에 나오는 통계 기호입니다(낯설면 0장의 [통계 1분 복습](#/ch/0?a=stats)). $n \sim \mathcal N(0,\sigma^2)$ 는 '$n$ 은 평균 0, 표준편차 $\sigma$ 인 종 모양(가우스, 정규) 분포에서 뽑힌 값'이라는 뜻입니다. $\mathrm{Exp}(\tx{평균}{mean}\ \bar b)$ 는 **지수분포**: 0 이상의 값만 나오고, 0 근처가 가장 흔하며 클수록 드물어지는 분포입니다(아래 그림). $\mathbb E[\cdot]$ 는 평균(기대값), $\mathrm{Var}[\cdot]$ 는 분산입니다."
            en="First the statistical symbols used here (if unfamiliar, see the [one-minute statistics review](#/ch/0?a=stats) in chapter 0). $n \sim \mathcal N(0,\sigma^2)$ means '$n$ is drawn from the bell-shaped (Gaussian, normal) distribution with mean 0 and standard deviation $\sigma$'. $\mathrm{Exp}(\tx{평균}{mean}\ \bar b)$ is the **exponential distribution**: only non-negative values, most common near 0 and rarer the larger they are (figure below). $\mathbb E[\cdot]$ is the mean (expected value) and $\mathrm{Var}[\cdot]$ the variance." />
          <P ko="앵커에서 태그까지의 참 직선거리를 $d$ [m], 전파 속도를 $c$ 라 합시다. 수신기가 잡은 첫 신호가 실제로 지나온 길의 길이를 $\ell$ 이라 하면, 잰 거리는 2장과 같은 기호로 $\rho = \ell + n$ 입니다($n$ 은 시각 측정 잡음을 거리로 바꾼 것)."
            en="Let $d$ [m] be the true straight-line distance from anchor to tag and $c$ the propagation speed. If $\ell$ is the length of the path actually travelled by the first signal the receiver catches, the measured range, with the symbol of chapter 2, is $\rho = \ell + n$ ($n$ is the timing noise converted to distance)." />
          <List items={[
            { ko: '**돌아서 오는 경우.** 직선 신호가 너무 약해져 수신기가 반사파를 첫 신호로 잡습니다. 두 점을 잇는 가장 짧은 길은 직선이므로 반사 경로는 반드시 $\\ell > d$ 입니다.', en: '**Detour.** The direct signal is too weak, so the receiver takes a reflection as the first signal. The straight line is the shortest path between two points, so a reflected path always has $\\ell > d$.' },
            { ko: '**뚫고 오는 경우.** 나무나 플라스틱 같은 물질 속에서는 전파가 공기 중보다 느립니다(전파의 일반적인 성질로 전제합니다. 이 교재가 따로 확인한 문헌 수치는 없습니다). 같은 길이를 더 오래 걸려 지나므로, 시간을 $c$ 로 곱해 얻은 거리는 실제보다 깁니다. 역시 $\\ell > d$ 처럼 보입니다.', en: '**Passing through.** Inside materials such as wood or plastic, radio travels more slowly than in air (taken as a general property of radio waves; this textbook has no verified literature figure for it). The same length takes longer, so time multiplied by $c$ gives a distance longer than the real one. Again it looks like $\\ell > d$.' },
          ]} />
          <P ko="두 경우 모두 추가 길이 $b = \ell - d$ 는 0 이상입니다. 30 cm 를 더 돌아오면 1 ns 늦게 도착합니다{{lit:dw1000/one-ns-30cm}}. 그래서 이 교재는 거리 오차를 다음 **모델**로 씁니다."
            en="In both cases the extra length $b = \ell - d$ is non-negative. A detour of 30 cm means arriving 1 ns late{{lit:dw1000/one-ns-30cm}}. This textbook therefore uses the following **model** for the range error." />
          <M block tex={String.raw`e \;=\; \rho - d \;=\; n + b,\qquad n \sim \mathcal N(0,\sigma^{2}),\qquad b \;\begin{cases} = 0 & \tx{LOS}{LOS}\\ \sim \mathrm{Exp}(\tx{평균}{mean}\ \bar b)\ \ge 0 & \tx{NLOS}{NLOS}\end{cases}`} />
          <P ko="$b$ 를 지수분포로 둔 것은 '작은 편향이 흔하고 큰 편향은 드물지만 꽤 멀리까지 나온다'는 성질을 가장 간단히 담기 위한 **가정**입니다. 실제 분포는 장애물의 재질과 배치에 따라 다릅니다. 가우스와 지수분포를 더한 이 분포를 **지수수정 가우스**(exponentially modified Gaussian, EMG)라고 합니다. 지수분포는 평균이 $\bar b$, 분산이 $\bar b^2$, 제곱의 평균이 $2\bar b^2$ 이므로 NLOS 경로에서는"
            en="Taking $b$ as exponential is an **assumption**, the simplest way to express 'small biases are common, large ones rare but reaching quite far'. The real distribution depends on the material and layout of the obstacles. The sum of a Gaussian and an exponential is the **exponentially modified Gaussian** (EMG). An exponential has mean $\bar b$, variance $\bar b^2$ and mean square $2\bar b^2$, so on an NLOS path" />
          {bias > 0 && (
            <LineChart
              title={{ ko: `지수분포 Exp(평균 b̄) 의 모양 — 지금 b̄ = ${fmt(bias * 100, 3)} cm`, en: `Shape of the exponential distribution Exp(mean b̄) — now b̄ = ${fmt(bias * 100, 3)} cm` }}
              xLabel={{ ko: '추가 길이 b [cm]', en: 'Extra length b [cm]' }} yLabel={{ ko: '확률밀도 [1/cm]', en: 'Probability density [1/cm]' }} height={180}
              series={[{ name: { ko: '(1/b̄)·exp(−b/b̄)', en: '(1/b̄)·exp(−b/b̄)' }, x: expX, y: expX.map((v) => Math.exp(-v / (bias * 100)) / (bias * 100)), slot: 6, dash: '' }]}
              refLines={[{ x: bias * 100, label: { ko: '평균 b̄', en: 'mean b̄' } }]}
              src={der('ch4#nlos-positive', { ko: '지수분포의 밀도 식에 설정의 b̄ 를 넣어 그린 것', en: 'The exponential density with b̄ from the settings' })} testId="ch4-exp-chart" />
          )}
          <M block tex={String.raw`\mathbb E[e] = \bar b,\qquad \mathrm{Var}[e] = \sigma^{2} + \bar b^{2},\qquad \sqrt{\mathbb E[e^{2}]} = \sqrt{\sigma^{2} + 2\bar b^{2}}`} />
          <P ko={`지금 설정({{cfg:${path}}}, {{cfg:uwb.nlosBiasMean}})으로는 NLOS 경로의 RMS 오차가 ${fmt(rmsNlos * 100, 3)} cm{{der:ch4#nlos-positive|√(σ² + 2b̄²)|√(σ² + 2b̄²)}} 로, LOS 의 ${fmt(rmsNlos / sigma, 2)}배{{der:ch4#nlos-positive|√(σ² + 2b̄²) / σ|√(σ² + 2b̄²) / σ}} 입니다. 더 중요한 것은 **꼬리**입니다. 오차가 $3\\sigma$ 를 넘을 확률은 LOS 에서 ${fmt(200 * (1 - normCdf(3)), 2)}%{{der:ch4#gate|2(1 − Φ(3))|2(1 − Φ(3))}} 인데 NLOS 경로에서는 ${fmt((1 - tail.acceptNlos) * 100, 3)}%{{der:ch4#sigma-eff|EMG 밀도를 |e| > 3σ 에서 적분한 값|The EMG density integrated over |e| > 3σ}} 입니다. 이렇게 가우스보다 먼 곳에 확률이 많이 남아 있는 분포를 **두꺼운 꼬리**(heavy tail)를 가졌다고 합니다.`}
            en={`With the current settings ({{cfg:${path}}}, {{cfg:uwb.nlosBiasMean}}) the RMS error on an NLOS path is ${fmt(rmsNlos * 100, 3)} cm{{der:ch4#nlos-positive|√(σ² + 2b̄²)|√(σ² + 2b̄²)}}, ${fmt(rmsNlos / sigma, 2)} times{{der:ch4#nlos-positive|√(σ² + 2b̄²) / σ|√(σ² + 2b̄²) / σ}} the LOS value. More important is the **tail**. The probability that the error exceeds $3\\sigma$ is ${fmt(200 * (1 - normCdf(3)), 2)}%{{der:ch4#gate|2(1 − Φ(3))|2(1 − Φ(3))}} in LOS but ${fmt((1 - tail.acceptNlos) * 100, 3)}%{{der:ch4#sigma-eff|EMG 밀도를 |e| > 3σ 에서 적분한 값|The EMG density integrated over |e| > 3σ}} on an NLOS path. A distribution that keeps this much probability far out, compared with a Gaussian, is said to have a **heavy tail**.`} />
          <P ko="**TDoA 의 경우.** 2장에서 본 대로 TDoA 는 거리차 $m_{ij}$ 를 재고, 그 참값은 $d_j - d_i$ 입니다. 태그는 두 앵커의 신호가 도착한 시각의 차를 재므로, 각 도착의 거리 오차를 $e_i$, $e_j$ 라 하면(위의 $e$ 를 앵커마다 쓴 것입니다. 2장의 단위벡터 $e_i$ 와는 다른 기호입니다) 거리차의 오차는 아래와 같습니다. **여기서부터 $\sigma$ 는 거리차 하나의 잡음 표준편차입니다.** 경로 하나의 잡음이 $\sigma_1$ 이면 두 잡음의 차 $n_j - n_i$ 는 $\sqrt2\,\sigma_1$ 이지만, 이 교재의 설정은 처음부터 거리차의 잡음 {{cfg:uwb.sigmaTdoa}} 를 $\sigma$ 로 둡니다."
            en="**The TDoA case.** As in chapter 2, TDoA measures a range difference $m_{ij}$ whose true value is $d_j - d_i$. The tag measures the difference of the two arrival times, so with range errors $e_i$ and $e_j$ of the two arrivals (the $e$ above, written per anchor; not the unit vector $e_i$ of chapter 2) the error of the range difference is as below. **From here on $\sigma$ is the noise standard deviation of one range difference.** If one path has noise $\sigma_1$, the difference $n_j - n_i$ has $\sqrt2\,\sigma_1$, but the settings of this textbook give the noise of the range difference, {{cfg:uwb.sigmaTdoa}}, directly as $\sigma$." />
          <M block tex={String.raw`e_{ij} \;=\; e_j - e_i \;=\; \underbrace{(n_j - n_i)}_{\tx{잡음}{noise}\ \sim\,\mathcal N(0,\sigma^{2})} \;+\; \underbrace{b_j}_{\ge 0} \;-\; \underbrace{b_i}_{\ge 0}`} />
          <P ko="$b_j$ 는 더해지고 $b_i$ 는 **빼집니다**. 앵커 $j$ 쪽만 가려지면 편향은 $+b_j$, 앵커 $i$ 쪽만 가려지면 $-b_i$ 입니다. 둘 다 가려지면 $b_j - b_i$ 로 일부가 상쇄되어 평균은 0 이지만 양쪽 꼬리가 모두 두꺼워집니다."
            en="$b_j$ is added and $b_i$ is **subtracted**. If only the path to anchor $j$ is blocked the bias is $+b_j$; if only the path to anchor $i$ is blocked it is $-b_i$. With both blocked, $b_j - b_i$ partly cancels: the mean is zero but both tails are heavy." />
        </Derivation>
        <h3>{tr({ ko: '무엇이 가리나', en: 'What does the blocking' })}</h3>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '가리는 것', en: 'Blocker' })}</th><th>{tr({ ko: '어떤 일이 생기나', en: 'What happens' })}</th><th>{tr({ ko: '우리가 할 수 있는 일', en: 'What we can do' })}</th></tr></thead>
            <tbody>
              <tr>
                <td><b>{tr({ ko: '기체 몸체', en: 'The vehicle body' })}</b></td>
                <td><T ko="UWB 칩 자체에 자세에 따라 달라지는 체계적 편향이 있다고 보고되어 있습니다{{lit:util2022/nlos-bias-behaviour}}. 그 밖에 배터리, 모터, 기판이 안테나와 앵커 사이에 들어갈 수 있고, 드론이 기울거나 돌면 가려지는 앵커가 바뀔 수 있으며, 5대가 날면 **다른 드론**도 장애물이 될 수 있습니다(이 세 가지는 이 교재의 추정이며 문헌으로 확인하지 않았습니다)."
                  en="The UWB chip itself is reported to have systematic biases that depend on pose{{lit:util2022/nlos-bias-behaviour}}. Beyond that, the battery, motors and boards may get between the antenna and an anchor, a tilt or yaw may change which anchor is shadowed, and with five drones flying **the other drones** may be obstacles too (these three are this textbook's expectation, not verified in the literature)." /></td>
                <td><T ko="앵커를 위아래 여러 높이에 달아, 어느 자세에서도 보이는 앵커가 남게 합니다." en="Mount anchors at several heights, above and below, so that some remain visible in any attitude." /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '사람', en: 'People' })}</b></td>
                <td><T ko="사람 몸도 움직이는 장애물로 작용합니다{{lit:util2022/nlos-obstacles}}. 움직이는 장애물이 만드는 오차는 그때그때 달라서 미리 보정할 수 없습니다{{lit:util2022/nlos-bias-behaviour}}."
                  en="A human body also acts as a moving obstacle{{lit:util2022/nlos-obstacles}}. Errors caused by moving obstacles change from moment to moment and cannot be calibrated in advance{{lit:util2022/nlos-bias-behaviour}}." /></td>
                <td><T ko="비행 중에는 앵커와 비행 공간 사이에 서지 않습니다. 남는 것은 게이팅과 강건 추정으로 거릅니다." en="Do not stand between the anchors and the flight volume during a flight. Gating and robust estimation deal with the rest." /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '금속 구조물', en: 'Metal structures' })}</b></td>
                <td><T ko="금속은 전파를 거의 통과시키지 않고 반사합니다(전파의 일반적인 성질로 전제합니다). 한 연구는 배치 설계에서 냉장고, 카운터, 자판기 같은 금속 물체를 심한 NLOS 를 일으키는 장애물로 다뤘습니다{{lit:arxiv-2412-12427/nlos-treatment}}. 고정된 장애물은 같은 궤적을 돌 때마다 **같은** 편향을 만들고, 심하면 측정이 아예 막힙니다{{lit:util2022/nlos-bias-behaviour}}."
                  en="Metal lets almost no radio through and reflects it instead (taken as a general property of radio waves). One study treated metal objects such as a fridge, a counter and a vending machine as severe-NLOS obstacles in its placement design{{lit:arxiv-2412-12427/nlos-treatment}}. A fixed obstacle produces the **same** bias every time the same trajectory is flown, and in severe cases the measurement is blocked altogether{{lit:util2022/nlos-bias-behaviour}}." /></td>
                <td><T ko="앵커를 달기 전에 강당을 둘러보고, 금속 선반·기둥·트러스 뒤로 가는 경로가 생기지 않게 배치합니다." en="Walk the hall before mounting anchors and place them so that no path runs behind metal shelves, pillars or trusses." /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <P ko="공개 데이터셋 UTIL 은 Crazyflie 와 같은 계열의 UWB 하드웨어(DWM1000 기반 Bitcraze LPS){{lit:util2022/hardware}}로 골판지, 금속, 목재, 플라스틱, 폼 장애물{{lit:util2022/nlos-obstacles}} 뒤에서 TDoA 를 측정했습니다. 장애물이 없는 배치에서는 IMU 와 융합한 위치 오차가 약 10 cm{{lit:util2022/benchmark-accuracy}} 였지만, 장애물을 놓은 배치에서는 크게 나빠졌습니다{{lit:util2022/benchmark-accuracy}}."
          en="The public UTIL dataset measured TDoA behind cardboard, metal, wood, plastic and foam obstacles{{lit:util2022/nlos-obstacles}} with UWB hardware of the same family as the Crazyflie's (the DWM1000-based Bitcraze LPS){{lit:util2022/hardware}}. In obstacle-free layouts the IMU-fused position error was about 10 cm{{lit:util2022/benchmark-accuracy}}; in the cluttered layout it degraded greatly{{lit:util2022/benchmark-accuracy}}." />
        <Note>
          <P ko="**이 장의 데이터는 합성입니다.** 이 장의 히스토그램과 궤적은 모두 위 모델로 엔진이 만든 값이고, 편향 크기 $\bar b$ 는 문헌값이 아닌 예시값입니다. UTIL 데이터셋은 우리가 확인한 범위(저장소, 프로젝트 페이지, 논문)에서 재배포를 허용하는 라이선스 표기를 찾지 못해 교재에 넣지 않았습니다. 실제 NLOS 측정(LOS/NLOS 식별 데이터와 약 150분{{lit:util2022/contents}}의 비행 데이터)을 보고 싶으면 [UTIL 데이터셋 페이지](https://utiasdsl.github.io/util-uwb-dataset/){{lit:util2022/dataset-url}} 에서 직접 받을 수 있습니다."
            en="**The data in this chapter is synthetic.** Every histogram and trajectory here is generated by the engine from the model above, and the bias size $\bar b$ is an example value, not a literature value. Within what we checked (repository, project page, paper) we found no licence statement allowing redistribution of the UTIL dataset, so it is not bundled. For real NLOS measurements (LOS/NLOS identification data and about 150 minutes{{lit:util2022/contents}} of flight data), download it yourself from the [UTIL dataset page](https://utiasdsl.github.io/util-uwb-dataset/){{lit:util2022/dataset-url}}." />
        </Note>
      </Section>

      <Section id="demo" title={{ ko: '장애물을 놓아 보기', en: 'Placing an obstacle' }}>
        <ObstacleDemo />
        <SignDemo />
      </Section>

      <Section id="gating" title={{ ko: '마할라노비스 게이팅', en: 'Mahalanobis gating' }}>
        <P ko="NLOS 측정을 걸러 내는 가장 단순한 생각은 **'예상과 너무 다른 측정은 의심한다'** 입니다. 예상이 있으려면 예측이 있어야 합니다. 필터는 직전 추정값과 운동 모델로 지금의 상태를 예측해 두고 있습니다(어떻게 예측하는지는 5장에서 다룹니다). 지금은 필터가 상태의 예측값 $\hat x$ 와 그 불확실성을 나타내는 공분산 $P$ 를 갖고 있다는 것만 받아들이면 됩니다."
          en="The simplest idea for filtering out NLOS measurements is **'be suspicious of a measurement that is too far from what you expected'**. Expecting requires predicting. A filter always holds a prediction of the current state, made from the previous estimate and a motion model (chapter 5 explains how). For now, just accept that the filter has a predicted state $\hat x$ and a covariance $P$ that describes its uncertainty." />
        <Derivation id="gate" title={{ ko: '혁신, 혁신 분산, 그리고 문턱 k', en: 'Innovation, innovation variance and the threshold k' }}>
          <P ko="스칼라 측정 하나를 생각합니다. **상태** $x$ 는 필터가 추정하는 값들을 쌓은 벡터로, 드론의 위치 $p$ 와 속도 등이 들어 있습니다. 참 상태가 $x$ 일 때 측정은 $z = h(x) + v$ 입니다. $h$ 는 측정 모델(거리면 앵커 $a$ 까지의 거리 $h(x) = \lVert p - a\rVert$)이고, $v$ 는 분산이 $R$ 인 측정 잡음입니다(단위 m²). 측정과 예측한 측정의 차를 **혁신**(innovation)이라고 합니다."
            en="Take one scalar measurement. The **state** $x$ is the vector of quantities the filter estimates; it contains the drone position $p$, the velocity and so on. With true state $x$ the measurement is $z = h(x) + v$, where $h$ is the measurement model (for a range, the distance to anchor $a$, $h(x) = \lVert p - a\rVert$) and $v$ is measurement noise of variance $R$ (unit m²). The difference between the measurement and the predicted measurement is the **innovation**." />
          <M block tex={String.raw`\nu \;=\; z - h(\hat x)`} />
          <P ko="예측 오차 $\tilde x = x - \hat x$ 가 작다고 보고 $h$ 를 $\hat x$ 주변에서 1차까지 전개합니다. $H = \partial h/\partial x$ 는 야코비안(행벡터)입니다. 거리 측정이면 $H$ 의 위치 자리에는 2장에서 본 '앵커에서 태그를 향하는 단위벡터'의 성분이, 속도 등 나머지 자리에는 0 이 들어갑니다."
            en="Assume the prediction error $\tilde x = x - \hat x$ is small and expand $h$ to first order around $\hat x$. $H = \partial h/\partial x$ is the Jacobian (a row vector). For a range, the position entries of $H$ hold the components of the unit vector from the anchor towards the tag seen in chapter 2, and the other entries (velocity etc.) are 0." />
          <M block tex={String.raw`h(x) \approx h(\hat x) + H\tilde x \quad\Longrightarrow\quad \nu \approx H\tilde x + v`} />
          <P ko="예측 오차와 측정 잡음은 서로 독립이고 평균이 0 이므로, 혁신의 분산은 두 분산의 합입니다. $\mathbb E[\tilde x\tilde x^{\mathsf T}] = P$ 를 쓰면"
            en="The prediction error and the measurement noise are independent with zero mean, so the variance of the innovation is the sum of the two variances. Using $\mathbb E[\tilde x\tilde x^{\mathsf T}] = P$," />
          <M block tex={String.raw`S \;=\; \mathbb E[\nu^{2}] \;=\; H\,\mathbb E[\tilde x\tilde x^{\mathsf T}]\,H^{\mathsf T} + \mathbb E[v^{2}] \;=\; H P H^{\mathsf T} + R`} />
          <P ko="$S$ 는 '모델이 맞다면 혁신이 이 정도로 흩어져야 한다'는 값입니다. 예측이 불확실하면($P$ 가 크면) $S$ 가 커지므로 큰 혁신도 이상하지 않습니다. 혁신을 그 표준편차로 나눈 $|\nu|/\sqrt S$ 가 '혁신이 몇 $\sigma$ 떨어져 있나'이고, 이것이 스칼라 측정의 **마할라노비스 거리**(Mahalanobis distance)입니다. 측정이 여러 성분인 벡터라면 $d^2 = \nu^{\mathsf T} S^{-1}\nu$ 로 씁니다."
            en="$S$ says how widely the innovation should scatter if the model is right. When the prediction is uncertain (large $P$), $S$ is large and a large innovation is not strange. The innovation divided by its standard deviation, $|\nu|/\sqrt S$, is 'how many $\sigma$ away the innovation is': the **Mahalanobis distance** of a scalar measurement. For a vector measurement it is $d^2 = \nu^{\mathsf T} S^{-1}\nu$." />
          <P ko="예측 오차와 잡음이 가우스이면 $\nu \sim \mathcal N(0, S)$ 이므로 $\nu/\sqrt S$ 는 표준정규분포를 따르고, 그 제곱 $\nu^2/S$ 가 따르는 분포를 '자유도 1 인 카이제곱 분포' $\chi^2(1)$ 이라고 부릅니다(아래 논문의 '카이제곱 기각'이 이 값에 문턱을 두는 것입니다). **게이트**(gate)는 이 값에 문턱을 두는 것입니다. 이 장에서 $k$ 는 언제나 **게이트 문턱**입니다(0장의 게인 $k$, 2장의 반복 번호 $k$ 와는 다른 기호입니다)."
            en="If the prediction error and noise are Gaussian, $\nu \sim \mathcal N(0, S)$, so $\nu/\sqrt S$ is standard normal and the distribution of its square $\nu^2/S$ is called the chi-squared distribution with one degree of freedom, $\chi^2(1)$ (the 'chi-squared rejection' of the paper cited below thresholds this value). A **gate** puts a threshold on this value. In this chapter $k$ always means the **gate threshold** (not the gain $k$ of chapter 0 or the iteration index $k$ of chapter 2)." />
          <M block tex={String.raw`\frac{\nu^{2}}{S} \le k^{2}\ \Rightarrow\ \tx{받아들인다}{accept},\qquad \frac{\nu^{2}}{S} > k^{2}\ \Rightarrow\ \tx{버린다}{reject}`} />
          <P ko="문턱 $k$ 는 '멀쩡한 측정을 얼마나 자주 잘못 버릴 것인가'로 정합니다. 표준정규분포의 누적분포함수를 $\Phi$ 라 하면, 모델이 맞는데도 $|\nu|/\sqrt S > k$ 가 될 확률은 양쪽 꼬리를 합쳐"
            en="The threshold $k$ is chosen by how often you are willing to reject a good measurement by mistake. With $\Phi$ the cumulative distribution of the standard normal, the probability that $|\nu|/\sqrt S > k$ although the model is right is, adding both tails," />
          <M block tex={String.raw`P_{\tx{오기각}{false reject}} \;=\; 2\,\bigl(1 - \Phi(k)\bigr)`} />
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th class="r">{tr({ ko: '문턱 k [σ]', en: 'Threshold k [σ]' })}</th>{rows.map((r) => <th key={r.k} class="r">{fmt(r.k)}</th>)}</tr></thead>
              <tbody>
                <tr><td class="r">{tr({ ko: '멀쩡한 측정을 버릴 확률 [%]', en: 'Good measurement rejected [%]' })}<SrcBadge src={G} /></td>{rows.map((r) => <td key={r.k} class="r num">{fmt(r.p * 100, 2)}</td>)}</tr>
                <tr><td class="r">{tr({ ko: '측정 몇 개에 1개꼴인가', en: 'One in how many measurements' })}<SrcBadge src={G} /></td>{rows.map((r) => <td key={r.k} class="r num">{fmt(1 / r.p, 2)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <P ko="측정을 받아들인 뒤의 갱신은 5장에서 유도합니다. 결과만 미리 쓰면 $K = PH^{\mathsf T}/S$, $\hat x^{+} = \hat x + K\nu$, $P^{+} = (I - KH)P$ 입니다. $K$ 는 혁신 중 얼마를 추정값에 반영할지 정하는 이득입니다. 버린 측정으로는 $\hat x$ 도 $P$ 도 바꾸지 않습니다."
            en="The update after accepting a measurement is derived in chapter 5. Stating the result in advance: $K = PH^{\mathsf T}/S$, $\hat x^{+} = \hat x + K\nu$, $P^{+} = (I - KH)P$. $K$ is the gain that decides how much of the innovation goes into the estimate. A rejected measurement changes neither $\hat x$ nor $P$." />
        </Derivation>
        <P ko="실제 시스템도 같은 생각을 씁니다. Crazyflie 펌웨어의 TDoA 이상치 필터는 먼저 물리적으로 불가능한 값(두 앵커 사이의 거리보다 큰 거리차)을 버리고, 필터가 닫혀 있는 동안에는 오차가 2.5·stdDev 안쪽인 표본만 통과시킵니다{{lit:cf-firmware-docs/tdoa-outlier-filter}}(열고 닫는 동작은 아래 함정 실험실에서). 기본 stdDev 가 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}} 이므로 통과 한계는 0.375 m{{der:ch4#gate|2.5 × 0.15 m|2.5 × 0.15 m}} 입니다. TWR 쪽은 앵커별로 최근 32개 거리의 평균에서 4σ 이상 벗어난 측정을 버리고{{lit:cf-firmware-docs/twr-outlier-filter}}, 거리 측정의 표준편차로는 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} 를 씁니다. 보행자용 UWB TDoA 시스템을 다룬 한 논문은 LOS 잡음을 표준편차 10 cm 인 가우스로 두고 마할라노비스 임계값 5 의 카이제곱 기각을 썼습니다{{lit:arxiv-2412-12427/noise-model}}."
          en="Real systems use the same idea. The TDoA outlier filter in the Crazyflie firmware first drops physically impossible values (a range difference larger than the distance between the two anchors) and then, while the filter is closed, passes only samples whose error is within 2.5·stdDev{{lit:cf-firmware-docs/tdoa-outlier-filter}} (the opening and closing are described in the pitfall lab below). With the default stdDev of 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}} the pass limit is 0.375 m{{der:ch4#gate|2.5 × 0.15 m|2.5 × 0.15 m}}. On the TWR side, a measurement that deviates by 4σ or more from the mean of the last 32 ranges of that anchor is dropped{{lit:cf-firmware-docs/twr-outlier-filter}}, and 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} is used as the range standard deviation. A paper on a pedestrian UWB TDoA system assumed Gaussian LOS noise with a 10 cm standard deviation and chi-squared rejection with a Mahalanobis threshold of 5{{lit:arxiv-2412-12427/noise-model}}." />
        <Note>
          <P ko="이 교재의 게이트는 위 필터들을 그대로 옮긴 것이 아닙니다. 같은 생각을 가장 단순한 꼴($\nu^2/S \le k^2$)로 쓴 개념 모델입니다. 펌웨어의 실제 동작은 6장과 펌웨어 문서를 보세요."
            en="The gate in this textbook does not reproduce those filters. It is a concept model that writes the same idea in its simplest form ($\nu^2/S \le k^2$). For what the firmware really does, see chapter 6 and the firmware documentation." />
        </Note>
        <Predict id="ch4-tight-gate"
          question={{ ko: '문턱을 k = 3 에서 k = 1 로 좁히면 NLOS 측정이 더 많이 걸러집니다. 필터 전체로 보면 어떻게 될까요?', en: 'Narrowing the threshold from k = 3 to k = 1 filters out more NLOS measurements. What happens to the filter as a whole?' }}
          choices={[
            { label: { ko: '더 정확해진다 — 나쁜 측정이 줄었으니까', en: 'It gets more accurate — fewer bad measurements' } },
            { label: { ko: '거의 달라지지 않는다', en: 'Almost nothing changes' } },
            { label: { ko: '오히려 위험해진다 — 멀쩡한 측정도 많이 버리게 된다', en: 'It gets riskier — many good measurements are thrown away too' }, correct: true },
          ]}
          explain={{
            ko: `**위험해집니다.** k = 1 이면 멀쩡한 측정의 ${fmt(200 * (1 - normCdf(1)), 3)}%{{der:ch4#gate|2(1 − Φ(1))|2(1 − Φ(1))}} 를 버립니다. k = 3 에서는 ${fmt(200 * (1 - normCdf(3)), 2)}%{{der:ch4#gate|2(1 − Φ(3))|2(1 − Φ(3))}} 였습니다. 측정이 줄면 필터는 예측에 더 기대게 되고, 예측이 틀어지면 맞는 측정까지 이상치로 보여 더 버립니다. 아래 데모에서 문턱에 따른 득실을, 함정 실험실에서 그 결과를 봅니다.`,
            en: `**Riskier.** At k = 1 the gate throws away ${fmt(200 * (1 - normCdf(1)), 3)}%{{der:ch4#gate|2(1 − Φ(1))|2(1 − Φ(1))}} of the good measurements; at k = 3 it was ${fmt(200 * (1 - normCdf(3)), 2)}%{{der:ch4#gate|2(1 − Φ(3))|2(1 − Φ(3))}}. With fewer measurements the filter leans on its prediction, and once the prediction drifts even correct measurements look like outliers and are rejected as well. The demo below shows the trade-off; the pitfall lab shows the consequence.`,
          }} />
        <GateDemo />
        <Derivation id="sigma-eff" title={{ ko: '게이트를 지난 뒤의 유효 오차 σ_eff', en: 'The effective error σ_eff after the gate' }}>
          <P ko="오차 예산에는 '게이트를 지나 필터에 실제로 들어가는 측정'의 오차 크기가 필요합니다. 측정 하나가 NLOS 일 확률을 $p_{\text{NLOS}}$ 라 하면, 오차 $e$ 의 **확률밀도**(그 값 근처가 나올 확률을 폭으로 나눈 것) $f(e)$ 는 두 분포를 섞은 것입니다."
            en="The error budget needs the size of the error of the measurements that actually enter the filter after the gate. If a measurement is NLOS with probability $p_{\text{NLOS}}$, the **probability density** (the probability of a value near $e$ divided by the width) $f(e)$ of the error is a mixture of two distributions." />
          <M block tex={String.raw`f(e) \;=\; (1-p_{\text{NLOS}})\,\underbrace{\mathcal N(e;\,0,\sigma^{2})}_{\tx{LOS}{LOS}} \;+\; p_{\text{NLOS}}\,\underbrace{f_{\mathrm{EMG}}(e;\,\sigma,\bar b)}_{\tx{NLOS}{NLOS}}`} />
          <P ko="예측이 충분히 정확해서 혁신이 곧 측정 오차라고 가정하면($HPH^{\mathsf T} \ll R$, 즉 $S \approx \sigma^2$), 게이트는 $|e| \le k\sigma$ 인 측정만 통과시킵니다. 통과하는 비율 $A$, 통과한 오차의 평균 $\mu$(남은 편향), 그리고 통과한 오차의 RMS 인 **유효 오차** $\sigma_{\text{eff}}$ 는"
            en="Assume the prediction is accurate enough that the innovation equals the measurement error ($HPH^{\mathsf T} \ll R$, i.e. $S \approx \sigma^2$). The gate then passes only measurements with $|e| \le k\sigma$. The accepted fraction $A$, the mean $\mu$ of the accepted errors (residual bias) and their RMS, the **effective error** $\sigma_{\text{eff}}$, are" />
          <M block tex={String.raw`A(k) = \int_{-k\sigma}^{k\sigma} f(e)\,de,\qquad \mu = \frac{1}{A}\int_{-k\sigma}^{k\sigma} e\,f(e)\,de,\qquad \sigma_{\text{eff}}^{2} = \frac{1}{A}\int_{-k\sigma}^{k\sigma} e^{2} f(e)\,de`} />
          <P ko="$\sigma_{\text{eff}}$ 는 평균이 아니라 0 을 기준으로 잰 RMS 이므로 남은 편향 $\mu$ 의 몫까지 포함합니다. 적분은 닫힌 식이 없어 수치로 계산합니다(위 데모의 선). 게이트를 끄면($k \to \infty$) 앞 유도의 결과에서 바로"
            en="$\sigma_{\text{eff}}$ is an RMS about zero, not about the mean, so it includes the contribution of the residual bias $\mu$. The integrals have no closed form and are evaluated numerically (the lines in the demo above). With the gate off ($k \to \infty$), the earlier derivation gives directly" />
          <M block tex={String.raw`\sigma_{\text{eff}}^{2}\Big|_{\tx{게이트 끔}{gate off}} = (1-p_{\text{NLOS}})\,\sigma^{2} + p_{\text{NLOS}}\,(\sigma^{2} + 2\bar b^{2}) = \sigma^{2} + 2p_{\text{NLOS}}\,\bar b^{2},\qquad \mu = p_{\text{NLOS}}\,\bar b`} />
          <P ko={`지금 설정으로는 게이트를 껐을 때 $\\sigma_{\\text{eff}}$ = ${fmt(off.rmsAccepted * 100, 3)} cm{{der:ch4#sigma-eff|√(σ² + 2p·b̄²)|√(σ² + 2p·b̄²)}}, 지금 문턱({{cfg:uwb.gateSigma}})에서는 ${fmt(b.sigmaEff * 100, 3)} cm{{der:ch4#sigma-eff}} 입니다. 2장의 식에서 $\\sigma_r$ 자리에 이 값을 넣어 UWB 만의 위치 오차를 $\\sigma_{\\text{pos}} = \\text{DOP}\\times\\sigma_{\\text{eff}}$ 로 계산합니다.`}
            en={`With the current settings $\\sigma_{\\text{eff}}$ = ${fmt(off.rmsAccepted * 100, 3)} cm{{der:ch4#sigma-eff|√(σ² + 2p·b̄²)|√(σ² + 2p·b̄²)}} with the gate off and ${fmt(b.sigmaEff * 100, 3)} cm{{der:ch4#sigma-eff}} at the current threshold ({{cfg:uwb.gateSigma}}). This value replaces $\\sigma_r$ in the formula of chapter 2, giving the UWB-only position error $\\sigma_{\\text{pos}} = \\text{DOP}\\times\\sigma_{\\text{eff}}$.`} />
          <P ko="두 가지 단순화를 기억해 두세요. 첫째, 남은 편향을 무작위 오차처럼 RMS 에 넣었습니다. 실제로는 고정된 장애물이 만드는 편향은 평균되지 않습니다. 둘째, TDoA 에서도 같은 식을 씁니다. 한쪽 앵커만 가려지면 부호만 다를 뿐 RMS 는 같기 때문입니다. 다만 TDoA 측정 하나에는 경로가 둘 들어 있어, 측정이 오염될 확률은 경로 하나의 확률보다 큽니다. 9장에서 여러분의 로그로 $p_{\text{NLOS}}$ 와 $\bar b$ 를 직접 맞춥니다."
            en="Keep two simplifications in mind. First, the residual bias is folded into the RMS as if it were random; in reality the bias from a fixed obstacle does not average out. Second, the same formula is used for TDoA, because with one blocked anchor only the sign differs and the RMS is the same. But one TDoA measurement involves two paths, so the chance that it is contaminated is larger than the per-path probability. Chapter 9 fits $p_{\text{NLOS}}$ and $\bar b$ to your own logs." />
          <P ko={`그 차이가 얼마인지 수치로 봅니다. 이 장의 강건 추정 데모와 함정 실험실이 빌려 쓰는 5장 필터 엔진은 TDoA 측정을 '두 경로가 각각 확률 $p_{\\text{NLOS}}$ 로 가려진다'고 만듭니다. 그 모델(섞임 비율: 둘 다 LOS $(1-p_{\\text{NLOS}})^2$, 한쪽만 $2p_{\\text{NLOS}}(1-p_{\\text{NLOS}})$, 둘 다 $p_{\\text{NLOS}}^2$)로 같은 적분을 하면, 지금 설정(σ = {{cfg:uwb.sigmaTdoa}})에서 측정이 오염될 확률은 ${fmt(two.contaminated * 100, 3)}%${TWO}, 게이트를 끈 $\\sigma_{\\text{eff}}$ 는 ${fmt(twoOff.rmsAccepted * 100, 3)} cm${TWO}, 지금 문턱에서는 ${fmt(two.rmsAccepted * 100, 3)} cm${TWO}, 게이트가 버리는 비율은 ${fmt(two.rejected * 100, 3)}%${TWO} 입니다. 오차 예산은 위의 한 경로 식을 쓰므로, 측위 모드가 TDoA 일 때는 예산의 $\\sigma_{\\text{eff}}$ 가 조금 낙관적입니다.`}
            en={`Here is the size of that difference. The chapter 5 filter engine borrowed by this chapter's robust-estimation demo and pitfall lab generates TDoA measurements with 'each of the two paths blocked with probability $p_{\\text{NLOS}}$'. Doing the same integrals with that model (mixture: both LOS $(1-p_{\\text{NLOS}})^2$, one side $2p_{\\text{NLOS}}(1-p_{\\text{NLOS}})$, both $p_{\\text{NLOS}}^2$) with the current settings (σ = {{cfg:uwb.sigmaTdoa}}): a measurement is contaminated with probability ${fmt(two.contaminated * 100, 3)}%${TWO}, $\\sigma_{\\text{eff}}$ is ${fmt(twoOff.rmsAccepted * 100, 3)} cm${TWO} with the gate off and ${fmt(two.rmsAccepted * 100, 3)} cm${TWO} at the current threshold, and the gate rejects ${fmt(two.rejected * 100, 3)}%${TWO}. The error budget uses the one-path formula above, so with TDoA as the mode the budget's $\\sigma_{\\text{eff}}$ is somewhat optimistic.`} />
        </Derivation>
      </Section>

      <Section id="robust" title={{ ko: '강건 추정: 버리지 말고 덜 믿기', en: 'Robust estimation: trust less instead of rejecting' }}>
        <P ko="게이트는 측정을 **믿는다 / 버린다** 둘로 나눕니다. 문턱 바로 안쪽의 NLOS 측정은 온전히 믿고, 바로 바깥쪽의 멀쩡한 측정은 완전히 버립니다. **강건 추정**(robust estimation)은 이 경계를 부드럽게 만듭니다. 혁신이 클수록 그 측정의 분산을 키워서(= 덜 믿어서) 반영합니다."
          en="A gate splits measurements into **trusted** and **rejected**. An NLOS measurement just inside the threshold is trusted fully; a good one just outside is discarded completely. **Robust estimation** softens this boundary: the larger the innovation, the more the variance of that measurement is inflated (the less it is trusted) before it is used." />
        <P ko="가장 단순한 꼴 가운데 하나가 **후버 가중**(Huber weight)입니다. 이렇게 '잔차의 제곱' 대신 덜 가파르게 자라는 비용을 쓰는 방법을 통틀어 **M-추정**(M-estimation)이라고 합니다."
          en="One of the simplest forms is the **Huber weight**. Methods that replace the squared residual by a cost that grows less steeply are collectively called **M-estimation**." />
        <Derivation id="huber" title={{ ko: '후버 비용에서 가중치 $w = c_H/u$ 까지', en: 'From the Huber cost to the weight $w = c_H/u$' }}>
          <P ko="**정규화 혁신**을 $u = |\nu|/\sqrt S$ 라 씁니다('혁신이 몇 σ 떨어져 있나', 단위 없음). 최소제곱은 측정마다 비용 $\tfrac12 u^2$ 을 주고 그 합을 최소로 합니다. 혁신이 큰 측정 하나가 비용을 제곱으로 끌어올리므로 NLOS 하나에 끌려갑니다. **후버 비용** $\rho(u)$ 는 문턱 $c_H$ 안쪽에서는 최소제곱과 같고, 바깥에서는 직선으로만 자랍니다. 두 조각은 $u = c_H$ 에서 값과 기울기가 이어지도록 골랐습니다."
            en="Write the **normalised innovation** as $u = |\nu|/\sqrt S$ ('how many σ away the innovation is', dimensionless). Least squares gives each measurement the cost $\tfrac12 u^2$ and minimises the sum, so one measurement with a large innovation raises the cost quadratically and drags the estimate. The **Huber cost** $\rho(u)$ equals least squares inside the threshold $c_H$ and grows only linearly outside; the two pieces are chosen so that value and slope match at $u = c_H$." />
          <M block tex={String.raw`\rho(u) = \begin{cases} \tfrac12 u^{2} & u \le c_H\\[2pt] c_H\,u - \tfrac12 c_H^{2} & u > c_H \end{cases}`} />
          <P ko="이런 비용을 최소로 하는 표준적인 방법은 **반복 재가중 최소제곱**(IRLS)입니다. 각 측정에 가중치 $w(u) = \rho'(u)/u$ 를 주고 보통의 (가중) 최소제곱을 풉니다. 가중 최소제곱에서 가중치 $w$ 를 준다는 것은 그 측정의 분산을 $R/w$ 로 본다는 것과 같습니다. $\rho'(u)$ 는 안쪽에서 $u$, 바깥에서 $c_H$ 이므로"
            en="The standard way to minimise such a cost is **iteratively reweighted least squares** (IRLS): give each measurement the weight $w(u) = \rho'(u)/u$ and solve an ordinary (weighted) least-squares problem. Giving a measurement weight $w$ in weighted least squares is the same as treating its variance as $R/w$. Since $\rho'(u)$ is $u$ inside and $c_H$ outside," />
          <M block tex={String.raw`w(u) = \frac{\rho'(u)}{u} = \begin{cases} 1 & u \le c_H\\[2pt] c_H/u & u > c_H \end{cases},\qquad u = \frac{|\nu|}{\sqrt S},\qquad R_{\text{eff}} = \frac{R}{w}`} />
          <P ko="혁신이 문턱의 두 배이면 분산을 두 배로 보는 셈입니다. 필터 안에서의 순서는 이렇습니다. ① 원래의 $R$ 로 $\nu$, $S$ 를 계산해 $u$ 를 구합니다. ② $w(u)$ 를 구합니다. ③ $R_{\text{eff}} = R/w$ 로 $S$ 와 $K$ 를 **다시** 계산해 갱신합니다. 이 교재의 엔진은 이것을 한 번만 합니다(펌웨어는 아래처럼 최대 2회 반복)."
            en="An innovation twice the threshold is treated as having twice the variance. The order inside the filter: ① compute $\nu$ and $S$ with the original $R$ and get $u$; ② compute $w(u)$; ③ recompute $S$ and $K$ with $R_{\text{eff}} = R/w$ and update. The engine of this textbook does this once (the firmware iterates up to twice, see below)." />
          <P ko={`문턱 $c_H$ = ${HUBER_C}{{ex}} 는 이 교재 엔진에 고정된 예시값입니다. 혁신이 정규분포를 따르는 멀쩡한 측정이라면 ${fmt(huberKeep * 100, 3)}%{{der:ch4#huber|2Φ(c_H) − 1|2Φ(c_H) − 1}} 는 가중치 1 을 그대로 받습니다.`}
            en={`The threshold $c_H$ = ${HUBER_C}{{ex}} is an example value fixed in this textbook's engine. For good measurements whose innovation is normally distributed, ${fmt(huberKeep * 100, 3)}%{{der:ch4#huber|2Φ(c_H) − 1|2Φ(c_H) − 1}} keep the full weight 1.`} />
        </Derivation>
        <RobustDemo />
        <P ko="Crazyflie 펌웨어에도 같은 계열의 선택 기능이 있습니다. 다중경로와 NLOS 이상치의 영향을 줄이려고 G-M(Geman–McClure) 비용함수와 반복 재가중 최소제곱(IRLS, 최대 2회 반복)을 쓰는 M-추정 기반 강건 칼만 필터이며, 파라미터 `kalman.robustTwr`, `kalman.robustTdoa` 로 켭니다{{lit:cf-firmware-docs/robust-estimation}}. 근거 논문은 Zhao, Panerati, Schoellig (RA-L 2021) 입니다{{lit:cf-firmware-docs/robust-reference}}. 이 교재의 후버 가중은 같은 생각의 더 단순한 예이고, 펌웨어의 비용함수와는 다릅니다."
          en="The Crazyflie firmware has an optional feature of the same family: an M-estimation based robust Kalman filter that uses the G-M (Geman–McClure) cost and iteratively reweighted least squares (IRLS, at most two iterations) to reduce the effect of multipath and NLOS outliers, enabled with the parameters `kalman.robustTwr` and `kalman.robustTdoa`{{lit:cf-firmware-docs/robust-estimation}}. Its reference is Zhao, Panerati, Schoellig (RA-L 2021){{lit:cf-firmware-docs/robust-reference}}. The Huber weight in this textbook is a simpler example of the same idea and differs from the firmware's cost function." />
        <Note>
          <P ko="**개념만: IMM.** **상호작용 다중 모델**(interacting multiple model, IMM)은 '지금 LOS 인가 NLOS 인가'를 하나로 정하지 않고 두 가설을 **나란히** 돌립니다. (1) LOS 가설(편향 0, 분산 작음)과 NLOS 가설(편향 $\bar b$, 분산 큼)로 각각 갱신합니다. (2) 각 가설이 이번 혁신을 얼마나 잘 설명하는지, 즉 우도로 가설의 확률을 고칩니다. (3) 두 추정값을 그 확률로 섞어서 내보냅니다. (4) 다음 측정 전에 'LOS 였다가 NLOS 로 바뀔 확률' 같은 전이 확률로 두 가설을 조금 섞어 둡니다. 이 섞기가 이름의 '상호작용'입니다."
            en="**Concept only: IMM.** The **interacting multiple model** (IMM) estimator does not decide between 'LOS now' and 'NLOS now'; it runs both hypotheses **side by side**. (1) Update once under the LOS hypothesis (zero bias, small variance) and once under the NLOS hypothesis (bias $\bar b$, large variance). (2) Revise the probability of each hypothesis by how well it explains the current innovation, its likelihood. (3) Output the two estimates mixed with those probabilities. (4) Before the next measurement, mix the two hypotheses slightly using transition probabilities such as 'LOS turning into NLOS'. This mixing is the 'interacting' in the name." />
          <M block tex={String.raw`\eta_{m} \;\propto\; \underbrace{\textstyle\sum_{i} \pi_{im}\,\eta_{i}^{\text{prev}}}_{\tx{전이 확률을 적용한 예측 확률}{predicted, after the transition}} \times \underbrace{\mathcal N(\nu;\ b_{m},\ S_{m})}_{\tx{우도}{likelihood}},\qquad m \in \{\mathrm{LOS},\ \mathrm{NLOS}\}`} />
          <P ko="$\eta_m$ 은 가설 $m$ 의 확률, $\pi_{im}$ 은 가설 $i$ 에서 $m$ 으로 바뀔 전이 확률, $b_m$, $S_m$ 은 그 가설에서의 혁신의 평균과 분산입니다."
            en="$\eta_m$ is the probability of hypothesis $m$, $\pi_{im}$ the transition probability from hypothesis $i$ to $m$, and $b_m$, $S_m$ the mean and variance of the innovation under that hypothesis." />
          <P ko="게이트가 '믿는다 / 버린다'를 고르는 방법이라면 IMM 은 '몇 % 믿는다'를 계속 추적하는 방법입니다. 가려짐이 한동안 이어지는 성질(한번 NLOS 면 다음 측정도 NLOS 일 가능성이 큼)을 전이 확률로 담을 수 있다는 것이 장점입니다. 이 교재에서는 구현하지 않습니다."
            en="Where a gate chooses between 'trust' and 'reject', an IMM keeps track of 'trust by so many per cent'. Its advantage is that the persistence of blocking (once NLOS, the next measurement is likely NLOS as well) can be expressed through the transition probabilities. This textbook does not implement it." />
        </Note>
      </Section>

      <Section id="task" title={{ ko: '손으로 짜 보기', en: 'Code it yourself' }}>
        <P ko="위 유도의 세 줄($\nu$, $S$, 게이트 판정)과 갱신 식을 함수 하나로 옮깁니다. 측정을 **하나씩** 넣는 스칼라 갱신입니다(5장의 필터도 이렇게 씁니다)."
          en="Turn the three lines of the derivation ($\nu$, $S$, the gate test) and the update into one function. It is a scalar update that takes measurements **one at a time** (the filter of chapter 5 is used this way too)." />
        <CodeTask task={gatedUpdateTask} />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <GatePitfall />
      </Section>

      <Section id="settings" title={{ ko: '우리 시스템의 값 넣기', en: 'Plugging in our system' }}>
        <P ko="아래 값은 전역 설정과 연결되어 있습니다. NLOS 확률과 편향은 강당마다 다르고, 문헌에서 가져올 수 있는 값이 아닙니다. 9장의 절차로 여러분의 강당에서 잰 값으로 바꾸기 전까지는 예시값입니다."
          en="The values below are tied to the global settings. NLOS probability and bias differ from hall to hall and cannot be taken from the literature. They remain example values until you replace them with measurements from your own hall using the procedure of chapter 9." />
        <div class="controls">
          <CfgSlider path="uwb.pNlos" max={50} />
          <CfgSlider path="uwb.nlosBiasMean" max={150} />
          <CfgSlider path="uwb.gateSigma" max={6} />
          <CfgSlider path={path} max={50} />
        </div>
        <StatRow>
          <Stat label={{ ko: 'LOS 측정 노이즈 $\\sigma$', en: 'LOS measurement noise $\\sigma$' }} value={sigma * 100} unit="cm" src={ex(path)} />
          <Stat label={{ ko: '유효 오차 $\\sigma_{\\text{eff}}$', en: 'Effective error $\\sigma_{\\text{eff}}$' }} value={b.sigmaEff * 100} unit="cm" src={SEFF} status={b.sigmaEff > 1.25 * sigma ? 'warn' : 'good'} />
          <Stat label={{ ko: 'HDOP / VDOP (강당 가운데)', en: 'HDOP / VDOP (hall centre)' }} value={`${fmt(b.dop.hdop, 3)} / ${fmt(b.dop.vdop, 3)}`} src={der('ch2#gdop', { ko: '2장의 DOP 를 강당 가운데, 비행 고도에서 계산한 값', en: 'The DOP of chapter 2 at the hall centre and flight height' })} />
          <Stat label={{ ko: 'UWB 만의 위치 오차 수평 / 수직', en: 'UWB-only position error, horizontal / vertical' }} value={`${fmt(b.sigmaPosH * 100, 3)} / ${fmt(b.sigmaPosV * 100, 3)}`} unit="cm" src={der('ch4#sigma-eff', { ko: 'DOP × σ_eff', en: 'DOP × σ_eff' })} />
        </StatRow>
        <p>
          {cfg.uwb.gateSigma <= 0
            ? <Status kind="bad">{tr({ ko: '게이트가 꺼져 있습니다. NLOS 측정이 전부 필터에 들어갑니다.', en: 'The gate is off. Every NLOS measurement enters the filter.' })}</Status>
            : cfg.uwb.gateSigma < 2
              ? <Status kind="bad">{tr({ ko: '문턱이 너무 좁습니다. 멀쩡한 측정을 많이 버려 필터가 잠길 수 있습니다.', en: 'The threshold is too narrow. Many good measurements are rejected and the filter may lock out.' })}</Status>
              : <Status kind="good">{tr({ ko: '문턱이 쓸 만한 범위에 있습니다.', en: 'The threshold is in a usable range.' })}</Status>}
        </p>
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 4,
  title: { ko: 'NLOS, 다중경로, 이상치', en: 'NLOS, multipath, outliers' },
  lead: { ko: '앵커와 드론 사이가 가려지면 측정 오차의 모양이 달라집니다. 어떻게 달라지는지 보고, 그런 측정을 어떻게 알아보고 버리거나 덜 믿을지를 다룹니다.', en: 'When the path between an anchor and the drone is blocked, the shape of the measurement error changes. We see how, and then how to recognise such measurements and reject or down-weight them.' },
  objectives: [
    { ko: '가려진 경로에서 거리와 거리차의 오차가 어느 쪽으로 치우치는지, 그 이유와 함께 설명한다.', en: 'Explain which way the range and range-difference errors are biased on a blocked path, and why.' },
    { ko: '혁신 $\\nu$ 와 혁신 분산 $S = HPH^{\\mathsf T} + R$ 로 마할라노비스 게이트를 만들고, 문턱 $k$ 를 오기각 확률 $2(1-\\Phi(k))$ 로 고른다.', en: 'Build a Mahalanobis gate from the innovation $\\nu$ and its variance $S = HPH^{\\mathsf T} + R$, and choose the threshold $k$ from the false-rejection probability $2(1-\\Phi(k))$.' },
    { ko: '게이트를 끄는 것과 너무 조이는 것이 각각 어떻게 실패하는지 재현하고, 강건 가중으로 완화한다.', en: 'Reproduce how switching the gate off and over-tightening it each fail, and mitigate with robust weighting.' },
  ],
  Body,
  budget: {
    items: ['sigma-eff', 'raw-pos'],
    note: {
      ko: '이 장은 1장의 거리 오차 $\\sigma_r$ 을 **유효 오차** $\\sigma_{\\text{eff}}$ 로 바꿉니다. NLOS 확률, 편향 평균, 게이트 문턱으로 "게이트를 통과한 오차의 RMS"를 계산한 값입니다. 그리고 2장의 DOP 를 곱해 UWB 만으로 푼 위치의 오차 $\\sigma_{\\text{pos}} = \\text{DOP} \\times \\sigma_{\\text{eff}}$ 를 예산에 올립니다(표의 두 값은 수평 / 수직). 둘 다 최소 간격에 직접 더해지지 않고, 5장의 필터로 들어가는 입력입니다.',
      en: 'This chapter replaces the range error $\\sigma_r$ of chapter 1 by the **effective error** $\\sigma_{\\text{eff}}$: the RMS of the errors that pass the gate, computed from the NLOS probability, the mean bias and the gate threshold. Multiplying by the DOP of chapter 2 puts the UWB-only position error $\\sigma_{\\text{pos}} = \\text{DOP} \\times \\sigma_{\\text{eff}}$ into the budget (the two values in the table are horizontal / vertical). Neither is added directly to the minimum spacing; both are inputs to the filter of chapter 5.',
    },
  },
  summary: [
    { ko: '가려진 전파는 늦게만 도착하므로 거리의 NLOS 편향은 항상 +이고 꼬리가 두껍다. TDoA 는 두 도착의 차이라서 가려진 쪽에 따라 +도 −도 된다.', en: 'A blocked signal can only arrive late, so the NLOS bias of a range is always + with a heavy tail. TDoA is a difference of two arrivals, so the bias is + or − depending on which side is blocked.' },
    { ko: '게이트는 $\\nu^2/S \\le k^2$ 인 측정만 받아들인다. $S = HPH^{\\mathsf T} + R$ 이고, 멀쩡한 측정을 버릴 확률은 $2(1-\\Phi(k))$ 다. 통과한 오차의 RMS 가 예산에 쓰는 $\\sigma_{\\text{eff}}$ 다.', en: 'A gate accepts only measurements with $\\nu^2/S \\le k^2$, where $S = HPH^{\\mathsf T} + R$; the chance of rejecting a good measurement is $2(1-\\Phi(k))$. The RMS of the accepted errors is the $\\sigma_{\\text{eff}}$ used in the budget.' },
    { ko: '게이트를 끄면 추정이 끌려가고, 너무 조이면 필터가 굶다가 잠긴다. 넉넉한 문턱, 버린 비율의 감시, 덜 믿는 강건 갱신으로 대비한다.', en: 'With the gate off the estimate is dragged; with the gate too tight the filter starves and locks out. Guard with a generous threshold, monitoring of the rejected fraction, and a robust update that trusts less.' },
  ],
  next: {
    ko: '나쁜 측정을 걸러 냈어도 UWB 위치는 3장에서 구한 갱신율로만 나오고, 그 사이에는 아무 정보가 없으며, 나올 때마다 $\\sigma_{\\text{pos}}$ 만큼 흔들립니다. 게다가 이 장의 게이트는 "필터의 예측"이 이미 있다고 가정했습니다. 그 예측은 어디서 올까요? 그보다 훨씬 자주 가속도를 재는 IMU 는(펌웨어 소스에서 센서를 읽는 안정화 메인 루프는 1000 Hz{{lit:cf-firmware-docs/main-loop-rate}}이고, 그 값을 모아 쓰는 칼만 예측 단계는 그보다 느린 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}} 입니다. IMU 를 읽는 빈도와 칼만 예측 빈도는 다른 숫자입니다) 무엇을 더해 주고, 둘을 어떻게 합쳐야 할까요?',
    en: 'Even with the bad measurements filtered out, a UWB position arrives only at the rate found in chapter 3, with no information in between, and jitters by $\\sigma_{\\text{pos}}$ each time. Moreover, the gate of this chapter assumed that "the filter’s prediction" already exists. Where does that prediction come from? What does an IMU that measures acceleration far more often add (in the firmware source the main stabiliser loop that reads the sensors runs at 1000 Hz{{lit:cf-firmware-docs/main-loop-rate}}, while the Kalman prediction step that uses those readings runs slower, at 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}}; how often the IMU is read and how often the Kalman filter predicts are different numbers), and how should the two be combined?',
  },
  tasks,
};
export default def;
