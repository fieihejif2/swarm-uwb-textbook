/** 함정 실험실: ① 다운워시를 무시하고 위아래로 겹쳐 날기  ② k_σ = 1 로 더하고 놀라기 */
import { useMemo, useState } from 'preact/hooks';
import { fmt, tr } from '../../app/i18n';
import { config } from '../../app/store';
import { computeBudget } from '../../sim/budget';
import { formationOffsets } from '../../sim/formation';
import { Rng } from '../../sim/rng';
import { ellipsoidDistance } from '../../sim/safety';
import { normCdf, normPdf } from '../../sim/stats';
import { der, ex, lit } from '../../sources';
import { Button, Caption, Histogram, P, Pitfall, Slider, Stat, StatRow, Status, seriesColor } from '../../ui';

/** 옆에서 본 모습(x–z): 5대를 위아래로 쌓고 예산 타원(수평 반축 a, 수직 반축 c)을 씌운다 */
function StackPicture({ s, a, c, body, kz, ok }: { s: number; a: number; c: number; body: number; kz: number; ok: boolean }) {
  const pts = formationOffsets('stack', s, 5);
  const span = 4 * s + 2 * c + 0.3;
  const H = 300, W = 260, k = Math.min((H - 16) / span, (W - 90) / (2 * a + 0.2));
  const cx = 96, sz = (z: number) => H / 2 - z * k;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" style={{ maxWidth: '100%', height: 'auto', background: 'var(--surface-2)', borderRadius: '8px' }}
      aria-label={tr({ ko: `위아래로 쌓은 5대를 옆에서 본 그림. 수직 간격 ${fmt(s, 3)} m, 예산 타원의 높이 ${fmt(2 * c, 3)} m. ${ok ? '타원이 겹치지 않음' : '타원이 겹침'}`, en: `Side view of five stacked drones. Vertical spacing ${fmt(s, 3)} m, height of the budget ellipse ${fmt(2 * c, 3)} m. ${ok ? 'No overlap' : 'Ellipses overlap'}` })}>
      {pts.map((p, i) => (
        <g key={i}>
          <ellipse cx={cx} cy={sz(p[2])} rx={a * k} ry={c * k} fill={ok ? seriesColor(1) : 'var(--critical)'} fill-opacity="0.13" stroke={ok ? seriesColor(1) : 'var(--critical)'} stroke-width="1.5" />
          <ellipse cx={cx} cy={sz(p[2])} rx={(body / 2) * k} ry={((body * kz) / 2) * k} fill="none" stroke="var(--text-2)" stroke-width="1" stroke-dasharray="3 3" />
          <rect x={cx - (body / 2) * k} y={sz(p[2]) - 2.5} width={body * k} height="5" rx="2" fill="var(--text)" />
          <text class="tick" x={cx + a * k + 8} y={sz(p[2]) + 4}>{i + 1}</text>
        </g>
      ))}
      <line x1={W - 40} x2={W - 40} y1={sz(pts[0][2])} y2={sz(pts[1][2])} stroke="var(--text-2)" stroke-width="1.5" />
      <text class="tick" x={W - 34} y={(sz(pts[0][2]) + sz(pts[1][2])) / 2 + 4}>{fmt(s, 3)} m</text>
      <text class="tick" x="8" y="14">{tr({ ko: '옆에서 본 모습 (x–z)', en: 'Side view (x–z)' })}</text>
      {!ok && <text class="ref-label" x="8" y={H - 8} fill="var(--critical-text)">{tr({ ko: '✕ 타원이 겹침', en: '✕ ellipses overlap' })}</text>}
    </svg>
  );
}

export function StackPitfall() {
  const cfg = config.value;
  const [kz, setKz] = useState(cfg.safety.downwashRatio);
  const b = useMemo(() => computeBudget({ ...cfg, safety: { ...cfg.safety, downwashRatio: kz } }), [cfg, kz]);
  const round5 = (x: number) => Math.ceil(x * 20 - 1e-9) / 20;
  const [s, setS] = useState(() => round5(b.minSepH));
  const kEff = b.minSepV / b.minSepH;
  const dE = ellipsoidDistance([0, 0, s], kEff);
  const ok = dE >= b.minSepH - 1e-9;
  const body = cfg.vehicle.envelope;
  const washOk = ellipsoidDistance([0, 0, s], kz) >= body - 1e-9;
  const GEO = der('ch8#downwash');
  return (
    <Pitfall title={{ ko: '다운워시를 무시하고 위아래로 겹쳐 날기', en: 'Stacking drones vertically while ignoring downwash' }} testId="ch8-pitfall-stack">
      <P ko="'수평으로 이만큼 띄우면 안전하다'는 숫자를 얻고 나면, 같은 숫자를 위아래에도 쓰고 싶어집니다. 강당 바닥 면적이 모자랄 때 대형을 **층층이 쌓는** 것은 아주 자연스러운 생각입니다. 아래는 5대를 수직 간격 $s$ 로 쌓은 모습입니다. 처음 값은 **수평 권장 간격을 그대로** 수직에 쓴 것입니다."
        en="Once you have a number saying 'this much horizontal spacing is safe', it is tempting to use the same number vertically. When floor area runs short, **stacking** the formation in layers is a very natural idea. Below, five drones are stacked with vertical spacing $s$. The initial value simply reuses **the recommended horizontal spacing** vertically." />
      <div class="grid-2">
        <StackPicture s={s} a={b.minSepH / 2} c={b.minSepV / 2} body={body} kz={kz} ok={ok} />
        <div>
          <Slider label={{ ko: '수직 간격 $s$', en: 'Vertical spacing $s$' }} value={s} min={0.2} max={3} step={0.05} unit="m" onChange={setS} src={ex('formation.spacing', { ko: '이 실험에서만 바꾸는 값. 처음 값은 수평 권장 간격(5 cm 단위로 올림)입니다.', en: 'Local to this experiment; starts at the recommended horizontal spacing (rounded up to 5 cm).' })} testId="ch8-stack-s" />
          <Slider label={{ ko: '다운워시 비율 $k_z$', en: 'Downwash ratio $k_z$' }} value={kz} min={1} max={6} step={0.1} onChange={setKz} src={ex('safety.downwashRatio', { ko: '이 실험에서만 바꾸는 값. 처음 값은 전역 설정입니다.', en: 'Local to this experiment; starts from the global setting.' })} testId="ch8-stack-kz" />
          <div class="btn-row" style={{ margin: '6px 0 10px' }}>
            <Button onClick={() => setS(round5(b.minSepH))} testId="ch8-stack-reset">{tr({ ko: '수평 권장값으로', en: 'Use the horizontal value' })}</Button>
            <Button primary onClick={() => setS(round5(b.minSepV))} testId="ch8-stack-fix">{tr({ ko: '수직 권장값으로', en: 'Use the vertical value' })}</Button>
          </div>
          <StatRow>
            <Stat label={{ ko: '이웃한 두 대의 타원체 거리', en: 'Ellipsoidal distance of neighbours' }} value={dE} unit="m" src={der('ch8#downwash', { ko: 's ÷ k_eff (k_eff = 권장 수직 간격 ÷ 권장 수평 간격)', en: 's ÷ k_eff (k_eff = recommended vertical ÷ horizontal spacing)' })} status={ok ? 'good' : 'bad'} />
            <Stat label={{ ko: '한계 (권장 수평 간격)', en: 'Limit (recommended horizontal spacing)' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum')} />
            <Stat label={{ ko: '권장 수직 간격', en: 'Recommended vertical spacing' }} value={b.minSepV} unit="m" src={der('ch8#budget-sum')} />
            <Stat label={{ ko: '다운워시 영역만의 높이 $k_z d_{\\text{body}}$', en: 'Height of the downwash zone alone $k_z d_{\\text{body}}$' }} value={kz * body} unit="m" src={GEO} status={washOk ? undefined : 'bad'} />
          </StatRow>
          <p>
            {ok
              ? <Status kind="good">{tr({ ko: '예산을 만족합니다', en: 'The budget is met' })}</Status>
              : washOk
                ? <Status kind="bad">{tr({ ko: '예산 위반: 오차와 지연까지 더하면 아래 기체가 위 기체의 다운워시 영역에 들어갈 수 있습니다', en: 'Budget violated: with errors and delays added, the lower drone can enter the downwash zone of the upper one' })}</Status>
                : <Status kind="bad">{tr({ ko: '오차가 전혀 없어도 이미 다운워시 영역 안입니다', en: 'Already inside the downwash zone even with zero error' })}</Status>}
          </p>
        </div>
      </div>
      <Caption>{tr({
        ko: '색이 칠해진 타원은 예산 타원체의 단면, 그 안의 점선 타원은 오차를 빼고 기체와 다운워시만 본 영역입니다. k_z 를 키우면 점선 타원과 색 타원이 함께 길어집니다. 수직 간격을 권장 수직 간격까지 올리면 타원들이 서로 닿기만 하고 겹치지 않습니다.',
        en: 'The filled ellipse is a section of the budget ellipsoid; the dashed ellipse inside it is the zone of body and downwash alone, without errors. Raising k_z lengthens both. Raise the vertical spacing to the recommended vertical value and the ellipses just touch without overlapping.',
      })}</Caption>
      <P ko="같은 5대를 쌓는 데 필요한 높이는 수평으로 늘어놓을 때의 폭보다 큽니다. 게다가 $k_z$ 는 우리 기체에서 아직 **재지 않은 값**입니다. 층을 쌓는 대형을 짜기 전에 9장의 절차로 $k_z$ 부터 재야 합니다. 화면 아래 오차 예산 막대의 ✓/✕ 는 대형 모양과 무관하게 **수평** 권장값과 비교하므로, 쌓는 대형에서는 이 장의 수직 값을 직접 확인하세요."
        en="Stacking the same five drones needs more height than the width needed to line them up side by side. Moreover $k_z$ is a value we have **not yet measured** on our vehicle. Before designing a layered formation, measure $k_z$ with the procedure of chapter 9. The ✓/✕ in the error-budget bar at the bottom of the screen always compares with the **horizontal** value whatever the formation shape, so for a stacked formation check the vertical value of this chapter yourself." />
    </Pitfall>
  );
}

export function SigmaPitfall() {
  const cfg = config.value;
  const [k, setK] = useState(1);
  const [looks, setLooks] = useState(600);
  const b1 = useMemo(() => computeBudget({ ...cfg, safety: { ...cfg.safety, kSigma: k } }), [cfg, k]);
  const b3 = useMemo(() => computeBudget({ ...cfg, safety: { ...cfg.safety, kSigma: 3 } }), [cfg]);
  const sig = Math.hypot(b1.sigmaEstH, cfg.safety.trackingError);
  const sigRel = Math.SQRT2 * sig;
  const allow = k * sigRel;
  const samples = useMemo(() => {
    // 두 기체의 위치 오차(두 기체를 잇는 방향 성분)를 따로 뽑아 뺀다: 양수 = 계획보다 가까워짐
    const rng = new Rng(8);
    return Array.from({ length: 20000 }, () => (rng.gauss(0, sig) - rng.gauss(0, sig)) * 100);
  }, [sig]);
  const pSim = samples.filter((e) => e > allow * 100).length / samples.length;
  const pTheory = 1 - normCdf(k);
  const pFlight = 1 - Math.pow(1 - pTheory, looks);
  const SRC = der('ch8#rss', { ko: '두 기체의 오차를 정규분포에서 따로 2만 번 뽑아 뺀 결과와, 이론 분포 N(0, 2σ²)', en: '20,000 draws of the two errors from normal distributions, subtracted, and the theoretical N(0, 2σ²)' });
  return (
    <Pitfall title={{ ko: '평균 크기(1σ)로 더해 놓고 놀라기', en: 'Adding typical sizes (1σ) and then being surprised' }} testId="ch8-pitfall-sigma">
      <P ko="'측위 오차는 몇 cm' 라고 말할 때 그 숫자는 대개 **1σ**, 즉 평소 크기입니다. 그 숫자를 그대로 더해 간격을 정하면($k_\sigma = 1$) 간격은 좁아져서 보기 좋지만, 두 기체가 계획보다 가까워지는 일이 얼마나 자주 생기는지 아래에서 확인해 보세요. 가로축의 양수는 '두 기체가 무작위 오차 때문에 계획보다 이만큼 가까워졌다'는 뜻입니다."
        en="When people say 'positioning error is a few cm', that number is usually **1σ**, the typical size. Add it as it is to set the spacing ($k_\sigma = 1$) and the spacing looks pleasantly small — but check below how often the two vehicles end up closer than planned. Positive values on the horizontal axis mean 'random error brought the two vehicles this much closer than planned'." />
      <div class="controls">
        <Slider label={{ ko: '신뢰 배수 $k_\\sigma$', en: 'Confidence multiplier $k_\\sigma$' }} value={k} min={1} max={4} step={0.5} unit="σ" onChange={setK} src={ex('safety.kSigma', { ko: '이 실험에서만 바꾸는 값. 전역 설정은 그대로입니다.', en: 'Local to this experiment; the global setting is untouched.' })} testId="ch8-sigma-k" />
        <Slider label={{ ko: '한 번의 비행에서 오차가 새로 뽑히는 횟수', en: 'Independent draws of the error in one flight' }} value={looks} min={10} max={2000} step={10} onChange={setLooks} src={ex(undefined, { ko: '가정. 실제 오차는 시간적으로 이어져 있으므로 "비행시간 ÷ 오차가 바뀌는 데 걸리는 시간"쯤으로 어림합니다. 처음 값은 1초에 한 번, 10분 비행을 가정한 것입니다.', en: 'An assumption. Real errors are correlated in time, so estimate it as flight time ÷ the time it takes the error to change. The initial value assumes one draw per second over a 10-minute flight.' })} testId="ch8-sigma-looks" />
      </div>
      <Histogram
        title={{ ko: '두 기체 사이 거리의 무작위 오차 (가까워지는 쪽이 +)', en: 'Random error of the distance between two drones (+ = closer)' }}
        values={samples} bins={41} range={[-4.5 * sigRel * 100, 4.5 * sigRel * 100]}
        xLabel={{ ko: '계획보다 가까워진 거리 [cm]', en: 'Closer than planned by [cm]' }} slot={1} src={SRC} testId="ch8-sigma-hist"
        theory={{ name: { ko: '이론: N(0, 2σ²)', en: 'Theory: N(0, 2σ²)' }, pdf: (x) => normPdf(x, 0, sigRel * 100) }}
        refLines={[{ x: allow * 100, label: { ko: `예산에 잡아 둔 몫 ${fmt(allow * 100, 3)} cm`, en: `Allowance in the budget: ${fmt(allow * 100, 3)} cm` }, slot: 8 }]} />
      <StatRow>
        <Stat label={{ ko: '몫을 넘는 비율 (시뮬레이션)', en: 'Fraction beyond the allowance (simulation)' }} value={pSim * 100} unit="%" src={SRC} status={pSim > 0.01 ? 'bad' : pSim > 0.002 ? 'warn' : 'good'} />
        <Stat label={{ ko: '같은 비율 (이론 $1 - \\Phi(k_\\sigma)$)', en: 'Same fraction (theory $1 - \\Phi(k_\\sigma)$)' }} value={pTheory * 100} unit="%" src={der('ch8#rss', { ko: '표준정규분포의 한쪽 꼬리 확률', en: 'One-sided tail probability of the standard normal' })} />
        <Stat label={{ ko: '한 비행에서 한 번이라도 넘을 확률', en: 'Chance of exceeding it at least once per flight' }} value={pFlight * 100} unit="%" src={der('ch8#rss', { ko: '1 − (1 − p)^N, N 은 위 슬라이더의 횟수', en: '1 − (1 − p)^N with N from the slider above' })} status={pFlight > 0.5 ? 'bad' : pFlight > 0.05 ? 'warn' : 'good'} />
        <Stat label={{ ko: '이 $k_\\sigma$ 로 계산한 권장 수평 간격', en: 'Min. horizontal spacing with this $k_\\sigma$' }} value={b1.minSepH} unit="m" src={der('ch8#budget-sum')} />
        <Stat label={{ ko: '$k_\\sigma = 3$ 일 때', en: 'With $k_\\sigma = 3$' }} value={b3.minSepH} unit="m" src={der('ch8#budget-sum')} />
      </StatRow>
      <P ko="$k_\sigma = 1$ 이면 여섯 번에 한 번꼴로 몫을 넘습니다. 한 비행 전체로 보면 사실상 반드시 넘습니다. 0장의 몬테카를로에서 '평균은 멀쩡한데 꼬리가 선을 넘는 비행'을 본 것과 같은 이야기입니다. $k_\sigma$ 를 3 으로 올려도 긴 비행에서는 넘는 순간이 생길 수 있다는 점도 슬라이더로 확인하세요. 그래서 예산은 무작위 몫 말고도 확정 항을 **최악값으로** 잡고 여유 $d_{\text{margin}}$ 을 따로 둡니다. $k_\sigma$ 는 보장이 아니라 **약속**입니다."
        en="With $k_\sigma = 1$ the allowance is exceeded about one time in six; over a whole flight it is exceeded practically for certain. It is the same story as the Monte Carlo of chapter 0, where the mean looked fine while flights in the tail crossed the line. Use the slider to see that even $k_\sigma = 3$ can be exceeded at some moment of a long flight. That is why the budget also takes the deterministic terms **at their worst** and keeps a separate margin $d_{\text{margin}}$. $k_\sigma$ is a **convention**, not a guarantee." />
      <Caption src={lit('cfbl-datasheet', 'flight-time')}>{tr({ ko: '10분은 Crazyflie 2.1 Brushless 의 기본 배터리 비행시간입니다.', en: 'Ten minutes is the flight time of the Crazyflie 2.1 Brushless with its stock battery.' })}</Caption>
    </Pitfall>
  );
}
