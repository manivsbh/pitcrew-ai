import { useEffect, useRef, useState } from "react"
import { initAssembly, type AssemblyHandle, type RenderSkill } from "./assembly"
import type { Pack, PackScenario } from "../api"

interface VerifyResult {
  round: number
  score: number
  issues: string[]
  changes: { pos: string; verdict: string }[]
  skills_added: string[]
  sam_regions: number
  response_id: string | null
  again: boolean
  reverted?: boolean
}
type VerifyState =
  | { status: "idle" }
  | { status: "running"; round: number }
  | ({ status: "done" } & VerifyResult)
  | { status: "error"; message: string }

/** Mounts the verified simulation engine: sheet / assemble / run / fault / CAD wireframe. */
export default function AssemblySim({
  pack,
  machineId,
  onSelect,
  labelFor,
  suspect,
  selectedId,
  scales,
  stepPlacedIds,
  stepHighlightId,
  externalExplode,
  externalFaultId,
  onFaultChange,
}: {
  pack: Pack
  machineId: string
  onSelect: (id: string) => void
  labelFor: (id: string) => string
  suspect: string | null
  selectedId: string | null
  scales: { bore: number; stroke: number; shaft: number }
  stepPlacedIds?: string[] | null
  stepHighlightId?: string | null
  externalExplode?: number | null
  externalFaultId?: string | null
  onFaultChange?: (id: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<AssemblyHandle | null>(null)
  const [layout, setLayoutState] = useState<"assembled" | "sheet">("assembled")
  const [running, setRunning] = useState(false)
  const [isolated, setIsolatedState] = useState(false)
  const [wireframe, setWireframeState] = useState(false)
  const [faultId, setFaultId] = useState("")
  const [caption, setCaption] = useState("")
  const [hiddenParts, setHiddenParts] = useState<string[]>([])
  const [skills, setSkills] = useState<RenderSkill[]>([])
  const [live, setLive] = useState<Pack>(pack)
  const [check, setCheck] = useState<VerifyState>({ status: "idle" })
  const [showDrawing, setShowDrawing] = useState(false)
  const pendingRound = useRef(0)
  const scenarios: PackScenario[] = pack.scenarios ?? []
  const steps = live.assembly?.order ?? []
  const hasDrawing = !!live.meta.drawing?.image

  useEffect(() => {
    setLive(pack)
    setCheck({ status: "idle" })
    pendingRound.current = 0
  }, [pack])

  useEffect(() => {
    fetch("/api/render-skills")
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((b: { skills?: RenderSkill[] }) => setSkills(b.skills ?? []))
      .catch(() => setSkills([]))
  }, [pack])

  const runVerify = async (round: number) => {
    const h = handle.current
    if (!h) return
    setCheck({ status: "running", round })
    try {
      const r = await fetch(`/api/packs/${machineId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: h.captureSideView(), round }),
      })
      const res = (await r.json()) as VerifyResult & { error?: string }
      if (!r.ok || res.error) throw new Error(res.error ?? String(r.status))
      setCheck({ status: "done", ...res })
      if (res.changes.length || res.skills_added.length || res.reverted) {
        pendingRound.current = res.again ? round + 1 : 0
        const fresh = (await (await fetch(`/api/packs/${machineId}`)).json()) as Pack
        if (res.skills_added.length) {
          const sk = (await (await fetch("/api/render-skills")).json()) as { skills?: RenderSkill[] }
          setSkills(sk.skills ?? [])
        }
        setLive(fresh)
      }
    } catch (e) {
      setCheck({ status: "error", message: (e as Error).message })
    }
  }

  useEffect(() => {
    if (!hasDrawing) return
    const round = pendingRound.current || (live.verification ? 0 : 1)
    if (!round) return
    pendingRound.current = 0
    const t = window.setTimeout(() => void runVerify(round), 2200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, hasDrawing])

  useEffect(() => {
    if (!host.current) return
    const h = initAssembly(host.current, {
      onSelect: (id) => {
        picked.current = true
        onSelect(id)
      },
      labelFor,
      machine: machineId,
      components: live.components,
      kind: live.meta.kind,
      scales,
      drawing: live.meta.drawing ?? null,
      skills,
    })
    handle.current = h
    setLayoutState("assembled")
    setRunning(false)
    setWireframeState(false)
    setFaultId(scenarios[0]?.id ?? "")
    const cov = h.getCoverage()
    setHiddenParts(cov?.hidden ?? [])
    setCaption(
      cov?.sources
        ? `Built from the drawing — ${cov.total - (cov.hidden?.length ?? 0)}/${cov.total} parts placed; ` +
          `shapes: ${cov.sources.model} from the model, ${cov.sources.skill} from skills, ${cov.sources.rules} from name rules.`
        : cov
          ? `Schematic model — ${cov.matched}/${cov.total} parts matched to asset templates.` +
            (cov.unclassified.length
              ? ` Needs drawings: ${cov.unclassified.slice(0, 4).join(", ")}${cov.unclassified.length > 4 ? ` +${cov.unclassified.length - 4} more` : ""}.`
              : " All parts classified.")
          : "",
    )
    return () => {
      h.dispose()
      handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId, live, skills])

  useEffect(() => {
    handle.current?.setSuspect(suspect)
    if (suspect) handle.current?.setExplode(0.85)
  }, [suspect])

  const loadSelection = useRef<string | null>(null)
  const picked = useRef(false)
  useEffect(() => {
    loadSelection.current = selectedId
    picked.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId, pack])
  useEffect(() => {
    if (selectedId !== loadSelection.current) picked.current = true
    if (selectedId) handle.current?.select(selectedId)
  }, [selectedId])

  useEffect(() => {
    if (typeof externalExplode === "number") {
      handle.current?.setExplode(externalExplode)
    }
  }, [externalExplode])

  useEffect(() => {
    if (stepPlacedIds) {
      handle.current?.stepTo(stepPlacedIds, stepHighlightId ?? null)
    }
  }, [stepPlacedIds, stepHighlightId])

  useEffect(() => {
    handle.current?.setDesign(scales)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scales.bore, scales.stroke, scales.shaft])

  const current =
    scenarios.find((s) => s.id === faultId) ?? scenarios[0] ?? null
  const applyFault = (id: string, emit = true) => {
    setFaultId(id)
    const sc = scenarios.find((s) => s.id === id) ?? scenarios[0] ?? null
    if (!sc) return
    handle.current?.setFault(sc.parts, sc.wobble)
    handle.current?.setSpinSpeed(sc.slow)
    setCaption(
      `${sc.label}: ${sc.note} Output ${Math.round(sc.slow * 100)}% speed${sc.illustrative ? " (illustrative)." : "."}`,
    )
    if (emit) onFaultChange?.(id)
  }

  useEffect(() => {
    if (externalFaultId) {
      applyFault(externalFaultId, false)
      handle.current?.setRun(true)
      setRunning(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFaultId])
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
              : `Assembled in ${n} steps${pack.assembly?.source === "manual" ? " from the manual sequence." : " (structural order — not a manual procedure)."}`,
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
  const toggleIsolate = () => {
    if (isolated) {
      setIsolatedState(false)
      handle.current?.setIsolated(null)
      setCaption("Isolation cleared.")
    } else if (selectedId && picked.current) {
      setIsolatedState(true)
      handle.current?.setIsolated(selectedId)
      setCaption(`Isolated ${labelFor(selectedId)}. Show all to return.`)
    } else {
      setCaption("Select a component first, then isolate it.")
    }
  }
  const toggleWireframe = () => {
    const next = !wireframe
    setWireframeState(next)
    handle.current?.setWireframe(next)
    setCaption(
      next
        ? "Blueprint CAD wireframe shader active — inspect internal clearances."
        : "Studio PBR material shader restored.",
    )
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
        <button
          className="btn"
          aria-pressed={isolated}
          onClick={toggleIsolate}
        >
          {isolated ? "Show all" : "Isolate"}
        </button>
        <button
          className="btn"
          aria-pressed={wireframe}
          onClick={toggleWireframe}
        >
          {wireframe ? "Shaded" : "Blueprint CAD"}
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
        {hasDrawing && (
          <>
            <button className="btn" aria-pressed={showDrawing} onClick={() => setShowDrawing((v) => !v)}>
              {showDrawing ? "Hide drawing" : "Compare drawing"}
            </button>
            <button className="btn" disabled={check.status === "running"} onClick={() => void runVerify(1)}>
              {check.status === "running" ? `Verifying (round ${check.round})…` : "Verify again"}
            </button>
          </>
        )}
      </div>
      {showDrawing && hasDrawing && (
        <img className="sim-drawing" src={`/api/packs/${machineId}/drawing`} alt="Source drawing" />
      )}
      {check.status !== "idle" && (
        <p className="muted sim-verify" aria-live="polite">
          <span className="tag">Meta vision check</span>{" "}
          {check.status === "running" && `Round ${check.round}: SAM 2.1 segments the drawing, muse-spark-1.3 compares it with this render…`}
          {check.status === "done" &&
            `Round ${check.round}: score ${check.score}/5 · ` +
              (check.reverted
                ? "score dropped, kept the previous layout"
                : `${check.changes.length} fix${check.changes.length === 1 ? "" : "es"}`) +
              ` · ${check.sam_regions} drawing regions` +
              (check.skills_added.length ? ` · ${check.skills_added.length} new skill${check.skills_added.length === 1 ? "" : "s"}` : "") +
              (check.issues.length ? ` — ${check.issues.slice(0, 2).join("; ")}` : "")}
          {check.status === "error" && `Could not verify: ${check.message}`}
        </p>
      )}
      {caption && (
        <p className="muted" aria-live="polite">
          {caption}
        </p>
      )}
      {hiddenParts.length > 0 && (
        <p className="muted sim-hidden" title={hiddenParts.join(", ")}>
          <span className="tag">Not located in drawing ({hiddenParts.length})</span>{" "}
          {hiddenParts.slice(0, 6).join(", ")}
          {hiddenParts.length > 6 ? ` +${hiddenParts.length - 6} more` : ""}. Shown in Parts sheet and inventory.
        </p>
      )}
    </div>
  )
}
