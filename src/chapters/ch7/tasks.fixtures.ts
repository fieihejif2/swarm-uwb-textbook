/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

export const fixtures: Record<string, TaskFixtures> = {
  'ch7-delay-margin': {
    wrong: [
      { name: 'k 를 빠뜨림', code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    lam = np.linalg.eigvalsh(np.diag(A.sum(axis=1)) - A)
    return lam[1], lam[-1], np.pi / (2 * lam[-1])
` },
      { name: 'λ_N 대신 λ₂ 사용', code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    lam = np.linalg.eigvalsh(np.diag(A.sum(axis=1)) - A)
    return lam[1], lam[-1], np.pi / (2 * k * lam[1])
` },
      { name: '라플라시안 부호 반대 (A - D)', code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    lam = np.linalg.eigvalsh(A - np.diag(A.sum(axis=1)))
    return lam[1], lam[-1], np.pi / (2 * k * lam[-1])
` },
      { name: '분모의 2 를 빠뜨림', code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    lam = np.linalg.eigvalsh(np.diag(A.sum(axis=1)) - A)
    return lam[1], lam[-1], np.pi / (k * lam[-1])
` },
      { name: '차수를 이웃 수로 계산(가중치 무시)', code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    L = np.diag((A > 0).sum(axis=1)) - A
    lam = np.linalg.eigvalsh(L)
    return lam[1], lam[-1], np.pi / (2 * k * lam[-1])
` },
    ],
    edge: [
      { name: 'eig + 정렬, 리스트 반환', shouldPass: true, code: `import numpy as np
def delay_margin(A, k):
    A = np.array(A, float)
    D = np.zeros_like(A)
    for i in range(len(A)):
        D[i, i] = sum(A[i])
    lam = sorted(np.linalg.eig(D - A)[0].real)
    return [float(lam[1]), float(lam[-1]), float(np.pi / 2 / k / lam[-1])]
` },
      { name: '값 두 개만 반환', shouldPass: false, code: `import numpy as np
def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    lam = np.linalg.eigvalsh(np.diag(A.sum(axis=1)) - A)
    return lam[1], lam[-1]
` },
    ],
  },
  'ch7-gilbert': {
    wrong: [
      { name: '상태를 먼저 바꾸고 손실 판정', code: `import numpy as np
def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float); lost = np.zeros(len(u), dtype=int); bad = False
    for i in range(len(u)):
        bad = (not (u[i, 1] < p_bg)) if bad else (u[i, 1] < p_gb)
        lost[i] = 1 if u[i, 0] < (loss_bad if bad else loss_good) else 0
    return lost
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    pb = p_gb / (p_gb + p_bg)
    return (1 - pb) * loss_good + pb * loss_bad
` },
      { name: '전이 확률을 서로 바꿔 씀', code: `import numpy as np
def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float); lost = np.zeros(len(u), dtype=int); bad = False
    for i in range(len(u)):
        lost[i] = 1 if u[i, 0] < (loss_bad if bad else loss_good) else 0
        bad = (not (u[i, 1] < p_gb)) if bad else (u[i, 1] < p_bg)
    return lost
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    pb = p_gb / (p_gb + p_bg)
    return (1 - pb) * loss_good + pb * loss_bad
` },
      { name: '정상상태 식의 분자가 p_bg', code: `import numpy as np
def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float); lost = np.zeros(len(u), dtype=int); bad = False
    for i in range(len(u)):
        lost[i] = 1 if u[i, 0] < (loss_bad if bad else loss_good) else 0
        bad = (not (u[i, 1] < p_bg)) if bad else (u[i, 1] < p_gb)
    return lost
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    pb = p_bg / (p_gb + p_bg)
    return (1 - pb) * loss_good + pb * loss_bad
` },
      { name: 'Bad 에서 돌아오지 않음', code: `import numpy as np
def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float); lost = np.zeros(len(u), dtype=int); bad = False
    for i in range(len(u)):
        lost[i] = 1 if u[i, 0] < (loss_bad if bad else loss_good) else 0
        if not bad:
            bad = u[i, 1] < p_gb
    return lost
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    pb = p_gb / (p_gb + p_bg)
    return (1 - pb) * loss_good + pb * loss_bad
` },
    ],
    edge: [
      { name: '리스트로 반환, bool 대신 int 상태', shouldPass: true, code: `def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    out = []; state = 0
    for row in u:
        out.append(1 if row[0] < (loss_bad if state else loss_good) else 0)
        if state == 0 and row[1] < p_gb: state = 1
        elif state == 1 and row[1] < p_bg: state = 0
    return out
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    return (p_bg * loss_good + p_gb * loss_bad) / (p_gb + p_bg)
` },
      { name: '무한 루프가 아닌 예외 발생 코드', shouldPass: false, code: `def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    raise ValueError("아직 못 풀었어요")
def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    return 1 / 0
` },
    ],
  },
};
