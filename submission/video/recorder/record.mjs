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
  constructor(page, dir, w = W, h = H) {
    this.page = page
    this.dir = dir
    this.w = w
    this.h = h
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
      format: "jpeg", quality: 92, maxWidth: this.w, maxHeight: this.h, everyNthFrame: 1,
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
      "-vf", `scale=${this.w}:${this.h}:flags=lanczos,fps=30`, "-c:v", "libx264", "-preset", "slow",
      "-crf", "16", "-pix_fmt", "yuv420p", outMp4])
    fs.rmSync(this.dir, { recursive: true, force: true })
    return { frames: this.frames.length, duration_s: +(tEnd - this.t0).toFixed(2) }
  }
}

async function metaCallsSince(seq) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${BASE}/api/meta/calls?after=${seq}&limit=200`)
      return (await r.json()).calls
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((res) => setTimeout(res, 1500))
    }
  }
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
  const exact = (name) => page.getByRole("button", { name, exact: true })
  const settle = async (timeout = 420000) => {
    // wait until no Meta call is running and the vision check is not mid-round
    const end = Date.now() + timeout
    let quiet = 0
    while (Date.now() < end && quiet < 3) {
      const r = await fetch(`${BASE}/api/meta/calls?limit=1`).then((x) => x.json()).catch(() => ({ inflight: [1] }))
      const verifying = await page.getByText(/Verifying \(round/).count()
      quiet = r.inflight.length || verifying ? 0 : quiet + 1
      await pause(2000)
    }
    mark("Meta calls settled")
  }
  const pick = async (machine) => {
    await page.locator("select").first().selectOption(machine)
    mark(`machine ${machine}`)
    await pause(4500)
  }
  return { mark, pause, click, button, exact, waitText, shot, moveTo, waitCall, settle, pick }
}

const VOICE = path.join(HERE, "..", "voice")
// Mic beats run headed and unmuted: headless Chrome starves WebAudio while the page renders.
const PHONE = { viewport: { width: 390, height: 844 }, mobile: true, headed: true }
const BEAT_OPTS = {
  phonevoice: { ...PHONE, wav: path.join(VOICE, "ask-diagnose.wav") },
  phone: { ...PHONE, wav: path.join(REPO, "data", "demo_assets", "audio", "outer-race-spall-1500rpm.wav") },
}

const BEATS = {
  async patent(page, h) {
    await h.click(h.button("Blueprints"), "Blueprints tab")
    await h.pause(1200)
    await page.getByLabel("Machine id").first().fill("wilfley-live")
    await page.getByLabel("Title").first().fill("Wilfley centrifugal pump (US 3,402,671, live)")
    h.mark("upload us3402671-centrifugal-pump-patent.pdf")
    await page.setInputFiles("input[accept='application/pdf,image/png,image/jpeg,image/webp']",
      path.join(REPO, "data", "demo_assets", "blueprints", "us3402671-centrifugal-pump-patent.pdf"))
    await h.waitText(/candidates \(/, "patent parsed", 90000)
    await h.pause(1500)
    await h.click(h.button("Ask muse-spark-1.3 Vision"), "Ask muse-spark-1.3 Vision")
    await h.waitCall("blueprint-reviewer")
    await page.getByText(/^Agent:/).first().scrollIntoViewIfNeeded()
    await h.pause(3000)
    await h.shot("patent-review")
    const notes = page.getByPlaceholder(/Impeller diameter 250 mm/)
    await h.moveTo(notes)
    await notes.pressSequentially("Impeller 250 mm, shaft 45 mm, rated 1750 rpm. Model the seal simply.", { delay: 28 })
    h.mark("typed answer")
    await h.click(h.exact("Save answers"), "Save answers")
    await h.waitText(/Answers saved/, "answers saved", 30000)
    await h.click(h.exact("Finalize 3D pack"), "Finalize 3D pack")
    await h.waitText(/Finalized pack wilfley-live/, "pack finalized", 60000)
    await h.pause(1500)
    await h.click(h.button("Stock & Open in 3D"), "Stock & Open in 3D")
    await h.pause(4000)
    await page.locator("canvas").first().scrollIntoViewIfNeeded()
    await h.shot("patent-3d")
    await h.waitCall("render-verifier", 300000)
    await h.settle()
    await h.pause(2000)
    await h.shot("patent-verified")
    await h.click(h.exact("Compare drawing"), "Compare drawing")
    await h.pause(4000)
    await h.click(h.exact("Compare drawing"), "hide drawing")
    await h.pause(1500)
  },

  async controls(page, h) {
    await h.pick("wilfley-pump")
    await page.locator("canvas").first().scrollIntoViewIfNeeded()
    await h.click(h.exact("Assemble"), "Assemble")
    await h.pause(9000)
    await h.click(h.exact("Parts sheet"), "Parts sheet")
    await h.pause(2500)
    await h.click(h.exact("Assembled"), "Assembled")
    await h.pause(1500)
    const slider = page.getByLabel("Explode assembly")
    await h.moveTo(slider)
    for (const v of [25, 50, 75, 50, 0]) {
      await slider.evaluate((el, val) => {
        el.value = String(val)
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }, v)
      await h.pause(700)
    }
    h.mark("explode")
    await h.click(h.exact("Run"), "Run")
    await h.pause(3500)
    await h.click(h.exact("Stop"), "Stop")
    const parts = page.locator(".panel.components button.part")
    await h.click(parts.nth(Math.min(6, (await parts.count()) - 1)), "pick a part")
    await page.getByRole("button", { name: "Close dialog" }).first().click({ timeout: 2000 }).catch(() => {})
    await h.click(h.exact("Isolate"), "Isolate")
    await h.pause(3000)
    await h.click(h.exact("Show all"), "Show all")
    await h.pause(2000)
    await h.shot("controls")
  },

  async numbers(page, h) {
    await h.pick("wilfley-pump")
    const cmd = page.getByLabel("Engineering what-if command")
    await cmd.scrollIntoViewIfNeeded()
    await h.pause(1500)
    await h.click(h.exact("Increase speed by 20%"), "Increase speed by 20%")
    await h.pause(1500)
    const propose = h.exact("Propose")
    if (await propose.count() && await propose.isEnabled()) {
      await h.click(propose, "Propose")
      await h.pause(2000)
    }
    await h.click(h.exact("Calculate"), "Calculate")
    await h.pause(3500)
    await h.shot("numbers-calc")
    const apply = h.exact("Apply candidate")
    if (await apply.isEnabled()) {
      await h.click(apply, "Apply candidate")
      await h.pause(3000)
    }
    await h.shot("numbers-applied")
  },

  async phonevoice(page, h) {
    await h.pause(2500)
    await h.click(page.getByRole("button", { name: /Push-to-Talk Voice Diagnosis/ }), "Push-to-talk (synthetic voice)")
    await h.pause(7000)
    await h.click(page.getByRole("button", { name: /Tap to stop/ }), "stop talking")
    await h.waitCall("speech-to-text", 120000)
    await h.waitCall("manual-chat", 240000)
    await h.pause(2000)
    await page.mouse.wheel(0, 650)
    h.mark("scroll to reply")
    await h.pause(7000)
    await h.shot("phonevoice")
  },

  async phone(page, h) {
    await h.pause(2500)
    await h.click(page.getByRole("button", { name: /5s Live Acoustic/ }), "5s Live Acoustic (phone mic)")
    await h.pause(6500)
    await h.waitCall("manual-chat", 240000)
    await h.settle(240000)
    await h.pause(4000)
    await page.mouse.wheel(0, 600)
    await h.pause(4000)
    await h.shot("phone-diagnosis")
  },

  async argue(page, h) {
    await h.pick("rig")
    await h.click(h.button("Live Copilot"), "Live Copilot")
    await h.pause(800)
    await h.click(h.button("outer-race-spall-1500rpm"), "outer-race spall 5 s clip")
    await h.waitCall("supervisor")
    await h.pause(4000)
    const ask = page.getByPlaceholder(/Ask manual, diagnose fault/).first()
    await h.moveTo(ask)
    await ask.click()
    await ask.pressSequentially("I think it's the seal, not the bearing. What in this recording rules the seal out?", { delay: 30 })
    await h.click(page.getByRole("button", { name: "Send question" }), "Send push-back")
    await h.waitCall("manual-chat", 180000)
    await h.settle(180000)
    await h.pause(4000)
    await page.mouse.wheel(0, 500)
    await h.pause(3000)
    await h.shot("argue-reply")
    const confirm = h.button("Confirm")
    if (await confirm.count()) {
      await h.click(confirm, "Confirm repair-kit PO")
      await h.pause(3000)
    }
  },

  async harness(page, h) {
    await h.pick("rig")
    await h.click(h.button("Agent lab"), "Agent lab tab")
    await h.pause(2500)
    await page.getByText(/HARNESS² SELF-EVOLVING/).first().scrollIntoViewIfNeeded()
    await h.pause(1500)
    const pred = page.getByLabel("Predicted").first()
    await h.moveTo(pred)
    await pred.selectOption("healthy")
    await page.getByLabel("Documented").first().selectOption("outer_ring_damage")
    h.mark("predicted healthy, teardown found outer ring")
    const note = page.getByPlaceholder(/Diagnostic observation to distill/).first()
    await h.moveTo(note)
    await note.pressSequentially("Missed a weak 76 Hz BPFO under motor hum; teardown showed an outer-race spall.", { delay: 26 })
    await h.click(h.button("Distill lesson into Harness"), "Distill lesson into Harness²")
    await h.waitCall("harness-distiller", 180000)
    await h.pause(2500)
    await page.getByText(/ACTIVE LEARNED SKILLS/).first().scrollIntoViewIfNeeded()
    await h.pause(4500)
    await h.shot("harness-distilled")
    await page.getByText(/Render skills/).first().scrollIntoViewIfNeeded()
    h.mark("render skills")
    await h.pause(5000)
    await h.shot("harness-skills")
  },

  async inventory(page, h) {
    await h.pick("rig")
    await h.click(h.button("Inventory"), "Inventory tab")
    await h.pause(5000)
    await page.mouse.wheel(0, 500)
    await h.pause(3500)
    await h.shot("inventory")
  },

  async anymachine(page, h) {
    for (const m of ["falk-speed-reducer", "rotron-fan", "corpus-spindle"]) {
      await h.pick(m)
      await page.locator("canvas").first().scrollIntoViewIfNeeded()
      await h.click(h.exact("Run"), `Run ${m}`)
      await h.pause(3000)
      await h.click(h.exact("Stop"), "Stop")
      await h.shot(`any-${m}`)
    }
  },

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
    const upload = page.locator("label.upload", { hasText: "Upload workbench" })
    await h.moveTo(upload)
    h.mark("upload exploded-bearing-workbench.png")
    await upload.locator("input[type=file]").setInputFiles(
      path.join(REPO, "data", "demo_assets", "photos", "exploded-bearing-workbench.png"))
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

for (const beat of wanted) {
  console.log(`== ${beat}`)
  const opts = BEAT_OPTS[beat] ?? {}
  const args = ["--autoplay-policy=no-user-gesture-required"]
  if (opts.wav) {
    args.push("--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${opts.wav}`)
  }
  const browser = await chromium.launch({
    channel: "chrome", headless: opts.headed ? false : headless, args,
    ignoreDefaultArgs: opts.wav ? ["--mute-audio"] : [],
  })
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: W, height: H },
    deviceScaleFactor: opts.mobile ? 2 : 1,
    isMobile: !!opts.mobile, hasTouch: !!opts.mobile,
    permissions: opts.wav ? ["microphone"] : [],
  })
  await ctx.addInitScript(CURSOR_JS)
  const logOpen = opts.mobile ? "0" : "1"
  await ctx.addInitScript((v) => localStorage.setItem("pitcrew.metaCallLog.open", v), logOpen)
  const page = await ctx.newPage()
  const seq0 = await lastSeq()
  await page.goto(`${BASE}/?calls=${opts.mobile ? "0" : "live"}#workspace`)
  await page.waitForTimeout(3500)
  const vp = opts.viewport ?? { width: W, height: H }
  const scale = opts.mobile ? 2 : 1
  await page.mouse.move(vp.width / 2, vp.height / 2)
  const cast = new Screencast(page, path.join(CLIPS, `_frames_${beat}`), vp.width * scale, vp.height * scale)
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
  await browser.close()
}
