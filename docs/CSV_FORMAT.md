# 9장 로그 CSV 형식 (CSV formats for chapter 9)

9장 「우리 시스템 측정하기」의 데모는 CSV 파일 세 종류를 읽는다. **파일은 브라우저 안에서만 처리된다.** 서버로 보내지 않고, 네트워크 요청도 하지 않는다. 탭을 닫으면 로그는 사라지고, "전역 설정에 반영"을 누른 숫자만 설정(localStorage)에 남는다.

The demo of chapter 9 reads three kinds of CSV. **Files are processed only inside the browser**: nothing is uploaded and no network request is made.

파서는 `src/sim/logfit.ts` 의 `parseCsv`, 형식 검사는 `src/sim/ch9_measure.ts` 의 `checkLog` 이다.

## 공통 규칙 (rules common to all files)

| 항목 | 규칙 |
|---|---|
| 첫 줄 (header) | 주석을 뺀 첫 줄은 **열 이름**이다. 대소문자를 구분하지 않는다(소문자로 바꿔 비교). 열 순서는 자유. 필요한 열 말고 다른 열이 더 있어도 된다(무시). 큰따옴표로 감싼 열 이름도 읽는다. |
| 구분자 (separator) | 쉼표 `,` · 세미콜론 `;` · 탭 가운데 하나. **첫 줄을 보고** 정한다(탭이 있으면 탭, 없고 세미콜론이 있으면 세미콜론, 아니면 쉼표). 한 파일 안에서 섞어 쓰지 않는다. |
| 소수점 (decimal mark) | 마침표 `.` 만. `3,14` 처럼 쉼표를 쓰면 숫자로 읽지 못한다. 지수 표기(`1.2e-3`)는 된다. |
| 주석 (comments) | `#` 으로 시작하는 줄과 빈 줄은 건너뛴다. 측정 날짜·장소·조건을 적어 두는 데 쓴다. |
| 못 읽는 줄 (bad rows) | 칸 수가 열 이름보다 적거나, 열 이름에 해당하는 칸 가운데 하나라도 비었거나 숫자가 아니면 **그 줄 전체를 건너뛴다.** 건너뛴 줄 수는 화면에 표시된다. |
| 시각 (time) | 단위는 **초 [s]**. 0 에서 시작하지 않아도 된다(첫 값을 빼고 계산한다). 한 파일 안의 시각은 **하나의 시계**로 잰 것이어야 한다. 나노초·밀리초로 기록했다면 초로 바꿔서 넣는다. |
| 길이 (lengths) | 단위는 **미터 [m]**. |
| 줄 수 (rows) | 쓸 수 있는 줄이 10개 미만이면 피팅하지 않는다(데모가 정한 한도). 권장은 수백 줄. |
| 파일 크기 (size) | 30 MB 를 넘는 파일은 읽지 않는다(브라우저가 멈추지 않도록 데모가 정한 한도). |

## ① 정지 로그 (static log) — `t,x,y,z`

기체를 좌표를 아는 지점의 받침대에 고정하고 기록한 **추정 위치**.

| column | unit | 뜻 (meaning) |
|---|---|---|
| `t` | s | 시각. 어떤 시계든 되지만 한 파일 안에서는 하나의 시계 (time stamp; any single clock) |
| `x` | m | 추정 위치 x — 강당 바닥의 가로 방향, 앵커 좌표와 같은 좌표계 (estimated x, same frame as the anchor coordinates) |
| `y` | m | 추정 위치 y — 강당 바닥의 세로 방향 (estimated y) |
| `z` | m | 추정 위치 z — 위쪽이 + (estimated z, up) |

계산(`fitStaticLog`): 축마다 최소제곱 직선을 빼고(추세 제거) 잔차의 표본 표준편차(`ddof=1`) → `sigma`; 빼지 않은 표준편차 → `sigmaRaw`; 직선의 기울기 → `drift` [m/s]; `sigmaH = √(σx² + σy²)`, `sigmaV = σz`; 표본 주기 `rate` [Hz].

```csv
# 2026-11-22, 강당 중앙 삼각대 1.0 m, TDoA, 로그 10 Hz
t,x,y,z
0.0,10.012,7.488,1.003
0.1,9.994,7.513,0.981
```

## ② 거리 로그 (range log) — `t,anchor_id,range_m`

앵커별 **원시 거리 측정값**. 한 줄에 측정 하나. 앵커가 섞여 있어도 된다(`anchor_id` 로 묶는다).

| column | unit | 뜻 (meaning) |
|---|---|---|
| `t` | s | 측정 시각 (time stamp) |
| `anchor_id` | – | 앵커 번호, 정수 (anchor number, integer). 거리차(TDoA) 로그라면 앵커 **쌍**의 번호 |
| `range_m` | m | 그 앵커까지 잰 거리 (measured range). 거리차 로그라면 두 앵커까지의 거리의 차 |

실제 거리(줄자·레이저 거리계로 잰 안테나 사이 거리)는 파일에 넣지 않고 **화면의 입력 칸**에 앵커별로 넣는다.

계산(`fitRangeLog`, `rangeGroups`, `fitNlosTail`): 앵커별 평균·중앙값·표준편차, 편향 = 평균 − 실제 거리(표의 참고값)와 중앙값 − 실제 거리(설정에 쓰는 값), 강건 σ = 1.4826 × MAD, 이상치 비율 = 중앙값보다 3·(강건 σ) 넘게 큰 측정의 비율, 오른쪽 꼬리에서 NLOS 확률과 편향 평균. 앵커 측량 오차의 어림(`anchorBiasSpread`)은 (중앙값 − 실제 거리)의 **앵커 간 표준편차**에서 중앙값 추정의 분산(π/2 · σ_rob² / n)을 뺀 값이다. 모든 앵커에 공통인 몫(안테나 지연, NLOS 가 중앙값을 미는 몫)은 좌표 오차가 아니므로 평균으로 빼고 따로 보여 준다.

```csv
t,anchor_id,range_m
0.004,0,12.339
0.008,1,13.769
```

## ③④ 지연·손실 로그 (latency & loss log) — `seq,t_send,t_recv`

지상 PC 가 번호를 붙여 보낸 핑이 기체에서 되돌아온 **왕복** 기록.

| column | unit | 뜻 (meaning) |
|---|---|---|
| `seq` | – | 핑의 순번, 정수. 0 에서 시작하지 않아도 된다 (sequence number, integer) |
| `t_send` | s | PC 가 핑을 보낸 시각 (send time on the PC clock) |
| `t_recv` | s | 그 핑의 메아리가 PC 에 돌아온 시각 (time the echo returned, **same PC clock**) |

- **`t_send` 와 `t_recv` 는 반드시 같은 PC 의 같은 시계**여야 한다. 기체 시계로 찍은 수신 시각을 넣으면 두 시계의 오프셋이 그대로 섞여 값이 틀린다(음수가 나오기도 한다). 도중에 고쳐지지 않는 단조 시계를 권한다.
- **돌아오지 않은 핑은 줄을 쓰지 않는다.** 첫 순번과 마지막 순번 사이에서 빠진 순번을 손실로 센다.
- `t_recv < t_send` 인 줄은 지연 계산에서 빼고 경고를 보여 준다.

계산(`fitLatencyLog`, `estimateGilbert`): 편도 지연 = (t_recv − t_send) / 2 (대칭 가정), 평균·표준편차·p50·p95·p99, w = (p95 − p5) / 2, 편도 지터 J = w / (1 − √0.1) ≈ w / 0.684 (편도 지연이 서로 독립인 균등분포 μ ± J 이면 왕복의 절반은 삼각분포이고 그 95 % 분위수가 μ + 0.684 J 이므로; `jitterFromHalfWidth`), 손실률 = 빠진 개수 / (마지막 순번 − 첫 순번 + 1), 2상태 손실 모델의 전이 확률 p_GB, p_BG 와 평균 연속 손실 길이. 이 모델은 Good 상태 손실 0 %, Bad 상태 손실 100 % 로 단순화한 것이라 "전역 설정에 반영"은 h_G = 0, h_B = 1 도 함께 넣는다. 설정의 h_G, h_B 가 0 %/100 % 가 아니면 샘플에서 손실률은 돌아오지만 p_GB, p_BG 는 설정값으로 돌아오지 않는다.

```csv
seq,t_send,t_recv
0,0.00000,0.03085
2,0.10000,0.14526
```

## 샘플 파일 (sample files)

`public/samples/` 에 합성 데이터가 들어 있다. 기본 설정(`defaultConfig()`)으로 `src/sim/ch9_measure.ts` 의 `sampleStaticLog` / `sampleDriftLog` / `sampleRangeLog` / `sampleLatencyLog` 를 한 번 돌려 만든 것이며, 각 파일의 첫 줄(`#` 주석)에 생성 파라미터가 적혀 있다. 화면의 "샘플 불러오기" 버튼은 같은 함수를 **현재 전역 설정**으로 브라우저 안에서 돌린다(파일을 내려받지 않는다).

| file | columns | 내용 |
|---|---|---|
| `static_log.csv` | `t,x,y,z` | 10 Hz, 60 s 정지 로그 (static log) |
| `static_drift_log.csv` | `t,x,y,z` | x 축에 1 mm/s 드리프트가 섞인 정지 로그 (static log with drift on x) |
| `range_log.csv` | `t,anchor_id,range_m` | 앵커 8개 × 500개, 5 % NLOS (8 anchors × 500 ranges) |
| `latency_log.csv` | `seq,t_send,t_recv` | 20 Hz 로 보낸 핑 1200개, 손실 포함 (1200 pings with losses) |

## ROS 2 bag 에서 만들기 (from a ROS 2 bag)

9장 본문의 예시 스크립트를 참고한다. 토픽 이름·메시지 필드·함수 인자는 ROS 2 배포판과 Crazyswarm2 버전에 따라 다르므로 공식 문서(<https://docs.ros.org/>, <https://imrclab.github.io/crazyswarm2/>)에서 확인한다. 기록 자체는 예를 들어 `ros2 bag record -o <bag 폴더> <토픽 이름>` 꼴의 명령으로 한다(**예시**, 문서에서 확인). bag 이 기록하는 시각이 PC 가 메시지를 **받은** 시각인지 기체가 측정한 시각인지는 이 교재가 확인하지 않았다. 받은 시각일 수 있으므로 rosbag2 문서에서 확인하고, 받은 시각이라면 지연 계산에 쓰지 않는다.
