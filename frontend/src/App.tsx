import { useState, useEffect, Suspense, Component, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Grid,
} from "@react-three/drei"
import {
  Activity,
  Box,
  Layers,
  FileText,
  Package,
  Network,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Search,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  ScanLine,
  Download,
  Mic,
  Send,
  Check,
  Circle,
  X,
  Upload,
  Cpu,
  Radio,
  ShieldCheck,
  Move3D,
  Eye,
  AlertTriangle,
  Zap,
  BookOpen,
  Waves,
} from "lucide-react"
import "./index.css"
import EngineeringPanel, {
  createSession,
  propose,
  type Session,
} from "./features/engineering/EngineeringPanel"
import { calculate, MODEL_VERSION, type Inputs } from "./physics/models"
import { machines, AdditionalMachine, type MachineId } from "./machines"
import AssemblySim from "./sim/AssemblySim"
import { api, assistApi, draftApi, guideApi, invApi, visionApi, labelForCase, type Pack, type Trace, type GuideView, type InvPart, type InvOrder, type Draft, type AssistTurn, type SegmentResult } from "./api"

// Backend pack id -> geometry/physics family in this UI. 'engine' has no pack yet (In dev).
const PACK_GEOM: Record<string, MachineId> = {
  rig: "bearing",
  "cr-pump": "motor",
  "v6-engine": "engine",
}
const geomOf = (id: string): MachineId => PACK_GEOM[id] ?? "engine"
// Fuzzy match a 3D part label to a backend component name.
const matchComp = (pack: Pack | null, label: string) => {
  if (!pack) return undefined
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").trim()
  const n = norm(label)
  return pack.components.find((c) => norm(c.name) === n)
    ?? pack.components.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)))
}
const icons = [Box, FileText, Activity, Package, Network]
const nav = [
  "Workspace",
  "Blueprints",
  "Investigations",
  "Inventory",
  "Agent lab",
]
const steps = [
  "Inspect recording quality",
  "Retrieve technical context",
  "Analyze vibration spectrum",
  "Compare healthy reference",
  "Submit evidence-backed finding",
]
class SceneBoundary extends Component<{ children: ReactNode }, {
  failed: boolean
}> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="fallback">
        3D unavailable. Use the component list to explore the assembly.
      </div>
    ) : (
      this.props.children
    )
  }
}
function Machine({
  selected,
  select,
  exploded,
  isolated,
  design,
}: {
  selected: string
  select: (p: string) => void
  exploded: boolean
  isolated: boolean
  design: Inputs
}) {
  const metal = "#9da7ac",
    dark = "#455159"
  const offset = exploded ? 1 : 0
  const mat = (name: string, color: string) => (
    <meshStandardMaterial
      color={selected === name ? "#ccf884" : color}
      metalness={0.75}
      roughness={0.29}
    />
  )
  const cylinder = (
    name: string,
    x: number,
    r: number,
    len: number,
    color: string,
  ) => (
    <mesh
      key={name}
      position={[x, 1, 0]}
      rotation={[0, 0, Math.PI / 2]}
      visible={!isolated || selected === name}
      onClick={(e) => {
        e.stopPropagation()
        select(name)
      }}
    >
      <cylinderGeometry args={[r, r, len, 64]} />
      {mat(name, color)}
    </mesh>
  )
  return (
    <group rotation={[0, -0.23, 0]}>
      <mesh
        position={[-0.8, 0.13, 0]}
        onClick={() => select("Drive motor")}
        visible={!isolated || selected === "Drive motor"}
      >
        <boxGeometry args={[4.7, 0.25, 2.2]} />
        {mat("Drive motor", "#60696c")}
      </mesh>
      {[-2.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.38, 0.4, 1.5]} />
          <meshStandardMaterial color={dark} metalness={0.65} roughness={0.4} />
        </mesh>
      ))}
      {cylinder("Drive motor", -1.65, 0.87, 2.15, dark)}
      {Array.from({ length: 13 }, (_, i) =>
        cylinder("Drive motor", -2.62 + i * 0.16, 0.93, 0.055, "#667178"),
      )}
      {cylinder("Drive motor", -2.83, 0.83, 0.16, "#879196")}
      {cylinder(
        "Rig shaft",
        0.8 + offset * 0.4,
        0.19 * (design.kind === "bearing" ? design.diameter / 20 : 1),
        4.1 * (design.kind === "bearing" ? design.length / 200 : 1),
        metal,
      )}
      {cylinder("Bearing housing", 0.23 + offset * 0.4, 0.77, 0.36, "#738188")}
      <group
        position={[1.2 + offset * 1.2, 1, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        {["Outer ring (6203)", "Inner ring (6203)", "Cage"].map((p, i) => (
          <mesh
            key={p}
            position={[0, 0, i === 2 ? 0.12 : 0]}
            visible={!isolated || selected === p}
            onClick={(e) => {
              e.stopPropagation()
              select(p)
            }}
          >
            <torusGeometry
              args={
                i === 0
                  ? [0.67, 0.14, 20, 80]
                  : i === 1
                    ? [0.31, 0.12, 20, 80]
                    : [0.49, 0.033, 12, 64]
              }
            />
            {mat(p, i === 2 ? "#bba86b" : metal)}
          </mesh>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i * Math.PI) / 5) * 0.49,
              Math.sin((i * Math.PI) / 5) * 0.49,
              0,
            ]}
            visible={!isolated || selected === "Rolling elements (8x)"}
            onClick={(e) => {
              e.stopPropagation()
              select("Rolling elements (8x)")
            }}
          >
            <sphereGeometry args={[0.115, 20, 20]} />
            {mat("Rolling elements (8x)", "#d6dadc")}
          </mesh>
        ))}
      </group>
      {cylinder("Bearing housing", 2.2 + offset * 2, 0.74, 0.2, "#69767d")}
      <mesh position={[-1.6, 1.94, 0]} onClick={() => select("Drive motor")}>
        <boxGeometry args={[0.68, 0.35, 0.65]} />
        {mat("Drive motor", dark)}
      </mesh>
    </group>
  )
}
function Chart({
  kind = "Waveform",
  data = null,
}: {
  kind?: string
  data?: { x: number[]; y: number[]; targets?: Record<string, number> } | null
}) {
  const empty = !data || !data.y.length
  const stride = data ? Math.max(1, Math.floor(data.y.length / 660)) : 1
  const ys = data ? data.y.filter((_, i) => i % stride === 0) : []
  const xs = data ? data.x.filter((_, i) => i % stride === 0) : []
  const lo = empty ? 0 : Math.min(...ys)
  const hi = empty ? 1 : Math.max(...ys)
  const span = hi - lo || 1
  const points = ys
    .map((v, i) => `${(i / Math.max(1, ys.length - 1)) * 660},${100 - ((v - lo) / span) * 95}`)
    .join(" ")
  const xlo = xs.length ? xs[0] : 0
  const xhi = xs.length ? xs[xs.length - 1] : 1
  const xspan = xhi - xlo || 1
  const targets = data?.targets
    ? Object.entries(data.targets).map(([k, v]) => ({
        k,
        px: ((v - xlo) / xspan) * 660,
      }))
    : []
  return (
    <svg
      viewBox="0 0 660 105"
      preserveAspectRatio="none"
      className="chart"
      aria-label={empty ? `${kind}, no data` : `${kind}, measured data`}
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#b7e77e" stopOpacity=".18" />
          <stop offset="1" stopColor="#b7e77e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[20, 50, 80].map((y) => (
        <line
          key={y}
          x1="0"
          x2="660"
          y1={y}
          y2={y}
          stroke="#303638"
          strokeDasharray="3 5"
        />
      ))}
      {empty ? (
        <text x="330" y="55" fill="#8a9499" fontSize="11" textAnchor="middle">
          {kind === "Waveform"
            ? "Select a recording to load its waveform"
            : "Run an investigation, then open an evidence series"}
        </text>
      ) : (
        <>
          <polygon points={`0,105 ${points} 660,105`} fill="url(#fade)" />
          <polyline
            points={points}
            fill="none"
            stroke="#b7e77e"
            strokeWidth="1.3"
          />
          {targets.map((t) => (
            <line
              key={t.k}
              x1={t.px}
              x2={t.px}
              y1="0"
              y2="105"
              stroke="#e08a3c"
              strokeDasharray="4 3"
            />
          ))}
        </>
      )}
    </svg>
  )
}
export default function App({ visible = true }: { visible?: boolean }) {
  useEffect(() => {
    if (!visible) {
      setPlaying(false)
      setRunning(false)
      window.dispatchEvent(new Event("forma-workspace-hidden"))
    }
  }, [visible])
  const [machineId, setMachineId] = useState<string>("rig")
  const geom: MachineId = geomOf(machineId)
  const machine = machines[geom]
  const [packList, setPackList] = useState<
    { machine: string; name: string; kind: string; components: number }[]
  >([])
  const [pack, setPack] = useState<Pack | null>(null)
  const [packErr, setPackErr] = useState("")
  const parts = pack ? pack.components.map((c) => c.name) : machine.parts
  const [engineering, setEngineering] = useState<Record<MachineId, Session>>(
    () => ({
      bearing: createSession("bearing"),
      motor: createSession("motor"),
      engine: createSession("engine"),
    }),
  )
  const engineeringSession = engineering[geom]
  const updateEngineering = (session: Session) =>
    setEngineering((previous) => ({ ...previous, [geom]: session }))
  const speed = engineeringSession.applied.speed
  const engineeringStatus = calculate(engineeringSession.applied).status
  const [engineeringRequest, setEngineeringRequest] = useState("")
  const switchMachine = (id: string) => {
    setMachineId(id)
    const g = geomOf(id)
    setExploded(false)
    setIsolated(false)
    setPlaying(false)
    setRunning(false)
    setTrace(null)
    setLiveSteps([])
    setInvErr("")
    setReveal(null)
    setFrozen(false)
    setRevealed(false)
    setAnswer("")
    setSearch("")
    setEngineeringRequest("")
    setEngineering((previous) => ({
      ...previous,
      [g]: {
        ...previous[g],
        draft: { ...previous[g].applied },
        result: null,
        confirmation: false,
        message: "",
      },
    }))
    setView((v) => v + 1)
    if (id !== "engine") {
      setPackErr("")
      api.pack(id).then(
        (p) => {
          setPack(p)
          setSelected(p.components[0]?.name ?? machines[g].parts[0])
        },
        (e) => setPackErr(`Pack load failed: ${(e as Error).message}`),
      )
    } else {
      setPack(null)
      setSelected(machines[g].parts[0])
    }
  }
  const [page, setPage] = useState("Workspace"),
    [selected, setSelected] = useState("Outer ring (6203)"),
    [exploded, setExploded] = useState(false),
    [isolated, setIsolated] = useState(false),
    [load, setLoad] = useState(45),
    [playing, setPlaying] = useState(false),
    [tab, setTab] = useState("Waveform"),
    [step, setStep] = useState(-1),
    [running, setRunning] = useState(false),
    [caseId, setCaseId] = useState("Case 024 · Anonymous"),
    [frozen, setFrozen] = useState(false),
    [revealed, setRevealed] = useState(false),
    [modal, setModal] = useState(""),
    [search, setSearch] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [file, setFile] = useState(""),
    [view, setView] = useState(0)
  // ---- investigation backend state ----
  const [cases, setCases] = useState<string[]>([])
  const [caseIdx, setCaseIdx] = useState("")
  const [recordingId, setRecordingId] = useState("")
  const [recLabel, setRecLabel] = useState("")
  const [jobId, setJobId] = useState("")
  const [trace, setTrace] = useState<Trace | null>(null)
  const [liveSteps, setLiveSteps] = useState<Step[]>([])
  const [invErr, setInvErr] = useState("")
  const [reveal, setReveal] = useState<{
    frozen: string
    documented: string
    match: boolean | null
    note?: string
  } | null>(null)
  const [wave, setWave] = useState<{
    x: number[]
    y: number[]
    xlabel: string
    ylabel: string
  } | null>(null)
  const [evSeries, setEvSeries] = useState<{
    x: number[]
    y: number[]
    xlabel: string
    ylabel: string
    targets?: Record<string, number>
  } | null>(null)
  const [modalJson, setModalJson] = useState("")
  const [engineRun, setEngineRun] = useState(true)
  const [assistSession, setAssistSession] = useState<string | null>(null)
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistTurn, setAssistTurn] = useState<AssistTurn | null>(null)
  // ---- pack-builder (Blueprints page) ----
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftMsg, setDraftMsg] = useState("")
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftMachine, setDraftMachine] = useState("new-machine")
  const [draftTitle, setDraftTitle] = useState("")
  const [candEdits, setCandEdits] = useState<
    Record<string, { name: string; parent: string }>
  >({})
  const [newComp, setNewComp] = useState("")
  const [seg, setSeg] = useState<SegmentResult | null>(null)
  const [segMsg, setSegMsg] = useState("")
  // ---- inventory / guide (Inventory + Agent lab pages) ----
  const [invParts, setInvParts] = useState<InvPart[]>([])
  const [invMsg, setInvMsg] = useState("")
  const [order, setOrder] = useState<InvOrder | null>(null)
  const [cart, setCart] = useState<{ part: InvPart; qty: number }[]>([])
  const [guide, setGuide] = useState<GuideView | null>(null)
  const [guidePb, setGuidePb] = useState("")
  const [guideMsg, setGuideMsg] = useState("")
  useEffect(() => {
    api.packs().then(
      (r) => setPackList(r.packs),
      (e) => setPackErr(`Pack list failed: ${(e as Error).message}`),
    )
    api.cases().then(
      (r) => setCases(r.cases),
      (e) => setInvErr(`Case list failed: ${(e as Error).message}`),
    )
    api.pack("rig").then(
      (p) => {
        setPack(p)
        setSelected(p.components[3]?.name ?? p.components[0]?.name ?? "Outer ring (6203)")
      },
      (e) => setPackErr(`Pack load failed: ${(e as Error).message}`),
    )
  }, [])
  useEffect(() => {
    if (!running || !jobId) return
    let alive = true
    const poll = async () => {
      try {
        const s = await api.status(jobId)
        if (!alive) return
        if (s.steps) setLiveSteps(s.steps)
        if (s.state === "running") return
        setRunning(false)
        if (s.trace) setTrace(s.trace)
        else setInvErr(`Job ended: ${s.state}`)
      } catch (e) {
        if (alive) {
          setRunning(false)
          setInvErr(`Status failed: ${(e as Error).message}`)
        }
      }
    }
    void poll()
    const t = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [running, jobId])
  const start = () => {
    if (!recordingId) {
      setInvErr("Select a recording first.")
      return
    }
    setInvErr("")
    setTrace(null)
    setLiveSteps([])
    setReveal(null)
    setFrozen(false)
    setRevealed(false)
    api.investigate(recordingId, question || "What is the condition of the bearing?").then(
      (r) => {
        setJobId(r.job_id)
        setRunning(true)
      },
      (e) => setInvErr(`Investigation failed: ${(e as Error).message}`),
    )
  }
  const exportReport = () => {
    if (!trace) {
      setInvErr("Run an investigation first, then export its report.")
      return
    }
    api.report(trace.investigation_id).then(
      (r) => {
        const b = new Blob([JSON.stringify(r, null, 2)], {
          type: "application/json",
        })
        const u = URL.createObjectURL(b)
        const a = document.createElement("a")
        a.href = u
        a.download = `investigation-${trace.investigation_id}.json`
        a.click()
        URL.revokeObjectURL(u)
      },
      (e) => setInvErr(`Export failed: ${(e as Error).message}`),
    )
  }
  const changeCase = (idx: string) => {
    setCaseIdx(idx)
    setTrace(null)
    setLiveSteps([])
    setInvErr("")
    setReveal(null)
    setFrozen(false)
    setRevealed(false)
    setEvSeries(null)
    if (idx === "") return
    const c = cases[Number(idx)]
    setCaseId(labelForCase(c, Number(idx)))
    api.importCase(c).then(
      (imp) => {
        setRecordingId(imp.recording_id)
        setRecLabel(imp.display_label)
        api.waveform(imp.recording_id, 4000).then(
          (w) => {
            if (w && w.x && w.y) {
              setWave({ x: w.x, y: w.y, xlabel: w.xlabel, ylabel: w.ylabel })
            }
          },
          () => setWave(null),
        )
      },
      (e) => setInvErr(`Import failed: ${(e as Error).message}`),
    )
  }
  const showEvidence = (ev: string) => {
    if (!trace) return
    api.evidence(trace.investigation_id, ev).then(
      (d) => {
        setModalJson(JSON.stringify(d, null, 2))
        setModal(`Evidence: ${ev}`)
        if (d && d.x && d.y) {
          setEvSeries({
            x: d.x,
            y: d.y,
            xlabel: d.xlabel ?? "",
            ylabel: d.ylabel ?? "",
            targets: d.targets,
          })
          setTab("Spectrum")
        }
      },
      (e) => setInvErr(`Evidence failed: ${(e as Error).message}`),
    )
  }
  const freezeReveal = () => {
    if (!trace?.finding) return
    if (!frozen) {
      setFrozen(true)
      return
    }
    api.reveal(trace.investigation_id).then(
      (r) => {
        setReveal(r)
        setRevealed(true)
      },
      (e) => setInvErr(`Reveal failed: ${(e as Error).message}`),
    )
  }
  const onDraftUpload = (f: File | undefined) => {
    if (!f) return
    if (f.type !== "application/pdf") {
      setDraftMsg("Unsupported file. Select a PDF.")
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setDraftMsg("File exceeds 20 MB.")
      return
    }
    setDraftBusy(true)
    setDraftMsg(`Uploading ${f.name}…`)
    draftApi.upload(draftMachine, draftTitle || f.name, f).then(
      (d) => {
        setDraft(d)
        setCandEdits({})
        setDraftBusy(false)
        setDraftMsg(
          `Draft ${d.id}: ${d.assessment.n_candidates} candidates, score ${d.assessment.score}.`,
        )
      },
      (e) => {
        setDraftBusy(false)
        setDraftMsg(`Upload failed: ${(e as Error).message}`)
      },
    )
  }
  const onDraftReason = () => {
    if (!draft) return
    setDraftBusy(true)
    draftApi.reason(draft.id).then(
      (r) => {
        setDraftBusy(false)
        setDraft({ ...draft, review: r.review })
        setDraftMsg(
          r.auto_finalize
            ? "Agent verdict: enough — ready to finalize."
            : `Agent verdict: ${r.review?.verdict ?? "?"} (confidence ${r.review?.confidence ?? "?"})`,
        )
      },
      (e) => {
        setDraftBusy(false)
        setDraftMsg(`Agent reasoning failed: ${(e as Error).message}`)
      },
    )
  }
  const onDraftSave = () => {
    if (!draft) return
    const edits = Object.entries(candEdits).map(([id, v]) => ({
      id,
      name: v.name || undefined,
      parent: v.parent || null,
    }))
    const news = newComp
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }))
    setDraftBusy(true)
    draftApi.answer(draft.id, edits, news).then(
      (d) => {
        setDraft(d)
        setCandEdits({})
        setNewComp("")
        setDraftBusy(false)
        setDraftMsg("Answers saved.")
      },
      (e) => {
        setDraftBusy(false)
        setDraftMsg(`Save failed: ${(e as Error).message}`)
      },
    )
  }
  const onDraftFinalize = () => {
    if (!draft) return
    setDraftBusy(true)
    draftApi.finalize(draft.id).then(
      (r) => {
        setDraftBusy(false)
        setDraftMsg(
          `Finalized pack ${r.machine}: ${r.components} components. Reload packs from the machine picker.`,
        )
        api.packs().then((pl) => setPackList(pl.packs))
      },
      (e) => {
        setDraftBusy(false)
        setDraftMsg(`Finalize failed: ${(e as Error).message}`)
      },
    )
  }
  const onSegment = (f: File | undefined) => {
    if (!f) return
    setSegMsg("Segmenting…")
    setSeg(null)
    visionApi.segment(f).then(
      (r) => {
        setSeg(r)
        setSegMsg(
          `${r.regions.length} regions · ${r.device} · ${r.elapsed_ms} ms. Regions are triage only, not part IDs.`,
        )
      },
      (e) => setSegMsg(`Segmentation failed: ${(e as Error).message}`),
    )
  }
  const onInvSearch = () => {
    if (machineId === "engine") {
      setInvMsg("Inventory needs a packed machine.")
      return
    }
    invApi.search(machineId, search).then(
      (r) => {
        setInvParts(r.parts)
        setInvMsg(r.parts.length ? "" : "No matches.")
      },
      (e) => setInvMsg(`Search failed: ${(e as Error).message}`),
    )
  }
  const onOrderFlow = (step: "draft" | "confirm" | "submit") => {
    if (step === "draft") {
      if (!cart.length) {
        setInvMsg("Add parts to the cart first.")
        return
      }
      invApi
        .draft(
          machineId,
          cart.map((l) => ({ part_id: l.part.id, qty: l.qty })),
          null,
        )
        .then(setOrder, (e) => setInvMsg(`Draft failed: ${(e as Error).message}`))
    } else if (order && step === "confirm") {
      invApi
        .confirm(order.id)
        .then(setOrder, (e) => setInvMsg(`Confirm failed: ${(e as Error).message}`))
    } else if (order && step === "submit") {
      invApi
        .submit(order.id)
        .then(setOrder, (e) => setInvMsg(`Submit failed: ${(e as Error).message}`))
    }
  }
  const onGuideStart = () => {
    if (!guidePb) {
      setGuideMsg("Pick a playbook first.")
      return
    }
    guideApi.start(machineId, guidePb).then(setGuide, (e) =>
      setGuideMsg(`Guide failed: ${(e as Error).message}`),
    )
  }
  const onGuideAnswer = (result: "ok" | "bad", action: string) => {
    if (!guide?.current) return
    guideApi.answer(guide.id, result, "", action).then(setGuide, (e) =>
      setGuideMsg(`Answer failed: ${(e as Error).message}`),
    )
  }
  return (
    <div className="app">
      <aside className="rail">
        <div className="brandmark">
          <Layers size={25} />
        </div>
        <div className="railnav">
          {nav.map((n, i) => {
            const Icon = icons[i]
            return (
              <button
                key={n}
                className={page === n ? "railbtn active" : "railbtn"}
                onClick={() => setPage(n)}
                title={n}
                aria-label={n}
              >
                <Icon size={21} />
              </button>
            )
          })}
        </div>
        <button
          className="railbtn bottom"
          onClick={() => setModal("Capabilities & implementation")}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
        <div className="avatar">AK</div>
      </aside>
      <div className="appbody">
        <header>
          <div className="brand">
            FORMA<span>ENGINEERING WORKSPACE</span>
          </div>
          <div className="divider" />
          <div className="project">
            {pack ? pack.meta.name : machine.name} <ChevronDown size={14} />
          </div>
          <span className="demo">
            <i /> Live workspace
          </span>
          <div className="header-right">
            <a className="subtle" href="#introduction">
              Introduction <ArrowUpRight size={13} />
            </a>
            <button
              className="subtle"
              onClick={() => setModal("Capabilities & implementation")}
            >
              <BookOpen size={15} /> Documentation <ArrowUpRight size={13} />
            </button>
            <button className="btn" onClick={exportReport}>
              <Download size={14} /> Export report
            </button>
          </div>
        </header>
        <div className="pageheading">
          <div>
            <div className="eyebrow">
              PROJECT 001 <span>/</span> {page.toUpperCase()}
            </div>
            <h1>
              {page === "Workspace"
                ? "Understand every moving part."
                : page === "Blueprints"
                  ? "From drawing to assembly."
                  : page === "Inventory"
                    ? "Every part, accounted for."
                    : page === "Agent lab"
                      ? "Expertise, working together."
                      : "Follow the evidence."}
            </h1>
            <p>
              {page === "Workspace"
                ? "Explore your machine. Investigate anomalies. Make informed decisions."
                : "One connected workspace for your machine’s entire engineering journey."}
            </p>
          </div>
          <label className="machine-picker">
            <Box size={14} />
            <select
              aria-label="Select machine"
              value={machineId}
              onChange={(e) => switchMachine(e.target.value)}
            >
              {packList.map((p) => (
                <option key={p.machine} value={p.machine}>
                  {p.name} · {p.components} parts
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="workspace-tabs">
          {nav.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={page === n ? "selected" : ""}
            >
              {n}
            </button>
          ))}
          <span>
            <span className="statusdot" /> All changes in this session
          </span>
        </div>
        {page === "Workspace" ? (
          <div className="workgrid">
            <main>
              <div className="metrics">
                {[
                  [
                    "ROTATIONAL SPEED",
                    `${speed.toLocaleString()} rpm`,
                    "Nominal operating speed",
                  ],
                  ["APPLIED LOAD", `${load}%`, "Illustrative input"],
                  [
                    "ASSEMBLY",
                    `${parts.length} components`,
                    pack ? pack.meta.name : "Procedural model",
                  ],
                  [
                    "CONFIGURED LIMITS",
                    engineeringStatus,
                    "Simplified calculated model",
                  ],
                ].map(([a, b, c], i) => (
                  <div className="metric" key={a}>
                    <span>{a}</span>
                    <strong className={i === 3 ? "amber" : ""}>
                      {i === 3 && <span className="statusdot amber-bg" />}
                      {b}
                    </strong>
                    <small>{c}</small>
                  </div>
                ))}
              </div>
              <section className="viewport">
                <div className="viewport-top">
                  <div>
                    <Box size={16} />
                    <strong>Assembly explorer</strong>
                    <span className="tag">ILLUSTRATIVE 3D</span>
                  </div>
                  <button
                    className="iconbtn"
                    aria-label="Assembly controls"
                    onClick={() => setModal("Assembly controls")}
                  >
                    <Maximize size={16} />
                  </button>
                </div>
                <div className="scene">
                  <div className="scene-meta">
                    <span>{pack ? pack.meta.machine : machine.code} / REV 01</span>
                    <small>{pack ? pack.meta.name : machine.name}</small>
                  </div>
                  {pack && machineId !== "v6-engine" ? (
                    <AssemblySim
                      pack={pack}
                      machineId={machineId}
                      onSelect={(id) => {
                        const c =
                          pack.components.find((k) => k.id === id) ??
                          matchComp(pack, id)
                        if (c) {
                          setSelected(c.name)
                          setModal(`Component: ${c.name}`)
                        }
                      }}
                      labelFor={(id) =>
                        pack.components.find((k) => k.id === id)?.name ?? id
                      }
                      suspect={
                        trace?.finding
                          ? (matchComp(pack, trace.finding.component)?.id ??
                            null)
                          : null
                      }
                      selectedId={matchComp(pack, selected)?.id ?? null}
                    />
                  ) : (
                    <>
                      <SceneBoundary>
                        <Canvas
                          frameloop={visible ? "always" : "never"}
                          key={view}
                          camera={{ position: [6, 4.1, 6], fov: 38 }}
                        >
                          <ambientLight intensity={1.2} />
                          <directionalLight
                            position={[2, 7, 4]}
                            intensity={3}
                          />
                          <directionalLight
                            position={[-5, 3, -2]}
                            intensity={2}
                          />
                          <Suspense fallback={null}>
                            {geom === "bearing" ? (
                              <Machine
                                selected={selected}
                                select={setSelected}
                                exploded={exploded}
                                isolated={isolated}
                                design={engineeringSession.applied}
                              />
                            ) : (
                              <AdditionalMachine
                                machine={geom}
                                selected={selected}
                                select={setSelected}
                                exploded={exploded}
                                isolated={isolated}
                                design={engineeringSession.applied}
                                running={engineRun}
                              />
                            )}
                            <ContactShadows
                              position={[0, -0.015, 0]}
                              opacity={0.45}
                              scale={14}
                              blur={2}
                              far={5}
                            />
                          </Suspense>
                          <Grid
                            position={[0, -0.02, 0]}
                            args={[18, 18]}
                            cellSize={0.5}
                            cellThickness={0.5}
                            cellColor="#303638"
                            sectionSize={2.5}
                            sectionColor="#41494b"
                            fadeDistance={18}
                          />
                          <OrbitControls
                            makeDefault
                            autoRotate={playing}
                            autoRotateSpeed={speed / 1500}
                            minDistance={4}
                            maxDistance={15}
                            target={[0, 0.8, 0]}
                          />
                        </Canvas>
                      </SceneBoundary>
                      <div className="component-float">
                        <span className="statusdot" />
                        <div>
                          <strong>{selected}</strong>
                          <small>{machine.name}</small>
                        </div>
                        <ChevronRight size={14} />
                      </div>
                      <div className="axis">
                        <span>Y</span>
                        <i /> <b>X</b>
                        <em>Z</em>
                      </div>
                      <div className="scene-hint">
                        Drag to orbit <span>·</span> Scroll to zoom <span>·</span>{" "}
                        Click to inspect
                      </div>
                    </>
                  )}
                </div>
                {(!pack || machineId === "v6-engine") && (
                  <div className="view-tools">
                    <div>
                      <button
                        className={exploded ? "tool on" : "tool"}
                        onClick={() => setExploded(!exploded)}
                      >
                        <Layers size={15} /> Explode
                      </button>
                      <button
                        className={isolated ? "tool on" : "tool"}
                        onClick={() => setIsolated(!isolated)}
                      >
                        <ScanLine size={15} /> Isolate
                      </button>
                      <button
                        className="tool"
                        onClick={() => {
                          setExploded(false)
                          setIsolated(false)
                          setView((v) => v + 1)
                        }}
                      >
                        <RotateCcw size={14} /> Reset view
                      </button>
                      {machineId === "v6-engine" && (
                        <button
                          className={engineRun ? "tool on" : "tool"}
                          onClick={() => setEngineRun(!engineRun)}
                        >
                          {engineRun ? (
                            <Pause size={14} />
                          ) : (
                            <Play size={14} />
                          )}{" "}
                          {engineRun ? "Stop engine" : "Run engine"}
                        </button>
                      )}
                    </div>
                    <button
                      className="tool"
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
                      {playing ? "Stop auto-orbit" : "Auto-orbit"}
                    </button>
                  </div>
                )}
              </section>
              <EngineeringPanel
                key={geom}
                machine={geom}
                session={engineeringSession}
                update={updateEngineering}
                inspect={(part) => {
                  if (parts.includes(part)) {
                    setSelected(part)
                    setIsolated(false)
                  }
                }}
                request={engineeringRequest}
                setRequest={setEngineeringRequest}
              />
              <section className="bottom-grid">
                <div className="panel components">
                  <div className="section-title">
                    <span>
                      <Layers size={15} /> Components
                    </span>
                    <small>
                      {String(parts.length).padStart(2, "0")}
                      {packErr ? ` · ${packErr}` : ""}
                    </small>
                  </div>
                  {parts.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setSelected(p)
                        setModal(`Component: ${p}`)
                      }}
                      className={selected === p ? "part selected-part" : "part"}
                    >
                      <Box size={13} />
                      <span>{p}</span>
                      <Eye size={12} />
                    </button>
                  ))}
                </div>
                <div className="panel evidence">
                  <div className="section-title">
                    <span>
                      <Activity size={15} /> Signal evidence
                    </span>
                    <span className="tag">
                      {tab === "Waveform"
                        ? wave
                          ? "MEASURED RECORDING"
                          : "NO RECORDING"
                        : evSeries
                          ? "AGENT EVIDENCE"
                          : "NO EVIDENCE OPEN"}
                    </span>
                  </div>
                  <div className="charttabs">
                    {["Waveform", "Spectrum", "Envelope"].map((t) => (
                      <button
                        className={tab === t ? "current" : ""}
                        onClick={() => setTab(t)}
                        key={t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="plotlabel">
                    <span>
                      {tab === "Waveform"
                        ? (wave?.ylabel ?? "Amplitude")
                        : (evSeries?.ylabel ?? "Magnitude")}
                    </span>
                    <small>
                      {tab === "Waveform"
                        ? (recLabel || "no recording loaded")
                        : "open an evidence chip from the finding"}
                    </small>
                  </div>
                  <Chart
                    kind={tab}
                    data={tab === "Waveform" ? wave : evSeries}
                  />
                  {trace?.evidence && (
                    <div className="charttabs">
                      {Object.keys(trace.evidence)
                        .slice(0, 6)
                        .map((ev) => (
                          <button key={ev} onClick={() => showEvidence(ev)}>
                            {ev}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </section>
            </main>
            <aside className="investigator">
              <div className="agent-heading">
                <div className="agent-logo">
                  <Network size={21} />
                </div>
                <div>
                  <strong>Investigation copilot</strong>
                  <small>
                    <i /> Live supervisor + specialists
                  </small>
                </div>
                <button
                  className="iconbtn"
                  aria-label="Agent information"
                  onClick={() => setModal("Agent implementation")}
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="agent-content">
                <div className="section-label">INVESTIGATION CONTEXT</div>
                {machineId === "engine" && (
                  <div className="machine-notice">
                    {machine.name}: <strong>In dev</strong> — no machine pack
                    yet. Engineering experiments below the assembly still work;
                    switch to a packed machine to investigate.
                  </div>
                )}
                <label className="selectlabel">
                  Recording
                  <select
                    disabled={machineId === "engine"}
                    value={caseIdx}
                    onChange={(e) => changeCase(e.target.value)}
                  >
                    <option value="">Select a recording…</option>
                    {cases.map((c, i) => (
                      <option key={c} value={String(i)}>
                        {labelForCase(c, i)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="record-info">
                  <Waves size={17} />
                  <div>
                    <strong>{recLabel || "No recording selected"}</strong>
                    <small>
                      {recLabel
                        ? "Measured recording · label hidden until reveal"
                        : "Bundled Paderborn cases · anonymized"}
                    </small>
                  </div>
                  <ShieldCheck size={15} />
                </div>
                {invErr && <div className="machine-notice">{invErr}</div>}
                <div className="agent-note">
                  <Zap size={16} />
                  <p>
                    Your machine, in context.
                    <br />
                    <span>
                      Explore the evidence behind every finding, down to the
                      individual component.
                    </span>
                  </p>
                </div>
                <button
                  className="startbtn"
                  disabled={machineId === "engine"}
                  onClick={running ? () => setRunning(false) : start}
                >
                  {running ? <Pause size={15} /> : <Play size={15} />}{" "}
                  {running
                    ? "Stop investigation"
                    : trace
                      ? "Run new investigation"
                      : "Start investigation"}
                  <span>↗</span>
                </button>
                <div className="stephead">
                  <span>{liveSteps.length ? "AGENT STEPS" : "INVESTIGATION PLAN"}</span>
                  <span>
                    {liveSteps.length
                      ? `${liveSteps.length} steps`
                      : `0${Math.max(0, step + 1)} / 05`}
                  </span>
                </div>
                <div className="steps">
                  {liveSteps.length
                    ? liveSteps.map((s, i) => (
                        <button
                          key={i}
                          className={`step ${s.status === "success" ? "complete" : ""}`}
                          onClick={() => {
                            if (s.artifacts?.length) showEvidence(s.artifacts[0])
                          }}
                        >
                          <span className="stepicon">
                            {s.status === "success" ? (
                              <Check size={12} />
                            ) : (
                              <span>{i + 1}</span>
                            )}
                          </span>
                          <div>
                            <strong>
                              {s.type === "tool" ? s.tool : "note"} ·{" "}
                              {s.status ?? "done"}
                            </strong>
                            <small>{s.summary ?? s.text ?? ""}</small>
                          </div>
                        </button>
                      ))
                    : steps.map((s, i) => (
                        <button key={s} className="step">
                          <span className="stepicon">
                            <span>{i + 1}</span>
                          </span>
                          <div>
                            <strong>{s}</strong>
                            <small>
                              {
                                [
                                  "Validate metadata & signal integrity",
                                  "Review approved machine context",
                                  "Inspect time and frequency features",
                                  "Check comparable operating conditions",
                                  "Connect findings to machine components",
                                ][i]
                              }
                            </small>
                          </div>
                        </button>
                      ))}
                </div>
                {trace && (
                  <div className="finding">
                    <strong>
                      {trace.finding
                        ? trace.finding.hypothesis
                        : `Incomplete: ${trace.incomplete_reason ?? "unknown"}`}
                    </strong>
                    {trace.finding && (
                      <p>
                        Suspect: {trace.finding.component}.{" "}
                        {trace.finding.reasoning.slice(0, 220)}
                      </p>
                    )}
                    {trace.finding && (
                      <button
                        className="textbtn"
                        onClick={() => {
                          const c = matchComp(
                            pack,
                            trace.finding?.component ?? "",
                          )
                          if (c) setSelected(c.name)
                          const first = trace.finding?.evidence_ids[0]
                          if (first) showEvidence(first)
                        }}
                      >
                        Inspect supporting evidence <ArrowUpRight size={12} />
                      </button>
                    )}
                    {trace.evidence && (
                      <div className="charttabs">
                        {Object.keys(trace.evidence).map((ev) => (
                          <button key={ev} onClick={() => showEvidence(ev)}>
                            {ev}
                          </button>
                        ))}
                      </div>
                    )}
                    {trace.finding && (
                      <button className="btn" onClick={freezeReveal}>
                        {frozen
                          ? "Reveal documented fault"
                          : "Freeze conclusion"}
                      </button>
                    )}
                    {revealed && reveal && (
                      <small>
                        Frozen: {reveal.frozen} · Documented:{" "}
                        {reveal.documented} ·{" "}
                        {reveal.match === null
                          ? "no ground truth"
                          : reveal.match
                            ? "MATCH"
                            : "MISMATCH"}
                      </small>
                    )}
                  </div>
                )}
                <div className="parameter-box">
                  <div className="section-label">
                    APPLIED ENGINEERING INPUTS{" "}
                    <span>REVIEW BELOW ASSEMBLY</span>
                  </div>
                  <label>
                    Rotational speed{" "}
                    <b>
                      {speed} <small>rpm</small>
                    </b>
                    <input
                      type="range"
                      aria-label="Propose rotational speed"
                      min="0"
                      max="12000"
                      step="50"
                      value={
                        Number.isFinite(engineeringSession.draft.speed)
                          ? engineeringSession.draft.speed
                          : 0
                      }
                      onChange={(e) =>
                        updateEngineering({
                          ...engineeringSession,
                          draft: {
                            ...engineeringSession.draft,
                            speed: +e.target.value,
                          },
                          result: null,
                          confirmation: false,
                          message:
                            "Speed draft changed. Calculate and apply in the engineering sandbox.",
                        })
                      }
                    />
                  </label>
                  <label>
                    Visual load indicator{" "}
                    <b>
                      {load}
                      <small> %</small>
                    </b>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={load}
                      onChange={(e) => setLoad(+e.target.value)}
                    />
                  </label>
                  <p>
                    Load percentage is visual only and not used in equations.
                    Speed changes are drafts until calculated and applied.
                  </p>
                </div>
              </div>
              <div className="composer">
                {answer && <p className="response">{answer}</p>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const q = question
                    updateEngineering(propose(engineeringSession, q))
                    setEngineeringRequest(q)
                    setQuestion("")
                    if (machineId === "engine") {
                      setAnswer(
                        "Local command assistant: review the proposed change in the engineering sandbox. Live assistant needs a packed machine.",
                      )
                      return
                    }
                    setAssistBusy(true)
                    assistApi.send(machineId, q, assistSession, null, null).then(
                      (t) => {
                        setAssistTurn(t)
                        setAssistSession(t.session)
                        setAssistBusy(false)
                        const cites = t.chat.citations
                          .map((c) => ` [${c.file}]`)
                          .join("")
                        setAnswer(`${t.reply}${cites}`)
                      },
                      (err) => {
                        setAssistBusy(false)
                        setAnswer(
                          `Assistant unavailable: ${(err as Error).message}. The engineering sandbox proposal above still stands.`,
                        )
                      },
                    )
                  }}
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What if I increase speed by 20%?"
                    aria-label="Ask about machine"
                  />
                  <div>
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => {
                        document
                          .querySelector(".engineering")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                        setAnswer(
                          "Use the optional microphone in the engineering sandbox. Browser speech may use the browser vendor’s servers; typed commands work identically.",
                        )
                      }}
                      aria-label="Voice setup"
                    >
                      <Mic size={15} />
                    </button>
                    <span>
                      {assistBusy
                        ? "Specialists thinking…"
                        : assistTurn
                          ? `Via ${assistTurn.specialists.join(", ") || "supervisor"}`
                          : "Context-aware, evidence-first"}
                    </span>
                    <button className="send" aria-label="Send question">
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </form>
              </div>
            </aside>
          </div>
        ) : (
          <div className="secondary">
            <div className="secondary-head">
              <div>
                <span className="eyebrow">CONNECTED ENGINEERING</span>
                <h2>{page}</h2>
              </div>
              <span className="tag">INTERACTIVE PROTOTYPE</span>
            </div>
            {page === "Blueprints" ? (
              <div className="twocol">
                <section className="panel largepanel">
                  <FileText size={30} />
                  <h2>Bring your machine into view.</h2>
                  <p>
                    Upload a manual or blueprint PDF. The pack-builder extracts
                    component candidates, an agent reasons whether they suffice
                    for a 3D assembly, and you confirm before it finalizes.
                  </p>
                  <label className="dimension">
                    Machine id
                    <input
                      type="text"
                      value={draftMachine}
                      onChange={(e) => setDraftMachine(e.target.value)}
                    />
                  </label>
                  <label className="dimension">
                    Title
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="upload">
                    <Upload size={24} />
                    <strong>Select a blueprint PDF</strong>
                    <span>PDF · maximum 20 MB · stays on this machine</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => onDraftUpload(e.target.files?.[0])}
                    />
                  </label>
                  {draftMsg && <p>{draftMsg}</p>}
                  {draft && (
                    <>
                      <p>
                        <strong>{draft.title}</strong> · status {draft.status} ·
                        score {draft.assessment.score} ·{" "}
                        {draft.assessment.with_pos} with positions
                        {draft.assessment.has_exploded
                          ? " · exploded view found"
                          : ""}
                        {draft.assessment.has_steps ? " · has steps" : ""}
                      </p>
                      <div className="charttabs">
                        <button onClick={onDraftReason} disabled={draftBusy}>
                          Ask agent
                        </button>
                        <button onClick={onDraftSave} disabled={draftBusy}>
                          Save answers
                        </button>
                        <button onClick={onDraftFinalize} disabled={draftBusy}>
                          Finalize pack
                        </button>
                      </div>
                      {draft.review && (
                        <p>
                          Agent: {draft.review.verdict} (
                          {draft.review.confidence}) — {draft.review.summary}
                        </p>
                      )}
                      {(draft.review?.questions ?? draft.assessment.questions)
                        .length > 0 && (
                        <p>
                          Open questions:{" "}
                          {(
                            draft.review?.questions ??
                            draft.assessment.questions
                          ).join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </section>
                <section className="panel largepanel blueprint">
                  <span className="tag">
                    {draft
                      ? `DRAFT ${draft.id} — CONFIRM EACH CANDIDATE`
                      : "NO DRAFT YET — UPLOAD A PDF"}
                  </span>
                  {draft ? (
                    <>
                      {draft.candidates.slice(0, 12).map((c) => (
                        <label key={c.id} className="dimension">
                          {c.name}
                          {c.pos ? ` (${c.pos})` : ""} · ×{c.mentions}
                          <input
                            type="text"
                            placeholder="Corrected name"
                            value={candEdits[c.id]?.name ?? ""}
                            onChange={(e) =>
                              setCandEdits({
                                ...candEdits,
                                [c.id]: {
                                  name: e.target.value,
                                  parent: candEdits[c.id]?.parent ?? "",
                                },
                              })
                            }
                          />
                          <input
                            type="text"
                            placeholder="Parent id"
                            value={candEdits[c.id]?.parent ?? c.parent ?? ""}
                            onChange={(e) =>
                              setCandEdits({
                                ...candEdits,
                                [c.id]: {
                                  name: candEdits[c.id]?.name ?? "",
                                  parent: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                      <label className="dimension">
                        Add missing components (one name per line)
                        <textarea
                          rows={2}
                          value={newComp}
                          onChange={(e) => setNewComp(e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <p>
                      Candidates appear here for human confirmation before the
                      pack finalizes.
                    </p>
                  )}
                  <h3>Photo segmentation (triage)</h3>
                  <label className="upload">
                    <Upload size={24} />
                    <strong>Select a machine photo</strong>
                    <span>Local SAM2 · regions are not part IDs</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onSegment(e.target.files?.[0])}
                    />
                  </label>
                  {segMsg && <p>{segMsg}</p>}
                  {seg && (
                    <img
                      src={`data:image/png;base64,${seg.overlay_b64}`}
                      alt="Segmentation overlay"
                      style={{ maxWidth: "100%" }}
                    />
                  )}
                </section>
              </div>
            ) : page === "Inventory" ? (
              <>
                <div className="searchbox">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onInvSearch()
                    }}
                    placeholder="Search catalog… (Enter)"
                  />
                  <button className="btn" onClick={onInvSearch}>
                    Search
                  </button>
                </div>
                {invMsg && <div className="notice">{invMsg}</div>}
                <div className="inventory-grid">
                  {(invParts.length
                    ? invParts
                    : pack?.components.slice(0, 12).map((c) => ({
                        id: c.id,
                        name: c.name,
                        sku: c.pos ?? "—",
                        unit_price: 0,
                        currency: "",
                        stock_qty: -1,
                        lead_days: 0,
                      })) ?? []
                  ).map((p, i) => (
                    <button
                      className="panel inventory-card"
                      key={p.id}
                      onClick={() => {
                        if (p.stock_qty < 0) {
                          setSelected(p.name)
                          setModal(`Component: ${p.name}`)
                        } else {
                          setCart((prev) => {
                            const line = prev.find(
                              (l) => l.part.id === p.id,
                            )
                            if (line)
                              return prev.map((l) =>
                                l.part.id === p.id
                                  ? { ...l, qty: l.qty + 1 }
                                  : l,
                              )
                            return [...prev, { part: p, qty: 1 }]
                          })
                        }
                      }}
                    >
                      <div className="part-art">
                        <Box size={50} strokeWidth={0.8} />
                      </div>
                      <span className="eyebrow">COMPONENT / 00{i + 1}</span>
                      <h3>{p.name}</h3>
                      <div>
                        <span className={p.stock_qty === 0 ? "amber" : ""}>
                          {p.stock_qty < 0
                            ? "Catalog entry unknown — search to check stock"
                            : p.stock_qty === 0
                              ? "Out of stock"
                              : `In stock · ${p.stock_qty} units · $${p.unit_price.toFixed(2)}`}
                        </span>
                        <ArrowUpRight size={15} />
                      </div>
                      <small>
                        {p.stock_qty < 0
                          ? "Tap to inspect · search adds to cart"
                          : `${p.sku} · ${p.lead_days}d lead · tap to add · sandbox, no real order`}
                      </small>
                    </button>
                  ))}
                </div>
                {(cart.length > 0 || order) && (
                  <section className="panel largepanel">
                    <h3>
                      Order {order ? `${order.id} · ${order.status}` : "(cart)"}
                    </h3>
                    {(order?.lines ?? cart).map((l) => (
                      <p key={"part_id" in l ? l.part_id : l.part.id}>
                        {"part_id" in l
                          ? `${l.name} × ${l.qty} — $${(l.qty * l.unit_price).toFixed(2)}`
                          : `${l.part.name} × ${l.qty} — $${(l.qty * l.part.unit_price).toFixed(2)}`}
                      </p>
                    ))}
                    {order && <p>Total ${order.total.toFixed(2)}</p>}
                    {order?.confirmation && <p>{order.confirmation}</p>}
                    <div className="charttabs">
                      {!order && (
                        <button onClick={() => onOrderFlow("draft")}>
                          Draft order
                        </button>
                      )}
                      {order?.status === "draft" && (
                        <button onClick={() => onOrderFlow("confirm")}>
                          Confirm
                        </button>
                      )}
                      {order?.status === "confirmed" && (
                        <button onClick={() => onOrderFlow("submit")}>
                          Submit (sandbox)
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </>
            ) : page === "Agent lab" ? (
              <>
                <div className="notice">
                  <Network size={18} />
                  <span>
                    Supervisor plus vision, sound, and chat specialists — live
                    via the workspace composer. One shared evidence record.
                    {assistTurn
                      ? ` Last turn used: ${assistTurn.specialists.join(", ") || "supervisor"}.`
                      : " Ask anything in the workspace composer to consult them."}
                  </span>
                </div>
                <div className="inventory-grid">
                  {[
                    "Investigation coordinator",
                    "Signal analyst",
                    "Documentation specialist",
                    "Assembly engineer",
                    "Inventory planner",
                    "Design reviewer",
                  ].map((a, i) => (
                    <button
                      className="panel agentcard"
                      key={a}
                      onClick={() => setModal(a)}
                    >
                      <div className="agent-logo">
                        {i === 1 ? (
                          <Activity size={23} />
                        ) : (
                          <Network size={23} />
                        )}
                      </div>
                      <h3>{a}</h3>
                      <p>
                        {
                          [
                            "Coordinates bounded tools and validates findings.",
                            "Runs validated numerical tests, never arbitrary code.",
                            "Retrieves approved excerpts with source locations.",
                            "Connects components, dimensions and assembly constraints.",
                            "Checks availability and compatible configurations.",
                            "Reviews supported equations and flags assumptions.",
                          ][i]
                        }
                      </p>
                      <span className="tag">
                        {["LIVE", "LIVE", "LIVE", "LIVE", "LIVE", "IN DEV"][i]}
                      </span>
                    </button>
                  ))}
                </div>
                <section className="panel largepanel">
                  <h3>Guided checks</h3>
                  <p>
                    The supervisor walks a playbook check by check: answer OK or
                    bad, and it branches or hands off.
                  </p>
                  <label className="selectlabel">
                    Playbook
                    <select
                      value={guidePb}
                      onChange={(e) => setGuidePb(e.target.value)}
                    >
                      <option value="">Select a playbook…</option>
                      {(pack?.playbooks ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.symptom} · {p.checks} checks
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="charttabs">
                    <button onClick={onGuideStart}>Start guide</button>
                  </div>
                  {guideMsg && <p>{guideMsg}</p>}
                  {guide?.current && (
                    <>
                      <p>
                        <strong>{guide.current.ask}</strong>
                      </p>
                      {guide.current.how && <p>{guide.current.how}</p>}
                      {guide.current.expect_ok && (
                        <p>Expect when OK: {guide.current.expect_ok}</p>
                      )}
                      <div className="charttabs">
                        <button onClick={() => onGuideAnswer("ok", "continue")}>
                          OK
                        </button>
                        <button onClick={() => onGuideAnswer("bad", "continue")}>
                          Bad
                        </button>
                      </div>
                    </>
                  )}
                  {guide?.done && (
                    <p>
                      Done: {guide.outcome ?? "finished"}
                      {guide.remedy ? ` — ${guide.remedy}` : ""}
                    </p>
                  )}
                </section>
                <button
                  className="btn"
                  onClick={() => setModal("Voice & mobile connection (In dev)")}
                >
                  <Mic size={15} /> Voice & mobile setup
                </button>
              </>
            ) : (
              <>
                <div className="notice">
                  <ShieldCheck size={18} />
                  <span>
                    Measured bundled recordings. Ground-truth labels remain
                    hidden until you freeze a conclusion.
                  </span>
                </div>
                <section className="panel largepanel">
                  <h3>Upload a CSV recording</h3>
                  <p>
                    One vibration column, with sampling rate, unit, and speed.
                    Malformed or unsupported files are rejected explicitly.
                  </p>
                  <label className="upload">
                    <Upload size={24} />
                    <strong>Select CSV</strong>
                    <span>csv · documented metadata required</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        void f.text().then(
                          (txt) => {
                            const fs = Number(
                              window.prompt("Sampling rate (Hz)?", "64000"),
                            )
                            const unit =
                              window.prompt("Unit (g, m/s2, mm/s)?", "g") ?? "g"
                            const rpm = Number(
                              window.prompt("Speed (rpm)?", "1500"),
                            )
                            if (!fs || !rpm) {
                              setInvErr("Upload needs numeric fs and rpm.")
                              return
                            }
                            api.upload(f.name, txt, fs, unit, rpm).then(
                              (imp) => {
                                setRecordingId(imp.recording_id)
                                setRecLabel(imp.display_label)
                                setTrace(null)
                                setLiveSteps([])
                                setPage("Workspace")
                                api.waveform(imp.recording_id, 4000).then(
                                  (w) => {
                                    if (w && w.x && w.y)
                                      setWave({
                                        x: w.x,
                                        y: w.y,
                                        xlabel: w.xlabel,
                                        ylabel: w.ylabel,
                                      })
                                  },
                                  () => setWave(null),
                                )
                              },
                              (err) =>
                                setInvErr(
                                  `Upload failed: ${(err as Error).message}`,
                                ),
                            )
                          },
                          () => setInvErr("Could not read file."),
                        )
                      }}
                    />
                  </label>
                </section>
                {cases.map((c, i) => (
                  <button
                    className="case panel"
                    key={c}
                    onClick={() => {
                      if (machineId === "engine") switchMachine("rig")
                      changeCase(String(i))
                      setPage("Workspace")
                    }}
                  >
                    <div className="agent-logo">
                      <Waves size={22} />
                    </div>
                    <div>
                      <h3>{labelForCase(c, i)}</h3>
                      <p>Measured vibration recording · anonymized</p>
                    </div>
                    <span className="tag">READY TO INVESTIGATE</span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        <footer>
          <span>
            <span className="statusdot" /> Local-first workspace{" "}
            <span className="footersep">/</span>{" "}
            {packList.length ? "Backend connected" : "Connecting…"}
          </span>
          <span>
            Illustrative geometry. Measured evidence. Human judgment required.{" "}
            <ShieldCheck size={12} />
          </span>
        </footer>
      </div>
      {modal && (
        <div className="modalback" onClick={() => setModal("")}>
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setModal("")}
          >
            <button
              autoFocus
              className="iconbtn close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            <div className="agent-logo">
              <Cpu size={24} />
            </div>
            <h2>{modal}</h2>
            {modal.startsWith("Evidence") ? (
              <>
                <p>
                  Live tool output from the investigation agent. Series (if
                  any) also plotted on the Spectrum tab.
                </p>
                <pre>{modalJson || "No payload."}</pre>
              </>
            ) : modal.includes("Component:") ? (
              <>
                {(() => {
                  const c = matchComp(pack, modal.replace("Component: ", ""))
                  if (!c)
                    return (
                      <p>
                        {selected} · illustrative {machine.name.toLowerCase()}.
                        No pack entry (In-dev machine).
                      </p>
                    )
                  return (
                    <>
                      <p>
                        <strong>{c.name}</strong>
                        {c.pos ? ` · Pos. ${c.pos}` : ""} · Ref {c.service_ref}
                      </p>
                      <p>{c.role}</p>
                      {(c.failure_modes?.length ?? 0) > 0 && (
                        <p>
                          <strong>Known failure modes.</strong>{" "}
                          {c.failure_modes?.join("; ")} ({c.failure_source})
                        </p>
                      )}
                    </>
                  )
                })()}
                <button
                  className="startbtn"
                  onClick={() => {
                    setPage("Workspace")
                    setModal("")
                  }}
                >
                  Inspect in assembly <ArrowUpRight size={15} />
                </button>
              </>
            ) : (
              <>
                <p>
                  Connected to the local investigation backend: measured
                  recordings, a bounded agent (8 tool calls, timeout, evidence
                  validation, explicit abstention), approved documentation, and
                  server-side credentials. Deterministic simplified engineering
                  calculations stay in the engineering sandbox and are not
                  evidence.
                </p>
                <h3>Still in dev</h3>
                <p className="muted">
                  Phone pairing and live voice need a later integration; typed
                  commands and the optional browser microphone work now. No API
                  credentials are requested or stored by this UI.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
