/** 이웃 위치 외삽: 마지막 위치를 그대로 쓰기(유지) 대 속도로 이어 그리기(외삽) */
import { useMemo, useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { computeBudget } from '../../sim/budget';
import { norm, vsub } from '../../sim/linalg';
import { extrapolate } from '../../sim/safety';
import { der, ex } from '../../sources';
import { Caption, Demo, LineChart, P, Slider, Stat, StatRow, Status, Toggle } from '../../ui';

export function ExtrapolateDemo() {
  const cfg = config.value, b = budget.value;
  const [v, setV] = useState(Math.max(0.1, cfg.safety.relSpeed));
  const [acc, setAcc] = useState(cfg.vehicle.aMax);
  const tCross = (2 * v) / acc;
  const tMax = Math.max(0.6, 1.25 * b.ageMax, 1.6 * Math.min(tCross, 1.5));
  const data = useMemo(() => {
    // 속력 v, 구심가속도 acc 로 원을 도는 이웃: 반지름 R = v²/acc, 각속도 w = acc/v
    const R = (v * v) / acc, w = acc / v;
    const p0 = [0, 0, 0], v0 = [v, 0, 0];
    const t: number[] = [], holdB: number[] = [], extB: number[] = [], holdS: number[] = [], extS: number[] = [];
    for (let i = 0; i <= 120; i++) {
      const age = (tMax * i) / 120;
      const p = [R * Math.sin(w * age), R * (1 - Math.cos(w * age)), 0];
      t.push(age * 1000);
      holdB.push(v * age * 100);
      extB.push(0.5 * acc * age * age * 100);
      holdS.push(norm(vsub(p, p0)) * 100);
      extS.push(norm(vsub(p, extrapolate(p0, v0, age))) * 100);
    }
    return { t, holdB, extB, holdS, extS };
  }, [v, acc, tMax]);
  const both = useMemo(() => ({
    hold: computeBudget({ ...cfg, safety: { ...cfg.safety, extrapolate: false } }),
    ext: computeBudget({ ...cfg, safety: { ...cfg.safety, extrapolate: true } }),
  }), [cfg]);
  const tCfg = (2 * cfg.safety.relSpeed) / cfg.vehicle.aMax;
  const SRC = der('ch8#extrapolate', { ko: '이론 한계 v·t, ½·a·t² 와, 속력 v·구심가속도 a 로 원을 도는 이웃에 두 방법을 적용한 결과', en: 'The bounds v·t and ½·a·t², and both methods applied to a neighbour circling at speed v with centripetal acceleration a' });
  return (
    <Demo title={{ ko: '유지 대 외삽: 정보 나이에 따른 위치 오차', en: 'Hold versus extrapolate: position error against information age' }} testId="ch8-extrap-demo">
      <P ko="이웃이 속력 $v$ 로, 가속도 $a$ 로 방향을 틀며 움직입니다(원을 돕니다). 마지막으로 받은 위치를 그대로 쓰는 **유지**와, 받은 속도로 이어 그리는 **외삽**의 오차를 정보 나이에 따라 그렸습니다. 점선은 유도에서 구한 이론 한계, 실선은 이 움직임에서 실제로 생긴 오차입니다."
        en="A neighbour moves at speed $v$ while turning with acceleration $a$ (it flies a circle). We plot, against information age, the error of **hold** (use the last received position as is) and of **extrapolate** (continue it with the received velocity). Dashed lines are the bounds from the derivation; solid lines are the errors that actually occur for this motion." />
      <div class="controls">
        <Slider label={{ ko: '이웃의 속력 $v$', en: 'Neighbour speed $v$' }} value={v} min={0.1} max={2} step={0.05} unit="m/s" onChange={setV} src={ex('safety.relSpeed', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 상대속도 가정입니다.', en: 'Local to this demo; starts from the assumed relative speed in the global settings.' })} testId="ch8-extrap-v" />
        <Slider label={{ ko: '이웃의 가속도 $a$', en: 'Neighbour acceleration $a$' }} value={acc} min={0.5} max={10} step={0.5} unit="m/s²" onChange={setAcc} src={ex('vehicle.aMax', { ko: '이 데모에서만 바꾸는 값. 처음 값은 전역 설정의 최대 가속도입니다.', en: 'Local to this demo; starts from the maximum acceleration in the global settings.' })} testId="ch8-extrap-a" />
      </div>
      <LineChart
        title={{ ko: '정보 나이에 따른 이웃 위치 오차', en: 'Neighbour position error versus information age' }}
        xLabel={{ ko: '정보 나이 [ms]', en: 'Information age [ms]' }} yLabel={{ ko: '위치 오차 [cm]', en: 'Position error [cm]' }}
        series={[
          { name: { ko: '유지: 이론 한계 v·t', en: 'Hold: bound v·t' }, x: data.t, y: data.holdB, slot: 1, dash: '7 4' },
          { name: { ko: '유지: 시뮬레이션', en: 'Hold: simulation' }, x: data.t, y: data.holdS, slot: 1, dash: '' },
          { name: { ko: '외삽: 이론 한계 ½·a·t²', en: 'Extrapolate: bound ½·a·t²' }, x: data.t, y: data.extB, slot: 2, dash: '2 3' },
          { name: { ko: '외삽: 시뮬레이션', en: 'Extrapolate: simulation' }, x: data.t, y: data.extS, slot: 2, dash: '12 4' },
        ]}
        refLines={[
          { x: tCross * 1000, label: { ko: `교차점 2v/a = ${fmt(tCross * 1000, 3)} ms`, en: `Crossover 2v/a = ${fmt(tCross * 1000, 3)} ms` }, slot: 3 },
          { x: b.ageMax * 1000, label: { ko: `지금 설정의 최대 정보 나이 ${fmt(b.ageMax * 1000, 3)} ms`, en: `Max. information age in the settings: ${fmt(b.ageMax * 1000, 3)} ms` } },
        ]}
        yDomain={[0, Math.max(...data.holdB) * 1.05]} src={SRC} testId="ch8-extrap-chart" />
      <Caption>{tr({
        ko: '실선은 항상 같은 색의 점선 아래에 있습니다(한계는 한계입니다). 나이가 짧을 때는 외삽이 훨씬 정확하고, 교차점을 지나면 외삽의 한계가 유지의 한계보다 커집니다.',
        en: 'Each solid line stays below the dashed line of the same colour (a bound is a bound). At short ages extrapolation is far more accurate; past the crossover its bound exceeds the bound for hold.',
      })}</Caption>
      <h4 style={{ margin: '14px 0 6px' }}>{tr({ ko: '우리 설정에서는 어느 쪽이 유리한가', en: 'Which one pays off with our settings' })}</h4>
      <StatRow>
        <Stat label={{ ko: '교차점 $2v_{\\text{rel}}/a_{\\max}$', en: 'Crossover $2v_{\\text{rel}}/a_{\\max}$' }} value={tCfg * 1000} unit="ms" src={der('ch8#extrapolate')} />
        <Stat label={{ ko: '예산이 대비하는 최대 정보 나이', en: 'Max. information age the budget plans for' }} value={b.ageMax * 1000} unit="ms" src={der('ch8#budget-sum', { ko: '통신 지연 + 지터 + 방송 주기 + 1000번에 1번 나오는 연속 손실 (7장)', en: 'Comm delay + jitter + broadcast period + the 1-in-1000 loss burst (ch. 7)' })} status={b.ageMax > tCfg ? 'warn' : 'good'} />
        <Stat label={{ ko: '권장 수평 간격: 유지', en: 'Min. horizontal spacing: hold' }} value={both.hold.minSepH} unit="m" src={der('ch8#budget-sum')} />
        <Stat label={{ ko: '권장 수평 간격: 외삽', en: 'Min. horizontal spacing: extrapolate' }} value={both.ext.minSepH} unit="m" src={der('ch8#extrapolate')} status={both.ext.minSepH > both.hold.minSepH ? 'warn' : 'good'} />
      </StatRow>
      <p>
        {both.ext.minSepH < both.hold.minSepH
          ? <Status kind="good">{tr({ ko: '지금 설정에서는 외삽이 권장 간격을 줄입니다', en: 'With the current settings extrapolation reduces the recommended spacing' })}</Status>
          : <Status kind="warn">{tr({ ko: '지금 설정에서는 외삽을 켜면 권장 간격이 오히려 늘어납니다 (최대 정보 나이가 교차점보다 깁니다)', en: 'With the current settings extrapolation increases the recommended spacing (the maximum information age exceeds the crossover)' })}</Status>}
      </p>
      <Toggle label={{ ko: '전역 설정: 이웃 위치 외삽 사용 (오차 예산과 다른 장의 데모에 반영됩니다)', en: 'Global setting: extrapolate neighbour positions (affects the error budget and demos in other chapters)' }}
        checked={cfg.safety.extrapolate} onChange={(x) => setPath('safety.extrapolate', x)} testId="ch8-extrapolate-toggle-2" />
    </Demo>
  );
}
