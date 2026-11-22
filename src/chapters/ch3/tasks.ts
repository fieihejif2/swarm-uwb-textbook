import type { CodingTask } from '../../py/grader';

export const updateRateTask: CodingTask = {
  id: 'ch3-update-rate',
  chapter: 3,
  title: { ko: '모드별 드론당 갱신율 계산하기', en: 'Per-drone update rate by mode' },
  prompt: {
    ko: '이 장의 메시지 수 모델을 함수로 옮기세요. **`update_rate(mode, n_tags, n_anchors, t_range, t_slot)`** 는 **`(meas_rate, pos_rate)`** 두 값을 돌려줍니다.\n\n**입력** — `mode`: 문자열 `"twr"` 또는 `"tdoa"`. 대소문자와 앞뒤 공백은 무시합니다(`"TWR"`, `" TDoA "` 도 받아야 합니다). `n_tags`: 같은 채널을 쓰는 태그(드론) 수, 1 이상의 정수. `n_anchors`: 앵커 수, 1 이상의 정수. `t_range`: TWR 에서 태그 하나와 앵커 하나가 거리를 한 번 재는 데 걸리는 시간 [s]. `t_slot`: TDoA 에서 앵커 한 대의 송신 슬롯 길이 [s].\n\n**반환** — `meas_rate`: 태그 **한 대**가 1초에 얻는 측정 개수 [1/s] (TWR 은 거리, TDoA 는 들은 앵커 패킷). `pos_rate`: 태그 **한 대**의 위치 갱신율 [Hz]. 이 모델에서는 **모든 앵커를 한 번씩 거쳐야** 위치 갱신 1회로 칩니다. 둘 다 "주기(초)"가 아니라 "1초당 횟수"입니다.\n\n**규칙** — TWR: 채널을 태그 `n_tags` 대가 차례로 쓰고, 한 번에 한 쌍만 거리를 잴 수 있습니다. `t_slot` 은 쓰지 않습니다. TDoA: 앵커만 송신하고 모든 태그가 모든 패킷을 듣습니다. `t_range` 는 쓰지 않습니다. 그 밖의 `mode` 가 들어오면 **`ValueError` 를 발생**시키세요(조용히 한쪽 모드로 계산하면 안 됩니다).',
    en: 'Turn the message-count model of this chapter into a function. **`update_rate(mode, n_tags, n_anchors, t_range, t_slot)`** returns the pair **`(meas_rate, pos_rate)`**.\n\n**Inputs** — `mode`: the string `"twr"` or `"tdoa"`. Ignore case and surrounding spaces (`"TWR"` and `" TDoA "` must work). `n_tags`: number of tags (drones) sharing the channel, an integer ≥ 1. `n_anchors`: number of anchors, an integer ≥ 1. `t_range`: time one tag and one anchor need for a single range in TWR [s]. `t_slot`: length of one anchor transmit slot in TDoA [s].\n\n**Returns** — `meas_rate`: measurements **one** tag obtains per second [1/s] (ranges for TWR, anchor packets heard for TDoA). `pos_rate`: position update rate of **one** tag [Hz]. In this model a position update needs **one pass over all anchors**. Both are counts per second, not periods in seconds.\n\n**Rules** — TWR: the `n_tags` tags take turns on the channel and only one pair can range at a time; `t_slot` is not used. TDoA: only anchors transmit and every tag hears every packet; `t_range` is not used. For any other `mode`, **raise `ValueError`** (do not silently compute one of the modes).',
  },
  starter: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    # 0) mode 를 소문자로 바꾸고 앞뒤 공백을 떼어 낸다
    # 1) TWR : 채널을 n_tags 대가 번갈아 쓴다 → 태그 한 대의 거리 측정률
    #          앵커를 한 바퀴 돌아야 위치 1번
    # 2) TDoA: 앵커 패킷을 모든 태그가 듣는다 → 태그 한 대가 듣는 패킷 수
    #          모든 앵커가 한 번씩 보내야 위치 1번
    # 3) 그 밖의 mode 는 ValueError
    meas_rate = 0.0
    pos_rate = 0.0
    return meas_rate, pos_rate
`,
  solution: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()          # "TWR", " TDoA " 도 받는다
    if mode == "twr":
        meas_rate = 1.0 / (n_tags * t_range)  # 채널을 n_tags 대가 번갈아 쓴다
        pos_rate = meas_rate / n_anchors      # 앵커를 한 바퀴 돌아야 위치 1번
    elif mode == "tdoa":
        meas_rate = 1.0 / t_slot              # 앵커 패킷을 모든 태그가 듣는다 (n_tags 가 없다)
        pos_rate = meas_rate / n_anchors      # 모든 앵커가 한 번씩 보내야 위치 1번
    else:
        raise ValueError("mode must be 'twr' or 'tdoa'")
    return meas_rate, pos_rate
`,
  links: { share: [4], twr: [5], listen: [7], tdoa: [8] },
  tests: `
def _raises(f, *args):
    try:
        f(*args)
    except ValueError:
        return True
    except Exception:
        return False
    return False

TESTS = [
    dict(name_ko="TWR, 태그 1대, 앵커 8개, 2 ms", name_en="TWR, 1 tag, 8 anchors, 2 ms",
         run=lambda ns: ns["update_rate"]("twr", 1, 8, 0.002, 0.002),
         hint_ko="태그가 1대이면 1초에 거리 $1/T_{range}$ 개를 재고, 앵커 8개를 한 바퀴 돌아야 위치 1번입니다. '주기(초)'가 아니라 '1초당 횟수'를 돌려주는지, 값 두 개를 (측정률, 위치 갱신율) 순서로 돌려주는지 확인하세요.",
         hint_en="One tag makes $1/T_{range}$ ranges per second and needs one pass over the 8 anchors per position. Return counts per second (not periods), as the pair (measurement rate, position rate)."),
    dict(name_ko="TWR, 태그 5대, 앵커 8개, 2 ms", name_en="TWR, 5 tags, 8 anchors, 2 ms",
         run=lambda ns: ns["update_rate"]("twr", 5, 8, 0.002, 0.002),
         hint_ko="TWR 에서는 채널을 태그 수만큼 **나눠** 씁니다. 태그 한 대의 몫은 $1/(N_{tag} T_{range})$ 입니다. $N_{tag}$ 로 나누는 것을 빠뜨리지 않았나요?",
         hint_en="In TWR the channel is **shared** among the tags; one tag gets $1/(N_{tag} T_{range})$. Did you forget to divide by $N_{tag}$?"),
    dict(name_ko="TDoA, 태그 5대, 앵커 8개, 슬롯 2 ms", name_en="TDoA, 5 tags, 8 anchors, 2 ms slots",
         run=lambda ns: ns["update_rate"]("tdoa", 5, 8, 0.002, 0.002),
         hint_ko="TDoA 에서 태그는 듣기만 합니다. 태그가 몇 대든 모든 태그가 같은 패킷을 듣기 때문에 식에 $N_{tag}$ 가 **없어야** 합니다.",
         hint_en="In TDoA tags only listen. Every tag hears the same packets however many there are, so $N_{tag}$ must **not** appear."),
    dict(name_ko="TWR, t_range 와 t_slot 이 다를 때", name_en="TWR with t_range different from t_slot",
         run=lambda ns: ns["update_rate"]("twr", 2, 8, 0.004, 0.001),
         hint_ko="TWR 은 \`t_range\` 만 씁니다. \`t_slot\` 을 쓰지 않았는지 확인하세요.",
         hint_en="TWR uses only \`t_range\`. Check you did not use \`t_slot\`."),
    dict(name_ko="TDoA, 앵커 4개, 슬롯 3 ms", name_en="TDoA, 4 anchors, 3 ms slots",
         run=lambda ns: ns["update_rate"]("tdoa", 5, 4, 0.002, 0.003),
         hint_ko="TDoA 는 \`t_slot\` 만 씁니다. 그리고 위치 갱신율은 측정률을 **앵커 수로 나눈** 값입니다(모든 앵커가 한 번씩 송신해야 한 프레임).",
         hint_en="TDoA uses only \`t_slot\`, and the position rate is the measurement rate **divided by the number of anchors** (one frame = every anchor transmits once)."),
    dict(name_ko="TWR, 태그 3대, 앵커 6개, 2.5 ms", name_en="TWR, 3 tags, 6 anchors, 2.5 ms", hidden=True,
         run=lambda ns: ns["update_rate"]("twr", 3, 6, 0.0025, 0.002),
         hint_ko="위치 1번에는 앵커 **전부**와의 거리가 필요합니다. 위치 갱신율 = 태그 한 대의 거리 측정률 ÷ 앵커 수.",
         hint_en="One position needs a range to **every** anchor: position rate = per-tag ranging rate ÷ number of anchors."),
    dict(name_ko="TDoA, 태그 50대", name_en="TDoA, 50 tags", hidden=True,
         run=lambda ns: ns["update_rate"]("tdoa", 50, 8, 0.002, 0.002),
         hint_ko="태그 50대에서도 TDoA 의 결과는 태그 1대일 때와 같아야 합니다.",
         hint_en="With 50 tags the TDoA result must equal the single-tag result."),
    dict(name_ko="TWR, 태그 20대, 앵커 4개", name_en="TWR, 20 tags, 4 anchors", hidden=True,
         run=lambda ns: ns["update_rate"]("twr", 20, 4, 0.002, 0.002),
         hint_ko="태그 수와 앵커 수가 **둘 다** 분모에 들어가는지 확인하세요: $1/(N_{tag} N_{anc} T_{range})$.",
         hint_en="Both the number of tags and the number of anchors belong in the denominator: $1/(N_{tag} N_{anc} T_{range})$."),
    dict(name_ko="대소문자·공백이 섞인 mode", name_en="Mode with mixed case and spaces", hidden=True,
         run=lambda ns: (ns["update_rate"]("TWR", 5, 8, 0.002, 0.002), ns["update_rate"](" TDoA ", 5, 8, 0.002, 0.002)),
         hint_ko="\`mode\` 를 비교하기 전에 \`mode.strip().lower()\` 로 정리하세요.",
         hint_en="Normalise with \`mode.strip().lower()\` before comparing."),
    dict(name_ko="모르는 mode 는 ValueError", name_en="Unknown mode raises ValueError",
         run=lambda ns: _raises(ns["update_rate"], "gps", 5, 8, 0.002, 0.002),
         hint_ko="\`twr\`, \`tdoa\` 가 아닌 값이 들어오면 \`raise ValueError(...)\` 를 해야 합니다. \`else:\` 에서 조용히 TDoA 로 계산하면 설정 파일의 오타를 영영 못 찾습니다.",
         hint_en="For anything other than \`twr\` or \`tdoa\`, \`raise ValueError(...)\`. Silently falling back to TDoA in an \`else:\` hides typos in a config file forever."),
]
`,
};

export const tasks = [updateRateTask];
