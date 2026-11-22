/**
 * 교재 내용의 구조 검사(정적 분석).
 *  - 각 장이 §3 의 필수 요소를 담고 있는가
 *  - 본문에서 문헌 배지로 인용한 사실이 모두 SOURCES 에서 확인된(verified) 것인가
 *  - 유도 배지가 가리키는 앵커가 실제로 존재하는가
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sources from '../src/data/sources.json';

const root = join(__dirname, '..', 'src');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|json)$/.test(f) ? [p] : []; });
}
const files = walk(root).filter((f) => !f.endsWith('sources.json'));
const text = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const chapterText = (n: number) => files.filter((f) => f.includes(join('chapters', `ch${n}`))).map((f) => text[f]).join('\n');
const verified = new Set((sources as any[]).flatMap((s) => s.facts.filter((f: any) => f.verified).map((f: any) => `${s.id}/${f.key}`)));

describe('문헌 배지', () => {
  const used = new Map<string, string>();
  for (const [f, t] of Object.entries(text)) {
    for (const m of t.matchAll(/\{\{lit:([a-z0-9-]+)\/([a-z0-9-]+)\}\}/g)) used.set(`${m[1]}/${m[2]}`, f);
    for (const m of t.matchAll(/\blit\(\s*'([a-z0-9-]+)'\s*,\s*'([a-z0-9-]+)'\s*\)/g)) used.set(`${m[1]}/${m[2]}`, f);
  }
  it('문헌으로 인용한 사실은 모두 SOURCES 에서 확인된 것이다', () => {
    const bad = [...used.entries()].filter(([k]) => !verified.has(k)).map(([k, f]) => `${k}  (${f})`);
    expect(bad).toEqual([]);
  });
  it('문헌 배지를 실제로 쓰고 있다', () => expect(used.size).toBeGreaterThan(10));
});

describe('유도 배지', () => {
  it('{{der:chN#앵커}} 와 der(\'chN#앵커\') 가 가리키는 유도가 그 장에 있다', () => {
    const missing: string[] = [];
    for (const [f, t] of Object.entries(text)) {
      const refs = [...t.matchAll(/\{\{der:ch(\d+)#([a-z0-9-]+)/g), ...t.matchAll(/\bder\(\s*[`']ch(\d+)#([a-z0-9-]+)[`']/g)];
      for (const m of refs) {
        const [, ch, id] = m;
        if (id === 'budget') continue; // 모든 장의 "오차 예산" 카드
        if (!new RegExp(`<Derivation\\s+id=["']${id}["']`).test(chapterText(Number(ch)))) missing.push(`ch${ch}#${id}  (${f})`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('챕터 구성 (§3)', () => {
  for (let n = 0; n <= 9; n++) {
    const t = chapterText(n);
    it(`${n}장: 예측·데모·유도·함정·요약`, () => {
      expect(t, '② 예측 먼저').toMatch(/<Predict(Number)?\b/);
      expect(t, '③ 데모').toMatch(/<Demo\b/);
      expect(t, '④ 유도').toMatch(/<Derivation\b/);
      expect(t, '⑥ 함정 실험실').toMatch(/<Pitfall\b/);
      expect(t, '① 학습 목표').toMatch(/objectives:\s*\[/);
      expect(t, '⑦ 오차 예산').toMatch(/budget:\s*\{/);
      expect(t, '⑧ 요약').toMatch(/summary:\s*\[/);
    });
    if (n >= 1) it(`${n}장: 손코딩 과제`, () => expect(t, '⑤ 손코딩 과제').toMatch(/<CodeTask\b/));
  }
});

describe('런타임 네트워크 요청 금지', () => {
  it('소스에 외부 CDN·API 주소로의 요청이 없다', () => {
    const bad: string[] = [];
    for (const [f, t] of Object.entries(text)) {
      if (/\bfetch\(\s*['"`]https?:/.test(t) || /<script[^>]+src=["']https?:/.test(t) || /@import\s+url\(["']?https?:/.test(t) || /cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|fonts\.googleapis/.test(t)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
