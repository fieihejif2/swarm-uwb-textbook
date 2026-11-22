/** 채점기 테스트용: 일부러 틀린 코드와 경계 사례. tests/grader.test.ts 가 읽는다. */
import type { TaskFixtures } from '../../py/fixtures';

export const fixtures: Record<string, TaskFixtures> = {
  'ch3-update-rate': {
    wrong: [
      { name: 'TWR 에서 태그 수로 나누지 않음', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / t_range
    elif mode == "tdoa":
        meas = 1.0 / t_slot
    else:
        raise ValueError(mode)
    return meas, meas / n_anchors
` },
      { name: 'TDoA 도 태그 수로 나눔', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / (n_tags * t_range)
    elif mode == "tdoa":
        meas = 1.0 / (n_tags * t_slot)
    else:
        raise ValueError(mode)
    return meas, meas / n_anchors
` },
      { name: '위치 갱신율에서 앵커 수를 빠뜨림', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / (n_tags * t_range)
    elif mode == "tdoa":
        meas = 1.0 / t_slot
    else:
        raise ValueError(mode)
    return meas, meas
` },
      { name: '갱신율 대신 주기(초)를 반환', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        return n_tags * t_range, n_tags * n_anchors * t_range
    elif mode == "tdoa":
        return t_slot, n_anchors * t_slot
    raise ValueError(mode)
` },
      { name: 't_range 와 t_slot 을 바꿔 씀', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / (n_tags * t_slot)
    elif mode == "tdoa":
        meas = 1.0 / t_range
    else:
        raise ValueError(mode)
    return meas, meas / n_anchors
` },
      { name: '모르는 mode 를 조용히 TDoA 로 계산', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    if str(mode).strip().lower() == "twr":
        meas = 1.0 / (n_tags * t_range)
    else:
        meas = 1.0 / t_slot
    return meas, meas / n_anchors
` },
      { name: '대소문자를 구분함', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    if mode == "twr":
        meas = 1.0 / (n_tags * t_range)
    elif mode == "tdoa":
        meas = 1.0 / t_slot
    else:
        raise ValueError(mode)
    return meas, meas / n_anchors
` },
      { name: '반환 순서가 반대 (위치 갱신율, 측정률)', code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / (n_tags * t_range)
    elif mode == "tdoa":
        meas = 1.0 / t_slot
    else:
        raise ValueError(mode)
    return meas / n_anchors, meas
` },
    ],
    edge: [
      { name: '표(dict)로 푼 정답, 리스트 반환, 주기에서 역수', shouldPass: true, code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    key = mode.upper().strip()
    period = {"TWR": n_tags * t_range, "TDOA": t_slot}   # 태그 한 대가 측정 1개를 얻는 주기 [s]
    if key not in period:
        raise ValueError("unknown mode: " + repr(mode))
    return [1 / period[key], 1 / (period[key] * n_anchors)]
` },
      { name: 'numpy 배열로 반환한 정답', shouldPass: true, code: `import numpy as np
def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    m = mode.strip().lower()
    if m not in ("twr", "tdoa"):
        raise ValueError(m)
    meas = 1 / (n_tags * t_range) if m == "twr" else 1 / t_slot
    return np.array([meas, meas / n_anchors])
` },
      { name: '모르는 mode 에 ValueError 대신 None 반환', shouldPass: false, code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        meas = 1.0 / (n_tags * t_range)
    elif mode == "tdoa":
        meas = 1.0 / t_slot
    else:
        return None
    return meas, meas / n_anchors
` },
      { name: '값 하나만 반환 (위치 갱신율만)', shouldPass: false, code: `def update_rate(mode, n_tags, n_anchors, t_range, t_slot):
    mode = str(mode).strip().lower()
    if mode == "twr":
        return 1.0 / (n_tags * n_anchors * t_range)
    if mode == "tdoa":
        return 1.0 / (n_anchors * t_slot)
    raise ValueError(mode)
` },
    ],
  },
};
