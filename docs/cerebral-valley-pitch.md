# PITCREW ⚡ AI — Giving Heavy Machinery a Brain (Cerebral Valley × Meta Hackathon Stage Script)

**Stack:** 100% Meta AI Models (`muse-spark-1.3` Multimodal / Tool-Calling via `https://api.meta.ai/v1` + Local **Meta SAM 2.1** `sam2.1_hiera_tiny.pt`) + Self-Evolving `Harness²` Diagnostic Engine + SQLite FTS5 Component-Graph Hybrid RAG + Parametric Three.js Physics & Closed-Loop BOM Procurement.

---

## Quick Launch (Before Walking on Stage)

```bash
# 1. Regenerate open-license blueprints, workbench photos & 5s fault WAVs (already generated)
.venv/bin/python scripts/build_demo_assets.py

# 2. Build production UI bundle (served directly by FastAPI on :8000)
cd frontend && npm run build && cd ..

# 3. Export Meta API key and launch single-origin server
export MODEL_API_KEY="your_meta_api_key_here"
.venv/bin/uvicorn backend.app.main:app --port 8000
```

Open **`http://localhost:8000`** in Chrome (grant microphone permission once before stage time so Push-to-Talk & 5s Acoustic Capture trigger instantly with zero popups).

---

## Where to Drop Your Real-World Photos (Optional — 4 Shots)

All bundled open-license demo blueprints, workbench photos, and 5-second fault `.wav` clips are **already live** in `data/demo_assets/` and appear as **1-click chips** in the UI.
To mix in real camera photos from your desk/workshop, drop any `.jpg`/`.png` files into `data/demo_assets/photos/`:

1. `data/demo_assets/photos/real-bearing-photo.jpg` — close-up of a real 6203/skate bearing or motor shaft.
2. `data/demo_assets/photos/real-workbench-exploded.jpg` — 3–6 parts laid out on a dark surface for live Meta SAM 2.1 mask segmentation + step-by-step 3D assembly.
3. `data/demo_assets/photos/real-hand-sketch-blueprint.jpg` — paper/whiteboard sketch with `Pos. 1..5` callouts and `Bore: 88 mm | Speed: 4200 rpm` dimensions.
4. `data/demo_assets/photos/real-worn-seal.jpg` — worn/rusted seal or bearing race to trigger automatic Repair Kit PO drafting.

---

## 3-Minute Winning Live Demo Choreography

### Beat 1 (0:00 – 0:45) · 2D Blueprint Image → 3D Parametric Machine & Physics
1. Click **Blueprints** in the left rail.
2. Click the 1-click chip **`v6-engine-blueprint.png`** (or upload your own 2D blueprint image / PDF).
3. Point out the extracted **Physical Dimensions** (`bore_mm: 86`, `stroke_mm: 86`, `cylinders: 6`, `rated_rpm: 4200`) and click **Ask muse-spark-1.3 Vision** → **Finalize 3D pack** → **Stock & Open in 3D ↗**.
4. In **Workspace**, toggle **Blueprint CAD** ↔ **Shaded** in the 3D viewport and click **Run** to show reciprocating pistons, firing pulses, and deterministic BMEP physics checks.

### Beat 2 (0:45 – 1:25) · Image-to-Assembly Guide (Meta SAM 2.1 + `muse-spark-1.3`)
1. Switch machine picker to **Test Bearing Rig (`rig`)** and open **Blueprints** (right column: *Image-to-Assembly Guide*).
2. Click **`exploded-bearing-workbench.png`** (or upload your phone photo).
3. Watch **Meta SAM 2.1** segment every component on-device in ~400 ms while `muse-spark-1.3` + Hybrid RAG attach exact component IDs and manual torque callouts.
4. Click **Next step →** and **Speak step**: the 3D scene animates each part from the parts sheet into assembled position in lockstep with the SAM 2 mask!

### Beat 3 (1:25 – 2:15) · Live Voice & 5s Acoustic Fault Diagnosis → Auto-Drafted Repair Kit PO
1. Open **Workspace** on `Test Bearing Rig`.
2. Play `data/demo_assets/audio/outer-race-spall-1500rpm.wav` from your phone near the laptop mic and click **Listen 5s (Mic)** *(or click the 1-click **`outer-race-spall-1500rpm`** chip right above the composer in a noisy venue)*.
3. Watch the **6-Agent Mesh** fire simultaneously:
   - **Signal & Acoustic Analyst** computes Welch FFT + `Harness²` structural-band (`500–4000 Hz`) envelope harmonic SNR (`BPFO SNR > 300`, `confidence 0.95`).
   - **3D Viewport** automatically explodes and pulses **`Outer ring (6203)`** in amber, while plotting the live acoustic FFT on the **Spectrum** chart.
   - **Inventory & Procurement Planner** auto-drafts the **BOM Repair Kit** (`FAG 6203 outer raceway` + companion `chrome-steel ball set` + `ribbon cage` = `\$81.50` sandbox PO).
   - **Voice TTS** speaks the cited diagnosis aloud, and one click on **Confirm & Submit PO** completes the audited transaction!

### Beat 4 (2:15 – 3:00) · Self-Evolving `Harness²` (`16.7% → 76.2%`) + Zero-Hallucination RAG
1. Click **Agent lab**.
2. Show all **6 Live Specialist Agents** with per-agent latency & telemetry, plus the **Component-Graph + SQLite FTS5 Hybrid RAG** live search (`0/164` unverified claims — fabricated quotes are deterministically dropped).
3. Highlight the **`Harness²` Self-Evolving Diagnostic Engine**:
   - Explain why V1 (`16.7%` accuracy on held-out Paderborn bearings) failed: comparing raw RMS against a single healthy reference (`K001`) misfired on quieter damaged bearings, and ultrasonic sensor resonance (`8–20 kHz`) caused false alarms.
   - Click **Distill lesson into Harness**: show how a post-reveal mismatch distills a label-scrubbed skill (`harness-v2.1`) into `data/harness/rig.json`, lifting held-out accuracy to **76.2% (86.5% on answered cases, 3/3 bearing majority)**!
