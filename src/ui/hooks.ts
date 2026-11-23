import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * 값이 ms 동안 바뀌지 않을 때만 반영한다(슬라이더를 끄는 동안 무거운 계산을 미룬다).
 * 객체를 넘겨도 된다: 내용(JSON)이 같으면 같은 값으로 보므로, 렌더마다 새 객체 리터럴을 넘겨도
 * 다시 계산이 끝없이 되풀이되지 않는다. 반환값은 내용이 바뀔 때만 새 참조가 된다.
 */
export function useDebounced<T>(value: T, ms = 150): T {
  const key = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
  const [v, setV] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    const t = setTimeout(() => setV(latest.current), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return v;
}
