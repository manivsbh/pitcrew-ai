// Dev helper: reproduce the uploaded-CSV investigation and print page errors.
import { chromium } from "playwright"

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8000"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on("pageerror", (e) => console.log("PAGEERROR", e.stack ?? String(e)))
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()) })
page.on("dialog", (d) => d.accept(d.message().startsWith("Sampling") ? "16000" : d.message().startsWith("Unit") ? "g" : "1500"))
await page.goto(`${BASE}/?calls=live#workspace`)
await page.waitForTimeout(3000)
await page.getByRole("button", { name: "Investigations" }).first().click()
await page.setInputFiles("input[accept='.csv,text/csv']", "../../../data/demo_assets/signals/open-outer-fault-1500rpm.csv")
await page.waitForTimeout(3000)
await page.getByRole("button", { name: "Benchmark Trace" }).first().click()
await page.getByRole("button", { name: "Start investigation" }).first().click()
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(5000)
  if (await page.getByText("The workspace could not load").count()) { console.log("CRASHED at", (i + 1) * 5, "s"); break }
  if (await page.getByRole("button", { name: /Freeze conclusion/ }).count()) { console.log("FINDING shown at", (i + 1) * 5, "s"); break }
}
await page.screenshot({ path: "../shots/debug-investigate.png" })
await browser.close()
