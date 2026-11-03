import { useEffect, useRef, useState } from "react"

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  abort(): void
  onresult: ((e: {
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
  }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

/** Speak concise copilot text aloud via Web Speech synthesis when enabled. */
export function speakText(text: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return
  }
  try {
    window.speechSynthesis.cancel()
    const clean = text
      .replace(/\[[^\]]+\]/g, "")
      .replace(/[*_`#>]/g, "")
      .slice(0, 380)
      .trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    u.rate = 1.03
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
  } catch {
    // Non-blocking fallback when browser speech synthesis is restricted
  }
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }
}

export function useVoiceInput(
  machine: string,
  onTranscript: (s: string) => void,
) {
  const [listening, setListening] = useState(false),
    [message, setMessage] = useState("")
  const recognition = useRef<Recognition | null>(null),
    callback = useRef(onTranscript)
  callback.current = onTranscript
  const stop = () => {
    const r = recognition.current
    recognition.current = null
    if (r) {
      r.onresult = null
      r.onerror = null
      r.onend = null
      r.abort()
    }
    setListening(false)
  }
  useEffect(() => {
    setMessage("")
    window.addEventListener("forma-workspace-hidden", stop)
    return () => {
      window.removeEventListener("forma-workspace-hidden", stop)
      stop()
    }
  }, [machine])
  const start = () => {
    const scope = window as unknown as {
      SpeechRecognition?: new () => Recognition
      webkitSpeechRecognition?: new () => Recognition
    }
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition
    if (!Constructor) {
      setMessage(
        "Speech recognition is unavailable in this browser. Type the same command instead.",
      )
      return
    }
    stop()
    stopSpeaking()
    const r = new Constructor()
    recognition.current = r
    r.lang = "en-US"
    r.interimResults = false
    r.continuous = false
    r.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
      if (transcript) {
        setMessage(`Transcript: ${transcript}`)
        callback.current(transcript)
      }
    }
    r.onerror = (event) => {
      setMessage(`Voice input: ${event.error}. You can type instead.`)
      setListening(false)
    }
    r.onend = () => setListening(false)
    try {
      r.start()
      setListening(true)
      setMessage("Listening (push-to-talk)… Speak command or fault symptom.")
    } catch {
      stop()
      setMessage(
        "Microphone could not start. Check permissions or type instead.",
      )
    }
  }
  return { listening, message, start, stop }
}
