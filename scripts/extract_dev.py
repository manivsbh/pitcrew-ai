"""Extract selected repetitions from bearing archives (dev/validation/final).

Usage:
    .venv/bin/python scripts/extract_dev.py --reps 1,2,3

Lists each data/recordings/*.rar via lsar and extracts .mat files whose
repetition number is in --reps. Requires unar.
"""

import argparse
import glob
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

REP_RE = re.compile(r"_(\d+)\.mat$")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", default="1,2,3")
    ap.add_argument("--root", default="data/recordings")
    args = ap.parse_args()
    want = {int(r) for r in args.reps.split(",")}

    for rar in sorted(glob.glob(os.path.join(args.root, "*.rar"))):
        listed = subprocess.run(["lsar", rar], capture_output=True, text=True,
                                check=True)
        mats = [ln.strip() for ln in listed.stdout.splitlines()
                if ln.strip().lower().endswith(".mat")]
        pick = [m for m in mats
                if (mm := REP_RE.search(m)) and int(mm.group(1)) in want]
        missing = [m for m in pick if not os.path.exists(
            os.path.join(args.root, m))]
        print(f"{os.path.basename(rar)}: {len(mats)} files, "
              f"{len(pick)} wanted, {len(missing)} to extract")
        if missing:
            subprocess.run(["unar", "-o", args.root, rar, *missing],
                           capture_output=True, check=True)
            print(f"  extracted {len(missing)}")
    # unar may double-nest (<bearing>/<bearing>/); flatten to one level
    for rar in sorted(glob.glob(os.path.join(args.root, "*.rar"))):
        bearing = os.path.splitext(os.path.basename(rar))[0]
        nested = os.path.join(args.root, bearing, bearing)
        if os.path.isdir(nested):
            for fn in os.listdir(nested):
                os.rename(os.path.join(nested, fn),
                          os.path.join(args.root, bearing, fn))
            os.rmdir(nested)
    print("EXTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
