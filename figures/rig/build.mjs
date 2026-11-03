import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import { sphereOf } from "../../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { GEO6203, faultFreq, SLOW, RPM_MIN, RPM_MAX, START_RPM } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 380;

// Stack axis. Bearing dims are 2 units per mm (true proportions);
// ring shoulders, cage body and all furniture are illustrative.
const CX = 10;
const OUTER_R = 40; // 6203 designation OD 40 (standard)
const OUTER_GROOVE_R = 33.1; // verified outer raceway dia 33.1
const PITCH_R = 28.55; // verified pitch dia 28.55
const BALL_R = 6.75; // verified ball dia 6.75
const INNER_GROOVE_R = 24.0; // verified inner raceway dia 24.0
const BORE_R = 17; // 6203 designation bore 17 (standard)
const INNER_OD_R = 27.5; // illustrative shoulder
const MOUTH_R = 18.5; // illustrative counterbore mouth
const RING_H = 24; // 6203 designation width 12 (standard)

const PLATE = { x: -130, y: -65, w: 260, d: 130, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const MOTOR_R = 42;
const MOTOR_TOP = 38;
const CAP_TOP = 44;
const COLLAR_TOP = 50;
const INNER_Z = 60;
const INNER_TOP = INNER_Z + RING_H;
const CAGE_Z = 92;
const CAGE_H = 8;
const CAGE_TOP = CAGE_Z + CAGE_H;
const BALL_Z = 96;
const SHAFT_TOP = 150;
const OUTER_Z = 116;
const OUTER_TOP = OUTER_Z + RING_H;

const RODS = [
  [-110, -52],
  [110, -52],
  [-110, 52],
  [110, 52],
];
const ROD_R = 4;
const ROD_TOP = 150;

const KNOB = [-75, 33];
const KNOB_R = 7;
const KNOB_Z = 10;
const KNOB_TOP = 18;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [CX, 0, 168], [KNOB[0], KNOB[1], KNOB_TOP + 2],
    ...RODS.flatMap(([x, y]) => [[x, y, ROD_TOP + 9]])],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 42 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -110, y: 52, w: 220, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  const label = { x: -125, y: -57, w: 44, d: 16, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 1, P, 3), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 6, label.y + 6], 1, P, "x"), "6203", { size: 3.4, tone: "mid", anchor: "start" }));
  out.push(L(k.lineOnTop([label.x + 1, label.y + 12], [label.x + 43, label.y + 12], 1, P), { tone: "faint" }));
  return out.join("");
}

function rod([x, y]) {
  const out = [];
  out.push(L(k.ring(x, y, ROD_R + 0.6, 0, P, 20), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, ROD_R, 0, ROD_TOP, P, 20), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 7, ROD_TOP, 2, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 6.5, ROD_TOP + 2, 7, P, 6), { tone: "hi" }));
  out.push(D([at([x, y, ROD_TOP + 9])], { size: 0.45, tone: "lo" }));
  return out.join("");
}

function motor() {
  const out = [];
  for (const fx of [CX - 56, CX + 42]) {
    out.push(S(k.slabOf({ x: fx, y: -14, w: 14, d: 28, r: 1.5 }, 0, 6, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([fx + 7, -8, 6]), at([fx + 7, 8, 6])], { size: 0.45 }));
  }
  out.push(S(k.cylinder(CX, 0, MOTOR_R, 0, MOTOR_TOP, P, 64), { tone: "mid" }));
  out.push(L([8, 16, 24, 32].map((z) => k.sideArc(CX, 0, MOTOR_R, z, P, 40)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(CX, 0, MOTOR_R, MOTOR_TOP, CAP_TOP - MOTOR_TOP, P, 64, 0.8), { tone: "mid" }));
  const bolts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2;
    return at([CX + Math.cos(a) * 32, Math.sin(a) * 32, CAP_TOP]);
  });
  out.push(D(bolts, { size: 0.45 }));
  const box = { x: CX - 15, y: 38, w: 30, d: 16, r: 1.5 };
  out.push(S(k.slabOf(box, 6, 14, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(box, 2), 20, 3, P, 4, 0.4), { tone: "mid" }));
  const lid = k.corners(k.insetPlan(box, 2), 2);
  out.push(D(lid.map(([x, y]) => at([x, y, 23])), { size: 0.4 }));
  out.push(S(k.cylinder(CX, 46, 3, 23, 4, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(CX, 0, 21, CAP_TOP, COLLAR_TOP - CAP_TOP, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(CX, 0, MOUTH_R, COLLAR_TOP, 0.4, P, 40), { tone: "lo", crease: "none" }));
  out.push(L(k.ring(CX, 0, MOUTH_R, COLLAR_TOP + 0.4, P, 40), { tone: "lo" }));
  return out.join("");
}

const shaftSeg = (z0, z1) => S(k.cylinder(CX, 0, BORE_R, z0, z1 - z0, P, 40), { tone: "hi" });

function innerRing() {
  const out = [];
  out.push(S(k.cylinder(CX, 0, INNER_OD_R, INNER_Z, RING_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(CX, 0, INNER_GROOVE_R, INNER_TOP, P, 64), { tone: "lo" }));
  out.push(S(k.cylinder(CX, 0, MOUTH_R, INNER_TOP, 0.4, P, 40), { tone: "lo", crease: "none" }));
  out.push(L(k.ring(CX, 0, MOUTH_R, INNER_TOP + 0.4, P, 40), { tone: "lo" }));
  return out.join("");
}

function cage() {
  const out = [];
  out.push(S(k.cylinder(CX, 0, 35, CAGE_Z, CAGE_H, P, 64, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(CX, 0, MOUTH_R, CAGE_TOP, 0.4, P, 40), { tone: "lo", crease: "none" }));
  out.push(L(k.ring(CX, 0, MOUTH_R, CAGE_TOP + 0.4, P, 40), { tone: "lo" }));
  return out.join("");
}

const ballAt = (angle) => [CX + Math.cos(angle) * PITCH_R, Math.sin(angle) * PITCH_R, BALL_Z];

function balls() {
  const parts = [];
  for (let i = 0; i < GEO6203.n; i++) {
    const g = S(sphereOf(ballAt((i / GEO6203.n) * Math.PI * 2), BALL_R, P), i === 0 ? { tone: "hi", lit: true } : { tone: "hi" });
    parts.push(`<g data-ball="${i}" transform="${k.translateAlong(P, [0, 0, 0])}">${g}</g>`);
  }
  return `<g data-balls="1">${parts.join("")}</g>`;
}

function outerRing() {
  const out = [];
  out.push(S(k.cylinder(CX, 0, OUTER_R, OUTER_Z, RING_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(CX, 0, OUTER_GROOVE_R, OUTER_TOP, P, 64), { tone: "lo" }));
  out.push(S(k.cylinder(CX, 0, OUTER_GROOVE_R + 0.4, OUTER_TOP, 0.4, P, 64), { tone: "lo", crease: "none" }));
  return out.join("");
}

function knob() {
  const out = [];
  const [kx, ky] = KNOB;
  out.push(S(k.slabOf({ x: kx - 14, y: ky - 12, w: 28, d: 24, r: 2 }, 0, KNOB_Z, P, 4, 0.6), { tone: "mid" }));
  const ticks = k.radialTicks(kx, ky, 8.5, 12, 3, KNOB_Z, [1.2, 2.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(kx, ky, KNOB_R, KNOB_Z, KNOB_TOP - KNOB_Z, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(kx, ky, KNOB_R, KNOB_Z, KNOB_TOP, 24, P), { tone: "lo" }));
  return out.join("");
}

// Marks rebuilt every frame (node copy; the live script mirrors this math).
const shaftMarkD = (a) =>
  k.lineOnTop([CX - Math.cos(a) * BORE_R, -Math.sin(a) * BORE_R], [CX + Math.cos(a) * 14, Math.sin(a) * 14], SHAFT_TOP + 0.2, P);
const knobAngle = (rpm) => ((-210 + (240 * rpm) / RPM_MAX) * Math.PI) / 180;
const knobD = (rpm) => {
  const a = knobAngle(rpm);
  const [kx, ky] = KNOB;
  return k.lineOnTop([kx - Math.cos(a) * KNOB_R, ky - Math.sin(a) * KNOB_R], [kx + Math.cos(a) * 9, ky + Math.sin(a) * 9], KNOB_TOP + 0.2, P);
};

const rodsSorted = byDepth(RODS);
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Exploded 6203 bearing rig: a motor, shaft, inner ring, eight balls in a cage, and outer ring stacked in register above a surface plate.",
  body: [
    plate(),
    rodsSorted.slice(0, 2).map(rod).join(""),
    motor(),
    shaftSeg(COLLAR_TOP, INNER_Z),
    innerRing(),
    shaftSeg(INNER_TOP, CAGE_Z),
    cage(),
    balls(),
    shaftSeg(CAGE_TOP, OUTER_TOP),
    outerRing(),
    shaftSeg(OUTER_TOP, SHAFT_TOP),
    `<path data-part="shaftmark" class="iso-line" data-tone="lit" data-free="end" d="${shaftMarkD(0)}" style="stroke-width:1.1"/>`,
    rodsSorted.slice(2).map(rod).join(""),
    knob(),
    `<path data-part="knobptr" class="iso-line" data-tone="hi" data-free="end" d="${knobD(START_RPM)}" style="stroke-width:1.1"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const GEO6203 = ${JSON.stringify(GEO6203)};
const faultFreq = ${faultFreq.toString()};
const CX = ${CX}, PITCH_R = ${PITCH_R}, BALL_Z = ${BALL_Z};
const SHAFT_TOP = ${SHAFT_TOP}, SLOW = ${SLOW};
const RPM_MIN = ${RPM_MIN}, RPM_MAX = ${RPM_MAX};
const KNOB = ${JSON.stringify(KNOB)}, KNOB_TOP = ${KNOB_TOP};
const BORE_R = ${BORE_R}, KNOB_R = ${KNOB_R};
const knobAngle = ${knobAngle.toString()};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const ballGs = [...svg.querySelector('[data-balls]').children];
const shaftmark = svg.querySelector('[data-part="shaftmark"]');
const knobptr = svg.querySelector('[data-part="knobptr"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ballAt = (a) => [CX + Math.cos(a) * PITCH_R, Math.sin(a) * PITCH_R, BALL_Z];
const rest = ballGs.map((_, i) => ballAt((i / GEO6203.n) * Math.PI * 2));
let rpm = ${START_RPM}, target = rpm, shaftAng = 0, ballAng = 0;
let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;
const tourAt = (t) => 1500 + 900 * Math.sin(t * 0.5);
function draw() {
  const order = ballGs.map((g, i) => {
    const a = ballAng + (i / GEO6203.n) * Math.PI * 2;
    const p = ballAt(a), r = rest[i];
    g.setAttribute("transform", translateAlong(P, [p[0] - r[0], p[1] - r[1], p[2] - r[2]]));
    return [depthOf(p, P), g];
  }).sort((a, b) => a[0] - b[0]);
  for (const [, g] of order) g.parentNode.appendChild(g);
  shaftmark.setAttribute("d", lineOnTop([CX - Math.cos(shaftAng) * BORE_R, -Math.sin(shaftAng) * BORE_R], [CX + Math.cos(shaftAng) * 14, Math.sin(shaftAng) * 14], SHAFT_TOP + 0.2, P));
  const ka = knobAngle(rpm);
  knobptr.setAttribute("d", lineOnTop([KNOB[0] - Math.cos(ka) * KNOB_R, KNOB[1] - Math.sin(ka) * KNOB_R], [KNOB[0] + Math.cos(ka) * 9, KNOB[1] + Math.sin(ka) * 9], KNOB_TOP + 0.2, P));
  const f = faultFreq(rpm);
  const text = Math.round(rpm) + " rpm · BPFO " + f.bpfo.toFixed(1) + " Hz · BPFI " + f.bpfi.toFixed(1) + " Hz";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(rpm)));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock += dt; target = tourAt(clock); }
  rpm = rpm + (target - rpm) * (1 - Math.exp(-dt / 0.35));
  if (Math.abs(target - rpm) < 0.05) rpm = target;
  const f = faultFreq(rpm);
  shaftAng += 2 * Math.PI * (f.fr / SLOW) * dt;
  ballAng += 2 * Math.PI * (f.ftf / SLOW) * dt;
  draw();
  const settled = !touring && rpm === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { touring = false; target = clamp(next, RPM_MIN, RPM_MAX); clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 3600); if (still.matches) { rpm = target; draw(); } else run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.2) / 0.6, 0, 1);
  steer(RPM_MIN + share * (RPM_MAX - RPM_MIN));
});
stage.addEventListener("pointerleave", () => steer(target));
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + 100;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - 100;
  if (event.key === "PageUp") to = target + 500;
  if (event.key === "PageDown") to = target - 500;
  if (event.key === "Home") to = RPM_MIN;
  if (event.key === "End") to = RPM_MAX;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
draw();
`;

const startF = faultFreq(START_RPM);
const startReadout = `${START_RPM} rpm · BPFO ${startF.bpfo.toFixed(1)} Hz · BPFI ${startF.bpfi.toFixed(1)} Hz`;
const body = k.plateHtml({
  fig: "Fig 1",
  title: "6203 test bearing rig",
  hint: "Hover to set speed · arrow keys nudge",
  readout: startReadout,
  keys: [
    { mark: "lit", label: "Lit ball: one of eight 6.75 mm balls, orbiting at cage frequency" },
    { mark: "raised", label: "Outer ring fixed · inner ring and shaft turn together" },
  ],
  caption:
    "A 6203 test bearing in exploded rest above its rig shaft. Eight balls orbit at the cage frequency while the inner ring turns with the shaft and the outer ring stays fixed; the readout's BPFO and BPFI come from the same verified geometry as the parts (pitch Ø28.55, 8 balls, 0° contact). Ring shoulders, cage body and rig furniture are illustrative. Motion is slowed 30×; the readout is true.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="6203 rig: arrow keys set shaft speed" aria-valuemin="${RPM_MIN}" aria-valuemax="${RPM_MAX}" aria-valuenow="${START_RPM}">${svg}</div>`,
});

const out = theme === "light" ? "rig-6203-light.html" : "rig-6203.html";
writeFileSync(join(HERE, out), k.pageHtml({ title: "6203 test bearing rig", theme, body, script: kitScript() + live }));
console.log("wrote", out);
