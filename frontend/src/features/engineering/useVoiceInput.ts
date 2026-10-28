import { useEffect, useRef, useState } from 'react'
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; abort(): void; onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }
export function useVoiceInput(machine: string, onTranscript: (s: string) => void) {
  const [listening, setListening] = useState(false), [message, setMessage] = useState('')
  const recognition = useRef<Recognition | null>(null), callback = useRef(onTranscript)
  callback.current = onTranscript
  const stop = () => { const r = recognition.current; recognition.current = null; if (r) { r.onresult = null; r.onerror = null; r.onend = null; r.abort() } setListening(false) }
  useEffect(() => { setMessage(''); window.addEventListener('forma-workspace-hidden',stop); return () => {window.removeEventListener('forma-workspace-hidden',stop);stop()} }, [machine])
  const start = () => {
    const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition
    if (!Constructor) { setMessage('Speech recognition is unavailable in this browser. Type the same command instead.'); return }
    if (!window.confirm('Browser speech recognition may send audio to your browser vendor; it is not guaranteed offline. Continue? You can type instead.')) return
    stop()
    const r = new Constructor(); recognition.current = r; r.lang = 'en-US'; r.interimResults = false; r.continuous = false
    r.onresult = event => { const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' '); if (transcript) { setMessage(`Transcript: ${transcript}`); callback.current(transcript) } }
    r.onerror = event => { setMessage(`Voice input: ${event.error}. You can type instead.`); setListening(false) }
    r.onend = () => setListening(false)
    try { r.start(); setListening(true); setMessage('Listening… Press stop to cancel.') } catch { stop(); setMessage('Microphone could not start. Check permissions or type instead.') }
  }
  return { listening, message, start, stop }
}
