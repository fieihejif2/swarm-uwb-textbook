/** 오차 예산: 설정 → 챕터별 항목 → 권장 최소 간격. 교재의 뼈대. */
import { SystemConfig } from './config';
import { delayMargin, adjacency, laplacian, lambda2, lambdaMax } from './graph';
import { steadyStatePosSigma } from './kf';
import { burstLengthQuantile, stationaryLossRate } from './loss';
import { gatedErrorStats } from './nlos';
import { Dop, dopFor } from './positioning';
import { tdoaRate, twrRate } from './updateRate';
import { C_LIGHT, ssTwrDriftError } from './uwb';

export type BudgetKind =
  /** 평균 0 인 무작위 오차(1σ) — 제곱합으로 더한다 */
  | 'random'
  /** 시간이 지나도 평균되지 않는 편향 — 그대로 더한다 */
  | 'bias'
  /** 지연×속도처럼 크기가 정해지는 항 — 그대로 더한다 */
  | 'deterministic'
  /** 기체 크기·여유 */
  | 'geometry'
  /** 다른 항목의 입력이 되는 중간값(합계에 직접 들어가지 않음) */
  | 'info';

export interface BudgetItem {
  id: string;
  chapter: number;
  kind: BudgetKind;
  value: number;
  unit: 'm' | 's' | 'Hz' | '';
  /** 수직 방향 값이 따로 있을 때 */
  valueV?: number;
  /** KaTeX 수식 */
  formula: string;
  /** 이 값을 만든 입력 설정 키(출처 배지 연결용) */
  inputs: string[];
}

export interface Budget {
  items: BudgetItem[];
  dop: Dop;
  sigmaMeas: number;
  sigmaEff: number;
  posRate: number;
  sigmaPosH: number;
  sigmaPosV: number;
  sigmaEstH: number;
  sigmaEstV: number;
  /** 이웃 정보의 최대 나이 [s] */
  ageMax: number;
  /** 합의 루프의 총 지연 [s] */
  loopDelay: number;
  /** 합의 지연 한계 τ* [s] */
  delayMargin: number;
  lambda2: number;
  lambdaN: number;
  lossRate: number;
  /** 권장 최소 수평 간격(중심 간) [m] */
  minSepH: number;
  /** 권장 최소 수직 간격(중심 간) [m] */
  minSepV: number;
  /** 현재 대형 간격이 권장값 이상인가 */
  spacingOk: boolean;
  delayOk: boolean;
}

/** 이웃 정보가 건너는 무선 구간 수: 지상국 중계 2, 직접 통신 1 */
export const commHops = (cfg: SystemConfig): number => (cfg.comm.topology === 'ground' ? 2 : 1);

/** 설정에서 드론당 위치 갱신율 [Hz] 을 계산한다 (3장 모델) */
export function positionRate(cfg: SystemConfig): number {
  const nA = cfg.anchors.length;
  return cfg.uwb.mode === 'twr'
    ? twrRate({ nTags: cfg.nDrones, nAnchors: nA, rangeTime: cfg.uwb.twrRangeTime }).positionRate
    : tdoaRate({ nAnchors: nA, slotTime: cfg.uwb.tdoaSlotTime }).positionRate;
}

export function computeBudget(cfg: SystemConfig): Budget {
  const items: BudgetItem[] = [];
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const sigmaMeas = cfg.uwb.mode === 'twr' ? cfg.uwb.sigmaTwr : cfg.uwb.sigmaTdoa;
  const k = cfg.safety.kSigma;

  // ── 1장: 거리 측정
  const drift = cfg.uwb.clockDriftPpm * 1e-6;
  items.push({ id: 'range-noise', chapter: 1, kind: 'info', value: sigmaMeas, unit: 'm', formula: '\\sigma_r', inputs: [cfg.uwb.mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'] });
  items.push({
    id: 'clock-drift', chapter: 1, kind: 'info',
    value: Math.abs(ssTwrDriftError(cfg.uwb.replyDelay, { eA: drift, eB: -drift })), unit: 'm',
    formula: '\\Delta d_{\\text{SS}} \\approx \\tfrac{1}{2} c\\,(e_A - e_B)\\,T_{\\text{reply}}', inputs: ['uwb.clockDriftPpm', 'uwb.replyDelay'],
  });

  // ── 4장: NLOS 와 게이팅 → 유효 거리 오차 (2장보다 먼저 계산해 σ_eff 를 넘긴다)
  const gs = gatedErrorStats({ sigma: sigmaMeas, pNlos: cfg.uwb.pNlos, biasMean: cfg.uwb.nlosBiasMean }, cfg.uwb.gateSigma);
  const sigmaEff = gs.rmsAccepted;

  // ── 2장: 기하(DOP)
  const dop = dopFor(cfg.uwb.mode, cfg.anchors, center);
  const sigmaPosH = dop.hdop * sigmaEff, sigmaPosV = dop.vdop * sigmaEff;
  items.push({ id: 'dop', chapter: 2, kind: 'info', value: dop.hdop, valueV: dop.vdop, unit: '', formula: '\\text{HDOP},\\ \\text{VDOP}', inputs: ['anchors', 'uwb.mode', 'formation.height'] });

  // ── 3장: 갱신율
  const posRate = positionRate(cfg);
  items.push({
    id: 'pos-rate', chapter: 3, kind: 'info', value: posRate, unit: 'Hz',
    formula: cfg.uwb.mode === 'twr' ? 'f_{\\text{pos}} = \\dfrac{1}{N_{\\text{tag}}\\,N_{\\text{anc}}\\,T_{\\text{range}}}' : 'f_{\\text{pos}} = \\dfrac{1}{N_{\\text{anc}}\\,T_{\\text{slot}}}',
    inputs: cfg.uwb.mode === 'twr' ? ['uwb.twrRangeTime', 'anchors'] : ['uwb.tdoaSlotTime', 'anchors'],
  });

  items.push({ id: 'sigma-eff', chapter: 4, kind: 'info', value: sigmaEff, unit: 'm', formula: '\\sigma_{\\text{eff}} = \\sqrt{\\mathbb{E}[e^2 \\mid \\tx{게이트 통과}{passes gate}]}', inputs: ['uwb.pNlos', 'uwb.nlosBiasMean', 'uwb.gateSigma'] });
  items.push({ id: 'raw-pos', chapter: 4, kind: 'info', value: sigmaPosH, valueV: sigmaPosV, unit: 'm', formula: '\\sigma_{\\text{pos}} = \\text{DOP}\\cdot\\sigma_{\\text{eff}}', inputs: [] });

  // ── 5장: 융합 후 추정 오차
  const sigmaEstH = steadyStatePosSigma(sigmaPosH, posRate, cfg.estimation.accelNoise);
  const sigmaEstV = steadyStatePosSigma(sigmaPosV, posRate, cfg.estimation.accelNoise);
  items.push({ id: 'est-sigma', chapter: 5, kind: 'random', value: sigmaEstH, valueV: sigmaEstV, unit: 'm', formula: '\\sigma_{\\text{est}} = \\sqrt{P_\\infty^{+}[p,p]}', inputs: ['estimation.accelNoise'] });

  // ── 6장: 앵커 측량 오차(편향)와 측위 지연
  const anchorBiasH = dop.hdop * cfg.uwb.anchorSurveyError, anchorBiasV = dop.vdop * cfg.uwb.anchorSurveyError;
  items.push({ id: 'anchor-bias', chapter: 6, kind: 'bias', value: anchorBiasH, valueV: anchorBiasV, unit: 'm', formula: 'b_{\\text{anc}} \\approx \\text{DOP}\\cdot\\delta_{\\text{anc}}', inputs: ['uwb.anchorSurveyError'] });
  const estLag = cfg.safety.relSpeed * cfg.estimation.latency;
  items.push({ id: 'est-latency', chapter: 6, kind: 'deterministic', value: estLag, unit: 'm', formula: 'v_{\\text{rel}}\\,\\tau_{\\text{est}}', inputs: ['estimation.latency', 'safety.relSpeed'] });

  // ── 7장: 통신 지연·손실
  // 지상국 중계는 정보가 기체→지상→기체로 두 번 건너가므로 편도 지연이 두 번 든다
  const tauMax = commHops(cfg) * (cfg.comm.delayMean + cfg.comm.delayJitter);
  const period = 1 / cfg.comm.rate;
  const burst = burstLengthQuantile(cfg.comm.loss, 1e-3);
  const gap = burst * period;
  const ageMax = tauMax + period + gap;
  const dv = cfg.safety.extrapolate ? 0.5 * cfg.vehicle.aMax : cfg.safety.relSpeed;
  const commLag = cfg.safety.extrapolate ? dv * (tauMax + period) ** 2 : dv * (tauMax + period);
  const gapLag = cfg.safety.extrapolate ? 0.5 * cfg.vehicle.aMax * (ageMax ** 2 - (tauMax + period) ** 2) : cfg.safety.relSpeed * gap;
  items.push({
    id: 'comm-delay', chapter: 7, kind: 'deterministic', value: commLag, unit: 'm',
    formula: cfg.safety.extrapolate ? '\\tfrac{1}{2} a_{\\max}\\,(\\tau_c + T_c)^2' : 'v_{\\text{rel}}\\,(\\tau_c + T_c)', inputs: ['comm.delayMean', 'comm.delayJitter', 'comm.rate', 'comm.topology', 'safety.relSpeed'],
  });
  items.push({
    id: 'comm-gap', chapter: 7, kind: 'deterministic', value: gapLag, unit: 'm',
    formula: cfg.safety.extrapolate ? '\\tfrac{1}{2} a_{\\max}\\,(t_{\\text{age}}^2 - (\\tau_c + T_c)^2)' : 'v_{\\text{rel}}\\,L_{99.9}\\,T_c', inputs: ['comm.loss', 'comm.rate'],
  });
  const A = adjacency(cfg.comm.graph, cfg.nDrones), L = laplacian(A);
  const margin = delayMargin(L, cfg.comm.gain);
  // 지상국 중계: 측위 지연 + 왕복 통신 지연이 루프 전체에 걸린다. P2P: 이웃 정보만 지연(안정성 한계는 적용되지 않음).
  // 안정성에 쓰는 유효 지연: 평균 지연 + 표본 유지(ZOH)의 평균 지연 T/2
  const loopDelay = cfg.estimation.latency + commHops(cfg) * cfg.comm.delayMean + period / 2;
  items.push({ id: 'delay-margin', chapter: 7, kind: 'info', value: margin, unit: 's', formula: '\\tau^{*} = \\dfrac{\\pi}{2\\,k\\,\\lambda_N}', inputs: ['comm.gain', 'comm.graph'] });

  // ── 8장: 합계
  const body = cfg.vehicle.envelope;
  items.push({ id: 'body', chapter: 8, kind: 'geometry', value: body, valueV: body * cfg.safety.downwashRatio, unit: 'm', formula: 'd_{\\text{body}},\\ k_z\\,d_{\\text{body}}', inputs: ['vehicle.envelope', 'safety.downwashRatio'] });
  items.push({ id: 'tracking', chapter: 8, kind: 'random', value: cfg.safety.trackingError, unit: 'm', formula: '\\sigma_{\\text{trk}}', inputs: ['safety.trackingError'] });
  items.push({ id: 'margin', chapter: 8, kind: 'geometry', value: cfg.safety.margin, unit: 'm', formula: 'd_{\\text{margin}}', inputs: ['safety.margin'] });
  const sep = (sigEst: number, anchorBias: number, bodyLen: number) => {
    // 두 기체의 독립 무작위 오차: √2 · kσ · sqrt(σ_est² + σ_trk²)
    const rand = k * Math.SQRT2 * Math.hypot(sigEst, cfg.safety.trackingError);
    return bodyLen + rand + anchorBias + estLag + commLag + gapLag + cfg.safety.margin;
  };
  const minSepH = sep(sigmaEstH, anchorBiasH, body);
  const minSepV = sep(sigmaEstV, anchorBiasV, body * cfg.safety.downwashRatio);
  items.push({
    id: 'min-sep', chapter: 8, kind: 'info', value: minSepH, valueV: minSepV, unit: 'm',
    formula: 'd_{\\min} = d_{\\text{body}} + k_\\sigma\\sqrt{2}\\sqrt{\\sigma_{\\text{est}}^2+\\sigma_{\\text{trk}}^2} + b_{\\text{anc}} + v_{\\text{rel}}\\tau_{\\text{est}} + \\Delta_{\\text{comm}} + \\Delta_{\\text{gap}} + d_{\\text{margin}}', inputs: ['safety.kSigma'],
  });

  return {
    items, dop, sigmaMeas, sigmaEff, posRate, sigmaPosH, sigmaPosV, sigmaEstH, sigmaEstV, ageMax, loopDelay,
    delayMargin: margin, lambda2: lambda2(L), lambdaN: lambdaMax(L), lossRate: stationaryLossRate(cfg.comm.loss),
    minSepH, minSepV, spacingOk: cfg.formation.spacing >= minSepH,
    delayOk: cfg.comm.topology === 'p2p' || loopDelay < margin,
  };
}
/** 9장 등에서 참고용으로 쓰는 값: 1 ns 가 몇 m 인가 */
export const METERS_PER_NS = C_LIGHT * 1e-9;
