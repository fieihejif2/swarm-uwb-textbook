/**
 * three.js 3D 뷰 (z 축이 위). 마우스 드래그/터치로 회전, 휠로 확대, 포커스 후 방향키로 회전, +/- 로 확대.
 * three.js 는 이 컴포넌트를 쓰는 화면에서만 지연 로딩된다.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type * as THREE_NS from 'three';
import { tr } from '../app/i18n';
import { isDark } from '../app/store';
import { SrcRef } from '../sources';
import { SrcBadge } from './Badge';
import { useWidth } from './Plot';
import { cssColor, seriesHex } from './theme';

export interface Scene3DContext {
  THREE: typeof THREE_NS;
  /** 여기에 물체를 추가한다. deps 가 바뀌면 비우고 build 를 다시 부른다. */
  group: THREE_NS.Group;
  /** CSS 변수 색(예: '--text-2')을 three.js 색으로 */
  color: (cssVar: string) => THREE_NS.Color;
  /** 계열 색 슬롯 1~8 */
  series: (slot: number) => THREE_NS.Color;
  /** 직육면체 테두리(강당 등). min/max 는 [x,y,z] */
  wireBox: (min: number[], max: number[], cssVar?: string) => void;
  /** 타원체(반축 radii). opacity < 1 이면 반투명 */
  ellipsoid: (center: number[], radii: number[], slot: number, opacity?: number) => THREE_NS.Mesh;
  /** 작은 구 표식 */
  marker: (pos: number[], slot: number, size?: number) => THREE_NS.Mesh;
  /** 꺾은선 */
  line: (points: number[][], slot: number | string, dashed?: boolean) => void;
  /** 바닥 격자 (z = 0) */
  floorGrid: (sizeX: number, sizeY: number, step?: number) => void;
  /** 글자 표지(항상 카메라를 향함) */
  label: (pos: number[], text: string) => void;
}
export interface Scene3DProps {
  build: (ctx: Scene3DContext) => void;
  /** 이 값들이 바뀌면 장면을 다시 만든다 */
  deps: unknown[];
  height?: number;
  /** 카메라가 바라보는 점과 처음 위치 */
  target: number[];
  cameraPos: number[];
  ariaLabel: string;
  src?: SrcRef;
  testId?: string;
}

export function Scene3D(p: Scene3DProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef<{ rebuild: () => void; resize: (w: number, h: number) => void; dispose: () => void; orbit: (dAz: number, dEl: number, zoom: number) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const height = p.height ?? 340;
  const dark = isDark.value;
  const buildRef = useRef(p.build);
  buildRef.current = p.build;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (!alive || !mount.current) return;
        THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
        camera.up.set(0, 0, 1);
        camera.position.set(p.cameraPos[0], p.cameraPos[1], p.cameraPos[2]);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(p.target[0], p.target[1], p.target[2]);
        controls.enableDamping = false;
        controls.update();
        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(3, -4, 8);
        scene.add(sun);
        const group = new THREE.Group();
        scene.add(group);
        mount.current.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.touchAction = 'none';
        const render = () => renderer.render(scene, camera);
        controls.addEventListener('change', render);
        const color = (v: string) => new THREE.Color(cssColor(v));
        const series = (slot: number) => new THREE.Color(seriesHex(slot));
        const ctx: Scene3DContext = {
          THREE, group, color, series,
          wireBox(min, max, cssVar = '--text-2') {
            const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
            const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: color(cssVar) }));
            e.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
            group.add(e);
          },
          ellipsoid(center, radii, slot, opacity = 1) {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ color: series(slot), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, roughness: 0.7 }));
            mesh.scale.set(radii[0], radii[1], radii[2]);
            mesh.position.set(center[0], center[1], center[2]);
            group.add(mesh);
            return mesh;
          },
          marker(pos, slot, size = 0.08) {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), new THREE.MeshStandardMaterial({ color: series(slot), roughness: 0.6 }));
            mesh.position.set(pos[0], pos[1], pos[2]);
            group.add(mesh);
            return mesh;
          },
          line(points, slot, dashed = false) {
            const g = new THREE.BufferGeometry().setFromPoints(points.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
            const c = typeof slot === 'number' ? series(slot) : color(slot);
            const l = new THREE.Line(g, dashed ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.15, gapSize: 0.1 }) : new THREE.LineBasicMaterial({ color: c }));
            if (dashed) l.computeLineDistances();
            group.add(l);
          },
          floorGrid(sx, sy, step = 1) {
            const pts: THREE_NS.Vector3[] = [];
            for (let x = 0; x <= sx + 1e-9; x += step) pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, sy, 0));
            for (let y = 0; y <= sy + 1e-9; y += step) pts.push(new THREE.Vector3(0, y, 0), new THREE.Vector3(sx, y, 0));
            group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: color('--border') })));
          },
          label(pos, text) {
            const c = document.createElement('canvas');
            const g = c.getContext('2d')!;
            const font = '600 28px system-ui, sans-serif';
            g.font = font;
            c.width = Math.ceil(g.measureText(text).width) + 12; c.height = 40;
            g.font = font; g.fillStyle = cssColor('--text'); g.textBaseline = 'middle';
            g.fillText(text, 6, 20);
            const tex = new THREE.CanvasTexture(c);
            // sizeAttenuation: false → 거리와 무관하게 화면에서 같은 크기로 보인다
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
            const s = 0.0011;
            sp.scale.set(c.width * s, c.height * s, 1);
            sp.position.set(pos[0], pos[1], pos[2]);
            group.add(sp);
          },
        };
        const clear = () => {
          for (const o of [...group.children]) {
            group.remove(o);
            (o as any).geometry?.dispose?.();
            const mat = (o as any).material;
            if (mat) { mat.map?.dispose?.(); mat.dispose?.(); }
          }
        };
        state.current = {
          rebuild() { clear(); buildRef.current(ctx); render(); },
          resize(w, h) { renderer.setSize(w, h, false); renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`; camera.aspect = w / h; camera.updateProjectionMatrix(); render(); },
          dispose() { clear(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
          orbit(dAz, dEl, zoom) {
            const off = camera.position.clone().sub(controls.target);
            const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(off.x, off.z, -off.y)); // z-up → y-up 구면좌표
            sph.theta += dAz; sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi + dEl)); sph.radius *= zoom;
            const v = new THREE.Vector3().setFromSpherical(sph);
            camera.position.set(controls.target.x + v.x, controls.target.y - v.z, controls.target.z + v.y);
            camera.lookAt(controls.target);
            controls.update();
            render();
          },
        };
        state.current.resize(Math.max(200, mount.current.clientWidth), height);
        state.current.rebuild();
      } catch (e) {
        console.warn('[Scene3D] WebGL 을 쓸 수 없습니다', e);
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; state.current?.dispose(); state.current = null; };
  }, []);
  useEffect(() => { if (width > 0) state.current?.resize(width, height); }, [width, height]);
  useEffect(() => { state.current?.rebuild(); }, [...p.deps, dark]);
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, [number, number, number]> = { ArrowLeft: [-0.12, 0, 1], ArrowRight: [0.12, 0, 1], ArrowUp: [0, -0.1, 1], ArrowDown: [0, 0.1, 1], '+': [0, 0, 0.9], '=': [0, 0, 0.9], '-': [0, 0, 1.1] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    state.current?.orbit(m[0], m[1], m[2]);
  };
  return (
    <div ref={ref} data-testid={p.testId}>
      <div ref={mount} class="canvas-wrap" style={{ height: `${height}px` }} tabIndex={0} role="img" aria-label={`${p.ariaLabel}. ${tr({ ko: '방향키로 회전, +/− 로 확대·축소할 수 있습니다.', en: 'Rotate with arrow keys, zoom with +/−.' })}`} onKeyDown={onKey}>
        {failed && <p class="muted small" style={{ padding: '12px' }}>{tr({ ko: '이 브라우저에서는 3D 보기를 쓸 수 없습니다(WebGL 미지원). 아래 수치와 2D 그림으로 같은 내용을 확인할 수 있습니다.', en: '3D view is unavailable in this browser (no WebGL). The numbers and 2D figures below show the same content.' })}</p>}
      </div>
      <p class="muted small" style={{ margin: '4px 0 0' }}>{tr({ ko: '끌어서 회전 · 휠/핀치로 확대 · 포커스 후 방향키와 +/−', en: 'Drag to rotate · wheel/pinch to zoom · arrow keys and +/− when focused' })}{p.src && <SrcBadge src={p.src} />}</p>
    </div>
  );
}
