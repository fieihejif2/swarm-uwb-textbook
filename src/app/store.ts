import { computed, effect, signal } from '@preact/signals';
import { Budget, computeBudget } from '../sim/budget';
import { SystemConfig, defaultConfig, sanitizeConfig } from '../sim/config';
import { loadJson, saveJson } from './storage';

/** 교재 전체가 공유하는 "우리 시스템" 설정 */
export const config = signal<SystemConfig>(sanitizeConfig(loadJson<unknown>('config', null)).config);
/** 설정에서 바로 계산되는 오차 예산 */
export const budget = computed<Budget>(() => computeBudget(config.value));

effect(() => saveJson('config', config.value));

/** 'uwb.sigmaTdoa' 같은 경로로 값을 읽는다 */
export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
/** 경로의 값을 바꾼 새 설정을 저장한다(불변 갱신). 기체 값을 손으로 바꾸면 프리셋은 '사용자 정의'가 된다. */
export function setPath(path: string, value: unknown): void {
  const next = structuredClone(config.value) as any;
  const keys = path.split('.');
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  if (path.startsWith('vehicle.') && path !== 'vehicle.preset') next.vehicle.preset = 'custom';
  config.value = sanitizeConfig(next).config;
}
export function replaceConfig(raw: unknown): string[] {
  const { config: c, warnings } = sanitizeConfig(raw);
  config.value = c;
  return warnings;
}
export const resetConfig = (): void => { config.value = defaultConfig(); measured.value = {}; };

/**
 * 9장에서 "내 로그"로 구해 설정에 반영한 값들. 경로 → { 반영한 값, 9장의 유도 앵커 }.
 * 값이 그대로인 동안에는 예시값이 아니라 '유도'(내 로그에서 계산) 배지를 단다. 사용자가 값을 다시 바꾸면 예시값으로 돌아간다.
 */
export const measured = signal<Record<string, { value: number; anchor: string }>>(loadJson('measured', {}));
effect(() => saveJson('measured', measured.value));
/** prefix 아래의 모든 숫자 설정을 "측정해서 넣은 값"으로 표시한다 (prefix 가 숫자 경로이면 그 값 하나) */
export function markMeasured(prefix: string, anchor: string): void {
  const next = { ...measured.value };
  const walk = (path: string, v: unknown) => {
    if (typeof v === 'number') next[path] = { value: v, anchor };
    else if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) walk(`${path}.${k}`, (v as any)[k]);
  };
  walk(prefix, getPath(config.value, prefix));
  measured.value = next;
}
export function unmarkMeasured(prefix: string): void {
  measured.value = Object.fromEntries(Object.entries(measured.value).filter(([k]) => k !== prefix && !k.startsWith(prefix + '.')));
}

/** 방문한 챕터(오차 예산 항목이 채워지는 기준) */
export const visited = signal<number[]>(loadJson<number[]>('visited', []));
export function markVisited(ch: number): void {
  if (!visited.value.includes(ch)) {
    visited.value = [...visited.value, ch].sort((a, b) => a - b);
    saveJson('visited', visited.value);
  }
}
/** 통과한 손코딩 과제 id */
export const solved = signal<string[]>(loadJson<string[]>('solved', []));
export function markSolved(id: string): void {
  if (!solved.value.includes(id)) {
    solved.value = [...solved.value, id];
    saveJson('solved', solved.value);
  }
}

export type Theme = 'light' | 'dark' | 'auto';
export const theme = signal<Theme>(loadJson<Theme>('theme', 'auto'));
effect(() => {
  const t = theme.value;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  saveJson('theme', t);
});
/** 지금 실제로 어두운 화면인가 (캔버스/three.js 색을 정할 때 쓴다) */
export const isDark = signal<boolean>(false);
const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
const syncDark = () => { isDark.value = theme.value === 'dark' || (theme.value === 'auto' && !!mq?.matches); };
mq?.addEventListener?.('change', syncDark);
effect(syncDark);

export const settingsOpen = signal(false);
export const budgetOpen = signal(false);
export const navOpen = signal(false);
/** 설정 패널에서 강조할 필드 경로(배지에서 "설정에서 바꾸기"를 눌렀을 때) */
export const focusField = signal<string | null>(null);
export function openSettingsAt(path: string): void {
  focusField.value = path;
  settingsOpen.value = true;
}
