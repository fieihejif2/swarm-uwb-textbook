import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { lang } from '../app/i18n';
import { useLink } from './link';

const MACROS = {
  // \lk{key}{식}: 수식의 한 항을 코드 줄·그래프 요소와 연결한다
  '\\lk': '\\htmlData{link=#1}{#2}',
  '\\R': '\\mathbb{R}',
  '\\T': '^{\\mathsf{T}}',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
  '\\abs': '\\left| #1 \\right|',
};
const cache = new Map<string, string>();
export function renderTex(tex: string, block: boolean): string {
  const key = (block ? 'B' : 'I') + tex;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, {
        displayMode: block, throwOnError: false, strict: 'ignore', macros: { ...MACROS },
        trust: (ctx) => ctx.command === '\\htmlData',
      });
    } catch (e) {
      html = `<code>${tex.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</code>`;
    }
    cache.set(key, html);
  }
  return html;
}

/** 수식 안의 글자를 언어에 맞게: \tx{한국어}{English} → \text{…} */
export const localizeTex = (tex: string, l: 'ko' | 'en'): string =>
  tex.replace(/\\tx\{([^{}]*)\}\{([^{}]*)\}/g, (_, ko: string, en: string) => `\\text{${l === 'ko' ? ko : en}}`);

/**
 * KaTeX 수식. block 이면 가운데 정렬된 별행 수식(가로로 넘치면 스크롤).
 * 수식 안에 글자를 넣을 때는 \tx{한국어}{English} 를 쓰면 언어 전환을 따라간다.
 */
export function M({ tex: rawTex, block }: { tex: string; block?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const active = useLink();
  const tex = rawTex.includes('\\tx{') ? localizeTex(rawTex, lang.value) : rawTex;
  const html = useMemo(() => renderTex(tex, !!block), [tex, block]);
  const hasLinks = tex.includes('\\lk');
  const cur = hasLinks ? active.value : null;
  useEffect(() => {
    if (!hasLinks || !ref.current) return;
    ref.current.querySelectorAll<HTMLElement>('[data-link]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.link === cur);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
    });
  }, [cur, html, hasLinks]);
  const keyOf = (e: Event) => (e.target as HTMLElement).closest?.<HTMLElement>('[data-link]')?.dataset.link ?? null;
  const handlers = hasLinks
    ? {
        onMouseOver: (e: Event) => { const k = keyOf(e); if (k) active.value = k; },
        onMouseOut: (e: Event) => { if (keyOf(e)) active.value = null; },
        onFocusIn: (e: Event) => { const k = keyOf(e); if (k) active.value = k; },
        onFocusOut: () => { active.value = null; },
        onClick: (e: Event) => { const k = keyOf(e); if (k) active.value = active.value === k ? null : k; },
      }
    : {};
  return block
    ? <div class="math-block" ref={ref as any} {...handlers} dangerouslySetInnerHTML={{ __html: html }} />
    : <span ref={ref} {...handlers} dangerouslySetInnerHTML={{ __html: html }} />;
}
