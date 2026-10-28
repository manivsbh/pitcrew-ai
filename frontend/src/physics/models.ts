export type MachineId = "bearing" | "motor" | "engine"
type Common = { speed: number; speedLimit: number }
export type BearingInput = Common & {
  kind: "bearing"
  torque: number
  diameter: number
  length: number
  modulus: number
  allowable: number
  radialLoad: number
}
export type MotorInput = Common & {
  kind: "motor"
  torque: number
  current: number
  resistance: number
  fixedLoss: number
  coefficient: number
  currentLimit: number
  diameter: number
}
export type EngineInput = Common & {
  kind: "engine"
  bore: number
  stroke: number
  cylinders: number
  bmep: number
  fuelFlow: number
  lhv: number
  bmepLimit: number
}
export type Inputs = BearingInput | MotorInput | EngineInput
export type Field = {
  key: string
  label: string
  unit: string
  min: number
  max: number
  assumed?: boolean
  design?: boolean
}
const f = (
  key: string,
  label: string,
  unit: string,
  min: number,
  max: number,
  assumed = false,
  design = false,
): Field => ({ key, label, unit, min, max, assumed, design })
export const defaults: Record<MachineId, Inputs> = {
  bearing: {
    kind: "bearing",
    speed: 1500,
    speedLimit: 3000,
    torque: 5,
    diameter: 20,
    length: 200,
    modulus: 79,
    allowable: 80,
    radialLoad: 500,
  },
  motor: {
    kind: "motor",
    speed: 1500,
    speedLimit: 3000,
    torque: 4,
    current: 4,
    resistance: 1,
    fixedLoss: 30,
    coefficient: 0.0005,
    currentLimit: 8,
    diameter: 20,
  },
  engine: {
    kind: "engine",
    speed: 3000,
    speedLimit: 6000,
    bore: 52,
    stroke: 58,
    cylinders: 1,
    bmep: 600,
    fuelFlow: 0.3,
    lhv: 43,
    bmepLimit: 1000,
  },
}
const common = [
  f("speed", "Rotational speed", "rpm", 0, 12000),
  f("speedLimit", "Configured speed limit", "rpm", 100, 12000, true),
]
export const fields: Record<MachineId, Field[]> = {
  bearing: [
    ...common,
    f("torque", "Transmitted torque", "N·m", 0, 500),
    f("diameter", "Shaft diameter", "mm", 5, 80, false, true),
    f("length", "Shaft length", "mm", 50, 1000, false, true),
    f("modulus", "Shear modulus", "GPa", 1, 200, true),
    f("allowable", "Allowable shear", "MPa", 1, 500, true),
    f("radialLoad", "Radial load (context only)", "N", 0, 10000, true),
  ],
  motor: [
    ...common,
    f("torque", "Output torque", "N·m", 0, 100),
    f("current", "RMS phase current", "A", 0, 100),
    f("resistance", "Phase resistance", "Ω", 0.01, 20, true),
    f("fixedLoss", "Fixed losses", "W", 0, 500, true),
    f("coefficient", "Speed-loss coefficient", "W/(rad/s)²", 0, 0.05, true),
    f("currentLimit", "Configured current limit", "A", 0.1, 100, true),
    f("diameter", "Output shaft diameter", "mm", 5, 80, false, true),
  ],
  engine: [
    ...common,
    f("bore", "Cylinder bore", "mm", 20, 120, false, true),
    f("stroke", "Stroke", "mm", 20, 120, false, true),
    f("cylinders", "Cylinder count", "integer", 1, 8),
    f("bmep", "Assumed BMEP", "kPa", 0, 1500, true),
    f("fuelFlow", "Fuel mass flow", "g/s", 0, 10),
    f("lhv", "Lower heating value", "MJ/kg", 1, 50, true),
    f("bmepLimit", "Configured BMEP limit", "kPa", 1, 1500, true),
  ],
}
export type Output = {
  label: string
  value: number | null
  unit: string
  formula: string
  substitution: string
}
export type Limit = {
  label: string
  actual: number
  limit: number
  unit: string
  exceeded: boolean
  component: string
}
export type Result = {
  version: string
  machineId: MachineId
  inputs: Inputs
  outputs: Output[]
  checks: Limit[]
  errors: string[]
  contradictions: string[]
  limitations: string[]
  status: string
}
export const MODEL_VERSION = "frontend-physics/1.0"
export function validate(input: Inputs): string[] {
  if (!fields[input.kind]) return ["Unsupported machine"]
  const errors = fields[input.kind].flatMap((field) => {
    const value = (input as unknown as Record<string, unknown>)[field.key]
    return typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < field.min ||
      value > field.max
      ? [
          `${field.label}: enter a finite value from ${field.min} to ${field.max} ${field.unit}.`,
        ]
      : []
  })
  if (input.kind === "engine" && !Number.isInteger(input.cylinders))
    errors.push("Cylinder count must be an integer.")
  return errors
}
export function patchInput(
  input: Inputs,
  patch: Record<string, number>,
): Inputs {
  for (const key of Object.keys(patch))
    if (!fields[input.kind].some((field) => field.key === key))
      throw new Error(`Unsupported parameter: ${key}`)
  const next = { ...input, ...patch } as Inputs
  const errors = validate(next)
  if (errors.length) throw new Error(errors.join(" "))
  return next
}
export function calculate(input: Inputs): Result {
  const result: Result = {
    version: MODEL_VERSION,
    machineId: input.kind,
    inputs: { ...input },
    outputs: [],
    checks: [],
    errors: validate(input),
    contradictions: [],
    limitations: [],
    status: "Invalid input",
  }
  if (result.errors.length) return result
  const add = (
    label: string,
    value: number | null,
    unit: string,
    formula: string,
    substitution: string,
  ) => result.outputs.push({ label, value, unit, formula, substitution })
  const check = (
    label: string,
    actual: number,
    limit: number,
    unit: string,
    component: string,
  ) =>
    result.checks.push({
      label,
      actual,
      limit,
      unit,
      component,
      exceeded: actual > limit,
    })
  const omega = (2 * Math.PI * input.speed) / 60
  add(
    "Angular velocity",
    omega,
    "rad/s",
    "ω = 2πn / 60",
    `2π × ${input.speed} / 60`,
  )
  check(
    "Speed",
    input.speed,
    input.speedLimit,
    "rpm",
    input.kind === "bearing"
      ? "Drive shaft"
      : input.kind === "motor"
        ? "Rotor"
        : "Crankshaft",
  )
  if (input.kind === "bearing") {
    const d = input.diameter / 1000,
      L = input.length / 1000,
      G = input.modulus * 1e9
    const J = (Math.PI * d ** 4) / 32,
      shear = (16 * input.torque) / (Math.PI * d ** 3),
      twist = (input.torque * L) / (J * G)
    add(
      "Mechanical power",
      input.torque * omega,
      "W",
      "P = Tω",
      `${input.torque} × ${omega.toFixed(4)}`,
    )
    add("Polar second moment", J, "m⁴", "J = πd⁴ / 32", `π × ${d}⁴ / 32`)
    add(
      "Maximum shear",
      shear / 1e6,
      "MPa",
      "τ = 16T / (πd³)",
      `16 × ${input.torque} / (π × ${d}³) / 10⁶`,
    )
    add(
      "Shaft twist",
      (twist * 180) / Math.PI,
      "deg",
      "θ = TL / (JG)",
      `${input.torque} × ${L} / (${J.toExponential(4)} × ${G}) rad; × 180/π`,
    )
    add(
      "Shear utilization",
      (shear / (input.allowable * 1e6)) * 100,
      "%",
      "u = τ / τ_allowable",
      `${(shear / 1e6).toFixed(4)} / ${input.allowable} × 100`,
    )
    check("Ideal shear", shear / 1e6, input.allowable, "MPa", "Drive shaft")
    result.limitations = [
      "Ideal solid circular shaft, elastic pure torsion only; no bending, fatigue or stress concentrations.",
      "Material properties and operating limits are assumed, not certified.",
      "Radial load is context only. Bearing geometry is unverified: no bearing life, efficiency or fault-frequency prediction.",
    ]
  } else if (input.kind === "motor") {
    const output = input.torque * omega,
      copper = 3 * input.current ** 2 * input.resistance,
      speedLoss = input.coefficient * omega ** 2
    const loss = copper + input.fixedLoss + speedLoss,
      total = output + loss
    add(
      "Mechanical power",
      output,
      "W",
      "P_out = Tω",
      `${input.torque} × ${omega.toFixed(4)}`,
    )
    add(
      "Copper losses",
      copper,
      "W",
      "P_copper = 3I²R",
      `3 × ${input.current}² × ${input.resistance}`,
    )
    add(
      "Speed losses",
      speedLoss,
      "W",
      "P_speed = kω²",
      `${input.coefficient} × ${omega.toFixed(4)}²`,
    )
    add(
      "Total losses",
      loss,
      "W",
      "P_loss = 3I²R + P_fixed + kω²",
      `${copper.toFixed(3)} + ${input.fixedLoss} + ${speedLoss.toFixed(3)}`,
    )
    add(
      "Electrical input estimate",
      total,
      "W",
      "P_in = P_out + P_loss",
      `${output.toFixed(3)} + ${loss.toFixed(3)}`,
    )
    add(
      "Efficiency",
      total > 0 ? (output / total) * 100 : null,
      "%",
      "η = P_out / P_in",
      total > 0
        ? `${output.toFixed(3)} / ${total.toFixed(3)} × 100`
        : "Undefined: zero input power",
    )
    check(
      "Phase current",
      input.current,
      input.currentLimit,
      "A",
      "Stator windings",
    )
    result.limitations = [
      "Three-phase prescribed loss budget; current and torque are independent inputs, not an electromagnetic motor model.",
      "Resistance, fixed losses and speed-loss coefficient are assumed. No thermal, supply, saturation or transient model.",
      "Shaft diameter changes are visual only. Lower resistance at equal output is a sensitivity study, not a feasible winding design guarantee.",
    ]
  } else {
    const volume =
      (Math.PI / 4) *
      (input.bore / 1000) ** 2 *
      (input.stroke / 1000) *
      input.cylinders
    const pressure = input.bmep * 1000,
      power = (pressure * volume * input.speed) / 120,
      fuel = (input.fuelFlow / 1000) * input.lhv * 1e6
    if (power > fuel)
      result.contradictions.push(
        "Predicted brake output exceeds fuel energy input. This operating point is inconsistent; efficiency is withheld.",
      )
    add(
      "Total displacement",
      volume * 1e6,
      "cc",
      "Vd = (π/4)b²sc",
      `π/4 × ${input.bore / 1000}² × ${input.stroke / 1000} × ${input.cylinders} × 10⁶`,
    )
    add(
      "Brake power",
      power,
      "W",
      "P = BMEP × Vd × n / 120",
      `${pressure} × ${volume.toExponential(4)} × ${input.speed} / 120`,
    )
    add(
      "BMEP torque estimate",
      (pressure * volume) / (4 * Math.PI),
      "N·m",
      "T = BMEP × Vd / (4π)",
      `${pressure} × ${volume.toExponential(4)} / (4π)`,
    )
    add(
      "Fuel energy input",
      fuel,
      "W",
      "P_fuel = ṁ × LHV",
      `${input.fuelFlow / 1000} × ${input.lhv * 1e6}`,
    )
    add(
      "Brake thermal efficiency",
      fuel > 0 && power <= fuel ? (power / fuel) * 100 : null,
      "%",
      "η_b = P_brake / P_fuel",
      fuel > 0 && power <= fuel
        ? `${power.toFixed(3)} / ${fuel.toFixed(3)} × 100`
        : "Withheld: zero fuel input or energy contradiction",
    )
    check("Assumed BMEP", input.bmep, input.bmepLimit, "kPa", "Cylinder block")
    result.limitations = [
      "Four-stroke energy accounting with assumed BMEP; no combustion dynamics, temperatures or physical failure prediction.",
      "Fuel flow and BMEP are independent prescribed assumptions. Changing either does not prove an achievable efficiency improvement.",
      "At zero speed torque is a BMEP-derived estimate, not demonstrated starting torque. Piston is shown exposed for illustration.",
    ]
  }
  result.status = result.contradictions.length
    ? "Inconsistent operating point"
    : result.checks.some((c) => c.exceeded)
      ? "Limit exceeded"
      : "Within configured limits"
  return result
}
export function interpret(
  text: string,
  input: Inputs,
): { patch?: Record<string, number>; message: string } {
  const s = text
    .toLowerCase()
    .replace(/what if i /g, "")
    .trim()
  if (/efficien/.test(s)) {
    if (input.kind === "motor")
      return {
        patch: { resistance: input.resistance * 0.9 },
        message:
          "Sensitivity proposal: lower assumed phase resistance by 10%, preserving speed, torque and current. Winding and thermal feasibility still require verification.",
      }
    return {
      message:
        input.kind === "engine"
          ? "No credible optimum is available. Fuel flow and BMEP are independent assumptions: changing them alone does not demonstrate feasible improvement. Use equal-output sensitivity experiments and measured calibration data."
          : "No bearing-efficiency model is available. Inspect shaft stress and twist; bearing losses require verified geometry and measured friction data.",
    }
  }
  if (/^reset (parameters|defaults)$/.test(s))
    return {
      patch: Object.fromEntries(
        Object.entries(defaults[input.kind]).filter(([key]) => key !== "kind"),
      ) as Record<string, number>,
      message: "Review restoring this machine’s illustrative defaults.",
    }
  const aliases: [RegExp, string, RegExp][] = [
    [/speed|rpm/, "speed", /rpm/],
    [/torque/, "torque", /n[·\s.-]?m/],
    [/shaft diameter/, "diameter", /mm/],
    [/bore/, "bore", /mm/],
    [/stroke/, "stroke", /mm/],
    [/current/, "current", /\ba\b|amps?/],
    [/resistance/, "resistance", /ω|Ω|ohms?/i],
  ]
  const matches = aliases.filter(([pattern]) => pattern.test(s))
  if (
    matches.length !== 1 ||
    /\band\b|;/.test(s) ||
    !/\bset\b|\bincrease\b|\bdecrease\b|\breduce\b/.test(s)
  )
    return {
      message:
        "Use one supported change at a time, for example “increase speed by 20%” or “set shaft diameter to 25 mm”. No changes applied.",
    }
  const [, key, unit] = matches[0]
  if (!fields[input.kind].some((field) => field.key === key))
    return { message: "That parameter is not supported for this machine." }
  const numbers = s.match(/-?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length !== 1)
    return { message: "Specify exactly one numeric value and its unit." }
  let value = Number(numbers[0])
  if (
    /\bby\b/.test(s) &&
    s.includes("%") &&
    /increase|decrease|reduce/.test(s)
  ) {
    if (value < 0 || value > 100)
      return { message: "Percentage changes must be between 0 and 100%." }
    const before = (input as unknown as Record<string, number>)[key]
    value = before * (1 + ((/decrease|reduce/.test(s) ? -1 : 1) * value) / 100)
  } else if (!unit.test(s) || !/\bto\b|\bat\b/.test(s) || s.includes("%"))
    return {
      message:
        "Use an absolute target with units (“set speed to 2000 rpm”), or a percentage change (“increase speed by 20%”).",
    }
  try {
    patchInput(input, { [key]: value })
    return {
      patch: { [key]: value },
      message: `Proposed ${key}: ${value}. Review the calculation before applying.`,
    }
  } catch (error) {
    return { message: (error as Error).message }
  }
}
