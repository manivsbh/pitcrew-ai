"""Turn one drawing into a pack: review, then finalize. No network besides the model call."""

from __future__ import annotations

import sys

from backend.app.agent import default_client_factory
from backend.app.config import model_api_key
from backend.app.packbuilder import (finalize, merge_vision_candidates, new_draft,
                                     reason_with_model, save_draft)


def main(machine: str, title: str, path: str) -> None:
    data = open(path, "rb").read()
    media = "image/png" if path.lower().endswith(".png") else "application/pdf"
    draft = new_draft(machine, title, data, media)
    review = reason_with_model(
        draft.get("text") or "", draft["candidates"],
        default_client_factory(model_api_key()), image_b64=draft.get("image_b64"))
    draft["review"] = review
    if draft.get("image_b64"):
        draft = merge_vision_candidates(draft, review)
    save_draft(draft)
    if len(draft["candidates"]) < 3:
        print("too-few", machine, len(draft["candidates"]), review.get("verdict"),
              review.get("summary", "")[:180])
        return
    out = finalize(draft)
    print("finalized", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
