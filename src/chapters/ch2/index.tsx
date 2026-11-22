import { useMemo, useRef, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fieldSource } from '../../app/fields';
import { fix, fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { SystemConfig, defaultAnchors } from '../../sim/config';
import { Vec, dist } from '../../sim/linalg';
import { Dop, dopFor, dopGrid, gaussNewtonRange, gaussNewtonTdoa, insideAnchorBox, pairsFor, rangeGeometry, tdoaGeometry } from '../../sim/positioning';
import { Rng } from '../../sim/rng';
import { normPdf, rms } from '../../sim/stats';
import { der, ex } from '../../sources';
import {
  Button, Caption, CfgSlider, CodeTask, CodeView, Demo, Derivation, Histogram, LineChart, LinkGroup, List, M, McPanel, Note, P, Pitfall, PlanScale, PlanView, Predict,
  Scene3D, Section, Segmented, Slider, SrcBadge, Stat, StatRow, Status, seriesColor, seriesDash, useDebounced,
} from '../../ui';
import { gaussNewtonTask, tasks } from './tasks';

type Mode = 'twr' | 'tdoa';
type Which = 'hdop' | 'vdop' | 'pdop';
const MODES: { value: Mode; label: { ko: string; en: string } }[] = [
  { value: 'twr', label: { ko: 'TWR (거리)', en: 'TWR (ranges)' } },
  { value: 'tdoa', label: { ko: 'TDoA (거리 차)', en: 'TDoA (range differences)' } },
];
const WHICH: { value: Which; label: { ko: string; en: string } }[] = [
  { value: 'hdop', label: { ko: 'HDOP (수평)', en: 'HDOP (horizontal)' } },
  { value: 'vdop', label: { ko: 'VDOP (수직)', en: 'VDOP (vertical)' } },
  { value: 'pdop', label: { ko: 'PDOP (전체 = GDOP)', en: 'PDOP (total = GDOP)' } },
];
/** 히트맵 색 범위. DOP 가 이 범위를 넘으면 가장 진한 색으로 그린다. */
const HEAT_MIN = 0.3, HEAT_MAX = 4;
const DOP_SRC = der('ch2#gdop', { ko: '지금 앵커 배치와 태그 위치로 기하행렬 H 를 만들고 (HᵀH)⁻¹ 의 대각 성분으로 계산한 값', en: 'Computed from the diagonal of (HᵀH)⁻¹, with the geometry matrix H built from the current anchor layout and tag position' });
const POS_SRC = der('ch2#gdop', { ko: 'DOP × 측정 노이즈 σ', en: 'DOP × measurement noise σ' });
const LOCAL = { ko: '이 실험에서만 바꾸는 값', en: 'Local to this experiment' };
const sigmaPath = (mode: Mode): string => (mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa');
const sigmaOf = (cfg: SystemConfig, mode: Mode): number => (mode === 'twr' ? cfg.uwb.sigmaTwr : cfg.uwb.sigmaTdoa);

/** 평면 그림용: 위에서 봤을 때 겹치는 앵커를 하나로 합친다 (z = 0 인 한 평면 위의 문제로 본다) */
function planAnchors(anchors: Vec[], hall: { x: number; y: number }): Vec[] {
  const out: Vec[] = [];
  for (const a of anchors) if (!out.some((u) => Math.hypot(u[0] - a[0], u[1] - a[1]) < 0.3)) out.push([a[0], a[1]]);
  return out.length >= 3 ? out : [[0, 0], [hall.x, 0], [hall.x, hall.y], [0, hall.y]];
}
/** 두 앵커가 초점이고 거리 차 d_j − d_i = m 인 쌍곡선 가지를 SVG 경로로 */
function hyperbolaPath(ai: Vec, aj: Vec, m: number, s: PlanScale, reach: number): string | null {
  const dx = aj[0] - ai[0], dy = aj[1] - ai[1];
  const f = Math.hypot(dx, dy) / 2, a = Math.abs(m) / 2;
  if (!(f > 1e-6) || a >= f) return null;
  const b = Math.sqrt(f * f - a * a);
  const ux = dx / (2 * f), uy = dy / (2 * f);
  const cx = (ai[0] + aj[0]) / 2, cy = (ai[1] + aj[1]) / 2;
  const sgn = m > 0 ? -1 : 1; // m > 0 이면 앵커 i 쪽 가지
  const T = Math.asinh(reach / b);
  const pts: string[] = [];
  for (let q = 0; q <= 60; q++) {
    const t = -T + (2 * T * q) / 60;
    const u = sgn * a * Math.cosh(t), v = b * Math.sinh(t);
    pts.push(`${q ? 'L' : 'M'}${s.sx(cx + u * ux - v * uy).toFixed(1)},${s.sy(cy + u * uy + v * ux).toFixed(1)}`);
  }
  return pts.join('');
}
const useClipId = (): string => useMemo(() => `ch2-clip-${Math.random().toString(36).slice(2)}`, []);
const HallClip = ({ id, hall, s }: { id: string; hall: { x: number; y: number }; s: PlanScale }) =>
  <defs><clipPath id={id}><rect x={s.sx(0)} y={s.sy(hall.y)} width={hall.x * s.k} height={hall.y * s.k} /></clipPath></defs>;
/** 참 위치 표식 (× 모양) */
const Cross = ({ x, y, label }: { x: number; y: number; label?: string }) => (
  <g pointer-events="none">
    <line x1={x - 7} y1={y - 7} x2={x + 7} y2={y + 7} stroke="var(--text)" stroke-width="2.5" />
    <line x1={x - 7} y1={y + 7} x2={x + 7} y2={y - 7} stroke="var(--text)" stroke-width="2.5" />
    {label && <text class="ref-label" x={x + 10} y={y - 8} style={{ fontWeight: 700 }}>{label}</text>}
  </g>
);

/* ───────────────────────── 1. 원을 하나씩 더해 보기 ───────────────────────── */
function TriDemo() {
  const cfg = config.value;
  const hall = cfg.hall;
  const [n, setN] = useState(1);
  const clip = useClipId();
  const base = planAnchors(cfg.anchors, hall);
  // 두 번째로 쓰는 앵커는 첫 앵커에서 가장 먼 것으로 고른다(거울상이 강당 안에 보이도록)
  const far = base.slice(1).reduce((best, a) => (dist(a, base[0]) > dist(best, base[0]) ? a : best), base[1]);
  const ordered = [base[0], far, ...base.slice(1).filter((a) => a !== far)];
  const nMax = Math.min(4, ordered.length);
  const used = ordered.slice(0, Math.min(n, nMax));
  const p: Vec = [0.62 * hall.x, 0.42 * hall.y];
  let mirror: Vec | null = null;
  if (used.length === 2) {
    const d = [used[1][0] - used[0][0], used[1][1] - used[0][1]], len = Math.hypot(d[0], d[1]);
    const u = [d[0] / len, d[1] / len], v = [p[0] - used[0][0], p[1] - used[0][1]];
    const t = v[0] * u[0] + v[1] * u[1];
    mirror = [used[0][0] + 2 * t * u[0] - v[0], used[0][1] + 2 * t * u[1] - v[1]];
  }
  const msg = [
    { ko: '거리 하나: 태그는 이 원 위 어딘가에 있습니다. 후보가 끝없이 많습니다.', en: 'One range: the tag is somewhere on this circle. There are infinitely many candidates.' },
    { ko: '거리 둘: 두 원이 만나는 두 점만 남습니다. 하나는 참 위치, 다른 하나는 두 앵커를 잇는 직선에 대한 거울상입니다.', en: 'Two ranges: only the two intersection points remain. One is the true position, the other its mirror image across the line through the two anchors.' },
    { ko: '거리 셋: 세 번째 원이 거울상을 지나지 않으므로 한 점으로 정해집니다. 평면에서는 앵커 3개면 됩니다.', en: 'Three ranges: the third circle misses the mirror image, so a single point remains. In a plane three anchors suffice.' },
    { ko: '거리 넷: 네 번째 원도 같은 점을 지납니다. 남는 측정은 잡음이 있을 때 서로를 평균 내는 데 쓰입니다.', en: 'Four ranges: the fourth circle passes through the same point. Extra measurements average each other out once there is noise.' },
  ][used.length - 1];
  return (
    <Demo title={{ ko: '원을 하나씩 더해 보기 (평면)', en: 'Adding circles one at a time (in a plane)' }} testId="ch2-tri-demo">
      <P ko="강당을 위에서 본 그림입니다. 그리기 쉽게 태그와 앵커가 모두 한 평면 위에 있다고 보고, 잡음 없는 거리를 씁니다. × 가 태그의 참 위치입니다."
        en="The hall seen from above. To keep the drawing simple, tag and anchors are taken to lie in one plane and the ranges are noise-free. The × marks the true tag position." />
      <Segmented label={{ ko: '쓰는 앵커(거리) 수', en: 'Number of anchors (ranges) used' }} value={used.length} onChange={setN} testId="ch2-tri-n"
        options={Array.from({ length: nMax }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
      <PlanView hall={hall} anchors={used.map((a) => [a[0], a[1], 0])} maxHeight={340} testId="ch2-tri-plan"
        src={der('ch2#trilateration', { ko: '앵커에서 참 위치까지의 거리를 반지름으로 그린 원', en: 'Circles whose radius is the distance from each anchor to the true position' })}
        caption={<>{tr({ ko: '참 위치는 강당 크기에 맞춰 잡은 값입니다', en: 'The true position is chosen relative to the hall size' })}<SrcBadge src={ex(undefined, { ko: '그림을 위한 가정', en: 'An assumption for the figure' })} /><SrcBadge src={der('ch2#trilateration', { ko: '앵커에서 참 위치까지의 거리를 반지름으로 그린 원', en: 'Circles whose radius is the distance from each anchor to the true position' })} /></>}>
        {(s) => (
          <g>
            <HallClip id={clip} hall={hall} s={s} />
            <g clip-path={`url(#${clip})`}>
              {used.map((a, i) => <circle key={i} cx={s.sx(a[0])} cy={s.sy(a[1])} r={dist(p, a) * s.k} fill="none" stroke={seriesColor(i + 1)} stroke-width="2" stroke-dasharray={seriesDash(i + 1)} />)}
              {mirror && (
                <g>
                  <circle cx={s.sx(mirror[0])} cy={s.sy(mirror[1])} r="7" fill="var(--surface)" stroke="var(--critical)" stroke-width="2.5" />
                  <text class="ref-label" x={s.sx(mirror[0]) + 11} y={s.sy(mirror[1]) + 4} style={{ fontWeight: 700 }}>{tr({ ko: '거울상', en: 'mirror image' })}</text>
                </g>
              )}
            </g>
            <Cross x={s.sx(p[0])} y={s.sy(p[1])} label={tr({ ko: '참 위치', en: 'true position' })} />
          </g>
        )}
      </PlanView>
      <p><Status kind={used.length >= 3 ? 'good' : 'warn'}>{tr(msg)}</Status></p>
    </Demo>
  );
}

/* ───────────────────────── 2. 가우스-뉴턴 한 걸음씩 ───────────────────────── */
function GnDemo() {
  const cfg = config.value;
  const hall = cfg.hall;
  const aKey = JSON.stringify(planAnchors(cfg.anchors, hall));
  const A = useMemo(() => JSON.parse(aKey) as Vec[], [aKey]);
  const [mode, setMode] = useState<Mode>(cfg.uwb.mode);
  const [sigma, setSigma] = useState(sigmaOf(cfg, cfg.uwb.mode));
  const [seed, setSeed] = useState(1);
  const [x0, setX0] = useState<Vec>([0.1 * hall.x, 0.85 * hall.y]);
  const [k, setK] = useState(0);
  const clip = useClipId();
  const tx = 0.62 * hall.x, ty = 0.42 * hall.y;
  const gx = Math.min(hall.x, x0[0]), gy = Math.min(hall.y, x0[1]);
  const sol = useMemo(() => {
    const truth = [tx, ty];
    const rng = new Rng(seed * 7919 + 13);
    const pairs = pairsFor(A.length, 'ring');
    const meas = mode === 'twr'
      ? A.map((a) => dist(truth, a) + rng.gauss(0, sigma))
      : pairs.map(([i, j]) => dist(truth, A[j]) - dist(truth, A[i]) + rng.gauss(0, sigma));
    const run = (maxIter: number) => (mode === 'twr' ? gaussNewtonRange(A, meas, [gx, gy], { maxIter }) : gaussNewtonTdoa(A, pairs, meas, [gx, gy], { maxIter }));
    const path = run(12).path;
    const K = path.length - 1, nMeas = meas.length;
    // 엔진이 돌려주는 비용 F = ½Σr² 을 반복 횟수별로 읽어 잔차 RMS = √(2F/n) 로 바꾼다
    const resRms = Array.from({ length: K + 1 }, (_, i) => Math.sqrt((2 * run(i).cost) / nMeas));
    const stepLen = path.slice(1).map((q, i) => dist(q, path[i]));
    return { pairs, meas, path, K, nMeas, resRms, stepLen };
  }, [A, mode, sigma, seed, gx, gy, tx, ty]);
  const kk = Math.min(k, sol.K);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setK(0); };
  const floor = 1e-9;
  const clampLog = (v: number) => Math.max(floor, v);
  const idx = Array.from({ length: kk + 1 }, (_, i) => i);
  const all = [...sol.resRms, ...sol.stepLen].map(clampLog);
  const expected = sigma * Math.sqrt(Math.max(0, sol.nMeas - 2) / sol.nMeas);
  const yLo = Math.min(...all, expected > 0 ? expected : Infinity) / 3, yHi = Math.max(...all) * 3;
  const cur = sol.path[kk];
  const errNow = dist(cur, [tx, ty]);
  const SRC = der('ch2#gn', { ko: '아래 측정값에 가우스-뉴턴 갱신을 반복한 결과 (엔진의 gaussNewtonRange / gaussNewtonTdoa)', en: 'Gauss–Newton updates applied to the measurements below (engine functions gaussNewtonRange / gaussNewtonTdoa)' });
  return (
    <LinkGroup>
      <Demo title={{ ko: '가우스-뉴턴을 한 걸음씩', en: 'Gauss–Newton, one step at a time' }} testId="ch2-gn-demo">
        <P ko="평면에서 푸는 위치 추정입니다. 그림을 누르면(또는 아래 슬라이더로) **처음 추정**을 옮길 수 있습니다. ‘다음 반복’을 누를 때마다 아래 식이 한 번 적용됩니다."
          en="Position estimation in a plane. Click the figure (or use the sliders) to move the **initial guess**. Each press of ‘Next iteration’ applies the formula below once." />
        <M block tex={String.raw`\lk{upd}{x_{k+1} = x_k + \Delta x}, \qquad \lk{step}{\Delta x} \;=\; -\big(\lk{jac}{J}\T \lk{jac}{J}\big)^{-1}\, \lk{jac}{J}\T\, \lk{res}{r}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 그래프의 선과 (펼쳤다면) 코드 줄이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching chart line and (if expanded) code lines.' })}</p>
        <Segmented label={{ ko: '측정의 종류 (이 데모에서만)', en: 'Kind of measurement (this demo only)' }} value={mode} onChange={reset(setMode)} options={MODES} testId="ch2-gn-mode" />
        <div class="controls">
          <Slider label={{ ko: '측정 노이즈 $\\sigma$', en: 'Measurement noise $\\sigma$' }} value={sigma} min={0} max={0.5} step={0.01} scale={100} unit="cm" onChange={reset(setSigma)}
            src={ex(sigmaPath(mode), { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} testId="ch2-gn-sigma" />
          <Slider label={{ ko: '처음 추정 $x$', en: 'Initial guess $x$' }} value={gx} min={0} max={hall.x} step={0.25} unit="m" onChange={(v) => { setX0([v, gy]); setK(0); }} src={ex(undefined, LOCAL)} testId="ch2-gn-x0" />
          <Slider label={{ ko: '처음 추정 $y$', en: 'Initial guess $y$' }} value={gy} min={0} max={hall.y} step={0.25} unit="m" onChange={(v) => { setX0([gx, v]); setK(0); }} src={ex(undefined, LOCAL)} testId="ch2-gn-y0" />
        </div>
        <div class="btn-row" style={{ marginBottom: '10px' }}>
          <Button primary onClick={() => setK(Math.min(sol.K, kk + 1))} disabled={kk >= sol.K} testId="ch2-gn-next">{tr({ ko: '다음 반복 ▶', en: 'Next iteration ▶' })}</Button>
          <Button onClick={() => setK(sol.K)} disabled={kk >= sol.K} testId="ch2-gn-end">{tr({ ko: '끝까지', en: 'Run to the end' })}</Button>
          <Button onClick={() => setK(0)} disabled={kk === 0}>{tr({ ko: '처음으로', en: 'Back to start' })}</Button>
          <Button onClick={() => { setSeed(seed + 1); setK(0); }} testId="ch2-gn-seed">{tr({ ko: '잡음 다시 뽑기', en: 'Draw new noise' })}</Button>
        </div>
        <div class="grid-2">
          <div>
            <PlanView hall={hall} anchors={A.map((a) => [a[0], a[1], 0])} maxHeight={360} testId="ch2-gn-plan" src={SRC}
              caption={<>{tr(mode === 'twr'
                ? { ko: '가는 선: 측정한 거리를 반지름으로 한 원. ×: 참 위치. 번호 붙은 점: 반복 경로(0 = 처음 추정).', en: 'Thin lines: circles with the measured ranges as radius. ×: true position. Numbered dots: iteration path (0 = initial guess).' }
                : { ko: '가는 점선: 측정한 거리 차가 일정한 쌍곡선(이웃한 앵커 쌍마다 하나). ×: 참 위치. 번호 붙은 점: 반복 경로(0 = 처음 추정).', en: 'Thin dashed lines: hyperbolas of constant measured range difference (one per pair of neighbouring anchors). ×: true position. Numbered dots: iteration path (0 = initial guess).' })}<SrcBadge src={SRC} /></>}>
              {(s) => (
                <g>
                  <HallClip id={clip} hall={hall} s={s} />
                  <rect x={s.sx(0)} y={s.sy(hall.y)} width={hall.x * s.k} height={hall.y * s.k} fill="transparent" style={{ cursor: 'crosshair' }}
                    onClick={(e) => {
                      const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                      const x = Math.round(((e.clientX - r.left) / s.k) * 4) / 4, y = Math.round((hall.y - (e.clientY - r.top) / s.k) * 4) / 4;
                      setX0([Math.min(hall.x, Math.max(0, x)), Math.min(hall.y, Math.max(0, y))]); setK(0);
                    }} />
                  <g clip-path={`url(#${clip})`} pointer-events="none">
                    {mode === 'twr'
                      ? A.map((a, i) => <circle key={i} cx={s.sx(a[0])} cy={s.sy(a[1])} r={Math.max(0, sol.meas[i]) * s.k} fill="none" stroke="var(--series-1)" stroke-width="1.3" opacity="0.8" />)
                      : sol.pairs.map(([i, j], q) => { const d = hyperbolaPath(A[i], A[j], sol.meas[q], s, hall.x + hall.y); return d && <path key={q} d={d} fill="none" stroke="var(--series-1)" stroke-width="1.3" stroke-dasharray="6 3" opacity="0.85" />; })}
                    <polyline points={sol.path.slice(0, kk + 1).map((q) => `${s.sx(q[0]).toFixed(1)},${s.sy(q[1]).toFixed(1)}`).join(' ')} fill="none" stroke="var(--series-3)" stroke-width="2.5" />
                    {sol.path.slice(0, kk + 1).map((q, i) => (
                      <g key={i}>
                        <circle cx={s.sx(q[0])} cy={s.sy(q[1])} r={i === kk ? 6 : 4} fill={i === kk ? 'var(--series-3)' : 'var(--surface)'} stroke="var(--series-3)" stroke-width="2" />
                        {(i === 0 || sol.stepLen[i - 1] * s.k > 14) && <text class="ref-label" x={s.sx(q[0]) + 8} y={s.sy(q[1]) + 14} style={{ fontWeight: 700 }}>{i}</text>}
                      </g>
                    ))}
                  </g>
                  <Cross x={s.sx(tx)} y={s.sy(ty)} />
                </g>
              )}
            </PlanView>
          </div>
          <div>
            <StatRow>
              <Stat label={{ ko: '반복 횟수 $k$', en: 'Iteration $k$' }} value={`${kk} / ${sol.K}`} src={SRC} />
              <Stat label={{ ko: '참 위치까지 남은 거리', en: 'Distance left to the true position' }} value={errNow * 100} unit="cm" src={SRC} />
              <Stat label={{ ko: '잔차 RMS', en: 'Residual RMS' }} value={sol.resRms[kk] * 100} unit="cm" src={SRC} />
            </StatRow>
            <LineChart
              title={{ ko: '반복할수록 줄어드는 잔차와 걸음 (세로축은 로그)', en: 'Residual and step shrinking with iterations (log vertical axis)' }}
              xLabel={{ ko: '반복 횟수 k', en: 'Iteration k' }} yLabel={{ ko: '길이 [m]', en: 'Length [m]' }} yLog height={250}
              xDomain={[0, Math.max(1, sol.K)]} yDomain={[yLo, yHi]}
              series={[
                { name: { ko: '잔차 RMS √(Σr²/n)', en: 'Residual RMS √(Σr²/n)' }, x: idx, y: idx.map((i) => clampLog(sol.resRms[i])), slot: 1, dash: '', link: 'res' },
                { name: { ko: '걸음 크기 ‖Δx‖', en: 'Step length ‖Δx‖' }, x: idx.slice(1), y: idx.slice(1).map((i) => clampLog(sol.stepLen[i - 1])), slot: 2, dash: '7 4', link: 'step' },
                { name: { ko: '잔차 RMS (점)', en: 'Residual RMS (points)' }, x: idx, y: idx.map((i) => clampLog(sol.resRms[i])), slot: 1, points: true, link: 'res' },
                { name: { ko: '걸음 크기 (점)', en: 'Step length (points)' }, x: idx.slice(1), y: idx.slice(1).map((i) => clampLog(sol.stepLen[i - 1])), slot: 2, points: true, link: 'step' },
              ]}
              refLines={expected > 0 ? [{ y: expected, label: { ko: '이론: 남는 잔차의 기대 크기 σ√((n−2)/n)', en: 'Theory: expected leftover residual σ√((n−2)/n)' }, slot: 4 }] : []}
              src={SRC} testId="ch2-gn-chart" />
          </div>
        </div>
        <Caption>{tr({
          ko: `잡음이 0 이면 잔차는 계산 오차 수준까지 떨어집니다(그래프에서는 ${fmt(floor * 1e9)} nm 아래를 잘라 그립니다). 잡음이 있으면 잔차는 0 이 되지 못하고 이론선 근처에서 멈춥니다. 측정 n = ${sol.nMeas}개로 미지수 2개를 맞추고 남는 어긋남이기 때문입니다. 한 번의 잡음으로는 이론선 위아래로 흩어지고, 잡음을 여러 번 다시 뽑으면 평균적으로 그 높이가 됩니다.`,
          en: `With zero noise the residual falls to round-off level (the chart clips below ${fmt(floor * 1e9)} nm). With noise it cannot reach zero and settles near the theory line: it is the mismatch left after fitting 2 unknowns to n = ${sol.nMeas} measurements. A single noise draw scatters around the line; over many draws it averages to that height.`,
        })}<SrcBadge src={der('ch2#gn', { ko: '잔차 제곱합의 기대값은 (n − 미지수 개수)·σ²', en: 'The expected sum of squared residuals is (n − number of unknowns)·σ²' })} /></Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch2-gn-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (바로 아래 과제의 기준 구현입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference solution of the task just below — keep it closed if you want to try first)' })}</summary>
          <CodeView code={gaussNewtonTask.solution} links={gaussNewtonTask.links} />
        </details>
      </Demo>
    </LinkGroup>
  );
}

/* ───────────────────────── 3. 대표 데모: DOP 지도 ───────────────────────── */
function DopDemo() {
  const cfg = config.value;
  const { hall, anchors } = cfg;
  const mode: Mode = cfg.uwb.mode;
  const z = cfg.formation.height, sigma = sigmaOf(cfg, mode);
  const [which, setWhich] = useState<Which>('pdop');
  const [probe, setProbe] = useState<Vec>([hall.x / 2, hall.y / 2]);
  const [sel, setSel] = useState(0);
  const armed = useRef(false);
  const px = Math.min(hall.x, probe[0]), py = Math.min(hall.y, probe[1]);
  const si = Math.min(sel, anchors.length - 1);
  // 문자열로 묶어 디바운스한다(끄는 동안에는 지도를 다시 계산하지 않는다)
  const key = JSON.stringify({ anchors, mode, z, which, hx: hall.x, hy: hall.y });
  const dkey = useDebounced(key, 120);
  const grid = useMemo(() => {
    const q = JSON.parse(dkey) as { anchors: Vec[]; mode: Mode; z: number; which: Which; hx: number; hy: number };
    return dopGrid(q.mode, q.anchors, { x: q.hx, y: q.hy }, q.z, 48, 36, q.which);
  }, [dkey]);
  const d: Dop = dopFor(mode, anchors, [px, py, z]);
  const solvable = Number.isFinite(d.pdop);
  const aKey = JSON.stringify(anchors);
  const whichLabel = WHICH.find((w) => w.value === which)!.label;
  const moveAnchor = (i: number, x: number, y: number) => setPath('anchors', anchors.map((a, j) => (j === i ? [x, y, a[2]] : a.slice())));
  const mcKey = `${aKey}|${mode}|${z}|${px}|${py}|${sigma}`;
  const sH = d.hdop * sigma, sV = d.vdop * sigma;
  const MC_SRC = der('ch2#gdop', { ko: '탐침 위치에서 잡음 섞인 측정 한 벌을 만들고 가우스-뉴턴으로 푸는 일을 반복한 결과 (NLOS 없음)', en: 'Repeatedly drawing one noisy set of measurements at the probe and solving with Gauss–Newton (no NLOS)' });
  return (
    <>
      <Demo title={{ ko: '앵커를 끌면 DOP 지도가 바뀐다', en: 'Drag the anchors and watch the DOP map change' }} testId="ch2-dop-demo">
        <P ko="강당을 위에서 본 그림입니다. 색은 **비행 고도의 평면**에서 태그가 그 자리에 있을 때의 DOP 입니다(진할수록 나쁨). 마름모가 앵커이고, 끌거나(키보드: 앵커에 포커스 후 방향키) 아래에서 높이를 바꿀 수 있습니다. 여기서 바꾸는 앵커·모드·고도는 **전역 설정**이라 오차 예산과 다른 장도 함께 바뀝니다."
          en="The hall from above. The colour is the DOP for a tag at that spot **in the plane of the flight height** (darker is worse). Diamonds are anchors: drag them (keyboard: focus an anchor, then arrow keys) or change their height below. Anchors, mode and height changed here are **global settings**, so the error budget and other chapters follow." />
        <Segmented label={{ ko: '측위 모드 (전역 설정)', en: 'Positioning mode (global setting)' }} value={mode} onChange={(v) => setPath('uwb.mode', v)} options={MODES} testId="ch2-dop-mode" />
        <Segmented label={{ ko: '지도에 그릴 값', en: 'Quantity on the map' }} value={which} onChange={setWhich} options={WHICH} testId="ch2-dop-which" />
        <div class="controls">
          <CfgSlider path="formation.height" min={0.3} max={Math.max(1, hall.z)} />
          <CfgSlider path={sigmaPath(mode)} max={50} />
        </div>
        <div class="grid-2">
          <div onPointerDownCapture={() => { armed.current = true; }} onPointerUpCapture={() => { armed.current = false; }}>
            <PlanView hall={hall} anchors={anchors} onAnchorMove={moveAnchor} probe={[px, py]} maxHeight={380} testId="ch2-dop-plan" src={DOP_SRC}
              onProbe={(x, y) => { if (armed.current) { armed.current = false; setProbe([Math.round(x * 4) / 4, Math.round(y * 4) / 4]); } }}
              heat={{ values: grid.values, min: HEAT_MIN, max: HEAT_MAX, label: { ko: `${whichLabel.ko} · ${mode === 'twr' ? 'TWR' : 'TDoA'}`, en: `${whichLabel.en} · ${mode === 'twr' ? 'TWR' : 'TDoA'}` } }}
              caption={tr({ ko: '빈 곳을 누르면 탐침(+)이 그 자리로 옵니다. 기본 배치에서는 모서리마다 낮은 앵커와 높은 앵커가 겹쳐 보입니다 — 하나를 끌어내면 아래 것이 드러납니다.', en: 'Click an empty spot to move the probe (+) there. In the default layout a low and a high anchor overlap at each corner — drag one away to reveal the other.' })} />
          </div>
          <div>
            <Scene3D height={300} testId="ch2-dop-3d" target={[hall.x / 2, hall.y / 2, hall.z / 3]}
              cameraPos={[hall.x / 2 - 0.75 * Math.max(hall.x, hall.y), hall.y / 2 - Math.max(hall.x, hall.y), hall.z + 0.45 * Math.max(hall.x, hall.y)]}
              ariaLabel={tr({ ko: `강당 ${fmt(hall.x)} × ${fmt(hall.y)} × ${fmt(hall.z)} m 안의 앵커 ${anchors.length}개와 높이 ${fmt(z)} m 의 비행 평면`, en: `${anchors.length} anchors inside the ${fmt(hall.x)} × ${fmt(hall.y)} × ${fmt(hall.z)} m hall and the flight plane at ${fmt(z)} m` })}
              src={ex(undefined, { ko: '전역 설정의 강당 크기·앵커 좌표·비행 고도를 그대로 그린 그림', en: 'Drawn directly from the hall size, anchor coordinates and flight height in the global settings' })}
              deps={[aKey, hall.x, hall.y, hall.z, z, px, py]}
              build={(ctx) => {
                ctx.floorGrid(hall.x, hall.y, Math.max(hall.x, hall.y) > 30 ? 5 : 1);
                ctx.wireBox([0, 0, 0], [hall.x, hall.y, hall.z]);
                ctx.line([[0, 0, z], [hall.x, 0, z], [hall.x, hall.y, z], [0, hall.y, z], [0, 0, z]], 1);
                ctx.label([hall.x / 2, 0, z + 0.45], `z = ${fmt(z)} m`);
                anchors.forEach((a, i) => {
                  ctx.line([[a[0], a[1], 0], [a[0], a[1], a[2]]], '--text-3', true);
                  ctx.marker(a, 2, 0.2);
                  ctx.label([a[0], a[1], a[2] + 0.5], `A${i}`);
                });
                ctx.line([[px, py, 0], [px, py, z]], '--text-2', true);
                ctx.marker([px, py, z], 3, 0.22);
              }} />
            <p class="muted small" style={{ margin: '2px 0 0' }}>{tr({ ko: '주황 구: 앵커(점선은 바닥까지의 높이). 실선 사각형: 비행 고도의 평면. 평면 위의 구: 탐침.', en: 'Orange spheres: anchors (dashed lines show their height above the floor). Solid rectangle: the flight-height plane. Sphere on the plane: the probe.' })}</p>
          </div>
        </div>
        <div class="controls" style={{ marginTop: '8px' }}>
          <Slider label={{ ko: '탐침 $x$', en: 'Probe $x$' }} value={px} min={0} max={hall.x} step={0.25} unit="m" onChange={(v) => setProbe([v, py])} src={ex(undefined, { ko: 'DOP 를 읽을 위치. 이 데모에서만 쓰는 값', en: 'Where to read the DOP; local to this demo' })} testId="ch2-probe-x" />
          <Slider label={{ ko: '탐침 $y$', en: 'Probe $y$' }} value={py} min={0} max={hall.y} step={0.25} unit="m" onChange={(v) => setProbe([px, v])} src={ex(undefined, { ko: 'DOP 를 읽을 위치. 이 데모에서만 쓰는 값', en: 'Where to read the DOP; local to this demo' })} testId="ch2-probe-y" />
        </div>
        <StatRow>
          <Stat label={{ ko: '탐침의 HDOP', en: 'HDOP at the probe' }} value={d.hdop} src={DOP_SRC} />
          <Stat label={{ ko: '탐침의 VDOP', en: 'VDOP at the probe' }} value={d.vdop} src={DOP_SRC} status={d.vdop > 2.5 * d.hdop ? 'warn' : undefined} />
          <Stat label={{ ko: '측정 노이즈 $\\sigma$', en: 'Measurement noise $\\sigma$' }} value={sigma * 100} unit="cm" src={fieldSource(sigmaPath(mode), sigma)} />
          <Stat label={{ ko: '예상 수평 오차 HDOP·$\\sigma$', en: 'Predicted horizontal error HDOP·$\\sigma$' }} value={sH * 100} unit="cm" src={POS_SRC} />
          <Stat label={{ ko: '예상 수직 오차 VDOP·$\\sigma$', en: 'Predicted vertical error VDOP·$\\sigma$' }} value={sV * 100} unit="cm" src={POS_SRC} />
        </StatRow>
        {!solvable && <p><Status kind="bad">{tr({ ko: '이 위치에서는 위치를 풀 수 없습니다 (HᵀH 의 역행렬이 없음)', en: 'The position cannot be solved here (HᵀH has no inverse)' })}</Status></p>}
        <div class="controls">
          <div>
            <Segmented label={{ ko: '높이를 바꿀 앵커', en: 'Anchor whose height to change' }} value={si} onChange={setSel} options={anchors.map((_, i) => ({ value: i, label: `A${i}` }))} testId="ch2-anchor-sel" />
          </div>
          <Slider label={{ ko: `앵커 A${si} 의 높이 $z$`, en: `Height $z$ of anchor A${si}` }} value={anchors[si][2]} min={0.1} max={hall.z} step={0.1} unit="m" testId="ch2-anchor-z"
            onChange={(v) => setPath('anchors', anchors.map((a, j) => (j === si ? [a[0], a[1], v] : a.slice())))}
            src={ex(undefined, { ko: '전역 설정의 앵커 좌표. 여러분의 강당에서 실제로 잰 값으로 바꾸세요.', en: 'Anchor coordinates in the global settings. Replace them with the values surveyed in your hall.' })} />
        </div>
        <div class="btn-row">
          <Button onClick={() => setPath('anchors', defaultAnchors(hall, anchors.length))} testId="ch2-anchor-reset">{tr({ ko: '앵커를 기본 배치로 되돌리기', en: 'Reset anchors to the default layout' })}</Button>
        </div>
      </Demo>
      {solvable && (
        <McPanel key={mcKey}
          title={{ ko: '예측을 실험으로 확인: 탐침 위치에서 위치를 여러 번 풀어 보기', en: 'Checking the prediction: solving the position many times at the probe' }}
          experiment="positioning" metric="errH" testId="ch2-mc" defaultRuns={1000} src={MC_SRC}
          params={{ anchors, p: [px, py, z], mode, nlos: { sigma, pNlos: 0, biasMean: 0 } }}
          xLabel={{ ko: '수평 오차의 크기 √(e_x² + e_y²) [m]', en: 'Horizontal error magnitude √(e_x² + e_y²) [m]' }}
          refLines={[{ x: sH, label: { ko: '이론 RMS = HDOP·σ', en: 'Theory RMS = HDOP·σ' }, slot: 2 }]}
          note={{
            ko: `위 데모의 탐침 (${fmt(px)}, ${fmt(py)}, ${fmt(z)}) m{{ex}} 에서 잡음 σ 가 섞인 측정 한 벌을 만들고 가우스-뉴턴으로 위치를 풉니다. 이것을 여러 번 되풀이해 오차의 분포를 봅니다. NLOS 는 껐습니다(4장에서 다룹니다). 탐침·앵커·모드를 바꾸면 결과가 지워지니 다시 돌리세요.`,
            en: `At the probe (${fmt(px)}, ${fmt(py)}, ${fmt(z)}) m{{ex}} of the demo above we draw one set of measurements with noise σ and solve the position with Gauss–Newton, many times over, and look at the error distribution. NLOS is off (see chapter 4). Changing probe, anchors or mode clears the result — run again.`,
          }}>
          {(results) => {
            const ez = results.map((r) => r.ez).filter(Number.isFinite), eh = results.map((r) => r.errH).filter(Number.isFinite);
            return (
              <>
                <StatRow>
                  <Stat label={{ ko: '실험: 수평 오차 RMS', en: 'Experiment: horizontal error RMS' }} value={rms(eh) * 100} unit="cm" src={MC_SRC} />
                  <Stat label={{ ko: '이론: HDOP·$\\sigma$', en: 'Theory: HDOP·$\\sigma$' }} value={sH * 100} unit="cm" src={POS_SRC} />
                  <Stat label={{ ko: '실험: 수직 오차 RMS', en: 'Experiment: vertical error RMS' }} value={rms(ez) * 100} unit="cm" src={MC_SRC} />
                  <Stat label={{ ko: '이론: VDOP·$\\sigma$', en: 'Theory: VDOP·$\\sigma$' }} value={sV * 100} unit="cm" src={POS_SRC} />
                </StatRow>
                <Histogram title={{ ko: '수직 오차 e_z 의 분포와 이론 곡선', en: 'Distribution of the vertical error e_z with the theory curve' }} values={ez} bins={31} range={[-4 * sV, 4 * sV]}
                  xLabel={{ ko: '수직 오차 e_z [m]', en: 'Vertical error e_z [m]' }} slot={3} src={MC_SRC}
                  theory={{ name: { ko: '이론: 평균 0, 표준편차 VDOP·σ 인 정규분포', en: 'Theory: normal, mean 0, std VDOP·σ' }, pdf: (x) => normPdf(x, 0, sV) }} />
              </>
            );
          }}
        </McPanel>
      )}
    </>
  );
}

/* ───────────────────────── 함정 1: 앵커를 모두 같은 높이에 ───────────────────────── */
function SameHeightPitfall() {
  const cfg = config.value;
  const hall = cfg.hall;
  const [applied, setApplied] = useState(false);
  const [mode, setMode] = useState<Mode>(cfg.uwb.mode);
  const [zf, setZf] = useState(Math.min(cfg.formation.height, hall.z - 0.1));
  const [z0, setZ0] = useState(hall.z + 1);
  const hk = `${hall.x}|${hall.y}|${hall.z}`;
  const mixed = useMemo(() => defaultAnchors(hall, 8, false), [hk]);
  const same = useMemo(() => defaultAnchors(hall, 8, true), [hk]);
  const zA = same[0][2];
  const local = applied ? same : mixed; // 실험용 사본. 전역 설정은 건드리지 않는다.
  const c: Vec = [hall.x / 2, hall.y / 2, zf];
  const dzf = useDebounced(zf, 120);
  const gridMixed = useMemo(() => dopGrid(mode, mixed, hall, dzf, 40, 30, 'vdop'), [mode, mixed, dzf]);
  const gridLocal = useMemo(() => dopGrid(mode, local, hall, dzf, 40, 30, 'vdop'), [mode, local, dzf]);
  const cases: { key: string; label: { ko: string; en: string }; m: Mode; a: Vec[] }[] = [
    { key: 'twr-mixed', label: { ko: 'TWR · 높이 섞음', en: 'TWR · mixed heights' }, m: 'twr', a: mixed },
    { key: 'twr-same', label: { ko: 'TWR · 같은 높이', en: 'TWR · same height' }, m: 'twr', a: same },
    { key: 'tdoa-mixed', label: { ko: 'TDoA · 높이 섞음', en: 'TDoA · mixed heights' }, m: 'tdoa', a: mixed },
    { key: 'tdoa-same', label: { ko: 'TDoA · 같은 높이', en: 'TDoA · same height' }, m: 'tdoa', a: same },
  ];
  const sweep = useMemo(() => {
    const zs = Array.from({ length: 78 }, (_, i) => 0.3 + ((hall.z - 0.35) * i) / 77);
    return { zs, v: cases.map((q) => zs.map((zz) => Math.min(1e3, dopFor(q.m, q.a, [hall.x / 2, hall.y / 2, zz]).vdop))) };
  }, [mixed, same]);
  const pairs = pairsFor(8, 'ring');
  const zCol = (m: Mode, a: Vec[]) => (m === 'twr' ? rangeGeometry(a, c) : tdoaGeometry(a, c, pairs)).map((r) => r[2]);
  // 거울상 실험: 같은 높이 배치에 잡음 없는 거리를 주고, 처음 추정의 높이만 바꿔 본다
  const truth: Vec = [0.4 * hall.x, 0.4 * hall.y, zf];
  const start: Vec = [truth[0] + 1, truth[1] + 1, z0];
  const solSame = gaussNewtonRange(same, same.map((a) => dist(truth, a)), start).x;
  const solMixed = gaussNewtonRange(mixed, mixed.map((a) => dist(truth, a)), start).x;
  const flipped = Math.abs(solSame[2] - zf) > 0.05;
  const heat = (g: { values: number[][] }) => ({ values: g.values, min: HEAT_MIN, max: HEAT_MAX, label: { ko: `VDOP · ${mode === 'twr' ? 'TWR' : 'TDoA'}`, en: `VDOP · ${mode === 'twr' ? 'TWR' : 'TDoA'}` } });
  return (
    <Pitfall title={{ ko: '앵커를 모두 같은 높이에 달기', en: 'Mounting every anchor at the same height' }} testId="ch2-pitfall-height">
      <P ko="천장 트러스나 벽 위쪽 한 줄에 앵커를 나란히 다는 것이 설치는 가장 쉽습니다. 무엇이 나빠지는지 지도와 숫자로 봅시다. 이 실험은 **사본**으로 하므로 전역 설정은 바뀌지 않습니다."
        en="Mounting all anchors along one ceiling truss or one line high on the walls is the easiest installation. Let us see on the map and in numbers what gets worse. This experiment works on a **copy**; the global settings are untouched." />
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button primary={!applied} onClick={() => setApplied(true)} disabled={applied} testId="ch2-same-apply">{tr({ ko: `▶ 앵커 8개를 모두 높이 ${fmt(zA)} m 에 달기`, en: `▶ Mount all 8 anchors at ${fmt(zA)} m` })}</Button>
        <Button onClick={() => setApplied(false)} disabled={!applied}>{tr({ ko: '높이를 섞은 배치로 되돌리기', en: 'Back to mixed heights' })}</Button>
        <SrcBadge src={ex(undefined, { ko: '실험용 배치: 강당 높이에서 1 m 아래. 모서리 4곳, 벽 중간 4곳', en: 'Experimental layout: 1 m below the ceiling; four corners and four wall midpoints' })} />
      </div>
      <Segmented label={{ ko: '지도의 모드 (이 실험에서만)', en: 'Mode of the maps (this experiment only)' }} value={mode} onChange={setMode} options={MODES} testId="ch2-same-mode" />
      <Slider label={{ ko: '비행 고도', en: 'Flight height' }} value={zf} min={0.3} max={hall.z - 0.1} step={0.1} unit="m" onChange={setZf} src={ex('formation.height', LOCAL)} testId="ch2-same-z" />
      <div class="grid-2">
        <div>
          <div class="plot-title">{tr({ ko: '기준: 높이를 섞은 배치', en: 'Reference: mixed heights' })}</div>
          <PlanView hall={hall} anchors={mixed} heat={heat(gridMixed)} maxHeight={280} src={DOP_SRC} testId="ch2-same-map-ref" />
        </div>
        <div>
          <div class="plot-title">{tr(applied ? { ko: '실험: 모두 같은 높이', en: 'Experiment: all at the same height' } : { ko: '실험용 사본 (아직 기준과 같음)', en: 'Experimental copy (still identical to the reference)' })}</div>
          <PlanView hall={hall} anchors={local} heat={heat(gridLocal)} maxHeight={280} src={DOP_SRC} testId="ch2-same-map-exp" />
        </div>
      </div>
      <p class="small muted" style={{ marginBottom: '2px' }}>{tr({ ko: `강당 중앙, 높이 ${fmt(zf)} m 에서의 VDOP`, en: `VDOP at the hall centre, height ${fmt(zf)} m` })}<SrcBadge src={ex('formation.height', LOCAL)} /></p>
      <StatRow>
        {cases.map((q) => {
          const v = dopFor(q.m, q.a, c).vdop, ref = dopFor(q.m, mixed, c).vdop;
          return <Stat key={q.key} label={q.label} value={v} src={DOP_SRC} status={q.a === same ? (v > 2 * ref ? 'bad' : 'good') : undefined} />;
        })}
      </StatRow>
      {applied && (
        <>
          <LineChart
            title={{ ko: '비행 고도를 바꿔 가며 본 강당 중앙의 VDOP (세로축은 로그)', en: 'VDOP at the hall centre versus flight height (log vertical axis)' }}
            xLabel={{ ko: '비행 고도 z [m]', en: 'Flight height z [m]' }} yLabel="VDOP" yLog yDomain={[0.3, 100]} height={270}
            series={cases.map((q, i) => ({ name: q.label, x: sweep.zs, y: sweep.v[i], slot: i + 1 }))}
            refLines={[{ x: zA, label: { ko: `같은 높이 배치의 앵커 높이 ${fmt(zA)} m`, en: `Anchor height of the same-height layout, ${fmt(zA)} m` }, slot: 8 }, { x: zf, label: { ko: '지금 비행 고도', en: 'Current flight height' } }]}
            src={DOP_SRC} testId="ch2-same-chart" />
          <List items={[
            { ko: '**TDoA · 같은 높이**: 낮게 날든 높게 날든 VDOP 가 크고, 앵커 높이에 다가갈수록 끝없이 커집니다. 수평(HDOP)은 거의 그대로라 평면도에서 대형을 볼 때는 문제를 알아채기 어렵습니다.', en: '**TDoA · same height**: VDOP is large whether you fly low or high, and grows without bound towards the anchor height. The horizontal part (HDOP) barely changes, so you would not notice the problem watching the formation from above.' },
            { ko: '**TWR · 같은 높이**: 앵커보다 한참 아래에서는 수직 정확도가 오히려 괜찮습니다(모든 앵커가 위에서 내려다보므로 거리가 높이에 민감합니다). 하지만 비행 고도가 앵커 높이에 다가가면 VDOP 가 급히 커지고, 바로 그 높이에서는 풀 수 없습니다.', en: '**TWR · same height**: far below the anchors the vertical accuracy is actually fine (every anchor looks down, so the ranges are sensitive to height). But as the flight height approaches the anchor height VDOP shoots up, and exactly at that height the problem is unsolvable.' },
            { ko: '**높이를 섞은 배치**는 두 모드 모두 어느 고도에서나 VDOP 가 고르게 유지됩니다.', en: 'With **mixed heights** VDOP stays even at every flight height in both modes.' },
          ]} />
          <P ko="왜 그런지는 기하행렬 $H$ 의 **z 열**(각 행의 세 번째 성분)에 그대로 보입니다. 아래 표는 강당 중앙에서 계산한 값입니다. z 열의 제곱합 $\sum h_z^2$ 이 ‘측정들이 높이에 대해 가진 정보의 양’이고, 이것이 작을수록 VDOP 가 큽니다."
            en="The reason is visible in the **z column** of the geometry matrix $H$ (the third component of each row). The table is evaluated at the hall centre. The sum of squares $\sum h_z^2$ of that column is ‘how much the measurements know about height’; the smaller it is, the larger VDOP." />
          <div class="table-wrap">
            <table class="tbl" data-testid="ch2-zcol-table">
              <thead><tr><th>{tr({ ko: '모드 · 배치', en: 'Mode · layout' })}</th><th>{tr({ ko: 'H 의 z 열 (행마다 하나)', en: 'z column of H (one per row)' })}</th><th class="r">Σ h_z²</th><th class="r">VDOP</th></tr></thead>
              <tbody>
                {cases.map((q) => {
                  const col = zCol(q.m, q.a);
                  return (
                    <tr key={q.key}>
                      <td>{tr(q.label)}</td>
                      <td class="num" style={{ fontSize: '0.84rem' }}>{col.map((v) => fix(v, 2)).join(', ')}<SrcBadge src={DOP_SRC} /></td>
                      <td class="r">{fmt(col.reduce((sum, v) => sum + v * v, 0), 3)}<SrcBadge src={DOP_SRC} /></td>
                      <td class="r">{fmt(dopFor(q.m, q.a, c).vdop, 3)}<SrcBadge src={DOP_SRC} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <P ko="TWR 의 행은 단위벡터 $e_i$ 그 자체라서, 앵커가 모두 위에 있으면 z 성분이 **모두 같은 부호로 크게** 남습니다. TDoA 의 행은 두 단위벡터의 **차** $e_j - e_i$ 입니다. 앵커가 모두 같은 높이면 두 벡터의 z 성분이 비슷해서 빼는 순간 거의 사라집니다. 높이를 섞으면 한쪽은 위를, 다른 쪽은 아래를 향하므로 빼도 크게 남습니다."
            en="A TWR row is the unit vector $e_i$ itself, so with all anchors overhead the z components stay **large and of one sign**. A TDoA row is the **difference** $e_j - e_i$ of two unit vectors. With all anchors at one height their z components are similar and almost vanish in the subtraction. With mixed heights one vector points up and the other down, so the difference stays large." />
          <h3>{tr({ ko: '덤: 거울상', en: 'Bonus: the mirror image' })}</h3>
          <P ko="같은 높이 배치에는 문제가 하나 더 있습니다. 앵커 평면의 위와 아래에 있는 두 점은 모든 앵커까지의 거리가 똑같습니다. 잡음 없는 거리를 주고 가우스-뉴턴의 **처음 추정 높이**만 바꿔 보세요."
            en="The same-height layout has one more problem. Two points mirrored above and below the anchor plane have identical distances to every anchor. Give noise-free ranges and change only the **height of the initial guess** for Gauss–Newton." />
          <Slider label={{ ko: '처음 추정의 높이 $z_0$', en: 'Height of the initial guess $z_0$' }} value={z0} min={0.3} max={hall.z + 4} step={0.1} unit="m" onChange={setZ0} src={ex(undefined, LOCAL)} testId="ch2-mirror-z0" />
          <StatRow>
            <Stat label={{ ko: '태그의 참 높이', en: 'True tag height' }} value={zf} unit="m" src={ex('formation.height', LOCAL)} />
            <Stat label={{ ko: '같은 높이 배치가 찾은 높이', en: 'Height found with the same-height layout' }} value={solSame[2]} unit="m" status={flipped ? 'bad' : 'good'}
              src={der('ch2#gn', { ko: '잡음 없는 거리 8개를 주고 가우스-뉴턴으로 푼 결과', en: 'Gauss–Newton on eight noise-free ranges' })} />
            <Stat label={{ ko: '높이 섞은 배치가 찾은 높이', en: 'Height found with mixed heights' }} value={solMixed[2]} unit="m" status={Math.abs(solMixed[2] - zf) > 0.05 ? 'bad' : 'good'}
              src={der('ch2#gn', { ko: '잡음 없는 거리 8개를 주고 가우스-뉴턴으로 푼 결과', en: 'Gauss–Newton on eight noise-free ranges' })} />
          </StatRow>
          <p>{flipped
            ? <Status kind="bad">{tr({ ko: `거울상으로 갔습니다: 앵커 평면(${fmt(zA)} m)을 기준으로 참 높이를 뒤집은 ${fmt(2 * zA - zf)} m. 거리 잔차는 0 인데 위치는 틀렸습니다.`, en: `It went to the mirror image: the true height flipped about the anchor plane (${fmt(zA)} m), i.e. ${fmt(2 * zA - zf)} m. The range residuals are zero, yet the position is wrong.` })}</Status>
            : <Status kind="good">{tr({ ko: '처음 추정이 앵커 평면 아래라서 참 높이로 모였습니다', en: 'The initial guess was below the anchor plane, so it converged to the true height' })}</Status>}<SrcBadge src={der('ch2#trilateration', { ko: '앵커가 한 평면에 있으면 그 평면에 대한 거울상이 같은 거리를 만든다', en: 'With coplanar anchors the mirror image about their plane yields the same ranges' })} /></p>
          <P ko="실내에서는 드론이 천장 위로 갈 수 없으니 처음 추정을 앵커 아래로 잡으면 된다고 생각할 수 있습니다. 하지만 앵커 높이 근처를 날 때는 작은 잡음에도 추정이 평면 반대쪽으로 넘어갈 수 있습니다. 앵커 높이를 섞으면 이 걱정 자체가 없어집니다."
            en="Indoors a drone cannot be above the ceiling, so you might think an initial guess below the anchors settles it. But when flying near the anchor height, a little noise can push the estimate across the plane. Mixing the anchor heights removes the worry altogether." />
        </>
      )}
    </Pitfall>
  );
}

/* ───────────────────────── 함정 2: 앵커가 둘러싼 공간 밖으로 ───────────────────────── */
function OutsidePitfall() {
  const cfg = config.value;
  const hall = cfg.hall;
  const z = Math.min(cfg.formation.height, hall.z);
  const [frac, setFrac] = useState(0.5);
  const [t, setT] = useState(0); // 탐침 위치: 0 = 강당 중앙, 1 = 오른쪽 벽
  const [mode, setMode] = useState<Mode>('tdoa');
  const w = hall.x * frac, h = hall.y * frac;
  const hk = `${hall.x}|${hall.y}|${hall.z}|${frac}`;
  const inner = useMemo(() => defaultAnchors({ x: w, y: h, z: hall.z }, 8).map((a) => [a[0] + (hall.x - w) / 2, a[1] + (hall.y - h) / 2, a[2]]), [hk]);
  const px = hall.x / 2 + (hall.x / 2) * t;
  const p: Vec = [px, hall.y / 2, z];
  const edge = (hall.x + w) / 2;
  const inside = insideAnchorBox(inner, p);
  const dT = dopFor('twr', inner, p), dD = dopFor('tdoa', inner, p);
  const c: Vec = [hall.x / 2, hall.y / 2, z];
  const cT = dopFor('twr', inner, c), cD = dopFor('tdoa', inner, c);
  const dfrac = useDebounced(hk, 120);
  const grid = useMemo(() => dopGrid(mode, inner, hall, z, 40, 30, 'hdop'), [mode, dfrac, z]);
  const sweep = useMemo(() => {
    const xs = Array.from({ length: 61 }, (_, i) => hall.x / 2 + (hall.x / 2) * (i / 60));
    return { xs, twr: xs.map((x) => dopFor('twr', inner, [x, hall.y / 2, z]).hdop), tdoa: xs.map((x) => dopFor('tdoa', inner, [x, hall.y / 2, z]).hdop) };
  }, [inner, z]);
  return (
    <Pitfall title={{ ko: 'TDoA 에서 앵커가 둘러싼 공간 밖으로 나가기', en: 'Leaving the volume enclosed by the anchors in TDoA' }} testId="ch2-pitfall-outside">
      <P ko="앵커를 강당 모서리가 아니라 무대 주변처럼 **안쪽에만** 달고, 드론은 강당 전체를 쓰고 싶다고 합시다. 앵커 상자(점선)의 크기를 정하고, 탐침을 중앙에서 오른쪽 벽으로 옮겨 보세요. 이 실험도 사본으로 합니다."
        en="Suppose the anchors are mounted only **around the middle** (say around a stage) rather than in the hall corners, yet the drones should use the whole hall. Choose the size of the anchor box (dashed) and move the probe from the centre to the right wall. This experiment also uses a copy." />
      <div class="controls">
        <Slider label={{ ko: '앵커 상자의 크기 (강당 대비)', en: 'Size of the anchor box (relative to the hall)' }} value={frac} min={0.3} max={1} step={0.05} scale={100} unit="%" onChange={setFrac} src={ex(undefined, LOCAL)} testId="ch2-out-frac" />
        <Slider label={{ ko: '탐침의 $x$ 위치', en: 'Probe position $x$' }} value={px} min={hall.x / 2} max={hall.x} step={hall.x / 80} unit="m" onChange={(v) => setT((v - hall.x / 2) / (hall.x / 2))} src={ex(undefined, LOCAL)} testId="ch2-out-x" />
      </div>
      <Segmented label={{ ko: '지도의 모드 (이 실험에서만)', en: 'Mode of the map (this experiment only)' }} value={mode} onChange={setMode} options={MODES} testId="ch2-out-mode" />
      <div class="grid-2">
        <PlanView hall={hall} anchors={inner} probe={[px, hall.y / 2]} maxHeight={300} src={DOP_SRC} testId="ch2-out-plan"
          heat={{ values: grid.values, min: HEAT_MIN, max: HEAT_MAX, label: { ko: `HDOP · ${mode === 'twr' ? 'TWR' : 'TDoA'}`, en: `HDOP · ${mode === 'twr' ? 'TWR' : 'TDoA'}` } }}>
          {(s) => <rect x={s.sx((hall.x - w) / 2)} y={s.sy((hall.y + h) / 2)} width={w * s.k} height={h * s.k} fill="none" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="6 4" pointer-events="none" />}
        </PlanView>
        <LineChart
          title={{ ko: '탐침을 중앙에서 벽으로 옮길 때의 HDOP', en: 'HDOP as the probe moves from the centre to the wall' }}
          xLabel={{ ko: '탐침의 x [m]', en: 'Probe x [m]' }} yLabel="HDOP" height={270}
          series={[
            { name: { ko: 'TWR', en: 'TWR' }, x: sweep.xs, y: sweep.twr, slot: 1 },
            { name: { ko: 'TDoA', en: 'TDoA' }, x: sweep.xs, y: sweep.tdoa, slot: 2 },
          ]}
          refLines={[{ x: edge, label: { ko: '앵커 상자의 끝', en: 'Edge of the anchor box' }, slot: 8 }, { x: px, label: { ko: '탐침', en: 'Probe' } }]}
          src={DOP_SRC} testId="ch2-out-chart" />
      </div>
      <p>{inside
        ? <Status kind="good">{tr({ ko: '탐침이 앵커 상자 안에 있습니다', en: 'The probe is inside the anchor box' })}</Status>
        : <Status kind="warn">{tr({ ko: '탐침이 앵커 상자 밖에 있습니다', en: 'The probe is outside the anchor box' })}</Status>}</p>
      <StatRow>
        <Stat label={{ ko: 'TWR 의 HDOP', en: 'HDOP with TWR' }} value={dT.hdop} src={DOP_SRC} />
        <Stat label={{ ko: 'TWR: 중앙 대비', en: 'TWR: relative to the centre' }} value={dT.hdop / cT.hdop} unit="×" src={DOP_SRC} />
        <Stat label={{ ko: 'TDoA 의 HDOP', en: 'HDOP with TDoA' }} value={dD.hdop} src={DOP_SRC} status={dD.hdop > 2 * cD.hdop ? 'bad' : dD.hdop > 1.3 * cD.hdop ? 'warn' : 'good'} />
        <Stat label={{ ko: 'TDoA: 중앙 대비', en: 'TDoA: relative to the centre' }} value={dD.hdop / cD.hdop} unit="×" src={DOP_SRC} />
        <Stat label={{ ko: 'TDoA 예상 수평 오차', en: 'Predicted TDoA horizontal error' }} value={dD.hdop * cfg.uwb.sigmaTdoa * 100} unit="cm" src={POS_SRC} />
      </StatRow>
      <P ko="상자 안에서는 TDoA 의 HDOP 가 TWR 보다 작기도 합니다(이 교재의 규약에서 TDoA 행 $e_j - e_i$ 는 길이가 1 보다 길 수 있기 때문입니다 — 두 모드의 DOP 는 각자의 $\sigma$ 에 곱해 쓰는 배수이므로 서로 직접 견줄 때는 $\sigma$ 까지 곱해서 보세요). 중요한 것은 **변하는 모양**입니다. 상자 끝을 지나면 TDoA 곡선은 가파르게 올라가고, TWR 곡선은 완만합니다."
        en="Inside the box the TDoA HDOP can even be smaller than that of TWR (in this textbook's convention a TDoA row $e_j - e_i$ may be longer than 1 — each mode's DOP multiplies its own $\sigma$, so compare the two only after multiplying by $\sigma$). What matters is the **shape**. Past the edge of the box the TDoA curve climbs steeply while the TWR curve stays gentle." />
      <P ko="까닭은 다시 $e_j - e_i$ 입니다. 상자 밖 멀리서 보면 모든 앵커가 **거의 같은 방향**에 있습니다. 단위벡터들이 서로 비슷해지니 그 차는 0 에 가까워지고, 특히 ‘앵커 쪽으로 다가가거나 멀어지는’ 방향의 움직임을 거의 느끼지 못합니다. TWR 은 단위벡터 자체를 쓰므로 그 방향을 오히려 가장 잘 잽니다. Bitcraze 문서도 같은 내용을 적고 있습니다: TDoA 는 앵커들의 **볼록 껍질**(convex hull, 앵커들을 모두 감싸는 가장 작은 볼록한 공간) 안에서 정확하고 밖에서는 빠르게 나빠지며{{lit:lps-docs/tdoa2-convex-hull}}, TWR 은 앵커가 둘러싼 공간 밖에서도 동작합니다{{lit:lps-docs/twr-description}}."
        en="The reason is again $e_j - e_i$. From far outside the box all anchors lie in **almost the same direction**. The unit vectors become alike, their differences approach zero, and motion ‘towards or away from the anchors’ in particular is hardly felt. TWR uses the unit vectors themselves and measures exactly that direction best. The Bitcraze documentation says the same: TDoA is accurate inside the **convex hull** of the anchors (the smallest convex volume containing them all) and deteriorates quickly outside{{lit:lps-docs/tdoa2-convex-hull}}, whereas TWR also works outside the anchor volume{{lit:lps-docs/twr-description}}." />
    </Pitfall>
  );
}

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const { hall, anchors } = cfg;
  const mode: Mode = cfg.uwb.mode;
  const centre: Vec = [hall.x / 2, hall.y / 2, cfg.formation.height];
  const mixed = defaultAnchors(hall, 8, false), same = defaultAnchors(hall, 8, true);
  const tM = dopFor('tdoa', mixed, centre), tS = dopFor('tdoa', same, centre);
  const wM = dopFor('twr', mixed, centre), wS = dopFor('twr', same, centre);
  let minSep = Infinity;
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) minSep = Math.min(minSep, dist(anchors[i], anchors[j]));
  const zs = anchors.map((a) => a[2]);
  const spread = Math.max(...zs) - Math.min(...zs);
  const CFG_SRC = ex(undefined, { ko: '전역 설정의 앵커 좌표에서 바로 읽은 값', en: 'Read directly from the anchor coordinates in the global settings' });
  return (
    <>
      <Section id="tri" title={{ ko: '거리 몇 개면 위치가 정해질까', en: 'How many ranges pin down a position?' }}>
        <P ko="1장에서는 UWB 로 **앵커**(anchor, 좌표를 미리 재어 둔 고정 노드)와 **태그**(tag, 드론에 실린 노드) 사이의 거리 하나를 재는 법을 보았습니다. 하지만 제어기가 필요한 것은 거리가 아니라 **위치** $p = (x, y, z)$ 입니다. 이 장의 좌표계는 이렇습니다: 강당 바닥의 한 모서리가 원점, $x$ 와 $y$ 는 바닥을 따라, $z$ 는 위쪽이고, 단위는 모두 m 입니다."
          en="Chapter 1 showed how UWB measures one distance between an **anchor** (a fixed node whose coordinates were surveyed in advance) and a **tag** (the node on the drone). The controller, however, needs not a distance but a **position** $p = (x, y, z)$. The coordinate frame of this chapter: the origin is one floor corner of the hall, $x$ and $y$ run along the floor, $z$ points up, and everything is in metres." />
        <P ko="거리 여러 개로 위치를 구하는 일을 **삼변측량**(trilateration)이라고 합니다. 거리 $\rho_i$ 하나는 ‘태그가 앵커 $a_i$ 를 중심으로 한 반지름 $\rho_i$ 의 구(평면에서는 원) 위에 있다’는 뜻입니다. 원을 하나씩 더해 가며 후보가 어떻게 줄어드는지 먼저 평면에서 봅시다."
          en="Finding a position from several distances is called **trilateration**. One range $\rho_i$ says ‘the tag lies on the sphere (in a plane: the circle) of radius $\rho_i$ centred on anchor $a_i$’. Let us first watch, in a plane, how the candidates shrink as circles are added." />
        <TriDemo />
        <Derivation id="trilateration" title={{ ko: '공간에서는 왜 앵커가 4개 이상 필요한가', en: 'Why space needs at least four anchors' }}>
          <P ko="앵커 $i$ 의 좌표를 $a_i = (x_i, y_i, z_i)$ [m], 잰 거리를 $\rho_i$ [m] 라 하면, 태그의 위치 $(x, y, z)$ 는 다음 식들을 만족합니다."
            en="With anchor $i$ at $a_i = (x_i, y_i, z_i)$ [m] and measured range $\rho_i$ [m], the tag position $(x, y, z)$ satisfies" />
          <M block tex={String.raw`(x - x_i)^2 + (y - y_i)^2 + (z - z_i)^2 = \rho_i^2, \qquad i = 1, \dots, N`} />
          <P ko="미지수는 세 개인데 식이 제곱 꼴이라 바로 풀기 어렵습니다. 요령은 **1번 식을 $i$ 번 식에서 빼는 것**입니다. 양변을 전개하면 $x^2 + y^2 + z^2$ 이 두 식에 똑같이 들어 있어서 사라지고, 1차식만 남습니다."
            en="There are three unknowns, but the equations are quadratic and awkward to solve directly. The trick is to **subtract equation 1 from equation $i$**. After expanding, $x^2 + y^2 + z^2$ appears identically in both and cancels, leaving a linear equation." />
          <M block tex={String.raw`2(x_1 - x_i)\,x + 2(y_1 - y_i)\,y + 2(z_1 - z_i)\,z \;=\; \rho_i^2 - \rho_1^2 - \big(\norm{a_i}^2 - \norm{a_1}^2\big), \qquad i = 2, \dots, N`} />
          <P ko="여기서 $\norm{a_i}^2 = x_i^2 + y_i^2 + z_i^2$ 입니다. 이 식에서 세 가지를 읽을 수 있습니다."
            en="Here $\norm{a_i}^2 = x_i^2 + y_i^2 + z_i^2$. Three things can be read off." />
          <List items={[
            { ko: '1차식이 $N - 1$ 개, 미지수가 3개입니다. 풀리려면 $N - 1 \\ge 3$, 즉 **앵커가 4개 이상**{{der:ch2#trilateration|미지수 3개를 정하려면 독립인 1차식 3개가 필요|Three unknowns need three independent linear equations}} 있어야 합니다. 평면에서는 미지수가 2개라 3개면 됩니다(위 데모).', en: 'There are $N - 1$ linear equations and three unknowns. Solvability needs $N - 1 \\ge 3$, i.e. **at least four anchors**{{der:ch2#trilateration|미지수 3개를 정하려면 독립인 1차식 3개가 필요|Three unknowns need three independent linear equations}}. In a plane there are two unknowns, so three suffice (the demo above).' },
            { ko: '기하로 보면: 구 두 개가 만나면 원, 세 개가 만나면 보통 점 두 개가 남습니다. 두 점은 세 앵커가 놓인 평면에 대해 서로 **거울상**입니다. 네 번째 앵커가 그 평면 **밖**에 있어야 둘을 가릴 수 있습니다.', en: 'Geometrically: two spheres meet in a circle, three usually leave two points. These two are **mirror images** about the plane through the three anchors. A fourth anchor **off** that plane is needed to tell them apart.' },
            { ko: '앵커가 모두 같은 높이면 $z_1 - z_i = 0$ 이라, 위 1차식에서 $z$ 가 통째로 사라집니다. $x$, $y$ 는 구할 수 있지만 $z$ 는 원래의 제곱식에 $(z - z_a)^2$ 꼴로만 남아 **부호를 알 수 없습니다**. 앵커 평면의 위인지 아래인지 구별하지 못한다는 뜻이고, 함정 실험실에서 직접 확인합니다.', en: 'If all anchors share one height, $z_1 - z_i = 0$ and $z$ drops out of the linear equations entirely. $x$ and $y$ can be found, but $z$ survives only as $(z - z_a)^2$ in the original quadratic, so **its sign is unknown** — above or below the anchor plane cannot be told apart. The pitfall lab demonstrates it.' },
          ]} />
          <P ko="실제 추정기는 이 1차식을 그대로 쓰지 않습니다. 잡음 $n$ 이 섞인 거리 $\rho + n$ 을 제곱하면 잡음이 $2\rho n$ 으로 바뀌어, 먼 앵커의 식일수록 더 시끄러워지기 때문입니다. 그래서 다음다음 절에서는 거리를 제곱하지 않고 그대로 맞추는 방법을 씁니다. 위 풀이는 ‘몇 개가 필요한가’를 세는 도구이자, 반복 계산의 처음 추정을 얻는 방법으로 기억해 두면 됩니다."
            en="Real estimators do not use this linear form as is. Squaring a noisy range $\rho + n$ turns the noise into $2\rho n$, so equations from far anchors become noisier. Two sections below we therefore fit the ranges themselves, unsquared. Keep the linear solution as a tool for counting ‘how many are needed’ and as a way to get an initial guess for the iteration." />
        </Derivation>
        <P ko="Bitcraze 의 문서도 TWR 로 3D 위치를 구하는 이론적 최소 앵커 수는 4개, 현실적으로는 6개{{lit:lps-docs/twr-min-anchors}}라고 적고 있습니다. 최소보다 많은 앵커는 낭비가 아닙니다. 잡음을 서로 평균 내고, 한두 개가 가려져도 버티게 해 주는 여유입니다."
          en="The Bitcraze documentation likewise gives a theoretical minimum of 4 anchors for 3D positioning with TWR and 6 as the realistic number{{lit:lps-docs/twr-min-anchors}}. Anchors beyond the minimum are not wasted: they average out noise and keep the system alive when one or two are blocked." />
      </Section>

      <Section id="tdoa" title={{ ko: 'TDoA: 거리 대신 거리의 차', en: 'TDoA: range differences instead of ranges' }}>
        <P ko="우리 프로젝트의 기본 모드는 **TDoA**(도달 시간차, time difference of arrival)입니다. TDoA 에서 태그는 송신하지 않고 앵커들이 내보내는 패킷을 **듣기만** 합니다{{lit:lps-docs/tdoa-passive-unlimited-tags}}. 태그는 패킷이 언제 출발했는지를 자기 시계로는 알 수 없어서 거리 자체를 구하지 못합니다. 대신 두 앵커의 패킷이 **얼마나 차이 나게 도착했는지**는 알 수 있습니다. (이 방식이 5대를 띄울 때 왜 유리한지는 3장에서 다룹니다.)"
          en="The default mode of our project is **TDoA** (time difference of arrival). In TDoA the tag does not transmit; it only **listens** to packets sent by the anchors{{lit:lps-docs/tdoa-passive-unlimited-tags}}. With its own clock the tag cannot know when a packet left, so it cannot obtain a distance. What it can know is **how far apart in time** the packets of two anchors arrived. (Why this helps with five drones is the subject of chapter 3.)" />
        <Derivation id="tdoa-hyperbola" title={{ ko: '거리 차 하나는 쌍곡선 하나', en: 'One range difference is one hyperbola' }}>
          <P ko="개념적으로, 앵커들은 서로 시계를 맞춰 두고 정해진 차례에 송신합니다. 송신 시각의 차이는 알려져 있으므로 그것을 빼고 나면, 태그가 얻는 것은 ‘앵커 $j$ 의 신호가 앵커 $i$ 의 신호보다 얼마나 더 오래 날아왔는가’ $\Delta t_{ij}$ [s] 입니다. 여기에 빛의 속도 $c$ 를 곱하면 거리의 차가 됩니다."
            en="Conceptually, the anchors keep their clocks aligned and transmit in a fixed order. The transmit-time offsets are known, and once they are removed the tag is left with ‘how much longer the signal of anchor $j$ travelled than that of anchor $i$’, $\Delta t_{ij}$ [s]. Multiplied by the speed of light $c$ this is a difference of distances." />
          <M block tex={String.raw`m_{ij} \;=\; c\,\Delta t_{ij} \;=\; \norm{p - a_j} - \norm{p - a_i} \qquad [\mathrm{m}]`} />
          <P ko="부호 규약: $m_{ij} > 0$ 이면 앵커 $j$ 가 더 멀다, 즉 태그가 앵커 $i$ 에 더 가깝다는 뜻입니다. 두 점까지의 거리의 **차**가 일정한 점들을 모으면 **쌍곡선**(hyperbola)이 됩니다(공간에서는 이것을 두 앵커를 잇는 축 둘레로 돌린 **쌍곡면**(hyperboloid)). 두 앵커가 초점입니다."
            en="Sign convention: $m_{ij} > 0$ means anchor $j$ is farther, i.e. the tag is closer to anchor $i$. The points whose distances to two fixed points have a constant **difference** form a **hyperbola** (in space a **hyperboloid**, the hyperbola revolved about the axis through the two anchors). The two anchors are its foci." />
          <List items={[
            { ko: '$m_{ij} = 0$ 이면 두 앵커에서 같은 거리에 있는 점들, 곧 두 앵커 사이의 수직이등분선(공간에서는 평면)입니다.', en: 'For $m_{ij} = 0$ it is the set of points equidistant from both anchors: the perpendicular bisector (a plane in space).' },
            { ko: '$|m_{ij}|$ 가 커질수록 곡선은 가까운 쪽 앵커를 감싸며 휩니다. 삼각부등식 때문에 $|m_{ij}|$ 는 두 앵커 사이의 거리 $\\norm{a_j - a_i}$ 를 넘을 수 없습니다.', en: 'As $|m_{ij}|$ grows the curve bends around the nearer anchor. By the triangle inequality $|m_{ij}|$ cannot exceed the anchor separation $\\norm{a_j - a_i}$.' },
            { ko: 'TWR 이 ‘원들의 교점’이라면 TDoA 는 ‘쌍곡선들의 교점’입니다. 앵커 $N$ 개에서 서로 독립인 거리 차는 $N - 1$ 개뿐입니다(나머지는 이들을 더하고 빼서 만들 수 있습니다). 미지수 3개를 정하려면 $N - 1 \\ge 3$, 여기서도 앵커가 4개 이상{{der:ch2#tdoa-hyperbola|독립인 거리 차 N − 1 개로 미지수 3개를 정해야 한다|N − 1 independent range differences must fix three unknowns}} 필요합니다.', en: 'If TWR is ‘the intersection of circles’, TDoA is ‘the intersection of hyperbolas’. $N$ anchors give only $N - 1$ independent range differences (all others are sums and differences of these). Fixing three unknowns needs $N - 1 \\ge 3$: again at least four anchors{{der:ch2#tdoa-hyperbola|독립인 거리 차 N − 1 개로 미지수 3개를 정해야 한다|N − 1 independent range differences must fix three unknowns}}.' },
          ]} />
          <P ko="같은 내용을 이렇게 볼 수도 있습니다. 태그는 각 앵커까지의 거리에 **모든 앵커에 공통인 모르는 값** $b$ (태그 시계가 어긋난 시간 × 빛의 속도)가 더해진 $\norm{p - a_i} + b$ 를 잽니다. 두 개를 빼면 $b$ 가 사라지고 거리 차만 남습니다. 뒤집어 말하면 **모든 거리에 똑같이 더해지는 변화는 TDoA 가 보지 못합니다.** 이 성질이 뒤에서 수직 정확도를 결정합니다."
            en="The same thing can be seen differently. The tag measures each anchor distance plus **an unknown common to all anchors**, $b$ (the tag clock offset × the speed of light): $\norm{p - a_i} + b$. Subtracting two of them removes $b$ and leaves the range difference. Put the other way round: **a change added equally to all distances is invisible to TDoA.** This property will decide the vertical accuracy below." />
        </Derivation>
      </Section>

      <Section id="gn" title={{ ko: '잡음이 있으면: 최소제곱과 가우스-뉴턴', en: 'With noise: least squares and Gauss–Newton' }}>
        <P ko="실제 측정에는 잡음이 섞여서 원(또는 쌍곡선)들이 한 점에서 만나지 않습니다. 앵커가 최소 개수보다 많으면 식이 미지수보다 많으므로 ‘모든 식을 정확히 만족하는 점’은 아예 없습니다. 그래서 질문을 바꿉니다. **모든 측정과의 어긋남을 통틀어 가장 작게 만드는 점은 어디인가?** 어긋남의 제곱을 더해 최소화하는 이 방법이 **최소제곱**(least squares)입니다."
          en="Real measurements are noisy, so the circles (or hyperbolas) do not meet in one point. With more anchors than the minimum there are more equations than unknowns and no point satisfies them all. So we change the question: **which point makes the total mismatch with all measurements smallest?** Minimising the sum of squared mismatches is the method of **least squares**." />
        <Derivation id="gn" title={{ ko: '가우스-뉴턴 갱신식', en: 'The Gauss–Newton update' }}>
          <P ko="측정 모델은 $\rho_i = \norm{p - a_i} + n_i$ 입니다($n_i$ 는 잡음 [m]). 어떤 추정 위치 $x$ 에 대해, **잔차**(residual)를 ‘그 위치라면 나왔어야 할 거리 − 실제로 잰 거리’로 정의합니다. 최소화할 **비용**은 잔차 제곱합의 절반입니다."
            en="The measurement model is $\rho_i = \norm{p - a_i} + n_i$ ($n_i$ is noise [m]). For a candidate position $x$ define the **residual** as ‘the range that position would give − the range actually measured’. The **cost** to minimise is half the sum of squared residuals." />
          <M block tex={String.raw`r_i(x) = \norm{x - a_i} - \rho_i, \qquad F(x) = \tfrac12 \sum_{i=1}^{N} r_i(x)^2`} />
          <P ko="$r_i$ 는 $x$ 의 1차식이 아니라서 한 번에 풀 수 없습니다. 그래서 지금 추정 $x_k$ 근처에서만 1차식으로 근사하고, 그 근사 문제를 풀어 조금 움직이고, 다시 근사하기를 되풀이합니다."
            en="$r_i$ is not linear in $x$, so there is no one-shot solution. Instead we approximate it linearly near the current estimate $x_k$, solve that approximate problem, move a little, and repeat." />
          <M block tex={String.raw`r(x_k + \Delta x) \;\approx\; r(x_k) + J\,\Delta x, \qquad J_{ij} = \frac{\partial r_i}{\partial x_j}`} />
          <P ko="$J$ 를 **야코비안**(Jacobian)이라고 합니다. 거리 $d_i = \sqrt{\sum_j (x_j - a_{ij})^2}$ 을 $x_j$ 로 미분하면 $(x_j - a_{ij})/d_i$ 이므로, $J$ 의 $i$ 번째 행은 앵커에서 태그를 향하는 **단위벡터**입니다."
            en="$J$ is the **Jacobian**. Differentiating the distance $d_i = \sqrt{\sum_j (x_j - a_{ij})^2}$ with respect to $x_j$ gives $(x_j - a_{ij})/d_i$, so row $i$ of $J$ is the **unit vector** from the anchor towards the tag." />
          <M block tex={String.raw`J = \begin{bmatrix} e_1\T \\ \vdots \\ e_N\T \end{bmatrix}, \qquad e_i = \frac{x - a_i}{\norm{x - a_i}}`} />
          <P ko="$e_i$ 는 길이가 1 이고 단위가 없습니다. 뜻은 이렇습니다: 태그가 $e_i$ 방향으로 1 m 움직이면 거리 $i$ 가 1 m 늘고, $e_i$ 에 수직으로 움직이면 (1차 근사로는) 변하지 않습니다. 이제 근사한 비용 $\tfrac12\norm{r + J\Delta x}^2$ 을 $\Delta x$ 로 미분해 0 으로 놓습니다."
            en="$e_i$ has length 1 and no unit. Its meaning: moving the tag 1 m along $e_i$ lengthens range $i$ by 1 m; moving perpendicular to $e_i$ leaves it unchanged (to first order). Now differentiate the approximate cost $\tfrac12\norm{r + J\Delta x}^2$ with respect to $\Delta x$ and set it to zero." />
          <M block tex={String.raw`J\T\big(r + J\,\Delta x\big) = 0 \;\;\Longrightarrow\;\; (J\T J)\,\Delta x = -J\T r \;\;\Longrightarrow\;\; \Delta x = -(J\T J)^{-1} J\T r`} />
          <P ko="가운데 식을 **정규방정식**(normal equations)이라고 합니다. $x_{k+1} = x_k + \Delta x$ 로 옮긴 뒤, 새 위치에서 $r$ 과 $J$ 를 **다시** 계산해 같은 일을 되풀이합니다. $\Delta x$ 가 충분히 작아지면 멈춥니다. 이것이 **가우스-뉴턴**(Gauss–Newton)법입니다."
            en="The middle equation is the **normal equations**. Move to $x_{k+1} = x_k + \Delta x$, **recompute** $r$ and $J$ at the new position and repeat. Stop once $\Delta x$ is small enough. This is the **Gauss–Newton** method." />
          <List items={[
            { ko: 'TDoA 도 똑같습니다. 잔차가 $r_k = (\\norm{x - a_j} - \\norm{x - a_i}) - m_{ij}$ 로 바뀌고, 야코비안의 행이 두 단위벡터의 차 $e_j - e_i$ 가 될 뿐입니다.', en: 'TDoA works identically. The residual becomes $r_k = (\\norm{x - a_j} - \\norm{x - a_i}) - m_{ij}$ and the Jacobian row becomes the difference of two unit vectors, $e_j - e_i$.' },
            { ko: '처음 추정 $x_0$ 이 필요합니다. 너무 엉뚱한 곳에서 시작하면 여러 번 헤매거나 엉뚱한 점(예: 거울상)으로 갈 수 있습니다. 비행 중에는 바로 앞 순간의 위치가 좋은 처음 추정입니다.', en: 'An initial guess $x_0$ is needed. Starting somewhere absurd can cost many iterations or lead to a wrong point (such as a mirror image). In flight the previous position is a good initial guess.' },
            { ko: '$J\\T J$ 의 역행렬이 있어야 합니다. 이것이 없거나 간신히 있는 경우가 바로 ‘앵커 배치가 나쁜’ 경우이고, 다음 절의 주제입니다.', en: '$J\\T J$ must be invertible. When it is not, or only barely, the anchor layout is ‘bad’ — the subject of the next section.' },
          ]} />
        </Derivation>
        <GnDemo />
        <P ko="이 데모는 교재의 엔진을 씁니다. 엔진은 위 갱신식에 안전장치를 하나 더했습니다: 한 걸음 옮긴 뒤 비용이 오히려 늘면 걸음을 절반씩 줄입니다. 아래 과제에서는 그 안전장치 없이 갱신식 그대로를 구현합니다."
          en="This demo runs on the textbook engine, which adds one safeguard to the update above: if a step would increase the cost, the step is halved until it does not. In the task below you implement the plain update without that safeguard." />
        <CodeTask task={gaussNewtonTask} />
      </Section>

      <Section id="dop" title={{ ko: '같은 거리 오차, 다른 위치 오차: DOP', en: 'Same range error, different position error: DOP' }}>
        <P ko="거리를 10 cm{{ex}} 틀리게 재면 위치도 10 cm 틀릴까요? 그렇지 않습니다. 앵커들이 태그를 **어느 방향들에서** 보고 있느냐에 따라, 같은 거리 오차가 비슷한 크기의 위치 오차가 되기도 하고 몇 배로 부풀기도 합니다. 이 부풀림 배수가 **DOP**(정밀도 저하율, dilution of precision)입니다."
          en="If a range is off by 10 cm{{ex}}, is the position off by 10 cm? No. Depending on **from which directions** the anchors see the tag, the same range error becomes a position error of similar size or one several times larger. That inflation factor is the **DOP** (dilution of precision)." />
        <Predict id="ch2-same-height"
          question={{ ko: `앵커 8개를 모두 같은 높이(천장 근처)에 달았습니다. 드론은 높이 ${fmt(cfg.formation.height)} m 로 납니다. TDoA 모드에서, 높이를 섞어 단 배치와 비교해 무엇이 가장 크게 나빠질까요?`, en: `All eight anchors are mounted at one height (near the ceiling). The drone flies at ${fmt(cfg.formation.height)} m. In TDoA mode, compared with a layout of mixed heights, what gets worse the most?` }}
          choices={[
            { label: { ko: '수평 위치 (x, y) — 앵커가 모두 멀어지니까', en: 'Horizontal position (x, y) — all anchors are farther away' } },
            { label: { ko: '수직 위치 (z) — 높이를 알려 줄 방향이 없어지니까', en: 'Vertical position (z) — no direction is left that tells the height' }, correct: true },
            { label: { ko: '수평과 수직이 비슷하게 조금씩', en: 'Horizontal and vertical, both slightly' } },
            { label: { ko: '거의 변하지 않는다 — 앵커가 8개나 있으니까', en: 'Hardly anything — there are eight anchors after all' } },
          ]}
          explain={{
            ko: `**수직(z)** 입니다. 지금 강당 크기로 계산하면, 강당 중앙에서 TDoA 의 수직 배수 VDOP 는 높이를 섞은 배치에서 ${fmt(tM.vdop, 3)}{{der:ch2#gdop}} 이던 것이 같은 높이 배치에서 ${fmt(tS.vdop, 3)}{{der:ch2#gdop}} 로 커집니다. 수평 배수 HDOP 는 ${fmt(tM.hdop, 3)}{{der:ch2#gdop}} → ${fmt(tS.hdop, 3)}{{der:ch2#gdop}} 로 거의 그대로입니다. 앵커 개수가 아니라 **방향이 얼마나 다양한가**가 중요합니다. 한 가지 더: TWR 이라면 결과가 다릅니다(${fmt(wM.vdop, 3)}{{der:ch2#gdop}} → ${fmt(wS.vdop, 3)}{{der:ch2#gdop}}). 왜 모드에 따라 다른지가 이 절의 핵심입니다.`,
            en: `**Vertical (z).** For the current hall size, the vertical factor VDOP of TDoA at the hall centre grows from ${fmt(tM.vdop, 3)}{{der:ch2#gdop}} with mixed heights to ${fmt(tS.vdop, 3)}{{der:ch2#gdop}} with one height. The horizontal factor HDOP hardly moves: ${fmt(tM.hdop, 3)}{{der:ch2#gdop}} → ${fmt(tS.hdop, 3)}{{der:ch2#gdop}}. What matters is not the number of anchors but **how diverse their directions are**. One more thing: with TWR the outcome is different (${fmt(wM.vdop, 3)}{{der:ch2#gdop}} → ${fmt(wS.vdop, 3)}{{der:ch2#gdop}}). Why it depends on the mode is the heart of this section.`,
          }} />
        <Derivation id="gdop" title={{ ko: '최소제곱 추정의 공분산에서 DOP 까지', en: 'From the covariance of the least-squares estimate to DOP' }}>
          <P ko="가우스-뉴턴이 다 모였을 때 추정 $\hat x$ 가 참 위치 $p$ 에서 얼마나 떨어져 있는지 계산합니다. 참 위치에서의 잔차는 $r_i(p) = \norm{p - a_i} - \rho_i = -n_i$, 곧 잡음 그 자체입니다. 잡음이 작아서 $p$ 근처에서 1차 근사가 맞는다고 하면, 가우스-뉴턴의 한 걸음이 곧 오차입니다."
            en="We compute how far the converged Gauss–Newton estimate $\hat x$ is from the true position $p$. At the true position the residual is $r_i(p) = \norm{p - a_i} - \rho_i = -n_i$: the noise itself. If the noise is small enough for the linear approximation to hold near $p$, one Gauss–Newton step is exactly the error." />
          <M block tex={String.raw`\hat x - p \;\approx\; -(H\T H)^{-1} H\T\, r(p) \;=\; (H\T H)^{-1} H\T\, n`} />
          <P ko="$H$ 는 참 위치에서 계산한 야코비안이고 **기하행렬**(geometry matrix)이라고 부릅니다. 앵커와 태그의 위치만으로 정해집니다. 잡음들이 서로 독립이고 평균 0, 표준편차 $\sigma$ 라고 하면 $\mathrm{E}[n n\T] = \sigma^2 I$ 입니다. 오차의 **공분산**(covariance, 대각 성분이 각 축 오차의 분산인 행렬)은"
            en="$H$ is the Jacobian evaluated at the true position, called the **geometry matrix**; it depends only on the anchor and tag positions. With independent zero-mean noise of standard deviation $\sigma$, $\mathrm{E}[n n\T] = \sigma^2 I$. The **covariance** of the error (the matrix whose diagonal holds the variance of the error along each axis) is" />
          <M block tex={String.raw`\mathrm{Cov}(\hat x) = (H\T H)^{-1} H\T \big(\sigma^2 I\big) H\, (H\T H)^{-1} = \sigma^2\,(H\T H)^{-1} \;\equiv\; \sigma^2\, Q`} />
          <P ko="$\sigma$ 는 측정의 품질, $Q = (H\T H)^{-1}$ 는 기하의 품질입니다. 둘이 곱으로 깔끔하게 나뉩니다. $Q$ 의 대각 성분에서 DOP 를 정의합니다."
            en="$\sigma$ is the quality of the measurement, $Q = (H\T H)^{-1}$ the quality of the geometry; they separate neatly as a product. The DOPs are defined from the diagonal of $Q$." />
          <M block tex={String.raw`\mathrm{HDOP} = \sqrt{Q_{xx} + Q_{yy}}, \qquad \mathrm{VDOP} = \sqrt{Q_{zz}}, \qquad \mathrm{PDOP} = \sqrt{Q_{xx} + Q_{yy} + Q_{zz}}`} />
          <M block tex={String.raw`\sigma_{\text{pos}} \;\approx\; \mathrm{DOP} \times \sigma_{\text{meas}}`} />
          <P ko="예를 들어 수평 오차의 RMS(제곱평균의 제곱근)는 $\sqrt{\mathrm{E}[e_x^2 + e_y^2]} = \mathrm{HDOP}\cdot\sigma$, 수직 오차의 표준편차는 $\mathrm{VDOP}\cdot\sigma$ 입니다. DOP 는 단위가 없는 배수이고, 1 근처면 ‘위치 오차 ≈ 측정 오차’입니다. 이 교재(엔진)가 쓰는 규약은 다음과 같습니다."
            en="For example the RMS of the horizontal error is $\sqrt{\mathrm{E}[e_x^2 + e_y^2]} = \mathrm{HDOP}\cdot\sigma$ and the standard deviation of the vertical error is $\mathrm{VDOP}\cdot\sigma$. DOP is a unitless factor; near 1 means ‘position error ≈ measurement error’. The conventions used by this textbook (and its engine) are:" />
          <List items={[
            { ko: '**TWR**: $H$ 의 행은 단위벡터 $e_i$ (앵커마다 하나), $\\sigma$ 는 거리 노이즈 {{cfg:uwb.sigmaTwr}}. 시계 미지수가 없으므로 미지수는 위치 3개뿐이고, 흔히 말하는 GDOP 가 PDOP 와 같습니다.', en: '**TWR**: the rows of $H$ are the unit vectors $e_i$ (one per anchor) and $\\sigma$ is the range noise {{cfg:uwb.sigmaTwr}}. There is no clock unknown, so the unknowns are just the three position components and the usual GDOP equals PDOP.' },
            { ko: '**TDoA**: $H$ 의 행은 $e_j - e_i$ 이고, 쌍은 번호가 이웃한 앵커끼리(0–1, 1–2, …, 마지막–0) 고리 모양으로 묶습니다. 거리 차 하나하나에 독립인 노이즈 {{cfg:uwb.sigmaTdoa}} 가 섞인다고 가정합니다. (실제로는 앵커 하나를 공유하는 두 거리 차의 잡음이 서로 얽히지만, 이 교재는 단순한 모델을 씁니다.)', en: '**TDoA**: the rows of $H$ are $e_j - e_i$, with pairs formed between consecutively numbered anchors (0–1, 1–2, …, last–0) in a ring. Each range difference is assumed to carry independent noise {{cfg:uwb.sigmaTdoa}}. (In reality two differences sharing an anchor have correlated noise; this textbook uses the simple model.)' },
            { ko: '참고: GPS 교과서의 GDOP 는 행을 $[e_i\\T,\\ 1]$ 로 놓고 수신기 시계의 어긋남까지 미지수 4개로 풉니다. 그때는 GDOP 에 시간 항이 더해져 PDOP 보다 큽니다. 엔진에는 이 형태도 `dopPseudorange` 로 들어 있지만 본문에서는 쓰지 않습니다.', en: 'Remark: the GDOP of GPS textbooks uses rows $[e_i\\T,\\ 1]$ and solves four unknowns including the receiver clock offset; GDOP then contains a time term and exceeds PDOP. The engine also has this form as `dopPseudorange`, but the text does not use it.' },
          ]} />
          <P ko="**앵커가 같은 높이면 왜 z 가 나빠지나.** $Q_{zz}$ 를 정하는 것은 $H$ 의 z 열, 곧 각 행의 z 성분입니다. 이 열이 0 에 가까우면 ‘태그가 위아래로 움직여도 측정이 변하지 않는다’는 뜻이고, 그 방향은 알 수 없게 됩니다. 앵커가 모두 높이 $z_a$ 에 있고 태그의 높이가 $z$ 일 때 두 모드의 z 성분을 적어 보면"
            en="**Why the same height hurts z.** $Q_{zz}$ is governed by the z column of $H$, the z component of each row. If that column is near zero, ‘moving the tag up or down does not change the measurements’, and that direction becomes unknowable. With all anchors at height $z_a$ and the tag at height $z$, the z components in the two modes are" />
          <M block tex={String.raw`\tx{TWR 의 행}{TWR row}:\;\; h_{iz} = \frac{z - z_a}{d_i}, \qquad\qquad \tx{TDoA 의 행}{TDoA row}:\;\; h_{kz} = \frac{z - z_a}{d_j} - \frac{z - z_a}{d_i} = (z - z_a)\Big(\frac{1}{d_j} - \frac{1}{d_i}\Big)`} />
          <List items={[
            { ko: '**TWR**: 태그가 앵커 평면보다 한참 아래면 $|z - z_a|$ 가 커서 z 성분이 모두 큽니다. 수직 정확도는 괜찮습니다. 하지만 비행 고도가 앵커 높이에 가까워지면 $z - z_a \\to 0$ 이라 z 열 전체가 0 으로 가고 VDOP 가 끝없이 커집니다. 그리고 $(z - z_a)$ 의 부호를 뒤집어도 거리가 같으므로 거울상을 구별하지 못합니다.', en: '**TWR**: when the tag is far below the anchor plane, $|z - z_a|$ is large and so are all z components; vertical accuracy is fine. But as the flight height approaches the anchor height, $z - z_a \\to 0$, the whole z column goes to zero and VDOP grows without bound. And flipping the sign of $(z - z_a)$ leaves the ranges unchanged, so the mirror image cannot be told apart.' },
            { ko: '**TDoA**: 괄호 안이 두 거리의 역수의 **차**입니다. 두 앵커가 태그에서 비슷한 거리에 있으면 거의 0 이 됩니다. 태그가 어디에 있든 z 열이 작으므로, 수직 정확도는 **거의 모든 곳에서** 나쁩니다. 앞 절의 말로 하면, 태그가 위로 조금 올라가면 모든 앵커까지의 거리가 거의 똑같이 줄어드는데, 모든 거리에 공통인 변화는 TDoA 가 보지 못하기 때문입니다.', en: '**TDoA**: the bracket is a **difference** of two inverse distances. If the two anchors are at similar distances from the tag it is almost zero. The z column is small wherever the tag is, so vertical accuracy is poor **almost everywhere**. In the words of the previous section: when the tag rises a little, the distances to all anchors shrink by nearly the same amount, and a change common to all distances is invisible to TDoA.' },
            { ko: '**높이를 섞으면**: 어떤 앵커는 태그보다 위에, 어떤 앵커는 아래에 있어 z 성분의 부호가 섞입니다. 빼도 크게 남으므로 두 모드 모두 z 열이 살아납니다.', en: '**With mixed heights**: some anchors are above the tag and some below, so the z components have mixed signs. Their differences stay large and the z column is alive in both modes.' },
          ]} />
        </Derivation>
        <DopDemo />
        <Note>
          <P ko="**DOP 가 전부는 아닙니다.** DOP 는 ‘모든 측정의 잡음이 같고 편향이 없다’고 가정한 지표입니다. UWB TDoA 의 앵커 배치를 다룬 최근 연구는 GDOP 를 GPS 분야의 고전적 지표로 소개하면서{{lit:arxiv-2412-12427/gdop-mention}}, 대신 편향까지 포함한 평균제곱오차의 하한을 배치의 점수로 씁니다{{lit:arxiv-2412-12427/placement-metric}}. 그 연구의 실험에서는 같은 공간에서 앵커 배치만 바꿨을 때 평균 RMSE 가 21 cm 와 16 cm{{lit:arxiv-2412-12427/placement-effect}} 로 달라졌습니다. 숫자는 그 실험 환경의 값이지만, **배치만으로 정확도가 달라진다**는 점은 이 장의 계산과 같은 이야기입니다. 벽에 가려 생기는 편향(NLOS)은 4장에서 다룹니다."
            en="**DOP is not the whole story.** DOP assumes ‘every measurement has the same noise and no bias’. A recent study of anchor placement for UWB TDoA introduces GDOP as the classical metric of the GPS field{{lit:arxiv-2412-12427/gdop-mention}} and instead scores a layout by a lower bound on the mean squared error that includes bias{{lit:arxiv-2412-12427/placement-metric}}. In its experiments, changing only the anchor placement in the same space changed the average RMSE between 21 cm and 16 cm{{lit:arxiv-2412-12427/placement-effect}}. The numbers belong to that test environment, but the message — **placement alone changes accuracy** — is the one computed in this chapter. Bias from blocked paths (NLOS) is the subject of chapter 4." />
        </Note>
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <SameHeightPitfall />
        <OutsidePitfall />
      </Section>

      <Section id="apply" title={{ ko: '우리 강당에 적용하기', en: 'Applying it to our hall' }}>
        <P ko="이 장의 계산과 Bitcraze 의 설치 안내를 함께 놓으면 앵커를 다는 규칙이 됩니다."
          en="Putting this chapter's calculations next to the Bitcraze installation guidance gives rules for mounting the anchors." />
        <List items={[
          { ko: '**비행 공간을 앵커로 감싼다.** TDoA 2 는 비행 공간의 모서리에 앵커 8개를 둘 때 가장 잘 동작합니다{{lit:lps-docs/tdoa2-convex-hull}}. TDoA 2 의 앵커 수는 8개로 제한됩니다{{lit:lps-docs/tdoa2-max-anchors}}. 공개 TDoA 데이터셋 UTIL 도 배치마다 앵커 8개{{lit:util2022/num-anchors}}를 썼습니다.', en: '**Enclose the flight volume with anchors.** TDoA 2 works best with 8 anchors in the corners of the flight volume{{lit:lps-docs/tdoa2-convex-hull}}. TDoA 2 is limited to 8 anchors{{lit:lps-docs/tdoa2-max-anchors}}. The public TDoA dataset UTIL also used 8 anchors per constellation{{lit:util2022/num-anchors}}.' },
          { ko: '**높이를 섞는다.** 앵커는 벽과 천장에서 15 cm 이상 띄우고, 서로 2 m 이상 떨어뜨려 서로 다른 높이에 답니다{{lit:lps-docs/anchor-placement}}. ‘서로 다른 높이’가 왜 필요한지는 위 유도와 함정 실험실에서 보았습니다.', en: '**Mix the heights.** Keep anchors at least 15 cm from walls and ceiling, at least 2 m from each other, and at different heights{{lit:lps-docs/anchor-placement}}. Why ‘different heights’ matters is what the derivation and the pitfall lab showed.' },
          { ko: '**기대 수준을 안다.** LPS 의 정확도는 ‘10 cm 수준’이고 설치와 환경에 따라 달라진다고 안내되어 있습니다{{lit:lps-docs/accuracy}}. DOP 는 그 ‘설치에 따라’를 미리 계산해 보는 도구입니다.', en: '**Know what to expect.** The LPS accuracy is described as being ‘in the 10 cm range’, depending on setup and environment{{lit:lps-docs/accuracy}}. DOP is the tool for computing that ‘depending on setup’ in advance.' },
        ]} />
        <P ko="아래는 지금 전역 설정의 값입니다. 이 교재의 기본 배치는 계산을 단순하게 하려고 앵커를 강당 모서리의 좌표에 그대로 두었습니다. 실제로는 벽에서 띄워 달고, 단 뒤에 **실제로 잰 좌표**를 설정에 넣어야 합니다(좌표가 틀리면 어떻게 되는지는 6장)."
          en="Below are the values of the current global settings. The default layout of this textbook puts the anchors exactly at the hall-corner coordinates to keep the calculation simple. In reality mount them off the wall and enter the **surveyed coordinates** into the settings afterwards (what wrong coordinates do is covered in chapter 6)." />
        <StatRow>
          <Stat label={{ ko: '앵커 수', en: 'Number of anchors' }} value={String(anchors.length)} src={CFG_SRC} status={mode === 'tdoa' && anchors.length > 8 ? 'warn' : undefined} />
          <Stat label={{ ko: '가장 가까운 두 앵커 사이 거리', en: 'Closest pair of anchors' }} value={minSep} unit="m" src={CFG_SRC} status={minSep < 2 ? 'warn' : 'good'} />
          <Stat label={{ ko: '앵커 높이의 범위 (최고 − 최저)', en: 'Anchor height spread (max − min)' }} value={spread} unit="m" src={CFG_SRC} status={spread < 1e-6 ? 'bad' : undefined} />
        </StatRow>
        <div class="controls">
          <CfgSlider path="formation.height" min={0.3} max={Math.max(1, hall.z)} testId="ch2-apply-height" />
          <CfgSlider path={sigmaPath(mode)} max={50} testId="ch2-apply-sigma" />
        </div>
        <StatRow>
          <Stat label={{ ko: '강당 중앙의 HDOP', en: 'HDOP at the hall centre' }} value={b.dop.hdop} src={DOP_SRC} />
          <Stat label={{ ko: '강당 중앙의 VDOP', en: 'VDOP at the hall centre' }} value={b.dop.vdop} src={DOP_SRC} status={b.dop.vdop > 2.5 * b.dop.hdop ? 'warn' : undefined} />
          <Stat label={{ ko: '수평 위치 오차 HDOP·$\\sigma$', en: 'Horizontal position error HDOP·$\\sigma$' }} value={b.dop.hdop * b.sigmaMeas * 100} unit="cm" src={POS_SRC} />
          <Stat label={{ ko: '수직 위치 오차 VDOP·$\\sigma$', en: 'Vertical position error VDOP·$\\sigma$' }} value={b.dop.vdop * b.sigmaMeas * 100} unit="cm" src={POS_SRC} />
        </StatRow>
        <P ko={`지금 모드는 **${mode === 'twr' ? 'TWR' : 'TDoA'}**, 측정 노이즈는 {{cfg:${sigmaPath(mode)}}}, 비행 고도는 {{cfg:formation.height}} 입니다. 이 위치 오차는 **측정 한 벌로 한 번 풀었을 때**의 값입니다. 실제 드론은 관성센서와 섞어 여러 번의 측정을 이어 쓰므로 이보다 작아지고(5장), 벽에 가려 생기는 편향 때문에 이보다 커지기도 합니다(4장).`}
          en={`The current mode is **${mode === 'twr' ? 'TWR' : 'TDoA'}**, the measurement noise {{cfg:${sigmaPath(mode)}}} and the flight height {{cfg:formation.height}}. This position error is for **one solve from one set of measurements**. A real drone blends many measurements with its inertial sensor, which makes it smaller (chapter 5), and blocked paths add bias, which makes it larger (chapter 4).`} />
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 2,
  title: { ko: '거리에서 위치로', en: 'From ranges to position' },
  lead: { ko: '거리 여러 개를 위치 하나로 바꾸는 계산을 배우고, 같은 거리 오차가 앵커 배치에 따라 위치 오차로 얼마나 부풀려지는지를 DOP 로 계산합니다.', en: 'We learn the computation that turns several ranges into one position, and use DOP to compute how much the anchor layout inflates the same range error into position error.' },
  objectives: [
    { ko: '거리(TWR)와 거리 차(TDoA)가 각각 구와 쌍곡면을 뜻함을 설명하고, 3D 위치에 앵커가 4개 이상 필요한 이유를 식으로 보인다.', en: 'Explain that ranges (TWR) and range differences (TDoA) mean spheres and hyperboloids, and show with equations why 3D positioning needs at least four anchors.' },
    { ko: '가우스-뉴턴 갱신 $\\Delta x = -(J\\T J)^{-1} J\\T r$ 을 유도하고 numpy 로 구현한다.', en: 'Derive the Gauss–Newton update $\\Delta x = -(J\\T J)^{-1} J\\T r$ and implement it in numpy.' },
    { ko: '앵커 배치에서 HDOP·VDOP 를 계산해 위치 오차를 예측하고, 같은 높이 배치와 앵커 공간 밖 비행이 왜 나쁜지 기하행렬로 설명한다.', en: 'Compute HDOP and VDOP from an anchor layout to predict position error, and explain with the geometry matrix why same-height layouts and flying outside the anchor volume are bad.' },
  ],
  Body,
  budget: {
    items: ['dop'],
    note: {
      ko: '이 장이 예산에 더하는 것은 **HDOP 와 VDOP** 입니다. 예산은 강당 중앙, 비행 고도에서 지금의 모드와 앵커 배치로 DOP 를 계산하고, 측정 오차에 곱해 위치 오차를 만듭니다: $\\sigma_{\\text{pos}} = \\mathrm{DOP} \\times \\sigma$. DOP 는 단위 없는 배수라 간격에 직접 더해지지 않고, 뒤에 나오는 측위 오차 항목들의 크기를 정합니다. 4장에서 $\\sigma$ 는 NLOS 를 반영한 유효 오차로 바뀝니다.',
      en: 'This chapter adds **HDOP and VDOP** to the budget. The budget evaluates DOP at the hall centre at flight height for the current mode and anchor layout and multiplies it by the measurement error to obtain the position error: $\\sigma_{\\text{pos}} = \\mathrm{DOP} \\times \\sigma$. DOP is a unitless factor, so it is not added to the spacing directly; it scales the positioning-error items that follow. In chapter 4, $\\sigma$ is replaced by an effective error that accounts for NLOS.',
    },
  },
  summary: [
    { ko: '거리 하나는 구, 거리 차 하나는 쌍곡면이다. 3D 위치에는 앵커가 4개 이상 필요하고, 잡음이 있으면 가우스-뉴턴 $\\Delta x = -(J\\T J)^{-1} J\\T r$ 로 잔차 제곱합을 줄인다. $J$ 의 행은 단위벡터(TDoA 는 그 차)다.', en: 'One range is a sphere, one range difference a hyperboloid. 3D positioning needs at least four anchors, and with noise Gauss–Newton, $\\Delta x = -(J\\T J)^{-1} J\\T r$, reduces the sum of squared residuals. The rows of $J$ are unit vectors (their differences for TDoA).' },
    { ko: '위치 오차 ≈ DOP × 측정 오차. DOP 는 $(H\\T H)^{-1}$ 의 대각 성분에서 나오고 앵커 배치와 태그 위치만으로 정해진다.', en: 'Position error ≈ DOP × measurement error. DOP comes from the diagonal of $(H\\T H)^{-1}$ and depends only on the anchor layout and the tag position.' },
    { ko: '앵커를 모두 같은 높이에 달면 TDoA 는 거의 모든 곳에서, TWR 은 앵커 높이 근처에서 z 가 나빠진다. TDoA 는 앵커가 둘러싼 공간 밖에서 빠르게 나빠진다.', en: 'With all anchors at one height, z degrades almost everywhere for TDoA and near the anchor height for TWR. TDoA degrades quickly outside the volume enclosed by the anchors.' },
  ],
  next: { ko: '드론 한 대의 위치는 이제 구할 수 있습니다. 그런데 5대가 같은 앵커를 나눠 쓰면, 한 대가 1초에 받는 측정은 몇 번으로 줄어들까요? TWR 과 TDoA 중 어느 쪽이 버틸까요?', en: 'We can now position one drone. But when five drones share the same anchors, how many measurements per second does each one still get? Which of TWR and TDoA holds up?' },
  tasks,
};
export default def;
