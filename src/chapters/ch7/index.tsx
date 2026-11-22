import { useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { commHops } from '../../sim/budget';
import { simulateConsensus } from '../../sim/consensus';
import { GraphKind, adjacency, laplacian, laplacianSpectrum } from '../../sim/graph';
import { LossParams, burstLengthQuantile, lossRunLengths, simulateLoss, stationaryLossRate } from '../../sim/loss';
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
const SIM = der('ch7#laplacian', { ko: '이 장의 합의 모델 ẋ = −kLx(t−τ) 를 고정 스텝(오일러)으로 적분한 결과', en: 'The consensus model ẋ = −kLx(t−τ) of this chapter, integrated with a fixed Euler step' });

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
  const [kind, setKind] = useState<GraphKind>(cfg.comm.graph);
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
      <Caption>{tr({ ko: '처음에는 빠른 모드들이 섞여 있어 이론선보다 빨리 줄다가, 곧 가장 느린 모드(λ₂)만 남아 두 선의 기울기가 같아집니다.', en: 'At first faster modes are mixed in and the curve drops faster than the theory line; soon only the slowest mode (λ₂) remains and the slopes match.' })}</Caption>
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
          <Slider label={{ ko: '지연 $\\tau$', en: 'Delay $\\tau$' }} value={tauMs} min={0} max={800} step={5} unit="ms" onChange={setTauMs} src={ex('comm.delayMean', { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch7-tau" />
          <Slider label={{ ko: '게인 $k$', en: 'Gain $k$' }} value={gain} min={0.2} max={5} step={0.1} unit="1/s" onChange={setGain} src={ex('comm.gain', { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch7-gain" />
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
          yDomain={[-Math.min(yMax, 3) * 1.1, Math.min(yMax, 3) * 1.1]} height={230} src={SIM} testId="ch7-states-chart" />
        <LineChart
          title={{ ko: '지연을 쓸어 보기: 12초 뒤 불일치가 처음의 몇 배인가 (세로축은 로그)', en: 'Delay sweep: disagreement after 12 s relative to the start (log vertical axis)' }}
          xLabel={{ ko: '지연 τ [ms]', en: 'Delay τ [ms]' }} yLabel={{ ko: '끝 / 처음 불일치', en: 'Final / initial disagreement' }} yLog
          series={[{ name: { ko: '시뮬레이션', en: 'Simulation' }, x: sweep.taus, y: sweep.ratio, slot: 1 }]}
          refLines={[
            { x: tauStar * 1000, label: { ko: `이론 한계 τ* = ${fmt(tauStar * 1000, 3)} ms`, en: `Theory τ* = ${fmt(tauStar * 1000, 3)} ms` }, slot: 2, link: 'tau' },
            { x: tauMs, label: { ko: '지금 지연', en: 'Current delay' }, slot: 3 },
            { y: 1, label: { ko: '1 (커지지도 줄지도 않음)', en: '1 (neither grows nor shrinks)' } },
          ]}
          height={240} src={SIM} testId="ch7-sweep-chart" />
        <Caption>{tr({ ko: `중앙집중 구조에서는 시뮬레이션 곡선이 1 을 넘는 지점이 이론 한계선과 겹칩니다. 지금 전역 설정의 루프 지연은 약 ${fmt(tauLoop, 3)} ms 입니다.`, en: `In the centralised structure the simulation curve crosses 1 exactly at the theoretical line. With the current global settings the loop delay is about ${fmt(tauLoop, 3)} ms.` })}<SrcBadge src={der('ch7#loop-delay')} /></Caption>
        <CodeView code={delayMarginTask.solution} links={delayMarginTask.links} />
      </Demo>
    </LinkGroup>
  );
}

function LossDemo() {
  const cfg = config.value;
  const [pGB, setPGB] = useState(cfg.comm.loss.pGB);
  const [pBG, setPBG] = useState(cfg.comm.loss.pBG);
  const ge: LossParams = { model: 'ge', p: 0, pGB, pBG, lossGood: 0, lossBad: 1 };
  const rate = stationaryLossRate(ge);
  const bern: LossParams = { model: 'bernoulli', p: rate, pGB: 0, pBG: 1, lossGood: 0, lossBad: 1 };
  const { seqG, seqB, runsG, runsB } = useMemo(() => {
    const g = simulateLoss(ge, 200000, 11), b = simulateLoss(bern, 200000, 12);
    return { seqG: g, seqB: b, runsG: lossRunLengths(g), runsB: lossRunLengths(b) };
  }, [pGB, pBG]);
  const period = 1000 / cfg.comm.rate;
  const qG = burstLengthQuantile(ge, 1e-3), qB = burstLengthQuantile(bern, 1e-3);
  const strip = (seq: Uint8Array, label: string) => (
    <div style={{ marginBottom: '8px' }}>
      <div class="small muted">{label}</div>
      <div role="img" aria-label={`${label}: ${Array.from(seq.slice(0, 120)).filter(Boolean).length} / 120`} style={{ display: 'grid', gridTemplateColumns: 'repeat(60, 1fr)', gap: '1px', maxWidth: '560px' }}>
        {Array.from(seq.slice(0, 120)).map((v, i) => (
          <span key={i} style={{ height: '10px', borderRadius: '2px', background: v ? 'var(--critical)' : 'var(--surface-3)', outline: v ? '1px solid var(--text)' : 'none', outlineOffset: '-1px' }} />
        ))}
      </div>
    </div>
  );
  const SRC = der('ch7#ge-stationary', { ko: '아래 전이 확률로 패킷 20만 개를 시뮬레이션한 결과', en: 'Simulation of 200,000 packets with the transition probabilities below' });
  return (
    <Demo title={{ ko: '같은 손실률, 다른 손실 모양', en: 'Same loss rate, different loss pattern' }} testId="ch7-loss-demo">
      <P ko="위 줄은 손실이 **몰아서** 일어나는 길버트-엘리엇 모델, 아래 줄은 평균 손실률이 **같은** 베르누이 모델입니다. 테두리가 있는 진한 칸이 손실된 패킷입니다."
        en="The top strip is a Gilbert–Elliott model whose losses come in **bursts**; the bottom strip is a Bernoulli model with the **same** average loss rate. Dark outlined cells are lost packets." />
      <div class="controls">
        <Slider label={{ ko: 'Good→Bad 전이 확률 $p_{GB}$', en: 'Good→Bad probability $p_{GB}$' }} value={pGB} min={0.005} max={0.3} step={0.005} scale={100} unit="%" onChange={setPGB} src={ex('comm.loss.pGB', { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch7-pgb" />
        <Slider label={{ ko: 'Bad→Good 전이 확률 $p_{BG}$', en: 'Bad→Good probability $p_{BG}$' }} value={pBG} min={0.05} max={1} step={0.01} scale={100} unit="%" onChange={setPBG} src={ex('comm.loss.pBG', { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch7-pbg" />
      </div>
      {strip(seqG, tr({ ko: '길버트-엘리엇 (처음 120개 패킷)', en: 'Gilbert–Elliott (first 120 packets)' }))}
      {strip(seqB, tr({ ko: '베르누이 (처음 120개 패킷)', en: 'Bernoulli (first 120 packets)' }))}
      <StatRow>
        <Stat label={{ ko: '평균 손실률 (두 모델 공통)', en: 'Average loss rate (both models)' }} value={rate * 100} unit="%" src={der('ch7#ge-stationary')} />
        <Stat label={{ ko: '평균 연속 손실 길이 (GE)', en: 'Mean burst length (GE)' }} value={1 / pBG} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary', { ko: '1 / p_BG', en: '1 / p_BG' })} />
        <Stat label={{ ko: '1000번에 1번 나오는 연속 손실 (GE)', en: '1-in-1000 burst length (GE)' }} value={qG} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary')} status={qG > 2 * qB ? 'warn' : undefined} />
        <Stat label={{ ko: '같은 기준, 베르누이', en: 'Same criterion, Bernoulli' }} value={qB} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary')} />
      </StatRow>
      <div class="grid-2">
        <Histogram title={{ ko: '연속 손실 길이: 길버트-엘리엇', en: 'Burst lengths: Gilbert–Elliott' }} values={runsG} bins={15} range={[0.5, 15.5]}
          xLabel={{ ko: '연속 손실 길이 [패킷]', en: 'Burst length [packets]' }} slot={1} src={SRC}
          theory={{ name: { ko: '이론: 기하분포', en: 'Theory: geometric' }, pdf: (x) => pBG * Math.pow(1 - pBG, Math.round(x) - 1) }} />
        <Histogram title={{ ko: '연속 손실 길이: 베르누이', en: 'Burst lengths: Bernoulli' }} values={runsB} bins={15} range={[0.5, 15.5]}
          xLabel={{ ko: '연속 손실 길이 [패킷]', en: 'Burst length [packets]' }} slot={2} src={SRC}
          theory={{ name: { ko: '이론: 기하분포', en: 'Theory: geometric' }, pdf: (x) => (1 - rate) * Math.pow(rate, Math.round(x) - 1) }} />
      </div>
      <P ko={`방송 주기가 ${fmt(period, 3)} ms{{ex:comm.rate}} 이므로, 길버트-엘리엇에서 1000번에 1번 나오는 공백은 ${fmt(qG * period, 3)} ms{{der:ch7#ge-stationary}}, 베르누이에서는 ${fmt(qB * period, 3)} ms{{der:ch7#ge-stationary}} 입니다. 손실률이 같아도 대비해야 할 공백 시간은 몇 배씩 차이 납니다.`}
        en={`With a broadcast period of ${fmt(period, 3)} ms{{ex:comm.rate}}, the 1-in-1000 gap is ${fmt(qG * period, 3)} ms{{der:ch7#ge-stationary}} for Gilbert–Elliott and ${fmt(qB * period, 3)} ms{{der:ch7#ge-stationary}} for Bernoulli. The same loss rate can mean several times the gap you must plan for.`} />
    </Demo>
  );
}

function GainPitfall() {
  const cfg = config.value;
  const [scale, setScale] = useState(3);
  const [data, setData] = useState<{ k: number[]; err: number[]; scale: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const loop = (commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0)) * scale + 0.5 / cfg.comm.rate;
  const kStar = Math.PI / (2 * budget.value.lambdaN * loop);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const ks = [0.2, 0.4, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
      const errs = ks.map((k) => {
        let s = 0;
        for (const seed of [1, 2, 3]) s += simulateSwarm({ ...swarmFromConfig(cfg, { delay: true, noise: true, loss: false }, { seed, gain: k, delayScale: scale, T: 16, gustSigma: 0.15 }), recordEvery: 1e9 }).steadyError;
        return (s / 3) * 100;
      });
      setData({ k: ks, err: errs, scale });
      setBusy(false);
    }, 30);
  };
  const SRC = der('ch0#model', { ko: '0장의 대형 모델을 게인만 바꿔 가며 시뮬레이션한 결과(시드 3개 평균)', en: 'The formation model of chapter 0 simulated for different gains (mean of three seeds)' });
  return (
    <Pitfall title={{ ko: '지연을 무시하고 게인만 올리기', en: 'Raising the gain while ignoring the delay' }} testId="ch7-pitfall">
      <P ko="'대형이 흐트러지면 게인을 올려서 더 세게 잡으면 되지 않나?' 실제로 자주 하는 조정입니다. 게인을 올리면 돌풍은 더 잘 눌러 주지만, 지연 한계 $\tau^* = \pi/(2k\lambda_N)$ 이 그만큼 줄어듭니다. 지연이 고정이면 **넘으면 안 되는 게인** $k^* = \pi/(2\lambda_N\tau)$ 이 있습니다."
        en="'If the formation is sloppy, just raise the gain and hold it tighter?' — a very common tweak. A higher gain rejects gusts better, but the delay bound $\tau^* = \pi/(2k\lambda_N)$ shrinks with it. For a fixed delay there is a **gain you must not exceed**, $k^* = \pi/(2\lambda_N\tau)$." />
      <Slider label={{ ko: '지연을 몇 배로 키울까', en: 'Scale the delay by' }} value={scale} min={1} max={8} step={0.5} unit="×" onChange={setScale} src={ex('comm.delayMean', { ko: '전역 설정의 지연에 곱하는 배율', en: 'Multiplier on the delays in the global settings' })} testId="ch7-pitfall-scale" />
      <StatRow>
        <Stat label={{ ko: '루프 지연 τ', en: 'Loop delay τ' }} value={loop * 1000} unit="ms" src={der('ch7#loop-delay')} />
        <Stat label={{ ko: '넘으면 안 되는 게인 $k^*$', en: 'Gain limit $k^*$' }} value={kStar} unit="1/s" src={der('ch7#delay-bound', { ko: 'π/(2 λ_N τ)', en: 'π/(2 λ_N τ)' })} />
      </StatRow>
      <Button primary onClick={run} disabled={busy} testId="ch7-pitfall-run">{busy ? tr({ ko: '계산 중…', en: 'Computing…' }) : tr({ ko: '▶ 게인을 바꿔 가며 대형 오차 재기', en: '▶ Measure formation error across gains' })}</Button>
      {data && (
        <>
          <LineChart
            title={{ ko: '게인에 따른 대형 오차', en: 'Formation error versus gain' }} xLabel={{ ko: '게인 k [1/s]', en: 'Gain k [1/s]' }} yLabel={{ ko: '대형 오차 RMS [cm]', en: 'Formation error RMS [cm]' }}
            series={[{ name: { ko: '시뮬레이션', en: 'Simulation' }, x: data.k, y: data.err, slot: 1 }, { name: { ko: '시뮬레이션(점)', en: 'Simulation (points)' }, x: data.k, y: data.err, slot: 1, points: true }]}
            refLines={[{ x: Math.PI / (2 * budget.value.lambdaN * ((commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0)) * data.scale + 0.5 / cfg.comm.rate)), label: { ko: '이론 한계 k*', en: 'Theory limit k*' }, slot: 2 }]}
            src={SRC} testId="ch7-pitfall-chart" />
          <P ko="곡선은 U자 모양입니다. 왼쪽에서는 게인이 약해 돌풍을 못 누르고, 오른쪽에서는 지연 때문에 스스로 진동합니다. 가장 낮은 곳은 이론 한계 $k^*$ 의 **절반 근처나 그보다 아래**에 있습니다. 한계의 절반 이하에서 쓰는 것이 흔한 경험칙입니다."
            en="The curve is U-shaped. On the left the gain is too weak to reject gusts; on the right the delay makes the loop oscillate by itself. The minimum sits **around half of the theoretical limit $k^*$ or below**. Staying under half the limit is a common rule of thumb." />
        </>
      )}
    </Pitfall>
  );
}

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const hops = commHops(cfg);
  return (
    <>
      <Section id="arch" title={{ ko: '누가 누구의 정보를, 얼마나 늦게 받는가', en: 'Who gets whose information, and how late' }}>
        <P ko="0장의 제어식에서 드론 $i$ 는 이웃 $j$ 의 위치 $\hat p_j$ 가 필요했습니다. 그 정보가 **어떤 길로** 오느냐에 따라 지연이 걸리는 자리가 달라집니다."
          en="In the control law of chapter 0, drone $i$ needs the position $\hat p_j$ of neighbour $j$. **Which path** that information takes decides where the delay sits." />
        <div class="grid-2">
          <div class="card">
            <div class="card-title">{tr({ ko: '지상국 중계 (중앙집중)', en: 'Relay via ground station (centralised)' })}</div>
            <P ko="기체가 추정한 위치를 **Crazyradio** 로 지상 PC 에 내려보내고, PC 가 모두의 위치를 모아 명령을 계산해 다시 올려보냅니다. 정보가 무선 구간을 **두 번** 건너고, 자기 자신의 위치도 PC 를 거쳐 늦게 반영됩니다."
              en="Each vehicle sends its estimated position down to the ground PC over the **Crazyradio**; the PC gathers everyone's positions, computes commands and sends them back up. Information crosses the radio **twice**, and even a drone's own position is acted on late, via the PC." />
            <P ko="Crazyswarm 은 49대를 라디오 3개{{lit:crazyswarm2017/num-radios}}로 날렸고, 그때 측정한 지연이 약 26 ms{{lit:crazyswarm2017/latency}}였습니다. Crazyswarm2 의 기본 설정은 위치(pose) 로그를 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} 로 받습니다. 즉 아무것도 바꾸지 않으면 지상 PC 가 아는 위치는 최대 100 ms{{der:ch7#loop-delay|주기 1/10 Hz = 100 ms|period 1/10 Hz = 100 ms}} 묵은 것입니다."
              en="Crazyswarm flew 49 vehicles with three radios{{lit:crazyswarm2017/num-radios}} and measured a latency of about 26 ms{{lit:crazyswarm2017/latency}}. The default Crazyswarm2 configuration logs pose at 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}}, so out of the box the position known to the ground PC can be up to 100 ms{{der:ch7#loop-delay|주기 1/10 Hz = 100 ms|period 1/10 Hz = 100 ms}} old." />
          </div>
          <div class="card">
            <div class="card-title">{tr({ ko: '기체 간 직접 통신 (P2P)', en: 'Direct between vehicles (P2P)' })}</div>
            <P ko="기체끼리 직접 위치를 주고받고, 각자 **온보드**에서 명령을 계산합니다. 이웃 정보는 무선 구간을 **한 번**만 건너고, 자기 위치는 방금 추정한 값을 바로 씁니다."
              en="Vehicles exchange positions directly and each computes its command **onboard**. Neighbour information crosses the radio **once**, and a drone uses its own freshly estimated position immediately." />
            <P ko="대신 5대가 같은 채널에서 번갈아 말해야 하므로 방송 주기를 올리기 어렵고, 받는 쪽이 놓치면 그만입니다(재전송 없음). 이 교재는 P2P 의 구현 방법은 다루지 않고, **지연이 걸리는 자리가 다르다**는 점만 비교합니다."
              en="In exchange, five vehicles must take turns on one channel, so the broadcast rate is hard to raise, and a missed packet is simply gone (no retransmission). This textbook does not cover how to implement P2P; it only compares **where the delay sits**." />
          </div>
        </div>
        <Derivation id="loop-delay" title={{ ko: '루프 지연을 더하는 법', en: 'Adding up the loop delay' }}>
          <P ko="정보가 측정된 순간부터 그 정보로 계산한 명령이 기체를 움직이기까지의 시간을 **루프 지연**이라고 합시다. 지상국 중계에서는"
            en="Call the time from the instant information is measured until a command computed from it moves the vehicle the **loop delay**. For the ground relay," />
          <M block tex={String.raw`\tau_{\text{loop}} \;=\; \underbrace{\tau_{\text{est}}}_{\tx{측위→FC}{estimate→FC}} \;+\; \underbrace{2\,\tau_c}_{\tx{내려가고 올라오기}{down and back up}} \;+\; \underbrace{\tfrac{1}{2}T_c}_{\tx{표본 유지}{sample and hold}}`} />
          <P ko="마지막 항은 정보가 주기 $T_c$ 마다 한 번씩만 갱신되기 때문에 생깁니다. 갱신 직후에는 나이가 0, 다음 갱신 직전에는 $T_c$ 이므로 평균 $T_c/2$ 만큼 늦은 것과 같습니다(가장 나쁠 때는 $T_c$). P2P 에서는 $2\tau_c$ 가 $\tau_c$ 로 줄고, 이 지연은 **이웃 정보에만** 걸립니다."
            en="The last term arises because information is refreshed only once per period $T_c$: its age is 0 right after an update and $T_c$ right before the next, i.e. on average $T_c/2$ late (worst case $T_c$). For P2P, $2\tau_c$ becomes $\tau_c$ and the delay applies **only to neighbour information**." />
          <P ko={`지금 설정으로는: 측위 지연 {{cfg:estimation.latency}}, 편도 통신 지연 {{cfg:comm.delayMean}}, 방송 주기 {{cfg:comm.rate}}, 무선 구간 ${hops}개 → 루프 지연 약 ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch7#loop-delay}}.`}
            en={`With the current settings: estimation latency {{cfg:estimation.latency}}, one-way comm delay {{cfg:comm.delayMean}}, broadcast rate {{cfg:comm.rate}}, ${hops} radio hop(s) → loop delay about ${fmt(b.loopDelay * 1000, 3)} ms{{der:ch7#loop-delay}}.`} />
        </Derivation>
        <Note>
          <P ko="**루프가 닫히지 않는 방식도 있습니다.** Crazyswarm2 의 기본 사용법은 미리 짠 궤적을 각 기체에 올려 두고 동시에 시작시키는 것입니다. 이때 각 기체는 자기 위치만 보고 자기 궤적을 따라가므로, 통신 지연은 안정성 문제를 만들지 않습니다. 그 대신 기체들은 **서로를 보지 않으므로** 한 대가 밀려도 나머지가 맞춰 주지 않고, 두 기체의 측위 오차가 그대로 더해집니다. 서로의 위치에 반응하는 순간(대형 보정, 충돌 회피) 루프가 닫히고 이 장의 내용이 적용됩니다."
            en="**There is also a way that never closes the loop.** The default Crazyswarm2 workflow uploads pre-planned trajectories to each vehicle and starts them together. Each vehicle then follows its own trajectory using only its own position, so communication delay causes no stability problem. In return the vehicles **do not watch each other**: if one is pushed aside the others do not compensate, and the positioning errors of two vehicles simply add. The moment vehicles react to each other's positions (formation correction, collision avoidance), the loop closes and this chapter applies." />
        </Note>
      </Section>

      <Section id="graph" title={{ ko: '그래프와 라플라시안', en: 'Graphs and the Laplacian' }}>
        <P ko="'누가 누구의 정보를 받는가'를 **그래프**로 그립니다. 드론이 점(노드), 정보가 오가는 관계가 선(에지)입니다. 이 그림을 계산에 쓰려고 행렬로 옮긴 것이 **인접행렬**(adjacency matrix) $A$ 이고(연결되어 있으면 $a_{ij} = 1$), 각 드론의 이웃 수를 대각에 놓은 **차수행렬**(degree matrix) $D$ 에서 $A$ 를 뺀 것이 **라플라시안**(Laplacian) $L = D - A$ 입니다."
          en="We draw 'who receives whose information' as a **graph**: drones are nodes, information links are edges. Written as a matrix for computation it is the **adjacency matrix** $A$ ($a_{ij} = 1$ when linked); subtracting it from the **degree matrix** $D$ (number of neighbours on the diagonal) gives the **Laplacian** $L = D - A$." />
        <Derivation id="laplacian" title={{ ko: '합의 식을 라플라시안으로 쓰기', en: 'Writing consensus with the Laplacian' }}>
          <P ko="한 축만 보고, 대형 오프셋과 기준 속도를 빼면(둘 다 미리 아는 값이라 뺄 수 있습니다) 0장의 식은 $\dot x_i = k\sum_j a_{ij}(x_j - x_i)$ 가 됩니다. 괄호를 풀면"
            en="Looking at one axis and subtracting the formation offsets and reference velocity (both known in advance), the law of chapter 0 becomes $\dot x_i = k\sum_j a_{ij}(x_j - x_i)$. Expanding," />
          <M block tex={String.raw`\dot x_i = k\Big(\sum_j a_{ij}x_j - \underbrace{\textstyle\sum_j a_{ij}}_{d_i}\,x_i\Big) \quad\Longrightarrow\quad \dot x = -k\,(D - A)\,x = -k\,L\,x`} />
          <P ko="$L$ 은 대칭행렬이므로 고유값 $0 = \lambda_1 \le \lambda_2 \le \dots \le \lambda_N$ 과 서로 수직인 고유벡터를 갖습니다. $x$ 를 고유벡터 방향 성분 $y_i$ 로 나누면 각 성분이 따로 움직입니다."
            en="$L$ is symmetric, so it has eigenvalues $0 = \lambda_1 \le \lambda_2 \le \dots \le \lambda_N$ and orthogonal eigenvectors. Splitting $x$ into components $y_i$ along the eigenvectors, each component evolves independently." />
          <M block tex={String.raw`\dot y_i = -k\lambda_i\,y_i \;\Rightarrow\; y_i(t) = y_i(0)\,e^{-k\lambda_i t}`} />
          <List items={[
            { ko: '$\\lambda_1 = 0$ 의 고유벡터는 $[1,1,\\dots,1]$, 즉 "모두 같은 값". 이 성분은 변하지 않습니다 — 평균은 보존됩니다.', en: 'The eigenvector of $\\lambda_1 = 0$ is $[1,1,\\dots,1]$, "everyone equal". This component does not change — the mean is preserved.' },
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
            ko: '**줄어듭니다.** 이웃이 많을수록 한 번에 받는 보정의 합이 커져서, 사실상 게인을 올린 것과 같습니다. 5대 기준으로 고리는 $\\lambda_N \\approx 3.62${{der:ch7#laplacian}}, 완전 그래프는 $\\lambda_N = 5${{der:ch7#laplacian}} 이므로 지연 한계가 약 28%{{der:ch7#delay-bound|1 − 3.62/5|1 − 3.62/5}} 줄어듭니다. 빠른 수렴과 지연 여유는 맞바꾸는 관계입니다{{lit:olfati2004/tradeoff-delay-speed}}.',
            en: '**It shrinks.** More neighbours means a larger total correction at once — effectively a higher gain. For five drones the ring has $\\lambda_N \\approx 3.62${{der:ch7#laplacian}} and the complete graph $\\lambda_N = 5${{der:ch7#laplacian}}, so the delay bound drops by about 28%{{der:ch7#delay-bound|1 − 3.62/5|1 − 3.62/5}}. Fast convergence and delay margin trade off against each other{{lit:olfati2004/tradeoff-delay-speed}}.',
          }} />
        <Derivation id="delay-bound" title={{ ko: '지연 한계의 유도', en: 'Deriving the delay bound' }}>
          <P ko="중앙집중 구조처럼 **모든** 상태가 $\tau$ 만큼 늦게 반영되면 $\dot x(t) = -kL\,x(t-\tau)$ 입니다. 앞에서처럼 고유벡터 성분으로 나누면 성분마다"
            en="When **every** state is acted on $\tau$ late, as in the centralised structure, $\dot x(t) = -kL\,x(t-\tau)$. Splitting into eigenvector components as before, each obeys" />
          <M block tex={String.raw`\dot y_i(t) = -k\lambda_i\,y_i(t-\tau)`} />
          <P ko="이것은 0장에서 드론 두 대로 풀었던 식과 모양이 같고, $2k$ 자리에 $k\lambda_i$ 가 들어갔을 뿐입니다. 같은 방법($y = e^{st}$, 경계에서 $s = j\omega$)으로 풀면 성분 $i$ 가 안정할 조건은 $k\lambda_i\tau < \pi/2$. 모든 성분이 안정해야 하므로 가장 까다로운 것은 **가장 큰** 고유값입니다."
            en="This has the same form as the two-drone equation of chapter 0, with $k\lambda_i$ in place of $2k$. Solving the same way ($y = e^{st}$, $s = j\omega$ at the boundary), component $i$ is stable when $k\lambda_i\tau < \pi/2$. All components must be stable, so the binding one is the **largest** eigenvalue." />
          <M block tex={String.raw`0 < \tau < \tau^{*} = \frac{\pi}{2\,k\,\lambda_N}`} />
          <P ko="게인을 그래프 가중치에 넣어 $k = 1$ 로 쓰면 Olfati-Saber 와 Murray 의 정리 10 과 같은 식입니다{{lit:olfati2004/delay-bound}}. 고유값을 구하기 귀찮을 때는 $\lambda_N \le 2 d_{\max}$ ($d_{\max}$ = 이웃이 가장 많은 드론의 이웃 수)를 써서 $\tau < \pi/(4 k\,d_{\max})$ 이면 충분하다고 어림할 수 있습니다{{lit:olfati2004/lambda-max-degree-bound}}."
            en="With the gain absorbed into the graph weights ($k = 1$) this is Theorem 10 of Olfati-Saber and Murray{{lit:olfati2004/delay-bound}}. If you do not want to compute eigenvalues, use $\lambda_N \le 2 d_{\max}$ ($d_{\max}$ = the largest number of neighbours) to get the sufficient condition $\tau < \pi/(4 k\,d_{\max})$ {{lit:olfati2004/lambda-max-degree-bound}}." />
        </Derivation>
        <DelayDemo />
        <Derivation id="p2p-stable" title={{ ko: '이웃 정보만 늦으면 왜 발산하지 않나', en: 'Why it does not diverge when only neighbours are late' }}>
          <P ko="P2P 구조에서는 자기 위치를 바로 쓰므로 $\dot x_i(t) = k\sum_j a_{ij}\big(x_j(t-\tau) - x_i(t)\big)$ 입니다. 자기 자신에 대한 항 $-k d_i x_i(t)$ 가 지연 없이 바로 작용하는 **브레이크**가 됩니다. 이웃에게서 오는 낡은 정보의 합은 크기가 $k d_i \max_j |x_j|$ 를 넘지 못하므로, 가장 큰 값을 가진 드론은 지연이 얼마든 항상 줄어드는 쪽으로 밀립니다. 그래서 지연과 무관하게 발산하지 않습니다."
            en="In the P2P structure a drone uses its own position immediately: $\dot x_i(t) = k\sum_j a_{ij}\big(x_j(t-\tau) - x_i(t)\big)$. Its own term $-k d_i x_i(t)$ acts without delay, like a **brake**. The sum of stale neighbour terms cannot exceed $k d_i \max_j |x_j|$ in size, so the drone with the largest value is always pushed inward, whatever the delay. Hence no divergence for any delay." />
          <P ko="공짜는 아닙니다. 대형이 속도 $v$ 로 움직이는 동안 이웃은 항상 $v\tau$ 만큼 **뒤에** 있는 것처럼 보이므로, 그만큼 대형이 일그러지거나 느려집니다. 이 $v\tau$ 가 오차 예산의 '통신 지연 × 상대속도' 항이고, 8장의 이웃 위치 외삽으로 줄일 수 있습니다."
            en="It is not free. While the formation moves at speed $v$, neighbours always appear $v\tau$ **behind**, so the formation is distorted or slowed by that much. This $v\tau$ is the 'comm delay × relative speed' item of the error budget, and neighbour extrapolation in chapter 8 reduces it." />
        </Derivation>
        <CodeTask task={delayMarginTask} />
      </Section>

      <Section id="loss" title={{ ko: '패킷 손실: 얼마나 자주보다 얼마나 길게', en: 'Packet loss: how long matters more than how often' }}>
        <P ko="무선 패킷은 가끔 사라집니다. 가장 단순한 모델은 패킷마다 독립적으로 확률 $p$ 로 사라지는 **베르누이**(Bernoulli) 모델입니다. 하지만 실제 손실은 간섭이나 가림 때문에 **몰아서** 일어나는 경우가 많습니다. 이를 흉내 내는 가장 간단한 모델이 **길버트-엘리엇**(Gilbert–Elliott) 모델로, 채널이 Good 과 Bad 두 상태를 오가며 상태마다 손실 확률이 다릅니다."
          en="Radio packets sometimes vanish. The simplest model drops each packet independently with probability $p$: the **Bernoulli** model. Real losses, however, often come in **bursts** due to interference or blockage. The simplest model that mimics this is the **Gilbert–Elliott** model: the channel alternates between a Good and a Bad state with a different loss probability in each." />
        <Derivation id="ge-stationary" title={{ ko: '길버트-엘리엇 모델의 평균 손실률과 연속 손실 길이', en: 'Average loss rate and burst length of the Gilbert–Elliott model' }}>
          <P ko="패킷마다 Good→Bad 로 갈 확률을 $p_{GB}$, Bad→Good 으로 돌아올 확률을 $p_{BG}$ 라 합시다. 오래 지나면 Bad 로 들어가는 흐름과 나오는 흐름이 균형을 이룹니다: $\pi_G\,p_{GB} = \pi_B\,p_{BG}$, 그리고 $\pi_G + \pi_B = 1$."
            en="Let $p_{GB}$ be the per-packet probability of going Good→Bad and $p_{BG}$ of returning Bad→Good. In the long run the flow into Bad balances the flow out: $\pi_G\,p_{GB} = \pi_B\,p_{BG}$, with $\pi_G + \pi_B = 1$." />
          <M block tex={String.raw`\pi_B = \frac{p_{GB}}{p_{GB} + p_{BG}}, \qquad \tx{평균 손실률}{average loss rate} = (1-\pi_B)\,h_G + \pi_B\,h_B`} />
          <P ko="$h_G$, $h_B$ 는 각 상태에서의 손실 확률입니다. Bad 상태에 한번 들어가면 매 패킷마다 확률 $p_{BG}$ 로 빠져나오므로 머무는 길이는 기하분포를 따르고 평균은 $1/p_{BG}$ 패킷입니다. $h_B = 1$, $h_G = 0$ 이면 이것이 곧 **연속 손실 길이**입니다."
            en="$h_G$, $h_B$ are the loss probabilities in each state. Once in Bad, the channel leaves with probability $p_{BG}$ per packet, so the stay is geometrically distributed with mean $1/p_{BG}$ packets. With $h_B = 1$, $h_G = 0$ that is exactly the **burst length**." />
          <P ko="안전에 필요한 것은 평균이 아니라 '드물지만 일어나는 긴 공백'입니다. 이 교재는 **어느 패킷에서 시작하든 $L$ 개가 연속으로 사라질 확률이 1/1000 이하가 되는 가장 작은 $L$** 을 $L_{99.9}$ 라 부르고, 그 동안의 시간 $L_{99.9}\,T_c$ 를 통신 공백으로 예산에 넣습니다. 베르누이에서는 $p^L \le 10^{-3}$ 을 풀면 됩니다."
            en="For safety we need not the mean but 'the rare long gap'. This textbook defines $L_{99.9}$ as **the smallest $L$ such that the probability of $L$ consecutive losses starting at any packet is at most 1/1000**, and budgets the time $L_{99.9}\,T_c$ as the communication gap. For Bernoulli this is solving $p^L \le 10^{-3}$." />
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
        <div class="controls">
          <CfgSlider path="comm.gain" max={8} />
          <CfgSlider path="comm.delayMean" max={200} />
          <CfgSlider path="comm.rate" max={100} />
        </div>
        <StatRow>
          <Stat label={{ ko: '루프 지연', en: 'Loop delay' }} value={b.loopDelay * 1000} unit="ms" src={der('ch7#loop-delay')} />
          <Stat label={{ ko: '지연 한계 $\\tau^*$', en: 'Delay bound $\\tau^*$' }} value={b.delayMargin * 1000} unit="ms" src={der('ch7#delay-bound')} />
          <Stat label={{ ko: '여유 배수 $\\tau^*/\\tau_{\\text{loop}}$', en: 'Margin factor $\\tau^*/\\tau_{\\text{loop}}$' }} value={b.delayMargin / b.loopDelay} unit="×" src={der('ch7#delay-bound')} status={cfg.comm.topology === 'p2p' ? 'good' : b.delayMargin / b.loopDelay < 1 ? 'bad' : b.delayMargin / b.loopDelay < 2 ? 'warn' : 'good'} />
          <Stat label={{ ko: '평균 손실률', en: 'Average loss rate' }} value={b.lossRate * 100} unit="%" src={der('ch7#ge-stationary')} />
        </StatRow>
        <P ko={`통신 구조는 지금 **${cfg.comm.topology === 'ground' ? '지상국 중계' : '기체 간 직접(P2P)'}**, 그래프는 **${GRAPHS.find((g) => g.value === cfg.comm.graph)!.label.ko}** 입니다(설정에서 바꿀 수 있습니다). ${cfg.comm.topology === 'p2p' ? 'P2P 에서는 지연 한계가 안정성 조건이 아니라 참고값입니다.' : '여유 배수가 2 보다 작으면 게인을 낮추거나 지연을 줄여야 합니다.'}`}
          en={`The communication structure is currently **${cfg.comm.topology === 'ground' ? 'ground relay' : 'direct (P2P)'}** and the graph is **${GRAPHS.find((g) => g.value === cfg.comm.graph)!.label.en}** (change them in Settings). ${cfg.comm.topology === 'p2p' ? 'For P2P the delay bound is a reference value, not a stability condition.' : 'If the margin factor is below 2, lower the gain or reduce the delay.'}`} />
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
      ko: '이 장은 예산에 세 가지를 더합니다. ① 통신 지연과 방송 주기 동안 이웃이 움직인 거리, ② 1000번에 1번 나오는 연속 손실 동안 움직인 거리, ③ 안정성 조건인 지연 한계 $\\tau^*$. ①과 ②는 최소 간격에 **그대로 더해지는** 확정 항이고, ③은 간격이 아니라 "이 게인을 써도 되는가"를 판정합니다.',
      en: 'This chapter adds three things. ① The distance a neighbour moves during the comm delay and broadcast period, ② the distance moved during a 1-in-1000 loss burst, ③ the stability condition, the delay bound $\\tau^*$. ① and ② are deterministic terms **added directly** to the minimum spacing; ③ decides not spacing but whether this gain is admissible.',
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
