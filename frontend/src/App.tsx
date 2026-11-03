import { useState, useEffect } from "react"
import { PitCrewMark } from "./PitCrewMark"
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
  Maximize,
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
  Smartphone,
  QrCode,
} from "lucide-react"
import "./index.css"
import EngineeringPanel, {
  createSession,
  propose,
  type Session,
} from "./features/engineering/EngineeringPanel"
import { calculate, MODEL_VERSION, type Inputs } from "./physics/models"
import { machines, geomOfKind, scalesFor, type MachineId } from "./machines"
import AssemblySim from "./sim/AssemblySim"
import { useVoiceInput, speakText } from "./features/engineering/useVoiceInput"
import { useAcousticCapture } from "./features/engineering/useAcousticCapture"
import {
  AgentLabHub,
  AssemblyGuidePanel,
  RepairKitCard,
  fetchDemoFile,
} from "./HackathonPanels"
import {
  MobileFieldView,
  MobilePairingModal,
  detectInitialMobileMode,
  resolveInitialRoomId,
  useRoomSync,
} from "./MobileCompanion"
import {
  api,
  assistApi,
  draftApi,
  figureApi,
  figurePage,
  guideApi,
  harnessApi,
  invApi,
  mobileApi,
  visionApi,
  labelForCase,
  type Pack,
  type Trace,
  type TraceSummary,
  type DemoAsset,
  type RepairKit,
  type GuideView,
  type InvPart,
  type InvOrder,
  type Draft,
  type AssistTurn,
  type FigureEntry,
  type FigureJob,
  type SegmentResult,
  type Step,
} from "./api"

// Physics family resolves from the pack's classified kind, so new PDF
// machines work with no per-machine UI code.
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
      setRunning(false)
      window.dispatchEvent(new Event("forma-workspace-hidden"))
    }
  }, [visible])
  const [machineId, setMachineId] = useState<string>("rig")
  const [packList, setPackList] = useState<
    { machine: string; name: string; kind: string; components: number }[]
  >([])
  const [pack, setPack] = useState<Pack | null>(null)
  const geom: MachineId = geomOfKind(
    pack?.meta.kind ?? packList.find((p) => p.machine === machineId)?.kind ?? "",
  )
  const machine = machines[geom]
  const [packErr, setPackErr] = useState("")
  const [figures, setFigures] = useState<FigureEntry[]>([])
  const [figJobId, setFigJobId] = useState<string | null>(null)
  const [figJob, setFigJob] = useState<FigureJob | null>(null)
  const [figRunning, setFigRunning] = useState(false)
  const [figMsg, setFigMsg] = useState("")
  const [figView, setFigView] = useState<"3d" | "figure">("3d")
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
    const g = geomOfKind(
      packList.find((p) => p.machine === id)?.kind ?? "",
    )
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
    setPackErr("")
    api.pack(id).then(
      (p) => {
        setPack(p)
        setSelected(p.components[0]?.name ?? machines[g].parts[0])
        setCopilotSuspect(null)
        setCopilotExplode(null)
        const dims = p.meta.dimensions
        if (dims && Object.keys(dims).length > 0) {
          const gKind = geomOfKind(p.meta.kind ?? "")
          setEngineering((prev) => {
            const cur = prev[gKind]
            const patched: Record<string, any> = { ...cur.applied }
            if (gKind === "engine") {
              if (dims.bore_mm) patched.bore = dims.bore_mm
              if (dims.stroke_mm) patched.stroke = dims.stroke_mm
              if (dims.cylinders) patched.cylinders = Math.round(dims.cylinders)
            } else if (dims.shaft_diameter_mm) {
              patched.diameter = dims.shaft_diameter_mm
            }
            if (dims.rated_rpm) patched.speed = dims.rated_rpm
            return {
              ...prev,
              [gKind]: {
                ...cur,
                applied: patched as Inputs,
                draft: patched as Inputs,
                message: "Loaded physical dimensions from blueprint pack.",
              },
            }
          })
        }
      },
      (e) => setPackErr(`Pack load failed: ${(e as Error).message}`),
    )
  }
  const [page, setPage] = useState("Workspace"),
    [selected, setSelected] = useState("Outer ring (6203)"),
    [load, setLoad] = useState(45),
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
    [file, setFile] = useState("")
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
  const [assistSession, setAssistSession] = useState<string | null>(null)
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistTurn, setAssistTurn] = useState<AssistTurn | null>(null)
  const [invMode, setInvMode] = useState<"v2" | "v1">("v2")
  const [savedTraces, setSavedTraces] = useState<TraceSummary[]>([])
  const [demoAssets, setDemoAssets] = useState<DemoAsset[]>([])
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [attachedPhoto, setAttachedPhoto] = useState<File | null>(null)
  const [attachedWav, setAttachedWav] = useState<File | null>(null)
  const [copilotSuspect, setCopilotSuspect] = useState<string | null>(null)
  const [copilotExplode, setCopilotExplode] = useState<number | null>(null)
  const [distillMsg, setDistillMsg] = useState("")
  const [invKit, setInvKit] = useState<RepairKit | null>(null)
  const [roomId] = useState<string>(resolveInitialRoomId)
  const [mobileMode, setMobileMode] = useState<boolean>(detectInitialMobileMode)
  const [pairingOpen, setPairingOpen] = useState<boolean>(false)
  const [dockTab, setDockTab] = useState<"copilot" | "investigate" | "all">("copilot")
  const [syncedFaultId, setSyncedFaultId] = useState<string | null>(null)
  const [syncedStepPlaced, setSyncedStepPlaced] = useState<string[] | null>(null)
  const [syncedStepHighlight, setSyncedStepHighlight] = useState<string | null>(null)
  const [syncedMaskB64, setSyncedMaskB64] = useState<string | null>(null)
  const acoustic = useAcousticCapture()
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
    figureApi.index().then(
      (r) => setFigures(r.figures),
      () => {},
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
    api.traces().then(
      (r) => setSavedTraces(r.traces),
      () => {},
    )
    api.demoAssets().then(
      (r) => setDemoAssets(r.assets),
      () => {},
    )
  }, [])
  useEffect(() => {
    if (page === "Inventory" && pack) {
      invApi.search(machineId, search).then(
        (r) => setInvParts(r.parts),
        () => {},
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, machineId, pack])
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
        if (s.trace) {
          setTrace(s.trace)
          api.traces().then((r) => setSavedTraces(r.traces), () => {})
        } else setInvErr(`Job ended: ${s.state}`)
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
  useEffect(() => {
    if (!figRunning || !figJobId) return
    let alive = true
    const poll = async () => {
      try {
        const s = await figureApi.status(figJobId)
        if (!alive) return
        setFigJob(s)
        if (s.state === "verifying" || s.state === "eval") return
        setFigRunning(false)
        figureApi.index().then((r) => setFigures(r.figures))
        if (s.state === "eval_pass") setFigMsg("Eval passed — review the verdict, then approve.")
        else setFigMsg(`Figure job ended: ${s.state}`)
      } catch (e) {
        if (alive) {
          setFigRunning(false)
          setFigMsg(`Figure status failed: ${(e as Error).message}`)
        }
      }
    }
    void poll()
    const t = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [figRunning, figJobId])
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
    setDistillMsg("")
    api
      .investigate(
        recordingId,
        question || "What is the condition of the bearing?",
        invMode,
        machineId,
      )
      .then(
        (r) => {
          setJobId(r.job_id)
          setRunning(true)
        },
        (e) => setInvErr(`Investigation failed: ${(e as Error).message}`),
      )
  }
  const replaySavedTrace = (invId: string) => {
    if (!invId) return
    setInvErr("")
    setReveal(null)
    setFrozen(false)
    setRevealed(false)
    setDistillMsg("")
    api.trace(invId).then(
      (t) => {
        setTrace(t)
        setLiveSteps(t.steps ?? [])
        setRecordingId(t.recording_id)
        setRecLabel(`Saved trace ${t.investigation_id} (${t.mode ?? "v1"})`)
        api.waveform(t.recording_id, 4000).then(
          (w) => {
            if (w && w.x && w.y) {
              setWave({ x: w.x, y: w.y, xlabel: w.xlabel, ylabel: w.ylabel })
            }
          },
          () => {},
        )
        const firstEv = t.finding?.evidence_ids?.[0] ?? Object.keys(t.evidence ?? {})[0]
        if (firstEv) {
          api.evidence(t.investigation_id, firstEv).then(
            (d) => {
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
            () => {},
          )
        }
      },
      (e) => setInvErr(`Replay failed: ${(e as Error).message}`),
    )
  }
  const handleTurnActions = (t: AssistTurn) => {
    if (t.acoustic_series && t.acoustic_series.x?.length) {
      setEvSeries({
        x: t.acoustic_series.x,
        y: t.acoustic_series.y,
        xlabel: t.acoustic_series.xlabel,
        ylabel: t.acoustic_series.ylabel,
        targets: (t.sound as any)?.targets,
      })
      setTab("Spectrum")
    }
    for (const act of t.ui_actions ?? []) {
      if (act.type === "focus_component" && act.payload?.component_id) {
        const cid = String(act.payload.component_id)
        setCopilotSuspect(cid)
        if (typeof act.payload.explode === "number") {
          setCopilotExplode(act.payload.explode)
        }
        const comp = pack?.components.find((c) => c.id === cid)
        if (comp) setSelected(comp.name)
      } else if (act.type === "propose_physics" && act.payload?.patch) {
        setEngineering((prev) => {
          const cur = prev[geom]
          const nextDraft = { ...cur.applied, ...act.payload.patch } as Inputs
          return {
            ...prev,
            [geom]: {
              ...cur,
              draft: nextDraft,
              result: calculate(nextDraft),
              confirmation: true,
              message: `Design Reviewer proposed ${JSON.stringify(act.payload.patch)}. Click Apply to commit.`,
            },
          }
        })
      }
    }
    if ((t.vision as any)?.overlay_b64) {
      setSyncedMaskB64((t.vision as any).overlay_b64)
    }
  }
  const applyIncomingTurn = (t: AssistTurn) => {
    setAssistTurn(t)
    setAssistSession(t.session)
    const cites = (t.chat?.citations ?? []).map((c) => ` [${c.file}]`).join("")
    setAnswer(`${t.reply}${cites}`)
    handleTurnActions(t)
  }
  const roomSync = useRoomSync(roomId, mobileMode ? "mobile" : "desktop", (evt) => {
    const p = evt.payload ?? {}
    if (evt.type === "peer_joined") {
      roomSync.flashBanner(
        `Mobile companion connected (${p.device || "Field Device"}) · Room ${roomId}`,
      )
    } else if (evt.type === "machine_switched" && p.machine && p.machine !== machineId) {
      switchMachine(String(p.machine))
      roomSync.flashBanner(`Synced active machine → ${p.machine}`)
    } else if (evt.type === "field_capture" && p.turn) {
      if (p.machine && p.machine !== machineId) switchMachine(String(p.machine))
      setPage("Workspace")
      setDockTab("copilot")
      setSyncedStepPlaced(null)
      setSyncedStepHighlight(null)
      applyIncomingTurn(p.turn as AssistTurn)
      roomSync.flashBanner(
        `Live Mobile Capture synced${p.has_audio ? " · 5s FFT" : ""}${p.has_photo ? " · SAM 2.1 Mask" : ""}`,
      )
    } else if (evt.type === "focus_component" && p.component_id) {
      setPage("Workspace")
      setCopilotSuspect(String(p.component_id))
      setCopilotExplode(typeof p.explode === "number" ? p.explode : 0.8)
      roomSync.flashBanner(`Mobile focused 3D component: ${p.component_id}`)
    } else if (evt.type === "fault_scenario" && p.scenario_id) {
      setPage("Workspace")
      setSyncedFaultId(String(p.scenario_id))
      roomSync.flashBanner(`Mobile triggered 3D fault scenario: ${p.scenario_id}`)
    } else if (evt.type === "assembly_grounded" && p.guide) {
      setPage("Workspace")
      setDockTab("copilot")
      const g = p.guide
      if (g.overlay_b64) setSyncedMaskB64(g.overlay_b64)
      if (g.steps?.[0]) {
        setSyncedStepPlaced(g.steps[0].parts)
        setSyncedStepHighlight(g.steps[0].component_id)
      }
      roomSync.flashBanner(`Mobile SAM 2.1 Assembly Guide synced (${g.steps?.length ?? 0} steps)`)
    } else if (evt.type === "assembly_step" && Array.isArray(p.placed_ids)) {
      setPage("Workspace")
      setSyncedStepPlaced(p.placed_ids)
      setSyncedStepHighlight(p.highlight_id ?? null)
      roomSync.flashBanner(`Mobile ${p.caption || "Assembly step synced"}`)
    } else if (evt.type === "order_updated" && p.order) {
      setOrder(p.order)
      roomSync.flashBanner(`Mobile confirmed Repair PO #${p.order.confirmation ?? p.order.id}`)
    } else if (evt.type === "repair_kit_drafted" && p.kit) {
      setPage("Workspace")
      setDockTab("copilot")
      setCopilotSuspect(p.kit.suspect_component)
      setAssistTurn((prev) =>
        prev
          ? { ...prev, suspect_component: p.kit.suspect_component, repair_kit: p.kit }
          : ({
              session: assistSession ?? "sync",
              reply: `Mobile drafted Repair Kit for **${p.kit.suspect_component}**.`,
              specialists: ["inventory_procurement"],
              vision: null,
              sound: null,
              chat: { answer: "", citations: [], citations_dropped: 0 },
              playbook: null,
              next_checks: [],
              needs: [],
              usage: { input_tokens: 0, output_tokens: 0 },
              session_usage: { input_tokens: 0, output_tokens: 0 },
              suspect_component: p.kit.suspect_component,
              repair_kit: p.kit,
            } as AssistTurn),
      )
      roomSync.flashBanner(`Mobile drafted Repair Kit for ${p.kit.suspect_component}`)
    } else if (evt.type === "harness_distilled") {
      setDistillMsg(`Mobile Distilled (${p.version}): ${p.lesson}`)
      roomSync.flashBanner(`Technician teardown lesson distilled into Harness² (${p.version})`)
    }
  })
  const submitCopilotTurn = (
    overrideMsg?: string,
    overrideWav?: File | null,
    overridePhoto?: File | null,
  ) => {
    const q = (overrideMsg ?? question).trim() || "Diagnose this machine condition and check repair stock."
    const wavFile = overrideWav !== undefined ? overrideWav : attachedWav
    const photoFile = overridePhoto !== undefined ? overridePhoto : attachedPhoto
    updateEngineering(propose(engineeringSession, q))
    setEngineeringRequest(q)
    setQuestion("")
    setAttachedPhoto(null)
    setAttachedWav(null)
    if (!pack) {
      setAnswer(
        "Local command assistant: review the proposed change in the engineering sandbox. Live assistant needs a packed machine.",
      )
      return
    }
    setAssistBusy(true)
    setDockTab("copilot")
    mobileApi
      .capture(roomId, machineId, q, assistSession, photoFile, wavFile, speed, "desktop")
      .then(
        (t) => {
          setAssistBusy(false)
          applyIncomingTurn(t)
          speakText(t.reply, ttsEnabled)
        },
        (err) => {
          setAssistBusy(false)
          setAnswer(
            `Assistant unavailable: ${(err as Error).message}. The engineering sandbox proposal above still stands.`,
          )
        },
      )
  }
  const voice = useVoiceInput(machineId, (spoken) => {
    setQuestion(spoken)
    submitCopilotTurn(spoken)
  })
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
    const okExt = /\.(pdf|png|jpg|jpeg|webp)$/i.test(f.name)
    if (!okExt) {
      setDraftMsg("Unsupported file. Select a PDF or 2D blueprint image (.png, .jpg, .webp).")
      return
    }
    if (f.size > 30 * 1024 * 1024) {
      setDraftMsg("File exceeds 30 MB.")
      return
    }
    setDraftBusy(true)
    setDraftMsg(`Uploading ${f.name}…`)
    draftApi.upload(draftMachine, draftTitle || f.name, f).then(
      (d) => {
        setDraft(d)
        setCandEdits({})
        setDraftBusy(false)
        const dimNote =
          d.dimensions && Object.keys(d.dimensions).length
            ? ` · dimensions: ${Object.entries(d.dimensions)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}`
            : ""
        setDraftMsg(
          `Draft ${d.id} (${d.source_kind ?? "pdf"}): ${d.assessment.n_candidates} candidates, score ${d.assessment.score}${dimNote}.`,
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
        setDraft(r.draft ?? { ...draft, review: r.review })
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
  const refreshFigures = () =>
    figureApi.index().then(
      (r) => setFigures(r.figures),
      (e) => setFigMsg(`Figure list failed: ${(e as Error).message}`),
    )
  const onFigureCreate = (machine: string) => {
    setFigMsg("Writing spec…")
    figureApi.create(machine).then(
      (r) => {
        setFigJobId(r.job_id)
        setFigJob({ state: r.state, machine: r.machine, gates: [], attempts: 0 })
        setFigMsg(`Spec written for ${machine}. Author the build, then submit.`)
        refreshFigures()
      },
      (e) => setFigMsg(`Figure start failed: ${(e as Error).message}`),
    )
  }
  const onFigureResume = (entry: FigureEntry) => {
    if (!entry.job_id) return
    setFigMsg(`Resuming job ${entry.job_id}…`)
    setFigJob(null)
    setFigJobId(entry.job_id)
    setFigRunning(true)
  }
  const onFigureSubmit = () => {
    if (!figJobId) return
    setFigRunning(true)
    figureApi.submit(figJobId).then(
      () => setFigMsg("Verifying build, then running the eval gate…"),
      (e) => {
        setFigRunning(false)
        setFigMsg(`Submit failed: ${(e as Error).message}`)
      },
    )
  }
  const onFigureApprove = () => {
    if (!figJobId) return
    figureApi.approve(figJobId).then(
      (r) => {
        setFigJob((j) => (j ? { ...j, state: r.state } : j))
        setFigMsg(`Figure published for ${r.machine}. See the Workspace Figure tab.`)
        refreshFigures()
      },
      (e) => setFigMsg(`Approve failed: ${(e as Error).message}`),
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
    if (!pack) {
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
  const figEntry = figures.find((f) => f.machine === machineId && f.status === "published")
  const figPage = figurePage(figEntry)
  const showFigure = figView === "figure" && !!figPage
  if (mobileMode) {
    return (
      <MobileFieldView
        roomId={roomId}
        machineId={machineId}
        pack={pack}
        packList={packList}
        demoAssets={demoAssets}
        speed={speed}
        assistSession={assistSession}
        latestTurn={assistTurn}
        suspectId={copilotSuspect}
        externalFaultId={syncedFaultId}
        syncWsLive={roomSync.wsLive}
        syncBanner={roomSync.banner}
        onSwitchMachine={switchMachine}
        onTurnReceived={applyIncomingTurn}
        onFaultScenarioSelected={setSyncedFaultId}
        onBroadcast={roomSync.broadcast}
        onExitMobileMode={() => setMobileMode(false)}
      />
    )
  }
  const railLabels = ["Studio", "Drawings", "Cases", "Inventory", "Agents"]
  return (
    <div className="app">
      <aside className="rail">
        <div className="brandmark" title="PITCREW.AI — Giving Heavy Machinery a Brain">
          <PitCrewMark size={27} />
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
                <Icon size={20} />
                <span className="raillabel">{railLabels[i]}</span>
              </button>
            )
          })}
        </div>
        <button
          className="railbtn bottom"
          onClick={() => setPairingOpen(true)}
          title="Pair Mobile Field Companion (QR)"
          aria-label="Pair Mobile Field Companion"
        >
          <QrCode size={19} />
          <span className="raillabel">Mobile</span>
        </button>
        <button
          className="railbtn"
          onClick={() => setModal("Capabilities & implementation")}
          aria-label="Settings"
        >
          <Settings size={19} />
        </button>
        <div className="avatar">AK</div>
      </aside>
      <div className="appbody">
        <header>
          <div className="brand pitcrew-brand">
            <div className="brand-title">
              PITCREW<span className="voltage-badge">⚡ AI</span>
            </div>
            <span className="brand-tagline">GIVING HEAVY MACHINERY A BRAIN</span>
          </div>
          <div className="divider" />
          <div className="project">
            {pack ? pack.meta.name : machine.name} <ChevronDown size={14} />
          </div>
          <button
            type="button"
            className={`mobile-pair-pill ${roomSync.mobilePeers.length > 0 ? "synced" : ""}`}
            onClick={() => setPairingOpen(true)}
          >
            <QrCode size={14} />
            {roomSync.mobilePeers.length > 0
              ? `${roomSync.mobilePeers.length} Mobile Synced · ${roomId}`
              : `Connect Mobile · ${roomId}`}
          </button>
          <div className="header-right">
            <button
              type="button"
              className="btn ghost-btn"
              onClick={() => setMobileMode(true)}
              title="Open thumb-friendly Mobile Field Companion view"
            >
              <Smartphone size={14} /> Field UI
            </button>
            <button
              className="subtle"
              onClick={() => setModal("Capabilities & implementation")}
            >
              <BookOpen size={15} /> Docs <ArrowUpRight size={13} />
            </button>
            <button className="btn" onClick={exportReport}>
              <Download size={14} /> Export report
            </button>
          </div>
        </header>
        {roomSync.banner && (
          <div className="sync-live-toast desktop-toast">
            <Radio size={15} />
            <span>{roomSync.banner}</span>
            <button type="button" className="hk-chip" onClick={() => setPairingOpen(true)}>
              Room {roomId}
            </button>
          </div>
        )}
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
                ? "Explore your 3D twin, stream live mobile acoustic & SAM 2.1 field captures, and automate repair kits."
                : "One connected multi-agent studio for your machine’s entire engineering lifecycle."}
            </p>
          </div>
          <label className="machine-picker">
            <Box size={15} />
            <select
              aria-label="Select machine"
              value={machineId}
              onChange={(e) => {
                switchMachine(e.target.value)
                roomSync.broadcast("machine_switched", { machine: e.target.value })
              }}
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
            <span className="statusdot" />{" "}
            {roomSync.wsLive
              ? `Live Sync Room ${roomId} (${roomSync.mobilePeers.length} mobile)`
              : "Session active"}
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
                    <strong>Interactive 3D Digital Twin</strong>
                    <span className="tag">LIVE MOBILE SYNC</span>
                  </div>
                  {figPage && (
                    <div className="charttabs">
                      <button className={figView === "3d" ? "current" : ""} onClick={() => setFigView("3d")}>3D</button>
                      <button className={figView === "figure" ? "current" : ""} onClick={() => setFigView("figure")}>Figure</button>
                    </div>
                  )}
                  <button
                    className="iconbtn"
                    aria-label="Assembly controls"
                    onClick={() => setModal("Assembly controls")}
                  >
                    <Maximize size={16} />
                  </button>
                </div>
                <div className="scene" style={showFigure ? { height: "520px" } : undefined}>
                  <div className="scene-meta">
                    <span>{pack ? pack.meta.machine : machine.code} / REV 01</span>
                    <small>{pack ? pack.meta.name : machine.name}</small>
                  </div>
                  {showFigure ? (
                    <iframe
                      src={`/figures/${machineId}/${figPage}`}
                      title={`${machineId} crafted figure`}
                      style={{ width: "100%", height: "100%", border: "0" }}
                    />
                  ) : pack ? (
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
                        copilotSuspect ??
                        (trace?.finding
                          ? (matchComp(pack, trace.finding.component)?.id ??
                            null)
                          : null)
                      }
                      selectedId={matchComp(pack, selected)?.id ?? null}
                      scales={scalesFor(engineeringSession.applied)}
                      externalExplode={copilotExplode}
                      stepPlacedIds={syncedStepPlaced}
                      stepHighlightId={syncedStepHighlight}
                      externalFaultId={syncedFaultId}
                      onFaultChange={(fid) => {
                        setSyncedFaultId(fid)
                        roomSync.broadcast("fault_scenario", {
                          machine: machineId,
                          scenario_id: fid,
                        })
                      }}
                    />
                  ) : (
                    <div className="fallback">
                      {packErr || "Loading machine\u2026"}
                    </div>
                  )}
                </div>
              </section>
              <EngineeringPanel
                key={geom}
                machine={geom}
                session={engineeringSession}
                update={updateEngineering}
                inspect={(part) => {
                  if (parts.includes(part)) {
                    setSelected(part)
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
                  <strong>6-Agent Command Dock</strong>
                  <small>
                    <i /> Live Field Copilot + Benchmark Investigator
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
              <div className="dock-tabs">
                <button
                  type="button"
                  className={dockTab === "copilot" ? "active" : ""}
                  onClick={() => setDockTab("copilot")}
                >
                  Live Copilot
                </button>
                <button
                  type="button"
                  className={dockTab === "investigate" ? "active" : ""}
                  onClick={() => setDockTab("investigate")}
                >
                  Benchmark Trace
                </button>
                <button
                  type="button"
                  className={dockTab === "all" ? "active" : ""}
                  onClick={() => setDockTab("all")}
                >
                  Split All
                </button>
              </div>
              {(dockTab === "investigate" || dockTab === "all") && (
              <div className="agent-content">
                <div className="section-label">INVESTIGATION CONTEXT</div>
                {!pack && (
                  <div className="machine-notice">
                    {machine.name}: <strong>In dev</strong> — no machine pack
                    yet. Engineering experiments below the assembly still work;
                    switch to a packed machine to investigate.
                  </div>
                )}
                <label className="selectlabel">
                  Agent harness mode
                  <select
                    value={invMode}
                    onChange={(e) => setInvMode(e.target.value as "v2" | "v1")}
                  >
                    <option value="v2">
                      V2 · Harness² Self-Evolving Probe (76.2% / 3-of-3 bearings)
                    </option>
                    <option value="v1">
                      V1 · Frozen Baseline Prompt (16.7% benchmark)
                    </option>
                  </select>
                </label>
                {savedTraces.length > 0 && (
                  <label className="selectlabel">
                    Instant saved-trace replay
                    <select
                      defaultValue=""
                      onChange={(e) => replaySavedTrace(e.target.value)}
                    >
                      <option value="">Replay a saved investigation trace…</option>
                      {savedTraces.slice(0, 12).map((t) => (
                        <option key={t.investigation_id} value={t.investigation_id}>
                          {t.investigation_id} · {t.mode.toUpperCase()} ·{" "}
                          {t.hypothesis ?? t.status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="selectlabel">
                  Recording
                  <select
                    disabled={!pack}
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
                  disabled={!pack}
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
                      <>
                        <small>
                          Frozen: {reveal.frozen} · Documented:{" "}
                          {reveal.documented} ·{" "}
                          {reveal.match === null
                            ? "no ground truth"
                            : reveal.match
                              ? "MATCH"
                              : "MISMATCH"}
                        </small>
                        {reveal.match === false && trace.finding && (
                          <button
                            className="btn"
                            onClick={() => {
                              setDistillMsg("Distilling lesson into Harness²…")
                              harnessApi
                                .distill(machineId, {
                                  predicted: reveal.frozen,
                                  actual: reveal.documented,
                                  reasoning: trace.finding?.reasoning ?? "",
                                  investigation_id: trace.investigation_id,
                                })
                                .then(
                                  (d) =>
                                    setDistillMsg(
                                      `Learned (${d.harness.version}): ${d.lesson.lesson}`,
                                    ),
                                  (e) =>
                                    setDistillMsg(
                                      `Distill failed: ${(e as Error).message}`,
                                    ),
                                )
                            }}
                          >
                            <Zap size={12} /> Distill lesson into Harness²
                          </button>
                        )}
                        {distillMsg && <small>{distillMsg}</small>}
                      </>
                    )}
                  </div>
                )}
              </div>
              )}
              {(dockTab === "copilot" || dockTab === "all") && (
              <div className="composer">
                <div className="copilot-dock-banner">
                  <div>
                    <span className="section-label">LIVE FIELD &amp; VOICE COPILOT</span>
                    <small>
                      {roomSync.mobilePeers.length > 0
                        ? `🟢 ${roomSync.mobilePeers.length} Mobile Sensor Synced (Room ${roomId})`
                        : `Pair phone via QR (${roomId}) or use local Mic / Camera`}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="hk-chip on"
                    onClick={() => setPairingOpen(true)}
                  >
                    <QrCode size={12} /> Pair Phone
                  </button>
                </div>
                {syncedMaskB64 && (
                  <div className="synced-mask-box">
                    <div className="section-label">
                      LIVE SAM 2.1 SEGMENTATION OVERLAY
                      <button
                        type="button"
                        className="textbtn"
                        style={{ padding: 0 }}
                        onClick={() => setSyncedMaskB64(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                    <img
                      src={`data:image/png;base64,${syncedMaskB64}`}
                      alt="Live SAM 2.1 mask"
                    />
                  </div>
                )}
                {answer && <p className="response">{answer}</p>}
                {assistTurn?.repair_kit && (
                  <RepairKitCard
                    kit={assistTurn.repair_kit}
                    onOrderUpdated={(o) => setOrder(o)}
                  />
                )}
                {(voice.message || acoustic.status) && (
                  <small
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "#b7e77e",
                      marginBottom: 8,
                    }}
                  >
                    {acoustic.capturing ? acoustic.status : voice.message || acoustic.status}
                  </small>
                )}
                {acoustic.capturing && (
                  <div className="hk-meter">
                    <i style={{ width: `${Math.round(acoustic.level * 100)}%` }} />
                  </div>
                )}
                {(attachedPhoto || attachedWav) && (
                  <div className="hk-row" style={{ marginBottom: 8 }}>
                    {attachedPhoto && (
                      <span className="hk-chip on">
                        Photo: {attachedPhoto.name}
                      </span>
                    )}
                    {attachedWav && (
                      <span className="hk-chip on">
                        Audio: {attachedWav.name}
                      </span>
                    )}
                  </div>
                )}
                <div className="hk-row" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={`hk-chip ${voice.listening ? "on" : ""}`}
                    onClick={() => (voice.listening ? voice.stop() : voice.start())}
                    title="Push-to-talk voice command"
                  >
                    <Mic size={13} /> {voice.listening ? "Stop voice" : "Push-to-talk"}
                  </button>
                  <button
                    type="button"
                    className={`hk-chip ${acoustic.capturing ? "amber-chip" : ""}`}
                    onClick={async () => {
                      if (acoustic.capturing) {
                        acoustic.cancel()
                        return
                      }
                      const wav = await acoustic.capture5s(5000)
                      if (wav) {
                        submitCopilotTurn(
                          question ||
                            "Analyze this 5-second live machine acoustic recording for bearing or pump faults and draft a repair kit if needed.",
                          wav,
                          attachedPhoto,
                        )
                      }
                    }}
                    title="Capture 5s raw machine audio via microphone for FFT + band-probe fault diagnosis"
                  >
                    <Radio size={13} /> {acoustic.capturing ? "Cancel 5s" : "Listen 5s (Mic)"}
                  </button>
                  <label className="hk-chip" style={{ cursor: "pointer" }}>
                    <Eye size={13} /> Photo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => setAttachedPhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    className={`hk-chip ${ttsEnabled ? "on" : ""}`}
                    onClick={() => setTtsEnabled((v) => !v)}
                  >
                    TTS {ttsEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                {demoAssets.some((a) => a.category === "audio") && (
                  <div className="hk-row" style={{ marginBottom: 10 }}>
                    {demoAssets
                      .filter((a) => a.category === "audio")
                      .slice(0, 3)
                      .map((a) => (
                        <button
                          key={a.url}
                          type="button"
                          className="hk-chip"
                          onClick={async () => {
                            const f = await fetchDemoFile(a)
                            submitCopilotTurn(
                              `Analyze machine sound clip ${a.filename} at ${speed} rpm and recommend any needed replacement kit.`,
                              f,
                              null,
                            )
                          }}
                        >
                          <Waves size={12} /> {a.filename.replace(/\.wav$/i, "")}
                        </button>
                      ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitCopilotTurn()
                  }}
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask manual, diagnose fault, or say 'bore 88 mm and speed 4500 rpm'…"
                    aria-label="Ask about machine"
                  />
                  <div>
                    <span>
                      {assistBusy
                        ? "6-agent mesh running…"
                        : assistTurn
                          ? `Via ${assistTurn.specialists.join(", ") || "supervisor"}${
                              assistTurn.suspect_component
                                ? ` · suspect: ${assistTurn.suspect_component}`
                                : ""
                            }`
                          : "Voice, 5s acoustic FFT, vision & RAG ready"}
                    </span>
                    <button className="send" aria-label="Send question">
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </form>
                <div className="parameter-box" style={{ marginTop: 18 }}>
                  <div className="section-label">
                    OPERATING TELEMETRY SLIDERS{" "}
                    <span>LIVE DRAFT</span>
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
                    Speed drafts feed into the physics trade-study sandbox below the 3D Twin.
                  </p>
                </div>
              </div>
              )}
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
            {page === "Blueprints" ? (<>
              <div className="twocol">
                <section className="panel largepanel">
                  <FileText size={30} />
                  <h2>2D Blueprint / PDF → 3D Parametric Simulation.</h2>
                  <p>
                    Upload an engineering manual PDF or a 2D CAD blueprint image
                    (.png, .jpg, .webp). Meta muse-spark-1.3 Vision + deterministic
                    parsers extract balloon callouts, physical dimensions (bore,
                    stroke, shaft Ø, RPM), kinematic hierarchy, and FTS5 RAG chunks.
                  </p>
                  {demoAssets.some((a) => a.category === "blueprints") && (
                    <div className="hk-row" style={{ marginBottom: 14 }}>
                      <span style={{ fontSize: 9, color: "#858e8c" }}>
                        1-click sample blueprints:
                      </span>
                      {demoAssets
                        .filter((a) => a.category === "blueprints")
                        .map((a) => (
                          <button
                            key={a.url}
                            type="button"
                            className="hk-chip"
                            disabled={draftBusy}
                            onClick={async () => {
                              const slug = a.filename
                                .replace(/\.(pdf|png|jpg|jpeg|webp)$/i, "")
                                .replace(/-blueprint$/i, "-bp")
                              setDraftMachine(slug)
                              setDraftTitle(slug.replace(/-/g, " ").toUpperCase())
                              const f = await fetchDemoFile(a)
                              onDraftUpload(f)
                            }}
                          >
                            <FileText size={11} /> {a.filename}
                          </button>
                        ))}
                    </div>
                  )}
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
                    <strong>Select a PDF manual or 2D CAD blueprint image</strong>
                    <span>PDF / PNG / JPG / WEBP · max 30 MB · local-first</span>
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      onChange={(e) => onDraftUpload(e.target.files?.[0])}
                    />
                  </label>
                  {draftMsg && <p>{draftMsg}</p>}
                  {draft && (
                    <>
                      <p>
                        <strong>{draft.title}</strong> · {draft.source_kind ?? "pdf"} ·
                        status {draft.status} · score {draft.assessment.score} ·{" "}
                        {draft.candidates.length} candidates ({draft.assessment.with_pos} with Pos.)
                      </p>
                      {draft.dimensions && Object.keys(draft.dimensions).length > 0 && (
                        <div className="hk-row">
                          {Object.entries(draft.dimensions).map(([k, v]) => (
                            <span key={k} className="hk-chip on">
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="charttabs">
                        <button onClick={onDraftReason} disabled={draftBusy}>
                          Ask muse-spark-1.3 Vision
                        </button>
                        <button onClick={onDraftSave} disabled={draftBusy}>
                          Save answers
                        </button>
                        <button onClick={onDraftFinalize} disabled={draftBusy}>
                          Finalize 3D pack
                        </button>
                        <button
                          onClick={() => {
                            invApi.restock(draft.machine).then(
                              (r) =>
                                setDraftMsg(
                                  `Auto-stocked ${r.updated} parts in sandbox inventory for ${draft.machine}. Switching to Workspace…`,
                                ),
                              () => {},
                            )
                            switchMachine(draft.machine)
                            setPage("Workspace")
                          }}
                        >
                          Stock &amp; Open in 3D ↗
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
                      <div style={{ marginTop: 14 }}>
                        {draft.candidates.slice(0, 10).map((c) => (
                          <label key={c.id} className="dimension">
                            {c.name}
                            {c.pos ? ` (${c.pos})` : ""}
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
                          Add missing components (one per line)
                          <textarea
                            rows={2}
                            value={newComp}
                            onChange={(e) => setNewComp(e.target.value)}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </section>
                <AssemblyGuidePanel
                  machineId={machineId}
                  pack={pack}
                  demoAssets={demoAssets}
                  ttsEnabled={ttsEnabled}
                />
              </div>
              <section className="panel" style={{ marginTop: "16px" }}>
                <h2>Crafted figures.</h2>
                <p>Anatomy figure per machine: spec, author, verify, eval, approve. The author step runs in an agent session; this panel tracks state and publishes.</p>
                {packList.map((p) => {
                  const f = figures.find((x) => x.machine === p.machine)
                  return (
                    <p key={p.machine}>
                      <strong>{p.name}</strong> — {f ? f.status : "none"}{" "}
                      {(!f || f.status !== "published") && (
                        <button onClick={() => onFigureCreate(p.machine)} disabled={figRunning}>Generate figure</button>
                      )}{" "}
                      {f?.job_id && !figJobId && (
                        <button onClick={() => onFigureResume(f)} disabled={figRunning}>Resume job {f.job_id}</button>
                      )}
                    </p>
                  )
                })}
                {figJobId && (
                  <p>
                    Job {figJobId}: {figJob?.state ?? "…"}
                    {(figJob?.state === "awaiting_author" || figJob?.state === "failed") && (
                      <> <button onClick={onFigureSubmit} disabled={figRunning}>Submit build</button></>
                    )}
                    {figJob?.state === "eval_pass" && (
                      <> <button onClick={onFigureApprove} disabled={figRunning}>Approve &amp; publish</button></>
                    )}
                  </p>
                )}
                {figJob && figJob.gates.length > 0 && (
                  <p>Gates: {figJob.gates.map((g) => `${g.gate} ${g.pass ? "pass" : "FAIL"}`).join(" · ")}</p>
                )}
                {figJob?.verdict && (
                  <p>Verdict: {figJob.verdict.publish ? `publish, score ${figJob.verdict.score}` : `hold, score ${figJob.verdict.score}`} — {figJob.verdict.reasons.join("; ")}</p>
                )}
                {figMsg && <p>{figMsg}</p>}
              </section>
            </>) : page === "Inventory" ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
                  <div className="searchbox" style={{ marginBottom: 0 }}>
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
                  <button
                    className="btn"
                    onClick={() => {
                      invApi.restock(machineId).then(
                        (r) => {
                          setInvMsg(`Restocked ${r.updated} unstocked SKUs for ${machineId} (sandbox).`)
                          onInvSearch()
                        },
                        (e) => setInvMsg(`Restock failed: ${(e as Error).message}`),
                      )
                    }}
                  >
                    <Package size={14} /> Auto-stock unstocked SKUs
                  </button>
                  {pack && (
                    <button
                      className="btn"
                      onClick={() => {
                        const cid =
                          copilotSuspect ??
                          (trace?.finding ? matchComp(pack, trace.finding.component)?.id : null) ??
                          matchComp(pack, selected)?.id ??
                          pack.components[0]?.id
                        if (!cid) return
                        invApi.repairKit(machineId, cid, true).then(
                          (kit) => {
                            setInvKit(kit)
                            if (kit.draft_order) setOrder(kit.draft_order)
                            setInvMsg(`Built BOM repair kit for ${cid} (+ companion consumables).`)
                          },
                          (e) => setInvMsg(`Repair kit failed: ${(e as Error).message}`),
                        )
                      }}
                    >
                      <Zap size={14} /> Recommend Repair Kit ({matchComp(pack, selected)?.id ?? "active part"})
                    </button>
                  )}
                </div>
                {invKit && (
                  <RepairKitCard
                    kit={invKit}
                    onOrderUpdated={(o) => {
                      setOrder(o)
                      onInvSearch()
                    }}
                  />
                )}
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
                    Executable 6-Agent Multi-Agent Mesh + Self-Evolving Harness² +
                    SQLite FTS5 Component-Graph RAG — powered strictly by Meta
                    muse-spark-1.3 &amp; local Meta SAM 2.1.
                    {assistTurn
                      ? ` Last turn fired: ${assistTurn.specialists.join(", ") || "supervisor"}.`
                      : " Speak, capture 5s live audio, or ask in the Workspace composer to watch live agent handoffs."}
                  </span>
                </div>
                <AgentLabHub
                  machineId={machineId}
                  pack={pack}
                  lastTrace={assistTurn?.agent_trace ?? []}
                  onApplyDesignPatch={(patch) => {
                    setEngineering((prev) => {
                      const cur = prev[geom]
                      const nextDraft = { ...cur.applied, ...patch } as Inputs
                      return {
                        ...prev,
                        [geom]: {
                          ...cur,
                          draft: nextDraft,
                          result: calculate(nextDraft),
                          confirmation: true,
                          message: `Applied Design Reviewer proposal ${JSON.stringify(patch)} to draft.`,
                        },
                      }
                    })
                  }}
                />
                <section className="panel largepanel" style={{ marginTop: 22 }}>
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
                      if (!pack) switchMachine("rig")
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
                  Connected to the multi-agent engineering backend: 2D blueprint
                  reconstruction, interactive 3D digital twin, Meta SAM 2.1 mask
                  grounding, Harness² self-evolving acoustic probe, FTS5 RAG
                  citation verification, and sandbox inventory procurement.
                </p>
                <h3>Live Mobile Field Sync</h3>
                <p className="muted">
                  Click <strong>Connect Mobile</strong> in the top bar to scan the
                  QR code over an instant HTTPS tunnel or local Wi-Fi. Captures on
                  your phone update the Desktop 3D Twin, FFT chart, and Repair Kit
                  in real time.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {pairingOpen && (
        <MobilePairingModal
          roomId={roomId}
          mobilePeers={roomSync.mobilePeers}
          onClose={() => setPairingOpen(false)}
          onOpenLocalMobilePreview={() => {
            setPairingOpen(false)
            setMobileMode(true)
          }}
        />
      )}
      <nav className="mobile-bottom-nav studio-bottom-nav" aria-label="Primary mobile navigation">
        {nav.map((n, i) => {
          const Icon = icons[i]
          return (
            <button
              key={n}
              type="button"
              className={page === n ? "active" : ""}
              onClick={() => setPage(n)}
            >
              <Icon size={19} />
              <span>{railLabels[i]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
