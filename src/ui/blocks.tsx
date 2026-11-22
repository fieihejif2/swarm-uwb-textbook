/** 챕터 본문을 이루는 블록들. 모든 챕터가 같은 블록을 써서 구조와 모양이 통일된다. */
import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { L, fmt, tr } from '../app/i18n';
import { anchor } from '../app/router';
import { loadJson, saveJson } from '../app/storage';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { rich } from './Tx';

export function Section({ id, title, children }: { id?: string; title: L; children: ComponentChildren }) {
  return (
    <section class="section" id={id}>
      <h2>{rich(title)}</h2>
      {children}
    </section>
  );
}

function Card({ kind, tag, title, children, id, testId }: { kind: string; tag: L; title?: L; children: ComponentChildren; id?: string; testId?: string }) {
  return (
    <div class={`card ${kind}`} id={id} data-testid={testId}>
      <div class="card-title"><span class="tag">{tr(tag)}</span>{title && <span>{rich(title)}</span>}</div>
      {children}
    </div>
  );
}

/** ③ 인터랙티브 데모 */
export const Demo = (p: { title: L; children: ComponentChildren; testId?: string }) =>
  <Card kind="demo" tag={{ ko: '데모', en: 'Demo' }} title={p.title} testId={p.testId}>{p.children}</Card>;

/** ⑥ 함정 실험실 */
export const Pitfall = (p: { title: L; children: ComponentChildren; testId?: string }) =>
  <Card kind="pitfall" tag={{ ko: '⚠ 함정 실험실', en: '⚠ Pitfall lab' }} title={p.title} testId={p.testId}>{p.children}</Card>;

export const Note = (p: { children: ComponentChildren }) => <div class="card note">{p.children}</div>;

/**
 * ④ 핵심 유도. id 는 유도 배지({{der:chN#id}})가 가리키는 앵커다.
 * 배지를 타고 오면 이 카드로 스크롤하고 잠깐 강조한다.
 */
export function Derivation({ id, title, children }: { id: string; title: L; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const target = anchor.value === id;
  useEffect(() => {
    if (target) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [target]);
  return (
    <div class={`card derivation${target ? ' target' : ''}`} id={`der-${id}`} ref={ref} data-derivation={id}>
      <div class="card-title"><span class="tag">{tr({ ko: '유도', en: 'Derivation' })}</span><span>{rich(title)}</span></div>
      {children}
    </div>
  );
}

/** 숫자 타일. 수치에는 항상 출처 배지를 단다. */
export function Stat({ label, value, unit, digits = 3, src, status }: { label: L | string; value: number | string; unit?: string; digits?: number; src: SrcRef; status?: 'good' | 'warn' | 'bad' }) {
  return (
    <div class="stat">
      <div class="k">{rich(label)}<SrcBadge src={src} /></div>
      <div class="v" style={status === 'bad' ? { color: 'var(--critical-text)' } : status === 'warn' ? { color: 'var(--warning-text)' } : undefined}>
        {status === 'bad' ? '✕ ' : status === 'warn' ? '△ ' : status === 'good' ? '✓ ' : ''}{typeof value === 'number' ? fmt(value, digits) : value}{unit && <small>{unit}</small>}
      </div>
    </div>
  );
}
export const StatRow = (p: { children: ComponentChildren }) => <div class="stat-row">{p.children}</div>;

export function Status({ kind, children }: { kind: 'good' | 'warn' | 'bad'; children: ComponentChildren }) {
  return <span class={`status ${kind}`}>{kind === 'good' ? '✓' : kind === 'warn' ? '△' : '✕'} {children}</span>;
}

export interface PredictChoice { label: L; correct?: boolean }
/**
 * ② 예측 먼저 (객관식). 답을 고르기 전에는 children(시뮬레이션/해설)을 가린다.
 * reveal 로 감싼 내용은 예측을 한 뒤에만 보인다.
 */
export function Predict({ id, question, choices, explain, children }: {
  id: string; question: L; choices: PredictChoice[]; explain: L; children?: ComponentChildren;
}) {
  const [picked, setPicked] = useState<number | null>(() => loadJson<number | null>(`predict:${id}`, null));
  const pick = (i: number) => { setPicked(i); saveJson(`predict:${id}`, i); };
  const done = picked !== null;
  return (
    <div class="card predict" data-testid={`predict-${id}`}>
      <div class="card-title"><span class="tag">{tr({ ko: '예측 먼저', en: 'Predict first' })}</span></div>
      <p style={{ fontWeight: 600 }}>{rich(question)}</p>
      <div class="btn-row" role="group" aria-label={tr({ ko: '예측 선택지', en: 'Prediction choices' })} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        {choices.map((c, i) => (
          <button key={i} type="button" class="btn" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left', height: 'auto' }} aria-pressed={picked === i} data-testid={`predict-${id}-${i}`} onClick={() => pick(i)}>
            <span>{done ? (c.correct ? '✓ ' : picked === i ? '✕ ' : '') : `${String.fromCharCode(65 + i)}. `}{rich(c.label)}</span>
          </button>
        ))}
      </div>
      {!done && <p class="muted small" style={{ marginTop: '10px', marginBottom: 0 }}>{tr({ ko: '하나를 고르면 결과와 해설이 열립니다. 틀려도 괜찮습니다 — 예측과 결과의 차이가 배움입니다.', en: 'Pick one to reveal the result and explanation. Being wrong is fine — the gap between prediction and result is where learning happens.' })}</p>}
      {done && (
        <div style={{ marginTop: '12px' }}>
          <p>
            <Status kind={choices[picked!]?.correct ? 'good' : 'warn'}>{tr(choices[picked!]?.correct ? { ko: '예측이 맞았습니다', en: 'Your prediction was right' } : { ko: '예측과 달랐습니다', en: 'Different from your prediction' })}</Status>
          </p>
          <p>{rich(explain)}</p>
          {children}
          <button type="button" class="btn ghost small" onClick={() => { setPicked(null); saveJson(`predict:${id}`, null); }}>{tr({ ko: '다시 예측하기', en: 'Predict again' })}</button>
        </div>
      )}
    </div>
  );
}

/**
 * ② 예측 먼저 (슬라이더). 숫자를 먼저 예측하게 하고, 제출하면 실제 값과 비교한다.
 * actual 은 제출 뒤에만 화면에 나온다.
 */
export function PredictNumber({ id, question, min, max, step, unit, actual, actualSrc, tolerance, explain, children }: {
  id: string; question: L; min: number; max: number; step: number; unit: string; actual: number; actualSrc: SrcRef;
  /** 상대오차가 이 값 이하면 "가까웠다"고 한다 */
  tolerance?: number; explain: L; children?: ComponentChildren;
}) {
  const [guess, setGuess] = useState<number>(() => loadJson<number>(`predictn:${id}:g`, (min + max) / 2));
  const [done, setDone] = useState<boolean>(() => loadJson<boolean>(`predictn:${id}:d`, false));
  const close = Math.abs(guess - actual) <= (tolerance ?? 0.25) * Math.max(Math.abs(actual), 1e-9);
  return (
    <div class="card predict" data-testid={`predict-${id}`}>
      <div class="card-title"><span class="tag">{tr({ ko: '예측 먼저', en: 'Predict first' })}</span></div>
      <p style={{ fontWeight: 600 }}>{rich(question)}</p>
      <div class="slider">
        <div class="top"><span class="ctl-label">{tr({ ko: '내 예측', en: 'My prediction' })}</span><span class="val">{fmt(guess, 3)} {unit}</span></div>
        <input type="range" min={min} max={max} step={step} value={guess} disabled={done} data-testid={`predict-${id}-slider`} aria-label={tr({ ko: '내 예측', en: 'My prediction' })}
          onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); setGuess(v); saveJson(`predictn:${id}:g`, v); }} />
      </div>
      {!done
        ? <button type="button" class="btn primary" data-testid={`predict-${id}-submit`} onClick={() => { setDone(true); saveJson(`predictn:${id}:d`, true); }}>{tr({ ko: '예측 제출하고 결과 보기', en: 'Submit prediction and see the result' })}</button>
        : (
          <div style={{ marginTop: '8px' }}>
            <p>
              <Status kind={close ? 'good' : 'warn'}>{tr(close ? { ko: '가까웠습니다', en: 'Close' } : { ko: '차이가 큽니다', en: 'Quite different' })}</Status>{' '}
              {tr({ ko: '내 예측', en: 'Prediction' })} <b class="num">{fmt(guess, 3)} {unit}</b> · {tr({ ko: '실제', en: 'Actual' })} <b class="num">{fmt(actual, 3)} {unit}</b><SrcBadge src={actualSrc} />
            </p>
            <p>{rich(explain)}</p>
            {children}
            <button type="button" class="btn ghost small" onClick={() => { setDone(false); saveJson(`predictn:${id}:d`, false); }}>{tr({ ko: '다시 예측하기', en: 'Predict again' })}</button>
          </div>
        )}
    </div>
  );
}

/** 그림 설명(캡션) + 출처 배지 */
export function Caption({ children, src }: { children: ComponentChildren; src?: SrcRef }) {
  return <p class="muted small" style={{ marginTop: '6px' }}>{children}{src && <SrcBadge src={src} />}</p>;
}
