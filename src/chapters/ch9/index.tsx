import type { ChapterDef } from '../../app/chapters';
import { fieldMeta } from '../../app/fields';
import { L, fix, fmt, tr } from '../../app/i18n';
import { budget, config, getPath } from '../../app/store';
import { computeBudget } from '../../sim/budget';
import { effectiveN, predictStatic, samplesForSigma, sensitivityValue, sigmaRelStdErr, withPath } from '../../sim/ch9_measure';
import { der } from '../../sources';
import {
  CfgSlider, CfgVal, CodeTask, CodeView, Derivation, List, M, Note, P, Predict, PredictNumber, Section, SrcBadge, Stat, StatRow, Status, T,
} from '../../ui';
import { LogDemo } from './LogDemo';
import { ClockPitfall, DriftPitfall, EstimatorLink, SigmaMc } from './labs';
import { fitLogTask, tasks } from './tasks';

/** 이 장이 측정으로 바꾸려는 예시값 설정과, 그것을 채우는 실험 */
const KEY: { path: string; by: L }[] = [
  { path: 'uwb.sigmaTdoa', by: { ko: '실험 1 (정지 로그에서 역산) 또는 실험 2 (거리차 로그)', en: 'Experiment 1 (back-calculated from a static log) or 2 (range-difference log)' } },
  { path: 'uwb.sigmaTwr', by: { ko: '실험 2 (거리 로그)', en: 'Experiment 2 (range log)' } },
  { path: 'uwb.pNlos', by: { ko: '실험 2 (오른쪽 꼬리)', en: 'Experiment 2 (right tail)' } },
  { path: 'uwb.nlosBiasMean', by: { ko: '실험 2 (오른쪽 꼬리)', en: 'Experiment 2 (right tail)' } },
  { path: 'uwb.anchorSurveyError', by: { ko: '실험 2 (앵커별 편향, 어림값)', en: 'Experiment 2 (per-anchor bias, rough)' } },
  { path: 'comm.delayMean', by: { ko: '실험 3 (왕복 지연)', en: 'Experiment 3 (round trip)' } },
  { path: 'comm.delayJitter', by: { ko: '실험 3 (왕복 지연)', en: 'Experiment 3 (round trip)' } },
  { path: 'comm.loss.pGB', by: { ko: '실험 4 (빠진 순번)', en: 'Experiment 4 (missing sequence numbers)' } },
  { path: 'comm.loss.pBG', by: { ko: '실험 4 (빠진 순번)', en: 'Experiment 4 (missing sequence numbers)' } },
  { path: 'estimation.latency', by: { ko: '지상 실험으로는 못 잽니다 (기체 안의 시간. 6장의 값을 쓰고, 실험 3 의 왕복에 일부가 섞여 들어옵니다)', en: 'Not measurable on the ground (time inside the vehicle; use the value of chapter 6 — part of it shows up in the round trip of experiment 3)' } },
  { path: 'safety.trackingError', by: { ko: '실험 5 (한 대 제자리 비행: 목표 − 추정의 RMS)', en: 'Experiment 5 (one vehicle hovering: RMS of setpoint − estimate)' } },
  { path: 'safety.downwashRatio', by: { ko: '실험 6 (두 대 위아래: 아래 기체가 흔들리기 시작하는 수직 간격)', en: 'Experiment 6 (two vehicles stacked: vertical gap at which the lower one starts to wobble)' } },
];

function KeyTable() {
  const cfg = config.value;
  const b = budget.value;
  const rows = KEY.map((k) => {
    const v = getPath(cfg, k.path) as number;
    const nb = computeBudget(withPath(cfg, k.path, sensitivityValue(v, fieldMeta(k.path)?.unit === '%')));
    return { ...k, d: nb.minSepH - b.minSepH, dV: nb.minSepV - b.minSepV };
  }).sort((p, q) => Math.max(Math.abs(q.d), Math.abs(q.dV)) - Math.max(Math.abs(p.d), Math.abs(p.dV)));
  const SENS = der('ch9#sensitivity', { ko: '이 값만 2배로 바꿔 오차 예산을 다시 계산한 결과와의 차', en: 'Difference to the error budget recomputed with only this value doubled' });
  const cell = (d: number) => <><b class="num">{d >= 0 ? '+' : '−'}{fmt(Math.abs(d) * 100, 2)} cm</b><SrcBadge src={SENS} /></>;
  return (
    <div class="table-wrap">
      <table class="tbl" data-testid="ch9-key-table">
        <thead><tr>
          <th>{tr({ ko: '전역 설정 (지금은 예시값)', en: 'Global setting (an example value for now)' })}</th>
          <th class="r">{tr({ ko: '지금 값', en: 'Current value' })}</th>
          <th class="r">{tr({ ko: '값이 2배면 권장 수평 간격은', en: 'Recommended horizontal spacing if doubled' })}</th>
          <th class="r">{tr({ ko: '수직 간격은', en: 'Vertical spacing' })}</th>
          <th>{tr({ ko: '무엇으로 재나', en: 'Measured by' })}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path}>
              <td>{tr(fieldMeta(r.path)!.label)}</td>
              <td class="r"><CfgVal path={r.path} /></td>
              <td class="r">{cell(r.d)}</td>
              <td class="r">{cell(r.dV)}</td>
              <td>{tr(r.by)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAG_RECORD = `# 예시 (EXAMPLE) - 토픽 이름은 여러분의 시스템에서 ros2 topic list 로 확인하세요.
# Check the topic names on your system with ros2 topic list.
# ros2 bag record -o <bag 폴더 / bag folder> <토픽 이름 / topic name> ...
ros2 bag record -o static_test_bag /my_drone/pose
`;

const ROS_EXAMPLE = `# 예시 (EXAMPLE) - 여러분의 토픽 이름과 메시지 형식에 맞게 고치세요.
# Adapt the topic name and message type to your own system.
# bag 에 기록된 위치(pose) 토픽을 읽어 t,x,y,z CSV 로 쓴다.
# Reads the recorded pose topic from the bag and writes a t,x,y,z CSV.
import csv
import rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

BAG = "static_test_bag"        # 기록해 둔 bag 폴더 / recorded bag folder
TOPIC = "/my_drone/pose"       # <- 여러분의 토픽 이름으로 / your topic name
OUT = "static_log.csv"

reader = rosbag2_py.SequentialReader()
reader.open(rosbag2_py.StorageOptions(uri=BAG), rosbag2_py.ConverterOptions("", ""))
types = {t.name: t.type for t in reader.get_all_topics_and_types()}
Msg = get_message(types[TOPIC])

with open(OUT, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["t", "x", "y", "z"])              # 열 이름은 소문자
    t0 = None
    while reader.has_next():
        topic, raw, t_ns = reader.read_next()     # t_ns: bag 이 적은 시각 [ns] (뜻은 문서에서 확인)
        if topic != TOPIC:
            continue
        msg = deserialize_message(raw, Msg)
        p = msg.pose.position                     # 메시지 형식에 맞게 고칠 곳
        if t0 is None:
            t0 = t_ns
        w.writerow([(t_ns - t0) * 1e-9, p.x, p.y, p.z])   # 초, 미터
`;

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const pred = predictStatic(cfg, center);
  const anchorBiasH = b.items.find((it) => it.id === 'anchor-bias')?.value ?? NaN;
  const n10 = samplesForSigma(0.1), n5 = samplesForSigma(0.05);
  const se600 = sigmaRelStdErr(600), neff = effectiveN(600, 0.9), se600c = sigmaRelStdErr(neff);
  const pBG = cfg.comm.loss.pBG;
  const seBG = Math.sqrt((pBG * (1 - pBG)) / 100);
  const tLoss = b.lossRate > 0 ? 100 / (b.lossRate * cfg.comm.rate) : Infinity;
  return (
    <>
      <Section id="why" title={{ ko: '회색 배지를 지우는 장', en: 'The chapter that removes the grey badges' }}>
        <P ko="지금까지의 장에서 회색 **예시값** 배지가 붙은 숫자는 모두 '아직 모르는 값'이었습니다. 거리 측정 노이즈, 통신 지연, 손실률 같은 값은 논문에서 가져올 수 없습니다. 강당, 앵커 배치, 기체, 무선 환경마다 다르기 때문입니다. 이 장은 그 값들을 **날리기 전에 지상에서** 재는 절차 네 가지(실험 1~4)와, 한 대·두 대를 **띄워서** 재는 절차 두 가지(실험 5·6), 그리고 잰 로그를 교재의 모델에 넣는 방법을 다룹니다."
          en="Every number carrying a grey **example value** badge in the previous chapters was a value we do not know yet. Range noise, communication delay and loss rate cannot be taken from a paper: they differ with the hall, the anchor layout, the vehicles and the radio environment. This chapter gives four procedures for measuring them **on the ground, before flying** (experiments 1–4), two procedures that need one or two vehicles **in the air** (experiments 5 and 6), and shows how to feed the logs into the textbook model." />
        <P ko="무엇부터 재야 할까요? 아래 표는 **이 장의 실험으로 잴 수 있는** 예시값 설정을, **값이 2배가 되면 권장 최소 간격이 얼마나 달라지는지**가 큰 순서로 늘어놓은 것입니다. 위쪽에 있는 값일수록 먼저, 더 정확히 재야 합니다. 상대속도 가정, 방송 주기, 신뢰 배수 $k_\sigma$, 충돌 지름처럼 재는 값이 아니라 **정하는 값**은 이 표에 없습니다. 그 값들의 영향은 [우리 시스템 리포트](#/report)의 예시값 표에서 함께 볼 수 있습니다."
          en="What should be measured first? The table lists the example-valued settings **that the experiments of this chapter can measure**, ordered by **how much the recommended minimum spacing changes when the value doubles**. The higher a value is in the table, the earlier and the more carefully it should be measured. Values that are **chosen** rather than measured — the assumed relative speed, the broadcast rate, the confidence multiplier $k_\sigma$, the collision diameter — are not in this table; their effect is listed in the example-value table of [our system report](#/report)." />
        <KeyTable />
        <Derivation id="sensitivity" title={{ ko: '한 번에 하나씩 바꿔 보는 민감도', en: 'One-at-a-time sensitivity' }}>
          <P ko="권장 최소 간격 $d_{\min}$ 은 전역 설정 $\theta_1, \theta_2, \dots$ 의 함수입니다(8장의 합계식). 설정 하나 $\theta_i$ 만 2배로 바꾸고 나머지는 그대로 둔 채 다시 계산해서 차이를 봅니다. 확률(0~100 %)인 설정은 2배가 100 % 를 넘을 수 있으므로 2배와 '100 % 까지 남은 거리의 절반' 중 작은 쪽, 곧 $\min\big(2\theta_i,\ (1+\theta_i)/2\big)$ 로 바꿉니다($\theta_i \le 1/3$ 이면 2배와 같습니다)."
            en="The recommended minimum spacing $d_{\min}$ is a function of the global settings $\theta_1, \theta_2, \dots$ (the total of chapter 8). Double one setting $\theta_i$, keep all others, recompute, and take the difference. A probability (0–100 %) could exceed 100 % when doubled, so it is changed to the smaller of twice the value and 'half the remaining distance to 100 %', i.e. $\min\big(2\theta_i,\ (1+\theta_i)/2\big)$ (the same as doubling when $\theta_i \le 1/3$)." />
          <M block tex={String.raw`\Delta d_i \;=\; d_{\min}(\theta_1,\dots,2\theta_i,\dots) \;-\; d_{\min}(\theta_1,\dots,\theta_i,\dots)`} />
          <P ko={`$\\Delta d_i$ 가 크면 그 값을 잘못 알았을 때 간격이 크게 틀린다는 뜻이므로 측정할 가치가 큽니다. 0 이면 지금 구성에서는 쓰이지 않는 값입니다(예: 측위 모드가 TDoA 이면 TWR 노이즈). 수직 간격에만 듣는 값도 있습니다(다운워시 비율 $k_z$). 지금 설정의 권장 최소 수평 간격은 ${fix(b.minSepH, 3)} m{{der:ch8#budget-sum|지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)|Total of the error budget with the current global settings (formula of chapter 8)}} 입니다. 이 방법은 다른 값과의 상호작용은 보지 못하므로 순서를 정하는 용도로만 씁니다.`}
            en={`A large $\\Delta d_i$ means the spacing is badly off if that value is wrong, so it is worth measuring. Zero means the value is unused in the current configuration (e.g. TWR noise when the mode is TDoA). Some values act only on the vertical spacing (the downwash ratio $k_z$). With the current settings the recommended minimum horizontal spacing is ${fix(b.minSepH, 3)} m{{der:ch8#budget-sum|지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)|Total of the error budget with the current global settings (formula of chapter 8)}}. The method ignores interactions between values, so use it only to decide the order.`} />
        </Derivation>
        <Note>
          <P ko="**아래 절차는 문헌이 아니라 조언입니다.** 기록 시간이나 표본 수처럼 절차에 나오는 숫자는 모두 예시값이고, 왜 그 정도인지는 유도에서 계산해 보입니다. Crazyflie 와 Crazyswarm2 에서 어떤 변수를 어떤 설정으로 기록하는지는 버전에 따라 달라지므로, 정확한 이름과 문법은 [Crazyswarm2 공식 문서](https://imrclab.github.io/crazyswarm2/)와 [ROS 2 공식 문서](https://docs.ros.org/)에서 확인하세요."
            en="**The procedures below are advice, not literature.** Every number in them (recording time, sample count) is an example value, and the derivations show why that order of magnitude. Which variable to log with which configuration on the Crazyflie and Crazyswarm2 changes between versions; check the exact names and syntax in the [official Crazyswarm2 documentation](https://imrclab.github.io/crazyswarm2/) and the [official ROS 2 documentation](https://docs.ros.org/)." />
        </Note>
      </Section>

      <Section id="static" title={{ ko: '실험 1 — 정지 노이즈', en: 'Experiment 1 — static noise' }}>
        <P ko="기체를 움직이지 않게 세워 두면 참 위치는 변하지 않습니다. 그런데도 추정한 위치가 흔들린다면 그 흔들림은 전부 측위가 만든 것입니다. 가장 쉽고, 가장 먼저 해야 하는 실험입니다."
          en="A vehicle that is fixed in place has a constant true position. If its estimated position still jitters, all of that jitter comes from positioning. This is the easiest experiment and the one to do first." />
        <List ordered items={[
          { ko: '앵커 좌표를 설정한 뒤(6장), 기체를 **좌표를 아는 지점**의 받침대나 삼각대 위에 고정합니다. 프로펠러는 돌리지 않습니다. 바닥에 내려놓지 말고 비행 고도 가까이 올리세요. TDoA 는 앵커가 둘러싼 공간 밖에서 급격히 나빠지는데{{lit:lps-docs/tdoa2-convex-hull}}, 바닥은 가장 낮은 앵커보다 아래여서 그 공간 밖이기 쉽습니다.', en: 'After setting the anchor coordinates (chapter 6), fix the vehicle on a stand or tripod at a **point with known coordinates**. Do not spin the propellers. Raise it near the flight height rather than leaving it on the floor: TDoA degrades quickly outside the volume enclosed by the anchors{{lit:lps-docs/tdoa2-convex-hull}}, and the floor is usually below the lowest anchor, i.e. outside.' },
          { ko: '추정 위치를 지상 PC 에 기록합니다. Crazyswarm2 에서 온보드 측위를 쓸 때는 위치(pose) 로깅을 켜도록 안내하고 있습니다{{lit:crazyswarm2-docs/lps-supported}}. 설정 파일 `crazyflies.yaml` 의 `firmware_logging` 예시에서 pose 의 기본 주기는 10 Hz 입니다{{lit:crazyswarm2-docs/pose-topic-rate}}.', en: 'Log the estimated position on the ground PC. For onboard positioning Crazyswarm2 tells you to enable pose logging{{lit:crazyswarm2-docs/lps-supported}}. In the `firmware_logging` example of the configuration file `crazyflies.yaml` the default pose rate is 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}}.' },
          { ko: '60 s{{ex}} 쯤 기록합니다. 기록하는 동안 사람은 기체와 앵커 사이에서 물러나 있습니다(사람 몸도 전파를 가립니다{{lit:util2022/nlos-obstacles}}).', en: 'Record for about 60 s{{ex}}. Keep people away from between the vehicle and the anchors while recording (a human body blocks the signal too{{lit:util2022/nlos-obstacles}}).' },
          { ko: '축마다 직선을 맞춰 빼고(추세 제거), 남은 잔차의 표준편차 $\\hat\\sigma$ 와 직선의 기울기(드리프트)를 구합니다.', en: 'For each axis fit and subtract a line (detrending), then compute the standard deviation $\\hat\\sigma$ of the residual and the slope of the line (the drift).' },
          { ko: `로그의 평균 위치와 줄자로 잰 그 지점의 좌표를 견줍니다. 차이가 **고정 어긋남**(편향)입니다. (6장의 '받침대 위에서 추정값을 본다'는 눈으로 하는 첫 점검이고, 여기서는 같은 비교를 기록과 숫자로 합니다.) **합격 기준**(교재가 정한 어림): 수평 어긋남이 예산이 앵커 편향으로 잡아 둔 ${fmt(anchorBiasH * 100, 3)} cm{{der:ch6#anchor-error|예산의 앵커 편향 항 HDOP × 앵커 측량 오차(지금 설정)|The budget's anchor-bias term HDOP × anchor survey error (current settings)}} 이하이면 예산의 가정 안이므로 통과입니다. 넘으면 앵커 좌표를 다시 측량하거나, 아래 규칙대로 그 어긋남을 추가 여유에 넣습니다.`, en: `Compare the mean position of the log with the taped coordinates of the point. The difference is the **fixed offset** (bias). (The 'look at the estimate on a stand' of chapter 6 is a first check by eye; here the same comparison is made with a record and numbers.) **Pass criterion** (a rough rule of the textbook): if the horizontal offset is at most the ${fmt(anchorBiasH * 100, 3)} cm{{der:ch6#anchor-error|예산의 앵커 편향 항 HDOP × 앵커 측량 오차(지금 설정)|The budget's anchor-bias term HDOP × anchor survey error (current settings)}} that the budget allows for anchor bias, the point is within the budget's assumption and passes. If not, re-survey the anchors or put the offset into the extra margin by the rule below.` },
          { ko: '강당 가운데, 구석, 다른 높이처럼 두세 군데에서 되풀이합니다. 앵커 기하(2장의 DOP)가 지점마다 다르기 때문입니다.', en: 'Repeat at two or three places — centre, a corner, another height — because the anchor geometry (DOP, chapter 2) differs from point to point.' },
        ]} />
        <P ko="**어디에 쓰나.** 이 실험은 전역 설정을 직접 채우기보다 교재의 **예측을 검증**합니다. 예산이 예측하는 추정 오차 $\sigma_{\text{est}}$ 와 견주고, 맞지 않으면 측정 노이즈 설정을 역산합니다. 원시 거리나 거리차를 직접 기록할 수 있다면 실험 2 가 더 직접적입니다."
          en="**What it fills.** Rather than filling a global setting directly, this experiment **checks the prediction** of the textbook: compare with the estimate error $\sigma_{\text{est}}$ predicted by the budget and, if they disagree, back-calculate the measurement-noise setting. If you can log raw ranges or range differences, experiment 2 is more direct." />
        <P ko="**드리프트와 고정 어긋남은 어디에 넣나.** 둘 다 필터가 걸러 주지 못하는 편향입니다. 지금 예산에는 '기타 편향' 칸이 따로 없으므로, 이 교재는 다음 규칙을 씁니다(교재가 정한 어림입니다). 편향의 크기를 $b_{\text{pos}} = |\bar x - x_{\tx{줄자}{tape}}| + |\hat b|\,T$ (고정 어긋남 + 기록하는 동안 흘러간 거리, 수평은 x·y 를 합친 길이)로 잡고, 두 기체의 편향이 서로 반대쪽일 수 있으므로 $2\,b_{\text{pos}}$ 를 '측정값을 넣은 뒤' 절의 **추가 여유** 칸에 더합니다. 드리프트를 비행 시간까지 직선으로 늘려 잡지는 마세요. 같은 방향으로 계속 흐른다는 보장이 없습니다. 대신 한 번의 비행만큼 길게 기록해서 다시 재세요."
          en="**Where do drift and fixed offset go?** Both are biases the filter cannot remove. The budget has no separate 'other bias' line yet, so this textbook uses the following rule (a rough rule of the textbook). Take the bias size as $b_{\text{pos}} = |\bar x - x_{\tx{줄자}{tape}}| + |\hat b|\,T$ (fixed offset plus the distance drifted during the record; horizontally, the combined x–y length), and since two vehicles may be biased in opposite directions, add $2\,b_{\text{pos}}$ to the **extra margin** in the section 'After the measurements are in'. Do not extrapolate the drift linearly to the flight time — nothing guarantees it keeps going the same way. Instead, record as long as one flight and measure again." />
        <PredictNumber id="ch9-n-for-sigma"
          question={{ ko: '잰 σ 가 참값에서 ±10 %{{ex}} 안에 들게 하고 싶습니다(신뢰도는 1σ, 즉 세 번에 두 번쯤 맞는 수준). 서로 독립인 표본이 대략 몇 개 필요할까요?', en: 'You want the measured σ to be within ±10 %{{ex}} of the truth (at 1σ confidence, i.e. right about two times out of three). Roughly how many independent samples are needed?' }}
          min={5} max={500} step={5} unit={tr({ ko: '개', en: 'samples' })} actual={n10} actualSrc={der('ch9#sigma-fit', { ko: 'n = 1 + 1/(2·0.1²)', en: 'n = 1 + 1/(2·0.1²)' })} tolerance={0.3}
          explain={{
            ko: `약 ${fmt(n10)}개{{der:ch9#sigma-fit}}면 됩니다. 핵심은 정밀도가 $1/\\sqrt{2(n-1)}$ 로만 좋아진다는 점입니다. ±5 % 로 줄이려면 표본이 4배(약 ${fmt(n5)}개{{der:ch9#sigma-fit}}) 필요합니다. 그리고 "서로 독립"이라는 조건이 실제 로그에서는 잘 지켜지지 않는다는 점이 아래 유도의 마지막 단계입니다.`,
            en: `About ${fmt(n10)}{{der:ch9#sigma-fit}} are enough. The key point is that precision improves only as $1/\\sqrt{2(n-1)}$: halving the error to ±5 % takes four times the samples (about ${fmt(n5)}{{der:ch9#sigma-fit}}). And the condition "independent" is rarely met in a real log — the last step of the derivation below.`,
          }} />
        <Derivation id="sigma-fit" title={{ ko: 'σ 를 추정하는 식, 추세를 빼는 이유, 얼마나 오래 기록할까', en: 'Estimating σ, why detrend, and how long to record' }}>
          <P ko="한 축의 로그를 $x_i$ ($i = 1,\dots,n$), 그 시각을 $t_i$ [s] 라 합시다. 세워 둔 기체의 로그를 이렇게 모델링합니다."
            en="Let $x_i$ ($i = 1,\dots,n$) be the log of one axis and $t_i$ [s] its time stamps. We model the log of a parked vehicle as" />
          <M block tex={String.raw`x_i \;=\; \underbrace{a}_{\tx{참 위치 + 고정 편향}{true position + fixed bias}} \;+\; \underbrace{b\,t_i}_{\tx{느린 드리프트}{slow drift}} \;+\; \underbrace{n_i}_{\tx{노이즈}{noise}},\qquad n_i \sim \mathcal N(0,\sigma^2)`} />
          <P ko="**드리프트**(drift)는 값이 한쪽으로 천천히 흘러가는 현상이고 $b$ [m/s] 가 그 속도입니다. **추세 제거**(detrending)는 최소제곱 직선 $\hat a + \hat b\,t$ 를 맞춰서 빼는 일입니다. 남은 잔차 $r_i$ 의 **표본 표준편차**가 노이즈의 추정값입니다."
            en="**Drift** is a slow creep of the value in one direction, $b$ [m/s] being its rate. **Detrending** means fitting the least-squares line $\hat a + \hat b\,t$ and subtracting it. The **sample standard deviation** of the residual $r_i$ is the noise estimate." />
          <M block tex={String.raw`r_i = x_i - (\hat a + \hat b\,t_i),\qquad \hat\sigma = \sqrt{\frac{1}{n-1}\sum_{i=1}^{n} r_i^2}`} />
          <P ko="(직선에 매개변수 두 개를 썼으니 엄밀히는 $n-2$ 로 나눠야 치우침이 없지만, $n$ 이 수백이면 차이가 $1/(2n)$ 수준이어서 이 교재와 손코딩 과제는 numpy 의 `ddof=1` 관례로 통일합니다.)"
            en="(Two parameters went into the line, so strictly one should divide by $n-2$ for an unbiased value; with $n$ in the hundreds the difference is of order $1/(2n)$, so this textbook and the coding task stick to numpy’s `ddof=1` convention.)" />
          <P ko="**왜 빼야 하나.** 빼지 않으면 직선 $b\,t$ 자체의 퍼짐이 더해집니다. 길이 $T$ 인 기록에서 $t$ 는 0 부터 $T$ 까지 고르게 퍼져 있고, 폭이 $T$ 인 균등분포의 분산은 $T^2/12$ 이므로"
            en="**Why subtract.** Otherwise the spread of the line $b\,t$ itself is added. In a record of length $T$ the times are spread evenly over 0…$T$, and a uniform distribution of width $T$ has variance $T^2/12$, so" />
          <M block tex={String.raw`\sigma_{\text{raw}}^2 \;=\; \sigma^2 + \frac{b^2 T^2}{12}`} />
          <P ko="그냥 잰 σ 는 **기록 시간 $T$ 에 따라 달라집니다.** 센서의 성질일 수 없습니다. 그렇다고 드리프트를 버려도 된다는 뜻은 아닙니다. 노이즈는 평균 0 이라 필터가 줄여 주고 예산에서는 제곱합으로 더하지만, 드리프트는 필터가 못 걸러 내는 **편향**이라 예산에 그대로 더해집니다. 둘 다 적되, 다른 칸에 적어야 합니다."
            en="The raw σ **depends on the recording time $T$** — it cannot be a property of the sensor. That does not mean drift may be discarded. Noise has zero mean, so the filter reduces it and the budget adds it in quadrature; drift is a **bias** the filter cannot remove, and the budget adds it linearly. Record both, in different lines." />
          <P ko="**표준오차**(standard error)는 '추정값 자체가 실험마다 얼마나 들쭉날쭉한가'의 표준편차입니다(분산과 표준편차가 낯설면 [통계 1분 복습](#/ch/0?a=stats)). 노이즈가 정규분포이고 표본이 독립이면 $(n-1)\hat\sigma^2/\sigma^2$ 는 자유도 $n-1$ 인 **카이제곱 분포**(chi-square distribution)를 따르고, 그 분산은 $2(n-1)$ 입니다. 이것은 통계 교과서의 결과이므로 증명은 생략하고, 아래 몬테카를로로 직접 확인합니다. 따라서"
            en="The **standard error** is the standard deviation of the estimate itself from one experiment to the next (if variance and standard deviation are unfamiliar, see the [one-minute statistics review](#/ch/0?a=stats)). For Gaussian noise and independent samples, $(n-1)\hat\sigma^2/\sigma^2$ follows a **chi-square distribution** with $n-1$ degrees of freedom, whose variance is $2(n-1)$. This is a textbook result of statistics; we skip the proof and check it with the Monte Carlo below. Hence" />
          <M block tex={String.raw`\operatorname{Var}(\hat\sigma^2) = \frac{2\sigma^4}{n-1} \;\;\Rightarrow\;\; \operatorname{sd}(\hat\sigma) \approx \frac{\operatorname{sd}(\hat\sigma^2)}{2\sigma} = \frac{\sigma}{\sqrt{2(n-1)}}`} />
          <P ko={String.raw`둘째 단계는 $\hat\sigma = \sqrt{\hat\sigma^2}$ 의 기울기 $1/(2\sigma)$ 를 곱한 것입니다(작은 변화의 1차 근사). 상대오차를 $\varepsilon$ 이하로 하려면 $1/\sqrt{2(n-1)} \le \varepsilon$, 즉 $n \ge 1 + 1/(2\varepsilon^2)$ 입니다. $\varepsilon$ = 10 % 이면 ${fmt(n10)}개{{der:ch9#sigma-fit}}, 5 % 이면 ${fmt(n5)}개{{der:ch9#sigma-fit}}.`}
            en={String.raw`The second step multiplies by the slope $1/(2\sigma)$ of $\hat\sigma = \sqrt{\hat\sigma^2}$ (first-order approximation for small changes). For a relative error of at most $\varepsilon$ we need $1/\sqrt{2(n-1)} \le \varepsilon$, i.e. $n \ge 1 + 1/(2\varepsilon^2)$: ${fmt(n10)}{{der:ch9#sigma-fit}} samples for $\varepsilon$ = 10 %, ${fmt(n5)}{{der:ch9#sigma-fit}} for 5 %.`} />
          <P ko={String.raw`**독립이 아닐 때.** 추정기의 출력은 필터를 거친 값이라 이웃한 표본끼리 닮아 있습니다. 이 닮은 정도가 **자기상관**(autocorrelation)이고, 바로 옆 표본과의 상관계수를 $\rho$ 라 합시다. 닮은 표본 10개는 독립인 표본 10개만큼의 정보를 주지 못합니다. 이웃 상관이 $\rho^k$ 꼴로 줄어드는 정규 잡음이면 $x^2$ 의 상관은 $\rho^{2k}$ 입니다(이것도 통계의 결과이며 아래 몬테카를로로 확인합니다). $n$ 개를 평균한 값의 분산은 독립일 때의 분산에 '모든 시차 $k$ 의 상관을 양쪽으로 다 더한 값'을 곱한 것이고, 그 합은 등비급수입니다.`}
            en={String.raw`**When samples are not independent.** The estimator output has passed through a filter, so neighbouring samples resemble each other. That resemblance is the **autocorrelation**; let $\rho$ be the correlation with the next sample. Ten similar samples carry less information than ten independent ones. For Gaussian noise whose correlation decays as $\rho^k$, the correlation of $x^2$ is $\rho^{2k}$ (again a statistics result, checked by the Monte Carlo below). The variance of an average of $n$ such terms is that of independent ones times the sum of all correlations at every lag $k$, both directions — a geometric series:`} />
          <M block tex={String.raw`\sum_{k=-\infty}^{\infty}\rho^{2|k|} \;=\; 1 + 2\sum_{k=1}^{\infty}\rho^{2k} \;=\; 1 + \frac{2\rho^2}{1-\rho^2} \;=\; \frac{1+\rho^2}{1-\rho^2}`} />
          <P ko="표본분산의 분산이 이만큼 배로 커지므로, 그만큼 표본 수가 줄어든 것으로 치면 됩니다."
            en="The variance of the sample variance grows by this factor, which is equivalent to having proportionally fewer samples." />
          <M block tex={String.raw`n_{\text{eff}} \;\approx\; n\,\frac{1-\rho^2}{1+\rho^2},\qquad \frac{\operatorname{sd}(\hat\sigma)}{\sigma} \approx \frac{1}{\sqrt{2\,(n_{\text{eff}}-1)}}`} />
          <P ko={`숫자 예: 기본 주기 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} 로 60 s{{ex}} 를 기록하면 $n$ = 600{{der:ch9#sigma-fit|10 Hz × 60 s|10 Hz × 60 s}}. 표본이 독립이면 불확실도는 ${fmt(se600 * 100, 2)} %{{der:ch9#sigma-fit}} 이지만, $\\rho$ = 0.9{{ex}} 이면 $n_{\\text{eff}}$ ≈ ${fmt(neff, 2)}{{der:ch9#sigma-fit}} 이 되어 ${fmt(se600c * 100, 2)} %{{der:ch9#sigma-fit}} 로 나빠집니다. 60 s 는 이런 경우에도 ±10 % 안쪽에 들게 하려는 예시값입니다. 여러분의 $\\rho$ 는 아래 '내 로그를 넣어 보기' 데모의 ① 정지 로그 결과(이웃 상관 ρ 열)에 나옵니다. 바로 아래의 몬테카를로는 $\\rho$ 를 손으로 넣어 보는 실험입니다.`}
            en={`Numbers: logging at the default 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} for 60 s{{ex}} gives $n$ = 600{{der:ch9#sigma-fit|10 Hz × 60 s|10 Hz × 60 s}}. With independent samples the uncertainty is ${fmt(se600 * 100, 2)} %{{der:ch9#sigma-fit}}; with $\\rho$ = 0.9{{ex}}, $n_{\\text{eff}}$ ≈ ${fmt(neff, 2)}{{der:ch9#sigma-fit}} and it worsens to ${fmt(se600c * 100, 2)} %{{der:ch9#sigma-fit}}. The 60 s is an example value chosen to stay inside ±10 % even then. Your $\\rho$ appears in the static-log results (lag-1 correlation column) of the demo 'Try it with my own log' further below; the Monte Carlo right below lets you type $\\rho$ in by hand.`} />
        </Derivation>
        <SigmaMc />
        <Derivation id="static-check" title={{ ko: '세워 둔 기체의 흔들림은 비행 중 추정 오차와 같은가', en: 'Is the jitter of a parked vehicle the same as the in-flight estimate error?' }}>
          <P ko="같지 않습니다. 5장의 필터는 '기체가 가속할 수 있다'고 가정하고(프로세스 노이즈), 그 가정 때문에 생기는 불확실성까지 포함한 것이 예산의 $\sigma_{\text{est}}$ 입니다. 세워 둔 기체는 실제로 가속하지 않으므로, 로그에 보이는 흔들림은 그중 **측정 노이즈가 필터를 지나 새어 나온 몫**뿐입니다. 기호를 정합시다. $x$ 는 참 상태(위치와 속도), $\hat x$ 는 필터의 추정, $e = \hat x - x$ 는 추정 오차, $F$ 는 상태 전이행렬, $H$ 는 측정행렬, $K$ 는 정상상태 칼만 게인입니다. 측정은 $z = Hx + n$ 이고 $n \sim \mathcal N(0, R)$ 이 측정 노이즈입니다(5장에서 $v$ 는 속도였으므로 여기서는 $n$ 을 씁니다). 세 단계로 유도합니다. ① 세워 둔 기체는 속도가 0 이라 참 상태가 한 스텝 뒤에도 그대로입니다: $x^{+} = F x$. ② 필터는 예측한 뒤 측정으로 고칩니다: $\hat x^{+} = F\hat x + K\,(z - HF\hat x)$, 이때 $z = Hx^{+} + n = HFx + n$. ③ 둘째 식에서 첫째 식을 빼면 $e^{+} = Fe + K(HFx + n - HF\hat x) = (I - KH)\,F\,e + K\,n$ 입니다. 따라서"
            en="No. The filter of chapter 5 assumes the vehicle may accelerate (process noise), and the budget’s $\sigma_{\text{est}}$ includes the uncertainty caused by that assumption. A parked vehicle does not accelerate, so the jitter in its log is only **the part of the measurement noise that leaks through the filter**. Symbols: $x$ is the true state (position and velocity), $\hat x$ the filter estimate, $e = \hat x - x$ the estimate error, $F$ the transition matrix, $H$ the measurement matrix and $K$ the steady-state Kalman gain. The measurement is $z = Hx + n$ with measurement noise $n \sim \mathcal N(0, R)$ (in chapter 5 $v$ was the velocity, so we write $n$ here). Three steps. ① A parked vehicle has zero velocity, so its true state is unchanged one step later: $x^{+} = F x$. ② The filter predicts and then corrects: $\hat x^{+} = F\hat x + K\,(z - HF\hat x)$ with $z = Hx^{+} + n = HFx + n$. ③ Subtracting the first equation from the second gives $e^{+} = Fe + K(HFx + n - HF\hat x) = (I - KH)\,F\,e + K\,n$. Hence" />
          <M block tex={String.raw`e^{+} = \underbrace{(I - KH)\,F}_{A}\;e + K\,n,\quad n\sim\mathcal N(0,R) \;\;\Rightarrow\;\; \Sigma = A\,\Sigma\,A^{\mathsf T} + K R K^{\mathsf T},\quad \sigma_{\text{static}} = \sqrt{\Sigma_{pp}}`} />
          <P ko={`둘째 식은 '한 스텝 지나도 분산이 그대로'라는 정상상태 조건이고, 반복해서 풉니다. 비행 중에는 ① 이 $x^{+} = Fx + w$ (프로세스 노이즈 $w$, 공분산 $Q$)가 되어 오차 공분산에 $(I-KH)\\,Q\\,(I-KH)^{\\mathsf T}$ 가 더해집니다. 이 항은 음수가 될 수 없으므로 $\\sigma_{\\text{static}} \\le \\sigma_{\\text{est}}$ 입니다. 지금 설정으로 강당 한가운데에서는 수평 ${fmt(pred.staticH * 100, 3)} cm{{der:ch9#static-check}} 대 ${fmt(b.sigmaEstH * 100, 3)} cm{{der:ch9#static-check|예산의 σ_est (5장의 정상상태 식)|σ_est of the budget (steady-state formula of chapter 5)}}, 수직 ${fmt(pred.staticV * 100, 3)} cm{{der:ch9#static-check}} 대 ${fmt(b.sigmaEstV * 100, 3)} cm{{der:ch9#static-check|예산의 σ_est (5장의 정상상태 식)|σ_est of the budget (steady-state formula of chapter 5)}} 입니다. 수평 값은 둘 다 오차 예산과 같은 규약(두 축 합 $\\sigma_{\\text{pos,H}}$ 를 축마다 $\\sigma_{\\text{pos,H}}/\\sqrt2$ 로 나눠 1축 식을 적용한 뒤 $\\sqrt2$ 배, 3장)으로 계산해 바로 견줄 수 있습니다. 데모는 로그와 **같은 종류의 값**인 $\\sigma_{\\text{static}}$ 과 견주고, 둘이 같아지는 측정 노이즈 σ 를 이분법으로 찾아 줍니다(역산).`}
            en={`The second equation is the steady-state condition (the variance is unchanged after one step) and is solved by iteration. In flight, step ① becomes $x^{+} = Fx + w$ (process noise $w$ with covariance $Q$), which adds $(I-KH)\\,Q\\,(I-KH)^{\\mathsf T}$ to the error covariance. That term cannot be negative, so $\\sigma_{\\text{static}} \\le \\sigma_{\\text{est}}$. With the current settings at the hall centre: horizontal ${fmt(pred.staticH * 100, 3)} cm{{der:ch9#static-check}} versus ${fmt(b.sigmaEstH * 100, 3)} cm{{der:ch9#static-check|예산의 σ_est (5장의 정상상태 식)|σ_est of the budget (steady-state formula of chapter 5)}}, vertical ${fmt(pred.staticV * 100, 3)} cm{{der:ch9#static-check}} versus ${fmt(b.sigmaEstV * 100, 3)} cm{{der:ch9#static-check|예산의 σ_est (5장의 정상상태 식)|σ_est of the budget (steady-state formula of chapter 5)}}. Both horizontal values use the error budget's convention (the two-axis $\\sigma_{\\text{pos,H}}$ split as $\\sigma_{\\text{pos,H}}/\\sqrt2$ per axis, the one-axis formula applied, then times $\\sqrt2$; chapter 3), so they compare directly. The demo compares the log with $\\sigma_{\\text{static}}$, the **same kind of quantity**, and finds by bisection the measurement noise σ that makes them equal (back-calculation).`} />
          <P ko="**이 부등식이 기대는 해석.** 위 논리는 가속도 프로세스 노이즈 $\sigma_a$({{cfg:estimation.accelNoise}})를 5장의 1차원 모델처럼 '모르는 움직임'으로 볼 때 성립합니다. 5장의 융합 필터처럼 IMU 를 입력으로 써서 $\sigma_a$ 가 '가속도계가 틀리는 정도'를 뜻한다면, 그 잡음은 세워 둔 기체에도 있으므로 $\sigma_{\text{static}}$ 은 $\sigma_{\text{est}}$ 에 가까워집니다. 게다가 프로펠러를 돌리지 않는 정지 시험에는 비행 중 진동이 없어서 가속도계 잡음이 비행 때보다 작습니다. 정지 시험은 어느 해석의 $\sigma_a$ 도 정확히 재지 못하므로, 데모는 두 해석으로 역산한 측정 노이즈를 함께 보여 줍니다. 참값은 그 사이에 있다고 보세요."
            en="**The interpretation this inequality relies on.** The argument holds when the acceleration process noise $\sigma_a$ ({{cfg:estimation.accelNoise}}) means 'unknown motion', as in the 1-D model of chapter 5. If, as in the fusion filter of chapter 5, the IMU is an input and $\sigma_a$ means 'how wrong the accelerometer is', that noise is present on a parked vehicle too, and $\sigma_{\text{static}}$ moves towards $\sigma_{\text{est}}$. Moreover a static test with the propellers off has none of the in-flight vibration, so the accelerometer noise is smaller than in flight. A static test therefore measures neither interpretation of $\sigma_a$ exactly; the demo shows the measurement noise back-calculated under both, and the true value lies in between." />
          <P ko="이것은 교재의 개념 모델을 로그에 맞추는 일이지, Crazyflie 펌웨어의 필터를 재현하는 일이 아닙니다. 펌웨어의 추정기가 가정하는 측정 노이즈 표준편차의 기본값은 TDoA 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}}, TWR 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} 이고, 여러분이 잰 값과 다를 수 있습니다."
            en="This fits the conceptual model of the textbook to the log; it does not reproduce the filter in the Crazyflie firmware. The firmware estimator assumes default measurement-noise standard deviations of 0.15 m{{lit:cf-firmware-docs/tdoa-noise-std}} for TDoA and 0.25 m{{lit:cf-firmware-docs/twr-noise-std}} for TWR, which may differ from what you measure." />
        </Derivation>
      </Section>

      <Section id="range" title={{ ko: '실험 2 — 앵커별 편향과 거리 노이즈', en: 'Experiment 2 — per-anchor bias and range noise' }}>
        <P ko="추정 위치 대신 **원시 거리**(또는 거리차)를 기록하면 필터와 기하를 거치기 전의 값을 직접 볼 수 있습니다. 기준이 되는 거리를 알면 앵커마다의 **편향**도 나옵니다."
          en="Logging **raw ranges** (or range differences) instead of the estimated position shows the values before the filter and the geometry. With a reference distance, the **bias** of each anchor comes out as well." />
        <List ordered items={[
          { ko: '앵커 좌표를 설정한 뒤(6장), 기체를 받침대에 올려 강당의 한 점에 둡니다. 그 점의 좌표 $p_{\\text{tag}}$ 를 앵커를 측량할 때와 같은 기준점·같은 방법(줄자, 레이저 거리계)으로 잽니다. 기체와 앵커 사이에는 아무것도 없게 합니다. **안테나 사이 거리를 줄자로 직접 재서 기준으로 쓰지 마세요.** 그 거리도 UWB 거리도 앵커의 **실제** 위치를 쓰므로, 설정에 넣은 좌표가 틀린 것이 차이에 나타나지 않습니다.', en: 'After setting the anchor coordinates (chapter 6), put the vehicle on a stand at one point of the hall and measure that point $p_{\\text{tag}}$ with the same reference point and method (tape, laser meter) used for the anchor survey. Keep everything out from between the vehicle and the anchors. **Do not use antenna-to-antenna tape distances as the reference**: both those distances and the UWB ranges use the **actual** anchor positions, so an error in the configured coordinates would not show up in the difference.' },
          { ko: '**원시 측정을 꺼내는 길.** 펌웨어가 측위에 쓰는 원시 거리(TWR)나 거리차(TDoA)를 로그 변수로 내보낼 수 있는지, 그 변수 이름이 무엇인지는 교재가 확인하지 않았습니다. [Crazyflie 펌웨어 문서](https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/)의 로그 변수 목록에서 LPS·TDoA 항목을 찾아 보세요. 찾지 못하면 이 실험 대신 실험 1 로 측정 노이즈를 역산합니다.', en: '**How to get the raw measurements.** Whether the firmware can log the raw ranges (TWR) or range differences (TDoA) it uses, and under what variable names, has not been verified by the textbook. Look for the LPS and TDoA entries in the list of log variables of the [Crazyflie firmware documentation](https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/). If you cannot find them, back-calculate the measurement noise with experiment 1 instead.' },
          { ko: '**TWR 이면** 앵커별 거리 측정값을 기록하고, 기준 거리 $d_a = \\lVert p_{\\text{tag}} - a_a^{\\text{cfg}}\\rVert$ ($a_a^{\\text{cfg}}$ = 설정에 넣은 앵커 $a$ 의 좌표)를 데모의 앵커별 \'기준 거리\' 칸에 넣습니다. 데모에 태그 위치를 넣고 \'설정의 앵커 좌표로 기준 거리 채우기\'를 누르면 대신 계산합니다. **TDoA 이면** 앵커 쌍 $(i, j)$ 마다 거리차가 나옵니다. 같은 방식으로 $d_j - d_i$ 를 설정 좌표에서 계산해 데모의 쌍별 \'기준 거리차\' 칸에 넣습니다(6장의 TDoA 측정 모델과 같은 부호).', en: '**With TWR**, log the range per anchor and type the reference distance $d_a = \\lVert p_{\\text{tag}} - a_a^{\\text{cfg}}\\rVert$ ($a_a^{\\text{cfg}}$ = configured coordinates of anchor $a$) into the per-anchor \'reference distance\' field of the demo; entering the tag position and pressing \'Fill reference distances from the configured anchors\' computes them for you. **With TDoA** each anchor pair $(i, j)$ gives a range difference; compute $d_j - d_i$ the same way from the configured coordinates and type it into the per-pair \'reference difference\' field (same sign as the TDoA measurement model of chapter 6).' },
          { ko: '앵커(또는 쌍)마다 500개{{ex}} 쯤 기록합니다. 그러면 σ 는 몇 % 안으로 정해지고, 이상치가 지금 설정의 NLOS 확률({{cfg:uwb.pNlos}})만큼 섞여 있을 때 수십 개가 모입니다.', en: 'Record about 500{{ex}} per anchor (or pair). That fixes σ to a few percent and collects a few dozen outliers when they occur with the NLOS probability of the current settings ({{cfg:uwb.pNlos}}).' },
          { ko: '가까운 거리와 먼 거리에서 한 번씩 되풀이해, 편향이 거리에 따라 달라지는지 봅니다.', en: 'Repeat once at a short and once at a long distance to see whether the bias changes with distance.' },
          { ko: '사람이 사이에 서 있는 조건으로 한 번 더 기록하면 NLOS(4장) 꼬리가 어떻게 생기는지 볼 수 있습니다.', en: 'Record once more with a person standing in between to see what the NLOS tail (chapter 4) looks like.' },
          { ko: '앵커마다 평균·중앙값·σ·강건 σ·이상치 비율을 계산합니다.', en: 'Compute mean, median, σ, robust σ and outlier ratio for each anchor.' },
        ]} />
        <Derivation id="nlos-fit" title={{ ko: '편향, 강건한 σ, 꼬리에서 NLOS 모델 읽기', en: 'Bias, a robust σ, and reading the NLOS model off the tail' }}>
          <P ko="앵커 $a$ 의 측정값을 $r_{a,i}$, 기준 거리(줄자로 잰 태그 위치와 설정의 앵커 좌표 사이 거리)를 $d_a$ 라 하면 편향은 '보통의 측정값'과 기준 거리의 차입니다. 평균이 아니라 **중앙값**을 씁니다. 평균은 NLOS 이상치에 끌려 올라가지만(평균 $p\,m$ 만큼, 아래 참고) 중앙값은 거의 움직이지 않기 때문입니다."
            en="With measurements $r_{a,i}$ of anchor $a$ and the reference distance $d_a$ (between the taped tag position and the configured anchor coordinates), the bias is the difference between the typical measurement and the reference distance. We use the **median** rather than the mean: the mean is pulled up by the NLOS outliers (by $p\,m$ on average, see below), the median hardly at all." />
          <M block tex={String.raw`\hat b_a = \operatorname{median}(r_a) - d_a`} />
          <P ko="평균은 이상치 몇 개에 끌려갑니다. 그래서 '몸통'의 폭도 **중앙값**에서 벗어난 양의 중앙값인 **중앙절대편차**(MAD, median absolute deviation)로 잽니다. 정규분포 $\mathcal N(0,\sigma^2)$ 에서 $|x| \le c$ 일 확률이 50 % 가 되는 $c$ 가 MAD 이므로 $\Phi(c/\sigma) = 0.75$, 즉 $c = \Phi^{-1}(0.75)\,\sigma$ 이고 $\Phi^{-1}(0.75)$ = 0.6745{{der:ch9#nlos-fit|표준정규분포의 75 % 분위수 Φ⁻¹(0.75)|75th percentile of the standard normal, Φ⁻¹(0.75)}} 입니다($\Phi$ 는 표준정규분포의 누적분포함수). 따라서"
            en="A mean is dragged by a few outliers. So the width of the 'core' is also measured from the **median**, with the **median absolute deviation** (MAD): the median of the distances from the median. For a normal $\mathcal N(0,\sigma^2)$ the MAD is the $c$ with a 50 % chance of $|x| \le c$, so $\Phi(c/\sigma) = 0.75$, i.e. $c = \Phi^{-1}(0.75)\,\sigma$ with $\Phi^{-1}(0.75)$ = 0.6745{{der:ch9#nlos-fit|표준정규분포의 75 % 분위수 Φ⁻¹(0.75)|75th percentile of the standard normal, Φ⁻¹(0.75)}} ($\Phi$ is the cumulative distribution function of the standard normal). Hence" />
          <M block tex={String.raw`\hat\sigma_{\text{rob}} = \frac{\operatorname{MAD}}{0.6745} = 1.4826\cdot\operatorname{median}_i\,\big|\,r_{a,i} - \operatorname{median}(r_a)\big|`} />
          <P ko="4장의 모델은 확률 $p$ 로 평균 $m$ 인 지수분포 편향이 **더해진다**는 것이었습니다. 문턱 $c = 3\hat\sigma_{\text{rob}}$ 보다 큰 잔차만 봅시다(배수 3{{ex}} 은 이 교재가 고른 값입니다). 지수분포는 '이미 $c$ 를 넘었다'는 조건을 걸어도 남은 양의 분포가 그대로라는 성질(무기억성)이 있어서, 넘은 것들의 평균 초과분이 곧 $m$ 이고 넘을 확률은 $p\,e^{-c/m}$ 입니다."
            en="The model of chapter 4 **adds**, with probability $p$, an exponentially distributed bias of mean $m$. Look only at residuals above the threshold $c = 3\hat\sigma_{\text{rob}}$ (the factor 3{{ex}} is a choice of this textbook). An exponential distribution is memoryless — given that $c$ is already exceeded, the remaining excess has the same distribution — so the mean excess is $m$ and the probability of exceeding is $p\,e^{-c/m}$." />
          <M block tex={String.raw`\hat m = \operatorname{mean}\big(r - c \;\big|\; r > c\big),\qquad \hat p = \big(q_{\text{out}} - 0.00135\big)\,e^{\,c/\hat m}`} />
          <P ko="$q_{\text{out}}$ 은 문턱을 넘은 측정의 비율이고, $1 - \Phi(3)$ = 0.00135{{der:ch9#nlos-fit|표준정규분포가 +3σ 를 넘을 확률 1 − Φ(3)|Probability that a standard normal exceeds +3σ, 1 − Φ(3)}} 는 NLOS 가 없어도 정규 잡음만으로 넘는 몫이라 빼 줍니다. 정규 잡음과 편향이 섞이는 효과를 무시한 **거친** 추정이므로, 문턱을 넘은 측정이 수십 개는 있어야 쓸 만합니다."
            en="$q_{\text{out}}$ is the share of measurements above the threshold; $1 - \Phi(3)$ = 0.00135{{der:ch9#nlos-fit|표준정규분포가 +3σ 를 넘을 확률 1 − Φ(3)|Probability that a standard normal exceeds +3σ, 1 − Φ(3)}} is the share that Gaussian noise alone exceeds without any NLOS, so it is subtracted. This is a **rough** estimate that ignores the mixing of noise and bias; it needs a few dozen measurements above the threshold to be usable." />
          <P ko="**앵커 좌표 오차의 어림.** $\hat b_a$ 에는 세 가지가 섞입니다. ⓐ 모든 앵커에 공통인 몫. 예를 들어 **안테나 지연**(antenna delay, 신호가 칩과 안테나 사이를 오가는 시간)을 보정한 상수가 틀리면 장치마다 일정한 거리 오차가 생기고, NLOS 도 중앙값을 조금 밀어 올립니다. 이것은 좌표 오차가 아닙니다. ⓑ 앵커마다 다른 몫. 앵커의 실제 위치가 설정 좌표에서 $\delta a_a$ 만큼 어긋나 있으면, UWB 는 실제 위치까지 재고 $d_a$ 는 설정 좌표로 계산했으므로 차이에 그 어긋남의 시선 방향 성분 $e_a^{\mathsf T}\delta a_a$ 가 들어갑니다($e_a$ 는 앵커와 태그를 잇는 단위벡터, 6장의 측정 모델과 같은 꼴). 앵커마다 다른 거리 편향(예: 앵커마다 다른 안테나 지연)도 섞일 수 있는데(이 교재가 확인한 문헌은 없습니다), 위치에 미치는 효과가 좌표 오차의 시선 방향 몫과 같은 꼴이라 예산의 같은 칸에 들어가도 됩니다. 줄자로 잰 태그 위치의 오차도 앵커마다 다르게 투영되어 여기에 섞이므로, 태그 위치는 앵커만큼 신중히 잽니다. $d_a$ 를 안테나 사이 줄자 거리로 잡으면 좌표 오차는 ⓑ에서 사라지고 앵커별 거리 편향만 남습니다. ⓒ 중앙값 추정 자체의 흔들림. 정규 잡음이면 표준오차가 약 $\sqrt{\pi/2}\,\hat\sigma_{\text{rob}}/\sqrt{n_a}$ 입니다(통계 교과서의 결과, $n_a$ 는 앵커 $a$ 의 표본 수). 그래서 ⓐ를 평균 $\bar b$ 로 빼고 ⓒ의 분산을 뺀 앵커 간 표준편차를 6장의 앵커 측량 오차 어림으로 씁니다($A$ 는 기준 거리를 넣은 앵커 수). 이 값은 좌표 오차를 이미 담고 있으므로 6장의 재측량 값에 더하지 않고 대신합니다."
            en="**A rough figure for the anchor coordinate error.** $\hat b_a$ mixes three things. ⓐ A part common to all anchors: for example a wrong calibration constant for the **antenna delay** (the time the signal takes between the chip and the antenna) gives a fixed range error per device, and NLOS also pushes the median up a little. This is not a coordinate error. ⓑ A part that differs between anchors. If anchor $a$ actually sits $\delta a_a$ away from its configured coordinates, the UWB measures to the actual position while $d_a$ was computed from the configured one, so the difference contains the line-of-sight component $e_a^{\mathsf T}\delta a_a$ of that offset ($e_a$ is the unit vector between anchor and tag, the same form as the measurement model of chapter 6). Per-anchor ranging biases (e.g. antenna delays that differ between anchors) may mix in as well (the textbook has no verified source on this); their effect on position has the same form as the line-of-sight part of a coordinate error, so they belong in the same budget line. The error of the taped tag position also projects differently onto each anchor and mixes in here, so measure the tag position as carefully as the anchors. If $d_a$ is an antenna-to-antenna tape distance instead, the coordinate error vanishes from ⓑ and only the per-anchor ranging bias remains. ⓒ The scatter of the median estimate itself: for Gaussian noise its standard error is about $\sqrt{\pi/2}\,\hat\sigma_{\text{rob}}/\sqrt{n_a}$ (a textbook statistics result; $n_a$ is the number of samples of anchor $a$). So we remove ⓐ with the mean $\bar b$, subtract the variance of ⓒ, and use the remaining spread across anchors as a rough figure for the anchor survey error of chapter 6 ($A$ is the number of anchors with a reference distance). It already contains the coordinate error, so it replaces the re-survey value of chapter 6 rather than adding to it." />
          <M block tex={String.raw`\hat\delta \;=\; \sqrt{\;\frac{1}{A-1}\sum_{a}\big(\hat b_a - \bar b\big)^2 \;-\; \frac{1}{A}\sum_a \frac{\pi}{2}\,\frac{\hat\sigma_{\text{rob},a}^2}{n_a}\;}`} />
        </Derivation>
      </Section>

      <Section id="latency" title={{ ko: '실험 3 — 왕복 지연', en: 'Experiment 3 — round-trip latency' }}>
        <P ko="7장의 루프 지연에 들어가는 편도 통신 지연 $\tau_c$ 를 잽니다. 크기의 감을 잡자면, Crazyswarm 은 모션캡처 위치를 올려보내는 경로에서 49대일 때 약 26 ms{{lit:crazyswarm2017/latency}} 를 쟀고, 같은 구성의 기체 한 대에 대해서는 약 11 ms{{lit:util2022/latency}} 가 인용됩니다. 여러분의 UWB 구성에서 얼마인지는 재 봐야 압니다."
          en="We measure the one-way communication delay $\tau_c$ that enters the loop delay of chapter 7. For scale: Crazyswarm measured about 26 ms{{lit:crazyswarm2017/latency}} with 49 vehicles on the path that sends motion-capture positions up, and about 11 ms{{lit:util2022/latency}} is quoted for a single vehicle in the same setup. What it is in your UWB setup must be measured." />
        <Predict id="ch9-which-clock"
          question={{ ko: 'PC 가 핑을 보낸 시각은 PC 로그에, 기체가 그 핑을 받은 시각은 기체 로그에 있습니다. "받은 시각 − 보낸 시각"을 계산하면 무엇이 나올까요?', en: 'The time the PC sent a ping is in the PC log; the time the vehicle received it is in the vehicle log. What does "receive time − send time" give?' }}
          choices={[
            { label: { ko: '편도 지연 그대로', en: 'The one-way delay itself' } },
            { label: { ko: '편도 지연에, 알 수 없는 상수가 더해진 값 (게다가 천천히 변한다)', en: 'The one-way delay plus an unknown constant (which also changes slowly)' }, correct: true },
            { label: { ko: '왕복 지연', en: 'The round-trip delay' } },
          ]}
          explain={{
            ko: '두 시각은 **서로 다른 시계**로 찍혔습니다. 기체의 시계와 PC 의 시계는 0 으로 삼는 순간이 다르므로 그 차이(오프셋)가 그대로 더해지고, 두 시계가 가는 빠르기도 조금 달라서 오프셋이 천천히 변합니다. 오프셋은 재려는 지연보다 수천 배 클 수도, 음수일 수도 있습니다. 해결책은 시계를 맞추는 것이 아니라 **한 시계로 왕복을 재는 것**입니다. 아래 유도와 함정 실험실에서 확인하세요.',
            en: 'The two stamps come from **different clocks**. The vehicle clock and the PC clock take different instants as zero, so that difference (the offset) is added in full, and they also tick at slightly different rates, so the offset changes slowly. The offset may be thousands of times larger than the delay you want, or negative. The remedy is not to align the clocks but to **time the round trip on one clock**. See the derivations and the pitfall lab below.',
          }} />
        <List ordered items={[
          { ko: '지상 PC 의 프로그램이 **순번**(sequence number) $k = 0, 1, 2, \\dots$ 을 붙인 핑을 일정한 주기로 보내고, 보낸 순간의 시각 `t_send` 를 적습니다. 시각은 도중에 고쳐지지 않는 **단조 시계**(monotonic clock, 컴퓨터 시각을 맞춰도 거꾸로 가거나 건너뛰지 않는 시계)로 재세요. Python 이라면 예를 들어 `time.monotonic()` 이나 `time.perf_counter()` 입니다.', en: 'A program on the ground PC sends pings carrying a **sequence number** $k = 0, 1, 2, \\dots$ at a fixed rate and records the send time `t_send`. Use a **monotonic clock** (one that never jumps or runs backwards when the computer time is adjusted) — in Python, for example, `time.monotonic()` or `time.perf_counter()`.' },
          { ko: '기체가 받은 순번을 되돌려 보내게 합니다. **어떤 수단으로 되돌려 보낼 수 있는지는 이 교재가 확인하지 않았습니다.** 생각할 수 있는 방식의 예를 둘 들면 ⓐ PC 가 순번을 기체의 설정값(매개변수) 하나에 써 넣고 그 값을 로그로 다시 받는 방식(펌웨어를 고치지 않아도 될 수 있지만, 로그 주기만큼의 기다림이 아래 $\\tau_{\\text{turn}}$ 에 섞입니다), ⓑ 받은 패킷을 곧바로 되돌리는 코드를 펌웨어에 넣는 방식($\\tau_{\\text{turn}}$ 이 작지만 펌웨어를 빌드해야 합니다)이 있습니다. 실제로 쓸 수 있는 기능과 이름은 [Crazyflie 펌웨어 문서](https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/)와 [Crazyswarm2 공식 문서](https://imrclab.github.io/crazyswarm2/)에서 찾으세요. PC 는 메아리가 도착한 순간의 시각 `t_recv` 를 **같은 PC, 같은 시계**로 적습니다. 기체의 시계는 쓰지 않습니다.', en: 'Have the vehicle send the received number back. **Which means exist for that has not been verified by the textbook.** Two conceivable examples: ⓐ the PC writes the number into one of the vehicle’s settings (parameters) and receives the value back through a log (perhaps without changing the firmware, but the wait for the log period is mixed into $\\tau_{\\text{turn}}$ below); ⓑ code in the firmware that bounces each received packet straight back (small $\\tau_{\\text{turn}}$, but the firmware must be rebuilt). Find the features and names actually available in the [Crazyflie firmware documentation](https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/) and the [official Crazyswarm2 documentation](https://imrclab.github.io/crazyswarm2/). The PC records the arrival time of the echo, `t_recv`, on the **same PC and the same clock**. The vehicle clock is not used.' },
          { ko: '실제 운용과 같은 조건에서 잽니다: 5대를 모두 켜고, 같은 채널과 같은 로그 설정으로.', en: 'Measure under operating conditions: all five vehicles on, same channel, same logging configuration.' },
          { ko: '핑 1200개{{ex}} 쯤(20 Hz{{ex}} 로 60 s{{ex}})을 기록합니다. 95 % 분위수 위쪽에 60개{{der:ch9#latency-fit|1200 × 5 %|1200 × 5 %}} 가 남아야 꼬리가 보입니다.', en: 'Record about 1200{{ex}} pings (60 s{{ex}} at 20 Hz{{ex}}). That leaves 60{{der:ch9#latency-fit|1200 × 5 %|1200 × 5 %}} above the 95th percentile — enough to see the tail.' },
          { ko: '왕복 시간의 절반을 편도 지연으로 삼아 평균과 분위수를 구합니다.', en: 'Take half the round-trip time as the one-way delay and compute its mean and percentiles.' },
        ]} />
        <Derivation id="clock-offset" title={{ ko: '서로 다른 시계를 빼면 무엇이 남나', en: 'What is left when you subtract two different clocks' }}>
          <P ko="PC 시계가 가리키는 시각을 $t$ 라 하고, 기체 시계는 같은 순간에 $t' = (1+\epsilon)\,t + \theta$ 를 가리킨다고 합시다. $\theta$ [s] 는 두 시계의 **오프셋**, $\epsilon$ 은 빠르기의 차이(ppm 단위의 작은 수)입니다. PC 가 $t_{\text{send}}$ 에 보낸 핑이 $\tau$ 뒤에 기체에 도착하면 기체는"
            en="Let $t$ be the PC clock reading and let the vehicle clock read $t' = (1+\epsilon)\,t + \theta$ at the same instant. $\theta$ [s] is the **offset** between the clocks and $\epsilon$ the rate difference (a small number, in ppm). A ping sent at $t_{\text{send}}$ arrives $\tau$ later, and the vehicle stamps" />
          <M block tex={String.raw`t'_{\text{rx}} = (1+\epsilon)\,(t_{\text{send}} + \tau) + \theta \quad\Longrightarrow\quad t'_{\text{rx}} - t_{\text{send}} \;=\; \tau \;+\; \underbrace{\theta}_{\tx{모르는 상수}{unknown constant}} \;+\; \underbrace{\epsilon\,(t_{\text{send}} + \tau)}_{\tx{시간에 따라 자란다}{grows with time}}`} />
          <P ko="을 적습니다. 빼서 나온 값은 지연 $\tau$ 가 아니라 $\tau + \theta + \epsilon t$ 입니다. 왕복에서는 메아리가 PC 에 도착한 시각 $t_{\text{recv}} = t_{\text{send}} + \tau_{\uparrow} + \tau_{\downarrow}$ 도 PC 시계로 적으므로, 빼면 $\theta$ 와 $\epsilon$ 이 **나타나지 않습니다**."
            en="The difference is not the delay $\tau$ but $\tau + \theta + \epsilon t$. In a round trip the echo arrival $t_{\text{recv}} = t_{\text{send}} + \tau_{\uparrow} + \tau_{\downarrow}$ is also stamped on the PC clock, so $\theta$ and $\epsilon$ **never appear** in the difference." />
          <P ko="1장에서 UWB 가 거리를 잴 때 쓴 것과 같은 요령입니다. 양방향 거리 측정도 두 장치의 시계를 맞추지 않고, 한쪽 시계로 잰 왕복 시간에서 상대의 응답 시간을 빼고 반으로 나눕니다{{lit:dstwr/ss-twr-formula}}."
            en="It is the same trick UWB uses for ranging in chapter 1: two-way ranging does not align the two clocks either; it takes the round-trip time on one clock, subtracts the reply time of the other device and halves the result{{lit:dstwr/ss-twr-formula}}." />
        </Derivation>
        <Derivation id="latency-fit" title={{ ko: '왕복에서 편도로, 그리고 평균이 아니라 분위수', en: 'From round trip to one way — and percentiles rather than the mean' }}>
          <P ko="핑 $i$ 의 **왕복 시간**(round-trip time)은 올라가는 지연과 내려오는 지연, 그리고 기체가 되돌려 보내는 데 쓴 시간의 합입니다."
            en="The **round-trip time** of ping $i$ is the sum of the upward delay, the downward delay and the time the vehicle takes to turn the ping around." />
          <M block tex={String.raw`T_i = t_{\text{recv},i} - t_{\text{send},i} = \tau_{\uparrow,i} + \tau_{\text{turn},i} + \tau_{\downarrow,i} \qquad\Longrightarrow\qquad \hat\tau_i = \tfrac{1}{2}\,T_i`} />
          <P ko="절반으로 나누는 데에는 가정이 두 개 들어 있습니다. ① **대칭**: 오가는 길의 지연이 평균적으로 같다. ② 되돌리는 시간 $\tau_{\text{turn}}$ 은 무시할 만하다(알고 있다면 먼저 빼세요). 메아리가 주기적인 로그를 타고 돌아온다면 그 주기만큼의 기다림(0 부터 한 주기 사이)이 $\tau_{\text{turn}}$ 에 섞입니다. 예산은 방송 주기를 따로 더하므로(7장) 두 번 세지 않도록, 가능한 한 빠른 경로로 되돌려 보내세요."
            en="Halving hides two assumptions. ① **Symmetry**: the two directions take equally long on average. ② The turnaround time $\tau_{\text{turn}}$ is negligible (if you know it, subtract it first). If the echo returns through a periodic log, the wait for the next period (between zero and one period) is mixed into $\tau_{\text{turn}}$. The budget adds the broadcast period separately (chapter 7), so to avoid counting it twice send the echo back by the fastest path available." />
          <P ko="**왜 분위수인가.** 지연의 분포는 대개 한쪽으로 꼬리가 깁니다. 예산이 묻는 것은 '보통 얼마나 늦나'가 아니라 '늦을 때 얼마나 늦나'이므로 **분위수**(percentile)를 봅니다. $p_{95}$ 는 지연의 95 % 가 그보다 작은 값입니다."
            en="**Why percentiles.** Delay distributions usually have a long tail on one side. The budget does not ask how late it usually is but how late it is when it is late, so we look at **percentiles**: $p_{95}$ is the value below which 95 % of the delays fall." />
          <P ko="**지터를 분위수에서 구하기.** 교재의 모델은 편도 지연을 '평균 ± 지터', 즉 $\bar\tau - J$ 부터 $\bar\tau + J$ 사이의 균등분포로 씁니다(예산이 쓰는 최댓값이 $\bar\tau + J$ 입니다). 그런데 $\hat\tau_i$ 는 두 편도 지연의 **평균**이라 모양이 다릅니다. 서로 독립인 균등분포 둘의 평균은 가운데가 뾰족하고 폭이 $\pm J$ 인 **삼각분포**입니다. 꼭짓점 높이가 $1/J$ 인 이 삼각형에서 $\bar\tau + x$ 보다 위쪽 끝부분의 넓이는 $(J - x)^2/(2J^2)$ 이므로, 이것이 5 % 가 되는 점은"
            en="**Getting the jitter from percentiles.** The textbook model writes the one-way delay as 'mean ± jitter', i.e. uniform between $\bar\tau - J$ and $\bar\tau + J$ (the maximum the budget uses is $\bar\tau + J$). But $\hat\tau_i$ is the **mean** of two one-way delays and has a different shape: the mean of two independent uniforms is a **triangular** distribution, peaked in the middle, with width $\pm J$. In this triangle of peak height $1/J$ the area of the tip above $\bar\tau + x$ is $(J - x)^2/(2J^2)$, so it equals 5 % at" />
          <M block tex={String.raw`\frac{(J-x)^2}{2J^2} = 0.05 \;\Rightarrow\; x = (1-\sqrt{0.1})\,J \approx 0.684\,J`} />
          <M block tex={String.raw`w = \frac{p_{95}(\hat\tau) - p_{5}(\hat\tau)}{2},\qquad J = \frac{w}{1-\sqrt{0.1}}`} />
          <P ko="입니다. 즉 5~95 % 폭의 절반 $w$ 를 0.684{{der:ch9#latency-fit|1 − √0.1|1 − √0.1}} 로 나눠야 편도 지터 $J$ 가 됩니다. 폭을 그대로 $J$ 로 쓰면 약 3분의 1 작게 나옵니다. 최솟값·최댓값을 쓰지 않고 분위수에서 환산하는 이유는, 끝값은 이상치 하나에 크게 흔들리기 때문입니다. 이 환산은 '두 편도가 독립이고 균등분포'라는 모델에 기댑니다. 로그의 분포가 삼각형과 크게 다르면(데모의 점선과 비교) 모델이 맞지 않는 것이니, 예산을 로그의 p99 나 최댓값으로도 확인하세요."
            en="So half the 5–95 % width, $w$, must be divided by 0.684{{der:ch9#latency-fit|1 − √0.1|1 − √0.1}} to give the one-way jitter $J$; using the width directly as $J$ comes out about a third too small. We convert from percentiles rather than using the minimum and maximum because the extremes swing with a single outlier. The conversion relies on the model 'two independent, uniform legs'. If the distribution in the log looks very different from a triangle (compare with the dashed curve of the demo), the model does not fit; then check the budget against the p99 or the maximum of the log as well." />
        </Derivation>
        <EstimatorLink />
      </Section>

      <Section id="loss" title={{ ko: '실험 4 — 패킷 손실', en: 'Experiment 4 — packet loss' }}>
        <P ko="실험 3 의 로그에 답이 이미 들어 있습니다. 돌아오지 않은 핑은 로그에 줄이 없으므로, **빠진 순번**이 곧 손실입니다. Crazyswarm2 문서는 유니캐스트 패킷이 가끔 손실되는 것을 알려진 한계로 적고 있습니다{{lit:crazyswarm2-docs/known-limitation}}. 얼마나 자주, 얼마나 몰아서 빠지는지는 재 봐야 압니다."
          en="The log of experiment 3 already holds the answer. A ping that never returned has no row, so the **missing sequence numbers** are the losses. The Crazyswarm2 documentation lists occasional loss of unicast packets as a known limitation{{lit:crazyswarm2-docs/known-limitation}}. How often and in what bursts must be measured." />
        <List ordered items={[
          { ko: '실험 3 과 같은 로그를 씁니다. 첫 순번부터 마지막 순번까지를 훑어 받았으면 0, 빠졌으면 1 인 수열을 만듭니다.', en: 'Use the same log as experiment 3. Walk from the first to the last sequence number and build a sequence with 0 for received and 1 for missing.' },
          { ko: '손실률 = 빠진 개수 ÷ 보낸 개수. 분모는 받은 개수가 아니라 **보낸** 개수입니다.', en: 'Loss rate = number missing ÷ number sent. The denominator is the number **sent**, not received.' },
          { ko: '이웃한 두 칸을 차례로 보며 "받음→빠짐"과 "빠짐→받음"이 몇 번 일어났는지 셉니다.', en: 'Look at each pair of neighbours and count how often "received→missing" and "missing→received" occur.' },
          { ko: '기체를 강당의 먼 구석에 두거나 사람이 가리는 조건에서도 한 번 재서, 가장 나쁜 경우를 봅니다.', en: 'Measure once more with the vehicle in a far corner or with a person in the way, to see the worst case.' },
        ]} />
        <Derivation id="loss-fit" title={{ ko: '전이 횟수에서 2상태 손실 모델로', en: 'From transition counts to the two-state loss model' }}>
          <P ko="7장의 길버트-엘리엇 모델에서 가장 단순한 경우, 즉 Good 상태에서는 전혀 빠지지 않고 Bad 상태에서는 모두 빠지는 경우를 씁니다(지금 설정은 Good 상태 손실률 $h_G$ = {{cfg:comm.loss.lossGood}}, Bad 상태 손실률 $h_B$ = {{cfg:comm.loss.lossBad}} 이고, 데모의 '전역 설정에 반영'은 이 둘도 0 %, 100 % 로 함께 넣습니다). 그러면 로그의 0 과 1 이 곧 상태입니다. 이웃한 쌍 가운데 앞이 0 인 것이 $N_G$ 개, 그중 뒤가 1 인 것이 $N_{GB}$ 개, 앞이 1 인 것이 $N_B$ 개, 그중 뒤가 0 인 것이 $N_{BG}$ 개라면"
            en="We use the simplest case of the Gilbert–Elliott model of chapter 7: nothing is lost in Good and everything in Bad (the current settings have $h_G$ = {{cfg:comm.loss.lossGood}} and $h_B$ = {{cfg:comm.loss.lossBad}}; the demo’s 'Apply to global settings' also sets them to 0 % and 100 %). Then the 0s and 1s of the log are the states. Among neighbouring pairs let $N_G$ start with 0, of which $N_{GB}$ end with 1; let $N_B$ start with 1, of which $N_{BG}$ end with 0. Then" />
          <M block tex={String.raw`\hat p_{GB} = \frac{N_{GB}}{N_G},\qquad \hat p_{BG} = \frac{N_{BG}}{N_B},\qquad \tx{평균 연속 손실 길이}{mean burst length} = \frac{1}{\hat p_{BG}}`} />
          <P ko="입니다. '그 상태에서 떠난 횟수 ÷ 그 상태에 있었던 횟수'이므로 확률의 정의 그대로입니다. 이렇게 구한 값을 7장의 정상상태 식에 넣으면 손실률 $p_{GB}/(p_{GB}+p_{BG})${{der:ch7#ge-stationary}} 이 로그의 손실률과 (끝점 효과를 빼면) 일치합니다."
            en="These are simply 'times the state was left ÷ times the state was occupied'. Put into the stationary formula of chapter 7, the loss rate $p_{GB}/(p_{GB}+p_{BG})${{der:ch7#ge-stationary}} matches the loss rate of the log (up to end effects)." />
          <P ko={`**얼마나 기록해야 하나.** $\\hat p_{BG}$ 는 빠진 패킷 $N_B$ 개에서 센 비율이므로 표준오차가 $\\sqrt{p(1-p)/N_B}$ 입니다. 지금 설정의 $p_{BG}$ = {{cfg:comm.loss.pBG}} 에서 빠진 패킷이 100개{{ex}} 이면 ±${fmt(seBG * 100, 2)} %p{{der:ch9#loss-fit|√(p(1−p)/100)|√(p(1−p)/100)}} 입니다. 지금 설정의 손실률 ${fmt(b.lossRate * 100, 3)} %{{der:ch7#ge-stationary}} 와 방송 주기 {{cfg:comm.rate}} 라면 100개가 빠지는 데 약 ${fmt(tLoss, 2)} s{{der:ch9#loss-fit|100 ÷ (손실률 × 주기)|100 ÷ (loss rate × rate)}} 가 걸립니다. 손실이 드물수록 오래 기록해야 합니다.`}
            en={`**How long to record.** $\\hat p_{BG}$ is a proportion counted over the $N_B$ lost packets, so its standard error is $\\sqrt{p(1-p)/N_B}$. At the current $p_{BG}$ = {{cfg:comm.loss.pBG}} and 100{{ex}} lost packets that is ±${fmt(seBG * 100, 2)} percentage points{{der:ch9#loss-fit|√(p(1−p)/100)|√(p(1−p)/100)}}. With the current loss rate of ${fmt(b.lossRate * 100, 3)} %{{der:ch7#ge-stationary}} and a rate of {{cfg:comm.rate}}, losing 100 packets takes about ${fmt(tLoss, 2)} s{{der:ch9#loss-fit|100 ÷ (손실률 × 주기)|100 ÷ (loss rate × rate)}}. The rarer the loss, the longer the recording.`} />
          <P ko="두 가지 한계가 있습니다. ① 로그에서는 '빠졌다'만 보이므로 Good 안의 드문 손실과 Bad 안의 드문 성공을 따로 가려낼 수 없습니다. 나쁜 구간 한가운데에서 패킷 하나가 우연히 통과하면 이 모델은 그것을 '구간이 끝났다'로 읽으므로, 긴 공백을 실제보다 드물게 봅니다. 그래서 데모는 로그에서 가장 긴 연속 손실을 함께 보여 줍니다. 같은 이유로, 설정처럼 $h_G$, $h_B$ 가 0 %, 100 % 가 아닌 손실로 만든 샘플에서는 손실률은 설정값 근처로 돌아오지만 $\hat p_{GB}$, $\hat p_{BG}$ 는 설정값으로 돌아오지 않습니다. ② 핑은 올라가는 길이나 내려오는 길 **어느 쪽에서든** 빠질 수 있으므로, 잰 것은 왕복 손실입니다. 지상국 중계에서는 이웃 정보가 실제로 두 구간을 건너므로 이 값이 맞고, P2P 에서는 편도 손실보다 크게(안전한 쪽으로) 나옵니다."
            en="Two limits. ① A log only shows 'missing', so rare losses inside Good and rare successes inside Bad cannot be separated. When one packet happens to get through in the middle of a bad stretch, this model reads it as the end of the stretch and so sees long gaps as rarer than they are. That is why the demo also shows the longest burst found in the log. For the same reason, on a sample generated with losses whose $h_G$, $h_B$ are not 0 % and 100 % (as in the settings), the loss rate comes back near the setting but $\hat p_{GB}$, $\hat p_{BG}$ do not. ② A ping may be lost on **either** leg, so what you measure is the round-trip loss. For the ground relay neighbour information really crosses two hops, so this is the right value; for P2P it is larger than the one-way loss (on the safe side)." />
        </Derivation>
      </Section>

      <Section id="flight" title={{ ko: '실험 5·6 — 띄워야 재는 값: 추종 오차와 다운워시', en: 'Experiments 5 and 6 — values that need flight: tracking error and downwash' }}>
        <P ko="예산의 큰 입력 둘은 지상에서 잴 수 없습니다. 8장의 **제어 추종 오차** $\sigma_{\text{trk}}$ (기체가 목표 위치를 못 따라가는 정도)와 **다운워시 비율** $k_z$ 입니다. 둘 다 실제로 띄워야 보입니다. 실험 1~4 를 마치고, 6장의 첫 비행 순서대로 한 대가 안정적으로 뜨는 것을 확인한 뒤에 하세요."
          en="Two large inputs of the budget cannot be measured on the ground: the **tracking error** $\sigma_{\text{trk}}$ of chapter 8 (how far the vehicle fails to follow its setpoint) and the **downwash ratio** $k_z$. Both only show up in flight. Do these after experiments 1–4, once a single vehicle flies steadily following the first-flight steps of chapter 6." />
        <Note>
          <P ko="**안전 먼저.** 아래 절차의 시간, 간격, 판정 기준은 모두 예시값이고 문헌이 아니라 조언입니다. 처음에는 권장 간격보다 훨씬 넓게 시작하고, 사람은 비행 구역 밖에 있게 하고, 언제든 바로 착륙시킬 수 있게 준비하세요."
            en="**Safety first.** All times, gaps and criteria in these procedures are example values — advice, not literature. Start much wider than the recommended spacing, keep people outside the flight area, and be ready to land at any moment." />
        </Note>
        <h3>{tr({ ko: '실험 5 — 한 대 제자리 비행 (추종 오차)', en: 'Experiment 5 — one vehicle hovering (tracking error)' })}</h3>
        <List ordered items={[
          { ko: '한 대를 강당 가운데, 비행 고도 {{cfg:formation.height}} 에서 제자리 비행(hover)시킵니다. 이륙 직후 5 s{{ex}} 는 버리고 그 뒤 60 s{{ex}} 를 씁니다.', en: 'Hover one vehicle at the hall centre at the flight height {{cfg:formation.height}}. Discard the first 5 s{{ex}} after take-off and use the next 60 s{{ex}}.' },
          { ko: '같은 시각축으로 **목표 위치**(기체에 보낸 위치 명령. 제자리 비행이면 한 점)와 **추정 위치**(pose)를 기록합니다. 참 위치는 모션캡처 없이는 모르므로 추종 오차는 **목표 − 추정**으로 잽니다. 추정이 참과 다른 몫은 이미 예산의 다른 칸($\\sigma_{\\text{est}}$, 실험 1)에 있고, 8장의 합계식은 두 항을 따로 제곱합하므로 겹쳐 세지 않습니다.', en: 'On one time axis log the **setpoint** (the position command sent to the vehicle — a single point when hovering) and the **estimated position** (pose). Without motion capture the true position is unknown, so measure the tracking error as **setpoint − estimate**. The part by which the estimate differs from the truth is already another line of the budget ($\\sigma_{\\text{est}}$, experiment 1), and the total of chapter 8 combines the two in quadrature, so nothing is counted twice.' },
          { ko: '축마다 $e = $ 목표 − 추정의 **RMS**(제곱평균의 제곱근)를 구합니다. 실험 1 과 달리 **추세를 빼지 않습니다.** 목표에서 일정하게 비켜 있는 것도 추종 오차이기 때문입니다. 평균 어긋남이 RMS 의 절반{{ex}}을 넘으면 편향(제어기의 정상상태 오차 등)으로 따로 적어 두세요.', en: 'For each axis compute the **RMS** (root mean square) of $e = $ setpoint − estimate. Unlike experiment 1, **do not detrend**: a constant offset from the setpoint is tracking error too. If the mean offset exceeds half{{ex}} the RMS, note it separately as a bias (e.g. a steady-state error of the controller).' },
          { ko: '예산은 추종 오차 칸 하나를 수평과 수직에 함께 쓰므로, 수평 $\\sqrt{\\mathrm{RMS}_x^2 + \\mathrm{RMS}_y^2}$ 와 수직 $\\mathrm{RMS}_z$ 가운데 큰 값을 아래 \'측정값을 넣은 뒤\' 절의 추종 오차 칸에 넣습니다. 이웃 표본끼리 닮아 있으므로 실험 1 의 $n_{\\text{eff}}$ 로 불확실도도 확인하세요.', en: 'The budget uses one tracking-error value for both horizontal and vertical, so enter the larger of the horizontal $\\sqrt{\\mathrm{RMS}_x^2 + \\mathrm{RMS}_y^2}$ and the vertical $\\mathrm{RMS}_z$ in the tracking-error field of the section \'After the measurements are in\'. Neighbouring samples resemble each other, so check the uncertainty with $n_{\\text{eff}}$ from experiment 1.' },
        ]} />
        <h3>{tr({ ko: '실험 6 — 두 대 위아래 (다운워시 비율 k_z)', en: 'Experiment 6 — two vehicles stacked (downwash ratio k_z)' })}</h3>
        <List ordered items={[
          { ko: `두 대를 같은 xy 위치에 위아래로 띄웁니다. 처음 수직 간격은 지금 권장 수직 간격의 2배{{ex}}인 ${fix(2 * b.minSepV, 3)} m{{der:ch8#budget-sum|권장 최소 수직 간격 × 2|recommended minimum vertical spacing × 2}} 이상으로 합니다.`, en: `Hover two vehicles one above the other at the same xy position. Start with a vertical gap of at least twice{{ex}} the current recommended vertical spacing, ${fix(2 * b.minSepV, 3)} m{{der:ch8#budget-sum|권장 최소 수직 간격 × 2|recommended minimum vertical spacing × 2}}.` },
          { ko: '먼저 아래 기체 혼자일 때의 수직 추종 오차를 실험 5 로 잽니다(기준값). 그다음 간격을 한 번에 0.1 m{{ex}} 씩 줄이며, 단계마다 30 s{{ex}} 동안 아래 기체의 추종 오차를 잽니다.', en: 'First measure the vertical tracking error of the lower vehicle alone with experiment 5 (the reference). Then reduce the gap by 0.1 m{{ex}} at a time and measure the lower vehicle’s tracking error for 30 s{{ex}} at each step.' },
          { ko: '아래 기체의 수직 추종 오차가 기준값의 2배{{ex}}를 처음 넘는 간격 $h^*$ 에서 멈추고, 더 줄이지 않습니다.', en: 'Stop at the first gap $h^*$ at which the lower vehicle’s vertical tracking error exceeds twice{{ex}} the reference, and do not go closer.' },
          { ko: '아래 유도의 식으로 $k_z$ 를 계산해 \'측정값을 넣은 뒤\' 절의 다운워시 비율 칸에 넣습니다.', en: 'Compute $k_z$ with the formula of the derivation below and enter it in the downwash-ratio field of the section \'After the measurements are in\'.' },
        ]} />
        <Derivation id="flight-fit" title={{ ko: '비행 로그에서 추종 오차와 k_z 로', en: 'From flight logs to tracking error and k_z' }}>
          <P ko="목표 위치를 $p^{\text{cmd}}_i$, 추정 위치를 $\hat p_i$ ($i = 1,\dots,n$) 라 하면 축마다의 추종 오차는 $e_i = p^{\text{cmd}}_i - \hat p_i$ 이고, 추세를 빼지 않은 RMS 를 씁니다."
            en="With setpoints $p^{\text{cmd}}_i$ and estimates $\hat p_i$ ($i = 1,\dots,n$), the per-axis tracking error is $e_i = p^{\text{cmd}}_i - \hat p_i$, and we take its RMS without detrending." />
          <M block tex={String.raw`\mathrm{RMS} = \sqrt{\frac{1}{n}\sum_{i=1}^{n} e_i^2} = \sqrt{\bar e^{\,2} + s_e^2},\qquad \sigma_{\text{trk}} \approx \max\!\Big(\sqrt{\mathrm{RMS}_x^2 + \mathrm{RMS}_y^2},\; \mathrm{RMS}_z\Big)`} />
          <P ko="둘째 등호는 RMS 가 평균 어긋남 $\bar e$ 와 퍼짐 $s_e$ (n 으로 나눈 표준편차)를 둘 다 담는다는 뜻입니다. 그래서 일정한 어긋남도 빠지지 않습니다."
            en="The second equality says the RMS holds both the mean offset $\bar e$ and the spread $s_e$ (standard deviation divided by n), so a constant offset is not lost." />
          <P ko="**$k_z$.** 8장의 타원체 모델에서 같은 xy 위치의 두 기체가 지켜야 할 수직 중심 거리는 $k_z\,d_{\text{body}}$ 입니다({{der:ch8#downwash|타원체 거리에서 z 성분만 k_z 로 나눔|only the z component of the ellipsoidal distance is divided by k_z}}). 아래 기체가 흔들리기 시작한 간격 $h^*$ 를 이 거리로 보면"
            en="**$k_z$.** In the ellipsoid model of chapter 8 the vertical centre distance two vehicles at the same xy position must keep is $k_z\,d_{\text{body}}$ ({{der:ch8#downwash|타원체 거리에서 z 성분만 k_z 로 나눔|only the z component of the ellipsoidal distance is divided by k_z}}). Taking the gap $h^*$ at which the lower vehicle starts to wobble as that distance," />
          <M block tex={String.raw`k_z \;\approx\; \frac{h^*}{d_{\text{body}}}`} />
          <P ko="입니다. $d_{\text{body}}$ 는 지금 설정의 충돌 지름 {{cfg:vehicle.envelope}} 입니다. '기준값의 2배'라는 판정은 이 교재가 고른 예시값이므로, 더 엄격하게 잡으면 $h^*$ 와 $k_z$ 가 커집니다. 이 두 로그는 아래 데모에 넣을 탭이 없습니다. numpy 로 `np.sqrt(np.mean(e**2))` 처럼 계산해 손으로 넣으면, 그 값은 예시값 배지로 남습니다(교재가 계산을 확인하지 못했기 때문입니다)."
            en="Here $d_{\text{body}}$ is the collision diameter of the current settings, {{cfg:vehicle.envelope}}. The criterion 'twice the reference' is an example value chosen by the textbook; a stricter one gives a larger $h^*$ and $k_z$. The demo below has no tab for these two logs. Compute with numpy, e.g. `np.sqrt(np.mean(e**2))`, and enter the value by hand; it then keeps an example-value badge (the textbook could not check the computation)." />
        </Derivation>
      </Section>

      <Section id="csv" title={{ ko: '로그를 CSV 로 만들기', en: 'Turning logs into CSV' }}>
        <P ko="데모는 세 가지 CSV 를 읽습니다. 형식은 아래와 같고, 같은 내용이 저장소의 `docs/CSV_FORMAT.md` 에도 있습니다."
          en="The demo reads three kinds of CSV. The formats are as follows; the same content is in `docs/CSV_FORMAT.md` in the repository." />
        <div class="table-wrap">
          <table class="tbl" data-testid="ch9-format-table">
            <thead><tr><th>{tr({ ko: '로그', en: 'Log' })}</th><th>{tr({ ko: '열 이름 (첫 줄)', en: 'Column names (first line)' })}</th><th>{tr({ ko: '뜻과 단위', en: 'Meaning and units' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '① 정지', en: '① Static' })}</b></td><td><code>t,x,y,z</code></td><td><T ko="`t`: 시각 [s]. `x`,`y`,`z`: 추정 위치 [m], 앵커 좌표와 같은 좌표계(x, y 는 강당 바닥, z 는 위쪽)." en="`t`: time [s]. `x`,`y`,`z`: estimated position [m] in the same frame as the anchor coordinates (x, y on the hall floor, z up)." /></td></tr>
              <tr><td><b>{tr({ ko: '② 거리', en: '② Range' })}</b></td><td><code>t,anchor_id,range_m</code></td><td><T ko="`t`: 시각 [s]. `anchor_id`: 앵커 번호(정수). `range_m`: 그 앵커까지 잰 거리 [m]. 거리차 로그라면 `anchor_id` 에 쌍 번호, `range_m` 에 거리차 [m]." en="`t`: time [s]. `anchor_id`: anchor number (integer). `range_m`: measured range to that anchor [m]. For range-difference logs put the pair number in `anchor_id` and the difference [m] in `range_m`." /></td></tr>
              <tr><td><b>{tr({ ko: '③④ 지연·손실', en: '③④ Latency & loss' })}</b></td><td><code>seq,t_send,t_recv</code></td><td><T ko="`seq`: 핑의 순번(정수). `t_send`: 보낸 시각 [s]. `t_recv`: 메아리가 돌아온 시각 [s]. **두 시각은 같은 PC 의 같은 시계.** 돌아오지 않은 핑은 줄을 쓰지 않습니다." en="`seq`: sequence number of the ping (integer). `t_send`: send time [s]. `t_recv`: time the echo returned [s]. **Both on the same clock of the same PC.** Write no row for a ping that never returned." /></td></tr>
            </tbody>
          </table>
        </div>
        <List items={[
          { ko: '첫 줄(주석 제외)은 **열 이름**입니다. 대소문자는 구분하지 않고, 열 순서는 자유이며, 다른 열이 더 있어도 됩니다(무시합니다).', en: 'The first line (apart from comments) holds the **column names**. They are case-insensitive, may come in any order, and extra columns are allowed (ignored).' },
          { ko: '구분자는 쉼표, 세미콜론, 탭 가운데 하나입니다(첫 줄을 보고 정합니다). 소수점은 마침표입니다.', en: 'The separator is a comma, a semicolon or a tab (decided from the first line). The decimal mark is a point.' },
          { ko: '`#` 으로 시작하는 줄은 주석으로 건너뜁니다. 측정 날짜와 조건을 적어 두기 좋습니다.', en: 'Lines starting with `#` are comments and are skipped — a good place for the date and conditions of the measurement.' },
          { ko: '시각의 단위는 **초**입니다. 0 에서 시작할 필요는 없지만(첫 값을 빼고 씁니다) 한 파일 안에서는 **하나의 시계**여야 합니다. 나노초나 밀리초로 적힌 값은 초로 바꿔서 넣으세요.', en: 'Time is in **seconds**. It need not start at 0 (the first value is subtracted), but one file must use **one clock**. Convert nanoseconds or milliseconds to seconds first.' },
          { ko: '빈 칸이 있거나 숫자가 아닌 칸이 있는 줄은 **줄 전체를 건너뛰고** 건너뛴 줄 수를 화면에 알려 줍니다.', en: 'A row with an empty or non-numeric cell is **skipped entirely**, and the number of skipped rows is reported on screen.' },
        ]} />
        <h3>{tr({ ko: 'ROS 2 bag 에서 CSV 로', en: 'From a ROS 2 bag to CSV' })}</h3>
        <P ko="Crazyswarm2 는 ROS 2 위에서 돌기 때문에{{lit:crazyswarm2-docs/ros2-based}}, 기체가 내려보낸 로그는 ROS 2 의 **토픽**(topic, 이름이 붙은 메시지 흐름)으로 나옵니다. 토픽을 파일에 받아 적은 것이 **bag** 입니다. 길은 세 걸음입니다. ① 실험하는 동안 필요한 토픽을 bag 으로 기록한다. ② bag 을 읽어 필요한 값만 꺼낸다. ③ 위 형식의 CSV 로 쓴다. ① 은 `ros2 bag record` 명령으로 합니다. 아래 첫 상자는 그 꼴의 **예시**이고, 둘째 상자는 ②와 ③을 하는 짧은 Python 스크립트의 **예시**입니다."
          en="Crazyswarm2 runs on ROS 2{{lit:crazyswarm2-docs/ros2-based}}, so the logs sent down by the vehicle appear as ROS 2 **topics** (named streams of messages). A **bag** is a file recording of topics. The route has three steps: ① record the needed topics to a bag during the experiment, ② read the bag and pull out the values, ③ write them as CSV in the format above. Step ① is done with the `ros2 bag record` command; the first box below is an **example** of its form, the second an **example** of a short Python script for ② and ③." />
        <p><Status kind="warn">{tr({ ko: '예시 — 여러분의 토픽 이름과 메시지 형식에 맞게 고치세요', en: 'Example — adapt it to your topic names and message types' })}</Status></p>
        <CodeView code={BAG_RECORD} />
        <CodeView code={ROS_EXAMPLE} />
        <P ko="이 스크립트의 토픽 이름, 메시지의 필드 이름, 함수의 인자는 교재가 확인한 사실이 아니라 **자리 표시**입니다. ROS 2 배포판과 Crazyswarm2 버전에 따라 달라지므로 [ROS 2 공식 문서](https://docs.ros.org/)의 rosbag2 설명과 [Crazyswarm2 공식 문서](https://imrclab.github.io/crazyswarm2/)를 보고 맞추세요. 한 가지는 꼭 확인하세요. bag 이 적는 시각이 **PC 가 메시지를 받아 적은 시각**인지, 기체가 측정한 시각인지입니다(교재가 확인한 사실이 아닙니다. 받은 시각일 가능성이 있으니 문서에서 확인하세요). 받은 시각이라면 정지 노이즈를 재는 데는 상관없지만, 그 시각을 '측정한 순간'으로 써서 지연을 계산하면 안 됩니다(5장의 함정)."
          en="The topic name, message field names and function arguments in this script are **placeholders**, not facts verified by the textbook. They vary with the ROS 2 distribution and the Crazyswarm2 version; follow the rosbag2 pages of the [official ROS 2 documentation](https://docs.ros.org/) and the [official Crazyswarm2 documentation](https://imrclab.github.io/crazyswarm2/). Be sure to check one thing: whether the time a bag records is the time **the PC received and wrote the message** or the time the vehicle measured it (not a fact verified by the textbook; it may well be the receive time, so check the documentation). If it is the receive time, that is fine for static noise, but it must not be used as the 'instant of measurement' to compute a delay (the trap of chapter 5)." />
        <Derivation id="log-rate" title={{ ko: '로그 주기가 볼 수 있는 것을 정한다', en: 'The log rate decides what you can see' }}>
          <P ko="초당 $f_s$ 번 기록한 로그에는 $f_s/2$ 보다 빠른 변화가 제대로 담기지 않습니다. 한 번 흔들리는 모양을 알아보려면 한 주기에 적어도 두 점이 필요하기 때문입니다. 이 한계 $f_s/2$ 를 **나이퀴스트 주파수**(Nyquist frequency)라 하고, 그보다 빠른 흔들림은 사라지는 것이 아니라 더 느린 흔들림인 척 섞여 들어옵니다. 이를 **에일리어싱**(aliasing)이라 합니다."
            en="A log sampled $f_s$ times per second cannot properly hold variations faster than $f_s/2$: recognising one oscillation needs at least two points per period. The limit $f_s/2$ is the **Nyquist frequency**; faster wiggles do not vanish but fold back disguised as slower ones (aliasing)." />
          <M block tex={String.raw`f_{\max} = \frac{f_s}{2}`} />
          <P ko="기본 주기 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} 에서는 5 Hz{{der:ch9#log-rate|10 Hz ÷ 2|10 Hz ÷ 2}} 보다 빠른 흔들림이 보이지 않습니다. σ 의 **크기**는 느리게 기록해도 바뀌지 않지만(표본을 띄엄띄엄 뽑아도 퍼짐은 같습니다), 흔들림이 빠른지 느린지는 알 수 없습니다. 지연 측정에는 더 치명적입니다. 메아리가 10 Hz 로그를 타고 돌아오면 시각이 100 ms{{der:ch9#log-rate|주기 = 1 ÷ 10 Hz|period = 1 ÷ 10 Hz}} 단위로 뭉개져 수십 ms 의 지연을 잴 수 없습니다. **실험하는 동안만이라도 로그 주기를 올리세요.** 다만 주기를 올리면 무선 채널을 그만큼 더 쓰므로, 5대를 동시에 띄울 때의 설정으로 되돌리는 것을 잊지 마세요."
            en="At the default 10 Hz{{lit:crazyswarm2-docs/pose-topic-rate}} nothing faster than 5 Hz{{der:ch9#log-rate|10 Hz ÷ 2|10 Hz ÷ 2}} is visible. The **size** of σ does not change with slow logging (picking samples sparsely keeps the spread), but you cannot tell fast jitter from slow. For latency it is worse: an echo returning through a 10 Hz log has its time smeared in steps of 100 ms{{der:ch9#log-rate|주기 = 1 ÷ 10 Hz|period = 1 ÷ 10 Hz}}, so delays of tens of ms cannot be measured. **Raise the log rate at least for the experiment.** A higher rate uses more of the radio channel, so remember to restore the configuration you fly five vehicles with." />
        </Derivation>
      </Section>

      <Section id="demo" title={{ ko: '내 로그를 넣어 보기', en: 'Try it with my own log' }}>
        <P ko="파일을 고르거나 '샘플 불러오기'를 누르면 형식을 검사하고, 그래프와 표로 결과를 보여 준 뒤, 값마다 전역 설정에 반영할 수 있게 합니다. 샘플은 이 브라우저 안에서 만든 합성 로그입니다. 측정 노이즈와 지연은 지금 설정이 아니라 **고정된 예시 측정**(각 샘플 아래의 안내)으로 만들어서, '전역 설정에 반영'을 누르면 설정이 그 값 쪽으로 바뀌는 것을 볼 수 있습니다. 피팅 결과가 그 예시 측정값 근처로 돌아오면 방법이 맞는 것입니다. 앵커 배치·측위 모드·NLOS 비율·방송 주기·손실 모델은 지금 설정을 씁니다. 그래서 왕복 로그의 손실률은 설정값 근처로 돌아오지만, Good/Bad 전이 확률은 돌아오지 않습니다(실험 4 의 한계 ①)."
          en="Choose a file or press 'Load sample': the format is checked, the result is shown in charts and tables, and each value can be applied to the global settings. The samples are synthetic logs generated inside this browser. Measurement noise and delay are generated not from the current settings but from a **fixed example measurement** (see the note under each sample), so pressing 'Apply to the global settings' visibly moves the settings towards those values; the fit returning values near that example measurement confirms the method. The anchor layout, positioning mode, NLOS rate, broadcast rate and loss model are the current settings, so the loss rate of the round-trip log returns near the setting, while the Good/Bad transition probabilities do not (limit ① of experiment 4)." />
        <LogDemo />
      </Section>

      <Section id="task" title={{ ko: '직접 구현하기', en: 'Implement it yourself' }}>
        <P ko="데모가 한 계산의 핵심 두 가지를 직접 써 봅니다. 왕복 로그에서 편도 지연과 손실률을, 정지 로그에서 추세를 뺀 σ 를 구합니다. 앞의 '추정식이 코드와 그래프의 어디에 있나' 데모에 펼쳐진 코드가 이 과제의 기준 구현이니, **그 코드를 보지 않고** 먼저 써 보세요."
          en="Write the two core computations of the demo yourself: one-way delay and loss rate from a round-trip log, and the detrended σ from a static log. The code shown in the demo 'Where the estimators live in the code and the charts' is the reference solution of this task, so try it first **without looking at that code**." />
        <CodeTask task={fitLogTask} />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <ClockPitfall />
        <DriftPitfall />
      </Section>

      <Section id="next" title={{ ko: '측정값을 넣은 뒤', en: 'After the measurements are in' }}>
        <P ko="측정값을 넣을 때마다 화면 아래의 오차 예산이 다시 계산됩니다. 데모의 '전역 설정에 반영' 대신, 이미 계산해 둔 값을 여기서 손으로 넣어도 됩니다."
          en="Each time a measured value goes in, the error budget at the bottom of the screen is recomputed. Instead of the 'Apply to global settings' buttons of the demo you can also type values you have already computed here." />
        <div class="controls">
          <CfgSlider path={cfg.uwb.mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'} />
          <CfgSlider path="uwb.anchorSurveyError" />
          <CfgSlider path="comm.delayMean" max={200} />
          <CfgSlider path="comm.delayJitter" max={100} />
          <CfgSlider path="safety.trackingError" />
          <CfgSlider path="safety.downwashRatio" />
          <CfgSlider path="safety.margin" />
        </div>
        <p class="small muted">{tr({ ko: '추종 오차와 다운워시 비율은 실험 5·6 의 값을, 추가 여유에는 실험 1 의 편향 규칙(2 × 고정 어긋남과 흘러간 거리)을 더한 값을 넣으세요.', en: 'Enter the values of experiments 5 and 6 for the tracking error and the downwash ratio, and add the bias rule of experiment 1 (2 × fixed offset plus drifted distance) to the extra margin.' })}</p>
        <StatRow>
          <Stat label={{ ko: '권장 최소 수평 간격', en: 'Recommended minimum horizontal spacing' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum', { ko: '지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)', en: 'Total of the error budget with the current global settings (formula of chapter 8)' })} status={b.spacingOk ? 'good' : 'bad'} />
          <Stat label={{ ko: '권장 최소 수직 간격', en: 'Recommended minimum vertical spacing' }} value={b.minSepV} unit="m" src={der('ch8#budget-sum', { ko: '지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식, 다운워시 포함)', en: 'Total of the error budget with the current global settings (formula of chapter 8, downwash included)' })} />
          <Stat label={{ ko: '지금 대형 간격', en: 'Current formation spacing' }} value={cfg.formation.spacing} unit="m" src={{ kind: 'ex', field: 'formation.spacing' }} />
        </StatRow>
        <p>{b.spacingOk
          ? <Status kind="good">{tr({ ko: '지금 대형 간격은 권장 최소 간격 이상입니다', en: 'The current formation spacing is at least the recommended minimum' })}</Status>
          : <Status kind="bad">{tr({ ko: '지금 대형 간격이 권장 최소 간격보다 좁습니다', en: 'The current formation spacing is below the recommended minimum' })}</Status>}
          {' '}<a href="#/report">{tr({ ko: '우리 시스템 리포트에서 전체 보기 →', en: 'See everything in our system report →' })}</a></p>
        <Note>
          <P ko="**기록해 둘 것.** 숫자만 남기면 다음 사람이 믿을 수 없습니다. 측정한 날짜와 장소, 앵커 배치(좌표), 측위 모드, 로그 주기, 기체 수, 기록 길이, 그리고 원본 로그 파일을 함께 보관하세요. CSV 의 `#` 주석 줄에 적어 두면 파일과 함께 다닙니다."
            en="**What to keep.** Numbers alone cannot be trusted by the next person. Keep the date and place, the anchor layout (coordinates), the positioning mode, the log rate, the number of vehicles, the recording length and the original log files together. Written in `#` comment lines of the CSV, the notes travel with the file." />
        </Note>
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 9,
  title: { ko: '우리 시스템 측정하기', en: 'Measuring our own system' },
  lead: { ko: '회색 배지가 붙은 예시값은 모두 여러분이 직접 재서 바꿔야 하는 숫자입니다. 날리기 전에 지상에서 할 수 있는 네 가지 측정, 띄워서 하는 두 가지 측정, 그리고 그 로그에서 노이즈·지연·손실 모델을 맞춰 전역 설정에 넣는 방법을 다룹니다.', en: 'Every example value with a grey badge is a number you must measure and replace. This chapter covers four measurements you can do on the ground before flying, two that need flight, and how to fit the noise, delay and loss models from the logs into the global settings.' },
  objectives: [
    { ko: '정지 노이즈, 앵커별 편향, 왕복 지연, 패킷 손실을 지상에서 재는 절차를 설명하고, 얼마나 오래 기록해야 하는지 표준오차로 계산한다.', en: 'Describe ground procedures for static noise, per-anchor bias, round-trip latency and packet loss, and compute from the standard error how long to record.' },
    { ko: '로그에서 추세를 뺀 σ, 편도 지연의 평균과 분위수, 2상태 손실 모델의 전이 확률을 추정한다.', en: 'Estimate the detrended σ, the mean and percentiles of the one-way delay, and the transition probabilities of the two-state loss model from a log.' },
    { ko: '서로 다른 시계의 시각을 빼면 안 되는 이유와, 드리프트가 노이즈가 아닌 이유를 설명한다.', en: 'Explain why time stamps from different clocks must not be subtracted, and why drift is not noise.' },
  ],
  Body,
  budget: {
    items: [],
    get note(): L {
      const b = budget.value;
      return {
        ko: `이 장은 예산에 새 항목을 더하지 않습니다. 대신 지금까지의 항목에 들어간 **예시값 입력을 여러분의 측정값으로 바꿉니다.** 예산의 식은 그대로이고 입력만 달라집니다. 잰 드리프트·고정 어긋남처럼 넣을 칸이 없는 편향은 실험 1 의 규칙대로 추가 여유에 더합니다. 지금 설정으로 계산한 권장 최소 간격은 수평 ${fix(b.minSepH, 3)} m, 수직 ${fix(b.minSepV, 3)} m{{der:ch8#budget-sum|지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)|Total of the error budget with the current global settings (formula of chapter 8)}} 입니다. 측정값을 넣은 결과는 [우리 시스템 리포트](#/report)에서 한 장으로 볼 수 있습니다.`,
        en: `This chapter adds no new item. Instead it **replaces the example inputs behind the existing items with your measurements.** The formulas of the budget stay the same; only the inputs change. Biases with no field of their own, such as measured drift or a fixed offset, go into the extra margin by the rule of experiment 1. With the current settings the recommended minimum spacing is ${fix(b.minSepH, 3)} m horizontally and ${fix(b.minSepV, 3)} m vertically{{der:ch8#budget-sum|지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)|Total of the error budget with the current global settings (formula of chapter 8)}}. The result with your measurements is on one page in [our system report](#/report).`,
      };
    },
  },
  summary: [
    { ko: '세워 둔 기체의 로그에서 직선을 빼고 남은 표준편차가 노이즈이고, 직선의 기울기는 드리프트(편향)다. σ 의 불확실도는 $1/\\sqrt{2(n-1)}$ 이라 ±10 % 에는 독립 표본 50여 개가 필요하다.', en: 'In the log of a parked vehicle, the standard deviation left after removing a line is the noise and the slope of the line is drift (a bias). The uncertainty of σ is $1/\\sqrt{2(n-1)}$, so ±10 % needs some fifty independent samples.' },
    { ko: '지연은 한 시계로 왕복을 재서 반으로 나눈다. 서로 다른 시계를 빼면 알 수 없는 오프셋이 그대로 섞인다. 예산에는 평균이 아니라 분위수가 필요하다.', en: 'Measure delay as half a round trip on one clock; subtracting different clocks mixes in an unknown offset. The budget needs percentiles, not the mean.' },
    { ko: '빠진 순번에서 손실률과 전이 확률을 세면 7장의 손실 모델이 채워진다. 잰 값을 넣으면 예산의 식은 그대로인 채 권장 간격이 여러분의 시스템 값으로 바뀐다.', en: 'Counting missing sequence numbers gives the loss rate and transition probabilities of the chapter 7 model. With the measured values in, the budget formulas stay and the recommended spacing becomes that of your system.' },
  ],
  next: { ko: '이제 숫자는 모두 여러분의 것입니다. 강당, 앵커 배치, 측정한 노이즈와 지연을 한 장에 모으면 무엇이 보일까요? 대형 간격은 충분한가요, 지연 여유는 몇 배인가요? 마지막 페이지 [우리 시스템 리포트](#/report)에서 확인하고 인쇄해 가세요.', en: 'All the numbers are now yours. What do you see when the hall, the anchor layout and the measured noise and delay come together on one page? Is the formation spacing sufficient, and how many times over is the delay margin? Check it on the last page, [our system report](#/report), and print it.' },
  tasks,
};
export default def;
