/** 1~3장: UWB 비행시간(ToF) 측정 모델. 단위: 거리 m, 시간 s. */
import { Vec, dist } from './linalg';

/** 빛의 속도 [m/s] (SI 정의값) */
export const C_LIGHT = 299_792_458;

export const tofOf = (d: number): number => d / C_LIGHT;

export interface TwrClocks {
  /** 장치 A(개시자) 클럭 주파수 오차 (비율, 20 ppm = 20e-6) */
  eA: number;
  /** 장치 B(응답자) 클럭 주파수 오차 */
  eB: number;
}

/**
 * 단측 양방향(SS-TWR).
 * A가 poll 송신 → B가 자기 시계로 replyDelay 뒤 응답 → A가 수신.
 * 장치 X의 시계는 실제 시간보다 (1+eX)배 빠르게 간다고 모델링한다.
 */
export function ssTwr(d: number, replyDelay: number, clk: TwrClocks) {
  const T = tofOf(d);
  const trueReply = replyDelay / (1 + clk.eB); // B가 replyDelay 를 세는 데 걸리는 실제 시간
  const tRoundA = (2 * T + trueReply) * (1 + clk.eA); // A 시계로 잰 왕복 시간
  const tofEst = (tRoundA - replyDelay) / 2;
  const dEst = tofEst * C_LIGHT;
  return { tRound: tRoundA, tReply: replyDelay, tofEst, dEst, err: dEst - d };
}

/** 양측 양방향(DS-TWR) 타임스탬프 4개로 ToF 계산 (비대칭 공식). */
export function dsTwrTof(tRound1: number, tReply1: number, tRound2: number, tReply2: number): number {
  return (tRound1 * tRound2 - tReply1 * tReply2) / (tRound1 + tRound2 + tReply1 + tReply2);
}

/**
 * DS-TWR 한 번의 교환을 시뮬레이션한다.
 * A: poll → B: (reply1 뒤) answer → A: (reply2 뒤) final.
 * tRound1, tReply2 는 A 시계, tReply1, tRound2 는 B 시계로 잰다.
 */
export function dsTwr(d: number, reply1: number, reply2: number, clk: TwrClocks) {
  const T = tofOf(d);
  const tReply1 = reply1; // B 시계 기준 명목값
  const tReply2 = reply2; // A 시계 기준 명목값
  const tRound1 = (2 * T + reply1 / (1 + clk.eB)) * (1 + clk.eA);
  const tRound2 = (2 * T + reply2 / (1 + clk.eA)) * (1 + clk.eB);
  const tofEst = dsTwrTof(tRound1, tReply1, tRound2, tReply2);
  const dEst = tofEst * C_LIGHT;
  return { tRound1, tReply1, tRound2, tReply2, tofEst, dEst, err: dEst - d };
}

/** SS-TWR 클럭 드리프트 오차의 1차 근사: Δd ≈ c·(eA − eB)·T_reply / 2 */
export const ssTwrDriftError = (replyDelay: number, clk: TwrClocks): number =>
  (C_LIGHT * (clk.eA - clk.eB) * replyDelay) / 2;

/** TDoA(도달 시간차)를 거리로 환산한 값: d(p, a_j) − d(p, a_i) */
export const tdoaOf = (p: Vec, ai: Vec, aj: Vec): number => dist(p, aj) - dist(p, ai);

/** 타임스탬프 분해능(초)에 의한 양자화 */
export const quantize = (t: number, resolution: number): number =>
  resolution > 0 ? Math.round(t / resolution) * resolution : t;
