import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  Cpu,
  Eye,
  Layers,
  Mic,
  Network,
  Package,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react"
import {
  agentsApi,
  harnessApi,
  invApi,
  ragApi,
  visionApi,
  type AgentSpecItem,
  type AgentTraceItem,
  type AssemblyGuideResult,
  type DemoAsset,
  type HarnessState,
  type InvOrder,
  type Pack,
  type RagHit,
  type RepairKit,
} from "./api"
import AssemblySim from "./sim/AssemblySim"
import { speakText } from "./features/engineering/useVoiceInput"

export async function fetchDemoFile(asset: DemoAsset): Promise<File> {
  const res = await fetch(asset.url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${asset.filename}`)
  const blob = await res.blob()
  const ext = asset.filename.split(".").pop()?.toLowerCase() ?? ""
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "wav"
            ? "audio/wav"
            : ext === "csv"
              ? "text/csv"
              : blob.type || "application/octet-stream"
  return new File([blob], asset.filename, { type: mime })
}

export function RepairKitCard({
  kit,
  onOrderUpdated,
}: {
  kit: RepairKit
  onOrderUpdated?: (o: InvOrder) => void
}) {
  const [order, setOrder] = useState<InvOrder | null>(kit.draft_order)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    setOrder(kit.draft_order)
    setMsg("")
  }, [kit])

  const confirmAndSubmit = async () => {
    if (!order) return
    setBusy(true)
    setMsg("")
    try {
      let cur = order
      if (cur.status === "draft") {
        cur = await invApi.confirm(cur.id)
      }
      if (cur.status === "confirmed") {
        cur = await invApi.submit(cur.id)
      }
      setOrder(cur)
      onOrderUpdated?.(cur)
      setMsg(`Submitted sandbox PO ${cur.confirmation ?? cur.id}`)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hk-kit">
      <strong>
        Auto-Drafted Repair Kit · {kit.suspect_component} (${kit.estimated_total.toFixed(2)} ·{" "}
        {kit.max_lead_days}d max lead)
      </strong>
      <div className="hk-kit-line">
        <span>
          1× {kit.primary.name} ({kit.primary.sku})
        </span>
        <span>
          ${kit.primary.unit_price.toFixed(2)} · {kit.primary.stock_qty} in stock
        </span>
      </div>
      {kit.companions.map((c) => (
        <div className="hk-kit-line" key={c.id}>
          <span>
            + {c.name} ({c.sku})
          </span>
          <span>
            ${c.unit_price.toFixed(2)} · {c.stock_qty} in stock
          </span>
        </div>
      ))}
      {kit.reasons.length > 0 && (
        <div style={{ color: "#95a597", fontSize: "8px", marginTop: "4px" }}>
          BOM rule: {kit.reasons.join(" · ")}
        </div>
      )}
      {kit.alerts.map((a) => (
        <div className="hk-alert" key={a}>
          <AlertTriangle size={10} style={{ display: "inline", marginRight: 4 }} />
          {a}
        </div>
      ))}
      <div className="hk-row">
        {order && order.status !== "submitted" && (
          <button className="hk-chip on" disabled={busy} onClick={confirmAndSubmit}>
            <Check size={11} />
            {busy ? "Submitting…" : `Confirm & Submit PO #${order.id.slice(0, 6)}`}
          </button>
        )}
        {order?.status === "submitted" && (
          <span className="tag">
            PO SUBMITTED · {order.confirmation} (SANDBOX)
          </span>
        )}
        {msg && <span style={{ fontSize: "8px", color: "#c2ec93" }}>{msg}</span>}
      </div>
    </div>
  )
}

export function AssemblyGuidePanel({
  machineId,
  pack,
  demoAssets,
  ttsEnabled,
}: {
  machineId: string
  pack: Pack | null
  demoAssets: DemoAsset[]
  ttsEnabled: boolean
}) {
  const [guide, setGuide] = useState<AssemblyGuideResult | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const runGuide = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMsg(`Running Meta SAM 2.1 + muse-spark-1.3 assembly grounding on ${file.name}…`)
    try {
      const res = await visionApi.assemblyGuide(machineId, file)
      setGuide(res)
      setStepIdx(0)
      setMsg(
        `Grounded ${res.grounded_regions.length} part regions & ${res.steps.length} assembly steps in ${res.elapsed_ms} ms (${res.device}, ${res.grounding_source}).`,
      )
      if (res.steps[0]) {
        speakText(
          `Step 1: ${res.steps[0].component_name}. ${res.steps[0].instruction}. ${res.steps[0].torque_or_check}`,
          ttsEnabled,
        )
      }
    } catch (e) {
      setMsg(`Assembly guide failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const photoSamples = demoAssets.filter(
    (a) =>
      (a.category === "photos" || a.category === "blueprints") &&
      /\.(png|jpg|jpeg|webp)$/i.test(a.filename),
  )

  const currentStep = guide?.steps[stepIdx] ?? null
  const placedIds = guide
    ? guide.steps.slice(0, stepIdx + 1).flatMap((s) => s.parts)
    : null

  const goStep = (next: number) => {
    if (!guide || !guide.steps.length) return
    const bounded = Math.max(0, Math.min(guide.steps.length - 1, next))
    setStepIdx(bounded)
    const st = guide.steps[bounded]
    if (st) {
      speakText(
        `Step ${st.step}: ${st.component_name}. ${st.instruction}. ${st.torque_or_check}`,
        ttsEnabled,
      )
    }
  }

  return (
    <section className="panel largepanel blueprint">
      <span className="tag">IMAGE-TO-ASSEMBLY GUIDE · META SAM 2.1 + MUSE-SPARK-1.3</span>
      <h3 style={{ marginTop: 12 }}>Workbench photo → interactive 3D assembly guide</h3>
      <p style={{ marginTop: 6 }}>
        Upload a workbench or exploded-parts photo. Meta SAM 2.1 segments each part mask,
        muse-spark-1.3 grounds masks to registry IDs and manual torque specs, and the 3D rig steps
        through assembly in lockstep.
      </p>

      {photoSamples.length > 0 && (
        <div className="hk-row">
          <span style={{ fontSize: 9, color: "#858e8c" }}>1-click demo visuals:</span>
          {photoSamples.slice(0, 4).map((a) => (
            <button
              key={a.url}
              type="button"
              className="hk-chip"
              disabled={busy}
              onClick={async () => {
                const f = await fetchDemoFile(a)
                void runGuide(f)
              }}
            >
              <Eye size={11} /> {a.filename}
            </button>
          ))}
        </div>
      )}

      <label className="upload" style={{ marginTop: 16, padding: "22px 10px" }}>
        <Upload size={22} />
        <strong>{busy ? "Segmenting & grounding…" : "Upload workbench or exploded photo"}</strong>
        <span>PNG / JPG / WEBP · Meta SAM 2.1 local masks + manual torque lookup</span>
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => void runGuide(e.target.files?.[0])}
        />
      </label>

      {msg && <p style={{ fontSize: 11 }}>{msg}</p>}

      {guide && (
        <>
          <div style={{ marginTop: 14 }}>
            <img
              src={`data:image/png;base64,${guide.overlay_b64}`}
              alt="SAM 2 grounded assembly overlay"
              style={{ width: "100%", borderRadius: 6, border: "1px solid #3c4840" }}
            />
            {guide.grounded_regions.length > 0 && (
              <div className="hk-row">
                {guide.grounded_regions.map((gr) => {
                  const active = currentStep?.component_id === gr.component_id
                  return (
                    <button
                      key={`${gr.region_id}-${gr.component_id}`}
                      type="button"
                      className={`hk-chip ${active ? "on" : ""} ${
                        gr.condition === "suspect_wear" ? "amber-chip" : ""
                      }`}
                      onClick={() => {
                        const idx = guide.steps.findIndex(
                          (s) => s.component_id === gr.component_id,
                        )
                        if (idx >= 0) goStep(idx)
                      }}
                    >
                      #{gr.region_id} {gr.component_name}
                      {gr.condition === "suspect_wear" ? " · WEAR" : ""}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {currentStep && (
            <div className="hk-stepbox">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="eyebrow">
                  STEP {currentStep.step} OF {guide.steps.length}
                  {currentStep.region_id ? ` · MASK #${currentStep.region_id}` : ""}
                </span>
                <span className="tag">{currentStep.component_id}</span>
              </div>
              <h4 style={{ marginTop: 6 }}>{currentStep.component_name}</h4>
              <p style={{ fontSize: 11, color: "#d4ded4", marginTop: 4 }}>
                {currentStep.instruction}
              </p>
              <p style={{ fontSize: 10, color: "#dbb679", marginTop: 6 }}>
                Torque / Check: {currentStep.torque_or_check}
              </p>
              <div className="hk-row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={stepIdx <= 0}
                  onClick={() => goStep(stepIdx - 1)}
                >
                  ← Prev step
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={stepIdx >= guide.steps.length - 1}
                  onClick={() => goStep(stepIdx + 1)}
                >
                  Next step →
                </button>
                <button
                  type="button"
                  className="hk-chip"
                  onClick={() =>
                    speakText(
                      `Step ${currentStep.step}: ${currentStep.component_name}. ${currentStep.instruction}. ${currentStep.torque_or_check}`,
                      true,
                    )
                  }
                >
                  <Mic size={11} /> Speak step
                </button>
              </div>
            </div>
          )}

          {pack && (
            <div style={{ marginTop: 14 }}>
              <span className="eyebrow">SYNCHRONIZED 3D STEP PLAYBACK</span>
              <AssemblySim
                pack={pack}
                machineId={machineId}
                onSelect={() => {}}
                labelFor={(id) => pack.components.find((k) => k.id === id)?.name ?? id}
                suspect={
                  guide.grounded_regions.find((g) => g.condition === "suspect_wear")
                    ?.component_id ?? null
                }
                selectedId={currentStep?.component_id ?? null}
                scales={{ bore: 1, stroke: 1, shaft: 1 }}
                stepPlacedIds={placedIds}
                stepHighlightId={currentStep?.component_id ?? null}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function AgentLabHub({
  machineId,
  pack,
  lastTrace,
  onApplyDesignPatch,
}: {
  machineId: string
  pack: Pack | null
  lastTrace: AgentTraceItem[]
  onApplyDesignPatch?: (patch: Record<string, number>) => void
}) {
  const [agents, setAgents] = useState<AgentSpecItem[]>([])
  const [ragStats, setRagStats] = useState<{ chunks: number; by_kind?: Record<string, number> } | null>(null)
  const [harness, setHarness] = useState<HarnessState | null>(null)
  const [harnessMsg, setHarnessMsg] = useState("")
  const [distillPred, setDistillPred] = useState("healthy")
  const [distillAct, setDistillAct] = useState("outer_ring_damage")
  const [distillNote, setDistillNote] = useState(
    "Ultrasonic 8-20 kHz band had high sensor-mount kurtosis on healthy baseline; check BPFO harmonic SNR in 500-4000 Hz structural band.",
  )
  const [ragQuery, setRagQuery] = useState("bearing clearance seal torque")
  const [ragComp, setRagComp] = useState("")
  const [ragHits, setRagHits] = useState<RagHit[]>([])
  const [designPrompt, setDesignPrompt] = useState("")
  const [designResult, setDesignResult] = useState<any>(null)

  const refresh = () => {
    agentsApi.catalog(machineId).then(
      (r) => {
        setAgents(r.agents)
        setRagStats(r.rag)
      },
      () => {},
    )
    harnessApi.get(machineId).then(
      (r) => setHarness(r.harness),
      () => {},
    )
  }

  useEffect(() => {
    refresh()
    ragApi.search(machineId, ragQuery).then(
      (r) => {
        setRagHits(r.hits)
        setRagStats(r.stats)
      },
      () => {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId])

  const onPreset = async (preset: "v2" | "v1_naive") => {
    setHarnessMsg(`Switching harness to ${preset}…`)
    try {
      const r = await harnessApi.reset(machineId, preset)
      setHarness(r.harness)
      setHarnessMsg(
        preset === "v2"
          ? "Loaded V2 Evolved Harness (3/3 held-out bearings, 76.2% overall accuracy)."
          : "Reset to V1 Naive Baseline (skills disabled — ready to demonstrate live self-learning).",
      )
      refresh()
    } catch (e) {
      setHarnessMsg((e as Error).message)
    }
  }

  const onDistill = async () => {
    setHarnessMsg("Distilling new diagnostic skill into data/harness/…")
    try {
      const r = await harnessApi.distill(machineId, {
        predicted: distillPred,
        actual: distillAct,
        technician_note: distillNote,
      })
      setHarness(r.harness)
      setHarnessMsg(`Learned new skill (${r.harness.version}): ${r.lesson.lesson}`)
      refresh()
    } catch (e) {
      setHarnessMsg((e as Error).message)
    }
  }

  const onRagSearch = async () => {
    try {
      const r = await ragApi.search(machineId, ragQuery, ragComp || null)
      setRagHits(r.hits)
      setRagStats(r.stats)
    } catch {
      // ignore
    }
  }

  const onRunDesign = async () => {
    if (!designPrompt.trim()) return
    try {
      const r = await agentsApi.designCopilot(machineId, designPrompt)
      setDesignResult(r)
      if (r.patch && Object.keys(r.patch).length > 0) {
        onApplyDesignPatch?.(r.patch)
      }
    } catch (e) {
      setDesignResult({ error: (e as Error).message })
    }
  }

  return (
    <>
      <div className="inventory-grid">
        {agents.map((a, i) => {
          const traceHit = lastTrace.find((t) => t.agent_id === a.id)
          return (
            <div className="panel agentcard" key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="agent-logo">
                  {i === 3 ? (
                    <Activity size={21} />
                  ) : i === 2 ? (
                    <Eye size={21} />
                  ) : i === 5 ? (
                    <Package size={21} />
                  ) : i === 4 ? (
                    <Cpu size={21} />
                  ) : (
                    <Network size={21} />
                  )}
                </div>
                <span className="tag">
                  {traceHit ? `${traceHit.status.toUpperCase()} · ${traceHit.latency_ms}ms` : "ONLINE"}
                </span>
              </div>
              <h3>{a.name}</h3>
              <p style={{ marginBottom: 10 }}>{a.role}</p>
              <small style={{ display: "block", color: "#8ba089", fontSize: 9, marginBottom: 8 }}>
                Engine: {a.engine}
              </small>
              <div className="hk-row">
                {Object.entries(a.metrics).map(([k, v]) => (
                  <span key={k} className="tag">
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
              {traceHit && (
                <div className="hk-trace-pill">
                  <div>
                    <b>Last turn</b>
                    <small>{traceHit.summary}</small>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="hk-grid2">
        <section className="panel largepanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">HARNESS² SELF-EVOLVING DIAGNOSTIC ENGINE</span>
            <span className="tag">{harness?.version ?? "harness-v2"}</span>
          </div>
          <h3 style={{ marginTop: 10 }}>Propose → Probe → Compose + Skill Distillation</h3>
          <p>
            Inspired by self-evolving research harnesses: multi-band kurtosis + BPFO/BPFI harmonic
            SNR probes replace single-band guesses, and confirmed misses distill into persistent
            reusable skills without leaking bearing IDs.
          </p>
          <div className="hk-row">
            <button type="button" className="hk-chip on" onClick={() => void onPreset("v2")}>
              <Zap size={11} /> Load V2 Evolved Preset (76.2% / 3-of-3 bearings)
            </button>
            <button type="button" className="hk-chip amber-chip" onClick={() => void onPreset("v1_naive")}>
              Reset to V1 Naive (16.7% baseline)
            </button>
          </div>

          {harness && (
            <div style={{ marginTop: 14 }}>
              <span className="eyebrow">
                ACTIVE LEARNED SKILLS (
                {harness.skills.filter((s) => s.active ?? s.enabled ?? true).length})
              </span>
              {harness.skills
                .filter((s) => s.active ?? s.enabled ?? true)
                .slice(0, 5)
                .map((s) => (
                  <div className="hk-trace-pill" key={s.id}>
                    <div>
                      <b>
                        {s.title} <span className="tag">{s.source ?? s.origin ?? "skill"}</span>
                      </b>
                      <small>{s.rule}</small>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div style={{ marginTop: 16, borderTop: "1px solid #2e3631", paddingTop: 14 }}>
            <span className="eyebrow">LIVE LESSON DISTILLATION (POST-REVEAL FEEDBACK)</span>
            <div className="hk-row" style={{ marginTop: 8 }}>
              <label style={{ fontSize: 10 }}>
                Predicted{" "}
                <select
                  value={distillPred}
                  onChange={(e) => setDistillPred(e.target.value)}
                  style={{ background: "#141819", border: "1px solid #3b4241", padding: "4px 6px" }}
                >
                  <option value="healthy">healthy</option>
                  <option value="outer_ring_damage">outer_ring_damage</option>
                  <option value="inner_ring_damage">inner_ring_damage</option>
                  <option value="insufficient_evidence">insufficient_evidence</option>
                </select>
              </label>
              <label style={{ fontSize: 10 }}>
                Documented{" "}
                <select
                  value={distillAct}
                  onChange={(e) => setDistillAct(e.target.value)}
                  style={{ background: "#141819", border: "1px solid #3b4241", padding: "4px 6px" }}
                >
                  <option value="outer_ring_damage">outer_ring_damage</option>
                  <option value="inner_ring_damage">inner_ring_damage</option>
                  <option value="healthy">healthy</option>
                </select>
              </label>
              <button type="button" className="btn" onClick={() => void onDistill()}>
                Distill lesson into Harness
              </button>
            </div>
            <input
              type="text"
              value={distillNote}
              onChange={(e) => setDistillNote(e.target.value)}
              placeholder="Diagnostic observation to distill…"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "7px 9px",
                fontSize: 10,
                background: "#141819",
                border: "1px solid #3b4241",
                borderRadius: 4,
              }}
            />
            {harnessMsg && (
              <p style={{ fontSize: 10, color: "#c2ec93", marginTop: 8 }}>{harnessMsg}</p>
            )}
          </div>
        </section>

        <section className="panel largepanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">COMPONENT-GRAPH + SQLITE FTS5 HYBRID RAG</span>
            <span className="tag">
              {ragStats ? `${ragStats.chunks} INDEXED CHUNKS` : "FTS5 BM25"}
            </span>
          </div>
          <h3 style={{ marginTop: 10 }}>Zero-Hallucination Manual & Topology Retrieval</h3>
          <p>
            Combines BM25 full-text search across service manuals, playbooks, and extracted PDF
            pages with 1-hop parent/child component-graph expansion and exact substring quote
            verification.
          </p>
          <div className="hk-row">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onRagSearch()}
              placeholder="Search torque, clearance, fault mode…"
              style={{
                flex: 1,
                minWidth: 160,
                padding: "7px 10px",
                fontSize: 11,
                background: "#141819",
                border: "1px solid #3b4241",
                borderRadius: 4,
              }}
            />
            <select
              value={ragComp}
              onChange={(e) => setRagComp(e.target.value)}
              style={{
                padding: "7px 8px",
                fontSize: 10,
                background: "#141819",
                border: "1px solid #3b4241",
                borderRadius: 4,
              }}
            >
              <option value="">All components (no graph filter)</option>
              {(pack?.components ?? []).slice(0, 30).map((c) => (
                <option key={c.id} value={c.id}>
                  1-hop boost: {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => void onRagSearch()}>
              <Search size={13} /> Retrieve
            </button>
          </div>

          <div>
            {ragHits.slice(0, 4).map((h) => (
              <div className="hk-rag-hit" key={h.chunk_id}>
                <header>
                  <span>
                    {h.source} · {h.kind ?? "doc"}
                    {h.page ? ` (p.${h.page})` : ""}
                  </span>
                  <span>
                    score {h.score}
                    {h.via ? ` · ${h.via}` : ""}
                  </span>
                </header>
                <div style={{ color: "#c5d0c7" }}>{h.text.slice(0, 240)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, borderTop: "1px solid #2e3631", paddingTop: 14 }}>
            <span className="eyebrow">MULTI-PARAMETER DESIGN &amp; PHYSICS AGENT</span>
            <div className="hk-row" style={{ marginTop: 8 }}>
              <input
                type="text"
                value={designPrompt}
                onChange={(e) => setDesignPrompt(e.target.value)}
                placeholder="e.g. bore 88 mm and speed 4500 rpm (or torque 25 Nm and shaft diameter 24 mm)"
                style={{
                  flex: 1,
                  padding: "7px 9px",
                  fontSize: 10,
                  background: "#141819",
                  border: "1px solid #3b4241",
                  borderRadius: 4,
                }}
              />
              <button type="button" className="btn" onClick={() => void onRunDesign()}>
                Evaluate trade-off
              </button>
            </div>
            {designResult && !designResult.error && (
              <div className="hk-trace-pill" style={{ marginTop: 8 }}>
                <div>
                  <b>
                    Patch {JSON.stringify(designResult.patch)} → {designResult.after?.status}
                  </b>
                  <small>
                    {designResult.rationale} ·{" "}
                    {(designResult.after?.outputs ?? [])
                      .map((o: any) => `${o.label}: ${o.value ?? "—"} ${o.unit}`)
                      .join(" · ")}
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
