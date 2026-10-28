import { useEffect, useRef, useState } from "react"
import { initAssembly, type AssemblyHandle } from "./assembly"
import type { Pack, PackScenario } from "../api"

/** Mounts the verified simulation engine: sheet / assemble / run / fault. */
export default function AssemblySim({
  pack,
  machineId,
  onSelect,
  labelFor,
  suspect,
}: {
  pack: Pack
  machineId: string
  onSelect: (id: string) => void
  labelFor: (id: string) => string
  suspect: string | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<AssemblyHandle | null>(null)
  const [layout, setLayoutState] = useState<"assembled" | "sheet">("assembled")
  const [running, setRunning] = useState(false)
  const [faultId, setFaultId] = useState("")
  const [caption, setCaption] = useState("")
  const scenarios: PackScenario[] = pack.scenarios ?? []
  const steps = pack.assembly?.order ?? []

  useEffect(() => {
    if (!host.current) return
    const h = initAssembly(host.current, {
      onSelect,
      labelFor,
      machine: machineId,
      components: pack.components,
    })
    handle.current = h
    setLayoutState("assembled")
    setRunning(false)
    setFaultId(scenarios[0]?.id ?? "")
    setCaption("")
    return () => {
      h.dispose()
      handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId])

  useEffect(() => {
    handle.current?.setSuspect(suspect)
    if (suspect) handle.current?.setExplode(0.85)
  }, [suspect])

  const current =
    scenarios.find((s) => s.id === faultId) ?? scenarios[0] ?? null
  const applyFault = (id: string) => {
    setFaultId(id)
    const sc = scenarios.find((s) => s.id === id) ?? scenarios[0] ?? null
    if (!sc) return
    handle.current?.setFault(sc.parts, sc.wobble)
    handle.current?.setSpinSpeed(sc.slow)
    setCaption(
      `${sc.label}: ${sc.note} Output ${Math.round(sc.slow * 100)}% speed${sc.illustrative ? " (illustrative)." : "."}`,
    )
  }
  const setLayout = (l: "assembled" | "sheet") => {
    handle.current?.setLayout(l)
    setLayoutState(l)
    setCaption(
      l === "sheet"
        ? `Parts sheet — ${pack.components.length} components laid out before assembly.`
        : "Assembled.",
    )
  }
  const assemble = () => {
    if (!steps.length) {
      setCaption("No assembly sequence for this machine.")
      return
    }
    setLayoutState("assembled")
    let done = false
    void handle
      .current?.assemble(
        steps.map((s) => s.parts),
        (k, n) => {
          setCaption(
            k < n
              ? `Step ${k + 1}/${n}: ${steps[k].caption}`
              : `Assembled in ${n} steps from the manual sequence.`,
          )
          if (k >= n) done = true
        },
      )
      .then(() => {
        if (!done) setCaption("Assembly interrupted.")
      })
  }
  const toggleRun = () => {
    const next = !running
    setRunning(next)
    handle.current?.setRun(next)
    if (current) applyFault(current.id)
  }

  return (
    <div className="simwrap">
      <div ref={host} className="simhost" />
      <div className="sim-row" role="group" aria-label="Simulation">
        <div className="seg" role="group" aria-label="Layout">
          <button
            aria-pressed={layout === "assembled"}
            onClick={() => setLayout("assembled")}
          >
            Assembled
          </button>
          <button
            aria-pressed={layout === "sheet"}
            onClick={() => setLayout("sheet")}
          >
            Parts sheet
          </button>
        </div>
        <button className="btn" onClick={assemble} disabled={!steps.length}>
          Assemble
        </button>
        <button
          className="btn"
          aria-pressed={running}
          onClick={toggleRun}
        >
          {running ? "Stop" : "Run"}
        </button>
        <label className="sim-fault">
          Fault
          <select
            aria-label="Fault scenario"
            value={current?.id ?? ""}
            onChange={(e) => applyFault(e.target.value)}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {caption && (
        <p className="muted" aria-live="polite">
          {caption}
        </p>
      )}
    </div>
  )
}
