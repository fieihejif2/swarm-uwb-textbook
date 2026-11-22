/** 전역 설정 패널의 입력 필드 정의: 표시 이름, 단위, 범위, 출처. */
import { SrcRef, der, ex, lit } from '../sources';
import { L } from './i18n';
import { measured } from './store';

export interface FieldMeta {
  path: string;
  label: L;
  /** 화면 표시 단위 */
  unit: string;
  /** 표시값 = 내부값(SI) × scale */
  scale: number;
  min: number;
  max: number;
  step: number;
  group: 'hall' | 'uwb' | 'est' | 'comm' | 'vehicle' | 'formation' | 'safety';
  /** 값이 litValue(SI)와 같을 때만 문헌 배지를 단다. 다르면 사용자가 바꾼 예시값. */
  lit?: { ref: () => SrcRef; value: number };
  help?: L;
}
const F = (path: string, ko: string, en: string, unit: string, scale: number, min: number, max: number, step: number, group: FieldMeta['group'], extra: Partial<FieldMeta> = {}): FieldMeta =>
  ({ path, label: { ko, en }, unit, scale, min, max, step, group, ...extra });

export const FIELDS: FieldMeta[] = [
  F('hall.x', '강당 가로 (x)', 'Hall length (x)', 'm', 1, 2, 100, 0.5, 'hall'),
  F('hall.y', '강당 세로 (y)', 'Hall width (y)', 'm', 1, 2, 100, 0.5, 'hall'),
  F('hall.z', '강당 높이 (z)', 'Hall height (z)', 'm', 1, 2, 30, 0.5, 'hall'),

  F('uwb.sigmaTwr', 'TWR 거리 노이즈 σ', 'TWR range noise σ', 'cm', 100, 0.5, 100, 0.5, 'uwb'),
  F('uwb.sigmaTdoa', 'TDoA 거리차 노이즈 σ', 'TDoA range-difference noise σ', 'cm', 100, 0.5, 100, 0.5, 'uwb'),
  F('uwb.pNlos', 'NLOS 발생 확률', 'NLOS probability', '%', 100, 0, 100, 1, 'uwb'),
  F('uwb.nlosBiasMean', 'NLOS 편향 평균', 'Mean NLOS bias', 'cm', 100, 0, 300, 1, 'uwb'),
  F('uwb.gateSigma', '게이트 문턱 (0 = 끔)', 'Gate threshold (0 = off)', 'σ', 1, 0, 10, 0.5, 'uwb'),
  F('uwb.twrRangeTime', 'TWR 거리 1회 시간', 'Time per TWR range', 'ms', 1000, 0.5, 50, 0.5, 'uwb', { lit: { ref: () => lit('lps-docs', 'twr-ranging-rate'), value: 0.002 } }),
  F('uwb.tdoaSlotTime', 'TDoA 앵커 슬롯 길이', 'TDoA anchor slot length', 'ms', 1000, 0.5, 50, 0.5, 'uwb', { lit: { ref: () => lit('lps-docs', 'tdoa2-slot-timing'), value: 0.002 } }),
  F('uwb.anchorSurveyError', '앵커 좌표 측량 오차 (1σ)', 'Anchor survey error (1σ)', 'cm', 100, 0, 50, 0.5, 'uwb'),
  F('uwb.clockDriftPpm', '클럭 주파수 오차', 'Clock frequency error', 'ppm', 1, 0, 100, 1, 'uwb'),
  F('uwb.replyDelay', 'TWR 응답 지연', 'TWR reply delay', 'µs', 1e6, 50, 5000, 50, 'uwb'),

  F('estimation.latency', '측위→비행제어기 지연', 'Positioning-to-FC latency', 'ms', 1000, 0, 500, 1, 'est'),
  F('estimation.accelNoise', '가속도 프로세스 노이즈 (1σ)', 'Acceleration process noise (1σ)', 'm/s²', 1, 0.01, 20, 0.05, 'est'),

  F('comm.rate', '상태 방송·명령 주기', 'State broadcast / command rate', 'Hz', 1, 1, 200, 1, 'comm'),
  F('comm.delayMean', '통신 지연 (편도, 평균)', 'Comm delay (one-way, mean)', 'ms', 1000, 0, 500, 1, 'comm'),
  F('comm.delayJitter', '통신 지연 지터 (±)', 'Comm delay jitter (±)', 'ms', 1000, 0, 200, 1, 'comm'),
  F('comm.gain', '대형 유지 게인 k', 'Formation gain k', '1/s', 1, 0.1, 20, 0.1, 'comm'),
  F('comm.loss.p', '손실 확률 (베르누이)', 'Loss probability (Bernoulli)', '%', 100, 0, 90, 1, 'comm'),
  F('comm.loss.pGB', 'Good→Bad 전이 확률', 'Good→Bad transition prob.', '%', 100, 0, 100, 0.5, 'comm'),
  F('comm.loss.pBG', 'Bad→Good 전이 확률', 'Bad→Good transition prob.', '%', 100, 1, 100, 1, 'comm'),
  F('comm.loss.lossGood', 'Good 상태 손실률', 'Loss rate in Good', '%', 100, 0, 100, 0.5, 'comm'),
  F('comm.loss.lossBad', 'Bad 상태 손실률', 'Loss rate in Bad', '%', 100, 0, 100, 1, 'comm'),

  F('vehicle.diag', '모터 대각 축간 거리', 'Motor-to-motor diagonal', 'mm', 1000, 30, 2000, 1, 'vehicle', { lit: { ref: () => lit('cfbl-datasheet', 'frame-size'), value: 0.1 } }),
  F('vehicle.envelope', '충돌 지름 (가드·여유 포함)', 'Collision diameter (incl. guards)', 'cm', 100, 5, 300, 1, 'vehicle'),
  F('vehicle.mass', '이륙 질량', 'Take-off mass', 'g', 1000, 10, 5000, 1, 'vehicle', { lit: { ref: () => lit('cfbl-datasheet', 'takeoff-weight-guards'), value: 0.037 } }),
  F('vehicle.vMax', '최대 속도', 'Max speed', 'm/s', 1, 0.1, 20, 0.1, 'vehicle'),
  F('vehicle.aMax', '최대 가속도', 'Max acceleration', 'm/s²', 1, 0.5, 30, 0.5, 'vehicle'),
  F('vehicle.flightTime', '비행시간', 'Flight time', 'min', 1 / 60, 1, 60, 0.5, 'vehicle', { lit: { ref: () => lit('cfbl-datasheet', 'flight-time'), value: 600 } }),

  F('formation.spacing', '대형 간격', 'Formation spacing', 'm', 1, 0.2, 5, 0.05, 'formation'),
  F('formation.height', '비행 고도', 'Flight height', 'm', 1, 0.3, 10, 0.1, 'formation'),
  F('formation.cruiseSpeed', '대형 이동 속도', 'Formation cruise speed', 'm/s', 1, 0, 5, 0.05, 'formation'),

  F('safety.kSigma', '신뢰 배수 k_σ', 'Confidence multiplier k_σ', 'σ', 1, 1, 5, 0.5, 'safety'),
  F('safety.downwashRatio', '다운워시 타원체 비율 k_z', 'Downwash ellipsoid ratio k_z', '', 1, 1, 10, 0.1, 'safety'),
  F('safety.relSpeed', '기체 간 상대속도 가정', 'Assumed relative speed', 'm/s', 1, 0, 5, 0.05, 'safety'),
  F('safety.trackingError', '제어 추종 오차 (1σ)', 'Tracking error (1σ)', 'cm', 100, 0, 50, 0.5, 'safety'),
  F('safety.margin', '추가 여유', 'Extra margin', 'cm', 100, 0, 100, 1, 'safety'),
];
const BY_PATH = new Map(FIELDS.map((f) => [f.path, f]));
export const fieldMeta = (path: string): FieldMeta | undefined => BY_PATH.get(path);

/** 설정 필드의 현재 값에 맞는 출처 배지 */
export function fieldSource(path: string, value: number): SrcRef {
  const m = BY_PATH.get(path);
  if (m?.lit && Math.abs(value - m.lit.value) <= 1e-9 * Math.max(1, Math.abs(m.lit.value))) return m.lit.ref();
  const ms = measured.value[path];
  if (ms && Math.abs(value - ms.value) <= 1e-9 * Math.max(1, Math.abs(ms.value))) {
    return der(`ch9#${ms.anchor}`, { ko: '9장에서 여러분의 로그로 구해 설정에 반영한 값', en: 'Fitted from your own log in chapter 9 and applied to the settings' });
  }
  return ex(path);
}

export const GROUP_LABELS: Record<FieldMeta['group'], L> = {
  hall: { ko: '강당과 앵커', en: 'Hall & anchors' },
  uwb: { ko: 'UWB 측위', en: 'UWB positioning' },
  est: { ko: '추정', en: 'Estimation' },
  comm: { ko: '통신', en: 'Communication' },
  vehicle: { ko: '기체', en: 'Vehicle' },
  formation: { ko: '대형', en: 'Formation' },
  safety: { ko: '안전 여유', en: 'Safety margins' },
};
