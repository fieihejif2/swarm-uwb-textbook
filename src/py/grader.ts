/**
 * Pyodide 손코딩 과제의 정의와 채점 하니스.
 * 브라우저(Web Worker)와 Node(vitest 채점기 테스트)가 같은 GRADER_PY 를 쓴다.
 */
import type { L } from '../app/i18n';

export interface CodingTask {
  /** 'ch1-dstwr' 처럼 전체에서 유일한 id */
  id: string;
  chapter: number;
  title: L;
  /** 과제 설명(Tx 인라인 문법 사용 가능). 함수 시그니처, 입력·출력의 단위와 모양을 분명히 적는다. */
  prompt: L;
  /** 학생에게 처음 주는 코드(Python) */
  starter: string;
  /** 기준 구현(Python). "정답 보기" 뒤에 숨긴다. 채점은 이 구현의 출력과 수치 비교한다. */
  solution: string;
  /**
   * 채점 케이스(Python). 반드시 TESTS 리스트를 정의한다:
   *   TESTS = [dict(name_ko=…, name_en=…, run=lambda ns: ns["f"](…), rtol=1e-6, atol=1e-9, hint_ko=…, hint_en=…, hidden=False), …]
   * run(ns) 는 학생 코드의 이름공간 ns 에서 값을 계산해 돌려준다. 같은 run 을 기준 구현에도 돌려 비교한다.
   * hidden=True 인 케이스는 기대값을 화면에 보여주지 않는다. np, math 를 쓸 수 있다.
   */
  tests: string;
  /** 수식↔코드 연동: 기준 구현의 줄 번호 묶음 */
  links?: Record<string, number[]>;
}

export interface CaseResult {
  name_ko: string;
  name_en: string;
  ok: boolean;
  hidden: boolean;
  detail_ko: string;
  detail_en: string;
  hint_ko: string;
  hint_en: string;
  got: string;
  expected: string;
}
export interface GradeResult {
  ok: boolean;
  /** 코드를 실행하는 단계에서 난 오류(문법 오류 등) */
  error: string | null;
  results: CaseResult[];
  stdout: string;
  passed: number;
  total: number;
}

export const GRADER_PY = String.raw`
import json, math, io, contextlib, traceback
import numpy as np

def _short(v, limit=220):
    try:
        with np.printoptions(precision=6, suppress=True, threshold=20):
            s = repr(v)
    except Exception:
        s = "<표시할 수 없는 값>"
    return s if len(s) <= limit else s[:limit] + " …"

def _compare(got, exp, rtol, atol, path="반환값", path_en="return value"):
    """(ok, 한국어 설명, 영어 설명)"""
    if exp is None:
        return (got is None, f"{path}: None 이어야 합니다", f"{path_en}: expected None")
    if got is None:
        return (False, f"{path}: None 이 반환되었습니다. return 문을 빠뜨리지 않았나요?", f"{path_en}: got None. Did you forget a return statement?")
    if isinstance(exp, (bool, np.bool_)):
        ok = isinstance(got, (bool, np.bool_)) and bool(got) == bool(exp)
        return (ok, f"{path}: 참/거짓 값이 다릅니다", f"{path_en}: boolean differs")
    if isinstance(exp, str):
        return (got == exp, f"{path}: 문자열이 다릅니다", f"{path_en}: string differs")
    if isinstance(exp, dict):
        if not isinstance(got, dict):
            return (False, f"{path}: dict 를 반환해야 합니다", f"{path_en}: expected a dict")
        for k in exp:
            if k not in got:
                return (False, f"{path}: 키 '{k}' 가 없습니다", f"{path_en}: missing key '{k}'")
            r = _compare(got[k], exp[k], rtol, atol, f"{path}['{k}']", f"{path_en}['{k}']")
            if not r[0]:
                return r
        return (True, "", "")
    if isinstance(exp, (tuple, list)) and not all(isinstance(e, (int, float, np.number)) for e in exp):
        if not isinstance(got, (tuple, list)) or len(got) != len(exp):
            n = len(got) if hasattr(got, "__len__") else "?"
            return (False, f"{path}: 길이 {len(exp)} 인 튜플/리스트여야 하는데 {n} 입니다", f"{path_en}: expected a tuple/list of length {len(exp)}, got {n}")
        for i, (g, e) in enumerate(zip(got, exp)):
            r = _compare(g, e, rtol, atol, f"{path}[{i}]", f"{path_en}[{i}]")
            if not r[0]:
                return r
        return (True, "", "")
    try:
        g = np.asarray(got, dtype=float)
        e = np.asarray(exp, dtype=float)
    except Exception:
        return (False, f"{path}: 숫자(또는 숫자 배열)로 바꿀 수 없는 값입니다", f"{path_en}: not convertible to a number/array")
    if g.shape != e.shape:
        if g.size == e.size and g.size > 0 and e.ndim <= 1:
            g = g.reshape(e.shape)
        else:
            return (False, f"{path}: 모양이 {e.shape} 이어야 하는데 {g.shape} 입니다", f"{path_en}: expected shape {e.shape}, got {g.shape}")
    if not np.all(np.isfinite(g)):
        return (False, f"{path}: NaN 또는 무한대가 들어 있습니다", f"{path_en}: contains NaN or inf")
    if np.allclose(g, e, rtol=rtol, atol=atol):
        return (True, "", "")
    err = float(np.max(np.abs(g - e)))
    return (False, f"{path}: 기준값과 최대 {err:.3g} 만큼 다릅니다 (허용: 상대 {rtol:g}, 절대 {atol:g})",
            f"{path_en}: differs from the reference by up to {err:.3g} (tolerance: rel {rtol:g}, abs {atol:g})")

def grade(user_src, ref_src, tests_src):
    out = {"ok": False, "error": None, "results": [], "stdout": "", "passed": 0, "total": 0}
    buf = io.StringIO()
    ref_ns = {"__name__": "reference"}
    exec(ref_src, ref_ns)
    user_ns = {"__name__": "student"}
    try:
        with contextlib.redirect_stdout(buf):
            exec(user_src, user_ns)
    except BaseException as ex:
        tb = traceback.format_exc(limit=-1) if not isinstance(ex, SyntaxError) else "".join(traceback.format_exception_only(type(ex), ex))
        out["error"] = tb.strip()[-1500:]
        out["stdout"] = buf.getvalue()[-2000:]
        return json.dumps(out, ensure_ascii=False)
    tns = {"np": np, "math": math}
    exec(tests_src, tns)
    tests = tns["TESTS"]
    out["total"] = len(tests)
    for t in tests:
        rtol = t.get("rtol", 1e-6); atol = t.get("atol", 1e-9)
        hidden = bool(t.get("hidden", False))
        res = {"name_ko": t.get("name_ko", ""), "name_en": t.get("name_en", t.get("name_ko", "")), "ok": False, "hidden": hidden,
               "detail_ko": "", "detail_en": "", "hint_ko": t.get("hint_ko", ""), "hint_en": t.get("hint_en", t.get("hint_ko", "")), "got": "", "expected": ""}
        exp = t["run"](ref_ns)
        try:
            with contextlib.redirect_stdout(buf):
                got = t["run"](user_ns)
            ok, dko, den = _compare(got, exp, rtol, atol)
            res["ok"] = bool(ok); res["detail_ko"] = dko if not ok else ""; res["detail_en"] = den if not ok else ""
            res["got"] = _short(got)
        except KeyError as ex:
            res["detail_ko"] = f"함수 {ex} 를 찾을 수 없습니다. 함수 이름을 바꾸지 않았는지 확인하세요."
            res["detail_en"] = f"Function {ex} not found. Check that you did not rename it."
        except BaseException as ex:
            last = traceback.format_exc(limit=-1).strip().splitlines()
            res["detail_ko"] = f"실행 중 오류: {type(ex).__name__}: {ex}"
            res["detail_en"] = f"Runtime error: {type(ex).__name__}: {ex}"
            res["got"] = "\n".join(last[-4:])
        if not hidden:
            res["expected"] = _short(exp)
        out["passed"] += 1 if res["ok"] else 0
        out["results"].append(res)
    out["ok"] = out["passed"] == out["total"] and out["total"] > 0
    out["stdout"] = buf.getvalue()[-2000:]
    return json.dumps(out, ensure_ascii=False)
`;

/** loadPyodide() 로 만든 인스턴스에 하니스를 올리고 채점 함수를 돌려준다 (브라우저·Node 공용). */
export async function makeGrader(pyodide: any): Promise<(userSrc: string, task: Pick<CodingTask, 'solution' | 'tests'>) => GradeResult> {
  await pyodide.loadPackage('numpy');
  pyodide.runPython(GRADER_PY);
  const grade = pyodide.globals.get('grade');
  return (userSrc, task) => JSON.parse(grade(userSrc, task.solution, task.tests)) as GradeResult;
}
