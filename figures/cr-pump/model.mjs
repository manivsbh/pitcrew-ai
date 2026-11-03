/* Pure model for the cr-pump pilot figure.
   Torques transcribed from packs/cr-pump/excerpts/svc-torque-table.md
   (Nm values; CR-H variants). Footprint dims from
   io-mechanical-installation.md (CR 10/15/20 base table).
   Nothing here is invented: station order follows the reassembly
   sequence (coupling-height + stage-assembly excerpts). */

// Base footprint, CR 10/15/20 (mm). Holes on L2 x L1 centers.
export const BASE = { L1: 130, L2: 176, B1: 215, B2: 256, holeDia: 13.5 };

// Torque stations in reassembly order.
export const STATIONS = [
  { pos: "7a", name: "Coupling guard screw", torque: "2 Nm" },
  { pos: "9", name: "Coupling hex screw M6", torque: "13 Nm" },
  { pos: "9", name: "Coupling hex screw M8", torque: "31 Nm" },
  { pos: "9", name: "Coupling hex screw M10", torque: "62 Nm" },
  { pos: "26b", name: "Strap bolt M8x25", torque: "15 Nm" },
  { pos: "28", name: "Motor bolt 3/8 in", torque: "13 Nm" },
  { pos: "28g", name: "Foot/base screw", torque: "20 Nm" },
  { pos: "35", name: "Discharge flange screw", torque: "20 Nm" },
  { pos: "36", name: "Staybolt nut CR-H", torque: "80 Nm" },
  { pos: "56", name: "Sleeve flange screw", torque: "75 Nm" },
  { pos: "67", name: "Shaft lock nut", torque: "22 Nm" },
  { pos: "105", name: "Shaft seal nut 41 mm", torque: "35 Nm" },
  { pos: "113", name: "Set screw 2.5 mm", torque: "2.5 Nm" },
];

export const TOUR_MS = 2400;

export function readout(station) {
  const s = STATIONS[station];
  return `Pos ${s.pos} · ${s.name} · ${s.torque}`;
}
