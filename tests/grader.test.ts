/**
 * §7.2 채점기 테스트: 모든 손코딩 과제에 대해
 *  (a) 기준 구현은 전부 통과  (b) 일부러 틀린 코드(3종 이상)는 탈락
 *  (c) 경계 사례는 명시한 판정과 일치  (d) 처음 주는 코드(starter)는 통과하지 않음
 * 브라우저와 같은 Pyodide + 같은 채점 하니스를 Node 에서 돌린다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { TaskFixtures } from '../src/py/fixtures';
import type { CodingTask, GradeResult } from '../src/py/grader';
import { getGrader } from './helpers/py';

const taskMods = import.meta.glob<{ tasks: CodingTask[] }>('../src/chapters/*/tasks.ts', { eager: true });
const fixMods = import.meta.glob<{ fixtures: Record<string, TaskFixtures> }>('../src/chapters/*/tasks.fixtures.ts', { eager: true });
const tasks = Object.values(taskMods).flatMap((m) => m.tasks ?? []);
const fixtures: Record<string, TaskFixtures> = Object.assign({}, ...Object.values(fixMods).map((m) => m.fixtures));

let grade: (u: string, t: { solution: string; tests: string }) => GradeResult;
beforeAll(async () => { grade = await getGrader(); });

describe('손코딩 과제 목록', () => {
  it('과제 id 가 유일하고 chN- 로 시작한다', () => {
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of tasks) expect(t.id.startsWith(`ch${t.chapter}-`)).toBe(true);
  });
  it('1~9장은 모두 과제가 1개 이상 있다', () => {
    for (let ch = 1; ch <= 9; ch++) expect(tasks.some((t) => t.chapter === ch), `${ch}장 과제`).toBe(true);
  });
  it('모든 과제에 틀린 코드 3종 이상과 경계 사례가 있다', () => {
    for (const t of tasks) {
      expect(fixtures[t.id], `${t.id} fixtures`).toBeTruthy();
      expect(fixtures[t.id].wrong.length, `${t.id} wrong`).toBeGreaterThanOrEqual(3);
      expect(fixtures[t.id].edge.length, `${t.id} edge`).toBeGreaterThanOrEqual(1);
    }
  });
});

for (const task of tasks) {
  describe(`채점기: ${task.id}`, () => {
    it('(a) 기준 구현은 모든 케이스를 통과한다', () => {
      const r = grade(task.solution, task);
      expect(r.error).toBeNull();
      expect(r.results.filter((c) => !c.ok).map((c) => `${c.name_ko}: ${c.detail_ko}`)).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.total).toBeGreaterThanOrEqual(3);
    });
    it('(d) 처음 주는 코드는 통과하지 않는다', () => {
      expect(grade(task.starter, task).ok).toBe(false);
    });
    for (const w of fixtures[task.id]?.wrong ?? []) {
      it(`(b) 틀린 코드 탈락: ${w.name}`, () => {
        const r = grade(w.code, task);
        expect(r.ok).toBe(false);
        // 탈락한 케이스에는 이유(설명)가 있어야 한다
        if (!r.error) for (const c of r.results.filter((x) => !x.ok)) expect(c.detail_ko.length).toBeGreaterThan(0);
      });
    }
    for (const e of fixtures[task.id]?.edge ?? []) {
      it(`(c) 경계 사례 ${e.shouldPass ? '통과' : '탈락'}: ${e.name}`, () => {
        expect(grade(e.code, task).ok).toBe(e.shouldPass);
      });
    }
    it('문법 오류는 채점기를 죽이지 않고 오류 메시지를 돌려준다', () => {
      const r = grade('def broken(:\n    pass', task);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('SyntaxError');
    });
  });
}
