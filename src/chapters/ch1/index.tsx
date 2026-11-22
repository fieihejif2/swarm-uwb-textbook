import { useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fix, fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { dsTwrJitterSigma, dsTwrResidual, ssTwrJitterSigma, twrEstimates, twrStamps, twrTrueIntervals } from '../../sim/ch1_ranging';
import { Rng } from '../../sim/rng';
import { mean, normPdf, std } from '../../sim/stats';
import { C_LIGHT, dsTwr, ssTwr, ssTwrDriftError, tofOf } from '../../sim/uwb';
import { SrcRef, der, ex, lit } from '../../sources';
import {
  Button, Caption, CfgSlider, CodeTask, CodeView, Demo, Derivation, Histogram, LineChart, LinkGroup, List, M, McPanel, Note, P, Pitfall, Predict, PredictNumber, Section, Segmented, Slider,
  SrcBadge, Stat, StatRow, Status, T, niceTicks, seriesColor, useWidth,
} from '../../ui';
import { AnimatedExchange, ExchangeDiagram, TwrMode } from './diagram';
import { dsTwrTask, tasks } from './tasks';

/** 타임스탬프 1틱 [s]: 63.8976 GHz 클록의 한 주기 */
const TICK = 1 / 63.8976e9;
const PPM = 1e-6;

/** 길이를 읽기 쉬운 단위로 */
function len(m: number): { v: number; unit: string } {
  const a = Math.abs(m);
  if (a < 1e-9) return { v: 0, unit: 'µm' };
  if (a < 1e-3) return { v: m * 1e6, unit: 'µm' };
  if (a < 1e-2) return { v: m * 1e3, unit: 'mm' };
  if (a < 1) return { v: m * 100, unit: 'cm' };
  return { v: m, unit: 'm' };
}
const signed = (v: number, digits = 3): string => (v > 0 ? '+' : '') + fmt(v, digits);
const lenText = (m: number, digits = 3): string => { const l = len(m); return `${fmt(l.v, digits)} ${l.unit}`; };
/** 지금 측위 모드의 거리(거리차) 노이즈 설정 경로 */
const sigmaPath = (mode: 'twr' | 'tdoa'): string => (mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa');
const MODEL = der('ch1#ss-drift', { ko: '이 장의 클럭 모델(시계가 실제 시간의 (1+e)배로 간다)로 교환 한 번을 계산한 결과', en: 'One exchange computed with the clock model of this chapter (a clock runs (1+e) times true time)' });

function NsTable() {
  const rows: { t: number; label: string; src: SrcRef; dist: SrcRef[] }[] = [
    { t: 1e-6, label: '1 µs', src: ex(undefined, { ko: '환산해 볼 시간 간격', en: 'A time interval to convert' }), dist: [der('ch1#ns-to-m', { ko: 'c × 1 µs', en: 'c × 1 µs' })] },
    { t: 1e-9, label: '1 ns', src: ex(undefined, { ko: '환산해 볼 시간 간격', en: 'A time interval to convert' }), dist: [der('ch1#ns-to-m', { ko: 'c × 1 ns', en: 'c × 1 ns' }), lit('dw1000', 'one-ns-30cm')] },
    { t: 1e-10, label: '100 ps', src: ex(undefined, { ko: '환산해 볼 시간 간격', en: 'A time interval to convert' }), dist: [der('ch1#ns-to-m', { ko: 'c × 100 ps', en: 'c × 100 ps' })] },
    { t: TICK, label: `${fix(TICK * 1e12, 2)} ps`, src: lit('dw1000', 'timestamp-resolution'), dist: [der('ch1#ns-to-m', { ko: 'c × 타임스탬프 1틱', en: 'c × one timestamp tick' })] },
  ];
  return (
    <div class="table-wrap">
      <table class="tbl" style={{ maxWidth: '460px' }}>
        <thead><tr><th class="r">{tr({ ko: '시간', en: 'Time' })}</th><th class="r">{tr({ ko: '전파가 가는 거리', en: 'Distance radio travels' })}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td class="r">{r.label}<SrcBadge src={r.src} /></td>
              <td class="r">{lenText(C_LIGHT * r.t)}{r.dist.map((s, i) => <SrcBadge key={i} src={s} />)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimingDemo() {
  const cfg = config.value;
  const p0 = cfg.uwb.clockDriftPpm;
  const [mode, setMode] = useState<TwrMode>('ss');
  const [d, setD] = useState(5);
  const [reply1Us, setReply1Us] = useState(cfg.uwb.replyDelay * 1e6);
  const [reply2Us, setReply2Us] = useState(cfg.uwb.replyDelay * 1e6);
  const [eA, setEA] = useState(p0);
  const [eB, setEB] = useState(-p0);
  const clk = { eA: eA * PPM, eB: eB * PPM };
  const r1 = reply1Us * 1e-6, r2 = mode === 'ds' ? reply2Us * 1e-6 : r1;
  const T = tofOf(d);
  const ss = ssTwr(d, r1, clk), ds = dsTwr(d, r1, r2, clk);
  const tru = twrTrueIntervals(d, r1, r2, clk);
  const est = twrEstimates(twrStamps(d, r1, r2, clk));
  const sigR = cfg.uwb.mode === 'twr' ? cfg.uwb.sigmaTwr : cfg.uwb.sigmaTdoa;
  const status = (err: number) => (Math.abs(err) > sigR ? 'bad' : Math.abs(err) > sigR / 10 ? 'warn' : 'good');
  const rows = mode === 'ss'
    ? [
        { name: 'T_round', dev: 'A', tru: tru.tRound1, read: ss.tRound },
        { name: 'T_reply', dev: 'B', tru: tru.tReply1, read: ss.tReply },
      ]
    : [
        { name: 'T_round1', dev: 'A', tru: tru.tRound1, read: ds.tRound1 },
        { name: 'T_reply1', dev: 'B', tru: tru.tReply1, read: ds.tReply1 },
        { name: 'T_round2', dev: 'B', tru: tru.tRound2, read: ds.tRound2 },
        { name: 'T_reply2', dev: 'A', tru: tru.tReply2, read: ds.tReply2 },
      ];
  const local = (path: string) => ex(path, { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' });
  const eSrc = ex('uwb.clockDriftPpm', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 클럭 주파수 오차(A 는 +, B 는 −)입니다.', en: 'Local to this demo; starts from the clock frequency error in the global settings (A plus, B minus).' });
  const errL = len(mode === 'ss' ? ss.err : ds.err);
  return (
    <Demo title={{ ko: '패킷 타이밍 다이어그램: 각 시계는 무엇을 재는가', en: 'Packet timing diagram: what each clock measures' }} testId="ch1-timing-demo">
      <P ko="A(드론에 단 태그)와 B(벽에 단 앵커)가 패킷을 주고받습니다. 그림에서 색 띠로 표시한 구간이 각 장치가 **자기 시계로** 재는 시간입니다. 응답 지연과 두 시계의 빠르기를 바꿔 가며, 아래 표에서 '실제로 흐른 시간'과 '시계가 읽은 값'이 어떻게 어긋나는지, 그 결과 거리가 얼마나 틀리는지 보세요."
        en="A (the tag on the drone) and B (an anchor on the wall) exchange packets. The bracketed intervals are the times each device measures **on its own clock**. Change the reply delay and the speed of the two clocks, and watch in the table how 'true elapsed time' and 'what the clock read' drift apart — and how wrong the distance becomes." />
      <Segmented label={{ ko: '측정 방식', en: 'Ranging method' }} value={mode} onChange={setMode} testId="ch1-mode" options={[
        { value: 'ss', label: { ko: 'SS-TWR (한 번 주고받기)', en: 'SS-TWR (one round trip)' } },
        { value: 'ds', label: { ko: 'DS-TWR (한 번 더 보내기)', en: 'DS-TWR (one more message)' } },
      ]} />
      <AnimatedExchange mode={mode} d={d} reply1={r1} reply2={r2} />
      <div class="controls">
        <Slider label={{ ko: '실제 거리 $d$', en: 'True distance $d$' }} value={d} min={0.5} max={30} step={0.5} unit="m" onChange={setD} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch1-d" />
        <Slider label={mode === 'ss' ? { ko: '응답 지연 $T_{reply}$ (B 의 시계)', en: 'Reply delay $T_{reply}$ (clock of B)' } : { ko: '응답 지연 $T_{reply1}$ (B 의 시계)', en: 'Reply delay $T_{reply1}$ (clock of B)' }}
          value={reply1Us} min={50} max={5000} step={50} unit="µs" onChange={setReply1Us} src={local('uwb.replyDelay')} testId="ch1-reply1" />
        {mode === 'ds' && <Slider label={{ ko: '응답 지연 $T_{reply2}$ (A 의 시계)', en: 'Reply delay $T_{reply2}$ (clock of A)' }} value={reply2Us} min={50} max={5000} step={50} unit="µs" onChange={setReply2Us} src={local('uwb.replyDelay')} testId="ch1-reply2" />}
        <Slider label={{ ko: 'A 의 클럭 주파수 오차 $e_A$', en: 'Clock frequency error of A, $e_A$' }} value={eA} min={-100} max={100} step={1} unit="ppm" onChange={setEA} src={eSrc} testId="ch1-ea" />
        <Slider label={{ ko: 'B 의 클럭 주파수 오차 $e_B$', en: 'Clock frequency error of B, $e_B$' }} value={eB} min={-100} max={100} step={1} unit="ppm" onChange={setEB} src={eSrc} testId="ch1-eb" />
      </div>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => { setEA(p0); setEB(-p0); }} testId="ch1-preset-opposite">{tr({ ko: '두 시계가 반대로 어긋남 (+, −)', en: 'Clocks off in opposite directions (+, −)' })}</Button>
        <Button onClick={() => { setEA(p0); setEB(p0); }} testId="ch1-preset-same">{tr({ ko: '두 시계가 같은 쪽으로 어긋남 (+, +)', en: 'Clocks off in the same direction (+, +)' })}</Button>
        <Button onClick={() => { setEA(0); setEB(0); }}>{tr({ ko: '완벽한 시계', en: 'Perfect clocks' })}</Button>
        <Button onClick={() => { setD(5); setReply1Us(cfg.uwb.replyDelay * 1e6); setReply2Us(cfg.uwb.replyDelay * 1e6); setEA(p0); setEB(-p0); }}>{tr({ ko: '설정값으로 되돌리기', en: 'Back to settings' })}</Button>
      </div>
      <div class="table-wrap">
        <table class="tbl" data-testid="ch1-timing-table">
          <thead>
            <tr>
              <th>{tr({ ko: '구간', en: 'Interval' })}</th>
              <th>{tr({ ko: '재는 시계', en: 'Timed by' })}</th>
              <th class="r">{tr({ ko: '실제로 흐른 시간 [µs]', en: 'True elapsed time [µs]' })}</th>
              <th class="r">{tr({ ko: '그 시계가 읽은 값 [µs]', en: 'What that clock read [µs]' })}</th>
              <th class="r">{tr({ ko: '읽은 값 − 실제 [ns]', en: 'Read − true [ns]' })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td><M tex={r.name.replace(/_(\w+)/, '_{$1}')} /></td>
                <td>{r.dev}</td>
                <td class="r">{fix(r.tru * 1e6, 4)}<SrcBadge src={MODEL} /></td>
                <td class="r">{fix(r.read * 1e6, 4)}<SrcBadge src={MODEL} /></td>
                <td class="r">{signed(Number(((r.read - r.tru) * 1e9).toFixed(2)), 4)}<SrcBadge src={MODEL} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>{tr({ ko: '빠른 시계(e > 0)는 같은 시간을 더 길게 읽습니다. 응답 지연은 B(또는 A)가 자기 시계로 정확히 세어 보내므로, 읽은 값은 슬라이더 값 그대로이고 실제로 흐른 시간이 달라집니다.', en: 'A fast clock (e > 0) reads the same time as longer. The reply delay is counted exactly on the replying device’s own clock, so the reading equals the slider value and it is the true elapsed time that differs.' })}</Caption>
      <StatRow>
        <Stat label={{ ko: '비행시간 $T_f = d/c$', en: 'Time of flight $T_f = d/c$' }} value={T * 1e9} unit="ns" src={der('ch1#ns-to-m', { ko: '슬라이더의 거리를 빛의 속도로 나눈 값', en: 'The slider distance divided by the speed of light' })} />
        <Stat label={{ ko: '응답 지연 ÷ 비행시간', en: 'Reply delay ÷ time of flight' }} value={r1 / T} unit="×" src={der('ch1#ss-twr', { ko: 'T_reply / T_f', en: 'T_reply / T_f' })} />
        {mode === 'ss' ? (
          <>
            <Stat label={{ ko: 'SS-TWR 이 계산한 거리', en: 'Distance computed by SS-TWR' }} value={ss.dEst} digits={5} unit="m" src={der('ch1#ss-twr', { ko: 'c·½(T_round − T_reply) 에 표의 "읽은 값"을 넣은 값', en: 'c·½(T_round − T_reply) with the readings in the table' })} />
            <Stat label={{ ko: '거리 오차 (시뮬레이션)', en: 'Range error (simulation)' }} value={signed(errL.v)} unit={errL.unit} src={MODEL} status={status(ss.err)} />
            <Stat label={{ ko: '거리 오차 (1차 근사식)', en: 'Range error (first-order formula)' }} value={signed(len(ssTwrDriftError(r1, clk)).v)} unit={len(ssTwrDriftError(r1, clk)).unit} src={der('ch1#ss-drift', { ko: '½·c·(e_A − e_B)·T_reply', en: '½·c·(e_A − e_B)·T_reply' })} />
          </>
        ) : (
          <>
            <Stat label={{ ko: 'DS-TWR 이 계산한 거리', en: 'Distance computed by DS-TWR' }} value={ds.dEst} digits={7} unit="m" src={der('ch1#ds-twr', { ko: '비대칭 DS-TWR 공식에 표의 "읽은 값"을 넣은 값', en: 'The asymmetric DS-TWR formula with the readings in the table' })} />
            <Stat label={{ ko: '거리 오차 (시뮬레이션)', en: 'Range error (simulation)' }} value={signed(errL.v)} unit={errL.unit} src={MODEL} status={status(ds.err)} />
            <Stat label={{ ko: '거리 오차 (1차 근사식)', en: 'Range error (first-order formula)' }} value={signed(len(dsTwrResidual(d, clk)).v)} unit={len(dsTwrResidual(d, clk)).unit} src={der('ch1#ds-twr', { ko: 'd·(e_A + e_B)/2', en: 'd·(e_A + e_B)/2' })} />
            <Stat label={{ ko: '앞의 두 메시지만 썼다면 (SS-TWR)', en: 'With the first two messages only (SS-TWR)' }} value={signed(len(ss.err).v)} unit={len(ss.err).unit} src={MODEL} status={status(ss.err)} />
            <Stat label={{ ko: '대칭 공식(÷4)으로 계산했다면', en: 'With the symmetric formula (÷4)' }} value={signed(len(est.dSym - d).v)} unit={len(est.dSym - d).unit} src={MODEL} status={status(est.dSym - d)} />
          </>
        )}
      </StatRow>
      <Caption>{tr({ ko: '기호: ✕ 는 오차가 지금 설정의 거리 노이즈 σ_r 보다 큼, △ 는 σ_r 의 1/10 보다 큼, ✓ 는 그보다 작음.', en: 'Marks: ✕ the error exceeds the range noise σ_r of the current settings, △ it exceeds a tenth of σ_r, ✓ it is smaller.' })}<SrcBadge src={ex(sigmaPath(cfg.uwb.mode))} /></Caption>
      <List items={mode === 'ss' ? [
        { ko: '**응답 지연**을 두 배로 늘려 보세요. 오차도 두 배가 됩니다. **거리**를 바꿔도 오차는 거의 그대로입니다.', en: 'Double the **reply delay**: the error doubles. Change the **distance**: the error hardly moves.' },
        { ko: '"같은 쪽으로 어긋남"을 누르면 오차가 사라집니다. SS-TWR 을 망치는 것은 두 시계의 오차 자체가 아니라 **두 시계의 차이**입니다.', en: 'Press "same direction" and the error vanishes. What ruins SS-TWR is not the clock errors themselves but **the difference between the two clocks**.' },
      ] : [
        { ko: '**응답 지연** 두 개를 아무리 바꿔도, 서로 다르게 해도 DS-TWR 의 오차는 그대로입니다.', en: 'Change the two **reply delays** however you like, even make them unequal: the DS-TWR error stays put.' },
        { ko: '"같은 쪽으로 어긋남"을 누르면 이번에는 오차가 **가장 커집니다**. DS-TWR 에 남는 것은 두 시계 오차의 **평균**입니다. 그래도 µm 단위입니다.', en: 'Press "same direction" and this time the error is **largest**. What DS-TWR keeps is the **mean** of the two clock errors — still only micrometres.' },
        { ko: '두 응답 지연을 다르게 하고 "대칭 공식" 타일을 보세요. 4로 나누는 간단한 식은 응답 지연이 같을 때만 맞습니다.', en: 'Make the two reply delays unequal and watch the "symmetric formula" tile: the simple divide-by-4 formula is right only for equal reply delays.' },
      ]} />
    </Demo>
  );
}

function SweepDemo() {
  const cfg = config.value;
  const [ppm, setPpm] = useState(Math.max(1, cfg.uwb.clockDriftPpm));
  const [d, setD] = useState(5);
  const sigR = cfg.uwb.mode === 'twr' ? cfg.uwb.sigmaTwr : cfg.uwb.sigmaTdoa;
  const data = useMemo(() => {
    const ssClk = { eA: ppm * PPM, eB: -ppm * PPM }, dsClk = { eA: ppm * PPM, eB: ppm * PPM };
    const xl = Array.from({ length: 100 }, (_, i) => 50 + i * 50);
    const xp = Array.from({ length: 14 }, (_, i) => 100 + i * 375);
    return {
      xl, xp,
      ssTheory: xl.map((x) => Math.abs(ssTwrDriftError(x * 1e-6, ssClk)) * 1000),
      ssSim: xp.map((x) => Math.abs(ssTwr(d, x * 1e-6, ssClk).err) * 1000),
      dsTheory: xl.map(() => Math.abs(dsTwrResidual(d, dsClk)) * 1000),
      dsSim: xp.map((x) => Math.abs(dsTwr(d, x * 1e-6, x * 1e-6, dsClk).err) * 1000),
    };
  }, [ppm, d]);
  const atCfg = Math.abs(ssTwrDriftError(cfg.uwb.replyDelay, { eA: ppm * PPM, eB: -ppm * PPM }));
  return (
    <LinkGroup>
      <Demo title={{ ko: '수식, 그림, 코드, 그래프를 나란히 읽기', en: 'Reading formula, picture, code and chart side by side' }} testId="ch1-sweep-demo">
        <P ko="위쪽 식은 SS-TWR 에 남는 오차, 아래쪽 식은 DS-TWR 이 비행시간을 구하는 식입니다. 식의 항을 가리키면(또는 Tab 으로 옮겨 가면) 그림의 구간, 코드의 줄, 그래프의 선이 함께 강조됩니다. 코드는 위 과제의 기준 구현입니다."
          en="The upper formula is the error left in SS-TWR; the lower one is how DS-TWR obtains the time of flight. Point at a term (or Tab to it) to highlight the matching interval in the picture, line of code and curve in the chart. The code is the reference solution of the task above." />
        <M block tex={String.raw`\lk{ss}{\Delta d_{\text{SS}}} \;\approx\; \tfrac12\,c\,(e_A - e_B)\,\lk{reply1}{T_{reply}}`} />
        <M block tex={String.raw`\lk{ds}{\hat T_f} \;=\; \frac{\lk{round1}{T_{round1}}\,\lk{round2}{T_{round2}} \;-\; \lk{reply1}{T_{reply1}}\,\lk{reply2}{T_{reply2}}}{\lk{round1}{T_{round1}} + \lk{round2}{T_{round2}} + \lk{reply1}{T_{reply1}} + \lk{reply2}{T_{reply2}}}, \qquad \lk{dist}{\hat d} = c\,\hat T_f`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 그림·코드·그래프에서 같은 것이 강조됩니다. 그림의 구간이나 코드 줄을 가리켜도 됩니다.', en: '↑ Point at a term to highlight the same thing in the picture, code and chart. Pointing at an interval or a code line works too.' })}</p>
        <div class="grid-2">
          <ExchangeDiagram mode="ds" d={d} reply1={cfg.uwb.replyDelay} reply2={cfg.uwb.replyDelay} phase={1} linked
            label={tr({ ko: 'DS-TWR 교환의 구간 네 개: A 의 시계로 잰 T_round1 과 T_reply2, B 의 시계로 잰 T_reply1 과 T_round2', en: 'The four intervals of a DS-TWR exchange: T_round1 and T_reply2 on the clock of A; T_reply1 and T_round2 on the clock of B' })} />
          <CodeView code={dsTwrTask.solution} links={dsTwrTask.links} />
        </div>
        <div class="controls">
          <Slider label={{ ko: '두 발진기의 허용 오차 ±$p$', en: 'Tolerance of both oscillators ±$p$' }} value={ppm} min={1} max={100} step={1} unit="ppm" onChange={setPpm} src={ex('uwb.clockDriftPpm', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} testId="ch1-sweep-ppm" />
          <Slider label={{ ko: '실제 거리 $d$', en: 'True distance $d$' }} value={d} min={0.5} max={30} step={0.5} unit="m" onChange={setD} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch1-sweep-d" />
        </div>
        <LineChart
          title={{ ko: '응답 지연을 늘리면 거리 오차는 (세로축은 로그)', en: 'Range error as the reply delay grows (log vertical axis)' }}
          xLabel={{ ko: '응답 지연 T_reply [µs]', en: 'Reply delay T_reply [µs]' }} yLabel={{ ko: '거리 오차의 크기 [mm]', en: 'Size of the range error [mm]' }} yLog height={300}
          series={[
            { name: { ko: 'SS-TWR 이론: ½·c·(e_A − e_B)·T_reply', en: 'SS-TWR theory: ½·c·(e_A − e_B)·T_reply' }, x: data.xl, y: data.ssTheory, slot: 1, dash: '', link: 'ss' },
            { name: { ko: 'SS-TWR 시뮬레이션 (시계 +p, −p)', en: 'SS-TWR simulation (clocks +p, −p)' }, x: data.xp, y: data.ssSim, slot: 1, points: true, link: 'ss' },
            { name: { ko: 'DS-TWR 이론: d·(e_A + e_B)/2', en: 'DS-TWR theory: d·(e_A + e_B)/2' }, x: data.xl, y: data.dsTheory, slot: 2, dash: '7 4', link: 'ds' },
            { name: { ko: 'DS-TWR 시뮬레이션 (시계 +p, +p)', en: 'DS-TWR simulation (clocks +p, +p)' }, x: data.xp, y: data.dsSim, slot: 2, points: true, link: 'ds' },
          ]}
          refLines={[
            { x: cfg.uwb.replyDelay * 1e6, label: { ko: '설정값 T_reply', en: 'T_reply in settings' }, slot: 3 },
            { y: sigR * 1000, label: { ko: '거리 노이즈 σ_r (설정값)', en: 'Range noise σ_r (settings)' }, slot: 4 },
          ]}
          src={der('ch1#ss-drift', { ko: '선은 1차 근사식, 점은 클럭 모델로 교환 한 번을 그대로 계산한 값(ssTwr, dsTwr)', en: 'Lines: first-order formulas. Points: one exchange computed exactly with the clock model (ssTwr, dsTwr)' })} testId="ch1-sweep-chart" />
        <Caption>{tr({
          ko: `두 방식 모두 가장 불리한 시계 조합으로 그렸습니다. SS-TWR 은 두 시계가 반대로 어긋날 때(+p, −p), DS-TWR 은 같은 쪽으로 어긋날 때(+p, +p)가 최악입니다. 설정값의 응답 지연에서 SS-TWR 오차는 ${lenText(atCfg)}, DS-TWR 오차는 응답 지연과 무관하게 ${lenText(dsTwrResidual(d, { eA: ppm * PPM, eB: ppm * PPM }))} 입니다.`,
          en: `Each method is drawn with its least favourable pair of clocks: opposite errors (+p, −p) for SS-TWR, equal errors (+p, +p) for DS-TWR. At the reply delay of the settings the SS-TWR error is ${lenText(atCfg)}; the DS-TWR error is ${lenText(dsTwrResidual(d, { eA: ppm * PPM, eB: ppm * PPM }))} whatever the reply delay.`,
        })}<SrcBadge src={der('ch1#ds-twr', { ko: '위 두 근사식에 슬라이더 값을 넣은 값', en: 'The two first-order formulas with the slider values' })} /></Caption>
      </Demo>
    </LinkGroup>
  );
}

function JitterPanel() {
  const cfg = config.value;
  const sigT0 = cfg.uwb.sigmaTwr / (C_LIGHT * Math.sqrt(3) / 2);
  const [sigPs, setSigPs] = useState(Math.min(1500, Math.max(20, Math.round((sigT0 * 1e12) / 5) * 5)));
  const d = 5, reply = cfg.uwb.replyDelay, p = cfg.uwb.clockDriftPpm * PPM;
  const sigT = sigPs * 1e-12;
  const sDs = dsTwrJitterSigma(d, reply, reply, sigT) * 100, sSs = ssTwrJitterSigma(sigT) * 100;
  const bias = ssTwr(d, reply, { eA: p, eB: -p }).err * 100;
  const SRC = der('ch1#jitter', { ko: '타임스탬프 6개에 평균 0, 표준편차 σ_t 인 정규분포 오차를 더해 교환을 반복 계산한 결과', en: 'Repeated exchanges with zero-mean Gaussian errors of standard deviation σ_t added to the six timestamps' });
  return (
    <>
      <Slider label={{ ko: '타임스탬프 하나의 지터 $\\sigma_t$', en: 'Jitter of one timestamp, $\\sigma_t$' }} value={sigPs} min={20} max={1500} step={5} unit="ps" onChange={setSigPs}
        src={ex(undefined, { ko: '출처 없는 가정. 처음 값은 DS-TWR 거리 노이즈가 전역 설정의 TWR 거리 노이즈 σ 와 같아지도록 거꾸로 계산한 값입니다.', en: 'An assumption with no source. The initial value is back-computed so that the DS-TWR range noise equals the TWR range noise σ of the global settings.' })} testId="ch1-sigma-t" />
      <StatRow>
        <Stat label={{ ko: 'DS-TWR 거리 노이즈 이론값 $\\sigma_d$', en: 'Theoretical DS-TWR range noise $\\sigma_d$' }} value={sDs} unit="cm" src={der('ch1#jitter', { ko: '(√3/2)·c·σ_t', en: '(√3/2)·c·σ_t' })} />
        <Stat label={{ ko: 'SS-TWR 거리 노이즈 이론값', en: 'Theoretical SS-TWR range noise' }} value={sSs} unit="cm" src={der('ch1#jitter', { ko: 'c·σ_t', en: 'c·σ_t' })} />
        <Stat label={{ ko: 'SS-TWR 드리프트 편향 이론값', en: 'Theoretical SS-TWR drift bias' }} value={bias} unit="cm" src={der('ch1#ss-drift', { ko: '설정값의 클럭 오차(A +, B −)와 응답 지연으로 계산', en: 'From the clock error (A plus, B minus) and reply delay of the settings' })} />
      </StatRow>
      <McPanel
        title={{ ko: '타임스탬프가 흔들릴 때 거리 오차의 분포', en: 'Distribution of the range error when timestamps jitter' }}
        experiment="ch1-ranging" metric="errSsCm" testId="ch1-mc" src={SRC}
        params={{ d, reply1: reply, reply2: reply, eA: p, eB: -p, sigmaT: sigT }}
        xLabel={{ ko: 'SS-TWR 거리 오차 [cm] (같은 교환의 앞 두 메시지만 사용)', en: 'SS-TWR range error [cm] (first two messages of the same exchange)' }}
        range={[Math.min(0, bias) - 4 * sSs, Math.max(0, bias) + 4 * sSs]}
        refLines={[{ x: 0, label: { ko: '오차 0', en: 'zero error' } }, { x: bias, label: { ko: '드리프트 이론값', en: 'drift (theory)' }, slot: 2 }]}
        note={{ ko: '교환 한 번이 표본 하나입니다. 조건: 거리 5 m{{ex}}, 응답 지연 {{cfg:uwb.replyDelay}}, 클럭 오차는 A 가 +, B 가 − 로 {{cfg:uwb.clockDriftPpm}}. 위 히스토그램은 SS-TWR, 아래는 같은 타임스탬프로 계산한 DS-TWR 입니다.', en: 'One exchange is one sample. Condition: distance 5 m{{ex}}, reply delay {{cfg:uwb.replyDelay}}, clock error {{cfg:uwb.clockDriftPpm}} (A plus, B minus). The upper histogram is SS-TWR; the lower one is DS-TWR computed from the same timestamps.' }}>
        {(res) => {
          const dsv = res.map((r) => r.errDsCm), ssv = res.map((r) => r.errSsCm);
          return (
            <>
              <Histogram title={{ ko: 'DS-TWR 거리 오차: 시뮬레이션과 이론', en: 'DS-TWR range error: simulation and theory' }} values={dsv} bins={30} range={[-4 * sDs, 4 * sDs]}
                xLabel={{ ko: 'DS-TWR 거리 오차 [cm]', en: 'DS-TWR range error [cm]' }} slot={3} src={SRC}
                theory={{ name: { ko: '이론: 평균 0, 표준편차 σ_d 인 정규분포', en: 'Theory: normal, mean 0, standard deviation σ_d' }, pdf: (x) => normPdf(x, 0, sDs) }} testId="ch1-mc-ds" />
              <StatRow>
                <Stat label={{ ko: 'DS-TWR 표준편차 (시뮬레이션)', en: 'DS-TWR standard deviation (simulation)' }} value={std(dsv)} unit="cm" src={SRC} />
                <Stat label={{ ko: 'DS-TWR 표준편차 (이론 $\\sigma_d$)', en: 'DS-TWR standard deviation (theory $\\sigma_d$)' }} value={sDs} unit="cm" src={der('ch1#jitter')} />
                <Stat label={{ ko: 'DS-TWR 평균 (시뮬레이션)', en: 'DS-TWR mean (simulation)' }} value={mean(dsv)} unit="cm" src={SRC} />
                <Stat label={{ ko: 'SS-TWR 표준편차 (시뮬레이션)', en: 'SS-TWR standard deviation (simulation)' }} value={std(ssv)} unit="cm" src={SRC} />
              </StatRow>
            </>
          );
        }}
      </McPanel>
    </>
  );
}

/** 함정 실험실용 눈금자: 앵커에서 본 실제 위치와 측정값 */
function Ruler({ d, samples, xmax }: { d: number; samples: number[]; xmax: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 260), H = 128, mL = 18, mR = 18, y0 = 88;
  const sx = (x: number) => mL + (x / xmax) * (W - mL - mR);
  const m = mean(samples);
  const ticks = niceTicks(0, xmax, W < 420 ? 4 : 8);
  const far = sx(m) > W * 0.72;
  return (
    <div class="plot" ref={ref} data-testid="ch1-ruler">
      {width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={tr({ ko: `눈금자: 앵커는 0 m, 드론의 실제 위치는 ${fmt(d)} m, 측정값의 평균은 ${fmt(m, 4)} m`, en: `Ruler: anchor at 0 m, the drone is really at ${fmt(d)} m, the measurements average ${fmt(m, 4)} m` })}>
          <line class="axis" x1={mL} x2={W - mR} y1={y0} y2={y0} />
          {ticks.map((v) => <g key={v}><line class="axis" x1={sx(v)} x2={sx(v)} y1={y0} y2={y0 + 4} /><text class="tick" x={sx(v)} y={y0 + 16} text-anchor="middle">{fmt(v, 4)}</text></g>)}
          <text class="axis-label" x={W / 2} y={H - 4} text-anchor="middle">{tr({ ko: '앵커로부터의 거리 [m]', en: 'Distance from the anchor [m]' })}</text>
          <rect x={sx(0) - 6} y={y0 - 12} width="12" height="12" fill="var(--text-2)" />
          <text class="ref-label" x={sx(0) - 6} y={y0 - 17}>{tr({ ko: '앵커', en: 'anchor' })}</text>
          <line x1={sx(d)} x2={sx(d)} y1={20} y2={y0} stroke={seriesColor(3)} stroke-width="2.5" />
          <text class="ref-label" x={sx(d)} y={14} text-anchor={sx(d) > W * 0.72 ? 'end' : 'start'} dx={sx(d) > W * 0.72 ? 4 : -4}>{tr({ ko: '실제 위치', en: 'true position' })}</text>
          {samples.map((s, i) => s >= 0 && s <= xmax && <circle key={i} cx={sx(s)} cy={38 + ((i * 7) % 5) * 5} r="3" fill="none" stroke={seriesColor(2)} stroke-width="1.5" />)}
          {m >= 0 && m <= xmax && (
            <>
              <polygon points={`${sx(m)},${y0 - 2} ${sx(m) - 6},${y0 - 14} ${sx(m) + 6},${y0 - 14}`} fill={seriesColor(2)} stroke="var(--surface)" stroke-width="1" />
              <text class="ref-label" x={sx(m)} y={y0 - 18} text-anchor={far ? 'end' : 'start'} dx={far ? -9 : 9}>{tr({ ko: '측정값 (○ 하나가 측정 한 번, ▼ 평균)', en: 'measured (○ one measurement, ▼ mean)' })}</text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

function ReplyPitfall() {
  const cfg = config.value;
  const [method, setMethod] = useState<TwrMode>('ss');
  const [replyUs, setReplyUs] = useState(cfg.uwb.replyDelay * 1e6);
  const [ppm, setPpm] = useState(cfg.uwb.clockDriftPpm);
  const d = 5;
  const clk = { eA: ppm * PPM, eB: -ppm * PPM };
  const r = replyUs * 1e-6;
  const err = method === 'ss' ? ssTwr(d, r, clk).err : dsTwr(d, r, r, clk).err;
  const z = useMemo(() => { const rng = new Rng(7); return Array.from({ length: 40 }, () => rng.normal()); }, []);
  const samples = z.map((v) => d + err + cfg.uwb.sigmaTwr * v);
  const xmax = Math.max(8, Math.ceil(d + Math.abs(err) + 3 * cfg.uwb.sigmaTwr + 1));
  const spacing = cfg.formation.spacing;
  const worstDs = dsTwrResidual(d, { eA: ppm * PPM, eB: ppm * PPM });
  const e = len(err);
  return (
    <Pitfall title={{ ko: '응답을 늦게 보내는 SS-TWR', en: 'SS-TWR with a slow reply' }} testId="ch1-pitfall">
      <P ko="'메시지 두 개면 거리가 나오는데 굳이 세 개를 보낼 필요가 있나?' 직접 UWB 거리 측정을 짜 보면 누구나 SS-TWR 부터 만듭니다. 그리고 응답을 보내기 전에 계산을 하나 더 넣거나 로그를 찍으면서 응답 지연이 슬금슬금 늘어납니다. 발진기는 평범한 것을 쓰고요. 아래에서 응답 지연과 발진기 오차를 키워 보세요."
        en="'Two messages already give a distance — why send three?' Anyone who writes UWB ranging from scratch starts with SS-TWR. Then one more computation or a log line sneaks in before the reply, and the reply delay creeps up. The oscillators are ordinary ones. Raise the reply delay and the oscillator error below." />
      <Segmented label={{ ko: '거리를 계산하는 방식', en: 'How the distance is computed' }} value={method} onChange={setMethod} testId="ch1-pitfall-method" options={[
        { value: 'ss', label: { ko: 'SS-TWR', en: 'SS-TWR' } },
        { value: 'ds', label: { ko: 'DS-TWR (final 을 하나 더)', en: 'DS-TWR (one more message)' } },
      ]} />
      <div class="controls">
        <Slider label={{ ko: '응답 지연', en: 'Reply delay' }} value={replyUs} min={50} max={5000} step={50} unit="µs" onChange={setReplyUs} src={ex('uwb.replyDelay', { ko: '이 실험에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this lab; starts from the global setting.' })} testId="ch1-pitfall-reply" />
        <Slider label={{ ko: '발진기 오차 (태그 +, 앵커 −)', en: 'Oscillator error (tag plus, anchor minus)' }} value={ppm} min={0} max={100} step={1} unit="ppm" onChange={setPpm} src={ex('uwb.clockDriftPpm', { ko: '이 실험에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this lab; starts from the global setting.' })} testId="ch1-pitfall-ppm" />
      </div>
      <div class="btn-row" style={{ marginBottom: '8px' }}>
        <Button onClick={() => { setReplyUs(3000); }} testId="ch1-pitfall-slow">{tr({ ko: '응답 전에 로그를 찍는다 (응답 지연 3 ms)', en: 'Log before replying (3 ms reply delay)' })}</Button>
        <Button onClick={() => { setPpm(40); }}>{tr({ ko: '더 싼 발진기 (±40 ppm)', en: 'Cheaper oscillators (±40 ppm)' })}</Button>
        <Button onClick={() => { setReplyUs(cfg.uwb.replyDelay * 1e6); setPpm(cfg.uwb.clockDriftPpm); }}>{tr({ ko: '설정값으로 되돌리기', en: 'Back to settings' })}</Button>
        <SrcBadge src={ex(undefined, { ko: '단추의 3 ms 와 ±40 ppm 은 이 실험을 위한 가정입니다', en: 'The 3 ms and ±40 ppm of the buttons are assumptions for this lab' })} />
      </div>
      <Ruler d={d} samples={samples} xmax={xmax} />
      <Caption src={der('ch1#ss-drift', { ko: '클럭 모델로 계산한 편향에, 전역 설정의 TWR 거리 노이즈 σ 를 표준편차로 하는 정규분포 오차를 더한 40회 측정(시드 고정)', en: 'The bias from the clock model plus Gaussian noise with the TWR range noise σ of the global settings; 40 measurements, fixed seed' })}>
        {tr({ ko: '드론은 앵커에서 5 m 떨어진 곳에 가만히 있습니다.', en: 'The drone sits still 5 m from the anchor.' })}<SrcBadge src={ex(undefined, { ko: '이 실험의 가정', en: 'An assumption of this lab' })} />
      </Caption>
      <StatRow>
        <Stat label={{ ko: '거리 오차 (편향)', en: 'Range error (bias)' }} value={signed(e.v)} unit={e.unit} src={MODEL} status={Math.abs(err) > spacing ? 'bad' : Math.abs(err) > cfg.uwb.sigmaTwr ? 'warn' : 'good'} />
        <Stat label={{ ko: '1차 근사식 ½·c·(e_A − e_B)·T_reply', en: 'First-order formula ½·c·(e_A − e_B)·T_reply' }} value={signed(len(ssTwrDriftError(r, clk)).v)} unit={len(ssTwrDriftError(r, clk)).unit} src={der('ch1#ss-drift')} />
        <Stat label={{ ko: 'DS-TWR 의 최악 (두 시계가 같은 쪽)', en: 'Worst case of DS-TWR (clocks off the same way)' }} value={signed(len(worstDs).v)} unit={len(worstDs).unit} src={der('ch1#ds-twr', { ko: 'd·(e_A + e_B)/2, e_A = e_B = +p', en: 'd·(e_A + e_B)/2 with e_A = e_B = +p' })} />
        <Stat label={{ ko: '대형 간격 (설정값)', en: 'Formation spacing (settings)' }} value={spacing} unit="m" src={ex('formation.spacing')} />
      </StatRow>
      <p>
        {Math.abs(err) > spacing
          ? <Status kind="bad">{tr({ ko: '오차가 대형 간격보다 큽니다. 드론은 자기가 이웃 드론의 자리쯤에 있다고 믿게 됩니다.', en: 'The error exceeds the formation spacing: the drone believes it is about where its neighbour is.' })}</Status>
          : Math.abs(err) > cfg.uwb.sigmaTwr
            ? <Status kind="warn">{tr({ ko: '오차가 거리 노이즈 σ 보다 큽니다. 평균을 내도 사라지지 않는 편향입니다.', en: 'The error exceeds the range noise σ. It is a bias: averaging does not remove it.' })}</Status>
            : <Status kind="good">{tr({ ko: '편향이 거리 노이즈 σ 보다 작습니다.', en: 'The bias is below the range noise σ.' })}</Status>}
      </p>
      <P ko="측정값의 구름은 퍼진 정도는 그대로인 채 **통째로** 옮겨 갑니다. 노이즈는 여러 번 재서 평균을 내면 줄지만, 이런 편향은 몇 번을 재도 그대로입니다. 게다가 두 발진기의 차이는 온도에 따라 천천히 변하므로 한 번 재서 빼 버릴 수도 없습니다. 이제 방식을 DS-TWR 로 바꿔 보세요. 같은 응답 지연, 같은 발진기인데 구름이 실제 위치로 돌아옵니다. 메시지 하나를 더 보내는 값으로 응답 지연과 발진기 품질을 신경 쓰지 않아도 되게 된 것입니다."
        en="The cloud of measurements keeps its spread but moves **as a whole**. Noise shrinks when you average repeated measurements; a bias like this does not, however often you measure. And since the difference between two oscillators changes slowly with temperature, you cannot measure it once and subtract it. Now switch the method to DS-TWR: same reply delay, same oscillators, and the cloud returns to the true position. For the price of one more message, reply delay and oscillator quality stop mattering." />
    </Pitfall>
  );
}

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const p = cfg.uwb.clockDriftPpm, reply = cfg.uwb.replyDelay;
  const driftItem = b.items.find((i) => i.id === 'clock-drift')?.value ?? 0;
  const noiseItem = b.items.find((i) => i.id === 'range-noise')?.value ?? 0;
  const T5 = tofOf(5);
  const hallDiag = Math.hypot(cfg.hall.x, cfg.hall.y, cfg.hall.z);
  const sigT0 = cfg.uwb.sigmaTwr / (C_LIGHT * Math.sqrt(3) / 2);
  const tickM = C_LIGHT * TICK;
  return (
    <>
      <Section id="tof" title={{ ko: '전파가 날아간 시간으로 거리를 잰다', en: 'Measuring distance by the flight time of radio' }}>
        <P ko="0장의 오차 예산에서 첫 빈칸은 '거리를 얼마나 정확히 재는가'였습니다. 우리 드론은 **UWB**(ultra-wideband, 초광대역)라는 무선 방식으로 거리를 잽니다. UWB 는 아주 짧은 전파 펄스를 주고받습니다. 펄스가 짧으면 '언제 도착했는가'를 또렷하게 집어낼 수 있어서 거리 측정에 알맞습니다."
          en="The first blank in the error budget of chapter 0 was how accurately range is measured. Our drones measure distance with a radio technique called **UWB** (ultra-wideband). UWB exchanges very short radio pulses. A short pulse makes it possible to pin down sharply *when* it arrived, which is what ranging needs." />
        <P ko="등장인물은 둘입니다. 위치를 알고 싶은 쪽(드론에 단 UWB 장치)을 **태그**(tag), 벽이나 삼각대에 고정해 두고 좌표를 미리 재 둔 쪽을 **앵커**(anchor)라고 부릅니다. 원리는 한 줄입니다. 전파는 빛의 속도 $c$ 로 가므로, 전파가 태그와 앵커 사이를 날아간 시간 $T_f$ 를 알면 거리는 $d = c\,T_f$ 입니다. 이 $T_f$ 를 **비행시간**(time of flight, ToF)이라고 합니다."
          en="There are two characters. The device whose position we want (the UWB unit on the drone) is the **tag**; the devices fixed on walls or tripods at surveyed coordinates are the **anchors**. The principle is one line: radio travels at the speed of light $c$, so if we know the time $T_f$ the signal took between tag and anchor, the distance is $d = c\,T_f$. This $T_f$ is the **time of flight** (ToF)." />
        <PredictNumber id="ch1-one-microsecond"
          question={{ ko: '드론(태그)의 시계가 앵커의 시계보다 1 µs{{ex}}(100만분의 1초) 앞서 있습니다. 앵커가 패킷에 적어 보낸 "보낸 시각"과 드론이 자기 시계로 읽은 "받은 시각"의 차이로 **한 방향으로만** 거리를 재면, 거리는 몇 m 틀릴까요?', en: 'The clock of the drone (tag) is 1 µs{{ex}} (a millionth of a second) ahead of the anchor’s. If you measure distance **one way only** — the "sent at" time the anchor wrote into the packet versus the "received at" time on the drone’s clock — how many metres off is the distance?' }}
          min={0} max={1000} step={10} unit="m" actual={C_LIGHT * 1e-6} actualSrc={der('ch1#ns-to-m', { ko: 'c × 1 µs', en: 'c × 1 µs' })} tolerance={0.25}
          explain={{
            ko: '전파는 1 µs 동안 약 300 m{{der:ch1#ns-to-m|c × 1 µs|c × 1 µs}} 를 갑니다. 사람 눈에는 완벽하게 맞은 것처럼 보이는 두 시계도 전파의 눈에는 강당({{cfg:hall.x}} × {{cfg:hall.y}})을 열 번도 넘게 가로지를 만큼 어긋나 있습니다. 그래서 UWB 거리 측정은 두 장치의 시계가 가리키는 **시각을 맞추지 않아도 되는** 방법을 씁니다. 그 방법이 이 장의 주제입니다.',
            en: 'Radio covers about 300 m{{der:ch1#ns-to-m|c × 1 µs|c × 1 µs}} in 1 µs. Two clocks that look perfectly set to a human are, to a radio wave, off by more than ten crossings of the hall ({{cfg:hall.x}} × {{cfg:hall.y}}). UWB ranging therefore uses a method that **does not require the two clocks to agree on the time of day**. That method is the subject of this chapter.',
          }} />
        <Derivation id="ns-to-m" title={{ ko: '시간 오차를 거리 오차로 바꾸기: 1 ns 는 약 30 cm', en: 'Turning a timing error into a range error: 1 ns is about 30 cm' }}>
          <P ko="빛의 속도는 $c$ = 299 792 458 m/s{{lit:dw1000/speed-of-light}} 입니다. 거리 $d$ [m] 와 비행시간 $T_f$ [s] 의 관계가 $d = c\,T_f$ 이므로, 시간을 $\Delta t$ 만큼 틀리게 재면 거리는 그 $c$ 배만큼 틀립니다."
            en="The speed of light is $c$ = 299 792 458 m/s{{lit:dw1000/speed-of-light}}. Distance $d$ [m] and time of flight $T_f$ [s] are related by $d = c\,T_f$, so a timing error $\Delta t$ becomes a range error $c$ times as large." />
          <M block tex={String.raw`\Delta d = c\,\Delta t \qquad\Rightarrow\qquad \Delta t = 1\ \text{ns} = 10^{-9}\ \text{s}:\quad \Delta d = 299\,792\,458 \times 10^{-9}\ \text{m} \approx 0.30\ \text{m}`} />
          <NsTable />
          <P ko={`거꾸로 읽으면 요구 조건이 나옵니다. 우리 강당에서 5 m{{ex}} 떨어진 앵커까지의 비행시간은 ${fmt(T5 * 1e9, 3)} ns{{der:ch1#ns-to-m|5 m ÷ c|5 m ÷ c}} 뿐입니다. Loco Positioning System 의 정확도는 10 cm 수준{{lit:lps-docs/accuracy}}이라고 하는데, 이는 시간으로 ${fmt(0.1 / C_LIGHT * 1e9, 2)} ns{{der:ch1#ns-to-m|10 cm ÷ c|10 cm ÷ c}} 입니다. 10억분의 1초보다 짧은 시간을 가려내야 한다는 뜻입니다.`}
            en={`Read backwards, this gives the requirement. The time of flight to an anchor 5 m{{ex}} away in our hall is only ${fmt(T5 * 1e9, 3)} ns{{der:ch1#ns-to-m|5 m ÷ c|5 m ÷ c}}. The Loco Positioning System is said to be accurate to the 10 cm range{{lit:lps-docs/accuracy}}, which in time is ${fmt(0.1 / C_LIGHT * 1e9, 2)} ns{{der:ch1#ns-to-m|10 cm ÷ c|10 cm ÷ c}} — less than a billionth of a second has to be resolved.`} />
        </Derivation>
      </Section>

      <Section id="ss" title={{ ko: '시계를 맞추지 않고 재기: 양방향 측정', en: 'Ranging without synchronised clocks: two-way ranging' }}>
        <P ko="해결책은 **답장을 받는 것**입니다. A(태그)가 패킷을 보내고, B(앵커)가 그것을 받아 답장을 보냅니다. A 는 '보낸 뒤 답장이 올 때까지 걸린 시간'을 **자기 시계만으로** 재고, B 는 '받은 뒤 답장을 보낼 때까지 걸린 시간'을 **자기 시계만으로** 잽니다. 두 값 모두 한 장치 안에서의 시간 **차이**이므로, 두 시계가 가리키는 시각이 서로 달라도 상관없습니다. 이렇게 주고받아 거리를 재는 방식을 **양방향 거리 측정**(two-way ranging, TWR)이라고 하고, 한 번만 주고받는 가장 단순한 꼴을 **단측 양방향**(single-sided TWR, SS-TWR)이라고 합니다."
          en="The fix is to **get a reply**. A (the tag) sends a packet; B (the anchor) receives it and replies. A measures 'time from sending until the reply arrived' **on its own clock alone**; B measures 'time from receiving until sending the reply' **on its own clock alone**. Both are time **differences** inside one device, so it does not matter that the two clocks disagree about the time of day. Measuring distance by such an exchange is **two-way ranging** (TWR); the simplest form, a single round trip, is **single-sided TWR** (SS-TWR)." />
        <Derivation id="ss-twr" title={{ ko: 'SS-TWR 의 식', en: 'The SS-TWR formula' }}>
          <List items={[
            { ko: '$T_{round}$ [s]: A 가 첫 패킷(poll)을 보낸 순간부터 답장(answer)을 받은 순간까지. **A 의 시계**로 잽니다.', en: '$T_{round}$ [s]: from the instant A sends the first packet (poll) until it receives the reply (answer). Timed on **the clock of A**.' },
            { ko: '$T_{reply}$ [s]: B 가 poll 을 받은 순간부터 answer 를 보낸 순간까지. **B 의 시계**로 잽니다. 이 값을 **응답 지연**(reply delay)이라고 부르겠습니다. B 는 이 값을 A 에게 알려 줍니다(패킷에 적어 보내거나 미리 약속합니다).', en: '$T_{reply}$ [s]: from the instant B receives the poll until it sends the answer. Timed on **the clock of B**. We call it the **reply delay**. B tells A this value (inside a packet, or agreed beforehand).' },
          ]} />
          <P ko="A 가 기다린 시간은 '가는 데 $T_f$, B 가 뜸 들인 $T_{reply}$, 오는 데 $T_f$' 의 합입니다."
            en="The time A waited is the sum of 'out $T_f$, B’s pause $T_{reply}$, back $T_f$'." />
          <M block tex={String.raw`T_{round} = 2\,T_f + T_{reply} \quad\Longrightarrow\quad \hat T_f = \tfrac12\,\big(T_{round} - T_{reply}\big), \qquad \hat d = c\,\hat T_f`} />
          <P ko={`모자(^)는 '계산해서 얻은 추정값'이라는 표시입니다. 이 식은 UWB 칩 제조사의 사용 설명서에 있는 것과 같습니다{{lit:dstwr/ss-twr-formula}}. 눈여겨볼 것은 두 항의 크기입니다. 응답 지연이 {{cfg:uwb.replyDelay}} 이고 거리가 5 m{{ex}} 이면 $T_{reply}$ 는 $T_f$ 의 약 ${fmt(reply / T5, 2)}배{{der:ch1#ss-twr|응답 지연 ÷ (5 m ÷ c)|reply delay ÷ (5 m ÷ c)}} 입니다. A 가 잰 $T_{round}$ 의 거의 전부는 날아간 시간이 아니라 **기다린 시간**이고, 우리가 원하는 $2T_f$ 는 큰 수 두 개를 뺀 뒤에 남는 아주 작은 차이입니다.`}
            en={`The hat (^) marks an estimate obtained by calculation. The formula is the one in the user manual of the UWB chip maker{{lit:dstwr/ss-twr-formula}}. Look at the size of the two terms: with a reply delay of {{cfg:uwb.replyDelay}} and a distance of 5 m{{ex}}, $T_{reply}$ is about ${fmt(reply / T5, 2)} times{{der:ch1#ss-twr|응답 지연 ÷ (5 m ÷ c)|reply delay ÷ (5 m ÷ c)}} $T_f$. Almost all of the $T_{round}$ measured by A is **waiting**, not flying; the $2T_f$ we want is the tiny remainder after subtracting two large numbers.`} />
        </Derivation>
        <P ko="시각이 달라도 된다면 남는 문제는 시계의 **빠르기**입니다. 각 장치의 시계는 **수정 발진기**(crystal oscillator)라는 부품이 만드는 진동을 세어서 갑니다. 발진기마다 진동수가 조금씩 다르고 온도에 따라서도 변하므로, 두 장치의 '1초'는 길이가 미세하게 다릅니다. 이 차이를 **ppm**(parts per million, 100만분의 1)으로 적습니다. 10 ppm{{ex:uwb.clockDriftPpm}} 빠른 시계는 실제 1초 동안 10 µs{{der:ch1#ss-drift|10 ppm × 1 s|10 ppm × 1 s}} 를 더 갑니다. 이것을 **클럭 주파수 오차**(clock frequency error)라고 하고, 시간이 갈수록 두 시계가 점점 벌어지므로 **클럭 드리프트**(clock drift)라고도 부릅니다."
          en="If the time of day need not agree, what remains is the **rate** of the clocks. Each device’s clock advances by counting the oscillations of a part called a **crystal oscillator**. Every crystal has a slightly different frequency, and it changes with temperature, so one 'second' is minutely different on the two devices. The difference is written in **ppm** (parts per million). A clock that is 10 ppm{{ex:uwb.clockDriftPpm}} fast gains 10 µs{{der:ch1#ss-drift|10 ppm × 1 s|10 ppm × 1 s}} in one true second. This is the **clock frequency error**; because the two clocks drift further apart as time passes it is also called **clock drift**." />
        <Predict id="ch1-ppm-of-what"
          question={{ ko: '두 장치의 시계 빠르기가 20 ppm{{ex}} 어긋나 있습니다. 5 m{{ex}} 거리를 SS-TWR 로 재고, 응답 지연은 1 ms{{ex}} 입니다. 거리 오차는 어느 정도일까요?', en: 'The rates of the two clocks differ by 20 ppm{{ex}}. You range a 5 m{{ex}} distance with SS-TWR and the reply delay is 1 ms{{ex}}. Roughly how large is the range error?' }}
          choices={[
            { label: { ko: '눈에 띄지 않을 만큼 작다 — 거리의 100만분의 20 만큼만 틀릴 테니까', en: 'Too small to notice — it should be off by 20 millionths of the distance' } },
            { label: { ko: '손가락 한 마디쯤 — cm 단위', en: 'About a finger joint — centimetres' } },
            { label: { ko: '사람 키보다 크다 — m 단위', en: 'More than a person’s height — metres' }, correct: true },
          ]}
          explain={{
            ko: '**m 단위입니다.** ppm 은 "시계로 잰 시간"에 곱해집니다. 그런데 A 가 잰 시간의 거의 전부는 비행시간이 아니라 응답을 **기다린 시간**입니다. 1 ms 의 20 ppm 은 20 ns{{der:ch1#ss-drift|1 ms × 20 ppm|1 ms × 20 ppm}} 이고, 식에서 그 절반인 10 ns{{lit:dstwr/ss-twr-clock-error}} 가 비행시간의 오차로 남습니다. 거리로는 약 3 m{{der:ch1#ns-to-m|c × 10 ns|c × 10 ns}} 입니다. "거리의 100만분의 20"(5 m 에서 0.1 mm{{der:ch1#ss-drift|5 m × 20 ppm|5 m × 20 ppm}})이라는 직관은 틀리지 않았지만, 그것은 아래 유도에 나오는 두 항 중 작은 쪽일 뿐입니다.',
            en: '**Metres.** The ppm multiplies the *time measured by the clock*, and nearly all the time A measures is not flight but **waiting** for the reply. 20 ppm of 1 ms is 20 ns{{der:ch1#ss-drift|1 ms × 20 ppm|1 ms × 20 ppm}}; half of it, 10 ns{{lit:dstwr/ss-twr-clock-error}}, is left as the error of the time of flight. As distance that is about 3 m{{der:ch1#ns-to-m|c × 10 ns|c × 10 ns}}. The intuition "20 millionths of the distance" (0.1 mm{{der:ch1#ss-drift|5 m × 20 ppm|5 m × 20 ppm}} at 5 m) is not wrong, but it is only the smaller of the two terms in the derivation below.',
          }} />
        <Derivation id="ss-drift" title={{ ko: '클럭 주파수 오차가 SS-TWR 거리 오차가 되는 과정', en: 'How clock frequency error becomes SS-TWR range error' }}>
          <P ko="**① 클럭 모델과 부호 규약.** 실제 시간이 $\Delta t$ 만큼 흐르는 동안 장치 X 의 시계는 $(1+e_X)\,\Delta t$ 만큼 간다고 둡니다. $e_X$ 는 주파수 오차(단위 없는 비율, 10 ppm = $10\times10^{-6}$)이고, **양수이면 빠른 시계**입니다. 시계가 처음에 가리키던 시각(오프셋)은 차이를 구할 때 사라지므로 적지 않습니다."
            en="**① Clock model and sign convention.** While true time advances by $\Delta t$, the clock of device X advances by $(1+e_X)\,\Delta t$. $e_X$ is the frequency error (a dimensionless ratio, 10 ppm = $10\times10^{-6}$); **positive means a fast clock**. The initial reading (offset) of a clock cancels in every difference, so we omit it." />
          <P ko="**② B 가 기다린 실제 시간.** B 는 자기 시계로 $T_{reply}$ 를 셉니다. B 의 시계가 빠르면 금방 다 세어 버리므로, 실제로 흐른 시간은 $T_{reply}/(1+e_B)$ 입니다."
            en="**② The true time B waited.** B counts $T_{reply}$ on its own clock. A fast clock finishes counting sooner, so the true elapsed time is $T_{reply}/(1+e_B)$." />
          <P ko="**③ A 가 읽은 값.** poll 을 보낸 뒤 answer 가 올 때까지 실제로 흐른 시간은 $2T_f + T_{reply}/(1+e_B)$ 입니다. A 의 시계는 이것을 $(1+e_A)$ 배로 읽습니다."
            en="**③ What A reads.** The true time from sending the poll until the answer arrives is $2T_f + T_{reply}/(1+e_B)$. The clock of A reads it $(1+e_A)$ times as long." />
          <M block tex={String.raw`T_{round} = (1+e_A)\Big(2\,T_f + \frac{T_{reply}}{1+e_B}\Big)`} />
          <P ko="**④ 식에 넣기.** $\hat T_f = \tfrac12(T_{round} - T_{reply})$ 에 넣고 참값 $T_f$ 를 빼면"
            en="**④ Substitute.** Put this into $\hat T_f = \tfrac12(T_{round} - T_{reply})$ and subtract the true $T_f$:" />
          <M block tex={String.raw`\hat T_f - T_f \;=\; e_A\,T_f \;+\; \tfrac12\,T_{reply}\Big(\frac{1+e_A}{1+e_B} - 1\Big)`} />
          <P ko="**⑤ 작은 수 근사.** $e$ 는 $10^{-5}$ 쯤이므로 $e^2$ 은 버릴 수 있고, $\dfrac{1+e_A}{1+e_B} \approx 1 + e_A - e_B$ 입니다."
            en="**⑤ Small-number approximation.** $e$ is around $10^{-5}$, so $e^2$ can be dropped and $\dfrac{1+e_A}{1+e_B} \approx 1 + e_A - e_B$." />
          <M block tex={String.raw`\hat T_f - T_f \;\approx\; \underbrace{e_A\,T_f}_{\tx{아주 작다}{tiny}} \;+\; \underbrace{\tfrac12\,(e_A - e_B)\,T_{reply}}_{\tx{대부분}{nearly all of it}} \qquad\Longrightarrow\qquad \Delta d_{\text{SS}} \;\approx\; \tfrac12\,c\,(e_A - e_B)\,T_{reply}`} />
          <List items={[
            { ko: '첫 항은 "거리의 몇 ppm"입니다. $T_f$ 가 수십 ns 뿐이라 무시할 수 있습니다.', en: 'The first term is "a few ppm of the distance". With $T_f$ only tens of nanoseconds it is negligible.' },
            { ko: '둘째 항이 문제입니다. 오차는 **두 시계의 차이** $(e_A - e_B)$ 와 **응답 지연** $T_{reply}$ 의 곱에 비례하고, 거리와는 무관합니다. 응답을 늦게 보낼수록, 두 발진기가 다를수록 커집니다.', en: 'The second term is the problem. The error is proportional to **the difference of the two clocks** $(e_A - e_B)$ times **the reply delay** $T_{reply}$, and independent of distance. It grows with a slower reply and with more dissimilar oscillators.' },
            { ko: '사용 설명서는 같은 크기의 식을 $\\tfrac12(e_B - e_A)\\,T_{reply}$ 로 적습니다{{lit:dstwr/ss-twr-clock-error}}. 부호는 $e$ 를 어느 쪽으로 정의하느냐에 따라 달라집니다. 이 교재에서는 언제나 ①의 정의(빠른 시계가 양수)와 그 결과인 $(e_A - e_B)$ 를 씁니다. 이 규약에서는 **태그의 시계가 앵커보다 빠르면 거리가 실제보다 길게** 나옵니다.', en: 'The user manual writes the same magnitude as $\\tfrac12(e_B - e_A)\\,T_{reply}$ {{lit:dstwr/ss-twr-clock-error}}. The sign depends on how $e$ is defined. This textbook always uses the definition of ① (a fast clock is positive) and the resulting $(e_A - e_B)$. Under this convention **a tag clock faster than the anchor’s makes the distance come out too long**.' },
          ]} />
          <P ko={`숫자 예. 설명서의 예는 응답 지연 1 ms, 클럭 차이 20 ppm 에서 10 ns{{lit:dstwr/ss-twr-clock-error}}, 곧 약 3 m{{der:ch1#ns-to-m|c × 10 ns|c × 10 ns}} 입니다. 지금 설정(응답 지연 {{cfg:uwb.replyDelay}}, 클럭 오차 {{cfg:uwb.clockDriftPpm}})에서 두 시계가 반대 방향으로 어긋난 최악의 경우 $e_A - e_B$ = ${fmt(2 * p, 3)} ppm{{der:ch1#ss-drift|(+p) − (−p) = 2p|(+p) − (−p) = 2p}} 이고, 거리 오차는 ${lenText(driftItem)}{{der:ch1#ss-drift|½·c·(e_A − e_B)·T_reply 에 설정값을 넣은 값|½·c·(e_A − e_B)·T_reply with the settings}} 입니다.`}
            en={`Numbers. The manual’s example is 10 ns{{lit:dstwr/ss-twr-clock-error}} at a 1 ms reply delay and a 20 ppm clock difference, i.e. about 3 m{{der:ch1#ns-to-m|c × 10 ns|c × 10 ns}}. With the current settings (reply delay {{cfg:uwb.replyDelay}}, clock error {{cfg:uwb.clockDriftPpm}}) and the worst case of clocks off in opposite directions, $e_A - e_B$ = ${fmt(2 * p, 3)} ppm{{der:ch1#ss-drift|(+p) − (−p) = 2p|(+p) − (−p) = 2p}} and the range error is ${lenText(driftItem)}{{der:ch1#ss-drift|½·c·(e_A − e_B)·T_reply 에 설정값을 넣은 값|½·c·(e_A − e_B)·T_reply with the settings}}.`} />
        </Derivation>
        <TimingDemo />
      </Section>

      <Section id="ds" title={{ ko: '한 번 더 보내서 드리프트를 지운다: DS-TWR', en: 'One more message cancels the drift: DS-TWR' }}>
        <P ko="SS-TWR 의 약점은 긴 구간($T_{round}$)을 **A 의 시계 하나로만** 잰다는 데 있습니다. 그렇다면 역할을 바꿔 한 번 더 재면 됩니다. A 가 answer 를 받은 뒤 세 번째 패킷(final)을 보냅니다. 그러면 두 번째 왕복이 생깁니다. 이번에는 B 가 'answer 를 보낸 뒤 final 을 받을 때까지'($T_{round2}$)를 자기 시계로 재고, A 가 'answer 를 받은 뒤 final 을 보낼 때까지'($T_{reply2}$)를 자기 시계로 잽니다. 첫 왕복에서는 A 의 시계가, 둘째 왕복에서는 B 의 시계가 긴 구간을 재므로 두 오차가 서로 반대 방향으로 생기고, 잘 섞으면 지워집니다. 이것이 **양측 양방향**(double-sided TWR, DS-TWR)입니다. 위 데모에서 방식을 DS-TWR 로 바꾸면 그림을 볼 수 있습니다."
          en="The weakness of SS-TWR is that the long interval ($T_{round}$) is timed by **the clock of A alone**. So swap roles and measure once more. After receiving the answer, A sends a third packet (final). That creates a second round trip: now B times 'from sending the answer until receiving the final' ($T_{round2}$) on its clock, and A times 'from receiving the answer until sending the final' ($T_{reply2}$) on its clock. In the first round trip the clock of A times the long interval, in the second the clock of B does, so the two errors point in opposite directions and cancel when combined properly. This is **double-sided TWR** (DS-TWR). Switch the demo above to DS-TWR to see the picture." />
        <Derivation id="ds-twr" title={{ ko: '비대칭 DS-TWR 공식이 드리프트를 지우는 이유', en: 'Why the asymmetric DS-TWR formula cancels the drift' }}>
          <P ko="공식부터 적습니다{{lit:dstwr/ds-twr-asymmetric-formula}}. $T_{round1}$ 과 $T_{reply2}$ 는 A 의 시계로, $T_{reply1}$ 과 $T_{round2}$ 는 B 의 시계로 잰 값입니다(모두 초)."
            en="First the formula{{lit:dstwr/ds-twr-asymmetric-formula}}. $T_{round1}$ and $T_{reply2}$ are timed on the clock of A; $T_{reply1}$ and $T_{round2}$ on the clock of B (all in seconds)." />
          <M block tex={String.raw`\hat T_f \;=\; \frac{T_{round1}\,T_{round2} - T_{reply1}\,T_{reply2}}{T_{round1} + T_{round2} + T_{reply1} + T_{reply2}}`} />
          <P ko="**① 시계가 완벽할 때 맞는 식인가.** 두 응답에 **실제로** 걸린 시간을 $D_1$, $D_2$ 라고 하면 실제 왕복 시간은 $R_1 = 2T_f + D_1$, $R_2 = 2T_f + D_2$ 입니다."
            en="**① Is it right with perfect clocks?** Let $D_1$, $D_2$ be the **true** durations of the two replies. The true round-trip times are $R_1 = 2T_f + D_1$ and $R_2 = 2T_f + D_2$." />
          <M block tex={String.raw`R_1R_2 - D_1D_2 = (2T_f + D_1)(2T_f + D_2) - D_1D_2 = 2\,T_f\,(2T_f + D_1 + D_2), \qquad R_1 + R_2 + D_1 + D_2 = 2\,(2T_f + D_1 + D_2)`} />
          <P ko="나누면 괄호가 약분되어 정확히 $T_f$ 가 남습니다. $D_1$ 과 $D_2$ 가 서로 달라도 됩니다."
            en="Dividing, the bracket cancels and exactly $T_f$ remains — even when $D_1$ and $D_2$ differ." />
          <P ko="**② 시계가 틀릴 때.** 앞의 클럭 모델대로 각 시계는 실제 시간을 $(1+e)$ 배로 읽습니다."
            en="**② With imperfect clocks.** By the clock model above each clock reads true time $(1+e)$ times as long." />
          <M block tex={String.raw`T_{round1} = (1+e_A)R_1,\quad T_{reply2} = (1+e_A)D_2,\qquad T_{round2} = (1+e_B)R_2,\quad T_{reply1} = (1+e_B)D_1`} />
          <P ko="분자의 두 곱은 모두 'A 가 잰 값 × B 가 잰 값'이어서 $(1+e_A)(1+e_B)$ 가 똑같이 한 번씩 붙습니다. 분모는 A 가 잰 두 값과 B 가 잰 두 값으로 묶으면, $R_1 + D_2 = R_2 + D_1 = 2T_f + D_1 + D_2$ 이므로"
            en="Both products in the numerator are '(timed by A) × (timed by B)', so each picks up the same factor $(1+e_A)(1+e_B)$. Group the denominator into the two values timed by A and the two timed by B; since $R_1 + D_2 = R_2 + D_1 = 2T_f + D_1 + D_2$," />
          <M block tex={String.raw`\hat T_f = \frac{(1+e_A)(1+e_B)\cdot 2\,T_f\,(2T_f + D_1 + D_2)}{(2 + e_A + e_B)\,(2T_f + D_1 + D_2)} = T_f\,\frac{(1+e_A)(1+e_B)}{1 + \tfrac12(e_A + e_B)} \;\approx\; T_f\Big(1 + \frac{e_A + e_B}{2}\Big)`} />
          <List items={[
            { ko: '**응답 지연이 식에서 완전히 사라졌습니다.** 근사가 아니라 정확히 약분됩니다. 그래서 응답을 얼마나 늦게 보내든, 두 응답 지연이 서로 다르든 상관없습니다. "비대칭"이라는 이름이 이 뜻입니다.', en: '**The reply delays have vanished from the formula** — cancelled exactly, not approximately. So it does not matter how slow the replies are or whether the two differ. That is what "asymmetric" means.' },
            { ko: '남는 오차는 $\\Delta d_{\\text{DS}} \\approx d\\,\\dfrac{e_A + e_B}{2}$, 곧 **거리 × 두 시계 오차의 평균**입니다. SS-TWR 에서 "아주 작다"고 버렸던 바로 그 크기입니다.', en: 'The remaining error is $\\Delta d_{\\text{DS}} \\approx d\\,\\dfrac{e_A + e_B}{2}$: **distance × the mean of the two clock errors** — the very size we discarded as "tiny" in SS-TWR.' },
            { ko: '설명서도 같은 결론을 적고 있고, 그 예는 클럭 오차 20 ppm, 거리 100 m 에서 6.7 ps{{lit:dstwr/ds-twr-error}} 입니다. 거리로는 약 2 mm{{der:ch1#ns-to-m|c × 6.7 ps|c × 6.7 ps}} 입니다.', en: 'The manual states the same conclusion; its example is 6.7 ps{{lit:dstwr/ds-twr-error}} at a 20 ppm clock error and 100 m, which is about 2 mm{{der:ch1#ns-to-m|c × 6.7 ps|c × 6.7 ps}} of distance.' },
            { ko: '두 응답 지연이 같다면 $\\hat T_f = \\tfrac14(T_{round1} - T_{reply2} + T_{round2} - T_{reply1})$ 이라는 더 간단한 **대칭** 공식도 있습니다{{lit:dstwr/symmetric-ds-twr}}. 하지만 응답 지연이 다르면 그 차이에 비례하는 오차가 되살아납니다. 위 데모의 "대칭 공식" 타일에서 확인할 수 있습니다.', en: 'If the two reply delays are equal there is also a simpler **symmetric** formula, $\\hat T_f = \\tfrac14(T_{round1} - T_{reply2} + T_{round2} - T_{reply1})$ {{lit:dstwr/symmetric-ds-twr}}. With unequal delays, though, an error proportional to their difference comes back; see the "symmetric formula" tile in the demo above.' },
          ]} />
          <P ko={`지금 설정에서 강당의 대각선 길이 ${fmt(hallDiag, 3)} m{{der:ch1#ds-twr|강당 가로·세로·높이의 대각선|diagonal of the hall}} 를 재고 두 시계가 모두 같은 쪽으로 {{cfg:uwb.clockDriftPpm}} 어긋난 최악의 경우에도 DS-TWR 의 오차는 ${lenText(dsTwrResidual(hallDiag, { eA: p * PPM, eB: p * PPM }))}{{der:ch1#ds-twr|d·(e_A + e_B)/2|d·(e_A + e_B)/2}} 입니다.`}
            en={`With the current settings, even ranging the full diagonal of the hall, ${fmt(hallDiag, 3)} m{{der:ch1#ds-twr|강당 가로·세로·높이의 대각선|diagonal of the hall}}, with both clocks off the same way by {{cfg:uwb.clockDriftPpm}}, the DS-TWR error is ${lenText(dsTwrResidual(hallDiag, { eA: p * PPM, eB: p * PPM }))}{{der:ch1#ds-twr|d·(e_A + e_B)/2|d·(e_A + e_B)/2}}.`} />
        </Derivation>
        <Note>
          <P ko="**우리 시스템에서는.** Loco Positioning System 의 TWR 모드에서 태그는 앵커를 하나씩 차례로 불러 거리를 잽니다{{lit:lps-docs/twr-description}}. Crazyflie 펌웨어의 TWR 태그 코드는 전파 시간을 바로 이 비대칭 DS-TWR 식으로 계산합니다{{lit:cf-firmware-docs/twr-formula-in-firmware}}. 계산은 태그가 하므로, B(앵커)가 잰 두 값을 태그에게 알려 주는 메시지가 final 뒤에 하나 더 필요합니다. 메시지가 세 개든 네 개든 식은 같습니다{{lit:dstwr/ds-twr-asymmetric-formula}}."
            en="**In our system.** In the TWR mode of the Loco Positioning System the tag calls the anchors one after another to range to each{{lit:lps-docs/twr-description}}. The TWR tag code of the Crazyflie firmware computes the propagation time with exactly this asymmetric DS-TWR formula{{lit:cf-firmware-docs/twr-formula-in-firmware}}. The tag does the computation, so one more message after the final is needed to tell the tag the two values timed by B (the anchor). The formula is the same for three or four messages{{lit:dstwr/ds-twr-asymmetric-formula}}." />
        </Note>
        <P ko="이제 직접 구현해 봅시다. 실제 칩은 구간이 아니라 **타임스탬프**(사건이 일어난 순간 자기 시계가 가리킨 값)를 줍니다. 타임스탬프 6개에서 거리를 계산하는 함수를 쓰세요. 풀고 나면 그 아래 데모에서 기준 구현을 수식과 나란히 읽어 볼 수 있습니다."
          en="Now implement it. A real chip does not give intervals but **timestamps** (the reading of its own clock at the instant of an event). Write the function that turns six timestamps into a distance. Afterwards, the demo below lets you read the reference solution side by side with the formula." />
        <CodeTask task={dsTwrTask} />
        <SweepDemo />
      </Section>

      <Section id="noise" title={{ ko: '드리프트를 지우고 남는 것: 타임스탬프 지터와 σ_r', en: 'What is left after the drift: timestamp jitter and σ_r' }}>
        <P ko="DS-TWR 로 클럭 드리프트를 지워도 거리 측정이 완벽해지지는 않습니다. 타임스탬프 하나하나가 조금씩 틀리기 때문입니다. 펄스가 도착한 순간을 집어내는 일 자체에 잡음이 있습니다. 이렇게 사건의 시각이 매번 조금씩 다르게 찍히는 흔들림을 **지터**(jitter)라고 합니다. 타임스탬프가 흔들리면 거리도 흔들리고, 그 표준편차가 오차 예산의 첫 칸인 **거리 측정 노이즈** $\sigma_r$ 입니다."
          en="Removing clock drift with DS-TWR does not make ranging perfect, because each individual timestamp is slightly off: picking out the instant a pulse arrives is itself noisy. This shot-to-shot wobble in the recorded time of an event is called **jitter**. When the timestamps jitter the distance jitters, and its standard deviation is the first blank of the error budget, the **range measurement noise** $\sigma_r$." />
        <Derivation id="jitter" title={{ ko: '타임스탬프 지터 σ_t 가 거리 노이즈 σ_d 가 되는 관계', en: 'From timestamp jitter σ_t to range noise σ_d' }}>
          <P ko="타임스탬프 6개를 사건 순서대로 $t_1$(poll 송신, A), $t_2$(poll 수신, B), $t_3$(answer 송신, B), $t_4$(answer 수신, A), $t_5$(final 송신, A), $t_6$(final 수신, B)이라고 합시다(타이밍 다이어그램의 점). 구간은 $T_{round1} = t_4 - t_1$, $T_{reply1} = t_3 - t_2$, $T_{round2} = t_6 - t_3$, $T_{reply2} = t_5 - t_4$ 입니다. 각 타임스탬프에 평균 0, 표준편차 $\sigma_t$ [s] 인 오차가 서로 독립으로 들어간다고 가정합니다."
            en="Name the six timestamps in order of events: $t_1$ (poll sent, A), $t_2$ (poll received, B), $t_3$ (answer sent, B), $t_4$ (answer received, A), $t_5$ (final sent, A), $t_6$ (final received, B) — the dots in the timing diagram. The intervals are $T_{round1} = t_4 - t_1$, $T_{reply1} = t_3 - t_2$, $T_{round2} = t_6 - t_3$, $T_{reply2} = t_5 - t_4$. Assume each timestamp carries an independent error with mean 0 and standard deviation $\sigma_t$ [s]." />
          <P ko="두 응답 지연이 같으면 작은 오차에 대해 비대칭 공식은 대칭 공식과 똑같이 반응하므로, 간단한 쪽으로 계산합니다."
            en="For equal reply delays the asymmetric formula responds to small errors exactly as the symmetric one does, so we compute with the simpler one." />
          <M block tex={String.raw`\hat T_f \approx \tfrac14\big[(t_4 - t_1) - (t_5 - t_4) + (t_6 - t_3) - (t_3 - t_2)\big] = \tfrac14\big[-t_1 + t_2 - 2t_3 + 2t_4 - t_5 + t_6\big]`} />
          <P ko="$t_3$ 과 $t_4$ 는 두 구간에 걸쳐 있어서 계수가 2 입니다. 독립인 오차의 분산은 (계수)² 을 곱해 더하면 됩니다."
            en="$t_3$ and $t_4$ each belong to two intervals, hence the coefficient 2. Variances of independent errors add, each weighted by its coefficient squared." />
          <M block tex={String.raw`\sigma_{\hat T}^2 = \frac{1^2 + 1^2 + 2^2 + 2^2 + 1^2 + 1^2}{16}\,\sigma_t^2 = \frac34\,\sigma_t^2 \qquad\Longrightarrow\qquad \sigma_d = c\,\sigma_{\hat T} = \frac{\sqrt3}{2}\,c\,\sigma_t \approx 0.87\,c\,\sigma_t`} />
          <P ko={`같은 방법으로 SS-TWR 은 $\\hat T_f = \\tfrac12[-t_1 + t_2 - t_3 + t_4]$ 이므로 $\\sigma_d = c\\,\\sigma_t$ 입니다. 예를 들어 $\\sigma_t$ = 100 ps{{ex}} 이면 DS-TWR 의 $\\sigma_d$ 는 ${fmt(dsTwrJitterSigma(5, reply, reply, 1e-10) * 100, 3)} cm{{der:ch1#jitter|(√3/2)·c·100 ps|(√3/2)·c·100 ps}} 입니다. 거꾸로, 지금 설정의 TWR 거리 노이즈 {{cfg:uwb.sigmaTwr}} 는 타임스탬프 하나가 ${fmt(sigT0 * 1e12, 3)} ps{{der:ch1#jitter|σ_d ÷ ((√3/2)·c)|σ_d ÷ ((√3/2)·c)}} 쯤 흔들리는 것에 해당합니다. 두 응답 지연이 다를 때의 일반식은 엔진(\`dsTwrJitterSigma\`)에 있고, 계수는 0.87 과 1 사이에서 움직입니다{{der:ch1#jitter|일반식 √(2a² + 2b² + ½), a + b = ½ 의 최소·최대|general form √(2a² + 2b² + ½) with a + b = ½: its minimum and maximum}}.`}
            en={`In the same way SS-TWR has $\\hat T_f = \\tfrac12[-t_1 + t_2 - t_3 + t_4]$, so $\\sigma_d = c\\,\\sigma_t$. For example $\\sigma_t$ = 100 ps{{ex}} gives a DS-TWR $\\sigma_d$ of ${fmt(dsTwrJitterSigma(5, reply, reply, 1e-10) * 100, 3)} cm{{der:ch1#jitter|(√3/2)·c·100 ps|(√3/2)·c·100 ps}}. Conversely, the TWR range noise of the current settings, {{cfg:uwb.sigmaTwr}}, corresponds to each timestamp jittering by about ${fmt(sigT0 * 1e12, 3)} ps{{der:ch1#jitter|σ_d ÷ ((√3/2)·c)|σ_d ÷ ((√3/2)·c)}}. The general expression for unequal reply delays is in the engine (\`dsTwrJitterSigma\`); its coefficient moves between 0.87 and 1{{der:ch1#jitter|일반식 √(2a² + 2b² + ½), a + b = ½ 의 최소·최대|general form √(2a² + 2b² + ½) with a + b = ½: its minimum and maximum}}.`} />
        </Derivation>
        <P ko="이론이 맞는지 수백 번의 교환을 돌려 확인합니다. 같은 타임스탬프를 SS-TWR 식과 DS-TWR 식에 각각 넣어 봅니다. 지터는 분포의 **폭**을 만들고, 드리프트는 분포의 **중심**을 옮긴다는 점을 눈으로 구분해 보세요."
          en="Let us check the theory with hundreds of exchanges, feeding the same timestamps to both the SS-TWR and the DS-TWR formula. See for yourself that jitter sets the **width** of the distribution while drift moves its **centre**." />
        <JitterPanel />
        <Note>
          <P ko={`**분해능은 정확도가 아닙니다.** UWB 칩의 타임스탬프 한 눈금(1틱)은 약 15.65 ps{{lit:dw1000/timestamp-resolution}} 이고, 거리로는 ${lenText(tickM)}{{der:ch1#ns-to-m|c × 1틱|c × one tick}} 입니다. 이 숫자를 보고 'UWB 는 mm 단위로 잰다'고 생각하기 쉽습니다. 하지만 눈금이 촘촘한 것과 사건이 그 눈금에 정확히 찍히는 것은 별개의 일입니다. 시스템 문서가 말하는 정확도는 10 cm 수준{{lit:lps-docs/accuracy}}으로, 한 눈금의 약 ${fmt(0.1 / tickM, 2)}배{{der:ch1#ns-to-m|10 cm ÷ (c × 1틱)|10 cm ÷ (c × one tick)}} 입니다. 예산에 넣을 값은 눈금 크기가 아니라 **실제로 잰 측정값의 흩어짐**이어야 합니다. 그 측정은 9장에서 합니다.`}
            en={`**Resolution is not accuracy.** One step (tick) of the UWB chip’s timestamp is about 15.65 ps{{lit:dw1000/timestamp-resolution}}, or ${lenText(tickM)}{{der:ch1#ns-to-m|c × 1틱|c × one tick}} of distance. It is tempting to conclude that UWB measures to the millimetre. But a fine scale and an event being stamped exactly on that scale are two different things. The accuracy the system documentation speaks of is in the 10 cm range{{lit:lps-docs/accuracy}} — about ${fmt(0.1 / tickM, 2)} times{{der:ch1#ns-to-m|10 cm ÷ (c × 1틱)|10 cm ÷ (c × one tick)}} one tick. What goes into the budget must be **the scatter of real measurements**, not the size of a tick. Chapter 9 makes that measurement.`} />
        </Note>
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <ReplyPitfall />
      </Section>

      <Section id="settings" title={{ ko: '우리 시스템의 값 넣기', en: 'Plugging in our system' }}>
        <P ko={`아래 값은 전역 설정과 연결되어 있습니다. 여기서 바꾸면 오차 예산과 다른 장의 데모가 함께 바뀝니다. 측위 모드는 지금 **${cfg.uwb.mode === 'twr' ? 'TWR' : 'TDoA'}** 이고(설정에서 바꿀 수 있습니다), 그 모드의 측정 노이즈가 예산의 $\\sigma_r$ 로 들어갑니다. TDoA 에서 재는 것은 거리가 아니라 두 앵커까지의 **거리 차**인데, 그 이야기는 2장과 3장에서 합니다.`}
          en={`The values below are tied to the global settings. Changing them here also changes the error budget and the demos in other chapters. The positioning mode is currently **${cfg.uwb.mode === 'twr' ? 'TWR' : 'TDoA'}** (change it in Settings), and the measurement noise of that mode enters the budget as $\\sigma_r$. In TDoA the measured quantity is not a range but the **difference of ranges** to two anchors; chapters 2 and 3 cover that.`} />
        <div class="controls">
          <CfgSlider path={sigmaPath(cfg.uwb.mode)} max={50} />
          <CfgSlider path="uwb.clockDriftPpm" max={50} />
          <CfgSlider path="uwb.replyDelay" />
        </div>
        <StatRow>
          <Stat label={{ ko: '거리(거리차) 측정 노이즈 $\\sigma_r$', en: 'Range(-difference) noise $\\sigma_r$' }} value={noiseItem * 100} unit="cm" src={ex(sigmaPath(cfg.uwb.mode))} />
          <Stat label={{ ko: 'SS-TWR 였다면: 드리프트 오차', en: 'If it were SS-TWR: drift error' }} value={fmt(len(driftItem).v)} unit={len(driftItem).unit} src={der('ch1#ss-drift', { ko: '½·c·(e_A − e_B)·T_reply, 두 시계가 반대로 어긋난 최악의 경우', en: '½·c·(e_A − e_B)·T_reply, worst case of clocks off in opposite directions' })} status={driftItem > noiseItem ? 'bad' : driftItem > noiseItem / 10 ? 'warn' : 'good'} />
          <Stat label={{ ko: 'DS-TWR: 남는 드리프트 오차 (강당 대각선)', en: 'DS-TWR: remaining drift error (hall diagonal)' }} value={fmt(len(dsTwrResidual(hallDiag, { eA: p * PPM, eB: p * PPM })).v)} unit={len(dsTwrResidual(hallDiag, { eA: p * PPM, eB: p * PPM })).unit} src={der('ch1#ds-twr', { ko: 'd·(e_A + e_B)/2, 두 시계가 같은 쪽으로 어긋난 최악의 경우', en: 'd·(e_A + e_B)/2, worst case of clocks off the same way' })} status="good" />
          <Stat label={{ ko: 'TWR 노이즈에 해당하는 타임스탬프 지터', en: 'Timestamp jitter equivalent to the TWR noise' }} value={sigT0 * 1e12} unit="ps" src={der('ch1#jitter', { ko: 'σ_TWR ÷ ((√3/2)·c)', en: 'σ_TWR ÷ ((√3/2)·c)' })} />
        </StatRow>
        <P ko="$\sigma_r$ 의 처음 값은 출처 없는 예시값입니다. 참고로 Crazyflie 펌웨어의 추정기는 TWR 거리의 표준편차를 0.25 m{{lit:cf-firmware-docs/twr-noise-std}}, TDoA 거리 차의 표준편차를 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}} 로 **가정**하고 계산합니다. 이것은 필터에 넣어 둔 값이지 여러분 강당에서 잰 값이 아닙니다. 9장에서 드론을 가만히 세워 두고 직접 재서 이 칸을 채웁니다."
          en="The initial $\sigma_r$ is an example value with no source. For reference, the estimator in the Crazyflie firmware **assumes** a standard deviation of 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} for TWR ranges and 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}} for TDoA range differences. Those are values put into the filter, not values measured in your hall. In chapter 9 you fill this blank by measuring it yourself with the drone standing still." />
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 1,
  title: { ko: 'UWB는 거리를 어떻게 재나', en: 'How UWB measures distance' },
  lead: { ko: '전파가 날아간 시간을 재서 거리를 구합니다. 두 장치의 시계가 맞지 않아도 거리를 잴 수 있게 해 주는 양방향 측정을 따라가고, 시계의 빠르기 차이가 어떻게 거리 오차가 되는지, 그것을 어떻게 지우는지 봅니다.', en: 'Distance comes from timing the flight of a radio signal. We follow two-way ranging, which works even though the two clocks disagree, and see how a difference in clock rate turns into range error — and how to cancel it.' },
  objectives: [
    { ko: '비행시간으로 거리를 구하고, 시간 오차를 거리 오차로 환산한다 (1 ns 는 약 30 cm).', en: 'Obtain distance from time of flight and convert timing error into range error (1 ns is about 30 cm).' },
    { ko: 'SS-TWR 과 DS-TWR 의 식을 타이밍 그림에서 유도하고, 클럭 주파수 오차가 각각에 남기는 거리 오차를 계산한다.', en: 'Derive the SS-TWR and DS-TWR formulas from the timing diagram and compute the range error clock frequency error leaves in each.' },
    { ko: '타임스탬프 6개로 DS-TWR 거리를 계산하는 함수를 쓰고, 타임스탬프 지터가 거리 노이즈 $\\sigma_r$ 이 되는 관계를 설명한다.', en: 'Write a function computing the DS-TWR distance from six timestamps, and explain how timestamp jitter becomes the range noise $\\sigma_r$.' },
  ],
  Body,
  budget: {
    items: ['range-noise', 'clock-drift'],
    note: {
      ko: '이 장은 예산의 **첫 빈칸**인 거리(거리차) 측정 노이즈 $\\sigma_r$ 을 채웁니다. 뒤의 장들은 모두 이 값에서 출발합니다. 2장은 여기에 앵커 기하를 곱해 위치 오차로 바꾸고, 4장은 NLOS 를 반영해 고칩니다. 둘째 줄의 클럭 드리프트 오차는 예산에 **더하지 않는** 참고값입니다. SS-TWR 로 쟀다면 치렀을 값을 보여 줄 뿐입니다. 펌웨어의 TWR 은 DS-TWR 식을 쓰므로{{lit:cf-firmware-docs/twr-formula-in-firmware}} 이 항이 거리의 수 ppm 으로 줄어들고, TDoA 에서는 태그가 듣기만 하고 응답하지 않으므로{{lit:lps-docs/tdoa-passive-unlimited-tags}} 태그 쪽 응답 지연이라는 것이 아예 없습니다(TDoA 가 시계를 다루는 방법은 3장).',
      en: 'This chapter fills the **first blank** of the budget: the range(-difference) measurement noise $\\sigma_r$. Every later chapter starts from it — chapter 2 multiplies it by the anchor geometry to get position error, chapter 4 corrects it for NLOS. The clock-drift row is a reference value that is **not added** to the budget; it only shows what SS-TWR would have cost. The firmware’s TWR uses the DS-TWR formula{{lit:cf-firmware-docs/twr-formula-in-firmware}}, which shrinks this term to a few ppm of the distance, and in TDoA the tag only listens and never replies{{lit:lps-docs/tdoa-passive-unlimited-tags}}, so there is no tag-side reply delay at all (how TDoA deals with clocks is in chapter 3).',
    },
  },
  summary: [
    { ko: '거리는 빛의 속도 × 비행시간이다. 1 ns 의 시간 오차가 약 30 cm 이므로, 두 장치의 시각을 맞추는 대신 답장을 주고받아 각자의 시계로 시간 차이만 잰다(TWR).', en: 'Distance is the speed of light × time of flight. A 1 ns timing error is about 30 cm, so instead of synchronising clocks the devices exchange a reply and each times only differences on its own clock (TWR).' },
    { ko: 'SS-TWR 의 오차는 $\\tfrac12 c\\,(e_A - e_B)\\,T_{reply}$ 로, 응답 지연과 두 시계의 빠르기 차이에 비례해 m 단위까지 커진다. 메시지를 하나 더 보내는 DS-TWR 은 응답 지연을 식에서 지워 오차를 거리 × 평균 클럭 오차로 줄인다.', en: 'The SS-TWR error is $\\tfrac12 c\\,(e_A - e_B)\\,T_{reply}$: proportional to the reply delay and the clock-rate difference, reaching metres. DS-TWR, with one more message, removes the reply delay from the formula and cuts the error to distance × mean clock error.' },
    { ko: '드리프트를 지우고 남는 것은 타임스탬프 지터가 만드는 거리 노이즈 $\\sigma_r \\approx 0.87\\,c\\,\\sigma_t$ 이고, 이것이 오차 예산의 첫 칸이다. 타임스탬프의 분해능(약 4.7 mm)은 정확도가 아니다.', en: 'What remains after the drift is the range noise from timestamp jitter, $\\sigma_r \\approx 0.87\\,c\\,\\sigma_t$ — the first blank of the error budget. Timestamp resolution (about 4.7 mm) is not accuracy.' },
  ],
  next: { ko: '이제 앵커 하나까지의 거리를 $\\sigma_r$ 의 오차로 잴 수 있습니다. 하지만 거리 하나가 말해 주는 것은 "앵커를 중심으로 한 구면 위 어딘가"일 뿐, 위치가 아닙니다. 위치를 정하려면 앵커가 몇 개 필요하고, 어디에 달아야 할까요? 같은 $\\sigma_r$ 인데도 앵커 배치에 따라 위치 오차가 몇 배씩 달라지는 이유는 무엇일까요?', en: 'We can now measure the distance to one anchor with an error of $\\sigma_r$. But one distance only says "somewhere on a sphere around the anchor" — it is not a position. How many anchors does a position need, and where should they go? And why does the same $\\sigma_r$ give position errors several times apart depending on the anchor layout?' },
  tasks,
};
export default def;
