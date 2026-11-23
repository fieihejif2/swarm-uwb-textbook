/** 마지막 페이지: 지금 설정으로 계산한 "우리 시스템 리포트". 브라우저 인쇄(PDF 저장)용 스타일시트가 적용된다. */
import { useEffect, useMemo } from 'preact/hooks';
import { L } from '../app/i18n';
import { computeBudget } from '../sim/budget';
import { withPath } from '../sim/ch9_measure';
import { BUDGET_LABELS, budgetSrc } from '../app/budgetLabels';
import { FIELDS, GROUP_LABELS, fieldMeta, fieldSource } from '../app/fields';
import { fmt, lang, tr } from '../app/i18n';
import { budget, config, getPath, openSettingsAt, visited } from '../app/store';
import { commHops } from '../sim/budget';
import { formationOffsets } from '../sim/formation';
import { dopFor, dopGrid, insideAnchorBox } from '../sim/positioning';
import { burstLengthQuantile } from '../sim/loss';
import { SrcRef, der, ex, lit } from '../sources';
import { CfgVal, SrcBadge } from '../ui/Badge';
import { BudgetTable } from '../ui/BudgetBar';
import { Stat, StatRow, Status } from '../ui/blocks';
import { PlanView } from '../ui/PlanView';
import { Waterfall, seriesColor, useWidth } from '../ui/Plot';
import { M } from '../ui/Math';
import type { BudgetItem } from '../sim/budget';
import { Scene3D } from '../ui/Scene3D';
import { P, T } from '../ui/Tx';

const CALC = der('ch8#budget-sum', { ko: '현재 설정값을 교재의 식에 넣어 계산한 값', en: 'Computed from the current settings with the textbook formulas' });
const SENS = der('ch9#sensitivity', { ko: '이 값만 2배로 바꿔 오차 예산을 다시 계산한 결과와의 차(큰 쪽: 수평 또는 수직)', en: 'Difference to the budget recomputed with only this value doubled (larger of horizontal and vertical)' });
const SHAPE: Record<string, L> = {
  line: { ko: '일렬', en: 'line' }, v: { ko: 'V자', en: 'V' }, pentagon: { ko: '오각형', en: 'pentagon' }, cross: { ko: '십자', en: 'cross' }, stack: { ko: '수직 쌓기', en: 'vertical stack' },
};
/** 예시값 입력을 "어떻게 정하나": 9장의 실험으로 재는 값 / 데이터시트·줄자 / 설계 선택 / 이 교재에 방법 없음 */
type How = 'measure' | 'sheet' | 'design' | 'none';
const HOW: Record<string, [How, L]> = {
  'uwb.sigmaTdoa': ['measure', { ko: '9장 실험 1·2', en: 'Ch. 9 exp. 1–2' }],
  'uwb.sigmaTwr': ['measure', { ko: '9장 실험 2', en: 'Ch. 9 exp. 2' }],
  'uwb.pNlos': ['measure', { ko: '9장 실험 2', en: 'Ch. 9 exp. 2' }],
  'uwb.nlosBiasMean': ['measure', { ko: '9장 실험 2', en: 'Ch. 9 exp. 2' }],
  'uwb.anchorSurveyError': ['measure', { ko: '6장 측량 · 9장 실험 2 (어림)', en: 'Ch. 6 survey · ch. 9 exp. 2 (rough)' }],
  'comm.delayMean': ['measure', { ko: '9장 실험 3', en: 'Ch. 9 exp. 3' }],
  'comm.delayJitter': ['measure', { ko: '9장 실험 3', en: 'Ch. 9 exp. 3' }],
  'comm.loss.p': ['measure', { ko: '9장 실험 4', en: 'Ch. 9 exp. 4' }],
  'comm.loss.pGB': ['measure', { ko: '9장 실험 4', en: 'Ch. 9 exp. 4' }],
  'comm.loss.pBG': ['measure', { ko: '9장 실험 4', en: 'Ch. 9 exp. 4' }],
  'comm.loss.lossGood': ['measure', { ko: '9장 실험 4 (0 % 로 단순화)', en: 'Ch. 9 exp. 4 (simplified to 0 %)' }],
  'comm.loss.lossBad': ['measure', { ko: '9장 실험 4 (100 % 로 단순화)', en: 'Ch. 9 exp. 4 (simplified to 100 %)' }],
  'safety.trackingError': ['measure', { ko: '9장 실험 5', en: 'Ch. 9 exp. 5' }],
  'safety.downwashRatio': ['measure', { ko: '9장 실험 6', en: 'Ch. 9 exp. 6' }],
  'hall.x': ['sheet', { ko: '줄자로 재기', en: 'Tape measure' }],
  'hall.y': ['sheet', { ko: '줄자로 재기', en: 'Tape measure' }],
  'hall.z': ['sheet', { ko: '줄자로 재기', en: 'Tape measure' }],
  'vehicle.envelope': ['sheet', { ko: '줄자로 재기 (가드 포함)', en: 'Tape measure (guards included)' }],
  'vehicle.diag': ['sheet', { ko: '데이터시트', en: 'Datasheet' }],
  'vehicle.mass': ['sheet', { ko: '데이터시트 · 저울', en: 'Datasheet · scale' }],
  'vehicle.flightTime': ['sheet', { ko: '데이터시트', en: 'Datasheet' }],
  'vehicle.vMax': ['design', { ko: '설계 선택 (속도 제한)', en: 'Design choice (speed limit)' }],
  'safety.margin': ['design', { ko: '설계 선택 (+ 9장 실험 1 의 편향)', en: 'Design choice (+ bias of ch. 9 exp. 1)' }],
};
const HOW_LABEL: Record<How, L> = {
  measure: { ko: '측정', en: 'Measure' }, sheet: { ko: '데이터시트·줄자', en: 'Datasheet / tape' }, design: { ko: '설계 선택', en: 'Design choice' }, none: { ko: '이 교재에 방법 없음', en: 'No method in this textbook' },
};
const howOf = (path: string): [How, L] =>
  HOW[path] ?? (['estimation.latency', 'estimation.accelNoise', 'vehicle.aMax', 'uwb.clockDriftPpm', 'uwb.replyDelay', 'uwb.twrRangeTime', 'uwb.tdoaSlotTime'].includes(path)
    ? ['none', { ko: '이 교재에 재는 방법 없음 (문서·데이터시트 확인)', en: 'No measurement method here (check docs / datasheet)' }]
    : ['design', { ko: '설계 선택', en: 'Design choice' }]);

/** 좁은 화면(폰)용 "항목별 상세": 표 대신 항목마다 카드 한 장. 값과 성격을 이름 바로 아래에 두고, 입력 칩은 32 px 이상 높이로 그린다. */
const KIND_LABEL: Record<BudgetItem['kind'], L> = {
  random: { ko: '무작위 (제곱합)', en: 'random (RSS)' },
  bias: { ko: '편향 (그대로 합)', en: 'bias (added)' },
  deterministic: { ko: '확정 (그대로 합)', en: 'deterministic (added)' },
  geometry: { ko: '크기·여유', en: 'size / margin' },
  info: { ko: '중간 계산값 (합계에 직접 더하지 않음)', en: 'intermediate (not added to the total directly)' },
};
function itemValue(it: BudgetItem): string {
  const scale = it.unit === 'm' ? 100 : it.unit === 's' ? 1000 : 1;
  const unit = it.unit === 'm' ? 'cm' : it.unit === 's' ? 'ms' : it.unit;
  const one = (v: number) => fmt(v * scale, 3);
  return `${one(it.value)}${it.valueV !== undefined ? ` / ${one(it.valueV)}` : ''}${unit ? ` ${unit}` : ''}`;
}
function BudgetCards() {
  const b = budget.value;
  return (
    <div role="list" data-testid="report-budget-cards" style={{ display: 'grid', gap: '8px' }}>
      {b.items.map((it) => (
        <div role="listitem" key={it.id} data-budget-item={it.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', background: it.id === 'min-sep' ? 'var(--surface-2)' : 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px 10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b>{tr({ ko: `${it.chapter}장 · `, en: `Ch. ${it.chapter} · ` })}{tr(BUDGET_LABELS[it.id] ?? { ko: it.id, en: it.id })}</b>
            <span class="num" style={{ whiteSpace: 'nowrap' }}>{itemValue(it)}<SrcBadge src={budgetSrc(it, config.value)} /></span>
          </div>
          <div class="small muted">{it.valueV !== undefined && <>{tr({ ko: '수평 / 수직', en: 'horiz. / vert.' })} · </>}{tr(KIND_LABEL[it.kind])}</div>
          <div class="small" style={{ overflowX: 'auto', margin: '2px 0' }}><M tex={it.formula} /></div>
          {it.inputs.some((q) => fieldMeta(q)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {it.inputs.filter((q) => fieldMeta(q)).map((q) => (
                <button key={q} type="button" class="btn ghost small" style={{ minHeight: '34px', padding: '0 10px' }} onClick={() => openSettingsAt(q)}>{tr(fieldMeta(q)!.label)}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Report() {
  const cfg = config.value;
  const b = budget.value;
  useEffect(() => { document.title = tr({ ko: '우리 시스템 리포트 — 군집은 서로를 어떻게 아는가', en: 'Our system report — How does a swarm know itself?' }); window.scrollTo(0, 0); }, []);
  const heat = useMemo(() => dopGrid(cfg.uwb.mode, cfg.anchors, cfg.hall, cfg.formation.height, 48, 36, 'pdop'), [cfg.uwb.mode, cfg.anchors, cfg.hall, cfg.formation.height]);
  const flat = heat.values.flat();
  const finite = flat.filter(Number.isFinite);
  const pdopMean = finite.reduce((s, v) => s + v, 0) / Math.max(1, finite.length);
  const pdopMax = finite.length ? Math.max(...finite) : Infinity;
  const badArea = flat.filter((v) => !(v <= 3)).length / flat.length;
  const center = [cfg.hall.x / 2, cfg.hall.y / 2, cfg.formation.height];
  const offsets = formationOffsets(cfg.formation.shape, cfg.formation.spacing, cfg.nDrones);
  const R = Math.max(1, Math.min(cfg.hall.x, cfg.hall.y) / 4);
  // 대형이 도는 원형 경로 위의 점들이 앵커가 둘러싼 공간 안에 있는가
  const circuit = Array.from({ length: 24 }, (_, i) => [center[0] + R * Math.cos((2 * Math.PI * i) / 24), center[1] + R * Math.sin((2 * Math.PI * i) / 24), cfg.formation.height]);
  const outside = circuit.filter((c) => offsets.some((o) => !insideAnchorBox(cfg.anchors, [c[0] + o[0], c[1] + o[1], c[2] + o[2]]))).length;
  const zs = cfg.anchors.map((a) => a[2]);
  const sameHeight = Math.max(...zs) - Math.min(...zs) < 0.5;
  const worstDop = Math.max(...circuit.map((c) => dopFor(cfg.uwb.mode, cfg.anchors, c).pdop));
  const examples = FIELDS.filter((f) => fieldSource(f.path, getPath(cfg, f.path) as number).kind === 'ex');
  const marginFactor = b.delayMargin / b.loopDelay;
  const burst = burstLengthQuantile(cfg.comm.loss, 1e-3);
  // 예시값 입력마다 "2배로 바꾸면 권장 간격이 얼마나 바뀌나"(9장 민감도)와 "어떻게 정하나"
  const [wideRef, pageW] = useWidth<HTMLDivElement>();
  const narrow = pageW > 0 && pageW < 600;
  const exRows = useMemo(() => examples.map((f) => {
    const v = getPath(cfg, f.path) as number;
    const nb = computeBudget(withPath(cfg, f.path, v === 0 ? 0 : 2 * v));
    const d = Math.max(Math.abs(nb.minSepH - b.minSepH), Math.abs(nb.minSepV - b.minSepV));
    return { f, d, how: howOf(f.path) };
  }).sort((p, q) => q.d - p.d), [cfg, b]);
  const nextToMeasure = exRows.filter((r) => r.how[0] === 'measure' && r.d > 0).slice(0, 3);
  const nConfigChoices = 5; // 앵커 좌표, 앵커 수, UWB 모드, 통신 구조, 대형 모양
  // 8장과 같은 식: σ_H 는 이미 수평 두 축의 합이므로 ε = kσ·√(σ_H² + σ_V²), 정보 나이 = 측위 지연 + ageMax
  const epsCfg = cfg.safety.kSigma * Math.hypot(b.sigmaEstH, b.sigmaEstV);
  const ECfg = 2 * epsCfg + cfg.vehicle.vMax * (cfg.estimation.latency + b.ageMax);
  const robustOk = b.minSepH > 3 * ECfg;
  const hasVertical = offsets.some((o) => Math.abs(o[2] - offsets[0][2]) > 1e-6);
  const items = b.items.filter((i) => ['body', 'est-sigma', 'tracking', 'anchor-bias', 'est-latency', 'comm-delay', 'comm-gap', 'margin'].includes(i.id));
  const k = cfg.safety.kSigma;
  const est = b.items.find((i) => i.id === 'est-sigma')!;
  const rand = (sig: number) => k * Math.SQRT2 * Math.hypot(sig, cfg.safety.trackingError);
  const wf = (vertical: boolean) => [
    { label: BUDGET_LABELS.body, value: vertical ? cfg.vehicle.envelope * cfg.safety.downwashRatio : cfg.vehicle.envelope, slot: 7, src: vertical ? der('ch8#downwash', { ko: '충돌 지름 × k_z (두 입력 모두 설정값)', en: 'Collision diameter × k_z (both inputs are settings)' }) : fieldSource('vehicle.envelope', cfg.vehicle.envelope) },
    { label: { ko: `무작위 오차 (${fmt(k)}σ, 두 기체)`, en: `Random errors (${fmt(k)}σ, two drones)` }, value: rand(vertical ? est.valueV! : est.value), slot: 1, src: CALC },
    ...items.filter((i) => ['anchor-bias', 'est-latency', 'comm-delay', 'comm-gap', 'margin'].includes(i.id)).map((i, n) => ({ label: BUDGET_LABELS[i.id], value: vertical && i.valueV !== undefined ? i.valueV : i.value, slot: [2, 3, 4, 5, 6][n], src: i.id === 'margin' ? fieldSource('safety.margin', cfg.safety.margin) : CALC })),
    { label: BUDGET_LABELS['min-sep'], value: vertical ? b.minSepV : b.minSepH, total: true, src: CALC },
  ].map((r) => ({ ...r, value: r.value * 100 }));
  const GDOP = der('ch2#gdop', { ko: '설정의 앵커 배치로 계산한 DOP', en: 'DOP from the anchor layout in the settings' });
  const checks: { ok: 'good' | 'warn' | 'bad' | 'info'; ko: string; en: string; src: SrcRef }[] = [
    b.spacingOk
      ? { ok: 'good', src: CALC, ko: `대형 간격 ${fmt(cfg.formation.spacing)} m 가 권장 최소 수평 간격 ${fmt(b.minSepH, 3)} m 이상입니다.`, en: `Formation spacing ${fmt(cfg.formation.spacing)} m is at least the recommended horizontal minimum ${fmt(b.minSepH, 3)} m.` }
      : { ok: 'bad', src: CALC, ko: `대형 간격 ${fmt(cfg.formation.spacing)} m 가 권장 최소 수평 간격 ${fmt(b.minSepH, 3)} m 보다 좁습니다. 간격을 넓히거나 오차·지연을 줄이세요.`, en: `Formation spacing ${fmt(cfg.formation.spacing)} m is below the recommended horizontal minimum ${fmt(b.minSepH, 3)} m. Widen it or reduce errors and delay.` },
    !hasVertical
      ? { ok: 'info', src: CALC, ko: `지금 대형은 위아래로 겹치지 않습니다. 겹치게 하려면 수직 간격이 ${fmt(b.minSepV, 3)} m 이상이어야 합니다(다운워시 포함).`, en: `The current formation has no vertical overlap. Overlapping drones would need a vertical gap of at least ${fmt(b.minSepV, 3)} m (downwash included).` }
      : cfg.formation.spacing < b.minSepV
        ? { ok: 'bad', src: CALC, ko: `위아래로 겹치는 대형인데 간격 ${fmt(cfg.formation.spacing)} m 가 권장 수직 간격 ${fmt(b.minSepV, 3)} m 보다 좁습니다(다운워시).`, en: `Vertically overlapping formation with spacing ${fmt(cfg.formation.spacing)} m below the recommended vertical minimum ${fmt(b.minSepV, 3)} m (downwash).` }
        : { ok: 'good', src: CALC, ko: `위아래로 겹치는 대형의 간격 ${fmt(cfg.formation.spacing)} m 가 권장 수직 간격 ${fmt(b.minSepV, 3)} m 이상입니다.`, en: `Vertically overlapping formation with spacing ${fmt(cfg.formation.spacing)} m, at least the recommended vertical minimum ${fmt(b.minSepV, 3)} m.` },
    robustOk
      ? { ok: 'good', src: der('ch8#cbf-robust'), ko: `강건 안전 필터의 조건 $d_{\\min} > 3E$ 를 만족합니다(3E = ${fmt(3 * ECfg, 3)} m, 8장의 어림).`, en: `The robust safety filter condition $d_{\\min} > 3E$ holds (3E = ${fmt(3 * ECfg, 3)} m, estimate of ch. 8).` }
      : { ok: 'bad', src: der('ch8#cbf-robust'), ko: `강건 안전 필터의 조건 $d_{\\min} > 3E$ 를 만족하지 못합니다. 권장 수평 간격 ${fmt(b.minSepH, 3)} m 에 대해 3E = ${fmt(3 * ECfg, 3)} m 가 필요합니다(8장의 어림). 이 설정에서는 그 필터가 보장을 주지 못합니다.`, en: `The robust safety filter condition $d_{\\min} > 3E$ fails: 3E = ${fmt(3 * ECfg, 3)} m is needed against the recommended horizontal spacing ${fmt(b.minSepH, 3)} m (estimate of ch. 8). That filter gives no guarantee with these settings.` },
    cfg.comm.topology === 'p2p'
      ? { ok: 'info', src: der('ch7#p2p-stable'), ko: '기체 간 직접 통신: 지연 한계는 안정성 조건이 아니라 참고값입니다(7장).', en: 'Direct communication: the delay bound is a reference, not a stability condition (ch. 7).' }
      : { ok: marginFactor >= 2 ? 'good' : marginFactor >= 1 ? 'warn' : 'bad', src: der('ch7#delay-bound'),
        ko: `${marginFactor >= 2 ? `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 는 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 의 절반 이하입니다.` : marginFactor >= 1 ? `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 가 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 의 절반을 넘습니다. 게인을 낮추는 것이 안전합니다.` : `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 가 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 를 넘었습니다. 이 게인으로는 대형이 진동합니다.`} (루프 지연은 7장의 평균 지연 기준. 이웃 위치에 반응하는 대형 보정을 PC 에서 닫힌 루프로 돌릴 때만 해당하고, 궤적을 올려 두고 날리면 해당 없음)`,
        en: `${marginFactor >= 2 ? `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms is at most half the delay bound ${fmt(b.delayMargin * 1000, 3)} ms.` : marginFactor >= 1 ? `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms exceeds half the delay bound ${fmt(b.delayMargin * 1000, 3)} ms. Lowering the gain is safer.` : `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms exceeds the delay bound ${fmt(b.delayMargin * 1000, 3)} ms. The formation will oscillate with this gain.`} (loop delay based on the mean delays of ch. 7; applies only when a formation correction that reacts to neighbour positions runs as a closed loop on the PC — not when flying uploaded trajectories)` },
    cfg.uwb.mode === 'tdoa' && outside > 0
      ? { ok: 'bad', src: lit('lps-docs', 'tdoa2-convex-hull'), ko: `TDoA 모드인데 대형 경로(점선 원 위 24점)의 ${outside}/24 지점이 앵커가 둘러싼 공간 밖입니다(2장).`, en: `TDoA mode, but ${outside}/24 points of the formation path (24 points on the dashed circle) lie outside the anchor volume (ch. 2).` }
      : { ok: 'good', src: lit('lps-docs', 'tdoa2-convex-hull'), ko: '대형 경로(점선 원 위 24점)가 앵커가 둘러싼 공간 안에 있습니다.', en: 'The formation path (24 points on the dashed circle) stays inside the anchor volume.' },
    sameHeight
      ? { ok: 'warn', src: GDOP, ko: '앵커 높이 차가 0.5 m{{ex}} 보다 작습니다. 수직 방향 정확도가 나빠집니다(2장).', en: 'Anchor heights differ by less than 0.5 m{{ex}}; vertical accuracy suffers (ch. 2).' }
      : { ok: 'good', src: GDOP, ko: '앵커 높이 차가 0.5 m{{ex}} 이상으로 섞여 있습니다.', en: 'Anchor heights are mixed (difference of at least 0.5 m{{ex}}).' },
    worstDop > 3
      ? { ok: 'warn', src: GDOP, ko: `대형 경로(점선 원 위 24점)에서 PDOP 가 최대 ${fmt(worstDop, 3)} 까지 올라가 판정 기준 3{{ex}} 을 넘습니다.`, en: `PDOP along the formation path (24 points on the dashed circle) rises to ${fmt(worstDop, 3)}, above the criterion 3{{ex}}.` }
      : { ok: 'good', src: GDOP, ko: `대형 경로(점선 원 위 24점)의 PDOP 는 최대 ${fmt(worstDop, 3)} 로 판정 기준 3{{ex}} 이하입니다.`, en: `PDOP along the formation path (24 points on the dashed circle) is at most ${fmt(worstDop, 3)}, within the criterion 3{{ex}}.` },
    cfg.uwb.mode === 'twr'
      ? { ok: 'warn', src: der('ch3#rate'), ko: `TWR 로 ${cfg.nDrones}대를 띄우면 드론당 위치 갱신율이 ${fmt(b.posRate, 3)} Hz 로 떨어집니다(3장). 공식 문서는 TWR 에서 태그 1대만 지원한다고 합니다{{lit:lps-docs/twr-tag-limit}}.`, en: `With TWR and ${cfg.nDrones} drones the per-drone position rate drops to ${fmt(b.posRate, 3)} Hz (ch. 3). The official docs state TWR positions a single tag{{lit:lps-docs/twr-tag-limit}}.` }
      : { ok: 'good', src: der('ch3#rate'), ko: `TDoA: 드론당 위치 갱신율 ${fmt(b.posRate, 3)} Hz (태그 수와 무관).`, en: `TDoA: ${fmt(b.posRate, 3)} Hz position rate per drone (independent of the number of tags).` },
    examples.length > 0
      ? { ok: 'warn', src: ex(undefined, { ko: '출처가 없는 수치 입력의 개수', en: 'Number of numeric inputs without a source' }), ko: `수치 입력 ${examples.length}개가 아직 예시값입니다(측정 전). 위 판정은 모두 그 가정 위에 서 있습니다.`, en: `${examples.length} numeric inputs are still example values (not yet measured). Every verdict above rests on those assumptions.` }
      : { ok: 'good', src: CALC, ko: '수치 입력 가운데 예시값이 남아 있지 않습니다.', en: 'No numeric input is still an example value.' },
  ];
  return (
    <article data-testid="report">
      <header class="chapter-head">
        <div class="kicker">{tr({ ko: '마지막 페이지', en: 'Final page' })}</div>
        <h1>{tr({ ko: '우리 시스템 리포트', en: 'Our system report' })}</h1>
        <p class="lead">{tr({ ko: '지금 설정으로 계산한 오차 예산, 권장 최소 간격, 지연 여유, 앵커 배치 요약입니다. 설정을 바꾸면 이 페이지도 바로 바뀝니다.', en: 'Error budget, recommended minimum spacing, delay margin and anchor-layout summary for the current settings. Change the settings and this page updates at once.' })}</p>
        <p class="small muted">{tr({ ko: '작성 시각', en: 'Generated' })}: {new Date().toLocaleString(lang.value === 'ko' ? 'ko-KR' : 'en-GB')} · {tr({ ko: `읽은 장 ${visited.value.length}/10`, en: `${visited.value.length}/10 chapters read` })}</p>
        <div class="btn-row no-print">
          <button type="button" class="btn primary" onClick={() => window.print()} data-testid="report-print">{tr({ ko: '🖨 인쇄 / PDF 로 저장', en: '🖨 Print / save as PDF' })}</button>
          <a class="btn" href="#/ch/9">{tr({ ko: '← 9장: 측정값으로 바꾸기', en: '← Ch. 9: replace with measurements' })}</a>
        </div>
      </header>

      <section class="section">
        <h2>{tr({ ko: '결론', en: 'Bottom line' })}</h2>
        <StatRow>
          <Stat label={{ ko: '권장 최소 수평 간격', en: 'Recommended min. horizontal spacing' }} value={b.minSepH} unit="m" src={CALC} status={b.spacingOk ? 'good' : 'bad'} />
          <Stat label={{ ko: '권장 최소 수직 간격', en: 'Recommended min. vertical spacing' }} value={b.minSepV} unit="m" src={CALC} />
          <Stat label={{ ko: '지금 대형 간격', en: 'Current formation spacing' }} value={cfg.formation.spacing} unit="m" src={ex('formation.spacing')} />
          <Stat label={{ ko: '지연 여유 τ* / τ_loop', en: 'Delay margin τ* / τ_loop' }} value={marginFactor} unit="×" src={der('ch7#delay-bound')} status={cfg.comm.topology === 'p2p' ? undefined : marginFactor < 1 ? 'bad' : marginFactor < 2 ? 'warn' : 'good'} />
        </StatRow>
        {examples.length > 0 && <p><Status kind="warn">{tr({ ko: '예시값 기준', en: 'Based on example values' })}</Status> <T ko={`결론의 숫자는 **예시값 기준**입니다. 수치 입력 ${examples.length}개{{ex}}와 구성 선택 ${nConfigChoices}개{{ex}}를 아직 측정이나 결정으로 바꾸지 않았습니다(아래 '실제 측정으로 채워야 할 예시값' 표).`} en={`The numbers of this conclusion are **based on example values**: ${examples.length}{{ex}} numeric inputs and ${nConfigChoices}{{ex}} configuration choices have not yet been replaced by measurements or decisions (see the example-value table below).`} /></p>}
        <div class="card">
          <div class="card-title">{tr({ ko: '점검 항목', en: 'Checks' })}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {checks.map((c, i) => <li key={i}>{c.ok === 'info' ? <span class="small muted" style={{ fontWeight: 600 }}>ⓘ {tr({ ko: '참고', en: 'Info' })}</span> : <Status kind={c.ok}>{tr({ good: { ko: '좋음', en: 'OK' }, warn: { ko: '주의', en: 'Caution' }, bad: { ko: '문제', en: 'Problem' } }[c.ok])}</Status>} <T ko={c.ko} en={c.en} /><SrcBadge src={c.src} /></li>)}
          </ul>
          <p class="small muted" style={{ margin: '8px 0 0' }}><T ko="판정 기준(지연 여유 2배{{ex}}, PDOP 3{{ex}}, 앵커 높이 차 0.5 m{{ex}})은 이 교재가 정한 값이지 확립된 기준이 아닙니다." en="The criteria (delay margin factor 2{{ex}}, PDOP 3{{ex}}, anchor height difference 0.5 m{{ex}}) are choices of this textbook, not established standards." /></p>
        </div>
      </section>

      <section class="section">
        <h2>{tr({ ko: '시스템 요약', en: 'System summary' })}</h2>
        <div class="table-wrap">
          <table class="tbl">
            <tbody>
              <tr><th>{tr({ ko: '강당', en: 'Hall' })}</th><td><CfgVal path="hall.x" /> × <CfgVal path="hall.y" /> × <CfgVal path="hall.z" /></td></tr>
              <tr><th>{tr({ ko: 'UWB', en: 'UWB' })}</th><td>{cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> · {tr({ ko: '앵커', en: 'anchors' })} {cfg.anchors.length}<SrcBadge src={ex(undefined, { ko: '설정의 앵커 목록', en: 'Anchor list in settings' })} /> · σ <CfgVal path={cfg.uwb.mode === 'tdoa' ? 'uwb.sigmaTdoa' : 'uwb.sigmaTwr'} /> · NLOS <CfgVal path="uwb.pNlos" /> · {tr({ ko: '게이트', en: 'gate' })} <CfgVal path="uwb.gateSigma" /></td></tr>
              <tr><th>{tr({ ko: '기체', en: 'Vehicle' })}</th><td>{cfg.vehicle.preset === 'cf21bl' ? 'Crazyflie 2.1 Brushless' : tr({ ko: '사용자 정의', en: 'Custom' })} · {tr({ ko: '모터 대각', en: 'motor diagonal' })} <CfgVal path="vehicle.diag" /> · {tr({ ko: '이륙 중량', en: 'take-off mass' })} <CfgVal path="vehicle.mass" /> · {tr({ ko: '비행 시간', en: 'flight time' })} <CfgVal path="vehicle.flightTime" /> · {tr({ ko: '최대 속도', en: 'max. speed' })} v_max <CfgVal path="vehicle.vMax" /></td></tr>
              <tr><th>{tr({ ko: '통신', en: 'Communication' })}</th><td>{tr(cfg.comm.topology === 'ground' ? { ko: '지상국 중계', en: 'Ground relay' } : { ko: '기체 간 직접', en: 'Direct (P2P)' })}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> ({commHops(cfg)} {tr({ ko: '구간', en: 'hop(s)' })}) · <CfgVal path="comm.rate" /> · {tr({ ko: '지연', en: 'delay' })} <CfgVal path="comm.delayMean" /> ± <CfgVal path="comm.delayJitter" /> · {tr({ ko: '손실', en: 'loss' })} {fmt(b.lossRate * 100, 3)} %<SrcBadge src={der('ch7#ge-stationary')} /> · L₉₉.₉ = {burst} {tr({ ko: '패킷', en: 'pkts' })}<SrcBadge src={der('ch7#ge-stationary')} /></td></tr>
              <tr><th>{tr({ ko: '대형', en: 'Formation' })}</th><td>{tr({ ko: '모양', en: 'shape' })} {tr(SHAPE[cfg.formation.shape] ?? { ko: cfg.formation.shape, en: cfg.formation.shape })}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> · {tr({ ko: '간격', en: 'spacing' })} <CfgVal path="formation.spacing" /> · {tr({ ko: '고도', en: 'height' })} <CfgVal path="formation.height" /> · {tr({ ko: '이동 속도', en: 'cruise speed' })} <CfgVal path="formation.cruiseSpeed" /> · {tr({ ko: '대형 유지 게인', en: 'formation gain' })} k <CfgVal path="comm.gain" /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h2>{tr({ ko: '앵커 배치와 DOP', en: 'Anchor layout and DOP' })}</h2>
        <StatRow>
          <Stat label={{ ko: '강당 중심 HDOP', en: 'HDOP at hall centre' }} value={b.dop.hdop} src={der('ch2#gdop')} />
          <Stat label={{ ko: '강당 중심 VDOP', en: 'VDOP at hall centre' }} value={b.dop.vdop} src={der('ch2#gdop')} status={b.dop.vdop > 3 ? 'warn' : undefined} />
          <Stat label={{ ko: '비행 고도 평면 PDOP 평균', en: 'Mean PDOP on the flight plane' }} value={pdopMean} src={der('ch2#gdop')} />
          <Stat label={{ ko: 'PDOP > 3 인 면적 비율', en: 'Area with PDOP > 3' }} value={badArea * 100} unit="%" src={der('ch2#gdop')} status={badArea > 0.2 ? 'warn' : undefined} />
        </StatRow>
        <PlanView hall={cfg.hall} anchors={cfg.anchors} heat={{ values: heat.values, min: 0.5, max: 4, label: { ko: `PDOP (${cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'}, 고도 ${fmt(cfg.formation.height)} m)`, en: `PDOP (${cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'}, height ${fmt(cfg.formation.height)} m)` } }} src={der('ch2#gdop')} maxHeight={360} testId="report-plan">
          {(s) => (
            <g pointer-events="none">
              <circle cx={s.sx(center[0])} cy={s.sy(center[1])} r={R * s.k} fill="none" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="6 4" />
              {offsets.map((o, i) => (
                <g key={i}>
                  <circle cx={s.sx(center[0] + o[0])} cy={s.sy(center[1] - R + o[1])} r="7" fill={seriesColor(i + 1)} stroke="var(--surface)" stroke-width="1.5" />
                  <text x={s.sx(center[0] + o[0])} y={s.sy(center[1] - R + o[1]) + 3.5} text-anchor="middle" fill="#fff" font-size="9" font-weight="700">{i + 1}</text>
                </g>
              ))}
            </g>
          )}
        </PlanView>
        <p class="muted small">{tr({ ko: '점선 원은 대형 중심이 도는 경로, 번호가 붙은 원은 출발 위치의 드론 5대, 마름모는 앵커(A0…)와 그 높이 z 입니다. 비행 고도 평면 전체에서의 PDOP 최댓값(점검 항목의 값은 대형 경로 위 24점만 본 것)', en: 'The dashed circle is the path of the formation centre, numbered circles are the five drones at the start, diamonds are anchors (A0…) with height z. Maximum PDOP over the whole flight plane (the check above looks only at the 24 points of the formation path)' })}: {fmt(pdopMax, 3)}<SrcBadge src={der('ch2#gdop')} /></p>
        <div class="no-print">
          <Scene3D
            ariaLabel={tr({ ko: '강당, 앵커, 대형의 3차원 보기', en: '3-D view of the hall, anchors and formation' })} height={300} testId="report-3d"
            target={[cfg.hall.x / 2, cfg.hall.y / 2, cfg.hall.z / 3]} cameraPos={[cfg.hall.x * 1.25, -cfg.hall.y * 0.9, cfg.hall.z * 1.9]}
            deps={[cfg.hall, cfg.anchors, cfg.formation, b.minSepH, b.minSepV]}
            src={ex(undefined, { ko: '설정의 강당·앵커·대형을 그대로 그린 그림. 반투명 타원체의 지름은 권장 최소 간격입니다.', en: 'The hall, anchors and formation from the settings. Translucent ellipsoid diameters are the recommended minimum spacings.' })}
            build={(c) => {
              c.floorGrid(cfg.hall.x, cfg.hall.y, cfg.hall.x > 12 ? 5 : 1);
              c.wireBox([0, 0, 0], [cfg.hall.x, cfg.hall.y, cfg.hall.z]);
              cfg.anchors.forEach((a, i) => { c.marker(a, 2, 0.22); c.label([a[0], a[1], a[2] + 0.55], `A${i}`); c.line([[a[0], a[1], 0], a], '--text-3', true); });
              offsets.forEach((o, i) => {
                const p = [center[0] + o[0], center[1] - R + o[1], center[2] + o[2]];
                c.marker(p, i + 1, 0.12);
                c.ellipsoid(p, [b.minSepH / 2, b.minSepH / 2, b.minSepV / 2], i + 1, 0.22);
              });
            }}
          />
        </div>
        <div class="table-wrap" style={{ marginTop: '10px' }}>
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '앵커', en: 'Anchor' })}</th><th class="r">x [m]</th><th class="r">y [m]</th><th class="r">z [m]</th><th>{tr({ ko: '출처 (x, y, z 모두)', en: 'Source (x, y and z)' })}</th></tr></thead>
            <tbody>{cfg.anchors.map((a, i) => <tr key={i}><td>A{i}</td><td class="r">{fmt(a[0], 4)}</td><td class="r">{fmt(a[1], 4)}</td><td class="r">{fmt(a[2], 4)}</td><td><SrcBadge src={ex(undefined, { ko: '설정의 앵커 좌표. 실제로 잰 값으로 바꾸세요.', en: 'Anchor coordinates from settings. Replace with surveyed values.' })} /></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h2>{tr({ ko: '오차 예산', en: 'Error budget' })}</h2>
        <div class="grid-2">
          <div>
            <h3>{tr({ ko: '수평 [cm]', en: 'Horizontal [cm]' })}</h3>
            <Waterfall items={wf(false)} unit="cm" testId="report-waterfall-h" />
          </div>
          <div>
            <h3>{tr({ ko: '수직 [cm]', en: 'Vertical [cm]' })}</h3>
            <Waterfall items={wf(true)} unit="cm" testId="report-waterfall-v" />
          </div>
        </div>
        <P ko="무작위 오차(추정 오차와 추종 오차)는 두 기체가 독립이라고 보고 제곱합한 뒤 $k_\sigma\sqrt{2}$ 를 곱했고, 편향과 지연 항은 그대로 더했습니다(8장)."
          en="Random errors (estimation and tracking) of the two drones are assumed independent, combined in quadrature and multiplied by $k_\sigma\sqrt{2}$; bias and delay terms are added directly (ch. 8)." />
        <h3>{tr({ ko: '항목별 상세', en: 'Item details' })}</h3>
        <div ref={wideRef}>{narrow ? <BudgetCards /> : <BudgetTable all />}</div>
      </section>

      <section class="section">
        <h2>{tr({ ko: '실제 측정으로 채워야 할 예시값', en: 'Example values to replace with measurements' })}</h2>
        <P ko={`아래 ${examples.length}개 수치 입력은 출처가 없는 가정입니다. 그 밖에 구성 선택 ${nConfigChoices}개(앵커 좌표, 앵커 수, UWB 모드, 통신 구조, 대형 모양)도 예시값입니다. 앵커 좌표는 6장의 측량으로 바꾸고, 나머지 넷은 여러분이 정합니다. 이 리포트의 결론은 이 값들만큼만 믿을 수 있습니다. 표는 **값이 2배가 되면 권장 간격이 얼마나 바뀌는지**(9장의 민감도)가 큰 순서이고, '어떻게 정하나' 열이 측정할 값과 정할 값을 나눕니다.`}
          en={`The ${examples.length} numeric inputs below are assumptions with no source. In addition, ${nConfigChoices} configuration choices (anchor coordinates, number of anchors, UWB mode, communication structure, formation shape) are example values too: survey the anchor coordinates as in chapter 6 and decide the other four yourself. The conclusions of this report are only as trustworthy as these values. The table is ordered by **how much the recommended spacing changes when the value doubles** (the sensitivity of chapter 9), and the column 'How to set it' separates values to measure from values to choose.`} />
        <div class="table-wrap">
          <table class="tbl" data-testid="report-examples">
            <thead><tr>{!narrow && <th>{tr({ ko: '분류', en: 'Group' })}</th>}<th>{tr({ ko: '입력', en: 'Input' })}</th><th class="r">{tr({ ko: '지금 값', en: 'Current value' })}</th><th class="r">{tr({ ko: '2배면 간격', en: 'Spacing if doubled' })}</th><th>{tr({ ko: '어떻게 정하나', en: 'How to set it' })}</th><th class="no-print" /></tr></thead>
            <tbody>
              {exRows.map(({ f, d, how }) => (
                <tr key={f.path}>
                  {!narrow && <td class="muted small">{tr(GROUP_LABELS[f.group])}</td>}<td>{tr(f.label)}{narrow && <div class="muted small">{tr(GROUP_LABELS[f.group])}</div>}</td><td class="r"><CfgVal path={f.path} /></td>
                  <td class="r"><b class="num">+{fmt(d * 100, 2)} cm</b><SrcBadge src={SENS} /></td>
                  <td class="small"><b>{tr(HOW_LABEL[how[0]])}</b>{tr(how[1]) !== tr(HOW_LABEL[how[0]]) && <> · {tr(how[1])}</>}</td>
                  <td class="no-print"><button type="button" class="btn ghost small" style={{ minHeight: narrow ? '34px' : '26px', padding: '0 8px', whiteSpace: 'nowrap' }} onClick={() => openSettingsAt(f.path)}>{tr({ ko: '바꾸기', en: 'Change' })}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div class="card note">
        <div class="card-title">{tr({ ko: '이 리포트의 한계', en: 'Limits of this report' })}</div>
        <P ko={`이 리포트는 교재의 단순화한 모델로 계산한 것입니다. 기체는 속도 명령을 그대로 따르는 질점으로 보았고, 측정 오차는 표본마다 독립이라고 가정했으며, Crazyflie 펌웨어와 Crazyswarm2 의 내부 동작을 재현하지 않습니다. 실제 비행 전에는 반드시 넓은 간격에서 시작하세요. 이 교재의 권고는 **첫 비행 간격을 권장 최소 수평 간격의 2배{{ex}} 이상**, 지금 설정으로 ${fmt(2 * b.minSepH, 3)} m{{der:ch8#budget-sum|권장 최소 수평 간격 × 2|recommended minimum horizontal spacing × 2}} 이상으로 잡는 것입니다. 그다음 로그를 측정하고, 그 값으로 이 리포트를 다시 계산하세요.`}
          en={`This report is computed with the simplified models of the textbook. Vehicles are point masses that follow velocity commands, measurement errors are assumed independent between samples, and the internals of the Crazyflie firmware and Crazyswarm2 are not reproduced. Before real flights, always start with wide spacing: this textbook recommends a **first-flight spacing of at least twice{{ex}} the recommended minimum horizontal spacing**, i.e. at least ${fmt(2 * b.minSepH, 3)} m{{der:ch8#budget-sum|권장 최소 수평 간격 × 2|recommended minimum horizontal spacing × 2}} with the current settings. Then measure logs and recompute this report with those values.`} />
        {nextToMeasure.length > 0 && (
          <>
            <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>{tr({ ko: '다음에 잴 것 (민감도가 큰 측정값 순)', en: 'Measure next (measurable values, largest sensitivity first)' })}</p>
            <ol style={{ margin: '0 0 8px' }}>
              {nextToMeasure.map((r) => <li key={r.f.path}>{tr(r.f.label)} — {tr(r.how[1])} · {tr({ ko: '2배면 간격', en: 'spacing if doubled' })} <b class="num">+{fmt(r.d * 100, 2)} cm</b><SrcBadge src={SENS} /></li>)}
            </ol>
          </>
        )}
      </div>

      <div class="card">
        <div class="card-title">{tr({ ko: '측정 기록 (인쇄해서 손으로 채우세요)', en: 'Measurement record (print and fill in by hand)' })}</div>
        <div class="table-wrap">
          <table class="tbl" data-testid="report-record">
            <tbody>
              {[
                { ko: '측정 날짜', en: 'Date of measurement' }, { ko: '장소 (강당)', en: 'Place (hall)' }, { ko: '측정한 사람', en: 'Measured by' },
                { ko: '측위 모드 · 앵커 수', en: 'Positioning mode · number of anchors' }, { ko: '로그 주기 · 기록 길이', en: 'Log rate · recording length' },
                { ko: '기체 수 · 펌웨어 / Crazyswarm2 버전', en: 'Number of vehicles · firmware / Crazyswarm2 version' }, { ko: '원본 로그 파일 이름', en: 'Original log file names' },
              ].map((l, i) => <tr key={i}><th style={{ width: '40%' }}>{tr(l)}</th><td style={{ height: '28px' }} /></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
