"""Build healthy reference stats from K001 development repetitions.

Usage:
    .venv/bin/python scripts/compute_refs.py

Writes backend/app/refs.json: per-condition lists of time-domain stats from
the extracted K001 vibration channels. Re-run after extracting more reps.
"""

import glob
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.analysis import load_recording, time_stats
from backend.app.config import REFS_PATH


def main() -> int:
    refs: dict[str, dict[str, list]] = {}
    files = sorted(glob.glob("data/recordings/K001/*.mat"))
    if not files:
        print("no K001 files extracted", file=sys.stderr)
        return 1
    for path in files:
        rec = load_recording(path)
        if rec.condition is None or "vibration_1" not in rec.channels:
            continue
        stats = time_stats(rec.channels["vibration_1"].data)
        bucket = refs.setdefault(rec.condition, {"rms": [], "crest": [],
                                                 "kurtosis_excess": []})
        for k in bucket:
            bucket[k].append(stats[k])
    with open(REFS_PATH, "w") as f:
        json.dump(refs, f, indent=1)
    print(f"conditions: {sorted(refs)}; "
          f"reps: {[(c, len(v['rms'])) for c, v in refs.items()]}")
    print(f"wrote {REFS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
