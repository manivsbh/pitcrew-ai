// Clicks every 3D control on every machine pack and asserts a measurable effect
// through the read-only window.__pitcrewSim hook. Writes ../shots/control-matrix.json.
// Usage: node control-matrix.mjs [machine ...]   (default: every pack from /api/packs)
import { chromium } from "playwright"
import fs from "node:fs"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const OUT = new URL("../shots/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")

const listed = await (await fetch(`${BASE}/api/packs`)).json()
const all = (listed.packs ?? listed).map((p) => p.machine ?? p.id)
const machines = process.argv.slice(2).length ? process.argv.slice(2) : all

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const pageErrors = []
page.on("pageerror", (e) => pageErrors.push(String(e)))
await page.goto(`${BASE}/?calls=0#workspace`)
await page.waitForTimeout(3000)

const sim = () => page.evaluate(() => {
  const s = window.__pitcrewSim
  if (!s) return null
  return {
    machine: s.machine, builder: s.builder, parts: s.parts(), visible: s.visible(),
    isolated: s.isolated(), selected: s.selected(), layout: s.layout(),
    running: s.running(), angle: s.angle(), spinning: s.spinning(),
    wireframe: s.wireframe(), fault: s.fault(), spread: s.spread(),
    camera: s.camera(), assemble: s.assemble(),
  }
})
const vol = (s) => s.spread[0] + s.spread[1] + s.spread[2]
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const btn = (name) => page.getByRole("button", { name, exact: true }).first()

async function closeModal() {
  const close = page.getByRole("button", { name: "Close dialog" })
  if (await close.count()) await close.first().click()
}

const results = []
for (const m of machines) {
  const checks = {}
  const record = async (name, pass, detail) => {
    checks[name] = { pass, detail }
    if (!pass) await page.screenshot({ path: `${OUT}control-${m}-${name}.png` }).catch(() => {})
  }
  try {
    await page.locator("select").first().selectOption(m)
    await page.waitForTimeout(4500)
    let s = await sim()
    await record("load", !!s && s.machine === m && s.parts > 0, s && { builder: s.builder, parts: s.parts, visible: s.visible })
    if (!s || s.machine !== m) { results.push({ machine: m, checks }); continue }
    const base = s

    await btn("Parts sheet").click(); await page.waitForTimeout(1000); s = await sim()
    await record("parts_sheet", s.layout === "sheet" && !same(s.spread, base.spread), { spread: s.spread })
    await btn("Assembled").click(); await page.waitForTimeout(1000); s = await sim()
    await record("assembled", s.layout === "assembled", { spread: s.spread })

    const asm = btn("Assemble")
    if (await asm.isDisabled()) {
      await record("assemble", false, "button disabled (no assembly steps)")
    } else {
      await asm.click()
      let a
      for (let i = 0; i < 90; i++) {
        await page.waitForTimeout(500); s = await sim(); a = s.assemble
        if (a.total > 0 && a.step >= a.total && s.layout === "assembled") break
      }
      const empty = a.resolved.filter((n) => n === 0).length
      await record("assemble", a.total > 0 && a.step >= a.total && empty === 0,
        { steps: a.total, reached: a.step, empty_steps: empty })
    }

    await btn("Run").click(); await page.waitForTimeout(1300); s = await sim()
    await record("run", s.running && s.spinning > 0 && s.angle > 0, { spinning: s.spinning, angle: s.angle })
    await btn("Stop").click(); await page.waitForTimeout(300)

    const partButtons = page.locator(".panel.components button.part")
    const nParts = await partButtons.count()
    const pick = Math.min(Math.max(1, Math.floor(nParts / 2)), nParts - 1)
    if (nParts > 0) {
      await partButtons.nth(pick).click(); await page.waitForTimeout(400); await closeModal()
    }
    const before = await sim()
    await btn("Isolate").click(); await page.waitForTimeout(1000); s = await sim()
    await record("isolate", s.isolated !== null && s.visible === 1 && !same(s.camera, before.camera),
      { picked: nParts ? await partButtons.nth(pick).innerText() : null, isolated: s.isolated, visible: s.visible, camera_moved: !same(s.camera, before.camera) })
    if (s.isolated !== null) { await btn("Show all").click(); await page.waitForTimeout(800) }
    s = await sim()
    await record("show_all", s.isolated === null && s.visible === before.visible, { visible: s.visible, expected: before.visible })

    await btn("Blueprint CAD").click(); await page.waitForTimeout(300); s = await sim()
    const wireOn = s.wireframe
    await btn("Shaded").click().catch(() => {}); await page.waitForTimeout(300); s = await sim()
    await record("blueprint_cad", wireOn && !s.wireframe, { on: wireOn, off: !s.wireframe })

    const slider = page.getByLabel("Explode assembly")
    const set = (v) => slider.evaluate((el, val) => {
      el.value = String(val)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }, v)
    const v0 = vol(await sim())
    await set(85); await page.waitForTimeout(1100); s = await sim()
    await record("explode", vol(s) > v0 * 1.05, { before: v0.toFixed(2), after: vol(s).toFixed(2) })
    await set(0); await page.waitForTimeout(700)

    const fault = page.getByLabel("Fault scenario")
    const opts = await fault.locator("option").evaluateAll((os) => os.map((o) => o.value))
    if (opts.length > 1) {
      await fault.selectOption(opts[1]); await page.waitForTimeout(600); s = await sim()
      await record("fault", s.fault > 0, { scenario: opts[1], highlighted: s.fault })
      await fault.selectOption(opts[0]); await page.waitForTimeout(300)
    } else {
      await record("fault", false, "no fault scenarios")
    }
  } catch (e) {
    await record("error", false, String(e).slice(0, 300))
  }
  const failed = Object.entries(checks).filter(([, v]) => !v.pass).map(([k]) => k)
  console.log(`${m.padEnd(22)} ${failed.length ? "FAIL " + failed.join(", ") : "all pass"}`)
  results.push({ machine: m, builder: checks.load?.detail?.builder, checks })
}
fs.writeFileSync(`${OUT}control-matrix.json`, JSON.stringify({ when: new Date().toISOString(), page_errors: pageErrors, results }, null, 1))
if (pageErrors.length) console.log("page errors:", pageErrors.slice(0, 5))
await browser.close()
