"""Fetch every split archive, hash it, and extract the union of eval reps.

Bearings: K001 K002 K003 KA04 KA15 KA16 KI04 KI14 KI16 KB23.
Reps extracted: 1,2,3 (dev) + 1,5,9,13,17 (validation/final/challenge).
Idempotent: skips present archives, appends missing hashes, extracts gaps.
"""

import os
import subprocess
import sys
import urllib.request

ARCHIVE_BASE = "https://groups.uni-paderborn.de/kat/BearingDataCenter"
BEARINGS = ["K001", "K002", "K003", "KA04", "KA15", "KA16", "KI04", "KI14",
            "KI16", "KB23"]
REPS = "1,2,3,5,9,13,17"


def sha256_of(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    root = "data/recordings"
    os.makedirs(root, exist_ok=True)
    have_hashes = set()
    if os.path.exists("data/hashes.txt"):
        with open("data/hashes.txt", encoding="utf-8") as f:
            have_hashes = {ln.split()[1] for ln in f if len(ln.split()) == 2}
    for b in BEARINGS:
        rar = os.path.join(root, f"{b}.rar")
        if not os.path.exists(rar):
            print(f"downloading {b}.rar", flush=True)
            req = urllib.request.Request(f"{ARCHIVE_BASE}/{b}.rar",
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as r, open(rar, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            print(f"  {os.path.getsize(rar) / 1e6:.0f} MB", flush=True)
        if f"{b}.rar" not in have_hashes:
            with open("data/hashes.txt", "a", encoding="utf-8") as f:
                f.write(f"{sha256_of(rar)}  {b}.rar\n")
    print("hashes recorded", flush=True)
    subprocess.run([sys.executable, "scripts/extract_dev.py", "--reps", REPS],
                   check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
