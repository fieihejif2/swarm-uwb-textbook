import { signal } from '@preact/signals';

export type Route = { page: 'home' } | { page: 'chapter'; id: number } | { page: 'report' };

function parse(hash: string): Route {
  const m = hash.match(/^#\/ch\/(\d+)/);
  if (m) return { page: 'chapter', id: Number(m[1]) };
  if (hash.startsWith('#/report')) return { page: 'report' };
  return { page: 'home' };
}
export const route = signal<Route>(parse(location.hash));
/** 해시의 ?a=anchor 부분 (유도 배지가 가리키는 위치) */
export const anchor = signal<string | null>(null);
function sync(): void {
  route.value = parse(location.hash);
  const q = location.hash.split('?a=')[1];
  anchor.value = q ? decodeURIComponent(q) : null;
}
window.addEventListener('hashchange', sync);
sync();
export const hrefFor = (r: Route): string => (r.page === 'home' ? '#/' : r.page === 'report' ? '#/report' : `#/ch/${r.id}`);
export function go(r: Route): void {
  location.hash = hrefFor(r);
}
