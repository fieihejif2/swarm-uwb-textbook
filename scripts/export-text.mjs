// 리뷰용: 각 화면의 "독자가 보는 내용"을 글로 내보낸다.
// 수식은 $TeX$, 출처 배지는 ⟦종류:참조⟧, 컨트롤과 그림은 [ … ] 로 적는다.
//   node scripts/export-text.mjs [base=http://localhost:5173/] [outDir=.cache/review]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? '.cache/review';
mkdirSync(outDir, { recursive: true });
const routes = [['home', ''], ...Array.from({ length: 10 }, (_, i) => ['ch' + i, 'ch/' + i]), ['report', 'report']];
const browser = await chromium.launch();

function serialize() {
  const KIND = { lit: '문헌', der: '유도', ex: '예시값' };
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'PRE', 'DETAILS', 'SUMMARY', 'NAV', 'FIGURE', 'BR', 'TBODY', 'THEAD', 'LABEL']);
  const out = [];
  const push = (s) => out.push(s);
  const walk = (el) => {
    if (el.nodeType === 3) { push(el.textContent.replace(/\s+/g, ' ')); return; }
    if (el.nodeType !== 1) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.classList.contains('sr-only') || el.classList.contains('badge-pop') || el.classList.contains('plot-tip')) return;
    const tag = el.tagName;
    if (el.classList.contains('katex')) {
      const ann = el.querySelector('annotation');
      const tex = ann ? ann.textContent : el.textContent;
      push(el.closest('.katex-display, .math-block') ? '\n$$ ' + tex + ' $$\n' : ' $' + tex + '$ ');
      return;
    }
    if (el.classList.contains('badge')) {
      const r = el.getAttribute('data-src-ref');
      push('⟦' + (KIND[el.getAttribute('data-src-kind')] || '?') + (r ? ':' + r : '') + '⟧');
      return;
    }
    if (tag === 'svg' || tag === 'CANVAS') {
      const label = el.getAttribute('aria-label') || '';
      const pick = (sel) => (tag === 'svg' ? Array.from(el.querySelectorAll(sel)).map((t) => t.textContent).join(' | ') : '');
      const axes = pick('.axis-label'), refs = pick('.ref-label');
      const texts = tag === 'svg' && !axes && !label ? Array.from(el.querySelectorAll('text')).map((t) => t.textContent).slice(0, 40).join(' | ') : '';
      if (label || axes || refs || texts) push('\n[그림' + (label ? ': ' + label : '') + (axes ? ' · 축: ' + axes : '') + (refs ? ' · 기준선: ' + refs : '') + (texts ? ' · 글자: ' + texts : '') + ']\n');
      return;
    }
    if (tag === 'INPUT') {
      const t = el.type;
      if (t === 'range') push('[슬라이더 ' + el.min + '~' + el.max + ', 지금 ' + el.value + ']');
      else if (t === 'checkbox') push(el.checked ? '[☑]' : '[☐]');
      else if (t === 'number') push('[입력 ' + el.value + ']');
      else if (t === 'file') push('[파일 선택]');
      return;
    }
    if (tag === 'SELECT') {
      const sel = el.selectedOptions[0];
      push('[선택: ' + (sel ? sel.textContent : '') + ' / 선택지: ' + Array.from(el.options).map((o) => o.textContent).join(', ') + ']');
      return;
    }
    if (tag === 'TEXTAREA') { push('\n[코드 편집기]\n' + el.value + '\n[/코드 편집기]\n'); return; }
    if (tag === 'PROGRESS' || tag === 'SCRIPT' || tag === 'STYLE') return;
    const d = cs.display;
    const block = BLOCK.has(tag) || d === 'block' || d === 'grid' || d === 'flex' || d === 'list-item' || d === 'table-row';
    if (block) push('\n');
    if (/^H[1-4]$/.test(tag)) push('#'.repeat(Number(tag[1])) + ' ');
    if (tag === 'LI') push('- ');
    if (tag === 'BUTTON') push(el.getAttribute('aria-pressed') === 'true' ? '[버튼●: ' : '[버튼: ');
    if (tag === 'TD' || tag === 'TH') push(' | ');
    if (el.classList.contains('card')) {
      const kinds = Array.from(el.classList).filter((c) => c !== 'card').join(' ') || 'card';
      const der = el.getAttribute('data-derivation');
      push('\n〔' + kinds + (der ? ' id=' + der : '') + '〕\n');
    }
    if (el.classList.contains('codeview')) {
      push('\n```\n' + Array.from(el.querySelectorAll('.line')).map((l) => l.textContent).join('\n') + '\n```\n');
      return;
    }
    for (const c of el.childNodes) walk(c);
    if (tag === 'BUTTON') push(']');
    if (block) push('\n');
  };
  walk(document.querySelector('article, [data-testid=home]'));
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

for (const lang of ['ko', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate((l) => { localStorage.setItem('swarm-textbook:lang', JSON.stringify(l)); }, lang);
  for (const [name, route] of routes) {
    await page.goto(base + '#/' + route);
    await page.reload();
    await page.waitForSelector('article, [data-testid=home]', { timeout: 30000 });
    await page.waitForTimeout(900);
    // 예측 카드에 답해 가려진 해설을 펼치고, 정답 코드를 연다
    for (const b of await page.locator('.card.predict').all()) {
      const submit = b.locator('[data-testid$="-submit"]');
      if (await submit.count()) await submit.first().click();
      else if (await b.locator('button[aria-pressed]').count()) await b.locator('button[aria-pressed]').first().click();
    }
    for (const b of await page.locator('[data-testid^="solution-"]').all()) await b.click();
    await page.waitForTimeout(700);
    const text = await page.evaluate(serialize);
    writeFileSync(join(outDir, name + '.' + lang + '.txt'), text + '\n');
    console.log(name + '.' + lang + '.txt  ' + text.length + ' chars');
  }
  await ctx.close();
}
await browser.close();
