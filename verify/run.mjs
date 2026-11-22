// npm run verify: TypeScript 엔진 결과를 내보낸 뒤 Python 기준 구현과 비교한다.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const venvPy = process.platform === 'win32' ? join(here, '.venv', 'Scripts', 'python.exe') : join(here, '.venv', 'bin', 'python');
if (!existsSync(venvPy)) {
  console.log('[verify] Python 가상환경을 만듭니다 (verify/.venv) …');
  const sys = process.platform === 'win32' ? 'py' : 'python3';
  run(sys, process.platform === 'win32' ? ['-3', '-m', 'venv', 'verify/.venv'] : ['-m', 'venv', 'verify/.venv']);
  run(`"${venvPy}"`, ['-m', 'pip', 'install', '-q', '-r', 'verify/requirements.txt']);
}
run('npx', ['tsx', 'verify/ts_export.ts']);
run(`"${venvPy}"`, ['verify/verify.py', ...process.argv.slice(2)]);
