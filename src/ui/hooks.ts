import { useEffect, useState } from 'preact/hooks';

/** 값이 ms 동안 바뀌지 않을 때만 반영한다(슬라이더를 끄는 동안 무거운 계산을 미룬다). */
export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
