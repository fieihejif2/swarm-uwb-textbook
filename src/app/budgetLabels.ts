import type { BudgetItem } from '../sim/budget';
import type { SystemConfig } from '../sim/config';
import { SrcRef, der } from '../sources';
import { fieldSource } from './fields';
import type { L } from './i18n';
import { getPath } from './store';

/** 오차 예산 항목(budget.ts 의 item id)의 표시 이름 */
export const BUDGET_LABELS: Record<string, L> = {
  'range-noise': { ko: '거리(거리차) 측정 노이즈 σ_r', en: 'Range(-difference) noise σ_r' },
  'clock-drift': { ko: 'SS-TWR 였다면 생겼을 클럭 드리프트 오차', en: 'Clock-drift error if SS-TWR were used' },
  dop: { ko: '앵커 기하: HDOP / VDOP', en: 'Anchor geometry: HDOP / VDOP' },
  'pos-rate': { ko: '드론당 위치 갱신율', en: 'Position update rate per drone' },
  'sigma-eff': { ko: 'NLOS·게이팅 반영 유효 거리 오차', en: 'Effective range error with NLOS and gating' },
  'raw-pos': { ko: 'UWB 만의 위치 오차 (1σ)', en: 'UWB-only position error (1σ)' },
  'est-sigma': { ko: '융합 후 위치 추정 오차 (1σ)', en: 'Position estimate error after fusion (1σ)' },
  'anchor-bias': { ko: '앵커 좌표 오차가 만드는 편향', en: 'Bias from anchor survey error' },
  'est-latency': { ko: '측위 지연 × 상대속도', en: 'Estimation latency × relative speed' },
  'comm-delay': { ko: '통신 지연 동안의 상대 이동', en: 'Relative motion during comm delay' },
  'comm-gap': { ko: '연속 손실(통신 공백) 동안의 상대 이동', en: 'Relative motion during loss bursts' },
  'delay-margin': { ko: '합의 지연 한계 τ*', en: 'Consensus delay bound τ*' },
  body: { ko: '기체 충돌 지름 (수직은 다운워시 반영)', en: 'Collision diameter (vertical includes downwash)' },
  tracking: { ko: '제어 추종 오차 (1σ)', en: 'Tracking error (1σ)' },
  margin: { ko: '추가 여유', en: 'Extra margin' },
  'min-sep': { ko: '권장 최소 간격 (중심 간)', en: 'Recommended minimum spacing (centre to centre)' },
};

/** 예산 항목의 값이 설정 입력 그대로인 경우: 그 입력의 배지(예시값·문헌·측정값)를 그대로 쓴다 */
const BUDGET_DIRECT: Record<string, (cfg: SystemConfig) => string> = {
  'range-noise': (cfg) => (cfg.uwb.mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa'),
  tracking: () => 'safety.trackingError',
  margin: () => 'safety.margin',
};
const COMPUTED = { ko: '현재 설정값을 이 유도의 식에 넣어 계산한 값', en: 'Computed by putting the current settings into the formula of this derivation' };
/** 계산해서 얻는 예산 항목: 그 양을 실제로 유도하는 카드를 가리킨다 */
const BUDGET_DERIVED: Record<string, () => SrcRef> = {
  'clock-drift': () => der('ch1#ss-drift', COMPUTED),
  dop: () => der('ch2#gdop', COMPUTED),
  'pos-rate': () => der('ch3#rate', COMPUTED),
  'sigma-eff': () => der('ch4#sigma-eff', COMPUTED),
  'raw-pos': () => der('ch2#gdop', { ko: 'DOP × 유효 거리 오차 (2장의 식에 4장의 σ_eff 를 넣은 값)', en: 'DOP × effective range error (chapter 2 formula with σ_eff of chapter 4)' }),
  'est-sigma': () => der('ch5#steady-state', COMPUTED),
  'anchor-bias': () => der('ch6#anchor-error', COMPUTED),
  'est-latency': () => der('ch8#budget-sum', { ko: '상대속도 × 측위 지연', en: 'relative speed × estimation latency' }),
  'comm-delay': () => der('ch7#loop-delay', COMPUTED),
  'comm-gap': () => der('ch7#ge-stationary', COMPUTED),
  'delay-margin': () => der('ch7#delay-bound', COMPUTED),
  body: () => der('ch8#downwash', { ko: '수평은 설정의 충돌 지름 그대로, 수직은 다운워시 비율 k_z 를 곱한 값', en: 'Horizontal: the collision diameter from settings; vertical: multiplied by the downwash ratio k_z' }),
  'min-sep': () => der('ch8#budget-sum', COMPUTED),
};
export function budgetSrc(it: BudgetItem, cfg: SystemConfig): SrcRef {
  const direct = BUDGET_DIRECT[it.id]?.(cfg);
  if (direct) return fieldSource(direct, getPath(cfg, direct) as number);
  return BUDGET_DERIVED[it.id]?.() ?? der(`ch${it.chapter}#budget`);
}
