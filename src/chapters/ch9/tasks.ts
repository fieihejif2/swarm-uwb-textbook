import type { CodingTask } from '../../py/grader';

export const fitLogTask: CodingTask = {
  id: 'ch9-fit-log',
  chapter: 9,
  title: { ko: '로그에서 지연과 σ 추정하기', en: 'Estimate delay and σ from a log' },
  prompt: {
    ko: '두 함수를 완성하세요. numpy 만 씁니다.\n\n**`fit_log(t_send, t_recv, seq)`** — 왕복 핑 로그에서 편도 지연과 손실률을 구합니다. 세 인자는 길이가 같은 1차원 배열(리스트일 수도 있음)이고 **돌아온 핑만** 들어 있습니다. `t_send[i]` 는 순번 `seq[i]` 인 핑을 보낸 시각, `t_recv[i]` 는 그 메아리가 돌아온 시각이며 둘 다 **같은 PC 시계로 잰 초 [s]** 입니다. `seq` 는 오름차순 정수이고 중복은 없습니다(0 에서 시작하지 않을 수 있습니다). 아래 세 키를 가진 **dict** 를 돌려주세요.\n\n· `"delay_mean"` — 편도 지연의 평균 [s]. 편도 지연은 왕복 시간 `t_recv − t_send` 의 **절반**입니다(오가는 길이 같다는 대칭 가정).\n\n· `"delay_p95"` — 편도 지연의 95 % 분위수 [s]. `np.percentile(값, 95)` 의 기본 방식(선형 보간)을 씁니다.\n\n· `"loss_rate"` — 손실률(0~1) = 빠진 개수 ÷ **보낸** 개수. 보낸 개수는 `마지막 순번 − 첫 순번 + 1` 로 셉니다(첫 핑과 마지막 핑은 돌아왔다고 봅니다).\n\n**`fit_sigma(t, x)`** — 정지 로그의 한 축에서 노이즈 σ 를 구합니다. `t` [s] 와 `x` [m] 는 길이가 같은 1차원 배열입니다. 최소제곱 직선 $x \\approx a + b\\,t$ 를 빼고 남은 잔차의 **표본 표준편차(`ddof=1`, 즉 $n-1$ 로 나눔)** 를 σ 로 하여 튜플 **`(sigma, drift)`** 를 돌려주세요. `sigma` 의 단위는 [m], `drift` 는 직선의 기울기 $b$ [m/s] 입니다. `np.polyfit(t, x, 1)` 은 `[b, a]` 순서로 돌려줍니다.',
    en: 'Complete two functions. numpy only.\n\n**`fit_log(t_send, t_recv, seq)`** — one-way delay and loss rate from a round-trip ping log. The three arguments are 1-D arrays of equal length (possibly plain lists) holding **only the pings that came back**. `t_send[i]` is when the ping numbered `seq[i]` was sent and `t_recv[i]` when its echo returned, both in **seconds [s] on the same PC clock**. `seq` is ascending integers without duplicates (it may not start at 0). Return a **dict** with these three keys.\n\n· `"delay_mean"` — mean one-way delay [s]. The one-way delay is **half** the round-trip time `t_recv − t_send` (symmetry assumption: both directions take equally long).\n\n· `"delay_p95"` — 95th percentile of the one-way delay [s], using the default method of `np.percentile(values, 95)` (linear interpolation).\n\n· `"loss_rate"` — loss rate (0–1) = number missing ÷ number **sent**. Count the number sent as `last seq − first seq + 1` (the first and the last ping are assumed to have returned).\n\n**`fit_sigma(t, x)`** — noise σ of one axis of a static log. `t` [s] and `x` [m] are 1-D arrays of equal length. Subtract the least-squares line $x \\approx a + b\\,t$ and take the **sample standard deviation (`ddof=1`, i.e. divide by $n-1$)** of the residual as σ. Return the tuple **`(sigma, drift)`**: `sigma` in [m] and `drift`, the slope $b$ of the line, in [m/s]. `np.polyfit(t, x, 1)` returns `[b, a]` in that order.',
  },
  starter: `import numpy as np

def fit_log(t_send, t_recv, seq):
    t_send = np.asarray(t_send, dtype=float)
    t_recv = np.asarray(t_recv, dtype=float)
    seq = np.asarray(seq)
    # 1) 왕복 시간 → 편도 지연 (대칭 가정)
    # 2) 평균과 95 % 분위수
    # 3) 보낸 개수(첫 순번 ~ 마지막 순번)와 빠진 개수 → 손실률
    return {"delay_mean": 0.0, "delay_p95": 0.0, "loss_rate": 0.0}

def fit_sigma(t, x):
    t = np.asarray(t, dtype=float)
    x = np.asarray(x, dtype=float)
    # 1) 직선 x = a + b t 를 맞춘다 (np.polyfit)
    # 2) 직선을 뺀 잔차의 표본 표준편차 (ddof=1)
    sigma = 0.0
    drift = 0.0
    return sigma, drift
`,
  solution: `import numpy as np

def fit_log(t_send, t_recv, seq):
    t_send = np.asarray(t_send, dtype=float)
    t_recv = np.asarray(t_recv, dtype=float)
    seq = np.asarray(seq)
    rtt = t_recv - t_send                  # 왕복 시간: 두 시각 모두 같은 PC 시계
    one_way = rtt / 2                      # 대칭 가정: 편도 = 왕복의 절반
    sent = seq.max() - seq.min() + 1       # 보낸 개수: 첫 순번 ~ 마지막 순번
    lost = sent - len(np.unique(seq))      # 돌아오지 않은 개수
    return {
        "delay_mean": float(np.mean(one_way)),
        "delay_p95": float(np.percentile(one_way, 95)),
        "loss_rate": float(lost / sent),   # 빠진 개수 / 보낸 개수
    }

def fit_sigma(t, x):
    t = np.asarray(t, dtype=float)
    x = np.asarray(x, dtype=float)
    tt = t - t[0]                          # 첫 시각 기준 (큰 시각값에서도 안전)
    b, a = np.polyfit(tt, x, 1)            # 느린 드리프트: x = a + b t
    resid = x - (a + b * tt)               # 추세를 뺀 잔차
    sigma = np.std(resid, ddof=1)          # 표본 표준편차 (n-1 로 나눔)
    return float(sigma), float(b)
`,
  links: { rtt: [7], half: [8], sent: [9], lost: [10, 14], mean: [12], p95: [13], trend: [21, 22], sigma: [23] },
  tests: `
def _lat(n, mean, jit, p_loss, first, seed):
    r = np.random.default_rng(seed)
    seq = np.arange(first, first + n)
    keep = r.random(n) >= p_loss
    keep[0] = True
    keep[-1] = True
    ts = (seq - first) * 0.05 + 12.0
    rtt = 2 * mean + r.uniform(-jit, jit, n) + r.uniform(-jit, jit, n)
    return ts[keep], (ts + rtt)[keep], seq[keep]

def _stat(n, sigma, drift, t0, rate, seed):
    r = np.random.default_rng(seed)
    t = t0 + np.arange(n) / rate
    return t, 1.5 + drift * (t - t0) + r.normal(0, sigma, n)

_A = (np.arange(10) * 0.1, np.arange(10) * 0.1 + 0.040, np.arange(10))
_B = _lat(400, 0.020, 0.005, 0.0, 0, 3)
_C = _lat(600, 0.035, 0.010, 0.15, 0, 4)
_D = _lat(500, 0.012, 0.004, 0.30, 1000, 5)
_S1 = _stat(600, 0.03, 0.0, 0.0, 10, 6)
_S2 = _stat(600, 0.03, 0.002, 0.0, 10, 7)
_S3 = _stat(12, 0.05, 0.01, 0.0, 10, 8)
_S4 = _stat(900, 0.02, -0.0015, 250.0, 15, 9)

TESTS = [
    dict(name_ko="왕복이 항상 40 ms, 손실 없음", name_en="Round trip always 40 ms, no loss", atol=1e-12,
         run=lambda ns: ns["fit_log"](*_A),
         hint_ko="왕복 40 ms 이면 편도는 20 ms = 0.020 s 입니다. 왕복 시간을 2 로 나눴나요? 단위는 초입니다.",
         hint_en="A 40 ms round trip means 20 ms = 0.020 s one way. Did you divide the round trip by 2? Units are seconds."),
    dict(name_ko="지터가 있는 왕복, 손실 없음", name_en="Round trip with jitter, no loss",
         run=lambda ns: ns["fit_log"](*_B),
         hint_ko="95 % 분위수는 편도 지연에 np.percentile(값, 95) 를 그대로 쓴 값입니다(선형 보간). 정렬해서 정수 번째 값을 고르거나 최댓값을 쓰면 조금 달라집니다. 왕복이 아니라 편도인지도 확인하세요.",
         hint_en="The 95th percentile is np.percentile(values, 95) of the one-way delay (linear interpolation). Picking an integer index after sorting, or the maximum, gives a slightly different value. Also check you used the one-way delay, not the round trip."),
    dict(name_ko="15 % 쯤 빠진 로그", name_en="Log with about 15 % missing",
         run=lambda ns: ns["fit_log"](*_C),
         hint_ko="손실률의 분모는 **보낸** 개수(마지막 순번 − 첫 순번 + 1)입니다. 받은 개수로 나누면 손실률이 실제보다 크게 나옵니다.",
         hint_en="The denominator of the loss rate is the number **sent** (last seq − first seq + 1). Dividing by the number received overestimates the loss."),
    dict(name_ko="순번이 1000 에서 시작하는 로그", name_en="Log whose sequence numbers start at 1000", hidden=True,
         run=lambda ns: ns["fit_log"](*_D),
         hint_ko="순번이 0 에서 시작한다고 가정하지 않았나요? 보낸 개수는 max(seq) + 1 이 아니라 max(seq) − min(seq) + 1 입니다.",
         hint_en="Did you assume the numbering starts at 0? The number sent is max(seq) − min(seq) + 1, not max(seq) + 1."),
    dict(name_ko="드리프트가 없는 정지 로그", name_en="Static log without drift",
         run=lambda ns: ns["fit_sigma"](*_S1),
         hint_ko="σ 는 최소제곱 직선을 뺀 **잔차**의 표본 표준편차 np.std(잔차, ddof=1) 입니다. 드리프트가 없어 보여도 직선을 빼야 하고, ddof=1 을 빠뜨리면 값이 조금 작게 나옵니다. 반환은 (sigma, drift) 순서의 튜플입니다.",
         hint_en="σ is the sample standard deviation np.std(residual, ddof=1) of the **residual** after subtracting the least-squares line. Subtract the line even when there seems to be no drift; without ddof=1 the value comes out slightly small. Return the tuple (sigma, drift) in that order."),
    dict(name_ko="느린 드리프트가 있는 정지 로그", name_en="Static log with a slow drift",
         run=lambda ns: ns["fit_sigma"](*_S2),
         hint_ko="60 초 동안 12 cm 쯤 흘러간 로그입니다. 직선을 빼지 않고 np.std(x) 를 쓰면 드리프트가 노이즈로 둔갑해 σ 가 두 배 가까이 커집니다.",
         hint_en="This log drifts by about 12 cm over 60 s. Using np.std(x) without subtracting the line turns drift into noise and nearly doubles σ."),
    dict(name_ko="표본이 12개뿐인 로그", name_en="Log with only 12 samples",
         run=lambda ns: ns["fit_sigma"](*_S3),
         hint_ko="표본이 적으면 n 으로 나누는 것과 n−1 로 나누는 것의 차이가 큽니다. np.std 의 기본값은 ddof=0 이므로 ddof=1 을 직접 줘야 합니다.",
         hint_en="With few samples dividing by n or by n−1 differs noticeably. np.std defaults to ddof=0, so pass ddof=1 explicitly."),
    dict(name_ko="시각이 250 s 에서 시작하고 반대 방향으로 흐르는 로그", name_en="Log starting at t = 250 s with drift in the other direction", hidden=True,
         run=lambda ns: ns["fit_sigma"](*_S4),
         hint_ko="직선은 x 를 **t 에 대해** 맞춰야 합니다(표본 번호가 아닙니다). 기울기의 단위는 m/s 이고 부호를 유지해야 합니다.",
         hint_en="Fit the line of x **against t** (not against the sample index). The slope is in m/s and keeps its sign."),
]
`,
};

export const tasks = [fitLogTask];
