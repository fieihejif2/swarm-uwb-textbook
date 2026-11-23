import { useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { commHops } from '../../sim/budget';
import { simulateConsensus } from '../../sim/consensus';
import { GraphKind, adjacency, laplacian, laplacianSpectrum } from '../../sim/graph';
import { LossParams, burstLengthQuantile, lossRunLengths, simulateLoss, stationaryLossRate } from '../../sim/loss';
import { meanRunLength, runLengthPmf, runProbs } from '../../sim/ch8_burst';
import { swarmFromConfig } from '../../sim/scenario';
import { simulateSwarm } from '../../sim/swarm';
import { der, ex } from '../../sources';
import {
  Button, Caption, CfgSlider, CfgVal, CodeTask, CodeView, Demo, Derivation, Histogram, LineChart, LinkGroup, List, M, Note, P, Pitfall, Predict, Section, Segmented, Slider, SrcBadge,
  Stat, StatRow, Status, T, seriesColor, useDebounced,
} from '../../ui';
import { delayMarginTask, gilbertTask, tasks } from './tasks';

const GRAPHS: { value: GraphKind; label: { ko: string; en: string } }[] = [
  { value: 'complete', label: { ko: '완전', en: 'Complete' } },
  { value: 'ring', label: { ko: '고리', en: 'Ring' } },
  { value: 'star', label: { ko: '별', en: 'Star' } },
  { value: 'path', label: { ko: '일렬', en: 'Path' } },
];
const X0 = [0.9, -0.4, 0.3, -1.0, 0.55];
const SIM = der('ch7#laplacian', { ko: '이 장의 합의 모델 ẋ = −kLx 를 고정 스텝(오일러)으로 적분한 결과', en: 'The consensus model ẋ = −kLx of this chapter, integrated with a fixed Euler step' });
const SIM_DELAY = der('ch7#delay-bound', { ko: '지연이 있는 합의 모델 ẋ = −kLx(t−τ) (P2P 에서는 이웃 항만 지연)를 고정 스텝(오일러)으로 적분한 결과', en: 'The delayed consensus model ẋ = −kLx(t−τ) (only the neighbour terms delayed for P2P), integrated with a fixed Euler step' });
const LOCAL = { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' };

/** 드론 5대의 이웃 관계 그림 */
function GraphPicture({ kind }: { kind: GraphKind }) {
  const A = adjacency(kind, 5);
  const pts = Array.from({ length: 5 }, (_, i) => [90 + 62 * Math.cos((2 * Math.PI * i) / 5 - Math.PI / 2), 82 + 62 * Math.sin((2 * Math.PI * i) / 5 - Math.PI / 2)]);
  const edges: [number, number][] = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (A[i][j]) edges.push([i, j]);
  return (
    <svg width="180" height="170" viewBox="0 0 180 170" role="img" aria-label={tr({ ko: `드론 5대의 이웃 관계: 연결 ${edges.length}개`, en: `Neighbour graph of five drones: ${edges.length} links` })}>
      {edges.map(([i, j]) => <line key={`${i}-${j}`} x1={pts[i][0]} y1={pts[i][1]} x2={pts[j][0]} y2={pts[j][1]} stroke="var(--text-3)" stroke-width="2" />)}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="14" fill={seriesColor(i + 1)} stroke="var(--surface)" stroke-width="2" />
          <text x={p[0]} y={p[1] + 4} text-anchor="middle" fill="#fff" font-size="12" font-weight="700">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function LaplacianDemo() {
  const cfg = config.value;
  const [kind, setKind] = useState<GraphKind>('ring');
  const [gain, setGain] = useState(cfg.comm.gain);
  const A = adjacency(kind, 5), L = laplacian(A), spec = laplacianSpectrum(L);
  const lam2 = spec[1];
  const res = useMemo(() => simulateConsensus({ A, x0: X0, gain, tau: 0, dt: 0.002, T: Math.min(40, 14 / (gain * lam2)), recordEvery: 5 }), [kind, gain]);
  const theory = res.t.map((t) => res.disagreement[0] * Math.exp(-gain * lam2 * t));
  const texL = String.raw`L = \begin{bmatrix}` + L.map((r) => r.map((v) => (v < 0 ? `-${-v}` : String(v))).join(' & ')).join(String.raw` \\ `) + String.raw`\end{bmatrix}`;
  return (
    <Demo title={{ ko: '그래프를 바꾸면 라플라시안과 수렴 속도가 바뀐다', en: 'Changing the graph changes the Laplacian and the convergence speed' }} testId="ch7-laplacian-demo">
      <Segmented label={{ ko: '이웃 관계(그래프)', en: 'Neighbour graph' }} value={kind} onChange={setKind} options={GRAPHS} testId="ch7-graph" />
      <div class="grid-2">
        <div>
          <GraphPicture kind={kind} />
          <M block tex={texL} />
        </div>
        <div>
          <StatRow>
            <Stat label={{ ko: '$\\lambda_2$ (대수적 연결도)', en: '$\\lambda_2$ (algebraic connectivity)' }} value={lam2} src={der('ch7#laplacian', { ko: '위 행렬 L 의 두 번째로 작은 고유값', en: 'Second-smallest eigenvalue of the matrix L above' })} />
            <Stat label={{ ko: '$\\lambda_N$ (최대 고유값)', en: '$\\lambda_N$ (largest eigenvalue)' }} value={spec[4]} src={der('ch7#laplacian', { ko: '위 행렬 L 의 가장 큰 고유값', en: 'Largest eigenvalue of the matrix L above' })} />
          </StatRow>
          <p class="small muted">{tr({ ko: '고유값 전체', en: 'All eigenvalues' })}: {spec.map((v) => fmt(v, 3)).join(', ')}<SrcBadge src={der('ch7#laplacian')} /></p>
          <Slider label={{ ko: '게인 $k$', en: 'Gain $k$' }} value={gain} min={0.2} max={5} step={0.1} unit="1/s" onChange={setGain} src={ex('comm.gain', { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch7-lap-gain" />
        </div>
      </div>
      <LineChart
        title={{ ko: '지연이 없을 때 불일치가 줄어드는 속도 (세로축은 로그)', en: 'How fast the disagreement shrinks without delay (log vertical axis)' }}
        xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '불일치 ‖x − 평균‖', en: 'Disagreement ‖x − mean‖' }} yLog
        series={[
          { name: { ko: '시뮬레이션', en: 'Simulation' }, x: res.t, y: res.disagreement, slot: 1, dash: '' },
          { name: { ko: '이론: e^(−kλ₂t)', en: 'Theory: e^(−kλ₂t)' }, x: res.t, y: theory, slot: 2, dash: '7 4' },
        ]}
        yDomain={[res.disagreement[0] * 1e-6, res.disagreement[0] * 2]} src={SIM} testId="ch7-decay-chart" />
      <Caption>{tr(kind === 'complete'
        ? { ko: '완전 그래프는 0 이 아닌 고유값이 모두 같아서(전부 λ₂) 모든 성분이 같은 속도로 줄어듭니다. 그래서 두 선이 처음부터 겹칩니다. 다른 그래프를 골라 보세요.', en: 'In the complete graph all non-zero eigenvalues are equal (all λ₂), so every component decays at the same rate and the two lines overlap from the start. Try another graph.' }
        : { ko: '처음에는 더 빠른 모드들이 섞여 있어 이론선보다 빨리 줄다가, 곧 가장 느린 모드(λ₂)만 남아 두 선의 기울기가 같아집니다.', en: 'At first faster modes are mixed in and the curve drops faster than the theory line; soon only the slowest mode (λ₂) remains and the slopes match.' })}</Caption>
    </Demo>
  );
}

function DelayDemo() {
  const cfg = config.value;
  const [kind, setKind] = useState<GraphKind>(cfg.comm.graph);
  const [gain, setGain] = useState(cfg.comm.gain);
  const [tauMs, setTauMs] = useState(100);
  const [mode, setMode] = useState<'symmetric' | 'neighborOnly'>('symmetric');
  const prm = useDebounced({ kind, gain, tauMs, mode }, 120);
  const A = useMemo(() => adjacency(prm.kind, 5), [prm.kind]);
  const lamN = laplacianSpectrum(laplacian(A))[4];
  const tauStar = Math.PI / (2 * prm.gain * lamN);
  const res = useMemo(() => simulateConsensus({ A, x0: X0, gain: prm.gain, tau: prm.tauMs / 1000, dt: 0.002, T: 12, mode: prm.mode, recordEvery: 5 }), [A, prm]);
  // 지연을 쓸어 가며 "끝에서의 불일치 / 처음 불일치" 를 구한다 → 이론 한계선과 겹쳐 그린다
  const sweep = useMemo(() => {
    const taus: number[] = [], ratio: number[] = [];
    const tMax = Math.min(1.2, 2.2 * tauStar);
    for (let i = 0; i <= 44; i++) {
      const tau = (tMax * i) / 44;
      const r = simulateConsensus({ A, x0: X0, gain: prm.gain, tau, dt: 0.002, T: 12, mode: prm.mode, recordEvery: 50 });
      taus.push(tau * 1000);
      ratio.push(Math.min(1e6, Math.max(1e-9, r.disagreement[r.disagreement.length - 1] / r.disagreement[0])));
    }
    return { taus, ratio };
  }, [A, prm.gain, prm.mode]);
  const tauLoop = budget.value.loopDelay * 1000;
  const diverging = prm.mode === 'symmetric' && prm.tauMs / 1000 > tauStar;
  const yMax = Math.max(1.5, ...res.x.flat().map(Math.abs).filter(Number.isFinite));
  return (
    <LinkGroup>
      <Demo title={{ ko: '지연을 키워 한계를 넘겨 보기', en: 'Push the delay past the bound' }} testId="ch7-delay-demo">
        <P ko="드론 5대가 한 축 위에서 같은 값(예: 같은 고도, 같은 전진 위치)에 뜻을 모으는 과정입니다. 지연 슬라이더를 오른쪽으로 밀어 이론 한계 $\tau^*$ 를 넘겨 보세요. 수식의 항에 마우스를 올리면 아래 코드와 그래프에서 같은 것이 강조됩니다."
          en="Five drones agree on one value along a single axis (same altitude, same forward position…). Push the delay slider past the theoretical bound $\tau^*$. Hover a term of the formula to highlight the same thing in the code and the chart." />
        <M block tex={String.raw`\lk{tau}{\tau^{*}} \;=\; \frac{\pi}{2\,\lk{gain}{k}\,\lk{lamN}{\lambda_N}}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 코드 줄과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines and chart line.' })}</p>
        <Segmented label={{ ko: '지연이 걸리는 자리', en: 'Where the delay sits' }} value={mode} onChange={setMode} testId="ch7-mode" options={[
          { value: 'symmetric', label: { ko: '중앙집중: 자기 위치도 늦게 반영', en: 'Centralised: own state is delayed too' } },
          { value: 'neighborOnly', label: { ko: 'P2P: 이웃 정보만 늦음', en: 'P2P: only neighbours are delayed' } },
        ]} />
        <Segmented label={{ ko: '그래프', en: 'Graph' }} value={kind} onChange={setKind} options={GRAPHS} testId="ch7-delay-graph" />
        <div class="controls">
          <Slider label={{ ko: `루프 지연 $\\tau$ (지금 전역 설정이면 약 ${fmt(tauLoop, 3)} ms)`, en: `Loop delay $\\tau$ (about ${fmt(tauLoop, 3)} ms with the current global settings)` }} value={tauMs} min={0} max={800} step={5} unit="ms" onChange={setTauMs} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 편도 통신 지연이 아니라, 측정부터 명령이 기체를 움직이기까지 걸리는 루프 전체의 지연입니다.', en: 'Local to this demo. Not the one-way comm delay but the whole loop delay, from measurement until the command moves the vehicle.' })} testId="ch7-tau" />
          <Slider label={{ ko: '게인 $k$', en: 'Gain $k$' }} value={gain} min={0.2} max={5} step={0.1} unit="1/s" onChange={setGain} src={ex('comm.gain', LOCAL)} testId="ch7-gain" />
        </div>
        <StatRow>
          <Stat label={{ ko: '$\\lambda_N$', en: '$\\lambda_N$' }} value={lamN} src={der('ch7#laplacian')} />
          <Stat label={{ ko: '이론 한계 $\\tau^*$', en: 'Theoretical bound $\\tau^*$' }} value={tauStar * 1000} unit="ms" src={der('ch7#delay-bound')} />
          <Stat label={{ ko: '지금 지연', en: 'Current delay' }} value={tauMs} unit="ms" src={ex(undefined, { ko: '위 슬라이더 값', en: 'The slider above' })} status={diverging ? 'bad' : 'good'} />
        </StatRow>
        <p>{diverging
          ? <Status kind="bad">{tr({ ko: '한계를 넘었습니다: 진동이 점점 커집니다', en: 'Past the bound: the oscillation keeps growing' })}</Status>
          : prm.mode === 'neighborOnly'
            ? <Status kind="good">{tr({ ko: '이 구조는 지연이 길어도 발산하지 않습니다 (대신 느려집니다)', en: 'This structure does not diverge however long the delay (it only gets slower)' })}</Status>
            : <Status kind="good">{tr({ ko: '한계 안쪽: 수렴합니다', en: 'Inside the bound: it converges' })}</Status>}</p>
        <LineChart
          title={{ ko: '드론 5대의 상태', en: 'States of the five drones' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '상태 x (임의 단위)', en: 'State x (arbitrary unit)' }}
          series={X0.map((_, i) => ({ name: { ko: `드론 ${i + 1}`, en: `Drone ${i + 1}` }, x: res.t, y: res.x.map((row) => row[i]) }))}
          yDomain={[-Math.min(yMax, 3) * 1.1, Math.min(yMax, 3) * 1.1]} height={230} src={SIM_DELAY} testId="ch7-states-chart" />
        <LineChart
          title={{ ko: '지연을 쓸어 보기: 12초 뒤 불일치가 처음의 몇 배인가 (세로축은 로그)', en: 'Delay sweep: disagreement after 12 s relative to the start (log vertical axis)' }}
          xLabel={{ ko: '지연 τ [ms]', en: 'Delay τ [ms]' }} yLabel={{ ko: '끝 / 처음 불일치', en: 'Final / initial disagreement' }} yLog
          series={[{ name: { ko: '시뮬레이션', en: 'Simulation' }, x: sweep.taus, y: sweep.ratio, slot: 1 }]}
          refLines={[
            { x: tauStar * 1000, label: { ko: `이론 한계 τ* = ${fmt(tauStar * 1000, 3)} ms`, en: `Theory τ* = ${fmt(tauStar * 1000, 3)} ms` }, slot: 2, link: 'tau' },
            { x: tauMs, label: { ko: '지금 지연', en: 'Current delay' }, slot: 3 },
            { y: 1, label: { ko: '1 (커지지도 줄지도 않음)', en: '1 (neither grows nor shrinks)' } },
          ]}
          height={240} src={SIM_DELAY} testId="ch7-sweep-chart" />
        <Caption>{tr({ ko: `중앙집중 구조에서는 시뮬레이션 곡선이 1 을 넘는 지점이 이론 한계선과 겹칩니다. 지금 전역 설정의 루프 지연은 약 ${fmt(tauLoop, 3)} ms 입니다.`, en: `In the centralised structure the simulation curve crosses 1 exactly at the theoretical line. With the current global settings the loop delay is about ${fmt(tauLoop, 3)} ms.` })}<SrcBadge src={der('ch7#loop-delay')} /></Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch7-delay-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (이 절 끝 손코딩 과제의 기준 답안입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference solution of the coding task at the end of this section — keep it closed if you want to try first)' })}</summary>
          <CodeView code={delayMarginTask.solution} links={delayMarginTask.links} />
        </details>
      </Demo>
    </LinkGroup>
  );
}

function LossDemo() {
  const cfg = config.value;
  const [pGB, setPGB] = useState(cfg.comm.loss.pGB);
  const [pBG, setPBG] = useState(cfg.comm.loss.pBG);
  const [hG, setHG] = useState(cfg.comm.loss.lossGood);
  const [hB, setHB] = useState(cfg.comm.loss.lossBad);
  const ge: LossParams = { model: 'ge', p: 0, pGB, pBG, lossGood: hG, lossBad: hB };
  const rate = stationaryLossRate(ge);
  const bern: LossParams = { model: 'bernoulli', p: rate, pGB: 0, pBG: 1, lossGood: 0, lossBad: 1 };
  const { seqG, seqB, runsG, runsB } = useMemo(() => {
    const g = simulateLoss(ge, 200000, 11), b = simulateLoss(bern, 200000, 12);
    return { seqG: g, seqB: b, runsG: lossRunLengths(g), runsB: lossRunLengths(b) };
  }, [pGB, pBG, hG, hB]);
  const aG = runProbs(ge, 40), aB = runProbs(bern, 40);
  const period = 1000 / cfg.comm.rate;
  const qG = burstLengthQuantile(ge, 1e-3), qB = burstLengthQuantile(bern, 1e-3);
  const same = pGB === cfg.comm.loss.pGB && pBG === cfg.comm.loss.pBG && hG === cfg.comm.loss.lossGood && hB === cfg.comm.loss.lossBad;
  const strip = (seq: Uint8Array, label: string) => (
    <div style={{ marginBottom: '8px' }}>
      <div class="small muted">{label}</div>
      <div role="img" aria-label={`${label}: ${Array.from(seq.slice(0, 120)).filter(Boolean).length} / 120`} style={{ display: 'grid', gridTemplateColumns: 'repeat(40, 1fr)', gap: '2px' }}>
        {Array.from(seq.slice(0, 120)).map((v, i) => (
          <span key={i} style={{ height: '10px', borderRadius: '2px', background: v ? 'var(--critical)' : 'var(--surface-3)', outline: v ? '1px solid var(--text)' : 'none', outlineOffset: '-1px' }} />
        ))}
      </div>
    </div>
  );
  const SRC = der('ch7#ge-stationary', { ko: '아래 네 확률로 패킷 20만 개를 시뮬레이션한 결과와, 유도의 연속 손실 길이 분포', en: 'Simulation of 200,000 packets with the four probabilities below, and the burst-length distribution of the derivation' });
  return (
    <Demo title={{ ko: '같은 손실률, 다른 손실 모양', en: 'Same loss rate, different loss pattern' }} testId="ch7-loss-demo">
      <P ko="위 줄은 손실이 **몰아서** 일어나는 길버트-엘리엇 모델, 아래 줄은 평균 손실률이 **같은** 베르누이 모델입니다. 테두리가 있는 진한 칸이 손실된 패킷입니다. 네 슬라이더의 처음 값은 오차 예산이 쓰는 **전역 설정**이므로, 아래 숫자는 예산의 통신 공백 항과 같은 값입니다."
        en="The top strip is a Gilbert–Elliott model whose losses come in **bursts**; the bottom strip is a Bernoulli model with the **same** average loss rate. Dark outlined cells are lost packets. The four sliders start from the **global settings** the error budget uses, so the numbers below equal those behind the budget's communication-gap term." />
      <div class="controls">
        <Slider label={{ ko: 'Good→Bad 전이 확률 $p_{GB}$', en: 'Good→Bad probability $p_{GB}$' }} value={pGB} min={0.005} max={0.3} step={0.005} scale={100} unit="%" onChange={setPGB} src={ex('comm.loss.pGB', LOCAL)} testId="ch7-pgb" />
        <Slider label={{ ko: 'Bad→Good 전이 확률 $p_{BG}$', en: 'Bad→Good probability $p_{BG}$' }} value={pBG} min={0.05} max={1} step={0.01} scale={100} unit="%" onChange={setPBG} src={ex('comm.loss.pBG', LOCAL)} testId="ch7-pbg" />
        <Slider label={{ ko: 'Good 상태의 손실 확률 $h_G$', en: 'Loss probability in Good $h_G$' }} value={hG} min={0} max={0.2} step={0.005} scale={100} unit="%" onChange={setHG} src={ex('comm.loss.lossGood', LOCAL)} testId="ch7-hg" />
        <Slider label={{ ko: 'Bad 상태의 손실 확률 $h_B$', en: 'Loss probability in Bad $h_B$' }} value={hB} min={0.3} max={1} step={0.01} scale={100} unit="%" onChange={setHB} src={ex('comm.loss.lossBad', LOCAL)} testId="ch7-hb" />
      </div>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => { setHG(0); setHB(1); }} testId="ch7-loss-simple">{tr({ ko: '단순화: Good 에서는 안 잃고 Bad 에서는 다 잃기', en: 'Simplify: lose nothing in Good, everything in Bad' })}</Button>
        <Button onClick={() => { setPGB(cfg.comm.loss.pGB); setPBG(cfg.comm.loss.pBG); setHG(cfg.comm.loss.lossGood); setHB(cfg.comm.loss.lossBad); }}>{tr({ ko: '전역 설정값으로 되돌리기', en: 'Back to the global settings' })}</Button>
      </div>
      {strip(seqG, tr({ ko: '길버트-엘리엇 (처음 120개 패킷)', en: 'Gilbert–Elliott (first 120 packets)' }))}
      {strip(seqB, tr({ ko: '베르누이 (처음 120개 패킷)', en: 'Bernoulli (first 120 packets)' }))}
      <StatRow>
        <Stat label={{ ko: '평균 손실률 (두 모델 공통)', en: 'Average loss rate (both models)' }} value={rate * 100} unit="%" src={der('ch7#ge-stationary')} />
        <Stat label={{ ko: '평균 연속 손실 길이 (GE)', en: 'Mean burst length (GE)' }} value={meanRunLength(aG)} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary', { ko: 'a₁ / (a₁ − a₂). 단순화한 경우 1 / p_BG', en: 'a₁ / (a₁ − a₂); 1 / p_BG in the simplified case' })} />
        <Stat label={{ ko: '1000번에 1번 나오는 연속 손실 $L_{99.9}$ (GE)', en: '1-in-1000 burst $L_{99.9}$ (GE)' }} value={qG} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary', { ko: `a_L ≤ 10⁻³ 인 가장 작은 L (a_${qG - 1} = ${fmt(aG[qG - 1], 2)}, a_${qG} = ${fmt(aG[qG], 2)})`, en: `Smallest L with a_L ≤ 10⁻³ (a_${qG - 1} = ${fmt(aG[qG - 1], 2)}, a_${qG} = ${fmt(aG[qG], 2)})` })} status={qG > 2 * qB ? 'warn' : undefined} />
        <Stat label={{ ko: '같은 기준, 베르누이', en: 'Same criterion, Bernoulli' }} value={qB} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary', { ko: 'p^L ≤ 10⁻³ 인 가장 작은 L', en: 'Smallest L with p^L ≤ 10⁻³' })} />
      </StatRow>
      <div class="grid-2">
        <Histogram title={{ ko: '연속 손실 길이: 길버트-엘리엇', en: 'Burst lengths: Gilbert–Elliott' }} values={runsG} bins={15} range={[0.5, 15.5]}
          xLabel={{ ko: '연속 손실 길이 [패킷]', en: 'Burst length [packets]' }} slot={1} src={SRC}
          theory={{ name: { ko: hG === 0 && hB === 1 ? '이론: 기하분포' : '이론: 유도의 분포', en: hG === 0 && hB === 1 ? 'Theory: geometric' : 'Theory: derived distribution' }, pdf: (x) => runLengthPmf(aG, Math.max(1, Math.round(x))) }} />
        <Histogram title={{ ko: '연속 손실 길이: 베르누이', en: 'Burst lengths: Bernoulli' }} values={runsB} bins={15} range={[0.5, 15.5]}
          xLabel={{ ko: '연속 손실 길이 [패킷]', en: 'Burst length [packets]' }} slot={2} src={SRC}
          theory={{ name: { ko: '이론: 기하분포', en: 'Theory: geometric' }, pdf: (x) => runLengthPmf(aB, Math.max(1, Math.round(x))) }} />
      </div>
      <Caption>{tr({ ko: '두 그림의 세로축(횟수) 눈금은 서로 다릅니다. 막대 높이가 아니라 분포의 모양 — 오른쪽으로 얼마나 길게 꼬리를 끄는지 — 를 비교하세요. 손실률이 같아도 길버트-엘리엇은 횟수가 적은 대신 한 번에 길게 빠집니다.', en: 'The vertical (count) scales of the two plots differ. Compare the shape — how far the tail reaches to the right — not the bar heights. At the same loss rate, Gilbert–Elliott has fewer bursts but longer ones.' })}</Caption>
      <P ko={`방송 주기가 ${fmt(period, 3)} ms{{ex:comm.rate}} 이므로, 길버트-엘리엇에서 1000번에 1번 나오는 공백은 ${fmt(qG * period, 3)} ms{{der:ch7#ge-stationary}}, 베르누이에서는 ${fmt(qB * period, 3)} ms{{der:ch7#ge-stationary}} 입니다. 손실률이 같아도 대비해야 할 공백 시간은 몇 배씩 차이 납니다.${same ? ' 지금 값은 전역 설정과 같으므로, 이 공백이 오차 예산의 통신 공백 항에 그대로 들어갑니다(이 장 끝 **우리 시스템의 값 넣기**).' : ' 지금 값은 전역 설정과 다르므로 오차 예산에는 반영되지 않습니다.'}`}
        en={`With a broadcast period of ${fmt(period, 3)} ms{{ex:comm.rate}}, the 1-in-1000 gap is ${fmt(qG * period, 3)} ms{{der:ch7#ge-stationary}} for Gilbert–Elliott and ${fmt(qB * period, 3)} ms{{der:ch7#ge-stationary}} for Bernoulli. The same loss rate can mean several times the gap you must plan for.${same ? ' These values equal the global settings, so this gap goes straight into the communication-gap term of the error budget (see **Plugging in our system** at the end of this chapter).' : ' These values differ from the global settings, so the error budget does not use them.'}`} />
    </Demo>
  );
}

function GainPitfall() {
  const cfg = config.value;
  const [scale, setScale] = useState(3);
  const [data, setData] = useState<{ k: number[]; err: number[]; scale: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const KS = [0.2, 0.4, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  const loop = (commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0)) * scale + 0.5 / cfg.comm.rate;
  const kStar = Math.PI / (2 * budget.value.lambdaN * loop);
  const run = () => {
    // 게인 하나마다 계산을 나눠, 그 사이에 화면이 다시 그려지게 한다(한 덩어리로 2초 가까이 멈추지 않게)
    setBusy(true); setDone(0);
    const errs: number[] = [];
    const step = (i: number) => {
      if (i >= KS.length) { setData({ k: KS, err: errs, scale }); setBusy(false); return; }
      let s = 0;
      for (const seed of [1, 2, 3]) s += simulateSwarm({ ...swarmFromConfig(cfg, { delay: true, noise: true, loss: false }, { seed, gain: KS[i], delayScale: scale, T: 16, gustSigma: 0.15 }), recordEvery: 1e9 }).steadyError;
      errs.push((s / 3) * 100);
      setDone(i + 1);
      setTimeout(() => step(i + 1), 0);
    };
    setTimeout(() => step(0), 30);
  };
  const SRC = der('ch0#model', { ko: '0장의 대형 모델을 게인만 바꿔 가며 시뮬레이션한 결과(시드 3개 평균)', en: 'The formation model of chapter 0 simulated for different gains (mean of three seeds)' });
  return (
    <Pitfall title={{ ko: '지연을 무시하고 게인만 올리기', en: 'Raising the gain while ignoring the delay' }} testId="ch7-pitfall">
      <P ko="'대형이 흐트러지면 게인을 올려서 더 세게 잡으면 되지 않나?' 실제로 자주 하는 조정입니다. 게인을 올리면 돌풍은 더 잘 눌러 주지만, 지연 한계 $\tau^* = \pi/(2k\lambda_N)$ 이 그만큼 줄어듭니다. 지연이 고정이면 **넘으면 안 되는 게인** $k^* = \pi/(2\lambda_N\tau)$ 이 있습니다."
        en="'If the formation is sloppy, just raise the gain and hold it tighter?' — a very common tweak. A higher gain rejects gusts better, but the delay bound $\tau^* = \pi/(2k\lambda_N)$ shrinks with it. For a fixed delay there is a **gain you must not exceed**, $k^* = \pi/(2\lambda_N\tau)$." />
      <Slider label={{ ko: '측위 지연·통신 지연을 몇 배로 키울까 (방송 주기 몫 $T_c/2$ 는 그대로)', en: 'Scale the estimation and comm delays by (the broadcast share $T_c/2$ stays)' }} value={scale} min={1} max={8} step={0.5} unit="×" onChange={setScale} src={ex(undefined, { ko: '이 실험에서만 바꾸는 값. 루프 지연 = (τ_est + 2τ_c) × 배율 + T_c/2 (지상국 중계).', en: 'Local to this experiment. Loop delay = (τ_est + 2τ_c) × multiplier + T_c/2 (ground relay).' })} testId="ch7-pitfall-scale" />
      <StatRow>
        <Stat label={{ ko: '루프 지연 τ', en: 'Loop delay τ' }} value={loop * 1000} unit="ms" src={der('ch7#loop-delay')} />
        <Stat label={{ ko: '넘으면 안 되는 게인 $k^*$', en: 'Gain limit $k^*$' }} value={kStar} unit="1/s" src={der('ch7#delay-bound', { ko: 'π/(2 λ_N τ)', en: 'π/(2 λ_N τ)' })} />
      </StatRow>
      <Button primary onClick={run} disabled={busy} testId="ch7-pitfall-run">{busy ? `${tr({ ko: '계산 중…', en: 'Computing…' })} ${done}/${KS.length}` : tr({ ko: '▶ 게인을 바꿔 가며 대형 오차 재기', en: '▶ Measure formation error across gains' })}</Button>
      {data && (
        <>
          <LineChart
            title={{ ko: '게인에 따른 대형 오차', en: 'Formation error versus gain' }} xLabel={{ ko: '게인 k [1/s]', en: 'Gain k [1/s]' }} yLabel={{ ko: '대형 오차 RMS [cm]', en: 'Formation error RMS [cm]' }}
            series={[{ name: { ko: '시뮬레이션 (게인마다 시드 3개 평균)', en: 'Simulation (mean of 3 seeds per gain)' }, x: data.k, y: data.err, slot: 1 }]}
            refLines={[{ x: Math.PI / (2 * budget.value.lambdaN * ((commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0)) * data.scale + 0.5 / cfg.comm.rate)), label: { ko: '이론 한계 k*', en: 'Theory limit k*' }, slot: 2 }]}
            src={SRC} testId="ch7-pitfall-chart" />
          <P ko="곡선은 U자 모양입니다. 왼쪽에서는 게인이 약해 돌풍을 못 누르고, 오른쪽에서는 지연 때문에 스스로 진동합니다. 가장 낮은 곳은 이론 한계 $k^*$ 의 **절반 근처나 그보다 아래**에 있습니다. 그래서 이 교재는 한계의 절반 이하, 즉 여유 배수 2{{ex|이 교재가 정한 기준입니다. 문헌값이 아니며, 위 곡선처럼 한계 근처에서는 이미 진동이 커진다는 관찰에서 고른 값입니다.|The textbook's own criterion, not a literature value; chosen because, as the curve shows, oscillation already grows near the limit.}} 이상에서 쓰는 것을 기준으로 삼습니다."
            en="The curve is U-shaped. On the left the gain is too weak to reject gusts; on the right the delay makes the loop oscillate by itself. The minimum sits **around half of the theoretical limit $k^*$ or below**. So this textbook uses the criterion of staying below half the limit, i.e. a margin factor of at least 2{{ex|이 교재가 정한 기준입니다. 문헌값이 아니며, 위 곡선처럼 한계 근처에서는 이미 진동이 커진다는 관찰에서 고른 값입니다.|The textbook's own criterion, not a literature value; chosen because, as the curve shows, oscillation already grows near the limit.}}." />
        </>
      )}
    </Pitfall>
  );
}

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const hops = commHops(cfg);
  // 연속 손실: 지금 설정의 L_99.9 와 그 앞뒤의 a_L (엔진의 burstLengthQuantile 과 같은 재귀)
  const lq0 = burstLengthQuantile(cfg.comm.loss, 1e-3);
  const lq = Math.max(1, Math.min(38, Number.isFinite(lq0) ? lq0 : 38));
  const aq = runProbs(cfg.comm.loss, 40);
  const loopMax = cfg.estimation.latency + hops * (cfg.comm.delayMean + cfg.comm.delayJitter) + 1 / cfg.comm.rate;
  const commLag = b.items.find((i) => i.id === 'comm-delay')!.value;
  const gapLag = b.items.find((i) => i.id === 'comm-gap')!.value;
  const marginStatus = (r: number) => (cfg.comm.topology === 'p2p' ? 'good' : r < 1 ? 'bad' : r < 2 ? 'warn' : 'good') as 'good' | 'warn' | 'bad';
  return (
    <>
      <Section id="arch" title={{ ko: '누가 누구의 정보를, 얼마나 늦게 받는가', en: 'Who gets whose information, and how late' }}>
        <P ko="0장의 제어식에서 드론 $i$ 는 이웃 $j$ 의 위치 $\hat p_j$ 가 필요했습니다. 그 정보가 **어떤 길로** 오느냐에 따라 지연이 걸리는 자리가 달라집니다."
          en="In the control law of chapter 0, drone $i$ needs the position $\hat p_j$ of neighbour $j$. **Which path** that information takes decides where the delay sits." />
        <div class="grid-2">
          <div class="card">
            <div class="card-title">{tr({ ko: '지상국 중계 (중앙집중)', en: 'Relay via ground station (centralised)' })}</div>
            <P ko="(이 교재가 가정하는 구조) 기체가 추정한 위치를 **Crazyradio** 로 지상 PC 에 내려보내고, PC 가 모두의 위치를 모아 대형 보정 명령을 계산해 다시 올려보냅니다. 정보가 무선 구간을 **두 번** 건너고, 보정 명령에 쓰이는 자기 자신의 위치도 PC 를 거쳐 늦게 반영됩니다."
              en="(The structure this textbook assumes.) Each vehicle sends its estimated position down to the ground PC over the **Crazyradio**; the PC gathers everyone's positions, computes formation-correction commands and sends them back up. Information crosses the radio **twice**, and even the drone's own position used in that correction is acted on late, via the PC." />
            <P ko="참고로 원래의 Crazyswarm 은 49대를 라디오 3개{{lit:crazyswarm2017/num-radios}}로 날렸고, 그때 측정한 지연이 약 26 ms{{lit:crazyswarm2017/latency}}였습니다(모션캡처 구조, 6장). Crazyswarm2 의 기본 설정은 위치(pose) 로그를 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} 로 받습니다. 즉 아무것도 바꾸지 않으면 지상 PC 가 아는 위치는 방송 주기만으로도 최대 100 ms{{der:ch7#loop-delay|주기 1/10 Hz = 100 ms. 여기에 전송 지연이 더해집니다.|period 1/10 Hz = 100 ms; the transmission delay comes on top}} 묵고, 여기에 전송 지연이 더해집니다."
              en="For reference, the original Crazyswarm flew 49 vehicles with three radios{{lit:crazyswarm2017/num-radios}} and measured a latency of about 26 ms{{lit:crazyswarm2017/latency}} (motion-capture structure, ch. 6). The default Crazyswarm2 configuration logs pose at 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}}, so out of the box the position known to the ground PC can be up to 100 ms{{der:ch7#loop-delay|주기 1/10 Hz = 100 ms. 여기에 전송 지연이 더해집니다.|period 1/10 Hz = 100 ms; the transmission delay comes on top}} old from the logging period alone, plus the transmission delay." />
          </div>
          <div class="card">
            <div class="card-title">{tr({ ko: '기체 간 직접 통신 (P2P)', en: 'Direct between vehicles (P2P)' })}</div>
            <P ko="기체끼리 직접 위치를 주고받고, 각자 **온보드**에서 명령을 계산합니다. 이웃 정보는 무선 구간을 **한 번**만 건너고, 자기 위치는 방금 추정한 값을 바로 씁니다."
              en="Vehicles exchange positions directly and each computes its command **onboard**. Neighbour information crosses the radio **once**, and a drone uses its own freshly estimated position immediately." />
            <P ko="이 교재의 P2P 모델은 5대가 한 채널을 번갈아 쓰며 위치를 방송하고, 놓친 패킷은 다시 보내지 않는다고 **가정합니다**(실제 Crazyflie 의 P2P 동작은 이 교재가 확인한 문헌에 없습니다). 이 교재는 P2P 의 구현 방법은 다루지 않고, **지연이 걸리는 자리가 다르다**는 점만 비교합니다."
              en="The P2P model of this textbook **assumes** that the five vehicles take turns broadcasting positions on one channel and that missed packets are not resent (the actual P2P behaviour of the Crazyflie is not in the literature this textbook verified). This textbook does not cover how to implement P2P; it only compares **where the delay sits**." />
          </div>
        </div>
        <h3>{tr({ ko: '같은 장비, 세 가지 쓰는 법', en: 'Same equipment, three ways to use it' })}</h3>
        <P ko="6장에서 본 것처럼 기체의 위치 제어기는 언제나 기체 안에서 방금 추정한 **자기 위치**를 씁니다(나이 $\tau_{\text{est}}$). 달라지는 것은 0장의 '이웃과 맞추는 계산', 즉 **대형 보정**을 어디서 어떤 정보로 하느냐입니다. 이 장의 지연 한계가 적용되는지도 그것으로 정해집니다."
          en="As chapter 6 showed, a vehicle's position controller always uses its **own position**, freshly estimated onboard (age $\tau_{\text{est}}$). What differs is where, and with what information, the 'match the neighbours' computation of chapter 0 — the **formation correction** — is done. That also decides whether the delay bound of this chapter applies." />
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '구성', en: 'Configuration' })}</th><th>{tr({ ko: '대형 보정에 쓰는 정보', en: 'Information used for the formation correction' })}</th><th>{tr({ ko: '이 장의 결과', en: 'What this chapter says' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '① 궤적 업로드', en: '① Trajectory upload' })}</b></td><td><T ko="없음. 각 기체는 올려 둔 자기 궤적만 따라간다" en="None; each vehicle follows only its own uploaded trajectory" /></td><td><T ko="루프가 닫히지 않음. 지연 한계와 무관 (아래 노트)" en="No closed loop; the delay bound does not apply (note below)" /></td></tr>
              <tr><td><b>{tr({ ko: '② 지상 PC 가 보정 (지상국 중계)', en: '② Ground PC corrects (ground relay)' })}</b></td><td><T ko="PC 가 받은 모두의 위치. **내 위치도** 이웃 위치와 똑같이 늦다" en="Everyone's positions as received by the PC; **my own position too** is as late as the neighbours'" /></td><td><T ko="지연 한계 $\tau^*$ 적용. 전역 설정의 기본값" en="The delay bound $\tau^*$ applies; the default of the global settings" /></td></tr>
              <tr><td><b>{tr({ ko: '③ 기체 안에서 보정 (P2P)', en: '③ Onboard correction (P2P)' })}</b></td><td><T ko="내 위치는 새것, **이웃 위치만** 무선으로 늦게 온다" en="My own position is fresh; **only the neighbours'** arrive late over radio" /></td><td><T ko="지연으로 발산하지 않음. 대신 대형이 $v\tau$ 만큼 밀림" en="No divergence from delay; the formation lags by $v\tau$ instead" /></td></tr>
            </tbody>
          </table>
        </div>
        <P ko="6장의 정보 나이 계산은 ②와 ③ 모두의 재료입니다. ②에서도 기체의 위치 제어기는 새 위치로 PC 의 명령을 따라가지만, 그 **명령 자체**가 PC 에 도착한 낡은 '내 위치'로 계산되었기 때문에 대형 보정 루프 전체에 지연이 걸립니다."
          en="The age computation of chapter 6 feeds both ② and ③. In ② the vehicle's position controller still tracks the PC's command using its fresh position, but the **command itself** was computed from the stale 'own position' that reached the PC, so the whole formation-correction loop carries the delay." />
        <Derivation id="loop-delay" title={{ ko: '루프 지연을 더하는 법', en: 'Adding up the loop delay' }}>
          <P ko="정보가 측정된 순간부터 그 정보로 계산한 명령이 기체를 움직이기까지의 시간을 **루프 지연**이라고 합시다. 지상국 중계에서는"
            en="Call the time from the instant information is measured until a command computed from it moves the vehicle the **loop delay**. For the ground relay," />
          <M block tex={String.raw`\tau_{\text{loop}} \;=\; \underbrace{\tau_{\text{est}}}_{\tx{측위→FC}{estimate→FC}} \;+\; \underbrace{2\,\tau_c}_{\tx{내려가고 올라오기}{down and back up}} \;+\; \underbrace{\tfrac{1}{2}T_c}_{\tx{표본 유지}{sample and hold}}`} />
          <P ko="마지막 항은 정보가 주기 $T_c$ 마다 한 번씩만 갱신되기 때문에 생깁니다. 갱신 직후에는 나이가 0, 다음 갱신 직전에는 $T_c$ 이므로 평균 $T_c/2$ 만큼 늦은 것과 같습니다(가장 나쁠 때는 $T_c$). P2P 에서는 $2\tau_c$ 가 $\tau_c$ 로 줄고, 이 지연은 **이웃 정보에만** 걸립니다."
            en="The last term arises because information is refreshed only once per period $T_c$: its age is 0 right after an update and $T_c$ right before the next, i.e. on average $T_c/2$ late (worst case $T_c$). For P2P, $2\tau_c$ becomes $\tau_c$ and the delay applies **only to neighbour information**." />
          <P ko="위 식은 **평균** 지연입니다. 통신 지연은 평균 $\tau_c$ 에서 지터 $J$ 만큼 흔들리고(전역 설정 {{cfg:comm.delayJitter}}), 표본 유지는 가장 나쁠 때 $T_c$ 이므로, 패킷 손실이 없을 때의 **최대** 루프 지연은"
            en="The formula above is the **mean** delay. The comm delay varies around its mean $\tau_c$ by a jitter $J$ (global setting {{cfg:comm.delayJitter}}) and the sample-and-hold is $T_c$ at worst, so without packet loss the **maximum** loop delay is" />
          <M block tex={String.raw`\tau_{\text{loop}}^{\max} = \tau_{\text{est}} + n\,(\tau_c + J) + T_c \qquad (n = \tx{무선 구간 수}{number of radio hops})`} />
          <P ko="다음 절의 지연 한계 $\tau^*$ 는 **일정한** 지연에 대한 정리입니다. 지연이 흔들리고 표본 유지가 섞인 실제 루프는 그 정리가 다루지 않으므로, 평균 지연으로 잰 여유와 최대 지연으로 잰 여유를 함께 보고, 둘 다 넉넉할 때 안심합니다(이 장 끝 **우리 시스템의 값 넣기**)."
            en="The delay bound $\tau^*$ of the next section is a theorem for a **constant** delay. A real loop with varying delay and sample-and-hold is outside that theorem, so look at the margin measured with the mean delay and with the maximum delay together, and relax only when both are comfortable (see **Plugging in our system** at the end of this chapter)." />
          <P ko={`지금 설정으로는: 측위 지연 {{cfg:estimation.latency}}, 편도 통신 지연 {{cfg:comm.delayMean}}, 방송 주기 {{cfg:comm.rate}}, 무선 구간 ${hops}개 → 루프 지연 약 ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch7#loop-delay}}.`}
            en={`With the current settings: estimation latency {{cfg:estimation.latency}}, one-way comm delay {{cfg:comm.delayMean}}, broadcast rate {{cfg:comm.rate}}, ${hops} radio hop(s) → loop delay about ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch7#loop-delay}}.`} />
        </Derivation>
        <Note>
          <P ko="**① 루프가 닫히지 않는 방식.** Crazyswarm2 는 미리 짠 궤적을 각 기체에 올려 두고 시작시키는 궤적 API 를 제공합니다{{lit:crazyswarm2-docs/trajectory-api}}. 이때 각 기체는 자기 위치만 보고 자기 궤적을 따라가므로, 통신 지연은 안정성 문제를 만들지 않습니다. 그 대신 기체들은 **서로를 보지 않으므로** 한 대가 밀려도 나머지가 맞춰 주지 않고, 두 기체의 측위 오차가 그대로 더해집니다. 서로의 위치에 반응하는 순간(대형 보정, 충돌 회피) 루프가 닫히고 이 장의 지연 한계가 적용됩니다."
            en="**① The way that never closes the loop.** Crazyswarm2 provides a trajectory API that uploads pre-planned trajectories to each vehicle and starts them{{lit:crazyswarm2-docs/trajectory-api}}. Each vehicle then follows its own trajectory using only its own position, so communication delay causes no stability problem. In return the vehicles **do not watch each other**: if one is pushed aside the others do not compensate, and the positioning errors of two vehicles simply add. The moment vehicles react to each other's positions (formation correction, collision avoidance), the loop closes and the delay bound of this chapter applies." />
          <P ko="**그래도 예산의 통신 항은 남깁니다.** 오차 예산은 구성과 상관없이 통신 지연·공백 동안의 이동(이 장 끝 **통신 항 계산**)을 늘 더합니다. ①에서는 안정성 때문이 아니라, 지상에서 간격을 감시하거나 비상 정지·충돌 회피가 반응할 때 쓰는 이웃 위치가 그만큼 낡았기 때문입니다. 그 반응 거리로 남겨 두는 것이 이 교재의 규칙입니다{{ex|이 교재의 선택입니다. 지상 감시나 회피를 전혀 하지 않는 비행이라면 두 항은 간격에 필요 없습니다.|The textbook's choice; a flight with no ground monitoring or avoidance at all would not need these two terms in the spacing.}}."
            en="**The budget keeps the communication terms anyway.** Whatever the configuration, the error budget always adds the motion during comm delays and gaps (see **Communication terms** at the end of this chapter). In ① the reason is not stability: the neighbour positions used when the ground station monitors spacing, or when an emergency stop or collision avoidance reacts, are that stale. Keeping them as that reaction distance is this textbook's rule{{ex|이 교재의 선택입니다. 지상 감시나 회피를 전혀 하지 않는 비행이라면 두 항은 간격에 필요 없습니다.|The textbook's choice; a flight with no ground monitoring or avoidance at all would not need these two terms in the spacing.}}." />
        </Note>
      </Section>

      <Section id="graph" title={{ ko: '그래프와 라플라시안', en: 'Graphs and the Laplacian' }}>
        <P ko="'누가 누구의 정보를 받는가'를 **그래프**로 그립니다. 드론이 점(노드), 정보가 오가는 관계가 선(에지)입니다. 이 그림을 계산에 쓰려고 행렬로 옮긴 것이 **인접행렬**(adjacency matrix) $A$ 이고(연결되어 있으면 $a_{ij} = 1$), 각 드론의 이웃 수를 대각에 놓은 **차수행렬**(degree matrix) $D$ 에서 $A$ 를 뺀 것이 **라플라시안**(Laplacian) $L = D - A$ 입니다."
          en="We draw 'who receives whose information' as a **graph**: drones are nodes, information links are edges. Written as a matrix for computation it is the **adjacency matrix** $A$ ($a_{ij} = 1$ when linked); subtracting it from the **degree matrix** $D$ (number of neighbours on the diagonal) gives the **Laplacian** $L = D - A$." />
        <Derivation id="laplacian" title={{ ko: '합의 식을 라플라시안으로 쓰기', en: 'Writing consensus with the Laplacian' }}>
          <P ko="0장의 제어식을 다시 적으면 $\dot p_i = v_{\text{ref}}(t) + k\sum_{j} a_{ij}\big[(p_j - c_j) - (p_i - c_i)\big]$ 입니다($a_{ij}$ = 1 이면 $j$ 가 $i$ 의 이웃, 아니면 0. 여기서는 지연·노이즈 없이 참 위치로 씁니다). 한 축만 보고 $x_i = p_i - c_i - \int_0^t v_{\text{ref}}\,ds$ 로 놓으면, $c_i$ 는 상수이고 $\dot x_i = \dot p_i - v_{\text{ref}}$ 이므로"
            en="Rewriting the control law of chapter 0: $\dot p_i = v_{\text{ref}}(t) + k\sum_{j} a_{ij}\big[(p_j - c_j) - (p_i - c_i)\big]$ ($a_{ij}$ = 1 if $j$ is a neighbour of $i$, else 0; here without delay or noise, with true positions). Take one axis and set $x_i = p_i - c_i - \int_0^t v_{\text{ref}}\,ds$. Since $c_i$ is constant and $\dot x_i = \dot p_i - v_{\text{ref}}$," />
          <M block tex={String.raw`\dot x_i = k\sum_j a_{ij}(x_j - x_i) = k\Big(\sum_j a_{ij}x_j - \underbrace{\textstyle\sum_j a_{ij}}_{d_i}\,x_i\Big) \quad\Longrightarrow\quad \dot x = -k\,(D - A)\,x = -k\,L\,x`} />
          <P ko="$L$ 의 성질 세 가지가 필요합니다."
            en="Three properties of $L$ are needed." />
          <List items={[
            { ko: '**각 행의 합이 0** 입니다(대각에 $d_i$, 나머지 칸에 $-a_{ij}$ 이고 $d_i = \\sum_j a_{ij}$). 그래서 $L\\,\\mathbf 1 = 0$, 즉 $\\mathbf 1 = [1,1,\\dots,1]$ 은 고유값 0 의 고유벡터입니다.', en: '**Every row sums to 0** ($d_i$ on the diagonal, $-a_{ij}$ elsewhere, and $d_i = \\sum_j a_{ij}$). So $L\\,\\mathbf 1 = 0$: $\\mathbf 1 = [1,1,\\dots,1]$ is an eigenvector with eigenvalue 0.' },
            { ko: '**고유값은 음수가 아닙니다.** 전개하면 $x^{\\T} L x = \\sum_i d_i x_i^2 - \\sum_{i,j} a_{ij}x_i x_j = \\tfrac12\\sum_{i,j} a_{ij}(x_i - x_j)^2 \\ge 0$ 이고, 길이 1 인 고유벡터 $v$ 를 넣으면 $\\lambda = v^{\\T} L v \\ge 0$ 입니다.', en: '**No eigenvalue is negative.** Expanding, $x^{\\T} L x = \\sum_i d_i x_i^2 - \\sum_{i,j} a_{ij}x_i x_j = \\tfrac12\\sum_{i,j} a_{ij}(x_i - x_j)^2 \\ge 0$, and for a unit eigenvector $v$ this gives $\\lambda = v^{\\T} L v \\ge 0$.' },
            { ko: '**대칭**($a_{ij} = a_{ji}$)이므로 서로 수직인 길이 1 의 고유벡터 $v_1, \\dots, v_N$ 이 있고 $L v_m = \\lambda_m v_m$, $0 = \\lambda_1 \\le \\lambda_2 \\le \\dots \\le \\lambda_N$ 입니다. (드론 번호 $i$ 와 헷갈리지 않게 **모드** 번호는 $m$ 으로 씁니다.)', en: '**Symmetric** ($a_{ij} = a_{ji}$), so there are mutually orthogonal unit eigenvectors $v_1, \\dots, v_N$ with $L v_m = \\lambda_m v_m$, $0 = \\lambda_1 \\le \\lambda_2 \\le \\dots \\le \\lambda_N$. (To avoid confusion with the drone index $i$, the **mode** index is $m$.)' },
          ]} />
          <P ko="이제 $x$ 를 고유벡터의 합 $x(t) = \sum_m y_m(t)\,v_m$ 으로 씁니다($y_m = v_m^{\T} x$ 는 모드 $m$ 방향의 성분). 식에 넣고 $L v_m = \lambda_m v_m$ 을 쓰면 $\sum_m \dot y_m v_m = -k\sum_m \lambda_m y_m v_m$ 이고, 고유벡터끼리 수직이므로 양변의 같은 $v_m$ 앞 계수가 같아야 합니다."
            en="Now write $x$ as a sum of eigenvectors, $x(t) = \sum_m y_m(t)\,v_m$ ($y_m = v_m^{\T} x$ is the component along mode $m$). Substituting and using $L v_m = \lambda_m v_m$ gives $\sum_m \dot y_m v_m = -k\sum_m \lambda_m y_m v_m$; since the eigenvectors are orthogonal, the coefficients of each $v_m$ must match." />
          <M block tex={String.raw`\dot y_m = -k\lambda_m\,y_m \;\Rightarrow\; y_m(t) = y_m(0)\,e^{-k\lambda_m t}`} />
          <List items={[
            { ko: '$\\lambda_1 = 0$ 의 고유벡터는 $\\mathbf 1$, 즉 "모두 같은 값". 이 성분은 변하지 않습니다 — 평균은 보존됩니다.', en: 'The eigenvector of $\\lambda_1 = 0$ is $\\mathbf 1$, "everyone equal". This component does not change — the mean is preserved.' },
            { ko: '나머지 성분은 모두 0 으로 줄어들고, 그중 가장 느린 것이 $e^{-k\\lambda_2 t}$. 그래서 $\\lambda_2$ 가 **수렴 속도**를 정합니다{{lit:olfati2004/lambda2-speed}}. $\\lambda_2$ 를 **대수적 연결도**(algebraic connectivity)라고 부릅니다.', en: 'All other components decay to 0, the slowest as $e^{-k\\lambda_2 t}$. So $\\lambda_2$ sets the **convergence speed**{{lit:olfati2004/lambda2-speed}}. $\\lambda_2$ is called the **algebraic connectivity**.' },
            { ko: '그래프가 끊어져 있으면 $\\lambda_2 = 0$ 이 되어 합의가 이루어지지 않습니다.', en: 'If the graph is disconnected, $\\lambda_2 = 0$ and consensus is never reached.' },
          ]} />
        </Derivation>
        <LaplacianDemo />
      </Section>

      <Section id="delay" title={{ ko: '지연 한계 π/(2kλ_N)', en: 'The delay bound π/(2kλ_N)' }}>
        <Predict id="ch7-more-links"
          question={{ ko: '고리 그래프(각자 이웃 2대)에서 완전 그래프(각자 이웃 4대)로 바꾸면 더 빨리 모입니다. 그럼 견딜 수 있는 지연은 어떻게 될까요?', en: 'Switching from a ring (two neighbours each) to a complete graph (four neighbours each) converges faster. What happens to the delay it can tolerate?' }}
          choices={[
            { label: { ko: '늘어난다 — 정보가 많으니 더 튼튼하다', en: 'It grows — more information makes it more robust' } },
            { label: { ko: '그대로다 — 지연 한계는 게인만으로 정해진다', en: 'It stays — the bound depends on the gain only' } },
            { label: { ko: '줄어든다 — 더 세게 당기는 만큼 지연에 약해진다', en: 'It shrinks — pulling harder makes it more delay-sensitive' }, correct: true },
          ]}
          explain={{
            ko: '**줄어듭니다.** 이웃이 많을수록 한 번에 받는 보정의 합이 커져서, 사실상 게인을 올린 것과 같습니다. 5대 기준으로 고리는 $\\lambda_N \\approx 3.62${{der:ch7#laplacian}}, 완전 그래프는 $\\lambda_N = 5${{der:ch7#laplacian}} 이므로 지연 한계가 약 28%{{der:ch7#delay-bound|1 − 3.62/5|1 − 3.62/5}} 줄어듭니다. 빠른 수렴과 지연 여유는 맞바꾸는 관계입니다. 논문은 이 절충을 가중치를 줄이는 경우로 보였습니다(가중치를 줄이면 허용 지연은 늘고 수렴은 같은 비율로 느려짐{{lit:olfati2004/tradeoff-delay-speed}}). 간선을 늘리는 이 경우는 $\\lambda_2$ 와 $\\lambda_N$ 이 서로 다른 비율로 변하지만 같은 종류의 절충입니다.',
            en: '**It shrinks.** More neighbours means a larger total correction at once — effectively a higher gain. For five drones the ring has $\\lambda_N \\approx 3.62${{der:ch7#laplacian}} and the complete graph $\\lambda_N = 5${{der:ch7#laplacian}}, so the delay bound drops by about 28%{{der:ch7#delay-bound|1 − 3.62/5|1 − 3.62/5}}. Fast convergence and delay margin trade off against each other. The paper showed this trade-off for scaling the weights down (smaller weights tolerate more delay and slow convergence by the same ratio{{lit:olfati2004/tradeoff-delay-speed}}). Adding edges, as here, changes $\\lambda_2$ and $\\lambda_N$ by different ratios, but it is the same kind of trade-off.',
          }} />
        <Derivation id="delay-bound" title={{ ko: '지연 한계의 유도', en: 'Deriving the delay bound' }}>
          <P ko="중앙집중 구조처럼 **모든** 상태가 $\tau$ 만큼 늦게 반영되면 $\dot x(t) = -kL\,x(t-\tau)$ 입니다. 앞에서처럼 고유벡터 성분으로 나누면 성분마다"
            en="When **every** state is acted on $\tau$ late, as in the centralised structure, $\dot x(t) = -kL\,x(t-\tau)$. Splitting into eigenvector components as before, each obeys" />
          <M block tex={String.raw`\dot y_m(t) = -k\lambda_m\,y_m(t-\tau)`} />
          <P ko="이것은 0장에서 드론 두 대로 풀었던 식과 모양이 같고, $2k$ 자리에 $k\lambda_m$ 이 들어갔을 뿐입니다. 같은 방법($y = e^{st}$, 경계에서 $s = j\omega$)으로 풀면 모드 $m$ 이 안정할 조건은 $k\lambda_m\tau < \pi/2$. 모든 모드가 안정해야 하므로 가장 까다로운 것은 **가장 큰** 고유값입니다."
            en="This has the same form as the two-drone equation of chapter 0, with $k\lambda_m$ in place of $2k$. Solving the same way ($y = e^{st}$, $s = j\omega$ at the boundary), mode $m$ is stable when $k\lambda_m\tau < \pi/2$. All modes must be stable, so the binding one is the **largest** eigenvalue." />
          <M block tex={String.raw`0 < \tau < \tau^{*} = \frac{\pi}{2\,k\,\lambda_N}`} />
          <P ko="게인을 그래프 가중치에 넣어 $k = 1$ 로 쓰면 Olfati-Saber 와 Murray 의 정리 10 과 같은 식입니다{{lit:olfati2004/delay-bound}}. 고유값을 구하기 귀찮을 때는 $\lambda_N \le 2 d_{\max}$ ($d_{\max}$ = 이웃이 가장 많은 드론의 이웃 수)를 써서 $\tau < \pi/(4 k\,d_{\max})$ 이면 충분하다고 어림할 수 있습니다{{lit:olfati2004/lambda-max-degree-bound}}."
            en="With the gain absorbed into the graph weights ($k = 1$) this is Theorem 10 of Olfati-Saber and Murray{{lit:olfati2004/delay-bound}}. If you do not want to compute eigenvalues, use $\lambda_N \le 2 d_{\max}$ ($d_{\max}$ = the largest number of neighbours) to get the sufficient condition $\tau < \pi/(4 k\,d_{\max})$ {{lit:olfati2004/lambda-max-degree-bound}}." />
        </Derivation>
        <DelayDemo />
        <Derivation id="p2p-stable" title={{ ko: '이웃 정보만 늦으면 왜 발산하지 않나', en: 'Why it does not diverge when only neighbours are late' }}>
          <P ko="**가정.** 기체는 0장처럼 명령한 속도를 그대로 내고(적분기), 자기 위치는 **지연 없이** 씁니다. P2P 구조의 식은 $\dot x_i(t) = k\sum_j a_{ij}\big(x_j(t-\tau) - x_i(t)\big)$ 입니다. 자기 자신에 대한 항 $-k d_i x_i(t)$ 가 지연 없이 바로 작용하는 **브레이크**가 됩니다."
            en="**Assumptions.** As in chapter 0 a vehicle produces the commanded velocity exactly (an integrator) and uses its own position **without delay**. The P2P law is $\dot x_i(t) = k\sum_j a_{ij}\big(x_j(t-\tau) - x_i(t)\big)$. The own term $-k d_i x_i(t)$ acts without delay, like a **brake**." />
          <P ko="**논리.** 지난 $\tau$ 동안 모든 드론이 가졌던 값 가운데 가장 큰 것을 $M(t) = \max_j \max_{t-\tau \le s \le t} x_j(s)$ 라 합시다. 지금 그 최댓값에 있는 드론 $i$ 를 보면($x_i(t) = M$), 이웃이 보낸 낡은 값 $x_j(t-\tau)$ 도 지난 $\tau$ 안의 값이므로 모두 $M$ 이하입니다. 그러면 괄호가 모두 0 이하라 $\dot x_i \le 0$: 그 드론은 위로 더 갈 수 없습니다. 그래서 $M$ 은 늘어날 수 없고, 같은 논리로 가장 작은 값도 줄어들 수 없습니다. 상태는 처음 범위 안에 갇히므로 지연이 아무리 길어도 발산하지 않습니다. (이 논리는 '커지지 않는다'까지만 보입니다. 결국 한 값으로 모인다는 것은 따로 증명이 필요하며, 데모에서는 모입니다.)"
            en="**Argument.** Let $M(t) = \max_j \max_{t-\tau \le s \le t} x_j(s)$ be the largest value any drone has had during the last $\tau$. Look at a drone $i$ that is at that maximum now ($x_i(t) = M$). The stale values $x_j(t-\tau)$ it receives are values from within the last $\tau$, so all are at most $M$. Every bracket is then at most 0 and $\dot x_i \le 0$: that drone cannot go higher. So $M$ cannot grow, and by the same argument the smallest value cannot shrink. The state stays within its initial range, so it does not diverge however long the delay. (This only shows 'does not grow'; that it finally converges to one value needs a separate proof — in the demo it does.)" />
          <P ko="실제로는 자기 위치도 $\tau_{\text{est}}$ 만큼 늦고 갱신 사이에는 값이 유지되므로, '지연과 무관하게'는 엄밀히는 성립하지 않습니다. 다만 그 지연이 이웃 지연보다 훨씬 짧아 발산 위험은 훨씬 작습니다."
            en="In reality the own position is also $\tau_{\text{est}}$ late and held between updates, so 'for any delay' no longer holds strictly; but that delay is much shorter than the neighbour delay, so the risk of divergence is far smaller." />
          <P ko="공짜는 아닙니다. 대형이 속도 $v$ 로 움직이는 동안(여기서 $v$ 는 대형이 실제로 움직이는 속력, 즉 이웃의 속력) 이웃은 항상 $v\tau$ 만큼 **뒤에** 있는 것처럼 보이므로, 그만큼 대형이 일그러지거나 느려집니다. 오차 예산의 통신 지연 항은 이 $v$ 자리에 상대속도 가정 $v_{\text{rel}}$ 을 넣은 것이고(그 선택의 이유와 한계는 8장의 **최소 간격의 식**), 8장의 이웃 위치 외삽으로 줄일 수 있습니다."
            en="It is not free. While the formation moves at speed $v$ (here $v$ is the speed at which the formation actually moves, i.e. the neighbour's speed), neighbours always appear $v\tau$ **behind**, so the formation is distorted or slowed by that much. The comm-delay term of the error budget puts the assumed relative speed $v_{\text{rel}}$ in place of this $v$ (why, and its limits, are in chapter 8's **minimum-spacing formula**), and neighbour extrapolation in chapter 8 reduces it." />
        </Derivation>
        <CodeTask task={delayMarginTask} />
      </Section>

      <Section id="loss" title={{ ko: '패킷 손실: 얼마나 자주보다 얼마나 길게', en: 'Packet loss: how long matters more than how often' }}>
        <P ko="무선 패킷은 가끔 사라집니다. 가장 단순한 모델은 패킷마다 독립적으로 확률 $p$ 로 사라지는 **베르누이**(Bernoulli) 모델입니다. 하지만 실제 손실은 간섭이나 가림 때문에 **몰아서** 일어나는 경우가 많습니다. 이를 흉내 내는 가장 간단한 모델이 **길버트-엘리엇**(Gilbert–Elliott) 모델로, 채널이 Good 과 Bad 두 상태를 오가며 상태마다 손실 확률이 다릅니다."
          en="Radio packets sometimes vanish. The simplest model drops each packet independently with probability $p$: the **Bernoulli** model. Real losses, however, often come in **bursts** due to interference or blockage. The simplest model that mimics this is the **Gilbert–Elliott** model: the channel alternates between a Good and a Bad state with a different loss probability in each." />
        <Derivation id="ge-stationary" title={{ ko: '길버트-엘리엇 모델의 평균 손실률과 연속 손실 길이', en: 'Average loss rate and burst length of the Gilbert–Elliott model' }}>
          <P ko="패킷마다 Good→Bad 로 갈 확률을 $p_{GB}$, Bad→Good 으로 돌아올 확률을 $p_{BG}$ 라 합시다. 오래 지났을 때 채널이 Good 에 있을 확률(= Good 에 머무는 시간 비율)을 $\pi_G$, Bad 에 있을 확률을 $\pi_B$ 라 합니다(여기의 $\pi$ 는 원주율이 아니라 확률입니다). 오래 지나면 Bad 로 들어가는 흐름과 나오는 흐름이 균형을 이룹니다: $\pi_G\,p_{GB} = \pi_B\,p_{BG}$, 그리고 $\pi_G + \pi_B = 1$."
            en="Let $p_{GB}$ be the per-packet probability of going Good→Bad and $p_{BG}$ of returning Bad→Good. Let $\pi_G$ be the long-run probability that the channel is in Good (= the fraction of time spent in Good) and $\pi_B$ that it is in Bad (here $\pi$ is a probability, not the circle constant). In the long run the flow into Bad balances the flow out: $\pi_G\,p_{GB} = \pi_B\,p_{BG}$, with $\pi_G + \pi_B = 1$." />
          <M block tex={String.raw`\pi_B = \frac{p_{GB}}{p_{GB} + p_{BG}}, \qquad \tx{평균 손실률}{average loss rate} = (1-\pi_B)\,h_G + \pi_B\,h_B`} />
          <P ko="$h_G$, $h_B$ 는 각 상태에서의 손실 확률입니다. Bad 상태에 한번 들어가면 매 패킷마다 확률 $p_{BG}$ 로 빠져나오므로 머무는 길이는 **기하분포**(매번 확률 $p$ 로 끝나는 일이 끝날 때까지의 횟수의 분포. 길이 $L$ 의 확률은 $p(1-p)^{L-1}$, 평균 $1/p$)를 따르고 평균은 $1/p_{BG}$ 패킷입니다. $h_G = 0$, $h_B = 1$ 이면 이것이 곧 **연속 손실 길이**입니다."
            en="$h_G$, $h_B$ are the loss probabilities in each state. Once in Bad, the channel leaves with probability $p_{BG}$ per packet, so the stay follows a **geometric distribution** (the number of tries until something that ends with probability $p$ each time ends: length $L$ has probability $p(1-p)^{L-1}$, mean $1/p$), with mean $1/p_{BG}$ packets. With $h_G = 0$, $h_B = 1$ that is exactly the **burst length**." />
          <P ko="**연속 손실 확률.** 일반적인 $h_G$, $h_B$ 에서는 '어느 패킷에서 시작해 $L$ 개가 연속으로 사라질 확률' $a_L$ 을 한 패킷씩 이어 계산합니다. $g_L$, $b_L$ 을 '$L$ 개가 연속으로 사라졌고 $L$ 번째 패킷 때 채널이 Good / Bad 였을 확률'이라 하면, 다음 패킷은 상태가 바뀐 뒤(전이 확률) 그 상태의 손실 확률로 사라집니다."
            en="**Probability of consecutive losses.** For general $h_G$, $h_B$, compute $a_L$, the probability that $L$ packets in a row starting at a given packet are lost, one packet at a time. Let $g_L$, $b_L$ be the probability that $L$ packets were lost in a row and the channel was Good / Bad at the $L$-th; the next packet is lost after a state transition, with the loss probability of the new state:" />
          <M block tex={String.raw`\begin{aligned} g_1 &= \pi_G\,h_G, & b_1 &= \pi_B\,h_B, \\ g_{L+1} &= \big(g_L(1-p_{GB}) + b_L\,p_{BG}\big)\,h_G, & b_{L+1} &= \big(g_L\,p_{GB} + b_L(1-p_{BG})\big)\,h_B, \\ a_L &= g_L + b_L \end{aligned}`} />
          <P ko="단순화한 경우($h_G = 0$, $h_B = 1$)에는 $a_L = \pi_B(1-p_{BG})^{L-1}$, 베르누이에서는 $a_L = p^L$ 입니다. 엔진의 `burstLengthQuantile` 이 이 재귀를 계산합니다."
            en="In the simplified case ($h_G = 0$, $h_B = 1$) $a_L = \pi_B(1-p_{BG})^{L-1}$; for Bernoulli $a_L = p^L$. The engine function `burstLengthQuantile` evaluates this recursion." />
          <P ko="**연속 손실 길이의 분포.** 앞 패킷은 받고 이어서 $L$ 개를 잃을 확률은 $a_L - a_{L+1}$ 입니다($L$ 개를 잃는 경우에서 앞 패킷까지 잃는 경우를 뺌). 여기서 그다음 패킷까지 잃는 경우를 또 빼면 '정확히 $L$ 개짜리 연속 손실이 이 패킷에서 시작할' 확률 $a_L - 2a_{L+1} + a_{L+2}$ 가 됩니다. 이것을 패킷당 연속 손실이 시작되는 확률 $a_1 - a_2$ 로 나누면 연속 손실 길이의 분포이고, 평균은 $a_1/(a_1 - a_2)$ 입니다. 단순화한 경우에는 위의 기하분포 $p_{BG}(1-p_{BG})^{L-1}$ 로 돌아갑니다. 아래 히스토그램의 이론선이 이 분포입니다."
            en="**Distribution of burst lengths.** The probability of receiving the previous packet and then losing $L$ is $a_L - a_{L+1}$ (losing $L$, minus also losing the one before). Subtracting the case where the next packet is lost too gives the probability $a_L - 2a_{L+1} + a_{L+2}$ that a burst of exactly $L$ starts at this packet. Dividing by $a_1 - a_2$, the per-packet probability that a burst starts, gives the burst-length distribution, with mean $a_1/(a_1 - a_2)$. In the simplified case it reduces to the geometric $p_{BG}(1-p_{BG})^{L-1}$ above. The theory lines in the histograms below are this distribution." />
          <P ko="안전에 필요한 것은 평균이 아니라 '드물지만 일어나는 긴 공백'입니다. 이 교재는 **$a_L$ 이 1/1000{{ex|1/1000 은 이 교재가 고정한 약속입니다(엔진에 10⁻³ 으로 고정). 문헌값이 아닙니다.|1/1000 is a convention fixed by this textbook (hard-coded as 10⁻³ in the engine), not a literature value.}} 이하가 되는 가장 작은 $L$** 을 $L_{99.9}$ 라 부르고, 그 동안의 시간 $L_{99.9}\,T_c$ 를 통신 공백으로 예산에 넣습니다. 베르누이에서는 $p^L \le 10^{-3}$ 을 풀면 됩니다."
            en="For safety we need not the mean but 'the rare long gap'. This textbook defines $L_{99.9}$ as **the smallest $L$ with $a_L$ at most 1/1000{{ex|1/1000 은 이 교재가 고정한 약속입니다(엔진에 10⁻³ 으로 고정). 문헌값이 아닙니다.|1/1000 is a convention fixed by this textbook (hard-coded as 10⁻³ in the engine), not a literature value.}}**, and budgets the time $L_{99.9}\,T_c$ as the communication gap. For Bernoulli this is solving $p^L \le 10^{-3}$." />
          <P ko={`**지금 설정으로 한 번 계산해 보기.** 전역 설정 $p_{GB}$ = {{cfg:comm.loss.pGB}}, $p_{BG}$ = {{cfg:comm.loss.pBG}}, $h_G$ = {{cfg:comm.loss.lossGood}}, $h_B$ = {{cfg:comm.loss.lossBad}} 로 재귀를 돌리면 $a_{${lq - 1}}$ = ${fmt(aq[lq - 1], 2)}{{der:ch7#ge-stationary}}, $a_{${lq}}$ = ${fmt(aq[lq], 2)}{{der:ch7#ge-stationary}} 이므로 $L_{99.9}$ = ${lq}{{der:ch7#ge-stationary}} 패킷, 공백은 ${fmt(lq * 1000 / cfg.comm.rate, 3)} ms{{der:ch7#ge-stationary|L₉₉.₉ × 방송 주기|L₉₉.₉ × broadcast period}} 입니다. 아래 데모의 처음 값도 이 설정입니다.`}
            en={`**Working it out with the current settings.** Running the recursion with the global settings $p_{GB}$ = {{cfg:comm.loss.pGB}}, $p_{BG}$ = {{cfg:comm.loss.pBG}}, $h_G$ = {{cfg:comm.loss.lossGood}}, $h_B$ = {{cfg:comm.loss.lossBad}} gives $a_{${lq - 1}}$ = ${fmt(aq[lq - 1], 2)}{{der:ch7#ge-stationary}} and $a_{${lq}}$ = ${fmt(aq[lq], 2)}{{der:ch7#ge-stationary}}, so $L_{99.9}$ = ${lq}{{der:ch7#ge-stationary}} packets and the gap is ${fmt(lq * 1000 / cfg.comm.rate, 3)} ms{{der:ch7#ge-stationary|L₉₉.₉ × 방송 주기|L₉₉.₉ × broadcast period}}. The demo below starts from these settings too.`} />
        </Derivation>
        <LossDemo />
        <CodeTask task={gilbertTask} />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <GainPitfall />
      </Section>

      <Section id="settings" title={{ ko: '우리 시스템의 값 넣기', en: 'Plugging in our system' }}>
        <P ko="아래 값은 전역 설정과 연결되어 있습니다. 여기서 바꾸면 오차 예산과 다른 장의 데모가 함께 바뀝니다."
          en="The values below are tied to the global settings. Changing them here also changes the error budget and the demos in other chapters." />
        <P ko="**게인 $k$ 는 어디에 있는 값인가.** $k$ 는 Crazyflie 펌웨어나 Crazyswarm2 에 들어 있는 값이 아니라, 여러분이 지상 PC 에서 직접 짜는 **대형 보정 코드**(위 표의 ②)의 게인입니다. 그런 코드 없이 궤적만 올려 나는 경우(①)에는 아래의 지연 한계·여유 배수는 해당이 없습니다. 통신 항은 그래도 예산에 남습니다(위 노트)."
          en="**Where does the gain $k$ live?** $k$ is not a value inside the Crazyflie firmware or Crazyswarm2; it is the gain of the **formation-correction code** you write yourself on the ground PC (② in the table above). If you fly uploaded trajectories without such code (①), the delay bound and margin factor below do not apply. The communication terms stay in the budget anyway (note above)." />
        <div class="controls">
          <CfgSlider path="comm.gain" max={8} />
          <CfgSlider path="comm.delayMean" max={200} />
          <CfgSlider path="comm.delayJitter" max={50} />
          <CfgSlider path="comm.rate" max={100} />
        </div>
        <StatRow>
          <Stat label={{ ko: '루프 지연 (평균)', en: 'Loop delay (mean)' }} value={b.loopDelay * 1000} unit="ms" src={der('ch7#loop-delay')} />
          <Stat label={{ ko: '루프 지연 (최대, 손실 없을 때)', en: 'Loop delay (max, no loss)' }} value={loopMax * 1000} unit="ms" src={der('ch7#loop-delay', { ko: 'τ_est + n(τ_c + J) + T_c', en: 'τ_est + n(τ_c + J) + T_c' })} />
          <Stat label={{ ko: '지연 한계 $\\tau^*$', en: 'Delay bound $\\tau^*$' }} value={b.delayMargin * 1000} unit="ms" src={der('ch7#delay-bound')} />
          <Stat label={{ ko: '여유 배수 (평균 지연 기준)', en: 'Margin factor (mean delay)' }} value={b.delayMargin / b.loopDelay} unit="×" src={der('ch7#delay-bound', { ko: 'τ* / 평균 루프 지연', en: 'τ* / mean loop delay' })} status={marginStatus(b.delayMargin / b.loopDelay)} />
          <Stat label={{ ko: '여유 배수 (최대 지연 기준)', en: 'Margin factor (max delay)' }} value={b.delayMargin / loopMax} unit="×" src={der('ch7#delay-bound', { ko: 'τ* / 최대 루프 지연', en: 'τ* / maximum loop delay' })} status={marginStatus(b.delayMargin / loopMax)} />
        </StatRow>
        <P ko={`통신 구조는 지금 **${cfg.comm.topology === 'ground' ? '지상국 중계' : '기체 간 직접(P2P)'}**, 그래프는 **${GRAPHS.find((g) => g.value === cfg.comm.graph)!.label.ko}** 입니다(설정에서 바꿀 수 있습니다). ${cfg.comm.topology === 'p2p' ? 'P2P 에서는 지연 한계가 안정성 조건이 아니라 참고값입니다.' : '이 교재는 여유 배수 2{{ex|이 교재가 정한 기준입니다(함정 실험실 참고). 문헌값이 아닙니다.|The textbook’s own criterion (see the pitfall lab), not a literature value.}} 이상을 기준으로 씁니다. 평균 지연으로 잰 배수와 최대 지연으로 잰 배수가 다르면, 둘 중 작은 쪽이 2 를 넘을 때까지 게인을 낮추거나 지연을 줄이는 것이 안전합니다. 지연 한계는 일정한 지연에 대한 정리라서 어느 쪽 숫자도 보장은 아닙니다.'}`}
          en={`The communication structure is currently **${cfg.comm.topology === 'ground' ? 'ground relay' : 'direct (P2P)'}** and the graph is **${GRAPHS.find((g) => g.value === cfg.comm.graph)!.label.en}** (change them in Settings). ${cfg.comm.topology === 'p2p' ? 'For P2P the delay bound is a reference value, not a stability condition.' : 'This textbook uses a margin factor of at least 2{{ex|이 교재가 정한 기준입니다(함정 실험실 참고). 문헌값이 아닙니다.|The textbook’s own criterion (see the pitfall lab), not a literature value.}} as its criterion. If the factors from the mean and from the maximum delay differ, it is safer to lower the gain or cut the delay until the smaller of the two exceeds 2. The delay bound is a theorem for a constant delay, so neither number is a guarantee.'}`} />
        <h3>{tr({ ko: '손실 모델', en: 'Loss model' })}</h3>
        <div class="controls">
          <CfgSlider path="comm.loss.pGB" max={30} />
          <CfgSlider path="comm.loss.pBG" />
          <CfgSlider path="comm.loss.lossGood" max={20} />
          <CfgSlider path="comm.loss.lossBad" />
        </div>
        <StatRow>
          <Stat label={{ ko: '평균 손실률', en: 'Average loss rate' }} value={b.lossRate * 100} unit="%" src={der('ch7#ge-stationary')} />
          <Stat label={{ ko: '1000번에 1번 나오는 연속 손실 $L_{99.9}$', en: '1-in-1000 burst $L_{99.9}$' }} value={lq} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary')} />
          <Stat label={{ ko: '그 공백 $L_{99.9}T_c$', en: 'That gap $L_{99.9}T_c$' }} value={(lq * 1000) / cfg.comm.rate} unit="ms" src={der('ch7#ge-stationary')} />
        </StatRow>
        <Derivation id="comm-budget" title={{ ko: '통신 항 계산: 예산에 더하는 두 거리', en: 'Communication terms: the two distances added to the budget' }}>
          <P ko="오차 예산은 이 장에서 두 거리를 더합니다. 둘 다 '이 시간 동안 두 기체가 이만큼 가까워질 수 있다'는 **확정 항**(무작위가 아니라 계산으로 정해지는 거리, 8장)입니다. 시간에는 **최댓값**을 씁니다. 편도 지연은 평균 $\tau_c$ 에 지터 $J$ 를 더한 것이 한 구간의 최댓값이고, 무선 구간 $n$ 개를 건너므로"
            en="The error budget adds two distances from this chapter. Both are **deterministic terms** (distances fixed by calculation rather than by chance; ch. 8): 'in this time the two vehicles can close in this far'. For the times, **maximum** values are used. A one-way hop takes at most its mean $\tau_c$ plus the jitter $J$, and $n$ radio hops are crossed, so" />
          <M block tex={String.raw`\tau_c^{\max} = n\,(\tau_c + J), \qquad \Delta_{\text{comm}} = v_{\text{rel}}\,\big(\tau_c^{\max} + T_c\big), \qquad \Delta_{\text{gap}} = v_{\text{rel}}\,L_{99.9}\,T_c`} />
          <P ko="$T_c$ 는 표본 유지의 최댓값(한 주기), $L_{99.9}T_c$ 는 1000번에 1번 나오는 연속 손실 동안의 공백, $v_{\text{rel}}$ 은 두 기체가 서로 가까워지는 속도의 가정값입니다(8장). 예산 표는 같은 식을 $n_{\text{hop}}(\bar\tau_c + J_c)$ 로 적습니다($n_{\text{hop}} = n$, $\bar\tau_c$ = 평균 편도 지연 $\tau_c$, $J_c = J$). 측위 지연 $\tau_{\text{est}}$ 몫은 6장의 항으로 따로 들어갑니다."
            en="$T_c$ is the worst case of the sample-and-hold (one period), $L_{99.9}T_c$ the gap during a 1-in-1000 loss burst, and $v_{\text{rel}}$ the assumed closing speed of two vehicles (ch. 8). The budget table writes the same quantity as $n_{\text{hop}}(\bar\tau_c + J_c)$ ($n_{\text{hop}} = n$, $\bar\tau_c$ = the mean one-way delay $\tau_c$, $J_c = J$). The estimation-latency share $\tau_{\text{est}}$ enters separately as the ch. 6 term." />
          <P ko={`지금 설정: $n$ = ${hops}, $\\tau_c$ = {{cfg:comm.delayMean}}, $J$ = {{cfg:comm.delayJitter}}, $T_c$ = ${fmt(1000 / cfg.comm.rate, 3)} ms{{ex:comm.rate}}, $L_{99.9}$ = ${lq}{{der:ch7#ge-stationary}}, $v_{\\text{rel}}$ = {{cfg:safety.relSpeed}} → $\\Delta_{\\text{comm}}$ = ${fmt(commLag * 100, 3)} cm{{der:ch7#comm-budget}}, $\\Delta_{\\text{gap}}$ = ${fmt(gapLag * 100, 3)} cm{{der:ch7#comm-budget}}.${cfg.safety.extrapolate ? ' (지금은 8장의 이웃 위치 외삽이 켜져 있어 엔진이 두 항을 ½·a_max·t² 꼴로 계산합니다. 8장 참고.)' : ''}`}
            en={`Current settings: $n$ = ${hops}, $\\tau_c$ = {{cfg:comm.delayMean}}, $J$ = {{cfg:comm.delayJitter}}, $T_c$ = ${fmt(1000 / cfg.comm.rate, 3)} ms{{ex:comm.rate}}, $L_{99.9}$ = ${lq}{{der:ch7#ge-stationary}}, $v_{\\text{rel}}$ = {{cfg:safety.relSpeed}} → $\\Delta_{\\text{comm}}$ = ${fmt(commLag * 100, 3)} cm{{der:ch7#comm-budget}}, $\\Delta_{\\text{gap}}$ = ${fmt(gapLag * 100, 3)} cm{{der:ch7#comm-budget}}.${cfg.safety.extrapolate ? ' (Neighbour extrapolation of chapter 8 is on, so the engine computes both terms in the form ½·a_max·t²; see chapter 8.)' : ''}`} />
        </Derivation>
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 7,
  title: { ko: '통신, 그리고 지연 아래의 합의', en: 'Communication and consensus under delay' },
  lead: { ko: '서로의 위치는 무선으로 늦게, 가끔 빠진 채로 옵니다. 얼마나 늦어도 대형이 안정한지, 얼마나 길게 끊길 수 있는지를 통신 그래프의 고유값과 손실 모델로 계산합니다.', en: 'Each other’s positions arrive over radio late and sometimes not at all. We compute how late is still stable and how long a dropout can last, from the eigenvalues of the communication graph and a loss model.' },
  objectives: [
    { ko: '통신 그래프를 라플라시안으로 쓰고 $\\lambda_2$, $\\lambda_N$ 으로 수렴 속도와 지연 한계 $\\pi/(2k\\lambda_N)$ 를 계산한다.', en: 'Write the communication graph as a Laplacian and compute convergence speed and the delay bound $\\pi/(2k\\lambda_N)$ from $\\lambda_2$, $\\lambda_N$.' },
    { ko: '지상국 중계와 기체 간 직접 통신에서 지연이 걸리는 자리와 그 결과가 어떻게 다른지 설명한다.', en: 'Explain where the delay sits in ground-relayed versus direct communication and what follows from it.' },
    { ko: '베르누이와 길버트-엘리엇 모델로 평균 손실률과 연속 손실 길이를 계산한다.', en: 'Compute average loss rate and burst length with the Bernoulli and Gilbert–Elliott models.' },
  ],
  Body,
  budget: {
    items: ['comm-delay', 'comm-gap', 'delay-margin'],
    note: {
      ko: '이 장은 예산에 세 가지를 더합니다. ① 통신 지연과 방송 주기 동안 이웃이 움직인 거리, ② 1000번에 1번 나오는 연속 손실 동안 움직인 거리, ③ 안정성 조건인 지연 한계 $\\tau^*$. ①과 ②는 최소 간격에 **그대로 더해지는** 확정 항(무작위가 아니라 계산으로 정해지는 거리, 8장)으로, ① = $v_{\\text{rel}}\\,(n(\\tau_c + J) + T_c)$, ② = $v_{\\text{rel}}\\,L_{99.9}\\,T_c$ 입니다(이 장 끝 **통신 항 계산**). 표의 식은 같은 값을 $n_{\\text{hop}}(\\bar\\tau_c + J_c)$ 로 적습니다. ③은 간격이 아니라 "이 게인을 써도 되는가"를 판정합니다.',
      en: 'This chapter adds three things. ① The distance a neighbour moves during the comm delay and broadcast period, ② the distance moved during a 1-in-1000 loss burst, ③ the stability condition, the delay bound $\\tau^*$. ① and ② are deterministic terms (distances fixed by calculation rather than by chance; ch. 8) **added directly** to the minimum spacing: ① = $v_{\\text{rel}}\\,(n(\\tau_c + J) + T_c)$, ② = $v_{\\text{rel}}\\,L_{99.9}\\,T_c$ (see **Communication terms** at the end of this chapter). The table writes the same quantity as $n_{\\text{hop}}(\\bar\\tau_c + J_c)$. ③ decides not spacing but whether this gain is admissible.',
    },
  },
  summary: [
    { ko: '합의는 $\\dot x = -kLx$ 로 쓸 수 있고, 수렴 속도는 $k\\lambda_2$, 견딜 수 있는 지연은 $\\pi/(2k\\lambda_N)$ 이다. 빨리 모이는 것과 지연에 강한 것은 맞바꾼다.', en: 'Consensus is $\\dot x = -kLx$; the convergence rate is $k\\lambda_2$ and the tolerable delay $\\pi/(2k\\lambda_N)$. Speed and delay robustness trade off.' },
    { ko: '지상국 중계는 자기 위치까지 늦게 반영되어 지연 한계가 그대로 적용되고, P2P 는 발산하지 않는 대신 $v\\tau$ 만큼 대형이 밀린다.', en: 'With a ground relay even the own state is late, so the delay bound applies; P2P never diverges but the formation lags by $v\\tau$.' },
    { ko: '손실은 평균 손실률보다 연속 손실 길이가 중요하다. 같은 손실률이라도 몰아서 빠지면 대비해야 할 공백이 몇 배 길다.', en: 'For loss, burst length matters more than the average rate: bursty loss at the same rate needs a several-times longer gap allowance.' },
  ],
  next: { ko: '이제 측위 오차(1–6장)와 통신 지연·공백(7장)을 모두 숫자로 갖게 되었습니다. 이것들을 어떻게 더해야 "두 드론은 최소 몇 m 떨어져야 한다"가 될까요? 위아래로 겹쳐 날 때는 왜 더 멀리 떨어져야 할까요?', en: 'We now have numbers for positioning error (ch. 1–6) and for comm delay and gaps (ch. 7). How do we add them into "two drones must stay at least this far apart"? And why must they be farther apart when one flies above the other?' },
  tasks,
};
export default def;
