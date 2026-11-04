// Dev helper: screenshot app views and list clickable labels for scripting.
import { chromium } from "playwright"
import fs from "node:fs"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const OUT = new URL("../shots/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")
const steps = process.argv.slice(2)

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(`${BASE}/?calls=1${process.env.HASH ?? ""}`)
await page.waitForTimeout(2500)

async function dump(name) {
  await page.screenshot({ path: `${OUT}${name}.png` })
  const labels = await page.$$eval("button, [role=tab], a, select, input[type=file]", (els) =>
    els
      .filter((e) => e.offsetParent !== null || e.tagName === "INPUT")
      .map((e) => `${e.tagName.toLowerCase()}: ${(e.innerText || e.getAttribute("aria-label") || e.getAttribute("title") || e.getAttribute("accept") || "").trim().replace(/\s+/g, " ").slice(0, 70)}`),
  )
  fs.writeFileSync(`${OUT}${name}.json`, JSON.stringify(labels, null, 1))
  console.log(`== ${name}: ${labels.length} controls`)
}

await dump("00-landing")
let i = 1
for (const step of steps) {
  const [kind, arg] = step.split("=")
  if (kind === "click") await page.getByText(arg, { exact: false }).first().click()
  else if (kind === "role") await page.getByRole("button", { name: arg }).first().click()
  else if (kind === "wait") await page.waitForTimeout(Number(arg))
  else if (kind === "upload") await page.setInputFiles("input[type=file]", arg)
  else if (kind === "select") await page.locator("select").first().selectOption(arg)
  else if (kind === "select") await page.locator("select").first().selectOption(arg)
  await page.waitForTimeout(1500)
  await dump(`${String(i++).padStart(2, "0")}-${kind}-${(arg ?? "").replace(/[^\w]+/g, "_").slice(0, 30)}`)
}
await browser.close()
