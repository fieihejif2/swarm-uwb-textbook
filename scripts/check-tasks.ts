// 한 챕터의 손코딩 과제만 채점기에 돌려 본다:  npx tsx scripts/check-tasks.ts 3
// (tests/grader.test.ts 와 같은 판정. 다른 챕터의 작업 중인 파일에 영향받지 않는다.)
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { getGrader } from '../tests/helpers/py';

const ch = process.argv[2];
if (!ch) { console.error('usage: npx tsx scripts/check-tasks.ts <chapter number>'); process.exit(2); }
const dir = join(process.cwd(), 'src', 'chapters', `ch${ch}`);
const { tasks } = await import(pathToFileURL(join(dir, 'tasks.ts')).href);
const { fixtures } = await import(pathToFileURL(join(dir, 'tasks.fixtures.ts')).href);
const grade = await getGrader();
let bad = 0;
const fail = (msg: string) => { bad++; console.log('  NG  ' + msg); };
for (const t of tasks) {
  console.log(`\n■ ${t.id}`);
  const s = grade(t.solution, t);
  if (!s.ok) fail(`기준 구현이 통과하지 못함: ${s.error ?? s.results.filter((c: any) => !c.ok).map((c: any) => `${c.name_ko}: ${c.detail_ko}`).join(' | ')}`);
  else console.log(`  ok  기준 구현 ${s.passed}/${s.total}`);
  if (s.total < 5) fail(`테스트 케이스가 ${s.total}개뿐 (5개 이상 필요, 숨은 케이스 포함)`);
  if (!s.results.some((c: any) => c.hidden)) fail('숨은 케이스(hidden=True)가 없음');
  if (grade(t.starter, t).ok) fail('처음 주는 코드(starter)가 그대로 통과함');
  else console.log('  ok  starter 는 통과하지 않음');
  const f = fixtures[t.id];
  if (!f) { fail('tasks.fixtures.ts 에 이 과제의 fixtures 가 없음'); continue; }
  if (f.wrong.length < 3) fail(`틀린 코드가 ${f.wrong.length}종 (3종 이상 필요)`);
  if (f.edge.length < 1) fail('경계 사례가 없음');
  for (const w of f.wrong) {
    const r = grade(w.code, t);
    if (r.ok) fail(`틀린 코드가 통과해 버림: ${w.name}`);
    else {
      const first = r.results.find((c: any) => !c.ok);
      console.log(`  ok  탈락: ${w.name}  (${r.passed}/${r.total})  → ${r.error ? r.error.split('\n').pop() : `${first?.detail_ko} / 힌트: ${first?.hint_ko || '(없음)'}`}`);
      if (!r.error && !r.results.some((c: any) => !c.ok && c.hint_ko)) fail(`탈락한 케이스에 힌트가 하나도 없음: ${w.name}`);
    }
  }
  for (const e of f.edge) {
    const r = grade(e.code, t);
    if (r.ok !== e.shouldPass) fail(`경계 사례 판정 불일치: ${e.name} (기대 ${e.shouldPass}, 실제 ${r.ok}) ${r.error ?? r.results.filter((c: any) => !c.ok).map((c: any) => c.detail_ko).join(' | ')}`);
    else console.log(`  ok  경계 사례 ${e.shouldPass ? '통과' : '탈락'}: ${e.name}`);
  }
}
console.log(bad ? `\n실패 ${bad}건` : '\n모두 통과');
process.exit(bad ? 1 : 0);
