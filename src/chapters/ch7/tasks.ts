import type { CodingTask } from '../../py/grader';

export const delayMarginTask: CodingTask = {
  id: 'ch7-delay-margin',
  chapter: 7,
  title: { ko: '고유값으로 지연 여유 계산하기', en: 'Delay margin from eigenvalues' },
  prompt: {
    ko: '인접행렬 `A` (N×N, 대칭, `A[i][j]` = 드론 i 와 j 를 잇는 가중치, 연결이 없으면 0)와 게인 `k` [1/s] 를 받아 **`(lambda2, lambdaN, tau_star)`** 를 돌려주는 함수 `delay_margin(A, k)` 를 완성하세요.\n\n`lambda2` 는 라플라시안 $L = D - A$ 의 두 번째로 작은 고유값, `lambdaN` 은 가장 큰 고유값, `tau_star` 는 지연 한계 $\\pi / (2 k \\lambda_N)$ [s] 입니다. `A` 는 리스트로 들어올 수도 있습니다. 대칭행렬의 고유값은 `np.linalg.eigvalsh` 가 오름차순으로 돌려줍니다.',
    en: 'Complete `delay_margin(A, k)`. It receives an adjacency matrix `A` (N×N, symmetric; `A[i][j]` is the weight of the link between drones i and j, 0 if none) and a gain `k` [1/s], and returns **`(lambda2, lambdaN, tau_star)`**.\n\n`lambda2` is the second-smallest eigenvalue of the Laplacian $L = D - A$, `lambdaN` the largest, and `tau_star` the delay bound $\\pi / (2 k \\lambda_N)$ [s]. `A` may be a plain list. `np.linalg.eigvalsh` returns the eigenvalues of a symmetric matrix in ascending order.',
  },
  starter: `import numpy as np

def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    # 1) 라플라시안 L = D - A  (D 는 각 행의 합을 대각에 둔 행렬)
    # 2) 고유값을 오름차순으로 구한다
    # 3) lambda2, lambdaN, tau_star = pi / (2 k lambdaN)
    lambda2 = 0.0
    lambdaN = 0.0
    tau_star = 0.0
    return lambda2, lambdaN, tau_star
`,
  solution: `import numpy as np

def delay_margin(A, k):
    A = np.asarray(A, dtype=float)
    L = np.diag(A.sum(axis=1)) - A        # 라플라시안 L = D - A
    lam = np.linalg.eigvalsh(L)           # 대칭행렬의 고유값 (오름차순)
    lambda2 = lam[1]                      # 대수적 연결도 → 수렴 속도
    lambdaN = lam[-1]                     # 최대 고유값 → 지연 한계
    tau_star = np.pi / (2 * k * lambdaN)  # 지연 한계 [s]
    return lambda2, lambdaN, tau_star
`,
  links: { lap: [5], lam2: [7], lamN: [8], tau: [9], gain: [9] },
  tests: `
def _complete(n):
    return (np.ones((n, n)) - np.eye(n)).tolist()
def _ring(n):
    A = np.zeros((n, n))
    for i in range(n):
        A[i, (i + 1) % n] = A[(i + 1) % n, i] = 1
    return A
def _star(n):
    A = np.zeros((n, n)); A[0, 1:] = 1; A[1:, 0] = 1
    return A
def _path(n):
    A = np.zeros((n, n))
    for i in range(n - 1):
        A[i, i + 1] = A[i + 1, i] = 1
    return A
_W = np.array([[0, 2, 0.5, 0], [2, 0, 1, 0], [0.5, 1, 0, 3], [0, 0, 3, 0]])
_D = np.array([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]])

TESTS = [
    dict(name_ko="완전 그래프 5대, k = 1", name_en="Complete graph, 5 drones, k = 1",
         run=lambda ns: ns["delay_margin"](_complete(5), 1.0),
         hint_ko="완전 그래프 5대의 0 이 아닌 고유값은 모두 5 입니다. $L = D - A$ 의 부호를 확인하세요.",
         hint_en="All non-zero eigenvalues of the complete graph on 5 nodes equal 5. Check the sign in $L = D - A$."),
    dict(name_ko="고리 그래프 5대, k = 1.5", name_en="Ring graph, 5 drones, k = 1.5",
         run=lambda ns: ns["delay_margin"](_ring(5), 1.5),
         hint_ko="지연 한계는 **가장 큰** 고유값과 게인 $k$ 로 정해집니다: $\\\\pi/(2k\\\\lambda_N)$. $\\\\lambda_2$ 를 쓰지 않았는지, $k$ 를 빠뜨리지 않았는지 보세요.",
         hint_en="The delay bound uses the **largest** eigenvalue and the gain $k$: $\\\\pi/(2k\\\\lambda_N)$. Did you use $\\\\lambda_2$ or forget $k$?"),
    dict(name_ko="별 그래프 5대, k = 2", name_en="Star graph, 5 drones, k = 2",
         run=lambda ns: ns["delay_margin"](_star(5), 2.0),
         hint_ko="분모의 2 를 빠뜨리지 않았나요? $\\\\tau^* = \\\\pi / (2 k \\\\lambda_N)$",
         hint_en="Is the factor 2 in the denominator there? $\\\\tau^* = \\\\pi / (2 k \\\\lambda_N)$"),
    dict(name_ko="일렬 그래프 6대, k = 0.7", name_en="Path graph, 6 drones, k = 0.7",
         run=lambda ns: ns["delay_margin"](_path(6), 0.7),
         hint_ko="고유값을 오름차순으로 정렬한 뒤 두 번째(인덱스 1)와 마지막(인덱스 -1)을 고르세요.",
         hint_en="Sort the eigenvalues in ascending order, then take the second (index 1) and the last (index -1)."),
    dict(name_ko="가중치가 있는 그래프", name_en="Weighted graph", hidden=True,
         run=lambda ns: ns["delay_margin"](_W, 1.2),
         hint_ko="차수 행렬 $D$ 의 대각 원소는 '이웃 수'가 아니라 **가중치의 합**(행의 합)입니다.",
         hint_en="The diagonal of the degree matrix $D$ is the **sum of weights** in each row, not the number of neighbours."),
    dict(name_ko="끊어진 그래프 (λ₂ = 0)", name_en="Disconnected graph (λ₂ = 0)", hidden=True, atol=1e-9,
         run=lambda ns: ns["delay_margin"](_D, 1.0),
         hint_ko="그래프가 둘로 끊어져 있으면 $\\\\lambda_2 = 0$ 입니다(합의가 이루어지지 않음). 0 으로 나누지 않는지 확인하세요 — 나누는 것은 $\\\\lambda_N$ 입니다.",
         hint_en="A graph split in two has $\\\\lambda_2 = 0$ (no consensus). Make sure you divide by $\\\\lambda_N$, not $\\\\lambda_2$."),
]
`,
};

export const gilbertTask: CodingTask = {
  id: 'ch7-gilbert',
  chapter: 7,
  title: { ko: '길버트-엘리엇 손실 모델 구현하기', en: 'Implement the Gilbert–Elliott loss model' },
  prompt: {
    ko: '두 함수를 완성하세요.\n\n**`gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad)`** — `u` 는 0~1 균등난수가 든 (n, 2) 배열입니다(채점이 재현되도록 난수를 밖에서 줍니다). 패킷 `i` 마다 다음 순서로 처리하고, 길이 n 의 0/1 배열(1 = 손실)을 돌려주세요. 처음 상태는 **Good** 입니다.\n\n1) 지금 상태의 손실 확률(Good 이면 `loss_good`, Bad 이면 `loss_bad`)보다 `u[i, 0]` 이 **작으면** 이 패킷은 손실.  2) 그다음 상태를 바꿉니다: Good 에서 `u[i, 1] < p_gb` 이면 Bad 로, Bad 에서 `u[i, 1] < p_bg` 이면 Good 으로.\n\n**`stationary_loss(p_gb, p_bg, loss_good, loss_bad)`** — 오래 돌렸을 때의 평균 손실률(0~1)을 식으로 계산합니다.',
    en: 'Complete two functions.\n\n**`gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad)`** — `u` is an (n, 2) array of uniform random numbers in 0–1 (supplied from outside so grading is reproducible). For each packet `i` do the following in order and return a length-n array of 0/1 (1 = lost). The initial state is **Good**.\n\n1) If `u[i, 0]` is **less than** the loss probability of the current state (`loss_good` in Good, `loss_bad` in Bad) the packet is lost.  2) Then update the state: from Good go to Bad if `u[i, 1] < p_gb`; from Bad go to Good if `u[i, 1] < p_bg`.\n\n**`stationary_loss(p_gb, p_bg, loss_good, loss_bad)`** — the long-run average loss rate (0–1) in closed form.',
  },
  starter: `import numpy as np

def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float)
    lost = np.zeros(len(u), dtype=int)
    bad = False          # Good 상태에서 시작
    for i in range(len(u)):
        # 1) 이 패킷이 손실되었는가?  (u[i, 0] 사용)
        # 2) 다음 패킷을 위한 상태 전이  (u[i, 1] 사용)
        pass
    return lost

def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    # Bad 상태에 머무는 시간 비율 pi_bad 를 먼저 구하세요
    return 0.0
`,
  solution: `import numpy as np

def gilbert_elliott(u, p_gb, p_bg, loss_good, loss_bad):
    u = np.asarray(u, dtype=float)
    lost = np.zeros(len(u), dtype=int)
    bad = False                                   # Good 상태에서 시작
    for i in range(len(u)):
        p_loss = loss_bad if bad else loss_good
        lost[i] = 1 if u[i, 0] < p_loss else 0    # 1) 이 패킷의 손실 여부
        if bad:                                   # 2) 다음 패킷을 위한 상태 전이
            bad = not (u[i, 1] < p_bg)
        else:
            bad = u[i, 1] < p_gb
    return lost

def stationary_loss(p_gb, p_bg, loss_good, loss_bad):
    pi_bad = p_gb / (p_gb + p_bg)                 # Bad 에 머무는 시간 비율
    return (1 - pi_bad) * loss_good + pi_bad * loss_bad
`,
  links: { emit: [8, 9], trans: [10, 11, 12, 13], pibad: [17], rate: [18] },
  tests: `
_r = np.random.default_rng(20261122)
_U1 = _r.random((400, 2))
_U2 = _r.random((5000, 2))
_U3 = _r.random((60, 2))

TESTS = [
    dict(name_ko="정상상태 손실률 (기본 설정)", name_en="Stationary loss rate (default settings)",
         run=lambda ns: ns["stationary_loss"](0.02, 0.3, 0.01, 0.8),
         hint_ko="$\\\\pi_B = p_{GB} / (p_{GB} + p_{BG})$ 이고 손실률은 $(1-\\\\pi_B)\\\\,h_G + \\\\pi_B\\\\,h_B$ 입니다. 분자가 $p_{BG}$ 가 아닌지 확인하세요.",
         hint_en="$\\\\pi_B = p_{GB} / (p_{GB} + p_{BG})$ and the loss rate is $(1-\\\\pi_B)\\\\,h_G + \\\\pi_B\\\\,h_B$. Check the numerator is not $p_{BG}$."),
    dict(name_ko="정상상태 손실률 (다른 값)", name_en="Stationary loss rate (other values)", hidden=True,
         run=lambda ns: ns["stationary_loss"](0.1, 0.05, 0.0, 1.0)),
    dict(name_ko="손실 수열 400개", name_en="Loss sequence, 400 packets",
         run=lambda ns: np.asarray(ns["gilbert_elliott"](_U1, 0.05, 0.25, 0.02, 0.9)).astype(int),
         hint_ko="순서가 중요합니다: **먼저** 지금 상태로 손실 여부를 정하고, **그다음** 상태를 바꿉니다. 비교는 '작다(<)' 입니다.",
         hint_en="Order matters: **first** decide the loss with the current state, **then** update the state. The comparison is strictly less-than."),
    dict(name_ko="손실이 전혀 없는 Good, 전부 손실인 Bad", name_en="Lossless Good, fully lossy Bad",
         run=lambda ns: np.asarray(ns["gilbert_elliott"](_U3, 0.2, 0.4, 0.0, 1.0)).astype(int),
         hint_ko="Bad 에서 Good 으로 돌아오는 전이(\`p_bg\`)를 구현했나요? Good→Bad 에는 \`p_gb\`, Bad→Good 에는 \`p_bg\` 를 씁니다.",
         hint_en="Did you implement the transition back from Bad to Good (\`p_bg\`)? Use \`p_gb\` for Good→Bad and \`p_bg\` for Bad→Good."),
    dict(name_ko="긴 수열의 손실 개수", name_en="Number of losses in a long sequence", hidden=True,
         run=lambda ns: int(np.sum(ns["gilbert_elliott"](_U2, 0.02, 0.3, 0.01, 0.8)))),
    dict(name_ko="빈 입력", name_en="Empty input", hidden=True,
         run=lambda ns: len(ns["gilbert_elliott"](np.zeros((0, 2)), 0.1, 0.1, 0.1, 0.9)),
         hint_ko="패킷이 0개이면 길이 0 인 배열을 돌려줘야 합니다.", hint_en="With zero packets, return an empty array."),
]
`,
};

export const tasks = [delayMarginTask, gilbertTask];
