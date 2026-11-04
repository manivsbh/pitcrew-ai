import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../skills/anatomy/kit/iso-kit.mjs";
import { circleOf, disc, dotsOf, frameAlong, ringBand } from "../../skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../../skills/anatomy/scripts/inline-kit.mjs";
import { BASE, STATIONS, TOUR_MS, readout } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 680;
const HEIGHT = 470;

// 1 unit = 1 mm in plan. Footprint + holes true (CR 10/15/20 base table);
// heights illustrative unless the excerpts give them.
const PLATE = { x: -240, y: -170, w: 480, d: 340, r: 10 };
const PLATE_H = 14;
const FOOT_H = 6;
const BASEP = { x: -BASE.B2 / 2, y: -BASE.B1 / 2, w: BASE.B2, d: BASE.B1, r: 6 };
const BASE_H = 110;
const HOLE = BASE.holeDia / 2;
const HOLE_X = BASE.L2 / 2;
const HOLE_Y = BASE.L1 / 2;
const PORT_Z = 60;
const PIPE_R = 26;
const PIPE_L = 40;
const FLG_R = 44;
const FLG_T = 12;
const FBOLT_R = 34;

const KNOBX = -201;
const KNOBY = 109;
const KNOB_R = 7;
const KNOB_Z = 10;
const KNOB_TOP = 18;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, 934],
    [KNOBX, KNOBY, KNOB_TOP + 2]],
  WIDTH, HEIGHT,
  { pad: 28, azimuth: 42 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 2, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 2, FOOT_H - 2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -230, y: 150, w: 460, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 5, strip.x + strip.w - 5, 5, 5, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const label = { x: 186, y: -158, w: 44, d: 16, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 1, P, 3), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 6, label.y + 5.5], 1, P, "x"), "CR-H", { size: 3.4, tone: "mid", anchor: "start" }));
  out.push(L(k.lineOnTop([label.x + 1, label.y + 12], [label.x + 43, label.y + 12], 1, P), { tone: "faint" }));
  return out.join("");
}

// Inlet (back, faces away) and discharge (front) ports. 2 in nominal.
const FIN = frameAlong([0, -BASEP.d / 2, PORT_Z], [0, -1, 0]);
const FOUT = frameAlong([0, BASEP.d / 2, PORT_Z], [0, 1, 0]);
const FACE_S = PIPE_L + FLG_T;

function backPort() {
  const out = [];
  out.push(S(disc(0, PIPE_L, PIPE_R, FIN, P), { tone: "mid" }));
  out.push(S(ringBand(PIPE_L, FACE_S, PIPE_R, FLG_R, FIN, P), { tone: "mid" }));
  return out.join("");
}

function base() {
  const out = [];
  out.push(S(k.slabOf(BASEP, 0, BASE_H, P, 8, 1.5), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASEP, 6), BASE_H, P), { tone: "lo" }));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * HOLE_X, y = sy * HOLE_Y;
    out.push(S(k.cylinder(x, y, HOLE, BASE_H, 0.5, P, 24), { tone: "lo", crease: "none" }));
    out.push(L(k.ring(x, y, HOLE, BASE_H + 0.5, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, 0, BASE_H + 12, P, 20, 0.4), { tone: "hi" }));
    out.push(S(k.cylinder(x, y, 9, BASE_H + 12, 2, P, 24), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 8, BASE_H + 14, 10, P, 6), { tone: "hi" }));
  }
  return out.join("");
}

function frontPort() {
  const out = [];
  out.push(S(disc(0, PIPE_L, PIPE_R, FOUT, P), { tone: "mid" }));
  out.push(S(ringBand(PIPE_L, FACE_S, PIPE_R, FLG_R, FOUT, P), { tone: "mid" }));
  out.push(S(disc(FACE_S, FACE_S + 0.4, PIPE_R - 2, FOUT, P), { tone: "lo", crease: "none" }));
  out.push(L(circleOf(FOUT, FACE_S + 0.4, PIPE_R - 2, P), { tone: "lo" }));
  out.push(L(circleOf(FOUT, FACE_S + 0.4, PIPE_R + 6, P), { tone: "faint" }));
  out.push(D(dotsOf(FOUT, FACE_S + 0.4, FBOLT_R, 4, P, { all: true }), { size: 0.55 }));
  return out.join("");
}

// Stage stack: 4 impellers (CR-H 10-4), eyelets up per the manual.
const NSTAGE = 4;
const STAGE_PITCH = 66;
const STACK0 = 160;
const stageZ = (i) => STACK0 + i * STAGE_PITCH;

function inletParts() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 44, 126, 16, P, 56), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 34, 142, P, 48), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 34, 142, 12, P, 48), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 26, 154, P, 40), { tone: "lo" }));
  return out.join("");
}

function stage(i) {
  const cz = stageZ(i);
  const out = [];
  out.push(S(k.cylinder(0, 0, 54, cz, 30, P, 64, 0.8), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 44, cz + 30, P, 56), { tone: "lo" }));
  if (i % 2 === 0) {
    out.push(S(k.cylinder(0, 0, 20, cz + 30, 6, P, 36), { tone: "mid" }));
    out.push(L(k.ring(0, 0, 14, cz + 36, P, 28), { tone: "faint" }));
  }
  out.push(S(k.cylinder(0, 0, 40, cz + 36, 8, P, 56, 0.6), { tone: "hi" }));
  out.push(L(k.ring(0, 0, 14, cz + 44, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 10, cz + 36, 12, P, 24), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, 16, cz + 48, 12, P, 32), { tone: "mid" }));
  return out.join("");
}

function stackTop() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 54, 410, 30, P, 64, 0.8), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 44, 440, P, 56), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 24, 444, 8, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 14, 452, 10, P, 6), { tone: "hi" }));
  out.push(D([at([0, 0, 462])], { size: 0.45, tone: "lo" }));
  return out.join("");
}

const STAYS = [[-72, -58], [72, -58], [-72, 58], [72, 58]];
const STAY_TOP = 452;

function staybolt([x, y]) {
  const out = [];
  out.push(L(k.ring(x, y, 4.6, BASE_H, P, 16), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 4, BASE_H, STAY_TOP - BASE_H, P, 16), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 7, STAY_TOP, 2, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 7, STAY_TOP + 2, 10, P, 6), { tone: "hi" }));
  return out.join("");
}

function straps() {
  const out = [];
  for (const sx of [-1, 1]) {
    out.push(S(k.slabOf({ x: sx * 80 - 3, y: -12, w: 6, d: 24, r: 1 }, BASE_H, STAY_TOP - BASE_H, P, 3), { tone: "mid" }));
    out.push(S(k.cylinder(sx * 77, 0, 4, STAY_TOP, 25, P, 16), { tone: "hi" }));
    out.push(S(k.cylinder(sx * 77, 0, 7, STAY_TOP + 17, 8, P, 6), { tone: "hi" }));
  }
  return out.join("");
}

function head() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 70, 466, 40, P, 72, 1), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 56, 506, P, 60), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 70, 506, 12, P, 72, 0.8), { tone: "mid" }));
  const bolts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2;
    return [Math.cos(a) * 58, Math.sin(a) * 58, 518];
  });
  out.push(L(bolts.map(([x, y]) => k.ring(x, y, 3.5, 518, P, 14)).join(""), { tone: "lo" }));
  out.push(D(bolts.map(([x, y, z]) => at([x, y, z])), { size: 0.45 }));
  return out.join("");
}

const SLEEVE_TOP = 586;

function sleeveAndSeal() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 44, 574, 12, P, 56), { tone: "mid" }));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(S(k.cylinder(sx * 30, sy * 30, 5, SLEEVE_TOP, 16, P, 16), { tone: "hi" }));
    out.push(S(k.cylinder(sx * 30, sy * 30, 8, SLEEVE_TOP + 8, 8, P, 6), { tone: "hi" }));
  }
  out.push(S(k.cylinder(0, 0, 26, 598, 22, P, 44), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, 26.5, 604, 2, P, 44), { tone: "lo", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 26.5, 612, 2, P, 44), { tone: "lo", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 41 / Math.sqrt(3), 620, 12, P, 6), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, 18, 632, 12, P, 32), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 12, 644, P, 24), { tone: "faint" }));
  return out.join("");
}

const shaftSeg = (z0, z1) => S(k.cylinder(0, 0, 12, z0, z1 - z0, P, 28), { tone: "hi" });

const CPL = [[15.5, 15.5], [-15.5, 15.5], [-15.5, -15.5], [15.5, -15.5]];

function coupling() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 30, 672, 18, P, 48, 0.6), { tone: "hi" }));
  out.push(L(k.ring(0, 0, 22, 690, P, 40), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 30, 696, 18, P, 48, 0.6), { tone: "hi" }));
  for (const [x, y] of CPL) {
    out.push(S(k.cylinder(x, y, 4, 668, 50, P, 14), { tone: "hi" }));
    out.push(S(k.cylinder(x, y, 6.5, 718, 8, P, 6), { tone: "hi" }));
    out.push(S(k.cylinder(x, y, 6.5, 660, 8, P, 6), { tone: "mid" }));
  }
  out.push(S(k.cylinder(12, 0, 1.25, 714, 4, P, 10), { tone: "hi" }));
  return out.join("");
}

function guard(sy) {
  const out = [];
  const y0 = sy > 0 ? 60 : -76;
  out.push(S(k.slabOf({ x: -46, y: y0, w: 92, d: 16, r: 2 }, 660, 66, P, 4, 0.8), { tone: "mid" }));
  const vents = [];
  for (let ix = 0; ix < 5; ix++) for (let iy = 0; iy < 2; iy++) {
    vents.push(at([-32 + ix * 16, y0 + 5 + iy * 6, 726]));
  }
  out.push(D(vents, { size: 0.5 }));
  for (const sx of [-1, 1]) {
    const gx = sx * 36, gy = y0 + 8;
    out.push(S(k.cylinder(gx, gy, 2.5, 726, 8, P, 12), { tone: "hi" }));
    out.push(L(k.ring(gx, gy, 2.5, 734, P, 12), { tone: "faint" }));
  }
  return out.join("");
}

function stool() {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(S(k.slabOf({ x: sx * 55 - 8, y: sy * 45 - 8, w: 16, d: 16, r: 1.5 }, 740, 40, P, 3, 0.5), { tone: "mid" }));
  }
  out.push(S(k.slabOf({ x: -70, y: -60, w: 140, d: 120, r: 4 }, 780, 10, P, 5, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan({ x: -70, y: -60, w: 140, d: 120, r: 4 }, 8), 790, P), { tone: "lo" }));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(S(k.cylinder(sx * 55, sy * 45, 5, 776, 18, P, 16), { tone: "hi" }));
    out.push(S(k.cylinder(sx * 55, sy * 45, 8, 794, 10, P, 6), { tone: "hi" }));
  }
  return out.join("");
}

function motor() {
  const out = [];
  for (const fx of [-75, 61]) {
    out.push(S(k.slabOf({ x: fx, y: -16, w: 14, d: 32, r: 1.5 }, 790, 10, P, 3, 0.5), { tone: "mid" }));
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(S(k.cylinder(sx * 68, sy * 8, 4, 800, 12, P, 14), { tone: "hi" }));
    out.push(S(k.cylinder(sx * 68, sy * 8, 6.5, 806, 8, P, 6), { tone: "hi" }));
  }
  out.push(S(k.cylinder(0, 0, 55, 800, 90, P, 64), { tone: "mid" }));
  out.push(L([812, 824, 836, 848, 860, 872].map((z) => k.sideArc(0, 0, 55, z, P, 44)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 58, 890, 10, P, 64, 0.8), { tone: "mid" }));
  const bolts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2;
    return at([Math.cos(a) * 48, Math.sin(a) * 48, 900]);
  });
  out.push(D(bolts, { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 58, 900, 24, P, 64, 0.8), { tone: "mid" }));
  out.push(L([20, 34, 48].map((r) => k.ring(0, 0, r, 924, P, 56)).join(""), { tone: "lo" }));
  const grille = [...Array(12)].map((_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return at([Math.cos(a) * 41, Math.sin(a) * 41, 924]);
  });
  out.push(D(grille, { size: 0.4 }));
  const box = { x: -15, y: 50, w: 30, d: 20, r: 1.5 };
  out.push(S(k.slabOf(box, 810, 18, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(box, 2), 828, 3, P, 4, 0.4), { tone: "mid" }));
  const lid = k.corners(k.insetPlan(box, 2), 2);
  out.push(D(lid.map(([x, y]) => at([x, y, 831])), { size: 0.4 }));
  out.push(S(k.cylinder(0, 60, 3, 831, 4, P, 16), { tone: "mid" }));
  return out.join("");
}

function knob() {
  const out = [];
  out.push(S(k.slabOf({ x: KNOBX - 15, y: KNOBY - 13, w: 30, d: 26, r: 2 }, 0, KNOB_Z, P, 4, 0.6), { tone: "mid" }));
  const ticks = k.radialTicks(KNOBX, KNOBY, 9.5, STATIONS.length, STATIONS.length, KNOB_Z, [1.2, 2.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(KNOBX, KNOBY, KNOB_R, KNOB_Z, KNOB_TOP - KNOB_Z, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(KNOBX, KNOBY, KNOB_R, KNOB_Z, KNOB_TOP, 24, P), { tone: "lo" }));
  return out.join("");
}

// Torque-station marker targets, one per STATIONS entry. Precomputed paths:
// the live script re-aims the marker by swapping d, no lathe math in page.
const FBOLT_TOP = [0, BASEP.d / 2 + FACE_S + 0.4, PORT_Z + FBOLT_R];
const FSTATION = frameAlong(FBOLT_TOP, [0, 1, 0]);
const MARKERS = [
  k.ring(36, 68, 5, 734, P, 24),
  k.ring(CPL[0][0], CPL[0][1], 6.5, 726, P, 24),
  k.ring(CPL[1][0], CPL[1][1], 6.5, 726, P, 24),
  k.ring(CPL[2][0], CPL[2][1], 6.5, 726, P, 24),
  k.ring(77, 0, 6, STAY_TOP + 25, P, 24),
  k.ring(55, 45, 7, 804, P, 24),
  k.ring(68, 8, 6, 814, P, 24),
  circleOf(FSTATION, 0, 6, P),
  k.ring(72, 58, 9, STAY_TOP + 12, P, 28),
  k.ring(30, 30, 9, SLEEVE_TOP + 16, P, 28),
  k.ring(0, 0, 16, 457, P, 36),
  k.ring(0, 0, 21, 632, P, 44),
  k.ring(12, 0, 5, 718, P, 20),
];
const knobAngle = (i) => ((-120 + (240 * i) / (STATIONS.length - 1)) * Math.PI) / 180;
const knobD = (i) => {
  const a = knobAngle(i);
  return k.lineOnTop(
    [KNOBX - Math.cos(a) * KNOB_R, KNOBY - Math.sin(a) * KNOB_R],
    [KNOBX + Math.cos(a) * 9, KNOBY + Math.sin(a) * 9], KNOB_TOP + 0.2, P);
};

const staysSorted = byDepth(STAYS);
const guardsSorted = byDepth([[0, 68], [0, -68]]);
const guardBack = Math.sign(guardsSorted[0][1]);
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Exploded CR-H vertical multistage pump: base with ports, four-stage chamber stack, pump head, seal, coupling, guards, stool, and motor.",
  body: [
    plate(),
    backPort(),
    base(),
    frontPort(),
    inletParts(),
    staysSorted.slice(0, 2).map(staybolt).join(""),
    [0, 1, 2, 3].map(stage).join(""),
    stackTop(),
    straps(),
    head(),
    sleeveAndSeal(),
    shaftSeg(SLEEVE_TOP, 598),
    shaftSeg(644, 672),
    coupling(),
    guard(guardBack),
    guard(-guardBack),
    staysSorted.slice(2).map(staybolt).join(""),
    stool(),
    motor(),
    knob(),
    `<path data-part="marker" class="iso-line" data-tone="lit" d="${MARKERS[0]}" style="stroke-width:2"/>`,
    `<path data-part="knobptr" class="iso-line" data-tone="hi" data-free="end" d="${knobD(0)}" style="stroke-width:1.1"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const STATIONS = ${JSON.stringify(STATIONS)};
const MARKERS = ${JSON.stringify(MARKERS)};
const readout = ${readout.toString()};
const KNOB = [${KNOBX}, ${KNOBY}], KNOB_TOP = ${KNOB_TOP}, KNOB_R = ${KNOB_R};
const NST = STATIONS.length, TOUR_MS = ${TOUR_MS};
const knobAngle = ${knobAngle.toString()};
const stage = document.querySelector(".iso-stage");
const marker = stage.querySelector('[data-part="marker"]');
const knobptr = stage.querySelector('[data-part="knobptr"]');
const readoutEl = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
let station = 0, touring = true, visible = false, timer = 0, idleTimer = 0;
function draw() {
  marker.setAttribute("d", MARKERS[station]);
  const ka = knobAngle(station);
  knobptr.setAttribute("d", lineOnTop([KNOB[0] - Math.cos(ka) * KNOB_R, KNOB[1] - Math.sin(ka) * KNOB_R], [KNOB[0] + Math.cos(ka) * 9, KNOB[1] + Math.sin(ka) * 9], KNOB_TOP + 0.2, P));
  const text = readout(station);
  if (readoutEl.textContent !== text) readoutEl.textContent = text;
  stage.setAttribute("aria-valuenow", String(station + 1));
  stage.setAttribute("aria-valuetext", text);
}
function tour(on) {
  clearInterval(timer);
  timer = 0;
  if (on && visible && !still.matches) {
    timer = setInterval(() => { station = (station + 1) % NST; draw(); }, TOUR_MS);
  }
}
const steer = (next) => {
  touring = false;
  station = clamp(next, 0, NST - 1);
  draw();
  clearTimeout(idleTimer);
  clearInterval(timer);
  timer = 0;
  idleTimer = setTimeout(() => { touring = !still.matches; tour(touring); }, 5000);
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; tour(touring && visible); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = stage.querySelector("svg").getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.2) / 0.6, 0, 1);
  steer(Math.floor(share * NST));
});
stage.addEventListener("pointerleave", () => steer(station));
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = station + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = station - 1;
  if (event.key === "PageUp") to = station + 3;
  if (event.key === "PageDown") to = station - 3;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = NST - 1;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
draw();
if (!still.matches) {
  marker.innerHTML = '<animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/>';
}
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "CR-H pump reassembly torques",
  hint: "Hover to step stations · arrow keys nudge",
  readout: readout(0),
  keys: [
    { mark: "lit", label: "Lit ring: the station fastener takes the readout torque" },
    { mark: "raised", label: "CR-H values; CRN-H staybolt 100 Nm" },
  ],
  caption:
    "A CR-H 10-4 vertical multistage pump in exploded rest. Thirteen torque stations follow the reassembly sequence; the readout's position numbers and torques come from the service torque table. Base footprint, bolt holes, torques, sequence, and stage order are manual-true; heights, diameters, and fastener counts are illustrative. Foundation wants 37 ft-lbs on four shimmed bolts.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="CR-H pump: arrow keys step torque stations" aria-valuemin="1" aria-valuemax="${STATIONS.length}" aria-valuenow="1">${svg}</div>`,
});

const out = theme === "light" ? "cr-pump-light.html" : "cr-pump.html";
writeFileSync(join(HERE, out), k.pageHtml({ title: "CR-H pump reassembly torques", theme, body, script: kitScript() + live }));
console.log("wrote", out);
