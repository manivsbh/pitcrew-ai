// Dev helper: push-to-talk with a WAV file as the microphone; prints the transcript + Meta calls.
import { chromium } from "playwright"
import path from "node:path"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const wav = path.resolve(process.argv[2] ?? "../shots/cmd-speed.wav")
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
})
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ["microphone"] })
const page = await ctx.newPage()
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)))
await page.goto(`${BASE}/?calls=live#workspace`)
await page.waitForTimeout(3000)
await page.getByRole("button", { name: "Push-to-talk" }).first().click()
await page.waitForTimeout(3500)
await page.getByRole("button", { name: "Stop voice" }).first().click()
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000)
  const calls = await (await fetch(`${BASE}/api/meta/calls?limit=20`)).json()
  if (calls.calls.some((c) => c.agent === "voice")) break
}
console.log("transcript:", await page.getByText(/Transcript:/).first().textContent().catch(() => "none"))
const calls = (await (await fetch(`${BASE}/api/meta/calls?limit=20`)).json()).calls
for (const c of calls) console.log(c.agent, c.model, c.latency_ms, c.detail ?? c.response_id)
await page.screenshot({ path: "../shots/debug-voice.png" })
await browser.close()
