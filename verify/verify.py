# -*- coding: utf-8 -*-
"""
Python(numpy/scipy) 독립 기준 구현으로 TypeScript 엔진(src/sim)을 교차검증한다.
입력은 verify/out/ts_results.json (ts_export.ts 가 만든다).
항목별 허용 오차는 TOL 에 명시한다. 하나라도 실패하면 종료 코드 1.
"""
import json, math, sys, io
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.linalg import solve_discrete_are
from scipy import integrate, stats

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = Path(__file__).resolve().parent
D = json.loads((HERE / "out" / "ts_results.json").read_text(encoding="utf-8"))
C = 299_792_458.0

TOL = {
    "dstwr_m": 1e-9,          # DS-TWR 거리: 타임라인 시뮬레이션과의 차 [m]
    "gn_exact_m": 1e-7,       # 노이즈 없는 가우스-뉴턴: 참값과의 차 [m]
    "gn_scipy_m": 1e-5,       # 노이즈 있는 경우: scipy least_squares 와의 차 [m]
    "dop_rel": 1e-9,          # DOP: 기하행렬 해석식과의 상대오차
    "rate_rel": 1e-12,        # 갱신율: 메시지 수 모델과의 상대오차
    "rate_count": 1,          # 일정 시뮬레이션 횟수: ±1회
    "dare_rel": 1e-7,         # KF 정상상태 공분산: solve_discrete_are 와의 상대오차
    "delay_rel": 0.01,        # 합의 지연 한계: π/(2kλ_N) 과의 상대오차 (TS 시뮬레이션)
    "delay_rel_py": 0.015,    # 같은 항목, Python 독립 시뮬레이션(dt 가 더 큼)
    "lambda2_rel": 0.01,      # λ₂: 감쇠율 피팅값과의 상대오차
    "loss_abs": 0.002,        # 손실률: 정상상태 해석값과의 절대오차
    "cbf_det_m": 1e-6,        # CBF 결정론 시나리오: 두 구현의 최소 이격거리 차 [m]
    "gate_rel": 2e-3,         # 게이트 통과 통계: scipy 적분과의 상대오차
}

rows = []
def check(item, name, err, tol, extra=""):
    ok = bool(err <= tol)
    rows.append((item, name, err, tol, ok, extra))
    return ok

# ───────────────────────── 1) DS-TWR
def twr_timeline(d, reply1, reply2, eA, eB):
    """실제 시간축에서 사건을 하나씩 배치하고 각 장치 시계로 읽는다."""
    T = d / C
    clkA = lambda t: t * (1 + eA)
    clkB = lambda t: t * (1 + eB)
    t_poll_tx = 0.0
    t_poll_rx = t_poll_tx + T
    t_ans_tx = t_poll_rx + reply1 / (1 + eB)      # B 시계로 reply1 이 흐르는 실제 시간
    t_ans_rx = t_ans_tx + T
    t_fin_tx = t_ans_rx + reply2 / (1 + eA)
    t_fin_rx = t_fin_tx + T
    Ra = clkA(t_ans_rx) - clkA(t_poll_tx)          # T_round1 (A)
    Db = clkB(t_ans_tx) - clkB(t_poll_rx)          # T_reply1 (B)
    Rb = clkB(t_fin_rx) - clkB(t_ans_tx)           # T_round2 (B)
    Da = clkA(t_fin_tx) - clkA(t_ans_rx)           # T_reply2 (A)
    tof_ds = (Ra * Rb - Da * Db) / (Ra + Rb + Da + Db)
    tof_ss = (Ra - Db) / 2
    return tof_ds * C, tof_ss * C

for c in D["twr"]:
    i = c["in"]
    ds, ss = twr_timeline(i["d"], i["reply1"], i["reply2"], i["eA"], i["eB"])
    check("1 DS-TWR", f"d={i['d']} m: TS vs 타임라인", abs(ds - c["ds"]["dEst"]), TOL["dstwr_m"])
    check("1 DS-TWR", f"d={i['d']} m: SS-TWR TS vs 타임라인", abs(ss - c["ss"]["dEst"]), TOL["dstwr_m"])
    # 해석적 오차 한계: DS-TWR 오차 ≤ d·max|e| (1차), SS-TWR 오차 ≈ c(eA−eB)T_reply/2
    # 덧셈 항은 배정밀도 바닥(c·ε·T_reply ≈ 1e-10 m)을 덮기 위한 것으로 TOL["dstwr_m"] 과 같다
    bound = i["d"] * max(abs(i["eA"]), abs(i["eB"])) * 1.01 + TOL["dstwr_m"]
    check("1 DS-TWR", f"d={i['d']} m: |오차| ≤ d·max|e|", abs(c["ds"]["dEst"] - i["d"]), bound)
    ss_pred = C * (i["eA"] - i["eB"]) * i["reply1"] / 2
    check("1 DS-TWR", f"d={i['d']} m: SS 오차 ≈ c(eA−eB)T/2", abs((c["ss"]["dEst"] - i["d"]) - ss_pred), 0.02 * abs(ss_pred) + 2 * i["d"] * 3e-5 + 1e-9)

# ───────────────────────── 2) 가우스-뉴턴
for k, c in enumerate(D["gn"]):
    A = np.array(c["anchors"]); truth = np.array(c["truth"]); x0 = np.array(c["x0"])
    pairs = np.array(c["pairs"])
    f_r = lambda x, r: np.linalg.norm(x - A, axis=1) - r
    def f_t(x, z):
        d = np.linalg.norm(x - A, axis=1)
        return d[pairs[:, 1]] - d[pairs[:, 0]] - z
    kw = dict(method="lm", xtol=1e-14, ftol=1e-14, gtol=1e-14)
    check("2 가우스-뉴턴", f"case{k} 거리(무잡음) → 참값", np.linalg.norm(np.array(c["ts_range_exact"]) - truth), TOL["gn_exact_m"])
    check("2 가우스-뉴턴", f"case{k} TDoA(무잡음) → 참값", np.linalg.norm(np.array(c["ts_tdoa_exact"]) - truth), TOL["gn_exact_m"])
    sr = least_squares(f_r, x0, args=(np.array(c["ranges_noisy"]),), **kw).x
    st = least_squares(f_t, x0, args=(np.array(c["tdoa_noisy"]),), **kw).x
    check("2 가우스-뉴턴", f"case{k} 거리(잡음) vs scipy", np.linalg.norm(np.array(c["ts_range_noisy"]) - sr), TOL["gn_scipy_m"])
    check("2 가우스-뉴턴", f"case{k} TDoA(잡음) vs scipy", np.linalg.norm(np.array(c["ts_tdoa_noisy"]) - st), TOL["gn_scipy_m"])

# ───────────────────────── 3) DOP
def dops(H):
    N = H.T @ H
    if np.linalg.cond(N) > 1e12:          # 특이(또는 거의 특이) 기하 → 풀 수 없음
        return None
    Q = np.linalg.inv(N)
    return dict(pdop=math.sqrt(Q[0, 0] + Q[1, 1] + Q[2, 2]), hdop=math.sqrt(Q[0, 0] + Q[1, 1]), vdop=math.sqrt(Q[2, 2]), gdop=math.sqrt(np.trace(Q)))
for k, c in enumerate(D["dop"]):
    A = np.array(c["anchors"]); p = np.array(c["p"])
    E = (p - A) / np.linalg.norm(p - A, axis=1, keepdims=True)
    n = len(A)
    ring = [(i, (i + 1) % n) for i in range(n)]
    allp = [(i, j) for i in range(n) for j in range(i + 1, n)]
    ref = {
        "range": dops(E),
        "tdoa_ring": dops(np.array([E[j] - E[i] for i, j in ring])),
        "tdoa_all": dops(np.array([E[j] - E[i] for i, j in allp])),
        "pseudorange": dops(np.hstack([E, np.ones((n, 1))])),
    }
    for name, r in ref.items():
        ts = c[name]
        if ts["pdop"] is None or r is None:  # JSON 에서 Infinity → null (특이 기하)
            check("3 DOP", f"case{k} {name}: 특이 기하 판정 일치", 0.0 if (ts["pdop"] is None and r is None) else 1.0, 0.5)
            continue
        err = max(abs(ts[q] - r[q]) / r[q] for q in ("pdop", "hdop", "vdop", "gdop"))
        check("3 DOP", f"case{k} {name}", err, TOL["dop_rel"])
    # 의사거리 형태의 위치 DOP 는 "모든 독립 쌍 + 올바른 가중"의 TDoA 와 같아야 한다(교재 유도 확인)
    if ref["pseudorange"] is None:
        continue
    Dm = np.array([[-1 if q == 0 else (1 if q == j else 0) for q in range(n)] for j in range(1, n)], float)
    Hd = Dm @ E; W = np.linalg.inv(Dm @ Dm.T)
    Qw = np.linalg.inv(Hd.T @ W @ Hd)
    check("3 DOP", f"case{k} 의사거리 PDOP = 가중 TDoA PDOP", abs(math.sqrt(np.trace(Qw)) - ref["pseudorange"]["pdop"]) / ref["pseudorange"]["pdop"], 1e-8)

# ───────────────────────── 4) 갱신율 (메시지 수 모델)
for c in D["rate"]:
    i = c["in"]
    # TWR: 채널이 초당 처리하는 교환 수를 태그가 나눠 갖고, 한 바퀴에 앵커 수만큼 필요
    per_tag = (1.0 / i["rangeTime"]) / i["nTags"]
    pos = per_tag / i["nAnchors"]
    check("4 갱신율", f"TWR tags={i['nTags']} anc={i['nAnchors']} 식", abs(c["twr"]["positionRate"] - pos) / pos, TOL["rate_rel"])
    # 독립적인 사건 세기: 슬롯 k 는 태그 (k mod N) 의 것
    slots = int(math.floor(i["duration"] / i["rangeTime"] + 1e-9))
    counts = [len(range(t, slots, i["nTags"])) for t in range(i["nTags"])]
    check("4 갱신율", f"TWR tags={i['nTags']} anc={i['nAnchors']} 일정 세기", max(abs(a - b) for a, b in zip(counts, c["sched_ranges"])), TOL["rate_count"])
    check("4 갱신율", f"TWR tags={i['nTags']} anc={i['nAnchors']} 세기 vs 식", abs(c["sched_ranges"][0] / i["duration"] - per_tag) / per_tag, 0.01)
    tpos = 1.0 / (i["nAnchors"] * i["slotTime"])
    check("4 갱신율", f"TDoA anc={i['nAnchors']} (태그 수 무관)", abs(c["tdoa"]["positionRate"] - tpos) / tpos, TOL["rate_rel"])

# ───────────────────────── 5) KF 정상상태 공분산
for k, c in enumerate(D["kf"]):
    F, H, Q, R = (np.array(c[q]) for q in ("F", "H", "Q", "R"))
    P = solve_discrete_are(F.T, H.T, Q, R)             # 예측(사전) 공분산
    S = H @ P @ H.T + R
    K = P @ H.T @ np.linalg.inv(S)
    Ppost = P - K @ H @ P
    check("5 KF 정상상태", f"case{k} P⁻ vs DARE", np.max(np.abs(np.array(c["Pprior"]) - P)) / np.max(np.abs(P)), TOL["dare_rel"])
    check("5 KF 정상상태", f"case{k} P⁺ vs DARE", np.max(np.abs(np.array(c["Ppost"]) - Ppost)) / np.max(np.abs(Ppost)), TOL["dare_rel"])
    if c["sigma_fn"] is not None:
        check("5 KF 정상상태", f"case{k} σ_est 함수", abs(c["sigma_fn"] - math.sqrt(Ppost[0, 0])) / math.sqrt(Ppost[0, 0]), TOL["dare_rel"])

# ───────────────────────── 6) 합의 지연 한계, 7) λ₂
def diverges_py(L, x0, gain, d, dt, T):
    steps = int(round(T / dt))
    X = np.empty((steps + 1 + d, len(x0)))
    X[: d + 1] = x0                                   # t ≤ 0 은 초기값
    M = -gain * dt * L
    for k in range(d, steps + d):
        X[k + 1] = X[k] + M @ X[k - d]
        if not np.isfinite(X[k + 1, 0]) or abs(X[k + 1, 0]) > 1e100:
            return True
    dis = np.linalg.norm(X[d:] - X[d:].mean(axis=1, keepdims=True), axis=1)
    n = len(dis)
    return dis[int(0.75 * n):].max() > dis[int(0.5 * n): int(0.75 * n)].max()

for c in D["consensus"]:
    A = np.array(c["A"]); L = np.diag(A.sum(1)) - A
    ev = np.linalg.eigvalsh(L)
    lamN, lam2 = ev[-1], ev[1]
    theory = math.pi / (2 * c["gain"] * lamN)
    tag = f"{c['graph']} k={c['gain']}"
    check("6 지연 한계", f"{tag}: 고유값 스펙트럼", np.max(np.abs(np.array(c["spectrum_ts"]) - ev)), 1e-9)
    check("6 지연 한계", f"{tag}: TS 시뮬레이션 τ vs π/(2kλ_N)", abs(c["tau_sim"] - theory) / theory, TOL["delay_rel"], f"τ_sim={c['tau_sim']:.4f}s τ*={theory:.4f}s")
    # 오일러 이산화의 정확한 경계: 2 sin(π/(2(2d+1))) = k λ_N dt → τ = π/(2kλ_N) − dt/2
    disc = theory - c["dt"] / 2
    check("6 지연 한계", f"{tag}: 이산화 보정 경계와의 차", abs(c["tau_sim"] - disc), 2 * c["dt"])
    # Python 독립 시뮬레이션으로 이분법
    dt = 0.001; lo, hi = 0, int(round(2 * theory / dt))
    x0 = np.array(c["x0"])
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if diverges_py(L, x0, c["gain"], mid, dt, 80.0): hi = mid
        else: lo = mid
    tau_py = 0.5 * (lo + hi) * dt
    check("6 지연 한계", f"{tag}: Python 시뮬레이션 τ vs 이론", abs(tau_py - theory) / theory, TOL["delay_rel_py"], f"τ_py={tau_py:.4f}s")
    rate = c["gain"] * lam2
    check("7 λ₂ 수렴 속도", f"{tag}: 감쇠율 피팅 vs kλ₂", abs(c["decay_fit"] - rate) / rate, TOL["lambda2_rel"], f"fit={c['decay_fit']:.4f} kλ₂={rate:.4f}")
for c in D["neighborOnly"]:
    check("6 지연 한계", f"{c['graph']}: 이웃만 지연(τ=3 s)이면 발산하지 않음", c["final_ratio"], 1e-3)

# ───────────────────────── 8) 손실 모델
rng = np.random.default_rng(7)
for k, c in enumerate(D["loss"]):
    m = c["in"]
    if m["model"] == "ge":
        piB = m["pGB"] / (m["pGB"] + m["pBG"])
        analytic = (1 - piB) * m["lossGood"] + piB * m["lossBad"]
        # 독립 시뮬레이션
        n = 1_000_000
        u = rng.random((n, 2)); bad = rng.random() < piB; lost = 0
        for i in range(n):
            lost += u[i, 0] < (m["lossBad"] if bad else m["lossGood"])
            bad = (u[i, 1] >= m["pBG"]) if bad else (u[i, 1] < m["pGB"])
        check("8 손실 모델", f"case{k} GE: Python 시뮬레이션 vs 해석", abs(lost / n - analytic), TOL["loss_abs"] * 1.5)
    else:
        analytic = m["p"]
    check("8 손실 모델", f"case{k} {m['model']}: TS 해석식", abs(c["analytic_ts"] - analytic), 1e-12)
    check("8 손실 모델", f"case{k} {m['model']}: TS 장시간 시뮬레이션 vs 해석", abs(c["sim_rate"] - analytic), TOL["loss_abs"], f"sim={c['sim_rate']:.5f} 해석={analytic:.5f}")

# ───────────────────────── 9) CBF
def cbf_filter_py(p_self, p_other, u_nom, d_min, alpha, kz, v_max, E):
    S = np.array([1.0, 1.0, 1.0 / kz])
    r = (p_self - p_other) * S
    d = np.linalg.norm(r); n = r / d
    nrm = np.linalg.norm(u_nom)
    if nrm > v_max: u_nom = u_nom * v_max / nrm
    w0 = u_nom * S
    a = alpha / 2 * (d - E - d_min)
    beta = min(2 * E / d, 0.999)
    wn0 = n @ w0; wt = w0 - wn0 * n; t0 = np.linalg.norm(wt)
    need = lambda t: (-a + beta * math.sqrt(a * a + (1 - beta ** 2) * t * t)) / (1 - beta ** 2)
    if wn0 >= need(t0) - 1e-12:
        return u_nom, False
    def build(s):
        return (max(wn0, need(s * t0)) * n + s * wt) / S
    u = build(1.0)
    if np.linalg.norm(u) > v_max + 1e-12:
        if np.linalg.norm(build(0.0)) > v_max + 1e-12:
            f = n / S
            return f * v_max / np.linalg.norm(f), True
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if np.linalg.norm(build(mid)) <= v_max: lo = mid
            else: hi = mid
        u = build(lo)
    return u, False

def ell(r, kz): return math.sqrt(r[0] ** 2 + r[1] ** 2 + (r[2] / kz) ** 2)

def cbf_pair_py(P, pA, pB, rng=None):
    E = 2 * P["eps"] + P["vMax"] * P["ageMax"]
    steps = int(round(P["T"] / P["dt"])); max_age = int(round(P["ageMax"] / P["dt"]))
    gA, gB = pB.copy(), pA.copy(); hA, hB = [], []
    mind = ell(pA - pB, P["kz"]); infeasible = 0
    def noisy(q):
        if rng is None or P["eps"] == 0: return q.copy()
        v = rng.normal(size=3); v *= P["eps"] * rng.random() ** (1 / 3) / np.linalg.norm(v)
        return q + v
    def nominal(q, g):
        u = 1.5 * (g - q); nn = np.linalg.norm(u)
        return u * P["vMax"] / nn if nn > P["vMax"] else u
    for k in range(steps):
        eA, eB = noisy(pA), noisy(pB); hA.append(eA); hB.append(eB)
        ageA = 0 if rng is None else min(int(rng.integers(0, max_age + 1)), len(hB) - 1)
        ageB = 0 if rng is None else min(int(rng.integers(0, max_age + 1)), len(hA) - 1)
        uA, fa = cbf_filter_py(eA, hB[-1 - ageA], nominal(eA, gA), P["dMin"], P["alpha"], P["kz"], P["vMax"], E)
        uB, fb = cbf_filter_py(eB, hA[-1 - ageB], nominal(eB, gB), P["dMin"], P["alpha"], P["kz"], P["vMax"], E)
        infeasible += fa + fb
        pA = pA + uA * P["dt"]; pB = pB + uB * P["dt"]
        mind = min(mind, ell(pA - pB, P["kz"]))
    return mind, infeasible, pA, pB

cb = D["cbf"]; P = cb["params"]
des_E = 2 * P["eps"] + P["vMax"] * P["ageMax"]
check("9 CBF", "설계 조건 dMin > 3E", 0.0 if P["dMin"] > 3 * des_E else 1.0, 0.5, f"E={des_E:.3f} m")
check("9 CBF", "설계 조건 α ≤ α_max", max(0.0, P["alpha"] - cb["design"]["alphaMax"]), 0.0)
check("9 CBF", f"TS 강건 CBF 몬테카를로 {cb['robust_n']}회: 위반 0건", cb["robust_violations"], 0, f"최소 이격 {cb['robust_min']:.4f} m ≥ dMin {P['dMin']} m")
check("9 CBF", "TS 강건 CBF: 보장 불가(속도 포화) 스텝 0", cb["robust_infeasible"], 0)
check("9 CBF", "TS 강건 CBF: 목표 도달 비율 ≥ 99%", 1 - cb["robust_reached"] / cb["robust_n"], 0.01)
check("9 CBF", "대조군: CBF 끄면 위반이 실제로 발생", 0.0 if cb["off_violations"] > 0 else 1.0, 0.5, f"{cb['off_violations']}/{cb['off_n']}회 위반")
dp = cb["det_params"]
md, inf, fA, fB = cbf_pair_py(dp, np.array(dp["init"]["pA"]), np.array(dp["init"]["pB"]))
check("9 CBF", "결정론 시나리오: TS vs Python 최소 이격", abs(md - cb["det_min"]), TOL["cbf_det_m"], f"TS={cb['det_min']:.6f} PY={md:.6f}")
r2 = np.random.default_rng(11); viol = 0; worst = 1e9; inf_total = 0
for i in range(300):
    ang = r2.uniform(0, 2 * math.pi); half = P["startDist"] / 2; dz = r2.uniform(-0.6, 0.6) * half
    pA = np.array([half * math.cos(ang) + r2.uniform(-.1, .1), half * math.sin(ang) + r2.uniform(-.1, .1), 1.5 + dz])
    pB = np.array([-half * math.cos(ang), -half * math.sin(ang), 1.5 - dz])
    md, inf, _, _ = cbf_pair_py(P, pA, pB, r2)
    worst = min(worst, md); viol += md < P["dMin"] - 1e-9; inf_total += inf
check("9 CBF", "Python 독립 구현 몬테카를로 300회: 위반 0건", viol, 0, f"최소 이격 {worst:.4f} m")
check("9 CBF", "Python 독립 구현: 보장 불가 스텝 0", inf_total, 0)

# ───────────────────────── 10) 게이트 통과 통계 (추가 항목)
for k, c in enumerate(D["gate"]):
    i = c["in"]; s, p, m, g = i["sigma"], i["pNlos"], i["biasMean"], i["k"]
    lim = g * s if g > 0 else np.inf
    emg = stats.exponnorm(K=m / s, loc=0, scale=s); nor = stats.norm(0, s)
    q = lambda f: integrate.quad(f, -lim, lim, limit=400)[0] if np.isfinite(lim) else integrate.quad(f, -np.inf, np.inf, limit=400)[0]
    accL, accN = q(nor.pdf), q(emg.pdf)
    acc = (1 - p) * accL + p * accN
    mean_acc = p * q(lambda x: x * emg.pdf(x)) / acc
    rms_acc = math.sqrt(((1 - p) * q(lambda x: x * x * nor.pdf(x)) + p * q(lambda x: x * x * emg.pdf(x))) / acc)
    t = c["ts"]
    check("10 게이트 통계", f"case{k} 통과율", abs(t["acceptRate"] - acc) / acc, TOL["gate_rel"])
    check("10 게이트 통계", f"case{k} 통과 오차 RMS", abs(t["rmsAccepted"] - rms_acc) / rms_acc, TOL["gate_rel"])
    check("10 게이트 통계", f"case{k} 통과 오차 평균", abs(t["meanAccepted"] - mean_acc), TOL["gate_rel"] * max(abs(mean_acc), s))

# ───────────────────────── 보고
items = {}
for it, name, err, tol, ok, extra in rows:
    items.setdefault(it, []).append((name, err, tol, ok, extra))
fail = 0
verbose = "-v" in sys.argv
print("\n항목별 검증 결과 (허용 오차는 verify/verify.py 의 TOL)")
print("─" * 78)
for it, lst in items.items():
    bad = [x for x in lst if not x[3]]
    fail += len(bad)
    worst = max(lst, key=lambda x: (x[1] / x[2]) if x[2] > 0 else x[1])
    print(f"{'통과' if not bad else '실패'}  {it:<16} {len(lst) - len(bad)}/{len(lst)}   (가장 빡빡한 항목: {worst[0]} — 오차 {worst[1]:.3g} / 허용 {worst[2]:.3g})")
    for name, err, tol, ok, extra in (lst if verbose else bad + [x for x in lst if x[4] and x[3]]):
        print(f"      {'ok ' if ok else 'NG '} {name}: {err:.4g} (허용 {tol:.4g}) {extra}")
print("─" * 78)
print(f"총 {len(rows)}개 검사, 실패 {fail}개")
(HERE / "out" / "verify_report.json").write_text(json.dumps([dict(item=a, name=b, err=float(c), tol=float(d), ok=e, extra=f) for a, b, c, d, e, f in rows], ensure_ascii=False, indent=1), encoding="utf-8")
sys.exit(1 if fail else 0)
