/** 대형 시뮬레이션 결과(SwarmResult)를 위에서 본 모습으로 재생한다. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fix, tr } from '../app/i18n';
import { isDark } from '../app/store';
import { SwarmResult } from '../sim/swarm';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { useWidth } from './Plot';
import { cssColor, seriesHex } from './theme';

export interface SwarmViewProps {
  result: SwarmResult;
  hall: { x: number; y: number };
  /** 충돌로 보는 거리 [m] (기체 원의 지름으로 그린다) */
  bodySize: number;
  /** 따라가기 화면의 가로 폭 [m] */
  span?: number;
  src?: SrcRef;
  testId?: string;
  /** 옆에서 본 모습(x–z)도 그릴지 */
  side?: boolean;
}

export function SwarmView(p: SwarmViewProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const frames = p.result.t.length;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = isDark.value;
  // 새 결과가 오면 처음부터 재생
  useEffect(() => { setFrame(0); setPlaying(!reduced); }, [p.result]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const total = p.result.t[frames - 1] || 1;
    const speed = Math.max(1, total / 12); // 전체를 약 12초에 재생
    const dtFrame = total / Math.max(1, frames - 1);
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * speed;
      last = now;
      const adv = Math.floor(acc / dtFrame);
      if (adv > 0) {
        acc -= adv * dtFrame;
        setFrame((f) => { const n = f + adv; if (n >= frames - 1) { setPlaying(false); return frames - 1; } return n; });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, p.result]);
  const H = Math.round(Math.min(380, Math.max(220, width * 0.62)));
  const sideH = p.side ? 110 : 0;
  useEffect(() => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr; c.height = (H + sideH) * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = Math.min(frame, frames - 1);
    const pos = p.result.pos[f];
    if (!pos) return;
    const n = pos.length;
    const cx = pos.reduce((s, q) => s + q[0], 0) / n, cy = pos.reduce((s, q) => s + q[1], 0) / n;
    let span = follow ? (p.span ?? 7) : p.hall.x * 1.06;
    if (follow) {
      // 대형의 경계 상자(가로·세로) + 기체 지름의 두 배 여유가 화면에 모두 들어오도록
      const ext = Math.max(...pos.map((q) => Math.abs(q[0] - cx)), ...pos.map((q) => Math.abs(q[1] - cy) * (width / H))) * 2;
      span = Math.max(span, ext + 4 * p.bodySize);
    }
    const k = width / span;
    const ox = follow ? cx : p.hall.x / 2, oy = follow ? cy : p.hall.y / 2;
    const sx = (x: number) => width / 2 + (x - ox) * k;
    const sy = (y: number) => H / 2 - (y - oy) * k;
    ctx.fillStyle = cssColor('--surface-2');
    ctx.fillRect(0, 0, width, H + sideH);
    // 1 m 격자
    ctx.strokeStyle = cssColor('--border'); ctx.lineWidth = 1;
    const gstep = follow ? 1 : 5;
    ctx.beginPath();
    for (let gx = Math.ceil((ox - span / 2) / gstep) * gstep; gx <= ox + span / 2; gx += gstep) { ctx.moveTo(sx(gx), 0); ctx.lineTo(sx(gx), H); }
    for (let gy = Math.ceil((oy - H / k / 2) / gstep) * gstep; gy <= oy + H / k / 2; gy += gstep) { ctx.moveTo(0, sy(gy)); ctx.lineTo(width, sy(gy)); }
    ctx.stroke();
    // 강당 벽
    ctx.strokeStyle = cssColor('--text-2'); ctx.lineWidth = 2;
    ctx.strokeRect(sx(0), sy(p.hall.y), p.hall.x * k, p.hall.y * k);
    // 궤적 꼬리
    const tail = Math.max(1, Math.round(frames * 0.12));
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = seriesHex(i + 1); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (let q = Math.max(0, f - tail); q <= f; q++) { const pt = p.result.pos[q][i]; q === Math.max(0, f - tail) ? ctx.moveTo(sx(pt[0]), sy(pt[1])) : ctx.lineTo(sx(pt[0]), sy(pt[1])); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 기체
    const rBody = Math.max(7, (p.bodySize / 2) * k);
    const collided = p.result.firstCollisionTime !== null && p.result.t[f] >= p.result.firstCollisionTime;
    for (let i = 0; i < n; i++) {
      const x = sx(pos[i][0]), y = sy(pos[i][1]);
      ctx.beginPath(); ctx.arc(x, y, rBody, 0, 2 * Math.PI);
      ctx.fillStyle = seriesHex(i + 1); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = cssColor('--surface'); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
    }
    // 눈금자
    ctx.fillStyle = cssColor('--text-2'); ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const bar = follow ? 1 : 5;
    ctx.fillRect(12, H - 14, bar * k, 2);
    ctx.fillText(`${bar} m`, 12, H - 20);
    if (collided) {
      ctx.fillStyle = cssColor('--critical'); ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(tr({ ko: `✕ 충돌 (t = ${fix(p.result.firstCollisionTime!, 1)} s)`, en: `✕ Collision (t = ${fix(p.result.firstCollisionTime!, 1)} s)` }), width - 12, 20);
    }
    if (p.side) {
      // 옆에서 본 모습 (x–z)
      const y0 = H + 4, hh = sideH - 8, zSpan = 4, kz = Math.min(k, hh / zSpan);
      ctx.fillStyle = cssColor('--surface'); ctx.fillRect(0, H, width, sideH);
      ctx.strokeStyle = cssColor('--border'); ctx.strokeRect(0.5, H + 0.5, width - 1, sideH - 1);
      const cz = pos.reduce((s, q) => s + q[2], 0) / n;
      const sz = (z: number) => y0 + hh / 2 - (z - cz) * kz;
      for (let i = 0; i < n; i++) {
        ctx.beginPath(); ctx.arc(sx(pos[i][0]), sz(pos[i][2]), Math.max(5, rBody * 0.7), 0, 2 * Math.PI);
        ctx.fillStyle = seriesHex(i + 1); ctx.fill(); ctx.strokeStyle = cssColor('--surface'); ctx.stroke();
      }
      ctx.fillStyle = cssColor('--text-2'); ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(tr({ ko: '옆에서 본 모습 (x–z)', en: 'Side view (x–z)' }), 8, H + 14);
    }
  }, [frame, width, follow, dark, p.result, H]);
  const t = p.result.t[Math.min(frame, frames - 1)] ?? 0;
  return (
    <div ref={ref} data-testid={p.testId}>
      <div class="canvas-wrap" style={{ height: `${H + sideH}px` }}>
        <canvas ref={canvas} style={{ width: '100%', height: `${H + sideH}px` }} role="img"
          aria-label={tr({ ko: `드론 5대의 위치를 위에서 본 애니메이션. 현재 시각 ${fix(t, 1)}초, 최소 이격거리 ${fix(p.result.minDist[Math.min(frame, frames - 1)] ?? NaN, 2)} m`, en: `Top-view animation of five drones. Time ${fix(t, 1)} s, minimum separation ${fix(p.result.minDist[Math.min(frame, frames - 1)] ?? NaN, 2)} m` })} />
      </div>
      <div class="player">
        <button type="button" class="btn icon" onClick={() => { if (frame >= frames - 1) setFrame(0); setPlaying(!playing); }} aria-label={tr(playing ? { ko: '일시정지', en: 'Pause' } : { ko: '재생', en: 'Play' })} data-testid={p.testId ? `${p.testId}-play` : undefined}>{playing ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={frames - 1} value={frame} aria-label={tr({ ko: '재생 위치', en: 'Playback position' })} onInput={(e) => { setPlaying(false); setFrame(Number((e.target as HTMLInputElement).value)); }} />
        <span class="time">{fix(t, 1)} s</span>
        <button type="button" class="btn" aria-pressed={follow} onClick={() => setFollow(!follow)}>{tr(follow ? { ko: '화면: 대형을 따라감', en: 'View: following' } : { ko: '화면: 강당 전체', en: 'View: whole hall' })}</button>
      </div>
      {p.src && <p class="muted small" style={{ margin: '4px 0 0' }}>{tr({ ko: '원 안의 숫자는 기체 번호, 원의 지름은 충돌 지름입니다.', en: 'Numbers are drone indices; circle diameter is the collision diameter.' })}<SrcBadge src={p.src} /></p>}
    </div>
  );
}
