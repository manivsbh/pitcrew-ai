"""Recording registry: opaque IDs, anonymized labels, leakage guards.

The technician UI shows condition descriptions only. The agent sees the opaque
ID plus validated metadata. Bearing codes never leave this module except into
the evaluator-owned label file.
"""

from __future__ import annotations

import json
import os
import re

from .analysis import OPERATING_CONDITIONS, load_recording

REGISTRY_PATH = "data/registry.json"
RECORDINGS_ROOT = "data/recordings"
_BEARING_RE = re.compile(r"\bK[AIB]?\d+", re.IGNORECASE)


class Store:
    def __init__(self, registry_path: str = REGISTRY_PATH,
                 root: str = RECORDINGS_ROOT):
        self.registry_path = registry_path
        self.root = root
        self.recordings: dict[str, dict] = {}
        self.counter = 0
        if os.path.exists(registry_path):
            with open(registry_path) as f:
                saved = json.load(f)
            self.recordings = saved.get("recordings", {})
            self.counter = saved.get("counter", 0)

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.registry_path) or ".", exist_ok=True)
        with open(self.registry_path, "w") as f:
            json.dump({"recordings": self.recordings, "counter": self.counter},
                      f, indent=1)

    def bundled_cases(self) -> list[str]:
        """Relative paths of available .mat files, anonymized for display."""
        out = []
        for dirpath, _, files in os.walk(self.root):
            for fn in sorted(files):
                if fn.endswith(".mat"):
                    out.append(os.path.relpath(os.path.join(dirpath, fn),
                                               self.root))
        return sorted(out)

    def import_case(self, relpath: str) -> dict:
        """Register a bundled case. Returns opaque ID + display label."""
        if os.path.isabs(relpath) or ".." in relpath:
            raise ValueError("case must be a relative bundled path")
        full = os.path.join(self.root, relpath)
        if not os.path.isfile(full):
            raise ValueError(f"unknown case: {relpath}")
        for rid, meta in self.recordings.items():
            if meta["relpath"] == relpath:
                return {"recording_id": rid,
                        "display_label": self.display_label(meta)}
        self.counter += 1
        rid = f"rec_{self.counter:04d}"
        rec = load_recording(full)
        meta = {"relpath": relpath, "condition": rec.condition,
                "bearing": rec.bearing, "repetition": rec.repetition}
        self.recordings[rid] = meta
        self.save()
        return {"recording_id": rid, "display_label": self.display_label(meta)}

    def display_label(self, meta: dict) -> str:
        cond = OPERATING_CONDITIONS.get(meta.get("condition") or "", {})
        desc = (f"{cond.get('rpm', '?')} rpm / {cond.get('torque_nm', '?')} Nm / "
                f"{cond.get('force_n', '?')} N") if cond else "unknown condition"
        return f"Case {desc}"

    def agent_view(self, recording_id: str) -> dict:
        """Metadata the agent may see. Raises if a bearing code leaks."""
        meta = self.recordings.get(recording_id)
        if meta is None:
            raise KeyError(recording_id)
        rec = load_recording(os.path.join(self.root, meta["relpath"]))
        view = {
            "recording_id": recording_id,
            "condition": rec.condition,
            "operating_point": OPERATING_CONDITIONS.get(rec.condition or ""),
            "speed_rpm": rec.speed_rpm,
            "channels": {n: {"n": c.data.size, "fs": c.fs, "unit": c.unit}
                         for n, c in rec.channels.items()},
            "quality": [q for q in self._quality(rec)
                        if not _BEARING_RE.search(q)],
        }
        blob = json.dumps(view)
        if _BEARING_RE.search(blob):
            raise RuntimeError("bearing code leaked into agent view")
        return view

    def _quality(self, rec) -> list[str]:
        from .analysis import quality_checks
        return quality_checks(rec)

    def load(self, recording_id: str):
        meta = self.recordings.get(recording_id)
        if meta is None:
            raise KeyError(recording_id)
        return load_recording(os.path.join(self.root, meta["relpath"]))
