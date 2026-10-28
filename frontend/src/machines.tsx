import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group, Mesh } from "three"
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

type Props = {
  machine: MachineId
  selected: string
  select: (p: string) => void
  exploded: boolean
  isolated: boolean
  design: Inputs
  running?: boolean
}

// Firing order 1-4-2-5-3-6, 120 deg apart on the 720 deg four-stroke cycle.
const FIRE_DEG = [0, 240, 480, 120, 360, 600]
const BANK_X = [-0.85, 0, 0.85]
// Cylinder i (0-5): L1 L2 L3 R1 R2 R3. Returns bank side (+1 z / -1 z) and x.
const cylLayout = (i: number): { s: 1 | -1; x: number } => ({
  s: i < 3 ? 1 : -1,
  x: BANK_X[i % 3],
})

function V6Engine({
  selected,
  select,
  exploded,
  isolated,
  running = true,
}: Omit<Props, "machine" | "design"> & { running?: boolean }) {
  const e = exploded ? 1 : 0
  const crank = useRef<Group>(null)
  const cams = useRef<(Group | null)[]>([])
  const pistons = useRef<(Group | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const pumpPulse = useRef<Mesh>(null)
  const angle = useRef(0)
  useFrame((_, dt) => {
    if (running) angle.current += Math.min(dt, 0.05) * 3.2
    const th = angle.current
    if (crank.current) crank.current.rotation.x = th
    cams.current.forEach((c) => {
      if (c) c.rotation.x = th / 2
    })
    for (let i = 0; i < 6; i++) {
      const a = (th + (FIRE_DEG[i] * Math.PI) / 180) % (Math.PI * 4)
      const p = pistons.current[i]
      if (p) p.position.y = 1.12 + Math.cos(a) * 0.16
      const m = pulses.current[i]
      if (m) {
        // Intake stroke: first quarter of the cycle, pulse travels in.
        if (a < Math.PI) {
          const k = a / Math.PI
          m.position.y = 1.78 - k * 0.75
          m.scale.setScalar(1)
        } else {
          m.scale.setScalar(0.001)
        }
      }
    }
    if (pumpPulse.current) {
      const s = running ? 1 + 0.35 * Math.sin(th * 3) : 1
      pumpPulse.current.scale.setScalar(s)
    }
  })
  const mat = (name: string, color: string, emissive = "#000000") => (
    <meshStandardMaterial
      color={selected === name ? "#c2ec93" : color}
      emissive={selected === name ? "#1d2b12" : emissive}
      metalness={0.6}
      roughness={0.4}
    />
  )
  const pick = (name: string) => ({
    visible: !isolated || selected === name,
    onClick: (ev: { stopPropagation: () => void }) => {
      ev.stopPropagation()
      select(name)
    },
  })
  const tilt = 0.5236 // 30 deg bank angle
  return (
    <group position={[0, 0, 0]} rotation={[0, 2.35, 0]} scale={1.12}>
      {/* crankcase + sump (case ghosted so the crank shows through) */}
      <mesh position={[0, 0.55, 0]} {...pick("Crankcase")}>
        <boxGeometry args={[2.3, 0.7, 1.1]} />
        <meshStandardMaterial
          color={selected === "Crankcase" ? "#c2ec93" : "#536269"}
          metalness={0.6}
          roughness={0.4}
          transparent
          opacity={0.32}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.05 - e * 0.5, 0]} {...pick("Oil pan")}>
        <boxGeometry args={[1.9, 0.32, 0.9]} />
        {mat("Oil pan", "#3d4a4e")}
      </mesh>
      {/* crankshaft + webs + flywheel, rotating */}
      <group ref={crank} position={[0, 0.55, 0]}>
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          {...pick("Crankshaft")}
        >
          <cylinderGeometry args={[0.09, 0.09, 2.5, 24]} />
          {mat("Crankshaft", "#bac2c3")}
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const { x } = cylLayout(i)
          const f = (FIRE_DEG[i] * Math.PI) / 180
          return (
            <mesh
              key={i}
              position={[x, Math.cos(f) * 0.14, Math.sin(f) * 0.14]}
              {...pick("Crankshaft")}
            >
              <boxGeometry args={[0.1, 0.16, 0.2]} />
              {mat("Crankshaft", "#9aa4a5")}
            </mesh>
          )
        })}
        <mesh
          position={[-1.45 - e * 0.6, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          {...pick("Flywheel")}
        >
          <cylinderGeometry args={[0.42, 0.42, 0.16, 36]} />
          {mat("Flywheel", "#68767c")}
        </mesh>
      </group>
      {/* banks, pistons, rods, injectors, plugs */}
      {([1, -1] as const).map((s) => (
        <group key={s} rotation={[s * tilt, 0, 0]}>
          {/* cutaway bank: front/back plates + deck, bores stay visible */}
          {(
            [
              [0, 1.45 + e * 0.5, 0.28 + s * e * 0.2, 2.2, 1.15, 0.07],
              [0, 1.45 + e * 0.5, -0.28 - s * e * 0.2, 2.2, 1.15, 0.07],
              [0, 2.02 + e * 0.6, 0, 2.2, 0.09, 0.62],
            ] as const
          ).map(([x, y, z, w, h, d], k) => (
            <mesh
              key={k}
              position={[x, y, z]}
              {...pick(s > 0 ? "Cylinder bank L" : "Cylinder bank R")}
            >
              <boxGeometry args={[w, h, d]} />
              {mat(
                s > 0 ? "Cylinder bank L" : "Cylinder bank R",
                "#5d6f75",
              )}
            </mesh>
          ))}
          {BANK_X.map((x, k) => {
            const i = (s > 0 ? 0 : 3) + k
            const pname = `Piston ${i + 1}`
            return (
              <group key={x} position={[x, 0.5, 0]}>
                <mesh position={[0, 0.45, 0]} {...pick("Connecting rods")}>
                  <boxGeometry args={[0.09, 0.85, 0.09]} />
                  {mat("Connecting rods", "#a9b2b3")}
                </mesh>
                <group
                  ref={(g) => {
                    pistons.current[i] = g
                  }}
                  position={[0, 1.12, 0]}
                >
                  <mesh {...pick(pname)}>
                    <cylinderGeometry args={[0.21, 0.21, 0.3, 28]} />
                    {mat(pname, "#cfd6d7")}
                  </mesh>
                </group>
                <mesh
                  position={[0.22, 1.62 + e * 0.35, 0]}
                  rotation={[0, 0, -0.5]}
                  {...pick(`Fuel injector ${i + 1}`)}
                >
                  <coneGeometry args={[0.05, 0.22, 12]} />
                  {mat(`Fuel injector ${i + 1}`, "#c8b06a")}
                </mesh>
                <mesh
                  ref={(m) => {
                    pulses.current[i] = m
                  }}
                  position={[0, 1.78, 0]}
                >
                  <sphereGeometry args={[0.055, 12, 10]} />
                  <meshBasicMaterial color="#ff9a2e" />
                </mesh>
                <mesh
                  position={[-0.24, 1.7 + e * 0.35, 0]}
                  rotation={[0, 0, 0.4]}
                  {...pick("Spark plugs")}
                >
                  <cylinderGeometry args={[0.045, 0.045, 0.3, 10]} />
                  {mat("Spark plugs", "#eee9d9")}
                </mesh>
              </group>
            )
          })}
          <group
            ref={(g) => {
              cams.current[s > 0 ? 0 : 1] = g
            }}
            position={[0, 2.08 + e * 0.5, 0]}
          >
            <mesh
              rotation={[0, 0, Math.PI / 2]}
              {...pick(s > 0 ? "Camshaft L" : "Camshaft R")}
            >
              <cylinderGeometry args={[0.06, 0.06, 2.1, 16]} />
              {mat(s > 0 ? "Camshaft L" : "Camshaft R", "#8b9597")}
            </mesh>
          </group>
          <mesh
            position={[0, 1.66 + e * 0.7, 0.42]}
            rotation={[0, 0, Math.PI / 2]}
            {...pick(s > 0 ? "Fuel rail L" : "Fuel rail R")}
          >
            <cylinderGeometry args={[0.05, 0.05, 2.0, 12]} />
            {mat(s > 0 ? "Fuel rail L" : "Fuel rail R", "#7a6f4d")}
          </mesh>
        </group>
      ))}
      {/* intake manifold in the valley */}
      <mesh position={[0, 2.0 + e * 0.9, 0]} {...pick("Intake manifold")}>
        <boxGeometry args={[1.9, 0.28, 0.6]} />
        {mat("Intake manifold", "#46555b")}
      </mesh>
      {/* fuel pump + feed line, pulsing */}
      <group position={[1.55 + e * 0.5, 0.9, 0.85]}>
        <mesh {...pick("Fuel pump")}>
          <boxGeometry args={[0.34, 0.42, 0.34]} />
          {mat("Fuel pump", "#6b5a3e")}
        </mesh>
        <mesh ref={pumpPulse} position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshBasicMaterial color="#ff9a2e" />
        </mesh>
      </group>
      <mesh position={[0.8, 1.5, 0.72]} rotation={[0.5, 0, -0.9]}>
        <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
        <meshStandardMaterial color="#7a6f4d" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}
export function AdditionalMachine({
  machine,
  selected,
  select,
  exploded,
  isolated,
  design,
  running = true,
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
      <V6Engine
        selected={selected}
        select={select}
        exploded={exploded}
        isolated={isolated}
        running={running}
      />
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
