import { CHAPTERS } from '../app/chapters';
import { tr } from '../app/i18n';
import { settingsOpen } from '../app/store';
import { allSources } from '../sources';
import { SrcBadge } from '../ui/Badge';
import { ex, lit, der } from '../sources';
import { P, T } from '../ui/Tx';

export function Home() {
  return (
    <div data-testid="home">
      <section class="hero">
        <h1>{tr({ ko: '군집은 서로를 어떻게 아는가', en: 'How does a swarm know itself?' })}</h1>
        <P class="lead"
          ko="노이즈가 섞이고, 늦게 오고, 가끔 빠지는 UWB 위치 정보만으로 드론 5대가 안전하게 대형을 유지하려면 **무엇이 얼마나 좋아야 할까요?** 이 교재는 그 질문에 숫자로 답하는 법을 익힙니다."
          en="With only UWB position data that is noisy, late and sometimes missing, **what has to be how good** for five drones to hold a formation safely? This textbook teaches you to answer that with numbers." />
        <div class="btn-row">
          <a class="btn primary" href="#/ch/0" data-testid="start">{tr({ ko: '0장부터 시작하기 →', en: 'Start with chapter 0 →' })}</a>
          <button type="button" class="btn" onClick={() => (settingsOpen.value = true)}>⚙ {tr({ ko: '우리 시스템 설정 보기', en: 'See our system settings' })}</button>
        </div>
      </section>

      <div class="card">
        <div class="card-title">{tr({ ko: '이 교재가 가정하는 시스템', en: 'The system this textbook assumes' })}</div>
        <P ko="실내 강당에서 **Bitcraze Crazyflie 2.1 Brushless** 5대로 군집 비행을 합니다. **측위**(위치를 알아내는 일)는 **UWB**(초광대역 전파로 거리를 재는 무선 방식, 1장) 기반의 **Loco Positioning System** 이 맡고(기본은 TDoA 라는 방식, 2·3장), 기체 안의 소프트웨어는 Crazyflie 펌웨어, 지상 PC 에서 여러 대를 다루는 소프트웨어는 **Crazyswarm2**(ROS 2)입니다. 기체는 모터 대각 100 mm{{lit:cfbl-datasheet/frame-size}}, 가드를 달았을 때 이륙 중량 37 g{{lit:cfbl-datasheet/takeoff-weight-guards}}, 기본 배터리로 약 10분{{lit:cfbl-datasheet/flight-time}} 비행합니다."
          en="Five **Bitcraze Crazyflie 2.1 Brushless** drones fly as a swarm in an indoor hall. **Positioning** (finding out where each drone is) is done by the **Loco Positioning System**, based on **UWB** (ultra-wideband radio that measures distance, ch. 1; by default in a mode called TDoA, ch. 2–3). The software inside the vehicle is the Crazyflie firmware; the software on the ground PC that handles several vehicles is **Crazyswarm2** (ROS 2). The vehicle has a 100 mm{{lit:cfbl-datasheet/frame-size}} motor diagonal, weighs 37 g{{lit:cfbl-datasheet/takeoff-weight-guards}} at take-off with guards, and flies about 10 minutes{{lit:cfbl-datasheet/flight-time}} on the stock battery." />
        <P ko="강당 크기, 앵커 위치, 노이즈, 지연 같은 나머지 값은 오른쪽 위 **설정**에서 언제든 바꿀 수 있고, 바꾸는 즉시 모든 데모와 **오차 예산**(안전 간격을 이루는 오차 항목들의 합계표, 0장에서 소개)이 다시 계산됩니다."
          en="Everything else — hall size, anchor positions, noise, delay — can be changed any time under **Settings** (top right); every demo and the **error budget** (the table of error items that add up to the safe spacing, introduced in chapter 0) recompute immediately." />
      </div>

      <div class="card">
        <div class="card-title">{tr({ ko: '숫자를 읽는 법: 출처 배지', en: 'How to read the numbers: source badges' })}</div>
        <P ko="이 교재의 본문·표·숫자 타일의 수치에는 배지가 붙어 있고, 그래프에는 그림마다 하나씩 붙어 있습니다. 배지에 마우스를 올리거나 탭하면 출처가 뜹니다."
          en="Numbers in the text, tables and number tiles carry a badge, and each chart carries one for the whole figure. Hover or tap a badge to see where the number comes from." />
        <ul>
          <li><SrcBadge src={lit('cfbl-datasheet', 'frame-size')} /> <T ko="논문이나 공식 문서에서 직접 확인한 값. 문헌과 그 안의 위치가 뜹니다." en="Checked directly in a paper or official document. Shows the source and where in it." /></li>
          <li><SrcBadge src={der('ch1#ns-to-m')} /> <T ko="교재 안에서 수식으로 유도했거나, 설정값을 넣어 교재의 모델로 계산한 값. 유도 과정으로 가는 링크가 뜹니다." en="Derived in the textbook, or computed from the settings with the textbook's model. Links to the derivation." /></li>
          <li><SrcBadge src={ex('uwb.sigmaTdoa')} /> <T ko="출처가 없는 가정. **회색**이고, 여러분이 바꿀 수 있는 입력입니다. 9장에서 실제 측정값으로 바꾸게 됩니다." en="An assumption with no source. It is **grey** and is an input you can change. Chapter 9 replaces these with your measurements." /></li>
        </ul>
      </div>

      <h2 style={{ marginTop: '28px' }}>{tr({ ko: '차례', en: 'Contents' })}</h2>
      <div class="toc">
        {CHAPTERS.map((c) => (
          <a key={c.id} href={`#/ch/${c.id}`}>
            <div class="n">{tr({ ko: `${c.id}장`, en: `Chapter ${c.id}` })}</div>
            <div class="t">{tr(c.title)}</div>
            <div class="d">{tr(c.blurb)}</div>
          </a>
        ))}
        <a href="#/report">
          <div class="n">{tr({ ko: '마지막', en: 'Finally' })}</div>
          <div class="t">{tr({ ko: '우리 시스템 리포트', en: 'Our system report' })}</div>
          <div class="d">{tr({ ko: '지금 설정으로 계산한 오차 예산과 권장 간격을 한 장으로.', en: 'The error budget and recommended spacing for your settings on one page.' })}</div>
        </a>
      </div>

      <div class="card">
        <div class="card-title">{tr({ ko: '각 장의 구성', en: 'How each chapter is built' })}</div>
        <P ko="각 장은 같은 순서로 진행합니다: **학습 목표** → **예측 먼저**(실행 전에 결과를 예측) → **데모** → **유도** → **손코딩 과제**(브라우저 안의 Python 으로 자동 채점) → **함정 실험실**(실제로 자주 하는 실수 재현) → **오차 예산**에 더하는 항목 → **3줄 요약**. 화면 아래의 오차 예산은 장을 지날 때마다 채워집니다."
          en="Each chapter follows the same order: **objectives** → **predict first** → **demo** → **derivation** → **coding task** (auto-graded Python in your browser) → **pitfall lab** (a real, common mistake reproduced) → what it adds to the **error budget** → **three-line summary**. The error budget at the bottom of the screen fills in as you go." />
        <P ko="사전 지식은 자동제어 한 학기와 Python 기초(numpy 를 조금 써 본 정도), 그리고 1학년 수준의 확률·통계(평균, 표준편차)와 선형대수(행렬 곱, 역행렬)입니다. 꼭 필요한 통계는 [0장 끝의 1분 복습](#/ch/0?a=stats)에 모아 두었습니다. 상태추정, 통신, 군집제어는 처음이라고 가정합니다."
          en="You need one semester of control, basic Python (a little numpy), and first-year probability (mean, standard deviation) and linear algebra (matrix product, inverse). The statistics you really need are collected in the [one-minute review at the end of chapter 0](#/ch/0?a=stats). No background in state estimation, communication or swarm control is assumed." />
      </div>

      <div class="card note">
        <div class="card-title">{tr({ ko: '참고한 문헌', en: 'Sources consulted' })}</div>
        <p class="small muted">{tr({ ko: '괄호 안의 "확인한 사실 n/m"은 그 문헌에서 인용하려던 사실 m개 중 원문을 직접 열어 확인한 것이 n개라는 뜻입니다. 확인하지 못한 사실은 본문에서 문헌으로 쓰지 않았습니다.', en: 'In brackets, "n/m facts verified" means that of the m facts we wanted to cite from that source, n were confirmed by opening the original. Unverified facts are never used as literature in the text.' })}</p>
        <ul class="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {allSources().map((s) => <li key={s.id}>{s.citation} <a href={s.url} target="_blank" rel="noopener noreferrer">↗</a> <span class="muted">({tr({ ko: `확인한 사실 ${s.verified}/${s.total}`, en: `${s.verified}/${s.total} facts verified` })})</span></li>)}
        </ul>
        <p class="small muted" style={{ marginTop: '8px', marginBottom: 0 }}>{tr({ ko: '자세한 서지 정보와 사실별 위치는 프로젝트의 SOURCES.md 에 있습니다. 이 교재는 오프라인으로 동작하며 실행 중 네트워크 요청을 하지 않습니다(↗ 링크는 여러분이 눌렀을 때만 열립니다).', en: 'Full bibliographic details and the location of each fact are in SOURCES.md. This textbook works offline and makes no network requests while running (↗ links open only when you click them).' })}</p>
      </div>
    </div>
  );
}
