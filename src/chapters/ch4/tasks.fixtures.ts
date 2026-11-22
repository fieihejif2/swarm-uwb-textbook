/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

const HEAD = `import numpy as np
def gated_update(x, P, z, h, H, R, k):
    x = np.asarray(x, dtype=float); P = np.asarray(P, dtype=float); H = np.asarray(H, dtype=float)
    nu = z - h
`;

export const fixtures: Record<string, TaskFixtures> = {
  'ch4-gated-update': {
    wrong: [
      { name: 'ν²/S 가 아니라 |ν| 를 k 와 비교', code: `${HEAD}    S = H @ P @ H + R
    if k > 0 and abs(nu) > k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), True
` },
      { name: '게이트에서 S 대신 R 로 나눔', code: `${HEAD}    S = H @ P @ H + R
    if k > 0 and nu * nu / R > k * k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), True
` },
      { name: 'S 에서 H P Hᵀ 를 빠뜨림 (S = R)', code: `${HEAD}    S = R
    if k > 0 and nu * nu / S > k * k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), True
` },
      { name: '버린 측정으로도 P 를 줄임', code: `${HEAD}    S = H @ P @ H + R
    K = P @ H / S
    P_new = P - np.outer(K, H @ P)
    if k > 0 and nu * nu / S > k * k:
        return x.copy(), P_new, False
    return x + K * nu, P_new, True
` },
      { name: '공분산 갱신 부호 반대 (P + K H P)', code: `${HEAD}    S = H @ P @ H + R
    if k > 0 and nu * nu / S > k * k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P + np.outer(K, H @ P), True
` },
      { name: '문턱에 걸린 측정을 버림 (>=)', code: `${HEAD}    S = H @ P @ H + R
    if k > 0 and nu * nu / S >= k * k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), True
` },
      { name: 'k = 0 을 "문턱 0" 으로 처리 (전부 버림)', code: `${HEAD}    S = H @ P @ H + R
    if nu * nu / S > k * k:
        return x.copy(), P.copy(), False
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), True
` },
      { name: '입력 x 를 그 자리에서 고침', code: `import numpy as np
def gated_update(x, P, z, h, H, R, k):
    H = np.asarray(H, dtype=float)
    if not isinstance(x, np.ndarray):
        x = np.asarray(x, dtype=float); P = np.asarray(P, dtype=float)
    nu = z - h
    S = H @ P @ H + R
    if k > 0 and nu * nu / S > k * k:
        return x, P, False
    K = P @ H / S
    P_new = P - np.outer(K, H @ P)
    x += K * nu
    return x, P_new, True
` },
    ],
    edge: [
      { name: '조지프 형태 공분산 + |ν|/√S ≤ k 로 판정 + np.bool_ 반환', shouldPass: true, code: `import numpy as np
def gated_update(x, P, z, h, H, R, k):
    x = np.array(x, float); P = np.array(P, float); H = np.array(H, float).reshape(1, -1)
    n = len(x)
    nu = z - h
    S = (H @ P @ H.T).item() + R
    ok = (k == 0) or (abs(nu) / np.sqrt(S) <= k)
    if not ok:
        return x, P, np.bool_(False)
    K = (P @ H.T) / S
    A = np.eye(n) - K @ H
    P_new = A @ P @ A.T + K @ K.T * R
    return x + K.ravel() * nu, P_new, np.bool_(True)
` },
      { name: '반복문으로 푼 정답, 리스트 반환', shouldPass: true, code: `def gated_update(x, P, z, h, H, R, k):
    n = len(x)
    PH = [sum(P[i][j] * H[j] for j in range(n)) for i in range(n)]
    S = sum(H[i] * PH[i] for i in range(n)) + R
    nu = z - h
    if k > 0 and nu ** 2 > k ** 2 * S:
        return [float(v) for v in x], [[float(v) for v in row] for row in P], False
    K = [PH[i] / S for i in range(n)]
    HP = [sum(H[i] * P[i][j] for i in range(n)) for j in range(n)]
    x_new = [x[i] + K[i] * nu for i in range(n)]
    P_new = [[P[i][j] - K[i] * HP[j] for j in range(n)] for i in range(n)]
    return x_new, P_new, True
` },
      { name: '값 두 개만 반환 (accepted 없음)', shouldPass: false, code: `${HEAD}    S = H @ P @ H + R
    if k > 0 and nu * nu / S > k * k:
        return x.copy(), P.copy()
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P)
` },
      { name: '형식만 맞춤: 갱신은 항상 하고 accepted 만 올바름', shouldPass: false, code: `${HEAD}    S = H @ P @ H + R
    K = P @ H / S
    return x + K * nu, P - np.outer(K, H @ P), not (k > 0 and nu * nu / S > k * k)
` },
    ],
  },
};
