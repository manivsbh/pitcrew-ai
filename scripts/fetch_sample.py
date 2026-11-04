"""Download one Paderborn bearing archive and extract a single sample .mat.

Usage:
    python scripts/fetch_sample.py --bearing K001 --out data/recordings

Downloads https://groups.uni-paderborn.de/kat/BearingDataCenter/<bearing>.rar,
writes a .sha256 sidecar, lists the archive, and extracts the first vibration
.mat so Day-1 parsing can proceed without unpacking the whole archive.

Requires an unrar tool (unrar or unar) for listing/extraction.
"""

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import urllib.request

ARCHIVE_BASE = "https://groups.uni-paderborn.de/kat/BearingDataCenter"


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def unrar_tool() -> str:
    for name in ("unrar", "unar"):
        if shutil.which(name):
            return name
    raise RuntimeError("need 'unrar' or 'unar' installed (brew install unrar)")


def download(url: str, dest: str) -> None:
    print(f"downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length", 0))
        got = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if total:
                print(f"\r  {got / 1e6:.0f}/{total / 1e6:.0f} MB", end="", flush=True)
    print()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bearing", default="K001")
    ap.add_argument("--out", default="data/recordings")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    rar = os.path.join(args.out, f"{args.bearing}.rar")
    if not os.path.exists(rar):
        download(f"{ARCHIVE_BASE}/{args.bearing}.rar", rar)
    digest = sha256_of(rar)
    with open(rar + ".sha256", "w", encoding="utf-8") as f:
        f.write(f"{digest}  {os.path.basename(rar)}\n")
    print(f"sha256: {digest}")

    tool = unrar_tool()
    if tool == "unrar":
        listed = subprocess.run(
            [tool, "l", rar], capture_output=True, text=True, check=True
        )
        mats = sorted(
            line.split()[-1]
            for line in listed.stdout.splitlines()
            if line.strip().lower().endswith(".mat")
        )
    else:  # unar ships lsar as its listing companion
        listed = subprocess.run(
            ["lsar", rar], capture_output=True, text=True, check=True
        )
        mats = sorted(
            line.strip()
            for line in listed.stdout.splitlines()
            if line.strip().lower().endswith(".mat")
        )
    print(f"archive holds {len(mats)} .mat files")
    if not mats:
        print("ERROR: no .mat files listed", file=sys.stderr)
        return 1
    first = mats[0]
    print(f"extracting sample: {first}")
    if tool == "unrar":
        subprocess.run(["unrar", "e", "-o+", rar, first, args.out + "/"], check=True)
    else:
        subprocess.run(["unar", "-o", args.out, rar, first], check=True)
    print("FETCH OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
