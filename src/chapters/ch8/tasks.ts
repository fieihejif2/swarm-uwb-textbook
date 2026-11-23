import type { CodingTask } from '../../py/grader';

export const cbfTask: CodingTask = {
  id: 'ch8-cbf-filter',
  chapter: 8,
  title: { ko: '두 드론 사이의 CBF 안전 필터', en: 'A CBF safety filter between two drones' },
  prompt: {
    ko: '원래 내리려던 속도 명령을 받아, 필요할 때만 최소한으로 고쳐서 돌려주는 함수 **`cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz)`** 를 완성하세요. 이 장의 "기본" 필터입니다(위치를 정확히 안다고 가정, **속도 제한은 넣지 않습니다**).\n\n**입력** — `p_self`, `p_other`: 내 위치와 상대 위치, 길이 3 `[x, y, z]` [m] (z 가 위). `u_nom`: 원래 속도 명령, 길이 3 [m/s]. `d_min`: 지켜야 하는 최소 타원체 거리 [m]. `alpha`: CBF 게인 $\\alpha$ [1/s]. `kz`: 다운워시 비율 $k_z \\ge 1$ (단위 없음). 리스트로 들어올 수도 있습니다.\n\n**반환** — 걸러진 속도 명령, 길이 3 의 numpy 배열 [m/s].\n\n**계산 순서** ($S = \\mathrm{diag}(1, 1, 1/k_z)$ 는 z 성분만 $k_z$ 로 나누는 변환)\n\n1) $r = S\\,(p_{\\text{self}} - p_{\\text{other}})$ — 방향에 주의: **상대에서 나를 향하는** 벡터입니다. $d = \\lVert r\\rVert$, $\\hat n = r/d$, $h = d - d_{\\min}$. (채점 입력에서는 항상 $d > 0$)\n\n2) $w = S\\,u_{\\text{nom}}$, $b = -(\\alpha/2)\\,h$ — 책임은 **절반**입니다.\n\n3) $\\hat n \\cdot w \\ge b$ 이면 `u_nom` 을 **그대로** 돌려줍니다.\n\n4) 아니면 $w \\leftarrow w + (b - \\hat n \\cdot w)\\,\\hat n$ 으로 법선 성분만 고치고, **원래 좌표로 되돌려** $u = S^{-1} w = [w_x,\\ w_y,\\ k_z w_z]$ 를 돌려줍니다.\n\n(실제로 쓸 때: `d_min` 에 예산의 수평 권장 간격을 넣는다면 `kz` 에는 $k_{\\text{eff}} = d_{\\min,V}/d_{\\min,H}$ 를, 기체와 다운워시 영역만 지키려면 `d_min` = 충돌 지름, `kz` = $k_z$ 를 넣습니다. 채점은 주어진 값을 그대로 씁니다.)',
    en: 'Complete **`cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz)`**: it receives the velocity command you were about to send and returns it, corrected as little as possible and only when needed. This is the "basic" filter of this chapter (positions are assumed exact; **no speed limit is applied**).\n\n**Inputs** — `p_self`, `p_other`: my position and the other drone’s, length 3 `[x, y, z]` [m] (z up). `u_nom`: nominal velocity command, length 3 [m/s]. `d_min`: minimum ellipsoidal distance to keep [m]. `alpha`: CBF gain $\\alpha$ [1/s]. `kz`: downwash ratio $k_z \\ge 1$ (dimensionless). They may be plain lists.\n\n**Returns** — the filtered velocity command, a numpy array of length 3 [m/s].\n\n**Steps** ($S = \\mathrm{diag}(1, 1, 1/k_z)$ divides only the z component by $k_z$)\n\n1) $r = S\\,(p_{\\text{self}} - p_{\\text{other}})$ — mind the direction: it points **from the other drone to me**. $d = \\lVert r\\rVert$, $\\hat n = r/d$, $h = d - d_{\\min}$. (The graded inputs always have $d > 0$.)\n\n2) $w = S\\,u_{\\text{nom}}$, $b = -(\\alpha/2)\\,h$ — you carry **half** of the responsibility.\n\n3) If $\\hat n \\cdot w \\ge b$, return `u_nom` **unchanged**.\n\n4) Otherwise correct only the normal component, $w \\leftarrow w + (b - \\hat n \\cdot w)\\,\\hat n$, and return it **in real coordinates**: $u = S^{-1} w = [w_x,\\ w_y,\\ k_z w_z]$.\n\n(In real use: if `d_min` is the budget’s recommended horizontal spacing, pass $k_{\\text{eff}} = d_{\\min,V}/d_{\\min,H}$ as `kz`; to protect only the body-and-downwash zone, pass the collision diameter as `d_min` and $k_z$ as `kz`. Grading simply uses the values given.)',
  },
  starter: `import numpy as np

def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])   # S 의 대각 원소: z 만 kz 로 나눈다
                                         # diagonal of S: only z is divided by kz
    # 1) r = S (p_self - p_other),  d = |r|,  n = r / d,  h = d - d_min
    # 2) w = S u_nom,  b = -(alpha / 2) * h
    # 3) n·w >= b 이면 u_nom 을 그대로 돌려준다
    # 3) if n·w >= b, return u_nom unchanged
    # 4) 아니면 w 의 법선 성분만 고치고, S 의 역변환으로 되돌려서 돌려준다
    # 4) otherwise fix only the normal component of w, map back with the inverse of S and return it
    return u_nom
`,
  solution: `import numpy as np

def cbf_filter(p_self, p_other, u_nom, d_min, alpha, kz):
    u_nom = np.asarray(u_nom, dtype=float)
    s = np.array([1.0, 1.0, 1.0 / kz])            # S = diag(1, 1, 1/kz): z 만 줄인다
    r = s * (np.asarray(p_self, dtype=float) - np.asarray(p_other, dtype=float))
    d = np.linalg.norm(r)                         # 타원체 거리
    n = r / d                                     # 상대에서 나를 향하는 단위 법선
    h = d - d_min                                 # 장벽 함수: 0 이상이면 안전
    w = s * u_nom                                 # 줄인 좌표에서 본 원래 명령
    b = -(alpha / 2) * h                          # 내 몫(절반): n·w >= b
    if n @ w >= b:                                # 이미 조건을 만족 → 손대지 않는다
        return u_nom.copy()
    w = w + (b - n @ w) * n                       # 모자란 만큼만 법선 방향으로 더한다
    return w / s                                  # 원래 좌표로: z 에 kz 를 곱한다
`,
  links: { scale: [5, 15], normal: [6, 8], h: [7, 9], w: [10], half: [11], keep: [12, 13], proj: [14] },
  tests: `
def _batch(ns, seed, n, kz):
    r = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        ps = r.uniform(-1.0, 1.0, 3)
        po = r.uniform(-1.0, 1.0, 3)
        u = r.uniform(-1.0, 1.0, 3)
        out.append(np.asarray(ns["cbf_filter"](ps, po, u, 0.6, 2.0, kz), dtype=float))
    return np.array(out)

TESTS = [
    dict(name_ko="멀리 있을 때: 그대로 통과", name_en="Far apart: passes through unchanged", atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([2.0, 0.0, 1.5], [-2.0, 0.0, 1.5], [-0.5, 0.0, 0.0], 0.6, 2.0, 2.5),
         hint_ko="거리가 충분하면 $\\\\hat n\\\\cdot w \\\\ge -(\\\\alpha/2)h$ 가 이미 성립하므로 명령을 바꾸면 안 됩니다. 필터는 필요할 때만 개입합니다.",
         hint_en="With plenty of distance $\\\\hat n\\\\cdot w \\\\ge -(\\\\alpha/2)h$ already holds, so the command must not change. The filter intervenes only when needed."),
    dict(name_ko="가까이에서 정면으로 다가갈 때", name_en="Closing in head-on at short range", atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([0.5, 0.1, 1.5], [-0.3, 0.0, 1.5], [-1.0, 0.0, 0.0], 0.6, 2.0, 1.0),
         hint_ko="세 가지를 확인하세요. ① 법선은 **상대에서 나를 향하는** 방향 $r = p_{self} - p_{other}$ 입니까? ② 책임은 절반, $b = -(\\\\alpha/2)h$ 입니까? ③ 벡터 전체를 줄이지 않고 **법선 성분만** $w + (b - \\\\hat n\\\\cdot w)\\\\hat n$ 으로 고쳤습니까?",
         hint_en="Check three things. ① Does the normal point **from the other drone to you**, $r = p_{self} - p_{other}$? ② Is it half the responsibility, $b = -(\\\\alpha/2)h$? ③ Did you correct **only the normal component**, $w + (b - \\\\hat n\\\\cdot w)\\\\hat n$, rather than shrinking the whole vector?"),
    dict(name_ko="옆으로만 움직일 때 (한계 밖)", name_en="Purely sideways motion (outside the limit)", atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([0.7, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.8, 0.0], 0.6, 2.0, 2.5),
         hint_ko="접선 방향 명령은 $\\\\hat n\\\\cdot w = 0$ 이고, $h > 0$ 이면 $b < 0$ 이므로 조건을 이미 만족합니다. 조건을 검사하지 않고 **항상** 법선 성분을 $b$ 로 맞추면 오히려 상대 쪽으로 끌려갑니다.",
         hint_en="A tangential command has $\\\\hat n\\\\cdot w = 0$, and with $h > 0$ we get $b < 0$, so the condition already holds. Setting the normal component to $b$ **always**, without the check, would pull you towards the other drone."),
    dict(name_ko="위아래로 겹칠 때 (kz = 2.5)", name_en="One above the other (kz = 2.5)", atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([0.2, 0.1, 2.5], [0.0, 0.0, 1.0], [0.1, 0.0, -0.8], 0.6, 2.0, 2.5),
         hint_ko="z 축 처리를 확인하세요. 상대 위치와 속도 명령 **둘 다** z 를 $k_z$ 로 나눈 좌표에서 계산하고, 마지막에 결과의 z 에 $k_z$ 를 **다시 곱해** 돌려줘야 합니다.",
         hint_en="Check the z axis. **Both** the relative position and the velocity command are taken in coordinates with z divided by $k_z$, and the z of the result must be **multiplied by $k_z$ again** before returning."),
    dict(name_ko="이미 한계 안쪽, 명령은 0", name_en="Already inside the limit, zero command", hidden=True, atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([0.3, 0.0, 1.5], [0.0, 0.0, 1.5], [0.0, 0.0, 0.0], 0.6, 3.0, 2.0),
         hint_ko="$h < 0$ 이면 $b = -(\\\\alpha/2)h$ 가 **양수**가 됩니다. 가만히 있으려는 명령도 바깥으로 밀어내는 속도 $b\\\\,\\\\hat n$ 로 바뀌어야 합니다.",
         hint_en="When $h < 0$, $b = -(\\\\alpha/2)h$ is **positive**. Even a command to stand still must turn into an outward velocity $b\\\\,\\\\hat n$."),
    dict(name_ko="한계 안쪽에서 옆으로 움직일 때", name_en="Sideways motion inside the limit", hidden=True, atol=1e-9,
         run=lambda ns: ns["cbf_filter"]([0.4, 0.0, 1.5], [0.0, 0.0, 1.5], [0.0, 1.0, 0.2], 0.6, 2.0, 2.0),
         hint_ko="접선 성분은 그대로 두고 법선 성분만 $b$ 까지 올립니다. 접선 성분까지 지우거나 줄이면 '최소한의 수정'이 아닙니다.",
         hint_en="Keep the tangential component and raise only the normal component to $b$. Removing or shrinking the tangential part is not a minimal correction."),
    dict(name_ko="무작위 상황 40가지 (kz = 2.5)", name_en="40 random situations (kz = 2.5)", hidden=True, atol=1e-9,
         run=lambda ns: _batch(ns, 20261122, 40, 2.5),
         hint_ko="개별 케이스는 통과했는데 여기서 틀린다면, z 축 변환($S$ 와 $S^{-1}$)과 '조건을 만족하면 그대로'를 다시 확인하세요.",
         hint_en="If the individual cases pass but this fails, re-check the z transforms ($S$ and $S^{-1}$) and the unchanged-when-satisfied branch."),
    dict(name_ko="무작위 상황 40가지 (kz = 1, 구)", name_en="40 random situations (kz = 1, sphere)", hidden=True, atol=1e-9,
         run=lambda ns: _batch(ns, 808, 40, 1.0),
         hint_ko="$k_z = 1$ 이면 평범한 유클리드 거리입니다. 여기서만 틀린다면 법선 방향과 $\\\\alpha/2$ 를 확인하세요.",
         hint_en="With $k_z = 1$ this is the ordinary Euclidean distance. If only this fails, check the direction of the normal and the factor $\\\\alpha/2$."),
]
`,
};

export const tasks = [cbfTask];
