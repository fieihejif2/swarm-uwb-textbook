/** 전역 설정 → 대형 시뮬레이션 파라미터. 0장의 4단계(완벽 → 지연 → 노이즈 → 손실) 토글을 지원한다. */
import { computeBudget, commHops } from './budget';
import { SystemConfig } from './config';
import { formationOffsets } from './formation';
import { adjacency } from './graph';
import { Vec, vadd } from './linalg';
import { NO_LOSS } from './loss';
import { Rng } from './rng';
import { SwarmParams, defaultSwarmParams } from './swarm';

export interface StageFlags { delay: boolean; noise: boolean; loss: boolean }

export interface ScenarioOptions {
  T?: number;
  seed?: number;
  /** 초기 대형 흐트러짐 [m] */
  initialScatter?: number;
  gustSigma?: number;
  /** 지연 배율(슬라이더용) */
  delayScale?: number;
  /** 게인을 설정값 대신 직접 지정 */
  gain?: number;
  cbf?: SwarmParams['cbf'];
  dt?: number;
}

/** 대형 중심이 강당 안의 원형 경로를 순항 속도로 돈다 */
export function circuitVelocity(cfg: SystemConfig): (t: number) => Vec {
  const R = Math.max(1, Math.min(cfg.hall.x, cfg.hall.y) / 4);
  const w = cfg.formation.cruiseSpeed / R;
  return (t) => [cfg.formation.cruiseSpeed * Math.cos(w * t), cfg.formation.cruiseSpeed * Math.sin(w * t), 0];
}

export function swarmFromConfig(cfg: SystemConfig, stage: StageFlags, opt: ScenarioOptions = {}): SwarmParams {
  const b = computeBudget(cfg);
  const offsets = formationOffsets(cfg.formation.shape, cfg.formation.spacing, cfg.nDrones);
  const R = Math.max(1, Math.min(cfg.hall.x, cfg.hall.y) / 4);
  const start: Vec = [cfg.hall.x / 2, cfg.hall.y / 2 - R, cfg.formation.height];
  const rng = new Rng((opt.seed ?? 1) * 7919 + 13);
  const scatter = opt.initialScatter ?? 0.3;
  const p0 = offsets.map((o) => vadd(vadd(o, start), [rng.range(-scatter, scatter), rng.range(-scatter, scatter), 0]));
  const anyStage = stage.delay || stage.noise || stage.loss;
  const delay = commHops(cfg) * cfg.comm.delayMean + (cfg.comm.topology === 'ground' ? cfg.estimation.latency : 0);
  return defaultSwarmParams({
    adjacency: adjacency(cfg.comm.graph, cfg.nDrones),
    offsets, p0,
    gain: opt.gain ?? cfg.comm.gain,
    refVel: circuitVelocity(cfg),
    dt: opt.dt ?? 0.005,
    T: opt.T ?? 30,
    arch: anyStage ? cfg.comm.topology : 'ideal',
    delay: stage.delay ? delay * (opt.delayScale ?? 1) : 0,
    jitter: stage.delay ? commHops(cfg) * cfg.comm.delayJitter * (opt.delayScale ?? 1) : 0,
    posSigma: stage.noise ? b.sigmaEstH / Math.SQRT2 : 0,
    posRate: stage.noise ? Math.min(b.posRate, 100) : 0,
    commRate: anyStage ? cfg.comm.rate : 0,
    loss: stage.loss ? cfg.comm.loss : NO_LOSS,
    vMax: cfg.vehicle.vMax,
    gustSigma: opt.gustSigma ?? 0.1,
    gustTau: 1.0,
    extrapolate: cfg.safety.extrapolate,
    cbf: opt.cbf ?? { mode: 'off', dMin: cfg.vehicle.envelope, alpha: 2, kz: cfg.safety.downwashRatio, E: 0 },
    collisionDist: cfg.vehicle.envelope,
    kz: cfg.safety.downwashRatio,
    seed: opt.seed ?? 1,
  });
}
