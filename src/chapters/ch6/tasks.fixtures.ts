/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

const HEAD = `import numpy as np
def tdoa_update(x, P, a_i, a_j, z, sigma):
    x = np.asarray(x, dtype=float); P = np.asarray(P, dtype=float)
    a_i = np.asarray(a_i, dtype=float); a_j = np.asarray(a_j, dtype=float)
    p = x[:3]
    d_i = np.linalg.norm(p - a_i); d_j = np.linalg.norm(p - a_j)
`;

export const fixtures: Record<string, TaskFixtures> = {
  'ch6-tdoa-update': {
    wrong: [
      { name: '부호 반대 (h = d_i - d_j, H 도 반대)', code: `${HEAD}    h = d_i - d_j
    H = np.zeros(6); H[:3] = (p - a_i) / d_i - (p - a_j) / d_j
    S = H @ P @ H + sigma**2
    K = P @ H / S
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
      { name: 'H 를 거리로 나누지 않음', code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[:3] = (p - a_j) - (p - a_i)
    S = H @ P @ H + sigma**2
    K = P @ H / S
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
      { name: 'H 를 속도 칸에 넣음', code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[3:] = (p - a_j) / d_j - (p - a_i) / d_i
    S = H @ P @ H + sigma**2
    K = P @ H / S
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
      { name: 'K 를 S 로 나누지 않음', code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[:3] = (p - a_j) / d_j - (p - a_i) / d_i
    S = H @ P @ H + sigma**2
    K = P @ H
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
      { name: 'S 에 분산이 아니라 표준편차를 더함', code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[:3] = (p - a_j) / d_j - (p - a_i) / d_i
    S = H @ P @ H + sigma
    K = P @ H / S
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
    ],
    edge: [
      { name: '조지프 형태 공분산 + 행렬 표기, 리스트 반환', shouldPass: true, code: `import numpy as np
def tdoa_update(x, P, a_i, a_j, z, sigma):
    x = np.array(x, float).reshape(6, 1); P = np.array(P, float)
    ai = np.array(a_i, float); aj = np.array(a_j, float)
    p = x[:3, 0]
    ri = np.sqrt(np.sum((p - ai) ** 2)); rj = np.sqrt(np.sum((p - aj) ** 2))
    H = np.hstack([(p - aj) / rj - (p - ai) / ri, np.zeros(3)]).reshape(1, 6)
    R = np.array([[sigma * sigma]])
    S = H @ P @ H.T + R
    K = P @ H.T @ np.linalg.inv(S)
    xn = x + K * (z - (rj - ri))
    A = np.eye(6) - K @ H
    Pn = A @ P @ A.T + K @ R @ K.T
    return [xn.ravel().tolist(), Pn.tolist()]
` },
      { name: 'x_new 만 반환', shouldPass: false, code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[:3] = (p - a_j) / d_j - (p - a_i) / d_i
    S = H @ P @ H + sigma**2
    K = P @ H / S
    return x + K * (z - h)
` },
      { name: '위치만 갱신하고 속도는 그대로 둠', shouldPass: false, code: `${HEAD}    h = d_j - d_i
    H = np.zeros(6); H[:3] = (p - a_j) / d_j - (p - a_i) / d_i
    S = H @ P @ H + sigma**2
    K = P @ H / S
    K[3:] = 0.0
    return x + K * (z - h), P - np.outer(K, H @ P)
` },
    ],
  },
};
