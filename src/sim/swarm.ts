/**
 * 0·7·8장 공용: N대 대형 유지 시뮬레이션.
 * 운동 모델: 속도 명령을 따르는 질점 ṗ = u + (돌풍 외란), ‖u‖ ≤ vMax.
 * 대형 제어: u_i = v_ref + k Σ_j a_ij [(x_j − c_j) − (x_i − c_i)]  (합의 기반 대형 제어)
 * 여기서 x 는 "제어기가 알고 있는" 위치이며, 구조(arch)에 따라 지연·노이즈·손실이 섞인다.
 */
import { Mat, Vec, norm, vadd, vscale, vsub } from './linalg';
import { LossParams, LossProcess, NO_LOSS } from './loss';
import { Rng } from './rng';
import { cbfFilter, clipNorm, ellipsoidDistance } from './safety';

export type SwarmArch =
  /** 모든 기체가 모든 참값을 즉시 안다 */
  | 'ideal'
  /** 지상국 중계: 위치가 지상 PC로 내려갔다가 명령이 올라온다. 자기 위치를 포함한 모든 정보가 같은 지연을 겪는다 */
  | 'ground'
  /** 기체 간 직접 통신: 자기 위치는 온보드 추정값을 바로 쓰고 이웃 위치만 지연된다 */
  | 'p2p';

export interface SwarmParams {
  adjacency: Mat;
  gain: number;
  offsets: Vec[];
  p0: Vec[];
  /** 대형 전체의 기준 속도 [m/s] (모두가 미리 아는 궤적의 속도) */
  refVel: (t: number) => Vec;
  dt: number;
  T: number;
  arch: SwarmArch;
  /** 통신(루프) 지연 평균 [s] */
  delay: number;
  /** 지연 지터: 평균 ± jitter 의 균등분포 [s] */
  jitter: number;
  /** 위치 추정 노이즈 표준편차(축당) [m] */
  posSigma: number;
  /** 위치 추정 갱신율 [Hz] (0 이하면 매 스텝) */
  posRate: number;
  /** 위치 방송(텔레메트리) 주기 [Hz] (0 이하면 매 스텝) */
  commRate: number;
  loss: LossParams;
  vMax: number;
  /** 돌풍 외란 속도의 표준편차 [m/s] 와 상관 시간 [s] */
  gustSigma: number;
  gustTau: number;
  /** 이웃 위치 외삽(받은 속도 × 정보 나이) 사용 여부 */
  extrapolate: boolean;
  cbf: { mode: 'off' | 'basic' | 'robust'; dMin: number; alpha: number; kz: number; E: number };
  /** 이 거리(타원체 거리) 아래로 가까워지면 충돌로 센다 [m] */
  collisionDist: number;
  kz: number;
  seed: number;
  recordEvery?: number;
}

export interface SwarmResult {
  t: number[];
  /** pos[r][i] = r번째 기록 시각의 i번 기체 위치 */
  pos: Vec[][];
  /** 대형 오차(RMS) [m] */
  formationError: number[];
  /** 가장 가까운 두 기체 사이의 타원체 거리 [m] */
  minDist: number[];
  /** 전체 구간 최소 이격거리 */
  minDistOverall: number;
  /** 뒤쪽 절반 구간의 대형 오차 RMS */
  steadyError: number;
  /** 충돌(이격거리 < collisionDist)이 처음 일어난 시각. 없으면 null */
  firstCollisionTime: number | null;
  /** 수신된 패킷 비율 */
  deliveredRatio: number;
}

interface Packet { pos: Vec; vel: Vec; tSend: number; tArrive: number }
interface Link { queue: Packet[]; last: Packet | null; loss: LossProcess }

export const defaultSwarmParams = (over: Partial<SwarmParams> & Pick<SwarmParams, 'adjacency' | 'offsets' | 'p0'>): SwarmParams => ({
  gain: 1, refVel: () => [0, 0, 0], dt: 0.005, T: 20, arch: 'ideal', delay: 0, jitter: 0,
  posSigma: 0, posRate: 0, commRate: 0, loss: NO_LOSS, vMax: 2, gustSigma: 0, gustTau: 1,
  extrapolate: false, cbf: { mode: 'off', dMin: 0.3, alpha: 2, kz: 1, E: 0 }, collisionDist: 0.15, kz: 1,
  seed: 1, ...over,
});

export function formationErrorOf(pos: Vec[], offsets: Vec[]): number {
  const n = pos.length;
  const q = pos.map((p, i) => vsub(p, offsets[i]));
  const c = q[0].map((_, k) => q.reduce((s, v) => s + v[k], 0) / n);
  return Math.sqrt(q.reduce((s, v) => s + norm(vsub(v, c)) ** 2, 0) / n);
}
export function minEllipsoidDistance(pos: Vec[], kz: number): number {
  let m = Infinity;
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) m = Math.min(m, ellipsoidDistance(vsub(pos[i], pos[j]), kz));
  return m;
}

export function simulateSwarm(prm: SwarmParams): SwarmResult {
  const n = prm.p0.length;
  const rng = new Rng(prm.seed);
  const steps = Math.round(prm.T / prm.dt);
  const every = prm.recordEvery ?? Math.max(1, Math.round(steps / 600));
  const posEvery = prm.posRate > 0 ? Math.max(1, Math.round(1 / (prm.posRate * prm.dt))) : 1;
  const commEvery = prm.commRate > 0 ? Math.max(1, Math.round(1 / (prm.commRate * prm.dt))) : 1;
  let p = prm.p0.map((v) => v.slice());
  let est = p.map((v) => v.slice());
  let u: Vec[] = p.map(() => [0, 0, 0]);
  let gust: Vec[] = p.map(() => [0, 0, 0]);
  // 링크: ground 는 기체당 1개(자기 포함 모든 소비자가 공유), p2p 는 방향별(j→i) 1개
  const mkLink = (): Link => ({ queue: [], last: null, loss: new LossProcess(prm.loss, rng) });
  const groundLinks: Link[] = Array.from({ length: n }, mkLink);
  const p2pLinks: Link[][] = Array.from({ length: n }, () => Array.from({ length: n }, mkLink));
  let sent = 0, delivered = 0;
  const res: SwarmResult = { t: [], pos: [], formationError: [], minDist: [], minDistOverall: Infinity, steadyError: 0, firstCollisionTime: null, deliveredRatio: 1 };
  const send = (link: Link, j: number, t: number) => {
    sent++;
    if (link.loss.next()) return;
    delivered++;
    const dly = Math.max(0, prm.delay + (prm.jitter > 0 ? rng.range(-prm.jitter, prm.jitter) : 0));
    link.queue.push({ pos: est[j].slice(), vel: u[j].slice(), tSend: t, tArrive: t + dly });
  };
  const deliver = (link: Link, t: number) => {
    if (!link.queue.length) return;
    const keep: Packet[] = [];
    for (const pk of link.queue) {
      if (pk.tArrive <= t + 1e-12) { if (!link.last || pk.tSend > link.last.tSend) link.last = pk; }
      else keep.push(pk);
    }
    link.queue = keep;
  };
  const known = (pk: Packet | null, t: number): Vec | null =>
    pk ? (prm.extrapolate ? vadd(pk.pos, vscale(pk.vel, t - pk.tSend)) : pk.pos) : null;
  const gustA = prm.gustTau > 0 ? Math.exp(-prm.dt / prm.gustTau) : 0;
  const gustB = prm.gustSigma * Math.sqrt(1 - gustA * gustA);
  let errSq = 0, errN = 0;
  for (let k = 0; k <= steps; k++) {
    const t = k * prm.dt;
    // 1) 온보드 위치 추정 갱신
    if (k % posEvery === 0) est = p.map((q) => (prm.posSigma > 0 ? q.map((v) => v + rng.gauss(0, prm.posSigma)) : q.slice()));
    // 2) 방송
    if (prm.arch !== 'ideal' && k % commEvery === 0) {
      for (let j = 0; j < n; j++) {
        if (prm.arch === 'ground') send(groundLinks[j], j, t);
        else for (let i = 0; i < n; i++) if (i !== j) send(p2pLinks[j][i], j, t);
      }
    }
    // 3) 수신
    if (prm.arch === 'ground') for (const l of groundLinks) deliver(l, t);
    else if (prm.arch === 'p2p') for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (i !== j) deliver(p2pLinks[j][i], t);
    // 4) 제어
    const view = (i: number, j: number): Vec | null => {
      if (prm.arch === 'ideal') return p[j];
      if (prm.arch === 'ground') return known(groundLinks[j].last, t);
      return i === j ? est[i] : known(p2pLinks[j][i].last, t);
    };
    const ff = prm.refVel(t);
    const uNew: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const xi = view(i, i);
      let cmd = ff.slice();
      if (xi) {
        for (let j = 0; j < n; j++) {
          const a = prm.adjacency[i][j];
          if (!a) continue;
          const xj = view(i, j);
          if (!xj) continue;
          const e = vsub(vsub(xj, prm.offsets[j]), vsub(xi, prm.offsets[i]));
          cmd = vadd(cmd, vscale(e, prm.gain * a));
        }
      }
      cmd = clipNorm(cmd, prm.vMax);
      if (prm.cbf.mode !== 'off' && xi) {
        // 먼 이웃부터 차례로 투영해 가장 가까운 이웃의 제약이 마지막에 적용되게 한다(다중 제약의 간단한 근사)
        const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i)
          .map((j) => ({ j, x: view(i, j) })).filter((o): o is { j: number; x: Vec } => !!o.x)
          .sort((a, b) => norm(vsub(xi, b.x)) - norm(vsub(xi, a.x)));
        for (const o of others) {
          cmd = cbfFilter({ pSelf: xi, pOther: o.x, uNom: cmd, dMin: prm.cbf.dMin, alpha: prm.cbf.alpha, kz: prm.cbf.kz, vMax: prm.vMax, E: prm.cbf.mode === 'robust' ? prm.cbf.E : 0 }).u;
        }
      }
      uNew.push(cmd);
    }
    u = uNew;
    // 5) 기록
    const fe = formationErrorOf(p, prm.offsets);
    const md = minEllipsoidDistance(p, prm.kz);
    if (md < res.minDistOverall) res.minDistOverall = md;
    if (res.firstCollisionTime === null && md < prm.collisionDist) res.firstCollisionTime = t;
    if (k >= steps / 2) { errSq += fe * fe; errN++; }
    if (k % every === 0) { res.t.push(t); res.pos.push(p.map((q) => q.slice())); res.formationError.push(fe); res.minDist.push(md); }
    // 6) 적분
    for (let i = 0; i < n; i++) {
      if (prm.gustSigma > 0) gust[i] = gust[i].map((g) => gustA * g + gustB * rng.normal());
      p[i] = vadd(p[i], vscale(vadd(u[i], gust[i]), prm.dt));
    }
    if (!Number.isFinite(p[0][0])) break;
  }
  res.steadyError = Math.sqrt(errSq / Math.max(errN, 1));
  res.deliveredRatio = sent ? delivered / sent : 1;
  return res;
}
