/* Registry-driven procedural assemblies. Illustrative: proportions approximate. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PackComponent } from './api';

export interface AssemblyHandle {
  select(id: string): void;
  setSuspect(id: string | null): void;
  setExplode(f: number): void;
  dispose(): void;
}

const SUSPECT = new THREE.Color(0xb45309);
const SELECTED = new THREE.Color(0x0e6b5e);

function std(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function ghost(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

function xCyl(r: number, len: number, seg = 48, open = false): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateZ(Math.PI / 2); // axis Y -> X
  return g;
}

function xRing(rIn: number, rOut: number, x: number): THREE.Mesh {
  const g = new THREE.RingGeometry(rIn, rOut, 64);
  g.rotateY(Math.PI / 2); // face +-X
  const m = new THREE.Mesh(g, std(0xd7dbe0, 1.0, 0.25));
  m.position.x = x;
  return m;
}

interface Parts {
  parts: Map<string, THREE.Group>;
  visualOf: Map<string, string>;
  scene: THREE.Scene;
}

function makePart(P: Parts, id: string, ex: number, ey: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.componentId = id;
  g.userData.explodeX = ex;
  g.userData.explodeY = ey;
  P.parts.set(id, g);
  P.scene.add(g);
  return g;
}

function mesh(
  g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

function mapVisual(P: Parts, visual: string, ids: string[]): void {
  for (const id of ids) P.visualOf.set(id, visual);
}

/* ---------------- rig (V1 assembly, horizontal shaft) ---------------- */

function buildRig(P: Parts): void {
  const shaft = makePart(P, 'shaft', 0, 0);
  mesh(shaft, xCyl(0.3, 7.6), std(0xc9ced4, 1.0, 0.3));
  mesh(shaft, xCyl(0.36, 0.5), std(0xaab0b6, 1.0, 0.3), -1.2);

  const motor = makePart(P, 'motor', -2.4, 0);
  const paint = std(0x3a6b5f, 0.35, 0.5);
  mesh(motor, new THREE.BoxGeometry(2.3, 1.9, 1.9), paint, -2.7, 0.1);
  mesh(motor, xCyl(0.75, 0.35), std(0x2c5249, 0.4, 0.5), -1.45, 0.1);
  mesh(motor, new THREE.BoxGeometry(0.5, 0.5, 2.2), paint, -2.7, -1.15);
  for (let i = 0; i < 5; i++) {
    mesh(motor, new THREE.BoxGeometry(2.0, 0.08, 2.0), std(0x2c5249, 0.4, 0.55), -2.7, 0.5 + i * 0.18);
  }

  const housing = makePart(P, 'housing', 3.2, 0);
  const cast = std(0x878d93, 0.6, 0.5);
  mesh(housing, new THREE.BoxGeometry(2.6, 0.45, 2.6), cast, 1.4, -1.4);
  mesh(housing, xCyl(1.55, 0.32), cast, 2.5);
  mesh(housing, new THREE.BoxGeometry(0.35, 1.4, 2.6), cast, 2.5, -0.6);

  const BX = 1.4;
  const outer = makePart(P, 'ring_outer', 2.4, 0);
  const shellO = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 1.0, roughness: 0.25, side: THREE.DoubleSide });
  mesh(outer, xCyl(1.05, 0.7, 64, true), shellO, BX);
  outer.add(xRing(0.86, 1.05, BX - 0.35));
  outer.add(xRing(0.86, 1.05, BX + 0.35));

  const inner = makePart(P, 'ring_inner', 0.6, 0);
  const shellI = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 1.0, roughness: 0.22, side: THREE.DoubleSide });
  mesh(inner, xCyl(0.62, 0.7, 64, true), shellI, BX);
  inner.add(xRing(0.42, 0.62, BX - 0.35));
  inner.add(xRing(0.42, 0.62, BX + 0.35));

  const rollers = makePart(P, 'rollers', 1.5, 0);
  const ballMat = std(0x9aa0a6, 1.0, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mesh(rollers, new THREE.SphereGeometry(0.21, 24, 18), ballMat, BX, Math.cos(a) * 0.835, Math.sin(a) * 0.835);
  }

  const cage = makePart(P, 'cage', 0.95, 0);
  const brass = std(0xb08d3e, 1.0, 0.35);
  for (const dx of [-0.28, 0.28]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.835, 0.05, 12, 64), brass);
    t.rotation.y = Math.PI / 2;
    t.position.x = BX + dx;
    t.castShadow = true;
    cage.add(t);
  }
  for (const id of P.parts.keys()) P.visualOf.set(id, id);
}

/* ---------------- CR pump (vertical multistage, illustrative) ---------------- */

const STAGES = 4;

function buildPump(P: Parts): void {
  const steel = std(0xb9bfc6, 1.0, 0.3);
  const darkSteel = std(0x7d848b, 0.9, 0.4);
  const blue = std(0x2f5d8a, 0.4, 0.5);
  const blueDark = std(0x23486d, 0.4, 0.55);
  const brass = std(0xb08d3e, 1.0, 0.35);

  const base = makePart(P, 'mounting-base', 0, 0);
  mesh(base, new THREE.BoxGeometry(3.6, 0.25, 2.4), darkSteel, 0, -1.62);
  mapVisual(P, 'mounting-base', ['mounting-base', 'slide-rail']);

  const foot = makePart(P, 'suction-discharge-base', 0, 0);
  mesh(foot, new THREE.BoxGeometry(2.2, 0.7, 1.6), blue, 0, -1.15);
  const port = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 24);
  port.rotateX(Math.PI / 2);
  mesh(foot, port, blueDark, -0.6, -1.15, 1.0);
  mesh(foot, port, blueDark, 0.6, -1.15, 1.0);
  mapVisual(P, 'suction-discharge-base',
    ['suction-discharge-base', 'base-oring', 'support-foot']);

  const stays = makePart(P, 'staybolt', 0, 0.5);
  for (const [sx, sz] of [[-1.25, -0.7], [1.25, -0.7], [-1.25, 0.7], [1.25, 0.7]]) {
    mesh(stays, new THREE.CylinderGeometry(0.06, 0.06, 3.4, 12), steel, sx, 0.6, sz);
    mesh(stays, new THREE.CylinderGeometry(0.11, 0.11, 0.12, 6), darkSteel, sx, 2.25, sz);
    mesh(stays, new THREE.CylinderGeometry(0.11, 0.11, 0.12, 6), darkSteel, sx, -1.0, sz);
  }
  mapVisual(P, 'staybolt', ['staybolt', 'staybolt-nut', 'staybolt-washer']);

  const sleeve = makePart(P, 'sleeve', 0, 0.9);
  mesh(sleeve, new THREE.CylinderGeometry(0.95, 0.95, 2.5, 48, 1, true), ghost(0x9fb6c9), 0, 0.55);
  mesh(sleeve, new THREE.CylinderGeometry(1.02, 1.02, 0.16, 48, 1, true), blue, 0, 1.82);
  mapVisual(P, 'sleeve', ['sleeve', 'sleeve-flange', 'sleeve-flange-screw',
    'sleeve-flange-washer', 'sleeve-flange-nut', 'sleeve-oring']);

  // stage stack inside the sleeve: chambers + impellers + shaft
  const chambers = makePart(P, 'chamber', 0, 0.45);
  const chamberMat = std(0x8e969d, 0.9, 0.4);
  for (let i = 0; i < STAGES; i++) {
    const y = -0.35 + i * 0.55;
    mesh(chambers, new THREE.CylinderGeometry(0.62, 0.62, 0.3, 32, 1, true),
      i === STAGES - 1 ? std(0x6f777e, 0.9, 0.4) : chamberMat, 0, y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 40), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 0.15;
    ring.castShadow = true;
    chambers.add(ring);
  }
  // stack straps
  mesh(chambers, new THREE.BoxGeometry(0.08, 2.3, 0.08), darkSteel, -0.72, 0.55);
  mesh(chambers, new THREE.BoxGeometry(0.08, 2.3, 0.08), darkSteel, 0.72, 0.55);
  mapVisual(P, 'chamber', ['chamber', 'chamber-bearing', 'top-chamber',
    'suction-inlet-connector', 'neck-ring', 'seal-ring-retainer', 'bearing-ring',
    'stack-spacer', 'stack-strap', 'stack-strap-bolt', 'stack-strap-washer',
    'impeller-stack', 'cartridge-assembly']);

  const impellers = makePart(P, 'impeller', 0, 0.45);
  const impMat = std(0xd8b34a, 1.0, 0.3);
  for (let i = 0; i < STAGES; i++) {
    const y = -0.35 + i * 0.55;
    mesh(impellers, new THREE.CylinderGeometry(0.48, 0.48, 0.09, 32), impMat, 0, y);
    mesh(impellers, new THREE.CylinderGeometry(0.12, 0.2, 0.16, 16), impMat, 0, y + 0.1);
  }
  mapVisual(P, 'impeller', ['impeller', 'impeller-wear-ring']);

  const pshaft = makePart(P, 'shaft', 0, 0);
  mesh(pshaft, new THREE.CylinderGeometry(0.14, 0.14, 6.4, 20), steel, 0, 1.3);
  mesh(pshaft, new THREE.CylinderGeometry(0.2, 0.2, 0.18, 6), darkSteel, 0, -0.62);
  mapVisual(P, 'shaft', ['shaft', 'shaft-pin', 'shaft-lock-nut', 'lock-washer',
    'splined-spacer']);

  const head = makePart(P, 'pump-head', 0, 1.5);
  mesh(head, new THREE.CylinderGeometry(1.0, 1.0, 0.5, 40), blue, 0, 2.1);
  const stub = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24);
  stub.rotateZ(Math.PI / 2);
  mesh(head, stub, blueDark, 1.2, 2.1);
  const fring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 28), darkSteel);
  fring.rotation.y = Math.PI / 2;
  fring.position.set(1.6, 2.1, 0);
  fring.castShadow = true;
  head.add(fring);
  mapVisual(P, 'pump-head', ['pump-head', 'discharge-flange', 'flange-pipe-plug',
    'flange-allen-screw', 'flange-ring', 'flange-retaining-ring', 'discharge-oring']);

  const cover = makePart(P, 'pump-head-cover', 0, 1.9);
  mesh(cover, new THREE.CylinderGeometry(0.66, 0.72, 0.3, 32), blueDark, 0, 2.5);
  mapVisual(P, 'pump-head-cover',
    ['pump-head-cover', 'head-plug', 'compression-spring']);

  const disk = makePart(P, 'disk-plate', 0, 2.1);
  mesh(disk, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 28), steel, 0, 2.62);
  mesh(disk, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 20), brass, 0, 2.62);
  mapVisual(P, 'disk-plate',
    ['disk-plate', 'disk-bushing', 'disk-retaining-washer', 'disk-oring']);

  const seal = makePart(P, 'shaft-seal', 0, 1.1);
  mesh(seal, new THREE.CylinderGeometry(0.24, 0.24, 0.4, 24), std(0x44484d, 0.7, 0.4), 0, 2.28);
  mapVisual(P, 'shaft-seal', ['shaft-seal', 'inboard-seal', 'seal-securing-screw']);

  const stool = makePart(P, 'motor-stool', 0, 2.3);
  for (const [sx, sz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    mesh(stool, new THREE.BoxGeometry(0.14, 0.9, 0.14), blue, sx, 3.05, sz);
  }
  mesh(stool, new THREE.BoxGeometry(1.5, 0.12, 1.5), blue, 0, 3.55);
  mapVisual(P, 'motor-stool', ['motor-stool', 'motor-bolt']);

  const coupling = makePart(P, 'coupling-half', 0, 1.4);
  mesh(coupling, new THREE.CylinderGeometry(0.34, 0.34, 0.22, 24), darkSteel, 0, 2.95);
  mesh(coupling, new THREE.CylinderGeometry(0.34, 0.34, 0.22, 24), steel, 0, 3.2);
  mapVisual(P, 'coupling-half', ['coupling-half', 'coupling-bolt']);

  const guard = makePart(P, 'coupling-guard', 0, 2.5);
  mesh(guard, new THREE.CylinderGeometry(0.48, 0.48, 0.8, 24, 1, true, 0, Math.PI),
    ghost(0xd8b34a), 0, 3.05);
  mapVisual(P, 'coupling-guard', ['coupling-guard', 'coupling-guard-screw']);

  const motor = makePart(P, 'motor', 0, 3.0);
  mesh(motor, new THREE.CylinderGeometry(0.78, 0.78, 1.15, 36), blue, 0, 4.25);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 8, 40), blueDark);
    fin.rotation.x = Math.PI / 2;
    fin.position.y = 3.9 + i * 0.24;
    fin.castShadow = true;
    motor.add(fin);
  }
  mesh(motor, new THREE.BoxGeometry(0.5, 0.35, 0.4), blueDark, 0.75, 4.4);
  mapVisual(P, 'motor', ['motor']);
}

/* ---------------- generic builder (any registry) ---------------- */

function shapeFor(name: string): 'ring' | 'rod' | 'ball' | 'plate' | 'box' {
  const n = name.toLowerCase();
  if (/(ring|seal|bearing|washer|gasket|o-ring|retainer|coupling|flange|nut)/.test(n)) return 'ring';
  if (/(shaft|bolt|screw|pin|rod|spring|spacer|strap|plug|rail|staybolt)/.test(n)) return 'rod';
  if (/(ball|roller|impeller|bushing)/.test(n)) return 'ball';
  if (/(plate|cover|disk|disc|guard|base|stool|head|sleeve|chamber|housing|motor|stator|rotor)/.test(n)) return 'plate';
  return 'box';
}

function buildGeneric(P: Parts, components: PackComponent[]): void {
  const ids = new Set(components.map((c) => c.id));
  const kids = new Map<string, PackComponent[]>();
  const roots: PackComponent[] = [];
  for (const c of components) {
    if (c.parent && ids.has(c.parent)) {
      const list = kids.get(c.parent) ?? [];
      list.push(c);
      kids.set(c.parent, list);
    } else {
      roots.push(c);
    }
  }
  // BFS levels from roots
  const level = new Map<string, number>();
  const queue: [PackComponent, number][] = roots.map((r) => [r, 0]);
  for (const c of components) if (!level.has(c.id) && !queue.some(([q]) => q.id === c.id)) queue.push([c, 0]);
  while (queue.length) {
    const [c, lv] = queue.shift()!;
    if (level.has(c.id)) continue;
    level.set(c.id, lv);
    for (const k of kids.get(c.id) ?? []) queue.push([k, lv + 1]);
  }
  const byLevel = new Map<number, PackComponent[]>();
  for (const c of components) {
    const lv = level.get(c.id) ?? 0;
    const list = byLevel.get(lv) ?? [];
    list.push(c);
    byLevel.set(lv, list);
  }
  let maxLv = 0;
  for (const lv of byLevel.keys()) maxLv = Math.max(maxLv, lv);
  const levels = [...byLevel.entries()];
  levels.sort((x, y) => x[0] - y[0]);
  const palette = [0x2f5d8a, 0x3a6b5f, 0x8a6d2f, 0x6b3a5d, 0x4a4e57, 0x2f8a6d];
  let i = 0;
  for (const entry of levels) {
    const lv = entry[0];
    const group = entry[1];
    const y = (maxLv - lv) * 1.1 - maxLv * 0.55;
    group.forEach((c, j) => {
      const a = group.length > 1 ? (j / group.length) * Math.PI * 2 : 0;
      const rad = group.length > 1 ? 1.6 : 0;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const g = makePart(P, c.id, x * 0.6, (lv - maxLv / 2) * -0.9);
      const mat = std(palette[i++ % palette.length], 0.7, 0.4);
      const s = Math.max(0.55, 1.05 - lv * 0.12);
      switch (shapeFor(c.name)) {
        case 'ring': {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.42 * s, 0.13 * s, 12, 32), mat);
          t.rotation.x = Math.PI / 2;
          t.castShadow = true;
          g.add(t);
          break;
        }
        case 'rod':
          mesh(g, new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.9 * s, 14), mat);
          break;
        case 'ball':
          mesh(g, new THREE.SphereGeometry(0.3 * s, 20, 14), mat);
          break;
        case 'plate':
          mesh(g, new THREE.CylinderGeometry(0.5 * s, 0.55 * s, 0.22 * s, 24), mat);
          break;
        default:
          mesh(g, new THREE.BoxGeometry(0.5 * s, 0.5 * s, 0.5 * s), mat);
      }
      g.position.x = x;
      g.position.z = z;
      g.position.y = y;
      // explode offsets are relative; bake base pos into userData
      g.userData.baseX = x;
      g.userData.baseY = y;
      g.userData.baseZ = z;
      P.visualOf.set(c.id, c.id);
    });
  }
}

/* ---------------- viewer ---------------- */

export function initAssembly(
  el: HTMLElement,
  opts: {
    onSelect: (id: string) => void;
    labelFor: (id: string) => string;
    machine: string;
    components: PackComponent[];
  },
): AssemblyHandle {
  const W = () => el.clientWidth || 300;
  const H = 380;
  const vertical = opts.machine !== 'rig';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W(), H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, W() / H, 0.1, 100);
  if (vertical) {
    camera.position.set(6.5, 3.2, 7.5);
  } else {
    camera.position.set(5.4, 3.4, 6.2);
  }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, vertical ? 1.4 : 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 22;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa39a, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(5, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-4, 3, -5);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.78;
  ground.receiveShadow = true;
  scene.add(ground);

  const P: Parts = { parts: new Map(), visualOf: new Map(), scene };
  if (opts.machine === 'rig') buildRig(P);
  else if (opts.machine === 'cr-pump') buildPump(P);
  else buildGeneric(P, opts.components);

  // registry ids without explicit visuals fall back to their own part id
  for (const c of opts.components) {
    if (!P.visualOf.has(c.id)) P.visualOf.set(c.id, c.id);
  }
  const resolve = (id: string): string | null => {
    const v = P.visualOf.get(id) ?? id;
    return P.parts.has(v) ? v : null;
  };
  // reverse map: visual part -> first registry id (for picking labels)
  const regOf = new Map<string, string>();
  for (const [reg, vis] of P.visualOf) {
    if (!regOf.has(vis)) regOf.set(vis, reg);
  }

  let selected: string | null = null;
  let suspect: string | null = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function materialsOf(id: string): THREE.MeshStandardMaterial[] {
    const out: THREE.MeshStandardMaterial[] = [];
    P.parts.get(id)?.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) out.push(m);
    });
    return out;
  }

  function repaint(now: number): void {
    const pulse = reduceMotion ? 0.55 : 0.45 + 0.25 * Math.sin(now / 350);
    for (const id of P.parts.keys()) {
      for (const m of materialsOf(id)) {
        if (id === suspect) {
          m.emissive.copy(SUSPECT);
          m.emissiveIntensity = pulse;
        } else if (id === selected) {
          m.emissive.copy(SELECTED);
          m.emissiveIntensity = 0.35;
        } else {
          m.emissiveIntensity = 0;
        }
      }
    }
  }

  const bar = document.createElement('div');
  bar.className = 'explode-row';
  const lab = document.createElement('label');
  lab.textContent = 'Explode';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Explode assembly');
  lab.appendChild(slider);
  bar.appendChild(lab);
  el.appendChild(bar);

  const caption = document.createElement('p');
  caption.className = 'muted';
  caption.textContent = 'Illustrative model — proportions approximate, not to scale.';
  el.appendChild(caption);

  const tag = document.createElement('div');
  tag.className = 'part-tag';
  tag.hidden = true;
  el.appendChild(tag);

  let explodeF = 0;
  function applyExplode(): void {
    for (const g of P.parts.values()) {
      g.position.x = ((g.userData.baseX as number) ?? 0) + (g.userData.explodeX as number) * explodeF;
      g.position.y = ((g.userData.baseY as number) ?? 0) + (g.userData.explodeY as number) * explodeF;
      g.position.z = (g.userData.baseZ as number) ?? 0;
    }
  }
  slider.addEventListener('input', () => {
    explodeF = Number(slider.value) / 100;
    applyExplode();
  });

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    downAt = [e.clientX, e.clientY];
  });
  renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([...P.parts.values()], true);
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.componentId) o = o.parent;
      if (o) {
        selected = o.userData.componentId as string;
        repaint(0);
        opts.onSelect(regOf.get(selected) ?? selected);
      }
    }
  });

  const proj = new THREE.Vector3();
  function updateTag(): void {
    const id = suspect ?? selected;
    const g = id ? P.parts.get(id) : undefined;
    if (!g || !id) {
      tag.hidden = true;
      return;
    }
    proj.setFromMatrixPosition(g.matrixWorld);
    proj.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const base = el.getBoundingClientRect();
    tag.style.left = `${((proj.x + 1) / 2) * rect.width + rect.left - base.left}px`;
    tag.style.top = `${((-proj.y + 1) / 2) * rect.height}px`;
    const reg = regOf.get(id) ?? id;
    tag.textContent = id === suspect ? `${opts.labelFor(reg)} — suspected` : opts.labelFor(reg);
    tag.hidden = false;
  }

  const ro = new ResizeObserver(() => {
    camera.aspect = W() / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H);
  });
  ro.observe(el);

  renderer.setAnimationLoop((now: number) => {
    controls.update();
    repaint(now);
    updateTag();
    renderer.render(scene, camera);
  });

  return {
    select(id: string): void {
      selected = resolve(id);
      repaint(0);
    },
    setSuspect(id: string | null): void {
      suspect = id ? resolve(id) : null;
      repaint(0);
    },
    setExplode(f: number): void {
      explodeF = Math.min(1, Math.max(0, f));
      slider.value = String(Math.round(explodeF * 100));
      applyExplode();
    },
    dispose(): void {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.innerHTML = '';
    },
  };
}
