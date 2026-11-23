/** 오른쪽 위 "설정" 패널: 교재 전체가 공유하는 우리 시스템 설정. 바꾸면 모든 챕터가 즉시 다시 계산된다. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { FIELDS, FieldMeta, GROUP_LABELS, fieldSource } from '../app/fields';
import { L, tr } from '../app/i18n';
import { config, focusField, getPath, replaceConfig, resetConfig, setPath, settingsOpen } from '../app/store';
import { applyVehiclePreset, defaultAnchors } from '../sim/config';
import { ex } from '../sources';
import { SrcBadge } from './Badge';

function Field({ m }: { m: FieldMeta }) {
  const raw = getPath(config.value, m.path) as number;
  const ref = useRef<HTMLDivElement>(null);
  const focused = focusField.value === m.path;
  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(() => { ref.current?.scrollIntoView({ block: 'center' }); ref.current?.querySelector('input')?.focus(); }, 60);
    const t2 = setTimeout(() => { if (focusField.value === m.path) focusField.value = null; }, 1800);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [focused]);
  const id = `f-${m.path}`;
  return (
    <div class={`field${focused ? ' flash' : ''}`} ref={ref}>
      <label for={id}>{tr(m.label)}<SrcBadge src={fieldSource(m.path, raw)} /></label>
      <div class="row">
        <input
          id={id} type="number" min={m.min} max={m.max} step={m.step} value={Number((raw * m.scale).toPrecision(8))} data-testid={`set-${m.path}`}
          onChange={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) setPath(m.path, Math.min(m.max, Math.max(m.min, v)) / m.scale);
          }}
        />
        <span class="unit">{m.unit}</span>
      </div>
    </div>
  );
}
function Choice<V extends string>({ path, label, options }: { path: string; label: L; options: { value: V; label: L }[] }) {
  const v = getPath(config.value, path) as V;
  const id = `f-${path}`;
  return (
    <div class="field">
      <label for={id}>{tr(label)}<SrcBadge src={ex(undefined, { ko: '설계 선택지입니다. 여러분의 시스템에 맞게 고르세요.', en: 'A design choice. Pick what matches your system.' })} /></label>
      <select id={id} value={v} data-testid={`set-${path}`} onChange={(e) => setPath(path, (e.target as HTMLSelectElement).value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
      </select>
    </div>
  );
}
const group = (g: FieldMeta['group']) => FIELDS.filter((f) => f.group === g);

export function SettingsPanel() {
  const cfg = config.value;
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const close = () => { settingsOpen.value = false; };
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!focusField.value) drawer.current?.querySelector<HTMLElement>('[data-testid=settings-close]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab' || !drawer.current) return;
      const items = Array.from(drawer.current.querySelectorAll<HTMLElement>('button, input, select, summary, [href], [tabindex="0"]')).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!drawer.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      (opener && document.contains(opener) ? opener : document.querySelector<HTMLElement>('[data-testid=settings-open]'))?.focus();
    };
  }, []);
  const target = focusField.value;
  const openGroup = target ? FIELDS.find((f) => f.path === target)?.group : undefined;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'swarm-system-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    try {
      const warnings = replaceConfig(JSON.parse(await f.text()));
      setMsg(warnings.length
        ? tr({ ko: `불러왔습니다. 형식이 맞지 않아 기본값을 쓴 항목: ${warnings.join(', ')}`, en: `Loaded. Fields with invalid values kept their defaults: ${warnings.join(', ')}` })
        : tr({ ko: '설정을 불러왔습니다.', en: 'Settings loaded.' }));
    } catch {
      setMsg(tr({ ko: 'JSON 파일을 읽지 못했습니다. 이 교재에서 내보낸 설정 파일인지 확인하세요.', en: 'Could not read the JSON file. Make sure it was exported from this textbook.' }));
    }
  };
  const setAnchor = (i: number, k: number, v: number) => {
    const a = cfg.anchors.map((x) => x.slice());
    a[i][k] = v;
    setPath('anchors', a);
  };
  return (
    <>
      <div class="scrim" onClick={close} />
      <div ref={drawer} class="drawer" role="dialog" aria-modal="true" aria-label={tr({ ko: '우리 시스템 설정', en: 'Our system settings' })} data-testid="settings-panel">
        <header>
          <strong>{tr({ ko: '우리 시스템 설정', en: 'Our system settings' })}</strong>
          <button type="button" class="btn icon ghost" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })} data-testid="settings-close">✕</button>
        </header>
        <div class="body">
          <p class="muted small">
            {tr({ ko: '여기서 바꾼 값은 모든 챕터의 데모와 오차 예산에 즉시 반영됩니다. 회색 "예시값" 배지는 출처 없는 가정이므로 9장에서 직접 측정한 값으로 바꾸세요.', en: 'Changes here immediately affect every demo and the error budget. Grey "Example" badges are assumptions with no source — replace them with your own measurements from chapter 9.' })}
          </p>
          <div class="btn-row" style={{ marginBottom: '8px' }}>
            <button type="button" class="btn" onClick={exportJson} data-testid="settings-export">{tr({ ko: 'JSON 내보내기', en: 'Export JSON' })}</button>
            <button type="button" class="btn" onClick={() => file.current?.click()}>{tr({ ko: 'JSON 불러오기', en: 'Import JSON' })}</button>
            <input ref={file} type="file" accept="application/json,.json" class="sr-only" tabIndex={-1} aria-hidden="true" data-testid="settings-import"
              onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importJson(f); (e.target as HTMLInputElement).value = ''; }} />
            <button type="button" class="btn" onClick={() => { if (confirm(tr({ ko: '모든 설정을 기본값으로 되돌릴까요?', en: 'Reset every setting to its default?' }))) { resetConfig(); setMsg(null); } }} data-testid="settings-reset">{tr({ ko: '기본값으로', en: 'Reset' })}</button>
          </div>
          {msg && <p class="small" role="status">{msg}</p>}

          <details open={!openGroup || openGroup === 'hall'}>
            <summary>{tr(GROUP_LABELS.hall)}</summary>
            {group('hall').map((m) => <Field key={m.path} m={m} />)}
            <div class="ctl-label" style={{ margin: '8px 0 4px' }}>{tr({ ko: `앵커 ${cfg.anchors.length}개의 위치 [m]`, en: `Positions of ${cfg.anchors.length} anchors [m]` })}<SrcBadge src={ex(undefined, { ko: '강당에 실제로 단 위치를 줄자·레이저 거리계로 재서 넣으세요.', en: 'Measure the real mounting positions with a tape or laser rangefinder.' })} /></div>
            <div class="anchor-row muted small" aria-hidden="true"><span /><span>x</span><span>y</span><span>z</span><span /></div>
            {cfg.anchors.map((a, i) => (
              <div class="anchor-row" key={i}>
                <span class="small">A{i}</span>
                {[0, 1, 2].map((k) => (
                  <input key={k} type="number" step={0.05} value={Number(a[k].toFixed(3))} aria-label={`A${i} ${'xyz'[k]} [m]`} data-testid={`set-anchor-${i}-${k}`}
                    onChange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) setAnchor(i, k, v); }} />
                ))}
                <button type="button" class="btn icon ghost" disabled={cfg.anchors.length <= 4} aria-label={tr({ ko: `앵커 ${i} 삭제`, en: `Remove anchor ${i}` })}
                  onClick={() => setPath('anchors', cfg.anchors.filter((_, j) => j !== i))}>−</button>
              </div>
            ))}
            <div class="btn-row" style={{ margin: '6px 0 10px' }}>
              <button type="button" class="btn" disabled={cfg.anchors.length >= 16} onClick={() => setPath('anchors', [...cfg.anchors, [cfg.hall.x / 2, cfg.hall.y / 2, cfg.hall.z - 1]])}>{tr({ ko: '+ 앵커 추가', en: '+ Add anchor' })}</button>
              <button type="button" class="btn" onClick={() => setPath('anchors', defaultAnchors(cfg.hall, 8))} data-testid="anchors-default">{tr({ ko: '모서리 8개 (높이 섞기)', en: '8 corners (mixed heights)' })}</button>
              <button type="button" class="btn" onClick={() => setPath('anchors', defaultAnchors(cfg.hall, 8, true))} data-testid="anchors-same-height">{tr({ ko: '모서리 8개 (같은 높이)', en: '8 corners (same height)' })}</button>
            </div>
          </details>

          <details open={openGroup === 'uwb'}>
            <summary>{tr(GROUP_LABELS.uwb)}</summary>
            <Choice path="uwb.mode" label={{ ko: 'UWB 모드', en: 'UWB mode' }} options={[{ value: 'tdoa', label: { ko: 'TDoA (도달 시간차)', en: 'TDoA (time difference of arrival)' } }, { value: 'twr', label: { ko: 'TWR (양방향 거리 측정)', en: 'TWR (two-way ranging)' } }]} />
            {group('uwb').map((m) => <Field key={m.path} m={m} />)}
          </details>
          <details open={openGroup === 'est'}>
            <summary>{tr(GROUP_LABELS.est)}</summary>
            {group('est').map((m) => <Field key={m.path} m={m} />)}
          </details>
          <details open={openGroup === 'comm'}>
            <summary>{tr(GROUP_LABELS.comm)}</summary>
            <Choice path="comm.topology" label={{ ko: '드론 간 통신 구조', en: 'Inter-drone communication' }} options={[{ value: 'ground', label: { ko: '지상국 중계 (Crazyradio)', en: 'Relayed by ground station (Crazyradio)' } }, { value: 'p2p', label: { ko: '기체 간 직접 (P2P)', en: 'Direct between drones (P2P)' } }]} />
            <Choice path="comm.graph" label={{ ko: '대형 유지에 쓰는 이웃 관계(그래프)', en: 'Neighbour graph for formation keeping' }} options={[
              { value: 'complete', label: { ko: '완전 그래프 (모두가 모두를)', en: 'Complete (everyone with everyone)' } }, { value: 'ring', label: { ko: '고리', en: 'Ring' } },
              { value: 'star', label: { ko: '별 (1번이 중심)', en: 'Star (drone 1 at the centre)' } }, { value: 'path', label: { ko: '일렬', en: 'Path' } }]} />
            {group('comm').filter((m) => !m.path.startsWith('comm.loss')).map((m) => <Field key={m.path} m={m} />)}
            <Choice path="comm.loss.model" label={{ ko: '패킷 손실 모델', en: 'Packet-loss model' }} options={[
              { value: 'none', label: { ko: '손실 없음', en: 'No loss' } }, { value: 'bernoulli', label: { ko: '베르누이 (독립 손실)', en: 'Bernoulli (independent)' } }, { value: 'ge', label: { ko: '길버트-엘리엇 (몰아서 손실)', en: 'Gilbert–Elliott (bursty)' } }]} />
            {cfg.comm.loss.model === 'bernoulli' && <Field m={FIELDS.find((f) => f.path === 'comm.loss.p')!} />}
            {cfg.comm.loss.model === 'ge' && group('comm').filter((m) => m.path.startsWith('comm.loss') && m.path !== 'comm.loss.p').map((m) => <Field key={m.path} m={m} />)}
          </details>
          <details open={openGroup === 'vehicle'}>
            <summary>{tr(GROUP_LABELS.vehicle)}</summary>
            <div class="field">
              <label for="f-preset">{tr({ ko: '기체 프리셋', en: 'Vehicle preset' })}</label>
              <div class="btn-row">
                <button type="button" class="btn" aria-pressed={cfg.vehicle.preset === 'cf21bl'} data-testid="preset-cf21bl" onClick={() => (config.value = applyVehiclePreset(cfg, 'cf21bl'))}>Crazyflie 2.1 Brushless</button>
                <button type="button" class="btn" aria-pressed={cfg.vehicle.preset === 'custom'} data-testid="preset-heavy" onClick={() => (config.value = applyVehiclePreset(cfg, 'heavy'))}>{tr({ ko: '사용자 정의 (예: 1.2 kg급)', en: 'Custom (e.g. 1.2 kg class)' })}</button>
              </div>
            </div>
            {group('vehicle').map((m) => <Field key={m.path} m={m} />)}
          </details>
          <details open={openGroup === 'formation'}>
            <summary>{tr(GROUP_LABELS.formation)}</summary>
            <Choice path="formation.shape" label={{ ko: '드론 5대의 목표 대형', en: 'Target formation of five drones' }} options={[
              { value: 'v', label: { ko: 'V자', en: 'V shape' } }, { value: 'line', label: { ko: '일렬', en: 'Line' } }, { value: 'pentagon', label: { ko: '오각형', en: 'Pentagon' } },
              { value: 'cross', label: { ko: '십자', en: 'Cross' } }, { value: 'stack', label: { ko: '수직으로 쌓기', en: 'Vertical stack' } }]} />
            {group('formation').map((m) => <Field key={m.path} m={m} />)}
          </details>
          <details open={openGroup === 'safety'}>
            <summary>{tr(GROUP_LABELS.safety)}</summary>
            {group('safety').map((m) => <Field key={m.path} m={m} />)}
            <label class="check">
              <input type="checkbox" checked={cfg.safety.extrapolate} data-testid="set-safety.extrapolate" onChange={(e) => setPath('safety.extrapolate', (e.target as HTMLInputElement).checked)} />
              <span>{tr({ ko: '이웃 위치 외삽 사용 (받은 속도 × 정보 나이)', en: 'Extrapolate neighbour positions (velocity × age)' })}</span>
            </label>
          </details>
        </div>
      </div>
    </>
  );
}
