import { useMemo, useState } from 'preact/hooks';
import type { ChapterDef } from '../../app/chapters';
import { fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { commHops } from '../../sim/budget';
import { StageFlags, swarmFromConfig } from '../../sim/scenario';
import { simulateSwarm } from '../../sim/swarm';
import { der, ex } from '../../sources';
import {
  Button, Caption, CfgVal, Demo, Derivation, LineChart, List, M, McPanel, Note, P, Pitfall, Predict, Section, Segmented, Slider, SrcBadge, Stat, StatRow, Status, SwarmView, T, useDebounced,
} from '../../ui';

const STAGES: { key: string; flags: StageFlags; ko: string; en: string }[] = [
  { key: 'ideal', flags: { delay: false, noise: false, loss: false }, ko: '① 완벽한 정보', en: '① Perfect information' },
  { key: 'delay', flags: { delay: true, noise: false, loss: false }, ko: '② + 지연', en: '② + delay' },
  { key: 'noise', flags: { delay: true, noise: true, loss: false }, ko: '③ + 노이즈', en: '③ + noise' },
  { key: 'loss', flags: { delay: true, noise: true, loss: true }, ko: '④ + 손실', en: '④ + loss' },
];
const SIM = der('ch0#model', { ko: '아래 "대형을 유지한다는 것"의 모델을 현재 설정값으로 시뮬레이션한 결과', en: 'Simulation of the model in "What holding a formation means" with the current settings' });
const LOCAL = { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this demo; starts from the global setting.' };

function StageDemo() {
  const cfg = config.value;
  const b = budget.value;
  const [stage, setStage] = useState(0);
  const [gain, setGain] = useState(cfg.comm.gain);
  const [delayScale, setDelayScale] = useState(1);
  const [spacing, setSpacing] = useState(cfg.formation.spacing);
  const [seed, setSeed] = useState(3);
  const prm = useDebounced({ gain, delayScale, spacing, seed }, 180);
  const local = useMemo(() => ({ ...cfg, formation: { ...cfg.formation, spacing: prm.spacing } }), [cfg, prm.spacing]);
  const runs = useMemo(
    () => STAGES.map((s) => simulateSwarm(swarmFromConfig(local, s.flags, { seed: prm.seed, gain: prm.gain, delayScale: prm.delayScale, T: 30 }))),
    [local, prm],
  );
  const cur = runs[stage];
  const baseDelay = commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0);
  const loopDelay = baseDelay * delayScale + 0.5 / cfg.comm.rate;
  const tauStar = Math.PI / (2 * gain * b.lambdaN);
  const body = cfg.vehicle.envelope;
  const LOOP = der('ch7#loop-delay', { ko: '측위 지연 + 통신 지연(지상국 중계는 2구간) + 방송 주기의 절반', en: 'Estimation delay + comm delay (two hops via the ground station) + half a broadcast period' });
  return (
    <Demo title={{ ko: '네 단계로 대형을 무너뜨려 보기', en: 'Break the formation in four steps' }} testId="ch0-stage-demo">
      <P ko="드론 5대가 대형을 유지한 채 강당 안의 원형 경로를 돕니다. 약한 돌풍이 계속 대형을 흐트러뜨리고, 제어기는 그것을 바로잡습니다. 단계를 올리면 제어기가 받는 정보가 점점 현실에 가까워집니다. 누가 누구의 위치를 쓰는지는 전역 설정의 '이웃 관계'를 따르며, 기본값은 5대가 모두 서로의 위치를 쓰는 것입니다."
        en="Five drones hold a formation while circling inside the hall. A light gust keeps disturbing them and the controller keeps correcting. Each step makes the information the controller receives more realistic. Who uses whose position follows the 'neighbour graph' of the global settings; by default all five use everyone's position." />
      <Segmented label={{ ko: '제어기가 받는 정보', en: 'Information the controller receives' }} value={stage} onChange={setStage} testId="ch0-stage"
        options={STAGES.map((s, i) => ({ value: i, label: { ko: s.ko, en: s.en } }))} />
      <p class="small muted">
        <T ko="각 단계가 더하는 것 — ② **루프 지연**(위치를 잰 순간부터 그 정보로 계산한 명령이 기체를 움직이기까지의 시간, 7장): " en="What each step adds — ② **loop delay** (time from measuring a position until the command computed from it moves the vehicle, ch. 7): " />
        <b class="num">{fmt(loopDelay * 1000, 3)} ms</b><SrcBadge src={LOOP} />
        <T ko=" · ③ 위치 노이즈(축당 1σ): " en=" · ③ position noise (1σ per axis): " /><b class="num">{fmt((b.sigmaEstH / Math.SQRT2) * 100, 3)} cm</b><SrcBadge src={der('ch5#steady-state', { ko: '융합 후 수평 추정 오차를 두 축으로 나눈 값(1~5장에서 유도)', en: 'Horizontal estimate error after fusion, split over two axes (derived in ch. 1–5)' })} />
        <T ko=" · ④ 패킷 손실률: " en=" · ④ packet loss rate: " /><b class="num">{fmt(b.lossRate * 100, 3)} %</b><SrcBadge src={der('ch7#ge-stationary', { ko: '설정의 손실 모델에서 계산한 평균 손실률', en: 'Average loss rate of the loss model in the settings' })} />
      </p>
      <div class="controls">
        <Slider label={{ ko: '대형 유지 게인 $k$', en: 'Formation gain $k$' }} value={gain} min={0.5} max={8} step={0.1} unit="1/s" onChange={setGain} src={ex('comm.gain', LOCAL)} testId="ch0-gain" />
        <Slider label={{ ko: `지연 배율 (1× = 설정값 ${fmt(baseDelay * 1000, 3)} ms)`, en: `Delay multiplier (1× = ${fmt(baseDelay * 1000, 3)} ms from settings)` }} value={delayScale} min={0} max={10} step={0.5} unit="×" onChange={setDelayScale} src={ex('comm.delayMean', { ko: '전역 설정의 통신·측위 지연에 곱하는 배율', en: 'Multiplier on the comm and estimation delays in the global settings' })} testId="ch0-delay-scale" />
        <Slider label={{ ko: '대형 간격', en: 'Formation spacing' }} value={spacing} min={0.4} max={2} step={0.05} unit="m" onChange={setSpacing} src={ex('formation.spacing', LOCAL)} testId="ch0-spacing" />
      </div>
      <div class="btn-row" style={{ marginBottom: '10px' }}>
        <Button onClick={() => { setGain(3); setDelayScale(5); setSpacing(0.6); setStage(3); }} testId="ch0-preset-hard">{tr({ ko: '빡빡한 조건으로 (간격 0.6 m, 지연 5배, 게인 3 /s)', en: 'Harsh preset (0.6 m spacing, 5× delay, gain 3 /s)' })}</Button>
        <SrcBadge src={ex(undefined, { ko: '대형이 무너지는 모습을 보여 주려고 고른 값입니다. 위 슬라이더로 바꿀 수 있습니다.', en: 'Values chosen to make the formation break; change them with the sliders above.' })} />
        <Button onClick={() => { setGain(cfg.comm.gain); setDelayScale(1); setSpacing(cfg.formation.spacing); }}>{tr({ ko: '설정값으로 되돌리기', en: 'Back to settings' })}</Button>
        <Button onClick={() => setSeed(seed + 1)}>{tr({ ko: '다른 돌풍으로 다시', en: 'Different gust' })}</Button>
      </div>
      <SwarmView result={cur} hall={cfg.hall} bodySize={body} span={Math.max(5, spacing * 6)} src={SIM} testId="ch0-swarm" />
      <Caption>
        <T ko="원의 지름은 **충돌 지름** " en="Circle diameter is the **collision diameter** " /><CfgVal path="vehicle.envelope" />
        <T ko=": 두 기체의 중심이 이 거리 안으로 들어오면 프로펠러·가드가 닿는다고 보는 값입니다." en=": if two centres come closer than this, propellers or guards are assumed to touch." />
      </Caption>
      <StatRow>
        <Stat label={{ ko: '대형 오차 (실행 뒤쪽 절반의 RMS)', en: 'Formation error (RMS over the 2nd half of the run)' }} value={cur.steadyError * 100} unit="cm" src={SIM} />
        <Stat label={{ ko: '실행 전체에서 가장 가까웠던 거리', en: 'Closest approach over the whole run' }} value={cur.minDistOverall} unit="m" src={SIM} status={cur.minDistOverall < body ? 'bad' : cur.minDistOverall < 1.5 * body ? 'warn' : 'good'} />
        <Stat label={{ ko: '루프 지연 (평균)', en: 'Loop delay (mean)' }} value={stage === 0 ? 0 : loopDelay * 1000} unit="ms" src={LOOP} />
        <Stat label={{ ko: '지연 한계 $\\tau^*$ (7장)', en: 'Delay bound $\\tau^*$ (ch. 7)' }} value={tauStar * 1000} unit="ms" src={der('ch7#delay-bound')} status={stage > 0 && cfg.comm.topology === 'ground' && loopDelay > tauStar ? 'bad' : undefined} />
      </StatRow>
      <p class="small muted">{tr({ ko: '기호의 뜻: ✓ 충돌 지름의 1.5배보다 멀다 · △ 1.5배 안쪽 · ✕ 충돌 지름 안쪽(충돌) / 루프 지연이 지연 한계를 넘음.', en: 'Symbols: ✓ farther than 1.5× the collision diameter · △ within 1.5× · ✕ inside the collision diameter (collision) / loop delay beyond the delay bound.' })}</p>
      <p>
        {cur.firstCollisionTime !== null
          ? <Status kind="bad">{tr({ ko: `충돌: ${fmt(cur.firstCollisionTime, 3)}초에 두 기체가 충돌 지름 안으로 들어왔습니다`, en: `Collision: at ${fmt(cur.firstCollisionTime, 3)} s two drones came within the collision diameter` })}</Status>
          : <Status kind="good">{tr({ ko: '이 실행에서는 충돌 없음', en: 'No collision in this run' })}</Status>}
      </p>
      <LineChart
        title={{ ko: '네 단계의 대형 오차를 겹쳐 보기', en: 'Formation error of all four steps' }}
        xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '대형 오차 [m]', en: 'Formation error [m]' }}
        series={runs.map((r, i) => ({ name: { ko: STAGES[i].ko, en: STAGES[i].en }, x: r.t, y: r.formationError, width: i === stage ? 3 : 1.5, faint: i !== stage }))}
        src={SIM} testId="ch0-error-chart" />
      <LineChart
        title={{ ko: '각 시각에 가장 가까운 두 기체 사이의 거리', en: 'Distance between the closest pair at each instant' }}
        xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '가장 가까운 두 기체의 거리 [m]', en: 'Closest-pair distance [m]' }} height={200}
        series={[{ name: { ko: STAGES[stage].ko, en: STAGES[stage].en }, x: cur.t, y: cur.minDist, slot: stage + 1 }]}
        refLines={[{ y: body, label: { ko: '충돌 지름', en: 'Collision diameter' }, slot: 8 }]} yDomain={[0, Math.max(spacing * 1.3, body * 2)]}
        src={SIM} />
    </Demo>
  );
}

function TailPitfall() {
  const cfg = config.value;
  const [spacing, setSpacing] = useState(0.6);
  const [delayScale, setDelayScale] = useState(5);
  const [gain, setGain] = useState(3);
  const ONLY = { ko: '이 실험에서만 쓰는 값. 처음 값은 위 데모의 "빡빡한 조건"과 같습니다.', en: 'Used only in this experiment; starts at the "harsh preset" of the demo above.' };
  return (
    <Pitfall title={{ ko: '한 번 날려 보고 "괜찮다"고 결론 내리기', en: 'Flying once and concluding "it works"' }} testId="ch0-pitfall">
      <P ko="위 데모에서 '다른 돌풍으로 다시'를 누르면 같은 설정인데도 가장 가까웠던 거리가 매번 달라집니다. 한 번의 비행은 주사위를 한 번 던진 것입니다. 안전은 **평균**이 아니라 **가장 나쁜 쪽 꼬리**가 정합니다. 아래에서 같은 조건의 20초 비행을 수백 번 반복해 분포를 보세요. 그래프의 가로축은 '한 번의 비행에서 가장 가까웠던 거리 [m]', 세로 점선은 충돌 지름입니다."
        en="Press 'Different gust' in the demo above and the closest approach changes every time, even with identical settings. One flight is one roll of the dice. Safety is decided not by the **average** but by the **worst tail**. Below, repeat a 20 s flight under the same condition hundreds of times and look at the distribution. The horizontal axis is 'closest approach in one flight [m]'; the dashed vertical line is the collision diameter." />
      <div class="controls">
        <Slider label={{ ko: '대형 간격', en: 'Formation spacing' }} value={spacing} min={0.4} max={2} step={0.05} unit="m" onChange={setSpacing} src={ex('formation.spacing', ONLY)} testId="ch0-mc-spacing" />
        <Slider label={{ ko: '지연 배율', en: 'Delay multiplier' }} value={delayScale} min={0} max={10} step={0.5} unit="×" onChange={setDelayScale} src={ex('comm.delayMean', ONLY)} testId="ch0-mc-delay" />
        <Slider label={{ ko: '대형 유지 게인 $k$', en: 'Formation gain $k$' }} value={gain} min={0.5} max={8} step={0.1} unit="1/s" onChange={setGain} src={ex('comm.gain', ONLY)} testId="ch0-mc-gain" />
      </div>
      <McPanel
        title={{ ko: '같은 조건으로 반복했을 때 가장 가까웠던 거리의 분포', en: 'Distribution of the closest approach over repeated flights' }}
        experiment="swarm" metric="minDist" testId="ch0-mc"
        params={{ cfg: { ...cfg, formation: { ...cfg.formation, spacing } }, stage: { delay: true, noise: true, loss: true }, opt: { T: 20, delayScale, gain } }}
        xLabel={{ ko: '한 번의 비행에서 가장 가까웠던 거리 [m]', en: 'Closest approach in one flight [m]' }}
        refLines={[{ x: cfg.vehicle.envelope, label: { ko: '충돌 지름', en: 'Collision diameter' }, slot: 8 }]}
        threshold={{ value: cfg.vehicle.envelope, label: { ko: '충돌한 비행', en: 'Flights with a collision' } }}
        note={{ ko: '지연·노이즈·손실을 모두 켠 ④ 단계입니다. 나머지 값은 전역 설정을 따릅니다.', en: 'Step ④ with delay, noise and loss all on. Everything else follows the global settings.' }} />
      <P ko="평균은 충돌 지름보다 한참 위에 있어도, 분포의 왼쪽 끝(꼬리)이 선을 넘는 비행이 섞여 있을 수 있습니다. 그래서 이 교재는 '평균 오차'가 아니라 **표준편차의 몇 배**(기본 {{cfg:safety.kSigma}}, 흔히 '3σ'라고 부릅니다)와 **가장 나쁜 경우**로 예산을 세웁니다. σ 가 낯설다면 이 장 끝의 [통계 1분 복습](#/ch/0?a=stats)을 먼저 보세요."
        en="The mean can sit well above the collision diameter while some flights at the left end (the tail) cross the line. That is why this textbook budgets not with mean errors but with **a multiple of the standard deviation** (default {{cfg:safety.kSigma}}, often called '3σ') and **worst cases**. If σ is unfamiliar, read the [one-minute statistics review](#/ch/0?a=stats) at the end of this chapter first." />
    </Pitfall>
  );
}

function Body() {
  return (
    <>
      <Section id="model" title={{ ko: '대형을 유지한다는 것', en: 'What holding a formation means' }}>
        <P ko="**대형**(formation)을 유지한다는 것은, 각 드론이 이웃과의 **상대 위치**를 정해진 값으로 맞추는 일입니다. 드론 $i$ 의 위치를 $p_i$, 대형 안에서 맡은 자리(대형 중심에서 본 오프셋)를 $c_i$ 라고 하면, 모든 드론의 $p_i - c_i$ 가 같은 값이 될 때 대형이 완성됩니다. 그 공통값이 바로 **대형 중심의 위치**입니다. 예를 들어 중심이 $(3, 2)$ 에 있고 내 자리가 $c_i = (1, 0)$ 이면 나는 $(4, 2)$ 에 있어야 합니다. 이렇게 여러 대가 하나의 값에 뜻을 모으는 문제를 **합의**(consensus)라고 부릅니다."
          en="Holding a **formation** means each drone keeps its **relative position** to its neighbours at a prescribed value. Let $p_i$ be the position of drone $i$ and $c_i$ its slot in the formation (offset from the formation centre). The formation is complete when $p_i - c_i$ is the same for every drone, and that common value is the **position of the formation centre**. For example, with the centre at $(3, 2)$ and my slot $c_i = (1, 0)$, I must be at $(4, 2)$. Getting many agents to agree on one value like this is called **consensus**." />
        <P ko="위치 $p_i$ 는 3차원 벡터입니다(x, y 는 강당 바닥, z 는 위쪽). 다만 이 장의 대형은 모두 같은 고도에서 움직이므로 위에서 내려다본 그림으로 봅니다."
          en="The position $p_i$ is a 3-D vector (x, y on the hall floor, z up). The formation of this chapter flies at one altitude, so we look at it from above." />
        <Derivation id="model" title={{ ko: '이 장의 모델: 합의 기반 대형 제어', en: 'The model of this chapter: consensus-based formation control' }}>
          <P ko="가장 단순한 방법은, 이웃과의 어긋남을 줄이는 방향으로 속도를 내는 것입니다."
            en="The simplest approach is to command a velocity that reduces the mismatch with the neighbours." />
          <M block tex={String.raw`\dot p_i \;=\; v_{\text{ref}}(t) \;+\; k \sum_{j \in \mathcal N_i} \Big[\,(\hat p_j - c_j) - (\hat p_i - c_i)\,\Big]`} />
          <List items={[
            { ko: '$v_{\\text{ref}}(t)$: 대형 전체가 따라갈 속도. 미리 짠 궤적이라 모두가 안다고 가정합니다.', en: '$v_{\\text{ref}}(t)$: the velocity the whole formation follows; a pre-planned trajectory known to all.' },
            { ko: '$k$: **게인**. 어긋남 1 m 당 초속 몇 m 로 바로잡을지. 단위는 1/s.', en: '$k$: the **gain** — how many m/s of correction per metre of mismatch. Unit 1/s.' },
            { ko: '$\\mathcal N_i$: 드론 $i$ 가 위치 정보를 받아 쓰는 **이웃**의 집합. 누가 누구의 이웃인지를 선으로 이은 그림을 **그래프**라고 부릅니다(7장).', en: '$\\mathcal N_i$: the set of **neighbours** whose positions drone $i$ uses. The picture of who is whose neighbour, drawn with lines, is called a **graph** (ch. 7).' },
            { ko: '$\\hat p_i$: 드론 $i$ 가 UWB 로 **추정한 자기 위치**. 측정 노이즈가 섞여 있습니다.', en: '$\\hat p_i$: the **own position estimated** by drone $i$ with UWB. It contains measurement noise.' },
            { ko: '$\\hat p_j$: 이웃 $j$ 가 추정해서 **무선으로 보내 준 위치**. 노이즈에 더해 늦게 오고(지연), 가끔 오지 않습니다(손실).', en: '$\\hat p_j$: the position estimated by neighbour $j$ and **sent over radio**. Besides noise it arrives late (delay) and sometimes not at all (loss).' },
          ]} />
          <P ko="모자($\hat{\ }$)가 붙은 값은 모두 제어기가 **알고 있는** 값입니다. 참값 $p$ 와 다르다는 점이 이 교재 전체의 주제입니다."
            en="Everything with a hat ($\hat{\ }$) is what the controller **knows**. That it differs from the true $p$ is the subject of this whole textbook." />
          <P ko="**대형 오차**는 '각 드론의 $p_i - c_i$ 가 5대 평균에서 얼마나 벗어났는가'를 5대에 대해 제곱해서 평균 내고 제곱근을 씌운 값(**RMS**, root mean square)으로 정의합니다. 모두 제자리에 있으면 0 입니다."
            en="The **formation error** is defined as the **RMS** (root mean square: square, average, take the square root) over the five drones of how far each $p_i - c_i$ is from the five-drone average. It is 0 when everyone is in place." />
          <M block tex={String.raw`e_{\text{form}} = \sqrt{\frac{1}{N}\sum_{i=1}^{N} \Big\| (p_i - c_i) - \frac{1}{N}\sum_{j=1}^{N}(p_j - c_j) \Big\|^2}`} />
          <P ko="운동 모델은 일부러 단순하게 잡았습니다. 기체는 명령한 속도를 그대로 내는 질점이고(속도 크기는 {{cfg:vehicle.vMax}} 로 제한), 자세 제어와 추력 동역학은 넣지 않았습니다. 데모에서는 위 식의 우변에 돌풍이 만드는 외란 속도 $w_i(t)$ 가 더해집니다. 빠진 동역학만큼 실제 기체의 응답은 이 모델보다 느릴 수 있으므로, 여기서 보이는 여유를 실제 여유라고 믿어서는 안 됩니다."
            en="The motion model is deliberately simple: each vehicle is a point mass that produces the commanded velocity exactly (speed limited to {{cfg:vehicle.vMax}}); attitude control and thrust dynamics are left out. In the demo a gust disturbance velocity $w_i(t)$ is added to the right-hand side. Because of the missing dynamics a real vehicle may respond more slowly than this model, so do not take the margins seen here as real margins." />
          <P ko="기본 설정의 통신 구조는 **지상국 중계**입니다. 모든 드론의 위치가 지상 PC 로 내려가고, PC 가 명령을 계산해 다시 올려보냅니다. 그래서 이웃 위치뿐 아니라 **내 위치도 똑같이 늦게** 반영됩니다. 기체끼리 직접 주고받는 구조에서는 이웃 정보만 늦는데, 그 차이는 7장에서 다룹니다."
            en="The default communication structure is a **ground relay**: every drone's position goes down to the ground PC, which computes the commands and sends them back up. So not only the neighbours' positions but **your own position too is acted on equally late**. When vehicles talk directly, only neighbour information is late; chapter 7 covers the difference." />
        </Derivation>
        <P ko="$\hat p$ 가 참값과 달라지는 길은 세 가지입니다. **늦게 온다**(지연, delay), **흔들린다**(노이즈, noise), **빠진다**(손실, loss). 이 셋을 하나씩 넣어 보겠습니다."
          en="There are three ways $\hat p$ departs from the truth: it arrives **late** (delay), it **jitters** (noise), and it goes **missing** (loss). We add them one at a time." />
      </Section>

      <Section id="demo" title={{ ko: '완벽한 정보에서 현실로', en: 'From perfect information to reality' }}>
        <Predict id="ch0-which-diverges"
          question={{ ko: '지연, 노이즈, 손실 중에서 대형 오차를 "시간이 갈수록 점점 커지게"(발산) 만들 수 있는 것은 무엇일까요?', en: 'Which of delay, noise and loss can make the formation error grow without bound over time (diverge)?' }}
          choices={[
            { label: { ko: '노이즈 — 흔들림이 쌓여서 점점 커진다', en: 'Noise — the jitter accumulates and grows' } },
            { label: { ko: '지연 — 늦은 정보로 보정하다가 지나쳐 버린다', en: 'Delay — correcting on stale information overshoots' }, correct: true },
            { label: { ko: '손실 — 정보가 빠지면 드론이 제멋대로 간다', en: 'Loss — without information the drones wander off' } },
          ]}
          explain={{
            ko: '발산의 주범은 **지연**입니다. 이미 지나간 어긋남을 보고 보정하면, 보정이 도착했을 때는 이미 반대쪽으로 넘어가 있을 수 있습니다. 게인이 클수록, 지연이 길수록 이 "지나침"이 커져서 진동이 점점 자랍니다. 노이즈는 오차를 일정한 크기로 **떨게** 만들 뿐 스스로 커지지 않고, 손실은 그 순간 **낡은 정보**를 쓰게 만들어 지연이 잠깐 길어진 것처럼 작용합니다. 아래 데모에서 직접 확인해 보세요.',
            en: 'The culprit is **delay**. If you correct for a mismatch that has already passed, by the time the correction arrives you may have crossed to the other side. The larger the gain and the longer the delay, the larger this overshoot, and the oscillation grows. Noise makes the error **jitter** at a bounded size but does not grow by itself; loss forces the controller to use **stale** information, acting like a momentarily longer delay. Check it in the demo below.',
          }} />
        <StageDemo />
        <h3>{tr({ ko: '세 가지 문제는 생김새가 다르다', en: 'The three problems look different' })}</h3>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '문제', en: 'Problem' })}</th><th>{tr({ ko: '대형에 나타나는 모습', en: 'What you see in the formation' })}</th><th>{tr({ ko: '무엇이 좌우하나', en: 'What governs it' })}</th><th>{tr({ ko: '다루는 장', en: 'Chapter' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '지연', en: 'Delay' })}</b></td><td><T ko="규칙적인 진동. 한계를 넘으면 진폭이 계속 자란다" en="Regular oscillation; past a limit the amplitude keeps growing" /></td><td><T ko="게인 × 지연 × 그래프 구조(누가 누구의 정보를 받는가)" en="gain × delay × graph structure (who receives whose information)" /></td><td><a href="#/ch/7">7</a></td></tr>
              <tr><td><b>{tr({ ko: '노이즈', en: 'Noise' })}</b></td><td><T ko="불규칙한 떨림. 크기는 일정하다" en="Irregular jitter of bounded size" /></td><td><T ko="측정 노이즈 × 앵커(벽에 고정한 UWB 기준 장치)의 배치 × 필터(측정을 걸러 위치를 추정하는 계산)" en="measurement noise × layout of the anchors (UWB reference devices fixed to the walls) × filter (the computation that turns measurements into a position estimate)" /></td><td><a href="#/ch/1">1</a>–<a href="#/ch/5">5</a></td></tr>
              <tr><td><b>{tr({ ko: '손실', en: 'Loss' })}</b></td><td><T ko="가끔 튀는 오차. 몰아서 빠지면 크게 튄다" en="Occasional spikes; bursts of loss cause big ones" /></td><td><T ko="손실률보다 **연속 손실 길이**" en="**burst length** rather than loss rate" /></td><td><a href="#/ch/7">7</a>, <a href="#/ch/8">8</a></td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="why-delay" title={{ ko: '왜 지연은 진동을 만드나', en: 'Why delay makes things oscillate' }}>
        <Derivation id="delay-osc" title={{ ko: '드론 두 대로 보는 지연 한계', en: 'The delay limit with just two drones' }}>
          <P ko="드론 두 대가 한 축 위에서 서로의 간격을 맞춘다고 합시다. 간격 오차를 $e$ 라 하면, 지상국 중계 구조에서는 두 대가 모두 $\tau$ 초 전의 정보(내 위치도, 상대 위치도 $\tau$ 초 전 값)로 보정하므로"
            en="Take two drones adjusting their spacing along one axis. With spacing error $e$, in the ground-relay structure both correct on information that is $\tau$ seconds old (their own position as well as the other's), so" />
          <M block tex={String.raw`\dot e(t) = -2k\, e(t-\tau)`} />
          <P ko="입니다(둘이 각각 $k\,e$ 만큼 움직이므로 2배). 자동제어 수업에서 하던 대로 $e(t) = e^{st}$ 를 넣으면 $s = -2k\,e^{-s\tau}$. 안정과 불안정의 경계는 $s$ 가 허수축에 닿는 순간, 즉 $s = j\omega$ 일 때입니다."
            en="(each moves by $k\,e$, hence the factor 2). As in your control course, substitute $e(t) = e^{st}$ to get $s = -2k\,e^{-s\tau}$. The boundary between stable and unstable is where $s$ touches the imaginary axis, $s = j\omega$." />
          <M block tex={String.raw`j\omega = -2k\,e^{-j\omega\tau}`} />
          <P ko="양변의 **크기**를 비교하면 $\omega = 2k$. 양변의 **위상**을 비교하면, 좌변 $j\omega$ 의 위상은 $\pi/2$, 우변은 $-1$ 의 위상 $\pi$ 에서 지연이 깎아 낸 $\omega\tau$ 를 뺀 $\pi - \omega\tau$ 이므로"
            en="Comparing **magnitudes** gives $\omega = 2k$. Comparing **phases**: the left side $j\omega$ has phase $\pi/2$; the right side has the phase $\pi$ of $-1$ minus the $\omega\tau$ removed by the delay, i.e. $\pi - \omega\tau$, so" />
          <M block tex={String.raw`\frac{\pi}{2} = \pi - \omega\tau \;\Rightarrow\; \omega\tau = \frac{\pi}{2} \;\Rightarrow\; \tau^{*} = \frac{\pi}{2\omega} = \frac{\pi}{4k}`} />
          <P ko="즉 **지연이 꼭 90° 의 위상 지연을 만들 때**가 경계이고, $\tau > \tau^*$ 이면 불안정합니다. 수업에서 배운 말로 하면, 루프 전달함수 $2k\,e^{-s\tau}/s$ 의 위상여유 90° 를 지연 $\omega\tau$ 가 다 써 버리는 순간입니다. 드론이 여러 대이면 $2k$ 자리에 $k\lambda_N$ 이 들어갑니다. $\lambda_N$ 은 그래프(누가 누구의 정보를 받는가)가 정하는 수로, 7장에서 다룹니다."
            en="So the boundary is where **the delay contributes exactly 90° of phase lag**, and the loop is unstable for $\tau > \tau^*$. In course terms: the delay $\omega\tau$ uses up the entire 90° phase margin of the loop transfer function $2k\,e^{-s\tau}/s$. With more drones, $k\lambda_N$ replaces $2k$, where $\lambda_N$ is a number set by the graph (who receives whose information) — the subject of chapter 7." />
          <P ko="예: 지금 설정의 게인 {{cfg:comm.gain}} 가 $k$ = 1.5 /s 라면 두 대 사이의 한계는 $\tau^* = \pi/(4 \times 1.5) \approx$ 0.52 s{{der:ch0#delay-osc|위 식에 k = 1.5 /s 를 넣은 값|The formula above with k = 1.5 /s}} 입니다. 5대가 모두 서로 연결되면 한계가 0.21 s{{der:ch7#delay-bound|π/(2·k·λ_N), k = 1.5 /s, λ_N = 5|π/(2·k·λ_N) with k = 1.5 /s and λ_N = 5}} 로 줄어듭니다."
            en="Example: if the gain in the settings, {{cfg:comm.gain}}, is $k$ = 1.5 /s, the limit between two drones is $\tau^* = \pi/(4 \times 1.5) \approx$ 0.52 s{{der:ch0#delay-osc|위 식에 k = 1.5 /s 를 넣은 값|The formula above with k = 1.5 /s}}. With five fully connected drones it shrinks to 0.21 s{{der:ch7#delay-bound|π/(2·k·λ_N), k = 1.5 /s, λ_N = 5|π/(2·k·λ_N) with k = 1.5 /s and λ_N = 5}}." />
        </Derivation>
        <Note>
          <P ko="데모에서 지연을 한계 너머로 키워도 오차가 무한히 커지지 않고 일정한 크기로 흔들리는 것을 봤을 겁니다. 속도 제한({{cfg:vehicle.vMax}}) 때문입니다. 선형 이론은 '커지기 시작한다'까지만 말해 주고, 실제 진폭은 속도 한계와 지연이 정합니다. 간격이 좁으면 그 진폭만으로도 충돌합니다."
            en="In the demo, pushing the delay past the limit does not make the error grow forever; it settles into an oscillation of fixed size. That is the speed limit ({{cfg:vehicle.vMax}}). Linear theory only tells you that growth starts; the actual amplitude is set by the speed limit and the delay. With tight spacing that amplitude alone is enough to collide." />
        </Note>
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <TailPitfall />
      </Section>

      <Section id="question" title={{ ko: '이 교재의 질문과 오차 예산', en: 'The question of this book and the error budget' }}>
        <P ko="이제 처음 질문을 숫자의 문제로 바꿀 수 있습니다. 두 드론의 중심 사이 간격 $d$ 를 얼마나 벌려야 안전할까요? 답은 '각자 자기 위치를 얼마나 틀리게 아는가'와 '서로의 위치를 얼마나 늦게 아는가'를 모두 더한 값입니다. 뼈대만 적으면 다음과 같습니다."
          en="We can now turn the opening question into numbers. How far apart must the centres of two drones be? The answer adds up how wrongly each knows its own position and how late each knows the other's. In outline:" />
        <M block tex={String.raw`d_{\min} \;=\; \underbrace{d_{\text{body}}}_{\tx{기체 크기}{body size}} + \underbrace{k_\sigma\sqrt2\,\sigma_{\text{est}}}_{\tx{측위 오차 (1–6장)}{positioning error (ch. 1–6)}} + \underbrace{v_{\text{rel}}\,(\tau + T_{\text{gap}})}_{\tx{지연·손실 (7장)}{delay and loss (ch. 7)}} + \underbrace{d_{\text{margin}}}_{\tx{여유 (8장)}{margin (ch. 8)}}`} />
        <List items={[
          { ko: '$d_{\\text{body}}$: 충돌 지름. 중심이 이보다 가까우면 기체끼리 닿습니다.', en: '$d_{\\text{body}}$: the collision diameter; closer than this and the vehicles touch.' },
          { ko: '$\\sigma_{\\text{est}}$: 드론 한 대가 자기 위치를 틀리게 아는 정도(표준편차). 1~6장에서 구합니다.', en: '$\\sigma_{\\text{est}}$: how wrongly one drone knows its own position (standard deviation). Chapters 1–6 work it out.' },
          { ko: '$\\sqrt2$: 두 드론이 **각자** 틀리기 때문에 붙습니다. 서로 무관한 두 오차의 차는 표준편차가 $\\sqrt2$ 배입니다(아래 1분 복습).', en: '$\\sqrt2$: because **both** drones are wrong. The difference of two unrelated errors has $\\sqrt2$ times the standard deviation (see the review below).' },
          { ko: '$k_\\sigma$: 표준편차의 몇 배까지 대비할지 정하는 배수. 기본은 3 입니다.', en: '$k_\\sigma$: how many standard deviations to allow for. The default is 3.' },
          { ko: '$v_{\\text{rel}}$: 두 드론이 서로 가까워질 수 있는 속도(상대속도), $\\tau$: 상대 위치를 늦게 아는 시간(지연), $T_{\\text{gap}}$: 패킷이 연달아 빠져 소식이 끊기는 시간. 그 시간 동안 상대는 $v_{\\text{rel}}(\\tau + T_{\\text{gap}})$ 만큼 다가와 있을 수 있습니다.', en: '$v_{\\text{rel}}$: the speed at which two drones can approach each other (relative speed); $\\tau$: how late you learn the other\\u2019s position (delay); $T_{\\text{gap}}$: how long news stops when packets are lost in a row. In that time the other drone may have come $v_{\\text{rel}}(\\tau + T_{\\text{gap}})$ closer.' },
          { ko: '$d_{\\text{margin}}$: 모델이 놓친 것에 대비한 여유.', en: '$d_{\\text{margin}}$: a margin for what the model misses.' },
        ]} />
        <P ko="이 식의 항목 하나하나를 줄 세워 적은 표를 **오차 예산**(error budget)이라고 부릅니다. 화면 맨 아래에 접혀 있는 막대가 그것이고, 장을 하나 읽을 때마다 그 장의 항목이 채워집니다. 위 식은 뼈대이고, 8장에서 추종 오차와 앵커 좌표 오차 같은 항목까지 넣어 완성합니다. 마지막에는 여러분의 강당, 여러분의 앵커 배치, 여러분이 측정한 지연으로 계산한 권장 간격이 남습니다."
          en="The table that lists the items of this formula one by one is the **error budget**. It is the bar folded at the bottom of the screen; each chapter you read fills in its items. The formula above is the outline; chapter 8 completes it with further items such as tracking error and anchor-coordinate error. At the end you are left with a recommended spacing computed for your hall, your anchor layout and your measured delay." />
        <P ko="우리 드론은 벽에 고정한 **앵커**까지의 거리를 전파로 재서 자기 위치를 계산합니다. 그래서 $\sigma_{\text{est}}$ 의 출발점은 **거리를 얼마나 정확히 재는가**입니다."
          en="Our drones compute their position by measuring, with radio, the distance to **anchors** fixed to the walls. So the starting point of $\sigma_{\text{est}}$ is **how accurately a distance is measured**." />
        <List items={[
          { ko: '**1–3장** UWB 가 거리를 재고 위치로 바꾸는 원리, 그리고 5대가 되면 생기는 일', en: '**Ch. 1–3** how UWB measures range and turns it into position, and what changes with five drones' },
          { ko: '**4–6장** 나쁜 측정을 걸러 내고 IMU 와 합쳐 Crazyflie 안에서 추정하는 방법', en: '**Ch. 4–6** rejecting bad measurements, fusing with the IMU, and estimating onboard the Crazyflie' },
          { ko: '**7–8장** 통신 지연과 손실 아래에서 대형이 안정한 조건, 그리고 안전 간격', en: '**Ch. 7–8** conditions for a stable formation under delay and loss, and the safe spacing' },
          { ko: '**9장** 예시값을 여러분의 실제 측정값으로 바꾸는 절차', en: '**Ch. 9** the procedure for replacing example values with your own measurements' },
        ]} />
        <Derivation id="stats" title={{ ko: '통계 1분 복습: 이 교재가 쓰는 것은 이것뿐입니다', en: 'One-minute statistics review: this is all the textbook uses' }}>
          <List items={[
            { ko: '**표준편차** $\\sigma$: 값이 평균에서 보통 얼마나 벗어나는가. **분산**은 그 제곱 $\\sigma^2$ 입니다.', en: '**Standard deviation** $\\sigma$: how far a value typically is from its mean. The **variance** is its square $\\sigma^2$.' },
            { ko: '**독립**: 한쪽 값을 알아도 다른 쪽에 대해 알 수 있는 것이 없는 관계. 독립인 두 오차를 더하거나 빼면 **분산이 더해집니다**: $\\sigma^2 = \\sigma_1^2 + \\sigma_2^2$. 그래서 크기가 같은 두 오차의 차는 $\\sqrt{\\sigma^2 + \\sigma^2} = \\sqrt2\\,\\sigma$. 이렇게 제곱해서 더하고 제곱근을 씌우는 것을 **제곱합**(RSS)이라고 합니다.', en: '**Independent**: knowing one value tells you nothing about the other. Adding or subtracting two independent errors **adds their variances**: $\\sigma^2 = \\sigma_1^2 + \\sigma_2^2$. So the difference of two equal errors has $\\sqrt{\\sigma^2 + \\sigma^2} = \\sqrt2\\,\\sigma$. Squaring, adding and taking the square root is called **root-sum-square** (RSS).' },
            { ko: '독립인 측정 $n$ 개를 평균 내면 표준편차가 $\\sigma/\\sqrt n$ 으로 줄어듭니다. 늘 같은 방향으로 틀리는 **편향**(bias)은 평균을 내도 줄지 않습니다.', en: 'Averaging $n$ independent measurements shrinks the standard deviation to $\\sigma/\\sqrt n$. A **bias**, an error always in the same direction, does not shrink by averaging.' },
            { ko: '**정규분포**(가우스 분포): 종 모양의 분포. 값이 평균 ±1σ 안에 있을 확률은 약 68 %{{der:ch0#stats|표준정규 누적분포 Φ 로 2Φ(1) − 1|2Φ(1) − 1 with the standard normal CDF Φ}}, ±2σ 안은 약 95 %{{der:ch0#stats|2Φ(2) − 1|2Φ(2) − 1}}, ±3σ 안은 약 99.7 %{{der:ch0#stats|2Φ(3) − 1|2Φ(3) − 1}} 입니다. "3σ 로 대비한다"는 말은 1000번에 3번쯤만 그 밖으로 나간다는 뜻입니다.', en: '**Normal (Gaussian) distribution**: the bell curve. A value lies within ±1σ of the mean with probability about 68 %{{der:ch0#stats|표준정규 누적분포 Φ 로 2Φ(1) − 1|2Φ(1) − 1 with the standard normal CDF Φ}}, within ±2σ about 95 %{{der:ch0#stats|2Φ(2) − 1|2Φ(2) − 1}}, within ±3σ about 99.7 %{{der:ch0#stats|2Φ(3) − 1|2Φ(3) − 1}}. "Allowing for 3σ" means only about 3 in 1000 fall outside.' },
            { ko: '**RMS**: 값들을 제곱해 평균 내고 제곱근을 씌운 것. 평균이 0 인 오차라면 RMS 가 곧 표준편차입니다.', en: '**RMS**: square the values, average, take the square root. For an error with zero mean the RMS is the standard deviation.' },
          ]} />
        </Derivation>
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 0,
  title: { ko: '왜 무너지는가', en: 'Why does it fall apart?' },
  lead: { ko: '완벽한 정보에서 출발해 지연, 노이즈, 손실을 차례로 넣어 봅니다. 대형이 어떻게, 왜 무너지는지 눈으로 본 뒤에 교재 전체의 질문을 세웁니다.', en: 'Start from perfect information and add delay, noise and loss in turn. See how and why the formation breaks, then set up the question for the whole book.' },
  objectives: [
    { ko: '대형 유지가 "서로의 위치를 아는 것"에 달려 있음을 제어식으로 설명한다.', en: 'Explain with the control law why formation keeping depends on knowing each other’s positions.' },
    { ko: '지연·노이즈·손실이 대형에 만드는 문제의 모양을 구분한다.', en: 'Tell apart the signatures that delay, noise and loss leave on a formation.' },
    { ko: '오차 예산이 무엇이고 각 장이 어느 항목을 채우는지 말한다.', en: 'Say what the error budget is and which chapter fills which item.' },
  ],
  Body,
  budget: {
    items: [],
    note: { ko: '0장은 항목을 더하지 않습니다. 대신 예산의 **틀**을 세웠습니다: 최소 간격 = 기체 크기 + 측위 오차 + 지연·손실 동안의 이동 + 여유. 1장부터 이 틀의 빈칸을 하나씩 채웁니다.', en: 'Chapter 0 adds no item. It sets up the **frame**: minimum spacing = body size + positioning error + motion during delay and loss + margin. From chapter 1 on we fill the blanks one by one.' },
  },
  summary: [
    { ko: '대형 제어는 이웃과의 상대 위치 오차를 줄이는 합의 문제이고, 제어기가 아는 위치 $\\hat p$ 가 참값과 다르다는 것이 모든 문제의 뿌리다.', en: 'Formation control is a consensus problem on relative positions; every difficulty comes from the known position $\\hat p$ differing from the truth.' },
    { ko: '지연은 진동을, 노이즈는 일정한 떨림을, 손실은 낡은 정보로 인한 튐을 만든다. 발산까지 시킬 수 있는 것은 지연이고, 자기 위치까지 늦게 반영되는 구조(지상국 중계)에서 그렇다.', en: 'Delay causes oscillation, noise a bounded jitter, loss spikes from stale data. Only delay can make it diverge, and it does so in the structure where even your own position is acted on late (ground relay).' },
    { ko: '안전은 평균이 아니라 꼬리가 정하므로, 오차를 항목별로 더한 **오차 예산**으로 최소 간격을 정한다.', en: 'Safety is set by the tail, not the mean, so the minimum spacing comes from an **error budget** that adds the errors item by item.' },
  ],
  next: { ko: '측위 오차 칸의 출발점은 "앵커까지의 거리를 얼마나 정확히 재는가"입니다. 그런데 UWB 는 애초에 전파로 거리를 어떻게 잴까요? 전파가 30 cm 가는 데 걸리는 시간은 10억분의 1초{{lit:dw1000/one-ns-30cm}}인데, 그걸 어떻게 재죠?', en: 'The positioning-error blank starts from how accurately the distance to an anchor is measured. But how does UWB measure distance with radio at all? Radio covers 30 cm in a billionth of a second{{lit:dw1000/one-ns-30cm}} — how do you time that?' },
  tasks: [],
};
export default def;
