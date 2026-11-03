import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Box,
  Camera,
  Check,
  Copy,
  Eye,
  Globe,
  Layers,
  Mic,
  Monitor,
  Package,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import {
  harnessApi,
  invApi,
  mobileApi,
  type AssemblyGuideResult,
  type AssistTurn,
  type DemoAsset,
  type InvOrder,
  type InvPart,
  type MobileConnectionInfo,
  type MobilePeer,
  type Pack,
  type SyncEvent,
} from "./api"
import AssemblySim from "./sim/AssemblySim"
import { RepairKitCard, fetchDemoFile } from "./HackathonPanels"
import { useAcousticCapture } from "./features/engineering/useAcousticCapture"
import { speakText, useVoiceInput } from "./features/engineering/useVoiceInput"
import { geomOfKind, scalesFor } from "./machines"
import { createSession } from "./features/engineering/EngineeringPanel"

/** Read or generate a stable 6-char sync room ID. */
export function resolveInitialRoomId(): string {
  if (typeof window === "undefined") return "FORMA1"
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get("room")?.trim().toUpperCase()
  if (fromUrl) {
    const clean = fromUrl.replace(/[^A-Z0-9_-]/g, "").slice(0, 16) || "FORMA1"
    try {
      sessionStorage.setItem("forma_room_id", clean)
    } catch {
      // ignore storage errors
    }
    return clean
  }
  try {
    const saved = sessionStorage.getItem("forma_room_id")
    if (saved) return saved
    const created = `FRM${Math.floor(100 + Math.random() * 900)}`
    sessionStorage.setItem("forma_room_id", created)
    return created
  } catch {
    return "FORMA1"
  }
}

export function detectInitialMobileMode(): boolean {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  if (params.get("mobile") === "1" || params.get("mode") === "mobile") return true
  if (params.get("mobile") === "0") return false
  return window.innerWidth <= 760
}

function getPeerId(role: string): string {
  try {
    const key = `forma_peer_${role}`
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const next = `${role}_${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(key, next)
    return next
  } catch {
    return `${role}_local`
  }
}

function detectDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Field Device"
  const ua = navigator.userAgent || ""
  if (/iPhone/i.test(ua)) return "iPhone Field Companion"
  if (/iPad/i.test(ua)) return "iPad Field Companion"
  if (/Android/i.test(ua)) return "Android Field Companion"
  return "Web Field Companion"
}

/**
 * Dual-transport real-time room sync (WebSocket <30ms push + REST cursor fallback).
 */
export function useRoomSync(
  roomId: string,
  role: "desktop" | "mobile",
  onEvent: (evt: SyncEvent) => void,
) {
  const [peers, setPeers] = useState<MobilePeer[]>([])
  const [wsLive, setWsLive] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const seqRef = useRef<number>(0)
  const peerId = useMemo(() => getPeerId(role), [role])
  const deviceLabel = useMemo(
    () => (role === "mobile" ? detectDeviceLabel() : "Desktop Studio"),
    [role],
  )
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent
  const wsRef = useRef<WebSocket | null>(null)

  const handleIncoming = useCallback(
    (evt: SyncEvent) => {
      if (evt.seq <= seqRef.current) return
      seqRef.current = evt.seq
      if (evt.sender === peerId) return
      cbRef.current(evt)
    },
    [peerId],
  )

  const flashBanner = useCallback((msg: string) => {
    setBanner(msg)
  }, [])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 5500)
    return () => clearTimeout(t)
  }, [banner])

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connectWs = () => {
      if (cancelled) return
      try {
        ws = new WebSocket(mobileApi.wsUrl(roomId, peerId, role, deviceLabel))
        wsRef.current = ws
        ws.onopen = () => {
          if (!cancelled) setWsLive(true)
        }
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === "welcome" || msg.type === "pong") {
              if (Array.isArray(msg.peers)) setPeers(msg.peers)
            } else if (typeof msg.seq === "number") {
              handleIncoming(msg as SyncEvent)
            }
          } catch {
            // ignore malformed frame
          }
        }
        ws.onclose = () => {
          if (!cancelled) {
            setWsLive(false)
            reconnectTimer = setTimeout(connectWs, 2500)
          }
        }
        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        setWsLive(false)
      }
    }

    connectWs()

    // Heartbeat + cursor poll guarantees 0 dropped events even through strict HTTP proxies
    const poll = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ping" }))
        } catch {
          // ignore
        }
      }
      mobileApi
        .pollSync(roomId, seqRef.current, peerId, role, deviceLabel)
        .then((res) => {
          if (cancelled) return
          setPeers(res.peers)
          for (const evt of res.events) {
            handleIncoming(evt)
          }
        })
        .catch(() => {})
    }

    poll()
    const interval = setInterval(poll, 1800)

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(interval)
      ws?.close()
      wsRef.current = null
    }
  }, [roomId, peerId, role, deviceLabel, handleIncoming])

  const broadcast = useCallback(
    (type: string, payload: Record<string, any>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type, payload }))
          return
        } catch {
          // fall through to HTTP POST
        }
      }
      void mobileApi.publishSync(roomId, type, payload, peerId).catch(() => {})
    },
    [roomId, peerId],
  )

  const mobilePeers = peers.filter((p) => p.role === "mobile")

  return {
    peerId,
    peers,
    mobilePeers,
    wsLive,
    banner,
    flashBanner,
    broadcast,
  }
}

/**
 * Desktop Modal: QR Code Pairing + Instant HTTPS Tunnel + Auto-Detected LAN IP.
 */
export function MobilePairingModal({
  roomId,
  mobilePeers,
  onClose,
  onOpenLocalMobilePreview,
}: {
  roomId: string
  mobilePeers: MobilePeer[]
  onClose: () => void
  onOpenLocalMobilePreview: () => void
}) {
  const [info, setInfo] = useState<MobileConnectionInfo | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string>("")
  const [customUrl, setCustomUrl] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState("")

  const refresh = useCallback(() => {
    mobileApi
      .info(roomId)
      .then((res) => {
        setInfo(res)
        setSelectedUrl((prev) => {
          if (res.tunnel_companion_url) return res.tunnel_companion_url
          if (!prev) return res.recommended_url
          return prev
        })
      })
      .catch((e) => setErr((e as Error).message))
  }, [roomId])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2200)
    return () => clearInterval(t)
  }, [refresh])

  const startTunnel = async () => {
    setBusy(true)
    setErr("")
    try {
      const st = await mobileApi.startTunnel()
      if (st.error) setErr(st.error)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stopTunnel = async () => {
    setBusy(true)
    try {
      await mobileApi.stopTunnel()
      setSelectedUrl("")
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const applyCustomUrl = async () => {
    setBusy(true)
    setErr("")
    try {
      const st = await mobileApi.setTunnelUrl(customUrl)
      if (st.error) setErr(st.error)
      else setCustomUrl("")
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const activeUrl = selectedUrl || info?.recommended_url || ""
  const isHttps = activeUrl.startsWith("https://")

  const copyLink = () => {
    if (!activeUrl) return
    navigator.clipboard?.writeText(activeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="modalback" onClick={onClose}>
      <div className="panel modal pairing-modal" onClick={(e) => e.stopPropagation()}>
        <button className="iconbtn close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="pairing-header">
          <span className="tag accent-tag">
            <Smartphone size={12} /> LIVE DESKTOP ↔ MOBILE FIELD SYNC · ROOM {roomId}
          </span>
          <h2>Pair your phone as a Live Field Sensor</h2>
          <p>
            Scan with iPhone Camera or Android Lens. Capture 5s machine acoustics, rear-camera
            part photos, or voice commands on your phone — 3D fault highlights, FFT spectra, and
            Repair Kits update live on this big screen.
          </p>
        </div>

        <div className="pairing-grid">
          <div className="qr-card">
            {activeUrl ? (
              <img
                src={mobileApi.qrSvgUrl(activeUrl)}
                alt={`QR Code for ${activeUrl}`}
                className="qr-svg"
              />
            ) : (
              <div className="qr-placeholder">Generating QR…</div>
            )}
            <div className={`secure-pill ${isHttps ? "ok" : "warn"}`}>
              {isHttps ? (
                <>
                  <ShieldCheck size={14} /> HTTPS Active · Live WebAudio Mic + Camera Unlocked
                </>
              ) : (
                <>
                  <Wifi size={14} /> LAN Wi-Fi HTTP · Native Camera Ready (Enable HTTPS for Live Mic)
                </>
              )}
            </div>
          </div>

          <div className="pairing-controls">
            <div className="pairing-section">
              <div className="section-label">1. HTTPS TUNNEL (VENUE WI-FI &amp; CELLULAR)</div>
              {info?.tunnel.status === "ready" && info.tunnel_companion_url ? (
                <div className="tunnel-active-box">
                  <div>
                    <strong>{info.tunnel.provider?.toUpperCase()} HTTPS Tunnel Live</strong>
                    <small>{info.tunnel.url}</small>
                  </div>
                  <div className="hk-row">
                    <button
                      type="button"
                      className={`hk-chip ${activeUrl === info.tunnel_companion_url ? "on" : ""}`}
                      onClick={() => setSelectedUrl(info.tunnel_companion_url!)}
                    >
                      <Globe size={12} /> Use HTTPS QR
                    </button>
                    <button type="button" className="hk-chip" disabled={busy} onClick={stopTunnel}>
                      Stop
                    </button>
                  </div>
                </div>
              ) : (
                <div className="tunnel-launch-box">
                  <button
                    type="button"
                    className="startbtn"
                    disabled={busy || info?.tunnel.status === "starting"}
                    onClick={startTunnel}
                  >
                    <Zap size={15} />
                    {busy || info?.tunnel.status === "starting"
                      ? "Starting HTTPS Tunnel…"
                      : "Start Instant HTTPS Tunnel (Zero-Config)"}
                  </button>
                  <small>
                    Uses <code>cloudflared</code> or built-in macOS SSH (<code>localhost.run</code>)
                    so iOS/Android unlock live WebAudio microphone &amp; work across isolated venue Wi-Fi.
                  </small>
                </div>
              )}

              <div className="custom-tunnel-row">
                <input
                  type="url"
                  placeholder="Or paste custom https:// ngrok / Tailscale URL…"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                />
                <button type="button" className="btn" disabled={busy || !customUrl.trim()} onClick={applyCustomUrl}>
                  Set URL
                </button>
              </div>
            </div>

            <div className="pairing-section">
              <div className="section-label">2. AUTO-DETECTED LOCAL WI-FI / HOTSPOT</div>
              <div className="hk-row">
                {(info?.lan_companion_urls ?? []).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`hk-chip ${activeUrl === u ? "on" : ""}`}
                    onClick={() => setSelectedUrl(u)}
                  >
                    <Wifi size={12} /> {u.replace(/^https?:\/\//, "").split("/")[0]}
                  </button>
                ))}
                {!info?.lan_companion_urls?.length && (
                  <span className="muted">No external LAN interface detected (localhost only).</span>
                )}
              </div>
            </div>

            <div className="pairing-section">
              <div className="section-label">ACTIVE COMPANION LINK</div>
              <div className="copy-url-box">
                <code>{activeUrl}</code>
                <button type="button" className="btn" onClick={copyLink}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className={`peer-status-box ${mobilePeers.length > 0 ? "connected" : ""}`}>
              <Smartphone size={16} />
              <div>
                <strong>
                  {mobilePeers.length > 0
                    ? `${mobilePeers.length} Mobile Device${mobilePeers.length > 1 ? "s" : ""} Synced Live`
                    : "Waiting for mobile scan…"}
                </strong>
                <small>
                  {mobilePeers.length > 0
                    ? mobilePeers.map((p) => p.device || p.peer_id).join(" · ")
                    : "Scan the QR code above or preview Mobile Field Mode right here."}
                </small>
              </div>
              <button type="button" className="btn" onClick={onOpenLocalMobilePreview}>
                Preview Mobile UI
              </button>
            </div>

            {err && <div className="eng-error">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Full Dedicated Mobile Field Companion View (Thumb-zone navigation, Rear Camera,
 * 5s Live Acoustic Probe, Voice Copilot, Synchronized 3D Twin & Assembly Guide).
 */
export function MobileFieldView({
  roomId,
  machineId,
  pack,
  packList,
  demoAssets,
  speed,
  assistSession,
  latestTurn,
  suspectId,
  externalFaultId,
  syncWsLive,
  syncBanner,
  onSwitchMachine,
  onTurnReceived,
  onFaultScenarioSelected,
  onBroadcast,
  onExitMobileMode,
}: {
  roomId: string
  machineId: string
  pack: Pack | null
  packList: { machine: string; name: string; kind: string; components: number }[]
  demoAssets: DemoAsset[]
  speed: number
  assistSession: string | null
  latestTurn: AssistTurn | null
  suspectId: string | null
  externalFaultId: string | null
  syncWsLive: boolean
  syncBanner: string | null
  onSwitchMachine: (id: string) => void
  onTurnReceived: (turn: AssistTurn) => void
  onFaultScenarioSelected: (faultId: string) => void
  onBroadcast: (type: string, payload: Record<string, any>) => void
  onExitMobileMode: () => void
}) {
  const [tab, setTab] = useState<"diagnose" | "twin" | "assembly" | "parts">("diagnose")
  const [tts, setTts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState("")
  const [promptText, setPromptText] = useState("")
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)

  // Assembly Guide state
  const [guide, setGuide] = useState<AssemblyGuideResult | null>(null)
  const [guideIdx, setGuideIdx] = useState(0)

  // Inventory tab state
  const [invQuery, setInvQuery] = useState("")
  const [invParts, setInvParts] = useState<InvPart[]>([])
  const [kitBusy, setKitBusy] = useState<string | null>(null)

  // Distill feedback state
  const [actualFault, setActualFault] = useState("outer_ring_damage")
  const [techNote, setTechNote] = useState("")
  const [distillOut, setDistillOut] = useState("")

  const acoustic = useAcousticCapture()
  const isSecureMic =
    typeof window !== "undefined" &&
    Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia)

  const geom = geomOfKind(pack?.meta.kind ?? "bearing")
  const defaultEngineering = useMemo(() => createSession(geom).applied, [geom])

  useEffect(() => {
    if (tab === "parts") {
      invApi
        .search(machineId, invQuery)
        .then((r) => setInvParts(r.parts))
        .catch(() => {})
    }
  }, [tab, machineId, invQuery])

  const sendMobileCapture = async (
    msg: string,
    wavFile?: File | null,
    photoFile?: File | null,
  ) => {
    setBusy(true)
    setStatusMsg(
      wavFile
        ? `Analyzing ${wavFile.name} (FFT + multi-band envelope) & syncing to Desktop…`
        : photoFile
          ? `Segmenting ${photoFile.name} (Meta SAM 2.1 + muse-spark-1.3) & syncing to Desktop…`
          : "Running 6-agent field diagnosis & syncing to Desktop…",
    )
    try {
      const turn = await mobileApi.capture(
        roomId,
        machineId,
        msg,
        assistSession,
        photoFile ?? null,
        wavFile ?? null,
        speed,
        "mobile",
      )
      onTurnReceived(turn)
      setStatusMsg("Synced to Desktop Studio!")
      speakText(turn.reply, tts)
    } catch (e) {
      setStatusMsg(`Field capture error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const voice = useVoiceInput(machineId, (spoken) => {
    setPromptText(spoken)
    void sendMobileCapture(spoken)
  })

  const handleLive5sProbe = async () => {
    const wav = await acoustic.capture5s(5000)
    if (wav) {
      await sendMobileCapture(
        `Diagnose 5-second live field acoustic capture at ${speed} RPM and prepare repair kit if damaged.`,
        wav,
        null,
      )
    }
  }

  const runMobileAssembly = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setStatusMsg(`Grounding ${file.name} with Meta SAM 2.1…`)
    try {
      const res = await mobileApi.assemblyGuide(roomId, machineId, file, "mobile")
      setGuide(res)
      setGuideIdx(0)
      setStatusMsg(`Grounded ${res.steps.length} steps (${res.elapsed_ms} ms) — synced to Desktop!`)
      if (res.steps[0]) {
        speakText(
          `Step 1: ${res.steps[0].component_name}. ${res.steps[0].instruction}. ${res.steps[0].torque_or_check}`,
          tts,
        )
      }
    } catch (e) {
      setStatusMsg(`Assembly guide error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const stepAssembly = (nextIdx: number) => {
    if (!guide || !guide.steps.length) return
    const bounded = Math.max(0, Math.min(guide.steps.length - 1, nextIdx))
    setGuideIdx(bounded)
    const st = guide.steps[bounded]
    if (st) {
      onBroadcast("assembly_step", {
        machine: machineId,
        step_index: bounded,
        placed_ids: guide.steps.slice(0, bounded + 1).flatMap((s) => s.parts),
        highlight_id: st.component_id,
        caption: `Step ${st.step}: ${st.component_name}`,
      })
      speakText(
        `Step ${st.step}: ${st.component_name}. ${st.instruction}. ${st.torque_or_check}`,
        tts,
      )
    }
  }

  const demoWavs = demoAssets.filter((a) => a.filename.toLowerCase().endsWith(".wav"))
  const demoPhotos = demoAssets.filter((a) =>
    /\.(png|jpg|jpeg|webp)$/i.test(a.filename),
  )

  const submitDistill = async () => {
    setDistillOut("Distilling technician lesson into Harness²…")
    try {
      const predicted =
        (latestTurn?.sound as any)?.probe_verdict?.suggests ??
        latestTurn?.suspect_component ??
        "healthy"
      const res = await harnessApi.distill(machineId, {
        predicted: String(predicted),
        actual: actualFault,
        reasoning: latestTurn?.reply ?? "Field inspection",
        technician_note: techNote || "Verified on mobile teardown inspection",
      })
      setDistillOut(`Evolved to ${res.harness.version}: ${res.lesson.lesson}`)
      onBroadcast("harness_distilled", {
        machine: machineId,
        version: res.harness.version,
        lesson: res.lesson.lesson,
      })
    } catch (e) {
      setDistillOut(`Distill failed: ${(e as Error).message}`)
    }
  }

  const draftPartKit = async (componentId: string) => {
    setKitBusy(componentId)
    try {
      const kit = await invApi.repairKit(machineId, componentId, true)
      onBroadcast("repair_kit_drafted", { machine: machineId, kit })
      setStatusMsg(`Drafted Repair Kit for ${componentId} ($${kit.estimated_total.toFixed(2)}) — synced to Desktop!`)
      setTab("diagnose")
      onTurnReceived({
        ...(latestTurn ?? {
          session: assistSession ?? "mobile",
          reply: `Prepared BOM Repair Kit for **${componentId}**.`,
          specialists: ["inventory_procurement"],
          vision: null,
          sound: null,
          chat: { answer: "", citations: [], citations_dropped: 0 },
          playbook: null,
          next_checks: [],
          needs: [],
          usage: { input_tokens: 0, output_tokens: 0 },
          session_usage: { input_tokens: 0, output_tokens: 0 },
        }),
        suspect_component: componentId,
        repair_kit: kit,
      })
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setKitBusy(null)
    }
  }

  const curStep = guide?.steps[guideIdx] ?? null

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <div className="mobile-logo">
            <Layers size={18} />
          </div>
          <div>
            <strong>FORMA FIELD</strong>
            <span className="sync-dot-pill">
              <i className={syncWsLive ? "live" : ""} /> ROOM {roomId}
            </span>
          </div>
        </div>

        <div className="mobile-top-actions">
          <button
            type="button"
            className={`mobile-icon-btn ${tts ? "active" : ""}`}
            aria-label="Toggle voice output"
            onClick={() => setTts((v) => !v)}
          >
            {tts ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            type="button"
            className="mobile-studio-btn"
            onClick={onExitMobileMode}
            title="Switch to full Desktop Studio layout"
          >
            <Monitor size={14} /> Studio
          </button>
        </div>
      </header>

      <div className="mobile-machine-bar">
        <Box size={15} />
        <select
          aria-label="Active machine"
          value={machineId}
          onChange={(e) => {
            onSwitchMachine(e.target.value)
            onBroadcast("machine_switched", { machine: e.target.value })
          }}
        >
          {packList.map((p) => (
            <option key={p.machine} value={p.machine}>
              {p.name} ({p.components} parts)
            </option>
          ))}
        </select>
      </div>

      {syncBanner && (
        <div className="sync-live-toast">
          <Radio size={14} /> {syncBanner}
        </div>
      )}

      <main className="mobile-main">
        {tab === "diagnose" && (
          <div className="mobile-stack">
            <div className="mobile-hero-grid">
              {isSecureMic ? (
                <button
                  type="button"
                  className={`mobile-big-action lime ${acoustic.capturing ? "recording" : ""}`}
                  disabled={busy}
                  onClick={() =>
                    acoustic.capturing ? acoustic.cancel() : void handleLive5sProbe()
                  }
                >
                  <Waves size={26} />
                  <strong>
                    {acoustic.capturing ? "Stop 5s Probe" : "5s Live Acoustic"}
                  </strong>
                  <small>Raw PCM FFT + Bearing SNR</small>
                  {acoustic.capturing && (
                    <div className="hk-meter" style={{ width: "100%", marginTop: 8 }}>
                      <i style={{ width: `${Math.round(acoustic.level * 100)}%` }} />
                    </div>
                  )}
                </button>
              ) : (
                <label className="mobile-big-action lime">
                  <Waves size={26} />
                  <strong>Record Machine Audio</strong>
                  <small>Native OS Mic → Live FFT Sync</small>
                  <input
                    type="file"
                    accept="audio/*"
                    capture
                    disabled={busy}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        void sendMobileCapture(
                          `Analyze field audio ${f.name} at ${speed} RPM`,
                          f,
                          null,
                        )
                      }
                    }}
                  />
                </label>
              )}

              <label className="mobile-big-action cyan">
                <Camera size={26} />
                <strong>Snap Part / Drawing</strong>
                <small>Rear Camera → SAM 2.1 Mask</small>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      void sendMobileCapture(
                        "Identify this machine component, check wear, and verify spare stock.",
                        null,
                        f,
                      )
                    }
                  }}
                />
              </label>
            </div>

            {/* Instant 1-tap stage demo simulators so live stage demos never miss a beat */}
            {(demoWavs.length > 0 || demoPhotos.length > 0) && (
              <div className="mobile-card">
                <div className="section-label">INSTANT STAGE TEST SIGNALS (SYNC TO DESKTOP)</div>
                <div className="hk-row" style={{ marginTop: 8 }}>
                  {demoWavs.slice(0, 3).map((a) => (
                    <button
                      key={a.url}
                      type="button"
                      className="hk-chip"
                      disabled={busy}
                      onClick={async () => {
                        const f = await fetchDemoFile(a)
                        await sendMobileCapture(
                          `Field acoustic probe (${a.filename}) — run multi-band SNR & draft repair kit`,
                          f,
                          null,
                        )
                      }}
                    >
                      <Activity size={12} /> {a.filename.replace(/\.wav$/i, "")}
                    </button>
                  ))}
                  {demoPhotos.slice(0, 2).map((a) => (
                    <button
                      key={a.url}
                      type="button"
                      className="hk-chip"
                      disabled={busy}
                      onClick={async () => {
                        const f = await fetchDemoFile(a)
                        await sendMobileCapture(
                          `Inspect workbench capture (${a.filename}) & check replacement stock`,
                          null,
                          f,
                        )
                      }}
                    >
                      <Eye size={12} /> {a.filename.replace(/\.\w+$/, "")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mobile-card">
              <div className="section-label">VOICE &amp; TEXT FIELD COPILOT</div>
              <button
                type="button"
                className={`mobile-voice-bar ${voice.listening ? "listening" : ""}`}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
              >
                <Mic size={18} />
                <span>
                  {voice.listening
                    ? "Listening… Tap to stop"
                    : "Push-to-Talk Voice Diagnosis"}
                </span>
              </button>
              {voice.message && <small className="mobile-subtle">{voice.message}</small>}

              <form
                className="mobile-prompt-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!promptText.trim()) return
                  const msg = promptText
                  setPromptText("")
                  void sendMobileCapture(msg)
                }}
              >
                <input
                  type="text"
                  placeholder="Ask manual spec, torque, or symptom…"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                />
                <button type="submit" disabled={busy || !promptText.trim()} aria-label="Send">
                  <Send size={16} />
                </button>
              </form>

              <div className="hk-row">
                {[
                  "Bearing grinding at 1500 rpm — check stock",
                  "Pump runs with low pressure — troubleshoot",
                  "Increase motor speed to 2400 rpm",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="hk-chip"
                    disabled={busy}
                    onClick={() => void sendMobileCapture(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {(busy || statusMsg || acoustic.status) && (
              <div className="mobile-status-strip">
                <RefreshCw size={14} className={busy ? "spin-icon" : ""} />
                <span>{busy ? statusMsg : statusMsg || acoustic.status}</span>
              </div>
            )}

            {latestTurn && (
              <div className="mobile-card result-card">
                <div className="mobile-result-head">
                  <span className="tag accent-tag">LIVE 6-AGENT VERDICT · SYNCED</span>
                  {latestTurn.suspect_component && (
                    <button
                      type="button"
                      className="hk-chip amber-chip"
                      onClick={() => {
                        onBroadcast("focus_component", {
                          machine: machineId,
                          component_id: latestTurn.suspect_component,
                          explode: 0.85,
                        })
                        setStatusMsg(`Focused ${latestTurn.suspect_component} on Desktop 3D!`)
                      }}
                    >
                      <AlertTriangle size={12} /> Suspect: {latestTurn.suspect_component} (Focus 3D)
                    </button>
                  )}
                </div>

                {(latestTurn.vision as any)?.overlay_b64 && (
                  <img
                    src={`data:image/png;base64,${(latestTurn.vision as any).overlay_b64}`}
                    alt="SAM 2.1 segmented part"
                    className="mobile-mask-img"
                  />
                )}

                <div className="mobile-reply-body">{latestTurn.reply}</div>

                {(latestTurn.sound as any)?.probe_verdict && (
                  <div className="mobile-probe-pill">
                    <strong>
                      Harness² Acoustic Verdict:{" "}
                      {(latestTurn.sound as any).probe_verdict.suggests}
                    </strong>
                    <small>{(latestTurn.sound as any).probe_verdict.rationale}</small>
                  </div>
                )}

                {latestTurn.repair_kit && (
                  <RepairKitCard
                    kit={latestTurn.repair_kit}
                    onOrderUpdated={(ord: InvOrder) => {
                      onBroadcast("order_updated", { machine: machineId, order: ord })
                      setStatusMsg(`PO #${ord.confirmation ?? ord.id} confirmed & synced to Desktop!`)
                    }}
                  />
                )}

                {latestTurn.chat?.citations?.length > 0 && (
                  <div className="mobile-citations">
                    <div className="section-label">VERIFIED MANUAL CITATIONS</div>
                    {latestTurn.chat.citations.map((c, idx) => (
                      <div key={idx} className="mobile-cite-item">
                        <b>{c.file}</b>: “{c.quote}”
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "twin" && (
          <div className="mobile-stack">
            <div className="mobile-card">
              <div className="section-label">
                SYNCHRONIZED 3D DIGITAL TWIN (TAP FAULT TO ANIMATE DESKTOP)
              </div>
              {pack && (
                <>
                  <div className="hk-row" style={{ marginBottom: 10 }}>
                    {(pack.scenarios ?? []).map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`hk-chip ${externalFaultId === sc.id ? "on" : ""}`}
                        onClick={() => {
                          onFaultScenarioSelected(sc.id)
                          onBroadcast("fault_scenario", {
                            machine: machineId,
                            scenario_id: sc.id,
                            parts: sc.parts,
                          })
                        }}
                      >
                        <Zap size={12} /> {sc.label}
                      </button>
                    ))}
                  </div>
                  <AssemblySim
                    pack={pack}
                    machineId={machineId}
                    onSelect={(cid) => {
                      setSelectedPartId(cid)
                      onBroadcast("focus_component", {
                        machine: machineId,
                        component_id: cid,
                        explode: 0.65,
                      })
                    }}
                    labelFor={(id) => pack.components.find((c) => c.id === id)?.name ?? id}
                    suspect={suspectId}
                    selectedId={selectedPartId}
                    scales={scalesFor(defaultEngineering)}
                    externalFaultId={externalFaultId}
                    onFaultChange={(fid) => {
                      onFaultScenarioSelected(fid)
                      onBroadcast("fault_scenario", {
                        machine: machineId,
                        scenario_id: fid,
                      })
                    }}
                  />
                </>
              )}
            </div>

            <div className="mobile-card">
              <div className="section-label">TECHNICIAN TEARDOWN → EVOLVE HARNESS²</div>
              <p className="mobile-subtle" style={{ marginTop: 6 }}>
                Confirm actual physical fault after inspection to distill a persistent diagnostic
                rule across all future investigations.
              </p>
              <div className="mobile-distill-row">
                <select
                  value={actualFault}
                  onChange={(e) => setActualFault(e.target.value)}
                  aria-label="Actual teardown fault"
                >
                  <option value="healthy">Healthy (No Damage)</option>
                  <option value="inner_ring_damage">Inner Ring Spalling</option>
                  <option value="outer_ring_damage">Outer Ring Spalling</option>
                  <option value="seal_leak">Mechanical Seal Wear</option>
                </select>
                <input
                  type="text"
                  placeholder="Optional teardown note (e.g. sensor mount rattle)…"
                  value={techNote}
                  onChange={(e) => setTechNote(e.target.value)}
                />
                <button type="button" className="startbtn" onClick={submitDistill}>
                  <ShieldCheck size={15} /> Distill Lesson into Harness²
                </button>
                {distillOut && <small className="mobile-accent-note">{distillOut}</small>}
              </div>
            </div>
          </div>
        )}

        {tab === "assembly" && (
          <div className="mobile-stack">
            <div className="mobile-card">
              <span className="tag accent-tag">META SAM 2.1 + MUSE-SPARK-1.3</span>
              <h3 style={{ marginTop: 8, fontSize: 17 }}>Workbench Photo → Step-by-Step Guide</h3>
              <p className="mobile-subtle" style={{ marginTop: 4 }}>
                Snap laid-out parts with your rear camera. Stepping through cards advances the 3D
                rig on both your phone and the Desktop big screen!
              </p>

              <label className="mobile-big-action cyan" style={{ marginTop: 12 }}>
                <Camera size={24} />
                <strong>{busy ? "Segmenting masks…" : "Capture Workbench Parts"}</strong>
                <small>Opens Rear Camera · Broadcasts 3D Build to Desktop</small>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  style={{ display: "none" }}
                  onChange={(e) => void runMobileAssembly(e.target.files?.[0])}
                />
              </label>

              {demoPhotos.length > 0 && (
                <div className="hk-row" style={{ marginTop: 10 }}>
                  {demoPhotos.slice(0, 3).map((a) => (
                    <button
                      key={a.url}
                      type="button"
                      className="hk-chip"
                      disabled={busy}
                      onClick={async () => {
                        const f = await fetchDemoFile(a)
                        await runMobileAssembly(f)
                      }}
                    >
                      <Eye size={12} /> {a.filename}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {guide && curStep && (
              <div className="mobile-card result-card">
                <img
                  src={`data:image/png;base64,${guide.overlay_b64}`}
                  alt="SAM 2.1 Assembly Masks"
                  className="mobile-mask-img"
                />
                <div className="mobile-step-header">
                  <span className="eyebrow">
                    STEP {curStep.step} OF {guide.steps.length}
                  </span>
                  <span className="tag">{curStep.component_id}</span>
                </div>
                <h4 style={{ fontSize: 18, color: "var(--accent)", marginTop: 6 }}>
                  {curStep.component_name}
                </h4>
                <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>
                  {curStep.instruction}
                </p>
                <div className="mobile-torque-callout">
                  Torque / Verification: <strong>{curStep.torque_or_check}</strong>
                </div>

                <div className="mobile-step-nav">
                  <button
                    type="button"
                    className="btn"
                    disabled={guideIdx <= 0}
                    onClick={() => stepAssembly(guideIdx - 1)}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="startbtn"
                    style={{ width: "auto", flex: 1 }}
                    disabled={guideIdx >= guide.steps.length - 1}
                    onClick={() => stepAssembly(guideIdx + 1)}
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "parts" && (
          <div className="mobile-stack">
            <div className="mobile-card">
              <div className="section-label">SPARE PARTS &amp; 1-TAP REPAIR KITS</div>
              <input
                type="search"
                className="mobile-search-input"
                placeholder="Search bearings, seals, shafts, SKUs…"
                value={invQuery}
                onChange={(e) => setInvQuery(e.target.value)}
              />
              <div className="mobile-parts-list">
                {invParts.slice(0, 20).map((p) => (
                  <div key={p.id} className="mobile-part-row">
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.sku} · ${p.unit_price.toFixed(2)} ·{" "}
                        <b className={p.stock_qty > 0 ? "ok-txt" : "amber-txt"}>
                          {p.stock_qty} in stock
                        </b>{" "}
                        ({p.lead_days}d lead)
                      </small>
                    </div>
                    <button
                      type="button"
                      className="hk-chip on"
                      disabled={!p.component_id || kitBusy === p.component_id}
                      onClick={() => {
                        if (p.component_id) void draftPartKit(p.component_id)
                      }}
                    >
                      {kitBusy === p.component_id ? "Drafting…" : "Draft Kit"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Field companion navigation">
        <button
          type="button"
          className={tab === "diagnose" ? "active" : ""}
          onClick={() => setTab("diagnose")}
        >
          <Waves size={20} />
          <span>Diagnose</span>
        </button>
        <button
          type="button"
          className={tab === "twin" ? "active" : ""}
          onClick={() => setTab("twin")}
        >
          <Box size={20} />
          <span>3D Twin</span>
        </button>
        <button
          type="button"
          className={tab === "assembly" ? "active" : ""}
          onClick={() => setTab("assembly")}
        >
          <Camera size={20} />
          <span>Assembly</span>
        </button>
        <button
          type="button"
          className={tab === "parts" ? "active" : ""}
          onClick={() => setTab("parts")}
        >
          <Package size={20} />
          <span>Parts</span>
        </button>
      </nav>
    </div>
  )
}
