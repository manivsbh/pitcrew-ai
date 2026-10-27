"""Inspect one Paderborn .mat recording: keys, channels, rate, duration.

Usage:
    python scripts/inspect_mat.py data/recordings/<file>.mat

Read-only. Prints structure and basic provenance facts; asserts nothing about
fault labels. Day-1 goal: prove a real recording parses.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scipy.io import loadmat


def main() -> int:
    path = sys.argv[1]
    d = loadmat(path)
    print(f"file: {path}")
    print(f"size_MB: {os.path.getsize(path) / 1e6:.1f}")
    for k in sorted(d):
        if k.startswith("__"):
            continue
        v = d[k]
        shape = getattr(v, "shape", None)
        dtype = getattr(v, "dtype", None)
        print(f"key: {k} shape={shape} dtype={dtype}")
    print("INSPECT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
