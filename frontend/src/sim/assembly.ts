/* Realistic blueprint pump–motor assembly (visual-plan/PRD.md).
   One reproducible procedural source: fastener factory (hex + true helical
   thread + washer + nut), parametric ball-bearing factory (rings, 10 balls,
   split brass cage), vertical multistage pump stack in hero.png order, and a
   running simulation (shaft group 1.0x, cages/balls 0.42x, outer rings 0x,
   stage-by-stage fluid particles, fan airflow, seal-leak / blocked-stage /
   bearing-wobble faults). Part names follow PRD §4/§6. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PackComponent } from '../api';

export interface AssemblyHandle {
  select(id: string): void;
  setSuspect(id: string | null): void;
  setExplode(f: number): void;
  setLayout(layout: 'assembled' | 'sheet', instant?: boolean): void;
  assemble(visualIds: string[][], onStep?: (k: number, n: number) => void): Promise<void>;
  setRun(run: boolean): void;
  setSpinSpeed(f: number): void;
  setFault(regIds: string[], wobble: number): void;
  setCameraHome(): void;
  setPaused(p: boolean): void;
  dispose(): void;
}

const SUSPECT = new THREE.Color(0xb45309);
const SELECTED = new THREE.Color(0x0e6b5e);

/* PRD §3 palette (albedo) */
const COL = {
  pumpBlue: 0x3e5a76, motorBlue: 0x405a74, sage: 0x55665a,
  steel: 0xb9bdc2, darkSteel: 0x6e7276, brass: 0xa67c3f,
  black: 0x1c1c1e, copper: 0xb87333,
};

function std(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}
function xCyl(r: number, len: number, seg = 48, open = false): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  return g;
}
function xRing(rIn: number, rOut: number, x: number): THREE.Mesh {
  const g = new THREE.RingGeometry(rIn, rOut, 64);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, std(0xd7dbe0, 1.0, 0.25));
  m.position.x = x;
  return m;
}

interface Parts { parts: Map<string, THREE.Group>; visualOf: Map<string, string>; scene: THREE.Scene }
function makePart(P: Parts, id: string, ex: number, ey: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.componentId = id;
  g.userData.explodeX = ex;
  g.userData.explodeY = ey;
  P.parts.set(id, g);
  P.scene.add(g);
  return g;
}
function mesh(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function mapVisual(P: Parts, visual: string, ids: string[]): void {
  for (const id of ids) P.visualOf.set(id, visual);
}

/* ================= fastener factory (PRD §4.4) =================
   Hex head/nut = 6-flat cylinders; thread = true helical tube; every bolt
   ships with a flat washer. Geometries cached per size. */
const geoCache = new Map<string, THREE.BufferGeometry>();
function helix(r: number, len: number, pitch: number, tube: number): THREE.BufferGeometry {
  const key = `hx${r}|${len}|${pitch}|${tube}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const pts: THREE.Vector3[] = [];
  const turns = Math.max(2, Math.floor(len / pitch));
  const steps = turns * 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, -len / 2 + t * len, Math.sin(a) * r));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tube, 5, false);
  geoCache.set(key, g);
  return g;
}
const MAT_STEEL = std(COL.steel, 1.0, 0.35);
const MAT_DARK = std(COL.darkSteel, 1.0, 0.4);
const MAT_BRASS = std(COL.brass, 1.0, 0.35);
const MAT_BLACK = std(COL.black, 0.0, 0.6);

/** One hex bolt + washer, shank along +Y from y=0 (head at top). d = thread Ø. */
function bolt(parent: THREE.Group, d: number, len: number, x: number, y: number, z: number, mat: THREE.Material = MAT_STEEL): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const af = d * 1.6;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(af * 0.577, af * 0.577, d * 0.65, 6), mat);
  head.position.y = len + d * 0.325;
  head.castShadow = true;
  g.add(head);
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(d, d * 0.55, d * 0.15, 24), mat);
  washer.position.y = len - d * 0.075;
  washer.castShadow = true;
  g.add(washer);
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.42, d * 0.42, len, 12), mat);
  shank.position.y = len / 2;
  shank.castShadow = true;
  g.add(shank);
  const thread = new THREE.Mesh(helix(d * 0.46, len * 0.92, d * 0.16, d * 0.07), mat);
  thread.position.y = len / 2;
  g.add(thread);
  parent.add(g);
}
function nut(parent: THREE.Group, d: number, x: number, y: number, z: number, mat: THREE.Material = MAT_STEEL): void {
  const af = d * 1.6;
  const n = new THREE.Mesh(new THREE.CylinderGeometry(af * 0.577, af * 0.577, d * 0.8, 6), mat);
  n.position.set(x, y, z);
  n.castShadow = true;
  parent.add(n);
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.45, d * 0.45, d * 0.84, 12), MAT_BLACK);
  bore.position.set(x, y, z);
  parent.add(bore);
}
function washer(parent: THREE.Group, d: number, x: number, y: number, z: number): void {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(d, d * 0.55, d * 0.15, 24), MAT_STEEL);
  w.position.set(x, y, z);
  w.castShadow = true;
  parent.add(w);
}
/** Bolt lying/standing at an arbitrary tilt for loose-hardware clusters. */
function looseBolt(parent: THREE.Group, d: number, len: number, x: number, y: number, z: number, rx: number, rz: number): void {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.set(rx, 0, rz);
  parent.add(holder);
  bolt(holder, d, len, 0, 0, 0);
}
/** Coil spring: true helix tube. */
function spring(parent: THREE.Group, r: number, h: number, x: number, y: number, z: number, turns = 7): void {
  const pts: THREE.Vector3[] = [];
  const steps = turns * 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(x + Math.cos(a) * r, y + t * h, z + Math.sin(a) * r));
  }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, r * 0.16, 6, false), MAT_DARK);
  m.castShadow = true;
  parent.add(m);
}
function oring(parent: THREE.Group, R: number, cord: number, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, cord, 10, 40), MAT_BLACK);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
}

/* ================= bearing factory (PRD §4.3) =================
   B = outer Ø. 10 balls on 0.74B pitch, split brass cage (2 halves),
   housing ring with 4-bolt flange. Returns {group, cage, balls}. */
function makeBearing(B: number): { group: THREE.Group; cage: THREE.Group; balls: THREE.Group } {
  const group = new THREE.Group();
  const cage = new THREE.Group();
  const balls = new THREE.Group();
  const w = B * 0.22;
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, w, 48, 1, true), std(COL.steel, 1, 0.25));
  (outer.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  outer.castShadow = true;
  group.add(outer);
  for (const s of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(B * 0.43, B * 0.035, 8, 40), std(COL.steel, 1, 0.25));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = s * w * 0.42;
    group.add(lip);
  }
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.31, B * 0.31, w, 40, 1, true), std(0xd7dbe0, 1, 0.2));
  (inner.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  inner.castShadow = true;
  group.add(inner);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(B * 0.0575, 18, 14), std(0xe8eaec, 1, 0.08));
    b.position.set(Math.cos(a) * B * 0.37, 0, Math.sin(a) * B * 0.37);
    b.castShadow = true;
    balls.add(b);
  }
  for (const s of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.TorusGeometry(B * 0.37, B * 0.045, 8, 40, Math.PI * 1.82), MAT_BRASS);
    half.rotation.x = Math.PI / 2;
    half.rotation.z = s > 0 ? 0.2 : Math.PI + 0.2;
    half.position.y = s * w * 0.3;
    half.castShadow = true;
    cage.add(half);
  }
  group.add(cage);
  group.add(balls);
  return { group, cage, balls };
}

/* ---------------- rig (horizontal bearing rig, kept) ---------------- */
function buildRig(P: Parts): void {
  const shaft = makePart(P, 'shaft', 0, 0);
  mesh(shaft, xCyl(0.3, 7.6), std(0xc9ced4, 1.0, 0.3));
  mesh(shaft, xCyl(0.36, 0.5), std(0xaab0b6, 1.0, 0.3), -1.2);
  const motor = makePart(P, 'motor', -2.4, 0);
  const paint = std(COL.sage, 0.35, 0.5);
  mesh(motor, new THREE.BoxGeometry(2.3, 1.9, 1.9), paint, -2.7, 0.1);
  mesh(motor, xCyl(0.75, 0.35), std(0x2c5249, 0.4, 0.5), -1.45, 0.1);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    mesh(motor, new THREE.BoxGeometry(2.0, 0.07, 0.16), std(0x44584c, 0.4, 0.55), -2.7, 0.1 + Math.cos(a) * 0.98, Math.sin(a) * 0.98);
  }
  const housing = makePart(P, 'housing', 3.2, 0);
  const cast = std(0x878d93, 0.6, 0.5);
  mesh(housing, new THREE.BoxGeometry(2.6, 0.45, 2.6), cast, 1.4, -1.4);
  mesh(housing, xCyl(1.55, 0.32), cast, 2.5);
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
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mesh(rollers, new THREE.SphereGeometry(0.115 * 2 * 0.92, 20, 16), std(0xe8eaec, 1, 0.08), BX, Math.cos(a) * 0.835, Math.sin(a) * 0.835);
  }
  const cage = makePart(P, 'cage', 0.95, 0);
  for (const dx of [-0.28, 0.28]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.835, 0.05, 12, 64), MAT_BRASS);
    t.rotation.y = Math.PI / 2;
    t.position.x = BX + dx;
    t.castShadow = true;
    cage.add(t);
  }
  for (const id of P.parts.keys()) P.visualOf.set(id, id);
}

/* ================= CR pump: realistic blueprint machine (PRD §4.1) =======
   Stack order top→bottom = hero.png. Scene units: exploded height ≈ 7.6. */
const DIFF_Y = [0.38, 0.62, 0.86, 1.10, 1.34]; // 5 diffuser bowls, wider pitch so all 5 read
function buildPump(P: Parts): void {
  const blue = std(COL.pumpBlue, 0.15, 0.55);
  const blueDark = std(0x3a5470, 0.15, 0.6);
  const motorBlue = std(COL.motorBlue, 0.15, 0.5);
  const steel = std(COL.steel, 1.0, 0.22);

  /* ---- mounting base + volute casing (PRD: 0.20L wide, flanges, feet) ---- */
  const base = makePart(P, 'mounting-base', 0, 0);
  // No base plate (refs show volute feet only): just the 4 foot bolts.
  for (const sx of [-0.55, 0.55]) for (const sz of [0.45]) bolt(base, 0.09, 0.1, sx, -1.52, sz);
  mapVisual(P, 'mounting-base', ['mounting-base', 'slide-rail']);

  const volute = makePart(P, 'suction-discharge-base', 0, 0.15);
  const body = mesh(volute, new THREE.CylinderGeometry(0.95, 1.0, 0.85, 40), blue, 0, -1.05);
  body.scale.z = 0.82;
  mesh(volute, new THREE.CylinderGeometry(0.42, 0.5, 0.3, 32), blue, 0, -0.5); // suction neck
  const neckFlange = mesh(volute, new THREE.CylinderGeometry(0.52, 0.52, 0.09, 32), steel, 0, -0.36);
  neckFlange.castShadow = true;
  for (let i = 0; i < 8; i++) { // suction flange bolt circle M10
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    bolt(volute, 0.075, 0.1, Math.cos(a) * 0.44, -0.3, Math.sin(a) * 0.44);
  }
  for (const side of [-1, 1]) { // side flanges (inlet left, discharge right)
    const f = new THREE.Group();
    f.position.set(side * 1.05, -1.05, 0);
    f.rotation.z = side * Math.PI / 2;
    volute.add(f);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 32), steel);
    disc.castShadow = true;
    f.add(disc);
    for (const gr of [0.3, 0.42]) { // concentric machining grooves on flange face
      const groove = new THREE.Mesh(new THREE.TorusGeometry(gr, 0.008, 6, 40), MAT_DARK);
      groove.rotation.x = Math.PI / 2; groove.position.y = 0.052; f.add(groove);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.35, 32), blue);
    pipe.position.y = -0.2;
    f.add(pipe);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bolt(f, 0.075, 0.09, Math.cos(a) * 0.46, 0.06, Math.sin(a) * 0.46);
      nut(f, 0.075, Math.cos(a) * 0.46, -0.09, Math.sin(a) * 0.46);
    }
  }
  for (const sx of [-0.55, 0.55]) { // casing feet + foot bolts
    mesh(volute, new THREE.BoxGeometry(0.35, 0.3, 0.5), blueDark, sx, -1.5, 0.45);
    bolt(volute, 0.08, 0.1, sx, -1.38, 0.45);
  }
  const parting = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.018, 8, 48), blueDark); // cast parting line
  parting.rotation.x = Math.PI / 2; parting.position.y = -1.05; parting.scale.y = 1; volute.add(parting);
  mapVisual(P, 'suction-discharge-base', ['suction-discharge-base', 'base-oring', 'support-foot']);

  /* ---- mechanical seal assembly (PRD §4.1, y≈0.265L) ---- */
  const seal = makePart(P, 'shaft-seal', 0, 0.55);
  mesh(seal, new THREE.CylinderGeometry(0.3, 0.3, 0.14, 32), steel, 0, -0.28);
  mesh(seal, new THREE.CylinderGeometry(0.24, 0.24, 0.1, 32), MAT_BLACK, 0, -0.18); // stationary face
  mesh(seal, new THREE.CylinderGeometry(0.22, 0.22, 0.09, 32), MAT_BRASS, 0, -0.09); // rotating face
  spring(seal, 0.16, 0.16, 0, -0.02, 0, 9);
  oring(seal, 0.24, 0.025, 0, -0.3, 0);
  oring(seal, 0.2, 0.022, 0, 0.08, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    bolt(seal, 0.06, 0.12, Math.cos(a) * 0.27, -0.34, Math.sin(a) * 0.27);
    nut(seal, 0.06, Math.cos(a) * 0.27, -0.42, Math.sin(a) * 0.27);
  }
  mapVisual(P, 'shaft-seal', ['shaft-seal', 'inboard-seal', 'seal-securing-screw']);

  /* ---- lower bearing set: housing + bearing (cage/balls spin separately) ---- */
  const brgHouse = makePart(P, 'bearing-housing', 0, 0.8);
  mesh(brgHouse, new THREE.CylinderGeometry(0.42, 0.46, 0.2, 36), steel, 0, 0.12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    bolt(brgHouse, 0.06, 0.08, Math.cos(a) * 0.38, 0.2, Math.sin(a) * 0.38);
  }
  mapVisual(P, 'bearing-housing', ['chamber-bearing', 'bearing-ring', 'cartridge-assembly']);
  const brg = makeBearing(0.62);
  brg.group.position.y = 0.12;
  brgHouse.add(brg.group);
  for (let i = 0; i < 4; i++) { // displaced loose balls beside the seated set (exploded bearing)
    mesh(brgHouse, new THREE.SphereGeometry(0.036, 16, 12), std(0xe8eaec, 1, 0.08), 0.52 + (i % 2) * 0.09, 0.05 + Math.floor(i / 2) * 0.09, 0.28);
  }
  // spin sub-groups re-registered as own parts so viewer can rotate at 0.42x
  const cagePart = makePart(P, 'bearing-cage', 0, 0.8);
  const ballPart = makePart(P, 'bearing-balls', 0, 0.8);
  cagePart.position.y = 0; ballPart.position.y = 0;
  // move cage/balls out of housing group into spin parts (same world y baked in)
  brg.cage.position.y = 0.12; brg.balls.position.y = 0.12;
  cagePart.add(brg.cage); ballPart.add(brg.balls);
  mapVisual(P, 'bearing-cage', ['chamber-bearing']);
  mapVisual(P, 'bearing-balls', ['chamber-bearing']);

  /* ---- 5 diffuser bowls (blue, quarter-cut so guide vanes show) ---- */
  const chambers = makePart(P, 'chamber', 0, 0.45);
  DIFF_Y.forEach((y, i) => {
    const bowl = mesh(chambers, new THREE.CylinderGeometry(0.52, 0.46, 0.19, 36, 1, true, 0.5, Math.PI * 1.55), i % 2 ? blue : blueDark, 0, y);
    (bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.032, 8, 40), blueDark);
    rim.rotation.x = Math.PI / 2; rim.position.y = y + 0.085; rim.castShadow = true;
    chambers.add(rim);
    for (let v = 0; v < 6; v++) { // guide vanes
      const a = (v / 6) * Math.PI * 2 + i * 0.3;
      const vane = mesh(chambers, new THREE.BoxGeometry(0.2, 0.13, 0.03), steel, Math.cos(a) * 0.32, y, Math.sin(a) * 0.32);
      vane.rotation.y = -a + 0.6;
    }
    oring(chambers, 0.44, 0.02, 0, y - 0.1, 0);
  });
  mapVisual(P, 'chamber', ['chamber', 'top-chamber', 'suction-inlet-connector', 'neck-ring',
    'seal-ring-retainer', 'stack-spacer', 'impeller-stack']);

  /* ---- wear rings + 2 brass impellers, 6 backward vanes each ---- */
  const impellers = makePart(P, 'impeller', 0, 0.55);
  [1.58, 1.88].forEach((y, k) => {
    mesh(impellers, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 36), MAT_BRASS, 0, y);
    mesh(impellers, new THREE.CylinderGeometry(0.11, 0.16, 0.14, 20), MAT_BRASS, 0, y + 0.09);
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2;
      const vane = mesh(impellers, new THREE.BoxGeometry(0.24, 0.13, 0.035), MAT_BRASS, Math.cos(a) * 0.24, y + 0.05, Math.sin(a) * 0.24);
      vane.rotation.y = -a - 0.55; // backward-curved
    }
    const wr = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 8, 36), MAT_BRASS);
    wr.rotation.x = Math.PI / 2; wr.position.y = y - 0.09; wr.castShadow = true;
    impellers.add(wr);
    void k;
  });
  mapVisual(P, 'impeller', ['impeller', 'impeller-wear-ring']);

  /* ---- stepped shaft with keyway + threaded top (spins at 1.0x) ---- */
  const pshaft = makePart(P, 'shaft', 0, 0.2);
  mesh(pshaft, new THREE.CylinderGeometry(0.1, 0.1, 3.1, 24), steel, 0, 1.15);
  mesh(pshaft, new THREE.CylinderGeometry(0.075, 0.075, 0.5, 20), steel, 0, 2.85); // top journal
  mesh(pshaft, new THREE.CylinderGeometry(0.13, 0.13, 0.3, 24), std(COL.darkSteel, 1, 0.35), 0, -0.35); // lower boss
  const key = mesh(pshaft, new THREE.BoxGeometry(0.05, 0.7, 0.045), std(COL.darkSteel, 1, 0.35), 0, 1.5, 0.1);
  key.castShadow = true;
  const thr = new THREE.Mesh(helix(0.085, 0.22, 0.028, 0.012), steel);
  thr.position.y = 3.15;
  pshaft.add(thr);
  // motor rotor + cooling fan ride on the shaft group (1.0x, inside motor)
  const rotor = mesh(pshaft, new THREE.CylinderGeometry(0.34, 0.34, 0.85, 28), std(0x8a8f94, 1, 0.45), 0, 4.15);
  rotor.castShadow = true;
  for (let i = 0; i < 9; i++) { // fan blades at motor rear (top)
    const a = (i / 9) * Math.PI * 2;
    const blade = mesh(pshaft, new THREE.BoxGeometry(0.3, 0.04, 0.12), std(COL.darkSteel, 1, 0.4), Math.cos(a) * 0.25, 4.78, Math.sin(a) * 0.25);
    blade.rotation.y = -a + 0.5;
  }
  mapVisual(P, 'shaft', ['shaft', 'shaft-pin', 'shaft-lock-nut', 'lock-washer', 'splined-spacer']);

  /* ---- shaft sleeve, springs, O-rings, retaining rings ---- */
  const sleeve = makePart(P, 'sleeve', 0, 0.9);
  const sl = mesh(sleeve, new THREE.CylinderGeometry(0.3, 0.3, 0.44, 36, 1, true), steel, 0, 2.2);
  (sl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  mesh(sleeve, new THREE.CylinderGeometry(0.34, 0.34, 0.07, 36), steel, 0, 2.44);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spring(sleeve, 0.07, 0.22, Math.cos(a) * 0.3, 2.5, Math.sin(a) * 0.3, 7);
  }
  oring(sleeve, 0.3, 0.026, 0, 2.48, 0);
  oring(sleeve, 0.27, 0.024, 0, 2.44, 0);
  oring(sleeve, 0.3, 0.026, 0, 1.92, 0);
  oring(sleeve, 0.27, 0.024, 0, 1.88, 0);
  for (const y of [2.02, 2.38]) { // circlips (flat annuli with gap)
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.016, 6, 36, Math.PI * 1.8), MAT_DARK);
    c.rotation.x = Math.PI / 2; c.position.y = y; sleeve.add(c);
  }
  mapVisual(P, 'sleeve', ['sleeve', 'sleeve-flange', 'sleeve-flange-screw', 'sleeve-flange-washer', 'sleeve-flange-nut', 'sleeve-oring']);

  /* ---- needle bearings (ribbed) beside sleeve, per hero left column ---- */
  const needle = makePart(P, 'needle-bearings', -0.55, 0.7);
  for (const y of [2.05, 2.3]) {
    mesh(needle, new THREE.CylinderGeometry(0.09, 0.09, 0.16, 20), std(COL.darkSteel, 1, 0.4), -0.55, y);
    for (let rI = 0; rI < 12; rI++) {
      const a = (rI / 12) * Math.PI * 2;
      mesh(needle, new THREE.BoxGeometry(0.018, 0.15, 0.018), steel, -0.55 + Math.cos(a) * 0.09, y, Math.sin(a) * 0.09);
    }
  }
  mapVisual(P, 'needle-bearings', ['chamber-bearing']);

  /* ---- bearing bracket / lantern with 6-bolt flange + side bracket ---- */
  const bracket = makePart(P, 'pump-head', 0, 1.35);
  mesh(bracket, new THREE.CylinderGeometry(0.48, 0.54, 0.28, 36), blue, 0, 2.78);
  mesh(bracket, new THREE.CylinderGeometry(0.2, 0.2, 0.2, 28), blueDark, 0, 2.95);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bolt(bracket, 0.07, 0.1, Math.cos(a) * 0.42, 2.86, Math.sin(a) * 0.42);
    nut(bracket, 0.07, Math.cos(a) * 0.42, 2.66, Math.sin(a) * 0.42);
  }
  mesh(bracket, new THREE.BoxGeometry(0.4, 0.08, 0.3), blue, -0.62, 2.74); // triangular side bracket
  bolt(bracket, 0.06, 0.08, -0.68, 2.76, 0); bolt(bracket, 0.06, 0.08, -0.52, 2.76, 0);
  mapVisual(P, 'pump-head', ['pump-head', 'discharge-flange', 'flange-pipe-plug', 'flange-allen-screw', 'flange-ring', 'flange-retaining-ring', 'discharge-oring']);

  const headCover = makePart(P, 'pump-head-cover', 0, 1.7);
  mesh(headCover, new THREE.CylinderGeometry(0.3, 0.34, 0.14, 32), blueDark, 0, 3.02);
  mapVisual(P, 'pump-head-cover', ['pump-head-cover', 'head-plug', 'compression-spring']);
  const disk = makePart(P, 'disk-plate', 0, 1.9);
  mesh(disk, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28), steel, 0, 3.12);
  mesh(disk, new THREE.CylinderGeometry(0.09, 0.09, 0.09, 20), MAT_BRASS, 0, 3.12);
  mapVisual(P, 'disk-plate', ['disk-plate', 'disk-bushing', 'disk-retaining-washer', 'disk-oring']);

  /* ---- flange studs (refs show 0 full-height tie rods) ---- */
  const stays = makePart(P, 'staybolt', 0, 0.35);
  for (const [sx, sz] of [[-0.78, -0.55], [0.78, -0.55], [-0.78, 0.55], [0.78, 0.55]]) {
    mesh(stays, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), steel, sx, 2.68, sz);
    mesh(stays, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), steel, sx, -0.6, sz);
    nut(stays, 0.07, sx, 2.86, sz); nut(stays, 0.07, sx, -0.42, sz);
    washer(stays, 0.07, sx, 2.78, sz); washer(stays, 0.07, sx, -0.5, sz);
  }
  mapVisual(P, 'staybolt', ['staybolt', 'staybolt-nut', 'staybolt-washer']);

  /* ---- motor stool (lantern legs) ---- */
  const stool = makePart(P, 'motor-stool', 0, 1.65);
  for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    mesh(stool, new THREE.BoxGeometry(0.12, 0.55, 0.12), blue, sx, 3.3, sz);
    bolt(stool, 0.06, 0.07, sx, 3.56, sz);
  }
  mesh(stool, new THREE.BoxGeometry(1.25, 0.1, 1.25), blue, 0, 3.6);
  mapVisual(P, 'motor-stool', ['motor-stool', 'motor-bolt']);

  /* ---- coupling hubs + spider + perforated guard ---- */
  const coupling = makePart(P, 'coupling-half', 0, 1.15);
  mesh(coupling, new THREE.CylinderGeometry(0.26, 0.26, 0.2, 28), std(COL.darkSteel, 1, 0.4), 0, 3.32);
  mesh(coupling, new THREE.CylinderGeometry(0.26, 0.26, 0.2, 28), std(COL.darkSteel, 1, 0.4), 0, 3.62);
  for (let i = 0; i < 6; i++) { // elastomer spider lobes
    const a = (i / 6) * Math.PI * 2;
    mesh(coupling, new THREE.BoxGeometry(0.09, 0.1, 0.09), MAT_BLACK, Math.cos(a) * 0.17, 3.47, Math.sin(a) * 0.17);
  }
  bolt(coupling, 0.05, 0.06, 0.26, 3.3, 0); bolt(coupling, 0.05, 0.06, -0.26, 3.6, 0);
  mapVisual(P, 'coupling-half', ['coupling-half', 'coupling-bolt']);
  const guard = makePart(P, 'coupling-guard', 0, 1.85);
  const perfTex = makePerfTexture();
  const guardMat = new THREE.MeshStandardMaterial({ color: COL.darkSteel, metalness: 0.9, roughness: 0.45, alphaMap: perfTex, alphaTest: 0.45, side: THREE.DoubleSide });
  mesh(guard, new THREE.CylinderGeometry(0.4, 0.4, 0.68, 36, 1, true), guardMat, 0, 3.47);
  mesh(guard, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 36), std(COL.darkSteel, 1, 0.4), 0, 3.83);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    bolt(guard, 0.045, 0.06, Math.cos(a) * 0.4, 3.79, Math.sin(a) * 0.4);
  }
  mapVisual(P, 'coupling-guard', ['coupling-guard', 'coupling-guard-screw']);

  /* ---- motor: finned housing (>=24 fins), endshields, terminal box, cowl ---- */
  const motor = makePart(P, 'motor', 0, 2.15);
  mesh(motor, new THREE.CylinderGeometry(0.62, 0.62, 1.05, 36), motorBlue, 0, 4.2);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const fin = mesh(motor, new THREE.BoxGeometry(0.09, 0.98, 0.06), motorBlue, Math.cos(a) * 0.65, 4.2, Math.sin(a) * 0.65);
    fin.rotation.y = -a;
  }
  mesh(motor, new THREE.CylinderGeometry(0.64, 0.64, 0.16, 36), blueDark, 0, 3.62); // front endshield
  mesh(motor, new THREE.CylinderGeometry(0.64, 0.64, 0.16, 36), blueDark, 0, 4.78); // rear endshield
  for (let i = 0; i < 8; i++) { // endshield bolts M8 + washers
    const a = (i / 8) * Math.PI * 2;
    bolt(motor, 0.065, 0.08, Math.cos(a) * 0.56, 4.82, Math.sin(a) * 0.56);
  }
  const cowl = mesh(motor, new THREE.CylinderGeometry(0.6, 0.62, 0.14, 36), motorBlue, 0, 4.95);
  cowl.castShadow = true;
  for (let rI = 0; rI < 3; rI++) for (let i = 0; i < 14; i++) { // vent slots (dark insets)
    const a = (i / 14) * Math.PI * 2 + rI * 0.2;
    mesh(motor, new THREE.BoxGeometry(0.09, 0.02, 0.035), MAT_BLACK, Math.cos(a) * (0.2 + rI * 0.15), 5.03, Math.sin(a) * (0.2 + rI * 0.15));
  }
  mesh(motor, new THREE.BoxGeometry(0.38, 0.28, 0.44), blueDark, 0, 5.18, 0); // terminal box on top
  mesh(motor, new THREE.BoxGeometry(0.42, 0.05, 0.48), blueDark, 0, 5.34, 0); // terminal lid
  for (const [sx, sz] of [[-0.15, -0.19], [0.15, -0.19], [-0.15, 0.19], [0.15, 0.19]]) bolt(motor, 0.045, 0.05, sx, 5.34, sz);
  const gland = mesh(motor, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), MAT_BRASS, 0.24, 5.1, 0);
  gland.rotation.z = Math.PI / 2;
  mesh(motor, new THREE.TorusGeometry(0.09, 0.02, 8, 20), blueDark, 0, 4.86); // lifting eye base
  mapVisual(P, 'motor', ['motor']);

  /* ---- loose hardware: >=18 beside stack + base cluster (hero columns) ---- */
  const loose = makePart(P, 'loose-hardware', 0.15, 0.4);
  const looseDefs: [number, number, number, number][] = [
    // [d, len, x, z] left column
    [0.07, 0.22, -1.15, 0.2], [0.06, 0.18, -1.25, -0.15], [0.08, 0.26, -1.05, 0.45],
    [0.06, 0.16, -1.3, 0.1], [0.07, 0.2, -1.1, -0.4],
    [0.07, 0.22, 1.15, -0.2], [0.06, 0.18, 1.25, 0.15], [0.08, 0.24, 1.05, -0.45],
    [0.06, 0.16, 1.3, -0.1], [0.07, 0.2, 1.1, 0.4],
  ];
  const looseY = [-1.0, 0.45, 1.05, 1.95, 2.75, -1.0, 0.6, 1.2, 2.0, 2.8]; // register to volute/diffuser/bracket/coupling heights
  looseDefs.forEach(([d, len, x, z], i) => {
    looseBolt(loose, d, len, x, looseY[i] ?? 0, z, i % 2 ? 0.15 : -0.1, i % 3 ? 0.2 : -0.25);
  });
  for (let i = 0; i < 6; i++) nut(loose, 0.07, -1.2 + (i % 3) * 0.18, (i < 3 ? -1.05 : 2.72), 0.55);
  for (let i = 0; i < 6; i++) washer(loose, 0.07, 1.2 - (i % 3) * 0.18, (i < 3 ? -1.05 : 2.72), -0.55);
  for (let i = 0; i < 4; i++) bolt(loose, 0.08, 0.14, -0.7 + i * 0.45, -1.55, 0.9); // base cluster
  mapVisual(P, 'loose-hardware', ['staybolt-nut']);
}
function makePerfTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#000';
  for (let row = 0; row < 14; row++) for (let col = 0; col < 34; col++) {
    ctx.beginPath();
    ctx.arc(col * 15 + (row % 2 ? 7 : 0), row * 18 + 9, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
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
    } else roots.push(c);
  }
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
        case 'rod': mesh(g, new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.9 * s, 14), mat); break;
        case 'ball': mesh(g, new THREE.SphereGeometry(0.3 * s, 20, 14), mat); break;
        case 'plate': mesh(g, new THREE.CylinderGeometry(0.5 * s, 0.55 * s, 0.22 * s, 24), mat); break;
        default: mesh(g, new THREE.BoxGeometry(0.5 * s, 0.5 * s, 0.5 * s), mat);
      }
      g.position.x = x;
      g.position.z = z;
      g.position.y = y;
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
    orbit?: boolean;
    chrome?: boolean;
    height?: number;
    explode?: number;
  },
): AssemblyHandle {
  const W = () => el.clientWidth || 300;
  const H = opts.height ?? 380;
  const vertical = opts.machine !== 'rig';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W(), H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0efef);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(24, W() / H, 0.1, 100);
  if (vertical) camera.position.set(3.6, 4.6, 15.5);
  else camera.position.set(5.4, 3.4, 6.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, vertical ? 1.9 : 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 1.2;
  controls.maxDistance = 24;
  controls.autoRotate = opts.orbit === true && !reduceMotion;
  controls.autoRotateSpeed = 0.8;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa39a, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-5, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 8; key.shadow.camera.bottom = -4;
  key.shadow.radius = 8;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(6, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(0, 8, -7);
  scene.add(rim);

  const FLOOR = -1.78;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.13 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = FLOOR;
  ground.receiveShadow = true;
  scene.add(ground);

  const P: Parts = { parts: new Map(), visualOf: new Map(), scene };
  if (opts.machine === 'rig') buildRig(P);
  else if (opts.machine === 'cr-pump') buildPump(P);
  else buildGeneric(P, opts.components);

  for (const c of opts.components) if (!P.visualOf.has(c.id)) P.visualOf.set(c.id, c.id);
  const resolve = (id: string): string | null => {
    const v = P.visualOf.get(id) ?? id;
    return P.parts.has(v) ? v : null;
  };
  const regOf = new Map<string, string>();
  for (const [reg, vis] of P.visualOf) if (!regOf.has(vis)) regOf.set(vis, reg);

  const grid = new THREE.GridHelper(24, 24, 0x9aa39a, 0xd8dcd8);
  grid.position.y = FLOOR + 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  grid.visible = false;
  scene.add(grid);

  const pos = new Map<string, THREE.Vector3>();
  const homeOf = new Map<string, THREE.Vector3>();
  const sheetOf = new Map<string, THREE.Vector3>();
  const centerOf = new Map<string, THREE.Vector3>();
  const idList = [...P.parts.keys()];
  const cols = Math.max(1, Math.ceil(Math.sqrt(idList.length)));
  const cell = vertical ? 1.7 : 2.6;
  idList.forEach((id, i) => {
    const g = P.parts.get(id)!;
    homeOf.set(id, g.position.clone());
    const box = new THREE.Box3().setFromObject(g);
    centerOf.set(id, box.getCenter(new THREE.Vector3()).sub(g.position));
    const col = i % cols;
    const row = Math.floor(i / cols);
    sheetOf.set(id, new THREE.Vector3(
      (col - (cols - 1) / 2) * cell, FLOOR + 0.03 - box.min.y, (row - Math.ceil(idList.length / cols) / 2 + 0.5) * cell,
    ));
    pos.set(id, g.position.clone());
  });

  /* Speed groups (PRD §5): shaft/impellers/coupling/rotor/fan 1.0x,
     bearing cage+balls 0.42x, outer rings stationary. */
  const SPIN: Record<string, { ax: 'x' | 'y'; rate: number }> = opts.machine === 'rig'
    ? { shaft: { ax: 'x', rate: 1 }, ring_inner: { ax: 'x', rate: 1 }, rollers: { ax: 'x', rate: 0.42 }, cage: { ax: 'x', rate: 0.42 } }
    : { shaft: { ax: 'y', rate: 1 }, impeller: { ax: 'y', rate: 1 }, 'coupling-half': { ax: 'y', rate: 1 }, 'bearing-cage': { ax: 'y', rate: 0.42 }, 'bearing-balls': { ax: 'y', rate: 0.42 } };

  /* ---- fluid particles: volute -> impellers -> 5 diffusers -> discharge ---- */
  const isPump = opts.machine === 'cr-pump';
  const NP = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3);
  const pState: { p: number; a: number; r: number; s: number }[] = [];
  for (let i = 0; i < NP; i++) pState.push({ p: Math.random(), a: Math.random() * Math.PI * 2, r: 0.06 + Math.random() * 0.16, s: 0.7 + Math.random() * 0.6 });
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x1f7a8c, size: 0.055, transparent: true, opacity: 0.85 }));
  particles.visible = false;
  if (isPump) scene.add(particles);
  const NL = 36;
  const lGeo = new THREE.BufferGeometry();
  const lPos = new Float32Array(NL * 3);
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
  const leak = new THREE.Points(lGeo, new THREE.PointsMaterial({ color: 0xd97706, size: 0.05, transparent: true, opacity: 0.9 }));
  leak.visible = false;
  if (isPump) scene.add(leak);
  const NA = 30;
  const aGeo = new THREE.BufferGeometry();
  const aPos = new Float32Array(NA * 3);
  aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  const airflow = new THREE.Points(aGeo, new THREE.PointsMaterial({ color: 0x9db8c8, size: 0.04, transparent: true, opacity: 0.6 }));
  airflow.visible = false;
  if (isPump) scene.add(airflow);

  let layout: 'assembled' | 'sheet' = 'assembled';
  const anims = new Map<string, { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }>();
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let explodeF = opts.explode ?? 0;
  const targetOf = (id: string): THREE.Vector3 => (layout === 'sheet' ? sheetOf.get(id)! : (() => {
    const g = P.parts.get(id)!;
    const h = homeOf.get(id)!;
    return new THREE.Vector3(
      h.x + (g.userData.explodeX as number ?? 0) * explodeF,
      h.y + (g.userData.explodeY as number ?? 0) * explodeF,
      h.z,
    );
  })());
  function tweenTo(id: string, to: THREE.Vector3, dur: number): void {
    anims.set(id, { from: pos.get(id)!.clone(), to: to.clone(), t0: performance.now(), dur: reduceMotion ? 1 : dur });
  }
  function frameCamera(): void {
    if (layout === 'sheet') {
      const span = Math.max(cols, Math.ceil(idList.length / cols)) * cell;
      controls.target.set(0, FLOOR + 0.8, 0);
      camera.position.set(span * 0.62, span * 0.55, span * 0.85);
    } else if (vertical) {
      controls.target.set(0, 1.9, 0);
      camera.position.set(3.6, 4.6, 15.5);
    } else {
      controls.target.set(0, 0, 0);
      camera.position.set(5.4, 3.4, 6.2);
    }
  }
  let assembleEpoch = 0;
  // blueprint loose-hardware cluster belongs to exploded/sheet views only
  function syncLoose(): void {
    const loose = P.parts.get('loose-hardware');
    if (loose) loose.visible = layout === 'sheet' || explodeF > 0.02;
  }
  function setLayout(l: 'assembled' | 'sheet', instant = false): void {
    assembleEpoch++;
    layout = l;
    grid.visible = l === 'sheet';
    syncLoose();
    for (const id of idList) {
      if (instant) { anims.delete(id); pos.set(id, targetOf(id)); }
      else tweenTo(id, targetOf(id), 550);
    }
    frameCamera();
  }
  syncLoose();

  let running = false;
  let spinSpeed = 1;
  let angle = 0;
  let faultVisuals: string[] = [];
  let faultWobble = 0;
  const dotGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xb45309, depthTest: false, transparent: true });
  const dots: { m: THREE.Mesh; id: string; r: number; ph: number }[] = [];
  function setFault(regIds: string[], wobble: number): void {
    for (const d of dots) scene.remove(d.m);
    dots.length = 0;
    faultVisuals = [...new Set(regIds.map((r) => resolve(r)).filter((v): v is string => v !== null))];
    faultWobble = wobble;
    for (const id of faultVisuals) {
      const box = new THREE.Box3().setFromObject(P.parts.get(id)!);
      const s = box.getSize(new THREE.Vector3());
      const r = Math.max(s.x, s.y, s.z) / 2 + 0.22;
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(dotGeo, dotMat);
        m.renderOrder = 999;
        scene.add(m);
        dots.push({ m, id, r, ph: (k / 3) * Math.PI * 2 });
      }
    }
  }
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  async function assembleSteps(visualSteps: string[][], onStep?: (k: number, n: number) => void): Promise<void> {
    running = false;
    setLayout('sheet', true);
    const ep = assembleEpoch;
    const placed = new Set<string>();
    for (let i = 0; i < visualSteps.length; i++) {
      if (ep !== assembleEpoch) return;
      for (const id of visualSteps[i]) {
        const v = resolve(id);
        if (v && !placed.has(v)) { placed.add(v); tweenTo(v, homeOf.get(v)!, 650); }
      }
      onStep?.(i, visualSteps.length);
      await wait(reduceMotion ? 80 : 720);
    }
    if (ep !== assembleEpoch) return;
    for (const id of idList) if (!placed.has(id)) tweenTo(id, homeOf.get(id)!, 650);
    layout = 'assembled';
    grid.visible = false;
    frameCamera();
    syncLoose();
    onStep?.(visualSteps.length, visualSteps.length);
  }

  let selected: string | null = null;
  let suspect: string | null = null;
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
        if (id === suspect) { m.emissive.copy(SUSPECT); m.emissiveIntensity = pulse; }
        else if (id === selected) { m.emissive.copy(SELECTED); m.emissiveIntensity = 0.35; }
        else m.emissiveIntensity = 0;
      }
    }
  }

  const showChrome = opts.chrome !== false;
  const bar = document.createElement('div');
  bar.className = 'explode-row';
  if (!showChrome) bar.hidden = true;
  const lab = document.createElement('label');
  lab.textContent = 'Explode';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(explodeF * 100));
  slider.setAttribute('aria-label', 'Explode assembly');
  lab.appendChild(slider);
  bar.appendChild(lab);
  el.appendChild(bar);
  if (showChrome) {
    const caption = document.createElement('p');
    caption.className = 'muted';
    caption.textContent = 'Blueprint model — every nut, bolt, washer and bearing ball modelled. Drag to orbit, scroll to zoom.';
    el.appendChild(caption);
  }
  const tag = document.createElement('div');
  tag.className = 'part-tag';
  tag.hidden = true;
  el.appendChild(tag);
  function applyExplode(): void {
    if (layout !== 'assembled') return;
    for (const id of idList) { anims.delete(id); pos.set(id, targetOf(id)); }
    syncLoose();
  }
  slider.addEventListener('input', () => {
    explodeF = Number(slider.value) / 100;
    applyExplode();
  });
  applyExplode();

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([...P.parts.values()], true);
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.componentId) o = o.parent;
      if (o) { selected = o.userData.componentId as string; repaint(0); opts.onSelect(regOf.get(selected) ?? selected); }
    }
  });

  const proj = new THREE.Vector3();
  function updateTag(): void {
    const id = suspect ?? selected;
    const g = id ? P.parts.get(id) : undefined;
    if (!g || !id) { tag.hidden = true; return; }
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

  let paused = false;
  let prevNow = 0;
  renderer.setAnimationLoop((now: number) => {
    if (paused) return;
    controls.update();
    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0;
    prevNow = now;
    for (const [id, a] of [...anims]) {
      const t = Math.min(1, (now - a.t0) / a.dur);
      pos.get(id)!.lerpVectors(a.from, a.to, ease(t));
      if (t >= 1) anims.delete(id);
    }
    if (running) angle += spinSpeed * dt * 4.19; // 240 deg/s readable speed
    const wob = Math.sin(now / 55) * 0.05 * faultWobble;
    const cageRate = faultVisuals.some((v) => v.includes('bearing')) && faultWobble > 0 ? 0.35 : 0.42;
    for (const id of idList) {
      const p = pos.get(id)!;
      const g = P.parts.get(id)!;
      const isFault = faultWobble > 0 && faultVisuals.includes(id);
      const wobbleAmp = isFault ? 0.08 : 0; // 8% radial wobble on faulted bearing
      g.position.set(p.x + (isFault && vertical ? Math.sin(now / 55) * wobbleAmp + wob * 0 : isFault && !vertical ? 0 : isFault ? wob : 0), p.y, p.z + (isFault && !vertical ? wob : 0));
      const sp = SPIN[id];
      if (sp && running) {
        const rate = (id === 'bearing-cage' || id === 'bearing-balls' || id === 'rollers' || id === 'cage') ? cageRate : sp.rate;
        if (sp.ax === 'x') g.rotation.x = angle * rate;
        else g.rotation.y = angle * rate;
      }
    }
    /* particles + faults */
    if (isPump) {
      particles.visible = running;
      airflow.visible = running;
      const blocked = faultVisuals.includes('chamber');
      const leaking = faultVisuals.includes('shaft-seal');
      leak.visible = running && leaking;
      if (running) {
        for (let i = 0; i < NP; i++) {
          const st = pState[i];
          st.p += dt * 0.14 * st.s * spinSpeed;
          if (blocked && st.p > 0.52 && st.p < 0.62) st.p = 0.52 + (st.p - 0.52) * 0.2; // stall/recirculate in diffuser 3
          if (st.p > 1) { st.p = 0; st.a = Math.random() * Math.PI * 2; }
          const y = -0.95 + st.p * 3.1;
          const swirl = st.a + st.p * 9;
          const rad = st.r + (st.p > 0.3 && st.p < 0.75 ? 0.14 : 0);
          let x = Math.cos(swirl) * rad;
          let z = Math.sin(swirl) * rad;
          if (st.p > 0.97) { x += (st.p - 0.97) * 22; } // exit discharge flange
          pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
        }
        pGeo.attributes.position.needsUpdate = true;
        for (let i = 0; i < NL; i++) {
          const t = (now / 900 + i / NL) % 1;
          lPos[i * 3] = 0.25 + t * 0.7;
          lPos[i * 3 + 1] = -0.25 - t * 0.35;
          lPos[i * 3 + 2] = Math.sin(i * 2.3) * 0.12;
        }
        lGeo.attributes.position.needsUpdate = true;
        for (let i = 0; i < NA; i++) {
          const t = (now / 1400 + i / NA) % 1;
          const a = (i % 12) / 12 * Math.PI * 2;
          aPos[i * 3] = Math.cos(a) * (0.68 - t * 0.1);
          aPos[i * 3 + 1] = 4.95 - t * 0.85;
          aPos[i * 3 + 2] = Math.sin(a) * (0.68 - t * 0.1);
        }
        aGeo.attributes.position.needsUpdate = true;
      }
    }
    for (const d of dots) {
      const baseP = pos.get(d.id)!.clone().add(centerOf.get(d.id)!);
      const a = now / 700 + d.ph;
      const pulse = reduceMotion ? 1 : 1 + 0.28 * Math.sin(now / 160 + d.ph);
      if (vertical) d.m.position.set(baseP.x + Math.cos(a) * d.r, baseP.y, baseP.z + Math.sin(a) * d.r);
      else d.m.position.set(baseP.x, baseP.y + Math.cos(a) * d.r, baseP.z + Math.sin(a) * d.r);
      d.m.scale.setScalar(pulse);
    }
    repaint(now);
    updateTag();
    renderer.render(scene, camera);
  });

  return {
    select(id: string): void { selected = resolve(id); repaint(0); },
    setSuspect(id: string | null): void { suspect = id ? resolve(id) : null; repaint(0); },
    setExplode(f: number): void {
      explodeF = Math.min(1, Math.max(0, f));
      slider.value = String(Math.round(explodeF * 100));
      applyExplode();
    },
    setLayout(l: 'assembled' | 'sheet', instant?: boolean): void { setLayout(l, instant); },
    assemble(visualSteps: string[][], onStep?: (k: number, n: number) => void): Promise<void> { return assembleSteps(visualSteps, onStep); },
    setRun(r: boolean): void { running = r; },
    setSpinSpeed(f: number): void { spinSpeed = f; },
    setFault(regIds: string[], wobble: number): void { setFault(regIds, wobble); },
    setCameraHome(): void { frameCamera(); },
    setPaused(p: boolean): void { paused = p; },
    dispose(): void {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.innerHTML = '';
    },
  };
}
