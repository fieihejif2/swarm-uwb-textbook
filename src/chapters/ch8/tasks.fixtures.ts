/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

export const fixtures: Record<string, TaskFixtures> = {
  'ch8-cbf-filter': {
    wrong: [
      { name: '법선 방향이 반대 (p_other - p_self)', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_other, dtype=float) - np.asarray(p_self, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    w = s * u_nom; b = -(alpha / 2) * h
    if n @ w >= b:
        return u_nom.copy()
    return (w + (b - n @ w) * n) / s
` },
      { name: '책임을 절반으로 나누지 않음 (α 전체)', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    w = s * u_nom; b = -alpha * h
    if n @ w >= b:
        return u_nom.copy()
    return (w + (b - n @ w) * n) / s
` },
      { name: 'z 축 변환을 잊음 (kz 무시)', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    r = np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float)
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    b = -(alpha / 2) * h
    if n @ u_nom >= b:
        return u_nom.copy()
    return u_nom + (b - n @ u_nom) * n
` },
      { name: '법선 성분을 더하지 않고 벡터 전체를 줄임', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    w = s * u_nom; b = -(alpha / 2) * h
    if n @ w >= b:
        return u_nom.copy()
    scale = max(0.0, b / (n @ w)) if (n @ w) != 0 else 0.0
    return u_nom * min(1.0, scale)
` },
      { name: '원래 좌표로 되돌리지 않음 (S 의 역변환 누락)', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    w = s * u_nom; b = -(alpha / 2) * h
    if n @ w >= b:
        return u_nom.copy()
    return w + (b - n @ w) * n
` },
      { name: '조건 검사 없이 항상 법선 성분을 b 로 맞춤', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    w = s * u_nom; b = -(alpha / 2) * h
    return (w + (b - n @ w) * n) / s
` },
      { name: '위치만 줄이고 속도 명령은 줄이지 않음', code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r); n = r / d; h = d - d_min
    b = -(alpha / 2) * h
    if n @ u_nom >= b:
        return u_nom.copy()
    return u_nom + (b - n @ u_nom) * n
` },
    ],
    edge: [
      { name: '반복문과 리스트로 푼 정답 (리스트 반환)', shouldPass: true, code: `import math
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    r = [p_self[0] - p_other[0], p_self[1] - p_other[1], (p_self[2] - p_other[2]) / kz]
    d = math.sqrt(sum(c * c for c in r))
    n = [c / d for c in r]
    w = [u_nom[0], u_nom[1], u_nom[2] / kz]
    nw = sum(a * c for a, c in zip(n, w))
    lack = -0.5 * alpha * (d - d_min) - nw
    if lack <= 0:
        return [float(c) for c in u_nom]
    w = [c + lack * a for c, a in zip(w, n)]
    return [w[0], w[1], w[2] * kz]
` },
      { name: 'max(0, 부족분) 한 줄로 쓴 정답', shouldPass: true, code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    S = np.diag([1.0, 1.0, 1.0 / kz])
    r = S @ (np.array(p_self, float) - np.array(p_other, float))
    n = r / np.linalg.norm(r)
    w = S @ np.array(u_nom, float)
    lam = max(0.0, -(alpha / 2) * (np.linalg.norm(r) - d_min) - n @ w)
    return np.linalg.inv(S) @ (w + lam * n)
` },
      { name: '입력을 그대로 돌려주는 코드 (형식만 맞음)', shouldPass: false, code: `import numpy as np
def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    return np.asarray(u_nom, dtype=float)
` },
    ],
  },
};
