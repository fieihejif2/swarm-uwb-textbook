/** 시뮬레이션 엔진(src/sim)의 단위 테스트. Node 에서 돈다(UI 와 분리된 순수 모듈임을 보장). */
import { describe, expect, it } from 'vitest';
import * as S from '../src/sim/index';

describe('난수와 통계', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = new S.Rng(42), b = new S.Rng(42);
    for (let i = 0; i < 100; i++) expect(a.normal()).toBe(b.normal());
  });
  it('정규 난수의 평균·표준편차', () => {
    const r = new S.Rng(7);
    const x = Array.from({ length: 200000 }, () => r.gauss(2, 3));
    expect(S.mean(x)).toBeCloseTo(2, 1);
    expect(S.std(x)).toBeCloseTo(3, 1);
  });
  it('분위수는 numpy 선형보간 방식과 같다', () => {
    expect(S.quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(S.quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
});

describe('UWB 거리 측정', () => {
  it('1 ns 는 약 0.2998 m', () => expect(S.C_LIGHT * 1e-9).toBeCloseTo(0.2998, 4));
  it('클럭 오차가 없으면 SS/DS-TWR 모두 참값', () => {
    expect(S.ssTwr(7.5, 400e-6, { eA: 0, eB: 0 }).err).toBeCloseTo(0, 6);
    expect(S.dsTwr(7.5, 400e-6, 300e-6, { eA: 0, eB: 0 }).err).toBeCloseTo(0, 6);
  });
  it('클럭 오차가 있으면 SS-TWR 은 수십 cm~m, DS-TWR 은 mm 이하', () => {
    const clk = { eA: 10e-6, eB: -10e-6 };
    expect(Math.abs(S.ssTwr(10, 500e-6, clk).err)).toBeGreaterThan(1);
    expect(Math.abs(S.dsTwr(10, 500e-6, 500e-6, clk).err)).toBeLessThan(1e-3);
    expect(S.ssTwr(10, 500e-6, clk).err).toBeCloseTo(S.ssTwrDriftError(500e-6, clk), 2);
  });
});

describe('위치 추정과 DOP', () => {
  const hall = { x: 20, y: 15, z: 8 };
  const anchors = S.defaultAnchors(hall, 8);
  it('가우스-뉴턴이 참값으로 수렴한다 (거리, TDoA)', () => {
    const p = [6, 9, 1.7];
    const g = S.gaussNewtonRange(anchors, anchors.map((a) => S.dist(p, a)), [10, 7, 3]);
    expect(S.dist(g.x, p)).toBeLessThan(1e-7);
    const pairs = S.pairsFor(8, 'ring');
    const t = S.gaussNewtonTdoa(anchors, pairs, pairs.map(([i, j]) => S.tdoaOf(p, anchors[i], anchors[j])), [10, 7, 3]);
    expect(S.dist(t.x, p)).toBeLessThan(1e-7);
  });
  it('앵커가 모두 같은 높이면: 그 높이 근처에서는 수직을 풀 수 없고, TDoA 는 어디서나 수직이 나쁘다', () => {
    const same = S.defaultAnchors(hall, 8, true);
    expect(S.dopRange(same, [8, 6, same[0][2]]).vdop).toBe(Infinity);
    expect(S.dopRange(same, [8, 6, same[0][2] - 0.5]).vdop).toBeGreaterThan(3 * S.dopRange(anchors, [8, 6, same[0][2] - 0.5]).vdop);
    expect(S.dopTdoa(same, [8, 6, 1.5]).vdop).toBeGreaterThan(3 * S.dopTdoa(anchors, [8, 6, 1.5]).vdop);
  });
  it('TDoA 는 앵커 상자 밖에서 DOP 가 급격히 나빠진다', () => {
    const small = S.defaultAnchors({ x: 6, y: 6, z: 3 }, 8);
    const inside = S.dopTdoa(small, [3, 3, 1.2]).pdop, outside = S.dopTdoa(small, [14, 3, 1.2]).pdop;
    expect(outside).toBeGreaterThan(5 * inside);
    expect(S.insideAnchorBox(small, [3, 3, 1.2])).toBe(true);
    expect(S.insideAnchorBox(small, [14, 3, 1.2])).toBe(false);
  });
  it('DOP × σ 가 몬테카를로 위치 오차와 맞는다', () => {
    const p = [8, 6, 1.5], sigma = 0.1, rng = new S.Rng(3);
    const dop = S.dopRange(anchors, p);
    let sh = 0, sv = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const g = S.gaussNewtonRange(anchors, anchors.map((a) => S.dist(p, a) + rng.gauss(0, sigma)), p);
      sh += (g.x[0] - p[0]) ** 2 + (g.x[1] - p[1]) ** 2; sv += (g.x[2] - p[2]) ** 2;
    }
    expect(Math.sqrt(sh / N) / (dop.hdop * sigma)).toBeCloseTo(1, 1);
    expect(Math.sqrt(sv / N) / (dop.vdop * sigma)).toBeCloseTo(1, 1);
  });
});

describe('갱신율 모델', () => {
  it('TWR 은 태그 수에 반비례, TDoA 는 무관', () => {
    const r1 = S.twrRate({ nTags: 1, nAnchors: 8, rangeTime: 0.002 }), r5 = S.twrRate({ nTags: 5, nAnchors: 8, rangeTime: 0.002 });
    expect(r1.positionRate / r5.positionRate).toBeCloseTo(5, 10);
    expect(S.tdoaRate({ nAnchors: 8, slotTime: 0.002 }).positionRate).toBeCloseTo(62.5, 10);
  });
});

describe('NLOS 와 게이팅', () => {
  it('게이트 통과 통계가 몬테카를로와 맞는다', () => {
    const m = { sigma: 0.1, pNlos: 0.2, biasMean: 0.5 }, k = 3, rng = new S.Rng(5);
    const st = S.gatedErrorStats(m, k);
    let acc = 0, s2 = 0, s1 = 0;
    const N = 400000;
    for (let i = 0; i < N; i++) { const e = S.sampleRangeError(rng, m).err; if (Math.abs(e) <= k * m.sigma) { acc++; s1 += e; s2 += e * e; } }
    expect(acc / N).toBeCloseTo(st.acceptRate, 2);
    expect(Math.sqrt(s2 / acc)).toBeCloseTo(st.rmsAccepted, 2);
    expect(s1 / acc).toBeCloseTo(st.meanAccepted, 2);
  });
  it('선분-상자 교차 판정', () => {
    const box = { min: [4, 4, 0], max: [6, 6, 2] };
    expect(S.segmentHitsBox([0, 5, 1], [10, 5, 1], box)).toBe(true);
    expect(S.segmentHitsBox([0, 5, 3], [10, 5, 3], box)).toBe(false);
    expect(S.segmentHitsBox([0, 0, 1], [3, 3, 1], box)).toBe(false);
  });
});

describe('칼만 필터', () => {
  it('정상상태 공분산은 리카티 방정식의 고정점이다', () => {
    const { F, Q } = S.cvModel(0.02, 1, 1);
    const H = [[1, 0]], R = [[0.01]];
    const { Pprior, Ppost } = S.dareSteadyState(F, H, Q, R);
    const again = S.madd(S.matmul(S.matmul(F, Ppost), S.transpose(F)), Q);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(again[i][j]).toBeCloseTo(Pprior[i][j], 10);
  });
  it('지연 측정을 버퍼 후 재전파하면 제때 받은 것과 같은 결과가 된다', () => {
    const { F, Q } = S.cvModel(0.05, 0.5, 1);
    const H = [[1, 0]], R = [[0.04]];
    const a = new S.BufferedKf([0, 0], S.eye(2), F, Q), b = new S.BufferedKf([0, 0], S.eye(2), F, Q);
    const rng = new S.Rng(9);
    const zs = Array.from({ length: 40 }, (_, k) => [0.3 * k * 0.05 + rng.gauss(0, 0.2)]);
    const d = 4;
    for (let k = 0; k < 40; k++) {
      a.step(); b.step();
      a.updateNow(H, zs[k], R);                       // 제때
      if (k >= d) b.updateDelayed(H, zs[k - d], R, d); // d 스텝 늦게, 올바르게 처리
    }
    for (let k = 40 - d; k < 40; k++) b.updateDelayed(H, zs[k], R, 39 - k);
    expect(b.state.x[0]).toBeCloseTo(a.state.x[0], 9);
    expect(b.state.P[0][0]).toBeCloseTo(a.state.P[0][0], 9);
  });
  it('융합 시뮬레이션: tight EKF 오차가 UWB 단독보다 작고 NIS 가 1 근처', () => {
    const cfg = S.defaultConfig();
    const r = S.simulateFusion({
      anchors: cfg.anchors, hall: cfg.hall, height: 1.5, uwbMode: 'twr', coupling: 'tight', nlos: { sigma: 0.1, pNlos: 0, biasMean: 0 },
      uwbRate: 10, imuRate: 100, accelNoiseTrue: 0.3, accelNoiseFilter: 0.3, measSigmaFilter: 0.1, gateK: 0, robust: false, speed: 1, T: 60, seed: 4,
    });
    expect(r.rmse).toBeLessThan(0.08);
    expect(r.meanNis).toBeGreaterThan(0.6);
    expect(r.meanNis).toBeLessThan(1.6);
  });
});

describe('그래프와 합의', () => {
  it('라플라시안 고유값', () => {
    expect(S.laplacianSpectrum(S.laplacian(S.adjacency('complete', 5)))[4]).toBeCloseTo(5, 10);
    expect(S.lambda2(S.laplacian(S.adjacency('star', 5)))).toBeCloseTo(1, 10);
    expect(S.lambdaMax(S.laplacian(S.adjacency('ring', 5)))).toBeCloseTo(3.618034, 5);
  });
  it('지연 한계 안쪽은 수렴, 바깥쪽은 발산', () => {
    const A = S.adjacency('complete', 5), x0 = [1, -1, 0.5, 0, -0.5];
    const tau = S.delayMargin(S.laplacian(A), 1);
    expect(S.isDiverging(S.simulateConsensus({ A, x0, gain: 1, tau: 0.9 * tau, dt: 0.001, T: 40 }))).toBe(false);
    expect(S.isDiverging(S.simulateConsensus({ A, x0, gain: 1, tau: 1.1 * tau, dt: 0.001, T: 40 }))).toBe(true);
  });
  it('평균은 보존된다', () => {
    const r = S.simulateConsensus({ A: S.adjacency('path', 5), x0: [1, 2, 3, 4, 10], gain: 1, tau: 0.05, dt: 0.001, T: 60 });
    expect(S.mean(r.x[r.x.length - 1])).toBeCloseTo(4, 6);
    expect(r.disagreement[r.disagreement.length - 1]).toBeLessThan(1e-6);
  });
});

describe('손실 모델', () => {
  it('연속 손실 분위수: 베르누이 p=0.1 → 3 패킷', () => {
    expect(S.burstLengthQuantile({ model: 'bernoulli', p: 0.1, pGB: 0, pBG: 1, lossGood: 0, lossBad: 1 }, 1e-3)).toBe(3);
    expect(S.burstLengthQuantile(S.NO_LOSS)).toBe(0);
  });
});

describe('안전: CBF', () => {
  it('오차가 없으면 기본 CBF 로도 최소 거리를 지킨다', () => {
    const r = S.simulateCbfPair({ dMin: 0.5, kz: 2, vMax: 1, eps: 0, ageMax: 0, alpha: 3, dt: 0.01, T: 20, mode: 'basic', startDist: 4 }, 5);
    expect(r.violated).toBe(false);
    expect(r.reached).toBe(true);
  });
  it('필터는 속도 한계를 넘지 않는다', () => {
    const rng = new S.Rng(1);
    for (let i = 0; i < 2000; i++) {
      const u = S.cbfFilter({ pSelf: rng.inBall(3, 2), pOther: rng.inBall(3, 2), uNom: rng.inBall(3, 3), dMin: 0.6, alpha: 2, kz: 2.5, vMax: 1, E: 0.1 }).u;
      expect(S.norm(u)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('설정과 오차 예산', () => {
  it('기본 설정이 검증을 통과하고 왕복 변환해도 같다', () => {
    const c = S.defaultConfig();
    const { config, warnings } = S.sanitizeConfig(JSON.parse(JSON.stringify(c)));
    expect(warnings).toEqual([]);
    expect(config).toEqual(c);
  });
  it('형식이 틀린 값은 기본값을 유지한다', () => {
    const { config, warnings } = S.sanitizeConfig({ hall: { x: 'big' }, uwb: { mode: 'gps', sigmaTdoa: 0.2 }, anchors: [[1, 2]] });
    expect(config.hall.x).toBe(20);
    expect(config.uwb.mode).toBe('tdoa');
    expect(config.uwb.sigmaTdoa).toBe(0.2);
    expect(warnings).toEqual(expect.arrayContaining(['hall.x', 'uwb.mode', 'anchors']));
  });
  it('예산: 노이즈·지연·손실이 커지면 권장 간격이 커진다', () => {
    const c = S.defaultConfig();
    const b0 = S.computeBudget(c).minSepH;
    const up = (f: (x: S.SystemConfig) => void) => { const x = structuredClone(c); f(x); return S.computeBudget(x).minSepH; };
    expect(up((x) => { x.uwb.sigmaTdoa *= 3; })).toBeGreaterThan(b0);
    expect(up((x) => { x.comm.delayMean *= 3; })).toBeGreaterThan(b0);
    expect(up((x) => { x.comm.loss.pBG /= 3; })).toBeGreaterThan(b0);
    expect(up((x) => { x.vehicle.envelope += 0.1; })).toBeCloseTo(b0 + 0.1, 9);
  });
  it('TWR 로 5대를 띄우면 드론당 위치 갱신율이 1/5 이 된다', () => {
    const c = S.defaultConfig();
    c.uwb.mode = 'twr';
    const one = S.positionRate({ ...c, nDrones: 1 }), five = S.positionRate(c);
    expect(one / five).toBeCloseTo(5, 9);
  });
  it('대형 시뮬레이션은 시드가 같으면 결과가 같다', () => {
    const c = S.defaultConfig();
    const run = () => S.simulateSwarm({ ...S.swarmFromConfig(c, { delay: true, noise: true, loss: true }, { seed: 5, T: 5 }), recordEvery: 1e9 });
    expect(run().minDistOverall).toBe(run().minDistOverall);
  });
});
