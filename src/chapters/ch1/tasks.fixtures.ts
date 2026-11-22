/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

const HEAD = `C = 299_792_458.0
TICK = 1.0 / 63.8976e9
`;

export const fixtures: Record<string, TaskFixtures> = {
  'ch1-dstwr': {
    wrong: [
      { name: 'SS-TWR 식만 사용 (세 번째 메시지를 안 씀)', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    return C * (t_round1 - t_reply1) / 2 * TICK
` },
      { name: '대칭 공식 (÷4) 사용', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 - t_reply2 + t_round2 - t_reply1) / 4
    return C * tof * TICK
` },
      { name: '틱 → 초 변환을 빠뜨림', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    return C * tof
` },
      { name: '서로 다른 장치의 타임스탬프를 뺌', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_tx
    t_round2 = final_rx - answer_rx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    return C * tof * TICK
` },
      { name: '정수 나눗셈 (//) 사용', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) // (t_round1 + t_round2 + t_reply1 + t_reply2)
    return C * tof * TICK
` },
      { name: '분자에서 T_reply1·T_reply2 를 빼지 않음', code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    return C * tof * TICK
` },
    ],
    edge: [
      { name: '먼저 초로 바꾸고 numpy 로 계산, 분모를 다른 순서로 묶음', shouldPass: true, code: `import numpy as np
C = 299_792_458.0
TICK = 1.0 / 63.8976e9

def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    a = np.array([answer_rx - poll_tx, final_tx - answer_rx], dtype=float) * TICK   # A 시계: round1, reply2 [s]
    b = np.array([final_rx - answer_tx, answer_tx - poll_rx], dtype=float) * TICK   # B 시계: round2, reply1 [s]
    num = a[0] * b[0] - b[1] * a[1]
    den = (a[0] + a[1]) + (b[0] + b[1])
    return np.float64(num / den * C)
` },
      { name: '상수를 직접 적고 한 줄로 계산', shouldPass: true, code: `def ds_twr_distance(p_tx, p_rx, a_tx, a_rx, f_tx, f_rx):
    r1, d1, r2, d2 = a_rx - p_tx, a_tx - p_rx, f_rx - a_tx, f_tx - a_rx
    return 299792458.0 * ((r1 * r2 - d1 * d2) / (r1 + r2 + d1 + d2)) / 63.8976e9
` },
      { name: '형식은 맞지만 빛의 속도를 3e8 로 반올림', shouldPass: false, code: `TICK = 1.0 / 63.8976e9

def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    return 3e8 * tof * TICK
` },
      { name: '값을 출력만 하고 반환하지 않음', shouldPass: false, code: `${HEAD}
def ds_twr_distance(poll_tx, poll_rx, answer_tx, answer_rx, final_tx, final_rx):
    t_round1 = answer_rx - poll_tx
    t_reply1 = answer_tx - poll_rx
    t_round2 = final_rx - answer_tx
    t_reply2 = final_tx - answer_rx
    tof = (t_round1 * t_round2 - t_reply1 * t_reply2) / (t_round1 + t_round2 + t_reply1 + t_reply2)
    print(C * tof * TICK)
` },
    ],
  },
};
