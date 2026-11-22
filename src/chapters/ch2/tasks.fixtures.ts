/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

export const fixtures: Record<string, TaskFixtures> = {
  'ch2-gauss-newton': {
    wrong: [
      { name: '야코비안 부호 반대 (a - x)', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        diff = A - x
        d = np.linalg.norm(diff, axis=1)
        r = d - rho
        J = diff / d[:, None]
        x = x + np.linalg.solve(J.T @ J, -J.T @ r)
    return x
` },
      { name: '야코비안을 거리로 나누지 않음', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        diff = x - A
        r = np.linalg.norm(diff, axis=1) - rho
        J = diff
        x = x + np.linalg.solve(J.T @ J, -J.T @ r)
    return x
` },
      { name: '정규방정식을 풀지 않고 -J^T r 만 더함', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        diff = x - A
        d = np.linalg.norm(diff, axis=1)
        r = d - rho
        J = diff / d[:, None]
        x = x - J.T @ r
    return x
` },
      { name: '한 번만 갱신하고 반환', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        diff = x - A
        d = np.linalg.norm(diff, axis=1)
        r = d - rho
        J = diff / d[:, None]
        x = x + np.linalg.solve(J.T @ J, -J.T @ r)
        return x
    return x
` },
      { name: '잔차 부호 반대 (측정 - 계산)', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        diff = x - A
        d = np.linalg.norm(diff, axis=1)
        r = rho - d
        J = diff / d[:, None]
        x = x + np.linalg.solve(J.T @ J, -J.T @ r)
    return x
` },
      { name: '3차원으로 고정', code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float); rho = np.asarray(ranges, dtype=float); x = np.array(x0, dtype=float)
    for _ in range(iters):
        J = np.zeros((len(A), 3)); r = np.zeros(len(A))
        for i in range(len(A)):
            d = np.sqrt((x[0] - A[i, 0]) ** 2 + (x[1] - A[i, 1]) ** 2 + (x[2] - A[i, 2]) ** 2)
            r[i] = d - rho[i]
            J[i] = (x - A[i]) / d
        x = x + np.linalg.solve(J.T @ J, -J.T @ r)
    return x
` },
    ],
    edge: [
      { name: 'np.linalg.lstsq 로 푼 정답', shouldPass: true, code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    A = np.array(anchors, float); rho = np.array(ranges, float); x = np.array(x0, float)
    k = 0
    while k < iters:
        d = np.sqrt(((x - A) ** 2).sum(axis=1))
        J = (x - A) / d.reshape(-1, 1)
        dx, *_ = np.linalg.lstsq(J, rho - d, rcond=None)
        x = x + dx
        k += 1
    return x
` },
      { name: '반복문과 역행렬로 푼 정답, 리스트 반환', shouldPass: true, code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    x = [float(v) for v in x0]
    n = len(x)
    for _ in range(iters):
        H = np.zeros((n, n)); g = np.zeros(n)
        for a, rho in zip(anchors, ranges):
            e = np.array([x[k] - a[k] for k in range(n)])
            d = float(np.sqrt(e @ e))
            e = e / d
            H += np.outer(e, e)
            g += e * (d - rho)
        dx = -np.linalg.inv(H) @ g
        x = [x[k] + dx[k] for k in range(n)]
    return x
` },
      { name: 'x0 를 그대로 반환 (형식만 맞춤)', shouldPass: false, code: `import numpy as np
def gauss_newton(anchors, ranges, x0, iters):
    return np.array(x0, dtype=float)
` },
    ],
  },
};
