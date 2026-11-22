/** 캔버스·three.js 처럼 CSS 변수를 직접 못 쓰는 곳에서 현재 테마의 색을 읽는다. */
import { isDark } from '../app/store';

let cacheKey = '';
let cache: Record<string, string> = {};
export function cssColor(name: string): string {
  const key = String(isDark.value) + (document.documentElement.getAttribute('data-theme') ?? '');
  if (key !== cacheKey) { cacheKey = key; cache = {}; }
  if (!cache[name]) cache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  return cache[name];
}
export const seriesHex = (slot: number): string => cssColor(`--series-${((slot - 1) % 8) + 1}`);

/** 순차(한 색상) 팔레트: 값 0→1 을 밝은 파랑→진한 파랑으로. 어두운 화면에서는 방향을 뒤집어 "큰 값 = 표면과 더 다른 색"을 유지한다. */
const BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const BLUE_RGB = BLUE.map(hexToRgb);
export function sequentialRgb(t: number, dark: boolean): [number, number, number] {
  const u = Math.min(1, Math.max(0, dark ? 1 - t : t)) * (BLUE_RGB.length - 1);
  const i = Math.min(BLUE_RGB.length - 2, Math.floor(u)), f = u - i;
  const a = BLUE_RGB[i], b = BLUE_RGB[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const sequentialCss = (t: number, dark: boolean): string => { const [r, g, b] = sequentialRgb(t, dark); return `rgb(${r | 0},${g | 0},${b | 0})`; };
