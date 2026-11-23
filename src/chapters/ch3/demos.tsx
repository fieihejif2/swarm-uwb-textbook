/** 3장의 데모와 함정 실험실. 계산은 모두 src/sim 의 엔진을 쓴다(개념 모델). */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { computeBudget } from '../../sim/budget';
import { perAxisH, positionErrorMc, simulateRateError, simulateTdoaSchedule, steadyStatePosSigmaFixedDisturbance } from '../../sim/ch3_rate';
import { SystemConfig } from '../../sim/config';
import { steadyStatePosSigma } from '../../sim/kf';
import { Vec } from '../../sim/linalg';
import { dopFor, insideAnchorBox } from '../../sim/positioning';
import { swarmFromConfig } from '../../sim/scenario';
import { simulateTwrSchedule, tdoaRate, twrRate } from '../../sim/updateRate';
import { der, ex, lit } from '../../sources';
import {
  Button, Caption, CodeView, Demo, LineChart, LinkGroup, M, P, Pitfall, PlanView, Segmented, Slider, SrcBadge, Stat, StatRow, Status,
  niceTicks, seriesColor, useDebounced, useWidth,
} from '../../ui';
import { updateRateTask } from './tasks';

/** 이 장에서 TWR·TDoA 에 쓰는 계열 색 슬롯(선 모양도 다르다: TWR 실선, TDoA 점선) */
const TWR = 1, TDOA = 2;
const RATE = der('ch3#rate', { ko: '이 장의 메시지 수 모델(개념 모델)에 현재 설정값을 넣어 계산한 값', en: 'The message-count model of this chapter (a concept model) evaluated with the current settings' });
const COUNTED = der('ch3#rate', {
  ko: '선: 유도한 식. 점: 같은 일정을 메시지 단위로 실제로 돌려 끝난 바퀴(프레임) 수를 센 값. 개념 모델이며 펌웨어의 재현이 아닙니다.',
  en: 'Lines: the derived formulas. Points: the same schedule actually run message by message, counting completed rounds (frames). A concept model, not a reproduction of the firmware.',
});

/**
 * 지금 설정의 대형이 강당 안을 한 바퀴 도는 동안의 드론 위치 표본.
 * 출발 위치와 기준 속도는 엔진(scenario.ts 의 swarmFromConfig)에서 그대로 가져오고, 속도 방향이 한 바퀴 돌 때까지 적분한다.
 * 반환: samples[k][i] = k번째 표본에서 드론 i 의 위치.
 */
function circuitSamples(cfg: SystemConfig): Vec[][] {
  const sp = swarmFromConfig(cfg, { delay: false, noise: false, loss: false }, { initialScatter: 0 });
  const at = (d: Vec): Vec[] => sp.p0.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + (d[2] ?? 0)]);
  const v0 = sp.refVel(0), speed = Math.hypot(v0[0], v0[1]);
  if (!(speed > 1e-6)) return [at([0, 0, 0])];
  const dt = 0.05 / speed; // 한 스텝에 5 cm
  const disp: Vec[] = [[0, 0, 0]];
  let d: Vec = [0, 0, 0], turned = 0, heading = Math.atan2(v0[1], v0[0]);
  for (let i = 1; i < 40000 && Math.abs(turned) < 2 * Math.PI - 1e-3; i++) {
    const v = sp.refVel((i - 0.5) * dt); // 중점법
    d = [d[0] + v[0] * dt, d[1] + v[1] * dt, 0];
    disp.push(d);
    const h = Math.atan2(v[1], v[0]);
    turned += Math.atan2(Math.sin(h - heading), Math.cos(h - heading));
    heading = h;
  }
  const stride = Math.max(1, Math.floor(disp.length / 72));
  return disp.filter((_, i) => i % stride === 0).map(at);
}
/** 순회 경로의 표본 × 드론 가운데 앵커 상자 밖에 있는 것의 수 */
export function outsideCount(samples: Vec[][], anchors: Vec[]): { out: number; total: number } {
  let out = 0, total = 0;
  for (const s of samples) for (const p of s) { total++; if (!insideAnchorBox(anchors, p)) out++; }
  return { out, total };
}
export const useCircuit = (cfg: SystemConfig): Vec[][] => useMemo(() => circuitSamples(cfg), [cfg]);

/* ───────────────────────── 데모 1: 태그 수 → 드론당 갱신율 ───────────────────────── */
/**
 * 전역 설정 값 하나를 이 카드에서만 즉시 바꾸고, 끌기를 멈춘 뒤에(debounce) 전역에 반영한다.
 * 전역 값을 바꾸면 장 전체의 데모가 다시 계산되므로 끄는 동안에는 이 카드만 따라오게 한다.
 */
function useLocalGlobal(path: 'uwb.twrRangeTime' | 'uwb.tdoaSlotTime', global: number): [number, (v: number) => void] {
  const [v, setV] = useState(global);
  useEffect(() => setV(global), [global]);
  const settled = useDebounced(v, 250);
  useEffect(() => {
    const cur = path === 'uwb.twrRangeTime' ? config.value.uwb.twrRangeTime : config.value.uwb.tdoaSlotTime;
    if (Math.abs(settled - cur) > 1e-12) setPath(path, settled);
  }, [settled]);
  return [v, setV];
}

export function RateDemo() {
  const cfg = config.value;
  const [Tr, setTr] = useLocalGlobal('uwb.twrRangeTime', cfg.uwb.twrRangeTime);
  const [Ts, setTs] = useLocalGlobal('uwb.tdoaSlotTime', cfg.uwb.tdoaSlotTime);
  const [nTags, setNTags] = useState(cfg.nDrones);
  const [nAnc, setNAnc] = useState(cfg.anchors.length);
  const data = useMemo(() => {
    const ns = Array.from({ length: 20 }, (_, i) => i + 1);
    const d1 = 50 * 20 * nAnc * Tr, d2 = 200 * nAnc * Ts; // 세는 시간: 가장 느린 경우(20대)도 50바퀴 / 200프레임
    return {
      ns,
      twrTheory: ns.map((n) => twrRate({ nTags: n, nAnchors: nAnc, rangeTime: Tr }).positionRate),
      tdoaTheory: ns.map(() => tdoaRate({ nAnchors: nAnc, slotTime: Ts }).positionRate),
      twrCount: ns.map((n) => simulateTwrSchedule({ nTags: n, nAnchors: nAnc, rangeTime: Tr }, d1 + Tr / 2).perTagRounds[n - 1] / d1),
      tdoaCount: ns.map((n) => simulateTdoaSchedule({ nAnchors: nAnc, slotTime: Ts }, n, d2 + Ts / 2).perTagFrames[n - 1] / d2),
    };
  }, [nAnc, Tr, Ts]);
  const tw = twrRate({ nTags, nAnchors: nAnc, rangeTime: Tr }), td = tdoaRate({ nAnchors: nAnc, slotTime: Ts });
  return (
    <LinkGroup>
      <Demo title={{ ko: '태그 수를 늘리면 드론 한 대의 갱신율은', en: 'Per-drone update rate as tags are added' }} testId="ch3-rate-demo">
        <P ko="위 유도의 식 네 개입니다. 태그 수 슬라이더를 움직여 보세요. **선**은 식으로 계산한 값이고 **점**은 엔진이 일정을 메시지 하나하나 실제로 돌려서 센 값입니다. 수식의 항을 가리키면 아래 코드 줄과 그래프의 선이 함께 강조됩니다."
          en="These are the four formulas derived above. Move the tag slider. **Lines** are the formulas; **points** come from the engine actually running the schedule message by message and counting. Point at a term of the formulas to highlight the matching code line and chart line." />
        <M block tex={String.raw`\begin{aligned}
\text{TWR:}\quad & f_{\text{meas}} = \lk{share}{\frac{1}{N_{\text{tag}}\,T_{\text{range}}}} &\quad f_{\text{pos}} &= \lk{twr}{\frac{1}{N_{\text{tag}}\,N_{\text{anc}}\,T_{\text{range}}}} \\[6pt]
\text{TDoA:}\quad & f_{\text{meas}} = \lk{listen}{\frac{1}{T_{\text{slot}}}} &\quad f_{\text{pos}} &= \lk{tdoa}{\frac{1}{N_{\text{anc}}\,T_{\text{slot}}}}
\end{aligned}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면(또는 Tab 으로 고르면) 코드 줄(맨 아래에 접혀 있음)과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term (or reach it with Tab) to highlight the matching code line (folded at the bottom) and chart line.' })}</p>
        <div class="controls">
          <Slider label={{ ko: '태그(드론) 수 $N_{\\text{tag}}$', en: 'Number of tags (drones) $N_{\\text{tag}}$' }} value={nTags} min={1} max={20} step={1} unit={tr({ ko: '대', en: '' })} onChange={setNTags} testId="ch3-ntags"
            src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 우리 프로젝트는 5대입니다.', en: 'Local to this demo. Our project flies five.' })} />
          <Slider label={{ ko: '앵커 수 $N_{\\text{anc}}$', en: 'Number of anchors $N_{\\text{anc}}$' }} value={nAnc} min={4} max={Math.max(8, cfg.anchors.length)} step={1} unit={tr({ ko: '개', en: '' })} onChange={setNAnc} testId="ch3-nanc"
            src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 앵커 수입니다.', en: 'Local to this demo; starts from the number of anchors in the global settings.' })} />
          <Slider label={{ ko: 'TWR 거리 1회 시간 $T_{\\text{range}}$ (전역 설정)', en: 'Time per TWR range $T_{\\text{range}}$ (global setting)' }} value={Tr * 1000} min={0.5} max={10} step={0.5} unit="ms" onChange={(v) => setTr(v / 1000)} testId="cfg-uwb.twrRangeTime"
            src={Math.abs(Tr - 0.002) < 1e-12
              ? der('ch3#rate', { ko: '전역 설정. 기본값 2 ms 는 문서의 거리 측정률 500 Hz 를 가정 (가)(채널을 빈틈없이 씀)로 뒤집은 유도값 1/500 Hz 입니다.', en: 'Global setting. The default 2 ms is derived: the documented 500 Hz ranging rate inverted under assumption (a) (channel used back to back), 1/500 Hz.' })
              : ex('uwb.twrRangeTime', { ko: '전역 설정을 기본값(문서의 500 Hz 에서 유도한 2 ms)에서 바꾼 값입니다.', en: 'Global setting changed from its default (2 ms, derived from the documented 500 Hz).' })} />
          <Slider label={{ ko: 'TDoA 앵커 슬롯 길이 $T_{\\text{slot}}$ (전역 설정)', en: 'TDoA anchor slot length $T_{\\text{slot}}$ (global setting)' }} value={Ts * 1000} min={0.5} max={10} step={0.5} unit="ms" onChange={(v) => setTs(v / 1000)} testId="cfg-uwb.tdoaSlotTime"
            src={Math.abs(Ts - 0.002) < 1e-12 ? lit('lps-docs', 'tdoa2-slot-timing') : ex('uwb.tdoaSlotTime', { ko: '전역 설정을 문서의 값(2 ms)에서 바꾼 값입니다.', en: 'Global setting changed from the documented value (2 ms).' })} />
        </div>
        <p class="small muted" style={{ marginTop: '-4px' }}>{tr({ ko: '두 칸 길이 슬라이더는 전역 설정입니다. 끄는 동안에는 이 카드만 바로 바뀌고, 손을 뗀 뒤에 오차 예산과 다른 데모에 반영됩니다.', en: 'The two cell-length sliders are global settings. While dragging only this card updates; the error budget and other demos follow once you let go.' })}</p>
        <StatRow>
          <Stat label={{ ko: 'TWR · 드론당 거리 측정', en: 'TWR · ranges per drone' }} value={tw.rangesPerSecPerTag} unit={tr({ ko: '회/s', en: '/s' })} src={RATE} />
          <Stat label={{ ko: 'TWR · 드론당 위치 갱신율', en: 'TWR · position rate per drone' }} value={tw.positionRate} unit="Hz" src={RATE} status={tw.positionRate < td.positionRate / 2 ? 'warn' : undefined} />
          <Stat label={{ ko: 'TWR · 위치 갱신 주기', en: 'TWR · position update period' }} value={1000 / tw.positionRate} unit="ms" src={RATE} />
        </StatRow>
        <p class="small muted">{tr({ ko: '기호의 뜻: △ TWR 의 드론당 갱신율이 TDoA 의 절반보다 낮음.', en: 'Symbol: △ the per-drone TWR rate is below half the TDoA rate.' })}</p>
        <StatRow>
          <Stat label={{ ko: 'TDoA · 드론당 듣는 패킷', en: 'TDoA · packets heard per drone' }} value={td.tdoaPerSecPerTag} unit={tr({ ko: '개/s', en: '/s' })} src={RATE} />
          <Stat label={{ ko: 'TDoA · 드론당 위치 갱신율', en: 'TDoA · position rate per drone' }} value={td.positionRate} unit="Hz" src={RATE} />
          <Stat label={{ ko: 'TDoA · 위치 갱신 주기', en: 'TDoA · position update period' }} value={1000 / td.positionRate} unit="ms" src={RATE} />
        </StatRow>
        <LineChart
          title={{ ko: '드론 한 대의 위치 갱신율 (세로축은 로그)', en: 'Position update rate of one drone (log vertical axis)' }}
          xLabel={{ ko: '태그(드론) 수 N_tag [대]', en: 'Number of tags (drones) N_tag' }} yLabel={{ ko: '드론당 위치 갱신율 [Hz]', en: 'Position rate per drone [Hz]' }} yLog
          series={[
            { name: { ko: 'TWR 식: 1/(N_tag·N_anc·T_range)', en: 'TWR formula: 1/(N_tag·N_anc·T_range)' }, x: data.ns, y: data.twrTheory, slot: TWR, dash: '', link: 'twr' },
            { name: { ko: 'TDoA 식: 1/(N_anc·T_slot)', en: 'TDoA formula: 1/(N_anc·T_slot)' }, x: data.ns, y: data.tdoaTheory, slot: TDOA, dash: '7 4', link: 'tdoa' },
            { name: { ko: 'TWR 일정을 돌려 센 값', en: 'TWR schedule, counted' }, x: data.ns, y: data.twrCount, slot: TWR, points: true },
            { name: { ko: 'TDoA 일정을 돌려 센 값', en: 'TDoA schedule, counted' }, x: data.ns, y: data.tdoaCount, slot: TDOA, points: true },
          ]}
          refLines={[
            { x: cfg.nDrones, label: { ko: `우리: ${cfg.nDrones}대`, en: `Ours: ${cfg.nDrones} drones` } },
            ...(nTags !== cfg.nDrones ? [{ x: nTags, label: { ko: `슬라이더: ${nTags}대`, en: `Slider: ${nTags}` }, slot: 3 }] : []),
          ]}
          xDomain={[0.5, 20.5]} height={280} src={COUNTED} testId="ch3-rate-chart" />
        <Caption>{tr({
          ko: 'TWR 선은 태그 수에 반비례해 떨어지고 TDoA 선은 수평입니다. 점은 정해진 시간 동안 "끝까지 돈 바퀴"만 정수로 세기 때문에 선보다 아주 조금 아래에 놓이기도 합니다.',
          en: 'The TWR line falls in inverse proportion to the number of tags; the TDoA line is flat. Points count only completed rounds (integers) in a fixed time, so they may sit slightly below the line.',
        })}</Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch3-rate-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (아래 손코딩 과제의 기준 구현입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference solution of the coding task below — keep it closed if you want to try first)' })}</summary>
          <CodeView code={updateRateTask.solution} links={updateRateTask.links} />
        </details>
      </Demo>
    </LinkGroup>
  );
}

/* ───────────────────────── 데모 2: 누가 언제 채널을 쓰는가 ───────────────────────── */
export function TimelineDemo() {
  const cfg = config.value;
  const nA = cfg.anchors.length, Tr = cfg.uwb.twrRangeTime, Ts = cfg.uwb.tdoaSlotTime;
  const [nTags, setNTags] = useState(cfg.nDrones);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const roundT = nTags * nA * Tr, frameT = nA * Ts;
  const tEnd = Math.max(2 * roundT, 4 * frameT);
  const sched = useMemo(() => ({
    twr: simulateTwrSchedule({ nTags, nAnchors: nA, rangeTime: Tr }, tEnd + Tr / 2).events,
    tdoa: simulateTdoaSchedule({ nAnchors: nA, slotTime: Ts }, nTags, tEnd + Ts / 2).events,
  }), [nTags, nA, Tr, Ts, tEnd]);
  const tc = Math.min(t, tEnd);
  const tRef = useRef(tc);
  tRef.current = tc;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const speed = tEnd / 16; // 전체 구간을 16초쯤에 걸쳐 느리게 보여 준다
    const tick = (now: number) => {
      const nx = Math.min(tEnd, tRef.current + ((now - last) / 1000) * speed);
      last = now;
      tRef.current = nx;
      setT(nx);
      if (nx >= tEnd) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tEnd]);

  // 그림의 치수
  const W = Math.max(width, 280), gl = 60, gr = 18, iw = W - gl - gr;
  let win = (iw / 15) * Math.min(Tr, Ts); // 가장 짧은 칸이 15px 쯤 되도록
  if (win > tEnd) win = tEnd;
  const pps = iw / win;
  const t0 = Math.max(0, Math.min(tc - 0.3 * win, tEnd - win));
  const X = (s: number) => gl + (s - t0) * pps;
  const laneH = 15, pitch = 18, lsH = 9, lsPitch = 12;
  const yTwr = (i: number) => 24 + i * pitch;
  const yTdHead = 24 + nTags * pitch + 18;
  const yAnc = yTdHead + 8;
  const yLs = (i: number) => yAnc + laneH + 6 + i * lsPitch;
  const yAxis = yLs(nTags) + 2;
  const H = yAxis + 34;
  const vis = <E extends { t: number }>(ev: E[], dur: number) => ev.filter((e) => e.t > t0 - 1e-9 && e.t - dur < t0 + win + 1e-9);
  const twrVis = vis(sched.twr, Tr), tdoaVis = vis(sched.tdoa, Ts);
  const done = (te: number) => te <= tc + 1e-9;
  const twrRanges = sched.twr.filter((e) => e.tag === 0 && done(e.t)).length;
  const twrPos = sched.twr.filter((e) => e.tag === 0 && e.anchor === nA - 1 && done(e.t)).length;
  const tdoaPk = sched.tdoa.filter((e) => done(e.t)).length;
  const tdoaPos = sched.tdoa.filter((e) => e.anchor === nA - 1 && done(e.t)).length;
  const ticks = niceTicks(t0 * 1000, (t0 + win) * 1000, W < 420 ? 4 : 7);
  const blockLabel = (a: number, bw: number) => (bw >= 24 ? `A${a}` : bw >= 11 ? String(a) : '');
  const clip = 'ch3-tl-clip';
  return (
    <Demo title={{ ko: '누가 언제 채널을 쓰는가', en: 'Who occupies the channel, and when' }} testId="ch3-timeline-demo">
      <P ko="가로축은 시간, 색칠한 칸 하나가 채널을 차지하는 한 구간입니다. 위쪽은 **TWR**: 칸이 놓인 줄이 거리를 재는 드론이고 칸 안의 숫자가 상대 앵커의 번호입니다. 아래쪽은 **TDoA**: 맨 윗줄에서 앵커가 차례로 송신하고, 그 아래 얇은 줄들은 모든 드론이 같은 패킷을 **동시에** 듣고 있음을 뜻합니다. 굵은 세로 막대(●)는 그 드론이 모든 앵커를 한 바퀴 거쳐 **위치를 한 번 새로 얻은 순간**입니다."
        en="The horizontal axis is time; each filled cell is one interval in which the channel is taken. Top: **TWR** — the row tells which drone is ranging and the number in the cell is the anchor it talks to. Bottom: **TDoA** — anchors transmit in turn on the first row, and the thin rows below show every drone hearing the same packet **at the same time**. A thick vertical bar (●) marks the instant a drone has covered every anchor once and **gets a fresh position**." />
      <div class="controls">
        <Slider label={{ ko: '태그(드론) 수', en: 'Number of tags (drones)' }} value={nTags} min={1} max={8} step={1} unit={tr({ ko: '대', en: '' })} onChange={(v) => { setNTags(v); setT(0); setPlaying(false); }} testId="ch3-tl-ntags"
          src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 우리 프로젝트는 5대입니다.', en: 'Local to this demo. Our project flies five.' })} />
        <Slider label={{ ko: '보고 있는 시각', en: 'Time shown' }} value={tc} min={0} max={tEnd} step={Math.min(Tr, Ts) / 2} scale={1000} unit="ms" onChange={(v) => { setPlaying(false); setT(v); }} testId="ch3-tl-time"
          src={ex(undefined, { ko: '그림을 넘겨 보는 조작용 값입니다(시스템의 수치가 아님).', en: 'A scrubber for the picture, not a system quantity.' })} />
      </div>
      <div class="btn-row" style={{ marginBottom: '8px' }}>
        <Button primary onClick={() => { if (!playing && tc >= tEnd) setT(0); setPlaying(!playing); }} testId="ch3-tl-play">{playing ? tr({ ko: '⏸ 일시정지', en: '⏸ Pause' }) : tr({ ko: '▶ 느리게 재생', en: '▶ Play slowly' })}</Button>
        <Button onClick={() => { setPlaying(false); setT(0); }} testId="ch3-tl-reset">{tr({ ko: '처음으로', en: 'Back to start' })}</Button>
        <span class="small muted">{tr({ ko: `앵커 ${nA}개, 칸 길이는 전역 설정을 따릅니다.`, en: `${nA} anchors; cell lengths follow the global settings.` })}</span>
      </div>
      <div class="plot" ref={ref} data-testid="ch3-timeline">
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label={tr({
              ko: `채널 사용 시간표. TWR: 드론 ${nTags}대가 차례로 앵커 ${nA}개와 거리를 재며, 한 드론이 위치를 한 번 얻는 데 ${fmt(roundT * 1000, 3)} ms. TDoA: 앵커 ${nA}개가 차례로 송신하고 모든 드론이 듣는다. 한 프레임 ${fmt(frameT * 1000, 3)} ms 마다 모든 드론이 위치를 얻는다.`,
              en: `Channel timetable. TWR: ${nTags} drone(s) take turns ranging to ${nA} anchors; one drone needs ${fmt(roundT * 1000, 3)} ms per position. TDoA: ${nA} anchors transmit in turn and every drone listens; every drone gets a position each ${fmt(frameT * 1000, 3)} ms frame.`,
            })}>
            <defs><clipPath id={clip}><rect x={gl} y={0} width={iw} height={H} /></clipPath></defs>
            <text class="axis-label" x={gl} y={13} style={{ fontWeight: 700 }}>{tr({ ko: 'TWR — 한 번에 한 쌍만 (드론 ↔ 앵커)', en: 'TWR — one pair at a time (drone ↔ anchor)' })}</text>
            {Array.from({ length: nTags }, (_, i) => (
              <g key={`tl${i}`}>
                <text class="tick" x={gl - 6} y={yTwr(i) + 11} text-anchor="end">{tr({ ko: `드론 ${i + 1}`, en: `Drone ${i + 1}` })}</text>
                <rect x={gl} y={yTwr(i)} width={iw} height={laneH} fill="var(--surface-2)" />
              </g>
            ))}
            <text class="axis-label" x={gl} y={yTdHead} style={{ fontWeight: 700 }}>{tr({ ko: 'TDoA — 앵커만 송신, 드론은 모두 듣기만', en: 'TDoA — only anchors transmit, drones just listen' })}</text>
            <text class="tick" x={gl - 6} y={yAnc + 11} text-anchor="end">{tr({ ko: '앵커 송신', en: 'Anchor TX' })}</text>
            <rect x={gl} y={yAnc} width={iw} height={laneH} fill="var(--surface-2)" />
            {Array.from({ length: nTags }, (_, i) => (
              <g key={`ll${i}`}>
                <text class="tick" x={gl - 6} y={yLs(i) + 9} text-anchor="end" style={{ fontSize: '10px' }}>{tr({ ko: `드론 ${i + 1} 듣기`, en: `D${i + 1} listens` })}</text>
                <rect x={gl} y={yLs(i)} width={iw} height={lsH} fill="var(--surface-2)" />
              </g>
            ))}
            <g clip-path={`url(#${clip})`}>
              {twrVis.map((e) => {
                const x = X(e.t - Tr), bw = Tr * pps, cur = e.t - Tr <= tc && tc < e.t;
                return (
                  <g key={`a${e.t.toFixed(6)}`}>
                    <rect x={x + 0.5} y={yTwr(e.tag)} width={Math.max(1, bw - 1)} height={laneH} rx="2" fill={seriesColor(e.tag + 1)} stroke={cur ? 'var(--text)' : 'none'} stroke-width="2" />
                    <text x={x + bw / 2} y={yTwr(e.tag) + 11} text-anchor="middle" fill="#fff" font-size="10" font-weight="700">{blockLabel(e.anchor, bw)}</text>
                    {e.anchor === nA - 1 && (
                      <g>
                        <line x1={X(e.t)} x2={X(e.t)} y1={yTwr(e.tag) - 3} y2={yTwr(e.tag) + laneH + 1} stroke="var(--text)" stroke-width="3" />
                        <circle cx={X(e.t)} cy={yTwr(e.tag) - 3} r="3.2" fill="var(--text)" />
                      </g>
                    )}
                  </g>
                );
              })}
              {tdoaVis.map((e) => {
                const x = X(e.t - Ts), bw = Ts * pps, cur = e.t - Ts <= tc && tc < e.t;
                return (
                  <g key={`d${e.t.toFixed(6)}`}>
                    <rect x={x + 0.5} y={yAnc} width={Math.max(1, bw - 1)} height={laneH} rx="2" fill="var(--surface-3)" stroke={cur ? 'var(--text)' : 'var(--text-3)'} stroke-width={cur ? 2 : 1} />
                    <text x={x + bw / 2} y={yAnc + 11} text-anchor="middle" fill="var(--text)" font-size="10" font-weight="700">{blockLabel(e.anchor, bw)}</text>
                    {Array.from({ length: nTags }, (_, i) => <rect key={i} x={x + 0.5} y={yLs(i)} width={Math.max(1, bw - 1)} height={lsH} rx="1.5" fill={seriesColor(i + 1)} opacity="0.6" />)}
                    {e.anchor === nA - 1 && (
                      <g>
                        <line x1={X(e.t)} x2={X(e.t)} y1={yLs(0) - 3} y2={yLs(nTags - 1) + lsH + 1} stroke="var(--text)" stroke-width="3" />
                        <circle cx={X(e.t)} cy={yLs(0) - 3} r="3.2" fill="var(--text)" />
                      </g>
                    )}
                  </g>
                );
              })}
              <line x1={X(tc)} x2={X(tc)} y1={18} y2={yAxis} stroke="var(--critical)" stroke-width="1.5" stroke-dasharray="4 3" />
            </g>
            <line class="axis" x1={gl} x2={gl + iw} y1={yAxis} y2={yAxis} />
            {ticks.map((v) => (
              <g key={`t${v}`}>
                <line class="axis" x1={X(v / 1000)} x2={X(v / 1000)} y1={yAxis} y2={yAxis + 4} />
                <text class="tick" x={X(v / 1000)} y={yAxis + 16} text-anchor="middle">{fmt(v, 4)}</text>
              </g>
            ))}
            <text class="axis-label" x={gl + iw / 2} y={H - 3} text-anchor="middle">{tr({ ko: '시간 [ms] (빨간 점선 = 보고 있는 시각)', en: 'Time [ms] (red dashed line = time shown)' })}</text>
          </svg>
        )}
        <div class="plot-foot"><span><SrcBadge src={der('ch3#tdoa-passive', { ko: '이 장의 메시지 수 모델로 그린 일정표(개념 모델). 실제 펌웨어의 패킷 순서를 옮긴 것이 아닙니다.', en: 'A timetable drawn from the message-count model of this chapter (a concept model), not the packet order of the real firmware.' })} /></span></div>
      </div>
      <P ko={`보고 있는 시각 ${fmt(tc * 1000, 3)} ms 까지 **드론 1** 이 얻은 것 — TWR: 거리 ${twrRanges}개, 위치 ${twrPos}번 · TDoA: 패킷 ${tdoaPk}개, 위치 ${tdoaPos}번{{der:ch3#rate|위 일정표에서 보고 있는 시각까지 끝난 칸을 센 값|Cells completed up to the time shown in the timetable above}}`}
        en={`Up to the time shown, ${fmt(tc * 1000, 3)} ms, **drone 1** has obtained — TWR: ${twrRanges} range(s), ${twrPos} position(s) · TDoA: ${tdoaPk} packet(s), ${tdoaPos} position(s){{der:ch3#rate|위 일정표에서 보고 있는 시각까지 끝난 칸을 센 값|Cells completed up to the time shown in the timetable above}}`} />
      <StatRow>
        <Stat label={{ ko: 'TWR · 드론 한 대가 위치 1번 얻는 시간', en: 'TWR · time per position for one drone' }} value={roundT * 1000} unit="ms" src={RATE} />
        <Stat label={{ ko: 'TDoA · 모든 드론이 위치 1번 얻는 시간', en: 'TDoA · time per position for every drone' }} value={frameT * 1000} unit="ms" src={RATE} />
        <Stat label={{ ko: 'TWR 한 바퀴 동안 TDoA 프레임 수', en: 'TDoA frames per TWR round' }} value={roundT / frameT} unit="×" src={RATE} />
      </StatRow>
      <Caption>{tr({
        ko: '태그 수를 1대로 줄이면 위아래의 굵은 막대 간격이 같아지고, 늘릴수록 TWR 쪽 막대만 드물어집니다. TDoA 쪽은 줄이 늘어날 뿐 막대 간격은 그대로입니다.',
        en: 'With one tag the thick bars are equally spaced top and bottom; as you add tags only the TWR bars thin out. On the TDoA side more rows appear but the bar spacing stays.',
      })}</Caption>
    </Demo>
  );
}

/* ───────────────────────── 데모 3: 갱신율 → 추정 오차 ───────────────────────── */
export function ErrorDemo() {
  const cfg = config.value, b = budget.value;
  const nA = cfg.anchors.length;
  const fT = twrRate({ nTags: cfg.nDrones, nAnchors: nA, rangeTime: cfg.uwb.twrRangeTime }).positionRate;
  const fD = tdoaRate({ nAnchors: nA, slotTime: cfg.uwb.tdoaSlotTime }).positionRate;
  // 처음 값은 반올림하지 않은 지금 설정의 수평 측정 오차 → 타일이 오차 예산·본문 문단과 같은 수로 시작한다
  const [sig, setSig] = useState(() => Math.min(0.4, Math.max(0.02, b.sigmaPosH)));
  const [sa, setSa] = useState(() => Math.min(5, Math.max(0.2, cfg.estimation.accelNoise)));
  // 객체를 그대로 디바운스하면 렌더마다 새 객체가 되어 끝없이 다시 계산된다 → 문자열 키로
  const prmKey = useDebounced(JSON.stringify({ sig, sa }), 160);
  const prm = useMemo(() => JSON.parse(prmKey) as { sig: number; sa: number }, [prmKey]);
  const fMax = Math.max(100, Math.ceil((Math.max(fT, fD) * 1.2) / 10) * 10);
  const curve = useMemo(() => {
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i <= 44; i++) { const f = Math.pow(fMax, i / 44); x.push(f); y.push(perAxisH(steadyStatePosSigma, prm.sig, f, prm.sa) * 100); }
    return { x, y };
  }, [prm, fMax]);
  const sim = useMemo(() => {
    const x = [...new Set([2, 4, 7, 12.5, 20, 30, 45, 62.5, 80, 100, fT, fD].filter((f) => f >= 1 && f <= fMax).map((f) => Number(f.toFixed(3))))].sort((p, q) => p - q);
    return { x, y: x.map((f, i) => perAxisH(simulateRateError, prm.sig, f, prm.sa, 600, 11 + i) * 100) };
  }, [prm, fMax, fT, fD]);
  // 오차 예산과 같은 수평 규약: √2·σ_ss(σ_pos,H/√2)
  const eT = perAxisH(steadyStatePosSigma, sig, fT, sa), eD = perAxisH(steadyStatePosSigma, sig, fD, sa);
  const fixedRatio = perAxisH(steadyStatePosSigmaFixedDisturbance, sig, fT, sa, fD) / perAxisH(steadyStatePosSigmaFixedDisturbance, sig, fD, sa, fD);
  const SRC = der('ch5#steady-state', {
    ko: '선: 1축 등속 모델 칼만 필터의 정상상태 오차(엔진 steadyStatePosSigma, 5장에서 유도)를 오차 예산과 같은 수평 규약 √2·σ_ss(σ_pos,H/√2) 로 합친 값. 점: 같은 모델로 축마다 600초 동안 실제로 필터를 돌려 잰 오차의 RMS 를 같은 규약으로 합친 값.',
    en: 'Line: steady-state error of a Kalman filter on a one-axis constant-velocity model (engine steadyStatePosSigma, derived in chapter 5), combined in the budget convention √2·σ_ss(σ_pos,H/√2). Points: RMS error from actually running the filter per axis on the same model for 600 s, combined the same way.',
  });
  return (
    <Demo title={{ ko: '갱신율을 올리면 추정 오차는 얼마나 줄어드나', en: 'How much the estimate improves with update rate' }} testId="ch3-error-demo">
      <P ko="가로축은 위치 측정이 들어오는 빈도, 세로축은 필터를 거친 뒤의 수평 위치 추정 오차(1σ, x·y 두 축 합)이고, 위 유도의 마지막 식처럼 오차 예산과 같은 규약으로 계산합니다. 세로 점선 두 개가 지금 설정에서의 TWR(5대가 나눠 쓸 때)과 TDoA 의 갱신율입니다. 두 모드의 차이를 **갱신율 하나로만** 보려고, 측정 한 번의 수평 오차 $\sigma_{\text{pos,H}}$ 는 같다고 두었습니다."
        en="The horizontal axis is how often a position measurement arrives; the vertical axis is the horizontal position error after filtering (1σ, x and y combined), computed in the same convention as the error budget (the last formula of the derivation above). The two dashed vertical lines are the update rates of TWR (five drones sharing) and TDoA with the current settings. To isolate **the effect of rate alone**, the horizontal error of a single measurement $\sigma_{\text{pos,H}}$ is taken to be the same for both." />
      <div class="controls">
        <Slider label={{ ko: '측정 한 번의 수평 위치 오차 $\\sigma_{\\text{pos,H}}$', en: 'Horizontal position error of one measurement $\\sigma_{\\text{pos,H}}$' }} value={sig} min={0.02} max={0.4} step={0.005} scale={100} unit="cm" onChange={setSig} testId="ch3-err-sig"
          src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 처음 값은 지금 설정의 UWB 수평 위치 오차(DOP × 유효 거리 오차)입니다.', en: 'Local to this demo; starts from the UWB horizontal position error of the current settings (DOP × effective range error).' })} />
        <Slider label={{ ko: '예측 못 하는 가속도 $\\sigma_a$', en: 'Unpredictable acceleration $\\sigma_a$' }} value={sa} min={0.2} max={5} step={0.1} unit="m/s²" onChange={setSa} testId="ch3-err-sa"
          src={ex('estimation.accelNoise', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} />
      </div>
      <StatRow>
        <Stat label={{ ko: `TWR ${cfg.nDrones}대 (${fmt(fT, 3)} Hz) 의 수평 추정 오차`, en: `Horizontal estimate error, TWR with ${cfg.nDrones} drones (${fmt(fT, 3)} Hz)` }} value={eT * 100} unit="cm" src={SRC} />
        <Stat label={{ ko: `TDoA (${fmt(fD, 3)} Hz) 의 수평 추정 오차`, en: `Horizontal estimate error, TDoA (${fmt(fD, 3)} Hz)` }} value={eD * 100} unit="cm" src={SRC} />
        <Stat label={{ ko: '갱신율 비', en: 'Ratio of rates' }} value={fD / fT} unit="×" src={RATE} />
        <Stat label={{ ko: '오차 비', en: 'Ratio of errors' }} value={eT / eD} unit="×" src={SRC} />
        <Stat label={{ ko: '오차 비 (외란 세기를 고정하면)', en: 'Ratio of errors (disturbance held fixed)' }} value={fixedRatio} unit="×"
          src={der('ch5#steady-state', { ko: '모르는 가속도를 TDoA 간격마다 새로 뽑고 측정만 드물게 넣은 리카티 반복(위 유도의 "가정이 결과를 바꾸는 곳")', en: 'Riccati iteration with the unknown acceleration redrawn every TDoA interval and only the measurements made rarer ("Where the assumption changes the answer" above)' })} />
      </StatRow>
      <LineChart
        title={{ ko: '위치 갱신율에 따른 정상상태 수평 추정 오차', en: 'Steady-state horizontal estimate error versus position update rate' }}
        xLabel={{ ko: '위치 갱신율 [Hz]', en: 'Position update rate [Hz]' }} yLabel={{ ko: '수평 추정 오차 1σ [cm]', en: 'Horizontal estimate error 1σ [cm]' }}
        series={[
          { name: { ko: '이론 (정상상태 칼만 필터)', en: 'Theory (steady-state Kalman filter)' }, x: curve.x, y: curve.y, slot: 3, dash: '' },
          { name: { ko: '시뮬레이션 (필터를 실제로 돌림)', en: 'Simulation (filter actually run)' }, x: sim.x, y: sim.y, slot: 3, points: true },
        ]}
        refLines={[
          { x: fT, label: { ko: `TWR ${cfg.nDrones}대`, en: `TWR, ${cfg.nDrones} drones` }, slot: TWR },
          { x: fD, label: { ko: 'TDoA', en: 'TDoA' }, slot: TDOA },
          { y: sig * 100, label: { ko: '필터 없이 측정 한 번: σ_pos,H', en: 'One raw measurement: σ_pos,H' } },
        ]}
        yDomain={[0, sig * 100 * 1.12]} xDomain={[0, fMax]} height={270} src={SRC} testId="ch3-error-chart" />
      <Caption>{tr({
        ko: '갱신율이 0 에 가까우면 추정 오차는 측정 한 번의 오차 σ_pos,H 와 같아지고(평균 낼 것이 없음), 갱신율이 높아질수록 줄어들지만 줄어드는 속도는 점점 느려집니다. 점은 선과 같은 외란 가정으로 참값을 만들어 필터를 돌린 결과라서, 계산이 맞는지를 확인해 줄 뿐 외란 가정 자체를 검증하지는 않습니다.',
        en: 'Near zero rate the estimate is no better than one measurement, σ_pos,H (nothing to average). It improves with rate, but ever more slowly. The points generate the truth with the same disturbance assumption as the line, so they check the computation, not the disturbance assumption itself.',
      })}</Caption>
    </Demo>
  );
}

/* ───────────────────────── 데모 4: 앵커 상자 밖으로 나가면 ───────────────────────── */
export function VolumeDemo() {
  const cfg = config.value;
  const [scale, setScale] = useState(0.5);
  const s = useDebounced(scale, 160);
  const cx = cfg.hall.x / 2, cy = cfg.hall.y / 2, z = cfg.formation.height;
  const anchors = useMemo(() => cfg.anchors.map((a) => [cx + (a[0] - cx) * s, cy + (a[1] - cy) * s, a[2]]), [cfg.anchors, s, cx, cy]);
  const box = useMemo(() => ({
    x0: Math.min(...anchors.map((a) => a[0])), x1: Math.max(...anchors.map((a) => a[0])),
    y0: Math.min(...anchors.map((a) => a[1])), y1: Math.max(...anchors.map((a) => a[1])),
  }), [anchors]);
  const sweep = useMemo(() => {
    const n = 24, xs: number[] = [], twr: number[] = [], tdoa: number[] = [], sx: number[] = [], sTwr: number[] = [], sTdoa: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = cx + ((cfg.hall.x - cx) * i) / n, p = [x, cy, z];
      xs.push(x);
      twr.push(dopFor('twr', anchors, p).hdop * cfg.uwb.sigmaTwr * 100);
      tdoa.push(dopFor('tdoa', anchors, p).hdop * cfg.uwb.sigmaTdoa * 100);
      if (i % 3 === 0) {
        sx.push(x);
        sTwr.push(positionErrorMc('twr', anchors, p, cfg.uwb.sigmaTwr, 160, 100 + i).rmsH * 100);
        sTdoa.push(positionErrorMc('tdoa', anchors, p, cfg.uwb.sigmaTdoa, 160, 200 + i).rmsH * 100);
      }
    }
    return { xs, twr, tdoa, sx, sTwr, sTdoa };
  }, [anchors, cfg.hall.x, cx, cy, z, cfg.uwb.sigmaTwr, cfg.uwb.sigmaTdoa]);
  const samples = useCircuit(cfg);
  const centre = (s: Vec[]): Vec => [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length];
  const oc = useMemo(() => outsideCount(samples, anchors), [samples, anchors]);
  const last = sweep.xs.length - 1;
  const SRC = der('ch2#gdop', {
    ko: '선: 2장의 DOP 에 측정 노이즈 σ 를 곱한 값(TDoA 는 이웃 앵커 쌍 기준). 점: 같은 자리에서 잡음을 넣은 측정으로 가우스-뉴턴 측위를 160번 반복한 수평 오차의 RMS. NLOS 는 넣지 않았습니다.',
    en: 'Lines: the DOP of chapter 2 times the measurement noise σ (TDoA uses neighbouring anchor pairs). Points: RMS horizontal error of 160 Gauss–Newton fixes from noisy measurements at the same spot. No NLOS.',
  });
  return (
    <Demo title={{ ko: '앵커를 무대 주변에만 달고 강당 전체를 날면', en: 'Anchors only around the stage, flying the whole hall' }} testId="ch3-volume-demo">
      <P ko="전역 설정의 앵커 배치를 강당 중심 쪽으로 **줄여** 봅니다(높이는 그대로). 평면도의 점선 사각형이 앵커가 둘러싼 상자입니다. 그래프는 강당 중심에서 오른쪽 벽까지(평면도의 화살표) 드론을 옮겨 가며, UWB 측정 한 묶음으로 구한 수평 위치 오차를 두 모드로 계산한 것입니다."
        en="Here the anchor layout of the global settings is **shrunk** toward the hall centre (heights unchanged). The dashed rectangle on the plan is the box enclosed by the anchors. The chart moves a drone from the hall centre to the right wall (the arrow on the plan) and computes, for both modes, the horizontal position error from one set of UWB measurements." />
      <Slider label={{ ko: '앵커 구역의 크기 (강당 대비)', en: 'Size of the anchor region (relative to the hall)' }} value={scale} min={0.3} max={1} step={0.05} scale={100} unit="%" onChange={setScale} testId="ch3-vol-scale"
        src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 100% 가 전역 설정의 앵커 배치입니다.', en: 'Local to this demo; 100% is the anchor layout of the global settings.' })} />
      <div class="grid-2">
        <PlanView hall={cfg.hall} maxHeight={250} testId="ch3-vol-plan"
          caption={tr({ ko: '◆ 앵커(이 데모에서 줄인 배치) · 점선 사각형 = 앵커 상자 · 원 = 대형이 도는 경로 · 화살표 = 그래프의 가로축', en: '◆ anchors (shrunk for this demo) · dashed rectangle = anchor box · circle = path of the formation · arrow = horizontal axis of the chart' })}>
          {(sc) => (
            <g>
              <rect x={sc.sx(box.x0)} y={sc.sy(box.y1)} width={sc.sx(box.x1) - sc.sx(box.x0)} height={sc.sy(box.y0) - sc.sy(box.y1)} fill="var(--accent-soft)" opacity="0.6" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="6 4" />
              {samples.length > 1 && <polygon points={samples.map((s) => { const c = centre(s); return `${sc.sx(c[0]).toFixed(1)},${sc.sy(c[1]).toFixed(1)}`; }).join(' ')} fill="none" stroke="var(--text-2)" stroke-width="1.2" />}
              {samples[0].map((p, i) => {
                const inside = insideAnchorBox(anchors, p);
                return <circle key={i} cx={sc.sx(p[0])} cy={sc.sy(p[1])} r="4" fill={inside ? 'var(--series-3)' : 'var(--surface)'} stroke={inside ? 'var(--surface)' : 'var(--critical)'} stroke-width={inside ? 1 : 2} />;
              })}
              <line x1={sc.sx(cx)} x2={sc.sx(cfg.hall.x) - 7} y1={sc.sy(cy)} y2={sc.sy(cy)} stroke="var(--text)" stroke-width="1.8" />
              <path d={`M${sc.sx(cfg.hall.x) - 1},${sc.sy(cy)} l-9,-5 v10 z`} fill="var(--text)" />
              {anchors.map((a, i) => <rect key={i} x={sc.sx(a[0]) - 5} y={sc.sy(a[1]) - 5} width="10" height="10" rx="1.5" transform={`rotate(45 ${sc.sx(a[0])} ${sc.sy(a[1])})`} fill="var(--series-2)" stroke="var(--surface)" stroke-width="1.5" />)}
            </g>
          )}
        </PlanView>
        <div>
          <StatRow>
            <Stat label={{ ko: '강당 중심에서 TWR / TDoA', en: 'At the hall centre, TWR / TDoA' }} value={`${fmt(sweep.twr[0], 3)} / ${fmt(sweep.tdoa[0], 3)}`} unit="cm" src={SRC} />
            <Stat label={{ ko: '오른쪽 벽에서 TWR / TDoA', en: 'At the right wall, TWR / TDoA' }} value={`${fmt(sweep.twr[last], 3)} / ${fmt(sweep.tdoa[last], 3)}`} unit="cm" src={SRC} status={sweep.tdoa[last] > 2 * sweep.tdoa[0] ? 'warn' : undefined} />
          </StatRow>
          <p>
            {oc.out === 0
              ? <Status kind="good">{tr({ ko: `대형이 도는 경로의 표본 ${oc.total}개가 모두 앵커 상자 안`, en: `All ${oc.total} samples along the formation's path are inside the anchor box` })}</Status>
              : <Status kind="bad">{tr({ ko: `경로의 표본 ${oc.total}개 중 ${oc.out}개가 앵커 상자 밖`, en: `${oc.out} of ${oc.total} samples along the path are outside the anchor box` })}</Status>}
            <SrcBadge src={der('ch3#volume', { ko: '지금 설정의 대형·경로를 따라 드론 위치를 뽑아, 각 좌표가 앵커 좌표의 최소~최대 사이에 있는지(insideAnchorBox) 센 값', en: 'Drone positions sampled along the current formation path, counting whether each coordinate lies between the smallest and largest anchor coordinate (insideAnchorBox)' })} />
          </p>
          <p class="small muted">{tr({ ko: `비행 고도 ${fmt(z)} m 에서 계산. 채워진 원 = 상자 안의 드론, 빨간 테두리의 빈 원 = 상자 밖의 드론.`, en: `Computed at the flight height ${fmt(z)} m. Filled circle = drone inside the box; hollow circle with red outline = outside.` })}<SrcBadge src={ex('formation.height')} /></p>
          <p class="small muted">{tr({ ko: '기호의 뜻: △ 벽에서의 TDoA 오차가 강당 중심의 2배를 넘음 · ✓ / ✕ 경로 표본이 모두 앵커 상자 안 / 하나라도 밖.', en: 'Symbols: △ the TDoA error at the wall is more than twice that at the centre · ✓ / ✕ all path samples inside the anchor box / at least one outside.' })}</p>
        </div>
      </div>
      <LineChart
        title={{ ko: '강당 중심에서 벽 쪽으로 갈 때의 수평 위치 오차 (세로축은 로그)', en: 'Horizontal position error from the hall centre toward the wall (log vertical axis)' }}
        xLabel={{ ko: '드론의 x 좌표 [m]', en: 'x coordinate of the drone [m]' }} yLabel={{ ko: 'UWB 만의 수평 위치 오차 1σ [cm]', en: 'UWB-only horizontal error 1σ [cm]' }} yLog
        series={[
          { name: { ko: 'TWR 이론 (HDOP·σ)', en: 'TWR theory (HDOP·σ)' }, x: sweep.xs, y: sweep.twr, slot: TWR, dash: '' },
          { name: { ko: 'TDoA 이론 (HDOP·σ)', en: 'TDoA theory (HDOP·σ)' }, x: sweep.xs, y: sweep.tdoa, slot: TDOA, dash: '7 4' },
          { name: { ko: 'TWR 시뮬레이션', en: 'TWR simulation' }, x: sweep.sx, y: sweep.sTwr, slot: TWR, points: true },
          { name: { ko: 'TDoA 시뮬레이션', en: 'TDoA simulation' }, x: sweep.sx, y: sweep.sTdoa, slot: TDOA, points: true },
        ]}
        refLines={box.x1 < cfg.hall.x - 1e-6 ? [{ x: box.x1, label: { ko: '앵커 상자의 끝', en: 'Edge of the anchor box' } }] : []}
        height={260} src={SRC} testId="ch3-volume-chart" />
      <Caption>{tr({
        ko: '상자 안에서는 두 모드가 비슷합니다. 상자를 벗어나면 TWR 은 조금 나빠지는 데 그치지만 TDoA 는 빠르게 나빠집니다. 구역 크기를 100% 로 돌리면 강당 안 어디서도 상자를 벗어나지 않습니다.',
        en: 'Inside the box the two modes are similar. Outside it TWR degrades only a little while TDoA degrades quickly. At 100% no point of the hall leaves the box.',
      })}</Caption>
    </Demo>
  );
}

/* ───────────────────────── 함정 실험실 ───────────────────────── */
export function RatePitfall() {
  const cfg = config.value;
  const [mode, setMode] = useState<'twr' | 'tdoa'>('twr');
  const [n, setN] = useState(cfg.nDrones);
  const [eff, setEff] = useState(1);
  const NMAX = 12;
  const sweep = useMemo(() => {
    const ns = Array.from({ length: NMAX }, (_, i) => i + 1);
    // 채널 효율 eff: 충돌·재전송으로 채널 시간 중 쓸모 있는 몫. TWR 의 교환 한 번이 실제로는 T_range/eff 만큼 걸린다고 본다.
    const run = (m: 'twr' | 'tdoa') => ns.map((k) => computeBudget({ ...cfg, nDrones: k, uwb: { ...cfg.uwb, mode: m, twrRangeTime: m === 'twr' ? cfg.uwb.twrRangeTime / eff : cfg.uwb.twrRangeTime } }));
    const bt = run('twr'), bd = run('tdoa');
    const sa = cfg.estimation.accelNoise;
    // 이론선(sigmaEstH)과 같은 수평 규약 √2·(1축 시뮬레이션)(σ_pos,H/√2)
    const simD = perAxisH(simulateRateError, bd[0].sigmaPosH, bd[0].posRate, sa, 600, 5) * 100;
    return {
      ns, bt, bd,
      simT: bt.map((b, i) => perAxisH(simulateRateError, b.sigmaPosH, b.posRate, sa, 600, 31 + i) * 100),
      simD: ns.map(() => simD),
    };
  }, [cfg, eff]);
  const samples = useCircuit(cfg);
  const ocGlobal = useMemo(() => outsideCount(samples, cfg.anchors), [samples, cfg.anchors]);
  const bt = sweep.bt[n - 1], bd = sweep.bd[n - 1];
  const cur = mode === 'twr' ? bt : bd;
  const spacing = cfg.formation.spacing;
  // 최소 간격의 분해(8장의 식): 기체 크기 + 무작위 항 k_σ√2·√(σ_est² + σ_trk²) + 나머지(편향·지연·여유)
  const kS = cfg.safety.kSigma, trk = cfg.safety.trackingError, body = cfg.vehicle.envelope;
  const randOf = (x: typeof bt) => kS * Math.SQRT2 * Math.hypot(x.sigmaEstH, trk);
  const restOf = (x: typeof bt) => x.minSepH - body - randOf(x);
  const SIG = der('ch5#steady-state', {
    ko: '전역 설정에서 모드와 태그 수(와 이 실험의 채널 효율)만 바꿔 오차 예산을 다시 계산한 값(computeBudget). 선: 정상상태 칼만 필터의 식(5장). 점: 같은 조건으로 필터를 실제로 돌린 시뮬레이션.',
    en: 'The error budget recomputed from the global settings with only the mode and the tag count (and this experiment\'s channel efficiency) changed (computeBudget). Lines: steady-state Kalman formula (ch. 5). Points: simulation of the filter under the same conditions.',
  });
  const SEP = der('ch8#budget-sum', { ko: '0장에서 세운 오차 예산의 합(최소 간격의 식은 8장)을, 모드와 태그 수만 바꿔 다시 계산한 권장 최소 간격', en: 'The sum of the error budget set up in chapter 0 (the minimum-spacing formula is in chapter 8), recomputed with only the mode and tag count changed' });
  const SEPN = (ko: string, en: string) => `{{der:ch8#budget-sum|${ko}|${en}}}`;
  return (
    <Pitfall title={{ ko: '"정확하다니까 TWR 로 5대를 띄우자"', en: '"TWR is the most accurate, so let us fly five on TWR"' }} testId="ch3-pitfall">
      <P ko="TWR 은 가장 정확한 모드라고 문서에 적혀 있습니다{{lit:lps-docs/twr-description}}. 드론 한 대로 시험 비행을 했더니 결과도 좋았습니다. 그래서 같은 설정으로 5대를 띄웁니다. 아래에서 모드와 태그 수를 바꿔 가며, 드론 한 대의 갱신율과 추정 오차, 그리고 그 결과로 권장 간격이 어떻게 달라지는지 보세요. 나머지 값은 모두 전역 설정 그대로입니다."
        en="The docs call TWR the most accurate mode{{lit:lps-docs/twr-description}}. A test flight with one drone looked good, so you fly five with the same setup. Change the mode and the number of tags below and watch the per-drone update rate, the estimate error and the resulting recommended spacing. Everything else stays at the global settings." />
      <P ko="**먼저 결론부터.** 이 교재의 모델 안에서는 TWR 5대도 숫자로는 크게 나쁘지 않게 나옵니다. 이 함정은 **화면의 숫자가 아니라 숫자를 만든 가정**에 있습니다. 아래에서 그 가정을 하나씩 흔들어 보세요."
        en="**The conclusion first.** Inside this textbook's model, five drones on TWR do not look much worse in numbers. The trap lies **not in the numbers on screen but in the assumptions that produced them**. Shake those assumptions one by one below." />
      <Segmented label={{ ko: 'TWR 채널 효율 (충돌·재전송으로 잃는 시간을 뺀 몫)', en: 'TWR channel efficiency (share left after collisions and retransmissions)' }} value={eff} onChange={setEff} testId="ch3-pit-eff" options={[
        { value: 1, label: { ko: '100% (모델의 가정: 빈틈없이 공평하게)', en: '100% (model assumption: perfect sharing)' } },
        { value: 0.5, label: '50%' },
        { value: 0.25, label: '25%' },
      ]} />
      <p class="small muted" style={{ marginTop: '-4px' }}>{tr({ ko: '채널 효율은 이 실험에서만 바꾸는 가정입니다. 문헌값이 아니며, 조율 없이 여러 태그가 송신할 때 갱신율이 얼마나 떨어질 수 있는지 감을 잡기 위한 값입니다.', en: 'Channel efficiency is an assumption changed only in this experiment. It is not a literature value; it gives a feel for how far the rate can drop when several tags transmit without coordination.' })}<SrcBadge src={ex(undefined, { ko: '이 실험에서만 바꾸는 가정(문헌값 아님)', en: 'An assumption local to this experiment (not a literature value)' })} /></p>
      <Segmented label={{ ko: '이 실험의 측위 모드', en: 'Positioning mode for this experiment' }} value={mode} onChange={setMode} testId="ch3-pit-mode" options={[
        { value: 'twr', label: { ko: 'TWR (채널을 나눠 씀)', en: 'TWR (channel shared)' } },
        { value: 'tdoa', label: { ko: 'TDoA (듣기만 함)', en: 'TDoA (listen only)' } },
      ]} />
      <Slider label={{ ko: '태그(드론) 수', en: 'Number of tags (drones)' }} value={n} min={1} max={NMAX} step={1} unit={tr({ ko: '대', en: '' })} onChange={setN} testId="ch3-pit-n"
        src={ex(undefined, { ko: '이 실험에서만 바꾸는 값. 우리 프로젝트는 5대입니다.', en: 'Local to this experiment. Our project flies five.' })} />
      <StatRow>
        <Stat label={{ ko: '드론당 위치 갱신율', en: 'Position rate per drone' }} value={cur.posRate} unit="Hz" src={RATE} status={mode === 'twr' && cur.posRate < bd.posRate / 2 ? 'warn' : 'good'} />
        <Stat label={{ ko: '수평 추정 오차 $\\sigma_{\\text{est}}$', en: 'Horizontal estimate error $\\sigma_{\\text{est}}$' }} value={cur.sigmaEstH * 100} unit="cm" src={SIG} />
        <Stat label={{ ko: '권장 최소 수평 간격', en: 'Recommended minimum horizontal spacing' }} value={cur.minSepH} unit="m" src={SEP} status={spacing < cur.minSepH ? 'bad' : 'good'} />
        <Stat label={{ ko: '권장 최소 수직 간격', en: 'Recommended minimum vertical spacing' }} value={cur.minSepV} unit="m" src={SEP} />
      </StatRow>
      <p class="small muted">{tr({ ko: '기호의 뜻: △ TWR 의 드론당 갱신율이 TDoA 의 절반보다 낮음 · ✓ / ✕ 지금 대형 간격이 권장 최소 수평 간격 이상 / 미만.', en: 'Symbols: △ the per-drone TWR rate is below half the TDoA rate · ✓ / ✕ the current formation spacing meets / is below the recommended minimum horizontal spacing.' })}</p>
      <p>
        {spacing < cur.minSepH
          ? <Status kind="bad">{tr({ ko: `지금 대형 간격 ${fmt(spacing)} m 는 이 조건의 권장 최소 간격보다 좁습니다`, en: `The current formation spacing of ${fmt(spacing)} m is tighter than the recommended minimum for this condition` })}</Status>
          : <Status kind="good">{tr({ ko: `지금 대형 간격 ${fmt(spacing)} m 는 이 조건의 권장 최소 간격 이상입니다`, en: `The current formation spacing of ${fmt(spacing)} m meets the recommended minimum for this condition` })}</Status>}
        <SrcBadge src={ex('formation.spacing')} />
      </p>
      <LineChart
        title={{ ko: '태그 수에 따른 수평 추정 오차', en: 'Horizontal estimate error versus number of tags' }}
        xLabel={{ ko: '태그(드론) 수 [대]', en: 'Number of tags (drones)' }} yLabel={{ ko: '수평 추정 오차 σ_est [cm]', en: 'Horizontal estimate error σ_est [cm]' }}
        series={[
          { name: { ko: 'TWR 이론', en: 'TWR theory' }, x: sweep.ns, y: sweep.bt.map((b) => b.sigmaEstH * 100), slot: TWR, dash: '', width: mode === 'twr' ? 3 : 1.5 },
          { name: { ko: 'TDoA 이론', en: 'TDoA theory' }, x: sweep.ns, y: sweep.bd.map((b) => b.sigmaEstH * 100), slot: TDOA, dash: '7 4', width: mode === 'tdoa' ? 3 : 1.5 },
          { name: { ko: 'TWR 시뮬레이션', en: 'TWR simulation' }, x: sweep.ns, y: sweep.simT, slot: TWR, points: true },
          { name: { ko: 'TDoA 시뮬레이션', en: 'TDoA simulation' }, x: sweep.ns, y: sweep.simD, slot: TDOA, points: true },
        ]}
        refLines={[{ x: n, label: { ko: `지금: ${n}대`, en: `Now: ${n}` } }]}
        xDomain={[0.5, NMAX + 0.5]} yDomain={[0, Math.max(...sweep.bt.map((b) => b.sigmaEstH), ...sweep.bd.map((b) => b.sigmaEstH)) * 100 * 1.15]} height={250} src={SIG} testId="ch3-pit-chart" />
      <P ko={`지금 설정으로 ${n}대일 때: TWR 의 추정 오차는 ${fmt(bt.sigmaEstH * 100, 3)} cm{{der:ch5#steady-state}}, TDoA 는 ${fmt(bd.sigmaEstH * 100, 3)} cm{{der:ch5#steady-state}} 입니다. 권장 수평 간격으로는 ${fmt(bt.minSepH, 3)} m${SEPN('모드만 TWR 로 바꿔 계산한 오차 예산의 합', 'Sum of the error budget with only the mode set to TWR')} 대 ${fmt(bd.minSepH, 3)} m${SEPN('모드만 TDoA 로 바꿔 계산한 오차 예산의 합', 'Sum of the error budget with only the mode set to TDoA')}, 차이는 ${fmt(Math.abs(bt.minSepH - bd.minSepH) * 100, 2)} cm${SEPN('두 값의 차', 'Difference of the two')} 입니다.`}
        en={`With the current settings and ${n} drone(s): the estimate error is ${fmt(bt.sigmaEstH * 100, 3)} cm{{der:ch5#steady-state}} with TWR and ${fmt(bd.sigmaEstH * 100, 3)} cm{{der:ch5#steady-state}} with TDoA. In recommended horizontal spacing that is ${fmt(bt.minSepH, 3)} m${SEPN('모드만 TWR 로 바꿔 계산한 오차 예산의 합', 'Sum of the error budget with only the mode set to TWR')} versus ${fmt(bd.minSepH, 3)} m${SEPN('모드만 TDoA 로 바꿔 계산한 오차 예산의 합', 'Sum of the error budget with only the mode set to TDoA')}, a difference of ${fmt(Math.abs(bt.minSepH - bd.minSepH) * 100, 2)} cm${SEPN('두 값의 차', 'Difference of the two')}.`} />
      <P ko={`**간격은 어떻게 나왔나**(8장의 식). TWR: 기체 크기 {{cfg:vehicle.envelope}} 를 빼고 보면, 무작위 항 $k_\\sigma\\sqrt2\\,\\sqrt{\\sigma_{\\text{est}}^2 + \\sigma_{\\text{trk}}^2}$ = ${fmt(randOf(bt), 3)} m${SEPN('k_σ·√2·√(σ_est² + σ_trk²), TWR', 'k_σ·√2·√(σ_est² + σ_trk²), TWR')}, 나머지(앵커 편향·지연·여유) ${fmt(restOf(bt), 3)} m${SEPN('최소 간격 − 기체 크기 − 무작위 항', 'Minimum spacing − body size − random term')}. TDoA: 무작위 항 ${fmt(randOf(bd), 3)} m${SEPN('k_σ·√2·√(σ_est² + σ_trk²), TDoA', 'k_σ·√2·√(σ_est² + σ_trk²), TDoA')}, 나머지 ${fmt(restOf(bd), 3)} m${SEPN('최소 간격 − 기체 크기 − 무작위 항', 'Minimum spacing − body size − random term')}. 모드에 따라 크게 바뀌는 것은 무작위 항입니다(나머지 항도 모드마다 DOP 가 달라 몇 mm 다릅니다). 그런데 $\\sigma_{\\text{est}}$ 는 추종 오차 $\\sigma_{\\text{trk}}$ = {{cfg:safety.trackingError}} 와 **제곱합**으로 묶이므로, $\\sigma_{\\text{est}}$ 의 차이 × $k_\\sigma\\sqrt2$ 가 간격 차이로 그대로 옮겨지지 않습니다.`}
        en={`**Where the spacing comes from** (the formula of chapter 8). TWR: leaving out the body size {{cfg:vehicle.envelope}}, the random term $k_\\sigma\\sqrt2\\,\\sqrt{\\sigma_{\\text{est}}^2 + \\sigma_{\\text{trk}}^2}$ = ${fmt(randOf(bt), 3)} m${SEPN('k_σ·√2·√(σ_est² + σ_trk²), TWR', 'k_σ·√2·√(σ_est² + σ_trk²), TWR')} and the rest (anchor bias, delays, margin) ${fmt(restOf(bt), 3)} m${SEPN('최소 간격 − 기체 크기 − 무작위 항', 'Minimum spacing − body size − random term')}. TDoA: random term ${fmt(randOf(bd), 3)} m${SEPN('k_σ·√2·√(σ_est² + σ_trk²), TDoA', 'k_σ·√2·√(σ_est² + σ_trk²), TDoA')}, rest ${fmt(restOf(bd), 3)} m${SEPN('최소 간격 − 기체 크기 − 무작위 항', 'Minimum spacing − body size − random term')}. The term that changes much with the mode is the random one (the rest differs by a few mm because the DOP differs per mode). But $\\sigma_{\\text{est}}$ is combined with the tracking error $\\sigma_{\\text{trk}}$ = {{cfg:safety.trackingError}} **in quadrature**, so the difference in $\\sigma_{\\text{est}}$ times $k_\\sigma\\sqrt2$ does not carry over to the spacing one to one.`} />
      <P ko="여기 나온 추정 오차가 위 '갱신율을 올리면…' 데모의 타일과 조금 다른 것은, 거기서는 두 모드의 측정 한 번의 수평 오차 $\sigma_{\text{pos,H}}$ 를 같게 두었고(처음 값은 지금 설정 모드의 값) 여기서는 모드마다 실제 설정(측정 노이즈와 DOP)이 달라지기 때문입니다."
        en="The estimate errors here differ slightly from the tiles of the 'How much the estimate improves…' demo above: there the single-measurement horizontal error $\sigma_{\text{pos,H}}$ was the same for both modes (starting from the value of the currently set mode); here each mode uses its own settings (measurement noise and DOP)." />
      <P ko="간격 차이가 몇 cm 뿐이라고 안심하면 안 됩니다. 이 모델이 빼먹은 것이 셋 있습니다. 첫째, 공식 문서는 TWR 에서 측위할 수 있는 태그를 1대로 적고 있습니다{{lit:lps-docs/twr-tag-limit}}. 여러 대가 채널을 사이좋게 나눠 쓴다는 것부터가 이 교재의 가정입니다. 둘째, 이 모델에는 패킷 충돌과 재전송이 없습니다. 여러 태그가 조율 없이 송신하면 갱신율은 더 떨어집니다. 위의 채널 효율을 낮춰 보면 그 방향이 보입니다. 셋째, 드론이 급하게 움직일수록(위 '갱신율을 올리면…' 데모의 $\sigma_a$ 가 클수록) 낮은 갱신율이 치르는 값은 더 커집니다."
        en="Do not relax because the spacing differs by only a few centimetres. The model leaves out three things. First, the official docs say TWR can position one tag{{lit:lps-docs/twr-tag-limit}}; several tags politely sharing the channel is already an assumption of this textbook. Second, the model has no packet collisions or retransmissions; tags transmitting without coordination would do worse. Lower the channel efficiency above to see the direction. Third, the harder the drones manoeuvre (the larger $\sigma_a$ in the 'How much the estimate improves…' demo above), the more a low update rate costs." />
      <h3>{tr({ ko: '반대쪽 함정: TDoA 를 골랐으니 끝났다고 생각하기', en: 'The opposite trap: choosing TDoA and thinking you are done' })}</h3>
      <P ko="TDoA 로 바꾸면 갱신율 문제는 사라지지만, 이번에는 **어디를 나는가**가 문제가 됩니다. 위의 '앵커를 무대 주변에만 달고…' 데모에서 본 것처럼, 앵커가 둘러싼 상자를 벗어나면 TDoA 의 위치 오차는 빠르게 커집니다. 이륙 직후처럼 가장 낮은 앵커보다 아래에 있을 때도 상자 밖입니다. 앵커를 직접 끌어 옮기며 확인하는 실험은 [2장](#/ch/2)의 함정 실험실에 있습니다."
        en="Switching to TDoA removes the rate problem, but now **where you fly** matters. As the 'Anchors only around the stage' demo above showed, the TDoA position error grows quickly once you leave the box enclosed by the anchors. Just after take-off, below the lowest anchor, you are also outside the box. The experiment where you drag the anchors yourself is in the pitfall lab of [chapter 2](#/ch/2)." />
      <p>
        {ocGlobal.out === 0
          ? <Status kind="good">{tr({ ko: `지금 전역 설정: 대형이 도는 경로의 표본 ${ocGlobal.total}개가 모두 앵커 상자 안`, en: `Current global settings: all ${ocGlobal.total} samples along the formation's path are inside the anchor box` })}</Status>
          : <Status kind="bad">{tr({ ko: `지금 전역 설정: 경로의 표본 ${ocGlobal.total}개 중 ${ocGlobal.out}개가 앵커 상자 밖`, en: `Current global settings: ${ocGlobal.out} of ${ocGlobal.total} samples along the path are outside the anchor box` })}</Status>}
        <SrcBadge src={der('ch3#volume', { ko: '전역 설정의 앵커·대형·비행 고도로 경로를 따라 드론 위치를 뽑아 insideAnchorBox 로 센 값', en: 'Drone positions sampled along the path with the anchors, formation and flight height of the global settings, counted with insideAnchorBox' })} />
      </p>
    </Pitfall>
  );
}
