"""Approved documentation excerpts. Label-free by construction, verified on load."""

from __future__ import annotations

import glob
import os
import re

EXCERPTS_DIR = "docs-pack/excerpts"
_BEARING_RE = re.compile(r"\bK[AIB]?\d+")
_FAULT_RE = re.compile(
    r"\b(damage[ds]?|defect[sed]?|fault[ys]?|cracks?|spall[a-z]*|pitting|pits?)\b",
    re.IGNORECASE)


class DocsStore:
    def __init__(self, excerpts_dir: str = EXCERPTS_DIR):
        self.excerpts: dict[str, dict] = {}
        for path in sorted(glob.glob(os.path.join(excerpts_dir, "*.md"))):
            with open(path) as f:
                text = f.read()
            doc_id = os.path.splitext(os.path.basename(path))[0]
            self._assert_clean(doc_id, text)
            title = next((ln.lstrip("# ").strip() for ln in text.splitlines()
                          if ln.startswith("#")), doc_id)
            self.excerpts[doc_id] = {"id": doc_id, "title": title,
                                     "source_file": path, "text": text}

    @staticmethod
    def _assert_clean(doc_id: str, text: str) -> None:
        # Bearing codes other than the generic type designation are labels.
        for m in _BEARING_RE.finditer(text):
            if m.group(0) not in ("6203",):
                raise RuntimeError(f"{doc_id}: bearing code leaks: {m.group(0)}")
        if _FAULT_RE.search(text):
            raise RuntimeError(f"{doc_id}: fault-bearing passage present")

    def get(self, topic: str) -> dict:
        if topic not in self.excerpts:
            raise KeyError(topic)
        return self.excerpts[topic]

    def topics(self) -> list[str]:
        return sorted(self.excerpts)
