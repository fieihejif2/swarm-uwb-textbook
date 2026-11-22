# SOURCES — 문헌 확인 기록

UWB 실내 드론 군집 교재(Crazyflie 2.1 Brushless 5대, Loco Positioning System TDoA, Crazyswarm2)에 쓰는 숫자·식의 출처 확인 기록입니다.

- 접속일: **2026-11-22** (모든 출처 공통)
- 방법: 각 문서를 웹에서 직접 받아(PDF, 문서 HTML, GitHub raw 마크다운/소스) 본문에서 해당 사실을 찾았습니다. 기억에 의존한 항목은 없습니다.
- `확인` 열이 **아니오**인 항목은 문서를 열지 못했거나 문서 안에서 그 사실을 찾지 못한 것입니다. 화면에 쓰려면 유도(b) 또는 명시적 가정(c)으로 처리해야 합니다.
- 비고에 '유도값'이라고 적은 숫자는 출처 문서에 그대로 적힌 값이 아닙니다.
- 소스 코드 줄 번호는 표시한 커밋 기준 근사치입니다. 저장소가 바뀌면 달라집니다.
- 같은 내용의 기계 판독용 파일: `sources.verified.json`

요약: 출처 12개, 사실 132개 중 확인 117개, 미확인 15개.

## 1. Olfati-Saber & Murray (2004) — 합의(consensus) 문제

- id: `olfati2004`
- 서지: R. Olfati-Saber and R. M. Murray, "Consensus Problems in Networks of Agents With Switching Topology and Time-Delays," IEEE Transactions on Automatic Control, vol. 49, no. 9, pp. 1520-1533, Sep. 2004. doi:10.1109/TAC.2004.834113
- 실제로 연 URL:
  - https://authors.library.caltech.edu/records/t2gnt-vd720/files/OLFieeetac04.pdf (게재본 PDF, 14쪽 전부 받음)
  - https://authors.library.caltech.edu/api/records/t2gnt-vd720 (CaltechAUTHORS 메타데이터)
  - https://www.cds.caltech.edu/~murray/preprints/om04-tac.pdf (프리프린트, 수식 대조용)
  - https://api.crossref.org/works?query.bibliographic=... (서지 확인)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| IEEE TAC 49권 9호, 1520-1533쪽, 2004년 9월, DOI 10.1109/TAC.2004.834113 (`biblio`) | 10.1109/TAC.2004.834113 | 게재본 1쪽 머리말(p. 1520) + CaltechAUTHORS 레코드 + Crossref | 예 |  |
| 지연 없는 선형 합의 프로토콜 (A1): 적분기 에이전트 x_i' = u_i 에 대해 u_i = Σ_{j∈N_i} a_ij (x_j − x_i) (`protocol-a1`) | `\dot{x}_i = u_i,\quad u_i = \sum_{v_j \in N_i} a_{ij}\,(x_j - x_i)` | Sec. III, 식 (3) 및 (A1), p. 1522 | 예 | 게재본 PDF는 수식 글리프가 텍스트 추출/렌더링에서 깨져 보였음. 정리·식 번호·쪽수는 게재본에서 확인했고, 수식의 기호 자체는 저자 프리프린트(2003-04-23 제출본, cds.caltech.edu) 본문 텍스트와 대조함. |
| 시간지연 선형 합의 프로토콜 (A2): 이웃 값과 자기 값 모두 같은 지연 τ_ij 를 갖는 형태 (`protocol-a2-delayed`) | `u_i(t) = \sum_{v_j \in N_i} a_{ij}\,[\,x_j(t-\tau_{ij}) - x_i(t-\tau_{ij})\,]` | Sec. III, 식 (A2), p. 1522; 네트워크 동역학은 Sec. X, 식 (40), p. 1528 | 예 | 게재본 PDF는 수식 글리프가 텍스트 추출/렌더링에서 깨져 보였음. 정리·식 번호·쪽수는 게재본에서 확인했고, 수식의 기호 자체는 저자 프리프린트(2003-04-23 제출본, cds.caltech.edu) 본문 텍스트와 대조함. |
| 모든 링크의 지연이 같고(τ), 토폴로지가 고정·무방향·연결일 때 (A2)가 평균 합의를 달성할 필요충분조건: 0 < τ < τ* = π/(2 λ_n), λ_n = λ_max(L) (`delay-bound`) | `\tau \in (0,\tau^*),\quad \tau^* = \frac{\pi}{2\lambda_n},\quad \lambda_n = \lambda_{\max}(L)` s (가중치 단위에 따름) | Theorem 10, 조건 i), Sec. X, p. 1528 (증명은 Appendix B) | 예 | 게재본 PDF는 수식 글리프가 텍스트 추출/렌더링에서 깨져 보였음. 정리·식 번호·쪽수는 게재본에서 확인했고, 수식의 기호 자체는 저자 프리프린트(2003-04-23 제출본, cds.caltech.edu) 본문 텍스트와 대조함. 같은 정리의 조건 ii)는 Nyquist 판별 형태. τ = τ* 에서는 주파수 ω = λ_n 의 진동 해(게재본에서 판독 가능). |
| 저자 시뮬레이션 예: τ_max = π/(2 λ_max(G_e)) = 0.269 (`delay-bound-example`) | 0.269 s | Sec. XI (Simulation Results), p. 1529, Fig. 7 설명 문단 | 예 | 게재본에서 글자 그대로 판독됨. 프리프린트(2003)는 같은 자리에 0.266 으로 적혀 있어 값이 다름 — 게재본 값을 쓸 것. |
| 게르쉬고린 정리로 λ_n ≤ 2·d_max(G) (d_max = 최대 out-degree). 따라서 충분조건 τ < π/(4 d_max(G)) (`lambda-max-degree-bound`) | `\lambda_n \le 2\,d_{\max}(G) \;\Rightarrow\; \tau < \frac{\pi}{4\,d_{\max}(G)}` | Sec. X-A, 식 (44), p. 1529. 근거 정리는 Theorem 2 (Spectral Localization), Sec. V, 식 (18), p. 1524 | 예 | 게재본 PDF는 수식 글리프가 텍스트 추출/렌더링에서 깨져 보였음. 정리·식 번호·쪽수는 게재본에서 확인했고, 수식의 기호 자체는 저자 프리프린트(2003-04-23 제출본, cds.caltech.edu) 본문 텍스트와 대조함. |
| 대수적 연결도(Fiedler 고유값)가 합의 속도를 결정: 불일치 벡터 δ 가 κ = λ_2(Ĝ) 의 속도로 지수 수렴 (Ĝ 는 mirror 그래프; 무방향이면 Ĝ = G) (`lambda2-speed`) | `\\|\delta(t)\\| \le \\|\delta(0)\\|\,e^{-\kappa t},\quad \kappa = \lambda_2(\hat{G})` | Theorem 8 (Performance of Agreement), Sec. VIII, 식 (31), p. 1527 | 예 | 게재본 PDF는 수식 글리프가 텍스트 추출/렌더링에서 깨져 보였음. 정리·식 번호·쪽수는 게재본에서 확인했고, 수식의 기호 자체는 저자 프리프린트(2003-04-23 제출본, cds.caltech.edu) 본문 텍스트와 대조함. 정리 직후 문단: 간선이 조밀한 그래프가 성긴 그래프보다 빨리 합의한다고 서술. |
| 가중치를 k배로 줄이면 허용 지연은 늘지만 합의 속도 λ_2 가 같은 비율로 떨어짐 (강건성-성능 절충) (`tradeoff-delay-speed`) | — | Sec. X-A 'Tradeoff Between Performance and Robustness', p. 1529; 초록에도 같은 요지 | 예 |  |

## 2. Preiss, Hönig, Sukhatme, Ayanian (2017) — Crazyswarm

- id: `crazyswarm2017`
- 서지: J. A. Preiss, W. Hönig, G. S. Sukhatme, and N. Ayanian, "Crazyswarm: A large nano-quadcopter swarm," in Proc. IEEE Int. Conf. on Robotics and Automation (ICRA), 2017, pp. 3299-3304. doi:10.1109/ICRA.2017.7989376
- 실제로 연 URL:
  - https://whoenig.github.io/publications/2017_ICRA_Preiss_Hoenig.pdf (저자 호스팅 PDF, 6쪽)
  - https://api.crossref.org/works?query.bibliographic=... (서지: DOI, 쪽수)
  - act.usc.edu/publications/Preiss_ICRA2017.pdf 는 접속 실패(연결 불가)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| ICRA 2017, 3299-3304쪽, DOI 10.1109/ICRA.2017.7989376 (`biblio`) | 10.1109/ICRA.2017.7989376 | Crossref 레코드; Crazyswarm2 문서 index 의 BibTeX 와 일치 | 예 | PDF 쪽 번호 1-6 은 논문집 3299-3304 에 대응. |
| 실험에 사용한 기체 수: 49대 (Crazyflie 2.0) (`num-drones`) | 49 대 | Abstract; Sec. I, PDF p. 1 | 예 |  |
| 49대를 라디오 3개로 운용. 각 기체는 한 라디오에 고정 배정 (`num-radios`) | 3 개 | Sec. I (p. 1), Sec. VIII (p. 4), Sec. XII (p. 6) | 예 |  |
| 라디오 1개당 기체 수(숫자) (`drones-per-radio`) | — | 명시된 숫자 없음 | **아니오** | 논문은 '49대에 라디오 3개'만 말하고 라디오당 대수를 숫자로 쓰지 않음. 49/3 ≈ 16.3 은 우리 쪽 유도값으로 표기해야 함. |
| Crazyradio PA: 2.4 GHz USB 라디오, 최대 2 Mbit/s, 32바이트 패킷 (`radio-hw`) | 2 Mbit/s | Sec. III (Vehicle), PDF p. 1 | 예 |  |
| Crazyflie 2.0: 대각 모터축 간 92 mm, 배터리 포함 27 g, 마커+LED 보드 포함 33 g (`vehicle`) | 92 mm / 27 g / 33 g | Sec. III, PDF p. 1 | 예 | Crazyflie 2.1 Brushless 와는 다른 기체임에 주의. |
| 상태추정은 기체 탑재(onboard): 모션캡처 위치와 IMU 를 EKF 로 융합. 필터는 500 Hz IMU 로 구동, 상태는 (p, v, q) (`onboard-estimation`) | 500 Hz | Sec. VI (State Estimation), PDF p. 2-3; 메인 루프 500 Hz 는 Sec. IV 와 Fig. 2 | 예 |  |
| 기지국이 모든 기체의 자세(pose)를 서로 다른 채널의 라디오 3개로 방송. 외부 위치 추정은 10 ms 마다(=100 Hz) 고정 주기로 전송 (`mocap-by-radio`) | 100 Hz | Sec. IV (p. 2), Sec. VIII (p. 4), Fig. 2 | 예 |  |
| 통신은 두 종류: 지상 설정용 요청-응답(궤적 업로드, 파라미터, 그룹 배정)과 비행 중 방송(위치 피드백, 이륙/착륙/궤적 시작 동기화). 방송 명령은 그룹 ID 로 부분집합 지정 가능. 명령은 멱등이라 반복 전송 (`comm-design`) | — | Sec. VIII (Communication), PDF p. 4 | 예 | 궤적 전체를 기체에 저장하므로 패킷 손실에 강하다는 서술은 Sec. IV. |
| 위치는 24비트 고정소수점, 쿼터니언은 32비트로 압축. 32바이트 패킷 1개에 위치 갱신 2개, USB 요청 1회에 패킷 2개 → 요청 1회당 기체 4대 (`compression`) | 4 대/USB 요청 | Sec. VIII, PDF p. 4 | 예 |  |
| 군집 명령은 3 ms 간격으로 5회 반복하면 모든 기체에 도달할 가능성이 높음 (Table I: 6대에 10000패킷) (`command-repeat`) | 5회 / 3 ms | Sec. VIII + Table I, PDF p. 4 | 예 |  |
| 소프트웨어 추정 지연 8-23 ms (군집 크기에 따라). 실제 지연은 항상 3 ms 더 길어 49대에서 26 ms. 가장 큰 몫은 모션캡처(49대에서 최대 14 ms). 결론부는 '30 ms 미만' (`latency`) | 26 ms (49대, 실측) | Sec. XI-A (Latency) + Fig. 3, PDF p. 5; Sec. XII, p. 6 | 예 | UTIL 논문(4.3.3)은 같은 구성의 단일 기체 지연을 약 11 ms 로 인용. |
| 평균 위치 추종 오차 2 cm 미만 (49대 전체 비행 시에도). 8자 궤적, 평균 0.76 m/s, 최대 1.5 m/s, 0.5 m 격자 (`tracking-error`) | 2 cm (상한) | Abstract; Sec. XI-B + Fig. 4, PDF p. 5 | 예 | Fig. 4 막대는 1대 약 1.45 cm → 7x7 약 1.8 cm 로 읽히나 그래프 판독값이므로 숫자로 쓰려면 '그림 판독'이라고 밝힐 것. |
| 위치 갱신율별 호버 평균 오차: 100 Hz 0.58 cm, 10 Hz 0.68, 5 Hz 0.91, 3.3 Hz 1.48, 2.5 Hz 1.95, 2 Hz 2.18 cm (`hover-error-vs-rate`) | 100:0.58, 10:0.68, 5:0.91, 3.33:1.48, 2.5:1.95, 2:2.18 Hz : cm | Table II, Sec. XI-C, PDF p. 5 | 예 | 표를 이미지로 렌더링해 열 대응을 확인함. |
| 실험 공간 6 m x 6 m x 3 m, VICON Vantage 카메라 24대. 49대 추적은 75 Hz 로 동작 (`arena`) | 6 x 6 x 3 m | Sec. XI 서두 (p. 5); 75 Hz 는 Sec. V-B (p. 2) | 예 |  |
| 저자들은 UWB 측위(참고문헌 [11])가 10 cm 를 넘는 위치 오차를 보여 조밀 대형에는 크다고 평가하고 모션캡처를 택함 (`uwb-comparison`) | 10 cm (하한, 인용) | Sec. IV (Architecture Overview), PDF p. 2 | 예 | UWB 군집 교재에서 '왜 간격을 넓게 잡아야 하는가'의 근거로 쓸 수 있음. |
| 다운워시/타원체 분리 거리 수치 (`separation-ellipsoid`) | — | 이 논문에는 없음 | **아니오** | 다운워시는 Sec. XII 의 향후 과제로만 언급. 수치는 downwash2017 (Sec. VI-A)에 있음. 이 논문에서 확인되는 간격은 대형 격자 0.5 m 뿐. |

## 3. Preiss, Hönig, Ayanian, Sukhatme (2017) — Downwash-Aware Trajectory Planning

- id: `downwash2017`
- 서지: J. A. Preiss, W. Hönig, N. Ayanian, and G. S. Sukhatme, "Downwash-Aware Trajectory Planning for Large Quadrotor Teams," in Proc. IEEE/RSJ Int. Conf. on Intelligent Robots and Systems (IROS), 2017, pp. 250-257. doi:10.1109/IROS.2017.8202165. arXiv:1704.04852v2
- 실제로 연 URL:
  - https://arxiv.org/pdf/1704.04852 (v2, 2017-07-23, 8쪽)
  - https://export.arxiv.org/api/query?id_list=1704.04852 (메타데이터)
  - https://api.crossref.org/works?query.bibliographic=... (IROS 서지)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| IROS 2017, 250-257쪽, DOI 10.1109/IROS.2017.8202165; arXiv:1704.04852v2 (`biblio`) | 10.1109/IROS.2017.8202165 | Crossref 레코드; arXiv PDF 1쪽 여백 표기 | 예 | 쪽 번호는 arXiv v2 PDF 기준으로 적음. |
| 각 로봇을 축 정렬 타원체로 모델링: 반지름 0 < r_x = r_y ≪ r_z. 충돌 회피 제약은 ‖E⁻¹(p − q)‖₂ ≥ 2, E = diag(r_x, r_y, r_z) (`ellipsoid-model`) | `\mathcal{E}(q)=\{Ex+q:\\|x\\|_2\le 1\},\; E=\mathrm{diag}(r_x,r_y,r_z),\; \\|E^{-1}(p-q)\\|_2\ge 2` | Sec. III-A (Robot Model), 식 (1), (2), Fig. 2, arXiv PDF p. 2 | 예 | '≪' 기호는 페이지 이미지로 확인. |
| Crazyflie 에 사용한 수직 반지름 r_z = 0.3 m (두 기체를 위아래로 띄워 100 Hz 로 위치 오차를 기록해 결정) (`ellipsoid-rz`) | 0.3 m | Sec. VI-A (Downwash Characterization), arXiv PDF p. 6 | 예 | 식 (2)에 넣으면 같은 xy 에서 수직 중심 간 거리 2·r_z = 0.6 m 이상 (유도값). Sec. VI-B 는 임의의 더 큰 여유 r_z = 0.9 m 도 시험. |
| 수평 반지름 r_x = r_y = 0.12 m (`ellipsoid-rxy`) | 0.12 m | Sec. VI-A, arXiv PDF p. 6 | 예 | 같은 높이에서 수평 중심 간 거리 2·r_xy = 0.24 m 이상 (유도값). |
| 장애물용 타원체 E_obs 는 반지름 0.15 m 의 구 (다운워시는 로봇-로봇 사이에서만 중요하므로) (`obstacle-ellipsoid`) | 0.15 m | Sec. VI-A (값, arXiv PDF p. 6); 이유는 Sec. V-A (Spatial Partition), p. 4 | 예 |  |
| 회전익 아래로 빠르게 내려가는 공기(다운워시)는 한 기체가 다른 기체 바로 아래를 날 때 안정성을 잃게 할 만큼 큼. 그래서 타원체를 z 방향으로 길게 잡음 (`downwash-motivation`) | — | Sec. III-A, Fig. 2 캡션, arXiv PDF p. 2 | 예 |  |
| 격자 계획 단계의 다운워시 제약: xy 가 같은 두 로봇은 \|Δz\| ≥ 2 r_z (P6, P7) (`discrete-downwash-constraint`) | `\|z_i - z_j\| \ge 2 r_z` | Sec. IV-B (Unlabeled Planner), 성질 P6-P7, arXiv PDF p. 3 | 예 |  |
| 시뮬레이션 최대 200대, 실기 32대(Crazyflie). 이산 계획 격자 한 변 0.5 m (`experiments`) | 200 / 32 / 0.5 m | Abstract; Sec. VI-C (Flight Test), arXiv PDF p. 1, 6 | 예 |  |

## 4. Bitcraze Loco Positioning System 문서 (시스템 페이지 + lps-node-firmware 문서)

- id: `lps-docs`
- 서지: Bitcraze AB, "Loco Positioning system" (system documentation) and lps-node-firmware repository documentation (master, commit bf0f5be, 2026-11-10), bitcraze.io / github.com/bitcraze/lps-node-firmware
- 실제로 연 URL:
  - https://www.bitcraze.io/documentation/system/positioning/loco-positioning-system/
  - https://www.bitcraze.io/documentation/system/positioning/ (Positioning Systems Overview, 비교표)
  - https://www.bitcraze.io/documentation/system/positioning/max-range-loco/
  - https://www.bitcraze.io/products/loco-positioning-node/ , https://www.bitcraze.io/products/loco-positioning-deck/
  - https://raw.githubusercontent.com/bitcraze/lps-node-firmware/master/docs/functional-areas/tdoa_principles.md
  - .../docs/functional-areas/tdoa2-vs-tdoa3.md , .../tdoa3_implementation.md
  - .../docs/protocols/tdoa2_protocol.md , .../tdoa3_protocol.md , .../twr-protocol.md
  - .../docs/user-guides/anchor-setup.md , .../twr-reference-setup.md , .../tdoa3_setup.md , .../tdoa3_long_range.md , .../configure-mode.md
  - https://raw.githubusercontent.com/bitcraze/lps-node-firmware/master/src/uwb_tdoa_anchor2.c , .../src/uwb_tdoa_anchor3.c (상수 확인)
  - (위 raw 마크다운은 https://www.bitcraze.io/documentation/repository/lps-node-firmware/master/ 에 같은 경로로 게시되는 원본임)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| LPS 는 TWR, TDoA 2, TDoA 3 세 가지 측위 모드를 구현 (`three-modes`) | 3 모드 | 시스템 페이지 'Positioning modes' 절 | 예 |  |
| TWR: 태그가 앵커를 차례로 핑(ping)해 태그-앵커 거리를 측정. 가장 정확한 모드이고 앵커가 둘러싼 공간 밖에서도 동작 (`twr-description`) | — | 시스템 페이지 'Positioning modes' 절 | 예 | TWR 메시지는 4개(POLL/ANSWER/FINAL/REPORT): protocols/twr-protocol.md |
| TWR 에서는 태그가 시간 슬롯 방식으로 앵커와 능동 통신하므로 한 번에 태그(Crazyflie) 1대만, 앵커는 최대 8개 (`twr-tag-limit`) | 1 태그 | 시스템 페이지 'Positioning modes' 절 | 예 | 펌웨어에는 여러 태그용 TDMA 옵션(crazyflie-firmware lpsTdma.h, CONFIG_DECK_LOCO_TDMA)이 있으나 문서 본문은 '1대'라고만 씀. |
| TWR 로 3D 위치를 구하는 이론적 최소 앵커 수는 4, 현실적으로는 6 (여유와 정확도) (`twr-min-anchors`) | 4 (이론) / 6 (현실) 개 | 시스템 페이지 'Positioning modes' 절 | 예 | Loco Positioning node 제품 페이지: 3D 최소 4개, 최대 8개 지원. Positioning Systems Overview: '최소 4, 가급적 8'. TWR 6앵커 / TDoA 8앵커 기준 배치는 user-guides/twr-reference-setup.md. |
| TDoA 에서 태그는 수동으로 듣기만 하므로 태그가 늘어도 시스템 부하가 늘지 않고, 동시에 측위할 수 있는 태그 수에 제한이 없음 (군집용) (`tdoa-passive-unlimited-tags`) | — | 시스템 페이지 'Positioning modes' 절 (TDoA 2 문단); functional-areas/tdoa_principles.md 서두와 'Tags' 절 | 예 | tdoa_principles 는 태그를 'UWB sniffer' 로 설명하고 GPS 수신기에 비유. |
| TDoA 2 는 앵커 시스템이 시간 슬롯·동기화 방식이라 앵커 수가 8개로 제한. 슬롯 8개, 앵커 0 이 마스터 (`tdoa2-max-anchors`) | 8 개 | 시스템 페이지 'Positioning modes'; functional-areas/tdoa2-vs-tdoa3.md 'Nr of anchors' 절; protocols/tdoa2_protocol.md | 예 | 앵커 0 은 단일 장애점이며 모든 앵커가 앵커 0 의 도달 범위 안에 있어야 함 (tdoa2-vs-tdoa3.md). |
| TDoA 2 TDMA: 슬롯 길이 2 ms, 프레임당 슬롯 8개, 프레임 길이 16 ms (`tdoa2-slot-timing`) | 2 / 8 / 16 ms / 슬롯 / ms | protocols/tdoa2_protocol.md 'Packet scheduling' 절; src/uwb_tdoa_anchor2.c 의 NSLOTS 8, TDMA_SLOT_BITS 26 (주석 '2ms timeslot') | 예 | 앵커 1개당 송신율 1/16 ms = 62.5 Hz, 시스템 전체 500 패킷/s 는 유도값. |
| TDoA 는 앵커들의 볼록 껍질(convex hull) 안에서 정확도가 좋고 밖으로 나가면 빠르게 나빠짐. TDoA 2 는 비행 공간 모서리에 앵커 8개를 둘 때 가장 잘 동작하고 그 안에서는 TWR 와 비슷한 정확도 (`tdoa2-convex-hull`) | — | functional-areas/tdoa_principles.md 'Geometry' 절; 시스템 페이지 'Positioning modes'; protocols/tdoa2_protocol.md 'System architecture' | 예 |  |
| TDoA 3 는 시간 슬롯 대신 무작위 송신 일정을 써서 앵커를 더 추가할 수 있고, 모든 앵커가 서로 보이지 않아도 큰 공간/여러 방으로 확장 가능. 마스터 없음. 앵커의 추가·손실을 동적으로 처리 (`tdoa3-scalable`) | — | 시스템 페이지 'Positioning modes' (TDoA 3 문단); functional-areas/tdoa2-vs-tdoa3.md; protocols/tdoa3_protocol.md 'Design goals' | 예 | 앵커 수 상한은 문서에 숫자로 없음(서로 다른 id 만 쓰면 됨; 패킷의 id 필드는 8비트). 설계상 어느 지점에서든 5-10개 앵커가 범위 안에 있어야 하고(tdoa3_protocol.md), 한 장치에 동시에 보이는 앵커는 15-20개 이하를 가정(tdoa3_implementation.md 'Storage'). |
| 패킷 충돌을 감수하므로 TDoA 2 의 정밀도가 TDoA 3 보다 약간 좋음 (`tdoa3-precision`) | — | functional-areas/tdoa2-vs-tdoa3.md 'Precision' 절 | 예 |  |
| TDoA 3 앵커 펌웨어 상수: 시스템 전체 송신율 400 Hz(저비트율 200 Hz), 앵커당 최대 50 Hz, 최소 20 Hz (`tdoa3-tx-rates`) | 400 / 50 / 20 Hz | lps-node-firmware src/uwb_tdoa_anchor3.c: SYSTEM_TX_FREQ_HIGH_BITRATE 400.0, SYSTEM_TX_FREQ_LOW_BITRATE 200.0, ANCHOR_MAX_TX_FREQ 50.0, ANCHOR_MIN_TX_FREQ 20.0 (lps-node-firmware master @ bf0f5be (2026-11-10), 약 90-97행) | 예 | 문서 본문이 아니라 소스 코드 상수임. 화면에 쓸 때 '코드 상수'라고 밝힐 것. |
| LPS 는 Decawave DWM1000 기반이며 정확도는 '10 cm 수준'. 3D 측위 성능은 설치와 환경에 따라 달라짐 (`accuracy`) | 10 cm (수준) | 시스템 페이지 'Performance' 절 | 예 | 제품 페이지: 거리 측정 정확도 ±10 cm (DWM1000 사양 기준). Positioning Systems Overview 비교표는 LPS 정확도를 'dm' 으로 표기. TDoA 전용 정확도 수치는 문서에 없음. |
| 최대 시험 거리 10 m (제품 페이지). 표준 설정 실내 실측 8-10 m(기체 수평) / 15-16 m(수직). TDoA 3 Long Range 는 체계적 측정은 없지만 30-40 m 정도로 추정 (`range`) | 10 m | Loco Positioning node/deck 제품 페이지 'Ranging specification'; max-range-loco 페이지 'Results'; user-guides/tdoa3_long_range.md | 예 | Positioning Systems Overview 비교표는 최대 영역 '50x50 m (not tested)'. max-range 측정은 저자 스스로 '과학적이지 않은 간단한 측정'이라고 밝힘. |
| TWR 거리 측정률 500 Hz 를 모든 앵커가 나눠 씀 (앵커 6개면 앵커당 약 80 Hz) (`twr-ranging-rate`) | 500 Hz | Loco Positioning deck 제품 페이지 'Ranging specification' | 예 |  |
| 앵커 위치는 Crazyflie 클라이언트의 LPS 탭으로 설정하며(Loco 덱을 단 Crazyflie 가 중계), 앵커의 비휘발성 메모리에 저장되어 송신 패킷에 포함됨 (`anchor-position-config`) | — | user-guides/anchor-setup.md 마지막 문단; functional-areas/tdoa_principles.md 'Position data' 절; user-guides/tdoa3_setup.md 'Setting anchor positions' | 예 | TDoA 3 의 큰 시스템에서는 한 위치에서 모든 앵커에 닿지 않을 수 있어 Crazyflie 를 앵커 가까이 옮겨야 할 수 있음 (tdoa2-vs-tdoa3.md 'Client support'). |
| 앵커는 벽·천장에서 15 cm 이상 띄우고, 기준 배치를 따르지 않으면 서로 2 m 이상, 서로 다른 높이에 배치 (`anchor-placement`) | 15 cm / 2 m | user-guides/anchor-setup.md | 예 | Long Range 문서: 좋은 3D 추정을 위해 (가로 또는 세로)/높이 비가 3 이하가 되도록 권장 (user-guides/tdoa3_long_range.md 'Limitations'). |
| TDoA 전용 최소 앵커 수 (`tdoa-min-anchors`) | — | 명시 없음 | **아니오** | 문서는 TDoA 2 가 '8개에서 가장 잘 동작'하고 최대 8개라고만 함. '최소 4'는 TWR/일반 3D 측위에 대한 서술임. |
| LPS 시스템 지연(latency) 수치 (`system-latency`) | — | 찾지 못함 | **아니오** | 열어 본 LPS 문서 어디에도 지연 수치가 없음. |

## 5. Bitcraze crazyflie-firmware 문서와 소스 (Loco 칼만 측정 모델, 상태추정기)

- id: `cf-firmware-docs`
- 서지: Bitcraze AB, crazyflie-firmware repository documentation and source (master, commit d794c5c, 2026-11-16): "Loco kalman measurment model", "State estimation"; github.com/bitcraze/crazyflie-firmware
- 실제로 연 URL:
  - https://raw.githubusercontent.com/bitcraze/crazyflie-firmware/master/docs/functional-areas/loco-positioning-system/kalman_measurement_models.md
  - .../docs/functional-areas/loco-positioning-system/index.md , .../tdoa3_hybrid_mode.md
  - .../docs/functional-areas/sensor-to-control/state_estimators.md
  - .../src/utils/interface/tdoa/tdoaEngine.h , .../src/deck/drivers/src/lpsTdoa2Tag.c , lpsTdoa3Tag.c , lpsTwrTag.c
  - .../src/modules/src/estimator/estimator_kalman.c , .../src/modules/interface/kalman_core/kalman_core.h
  - .../src/modules/src/kalman_core/mm_tdoa.c , .../src/modules/src/outlierfilter/outlierFilterTdoa.c
  - .../src/modules/interface/stabilizer_types.h , .../src/utils/interface/physicalConstants.h , .../src/deck/drivers/interface/locodeck.h , lpsTdma.h
  - (raw 마크다운은 bitcraze.io/documentation/repository/crazyflie-firmware/master/ 에 게시되는 원본. 줄 번호는 위 커밋 기준 근사)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| TWR 측정 모델: 앵커 i 까지의 유클리드 거리. EKF 야코비안은 위치 성분만 (x−x_i)/d_i 꼴이고 H 는 9성분 벡터 (`twr-measurement-model`) | `d_i=\sqrt{(x-x_i)^2+(y-y_i)^2+(z-z_i)^2},\quad g_x=\frac{x-x_i}{d_i}\ (\text{y, z 동일}),\quad H=(g_x,g_y,g_z,0,0,0,0,0,0)` m | 문서 'Loco kalman measurment model' > 'Two-way ranging (TWR)' 절 | 예 | 갱신은 kalman_core.c 의 kalmanCoreScalarUpdate() 호출. |
| TDoA 측정 모델: 두 앵커 i, j 까지 거리의 차 d_ij = d_j − d_i (`tdoa-measurement-model`) | `d_{ij}=d_j-d_i=\sqrt{(x-x_j)^2+(y-y_j)^2+(z-z_j)^2}-\sqrt{(x-x_i)^2+(y-y_i)^2+(z-z_i)^2},\quad g_x=\frac{x-x_j}{d_j}-\frac{x-x_i}{d_i}` m | 문서 'Loco kalman measurment model' > 'Time-difference-of-arrival (TDoA)' 절; 코드 mm_tdoa.c (predicted = d1 − d0) | 예 |  |
| TDoA 측정은 TWR 보다 잡음이 커서 측위 정확도가 낮음. TDoA 3 는 정확도를 내주고 확장성을 얻음 (`tdoa-noisier`) | — | 문서 'Loco kalman measurment model' > TDoA 절 | 예 |  |
| M-추정 기반 강건 칼만 필터 옵션: 다중경로·NLOS 이상치의 영향을 줄이려 G-M(Geman-McClure) 강건 비용함수와 IRLS(최대 2회 반복)를 사용. 파라미터 kalman.robustTwr / kalman.robustTdoa 로 켬 (`robust-estimation`) | 2 최대 반복 | 문서 'Loco kalman measurment model' > 'M-estimation based robust Kalman filter' 절; 구현 mm_distance_robust.c, mm_tdoa_robust.c | 예 | 기본값은 꺼짐: estimator_kalman.c 의 static bool robustTwr = false; robustTdoa = false; (약 128-129행). |
| 강건 필터 구현의 근거 논문으로 문서가 인용: Zhao, Panerati, Schoellig, IEEE RA-L 6(2), 2021, pp. 3639-3646 (`robust-reference`) | Zhao, Panerati, Schoellig, RA-L 6(2):3639-3646, 2021 | 문서 'Loco kalman measurment model' > References [1] | 예 | 인용 사실만 확인. 해당 RA-L 논문 자체는 열어 보지 않음. |
| EKF 내부 상태는 9차원: X, Y, Z (전역 좌표 위치), PX, PY, PZ (기체 좌표 속도), D0, D1, D2 (자세 오차) (`kalman-state`) | 9 차원 | src/modules/interface/kalman_core/kalman_core.h 의 kalmanCoreStateIdx_t 와 주석 (약 62-80행) | 예 | 문서 본문에는 상태 목록이 없고 H 벡터가 9성분이라는 것만 나옴 → 코드로 확인. 근거 논문으로 Mueller, Hamer, D'Andrea (ICRA 2015) 인용 (state_estimators.md References [1]). |
| 칼만 예측 단계는 100 Hz (IMU 갱신 1000 Hz 보다 느리다고 주석) (`kalman-predict-rate`) | 100 Hz | src/modules/src/estimator/estimator_kalman.c: #define PREDICT_RATE RATE_100_HZ (약 119행) | 예 | 문서가 아니라 소스 코드 상수. |
| 안정화 메인 루프 1000 Hz, 자세 제어 500 Hz, 위치 제어 100 Hz (`main-loop-rate`) | 1000 / 500 / 100 Hz | src/modules/interface/stabilizer_types.h: RATE_MAIN_LOOP RATE_1000_HZ, ATTITUDE_RATE RATE_500_HZ, POSITION_RATE RATE_100_HZ (약 371-373행) | 예 | 문서가 아니라 소스 코드 상수. Crazyswarm(2017) 논문의 500 Hz 온보드 루프는 당시 전용 펌웨어 기준. |
| TDoA 측정 잡음 표준편차 기본값 0.15 m (Long Range 빌드에서는 0.30 m) (`tdoa-noise-std`) | 0.15 m | src/utils/interface/tdoa/tdoaEngine.h: TDOA_ENGINE_MEASUREMENT_NOISE_STD 0.15f / 0.30f (약 8-12행); lpsTdoa2Tag.c 'static float stdDev = TDOA_ENGINE_MEASUREMENT_NOISE_STD' (약 98행); lpsTdoa3Tag.c (약 669행) | 예 | 런타임 파라미터(stddev)로 바꿀 수 있음. |
| TWR 거리 측정 잡음 표준편차 0.25 m (이름 있는 상수가 아니라 리터럴) (`twr-noise-std`) | 0.25 m | src/deck/drivers/src/lpsTwrTag.c: dist.stdDev = 0.25; (약 262행); TDoA3 하이브리드 모드의 ctx.twrStdDev = 0.25 (lpsTdoa3Tag.c 약 680행) | 예 |  |
| TWR 이상치 제거: 앵커별 최근 32개 거리의 평균에서 4σ 이상 벗어난 측정은 추정기에 넣지 않음 (`twr-outlier-filter`) | 32 / 4 표본 / σ | src/deck/drivers/src/lpsTwrTag.c: RANGING_HISTORY_LENGTH 32, OUTLIER_TH 4 (약 102-103, 240-255행) | 예 |  |
| TDoA 이상치 필터: 두 앵커 사이 거리보다 큰(물리적으로 불가능한) TDoA 는 버림. 필터가 닫힌 상태에서는 \|오차\| < 2.5·stdDev 인 표본만 통과. 좋은 표본 비율을 300 ms 크기의 적분기로 추적해 10% 아래면 열고 90% 위면 닫음 (`tdoa-outlier-filter`) | 2.5 x stdDev | src/modules/src/outlierfilter/outlierFilterTdoa.c (acceptedDistance = stdDev*2.5, integratorTriggerDistance = stdDev*2.0, INTEGRATOR_SIZE 300); mm_tdoa.c 에서 호출 | 예 | 기본 stdDev 0.15 m 이면 통과 한계는 0.375 m (유도값). 개념 설명은 lps-node-firmware 문서 tdoa3_implementation.md 'Error management'. |
| Loco 덱처럼 완전한 자세·위치 추정 정보를 주는 덱에서는 EKF 를 사용 (기본 추정기는 상보 필터) (`ekf-for-loco`) | — | 문서 'State estimation' > 'Complementary filter', 'Extended Kalman filter' 절 | 예 | 실험적 UKF 도 TDoA 융합을 지원한다고 같은 문서에 서술. |
| 펌웨어 TWR 태그는 비대칭 DS-TWR 식으로 전파 시간을 계산 (`twr-formula-in-firmware`) | `t_{prop}=\frac{t_{round1}t_{round2}-t_{reply1}t_{reply2}}{t_{round1}+t_{round2}+t_{reply1}+t_{reply2}}` 라디오 틱 | src/deck/drivers/src/lpsTwrTag.c (약 230-237행): tprop_ctn 계산 후 LOCODECK_TS_FREQ 로 나눔 | 예 |  |

## 6. Crazyflie 2.1 Brushless 데이터시트 (Rev 3)

- id: `cfbl-datasheet`
- 서지: Bitcraze AB, "Datasheet Crazyflie 2.1 brushless - Rev 3" (history: version 3, 2025-01-11), 3 pages.
- 실제로 연 URL:
  - https://www.bitcraze.io/documentation/hardware/crazyflie_2_1_brushless/crazyflie_2_1_brushless-datasheet.pdf (PDF 3쪽 전부)
  - https://www.bitcraze.io/products/crazyflie-2-1-brushless/ (제품 페이지, 데이터시트 링크 출처이자 같은 사양 표)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| 데이터시트 개정: Rev 3 (2025-01-11). Rev 2 (2024-12-09)에서 무게가 갱신됨 (`revision`) | Rev 3 | 각 쪽 머리말; Sec. 13 History, p. 3 | 예 |  |
| 이륙 중량(랜딩 레그 장착): 34 g (`takeoff-weight-legs`) | 34 g | Sec. 8 Mechanical specifications, p. 2 | 예 | Sec. 1 Introduction (p. 1)은 '무게 32 g' 이라고 써서 같은 문서 안에서 숫자가 다름. 계산에는 34/37 g 을 쓸 것. |
| 이륙 중량(프로펠러 가드 장착): 37 g (`takeoff-weight-guards`) | 37 g | Sec. 8, p. 2 | 예 |  |
| 프레임 크기: 모터 중심 간 대각 100 mm (`frame-size`) | 100 mm | Sec. 8, p. 2 | 예 |  |
| 기본 배터리 비행 시간: 10분 (`flight-time`) | 10 min | Sec. 5 Flight specifications, p. 1 | 예 | 충전 시간 60분 (같은 절). |
| 권장 최대 탑재 중량: 40 g (`max-payload`) | 40 g | Sec. 5 (p. 2 상단으로 이어짐) | 예 |  |
| 모터: 08028-10000KV 브러시리스 4개, 각 최대 추력 30 g (`motor`) | 08028-10000KV | Sec. 5, p. 1 | 예 | ESC: 1셀 5 A, BLHeli_S/Bluejay. 프로펠러 55 mm, 피치 35 mm. |
| 배터리: 350 mAh LiPo (1셀) (`battery`) | 350 mAh | Sec. 10 Package contents, p. 3 | 예 | 용량은 패키지 구성품 목록에만 나옴. 1셀은 ESC 사양(1-cell)에서. |
| MCU: STM32F405 (Cortex-M4, 168 MHz) + nRF51822 (라디오·전원 관리). 2.4 GHz ISM 대역 라디오, 20 dBm 증폭기, Crazyradio PA 와 LOS 1 km 초과 시험, BLE 지원 (`mcu-radio`) | 2.4 GHz / nRF51822 | Sec. 3 Onboard microcontrollers (p. 1), Sec. 6 Radio specification (p. 2) | 예 |  |
| IMU: 3축 가속도계/자이로 BMI088, 기압계 BMP388 (`imu`) | BMI088 / BMP388 | Sec. 4 IMU specification, p. 1 | 예 |  |
| 라디오 데이터율(예: 2 Mbit/s) (`radio-data-rate`) | — | 데이터시트에 없음 | **아니오** | Rev 3 에는 데이터율이 적혀 있지 않음. 2 Mbit/s 는 Crazyswarm(2017) Sec. III 의 Crazyradio PA 서술과 Crazyswarm2 예시 URI(radio://0/80/2M/...)에서만 확인됨. |
| 최대 속도 (`max-speed`) | — | 데이터시트에 없음 | **아니오** | Rev 3 과 제품 페이지 어디에도 최대 속도 수치가 없음. |

## 7. Crazyswarm2 문서 (imrclab.github.io/crazyswarm2)

- id: `crazyswarm2-docs`
- 서지: IMRC Lab, "Crazyswarm2: A ROS 2 testbed for Aerial Robot Teams" documentation (version string 1.0a1) and repository IMRCLab/crazyswarm2 (main, commit 6b31e8c, 2026-11-20).
- 실제로 연 URL:
  - https://imrclab.github.io/crazyswarm2/index.html , overview.html , installation.html , usage.html , tutorials.html , howto.html , faq.html
  - https://raw.githubusercontent.com/IMRCLab/crazyswarm2/main/crazyflie/config/crazyflies.yaml , .../server.yaml
  - .../crazyflie_interfaces/srv/UploadTrajectory.srv , StartTrajectory.srv ; .../crazyflie_py/crazyflie_py/crazyflie.py
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| Crazyswarm2 는 ROS 2 스택이며 원래 Crazyswarm 의 ROS 2 포팅. MIT 라이선스 오픈소스 (`ros2-based`) | ROS 2 | index 페이지 첫 문단 | 예 |  |
| 지원 기체에 Crazyflie 2.1 Brushless 가 명시됨. Brushless 와 Bolt 는 비행 전 arming 필요 (`brushless-supported`) | — | index 페이지 첫 문단; usage 페이지 'Arming' 절 | 예 | arming 방법: 조이스틱, Python 스크립트(arming.py 예제), ROS 서비스 /cfXXX/arm 또는 /all/arm. |
| 여러 기체 설정은 crazyflie/config/crazyflies.yaml: robots 아래 기체별 enabled, uri, initial_position, type; robot_types; 전체 공통은 all (`multi-cf-config`) | crazyflies.yaml | usage 페이지 'Configuration' > 'crazyflies.yaml' 절; 저장소 crazyflie/config/crazyflies.yaml | 예 | 예시 URI: radio://0/80/2M/E7E7E7E7E7. 설정 우선순위: 개별 기체 > robot_types > all. |
| 서버 백엔드 4종: cpp (crazyflie-link-cpp 기반), cflib (crazyflie-lib-python 기반), cflib2 (개발 중, takeoff/land 만), sim (`backends`) | cpp / cflib / cflib2 / sim | overview 페이지 'Crazyflie server' 절과 'Support functionality with backends' 표 | 예 | 브리프의 3종(cpp/cflib/sim)에 cflib2 가 추가되어 있음. |
| 시뮬레이터 패키지 이름은 crazyflie_sim. 펌웨어 코드를 SIL(software-in-the-loop)로 사용하고 서버와 같은 ROS 인터페이스 제공 (`sim-package`) | crazyflie_sim | overview 페이지 'Explanation per package', 'Simulation' 절; usage 페이지 'Simulation' 절 | 예 | 실행 예: ros2 launch crazyflie launch.py backend:=sim |
| 궤적 API: 서비스 UploadTrajectory / StartTrajectory, Python 메서드 uploadTrajectory(trajectoryId, pieceOffset, trajectory), startTrajectory(...). 다항식 궤적(8차) (`trajectory-api`) | — | overview 페이지 'Upload / Start trajectory'; howto 페이지 'Generate Trajectories'; 저장소 crazyflie_interfaces/srv/*.srv, crazyflie_py/crazyflie_py/crazyflie.py | 예 | StartTrajectory.srv 필드: group_mask, trajectory_id, timescale, reversed, relative. 전체 대상 서비스는 all/start_trajectory. |
| LPS 는 cpp, cflib 백엔드에서 지원. 온보드 측위(LPS 등)를 쓸 때는 motion_capture tracking 을 'vendor' 로 두어 모캡을 끄고 pose 로깅을 켜도록 안내 (`lps-supported`) | — | overview 페이지 기능 표 'Positioning System > LPS'; usage 페이지 'Onboard positioning' 절 | 예 |  |
| 기본 로그 토픽: pose, scan, odom, status, imu. 문서 예시와 기본 설정에서 pose 주파수 10 Hz (저장소 기본 설정은 status 1 Hz 도 포함) (`pose-topic-rate`) | 10 Hz | usage 페이지 'crazyflies.yaml' 절의 all.firmware_logging 예시; 저장소 crazyflies.yaml | 예 | 문서 예시는 firmware_logging.enabled: false, 저장소 기본 파일은 enabled: true 로 서로 다름. |
| Crazyswarm2 는 가능한 한 방송(broadcast) 통신을 써서 기체당 필요한 라디오 수를 줄임 (공식 SDK 는 유니캐스트). 방송은 cpp 백엔드만 지원 (`broadcasts`) | — | faq 페이지 'How is Crazyswarm2 different from Bitcraze's cflib?' > Broadcasts; overview 페이지 기능 표 'Broadcasts' 행 | 예 | 저장소 crazyflies.yaml 기본값: all.broadcasts.num_repeats 15, delay_between_repeats_ms 1. |
| 알려진 한계: 유니캐스트 패킷이 가끔 손실됨 (펌웨어 버그) (`known-limitation`) | — | index 페이지 Warning 상자 | 예 |  |
| 라디오 1개당 권장/최대 기체 수 (`crazyflies-per-radio`) | — | 문서에 없음 | **아니오** | 열어 본 7개 페이지에 라디오당 대수 서술이 없음. overview 는 '하나 이상의 Crazyradio 로 여러 Crazyflie 를 연결'이라고만 함. |
| 지연(latency) 측정값 (`latency`) | — | 문서에 없음 | **아니오** | 측정값은 없음. 관련 서술은 (a) installation: 가상머신은 지연을 늘리므로 피하라, (b) server.yaml 경고 임계값 max_unicast_latency: 10.0 ms, 모캡 경고 범위 80-120 Hz — 임계값이지 성능 수치가 아님. |

## 8. Bitcraze 블로그 (2016-11-28) — TDoA 첫 군집 비행

- id: `bitcraze-tdoa-blog`
- 서지: Arnaud (Bitcraze), "First Crazyflie swarm flying with TDoA in Loco Positioning Sytem" [sic], Bitcraze blog, 2016-11-28.
- 실제로 연 URL:
  - https://www.bitcraze.io/2016/11/first-crazyflie-swarm-flying-with-tdoa-in-loco-positioning-sytem/
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| 게시일 2016-11-28, 작성자 Arnaud. 제목 원문에 'Sytem' 오타가 있고 URL 도 '...positioning-sytem/' (`date-url`) | 2016-11-28 | 글 머리의 날짜·작성자 표시 | 예 | 글 속 트윗 날짜는 2016-11-25 (비행한 금요일). |
| TDoA 측정으로 Crazyflie 2.0 5대를 군집 비행. 목요일 1대, 금요일 3대 → 5대 (`num-drones-tdoa`) | 5 대 | 본문 1문단, 4문단 | 예 |  |
| TWR 는 각 Crazyflie 가 앵커를 핑하려 능동 송신해야 하므로 기체가 늘수록 공중 시간을 나눠 써 기체당 거리 측정이 줄어듦 → 확장되지 않음 (`twr-not-scalable`) | — | 본문 2문단 | 예 |  |
| TDoA 는 앵커가 보내는 단방향 패킷만으로 구현되므로 Crazyflie 는 송신할 필요가 없고, 1대가 되면 원하는 만큼 늘릴 수 있음. 대신 앵커 시계 동기화가 필요해 더 어려움 (`tdoa-scales`) | — | 본문 3문단 | 예 |  |
| 측정률·정확도 수치 (`rates-accuracy`) | — | 글에 없음 | **아니오** | 이 글에는 주파수나 정확도 숫자가 없음. 당시 TDoA 모드는 '매우 실험적'이라고만 표현. |

## 9. Zhao, Goudar, Qiao, Schoellig — UTIL 데이터셋

- id: `util2022`
- 서지: W. Zhao, A. Goudar, X. Qiao, and A. P. Schoellig, "UTIL: An ultra-wideband time-difference-of-arrival indoor localization dataset," The International Journal of Robotics Research, vol. 43, no. 10, pp. 1443-1456, 2024. doi:10.1177/02783649241230640. arXiv:2203.14471v6 (2024-02-05).
- 실제로 연 URL:
  - https://arxiv.org/pdf/2203.14471 (v6, 12쪽)
  - https://utiasdsl.github.io/util-uwb-dataset/ → https://learnsyslab.github.io/util-uwb-dataset/ 로 리다이렉트
  - https://api.github.com/repos/utiasDSL/util-uwb-dataset (현재 learnsyslab/util-uwb-dataset 로 이전됨), 루트 파일 목록, README.md
  - https://api.crossref.org/works?query.bibliographic=... (IJRR 서지)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| IJRR 43권 10호, 1443-1456쪽 (2024), DOI 10.1177/02783649241230640. arXiv 최신판 v6 (`biblio`) | 10.1177/02783649241230640 | Crossref 레코드; 저장소 README 의 BibTeX; arXiv PDF 1쪽 | 예 | arXiv 번호는 2203(2022년)이지만 학술지 게재 연도는 2024. 쪽 번호는 arXiv v6 PDF 기준으로 적음. |
| 데이터셋은 두 부분: (i) LOS/NLOS 조건의 UWB TDOA 식별(identification) 데이터 — SNR, 전력 차, 원시 TDOA; (ii) 약 150분의 쿼드로터 비행 데이터 — UWB TDOA, IMU, 광류, ToF 고도, 기압계, mm 급 Vicon 정답 자세 (`contents`) | 150 분 (비행 누적, 약) | Abstract; Sec. 1 (Introduction), arXiv PDF p. 1-2; Sec. 4.3.4, 5.2 | 예 | 평균 비행 속도 0.45 m/s. 기체는 Crazyflie Bolt 기반 자작 쿼드로터 (Sec. 4.3.2). |
| Decawave DWM1000 모듈 기반 Bitcraze LPS 로 수집 (`hardware`) | DWM1000 / LPS | Sec. 3.1 (UWB Sensor), p. 3 | 예 |  |
| 비행장 크기 약 7.0 m x 8.0 m x 3.5 m. 정답은 Vicon Vantage+ 카메라 10대, 200 Hz (`arena`) | 7.0 x 8.0 x 3.5 m | Sec. 4.3.1 (Indoor Flight Arena), p. 6; Sec. 4.1, 4.3.4 | 예 |  |
| 각 배치(constellation)마다 UWB 앵커 8개. 앵커 위치는 Leica 토털 스테이션으로 측량 (좌표 정합 RMSE 약 1.12 mm) (`num-anchors`) | 8 개 | Sec. 3 서두 (p. 3), Sec. 4.3.1 (p. 6) | 예 | 식별 실험은 앵커 2개 + 태그 1개 (Sec. 4.2). |
| 앵커 배치 4종. 배치 #1-#3 은 LOS 에서 궤적 6종, 배치 #4 는 정적 장애물 환경 3종 + 동적 금속 장애물 환경 2종, 궤적 3종 (`constellations`) | 4 종 | Sec. 4.3.1, 4.3.4 + Fig. 10, p. 6-8 | 예 |  |
| NLOS 장애물 재질: 골판지, 금속, 목재, 플라스틱, 폼 (장애물 6개). 동적 장애물은 사람이 손으로 옮긴 금속 캐비닛 (사람 몸도 동적 장애물로 작용) (`nlos-obstacles`) | cardboard, metal, wood, plastic, foam | Sec. 4.2.2 + Fig. 7 (p. 5); Sec. 4.3.4 (p. 8) | 예 |  |
| 중앙집중식 TDOA(= Bitcraze TDoA 2)와 분산식 TDOA(= TDoA 3) 두 모드 모두 같은 궤적으로 수집. 중앙집중식은 통신 제약과 단일 장애점 문제, 분산식은 확장성 (`tdoa-modes`) | TDoA2 / TDoA3 | Sec. 3.1 (p. 3); Sec. 4.3.4 (p. 8); Sec. 7.2 (p. 9) | 예 | 식별 데이터는 TDoA 3 모드로 수집 (Sec. 4.2). |
| TDOA 는 앵커-태그 양방향 통신이 필요 없어 이론상 무제한 수의 장치 측위 가능 (`tdoa-unlimited-devices`) | — | Sec. 1 (Introduction), p. 1-2 | 예 |  |
| LOS 식별 실험: 앵커-태그 거리 0.5-6.5 m (0.5 m 간격), 두 앵커 사이 각도 180°→15° (15° 간격) (`los-test-ranges`) | 0.5-6.5 m / 180-15° | Sec. 4.2.1, p. 5 | 예 |  |
| 벤치마크(ESKF, 배치 추정; IMU + TDOA): 장애물 없는 배치 #1-#3 에서 위치 오차 약 10 cm. 배치 #4 에서는 장애물로 인한 측정 오차 때문에 크게 나빠짐 (`benchmark-accuracy`) | 10 cm (약) | Sec. 6 (Development Kit and Benchmark) + Table 4, p. 9 | 예 | Table 4 의 개별 RMSE 값은 옮겨 적지 않음(텍스트 추출로는 열 대응을 보장할 수 없었음). |
| 정적 장애물은 반복 궤적에서 일관된 측정 편향을 만들고, 동적 NLOS 에서는 오차가 일관되지 않음. 심한 NLOS 에서는 측정이 완전히 막힘. DW1000 은 자세 의존적 체계 편향이 있다고 선행 연구를 인용 (`nlos-bias-behaviour`) | — | Sec. 7.2 + Fig. 13, p. 9-10; Sec. 4.3.1 | 예 | 정성적 서술임. |
| LOS/NLOS 측정 편향·잡음의 구체적 수치(평균, 표준편차) (`bias-noise-numbers`) | — | 본문에 숫자로 없음 | **아니오** | 측정 오차는 Fig. 6(LOS), Fig. 8(금속 NLOS 히스토그램), Fig. 13 에 그림으로만 제시됨. 본문 텍스트에는 평균·표준편차 수치가 없어 그림을 눈으로 읽지 않고는 인용할 수 없음. |
| 저자들은 Crazyswarm 과 같은 구성이라며 단일 기체 지연 약 11 ms 를 Crazyswarm 논문 Sec. XI-A 에서 인용 (`latency`) | 11 ms (약, 인용) | Sec. 4.3.3 (Calibration and Latency), p. 7 | 예 | 이는 모션캡처 정답 전송 경로의 지연이지 UWB 측위 지연이 아님. |
| 데이터셋·개발 키트 URL: https://utiasdsl.github.io/util-uwb-dataset/ (현재 learnsyslab.github.io 로 리다이렉트). 데이터는 GitHub 릴리스 dataset-v1.0 (`dataset-url`) | https://utiasdsl.github.io/util-uwb-dataset/ | Abstract (p. 1); 프로젝트 페이지의 다운로드 링크 | 예 | GitHub 저장소도 utiasDSL → learnsyslab/util-uwb-dataset 로 이전됨 (API 응답의 full_name). |
| 데이터셋 라이선스 (`dataset-license`) | — | 찾지 못함 (라이선스 표기 없음) | **아니오** | 저장소 루트에 LICENSE 파일이 없음(파일 목록: .gitignore, README.md, ros_ws, scripts, setup_files, setupscript.bash; raw LICENSE 는 404). GitHub API 의 license 필드는 null. README, 프로젝트 페이지, 논문 본문에도 라이선스 문구가 없음. 재배포·가공 전에 저자에게 확인 필요. |

## 10. arXiv:2412.12427 — UWB TDOA 실내 측위: 센서 배치에서 시스템 평가까지

- id: `arxiv-2412-12427`
- 서지: W. Zhao, A. Goudar, M. Tang, and A. P. Schoellig, "Ultra-wideband Time Difference of Arrival Indoor Localization: From Sensor Placement to System Evaluation," arXiv:2412.12427v2 [cs.RO], 18 Feb 2026 (v1: 17 Dec 2024).
- 실제로 연 URL:
  - https://arxiv.org/pdf/2412.12427 (v2, 9쪽)
  - https://export.arxiv.org/api/query?id_list=2412.12427 (메타데이터)
  - https://api.crossref.org/works?query.bibliographic=... (같은 제목의 레코드)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| 실제 제목·저자: 'Ultra-wideband Time Difference of Arrival Indoor Localization: From Sensor Placement to System Evaluation', Zhao, Goudar, Tang, Schoellig. UWB TDOA 앵커 배치를 다루는 논문이 맞음 (`identity`) | arXiv:2412.12427v2 | arXiv PDF p. 1; arXiv API 메타데이터 (v1 2024-12-17, v2 2026-02-18) | 예 | 단, 대상은 드론이 아니라 보행자용 휴대 장치(UWB 태그 + IMU, ESKF)임. |
| arXiv 메타데이터에는 학술지/학회 정보가 없음. Crossref 에는 같은 제목·저자의 레코드가 'Proceedings of the 23rd Conference on Robots and Vision' (DOI 10.21428/d82e957c.65b0853d) 으로 등록되어 있음 (`venue`) | 10.21428/d82e957c.65b0853d | arXiv API (journal_ref 없음); Crossref API 레코드 | 예 | Crossref 레코드에 연도·쪽수가 없고, 학회 페이지 자체는 열어 보지 않음. PDF 에도 게재처 표기가 없음. |
| 누적 39분, 최대 5 에이전트, 2608 m, 4가지 시나리오의 실제 실험으로 평가 (`scope`) | 39 min / 5 / 2608 m / 4 | Abstract, p. 1 | 예 |  |
| 배치 평가는 GDOP 가 아니라 MSE 하한: MSE = Tr(Cov) + ‖Bias‖² 을 uniform Cramér-Rao bound 와 선형 근사로 하한 M(p, α) 을 구하고, 표본점 N 개의 평균 RMSE 를 지표로 삼아 block coordinate-wise minimization 으로 최적 배치를 구함 (`placement-metric`) | `\mathrm{MSE}(\hat p)=\mathrm{Tr}(\mathrm{Cov}(\hat p))+\\|\mathrm{Bias}(\hat p)\\|^2,\quad \alpha^\star=\arg\min_{\alpha\in\mathcal{A}} \mathcal{M}(\alpha)` | Sec. III-B (Sensor Placement Optimization), 식 (1)-(3), p. 3 | 예 | 알고리즘 상세는 저자들의 선행 논문 [8] (Zhao, Goudar, Schoellig, RA-L 7(3), 2022, pp. 6075-6082)을 보라고 함 — 그 논문은 열어 보지 않음. |
| GDOP 는 관련 연구에서 'GPS 분야에서 앵커-태그 기하의 영향을 나타내는 고전적 지표'로만 언급되고, CRLB 가 더 일반적인 지표라고 서술 (`gdop-mention`) | — | Sec. II (Related Work), p. 2 | 예 |  |
| GDOP 정의식 또는 GDOP 수치 (`gdop-formula`) | — | 이 논문에 없음 | **아니오** | GDOP 식·값은 나오지 않음. 교재의 GDOP 식은 유도(b) 또는 다른 출처(예: 이 논문의 참고문헌 [18] Sharp, Yu, Guo 2009 — 미열람)로 처리해야 함. |
| LOS TDOA 측정 잡음을 편향 없는 평균 0, 표준편차 10 cm 가우시안으로 가정 (ESKF 에서 σ = 0.1 m, 마할라노비스 임계값 5 의 카이제곱 이상치 기각). 계단 환경에서는 분산을 0.015 로 키움 (`noise-model`) | 0.1 m | Sec. IV-A (p. 5); Sec. IV-C (p. 6); Sec. IV-D (p. 7-8), Fig. 10 캡션 | 예 | Bitcraze 펌웨어 기본값 0.15 m 와 다른 값임. |
| 배치만 바꿔도 성능이 달라짐: 배치 1(삼각대 2.65 m) 평균 RMSE 21 cm, 배치 2(천장, z 방향 간격 5.5 m) 16 cm. 이론 하한은 각각 12 cm, 8 cm (`placement-effect`) | 21 / 16 (하한 12 / 8) cm | Sec. IV-A (Multi-agent Pedestrian Localization) + Fig. 5, p. 5 | 예 | 앵커 8개, 중앙집중식 TDOA(TDoA 2), 앵커 쌍은 라운드로빈. |
| 다중 방 사례: 최적화 결과 앵커 16개(분산식 TDOA, 8쌍)로 표본점 평균 RMSE 하한 20 cm 설계. 실측 평균 RMSE 는 카페테리아 24 cm, 좁은 복도 34 cm, 전체 28 cm; 이론 하한 17 cm (`multiroom-case`) | 24 / 34 / 28 (하한 17) cm | Sec. IV-D (A Case Study) + Fig. 8-10, p. 6-8 | 예 | 설치된 앵커 위치와 설계 위치의 평균 RMSE 차이는 22 cm. |
| 배치 설계에서 금속 물체(냉장고, 카운터, 자판기)를 심한 NLOS 를 일으키는 장애물로 모델링. 실험 잔차는 DW1000 고유 편향과 다중경로(특히 좁은 복도)로 가정한 가우시안보다 크게 오염 → LOS 표준편차를 보수적으로 크게 잡으라고 권고 (`nlos-treatment`) | — | Sec. IV-D, Fig. 10(b) 와 그 설명 문단, p. 7-8 | 예 |  |
| NLOS 편향의 수치 모델(재질별 편향 크기 등) (`nlos-bias-numbers`) | — | 이 논문에 없음 | **아니오** | NLOS 편향 모델과 수치는 선행 논문 [8], [11], [14] 로 넘김. 이 논문에는 정성적 서술과 잔차 히스토그램(Fig. 10b)만 있음. |

## 11. DW1000 (Decawave/Qorvo) — 타임스탬프 분해능, 광속 상수

- id: `dw1000`
- 서지: DecaWave Ltd, "DW1000 User Manual: How to use, configure and program the DW1000 UWB transceiver," Version 2.05, 2015, 223 pages.
- 실제로 연 URL:
  - https://thetoolchain.com/mirror/dw1000/dw1000_user_manual_v2.05.pdf (제3자 미러, 223쪽; 표지·저작권 표기는 DecaWave 원본)
  - https://www.qorvo.com/products/d/da007967 등 제조사 링크는 HTTP 429 로 받지 못함
  - https://raw.githubusercontent.com/bitcraze/crazyflie-firmware/master/src/deck/drivers/interface/locodeck.h , .../src/utils/interface/physicalConstants.h (교차 확인)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| DW1000 의 거리 측정용 샘플링 클록은 63.8976 GHz 이고 그 주기가 약 15.65 ps (타임스탬프 분해능) (`timestamp-resolution`) | 15.65 ps | DW1000 User Manual v2.05 (DecaWave Ltd, 2015), 서두 'Clock Periods and Frequencies' 단락, p. 8 | 예 | 제조사 사이트가 아닌 미러 사본으로 확인. 교차 확인: crazyflie-firmware locodeck.h 의 LOCODECK_TS_FREQ (499.2e6 * 128) → 1/(499.2e6·128) = 15.650 ps (유도), 1틱 ≈ 4.69 mm (유도). |
| IEEE 802.15.4-2011 의 칩 속도 499.2 MHz 가 DW1000 시스템 클록의 기준 (`chipping-rate`) | 499.2 MHz | DW1000 User Manual v2.05 (DecaWave Ltd, 2015), 'Clock Periods and Frequencies', p. 8 | 예 | 499.2 MHz x 128 = 63.8976 GHz. |
| 광속 c = 299 792 458 m/s (Bitcraze 펌웨어가 쓰는 상수; SI 정의값) (`speed-of-light`) | 299792458 m/s | crazyflie-firmware src/utils/interface/physicalConstants.h: #define SPEED_OF_LIGHT (299792458.0) (약 28행); lps-node-firmware src/uwb_tdoa_anchor3.c 의 ANTENNA_DELAY 식에도 같은 값 | 예 | BIPM/SI 문서는 따로 열지 않음. 펌웨어가 실제로 쓰는 값으로 확인. |
| 1 ns 의 시간 오차는 측정 거리 30 cm 오차에 해당 (`one-ns-30cm`) | 30 cm/ns | DW1000 User Manual v2.05 (DecaWave Ltd, 2015), Appendix 3, Sec. 12.2, Table 63 아래 Note, p. 212 | 예 |  |

## 12. DS-TWR 비대칭 식과 SS-TWR 클록 오차

- id: `dstwr`
- 서지: DecaWave Ltd, "DW1000 User Manual," Version 2.05, 2015, Appendix 3: Two-Way Ranging (Sec. 12). See also D. Neirynck, E. Luk, and M. McLaughlin, "An alternative double-sided two-way ranging method," 2016 13th Workshop on Positioning, Navigation and Communications (WPNC), pp. 1-4. doi:10.1109/WPNC.2016.7822844 (content not opened).
- 실제로 연 URL:
  - https://thetoolchain.com/mirror/dw1000/dw1000_user_manual_v2.05.pdf (p. 211-214 를 이미지로 렌더링해 수식 판독)
  - https://api.crossref.org/works?query.title=An+alternative+double-sided+two-way+ranging+method (Neirynck 논문 서지만)
  - https://raw.githubusercontent.com/bitcraze/crazyflie-firmware/master/src/deck/drivers/src/lpsTwrTag.c (같은 식의 구현)
- 접속일: 2026-11-22

| 사실 (key) | 값 | 정확한 위치 | 확인 | 비고 |
|---|---|---|---|---|
| 비대칭 DS-TWR 전파 시간 추정식 (3메시지·4메시지 방식 공통) (`ds-twr-asymmetric-formula`) | `\hat{T}_{prop}=\frac{T_{round1}\,T_{round2}-T_{reply1}\,T_{reply2}}{T_{round1}+T_{round2}+T_{reply1}+T_{reply2}}` s | DW1000 User Manual v2.05, Appendix 3, Sec. 12.3.2 (Using three messages), Fig. 38 아래 식, p. 213 | 예 | 브리프의 식과 일치. 같은 식이 crazyflie-firmware lpsTwrTag.c (약 235행)에 구현되어 있음. |
| 비대칭 DS-TWR 의 클록 유도 오차: error = T̂_prop x (1 − (k_a + k_b)/2). 예: 20 ppm, 100 m (ToF 333 ns)에서 6.7 ps ≈ 2.2 mm (`ds-twr-error`) | `error=\hat{T}_{prop}\left(1-\frac{k_a+k_b}{2}\right)` s | DW1000 User Manual v2.05, Sec. 12.3.2, p. 214 | 예 | 응답 시간이 서로 같을 필요가 없다는 점이 '비대칭'의 뜻. |
| SS-TWR 전파 시간 추정식: T̂_prop = ½ (T_round − T_reply) (`ss-twr-formula`) | `\hat{T}_{prop}=\tfrac{1}{2}\,(T_{round}-T_{reply})` s | DW1000 User Manual v2.05, Sec. 12.2, Fig. 36 아래 식, p. 211 | 예 |  |
| SS-TWR 클록 오프셋 오차: error ≈ ½ (e_B − e_A) x T_reply. 예: T_reply 1 ms, 20 ppm → 10 ns (`ss-twr-clock-error`) | `error=\hat{T}_{prop}-T_{prop}\approx\tfrac{1}{2}\,(e_B-e_A)\,T_{reply}` s | DW1000 User Manual v2.05, Sec. 12.2, p. 212 상단 식과 Table 62 | 예 | 브리프의 '½·e·T_reply' 에서 e 는 두 장치 클록 오프셋의 차 (e_B − e_A) 임. 10 ns 는 거리 약 3 m (1 ns ≈ 30 cm). |
| 대칭 DS-TWR(응답 시간이 같을 때) 식: T̂_prop = (T_round1 − T_reply2 + T_round2 − T_reply1)/4 (`symmetric-ds-twr`) | `\hat{T}_{prop}=\frac{T_{round1}-T_{reply2}+T_{round2}-T_{reply1}}{4}` s | DW1000 User Manual v2.05, Sec. 12.3.3, p. 214 | 예 |  |
| Neirynck, Luk, McLaughlin (2016) 논문 본문에서의 식 번호·유도 (`neirynck2016-content`) | — | 본문 미열람 | **아니오** | 서지(WPNC 2016, pp. 1-4, DOI 10.1109/WPNC.2016.7822844)는 Crossref 로 확인했으나 본문(IEEE Xplore, 유료)은 열지 못함. arXiv 제목 검색에서도 찾지 못함. 식의 출처로는 DW1000 User Manual 을 인용할 것. |
| Decawave APS013 응용 노트 (`aps013`) | — | 미열람 | **아니오** | qorvo.com/decawave.com 이 HTTP 429 를 반환해 받지 못함. 내용 확인 없이 인용하지 말 것. |

## 브리프와 달랐던 점

- **Crazyswarm (2017)에는 타원체/다운워시 분리 수치가 없습니다.** 그 수치(r_z = 0.3 m, r_x = r_y = 0.12 m)는 downwash2017 Sec. VI-A 에만 있습니다. Crazyswarm 논문에서 확인되는 간격은 0.5 m 격자뿐입니다.
- **Crazyswarm (2017)은 라디오당 기체 수를 숫자로 쓰지 않습니다.** '49대에 라디오 3개'만 있습니다. 16-17대/라디오는 유도값입니다.
- **LPS 시스템 페이지는 TWR 에서 '태그 1대만' 측위된다고 씁니다** (앵커 최대 8개). 여러 태그용 TDMA 는 펌웨어 코드에만 있습니다.
- **최소 앵커 수 '4'는 TWR/일반 3D 서술입니다.** TDoA 전용 최소값은 문서에 없고, TDoA 2 는 '8개에서 가장 잘 동작'(최대 8개)이라고만 합니다. 현실적 권장 6개는 TWR 문맥입니다.
- **TWR 잡음 0.25 m 는 이름 있는 상수가 아니라 리터럴**(lpsTwrTag.c)이고, TDoA 0.15 m 는 `TDOA_ENGINE_MEASUREMENT_NOISE_STD`(tdoaEngine.h)입니다. Long Range 빌드에서는 0.30 m 입니다.
- **칼만 상태·주파수는 문서 본문이 아니라 소스 코드에서만 확인됩니다** (예측 100 Hz, 메인 루프 1000 Hz, 상태 9차원).
- **데이터시트 Rev 3 안에서 무게 표기가 둘입니다.** 소개 문단은 32 g, 기계 사양은 이륙 중량 34 g(레그)/37 g(가드). 브리프의 34/37 g 은 기계 사양과 일치합니다.
- **데이터시트에 라디오 데이터율과 최대 속도가 없습니다.**
- **Crazyswarm2 백엔드는 3종이 아니라 4종**(cpp, cflib, cflib2, sim)이고, 방송은 cpp 백엔드만 지원합니다. Crazyflie 2.1 Brushless 는 지원 기체로 명시되어 있고 arming 이 필요합니다.
- **UTIL 데이터셋에 라이선스 표기가 없습니다.** 저장소는 utiasDSL 에서 learnsyslab 조직으로 이전되었고 LICENSE 파일이 없습니다. 또 학술지 게재 연도는 2022 가 아니라 2024 (IJRR 43(10))입니다.
- **UTIL 논문 본문에는 편향·잡음의 숫자가 없습니다** (그림으로만 제시). 본문에서 인용할 수 있는 숫자는 '장애물 없는 환경에서 약 10 cm' 벤치마크입니다.
- **arXiv:2412.12427 은 UWB TDOA 앵커 배치 논문이 맞지만**, GDOP 를 쓰지 않고 CRLB 기반 MSE 하한을 씁니다. GDOP 는 관련 연구에서 한 번 언급될 뿐이고, NLOS 편향 수치도 없습니다. 대상은 드론이 아니라 보행자용 휴대 장치입니다. 최신판은 v2 (2026-02-18)입니다.
- **Olfati-Saber 예제 값이 판본마다 다릅니다.** 게재본 Sec. XI 는 τ_max = 0.269, 2003년 프리프린트는 0.266 입니다.
- **SS-TWR 오차식의 e 는 한 장치의 오차가 아니라 두 장치 클록 오프셋의 차 (e_B − e_A)** 입니다 (DW1000 User Manual Sec. 12.2).
- **블로그 글 제목과 URL 에 'Sytem' 오타가 있습니다.** 게시일은 2016-11-28 입니다.

## 확인하지 못한 항목

아래 항목은 `verified: false` 입니다. 화면에 숫자로 쓰지 말거나, 유도·가정으로 표시해야 합니다.

| 출처 id | key | 무엇을 | 왜 확인하지 못했나 |
|---|---|---|---|
| `crazyswarm2017` | `drones-per-radio` | 라디오 1개당 기체 수(숫자) | 논문은 '49대에 라디오 3개'만 말하고 라디오당 대수를 숫자로 쓰지 않음. 49/3 ≈ 16.3 은 우리 쪽 유도값으로 표기해야 함. |
| `crazyswarm2017` | `separation-ellipsoid` | 다운워시/타원체 분리 거리 수치 | 다운워시는 Sec. XII 의 향후 과제로만 언급. 수치는 downwash2017 (Sec. VI-A)에 있음. 이 논문에서 확인되는 간격은 대형 격자 0.5 m 뿐. |
| `lps-docs` | `tdoa-min-anchors` | TDoA 전용 최소 앵커 수 | 문서는 TDoA 2 가 '8개에서 가장 잘 동작'하고 최대 8개라고만 함. '최소 4'는 TWR/일반 3D 측위에 대한 서술임. |
| `lps-docs` | `system-latency` | LPS 시스템 지연(latency) 수치 | 열어 본 LPS 문서 어디에도 지연 수치가 없음. |
| `cfbl-datasheet` | `radio-data-rate` | 라디오 데이터율(예: 2 Mbit/s) | Rev 3 에는 데이터율이 적혀 있지 않음. 2 Mbit/s 는 Crazyswarm(2017) Sec. III 의 Crazyradio PA 서술과 Crazyswarm2 예시 URI(radio://0/80/2M/...)에서만 확인됨. |
| `cfbl-datasheet` | `max-speed` | 최대 속도 | Rev 3 과 제품 페이지 어디에도 최대 속도 수치가 없음. |
| `crazyswarm2-docs` | `crazyflies-per-radio` | 라디오 1개당 권장/최대 기체 수 | 열어 본 7개 페이지에 라디오당 대수 서술이 없음. overview 는 '하나 이상의 Crazyradio 로 여러 Crazyflie 를 연결'이라고만 함. |
| `crazyswarm2-docs` | `latency` | 지연(latency) 측정값 | 측정값은 없음. 관련 서술은 (a) installation: 가상머신은 지연을 늘리므로 피하라, (b) server.yaml 경고 임계값 max_unicast_latency: 10.0 ms, 모캡 경고 범위 80-120 Hz — 임계값이지 성능 수치가 아님. |
| `bitcraze-tdoa-blog` | `rates-accuracy` | 측정률·정확도 수치 | 이 글에는 주파수나 정확도 숫자가 없음. 당시 TDoA 모드는 '매우 실험적'이라고만 표현. |
| `util2022` | `bias-noise-numbers` | LOS/NLOS 측정 편향·잡음의 구체적 수치(평균, 표준편차) | 측정 오차는 Fig. 6(LOS), Fig. 8(금속 NLOS 히스토그램), Fig. 13 에 그림으로만 제시됨. 본문 텍스트에는 평균·표준편차 수치가 없어 그림을 눈으로 읽지 않고는 인용할 수 없음. |
| `util2022` | `dataset-license` | 데이터셋 라이선스 | 저장소 루트에 LICENSE 파일이 없음(파일 목록: .gitignore, README.md, ros_ws, scripts, setup_files, setupscript.bash; raw LICENSE 는 404). GitHub API 의 license 필드는 null. README, 프로젝트 페이지, 논문 본문에도 라이선스 문구가 없음. 재배포·가공 전에 저자에게 확인 필요. |
| `arxiv-2412-12427` | `gdop-formula` | GDOP 정의식 또는 GDOP 수치 | GDOP 식·값은 나오지 않음. 교재의 GDOP 식은 유도(b) 또는 다른 출처(예: 이 논문의 참고문헌 [18] Sharp, Yu, Guo 2009 — 미열람)로 처리해야 함. |
| `arxiv-2412-12427` | `nlos-bias-numbers` | NLOS 편향의 수치 모델(재질별 편향 크기 등) | NLOS 편향 모델과 수치는 선행 논문 [8], [11], [14] 로 넘김. 이 논문에는 정성적 서술과 잔차 히스토그램(Fig. 10b)만 있음. |
| `dstwr` | `neirynck2016-content` | Neirynck, Luk, McLaughlin (2016) 논문 본문에서의 식 번호·유도 | 서지(WPNC 2016, pp. 1-4, DOI 10.1109/WPNC.2016.7822844)는 Crossref 로 확인했으나 본문(IEEE Xplore, 유료)은 열지 못함. arXiv 제목 검색에서도 찾지 못함. 식의 출처로는 DW1000 User Manual 을 인용할 것. |
| `dstwr` | `aps013` | Decawave APS013 응용 노트 | qorvo.com/decawave.com 이 HTTP 429 를 반환해 받지 못함. 내용 확인 없이 인용하지 말 것. |

### 확인은 했지만 단서가 붙는 항목

- `olfati2004` 의 수식들: 게재본 PDF 의 수식 글리프가 추출·렌더링에서 깨져, 정리 번호·식 번호·쪽수는 게재본에서, 기호는 저자 프리프린트 텍스트와 대조해 확인했습니다. Sec. XI 의 τ_max = π/2λ_max(G_e) = 0.269 와 Theorem 10 의 마지막 문장(ω = λ_n)은 게재본에서 그대로 읽혔습니다.
- `dw1000`, `dstwr`: DW1000 User Manual v2.05 를 제조사 사이트가 아닌 제3자 미러에서 받았습니다 (qorvo.com 은 HTTP 429). 표지와 저작권 표기는 DecaWave 원본이며, 15.65 ps 는 Bitcraze 펌웨어 상수(499.2e6 x 128)로 교차 확인했습니다.
- `cf-firmware-docs` 의 `robust-reference`: 문서가 그 논문을 인용한다는 사실만 확인했고 RA-L 논문 본문은 열지 않았습니다.
- `arxiv-2412-12427` 의 `venue`: Crossref 레코드만 근거이며 학회 페이지는 열지 않았습니다.
- `crazyswarm2017` 의 Fig. 4 막대 높이, `util2022` 의 Table 4 개별 값: 그림·표 판독이 필요한 값은 JSON 에 숫자로 넣지 않았습니다.
- `lps-docs` 의 `tdoa3-tx-rates`, `cf-firmware-docs` 의 주파수·잡음 값: 문서 본문이 아닌 소스 코드 상수입니다.
