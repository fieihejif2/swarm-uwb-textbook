/** 9장: 비행·지상 로그(CSV)에서 노이즈·지연·손실 모델을 피팅한다. 모든 처리는 브라우저 안에서만 한다. */
import { SystemConfig } from './config';
import { Vec } from './linalg';
import { LossProcess } from './loss';
import { Rng } from './rng';
import { linfit, mean, quantile, std } from './stats';

export interface CsvTable { header: string[]; rows: number[][]; skipped: number }

/** 쉼표/세미콜론/탭 구분 CSV 를 숫자 표로 읽는다. 첫 줄은 열 이름. '#' 로 시작하는 줄은 주석. */
export function parseCsv(text: string): CsvTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return { header: [], rows: [], skipped: 0 };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows: number[][] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => Number(c.trim()));
    if (cells.length < header.length || cells.slice(0, header.length).some((c) => !Number.isFinite(c))) { skipped++; continue; }
    rows.push(cells.slice(0, header.length));
  }
  return { header, rows, skipped };
}
export function column(tbl: CsvTable, name: string): number[] | null {
  const i = tbl.header.indexOf(name.toLowerCase());
  return i < 0 ? null : tbl.rows.map((r) => r[i]);
}
export const missingColumns = (tbl: CsvTable, names: string[]): string[] => names.filter((n) => !tbl.header.includes(n.toLowerCase()));

/** 정지 로그 (열: t,x,y,z — 초, 미터). 기체를 바닥이나 삼각대에 고정하고 기록한 위치 추정값. */
export function fitStaticLog(tbl: CsvTable) {
  const t = column(tbl, 't')!, cols = ['x', 'y', 'z'].map((c) => column(tbl, c)!);
  const dur = t[t.length - 1] - t[0];
  // 느린 드리프트(선형 추세)를 빼고 σ 를 잰다
  const fits = cols.map((c) => linfit(t, c));
  const detr = cols.map((c, k) => c.map((v, i) => v - (fits[k].a + fits[k].b * t[i])));
  return {
    n: t.length,
    duration: dur,
    rate: dur > 0 ? (t.length - 1) / dur : NaN,
    mean: cols.map(mean) as Vec,
    sigma: detr.map((c) => std(c)) as Vec,
    sigmaRaw: cols.map((c) => std(c)) as Vec,
    /** 추세 기울기 [m/s] */
    drift: fits.map((f) => f.b) as Vec,
    sigmaH: Math.sqrt(std(detr[0]) ** 2 + std(detr[1]) ** 2),
    sigmaV: std(detr[2]),
  };
}

/** 거리 로그 (열: t,anchor_id,range_m). trueDist[anchor_id] 를 주면 앵커별 편향을 계산한다. */
export function fitRangeLog(tbl: CsvTable, trueDist: Record<number, number> = {}) {
  const id = column(tbl, 'anchor_id')!, r = column(tbl, 'range_m')!;
  const groups = new Map<number, number[]>();
  id.forEach((a, i) => { if (!groups.has(a)) groups.set(a, []); groups.get(a)!.push(r[i]); });
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([anchor, v]) => {
    const med = quantile(v, 0.5);
    const truth = trueDist[anchor];
    return {
      anchor, n: v.length, mean: mean(v), median: med, sigma: std(v),
      bias: Number.isFinite(truth) ? mean(v) - truth : NaN,
      /** 중앙값보다 3σ(MAD 기준) 이상 큰 측정의 비율 — NLOS/이상치 비율의 거친 추정 */
      outlierRatio: (() => {
        const mad = quantile(v.map((x) => Math.abs(x - med)), 0.5) * 1.4826;
        return mad > 0 ? v.filter((x) => x - med > 3 * mad).length / v.length : 0;
      })(),
      robustSigma: quantile(v.map((x) => Math.abs(x - med)), 0.5) * 1.4826,
    };
  });
}

/**
 * 지연 로그 (열: seq,t_send,t_recv — 같은 PC 시계로 잰 초 단위 시각).
 * roundTrip = true 이면 t_recv − t_send 는 왕복 시간이고 편도 지연은 그 절반(대칭 가정).
 * 빠진 seq 는 손실로 센다.
 */
export function fitLatencyLog(tbl: CsvTable, roundTrip = true) {
  const seq = column(tbl, 'seq')!, ts = column(tbl, 't_send')!, tr = column(tbl, 't_recv')!;
  const d = ts.map((s, i) => (tr[i] - s) / (roundTrip ? 2 : 1)).filter((v) => v >= 0);
  const first = Math.min(...seq), last = Math.max(...seq);
  const got = new Set(seq);
  const total = last - first + 1;
  const lossSeq: number[] = [];
  for (let s = first; s <= last; s++) lossSeq.push(got.has(s) ? 0 : 1);
  const ge = estimateGilbert(lossSeq);
  const p05 = quantile(d, 0.05), p95 = quantile(d, 0.95);
  const dur = Math.max(...ts) - Math.min(...ts);
  return {
    n: d.length, sent: total, lossRate: 1 - got.size / total,
    delayMean: mean(d), delayStd: std(d), p50: quantile(d, 0.5), p95, p99: quantile(d, 0.99),
    /** 지터: 5~95% 구간 폭의 절반 */
    jitter: (p95 - p05) / 2,
    rate: dur > 0 ? (total - 1) / dur : NaN,
    ge,
  };
}

/** 손실 수열(1 = 손실)에서 2상태 모델(Good 은 손실 없음, Bad 는 전부 손실)의 전이 확률을 센다 */
export function estimateGilbert(lossSeq: number[]) {
  let ok = 0, lost = 0, okToLost = 0, lostToOk = 0;
  for (let i = 0; i + 1 < lossSeq.length; i++) {
    if (lossSeq[i]) { lost++; if (!lossSeq[i + 1]) lostToOk++; }
    else { ok++; if (lossSeq[i + 1]) okToLost++; }
  }
  return {
    pGB: ok ? okToLost / ok : 0,
    pBG: lost ? lostToOk / lost : 1,
    meanBurst: lostToOk ? lost / lostToOk : lost,
  };
}

// ── 샘플 로그 생성(합성 데이터). 생성 파라미터를 주석 줄에 함께 적는다.
export function synthStaticLog(p: { sigmaH: number; sigmaV: number; rate: number; duration: number; seed: number; pos?: Vec }): string {
  const rng = new Rng(p.seed);
  const lines = [`# synthetic static log: ${JSON.stringify(p)}`, 't,x,y,z'];
  const n = Math.round(p.rate * p.duration);
  const sx = p.sigmaH / Math.SQRT2;
  const pos = p.pos ?? [3, 2, 0.1];
  for (let i = 0; i < n; i++) {
    const t = i / p.rate;
    lines.push([t.toFixed(4), (pos[0] + rng.gauss(0, sx)).toFixed(4), (pos[1] + rng.gauss(0, sx)).toFixed(4), (pos[2] + rng.gauss(0, p.sigmaV)).toFixed(4)].join(','));
  }
  return lines.join('\n');
}
export function synthLatencyLog(cfg: SystemConfig, n: number, seed: number): string {
  const rng = new Rng(seed);
  const loss = new LossProcess(cfg.comm.loss, rng);
  const lines = [`# synthetic round-trip latency log: ${JSON.stringify({ rate: cfg.comm.rate, delayMean: cfg.comm.delayMean, delayJitter: cfg.comm.delayJitter, loss: cfg.comm.loss, n, seed })}`, 'seq,t_send,t_recv'];
  for (let i = 0; i < n; i++) {
    const tSend = i / cfg.comm.rate;
    if (loss.next()) continue;
    const oneWay = () => Math.max(0, cfg.comm.delayMean + rng.range(-cfg.comm.delayJitter, cfg.comm.delayJitter));
    lines.push([i, tSend.toFixed(5), (tSend + oneWay() + oneWay()).toFixed(5)].join(','));
  }
  return lines.join('\n');
}
export function synthRangeLog(p: { dists: number[]; sigma: number; biases: number[]; pNlos: number; biasMean: number; perAnchor: number; seed: number }): string {
  const rng = new Rng(p.seed);
  const lines = [`# synthetic range log: ${JSON.stringify(p)}`, 't,anchor_id,range_m'];
  let t = 0;
  for (let i = 0; i < p.perAnchor; i++)
    p.dists.forEach((d, a) => {
      t += 0.004;
      const nl = rng.bernoulli(p.pNlos) ? rng.exponential(p.biasMean) : 0;
      lines.push([t.toFixed(4), a, (d + p.biases[a] + rng.gauss(0, p.sigma) + nl).toFixed(4)].join(','));
    });
  return lines.join('\n');
}
