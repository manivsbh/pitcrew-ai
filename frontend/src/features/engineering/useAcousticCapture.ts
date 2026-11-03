import { useRef, useState } from "react"

/** Encode mono Float32 PCM [-1, 1] into a standard 16-bit RIFF WAV File. */
export function encodeWavFile(
  samples: Float32Array,
  sampleRate: number,
  filename = "live-machine-5s.wav",
): File {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format = 1 (PCM)
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, numSamples * 2, true)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new File([buffer], filename, { type: "audio/wav" })
}

/**
 * Captures raw machine acoustic audio (no echo/noise suppression) for 5 seconds
 * via WebAudio and returns a 16-bit PCM WAV File ready for deterministic FFT &
 * multi-band envelope fault diagnosis.
 */
export function useAcousticCapture() {
  const [capturing, setCapturing] = useState(false)
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState("")
  const abortRef = useRef<(() => void) | null>(null)

  const cancel = () => {
    abortRef.current?.()
    abortRef.current = null
    setCapturing(false)
    setLevel(0)
  }

  const capture5s = async (durationMs = 5000): Promise<File | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Browser microphone API unavailable. Use a bundled WAV clip instead.")
      return null
    }
    cancel()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []
      let totalLen = 0

      proc.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0)
        const copy = new Float32Array(ch.length)
        copy.set(ch)
        chunks.push(copy)
        totalLen += copy.length
        let sumSq = 0
        for (let i = 0; i < copy.length; i += 8) sumSq += copy[i] * copy[i]
        const rms = Math.sqrt(sumSq / Math.max(1, copy.length / 8))
        setLevel(Math.min(1, rms * 6))
      }

      source.connect(proc)
      proc.connect(ctx.destination)
      setCapturing(true)
      setStatus("Recording raw machine acoustics (5.0s, un-filtered PCM)…")

      return await new Promise<File | null>((resolve) => {
        let settled = false
        const cleanup = () => {
          proc.disconnect()
          source.disconnect()
          stream.getTracks().forEach((t) => t.stop())
          void ctx.close()
        }
        abortRef.current = () => {
          if (settled) return
          settled = true
          cleanup()
          setStatus("Acoustic capture cancelled.")
          resolve(null)
        }
        setTimeout(() => {
          if (settled) return
          settled = true
          const sr = ctx.sampleRate || 44100
          cleanup()
          abortRef.current = null
          setCapturing(false)
          setLevel(0)
          const merged = new Float32Array(totalLen)
          let pos = 0
          for (const c of chunks) {
            merged.set(c, pos)
            pos += c.length
          }
          const wav = encodeWavFile(merged, sr)
          setStatus(`Captured ${(totalLen / sr).toFixed(1)}s @ ${sr} Hz (${Math.round(wav.size / 1024)} KB WAV).`)
          resolve(wav)
        }, durationMs)
      })
    } catch (err) {
      setCapturing(false)
      setLevel(0)
      setStatus(`Mic access denied (${(err as Error).message}). Use a sample WAV clip instead.`)
      return null
    }
  }

  return { capturing, level, status, setStatus, capture5s, cancel }
}
