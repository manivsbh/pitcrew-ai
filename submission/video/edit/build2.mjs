// Launch-style cut: hook, friction, reveal, feature beats, climax, close.
// Scenes mix Meta muse-image b-roll stills and the recorded beats; narration is
// ElevenLabs Bella with word timings; the score is Meta MusicGen sections pre-mixed
// into one bed timed to the scenes. Writes index.html and assets/music/bed2.wav.
// Usage: node build2.mjs
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))
const A = (p) => path.join(HERE, "assets", p)
const probe = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
  "-of", "default=nw=1:nk=1", f]).toString().trim()
const meta = (clip) => JSON.parse(fs.readFileSync(A(`clips/${clip}.json`), "utf8"))
const markAt = (m, re) => m.marks.find((x) => re.test(x.label))?.t
const marksAfter = (m, re, t) => m.marks.filter((x) => re.test(x.label) && x.t > t).map((x) => x.t)

const img = (src, d, move = "in") => ({ type: "img", src, d, move })
const clip = (name, spans, opts = {}) => ({ type: "clip", clip: name, spans, ...opts })

function voiceSpans() {
  const m = meta("phonevoice")
  const push = markAt(m, /Push-to-talk/) ?? 3.5
  const stop = markAt(m, /stop talking/) ?? push + 9
  const chat = markAt(m, /manual-chat/) ?? stop + 9
  return [[push - 0.3, push + 4.5, 1], [push + 4.5, chat, 6], [chat + 2, Math.min(m.duration_s - 0.3, chat + 8.5), 1]]
}
function samSpans() {
  const m = meta("sam")
  const seg = markAt(m, /sam-segmenter/) ?? 120
  return [[5, 8, 1], [seg - 30, seg, 6, `6× speed · ${Math.round(seg - 38)} s of CPU segmentation trimmed`], [seg, Math.min(m.duration_s - 0.3, seg + 8), 2]]
}
function argueSpans() {
  const m = meta("argue")
  const send = markAt(m, /Send push-back/) ?? 37
  const chat = marksAfter(m, /manual-chat/, send)[0] ?? send + 8
  return [[10, 24, 5], [24, send + 1, 3], [send + 1, chat, 4], [chat, Math.min(m.duration_s - 0.3, chat + 6.5), 1]]
}

const SCENES = [
  { id: "hook", vo: "hook", voAt: 0.3, music: "intro",
    parts: [img("drafting-table", 3.0, "in"), img("patent-sheet", 1.6, "in"), clip("patent", [[48.5, 56.5, 2.5]])],
    heads: [{ at: 0.4, d: 2.6, text: "Drawn in 1968." }, { at: 4.8, d: 3.0, text: "3D in 40 seconds." }] },
  { id: "friction", vo: "friction", voAt: 0.2,
    parts: [img("plant-floor", 2.6, "left"), img("worn-bearing", 2.6, "in"), img("binders", 2.8, "right")],
    heads: [{ at: 0.3, d: 2.4, text: "Machines fail quietly." }, { at: 5.4, d: 2.6, text: "The fix is in a manual." }] },
  { id: "reveal", vo: "reveal", voAt: 2.4, sfx: [{ at: -8.0, file: "riser", vol: 0.5 }, { at: 2.0, file: "impact-bass-2", vol: 0.8 }],
    parts: [img("bearing-macro", 2.2, "in"), { type: "logo", d: 4.2 }] },
  { id: "blueprint", vo: "blueprint", voAt: 0.4, music: "drive-a",
    parts: [clip("patent", [[3, 9.5, 2], [9.5, 34, 10], [34, 49.5, 3]])],
    heads: [{ at: 0.3, d: 3.2, text: "Any drawing. Any machine." }] },
  { id: "eyes", vo: "eyes", voAt: 0.3,
    parts: [clip("patent", [[49.5, 81.5, 10], [202, 212, 3], [370, 379, 1.5]])],
    heads: [{ at: 0.3, d: 3.2, text: "It checks its own work." }] },
  { id: "twin", vo: "twin", voAt: 0.3,
    parts: [clip("controls", [[6.5, 43.5, 4]]), clip("numbers", [[10, 26, 2.5]])],
    heads: [{ at: 0.3, d: 2.8, text: "A working twin." }, { at: 9.4, d: 2.8, text: "What if?" }] },
  { id: "floor", vo: "floor", voAt: 0.3,
    parts: [img("phone-motor", 3.4, "in"), clip("phonevoice", voiceSpans(), { phone: true,
      engineer: { file: "voice/ask-diagnose.raw.wav", mark: /Push-to-talk/ } })],
    heads: [{ at: 0.3, d: 2.8, text: "On the floor." }],
    phoneText: { k: "Talk to it", h: "The engineer just talks.", s: "Synthetic voice · Meta wav2vec 2.0 on-device · reply spoken by MMS-TTS" } },
  { id: "listen", vo: "listen", voAt: 0.3, music: "drive-b",
    parts: [clip("phone", [[2, 8.5, 1], [8.5, 27, 7], [27, 31.5, 1], [52, 55.5, 1]], { phone: true })],
    callouts: [{ at: 11.0, d: 6.5, big: "76.2 Hz", small: "outer-race fault frequency · target 76.36 Hz", sfx: "ping", top: 690 }],
    phoneText: { k: "Listen to it", h: "The phone mic is the sensor.", s: "5 s capture → FFT + envelope → bearing fault frequencies" } },
  { id: "sam", vo: "sam", voAt: 0.3, music: "breathe",
    parts: [clip("sam", samSpans())],
    heads: [{ at: 0.3, d: 3.0, text: "Every part, found." }] },
  { id: "argue", vo: "argue", voAt: 0.3,
    parts: [clip("argue", argueSpans())],
    heads: [{ at: 0.3, d: 3.0, text: "Push back." }],
    callouts: [{ at: -6.2, d: 5.8, quote: "“No — the measurements do not support a seal challenge. That is periodic BPFO impacts, not seal noise.”" }] },
  { id: "stock", vo: "stock", voAt: 0.3, sfx: [{ at: 2.6, file: "chime", vol: 0.35 }],
    parts: [clip("inventory", [[7, 17, 2]])],
    heads: [{ at: 0.3, d: 2.8, text: "Parts, lined up." }] },
  { id: "harness", vo: "harness", voAt: 0.3,
    parts: [clip("harness", [[6, 17, 2.5], [17, 27.8, 5], [27.8, 36.5, 1.3]])],
    heads: [{ at: 0.3, d: 3.0, text: "It learns." }] },
  { id: "arch", vo: "arch", voAt: 0.4, parts: [{ type: "arch", d: 11.6 }] },
  { id: "climax", vo: "climax", voAt: 0.2, music: "climax",
    parts: [img("gearbox", 1.3, "in"), clip("anymachine", [[3, 15, 4]]), img("fan-blades", 1.3, "left"), clip("anymachine", [[15, 39, 4]])],
    heads: [{ at: 0.2, d: 1.2, text: "Pumps." }, { at: 1.5, d: 1.4, text: "Gearboxes." }, { at: 4.4, d: 1.4, text: "Fans." }, { at: 7.0, d: 2.6, text: "Any blueprint." }] },
  { id: "close", vo: "close", voAt: 1.0, music: "outro",
    parts: [{ type: "end", d: 7.0 }] },
]

const MODEL = { "blueprint-reviewer": "muse-spark-1.3", "render-verifier": "muse-spark-1.3",
  "sam-segmenter": "SAM 2.1", "assembly-grounder": "muse-spark-1.3", "manual-chat": "muse-spark-1.3",
  supervisor: "muse-spark-1.3", "speech-to-text": "wav2vec 2.0", voice: "MMS-TTS" }

const media = [], overlays = [], audios = [], sfx = [], imgs = [], blocks = [], phoneBacks = []
let t = 0
for (const s of SCENES) {
  s.start = t
  const voFile = A(`voice2/${s.vo}.mp3`)
  const vo = s.vo && fs.existsSync(voFile) ? probe(voFile) : 0
  let local = 0
  for (const p of s.parts) {
    const gs = +(s.start + local).toFixed(2)
    if (p.type === "img") {
      imgs.push({ src: `assets/broll/${p.src}.${p.src === "patent-sheet" ? "jpg" : "png"}`, gs, d: p.d, move: p.move })
      overlays.push({ cls: "museimg", gs, d: p.d, text: p.src === "patent-sheet" ? "US 3,402,671 · 1968 · public domain" : "B-roll · generated with Meta Muse Image" })
      local += p.d
    } else if (p.type === "logo" || p.type === "end" || p.type === "arch") {
      blocks.push({ kind: p.type, gs, d: p.d })
      local += p.d
    } else {
      const m = meta(p.clip)
      let off = 0
      for (const [from, to, rate, label] of p.spans) {
        const d = +((to - from) / rate).toFixed(2)
        const g = +(gs + off).toFixed(2)
        media.push({ src: `assets/clips/${p.clip}.mp4`, gs: g, d, from: +from.toFixed(2), rate, phone: !!p.phone })
        if (rate > 1.01) overlays.push({ cls: "rate", gs: g, d, text: label ?? `${rate}× speed` })
        for (const mk of m.marks) {
          if (mk.t < from || mk.t >= to) continue
          const at = +(g + (mk.t - from) / rate).toFixed(2)
          const hit = mk.label.match(/^Meta call landed: (\S+) (\d+)ms/)
          if (hit) overlays.push({ cls: "call", gs: at, d: 3, text: `${hit[1]} · ${MODEL[hit[1]] ?? "Meta"} · ${(+hit[2] / 1000).toFixed(1)} s` })
          else if (/^click /.test(mk.label) && rate <= 2.5) sfx.push({ file: "click-soft", gs: at, vol: 0.25 })
        }
        const push = p.engineer && m.marks.find((x) => p.engineer.mark.test(x.label))
        if (push && push.t >= from && push.t < to) {
          const at = +(g + (push.t - from) / rate + 0.3).toFixed(2)
          audios.push({ id: `eng-${s.id}`, src: `assets/${p.engineer.file}`, gs: at, d: +probe(A(p.engineer.file)).toFixed(2), vol: 0.95 })
          overlays.push({ cls: "synth", gs: at, d: 4.5, text: "synthetic engineer voice" })
        }
        off += d
      }
      local += off
    }
  }
  s.len = +Math.max(local, (s.voAt ?? 0.3) + vo + 0.5).toFixed(2)
  if (vo) {
    s.voGs = +(s.start + s.voAt).toFixed(2)
    audios.push({ id: `vo-${s.id}`, src: `assets/voice2/${s.vo}.mp3`, gs: s.voGs, d: +vo.toFixed(2), vol: 1 })
  }
  for (const h of s.heads ?? []) overlays.push({ cls: "head", gs: +(s.start + h.at).toFixed(2), d: h.d, text: h.text })
  for (const c of s.callouts ?? []) {
    const at = +(c.at < 0 ? s.start + s.len + c.at : s.start + c.at).toFixed(2)
    overlays.push({ cls: c.quote ? "quote" : "callout", gs: at, d: c.d, text: c.big ?? c.quote, small: c.small, top: c.top })
    if (c.sfx) sfx.push({ file: c.sfx, gs: at, vol: 0.45 })
  }
  for (const x of s.sfx ?? []) sfx.push({ file: x.file, gs: +(s.start + x.at).toFixed(2), vol: x.vol })
  if (s.phoneText) phoneBacks.push({ id: s.id, gs: +(s.start + s.parts.filter((p) => p.type === "img").reduce((n, p) => n + p.d, 0)).toFixed(2), end: +(s.start + s.len).toFixed(2), ...s.phoneText })
  t = +(s.start + s.len).toFixed(2)
}
const TOTAL = t

// scene-boundary wipes (not inside the hook/friction/reveal opening)
for (const s of SCENES.slice(3)) {
  overlays.push({ cls: "wipe", gs: +(s.start - 0.3).toFixed(2), d: 0.6, text: "" })
  sfx.push({ file: "whoosh-short", gs: +(s.start - 0.25).toFixed(2), vol: 0.35 })
}

// word captions: phrases of up to 7 words, the spoken word lit
const caps = []
for (const s of SCENES) {
  if (!s.voGs) continue
  const words = JSON.parse(fs.readFileSync(A(`voice2/${s.vo}.words.json`), "utf8"))
  let cur = []
  const flush = () => {
    if (!cur.length) return
    const gs = +(s.voGs + cur[0].start).toFixed(2)
    caps.push({ gs, d: +(cur.at(-1).end - cur[0].start + 0.35).toFixed(2), words: cur.map((w) => ({ ...w, at: +(s.voGs + w.start).toFixed(2) })) })
    cur = []
  }
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 7 || /[.,!?]$/.test(w.text)) flush()
  }
  flush()
}
for (let i = 0; i + 1 < caps.length; i++) caps[i].d = Math.min(caps[i].d, +(caps[i + 1].gs - caps[i].gs - 0.02).toFixed(2))

// stack call chips
const calls = overlays.filter((o) => o.cls === "call").sort((a, b) => a.gs - b.gs)
for (const [i, c] of calls.entries()) {
  const busy = new Set(calls.slice(0, i).filter((p) => p.gs + p.d > c.gs).map((p) => p.lvl))
  c.lvl = 0
  while (busy.has(c.lvl)) c.lvl++
}

// music: MusicGen sections placed at their scenes, looped to fill, crossfaded
const music = []
const sect = SCENES.map((s, i) => ({ s, i })).filter((x) => x.s.music)
for (const [k, { s }] of sect.entries()) {
  const from = s.start
  const to = k + 1 < sect.length ? sect[k + 1].s.start : TOTAL
  const file = A(`music/${s.music}.wav`)
  if (!fs.existsSync(file)) continue
  const len = probe(file)
  for (let at = from; at < to - 0.5; at += len - 1.5) music.push({ file, at, d: Math.min(len, to - at + 1.5) })
}
const TRACK = A("music/track.mp3")
if (!music.length && fs.existsSync(TRACK)) {
  // one licensed track: play it from the top, then a later section crossfaded in to cover the tail
  const len = probe(TRACK)
  music.push({ file: TRACK, at: 0, d: Math.min(len, TOTAL) })
  if (TOTAL > len - 2) music.push({ file: TRACK, at: len - 4, d: TOTAL - (len - 4), from: 30 })
}
if (music.length) {
  const args = ["-y", "-loglevel", "error"]
  const filters = []
  music.forEach((m, i) => {
    args.push("-i", m.file)
    const d = m.d.toFixed(2)
    const s0 = m.from ?? 0
    filters.push(`[${i}]atrim=${s0}:${(s0 + m.d).toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=${i ? 2.5 : 0.8},afade=t=out:st=${Math.max(0, m.d - 1.5).toFixed(2)}:d=1.5,adelay=${Math.round(m.at * 1000)}:all=1[m${i}]`)
  })
  filters.push(`${music.map((_, i) => `[m${i}]`).join("")}amix=inputs=${music.length}:normalize=0,atrim=0:${TOTAL},afade=t=out:st=${(TOTAL - 3).toFixed(2)}:d=3,aformat=channel_layouts=stereo[o]`)
  args.push("-filter_complex", filters.join(";"), "-map", "[o]", "-ar", "48000", "-c:a", "pcm_s16le", A("music/bed2.wav"))
  execFileSync("ffmpeg", args)
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
const mark = `<svg viewBox="0 0 64 64" fill="none"><circle class="ring" cx="32" cy="32" r="27" stroke="#e6eeec" stroke-width="4.5"/><circle class="ring" cx="32" cy="32" r="11" stroke="#e6eeec" stroke-width="4.5"/><g class="balls" fill="#e6eeec" opacity="0.55"><circle cx="32" cy="13" r="4.2"/><circle cx="48.5" cy="22.5" r="4.2"/><circle cx="48.5" cy="41.5" r="4.2"/><circle cx="32" cy="51" r="4.2"/><circle cx="15.5" cy="41.5" r="4.2"/></g><circle class="lit" cx="15.5" cy="22.5" r="5.4" fill="#c5f292"/></svg>`
let n = 0
const html = []
html.push(...imgs.map((im, i) => `      <div id="b${i}" class="clip broll" data-start="${im.gs}" data-duration="${im.d}" data-track-index="0"><img id="bi${i}" data-move="${im.move}" src="${im.src}" alt="" /></div>`))
html.push(...phoneBacks.map((p) => `      <div id="pb-${p.id}" class="clip phoneback" data-start="${p.gs}" data-duration="${(p.end - p.gs).toFixed(2)}" data-track-index="0"><div class="pb-text"><p class="pb-k">${esc(p.k)}</p><p class="pb-h">${esc(p.h)}</p><p class="pb-s">${esc(p.s)}</p></div></div>`))
html.push(...media.map((c) => `      <video id="v${n++}" class="clip media ${c.phone ? "phone" : "full"}" src="${c.src}" muted playsinline data-start="${c.gs}" data-duration="${c.d}" data-media-start="${c.from}" data-playback-rate="${c.rate}" data-track-index="1"></video>`))
// architecture diagram, lit in step with the narration ("Muse Spark", "SAM", "wav2vec", "logged")
const archScene = SCENES.find((s) => s.id === "arch")
const archWords = fs.existsSync(A("voice2/arch.words.json")) ? JSON.parse(fs.readFileSync(A("voice2/arch.words.json"), "utf8")) : []
const wordAt = (re, fb) => {
  const w = archWords.find((x) => re.test(x.text))
  return +((archScene?.voGs ?? 0) + (w ? w.start : fb)).toFixed(2)
}
const ARCH_CUES = { spark: wordAt(/^Muse/, 2.0), sam: wordAt(/^SAM/, 5.5), w2v: wordAt(/^wav2vec/, 6.6), log: wordAt(/^logged/, 8.8) }
const node = (id, title, sub, cls = "") => `<div class="an ${cls}" id="${id}"><b>${esc(title)}</b><small>${esc(sub)}</small></div>`
const archHtml = (b) => `      <section id="arch" class="clip archsc" data-start="${b.gs}" data-duration="${b.d}" data-track-index="2" data-cues='${JSON.stringify(ARCH_CUES)}'>
        <h2 class="arch-title">Under the hood</h2>
        <div class="acol c1"><p class="ah">Field + studio</p>${node("a-phone", "Phone companion", "mic · camera · voice")}${node("a-desk", "Desktop studio", "3D twin · copilot · inventory")}${node("a-docs", "Any drawing or manual", "PDF · patent · photo")}</div>
        <div class="acol c2"><p class="ah">Crew of agents · FastAPI</p>${node("a-bp", "blueprint-reviewer", "drawing → parts, layout")}${node("a-rv", "render-verifier", "render vs drawing, fixes, skills")}${node("a-sup", "supervisor · chat · investigator", "fuses sound, photo, manual")}${node("a-hd", "harness-distiller", "misses → reusable rules")}</div>
        <div class="acol c3"><p class="ah">Meta models</p>${node("m-spark", "Muse Spark 1.3", "api.meta.ai · vision, reasoning, tools", "hero")}${node("m-sam", "SAM 2.1", "on-device segmentation")}${node("m-w2v", "wav2vec 2.0 · MMS-TTS", "on-device speech in and out")}${node("m-img", "Muse Image", "this film's b-roll")}</div>
        <div class="aloop" id="a-loop">Harness² · every confirmed teardown becomes a rule the next diagnosis uses</div>
        <div class="alog" id="a-log">● every call above is logged live with its response id</div>
      </section>`
html.push(...blocks.map((b, i) => b.kind === "arch" ? archHtml(b) : b.kind === "logo"
  ? `      <section id="logo${i}" class="clip lockup" data-start="${b.gs}" data-duration="${b.d}" data-track-index="2"><div class="logo">${mark}</div><div class="word">PITCREW<b>.ai</b></div><div class="tag">Giving heavy machinery a brain</div></section>`
  : `      <section id="end${i}" class="clip lockup endcard" data-start="${b.gs}" data-duration="${b.d}" data-track-index="2"><img class="endbg" src="assets/broll/dawn-plant.png" alt="" /><div class="logo">${mark}</div><div class="word">PITCREW<b>.ai</b></div><div class="repo">github.com/manivsbh/pitcrew-ai</div><div class="models">muse-spark-1.3 · SAM 2.1 · wav2vec 2.0 · MMS-TTS · b-roll by Muse Image</div><div class="fine">Real screen recordings · live Meta calls · sped-up spans marked</div><div class="fine">Voices: ElevenLabs, Kokoro · music: Soundrider/Dope (CC BY)</div></section>`))
html.push(...overlays.map((o, i) => o.cls === "callout"
  ? `      <div id="o${i}" class="clip ov callout"${o.top ? ` style="top: ${o.top}px"` : ""} data-start="${o.gs}" data-duration="${o.d}" data-track-index="3"><div class="cbox"><span class="big">${esc(o.text)}</span><span class="small">${esc(o.small ?? "")}</span></div></div>`
  : `      <div id="o${i}" class="clip ov ${o.cls}"${o.lvl ? ` style="bottom: ${190 + o.lvl * 76}px"` : ""} data-start="${o.gs}" data-duration="${o.d}" data-track-index="3"><span>${esc(o.text)}</span></div>`))
html.push(...caps.map((c, i) => `      <div id="c${i}" class="clip ov cap" data-start="${c.gs}" data-duration="${c.d}" data-track-index="4"><span>${c.words.map((w, j) => `<i id="c${i}w${j}" data-at="${w.at}">${esc(w.text)}</i>`).join(" ")}</span></div>`))
html.push(...audios.map((a) => `      <audio id="${a.id}" src="${a.src}" data-start="${a.gs}" data-duration="${a.d}" data-track-index="5" data-volume="${a.vol}"></audio>`))
const sfxLen = {}
html.push(...sfx.map((x, i) => {
  sfxLen[x.file] ??= +probe(A(`sfx/${x.file}.mp3`)).toFixed(2)
  return `      <audio id="sfx${i}" src="assets/sfx/${x.file}.mp3" data-start="${Math.max(0, x.gs)}" data-duration="${sfxLen[x.file]}" data-track-index="${6 + (i % 3)}" data-volume="${x.vol}"></audio>`
}))
if (music.length) {
  // duck the bed under every spoken line (narration and the engineer), 0.3 s ramps
  const HI = 0.42, LO = 0.16
  const spans = audios.map((a) => [a.gs, a.gs + a.d]).sort((x, y) => x[0] - y[0])
  const merged = []
  for (const [s0, e0] of spans) {
    if (merged.length && s0 <= merged.at(-1)[1] + 0.8) merged.at(-1)[1] = Math.max(merged.at(-1)[1], e0)
    else merged.push([s0, e0])
  }
  const pts = [{ t: 0, v: HI }]
  for (const [s0, e0] of merged) {
    pts.push({ t: +Math.max(0, s0 - 0.3).toFixed(2), v: HI }, { t: +s0.toFixed(2), v: LO },
      { t: +e0.toFixed(2), v: LO }, { t: +(e0 + 0.3).toFixed(2), v: HI })
  }
  const lane = JSON.stringify({ version: 1, lanes: [{ target: "volume", points: pts.filter((p, i, a) => i === 0 || p.t > a[i - 1].t) }] })
  html.push(`      <audio id="music" src="assets/music/bed2.wav" data-start="0" data-duration="${TOTAL}" data-track-index="9" data-volume="${HI}" data-automation='${lane}'></audio>`)
}

const out = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ground: #101314; --ink: #e6eeec; --lime: #c5f292; --cyan: #67d4ff; --amber: #f0b865; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--ground); font-family: "Montserrat", sans-serif; color: var(--ink); }
      .broll { position: absolute; inset: 0; overflow: hidden; }
      .broll img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .media.full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .media.phone { position: absolute; top: 70px; right: 300px; height: 940px; width: 434px; object-fit: cover; border-radius: 44px; border: 3px solid #2a3236; box-shadow: 0 40px 120px rgba(0,0,0,.6), 0 0 0 10px #0b0e0f; }
      .phoneback { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 72% 50%, #1b2422 0%, var(--ground) 70%); }
      .pb-text { position: absolute; left: 150px; top: 330px; width: 820px; }
      .pb-k { font-family: "JetBrains Mono", monospace; font-size: 28px; letter-spacing: .08em; color: var(--lime); text-transform: uppercase; }
      .pb-h { margin-top: 26px; font-size: 80px; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
      .pb-s { margin-top: 28px; font-family: "JetBrains Mono", monospace; font-size: 28px; line-height: 1.45; color: #9fb0ab; }
      .ov { position: absolute; pointer-events: none; }
      .ov span { display: inline-block; }
      .head { left: 0; top: 0; width: 1100px; height: 420px; padding: 64px 0 0 80px; background: linear-gradient(160deg, rgba(10,12,13,.88) 0%, rgba(10,12,13,.55) 45%, rgba(10,12,13,0) 75%); overflow: hidden; }
      .head span { font-size: 92px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.02; max-width: 1000px; }
      .rate { right: 56px; top: 44px; }
      .rate span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--amber); border: 2px solid var(--amber); background: rgba(16,19,20,.85); padding: 6px 14px; border-radius: 8px; }
      .call { left: 56px; bottom: 190px; }
      .call span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--ink); background: rgba(16,19,20,.92); border: 2px solid var(--cyan); padding: 8px 16px; border-radius: 10px; }
      .call span::before { content: "● META  "; color: var(--cyan); }
      .synth { right: 56px; bottom: 190px; }
      .synth span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--amber); background: rgba(16,19,20,.9); border: 1px dashed var(--amber); padding: 6px 14px; border-radius: 8px; }
      .callout { left: 80px; top: 360px; }
      .cbox { background: rgba(10,12,13,.92); border-left: 8px solid var(--lime); padding: 28px 40px; border-radius: 0 16px 16px 0; }
      .callout .big { display: block; font-size: 150px; font-weight: 800; color: var(--lime); letter-spacing: -0.03em; line-height: 1; }
      .callout .small { display: block; margin-top: 14px; font-family: "JetBrains Mono", monospace; font-size: 30px; color: #b7c4c0; }
      .quote { left: 80px; top: 300px; width: 1180px; }
      .quote span { font-size: 58px; font-weight: 700; line-height: 1.2; background: rgba(10,12,13,.92); border-left: 8px solid var(--lime); padding: 28px 40px; border-radius: 0 16px 16px 0; }
      .wipe { inset: 0; overflow: hidden; }
      .wipe span { position: absolute; top: 0; bottom: 0; left: 0; width: 1920px; background: linear-gradient(90deg, rgba(197,242,146,0) 0%, var(--lime) 40%, var(--lime) 60%, rgba(197,242,146,0) 100%); opacity: .9; }
      .cap { left: 0; right: 0; bottom: 64px; text-align: center; }
      .cap span { max-width: 1500px; font-size: 44px; font-weight: 700; line-height: 1.3; background: rgba(10,12,13,.82); padding: 12px 28px; border-radius: 12px; }
      .cap i { font-style: normal; color: #8fa09b; }
      .museimg { right: 56px; top: 44px; }
      .museimg span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--lime); background: rgba(16,19,20,.78); padding: 6px 14px; border-radius: 8px; }
      .archsc { position: absolute; inset: 0; background: radial-gradient(1400px 800px at 60% 40%, #172020 0%, var(--ground) 70%); }
      .arch-title { position: absolute; left: 80px; top: 56px; font-size: 84px; font-weight: 800; letter-spacing: -0.03em; }
      .acol { position: absolute; top: 180px; width: 500px; display: flex; flex-direction: column; gap: 14px; }
      .c1 { left: 80px; } .c2 { left: 680px; } .c3 { left: 1300px; width: 540px; }
      .ah { font-family: "JetBrains Mono", monospace; font-size: 28px; letter-spacing: .08em; text-transform: uppercase; color: #8a9a95; }
      .an { border: 2px solid #2c3634; background: rgba(20,26,26,.92); border-radius: 14px; padding: 16px 22px; }
      .an b { display: block; font-size: 34px; font-weight: 700; }
      .an small { display: block; margin-top: 6px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: #9fb0ab; }
      .an.hero b { font-size: 44px; color: var(--lime); }
      .aloop { position: absolute; left: 80px; right: 80px; bottom: 218px; font-size: 34px; font-weight: 700; color: #0d1110; background: var(--lime); border-radius: 12px; padding: 16px 26px; }
      .alog { position: absolute; left: 80px; bottom: 160px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--cyan); }
      .lockup { position: absolute; inset: 0; background: radial-gradient(900px 600px at 50% 45%, #18201e 0%, var(--ground) 72%); display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .endbg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .28; }
      .logo { position: relative; width: 240px; height: 240px; }
      .logo svg { width: 100%; height: 100%; }
      .word { position: relative; margin-top: 32px; font-size: 128px; font-weight: 800; letter-spacing: 0.02em; }
      .word b { color: var(--lime); font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 96px; }
      .tag { position: relative; margin-top: 18px; font-family: "JetBrains Mono", monospace; font-size: 32px; letter-spacing: .12em; text-transform: uppercase; color: #9fb0ab; }
      .repo { position: relative; margin-top: 36px; font-size: 48px; font-weight: 700; }
      .models { position: relative; margin-top: 28px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--cyan); }
      .fine { position: relative; margin-top: 22px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: #8a9a95; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}">
${html.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const at = (el) => +el.closest("[data-start]").dataset.start;
      const dur = (el) => +el.closest("[data-start]").dataset.duration;
      document.querySelectorAll(".broll img").forEach((el) => {
        const s = at(el), d = dur(el), m = el.dataset.move;
        const from = m === "left" ? { scale: 1.12, xPercent: 3 } : m === "right" ? { scale: 1.12, xPercent: -3 } : { scale: 1.0, xPercent: 0 };
        const to = m === "left" ? { scale: 1.12, xPercent: -3 } : m === "right" ? { scale: 1.12, xPercent: 3 } : { scale: 1.12, xPercent: 0 };
        tl.fromTo(el, from, { ...to, duration: d, ease: "none" }, s);
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25 }, s);
      });
      document.querySelectorAll(".media.full").forEach((el) => {
        tl.fromTo(el, { scale: 1.0 }, { scale: 1.04, duration: dur(el), ease: "none" }, at(el));
      });
      document.querySelectorAll(".head span").forEach((el) => {
        const s = at(el), d = dur(el);
        tl.fromTo(el, { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "power4.out" }, s);
        tl.to(el, { yPercent: -110, duration: 0.4, ease: "power3.in" }, s + d - 0.4);
      });
      document.querySelectorAll(".rate span, .call span, .synth span").forEach((el) => {
        tl.fromTo(el, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, at(el));
      });
      document.querySelectorAll(".callout .cbox, .quote span").forEach((el) => {
        tl.fromTo(el, { xPercent: -8, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, at(el));
      });
      document.querySelectorAll(".wipe span").forEach((el) => {
        tl.fromTo(el, { xPercent: -110 }, { xPercent: 110, duration: dur(el), ease: "power2.inOut" }, at(el));
      });
      document.querySelectorAll(".cap span").forEach((el) => {
        tl.fromTo(el, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, at(el));
      });
      document.querySelectorAll(".cap i").forEach((el) => {
        tl.to(el, { color: "#c5f292", duration: 0.08 }, +el.dataset.at);
        tl.to(el, { color: "#e6eeec", duration: 0.2 }, +el.dataset.at + 0.35);
      });
      document.querySelectorAll(".lockup").forEach((el) => {
        const s = at(el);
        tl.fromTo(el.querySelector(".logo"), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "back.out(1.6)" }, s + 0.1);
        tl.fromTo(el.querySelector(".word"), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, s + 0.5);
        el.querySelectorAll(".tag, .repo, .models, .fine").forEach((x, i) => tl.fromTo(x, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, s + 0.9 + i * 0.3));
      });
      document.querySelectorAll(".museimg span").forEach((el) => {
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at(el) + 0.3);
      });
      const arch = document.getElementById("arch");
      if (arch) {
        const s = +arch.dataset.start, cue = JSON.parse(arch.dataset.cues);
        tl.fromTo(".arch-title", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, s + 0.1);
        [".c1", ".c2", ".c3"].forEach((c, i) => {
          tl.fromTo(c + " .ah", { opacity: 0 }, { opacity: 1, duration: 0.3 }, s + 0.3 + i * 0.35);
          tl.fromTo(c + " .an", { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.12, ease: "power2.out" }, s + 0.4 + i * 0.35);
        });
        const lit = (sel, t) => tl.to(sel, { borderColor: "#c5f292", backgroundColor: "rgba(197,242,146,0.14)", duration: 0.25 }, t);
        lit("#m-spark, #a-bp, #a-rv, #a-sup, #a-hd", cue.spark);
        lit("#m-sam", cue.sam);
        lit("#m-w2v, #a-phone", cue.w2v);
        tl.fromTo("#a-loop", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, cue.sam + 1.0);
        tl.fromTo("#a-log", { opacity: 0 }, { opacity: 1, duration: 0.4 }, cue.log);
      }
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
fs.writeFileSync(path.join(HERE, "index.html"), out)
console.log(`index.html: ${TOTAL.toFixed(1)}s · ${media.length} video spans · ${imgs.length} b-roll · ${caps.length} captions · ${sfx.length} sfx · music parts ${music.length}`)
for (const s of SCENES) console.log(`  ${s.id.padEnd(10)} ${s.start.toFixed(1).padStart(6)}s +${s.len.toFixed(1)}s`)
