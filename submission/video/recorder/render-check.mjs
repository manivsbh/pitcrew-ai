// Dev helper: screenshot the 3D viewport of each machine pack to catch render regressions.
import { chromium } from "playwright"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const machines = process.argv.slice(2)
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)))
await page.goto(`${BASE}/?calls=0#workspace`)
await page.waitForTimeout(3000)
for (const m of machines) {
  await page.locator("select").first().selectOption(m)
  await page.waitForTimeout(5000)
  const canvas = page.locator("canvas").first()
  await canvas.screenshot({ path: `../shots/render-${m}.png` })
  console.log("ok", m)
}
await browser.close()
