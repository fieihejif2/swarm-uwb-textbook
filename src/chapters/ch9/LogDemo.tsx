/** 9장 대표 데모: CSV 로그를 브라우저 안에서 읽어 노이즈·지연·손실 모델을 피팅하고 전역 설정에 반영한다. */
import { useMemo, useState } from 'preact/hooks';
import { L, fix, fmt, tr } from '../../app/i18n';
import { budget, config } from '../../app/store';
import {
  LOG_COLUMNS, LogCheck, LogKind, MIN_ROWS, calibrateMeasSigma, checkLog, detrendSeries, effectiveN, fitNlosTail, lag1, lossSequence, predictStatic, rangeGroups,
  sampleDriftLog, sampleLatencyLog, sampleRangeLog, sampleStaticLog, sigmaRelStdErr, triangularPdf,
} from '../../sim/ch9_measure';
import { column, fitLatencyLog, fitRangeLog, fitStaticLog } from '../../sim/logfit';
import { burstLengthQuantile, lossRunLengths } from '../../sim/loss';
import { normPdf, quantile, rms } from '../../sim/stats';
import { der, ex } from '../../sources';
import { Button, Demo, LineChart, NumberField, P, Segmented, SrcBadge, Stat, StatRow, Status, T } from '../../ui';
import { ApplyRow, DataHist, LossStrip, Num, fromFile } from './parts';

interface Loaded { name: string; text: string; sample: boolean; truth?: Record<number, number> }
type Store = Record<LogKind, Loaded | null>;

/** 브라우저가 멈추지 않도록 정한 파일 크기 한도 [바이트] */
const MAX_BYTES = 30e6;
const KIND_LABEL: Record<LogKind, L> = {
  static: { ko: '① 정지 로그', en: '① Static log' },
  range: { ko: '② 거리 로그', en: '② Range log' },
  latency: { ko: '③④ 지연·손실 로그', en: '③④ Latency & loss log' },
};
const SAMPLE_FILE: Record<LogKind, string> = { static: 'static_log.csv', range: 'range_log.csv', latency: 'latency_log.csv' };

/** 로그 종류별로 "파일에서 센 값" 배지가 가리킬 유도 카드 */
const KIND_DER: Record<LogKind, string> = { static: 'sigma-fit', range: 'nlos-fit', latency: 'latency-fit' };
const LIMIT = ex(undefined, { ko: '이 데모가 정한 한도입니다(출처 없는 값)', en: 'A limit chosen for this demo (no source)' });

function errorText(kind: LogKind, c: LogCheck): L {
  const need = LOG_COLUMNS[kind].join(',');
  const found = c.table.header.length ? c.table.header.join(', ') : '–';
  switch (c.error) {
    case 'empty':
      return { ko: `읽을 줄이 없습니다. 빈 파일이거나 주석(#) 줄뿐입니다. 첫 줄(주석 제외)은 열 이름 \`${need}\` 이어야 합니다.`, en: `Nothing to read: the file is empty or has only comment (#) lines. The first non-comment line must be the column names \`${need}\`.` };
    case 'missing-columns':
      return { ko: `필요한 열이 없습니다: \`${c.missing.join(', ')}\`. 이 파일의 첫 줄에서 읽은 열 이름은 \`${found}\` 입니다. 열 이름을 \`${need}\` 로 바꿔 주세요(대소문자는 구분하지 않습니다). 첫 줄이 숫자라면 열 이름 줄이 빠진 것입니다.`, en: `Required column(s) missing: \`${c.missing.join(', ')}\`. The first line of this file gives the column names \`${found}\`. Rename them to \`${need}\` (case-insensitive). If the first line is numeric, the header line is missing.` };
    case 'no-rows':
      return { ko: `열 이름은 맞지만 숫자로 읽을 수 있는 줄이 하나도 없습니다(건너뛴 줄 ${c.skipped}개). 빈 칸이나 글자가 든 줄은 통째로 건너뜁니다. 소수점이 쉼표(3,14)로 적혀 있지 않은지 확인하세요.`, en: `The column names are right but no row could be read as numbers (${c.skipped} skipped). Rows with empty or non-numeric cells are skipped entirely. Check that decimals are not written with a comma (3,14).` };
    default:
      return { ko: `쓸 수 있는 줄이 ${c.rows}개뿐입니다. 표준편차나 분위수를 구하려면 적어도 ${MIN_ROWS[kind]}개가 필요합니다(권장은 수백 개).`, en: `Only ${c.rows} usable row(s). At least ${MIN_ROWS[kind]} are needed for a standard deviation or percentile (hundreds are recommended).` };
  }
}
function warningText(code: string, count: number): L {
  switch (code) {
    case 'negative-rtt': return { ko: `t_recv 가 t_send 보다 이른 줄이 ${count}개 있어 계산에서 뺐습니다. 두 시각이 서로 다른 시계로 찍혔을 가능성이 큽니다(아래 함정 실험실 참고).`, en: `${count} row(s) have t_recv earlier than t_send and were left out. The two stamps were probably taken on different clocks (see the pitfall lab below).` };
    case 'duplicate-seq': return { ko: `같은 순번이 ${count}번 중복되었습니다. 손실 계산에서는 한 번으로 셉니다.`, en: `${count} duplicated sequence number(s); the loss count treats each number once.` };
    case 'non-integer-seq': return { ko: `정수가 아닌 순번이 ${count}개 있습니다. seq 열에는 0, 1, 2 … 같은 정수 순번이 와야 손실을 셀 수 있습니다.`, en: `${count} sequence number(s) are not integers. The seq column must hold integers 0, 1, 2 … for losses to be counted.` };
    case 'time-not-increasing': return { ko: `시각이 거꾸로 가는 곳이 ${count}군데 있습니다. 여러 로그를 이어 붙였다면 따로 나눠서 넣으세요.`, en: `Time goes backwards in ${count} place(s). If several logs were concatenated, load them separately.` };
    default: return { ko: '모든 줄의 시각이 같아 기록 길이와 표본 주기를 계산할 수 없습니다.', en: 'All rows share one timestamp, so duration and sample rate cannot be computed.' };
  }
}

/** 파일 입력 + 샘플 버튼 + 형식 검사 결과 */
function Loader({ kind, loaded, check, onLoad, samples }: {
  kind: LogKind; loaded: Loaded | null; check: LogCheck | null; onLoad: (l: Loaded | null) => void;
  samples: { label: L; make: () => Loaded; testId: string }[];
}) {
  const [fileErr, setFileErr] = useState<L | null>(null);
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    setFileErr(null);
    if (f.size > MAX_BYTES) {
      setFileErr({ ko: `파일이 너무 큽니다(${fmt(f.size / 1e6, 3)} MB). 브라우저가 멈추지 않도록 ${MAX_BYTES / 1e6} MB 까지만 읽습니다. 필요한 열만 남기거나 구간을 잘라서 넣어 주세요.`, en: `The file is too large (${fmt(f.size / 1e6, 3)} MB). To keep the browser responsive only files up to ${MAX_BYTES / 1e6} MB are read. Keep only the needed columns or cut out a section.` });
      return;
    }
    try {
      onLoad({ name: f.name, text: await f.text(), sample: false });
    } catch {
      setFileErr({ ko: '파일을 읽지 못했습니다. 글자(텍스트) 파일인지 확인하세요.', en: 'Could not read the file. Check that it is a plain-text file.' });
    }
    input.value = '';
  };
  const inputId = `ch9-file-${kind}`;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div class="btn-row">
        <label class="btn" for={inputId} style={{ cursor: 'pointer' }}>{tr({ ko: '📂 내 CSV 파일 고르기', en: '📂 Choose my CSV file' })}</label>
        <input id={inputId} type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" onChange={onFile} data-testid={`ch9-file-${kind}`}
          aria-label={tr({ ko: `${KIND_LABEL[kind].ko} CSV 파일 고르기 (열: ${LOG_COLUMNS[kind].join(',')})`, en: `Choose a CSV file for ${KIND_LABEL[kind].en} (columns: ${LOG_COLUMNS[kind].join(',')})` })} />
        {samples.map((s) => <Button key={s.testId} onClick={() => { setFileErr(null); onLoad(s.make()); }} testId={s.testId}>{tr(s.label)}</Button>)}
        {loaded && <button type="button" class="btn ghost small" onClick={() => onLoad(null)}>{tr({ ko: '비우기', en: 'Clear' })}</button>}
      </div>
      <p class="small muted" style={{ margin: '6px 0 0' }}>
        <T ko={`필요한 열: \`${LOG_COLUMNS[kind].join(',')}\`. 같은 종류의 샘플 파일: `} en={`Required columns: \`${LOG_COLUMNS[kind].join(',')}\`. A sample file of this kind: `} />
        <a href={`${import.meta.env.BASE_URL}samples/${SAMPLE_FILE[kind]}`} download>{SAMPLE_FILE[kind]}</a>
        <T ko=" (기본 설정으로 만든 합성 데이터)." en=" (synthetic data generated with the default settings)." />
      </p>
      <div aria-live="polite">
        {fileErr && <p style={{ marginTop: '8px' }}><Status kind="bad">{tr(fileErr)}</Status><SrcBadge src={LIMIT} /></p>}
        {loaded && check && !check.ok && <p style={{ marginTop: '8px' }} data-testid={`ch9-error-${kind}`}><Status kind="bad"><T {...errorText(kind, check)} /></Status>{check.error === 'too-few-rows' && <SrcBadge src={LIMIT} />}{check.error === 'no-rows' && <SrcBadge src={fromFile(KIND_DER[kind], '불러온 파일에서 센 줄 수', 'Row counts of the loaded file')} />}</p>}
        {loaded && check?.ok && (
          <p class="small" style={{ marginTop: '8px' }} data-testid={`ch9-loaded-${kind}`}>
            <Status kind="good">{loaded.sample ? tr({ ko: '샘플(합성 데이터)을 이 브라우저 안에서 만들었습니다', en: 'Sample (synthetic data) generated inside this browser' }) : tr({ ko: '파일을 이 브라우저 안에서 읽었습니다', en: 'File read inside this browser' })}</Status>{' '}
            <b>{loaded.name}</b> · {tr({ ko: '쓴 줄', en: 'rows used' })} <b class="num">{check.rows}</b>
            {' · '}{tr({ ko: '건너뛴 줄', en: 'rows skipped' })} <b class="num">{check.skipped}</b><SrcBadge src={fromFile(KIND_DER[kind], '불러온 파일에서 센 줄 수', 'Row counts of the loaded file')} />
          </p>
        )}
        {loaded && check?.ok && check.skipped > 0 && <p class="small"><Status kind="warn">{tr({ ko: '숫자가 아니거나 빈 칸이 있는 줄은 건너뛰었습니다(위의 "건너뛴 줄").', en: 'Rows with empty or non-numeric cells were skipped (see "rows skipped" above).' })}</Status></p>}
        {loaded && check?.ok && check.warnings.map((w) => <p class="small" key={w.code}><Status kind="warn">{tr(warningText(w.code, w.count))}</Status>{w.code !== 'zero-duration' && <SrcBadge src={fromFile(KIND_DER[kind], '불러온 파일에서 센 줄 수', 'Row counts of the loaded file')} />}</p>)}
      </div>
    </div>
  );
}

// ───────────────────────────── ① 정지 로그

const AXES = ['x', 'y', 'z'] as const;
function StaticTab({ loaded, onLoad }: { loaded: Loaded | null; onLoad: (l: Loaded | null) => void }) {
  const cfg = config.value;
  const [axis, setAxis] = useState(0);
  const check = useMemo(() => (loaded ? checkLog('static', loaded.text) : null), [loaded?.text]);
  const res = useMemo(() => {
    if (!check?.ok) return null;
    const t = column(check.table, 't')!;
    const cols = AXES.map((a) => column(check.table, a)!);
    const fit = fitStaticLog(check.table);
    const det = cols.map((c) => detrendSeries(t, c));
    const rho = det.map((d) => lag1(d.resid));
    return { t: t.map((v) => v - t[0]), cols, fit, det, rho };
  }, [check]);
  const SRC = fromFile('sigma-fit');
  const mode = cfg.uwb.mode;
  const path = mode === 'twr' ? 'uwb.sigmaTwr' : 'uwb.sigmaTdoa';
  const model = useMemo(() => {
    if (!res) return null;
    const p = res.fit.mean;
    const inHall = p[0] >= 0 && p[0] <= cfg.hall.x && p[1] >= 0 && p[1] <= cfg.hall.y && p[2] >= 0 && p[2] <= cfg.hall.z;
    const pred = predictStatic(cfg, p);
    const cal = inHall ? calibrateMeasSigma(cfg, p, res.fit.sigmaH) : NaN;
    const after = Number.isFinite(cal) ? predictStatic(cfg, p, cal) : null;
    return { p, inHall, pred, cal, after };
  }, [res, cfg]);
  return (
    <div data-testid="ch9-static">
      <Loader kind="static" loaded={loaded} check={check} onLoad={onLoad} samples={[
        { label: { ko: '샘플 불러오기', en: 'Load sample' }, testId: 'ch9-sample-static', make: () => ({ name: tr({ ko: '샘플: 정지 로그 (지금 설정으로 생성)', en: 'Sample: static log (generated from the current settings)' }), text: sampleStaticLog(cfg), sample: true }) },
        { label: { ko: '드리프트가 섞인 샘플', en: 'Sample with drift' }, testId: 'ch9-sample-drift', make: () => ({ name: tr({ ko: '샘플: 드리프트가 섞인 정지 로그', en: 'Sample: static log with drift' }), text: sampleDriftLog(cfg), sample: true }) },
      ]} />
      {res && model && (() => {
        const { fit, det, rho, t, cols } = res;
        const k = axis;
        const sig = fit.sigma[k] * 100;
        const dev = cols[k].map((v) => (v - fit.mean[k]) * 100);
        const trend = det[k].trend.map((v) => (v - fit.mean[k]) * 100);
        const resid = det[k].resid.map((v) => v * 100);
        const rhoMax = Math.max(...rho.map((r) => Math.max(0, r)));
        const nEff = effectiveN(fit.n, rhoMax);
        const se = sigmaRelStdErr(nEff) * 100;
        const driftBig = fit.sigmaRaw.some((s, i) => s > 1.15 * fit.sigma[i]);
        return (
          <>
            <StatRow>
              <Stat label={{ ko: '표본 수 $n$', en: 'Samples $n$' }} value={fit.n} digits={6} src={SRC} />
              <Stat label={{ ko: '기록 길이', en: 'Duration' }} value={fit.duration} unit="s" src={SRC} />
              <Stat label={{ ko: '로그 주파수', en: 'Log rate' }} value={fit.rate} unit="Hz" src={SRC} />
              <Stat label={{ ko: '수평 노이즈 $\\hat\\sigma_H$', en: 'Horizontal noise $\\hat\\sigma_H$' }} value={fit.sigmaH * 100} unit="cm" src={fromFile('sigma-fit', '√(σ_x² + σ_y²), 추세를 뺀 뒤', '√(σ_x² + σ_y²) after detrending')} />
              <Stat label={{ ko: '수직 노이즈 $\\hat\\sigma_V$', en: 'Vertical noise $\\hat\\sigma_V$' }} value={fit.sigmaV * 100} unit="cm" src={SRC} />
              <Stat label={{ ko: '$\\hat\\sigma$ 의 불확실도 (1σ)', en: 'Uncertainty of $\\hat\\sigma$ (1σ)' }} value={se} unit="%" src={fromFile('sigma-fit', '1/√(2(n_eff − 1)), n_eff 는 이웃 상관으로 줄인 표본 수', '1/√(2(n_eff − 1)) with n_eff reduced for neighbour correlation')} status={se > 15 ? 'warn' : undefined} />
            </StatRow>
            <div class="table-wrap">
              <table class="tbl" data-testid="ch9-static-table">
                <thead><tr>
                  <th>{tr({ ko: '축', en: 'Axis' })}</th>
                  <th class="r">{tr({ ko: '노이즈 σ (추세 제거)', en: 'Noise σ (detrended)' })}</th>
                  <th class="r">{tr({ ko: '그냥 잰 σ', en: 'Raw σ' })}</th>
                  <th class="r">{tr({ ko: '드리프트(기울기)', en: 'Drift (slope)' })}</th>
                  <th class="r">{tr({ ko: '이웃 상관 ρ', en: 'Lag-1 correlation ρ' })}</th>
                </tr></thead>
                <tbody>
                  {AXES.map((a, i) => (
                    <tr key={a}>
                      <td><b>{a}</b></td>
                      <td class="r"><Num v={fit.sigma[i] * 100} unit="cm" src={SRC} /></td>
                      <td class="r"><Num v={fit.sigmaRaw[i] * 100} unit="cm" src={fromFile('sigma-fit', '추세를 빼지 않은 표본 표준편차', 'Sample standard deviation without detrending')} /></td>
                      <td class="r"><Num v={fit.drift[i] * 1000} unit="mm/s" src={fromFile('sigma-fit', '최소제곱 직선의 기울기', 'Slope of the least-squares line')} /></td>
                      <td class="r"><Num v={rho[i]} digits={2} src={fromFile('sigma-fit', '잔차의 시차 1 자기상관', 'Lag-1 autocorrelation of the residual')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {driftBig && <p><Status kind="warn">{tr({ ko: '그냥 잰 σ 가 추세를 뺀 σ 보다 눈에 띄게 큽니다: 로그에 느린 드리프트가 있습니다. 노이즈가 아니라 편향으로 다뤄야 합니다.', en: 'The raw σ is clearly larger than the detrended σ: the log contains a slow drift. Treat it as bias, not noise.' })}</Status></p>}
            <Segmented label={{ ko: '그래프로 볼 축', en: 'Axis to plot' }} value={axis} onChange={setAxis} options={AXES.map((a, i) => ({ value: i, label: a }))} testId="ch9-static-axis" />
            <div class="grid-2">
              <LineChart
                title={{ ko: `${AXES[k]} 축: 평균에서 벗어난 양`, en: `${AXES[k]} axis: deviation from the mean` }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '위치 − 평균 [cm]', en: 'Position − mean [cm]' }} height={230}
                series={[
                  { name: { ko: '로그 데이터', en: 'Log data' }, x: t, y: dev, slot: 1, dash: '', width: 1.2 },
                  { name: { ko: '맞춘 직선 (드리프트)', en: 'Fitted line (drift)' }, x: t, y: trend, slot: 2, dash: '7 4', width: 2.5 },
                ]} src={SRC} testId="ch9-static-series" />
              <DataHist
                title={{ ko: `${AXES[k]} 축: 추세를 뺀 잔차의 분포`, en: `${AXES[k]} axis: distribution of the detrended residual` }} xLabel={{ ko: '잔차 [cm]', en: 'Residual [cm]' }}
                values={resid} bins={31} range={[-4.5 * sig, 4.5 * sig]}
                fit={{ name: { ko: `맞춘 정규분포 N(0, σ²)`, en: `Fitted normal N(0, σ²)` }, pdf: (x) => normPdf(x, 0, sig) }}
                refLines={[{ x: -sig, label: '−σ', slot: 3 }, { x: sig, label: '+σ', slot: 3 }]} src={SRC} testId="ch9-static-hist" />
            </div>
            <p class="small muted">{tr({ ko: '계단선(데이터)이 점선(정규분포)을 잘 따라가면 "평균 0 인 정규 잡음"이라는 교재의 가정이 이 로그에 맞는 것입니다. 한쪽 꼬리가 길면 4장의 NLOS 를 의심하세요.', en: 'If the steps (data) follow the dashed curve (normal), the textbook assumption of zero-mean Gaussian noise fits this log. A long one-sided tail points to NLOS (chapter 4).' })}</p>

            <h4 style={{ margin: '14px 0 6px' }}>{tr({ ko: '교재 모델의 예측과 비교', en: 'Compared with the textbook model' })}</h4>
            <P ko={`로그의 평균 위치 (${fix(model.p[0], 2)}, ${fix(model.p[1], 2)}, ${fix(model.p[2], 2)}) m{{der:ch9#sigma-fit|로그의 x, y, z 평균|Mean of x, y, z in the log}} 에서, 지금 전역 설정의 모델이 예측하는 "세워 둔 기체의 흔들림"과 견줍니다(이 지점의 HDOP ${fmt(model.pred.hdop, 3)}, VDOP ${fmt(model.pred.vdop, 3)}{{der:ch9#static-check|설정의 앵커 배치로 이 지점에서 계산한 DOP|DOP at this point from the anchor layout in the settings}}).`}
              en={`At the mean position of the log (${fix(model.p[0], 2)}, ${fix(model.p[1], 2)}, ${fix(model.p[2], 2)}) m{{der:ch9#sigma-fit|로그의 x, y, z 평균|Mean of x, y, z in the log}}, we compare with the "jitter of a parked vehicle" predicted by the model with the current global settings (HDOP ${fmt(model.pred.hdop, 3)}, VDOP ${fmt(model.pred.vdop, 3)} at this point{{der:ch9#static-check|설정의 앵커 배치로 이 지점에서 계산한 DOP|DOP at this point from the anchor layout in the settings}}).`} />
            <div class="table-wrap">
              <table class="tbl" data-testid="ch9-static-compare">
                <thead><tr><th /><th class="r">{tr({ ko: '로그에서 잰 값', en: 'Measured in the log' })}</th><th class="r">{tr({ ko: '모델 예측 (정지)', en: 'Model prediction (parked)' })}</th><th class="r">{tr({ ko: '측정 ÷ 예측', en: 'Measured ÷ predicted' })}</th></tr></thead>
                <tbody>
                  {[[{ ko: '수평 σ_H', en: 'Horizontal σ_H' }, fit.sigmaH, model.pred.staticH], [{ ko: '수직 σ_V', en: 'Vertical σ_V' }, fit.sigmaV, model.pred.staticV]].map(([lab, meas, pred], i) => (
                    <tr key={i}>
                      <td>{tr(lab as L)}</td>
                      <td class="r"><Num v={(meas as number) * 100} unit="cm" src={SRC} /></td>
                      <td class="r"><Num v={(pred as number) * 100} unit="cm" src={der('ch9#static-check', { ko: '지금 설정으로 계산한 정지 상태의 추정값 흔들림', en: 'Jitter of the estimate at rest, from the current settings' })} /></td>
                      <td class="r"><Num v={(meas as number) / (pred as number)} unit="×" src={fromFile('static-check', '측정값을 예측값으로 나눈 비', 'Measured value divided by the prediction')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!model.inHall && <p><Status kind="warn">{tr({ ko: '로그의 평균 위치가 설정의 강당 범위 밖입니다. 로그의 좌표계가 앵커 좌표계와 같은지 확인하세요. 이 상태에서는 역산을 하지 않습니다.', en: 'The mean position of the log lies outside the hall in the settings. Check that the log uses the same frame as the anchor coordinates. No back-calculation is done in this state.' })}</Status></p>}
            {model.inHall && !model.pred.inside && <p><Status kind="warn">{tr({ ko: '이 지점은 앵커가 둘러싼 공간 밖입니다(가장 낮은 앵커보다 아래이거나 벽 바깥). 측위 기하가 나쁜 곳이라 비행 구역을 대표하지 못합니다. 비행 고도에 가까운 받침대 위에서 다시 재는 것을 권합니다.', en: 'This point is outside the volume enclosed by the anchors (below the lowest anchor or beyond a wall). Geometry is poor there, so it does not represent the flight volume. Measure again on a stand near the flight height.' })}</Status></p>}
            <ApplyRow
              testId="ch9-apply-sigma" path={path} value={Number.isFinite(model.cal) ? Number(model.cal.toPrecision(4)) : NaN}
              label={{ ko: `역산한 ${mode === 'twr' ? 'TWR 거리' : 'TDoA 거리차'} 측정 노이즈 σ (수평 흔들림이 측정과 같아지는 값)`, en: `Back-calculated ${mode === 'twr' ? 'TWR range' : 'TDoA range-difference'} noise σ (the value that reproduces the measured horizontal jitter)` }}
              src={fromFile('static-check', '모델의 정지 흔들림이 로그의 σ_H 와 같아지도록 이분법으로 찾은 측정 노이즈', 'Measurement noise found by bisection so that the model’s parked jitter equals σ_H of the log')}
              note={model.after
                ? <T ko={`이 값을 넣으면 모델의 수직 예측은 ${fmt(model.after.staticV * 100, 3)} cm{{der:ch9#static-check}} 가 됩니다. 로그의 수직 값(${fmt(fit.sigmaV * 100, 3)} cm{{der:ch9#sigma-fit}})과 크게 다르면 앵커 좌표나 높이 배치(2장)를 다시 보세요. 원시 거리·거리차를 직접 기록할 수 있다면 ② 탭의 방법이 더 직접적입니다.`}
                    en={`With this value the model predicts ${fmt(model.after.staticV * 100, 3)} cm{{der:ch9#static-check}} vertically. If that is far from the vertical value of the log (${fmt(fit.sigmaV * 100, 3)} cm{{der:ch9#sigma-fit}}), revisit the anchor coordinates or their height layout (chapter 2). If you can log raw ranges or range differences, the method of tab ② is more direct.`} />
                : tr({ ko: '이 로그로는 역산할 수 없습니다(측정값이 모델이 낼 수 있는 범위 밖이거나 위치가 강당 밖).', en: 'Cannot back-calculate from this log (the measured value is outside what the model can produce, or the position is outside the hall).' })} />
          </>
        );
      })()}
    </div>
  );
}

// ───────────────────────────── ② 거리 로그

function RangeTab({ loaded, onLoad }: { loaded: Loaded | null; onLoad: (l: Loaded | null) => void }) {
  const cfg = config.value;
  const [target, setTarget] = useState<'uwb.sigmaTwr' | 'uwb.sigmaTdoa'>('uwb.sigmaTwr');
  const [sel, setSel] = useState(0);
  const check = useMemo(() => (loaded ? checkLog('range', loaded.text) : null), [loaded?.text]);
  const groups = useMemo(() => (check?.ok ? rangeGroups(check.table) : null), [check]);
  const truth = loaded?.truth ?? {};
  const rows = useMemo(() => (check?.ok ? fitRangeLog(check.table, truth) : null), [check, loaded?.truth]);
  const SRC = fromFile('nlos-fit');
  const setTruth = (anchor: number, v: number) => loaded && onLoad({ ...loaded, truth: { ...truth, [anchor]: v } });
  return (
    <div data-testid="ch9-range">
      <Loader kind="range" loaded={loaded} check={check} onLoad={(l) => { setSel(0); onLoad(l); }} samples={[
        { label: { ko: '샘플 불러오기', en: 'Load sample' }, testId: 'ch9-sample-range', make: () => {
          const s = sampleRangeLog(cfg);
          return { name: tr({ ko: '샘플: 거리 로그 (지금 설정으로 생성)', en: 'Sample: range log (generated from the current settings)' }), text: s.text, sample: true, truth: Object.fromEntries(s.dists.map((d, i) => [i, d])) };
        } },
      ]} />
      {groups && rows && (() => {
        const tooMany = groups.length > 16;
        const shown = groups.slice(0, 16);
        const g = shown[Math.min(sel, shown.length - 1)];
        const pooledSigma = quantile(groups.map((x) => x.robustSigma), 0.5);
        const pooled = groups.flatMap((x) => x.resid.map((v) => v * 100));
        const tail = fitNlosTail(groups);
        const sc = pooledSigma * 100;
        const known = groups.filter((x) => Number.isFinite(truth[x.anchor]));
        const medBias = known.map((x) => x.median - truth[x.anchor]);
        const biasRms = known.length >= 2 ? rms(medBias) : NaN;
        const isRange = target === 'uwb.sigmaTwr';
        const unused = (cfg.uwb.mode === 'tdoa') === isRange;
        const t0 = g.t[0];
        return (
          <>
            <Segmented label={{ ko: '이 로그의 `range_m` 열에 든 값', en: 'What the `range_m` column holds' }} value={target} onChange={setTarget} testId="ch9-range-target" options={[
              { value: 'uwb.sigmaTwr', label: { ko: '앵커까지의 거리 (TWR)', en: 'Range to an anchor (TWR)' } },
              { value: 'uwb.sigmaTdoa', label: { ko: '앵커 쌍의 거리차 (TDoA)', en: 'Range difference of an anchor pair (TDoA)' } },
            ]} />
            <P ko="**실제 거리**를 아는 앵커는 아래 칸에 넣으세요(줄자나 레이저 거리계로 잰 안테나 사이 거리). 넣은 앵커만 편향을 계산합니다. 샘플은 생성에 쓴 거리를 미리 채워 두었습니다."
              en="Enter the **true distance** for the anchors where you know it (antenna to antenna, by tape or laser meter). Bias is computed only for those anchors. For the sample the distances used to generate it are pre-filled." />
            <div class="controls">
              {shown.map((x) => (
                <NumberField key={x.anchor} label={{ ko: `${isRange ? '앵커' : '쌍'} ${x.anchor} 의 실제 ${isRange ? '거리' : '거리차'}`, en: `True ${isRange ? 'distance' : 'difference'}, ${isRange ? 'anchor' : 'pair'} ${x.anchor}` }} unit="m" step={0.001}
                  value={truth[x.anchor] ?? NaN} onChange={(v) => setTruth(x.anchor, v)} testId={`ch9-truth-${x.anchor}`}
                  src={ex(undefined, { ko: '여러분이 직접 잰 값을 넣는 칸입니다', en: 'Enter the value you measured yourself' })} />
              ))}
            </div>
            {tooMany && <p class="small muted">{tr({ ko: `앵커 번호가 ${groups.length}종 있습니다. 표와 입력 칸은 앞의 16개만 보여 줍니다.`, en: `${groups.length} distinct anchor ids found; the table and inputs show the first 16.` })}</p>}
            <div class="table-wrap">
              <table class="tbl" data-testid="ch9-range-table">
                <thead><tr>
                  <th>{tr(isRange ? { ko: '앵커', en: 'Anchor' } : { ko: '쌍', en: 'Pair' })}</th>
                  <th class="r">{tr({ ko: '표본 수', en: 'Samples' })}</th>
                  <th class="r">{tr({ ko: '편향 (평균 − 실제)', en: 'Bias (mean − true)' })}</th>
                  <th class="r">{tr({ ko: '편향 (중앙값 − 실제)', en: 'Bias (median − true)' })}</th>
                  <th class="r">{tr({ ko: 'σ', en: 'σ' })}</th>
                  <th class="r">{tr({ ko: '강건 σ (MAD)', en: 'Robust σ (MAD)' })}</th>
                  <th class="r">{tr({ ko: '이상치 비율', en: 'Outlier ratio' })}</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 16).map((r, i) => (
                    <tr key={r.anchor}>
                      <td><b>{r.anchor}</b></td>
                      <td class="r"><Num v={r.n} digits={6} src={SRC} /></td>
                      <td class="r">{Number.isFinite(r.bias) ? <Num v={r.bias * 100} unit="cm" src={fromFile('nlos-fit', '측정 평균 − 입력한 실제 거리', 'Mean of the measurements − the true distance you entered')} /> : '–'}</td>
                      <td class="r">{Number.isFinite(truth[r.anchor]) ? <Num v={(groups[i].median - truth[r.anchor]) * 100} unit="cm" src={fromFile('nlos-fit', '측정 중앙값 − 입력한 실제 거리', 'Median of the measurements − the true distance you entered')} /> : '–'}</td>
                      <td class="r"><Num v={r.sigma * 100} unit="cm" src={fromFile('nlos-fit', '표본 표준편차(이상치 포함)', 'Sample standard deviation (outliers included)')} /></td>
                      <td class="r"><Num v={r.robustSigma * 100} unit="cm" src={fromFile('nlos-fit', '1.4826 × 중앙절대편차', '1.4826 × median absolute deviation')} /></td>
                      <td class="r"><Num v={r.outlierRatio * 100} unit="%" src={fromFile('nlos-fit', '중앙값보다 3·(강건 σ) 넘게 큰 측정의 비율', 'Share of measurements more than 3·(robust σ) above the median')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Segmented label={{ ko: '시계열로 볼 앵커', en: 'Anchor for the time series' }} value={Math.min(sel, shown.length - 1)} onChange={setSel} options={shown.map((x, i) => ({ value: i, label: String(x.anchor) }))} testId="ch9-range-anchor" />
            <div class="grid-2">
              <LineChart
                title={{ ko: `${isRange ? '앵커' : '쌍'} ${g.anchor}: 중앙값에서 벗어난 양`, en: `${isRange ? 'Anchor' : 'Pair'} ${g.anchor}: deviation from the median` }} xLabel={{ ko: '시간 [s]', en: 'Time [s]' }} yLabel={{ ko: '측정 − 중앙값 [cm]', en: 'Measurement − median [cm]' }} height={230}
                series={[{ name: { ko: '로그 데이터', en: 'Log data' }, x: g.t.map((v) => v - t0), y: g.resid.map((v) => v * 100), slot: 1, dash: '', width: 1.2 }]}
                refLines={[{ y: 3 * g.robustSigma * 100, label: { ko: '이상치 문턱 +3σ', en: 'Outlier threshold +3σ' }, slot: 8 }]} src={SRC} testId="ch9-range-series" />
              <DataHist
                title={{ ko: '모든 앵커를 합친 잔차(측정 − 앵커별 중앙값)의 분포', en: 'Residual (measurement − per-anchor median), all anchors pooled' }} xLabel={{ ko: '잔차 [cm]', en: 'Residual [cm]' }}
                values={pooled} bins={36} range={[-4 * sc, 8 * sc]}
                fit={{ name: { ko: '정규분포 N(0, 강건 σ²)', en: 'Normal N(0, robust σ²)' }, pdf: (x) => normPdf(x, 0, sc) }}
                refLines={[{ x: 3 * sc, label: { ko: '+3σ', en: '+3σ' }, slot: 8 }]} src={SRC} testId="ch9-range-hist" />
            </div>
            <p class="small muted">{tr({ ko: '점선(정규분포)보다 오른쪽 꼬리가 두꺼우면 그만큼이 NLOS·다중경로가 만든 양의 편향입니다(4장). 강건 σ 는 그 꼬리에 끌려가지 않습니다.', en: 'A right tail fatter than the dashed normal curve is the positive bias from NLOS and multipath (chapter 4). The robust σ is not dragged by that tail.' })}</p>

            <h4 style={{ margin: '14px 0 6px' }}>{tr({ ko: '설정에 반영할 값', en: 'Values for the settings' })}</h4>
            <ApplyRow testId="ch9-apply-range-sigma" path={target} value={Number(pooledSigma.toPrecision(4))}
              label={isRange ? { ko: 'TWR 거리 노이즈 σ (앵커별 강건 σ 의 중앙값)', en: 'TWR range noise σ (median of the per-anchor robust σ)' } : { ko: 'TDoA 거리차 노이즈 σ (쌍별 강건 σ 의 중앙값)', en: 'TDoA range-difference noise σ (median of the per-pair robust σ)' }}
              src={fromFile('nlos-fit', '앵커별 강건 σ(1.4826 × MAD)의 중앙값', 'Median over anchors of the robust σ (1.4826 × MAD)')}
              note={unused ? tr({ ko: `지금 측위 모드는 ${cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'} 라서, 이 값을 바꿔도 권장 간격은 달라지지 않습니다(다른 모드에서 쓰이는 값입니다).`, en: `The positioning mode is currently ${cfg.uwb.mode === 'tdoa' ? 'TDoA' : 'TWR'}, so changing this value does not move the recommended spacing (it is used in the other mode).` }) : undefined} />
            {isRange && (
              <>
                <ApplyRow testId="ch9-apply-pnlos" path="uwb.pNlos" value={tail.nOut >= 3 ? Number(tail.pNlos.toPrecision(3)) : NaN}
                  label={{ ko: 'NLOS 발생 확률 (오른쪽 꼬리에서 추정)', en: 'NLOS probability (from the right tail)' }} src={fromFile('nlos-fit', '문턱을 넘은 비율 × e^(c/m̂)', 'Share above the threshold × e^(c/m̂)')}
                  note={<T ko={`문턱(+3σ)을 넘은 측정은 ${tail.nOut}개{{der:ch9#nlos-fit}} 입니다. ${tail.nOut < 30 ? '수가 적어 매우 거친 값입니다. ' : ''}가림이 전혀 없는 조건에서 잰 로그라면 0 에 가깝게 나오는 것이 정상이고, 실제 비행에서는 기체 몸체와 사람 때문에 더 커집니다.`}
                    en={`${tail.nOut} measurement(s){{der:ch9#nlos-fit}} exceed the threshold (+3σ). ${tail.nOut < 30 ? 'With so few the value is very rough. ' : ''}A log recorded with no blockage at all should give nearly 0; in real flights vehicle bodies and people make it larger.`} />} />
                <ApplyRow testId="ch9-apply-nlosbias" path="uwb.nlosBiasMean" value={tail.nOut >= 3 ? Number(tail.biasMean.toPrecision(3)) : NaN}
                  label={{ ko: 'NLOS 편향 평균 (문턱을 넘은 양의 평균)', en: 'Mean NLOS bias (mean excess over the threshold)' }} src={fromFile('nlos-fit', '문턱을 넘은 측정들의 (잔차 − 문턱) 평균', 'Mean of (residual − threshold) over the measurements above the threshold')} />
                <ApplyRow testId="ch9-apply-survey" path="uwb.anchorSurveyError" value={Number.isFinite(biasRms) ? Number(biasRms.toPrecision(3)) : NaN}
                  label={{ ko: '앵커 좌표 측량 오차의 어림값 (앵커별 편향의 RMS)', en: 'Rough anchor survey error (RMS of the per-anchor biases)' }} src={fromFile('nlos-fit', '(중앙값 − 실제 거리)의 제곱평균제곱근', 'Root mean square of (median − true distance)')}
                  note={Number.isFinite(biasRms)
                    ? tr({ ko: `실제 거리를 넣은 앵커 ${known.length}개로 계산했습니다. 앵커마다 다른 고정 편향은 안테나 지연 보정 오차와 좌표 오차가 섞인 것이라, 이 값은 상한에 가까운 어림입니다.`, en: `Computed from the ${known.length} anchor(s) with a true distance. A fixed bias that differs between anchors mixes antenna-delay calibration error and coordinate error, so this is a rough, upper-end figure.` })
                    : tr({ ko: '실제 거리를 두 앵커 이상 넣으면 계산합니다.', en: 'Enter the true distance for at least two anchors to compute this.' })} />
              </>
            )}
            {!isRange && <p class="small muted">{tr({ ko: '거리차 로그에서는 NLOS 편향이 양쪽 부호로 모두 나타나므로, 오른쪽 꼬리만 보는 NLOS 피팅과 앵커별 편향 반영은 하지 않습니다.', en: 'In range-difference logs the NLOS bias appears with both signs, so the right-tail NLOS fit and the per-anchor bias are not applied.' })}</p>}
          </>
        );
      })()}
    </div>
  );
}

// ───────────────────────────── ③④ 지연·손실 로그

function LatencyTab({ loaded, onLoad }: { loaded: Loaded | null; onLoad: (l: Loaded | null) => void }) {
  const cfg = config.value;
  const check = useMemo(() => (loaded ? checkLog('latency', loaded.text) : null), [loaded?.text]);
  const res = useMemo(() => {
    if (!check?.ok) return null;
    const seq = column(check.table, 'seq')!, ts = column(check.table, 't_send')!, trv = column(check.table, 't_recv')!;
    const fit = fitLatencyLog(check.table, true);
    const idx = seq.map((_, i) => i).filter((i) => trv[i] - ts[i] >= 0);
    return { fit, seq: idx.map((i) => seq[i]), d: idx.map((i) => ((trv[i] - ts[i]) / 2) * 1000), loss: lossSequence(seq.filter(Number.isInteger)) };
  }, [check]);
  const D = fromFile('latency-fit');
  const G = fromFile('loss-fit');
  const pct = (v: number) => `${fmt(v * 100, 3)} %`;
  return (
    <div data-testid="ch9-latency">
      <Loader kind="latency" loaded={loaded} check={check} onLoad={onLoad} samples={[
        { label: { ko: '샘플 불러오기', en: 'Load sample' }, testId: 'ch9-sample-latency', make: () => ({ name: tr({ ko: '샘플: 왕복 지연 로그 (지금 설정으로 생성)', en: 'Sample: round-trip latency log (generated from the current settings)' }), text: sampleLatencyLog(cfg), sample: true }) },
      ]} />
      {res && res.fit.n === 0 && <p><Status kind="bad">{tr({ ko: '쓸 수 있는 왕복 시간이 하나도 없습니다(모든 줄에서 t_recv < t_send). 두 시각을 같은 PC 시계로 찍었는지 확인하세요.', en: 'No usable round-trip time (t_recv < t_send in every row). Check that both stamps come from the same PC clock.' })}</Status></p>}
      {res && res.fit.n > 0 && (() => {
        const { fit, d, seq, loss } = res;
        const mu = cfg.comm.delayMean * 1000, J = cfg.comm.delayJitter * 1000;
        let lo = Math.max(0, quantile(d, 0) - 1), hi = quantile(d, 1) + 1;
        // 설정의 모델이 데이터에서 너무 멀지 않으면 그 범위까지 함께 보여 준다
        if (mu + J <= 2.5 * hi) { lo = Math.max(0, Math.min(lo, mu - J - 1)); hi = Math.max(hi, mu + J + 1); }
        const lossVal = { model: 'ge' as const, p: Number(fit.lossRate.toPrecision(3)), pGB: Number(fit.ge.pGB.toPrecision(3)), pBG: Number(fit.ge.pBG.toPrecision(3)), lossGood: 0, lossBad: 1 };
        const nLost = loss.lost.filter(Boolean).length;
        const longest = Math.max(0, ...lossRunLengths(loss.lost));
        const l999 = burstLengthQuantile(lossVal, 1e-3);
        return (
          <>
            <StatRow>
              <Stat label={{ ko: '돌아온 핑 / 보낸 핑', en: 'Pings returned / sent' }} value={`${fit.n} / ${fit.sent}`} src={G} />
              <Stat label={{ ko: '편도 지연 평균', en: 'Mean one-way delay' }} value={fit.delayMean * 1000} unit="ms" src={D} />
              <Stat label={{ ko: '중앙값 (p50)', en: 'Median (p50)' }} value={fit.p50 * 1000} unit="ms" src={D} />
              <Stat label={{ ko: 'p95', en: 'p95' }} value={fit.p95 * 1000} unit="ms" src={D} />
              <Stat label={{ ko: 'p99', en: 'p99' }} value={fit.p99 * 1000} unit="ms" src={D} />
              <Stat label={{ ko: '지터 (5~95 % 폭의 절반)', en: 'Jitter (half the 5–95 % width)' }} value={fit.jitter * 1000} unit="ms" src={D} />
              <Stat label={{ ko: '핑 주기', en: 'Ping rate' }} value={fit.rate} unit="Hz" src={D} />
            </StatRow>
            <div class="grid-2">
              <LineChart
                title={{ ko: '핑마다의 편도 지연 (왕복의 절반)', en: 'One-way delay of each ping (half the round trip)' }} xLabel={{ ko: '순번 seq', en: 'Sequence number' }} yLabel={{ ko: '편도 지연 [ms]', en: 'One-way delay [ms]' }} height={230}
                series={[{ name: { ko: '로그 데이터', en: 'Log data' }, x: seq, y: d, slot: 1, dash: '', width: 1.2 }]}
                refLines={[{ y: fit.p50 * 1000, label: 'p50', slot: 3 }, { y: fit.p95 * 1000, label: 'p95', slot: 2 }]} src={D} testId="ch9-latency-series" />
              <DataHist
                title={{ ko: '편도 지연의 분포', en: 'Distribution of the one-way delay' }} xLabel={{ ko: '편도 지연 [ms]', en: 'One-way delay [ms]' }}
                values={d} bins={32} range={[lo, hi]}
                fit={{ name: { ko: '지금 전역 설정의 모델', en: 'Model from the current settings' }, pdf: (x) => triangularPdf(x, mu, J) }}
                refLines={[{ x: fit.p50 * 1000, label: 'p50', slot: 3 }, { x: fit.p95 * 1000, label: 'p95', slot: 2 }]} src={D} testId="ch9-latency-hist" />
            </div>
            <p class="small muted">{tr({ ko: '점선은 "지금 전역 설정(평균 ± 지터)이 맞다면 왕복의 절반은 이렇게 나와야 한다"는 분포입니다. 계단선(데이터)과 어긋나 있으면 아래에서 측정값을 반영한 뒤 다시 보세요 — 점선이 데이터 쪽으로 옮겨 옵니다.', en: 'The dashed curve is what the distribution of half the round trip should look like if the current global settings (mean ± jitter) were right. If it disagrees with the steps (data), apply the measured values below and look again — the dashed curve moves onto the data.' })}</p>
            <LossStrip lost={loss.lost} first={loss.first} />
            <StatRow>
              <Stat label={{ ko: '손실률', en: 'Loss rate' }} value={fit.lossRate * 100} unit="%" src={G} />
              <Stat label={{ ko: '빠진 핑', en: 'Pings missing' }} value={nLost} digits={6} src={G} />
              <Stat label={{ ko: '$\\hat p_{GB}$ (받음→빠짐)', en: '$\\hat p_{GB}$ (ok→lost)' }} value={fit.ge.pGB * 100} unit="%" src={G} />
              <Stat label={{ ko: '$\\hat p_{BG}$ (빠짐→받음)', en: '$\\hat p_{BG}$ (lost→ok)' }} value={fit.ge.pBG * 100} unit="%" src={G} />
              <Stat label={{ ko: '평균 연속 손실 길이', en: 'Mean burst length' }} value={fit.ge.meanBurst} unit={tr({ ko: '패킷', en: 'pkts' })} src={G} />
              <Stat label={{ ko: '로그에서 가장 긴 연속 손실', en: 'Longest burst in the log' }} value={longest} digits={6} unit={tr({ ko: '패킷', en: 'pkts' })} src={G} status={longest > l999 ? 'warn' : undefined} />
              <Stat label={{ ko: '맞춘 모델의 1000번에 1번 연속 손실', en: '1-in-1000 burst of the fitted model' }} value={l999} digits={6} unit={tr({ ko: '패킷', en: 'pkts' })} src={der('ch7#ge-stationary', { ko: '맞춘 전이 확률을 7장의 연속 손실 식에 넣은 값', en: 'The fitted transition probabilities in the burst formula of chapter 7' })} />
            </StatRow>

            {longest > l999 && <p><Status kind="warn">{tr({ ko: '로그의 가장 긴 연속 손실이 맞춘 모델의 1000번에 1번 값보다 깁니다. 이 단순한 모델은 긴 공백을 과소평가하고 있으니, 통신 공백은 로그의 최댓값을 기준으로 따로 확인하세요.', en: 'The longest burst in the log exceeds the 1-in-1000 value of the fitted model. This simple model underestimates long gaps; check the communication gap against the maximum in the log.' })}</Status></p>}
            <h4 style={{ margin: '14px 0 6px' }}>{tr({ ko: '설정에 반영할 값', en: 'Values for the settings' })}</h4>
            <ApplyRow testId="ch9-apply-delay" path="comm.delayMean" value={Number(fit.delayMean.toPrecision(4))} label={{ ko: '통신 지연 (편도, 평균)', en: 'Comm delay (one-way, mean)' }} src={D} />
            <ApplyRow testId="ch9-apply-jitter" path="comm.delayJitter" value={Number(fit.jitter.toPrecision(3))} label={{ ko: '통신 지연 지터 (±)', en: 'Comm delay jitter (±)' }} src={D} />
            <ApplyRow testId="ch9-apply-loss" path="comm.loss" value={lossVal} label={{ ko: '손실 모델 (2상태: 받음 ↔ 빠짐)', en: 'Loss model (two states: ok ↔ lost)' }} src={G}
              show={(v) => (v.model === 'ge' ? `p_GB ${pct(v.pGB)}, p_BG ${pct(v.pBG)}, h_G ${pct(v.lossGood)}, h_B ${pct(v.lossBad)}` : v.model === 'bernoulli' ? `Bernoulli p ${pct(v.p)}` : tr({ ko: '손실 없음', en: 'no loss' }))}
              note={tr({ ko: '로그에서는 "빠졌다/받았다"만 보이므로 Good 상태는 손실 0 %, Bad 상태는 손실 100 % 인 모델로 넣습니다. 핑 주기는 반영하지 않습니다 — 방송 주기는 여러분이 정하는 설계값이기 때문입니다.', en: 'A log only shows "lost" or "received", so the model is entered with 0 % loss in Good and 100 % in Bad. The ping rate is not applied — the broadcast rate is a design value you choose.' })} />
          </>
        );
      })()}
    </div>
  );
}

export function LogDemo() {
  const [tab, setTab] = useState<LogKind>('static');
  const [store, setStore] = useState<Store>({ static: null, range: null, latency: null });
  const set = (k: LogKind) => (l: Loaded | null) => setStore((s) => ({ ...s, [k]: l }));
  const b = budget.value;
  return (
    <Demo title={{ ko: '내 로그에서 모델을 피팅해 전역 설정에 반영하기', en: 'Fit the models from my log and apply them to the global settings' }} testId="ch9-log-demo">
      <p><Status kind="good">{tr({ ko: '파일은 이 브라우저 안에서만 읽습니다. 어디로도 올라가지 않습니다.', en: 'Files are read only inside this browser. Nothing is uploaded anywhere.' })}</Status></p>
      <P ko="고른 파일은 브라우저가 이 탭의 메모리로 읽어 들여 계산할 뿐, 서버로 보내지 않습니다(이 교재는 실행 중에 네트워크 요청을 하지 않습니다). 탭을 닫으면 로그는 사라지고, 남는 것은 **'전역 설정에 반영'을 눌렀을 때의 숫자**뿐입니다."
        en="The file you choose is read into this tab’s memory and computed on; it is never sent to a server (the textbook makes no network requests while running). Close the tab and the log is gone; only **the numbers you applied to the global settings** remain." />
      <Segmented label={{ ko: '로그 종류', en: 'Kind of log' }} value={tab} onChange={setTab} testId="ch9-tab"
        options={(['static', 'range', 'latency'] as LogKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      <div style={{ display: tab === 'static' ? 'block' : 'none' }}><StaticTab loaded={store.static} onLoad={set('static')} /></div>
      <div style={{ display: tab === 'range' ? 'block' : 'none' }}><RangeTab loaded={store.range} onLoad={set('range')} /></div>
      <div style={{ display: tab === 'latency' ? 'block' : 'none' }}><LatencyTab loaded={store.latency} onLoad={set('latency')} /></div>
      <p class="small" style={{ marginTop: '12px' }}>
        {tr({ ko: '지금 권장 최소 수평 간격', en: 'Recommended minimum horizontal spacing now' })}: <b class="num">{fix(b.minSepH, 3)} m</b>
        <SrcBadge src={der('ch9#sensitivity', { ko: '지금 전역 설정으로 계산한 오차 예산의 합계(8장의 식)', en: 'Total of the error budget with the current global settings (formula of chapter 8)' })} />
        {' · '}<a href="#/report">{tr({ ko: '우리 시스템 리포트 보기', en: 'Open our system report' })}</a>
      </p>
      <p class="small muted">{tr({ ko: '반영한 값의 배지는 회색(예시값)에서 "유도"(내 로그에서 계산한 값)로 바뀝니다. 그 값을 손으로 다시 고치면 예시값으로 돌아갑니다. 교재는 여러분의 측정 자체를 검증할 수는 없으므로, 측정한 날짜, 장소, 조건은 따로 기록해 두세요.', en: 'The badge of an applied value changes from grey (example) to "Derived" (computed from your log). If you edit the value by hand again it goes back to an example value. The textbook cannot verify the measurement itself, so keep your own record of the date, place and conditions.' })}</p>
    </Demo>
  );
}
