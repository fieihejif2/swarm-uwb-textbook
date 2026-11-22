import type { CodingTask } from '../../py/grader';

export const gatedUpdateTask: CodingTask = {
  id: 'ch4-gated-update',
  chapter: 4,
  title: { ko: '게이팅이 들어간 측정 갱신', en: 'A measurement update with gating' },
  prompt: {
    ko: '스칼라 측정 하나로 필터를 갱신하되, 마할라노비스 게이트를 통과한 측정만 받아들이는 함수 **`gated_update(x, P, z, h, H, R, k)`** 를 완성하세요.\n\n'
      + '**입력** — `x`: 상태 추정값, 길이 n 인 1차원 배열(위치는 m, 속도는 m/s). `P`: 그 공분산, n×n 대칭행렬. `z`: 측정값(스칼라, m). `h`: 지금 추정값으로 예측한 측정값 $h(\\hat x)$ (스칼라, m. 이미 계산해서 줍니다). `H`: 측정 야코비안, 길이 n 인 1차원 배열. `R`: 측정 잡음 분산(스칼라, m²). `k`: 게이트 문턱(σ 단위). **`k = 0` 은 게이트를 끈다는 뜻이며 항상 갱신합니다.** `x`, `P`, `H` 는 리스트로 들어올 수도 있습니다.\n\n'
      + '**계산** — 혁신 $\\nu = z - h$, 혁신 분산 $S = H P H^{\\mathsf{T}} + R$ (스칼라). $\\nu^2/S > k^2$ 이면 **버립니다**. 정확히 $\\nu^2/S = k^2$ 이면 **통과**입니다. 통과하면 $K = P H^{\\mathsf{T}} / S$ (길이 n), $x^{+} = x + K\\nu$, $P^{+} = (I - K H)\\,P$.\n\n'
      + '**반환** — `(x_new, P_new, accepted)`. `x_new` 는 길이 n, `P_new` 는 n×n, `accepted` 는 `True`/`False`. 버린 경우 `x_new`, `P_new` 는 입력과 **같은 값**이어야 합니다. 입력 배열을 그 자리에서 고치지 말고(`x += …` 금지) 새 배열을 돌려주세요.',
    en: 'Complete **`gated_update(x, P, z, h, H, R, k)`**: update a filter with one scalar measurement, but only if the measurement passes a Mahalanobis gate.\n\n'
      + '**Inputs** — `x`: state estimate, 1-D array of length n (positions in m, velocities in m/s). `P`: its covariance, n×n symmetric. `z`: the measurement (scalar, m). `h`: the measurement predicted from the current estimate, $h(\\hat x)$ (scalar, m; already computed for you). `H`: measurement Jacobian, 1-D array of length n. `R`: measurement noise variance (scalar, m²). `k`: gate threshold in σ. **`k = 0` means the gate is off: always update.** `x`, `P`, `H` may be plain lists.\n\n'
      + '**Computation** — innovation $\\nu = z - h$, innovation variance $S = H P H^{\\mathsf{T}} + R$ (scalar). If $\\nu^2/S > k^2$, **reject**. Exactly $\\nu^2/S = k^2$ **passes**. If it passes: $K = P H^{\\mathsf{T}} / S$ (length n), $x^{+} = x + K\\nu$, $P^{+} = (I - K H)\\,P$.\n\n'
      + '**Return** — `(x_new, P_new, accepted)`. `x_new` has length n, `P_new` is n×n, `accepted` is `True`/`False`. When rejected, `x_new` and `P_new` must **equal the inputs**. Do not modify the input arrays in place (no `x += …`); return new arrays.',
  },
  starter: `import numpy as np

def gated_update(x, P, z, h, H, R, k):
    x = np.asarray(x, dtype=float)
    P = np.asarray(P, dtype=float)
    H = np.asarray(H, dtype=float)
    # 1) 혁신 nu = z - h
    # 2) 혁신 분산 S = H P H^T + R   (스칼라. H @ P @ H 를 쓰면 됩니다)
    # 3) 게이트: k > 0 이고 nu^2 / S > k^2 이면 버린다 → (x.copy(), P.copy(), False)
    # 4) 통과하면 K = P H^T / S,  x_new = x + K nu,  P_new = (I - K H) P
    x_new = x.copy()
    P_new = P.copy()
    accepted = True
    return x_new, P_new, accepted
`,
  solution: `import numpy as np

def gated_update(x, P, z, h, H, R, k):
    x = np.asarray(x, dtype=float)
    P = np.asarray(P, dtype=float)
    H = np.asarray(H, dtype=float)
    nu = z - h                          # 혁신: 측정 - 예측한 측정
    S = H @ P @ H + R                   # 혁신 분산 S = H P H^T + R (스칼라)
    if k > 0 and nu * nu / S > k * k:   # 게이트: nu^2/S > k^2 이면 버린다 (k = 0 은 끔)
        return x.copy(), P.copy(), False
    K = P @ H / S                       # 칼만 이득 (길이 n)
    x_new = x + K * nu                  # 상태 갱신
    P_new = P - np.outer(K, H @ P)      # 공분산 갱신 (I - K H) P
    return x_new, P_new, True
`,
  links: { innov: [7], S: [8], gate: [9, 10], gain: [11], upd: [12, 13] },
  tests: `
_P4 = np.array([[0.09, 0.01, 0.02, 0.00],
                [0.01, 0.16, 0.00, 0.03],
                [0.02, 0.00, 0.25, 0.01],
                [0.00, 0.03, 0.01, 0.36]])
_x4 = np.array([2.0, 1.0, 0.5, -0.2])
_H4 = np.array([0.6, 0.8, 0.0, 0.0])

def _keep(ns):
    # 입력 배열을 그 자리에서 고치지 않는지 확인: 호출 뒤의 입력도 함께 돌려준다
    x0 = _x4.copy(); P0 = _P4.copy()
    out = ns["gated_update"](x0, P0, 3.2, 3.0, _H4.copy(), 0.0225, 3.0)
    return (out[0], out[1], out[2], x0, P0)

TESTS = [
    dict(name_ko="1차원 상태, 정상 측정 (통과)", name_en="1-D state, normal measurement (accepted)",
         run=lambda ns: ns["gated_update"]([1.0], [[0.04]], 1.2, 1.0, [1.0], 0.01, 3.0),
         hint_ko="통과한 측정은 $K = P H^{\\\\mathsf{T}}/S$, $x^+ = x + K\\\\nu$, $P^+ = (I - KH)P$ 로 갱신합니다. 공분산은 **줄어야** 합니다. 부호가 $P + KHP$ 로 되어 있지 않은지 보세요.",
         hint_en="An accepted measurement updates with $K = P H^{\\\\mathsf{T}}/S$, $x^+ = x + K\\\\nu$, $P^+ = (I - KH)P$. The covariance must **shrink**; check the sign is not $P + KHP$."),
    dict(name_ko="1차원 상태, 이상치 (버림)", name_en="1-D state, outlier (rejected)",
         run=lambda ns: ns["gated_update"]([1.0], [[0.04]], 2.0, 1.0, [1.0], 0.01, 3.0),
         hint_ko="$\\\\nu = 1$, $S = 0.05$ 이므로 $\\\\nu^2/S = 20 > 9$ 입니다. 버릴 때는 $x$ **와** $P$ 를 모두 그대로 두고 accepted=False 를 돌려주세요. 문턱은 $|\\\\nu|$ 가 아니라 $\\\\nu^2/S$ 와 $k^2$ 를 비교합니다.",
         hint_en="Here $\\\\nu = 1$, $S = 0.05$, so $\\\\nu^2/S = 20 > 9$. On rejection leave **both** $x$ and $P$ unchanged and return accepted=False. Compare $\\\\nu^2/S$ with $k^2$, not $|\\\\nu|$ with $k$."),
    dict(name_ko="k = 0: 게이트 끔 (같은 이상치도 받아들임)", name_en="k = 0: gate off (the same outlier is accepted)",
         run=lambda ns: ns["gated_update"]([1.0], [[0.04]], 2.0, 1.0, [1.0], 0.01, 0.0),
         hint_ko="$k = 0$ 은 '문턱이 0' 이 아니라 '게이트를 쓰지 않는다'는 약속입니다. 이때는 어떤 측정이든 갱신해야 합니다.",
         hint_en="$k = 0$ does not mean a zero threshold; it means the gate is not used. Every measurement must then update."),
    dict(name_ko="예측이 불확실할 때(P 가 큼)는 큰 혁신도 통과", name_en="With an uncertain prediction (large P) a large innovation still passes",
         run=lambda ns: ns["gated_update"]([0.0], [[1.0]], 0.5, 0.0, [1.0], 0.01, 3.0),
         hint_ko="혁신을 나누는 값은 $R$ 이 아니라 $S = H P H^{\\\\mathsf{T}} + R$ 입니다. 예측이 불확실하면($P$ 가 크면) 혁신이 큰 것이 정상이므로 통과시켜야 합니다.",
         hint_en="Normalise the innovation by $S = H P H^{\\\\mathsf{T}} + R$, not by $R$. When the prediction is uncertain (large $P$) a large innovation is normal and must pass."),
    dict(name_ko="상태 4개(위치 2 + 속도 2), 거리 측정 (통과)", name_en="Four states (2 positions + 2 velocities), a range measurement (accepted)",
         run=lambda ns: ns["gated_update"](_x4, _P4, 3.2, 3.0, _H4, 0.0225, 3.0),
         hint_ko="$K$ 는 길이 n 인 벡터 $P H^{\\\\mathsf{T}}/S$ 이고, $(I - KH)P = P - K\\\\,(HP)$ 는 n×n 행렬입니다(np.outer). 측정이 직접 닿지 않는 속도 성분도 $P$ 의 비대각 원소를 통해 함께 바뀝니다.",
         hint_en="$K$ is the length-n vector $P H^{\\\\mathsf{T}}/S$ and $(I - KH)P = P - K\\\\,(HP)$ is n×n (np.outer). Velocity states the measurement does not touch still change through the off-diagonal entries of $P$."),
    dict(name_ko="상태 4개, 이상치 (버림)", name_en="Four states, outlier (rejected)", hidden=True,
         run=lambda ns: ns["gated_update"](_x4, _P4, 4.5, 3.0, _H4, 0.0225, 3.0),
         hint_ko="버린 측정으로는 $x$ 도 $P$ 도 바꾸면 안 됩니다. $P$ 만 줄이면 필터가 '정보를 얻었다'고 착각합니다.",
         hint_en="A rejected measurement must change neither $x$ nor $P$. Shrinking $P$ alone makes the filter believe it gained information."),
    dict(name_ko="문턱에 정확히 걸린 측정 (통과)", name_en="A measurement exactly at the threshold (accepted)", hidden=True,
         run=lambda ns: ns["gated_update"]([1.0], [[3.0]], 5.0, 1.0, [1.0], 1.0, 2.0),
         hint_ko="$\\\\nu^2/S = k^2$ 인 경우는 통과입니다. 버리는 조건은 '크다(>)' 이지 '크거나 같다(≥)' 가 아닙니다.",
         hint_en="When $\\\\nu^2/S = k^2$ the measurement passes. The rejection condition is strictly greater-than, not greater-or-equal."),
    dict(name_ko="입력 배열을 고치지 않는다", name_en="Inputs are not modified in place", hidden=True,
         run=_keep,
         hint_ko="x += K * nu 처럼 그 자리에서 고치면 호출한 쪽의 배열까지 바뀝니다. x + K * nu 로 새 배열을 만드세요.",
         hint_en="In-place operations such as x += K * nu also change the caller's array. Build a new array with x + K * nu."),
]
`,
};

export const tasks = [gatedUpdateTask];
