// Writes index.html for the PitCrew demo from the recorded beats.
// Each scene lists source spans [clip, from, to, rate]; Meta-call chips and captions
// are placed from the beat's own marks (<clip>.json) and the narration lengths.
// Usage: node build.mjs   (expects assets/clips/*.mp4|json and assets/voice/*.wav)
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))
const A = (p) => path.join(HERE, "assets", p)
const probe = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
  "-of", "default=nw=1:nk=1", f]).toString().trim()

const SCENES = [
  { id: "intro", kind: "graphic", hold: 9 },
  { id: "patent", kicker: "01 · Unknown blueprint to 3D", clip: "patent",
    spans: [[2, 9.5, 1.25], [9.5, 34, 6], [34, 49.5, 2]] },
  { id: "eyes", kicker: "02 · Meta eyes verify the build", clip: "patent", vo: "eyes",
    spans: [[49.5, 81.5, 8], [202, 214, 2], [368, 380, 1.5]] },
  { id: "controls", kicker: "03 · A working twin", clip: "controls", spans: [[6.5, 43.5, 3]] },
  { id: "numbers", kicker: "04 · What if?", clip: "numbers", spans: [[9, 26, 1.5]] },
  { id: "phonevoice", kicker: "05 · Talk to it", clip: "phonevoice", phone: true, spans: "auto-voice",
    engineer: { file: "voice/ask-diagnose.raw.wav", mark: /Push-to-talk/ }, voDelay: 5.6 },
  { id: "phone", kicker: "06 · Listen to the machine", clip: "phone", phone: true,
    spans: [[2, 9.5, 1], [9.5, 27, 5], [27, 33, 1], [52, 56, 1]] },
  { id: "sam", kicker: "07 · See the parts", clip: "sam", spans: "auto-sam" },
  { id: "argue", kicker: "08 · Push back", clip: "argue", spans: "auto-argue" },
  { id: "inventory", kicker: "09 · Stock the fix", clip: "inventory", spans: [[7, 18, 1.5]] },
  { id: "outro", kicker: "10 · Any machine", clip: "anymachine", spans: [[3, 39, 4]], tail: 5.5 },
]

const meta = (clip) => JSON.parse(fs.readFileSync(A(`clips/${clip}.json`), "utf8"))
const markAt = (m, re) => m.marks.find((x) => re.test(x.label))?.t

function autoSpans(scene) {
  const m = meta(scene.clip)
  const end = m.duration_s - 0.5
  if (scene.spans === "auto-voice") {
    const push = markAt(m, /Push-to-talk/) ?? 3.5
    const stop = markAt(m, /stop talking/) ?? push + 7
    const chat = markAt(m, /manual-chat/) ?? stop + 9
    return [[push - 0.6, stop + 0.5, 1], [stop + 0.5, chat, 4], [chat, Math.min(end, chat + 7), 1]]
  }
  if (scene.spans === "auto-sam") {
    const seg = markAt(m, /sam-segmenter/) ?? 120
    return [[4, 8, 1], [8, seg, 10], [seg, Math.min(end, seg + 10), 2]]
  }
  if (scene.spans === "auto-argue") {
    const send = markAt(m, /Send push-back/) ?? 37
    const chat = m.marks.filter((x) => /manual-chat/.test(x.label)).map((x) => x.t).filter((t) => t > send)[0] ?? send + 8
    return [[10, 24, 3], [24, send + 1, 2], [send + 1, chat, 3], [chat, Math.min(end, chat + 6.5), 1]]
  }
  return scene.spans
}

const MODEL = { "blueprint-reviewer": "muse-spark-1.3", "render-verifier": "muse-spark-1.3",
  "sam-segmenter": "SAM 2.1 (local)", "assembly-grounder": "muse-spark-1.3",
  "manual-chat": "muse-spark-1.3", supervisor: "muse-spark-1.3",
  "speech-to-text": "wav2vec 2.0 (local)", voice: "MMS-TTS (local)" }

let t = 0
const clips = []
const overlays = []
const audios = []
const css = []
for (const s of SCENES) {
  const start = t
  const voFile = A(`voice/vo-${s.vo ?? s.id}.wav`)
  const vo = fs.existsSync(voFile) ? probe(voFile) : 0
  let len = 0
  if (s.kind === "graphic") {
    len = Math.max(s.hold, vo + 1.2)
  } else {
    const m = meta(s.clip)
    for (const [from, to, rate] of autoSpans(s)) {
      const d = +((to - from) / rate).toFixed(2)
      const gs = +(start + len).toFixed(2)
      clips.push({ scene: s.id, src: `assets/clips/${s.clip}.mp4`, gs, d, from, rate, phone: !!s.phone })
      if (rate > 1.01) overlays.push({ cls: "rate", gs, d, text: `${rate}× speed` })
      const push = s.engineer && m.marks.find((x) => s.engineer.mark.test(x.label))
      if (push && push.t >= from && push.t < to) {
        const at = +(gs + (push.t - from) / rate + 0.3).toFixed(2)
        const f = A(s.engineer.file)
        audios.push({ id: `eng-${s.id}`, src: `assets/${s.engineer.file}`, gs: at, d: +probe(f).toFixed(2), noCaption: true })
        overlays.push({ cls: "synth", gs: at, d: 5, text: "synthetic engineer voice (Kokoro)" })
      }
      for (const mk of m.marks) {
        const hit = mk.label.match(/^Meta call landed: (\S+) (\d+)ms/)
        if (!hit || mk.t < from || mk.t >= to) continue
        const at = +(gs + (mk.t - from) / rate).toFixed(2)
        overlays.push({ cls: "call", gs: at, d: 3.2,
          text: `${hit[1]} · ${MODEL[hit[1]] ?? "Meta model"} · ${(+hit[2] / 1000).toFixed(1)} s` })
      }
      len += d
    }
    len += s.tail ?? 0
    len = Math.max(len, vo + (s.voDelay ?? 0.4) + 0.6)
  }
  if (vo) audios.push({ id: `vo-${s.id}`, src: `assets/voice/vo-${s.vo ?? s.id}.wav`, gs: +(start + (s.voDelay ?? 0.4)).toFixed(2), d: +vo.toFixed(2) })
  if (s.kicker) overlays.push({ cls: "kicker", gs: +start.toFixed(2), d: +Math.min(len, 6).toFixed(2), text: s.kicker })
  t = +(start + len).toFixed(2)
  s.start = start
  s.len = len
}
const TOTAL = +t.toFixed(2)

// captions: the narration split into sentences, timed by length
const script = fs.readFileSync(path.join(HERE, "..", "script.md"), "utf8")
const lines = Object.fromEntries(script.split("\n").filter((l) => /^\| [a-z]+ \|/.test(l))
  .map((l) => l.split("|").map((c) => c.trim())).map((c) => [c[1], c[3]]))
lines.patent = "It starts from a drawing it has never seen, a 1968 public-domain pump patent. Meta's muse-spark reads the sheet, asks what's missing, and I answer in plain words. Finalize, and the drawing becomes a 3D machine."
for (const a of audios) {
  if (a.noCaption) continue
  const id = a.id.slice(3)
  const text = lines[id === "eyes" ? "eyes" : id]
  if (!text) continue
  const parts = []
  for (const p of text.match(/[^.!?]+[.!?]+/g) ?? [text]) {
    if (parts.length && parts.at(-1).length < 24) parts[parts.length - 1] += p
    else parts.push(p)
  }
  const total = parts.reduce((n, p) => n + p.length, 0)
  let at = a.gs
  for (const p of parts) {
    const d = +(a.d * p.length / total).toFixed(2)
    overlays.push({ cls: "cap", gs: +at.toFixed(2), d, text: p.trim() })
    at += d
  }
}

// stack Meta-call chips that are on screen at the same time
const calls = overlays.filter((o) => o.cls === "call").sort((a, b) => a.gs - b.gs)
for (const [i, c] of calls.entries()) {
  const busy = new Set(calls.slice(0, i).filter((p) => p.gs + p.d > c.gs).map((p) => p.lvl))
  c.lvl = 0
  while (busy.has(c.lvl)) c.lvl++
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
let n = 0
const vid = clips.map((c) => `      <video id="v${n++}" class="clip media ${c.phone ? "phone" : "full"}" src="${c.src}" muted playsinline data-start="${c.gs}" data-duration="${c.d}" data-media-start="${c.from}" data-playback-rate="${c.rate}" data-track-index="1"></video>`).join("\n")
const ov = overlays.map((o, i) => `      <div id="o${i}" class="clip ov ${o.cls}"${o.lvl ? ` style="bottom: ${168 + o.lvl * 76}px"` : ""} data-start="${o.gs}" data-duration="${o.d}" data-track-index="${o.cls === "cap" ? 4 : 3}"><span>${esc(o.text)}</span></div>`).join("\n")
const au = audios.map((a) => `      <audio id="${a.id}" src="${a.src}" data-start="${a.gs}" data-duration="${a.d}" data-track-index="5" data-volume="1"></audio>`).join("\n")
const phoneScenes = SCENES.filter((s) => s.phone)
const phoneBacks = phoneScenes.map((s) => `      <div id="pb-${s.id}" class="clip phoneback" data-start="${s.start.toFixed(2)}" data-duration="${s.len.toFixed(2)}" data-track-index="0"><div class="pb-text"><p class="pb-k">${esc(s.kicker)}</p><p class="pb-h">${s.id === "phone" ? "The phone mic is the sensor." : "The engineer just talks."}</p><p class="pb-s">${s.id === "phone" ? "5 s capture → FFT + envelope → bearing fault frequencies" : "Synthetic voice · Meta wav2vec 2.0 on-device · MMS-TTS reply"}</p></div></div>`).join("\n")
const outro = SCENES.at(-1)
const endStart = +(outro.start + outro.len - outro.tail).toFixed(2)

const mark = `<svg viewBox="0 0 64 64" fill="none"><circle class="ring" cx="32" cy="32" r="27" stroke="#e6eeec" stroke-width="4.5"/><circle class="ring" cx="32" cy="32" r="11" stroke="#e6eeec" stroke-width="4.5"/><g class="balls" fill="#e6eeec" opacity="0.55"><circle cx="32" cy="13" r="4.2"/><circle cx="48.5" cy="22.5" r="4.2"/><circle cx="48.5" cy="41.5" r="4.2"/><circle cx="32" cy="51" r="4.2"/><circle cx="15.5" cy="41.5" r="4.2"/></g><circle class="lit" cx="15.5" cy="22.5" r="5.4" fill="#c5f292"/><circle class="halo" cx="15.5" cy="22.5" r="9" stroke="#c5f292" stroke-width="1.6" opacity="0.55"/></svg>`

const html = `<!doctype html>
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
      .media.full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .media.phone { position: absolute; top: 70px; right: 300px; height: 940px; width: 434px; object-fit: cover; border-radius: 44px; border: 3px solid #2a3236; box-shadow: 0 40px 120px rgba(0,0,0,.6), 0 0 0 10px #0b0e0f; }
      .phoneback { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 72% 50%, #1b2422 0%, var(--ground) 70%); }
      .pb-text { position: absolute; left: 150px; top: 330px; width: 820px; }
      .pb-k { font-family: "JetBrains Mono", monospace; font-size: 28px; letter-spacing: .08em; color: var(--lime); text-transform: uppercase; }
      .pb-h { margin-top: 26px; font-size: 76px; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
      .pb-s { margin-top: 28px; font-family: "JetBrains Mono", monospace; font-size: 28px; line-height: 1.45; color: #9fb0ab; }
      .ov { position: absolute; pointer-events: none; }
      .ov span { display: inline-block; }
      .kicker { left: 56px; top: 44px; }
      .kicker span { font-family: "JetBrains Mono", monospace; font-size: 28px; letter-spacing: .06em; text-transform: uppercase; color: #0d1110; background: var(--lime); padding: 10px 18px; border-radius: 8px; }
      .rate { right: 56px; top: 44px; }
      .rate span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--amber); border: 2px solid var(--amber); background: rgba(16,19,20,.85); padding: 8px 16px; border-radius: 8px; }
      .call { left: 56px; bottom: 168px; }
      .call span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--ink); background: rgba(16,19,20,.92); border: 2px solid var(--cyan); padding: 10px 18px; border-radius: 10px; }
      .call span::before { content: "● LIVE META CALL  "; color: var(--cyan); }
      .synth { right: 56px; bottom: 168px; }
      .synth span { font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--amber); background: rgba(16,19,20,.9); border: 1px dashed var(--amber); padding: 8px 14px; border-radius: 8px; }
      .cap { left: 0; right: 0; bottom: 56px; text-align: center; }
      .cap span { max-width: 1500px; font-size: 38px; font-weight: 600; line-height: 1.3; background: rgba(10,12,13,.86); padding: 14px 28px; border-radius: 12px; }
      #intro, #endcard { position: absolute; inset: 0; background: radial-gradient(900px 600px at 50% 45%, #18201e 0%, var(--ground) 72%); display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .logo { width: 260px; height: 260px; }
      .logo svg { width: 100%; height: 100%; }
      .word { margin-top: 36px; font-size: 128px; font-weight: 800; letter-spacing: 0.02em; }
      .word b { color: var(--lime); font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 96px; }
      .tag { margin-top: 18px; font-family: "JetBrains Mono", monospace; font-size: 30px; letter-spacing: .12em; text-transform: uppercase; color: #9fb0ab; }
      .models { margin-top: 56px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: var(--cyan); }
      .repo { margin-top: 40px; font-size: 44px; font-weight: 700; }
      .fine { margin-top: 28px; font-family: "JetBrains Mono", monospace; font-size: 28px; color: #7f8f8a; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}">
      <section id="intro" class="clip" data-start="0" data-duration="${SCENES[0].len.toFixed(2)}" data-track-index="0">
        <div class="logo" id="intro-logo">${mark}</div>
        <div class="word" id="intro-word">PITCREW<b>.ai</b></div>
        <div class="tag" id="intro-tag">Giving heavy machinery a brain</div>
        <div class="models" id="intro-models">Built on Meta muse-spark-1.3 · SAM 2.1 · wav2vec 2.0 · MMS-TTS</div>
      </section>
${phoneBacks}
${vid}
      <section id="endcard" class="clip" data-start="${endStart}" data-duration="${(TOTAL - endStart).toFixed(2)}" data-track-index="2">
        <div class="logo" id="end-logo">${mark}</div>
        <div class="word" id="end-word">PITCREW<b>.ai</b></div>
        <div class="repo" id="end-repo">github.com/manivsbh/pitcrew-ai</div>
        <div class="models" id="end-models">muse-spark-1.3 · SAM 2.1 · wav2vec 2.0 · MMS-TTS</div>
        <div class="fine" id="end-fine">Real screen recordings · live Meta calls · sped-up spans marked · engineer voice is synthetic (Kokoro)</div>
      </section>
${ov}
${au}
      <audio id="music" src="assets/music/bed.wav" data-start="0" data-duration="${TOTAL}" data-track-index="6" data-volume="0.16"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#intro-logo .ring", { scale: 0.6, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.15 }, 0.2);
      tl.fromTo("#intro-logo .balls circle", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08 }, 0.9);
      tl.fromTo("#intro-logo .lit", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.5, ease: "back.out(3)" }, 1.6);
      tl.fromTo("#intro-logo .halo", { scale: 0.6, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1.6, opacity: 0, keyframes: [{ opacity: 0.8, duration: 0.3 }, { opacity: 0, duration: 0.9 }] }, 1.8);
      tl.fromTo("#intro-word", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, 2.2);
      tl.fromTo("#intro-tag", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, 2.8);
      tl.fromTo("#intro-models", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 4.0);
      document.querySelectorAll(".ov span").forEach((el) => {
        const host = el.parentElement;
        const s = +host.dataset.start;
        tl.fromTo(el, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, s);
      });
      document.querySelectorAll(".media.full").forEach((el) => {
        const s = +el.dataset.start, d = +el.dataset.duration;
        tl.fromTo(el, { scale: 1.0 }, { scale: 1.03, duration: d, ease: "none" }, s);
      });
      const e = ${endStart};
      tl.fromTo("#end-logo", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "power3.out" }, e + 0.2);
      tl.fromTo("#end-word", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, e + 0.6);
      tl.fromTo("#end-repo", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, e + 1.1);
      tl.fromTo("#end-models", { opacity: 0 }, { opacity: 1, duration: 0.6 }, e + 1.6);
      tl.fromTo("#end-fine", { opacity: 0 }, { opacity: 1, duration: 0.6 }, e + 1.0);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
fs.writeFileSync(path.join(HERE, "index.html"), html)
console.log(`index.html: ${TOTAL}s, ${clips.length} video spans, ${overlays.length} overlays, ${audios.length} voice clips`)
for (const s of SCENES) console.log(`  ${s.id.padEnd(11)} ${s.start.toFixed(1).padStart(6)}s  +${s.len.toFixed(1)}s`)
