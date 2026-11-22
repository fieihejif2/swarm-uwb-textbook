import type { FunctionComponent } from 'preact';
import type { CodingTask } from '../py/grader';
import type { L } from './i18n';

/** 챕터 한 개의 정의. 챕터 모듈(src/chapters/chN/index.tsx)이 default export 한다. */
export interface ChapterDef {
  id: number;
  title: L;
  /** 제목 아래 한두 문장 */
  lead: L;
  /** ① 학습 목표 (3개 이내) */
  objectives: L[];
  /** 본문: ②예측 ③데모 ④유도 ⑤과제 ⑥함정 을 담는다 */
  Body: FunctionComponent;
  /** ⑦ 이 챕터가 오차 예산에 더하는 항목(budget.ts 의 item id)과 설명 */
  budget: { items: string[]; note: L };
  /** ⑧ 3줄 요약 */
  summary: [L, L, L];
  /** ⑧ 다음 챕터로 넘어가는 질문 */
  next: L;
  /** 이 챕터의 손코딩 과제(채점기 테스트와 스모크 테스트가 사용) */
  tasks: CodingTask[];
}

export interface ChapterMeta { id: number; title: L; blurb: L; load: () => Promise<{ default: ChapterDef }> }

export const CHAPTERS: ChapterMeta[] = [
  { id: 0, title: { ko: '왜 무너지는가', en: 'Why does it fall apart?' }, blurb: { ko: '완벽한 정보에 지연·노이즈·손실을 차례로 넣으며 5대 대형이 무너지는 과정을 본다.', en: 'Add delay, noise and loss to perfect information and watch a five-drone formation fall apart.' }, load: () => import('../chapters/ch0') },
  { id: 1, title: { ko: 'UWB는 거리를 어떻게 재나', en: 'How UWB measures distance' }, blurb: { ko: '비행시간, 양방향 거리 측정, 클럭 드리프트가 거리 오차가 되는 과정.', en: 'Time of flight, two-way ranging, and how clock drift turns into range error.' }, load: () => import('../chapters/ch1') },
  { id: 2, title: { ko: '거리에서 위치로', en: 'From ranges to position' }, blurb: { ko: '삼변측량, 가우스-뉴턴, TDoA 쌍곡선, 앵커 배치와 DOP.', en: 'Trilateration, Gauss–Newton, TDoA hyperbolas, anchor layout and DOP.' }, load: () => import('../chapters/ch2') },
  { id: 3, title: { ko: 'TWR vs TDoA, 5대를 띄우면', en: 'TWR vs TDoA with five drones' }, blurb: { ko: '태그가 늘면 TWR 갱신율은 왜 떨어지고 TDoA 는 왜 그대로인가.', en: 'Why the TWR update rate drops with more tags while TDoA does not.' }, load: () => import('../chapters/ch3') },
  { id: 4, title: { ko: 'NLOS, 다중경로, 이상치', en: 'NLOS, multipath, outliers' }, blurb: { ko: '양의 편향과 두꺼운 꼬리, 마할라노비스 게이팅, 강건 추정.', en: 'Positive bias and heavy tails, Mahalanobis gating, robust estimation.' }, load: () => import('../chapters/ch4') },
  { id: 5, title: { ko: 'UWB + IMU 융합', en: 'UWB + IMU fusion' }, blurb: { ko: 'EKF 구조, tight vs loose, Q/R 튜닝, 지연된 측정 처리.', en: 'EKF structure, tight vs loose, Q/R tuning, delayed measurements.' }, load: () => import('../chapters/ch5') },
  { id: 6, title: { ko: 'Crazyflie에 넣기', en: 'Putting it on a Crazyflie' }, blurb: { ko: '앵커 → 온보드 추정 → Crazyradio → Crazyswarm2 의 데이터 흐름.', en: 'Data flow: anchors → onboard estimator → Crazyradio → Crazyswarm2.' }, load: () => import('../chapters/ch6') },
  { id: 7, title: { ko: '통신, 그리고 지연 아래의 합의', en: 'Communication and consensus under delay' }, blurb: { ko: '라플라시안, λ₂ 와 수렴 속도, 지연 한계 π/(2kλ_N), 손실 모델.', en: 'Laplacian, λ₂ and convergence speed, the delay bound π/(2kλ_N), loss models.' }, load: () => import('../chapters/ch7') },
  { id: 8, title: { ko: '안전 거리 예산', en: 'The safety-distance budget' }, blurb: { ko: '오차를 모두 더한 최소 간격, 다운워시 타원체, CBF 안전 필터.', en: 'Minimum spacing from all error terms, the downwash ellipsoid, CBF safety filter.' }, load: () => import('../chapters/ch8') },
  { id: 9, title: { ko: '우리 시스템 측정하기', en: 'Measuring our own system' }, blurb: { ko: '지상 측정 절차, 로그에서 노이즈·지연을 피팅해 설정에 반영.', en: 'Ground measurement procedures; fit noise and delay from logs into the settings.' }, load: () => import('../chapters/ch9') },
];
