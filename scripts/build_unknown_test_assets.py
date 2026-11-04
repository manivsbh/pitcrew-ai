"""Build synthetic and edge-case test assets representing 'in the wild' public internet data.

Generates corrupted files, non-standard sample rates, white noise, pure silence,
textless blueprints, and extreme aspect ratio images under `data/test_unknown_assets/`.
"""

from __future__ import annotations

import os
import numpy as np
from PIL import Image, ImageDraw
from scipy.io import wavfile

TEST_ASSET_DIR = "data/test_unknown_assets"


def build_corrupted_assets():
    corrupt_dir = os.path.join(TEST_ASSET_DIR, "corrupted")
    os.makedirs(corrupt_dir, exist_ok=True)

    # 1. 0-byte files
    for fn in ("zero_byte.pdf", "zero_byte.png", "zero_byte.wav", "zero_byte.csv"):
        with open(os.path.join(corrupt_dir, fn), "wb") as f:
            pass

    # 2. Fake binary masquerading as PDF / PNG
    with open(os.path.join(corrupt_dir, "fake_pdf_binary.pdf"), "wb") as f:
        f.write(os.urandom(2048))

    with open(os.path.join(corrupt_dir, "fake_png_binary.png"), "wb") as f:
        f.write(os.urandom(2048))

    # 3. Truncated WAV header
    with open(os.path.join(corrupt_dir, "truncated.wav"), "wb") as f:
        f.write(b"RIFF\x00\x10\x02\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00")

    # 4. Malformed CSV
    with open(os.path.join(corrupt_dir, "malformed.csv"), "w", encoding="utf-8") as f:
        f.write("time,val,extra\nnot_a_number,,\ninf,nan,999\n1.234,foo,bar\n")


def build_exotic_audio():
    audio_dir = os.path.join(TEST_ASSET_DIR, "audio_exotic")
    os.makedirs(audio_dir, exist_ok=True)

    rng = np.random.default_rng(1234)

    # 1. Pure silence at 16 kHz
    fs_16k = 16000
    silence = np.zeros(fs_16k * 3, dtype=np.int16)
    wavfile.write(os.path.join(audio_dir, "silence_16k.wav"), fs_16k, silence)

    # 2. White noise at 44.1 kHz
    fs_44k = 44100
    white = (rng.normal(0, 0.25, fs_44k * 3) * 32767).astype(np.int16)
    wavfile.write(os.path.join(audio_dir, "white_noise_44k.wav"), fs_44k, white)

    # 3. Low-sample-rate audio (8 kHz telephone band) with 100 Hz tone
    fs_8k = 8000
    t_8k = np.arange(fs_8k * 2) / fs_8k
    tele = (0.7 * np.sin(2 * np.pi * 100 * t_8k) * 32767).astype(np.int16)
    wavfile.write(os.path.join(audio_dir, "speech_proxy_8k.wav"), fs_8k, tele)

    # 4. High-sample-rate studio audio (96 kHz) with high ultrasonic components
    fs_96k = 96000
    t_96k = np.arange(fs_96k * 2) / fs_96k
    high_f = (
        0.4 * np.sin(2 * np.pi * 1500 * t_96k)
        + 0.3 * np.sin(2 * np.pi * 28000 * t_96k)  # 28 kHz ultrasonic
        + rng.normal(0, 0.05, t_96k.size)
    )
    high_norm = (high_f / np.max(np.abs(high_f)) * 30000).astype(np.int16)
    wavfile.write(os.path.join(audio_dir, "high_freq_96k.wav"), fs_96k, high_norm)

    # 5. Severely clipped square-wave vibration
    fs_clip = 16000
    t_clip = np.arange(fs_clip * 2) / fs_clip
    sq = np.sign(np.sin(2 * np.pi * 50 * t_clip)) * 32000
    wavfile.write(os.path.join(audio_dir, "clipped_square_16k.wav"), fs_clip, sq.astype(np.int16))


def build_unseen_blueprints():
    bp_dir = os.path.join(TEST_ASSET_DIR, "blueprints_unseen")
    os.makedirs(bp_dir, exist_ok=True)

    # 1. Pure textless mechanical gear schematic (circles and teeth only, zero characters)
    im_gear = Image.new("RGB", (600, 600), (20, 24, 28))
    dr_gear = ImageDraw.Draw(im_gear)
    for r in range(40, 280, 50):
        dr_gear.ellipse([300 - r, 300 - r, 300 + r, 300 + r], outline=(180, 210, 240), width=2)
    for a in np.linspace(0, 2 * np.pi, 24, endpoint=False):
        x1, y1 = 300 + 260 * np.cos(a), 300 + 260 * np.sin(a)
        x2, y2 = 300 + 285 * np.cos(a), 300 + 285 * np.sin(a)
        dr_gear.line([(x1, y1), (x2, y2)], fill=(210, 230, 250), width=3)
    im_gear.save(os.path.join(bp_dir, "textless_gear_schematic.png"))

    # 2. Hand-sketch style rough layout
    im_sketch = Image.new("RGB", (800, 500), (245, 245, 240))
    dr_sketch = ImageDraw.Draw(im_sketch)
    dr_sketch.rectangle([100, 150, 400, 350], outline=(40, 40, 40), width=3)
    dr_sketch.ellipse([450, 180, 650, 320], outline=(50, 50, 50), width=3)
    dr_sketch.line([(400, 250), (450, 250)], fill=(30, 30, 30), width=4)
    # Handwritten style label
    dr_sketch.text((120, 170), "PUMP CHAMBER 1", fill=(20, 20, 20))
    dr_sketch.text((470, 200), "BEARING HOUSING", fill=(20, 20, 20))
    dr_sketch.text((120, 360), "Bore: 75mm   RPM: 3000", fill=(20, 20, 20))
    im_sketch.save(os.path.join(bp_dir, "hand_sketch_layout.png"))

    # 3. Extreme aspect ratio (1400 x 90 banner)
    im_strip = Image.new("RGB", (1400, 90), (15, 30, 45))
    dr_strip = ImageDraw.Draw(im_strip)
    dr_strip.rectangle([10, 10, 1390, 80], outline=(140, 200, 240), width=2)
    dr_strip.text((30, 35), "SHAFT CROSS SECTION A-A -- DIAMETER 25.4 MM", fill=(220, 240, 255))
    im_strip.save(os.path.join(bp_dir, "extreme_aspect_strip.png"))


if __name__ == "__main__":
    build_corrupted_assets()
    build_exotic_audio()
    build_unseen_blueprints()
    print("Built all unknown test assets in", TEST_ASSET_DIR)
