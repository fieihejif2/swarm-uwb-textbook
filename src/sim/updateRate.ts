/** 3장: TWR vs TDoA 갱신율의 메시지 수 모델 (개념 모델). */

export interface TwrRateParams {
  nTags: number;
  nAnchors: number;
  /** 거리 1회 측정(메시지 여러 개의 교환 전체)에 걸리는 시간 [s] */
  rangeTime: number;
}
/** TWR: 태그들이 채널을 시분할로 나눠 쓴다. 한 번에 한 쌍(태그-앵커)만 거리 교환을 할 수 있다. */
export function twrRate(p: TwrRateParams) {
  const rangesPerSecTotal = 1 / p.rangeTime;
  const rangesPerSecPerTag = rangesPerSecTotal / p.nTags;
  return {
    rangesPerSecTotal,
    rangesPerSecPerTag,
    /** 한 태그가 모든 앵커를 한 바퀴 도는 비율 = 위치 갱신율 [Hz] */
    positionRate: rangesPerSecPerTag / p.nAnchors,
  };
}

export interface TdoaRateParams {
  nAnchors: number;
  /** 앵커 한 대의 송신 슬롯 길이 [s] */
  slotTime: number;
}
/** TDoA: 앵커만 송신하고 태그는 듣기만 한다 → 태그 수와 무관. */
export function tdoaRate(p: TdoaRateParams) {
  const packetsPerSec = 1 / p.slotTime;
  return {
    /** 새 패킷마다 직전 패킷과의 시간차 1개를 얻는다 */
    tdoaPerSecPerTag: packetsPerSec,
    /** 모든 앵커가 한 번씩 송신하는 주기의 역수 = 위치 갱신율 [Hz] */
    positionRate: packetsPerSec / p.nAnchors,
  };
}

/** 메시지 단위로 일정을 직접 세는 시뮬레이션(검증·애니메이션용). */
export function simulateTwrSchedule(p: TwrRateParams, duration: number) {
  const perTagRanges = new Array<number>(p.nTags).fill(0);
  const perTagRounds = new Array<number>(p.nTags).fill(0);
  const nextAnchor = new Array<number>(p.nTags).fill(0);
  const events: { t: number; tag: number; anchor: number }[] = [];
  let t = 0, tag = 0;
  while (t + p.rangeTime <= duration + 1e-12) {
    t += p.rangeTime;
    const a = nextAnchor[tag];
    perTagRanges[tag]++;
    if (events.length < 5000) events.push({ t, tag, anchor: a });
    nextAnchor[tag] = (a + 1) % p.nAnchors;
    if (nextAnchor[tag] === 0) perTagRounds[tag]++;
    tag = (tag + 1) % p.nTags;
  }
  return { perTagRanges, perTagRounds, events };
}
