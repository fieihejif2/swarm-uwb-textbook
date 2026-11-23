import { useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { L, fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { commHops } from '../../sim/budget';
import { burstLengthQuantile } from '../../sim/loss';
import { Blunder, applyBlunder, averagingExperiment, biasField, perturbAnchors, surveyBiasTheory } from '../../sim/ch6_survey';
import { ekfScalarUpdate, tdoaModel } from '../../sim/kf';
import { dist } from '../../sim/linalg';
import { C_LIGHT } from '../../sim/uwb';
import { SrcRef, der, ex, lit } from '../../sources';
import {
  Button, Caption, CfgSlider, CodeTask, CodeView, Demo, Derivation, LineChart, LinkGroup, List, M, McPanel, Note, P, Pitfall, PlanView, Predict, PredictNumber,
  Section, Segmented, Slider, SrcBadge, Stat, StatRow, Status, T, useDebounced, useLink, useWidth,
} from '../../ui';
import { tasks, tdoaUpdateTask } from './tasks';

const DOC_LPS = 'https://www.bitcraze.io/documentation/system/positioning/loco-positioning-system/';
const DOC_FW = 'https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/functional-areas/loco-positioning-system/kalman_measurement_models/';
const DOC_CS2 = 'https://imrclab.github.io/crazyswarm2/';

/** 개념 모델임을 알리는 문구 + 공식 문서 링크 (지시서 §11) */
function ConceptNote() {
  return (
    <p data-testid="ch6-concept-note">
      <Status kind="warn">{tr({ ko: '개념 모델입니다 — 실제 동작은 공식 문서를 보세요', en: 'This is a concept model — see the official documentation for the real behaviour' })}</Status>{' '}
      <span class="small">
        <T ko={`[Loco Positioning System 문서](${DOC_LPS}) · [펌웨어 문서: Loco 칼만 측정 모델](${DOC_FW}) · [Crazyswarm2 문서](${DOC_CS2})`}
          en={`[Loco Positioning System docs](${DOC_LPS}) · [Firmware docs: Loco Kalman measurement model](${DOC_FW}) · [Crazyswarm2 docs](${DOC_CS2})`} />
      </span>
    </p>
  );
}

// ───────────────────────── 데모 1: 데이터 흐름 블록선도 ─────────────────────────
interface Box { x: number; y: number; w: number; h: number; title: L; lines?: L[]; outer?: boolean }
interface Arr { key?: string; a: [number, number]; b: [number, number]; lx: number; ly: number; anchor: 'start' | 'middle' | 'end'; lines: string[]; aria?: string }

/** 가리키거나(hover) 포커스하면 강조. 포커스가 남아 있는 동안에는 마우스가 떠나도 강조를 유지한다. */
function pick(active: { value: string | null }, key: string) {
  return {
    onMouseEnter: () => { active.value = key; },
    onMouseLeave: (e: Event) => { if (active.value === key && document.activeElement !== e.currentTarget) active.value = null; },
    onFocus: () => { active.value = key; },
    onBlur: () => { if (active.value === key) active.value = null; },
    onClick: (e: Event) => { active.value = key; (e.currentTarget as HTMLElement | SVGElement).focus?.(); },
  };
}

function Arrow({ arr }: { arr: Arr }) {
  const active = useLink();
  const on = !!arr.key && active.value === arr.key;
  const [x1, y1] = arr.a, [x2, y2] = arr.b;
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const hx = x2 - ux * 10, hy = y2 - uy * 10;
  const col = on ? 'var(--accent-strong)' : 'var(--text-2)';
  const body = (
    <>
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={col} stroke-width={on ? 4.5 : 2} />
      <polygon points={`${x2},${y2} ${hx - uy * 5.5},${hy + ux * 5.5} ${hx + uy * 5.5},${hy - ux * 5.5}`} fill={col} />
      {arr.lines.map((t, i) => (
        <text key={i} class="tick" x={arr.lx} y={arr.ly + i * 14} text-anchor={arr.anchor} style={{ fontWeight: on || i === 0 ? 700 : 400, fill: on ? 'var(--text)' : undefined }}>{t}</text>
      ))}
    </>
  );
  if (!arr.key) return <g>{body}</g>;
  return (
    <g {...({ tabindex: '0' } as any)} role="button" aria-label={arr.aria} aria-pressed={on} data-flow={arr.key} style={{ cursor: 'pointer', outline: 'none' }} {...pick(active, arr.key)}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" stroke-width="26" />
      {body}
    </g>
  );
}

interface FlowRow { key: string; name: L; path: L; rate: number; rateSrc: SrcRef; delay: string; delaySrc: SrcRef; what: L }

function FlowDiagram({ rows, nAnchors, p2p }: { rows: FlowRow[]; nAnchors: number; p2p: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const r = Object.fromEntries(rows.map((x) => [x.key, x]));
  const hz = (k: string) => `${fmt(r[k].rate, 3)} Hz`;
  const B = {
    anchors: { title: { ko: `앵커 × ${nAnchors}`, en: `Anchors × ${nAnchors}` }, lines: [{ ko: '고정 · 좌표를 앎', en: 'fixed · surveyed' }, { ko: 'UWB 패킷 송신', en: 'transmit UWB' }] },
    veh: { title: { ko: 'Crazyflie 한 대 (기체 안)', en: 'One Crazyflie (onboard)' }, outer: true },
    deck: { title: { ko: 'Loco 덱 = 태그', en: 'Loco deck = tag' }, lines: [{ ko: 'UWB 수신 (TDoA: 듣기만)', en: 'UWB receive (TDoA: listen only)' }] },
    ekf: { title: { ko: '온보드 추정기 (EKF)', en: 'Onboard estimator (EKF)' }, lines: [{ ko: 'UWB 측정 + IMU → 위치·속도·자세', en: 'UWB + IMU → position, velocity, attitude' }] },
    ctrl: { title: { ko: '제어기 → 모터', en: 'Controller → motors' }, lines: [{ ko: '자기 위치로 궤적 추종', en: 'tracks using its own position' }] },
    pc: { title: { ko: '지상 PC', en: 'Ground PC' }, lines: [{ ko: 'Crazyswarm2 (ROS 2)', en: 'Crazyswarm2 (ROS 2)' }, { ko: 'Crazyradio (USB)', en: 'Crazyradio (USB)' }] },
    nbr: { title: { ko: '이웃 기체 (교재의 가정)', en: 'Neighbour vehicle (assumed)' }, lines: [{ ko: '다른 Crazyflie, 같은 구조', en: 'another Crazyflie, same structure' }] },
  };
  const lab = {
    uwb: ['UWB', hz('uwb'), r.uwb.delay],
    est: [tr({ ko: `추정값 ${hz('est')}`, en: `estimate ${hz('est')}` }), tr({ ko: `지연 ${r.est.delay}`, en: `latency ${r.est.delay}` })],
    down: [tr({ ko: '로그(위치)', en: 'logs (pose)' }), hz('down'), r.down.delay],
    up: [tr({ ko: '명령·궤적', en: 'commands' }), hz('up'), r.up.delay],
    nbr: [tr(p2p ? { ko: '이웃에게 위치 (직접)', en: 'position to neighbour (direct)' } : { ko: '이웃에게 위치 (중계)', en: 'position to neighbour (relay)' }), hz('nbr'), r.nbr.delay],
  };
  const aria = (k: string) => `${tr(r[k].name)}: ${tr(r[k].path)}, ${hz(k)}, ${r[k].delay}`;
  const W = narrow ? 340 : 760, H = narrow ? 712 : 370;
  const boxes: Box[] = narrow
    ? [
        { x: 60, y: 8, w: 220, h: 60, ...B.anchors }, { x: 16, y: 128, w: 308, h: 266, ...B.veh }, { x: 32, y: 156, w: 276, h: 52, ...B.deck },
        { x: 32, y: 236, w: 276, h: 60, ...B.ekf }, { x: 32, y: 336, w: 276, h: 48, ...B.ctrl }, { x: 60, y: 520, w: 220, h: 80, ...B.pc },
        { x: 16, y: 652, w: 264, h: 52, ...B.nbr },
      ]
    : [
        { x: 8, y: 50, w: 140, h: 96, ...B.anchors }, { x: 220, y: 8, w: 290, h: 284, ...B.veh }, { x: 236, y: 40, w: 258, h: 54, ...B.deck },
        { x: 236, y: 120, w: 258, h: 70, ...B.ekf }, { x: 236, y: 232, w: 258, h: 50, ...B.ctrl }, { x: 622, y: 92, w: 130, h: 116, ...B.pc },
        { x: 560, y: 306, w: 192, h: 56, ...B.nbr },
      ];
  const arrows: Arr[] = narrow
    ? [
        { key: 'uwb', a: [262, 68], b: [262, 156], lx: 252, ly: 86, anchor: 'end', lines: lab.uwb, aria: aria('uwb') },
        { a: [170, 208], b: [170, 236], lx: 0, ly: 0, anchor: 'start', lines: [] },
        { key: 'est', a: [170, 296], b: [170, 336], lx: 180, ly: 313, anchor: 'start', lines: lab.est, aria: aria('est') },
        { key: 'down', a: [110, 394], b: [110, 520], lx: 100, ly: 440, anchor: 'end', lines: lab.down, aria: aria('down') },
        { key: 'up', a: [230, 520], b: [230, 394], lx: 240, ly: 440, anchor: 'start', lines: lab.up, aria: aria('up') },
        p2p
          ? { key: 'nbr', a: [24, 394], b: [24, 652], lx: 34, ly: 614, anchor: 'start', lines: lab.nbr, aria: aria('nbr') }
          : { key: 'nbr', a: [170, 600], b: [170, 652], lx: 180, ly: 614, anchor: 'start', lines: lab.nbr, aria: aria('nbr') },
      ]
    : [
        { key: 'uwb', a: [148, 67], b: [236, 67], lx: 184, ly: 86, anchor: 'middle', lines: lab.uwb, aria: aria('uwb') },
        { a: [365, 94], b: [365, 120], lx: 0, ly: 0, anchor: 'start', lines: [] },
        { key: 'est', a: [365, 190], b: [365, 232], lx: 377, ly: 207, anchor: 'start', lines: lab.est, aria: aria('est') },
        { key: 'down', a: [510, 122], b: [622, 122], lx: 566, ly: 78, anchor: 'middle', lines: lab.down, aria: aria('down') },
        { key: 'up', a: [622, 178], b: [510, 178], lx: 566, ly: 198, anchor: 'middle', lines: lab.up, aria: aria('up') },
        p2p
          ? { key: 'nbr', a: [490, 292], b: [560, 334], lx: 470, ly: 318, anchor: 'end', lines: lab.nbr, aria: aria('nbr') }
          : { key: 'nbr', a: [687, 208], b: [687, 306], lx: 679, ly: 246, anchor: 'end', lines: lab.nbr, aria: aria('nbr') },
      ];
  return (
    <div class="plot" ref={ref} data-testid="ch6-flow-diagram">
      {width > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: `${W}px`, margin: '0 auto' }} role="group"
          aria-label={tr({ ko: '데이터 흐름 블록선도: 앵커에서 기체의 온보드 추정기와 제어기로, Crazyradio 를 거쳐 지상 PC 와 주고받는 흐름, 그리고 이웃 기체로 가는 위치(교재의 가정)', en: 'Data-flow block diagram: from the anchors to the onboard estimator and controller, to and from the ground PC over the Crazyradio, and the position sent to a neighbour vehicle (assumed)' })}>
          {boxes.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill={b.outer ? 'var(--surface-2)' : 'var(--surface)'} stroke="var(--text-3)" stroke-width={b.outer ? 1.5 : 1} stroke-dasharray={b.outer ? '6 4' : undefined} />
              <text x={b.x + 9} y={b.y + 19} style={{ fontSize: '13px', fontWeight: 700, fill: 'var(--text)' }}>{tr(b.title)}</text>
              {(b.lines ?? []).map((ln, k) => <text key={k} class="tick" x={b.x + 9} y={b.y + 36 + k * 15}>{tr(ln)}</text>)}
            </g>
          ))}
          {arrows.map((a, i) => <Arrow key={i} arr={a} />)}
        </svg>
      )}
    </div>
  );
}

function FlowTable({ rows }: { rows: FlowRow[] }) {
  const active = useLink();
  // 좁은 화면(폰)에서는 갱신율·지연을 이름 아래 한 줄로 쌓아 첫 열이 눌리지 않게 한다
  const [ref, w] = useWidth<HTMLDivElement>();
  const narrow = w > 0 && w < 520;
  const rate = (r: FlowRow) => <span class="num" style={{ whiteSpace: 'nowrap' }}>{fmt(r.rate, 3)} Hz<SrcBadge src={r.rateSrc} /></span>;
  const delay = (r: FlowRow) => <span class="num" style={{ whiteSpace: 'nowrap' }}>{r.delay}<SrcBadge src={r.delaySrc} /></span>;
  return (
    <div class="table-wrap" ref={ref}>
      <table class="tbl" data-testid="ch6-flow-table">
        <thead><tr>
          <th>{tr({ ko: '화살표와 그 위를 흐르는 것', en: 'Arrow and what flows on it' })}{narrow && <span class="small muted" style={{ fontWeight: 400 }}> · {tr({ ko: '갱신율 · 지연', en: 'rate · delay' })}</span>}</th>
          {!narrow && <><th class="r">{tr({ ko: '갱신율', en: 'Rate' })}</th><th class="r">{tr({ ko: '지연', en: 'Delay' })}</th></>}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const on = active.value === r.key;
            return (
              <tr key={r.key} tabIndex={0} data-flow-row={r.key} data-active={String(on)} style={on ? { background: 'var(--hl)', fontWeight: 650 } : undefined}
                {...pick(active, r.key)}>
                <td>{on ? '▶ ' : ''}<b>{tr(r.name)}</b> <span class="small muted">· {tr(r.path)}</span>
                  {narrow && <div class="small" style={{ margin: '2px 0' }}>{tr({ ko: '갱신율', en: 'Rate' })} {rate(r)} · {tr({ ko: '지연', en: 'Delay' })} {delay(r)}</div>}
                  {!narrow && <br />}<span class="small">{tr(r.what)}</span></td>
                {!narrow && <td class="r">{rate(r)}</td>}
                {!narrow && <td class="r">{delay(r)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FlowDemo() {
  const cfg = config.value, b = budget.value;
  const [pcMs, setPcMs] = useState(0);
  const hops = commHops(cfg);
  const tauEst = cfg.estimation.latency, tauC = cfg.comm.delayMean, Tc = 1 / cfg.comm.rate, pc = pcMs / 1000;
  // 가장 먼 앵커까지의 전파 비행시간 (강당 한가운데 기준)
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const dMax = Math.max(...cfg.anchors.map((a) => dist(a, center)));
  const ms = (s: number) => `${fmt(s * 1000, 3)} ms`;
  const commRate = ex('comm.rate'), commDelay = ex('comm.delayMean');
  const p2p = cfg.comm.topology === 'p2p';
  const rows: FlowRow[] = [
    {
      key: 'uwb', name: { ko: 'UWB', en: 'UWB' }, path: { ko: '앵커 → Loco 덱', en: 'anchors → Loco deck' }, rate: b.posRate,
      rateSrc: der('ch3#rate', { ko: '3장의 갱신율 모델에 지금의 UWB 모드와 앵커 수를 넣은 값: 모든 앵커의 측정이 한 바퀴 모이는 비율', en: 'The update-rate model of chapter 3 with the current UWB mode and anchor count: how often one full round of anchor measurements is collected' }),
      delay: `${fmt((dMax / C_LIGHT) * 1e9, 2)} ns`, delaySrc: der('ch1#ns-to-m', { ko: '전파가 가장 먼 앵커에서 강당 한가운데까지 오는 시간 = 거리 / 빛의 속도. ms 로는 사실상 0', en: 'Radio flight time from the farthest anchor to the hall centre = distance / speed of light. Effectively 0 in ms' }),
      what: { ko: `앵커가 보낸 패킷의 도착 시각(거리 또는 거리차). 지연 칸은 전파가 가장 먼 앵커에서 강당 한가운데까지 약 ${fmt(dMax, 3)} m 를 날아가는 시간으로, 다른 줄의 ms 와 달리 사실상 0 입니다`, en: `Arrival times of anchor packets (ranges or range differences). The delay is the radio flight time over the ~${fmt(dMax, 3)} m from the farthest anchor to the hall centre — unlike the ms on the other rows, effectively 0` },
    },
    {
      key: 'est', name: { ko: '추정값', en: 'Estimate' }, path: { ko: '온보드 추정기 → 위치 제어기', en: 'onboard estimator → position controller' }, rate: 100,
      rateSrc: lit('cf-firmware-docs', 'main-loop-rate'), delay: ms(tauEst), delaySrc: ex('estimation.latency'),
      what: { ko: '자기 위치·속도·자세. 기체 밖으로 나가지 않는다. 갱신율 칸은 그 값을 쓰는 위치 제어 루프의 주기(펌웨어 소스의 상수)', en: 'Own position, velocity and attitude. Never leaves the vehicle. The rate is that of the position-control loop that uses it (a constant in the firmware source)' },
    },
    {
      key: 'down', name: { ko: '로그(위치)', en: 'Logs (pose)' }, path: { ko: '기체 → Crazyradio → 지상 PC', en: 'vehicle → Crazyradio → ground PC' }, rate: cfg.comm.rate,
      rateSrc: commRate, delay: ms(tauC), delaySrc: commDelay, what: { ko: '기체가 추정한 자기 pose(위치 + 자세), 상태', en: 'The pose (position + attitude) estimated onboard, status' },
    },
    {
      key: 'up', name: { ko: '명령·궤적', en: 'Commands' }, path: { ko: '지상 PC → Crazyradio → 기체', en: 'ground PC → Crazyradio → vehicle' }, rate: cfg.comm.rate,
      rateSrc: commRate, delay: ms(tauC), delaySrc: commDelay, what: { ko: '이륙·착륙, 궤적 업로드와 시작, 목표점', en: 'Take-off and landing, trajectory upload and start, setpoints' },
    },
    {
      key: 'nbr', name: { ko: '이웃에게 가는 위치', en: 'Position sent to neighbours' },
      path: p2p ? { ko: '기체 → 이웃 기체 직접 (교재의 가정)', en: 'vehicle → neighbour, direct (assumed)' } : { ko: '지상 PC → Crazyradio → 이웃 기체 (교재의 가정)', en: 'ground PC → Crazyradio → neighbour (assumed)' },
      rate: cfg.comm.rate, rateSrc: commRate, delay: ms(tauC), delaySrc: commDelay,
      what: { ko: '이웃 위치에 반응하는 대형 제어(7장)를 직접 짰을 때만 필요한 길. 궤적을 올려 두고 시작만 보내는 기본 사용법에는 없다', en: 'Needed only if you write a formation controller that reacts to neighbour positions (ch. 7); absent in the basic use of uploading trajectories and sending a start' },
    },
  ];
  const own = tauEst;
  const mean = b.loopDelay + pc;
  const worst = tauEst + b.ageMax + pc;
  const AGE = (ko: string, en: string) => der('ch6#ages', { ko, en });
  return (
    <LinkGroup>
      <Demo title={{ ko: '위치 정보가 흐르는 길과 그 나이', en: 'The path position information takes, and how old it gets' }} testId="ch6-flow-demo">
        <ConceptNote />
        <P ko="상자는 **누가** 일하는지, 화살표는 **무엇이 얼마나 자주, 얼마나 늦게** 건너가는지를 나타냅니다. 화살표를 누르거나 Tab 으로 고르면 아래 표의 같은 줄이 강조됩니다. 수치는 펌웨어의 내부 타이밍을 재현한 것이 아니라, 이 교재의 설정값으로 그린 단순한 그림입니다."
          en="Boxes show **who** does the work; arrows show **what crosses, how often and how late**. Click an arrow or tab to it and the matching row of the table below is highlighted. The numbers do not reproduce the firmware's internal timing; they are a simple picture drawn from this textbook's settings." />
        <P ko="**'이웃 기체' 상자와 그리로 가는 화살표는 교재의 가정입니다.** 각 기체가 이웃의 위치에 반응하는 대형 제어(7장)를 직접 짰을 때 필요한 길입니다. 지상 PC 중계라면 이 기체의 위치가 로그로 PC 에 내려간 뒤(아래쪽 화살표) PC 가 그것을 이웃에게 다시 올려 보내고, 기체끼리 직접이라면 한 번에 건너갑니다. 궤적을 미리 올려 두고 시작만 보내는 기본 사용법에는 이 화살표가 없습니다. Crazyswarm2 가 이렇게 위치를 중계해 준다는 것은 이 교재가 문헌으로 확인한 사실이 아닙니다."
          en="**The 'neighbour vehicle' box and the arrow into it are an assumption of this textbook.** It is the path you need if you write a formation controller in which each vehicle reacts to its neighbours' positions (ch. 7). With a ground-PC relay this vehicle's position goes down to the PC as a log (the downward arrow) and the PC sends it up again to the neighbour; directly between vehicles it crosses once. The basic use — upload trajectories, send a start — has no such arrow. That Crazyswarm2 relays positions this way is not something this textbook verified in the literature." />
        <FlowDiagram rows={rows} nAnchors={cfg.anchors.length} p2p={p2p} />
        <FlowTable rows={rows} />
        <Segmented label={{ ko: 'UWB 모드 (전역 설정)', en: 'UWB mode (global setting)' }} value={cfg.uwb.mode} onChange={(v) => setPath('uwb.mode', v)} testId="ch6-flow-mode"
          options={[{ value: 'tdoa', label: 'TDoA' }, { value: 'twr', label: 'TWR' }]} />
        <Segmented label={{ ko: '이웃의 위치가 오는 길 (전역 설정)', en: 'How neighbour positions travel (global setting)' }} value={cfg.comm.topology} onChange={(v) => setPath('comm.topology', v)} testId="ch6-flow-topology"
          options={[{ value: 'ground', label: { ko: '지상 PC 중계 (무선 2구간)', en: 'Relay via ground PC (2 radio hops)' } }, { value: 'p2p', label: { ko: '기체 간 직접 (무선 1구간)', en: 'Direct between vehicles (1 radio hop)' } }]} />
        <div class="controls">
          <CfgSlider path="estimation.latency" max={100} testId="ch6-flow-latency" />
          <CfgSlider path="comm.rate" max={100} testId="ch6-flow-rate" />
          <CfgSlider path="comm.delayMean" max={200} testId="ch6-flow-delay" />
          <Slider label={{ ko: '지상 PC 계산 시간', en: 'Ground-PC compute time' }} value={pcMs} min={0} max={50} step={1} unit="ms" onChange={setPcMs} testId="ch6-flow-pc"
            src={ex(undefined, { ko: '이 데모에서만 더해 보는 값. 오차 예산에는 이 항이 없으므로, 실제로 재서 0 이 아니면 통신 지연에 합쳐 넣으세요.', en: 'Added in this demo only. The error budget has no such term; if you measure a non-zero value, fold it into the comm delay.' })} />
        </div>
        <StatRow>
          <Stat label={{ ko: '내 위치의 나이 (온보드 제어기가 쓸 때)', en: 'Age of my own position (used onboard)' }} value={own * 1000} unit="ms" src={AGE('τ_est', 'τ_est')} />
          <Stat label={{ ko: '이웃 위치의 나이: 평균', en: 'Age of a neighbour’s position: mean' }} value={mean * 1000} unit="ms" src={AGE('τ_est + (무선 구간 수)·τ_c + T_c/2 (+ PC 계산 시간). 7장의 루프 지연과 같은 식', 'τ_est + hops·τ_c + T_c/2 (+ PC compute time). Same formula as the loop delay of chapter 7')} />
          <Stat label={{ ko: '이웃 위치의 나이: 1000패킷에 1번 수준', en: 'Age of a neighbour’s position: 1-in-1000-packet level' }} value={worst * 1000} unit="ms" status={worst > 0.3 ? 'warn' : undefined}
            src={AGE('τ_est + (무선 구간 수)·(τ_c + 지터) + T_c + 1000번에 1번 나오는 연속 손실 시간 (+ PC 계산 시간)', 'τ_est + hops·(τ_c + jitter) + T_c + the 1-in-1000 loss burst (+ PC compute time)')} />
          <Stat label={{ ko: '평균 나이의 비 (이웃 / 나)', en: 'Ratio of mean ages (neighbour / own)' }} value={own > 0 ? mean / own : Infinity} unit="×" src={AGE('위 두 값의 비', 'Ratio of the two values above')} />
        </StatRow>
        <P ko={`상대속도 {{cfg:safety.relSpeed}} 로 움직인다면, 내 위치는 쓰는 순간 ${fmt(own * cfg.safety.relSpeed * 100, 2)} cm{{der:ch6#ages}} 묵은 것이고, 이웃의 위치는 평균 ${fmt(mean * cfg.safety.relSpeed * 100, 3)} cm{{der:ch6#ages}}, 1000패킷에 1번 나오는 나쁜 경우 ${fmt(worst * cfg.safety.relSpeed * 100, 3)} cm{{der:ch6#ages}} 묵은 것입니다. 이 값은 최악이 아닙니다. 한 번의 비행에서 패킷이 수천 개 오가므로 이보다 긴 공백도 여러 번 나올 수 있습니다. 지금은 무선 구간 ${hops}개를 건넙니다. **자기 위치는 기체 안에서 바로 쓰고, 남의 위치만 무선을 건넌다**는 구조가 이 차이를 만듭니다.`}
          en={`At a relative speed of {{cfg:safety.relSpeed}}, my own position is ${fmt(own * cfg.safety.relSpeed * 100, 2)} cm{{der:ch6#ages}} stale when used, whereas a neighbour's position is ${fmt(mean * cfg.safety.relSpeed * 100, 3)} cm{{der:ch6#ages}} stale on average and ${fmt(worst * cfg.safety.relSpeed * 100, 3)} cm{{der:ch6#ages}} in a 1-in-1000-packet bad case. That is not a worst case: a single flight exchanges thousands of packets, so longer gaps can occur several times. It currently crosses ${hops} radio hop(s). The gap comes from the structure: **your own position is used right where it is computed, only other vehicles' positions cross the radio**.`} />
      </Demo>
    </LinkGroup>
  );
}

// ───────────────────────── 데모 2: TDoA 갱신 1스텝 (수식 ↔ 코드 ↔ 그래프) ─────────────────────────
function TdoaStepDemo() {
  const cfg = config.value;
  const ai = cfg.anchors[0], aj = cfg.anchors[1];
  const yLine = cfg.hall.y / 2, zLine = cfg.formation.height;
  const [xPos, setXPos] = useState(Math.round(cfg.hall.x * 0.3 * 2) / 2);
  const [nuCm, setNuCm] = useState(20);
  const [sigCm, setSigCm] = useState(cfg.uwb.sigmaTdoa * 100);
  const [spCm, setSpCm] = useState(20);
  const sweep = useMemo(() => {
    const xs: number[] = [], di: number[] = [], dj: number[] = [], h: number[] = [], Hx: number[] = [], Hy: number[] = [], Hz: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = 0.3 + ((cfg.hall.x - 0.6) * i) / 60, p = [x, yLine, zLine];
      const m = tdoaModel([...p, 0, 0, 0], ai, aj, 3);
      xs.push(x); di.push(dist(p, ai)); dj.push(dist(p, aj)); h.push(m.h); Hx.push(m.H[0]); Hy.push(m.H[1]); Hz.push(m.H[2]);
    }
    return { xs, di, dj, h, Hx, Hy, Hz };
  }, [cfg.anchors, cfg.hall.x, yLine, zLine]);
  const st = [xPos, yLine, zLine, 0, 0, 0];
  const m = tdoaModel(st, ai, aj, 3);
  const sig = sigCm / 100, sp = spCm / 100, nu = nuCm / 100;
  const P0 = st.map((_, i) => st.map((__, j) => (i === j ? (i < 3 ? sp * sp : 0.25) : 0)));
  const upd = ekfScalarUpdate({ x: st, P: P0 }, m.h, m.H, m.h + nu, sig * sig);
  const dp = [0, 1, 2].map((k) => upd.state.x[k] - st[k]);
  const hn = Math.hypot(m.H[0], m.H[1], m.H[2]) || 1e-9;
  const u = [0, 1, 2].map((k) => m.H[k] / hn);
  let varAfter = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) varAfter += u[i] * upd.state.P[i][j] * u[j];
  const SRC = der('ch6#meas-model', { ko: '아래 식에 지금 설정의 앵커 0, 1 좌표와 슬라이더 값을 넣어 계산', en: 'The formulas below evaluated with anchors 0 and 1 of the current settings and the slider values' });
  const UPD = der('ch6#scalar-update', { ko: '스칼라 갱신 식에 슬라이더 값을 넣어 계산 (엔진의 ekfScalarUpdate)', en: 'The scalar-update formulas evaluated with the slider values (engine function ekfScalarUpdate)' });
  const here = { x: xPos, label: { ko: '태그 위치', en: 'Tag position' }, slot: 8 };
  return (
    <LinkGroup>
      <Demo title={{ ko: 'TDoA 측정 하나가 추정을 얼마나, 어느 쪽으로 움직이나', en: 'How far, and which way, one TDoA measurement moves the estimate' }} testId="ch6-tdoa-demo">
        <P ko={`태그가 강당을 가로지르는 직선($y$ = 강당 세로의 절반 = ${fmt(yLine)} m{{ex:hall.y}}, $z$ = 비행 높이 ${fmt(zLine)} m{{ex:formation.height}}) 위에 있고, 지금 설정의 앵커 0 과 앵커 1 쌍에서 TDoA 측정 하나가 들어왔다고 합시다. 아래 식의 항을 가리키면 같은 일을 하는 코드 줄과 그래프의 선이 함께 강조됩니다.`}
          en={`Put the tag on a straight line across the hall ($y$ = half the hall width = ${fmt(yLine)} m{{ex:hall.y}}, $z$ = flight height ${fmt(zLine)} m{{ex:formation.height}}) and let one TDoA measurement arrive from the pair anchor 0 – anchor 1 of the current settings. Point at a term of the formulas to highlight the code line and the chart line that do the same job.`} />
        <M block tex={String.raw`\lk{h}{h(x)} = \lk{dj}{\norm{p - a_j}} - \lk{di}{\norm{p - a_i}}, \qquad \lk{H}{H = \Big[\ \tfrac{(p-a_j)^{\T}}{d_j} - \tfrac{(p-a_i)^{\T}}{d_i}\ \ \ 0\ 0\ 0\ \Big]}`} />
        <M block tex={String.raw`\lk{S}{S = H P H^{\T} + \sigma^2}, \qquad \lk{K}{K = \frac{P H^{\T}}{S}}, \qquad \lk{innov}{x^{+} = x + K\,(z - h)}, \qquad \lk{P}{P^{+} = (I - K H)\,P}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 코드 줄과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines and chart lines.' })}</p>
        <div class="controls">
          <Slider label={{ ko: '태그의 $x$ 위치', en: 'Tag $x$ position' }} value={xPos} min={0.5} max={cfg.hall.x - 0.5} step={0.5} unit="m" onChange={setXPos} testId="ch6-tdoa-x" src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} />
          <Slider label={{ ko: '혁신 $z - h$ (측정이 예측과 다른 정도)', en: 'Innovation $z - h$ (measurement minus prediction)' }} value={nuCm} min={-60} max={60} step={1} unit="cm" onChange={setNuCm} testId="ch6-tdoa-nu" src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} />
          <Slider label={{ ko: '필터가 가정하는 측정 노이즈 $\\sigma$ (이 데모 전용)', en: 'Measurement noise $\\sigma$ assumed by the filter (this demo only)' }} value={sigCm} min={2} max={60} step={1} unit="cm" onChange={setSigCm} testId="ch6-tdoa-sigma" src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 (실제) TDoA 노이즈를 빌려 왔을 뿐입니다.', en: 'Local to this demo; the starting value is merely borrowed from the (true) TDoA noise of the global settings.' })} />
          <Slider label={{ ko: '갱신 전 위치 불확실성 (축당 1σ)', en: 'Position uncertainty before the update (1σ per axis)' }} value={spCm} min={2} max={60} step={1} unit="cm" onChange={setSpCm} testId="ch6-tdoa-sp" src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} />
        </div>
        <StatRow>
          <Stat label={{ ko: '예측 측정값 $h$', en: 'Predicted measurement $h$' }} value={m.h} unit="m" src={SRC} />
          <Stat label={{ ko: '$\\|H\\|$ (0 ~ 2)', en: '$\\|H\\|$ (0 to 2)' }} value={hn} src={SRC} status={hn < 0.3 ? 'warn' : undefined} />
          <Stat label={{ ko: '혁신의 표준편차 $\\sqrt{S}$', en: 'Innovation std $\\sqrt{S}$' }} value={Math.sqrt(upd.S) * 100} unit="cm" src={UPD} />
          <Stat label={{ ko: '위치 보정 크기 $|\\Delta p|$', en: 'Position correction $|\\Delta p|$' }} value={Math.hypot(dp[0], dp[1], dp[2]) * 100} unit="cm" src={UPD} />
          <Stat label={{ ko: '측정 방향 불확실성: 전 → 후', en: 'Uncertainty along the measurement: before → after' }} value={`${fmt(spCm, 3)} → ${fmt(Math.sqrt(Math.max(varAfter, 0)) * 100, 3)}`} unit="cm" src={UPD} />
        </StatRow>
        <LineChart
          title={{ ko: '직선을 따라가며 본 두 거리와 그 차', en: 'The two distances and their difference along the line' }} xLabel={{ ko: '태그의 x 위치 [m]', en: 'Tag x position [m]' }} yLabel={{ ko: '거리 [m]', en: 'Distance [m]' }} height={230}
          series={[
            { name: { ko: 'dᵢ (앵커 0 까지)', en: 'dᵢ (to anchor 0)' }, x: sweep.xs, y: sweep.di, slot: 1, link: 'di' },
            { name: { ko: 'dⱼ (앵커 1 까지)', en: 'dⱼ (to anchor 1)' }, x: sweep.xs, y: sweep.dj, slot: 2, link: 'dj' },
            { name: { ko: 'h = dⱼ − dᵢ', en: 'h = dⱼ − dᵢ' }, x: sweep.xs, y: sweep.h, slot: 3, link: 'h', width: 3 },
          ]}
          refLines={[here, { y: 0 }]} src={SRC} testId="ch6-tdoa-chart" />
        <LineChart
          title={{ ko: '야코비안 H 의 위치 성분: 위치가 1 m 움직이면 측정이 몇 m 바뀌나', en: 'Position entries of the Jacobian H: metres of measurement change per metre of motion' }} xLabel={{ ko: '태그의 x 위치 [m]', en: 'Tag x position [m]' }} yLabel={{ ko: 'H 성분 [m/m]', en: 'Entry of H [m/m]' }} height={200}
          series={[
            { name: { ko: 'H 의 x 성분', en: 'x entry of H' }, x: sweep.xs, y: sweep.Hx, slot: 4, link: 'H' },
            { name: { ko: 'H 의 y 성분', en: 'y entry of H' }, x: sweep.xs, y: sweep.Hy, slot: 5, link: 'H' },
            { name: { ko: 'H 의 z 성분', en: 'z entry of H' }, x: sweep.xs, y: sweep.Hz, slot: 6, link: 'H' },
          ]}
          refLines={[here, { y: 0 }]} src={SRC} />
        <Caption>{tr({ ko: '노이즈 σ 를 키우면 이득이 줄어 같은 혁신에도 덜 움직이고, 갱신 전 불확실성을 키우면 측정을 더 믿어 많이 움직입니다. 보정은 항상 H 가 가리키는 방향으로만 일어납니다 — 측정 하나는 한 방향의 정보만 줍니다.', en: 'Raising σ lowers the gain, so the same innovation moves the estimate less; raising the prior uncertainty makes the filter trust the measurement more. The correction always lies along the direction of H — one measurement carries information in one direction only.' })}</Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch6-tdoa-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (아래 과제의 기준 구현입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference solution of the task below — keep it closed if you want to try first)' })}</summary>
          <CodeView code={tdoaUpdateTask.solution} links={tdoaUpdateTask.links} />
        </details>
      </Demo>
    </LinkGroup>
  );
}

// ───────────────────────── 데모 3: 평균을 내도 남는 것 ─────────────────────────
function AveragingDemo() {
  const cfg = config.value, b = budget.value;
  const [seed, setSeed] = useState(3);
  const mode = cfg.uwb.mode;
  const N = 150, RUNS = 16;
  // 입력을 내용으로 비교해 디바운스한다: 관계없는 전역 설정(예: 통신 경로)이 바뀌어도 다시 계산하지 않고,
  // 바뀌었을 때도 버튼이 눌린 모습이 먼저 그려진 뒤에 계산한다.
  const inp = useDebounced({ anchors: cfg.anchors, mode, sigmaMeas: b.sigmaMeas, center: [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height], delta: cfg.uwb.anchorSurveyError }, 200);
  const runSeed = useDebounced(seed, 30);
  // 좌표가 완벽한 경우는 측량 시드와 무관하므로 따로 기억해 둔다(다시 측량하기는 절반만 계산)
  // (두 실험을 서로 다른 때에 돌려 메인 스레드를 한 번에 오래 잡지 않게 한다)
  const inpGood = useDebounced(inp, 60);
  const good = useMemo(() => averagingExperiment(inpGood.anchors, inpGood.anchors, inpGood.mode, inpGood.center, inpGood.sigmaMeas, N, 103, RUNS), [inpGood]);
  const bad = useMemo(() => averagingExperiment(inp.anchors, perturbAnchors(inp.anchors, inp.delta, runSeed), inp.mode, inp.center, inp.sigmaMeas, N, runSeed + 100, RUNS), [inp, runSeed]);
  const run = { bad, good };
  const s1 = b.dop.hdop * b.sigmaMeas; // 한 번 풀었을 때의 수평 오차(RMS)
  const cm = (a: number[]) => a.map((v) => v * 100);
  const SRC = der('ch6#anchor-error', { ko: '강당 한가운데에서 위치를 150번 풀어 누적 평균하는 실험을 16번 반복한 RMS(잡음의 부호만 뒤집은 짝을 포함). 앵커 좌표 오차는 전역 설정값(축당 1σ)으로 한 벌 뽑았습니다.', en: 'Simulation: 150 position fixes at the hall centre with a running mean, RMS over 16 repetitions (including sign-flipped noise pairs). One set of anchor errors is drawn with the global setting (1σ per axis).' });
  return (
    <Demo title={{ ko: '평균을 내면 노이즈는 줄지만 편향은 남는다', en: 'Averaging shrinks noise but leaves the bias' }} testId="ch6-avg-demo">
      <P ko={`강당 한가운데에 태그를 가만히 두고 위치를 여러 번 풀어 평균합니다. 측정 노이즈는 매번 새로 뽑지만(1σ = ${fmt(b.sigmaMeas * 100, 3)} cm{{ex:${mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'}}}), 시스템이 믿는 앵커 좌표는 **한 번 잘못 입력된 채 그대로**입니다(축당 {{cfg:uwb.anchorSurveyError}}).`}
        en={`Leave a tag still at the hall centre, solve its position many times and average. The measurement noise is drawn afresh every time (1σ = ${fmt(b.sigmaMeas * 100, 3)} cm{{ex:${mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'}}}), but the anchor coordinates the system believes stay **wrong in the same way** ({{cfg:uwb.anchorSurveyError}} per axis).`} />
      <div class="btn-row" style={{ marginBottom: '8px' }}>
        <Button onClick={() => setSeed(seed + 1)} testId="ch6-avg-seed">{tr({ ko: '앵커를 다시 측량하기 (다른 오차 한 벌)', en: 'Survey the anchors again (another set of errors)' })}</Button>
      </div>
      <LineChart
        title={{ ko: 'N 번 평균한 위치의 수평 오차', en: 'Horizontal error of the mean of N fixes' }} xLabel={{ ko: '평균한 횟수 N', en: 'Number of fixes averaged, N' }} yLabel={{ ko: '수평 오차 [cm]', en: 'Horizontal error [cm]' }} height={250}
        series={[
          { name: { ko: '좌표 오차 있음 (시뮬레이션)', en: 'With survey error (simulation)' }, x: run.bad.n, y: cm(run.bad.err), slot: 2, dash: '' },
          { name: { ko: '이론: √(b² + σ₁²/N)', en: 'Theory: √(b² + σ₁²/N)' }, x: run.bad.n, y: run.bad.n.map((n) => 100 * Math.hypot(run.bad.biasH, s1 / Math.sqrt(n))), slot: 2, dash: '7 4' },
          { name: { ko: '좌표가 완벽함 (시뮬레이션)', en: 'Perfect coordinates (simulation)' }, x: run.good.n, y: cm(run.good.err), slot: 1, dash: '' },
          { name: { ko: '이론: σ₁/√N', en: 'Theory: σ₁/√N' }, x: run.good.n, y: run.good.n.map((n) => (100 * s1) / Math.sqrt(n)), slot: 1, dash: '2 3' },
          { name: { ko: `이 측량의 편향 b = ${fmt(run.bad.biasH * 100, 3)} cm`, en: `Bias of this survey b = ${fmt(run.bad.biasH * 100, 3)} cm` }, x: [1, N], y: [run.bad.biasH * 100, run.bad.biasH * 100], slot: 8, dash: '4 2 1 2', width: 1.5 },
        ]}
        yDomain={[0, Math.max(3 * run.bad.biasH, 1.2 * s1) * 100]} src={SRC} testId="ch6-avg-chart" />
      <p class="small muted">{tr({ ko: '반복 횟수 16번과 평균 횟수 150번은 이 실험의 고정값입니다.', en: 'The 16 repetitions and 150 fixes are fixed values of this experiment.' })}<SrcBadge src={ex(undefined, { ko: '이 실험의 고정값', en: 'Fixed for this experiment' })} /></p>
      <Caption>{tr({ ko: 'σ₁ 은 위치를 한 번 풀었을 때의 수평 오차(HDOP × 측정 노이즈)입니다. 실선은 같은 실험을 16번(이 실험의 고정값) 반복한 RMS 이고 파선·점선은 이론값입니다. 좌표가 완벽하면 오차가 1/√N 로 0 을 향해 가지만, 좌표가 틀리면 b 에서 멈춥니다.', en: 'σ₁ is the horizontal error of a single fix (HDOP × measurement noise). Solid lines are the RMS over 16 repetitions of the experiment (fixed for this demo); dashed and dotted lines are theory. With perfect coordinates the error heads to 0 as 1/√N; with wrong coordinates it stops at b.' })}</Caption>
    </Demo>
  );
}

// ───────────────────────── 함정 실험실: 앵커 좌표를 잘못 입력하기 ─────────────────────────
const BLUNDERS: { value: Blunder; label: L }[] = [
  { value: 'none', label: { ko: '큰 실수 없음', en: 'No blunder' } },
  { value: 'swap-ids', label: { ko: '앵커 0 ↔ 1 번호 바뀜', en: 'IDs of anchors 0 ↔ 1 swapped' } },
  { value: 'height', label: { ko: '앵커 2 높이 +30 cm', en: 'Anchor 2 height +30 cm' } },
  { value: 'swap-xy', label: { ko: '앵커 1 의 x, y 바뀜', en: 'x and y of anchor 1 swapped' } },
];

function SurveyPitfall() {
  const cfg = config.value, b = budget.value;
  const [sigCm, setSigCm] = useState(cfg.uwb.anchorSurveyError * 100);
  const [seed, setSeed] = useState(1);
  const [blunder, setBlunder] = useState<Blunder>('none');
  const prm = useDebounced({ sigCm, seed, blunder }, 160);
  const mode = cfg.uwb.mode, z = cfg.formation.height;
  const NX = 20, NY = 15;
  // 전역 설정은 내용으로 비교해 디바운스한다(관계없는 설정이 바뀌면 다시 풀지 않고, 위 데모와 다른 때에 계산한다)
  const g = useDebounced({ anchors: cfg.anchors, mode, hall: cfg.hall, z }, 320);
  const believed = useMemo(() => applyBlunder(perturbAnchors(g.anchors, prm.sigCm / 100, prm.seed), prm.blunder), [g, prm]);
  const field = useMemo(() => biasField(g.anchors, believed, g.mode, g.hall, g.z, NX, NY), [g, believed]);
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, z];
  const th = surveyBiasTheory(cfg.anchors, mode, center, prm.sigCm / 100);
  const rule = b.dop.hdop * prm.sigCm; // 예산의 규칙 DOP·δ [cm]
  const maxCm = field.maxH * 100;
  const hmax = Math.max(0.5, prm.blunder === 'none' ? maxCm : Math.min(maxCm, 100));
  const SIM = der('ch6#anchor-error', { ko: '참 앵커 좌표로 잡음 없는 측정을 만들고, 잘못 입력한 좌표로 위치를 풀어 본 시뮬레이션(비행 높이의 격자점)', en: 'Simulation: noise-free measurements from the true anchors, solved with the wrongly entered coordinates (grid at flight height)' });
  const stepX = Math.ceil(NX / 10), stepY = Math.ceil(NY / 8);
  return (
    <Pitfall title={{ ko: '앵커 좌표를 몇 cm 잘못 재서 입력하기', en: 'Entering anchor coordinates that are a few cm off' }} testId="ch6-pitfall">
      <P ko="앵커를 벽에 달고 줄자나 레이저 거리계로 좌표를 잽니다. 이 좌표가 틀리면 시스템은 틀린 줄 모릅니다. 여기서는 전역 설정의 앵커 위치를 **참값**으로 두고, 시스템이 **믿는** 좌표만 흐트러뜨립니다. 색은 비행 높이에서 그 자리의 수평 위치 편향, 화살표는 편향의 방향입니다."
        en="You mount the anchors and measure their coordinates with a tape or a laser rangefinder. If these are wrong the system has no way of knowing. Here the anchor positions of the global settings are the **truth** and only the coordinates the system **believes** are disturbed. Colour is the horizontal position bias at flight height at that spot; arrows show its direction." />
      <div class="controls">
        <Slider label={{ ko: '좌표 측량 오차 (축당 1σ)', en: 'Survey error (1σ per axis)' }} value={sigCm} min={0} max={15} step={0.5} unit="cm" onChange={setSigCm} testId="ch6-pitfall-sigma"
          src={ex('uwb.anchorSurveyError', { ko: '이 실험에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this lab; starts from the global setting.' })} />
      </div>
      <Segmented label={{ ko: '여기에 흔한 큰 실수 하나 더하기', en: 'Add one classic blunder on top' }} value={blunder} onChange={setBlunder} options={BLUNDERS} testId="ch6-pitfall-blunder" />
      <p class="small muted">{tr({ ko: '실수의 크기(높이 +30 cm 등)와 그림에서 앵커를 따로 표시하는 문턱(20 cm)은 이 실험의 고정값입니다.', en: 'The blunder sizes (height +30 cm etc.) and the 20 cm threshold for marking an anchor in the plan are fixed values of this lab.' })}<SrcBadge src={ex(undefined, { ko: '이 실험의 고정값', en: 'Fixed for this lab' })} /></p>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => setSeed(seed + 1)} testId="ch6-pitfall-seed">{tr({ ko: '다시 측량하기 (다른 오차 한 벌)', en: 'Survey again (another set of errors)' })}</Button>
        <span class="small muted">{tr({ ko: `측위 모드: ${mode === 'twr' ? 'TWR' : 'TDoA'} · 높이 ${fmt(z)} m (전역 설정)`, en: `Mode: ${mode === 'twr' ? 'TWR' : 'TDoA'} · height ${fmt(z)} m (global settings)` })}<SrcBadge src={ex('formation.height')} /></span>
      </div>
      <PlanView
        hall={cfg.hall} anchors={cfg.anchors} src={SIM} testId="ch6-pitfall-plan"
        heat={{ values: field.horiz.map((row) => row.map((v) => v * 100)), min: 0, max: hmax, label: { ko: '수평 위치 편향', en: 'Horizontal position bias' }, unit: 'cm' }}
        caption={tr({ ko: '마름모 = 앵커의 참 위치. 빈 원과 점선 = 시스템이 믿는 위치가 20 cm 넘게 어긋난 앵커. 화살표 길이는 편향 크기에 비례합니다(색 눈금의 최댓값에서 격자 한 칸).', en: 'Diamonds = true anchor positions. Hollow circle and dashed line = an anchor whose believed position is off by more than 20 cm. Arrow length is proportional to the bias (one grid cell at the top of the colour scale).' })}>
        {(s) => (
          <g pointer-events="none">
            {field.ys.map((y, j) => field.xs.map((x, i) => {
              if (i % stepX !== Math.floor(stepX / 2) || j % stepY !== Math.floor(stepY / 2)) return null;
              const e = field.vec[j][i], mag = Math.hypot(e[0], e[1]);
              if (!Number.isFinite(mag) || mag < 1e-6) return null;
              const cell = (cfg.hall.x / NX) * stepX * s.k * 0.9;
              const len = Math.min(1, (mag * 100) / hmax) * cell;
              const ux = e[0] / mag, uy = -e[1] / mag; // 화면의 y 는 아래쪽이 +
              const x0 = s.sx(x), y0 = s.sy(y), x1 = x0 + ux * len, y1 = y0 + uy * len;
              const head = `${x1 + ux * 4},${y1 + uy * 4} ${x1 - uy * 3},${y1 + ux * 3} ${x1 + uy * 3},${y1 - ux * 3}`;
              // 바탕색 외곽선을 먼저 그려, 색 지도의 밝은 끝(다크 테마의 흰 화살표)이나 어두운 끝에서도 화살표가 보이게 한다
              return (
                <g key={`${i}-${j}`}>
                  <g stroke="var(--surface)" stroke-width="3.6" fill="var(--surface)" stroke-linejoin="round" stroke-linecap="round">
                    <circle cx={x0} cy={y0} r="1.6" />
                    <line x1={x0} y1={y0} x2={x1} y2={y1} />
                    {len > 5 && <polygon points={head} />}
                  </g>
                  <g stroke="var(--text)" stroke-width="1.4" fill="var(--text)">
                    <circle cx={x0} cy={y0} r="1.6" stroke="none" />
                    <line x1={x0} y1={y0} x2={x1} y2={y1} />
                    {len > 5 && <polygon stroke="none" points={head} />}
                  </g>
                </g>
              );
            }))}
            {believed.map((a, i) => (Math.hypot(a[0] - cfg.anchors[i][0], a[1] - cfg.anchors[i][1], a[2] - cfg.anchors[i][2]) > 0.2 ? (
              <g key={`b${i}`}>
                <line x1={s.sx(cfg.anchors[i][0])} y1={s.sy(cfg.anchors[i][1])} x2={s.sx(a[0])} y2={s.sy(a[1])} stroke="var(--critical)" stroke-width="2" stroke-dasharray="5 4" />
                <circle cx={s.sx(a[0])} cy={s.sy(a[1])} r="9" fill="none" stroke="var(--critical)" stroke-width="2.5" />
              </g>
            ) : null))}
          </g>
        )}
      </PlanView>
      <StatRow>
        <Stat label={{ ko: '수평 편향: 강당 평균', en: 'Horizontal bias: hall mean' }} value={field.meanH * 100} unit="cm" src={SIM} />
        <Stat label={{ ko: '수평 편향: 강당 최대', en: 'Horizontal bias: hall maximum' }} value={field.maxH * 100} unit="cm" src={SIM} status={field.maxH > 0.1 ? 'bad' : field.maxH > 0.05 ? 'warn' : undefined} />
        <Stat label={{ ko: '수직 편향: 강당 평균', en: 'Vertical bias: hall mean' }} value={field.meanV * 100} unit="cm" src={SIM} />
        <Stat label={{ ko: '예산의 규칙 HDOP·δ (한가운데)', en: 'Budget rule HDOP·δ (centre)' }} value={rule} unit="cm" src={der('ch6#anchor-error', { ko: '강당 한가운데의 HDOP × 위 슬라이더의 δ', en: 'HDOP at the hall centre × δ from the slider above' })} />
        <Stat label={{ ko: '선형 이론 RMS (한가운데)', en: 'Linear theory RMS (centre)' }} value={th.rmsH * 100} unit="cm" src={der('ch6#anchor-error', { ko: '유도의 공분산 식에 지금 앵커 배치와 δ 를 넣은 값', en: 'The covariance formula of the derivation with the current layout and δ' })} />
      </StatRow>
      <p>
        {field.failed > 0
          ? <Status kind="bad">{tr({ ko: `격자점 ${field.total}개 중 ${field.failed}개에서 풀이가 발산했습니다 (체크무늬) — 좌표끼리 서로 모순됩니다`, en: `The solver diverged at ${field.failed} of ${field.total} grid points (checkerboard) — the coordinates contradict each other` })}</Status>
          : prm.blunder !== 'none'
            ? <Status kind="warn">{tr({ ko: '풀이는 되지만 편향이 한쪽에 몰려 있습니다. 평균만 보면 놓칩니다', en: 'It solves, but the bias is concentrated on one side. Looking at the mean alone hides it' })}</Status>
            : <Status kind="good">{tr({ ko: '큰 실수가 없으면 편향은 측량 오차와 같은 크기 정도입니다', en: 'Without a blunder the bias is about as large as the survey error itself' })}</Status>}
      </p>
      <List items={[
        { ko: '**무작위 오차만 있을 때**: 편향은 δ 와 같은 자릿수이고, 강당 안에서 **천천히** 변합니다. 그래서 가까이 있는 두 기체는 거의 같은 방향으로 함께 밀립니다.', en: '**Random error only**: the bias is of the same order as δ and varies **slowly** across the hall, so two vehicles close together are pushed almost the same way.' },
        { ko: '**번호가 바뀌었을 때**: 측정은 맞는데 엉뚱한 좌표에 연결됩니다. 편향이 m 단위가 되거나 풀이가 발산합니다. 생기기 쉽고 가장 위험한 실수이지만, 그만큼 크게 틀리므로 지상 점검에서 바로 드러납니다.', en: '**Swapped IDs**: correct measurements are tied to the wrong coordinates. The bias reaches metres or the solver diverges. An easy and very dangerous mistake to make, but it is so large that a ground check exposes it at once.' },
        { ko: '**한 앵커의 높이가 30 cm 틀렸을 때**: 평균은 조금 늘 뿐이지만 그 앵커 근처에서 편향이 커집니다. 눈에 잘 안 띄어서 오히려 오래 남는 실수입니다.', en: '**One anchor 30 cm off in height**: the mean barely grows, but the bias gets large near that anchor. Hard to notice, which is exactly why it survives.' },
        { ko: '**x 와 y 를 바꿔 넣었을 때**: 한 앵커만 바뀌면 번호가 바뀐 것과 비슷하게 무너집니다. 모든 앵커를 똑같이 바꿔 넣으면 풀이는 멀쩡하지만 지도 전체가 뒤집혀, +x 로 가라는 명령에 기체가 실제로는 +y 로 갑니다.', en: '**x and y swapped**: for a single anchor it breaks much like swapped IDs. If every anchor is swapped the same way the solution looks fine but the whole map is mirrored: commanded +x, the vehicle really moves along +y.' },
      ]} />
      <McPanel
        title={{ ko: '측량을 여러 번 다시 했을 때, 강당 한가운데의 수평 편향 분포', en: 'Distribution of the horizontal bias at the hall centre over repeated surveys' }}
        experiment="ch6-survey" metric="biasH" testId="ch6-mc" defaultRuns={1000}
        params={{ anchors: cfg.anchors, mode, p: center, sigma: prm.sigCm / 100, spacing: cfg.formation.spacing }}
        xLabel={{ ko: '수평 편향 [cm]', en: 'Horizontal bias [cm]' }} src={SIM}
        refLines={[
          { x: rule, label: { ko: '예산의 규칙 HDOP·δ', en: 'Budget rule HDOP·δ' }, slot: 4 },
          { x: th.rmsH * 100, label: { ko: '선형 이론 RMS', en: 'Linear theory RMS' }, slot: 2 },
        ]}
        note={{ ko: '한 번의 실행 = 앵커 전체를 한 번 측량한 것(오차 한 벌). 큰 실수는 넣지 않고 위 슬라이더의 무작위 오차만 씁니다. 이웃 기체는 x 방향으로 대형 간격 {{cfg:formation.spacing}} 만큼 떨어져 있다고 봅니다.', en: 'One run = one survey of all anchors (one set of errors). No blunder, only the random error of the slider above. The neighbour is taken to be one formation spacing, {{cfg:formation.spacing}}, away along x.' }}>
        {(res) => {
          const rmsOf = (k: string) => Math.sqrt(res.reduce((s, r) => s + r[k] * r[k], 0) / res.length);
          const abs = rmsOf('biasH'), rel = rmsOf('relH');
          const MC = der('ch6#anchor-error', { ko: '위 반복 실행 결과의 RMS', en: 'RMS over the runs above' });
          return (
            <>
              <StatRow>
                <Stat label={{ ko: '절대 편향 RMS (시뮬레이션)', en: 'Absolute bias RMS (simulation)' }} value={abs} unit="cm" src={MC} />
                <Stat label={{ ko: '선형 이론 RMS', en: 'Linear theory RMS' }} value={th.rmsH * 100} unit="cm" src={der('ch6#anchor-error')} />
                <Stat label={{ ko: '두 기체 사이 간격의 편향 RMS', en: 'Bias of the spacing between two vehicles, RMS' }} value={rel} unit="cm" src={MC} status="good" />
                <Stat label={{ ko: '간격 편향 / 절대 편향', en: 'Spacing bias / absolute bias' }} value={abs > 0 ? (100 * rel) / abs : 0} unit="%" src={MC} />
              </StatRow>
              <P ko="두 기체가 공유하는 편향은 간격에서는 서로 지워집니다. 그래서 앵커 좌표 오차는 **강당 안의 절대 위치**(벽, 사람, 착륙 지점과의 거리)에는 그대로 나타나지만, **기체 사이 간격**에는 일부만 나타납니다."
                en="The bias two vehicles share cancels in their spacing. So anchor coordinate error shows up in full in the **absolute position in the hall** (distance to walls, people, landing pads) but only partly in the **spacing between vehicles**." />
            </>
          );
        }}
      </McPanel>
    </Pitfall>
  );
}

// ───────────────────────── 본문 ─────────────────────────
function Body() {
  const cfg = config.value, b = budget.value;
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const mode = cfg.uwb.mode;
  const th5 = surveyBiasTheory(cfg.anchors, mode, center, 0.05);
  const thNow = surveyBiasTheory(cfg.anchors, mode, center, cfg.uwb.anchorSurveyError);
  const ruleNow = b.dop.hdop * cfg.uwb.anchorSurveyError;
  let far = 0, farD = [0, 0, 0];
  for (const a of cfg.anchors) for (const [x, y] of [[0, 0], [cfg.hall.x, 0], [0, cfg.hall.y], [cfg.hall.x, cfg.hall.y]]) {
    const d = dist(a, [x, y, cfg.formation.height]);
    if (d > far) { far = d; farD = [Math.abs(a[0] - x), Math.abs(a[1] - y), Math.abs(a[2] - cfg.formation.height)]; }
  }
  const L999 = burstLengthQuantile(cfg.comm.loss, 1e-3), hops = commHops(cfg), Tc = 1 / cfg.comm.rate;
  const worstAge = cfg.estimation.latency + b.ageMax;
  const item = (id: string) => b.items.find((i) => i.id === id)!;
  const BIAS = der('ch6#anchor-error', { ko: '예산의 규칙 DOP × δ (현재 설정, 강당 한가운데)', en: 'The budget rule DOP × δ (current settings, hall centre)' });
  return (
    <>
      <Section id="roles" title={{ ko: '누가 무엇을 하는가', en: 'Who does what' }}>
        <P ko="1~5장에서 거리 측정, 위치 풀이, 이상치 처리, IMU 융합을 따로따로 배웠습니다. 이 장에서는 그 조각들이 실제 장비의 **어디에서** 도는지를 봅니다. 장비는 아래 표의 네 덩어리입니다(Crazyradio 와 지상 PC 는 한 줄로 묶었습니다)."
          en="Chapters 1–5 covered ranging, position solving, outlier handling and IMU fusion one by one. This chapter shows **where** in the real equipment each piece runs. The equipment comes in the four groups of the table below (Crazyradio and ground PC share one row)." />
        <Predict id="ch6-where-computed"
          question={{ ko: 'UWB(Loco Positioning System)로 나는 Crazyflie 한 대가 자세 제어와 위치 제어에 쓰는 "내 위치"는 어디에서 계산될까요?', en: 'A Crazyflie flying on UWB (Loco Positioning System) uses "my position" for its control loops. Where is that position computed?' }}
          choices={[
            { label: { ko: '지상 PC — 모든 기체의 위치를 PC 가 계산해 무선으로 올려 준다', en: 'On the ground PC — it computes every vehicle’s position and radios it up' } },
            { label: { ko: '기체 안 — 덱이 받은 UWB 측정을 기체의 추정기가 IMU 와 합친다', en: 'Onboard — the vehicle’s estimator fuses the UWB measurements from the deck with the IMU' }, correct: true },
            { label: { ko: '앵커 — 앵커들이 기체의 위치를 계산해 UWB 로 알려 준다', en: 'In the anchors — they compute the vehicle’s position and send it over UWB' } },
          ]}
          explain={{
            ko: '**기체 안**입니다. Loco 덱처럼 위치 정보를 주는 덱을 쓰면 기체의 확장 칼만 필터(EKF)가 추정을 맡습니다{{lit:cf-firmware-docs/ekf-for-loco}}. TDoA 모드에서 앵커는 기체가 있는지조차 모르고 패킷만 보내며, 기체는 듣기만 합니다{{lit:lps-docs/tdoa-passive-unlimited-tags}}. 지상 PC 는 위치를 계산하지 않고, 기체가 내려보내는 로그를 **받아 볼** 뿐입니다(그것을 이웃 기체에 다시 보내 주는 중계는 아래 그림에서 교재가 가정한 구성입니다). 이 구조가 지연이 걸리는 자리를 정합니다.',
            en: '**Onboard.** With a deck that provides position information, such as the Loco deck, the vehicle’s extended Kalman filter (EKF) does the estimation{{lit:cf-firmware-docs/ekf-for-loco}}. In TDoA mode the anchors do not even know a vehicle exists; they only transmit, and the vehicle only listens{{lit:lps-docs/tdoa-passive-unlimited-tags}}. The ground PC computes no position; it merely **receives** the log each vehicle sends down (relaying it on to neighbour vehicles is a configuration this textbook assumes in the figure below). This structure decides where the delay sits.',
          }} />
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '장비', en: 'Equipment' })}</th><th>{tr({ ko: '하는 일', en: 'What it does' })}</th><th>{tr({ ko: '교재의 어느 장', en: 'Chapter' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '앵커', en: 'Anchors' })}</b></td><td><T ko="강당에 고정된 UWB 무전기. **자기 좌표를 알고** 패킷을 보낸다(TDoA 2 에서는 정해진 시간 슬롯 순서로, TDoA 3 에서는 무작위 일정으로{{lit:lps-docs/tdoa3-scalable}}). 측위 모드는 TWR, TDoA 2, TDoA 3 세 가지{{lit:lps-docs/three-modes}}이고 TDoA 2 는 앵커를 8개까지{{lit:lps-docs/tdoa2-max-anchors}} 쓴다." en="UWB radios fixed in the hall. They **know their own coordinates** and transmit (in fixed time slots in TDoA 2, on a random schedule in TDoA 3{{lit:lps-docs/tdoa3-scalable}}). There are three positioning modes, TWR, TDoA 2 and TDoA 3{{lit:lps-docs/three-modes}}; TDoA 2 uses up to 8 anchors{{lit:lps-docs/tdoa2-max-anchors}}." /></td><td><a href="#/ch/1">1</a>–<a href="#/ch/3">3</a></td></tr>
              <tr><td><b>{tr({ ko: 'Loco 덱', en: 'Loco deck' })}</b></td><td><T ko="Crazyflie 위에 꽂는 UWB 무전기(**덱**(deck) = Crazyflie 에 꽂는 확장 보드). 측위에서는 **태그**(tag)라고 부른다. TDoA 에서는 앵커 패킷을 듣기만 하므로 기체가 몇 대든 서로 방해하지 않는다{{lit:lps-docs/tdoa-passive-unlimited-tags}}." en="A UWB radio plugged onto the Crazyflie (a **deck** is an expansion board for the Crazyflie); in positioning terms the **tag**. In TDoA it only listens to anchor packets, so any number of vehicles can share the system without disturbing each other{{lit:lps-docs/tdoa-passive-unlimited-tags}}." /></td><td><a href="#/ch/3">3</a></td></tr>
              <tr><td><b>{tr({ ko: '온보드 추정기', en: 'Onboard estimator' })}</b></td><td><T ko="기체의 마이크로컨트롤러에서 도는 EKF. UWB 측정과 IMU 를 합쳐 위치·속도·자세를 추정하고{{lit:cf-firmware-docs/ekf-for-loco}}, 그 값을 같은 기체의 제어기가 바로 쓴다." en="An EKF running on the vehicle’s microcontroller. It fuses UWB measurements with the IMU into position, velocity and attitude{{lit:cf-firmware-docs/ekf-for-loco}}, which the controller on the same vehicle uses directly." /></td><td><a href="#/ch/4">4</a>, <a href="#/ch/5">5</a></td></tr>
              <tr><td><b>{tr({ ko: 'Crazyradio + 지상 PC', en: 'Crazyradio + ground PC' })}</b></td><td><T ko="PC 에 꽂는 2.4 GHz USB 무전기(Crazyradio PA 기준{{lit:crazyswarm2017/radio-hw}}. 우리 기체의 무선도 2.4 GHz 이고 Crazyradio PA 와 시험되었습니다{{lit:cfbl-datasheet/mcu-radio}})와, 그 PC 에서 도는 **Crazyswarm2**(ROS 2 기반{{lit:crazyswarm2-docs/ros2-based}}. ROS 2 = 로봇 프로그램들이 메시지를 주고받는 틀, 장 끝 절). 명령과 궤적을 올려 보내고 로그를 내려받는다. UWB 와는 **다른 무선**이다." en="A 2.4 GHz USB radio on the PC (as described for the Crazyradio PA{{lit:crazyswarm2017/radio-hw}}; our vehicle's radio is also 2.4 GHz and was tested with a Crazyradio PA{{lit:cfbl-datasheet/mcu-radio}}) and **Crazyswarm2** (built on ROS 2{{lit:crazyswarm2-docs/ros2-based}}; ROS 2 = a framework in which robot programs exchange messages, last section) running on that PC. It sends commands and trajectories up and receives logs. This is a **different radio** from UWB." /></td><td><a href="#/ch/7">7</a></td></tr>
            </tbody>
          </table>
        </div>
        <h3>{tr({ ko: '모션캡처 방식과 무엇이 다른가', en: 'How this differs from a motion-capture setup' })}</h3>
        <P ko="원래의 Crazyswarm 은 **모션캡처**(motion capture, 천장의 카메라들이 기체에 붙인 마커를 보고 위치를 재는 장비)를 썼습니다. 그 구조에서는 위치를 **지상에서 재서**, 지상 PC 가 모든 기체의 **pose**(위치 + 자세)를 무선으로 10 ms 마다(100 Hz) 방송합니다{{lit:crazyswarm2017/mocap-by-radio}}. 기체는 무선으로 받은 그 pose 를 IMU 와 합칩니다. 추정기 자체는 그때도 기체 안에 있었습니다{{lit:crazyswarm2017/onboard-estimation}}."
          en="The original Crazyswarm used **motion capture** (ceiling cameras that track markers on each vehicle). There the position is **measured on the ground** and the ground PC broadcasts every vehicle’s **pose** (position + attitude) by radio every 10 ms (100 Hz){{lit:crazyswarm2017/mocap-by-radio}}. The vehicle fuses that radioed pose with its IMU; the estimator itself was onboard even then{{lit:crazyswarm2017/onboard-estimation}}." />
        <P ko="UWB 에서는 위치 **측정**부터 기체 안에서 이루어집니다. 그래서 자기 위치에는 Crazyradio 의 지연이나 패킷 손실이 끼어들지 않습니다. 대신 지상 PC 는 기체가 알려 주기 전까지 그 기체가 어디 있는지 모릅니다. 그 대가로 정확도는 낮습니다: LPS 의 정확도는 10 cm 수준{{lit:lps-docs/accuracy}}이고, Crazyswarm 의 저자들이 모션캡처를 고른 이유도 UWB 의 오차가 조밀한 대형에는 크다는 것이었습니다{{lit:crazyswarm2017/uwb-comparison}}."
          en="With UWB even the position **measurement** happens onboard. So the Crazyradio’s delay and packet loss never touch a vehicle’s own position. In return the ground PC does not know where a vehicle is until the vehicle says so. The price is accuracy: LPS is accurate at the 10 cm level{{lit:lps-docs/accuracy}}, and the Crazyswarm authors chose motion capture precisely because UWB errors were large for dense formations{{lit:crazyswarm2017/uwb-comparison}}." />
        <Note>
          <P ko={`**우리 기체.** Crazyflie 2.1 Brushless 는 모터 중심 간 대각 100 mm{{lit:cfbl-datasheet/frame-size}}, 이륙 중량은 프로펠러 가드를 달면 37 g{{lit:cfbl-datasheet/takeoff-weight-guards}}(랜딩 레그만 달면 34 g{{lit:cfbl-datasheet/takeoff-weight-legs}}), 기본 배터리(350 mAh{{lit:cfbl-datasheet/battery}}) 비행 시간은 10분{{lit:cfbl-datasheet/flight-time}}입니다. 모터는 08028-10000KV 브러시리스{{lit:cfbl-datasheet/motor}}, IMU 는 BMI088{{lit:cfbl-datasheet/imu}}, 무선은 2.4 GHz 대역의 nRF51822{{lit:cfbl-datasheet/mcu-radio}}입니다. 권장 최대 탑재 중량은 40 g{{lit:cfbl-datasheet/max-payload}}입니다. Loco 덱의 무게는 이 교재가 확인한 문헌에 없으니 직접 달아 40 g 과 비교하세요. 10분은 탑재물 없이 기본 배터리로 낸 값이므로, 덱을 얹으면 비행 시간은 줄어듭니다(얼마나 줄지는 확인한 수치가 없습니다).`}
            en={`**Our vehicle.** The Crazyflie 2.1 Brushless measures 100 mm motor-to-motor diagonally{{lit:cfbl-datasheet/frame-size}}; take-off weight is 37 g with propeller guards{{lit:cfbl-datasheet/takeoff-weight-guards}} (34 g with landing legs only{{lit:cfbl-datasheet/takeoff-weight-legs}}), and the stock battery (350 mAh{{lit:cfbl-datasheet/battery}}) gives 10 minutes of flight{{lit:cfbl-datasheet/flight-time}}. Motors are 08028-10000KV brushless{{lit:cfbl-datasheet/motor}}, the IMU is a BMI088{{lit:cfbl-datasheet/imu}}, the radio an nRF51822 in the 2.4 GHz band{{lit:cfbl-datasheet/mcu-radio}}. The recommended maximum payload is 40 g{{lit:cfbl-datasheet/max-payload}}. The Loco deck’s weight is not in the literature this textbook verified — weigh it and compare with 40 g. The 10 minutes are for the stock battery without payload, so flight time drops with the deck on (by how much is not in the verified figures).`} />
          <P ko={`**강당이 크다는 점.** 제품 페이지에 적힌 UWB 최대 시험 거리는 10 m 이고, 표준 설정의 실내 실측은 기체 수평 방향 8–10 m, TDoA 3 의 Long Range 모드는 체계적인 측정 없이 30–40 m 정도로 추정됩니다{{lit:lps-docs/range}}. 지금 설정의 강당에서는 비행 높이의 구석에서 가장 먼 앵커까지 $\\sqrt{${fmt(farD[0], 3)}^2 + ${fmt(farD[1], 3)}^2 + ${fmt(farD[2], 3)}^2} \\approx$ ${fmt(far, 3)} m{{der:ch6#meas-model|아래 d_i 식에 강당 네 구석(비행 높이)과 각 앵커의 좌표를 넣은 값 중 최댓값|The d_i formula below for the four hall corners (at flight height) and every anchor; the largest value}} 입니다. 표준 설정으로 시험된 거리보다 멀므로, 먼 구석에 기체를 놓고 위치가 안정적으로 나오는지(9장 실험 1 과 같은 정지 로그)를 **직접 확인**해야 합니다. 이 교재는 앵커별 패킷 수신을 세는 절차는 주지 못합니다.`}
            en={`**The hall is large.** The maximum tested UWB range on the product page is 10 m; indoor measurements with the standard settings give 8–10 m horizontally, and the TDoA 3 Long Range mode is estimated, without systematic measurement, at about 30–40 m{{lit:lps-docs/range}}. In the hall of the current settings, the farthest anchor from a corner at flight height is $\\sqrt{${fmt(farD[0], 3)}^2 + ${fmt(farD[1], 3)}^2 + ${fmt(farD[2], 3)}^2} \\approx$ ${fmt(far, 3)} m{{der:ch6#meas-model|아래 d_i 식에 강당 네 구석(비행 높이)과 각 앵커의 좌표를 넣은 값 중 최댓값|The d_i formula below for the four hall corners (at flight height) and every anchor; the largest value}} away. That is beyond the range tested with standard settings, so place a vehicle in the far corner and **check** that its position comes out stable (a static log as in experiment 1 of chapter 9). This textbook gives no procedure for counting packets per anchor.`} />
        </Note>
      </Section>

      <Section id="flow" title={{ ko: '정보가 흐르는 길', en: 'The path the information takes' }}>
        <P ko="네 장비(와 교재가 가정한 이웃 기체)를 화살표로 이으면 아래 그림이 됩니다. 화살표마다 **갱신율**(1초에 몇 번 새 값이 건너가는가, Hz)과 **지연**(보낸 뒤 쓸 수 있을 때까지의 시간, ms)이 있습니다."
          en="Joining the four pieces (and a neighbour vehicle assumed by the textbook) with arrows gives the picture below. Every arrow has an **update rate** (how many new values cross per second, Hz) and a **delay** (time from sending until usable, ms)." />
        <FlowDemo />
        <Derivation id="ages" title={{ ko: '정보의 나이를 더하는 법', en: 'Adding up the age of information' }}>
          <P ko="어떤 값의 **나이**는, 그 값이 가리키는 순간부터 그 값을 쓰는 순간까지 흐른 시간입니다. 화살표를 따라가며 지연을 더하면 됩니다. 기호: $\tau_{\text{est}}$ = 측정이 추정값에 반영되어 제어기에 닿기까지의 지연, $\tau_c$ = 무선 한 구간의 지연, $T_c$ = 방송 주기(갱신율의 역수), $n$ = 건너는 무선 구간 수. 이 그림의 숫자는 위 데모처럼 여기에 지상 PC 계산 시간 $\tau_{\text{PC}}$ 를 더해 볼 수 있지만, 오차 예산에는 그 항이 없습니다."
            en="The **age** of a value is the time from the instant it describes until the instant it is used. Follow the arrows and add the delays. Symbols: $\tau_{\text{est}}$ = delay until a measurement is reflected in the estimate and reaches the controller, $\tau_c$ = delay of one radio hop, $T_c$ = broadcast period (inverse of the rate), $n$ = number of radio hops crossed. The demo above can add a ground-PC compute time $\tau_{\text{PC}}$ on top; the error budget has no such term." />
          <M block tex={String.raw`\underbrace{t_{\tx{나}{own}} = \tau_{\text{est}}}_{\tx{기체 안에서만 흐름}{stays onboard}} \qquad\quad \underbrace{\bar t_{\tx{이웃}{nbr}} = \tau_{\text{est}} + n\,\tau_c + \tfrac12 T_c}_{\tx{평균 (7장의 루프 지연)}{mean (loop delay of ch. 7)}}`} />
          <M block tex={String.raw`t_{\tx{이웃}{nbr}}^{\max} = \tau_{\text{est}} + n\,(\tau_c + J) + T_c + L_{99.9}\,T_c`} />
          <List items={[
            { ko: '$\\tfrac12 T_c$: 값이 $T_c$ 마다 한 번만 새로 오므로, 받은 직후에는 나이가 0 만큼, 다음 값 직전에는 $T_c$ 만큼 더 묵습니다. 평균 $T_c/2$, 가장 나쁠 때 $T_c$. 중계에서도 이 대기는 **한 번만** 셉니다. 지상 PC 가 받은 위치를 기다리지 않고 곧바로 이웃에게 보낸다고 가정하기 때문입니다(PC 가 따로 정한 주기로 다시 보낸다면 한 번 더 더해야 합니다).', en: '$\\tfrac12 T_c$: a value is refreshed only once per $T_c$, so it is 0 older right after arrival and $T_c$ older just before the next one: $T_c/2$ on average, $T_c$ at worst. With a relay this wait is counted **once**, because the ground PC is assumed to forward a received position at once (if the PC re-sent on its own schedule, it would be added again).' },
            { ko: '$J$: 통신 지연의 지터(평균에서 벗어나는 폭, 전역 설정의 예시값). $L_{99.9}\\,T_c$: 패킷 1000개에 1번 꼴로 나오는 길이의 연속 손실 동안의 공백. $L_{99.9}$ 는 7장의 손실 모델에서 구합니다. 이 값은 **최악이 아닙니다**. 한 번의 비행에서 패킷이 수천 개 오가므로 이보다 긴 공백도 여러 번 나올 수 있습니다. 설정의 손실률은 기체 → PC → 기체 두 구간을 합친 끝-끝 손실로 봅니다.', en: '$J$: jitter of the comm delay (an example value in the global settings). $L_{99.9}\\,T_c$: the gap during a burst of lost packets of a length that occurs about once per 1000 packets; $L_{99.9}$ comes from the loss model of chapter 7. This is **not a worst case**: a single flight exchanges thousands of packets, so longer gaps can occur several times. The loss rate in the settings is taken as the end-to-end loss over both hops, vehicle → PC → vehicle.' },
            { ko: '지상 PC 중계에서는 $n = 2$ (기체 → PC → 기체), 기체끼리 직접 주고받으면 $n = 1$ 입니다.', en: 'With a ground-PC relay $n = 2$ (vehicle → PC → vehicle); directly between vehicles $n = 1$.' },
            { ko: '나이 $t$ 에 상대속도 $v_{\\text{rel}}$ 을 곱하면 그동안 두 기체가 서로에 대해 움직인 거리 $v_{\\text{rel}}\\,t$ 입니다. 자기 위치에서는 $v_{\\text{rel}}\\,\\tau_{\\text{est}}$ 가 되고, 이것이 오차 예산의 \'측위 지연 동안의 이동\' 항입니다.', en: 'Multiplying an age $t$ by the relative speed $v_{\\text{rel}}$ gives how far two vehicles move relative to each other meanwhile, $v_{\\text{rel}}\\,t$. For one\'s own position this is $v_{\\text{rel}}\\,\\tau_{\\text{est}}$ — the budget item \'motion during the estimation latency\'.' },
          ]} />
          <P ko={`지금 설정: $\\tau_{\\text{est}}$ = {{cfg:estimation.latency}}, $\\tau_c$ = {{cfg:comm.delayMean}}, $T_c$ = ${fmt(1000 / cfg.comm.rate, 3)} ms{{ex:comm.rate}}, $n$ = ${hops}, $J$ = {{cfg:comm.delayJitter}}, $L_{99.9}$ = ${L999}{{der:ch7#ge-stationary|설정의 손실 모델에서 1000패킷에 1번 꼴로 나오는 연속 손실 길이|Burst length occurring about once per 1000 packets in the loss model of the settings}} 패킷 → 이웃 위치의 평균 나이 ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch6#ages}}, 1000패킷에 1번 수준의 나이 ${fmt(cfg.estimation.latency * 1000, 3)} + ${hops}×${fmt((cfg.comm.delayMean + cfg.comm.delayJitter) * 1000, 3)} + ${fmt(Tc * 1000, 3)} + ${L999}×${fmt(Tc * 1000, 3)} = ${fmt(worstAge * 1000, 3)} ms{{der:ch6#ages}}. 이 식들은 오차 예산(budget)이 쓰는 식과 같습니다.`}
            en={`Current settings: $\\tau_{\\text{est}}$ = {{cfg:estimation.latency}}, $\\tau_c$ = {{cfg:comm.delayMean}}, $T_c$ = ${fmt(1000 / cfg.comm.rate, 3)} ms{{ex:comm.rate}}, $n$ = ${hops}, $J$ = {{cfg:comm.delayJitter}}, $L_{99.9}$ = ${L999}{{der:ch7#ge-stationary|설정의 손실 모델에서 1000패킷에 1번 꼴로 나오는 연속 손실 길이|Burst length occurring about once per 1000 packets in the loss model of the settings}} packets → mean age of a neighbour’s position ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch6#ages}}, 1-in-1000-packet age ${fmt(cfg.estimation.latency * 1000, 3)} + ${hops}×${fmt((cfg.comm.delayMean + cfg.comm.delayJitter) * 1000, 3)} + ${fmt(Tc * 1000, 3)} + ${L999}×${fmt(Tc * 1000, 3)} = ${fmt(worstAge * 1000, 3)} ms{{der:ch6#ages}}. These are the same formulas the error budget uses.`} />
        </Derivation>
        <Note>
          <P ko="**이 그림이 말하지 않는 것.** 실제 펌웨어 안에서는 IMU 읽기, 예측, 측정 갱신, 제어가 서로 다른 주기로 돌고, UWB 측정도 '위치 한 번'이 아니라 패킷 하나마다 들어옵니다. 펌웨어 소스의 상수로는 메인 루프 1000 Hz, 자세 제어 500 Hz, 위치 제어 100 Hz{{lit:cf-firmware-docs/main-loop-rate}}, 칼만 예측 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}} 입니다. 반면 '측위→제어기 지연'은 이 교재가 확인한 Bitcraze 문서에 수치가 없어 예시값({{cfg:estimation.latency}})으로 두었습니다. 기체 안의 시간이라 지상 실험으로는 잴 수 없고, 이 교재는 그것을 재는 절차를 주지 못합니다. 예시값으로 두고, 결론이 이 값에 얼마나 민감한지를 위 슬라이더로 확인하세요."
            en="**What this picture leaves out.** Inside the real firmware, IMU reading, prediction, measurement update and control run at different rates, and UWB measurements arrive packet by packet, not as one 'position fix'. As constants in the firmware source: main loop 1000 Hz, attitude control 500 Hz, position control 100 Hz{{lit:cf-firmware-docs/main-loop-rate}}, Kalman prediction 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}}. The 'positioning-to-controller latency', however, has no figure in the Bitcraze documents this textbook verified, so it is an example value ({{cfg:estimation.latency}}). Being time inside the vehicle it cannot be measured by a ground experiment, and this textbook offers no procedure for it: keep the example value and use the slider above to see how sensitive your conclusions are to it." />
        </Note>
      </Section>

      <Section id="models" title={{ ko: '온보드 필터의 측정 모델', en: 'Measurement models of the onboard filter' }}>
        <P ko="5장에서 본 EKF 는 측정이 들어올 때마다 두 가지를 묻습니다. '지금 추정이 맞다면 이 측정은 얼마여야 하는가'($h(x)$, **측정 모델**), 그리고 '상태가 조금 바뀌면 그 값이 얼마나 바뀌는가'($H$, **야코비안** = $h$ 를 상태의 각 성분으로 편미분한 행벡터). Crazyflie 펌웨어 문서가 밝힌 두 모드의 모델은 2장에서 쓴 식과 같습니다."
          en="The EKF of chapter 5 asks two things whenever a measurement arrives: 'if my estimate is right, what should this measurement be' ($h(x)$, the **measurement model**), and 'how much does that value change when the state changes a little' ($H$, the **Jacobian** = the row vector of partial derivatives of $h$ with respect to each state). The models the Crazyflie firmware documentation gives for the two modes are the formulas of chapter 2." />
        <Derivation id="meas-model" title={{ ko: 'TWR 와 TDoA 의 측정 모델과 야코비안', en: 'Measurement models and Jacobians for TWR and TDoA' }}>
          <P ko="좌표계는 강당 바닥이 $x$, $y$, 위쪽이 $z$ 입니다. 태그 위치를 $p = (x, y, z)$, 앵커 $i$ 의 위치를 $a_i = (x_i, y_i, z_i)$ 라 하고, 둘 사이의 거리를 $d_i$ [m] 라 합시다."
            en="The frame has $x$, $y$ on the hall floor and $z$ up. Let the tag be at $p = (x, y, z)$, anchor $i$ at $a_i = (x_i, y_i, z_i)$, and $d_i$ [m] the distance between them." />
          <M block tex={String.raw`d_i = \norm{p - a_i} = \sqrt{(x-x_i)^2 + (y-y_i)^2 + (z-z_i)^2}`} />
          <P ko="**TWR** 측정은 이 거리 자체입니다: $h_{\text{TWR}}(p) = d_i$ {{lit:cf-firmware-docs/twr-measurement-model}}. $x$ 로 미분하려면 $d_i^2 = (x-x_i)^2 + \dots$ 의 양변을 미분합니다. $2 d_i\,\partial d_i/\partial x = 2(x - x_i)$ 이므로"
            en="A **TWR** measurement is this distance itself: $h_{\text{TWR}}(p) = d_i$ {{lit:cf-firmware-docs/twr-measurement-model}}. To differentiate with respect to $x$, differentiate both sides of $d_i^2 = (x-x_i)^2 + \dots$: $2 d_i\,\partial d_i/\partial x = 2(x - x_i)$, hence" />
          <M block tex={String.raw`\frac{\partial d_i}{\partial x} = \frac{x - x_i}{d_i},\quad \frac{\partial d_i}{\partial y} = \frac{y - y_i}{d_i},\quad \frac{\partial d_i}{\partial z} = \frac{z - z_i}{d_i} \;\;\Longrightarrow\;\; \frac{\partial d_i}{\partial p} = \frac{(p - a_i)^{\T}}{d_i} \equiv e_i^{\T}`} />
          <P ko="$e_i$ 는 **앵커에서 태그를 향하는 길이 1 의 벡터**입니다. 뜻은 단순합니다: 앵커에서 멀어지는 쪽으로 1 m 움직이면 거리가 1 m 늘고, 옆으로 움직이면 (처음에는) 변하지 않습니다."
            en="$e_i$ is the **unit vector pointing from the anchor to the tag**. The meaning is simple: move 1 m directly away from the anchor and the range grows by 1 m; move sideways and (to first order) it does not change." />
          <P ko="**TDoA** 측정은 두 앵커까지의 거리의 차입니다. 부호 규약은 **$j$ 에서 $i$ 를 뺍니다**{{lit:cf-firmware-docs/tdoa-measurement-model}}."
            en="A **TDoA** measurement is the difference of the distances to two anchors. The sign convention is **$j$ minus $i$**{{lit:cf-firmware-docs/tdoa-measurement-model}}." />
          <M block tex={String.raw`h_{\text{TDoA}}(p) = d_j - d_i, \qquad \frac{\partial h_{\text{TDoA}}}{\partial p} = \frac{(p - a_j)^{\T}}{d_j} - \frac{(p - a_i)^{\T}}{d_i} = (e_j - e_i)^{\T}`} />
          <P ko="미분은 선형이므로 TWR 의 결과 두 개를 빼기만 하면 됩니다. 상태에는 위치 말고도 속도와 자세가 있습니다. 측정은 위치에만 달려 있으므로 나머지 칸은 0 입니다. Crazyflie 의 EKF 는 상태가 9개(위치 3, 기체 좌표 속도 3, 자세 오차 3){{lit:cf-firmware-docs/kalman-state}}라서 $H$ 가 성분 9개짜리 행벡터가 됩니다. 이 장의 과제에서는 위치 3 + 속도 3, 여섯 칸짜리 상태를 씁니다."
            en="Differentiation is linear, so we just subtract two TWR results. The state also contains velocity and attitude; the measurement depends on position only, so the other entries are 0. The Crazyflie EKF has 9 states (position 3, body-frame velocity 3, attitude error 3){{lit:cf-firmware-docs/kalman-state}}, so $H$ is a row of 9 entries. The task in this chapter uses a six-entry state: position 3 + velocity 3." />
          <M block tex={String.raw`H_{\text{TWR}} = \big[\; e_i^{\T} \;\; 0 \,\cdots\, 0 \;\big], \qquad H_{\text{TDoA}} = \big[\; (e_j - e_i)^{\T} \;\; 0 \,\cdots\, 0 \;\big]`} />
          <List items={[
            { ko: '$\\|e_i\\| = 1$ 이지만 $\\|e_j - e_i\\|$ 는 0 에서 2 사이입니다. 태그에서 볼 때 두 앵커가 **반대쪽**에 있으면 2 에 가깝고(정보가 많다), **같은 쪽**에 있으면 0 에 가깝습니다(위치가 변해도 거리차가 거의 안 변한다). 3장에서 TDoA 가 앵커가 둘러싼 공간 밖에서 나빠진다고 한 이유가 이것입니다.', en: '$\\|e_i\\| = 1$, but $\\|e_j - e_i\\|$ ranges from 0 to 2. Seen from the tag, two anchors on **opposite sides** give nearly 2 (much information); on the **same side** nearly 0 (the range difference barely changes with position). This is why chapter 3 said TDoA degrades outside the space enclosed by the anchors.' },
            { ko: '부호를 반대로($d_i - d_j$) 잡아도 일관되기만 하면 되지만, 측정값 $z$ 를 만드는 쪽과 $h$ 를 계산하는 쪽의 규약이 다르면 필터가 추정을 **반대 방향**으로 밉니다.', en: 'The opposite sign ($d_i - d_j$) works as long as it is consistent, but if the side producing $z$ and the side computing $h$ disagree, the filter pushes the estimate the **wrong way**.' },
          ]} />
        </Derivation>
        <Derivation id="scalar-update" title={{ ko: '측정을 하나씩 넣는 스칼라 갱신', en: 'The scalar update: one measurement at a time' }}>
          <P ko="5장의 갱신 식은 $K = P H^{\T} (H P H^{\T} + R)^{-1}$ 이었습니다(이 절의 $\hat x$, $P$ 는 5장의 $x^-$, $P^-$, 곧 갱신 **전** 값이고, 위첨자 $^+$ 가 갱신 뒤입니다). 측정이 숫자 **하나**(거리 하나, 거리차 하나)이면 $H$ 는 행벡터, $R = \sigma^2$ 은 숫자이므로 괄호 안도 숫자 $S$ 하나가 됩니다. 역행렬이 나눗셈으로 바뀝니다."
            en="The update of chapter 5 was $K = P H^{\T} (H P H^{\T} + R)^{-1}$ (in this section $\hat x$, $P$ are chapter 5's $x^-$, $P^-$, the values **before** the update; the superscript $^+$ marks after). When the measurement is a **single** number (one range, one range difference), $H$ is a row vector and $R = \sigma^2$ a number, so the bracket is a single number $S$. The matrix inverse becomes a division." />
          <M block tex={String.raw`\nu = z - h(\hat x), \qquad S = H P H^{\T} + \sigma^2, \qquad K = \frac{P H^{\T}}{S}, \qquad \hat x^{+} = \hat x + K\,\nu, \qquad P^{+} = (I - K H)\,P`} />
          <List items={[
            { ko: '$\\nu$ [m]: **혁신**(innovation). 측정이 예측과 얼마나 다른가.', en: '$\\nu$ [m]: the **innovation** — how much the measurement differs from the prediction.' },
            { ko: '$S$ [m²]: 혁신의 분산. $H P H^{\\T}$ 는 "지금 추정이 불확실해서 생기는 몫", $\\sigma^2$ 는 "측정이 시끄러워서 생기는 몫"입니다. 4장의 게이트는 $\\nu^2 / S$ 를 봅니다.', en: '$S$ [m²]: the variance of the innovation. $H P H^{\\T}$ is the share due to the uncertain estimate, $\\sigma^2$ the share due to the noisy measurement. The gate of chapter 4 looks at $\\nu^2 / S$.' },
            { ko: '$K$: 이득. 상태의 칸마다 하나씩 있는 열벡터입니다. $P$ 에 위치-속도 상관이 있으면 위치만 본 측정으로 **속도도** 고쳐집니다.', en: '$K$: the gain, a column with one entry per state. If $P$ holds position–velocity correlation, a position-only measurement corrects the **velocity too**.' },
          ]} />
          <P ko="측정 노이즈가 서로 독립이면, 여러 측정을 한꺼번에 행렬로 넣는 것과 하나씩 차례로 넣는 것은 (선형인 경우) 같은 결과를 줍니다. 하나씩 넣으면 큰 역행렬이 필요 없어 작은 마이크로컨트롤러에 맞고, 앵커 패킷이 도착하는 대로 바로 쓸 수 있으며, 수상한 측정을 하나만 골라 버리기도 쉽습니다. Crazyflie 펌웨어 문서의 TWR 측정 모델도 거리 **하나**에 대한 9성분 행벡터 $H$ 로 적혀 있습니다{{lit:cf-firmware-docs/twr-measurement-model}}."
            en="When measurement noises are independent, feeding several measurements at once as a matrix and feeding them one after another give the same result (in the linear case). One at a time needs no large inverse, which suits a small microcontroller; each anchor packet can be used as soon as it arrives; and a suspicious measurement can be dropped on its own. The TWR measurement model in the Crazyflie firmware documentation is likewise written for **one** range, with a 9-entry row vector $H${{lit:cf-firmware-docs/twr-measurement-model}}." />
        </Derivation>
        <TdoaStepDemo />
        <h3>{tr({ ko: '펌웨어가 쓰는 숫자들', en: 'The numbers the firmware uses' })}</h3>
        <P ko="위 식의 $\sigma$ 에 펌웨어는 정해 둔 기본값(소스 코드의 상수)을 넣습니다. TDoA 는 기본 0.15 m(파라미터로 바꿀 수 있고, Long Range 빌드에서는 0.30 m){{lit:cf-firmware-docs/tdoa-noise-std}}, TWR 는 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} 입니다. 주의할 점: 이것은 **우리 강당에서 잰 노이즈가 아니라 필터가 그렇다고 가정하는 값**(5장의 $R$)입니다. 실제 노이즈가 이보다 크면 필터는 측정을 너무 믿어 추정이 떨리고, 작으면 덜 믿어 느리게 따라갑니다. 이 교재의 전역 설정({{cfg:uwb.sigmaTdoa}})은 실제 측정 노이즈를 뜻하므로, 9장에서 잰 값으로 바꾸고 펌웨어의 가정과 비교해 보세요."
          en="For $\sigma$ in the formulas above the firmware uses preset defaults (constants in the source): 0.15 m for TDoA (changeable by parameter; 0.30 m in the Long Range build){{lit:cf-firmware-docs/tdoa-noise-std}} and 0.25 m for TWR{{lit:cf-firmware-docs/twr-noise-std}}. Note that this is **not the noise measured in our hall but what the filter assumes** (the $R$ of chapter 5). If the real noise is larger, the filter trusts measurements too much and the estimate jitters; if smaller, it trusts them too little and follows slowly. The global setting of this textbook ({{cfg:uwb.sigmaTdoa}}) stands for the real measurement noise: replace it with what you measure in chapter 9 and compare with the firmware’s assumption." />
        <P ko="4장에서 배운 이상치 처리도 펌웨어에 들어 있습니다."
          en="The outlier handling of chapter 4 is in the firmware too." />
        <List items={[
          { ko: '**TWR**: 앵커마다 최근 거리 32개의 평균에서 4σ 넘게 벗어난 측정은 추정기에 넣지 않습니다{{lit:cf-firmware-docs/twr-outlier-filter}}.', en: '**TWR**: a range more than 4σ from the mean of the last 32 ranges of that anchor is not passed to the estimator{{lit:cf-firmware-docs/twr-outlier-filter}}.' },
          { ko: '**TDoA**: 두 앵커 사이의 거리보다 큰 거리차는 물리적으로 불가능하므로 버리고, 필터가 닫혀 있을 때(좋은 표본이 대부분일 때)는 오차가 가정한 표준편차의 2.5배 안쪽인 표본만 통과시킵니다. 좋은 표본의 비율이 10% 아래로 떨어지면 필터를 열어 다시 받아들이기 시작합니다{{lit:cf-firmware-docs/tdoa-outlier-filter}}.', en: '**TDoA**: a range difference larger than the distance between the two anchors is physically impossible and is dropped; while the filter is closed (most samples good) only samples whose error is within 2.5 times the assumed standard deviation pass; if the share of good samples drops below 10% the filter opens and accepts samples again{{lit:cf-firmware-docs/tdoa-outlier-filter}}.' },
          { ko: '**강건 추정 옵션**: 이상치의 영향을 줄이는 강건 비용함수와 반복 재가중(최대 2회 반복)을 쓰는 필터를 파라미터로 켤 수 있습니다{{lit:cf-firmware-docs/robust-estimation}}.', en: '**Robust option**: a filter using a robust cost function with iterative reweighting (at most 2 iterations) to reduce the influence of outliers can be enabled by parameter{{lit:cf-firmware-docs/robust-estimation}}.' },
        ]} />
        <CodeTask task={tdoaUpdateTask} />
      </Section>

      <Section id="anchors" title={{ ko: '앵커 좌표: 시스템이 믿는 유일한 지도', en: 'Anchor coordinates: the only map the system trusts' }}>
        <P ko="측정 모델의 $a_i$ 는 누가 알려 줄까요? 사람입니다. 앵커 좌표는 Crazyflie 클라이언트(PC 에서 돌리는 Bitcraze 의 설정·비행 프로그램)에서 입력하고, 앵커의 메모리에 저장되어 앵커가 보내는 패킷에 실려 기체로 전달됩니다{{lit:lps-docs/anchor-position-config}}. 이 교재가 확인한 문서에는 기체가 그 좌표를 검증하는 절차가 없습니다. 배치에도 규칙이 있습니다: 앵커는 벽과 천장에서 15 cm 이상 띄우고, 기준 배치(문서가 권하는 표준 배치)를 따르지 않을 때는 서로 2 m 이상, 서로 다른 높이에 답니다{{lit:lps-docs/anchor-placement}}(높이가 같으면 왜 나쁜지는 2장에서 보았습니다)."
          en="Who supplies $a_i$ in the measurement model? A person. Anchor coordinates are entered in the Crazyflie client (Bitcraze's configuration and flight program on the PC), stored in the anchors’ memory and carried to the vehicle inside the packets the anchors transmit{{lit:lps-docs/anchor-position-config}}. The documents this textbook verified describe no step in which the vehicle checks them. Placement has rules too: keep anchors at least 15 cm from walls and ceiling and, when not following a reference layout (the standard layout the docs recommend), at least 2 m apart and at different heights{{lit:lps-docs/anchor-placement}} (chapter 2 showed why equal heights are bad)." />
        <PredictNumber id="ch6-anchor-5cm"
          question={{ ko: '모든 앵커의 좌표를 축마다 5 cm{{ex}}(1σ)쯤 틀리게 입력했습니다(이 문제에서만 쓰는 값. 전역 설정과 다릅니다). 강당 한가운데에서 기체가 아는 수평 위치는 평균적으로(RMS) 몇 cm 어긋날까요?', en: 'Every anchor coordinate is entered about 5 cm{{ex}} (1σ) wrong per axis (a value for this question only, not the global setting). By how many cm (RMS) is the horizontal position known to a vehicle at the hall centre off?' }}
          min={0} max={30} step={0.5} unit="cm" actual={th5.rmsH * 100} tolerance={0.3}
          actualSrc={der('ch6#anchor-error', { ko: '아래 유도의 선형 이론에 지금의 앵커 배치·측위 모드와 δ = 5 cm 를 넣은 값', en: 'The linear theory of the derivation below with the current anchor layout, mode and δ = 5 cm' })}
          explain={{
            ko: '앵커 좌표 오차와 **같은 자릿수**입니다. 앵커가 여럿이라고 해서 오차가 평균되어 사라지지도 않고, 몇십 배로 부풀지도 않습니다. 배율은 2장에서 본 DOP 와 같은 종류의 수이고, 앵커 배치가 정합니다.',
            en: 'The **same order of magnitude** as the anchor error. Having many anchors does not average it away, nor is it amplified tens of times. The multiplier is the same kind of number as the DOP of chapter 2 and is set by the anchor layout.',
          }} />
        <Derivation id="anchor-error" title={{ ko: '앵커 좌표 오차가 위치 편향이 되는 과정', en: 'How anchor coordinate error becomes position bias' }}>
          <P ko="앵커 $i$ 의 참 위치가 $a_i$ 인데 시스템은 $a_i + \delta a_i$ 라고 믿는다고 합시다. 필터가 예측하는 거리는 $\norm{p - a_i - \delta a_i}$ 입니다. $\delta a_i$ 가 거리에 비해 작으면, 앞의 야코비안을 그대로 써서 1차 근사할 수 있습니다(앵커가 움직이는 것은 태그가 반대로 움직이는 것과 같습니다)."
            en="Suppose anchor $i$ is truly at $a_i$ but the system believes $a_i + \delta a_i$. The filter predicts the range $\norm{p - a_i - \delta a_i}$. If $\delta a_i$ is small compared with the range, the Jacobian above gives a first-order approximation (moving the anchor is the same as moving the tag the other way)." />
          <M block tex={String.raw`\underbrace{\norm{p - a_i - \delta a_i}}_{\tx{필터가 예측하는 거리}{range the filter predicts}} \approx d_i - e_i^{\T}\,\delta a_i,\qquad \underbrace{z_i}_{\tx{실제 측정}{actual measurement}} = d_i \quad\Longrightarrow\quad z_i - \hat h_i \approx \varepsilon_i \equiv e_i^{\T}\,\delta a_i`} />
          <P ko="즉 좌표 오차 중에서 **앵커-태그 방향 성분만** 거리 오차 $\varepsilon_i$ 가 됩니다. $\delta a_i$ 의 각 축이 독립이고 표준편차가 $\delta$ 이면, $e_i$ 의 길이가 1 이므로 $\varepsilon_i$ 의 표준편차도 $\delta$ 입니다. 측정은 필터의 예측보다 늘 $\varepsilon_i$ 만큼 크므로, 필터에게 이것은 '앵커 $i$ 의 측정에 항상 $\varepsilon_i$ 가 더해져 있는 것'과 구별되지 않습니다. 2장의 최소제곱 풀이에 넣으면, 측정마다의 $e_i^{\T}$ 를 쌓은 행렬(2장의 야코비안 $J$. 이 장의 행벡터 $H$ 의 위치 부분을 쌓은 것)로 위치가 밀리는 양은"
            en="So only the component of the coordinate error **along the anchor–tag direction** becomes a range error $\varepsilon_i$. If the axes of $\delta a_i$ are independent with standard deviation $\delta$, then since $e_i$ has length 1 the standard deviation of $\varepsilon_i$ is also $\delta$. The measurement always exceeds the filter's prediction by $\varepsilon_i$, so to the filter this is indistinguishable from 'every measurement of anchor $i$ always has $\varepsilon_i$ added'. Putting it into the least-squares solution of chapter 2, with the stacked rows $e_i^{\T}$ (the Jacobian $J$ of chapter 2 — the position parts of this chapter's row vectors $H$, stacked), the position shifts by" />
          <M block tex={String.raw`b = \underbrace{(J^{\T}J)^{-1}J^{\T}}_{J^{+}}\,\varepsilon \quad\Longrightarrow\quad \text{TWR:}\;\; \operatorname{Cov}(b) = \delta^2\,(J^{\T}J)^{-1} \;\;\Rightarrow\;\; b_{\text{RMS}} = \text{DOP}\cdot\delta`} />
          <P ko="TWR 에서는 2장의 DOP 유도와 글자 하나 다르지 않습니다. 측정 노이즈 $\sigma$ 자리에 $\delta$ 가 들어갔을 뿐입니다. 오차 예산은 이 규칙 $b \approx \text{DOP}\cdot\delta$ 를 씁니다. **TDoA** 에서는 측정 하나에 앵커가 둘 들어가므로 오차가 $\varepsilon_j - \varepsilon_i$ (표준편차 $\sqrt2\,\delta$)이고, 한 앵커의 오차가 그 앵커가 들어간 모든 쌍에 함께 나타납니다. 쌍을 만드는 행렬을 $D$ (쌍 $(i,j)$ 의 행에서 $j$ 칸이 +1, $i$ 칸이 −1)라 하고, TDoA 의 $J$ 는 쌍마다 $(e_j - e_i)^{\T}$ 를 쌓은 행렬이라 하면"
            en="For TWR this is letter for letter the DOP derivation of chapter 2, with $\delta$ in place of the measurement noise $\sigma$. The error budget uses this rule, $b \approx \text{DOP}\cdot\delta$. For **TDoA** each measurement involves two anchors, so its error is $\varepsilon_j - \varepsilon_i$ (standard deviation $\sqrt2\,\delta$), and one anchor’s error appears in every pair that anchor belongs to. With $D$ the pairing matrix (+1 in column $j$ and −1 in column $i$ on the row of pair $(i,j)$), and the TDoA $J$ stacking $(e_j - e_i)^{\T}$ for each pair," />
          <M block tex={String.raw`\text{TDoA:}\;\; b = J^{+}D\,\varepsilon,\quad J^{+} = (J^{\T}J)^{-1}J^{\T} \quad\Longrightarrow\quad \operatorname{Cov}(b) = \delta^2\; J^{+}D\,D^{\T}(J^{+})^{\T}`} />
          <P ko={`지금 설정(${mode === 'twr' ? 'TWR' : 'TDoA'}, δ = {{cfg:uwb.anchorSurveyError}})으로 강당 한가운데에서 계산하면, 예산의 규칙은 수평 ${fmt(ruleNow * 100, 3)} cm{{der:ch6#anchor-error|HDOP × δ|HDOP × δ}}, 위의 공분산 식은 수평 ${fmt(thNow.rmsH * 100, 3)} cm{{der:ch6#anchor-error|위 공분산의 수평 성분의 제곱근|Square root of the horizontal part of the covariance above}} · 수직 ${fmt(thNow.rmsV * 100, 3)} cm{{der:ch6#anchor-error|위 공분산의 수직 성분의 제곱근|Square root of the vertical part of the covariance above}} 입니다. ${mode === 'twr' ? 'TWR 에서는 두 값이 같습니다.' : 'TDoA 에서는 한 측정에 앵커 좌표 오차가 두 번 들어가므로 간단한 규칙이 실제보다 작게 나옵니다. 절대 위치가 중요한 판단(벽, 착륙 지점)에는 공분산 식의 값을 쓰세요.'}`}
            en={`With the current settings (${mode === 'twr' ? 'TWR' : 'TDoA'}, δ = {{cfg:uwb.anchorSurveyError}}) at the hall centre, the budget rule gives ${fmt(ruleNow * 100, 3)} cm{{der:ch6#anchor-error|HDOP × δ|HDOP × δ}} horizontally, while the covariance formula gives ${fmt(thNow.rmsH * 100, 3)} cm{{der:ch6#anchor-error|위 공분산의 수평 성분의 제곱근|Square root of the horizontal part of the covariance above}} horizontally and ${fmt(thNow.rmsV * 100, 3)} cm{{der:ch6#anchor-error|위 공분산의 수직 성분의 제곱근|Square root of the vertical part of the covariance above}} vertically. ${mode === 'twr' ? 'For TWR the two agree.' : 'For TDoA the anchor error enters each measurement twice, so the simple rule reads low. For decisions that depend on absolute position (walls, landing pads) use the covariance value.'}`} />
          <h3>{tr({ ko: '왜 필터가 평균으로 없애지 못하나', en: 'Why the filter cannot average it away' })}</h3>
          <P ko="측정 노이즈는 측정할 때마다 **새로** 뽑히므로, 필터가 여러 번을 섞으면 서로 지워집니다($1/\sqrt N$). 하지만 $\varepsilon_i$ 는 좌표를 잘못 입력한 순간에 정해져 **비행 내내 같은 값**입니다. 같은 값을 아무리 평균해도 그 값입니다. 이런 오차를 **편향**(bias)이라 부르고, 예산에서는 제곱합이 아니라 **그대로 더합니다**."
            en="Measurement noise is drawn **afresh** at every measurement, so when the filter blends many of them they cancel ($1/\sqrt N$). But $\varepsilon_i$ is fixed the moment the wrong coordinate is entered and stays **the same for the whole flight**. Averaging the same value any number of times returns that value. Such an error is a **bias**, and the budget **adds it directly** rather than in quadrature." />
          <h3>{tr({ ko: '간격에는 덜 나타나는 이유', en: 'Why it shows up less in the spacing' })}</h3>
          <P ko="$b$ 는 위치 $p$ 의 함수이고, $e_i$ 가 태그 위치에 따라 천천히 돌기 때문에 강당 크기 정도의 거리에 걸쳐 **천천히** 변합니다. 간격 $s$ 만큼 떨어진 두 기체의 편향 차이는 대략 $\norm{b}\cdot s/L$ ($L$ = 앵커까지의 거리 정도)로, 편향 자체보다 훨씬 작습니다. 그런데 예산은 두 기체의 편향이 서로 반대 방향일 수도 있다고 보고 편향 전체를 최소 간격에 더합니다. 간격에 대해서는 **보수적인**(안전한 쪽으로 넉넉한) 항입니다. 아래 함정 실험실의 몬테카를로에서 두 값을 직접 비교합니다."
            en="$b$ is a function of the position $p$ and, because each $e_i$ turns slowly as the tag moves, it varies **slowly**, over distances comparable to the hall. The difference in bias between two vehicles a spacing $s$ apart is roughly $\norm{b}\cdot s/L$ ($L$ ≈ distance to the anchors), far smaller than the bias itself. The budget nevertheless adds the whole bias to the minimum spacing, as if the two biases could point in opposite directions. For spacing it is a **conservative** term (generous on the safe side). The Monte Carlo in the pitfall lab below compares the two directly." />
        </Derivation>
        <AveragingDemo />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <SurveyPitfall />
      </Section>

      <Section id="crazyswarm2" title={{ ko: 'Crazyswarm2 로 5대 묶기', en: 'Tying five vehicles together with Crazyswarm2' }}>
        <ConceptNote />
        <P ko="**Crazyswarm2** 는 여러 대의 Crazyflie 를 지상 PC 한 대에서 다루기 위한 ROS 2 소프트웨어입니다{{lit:crazyswarm2-docs/ros2-based}}. **ROS 2** 는 로봇 프로그램들이 '토픽'(계속 흘러나오는 데이터)과 '서비스'(요청과 응답)로 이야기하게 해 주는 틀입니다. 이 교재가 확인한 사실만 정리합니다. 명령어와 설정의 정확한 철자는 공식 문서를 따르세요."
          en="**Crazyswarm2** is ROS 2 software for handling many Crazyflies from one ground PC{{lit:crazyswarm2-docs/ros2-based}}. **ROS 2** is a framework in which robot programs talk through 'topics' (continuously streamed data) and 'services' (request and reply). Only facts this textbook verified are listed here; follow the official documentation for the exact spelling of commands and settings." />
        <List items={[
          { ko: '**우리 기체가 지원 목록에 있습니다.** Crazyflie 2.1 Brushless 가 명시되어 있고, Brushless 는 비행 전에 **arming**(모터를 돌려도 좋다는 허가)이 필요합니다{{lit:crazyswarm2-docs/brushless-supported}}.', en: '**Our vehicle is on the supported list.** The Crazyflie 2.1 Brushless is named explicitly, and a Brushless must be **armed** (permission to spin the motors) before flight{{lit:crazyswarm2-docs/brushless-supported}}.' },
          { ko: '**5대는 설정 파일 하나에 적습니다.** `crazyflies.yaml` 에 기체마다 사용 여부, 무선 주소(URI), 처음 위치, 종류를 적습니다{{lit:crazyswarm2-docs/multi-cf-config}}. 교재의 조언: 처음 위치는 앵커 좌표와 같은 좌표계로 적어 두는 편이 헷갈리지 않습니다. 온보드 측위에서 이 값이 실제로 어떻게 쓰이는지는 이 교재가 확인하지 않았으니 공식 문서를 보세요.', en: '**Five vehicles go into one configuration file.** `crazyflies.yaml` lists, per vehicle, whether it is enabled, its radio address (URI), initial position and type{{lit:crazyswarm2-docs/multi-cf-config}}. The textbook’s advice: write the initial positions in the same frame as the anchor coordinates to avoid confusion. How this value is actually used with onboard positioning was not verified here; check the official documentation.' },
          { ko: '**백엔드를 고릅니다.** **백엔드**(backend)는 서버 안에서 기체와 실제로 통신하는 부분을 어떤 라이브러리로 구현했는가입니다. cpp, cflib, cflib2(개발 중, 이륙·착륙만), sim 네 가지가 있습니다{{lit:crazyswarm2-docs/backends}}. LPS 는 cpp 와 cflib 에서 지원되고{{lit:crazyswarm2-docs/lps-supported}}, 아래의 방송은 cpp 만 지원합니다{{lit:crazyswarm2-docs/broadcasts}}. 두 사실을 합치면 이 교재의 구성(LPS + 5대 동시 명령)에서는 **cpp** 가 두 조건을 모두 만족합니다.', en: '**You choose a backend.** The **backend** is which library implements the part of the server that actually talks to the vehicles. There are four: cpp, cflib, cflib2 (in development, take-off and landing only) and sim{{lit:crazyswarm2-docs/backends}}. LPS is supported by cpp and cflib{{lit:crazyswarm2-docs/lps-supported}}, and the broadcasts below only by cpp{{lit:crazyswarm2-docs/broadcasts}}. Together, for this textbook’s setup (LPS + commands to five vehicles at once) **cpp** meets both conditions.' },
          { ko: '**온보드 측위를 쓴다고 알려 줍니다.** LPS 처럼 기체가 스스로 위치를 아는 경우에는 모션캡처를 끄고 pose 로깅을 켜도록 안내합니다{{lit:crazyswarm2-docs/lps-supported}}. 그래야 지상 PC 가 기체의 위치를 받아 봅니다.', en: '**You tell it positioning is onboard.** When vehicles know their own position, as with LPS, the docs say to disable motion capture and enable pose logging{{lit:crazyswarm2-docs/lps-supported}} — that is how the ground PC gets to see the positions.' },
          { ko: '**내려오는 위치는 느립니다.** 로깅을 켰을 때 문서 예시와 기본 설정의 pose 로그는 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}}입니다(문서 예시는 로깅이 꺼져 있고 저장소의 기본 설정 파일은 켜져 있어 서로 다릅니다). 기체 안의 칼만 예측과 위치 제어가 100 Hz{{lit:cf-firmware-docs/main-loop-rate}}로 도는 것과 견주면, 지상 PC 가 보는 위치는 열 번에 한 번꼴입니다. 이 교재의 전역 설정은 로그 주기를 올려 쓴다고 가정해 {{cfg:comm.rate}} 로 두었습니다(예시값). 아무것도 바꾸지 않을 생각이면 설정 패널에서 이 값을 10 Hz 로 낮춰 7·8장의 지연·공백 항을 다시 보세요.', en: '**The downlinked position is slow.** With logging enabled, pose logging is 10 Hz in the documented example and the default configuration{{lit:crazyswarm2-docs/pose-topic-rate}} (the documented example has logging disabled while the repository default file enables it). Against the onboard Kalman prediction and position control running at 100 Hz{{lit:cf-firmware-docs/main-loop-rate}}, the ground PC sees one position in ten. The global setting of this textbook assumes you raise the logging rate and uses {{cfg:comm.rate}} (an example value). If you will change nothing, lower it to 10 Hz in the settings panel and look at the delay and gap items of chapters 7 and 8 again.' },
          { ko: '**궤적은 미리 올려 두고 동시에 시작합니다.** 궤적을 기체에 올리는 UploadTrajectory 와 시작시키는 StartTrajectory 가 있습니다{{lit:crazyswarm2-docs/trajectory-api}}. 원래의 Crazyswarm 논문도 궤적 업로드 같은 설정은 비행 전에 요청-응답으로 하고, 비행 중에는 궤적 시작 동기화 같은 짧은 방송만 보내는 설계였습니다{{lit:crazyswarm2017/comm-design}}. 이 구조라면 비행 중에는 "시작" 한마디만 건너가면 되므로, 무선이 잠깐 끊겨도 기체는 자기 궤적을 계속 따라갈 것이라고 교재는 봅니다(Crazyswarm2 에서 직접 확인한 동작은 아닙니다).', en: '**Trajectories are uploaded in advance and started together.** UploadTrajectory puts a trajectory on the vehicle and StartTrajectory starts it{{lit:crazyswarm2-docs/trajectory-api}}. The original Crazyswarm paper was designed the same way: setup such as trajectory upload by request and reply before flight, and only short broadcasts such as synchronised trajectory start during flight{{lit:crazyswarm2017/comm-design}}. With that structure only the word "start" has to cross in flight, so the textbook expects vehicles to keep following their trajectories through a brief radio dropout (not a behaviour verified on Crazyswarm2 itself).' },
          { ko: '**한꺼번에 보내는 명령은 방송으로.** Crazyswarm2 는 가능한 한 **방송**(broadcast, 받는 쪽을 지정하지 않고 모두에게 한 번에 보내기)을 쓰며, 방송은 cpp 백엔드만 지원합니다{{lit:crazyswarm2-docs/broadcasts}}(위의 백엔드 선택 참고). 한 기체만 지정해 보내는 **유니캐스트**(unicast) 패킷은 가끔 손실된다는 것이 알려진 한계입니다{{lit:crazyswarm2-docs/known-limitation}}.', en: '**Commands for everyone go by broadcast.** Crazyswarm2 uses **broadcasts** (one transmission to all, no addressee) wherever possible, and only the cpp backend supports them{{lit:crazyswarm2-docs/broadcasts}}. That **unicast** packets (addressed to one vehicle) are occasionally lost is a known limitation{{lit:crazyswarm2-docs/known-limitation}}.' },
          { ko: '**먼저 시뮬레이션으로.** `crazyflie_sim` 패키지는 펌웨어 코드를 **SIL**(software-in-the-loop, 실제 펌웨어 코드를 PC 에서 돌리는 방식)로 쓰고 실제 서버와 같은 ROS 인터페이스를 줍니다{{lit:crazyswarm2-docs/sim-package}}. 같은 스크립트를 기체 없이 먼저 돌려 볼 수 있습니다.', en: '**Simulate first.** The `crazyflie_sim` package runs the firmware code **software-in-the-loop** (SIL: the real firmware code executed on the PC) and offers the same ROS interface as the real server{{lit:crazyswarm2-docs/sim-package}}. The same script can be tried without any vehicle.' },
        ]} />
        <h3>{tr({ ko: '첫 비행까지의 순서', en: 'The order of work up to the first flight' })}</h3>
        <P ko="아래 순서는 문헌이 아니라 이 교재의 조언입니다." en="The order below is this textbook's advice, not literature." />
        <List ordered items={[
          { ko: '**앵커를 달고 좌표를 잰다.** 원점과 축 방향을 먼저 정해 바닥에 표시합니다. 모든 앵커를 두 사람이 따로 재서, 앵커 × 3축의 차이를 모두 모아 RMS 를 내고 $\\sqrt2$ 로 나눕니다(두 측정의 차는 한 측정보다 $\\sqrt2$ 배 흔들리므로). 그 값이 축당 무작위 오차 δ 이고, {{cfg:uwb.anchorSurveyError}} 자리에 들어갑니다.', en: '**Mount the anchors and survey them.** Fix the origin and axis directions first and mark them on the floor. Have two people survey every anchor independently, take the RMS of all the anchor × 3-axis differences and divide by $\\sqrt2$ (a difference of two measurements scatters $\\sqrt2$ times more than one). That is the per-axis random error δ, which goes in place of {{cfg:uwb.anchorSurveyError}}.' },
          { ko: '**좌표를 앵커에 써 넣는다.** 클라이언트에서 입력하고{{lit:lps-docs/anchor-position-config}}, 번호와 좌표가 맞는지 다른 사람이 다시 읽어 확인합니다(함정 실험실의 "번호 바뀜").', en: '**Write the coordinates into the anchors.** Enter them in the client{{lit:lps-docs/anchor-position-config}} and have someone else read back that IDs and coordinates match (the "swapped IDs" of the pitfall lab).' },
          { ko: '**받침대 위에서 추정값을 본다.** 모터를 돌리지 않은 채 기체를 비행 높이 가까운 받침대에 올려 좌표를 아는 몇 군데(한가운데, 구석, 앵커 근처)에 놓고, 기체가 말하는 위치가 줄자로 잰 위치와 맞는지 봅니다. 큰 실수는 여기서 다 드러납니다. 자세한 절차는 9장.', en: '**Check the estimate on a stand.** With motors off, put a vehicle on a stand near flight height at a few known spots (centre, a corner, near an anchor) and compare the position it reports with the tape-measured one. Every blunder shows up here. Details in chapter 9.' },
          { ko: '**한 대를 띄운다.** 제자리 비행과 느린 직선 이동만 합니다. 위치가 튀는 곳이 있으면 그 자리의 앵커 가림(4장)과 좌표를 다시 봅니다.', en: '**Fly one vehicle.** Hover and slow straight moves only. Where the position jumps, re-check occlusion of anchors at that spot (chapter 4) and the coordinates.' },
          { ko: '**시뮬레이션에서 5대를 띄운 다음, 실제로 5대를 띄운다.** 간격은 오차 예산이 권하는 최소 간격보다 넉넉하게 시작해서 줄여 갑니다.', en: '**Fly five in simulation, then five for real.** Start with a spacing well above the minimum the error budget recommends and reduce it step by step.' },
        ]} />
      </Section>

      <Section id="settings" title={{ ko: '우리 시스템의 값 넣기', en: 'Plugging in our system' }}>
        <P ko="이 장의 두 설정입니다. 여기서 바꾸면 오차 예산과 다른 장의 데모가 함께 바뀝니다."
          en="The two settings of this chapter. Changing them here also changes the error budget and the demos of other chapters." />
        <div class="controls">
          <CfgSlider path="uwb.anchorSurveyError" max={20} />
          <CfgSlider path="estimation.latency" max={100} />
        </div>
        <StatRow>
          <Stat label={{ ko: '앵커 좌표 편향: 수평 / 수직 (예산의 규칙)', en: 'Anchor bias: horizontal / vertical (budget rule)' }} value={`${fmt(item('anchor-bias').value * 100, 3)} / ${fmt((item('anchor-bias').valueV ?? 0) * 100, 3)}`} unit="cm" src={BIAS} />
          <Stat label={{ ko: '앵커 좌표 편향: 수평 / 수직 (공분산 식)', en: 'Anchor bias: horizontal / vertical (covariance formula)' }} value={`${fmt(thNow.rmsH * 100, 3)} / ${fmt(thNow.rmsV * 100, 3)}`} unit="cm" src={der('ch6#anchor-error', { ko: '유도의 공분산 식에 지금 앵커 배치·측위 모드와 δ 를 넣은 값(강당 한가운데)', en: 'The covariance formula of the derivation with the current layout, mode and δ (hall centre)' })} />
          <Stat label={{ ko: '측위 지연 동안의 이동', en: 'Motion during the estimation latency' }} value={item('est-latency').value * 100} unit="cm" src={der('ch6#ages', { ko: '상대속도 × 내 위치의 나이 τ_est (현재 설정)', en: 'Relative speed × age of own position τ_est (current settings)' })} />
          <Stat label={{ ko: '권장 최소 수평 간격', en: 'Recommended minimum horizontal spacing' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum', { ko: '오차 예산의 합계(8장에서 유도)', en: 'Total of the error budget (derived in chapter 8)' })} status={b.spacingOk ? 'good' : 'bad'} />
        </StatRow>
        <p class="small muted">{tr({ ko: '오차 예산은 왼쪽(규칙)을 씁니다. TDoA 에서는 공분산 식의 값이 더 크므로, 벽·착륙 지점처럼 절대 위치가 중요한 판단에는 두 번째 칸을 보세요.', en: 'The error budget uses the first tile (rule). In TDoA the covariance formula gives more, so for decisions that depend on absolute position (walls, landing pads) use the second tile.' })}</p>
        <P ko={`측량 오차 슬라이더를 0 에서 20 cm 까지 움직여 보세요. 예산의 편향 항이 HDOP 배만큼 따라 움직이고(지금 강당 한가운데의 HDOP 는 ${fmt(b.dop.hdop, 3)}{{der:ch2#gdop|지금의 앵커 배치와 측위 모드로 계산한 수평 DOP (정의는 2장)|Horizontal DOP for the current anchor layout and mode (defined in chapter 2)}}), 최소 간격도 그만큼 늘어납니다. 줄자를 한 번 더 대는 일이 대형 간격을 줄이는 가장 싼 방법 중 하나입니다.`}
          en={`Move the survey-error slider from 0 to 20 cm. The bias item of the budget follows it multiplied by the HDOP (currently ${fmt(b.dop.hdop, 3)}{{der:ch2#gdop|지금의 앵커 배치와 측위 모드로 계산한 수평 DOP (정의는 2장)|Horizontal DOP for the current anchor layout and mode (defined in chapter 2)}} at the hall centre), and the minimum spacing grows by the same amount. Measuring once more with the tape is one of the cheapest ways to tighten the formation.`} />
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 6,
  title: { ko: 'Crazyflie에 넣기', en: 'Putting it on a Crazyflie' },
  lead: { ko: '앵커, Loco 덱, 온보드 추정기, Crazyradio, 지상 PC. 지금까지 배운 조각이 실제 장비의 어디에서 도는지, 정보가 어느 길로 얼마나 늦게 흐르는지, 그리고 사람이 입력하는 앵커 좌표가 왜 그렇게 중요한지를 봅니다.', en: 'Anchors, Loco deck, onboard estimator, Crazyradio, ground PC. Where each piece you have learned runs in the real equipment, which path the information takes and how late it gets, and why the anchor coordinates a person types in matter so much.' },
  objectives: [
    { ko: '앵커, Loco 덱, 온보드 추정기, Crazyradio, 지상 PC(Crazyswarm2)의 역할을 나누고, 자기 위치와 이웃 위치의 나이가 왜 다른지 화살표로 설명한다.', en: 'Separate the roles of anchors, Loco deck, onboard estimator, Crazyradio and ground PC (Crazyswarm2), and explain with the arrows why own and neighbour positions differ in age.' },
    { ko: 'TWR 와 TDoA 의 측정 모델 $h$ 와 야코비안 $H$ 를 쓰고, 측정 하나로 칼만 갱신 1스텝을 구현한다.', en: 'Write the measurement model $h$ and Jacobian $H$ for TWR and TDoA and implement one Kalman update step with a single measurement.' },
    { ko: '앵커 좌표 오차가 위치 편향이 되는 크기를 어림하고, 그것이 평균으로 사라지지 않는 이유를 말한다.', en: 'Estimate how large a position bias anchor coordinate error produces and say why averaging does not remove it.' },
  ],
  Body,
  budget: {
    items: ['anchor-bias', 'est-latency'],
    note: {
      ko: '이 장은 예산에 두 가지를 더합니다. ① **앵커 좌표 오차가 만드는 편향** $b \\approx \\text{DOP}\\cdot\\delta$. 노이즈와 달리 평균되지 않으므로 제곱합이 아니라 그대로 더합니다. 가까운 두 기체는 이 편향을 대부분 공유하므로 간격에 대해서는 넉넉한 쪽의 항이고, 강당 안의 절대 위치에 대해서는 TDoA 에서 실제보다 작게 나올 수 있습니다(본문의 공분산 식 참고). ② **측위 지연 동안의 이동** $v_{\\text{rel}}\\,\\tau_{\\text{est}}$. 기체 안에서만 흐르는 지연이라 작지만, 문헌에 수치가 없고 이 교재로는 잴 방법도 없어 예시값으로 둡니다.',
      en: 'This chapter adds two things. ① **The bias from anchor coordinate error**, $b \\approx \\text{DOP}\\cdot\\delta$. Unlike noise it does not average out, so it is added directly rather than in quadrature. Two nearby vehicles share most of it, so for spacing it is a generous term, while for absolute position in the hall it can read low in TDoA (see the covariance formula in the text). ② **Motion during the estimation latency**, $v_{\\text{rel}}\\,\\tau_{\\text{est}}$. It stays onboard and is small, but with no figure in the literature and no way to measure it in this textbook, it stays an example value.',
    },
  },
  summary: [
    { ko: '위치 추정은 **기체 안**에서 돈다. 앵커는 좌표를 알고 패킷을 보낼 뿐이고, 지상 PC(Crazyswarm2)는 Crazyradio 로 명령을 올리고 로그를 내려받을 뿐이다. 그래서 자기 위치는 신선하고 이웃의 위치는 묵었다.', en: 'Position estimation runs **onboard**. Anchors only know their coordinates and transmit; the ground PC (Crazyswarm2) only sends commands up and receives logs over the Crazyradio. Hence your own position is fresh and a neighbour’s is stale.' },
    { ko: '온보드 EKF 는 측정을 하나씩 넣는다. TWR 은 $h = \\|p - a_i\\|$, TDoA 는 $h = d_j - d_i$ 이고 야코비안은 단위벡터(의 차)이다. 필터의 $\\sigma$ 는 잰 값이 아니라 가정한 값이다.', en: 'The onboard EKF takes measurements one at a time. TWR: $h = \\|p - a_i\\|$; TDoA: $h = d_j - d_i$; the Jacobian is a unit vector (or a difference of two). The filter’s $\\sigma$ is assumed, not measured.' },
    { ko: '앵커 좌표 오차는 같은 자릿수의 위치 **편향**이 되고 평균으로 사라지지 않는다. 번호가 바뀌는 큰 실수는 지상 점검으로 잡는다.', en: 'Anchor coordinate error becomes a position **bias** of the same order that averaging cannot remove. Blunders such as swapped IDs are caught by a ground check.' },
  ],
  next: { ko: '이제 각 드론은 자기가 어디 있는지 압니다. 그런데 대형을 유지하려면 **다른 드론**이 어디 있는지 알아야 합니다. 그 정보는 무선을 건너 얼마나 늦게, 얼마나 자주 빠진 채로 올까요? 그렇게 묵은 정보로 서로를 맞추다 보면 대형이 흔들리기 시작하는 지연은 얼마일까요?', en: 'Each drone now knows where it is. But to hold a formation it must know where the **others** are. How late does that information arrive over the radio, and how often is it missing? And how much delay can the loop take before a formation adjusted on such stale information starts to oscillate?' },
  tasks,
};
export default def;
