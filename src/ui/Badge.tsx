import { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fieldMeta, fieldSource } from '../app/fields';
import { fmt, tr } from '../app/i18n';
import { config, getPath, openSettingsAt } from '../app/store';
import { SrcRef } from '../sources';

const KIND_LABEL = {
  lit: { ko: '문헌', en: 'Lit.' },
  der: { ko: '유도', en: 'Derived' },
  ex: { ko: '예시값', en: 'Example' },
};
const KIND_TITLE = {
  lit: { ko: '문헌에서 확인한 값', en: 'Verified in the literature' },
  der: { ko: '교재 안에서 유도·계산한 값', en: 'Derived or computed in this textbook' },
  ex: { ko: '예시값 — 출처 없는 가정입니다. 여러분의 값으로 바꾸세요.', en: 'Example value — an assumption with no source. Replace it with yours.' },
};

/** 출처 배지. 마우스를 올리거나 포커스·탭하면 출처가 뜬다. */
export function SrcBadge({ src }: { src: SrcRef }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(360, window.innerWidth - 16);
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + 6 > window.innerHeight - 180 ? Math.max(8, r.top - 190) : r.bottom + 6 });
    }
    setOpen(true);
  };
  const hide = (delay = 150) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), delay); };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      ref={ref} class={`badge ${src.kind}`} tabIndex={0} role="button" aria-label={`${tr(KIND_LABEL[src.kind])}: ${tr(KIND_TITLE[src.kind])}`}
      data-src-kind={src.kind}
      data-src-ref={src.kind === 'lit' ? `${src.sourceId}/${src.key}` : src.kind === 'der' ? (src.chapter !== null ? `ch${src.chapter}${src.anchor ? `#${src.anchor}` : ''}` : '') : (src.field ?? '')}
      onMouseEnter={show} onMouseLeave={() => hide()} onFocus={show} onBlur={() => hide()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? setOpen(false) : show(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? setOpen(false) : show(); } }}
    >
      {tr(KIND_LABEL[src.kind])}
      {open && createPortal(
        <span class="badge-pop" role="tooltip" style={{ left: `${pos.left}px`, top: `${pos.top}px` }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={() => hide()}>
          <b>{tr(KIND_TITLE[src.kind])}</b>
          {src.kind === 'lit' && (
            <>
              <span>{tr(src.claim)}</span>
              <span class="cite" style={{ display: 'block' }}>{src.citation}</span>
              <span style={{ display: 'block' }}>{tr({ ko: '위치', en: 'Where' })}: {src.location}</span>
              <a href={src.url} target="_blank" rel="noopener noreferrer">{tr({ ko: '원문 열기(외부 링크)', en: 'Open source (external link)' })}</a>
            </>
          )}
          {src.kind === 'der' && (
            <>
              {src.note && <span style={{ display: 'block' }}>{tr(src.note)}</span>}
              {src.chapter !== null && (
                <a href={`#/ch/${src.chapter}${src.anchor ? `?a=${encodeURIComponent(src.anchor)}` : ''}`}>
                  {tr({ ko: `${src.chapter}장의 유도 과정 보기`, en: `See the derivation in chapter ${src.chapter}` })}
                </a>
              )}
            </>
          )}
          {src.kind === 'ex' && (
            <>
              {src.note && <span style={{ display: 'block' }}>{tr(src.note)}</span>}
              {src.field && fieldMeta(src.field) && (
                <button class="btn" style={{ marginTop: '6px' }} onClick={(e) => { e.stopPropagation(); setOpen(false); openSettingsAt(src.field!); }}>
                  {tr({ ko: `설정에서 바꾸기: ${fieldMeta(src.field)!.label.ko}`, en: `Change in settings: ${fieldMeta(src.field)!.label.en}` })}
                </button>
              )}
            </>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** 숫자 + 단위 + 출처 배지. 화면에 수치를 낼 때는 항상 이것을 쓴다. */
export function Val({ v, unit, digits = 3, src, children }: { v?: number; unit?: string; digits?: number; src: SrcRef; children?: ComponentChildren }) {
  return (
    <span class="val">
      <b>{children ?? (v === undefined ? '' : fmt(v, digits))}</b>{unit ? ` ${unit}` : ''}<SrcBadge src={src} />
    </span>
  );
}

/** 전역 설정값을 현재 값·단위·배지와 함께 보여준다 (본문에서 {{cfg:uwb.sigmaTdoa}} 로도 쓸 수 있다) */
export function CfgVal({ path, digits = 3 }: { path: string; digits?: number }) {
  const meta = fieldMeta(path);
  const raw = getPath(config.value, path);
  if (!meta || typeof raw !== 'number') return <span class="val"><b>{String(raw)}</b><SrcBadge src={{ kind: 'ex', field: path }} /></span>;
  return <Val v={raw * meta.scale} unit={meta.unit} digits={digits} src={fieldSource(path, raw)} />;
}
