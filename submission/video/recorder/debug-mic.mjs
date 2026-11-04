// Dev helper: how many mic samples reach the page in 3 s (worklet vs ScriptProcessor).
import { chromium } from "playwright"
import path from "node:path"

const wav = path.resolve(process.argv[2] ?? "../voice/cmd-speed48.wav")
const browser = await chromium.launch({
  channel: "chrome", headless: !process.argv.includes("--headed"), ignoreDefaultArgs: ["--mute-audio"],
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
})
const ctx = await browser.newContext({ permissions: ["microphone"] })
const page = await ctx.newPage()
const onApp = process.argv.includes("--app")
await page.setViewportSize(process.argv.includes("--phone") ? { width: 390, height: 844 } : { width: 1920, height: 1080 })
await page.goto(onApp ? "http://127.0.0.1:8000/?calls=live#workspace" : "http://127.0.0.1:8000/robots.txt")
if (onApp) await page.waitForTimeout(4000)
const out = await page.evaluate(async () => {
  const res = {}
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  const ac = new AudioContext()
  await ac.resume()
  res.state = ac.state
  res.rate = ac.sampleRate
  const src = ac.createMediaStreamSource(stream)
  let wk = 0, sp = 0
  try {
    const code = `registerProcessor("t", class extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.length); return true } })`
    await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: "application/javascript" })))
    const node = new AudioWorkletNode(ac, "t")
    node.port.onmessage = (e) => { wk += e.data }
    const g = ac.createGain(); g.gain.value = 0
    src.connect(node); node.connect(g).connect(ac.destination)
  } catch (e) { res.workletError = String(e) }
  const proc = ac.createScriptProcessor(4096, 1, 1)
  proc.onaudioprocess = (e) => { sp += e.inputBuffer.length }
  src.connect(proc); proc.connect(ac.destination)
  await new Promise((r) => setTimeout(r, 3000))
  res.workletSeconds = +(wk / ac.sampleRate).toFixed(2)
  res.scriptSeconds = +(sp / ac.sampleRate).toFixed(2)
  return res
})
console.log(JSON.stringify(out))
await browser.close()
