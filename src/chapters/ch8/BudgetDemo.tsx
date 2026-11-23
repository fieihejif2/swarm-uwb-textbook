/** 데모 1-A: 오차 예산 워터폴 (수평 / 수직) + 수식 ↔ 막대 연동 */
import { fmt, tr } from '../../app/i18n';
import { budget, config, setPath } from '../../app/store';
import { der, ex } from '../../sources';
import { Caption, CfgSlider, CfgVal, Demo, LinkGroup, M, P, SrcBadge, Stat, StatRow, Status, T, Toggle, Waterfall } from '../../ui';
import { commHops } from '../../sim/budget';
import { burstLengthQuantile } from '../../sim/loss';
import type { WaterfallItem } from '../../ui';

export function BudgetDemo() {
  const cfg = config.value, b = budget.value;
  const item = (id: string) => b.items.find((i) => i.id === id)!;
  const k = cfg.safety.kSigma;
  const extra = cfg.safety.extrapolate;
  const lq = burstLengthQuantile(cfg.comm.loss, 1e-3);
  const stacked = cfg.formation.shape === 'stack';
  const spacing = cfg.formation.spacing;
  const need = stacked ? b.minSepV : b.minSepH;
  const ok = spacing >= need - 1e-9;
  const top = Math.max(b.minSepH, b.minSepV, spacing) * 100 * 1.02;
  const rows = (vertical: boolean): WaterfallItem[] => {
    // cm 단위. 수직 값이 따로 있는 항목은 그것을 쓴다.
    const v = (id: string) => { const x = item(id); return (vertical && x.valueV !== undefined ? x.valueV : x.value) * 100; };
    const rand = k * Math.SQRT2 * Math.hypot(v('est-sigma'), v('tracking'));
    const delaySrc = der(extra ? 'ch8#extrapolate' : 'ch8#budget-sum', extra
      ? { ko: '외삽을 켠 상태: ½·a_max·t² 로 계산', en: 'Extrapolation on: computed as ½·a_max·t²' }
      : { ko: '상대속도 가정 × 시간', en: 'Assumed relative speed × time' });
    const out: WaterfallItem[] = [
      {
        label: vertical ? { ko: '기체 + 다운워시 (크기)', en: 'Body + downwash (size)' } : { ko: '기체 충돌 지름 (크기)', en: 'Collision diameter (size)' }, value: v('body'), slot: 7, link: 'body',
        src: vertical ? der('ch8#downwash', { ko: 'k_z × 충돌 지름', en: 'k_z × collision diameter' }) : ex('vehicle.envelope'),
      },
      { label: { ko: '두 대의 무작위 오차 묶음 (무작위)', en: 'Random errors of both drones (random)' }, value: rand, slot: 1, link: 'rand', src: der('ch8#rss', { ko: `k_σ·√2·√(σ_est² + σ_trk²). ${vertical ? '수직' : '수평'} σ_est 는 5장의 융합 결과`, en: `k_σ·√2·√(σ_est² + σ_trk²). The ${vertical ? 'vertical' : 'horizontal'} σ_est comes from the fusion of chapter 5` }) },
      { label: { ko: '앵커 좌표 오차 (편향)', en: 'Anchor survey error (bias)' }, value: v('anchor-bias'), slot: 4, link: 'bias', src: der('ch8#budget-sum', { ko: `${vertical ? 'VDOP' : 'HDOP'} × 앵커 좌표 측량 오차`, en: `${vertical ? 'VDOP' : 'HDOP'} × anchor survey error` }) },
      { label: { ko: '측위 지연 동안의 이동 (확정)', en: 'Motion during estimation latency (det.)' }, value: v('est-latency'), slot: 2, link: 'lat', src: der('ch8#budget-sum', { ko: '상대속도 가정 × 측위 지연', en: 'Assumed relative speed × estimation latency' }) },
      { label: { ko: '통신 지연·주기 동안의 이동 (확정)', en: 'Motion during comm delay and period (det.)' }, value: v('comm-delay'), slot: 2, link: 'comm', src: delaySrc },
      { label: { ko: '통신 공백 동안의 이동 (확정)', en: 'Motion during a loss burst (det.)' }, value: v('comm-gap'), slot: 2, link: 'gap', src: delaySrc },
      { label: { ko: '추가 여유 (크기)', en: 'Extra margin (size)' }, value: v('margin'), slot: 7, link: 'margin', src: ex('safety.margin') },
      { label: vertical ? { ko: '권장 최소 수직 간격', en: 'Recommended min. vertical spacing' } : { ko: '권장 최소 수평 간격', en: 'Recommended min. horizontal spacing' }, value: (vertical ? b.minSepV : b.minSepH) * 100, total: true, src: der('ch8#budget-sum', { ko: '위 일곱 줄의 합', en: 'Sum of the seven rows above' }) },
    ];
    if (vertical === stacked) out.push({ label: { ko: '비교: 지금 대형 간격', en: 'Compare: current formation spacing' }, value: spacing * 100, total: true, src: ex('formation.spacing') });
    return out;
  };
  return (
    <LinkGroup>
      <Demo title={{ ko: '예산 워터폴: 어느 항이 간격을 차지하는가', en: 'Budget waterfall: which term takes up the spacing' }} testId="ch8-budget-demo">
        <P ko="막대 하나가 식의 한 항입니다. 왼쪽에서 오른쪽으로 차례로 쌓여 맨 아래의 합계가 됩니다. 식의 항에 마우스를 올리면(또는 탭하면) 그 항의 막대가 강조됩니다. 슬라이더를 움직여 **어느 막대가 움직이는지** 보세요."
          en="Each bar is one term of the formula. They stack from left to right into the total at the bottom. Hover (or tap) a term of the formula to highlight its bar. Move the sliders and watch **which bar moves**." />
        <M block tex={String.raw`d_{\min} = \lk{body}{d_{\text{body}}} + \lk{rand}{k_\sigma\sqrt{2}\,\sqrt{\sigma_{\text{est}}^2 + \sigma_{\text{trk}}^2}} + \lk{bias}{b_{\text{anc}}} + \lk{lat}{v_{\text{rel}}\,\tau_{\text{est}}} + \lk{comm}{\Delta_{\text{comm}}} + \lk{gap}{\Delta_{\text{gap}}} + \lk{margin}{d_{\text{margin}}}`} />
        <p class="link-hint">{tr({ ko: '↑ 수식의 항을 가리키면 아래 두 표에서 같은 줄이 강조됩니다.', en: '↑ Point at a term to highlight the matching row in both tables below.' })}</p>
        <div class="controls">
          <CfgSlider path="formation.spacing" max={3} />
          <CfgSlider path="safety.kSigma" />
          <CfgSlider path="safety.relSpeed" max={2} />
          <CfgSlider path="safety.trackingError" max={20} />
          <CfgSlider path="safety.margin" max={30} />
          <CfgSlider path="safety.downwashRatio" max={6} />
          <CfgSlider path="vehicle.envelope" max={80} />
        </div>
        <Toggle label={{ ko: '이웃 위치 외삽 사용 (지연 항을 $v_{\\text{rel}}\\,t$ 대신 $\\tfrac12 a_{\\max} t^2$ 로 계산 — 아래 **이웃 위치 외삽** 절)', en: 'Extrapolate neighbour positions (delay terms become $\\tfrac12 a_{\\max} t^2$ instead of $v_{\\text{rel}}\\,t$ — see **Neighbour extrapolation** below)' }}
          checked={extra} onChange={(v) => setPath('safety.extrapolate', v)} testId="ch8-extrapolate-toggle" />
        <div class="grid-2" style={{ marginTop: '10px' }}>
          <div>
            <div class="plot-title">{tr({ ko: '수평 (같은 고도에서 옆으로)', en: 'Horizontal (side by side at one altitude)' })}</div>
            <Waterfall items={rows(false)} unit="cm" max={top} testId="ch8-waterfall-h" />
          </div>
          <div>
            <div class="plot-title">{tr({ ko: '수직 (위아래로)', en: 'Vertical (one above the other)' })}</div>
            <Waterfall items={rows(true)} unit="cm" max={top} testId="ch8-waterfall-v" />
          </div>
        </div>
        <StatRow>
          <Stat label={{ ko: '권장 최소 수평 간격', en: 'Min. horizontal spacing' }} value={b.minSepH} unit="m" src={der('ch8#budget-sum')} />
          <Stat label={{ ko: '권장 최소 수직 간격', en: 'Min. vertical spacing' }} value={b.minSepV} unit="m" src={der('ch8#budget-sum')} />
          <Stat label={{ ko: '지금 대형 간격', en: 'Current formation spacing' }} value={spacing} unit="m" src={ex('formation.spacing')} status={ok ? 'good' : 'bad'} />
          <Stat label={{ ko: '남는 여유 (간격 − 권장값)', en: 'Slack (spacing − recommended)' }} value={(spacing - need) * 100} unit="cm" src={der('ch8#budget-sum', { ko: stacked ? '지금 대형은 위아래로 쌓는 모양이라 수직 권장값과 비교' : '지금 대형은 같은 고도라 수평 권장값과 비교', en: stacked ? 'The current formation is stacked, so it is compared with the vertical value' : 'The current formation is level, so it is compared with the horizontal value' })} status={ok ? 'good' : 'bad'} />
        </StatRow>
        <p>
          {ok
            ? <Status kind="good">{tr({ ko: '지금 대형 간격은 권장 최소 간격 이상입니다', en: 'The current formation spacing meets the recommended minimum' })}</Status>
            : <Status kind="bad">{tr({ ko: '지금 대형 간격이 권장 최소 간격보다 좁습니다', en: 'The current formation spacing is below the recommended minimum' })}</Status>}
        </p>
        <p class="small muted" data-testid="ch8-budget-inputs">
          <T ko="통신 두 줄의 입력 — 무선 구간 수 $n$: " en="Inputs of the two communication rows — radio hops $n$: " /><b class="num">{commHops(cfg)}</b><SrcBadge src={der('ch6#ages', { ko: '전역 설정의 통신 구조에서: 지상국 중계 2, 기체 간 직접 1', en: 'From the communication structure in the settings: ground relay 2, direct 1' })} />
          <T ko=" · 편도 지연 $\tau_c$: " en=" · one-way delay $\tau_c$: " /><CfgVal path="comm.delayMean" />
          <T ko=" · 지터 $J$: " en=" · jitter $J$: " /><CfgVal path="comm.delayJitter" />
          <T ko=" · 방송 주기 $T_c$: " en=" · broadcast period $T_c$: " /><b class="num">{fmt(1000 / cfg.comm.rate, 3)} ms</b><SrcBadge src={ex('comm.rate', { ko: '1 / 방송 주기', en: '1 / broadcast rate' })} />
          <T ko=" · $L_{99.9}$: " en=" · $L_{99.9}$: " /><b class="num">{lq} {tr({ ko: '패킷', en: 'pkts' })}</b><SrcBadge src={der('ch7#ge-stationary')} />
          <T ko=" (손실 모델 $p_{GB}$ " en=" (loss model $p_{GB}$ " /><CfgVal path="comm.loss.pGB" /><T ko=", $p_{BG}$ " en=", $p_{BG}$ " /><CfgVal path="comm.loss.pBG" /><T ko=", $h_G$ " en=", $h_G$ " /><CfgVal path="comm.loss.lossGood" /><T ko=", $h_B$ " en=", $h_B$ " /><CfgVal path="comm.loss.lossBad" />
          <T ko="). 계산은 7장 **통신 항 계산**." en="). Computation: **Communication terms** in ch. 7." />
        </p>
        <Caption>{tr({
          ko: '막대 색은 항의 성격입니다(이름 끝의 괄호에도 적었습니다): 크기, 무작위, 편향, 확정. 두 표의 가로 눈금은 같습니다. 수직 쪽에서 달라지는 것은 첫 줄(다운워시)과 측위 오차가 들어가는 둘째·셋째 줄뿐이고, 지연 항 세 줄은 수평과 같습니다.',
          en: 'Bar colour is the kind of term (also written in brackets after each name): size, random, bias, deterministic. Both tables share one horizontal scale. In the vertical table only the first row (downwash) and the two rows that contain positioning error change; the three delay rows are the same as horizontal.',
        })}</Caption>
      </Demo>
    </LinkGroup>
  );
}
