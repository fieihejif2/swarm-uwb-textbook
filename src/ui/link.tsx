/** 수식 ↔ 코드 ↔ 그래프 연동: 같은 LinkGroup 안에서 같은 key 를 가진 요소가 함께 강조된다. */
import { Signal, signal } from '@preact/signals';
import { ComponentChildren, createContext } from 'preact';
import { useContext, useMemo } from 'preact/hooks';

const Ctx = createContext<Signal<string | null> | null>(null);
const NONE = signal<string | null>(null);

export function LinkGroup({ children }: { children: ComponentChildren }) {
  const s = useMemo(() => signal<string | null>(null), []);
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}
/** 현재 강조 중인 key 를 담은 시그널. LinkGroup 밖에서는 아무 것도 강조되지 않는다. */
export const useLink = (): Signal<string | null> => useContext(Ctx) ?? NONE;
/** 요소에 붙이면 hover/focus 로 key 를 강조한다 */
export function linkHandlers(s: Signal<string | null>, key?: string) {
  if (!key) return {};
  return {
    onMouseEnter: () => { s.value = key; },
    onMouseLeave: () => { if (s.value === key) s.value = null; },
    onFocus: () => { s.value = key; },
    onBlur: () => { if (s.value === key) s.value = null; },
  };
}
