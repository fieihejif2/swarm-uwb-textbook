import { useEffect, useRef, useState } from 'preact/hooks';
import { tr } from '../app/i18n';
import { loadJson, saveJson } from '../app/storage';
import { markSolved, solved } from '../app/store';
import { GradeTimeout, gradeCode, pyStatus, warmUpPython } from '../py/client';
import type { CodingTask, GradeResult } from '../py/grader';
import { CodeView } from './CodeView';
import { rich } from './Tx';

/** ⑤ Pyodide 손코딩 과제: 편집기 + 자동 채점 + 힌트 + (숨긴) 정답 */
export function CodeTask({ task }: { task: CodingTask }) {
  const key = `code:${task.id}`;
  const [code, setCode] = useState<string>(() => loadJson<string>(key, task.starter));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<GradeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSol, setShowSol] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const isSolved = solved.value.includes(task.id);
  useEffect(() => { const t = setTimeout(() => saveJson(key, code), 300); return () => clearTimeout(t); }, [code]);
  const lineCount = code.split('\n').length;
  const run = async (src = code) => {
    setBusy(true); setErr(null);
    try {
      const r = await gradeCode(src, task);
      setRes(r);
      if (r.ok) markSolved(task.id);
    } catch (e) {
      setRes(null);
      setErr(e instanceof GradeTimeout
        ? tr({ ko: '15초 안에 끝나지 않아 실행을 중단했습니다. 끝나지 않는 반복문이 있는지 확인하세요.', en: 'Stopped after 15 s. Check for a loop that never ends.' })
        : tr({ ko: `Python 실행 환경을 불러오지 못했습니다: ${(e as Error).message}`, en: `Could not load the Python runtime: ${(e as Error).message}` }));
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // Tab 은 들여쓰기. 편집기를 빠져나가려면 Esc 를 누른 뒤 Tab.
      if (el.dataset.esc === '1') { el.dataset.esc = ''; return; }
      e.preventDefault();
      const s = el.selectionStart, t = el.selectionEnd;
      const next = code.slice(0, s) + '    ' + code.slice(t);
      setCode(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 4; });
    } else if (e.key === 'Escape') {
      el.dataset.esc = '1';
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    } else if (e.key === 'Enter') {
      // 자동 들여쓰기
      const s = el.selectionStart;
      const lineStart = code.lastIndexOf('\n', s - 1) + 1;
      const line = code.slice(lineStart, s);
      const indent = (line.match(/^\s*/)?.[0] ?? '') + (line.trimEnd().endsWith(':') ? '    ' : '');
      e.preventDefault();
      const next = code.slice(0, s) + '\n' + indent + code.slice(el.selectionEnd);
      setCode(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 1 + indent.length; });
    } else {
      el.dataset.esc = '';
    }
  };
  const status = pyStatus.value;
  return (
    <div class="card task" data-testid={`task-${task.id}`} data-task-id={task.id}>
      <div class="card-title">
        <span class="tag">{tr({ ko: '손코딩 과제', en: 'Coding task' })}</span><span>{rich(task.title)}</span>
        {isSolved && <span class="status good">✓ {tr({ ko: '통과', en: 'Passed' })}</span>}
      </div>
      <div style={{ marginBottom: '10px' }}>{tr(task.prompt).split('\n\n').map((para, i) => <p key={i}>{rich(para)}</p>)}</div>
      <div class="editor">
        <div class="gutter" ref={gutter} aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}</div>
        <textarea
          ref={ta} value={code} spellcheck={false} autocapitalize="off" autocomplete="off" wrap="off" rows={Math.min(28, Math.max(10, lineCount + 1))}
          aria-label={tr({ ko: `Python 코드 편집기: ${task.title.ko}. Tab 은 들여쓰기이며, 빠져나가려면 Esc 를 누른 뒤 Tab 을 누르세요.`, en: `Python editor: ${task.title.en}. Tab indents; press Esc then Tab to leave.` })}
          data-testid={`editor-${task.id}`}
          onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} onKeyDown={onKeyDown} onFocus={warmUpPython}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }}
        />
      </div>
      <div class="btn-row" style={{ marginTop: '10px' }}>
        <button type="button" class="btn primary" onClick={() => run()} disabled={busy} data-testid={`run-${task.id}`}>
          {busy ? (status === 'loading' ? tr({ ko: 'Python 불러오는 중…', en: 'Loading Python…' }) : tr({ ko: '채점 중…', en: 'Grading…' })) : tr({ ko: '▶ 실행하고 채점', en: '▶ Run and grade' })}
        </button>
        <button type="button" class="btn" onClick={() => { if (confirm(tr({ ko: '작성한 코드를 지우고 처음 상태로 되돌릴까요?', en: 'Discard your code and restore the starter?' }))) { setCode(task.starter); setRes(null); } }}>{tr({ ko: '처음으로', en: 'Reset' })}</button>
        <button type="button" class="btn" onClick={() => setShowSol(!showSol)} aria-expanded={showSol} data-testid={`solution-${task.id}`}>{tr(showSol ? { ko: '정답 숨기기', en: 'Hide solution' } : { ko: '정답 보기', en: 'Show solution' })}</button>
        <span class="muted small kbd-hint">Ctrl+Enter</span>
      </div>
      <div aria-live="polite">
        {err && <p style={{ marginTop: '10px' }}><span class="status bad">✕ {err}</span></p>}
        {res && res.error && (
          <div style={{ marginTop: '10px' }}>
            <span class="status bad">✕ {tr({ ko: '코드를 실행하지 못했습니다', en: 'Your code did not run' })}</span>
            <pre class="out">{res.error}</pre>
          </div>
        )}
        {res && !res.error && (
          <div style={{ marginTop: '10px' }} data-testid={`result-${task.id}`} data-ok={String(res.ok)}>
            <span class={`status ${res.ok ? 'good' : 'bad'}`}>{res.ok ? '✓' : '✕'} {tr({ ko: `${res.total}개 중 ${res.passed}개 통과`, en: `${res.passed} of ${res.total} passed` })}</span>
            <ul class="grade-list">
              {res.results.map((c, i) => (
                <li key={i} class={c.ok ? 'pass' : 'fail'}>
                  <b>{c.ok ? '✓' : '✕'} {tr({ ko: c.name_ko, en: c.name_en })}</b>{c.hidden && <span class="muted small"> · {tr({ ko: '숨은 케이스', en: 'hidden case' })}</span>}
                  {!c.ok && (
                    <>
                      <div>{tr({ ko: c.detail_ko, en: c.detail_en })}</div>
                      {c.got && <div class="muted small grade-out" style={{ fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' }}>{tr({ ko: '내 출력', en: 'Yours' })}: {c.got}</div>}
                      {c.expected && <div class="muted small grade-out" style={{ fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' }}>{tr({ ko: '기준값', en: 'Expected' })}: {c.expected}</div>}
                      {(c.hint_ko || c.hint_en) && <div class="hint">💡 {rich({ ko: c.hint_ko, en: c.hint_en })}</div>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {res && res.stdout && <pre class="out" aria-label="stdout">{res.stdout}</pre>}
      </div>
      {showSol && (
        <div style={{ marginTop: '12px' }}>
          <p class="muted small">{tr({ ko: '기준 구현입니다. 먼저 스스로 풀어 본 뒤에 비교해 보세요.', en: 'Reference implementation. Try it yourself first, then compare.' })}</p>
          <CodeView code={task.solution} links={task.links} />
          <button type="button" class="btn" onClick={() => { if (code !== task.starter && code !== task.solution && !confirm(tr({ ko: '편집기의 내 코드를 정답으로 덮어씁니다. 계속할까요?', en: 'This replaces your code in the editor with the solution. Continue?' }))) return; setCode(task.solution); run(task.solution); }} data-testid={`fill-${task.id}`}>{tr({ ko: '정답을 편집기에 넣고 채점', en: 'Load solution into editor and grade' })}</button>
        </div>
      )}
    </div>
  );
}
