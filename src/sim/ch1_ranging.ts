/**
 * 1장: 양방향 거리 측정(TWR) 한 번의 교환을 타임스탬프 단위로 다룬다.
 * 단위: 거리 m, 시간 s. 클럭 모델은 uwb.ts 와 같다 — 장치 X 의 시계는 실제 시간의 (1+eX)배로 간다.
 *
 * 메시지 3개: A(태그) poll → B(앵커) answer → A final.
 * 사건 6개의 순서: [poll 송신(A), poll 수신(B), answer 송신(B), answer 수신(A), final 송신(A), final 수신(B)]
 */
import { C_LIGHT, TwrClocks, dsTwrTof, tofOf } from './uwb';

/** 타임스탬프를 찍는 장치: 사건 순서대로 A, B, B, A, A, B */
export const STAMP_OWNER = ['A', 'B', 'B', 'A', 'A', 'B'] as const;

/** 사건 6개의 실제(참) 시각 [s]. poll 송신을 0 으로 둔다. reply1 은 B 시계, reply2 는 A 시계로 센 명목값. */
export function twrTrueTimes(d: number, reply1: number, reply2: number, clk: TwrClocks): number[] {
  const T = tofOf(d);
  const t1 = 0;
  const t2 = t1 + T;
  const t3 = t2 + reply1 / (1 + clk.eB); // B 가 reply1 을 세는 데 걸리는 실제 시간
  const t4 = t3 + T;
  const t5 = t4 + reply2 / (1 + clk.eA); // A 가 reply2 를 세는 데 걸리는 실제 시간
  const t6 = t5 + T;
  return [t1, t2, t3, t4, t5, t6];
}

export interface TwrStampOptions {
  /** 실제 시각 0 에서 A, B 시계가 가리키는 값 [s] (두 장치는 서로 다른 때에 켜졌다) */
  offA?: number;
  offB?: number;
  /** 타임스탬프 6개에 각각 더할 오차 [s] */
  noise?: ArrayLike<number>;
}

/** 각 장치가 자기 시계로 찍은 타임스탬프 6개 [s] */
export function twrStamps(d: number, reply1: number, reply2: number, clk: TwrClocks, opt: TwrStampOptions = {}): number[] {
  const t = twrTrueTimes(d, reply1, reply2, clk);
  return t.map((ti, k) => {
    const own = STAMP_OWNER[k] === 'A' ? (1 + clk.eA) * ti + (opt.offA ?? 0) : (1 + clk.eB) * ti + (opt.offB ?? 0);
    return own + (opt.noise ? opt.noise[k] : 0);
  });
}

export interface TwrIntervals { tRound1: number; tReply1: number; tRound2: number; tReply2: number }
/** 타임스탬프 6개 → 구간 4개. 같은 장치의 타임스탬프끼리만 뺀다. */
export function twrIntervals(s: ArrayLike<number>): TwrIntervals {
  return {
    tRound1: s[3] - s[0], // A: poll 송신 → answer 수신
    tReply1: s[2] - s[1], // B: poll 수신 → answer 송신
    tRound2: s[5] - s[2], // B: answer 송신 → final 수신
    tReply2: s[4] - s[3], // A: answer 수신 → final 송신
  };
}

/** 구간 4개의 "실제로 흐른 시간" (어느 시계로도 재지 않은 참값) */
export function twrTrueIntervals(d: number, reply1: number, reply2: number, clk: TwrClocks): TwrIntervals {
  return twrIntervals(twrTrueTimes(d, reply1, reply2, clk));
}

/** 대칭 DS-TWR 공식 (두 응답 지연이 같다고 가정): (T_round1 − T_reply2 + T_round2 − T_reply1) / 4 */
export const dsTwrSymmetricTof = (i: TwrIntervals): number => (i.tRound1 - i.tReply2 + i.tRound2 - i.tReply1) / 4;

export interface TwrEstimates {
  /** 앞의 두 메시지만 쓴 SS-TWR 거리 [m] */
  dSs: number;
  /** 비대칭 DS-TWR 거리 [m] */
  dDs: number;
  /** 대칭 공식으로 계산한 DS-TWR 거리 [m] */
  dSym: number;
}
/** 타임스탬프 6개에서 세 가지 방식의 거리 추정값을 구한다 */
export function twrEstimates(s: ArrayLike<number>): TwrEstimates {
  const i = twrIntervals(s);
  return {
    dSs: (C_LIGHT * (i.tRound1 - i.tReply1)) / 2,
    dDs: C_LIGHT * dsTwrTof(i.tRound1, i.tReply1, i.tRound2, i.tReply2),
    dSym: C_LIGHT * dsTwrSymmetricTof(i),
  };
}

/** DS-TWR(비대칭)에 남는 클럭 오차의 1차 근사: Δd ≈ d·(eA + eB)/2 */
export const dsTwrResidual = (d: number, clk: TwrClocks): number => (d * (clk.eA + clk.eB)) / 2;

/** 대칭 공식을 응답 지연이 다른 교환에 썼을 때 더 생기는 오차의 1차 근사: c·(eA − eB)·(reply1 − reply2)/4 */
export const dsTwrSymmetricExtra = (reply1: number, reply2: number, clk: TwrClocks): number =>
  (C_LIGHT * (clk.eA - clk.eB) * (reply1 - reply2)) / 4;

/**
 * 타임스탬프 6개에 서로 독립인 표준편차 sigmaT [s] 의 오차가 있을 때 DS-TWR 거리의 표준편차 [m] (1차 근사).
 * δT̂ = −a n1 + a n2 − ½ n3 + ½ n4 − b n5 + b n6,  a = (T + D2)/S,  b = (T + D1)/S,  S = 2(2T + D1 + D2)
 * → σ_d = c·σ_t·sqrt(2a² + 2b² + ½).  응답 지연이 같으면 a = b = ¼ 이어서 σ_d = (√3/2)·c·σ_t.
 */
export function dsTwrJitterSigma(d: number, reply1: number, reply2: number, sigmaT: number): number {
  const T = tofOf(d);
  const S = 2 * (2 * T + reply1 + reply2);
  const a = (T + reply2) / S, b = (T + reply1) / S;
  return C_LIGHT * sigmaT * Math.sqrt(2 * a * a + 2 * b * b + 0.5);
}

/** 같은 조건에서 SS-TWR 거리의 표준편차 [m]: 타임스탬프 4개가 각각 ½ 의 가중치 → σ_d = c·σ_t */
export const ssTwrJitterSigma = (sigmaT: number): number => C_LIGHT * sigmaT;
