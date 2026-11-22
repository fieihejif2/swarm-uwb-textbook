/** Node 에서 로컬 번들 Pyodide 를 올려 브라우저와 같은 채점 하니스를 돌린다. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import { GradeResult, makeGrader } from '../../src/py/grader';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let cached: Promise<(u: string, t: { solution: string; tests: string }) => GradeResult> | null = null;
export function getGrader() {
  cached ??= loadPyodide({ indexURL: join(root, 'public', 'pyodide') + '/' }).then(makeGrader);
  return cached;
}
