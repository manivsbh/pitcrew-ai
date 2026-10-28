import type { Inputs } from "./physics/models"
export const machines = {
  bearing: {
    name: "Motor & bearing assembly",
    code: "MTR–6204",
    parts: [
      "Motor body",
      "Drive shaft",
      "Bearing housing",
      "Outer ring",
      "Inner ring",
      "Rolling elements",
      "Bearing cage",
      "Mounting base",
    ],
  },
  engine: {
    name: "V6 combustion engine",
    code: "V6–DEMO",
    parts: [
      "Crankcase",
      "Oil pan",
      "Cylinder bank L",
      "Cylinder bank R",
      "Piston 1",
      "Piston 2",
      "Piston 3",
      "Piston 4",
      "Piston 5",
      "Piston 6",
      "Connecting rods",
      "Crankshaft",
      "Flywheel",
      "Camshaft L",
      "Camshaft R",
      "Intake manifold",
      "Fuel pump",
      "Fuel rail L",
      "Fuel rail R",
      "Fuel injector 1",
      "Fuel injector 2",
      "Fuel injector 3",
      "Fuel injector 4",
      "Fuel injector 5",
      "Fuel injector 6",
      "Spark plugs",
    ],
  },
  motor: {
    name: "Electric motor",
    code: "EM–075",
    parts: [
      "Motor housing",
      "Stator windings",
      "Rotor",
      "Output shaft",
      "Front bearing",
      "End shield",
      "Cooling fan",
      "Terminal box",
    ],
  },
}
export type MachineId = keyof typeof machines

// Backend pack kind -> physics sandbox family. New PDF machines resolve by
// their classified kind; unknown kinds fall back to the motor family.
export const KIND_GEOM: Record<string, MachineId> = {
  "bearing-rig": "bearing",
  pump: "motor",
  engine: "engine",
  generic: "motor",
}
export const geomOfKind = (kind: string): MachineId => KIND_GEOM[kind] ?? "motor"

// Normalized design scales for the simulation engine (1 = default).
// Engine bore/stroke resize pistons + cylinder banks; shaft diameter
// rescales shafts/rotors/cranks. Sandbox only, never evidence.
export const scalesFor = (design: Inputs): { bore: number; stroke: number; shaft: number } => {
  if (design.kind === "engine") return { bore: design.bore / 52, stroke: design.stroke / 58, shaft: 1 }
  return { bore: 1, stroke: 1, shaft: design.diameter / 20 }
}
