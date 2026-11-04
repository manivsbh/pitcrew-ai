import { useEffect, useRef, useState } from "react"
import { encodeWavFile, prepareTap, tapPcm } from "./useAcousticCapture"

const MAX_TALK_MS = 7000
const MIN_TALK_S = 0.5

let currentAudio: HTMLAudioElement | null = null
let pendingSpeech: AbortController | null = null

/** Speak copilot text aloud with Meta MMS-TTS (local backend) when enabled. */
export function speakText(text: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined" || !text.trim()) return
  stopSpeaking()
  const ctrl = new AbortController()
  pendingSpeech = ctrl
  fetch("/api/speech/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 600) }),
    signal: ctrl.signal,
  })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((blob) => {
      if (ctrl.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      currentAudio = audio
      void audio.play().catch(() => undefined)
    })
    .catch(() => undefined)
}

export function stopSpeaking(): void {
  pendingSpeech?.abort()
  pendingSpeech = null
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

/**
 * Push-to-talk: records the microphone, then transcribes locally with Meta
 * wav2vec 2.0 on the backend. `stop()` ends the recording and sends it.
 */
export function useVoiceInput(
  machine: string,
  onTranscript: (s: string) => void,
) {
  const [listening, setListening] = useState(false),
    [message, setMessage] = useState("")
  const finish = useRef<((send: boolean) => void) | null>(null),
    callback = useRef(onTranscript)
  callback.current = onTranscript

  const discard = () => finish.current?.(false)
  const stop = () => finish.current?.(true)

  useEffect(() => {
    setMessage("")
    window.addEventListener("forma-workspace-hidden", discard)
    return () => {
      window.removeEventListener("forma-workspace-hidden", discard)
      discard()
    }
  }, [machine])

  const send = async (wav: File) => {
    setMessage("Transcribing with Meta wav2vec 2.0…")
    try {
      const form = new FormData()
      form.append("audio", wav)
      const r = await fetch("/api/speech/transcribe", { method: "POST", body: form })
      const body = (await r.json()) as { text?: string; error?: string }
      if (!r.ok || body.error) throw new Error(body.error ?? String(r.status))
      const transcript = (body.text ?? "").trim()
      if (!transcript) {
        setMessage("Didn't catch that. Try again or type instead.")
        return
      }
      setMessage(`Transcript: ${transcript}`)
      callback.current(transcript)
    } catch (err) {
      setMessage(`Voice input failed (${(err as Error).message}). You can type instead.`)
    }
  }

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Microphone is unavailable in this browser. Type the same command instead.")
      return
    }
    discard()
    stopSpeaking()
    const ctx = new AudioContext()
    await prepareTap(ctx)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // browser DSP mutes the first seconds while it adapts; wav2vec wants raw audio
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch {
      void ctx.close()
      setMessage("Microphone could not start. Check permissions or type instead.")
      return
    }
    await ctx.resume().catch(() => undefined)
    const source = ctx.createMediaStreamSource(stream)
    const chunks: Float32Array[] = []
    const untap = await tapPcm(ctx, source, (c) => chunks.push(c))
    setListening(true)
    setMessage("Listening… press again to send (Meta wav2vec 2.0, on-device).")
    const timer = window.setTimeout(() => finish.current?.(true), MAX_TALK_MS)
    finish.current = async (doSend) => {
      finish.current = null
      window.clearTimeout(timer)
      setListening(false)
      await untap()
      stream.getTracks().forEach((t) => t.stop())
      const rate = ctx.sampleRate
      void ctx.close()
      const total = chunks.reduce((n, c) => n + c.length, 0)
      if (!doSend) return
      if (total / rate < MIN_TALK_S) {
        setMessage("Too short. Hold the thought a little longer.")
        return
      }
      const merged = new Float32Array(total)
      let pos = 0
      for (const c of chunks) {
        merged.set(c, pos)
        pos += c.length
      }
      void send(encodeWavFile(merged, rate, "voice-command.wav"))
    }
  }

  return { listening, message, start, stop }
}
