import type { CodingTask } from '../../py/grader';

export const kfDelayedTask: CodingTask = {
  id: 'ch5-kf-delayed',
  chapter: 5,
  title: { ko: '늦게 도착한 측정을 처리하는 1차원 칼만 필터', en: 'A 1-D Kalman filter that handles late measurements' },
  prompt: {
    ko: '한 축 위를 움직이는 드론의 상태 $x = [p, v]$ (위치 [m], 속도 [m/s])를 추정합니다. 함수 세 개를 완성하세요. 스텝 $k$ 는 시각 $k\\cdot$`dt` [s] 입니다.\n\n'
      + '**`predict(x, P, dt, sigma_a)`** → `(x_pred, P_pred)`. 등속 모델로 한 스텝 예측합니다. $F = \\begin{bmatrix}1 & dt\\\\ 0 & 1\\end{bmatrix}$, $Q = \\sigma_a^2\\begin{bmatrix}dt^4/4 & dt^3/2\\\\ dt^3/2 & dt^2\\end{bmatrix}$ 이고 $x^- = Fx$, $P^- = FPF^{\\mathsf T} + Q$ 입니다. `sigma_a` 는 가속도 노이즈 1σ [m/s²].\n\n'
      + '**`update(x, P, z, sigma_z)`** → `(x_new, P_new)`. 위치 측정 `z` [m] 하나로 갱신합니다. $H = [1\\ \\ 0]$, $R = \\sigma_z^2$ 이고 $\\nu = z - Hx^-$, $S = HP^-H^{\\mathsf T} + R$, $K = P^-H^{\\mathsf T}/S$, $x = x^- + K\\nu$, $P = (I - KH)P^-$ 입니다. `sigma_z` 는 측정 노이즈 1σ [m].\n\n'
      + '**`kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay)`** → `(xs, Ps)`. `xs` 는 모양 `(n_steps+1, 2)`, `Ps` 는 `(n_steps+1, 2, 2)` 입니다.\n\n'
      + '`meas` 는 `(k_meas, k_arr, z)` 튜플의 리스트입니다. `z` 는 스텝 `k_meas` 에 **측정된** 위치이고, 필터는 이 값을 스텝 `k_arr` 부터 쓸 수 있습니다 (정수, `0 ≤ k_meas ≤ k_arr ≤ n_steps`, 리스트는 `k_arr` 오름차순). `x0`, `P0` 는 스텝 0 의 추정(측정을 넣기 전)입니다.\n\n'
      + '**`xs[k]`, `Ps[k]` 의 뜻**: `k_arr ≤ k` 인 측정만 가지고 구한 스텝 `k` 의 추정입니다. 단, 각 측정은 도착한 시각이 아니라 **자기가 측정된 스텝 `k_meas` 에서** 갱신에 쓰여야 합니다(그 스텝의 예측 뒤, 다음 스텝의 예측 앞). 같은 스텝에 측정이 여러 개면 리스트 순서대로 차례로 갱신합니다. 스텝 0 에서는 예측을 하지 않습니다.\n\n'
      + '**버퍼 한계**: `k_arr - k_meas > max_delay` 인 측정은 너무 오래되어 버퍼에 없으므로 **버립니다**(무시).\n\n'
      + '방법: 스텝마다 "갱신 전 상태"와 "그 스텝에서 쓴 측정"을 저장해 두고, 측정이 도착하면 `k_meas` 로 되돌아가 측정을 추가한 뒤 지금 스텝까지 예측·갱신을 다시 계산합니다.',
    en: 'Estimate the state $x = [p, v]$ (position [m], velocity [m/s]) of a drone moving along one axis. Complete three functions. Step $k$ is time $k\\cdot$`dt` [s].\n\n'
      + '**`predict(x, P, dt, sigma_a)`** → `(x_pred, P_pred)`. One prediction step of the constant-velocity model: $F = \\begin{bmatrix}1 & dt\\\\ 0 & 1\\end{bmatrix}$, $Q = \\sigma_a^2\\begin{bmatrix}dt^4/4 & dt^3/2\\\\ dt^3/2 & dt^2\\end{bmatrix}$, $x^- = Fx$, $P^- = FPF^{\\mathsf T} + Q$. `sigma_a` is the acceleration noise 1σ [m/s²].\n\n'
      + '**`update(x, P, z, sigma_z)`** → `(x_new, P_new)`. Update with one position measurement `z` [m]: $H = [1\\ \\ 0]$, $R = \\sigma_z^2$, $\\nu = z - Hx^-$, $S = HP^-H^{\\mathsf T} + R$, $K = P^-H^{\\mathsf T}/S$, $x = x^- + K\\nu$, $P = (I - KH)P^-$. `sigma_z` is the measurement noise 1σ [m].\n\n'
      + '**`kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay)`** → `(xs, Ps)` with shapes `(n_steps+1, 2)` and `(n_steps+1, 2, 2)`.\n\n'
      + '`meas` is a list of tuples `(k_meas, k_arr, z)`. `z` is the position **measured** at step `k_meas`; the filter can use it only from step `k_arr` on (integers, `0 ≤ k_meas ≤ k_arr ≤ n_steps`, list sorted by `k_arr`). `x0`, `P0` are the estimate at step 0 (before any measurement).\n\n'
      + '**Meaning of `xs[k]`, `Ps[k]`**: the estimate at step `k` computed from the measurements with `k_arr ≤ k` only. Each measurement must be used for the update **at its own measurement step `k_meas`**, not at its arrival (after the prediction of that step, before the prediction of the next). Several measurements at one step are applied one after another in list order. No prediction is done at step 0.\n\n'
      + '**Buffer limit**: a measurement with `k_arr - k_meas > max_delay` is too old to be in the buffer and is **discarded** (ignored).\n\n'
      + 'Method: store, for every step, the "state before the update" and "the measurements used at that step". When a measurement arrives, go back to `k_meas`, add it, and recompute prediction and update up to the present step.',
  },
  starter: `import numpy as np

def predict(x, P, dt, sigma_a):
    # F, Q 를 만들고  x_pred = F x,  P_pred = F P F^T + Q
    return x, P

def update(x, P, z, sigma_z):
    # nu = z - H x,  S = H P H^T + R,  K = P H^T / S
    # x_new = x + K nu,  P_new = (I - K H) P
    return x, P

def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float)
    P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2))
    Ps = np.zeros((n_steps + 1, 2, 2))
    prior = [None] * (n_steps + 1)            # prior[j]: 스텝 j 의 "갱신 전" (x, P)
    used = [[] for _ in range(n_steps + 1)]   # used[j]: 스텝 j 에서 측정되어 이미 도착한 z 들
    prior[0] = (x, P)
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a)
            prior[k] = (x, P)
        for (k_meas, k_arr, z) in meas:
            if k_arr != k:
                continue
            # 1) k - k_meas > max_delay 이면 버린다 (continue)
            # 2) used[k_meas] 에 z 를 추가한다
            # 3) prior[k_meas] 로 되돌아가 스텝 k_meas .. k 를 다시 계산한다
            #    스텝마다: (첫 스텝이 아니면) 예측 -> prior 갱신 -> used 의 측정으로 모두 갱신
            pass
        xs[k] = x
        Ps[k] = P
    return xs, Ps
`,
  solution: `import numpy as np

def predict(x, P, dt, sigma_a):
    F = np.array([[1.0, dt], [0.0, 1.0]])
    Q = sigma_a**2 * np.array([[dt**4 / 4, dt**3 / 2], [dt**3 / 2, dt**2]])
    x = F @ x                                   # x- = F x      (상태를 한 스텝 앞으로)
    P = F @ P @ F.T + Q                         # P- = F P F^T + Q  (불확실성이 커진다)
    return x, P

def update(x, P, z, sigma_z):
    H = np.array([[1.0, 0.0]])
    nu = z - (H @ x)[0]                         # 혁신: 측정 - 예측한 측정
    S = (H @ P @ H.T)[0, 0] + sigma_z**2        # 혁신의 분산 S = H P- H^T + R
    K = (P @ H.T)[:, 0] / S                     # 칼만 이득 K = P- H^T / S
    x = x + K * nu                              # x = x- + K nu  (혁신만큼 고친다)
    P = (np.eye(2) - np.outer(K, H[0])) @ P     # P = (I - K H) P-  (불확실성이 줄어든다)
    return x, P

def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float)
    P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2))
    Ps = np.zeros((n_steps + 1, 2, 2))
    prior = [None] * (n_steps + 1)              # 버퍼: 스텝 j 의 "갱신 전" (x, P)
    used = [[] for _ in range(n_steps + 1)]     # 버퍼: 스텝 j 에서 측정되어 이미 도착한 z 들
    prior[0] = (x, P)
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a)   # 평소대로 한 스텝 예측
            prior[k] = (x, P)
        for (k_meas, k_arr, z) in meas:
            if k_arr != k:
                continue
            if k - k_meas > max_delay:
                continue                        # 버퍼보다 오래된 측정은 버린다
            used[k_meas].append(z)
            x, P = prior[k_meas]                # 1) 측정된 시각으로 되돌아간다
            for j in range(k_meas, k + 1):      # 2) 거기서부터 지금까지 다시 계산
                if j > k_meas:
                    x, P = predict(x, P, dt, sigma_a)
                    prior[j] = (x, P)           #    뒤 스텝들의 "갱신 전" 상태도 새로 쓴다
                for zj in used[j]:
                    x, P = update(x, P, zj, sigma_z)
        xs[k] = x
        Ps[k] = P
    return xs, Ps
`,
  links: { xpred: [6], ppred: [7], innov: [12], gain: [13, 14], xupd: [15], pupd: [16], back: [37], replay: [38, 39, 40, 41, 42, 43] },
  tests: `
_x0 = np.array([0.0, 0.0])
_P0 = np.array([[1.0, 0.0], [0.0, 1.0]])
_r = np.random.default_rng(20261122)
_N = 30
_truth = 0.8 * 0.1 * np.arange(_N + 1)
_z = _truth + 0.1 * _r.standard_normal(_N + 1)
_M_now = [(k, k, float(_z[k])) for k in range(1, _N + 1)]
_M_d3 = [(k, k + 3, float(_z[k])) for k in range(1, _N - 2)]
_M_one = sorted([(k, k, float(_z[k])) for k in range(1, _N + 1) if k != 4] + [(4, 9, float(_z[4]))], key=lambda m: m[1])
_d = _r.integers(0, 6, size=_N + 1)
_M_mix = sorted([(k, min(_N, k + int(_d[k])), float(_z[k])) for k in range(1, _N + 1)]
                + [(7, 7, float(_z[7]) + 0.05), (12, 15, float(_z[12]) - 0.03)], key=lambda m: m[1])
_M_old = [(0, 0, 0.1), (2, 4, 0.3), (3, 9, 0.5), (5, 9, 0.6), (6, 12, 0.9), (10, 10, 1.0)]
_z2 = 2.0 + 1.5 * 0.02 * np.arange(41) + 0.05 * _r.standard_normal(41)
_M_fast = [(k, k, float(_z2[k])) for k in range(0, 41, 2)]

def _pair(out):
    a, b = out
    return (np.asarray(a, dtype=float), np.asarray(b, dtype=float))

TESTS = [
    dict(name_ko="predict: 한 스텝 예측", name_en="predict: one prediction step",
         run=lambda ns: _pair(ns["predict"](np.array([1.0, 2.0]), np.array([[0.5, 0.1], [0.1, 0.3]]), 0.1, 2.0)),
         hint_ko="$Q = \\\\sigma_a^2\\\\,[[dt^4/4,\\\\ dt^3/2],[dt^3/2,\\\\ dt^2]]$ 입니다. $\\\\sigma_a$ 를 제곱했는지, 비대각 원소 $dt^3/2$ 를 넣었는지, $P^- = FPF^{\\\\mathsf T} + Q$ 에서 전치를 빠뜨리지 않았는지 보세요.",
         hint_en="$Q = \\\\sigma_a^2\\\\,[[dt^4/4,\\\\ dt^3/2],[dt^3/2,\\\\ dt^2]]$. Did you square $\\\\sigma_a$, include the off-diagonal $dt^3/2$, and keep the transpose in $P^- = FPF^{\\\\mathsf T} + Q$?"),
    dict(name_ko="update: 측정 하나로 갱신", name_en="update: one measurement update",
         run=lambda ns: _pair(ns["update"](np.array([1.0, 2.0]), np.array([[0.5, 0.1], [0.1, 0.3]]), 1.4, 0.2)),
         hint_ko="이득은 **갱신 전** 공분산으로 계산합니다: $S = HP^-H^{\\\\mathsf T} + \\\\sigma_z^2$, $K = P^-H^{\\\\mathsf T}/S$. $R$ 은 $\\\\sigma_z$ 가 아니라 $\\\\sigma_z^2$ 입니다.",
         hint_en="The gain uses the covariance **before** the update: $S = HP^-H^{\\\\mathsf T} + \\\\sigma_z^2$, $K = P^-H^{\\\\mathsf T}/S$. $R$ is $\\\\sigma_z^2$, not $\\\\sigma_z$."),
    dict(name_ko="지연이 없으면 보통의 칼만 필터와 같다", name_en="Without delay it is the ordinary Kalman filter",
         run=lambda ns: _pair(ns["kf_delayed"](_N, _M_now, 0.1, 1.0, 0.1, _x0, _P0, 10)),
         hint_ko="k_meas = k_arr 인 측정은 그 스텝의 예측 바로 뒤에 갱신하면 됩니다. xs[0] 은 x0 그대로(스텝 0 에서는 예측하지 않음)이고, 스텝 k ≥ 1 은 예측 → 갱신 순서입니다.",
         hint_en="A measurement with k_meas = k_arr is applied right after the prediction of that step. xs[0] is x0 itself (no prediction at step 0); for k ≥ 1 the order is predict, then update."),
    dict(name_ko="모든 측정이 3스텝 늦게 도착 (0.8 m/s 로 이동)", name_en="Every measurement arrives 3 steps late (moving at 0.8 m/s)",
         run=lambda ns: _pair(ns["kf_delayed"](_N, _M_d3, 0.1, 1.0, 0.1, _x0, _P0, 10)),
         hint_ko="늦게 온 측정을 **지금 시각의 측정처럼** 넣으면 추정이 속도 × 지연만큼 뒤처집니다. 측정된 스텝 k_meas 로 되돌아가 갱신한 뒤 지금까지 다시 예측하세요. 이때 x 뿐 아니라 **P 도** 다시 전파해야 합니다.",
         hint_en="Fusing a late measurement **as if it were measured now** makes the estimate lag by speed × delay. Go back to step k_meas, update there, and predict forward again — re-propagating **P as well as x**."),
    dict(name_ko="하나만 늦게 온 측정 (그 사이의 측정을 다시 적용)", name_en="One late measurement (re-apply the ones in between)",
         run=lambda ns: _pair(ns["kf_delayed"](_N, _M_one, 0.1, 1.0, 0.1, _x0, _P0, 10)),
         hint_ko="스텝 4 로 되돌아가 다시 계산할 때, 스텝 5~9 에서 **이미 썼던 측정들도 다시** 갱신에 넣어야 합니다. 예측만 다시 하면 그 측정들의 정보가 사라집니다.",
         hint_en="When you go back to step 4 and recompute, the measurements **already used** at steps 5–9 must be applied again. Re-predicting only would throw their information away."),
    dict(name_ko="지연이 제각각 + 같은 스텝에 측정 둘", name_en="Mixed delays + two measurements at one step", hidden=True,
         run=lambda ns: _pair(ns["kf_delayed"](_N, _M_mix, 0.1, 1.0, 0.1, _x0, _P0, 10)),
         hint_ko="측정이 순서가 뒤바뀌어 도착하거나 같은 스텝에 두 개가 있어도, 스텝마다 '그 스텝에서 측정된 값의 목록'을 저장해 두고 되돌아가 다시 계산하면 됩니다. 되돌아간 뒤 뒤쪽 스텝의 저장된 '갱신 전 상태'도 새 값으로 바꿨는지 확인하세요.",
         hint_en="Out-of-order arrivals and two measurements at one step are handled by keeping, per step, the list of values measured at that step and recomputing from there. Also overwrite the stored pre-update states of the later steps with the recomputed ones."),
    dict(name_ko="버퍼 한계: max_delay 보다 오래된 측정은 버린다", name_en="Buffer limit: discard measurements older than max_delay", hidden=True,
         run=lambda ns: _pair(ns["kf_delayed"](14, _M_old, 0.1, 1.0, 0.1, _x0, _P0, 4)),
         hint_ko="k_arr − k_meas 가 max_delay 보다 **크면** 버리고, 같으면 씁니다. 스텝 0 에서 측정된 값(k_meas = 0)은 예측 없이 x0, P0 에 바로 갱신합니다.",
         hint_en="Discard when k_arr − k_meas is **greater than** max_delay; keep it when equal. A value measured at step 0 (k_meas = 0) updates x0, P0 directly, without a prediction."),
    dict(name_ko="다른 dt·노이즈, 두 스텝에 한 번 측정", name_en="Different dt and noise, a measurement every other step", hidden=True,
         run=lambda ns: _pair(ns["kf_delayed"](40, _M_fast, 0.02, 3.0, 0.05, np.array([2.0, 0.0]), np.array([[0.04, 0.0], [0.0, 4.0]]), 5)),
         hint_ko="dt, sigma_a, sigma_z 를 인자로 받은 값 그대로 쓰는지(상수로 적어 두지 않았는지), 측정이 없는 스텝에서는 예측만 하는지 확인하세요.",
         hint_en="Use dt, sigma_a and sigma_z as passed in (no hard-coded constants), and only predict at steps without a measurement."),
]
`,
};

export const tasks = [kfDelayedTask];
