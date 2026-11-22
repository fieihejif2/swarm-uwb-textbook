/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

const PREDICT = `import numpy as np
def predict(x, P, dt, sigma_a):
    F = np.array([[1.0, dt], [0.0, 1.0]])
    Q = sigma_a**2 * np.array([[dt**4 / 4, dt**3 / 2], [dt**3 / 2, dt**2]])
    return F @ x, F @ P @ F.T + Q
`;
const UPDATE = `def update(x, P, z, sigma_z):
    H = np.array([[1.0, 0.0]])
    S = (H @ P @ H.T)[0, 0] + sigma_z**2
    K = (P @ H.T)[:, 0] / S
    return x + K * (z - x[0]), (np.eye(2) - np.outer(K, H[0])) @ P
`;
const DELAYED = `def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float); P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2)); Ps = np.zeros((n_steps + 1, 2, 2))
    prior = [None] * (n_steps + 1); used = [[] for _ in range(n_steps + 1)]
    prior[0] = (x, P)
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a); prior[k] = (x, P)
        for (k_meas, k_arr, z) in meas:
            if k_arr != k or k - k_meas > max_delay:
                continue
            used[k_meas].append(z)
            x, P = prior[k_meas]
            for j in range(k_meas, k + 1):
                if j > k_meas:
                    x, P = predict(x, P, dt, sigma_a); prior[j] = (x, P)
                for zj in used[j]:
                    x, P = update(x, P, zj, sigma_z)
        xs[k] = x; Ps[k] = P
    return xs, Ps
`;

export const fixtures: Record<string, TaskFixtures> = {
  'ch5-kf-delayed': {
    wrong: [
      { name: '늦게 온 측정을 받은 시각에 융합 (수신 시각 타임스탬프)', code: PREDICT + UPDATE + `def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float); P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2)); Ps = np.zeros((n_steps + 1, 2, 2))
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a)
        for (k_meas, k_arr, z) in meas:
            if k_arr == k and k - k_meas <= max_delay:
                x, P = update(x, P, z, sigma_z)
        xs[k] = x; Ps[k] = P
    return xs, Ps
` },
      { name: '되돌아가 x 만 다시 전파하고 공분산 P 는 그대로 둠', code: PREDICT + UPDATE + `def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float); P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2)); Ps = np.zeros((n_steps + 1, 2, 2))
    prior = [None] * (n_steps + 1); used = [[] for _ in range(n_steps + 1)]
    prior[0] = (x, P)
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a); prior[k] = (x, P)
        for (k_meas, k_arr, z) in meas:
            if k_arr != k or k - k_meas > max_delay:
                continue
            used[k_meas].append(z)
            P_now = P
            x, Pj = prior[k_meas]
            for j in range(k_meas, k + 1):
                if j > k_meas:
                    x, Pj = predict(x, Pj, dt, sigma_a)
                for zj in used[j]:
                    x, Pj = update(x, Pj, zj, sigma_z)
            P = P_now if k_meas < k else Pj
        xs[k] = x; Ps[k] = P
    return xs, Ps
` },
      { name: 'Q 의 비대각 원소를 빠뜨림', code: `import numpy as np
def predict(x, P, dt, sigma_a):
    F = np.array([[1.0, dt], [0.0, 1.0]])
    Q = sigma_a**2 * np.array([[dt**4 / 4, 0.0], [0.0, dt**2]])
    return F @ x, F @ P @ F.T + Q
` + UPDATE + DELAYED },
      { name: 'sigma_a 를 제곱하지 않음', code: `import numpy as np
def predict(x, P, dt, sigma_a):
    F = np.array([[1.0, dt], [0.0, 1.0]])
    Q = sigma_a * np.array([[dt**4 / 4, dt**3 / 2], [dt**3 / 2, dt**2]])
    return F @ x, F @ P @ F.T + Q
` + UPDATE + DELAYED },
      { name: '이득 K 를 갱신 뒤의 P 로 계산', code: PREDICT + `def update(x, P, z, sigma_z):
    H = np.array([[1.0, 0.0]])
    S = (H @ P @ H.T)[0, 0] + sigma_z**2
    P_new = P - (P @ H.T @ H @ P) / S
    K = (P_new @ H.T)[:, 0] / S
    return x + K * (z - x[0]), P_new
` + DELAYED },
      { name: 'R 에 sigma_z 를 그대로 씀 (제곱 안 함)', code: PREDICT + `def update(x, P, z, sigma_z):
    H = np.array([[1.0, 0.0]])
    S = (H @ P @ H.T)[0, 0] + sigma_z
    K = (P @ H.T)[:, 0] / S
    return x + K * (z - x[0]), (np.eye(2) - np.outer(K, H[0])) @ P
` + DELAYED },
      { name: '되돌아간 뒤 그 사이의 측정을 다시 적용하지 않음', code: PREDICT + UPDATE + `def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    x = np.asarray(x0, dtype=float); P = np.asarray(P0, dtype=float)
    xs = np.zeros((n_steps + 1, 2)); Ps = np.zeros((n_steps + 1, 2, 2))
    post = [None] * (n_steps + 1)
    for k in range(n_steps + 1):
        if k > 0:
            x, P = predict(x, P, dt, sigma_a)
        for (k_meas, k_arr, z) in meas:
            if k_arr != k or k - k_meas > max_delay:
                continue
            if k_meas < k:
                x, P = post[k_meas]
            x, P = update(x, P, z, sigma_z)
            for j in range(k_meas + 1, k + 1):
                x, P = predict(x, P, dt, sigma_a)
        post[k] = (x, P)
        xs[k] = x; Ps[k] = P
    return xs, Ps
` },
      { name: 'max_delay 를 무시하고 오래된 측정도 사용', code: PREDICT + UPDATE + DELAYED.replace(' or k - k_meas > max_delay', '') },
      { name: '지연이 max_delay 와 같을 때도 버림 (>= 로 비교)', code: PREDICT + UPDATE + DELAYED.replace('k - k_meas > max_delay', 'k - k_meas >= max_delay') },
    ],
    edge: [
      { name: '버퍼 없이 매 스텝 처음부터 다시 계산 + 조지프 형태 + 리스트 반환', shouldPass: true, code: `import numpy as np
def predict(x, P, dt, sigma_a):
    x = np.array(x, float); P = np.array(P, float)
    F = np.eye(2); F[0, 1] = dt
    G = np.array([[dt * dt / 2], [dt]])
    return F.dot(x), F.dot(P).dot(F.T) + (G * sigma_a).dot((G * sigma_a).T)
def update(x, P, z, sigma_z):
    x = np.array(x, float); P = np.array(P, float)
    H = np.array([[1.0, 0.0]]); R = sigma_z * sigma_z
    S = H.dot(P).dot(H.T)[0, 0] + R
    K = P.dot(H.T) / S
    A = np.eye(2) - K.dot(H)
    return x + K[:, 0] * (z - x[0]), A.dot(P).dot(A.T) + K.dot(K.T) * R
def kf_delayed(n_steps, meas, dt, sigma_a, sigma_z, x0, P0, max_delay):
    xs, Ps = [], []
    for k in range(n_steps + 1):
        ok = [m for m in meas if m[1] <= k and m[1] - m[0] <= max_delay]
        x, P = np.array(x0, float), np.array(P0, float)
        for j in range(k + 1):
            if j > 0:
                x, P = predict(x, P, dt, sigma_a)
            for m in ok:
                if m[0] == j:
                    x, P = update(x, P, m[2], sigma_z)
        xs.append(x.tolist()); Ps.append(P.tolist())
    return xs, Ps
` },
      { name: 'xs 만 반환 (Ps 없음)', shouldPass: false, code: PREDICT + UPDATE + DELAYED.replace('return xs, Ps', 'return xs') },
      { name: '마지막 추정만 반환 (모양이 다름)', shouldPass: false, code: PREDICT + UPDATE + DELAYED.replace('return xs, Ps', 'return xs[-1], Ps[-1]') },
    ],
  },
};
