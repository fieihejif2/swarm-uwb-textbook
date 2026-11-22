/** 마지막 페이지: 지금 설정으로 계산한 "우리 시스템 리포트". 브라우저 인쇄(PDF 저장)용 스타일시트가 적용된다. */
import { useEffect, useMemo } from 'preact/hooks';
import { BUDGET_LABELS } from '../app/budgetLabels';
import { FIELDS, GROUP_LABELS, fieldSource } from '../app/fields';
import { fmt, lang, tr } from '../app/i18n';
import { budget, config, getPath, openSettingsAt, visited } from '../app/store';
import { commHops } from '../sim/budget';
import { formationOffsets } from '../sim/formation';
import { dopFor, dopGrid, insideAnchorBox } from '../sim/positioning';
import { burstLengthQuantile } from '../sim/loss';
import { der, ex } from '../sources';
import { CfgVal, SrcBadge } from '../ui/Badge';
import { BudgetTable } from '../ui/BudgetBar';
import { Stat, StatRow, Status } from '../ui/blocks';
import { PlanView } from '../ui/PlanView';
import { Waterfall, seriesColor } from '../ui/Plot';
import { Scene3D } from '../ui/Scene3D';
import { P } from '../ui/Tx';

const CALC = der('ch8#budget-sum', { ko: '현재 설정값을 교재의 식에 넣어 계산한 값', en: 'Computed from the current settings with the textbook formulas' });

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
  const items = b.items.filter((i) => ['body', 'est-sigma', 'tracking', 'anchor-bias', 'est-latency', 'comm-delay', 'comm-gap', 'margin'].includes(i.id));
  const k = cfg.safety.kSigma;
  const est = b.items.find((i) => i.id === 'est-sigma')!;
  const rand = (sig: number) => k * Math.SQRT2 * Math.hypot(sig, cfg.safety.trackingError);
  const wf = (vertical: boolean) => [
    { label: BUDGET_LABELS.body, value: vertical ? cfg.vehicle.envelope * cfg.safety.downwashRatio : cfg.vehicle.envelope, slot: 7 },
    { label: { ko: `무작위 오차 (${fmt(k)}σ, 두 기체)`, en: `Random errors (${fmt(k)}σ, two drones)` }, value: rand(vertical ? est.valueV! : est.value), slot: 1 },
    ...items.filter((i) => ['anchor-bias', 'est-latency', 'comm-delay', 'comm-gap', 'margin'].includes(i.id)).map((i, n) => ({ label: BUDGET_LABELS[i.id], value: vertical && i.valueV !== undefined ? i.valueV : i.value, slot: [2, 3, 4, 5, 6][n] })),
    { label: BUDGET_LABELS['min-sep'], value: vertical ? b.minSepV : b.minSepH, total: true },
  ].map((r) => ({ ...r, value: r.value * 100, src: CALC }));
  const checks: { ok: 'good' | 'warn' | 'bad'; ko: string; en: string }[] = [
    b.spacingOk
      ? { ok: 'good', ko: `대형 간격 ${fmt(cfg.formation.spacing)} m 가 권장 최소 수평 간격 ${fmt(b.minSepH, 3)} m 이상입니다.`, en: `Formation spacing ${fmt(cfg.formation.spacing)} m is at least the recommended horizontal minimum ${fmt(b.minSepH, 3)} m.` }
      : { ok: 'bad', ko: `대형 간격 ${fmt(cfg.formation.spacing)} m 가 권장 최소 수평 간격 ${fmt(b.minSepH, 3)} m 보다 좁습니다. 간격을 넓히거나 오차·지연을 줄이세요.`, en: `Formation spacing ${fmt(cfg.formation.spacing)} m is below the recommended horizontal minimum ${fmt(b.minSepH, 3)} m. Widen it or reduce errors and delay.` },
    cfg.formation.shape === 'stack' && cfg.formation.spacing < b.minSepV
      ? { ok: 'bad', ko: `수직으로 쌓는 대형인데 간격이 권장 수직 간격 ${fmt(b.minSepV, 3)} m 보다 좁습니다(다운워시).`, en: `Vertical stack with spacing below the recommended vertical minimum ${fmt(b.minSepV, 3)} m (downwash).` }
      : { ok: 'good', ko: `위아래로 겹칠 때 필요한 수직 간격은 ${fmt(b.minSepV, 3)} m 입니다.`, en: `If drones overlap vertically, the required vertical spacing is ${fmt(b.minSepV, 3)} m.` },
    cfg.comm.topology === 'p2p'
      ? { ok: 'good', ko: '기체 간 직접 통신: 지연 한계는 안정성 조건이 아니라 참고값입니다(7장).', en: 'Direct communication: the delay bound is a reference, not a stability condition (ch. 7).' }
      : marginFactor >= 2
        ? { ok: 'good', ko: `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 는 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 의 절반 이하입니다.`, en: `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms is at most half the delay bound ${fmt(b.delayMargin * 1000, 3)} ms.` }
        : marginFactor >= 1
          ? { ok: 'warn', ko: `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 가 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 의 절반을 넘습니다. 게인을 낮추는 것이 안전합니다.`, en: `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms exceeds half the delay bound ${fmt(b.delayMargin * 1000, 3)} ms. Lowering the gain is safer.` }
          : { ok: 'bad', ko: `루프 지연 ${fmt(b.loopDelay * 1000, 3)} ms 가 지연 한계 ${fmt(b.delayMargin * 1000, 3)} ms 를 넘었습니다. 이 게인으로는 대형이 진동합니다.`, en: `Loop delay ${fmt(b.loopDelay * 1000, 3)} ms exceeds the delay bound ${fmt(b.delayMargin * 1000, 3)} ms. The formation will oscillate with this gain.` },
    cfg.uwb.mode === 'tdoa' && outside > 0
      ? { ok: 'bad', ko: `TDoA 모드인데 대형 경로의 ${outside}/24 지점이 앵커가 둘러싼 공간 밖입니다(2장).`, en: `TDoA mode, but ${outside}/24 points of the formation path lie outside the anchor volume (ch. 2).` }
      : { ok: 'good', ko: '대형 경로가 앵커가 둘러싼 공간 안에 있습니다.', en: 'The formation path stays inside the anchor volume.' },
    sameHeight
      ? { ok: 'warn', ko: '앵커 높이가 거의 같습니다. 수직 방향 정확도가 나빠집니다(2장).', en: 'Anchors are at nearly the same height; vertical accuracy suffers (ch. 2).' }
      : { ok: 'good', ko: '앵커 높이가 섞여 있습니다.', en: 'Anchor heights are mixed.' },
    worstDop > 3
      ? { ok: 'warn', ko: `대형 경로에서 PDOP 가 최대 ${fmt(worstDop, 3)} 까지 올라갑니다.`, en: `PDOP rises to ${fmt(worstDop, 3)} along the formation path.` }
      : { ok: 'good', ko: `대형 경로의 PDOP 는 최대 ${fmt(worstDop, 3)} 입니다.`, en: `PDOP along the formation path is at most ${fmt(worstDop, 3)}.` },
    cfg.uwb.mode === 'twr'
      ? { ok: 'warn', ko: `TWR 로 ${cfg.nDrones}대를 띄우면 드론당 위치 갱신율이 ${fmt(b.posRate, 3)} Hz 로 떨어집니다(3장). 공식 문서는 TWR 에서 태그 1대만 지원한다고 합니다.`, en: `With TWR and ${cfg.nDrones} drones the per-drone position rate drops to ${fmt(b.posRate, 3)} Hz (ch. 3). The official docs state TWR positions a single tag.` }
      : { ok: 'good', ko: `TDoA: 드론당 위치 갱신율 ${fmt(b.posRate, 3)} Hz (태그 수와 무관).`, en: `TDoA: ${fmt(b.posRate, 3)} Hz position rate per drone (independent of the number of tags).` },
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
        <div class="card">
          <div class="card-title">{tr({ ko: '점검 항목', en: 'Checks' })}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {checks.map((c, i) => <li key={i}><Status kind={c.ok}>{tr({ good: { ko: '좋음', en: 'OK' }, warn: { ko: '주의', en: 'Caution' }, bad: { ko: '문제', en: 'Problem' } }[c.ok])}</Status> {tr(c)}<SrcBadge src={CALC} /></li>)}
          </ul>
        </div>
      </section>

      <section class="section">
        <h2>{tr({ ko: '시스템 요약', en: 'System summary' })}</h2>
        <div class="table-wrap">
          <table class="tbl">
            <tbody>
              <tr><th>{tr({ ko: '강당', en: 'Hall' })}</th><td><CfgVal path="hall.x" /> × <CfgVal path="hall.y" /> × <CfgVal path="hall.z" /></td></tr>
              <tr><th>{tr({ ko: 'UWB', en: 'UWB' })}</th><td>{cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> · {tr({ ko: '앵커', en: 'anchors' })} {cfg.anchors.length}<SrcBadge src={ex(undefined, { ko: '설정의 앵커 목록', en: 'Anchor list in settings' })} /> · σ <CfgVal path={cfg.uwb.mode === 'tdoa' ? 'uwb.sigmaTdoa' : 'uwb.sigmaTwr'} /> · NLOS <CfgVal path="uwb.pNlos" /> · {tr({ ko: '게이트', en: 'gate' })} <CfgVal path="uwb.gateSigma" /></td></tr>
              <tr><th>{tr({ ko: '기체', en: 'Vehicle' })}</th><td>{cfg.vehicle.preset === 'cf21bl' ? 'Crazyflie 2.1 Brushless' : tr({ ko: '사용자 정의', en: 'Custom' })} · <CfgVal path="vehicle.diag" /> · <CfgVal path="vehicle.mass" /> · <CfgVal path="vehicle.flightTime" /> · v_max <CfgVal path="vehicle.vMax" /></td></tr>
              <tr><th>{tr({ ko: '통신', en: 'Communication' })}</th><td>{tr(cfg.comm.topology === 'ground' ? { ko: '지상국 중계', en: 'Ground relay' } : { ko: '기체 간 직접', en: 'Direct (P2P)' })}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> ({commHops(cfg)} {tr({ ko: '구간', en: 'hop(s)' })}) · <CfgVal path="comm.rate" /> · {tr({ ko: '지연', en: 'delay' })} <CfgVal path="comm.delayMean" /> ± <CfgVal path="comm.delayJitter" /> · {tr({ ko: '손실', en: 'loss' })} {fmt(b.lossRate * 100, 3)} %<SrcBadge src={der('ch7#ge-stationary')} /> · L₉₉.₉ = {burst} {tr({ ko: '패킷', en: 'pkts' })}<SrcBadge src={der('ch7#ge-stationary')} /></td></tr>
              <tr><th>{tr({ ko: '대형', en: 'Formation' })}</th><td>{cfg.formation.shape}<SrcBadge src={ex(undefined, { ko: '설계 선택', en: 'Design choice' })} /> · {tr({ ko: '간격', en: 'spacing' })} <CfgVal path="formation.spacing" /> · {tr({ ko: '고도', en: 'height' })} <CfgVal path="formation.height" /> · <CfgVal path="formation.cruiseSpeed" /> · k <CfgVal path="comm.gain" /></td></tr>
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
        <p class="muted small">{tr({ ko: '점선 원은 대형 중심이 도는 경로, 번호가 붙은 원은 출발 위치의 드론 5대, 마름모는 앵커(A0…)와 그 높이 z 입니다. PDOP 최댓값', en: 'The dashed circle is the path of the formation centre, numbered circles are the five drones at the start, diamonds are anchors (A0…) with height z. Maximum PDOP' })}: {fmt(pdopMax, 3)}<SrcBadge src={der('ch2#gdop')} /></p>
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
            <thead><tr><th>{tr({ ko: '앵커', en: 'Anchor' })}</th><th class="r">x [m]</th><th class="r">y [m]</th><th class="r">z [m]</th></tr></thead>
            <tbody>{cfg.anchors.map((a, i) => <tr key={i}><td>A{i}</td><td class="r">{fmt(a[0], 4)}</td><td class="r">{fmt(a[1], 4)}</td><td class="r">{fmt(a[2], 4)}<SrcBadge src={ex(undefined, { ko: '설정의 앵커 좌표. 실제로 잰 값으로 바꾸세요.', en: 'Anchor coordinates from settings. Replace with surveyed values.' })} /></td></tr>)}</tbody>
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
        <BudgetTable all />
      </section>

      <section class="section">
        <h2>{tr({ ko: '실제 측정으로 채워야 할 예시값', en: 'Example values to replace with measurements' })}</h2>
        <P ko={`아래 ${examples.length}개 입력은 출처가 없는 가정입니다. 이 리포트의 결론은 이 값들만큼만 믿을 수 있습니다. 9장의 절차로 측정해 바꾸세요.`}
          en={`The ${examples.length} inputs below are assumptions with no source. The conclusions of this report are only as trustworthy as these values. Measure and replace them with the procedures of chapter 9.`} />
        <div class="table-wrap">
          <table class="tbl" data-testid="report-examples">
            <thead><tr><th>{tr({ ko: '분류', en: 'Group' })}</th><th>{tr({ ko: '입력', en: 'Input' })}</th><th class="r">{tr({ ko: '지금 값', en: 'Current value' })}</th><th class="no-print" /></tr></thead>
            <tbody>
              {examples.map((f) => (
                <tr key={f.path}>
                  <td class="muted small">{tr(GROUP_LABELS[f.group])}</td><td>{tr(f.label)}</td><td class="r"><CfgVal path={f.path} /></td>
                  <td class="no-print"><button type="button" class="btn ghost small" style={{ minHeight: '26px', padding: '0 8px' }} onClick={() => openSettingsAt(f.path)}>{tr({ ko: '바꾸기', en: 'Change' })}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div class="card note">
        <div class="card-title">{tr({ ko: '이 리포트의 한계', en: 'Limits of this report' })}</div>
        <P ko="이 리포트는 교재의 단순화한 모델로 계산한 것입니다. 기체는 속도 명령을 그대로 따르는 질점으로 보았고, 측정 오차는 표본마다 독립이라고 가정했으며, Crazyflie 펌웨어와 Crazyswarm2 의 내부 동작을 재현하지 않습니다. 실제 비행 전에는 반드시 넓은 간격에서 시작해 로그를 측정하고, 그 값으로 이 리포트를 다시 계산하세요."
          en="This report is computed with the simplified models of the textbook. Vehicles are point masses that follow velocity commands, measurement errors are assumed independent between samples, and the internals of the Crazyflie firmware and Crazyswarm2 are not reproduced. Before real flights, always start with wide spacing, measure logs, and recompute this report with those values." />
      </div>
    </article>
  );
}
