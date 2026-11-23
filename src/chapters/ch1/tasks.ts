import type { CodingTask } from '../../py/grader';

export const dsTwrTask: CodingTask = {
  id: 'ch1-dstwr',
  chapter: 1,
  title: { ko: '타임스탬프 6개로 DS-TWR 거리 계산하기', en: 'DS-TWR distance from six timestamps' },
  prompt: {
    ko: '메시지 3개(poll → answer → final)를 주고받으며 두 장치가 찍은 **타임스탬프 6개**를 받아 거리를 **미터**로 돌려주는 함수 `ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx)` 를 완성하세요.\n\n인자는 모두 **틱**(tick) 단위의 수입니다(정수일 수도, 실수일 수도 있습니다). 1틱은 `TICK` 초이고, 이 값은 UWB 칩의 63.8976 GHz 클록의 한 주기, 약 15.65 ps{{lit:dw1000/timestamp-resolution}} 입니다. `poll_tx`, `answer_rx`, `final_tx` 는 **장치 A(태그)의 시계**로, `poll_rx`, `answer_tx`, `final_rx` 는 **장치 B(앵커)의 시계**로 찍은 값입니다. 두 시계는 서로 다른 때에 0 에서 출발했고 빠르기도 조금 다릅니다. 그래서 A 의 타임스탬프와 B 의 타임스탬프를 서로 빼면 아무 뜻이 없습니다. 한 시계 안에서 타임스탬프는 사건 순서대로 커지며, 카운터가 넘쳐 0 으로 돌아가는 경우는 없다고 가정합니다.\n\n구간 네 개를 만드세요: $T_{round1}$ = poll 송신 → answer 수신 (A), $T_{reply1}$ = poll 수신 → answer 송신 (B), $T_{round2}$ = answer 송신 → final 수신 (B), $T_{reply2}$ = answer 수신 → final 송신 (A). 그다음 **비대칭 DS-TWR 공식** $\\hat T_f = (T_{round1}T_{round2} - T_{reply1}T_{reply2}) / (T_{round1} + T_{round2} + T_{reply1} + T_{reply2})$ 으로 비행시간을 구하고, 틱 → 초 → 미터로 바꿔 돌려주세요. 빛의 속도는 `C` 를 그대로 쓰세요(반올림한 3e8 은 채점에서 걸립니다). 채점 허용 오차(이 과제가 정한 기준)는 절대 1 µm{{ex}} 입니다.',
    en: 'Complete `ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx)`. It receives the **six timestamps** recorded by two devices during a three-message exchange (poll → answer → final) and returns the distance in **metres**.\n\nAll arguments are numbers in **ticks** (they may be integers or floats). One tick is `TICK` seconds: one period of the 63.8976 GHz clock of the UWB chip, about 15.65 ps{{lit:dw1000/timestamp-resolution}}. `poll_tx`, `answer_rx`, `final_tx` are read on **the clock of device A (the tag)**; `poll_rx`, `answer_tx`, `final_rx` on **the clock of device B (the anchor)**. The two clocks started from 0 at different moments and run at slightly different speeds, so subtracting a timestamp of A from a timestamp of B is meaningless. Within one clock the timestamps increase in the order of events, and you may assume the counter never wraps around to 0.\n\nForm the four intervals: $T_{round1}$ = poll sent → answer received (A), $T_{reply1}$ = poll received → answer sent (B), $T_{round2}$ = answer sent → final received (B), $T_{reply2}$ = answer received → final sent (A). Then compute the time of flight with the **asymmetric DS-TWR formula** $\\hat T_f = (T_{round1}T_{round2} - T_{reply1}T_{reply2}) / (T_{round1} + T_{round2} + T_{reply1} + T_{reply2})$, and convert ticks → seconds → metres. Use `C` as given for the speed of light (a rounded 3e8 fails the grader). The grading tolerance (a criterion set by this task) is 1 µm{{ex}} absolute.',
  },
  starter: `C = 299_792_458.0          # 빛의 속도 [m/s]
TICK = 1.0 / 63.8976e9     # 타임스탬프 1틱 [s] (약 15.65 ps)

def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    # 1) 구간 네 개를 만든다. 같은 장치의 타임스탬프끼리만 뺀다 (단위: 틱)
    #    A 의 시계: poll_tx, answer_rx, final_tx
    #    B 의 시계: poll_rx, answer_tx, final_rx
    t_round1 = 0.0
    t_reply1 = 0.0
    t_round2 = 0.0
    t_reply2 = 0.0
    # 2) 비대칭 DS-TWR 공식으로 비행시간 [틱]
    tof = 0.0
    # 3) 틱 → 초 → 미터
    return 0.0
`,
  solution: `C = 299_792_458.0          # 빛의 속도 [m/s]
TICK = 1.0 / 63.8976e9     # 타임스탬프 1틱 [s] (약 15.65 ps)

def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    # 같은 장치의 타임스탬프끼리만 뺀다 (단위: 틱)
    t_round1 = answer_rx - poll_tx     # A 시계: poll 송신 → answer 수신
    t_reply1 = answer_tx - poll_rx     # B 시계: poll 수신 → answer 송신
    t_round2 = final_rx - answer_tx    # B 시계: answer 송신 → final 수신
    t_reply2 = final_tx - answer_rx    # A 시계: answer 수신 → final 송신
    # 비대칭 DS-TWR 공식: 비행시간 [틱]
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    return C * tof * TICK              # 틱 → 초 → 미터
`,
  links: { round1: [6], reply1: [7], round2: [8], reply2: [9], ds: [11], dist: [12] },
  tests: `
_C = 299792458.0
_TICK = 1.0 / 63.8976e9

def _stamps(d, reply1, reply2, eA=0.0, eB=0.0, offA=0.0, offB=0.0, integer=False):
    # 거리 d [m], 응답 지연 reply1 (B 시계), reply2 (A 시계) [s], 클럭 오차 eA, eB (비율),
    # 실제 시각 0 에서 각 시계가 가리키는 값 offA, offB [틱] → 타임스탬프 6개 [틱]
    T = d / _C
    t1 = 0.0
    t2 = t1 + T
    t3 = t2 + reply1 / (1 + eB)
    t4 = t3 + T
    t5 = t4 + reply2 / (1 + eA)
    t6 = t5 + T
    A = lambda t: (1 + eA) * t / _TICK + offA
    B = lambda t: (1 + eB) * t / _TICK + offB
    s = (A(t1), B(t2), B(t3), A(t4), A(t5), B(t6))
    return tuple(int(round(v)) for v in s) if integer else s

def _batch(ns):
    r = np.random.default_rng(20261122)
    out = []
    for _ in range(40):
        s = _stamps(r.uniform(0.5, 30.0), r.uniform(200e-6, 2000e-6), r.uniform(200e-6, 2000e-6),
                    r.uniform(-20e-6, 20e-6), r.uniform(-20e-6, 20e-6),
                    float(r.integers(0, 10**9)), float(r.integers(0, 10**9)), integer=True)
        out.append(ns["ds_twr_distance"](*s))
    return np.asarray(out, dtype=float)

TESTS = [
    dict(name_ko="정확한 시계, 5 m", name_en="Perfect clocks, 5 m", rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(5.0, 300e-6, 300e-6)),
         hint_ko="구간을 올바른 짝으로 뺐는지 확인하세요: $T_{round1}$ = answer_rx − poll_tx, $T_{reply1}$ = answer_tx − poll_rx, $T_{round2}$ = final_rx − answer_tx, $T_{reply2}$ = final_tx − answer_rx. 그리고 결과에 TICK 과 C 를 곱해 틱 → 초 → 미터로 바꿨나요? 나눗셈은 // 가 아니라 / 여야 합니다.",
         hint_en="Check the pairs: $T_{round1}$ = answer_rx − poll_tx, $T_{reply1}$ = answer_tx − poll_rx, $T_{round2}$ = final_rx − answer_tx, $T_{reply2}$ = final_tx − answer_rx. Did you multiply by TICK and C to go ticks → seconds → metres? The division must be /, not //."),
    dict(name_ko="두 시계가 서로 다른 때에 0 에서 출발", name_en="The two clocks started from 0 at different moments", rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(12.0, 400e-6, 400e-6, offA=1.2e9, offB=7.7e8)),
         hint_ko="앞 케이스는 맞았는데 여기서 틀렸다면: A 의 타임스탬프와 B 의 타임스탬프를 서로 빼지 않았나요? 두 시계의 0 은 서로 다릅니다. A 끼리(poll_tx, answer_rx, final_tx), B 끼리(poll_rx, answer_tx, final_rx)만 빼야 합니다.",
         hint_en="If the previous case passed but this one fails: did you subtract a timestamp of A from one of B? Their zeros differ. Subtract only within A (poll_tx, answer_rx, final_tx) and within B (poll_rx, answer_tx, final_rx)."),
    dict(name_ko="클럭 오차 A +10 ppm, B −10 ppm (두 응답에 걸린 실제 시간은 같음)", name_en="Clock errors A +10 ppm, B −10 ppm (both replies take the same true time)", rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(5.0, 500e-6 * (1 - 10e-6), 500e-6 * (1 + 10e-6), eA=10e-6, eB=-10e-6, offA=3.0e8, offB=9.1e8)),
         hint_ko="시계가 정확한 케이스는 맞았는데 여기서 틀렸다면: 앞의 두 메시지만 써서 $\\\\tfrac12(T_{round1} - T_{reply1})$ 로 계산하면(SS-TWR) 클럭 오차가 응답 지연에 곱해져 미터 단위로 남습니다. 세 번째 메시지(final)까지 써서 비대칭 공식으로 계산하세요.",
         hint_en="If the perfect-clock cases passed but this one fails: using only the first two messages, $\\\\tfrac12(T_{round1} - T_{reply1})$ (SS-TWR), leaves a clock error multiplied by the reply delay — metres. Use the third message (final) too, with the asymmetric formula."),
    dict(name_ko="클럭 오차가 있고 응답 지연이 서로 다름 (300 µs, 900 µs)", name_en="Clock errors and unequal reply delays (300 µs, 900 µs)", rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(8.0, 300e-6, 900e-6, eA=15e-6, eB=-5e-6, offA=5.5e8, offB=2.0e7)),
         hint_ko="바로 앞 케이스는 맞았는데 여기서 틀렸다면: 네 구간을 더하고 빼서 4로 나누는 **대칭** 공식은 두 응답 지연이 같을 때만 맞습니다. 응답 지연이 다르면 곱의 차를 합으로 나누는 **비대칭** 공식을 써야 합니다.",
         hint_en="If the previous case passed but this one fails: the **symmetric** formula (add and subtract the four intervals, divide by 4) is right only when the two reply delays are equal. With unequal delays use the **asymmetric** formula: difference of products over the sum."),
    dict(name_ko="먼 거리 100 m, 두 시계 모두 +20 ppm", name_en="Long range 100 m, both clocks +20 ppm", hidden=True, rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(100.0, 250e-6, 700e-6, eA=20e-6, eB=20e-6, offA=1.0e6, offB=4.0e9)),
         hint_ko="거리가 멀면 작은 비율 오차도 드러납니다. 빛의 속도를 3e8 로 반올림하지 않았는지, 분모가 네 구간의 **합**인지 확인하세요.",
         hint_en="At long range small relative errors show up. Did you round the speed of light to 3e8? Is the denominator the **sum** of the four intervals?"),
    dict(name_ko="거리 0 (두 장치가 붙어 있음)", name_en="Zero distance (devices touching)", hidden=True, rtol=1e-9, atol=1e-6,
         run=lambda ns: ns["ds_twr_distance"](*_stamps(0.0, 350e-6, 600e-6, eA=-8e-6, eB=12e-6, offA=2.0e8, offB=6.0e8)),
         hint_ko="거리가 0 이면 결과도 0 에 가까워야 합니다. 응답 지연이 결과에 남아 있다면 분자의 $T_{reply1} T_{reply2}$ 를 빼지 않은 것입니다.",
         hint_en="At zero distance the result must be close to 0. If the reply delays leak into the result, you did not subtract $T_{reply1} T_{reply2}$ in the numerator."),
    dict(name_ko="정수 틱 타임스탬프 40회", name_en="Integer tick timestamps, 40 exchanges", hidden=True, rtol=1e-9, atol=1e-6,
         run=_batch,
         hint_ko="실제 칩은 타임스탬프를 정수로 줍니다. 정수 나눗셈(//)을 쓰면 비행시간의 소수 부분이 사라집니다. 보통 나눗셈(/)을 쓰세요.",
         hint_en="A real chip reports integer timestamps. Integer division (//) throws away the fractional part of the time of flight; use true division (/)."),
]
`,
};

export const tasks = [dsTwrTask];
