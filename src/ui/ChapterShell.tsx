import { useEffect } from 'preact/hooks';
import { BUDGET_LABELS, budgetSrc } from '../app/budgetLabels';
import { CHAPTERS, ChapterDef } from '../app/chapters';
import { fmt, tr } from '../app/i18n';
import { anchor } from '../app/router';
import { budget, budgetOpen, config, markVisited } from '../app/store';
import { SrcBadge } from './Badge';
import { M } from './Math';
import { rich } from './Tx';

/** 챕터 공통 틀: 제목 → ① 학습 목표 → 본문 → ⑦ 오차 예산 → ⑧ 요약·다음 질문 */
export function ChapterShell({ def }: { def: ChapterDef }) {
  useEffect(() => {
    markVisited(def.id);
    if (!anchor.value) window.scrollTo(0, 0);
    document.title = `${def.id}. ${tr(def.title)} — ${tr({ ko: '군집은 서로를 어떻게 아는가', en: 'How does a swarm know itself?' })}`;
  }, [def.id]);
  const b = budget.value;
  const items = b.items.filter((i) => def.budget.items.includes(i.id));
  const next = CHAPTERS.find((c) => c.id === def.id + 1);
  const prev = CHAPTERS.find((c) => c.id === def.id - 1);
  return (
    <article data-testid={`chapter-${def.id}`} data-chapter={def.id}>
      <header class="chapter-head">
        <div class="kicker">{tr({ ko: `${def.id}장`, en: `Chapter ${def.id}` })}</div>
        <h1>{tr(def.title)}</h1>
        <p class="lead">{rich(def.lead)}</p>
      </header>
      <div class="card objectives">
        <div class="card-title">{tr({ ko: '이 장을 마치면', en: 'After this chapter you can' })}</div>
        <ul>{def.objectives.map((o, i) => <li key={i}>{rich(o)}</li>)}</ul>
      </div>
      <def.Body />
      <div class="card budget-add" id="der-budget" data-derivation="budget" data-testid="budget-add">
        <div class="card-title"><span class="tag">{tr({ ko: '오차 예산', en: 'Error budget' })}</span><span>{tr({ ko: '이 장이 예산에 더하는 것', en: 'What this chapter adds to the budget' })}</span></div>
        <p>{rich(def.budget.note)}</p>
        {items.length > 0 && (
          <div class="table-wrap">
            <table class="tbl">
              <tbody>
                {items.map((it) => {
                  const scale = it.unit === 'm' ? 100 : it.unit === 's' ? 1000 : 1;
                  const unit = it.unit === 'm' ? 'cm' : it.unit === 's' ? 'ms' : it.unit;
                  return (
                    <tr key={it.id}>
                      <td>{tr(BUDGET_LABELS[it.id] ?? { ko: it.id, en: it.id })}</td>
                      <td><M tex={it.formula} /></td>
                      <td class="r">
                        <b>{fmt(it.value * scale, 3)}{it.valueV !== undefined ? ` / ${fmt(it.valueV * scale, 3)}` : ''}</b> {unit}
                        <SrcBadge src={budgetSrc(it, config.value)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" class="btn" style={{ marginTop: '10px' }} onClick={() => (budgetOpen.value = true)}>{tr({ ko: '전체 오차 예산 열기 ▴', en: 'Open the full error budget ▴' })}</button>
      </div>
      <div class="card summary">
        <div class="card-title">{tr({ ko: '3줄 요약', en: 'Three-line summary' })}</div>
        <ol>{def.summary.map((s, i) => <li key={i}>{rich(s)}</li>)}</ol>
      </div>
      <div class="card" style={{ borderStyle: 'dashed' }}>
        <div class="card-title">{tr({ ko: '다음 장으로 넘어가는 질문', en: 'The question that leads to the next chapter' })}</div>
        <p style={{ marginBottom: 0 }}>{rich(def.next)}</p>
      </div>
      <nav class="next-link no-print" aria-label={tr({ ko: '이전·다음 장', en: 'Previous and next chapter' })}>
        {prev ? <a class="btn" href={`#/ch/${prev.id}`}>← {prev.id}. {tr(prev.title)}</a> : <a class="btn" href="#/">← {tr({ ko: '시작하기', en: 'Start' })}</a>}
        {next ? <a class="btn primary" href={`#/ch/${next.id}`} data-testid="next-chapter">{next.id}. {tr(next.title)} →</a> : <a class="btn primary" href="#/report" data-testid="next-chapter">{tr({ ko: '우리 시스템 리포트', en: 'Our system report' })} →</a>}
      </nav>
    </article>
  );
}
