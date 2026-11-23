import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fix, fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { fusedSteadySigma, maneuverAccelRms, mismatchedSteadyState, simulateDelayed1d, simulateKf1d } from '../../sim/ch5_kf1d';
import { FusionParams, FusionResult, lissajous, simulateFusion } from '../../sim/fusion';
import { steadyStatePosSigma } from '../../sim/kf';
import { Vec, covEllipse } from '../../sim/linalg';
import { der, ex, lit } from '../../sources';
import {
  Button, Caption, CfgSlider, CodeTask, CodeView, Demo, Derivation, LineChart, LinkGroup, List, M, McPanel, Note, P, Pitfall, PlanView, Predict, PredictNumber,
  Section, Segmented, Slider, SrcBadge, Stat, StatRow, Status, T, seriesColor, useDebounced,
} from '../../ui';
import { kfDelayedTask, tasks } from './tasks';
import { useChunked } from './useChunked';

/** 시뮬레이션 점을 나눠 다시 계산하는 동안 보이는 안내(그동안 그래프의 점은 흐리게 그린다) */
function Busy({ on, what }: { on: boolean; what?: { ko: string; en: string } }) {
  return <p class="small muted" role="status" aria-live="polite" style={{ margin: '2px 0 0', minHeight: '1.4em' }}>
    {on ? tr(what ?? { ko: '⏳ 시뮬레이션 점을 다시 계산하는 중… (흐린 점은 이전 값)', en: '⏳ Recomputing the simulation dots… (faint dots are the previous values)' }) : ''}
  </p>;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const LOCAL = { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' };
const SIM_KF = der('ch5#kf', { ko: '이 장의 1차원 칼만 필터(상태 = 위치·속도)를 화면의 값으로 시뮬레이션한 결과', en: 'The 1-D Kalman filter of this chapter (state = position, velocity) simulated with the values on screen' });
const TH_SS = der('ch5#steady-state', { ko: '리카티 반복의 고정점(정상상태 공분산)에서 계산한 값', en: 'Computed from the fixed point of the Riccati iteration (steady-state covariance)' });
const SIM_FUS = der('ch5#tight-loose', { ko: '교재의 UWB+IMU EKF(상태 6개짜리 교육용 모델)를 현재 설정으로 시뮬레이션한 결과. Crazyflie 펌웨어의 재현이 아닙니다.', en: 'The textbook UWB+IMU EKF (a 6-state teaching model) simulated with the current settings. Not a reproduction of the Crazyflie firmware.' });
const NIS = der('ch5#nis', { ko: '혁신의 제곱을 필터가 예상한 분산 S 로 나눈 값(NIS)의 평균. 가정이 맞으면 1', en: 'Mean of the squared innovation divided by the variance S the filter expects (NIS); 1 if the assumptions hold' });
const SIM_DELAY = der('ch5#delayed', { ko: '지연된 측정을 세 가지 방식으로 처리하는 1차원 칼만 필터를 시뮬레이션한 결과', en: 'Simulation of a 1-D Kalman filter that handles a delayed measurement in three ways' });
/** 기준 구현에서 predict·update 부분만 (지연 처리 함수는 과제의 정답이므로 여기서는 보이지 않는다) */
const KF_CODE = kfDelayedTask.solution.split('\ndef kf_delayed')[0];

/* ───────────────────────── 데모 1: 1차원 칼만 필터의 Q/R ───────────────────────── */
function KfTuning() {
  const cfg = config.value, b = budget.value;
  const aTrue = cfg.estimation.accelNoise;
  const [sigZ, setSigZ] = useState(() => clamp(Math.round(b.sigmaPosH * 200) / 200, 0.02, 0.4));
  const [rMult, setRMult] = useState(1);
  const [sigA, setSigA] = useState(() => clamp(aTrue, 0.05, 10));
  const [rate, setRate] = useState(10);
  const [seed, setSeed] = useState(1);
  const prm = useDebounced({ sigZ, rMult, sigA, rate, seed }, 120);
  const sim = useMemo(() => simulateKf1d({ rate: prm.rate, T: 20, sigmaZTrue: prm.sigZ, sigmaZFilter: prm.sigZ * prm.rMult, sigmaAFilter: prm.sigA, truth: 'maneuver', sigmaATrue: 0, seed: prm.seed }), [prm]);
  const believed = useMemo(() => steadyStatePosSigma(prm.sigZ * prm.rMult, prm.rate, prm.sigA), [prm.sigZ, prm.rMult, prm.rate, prm.sigA]);
  const accelRms = useMemo(() => maneuverAccelRms(), []);
  const band = useMemo(() => ({
    up: sim.est.map((e, i) => e + 2 * sim.sigma[i]), lo: sim.est.map((e, i) => e - 2 * sim.sigma[i]),
    eEst: sim.est.map((e, i) => (e - sim.truth[i]) * 100), eMeas: sim.z.map((z, i) => (z - sim.truth[i]) * 100),
    eUp: sim.sigma.map((s) => 200 * s), eLo: sim.sigma.map((s) => -200 * s),
  }), [sim]);
  // 가정한 σ_a 를 쓸어 보기: 세계는 모델과 같은 꼴(스텝마다 일정한 무작위 가속, σ = aTrue)로 움직인다.
  // 이론선은 바로, 시뮬레이션 점(3000스텝 × 7)은 입력이 멈춘 뒤 한 점씩 나눠 계산한다(화면이 멈추지 않게).
  const sweep = useMemo(() => {
    const lx: number[] = [], bel: number[] = [], act: number[] = [];
    for (let i = 0; i <= 30; i++) {
      const e = -1.5 + (3 * i) / 30;
      const m = mismatchedSteadyState(prm.rate, aTrue, prm.sigZ, aTrue * 10 ** e, prm.sigZ * prm.rMult);
      lx.push(e); bel.push(m.believed * 100); act.push(m.actual * 100);
    }
    return { lx, bel, act };
  }, [prm.rate, prm.sigZ, prm.rMult, aTrue]);
  const sweepIn = { rate: prm.rate, sigZ: prm.sigZ, rMult: prm.rMult, aTrue };
  const sweepSim = useChunked(JSON.stringify(sweepIn), 7, (i) => {
    const e = -1.5 + 0.5 * i;
    return simulateKf1d({ rate: sweepIn.rate, T: 3000 / sweepIn.rate, sigmaZTrue: sweepIn.sigZ, sigmaZFilter: sweepIn.sigZ * sweepIn.rMult, sigmaAFilter: sweepIn.aTrue * 10 ** e, truth: 'random', sigmaATrue: sweepIn.aTrue, seed: 11 + i }).rmse * 100;
  }, 250);
  const sweepSx = [0, 1, 2, 3, 4, 5, 6].map((i) => -1.5 + 0.5 * i);
  const here = useMemo(() => mismatchedSteadyState(prm.rate, aTrue, prm.sigZ, prm.sigA, prm.sigZ * prm.rMult), [prm.rate, prm.sigZ, prm.rMult, prm.sigA, aTrue]);
  const verdict = sim.meanNis > 1.5 ? 'over' : sim.meanNis < 0.6 ? 'under' : 'ok';
  return (
    <LinkGroup>
      <Demo title={{ ko: '1차원 칼만 필터: Q 와 R 을 돌려 보기', en: '1-D Kalman filter: turn the Q and R knobs' }} testId="ch5-kf-demo">
        <P ko="드론이 한 축 위에서 '멈춤 → 이동 → 멈춤'을 되풀이합니다. 위치 측정(점)에는 노이즈가 있고, 필터는 드론이 언제 움직일지 모릅니다. 수식의 항을 가리키면 아래 코드와 그래프에서 같은 것이 강조됩니다."
          en="A drone repeats 'hover → move → hover' along one axis. The position measurements (dots) are noisy and the filter does not know when the drone will move. Point at a term of the formula to highlight the same thing in the code and the charts." />
        <M block tex={String.raw`\begin{aligned}
\tx{예측}{Predict}:&\quad \lk{xpred}{x^- = F\hat x},\qquad \lk{ppred}{P^- = F P F\T + Q}\\
\tx{갱신}{Update}:&\quad \lk{innov}{\nu = z - Hx^-},\qquad \lk{gain}{K = P^- H\T / S},\quad S = HP^-H\T + R\\
&\quad \lk{xupd}{\hat x = x^- + K\nu},\qquad \lk{pupd}{P = (I - KH)\,P^-}
\end{aligned}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 코드 줄과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines and chart lines.' })}</p>
        <div class="controls">
          <Slider label={{ ko: '실제 측정 노이즈 $\\sigma_z$', en: 'True measurement noise $\\sigma_z$' }} value={sigZ} min={0.02} max={0.4} step={0.005} scale={100} unit="cm" onChange={setSigZ}
            src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 처음 값은 지금 설정의 UWB 수평 위치 오차입니다.', en: 'Local to this demo; starts from the UWB horizontal position error of the current settings.' })} testId="ch5-kf-sigz" />
          <Slider label={{ ko: 'R 배율: 가정 ÷ 실제 $\\sigma_z$', en: 'R factor: assumed ÷ true $\\sigma_z$' }} value={rMult} min={0.2} max={5} step={0.1} unit="×" onChange={setRMult} src={ex(undefined, LOCAL)} testId="ch5-kf-rmult" />
          <Slider label={{ ko: '필터의 Q: 가정한 가속도 $\\sigma_a$', en: 'Filter Q: assumed acceleration $\\sigma_a$' }} value={sigA} min={0.05} max={10} step={0.05} unit="m/s²" onChange={setSigA}
            src={ex('estimation.accelNoise', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} testId="ch5-kf-siga" />
          <Slider label={{ ko: '측정(갱신) 주기', en: 'Measurement (update) rate' }} value={rate} min={2} max={50} step={1} unit="Hz" onChange={setRate} src={ex(undefined, LOCAL)} testId="ch5-kf-rate" />
        </div>
        <div class="btn-row" style={{ marginBottom: '10px' }}>
          <Button onClick={() => setSigA(0.05)} testId="ch5-kf-small">{tr({ ko: 'Q 너무 작게', en: 'Q too small' })}</Button>
          <Button onClick={() => setSigA(1)} testId="ch5-kf-mid">{tr({ ko: 'Q 적당히', en: 'Q about right' })}</Button>
          <Button onClick={() => setSigA(10)} testId="ch5-kf-large">{tr({ ko: 'Q 너무 크게', en: 'Q too large' })}</Button>
          <Button onClick={() => setSeed(seed + 1)}>{tr({ ko: '다른 노이즈로 다시', en: 'Different noise' })}</Button>
        </div>
        <LineChart
          title={{ ko: '위치: 참값, 측정, 추정', en: 'Position: truth, measurements, estimate' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 [m]', en: 'Position [m]' }} height={270}
          series={[
            { name: { ko: '측정 z', en: 'Measurement z' }, x: sim.t, y: sim.z, slot: 4, points: true, link: 'innov' },
            { name: { ko: '참값', en: 'Truth' }, x: sim.t, y: sim.truth, slot: 7, dash: '7 4' },
            { name: { ko: '추정 ±2σ', en: 'Estimate ±2σ' }, x: sim.t, y: band.up, slot: 3, dash: '2 3', width: 1.3, link: 'pupd' },
            { name: { ko: '추정 −2σ', en: 'Estimate −2σ' }, x: sim.t, y: band.lo, slot: 3, legend: false, dash: '2 3', width: 1.3, link: 'pupd' },
            { name: { ko: '추정', en: 'Estimate' }, x: sim.t, y: sim.est, slot: 1, dash: '', width: 2.4, link: 'xupd' },
          ]}
          src={SIM_KF} testId="ch5-kf-chart" />
        <LineChart
          title={{ ko: '오차로 다시 보기: 참값을 뺀 것', en: 'The same as errors: truth subtracted' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '오차 [cm]', en: 'Error [cm]' }} height={230}
          series={[
            { name: { ko: '측정 오차', en: 'Measurement error' }, x: sim.t, y: band.eMeas, slot: 4, points: true, link: 'innov' },
            { name: { ko: '필터가 믿는 +2σ', en: 'Filter’s own +2σ' }, x: sim.t, y: band.eUp, slot: 3, dash: '2 3', width: 1.6, link: 'pupd' },
            { name: { ko: '필터가 믿는 −2σ', en: 'Filter’s own −2σ' }, x: sim.t, y: band.eLo, slot: 3, dash: '2 3', width: 1.6, link: 'pupd' },
            { name: { ko: '추정 오차', en: 'Estimate error' }, x: sim.t, y: band.eEst, slot: 1, dash: '', width: 2.4, link: 'xupd' },
          ]}
          refLines={[{ y: 0 }]} src={SIM_KF} testId="ch5-kf-err-chart" />
        <StatRow>
          <Stat label={{ ko: '필터가 믿는 σ (정상상태, 이론)', en: 'σ the filter believes (steady state, theory)' }} value={believed * 100} unit="cm" src={TH_SS} />
          <Stat label={{ ko: '실제 추정 오차 RMS (시뮬레이션)', en: 'Actual estimate error RMS (simulation)' }} value={sim.rmse * 100} unit="cm" src={SIM_KF} status={sim.rmse > sim.rmseMeas ? 'bad' : undefined} />
          <Stat label={{ ko: '측정 오차 RMS (필터 없이)', en: 'Measurement error RMS (no filter)' }} value={sim.rmseMeas * 100} unit="cm" src={SIM_KF} />
          <Stat label={{ ko: '칼만 이득의 위치 성분 $K[0]$', en: 'Position entry of the Kalman gain, $K[0]$' }} value={sim.K[0]} src={SIM_KF} />
          <Stat label={{ ko: '평균 NIS', en: 'Mean NIS' }} value={sim.meanNis} src={NIS} status={verdict === 'over' ? 'bad' : verdict === 'under' ? 'warn' : 'good'} />
        </StatRow>
        <p>{verdict === 'over'
          ? <Status kind="bad">{tr({ ko: '과신: 실제 오차가 필터가 믿는 띠 밖으로 나갑니다 (Q 가 너무 작거나 R 이 너무 작음)', en: 'Over-confident: the real error leaves the band the filter believes in (Q or R too small)' })}</Status>
          : verdict === 'under'
            ? <Status kind="warn">{tr({ ko: '과소신뢰: 띠가 실제 오차보다 훨씬 넓습니다 (Q 나 R 이 너무 큼)', en: 'Under-confident: the band is much wider than the real error (Q or R too large)' })}</Status>
            : <Status kind="good">{tr({ ko: '믿는 불확실성과 실제 오차가 대체로 맞습니다', en: 'Believed uncertainty and real error roughly agree' })}</Status>}</p>
        <P ko="**통계 칸 읽는 법.** '필터가 믿는 σ' 는 띠의 폭이 더 이상 변하지 않을 때(**정상상태**, 다음 절)의 $\sqrt{P[p,p]}$ 입니다. **NIS** $= \nu^2/S$ 는 혁신을 필터가 예상한 크기로 나눠 제곱한 값으로, 평균이 1 근처면 필터의 자신감이 맞다는 뜻입니다. 1 보다 크면 과신, 작으면 과소신뢰입니다. 이 데모는 평균 NIS 가 0.6{{ex}}–1.5{{ex}} 밖이면 경고합니다. 자세한 뜻과 판정 기준은 아래 '필터가 스스로를 점검하는 숫자, NIS' 에 있습니다."
          en="**Reading the tiles.** 'σ the filter believes' is $\sqrt{P[p,p]}$ once the band stops changing width (the **steady state**, next section). The **NIS** $= \nu^2/S$ is the innovation divided by the size the filter expects, squared; a mean near 1 says the filter's confidence is right, above 1 over-confident, below 1 under-confident. This demo warns when the mean NIS is outside 0.6{{ex}}–1.5{{ex}}. The meaning and the threshold are explained under 'NIS: the number a filter uses to check itself' below." />
        <Caption>{tr({
          ko: `기동은 위치 0 → 1.5 → 0.5 → 2 m 를 멈춤·이동으로 잇는 20초짜리 고정 경로입니다(이 데모의 고정값). 이 기동의 가속도 크기는 RMS 로 약 ${fmt(accelRms, 2)} m/s² 입니다. Q 를 그보다 훨씬 작게 잡으면 필터는 '드론은 거의 안 움직인다'고 믿고 측정을 조금씩만 받아들여, 추정이 매끈하지만 출발·정지 때 뒤처집니다. 훨씬 크게 잡으면 측정을 거의 그대로 따라가 노이즈가 그대로 남습니다.`,
          en: `The manoeuvre is a fixed 20 s path (fixed for this demo) linking positions 0 → 1.5 → 0.5 → 2 m with hovers and moves. Its acceleration is about ${fmt(accelRms, 2)} m/s² RMS. With Q far below that, the filter believes 'the drone hardly moves' and accepts only a little of each measurement: the estimate is smooth but lags at every start and stop. With Q far above, it follows the measurements almost exactly and keeps their noise.`,
        })}<SrcBadge src={der('ch5#kf', { ko: '경로 숫자(0, 1.5, 0.5, 2 m, 20 s)는 이 데모의 고정 예시값. 가속도 RMS 는 그 기동(구간별 코사인 곡선)을 수치 미분해 구한 값', en: 'The path numbers (0, 1.5, 0.5, 2 m, 20 s) are fixed example values of this demo; the acceleration RMS is the numerical derivative of that manoeuvre (piecewise cosine)' })} /></Caption>
        <details style={{ marginTop: '8px' }} data-testid="ch5-kf-code">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{tr({ ko: '수식과 연결된 코드 보기 (장 끝 과제의 predict·update 기준 구현입니다 — 먼저 풀어 보려면 열지 마세요)', en: 'Show the code linked to the formula (the reference predict/update of the task at the end of the chapter — keep it closed if you want to try first)' })}</summary>
          <CodeView code={KF_CODE} links={kfDelayedTask.links} />
        </details>
      </Demo>

      <Demo title={{ ko: '이론과 시뮬레이션: 필터가 믿는 σ 와 실제 σ', en: 'Theory and simulation: believed σ versus actual σ' }} testId="ch5-sweep-demo">
        <P ko="이번에는 세계가 필터의 모델과 **같은 꼴**로 움직인다고 합시다: 스텝마다 무작위 가속도(1σ = {{cfg:estimation.accelNoise}})가 걸립니다. 필터가 가정하는 $\sigma_a$ 만 실제의 1/30 배에서 30 배까지 바꿔 봅니다. 측정 노이즈, R 배율, 주기는 위 데모의 슬라이더 값을 그대로 씁니다."
          en="Now let the world move in the **same form** as the filter’s model: a random acceleration (1σ = {{cfg:estimation.accelNoise}}) at every step. Only the $\sigma_a$ assumed by the filter is varied from 1/30 to 30 times the true value. Measurement noise, R factor and rate are taken from the sliders of the demo above." />
        <LineChart
          title={{ ko: '가정한 가속도 노이즈에 따른 위치 오차 (세로축은 로그)', en: 'Position error versus assumed acceleration noise (log vertical axis)' }}
          xLabel={{ ko: 'log₁₀(가정한 σ_a ÷ 실제 σ_a)', en: 'log₁₀(assumed σ_a ÷ true σ_a)' }} yLabel={{ ko: '위치 오차 1σ [cm]', en: 'Position error 1σ [cm]' }} yLog height={280}
          series={[
            { name: { ko: '실제 오차 (이론)', en: 'Actual error (theory)' }, x: sweep.lx, y: sweep.act, slot: 1, dash: '', width: 2.4 },
            { name: { ko: '필터가 믿는 σ (이론)', en: 'σ the filter believes (theory)' }, x: sweep.lx, y: sweep.bel, slot: 3, dash: '2 3', link: 'pupd' },
            { name: { ko: '실제 오차 (시뮬레이션)', en: 'Actual error (simulation)' }, x: sweepSx, y: sweepSim.data, slot: 2, points: true, faint: sweepSim.pending },
          ]}
          refLines={[
            { x: clamp(Math.log10(sigA / aTrue), -1.5, 1.5), label: { ko: '지금 Q', en: 'Current Q' }, slot: 4 },
            { y: prm.sigZ * 100, label: { ko: '측정 그대로 (필터 없음)', en: 'Raw measurement (no filter)' } },
          ]}
          src={der('ch5#steady-state', { ko: '선: 필터 이득을 고정하고 오차 공분산의 고정점을 구한 이론값. 점: 같은 조건의 시뮬레이션(3000스텝) RMS.', en: 'Lines: theory from the fixed point of the error covariance with the filter gain held fixed. Dots: RMS of a simulation (3000 steps) under the same conditions.' })}
          testId="ch5-sweep-chart" />
        <Busy on={sweepSim.pending} />
        <Caption>{tr({ ko: '가로축 0 이 "가정 = 실제"입니다. −1 은 1/10 배, +1 은 10 배. "실제 오차 (이론)" 은 가정한 Q·R 로 구한 이득 K 를 고정해 두고, 참 Q·R 로 오차의 공분산을 더 변하지 않을 때까지 반복 계산한 값입니다(필터가 믿는 P 와 따로 계산합니다).', en: 'Zero on the horizontal axis means "assumed = true"; −1 is one tenth, +1 is ten times. "Actual error (theory)" fixes the gain K computed from the assumed Q and R and iterates the error covariance with the true Q and R until it stops changing (separately from the P the filter believes).' })}</Caption>
        <StatRow>
          <Stat label={{ ko: '지금 Q 에서 믿는 σ', en: 'Believed σ at the current Q' }} value={here.believed * 100} unit="cm" src={TH_SS} />
          <Stat label={{ ko: '지금 Q 에서 실제 σ', en: 'Actual σ at the current Q' }} value={here.actual * 100} unit="cm" src={TH_SS} status={here.actual > 1.3 * here.believed ? 'bad' : undefined} />
          <Stat label={{ ko: '기대 NIS', en: 'Expected NIS' }} value={here.nis} src={NIS} status={here.nis > 1.5 ? 'bad' : here.nis < 0.6 ? 'warn' : 'good'} />
        </StatRow>
        <List items={[
          { ko: '**가운데(0)**: 가정이 실제와 같으면 두 선이 만나고, 실제 오차가 가장 작습니다. 칼만 필터가 "최적"이라는 말은 이 점을 가리킵니다.', en: '**Centre (0)**: when the assumption matches reality the two lines meet and the actual error is smallest. This point is what "the Kalman filter is optimal" refers to.' },
          { ko: '**왼쪽(Q 가 너무 작음)**: 필터는 자신만만한데(믿는 σ 가 작음) 실제 오차는 측정을 그대로 쓰는 것보다도 커집니다. 가장 위험한 쪽입니다 — 띠가 좁아 보이는데 틀려 있습니다.', en: '**Left (Q too small)**: the filter is confident (small believed σ) while the actual error grows beyond even the raw measurement. This is the dangerous side — the band looks tight and is wrong.' },
          { ko: '**오른쪽(Q 가 너무 큼)**: 실제 오차가 측정 노이즈 쪽으로 올라갑니다. 틀리지는 않지만 필터를 쓰는 이득이 사라집니다.', en: '**Right (Q too large)**: the actual error climbs towards the measurement noise. Not wrong, but the benefit of filtering is gone.' },
        ]} />
      </Demo>
      <Derivation id="nis" title={{ ko: '필터가 스스로를 점검하는 숫자, NIS', en: 'NIS: the number a filter uses to check itself' }}>
        <P ko="**NIS**(normalized innovation squared, 정규화 혁신 제곱)는 혁신 $\nu$ 를 필터가 예상한 표준편차 $\sqrt S$ 로 나눠 제곱한 값입니다. 필터의 가정이 맞다면 혁신의 분산이 바로 $S$ 이므로, 분산의 정의($E[\nu^2] = S$)에서 곧바로 평균이 1 이 나옵니다. 참값을 몰라도 계산할 수 있어서 실제 비행 로그로 튜닝을 점검할 때 씁니다."
          en="The **NIS** (normalized innovation squared) is the innovation $\nu$ divided by the standard deviation $\sqrt S$ the filter expects, squared. If the filter's assumptions hold, the variance of the innovation is exactly $S$, so the definition of variance ($E[\nu^2] = S$) gives a mean of 1 directly. It needs no ground truth, so it is how tuning is checked on real flight logs." />
        <M block tex={String.raw`\mathrm{NIS}_k = \frac{\nu_k^2}{S_k},\qquad E[\mathrm{NIS}] = \frac{E[\nu^2]}{S} = 1,\qquad \overline{\mathrm{NIS}} = \frac1N\sum_{k=1}^{N}\mathrm{NIS}_k`} />
        <List items={[
          { ko: '**얼마나 벗어나야 문제인가.** 가정이 맞을 때 NIS 하나하나는 평균 1, 분산 2 인 값입니다(정규분포를 따르는 값의 제곱이므로. [통계 1분 복습](#/ch/0?a=stats)). $N$ 개를 평균하면 그 표준편차는 $\\sqrt{2/N}$ 로 줄어듭니다. 위 데모는 10 Hz 로 20초, 곧 200번 갱신하므로 약 0.1{{der:ch5#nis|√(2/200)|√(2/200)}} 입니다. 그래서 0.6–1.5{{ex}} 를 벗어나면 우연이 아니라 튜닝이 틀렸다고 봅니다. 측정 수가 적으면 이 폭을 넓혀야 합니다.', en: '**How far off is a problem.** With correct assumptions each NIS has mean 1 and variance 2 (it is the square of a normally distributed value; [one-minute statistics review](#/ch/0?a=stats)). Averaging $N$ of them shrinks the standard deviation to $\\sqrt{2/N}$. The demo above makes 200 updates (10 Hz for 20 s), giving about 0.1{{der:ch5#nis|√(2/200)|√(2/200)}}. Leaving 0.6–1.5{{ex}} is therefore not chance but mistuning. With fewer measurements the band must be wider.' },
          { ko: '**자유도.** 측정이 숫자 $m$ 개짜리 벡터이면(예: 위치 단위 융합의 위치 3개) $\\nu^{\\mathsf T}S^{-1}\\nu$ 의 평균은 1 이 아니라 $m$ 입니다. 성분 하나마다 1 씩 더해지기 때문이고, 이 $m$ 을 **자유도**(degrees of freedom)라고 합니다. 그래서 아래 융합 데모는 위치 단위 방식의 NIS 를 3 으로 나눠 스칼라와 같은 눈금으로 보여 줍니다.', en: '**Degrees of freedom.** If the measurement is a vector of $m$ numbers (say the 3 coordinates of a position-level fix), $\\nu^{\\mathsf T}S^{-1}\\nu$ averages $m$, not 1, because each component adds 1; $m$ is the number of **degrees of freedom**. The fusion demo below therefore divides the position-level NIS by 3 to put it on the scalar scale.' },
        ]} />
        <P ko="**무엇이 틀렸는가.** 평균 NIS 만으로는 Q 와 R 중 어느 쪽이 틀렸는지 알 수 없습니다. 증상을 함께 봅니다. (위 데모의 R 슬라이더와 Q 버튼으로 네 경우를 모두 만들어 볼 수 있습니다.)"
          en="**What is wrong.** The mean NIS alone does not tell whether Q or R is wrong; look at the symptoms too. (The R slider and Q buttons of the demo above produce all four cases.)" />
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '잘못 잡은 것', en: 'Mistake' })}</th><th>{tr({ ko: '추정의 모습', en: 'What the estimate looks like' })}</th><th>{tr({ ko: '평균 NIS', en: 'Mean NIS' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: 'Q 너무 작음', en: 'Q too small' })}</b></td><td><T ko="매끈하지만 출발·정지 때 **뒤처짐**. 혁신이 기동하는 동안 한쪽 부호로 몰린다" en="smooth but **lags** at starts and stops; innovations keep one sign during a manoeuvre" /></td><td>{'> 1'}</td></tr>
              <tr><td><b>{tr({ ko: 'Q 너무 큼', en: 'Q too large' })}</b></td><td><T ko="측정의 **노이즈를 따라감**. 띠가 넓다" en="**follows the noise** of the measurements; wide band" /></td><td>{'< 1'}</td></tr>
              <tr><td><b>{tr({ ko: 'R 너무 작음', en: 'R too small' })}</b></td><td><T ko="**노이즈를 따라가면서** 띠는 좁다(과신). 혁신의 부호는 매번 무작위" en="**follows the noise** while the band is narrow (over-confident); innovation signs are random" /></td><td>{'> 1'}</td></tr>
              <tr><td><b>{tr({ ko: 'R 너무 큼', en: 'R too large' })}</b></td><td><T ko="매끈하지만 **뒤처짐**, 띠가 넓다(과소신뢰)" en="smooth but **lags**, wide band (under-confident)" /></td><td>{'< 1'}</td></tr>
            </tbody>
          </table>
        </div>
        <P ko="**행동 지침.** 평균 NIS 가 1 보다 크면 먼저 제자리 비행(가속이 거의 없는) 구간만 따로 봅니다. 거기서도 크면 R 이 작거나 NLOS 가 섞인 것이므로 R 을 키우거나 게이트(4장)를 점검합니다. 제자리에서는 1 근처인데 기동 중에만 크면 Q 를 키웁니다. 1 보다 훨씬 작으면 반대로 줄입니다."
          en="**What to do.** If the mean NIS is above 1, first look at hovering segments alone (almost no acceleration). If it is large there too, R is too small or NLOS is leaking in: raise R or check the gate (ch. 4). If it is near 1 at hover and large only while manoeuvring, raise Q. Well below 1, lower them." />
      </Derivation>
    </LinkGroup>
  );
}

/* ───────────────────────── 정상상태와 오차 예산 ───────────────────────── */
const STEADY_PR = [2, 5, 10, 20, 50, 100];
function SteadyPanel() {
  const cfg = config.value, b = budget.value;
  const aN = cfg.estimation.accelNoise;
  // 이론 곡선은 바로 갱신하고, 시뮬레이션 RMS 점(3000스텝 × 6)은 입력이 멈춘 뒤 한 점씩 나눠 계산한다.
  const curve = useMemo(() => {
    const rates = [1, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return { rates, th: rates.map((r) => steadyStatePosSigma(b.sigmaPosH, r, aN) * 100) };
  }, [b.sigmaPosH, aN]);
  const simIn = { s: b.sigmaPosH, a: aN };
  const sim = useChunked(JSON.stringify(simIn), STEADY_PR.length, (i) => {
    const r = STEADY_PR[i];
    return simulateKf1d({ rate: r, T: 3000 / r, sigmaZTrue: simIn.s, sigmaZFilter: simIn.s, sigmaAFilter: simIn.a, truth: 'random', sigmaATrue: simIn.a, seed: 21 + i }).rmse * 100;
  }, 300);
  return (
    <Demo title={{ ko: '우리 시스템의 값 넣기: UWB 위치 오차가 융합 뒤에 얼마나 줄어드나', en: 'Plugging in our system: how much fusion shrinks the UWB position error' }} testId="ch5-steady-demo">
      <P ko="아래 슬라이더는 전역 설정입니다. 여기서 바꾸면 오차 예산과 다른 장의 데모가 함께 바뀝니다."
        en="The slider below is a global setting: changing it here also changes the error budget and the demos in other chapters." />
      <div class="controls">
        <CfgSlider path="estimation.accelNoise" max={5} />
      </div>
      <StatRow>
        <Stat label={{ ko: '위치 갱신율 $f_{\\text{pos}}$', en: 'Position update rate $f_{\\text{pos}}$' }} value={b.posRate} unit="Hz" src={der('ch3#rate', { ko: '3장의 갱신율 모델에 현재 설정을 넣은 값', en: 'The update-rate model of chapter 3 with the current settings' })} />
        <Stat label={{ ko: 'UWB 만: 수평 / 수직 σ', en: 'UWB only: horizontal / vertical σ' }} value={`${fmt(b.sigmaPosH * 100, 3)} / ${fmt(b.sigmaPosV * 100, 3)}`} unit="cm" src={der('ch4#sigma-eff', { ko: 'DOP(2장) × 게이팅 뒤 유효 거리 오차(4장)', en: 'DOP (ch. 2) × effective range error after gating (ch. 4)' })} />
        <Stat label={{ ko: '융합 뒤: 수평 / 수직 σ', en: 'After fusion: horizontal / vertical σ' }} value={`${fmt(b.sigmaEstH * 100, 3)} / ${fmt(b.sigmaEstV * 100, 3)}`} unit="cm" src={TH_SS} />
        <Stat label={{ ko: '줄어든 비율 (수평)', en: 'Reduction (horizontal)' }} value={b.sigmaPosH / b.sigmaEstH} unit="×" src={TH_SS} />
      </StatRow>
      <LineChart
        title={{ ko: '갱신율에 따른 융합 뒤 수평 σ', en: 'Horizontal σ after fusion versus update rate' }} xLabel={{ ko: '위치 갱신율 [Hz]', en: 'Position update rate [Hz]' }} yLabel={{ ko: '위치 추정 오차 1σ [cm]', en: 'Position estimate error 1σ [cm]' }} height={240}
        series={[
          { name: { ko: '이론: 정상상태 식', en: 'Theory: steady-state formula' }, x: curve.rates, y: curve.th, slot: 1, dash: '' },
          { name: { ko: '시뮬레이션 RMS', en: 'Simulation RMS' }, x: STEADY_PR, y: sim.data, slot: 2, points: true, faint: sim.pending },
        ]}
        refLines={[
          { x: Math.min(100, b.posRate), label: { ko: `지금 갱신율 ${fmt(b.posRate, 3)} Hz`, en: `Current rate ${fmt(b.posRate, 3)} Hz` }, slot: 4 },
          { y: b.sigmaPosH * 100, label: { ko: 'UWB 만 (필터 없음)', en: 'UWB only (no filter)' } },
        ]}
        yDomain={[0, b.sigmaPosH * 140]} src={der('ch5#steady-state', { ko: '선: 리카티 고정점. 점: 모델과 같은 꼴의 무작위 가속으로 3000스텝 시뮬레이션한 RMS. 입력은 현재 설정의 σ_pos 와 σ_a.', en: 'Line: Riccati fixed point. Dots: RMS of a 3000-step simulation with random accelerations of the model’s form. Inputs: σ_pos and σ_a of the current settings.' })}
        testId="ch5-steady-chart" />
      <Busy on={sim.pending} />
      <Caption>{tr({ ko: '갱신율이 높을수록 같은 시간에 더 많은 측정을 평균하므로 σ 가 줄어듭니다. 5대를 TWR 로 띄워 드론당 갱신율이 떨어지면(3장) 이 곡선의 왼쪽으로 밀려납니다.', en: 'A higher rate averages more measurements in the same time, so σ drops. Flying five drones on TWR lowers the per-drone rate (ch. 3) and pushes you to the left of this curve.' })}</Caption>
    </Demo>
  );
}

/* ───────────────────────── 데모 2: UWB + IMU 융합 (tight / loose) ───────────────────────── */
const T_FUS = 40, SPEED = 0.5, MAG = 10;

function ZoomInset({ res, idx, fixes, W }: { res: FusionResult; idx: number; fixes: { t: number; p: Vec }[]; W: number }) {
  const S = 280, k = S / (2 * W);
  const c = res.truth[idx], est = res.est[idx], tNow = res.t[idx];
  const sx = (x: number) => S / 2 + (x - c[0]) * k, sy = (y: number) => S / 2 - (y - c[1]) * k;
  const i0 = Math.max(0, idx - 150);
  const seg = (pts: Vec[]) => pts.slice(i0, idx + 1).map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const e = covEllipse(res.pXY[idx][0], res.pXY[idx][1], res.pXY[idx][2]);
  const recent = fixes.filter((f) => f.t <= tNow + 1e-9 && f.t > tNow - 3);
  const bar = W / 2.5;
  const rot = `translate(${sx(est[0]).toFixed(1)} ${sy(est[1]).toFixed(1)}) rotate(${((-e.angle * 180) / Math.PI).toFixed(2)})`;
  return (
    <div class="plot">
      <div class="plot-title">{tr({ ko: '지금 위치 주변을 확대', en: 'Zoom around the current position' })}</div>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ maxWidth: '340px', background: 'var(--surface-2)', borderRadius: '8px' }} role="img"
        aria-label={tr({ ko: `확대 그림: 한 변 ${fmt(2 * W * 100)} cm. 참 위치를 가운데에 두고 추정 위치와 1σ·2σ 공분산 타원을 그렸습니다.`, en: `Zoomed view, ${fmt(2 * W * 100)} cm across, centred on the true position, with the estimate and its 1σ and 2σ covariance ellipses.` })}>
        <defs><clipPath id="ch5-zoom-clip"><rect x="0" y="0" width={S} height={S} rx="8" /></clipPath></defs>
        <g clip-path="url(#ch5-zoom-clip)">
          {recent.map((f, i) => <rect key={i} x={sx(f.p[0]) - 2.5} y={sy(f.p[1]) - 2.5} width="5" height="5" fill="none" stroke={seriesColor(4)} stroke-width="1.3" opacity="0.8" />)}
          <path d={seg(res.truth)} fill="none" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="7 4" />
          <path d={seg(res.est)} fill="none" stroke={seriesColor(1)} stroke-width="2" />
          <g transform={rot}>
            <ellipse rx={2 * e.a * k} ry={2 * e.b * k} fill={seriesColor(1)} fill-opacity="0.08" stroke={seriesColor(1)} stroke-width="1.3" stroke-dasharray="4 3" />
            <ellipse rx={e.a * k} ry={e.b * k} fill={seriesColor(1)} fill-opacity="0.14" stroke={seriesColor(1)} stroke-width="1.6" />
          </g>
          <circle cx={sx(est[0])} cy={sy(est[1])} r="4" fill={seriesColor(1)} stroke="var(--surface)" stroke-width="1.5" />
          <line x1={S / 2 - 8} x2={S / 2 + 8} y1={S / 2} y2={S / 2} stroke="var(--text)" stroke-width="2" />
          <line x1={S / 2} x2={S / 2} y1={S / 2 - 8} y2={S / 2 + 8} stroke="var(--text)" stroke-width="2" />
        </g>
        <line x1="14" x2={14 + bar * k} y1={S - 16} y2={S - 16} stroke="var(--text)" stroke-width="2" />
        <text class="ref-label" x="14" y={S - 22}>{fmt(bar * 100)} cm</text>
      </svg>
    </div>
  );
}

function FusionDemo() {
  const cfg = config.value, b = budget.value;
  const [coupling, setCoupling] = useState<'tight' | 'loose'>('tight');
  const [qMult, setQMult] = useState(1);
  const [rMult, setRMult] = useState(1);
  const [rate, setRate] = useState(() => clamp(Math.round(b.posRate / 2.5) * 2.5, 5, 100));
  const [pNlos, setPNlos] = useState(cfg.uwb.pNlos);
  const [gate, setGate] = useState(cfg.uwb.gateSigma);
  const [seed, setSeed] = useState(1);
  const [tNow, setTNow] = useState(12);
  const [playing, setPlaying] = useState(false);
  const prm = useDebounced({ qMult, rMult, rate, pNlos, gate, seed }, 250);
  const base: FusionParams = useMemo(() => ({
    anchors: cfg.anchors, hall: cfg.hall, height: cfg.formation.height, uwbMode: cfg.uwb.mode, coupling: 'tight',
    nlos: { sigma: b.sigmaMeas, pNlos: prm.pNlos, biasMean: cfg.uwb.nlosBiasMean },
    uwbRate: prm.rate, imuRate: 100, accelNoiseTrue: cfg.estimation.accelNoise, accelNoiseFilter: cfg.estimation.accelNoise * prm.qMult,
    measSigmaFilter: b.sigmaMeas * prm.rMult, gateK: prm.gate, robust: false, speed: SPEED, T: T_FUS, seed: prm.seed,
  }), [cfg, prm]);
  // 두 방식(tight, loose)의 40초 시뮬레이션을 한 덩어리로 돌리지 않고 하나씩 나눠 돌린다(그동안 이전 결과를 흐리게 보여 줌).
  const fus = useChunked(JSON.stringify(base), 2, (i) => simulateFusion({ ...base, coupling: i === 0 ? 'tight' : 'loose' }));
  const runs = useMemo(() => {
    const [tight, loose] = fus.data;
    const errH = (r: FusionResult) => r.est.map((e, i) => Math.hypot(e[0] - r.truth[i][0], e[1] - r.truth[i][1]) * 100);
    const traj = lissajous(base.hall, base.height, SPEED);
    let s2 = 0;
    for (const f of loose.fixes) { const p = traj.pos(f.t); s2 += (f.p[0] - p[0]) ** 2 + (f.p[1] - p[1]) ** 2; }
    return { tight, loose, errTight: errH(tight), errLoose: errH(loose), fixRmsH: loose.fixes.length ? Math.sqrt(s2 / loose.fixes.length) : NaN };
  }, [fus.data]);
  const busy = fus.pending || JSON.stringify(prm) !== JSON.stringify({ qMult, rMult, rate, pNlos, gate, seed });
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTNow((t) => (t + 0.2 > T_FUS ? 0.2 : Math.round((t + 0.2) * 10) / 10)), 80);
    return () => clearInterval(id);
  }, [playing]);
  const cur = runs[coupling], other = runs[coupling === 'tight' ? 'loose' : 'tight'];
  const idx = clamp(Math.round(tNow / 0.02) - 1, 0, cur.t.length - 1);
  const ell = covEllipse(cur.pXY[idx][0], cur.pXY[idx][1], cur.pXY[idx][2]);
  const W = useMemo(() => {
    const mid = cur.pXY[Math.floor(cur.pXY.length / 2)];
    const need = Math.max(5 * covEllipse(mid[0], mid[1], mid[2]).a, 3 * cur.rmseH, 0.1);
    return [0.125, 0.25, 0.5, 1, 2, 4].find((w) => w >= need) ?? 4;
  }, [cur]);
  const rejPct = cur.total ? (100 * cur.rejected) / cur.total : 0;
  const modeName = cfg.uwb.mode === 'twr' ? 'TWR' : 'TDoA';
  const measEvery = Math.max(1, Math.round(100 / prm.rate)), effRate = 100 / measEvery;
  const thDemo = useMemo(() => Math.hypot(fusedSteadySigma(b.dop.xdop * b.sigmaMeas, 100, measEvery, cfg.estimation.accelNoise), fusedSteadySigma(b.dop.ydop * b.sigmaMeas, 100, measEvery, cfg.estimation.accelNoise)), [b.dop.xdop, b.dop.ydop, b.sigmaMeas, measEvery, cfg.estimation.accelNoise]);
  const nisStatus = !Number.isFinite(cur.meanNis) ? undefined : cur.meanNis > 1.5 ? 'bad' : cur.meanNis < 0.6 ? 'warn' : 'good';
  return (
    <>
      <Demo title={{ ko: 'UWB + IMU 융합: 추정 궤적과 공분산 타원', en: 'UWB + IMU fusion: estimated path and covariance ellipse' }} testId="ch5-fusion-demo">
        <P ko={`드론 한 대가 고도 {{cfg:formation.height}} 에서 강당 안을 8자 모양으로 돕니다(3차원 시뮬레이션을 위에서 본 그림). 필터는 가속도계 값으로 100 Hz 마다 예측하고(펌웨어 소스의 칼만 예측 주기{{lit:cf-firmware-docs/kalman-predict-rate}}와 같은 값으로 맞춘 이 모델의 주기), ${modeName} 측정이 올 때마다 고칩니다. 가속도계 입력의 오차는 설정의 가속도 노이즈 {{cfg:estimation.accelNoise}} 를 빌려 씁니다(센서 사양이 아닙니다. 아래 노트 참고). 실제 ${modeName} 노이즈는 ${fmt(b.sigmaMeas * 100, 3)} cm{{ex:${cfg.uwb.mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'}}} 입니다. **Q·R 배율은 필터가 가정하는 값만 바꿉니다**(세계는 그대로). **공분산 타원**은 $P$ 의 x–y 부분(2×2)을 그린 것으로, 필터가 '참 위치가 이 안에 있을 것'이라고 믿는 영역입니다. 타원이 작은데 ＋(참 위치)가 자꾸 밖에 있으면 과신입니다.`}
          en={`One drone flies a figure-of-eight inside the hall at a height of {{cfg:formation.height}} (a 3-D simulation seen from above). The filter predicts at 100 Hz from the accelerometer (this model's period, set equal to the Kalman prediction rate in the firmware source{{lit:cf-firmware-docs/kalman-predict-rate}}) and corrects whenever a ${modeName} measurement arrives. The accelerometer input error borrows the acceleration-noise setting {{cfg:estimation.accelNoise}} (not a sensor specification; see the note below). The true ${modeName} noise is ${fmt(b.sigmaMeas * 100, 3)} cm{{ex:${cfg.uwb.mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'}}}. **The Q and R factors change only what the filter assumes** (the world stays the same). The **covariance ellipse** draws the x–y part (2×2) of $P$: the region where the filter believes the true position lies. A small ellipse with the ＋ (true position) often outside it means over-confidence.`} />
        <div class="btn-row" style={{ alignItems: 'flex-start', gap: '4px 20px' }}>
          <Segmented label={{ ko: '융합 방식', en: 'Coupling' }} value={coupling} onChange={setCoupling} testId="ch5-coupling" options={[
            { value: 'tight', label: { ko: '거리 단위 (tight)', en: 'Range level (tight)' } },
            { value: 'loose', label: { ko: '위치 단위 (loose)', en: 'Position level (loose)' } },
          ]} />
          <Segmented label={{ ko: 'UWB 모드 (전역 설정)', en: 'UWB mode (global setting)' }} value={cfg.uwb.mode} onChange={(v) => setPath('uwb.mode', v)} testId="ch5-uwb-mode" options={[
            { value: 'tdoa', label: 'TDoA' }, { value: 'twr', label: 'TWR' },
          ]} />
        </div>
        <div class="controls">
          <Slider label={{ ko: 'Q 배율: 가정한 $\\sigma_a$ ÷ 실제 $\\sigma_a$ (Q 는 그 제곱)', en: 'Q factor: assumed $\\sigma_a$ ÷ true $\\sigma_a$ (Q is its square)' }} value={qMult} min={0.1} max={10} step={0.1} unit="×" onChange={setQMult} src={ex(undefined, LOCAL)} testId="ch5-fus-q" />
          <Slider label={{ ko: 'R 배율: 가정한 $\\sigma$ ÷ 실제 $\\sigma$ (R 은 그 제곱)', en: 'R factor: assumed $\\sigma$ ÷ true $\\sigma$ (R is its square)' }} value={rMult} min={0.2} max={5} step={0.1} unit="×" onChange={setRMult} src={ex(undefined, LOCAL)} testId="ch5-fus-r" />
          <Slider label={{ ko: 'UWB 갱신율 (한 바퀴)', en: 'UWB update rate (one round)' }} value={rate} min={5} max={100} step={2.5} unit="Hz" onChange={setRate}
            src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 처음 값은 3장의 모델로 계산한 지금 설정의 갱신율입니다.', en: 'Local to this demo; starts from the update rate of the current settings (model of ch. 3).' })} testId="ch5-fus-rate" />
          <p class="small muted" style={{ margin: 0 }}>{tr({ ko: `이 시뮬레이션은 100 Hz 예측 ${measEvery}스텝마다 한 번 갱신하므로 실제로 쓰는 갱신율은 ${fmt(effRate, 3)} Hz 입니다.`, en: `This simulation updates once every ${measEvery} prediction step(s) at 100 Hz, so the rate actually used is ${fmt(effRate, 3)} Hz.` })}<SrcBadge src={der('ch5#tight-loose', { ko: '100 Hz ÷ round(100 Hz ÷ 슬라이더 값)', en: '100 Hz ÷ round(100 Hz ÷ slider value)' })} /></p>
          <Slider label={{ ko: 'NLOS 확률', en: 'NLOS probability' }} value={pNlos} min={0} max={0.5} step={0.01} scale={100} unit="%" onChange={setPNlos}
            src={ex('uwb.pNlos', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} testId="ch5-fus-nlos" />
          <Slider label={{ ko: '게이트 문턱 (0 = 끔)', en: 'Gate threshold (0 = off)' }} value={gate} min={0} max={6} step={0.5} unit="σ" onChange={setGate}
            src={ex('uwb.gateSigma', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' })} testId="ch5-fus-gate" />
        </div>
        <div class="btn-row" style={{ marginBottom: '10px' }}>
          <Button onClick={() => { setPNlos(0.3); setGate(3); }} testId="ch5-fus-preset-nlos">{tr({ ko: 'NLOS 를 30% 로 (게이트 3σ)', en: 'NLOS to 30% (gate 3σ)' })}</Button>
          <SrcBadge src={ex(undefined, { ko: '차이를 보여 주려고 고른 값입니다. 위 슬라이더로 바꿀 수 있습니다.', en: 'Values chosen to show the difference; change them with the sliders above.' })} />
          <Button onClick={() => { setPNlos(0); setQMult(1); setRMult(1); }} testId="ch5-fus-preset-clean">{tr({ ko: '깨끗한 측정 + 맞는 Q·R', en: 'Clean measurements + matched Q, R' })}</Button>
          <Button onClick={() => { setPNlos(cfg.uwb.pNlos); setGate(cfg.uwb.gateSigma); setQMult(1); setRMult(1); }}>{tr({ ko: '설정값으로 되돌리기', en: 'Back to settings' })}</Button>
          <Button onClick={() => setSeed(seed + 1)}>{tr({ ko: '다른 노이즈로 다시', en: 'Different noise' })}</Button>
        </div>
        <Busy on={busy} what={{ ko: '⏳ 두 방식을 새 값으로 다시 시뮬레이션하는 중… (그림과 숫자는 잠시 이전 값)', en: '⏳ Re-simulating both couplings with the new values… (pictures and numbers show the previous values for a moment)' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{ flex: '2 1 340px', minWidth: 0 }}>
            <PlanView hall={cfg.hall} anchors={cfg.anchors} maxHeight={380} testId="ch5-fusion-plan">
              {(s) => {
                const line = (pts: Vec[], n: number, step: number) => {
                  let d = '';
                  for (let i = 0; i < n; i += step) d += `${d ? 'L' : 'M'}${s.sx(pts[i][0]).toFixed(1)},${s.sy(pts[i][1]).toFixed(1)}`;
                  return d;
                };
                const est = cur.est[idx], tr0 = cur.truth[idx], tt = cur.t[idx];
                const recent = runs.loose.fixes.filter((f) => f.t <= tt + 1e-9 && f.t > tt - 2);
                return (
                  <g pointer-events="none">
                    <path d={line(cur.truth, cur.truth.length, 5)} fill="none" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="7 4" opacity="0.8" />
                    <path d={line(cur.est, idx + 1, 3)} fill="none" stroke={seriesColor(1)} stroke-width="2.2" />
                    {recent.map((f, i) => <rect key={i} x={s.sx(f.p[0]) - 2} y={s.sy(f.p[1]) - 2} width="4" height="4" fill="none" stroke={seriesColor(4)} stroke-width="1.2" />)}
                    <g transform={`translate(${s.sx(est[0]).toFixed(1)} ${s.sy(est[1]).toFixed(1)}) rotate(${((-ell.angle * 180) / Math.PI).toFixed(2)})`}>
                      <ellipse rx={2 * ell.a * s.k * MAG} ry={2 * ell.b * s.k * MAG} fill={seriesColor(1)} fill-opacity="0.1" stroke={seriesColor(1)} stroke-width="1.3" stroke-dasharray="4 3" />
                      <ellipse rx={ell.a * s.k * MAG} ry={ell.b * s.k * MAG} fill={seriesColor(1)} fill-opacity="0.16" stroke={seriesColor(1)} stroke-width="1.5" />
                    </g>
                    <line x1={s.sx(tr0[0]) - 7} x2={s.sx(tr0[0]) + 7} y1={s.sy(tr0[1])} y2={s.sy(tr0[1])} stroke="var(--text)" stroke-width="2" />
                    <line x1={s.sx(tr0[0])} x2={s.sx(tr0[0])} y1={s.sy(tr0[1]) - 7} y2={s.sy(tr0[1]) + 7} stroke="var(--text)" stroke-width="2" />
                    <circle cx={s.sx(est[0])} cy={s.sy(est[1])} r="3.5" fill={seriesColor(1)} stroke="var(--surface)" stroke-width="1.5" />
                    <text class="ref-label" x={s.sx(est[0]) + (est[0] > cfg.hall.x / 2 ? -12 : 12)} y={s.sy(est[1]) - 12} text-anchor={est[0] > cfg.hall.x / 2 ? 'end' : 'start'}>{tr({ ko: `타원은 ${MAG}배 확대`, en: `ellipse drawn ×${MAG}` })}</text>
                  </g>
                );
              }}
            </PlanView>
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '360px' }}>
            <ZoomInset res={cur} idx={idx} fixes={runs.loose.fixes} W={W} />
          </div>
        </div>
        <div class="legend">
          <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="7 4" /></svg>{tr({ ko: '참 경로 (＋ 는 지금 참 위치)', en: 'True path (＋ marks the true position now)' })}</span>
          <span class="item"><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke={seriesColor(1)} stroke-width="2.2" /><circle cx="14" cy="5" r="3.5" fill={seriesColor(1)} /></svg>{tr({ ko: '추정 경로 (● 는 지금 추정)', en: 'Estimated path (● marks the estimate now)' })}</span>
          <span class="item"><svg width="14" height="10" aria-hidden="true"><rect x="4" y="2" width="6" height="6" fill="none" stroke={seriesColor(4)} stroke-width="1.3" /></svg>{tr({ ko: 'UWB 만으로 푼 위치 (최근 것)', en: 'UWB-only position fixes (recent)' })}</span>
          <span class="item"><svg width="28" height="12" aria-hidden="true"><ellipse cx="14" cy="6" rx="12" ry="5" fill="none" stroke={seriesColor(1)} stroke-width="1.3" stroke-dasharray="4 3" /><ellipse cx="14" cy="6" rx="6" ry="2.5" fill="none" stroke={seriesColor(1)} stroke-width="1.5" /></svg>{tr({ ko: '공분산 타원: 실선 1σ, 점선 2σ', en: 'Covariance ellipse: solid 1σ, dashed 2σ' })}</span>
          <SrcBadge src={SIM_FUS} />
        </div>
        <div class="btn-row">
          <Button onClick={() => setPlaying(!playing)} testId="ch5-fus-play">{playing ? tr({ ko: '■ 멈춤', en: '■ Pause' }) : tr({ ko: '▶ 재생', en: '▶ Play' })}</Button>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <Slider label={{ ko: '보고 있는 시각', en: 'Time shown' }} value={tNow} min={0.2} max={T_FUS} step={0.2} unit="s" onChange={(v) => { setPlaying(false); setTNow(v); }} src={ex(undefined, { ko: '그림에 표시할 시각을 고릅니다', en: 'Chooses the instant shown in the pictures' })} testId="ch5-fus-time" />
          </div>
        </div>
        <StatRow>
          <Stat label={{ ko: `수평 RMSE (${coupling})`, en: `Horizontal RMSE (${coupling})` }} value={cur.rmseH * 100} unit="cm" src={SIM_FUS} />
          <Stat label={{ ko: `수직 RMSE (${coupling})`, en: `Vertical RMSE (${coupling})` }} value={cur.rmseV * 100} unit="cm" src={SIM_FUS} />
          <Stat label={{ ko: '평균 NIS', en: 'Mean NIS' }} value={cur.meanNis} src={NIS} status={nisStatus} />
          <Stat label={{ ko: '게이트가 버린 측정', en: 'Measurements gated out' }} value={rejPct} unit="%" src={SIM_FUS} />
        </StatRow>
        <StatRow>
          <Stat label={{ ko: `같은 측정, 다른 방식 (${coupling === 'tight' ? 'loose' : 'tight'}): 수평 RMSE`, en: `Same measurements, other coupling (${coupling === 'tight' ? 'loose' : 'tight'}): horizontal RMSE` }} value={other.rmseH * 100} unit="cm" src={SIM_FUS} status={other.rmseH > 1.2 * cur.rmseH ? 'warn' : undefined} />
          <Stat label={{ ko: 'UWB 만으로 푼 위치: 수평 RMS', en: 'UWB-only fixes: horizontal RMS' }} value={runs.fixRmsH * 100} unit="cm" src={SIM_FUS} />
          <Stat label={{ ko: `이론: 이 데모의 갱신율 ${fmt(effRate, 3)} Hz, NLOS 없음`, en: `Theory: this demo at ${fmt(effRate, 3)} Hz, no NLOS` }} value={thDemo * 100} unit="cm" src={der('ch5#steady-state', { ko: '정상상태 식을 축마다(x 는 XDOP, y 는 YDOP × 측정 노이즈) 100 Hz 예측·위 갱신율로 계산해 합친 값. 한 주기 평균', en: 'The steady-state formula per axis (x with XDOP, y with YDOP × measurement noise) at 100 Hz prediction and the update rate above, combined; averaged over one cycle' })} />
          <Stat label={{ ko: '이론: 예산의 $\\sigma_{\\text{est}}$ 수평', en: 'Theory: budget $\\sigma_{\\text{est}}$, horizontal' }} value={b.sigmaEstH * 100} unit="cm" src={TH_SS} />
        </StatRow>
        <LineChart
          title={{ ko: '수평 추정 오차: 두 방식을 같은 측정으로 비교', en: 'Horizontal estimate error: both couplings on the same measurements' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '수평 오차 [cm]', en: 'Horizontal error [cm]' }} height={220}
          series={[
            { name: { ko: '거리 단위 (tight)', en: 'Range level (tight)' }, x: runs.tight.t, y: runs.errTight, slot: 1, dash: '', faint: coupling !== 'tight' },
            { name: { ko: '위치 단위 (loose)', en: 'Position level (loose)' }, x: runs.loose.t, y: runs.errLoose, slot: 2, dash: '7 4', faint: coupling !== 'loose' },
            { name: { ko: '이론 σ_est (백색 노이즈 가정)', en: 'Theory σ_est (white-noise assumption)' }, x: [0, T_FUS], y: [b.sigmaEstH * 100, b.sigmaEstH * 100], slot: 3, dash: '6 3', width: 2.4 },
          ]}
          refLines={[
            { x: tNow, label: { ko: '보고 있는 시각', en: 'Time shown' }, slot: 4 },
          ]}
          src={SIM_FUS} testId="ch5-fusion-err-chart" />
        <P ko="**읽는 법.** ① NLOS 를 0 으로, Q·R 배율을 1 로 두면 평균 NIS 가 1 근처이고 수평 RMSE 가 '이 데모의 갱신율' 이론값과 비슷합니다(이론은 강당 한가운데의 DOP 를 쓰고 측정 모델을 직선으로 본 값이라 조금 다릅니다). 예산의 값은 3장 모델의 갱신율로 계산하므로 이 데모의 실제 갱신율과 다를 수 있습니다. ② Q 배율을 0.1 로 낮추면 타원이 작아지지만 실제 오차는 줄지 않습니다 — 과신입니다. ③ NLOS 확률을 올리면 평균 NIS 가 1 을 넘습니다. 필터가 가정한 R 보다 실제 측정이 나쁘다는 신호입니다. 기본 설정에서 이미 1 을 넘는 것도 NLOS {{cfg:uwb.pNlos}} 때문입니다. 대응은 위 NIS 카드의 행동 지침대로(R 을 키우거나 게이트 점검)입니다. ④ 'UWB 만으로 푼 위치' 의 RMS 가 예산의 UWB 만 σ 보다 큰 것은 이 풀이에 게이트가 없어 NLOS 가 섞인 바퀴가 그대로 들어가기 때문입니다. NLOS 를 0 으로 하면 거의 같아집니다."
          en="**How to read it.** ① With NLOS at 0 and both factors at 1, the mean NIS is close to 1 and the horizontal RMSE is near the 'this demo' theory (which uses the DOP at the hall centre and a linearised measurement model, hence a small difference). The budget value uses the update rate of the ch. 3 model, which may differ from the rate this demo actually uses. ② Lower the Q factor to 0.1: the ellipse shrinks but the real error does not — over-confidence. ③ Raise the NLOS probability and the mean NIS rises above 1: the measurements are worse than the R the filter assumes. It is already above 1 in the default settings because of the NLOS rate {{cfg:uwb.pNlos}}; the remedy follows the NIS card above (raise R or check the gate). ④ The 'UWB-only fixes' RMS exceeds the budget's UWB-only σ because these fixes have no gate, so rounds contaminated by NLOS go straight in. With NLOS at 0 the two nearly agree." />
        <Caption>{tr({ ko: '평균 NIS 는 거리 단위 방식에서는 게이트가 버린 측정까지 포함해 계산하고, 위치 단위 방식에서는 받아들인 위치만으로 계산합니다(자유도 3 으로 나눈 값). 그래서 두 방식의 NIS 를 직접 비교하지는 마세요. 또 같은 게이트 숫자 k 라도 엄격함이 같지 않습니다. 위치 단위 게이트는 3 으로 나눈 그 NIS 를 k² 와 비교하므로 거리 단위 게이트보다 훨씬 느슨합니다.', en: 'For range-level fusion the mean NIS includes the measurements the gate rejected; for position-level fusion it covers accepted fixes only (divided by its 3 degrees of freedom). Do not compare the two NIS values directly. Also, the same gate number k is not equally strict: the position-level gate is applied to that NIS divided by 3, against k², which makes it far more permissive than the range-level gate.' })}</Caption>
      </Demo>
      <McPanel
        title={{ ko: '같은 튜닝으로 여러 번 날리면: 수평 RMSE 의 분포', en: 'Many flights with the same tuning: distribution of the horizontal RMSE' }}
        experiment="fusion" metric="rmseH" testId="ch5-mc" defaultRuns={100}
        params={{ ...base, coupling, T: 20 }}
        xLabel={{ ko: '한 번의 비행(20 s)의 수평 RMSE [m]', en: 'Horizontal RMSE of one flight (20 s) [m]' }}
        refLines={[{ x: b.sigmaEstH, label: { ko: '이론 σ_est', en: 'Theory σ_est' }, slot: 3 }]}
        src={SIM_FUS}
        note={{ ko: '위 데모의 지금 설정(융합 방식, Q·R 배율, 갱신율, NLOS, 게이트)으로 시드만 바꿔 반복합니다. 비행 길이 20 s{{ex}} 는 이 실험용 값입니다.', en: 'Repeats the current setup of the demo above (coupling, Q and R factors, rate, NLOS, gate) with different seeds. The 20 s{{ex}} flight length is specific to this experiment.' }} />
    </>
  );
}

/* ───────────────────────── 함정 실험실: 수신 시각으로 타임스탬프 찍기 ───────────────────────── */
function DelayPitfall() {
  const cfg = config.value, b = budget.value;
  const [v, setV] = useState(() => clamp(cfg.vehicle.vMax, 0.1, 3));
  const [tauMs, setTauMs] = useState(100);
  const [seed, setSeed] = useState(1);
  const prm = useDebounced({ v, tauMs, seed }, 120);
  const sim = useMemo(() => simulateDelayed1d({ v: prm.v, tau: prm.tauMs / 1000, dt: 0.01, measEvery: 5, T: 20, sigmaZ: b.sigmaPosH, sigmaA: cfg.estimation.accelNoise, seed: prm.seed }), [prm, b.sigmaPosH, cfg.estimation.accelNoise]);
  const cm = (a: number[]) => a.map((x) => x * 100);
  const bias = prm.v * prm.tauMs / 10; // cm
  return (
    <Pitfall title={{ ko: '수신 시각으로 타임스탬프 찍기', en: 'Stamping measurements with their time of reception' }} testId="ch5-pitfall">
      <P ko="표적이 한 축 위를 속도 $v$ 로 가다가 10초{{ex}}에 방향을 바꿉니다. 위치 측정은 초당 20번{{ex}} 재지만 필터에는 $\tau$ 만큼 늦게 도착합니다. 필터는 100 Hz{{ex}} 로 예측합니다(펌웨어의 칼만 예측 주기와 같은 값으로 맞춘 이 모델의 주기). 방향 전환 시각, 측정 주기, 예측 주기는 이 실험의 고정 시나리오입니다. 세 필터가 **똑같은 측정**을 받습니다."
        en="A target moves along one axis at speed $v$ and reverses at 10 s{{ex}}. Position is measured 20 times a second{{ex}} but reaches the filter $\tau$ late. The filter predicts at 100 Hz{{ex}} (this model's period, set equal to the firmware's Kalman prediction rate). The reversal time and both rates are the fixed scenario of this lab. Three filters receive **exactly the same measurements**." />
      <List items={[
        { ko: '**(a) 받은 시각에 융합**: 도착한 순간의 측정인 것처럼 넣습니다. 로그에 수신 시각을 찍어 두고 그 시각으로 융합하면 이렇게 됩니다.', en: '**(a) Fuse at reception**: treat it as measured at the moment it arrives — what happens when logs are stamped at reception and fused by that stamp.' },
        { ko: '**(b) 버퍼 후 재전파**: 측정된 시각으로 되돌아가 갱신하고 지금까지 다시 계산합니다.', en: '**(b) Buffer and re-propagate**: go back to the measurement time, update there, recompute up to now.' },
        { ko: '**(c) 지연이 없었다면**: 비교 기준.', en: '**(c) If there were no delay**: the reference.' },
      ]} />
      <div class="controls">
        <Slider label={{ ko: '표적 속도 $v$', en: 'Target speed $v$' }} value={v} min={0.1} max={3} step={0.1} unit="m/s" onChange={setV} src={ex('vehicle.vMax', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 최대 속도입니다.', en: 'Local to this demo; starts from the maximum speed in the global settings.' })} testId="ch5-delay-v" />
        <Slider label={{ ko: '측정 지연 $\\tau$', en: 'Measurement delay $\\tau$' }} value={tauMs} min={0} max={300} step={10} unit="ms" onChange={setTauMs} src={ex(undefined, { ko: '이 실험에서만 바꾸는 값(전역 설정의 측위 지연과는 별개)', en: 'Local to this lab (separate from the estimation latency in the global settings)' })} testId="ch5-delay-tau" />
      </div>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => setSeed(seed + 1)}>{tr({ ko: '다른 노이즈로 다시', en: 'Different noise' })}</Button>
      </div>
      <LineChart
        title={{ ko: '추정 오차 (추정 − 참값)', en: 'Estimate error (estimate − truth)' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 오차 [cm]', en: 'Position error [cm]' }} height={280}
        series={[
          { name: { ko: '(a) 받은 시각에 융합', en: '(a) fused at reception' }, x: sim.t, y: cm(sim.errNaive), slot: 8, dash: '', width: 2.2 },
          { name: { ko: '(b) 버퍼 후 재전파', en: '(b) buffer and re-propagate' }, x: sim.t, y: cm(sim.errBuffered), slot: 1, dash: '', width: 2 },
          { name: { ko: '(c) 지연이 없었다면', en: '(c) no delay' }, x: sim.t, y: cm(sim.errIdeal), slot: 3, dash: '2 3', width: 1.5 },
          { name: { ko: '이론: (a) 의 편향 ∓v·τ', en: 'Theory: bias of (a), ∓v·τ' }, x: sim.t, y: cm(sim.biasTheory), slot: 4, dash: '7 4', width: 2 },
        ]}
        refLines={[{ y: 0 }]} src={SIM_DELAY} testId="ch5-delay-chart" />
      <StatRow>
        <Stat label={{ ko: '이론 편향 $v\\tau$', en: 'Theoretical bias $v\\tau$' }} value={bias} unit="cm" src={der('ch5#delayed', { ko: '속도 × 지연 (슬라이더 값)', en: 'speed × delay (slider values)' })} />
        <Stat label={{ ko: '(a) 평균 오차, 5~10 s', en: '(a) mean error, 5–10 s' }} value={sim.meanNaive * 100} unit="cm" src={SIM_DELAY} status={Math.abs(sim.meanNaive) > 2 * sim.rmsIdeal ? 'bad' : undefined} />
        <Stat label={{ ko: '(b) 평균 오차, 5~10 s', en: '(b) mean error, 5–10 s' }} value={sim.meanBuffered * 100} unit="cm" src={SIM_DELAY} status="good" />
        <Stat label={{ ko: '(b) 오차 RMS', en: '(b) error RMS' }} value={sim.rmsBuffered * 100} unit="cm" src={SIM_DELAY} />
        <Stat label={{ ko: '(c) 오차 RMS', en: '(c) error RMS' }} value={sim.rmsIdeal * 100} unit="cm" src={SIM_DELAY} />
      </StatRow>
      <P ko="(a) 는 움직이는 동안 내내 이론선 $-v\tau$ 위에 얹혀 있습니다. 노이즈가 아니라 **편향**이므로 측정을 더 모아도, Q·R 을 다시 맞춰도 없어지지 않습니다. 방향을 바꾸면 부호가 뒤집힙니다 — 항상 '가는 방향의 뒤쪽'으로 틀립니다. (b) 는 편향이 없습니다. 다만 (c) 와 완전히 같지는 않습니다. 가장 최근 $\tau$ 동안의 측정은 아직 도착하지 않아 그 구간은 예측만으로 버티기 때문에 RMS 가 조금 큽니다."
        en="(a) rides on the theory line $-v\tau$ for as long as the target moves. It is a **bias**, not noise: more measurements or a retuned Q and R do not remove it. Reverse the direction and the sign flips — the estimate is always wrong 'behind the direction of travel'. (b) has no bias, though it is not identical to (c): the measurements of the most recent $\tau$ have not arrived yet, so that stretch is covered by prediction alone and the RMS is slightly larger." />
      <P ko={`우리 시스템에서는: 기체 사이 상대속도 가정 {{cfg:safety.relSpeed}}, 측위→비행제어기 지연 {{cfg:estimation.latency}} 이면 지연을 보정하지 않았을 때의 어긋남이 약 ${fmt(cfg.safety.relSpeed * cfg.estimation.latency * 100, 2)} cm{{der:ch5#delayed|상대속도 × 측위 지연 (현재 설정)|relative speed × estimation latency (current settings)}} 입니다. 이 지연이 기체 안 어디에서 생기는지는 6장의 데이터 흐름 그림에서 봅니다. 이 항은 6장에서 오차 예산의 '측위 지연 × 상대속도'로 들어갑니다.`}
        en={`In our system: with an assumed relative speed of {{cfg:safety.relSpeed}} and a positioning-to-FC latency of {{cfg:estimation.latency}}, the uncompensated offset is about ${fmt(cfg.safety.relSpeed * cfg.estimation.latency * 100, 2)} cm{{der:ch5#delayed|상대속도 × 측위 지연 (현재 설정)|relative speed × estimation latency (current settings)}}. Where inside the vehicle this latency arises is shown in the data-flow picture of chapter 6. Chapter 6 enters this term into the error budget as 'estimation latency × relative speed'.`} />
    </Pitfall>
  );
}

/* ───────────────────────── 본문 ───────────────────────── */
function Body() {
  const cfg = config.value, b = budget.value;
  const modeName = cfg.uwb.mode === 'twr' ? 'TWR' : 'TDoA';
  return (
    <>
      <Section id="why" title={{ ko: '떨리는 센서와 흘러가는 센서', en: 'A sensor that jitters and a sensor that drifts' }}>
        <P ko={`4장까지 우리는 UWB 측정에서 위치를 구했습니다. 지금 설정으로 드론 한 대는 초당 약 ${fmt(b.posRate, 3)}번{{der:ch3#rate|3장의 갱신율 모델, 현재 설정|Update-rate model of ch. 3, current settings}} 위치를 얻고, 그 한 번 한 번의 수평 오차(1σ)는 약 ${fmt(b.sigmaPosH * 100, 3)} cm{{der:ch4#sigma-eff|DOP × 게이팅 뒤 유효 거리 오차, 현재 설정|DOP × effective range error after gating, current settings}} 입니다. 이 값을 그대로 제어기에 넣으면 드론은 그 노이즈를 따라 떱니다.`}
          en={`Up to chapter 4 we turned UWB measurements into positions. With the current settings a drone gets a position about ${fmt(b.posRate, 3)} times a second{{der:ch3#rate|3장의 갱신율 모델, 현재 설정|Update-rate model of ch. 3, current settings}}, each with a horizontal error (1σ) of about ${fmt(b.sigmaPosH * 100, 3)} cm{{der:ch4#sigma-eff|DOP × 게이팅 뒤 유효 거리 오차, 현재 설정|DOP × effective range error after gating, current settings}}. Fed straight into the controller, the drone would shake along with that noise.`} />
        <P ko="드론에는 센서가 하나 더 있습니다. **관성측정장치**(IMU, inertial measurement unit)입니다. Crazyflie 2.1 Brushless 의 IMU 는 BMI088{{lit:cfbl-datasheet/imu}} 로, 가속도와 각속도를 잽니다. 가속도를 두 번 적분하면 위치가 나오니 IMU 만으로도 위치를 알 수 있을 것 같지만, 그렇지 않습니다."
          en="The drone carries one more sensor: the **inertial measurement unit** (IMU). On the Crazyflie 2.1 Brushless it is a BMI088{{lit:cfbl-datasheet/imu}}, measuring acceleration and angular rate. Integrating acceleration twice gives position, so it may seem the IMU alone would do. It does not." />
        <Derivation id="drift" title={{ ko: '가속도계만으로 위치를 구하면', en: 'Position from the accelerometer alone' }}>
          <P ko="가속도계가 재는 값을 $a_m = a + b$ 라고 합시다. $a$ 는 진짜 가속도, $b$ 는 작은 오차 [m/s²] 입니다. 오차가 일정하다고 하고 두 번 적분하면"
            en="Write the accelerometer reading as $a_m = a + b$: the true acceleration $a$ plus a small error $b$ [m/s²]. With a constant error, integrating twice gives" />
          <M block tex={String.raw`\underbrace{\int_0^t b\,dt' = b\,t}_{\tx{속도 오차}{velocity error}} \qquad\Longrightarrow\qquad \underbrace{\int_0^t b\,t'\,dt' = \tfrac{1}{2}\,b\,t^2}_{\tx{위치 오차}{position error}}`} />
          <P ko="위치 오차가 시간의 **제곱**으로 자랍니다. $b$ = 0.1 m/s²{{ex}} 이면 2초 뒤 0.2 m{{der:ch5#drift|½ × 0.1 × 2²|½ × 0.1 × 2²}}, 10초 뒤 5 m{{der:ch5#drift|½ × 0.1 × 10²|½ × 0.1 × 10²}} 입니다. 0.1 m/s² 는 큰 값이 아닙니다. 기체가 약 0.6°{{der:ch5#drift|g·sin θ = 0.1 m/s² 를 θ 에 대해 푼 값 (g = 9.81 m/s²)|Solving g·sin θ = 0.1 m/s² for θ (g = 9.81 m/s²)}} 기울어 있는 것을 모르면 중력이 그만큼 수평 가속도로 새어 들어옵니다. 기울기 $\theta$ 를 모르면 중력 $g$ 의 수평 성분 $b = g\sin\theta$ 가 가속도 오차가 되기 때문입니다($9.81 \times \sin 0.6^\circ \approx 0.1$). 이렇게 쌓여 가는 오차를 **드리프트**(drift)라고 합니다."
            en="The position error grows with the **square** of time. With $b$ = 0.1 m/s²{{ex}} it is 0.2 m{{der:ch5#drift|½ × 0.1 × 2²|½ × 0.1 × 2²}} after 2 s and 5 m{{der:ch5#drift|½ × 0.1 × 10²|½ × 0.1 × 10²}} after 10 s. And 0.1 m/s² is not much: an unnoticed tilt of about 0.6°{{der:ch5#drift|g·sin θ = 0.1 m/s² 를 θ 에 대해 푼 값 (g = 9.81 m/s²)|Solving g·sin θ = 0.1 m/s² for θ (g = 9.81 m/s²)}} leaks that much gravity into the horizontal acceleration: with an unknown tilt $\theta$, the horizontal component of gravity, $b = g\sin\theta$, becomes an acceleration error ($9.81 \times \sin 0.6^\circ \approx 0.1$). This accumulating error is called **drift**." />
        </Derivation>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th></th><th>UWB</th><th>{tr({ ko: 'IMU (가속도계)', en: 'IMU (accelerometer)' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '무엇을 재나', en: 'Measures' })}</b></td><td><T ko="앵커까지의 거리(차) → 강당 좌표의 위치" en="range (difference) to anchors → position in hall coordinates" /></td><td><T ko="가속도 → 짧은 시간 동안의 움직임" en="acceleration → motion over a short time" /></td></tr>
              <tr><td><b>{tr({ ko: '오차의 성격', en: 'Error behaviour' })}</b></td><td><T ko="매번 흔들리지만 **쌓이지 않는다**" en="jitters every time but **does not accumulate**" /></td><td><T ko="한 번 한 번은 매끈하지만 **쌓인다**" en="smooth sample to sample but **accumulates**" /></td></tr>
              <tr><td><b>{tr({ ko: '혼자 쓰면', en: 'Used alone' })}</b></td><td><T ko="떨리고, 가끔 튄다(4장의 NLOS)" en="jitter and occasional jumps (NLOS, ch. 4)" /></td><td><T ko="몇 초 만에 흘러가 버린다" en="drifts away within seconds" /></td></tr>
            </tbody>
          </table>
        </div>
        <P ko="둘은 약점이 정반대입니다. 그래서 합칩니다. **IMU 로 다음 순간을 예측하고, UWB 가 올 때마다 그 예측을 붙잡아 고칩니다.** 이 '예측하고 고치기'를, 각 정보가 얼마나 믿을 만한지까지 계산해 가며 하는 방법이 **칼만 필터**(Kalman filter)입니다."
          en="Their weaknesses are opposite, so we combine them: **predict the next instant with the IMU and pull the prediction back whenever UWB arrives.** Doing this 'predict and correct' while keeping track of how trustworthy each piece of information is — that is the **Kalman filter**." />
        <Note>
          <P ko="**실제 Crazyflie 와 이 장의 모델.** Loco 덱(기체 위에 꽂는 UWB 확장 보드. **덱**은 Crazyflie 에 꽂는 확장 보드를 말합니다, 6장)처럼 위치 정보를 주는 덱을 쓰면 Crazyflie 는 온보드 추정기로 **확장 칼만 필터**(EKF, extended Kalman filter)를 씁니다{{lit:cf-firmware-docs/ekf-for-loco}}. 그 필터의 상태는 9개(위치 3, 기체 좌표 속도 3, 자세 오차 3){{lit:cf-firmware-docs/kalman-state}} 이고 예측 단계는 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}}(문서가 아닌 펌웨어 소스의 상수)로 돕니다. 모션캡처를 쓴 원래의 Crazyswarm 도 추정기가 기체 안에 있었다는 점은 같습니다(당시 전용 펌웨어의 필터는 상태 (p, v, q), 500 Hz IMU 로 구동{{lit:crazyswarm2017/onboard-estimation}}). 이 장의 필터는 그 구조를 **단순화한 교육용 모델**입니다. 자세는 이미 안다고 보고 상태를 위치·속도 6개(1차원 예제에서는 2개)로 줄였습니다. 펌웨어의 동작을 재현한 것이 아니며, 실제로 어디서 무엇을 설정하는지는 6장에서 다룹니다."
            en="**The real Crazyflie and the model of this chapter.** With a deck that provides position information, such as the Loco deck (a UWB expansion board plugged on top of the vehicle; a **deck** is any expansion board for the Crazyflie, ch. 6), the Crazyflie uses an **extended Kalman filter** (EKF) as its onboard estimator{{lit:cf-firmware-docs/ekf-for-loco}}. That filter has 9 states (position 3, body-frame velocity 3, attitude error 3){{lit:cf-firmware-docs/kalman-state}} and its prediction step runs at 100 Hz{{lit:cf-firmware-docs/kalman-predict-rate}} (a constant in the firmware source, not the documentation). The original motion-capture Crazyswarm shared one point: the estimator was onboard (its dedicated firmware of the time ran a filter with state (p, v, q) driven by a 500 Hz IMU{{lit:crazyswarm2017/onboard-estimation}}). The filter of this chapter is a **simplified teaching model** of that structure: attitude is assumed known and the state is cut to 6 elements, position and velocity (2 in the 1-D example). It does not reproduce the firmware; where things actually run and what you configure is the subject of chapter 6." />
        </Note>
      </Section>

      <Section id="kf" title={{ ko: '칼만 필터: 예측하고, 고치고', en: 'The Kalman filter: predict, then correct' }}>
        <P ko="자동제어 수업에서 상태공간 모델 $x_{k+1} = Fx_k$ 를 다뤘습니다. 그때는 상태 $x$ 를 안다고 했습니다. 지금은 모릅니다. 그래서 숫자 두 개를 함께 들고 다닙니다. 상태의 **추정값** $\hat x$ 와, 그 추정이 얼마나 틀릴 수 있는지를 적은 **공분산**(covariance) $P$ 입니다."
          en="In your control course you worked with the state-space model $x_{k+1} = Fx_k$ — and the state $x$ was known. Now it is not. So we carry two things: the **estimate** $\hat x$ of the state, and the **covariance** $P$, a record of how wrong that estimate may be." />
        <Derivation id="kf" title={{ ko: '다섯 줄짜리 칼만 필터', en: 'The Kalman filter in five lines' }}>
          <P ko="**① 불확실한 숫자 두 개를 섞기.** 먼저 상태가 숫자 하나라고 합시다. 내 예측은 $x^-$ 이고(위첨자 $^-$ 는 '측정을 넣기 **전**'이라는 뜻입니다) 그 오차의 분산은 $P^-$ 입니다(분산은 표준편차 σ 의 제곱, 단위 m²). 측정은 $z$ 이고 오차의 분산은 $R$ 입니다. 둘을 섞어"
            en="**① Blending two uncertain numbers.** Let the state be a single number first. My prediction is $x^-$ (the superscript $^-$ means 'before the measurement is used') with error variance $P^-$ (variance is the square of the standard deviation σ; unit m²). The measurement is $z$ with error variance $R$. Blend them as" />
          <M block tex={String.raw`\hat x = x^- + K\,(z - x^-) = (1-K)\,x^- + K\,z`} />
          <P ko="를 만듭니다. $K = 0$ 이면 예측만, $K = 1$ 이면 측정만 믿는 것입니다. 두 오차가 서로 독립이면 섞은 값의 분산은 각 분산에 가중치의 제곱을 곱해 더한 것입니다. 이것을 가장 작게 하는 $K$ 를 미분으로 찾습니다."
            en="$K = 0$ trusts the prediction only, $K = 1$ the measurement only. If the two errors are independent, the variance of the blend is the sum of each variance times its squared weight. Find the $K$ that minimises it by differentiating." />
          <M block tex={String.raw`P(K) = (1-K)^2P^- + K^2R,\qquad \frac{dP}{dK} = -2(1-K)P^- + 2KR = 0 \;\Rightarrow\; K = \frac{P^-}{P^- + R},\qquad P = (1-K)\,P^-`} />
          <P ko="예: 예측의 σ 가 20 cm{{ex}}, 측정의 σ 가 10 cm{{ex}} 이면 $K$ = 400/(400+100) = 0.8{{der:ch5#kf|P⁻/(P⁻+R), 단위 cm²|P⁻/(P⁻+R) in cm²}}, 섞은 뒤의 σ 는 $\sqrt{0.2 \times 400} \approx$ 8.9 cm{{der:ch5#kf|√((1−K)P⁻)|√((1−K)P⁻)}} 입니다. 더 믿을 만한 쪽(측정)에 더 큰 가중치가 가고, 결과는 둘 중 좋은 쪽보다도 좋아집니다."
            en="Example: with a prediction σ of 20 cm{{ex}} and a measurement σ of 10 cm{{ex}}, $K$ = 400/(400+100) = 0.8{{der:ch5#kf|P⁻/(P⁻+R), 단위 cm²|P⁻/(P⁻+R) in cm²}} and the blended σ is $\sqrt{0.2 \times 400} \approx$ 8.9 cm{{der:ch5#kf|√((1−K)P⁻)|√((1−K)P⁻)}}. The more trustworthy side (the measurement) gets the larger weight, and the result beats even the better of the two." />
          <P ko="**② 움직이는 상태.** 한 축 위의 드론은 위치 $p$ [m] 와 속도 $v$ [m/s] 로 나타냅니다: $x = [p,\ v]^{\mathsf T}$. 한 스텝($dt$ 초) 동안 가속도 $a$ 가 일정했다면"
            en="**② A moving state.** A drone on one axis is described by position $p$ [m] and velocity $v$ [m/s]: $x = [p,\ v]^{\mathsf T}$. If the acceleration $a$ is constant over one step of $dt$ seconds," />
          <M block tex={String.raw`\begin{bmatrix} p \\ v \end{bmatrix}_{k+1} = \underbrace{\begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}}_{F} \begin{bmatrix} p \\ v \end{bmatrix}_{k} + \underbrace{\begin{bmatrix} dt^2/2 \\ dt \end{bmatrix}}_{G} a`} />
          <P ko="필터는 $a$ 를 모릅니다. 그래서 '평균 0, 표준편차 $\sigma_a$ [m/s²] 인 무작위 값'으로 보고, 그것이 상태에 만드는 흔들림의 공분산을 $Q$ 라고 적습니다. 모르는 움직임을 노이즈로 취급한 것이라 **프로세스 노이즈**(process noise)라고 부릅니다."
            en="The filter does not know $a$. It treats it as a random value with mean 0 and standard deviation $\sigma_a$ [m/s²], and writes the covariance of the disturbance this causes in the state as $Q$. Since unknown motion is being treated as noise, it is called **process noise**." />
          <P ko="여기서부터는 규칙 하나만 쓰면 됩니다. **$x$ 의 공분산이 $P$ 이면, $Ax$ 의 공분산은 $APA^{\mathsf T}$ 입니다.** 숫자 하나일 때의 $\mathrm{Var}(ax) = a^2\,\mathrm{Var}(x)$ 를 행렬로 쓴 것이고, 2장의 DOP 유도에서 쓴 것과 같은 규칙입니다. 흔들림 $Ga$ 에 이 규칙을 쓰면($A = G$, $\mathrm{Var}(a) = \sigma_a^2$)"
            en="From here on a single rule is enough: **if $x$ has covariance $P$, then $Ax$ has covariance $APA^{\mathsf T}$.** It is the matrix form of $\mathrm{Var}(ax) = a^2\,\mathrm{Var}(x)$ for a single number, and the same rule used in the DOP derivation of chapter 2. Applied to the disturbance $Ga$ ($A = G$, $\mathrm{Var}(a) = \sigma_a^2$):" />
          <M block tex={String.raw`Q = \sigma_a^2\,G\,G\T = \sigma_a^2 \begin{bmatrix} dt^4/4 & dt^3/2 \\ dt^3/2 & dt^2 \end{bmatrix}`} />
          <P ko="이제 $P$ 는 2×2 행렬입니다. 대각 원소는 위치 추정 오차와 속도 추정 오차의 분산($\sigma_p^2$, $\sigma_v^2$)이고, 비대각 원소는 두 오차가 **함께 움직이는 정도**입니다(예: 속도를 실제보다 크게 잡고 있었다면 위치도 앞서 있을 가능성이 높습니다). 측정은 위치만 잽니다: $z = Hx + $ 노이즈, $H = [1\ \ 0]$, 노이즈의 분산은 $R = \sigma_z^2$."
            en="$P$ is now a 2×2 matrix. Its diagonal holds the variances of the position and velocity estimate errors ($\sigma_p^2$, $\sigma_v^2$); the off-diagonal says how much the two errors **move together** (if the velocity has been overestimated, the position is probably ahead as well). The measurement sees position only: $z = Hx + $ noise, $H = [1\ \ 0]$, noise variance $R = \sigma_z^2$." />
          <P ko="**③ 다섯 줄.** ① 의 생각을 행렬로 옮기면 칼만 필터가 됩니다. 위첨자 $^-$ 는 '측정을 넣기 전'이라는 뜻입니다. 공분산이 어떻게 옮겨 가는지는 모두 위의 규칙입니다. 한 스텝 보내면 $Fx$ 이므로 공분산은 $FPF^{\mathsf T}$, 여기에 독립인 흔들림의 $Q$ 가 더해집니다. 예측한 측정 $Hx^-$ 의 분산은 $HP^-H^{\mathsf T}$ 이고, 측정 노이즈 $R$ 이 더해져 혁신의 분산 $S$ 가 됩니다. $K$ 의 행렬식은 ① 과 같은 최소화(갱신 뒤 오차 분산들의 합을 가장 작게)의 결과이며, 여기서는 증명을 생략합니다."
            en="**③ Five lines.** Carrying the idea of ① over to matrices gives the Kalman filter. The superscript $^-$ means 'before the measurement is used'. Every covariance below follows the rule above: one step ahead is $Fx$, so the covariance becomes $FPF^{\mathsf T}$, plus the independent disturbance $Q$; the predicted measurement $Hx^-$ has variance $HP^-H^{\mathsf T}$, and adding the measurement noise $R$ gives the innovation variance $S$. The matrix formula for $K$ comes from the same minimisation as in ① (the sum of the post-update error variances is made as small as possible); the proof is omitted here." />
          <M block tex={String.raw`\begin{aligned}
&\tx{예측 (매 스텝)}{Predict (every step)} && x^- = F\,\hat x && P^- = F\,P\,F\T + Q\\
&\tx{갱신 (측정이 올 때)}{Update (when a measurement arrives)} && \nu = z - H\,x^- && K = P^-H\T\,S^{-1},\quad S = H\,P^-H\T + R\\
& && \hat x = x^- + K\,\nu && P = (I - K H)\,P^-
\end{aligned}`} />
          <List items={[
            { ko: '$x^- = F\\hat x$: 모델대로 한 스텝 앞으로 보냅니다(**예측**, predict).', en: '$x^- = F\\hat x$: move the estimate one step ahead with the model (**predict**).' },
            { ko: '$P^- = FPF^{\\mathsf T} + Q$: 불확실성도 함께 보냅니다. $FPF^{\\mathsf T}$ 는 속도의 불확실성이 $dt$ 동안 위치의 불확실성으로 번지는 것이고, $+Q$ 는 그동안 모르는 가속이 있었을 수 있으니 더 키우는 것입니다. **예측만 하면 $P$ 는 계속 커집니다.**', en: '$P^- = FPF^{\\mathsf T} + Q$: move the uncertainty along too. $FPF^{\\mathsf T}$ lets velocity uncertainty leak into position over $dt$; $+Q$ enlarges it for the acceleration we could not know. **Predicting alone makes $P$ grow without end.**' },
            { ko: '$\\nu = z - Hx^-$: **혁신**(innovation). 측정이 예측과 얼마나 달랐는가, 곧 필터가 "놀란 정도"입니다. $S$ 는 혁신이 평소 얼마나 클지(분산)입니다. 그래서 $\\nu^2/S$ 는 가정이 맞으면 평균이 1 이 됩니다. 이 값을 **NIS** 라 부르고 필터를 점검하는 데 씁니다(아래 데모 뒤의 NIS 카드).', en: '$\\nu = z - Hx^-$: the **innovation** — how far the measurement is from what was predicted, i.e. how "surprised" the filter is. $S$ is how large an innovation normally is (its variance), so $\\nu^2/S$ averages 1 when the assumptions hold. That number is the **NIS**, used to check the filter (NIS card after the demos below).' },
            { ko: '$K = P^-H^{\\mathsf T}S^{-1}$: **칼만 이득**(Kalman gain). 혁신 중 얼마를 받아들일지입니다. ① 의 $P^-/(P^- + R)$ 과 같은 꼴입니다. 예측이 불확실할수록($P^-$ 큼) 1 에, 측정이 나쁠수록($R$ 큼) 0 에 가까워집니다. $K$ 는 위치·속도 두 성분을 가지므로, **위치만 쟀는데 속도도 함께 고쳐집니다** — $P$ 의 비대각 원소 덕분입니다.', en: '$K = P^-H^{\\mathsf T}S^{-1}$: the **Kalman gain** — how much of the innovation to accept. Same form as $P^-/(P^- + R)$ in ①: close to 1 when the prediction is uncertain (large $P^-$), close to 0 when the measurement is poor (large $R$). $K$ has a position and a velocity component, so **measuring position alone also corrects velocity** — thanks to the off-diagonal of $P$.' },
            { ko: '$\\hat x = x^- + K\\nu$, $P = (I - KH)P^-$: 고치고, 불확실성을 줄입니다(**갱신**, update).', en: '$\\hat x = x^- + K\\nu$, $P = (I - KH)P^-$: correct, and shrink the uncertainty (**update**).' },
          ]} />
          <P ko="튜닝할 손잡이는 둘뿐입니다. $Q$(= $\sigma_a$: 드론이 모델을 얼마나 벗어나 움직인다고 볼 것인가)와 $R$(= $\sigma_z$: 측정을 얼마나 나쁘다고 볼 것인가). 이득 $K$ 는 둘의 **비율**이 정하고, $P$ 의 크기는 둘의 **절대 크기**가 정합니다."
            en="There are only two knobs: $Q$ (= $\sigma_a$: how far from the model we think the drone moves) and $R$ (= $\sigma_z$: how bad we think the measurements are). Their **ratio** sets the gain $K$; their **absolute size** sets the size of $P$." />
        </Derivation>
        <Predict id="ch5-filter-worse"
          question={{ ko: '노이즈가 있는 위치 측정을 칼만 필터에 넣었습니다. 필터를 거친 추정의 오차는 측정 그대로의 오차와 비교해 어떨까요?', en: 'Noisy position measurements go through a Kalman filter. How does the error of the filtered estimate compare with the error of the raw measurements?' }}
          choices={[
            { label: { ko: '항상 더 작다 — 필터는 노이즈를 평균해 줄이니까', en: 'Always smaller — a filter averages noise away' } },
            { label: { ko: 'Q·R 을 어떻게 잡느냐에 따라 더 커질 수도 있다', en: 'It can even be larger, depending on how Q and R are set' }, correct: true },
            { label: { ko: '같다 — 필터는 값을 매끈하게 보이게 할 뿐이다', en: 'The same — a filter only makes the values look smoother' } },
          ]}
          explain={{
            ko: '**더 커질 수도 있습니다.** 필터가 줄여 주는 것은 노이즈이고, 그 대가로 **뒤처짐**이 생깁니다. $Q$ 를 너무 작게 잡으면 필터는 "드론은 거의 가속하지 않는다"고 믿고 측정을 조금씩만 받아들입니다. 드론이 실제로 움직이기 시작하면 추정은 한참 뒤에야 따라가고, 그 뒤처진 거리가 측정 노이즈보다 커질 수 있습니다. 아래 데모에서 "Q 너무 작게"를 눌러 확인해 보세요.',
            en: '**It can be larger.** What the filter removes is noise, and the price is **lag**. With $Q$ too small the filter believes "the drone hardly accelerates" and accepts only a little of each measurement. When the drone does start to move, the estimate follows much later, and that lag can exceed the measurement noise. Press "Q too small" in the demo below to see it.',
          }} />
        <KfTuning />
      </Section>

      <Section id="steady" title={{ ko: '정상상태: 융합하면 오차가 얼마나 줄어드나', en: 'Steady state: how much fusion reduces the error' }}>
        <P ko="데모의 ±2σ 띠는 처음 몇 초 동안 좁아지다가 일정한 폭에 머뭅니다. 예측이 키우는 만큼을 갱신이 줄여서 균형이 잡힌 것입니다. 이 균형 상태를 **정상상태**(steady state)라고 하고, 그때의 σ 가 오차 예산에 들어갑니다."
          en="The ±2σ band in the demo narrows for a few seconds and then stays at a constant width: what prediction adds, the update removes. This balance is the **steady state**, and its σ is what enters the error budget." />
        <Derivation id="steady-state" title={{ ko: '정상상태 공분산: 리카티 방정식의 고정점', en: 'Steady-state covariance: the fixed point of the Riccati equation' }}>
          <P ko="먼저 손으로 풀리는 가장 단순한 경우입니다. 상태가 위치 하나뿐이고, 스텝마다 분산 $q$ 만큼 무작위로 움직인다고 합시다. 예측은 $P^- = P + q$, 갱신은 '다섯 줄'의 ① 에서 $P = (1-K)P^- = P^-R/(P^- + R)$ 입니다. 정상상태에서는 갱신 뒤의 $P$ 가 다음 바퀴에도 같은 값이어야 하므로"
            en="First the simplest case, solvable by hand. The state is position only and moves randomly with variance $q$ per step. Prediction gives $P^- = P + q$; the update, from ① of the five lines, gives $P = (1-K)P^- = P^-R/(P^- + R)$. In steady state the $P$ after the update must be the same on the next round, so" />
          <M block tex={String.raw`P = \frac{(P+q)\,R}{P+q+R} \;\Longrightarrow\; P^2 + qP - qR = 0 \;\Longrightarrow\; P_\infty = \frac{-q + \sqrt{q^2 + 4qR}}{2}`} />
          <List items={[
            { ko: '$q \\ll R$ (거의 안 움직이는 대상, 나쁜 측정): $P_\\infty \\approx \\sqrt{qR}$. $R$ 보다 훨씬 작습니다 — 측정 여러 개를 평균하는 효과입니다.', en: '$q \\ll R$ (a nearly static target, poor measurements): $P_\\infty \\approx \\sqrt{qR}$, far below $R$ — the effect of averaging many measurements.' },
            { ko: '$q \\gg R$ (많이 움직이는 대상, 좋은 측정): $P_\\infty \\approx R$. 지난 측정은 쓸모가 없어 최신 측정 하나만 믿습니다.', en: '$q \\gg R$ (a lively target, good measurements): $P_\\infty \\approx R$. Old measurements are useless; only the latest one counts.' },
          ]} />
          <P ko="위치·속도 모델에서도 생각은 같습니다. 예측과 갱신을 이어 쓴 식"
            en="The idea is the same for the position–velocity model. Chain prediction and update:" />
          <M block tex={String.raw`P^-_{k+1} = F\Big(\underbrace{P^-_k - P^-_kH\T\big(HP^-_kH\T + R\big)^{-1}HP^-_k}_{P_k \tx{ (갱신 뒤)}{ (after the update)}}\Big)F\T + Q`} />
          <P ko="를 **리카티 방정식**(Riccati equation)이라고 합니다. 행렬이라 닫힌 식으로 쓰기는 번거로우므로, 값이 더 변하지 않을 때까지 이 식을 되풀이해 고정점을 구합니다. 여기에 측정값 $z$ 가 들어 있지 않다는 점을 보세요. **$P$ 는 실제 측정과 무관하게 $F$, $Q$, $R$, 주기만으로 정해집니다.** 그래서 비행 전에 미리 계산할 수 있습니다."
            en="This is the **Riccati equation**. Being a matrix equation it is awkward in closed form, so we iterate it until nothing changes and take the fixed point. Notice that the measured values $z$ do not appear: **$P$ is fixed by $F$, $Q$, $R$ and the period alone, whatever the measurements turn out to be.** That is why it can be computed before the flight." />
          <P ko="오차 예산은 이 고정점을 **축마다** 씁니다. 수평 오차 $\sigma_{\text{pos,H}}$(x, y 두 축을 합친 RMS)는 두 축에 똑같이 나눠 축당 $\sigma_{\text{pos,H}}/\sqrt2$ 로 한 축씩 계산한 뒤 다시 합치고($\sqrt2$ 배), 수직 오차 $\sigma_{\text{pos,V}}$ 는 그대로 넣습니다. 입력은 UWB 위치 한 번의 오차 $\sigma_{\text{pos}}$(2·4장), 위치 갱신율 $f_{\text{pos}}$(3장), 가속도 노이즈 $\sigma_a$ 이고, 출력은 갱신 직후($P_\infty$ 는 갱신 뒤의 값) 위치 성분의 제곱근입니다. 실제 x, y 축의 DOP 가 서로 다르면 축마다 따로 계산한 값과 조금 다를 수 있습니다 — 예산이 쓰는 단순화입니다."
            en="The error budget uses this fixed point **per axis**. The horizontal error $\sigma_{\text{pos,H}}$ (the RMS over x and y together) is split equally over the two axes, $\sigma_{\text{pos,H}}/\sqrt2$ each, computed one axis at a time and recombined ($\times\sqrt2$); the vertical error $\sigma_{\text{pos,V}}$ goes in as is. The inputs are the error $\sigma_{\text{pos}}$ of a single UWB position (ch. 2 and 4), the position update rate $f_{\text{pos}}$ (ch. 3) and the acceleration noise $\sigma_a$; the output is the square root of the position element right after an update ($P_\infty$ is the post-update value). If the real x and y DOPs differ, a separate calculation per axis can differ slightly — a simplification of the budget." />
          <M block tex={String.raw`\sigma_{\text{est}} = \sqrt{P_\infty[p,p]}\,,\qquad R = \sigma_{\text{pos}}^2,\quad dt = 1/f_{\text{pos}},\quad Q = Q(\sigma_a, dt)`} />
        </Derivation>
        <SteadyPanel />
        <Note>
          <P ko="**가속도 노이즈 $\sigma_a$ 라는 설정 하나의 뜻.** 이 장에서 이 설정은 두 역할을 합니다. 1차원 데모와 **오차 예산**에서는 IMU 를 쓰지 않는 필터의 프로세스 노이즈, 곧 '드론의 모르는 가속도 전체'입니다. 아래 UWB+IMU 융합 데모에서는 같은 값을 '가속도계 입력의 오차'로 빌려 씁니다. IMU 를 쓰는 필터에서는 이 값이 가속도계 오차만 담으면 되므로 실제로는 더 작을 수 있고, 그렇다면 예산의 $\sigma_{\text{est}}$ 는 넉넉한(보수적인) 쪽입니다. 기본값 {{cfg:estimation.accelNoise}} 는 센서 사양이 아닌 예시값입니다. 값을 정하는 방법은 두 가지입니다. ① 기체를 가만히 두고 가속도계 로그의 표준편차를 잽니다(IMU 를 쓰는 필터용). ② 비행 로그에서 평균 NIS 가 1 이 되도록 맞춥니다(위 NIS 카드)."
            en="**What the single acceleration-noise setting $\sigma_a$ means.** In this chapter the setting plays two roles. In the 1-D demo and in the **error budget** it is the process noise of a filter without an IMU — 'all the unknown acceleration of the drone'. The UWB+IMU fusion demo below borrows the same value as 'the error of the accelerometer input'. A filter that uses the IMU only needs the accelerometer error there, which may well be smaller, in which case the budget's $\sigma_{\text{est}}$ is on the generous (conservative) side. The default {{cfg:estimation.accelNoise}} is an example value, not a sensor specification. Two ways to set it: ① log the accelerometer with the vehicle at rest and take the standard deviation (for an IMU-driven filter); ② tune it on flight logs until the mean NIS is 1 (NIS card above)." />
        </Note>
        <Note>
          <P ko={`**이 식을 너무 믿지 마세요 — 가정이 하나 숨어 있습니다.** 정상상태 식은 측정 오차가 **백색**(white), 즉 매 측정마다 서로 독립이라고 가정합니다. 그래야 여러 번 재서 평균하면 줄어듭니다. 실제 UWB 오차에는 천천히 변하거나 아예 변하지 않는 부분이 섞여 있습니다: NLOS 편향(4장), 앵커 좌표를 잘못 잰 오차, 안테나 방향(기체 자세)에 따른 체계 편향{{lit:util2022/nlos-bias-behaviour}}. 이런 오차는 다음 측정에도 똑같이 들어 있으므로 **필터가 아무리 평균해도 줄지 않습니다.**`}
            en={`**Do not trust this formula too far — it hides an assumption.** The steady-state formula assumes the measurement errors are **white**: independent from one sample to the next. Only then does averaging many of them help. Real UWB errors contain parts that change slowly or not at all: NLOS bias (ch. 4), wrongly surveyed anchor coordinates, systematic bias depending on antenna orientation (vehicle attitude){{lit:util2022/nlos-bias-behaviour}}. Such an error is present again in the next measurement, so **no amount of filtering averages it away.**`} />
          <P ko={`그래서 지금 설정의 식은 수평 ${fmt(b.sigmaEstH * 100, 2)} cm{{der:ch5#steady-state}} 를 내놓지만, Bitcraze 는 Loco Positioning System 의 정확도를 '10 cm 수준'{{lit:lps-docs/accuracy}}이라고 말하고, Crazyswarm 논문도 UWB 측위의 오차가 10 cm 를 넘는다고 보아 모션캡처를 골랐습니다{{lit:crazyswarm2017/uwb-comparison}}. 두 숫자는 모순이 아닙니다. 식이 말하는 것은 **무작위로 떨리는 부분**이고, 나머지는 따로 더해야 합니다. 6장이 앵커 좌표 오차가 만드는 편향을 예산에 더하고, 9장이 여러분의 강당에서 실제로 잰 값으로 바꿉니다.`}
            en={`So while the formula gives ${fmt(b.sigmaEstH * 100, 2)} cm{{der:ch5#steady-state}} horizontally for the current settings, Bitcraze describes the accuracy of the Loco Positioning System as 'in the 10 cm range'{{lit:lps-docs/accuracy}}, and the Crazyswarm paper chose motion capture because it judged UWB positioning errors to exceed 10 cm{{lit:crazyswarm2017/uwb-comparison}}. The two numbers do not contradict each other: the formula describes the **randomly jittering part** only; the rest must be added separately. Chapter 6 adds the bias caused by anchor survey error to the budget, and chapter 9 replaces the inputs with values measured in your own hall.`} />
        </Note>
      </Section>

      <Section id="ekf" title={{ ko: '3차원으로: 거리 단위 융합과 위치 단위 융합', en: 'Into 3-D: range-level and position-level fusion' }}>
        <P ko="1차원 예제는 위치를 직접 쟀습니다. 실제 UWB 는 위치가 아니라 **앵커까지의 거리**(TWR) 또는 **두 앵커까지 거리의 차**(TDoA)를 잽니다. 그리고 이제 IMU 를 예측에 씁니다. 바뀌는 것은 두 곳입니다."
          en="The 1-D example measured position directly. Real UWB measures not position but the **range to an anchor** (TWR) or the **difference of the ranges to two anchors** (TDoA). And now the IMU drives the prediction. Two things change." />
        <Derivation id="ekf" title={{ ko: 'IMU 를 입력으로, 거리를 측정으로: 확장 칼만 필터', en: 'IMU as input, range as measurement: the extended Kalman filter' }}>
          <P ko="상태는 강당 좌표(x, y 는 바닥, z 는 위쪽)의 위치와 속도 6개입니다: $x = [p_x, p_y, p_z, v_x, v_y, v_z]^{\mathsf T}$. **예측**에서는 모르는 가속도를 0 으로 두는 대신 가속도계가 잰 값 $a_m$ [m/s²] 을 넣습니다."
            en="The state is position and velocity in hall coordinates (x, y on the floor, z up), 6 elements: $x = [p_x, p_y, p_z, v_x, v_y, v_z]^{\mathsf T}$. In the **prediction**, instead of setting the unknown acceleration to 0 we insert the accelerometer reading $a_m$ [m/s²]." />
          <M block tex={String.raw`p^- = \hat p + \hat v\,dt + \tfrac{1}{2}\,a_m\,dt^2,\qquad v^- = \hat v + a_m\,dt,\qquad P^- = FPF\T + Q(\sigma_a, dt)`} />
          <P ko="$F$ 와 $Q$ 는 축마다 앞의 2×2 블록을 그대로 세 번 놓은 6×6 행렬입니다(x, y, z 가 서로 독립이라고 봅니다). 이제 $\sigma_a$ 는 '드론의 모르는 가속도 전체'가 아니라 **가속도계가 틀리는 정도**만 담으면 됩니다. 훨씬 작은 $Q$ 로도 급한 기동을 뒤처짐 없이 따라갈 수 있는 이유입니다. (여기서는 $a_m$ 이 이미 강당 좌표로 돌려지고 중력이 빠진 값이라고 가정합니다. 실제로는 그러려면 자세를 알아야 하고, 그래서 Crazyflie 의 필터는 자세 오차도 상태로 추정합니다{{lit:cf-firmware-docs/kalman-state}}.)"
            en="$F$ and $Q$ are 6×6 matrices made of the 2×2 blocks above placed three times, once per axis (x, y, z treated as independent). Now $\sigma_a$ only has to cover **how wrong the accelerometer is**, not 'all the unknown acceleration of the drone'. That is why a much smaller $Q$ can still follow sharp manoeuvres without lag. (We assume $a_m$ is already rotated into hall coordinates with gravity removed. In reality that requires the attitude, which is why the Crazyflie filter also estimates the attitude error as part of its state{{lit:cf-firmware-docs/kalman-state}}.)" />
          <P ko="**갱신**에서는 측정이 상태의 선형식 $Hx$ 가 아닙니다. 위치 $a_i$ 에 있는 앵커까지의 거리는"
            en="In the **update**, the measurement is no longer a linear function $Hx$ of the state. The range to an anchor at position $a_i$ is" />
          <M block tex={String.raw`h_i(x) = \norm{p - a_i} = \sqrt{(p_x - a_{i,x})^2 + (p_y - a_{i,y})^2 + (p_z - a_{i,z})^2}`} />
          <P ko="입니다. **확장 칼만 필터**(EKF)는 이 곡선을 지금 예측한 위치 $p^-$ 근처에서 직선으로 바꿔 씁니다. 기울기, 곧 **야코비안**(Jacobian)은 2장의 가우스-뉴턴에서 썼던 것과 같은 '앵커에서 드론을 향하는 단위벡터'입니다."
            en="The **extended Kalman filter** (EKF) replaces this curve by a straight line near the predicted position $p^-$. The slope — the **Jacobian** — is the same 'unit vector from the anchor towards the drone' used for Gauss–Newton in chapter 2." />
          <M block tex={String.raw`H_i = \frac{\partial h_i}{\partial x}\bigg|_{x^-} = \begin{bmatrix} \dfrac{(p^- - a_i)\T}{\norm{p^- - a_i}} & 0 & 0 & 0 \end{bmatrix},\qquad \nu_i = z_i - h_i(x^-)`} />
          <P ko="혁신은 $z - Hx^-$ 대신 $z - h(x^-)$ 로 구하고, 나머지 줄($S$, $K$, $\hat x$, $P$)은 그대로입니다. Crazyflie 펌웨어 문서의 TWR 측정 모델이 바로 이 꼴입니다{{lit:cf-firmware-docs/twr-measurement-model}}. TDoA 는 $h_{ij} = \|p - a_j\| - \|p - a_i\|$ 이고 야코비안은 두 단위벡터의 차입니다{{lit:cf-firmware-docs/tdoa-measurement-model}}. 직선으로 바꾼 것이므로, 위치 추정 오차가 앵커까지의 거리에 비해 작을 때 잘 맞습니다."
            en="The innovation is $z - h(x^-)$ instead of $z - Hx^-$; the remaining lines ($S$, $K$, $\hat x$, $P$) are unchanged. The TWR measurement model in the Crazyflie firmware documentation has exactly this form{{lit:cf-firmware-docs/twr-measurement-model}}. For TDoA, $h_{ij} = \|p - a_j\| - \|p - a_i\|$ and the Jacobian is the difference of two unit vectors{{lit:cf-firmware-docs/tdoa-measurement-model}}. Being a linearisation, it is accurate while the position error is small compared with the distance to the anchors." />
        </Derivation>
        <Derivation id="tight-loose" title={{ ko: '거리 단위(tight)와 위치 단위(loose): 같은 정보, 다른 순서', en: 'Range level (tight) and position level (loose): same information, different order' }}>
          <P ko="UWB 측정 한 바퀴(앵커 또는 앵커 쌍 $m$ 개)를 필터에 넣는 방법은 두 가지입니다."
            en="There are two ways to feed one round of UWB measurements ($m$ anchors or anchor pairs) into the filter." />
          <List items={[
            { ko: '**거리 단위 융합**(tightly coupled, 줄여서 tight): 거리(차) 하나하나를 위의 $h_i$, $H_i$ 로 **하나씩** 갱신합니다. 측정이 스칼라라 $S$ 도 숫자 하나이고 역행렬이 필요 없습니다.', en: '**Range-level fusion** (tightly coupled, "tight"): each range (difference) is used for an update **one at a time**, with $h_i$ and $H_i$ above. The measurement is a scalar, so $S$ is a single number and no matrix inverse is needed.' },
            { ko: '**위치 단위 융합**(loosely coupled, 줄여서 loose): 먼저 그 바퀴의 측정을 모아 2장의 가우스-뉴턴으로 위치 $p_{\\text{uwb}}$ 를 풉니다. 그다음 그 위치를 "위치 측정"으로 넣습니다: $z = p_{\\text{uwb}}$, $H = [I\\ \\ 0]$, $R_p = \\sigma^2(J^{\\mathsf T}J)^{-1}$. $J$ 는 $H_i$ 의 위치 부분을 쌓은 $m \\times 3$ 행렬, 곧 2장의 야코비안 $J$ 이고, $R_p$ 는 2장에서 DOP 를 만든 바로 그 행렬입니다.', en: '**Position-level fusion** (loosely coupled, "loose"): first collect the measurements of the round and solve for a position $p_{\\text{uwb}}$ with Gauss–Newton (ch. 2). Then feed that position in as a "position measurement": $z = p_{\\text{uwb}}$, $H = [I\\ \\ 0]$, $R_p = \\sigma^2(J^{\\mathsf T}J)^{-1}$. $J$ is the $m \\times 3$ matrix stacking the position parts of the $H_i$ — the Jacobian $J$ of chapter 2 — and $R_p$ is the very matrix that produced the DOP in chapter 2.' },
          ]} />
          <P ko="측정이 모두 멀쩡하면 둘은 같은 결과를 냅니다. 이유를 보려면 '다섯 줄'의 ① 로 돌아갑니다. 섞은 뒤의 분산 $P = P^-R/(P^- + R)$ 을 뒤집으면"
            en="When every measurement is sound, the two give the same result. To see why, go back to ① of the five lines. Inverting the blended variance $P = P^-R/(P^- + R)$ gives" />
          <M block tex={String.raw`\frac1P = \frac{P^- + R}{P^-R} = \frac{1}{P^-} + \frac1R \qquad\xrightarrow{\tx{행렬}{matrices}}\qquad P^{-1} = (P^-)^{-1} + H\T R^{-1} H`} />
          <P ko="입니다. **분산의 역수를 '정보'라고 부르면, 갱신은 정보를 더하는 일입니다.** 행렬에서도 같은 꼴이 성립하고(증명 생략), 측정 하나가 보태는 정보가 $H^{\mathsf T}R^{-1}H$ 입니다. 측정을 하나씩 넣으면 정보가 하나씩 더해지므로"
            en="**Call the inverse of a variance 'information': an update adds information.** The same form holds for matrices (proof omitted), and one measurement adds the information $H^{\mathsf T}R^{-1}H$. Feeding measurements one at a time adds them one by one, so" />
          <M block tex={String.raw`\underbrace{\sum_{i=1}^{m} \frac{H_i\T H_i}{\sigma^2}}_{\tx{tight: 하나씩 더한 것}{tight: added one by one}} \;=\; \frac{J\T J}{\sigma^2} \;=\; \underbrace{R_p^{-1}}_{\tx{loose: 위치 하나}{loose: one position}}`} />
          <P ko="이기 때문입니다(위치 성분만 적었습니다). 차이는 **측정이 멀쩡하지 않을 때** 드러납니다."
            en="(position part only). The difference shows **when measurements are not sound**." />
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th></th><th>{tr({ ko: '거리 단위 (tight)', en: 'Range level (tight)' })}</th><th>{tr({ ko: '위치 단위 (loose)', en: 'Position level (loose)' })}</th></tr></thead>
              <tbody>
                <tr><td><b>{tr({ ko: '쓸 수 있는 측정이 모자랄 때', en: 'Too few usable measurements' })}</b></td>
                  <td><T ko="거리 하나만 있어도 그 방향의 불확실성을 줄인다. 나머지 방향은 IMU 예측이 메운다" en="even a single range shrinks the uncertainty along its direction; the prediction from the IMU covers the rest" /></td>
                  <td><T ko="위치를 풀 수 있는 한 벌이 있어야 한다(TWR 로 3차원이면 이론상 앵커 4개{{lit:lps-docs/twr-min-anchors}}). 모자라면 그 바퀴 전체를 못 쓴다" en="needs a full solvable set (four anchors in theory for 3-D TWR{{lit:lps-docs/twr-min-anchors}}); otherwise the whole round is unusable" /></td></tr>
                <tr><td><b>{tr({ ko: '이상치 하나가 섞였을 때', en: 'One outlier in the round' })}</b></td>
                  <td><T ko="4장의 게이트($\nu^2/S$)로 **그 거리 하나만** 버린다" en="the gate of ch. 4 ($\nu^2/S$) drops **that one range** only" /></td>
                  <td><T ko="나쁜 거리 하나가 위치 전체를 끌고 간다. 게이트는 **위치를 통째로** 버릴 수밖에 없어 멀쩡한 거리까지 잃는다" en="one bad range drags the whole position; the gate can only drop **the entire fix**, losing the good ranges with it" /></td></tr>
                <tr><td><b>{tr({ ko: '구조', en: 'Structure' })}</b></td>
                  <td><T ko="필터가 앵커 좌표와 측정 모델을 알아야 한다" en="the filter must know the anchor coordinates and the measurement model" /></td>
                  <td><T ko="단순하고, 위치를 주는 장치라면 무엇이든 끼울 수 있다(모션캡처 등)" en="simple, and any device that outputs a position plugs in (motion capture, …)" /></td></tr>
              </tbody>
            </table>
          </div>
          <P ko="Crazyflie 의 온보드 필터는 거리와 거리차의 측정 모델을 필터 안에 두고 있습니다{{lit:cf-firmware-docs/twr-measurement-model}}{{lit:cf-firmware-docs/tdoa-measurement-model}}. 즉 거리 단위 융합 쪽입니다."
            en="The onboard filter of the Crazyflie keeps the range and range-difference measurement models inside the filter{{lit:cf-firmware-docs/twr-measurement-model}}{{lit:cf-firmware-docs/tdoa-measurement-model}} — it is on the range-level side." />
        </Derivation>
        <Predict id="ch5-tight-loose"
          question={{ ko: `앵커 ${cfg.anchors.length}개 중 일부가 사람이나 기체에 가려 NLOS 확률이 30%{{ex}} 로 올랐습니다. 게이트는 둘 다 3σ{{ex}} 로 설정합니다. 어느 쪽이 더 잘 버틸까요?`, en: `Some of the ${cfg.anchors.length} anchors are blocked by people or other vehicles and the NLOS probability rises to 30%{{ex}}. Both gates are set to 3σ{{ex}}. Which copes better?` }}
          choices={[
            { label: { ko: '위치 단위(loose) — 위치를 먼저 풀면서 나쁜 거리가 평균되어 묻힌다', en: 'Position level (loose) — solving the position first averages the bad ranges out' } },
            { label: { ko: '거리 단위(tight) — 나쁜 거리만 골라 버리고 나머지는 쓴다', en: 'Range level (tight) — it discards only the bad ranges and keeps the rest' }, correct: true },
            { label: { ko: '같다 — 같은 측정을 쓰니 정보량이 같다', en: 'The same — same measurements, same information' } },
          ]}
          explain={{
            ko: `**거리 단위(tight)** 입니다. 앵커가 여러 개이면 한 바퀴 안에 나쁜 거리가 하나라도 섞일 확률은 훨씬 높습니다. TWR 처럼 측정 8개가 서로 독립으로 각각 30% 확률로 나쁘다면, 8개 모두 멀쩡할 확률은 $(1 - 0.3)^8 \\approx$ 6%{{der:ch5#tight-loose|0.7⁸ ≈ 0.058|0.7⁸ ≈ 0.058}} 뿐입니다. TDoA 에서는 측정 하나에 앵커가 둘 들어가 $(1 - 0.3)^{16} \\approx$ 0.3%{{der:ch5#tight-loose|0.7¹⁶ ≈ 0.0033 (쌍마다 앵커 둘이 각각 NLOS 가 될 수 있음)|0.7¹⁶ ≈ 0.0033 (both anchors of each pair can be NLOS)}} 로 더 낮습니다. 위치 단위 융합은 거의 모든 바퀴에서 오염된 위치를 받거나, 통째로 버려야 합니다. 거리 단위 융합은 나쁜 것만 버리고 남은 거리로 계속 고칩니다. 아래 데모에서 "NLOS 를 30% 로"를 누르고 두 방식을 번갈아 보세요.`,
            en: `**Range level (tight).** With several anchors, the chance that at least one range in a round is bad is much higher. If each of 8 independent measurements (as in TWR) is bad with probability 30%, all 8 are sound only $(1 - 0.3)^8 \\approx$ 6%{{der:ch5#tight-loose|0.7⁸ ≈ 0.058|0.7⁸ ≈ 0.058}} of the time; in TDoA each measurement involves two anchors, giving $(1 - 0.3)^{16} \\approx$ 0.3%{{der:ch5#tight-loose|0.7¹⁶ ≈ 0.0033 (쌍마다 앵커 둘이 각각 NLOS 가 될 수 있음)|0.7¹⁶ ≈ 0.0033 (both anchors of each pair can be NLOS)}}. Position-level fusion receives a contaminated fix in nearly every round, or must drop it whole. Range-level fusion drops just the bad ones and keeps correcting with the rest. Press "NLOS to 30%" in the demo below and switch between the two.`,
          }} />
        <FusionDemo />
        <P ko={`위 데모에서 NLOS 를 0 으로 두면 두 방식의 RMSE 는 거의 같습니다 — 유도에서 본 대로 정보량이 같기 때문입니다. NLOS 를 올리면 게이트를 켠 거리 단위 융합만 천천히 나빠집니다. 지금 모드는 **${modeName}** 입니다. TWR 로 바꾸면 한 바퀴의 측정 수와 기하가 달라져 숫자는 바뀌지만 순서는 같습니다.`}
          en={`With NLOS at 0 in the demo above the two RMSE values are nearly equal — the information is the same, as derived. Raise NLOS and only the gated range-level fusion degrades gently. The current mode is **${modeName}**; switching to TWR changes the number of measurements per round and the geometry, so the numbers change, but the ranking does not.`} />
      </Section>

      <Section id="delayed" title={{ ko: '늦게 도착한 측정', en: 'Measurements that arrive late' }}>
        <P ko="지금까지는 측정이 재는 순간 바로 필터에 들어온다고 했습니다. 실제로는 계산과 전송을 거치느라 조금 늦게 도착합니다. 위치를 기체 밖에서 구해 무선으로 올려 보내는 구조에서 특히 그렇습니다. Crazyswarm 은 모션캡처로 구한 위치를 10 ms 마다 방송했고{{lit:crazyswarm2017/mocap-by-radio}}, 측정에서 기체까지의 전체 지연은 49대를 띄웠을 때 약 26 ms{{lit:crazyswarm2017/latency}} 였습니다(군집 크기에 따라 달라짐). 지상 PC 에서 로그를 모아 융합하거나 분석할 때(7·9장)도 같은 문제가 생깁니다."
          en="So far a measurement entered the filter the instant it was taken. In reality computation and transmission make it arrive a little late — especially when the position is computed off-board and sent up by radio. Crazyswarm broadcast motion-capture positions every 10 ms{{lit:crazyswarm2017/mocap-by-radio}} and the total latency from measurement to vehicle was about 26 ms{{lit:crazyswarm2017/latency}} with 49 vehicles (it depends on the swarm size). The same issue appears when logs are collected and fused or analysed on the ground PC (ch. 7 and 9)." />
        <Derivation id="delayed" title={{ ko: '늦은 측정이 만드는 편향과, 버퍼 후 재전파', en: 'The bias from late measurements, and buffer-then-re-propagate' }}>
          <P ko="측정이 시각 $t_m$ 에 재어졌고 $\tau$ 초 뒤인 $t = t_m + \tau$ 에 도착했다고 합시다. 측정에 담긴 것은 $p(t_m)$ 입니다. 이것을 **지금의** 위치 $p(t)$ 를 잰 것처럼 넣으면, 속도 $v$ 로 움직이는 동안"
            en="Let a measurement be taken at time $t_m$ and arrive $\tau$ seconds later, at $t = t_m + \tau$. What it contains is $p(t_m)$. Fusing it as if it measured the **current** position $p(t)$, while moving at speed $v$," />
          <M block tex={String.raw`z \approx p(t_m) = p(t - \tau) = p(t) - v\,\tau \quad\Longrightarrow\quad \hat p(t) \;\to\; p(t) - v\,\tau`} />
          <P ko="입니다. 필터는 '$\tau$ 초 전의 드론'을 충실히 따라가므로 추정이 항상 $v\tau$ 만큼 **뒤에** 있습니다. 모든 측정에 똑같이 들어 있는 오차라 평균해도 줄지 않습니다. 예: $v$ = 1 m/s{{ex:vehicle.vMax}}, $\tau$ = 26 ms{{lit:crazyswarm2017/latency}}(49대일 때) 이면 2.6 cm{{der:ch5#delayed|1 m/s × 0.026 s|1 m/s × 0.026 s}} 입니다."
            en="The filter faithfully tracks 'the drone of $\tau$ seconds ago', so the estimate is always $v\tau$ **behind**. The error is the same in every measurement, so averaging does not reduce it. Example: $v$ = 1 m/s{{ex:vehicle.vMax}} and $\tau$ = 26 ms{{lit:crazyswarm2017/latency}} (with 49 vehicles) give 2.6 cm{{der:ch5#delayed|1 m/s × 0.026 s|1 m/s × 0.026 s}}." />
          <P ko="**올바른 처리**는 측정이 '언제의 것인지'를 지키는 것입니다. 타임스탬프는 받은 시각이 아니라 **잰 시각**으로 찍고, 필터는 지난 스텝들을 **버퍼**에 저장해 둡니다."
            en="**The right treatment** respects 'when' a measurement belongs. Stamp it with the time it was **taken**, not received, and let the filter keep its recent steps in a **buffer**." />
          <List ordered items={[
            { ko: '매 스텝, 갱신 전의 $(x^-, P^-)$ 와 그 스텝에서 쓴 측정(그리고 IMU 입력)을 버퍼에 저장한다.', en: 'At every step, store the pre-update $(x^-, P^-)$ and the measurements (and IMU input) used at that step.' },
            { ko: '늦은 측정이 도착하면 $t_m$ 의 스텝으로 **되돌아가** 그 측정으로 갱신한다.', en: 'When a late measurement arrives, **go back** to the step of $t_m$ and apply the update there.' },
            { ko: '거기서부터 지금까지 예측을 다시 하고, 그 사이에 이미 썼던 측정도 순서대로 다시 넣는다(**재전파**). $x$ 뿐 아니라 $P$ 도 다시 계산한다.', en: 'From there, repeat the predictions up to now, re-applying in order the measurements already used in between (**re-propagation**) — recomputing $P$ as well as $x$.' },
          ]} />
          <P ko="결과는 그 측정이 제때 도착했을 때와 같아집니다. 그 대가는 계산량과 메모리입니다. 늦은 측정 하나마다 지연 길이만큼의 스텝을 다시 계산하고, 그만큼의 과거를 저장해야 합니다. 버퍼보다 오래된 측정은 버립니다. 지연이 짧고 일정하다면 측정을 $\hat v\,\tau$ 만큼 앞으로 옮겨 넣는 간단한 보정도 쓰이는데, 원리는 같습니다 — 측정이 언제의 것인지 아는 것입니다."
            en="The result is the same as if the measurement had arrived on time. The price is computation and memory: every late measurement costs as many recomputed steps as the delay is long, and that much history must be stored. Measurements older than the buffer are discarded. For a short, constant delay a simpler fix is also used — shifting the measurement forward by $\hat v\,\tau$ — and the principle is the same: know when the measurement belongs." />
        </Derivation>
        <PredictNumber id="ch5-delay-bias"
          question={{ ko: '드론이 1 m/s{{ex:vehicle.vMax}} 로 날고, 위치 측정이 50 ms{{ex}}(이 문제에서만 쓰는 값) 늦게 도착합니다. 받은 시각의 측정인 것처럼 융합하면 추정은 평균 몇 cm 틀릴까요?', en: 'A drone flies at 1 m/s{{ex:vehicle.vMax}} and position measurements arrive 50 ms{{ex}} (a value for this question only) late. If they are fused as if measured on arrival, how many cm off is the estimate on average?' }}
          min={0} max={20} step={0.5} unit="cm" actual={5} actualSrc={der('ch5#delayed', { ko: 'v·τ = 1 m/s × 0.05 s', en: 'v·τ = 1 m/s × 0.05 s' })} tolerance={0.2}
          explain={{
            ko: '답은 $v\\tau$ 입니다. 측정 노이즈가 얼마든, 필터를 어떻게 튜닝하든 상관없습니다. 5 cm 는 작아 보이지만, 방금 본 융합 뒤의 무작위 오차와 같은 자릿수입니다. 그리고 무작위 오차와 달리 **두 드론이 서로 다가올 때 같은 방향으로 더해집니다.** 각 드론의 추정이 ‘가는 방향의 뒤쪽’으로 $v\\tau$ 씩 틀리므로, 마주 오는 둘은 실제로는 추정보다 $2v\\tau$ 더 가까이 있습니다.',
            en: 'The answer is $v\\tau$ — whatever the measurement noise and however the filter is tuned. 5 cm looks small, but it is of the same order as the random error after fusion that we just saw. And unlike random error, **it adds up in the same direction when two drones approach each other**: each estimate is $v\\tau$ behind its direction of travel, so two drones flying towards each other are really $2v\\tau$ closer than estimated.',
          }} />
        <DelayPitfall />
        <CodeTask task={kfDelayedTask} />
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 5,
  title: { ko: 'UWB + IMU 융합', en: 'UWB + IMU fusion' },
  lead: { ko: 'UWB 는 떨리고 IMU 는 흘러갑니다. 칼만 필터로 둘을 합치면 오차가 얼마나 줄어드는지, 그리고 Q·R 튜닝과 늦게 도착한 측정이 그 결과를 어떻게 망치는지 봅니다.', en: 'UWB jitters and the IMU drifts. See how much a Kalman filter that combines them reduces the error — and how Q/R tuning and late measurements can spoil the result.' },
  objectives: [
    { ko: '칼만 필터의 예측·갱신 다섯 식을 공분산, 혁신, 이득의 뜻과 함께 설명하고 1차원 필터를 구현한다.', en: 'Explain the five predict/update equations of the Kalman filter with the meaning of covariance, innovation and gain, and implement a 1-D filter.' },
    { ko: 'Q·R 을 잘못 잡았을 때의 증상(뒤처짐, 노이즈 추종, 과신)을 NIS 로 진단하고, 정상상태 σ 로 융합 뒤 오차를 계산한다.', en: 'Diagnose mistuned Q and R (lag, noise-following, over-confidence) with the NIS, and compute the post-fusion error from the steady-state σ.' },
    { ko: '거리 단위·위치 단위 융합의 차이와, 늦게 도착한 측정을 버퍼 후 재전파로 처리하는 이유를 설명한다.', en: 'Explain the difference between range-level and position-level fusion, and why late measurements are handled by buffering and re-propagating.' },
  ],
  Body,
  budget: {
    items: ['est-sigma'],
    note: {
      ko: '이 장은 예산에 **융합 뒤 위치 추정 오차** $\\sigma_{\\text{est}}$ 를 더합니다. UWB 위치 한 번의 오차(2·4장)와 갱신율(3장), 가속도 노이즈 {{cfg:estimation.accelNoise}} 를 정상상태 식에 넣은 값이고(수평은 두 축에 똑같이 나눠 축마다 계산), 무작위 오차이므로 8장에서 제곱합으로 더해집니다. **주의:** 이 값은 측정 오차가 매번 독립(백색)이라고 가정한 것입니다. NLOS 편향이나 앵커 좌표 오차처럼 변하지 않는 부분은 필터가 줄이지 못하므로 여기에 들어 있지 않습니다. 그 몫은 6장(앵커 편향)과 9장(실측값)에서 더합니다. 이 숫자만 보고 "몇 cm 로 날 수 있다"고 읽으면 안 됩니다.',
      en: 'This chapter adds the **position estimate error after fusion**, $\\sigma_{\\text{est}}$. It is the steady-state formula (the horizontal error split equally over its two axes, computed per axis) fed with the single-fix UWB error (ch. 2 and 4), the update rate (ch. 3) and the acceleration noise {{cfg:estimation.accelNoise}}; being random, it is added in quadrature in chapter 8. **Caution:** it assumes measurement errors are independent from sample to sample (white). Parts that do not change — NLOS bias, anchor survey error — cannot be reduced by the filter and are not included here. Chapter 6 (anchor bias) and chapter 9 (measured values) add them. Do not read this number alone as "we can fly to within a few cm".',
    },
  },
  summary: [
    { ko: '칼만 필터는 예측($P$ 가 커짐)과 갱신($P$ 가 줄어듦)을 되풀이하며, 혁신 $\\nu$ 중 이득 $K = P^-H^{\\mathsf T}/S$ 만큼만 받아들인다. IMU 는 예측을, UWB 는 갱신을 맡는다.', en: 'A Kalman filter alternates prediction ($P$ grows) and update ($P$ shrinks), accepting the fraction $K = P^-H^{\\mathsf T}/S$ of the innovation $\\nu$. The IMU drives the prediction, UWB the update.' },
    { ko: 'Q 가 너무 작으면 매끈하지만 뒤처지고 과신하며, 너무 크면 노이즈를 따라간다. 평균 NIS 가 1 인지로 점검한다. 정상상태 σ 는 백색 노이즈 가정의 값이라 편향은 따로 더해야 한다.', en: 'Q too small: smooth, lagging and over-confident; too large: follows the noise. Check with a mean NIS of 1. The steady-state σ assumes white noise, so biases must be added separately.' },
    { ko: '거리 단위 융합은 측정이 모자라거나 일부가 나빠도 버티고, 늦게 도착한 측정은 잰 시각으로 되돌아가 갱신한 뒤 재전파해야 $v\\tau$ 의 편향이 생기지 않는다.', en: 'Range-level fusion survives missing or bad measurements, and a late measurement must be applied at its own time and re-propagated, or a bias of $v\\tau$ appears.' },
  ],
  next: { ko: '이 장의 필터는 교재 안의 단순한 모델이었습니다. 실제 Crazyflie 에서는 이 필터가 **어디에서** 돌까요 — 기체 안일까요, 지상 PC 일까요? 앵커 좌표는 누가 어디에 넣고, 그것을 몇 cm 잘못 넣으면 무슨 일이 생길까요?', en: 'The filter of this chapter was a simple model inside the textbook. On a real Crazyflie, **where** does it run — on the vehicle or on the ground PC? Who enters the anchor coordinates and where, and what happens if they are a few centimetres off?' },
  tasks,
};
export default def;
