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
LABELS_PATH = "evals/labels.json"
SUPPORTED_MACHINE = "paderborn-6203-rig"
MAX_UPLOAD_CHARS = 2_000_000
MAX_UPLOAD_SAMPLES = 1_000_000
MIN_UPLOAD_SAMPLES = 256
_BEARING_RE = re.compile(r"\bK[AIB]?\d+", re.IGNORECASE)
_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


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
        if meta.get("upload"):
            return f"Uploaded CSV ({meta.get('rpm') or '?'} rpm)"
        cond = OPERATING_CONDITIONS.get(meta.get("condition") or "", {})
        desc = (f"{cond.get('rpm', '?')} rpm / {cond.get('torque_nm', '?')} Nm / "
                f"{cond.get('force_n', '?')} N") if cond else "unknown condition"
        return f"Case {desc}"

    def import_upload(self, filename: str, csv_text: str, fs: float,
                      unit: str | None, rpm: float | None,
                      machine: str) -> dict:
        """Validate and register an uploaded CSV vibration recording."""
        if machine != SUPPORTED_MACHINE:
            raise ValueError(f"unsupported machine {machine!r}; "
                             f"this build supports {SUPPORTED_MACHINE}")
        if not (1000.0 <= float(fs) <= 200000.0):
            raise ValueError(f"sampling rate {fs} outside 1000..200000 Hz")
        if rpm is not None and not (0 < float(rpm) <= 12000):
            raise ValueError(f"speed {rpm} outside 0..12000 rpm")
        if not _SAFE_NAME_RE.match(filename) or not filename.endswith(".csv"):
            raise ValueError("filename must be safe ASCII ending in .csv")
        if len(csv_text) > MAX_UPLOAD_CHARS:
            raise ValueError(f"upload exceeds {MAX_UPLOAD_CHARS} characters")
        try:
            samples = [float(tok) for tok in
                       csv_text.replace(",", " ").split()]
        except ValueError:
            raise ValueError("CSV contains non-numeric samples")
        if not MIN_UPLOAD_SAMPLES <= len(samples) <= MAX_UPLOAD_SAMPLES:
            raise ValueError(
                f"need {MIN_UPLOAD_SAMPLES}..{MAX_UPLOAD_SAMPLES} samples, "
                f"got {len(samples)}")
        self.counter += 1
        rid = f"rec_{self.counter:04d}"
        safe = f"upl_{self.counter:04d}_{filename}"
        updir = os.path.join(self.root, "uploads")
        os.makedirs(updir, exist_ok=True)
        with open(os.path.join(updir, safe), "w") as f:
            f.write("\n".join(str(v) for v in samples))
        meta = {"relpath": f"uploads/{safe}", "upload": True,
                "condition": None, "bearing": None, "repetition": None,
                "fs": float(fs), "unit": unit or None,
                "rpm": float(rpm) if rpm is not None else None}
        self.recordings[rid] = meta
        self.save()
        return {"recording_id": rid, "display_label": self.display_label(meta),
                "n_samples": len(samples)}

    def agent_view(self, recording_id: str) -> dict:
        """Metadata the agent may see. Raises if a bearing code leaks."""
        meta = self.recordings.get(recording_id)
        if meta is None:
            raise KeyError(recording_id)
        rec = self.load(recording_id)
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
        if meta.get("upload"):
            return self._load_csv(meta)
        return load_recording(os.path.join(self.root, meta["relpath"]))

    def _load_csv(self, meta: dict):
        import numpy as np

        from .analysis import Channel, Recording
        with open(os.path.join(self.root, meta["relpath"])) as f:
            data = np.array([float(ln) for ln in f.read().split()],
                            dtype=float)
        channels = {"vibration_1": Channel("vibration_1", data,
                                           meta["fs"], meta["unit"])}
        rpm = meta.get("rpm")
        speed = None
        if rpm is not None:
            channels["speed"] = Channel("speed", np.full(data.size, rpm),
                                        meta["fs"], "rpm")
            speed = float(rpm)
        limitations = []
        if not np.all(np.isfinite(data)):
            limitations.append("non-finite samples present; analyses refuse")
        if meta.get("unit") is None:
            limitations.append(
                "vibration_1: unit undocumented; no conversion applied")
        if speed is None:
            limitations.append("speed unavailable; fault frequencies withheld")
        return Recording(path=meta["relpath"], condition=None, bearing=None,
                         repetition=None, channels=channels, speed_rpm=speed,
                         limitations=limitations)

    def documented_fault(self, recording_id: str) -> str | None:
        """Evaluator-only label lookup. Never called from agent paths."""
        meta = self.recordings.get(recording_id)
        if meta is None or not meta.get("bearing"):
            return None
        with open(LABELS_PATH) as f:
            labels = json.load(f)["labels"]
        return labels.get(meta["bearing"])
