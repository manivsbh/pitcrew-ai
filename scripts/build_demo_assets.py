"""Generate open-license demo assets for Cerebral Valley x Meta Hackathon.

Produces deterministic, self-contained demo files under `data/demo_assets/`:
1. `blueprints/` — 2D CAD technical drawings (.png + searchable .pdf) for:
   - `spindle-6203-blueprint.{png,pdf}`
   - `v6-engine-blueprint.{png,pdf}`
   - `centrifugal-pump-blueprint.{png,pdf}`
2. `photos/`     — High-contrast exploded workbench layouts (.png) for SAM 2.1
                   instance segmentation + 3D assembly-guide grounding.
3. `audio/`      — Playable 5.0-second 16 kHz WAV clips (.wav) with realistic
                   structural resonance & bearing fault modulation:
   - `healthy-motor-1500rpm.wav`
   - `outer-race-spall-1500rpm.wav`
   - `inner-race-defect-1500rpm.wav`
   - `pump-cavitation-2900rpm.wav`
4. `signals/`    — Open calibration vibration CSVs (`16000 Hz`, `1500 rpm`).
"""

from __future__ import annotations

import io
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy.io import wavfile

OUT_ROOT = "data/demo_assets"


def _draw_blueprint_canvas(title: str, subtitle: str, dims_line: str,
                           callouts: list[tuple[str, str, tuple[int, int], tuple[int, int]]],
                           shapes_fn) -> Image.Image:
    W, H = 1200, 800
    im = Image.new("RGB", (W, H), (14, 29, 44))
    dr = ImageDraw.Draw(im)

    # Blueprint grid
    for x in range(0, W, 40):
        dr.line([(x, 0), (x, H)], fill=(23, 47, 70), width=1)
    for y in range(0, H, 40):
        dr.line([(0, y), (W, y)], fill=(23, 47, 70), width=1)
    dr.rectangle([18, 18, W - 18, H - 18], outline=(130, 195, 235), width=2)
    dr.rectangle([24, 24, W - 24, H - 24], outline=(65, 115, 155), width=1)

    # Centerlines
    dr.line([(80, 390), (830, 390)], fill=(70, 130, 165), width=1)

    # Schematic geometry
    shapes_fn(dr)

    # Balloon callouts + BOM table
    bom_x = 855
    dr.rectangle([bom_x, 45, W - 36, 540], fill=(11, 24, 37), outline=(120, 185, 225), width=1)
    dr.text((bom_x + 14, 56), "BILL OF MATERIALS (REV A)", fill=(194, 236, 147))
    dr.line([(bom_x, 82), (W - 36, 82)], fill=(90, 145, 180), width=1)

    for idx, (pos, name, target_xy, balloon_xy) in enumerate(callouts):
        bx, by = balloon_xy
        tx, ty = target_xy
        dr.line([balloon_xy, target_xy], fill=(194, 236, 147), width=2)
        dr.ellipse([tx - 4, ty - 4, tx + 4, ty + 4], fill=(235, 185, 105))
        dr.ellipse([bx - 16, by - 16, bx + 16, by + 16],
                   fill=(18, 42, 62), outline=(194, 236, 147), width=2)
        dr.text((bx - 6, by - 6), pos, fill=(240, 248, 255))
        row_y = 96 + idx * 38
        if row_y < 515:
            dr.text((bom_x + 14, row_y), f"Pos. {pos:>3}  {name[:28]}", fill=(215, 232, 245))

    # Title & Dimension Block
    dr.rectangle([855, 560, W - 36, H - 36], fill=(11, 24, 37), outline=(130, 195, 235), width=2)
    dr.text((870, 576), "FORMA ENGINEERING DRAWING", fill=(130, 195, 235))
    dr.text((870, 604), title, fill=(245, 250, 255))
    dr.text((870, 630), subtitle, fill=(165, 195, 215))
    dr.line([(855, 658), (W - 36, 658)], fill=(80, 130, 165), width=1)
    y_cursor = 670
    for ln in dims_line.split(" | "):
        dr.text((870, y_cursor), ln, fill=(194, 236, 147))
        y_cursor += 22
    return im


def _make_searchable_pdf(lines: list[str]) -> bytes:
    """Valid single-page searchable PDF containing BOM + dimension callouts."""
    esc = [ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
           for ln in lines]
    ops = ("BT /F1 11 Tf 48 745 Td "
           + " 0 -15 Td ".join(f"({ln}) Tj" for ln in esc)
           + " ET")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(ops)).encode() + b" >>\nstream\n"
        + ops.encode("latin-1", "replace") + b"\nendstream",
    ]
    out = [b"%PDF-1.4\n"]
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(sum(len(x) for x in out))
        out.append(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = sum(len(x) for x in out)
    out.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.append(f"{off:010d} 00000 n \n".encode())
    out.append(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\n"
               f"startxref\n{xref}\n%%EOF\n".encode())
    return b"".join(out)


def build_blueprints() -> None:
    bp_dir = os.path.join(OUT_ROOT, "blueprints")
    os.makedirs(bp_dir, exist_ok=True)

    # 1. Spindle 6203 Bearing Rig
    def draw_rig(dr: ImageDraw.ImageDraw):
        dr.rectangle([110, 290, 290, 490], outline=(185, 225, 250), width=3)  # Motor
        for y in range(305, 480, 18):
            dr.line([(125, y), (275, y)], fill=(95, 155, 195), width=2)
        dr.rectangle([290, 368, 720, 412], outline=(225, 240, 255), width=3)  # Shaft
        dr.rectangle([490, 250, 650, 530], outline=(150, 205, 240), width=3)  # Housing
        dr.ellipse([515, 275, 625, 385], outline=(194, 236, 147), width=3)    # Outer ring
        dr.ellipse([535, 295, 605, 365], outline=(235, 185, 105), width=2)    # Inner ring
        for cx, cy in [(570, 283), (612, 330), (570, 377), (528, 330)]:
            dr.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(220, 238, 250))

    rig_img = _draw_blueprint_canvas(
        "SPINDLE 6203 TEST RIG",
        "ISO-10816 Rolling Bearing Assembly",
        "Shaft diameter: 20 mm | Rated speed: 1500 rpm | Torque: 12 Nm",
        [
            ("1", "Drive Motor", (200, 310), (160, 170)),
            ("2", "Drive Shaft", (390, 388), (370, 210)),
            ("3", "Bearing Housing", (640, 270), (720, 175)),
            ("4", "Test Bearing Outer Ring", (595, 285), (560, 150)),
            ("5", "Test Bearing Inner Ring", (585, 345), (465, 575)),
            ("6", "Rolling Elements", (612, 330), (745, 325)),
            ("7", "Bearing Cage", (540, 330), (350, 555)),
        ],
        draw_rig,
    )
    rig_img.save(os.path.join(bp_dir, "spindle-6203-blueprint.png"))
    with open(os.path.join(bp_dir, "spindle-6203-blueprint.pdf"), "wb") as f:
        f.write(_make_searchable_pdf([
            "SPINDLE 6203 BEARING RIG BLUEPRINT - EXPLODED VIEW AND PARTS LIST",
            "Shaft diameter: 20 mm; Rated speed: 1500 rpm; Torque: 12 Nm.",
            "1 Drive Motor ........................ 25 Nm",
            "2 Drive Shaft ........................ 12 Nm",
            "3 Bearing Housing .................... 45 Nm",
            "4 Test Bearing Outer Ring ............ 18 Nm",
            "5 Test Bearing Inner Ring ............ 18 Nm",
            "6 Rolling Elements (Pos. 6) seated inside Bearing Cage (Pos. 7).",
            "Install Drive Shaft (Pos. 2) through Test Bearing Inner Ring (Pos. 5).",
            "Step 1 mounts Bearing Housing (Pos. 3) to Drive Motor (Pos. 1).",
        ]))

    # 2. V6 Engine Blueprint
    def draw_v6(dr: ImageDraw.ImageDraw):
        dr.polygon([(450, 460), (290, 240), (375, 195), (470, 360)], outline=(185, 225, 250), width=3)
        dr.polygon([(470, 460), (630, 240), (545, 195), (450, 360)], outline=(185, 225, 250), width=3)
        dr.ellipse([415, 420, 505, 510], outline=(235, 185, 105), width=3)  # Crankshaft
        dr.rectangle([340, 510, 580, 585], outline=(145, 200, 235), width=2)  # Oil pan
        dr.ellipse([330, 235, 390, 295], outline=(194, 236, 147), width=2)    # Piston L
        dr.ellipse([530, 235, 590, 295], outline=(194, 236, 147), width=2)    # Piston R
        dr.line([(360, 265), (460, 465)], fill=(220, 235, 250), width=3)
        dr.line([(560, 265), (460, 465)], fill=(220, 235, 250), width=3)

    v6_img = _draw_blueprint_canvas(
        "60-DEG V6 COMBUSTION ENGINE",
        "3.0L DOHC Direct-Injection Powertrain",
        "Bore: 86 mm | Stroke: 86 mm | 6 cylinders | Rated speed: 4200 rpm",
        [
            ("1", "Crankcase Block", (460, 395), (235, 395)),
            ("2", "Forged Crankshaft", (460, 465), (245, 495)),
            ("3", "Connecting Rods", (410, 365), (230, 305)),
            ("4", "Piston Assembly", (360, 260), (240, 175)),
            ("5", "Cylinder Bank L", (325, 235), (380, 120)),
            ("6", "Cylinder Bank R", (590, 235), (675, 145)),
            ("7", "Fuel Rail L", (415, 210), (500, 115)),
            ("8", "Direct Fuel Injector", (525, 210), (705, 235)),
            ("9", "Iridium Spark Plugs", (575, 215), (725, 340)),
            ("10", "Oil Pan Sump", (460, 560), (690, 555)),
        ],
        draw_v6,
    )
    v6_img.save(os.path.join(bp_dir, "v6-engine-blueprint.png"))
    with open(os.path.join(bp_dir, "v6-engine-blueprint.pdf"), "wb") as f:
        f.write(_make_searchable_pdf([
            "V6 DIRECT INJECTION ENGINE BLUEPRINT - EXPLODED VIEW AND PARTS LIST",
            "Bore: 86 mm; Stroke: 86 mm; 6 cylinders; Rated speed: 4200 rpm; Torque: 340 Nm.",
            "1 Crankcase Block .................... 65 Nm",
            "2 Forged Crankshaft .................. 85 Nm",
            "3 Connecting Rods .................... 48 Nm",
            "4 Piston Assembly .................... 22 Nm",
            "5 Cylinder Bank L .................... 70 Nm",
            "6 Cylinder Bank R .................... 70 Nm",
            "7 Fuel Rail L ........................ 24 Nm",
            "8 Direct Fuel Injector ............... 12 Nm",
            "9 Iridium Spark Plugs ................ 18 Nm",
            "10 Oil Pan Sump ...................... 14 Nm",
            "Step 1 seats Forged Crankshaft (Pos. 2) in Crankcase Block (Pos. 1).",
        ]))

    # 3. Multistage Centrifugal Pump Blueprint
    def draw_pump(dr: ImageDraw.ImageDraw):
        dr.rectangle([380, 130, 540, 270], outline=(185, 225, 250), width=3)  # Motor
        dr.rectangle([446, 270, 474, 620], outline=(235, 245, 255), width=3)  # Pump shaft
        dr.rectangle([420, 290, 500, 345], outline=(235, 185, 105), width=2)  # Coupling + seal
        for st_y in (380, 435, 490):
            dr.rectangle([390, st_y, 530, st_y + 42], outline=(130, 200, 240), width=2)
            dr.polygon([(410, st_y + 34), (460, st_y + 10), (510, st_y + 34)],
                       outline=(194, 236, 147), width=2)
        dr.rectangle([340, 555, 580, 645], outline=(185, 225, 250), width=3)  # Suction/discharge base

    pump_img = _draw_blueprint_canvas(
        "MULTISTAGE CENTRIFUGAL PUMP",
        "Vertical In-Line Cartridge Seal Stack",
        "Shaft diameter: 22 mm | Rated speed: 2900 rpm | Torque: 28 Nm",
        [
            ("1", "Suction Discharge Base", (360, 600), (225, 600)),
            ("2", "Stage Impeller", (460, 405), (235, 415)),
            ("3", "Diffuser Chamber", (528, 455), (705, 455)),
            ("4", "Pump Shaft", (460, 360), (245, 330)),
            ("5", "Cartridge Shaft Seal", (495, 330), (695, 325)),
            ("6", "Sleeve O-Ring", (392, 510), (235, 515)),
            ("7", "Coupling Halves", (430, 305), (250, 235)),
            ("8", "Drive Motor", (535, 195), (695, 185)),
        ],
        draw_pump,
    )
    pump_img.save(os.path.join(bp_dir, "centrifugal-pump-blueprint.png"))
    with open(os.path.join(bp_dir, "centrifugal-pump-blueprint.pdf"), "wb") as f:
        f.write(_make_searchable_pdf([
            "MULTISTAGE CENTRIFUGAL PUMP BLUEPRINT - EXPLODED VIEW AND PARTS LIST",
            "Shaft diameter: 22 mm; Rated speed: 2900 rpm; Torque: 28 Nm.",
            "1 Suction Discharge Base ............. 40 Nm",
            "2 Stage Impeller ..................... 24 Nm",
            "3 Diffuser Chamber ................... 30 Nm",
            "4 Pump Shaft ......................... 28 Nm",
            "5 Cartridge Shaft Seal ............... 35 Nm",
            "6 Sleeve O-Ring ...................... 2 Nm",
            "7 Coupling Halves .................... 13 Nm",
            "8 Drive Motor ........................ 45 Nm",
            "Step 1 fits Sleeve O-Ring (Pos. 6) and Cartridge Shaft Seal (Pos. 5).",
        ]))


def build_workbench_photos() -> None:
    """High-contrast separated component layouts so SAM 2.1 segments crisp masks."""
    ph_dir = os.path.join(OUT_ROOT, "photos")
    os.makedirs(ph_dir, exist_ok=True)

    im = Image.new("RGB", (960, 640), (28, 32, 34))
    dr = ImageDraw.Draw(im)
    # Inspection mat border
    dr.rectangle([20, 20, 940, 620], outline=(62, 72, 68), width=2)

    # Distinct high-contrast parts laid out on bench:
    # 1. Motor block (sage green)
    dr.rectangle([60, 90, 270, 280], fill=(88, 118, 98), outline=(190, 215, 195), width=3)
    # 2. Precision drive shaft (bright steel bar)
    dr.rectangle([320, 155, 860, 205], fill=(205, 212, 220), outline=(245, 248, 252), width=2)
    # 3. Bearing housing (cast iron block)
    dr.rectangle([70, 355, 285, 555], fill=(125, 134, 142), outline=(200, 208, 215), width=3)
    # 4. Outer ring 6203 (steel annulus)
    dr.ellipse([345, 345, 535, 535], fill=(195, 204, 214), outline=(245, 250, 255), width=3)
    dr.ellipse([390, 390, 490, 490], fill=(28, 32, 34), outline=(160, 170, 180), width=2)
    # 5. Inner ring 6203
    dr.ellipse([580, 375, 710, 505], fill=(216, 222, 230), outline=(250, 252, 255), width=3)
    dr.ellipse([612, 407, 678, 473], fill=(28, 32, 34), outline=(170, 178, 188), width=2)
    # 6. Brass ribbon cage (warm brass)
    dr.ellipse([755, 365, 900, 510], fill=(196, 148, 72), outline=(245, 205, 125), width=3)
    dr.ellipse([792, 402, 863, 473], fill=(28, 32, 34), outline=(170, 125, 55), width=2)

    im.save(os.path.join(ph_dir, "exploded-bearing-workbench.png"))

    with open(os.path.join(ph_dir, "README.md"), "w", encoding="utf-8") as f:
        f.write(
            "# Real-World Demo Photos Drop-In Folder\n\n"
            "Drop your phone/camera workbench photos here (`JPG`, `PNG`, or `WEBP`) —\n"
            "they will automatically appear as 1-click buttons in the **Blueprints -> Image-to-Assembly Guide** tab!\n\n"
            "Recommended 4 photos to capture:\n"
            "1. `real-bearing-photo.jpg` — ball bearing or motor shaft close-up\n"
            "2. `real-workbench-exploded.jpg` — 3–6 parts laid out on a table for live SAM 2.1 assembly steps\n"
            "3. `real-hand-sketch-blueprint.jpg` — whiteboard or paper sketch with Pos. 1..5 callouts + mm dimensions\n"
            "4. `real-worn-seal.jpg` — rusted/worn bolt, seal, or bearing race to trigger automatic Repair Kit PO\n"
        )


def _impulse_train(t: np.ndarray, fs: float, f_rep: float, f_res: float,
                   decay: float = 420.0, am_freq: float | None = None) -> np.ndarray:
    """Synthesize realistic periodic spall impacts exciting a structural mode."""
    sig = np.zeros_like(t)
    period = 1.0 / f_rep
    n_imp = int(t[-1] * f_rep)
    ir_len = int(0.025 * fs)
    tau = np.arange(ir_len) / fs
    kernel = np.exp(-decay * tau) * np.sin(2.0 * np.pi * f_res * tau)
    for k in range(n_imp):
        idx = int(k * period * fs)
        if idx + ir_len >= sig.size:
            break
        amp = 1.0
        if am_freq is not None:
            amp = 0.55 + 0.45 * np.cos(2.0 * np.pi * am_freq * (k * period))
        sig[idx: idx + ir_len] += amp * kernel
    return sig


def build_audio_and_csv() -> None:
    au_dir = os.path.join(OUT_ROOT, "audio")
    sg_dir = os.path.join(OUT_ROOT, "signals")
    os.makedirs(au_dir, exist_ok=True)
    os.makedirs(sg_dir, exist_ok=True)

    rng = np.random.default_rng(42)
    fs = 16000
    dur = 5.0
    t = np.arange(int(fs * dur)) / fs
    fr = 1500.0 / 60.0        # 25.0 Hz
    bpfo = 3.05 * fr          # 76.25 Hz (FAG 6203)
    bpfi = 4.95 * fr          # 123.75 Hz (FAG 6203)

    # 1. Healthy 1500 rpm motor/bearing
    healthy = (
        0.35 * np.sin(2 * np.pi * fr * t)
        + 0.14 * np.sin(2 * np.pi * (2 * fr) * t)
        + 0.08 * np.sin(2 * np.pi * 150.0 * t)
        + rng.normal(0.0, 0.08, size=t.size)
    )
    # 2. Outer-race spall @ 1500 rpm (strong BPFO = 76.25 Hz modulating 2200 Hz band)
    outer = (
        0.20 * np.sin(2 * np.pi * fr * t)
        + 1.35 * _impulse_train(t, fs, bpfo, f_res=2200.0, decay=460.0)
        + rng.normal(0.0, 0.06, size=t.size)
    )
    # 3. Inner-race defect @ 1500 rpm (BPFI = 123.75 Hz + 25 Hz shaft modulation @ 2650 Hz)
    inner = (
        0.22 * np.sin(2 * np.pi * fr * t)
        + 1.35 * _impulse_train(t, fs, bpfi, f_res=2650.0, decay=500.0, am_freq=fr)
        + rng.normal(0.0, 0.06, size=t.size)
    )
    # 4. Pump cavitation @ 2900 rpm
    bursts = (rng.random(t.size) < 0.008).astype(np.float64) * rng.normal(0, 1.8, t.size)
    cav = (
        0.30 * np.sin(2 * np.pi * (2900.0 / 60.0 * 6) * t)
        + bursts
        + rng.normal(0.0, 0.12, size=t.size)
    )

    clips = [
        ("healthy-motor-1500rpm.wav", healthy),
        ("outer-race-spall-1500rpm.wav", outer),
        ("inner-race-defect-1500rpm.wav", inner),
        ("pump-cavitation-2900rpm.wav", cav),
    ]
    for fn, arr in clips:
        normed = arr / max(1e-9, float(np.max(np.abs(arr)))) * 0.88
        wavfile.write(os.path.join(au_dir, fn), fs, (normed * 32767).astype(np.int16))

    # 2.0-second CSV calibration files
    n_csv = fs * 2
    for fn, arr in [
        ("open-healthy-1500rpm.csv", healthy[:n_csv]),
        ("open-outer-fault-1500rpm.csv", outer[:n_csv]),
        ("open-inner-fault-1500rpm.csv", inner[:n_csv]),
    ]:
        with open(os.path.join(sg_dir, fn), "w", encoding="utf-8") as f:
            f.write("\n".join(f"{v:.6f}" for v in arr) + "\n")


if __name__ == "__main__":
    build_blueprints()
    build_workbench_photos()
    build_audio_and_csv()
    print("Generated demo assets under", OUT_ROOT)
