/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

/** 올바른 fit_sigma (fit_log 만 틀린 변형에 붙여 쓴다) */
const GOOD_SIGMA = `
def fit_sigma(t, x):
    t = np.asarray(t, dtype=float); x = np.asarray(x, dtype=float)
    b, a = np.polyfit(t - t[0], x, 1)
    resid = x - (a + b * (t - t[0]))
    return float(np.std(resid, ddof=1)), float(b)
`;
/** 올바른 fit_log (fit_sigma 만 틀린 변형에 붙여 쓴다) */
const GOOD_LOG = `
def fit_log(t_send, t_recv, seq):
    d = (np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)) / 2
    seq = np.asarray(seq)
    sent = seq.max() - seq.min() + 1
    return {"delay_mean": float(d.mean()), "delay_p95": float(np.percentile(d, 95)), "loss_rate": float((sent - len(seq)) / sent)}
`;

export const fixtures: Record<string, TaskFixtures> = {
  'ch9-fit-log': {
    wrong: [
      { name: '왕복을 절반으로 나누지 않음', code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    d = np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)
    seq = np.asarray(seq)
    sent = seq.max() - seq.min() + 1
    return {"delay_mean": float(d.mean()), "delay_p95": float(np.percentile(d, 95)), "loss_rate": float((sent - len(seq)) / sent)}
${GOOD_SIGMA}` },
      { name: '추세를 빼지 않은 σ', code: `import numpy as np
${GOOD_LOG}
def fit_sigma(t, x):
    t = np.asarray(t, dtype=float); x = np.asarray(x, dtype=float)
    b, a = np.polyfit(t - t[0], x, 1)
    return float(np.std(x, ddof=1)), float(b)
` },
      { name: '손실률을 빠진 개수 / 받은 개수로 계산', code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    d = (np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)) / 2
    seq = np.asarray(seq)
    sent = seq.max() - seq.min() + 1
    return {"delay_mean": float(d.mean()), "delay_p95": float(np.percentile(d, 95)), "loss_rate": float((sent - len(seq)) / len(seq))}
${GOOD_SIGMA}` },
      { name: 'ddof=0 (n 으로 나눔)', code: `import numpy as np
${GOOD_LOG}
def fit_sigma(t, x):
    t = np.asarray(t, dtype=float); x = np.asarray(x, dtype=float)
    b, a = np.polyfit(t - t[0], x, 1)
    return float(np.std(x - (a + b * (t - t[0])))), float(b)
` },
      { name: '순번이 0 에서 시작한다고 가정 (보낸 개수 = max + 1)', code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    d = (np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)) / 2
    seq = np.asarray(seq)
    sent = seq.max() + 1
    return {"delay_mean": float(d.mean()), "delay_p95": float(np.percentile(d, 95)), "loss_rate": float((sent - len(seq)) / sent)}
${GOOD_SIGMA}` },
      { name: '95 % 분위수를 정렬 후 정수 번째 값으로', code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    d = np.sort((np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)) / 2)
    seq = np.asarray(seq)
    sent = seq.max() - seq.min() + 1
    return {"delay_mean": float(d.mean()), "delay_p95": float(d[int(0.95 * len(d))]), "loss_rate": float((sent - len(seq)) / sent)}
${GOOD_SIGMA}` },
      { name: '직선을 표본 번호에 대해 맞춤 (기울기 단위가 m/표본)', code: `import numpy as np
${GOOD_LOG}
def fit_sigma(t, x):
    x = np.asarray(x, dtype=float)
    k = np.arange(len(x))
    b, a = np.polyfit(k, x, 1)
    return float(np.std(x - (a + b * k), ddof=1)), float(b)
` },
    ],
    edge: [
      { name: '다른 풀이: 순번 차이로 손실 세기, 정규방정식으로 직선 맞추기, 리스트 반환', shouldPass: true, code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    one = [(r - s) * 0.5 for s, r in zip(t_send, t_recv)]
    missing = int(np.sum(np.diff(np.asarray(seq)) - 1))
    return dict(delay_mean=sum(one) / len(one), delay_p95=np.quantile(one, 0.95), loss_rate=missing / (missing + len(one)), extra="ignored")
def fit_sigma(t, x):
    t = np.array(t, float); x = np.array(x, float)
    A = np.stack([np.ones_like(t), t - t.mean()], axis=1)
    coef = np.linalg.solve(A.T @ A, A.T @ x)
    r = x - A @ coef
    return [np.sqrt(np.sum(r ** 2) / (len(x) - 1)), coef[1]]
` },
      { name: 'dict 대신 튜플 반환', shouldPass: false, code: `import numpy as np
def fit_log(t_send, t_recv, seq):
    d = (np.asarray(t_recv, dtype=float) - np.asarray(t_send, dtype=float)) / 2
    seq = np.asarray(seq)
    sent = seq.max() - seq.min() + 1
    return float(d.mean()), float(np.percentile(d, 95)), float((sent - len(seq)) / sent)
${GOOD_SIGMA}` },
      { name: 'σ 만 반환 (drift 빠뜨림)', shouldPass: false, code: `import numpy as np
${GOOD_LOG}
def fit_sigma(t, x):
    t = np.asarray(t, dtype=float); x = np.asarray(x, dtype=float)
    b, a = np.polyfit(t - t[0], x, 1)
    return float(np.std(x - (a + b * (t - t[0])), ddof=1))
` },
    ],
  },
};
