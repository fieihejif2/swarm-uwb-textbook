/** 9장의 실험 카드들: 수식↔코드↔그래프 연동, 몬테카를로("표본이 몇 개 필요한가"), 함정 실험실 두 개. */
import { useMemo, useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { config } from '../../app/store';
import {
  detrendSeries, effectiveN, predictStatic, rawSigmaWithDrift, sigmaRelStdErr, synthDriftSeries, synthTwoClock, triangularPdf,
} from '../../sim/ch9_measure';
import { column, fitLatencyLog, parseCsv, synthLatencyLog } from '../../sim/logfit';
import { mean, normPdf, std } from '../../sim/stats';
import { der, ex } from '../../sources';
import {
  Button, Caption, CodeView, Demo, Histogram, LineChart, LinkGroup, M, McPanel, P, Pitfall, Slider, Stat, StatRow, Status, useDebounced,
} from '../../ui';
import { fitLogTask } from './tasks';

const LOCAL = { ko: '이 실험에서만 바꾸는 값', en: 'Local to this experiment' };

/** 수식 ↔ 코드 ↔ 그래프: 지연·손실 추정식과 σ 추정식 */
export function EstimatorLink() {
  const cfg = config.value;
  const [seed, setSeed] = useState(21);
  const [driftMm, setDriftMm] = useState(1);
  const lat = useMemo(() => {
    const tbl = parseCsv(synthLatencyLog(cfg, 1200, seed));
    const ts = column(tbl, 't_send')!, trv = column(tbl, 't_recv')!;
    return { fit: fitLatencyLog(tbl), d: ts.map((s, i) => ((trv[i] - s) / 2) * 1000) };
  }, [cfg, seed]);
  const sigTrue = useMemo(() => predictStatic(cfg, [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height]).staticH / Math.SQRT2, [cfg]);
  const stat = useMemo(() => {
    const s = synthDriftSeries({ sigma: sigTrue, drift: driftMm / 1000, rate: 10, duration: 60, seed: seed + 7 });
    const det = detrendSeries(s.t, s.x);
    return { t: s.t, x: s.x.map((v) => v * 100), trend: det.trend.map((v) => v * 100), resid: det.resid.map((v) => v * 100), sigma: std(det.resid) * 100, raw: std(s.x) * 100 };
  }, [sigTrue, driftMm, seed]);
  const mu = cfg.comm.delayMean * 1000, J = cfg.comm.delayJitter * 1000;
  const SIM_D = der('ch9#latency-fit', { ko: '지금 전역 설정의 지연·손실 모델로 만든 합성 왕복 로그(핑 1200개)에 아래 추정식을 적용한 결과', en: 'The estimators below applied to a synthetic round-trip log (1200 pings) generated from the delay and loss model in the current global settings' });
  const SIM_S = der('ch9#sigma-fit', { ko: '참 σ 와 드리프트를 알고 만든 합성 정지 로그(10 Hz, 60 s)에 아래 추정식을 적용한 결과', en: 'The estimators below applied to a synthetic static log (10 Hz, 60 s) with known σ and drift' });
  return (
    <LinkGroup>
      <Demo title={{ ko: '추정식이 코드와 그래프의 어디에 있나', en: 'Where the estimators live in the code and the charts' }} testId="ch9-link-demo">
        <P ko="아래 식의 항을 가리키면, 손코딩 과제의 기준 구현에서 그 항을 계산하는 줄과 그래프의 기준선이 함께 강조됩니다. 데이터는 지금 전역 설정으로 만든 **합성 로그**입니다."
          en="Point at a term of the formulas and the line of the reference implementation that computes it lights up together with the reference line in the chart. The data is a **synthetic log** generated from the current global settings." />
        <M block tex={String.raw`\hat\tau_i = \lk{half}{\tfrac{1}{2}}\,\lk{rtt}{\big(t^{\text{recv}}_i - t^{\text{send}}_i\big)},\qquad \lk{mean}{\bar\tau = \tfrac{1}{n}\textstyle\sum_i \hat\tau_i},\qquad \lk{p95}{\tau_{95} = Q_{0.95}(\hat\tau)}`} />
        <M block tex={String.raw`\lk{lost}{\hat p_{\text{loss}} = \frac{N_{\text{sent}} - n}{N_{\text{sent}}}},\qquad \lk{sent}{N_{\text{sent}} = k_{\text{last}} - k_{\text{first}} + 1}`} />
        <M block tex={String.raw`\lk{trend}{r_i = x_i - (\hat a + \hat b\,t_i)},\qquad \lk{sigma}{\hat\sigma = \sqrt{\tfrac{1}{n-1}\textstyle\sum_i r_i^2}}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 코드 줄과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines and chart lines.' })}</p>
        <div class="controls">
          <Slider label={{ ko: '정지 로그에 넣을 드리프트', en: 'Drift put into the static log' }} value={driftMm} min={0} max={3} step={0.1} unit="mm/s" onChange={setDriftMm} src={ex(undefined, LOCAL)} testId="ch9-link-drift" />
        </div>
        <div class="btn-row" style={{ marginBottom: '8px' }}>
          <Button onClick={() => setSeed(seed + 1)} testId="ch9-link-reseed">{tr({ ko: '다른 표본으로 다시', en: 'Draw another sample' })}</Button>
        </div>
        <div class="grid-2">
          <Histogram
            title={{ ko: '편도 지연 추정값의 분포', en: 'Distribution of the one-way delay estimates' }}
            values={lat.d} bins={30} range={[Math.max(0, mu - J - 1), mu + J + 1]} xLabel={{ ko: '편도 지연 [ms]', en: 'One-way delay [ms]' }} slot={1} src={SIM_D}
            theory={{ name: { ko: '이론: 두 편도 지연의 평균(삼각분포)', en: 'Theory: mean of two one-way delays (triangular)' }, pdf: (x) => triangularPdf(x, mu, J) }}
            refLines={[
              { x: lat.fit.delayMean * 1000, label: { ko: `평균 ${fmt(lat.fit.delayMean * 1000, 3)} ms`, en: `mean ${fmt(lat.fit.delayMean * 1000, 3)} ms` }, slot: 3, link: 'mean' },
              { x: lat.fit.p95 * 1000, label: { ko: `p95 ${fmt(lat.fit.p95 * 1000, 3)} ms`, en: `p95 ${fmt(lat.fit.p95 * 1000, 3)} ms` }, slot: 2, link: 'p95' },
            ]} testId="ch9-link-hist" />
          <LineChart
            title={{ ko: '정지 로그 한 축과 맞춘 직선', en: 'One axis of the static log and the fitted line' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 [cm]', en: 'Position [cm]' }} height={220}
            series={[
              { name: { ko: '합성 로그 x', en: 'Synthetic log x' }, x: stat.t, y: stat.x, slot: 1, dash: '', width: 1.2 },
              { name: { ko: '맞춘 직선 a + b·t', en: 'Fitted line a + b·t' }, x: stat.t, y: stat.trend, slot: 2, dash: '7 4', width: 2.5, link: 'trend' },
            ]} src={SIM_S} testId="ch9-link-series" />
        </div>
        <Histogram
          title={{ ko: '직선을 뺀 잔차의 분포', en: 'Distribution of the residual after removing the line' }} values={stat.resid} bins={30} range={[-4.5 * sigTrue * 100, 4.5 * sigTrue * 100]}
          xLabel={{ ko: '잔차 [cm]', en: 'Residual [cm]' }} slot={1} height={200} src={SIM_S}
          theory={{ name: { ko: '이론: 정규분포 N(0, 참 σ²)', en: 'Theory: normal N(0, true σ²)' }, pdf: (x) => normPdf(x, 0, sigTrue * 100) }}
          refLines={[{ x: -stat.sigma, label: { ko: '−σ (추정)', en: '−σ (est.)' }, slot: 3, link: 'sigma' }, { x: stat.sigma, label: { ko: '+σ (추정)', en: '+σ (est.)' }, slot: 3, link: 'sigma' }]} />
        <StatRow>
          <Stat label={{ ko: '손실률 $\\hat p_{\\text{loss}}$', en: 'Loss rate $\\hat p_{\\text{loss}}$' }} value={lat.fit.lossRate * 100} unit="%" src={SIM_D} />
          <Stat label={{ ko: '참 σ (합성에 쓴 값)', en: 'True σ (used to generate)' }} value={sigTrue * 100} unit="cm" src={der('ch9#static-check', { ko: '지금 설정의 모델이 강당 한가운데에서 예측하는 한 축의 정지 흔들림', en: 'Per-axis parked jitter predicted at the hall centre by the model with the current settings' })} />
          <Stat label={{ ko: '추세를 뺀 $\\hat\\sigma$', en: 'Detrended $\\hat\\sigma$' }} value={stat.sigma} unit="cm" src={SIM_S} />
          <Stat label={{ ko: '그냥 잰 σ', en: 'Raw σ' }} value={stat.raw} unit="cm" src={SIM_S} status={stat.raw > 1.15 * stat.sigma ? 'warn' : undefined} />
        </StatRow>
        <CodeView code={fitLogTask.solution} links={fitLogTask.links} />
      </Demo>
    </LinkGroup>
  );
}

/** 몬테카를로: 표본 n 개로 σ 를 재면 얼마나 맞나 */
export function SigmaMc() {
  const [n, setN] = useState(50);
  const [rho, setRho] = useState(0);
  const prm = useDebounced({ n, rho }, 200);
  const nEff = effectiveN(prm.n, prm.rho);
  const se = sigmaRelStdErr(nEff);
  const TH = der('ch9#sigma-fit', { ko: '유도의 표준오차 식 1/√(2(n_eff − 1))', en: 'The standard-error formula 1/√(2(n_eff − 1)) of the derivation' });
  return (
    <>
      <div class="controls">
        <Slider label={{ ko: '로그의 표본 수 $n$', en: 'Samples in the log, $n$' }} value={n} min={10} max={1000} step={10} onChange={setN} src={ex(undefined, LOCAL)} testId="ch9-mc-n" />
        <Slider label={{ ko: '이웃 표본의 상관 $\\rho$ (0 = 서로 독립)', en: 'Neighbour correlation $\\rho$ (0 = independent)' }} value={rho} min={0} max={0.95} step={0.05} digits={2} onChange={setRho} src={ex(undefined, LOCAL)} testId="ch9-mc-rho" />
      </div>
      <StatRow>
        <Stat label={{ ko: '독립 표본으로 치면 $n_{\\text{eff}}$', en: 'Equivalent independent samples $n_{\\text{eff}}$' }} value={nEff} src={der('ch9#sigma-fit', { ko: 'n (1 − ρ²)/(1 + ρ²)', en: 'n (1 − ρ²)/(1 + ρ²)' })} />
        <Stat label={{ ko: '이론: $\\hat\\sigma$ 의 상대 표준오차', en: 'Theory: relative standard error of $\\hat\\sigma$' }} value={se * 100} unit="%" src={TH} status={se > 0.1 ? 'warn' : 'good'} />
      </StatRow>
      <McPanel
        key={`${prm.n}-${prm.rho}`}
        title={{ ko: '같은 실험을 되풀이하면 $\\hat\\sigma$ 는 얼마나 들쭉날쭉한가', en: 'How much $\\hat\\sigma$ scatters when the same experiment is repeated' }}
        experiment="ch9-sigma" metric="ratio" params={prm} testId="ch9-mc" defaultRuns={1000}
        xLabel={{ ko: '추정한 σ ÷ 참 σ', en: 'Estimated σ ÷ true σ' }} range={[Math.max(0, 1 - 4.5 * se), 1 + 4.5 * se]}
        refLines={[
          { x: 1, label: { ko: '참값', en: 'truth' }, slot: 3 },
          { x: 1 - se, label: { ko: '−표준오차', en: '−1 s.e.' }, slot: 2 },
          { x: 1 + se, label: { ko: '+표준오차 (이론)', en: '+1 s.e. (theory)' }, slot: 2 },
        ]}
        src={der('ch9#sigma-fit', { ko: '참 σ = 1 인 정규 표본 n 개(이웃 상관 ρ)를 뽑아 σ 를 추정하기를 되풀이한 결과', en: 'Repeatedly drawing n Gaussian samples (neighbour correlation ρ) with true σ = 1 and estimating σ' })}
        note={{ ko: '한 번의 "돌리기"가 로그 하나를 기록하는 일에 해당합니다. 막대의 폭이 곧 여러분이 잰 σ 를 믿을 수 있는 정도입니다. 슬라이더를 바꾸면 결과가 지워지니 다시 돌리세요.', en: 'Each run stands for recording one log. The width of the bars is how far you can trust a σ you measured. Changing a slider clears the result; run again.' }}>
        {(results) => {
          const r = results.map((x) => x.ratio);
          const within = r.filter((v) => Math.abs(v - 1) <= 0.1).length / r.length;
          const SIM = der('ch9#sigma-fit', { ko: '위 히스토그램의 반복 결과에서 계산', en: 'Computed from the runs in the histogram above' });
          return (
            <StatRow>
              <Stat label={{ ko: '시뮬레이션: (추정 σ)/(참 σ) 의 표준편차', en: 'Simulation: standard deviation of (estimated σ)/(true σ)' }} value={std(r) * 100} unit="%" src={SIM} />
              <Stat label={{ ko: '이론: 상대 표준오차', en: 'Theory: relative standard error' }} value={se * 100} unit="%" src={TH} />
              <Stat label={{ ko: '참값의 ±10 % 안에 든 비율', en: 'Share within ±10 % of the truth' }} value={within * 100} unit="%" src={SIM} />
              <Stat label={{ ko: '(추정 σ)/(참 σ) 의 평균', en: 'Mean of (estimated σ)/(true σ)' }} value={mean(r)} src={SIM} />
            </StatRow>
          );
        }}
      </McPanel>
    </>
  );
}

/** 함정: 서로 다른 시계의 타임스탬프를 그대로 빼기 */
export function ClockPitfall() {
  const cfg = config.value;
  const [offMs, setOffMs] = useState(-45);
  const [ppm, setPpm] = useState(40);
  const prm = useDebounced({ offMs, ppm }, 120);
  const N = 1200, RATE = 10;
  const sim = useMemo(() => synthTwoClock({ n: N, rate: RATE, delayMean: cfg.comm.delayMean, delayJitter: cfg.comm.delayJitter, offset: prm.offMs / 1000, driftPpm: prm.ppm, seed: 5 }), [cfg.comm.delayMean, cfg.comm.delayJitter, prm]);
  const naive = sim.naive.map((v) => v * 1000), half = sim.halfRtt.map((v) => v * 1000);
  const truth = mean(sim.trueOneWay) * 1000;
  const expected = sim.tSend.map((t) => cfg.comm.delayMean * 1000 + prm.offMs + prm.ppm * 1e-3 * t);
  const nNeg = naive.filter((v) => v < 0).length;
  const SIM = der('ch9#clock-offset', { ko: '지금 전역 설정의 통신 지연으로 핑 1200개(10 Hz, 120 s)를 주고받는 과정을 시뮬레이션한 결과', en: 'Simulation of 1200 pings (10 Hz, 120 s) with the comm delay of the current global settings' });
  const span = Math.max(Math.abs(Math.min(...naive)), Math.abs(Math.max(...naive)), 2 * (cfg.comm.delayMean + cfg.comm.delayJitter) * 1000) * 1.15;
  return (
    <Pitfall title={{ ko: '서로 다른 시계의 타임스탬프를 그대로 빼기', en: 'Subtracting timestamps taken on two different clocks' }} testId="ch9-pitfall">
      <P ko="'보낸 시각은 PC 로그에 있고 받은 시각은 기체 로그에 있으니, 둘을 빼면 편도 지연이다.' 가장 흔한 실수입니다. 기체의 시계는 전원을 켠 순간부터 세고 PC 의 시계는 전혀 다른 기준에서 세므로, 두 시계 사이에는 알 수 없는 **오프셋**이 있고 진동자가 달라 조금씩 **벌어지기까지** 합니다. 아래에서 오프셋과 벌어지는 속도를 바꿔 보세요. (5장의 '수신 시각으로 타임스탬프 찍기' 함정과 짝을 이룹니다. 거기서는 시각을 **어느 순간**에 찍느냐가, 여기서는 **어느 시계**로 찍느냐가 문제입니다.)"
        en="'The send time is in the PC log and the receive time in the vehicle log, so their difference is the one-way delay.' The most common mistake. The vehicle clock counts from power-up and the PC clock from a completely different origin, so there is an unknown **offset** between them, and with different oscillators they even **drift apart**. Change the offset and the drift below. (This pairs with the 'stamping at reception' trap of chapter 5: there the issue is **at which instant** you stamp, here **with which clock**.)" />
      <div class="controls">
        <Slider label={{ ko: '기체 시계가 PC 시계보다 앞선 양 (오프셋)', en: 'Vehicle clock ahead of the PC clock (offset)' }} value={offMs} min={-300} max={300} step={5} unit="ms" onChange={setOffMs} src={ex(undefined, LOCAL)} testId="ch9-pitfall-offset" />
        <Slider label={{ ko: '두 시계가 벌어지는 속도', en: 'Rate at which the clocks drift apart' }} value={ppm} min={0} max={200} step={5} unit="ppm" onChange={setPpm} src={ex(undefined, LOCAL)} testId="ch9-pitfall-ppm" />
      </div>
      <StatRow>
        <Stat label={{ ko: '참값: 편도 지연 평균', en: 'Truth: mean one-way delay' }} value={truth} unit="ms" src={SIM} />
        <Stat label={{ ko: '그대로 뺀 "편도 지연" 평균', en: 'Naive "one-way delay", mean' }} value={mean(naive)} unit="ms" src={SIM} status={Math.abs(mean(naive) - truth) > 0.2 * truth ? 'bad' : 'good'} />
        <Stat label={{ ko: '한 시계로 잰 왕복의 절반, 평균', en: 'Half the round trip on one clock, mean' }} value={mean(half)} unit="ms" src={SIM} status="good" />
        <Stat label={{ ko: '음수로 나온 "지연"의 개수', en: 'Number of negative "delays"' }} value={`${nNeg} / ${N}`} src={SIM} status={nNeg ? 'bad' : undefined} />
      </StatRow>
      <p>{nNeg > 0
        ? <Status kind="bad">{tr({ ko: '지연이 음수입니다: 보내기도 전에 도착했다는 뜻이므로 말이 되지 않습니다', en: 'Negative delay: the packet would have arrived before it was sent, which is nonsense' })}</Status>
        : Math.abs(mean(naive) - truth) > 0.2 * truth
          ? <Status kind="bad">{tr({ ko: '음수는 아니어서 그럴듯해 보이지만, 값은 오프셋만큼 틀렸습니다. 이 경우가 더 위험합니다', en: 'Not negative, so it looks plausible — but it is off by the offset. This case is the more dangerous one' })}</Status>
          : <Status kind="warn">{tr({ ko: '오프셋이 우연히 작아 맞아 보일 뿐입니다. 시계를 다시 켜면 달라집니다', en: 'It only looks right because the offset happens to be small. Restart a clock and it changes' })}</Status>}</p>
      <LineChart
        title={{ ko: '핑마다 계산한 "편도 지연"', en: '"One-way delay" computed for each ping' }} xLabel={{ ko: '핑을 보낸 시각 [s]', en: 'Time the ping was sent [s]' }} yLabel={{ ko: '계산된 지연 [ms]', en: 'Computed delay [ms]' }} height={270}
        yDomain={[-span, span]}
        series={[
          { name: { ko: '그대로 뺀 값 (기체 시계 − PC 시계)', en: 'Naive difference (vehicle clock − PC clock)' }, x: sim.tSend, y: naive, slot: 2, dash: '', width: 1.2 },
          { name: { ko: '이론: 지연 + 오프셋 + 벌어짐·t', en: 'Theory: delay + offset + drift·t' }, x: sim.tSend, y: expected, slot: 7, dash: '7 4', width: 2.5 },
          { name: { ko: '한 시계로 잰 왕복의 절반', en: 'Half the round trip on one clock' }, x: sim.tSend, y: half, slot: 1, dash: '', width: 1.2 },
        ]}
        refLines={[{ y: truth, label: { ko: `참값 ${fmt(truth, 3)} ms`, en: `truth ${fmt(truth, 3)} ms` }, slot: 3 }, { y: 0, label: '0' }]}
        src={SIM} testId="ch9-pitfall-chart" />
      <Caption>{tr({ ko: '벌어지는 속도가 0 이 아니면 "그대로 뺀 값"의 선이 기울어집니다(점선이 그 이론값입니다). 로그를 오래 기록할수록 틀린 정도가 커진다는 뜻입니다. "왕복의 절반" 선은 오프셋과 벌어짐을 아무리 바꿔도 참값 위에 그대로 있습니다.', en: 'With a non-zero drift the "naive difference" line is tilted (the dashed line is its theoretical value): the longer you record, the more wrong it gets. The "half the round trip" line stays on the true value whatever offset and drift you choose.' })}</Caption>
      <P ko={`두 시계가 초당 얼마나 벌어지는지는 진동자의 품질에 달려 있습니다. 위 슬라이더의 ${fmt(prm.ppm)} ppm{{ex}} 이면 120 s{{ex}} 동안 ${fmt(prm.ppm * 1e-3 * 120, 3)} ms{{der:ch9#clock-offset|벌어지는 속도 × 기록 시간|drift rate × recording time}} 가 벌어집니다. 재려는 지연이 수십 ms 인데 오프셋은 수백 ms 에서 수천 초까지 얼마든지 될 수 있으므로, 시계를 맞추려 애쓰기보다 **한 시계로 왕복을 재는** 편이 훨씬 쉽고 확실합니다.`}
        en={`How fast two clocks drift apart depends on the oscillators. At the ${fmt(prm.ppm)} ppm{{ex}} of the slider they separate by ${fmt(prm.ppm * 1e-3 * 120, 3)} ms{{der:ch9#clock-offset|벌어지는 속도 × 기록 시간|drift rate × recording time}} over 120 s{{ex}}. The delay you are after is tens of ms while the offset can be anything from hundreds of ms to thousands of seconds, so rather than struggling to align clocks it is far easier and safer to **time the round trip on one clock**.`} />
    </Pitfall>
  );
}

/** 작은 함정: 드리프트가 섞인 채로 잰 σ 를 "노이즈"라고 부르기 */
export function DriftPitfall() {
  const cfg = config.value;
  const [driftMm, setDriftMm] = useState(1);
  const prm = useDebounced({ driftMm }, 120);
  const sigTrue = useMemo(() => predictStatic(cfg, [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height]).staticH / Math.SQRT2, [cfg]);
  const RATE = 10;
  const sweep = useMemo(() => {
    const full = synthDriftSeries({ sigma: sigTrue, drift: prm.driftMm / 1000, rate: RATE, duration: 300, seed: 31 });
    const T: number[] = [], raw: number[] = [], det: number[] = [], theory: number[] = [];
    for (const dur of [10, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300]) {
      const n = dur * RATE;
      const t = full.t.slice(0, n), x = full.x.slice(0, n);
      T.push(dur);
      raw.push(std(x) * 100);
      det.push(std(detrendSeries(t, x).resid) * 100);
      theory.push(rawSigmaWithDrift(sigTrue, prm.driftMm / 1000, dur) * 100);
    }
    return { T, raw, det, theory };
  }, [sigTrue, prm.driftMm]);
  const SIM = der('ch9#sigma-fit', { ko: '참 σ 와 드리프트를 알고 만든 합성 정지 로그(10 Hz)를 앞에서부터 잘라 계산한 결과', en: 'Computed on a synthetic static log (10 Hz) with known σ and drift, cut to different lengths' });
  const i60 = sweep.T.indexOf(60);
  return (
    <Pitfall title={{ ko: '드리프트가 섞인 σ 를 "노이즈"라고 부르기', en: 'Calling a σ that includes drift "noise"' }} testId="ch9-pitfall-drift">
      <P ko="정지 로그 전체에 `np.std` 를 한 번 돌리고 그 값을 측정 노이즈로 쓰는 실수입니다. 로그에 느린 드리프트가 있으면 그 값은 **기록을 오래 할수록 커집니다**. 센서의 성질이라면 기록 시간에 따라 달라질 리가 없습니다."
        en="The mistake: run `np.std` once over the whole static log and use it as the measurement noise. If the log has a slow drift, that value **grows with the recording length**. A property of the sensor could not depend on how long you recorded." />
      <Slider label={{ ko: '드리프트 (위치가 흘러가는 속도)', en: 'Drift (rate at which the position creeps)' }} value={driftMm} min={0} max={3} step={0.1} unit="mm/s" onChange={setDriftMm} src={ex(undefined, LOCAL)} testId="ch9-pitfall-drift-slider" />
      <LineChart
        title={{ ko: '기록 길이에 따른 σ', en: 'σ versus recording length' }} xLabel={{ ko: '기록 길이 T [s]', en: 'Recording length T [s]' }} yLabel={{ ko: 'σ [cm]', en: 'σ [cm]' }} height={250}
        yDomain={[0, Math.max(...sweep.raw, ...sweep.theory, sigTrue * 100) * 1.15]}
        series={[
          { name: { ko: '그냥 잰 σ (시뮬레이션)', en: 'Raw σ (simulation)' }, x: sweep.T, y: sweep.raw, slot: 2, points: true },
          { name: { ko: '이론: √(σ² + b²T²/12)', en: 'Theory: √(σ² + b²T²/12)' }, x: sweep.T, y: sweep.theory, slot: 2, dash: '7 4' },
          { name: { ko: '추세를 뺀 σ (시뮬레이션)', en: 'Detrended σ (simulation)' }, x: sweep.T, y: sweep.det, slot: 1, points: true },
        ]}
        refLines={[{ y: sigTrue * 100, label: { ko: `참 σ ${fmt(sigTrue * 100, 3)} cm`, en: `true σ ${fmt(sigTrue * 100, 3)} cm` }, slot: 3 }]}
        src={SIM} testId="ch9-pitfall-drift-chart" />
      <StatRow>
        <Stat label={{ ko: '참 σ', en: 'True σ' }} value={sigTrue * 100} unit="cm" src={der('ch9#static-check', { ko: '지금 설정의 모델이 강당 한가운데에서 예측하는 한 축의 정지 흔들림', en: 'Per-axis parked jitter predicted at the hall centre by the model with the current settings' })} />
        <Stat label={{ ko: '60 s 로그에서 그냥 잰 σ', en: 'Raw σ of a 60 s log' }} value={sweep.raw[i60]} unit="cm" src={SIM} status={sweep.raw[i60] > 1.15 * sigTrue * 100 ? 'bad' : 'good'} />
        <Stat label={{ ko: '60 s 로그에서 추세를 뺀 $\\hat\\sigma$', en: 'Detrended $\\hat\\sigma$ of a 60 s log' }} value={sweep.det[i60]} unit="cm" src={SIM} status="good" />
        <Stat label={{ ko: '60 s 동안 흘러간 거리', en: 'Distance drifted in 60 s' }} value={prm.driftMm * 6} unit="cm" src={der('ch9#sigma-fit', { ko: '드리프트 × 60 s', en: 'drift × 60 s' })} />
      </StatRow>
      <P ko="부풀려진 σ 를 설정에 넣으면 예산이 두 번 틀립니다. 무작위 오차 칸은 실제보다 커지고(필터가 걸러 줄 수 있는 것으로 계산됩니다), 정작 필터가 걸러 주지 못하는 **편향** 칸은 비어 있게 됩니다. 드리프트는 따로 적어 두고, 원인(앵커 좌표, 온도, 안테나 방향)을 찾아 없애거나 편향 항목으로 예산에 넣어야 합니다."
        en="Putting the inflated σ into the settings makes the budget wrong twice: the random-error line becomes too large (and is treated as something the filter can average out), while the **bias** line, which the filter cannot remove, stays empty. Record the drift separately, then either find and remove its cause (anchor coordinates, temperature, antenna orientation) or budget it as a bias." />
      <P class="small muted" ko="합성 로그의 표본 주기는 Crazyswarm2 의 기본 pose 로그 주기와 같은 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} 로 두었습니다."
        en="The synthetic log is sampled at 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}}, the default pose logging rate of Crazyswarm2." />
    </Pitfall>
  );
}
