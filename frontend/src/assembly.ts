/* Procedural motor-and-bearing assembly. Illustrative: proportions approximate. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface AssemblyHandle {
  select(id: string): void;
  setSuspect(id: string | null): void;
  setExplode(f: number): void;
}

export const COMPONENTS = [
  'motor',
  'shaft',
  'housing',
  'ring_inner',
  'ring_outer',
  'rollers',
  'cage',
];

const SUSPECT = new THREE.Color(0xb45309);
const SELECTED = new THREE.Color(0x0e6b5e);

function std(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
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

export function initAssembly(
  el: HTMLElement,
  opts: { onSelect: (id: string) => void },
): AssemblyHandle {
  const W = () => el.clientWidth || 300;
  const H = 340;

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
  camera.position.set(5.4, 3.4, 6.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.2, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 18;

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
  ground.position.y = -1.62;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- parts (each group: userData.componentId, baseX, explodeX) ----
  const parts = new Map<string, THREE.Group>();
  function part(id: string, explodeX: number): THREE.Group {
    const g = new THREE.Group();
    g.userData.componentId = id;
    g.userData.explodeX = explodeX;
    g.traverse((o: THREE.Object3D) => {
      o.castShadow = true;
    });
    parts.set(id, g);
    scene.add(g);
    return g;
  }
  function mesh(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }

  // shaft (stays put on explode)
  const shaft = part('shaft', 0);
  mesh(shaft, xCyl(0.3, 7.6), std(0xc9ced4, 1.0, 0.3));
  mesh(shaft, xCyl(0.36, 0.5), std(0xaab0b6, 1.0, 0.3), -1.2);

  // motor (left)
  const motor = part('motor', -2.4);
  const paint = std(0x3a6b5f, 0.35, 0.5);
  mesh(motor, new THREE.BoxGeometry(2.3, 1.9, 1.9), paint, -2.7, 0.1);
  mesh(motor, xCyl(0.75, 0.35), std(0x2c5249, 0.4, 0.5), -1.45, 0.1);
  mesh(motor, new THREE.BoxGeometry(0.5, 0.5, 2.2), paint, -2.7, -1.15);
  for (let i = 0; i < 5; i++) {
    mesh(motor, new THREE.BoxGeometry(2.0, 0.08, 2.0), std(0x2c5249, 0.4, 0.55), -2.7, 0.5 + i * 0.18);
  }

  // housing (open frame so the bearing stays visible)
  const housing = part('housing', 3.2);
  const cast = std(0x878d93, 0.6, 0.5);
  mesh(housing, new THREE.BoxGeometry(2.6, 0.45, 2.6), cast, 1.4, -1.4);
  const flange = mesh(housing, xCyl(1.55, 0.32), cast, 2.5);
  flange.material = cast;
  mesh(housing, new THREE.BoxGeometry(0.35, 1.4, 2.6), cast, 2.5, -0.6);

  // bearing, centered x = 1.4
  const BX = 1.4;
  const outer = part('ring_outer', 2.4);
  const shellO = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 1.0, roughness: 0.25, side: THREE.DoubleSide });
  mesh(outer, xCyl(1.05, 0.7, 64, true), shellO, BX);
  outer.add(xRing(0.86, 1.05, BX - 0.35));
  outer.add(xRing(0.86, 1.05, BX + 0.35));

  const inner = part('ring_inner', 0.6);
  const shellI = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 1.0, roughness: 0.22, side: THREE.DoubleSide });
  mesh(inner, xCyl(0.62, 0.7, 64, true), shellI, BX);
  inner.add(xRing(0.42, 0.62, BX - 0.35));
  inner.add(xRing(0.42, 0.62, BX + 0.35));

  const rollers = part('rollers', 1.5);
  const ballMat = std(0x9aa0a6, 1.0, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mesh(rollers, new THREE.SphereGeometry(0.21, 24, 18), ballMat, BX, Math.cos(a) * 0.835, Math.sin(a) * 0.835);
  }

  const cage = part('cage', 0.95);
  const brass = std(0xb08d3e, 1.0, 0.35);
  for (const dx of [-0.28, 0.28]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.835, 0.05, 12, 64), brass);
    t.rotation.y = Math.PI / 2;
    t.position.x = BX + dx;
    t.castShadow = true;
    cage.add(t);
  }

  // ---- selection / suspect highlight ----
  let selected: string | null = null;
  let suspect: string | null = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function materialsOf(id: string): THREE.MeshStandardMaterial[] {
    const out: THREE.MeshStandardMaterial[] = [];
    parts.get(id)?.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) out.push(m);
    });
    return out;
  }

  function repaint(now: number): void {
    const pulse = reduceMotion ? 0.55 : 0.45 + 0.25 * Math.sin(now / 350);
    for (const id of parts.keys()) {
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

  // ---- explode slider + caption + part label ----
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
    for (const g of parts.values()) {
      g.position.x = (g.userData.explodeX as number) * explodeF;
    }
  }
  slider.addEventListener('input', () => {
    explodeF = Number(slider.value) / 100;
    applyExplode();
  });

  // ---- picking ----
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
    const hits = ray.intersectObjects([...parts.values()], true);
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.componentId) o = o.parent;
      if (o) {
        selected = o.userData.componentId as string;
        repaint(0);
        opts.onSelect(selected);
      }
    }
  });

  const proj = new THREE.Vector3();
  function updateTag(): void {
    const id = suspect ?? selected;
    const g = id ? parts.get(id) : undefined;
    if (!g) {
      tag.hidden = true;
      return;
    }
    proj.setFromMatrixPosition(g.matrixWorld);
    proj.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    tag.style.left = `${((proj.x + 1) / 2) * rect.width + rect.left - el.getBoundingClientRect().left}px`;
    tag.style.top = `${((-proj.y + 1) / 2) * rect.height}px`;
    tag.textContent = id === suspect ? `${id} — suspected` : id;
    tag.hidden = false;
  }

  new ResizeObserver(() => {
    camera.aspect = W() / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H);
  }).observe(el);

  renderer.setAnimationLoop((now: number) => {
    controls.update();
    repaint(now);
    updateTag();
    renderer.render(scene, camera);
  });

  return {
    select(id: string): void {
      selected = COMPONENTS.includes(id) ? id : null;
      repaint(0);
    },
    setSuspect(id: string | null): void {
      suspect = id && COMPONENTS.includes(id) ? id : null;
      repaint(0);
    },
    setExplode(f: number): void {
      explodeF = Math.min(1, Math.max(0, f));
      slider.value = String(Math.round(explodeF * 100));
      applyExplode();
    },
  };
}
