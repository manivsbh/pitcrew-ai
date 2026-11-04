import { useEffect, useRef, useState } from "react"
import CrewDock from "./CrewDock"

interface MetaCall {
  seq: number
  ts: number
  agent: string
  model: string
  host: string
  status: string
  latency_ms: number
  response_id: string | null
  input_tokens: number
  output_tokens: number
  error: string | null
  detail: string | null
}

const KEEP = 40
const STORAGE_KEY = "pitcrew.metaCallLog.open"

function initialOpen(): boolean {
  const q = new URLSearchParams(window.location.search).get("calls")
  if (q !== null) return q !== "0"
  return localStorage.getItem(STORAGE_KEY) === "1"
}

function clock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour12: false })
}

function shortId(id: string | null): string {
  if (!id) return "-"
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id
}

export default function MetaCallLog() {
  const [open, setOpen] = useState(initialOpen)
  const [calls, setCalls] = useState<MetaCall[]>([])
  const [inflight, setInflight] = useState<{ agent: string; model: string; elapsed_ms: number }[]>([])
  const [total, setTotal] = useState(0)
  const [online, setOnline] = useState(true)
  const lastSeq = useRef(0)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0")
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    let stop = false
    let busy = false
    let skipHistory =
      new URLSearchParams(window.location.search).get("calls") === "live"
    const poll = async () => {
      if (busy) return
      busy = true
      try {
        const r = await fetch(`/api/meta/calls?after=${lastSeq.current}&limit=${KEEP}`)
        if (!r.ok) throw new Error(String(r.status))
        const body = (await r.json()) as {
          calls: MetaCall[]
          inflight?: { agent: string; model: string; elapsed_ms: number }[]
        }
        if (stop) return
        setOnline(true)
        setInflight(body.inflight ?? [])
        if (skipHistory) {
          skipHistory = false
          if (body.calls.length) lastSeq.current = body.calls[body.calls.length - 1].seq
          return
        }
        const fresh = body.calls.filter((c) => c.seq > lastSeq.current)
        if (fresh.length) {
          lastSeq.current = fresh[fresh.length - 1].seq
          setTotal((n) => n + fresh.length)
          setCalls((prev) => [...fresh.slice().reverse(), ...prev].slice(0, KEEP))
        }
      } catch {
        if (!stop) setOnline(false)
      } finally {
        busy = false
      }
    }
    poll()
    const id = window.setInterval(poll, 1000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  const last = calls[0]

  if (!open) {
    return (
      <button
        type="button"
        className="meta-log-pill"
        onClick={() => setOpen(true)}
        title="Show live Meta model calls (Alt+M)"
      >
        <span className={`meta-log-dot ${online ? "" : "is-off"}`} />
        META CALLS · {total}
        {last ? ` · ${last.model} ${last.latency_ms}ms` : ""}
      </button>
    )
  }

  return (
    <aside className="meta-log" aria-label="Live Meta model calls" aria-live="polite">
      <header className="meta-log-head">
        <span className={`meta-log-dot ${online ? "" : "is-off"}`} />
        <strong>LIVE META MODEL CALLS</strong>
        <span className="meta-log-count">{total}</span>
        <button type="button" className="meta-log-close" onClick={() => setOpen(false)}
          title="Hide (Alt+M)" aria-label="Hide call log">
          ×
        </button>
      </header>
      <p className="meta-log-sub">
        muse-spark-1.3 via api.meta.ai/v1 · SAM 2.1, wav2vec 2.0, MMS-TTS on-device
      </p>
      <CrewDock calls={calls} inflight={inflight} />
      <ol className="meta-log-list">
        {calls.length === 0 && (
          <li className="meta-log-empty">Waiting for the first model call…</li>
        )}
        {calls.map((c) => (
          <li key={c.seq} className={`meta-log-row ${c.status === "ok" ? "" : "is-error"}`}>
            <div className="meta-log-line">
              <span className="meta-log-time">{clock(c.ts)}</span>
              <span className="meta-log-agent">{c.agent}</span>
              <span className="meta-log-lat">{c.latency_ms} ms</span>
            </div>
            <div className="meta-log-line meta-log-dim">
              <span>{c.model}</span>
              <span>@ {c.host}</span>
            </div>
            <div className="meta-log-line meta-log-dim">
              <span>{c.error ? `error ${c.error}` : shortId(c.response_id)}</span>
              <span>
                {c.detail ?? `in ${c.input_tokens} · out ${c.output_tokens} tok`}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
