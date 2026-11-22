/**
 * 출처 레지스트리. 화면의 모든 수치는 세 종류 중 하나의 배지를 단다.
 *  - 문헌(lit): src/data/sources.json(= SOURCES.md 의 기계 판독본)에서 verified:true 인 사실만.
 *  - 유도(der): 교재 안에서 수식으로 유도했거나, 설정값으로부터 교재의 모델로 계산한 값.
 *  - 예시값(ex): 출처 없는 가정. 회색 배지, 사용자가 바꿀 수 있다.
 */
import raw from './data/sources.json';
import { L } from './app/i18n';

interface RawFact { key: string; claim_ko: string; claim_en: string; value: number | string | null; unit: string | null; location: string; verified: boolean; note: string }
interface RawSource { id: string; citation: string; url: string; facts: RawFact[] }
const SOURCES = raw as RawSource[];

export type SrcRef =
  | { kind: 'lit'; sourceId: string; key: string; citation: string; url: string; location: string; claim: L }
  | { kind: 'der'; chapter: number | null; anchor: string | null; note?: L }
  | { kind: 'ex'; field?: string; note?: L };

export function findFact(sourceId: string, key: string): { source: RawSource; fact: RawFact } | null {
  const source = SOURCES.find((s) => s.id === sourceId);
  const fact = source?.facts.find((f) => f.key === key);
  return source && fact ? { source, fact } : null;
}
/** 문헌 배지. 확인되지 않은 사실을 문헌처럼 쓰는 일을 막기 위해, 없거나 verified:false 이면 예시값으로 떨어뜨린다. */
export function lit(sourceId: string, key: string): SrcRef {
  const f = findFact(sourceId, key);
  if (!f || !f.fact.verified) {
    console.warn(`[sources] 확인되지 않은 문헌 사실: ${sourceId}/${key} → 예시값으로 표시`);
    return { kind: 'ex', note: { ko: `문헌에서 확인하지 못한 값 (${sourceId}/${key})`, en: `Not verified in the literature (${sourceId}/${key})` } };
  }
  return { kind: 'lit', sourceId, key, citation: f.source.citation, url: f.source.url, location: f.fact.location, claim: { ko: f.fact.claim_ko, en: f.fact.claim_en } };
}
/** 유도 배지. where = 'ch2#gdop' (장#앵커) 또는 'ch2'. 설정값에서 계산한 시뮬레이션 결과에도 쓴다. */
export function der(where?: string, note?: L): SrcRef {
  const m = where?.match(/^ch(\d+)(?:#(.+))?$/);
  return { kind: 'der', chapter: m ? Number(m[1]) : null, anchor: m?.[2] ?? null, note };
}
/** 예시값 배지. field 를 주면 전역 설정의 해당 입력으로 연결된다. */
export const ex = (field?: string, note?: L): SrcRef => ({ kind: 'ex', field, note });

/** 본문 인라인 문법(문헌·유도·예시값 배지)을 해석한다. 문법은 src/ui/Tx.tsx 의 머리말 참고 */
export function parseSrc(spec: string): SrcRef | null {
  const [head, ...rest] = spec.split('|');
  const note = rest.length ? { ko: rest[0], en: rest[1] ?? rest[0] } : undefined;
  const [kind, arg] = head.split(/:(.*)/s);
  if (kind === 'lit' && arg) { const [s, k] = arg.split('/'); return lit(s, k); }
  if (kind === 'der') return der(arg, note);
  if (kind === 'ex') return ex(arg || undefined, note);
  return null;
}

export const allSources = (): { id: string; citation: string; url: string; verified: number; total: number }[] =>
  SOURCES.map((s) => ({ id: s.id, citation: s.citation, url: s.url, verified: s.facts.filter((f) => f.verified).length, total: s.facts.length }));
