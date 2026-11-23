import type { ChapterDef } from '../../app/chapters';
import { CHAPTERS } from '../../app/chapters';
import { fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { perAxisH, steadyStatePosSigmaFixedDisturbance } from '../../sim/ch3_rate';
import { steadyStatePosSigma } from '../../sim/kf';
import { pairsFor } from '../../sim/positioning';
import { C_LIGHT } from '../../sim/uwb';
import { tdoaRate, twrRate } from '../../sim/updateRate';
import { der } from '../../sources';
import { CodeTask, Derivation, List, M, Note, P, Predict, PredictNumber, Section, Segmented, Stat, StatRow, T } from '../../ui';
import { ErrorDemo, RateDemo, RatePitfall, TimelineDemo, VolumeDemo } from './demos';
import { tasks, updateRateTask } from './tasks';

function Body() {
  const cfg = config.value, b = budget.value;
  const nA = cfg.anchors.length, N = cfg.nDrones;
  const Tr = cfg.uwb.twrRangeTime, Ts = cfg.uwb.tdoaSlotTime;
  const tw1 = twrRate({ nTags: 1, nAnchors: nA, rangeTime: Tr }), twN = twrRate({ nTags: N, nAnchors: nA, rangeTime: Tr });
  const td = tdoaRate({ nAnchors: nA, slotTime: Ts });
  const sa = cfg.estimation.accelNoise;
  // 오차 예산과 같은 수평 규약(σ_est,H = √2·σ_ss(σ_pos,H/√2)). 아래 데모의 처음 값·함정 실험실과 같은 계산이다.
  const eT = perAxisH(steadyStatePosSigma, b.sigmaPosH, twN.positionRate, sa), eD = perAxisH(steadyStatePosSigma, b.sigmaPosH, td.positionRate, sa);
  const isTwr = cfg.uwb.mode === 'twr';
  // 외란의 세기를 갱신율과 무관하게 둔 경우(모르는 가속도가 TDoA 간격마다 새로 뽑힘)의 두 오차
  const eT2 = perAxisH(steadyStatePosSigmaFixedDisturbance, b.sigmaPosH, twN.positionRate, sa, td.positionRate);
  const eD2 = perAxisH(steadyStatePosSigmaFixedDisturbance, b.sigmaPosH, td.positionRate, sa, td.positionRate);
  const FIXED = `{{der:ch5#steady-state|외란을 TDoA 간격마다 새로 뽑고 측정만 드물게 넣은 리카티 반복(가정은 3장 '갱신율이 추정 오차로 바뀌는 길', 반복식은 5장)|Riccati iteration with the disturbance redrawn every TDoA interval and only the measurements made rarer (assumption in ch. 3 'From update rate to estimate error', iteration in ch. 5)}}`;
  // T_range 의 기본값 2 ms 는 문서의 500 Hz 를 가정 (가) 로 뒤집은 유도값이다
  const TR_DER = '{{der:ch3#rate|문서의 거리 측정률 500 Hz 를 가정 (가)(채널을 빈틈없이 씀)로 뒤집은 값: 1/500 Hz = 2 ms|The documented 500 Hz ranging rate inverted under assumption (a) (channel used back to back): 1/500 Hz = 2 ms}}';
  const trText = Math.abs(Tr - 0.002) < 1e-12 ? `${fmt(Tr * 1000, 3)} ms${TR_DER}` : '{{cfg:uwb.twrRangeTime}}';
  // 강당 가운데에서 이 교재가 쓰는 고리(이웃) 쌍의 차 벡터 길이 ‖e_j − e_i‖ = 2 sin(θ/2)
  const ctr = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const unit = cfg.anchors.map((a) => { const d = Math.hypot(ctr[0] - a[0], ctr[1] - a[1], ctr[2] - a[2]) || 1; return [(ctr[0] - a[0]) / d, (ctr[1] - a[1]) / d, (ctr[2] - a[2]) / d]; });
  const ringLen = pairsFor(nA, 'ring').map(([i, j]) => Math.hypot(unit[j][0] - unit[i][0], unit[j][1] - unit[i][1], unit[j][2] - unit[i][2]));
  const lenMin = Math.min(...ringLen), lenMax = Math.max(...ringLen);
  const angDeg = (l: number) => (2 * Math.asin(Math.min(1, l / 2)) * 180) / Math.PI;
  const RING = '{{der:ch3#volume|강당 가운데·비행 고도에서, 이 교재가 쓰는 이웃(고리) 쌍마다 2 sin(θ/2) 를 계산한 값|2 sin(θ/2) for each neighbouring (ring) pair used by this textbook, at the hall centre and flight height}}';
  // TDoA: 태그 시계의 주파수 오차가 두 패킷 사이 간격 동안 쌓이는 시간 오차와 그 거리 환산
  const dtErr = Ts * cfg.uwb.clockDriftPpm * 1e-6;
  const CLK = '{{der:ch3#tdoa-passive|두 패킷 사이 간격 × 시계 주파수 오차, 거리로는 여기에 빛의 속도를 곱함|Interval between two packets × clock frequency error; times the speed of light for distance}}';
  return (
    <>
      <Section id="why" title={{ ko: '갱신율: 위치를 1초에 몇 번 새로 아는가', en: 'Update rate: how many fresh positions per second' }}>
        <P ko="2장까지는 드론 **한 대**가 앵커들과의 거리(또는 거리차)로 자기 위치를 구했습니다. 이제 5대를 띄웁니다. 이 교재의 모델에서는 모든 장치가 UWB 전파의 **채널**(channel) 하나를 함께 쓴다고 둡니다. 두 장치가 동시에 송신하면 패킷이 겹쳐서 깨집니다. 그래서 '누가 언제 송신하는가'를 정한 순서표가 필요하고, 이 순서표가 드론 한 대가 1초에 위치를 몇 번 새로 얻는지, 곧 **위치 갱신율**(position update rate, 단위 Hz)을 정합니다."
          en="Up to chapter 2, **one** drone found its position from ranges (or range differences) to the anchors. Now we fly five. In this textbook's model all devices share one UWB **channel**: if two devices transmit at once their packets overlap and are lost. So a timetable must fix who transmits when, and that timetable sets how many fresh positions one drone gets per second — the **position update rate** (in Hz)." />
        <P ko="갱신율이 왜 중요할까요? 측정과 측정 사이에 드론은 **관성측정장치**(IMU, 가속도와 각속도를 재는 센서)만으로 자기 움직임을 짐작해야 하고, 그동안 오차가 자랍니다. Crazyswarm 논문은 기체에 외부 위치 정보를 보내는 빈도를 낮춰 가며 제자리 비행 오차를 쟀습니다. 위치를 1초에 100번 보낼 때 평균 0.58 cm{{lit:crazyswarm2017/hover-error-vs-rate}} 이던 오차가, 1초에 2번으로 줄이자 2.18 cm{{lit:crazyswarm2017/hover-error-vs-rate}} 로 커졌습니다. 다만 이 실험의 기체는 우리 것과 다른 Crazyflie 2.0{{lit:crazyswarm2017/vehicle}} 이고, 위치 정보는 UWB 가 아니라 **모션캡처**(motion capture, 카메라 여러 대로 기체에 붙인 표식을 추적하는 훨씬 정밀한 장치)입니다. 그래서 숫자를 우리 시스템에 그대로 가져올 수는 없습니다. 방향만 가져옵니다: **위치를 드물게 알수록 덜 정확하게 난다.**"
          en="Why does the rate matter? Between measurements the drone must guess its own motion from the **inertial measurement unit** (IMU, the sensor for acceleration and angular rate) alone, and the error grows meanwhile. The Crazyswarm paper measured hover error while lowering how often external position information is sent to the vehicle: a mean of 0.58 cm{{lit:crazyswarm2017/hover-error-vs-rate}} at 100 positions per second grew to 2.18 cm{{lit:crazyswarm2017/hover-error-vs-rate}} at 2 per second. Note that the vehicle there is a different one, the Crazyflie 2.0{{lit:crazyswarm2017/vehicle}}, and the position source is not UWB but **motion capture** (a far more precise system in which many cameras track markers on the vehicle), so the numbers do not carry over to our system. Only the direction does: **the less often you know your position, the less accurately you fly.**" />
        <P ko="Loco Positioning System 은 세 가지 측위 모드를 구현합니다: TWR, TDoA 2, TDoA 3{{lit:lps-docs/three-modes}}. 1장에서 본 **양방향 거리 측정**(TWR, two-way ranging)과 2장에서 본 **도달 시간차**(TDoA, time difference of arrival)가 바로 이 모드들입니다. 두 방식은 '누가 송신하는가'가 다릅니다."
          en="The Loco Positioning System implements three positioning modes: TWR, TDoA 2 and TDoA 3{{lit:lps-docs/three-modes}} — the **two-way ranging** (TWR) of chapter 1 and the **time difference of arrival** (TDoA) of chapter 2. The two approaches differ in who transmits." />
        <div class="grid-2">
          <div class="card">
            <div class="card-title">{tr({ ko: 'TWR: 태그가 묻고 앵커가 답한다', en: 'TWR: the tag asks, the anchor answers' })}</div>
            <P ko="**태그**(tag, 드론에 실린 UWB 장치)가 **앵커**(anchor, 강당에 고정된 UWB 장치)를 **차례로 불러** 거리를 하나씩 잽니다{{lit:lps-docs/twr-description}}. 거리 하나를 재려면 태그와 앵커가 패킷을 여러 번 주고받아야 하고(1장의 DS-TWR), 그동안 채널은 그 한 쌍이 차지합니다."
              en="The **tag** (the UWB device on the drone) **calls the anchors** (UWB devices fixed in the hall) **one after another** and measures one range at a time{{lit:lps-docs/twr-description}}. One range takes several packets back and forth (the DS-TWR of chapter 1), and during that exchange the channel belongs to that one pair." />
            <P ko="공식 문서의 수치: 거리 측정은 1초에 500번이고, 이것을 모든 앵커가 나눠 가집니다. 앵커가 6개이면 앵커 하나당 약 80 Hz 입니다{{lit:lps-docs/twr-ranging-rate}}."
              en="From the official docs: ranging runs at 500 per second, shared over all anchors — about 80 Hz per anchor with six anchors{{lit:lps-docs/twr-ranging-rate}}." />
          </div>
          <div class="card">
            <div class="card-title">{tr({ ko: 'TDoA: 앵커가 말하고 태그는 듣기만 한다', en: 'TDoA: anchors talk, tags only listen' })}</div>
            <P ko="앵커들이 정해진 순서로 패킷을 송신하고, 태그는 **듣기만** 합니다. 이것을 **수동 수신**(passive reception)이라고 합니다. 태그는 두 앵커의 패킷이 도착한 시각의 차이에서 두 앵커까지의 거리차를 얻습니다(2장의 쌍곡선)."
              en="The anchors transmit packets in a fixed order and the tag **only listens** — **passive reception**. From the difference between the arrival times of two anchors' packets the tag obtains the difference of its distances to them (the hyperbolas of chapter 2)." />
            <P ko="공식 문서의 수치: TDoA 2 는 길이 2 ms 인 **슬롯**(slot, 한 장치에 배정된 송신 시간 칸) 8개를 앵커가 하나씩 맡습니다. 8칸이 한 번 도는 16 ms 가 한 **프레임**(frame)입니다{{lit:lps-docs/tdoa2-slot-timing}}."
              en="From the official docs: in TDoA 2 each anchor owns one of eight 2 ms **slots** (a time cell assigned to one device for transmitting). One pass over the eight slots, 16 ms, is a **frame**{{lit:lps-docs/tdoa2-slot-timing}}." />
          </div>
        </div>
        <Note>
          <P ko="**먼저 밝혀 둡니다.** Loco Positioning 공식 문서는 TWR 모드에서 측위할 수 있는 태그를 **1대**로 적고 있습니다(앵커는 최대 8개){{lit:lps-docs/twr-tag-limit}}. 그러므로 이 장에서 계산하는 '태그 5대가 TWR 채널을 차례로 나눠 쓰면'은 실제 펌웨어의 동작을 옮긴 것이 아니라, **시간을 공평하게 나눠 쓴다고 가정하면 어떻게 되는지를 따져 보는 모델**입니다. 이 장의 식과 그래프는 모두 메시지 개수를 세는 **개념 모델**이며, 패킷 충돌·재전송·처리 시간 같은 실제 사정은 들어 있지 않습니다."
            en="**Stated up front.** The official Loco Positioning docs say that in TWR mode only **one** tag can be positioned (with at most 8 anchors){{lit:lps-docs/twr-tag-limit}}. So 'five tags taking turns on the TWR channel', as computed in this chapter, is not a description of the real firmware; it is **a model of what would happen if the time were shared fairly**. Every formula and chart in this chapter is a **concept model** that counts messages; real-world effects such as packet collisions, retransmissions and processing time are not in it." />
        </Note>
        <Predict id="ch3-scale"
          question={{ ko: '드론을 1대에서 5대로 늘립니다. 앵커와 칸 길이는 그대로입니다. 드론 한 대가 1초에 얻는 위치 갱신 횟수는 TWR 과 TDoA 에서 각각 어떻게 될까요?', en: 'We go from one drone to five; anchors and cell lengths stay the same. What happens to the number of position updates one drone gets per second, in TWR and in TDoA?' }}
          choices={[
            { label: { ko: '둘 다 1/5 로 준다 — 채널은 하나이고 5대가 나눠 써야 하니까', en: 'Both drop to 1/5 — one channel shared by five' } },
            { label: { ko: 'TWR 은 1/5 로 줄고, TDoA 는 그대로다', en: 'TWR drops to 1/5; TDoA stays the same' }, correct: true },
            { label: { ko: '둘 다 그대로다 — 앵커 수가 같으니까', en: 'Both stay the same — the number of anchors has not changed' } },
            { label: { ko: 'TWR 은 그대로이고, TDoA 가 1/5 로 준다 — 앵커가 5대에게 나눠 보내야 하니까', en: 'TWR stays; TDoA drops to 1/5 — the anchors must serve five drones' } },
          ]}
          explain={{
            ko: '**TWR 만 1/5 로 줄어듭니다.** TWR 에서는 거리를 잴 때마다 드론이 직접 송신해야 하므로 5대가 채널을 나눠 써야 합니다. TDoA 에서 송신하는 것은 앵커뿐이고, 앵커의 패킷은 방송처럼 모든 드론에게 한꺼번에 닿습니다. 듣는 쪽이 몇 대든 채널이 하는 일은 같습니다. 아래에서 메시지를 직접 세어 확인합니다.',
            en: '**Only TWR drops to 1/5.** In TWR a drone must transmit for every range, so five drones have to share the channel. In TDoA only anchors transmit, and an anchor packet reaches every drone at once, like a broadcast. However many listen, the channel does the same work. We count the messages below.',
          }} />
      </Section>

      <Section id="count" title={{ ko: '메시지를 세어 갱신율 구하기', en: 'Counting messages to get the update rate' }}>
        <Derivation id="rate" title={{ ko: '두 모드의 드론당 갱신율', en: 'Per-drone update rate of the two modes' }}>
          <P ko="기호를 먼저 정합니다."
            en="First the symbols." />
          <List items={[
            { ko: '$N_{\\text{tag}}$: 같은 채널을 쓰는 태그(드론)의 수. $N_{\\text{anc}}$: 앵커의 수.', en: '$N_{\\text{tag}}$: number of tags (drones) on the channel. $N_{\\text{anc}}$: number of anchors.' },
            { ko: '$T_{\\text{range}}$ [s]: TWR 에서 태그 하나와 앵커 하나가 거리를 **한 번** 재는 데 걸리는 시간. 패킷 여러 개를 주고받는 교환 전체입니다. 문서에는 이 시간이 없고 "거리 측정 1초에 500번"{{lit:lps-docs/twr-ranging-rate}}만 있습니다. 아래 가정 (가)대로 채널을 빈틈없이 쓴다면 $T_{\\text{range}} = 1/(500\\ \\text{Hz}) = 2\\ \\text{ms}$ 이고, 이 교재는 이 **유도값**을 기본값으로 씁니다.', en: '$T_{\\text{range}}$ [s]: time for one tag and one anchor to measure **one** range in TWR — the whole exchange of several packets. The docs do not give this time, only "500 ranges per second"{{lit:lps-docs/twr-ranging-rate}}. If the channel is used back to back as in assumption (a) below, $T_{\\text{range}} = 1/(500\\ \\text{Hz}) = 2\\ \\text{ms}$; this textbook uses that **derived value** as the default.' },
            { ko: '$T_{\\text{slot}}$ [s]: TDoA 에서 앵커 한 대에 배정된 송신 슬롯의 길이.', en: '$T_{\\text{slot}}$ [s]: length of the transmit slot assigned to one anchor in TDoA.' },
            { ko: '$f$ [Hz]: 1초당 횟수. 주기 $T$ [s] 와는 $f = 1/T$ 관계입니다. $f_{\\text{meas}}$ 는 태그 한 대가 1초에 얻는 측정의 수, $f_{\\text{pos}}$ 는 태그 한 대의 위치 갱신율입니다.', en: '$f$ [Hz]: count per second, related to a period $T$ [s] by $f = 1/T$. $f_{\\text{meas}}$ is the number of measurements one tag gets per second, $f_{\\text{pos}}$ the position update rate of one tag.' },
          ]} />
          <P ko="가정은 두 가지입니다. **(가)** 채널에는 한 번에 교환 하나(TWR) 또는 패킷 하나(TDoA)만 지나갈 수 있고, 빈틈없이 이어 쓴다. **(나)** 위치를 한 번 새로 구하려면 **모든 앵커**에 대한 측정이 한 바퀴 새로 들어와야 한다. (나)는 셈을 쉽게 하려는 약속입니다. 칼만 필터는 측정이 하나 들어올 때마다 위치를 조금씩 고칠 수도 있습니다(5장의 스칼라 갱신). 그래도 '모든 방향의 정보가 한 번씩 새로워지는 데 걸리는 시간'은 같으므로 두 모드를 비교하는 데는 문제가 없습니다."
            en="Two assumptions. **(a)** The channel carries one exchange (TWR) or one packet (TDoA) at a time, back to back with no gaps. **(b)** A new position needs one fresh pass of measurements over **all anchors**. (b) is a convention to keep the counting simple. A Kalman filter can also nudge the position with every single measurement (the scalar update of chapter 5). Still, the time for information from every direction to be refreshed once is the same, so the comparison of the two modes holds." />
          <P ko="**TWR.** ① 채널 전체로 보면 거리 교환 하나에 $T_{\text{range}}$ 가 걸리므로 1초에 $1/T_{\text{range}}$ 번의 교환이 들어갑니다. ② 태그 $N_{\text{tag}}$ 대가 차례로 한 번씩 쓰므로 한 대의 몫은 그 $1/N_{\text{tag}}$ 입니다. ③ 태그 한 대가 앵커 $N_{\text{anc}}$ 개를 모두 한 번씩 거치려면 자기 차례가 $N_{\text{anc}}$ 번 돌아와야 합니다."
            en="**TWR.** ① For the channel as a whole, one range exchange takes $T_{\text{range}}$, so $1/T_{\text{range}}$ exchanges fit in a second. ② $N_{\text{tag}}$ tags take one turn each, so one tag gets $1/N_{\text{tag}}$ of that. ③ For one tag to cover all $N_{\text{anc}}$ anchors, its turn must come round $N_{\text{anc}}$ times." />
          <M block tex={String.raw`f_{\text{meas}}^{\text{TWR}} = \frac{1}{N_{\text{tag}}\,T_{\text{range}}}, \qquad f_{\text{pos}}^{\text{TWR}} = \frac{f_{\text{meas}}^{\text{TWR}}}{N_{\text{anc}}} = \frac{1}{N_{\text{tag}}\,N_{\text{anc}}\,T_{\text{range}}}`} />
          <P ko={`숫자로 확인합니다. 지금 설정은 $T_{\\text{range}}$ = ${trText}, 앵커 ${nA}개{{ex:anchors}} 입니다. 태그가 1대이면 거리를 1초에 ${fmt(tw1.rangesPerSecPerTag, 3)}번{{der:ch3#rate}} 재고 위치 갱신율은 ${fmt(tw1.positionRate, 3)} Hz{{der:ch3#rate}} 입니다. 태그가 ${N}대이면 한 대의 몫은 ${fmt(twN.rangesPerSecPerTag, 3)}번{{der:ch3#rate}}, 위치 갱신율은 ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}} 로 떨어집니다. (문서의 '500 Hz 를 앵커 6개가 나누면 앵커당 약 80 Hz' 와도 맞습니다: 500 ÷ 6 ≈ 83{{der:ch3#rate|1/(N_anc·T_range) 에 T_range = 2 ms, N_anc = 6 을 넣은 값|1/(N_anc·T_range) with T_range = 2 ms and N_anc = 6}}.)`}
            en={`Check with numbers. The current settings are $T_{\\text{range}}$ = ${trText} and ${nA} anchors{{ex:anchors}}. One tag makes ${fmt(tw1.rangesPerSecPerTag, 3)} ranges per second{{der:ch3#rate}} and updates its position at ${fmt(tw1.positionRate, 3)} Hz{{der:ch3#rate}}. With ${N} tags each gets ${fmt(twN.rangesPerSecPerTag, 3)} ranges per second{{der:ch3#rate}} and the position rate falls to ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}}. (This agrees with the docs' '500 Hz shared by six anchors is about 80 Hz each': 500 ÷ 6 ≈ 83{{der:ch3#rate|1/(N_anc·T_range) 에 T_range = 2 ms, N_anc = 6 을 넣은 값|1/(N_anc·T_range) with T_range = 2 ms and N_anc = 6}}.)`} />
          <P ko="**TDoA.** ① 앵커가 슬롯마다 한 대씩 송신하므로 채널에는 1초에 $1/T_{\text{slot}}$ 개의 패킷이 지나갑니다. ② 그 패킷을 **모든 태그가 다 듣습니다.** 그래서 태그 한 대가 1초에 듣는 패킷 수도 $1/T_{\text{slot}}$ 그대로이고, 새 패킷이 올 때마다 직전 패킷과의 시간차를 하나 얻습니다. 여기에 $N_{\text{tag}}$ 가 들어갈 자리가 없습니다. ③ 모든 앵커가 한 번씩 송신하는 한 프레임은 $N_{\text{anc}}\,T_{\text{slot}}$ 입니다."
            en="**TDoA.** ① One anchor transmits per slot, so $1/T_{\text{slot}}$ packets cross the channel per second. ② **Every tag hears every one of them.** So one tag also hears $1/T_{\text{slot}}$ packets per second, and each new packet gives one time difference against the previous one. There is nowhere for $N_{\text{tag}}$ to enter. ③ One frame, in which every anchor transmits once, lasts $N_{\text{anc}}\,T_{\text{slot}}$." />
          <M block tex={String.raw`f_{\text{meas}}^{\text{TDoA}} = \frac{1}{T_{\text{slot}}}, \qquad f_{\text{pos}}^{\text{TDoA}} = \frac{f_{\text{meas}}^{\text{TDoA}}}{N_{\text{anc}}} = \frac{1}{N_{\text{anc}}\,T_{\text{slot}}}`} />
          <P ko={`지금 설정 $T_{\\text{slot}}$ = {{cfg:uwb.tdoaSlotTime}}, 앵커 ${nA}개{{ex:anchors}} 로는 한 프레임이 ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}}, 위치 갱신율이 ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}} 입니다. 태그가 1대든 ${N}대든 50대든 같습니다.`}
            en={`With the current $T_{\\text{slot}}$ = {{cfg:uwb.tdoaSlotTime}} and ${nA} anchors{{ex:anchors}}, a frame lasts ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}} and the position rate is ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}} — for 1 tag, ${N} tags or 50.`} />
        </Derivation>
        <RateDemo />
      </Section>

      <Section id="passive" title={{ ko: '왜 듣기만 하면 늘어나도 괜찮은가', en: 'Why listening scales' }}>
        <Derivation id="tdoa-passive" title={{ ko: '채널이 감당하는 것은 송신뿐이다', en: 'The channel only pays for transmissions' }}>
          <P ko="채널을 차지하는 것은 **송신**입니다. 수신은 채널을 차지하지 않습니다. 라디오 방송을 듣는 사람이 100명에서 1000명으로 늘어도 방송국이 할 일이 그대로인 것과 같습니다. 이것을 식으로 쓰려면 '1초 가운데 채널이 쓰이는 시간의 비율'을 세면 됩니다. 이 비율은 1(=100%)을 넘을 수 없습니다."
            en="What occupies the channel is **transmission**. Reception does not. When a radio station's audience grows from 100 to 1000, the station's work is unchanged. To write this as a formula, count the fraction of each second in which the channel is in use. That fraction cannot exceed 1 (= 100%)." />
          <P ko="**TWR.** 태그 한 대가 1초에 $f_{\text{meas}}$ 번 거리를 재고 싶어 한다고 합시다. 한 번에 $T_{\text{range}}$ 씩, 태그가 $N_{\text{tag}}$ 대이므로 채널이 쓰이는 비율은 셋의 곱입니다. **TDoA.** 앵커 한 대가 1초에 $f_{\text{anc}}$ 번 송신하고, 한 번에 $T_{\text{slot}}$ 씩, 앵커가 $N_{\text{anc}}$ 대입니다."
            en="**TWR.** Suppose each tag wants $f_{\text{meas}}$ ranges per second. Each takes $T_{\text{range}}$ and there are $N_{\text{tag}}$ tags, so the fraction of time in use is the product of the three. **TDoA.** Each anchor transmits $f_{\text{anc}}$ times per second, $T_{\text{slot}}$ each, and there are $N_{\text{anc}}$ anchors." />
          <M block tex={String.raw`\underbrace{N_{\text{tag}}\; f_{\text{meas}}\; T_{\text{range}}}_{\tx{TWR 의 채널 사용 비율}{TWR channel occupancy}} \;\le\; 1
\qquad\qquad
\underbrace{N_{\text{anc}}\; f_{\text{anc}}\; T_{\text{slot}}}_{\tx{TDoA 의 채널 사용 비율}{TDoA channel occupancy}} \;\le\; 1`} />
          <P ko="왼쪽 부등식을 $f_{\text{meas}}$ 에 대해 풀면 $f_{\text{meas}} \le 1/(N_{\text{tag}} T_{\text{range}})$ 입니다. 태그가 늘면 한 대의 몫이 줄어듭니다. 오른쪽 부등식에는 **$N_{\text{tag}}$ 가 아예 없습니다.** 태그를 몇 대 더하든 부등식이 달라지지 않으므로, 이미 날고 있는 태그의 갱신율도 달라지지 않습니다. 위 유도에서 등호를 쓴 것은 채널을 빈틈없이 꽉 채워 쓴다는 가정 (가) 때문입니다."
            en="Solving the left inequality for $f_{\text{meas}}$ gives $f_{\text{meas}} \le 1/(N_{\text{tag}} T_{\text{range}})$: more tags, smaller share. The right inequality **does not contain $N_{\text{tag}}$ at all.** Adding tags does not change it, so the rate of the tags already flying does not change either. The derivation above used equality because of assumption (a), a completely filled channel." />
          <P ko="이렇게 장치가 늘어나도 성능이 버티는 성질을 **확장성**(scalability)이라고 합니다. 공식 문서도 같은 말을 합니다. TDoA 에서 태그는 듣기만 하므로 태그가 늘어도 시스템의 부하가 늘지 않고, 동시에 측위할 수 있는 태그 수에 제한이 없습니다{{lit:lps-docs/tdoa-passive-unlimited-tags}}. UTIL 데이터셋 논문도 TDoA 는 앵커와 태그 사이의 양방향 통신이 필요 없어 이론상 장치 수에 제한이 없다고 적습니다{{lit:util2022/tdoa-unlimited-devices}}. Bitcraze 는 2016년에 TWR 이 왜 확장되지 않는지를 설명하면서{{lit:bitcraze-tdoa-blog/twr-not-scalable}}, TDoA 측정으로 Crazyflie 2.0 5대를 함께 띄웠습니다{{lit:bitcraze-tdoa-blog/num-drones-tdoa}}."
            en="The property that performance holds up as devices are added is called **scalability**. The official docs say the same: in TDoA the tag only listens, so more tags add no load and there is no limit on how many can be positioned at once{{lit:lps-docs/tdoa-passive-unlimited-tags}}. The UTIL dataset paper likewise notes that TDoA needs no two-way communication between anchors and tags and can in theory serve an unlimited number of devices{{lit:util2022/tdoa-unlimited-devices}}. In 2016 Bitcraze explained why TWR does not scale{{lit:bitcraze-tdoa-blog/twr-not-scalable}} and flew five Crazyflie 2.0 together on TDoA measurements{{lit:bitcraze-tdoa-blog/num-drones-tdoa}}." />
          <P ko="한 가지 의문이 남습니다. 1장에서 본 것처럼 장치마다 시계가 조금씩 다르게 갑니다. 듣기만 하는 태그는 앵커가 **언제** 송신했는지 모르는데, 어떻게 시간차를 잴까요? TDoA 는 태그가 송신하지 않는 대신 앵커 시계를 서로 맞춰야 하고, 그만큼 앵커 시스템이 더 어려워집니다{{lit:bitcraze-tdoa-blog/tdoa-scales}}. 아래는 그 일을 **개념적으로** 푼 것입니다(실제 패킷 형식은 LPS 의 TDoA 프로토콜 문서에 있고, 이 교재는 재현하지 않습니다)."
            en="One question remains. As chapter 1 showed, every device's clock runs slightly differently. A tag that only listens does not know **when** an anchor transmitted, so how can it measure a time difference? Because the tag never transmits, the anchors must align their clocks with each other instead, and the anchor system gets harder in return{{lit:bitcraze-tdoa-blog/tdoa-scales}}. Below is a **conceptual** account of how this is done (the real packet format is in the LPS TDoA protocol docs; this textbook does not reproduce it)." />
          <List ordered items={[
            { ko: '**앵커끼리 맞추기.** 앵커는 패킷에 \'내 시계로 언제 보냈는지\'와 \'다른 앵커의 패킷을 내 시계로 언제 받았는지\'를 함께 적어 보냅니다. 앵커의 좌표는 알려져 있어 앵커 사이 전파 시간도 알 수 있으므로, 이 값들로 앵커 시계끼리의 차이를 계산할 수 있습니다.', en: '**Aligning the anchors.** Each anchor writes into its packet when it transmitted, on its own clock, and when it received the other anchors\' packets, also on its own clock. The anchor positions are known, so the propagation time between anchors is known, and from these values the offsets between anchor clocks can be computed.' },
            { ko: `**태그 시계의 빠르기 고치기.** 그래도 태그는 두 패킷의 도착 시각 차를 **자기 시계로** 잽니다. 두 패킷 사이 간격이 {{cfg:uwb.tdoaSlotTime}} 이고 태그 시계가 {{cfg:uwb.clockDriftPpm}} 빠르면, 태그는 그 간격을 ${fmt(dtErr * 1e9, 3)} ns${CLK} 길게 읽습니다. 거리로는 ${fmt(dtErr * C_LIGHT, 3)} m${CLK} 입니다. 측위에 쓸 수 없을 만큼 큰 오차입니다. 그래서 태그는 **같은 앵커가 보낸 연속 패킷 두 개**를 비교합니다. 앵커가 적어 보낸 송신 시각의 간격(앵커 시계)과 자기가 받은 시각의 간격(태그 시계)의 비가 곧 두 시계의 빠르기 비이고, 이 비로 자기 시계의 읽음을 앵커 시계 기준으로 고쳐 씁니다.`, en: `**Correcting the tag clock rate.** The tag still measures the difference of two arrival times **on its own clock**. If the two packets are {{cfg:uwb.tdoaSlotTime}} apart and the tag clock runs {{cfg:uwb.clockDriftPpm}} fast, the tag reads that interval ${fmt(dtErr * 1e9, 3)} ns${CLK} too long: ${fmt(dtErr * C_LIGHT, 3)} m${CLK} in distance, far too large for positioning. So the tag compares **two consecutive packets from the same anchor**: the ratio of the interval between the transmit times the anchor wrote (anchor clock) to the interval between their arrivals (tag clock) is the ratio of the two clock rates, and the tag uses it to convert its readings to the anchor's time base.` },
            { ko: '**남는 것.** 보정한 뒤에 남는 것은 빠르기 비를 추정하는 오차뿐이라 훨씬 작습니다. 이 교재의 모델은 이 보정이 잘 된다고 보고, 남는 오차는 TDoA 측정 노이즈 $\\sigma$ 에 들어 있다고 둡니다. 펌웨어의 실제 처리는 펌웨어 문서를 보세요.', en: '**What remains.** After correction only the error in estimating the rate ratio is left, which is much smaller. The model of this textbook assumes the correction works and that what remains is contained in the TDoA measurement noise $\\sigma$. For what the firmware really does, see chapter 6 and the firmware docs.' },
          ]} />
          <P ko="즉 TDoA 는 태그가 하던 일을 앵커 쪽으로 옮긴 것입니다. 이 대가는 아래 'TDoA 의 대가'에서 다룹니다."
            en="In short, TDoA moves work from the tag to the anchors. That price is the subject of 'The price of TDoA' below." />
        </Derivation>
        <TimelineDemo />
        <CodeTask task={updateRateTask} />
      </Section>

      <Section id="matters" title={{ ko: '갱신율은 오차를 얼마나 바꾸나', en: 'How much does the rate change the error' }}>
        <P ko={`갱신율은 Hz 단위의 수입니다. 우리가 결국 알고 싶은 것은 '몇 cm 틀리는가'입니다. 둘을 잇는 것이 5장에서 배울 **칼만 필터**(Kalman filter: 예측과 측정을 각각의 불확실성에 맞춰 섞는 추정기)입니다. 자세한 유도는 5장으로 미루고, 여기서는 갱신율이 오차로 바뀌는 길만 따라가 봅니다. 지금 설정에서 TWR 을 ${N}대가 나눠 쓰면 ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}}, TDoA 는 ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}} 입니다.`}
          en={`The update rate is a number in Hz. What we finally want is how many centimetres we are off. The link is the **Kalman filter** of chapter 5 (an estimator that blends prediction and measurement according to their uncertainties). We leave the full derivation to chapter 5 and only follow the path from rate to error here. With the current settings, TWR shared by ${N} drones gives ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}} and TDoA ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}}.`} />
        <PredictNumber id="ch3-rate-error"
          question={{
            ko: `위치 측정이 들어오는 빈도가 ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}} 에서 ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}} 로, 곧 ${fmt(td.positionRate / twN.positionRate, 3)}배{{der:ch3#rate}}로 늘어납니다. 측정 한 번의 오차는 그대로입니다. 필터를 거친 위치 추정 오차는 몇 배 작아질까요? (답은 엔진의 기본 외란 모델로 계산합니다. 아래 유도에서 그 가정을 밝힙니다.)`,
            en: `Position measurements go from ${fmt(twN.positionRate, 3)} Hz{{der:ch3#rate}} to ${fmt(td.positionRate, 3)} Hz{{der:ch3#rate}}, i.e. ${fmt(td.positionRate / twN.positionRate, 3)} times{{der:ch3#rate}} as often. The error of a single measurement is unchanged. By what factor does the filtered position error shrink? (The answer uses the engine's default disturbance model; the derivation below states its assumption.)`,
          }}
          min={1} max={8} step={0.1} unit={tr({ ko: '배', en: '×' })} actual={eT / eD} tolerance={0.15}
          actualSrc={der('ch5#steady-state', { ko: '두 갱신율에서의 정상상태 수평 추정 오차(엔진 steadyStatePosSigma 를 예산과 같은 규약 √2·σ_ss(σ_pos,H/√2) 로, 지금 설정의 σ_pos,H 와 σ_a)의 비. 리카티 방정식은 5장에서 유도', en: 'Ratio of the steady-state horizontal estimate errors at the two rates (engine steadyStatePosSigma in the budget convention √2·σ_ss(σ_pos,H/√2), with the current σ_pos,H and σ_a); the Riccati equation is derived in ch. 5' })}
          explain={{
            ko: '갱신율이 몇 배가 되어도 오차는 그만큼 줄지 않습니다. 측정을 $n$ 번 평균 내면 오차가 $1/n$ 이 아니라 $1/\\sqrt{n}$ 로 줄어드는 것([통계 1분 복습](#/ch/0?a=stats))과 비슷한 이유입니다. 정확히 몇 배인지는 "모르는 가속도"를 어떻게 모델링하느냐에 따라 조금 달라집니다. 아래 유도와 데모에서 확인하세요.',
            en: 'However many times faster the rate, the error does not shrink by that factor, for much the same reason that averaging $n$ measurements reduces the error by $1/\\sqrt{n}$, not $1/n$ ([one-minute statistics review](#/ch/0?a=stats)). The exact factor depends somewhat on how the unknown acceleration is modelled. See the derivation and demo below.',
          }} />
        <Derivation id="rate-to-error" title={{ ko: '갱신율이 추정 오차로 바뀌는 길 (5장의 예고편)', en: 'From update rate to estimate error (a preview of chapter 5)' }}>
          <P ko="한 축만 봅니다. $\sigma_{\text{pos}}$ [m] 는 UWB 측정 한 묶음으로 구한 위치의 오차(1σ), $T = 1/f_{\text{pos}}$ [s] 는 측정 사이의 간격, $\sigma_a$ [m/s²] 는 필터가 미리 알 수 없는 가속도(돌풍, 제어 오차)의 크기입니다. **엔진의 가정**: 모르는 가속도는 측정 간격 $T$ 동안 일정하고, 간격마다 평균 0, 표준편차 $\sigma_a$ 로 새로 뽑힙니다(5장의 등속 모델). 필터는 두 가지 일을 번갈아 합니다."
            en="Look at one axis. $\sigma_{\text{pos}}$ [m] is the error (1σ) of a position obtained from one set of UWB measurements, $T = 1/f_{\text{pos}}$ [s] the interval between measurements, and $\sigma_a$ [m/s²] the size of the acceleration the filter cannot know in advance (gusts, control error). **The engine's assumption**: the unknown acceleration is constant over a measurement interval $T$ and redrawn each interval with mean 0 and standard deviation $\sigma_a$ (the constant-velocity model of chapter 5). The filter alternates between two jobs." />
          <P ko={`**① 예측 — 불확실성이 자란다.** 측정이 없는 $T$ 초 동안 필터는 '지금 속도 그대로 간다'고 예측합니다. 그 사이에 모르는 가속도 $a$ 가 있었다면 실제 위치는 예측에서 $\\tfrac{1}{2} a T^2$ 만큼 벗어납니다. 여기에 속도를 정확히 모르는 몫(속도 오차 × $T$)이 더해집니다. $\\sigma_a$ = {{cfg:estimation.accelNoise}} 일 때 가속도만의 몫은 TWR ${N}대의 간격 ${fmt(1000 / twN.positionRate, 3)} ms{{der:ch3#rate}} 에서 ${fmt(0.5 * sa * (1 / twN.positionRate) ** 2 * 1000, 2)} mm{{der:ch3#rate-to-error|½·σ_a·T² 에 지금 설정값을 넣은 값|½·σ_a·T² with the current settings}}, TDoA 의 간격 ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}} 에서 ${fmt(0.5 * sa * (1 / td.positionRate) ** 2 * 1000, 2)} mm{{der:ch3#rate-to-error|½·σ_a·T² 에 지금 설정값을 넣은 값|½·σ_a·T² with the current settings}} 입니다. 간격이 길수록 **제곱으로** 불어납니다.`}
            en={`**① Predict — uncertainty grows.** During the $T$ seconds without a measurement the filter predicts 'keep the current velocity'. If there was an unknown acceleration $a$ meanwhile, the true position departs from the prediction by $\\tfrac{1}{2} a T^2$. On top of that comes the share from not knowing the velocity exactly (velocity error × $T$). With $\\sigma_a$ = {{cfg:estimation.accelNoise}} the acceleration share alone is ${fmt(0.5 * sa * (1 / twN.positionRate) ** 2 * 1000, 2)} mm{{der:ch3#rate-to-error|½·σ_a·T² 에 지금 설정값을 넣은 값|½·σ_a·T² with the current settings}} over the ${fmt(1000 / twN.positionRate, 3)} ms{{der:ch3#rate}} interval of TWR with ${N} drones and ${fmt(0.5 * sa * (1 / td.positionRate) ** 2 * 1000, 2)} mm{{der:ch3#rate-to-error|½·σ_a·T² 에 지금 설정값을 넣은 값|½·σ_a·T² with the current settings}} over the ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}} interval of TDoA. It grows with the **square** of the interval.`} />
          <P ko="**② 갱신 — 불확실성이 줄어든다.** 측정이 오면 예측과 측정을 섞습니다. 예측의 오차를 $\sigma_-$, 섞은 뒤의 오차를 $\sigma_+$ 라 하면, 서로 독립인 두 정보를 가장 좋게 섞었을 때 '분산의 역수'가 더해집니다. 분산의 역수는 그 정보가 얼마나 믿을 만한지를 나타내는 양입니다."
            en="**② Update — uncertainty shrinks.** When a measurement arrives, prediction and measurement are blended. With $\sigma_-$ the error of the prediction and $\sigma_+$ the error after blending, the best blend of two independent pieces of information adds their inverse variances — the inverse variance being a measure of how trustworthy a piece of information is." />
          <M block tex={String.raw`\frac{1}{\sigma_{+}^{2}} \;=\; \frac{1}{\sigma_{-}^{2}} \;+\; \frac{1}{\sigma_{\text{pos}}^{2}}`} />
          <P ko="두 줄로 확인할 수 있습니다. 예측값 $a$(오차 $\sigma_-$)와 측정값 $m$(오차 $\sigma_{\text{pos}}$)을 $w\,a + (1-w)\,m$ 으로 섞으면, 두 오차가 독립이므로 분산은 $w^2\sigma_-^2 + (1-w)^2\sigma_{\text{pos}}^2$ 입니다([통계 1분 복습](#/ch/0?a=stats)). $w$ 로 미분해 0 으로 놓으면 $w = \sigma_{\text{pos}}^2/(\sigma_-^2 + \sigma_{\text{pos}}^2)$ 이고, 이것을 넣으면 최소 분산이 $\sigma_-^2\sigma_{\text{pos}}^2/(\sigma_-^2 + \sigma_{\text{pos}}^2)$, 곧 위 식이 됩니다. 칼만 필터의 갱신은 이 '가장 좋은 섞기'입니다(5장)."
            en="Two lines confirm it. Blend the prediction $a$ (error $\sigma_-$) and the measurement $m$ (error $\sigma_{\text{pos}}$) as $w\,a + (1-w)\,m$. The errors are independent, so the variance is $w^2\sigma_-^2 + (1-w)^2\sigma_{\text{pos}}^2$ ([one-minute statistics review](#/ch/0?a=stats)). Setting the derivative in $w$ to zero gives $w = \sigma_{\text{pos}}^2/(\sigma_-^2 + \sigma_{\text{pos}}^2)$, and substituting it gives the minimum variance $\sigma_-^2\sigma_{\text{pos}}^2/(\sigma_-^2 + \sigma_{\text{pos}}^2)$, which is the formula above. The Kalman update is this 'best blend' (chapter 5)." />
          <P ko="**③ 균형.** 오래 돌리면 ①에서 자란 만큼과 ②에서 줄어든 만큼이 같아지는 값에 머뭅니다. 이 값이 **정상상태 추정 오차** $\sigma_{\text{est}}$ 이고, 오차 예산의 '융합 후 위치 추정 오차' 칸에 들어가는 수입니다. 균형점을 구하는 식(리카티 방정식)은 5장에서 유도합니다. 이 장에서는 엔진이 계산한 값을 쓰고, 같은 모델로 필터를 실제로 돌린 시뮬레이션과 겹쳐서 확인합니다."
            en="**③ Balance.** Run long enough, the error settles where the growth in ① equals the reduction in ②. This is the **steady-state estimate error** $\sigma_{\text{est}}$, the number that goes into the 'position estimate error after fusion' line of the error budget. The equation for the balance point (the Riccati equation) is derived in chapter 5. Here we use the value computed by the engine and check it against a simulation that actually runs the filter on the same model." />
          <P ko="두 극단은 식 없이도 알 수 있습니다. **갱신이 아주 드물면** 예측은 거의 쓸모가 없어서($\sigma_-$ 가 매우 큼) ②의 첫 항이 0 에 가까워지고 $\sigma_{\text{est}} \approx \sigma_{\text{pos}}$ 입니다. 측정 하나를 그대로 믿는 셈입니다. **갱신이 잦으면** 측정 사이에 드론이 거의 움직이지 않으므로 필터는 최근 측정 여러 개를 평균 내는 것과 비슷해집니다. $n$ 개를 평균 내면 오차는 $\sigma_{\text{pos}}/\sqrt{n}$ 이고, 같은 시간 안에 들어오는 측정 수 $n$ 은 갱신율에 비례하므로, **위 엔진의 가정 아래에서는** 오차가 대략 $1/\sqrt{f_{\text{pos}}}$ 로 줄어듭니다. 갱신율이 5배이면 오차는 $1/5$ 이 아니라 $1/\sqrt{5} \approx 1/2.2$ 근처입니다."
            en="The two extremes need no formula. **With very rare updates** the prediction is nearly useless ($\sigma_-$ very large), the first term of ② vanishes and $\sigma_{\text{est}} \approx \sigma_{\text{pos}}$: you simply trust one measurement. **With frequent updates** the drone hardly moves between measurements, so the filter behaves like an average of the last several. Averaging $n$ gives $\sigma_{\text{pos}}/\sqrt{n}$, and the number $n$ arriving in a given time is proportional to the rate, so **under the engine's assumption above** the error falls roughly as $1/\sqrt{f_{\text{pos}}}$. Five times the rate gives not $1/5$ but about $1/\sqrt{5} \approx 1/2.2$ of the error." />
          <P ko={`**가정이 결과를 바꾸는 곳.** 엔진의 가정에서는 측정 간격 $T$ 가 길면 모르는 가속도도 그만큼 **오래** 유지됩니다. 즉 갱신율을 낮추면 외란 자체도 세진다고 보는 셈이라, 두 모드를 비교할 때 갱신율과 외란이 함께 바뀝니다. 외란의 물리적 세기를 고정하고(모르는 가속도가 TDoA 간격 ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}} 마다 새로 뽑힘) 측정만 드물게 넣으면, 지금 설정(수평 측정 오차 $\\sigma_{\\text{pos,H}}$ = ${fmt(b.sigmaPosH * 100, 3)} cm{{der:ch2#gdop|HDOP × 유효 거리 오차, 지금 설정의 측위 모드|HDOP × effective range error, current positioning mode}}, $\\sigma_a$ = {{cfg:estimation.accelNoise}}, 아래 데모의 처음 값과 같은 조건)에서 TWR ${N}대의 수평 추정 오차는 ${fmt(eT * 100, 3)} cm{{der:ch5#steady-state}} 가 아니라 ${fmt(eT2 * 100, 3)} cm${FIXED}, TDoA 와의 비는 ${fmt(eT / eD, 3)}배{{der:ch5#steady-state}} 가 아니라 ${fmt(eT2 / eD2, 3)}배${FIXED} 입니다. 어느 쪽이든 결론(갱신율이 ${fmt(td.positionRate / twN.positionRate, 3)}배여도 오차는 그보다 훨씬 덜 준다)은 같지만, 정확한 배수는 외란 모델에 기댑니다. 이 장의 수치는 엔진의 가정으로 계산한 값입니다.`}
            en={`**Where the assumption changes the answer.** Under the engine's assumption a longer interval $T$ also keeps the unknown acceleration acting **longer**, so lowering the rate implicitly makes the disturbance itself stronger; comparing the modes then changes rate and disturbance together. If instead the physical disturbance is held fixed (the unknown acceleration is redrawn every TDoA interval of ${fmt(1000 / td.positionRate, 3)} ms{{der:ch3#rate}}) and only the measurements are made rarer, then with the current settings (horizontal measurement error $\\sigma_{\\text{pos,H}}$ = ${fmt(b.sigmaPosH * 100, 3)} cm{{der:ch2#gdop|HDOP × 유효 거리 오차, 지금 설정의 측위 모드|HDOP × effective range error, current positioning mode}}, $\\sigma_a$ = {{cfg:estimation.accelNoise}}, the same conditions the demo below starts from) the horizontal estimate error of TWR with ${N} drones is ${fmt(eT2 * 100, 3)} cm${FIXED} instead of ${fmt(eT * 100, 3)} cm{{der:ch5#steady-state}}, and the ratio to TDoA is ${fmt(eT2 / eD2, 3)}${FIXED} instead of ${fmt(eT / eD, 3)}{{der:ch5#steady-state}}. Either way the conclusion holds (a ${fmt(td.positionRate / twN.positionRate, 3)}-fold rate shrinks the error by much less than that), but the exact factor depends on the disturbance model. The numbers in this chapter use the engine's assumption.`} />
          <P ko="한 가지 더. 위 식은 한 축의 식인데, 오차 예산이 쓰는 수평 측정 오차 $\sigma_{\text{pos,H}}$ = HDOP × 유효 거리 오차는 x, y 두 축을 합친 크기입니다. 그래서 예산은 이것을 두 축에 똑같이 나눠($\sigma_x = \sigma_y = \sigma_{\text{pos,H}}/\sqrt2$) 축마다 위 식을 적용한 뒤, 두 축을 다시 합칩니다."
            en="One more point. The formula above is for one axis, but the horizontal measurement error the budget uses, $\sigma_{\text{pos,H}}$ = HDOP × effective range error, is the size of the x and y axes combined. So the budget splits it equally over the two axes ($\sigma_x = \sigma_y = \sigma_{\text{pos,H}}/\sqrt2$), applies the formula per axis, and combines the two axes again." />
          <M block tex={String.raw`\sigma_{\text{est,H}} \;=\; \sqrt{2}\;\sigma_{\text{ss}}\!\left(\frac{\sigma_{\text{pos,H}}}{\sqrt2}\right)`} />
          <P ko="여기서 $\sigma_{\text{ss}}(\cdot)$ 는 위 ①~③의 1축 정상상태 오차입니다. 이 장에 나오는 수평 추정 오차(위 문단, 아래 데모의 타일, 함정 실험실)는 모두 이 규약으로 계산한 값이라 서로, 그리고 오차 예산과 바로 견줄 수 있습니다."
            en="Here $\sigma_{\text{ss}}(\cdot)$ is the one-axis steady-state error of ①–③. Every horizontal estimate error in this chapter (the paragraph above, the demo tiles below, the pitfall lab) uses this convention, so they compare directly with each other and with the error budget." />
        </Derivation>
        <ErrorDemo />
      </Section>

      <Section id="price" title={{ ko: 'TDoA 의 대가', en: 'The price of TDoA' }}>
        <P ko="갱신율만 보면 TDoA 를 안 쓸 이유가 없습니다. 하지만 TDoA 는 태그 수의 제약을 없애는 대신 세 가지를 내줍니다."
          en="Looking at the rate alone, there is no reason not to use TDoA. But in exchange for removing the limit on tags, TDoA gives up three things." />
        <List ordered items={[
          { ko: '**측정이 더 시끄럽습니다.** TDoA 측정은 TWR 보다 잡음이 커서 측위 정확도가 낮습니다{{lit:cf-firmware-docs/tdoa-noisier}}. TWR 은 세 모드 가운데 가장 정확한 모드입니다{{lit:lps-docs/twr-description}}. 다만 문헌은 방향만 말하고 크기는 주지 않습니다. 이 교재의 설정 TWR 거리 노이즈 {{cfg:uwb.sigmaTwr}}, TDoA 거리차 노이즈 {{cfg:uwb.sigmaTdoa}} 는 그 방향만 따른 **가정**이며, 1장에서 본 펌웨어 필터의 표준편차 상수와는 다른 값입니다(여러분의 측정값으로 바꾸는 방법은 9장).', en: '**The measurements are noisier.** TDoA measurements are noisier than TWR, so positioning is less accurate{{lit:cf-firmware-docs/tdoa-noisier}}; TWR is the most accurate of the three modes{{lit:lps-docs/twr-description}}. The literature gives only the direction, not the size. The settings of this textbook, TWR range noise {{cfg:uwb.sigmaTwr}} and TDoA range-difference noise {{cfg:uwb.sigmaTdoa}}, are **assumptions** that follow that direction only; they are not the standard-deviation constants of the firmware filter seen in chapter 1 (chapter 9 shows how to replace them with your own measurements).' },
          { ko: '**앵커들의 시계를 서로 맞춰야 합니다.** 이를 **동기화**(synchronisation)라고 합니다{{lit:bitcraze-tdoa-blog/tdoa-scales}}. TDoA 2 에서는 앵커 0 이 기준이 되고, 시간 슬롯을 쓰는 방식이라 앵커가 8개로 제한됩니다{{lit:lps-docs/tdoa2-max-anchors}}. TDoA 3 는 슬롯 대신 무작위 송신 일정을 써서 기준 앵커가 없고 앵커를 더 늘릴 수 있지만{{lit:lps-docs/tdoa3-scalable}}, 패킷이 가끔 겹치는 것을 감수하므로 정밀도는 TDoA 2 가 조금 더 좋습니다{{lit:lps-docs/tdoa3-precision}}.', en: '**The anchors must align their clocks with each other** — **synchronisation**{{lit:bitcraze-tdoa-blog/tdoa-scales}}. In TDoA 2, anchor 0 is the reference and the time-slotted scheme limits the system to 8 anchors{{lit:lps-docs/tdoa2-max-anchors}}. TDoA 3 replaces slots with a randomised transmit schedule, has no reference anchor and allows more anchors{{lit:lps-docs/tdoa3-scalable}}, but accepts occasional packet collisions, so the precision of TDoA 2 is slightly better{{lit:lps-docs/tdoa3-precision}}.' },
          { ko: '**앵커가 둘러싼 공간 안에서만 잘 됩니다.** TDoA 의 정확도는 앵커들의 **볼록 껍질**(convex hull: 앵커들을 꼭짓점 삼아 고무막을 팽팽하게 씌운 입체) 안에서는 좋지만 밖으로 나가면 빠르게 나빠집니다. 그래서 TDoA 2 는 비행 공간의 모서리에 앵커 8개를 둘 때 가장 잘 동작합니다{{lit:lps-docs/tdoa2-convex-hull}}. TWR 은 앵커가 둘러싼 공간 밖에서도 동작합니다{{lit:lps-docs/twr-description}}.', en: '**It only works well inside the space enclosed by the anchors.** TDoA accuracy is good inside the **convex hull** of the anchors (the solid you get by stretching a rubber skin over the anchors as corners) and deteriorates quickly outside it, which is why TDoA 2 works best with 8 anchors in the corners of the flying space{{lit:lps-docs/tdoa2-convex-hull}}. TWR also works outside the anchor volume{{lit:lps-docs/twr-description}}.' },
        ]} />
        <Derivation id="volume" title={{ ko: '왜 밖으로 나가면 TDoA 만 무너지나', en: 'Why only TDoA collapses outside' }}>
          <P ko="2장에서 측정 하나가 위치에 대해 알려 주는 **방향**을 벡터로 썼습니다. 앵커 $i$ 에서 태그를 향하는 길이 1 인 벡터를 $e_i$ 라 하면, TWR 거리 측정 하나의 방향은 $e_i$ 이고 TDoA 거리차 측정 하나의 방향은 두 벡터의 차 $e_j - e_i$ 입니다. 이 벡터가 **길수록** 같은 측정 오차가 위치 오차로 덜 번집니다(DOP 가 작습니다)."
            en="In chapter 2 we wrote the **direction** in which one measurement informs the position as a vector. With $e_i$ the unit vector from anchor $i$ toward the tag, one TWR range points along $e_i$ and one TDoA range difference along the difference $e_j - e_i$. The **longer** this vector, the less a given measurement error spreads into position error (the smaller the DOP)." />
          <P ko="태그에서 두 앵커를 바라본 각도를 $\theta_{ij}$ 라 합시다. 길이가 1 인 두 벡터의 차의 길이는 코사인 법칙으로 구합니다."
            en="Let $\theta_{ij}$ be the angle between the two anchors as seen from the tag. The length of the difference of two unit vectors follows from the law of cosines." />
          <M block tex={String.raw`\lVert e_j - e_i \rVert^2 = 1 + 1 - 2\cos\theta_{ij} = 4\sin^2\!\frac{\theta_{ij}}{2}
\quad\Longrightarrow\quad
\lVert e_j - e_i \rVert = 2\sin\frac{\theta_{ij}}{2}`} />
          <List items={[
            { ko: `**앵커들 한가운데**에서는 앵커가 사방에 있어 $\\theta_{ij}$ 가 큽니다. 이 교재가 쓰는 쌍(번호가 이웃한 앵커끼리 묶은 고리 쌍)은 지금 배치의 강당 가운데에서 $\\theta_{ij}$ 가 ${fmt(angDeg(lenMin), 2)}°~${fmt(angDeg(lenMax), 2)}°${RING}, 차 벡터의 길이가 ${fmt(lenMin, 3)}~${fmt(lenMax, 3)}${RING} 입니다. TWR 의 $e_i$ (길이 1) 보다 오히려 깁니다(이론상 최대는 $\\theta_{ij}$ = 180° 일 때의 2).`, en: `**In the middle of the anchors** they surround the tag and $\\theta_{ij}$ is large. For the pairs this textbook uses (a ring of anchors with neighbouring numbers), at the hall centre of the current layout $\\theta_{ij}$ is ${fmt(angDeg(lenMin), 2)}°–${fmt(angDeg(lenMax), 2)}°${RING} and the difference vectors are ${fmt(lenMin, 3)}–${fmt(lenMax, 3)}${RING} long, longer than the TWR vector $e_i$ (length 1). (The theoretical maximum is 2, at $\\theta_{ij}$ = 180°.)` },
            { ko: '**앵커 무리의 바깥**에서는 모든 앵커가 한쪽에 몰려 보입니다. 폭이 $w$ 인 앵커 무리를 거리 $L$ 만큼 떨어져서 보면 $\\theta_{ij} \\approx w/L$ (라디안) 이고, 작은 각에서 $\\sin x \\approx x$ 이므로 차 벡터의 길이는 $\\approx w/L$ 입니다. 멀어질수록 0 으로 줄어듭니다.', en: '**Outside the group of anchors** they all appear on one side. Seen from a distance $L$, a group of width $w$ subtends $\\theta_{ij} \\approx w/L$ (radians); since $\\sin x \\approx x$ for small angles the difference vector is $\\approx w/L$ long and shrinks to 0 as you move away.' },
            { ko: 'TWR 의 $e_i$ 는 어디서나 길이가 1 입니다. 밖으로 나가도 \'앵커까지 얼마나 먼가\'는 그대로 잴 수 있고, 나빠지는 것은 옆 방향뿐입니다.', en: 'The TWR vector $e_i$ has length 1 everywhere. Outside, the distance to the anchors is still measured as well as before; only the sideways direction gets worse.' },
          ]} />
          <P ko="즉 TDoA 는 바깥에서 측정 하나하나가 알려 주는 것이 $w/L$ 배로 줄어들고, 위치 오차는 그 역수인 $L/w$ 배로 커집니다. 특히 '앵커 무리에서 얼마나 멀리 있는가'는 거의 알 수 없게 됩니다(차 벡터들이 모두 그 방향에 수직에 가까워지기 때문입니다). 이 교재는 계산이 쉬운 기준으로, 볼록 껍질 대신 **앵커 좌표의 최솟값과 최댓값이 만드는 상자**(앵커 상자) 안에 있는지를 봅니다. 모서리에 앵커를 둔 직육면체 강당에서는 둘이 같습니다."
            en="So outside, each TDoA measurement tells you $w/L$ times as much, and the position error grows by the inverse, $L/w$. In particular 'how far am I from the group of anchors' becomes almost unobservable (all the difference vectors turn nearly perpendicular to that direction). As a simple test this textbook uses, instead of the convex hull, **the box spanned by the smallest and largest anchor coordinates** (the anchor box). For a box-shaped hall with anchors in the corners the two coincide." />
        </Derivation>
        <VolumeDemo />
        <h3>{tr({ ko: '세 모드를 한 표로', en: 'The three modes in one table' })}</h3>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '항목', en: 'Aspect' })}</th><th>TWR</th><th>TDoA 2</th><th>TDoA 3</th></tr></thead>
            <tbody>
              <tr>
                <td><b>{tr({ ko: '누가 송신하나', en: 'Who transmits' })}</b></td>
                <td><T ko="태그와 앵커 둘 다{{lit:lps-docs/twr-description}}" en="Both tag and anchor{{lit:lps-docs/twr-description}}" /></td>
                <td colSpan={2}><T ko="앵커만. 태그는 듣기만 한다{{lit:lps-docs/tdoa-passive-unlimited-tags}}" en="Anchors only; the tag just listens{{lit:lps-docs/tdoa-passive-unlimited-tags}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '동시에 측위하는 태그 수', en: 'Tags positioned at once' })}</b></td>
                <td><T ko="1대{{lit:lps-docs/twr-tag-limit}}" en="1{{lit:lps-docs/twr-tag-limit}}" /></td>
                <td colSpan={2}><T ko="제한 없음{{lit:lps-docs/tdoa-passive-unlimited-tags}}" en="No limit{{lit:lps-docs/tdoa-passive-unlimited-tags}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '정확도', en: 'Accuracy' })}</b></td>
                <td><T ko="가장 정확{{lit:lps-docs/twr-description}}" en="The most accurate{{lit:lps-docs/twr-description}}" /></td>
                <td><T ko="측정 잡음이 TWR 보다 큼{{lit:cf-firmware-docs/tdoa-noisier}}. 앵커 안쪽에서는 TWR 과 비슷{{lit:lps-docs/tdoa2-convex-hull}}" en="Noisier measurements than TWR{{lit:cf-firmware-docs/tdoa-noisier}}; similar to TWR inside the anchors{{lit:lps-docs/tdoa2-convex-hull}}" /></td>
                <td><T ko="TDoA 2 보다 조금 낮음{{lit:lps-docs/tdoa3-precision}}" en="Slightly below TDoA 2{{lit:lps-docs/tdoa3-precision}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '앵커가 둘러싼 공간 밖', en: 'Outside the anchor volume' })}</b></td>
                <td><T ko="동작한다{{lit:lps-docs/twr-description}}" en="Works{{lit:lps-docs/twr-description}}" /></td>
                <td colSpan={2}><T ko="빠르게 나빠진다{{lit:lps-docs/tdoa2-convex-hull}}" en="Deteriorates quickly{{lit:lps-docs/tdoa2-convex-hull}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '앵커끼리의 시계 동기화', en: 'Clock sync between anchors' })}</b></td>
                <td><T ko="필요 없음 (왕복으로 재므로 시계 차이가 상쇄된다 — 1장)" en="Not needed (a round trip cancels the clock offset — chapter 1)" /></td>
                <td><T ko="필요{{lit:bitcraze-tdoa-blog/tdoa-scales}}. 앵커 0 이 기준{{lit:lps-docs/tdoa2-max-anchors}}" en="Needed{{lit:bitcraze-tdoa-blog/tdoa-scales}}; anchor 0 is the reference{{lit:lps-docs/tdoa2-max-anchors}}" /></td>
                <td><T ko="필요{{lit:bitcraze-tdoa-blog/tdoa-scales}}. 기준(마스터) 앵커는 없음{{lit:lps-docs/tdoa3-scalable}}" en="Needed{{lit:bitcraze-tdoa-blog/tdoa-scales}}; there is no reference (master) anchor{{lit:lps-docs/tdoa3-scalable}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '앵커 수의 상한', en: 'Maximum number of anchors' })}</b></td>
                <td><T ko="8개{{lit:lps-docs/twr-tag-limit}}" en="8{{lit:lps-docs/twr-tag-limit}}" /></td>
                <td><T ko="8개{{lit:lps-docs/tdoa2-max-anchors}}" en="8{{lit:lps-docs/tdoa2-max-anchors}}" /></td>
                <td><T ko="더 늘릴 수 있음(문서에 상한 숫자는 없음){{lit:lps-docs/tdoa3-scalable}}" en="More can be added (the docs give no number){{lit:lps-docs/tdoa3-scalable}}" /></td>
              </tr>
              <tr>
                <td><b>{tr({ ko: '송신 일정', en: 'Transmit schedule' })}</b></td>
                <td><T ko="태그가 앵커를 차례로 부름. 거리 측정 500 Hz 를 앵커들이 나눔{{lit:lps-docs/twr-ranging-rate}}" en="The tag calls anchors in turn; 500 Hz of ranging shared by the anchors{{lit:lps-docs/twr-ranging-rate}}" /></td>
                <td><T ko="2 ms 슬롯 8개, 16 ms 프레임{{lit:lps-docs/tdoa2-slot-timing}}" en="Eight 2 ms slots, 16 ms frame{{lit:lps-docs/tdoa2-slot-timing}}" /></td>
                <td><T ko="무작위 일정. 앵커 펌웨어의 **소스 코드 상수**로는 시스템 전체 400 Hz, 앵커당 20~50 Hz{{lit:lps-docs/tdoa3-tx-rates}}" en="Randomised. As **source-code constants** of the anchor firmware: 400 Hz system-wide, 20–50 Hz per anchor{{lit:lps-docs/tdoa3-tx-rates}}" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <P ko="TDoA 3 는 슬롯을 쓰지 않으므로 이 장의 슬롯 모델이 그대로 들어맞지는 않습니다. 전역 설정의 'TDoA 앵커 슬롯 길이'를 '앵커 패킷 사이의 평균 간격'으로 읽으면 같은 식으로 어림할 수 있습니다."
          en="TDoA 3 does not use slots, so the slot model of this chapter does not fit it exactly. Reading the global 'TDoA anchor slot length' as 'the mean interval between anchor packets' gives a rough estimate with the same formula." />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <RatePitfall />
      </Section>

      <Section id="settings" title={{ ko: '우리 시스템의 모드 정하기', en: 'Choosing the mode for our system' }}>
        <P ko="아래 선택은 전역 설정과 연결되어 있습니다. 여기서 바꾸면 오차 예산과 다른 장의 데모가 함께 바뀝니다. 거리 1회 시간과 슬롯 길이는 위 '태그 수를 늘리면…' 데모의 슬라이더에서 바꿀 수 있습니다. 슬롯 길이는 문서의 값 그대로일 때 문헌 배지가, 거리 1회 시간은 문서의 500 Hz 에서 유도한 2 ms 그대로일 때 유도 배지가 붙습니다."
          en="The choice below is tied to the global settings: changing it here also changes the error budget and the demos of other chapters. The time per range and the slot length can be changed with the sliders in the 'Per-drone update rate…' demo above. The slot length carries a literature badge while it equals the documented value; the time per range carries a derivation badge while it equals the 2 ms derived from the documented 500 Hz." />
        <Segmented label={{ ko: '측위 모드 (전역 설정)', en: 'Positioning mode (global setting)' }} value={cfg.uwb.mode} onChange={(v) => setPath('uwb.mode', v)} testId="ch3-global-mode" options={[
          { value: 'tdoa', label: { ko: 'TDoA (프로젝트 기본)', en: 'TDoA (project default)' } },
          { value: 'twr', label: { ko: 'TWR', en: 'TWR' } },
        ]} />
        <StatRow>
          <Stat label={{ ko: '드론당 위치 갱신율', en: 'Position rate per drone' }} value={b.posRate} unit="Hz" src={der('ch3#rate', { ko: '선택한 모드의 식에 전역 설정값을 넣은 값', en: 'The formula of the selected mode with the global settings' })} />
          <Stat label={{ ko: '위치 갱신 주기', en: 'Position update period' }} value={1000 / b.posRate} unit="ms" src={der('ch3#rate')} />
          <Stat label={{ ko: '융합 후 수평 추정 오차', en: 'Horizontal estimate error after fusion' }} value={b.sigmaEstH * 100} unit="cm" src={der('ch5#steady-state', { ko: '오차 예산의 추정 오차 항(정상상태 칼만 필터, 5장에서 유도)', en: 'The estimate-error item of the budget (steady-state Kalman filter, derived in chapter 5)' })} />
          <Stat label={{ ko: '권장 최소 수평 간격', en: 'Recommended minimum horizontal spacing' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum', { ko: '현재 설정으로 계산한 오차 예산의 합(최소 간격의 식은 8장)', en: 'Sum of the error budget for the current settings (the minimum-spacing formula is in chapter 8)' })} status={b.spacingOk ? 'good' : 'bad'} />
        </StatRow>
        <p class="small muted">{tr({ ko: '기호의 뜻: ✓ 지금 대형 간격이 권장 최소 간격 이상 · ✕ 권장 최소 간격보다 좁음.', en: 'Symbols: ✓ the current formation spacing meets the recommended minimum · ✕ tighter than the recommended minimum.' })}</p>
        <P ko={isTwr
          ? `지금은 **TWR** 입니다. ${N}대가 채널을 나눠 쓴다고 가정한 값이며, 공식 문서가 적은 TWR 의 태그 수는 1대라는 점을 잊지 마세요{{lit:lps-docs/twr-tag-limit}}.`
          : `지금은 **TDoA** 입니다. 갱신율은 드론 수와 무관합니다. 대신 대형이 도는 경로 전체가 앵커 상자 안에 있는지 위 함정 실험실의 마지막 줄에서 확인하세요.`}
          en={isTwr
            ? `The mode is currently **TWR**. The values assume ${N} drones sharing the channel; remember that the official docs give one tag for TWR{{lit:lps-docs/twr-tag-limit}}.`
            : `The mode is currently **TDoA**. The rate does not depend on the number of drones. In return, check in the last line of the pitfall lab above that the whole path of the formation stays inside the anchor box.`} />
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 3,
  title: CHAPTERS[3].title,
  lead: {
    ko: '드론이 한 대일 때는 보이지 않던 문제입니다. 채널은 하나인데 5대가 써야 합니다. 누가 송신하는지를 세어 보면 드론 수가 두 모드의 갱신율을 어떻게 바꾸는지, 그리고 각 모드가 무엇을 내주는지가 나옵니다.',
    en: 'A problem you cannot see with one drone: there is one channel and five drones need it. Counting who transmits shows how the number of drones affects the update rate of each mode, and what each mode gives up.',
  },
  objectives: [
    { ko: '누가 송신하는지를 세어 TWR 과 TDoA 의 드론당 위치 갱신율 식을 유도하고 계산한다.', en: 'Derive and compute the per-drone position update rate of TWR and TDoA by counting who transmits.' },
    { ko: '갱신율이 추정 오차와 권장 간격을 어떻게 바꾸는지 설명한다.', en: 'Explain how the update rate changes the estimate error and the recommended spacing.' },
    { ko: 'TDoA 의 대가(더 큰 측정 잡음, 앵커 동기화, 앵커가 둘러싼 공간)를 알고 우리 시스템의 모드를 근거를 갖고 고른다.', en: 'Know the price of TDoA (noisier measurements, anchor synchronisation, the anchor volume) and choose the mode for our system with reasons.' },
  ],
  Body,
  budget: {
    items: ['pos-rate'],
    note: {
      ko: '이 장은 예산에 **드론당 위치 갱신율** 한 줄을 더합니다. 갱신율은 그 자체로는 미터 단위의 오차가 아닙니다. 5장의 융합 단계에 입력으로 들어가서, UWB 만의 위치 오차가 필터를 거친 뒤 얼마로 줄어드는지(융합 후 위치 추정 오차)를 정합니다. 그래서 막대의 합계에는 직접 더해지지 않는 중간값으로 표시됩니다.',
      en: 'This chapter adds one line: the **position update rate per drone**. The rate is not an error in metres by itself. It feeds the fusion step of chapter 5, where it decides how far the UWB-only position error is reduced by the filter (the position estimate error after fusion). It therefore appears as an intermediate value, not added directly to the total.',
    },
  },
  summary: [
    { ko: 'TWR 은 태그가 송신해야 하므로 채널을 나눠 쓴다: $f_{\\text{pos}} = 1/(N_{\\text{tag}} N_{\\text{anc}} T_{\\text{range}})$. TDoA 는 앵커만 송신하고 태그는 듣기만 하므로 태그 수와 무관하다: $f_{\\text{pos}} = 1/(N_{\\text{anc}} T_{\\text{slot}})$.', en: 'In TWR the tag must transmit, so the channel is shared: $f_{\\text{pos}} = 1/(N_{\\text{tag}} N_{\\text{anc}} T_{\\text{range}})$. In TDoA only anchors transmit and tags listen, so the rate is independent of the number of tags: $f_{\\text{pos}} = 1/(N_{\\text{anc}} T_{\\text{slot}})$.' },
    { ko: '갱신율은 필터를 거쳐 추정 오차가 된다. 갱신율이 $n$ 배가 되어도 오차는 $1/n$ 이 아니라 그보다 훨씬 덜 준다(엔진의 외란 가정에서 대략 $1/\\sqrt{n}$, 외란 모델에 따라 조금 다름). 드물게 알수록 측정 한 번의 오차에 가까워진다.', en: 'The rate turns into estimate error through the filter: $n$ times the rate shrinks the error by much less than $n$ (roughly $1/\\sqrt{n}$ under the engine\'s disturbance assumption, somewhat different for other disturbance models); the rarer the updates, the closer you are to the error of a single measurement.' },
    { ko: 'TDoA 의 대가는 더 큰 측정 잡음, 앵커 시계 동기화, 그리고 앵커가 둘러싼 공간 안에서만 정확하다는 것이다. 5대를 띄우는 우리는 TDoA 를 쓰고 앵커 상자 안에서 난다.', en: 'The price of TDoA is noisier measurements, anchor clock synchronisation, and accuracy only inside the space enclosed by the anchors. Flying five, we use TDoA and stay inside the anchor box.' },
  ],
  next: {
    ko: '지금까지 측정은 모두 정직했습니다. 잡음은 있어도 평균은 참값이었습니다. 그런데 앵커와 드론 사이를 다른 드론이나 사람, 철제 구조물이 가로막으면 어떻게 될까요? 그때 거리는 어떻게 재질까요? 그런 측정이 섞여 들어오면 필터는 어떻게 될까요?',
    en: 'So far every measurement has been honest: noisy, but right on average. What if another drone, a person or a steel truss blocks the line between an anchor and a drone? How is the distance measured then — and what happens to the filter when such measurements slip in?',
  },
  tasks,
};
export default def;
