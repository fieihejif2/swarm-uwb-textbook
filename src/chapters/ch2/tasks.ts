import type { CodingTask } from '../../py/grader';

export const gaussNewtonTask: CodingTask = {
  id: 'ch2-gauss-newton',
  chapter: 2,
  title: { ko: '가우스-뉴턴으로 위치 추정하기', en: 'Position estimation with Gauss–Newton' },
  prompt: {
    ko: '거리 측정값으로 태그의 위치를 구하는 함수 **`gauss_newton(anchors, ranges, x0, iters)`** 를 완성하세요.\n\n- `anchors`: 앵커 좌표, 모양 (N, d), 단위 m. d 는 2(평면) 또는 3(공간)이고 리스트로 들어올 수도 있습니다.\n- `ranges`: 측정한 거리 $\\rho_i$, 모양 (N,), 단위 m. `anchors` 와 같은 순서입니다.\n- `x0`: 처음 추정 위치, 모양 (d,), 단위 m.\n- `iters`: 갱신 횟수(0 이상의 정수).\n- 반환값: **정확히 `iters` 번** 갱신한 뒤의 추정 위치, 모양 (d,) 의 numpy 배열, 단위 m. `iters = 0` 이면 `x0` 를 그대로 돌려줍니다.\n\n한 번의 갱신은 다음과 같습니다. 잔차는 **계산한 거리 − 측정한 거리**, 즉 $r_i = \\lVert x - a_i \\rVert - \\rho_i$ 입니다. 야코비안 $J$ 의 $i$ 번째 행은 앵커에서 태그를 향하는 단위벡터 $(x - a_i)/\\lVert x - a_i \\rVert$ 입니다. 정규방정식 $(J^T J)\\,\\Delta x = -J^T r$ 을 풀어 $x \\leftarrow x + \\Delta x$ 로 갱신합니다.\n\n감쇠, 스텝 줄이기, 조기 종료는 넣지 않습니다(채점은 기준 구현과 반환값을 비교하며, 허용 오차는 상대 $10^{-6}$, 절대 $10^{-9}$ m{{ex}} 입니다). 시험 입력은 모두 잘 풀리는 배치입니다. 추정이 앵커와 겹쳐 거리가 0 이 되거나 $J^T J$ 가 특이해지는 경우는 나오지 않습니다. 정규방정식을 푸는 함수는 `np.linalg.solve`, `np.linalg.inv`, `np.linalg.lstsq` 무엇을 써도 됩니다. numpy 만 쓸 수 있습니다(scipy 없음).',
    en: 'Complete **`gauss_newton(anchors, ranges, x0, iters)`**, which finds the tag position from range measurements.\n\n- `anchors`: anchor coordinates, shape (N, d), in m. d is 2 (plane) or 3 (space); may be a plain list.\n- `ranges`: measured ranges $\\rho_i$, shape (N,), in m, in the same order as `anchors`.\n- `x0`: initial position guess, shape (d,), in m.\n- `iters`: number of updates (integer ≥ 0).\n- Returns: the estimate after **exactly `iters`** updates, a numpy array of shape (d,), in m. With `iters = 0` return `x0` unchanged.\n\nOne update is as follows. The residual is **computed range − measured range**, $r_i = \\lVert x - a_i \\rVert - \\rho_i$. Row $i$ of the Jacobian $J$ is the unit vector from the anchor towards the tag, $(x - a_i)/\\lVert x - a_i \\rVert$. Solve the normal equations $(J^T J)\\,\\Delta x = -J^T r$ and update $x \\leftarrow x + \\Delta x$.\n\nDo not add damping, step shortening or early stopping (grading compares the return value with the reference, with relative tolerance $10^{-6}$ and absolute tolerance $10^{-9}$ m{{ex}}). All test inputs are well posed: the estimate never lands on an anchor (zero distance) and $J^T J$ is never singular. Any solver is fine for the normal equations: `np.linalg.solve`, `np.linalg.inv` or `np.linalg.lstsq`. Only numpy is available (no scipy).',
  },
  starter: `import numpy as np

def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float)      # (N, d) 앵커 좌표 [m]
    rho = np.asarray(ranges, dtype=float)     # (N,) 측정한 거리 [m]
    x = np.array(x0, dtype=float)             # (d,) 지금 추정 (x0 의 복사본)
    for _ in range(iters):
        # 1) 지금 추정 x 에서 각 앵커까지 계산한 거리 d_i
        # 2) 잔차 r_i = d_i - rho_i
        # 3) 야코비안 J: i 번째 행 = (x - a_i) / d_i
        # 4) 정규방정식 (J^T J) dx = -J^T r 을 풀어 dx 를 구한다
        # 5) x 를 갱신한다
        pass
    return x
`,
  solution: `import numpy as np

def gauss_newton(anchors, ranges, x0, iters):
    A = np.asarray(anchors, dtype=float)      # (N, d) 앵커 좌표 [m]
    rho = np.asarray(ranges, dtype=float)     # (N,) 측정한 거리 [m]
    x = np.array(x0, dtype=float)             # (d,) 지금 추정 (x0 의 복사본)
    for _ in range(iters):
        diff = x - A                          # (N, d) 앵커 -> 태그 벡터
        d = np.linalg.norm(diff, axis=1)      # (N,) 지금 추정에서 계산한 거리
        r = d - rho                           # 잔차: 계산한 거리 - 측정한 거리
        J = diff / d[:, None]                 # 야코비안: 각 행이 단위벡터 e_i
        dx = np.linalg.solve(J.T @ J, -J.T @ r)   # 정규방정식 (J^T J) dx = -J^T r
        x = x + dx                            # 갱신
    return x
`,
  links: { res: [10], jac: [8, 9, 11], step: [12], upd: [13] },
  tests: `
_A3 = np.array([[0, 0, 0.5], [20, 0, 7], [20, 15, 0.5], [0, 15, 7], [0, 0, 7], [20, 0, 0.5], [20, 15, 7], [0, 15, 0.5]], dtype=float)
_P3 = np.array([12.4, 6.3, 1.5])
_R3 = np.linalg.norm(_P3 - _A3, axis=1)
_rng = np.random.default_rng(20261122)
_R3n = _R3 + 0.1 * _rng.standard_normal(8)
_A2 = np.array([[0, 0], [20, 0], [20, 15], [0, 15]], dtype=float)
_P2 = np.array([5.0, 11.0])
_R2 = np.linalg.norm(_P2 - _A2, axis=1) + 0.05 * _rng.standard_normal(4)

TESTS = [
    dict(name_ko="갱신 0회", name_en="Zero updates",
         run=lambda ns: ns["gauss_newton"](_A3, _R3, [10.0, 7.5, 2.0], 0),
         hint_ko="iters = 0 이면 x0 를 그대로 돌려줘야 합니다. 반복문이 정확히 iters 번 도는지 확인하세요.",
         hint_en="With iters = 0 return x0 unchanged. Make sure the loop runs exactly iters times."),
    dict(name_ko="갱신 한 번만", name_en="A single update",
         run=lambda ns: ns["gauss_newton"](_A3, _R3, [10.0, 7.5, 2.0], 1),
         hint_ko="한 번의 갱신은 $\\\\Delta x = -(J^T J)^{-1} J^T r$ 입니다. 세 가지를 확인하세요. ① 잔차는 '계산한 거리 − 측정한 거리' 인가 ② 야코비안의 행이 $(x - a_i)$ 를 거리 $d_i$ 로 나눈 단위벡터인가(방향이 $a_i - x$ 가 아닌가) ③ $J^T J$ 로 푸는 단계를 빼고 $-J^T r$ 만 더하지 않았는가.",
         hint_en="One update is $\\\\Delta x = -(J^T J)^{-1} J^T r$. Check three things: (1) the residual is 'computed − measured'; (2) each Jacobian row is $(x - a_i)$ divided by the distance $d_i$, a unit vector (not $a_i - x$); (3) you solve with $J^T J$ rather than adding only $-J^T r$."),
    dict(name_ko="갱신 3회 (아직 다 모이지 않은 상태)", name_en="Three updates (not yet converged)",
         run=lambda ns: ns["gauss_newton"](_A3, _R3, [4.0, 12.0, 4.0], 3),
         hint_ko="정확히 iters 번 갱신한 값을 비교합니다. 한 번만 갱신하고 끝내거나(반복문 안의 return), 스텝을 줄이거나, 일찍 멈추면 기준값과 달라집니다. 갱신할 때마다 거리·잔차·야코비안을 새 x 에서 다시 계산해야 합니다.",
         hint_en="The value after exactly iters updates is compared. Returning after one update (a return inside the loop), shortening the step or stopping early gives a different number. Recompute distances, residuals and the Jacobian at the new x in every update."),
    dict(name_ko="잡음 없는 거리, 가까운 초기값, 10회 (입력이 리스트)", name_en="Noise-free ranges, close initial guess, 10 iterations (list input)",
         run=lambda ns: ns["gauss_newton"](_A3.tolist(), _R3.tolist(), [10.0, 7.5, 2.0], 10),
         hint_ko="잡음이 없으면 참 위치 (12.4, 6.3, 1.5) 로 모여야 합니다. 입력이 리스트로 들어와도 동작해야 합니다(np.asarray 로 바꾸세요).",
         hint_en="Without noise it must converge to the true position (12.4, 6.3, 1.5). It must also work when the inputs are plain lists (convert with np.asarray)."),
    dict(name_ko="잡음이 섞인 거리", name_en="Noisy ranges", hidden=True,
         run=lambda ns: ns["gauss_newton"](_A3, _R3n, [10.0, 7.5, 2.0], 15),
         hint_ko="잡음이 있으면 잔차가 0 이 되지 않고, 답은 잔차 제곱합을 가장 작게 하는 점입니다. 야코비안을 거리로 나누지 않으면 먼 앵커에 더 큰 가중치를 준 다른 점으로 갑니다.",
         hint_en="With noise the residuals do not vanish and the answer is the point minimising the sum of squared residuals. Without dividing the Jacobian by the distance you weight far anchors more and land elsewhere."),
    dict(name_ko="2차원 입력", name_en="Two-dimensional input", hidden=True,
         run=lambda ns: ns["gauss_newton"](_A2, _R2, [10.0, 7.5], 12),
         hint_ko="차원을 3 으로 고정하지 마세요. 앵커가 (N, 2) 이고 x0 가 길이 2 이면 답도 길이 2 여야 합니다.",
         hint_en="Do not hard-code three dimensions. With anchors of shape (N, 2) and x0 of length 2 the answer has length 2."),
    dict(name_ko="멀리 떨어진 초기값", name_en="Poor initial guess", hidden=True,
         run=lambda ns: ns["gauss_newton"](_A3, _R3, [1.0, 14.0, 6.0], 25),
         hint_ko="초기값이 멀어도 같은 갱신을 반복하면 이 배치에서는 참 위치로 모입니다. 갱신할 때마다 거리·잔차·야코비안을 **새 x 에서 다시** 계산하는지 확인하세요.",
         hint_en="Even from a far initial guess the same update converges to the true position for this layout. Make sure distances, residuals and the Jacobian are **recomputed at the new x** in every update."),
]
`,
};

export const tasks = [gaussNewtonTask];
