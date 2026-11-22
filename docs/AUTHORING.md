# 챕터 작성 지침 (AUTHORING)

이 문서는 「군집은 서로를 어떻게 아는가 — UWB 실내 군집 인터랙티브 교재」의 챕터 하나를 쓰는 사람(또는 에이전트)을 위한 약속이다. **먼저 `src/chapters/ch0/index.tsx` 와 `src/chapters/ch7/` 전체를 읽어라.** 그 두 장이 기준 예시다. 모양·말투·구성·코드 패턴을 그대로 따른다.

## 0. 독자와 목표

- 독자: KAIST 항공기 설계 동아리 부원. 학부 2~3학년. **자동제어 수업은 들었지만 상태추정·통신·군집제어는 처음.** Python 기초는 안다(numpy 는 써 봤다 정도).
- 실제 프로젝트: 실내 강당에서 Bitcraze **Crazyflie 2.1 Brushless** 5대, 측위는 **Loco Positioning System(UWB, 기본 TDoA)**, 스택은 Crazyflie 펌웨어 + **Crazyswarm2(ROS 2)**. PX4 는 쓰지 않는다.
- 교재의 질문: "노이즈가 섞이고, 늦게 오고, 가끔 빠지는 UWB 위치 정보만으로 5대가 안전하게 대형을 유지하려면 무엇이 얼마나 좋아야 하는가?"
- 독자가 끝냈을 때: (1) 우리 시스템의 **오차 예산**을 직접 계산, (2) 앵커 배치·측위 모드·대형 간격을 근거를 갖고 결정, (3) 실제 비행 로그에서 지연과 노이즈를 측정.

## 1. 가장 중요한 규칙: 숫자와 출처

**화면에 나오는 모든 수치에 출처 배지를 단다.** 어기면 실패다. 출처는 세 종류뿐이다.

| 종류 | 언제 | 쓰는 법 |
|---|---|---|
| `문헌` | `src/data/sources.json` 에 `verified: true` 로 들어 있는 사실만. (사람이 읽는 판은 루트의 `SOURCES.md`) | 본문: `{{lit:출처id/사실key}}` · 코드: `lit('출처id', '사실key')` |
| `유도` | 교재 안에서 수식으로 유도한 값, 또는 설정값을 교재의 모델에 넣어 계산·시뮬레이션한 값 | 본문: `{{der:chN#앵커|한국어 설명|English note}}` · 코드: `der('chN#앵커', {ko, en})`. **`chN#앵커` 는 N장에 `<Derivation id="앵커">` 가 실제로 있어야 한다**(테스트가 검사). |
| `예시값` | 출처 없는 가정. 회색. 사용자가 바꿀 수 있는 입력이어야 한다 | 본문: `{{ex}}` 또는 `{{ex:설정.경로}}` · 코드: `ex('설정.경로', {ko, en})` |

- 문헌에서 확인하지 못한 값은 **반드시 예시값**으로 쓴다. 그럴듯한 수치를 문헌값처럼 쓰지 않는다. 기억에 의존해 "보통 ~라고 알려져 있다"는 식의 수치를 쓰지 않는다. 필요한 문헌 사실이 `sources.json` 에 없으면 예시값으로 처리하고 최종 보고에 적는다.
- "수치"의 범위: 본문 문장 속 숫자, 표의 숫자, `Stat` 타일, 슬라이더(라벨 옆 배지), 그래프(그래프의 `src` 속성으로 그림 하나에 배지 하나 — 축 눈금 하나하나에는 달지 않는다).
- 전역 설정값을 본문에서 인용할 때는 숫자를 손으로 적지 말고 `{{cfg:uwb.sigmaTdoa}}` 를 쓴다(현재 값 + 단위 + 올바른 배지가 자동으로 붙고, 사용자가 바꾸면 따라 바뀐다).
- 논문 본문·그림을 그대로 옮기지 않는다. 설명은 직접 다시 쓰고 그래프는 직접 시뮬레이션해서 그린다.
- Crazyflie 펌웨어나 Crazyswarm2 의 내부 동작을 "정확히 재현한다"고 주장하지 않는다. 개념 모델은 개념 모델이라고 화면에 쓴다.

## 2. 건드려도 되는 파일

- **자기 챕터 폴더 `src/chapters/chN/` 안에서만 작업한다.** 파일은 필요한 만큼 나눠도 된다(`index.tsx`, `tasks.ts`, `tasks.fixtures.ts`, 그 밖의 컴포넌트 파일).
- 엔진에 기능이 더 필요하면 **새 파일**을 만든다: `src/sim/chN_<주제>.ts` (순수 TypeScript, DOM·브라우저 API 금지, Node 에서 돌아야 함). 몬테카를로 실험은 `src/sim/mc/chN_<이름>.ts` 에 `export const experiment: McExperiment = { id: 'chN-…', run(params, seed) { … } }` 로 만들면 워커가 자동 등록한다.
- **공용 파일은 수정하지 않는다**: `src/sim/` 의 기존 파일, `src/ui/`, `src/app/`, `src/styles.css`, `tests/`, `package.json`, 다른 챕터. 공용 코드에서 버그나 부족한 점을 찾으면 고치지 말고 최종 보고에 "무엇이, 어디서, 어떻게 틀렸는지"를 적어라. (여러 에이전트가 동시에 작업 중이라 공용 파일을 건드리면 충돌한다.)
- 스타일은 기존 CSS 클래스와 인라인 `style`(반드시 CSS 변수 `var(--text-2)`, `var(--series-1)` 등 사용)로 해결한다. 색을 하드코딩하지 않는다(다크 모드가 깨진다). 예외: 계열 색으로 채운 도형 위의 흰 글자 `#fff`.

## 3. 챕터의 계약 (`ChapterDef`, `src/app/chapters.ts`)

`index.tsx` 는 `ChapterDef` 를 default export 한다. 모든 챕터에 반드시 들어갈 것:

| # | 요소 | 구현 |
|---|---|---|
| ① | 학습 목표 3개 이내 | `objectives` |
| ② | "예측 먼저" 질문 1개 이상 | `<Predict>`(객관식) 또는 `<PredictNumber>`(슬라이더). 데모/결과 **앞**에 둔다 |
| ③ | 인터랙티브 데모 1개 이상 | `<Demo>` 안에 컨트롤 + 그래프 |
| ④ | 핵심 유도 | `<Derivation id="…" title>` — 건너뛰는 단계 없이, 2학년이 따라올 수 있게 |
| ⑤ | Pyodide 손코딩 과제 1개 이상 (자동 채점) | `<CodeTask task={…}>` + `tasks.ts` + `tasks.fixtures.ts` |
| ⑥ | 함정 실험실 1개 | `<Pitfall>` — 실제로 자주 하는 실수를 **재현**하는 조작 가능한 실험 |
| ⑦ | 오차 예산에 더하는 항목 | `budget: { items: [...], note }` — `src/sim/budget.ts` 의 item id |
| ⑧ | 3줄 요약 + 다음 장으로 넘어가는 질문 | `summary`, `next` |

`tasks` 필드에는 그 장의 `CodingTask[]` 를 넣는다(`tasks.ts` 가 `export const tasks = [...]` 를 내보내야 테스트가 찾는다).

그 밖에 교재 전체의 필수 기능 — 각 장에서 적어도 한 번씩 쓴다:

- **수식 ↔ 코드 ↔ 그래프 연동**: `<LinkGroup>` 안에서 수식의 항을 `\lk{key}{…}` 로 감싸고, `<CodeView code links={{ key: [줄번호] }}>` 와 그래프의 `series[i].link` / `refLines[i].link` 에 같은 key 를 준다. 수식의 항에 마우스를 올리면 해당 코드 줄과 그래프 요소가 강조된다. (7장 `DelayDemo` 참고)
- **이론과 시뮬레이션 겹쳐 그리기**: 이론값이 있는 곳에는 항상 이론선과 시뮬레이션 결과를 함께 그린다(`LineChart` 의 두 계열, `refLines`, `Histogram` 의 `theory`).
- **몬테카를로 패널**: 분포가 의미 있는 곳에 `<McPanel>`(Web Worker, 시드 고정 가능).
- **전역 설정 연동**: 데모의 기본값은 전역 설정(`config.value`)에서 가져온다. 그 장의 핵심 설정은 `<CfgSlider path="…">` 로 그 자리에서 바꿀 수 있게 한다(바꾸면 오차 예산과 다른 장도 함께 바뀐다). 데모에서만 잠깐 바꿔 보는 값은 지역 상태 + `ex('경로', {ko:'이 데모에서만 바꾸는 값', …})`.

## 4. 글 쓰는 법

- **모든 사용자에게 보이는 문자열은 `{ ko, en }` 두 언어로 쓴다.** 본문 기본은 한국어, 영어는 같은 내용의 자연스러운 번역. 컴포넌트는 `<P ko="…" en="…" />`, `<T ko en />`, `<List items={[{ko,en}]} />`, 속성은 `{ ko: '…', en: '…' }`.
- 전문용어는 그 장에서 **처음 나올 때** `**한국어**(영어)` 로 병기한다. 예: `**대수적 연결도**(algebraic connectivity)`. 정의 없이 용어를 쓰지 않는다. 앞 장에서 정의한 용어는 "N장에서 본 …" 으로 짧게 상기시킨다.
- 말투는 0·7장과 같은 "~합니다/~입니다". 문장은 짧게. 왜 필요한지 → 직관 → 식 → 숫자 예 순서.
- 유도는 단계를 건너뛰지 않는다. 기호는 쓰기 전에 뜻과 단위를 말한다. 좌표계(x, y 는 강당 바닥, z 는 위쪽), 부호 규약, 가정을 명시한다.
- 단위를 항상 쓴다. 내부 계산은 SI(m, s, kg, Hz). 화면 표시는 읽기 쉬운 단위(cm, ms)로 바꿔도 되지만 라벨에 단위를 적는다.
- 인라인 문법(`src/ui/Tx.tsx`): `$수식$`, `**굵게**`, `` `코드` ``, `[글자](#/ch/3)`, `[글자](https://…)`, `{{lit:…}}`, `{{der:…}}`, `{{ex…}}`, `{{cfg:…}}`.
  - JSX 속성 문자열 안에서 역슬래시는 그대로 쓴다: `ko="$\tau^*$"`. 객체 리터럴 문자열에서는 두 번: `{ ko: '$\\tau^*$' }`. 별행 수식은 `<M block tex={String.raw\`…\`} />`.
  - **수식 안에 글자를 넣을 때는 `\text{…}` 대신 `\tx{한국어}{English}`** 를 쓴다(언어 전환을 따라간다). 예: `\underbrace{2\tau_c}_{\tx{왕복}{round trip}}`. 수식 안에 한글을 `\text{}` 로 넣으면 영어 화면에 한글이 남는다. 기호 첨자(`\text{est}`)는 그대로 둔다.
  - 숫자를 템플릿 문자열로 끼워 넣을 때는 `fmt(v, 3)`(유효숫자) 또는 `fix(v, 2)`(소수 자리) 를 쓰고 **바로 뒤에 배지**를 붙인다: `` `${fmt(x)} ms{{der:ch3#rate}}` ``.

## 5. 공용 UI (`src/ui/index.ts` — 소스를 직접 읽어 속성을 확인할 것)

- 본문 블록(`blocks.tsx`): `Section`, `Demo`, `Pitfall`, `Derivation`, `Note`, `Predict`, `PredictNumber`, `Stat`/`StatRow`, `Status`, `Caption`
- 글(`Tx.tsx`): `P`, `T`, `List`, `rich` · 수식(`Math.tsx`): `M`
- 배지·숫자(`Badge.tsx`): `SrcBadge`, `Val`, `CfgVal`
- 컨트롤(`controls.tsx`): `Slider`(반드시 `src`), `CfgSlider`, `Toggle`, `Segmented`, `Button`, `NumberField`
- 그래프(`Plot.tsx`): `LineChart`(계열 색 + 선 모양, 십자선 툴팁, 표로 보기, `yLog`, `refLines`), `Histogram`(`theory`), `Waterfall`, `seriesColor(slot)`
- 평면도(`PlanView.tsx`): 강당 평면도 + 히트맵 + 끌 수 있는 앵커 + 임의 SVG 겹쳐 그리기(`children={(s) => …}` 에서 `s.sx(x)`, `s.sy(y)`, `s.k`[px/m])
- 군집 재생(`SwarmView.tsx`), 몬테카를로(`McPanel.tsx`), 3D(`Scene3D.tsx`: z 가 위. `build(ctx)` 에서 `ctx.wireBox/ellipsoid/marker/line/floorGrid/label`)
- 코드(`CodeView.tsx`, `CodeTask.tsx`), 연동(`link.tsx`: `LinkGroup`), 훅(`hooks.ts`: `useDebounced`)
- 직접 SVG 를 그릴 때: 글자는 `class="tick"`/`"axis-label"`/`"ref-label"`, 색은 CSS 변수. 축에는 라벨과 단위. 계열은 **색만으로 구분하지 말고** 선 모양·표식 모양·글자 라벨을 함께 쓴다. 키보드로 조작 가능해야 한다(버튼·슬라이더는 기본 지원. 직접 만든 끌기 조작에는 방향키 대안을 넣는다).
- 접근성: 의미 있는 그림에는 `role="img"` + `aria-label`. 상태를 색으로만 알리지 말고 `Status`(✓ △ ✕ 기호 포함)를 쓴다.
- 성능: 무거운 계산은 `useMemo` + `useDebounced`, 또는 버튼을 눌렀을 때만. 수백 회 반복은 `McPanel`(워커).

## 6. 전역 상태 (`src/app/store.ts`)

- `config.value`: `SystemConfig`(`src/sim/config.ts`). 컴포넌트에서 읽으면 바뀔 때 자동으로 다시 그린다. 바꿀 때는 `setPath('uwb.sigmaTdoa', 0.2)`(SI 단위).
- `budget.value`: `computeBudget(config)` 의 결과(`src/sim/budget.ts`). `sigmaEff`, `dop`, `posRate`, `sigmaEstH/V`, `loopDelay`, `delayMargin`, `minSepH/V`, `items` 등.
- 설정 필드의 표시 이름·단위·범위는 `src/app/fields.ts` 의 `FIELDS`.
- 방문/과제 통과 기록은 공용 틀이 알아서 한다.

## 7. 엔진 (`src/sim/`, 모든 장이 같은 엔진을 쓴다 — 계산을 챕터 안에서 다시 구현하지 말 것)

| 파일 | 내용 |
|---|---|
| `rng.ts` | `Rng`(시드 고정): `uniform`, `gauss`, `truncGauss`, `exponential`, `bernoulli`, `inBall` |
| `linalg.ts` | 작은 행렬 연산, `solve`, `inv`, `eigSym`, `covEllipse` |
| `stats.ts` | `mean`, `std`, `rms`, `quantile`, `histogram`, `linfit`, `fitDecayRate`, `normCdf`, `normPdf` |
| `uwb.ts` | `C_LIGHT`, `ssTwr`, `dsTwr`, `dsTwrTof`, `ssTwrDriftError`, `tdoaOf`, `quantize` |
| `positioning.ts` | `gaussNewtonRange`, `gaussNewtonTdoa`(반복 경로 `path` 포함), `pairsFor`, `dopRange`, `dopTdoa`, `dopPseudorange`, `dopFor`, `dopGrid`, `insideAnchorBox` |
| `updateRate.ts` | `twrRate`, `tdoaRate`, `simulateTwrSchedule` |
| `nlos.ts` | `segmentHitsBox`, `nlosFlags`, `sampleRangeError`, `sampleTdoaError`, `gateAccept`, `emgPdf`, `gatedErrorStats`, `huberWeight` |
| `kf.ts` | `kfPredict`, `kfUpdate`, `ekfScalarUpdate`(게이트·강건 가중), `rangeModel`, `tdoaModel`, `cvModel`, `dareSteadyState`, `steadyStatePosSigma`, `BufferedKf`(지연 측정: 버퍼 후 재전파) |
| `fusion.ts` | `simulateFusion`(UWB+IMU EKF, tight/loose, Q/R, 게이트), `lissajous` |
| `graph.ts`, `consensus.ts`, `loss.ts` | 7장 |
| `safety.ts` | `ellipsoidDistance`, `cbfFilter`(기본/강건), `cbfRobustDesign`, `simulateCbfPair`, `extrapolate` |
| `swarm.ts`, `scenario.ts`, `formation.ts` | 5대 대형 시뮬레이션, 설정 → 시나리오 |
| `config.ts`, `budget.ts` | 전역 설정, 오차 예산 |
| `logfit.ts` | CSV 파싱과 피팅(`parseCsv`, `fitStaticLog`, `fitRangeLog`, `fitLatencyLog`, `estimateGilbert`), 합성 로그 생성기 |
| `mc/*.ts` | 몬테카를로 실험(`swarm`, `cbfPair`, `consensus`, `positioning`, `fusion`) |

엔진의 핵심 함수는 `verify/verify.py`(numpy/scipy 독립 구현)와 교차검증되어 있다(`npm run verify`). 엔진 결과가 이상해 보이면 직접 고치지 말고 보고하라.

## 8. 손코딩 과제 (`src/py/grader.ts` 의 `CodingTask` 주석을 읽을 것)

- 브라우저 안의 Pyodide(Python 3.14 + numpy)에서 돈다. numpy 외의 패키지는 없다(scipy 없음).
- 채점: 학생 코드와 기준 구현(`solution`)을 같은 `TESTS` 로 돌려 **수치 비교**한다(허용 오차 `rtol`, `atol` 명시). 케이스마다 틀렸을 때 보여줄 **힌트(한/영)** 를 쓴다 — "어떤 케이스가 왜 틀렸는지" 짐작할 수 있게, 그 케이스가 겨냥하는 흔한 실수를 짚는다.
- 케이스는 **5개 이상, 그중 숨은 케이스(`hidden=True`) 1개 이상**. 입력은 결정론적으로(난수는 `np.random.default_rng(시드)`). 난수가 필요한 과제는 난수를 인자로 받게 설계한다(7장 `gilbert_elliott(u, …)` 참고).
- 과제 설명(`prompt`)에 함수 시그니처, 인자·반환값의 **모양과 단위**, 부호 규약을 빠짐없이 적는다. 모호하면 학생은 풀 수 없다.
- `starter` 는 구조와 주석이 있는 뼈대(그대로는 통과하지 않아야 함). `solution` 은 읽기 좋은 기준 구현(주석 포함) — 본문 `CodeView` 와 수식 연동(`links`)에도 쓴다.
- `tasks.fixtures.ts`: 과제마다 **일부러 틀린 코드 3종 이상**(각각 실제로 흔한 실수 하나씩) + **경계 사례 1개 이상**(`shouldPass` 명시: 다른 방식으로 푼 정답은 통과해야 하고, 형식만 맞춘 오답은 탈락해야 한다).
- 문자열 주의: `tests`, `solution` 은 TypeScript 템플릿 문자열이다. **안에 백틱을 쓰지 말 것.** Python 문자열 속 LaTeX 역슬래시는 네 번(`\\\\pi` → Python 에서 `\\pi` → 화면 `\pi`). `${` 도 쓰지 말 것.
- 검사: `npx tsx scripts/check-tasks.ts N` — "모두 통과"가 나와야 한다.

## 9. 확인 절차 (끝내기 전에 반드시)

1. `npx tsc --noEmit 2>&1 | grep -E "chapters/chN|sim/chN|mc/chN"` → 자기 파일에 타입 오류 0. (다른 에이전트의 작업 중인 파일에서 나는 오류는 무시)
2. `npx tsx scripts/check-tasks.ts N` → 모두 통과.
3. `npx vitest run tests/content.test.ts -t "N장"` 과 `-t "배지"` → 자기 장과 관련된 실패 0.
4. 개발 서버는 이미 `http://localhost:5173/` 에서 돌고 있다(새로 띄우지 말 것. 응답이 없을 때만 `npx vite --port 5173 --strictPort` 를 백그라운드로). 스크린샷:
   - `node scripts/shot.mjs ch/N .cache/chN-d.png 1440 full` (데스크톱) / `… .cache/chN-m.png 390 full` (모바일)
   - 카드 하나만: `node scripts/shot.mjs ch/N .cache/x.png 1100 "[data-testid=…]" "[클릭할 셀렉터],[…]"` (다섯 번째 인자의 셀렉터들을 차례로 클릭한 뒤 찍는다. 예측 카드를 먼저 눌러야 그 뒤 내용이 보이는 경우 등)
   - 출력의 마지막 줄이 `no console errors` 여야 한다.
   - **스크린샷을 직접 열어(Read) 확인한다**: 그래프 축 라벨·단위, 수식 렌더링(빨간 KaTeX 오류 없음), 잘림·겹침, 390px 에서 가로로 넘치지 않는지, 배지가 빠진 숫자가 없는지. 문제가 있으면 고치고 다시 찍는다. (전체 페이지 사진은 매우 길어 글자가 안 보이므로 카드 단위로 찍어 확인하라.)
5. 한/영 전환: 영어로 봤을 때 한국어가 남아 있지 않은지(코드 주석 제외) 확인.
6. 초보 독자의 눈으로 처음부터 한 번 읽는다: 정의 없이 나온 용어, 건너뛴 유도 단계, 모호한 과제 지시가 없는지.

## 10. 최종 보고 (짧게)

- 만든 것(섹션·데모·과제·함정 목록)
- 공용 코드에서 발견한 문제나 필요했던 기능(있으면: 파일, 증상, 제안)
- `예시값`으로 남긴 핵심 수치와, 문헌으로 쓰고 싶었지만 `sources.json` 에 없어서 못 쓴 사실
- 확인 절차 1~6 의 결과(실패한 채 남긴 것이 있으면 숨기지 말고 적는다)
