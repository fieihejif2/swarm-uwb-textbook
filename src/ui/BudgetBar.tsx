/** 화면 하단에 항상 접혀 있는 오차 예산. 챕터를 지날 때마다 그 챕터의 항목이 채워진다. */
import { BUDGET_LABELS, budgetSrc } from '../app/budgetLabels';
import { fieldMeta } from '../app/fields';
import { fmt, tr } from '../app/i18n';
import { budget, budgetOpen, config, openSettingsAt, visited } from '../app/store';
import { BudgetItem } from '../sim/budget';
import { SrcBadge } from './Badge';
import { M } from './Math';

const KIND: Record<BudgetItem['kind'], { ko: string; en: string }> = {
  random: { ko: '무작위 (제곱합)', en: 'random (RSS)' },
  bias: { ko: '편향 (그대로 합)', en: 'bias (added)' },
  deterministic: { ko: '확정 (그대로 합)', en: 'deterministic (added)' },
  geometry: { ko: '크기·여유', en: 'size / margin' },
  info: { ko: '중간값', en: 'intermediate' },
};
const valueText = (it: BudgetItem): string => {
  const scale = it.unit === 'm' ? 100 : it.unit === 's' ? 1000 : 1;
  const unit = it.unit === 'm' ? 'cm' : it.unit === 's' ? 'ms' : it.unit;
  const one = (v: number) => fmt(v * scale, 3);
  return `${one(it.value)}${it.valueV !== undefined ? ` / ${one(it.valueV)}` : ''}${unit ? ` ${unit}` : ''}`;
};

export function BudgetTable({ all }: { all?: boolean }) {
  const b = budget.value;
  const seen = visited.value;
  const chapters = [...new Set(b.items.map((i) => i.chapter))].sort((x, y) => x - y);
  return (
    <div class="table-wrap">
      <table class="tbl budget-table">
        <thead>
          <tr>
            <th>{tr({ ko: '장', en: 'Ch.' })}</th><th>{tr({ ko: '항목', en: 'Item' })}</th><th>{tr({ ko: '식', en: 'Formula' })}</th>
            <th class="r">{tr({ ko: '값 (수평 / 수직)', en: 'Value (horiz. / vert.)' })}</th><th>{tr({ ko: '성격', en: 'Kind' })}</th><th>{tr({ ko: '바꿀 수 있는 입력', en: 'Inputs you can change' })}</th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((ch) => {
            const items = b.items.filter((i) => i.chapter === ch);
            if (!all && !seen.includes(ch)) {
              return (
                <tr key={ch} class="locked">
                  <td>{ch}</td>
                  <td colSpan={5}><a href={`#/ch/${ch}`}>{tr({ ko: `${ch}장을 읽으면 ${items.length}개 항목이 채워집니다`, en: `Read chapter ${ch} to fill in ${items.length} item(s)` })}</a></td>
                </tr>
              );
            }
            return items.map((it) => (
              <tr key={it.id} class={it.id === 'min-sep' ? 'total' : ''} data-budget-item={it.id}>
                <td>{ch}</td>
                <td>{tr(BUDGET_LABELS[it.id] ?? { ko: it.id, en: it.id })}</td>
                <td><M tex={it.formula} /></td>
                <td class="r">{valueText(it)}<SrcBadge src={budgetSrc(it, config.value)} /></td>
                <td class="muted small">{tr(KIND[it.kind])}</td>
                <td class="small">
                  {it.inputs.filter((p) => fieldMeta(p)).map((p) => (
                    <button key={p} type="button" class="btn ghost small" style={{ minHeight: '24px', padding: '0 6px' }} onClick={() => openSettingsAt(p)}>{tr(fieldMeta(p)!.label)}</button>
                  ))}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetBar() {
  const b = budget.value;
  const open = budgetOpen.value;
  const cfg = config.value;
  const done = visited.value.includes(8);
  return (
    <div class="budgetbar" data-testid="budgetbar">
      <button type="button" class="bar" aria-expanded={open} aria-controls="budget-panel" onClick={() => (budgetOpen.value = !open)} data-testid="budget-toggle">
        <span class="ttl">{tr({ ko: '오차 예산', en: 'Error budget' })}</span>
        <span class="sum">
          {done
            ? <>{tr({ ko: '권장 최소 간격', en: 'Min. spacing' })} <b class="num">{fmt(b.minSepH, 3)} m</b><span class="opt"> ({tr({ ko: '수직', en: 'vert.' })} {fmt(b.minSepV, 3)} m)</span> · {b.spacingOk ? '✓' : '✕'} <span class="opt">{tr({ ko: `지금 간격 ${fmt(cfg.formation.spacing)} m`, en: `current ${fmt(cfg.formation.spacing)} m` })}</span></>
            : <>{tr({ ko: `${visited.value.length} / 10 장 진행 — 챕터를 읽을수록 항목이 채워집니다`, en: `${visited.value.length} / 10 chapters — items fill in as you read` })}</>}
        </span>
        <span class="chev" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div class="panel" id="budget-panel">
          <p class="muted small" style={{ margin: '8px 0' }}>
            {tr({ ko: '모든 값은 오른쪽 위 "설정"의 입력에서 계산됩니다. 수평 / 수직 값이 다르면 둘 다 적었습니다.', en: 'Every value is computed from the inputs in Settings (top right). Horizontal / vertical values are both shown when they differ.' })}
          </p>
          <BudgetTable />
        </div>
      )}
    </div>
  );
}
