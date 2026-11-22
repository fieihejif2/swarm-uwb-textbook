import { linkHandlers, useLink } from './link';

/**
 * 읽기 전용 코드 목록. links = { key: [줄 번호…] } 를 주면
 * 같은 LinkGroup 의 수식 항(\lk{key}{…})·그래프 요소와 함께 강조된다.
 */
export function CodeView({ code, links = {} }: { code: string; links?: Record<string, number[]> }) {
  const active = useLink();
  const lines = code.replace(/\n$/, '').split('\n');
  const keyOf = (n: number): string | undefined => Object.keys(links).find((k) => links[k].includes(n));
  return (
    <div class="codeview" role="region" aria-label="code" tabIndex={0}>
      {lines.map((ln, i) => {
        const key = keyOf(i + 1);
        return (
          <div key={i} class={`line${key ? ' linked' : ''}${key && active.value === key ? ' is-active' : ''}`} {...linkHandlers(active, key)} data-link={key}>
            <span class="no">{i + 1}</span><span>{ln || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}
