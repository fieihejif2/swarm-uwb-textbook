// npm run zip: 프로젝트를 swarm-uwb-textbook.zip 으로 묶는다 (node_modules, 가상환경, 캐시 제외).
// 외부 프로그램 없이 Node 의 zlib 만으로 ZIP(deflate) 을 쓴다.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'swarm-uwb-textbook.zip';
const EXCLUDE = [/^node_modules(\/|$)/, /^verify\/\.venv(\/|$)/, /^verify\/out(\/|$)/, /^\.cache(\/|$)/, /^\.git(\/|$)/, /^test-results(\/|$)/, /^playwright-report(\/|$)/, /\.zip$/, /^sources\.verified\.json$/];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f), rel = relative(root, p).replaceAll('\\', '/');
    if (EXCLUDE.some((re) => re.test(rel))) return [];
    return statSync(p).isDirectory() ? walk(p) : [rel];
  });
}
const files = walk(root).sort();
const chunks = [], central = [];
let offset = 0;
const dosTime = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });
for (const rel of files) {
  const data = readFileSync(join(root, rel));
  const name = Buffer.from(`swarm-uwb-textbook/${rel}`, 'utf8');
  const stored = /\.(png|jpg|woff2?|whl|zip|wasm)$/.test(rel) && !rel.endsWith('.wasm');
  const body = stored ? data : deflateRawSync(data, { level: 9 });
  const { time, date } = dosTime(statSync(join(root, rel)).mtime);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(stored ? 0 : 8, 8);
  head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc32(data), 14);
  head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
  chunks.push(head, name, body);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(stored ? 0 : 8, 10);
  cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc32(data), 16);
  cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += head.length + name.length + body.length;
}
const cenBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
writeFileSync(join(root, OUT), Buffer.concat([...chunks, cenBuf, end]));
console.log(`${OUT}: ${files.length} files, ${(statSync(join(root, OUT)).size / 1e6).toFixed(1)} MB`);
