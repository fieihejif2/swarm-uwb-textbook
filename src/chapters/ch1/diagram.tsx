/** 1장: 패킷 타이밍 다이어그램 (SVG). 가로축은 시간이지만 비례는 맞지 않는다(응답 지연이 비행시간의 수만 배라서). */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { L, tr } from '../../app/i18n';
import { Button, linkHandlers, seriesColor, useLink, useWidth } from '../../ui';

export type TwrMode = 'ss' | 'ds';
export interface ExchangeProps {
  mode: TwrMode;
  /** 실제 거리 [m], 응답 지연 [s] — 그림의 간격을 조금 바꾸는 데만 쓴다 */
  d: number;
  reply1: number;
  reply2: number;
}

/** 사건(타임스탬프) 위치를 0~1 로. SS 는 사건 4개, DS 는 6개. */
export function eventFractions({ mode, d, reply1, reply2 }: ExchangeProps): number[] {
  const wf = 0.7 + 0.6 * Math.min(1, d / 30);
  const wr = (r: number) => 1.5 + 1.7 * Math.sqrt(Math.min(1, r / 5e-3));
  const w = mode === 'ss' ? [wf, wr(reply1), wf] : [wf, wr(reply1), wf, wr(reply2), wf];
  const total = w.reduce((a, b) => a + b, 0);
  const out = [0];
  w.forEach((v) => out.push(out[out.length - 1] + v / total));
  return out;
}

const PACKETS: { i: number; down: boolean; name: string }[] = [
  { i: 0, down: true, name: 'poll' },
  { i: 2, down: false, name: 'answer' },
  { i: 4, down: true, name: 'final' },
];
/** 사건 순서대로 타임스탬프를 찍는 장치 */
const OWNER = ['A', 'B', 'B', 'A', 'A', 'B'];
const SUBS = ['₁', '₂', '₃', '₄', '₅', '₆'];

interface Bracket { key: string; dev: 'A' | 'B'; from: number; to: number; base: string; sub: string }
const bracketsOf = (mode: TwrMode): Bracket[] => (mode === 'ss'
  ? [
      { key: 'round1', dev: 'A', from: 0, to: 3, base: 'T', sub: 'round' },
      { key: 'reply1', dev: 'B', from: 1, to: 2, base: 'T', sub: 'reply' },
    ]
  : [
      { key: 'round1', dev: 'A', from: 0, to: 3, base: 'T', sub: 'round1' },
      { key: 'reply2', dev: 'A', from: 3, to: 4, base: 'T', sub: 'reply2' },
      { key: 'reply1', dev: 'B', from: 1, to: 2, base: 'T', sub: 'reply1' },
      { key: 'round2', dev: 'B', from: 2, to: 5, base: 'T', sub: 'round2' },
    ]);

/**
 * 두 장치의 시간선과 패킷. phase(0~1)까지 진행된 모습을 그린다. phase ≥ 1 이면 전체.
 * linked 이면 같은 LinkGroup 의 수식 항·코드 줄과 구간 표시가 함께 강조된다.
 */
export function ExchangeDiagram({ mode, d, reply1, reply2, phase, linked, label }: ExchangeProps & { phase: number; linked?: boolean; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const active = useLink();
  const W = Math.max(width, 280), H = 196;
  const mL = 58, yA = 56, yB = 136;
  const fr = eventFractions({ mode, d, reply1, reply2 });
  const x0 = mL + 10, span = W - mL - 36;
  const xs = fr.map((f) => x0 + f * span);
  const p = Math.min(1, Math.max(0, phase));
  const xc = x0 + p * span;
  const done = phase >= 1;
  const yOf = (dev: string) => (dev === 'A' ? yA : yB);
  const colA = seriesColor(1), colB = seriesColor(2);
  const brackets = bracketsOf(mode);
  const cur = linked ? active.value : null;
  const anyOn = !!cur && brackets.some((b) => b.key === cur);
  return (
    <div class="plot" ref={ref}>
      {width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {/* 시간선 */}
          <text x="2" y={yA + 4} font-size="12" font-weight="700" fill="var(--text)">A <tspan font-weight="400" fill="var(--text-2)">{tr({ ko: '태그', en: 'tag' })}</tspan></text>
          <text x="2" y={yB + 4} font-size="12" font-weight="700" fill="var(--text)">B <tspan font-weight="400" fill="var(--text-2)">{tr({ ko: '앵커', en: 'anchor' })}</tspan></text>
          <line x1={mL} x2={W - 6} y1={yA} y2={yA} stroke="var(--text-3)" stroke-width="1.5" />
          <line x1={mL} x2={W - 6} y1={yB} y2={yB} stroke="var(--text-3)" stroke-width="1.5" />
          <text class="tick" x={W - 6} y={H - 4} text-anchor="end">{tr({ ko: '시간 → (비례 아님)', en: 'time → (not to scale)' })}</text>
          {/* 응답을 기다리는 동안: 그 장치의 시간선을 굵게 */}
          {[{ i: 1, dev: 'B' }, { i: 3, dev: 'A' }].filter((wt) => wt.i + 1 < xs.length && xc > xs[wt.i]).map((wt) => (
            <line key={wt.i} x1={xs[wt.i]} x2={Math.min(xc, xs[wt.i + 1])} y1={yOf(wt.dev)} y2={yOf(wt.dev)} stroke={wt.dev === 'A' ? colA : colB} stroke-width="5" stroke-linecap="round" opacity="0.55" />
          ))}
          {/* 패킷 */}
          {PACKETS.filter((pk) => pk.i + 1 < xs.length && xc > xs[pk.i]).map((pk) => {
            const xa = xs[pk.i], xb = xs[pk.i + 1], ya = pk.down ? yA : yB, yb = pk.down ? yB : yA;
            const f = Math.min(1, (xc - xa) / (xb - xa));
            const hx = xa + f * (xb - xa), hy = ya + f * (yb - ya);
            const len = Math.hypot(xb - xa, yb - ya), ux = (xb - xa) / len, uy = (yb - ya) / len;
            return (
              <g key={pk.name}>
                <line x1={xa} y1={ya} x2={hx} y2={hy} stroke="var(--text)" stroke-width="2" />
                <polygon points={`${hx},${hy} ${hx - 10 * ux - 4.5 * uy},${hy - 10 * uy + 4.5 * ux} ${hx - 10 * ux + 4.5 * uy},${hy - 10 * uy - 4.5 * ux}`} fill="var(--text)" />
                {f > 0.5 && <text class="ref-label" x={(xa + xb) / 2 + 9} y={(yA + yB) / 2 + 4}>{pk.name}</text>}
              </g>
            );
          })}
          {/* 타임스탬프를 찍는 순간 */}
          {xs.map((x, k) => xc >= x - 0.5 && (
            <g key={k}>
              <circle cx={x} cy={yOf(OWNER[k])} r="4" fill={OWNER[k] === 'A' ? colA : colB} stroke="var(--surface)" stroke-width="1.5" />
              <text class="tick" x={x} y={OWNER[k] === 'A' ? yA - 8 : yB + 16} text-anchor="middle">t{SUBS[k]}</text>
            </g>
          ))}
          {/* 각 장치가 자기 시계로 잰 구간 */}
          {brackets.filter((b) => done || xc >= xs[b.to] - 0.5).map((b) => {
            const on = cur === b.key;
            const y = b.dev === 'A' ? yA - 24 : yB + 26, dir = b.dev === 'A' ? 1 : -1;
            const xa = xs[b.from] + 1.5, xb = xs[b.to] - 1.5, col = b.dev === 'A' ? colA : colB;
            const name = `${b.base}_${b.sub}`;
            return (
              <g key={b.key} opacity={anyOn && !on ? 0.35 : 1} {...(linked ? linkHandlers(active, b.key) : {})} tabIndex={linked ? 0 : undefined}
                role={linked ? 'button' : undefined} aria-label={linked ? tr({ ko: `${name}: ${b.dev} 의 시계로 잰 구간`, en: `${name}: interval timed on the clock of ${b.dev}` }) : undefined}
                style={linked ? { cursor: 'pointer', outline: 'none' } : undefined}>
                <rect x={xa} y={b.dev === 'A' ? y - 16 : y - 6} width={Math.max(1, xb - xa)} height="24" fill={on ? 'var(--hl)' : 'transparent'} rx="3" />
                <path d={`M${xa},${y + 5 * dir}V${y}H${xb}V${y + 5 * dir}`} fill="none" stroke={col} stroke-width={on ? 3.5 : 2} stroke-dasharray={b.dev === 'A' ? '' : '5 3'} />
                <text x={(xa + xb) / 2} y={b.dev === 'A' ? y - 5 : y + 15} text-anchor="middle" font-size="12" font-weight={on ? 700 : 500} fill="var(--text)">
                  {b.base}<tspan dy="3" font-size="9.5">{b.sub}</tspan>
                </text>
              </g>
            );
          })}
          {!done && p > 0 && <line x1={xc} x2={xc} y1={yA - 30} y2={yB + 30} stroke="var(--text-3)" stroke-width="1" stroke-dasharray="2 3" />}
        </svg>
      )}
      <div class="legend">
        <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke={colA} stroke-width="2" /></svg>{tr({ ko: 'A 의 시계로 잰 구간', en: 'Timed on the clock of A' })}</span>
        <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke={colB} stroke-width="2" stroke-dasharray="5 3" /></svg>{tr({ ko: 'B 의 시계로 잰 구간', en: 'Timed on the clock of B' })}</span>
        <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="2" x2="24" y2="8" stroke="var(--text)" stroke-width="2" /></svg>{tr({ ko: '패킷 (한 번 날아가는 데 비행시간 T_f)', en: 'Packet (each flight takes the time of flight T_f)' })}</span>
      </div>
    </div>
  );
}

const STEPS: L[] = [
  { ko: 'A 가 poll 을 보내며 보낸 시각을 자기 시계로 적습니다. 패킷이 B 로 날아갑니다.', en: 'A sends the poll and notes the send time on its own clock. The packet flies to B.' },
  { ko: 'B 가 받은 시각을 적고, 자기 시계로 응답 지연만큼 기다립니다.', en: 'B notes the arrival time and waits for the reply delay, counted on its own clock.' },
  { ko: 'B 가 answer 를 보내며 보낸 시각을 적습니다. 패킷이 A 로 날아갑니다.', en: 'B sends the answer and notes the send time. The packet flies to A.' },
  { ko: 'A 가 받은 시각을 적고, 자기 시계로 두 번째 응답 지연만큼 기다립니다.', en: 'A notes the arrival time and waits for the second reply delay, counted on its own clock.' },
  { ko: 'A 가 final 을 보내며 보낸 시각을 적습니다. 패킷이 B 로 날아갑니다.', en: 'A sends the final and notes the send time. The packet flies to B.' },
];
const END: Record<TwrMode, L> = {
  ss: { ko: 'A 가 answer 를 받았습니다. A 의 시계로 잰 T_round 와 B 의 시계로 잰 T_reply 가 정해졌습니다.', en: 'A has received the answer. T_round (on the clock of A) and T_reply (on the clock of B) are now fixed.' },
  ds: { ko: 'B 가 final 을 받았습니다. 구간 네 개가 모두 정해졌습니다.', en: 'B has received the final. All four intervals are now fixed.' },
};

/** 재생/멈춤이 달린 타이밍 다이어그램. 움직임 줄이기 설정이면 처음부터 완성된 그림을 보여준다. */
export function AnimatedExchange(props: ExchangeProps) {
  const reduce = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [playing, setPlaying] = useState(!reduce);
  const [phase, setPhase] = useState(reduce ? 1 : 0);
  const [visible, setVisible] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const duration = props.mode === 'ss' ? 5 : 8; // 한 바퀴 [s]
  const hold = 0.3; // 끝난 뒤 완성된 그림을 보여 주는 시간(한 바퀴 대비)
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => setVisible(es.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || !visible) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setPhase((q) => (q + dt / duration > 1 + hold ? 0 : q + dt / duration));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible, duration]);
  // 방식을 바꾸면 처음부터(멈춰 있으면 완성된 그림으로)
  useEffect(() => { setPhase(playing ? 0 : 1); }, [props.mode]);
  const fr = eventFractions(props);
  const seg = phase >= 1 ? -1 : Math.max(0, fr.findIndex((f) => f > phase) - 1);
  const label = tr(props.mode === 'ss'
    ? { ko: '타이밍 다이어그램: A 가 poll 을 보내고, B 가 응답 지연 뒤에 answer 를 보낸다. A 는 T_round 를, B 는 T_reply 를 각자의 시계로 잰다. 값은 아래 표에 있다.', en: 'Timing diagram: A sends a poll, B sends an answer after the reply delay. A times T_round and B times T_reply, each on its own clock. Values are in the table below.' }
    : { ko: '타이밍 다이어그램: A 가 poll, B 가 answer, A 가 final 을 차례로 보낸다. A 는 T_round1 과 T_reply2 를, B 는 T_reply1 과 T_round2 를 각자의 시계로 잰다. 값은 아래 표에 있다.', en: 'Timing diagram: A sends a poll, B an answer, A a final. A times T_round1 and T_reply2; B times T_reply1 and T_round2, each on its own clock. Values are in the table below.' });
  return (
    <div ref={box}>
      <div class="btn-row" style={{ marginBottom: '6px' }}>
        <Button primary onClick={() => { if (!playing && phase >= 1) setPhase(0); setPlaying(!playing); }} testId="ch1-timing-play">{tr(playing ? { ko: '⏸ 멈춤', en: '⏸ Pause' } : { ko: '▶ 재생', en: '▶ Play' })}</Button>
        <Button onClick={() => { setPlaying(false); setPhase(1); }} testId="ch1-timing-full">{tr({ ko: '전체 그림 보기', en: 'Show the whole picture' })}</Button>
      </div>
      <ExchangeDiagram {...props} phase={phase} label={label} />
      <p class="small" style={{ minHeight: '2.9em', margin: '4px 0 8px' }}>{tr(seg < 0 ? END[props.mode] : STEPS[seg])}</p>
    </div>
  );
}
