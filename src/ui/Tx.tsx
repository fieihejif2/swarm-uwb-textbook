/**
 * 두 언어 본문 렌더러. 문자열 안에서 쓸 수 있는 인라인 문법:
 *   $수식$            KaTeX 인라인 수식
 *   **굵게**  `코드`
 *   [글자](#/ch/3)    교재 내부 링크 / [글자](https://…) 외부 링크(새 창)
 *   {{lit:출처id/사실key}}   문헌 배지
 *   {{der:ch2#앵커|설명}}    유도 배지 (설명은 '한국어|English' 가능)
 *   {{ex}} / {{ex:설정.경로}} 예시값 배지
 *   {{cfg:설정.경로}}        전역 설정의 현재 값 + 단위 + 배지
 */
import { ComponentChildren, Fragment } from 'preact';
import { L, tr } from '../app/i18n';
import { parseSrc } from '../sources';
import { CfgVal, SrcBadge } from './Badge';
import { M } from './Math';

const TOKEN = /(\$[^$\n]+\$|\*\*[^*\n]+\*\*|`[^`\n]+`|\{\{[^}]+\}\}|\[[^\]\n]+\]\([^)\s]+\))/g;

export function renderInline(text: string): ComponentChildren {
  const parts = text.split(TOKEN);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2) return <M key={i} tex={p.slice(1, -1)} />;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{renderInline(p.slice(2, -2))}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('{{') && p.endsWith('}}')) {
      const spec = p.slice(2, -2).trim();
      if (spec.startsWith('cfg:')) return <CfgVal key={i} path={spec.slice(4)} />;
      const src = parseSrc(spec);
      return src ? <SrcBadge key={i} src={src} /> : <Fragment key={i}>{p}</Fragment>;
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const ext = /^https?:/.test(link[2]);
      return <a key={i} href={link[2]} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{renderInline(link[1])}{ext ? ' ↗' : ''}</a>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** 인라인 조각 */
export function T({ ko, en }: { ko: string; en: string }) {
  return <>{renderInline(tr({ ko, en }))}</>;
}
/** 문단 */
export function P({ ko, en, class: cls }: { ko: string; en: string; class?: string }) {
  return <p class={cls}>{renderInline(tr({ ko, en }))}</p>;
}
/** 목록 */
export function List({ items, ordered }: { items: L[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag style={{ margin: '0 0 0.9em', paddingLeft: '1.3em' }}>{items.map((it, i) => <li key={i}>{renderInline(tr(it))}</li>)}</Tag>;
}
export const rich = (l: L | string): ComponentChildren => renderInline(tr(l));
