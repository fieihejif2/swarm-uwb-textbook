// Pyodide 런타임과 numpy 휠을 public/pyodide/ 에 로컬 번들로 준비한다.
// 실행 시점(빌드/개발 서버 시작 전)에만 네트워크를 쓴다. 런타임 네트워크 요청은 0개.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pyodide');
const dst = join(root, 'public', 'pyodide');
mkdirSync(dst, { recursive: true });

const runtimeFiles = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
for (const f of runtimeFiles) copyFileSync(join(src, f), join(dst, f));

const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
const lock = JSON.parse(readFileSync(join(src, 'pyodide-lock.json'), 'utf8'));
const wanted = ['numpy'];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

for (const name of wanted) {
  const pkg = lock.packages[name];
  const out = join(dst, pkg.file_name);
  if (existsSync(out) && sha(readFileSync(out)) === pkg.sha256) continue;
  const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${pkg.file_name}`;
  console.log(`[prepare-assets] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== pkg.sha256) throw new Error(`sha256 mismatch for ${pkg.file_name}`);
  writeFileSync(out, buf);
}
console.log(`[prepare-assets] pyodide ${version} + ${wanted.join(', ')} ready in public/pyodide/`);
