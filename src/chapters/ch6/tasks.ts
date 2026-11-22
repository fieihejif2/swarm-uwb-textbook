import type { CodingTask } from '../../py/grader';

export const tdoaUpdateTask: CodingTask = {
  id: 'ch6-tdoa-update',
  chapter: 6,
  title: { ko: 'TDoA 측정 하나로 칼만 갱신 1스텝', en: 'One Kalman update step with a TDoA measurement' },
  prompt: {
    ko: '함수 **`tdoa_update(x, P, a_i, a_j, z, sigma)`** 를 완성하세요. TDoA 측정 **하나**로 상태와 공분산을 한 번 갱신하고 **`(x_new, P_new)`** 를 돌려줍니다.\n\n입력: `x` 는 길이 6 인 상태 `[px, py, pz, vx, vy, vz]` (위치 [m], 속도 [m/s], 강당 좌표계, z 가 위쪽). `P` 는 6×6 공분산 행렬(대칭). `a_i`, `a_j` 는 두 앵커의 좌표(길이 3, [m]). `z` 는 측정된 거리차 [m] 로, 부호 규약은 **$z \\approx d_j - d_i$** ($d_i$ = 위치에서 앵커 i 까지의 거리)입니다. `sigma` 는 측정 노이즈의 표준편차 [m] 입니다. 입력은 리스트로 들어올 수도 있습니다.\n\n순서: ① 예측 측정값 $h = d_j - d_i$ ② 야코비안 $H$ (길이 6. 앞의 3칸은 $(p-a_j)/d_j - (p-a_i)/d_i$, 속도 3칸은 0) ③ 혁신 분산 $S = H P H^\\mathsf{T} + \\sigma^2$ ④ 이득 $K = P H^\\mathsf{T} / S$ ⑤ $x_{\\text{new}} = x + K\\,(z - h)$, $P_{\\text{new}} = (I - K H)\\,P$.\n\n반환: `x_new` 는 길이 6 인 배열, `P_new` 는 6×6 배열. 입력 배열을 고쳐 쓰지 말고 새 배열을 돌려주세요.',
    en: 'Complete **`tdoa_update(x, P, a_i, a_j, z, sigma)`**. It updates the state and covariance once with **one** TDoA measurement and returns **`(x_new, P_new)`**.\n\nInputs: `x` is the length-6 state `[px, py, pz, vx, vy, vz]` (position [m], velocity [m/s], hall frame, z up). `P` is the 6×6 covariance (symmetric). `a_i`, `a_j` are the two anchor positions (length 3, [m]). `z` is the measured range difference [m] with the sign convention **$z \\approx d_j - d_i$** ($d_i$ = distance from the position to anchor i). `sigma` is the measurement-noise standard deviation [m]. Inputs may be plain lists.\n\nSteps: ① predicted measurement $h = d_j - d_i$ ② Jacobian $H$ (length 6: the first three entries are $(p-a_j)/d_j - (p-a_i)/d_i$, the three velocity entries are 0) ③ innovation variance $S = H P H^\\mathsf{T} + \\sigma^2$ ④ gain $K = P H^\\mathsf{T} / S$ ⑤ $x_{\\text{new}} = x + K\\,(z - h)$, $P_{\\text{new}} = (I - K H)\\,P$.\n\nReturn: `x_new` as a length-6 array and `P_new` as a 6×6 array. Do not modify the inputs in place; return new arrays.',
  },
  starter: `import numpy as np

def tdoa_update(x, P, a_i, a_j, z, sigma):
    x = np.asarray(x, dtype=float)
    P = np.asarray(P, dtype=float)
    a_i = np.asarray(a_i, dtype=float)
    a_j = np.asarray(a_j, dtype=float)
    p = x[:3]                    # 위치 [m] (상태의 앞 3칸)
    # 1) 두 앵커까지의 거리 d_i, d_j 와 예측 측정값 h = d_j - d_i
    # 2) 야코비안 H (길이 6): 위치 칸만 채우고 속도 칸은 0
    # 3) 혁신 분산 S = H P H^T + sigma^2   (스칼라)
    # 4) 칼만 이득 K = P H^T / S           (길이 6)
    # 5) x_new = x + K (z - h),  P_new = (I - K H) P
    x_new = x.copy()
    P_new = P.copy()
    return x_new, P_new
`,
  solution: `import numpy as np

def tdoa_update(x, P, a_i, a_j, z, sigma):
    x = np.asarray(x, dtype=float)
    P = np.asarray(P, dtype=float)
    a_i = np.asarray(a_i, dtype=float)
    a_j = np.asarray(a_j, dtype=float)
    p = x[:3]                                   # 위치 [m] (상태의 앞 3칸)
    d_i = np.linalg.norm(p - a_i)               # 앵커 i 까지의 거리 [m]
    d_j = np.linalg.norm(p - a_j)               # 앵커 j 까지의 거리 [m]
    h = d_j - d_i                               # 예측 측정값 h(x) [m]
    H = np.zeros(len(x))                        # 야코비안 (길이 6)
    H[:3] = (p - a_j) / d_j - (p - a_i) / d_i   # 위치 칸만. 속도 칸은 0
    S = H @ P @ H + sigma**2                    # 혁신의 분산 [m^2] (스칼라)
    K = P @ H / S                               # 칼만 이득 (길이 6)
    x_new = x + K * (z - h)                     # 상태 갱신
    P_new = P - np.outer(K, H @ P)              # 공분산 갱신 (I - K H) P
    return x_new, P_new
`,
  links: { di: [9], dj: [10], h: [11], H: [12, 13], S: [14], K: [15], innov: [16], P: [17] },
  tests: `
_A0 = np.array([0.0, 0.0, 0.5])
_A1 = np.array([20.0, 0.0, 7.0])
_A2 = np.array([20.0, 15.0, 0.5])
_r = np.random.default_rng(20261122)
def _cov(scale):
    M = _r.normal(size=(6, 6))
    return scale * (M @ M.T / 6.0 + 0.2 * np.eye(6))
_P_diag = np.diag([0.04, 0.04, 0.09, 0.01, 0.01, 0.01])
_P_full = _cov(0.05)
_P_full2 = _cov(0.2)
_x1 = np.array([6.0, 4.0, 1.5, 0.0, 0.0, 0.0])
_x3 = np.array([12.0, 9.0, 2.0, 0.4, -0.3, 0.1])
_x5 = np.array([18.5, 1.0, 5.5, -0.2, 0.6, 0.0])
def _true(x, ai, aj):
    return float(np.linalg.norm(x[:3] - aj) - np.linalg.norm(x[:3] - ai))
def _run(ns, x, P, ai, aj, z, s):
    out = ns["tdoa_update"](x, P, ai, aj, z, s)
    return (np.asarray(out[0], dtype=float), np.asarray(out[1], dtype=float))

TESTS = [
    dict(name_ko="기본: 대각 공분산, sigma = 0.15 m", name_en="Basic: diagonal covariance, sigma = 0.15 m",
         run=lambda ns: _run(ns, _x1, _P_diag, _A0, _A1, _true(_x1, _A0, _A1) + 0.20, 0.15),
         hint_ko="야코비안의 위치 칸은 두 단위벡터의 차 $(p-a_j)/d_j - (p-a_i)/d_i$ 입니다. **거리로 나누는 것**을 빠뜨리지 않았는지, 이득을 $S$ 로 나눴는지 확인하세요.",
         hint_en="The position entries of the Jacobian are the difference of two unit vectors, $(p-a_j)/d_j - (p-a_i)/d_i$. Did you **divide by the distances**, and divide the gain by $S$?"),
    dict(name_ko="두 앵커에서 같은 거리 (h = 0)", name_en="Equidistant from both anchors (h = 0)",
         run=lambda ns: _run(ns, np.array([5.0, 3.0, 1.5, 0.0, 0.0, 0.0]), _P_diag, np.array([0.0, 0.0, 2.0]), np.array([10.0, 0.0, 2.0]), 0.30, 0.15),
         hint_ko="여기서는 $h = 0$ 이라 혁신이 $z$ 그대로입니다. 그래도 답이 다르면 **부호**를 보세요: $h = d_j - d_i$ 이고, $H$ 도 j 쪽이 +, i 쪽이 − 입니다. 측정이 양수면 추정은 앵커 j 에서 **멀어지는** 쪽으로 움직여야 합니다.",
         hint_en="Here $h = 0$, so the innovation is just $z$. If the answer still differs, check the **signs**: $h = d_j - d_i$, and in $H$ the j term is + and the i term is −. A positive measurement must push the estimate **away from** anchor j."),
    dict(name_ko="위치와 속도가 상관된 공분산", name_en="Covariance with position-velocity correlation",
         run=lambda ns: _run(ns, _x3, _P_full, _A1, _A2, _true(_x3, _A1, _A2) - 0.12, 0.15),
         hint_ko="측정은 위치만 보지만 $P$ 에 위치-속도 상관이 있으면 $K = P H^T / S$ 를 통해 **속도도 함께** 고쳐집니다. $H$ 는 길이 6 이고 속도 칸(뒤의 3칸)은 0 이어야 합니다. 위치 칸과 속도 칸을 바꿔 넣지 않았나요?",
         hint_en="The measurement sees only position, but with position-velocity correlation in $P$ the gain $K = P H^T / S$ corrects the **velocity too**. $H$ has length 6 with zeros in the velocity entries (the last three). Did you fill the wrong slots?"),
    dict(name_ko="측정 노이즈가 큰 경우 (sigma = 0.6 m)", name_en="Large measurement noise (sigma = 0.6 m)",
         run=lambda ns: _run(ns, _x1, _P_diag, _A2, _A0, _true(_x1, _A2, _A0) + 0.5, 0.6),
         hint_ko="$S$ 에 더하는 것은 표준편차가 아니라 **분산** $\\\\sigma^2$ 입니다. 노이즈가 크면 이득이 작아져 추정이 조금만 움직여야 합니다.",
         hint_en="What is added in $S$ is the **variance** $\\\\sigma^2$, not the standard deviation. With large noise the gain shrinks and the estimate should move only a little."),
    dict(name_ko="앵커 가까이, 치우친 기하", name_en="Close to an anchor, lopsided geometry", hidden=True,
         run=lambda ns: _run(ns, _x5, _P_full2, _A1, _A0, _true(_x5, _A1, _A0) + 0.35, 0.15),
         hint_ko="두 거리가 크게 다를 때는 단위벡터를 각각 **자기 거리**로 나눠야 합니다($d_j$ 와 $d_i$ 를 바꿔 쓰지 않았나요?). 공분산은 $P_{\\\\text{new}} = (I - K H) P$ 입니다.",
         hint_en="When the two distances differ a lot, each unit vector must be divided by **its own** distance (did you mix up $d_j$ and $d_i$?). The covariance is $P_{\\\\text{new}} = (I - K H) P$."),
    dict(name_ko="입력이 리스트일 때", name_en="Inputs given as lists", hidden=True,
         run=lambda ns: _run(ns, _x3.tolist(), _P_full.tolist(), _A0.tolist(), _A2.tolist(), 1.1, 0.25),
         hint_ko="입력이 리스트일 수 있습니다. 계산 전에 np.asarray 로 배열로 바꾸세요.",
         hint_en="Inputs may be plain lists. Convert them with np.asarray before computing."),
]
`,
};

export const tasks = [tdoaUpdateTask];
