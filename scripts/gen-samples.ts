// 9장 샘플 CSV 생성: npx tsx scripts/gen-samples.ts  (기본 설정 defaultConfig() 기준)
import { writeFileSync } from 'node:fs';
import { defaultConfig } from '../src/sim/config';
import { sampleDriftLog, sampleLatencyLog, sampleRangeLog, sampleStaticLog } from '../src/sim/ch9_measure';
const cfg = defaultConfig();
writeFileSync('public/samples/static_log.csv', sampleStaticLog(cfg) + '\n');
writeFileSync('public/samples/static_drift_log.csv', sampleDriftLog(cfg) + '\n');
const r = sampleRangeLog(cfg);
writeFileSync('public/samples/range_log.csv', r.text + '\n');
writeFileSync('public/samples/latency_log.csv', sampleLatencyLog(cfg) + '\n');
console.log(r.dists, r.biases);
