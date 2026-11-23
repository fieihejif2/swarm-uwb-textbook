import { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { fieldMeta, fieldSource } from '../app/fields';
import { L, fmt, tr } from '../app/i18n';
import { config, getPath, setPath } from '../app/store';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { rich } from './Tx';

export interface SliderProps {
  label: L | string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
  /** 이 입력값의 출처(보통 예시값). 화면의 모든 수치에는 배지가 필요하다. */
  src: SrcRef;
  digits?: number;
  /** 표시값 = value × scale */
  scale?: number;
  testId?: string;
}
/** 슬라이더: 방향키로 조작 가능, 현재 값·단위·출처 배지 표시 */
export function Slider(p: SliderProps) {
  const id = useId();
  const scale = p.scale ?? 1;
  return (
    <div class="slider">
      <div class="top">
        <label class="ctl-label" for={id}>{rich(p.label)}<SrcBadge src={p.src} /></label>
        <span class="val">{fmt(p.value * scale, p.digits ?? 3)}{p.unit ? ` ${p.unit}` : ''}</span>
      </div>
      <input
        id={id} type="range" min={p.min} max={p.max} step={p.step} value={p.value} data-testid={p.testId}
        aria-valuetext={`${fmt(p.value * scale, p.digits ?? 3)} ${p.unit ?? ''}`}
        onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

/** 전역 설정 필드에 묶인 슬라이더. 여기서 바꾸면 교재 전체가 바뀐다. */
export function CfgSlider({ path, min, max, step, testId }: { path: string; min?: number; max?: number; step?: number; testId?: string }) {
  const m = fieldMeta(path)!;
  const v = getPath(config.value, path) as number;
  // 끄는 동안에는 이 슬라이더의 표시값만 바꾸고, 손을 멈추면(150 ms) 전역 설정에 반영한다.
  // 전역 값이 바뀌면 화면의 모든 데모가 다시 계산되므로, 끄는 동안 매번 반영하면 화면이 멈춘다.
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = draft ?? v * m.scale;
  return (
    <Slider
      label={m.label} value={shown} min={min ?? m.min} max={max ?? m.max} step={step ?? m.step} unit={m.unit}
      src={fieldSource(path, v)} testId={testId ?? `cfg-${path}`}
      onChange={(x) => {
        setDraft(x);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { setPath(path, x / m.scale); setDraft(null); }, 150);
      }}
    />
  );
}

export function Toggle({ label, checked, onChange, testId }: { label: L | string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label class="check">
      <input type="checkbox" checked={checked} data-testid={testId} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{rich(label)}</span>
    </label>
  );
}

/** 여러 선택지 중 하나(버튼 묶음). 색이 아니라 눌림 상태(aria-pressed)와 밑줄로 구분한다. */
export function Segmented<V extends string | number>({ label, value, options, onChange, testId }: {
  label?: L | string; value: V; options: { value: V; label: L | string }[]; onChange: (v: V) => void; testId?: string;
}) {
  return (
    <div style={{ marginBottom: '10px' }}>
      {label && <div class="ctl-label" style={{ marginBottom: '4px' }}>{rich(label)}</div>}
      <div class="seg" role="group" aria-label={label ? tr(label) : undefined} data-testid={testId}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} data-value={String(o.value)} onClick={() => onChange(o.value)}>{rich(o.label)}</button>
        ))}
      </div>
    </div>
  );
}

export function Button({ children, onClick, primary, disabled, testId, title }: { children: ComponentChildren; onClick: () => void; primary?: boolean; disabled?: boolean; testId?: string; title?: string }) {
  return <button type="button" class={`btn${primary ? ' primary' : ''}`} onClick={onClick} disabled={disabled} data-testid={testId} title={title}>{children}</button>;
}

export function NumberField({ label, value, onChange, unit, min, max, step, src, testId }: {
  label: L | string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; src?: SrcRef; testId?: string;
}) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{rich(label)}{src && <SrcBadge src={src} />}</label>
      <div class="row">
        <input
          id={id} type="number" value={Number.isFinite(value) ? Number(value.toPrecision(10)) : ''} min={min} max={max} step={step ?? 'any'} data-testid={testId}
          onChange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); }}
        />
        {unit !== undefined && <span class="unit">{unit}</span>}
      </div>
    </div>
  );
}
