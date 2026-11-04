// Records real PitCrew footage, one clip per beat, from Chrome's screencast.
// Usage: node record.mjs <beat> [<beat> ...]   (beats: blueprint sam acoustic investigate agents)
// Output: ../clips/<beat>.mp4, <beat>.json (event marks + the Meta calls made
// during the beat, i.e. the trace behind any sped-up span) and checkpoint PNGs.
import { chromium } from "playwright"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))
const CLIPS = path.join(HERE, "..", "clips")
const REPO = path.join(HERE, "..", "..", "..")
const W = 1920
const H = 1080

const CURSOR_JS = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.id = '__rec_cursor';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #c5f292;background:rgba(197,242,146,.25);box-shadow:0 0 14px rgba(197,242,146,.6);pointer-events:none;z-index:2147483647;transition:transform .12s ease';
  document.body.appendChild(c);
  addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { c.style.transform = 'scale(.6)'; }, true);
  addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
});`

class Screencast {
  constructor(page, dir) {
    this.page = page
    this.dir = dir
    this.frames = []
  }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    this.cdp = await this.page.context().newCDPSession(this.page)
    this.cdp.on("Page.screencastFrame", async (f) => {
      if (this.stopped) return
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(6, "0")}.jpg`)
      fs.writeFileSync(file, Buffer.from(f.data, "base64"))
      this.frames.push({ file, t: f.metadata.timestamp })
      await this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1,
    })
    this.t0 = Date.now() / 1000
  }
  async stop(outMp4) {
    this.stopped = true
    await this.cdp.send("Page.stopScreencast")
    const tEnd = Date.now() / 1000
    const lines = []
    this.frames.forEach((fr, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : tEnd
      lines.push(`file '${fr.file.replace(/\\/g, "/")}'`, `duration ${Math.max(next - fr.t, 0.001).toFixed(4)}`)
    })
    lines.push(`file '${this.frames.at(-1).file.replace(/\\/g, "/")}'`)
    const list = path.join(this.dir, "list.txt")
    fs.writeFileSync(list, lines.join("\n"))
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `scale=${W}:${H}:flags=lanczos,fps=30`, "-c:v", "libx264", "-preset", "slow",
      "-crf", "16", "-pix_fmt", "yuv420p", outMp4])
    fs.rmSync(this.dir, { recursive: true, force: true })
    return { frames: this.frames.length, duration_s: +(tEnd - this.t0).toFixed(2) }
  }
}

async function metaCallsSince(seq) {
  const r = await fetch(`${BASE}/api/meta/calls?after=${seq}&limit=200`)
  return (await r.json()).calls
}

async function lastSeq() {
  const calls = await metaCallsSince(0)
  return calls.length ? calls.at(-1).seq : 0
}

function helpers(page, marks, t0, seq0) {
  const mark = (label) => {
    const t = +((Date.now() / 1000) - t0).toFixed(2)
    marks.push({ t, label })
    console.log(`  [${t.toFixed(1)}s] ${label}`)
  }
  const pause = (ms) => page.waitForTimeout(ms)
  const moveTo = async (loc) => {
    await loc.scrollIntoViewIfNeeded()
    const b = await loc.boundingBox()
    if (!b) throw new Error(`no box for ${loc}`)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 })
    return b
  }
  const click = async (loc, label) => {
    loc = loc.first()
    await loc.waitFor({ state: "visible", timeout: 30000 })
    await moveTo(loc)
    await pause(350)
    mark(`click ${label}`)
    await loc.click()
  }
  const button = (name) => page.getByRole("button", { name, exact: false })
  const waitText = async (re, label, timeout = 180000) => {
    await page.getByText(re).first().waitFor({ state: "visible", timeout })
    mark(label)
  }
  const shot = (name) => page.screenshot({ path: path.join(CLIPS, `${name}.png`) })
  const waitCall = async (agent, timeout = 240000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const hit = (await metaCallsSince(seq0)).find((c) => c.agent === agent)
      if (hit) {
        mark(`Meta call landed: ${agent} ${hit.latency_ms}ms ${hit.response_id ?? ""}`)
        await pause(1500)
        return hit
      }
      await pause(1000)
    }
    throw new Error(`no ${agent} call within ${timeout} ms`)
  }
  return { mark, pause, click, button, waitText, shot, moveTo, waitCall }
}

const BEATS = {
  async blueprint(page, h) {
    await h.click(h.button("Blueprints"), "Blueprints tab")
    await h.pause(1200)
    await h.click(h.button("v6-engine-blueprint.png"), "V6 blueprint image")
    await h.waitText(/v6-engine-blueprint\.png · /, "blueprint loaded", 60000)
    await h.pause(1500)
    await h.click(h.button("Ask muse-spark-1.3 Vision"), "Ask muse-spark-1.3 Vision")
    await h.waitCall("blueprint-reviewer")
    await page.getByText(/Agent verdict/).first().scrollIntoViewIfNeeded()
    await h.pause(2500)
    await h.shot("blueprint-verdict")
    await h.click(h.button("Finalize 3D pack"), "Finalize 3D pack")
    await h.pause(4000)
    await h.click(h.button("Stock & Open in 3D"), "Stock & Open in 3D")
    await h.pause(5000)
    await h.click(h.button("Run"), "Run simulation")
    await h.pause(7000)
    await h.shot("blueprint-run")
  },

  async sam(page, h) {
    await h.click(h.button("Blueprints"), "Blueprints tab")
    await h.pause(1200)
    await h.click(page.getByRole("button", { name: "exploded-bearing-workbench.png" }), "workbench photo")
    await h.waitCall("sam-segmenter")
    await h.waitCall("assembly-grounder")
    await h.pause(2500)
    await h.shot("sam-guide")
    for (let i = 0; i < 3; i++) {
      const next = h.button("Next step")
      if (!(await next.count())) break
      await h.click(next, `Next step ${i + 1}`)
      await h.pause(2600)
    }
    await h.shot("sam-steps")
  },

  async acoustic(page, h) {
    await h.click(h.button("Workspace"), "Workspace tab")
    await h.pause(1500)
    await h.click(h.button("Live Copilot"), "Live Copilot")
    await h.pause(800)
    await h.click(h.button("outer-race-spall-1500rpm"), "outer-race spall 5 s clip")
    await h.waitCall("manual-chat")
    await h.waitCall("supervisor")
    await h.pause(4000)
    await page.mouse.wheel(0, 500)
    await h.pause(3000)
    await h.shot("acoustic-reply")
    const confirm = h.button("Confirm")
    if (await confirm.count()) {
      await h.click(confirm, "Confirm repair-kit PO")
      await h.pause(3000)
    }
    await h.shot("acoustic-po")
  },

  async investigate(page, h) {
    page.on("dialog", async (d) => {
      const answers = { "Sampling rate": "16000", "Unit": "g", "Speed": "1500" }
      const key = Object.keys(answers).find((k) => d.message().startsWith(k))
      await d.accept(key ? answers[key] : d.defaultValue())
    })
    await h.click(h.button("Investigations"), "Investigations tab")
    await h.pause(1200)
    h.mark("upload open-outer-fault-1500rpm.csv")
    await page.setInputFiles("input[accept='.csv,text/csv']",
      path.join(REPO, "data", "demo_assets", "signals", "open-outer-fault-1500rpm.csv"))
    await h.pause(3500)
    await h.click(h.button("Benchmark Trace"), "Benchmark Trace")
    await h.pause(1000)
    await h.click(h.button("Start investigation"), "Start investigation")
    await h.waitText(/AGENT STEPS/, "first agent step streamed", 120000)
    await page.getByRole("button", { name: /Freeze conclusion|Run new investigation/ })
      .first().waitFor({ state: "visible", timeout: 330000 })
    h.mark("investigation finished")
    await h.pause(3000)
    await h.shot("investigate-finding")
    const evidence = h.button("Inspect supporting evidence")
    if (await evidence.count()) {
      await h.click(evidence, "Inspect supporting evidence")
      await h.pause(5000)
    }
    await h.shot("investigate-evidence")
  },

  async agents(page, h) {
    await h.click(h.button("Agent lab"), "Agent lab tab")
    await h.pause(6000)
    await page.mouse.wheel(0, 700)
    await h.pause(4000)
    await h.shot("agents")
  },
}

const wanted = process.argv.slice(2)
if (!wanted.length || wanted.some((b) => !BEATS[b])) {
  console.error(`beats: ${Object.keys(BEATS).join(" ")}`)
  process.exit(2)
}
fs.mkdirSync(CLIPS, { recursive: true })
const headless = process.env.HEADED !== "1"
const browser = await chromium.launch({ channel: "chrome", headless })

for (const beat of wanted) {
  console.log(`== ${beat}`)
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await ctx.addInitScript(CURSOR_JS)
  await ctx.addInitScript(() => localStorage.setItem("pitcrew.metaCallLog.open", "1"))
  const page = await ctx.newPage()
  const seq0 = await lastSeq()
  await page.goto(`${BASE}/?calls=live#workspace`)
  await page.waitForTimeout(3500)
  await page.mouse.move(W / 2, H / 2)
  const cast = new Screencast(page, path.join(CLIPS, `_frames_${beat}`))
  await cast.start()
  const marks = []
  const h = helpers(page, marks, cast.t0, seq0)
  let error = null
  try {
    await BEATS[beat](page, h)
    await h.pause(1500)
  } catch (e) {
    error = String(e)
    console.error(`  beat failed: ${error}`)
    await h.shot(`${beat}-error`).catch(() => {})
  }
  const info = await cast.stop(path.join(CLIPS, `${beat}.mp4`))
  const calls = await metaCallsSince(seq0)
  fs.writeFileSync(path.join(CLIPS, `${beat}.json`), JSON.stringify(
    { beat, recorded_at: new Date().toISOString(), error, ...info, marks, meta_calls: calls }, null, 1))
  console.log(`  ${info.frames} frames, ${info.duration_s}s, ${calls.length} Meta calls${error ? " (FAILED)" : ""}`)
  await ctx.close()
}
await browser.close()
