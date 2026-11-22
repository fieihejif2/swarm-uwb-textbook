/**
 * 3장 보조 엔진 (개념 모델). 순수 TypeScript — DOM 없음.
 *  - simulateTdoaSchedule: TDoA 슬롯 일정을 패킷 단위로 세기 (updateRate.ts 의 simulateTwrSchedule 과 짝)
 *  - simulateRateError: 갱신율 → 추정 오차를 1축 등속 모델 + 칼만 필터로 직접 돌려 보기 (steadyStatePosSigma 의 검증용)
 *  - positionErrorMc: 한 점에서 가우스-뉴턴 측위를 여러 번 돌려 위치 오차 RMS 를 구하기 (DOP·σ 의 검증용)
 */
import { cvModel, dareSteadyState } from './kf';
import { Vec } from './linalg';
import { gaussNewtonRange, gaussNewtonTdoa, pairsFor } from './positioning';
import { Rng } from './rng';
import { TdoaRateParams } from './updateRate';

/**
 * TDoA: 앵커가 슬롯마다 한 대씩 차례로 송신하고, 모든 태그가 모든 패킷을 듣는다.
 * 태그마다 들은 패킷 수와, 모든 앵커가 한 번씩 송신한 "프레임"이 끝난 횟수를 센다.
 */
export function simulateTdoaSchedule(p: TdoaRateParams, nTags: number, duration: number) {
  const perTagPackets = new Array<number>(nTags).fill(0);
  const perTagFrames = new Array<number>(nTags).fill(0);
  const events: { t: number; anchor: number }[] = [];
  let t = 0, a = 0;
  while (t + p.slotTime <= duration + 1e-12) {
    t += p.slotTime;
    for (let i = 0; i < nTags; i++) {
      perTagPackets[i]++;
      if (a === p.nAnchors - 1) perTagFrames[i]++;
    }
    if (events.length < 5000) events.push({ t, anchor: a });
    a = (a + 1) % p.nAnchors;
  }
  return { perTagPackets, perTagFrames, events };
}

/**
 * 갱신율 rateHz 로 위치 측정(1σ = measSigma)이 들어올 때, 1축 등속(CV) 모델의 칼만 필터가 내는
 * 위치 추정 오차의 RMS(갱신 직후)를 시뮬레이션으로 구한다.
 * 참값은 cvModel 의 가정 그대로(구간마다 일정한 가속도, 평균 0·표준편차 sigmaA)로 만들고,
 * 필터는 정상상태 칼만 이득(dareSteadyState 의 K)으로 duration 초 동안 돌린다. 앞쪽 20% 는 버린다.
 */
export function simulateRateError(measSigma: number, rateHz: number, sigmaA: number, duration = 300, seed = 1): number {
  if (!(measSigma > 0) || !(rateHz > 0)) return measSigma;
  const dt = 1 / rateHz;
  const { F, Q } = cvModel(dt, sigmaA, 1);
  const { K } = dareSteadyState(F, [[1, 0]], Q, [[measSigma * measSigma]]);
  const kp = K[0][0], kv = K[1][0];
  const steps = Math.max(3000, Math.round(duration * rateHz));
  const burn = Math.floor(steps * 0.2);
  const rng = new Rng(seed);
  let p = 0, v = 0, xp = 0, xv = 0, sum = 0, n = 0;
  for (let k = 0; k < steps; k++) {
    // 참값: 이 구간의 가속도 a 는 아무도 모른다
    const a = rng.gauss(0, sigmaA);
    p += v * dt + 0.5 * a * dt * dt;
    v += a * dt;
    // 필터: 등속으로 예측한 뒤 측정으로 고친다
    xp += xv * dt;
    const innov = p + rng.gauss(0, measSigma) - xp;
    xp += kp * innov;
    xv += kv * innov;
    if (k >= burn) { const e = xp - p; sum += e * e; n++; }
  }
  return Math.sqrt(sum / Math.max(n, 1));
}

/**
 * 점 p 에서 측정에 잡음(1σ = sigma, 측정마다 독립)을 넣고 가우스-뉴턴으로 위치를 구하는 일을 trials 번 반복해
 * 수평·수직 위치 오차의 RMS 를 돌려준다. TDoA 는 dopTdoa 와 같은 고리(ring) 쌍을 쓴다.
 */
export function positionErrorMc(mode: 'twr' | 'tdoa', anchors: Vec[], p: Vec, sigma: number, trials = 150, seed = 1): { rmsH: number; rmsV: number } {
  const rng = new Rng(seed);
  const d = anchors.map((a) => Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]));
  const pairs = pairsFor(anchors.length, 'ring');
  let sh = 0, sv = 0, n = 0;
  for (let k = 0; k < trials; k++) {
    const res = mode === 'twr'
      ? gaussNewtonRange(anchors, d.map((v) => v + rng.gauss(0, sigma)), p.slice(), { maxIter: 25 })
      : gaussNewtonTdoa(anchors, pairs, pairs.map(([i, j]) => d[j] - d[i] + rng.gauss(0, sigma)), p.slice(), { maxIter: 25 });
    const ex = res.x[0] - p[0], ey = res.x[1] - p[1], ez = res.x[2] - p[2];
    if (!Number.isFinite(ex + ey + ez)) continue;
    sh += ex * ex + ey * ey; sv += ez * ez; n++;
  }
  return n ? { rmsH: Math.sqrt(sh / n), rmsV: Math.sqrt(sv / n) } : { rmsH: NaN, rmsV: NaN };
}
