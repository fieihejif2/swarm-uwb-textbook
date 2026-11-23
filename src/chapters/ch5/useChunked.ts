import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * n 개의 무거운 계산 fn(0..n-1) 을 한 덩어리로 돌리지 않고, 매크로태스크 하나에 약 12 ms 씩 나눠 돌린다.
 * key(입력 내용을 나타내는 문자열)가 바뀌면 delay ms 뒤에 다시 계산을 시작하고, 그동안에는 이전 결과를 그대로 돌려준다(pending = true).
 * 첫 렌더에서는 동기로 한 번 계산한다(빈 그래프를 그리지 않으려고).
 */
export function useChunked<T>(key: string, n: number, fn: (i: number) => T, delay = 0): { data: T[]; pending: boolean } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [state, setState] = useState(() => ({ key, data: Array.from({ length: n }, (_, i) => fn(i)) }));
  useEffect(() => {
    if (state.key === key) return;
    let cancelled = false, i = 0, id: ReturnType<typeof setTimeout>;
    const out: T[] = [];
    const step = () => {
      if (cancelled) return;
      const t0 = performance.now();
      do out.push(fnRef.current(i++)); while (i < n && performance.now() - t0 < 12);
      if (i < n) id = setTimeout(step, 0);
      else setState({ key, data: out });
    };
    id = setTimeout(step, delay);
    return () => { cancelled = true; clearTimeout(id); };
  }, [key, n, delay]);
  return { data: state.data, pending: state.key !== key };
}
