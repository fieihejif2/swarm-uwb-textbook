/** 교재 전체가 공유하는 "우리 시스템" 설정. 단위는 SI (m, s, kg, Hz). */
import { Vec } from './linalg';
import { FormationShape } from './formation';
import { GraphKind } from './graph';
import { LossParams } from './loss';

export interface SystemConfig {
  version: 1;
  /** 강당 크기 [m] */
  hall: { x: number; y: number; z: number };
  /** 앵커 3D 위치 [m] */
  anchors: Vec[];
  nDrones: number;
  uwb: {
    mode: 'twr' | 'tdoa';
    /** TWR 거리 측정 노이즈 1σ [m] */
    sigmaTwr: number;
    /** TDoA(거리차) 측정 노이즈 1σ [m] */
    sigmaTdoa: number;
    /** NLOS 발생 확률 */
    pNlos: number;
    /** NLOS 양의 편향 평균(지수분포) [m] */
    nlosBiasMean: number;
    /** 마할라노비스 게이트 문턱(σ 단위). 0 = 게이팅 끔 */
    gateSigma: number;
    /** TWR 거리 1회 측정에 걸리는 시간 [s] */
    twrRangeTime: number;
    /** TDoA 앵커 송신 슬롯 길이 [s] */
    tdoaSlotTime: number;
    /** 앵커 좌표 측량 오차 1σ(축당) [m] */
    anchorSurveyError: number;
    /** 클럭 주파수 오차 [ppm] */
    clockDriftPpm: number;
    /** TWR 응답 지연 [s] */
    replyDelay: number;
  };
  estimation: {
    /** 측위→비행제어기 지연 [s] */
    latency: number;
    /** 가속도 프로세스 노이즈 1σ [m/s²] */
    accelNoise: number;
  };
  comm: {
    /** ground = 지상국(Crazyradio) 중계, p2p = 기체 간 직접 */
    topology: 'ground' | 'p2p';
    graph: GraphKind;
    /** 기체 상태 방송/명령 주기 [Hz] */
    rate: number;
    /** 통신 지연 평균 [s] */
    delayMean: number;
    /** 지연 지터(평균 ± 값, 균등분포) [s] */
    delayJitter: number;
    loss: LossParams;
    /** 합의(대형 유지) 게인 k [1/s] */
    gain: number;
  };
  vehicle: {
    preset: 'cf21bl' | 'custom';
    /** 모터 대각 축간 거리 [m] */
    diag: number;
    /** 프로펠러·가드까지 포함한 전체 폭 [m] */
    envelope: number;
    /** 이륙 질량 [kg] */
    mass: number;
    vMax: number;
    aMax: number;
    /** 비행시간 [s] */
    flightTime: number;
  };
  formation: {
    shape: FormationShape;
    /** 이웃 기체 사이 목표 간격 [m] */
    spacing: number;
    /** 비행 고도 [m] */
    height: number;
    /** 대형 이동 속도 [m/s] */
    cruiseSpeed: number;
  };
  safety: {
    /** 무작위 오차에 곱하는 신뢰 배수(3 = 3σ) */
    kSigma: number;
    /** 다운워시 타원체의 수직/수평 비율 */
    downwashRatio: number;
    /** 기체 사이 상대속도 가정 [m/s] */
    relSpeed: number;
    /** 제어 추종 오차 1σ [m] */
    trackingError: number;
    /** 추가 여유 [m] */
    margin: number;
    /** 이웃 위치 외삽 사용 */
    extrapolate: boolean;
  };
}

/** 강당 모서리에 앵커를 배치한다: 아래쪽 4개 + 위쪽 4개 (서로 다른 높이). n < 8 이면 앞에서부터 사용. */
export function defaultAnchors(hall: { x: number; y: number; z: number }, n = 8, sameHeight = false): Vec[] {
  const lo = 0.5, hi = Math.max(hall.z - 1.0, 1.0);
  const corners: [number, number][] = [[0, 0], [hall.x, 0], [hall.x, hall.y], [0, hall.y]];
  const mids: [number, number][] = [[hall.x / 2, 0], [hall.x, hall.y / 2], [hall.x / 2, hall.y], [0, hall.y / 2]];
  const all: Vec[] = [];
  if (sameHeight) {
    // 흔한 실수 재현용: 모서리와 벽 중간에 모두 같은 높이로 단다
    [...corners, ...mids].forEach(([x, y]) => all.push([x, y, hi]));
    corners.forEach(([x, y]) => all.push([x + (hall.x / 2 - x) / 2, y + (hall.y / 2 - y) / 2, hi]));
  } else {
    // 번갈아 가며 낮게/높게 → 4개만 써도 높이가 섞인다
    corners.forEach(([x, y], i) => all.push([x, y, i % 2 ? hi : lo]));
    corners.forEach(([x, y], i) => all.push([x, y, i % 2 ? lo : hi]));
    // 8개를 넘으면 벽 중간에 추가
    mids.forEach(([x, y], i) => all.push([x, y, i % 2 ? lo : hi]));
  }
  return all.slice(0, n).map((a) => a.slice());
}

export interface VehiclePreset { id: 'cf21bl' | 'custom'; diag: number; envelope: number; mass: number; vMax: number; aMax: number; flightTime: number }
/**
 * Crazyflie 2.1 Brushless: diag·mass·flightTime 은 데이터시트(문헌) 값, 나머지는 예시값.
 * 출처 표시는 src/sources.ts 의 FIELD_SOURCES 가 담당한다.
 */
export const VEHICLE_PRESETS: Record<'cf21bl' | 'heavy', VehiclePreset> = {
  cf21bl: { id: 'cf21bl', diag: 0.1, envelope: 0.24, mass: 0.037, vMax: 1.0, aMax: 3.0, flightTime: 600 },
  heavy: { id: 'custom', diag: 0.45, envelope: 0.7, mass: 1.2, vMax: 5.0, aMax: 5.0, flightTime: 900 },
};

export function defaultConfig(): SystemConfig {
  const hall = { x: 20, y: 15, z: 8 };
  return {
    version: 1,
    hall,
    anchors: defaultAnchors(hall, 8),
    nDrones: 5,
    uwb: {
      mode: 'tdoa', sigmaTwr: 0.1, sigmaTdoa: 0.15, pNlos: 0.05, nlosBiasMean: 0.4, gateSigma: 3,
      twrRangeTime: 0.002, tdoaSlotTime: 0.002, anchorSurveyError: 0.02, clockDriftPpm: 10, replyDelay: 0.0005,
    },
    estimation: { latency: 0.01, accelNoise: 1.0 },
    comm: {
      topology: 'ground', graph: 'complete', rate: 20, delayMean: 0.02, delayJitter: 0.005,
      loss: { model: 'ge', p: 0.05, pGB: 0.02, pBG: 0.3, lossGood: 0.01, lossBad: 0.8 },
      gain: 1.5,
    },
    vehicle: { preset: 'cf21bl', ...pickVehicle(VEHICLE_PRESETS.cf21bl) },
    formation: { shape: 'v', spacing: 1.0, height: 1.5, cruiseSpeed: 0.5 },
    safety: { kSigma: 3, downwashRatio: 2.5, relSpeed: 0.5, trackingError: 0.05, margin: 0.05, extrapolate: false },
  };
}
function pickVehicle(p: VehiclePreset) {
  return { diag: p.diag, envelope: p.envelope, mass: p.mass, vMax: p.vMax, aMax: p.aMax, flightTime: p.flightTime };
}
export function applyVehiclePreset(cfg: SystemConfig, key: 'cf21bl' | 'heavy'): SystemConfig {
  const p = VEHICLE_PRESETS[key];
  return { ...cfg, vehicle: { preset: p.id, ...pickVehicle(p) } };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/**
 * 불러온 JSON 을 검증하면서 기본값 위에 덮어쓴다. 모르는 키는 무시, 형식이 틀린 값은 기본값 유지.
 * 반환: 정리된 설정과 무시된 항목 목록.
 */
export function sanitizeConfig(raw: unknown): { config: SystemConfig; warnings: string[] } {
  const base = defaultConfig();
  const warnings: string[] = [];
  const merge = (dst: any, src: any, path: string) => {
    if (src === null || typeof src !== 'object') return;
    for (const key of Object.keys(dst)) {
      if (!(key in src)) continue;
      const d = dst[key], s = src[key], here = path ? `${path}.${key}` : key;
      if (key === 'anchors') {
        if (Array.isArray(s) && s.length >= 4 && s.length <= 16 && s.every((a) => Array.isArray(a) && a.length === 3 && a.every(isNum))) dst[key] = s.map((a: number[]) => a.slice());
        else warnings.push(here);
      } else if (typeof d === 'number') {
        if (isNum(s)) dst[key] = s; else warnings.push(here);
      } else if (typeof d === 'boolean') {
        if (typeof s === 'boolean') dst[key] = s; else warnings.push(here);
      } else if (typeof d === 'string') {
        if (typeof s === 'string' && (ENUMS[here] ? ENUMS[here].includes(s) : true)) dst[key] = s; else warnings.push(here);
      } else if (typeof d === 'object') merge(d, s, here);
    }
  };
  merge(base, raw, '');
  base.version = 1;
  base.nDrones = 5;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  base.hall.x = clamp(base.hall.x, 2, 100); base.hall.y = clamp(base.hall.y, 2, 100); base.hall.z = clamp(base.hall.z, 2, 30);
  base.uwb.pNlos = clamp(base.uwb.pNlos, 0, 1);
  base.comm.rate = clamp(base.comm.rate, 1, 1000);
  base.comm.loss.p = clamp(base.comm.loss.p, 0, 1);
  base.comm.loss.pGB = clamp(base.comm.loss.pGB, 0, 1);
  base.comm.loss.pBG = clamp(base.comm.loss.pBG, 1e-4, 1);
  base.comm.loss.lossGood = clamp(base.comm.loss.lossGood, 0, 1);
  base.comm.loss.lossBad = clamp(base.comm.loss.lossBad, 0, 1);
  base.safety.downwashRatio = clamp(base.safety.downwashRatio, 1, 10);
  return { config: base, warnings };
}
const ENUMS: Record<string, string[]> = {
  'uwb.mode': ['twr', 'tdoa'],
  'comm.topology': ['ground', 'p2p'],
  'comm.graph': ['complete', 'ring', 'star', 'path'],
  'comm.loss.model': ['none', 'bernoulli', 'ge'],
  'vehicle.preset': ['cf21bl', 'custom'],
  'formation.shape': ['line', 'v', 'pentagon', 'cross', 'stack'],
};
