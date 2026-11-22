import type { ChapterDef } from '../../app/chapters';
import { fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import { der } from '../../sources';
import { CfgVal, CodeTask, Derivation, List, M, Note, P, Predict, PredictNumber, Section, T } from '../../ui';
import { BudgetDemo } from './BudgetDemo';
import { CbfDemo } from './CbfDemo';
import { EllipsoidDemo } from './EllipsoidDemo';
import { ExtrapolateDemo } from './ExtrapolateDemo';
import { SigmaPitfall, StackPitfall } from './Pitfalls';
import { cbfTask, tasks } from './tasks';

function Body() {
  const cfg = config.value;
  const b = budget.value;
  const kEff = b.minSepV / b.minSepH;
  // 지금 전역 설정을 강건 CBF 의 입력으로 바꿔 본 값 (kσ·σ 를 "한계"로 간주하는 근사)
  const epsCfg = cfg.safety.kSigma * Math.sqrt(2 * b.sigmaEstH ** 2 + b.sigmaEstV ** 2);
  const ECfg = 2 * epsCfg + cfg.vehicle.vMax * b.ageMax;
  return (
    <>
      <Section id="assemble" title={{ ko: '숫자들을 한 줄로 더하기', en: 'Adding the numbers into one line' }}>
        <P ko="1~7장에서 숫자를 하나씩 모았습니다. 각 기체가 자기 위치를 얼마나 틀리게 아는지(5·6장), 이웃의 위치를 얼마나 늦게 아는지(7장). 이 장은 그것들을 더해서 '두 드론의 중심은 최소 몇 m 떨어져야 하는가'라는 숫자 하나, **최소 간격** $d_{\min}$ 으로 만듭니다. 0장에서 틀만 세워 둔 **오차 예산**(error budget)을 완성하는 일입니다."
          en="Chapters 1–7 collected numbers one by one: how wrongly each vehicle knows its own position (ch. 5 and 6) and how late it knows its neighbours' (ch. 7). This chapter adds them into a single number, the **minimum spacing** $d_{\min}$: how far apart the centres of two drones must be. It completes the **error budget** whose frame we set up in chapter 0." />
        <P ko="조심할 점은 **더하는 방법이 하나가 아니라는** 것입니다. 어떤 오차는 제곱해서 더하고, 어떤 오차는 그대로 더합니다. 먼저 가장 헷갈리는 것부터 예측해 봅시다."
          en="The catch is that **there is more than one way to add**. Some errors add in squares, some add directly. Start by predicting the most confusing case." />
        <Predict id="ch8-two-errors"
          question={{ ko: '드론 두 대가 각자 자기 위치를 표준편차 $\\sigma$ 만큼 틀리게 압니다. 두 대의 오차는 서로 무관(독립)합니다. 그러면 두 대 **사이의 거리**는 표준편차 얼마만큼 틀릴까요?', en: 'Two drones each know their own position with a standard deviation of $\\sigma$. The two errors are unrelated (independent). What is the standard deviation of the error in the **distance between them**?' }}
          choices={[
            { label: { ko: '$\\sigma$ — 평균하면 그대로다', en: '$\\sigma$ — it stays the same on average' } },
            { label: { ko: '$\\sqrt{2}\\,\\sigma$ — 늘어나지만 두 배는 아니다', en: '$\\sqrt{2}\\,\\sigma$ — larger, but not double' }, correct: true },
            { label: { ko: '$2\\sigma$ — 두 대의 오차가 그대로 더해진다', en: '$2\\sigma$ — the two errors simply add' } },
          ]}
          explain={{
            ko: '답은 $\\sqrt{2}\\,\\sigma$ 입니다. 두 오차가 **같은 순간에 서로 반대 방향으로** 가장 크게 벌어질 때만 $2\\sigma$ 가 되는데, 독립이면 그런 일은 드뭅니다. 한쪽이 크게 틀릴 때 다른 쪽은 대개 평범하게 틀립니다. 그래서 독립인 무작위 오차는 크기를 그대로 더하지 않고 **제곱을 더한 뒤 제곱근**을 취합니다. 바로 아래에서 두 줄로 증명합니다.',
            en: 'The answer is $\\sqrt{2}\\,\\sigma$. You would get $2\\sigma$ only if both errors were at their largest **at the same instant and in opposite directions**; for independent errors that is rare. When one is badly off the other is usually ordinary. So independent random errors do not add by size: you **add their squares and take the square root**. The two-line proof is right below.',
          }} />
        <Derivation id="rss" title={{ ko: '독립인 오차는 왜 제곱해서 더하나', en: 'Why independent errors add in quadrature' }}>
          <P ko="두 드론을 잇는 직선 방향만 봅시다. 드론 $i$ 의 위치 오차(그 방향 성분)를 $e_i$, 드론 $j$ 의 것을 $e_j$ 라 하면, 둘 사이 거리의 오차는 $e = e_i - e_j$ 입니다. 두 오차의 평균은 0, 분산은 $\sigma^2$ 이라고 합시다. 분산의 정의대로 전개하면"
            en="Look only along the line joining the two drones. Let $e_i$ be the position error of drone $i$ (its component along that line) and $e_j$ that of drone $j$; the error of the distance between them is $e = e_i - e_j$. Both have mean 0 and variance $\sigma^2$. Expanding the definition of variance," />
          <M block tex={String.raw`\operatorname{Var}(e) = \mathbb{E}\big[(e_i - e_j)^2\big] = \underbrace{\mathbb{E}[e_i^2]}_{\sigma^2} + \underbrace{\mathbb{E}[e_j^2]}_{\sigma^2} - 2\,\underbrace{\mathbb{E}[e_i e_j]}_{\tx{독립이면 0}{0 if independent}} = 2\sigma^2 \quad\Longrightarrow\quad \sigma_{\text{rel}} = \sqrt{2}\,\sigma`} />
          <P ko="가운데 항 $\mathbb{E}[e_i e_j]$ 가 **공분산**(covariance)입니다. 두 오차가 독립이면 한쪽의 부호가 다른 쪽에 대해 아무것도 알려 주지 않으므로 곱의 평균이 0 입니다. 이렇게 분산끼리 더하는 것을 **제곱합의 제곱근**(root-sum-square, RSS)이라고 부릅니다."
            en="The middle term $\mathbb{E}[e_i e_j]$ is the **covariance**. If the errors are independent, the sign of one tells you nothing about the other, so the mean of their product is 0. Adding variances like this is called **root-sum-square** (RSS)." />
          <P ko="같은 논리를 한 기체 안에서도 씁니다. 기체가 계획한 자리에서 벗어나는 까닭은 둘입니다. 자기 위치를 **틀리게 알아서**(추정 오차 $\sigma_{\text{est}}$, 5장), 그리고 아는 위치를 **정확히 따라가지 못해서**(추종 오차 $\sigma_{\text{trk}}$: 바람, 제어기의 한계). 둘이 독립이라고 보면 한 기체의 오차는 $\sqrt{\sigma_{\text{est}}^2 + \sigma_{\text{trk}}^2}$ 이고, 두 기체 사이에서는 여기에 $\sqrt2$ 가 붙습니다."
            en="The same logic applies inside one vehicle. A vehicle leaves its planned spot for two reasons: it **knows its position wrongly** (estimation error $\sigma_{\text{est}}$, ch. 5) and it **cannot follow the known position exactly** (tracking error $\sigma_{\text{trk}}$: wind, limits of the controller). Treating the two as independent, one vehicle's error is $\sqrt{\sigma_{\text{est}}^2 + \sigma_{\text{trk}}^2}$, and between two vehicles a factor $\sqrt2$ is added." />
          <M block tex={String.raw`\sigma_{\text{rel}} = \sqrt{2}\,\sqrt{\sigma_{\text{est}}^2 + \sigma_{\text{trk}}^2}, \qquad \tx{예산에 넣는 몫}{allowance in the budget} = k_\sigma\,\sigma_{\text{rel}}`} />
          <P ko="$\sigma_{\text{rel}}$ 은 '평소 크기'일 뿐이므로 **신뢰 배수** $k_\sigma$ 를 곱해 꼬리까지 덮습니다. 오차가 정규분포라면 두 기체가 $k_\sigma\sigma_{\text{rel}}$ 넘게 가까워질 확률은 $1 - \Phi(k_\sigma)$ 입니다($\Phi$ 는 표준정규분포의 누적분포함수). $k_\sigma$ = 1 이면 약 16%{{der:ch8#rss|1 − Φ(1) = 15.9%|1 − Φ(1) = 15.9%}}, 3 이면 약 0.13%{{der:ch8#rss|1 − Φ(3) = 0.135%|1 − Φ(3) = 0.135%}} 입니다. 지금 설정은 $k_\sigma$ = {{cfg:safety.kSigma}} 입니다."
            en="$\sigma_{\text{rel}}$ is only the typical size, so we multiply by a **confidence multiplier** $k_\sigma$ to cover the tail. For normally distributed errors the probability that the two vehicles come closer by more than $k_\sigma\sigma_{\text{rel}}$ is $1 - \Phi(k_\sigma)$ ($\Phi$ is the standard normal cumulative distribution). For $k_\sigma$ = 1 that is about 16%{{der:ch8#rss|1 − Φ(1) = 15.9%|1 − Φ(1) = 15.9%}}, for 3 about 0.13%{{der:ch8#rss|1 − Φ(3) = 0.135%|1 − Φ(3) = 0.135%}}. The current setting is $k_\sigma$ = {{cfg:safety.kSigma}}." />
        </Derivation>

        <P ko="하지만 모든 오차가 이렇게 줄어들지는 않습니다. 제곱해서 더해도 되는 것은 **매 순간 새로 뽑히고 서로 무관한** 오차뿐입니다. 예산의 항은 성격에 따라 네 종류로 나뉩니다."
          en="Not every error shrinks this way, though. Quadrature is allowed only for errors that are **drawn afresh at every moment and unrelated to each other**. The terms of the budget fall into four kinds." />
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '성격', en: 'Kind' })}</th><th>{tr({ ko: '예', en: 'Example' })}</th><th>{tr({ ko: '더하는 법', en: 'How it is added' })}</th><th>{tr({ ko: '이유', en: 'Why' })}</th></tr></thead>
            <tbody>
              <tr><td><b>{tr({ ko: '무작위', en: 'Random' })}</b></td><td><T ko="추정 오차 $\sigma_{\text{est}}$, 추종 오차 $\sigma_{\text{trk}}$" en="estimation error $\sigma_{\text{est}}$, tracking error $\sigma_{\text{trk}}$" /></td><td><T ko="제곱합의 제곱근, 그 뒤 $k_\sigma$ 배" en="root-sum-square, then times $k_\sigma$" /></td><td><T ko="평균 0, 독립. 동시에 최악일 가능성이 낮다" en="zero mean, independent; unlikely to be worst at once" /></td></tr>
              <tr><td><b>{tr({ ko: '편향', en: 'Bias' })}</b></td><td><T ko="앵커 좌표를 잘못 재서 생기는 위치 편향 $b_{\text{anc}}$ (6장)" en="position bias $b_{\text{anc}}$ from mis-surveyed anchors (ch. 6)" /></td><td><T ko="그대로 더한다" en="added as is" /></td><td><T ko="비행 내내 같은 값. 시간이 지나도 평균되어 사라지지 않는다" en="constant for the whole flight; does not average out over time" /></td></tr>
              <tr><td><b>{tr({ ko: '확정', en: 'Deterministic' })}</b></td><td><T ko="지연 × 상대속도, 통신 공백 동안의 이동 (7장)" en="delay × relative speed, motion during a communication gap (ch. 7)" /></td><td><T ko="그대로 더한다" en="added as is" /></td><td><T ko="무작위가 아니라 '이 시간 동안 이만큼 움직인다'는 계산값" en="not random: a computed 'moves this far in this time'" /></td></tr>
              <tr><td><b>{tr({ ko: '크기', en: 'Size' })}</b></td><td><T ko="기체 충돌 지름 $d_{\text{body}}$, 추가 여유 $d_{\text{margin}}$" en="collision diameter $d_{\text{body}}$, extra margin $d_{\text{margin}}$" /></td><td><T ko="그대로 더한다" en="added as is" /></td><td><T ko="오차가 아니라 물리적 크기와 우리가 정한 여유" en="not errors: physical size and a margin we choose" /></td></tr>
            </tbody>
          </table>
        </div>

        <Derivation id="budget-sum" title={{ ko: '최소 간격의 식: 엔진이 실제로 계산하는 것', en: 'The minimum-spacing formula: what the engine actually computes' }}>
          <P ko="이 교재의 오차 예산(화면 아래 막대, 그리고 모든 장의 데모)은 다음 식을 수평과 수직에 한 번씩 계산합니다."
            en="The error budget of this textbook (the bar at the bottom of the screen, and the demos of every chapter) evaluates the following formula once horizontally and once vertically." />
          <M block tex={String.raw`d_{\min} = \underbrace{d_{\text{body}}}_{\tx{크기}{size}} + \underbrace{k_\sigma\sqrt{2}\,\sqrt{\sigma_{\text{est}}^2 + \sigma_{\text{trk}}^2}}_{\tx{무작위}{random}} + \underbrace{b_{\text{anc}}}_{\tx{편향}{bias}} + \underbrace{v_{\text{rel}}\,\tau_{\text{est}} + \Delta_{\text{comm}} + \Delta_{\text{gap}}}_{\tx{확정}{deterministic}} + \underbrace{d_{\text{margin}}}_{\tx{여유}{margin}}`} />
          <List items={[
            { ko: '$d_{\\text{body}}$ [m]: 프로펠러 가드까지 포함한 **충돌 지름**. 두 기체의 중심이 이보다 가까우면 닿습니다. 수직에서는 $k_z\\,d_{\\text{body}}$ 를 씁니다($k_z$ 는 다음 절의 다운워시 비율).', en: '$d_{\\text{body}}$ [m]: the **collision diameter** including propeller guards. Centres closer than this touch. Vertically $k_z\\,d_{\\text{body}}$ is used ($k_z$ is the downwash ratio of the next section).' },
            { ko: '$\\sigma_{\\text{est}}$ [m]: 융합 뒤의 위치 추정 오차(5장). 수평에는 HDOP, 수직에는 VDOP 로 계산한 값이 따로 들어갑니다(2장). $\\sigma_{\\text{trk}}$ [m]: 추종 오차. 수평·수직에 같은 값을 씁니다.', en: '$\\sigma_{\\text{est}}$ [m]: position estimation error after fusion (ch. 5). The horizontal value comes from HDOP and the vertical one from VDOP (ch. 2). $\\sigma_{\\text{trk}}$ [m]: tracking error, the same value horizontally and vertically.' },
            { ko: '$b_{\\text{anc}} \\approx \\text{DOP}\\cdot\\delta_{\\text{anc}}$ [m]: 앵커 좌표 측량 오차 $\\delta_{\\text{anc}}$ 가 만드는 위치 편향(6장). 수평은 HDOP, 수직은 VDOP.', en: '$b_{\\text{anc}} \\approx \\text{DOP}\\cdot\\delta_{\\text{anc}}$ [m]: position bias caused by the anchor survey error $\\delta_{\\text{anc}}$ (ch. 6); HDOP horizontally, VDOP vertically.' },
            { ko: '$v_{\\text{rel}}\\,\\tau_{\\text{est}}$ [m]: 측위 결과가 비행제어기에 닿기까지의 지연 $\\tau_{\\text{est}}$ 동안 두 기체가 상대속도 $v_{\\text{rel}}$ 로 가까워지는 거리.', en: '$v_{\\text{rel}}\\,\\tau_{\\text{est}}$ [m]: how far two vehicles close in at relative speed $v_{\\text{rel}}$ during the latency $\\tau_{\\text{est}}$ before a position fix reaches the flight controller.' },
            { ko: '$\\Delta_{\\text{comm}} = v_{\\text{rel}}\\,(\\tau_c + T_c)$ [m]: 통신 지연의 최댓값 $\\tau_c$ (평균 + 지터, 지상국 중계면 두 구간)와 방송 주기 $T_c$ 동안의 이동(7장).', en: '$\\Delta_{\\text{comm}} = v_{\\text{rel}}\\,(\\tau_c + T_c)$ [m]: motion during the largest comm delay $\\tau_c$ (mean + jitter; two hops for the ground relay) and one broadcast period $T_c$ (ch. 7).' },
            { ko: '$\\Delta_{\\text{gap}} = v_{\\text{rel}}\\,L_{99.9}\\,T_c$ [m]: 1000번에 1번 나오는 연속 손실 $L_{99.9}$ 패킷 동안의 이동(7장). 이웃 위치 외삽을 켜면 $\\Delta_{\\text{comm}}$ 과 $\\Delta_{\\text{gap}}$ 의 식이 바뀝니다(아래 **이웃 위치 외삽** 절).', en: '$\\Delta_{\\text{gap}} = v_{\\text{rel}}\\,L_{99.9}\\,T_c$ [m]: motion during the 1-in-1000 loss burst of $L_{99.9}$ packets (ch. 7). With neighbour extrapolation on, the formulas for $\\Delta_{\\text{comm}}$ and $\\Delta_{\\text{gap}}$ change (see **Neighbour extrapolation** below).' },
            { ko: '$d_{\\text{margin}}$ [m]: 모델에 없는 것(기체의 실제 동역학, 돌풍, 측정하지 못한 것)을 위해 남겨 두는 여유.', en: '$d_{\\text{margin}}$ [m]: a reserve for what the model leaves out (real vehicle dynamics, gusts, things we could not measure).' },
          ]} />
          <P ko="**왜 편향과 확정 항은 그대로 더하나.** 무작위 오차는 두 기체가 동시에 최악이 되기 어렵다는 이유로 $\sqrt2$ 만 곱했습니다. 편향과 지연에는 그 논리가 통하지 않습니다. 앵커 좌표 오차는 비행 내내 같은 방향으로 위치를 밀고, 지연 동안의 이동은 두 기체가 서로를 향해 움직이는 한 항상 '가까워지는 쪽'입니다. 평균해도 0 이 되지 않으므로 크기 그대로 더합니다."
            en="**Why bias and deterministic terms add directly.** Random errors got only a factor $\sqrt2$ because both vehicles are unlikely to be at their worst together. That argument fails for bias and delay. An anchor survey error pushes the position the same way for the whole flight, and motion during a delay is always 'towards each other' as long as the vehicles are approaching. These do not average to zero, so they are added at full size." />
          <P ko="**어디까지가 수학이고 어디부터가 약속인가.** 솔직하게 나누면 이렇습니다."
            en="**Where the mathematics ends and convention begins.** Honestly separated:" />
          <List items={[
            { ko: '**수학**: 독립인 오차의 분산은 더해진다(위 유도). 지연 $t$ 동안 속도 $v$ 로 움직이면 $v t$ 만큼 간다.', en: '**Mathematics**: variances of independent errors add (derivation above). Moving at speed $v$ for a delay $t$ covers $v t$.' },
            { ko: '**약속 ①** $k_\\sigma$ = 3 이라는 선택. 정규분포를 가정한 숫자이고, 4장에서 본 것처럼 UWB 오차의 꼬리는 정규분포보다 두껍습니다. 보장이 아닙니다.', en: '**Convention ①** choosing $k_\\sigma$ = 3. It assumes a normal distribution, and as chapter 4 showed, UWB errors have heavier tails. It is not a guarantee.' },
            { ko: '**약속 ②** 두 기체의 무작위 오차가 독립이라는 가정. 같은 앵커를 보는 가까운 두 기체의 오차는 일부가 같이 움직여 상대 위치에서는 상쇄됩니다. 그 경우 $\\sqrt2$ 는 넉넉한 쪽입니다.', en: '**Convention ②** assuming the two vehicles’ random errors are independent. Two nearby vehicles seeing the same anchors share part of their error, which cancels in the relative position; then $\\sqrt2$ is on the generous side.' },
            { ko: '**약속 ③** 편향 $b_{\\text{anc}}$ 를 한 번만, 그대로 더하는 것. 가까운 두 기체는 거의 같은 편향을 겪어 상대 위치에서는 대부분 상쇄되지만, 얼마나 상쇄되는지는 위치에 따라 달라 예산은 상쇄를 기대하지 않습니다.', en: '**Convention ③** adding the bias $b_{\\text{anc}}$ once, at full size. Two nearby vehicles see nearly the same bias, which mostly cancels in the relative position; how much depends on where they are, so the budget does not count on it.' },
            { ko: '**약속 ④** 확정 항에 최악값(최대 지연, 1000번에 1번 나오는 공백)을 쓰고, 그것들이 무작위 몫의 최악과 **동시에** 일어난다고 보고 모두 더하는 것. 보수적입니다.', en: '**Convention ④** using worst cases for the deterministic terms (maximum delay, the 1-in-1000 gap) and adding them all as if they coincided with the worst of the random allowance. Conservative.' },
            { ko: '**약속 ⑤** 상대속도 $v_{\\text{rel}}$ 과 여유 $d_{\\text{margin}}$ 은 우리가 정하는 값입니다. 수직 방향에도 같은 $v_{\\text{rel}}$ 을 씁니다.', en: '**Convention ⑤** the relative speed $v_{\\text{rel}}$ and the margin $d_{\\text{margin}}$ are our choices. The same $v_{\\text{rel}}$ is used vertically.' },
          ]} />
          <P ko="약속은 틀릴 수 있습니다. 그래서 식의 입력을 전부 화면에 드러내고, 바꿨을 때 무엇이 움직이는지 볼 수 있게 했습니다."
            en="Conventions can be wrong. That is why every input of the formula is exposed on screen and you can see what moves when you change it." />
        </Derivation>
        <BudgetDemo />
        <Note>
          <P ko="**추종 오차는 얼마로 잡아야 하나.** Crazyswarm 은 모션 캡처로 위치를 재는 6 m × 6 m × 3 m{{lit:crazyswarm2017/arena}} 공간에서 49대를 날리며 평균 추종 오차 2 cm 미만{{lit:crazyswarm2017/tracking-error}}을 보고했습니다. 우리는 모션 캡처가 아니라 정확도가 10 cm 수준{{lit:lps-docs/accuracy}}인 UWB 를 쓰므로 그 숫자를 그대로 가져올 수 없습니다. 지금 설정의 {{cfg:safety.trackingError}} 는 측정 전의 예시값이고, 9장에서 호버링 로그로 직접 잽니다."
            en="**What tracking error should we assume?** Crazyswarm flew 49 vehicles in a 6 m × 6 m × 3 m{{lit:crazyswarm2017/arena}} space with motion-capture positioning and reported a mean tracking error below 2 cm{{lit:crazyswarm2017/tracking-error}}. We use UWB, whose accuracy is in the 10 cm range{{lit:lps-docs/accuracy}}, not motion capture, so that figure does not carry over. The current {{cfg:safety.trackingError}} is an example value pending measurement; chapter 9 measures it from a hover log." />
        </Note>
      </Section>

      <Section id="downwash" title={{ ko: '다운워시: 위아래는 더 멀리', en: 'Downwash: farther apart vertically' }}>
        <P ko="쿼드로터는 공기를 아래로 밀어내서 뜹니다. 이 아래로 내려가는 빠른 공기 흐름을 **다운워시**(downwash)라고 합니다. 다른 기체의 바로 아래를 날면 이 흐름을 그대로 맞아 안정성을 잃을 수 있습니다{{lit:downwash2017/downwash-motivation}}. 그래서 기체 둘레의 '들어오면 안 되는 영역'은 공 모양이 아니라 **위아래로 길쭉한** 모양이어야 합니다."
          en="A quadrotor stays up by pushing air down. That fast downward stream is called **downwash**. A vehicle flying directly beneath another takes the full stream and can lose stability{{lit:downwash2017/downwash-motivation}}. So the keep-out region around a vehicle should not be a ball but a shape that is **elongated vertically**." />
        <Derivation id="downwash" title={{ ko: '다운워시 타원체와 타원체 거리', en: 'The downwash ellipsoid and ellipsoidal distance' }}>
          <P ko="Preiss 등은 각 기체를 축에 나란한 **타원체**로 모델링했습니다. 수평 반지름 $r_x = r_y$ 는 작고 수직 반지름 $r_z$ 는 큽니다. 두 기체의 위치를 $p$, $q$ 라 할 때 충돌 회피 조건은 다음과 같습니다{{lit:downwash2017/ellipsoid-model}}."
            en="Preiss et al. model each vehicle as an axis-aligned **ellipsoid** with small horizontal radii $r_x = r_y$ and a large vertical radius $r_z$. With vehicle positions $p$ and $q$, the collision-avoidance condition is{{lit:downwash2017/ellipsoid-model}}" />
          <M block tex={String.raw`\norm{E^{-1}(p - q)} \ge 2, \qquad E = \operatorname{diag}(r_x,\ r_y,\ r_z)`} />
          <P ko="뜻은 간단합니다. 좌표를 축마다 반지름으로 나누면 타원체가 반지름 1 인 공이 되고, 공 두 개가 겹치지 않으려면 중심이 2 이상 떨어져야 합니다. 이 식을 우리가 쓰기 편한 꼴로 바꿉시다. 상대 위치를 $p - q = (x, y, z)$ 라 쓰고 $r_x = r_y = r_{xy}$ 로 놓은 뒤 양변에 $r_{xy}$ 를 곱하면"
            en="The meaning is simple: divide each axis by its radius and the ellipsoid becomes a unit ball; two unit balls do not overlap when their centres are at least 2 apart. Let us rewrite it in a handier form. Write the relative position as $p - q = (x, y, z)$, set $r_x = r_y = r_{xy}$ and multiply both sides by $r_{xy}$:" />
          <M block tex={String.raw`\sqrt{x^2 + y^2 + \Big(\frac{z}{k_z}\Big)^{2}} \;\ge\; 2\,r_{xy}, \qquad k_z = \frac{r_z}{r_{xy}}`} />
          <P ko="왼쪽을 **타원체 거리** $\lVert r\rVert_E$ 라고 부르겠습니다. z 성분만 $k_z$ 로 나눈 뒤 재는 보통의 거리입니다. 행렬로 쓰면 $S = \operatorname{diag}(1, 1, 1/k_z)$ 에 대해 $\lVert r\rVert_E = \lVert S\,r\rVert$ 입니다. 이렇게 하면 숫자 두 개로 충분합니다. 같은 고도에서 필요한 거리 $2r_{xy}$ (우리 식의 $d_{\text{body}}$)와, 위아래로는 그 몇 배가 필요한지를 말하는 **다운워시 비율** $k_z$. 엔진의 `ellipsoidDistance(r, kz)` 가 이 계산입니다."
            en="Call the left side the **ellipsoidal distance** $\lVert r\rVert_E$: the ordinary distance measured after dividing only the z component by $k_z$. In matrix form, with $S = \operatorname{diag}(1, 1, 1/k_z)$, $\lVert r\rVert_E = \lVert S\,r\rVert$. Two numbers are then enough: the distance needed at equal altitude, $2r_{xy}$ (our $d_{\text{body}}$), and the **downwash ratio** $k_z$ that says how many times more is needed vertically. The engine function `ellipsoidDistance(r, kz)` is this computation." />
          <P ko="그 논문은 Crazyflie 2.0 에 $r_z$ = 0.3 m{{lit:downwash2017/ellipsoid-rz}}, $r_{xy}$ = 0.12 m{{lit:downwash2017/ellipsoid-rxy}} 를 썼습니다. 따라서 $k_z$ = 2.5{{der:ch8#downwash|0.3 m ÷ 0.12 m|0.3 m ÷ 0.12 m}}, 같은 xy 위치에서 필요한 수직 중심 거리는 $2r_z$ = 0.6 m{{der:ch8#downwash|2 × 0.3 m. 같은 논문의 격자 계획 제약 |Δz| ≥ 2 r_z 와 같은 값|2 × 0.3 m, the same as that paper’s grid-planning constraint}} 입니다. 격자 계획 단계에서도 xy 가 같은 두 로봇에 $|\Delta z| \ge 2r_z$ 를 요구합니다{{lit:downwash2017/discrete-downwash-constraint}}."
            en="That paper used $r_z$ = 0.3 m{{lit:downwash2017/ellipsoid-rz}} and $r_{xy}$ = 0.12 m{{lit:downwash2017/ellipsoid-rxy}} for the Crazyflie 2.0. Hence $k_z$ = 2.5{{der:ch8#downwash|0.3 m ÷ 0.12 m|0.3 m ÷ 0.12 m}}, and the vertical centre distance needed at the same xy position is $2r_z$ = 0.6 m{{der:ch8#downwash|2 × 0.3 m. 같은 논문의 격자 계획 제약 |Δz| ≥ 2 r_z 와 같은 값|2 × 0.3 m, the same as that paper’s grid-planning constraint}}. Its grid-planning stage likewise requires $|\Delta z| \ge 2r_z$ for two robots sharing an xy position{{lit:downwash2017/discrete-downwash-constraint}}." />
          <P ko="**예산의 타원체는 이보다 덜 길쭉합니다.** 예산은 수평 간격 $d_{\min,H}$ 와 수직 간격 $d_{\min,V}$ 를 따로 계산합니다. $k_z$ 배로 늘어나는 것은 첫 항 $d_{\text{body}}$ 뿐이고, 측위 오차와 지연 항은 수직이라고 $k_z$ 배가 되지 않습니다. 그래서 기체마다 수평 반축 $d_{\min,H}/2$, 수직 반축 $d_{\min,V}/2$ 인 타원체를 씌우면, 두 타원체가 겹치지 않을 조건은 위와 똑같은 계산으로"
            en="**The ellipsoid of the budget is less elongated.** The budget computes a horizontal spacing $d_{\min,H}$ and a vertical spacing $d_{\min,V}$ separately. Only the first term $d_{\text{body}}$ is stretched by $k_z$; positioning error and delay terms are not multiplied by $k_z$ just because they are vertical. Put an ellipsoid with horizontal semi-axis $d_{\min,H}/2$ and vertical semi-axis $d_{\min,V}/2$ on each vehicle and, by exactly the same computation, the two do not overlap when" />
          <M block tex={String.raw`\sqrt{x^2 + y^2 + \Big(\frac{z}{k_{\text{eff}}}\Big)^{2}} \;\ge\; d_{\min,H}, \qquad k_{\text{eff}} = \frac{d_{\min,V}}{d_{\min,H}}`} />
          <P ko={`지금 설정에서는 $k_z$ = {{cfg:safety.downwashRatio}} 인데 $k_{\\text{eff}}$ = ${fmt(kEff, 3)}{{der:ch8#downwash|권장 수직 간격 ÷ 권장 수평 간격|recommended vertical ÷ horizontal spacing}} 입니다.`}
            en={`With the current settings $k_z$ = {{cfg:safety.downwashRatio}} while $k_{\\text{eff}}$ = ${fmt(kEff, 3)}{{der:ch8#downwash|권장 수직 간격 ÷ 권장 수평 간격|recommended vertical ÷ horizontal spacing}}.`} />
        </Derivation>
        <Note>
          <P ko="**우리 기체의 $k_z$ 는 아직 아무도 모릅니다.** 위 숫자는 Crazyflie 2.0 의 것입니다(배터리 포함 27 g{{lit:crazyswarm2017/vehicle}}). 우리가 쓰는 Crazyflie 2.1 Brushless 는 가드를 달면 37 g{{lit:cfbl-datasheet/takeoff-weight-guards}} 으로 더 무겁고, 무거운 기체는 떠 있기 위해 공기를 더 세게 밀어내야 합니다. 다운워시가 2.0 과 같다고 볼 근거가 없습니다. 전역 설정의 $k_z$ = {{cfg:safety.downwashRatio}} 는 2.0 의 비율을 빌려 온 **예시값**이고, 동아리가 직접 재야 합니다. 방법은 그 논문과 같습니다. 두 기체를 위아래로 띄워 놓고 위치 오차를 기록하면서{{lit:downwash2017/ellipsoid-rz}} 수직 간격을 조금씩 줄여, 아래 기체의 흔들림이 평소 수준을 넘기 시작하는 간격을 찾습니다. 절차는 9장에 있습니다."
            en="**Nobody knows $k_z$ for our vehicle yet.** The numbers above belong to the Crazyflie 2.0 (27 g with battery{{lit:crazyswarm2017/vehicle}}). Our Crazyflie 2.1 Brushless weighs 37 g with guards{{lit:cfbl-datasheet/takeoff-weight-guards}}, and a heavier vehicle must push air down harder to stay up. There is no reason to believe its downwash equals that of the 2.0. The global setting $k_z$ = {{cfg:safety.downwashRatio}} is an **example value** borrowed from the 2.0 ratio; the club must measure its own. The method is that paper's: hover two vehicles one above the other, record the position error{{lit:downwash2017/ellipsoid-rz}} while reducing the vertical separation step by step, and find where the lower vehicle's wobble starts to exceed its normal level. The procedure is in chapter 9." />
        </Note>
        <PredictNumber id="ch8-vertical-need"
          question={{ ko: `지금 설정에서 같은 고도의 두 기체는 중심 사이를 ${fmt(b.minSepH, 3)} m{{der:ch8#budget-sum}} 띄우라고 예산이 말합니다. 한 대를 다른 대의 **바로 위**에 띄운다면 중심 사이를 몇 m 띄워야 할까요?`, en: `With the current settings the budget asks for ${fmt(b.minSepH, 3)} m{{der:ch8#budget-sum}} between the centres of two vehicles at the same altitude. If one flies **directly above** the other, how many metres apart must the centres be?` }}
          min={0.2} max={3} step={0.05} unit="m" actual={b.minSepV} actualSrc={der('ch8#budget-sum', { ko: '수직 방향으로 계산한 권장 최소 간격', en: 'Recommended minimum spacing computed for the vertical direction' })} tolerance={0.12}
          explain={{
            ko: `수평 값에 $k_z$ 를 곱한 값(${fmt(b.minSepH * cfg.safety.downwashRatio, 3)} m{{der:ch8#downwash|권장 수평 간격 × k_z|recommended horizontal spacing × k_z}})보다는 작고, 수평 값보다는 큽니다. $k_z$ 배가 되는 것은 기체 크기 항뿐이고 지연 항은 그대로이기 때문입니다. 대신 수직 측위 오차는 VDOP 때문에 수평보다 큽니다(2장). 아래 3D 그림에서 한 대를 다른 대 위로 올려 보세요.`,
            en: `It is smaller than the horizontal value times $k_z$ (${fmt(b.minSepH * cfg.safety.downwashRatio, 3)} m{{der:ch8#downwash|권장 수평 간격 × k_z|recommended horizontal spacing × k_z}}) and larger than the horizontal value. Only the body term is multiplied by $k_z$; the delay terms stay the same. On the other hand the vertical positioning error is larger than the horizontal one because of VDOP (ch. 2). Lift one drone above the other in the 3-D picture below.`,
          }} />
        <EllipsoidDemo />
      </Section>

      <Section id="cbf" title={{ ko: 'CBF 안전 필터: 실행 중에 간격을 지키는 장치', en: 'The CBF safety filter: keeping the spacing at run time' }}>
        <P ko="예산은 **계획할 때** 쓰는 숫자입니다. 대형 간격을 $d_{\min}$ 이상으로 잡으면 평소에는 문제가 없습니다. 하지만 비행 중에 누군가 돌풍에 밀리거나, 대형을 바꾸느라 두 기체의 경로가 엇갈리면 계획한 간격은 순간적으로 깨집니다. 그때 마지막으로 막아 주는 장치가 필요합니다. 대형 제어기가 내린 속도 명령을 기체에 보내기 직전에 한 번 검사해서, 위험할 때만 최소한으로 고치는 **안전 필터**(safety filter)입니다."
          en="The budget is a number for **planning**. With the formation spacing at $d_{\min}$ or more, things are normally fine. But when a gust pushes someone, or two paths cross during a formation change, the planned spacing breaks for a moment. Something must stop it as a last line of defence: a **safety filter** that inspects the velocity command of the formation controller just before it goes to the vehicle and corrects it, minimally, only when it is dangerous." />
        <P ko="여기서는 **제어 장벽 함수**(control barrier function, CBF)로 필터를 만듭니다. 자동제어 수업에서 본 리아푸노프 함수가 '이 값이 줄어들면 안정'을 말해 주는 함수였다면, 장벽 함수는 '이 값이 0 아래로 내려가지 않으면 안전'을 말해 주는 함수입니다. 이 절의 내용은 문헌에서 숫자를 가져오지 않고 교재 안에서 처음부터 유도합니다."
          en="We build the filter with a **control barrier function** (CBF). Where the Lyapunov function of your control course says 'stable if this value decreases', a barrier function says 'safe if this value never goes below 0'. Nothing in this section is taken from the literature; everything is derived from scratch inside the textbook." />
        <Derivation id="cbf" title={{ ko: '기본 CBF 필터의 유도', en: 'Deriving the basic CBF filter' }}>
          <P ko="**모델과 기호.** 좌표는 x, y 가 강당 바닥, z 가 위쪽입니다. 0장과 같이 기체는 속도 명령을 그대로 따르는 질점이라고 봅니다: $\dot p_i = u_i$ [m/s], $\lVert u_i\rVert \le v_{\max}$. 드론 $i$ 가 본 드론 $j$ 와의 상대 위치를 z 만 줄인 좌표로 쓰고, 속도 명령도 같은 좌표로 옮깁니다."
            en="**Model and notation.** x and y span the hall floor, z points up. As in chapter 0 a vehicle is a point mass that follows its velocity command exactly: $\dot p_i = u_i$ [m/s], $\lVert u_i\rVert \le v_{\max}$. Write the position of drone $i$ relative to drone $j$ in coordinates with only z shrunk, and move the velocity commands into the same coordinates." />
          <M block tex={String.raw`r = S\,(p_i - p_j), \qquad d = \norm{r} \;(= \tx{타원체 거리}{ellipsoidal distance}), \qquad \hat n = \frac{r}{d}, \qquad w_i = S\,u_i, \qquad S = \operatorname{diag}(1, 1, 1/k_z)`} />
          <P ko="$\hat n$ 은 $j$ 에서 $i$ 를 향하는 단위벡터입니다. **장벽 함수**를 이렇게 정합니다."
            en="$\hat n$ is the unit vector pointing from $j$ to $i$. Define the **barrier function** as" />
          <M block tex={String.raw`h(p_i, p_j) = d - d_{\min} \qquad (h \ge 0 \;\Leftrightarrow\; \tx{안전}{safe})`} />
          <P ko="**1단계: 거리는 얼마나 빨리 변하나.** $d = \sqrt{r^{\T} r}$ 를 시간으로 미분하면"
            en="**Step 1: how fast does the distance change?** Differentiate $d = \sqrt{r^{\T} r}$ with respect to time:" />
          <M block tex={String.raw`\dot h = \dot d = \frac{r^{\T}\dot r}{\norm{r}} = \hat n^{\T} S\,(u_i - u_j) = \hat n^{\T}(w_i - w_j)`} />
          <P ko="두 기체의 속도 차이 가운데 **서로를 잇는 방향 성분**만 거리를 바꿉니다. 옆으로(접선 방향으로) 움직이는 것은 그 순간의 거리를 바꾸지 않습니다."
            en="Only the component of the velocity difference **along the line joining them** changes the distance. Sideways (tangential) motion does not change it at that instant." />
          <P ko="**2단계: 얼마나 빨리 다가가도 되나.** $h \ge 0$ 을 지키려고 '절대 다가가지 마라'($\dot h \ge 0$)고 하면 대형을 좁힐 수도 없습니다. 대신 **가까울수록 천천히** 다가가게 합니다."
            en="**Step 2: how fast may they approach?** Demanding 'never approach' ($\dot h \ge 0$) to keep $h \ge 0$ would make it impossible even to tighten a formation. Instead we let them approach **more slowly the closer they are**:" />
          <M block tex={String.raw`\dot h \;\ge\; -\alpha\,h \qquad (\alpha > 0\ [1/\text{s}])`} />
          <P ko="여유 $h$ 가 0.5 m{{ex}} 이고 $\alpha$ = 2 /s{{ex}} 이면 초속 1 m{{der:ch8#cbf|α·h = 2 /s × 0.5 m|α·h = 2 /s × 0.5 m}} 까지 다가가도 되고, 여유가 0.05 m{{ex}} 로 줄면 초속 0.1 m{{der:ch8#cbf|α·h = 2 /s × 0.05 m|α·h = 2 /s × 0.05 m}} 까지만 허용됩니다. 여유가 0 이면 더 다가갈 수 없습니다. 경계선 $\dot h = -\alpha h$ 의 해는 $h(t) = h(0)\,e^{-\alpha t}$ 로, 0 에 한없이 가까워지지만 닿지 않습니다. 조건을 지키는 한 $h$ 는 이 곡선보다 아래로 내려갈 수 없으므로 처음에 안전했다면 계속 안전합니다. $\alpha$ 가 클수록 늦게까지 버티다 급하게 멈추고, 작을수록 멀리서부터 조심합니다."
            en="With a margin $h$ of 0.5 m{{ex}} and $\alpha$ = 2 /s{{ex}} they may close at up to 1 m/s{{der:ch8#cbf|α·h = 2 /s × 0.5 m|α·h = 2 /s × 0.5 m}}; when the margin shrinks to 0.05 m{{ex}} only 0.1 m/s{{der:ch8#cbf|α·h = 2 /s × 0.05 m|α·h = 2 /s × 0.05 m}} is allowed. At zero margin no further approach is possible. The boundary case $\dot h = -\alpha h$ has the solution $h(t) = h(0)\,e^{-\alpha t}$, which approaches 0 for ever without reaching it. As long as the condition holds, $h$ cannot fall below this curve, so a safe start stays safe. A larger $\alpha$ waits longer and brakes harder; a smaller one is cautious from far away." />
          <P ko="**3단계: 책임을 절반씩 나눈다.** 조건 $\hat n^{\T}(w_i - w_j) \ge -\alpha h$ 에는 두 기체의 명령이 함께 들어 있습니다. 서로의 명령을 모르는 채로도 지킬 수 있게 반씩 나눕니다."
            en="**Step 3: split the responsibility in half.** The condition $\hat n^{\T}(w_i - w_j) \ge -\alpha h$ contains both commands. Split it so that each can comply without knowing the other's command:" />
          <M block tex={String.raw`\underbrace{\hat n^{\T} w_i \;\ge\; -\tfrac{\alpha}{2}\,h}_{\tx{드론 i 의 몫}{share of drone i}} \quad\text{and}\quad \underbrace{-\hat n^{\T} w_j \;\ge\; -\tfrac{\alpha}{2}\,h}_{\tx{드론 j 의 몫}{share of drone j}} \quad\Longrightarrow\quad \hat n^{\T}(w_i - w_j) \ge -\alpha h`} />
          <P ko="드론 $j$ 가 자기 입장에서 계산한 법선은 $-\hat n$ 이므로($j$ 에게 '상대에서 나를 향하는 방향'은 반대입니다), 두 기체는 **똑같은 코드**를 돌리면 됩니다. 필요한 정보는 자기 명령과 상대 위치뿐입니다."
            en="The normal that drone $j$ computes from its own point of view is $-\hat n$ (for $j$, 'from the other to me' points the opposite way), so both vehicles run **exactly the same code**. All each needs is its own command and the relative position." />
          <P ko="**4단계: 명령을 최소한으로 고친다.** 대형 제어기가 내린 원래 명령을 $w_{\text{nom}} = S\,u_{\text{nom}}$, 내 몫의 한계를 $b = -(\alpha/2)\,h$ 라 합시다. $\hat n^{\T} w_{\text{nom}} \ge b$ 이면 고칠 것이 없습니다. 아니면 조건을 만족하는 명령 가운데 원래 명령과 **가장 가까운** 것을 고릅니다. 조건 $\hat n^{\T} w \ge b$ 를 만족하는 $w$ 의 집합은 평면 하나로 잘린 **반공간**(half-space)입니다. 어떤 $w$ 든 원래 명령과의 차이를 법선 성분과 접선 성분으로 나누면, 법선 성분의 차이는 적어도 $b - \hat n^{\T} w_{\text{nom}}$ 이어야 합니다. 그러니 접선 성분은 건드리지 않고 법선 성분만 딱 모자란 만큼 올리는 것이 가장 가깝습니다."
            en="**Step 4: correct the command as little as possible.** Let $w_{\text{nom}} = S\,u_{\text{nom}}$ be the nominal command from the formation controller and $b = -(\alpha/2)\,h$ the limit of my share. If $\hat n^{\T} w_{\text{nom}} \ge b$ there is nothing to fix. Otherwise choose, among commands satisfying the condition, the one **closest** to the nominal. The set of $w$ with $\hat n^{\T} w \ge b$ is a **half-space** cut off by one plane. Split the difference between any such $w$ and the nominal into a normal and a tangential part: the normal part must be at least $b - \hat n^{\T} w_{\text{nom}}$. So the closest choice leaves the tangential part alone and raises the normal part by exactly the shortfall." />
          <M block tex={String.raw`w_i = \begin{cases} w_{\text{nom}} & \hat n^{\T} w_{\text{nom}} \ge b \\[4pt] w_{\text{nom}} + \big(b - \hat n^{\T} w_{\text{nom}}\big)\,\hat n & \tx{그 밖}{otherwise} \end{cases} \qquad\quad u_i = S^{-1} w_i = (w_x,\ w_y,\ k_z\,w_z)`} />
          <P ko="엔진의 `cbfFilter` 가 $E = 0$ 일 때 하는 일이 이것입니다. 두 가지를 덧붙입니다. 첫째, '가장 가깝다'는 z 를 줄인 좌표에서 잰 것입니다. 둘째, 엔진은 이어서 속도 제한을 처리합니다. 고친 명령이 $v_{\max}$ 를 넘으면 법선 성분은 지키고 접선 성분을 줄이며, 순수하게 물러나는 것만으로도 $v_{\max}$ 를 넘으면 '보장 불가'로 표시합니다. 손코딩 과제에서는 속도 제한을 뺐습니다."
            en="This is what the engine's `cbfFilter` does when $E = 0$. Two remarks. First, 'closest' is measured in the coordinates with z shrunk. Second, the engine then handles the speed limit: if the corrected command exceeds $v_{\max}$ it keeps the normal component and reduces the tangential one, and if even pure retreat exceeds $v_{\max}$ it flags the step as 'not guaranteed'. The coding task leaves the speed limit out." />
          <P ko="**5단계: 컴퓨터는 띄엄띄엄 계산한다.** 실제 필터는 $\Delta t$ 마다 한 번 돕니다. 그래도 보장이 남는지 확인합시다. 한 스텝 뒤의 상대 위치는 $r^{+} = r + \Delta t\,(w_i - w_j)$ 입니다. 어떤 벡터든 그 길이는 단위벡터 방향 성분보다 길거나 같으므로($\lVert v\rVert \ge \hat n^{\T} v$)"
            en="**Step 5: computers work in steps.** A real filter runs once every $\Delta t$. Does the guarantee survive? One step later the relative position is $r^{+} = r + \Delta t\,(w_i - w_j)$. The length of any vector is at least its component along a unit vector ($\lVert v\rVert \ge \hat n^{\T} v$), so" />
          <M block tex={String.raw`d^{+} = \norm{r^{+}} \;\ge\; \hat n^{\T} r^{+} = d + \Delta t\;\hat n^{\T}(w_i - w_j) \;\ge\; d - \alpha\,\Delta t\,(d - d_{\min}) \quad\Longrightarrow\quad h^{+} \ge (1 - \alpha\,\Delta t)\,h`} />
          <P ko="따라서 $\alpha\,\Delta t \le 1$ 이고 지금 $h \ge 0$ 이면 다음 스텝에도 $h^{+} \ge 0$ 입니다. 근사 없이 성립합니다. 단, 두 기체가 **정확한** 상대 위치를 알고 명령한 속도를 그대로 낸다는 가정 아래에서입니다."
            en="Hence if $\alpha\,\Delta t \le 1$ and $h \ge 0$ now, then $h^{+} \ge 0$ at the next step. This holds without approximation — but under the assumption that both vehicles know the **exact** relative position and produce the commanded velocity exactly." />
        </Derivation>
        <Predict id="ch8-basic-noise"
          question={{ ko: '기본 필터는 완벽한 정보에서 최소 거리를 정확히 지킵니다. 이제 각 기체가 자기 위치를 몇 cm 틀리게 알고, 이웃의 위치는 수십 ms 늦게 받는다고 합시다. 필터는 그 사실을 모릅니다. 두 기체가 정면으로 교차할 때 어떻게 될까요?', en: 'With perfect information the basic filter keeps the minimum distance exactly. Now let each vehicle misjudge its own position by a few centimetres and receive its neighbour’s position tens of milliseconds late — and the filter does not know that. What happens when two vehicles cross head-on?' }}
          choices={[
            { label: { ko: '여전히 지킨다 — 오차는 평균하면 0 이라 상쇄된다', en: 'Still kept — the errors average to zero and cancel' } },
            { label: { ko: '거의 매번, 조금씩 침범한다', en: 'Violated almost every time, by a little' }, correct: true },
            { label: { ko: '필터가 불안정해져 크게 충돌한다', en: 'The filter goes unstable and they collide badly' } },
          ]}
          explain={{
            ko: '**거의 매번, 조금씩 침범합니다.** 필터는 한계선에 딱 붙어서 지나가도록 명령을 고칩니다. 그러니 필터가 믿는 거리가 실제보다 조금이라도 길면 그만큼 한계 안쪽으로 들어갑니다. 교차하는 몇 초 동안 수백 번 계산하므로 그중 불리한 순간이 꼭 있습니다. 반대로 크게 충돌하지는 않습니다. 틀린 정보로도 필터는 계속 밀어내기 때문에 침범 깊이는 오차 크기 정도에 머뭅니다. 아래 데모와 몬테카를로에서 확인하세요. 이것을 고치려면 필터가 **자기가 얼마나 모르는지**를 알아야 합니다.',
            en: '**Violated almost every time, by a little.** The filter corrects commands so that the vehicles pass right on the limit. If the distance it believes is even slightly longer than the truth, they go that much inside. Over the few seconds of an encounter it computes hundreds of times, so an unlucky instant is certain. Yet there is no big collision: even on wrong information the filter keeps pushing away, so the depth of the violation stays around the size of the error. Check it in the demo and the Monte Carlo below. To fix it, the filter must know **how much it does not know**.',
          }} />
        <Derivation id="cbf-robust" title={{ ko: '강건 CBF: 틀린 정보로도 지키는 조건', en: 'Robust CBF: a condition that holds on wrong information' }}>
          <P ko="**무엇을 모르는가.** 드론 $i$ 는 참 상대 위치 $r$ 대신 추정값 $\hat r$ 을 갖습니다. 자기 위치 오차가 $\varepsilon$ 이하, 이웃이 방송한 위치의 오차도 $\varepsilon$ 이하이고, 그 방송이 $t_{\text{age}}$ 만큼 낡았다면 그동안 이웃은 최대 $v_{\max}\,t_{\text{age}}$ 움직였을 수 있습니다. 세 가지를 더하면"
            en="**What is unknown.** Instead of the true relative position $r$, drone $i$ has an estimate $\hat r$. Its own position error is at most $\varepsilon$, the error of the position its neighbour broadcast is also at most $\varepsilon$, and if that broadcast is $t_{\text{age}}$ old the neighbour may have moved up to $v_{\max}\,t_{\text{age}}$ since. Adding the three," />
          <M block tex={String.raw`\norm{\hat r - r} \;\le\; E, \qquad E = 2\,\varepsilon + v_{\max}\,t_{\text{age}}`} />
          <P ko="($S$ 는 z 성분을 줄이기만 하므로, 원래 좌표에서의 오차 한계 $E$ 는 줄인 좌표에서도 그대로 한계입니다.) 추정값으로 계산한 거리와 방향을 $\hat d = \lVert\hat r\rVert$, $\hat n = \hat r/\hat d$ 라 하고, 참값은 $d$, $n$ 으로 씁니다. 기본 필터는 $\hat d$ 와 $\hat n$ 을 참값인 줄 알고 썼습니다. 틀릴 수 있는 것이 **두 가지**입니다."
            en="($S$ only shrinks the z component, so the bound $E$ in real coordinates is still a bound in the shrunk coordinates.) Let $\hat d = \lVert\hat r\rVert$ and $\hat n = \hat r/\hat d$ be the distance and direction computed from the estimate, and $d$, $n$ the true ones. The basic filter used $\hat d$ and $\hat n$ as if they were true. **Two things** can be wrong." />
          <P ko="**① 거리.** 삼각부등식에서 $d \ge \hat d - E$ 입니다. 실제 거리는 보이는 것보다 $E$ 만큼 짧을 수 있습니다. 그러니 여유를 $\hat d - E - d_{\min}$ 으로 **줄여서** 봅니다. 이 값은 참 여유 $d - d_{\min}$ 보다 작거나 같습니다."
            en="**① Distance.** By the triangle inequality $d \ge \hat d - E$: the true distance may be $E$ shorter than it looks. So we use the **reduced** margin $\hat d - E - d_{\min}$, which is no larger than the true margin $d - d_{\min}$." />
          <P ko="**② 방향.** 법선이 틀리면, 내가 '옆으로 움직인다'고 생각한 속도가 실제로는 상대에게 다가가는 속도일 수 있습니다. 방향이 얼마나 틀릴 수 있는지 봅시다. 임의의 두 벡터 $a$, $c$ 에 대해"
            en="**② Direction.** If the normal is wrong, a velocity I believe to be 'sideways' may in truth be approaching. How wrong can the direction be? For any two vectors $a$, $c$," />
          <M block tex={String.raw`\frac{a}{\norm{a}} - \frac{c}{\norm{c}} = \frac{a - c}{\norm{a}} + c\Big(\frac{1}{\norm{a}} - \frac{1}{\norm{c}}\Big), \qquad \norm{c\Big(\frac{1}{\norm{a}} - \frac{1}{\norm{c}}\Big)} = \frac{\big|\norm{c} - \norm{a}\big|}{\norm{a}} \le \frac{\norm{a - c}}{\norm{a}}`} />
          <P ko="이므로 두 단위벡터의 차이는 $2\lVert a - c\rVert / \lVert a\rVert$ 이하입니다. $a = \hat r$, $c = r$ 을 넣으면"
            en="so the difference of the two unit vectors is at most $2\lVert a - c\rVert / \lVert a\rVert$. With $a = \hat r$, $c = r$," />
          <M block tex={String.raw`\norm{\hat n - n} \;\le\; \frac{2E}{\hat d} \;=\; \beta`} />
          <P ko="그러면 참 법선 방향의 속도는 $n^{\T} w = \hat n^{\T} w + (n - \hat n)^{\T} w \ge \hat n^{\T} w - \beta\,\lVert w\rVert$ 입니다(코시-슈바르츠 부등식). 즉 내가 내는 속도가 클수록, 그 가운데 $\beta$ 비율만큼은 몰래 다가가는 속도일 수 있다고 **벌점**을 매겨야 합니다."
            en="Then the velocity along the true normal satisfies $n^{\T} w = \hat n^{\T} w + (n - \hat n)^{\T} w \ge \hat n^{\T} w - \beta\,\lVert w\rVert$ (Cauchy–Schwarz). The faster I move, the more — a fraction $\beta$ of it — might secretly be approach speed, and that must be **penalised**." />
          <P ko="**강건 조건.** ①과 ②를 합쳐 각 기체가 다음을 지키게 합니다."
            en="**The robust condition.** Combining ① and ②, each vehicle enforces" />
          <M block tex={String.raw`\hat n^{\T} w_i \;-\; \beta\,\norm{w_i} \;\ge\; -\tfrac{\alpha}{2}\,\big(\hat d - E - d_{\min}\big), \qquad \beta = \frac{2E}{\hat d}`} />
          <P ko="**이 조건이 참 상태를 지켜 주는지 확인.** 왼쪽은 ②에 의해 $n^{\T} w_i$ 보다 작거나 같고, 오른쪽은 ①에 의해 $-(\alpha/2)(d - d_{\min})$ 보다 크거나 같습니다. 이어 쓰면"
            en="**Check that it protects the true state.** By ② the left side is at most $n^{\T} w_i$; by ① the right side is at least $-(\alpha/2)(d - d_{\min})$. Chaining them," />
          <M block tex={String.raw`n^{\T} w_i \;\ge\; \hat n^{\T} w_i - \beta\,\norm{w_i} \;\ge\; -\tfrac{\alpha}{2}\big(\hat d - E - d_{\min}\big) \;\ge\; -\tfrac{\alpha}{2}\,\big(d - d_{\min}\big)`} />
          <P ko="드론 $j$ 도 자기 추정값으로 같은 조건을 지키면 $-n^{\T} w_j \ge -(\alpha/2)(d - d_{\min})$ 입니다(두 기체의 추정값은 서로 달라도 됩니다. 각자 참값에서 $E$ 안에만 있으면 됩니다). 둘을 더하면 **참 상태에 대해** $n^{\T}(w_i - w_j) \ge -\alpha\,(d - d_{\min})$ 이 되고, 기본 필터 유도의 5단계를 그대로 적용하면"
            en="If drone $j$ enforces the same condition with its own estimate, then $-n^{\T} w_j \ge -(\alpha/2)(d - d_{\min})$ (the two estimates may differ from each other; each only has to be within $E$ of the truth). Adding the two gives, **for the true state**, $n^{\T}(w_i - w_j) \ge -\alpha\,(d - d_{\min})$, and step 5 of the basic derivation applies unchanged:" />
          <M block tex={String.raw`d^{+} \;\ge\; d - \alpha\,\Delta t\,(d - d_{\min}) \;\ge\; d_{\min} \qquad \tx{단, }{whenever } \alpha\,\Delta t \le 1,\; d \ge d_{\min}`} />
          <P ko="**항상 지킬 수 있는 조건인가(실행 가능성).** 아무리 조건이 옳아도 그것을 만족하는 명령이 없으면 소용없습니다. 가장 쉬운 선택은 추정 법선 방향으로 곧장 물러나는 것, $w_i = s\,\hat n$ ($s > 0$) 입니다. 이때 왼쪽은 $(1 - \beta)\,s$ 이므로 $\beta < 1$ 이어야 물러나는 것이 도움이 됩니다. $\beta \ge 1$ 이면 방향이 너무 불확실해서 **어느 쪽이 멀어지는 쪽인지조차** 알 수 없다는 뜻입니다. 참 거리가 $d_{\min}$ 이상이면 $\hat d \ge d_{\min} - E$ 이므로"
            en="**Can the condition always be met (feasibility)?** A correct condition is useless if no command satisfies it. The easiest choice is to retreat straight along the estimated normal, $w_i = s\,\hat n$ ($s > 0$). The left side is then $(1 - \beta)\,s$, so retreat helps only if $\beta < 1$. $\beta \ge 1$ means the direction is so uncertain that you **cannot even tell which way is away**. With a true distance of at least $d_{\min}$ we have $\hat d \ge d_{\min} - E$, so" />
          <M block tex={String.raw`\beta \;\le\; \beta_{\max} = \frac{2E}{d_{\min} - E} \;<\; 1 \quad\Longleftrightarrow\quad d_{\min} > 3E`} />
          <P ko="가장 불리한 순간($d = d_{\min}$ 인데 $\hat d = d_{\min} - E$ 로 보일 때) 오른쪽은 $\alpha E$ 이고, 필요한 물러나는 속도는 $s = \alpha E/(1 - \beta_{\max})$ 입니다. 이것을 원래 좌표로 되돌리면 수직 방향에서는 $k_z$ 배가 되므로($u = S^{-1} w$), 속도 한계 안에 들어오려면"
            en="At the worst instant ($d = d_{\min}$ while it looks like $\hat d = d_{\min} - E$) the right side is $\alpha E$ and the retreat speed needed is $s = \alpha E/(1 - \beta_{\max})$. Back in real coordinates this is multiplied by $k_z$ in the vertical direction ($u = S^{-1} w$), so to stay within the speed limit" />
          <M block tex={String.raw`k_z\,\frac{\alpha\,E}{1 - \beta_{\max}} \le v_{\max} \quad\Longleftrightarrow\quad \alpha \;\le\; \alpha_{\max} = \frac{v_{\max}\,(1 - \beta_{\max})}{k_z\,E}`} />
          <P ko="엔진의 `cbfRobustDesign` 이 $E$, $\beta_{\max}$, $\alpha_{\max}$ 와 $d_{\min} > 3E$ 여부를 계산하고, `cbfFilter` 는 $E > 0$ 일 때 위 강건 조건을 씁니다. 조건을 어기는 명령은 접선 성분을 그대로 둔 채 법선 성분을 조건이 성립할 때까지 올리고, 속도 한계를 넘으면 접선 성분을 줄입니다."
            en="The engine's `cbfRobustDesign` computes $E$, $\beta_{\max}$, $\alpha_{\max}$ and whether $d_{\min} > 3E$; `cbfFilter` uses the robust condition above when $E > 0$. A command that violates it keeps its tangential part while the normal part is raised until the condition holds; if that exceeds the speed limit the tangential part is reduced." />
          <P ko="**이 보장의 한계.** 위 논리가 성립하는 범위는 좁습니다. 숨기지 않고 적습니다."
            en="**Limits of this guarantee.** The argument holds in a narrow setting. Stated plainly:" />
          <List items={[
            { ko: '**운동 모델**: 명령한 속도를 즉시, 정확히 내는 질점. 실제 Crazyflie 는 속도를 바꾸는 데 시간이 걸리고 바람에도 밀립니다. 그만큼은 $d_{\\min}$ 이나 여유에 따로 넣어야 합니다.', en: '**Motion model**: a point mass that produces the commanded velocity instantly and exactly. A real Crazyflie takes time to change velocity and is pushed by wind. That must go into $d_{\\min}$ or the margin separately.' },
            { ko: '**오차에 한계가 있다는 가정**: $\\varepsilon$ 을 절대 넘지 않는 오차(잘린 노이즈). 정규분포 오차에는 한계가 없으므로, $k_\\sigma\\sigma$ 를 $\\varepsilon$ 으로 쓰면 드물게 가정이 깨집니다.', en: '**Bounded errors**: errors that never exceed $\\varepsilon$ (truncated noise). Normally distributed errors have no bound, so using $k_\\sigma\\sigma$ as $\\varepsilon$ is occasionally violated.' },
            { ko: '**두 대**: 세 대 이상이면 여러 이웃의 조건을 동시에 만족하는 명령이 없을 수 있습니다. 엔진의 5대 시뮬레이션은 이웃마다 차례로 투영하는 근사를 쓰며, 위 증명이 적용되지 않습니다.', en: '**Two vehicles**: with three or more, no command may satisfy all neighbours’ conditions at once. The engine’s five-drone simulation projects neighbour by neighbour as an approximation; the proof above does not cover it.' },
            { ko: '**확인한 범위**: 이 가정 안에서 무작위 정면 교차를 2000번 반복했을 때 침범은 0건이었습니다{{der:ch8#cbf-robust|교재의 검증 스크립트(npm run verify) 9번 항목: 엔진과 독립된 Python 구현으로 교차 확인|Item 9 of the textbook verification script (npm run verify), cross-checked against an independent Python implementation}}. 가정 밖에서는 아무것도 말해 주지 않습니다.', en: '**What was checked**: within these assumptions, 2000 random head-on encounters gave zero violations{{der:ch8#cbf-robust|교재의 검증 스크립트(npm run verify) 9번 항목: 엔진과 독립된 Python 구현으로 교차 확인|Item 9 of the textbook verification script (npm run verify), cross-checked against an independent Python implementation}}. Outside them it says nothing.' },
          ]} />
        </Derivation>
        <CbfDemo />
        <Note>
          <P ko={`**우리 설정을 넣어 보면.** 강건 필터의 입력 $E$ 를 지금 전역 설정으로 어림해 봅시다. 위치 오차 한계로 $k_\\sigma\\sigma$ 를 3차원으로 합친 ${fmt(epsCfg * 100, 3)} cm{{der:ch8#cbf-robust|k_σ·√(2σ_H² + σ_V²): 수평 두 축과 수직 한 축의 추정 오차를 합친 값. 한계가 아니라 어림입니다.|k_σ·√(2σ_H² + σ_V²): estimation error of two horizontal axes and one vertical axis combined. An estimate, not a bound.}} 를, 정보 나이로 예산이 대비하는 최댓값 ${fmt(b.ageMax * 1000, 3)} ms{{der:ch8#budget-sum|통신 지연 + 지터 + 방송 주기 + 1000번에 1번 나오는 연속 손실|comm delay + jitter + broadcast period + the 1-in-1000 loss burst}} 를, 속도로 {{cfg:vehicle.vMax}} 를 쓰면 $E$ ≈ ${fmt(ECfg, 3)} m{{der:ch8#cbf-robust|2ε + v_max·t_age|2ε + v_max·t_age}}, 따라서 강건 필터가 보장을 주려면 $d_{\\min}$ > ${fmt(3 * ECfg, 3)} m{{der:ch8#cbf-robust|3E|3E}} 이어야 합니다. ${3 * ECfg > cfg.formation.spacing ? '지금 대형 간격 {{cfg:formation.spacing}} 보다 큽니다. 즉 **지금 설정의 통신으로는 강건 필터가 대형 간격에서 보장을 줄 수 없습니다.**' : '지금 대형 간격 {{cfg:formation.spacing}} 안에 들어옵니다.'} $E$ 에서 가장 큰 몫은 $v_{\\max}\\,t_{\\text{age}}$ 이고, 그 대부분은 드물게 오는 긴 통신 공백입니다. 안전 필터를 쓸모 있게 만드는 길은 필터를 더 정교하게 만드는 것이 아니라 **정보 나이를 줄이는 것**(필터를 기체 안에서 돌리기, 방송 주기 올리기, 공백이 길어지면 속도를 낮추기)입니다.`}
            en={`**Plugging in our settings.** Estimate the robust filter's input $E$ from the current global settings. Take as position error bound the 3-D combination of $k_\\sigma\\sigma$, ${fmt(epsCfg * 100, 3)} cm{{der:ch8#cbf-robust|k_σ·√(2σ_H² + σ_V²): 수평 두 축과 수직 한 축의 추정 오차를 합친 값. 한계가 아니라 어림입니다.|k_σ·√(2σ_H² + σ_V²): estimation error of two horizontal axes and one vertical axis combined. An estimate, not a bound.}}; as information age the maximum the budget plans for, ${fmt(b.ageMax * 1000, 3)} ms{{der:ch8#budget-sum|통신 지연 + 지터 + 방송 주기 + 1000번에 1번 나오는 연속 손실|comm delay + jitter + broadcast period + the 1-in-1000 loss burst}}; and as speed {{cfg:vehicle.vMax}}. Then $E$ ≈ ${fmt(ECfg, 3)} m{{der:ch8#cbf-robust|2ε + v_max·t_age|2ε + v_max·t_age}}, so for a guarantee the robust filter needs $d_{\\min}$ > ${fmt(3 * ECfg, 3)} m{{der:ch8#cbf-robust|3E|3E}}. ${3 * ECfg > cfg.formation.spacing ? 'That exceeds the current formation spacing of {{cfg:formation.spacing}}: **with the communication of the current settings the robust filter cannot give a guarantee at formation spacing.**' : 'That fits within the current formation spacing of {{cfg:formation.spacing}}.'} The largest share of $E$ is $v_{\\max}\\,t_{\\text{age}}$, and most of that is the rare long communication gap. The way to make a safety filter useful is not a cleverer filter but **younger information** (run the filter onboard, raise the broadcast rate, slow down when a gap grows long).`} />
        </Note>
        <CodeTask task={cbfTask} />
      </Section>

      <Section id="extrapolation" title={{ ko: '이웃 위치 외삽: 낡은 정보를 이어 그리기', en: 'Neighbour extrapolation: continuing stale information' }}>
        <P ko="예산의 지연 항과 강건 필터의 $E$ 는 모두 **정보 나이**(age of information)에서 나왔습니다. 정보 나이란 이웃이 그 위치를 잰 순간부터 내가 그 정보를 쓰는 지금까지 흐른 시간입니다. 이웃이 위치와 함께 **속도**도 방송한다면, 받은 쪽은 '그동안 이 속도로 계속 갔겠지' 하고 지금 위치를 이어 그릴 수 있습니다. 이것이 **외삽**(extrapolation)입니다. 엔진의 `extrapolate(p, v, age)` 가 이 한 줄입니다."
          en="Both the delay terms of the budget and the $E$ of the robust filter come from the **age of information**: the time from the instant the neighbour measured its position to the moment I use it. If the neighbour broadcasts its **velocity** along with its position, the receiver can continue the position to now, assuming 'it kept going at this velocity'. That is **extrapolation**; the engine function `extrapolate(p, v, age)` is this one line." />
        <Derivation id="extrapolate" title={{ ko: '유지와 외삽의 오차 한계, 그리고 교차점', en: 'Error bounds of hold and extrapolate, and the crossover' }}>
          <P ko="이웃이 시각 $t_s$ 에 위치 $p(t_s)$ 와 속도 $v(t_s)$ 를 보냈고, 지금은 그로부터 $t$ (정보 나이) 뒤입니다. 이웃의 참 위치는 속도를 적분한 $p(t_s + t) = p(t_s) + \int_0^{t} v(t_s + s)\,ds$ 입니다."
            en="The neighbour sent its position $p(t_s)$ and velocity $v(t_s)$ at time $t_s$; now is $t$ (the information age) later. Its true position is the integral of velocity, $p(t_s + t) = p(t_s) + \int_0^{t} v(t_s + s)\,ds$." />
          <P ko="**유지**(hold): 받은 위치를 그대로 씁니다, $\hat p = p(t_s)$. 오차는 그동안 움직인 거리이고, 속력이 $v_{\text{rel}}$ 이하이면"
            en="**Hold**: use the received position as is, $\hat p = p(t_s)$. The error is the distance moved meanwhile; with speed at most $v_{\text{rel}}$," />
          <M block tex={String.raw`\norm{p - \hat p} = \norm{\int_0^{t} v\,ds} \;\le\; v_{\text{rel}}\,t`} />
          <P ko="**외삽**: $\hat p = p(t_s) + v(t_s)\,t$. 이제 오차는 '속도가 그동안 **변한** 만큼'만 남습니다. 속도의 변화는 가속도의 적분이고 가속도 크기가 $a_{\max}$ 이하이면 $\lVert v(t_s + s) - v(t_s)\rVert \le a_{\max}\,s$ 이므로"
            en="**Extrapolate**: $\hat p = p(t_s) + v(t_s)\,t$. Now only 'how much the velocity has **changed**' remains. A change of velocity is the integral of acceleration, and with acceleration at most $a_{\max}$ we have $\lVert v(t_s + s) - v(t_s)\rVert \le a_{\max}\,s$, so" />
          <M block tex={String.raw`\norm{p - \hat p} = \norm{\int_0^{t} \big(v(t_s + s) - v(t_s)\big)\,ds} \;\le\; \int_0^{t} a_{\max}\,s\,ds = \tfrac{1}{2}\,a_{\max}\,t^2`} />
          <P ko="유지의 한계는 나이에 **비례**하고 외삽의 한계는 나이의 **제곱**에 비례합니다. 나이가 짧으면 제곱 쪽이 훨씬 작고, 길어지면 제곱 쪽이 더 커집니다. 두 한계가 같아지는 나이는"
            en="The bound for hold grows **linearly** with age, that for extrapolation with its **square**. At short ages the square is far smaller; at long ages it overtakes. The two bounds are equal at" />
          <M block tex={String.raw`\tfrac{1}{2}\,a_{\max}\,t^2 = v_{\text{rel}}\,t \quad\Longrightarrow\quad t^{\times} = \frac{2\,v_{\text{rel}}}{a_{\max}}`} />
          <P ko="**예산에서는.** 외삽을 켜면 엔진은 통신 항 두 개를 $\Delta_{\text{comm}} = \tfrac12 a_{\max}(\tau_c + T_c)^2$, $\Delta_{\text{gap}} = \tfrac12 a_{\max}\big(t_{\text{age}}^2 - (\tau_c + T_c)^2\big)$ 로 바꿉니다. 둘을 합치면 $\tfrac12 a_{\max}\,t_{\text{age}}^2$ 이고, $t_{\text{age}} = \tau_c + T_c + L_{99.9}T_c$ 는 예산이 대비하는 최대 정보 나이입니다. 측위 지연 항 $v_{\text{rel}}\tau_{\text{est}}$ 는 그대로 둡니다."
            en="**In the budget.** With extrapolation on, the engine replaces the two comm terms by $\Delta_{\text{comm}} = \tfrac12 a_{\max}(\tau_c + T_c)^2$ and $\Delta_{\text{gap}} = \tfrac12 a_{\max}\big(t_{\text{age}}^2 - (\tau_c + T_c)^2\big)$. Together they make $\tfrac12 a_{\max}\,t_{\text{age}}^2$, where $t_{\text{age}} = \tau_c + T_c + L_{99.9}T_c$ is the maximum information age the budget plans for. The estimation-latency term $v_{\text{rel}}\tau_{\text{est}}$ is left as it is." />
          <P ko="**가정과 한계.** ① 받은 속도가 정확하다고 봤습니다. 실제로는 속도 추정에도 오차 $\delta v$ 가 있어 $\delta v\cdot t$ 가 더해지는데, 엔진의 예산에는 이 항이 없습니다. ② $a_{\max}$ 는 기체가 낼 수 있는 최대 가속도라서 매우 보수적입니다. 대형이 부드럽게 움직이는 동안의 실제 가속도는 훨씬 작습니다. ③ 유지 쪽의 $v_{\text{rel}}$ 은 '이 정도로 움직인다'는 가정값이고 외삽 쪽의 $a_{\max}$ 는 물리적 한계라서, 두 식은 같은 엄격함으로 비교되는 것이 아닙니다. ④ 나이가 짧을 때는 외삽하고 교차점을 넘으면 유지로 돌아가면 두 한계 중 작은 쪽을 얻을 수 있지만, 이 교재의 예산은 단순하게 둘 중 하나만 고릅니다."
            en="**Assumptions and limits.** ① The received velocity is taken as exact. In reality the velocity estimate has an error $\delta v$ that adds $\delta v\cdot t$; the engine's budget has no such term. ② $a_{\max}$ is the largest acceleration the vehicle can produce, which is very conservative; while a formation moves smoothly the actual acceleration is far smaller. ③ $v_{\text{rel}}$ on the hold side is an assumed 'moves about this fast', whereas $a_{\max}$ on the extrapolation side is a physical limit, so the two formulas are not compared with equal strictness. ④ Extrapolating at short ages and falling back to hold past the crossover would give the smaller of the two bounds, but the budget of this textbook simply picks one of the two." />
        </Derivation>
        <ExtrapolateDemo />
      </Section>

      <Section id="pitfall" title={{ ko: '함정 실험실', en: 'Pitfall lab' }}>
        <StackPitfall />
        <SigmaPitfall />
      </Section>

      <Section id="grey" title={{ ko: '이 예산에서 아직 회색인 값', en: 'What is still grey in this budget' }}>
        <P ko="워터폴의 숫자는 그럴듯해 보이지만, 그 입력의 상당수가 **회색 배지**(예시값)입니다. 예산은 입력만큼만 믿을 수 있습니다. 이 장에서 새로 들어온 회색 값과, 그것을 실제 값으로 바꾸는 방법을 정리합니다."
          en="The numbers in the waterfall look convincing, but many of their inputs carry a **grey badge** (example value). A budget is only as trustworthy as its inputs. Here are the grey values introduced in this chapter and how to replace them with real ones." />
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>{tr({ ko: '입력', en: 'Input' })}</th><th class="r">{tr({ ko: '지금 값', en: 'Current value' })}</th><th>{tr({ ko: '어떻게 재나', en: 'How to measure it' })}</th></tr></thead>
            <tbody>
              <tr><td><T ko="추종 오차 $\sigma_{\text{trk}}$" en="Tracking error $\sigma_{\text{trk}}$" /></td><td class="r"><CfgVal path="safety.trackingError" /></td><td><T ko="한 대를 호버링시키고 목표 위치와 추정 위치의 차이를 기록 (9장)" en="Hover one vehicle and log the difference between setpoint and estimated position (ch. 9)" /></td></tr>
              <tr><td><T ko="다운워시 비율 $k_z$" en="Downwash ratio $k_z$" /></td><td class="r"><CfgVal path="safety.downwashRatio" /></td><td><T ko="두 대를 위아래로 띄우고 수직 간격을 줄여 가며 아래 기체의 위치 오차를 기록 (9장)" en="Hover two vehicles stacked and log the lower one's position error while reducing the vertical separation (ch. 9)" /></td></tr>
              <tr><td><T ko="충돌 지름 $d_{\text{body}}$" en="Collision diameter $d_{\text{body}}$" /></td><td class="r"><CfgVal path="vehicle.envelope" /></td><td><T ko="가드를 단 기체의 가장 넓은 폭을 자로 재고, 닿으면 안 되는 여유를 더한다" en="Measure the widest span of the vehicle with guards using a ruler and add the clearance you never want to lose" /></td></tr>
              <tr><td><T ko="상대속도 가정 $v_{\text{rel}}$" en="Assumed relative speed $v_{\text{rel}}$" /></td><td class="r"><CfgVal path="safety.relSpeed" /></td><td><T ko="계획한 궤적에서 두 기체가 서로 가까워지는 속도의 최댓값을 계산하고, 로그에서 확인" en="Compute the largest closing speed between two vehicles from the planned trajectories and confirm it in logs" /></td></tr>
              <tr><td><T ko="추가 여유 $d_{\text{margin}}$" en="Extra margin $d_{\text{margin}}$" /></td><td class="r"><CfgVal path="safety.margin" /></td><td><T ko="잴 수 없습니다. 모델과 실제 비행 로그의 최소 이격거리를 비교하면서 정합니다" en="Cannot be measured; set it by comparing the model with the minimum separation seen in real flight logs" /></td></tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

const def: ChapterDef = {
  id: 8,
  title: { ko: '안전 거리 예산', en: 'The safety-distance budget' },
  lead: {
    ko: '측위 오차, 지연, 통신 공백, 다운워시를 한 줄로 더해 두 드론이 떨어져야 하는 최소 간격을 계산합니다. 그리고 그 간격을 비행 중에 실제로 지켜 주는 안전 필터를 처음부터 유도합니다.',
    en: 'Add positioning error, delay, communication gaps and downwash into one line: the minimum spacing two drones must keep. Then derive from scratch the safety filter that actually enforces it in flight.',
  },
  objectives: [
    { ko: '무작위 오차는 제곱합으로, 편향과 지연 항은 그대로 더해 수평·수직 최소 간격 $d_{\\min}$ 을 계산하고, 어느 부분이 약속인지 말한다.', en: 'Compute the horizontal and vertical minimum spacing $d_{\\min}$, adding random errors in quadrature and bias and delay terms directly, and say which parts are conventions.' },
    { ko: '다운워시 때문에 안전 영역이 위아래로 긴 타원체가 되는 이유를 설명하고 타원체 거리로 위반 여부를 판정한다.', en: 'Explain why downwash makes the safety region a vertically elongated ellipsoid and test for violations with the ellipsoidal distance.' },
    { ko: '두 드론 사이의 CBF 안전 필터를 유도·구현하고, 위치 오차와 정보 나이가 있을 때 보장이 성립하는 조건($d_{\\min} > 3E$, $\\alpha \\le \\alpha_{\\max}$)을 설명한다.', en: 'Derive and implement a CBF safety filter between two drones, and explain the conditions ($d_{\\min} > 3E$, $\\alpha \\le \\alpha_{\\max}$) under which its guarantee holds with position error and information age.' },
  ],
  Body,
  budget: {
    items: ['body', 'tracking', 'margin', 'min-sep'],
    note: {
      ko: '이 장은 마지막 세 입력(기체 충돌 지름과 다운워시, 추종 오차, 추가 여유)을 넣고 **합계**를 냅니다. 무작위 항은 $k_\\sigma\\sqrt2\\sqrt{\\sigma_{\\text{est}}^2 + \\sigma_{\\text{trk}}^2}$ 로 묶고, 편향·확정·크기 항은 그대로 더합니다. 수평과 수직을 따로 계산하며, 이제 화면 아래 막대에 권장 최소 간격이 나타납니다.',
      en: 'This chapter enters the last three inputs (collision diameter with downwash, tracking error, extra margin) and produces the **total**. Random terms are bundled as $k_\\sigma\\sqrt2\\sqrt{\\sigma_{\\text{est}}^2 + \\sigma_{\\text{trk}}^2}$; bias, deterministic and size terms are added directly. Horizontal and vertical are computed separately, and the bar at the bottom of the screen now shows the recommended minimum spacing.',
    },
  },
  summary: [
    { ko: '최소 간격은 기체 크기 + $k_\\sigma\\sqrt2$ × (독립인 무작위 오차의 제곱합 제곱근) + 편향 + 지연·공백 동안의 이동 + 여유다. 제곱해서 더해도 되는 것은 독립인 무작위 오차뿐이고, $k_\\sigma$ 와 최악값의 선택은 약속이다.', en: 'Minimum spacing = body size + $k_\\sigma\\sqrt2$ × (root-sum-square of independent random errors) + bias + motion during delays and gaps + margin. Only independent random errors may add in quadrature; $k_\\sigma$ and the choice of worst cases are conventions.' },
    { ko: '다운워시 때문에 위아래로는 더 멀리 떨어져야 한다. z 를 $k_z$ 로 나눈 타원체 거리로 판정하며, 우리 기체의 $k_z$ 는 직접 재야 하는 값이다.', en: 'Downwash demands more separation vertically. Test with the ellipsoidal distance (z divided by $k_z$); $k_z$ for our vehicle has to be measured.' },
    { ko: 'CBF 필터는 $\\hat n^{\\mathsf T} w \\ge -(\\alpha/2)h$ 를 어길 때만 명령의 법선 성분을 고친다. 정보가 틀릴 수 있으면 거리를 $E$ 만큼 줄여 보고 속도에 벌점을 줘야 하며, 그 보장은 $d_{\\min} > 3E$ 일 때만 성립한다. 결국 정보 나이가 관건이다.', en: 'A CBF filter corrects the normal component of a command only when $\\hat n^{\\mathsf T} w \\ge -(\\alpha/2)h$ would fail. With fallible information it must shorten the distance by $E$ and penalise speed, and the guarantee holds only if $d_{\\min} > 3E$ — so information age is what matters.' },
  ],
  next: {
    ko: '예산은 완성됐지만 그 입력의 절반은 회색 예시값입니다. 거리 노이즈, NLOS 확률, 통신 지연, 추종 오차, $k_z$ — 우리 강당, 우리 기체에서는 실제로 얼마일까요? 비행 로그 몇 개로 그 값들을 어떻게 뽑아낼 수 있을까요?',
    en: 'The budget is complete, yet half of its inputs are grey example values. Range noise, NLOS probability, comm delay, tracking error, $k_z$ — what are they really in our hall, on our vehicles? How can a few flight logs give us those numbers?',
  },
  tasks,
};
export default def;
