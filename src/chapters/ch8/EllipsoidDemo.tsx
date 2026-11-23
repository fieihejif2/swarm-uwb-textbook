/** 데모 1-B: 3D 안전 타원체. 두 타원체가 겹치면 예산 위반이다. 같은 내용을 숫자와 2D 그래프로도 보여 준다. */
import { useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { formationOffsets } from '../../sim/formation';
import { Vec, vadd, vsub } from '../../sim/linalg';
import { ellipsoidDistance } from '../../sim/safety';
import { der, ex } from '../../sources';
import { Caption, Demo, LineChart, P, Scene3D, Segmented, Slider, Stat, StatRow, Status } from '../../ui';

const A0: Vec = [1.6, 2, 1.2];

export function EllipsoidDemo() {
  const cfg = config.value, b = budget.value;
  const [view, setView] = useState<'pair' | 'formation'>('pair');
  const [rho, setRho] = useState(Math.min(2, cfg.formation.spacing));
  const [elev, setElev] = useState(0);
  // 예산 타원체: 수평 반축 d_minH/2, 수직 반축 d_minV/2
  const a = b.minSepH / 2, c = b.minSepV / 2;
  const kEff = b.minSepV / b.minSepH;
  const kz = cfg.safety.downwashRatio, body = cfg.vehicle.envelope;
  const th = (elev * Math.PI) / 180;
  const needAt = (t: number, limit: number, k: number) => limit / Math.sqrt(Math.cos(t) ** 2 + (Math.sin(t) / k) ** 2);

  // 기체 위치
  let pos: Vec[];
  if (view === 'pair') pos = [A0, vadd(A0, [rho * Math.cos(th), 0, rho * Math.sin(th)])];
  else {
    const off = formationOffsets(cfg.formation.shape, cfg.formation.spacing, cfg.nDrones);
    const zLow = Math.min(...off.map((o) => o[2]));
    const centre: Vec = [2, 2, Math.max(cfg.formation.height, c + 0.2 - zLow)];
    pos = off.map((o) => vadd(o, centre));
  }
  // 쌍마다 타원체 거리(z 를 kEff 로 줄인 거리)를 한계 d_minH 와 비교
  const bad = pos.map(() => false);
  let dMinPair = Infinity;
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const d = ellipsoidDistance(vsub(pos[i], pos[j]), kEff);
      if (d < dMinPair) dMinPair = d;
      if (d < b.minSepH - 1e-9) { bad[i] = true; bad[j] = true; }
    }
  const ok = !bad.some(Boolean);
  const need = needAt(th, b.minSepH, kEff);
  const angles = Array.from({ length: 91 }, (_, i) => i);
  const GEO = der('ch8#downwash', { ko: '수평 반축 d_minH/2, 수직 반축 d_minV/2 인 타원체 두 개가 닿는 조건', en: 'Touching condition of two ellipsoids with horizontal semi-axis d_minH/2 and vertical semi-axis d_minV/2' });
  return (
    <Demo title={{ ko: '3D 안전 타원체: 겹치면 위반', en: '3-D safety ellipsoids: overlap means violation' }} testId="ch8-ellipsoid-demo">
      <P ko="기체마다 반투명한 타원체를 하나씩 씌웠습니다. 수평 반축은 권장 수평 간격의 절반, 수직 반축은 권장 수직 간격의 절반입니다. **두 타원체가 겹치지 않으면** 두 기체는 어느 방향으로든 예산이 요구하는 만큼 떨어져 있는 것입니다. 가운데의 작은 구가 기체입니다."
        en="Each vehicle wears a translucent ellipsoid. Its horizontal semi-axis is half the recommended horizontal spacing; its vertical semi-axis is half the recommended vertical spacing. **If two ellipsoids do not overlap**, the two vehicles are as far apart as the budget demands in whatever direction. The small sphere in the middle is the vehicle." />
      <Segmented label={{ ko: '무엇을 볼까', en: 'What to show' }} value={view} onChange={setView} testId="ch8-ellipsoid-view" options={[
        { value: 'pair', label: { ko: '두 대: 한 대를 돌려 보기', en: 'Two drones: move one around' } },
        { value: 'formation', label: { ko: '지금 대형 5대', en: 'Current five-drone formation' } },
      ]} />
      {view === 'pair' && (
        <div class="controls">
          <Slider label={{ ko: '두 기체 중심 사이의 거리', en: 'Centre-to-centre distance' }} value={rho} min={0.3} max={2} step={0.05} unit="m" onChange={setRho} src={ex('formation.spacing', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 대형 간격입니다.', en: 'Local to this demo; starts from the global formation spacing.' })} testId="ch8-ellipsoid-rho" />
          <Slider label={{ ko: 'B 가 A 를 올려다보는 각도 (0° = 옆, 90° = 바로 위)', en: 'Elevation of B seen from A (0° = beside, 90° = directly above)' }} value={elev} min={0} max={90} step={5} unit="°" onChange={setElev} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch8-ellipsoid-elev" />
        </div>
      )}
      <Scene3D
        testId="ch8-scene" height={340} target={[2, 2, 1.5]} cameraPos={[5.4, -3.2, 2.9]}
        deps={[view, rho, elev, a, c, body, cfg.formation.shape, cfg.formation.spacing, cfg.formation.height]}
        ariaLabel={tr({
          ko: `기체 ${pos.length}대와 안전 타원체의 3차원 그림. 가장 가까운 쌍의 타원체 거리 ${fmt(dMinPair)} m, 한계 ${fmt(b.minSepH)} m, ${ok ? '겹치지 않음' : '겹침'}`,
          en: `3-D picture of ${pos.length} vehicles and their safety ellipsoids. Closest pair: ellipsoidal distance ${fmt(dMinPair)} m, limit ${fmt(b.minSepH)} m, ${ok ? 'no overlap' : 'overlap'}`,
        })}
        src={GEO}
        build={(ctx) => {
          ctx.floorGrid(4, 4, 1);
          pos.forEach((q, i) => {
            ctx.ellipsoid(q, [a, a, c], bad[i] ? 8 : view === 'pair' ? (i === 0 ? 1 : 3) : 1, 0.28);
            ctx.marker(q, bad[i] ? 8 : view === 'pair' ? (i === 0 ? 1 : 3) : 1, Math.max(0.04, body / 2));
            ctx.line([[q[0], q[1], 0], q], '--text-3', true);
            ctx.label([q[0], q[1], q[2] + c + 0.12], view === 'pair' ? (i === 0 ? 'A' : 'B') : String(i + 1));
          });
          if (view === 'pair') ctx.line([pos[0], pos[1]], ok ? '--text-2' : 8);
        }}
      />
      <StatRow>
        <Stat label={view === 'pair' ? { ko: 'A–B 타원체 거리', en: 'A–B ellipsoidal distance' } : { ko: '가장 가까운 쌍의 타원체 거리', en: 'Ellipsoidal distance of the closest pair' }} value={dMinPair} unit="m" src={der('ch8#downwash', { ko: 'z 성분을 k_eff = d_minV / d_minH 로 나눈 뒤 잰 거리', en: 'Distance after dividing the z component by k_eff = d_minV / d_minH' })} status={ok ? 'good' : 'bad'} />
        <Stat label={{ ko: '한계 (권장 수평 간격)', en: 'Limit (recommended horizontal spacing)' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum')} />
        <Stat label={{ ko: '예산 타원체의 세로/가로 비 $k_{\\text{eff}}$', en: 'Height/width ratio of the budget ellipsoid $k_{\\text{eff}}$' }} value={kEff} src={der('ch8#downwash', { ko: '권장 수직 간격 ÷ 권장 수평 간격', en: 'Recommended vertical ÷ horizontal spacing' })} />
        {view === 'pair' && <Stat label={{ ko: '이 방향에서 필요한 중심 거리', en: 'Centre distance needed in this direction' }} value={need} unit="m" src={GEO} />}
      </StatRow>
      <p>
        {ok
          ? <Status kind="good">{tr({ ko: '타원체가 겹치지 않습니다: 예산을 만족합니다', en: 'The ellipsoids do not overlap: the budget is met' })}</Status>
          : <Status kind="bad">{tr({ ko: '타원체가 겹칩니다(붉게 표시): 예산 위반', en: 'The ellipsoids overlap (shown in red): budget violated' })}</Status>}
      </p>
      <LineChart
        title={{ ko: '방향에 따라 필요한 중심 사이 거리 (3D 그림과 같은 내용)', en: 'Centre distance needed versus direction (same content as the 3-D picture)' }}
        xLabel={{ ko: '올려다보는 각도 [°]', en: 'Elevation angle [°]' }} yLabel={{ ko: '필요한 중심 거리 [m]', en: 'Required centre distance [m]' }} height={230}
        series={[
          { name: { ko: '예산 타원체 (오차·지연 포함)', en: 'Budget ellipsoid (errors and delays included)' }, x: angles, y: angles.map((d) => needAt((d * Math.PI) / 180, b.minSepH, kEff)), slot: 1, dash: '' },
          { name: { ko: '기체 + 다운워시만 (비율 k_z)', en: 'Body + downwash only (ratio k_z)' }, x: angles, y: angles.map((d) => needAt((d * Math.PI) / 180, body, kz)), slot: 2, dash: '7 4' },
          ...(view === 'pair' ? [{ name: { ko: '지금 B 의 위치', en: 'Current position of B' }, x: [elev], y: [rho], slot: 3, points: true }] : []),
        ]}
        refLines={view === 'pair' ? [{ x: elev, slot: 3, label: { ko: '지금 B', en: 'B now' } }] : undefined}
        xDomain={[-4, 92]} yDomain={[0, Math.max(2.1, b.minSepV * 1.1)]} src={GEO} testId="ch8-need-chart" />
      <Caption>{tr({
        ko: '점이 실선 위쪽에 있으면 안전합니다. 실선(예산 타원체)은 점선(기체와 다운워시만)보다 덜 길쭉합니다. 측위 오차와 지연 항은 k_z 배로 늘어나지 않고 수평·수직에 거의 같은 크기로 더해지기 때문입니다. 대형이 화면을 벗어나면 휠이나 − 키로 축소하세요.',
        en: 'A point above the solid line is safe. The solid line (budget ellipsoid) is less elongated than the dashed one (body and downwash only), because positioning error and delay terms are not stretched by k_z; they add nearly the same amount horizontally and vertically. If the formation leaves the view, zoom out with the wheel or the − key.',
      })}</Caption>
    </Demo>
  );
}
