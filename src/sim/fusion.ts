/** 5장: UWB + IMU 융합 시뮬레이션 (EKF, 상태 = [p(3), v(3)]). */
import { Mat, Vec, dist, inv, matmul, norm, transpose, vsub, zeros } from './linalg';
import { KfState, cvModel, ekfScalarUpdate, kfPredict, kfUpdate, rangeModel, tdoaModel } from './kf';
import { NlosModel, huberWeight, sampleRangeError, sampleTdoaError } from './nlos';
import { gaussNewtonRange, gaussNewtonTdoa, pairsFor, rangeGeometry, tdoaGeometry } from './positioning';
import { Rng } from './rng';

export interface FusionParams {
  anchors: Vec[];
  hall: { x: number; y: number; z: number };
  height: number;
  uwbMode: 'twr' | 'tdoa';
  /** tight: 거리(또는 거리차)를 하나씩 EKF 에 넣는다. loose: 먼저 위치를 풀고 위치를 넣는다. */
  coupling: 'tight' | 'loose';
  /** 실제 측정 모델 */
  nlos: NlosModel;
  /** 한 바퀴(모든 앵커/쌍) 측정 주기의 역수 [Hz] */
  uwbRate: number;
  /** IMU(예측) 주기의 역수 [Hz] */
  imuRate: number;
  /** 실제 가속도계 잡음 1σ [m/s²] */
  accelNoiseTrue: number;
  /** 필터가 가정하는 가속도 잡음 1σ (Q 튜닝) */
  accelNoiseFilter: number;
  /** 필터가 가정하는 측정 잡음 1σ (R 튜닝) [m] */
  measSigmaFilter: number;
  /** 게이트 문턱(σ). 0 = 끔 */
  gateK: number;
  /** 후버 강건 갱신 사용 */
  robust: boolean;
  /** 궤적 속도 배율 */
  speed: number;
  T: number;
  seed: number;
}
export interface FusionResult {
  t: number[];
  truth: Vec[];
  est: Vec[];
  /** 추정 공분산의 위치 부분 대각 원소 */
  pDiag: Vec[];
  /** xy 평면 공분산 [pxx, pxy, pyy] */
  pXY: Vec[];
  /** UWB 만으로 푼 위치(있을 때) */
  fixes: { t: number; p: Vec }[];
  err: number[];
  rmse: number;
  rmseH: number;
  rmseV: number;
  /** 평균 NIS (정규화 혁신 제곱). 필터가 일관되면 1 근처 */
  meanNis: number;
  rejected: number;
  total: number;
}

/** 강당 안의 리사주 궤적(위치·가속도 해석식) */
export function lissajous(hall: { x: number; y: number; z: number }, height: number, speed: number) {
  const c = [hall.x / 2, hall.y / 2, height];
  const A = [hall.x * 0.3, hall.y * 0.3, Math.min(0.5, height * 0.3)];
  const w = [0.25 * speed, 0.5 * speed, 0.35 * speed];
  return {
    pos: (t: number): Vec => [0, 1, 2].map((k) => c[k] + A[k] * Math.sin(w[k] * t)),
    vel: (t: number): Vec => [0, 1, 2].map((k) => A[k] * w[k] * Math.cos(w[k] * t)),
    acc: (t: number): Vec => [0, 1, 2].map((k) => -A[k] * w[k] * w[k] * Math.sin(w[k] * t)),
  };
}

export function simulateFusion(prm: FusionParams): FusionResult {
  const rng = new Rng(prm.seed);
  const dt = 1 / prm.imuRate;
  const steps = Math.round(prm.T / dt);
  const measEvery = Math.max(1, Math.round(prm.imuRate / prm.uwbRate));
  const traj = lissajous(prm.hall, prm.height, prm.speed);
  const { F, Q, B } = cvModel(dt, prm.accelNoiseFilter, 3);
  const pairs = pairsFor(prm.anchors.length, 'ring');
  const r = prm.measSigmaFilter ** 2;
  const p0 = traj.pos(0), v0 = traj.vel(0);
  let s: KfState = { x: [p0[0] + 0.5, p0[1] - 0.5, p0[2] + 0.3, v0[0], v0[1], v0[2]], P: zeros(6, 6) };
  for (let i = 0; i < 3; i++) { s.P[i][i] = 1; s.P[i + 3][i + 3] = 1; }
  const out: FusionResult = { t: [], truth: [], est: [], pDiag: [], pXY: [], fixes: [], err: [], rmse: 0, rmseH: 0, rmseV: 0, meanNis: 0, rejected: 0, total: 0 };
  let se = 0, seH = 0, seV = 0, cnt = 0, nisSum = 0, nisN = 0;
  const Hpos: Mat = [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0]];
  for (let k = 1; k <= steps; k++) {
    const t = k * dt;
    // 예측: 가속도계 측정(참값 + 잡음)을 입력으로
    const aMeas = traj.acc(t - dt).map((a) => a + rng.gauss(0, prm.accelNoiseTrue));
    const Bu = B.map((row) => row.reduce((acc, b, j) => acc + b * aMeas[j], 0));
    s = kfPredict(s, F, Q, Bu);
    if (k % measEvery === 0) {
      const p = traj.pos(t);
      if (prm.uwbMode === 'twr') {
        const z = prm.anchors.map((a) => dist(p, a) + sampleRangeError(rng, prm.nlos).err);
        if (prm.coupling === 'tight') {
          prm.anchors.forEach((a, i) => {
            const m = rangeModel(s.x, a, 3);
            const pre = ekfScalarUpdate(s, m.h, m.H, z[i], r, prm.gateK);
            const w = prm.robust ? huberWeight(pre.innov, pre.S) : 1;
            const u = w < 1 ? ekfScalarUpdate(s, m.h, m.H, z[i], r, prm.gateK, w) : pre;
            out.total++; if (!u.accepted) out.rejected++;
            nisSum += u.nis; nisN++;
            s = u.state;
          });
        } else {
          const g = gaussNewtonRange(prm.anchors, z, s.x.slice(0, 3));
          out.fixes.push({ t, p: g.x });
          const H = rangeGeometry(prm.anchors, g.x);
          looseUpdate(g.x, H);
        }
      } else {
        const z = pairs.map(([i, j]) => dist(p, prm.anchors[j]) - dist(p, prm.anchors[i]) + sampleTdoaError(rng, prm.nlos).err);
        if (prm.coupling === 'tight') {
          pairs.forEach(([i, j], q) => {
            const m = tdoaModel(s.x, prm.anchors[i], prm.anchors[j], 3);
            const pre = ekfScalarUpdate(s, m.h, m.H, z[q], r, prm.gateK);
            const w = prm.robust ? huberWeight(pre.innov, pre.S) : 1;
            const u = w < 1 ? ekfScalarUpdate(s, m.h, m.H, z[q], r, prm.gateK, w) : pre;
            out.total++; if (!u.accepted) out.rejected++;
            nisSum += u.nis; nisN++;
            s = u.state;
          });
        } else {
          const g = gaussNewtonTdoa(prm.anchors, pairs, z, s.x.slice(0, 3));
          out.fixes.push({ t, p: g.x });
          looseUpdate(g.x, tdoaGeometry(prm.anchors, g.x, pairs));
        }
      }
    }
    const p = traj.pos(t);
    const e = vsub(s.x.slice(0, 3), p);
    se += norm(e) ** 2; seH += e[0] ** 2 + e[1] ** 2; seV += e[2] ** 2; cnt++;
    if (k % 2 === 0) {
      out.t.push(t); out.truth.push(p); out.est.push(s.x.slice(0, 3)); out.err.push(norm(e));
      out.pDiag.push([s.P[0][0], s.P[1][1], s.P[2][2]]);
      out.pXY.push([s.P[0][0], s.P[0][1], s.P[1][1]]);
    }
  }
  out.rmse = Math.sqrt(se / cnt); out.rmseH = Math.sqrt(seH / cnt); out.rmseV = Math.sqrt(seV / cnt);
  out.meanNis = nisN ? nisSum / nisN : NaN;
  return out;

  function looseUpdate(fix: Vec, H: Mat) {
    let R: Mat;
    try {
      R = inv(matmul(transpose(H), H)).map((row) => row.map((v) => v * r));
    } catch {
      return;
    }
    out.total++;
    const u = kfUpdate(s, Hpos, fix, R);
    // 3자유도 NIS 를 자유도로 나눠 스칼라 NIS 와 같은 눈금으로
    const Sinv = inv(u.S);
    const nis = u.innov.reduce((acc, vi, i) => acc + vi * u.innov.reduce((a2, vj, j) => a2 + Sinv[i][j] * vj, 0), 0) / 3;
    if (prm.gateK > 0 && nis > prm.gateK * prm.gateK) { out.rejected++; return; }
    nisSum += nis; nisN++;
    s = u.state;
  }
}
