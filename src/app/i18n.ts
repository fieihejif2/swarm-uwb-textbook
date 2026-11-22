import { signal } from '@preact/signals';
import { loadJson, saveJson } from './storage';

export type Lang = 'ko' | 'en';
/** 두 언어 문자열. 본문 기본은 한국어. */
export interface L { ko: string; en: string }

export const lang = signal<Lang>(loadJson<Lang>('lang', 'ko') === 'en' ? 'en' : 'ko');
export function setLang(l: Lang): void {
  lang.value = l;
  saveJson('lang', l);
  document.documentElement.lang = l;
}
/** 현재 언어의 문자열. 컴포넌트 렌더 중에 부르면 언어가 바뀔 때 자동으로 다시 그린다. */
export const tr = (s: L | string): string => (typeof s === 'string' ? s : s[lang.value]);
export const L = (ko: string, en: string): L => ({ ko, en });

/** 숫자 표기: 유효숫자 기준, 지수 표기 없이 */
export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : Number.isNaN(v) ? '–' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, digits - 1)).replace('e', '×10^').replace('-', '−');
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(a)));
  const s = v.toFixed(Math.min(decimals, 8));
  return (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s).replace('-', '−');
}
/** 소수 자릿수 고정 표기 */
export const fix = (v: number, decimals = 2): string => (Number.isFinite(v) ? v.toFixed(decimals).replace('-', '−') : fmt(v));
