/** 데모 2: 두 기체가 자리를 바꾸는 정면 교차. CBF 끔 / 기본 / 강건. 이어서 몬테카를로. */
import { useMemo, useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { config } from '../../app/store';
import { Vec, norm, vsub } from '../../sim/linalg';
import { CbfPairParams, CbfPairResult, cbfRobustDesign, simulateCbfPair } from '../../sim/safety';
import { der, ex } from '../../sources';
import {
  Button, Caption, CodeView, Demo, LineChart, LinkGroup, M, McPanel, P, Segmented, Slider, Stat, StatRow, Status, Val, seriesColor, useDebounced, useWidth,
} from '../../ui';
import { cbfTask } from './tasks';

type Mode = 'off' | 'basic' | 'robust';
const MODES: { value: Mode; label: { ko: string; en: string } }[] = [
  { value: 'off', label: { ko: '필터 끔', en: 'Filter off' } },
  { value: 'basic', label: { ko: '기본 CBF', en: 'Basic CBF' } },
  { value: 'robust', label: { ko: '강건 CBF', en: 'Robust CBF' } },
];
// 같은 고도에서 서로의 자리로 가는 두 기체 (y 로 조금 어긋나게 시작)
const INIT = { pA: [2, 0.1, 1.5], pB: [-2, -0.1, 1.5] };
const SIM = der('ch8#cbf', { ko: '속도 명령을 그대로 따르는 질점 두 대가 서로의 자리로 가는 상황을 이 장의 필터로 시뮬레이션한 결과', en: 'Two point masses that follow velocity commands exactly, swapping places, simulated with the filters of this chapter' });

/** 두 기체가 모두 목표(상대의 출발점)에서 0.3 m 안에 처음 들어온 시각 */
function goalTime(r: CbfPairResult): number | null {
  for (let i = 0; i < r.t.length; i++) if (norm(vsub(r.pA[i], INIT.pB)) < 0.3 && norm(vsub(r.pB[i], INIT.pA)) < 0.3) return r.t[i];
  return null;
}

/** 위에서 본 궤적. 점선 원의 지름이 d_min 이므로 두 원이 겹치면 침범이다. */
function PairView({ run, frame, dMin, body }: { run: CbfPairResult; frame: number; dMin: number; body: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 240), H = Math.round(Math.min(300, Math.max(150, W * 0.42)));
  const k = W / 4.9;
  const sx = (x: number) => W / 2 + x * k, sy = (y: number) => H / 2 - y * k;
  const path = (pts: Vec[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join('');
  const f = Math.min(frame, run.t.length - 1);
  const a = run.pA[f], b = run.pB[f];
  const hit = run.d[f] < dMin - 1e-9;
  const drone = (q: Vec, slot: number, name: string, dash: string) => (
    <g>
      <circle cx={sx(q[0])} cy={sy(q[1])} r={(dMin / 2) * k} fill={hit ? 'var(--critical)' : seriesColor(slot)} fill-opacity="0.12" stroke={hit ? 'var(--critical)' : seriesColor(slot)} stroke-width="1.5" stroke-dasharray={dash} />
      <circle cx={sx(q[0])} cy={sy(q[1])} r={Math.max(8, (body / 2) * k)} fill={seriesColor(slot)} stroke="var(--surface)" stroke-width="2" />
      <text x={sx(q[0])} y={sy(q[1]) + 4} text-anchor="middle" fill="#fff" font-size="11" font-weight="700">{name}</text>
    </g>
  );
  return (
    <div ref={ref} class="canvas-wrap" style={{ height: `${H}px` }}>
      {width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={tr({ ko: `두 기체의 궤적을 위에서 본 그림. 시각 ${fmt(run.t[f], 3)} 초, 두 기체 사이 거리 ${fmt(run.d[f], 3)} m, 최소 거리 한계 ${fmt(dMin, 3)} m`, en: `Top view of the two trajectories. Time ${fmt(run.t[f], 3)} s, distance ${fmt(run.d[f], 3)} m, minimum-distance limit ${fmt(dMin, 3)} m` })}>
          <rect x="0" y="0" width={W} height={H} fill="var(--surface-2)" />
          {[-2, -1, 0, 1, 2].map((g) => <line key={`gx${g}`} x1={sx(g)} x2={sx(g)} y1="0" y2={H} stroke="var(--border)" />)}
          {[-1, 0, 1].map((g) => <line key={`gy${g}`} x1="0" x2={W} y1={sy(g)} y2={sy(g)} stroke="var(--border)" />)}
          <path d={path(run.pA)} fill="none" stroke={seriesColor(1)} stroke-width="2" />
          <path d={path(run.pB)} fill="none" stroke={seriesColor(2)} stroke-width="2" stroke-dasharray="7 4" />
          {[INIT.pA, INIT.pB].map((q, i) => (
            <g key={i}>
              <path d={`M${sx(q[0]) - 5},${sy(q[1]) - 5}l10,10m0,-10l-10,10`} stroke="var(--text-2)" stroke-width="2" />
              <text class="tick" x={sx(q[0])} y={sy(q[1]) - 10} text-anchor="middle">{tr(i === 0 ? { ko: 'A 출발 · B 목표', en: 'A start · B goal' } : { ko: 'B 출발 · A 목표', en: 'B start · A goal' })}</text>
            </g>
          ))}
          {drone(a, 1, 'A', '')}
          {drone(b, 2, 'B', '5 3')}
          <rect x="12" y={H - 14} width={k} height="2" fill="var(--text-2)" />
          <text class="tick" x="12" y={H - 19}>1 m</text>
          {hit && <text class="ref-label" x={W - 10} y="18" text-anchor="end" fill="var(--critical-text)">{tr({ ko: '✕ d_min 침범', en: '✕ inside d_min' })}</text>}
        </svg>
      )}
    </div>
  );
}

export function CbfDemo() {
  const cfg = config.value;
  const kz = cfg.safety.downwashRatio, vMax = cfg.vehicle.vMax, body = cfg.vehicle.envelope;
  const [mode, setMode] = useState<Mode>('basic');
  const [dMin, setDMin] = useState(0.6);
  const [eps, setEps] = useState(0.03);
  const [age, setAge] = useState(0.05);
  const [alpha, setAlpha] = useState(4);
  const [seed, setSeed] = useState(1);
  const [frameSel, setFrameSel] = useState<number | null>(null);
  const prm = useDebounced({ dMin, eps, age, alpha, seed }, 150);
  const des = cbfRobustDesign({ dMin: prm.dMin, kz, vMax, eps: prm.eps, ageMax: prm.age });
  const alphaRobust = des.feasible ? Math.min(prm.alpha, des.alphaMax) : 0;
  const base = (m: Mode): CbfPairParams => ({ dMin: prm.dMin, kz, vMax, eps: prm.eps, ageMax: prm.age, alpha: m === 'robust' ? alphaRobust : prm.alpha, dt: 0.01, T: 20, mode: m, startDist: 4 });
  const runs = useMemo(() => {
    const out = {} as Record<Mode, CbfPairResult>;
    for (const m of MODES) out[m.value] = simulateCbfPair({ ...base(m.value), init: INIT }, prm.seed, true);
    return out;
  }, [prm, kz, vMax, alphaRobust]);
  const cur = runs[mode];
  const iMin = cur.d.indexOf(Math.min(...cur.d));
  const frame = frameSel === null ? iMin : Math.min(frameSel, cur.t.length - 1);
  const tEnd = Math.min(20, Math.max(8, ...MODES.map((m) => (goalTime(runs[m.value]) ?? 20) + 1.5)));
  const live = { dMin, eps, age };
  const E = 2 * live.eps + vMax * live.age;
  return (
    <>
      <LinkGroup>
        <Demo title={{ ko: '정면 교차: 필터를 끄고, 켜고, 강건하게', en: 'Head-on swap: filter off, on, and robust' }} testId="ch8-cbf-demo">
          <P ko="두 기체가 같은 고도에서 서로의 자리로 갑니다. 필터가 없으면 한가운데에서 부딪힙니다. 필터는 각 기체의 **원래 명령**(목표를 향한 속도)을 받아 아래 조건을 어길 때만 고칩니다. 수식의 항을 가리키면 코드의 해당 줄이, $d_{\min}$ 이 든 항을 가리키면 그래프의 한계선이 강조됩니다."
            en="Two vehicles at the same altitude head for each other's position. Without a filter they collide in the middle. The filter takes each vehicle's **nominal command** (velocity towards its goal) and changes it only when the condition below would be violated. Point at a term to highlight the matching code line; the term containing $d_{\min}$ also highlights the limit line in the chart." />
          <M block tex={String.raw`\lk{normal}{\hat n}^{\T}\,\lk{w}{w_i} \;\ge\; -\lk{half}{\tfrac{\alpha}{2}}\,\lk{h}{\big(\norm{r}_E - d_{\min}\big)}, \qquad \lk{proj}{w_i \leftarrow w_i + \big(b - \hat n^{\T} w_i\big)\,\hat n}, \qquad u_i = \lk{scale}{S^{-1}}\,w_i`} />
          <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 코드 줄과 그래프의 선이 함께 강조됩니다.', en: '↑ Point at a term to highlight the matching code lines and chart line.' })}</p>
          <Segmented label={{ ko: '안전 필터', en: 'Safety filter' }} value={mode} onChange={(m) => { setMode(m); setFrameSel(null); }} options={MODES} testId="ch8-cbf-mode" />
          <div class="controls">
            <Slider label={{ ko: '위치 오차 한계 $\\varepsilon$', en: 'Position error bound $\\varepsilon$' }} value={eps} min={0} max={0.06} step={0.005} scale={100} unit="cm" onChange={(v) => { setEps(v); setFrameSel(null); }} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 각 기체가 자기 위치를 이만큼까지 틀리게 안다고 가정합니다.', en: 'Local to this demo. Each vehicle is assumed to misjudge its own position by up to this much.' })} testId="ch8-cbf-eps" />
            <Slider label={{ ko: '이웃 정보의 최대 나이 $t_{\\text{age}}$', en: 'Maximum age of neighbour information $t_{\\text{age}}$' }} value={age} min={0} max={0.12} step={0.01} scale={1000} unit="ms" onChange={(v) => { setAge(v); setFrameSel(null); }} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 매 순간 0 과 이 값 사이에서 무작위로 정해집니다.', en: 'Local to this demo. At every step the age is drawn at random between 0 and this value.' })} testId="ch8-cbf-age" />
            <Slider label={{ ko: '지켜야 할 최소 거리 $d_{\\min}$', en: 'Minimum distance to keep $d_{\\min}$' }} value={dMin} min={0.3} max={1} step={0.05} unit="m" onChange={(v) => { setDMin(v); setFrameSel(null); }} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값', en: 'Local to this demo' })} testId="ch8-cbf-dmin" />
            <Slider label={{ ko: 'CBF 게인 $\\alpha$', en: 'CBF gain $\\alpha$' }} value={alpha} min={0.5} max={8} step={0.5} unit="1/s" onChange={(v) => { setAlpha(v); setFrameSel(null); }} src={ex(undefined, { ko: '이 데모에서만 바꾸는 값. 강건 필터는 이 값과 α_max 중 작은 쪽을 씁니다.', en: 'Local to this demo. The robust filter uses the smaller of this and α_max.' })} testId="ch8-cbf-alpha" />
          </div>
          <div class="btn-row" style={{ marginBottom: '10px' }}>
            <Button onClick={() => { setEps(0); setAge(0); setFrameSel(null); }} testId="ch8-cbf-perfect">{tr({ ko: '완벽한 정보로 (오차 0, 나이 0)', en: 'Perfect information (error 0, age 0)' })}</Button>
            <Button onClick={() => { setEps(0.03); setAge(0.05); setFrameSel(null); }}>{tr({ ko: '오차와 지연 넣기 (3 cm, 50 ms)', en: 'Add error and delay (3 cm, 50 ms)' })}</Button>
            <Button onClick={() => { setSeed(seed + 1); setFrameSel(null); }}>{tr({ ko: '다른 노이즈로 다시', en: 'Different noise' })}</Button>
          </div>
          <StatRow>
            <Stat label={{ ko: '상대 위치 오차 한계 $E = 2\\varepsilon + v_{\\max} t_{\\text{age}}$', en: 'Relative position error bound $E = 2\\varepsilon + v_{\\max} t_{\\text{age}}$' }} value={E * 100} unit="cm" src={der('ch8#cbf-robust')} />
            <Stat label={{ ko: '강건 조건 $d_{\\min} > 3E$', en: 'Robust condition $d_{\\min} > 3E$' }} value={3 * E} unit="m" src={der('ch8#cbf-robust', { ko: '3E 의 값. d_min 이 이보다 커야 보장이 성립합니다.', en: 'The value of 3E. d_min must exceed it for the guarantee to hold.' })} status={dMin > 3 * E ? 'good' : 'bad'} />
            <Stat label={{ ko: '쓸 수 있는 가장 큰 게인 $\\alpha_{\\max}$', en: 'Largest admissible gain $\\alpha_{\\max}$' }} value={des.feasible ? (Number.isFinite(des.alphaMax) ? des.alphaMax : '∞') : '–'} unit="1/s" src={der('ch8#cbf-robust')} />
            <Stat label={{ ko: '강건 필터가 실제로 쓰는 $\\alpha$', en: '$\\alpha$ actually used by the robust filter' }} value={alphaRobust} unit="1/s" src={der('ch8#cbf-robust', { ko: 'min(슬라이더 값, α_max). 조건을 못 맞추면 0.', en: 'min(slider value, α_max); 0 when the condition fails.' })} />
          </StatRow>
          <PairView run={cur} frame={frame} dMin={prm.dMin} body={body} />
          <div class="slider" style={{ marginTop: '6px' }}>
            <div class="top"><label class="ctl-label" for="ch8-cbf-time">{tr({ ko: '시각 (처음에는 가장 가까워진 순간)', en: 'Time (initially the closest approach)' })}</label><span class="val">{fmt(cur.t[frame], 3)} s · {tr({ ko: '거리', en: 'distance' })} {fmt(cur.d[frame], 3)} m</span></div>
            <input id="ch8-cbf-time" type="range" min={0} max={cur.t.length - 1} step={1} value={frame} data-testid="ch8-cbf-time" onInput={(e) => setFrameSel(Number((e.target as HTMLInputElement).value))} />
          </div>
          <Caption src={SIM}>{tr({ ko: '위에서 본 모습. 실선은 A, 점선은 B 의 궤적입니다. 기체 둘레의 옅은 원은 지름이 d_min 이어서, 두 원이 겹치면 최소 거리를 침범한 것입니다.', en: 'Top view. Solid line: trajectory of A; dashed: B. The pale circle around each vehicle has diameter d_min, so overlapping circles mean the minimum distance is violated.' })}</Caption>
          <LineChart
            title={{ ko: '두 기체 사이의 거리', en: 'Distance between the two vehicles' }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '거리 [m]', en: 'Distance [m]' }} height={240}
            series={MODES.map((m, i) => ({ name: m.label, x: runs[m.value].t, y: runs[m.value].d, slot: i + 1, width: m.value === mode ? 3 : 1.5, faint: m.value !== mode }))}
            refLines={[{ y: prm.dMin, label: { ko: `d_min = ${fmt(prm.dMin, 3)} m`, en: `d_min = ${fmt(prm.dMin, 3)} m` }, slot: 8, link: 'h' }]}
            xDomain={[0, tEnd]} yDomain={[0, 4.2]} src={SIM} testId="ch8-cbf-chart" />
          <div class="table-wrap">
            <table class="tbl" data-testid="ch8-cbf-table">
              <thead><tr>
                <th>{tr({ ko: '필터', en: 'Filter' })}</th>
                <th class="r">{tr({ ko: '가장 가까웠던 거리', en: 'Closest distance' })}</th>
                <th class="r">{tr({ ko: 'd_min 보다 얼마나 멀리', en: 'Stand-off above d_min' })}</th>
                <th class="r">{tr({ ko: '둘 다 목표에 닿은 시각', en: 'Time both reached the goal' })}</th>
                <th>{tr({ ko: '판정', en: 'Verdict' })}</th>
              </tr></thead>
              <tbody>
                {MODES.map((m) => {
                  const r = runs[m.value], tg = goalTime(r);
                  return (
                    <tr key={m.value} style={m.value === mode ? { background: 'var(--surface-2)' } : undefined}>
                      <td><b>{tr(m.label)}</b></td>
                      <td class="r"><Val v={r.minDist} unit="m" src={SIM} /></td>
                      <td class="r"><Val v={(r.minDist - prm.dMin) * 100} unit="cm" src={SIM} /></td>
                      <td class="r">{tg === null ? tr({ ko: '20초 안에 못 닿음', en: 'not within 20 s' }) : <Val v={tg} unit="s" src={SIM} />}</td>
                      <td>{r.violated
                        ? <Status kind="bad">{tr({ ko: '침범', en: 'violated' })}</Status>
                        : tg === null ? <Status kind="warn">{tr({ ko: '안전하지만 멈춤', en: 'safe but stuck' })}</Status> : <Status kind="good">{tr({ ko: '지킴', en: 'kept' })}</Status>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <P ko="**읽는 법.** 완벽한 정보에서는 기본 필터가 $d_{\min}$ 을 정확히 지킵니다. 오차와 지연을 넣으면 기본 필터는 한계선 바로 위를 스치다가 살짝 넘습니다. 필터가 믿는 거리와 실제 거리가 다르기 때문입니다. 강건 필터는 $d_{\min}$ 을 지키지만 그 대가로 더 멀리 돌아가고 더 늦게 도착합니다. 오차를 더 키워 $d_{\min} \le 3E$ 가 되면 강건 필터는 아예 다가가지 못하게 막습니다(안전하지만 멈춤)."
            en="**How to read it.** With perfect information the basic filter keeps $d_{\min}$ exactly. With error and delay the basic filter skims the limit line and slips just below it, because the distance it believes differs from the true one. The robust filter keeps $d_{\min}$, at the price of a wider detour and a later arrival. Increase the error until $d_{\min} \le 3E$ and the robust filter refuses to let them approach at all (safe but stuck)." />
          <P ko="완벽한 정보에서 도착이 오히려 **늦는** 것도 눈여겨보세요. 두 기체가 정확히 마주 보면 서로를 똑바로 밀어내기만 해서 옆으로 비켜 가는 속도가 아주 느립니다. 노이즈가 이 대칭을 깨 주면 더 빨리 지나갑니다. 안전 필터는 **부딪히지 않는 것**만 보장하고 **길을 찾아 주지는 않습니다.** 길은 궤적 계획이 맡아야 합니다."
            en="Notice too that with perfect information the arrival is actually **later**. When the two vehicles face each other exactly, they only push straight back and slide sideways very slowly. Noise breaks that symmetry and they pass sooner. A safety filter guarantees only **not colliding**; it does **not find a way through**. That is the job of trajectory planning." />
          <CodeView code={cbfTask.solution} links={cbfTask.links} />
        </Demo>
      </LinkGroup>
      <P ko="한 번의 실행은 한 번의 주사위입니다(0장의 함정). 교차 방향과 고도 차이를 무작위로 바꿔 가며 수백 번 반복해, 가장 가까웠던 거리의 분포를 봅니다. 여기서는 고도 차이가 있으므로 거리는 **타원체 거리**($k_z$ = {{cfg:safety.downwashRatio}})입니다. 위 슬라이더의 값이 그대로 쓰입니다."
        en="One run is one roll of the dice (the pitfall of chapter 0). We repeat hundreds of times with random crossing directions and height differences and look at the distribution of the closest distance. Heights differ here, so distance means **ellipsoidal distance** ($k_z$ = {{cfg:safety.downwashRatio}}). The slider values above are used as they are." />
      <div class="grid-2">
        {(['basic', 'robust'] as const).map((m) => (
          <McPanel
            key={`${m}-${prm.dMin}-${prm.eps}-${prm.age}-${prm.alpha}-${kz}-${vMax}`}
            title={m === 'basic' ? { ko: '기본 CBF: 가장 가까웠던 거리의 분포', en: 'Basic CBF: distribution of the closest distance' } : { ko: '강건 CBF: 가장 가까웠던 거리의 분포', en: 'Robust CBF: distribution of the closest distance' }}
            experiment="cbfPair" metric="minDist" testId={`ch8-mc-${m}`}
            params={{ ...base(m), T: 25 }}
            xLabel={{ ko: '한 번의 교차에서 최소 타원체 거리 [m]', en: 'Minimum ellipsoidal distance in one encounter [m]' }}
            refLines={[{ x: prm.dMin, label: { ko: 'd_min', en: 'd_min' }, slot: 8 }]}
            threshold={{ value: prm.dMin - 1e-9, label: { ko: '$d_{\\min}$ 을 침범한 실행', en: 'Runs that violated $d_{\\min}$' } }}
            src={der(m === 'basic' ? 'ch8#cbf' : 'ch8#cbf-robust', { ko: '위 슬라이더의 오차 한계·정보 나이로 정면 교차를 반복 시뮬레이션한 결과', en: 'Repeated head-on encounters simulated with the error bound and information age set above' })}
            note={m === 'basic'
              ? { ko: `조건: $\\varepsilon$ = ${fmt(prm.eps * 100, 3)} cm{{ex}}, 정보 나이 ≤ ${fmt(prm.age * 1000, 3)} ms{{ex}}, $\\alpha$ = ${fmt(prm.alpha, 3)} /s{{ex}}. 필터는 오차를 모른 채 동작합니다.`, en: `Condition: $\\varepsilon$ = ${fmt(prm.eps * 100, 3)} cm{{ex}}, information age ≤ ${fmt(prm.age * 1000, 3)} ms{{ex}}, $\\alpha$ = ${fmt(prm.alpha, 3)} /s{{ex}}. The filter runs unaware of the errors.` }
              : { ko: `같은 조건에 $E$ = ${fmt(des.E * 100, 3)} cm{{der:ch8#cbf-robust}}, $\\alpha$ = ${fmt(alphaRobust, 3)} /s{{der:ch8#cbf-robust}} 를 쓴 강건 필터.${des.feasible ? '' : ' 지금은 $d_{\\min} \\le 3E$ 라서 보장 조건을 만족하지 않습니다.'}`, en: `The robust filter under the same condition, with $E$ = ${fmt(des.E * 100, 3)} cm{{der:ch8#cbf-robust}} and $\\alpha$ = ${fmt(alphaRobust, 3)} /s{{der:ch8#cbf-robust}}.${des.feasible ? '' : ' Right now $d_{\\min} \\le 3E$, so the guarantee condition is not met.'}` }} />
        ))}
      </div>
    </>
  );
}
