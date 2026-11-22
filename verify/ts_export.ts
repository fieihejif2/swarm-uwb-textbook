/**
 * TypeScript 엔진(src/sim)의 결과를 JSON 으로 내보낸다.
 * verify.py 가 같은 입력으로 독립 기준 구현(numpy/scipy)을 돌려 비교한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/sim/index';

const here = dirname(fileURLToPath(import.meta.url));
const out: Record<string, unknown> = {};
const rng = new S.Rng(20261122);

// 1) DS-TWR / SS-TWR
out.twr = [
  { d: 3.0, reply1: 400e-6, reply2: 400e-6, eA: 20e-6, eB: -20e-6 },
  { d: 12.5, reply1: 300e-6, reply2: 700e-6, eA: 5e-6, eB: 18e-6 },
  { d: 25.0, reply1: 1000e-6, reply2: 250e-6, eA: -12e-6, eB: 7e-6 },
  { d: 0.4, reply1: 500e-6, reply2: 500e-6, eA: 0, eB: 0 },
].map((c) => ({ in: c, ds: S.dsTwr(c.d, c.reply1, c.reply2, c), ss: S.ssTwr(c.d, c.reply1, c) }));

// 2) 가우스-뉴턴
const hall = { x: 20, y: 15, z: 8 };
const anchors8 = S.defaultAnchors(hall, 8);
const anchors6 = S.defaultAnchors({ x: 10, y: 8, z: 4 }, 6);
const gnCases: unknown[] = [];
for (const [anchors, truth] of [[anchors8, [7.2, 5.1, 1.6]], [anchors8, [15.5, 11.0, 3.2]], [anchors6, [4.0, 3.0, 1.2]], [anchors6, [8.2, 6.5, 2.4]]] as [number[][], number[]][]) {
  const x0 = truth.map((v) => v + rng.range(-2, 2));
  const exact = anchors.map((a) => S.dist(truth, a));
  const noisy = exact.map((r) => r + rng.gauss(0, 0.1));
  const pairs = S.pairsFor(anchors.length, 'ring');
  const tExact = pairs.map(([i, j]) => exact[j] - exact[i]);
  const tNoisy = tExact.map((v) => v + rng.gauss(0, 0.05));
  gnCases.push({
    anchors, truth, x0, ranges_exact: exact, ranges_noisy: noisy, pairs, tdoa_exact: tExact, tdoa_noisy: tNoisy,
    ts_range_exact: S.gaussNewtonRange(anchors, exact, x0).x,
    ts_range_noisy: S.gaussNewtonRange(anchors, noisy, x0).x,
    ts_tdoa_exact: S.gaussNewtonTdoa(anchors, pairs, tExact, x0).x,
    ts_tdoa_noisy: S.gaussNewtonTdoa(anchors, pairs, tNoisy, x0).x,
  });
}
out.gn = gnCases;

// 3) DOP
const sameH = S.defaultAnchors(hall, 8, true);
out.dop = [[anchors8, [10, 7.5, 1.5]], [anchors8, [3, 2, 4]], [anchors8, [19, 14, 0.8]], [sameH, [10, 7.5, 1.5]], [anchors6, [5, 4, 1.5]]].map(([a, p]) => ({
  anchors: a, p,
  range: S.dopRange(a as number[][], p as number[]),
  tdoa_ring: S.dopTdoa(a as number[][], p as number[], 'ring'),
  tdoa_all: S.dopTdoa(a as number[][], p as number[], 'all'),
  pseudorange: S.dopPseudorange(a as number[][], p as number[]),
}));

// 4) 갱신율
out.rate = [1, 2, 5, 10].flatMap((nTags) => [6, 8].map((nAnchors) => {
  const p = { nTags, nAnchors, rangeTime: 0.004 };
  const sched = S.simulateTwrSchedule(p, 20);
  return { in: { ...p, slotTime: 0.002, duration: 20 }, twr: S.twrRate(p), tdoa: S.tdoaRate({ nAnchors, slotTime: 0.002 }), sched_ranges: sched.perTagRanges, sched_rounds: sched.perTagRounds };
}));

// 5) KF 정상상태
const kfCases: unknown[] = [];
for (const [dt, sa, sm, dims] of [[0.02, 1.0, 0.1, 1], [0.1, 0.3, 0.3, 1], [0.005, 2.0, 0.05, 1], [0.05, 1.0, 0.2, 2]] as number[][]) {
  const { F, Q } = S.cvModel(dt, sa, dims);
  const H = S.zeros(dims, 2 * dims);
  for (let i = 0; i < dims; i++) H[i][i] = 1;
  const R = S.diag(new Array(dims).fill(sm * sm));
  const r = S.dareSteadyState(F, H, Q, R);
  kfCases.push({ F, H, Q, R, Pprior: r.Pprior, Ppost: r.Ppost, K: r.K, sigma_fn: dims === 1 ? S.steadyStatePosSigma(sm, 1 / dt, sa) : null });
}
out.kf = kfCases;

// 6) 합의 지연 한계  7) λ₂ 수렴 속도
const graphs: S.GraphKind[] = ['complete', 'ring', 'star', 'path'];
const consensus: unknown[] = [];
for (const g of graphs) {
  for (const gain of g === 'complete' ? [1, 2] : [1]) {
    const A = S.adjacency(g, 5), L = S.laplacian(A);
    const x0 = [0.9, -0.4, 0.3, -1.0, 0.55];
    const dt = 0.0005;
    const theory = S.delayMargin(L, gain);
    const crit = S.findCriticalDelay({ A, x0, gain, dt, T: 150 }, 2 * theory);
    const dt2 = 0.001;
    const res = S.simulateConsensus({ A, x0, gain, tau: 0, dt: dt2, T: 80 / gain, recordEvery: 10 });
    const d0 = res.disagreement[0];
    const idx = res.disagreement.map((d, i) => (d < 1e-3 * d0 && d > 1e-8 * d0 ? i : -1)).filter((i) => i >= 0);
    const fit = S.fitDecayRate(idx.map((i) => res.t[i]), idx.map((i) => res.disagreement[i]));
    consensus.push({ graph: g, A, x0, gain, dt, tau_sim: crit.tau, tau_lo: crit.lo, tau_hi: crit.hi, tau_theory_ts: theory, spectrum_ts: S.laplacianSpectrum(L), decay_dt: dt2, decay_fit: fit.rate, decay_points: idx.length });
  }
}
out.consensus = consensus;
// 이웃만 지연되는 형태는 지연이 커도 발산하지 않아야 한다(지연 무관 안정)
out.neighborOnly = graphs.map((g) => {
  const A = S.adjacency(g, 5);
  const r = S.simulateConsensus({ A, x0: [0.9, -0.4, 0.3, -1.0, 0.55], gain: 1, tau: 3.0, dt: 0.001, T: 300, mode: 'neighborOnly', recordEvery: 50 });
  return { graph: g, final_ratio: r.disagreement[r.disagreement.length - 1] / r.disagreement[0] };
});

// 8) 손실 모델
out.loss = ([
  { model: 'ge', p: 0, pGB: 0.02, pBG: 0.3, lossGood: 0.01, lossBad: 0.8 },
  { model: 'ge', p: 0, pGB: 0.05, pBG: 0.1, lossGood: 0.0, lossBad: 1.0 },
  { model: 'ge', p: 0, pGB: 0.002, pBG: 0.05, lossGood: 0.02, lossBad: 0.5 },
  { model: 'bernoulli', p: 0.07, pGB: 0, pBG: 1, lossGood: 0, lossBad: 1 },
] as S.LossParams[]).map((m, i) => {
  const n = 2_000_000;
  const seq = S.simulateLoss(m, n, 100 + i);
  let lost = 0;
  for (let k = 0; k < n; k++) lost += seq[k];
  const runs = S.lossRunLengths(seq);
  return { in: m, n, sim_rate: lost / n, analytic_ts: S.stationaryLossRate(m), mean_run: runs.reduce((a, b) => a + b, 0) / runs.length, burst_q: S.burstLengthQuantile(m, 1e-3) };
});

// 9) CBF
const base = { dMin: 0.6, kz: 2, vMax: 1.0, eps: 0.05, ageMax: 0.05 };
const design = S.cbfRobustDesign(base);
const cbfP: S.CbfPairParams = { ...base, alpha: 0.9 * design.alphaMax, dt: 0.01, T: 40, mode: 'robust', startDist: 4 };
const runs = Array.from({ length: 2000 }, (_, i) => S.simulateCbfPair(cbfP, 1000 + i));
const basicRuns = Array.from({ length: 500 }, (_, i) => S.simulateCbfPair({ ...cbfP, mode: 'basic', alpha: 4 }, 1000 + i));
const offRuns = Array.from({ length: 200 }, (_, i) => S.simulateCbfPair({ ...cbfP, mode: 'off' }, 1000 + i));
const detP: S.CbfPairParams = { ...cbfP, eps: 0, ageMax: 0, init: { pA: [2, 0.05, 1.5], pB: [-2, 0, 1.4] } };
const det = S.simulateCbfPair(detP, 1, true);
out.cbf = {
  params: cbfP, design,
  robust_min: Math.min(...runs.map((r) => r.minDist)), robust_violations: runs.filter((r) => r.violated).length,
  robust_infeasible: runs.reduce((a, r) => a + r.infeasibleSteps, 0), robust_reached: runs.filter((r) => r.reached).length, robust_n: runs.length,
  basic_violations: basicRuns.filter((r) => r.violated).length, basic_n: basicRuns.length,
  off_violations: offRuns.filter((r) => r.violated).length, off_n: offRuns.length,
  det_params: detP, det_min: det.minDist, det_final_A: det.pA[det.pA.length - 1], det_final_B: det.pB[det.pB.length - 1],
};

// 10) (추가) 게이트 통과 오차 통계
out.gate = [[0.1, 0.05, 0.4, 3], [0.15, 0.2, 0.3, 3], [0.1, 0.1, 0.5, 0], [0.05, 0.3, 1.0, 2]].map(([sigma, pNlos, biasMean, k]) => ({
  in: { sigma, pNlos, biasMean, k }, ts: S.gatedErrorStats({ sigma, pNlos, biasMean }, k),
}));

mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'ts_results.json'), JSON.stringify(out));
console.log('[verify] TypeScript 엔진 결과 → verify/out/ts_results.json');
