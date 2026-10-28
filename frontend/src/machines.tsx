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
    name: "Small combustion engine",
    code: "ICE–125",
    parts: [
      "Crankcase",
      "Cylinder block",
      "Cylinder head",
      "Piston",
      "Connecting rod",
      "Crankshaft",
      "Flywheel",
      "Spark plug",
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

type Props = {
  machine: MachineId
  selected: string
  select: (p: string) => void
  exploded: boolean
  isolated: boolean
  design: Inputs
}
export function AdditionalMachine({
  machine,
  selected,
  select,
  exploded,
  isolated,
  design,
}: Props) {
  const e = exploded ? 1 : 0
  const boreScale = design.kind === "engine" ? design.bore / 52 : 1
  const strokeScale = design.kind === "engine" ? design.stroke / 58 : 1
  const shaftScale = design.kind === "motor" ? design.diameter / 20 : 1
  const material = (name: string, color: string) => (
    <meshStandardMaterial
      color={selected === name ? "#c2ec93" : color}
      metalness={0.65}
      roughness={0.35}
    />
  )
  const box = (
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    color: string,
  ) => (
    <mesh
      key={name}
      position={position}
      visible={!isolated || selected === name}
      onClick={(event) => {
        event.stopPropagation()
        select(name)
      }}
    >
      <boxGeometry args={size} />
      {material(name, color)}
    </mesh>
  )
  const cylinder = (
    name: string,
    position: [number, number, number],
    radius: number,
    length: number,
    color: string,
    horizontal = false,
  ) => (
    <mesh
      key={name}
      position={position}
      rotation={horizontal ? [0, 0, Math.PI / 2] : [0, 0, 0]}
      visible={!isolated || selected === name}
      onClick={(event) => {
        event.stopPropagation()
        select(name)
      }}
    >
      <cylinderGeometry
        args={[
          radius *
            (name === "Cylinder block" || name === "Piston"
              ? boreScale
              : name === "Output shaft"
                ? shaftScale
                : 1),
          radius *
            (name === "Cylinder block" || name === "Piston"
              ? boreScale
              : name === "Output shaft"
                ? shaftScale
                : 1),
          length * (name === "Cylinder block" ? strokeScale : 1),
          48,
        ]}
      />
      {material(name, color)}
    </mesh>
  )
  if (machine === "engine")
    return (
      <group position={[0, 0.15, 0]} rotation={[0, -0.3, 0]}>
        {box("Crankcase", [0, 0.55, 0], [1.65, 1, 1.25], "#536269")}
        {cylinder(
          "Cylinder block",
          [0, 1.4 + e * 0.6, 0],
          0.63,
          0.8,
          "#7d8a8d",
        )}
        {Array.from({ length: 6 }, (_, i) =>
          cylinder(
            "Cylinder block",
            [0, 1.06 + i * 0.13 + e * 0.6, 0],
            0.74,
            0.045,
            "#9ba5a7",
          ),
        )}
        {box(
          "Cylinder head",
          [0, 2.02 + e * 1.2, 0],
          [1.35, 0.35, 1.25],
          "#4e6065",
        )}
        {cylinder(
          "Spark plug",
          [0.15, 2.4 + e * 1.6, 0],
          0.085,
          0.5,
          "#eee9d9",
        )}
        {cylinder("Piston", [1.05 + e * 0.6, 1.45, 0], 0.35, 0.48, "#bdc4c3")}
        {box(
          "Connecting rod",
          [1.05 + e * 0.6, 0.95, 0],
          [0.14, 0.6, 0.15],
          "#a9b2b3",
        )}
        {cylinder(
          "Crankshaft",
          [0.5, 0.45, 0.9 + e * 0.5],
          0.13,
          2.6,
          "#bac2c3",
          true,
        )}
        {cylinder(
          "Flywheel",
          [-1.1 - e * 0.8, 0.6, 0],
          0.74,
          0.25,
          "#68767c",
          true,
        )}
      </group>
    )
  return (
    <group rotation={[0, -0.25, 0]}>
      {cylinder(
        "Motor housing",
        [-1.1 - e * 0.75, 1, 0],
        0.85,
        1.75,
        "#52636b",
        true,
      )}
      {Array.from({ length: 10 }, (_, i) =>
        cylinder(
          "Motor housing",
          [-1.85 + i * 0.17 - e * 0.75, 1, 0],
          0.92,
          0.045,
          "#78858a",
          true,
        ),
      )}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6
        return cylinder(
          "Stator windings",
          [0.3 + e * 0.25, 1 + Math.cos(a) * 0.59, Math.sin(a) * 0.59],
          0.105,
          0.9,
          "#bd8552",
          true,
        )
      })}
      {cylinder("Rotor", [0.3 + e * 0.6, 1, 0], 0.39, 1.15, "#8a969d", true)}
      {cylinder(
        "Output shaft",
        [1.2 + e * 0.8, 1, 0],
        0.14,
        2.6,
        "#d0d5d4",
        true,
      )}
      <mesh
        position={[1.3 + e * 1.1, 1, 0]}
        rotation={[0, Math.PI / 2, 0]}
        visible={!isolated || selected === "Front bearing"}
        onClick={(event) => {
          event.stopPropagation()
          select("Front bearing")
        }}
      >
        <torusGeometry args={[0.27, 0.09, 16, 48]} />
        {material("Front bearing", "#a7b2b6")}
      </mesh>
      {cylinder(
        "End shield",
        [1.7 + e * 1.5, 1, 0],
        0.8,
        0.15,
        "#657981",
        true,
      )}
      {cylinder(
        "Cooling fan",
        [-2.1 - e * 1.5, 1, 0],
        0.71,
        0.14,
        "#2c414b",
        true,
      )}
      {Array.from({ length: 7 }, (_, i) => (
        <group
          key={i}
          position={[-2.16 - e * 1.5, 1, 0]}
          rotation={[(i * Math.PI * 2) / 7, 0, 0]}
        >
          {box("Cooling fan", [0, 0.45, 0], [0.12, 0.5, 0.1], "#87989c")}
        </group>
      ))}
      {box(
        "Terminal box",
        [-1.1 - e * 0.75, 2.02 + e * 0.4, 0],
        [0.7, 0.4, 0.65],
        "#485b62",
      )}
    </group>
  )
}
