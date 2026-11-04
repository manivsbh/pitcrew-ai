"""Generate b-roll stills for the launch video with Meta muse-image-1.0.

Usage: .venv\\Scripts\\python.exe submission/video/broll/gen.py [name ...]
Writes submission/video/broll/<name>.png. Reads MODEL_API_KEY from the repo .env.
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

HERE = Path(__file__).parent
load_dotenv(HERE.parents[2] / ".env")

STYLE = ("Cinematic photograph, 16:9, shallow depth of field, matte near-black background "
         "(#101314), low-key lighting with a thin lime-green (#c5f292) rim light and a cool "
         "cyan (#67d4ff) fill. Photoreal, filmic grain, no text, no letters, no logos, no "
         "watermarks, subject in the right two-thirds of the frame.")

SHOTS = {
    "drafting-table": "An old 1960s engineering drafting table at night, a large patent drawing "
                      "of a centrifugal pump in cross-section pinned flat, brass drafting tools, "
                      "a desk lamp pooling warm light on the paper.",
    "plant-floor": "A quiet industrial pump room at dusk, rows of centrifugal pumps and pipes "
                   "receding into darkness, faint haze, one pump lit.",
    "worn-bearing": "Extreme macro of a worn steel ball bearing outer race with a pitted spall, "
                    "glowing faint warm amber (#f0b865) from inside, oil sheen.",
    "binders": "A tall stack of dusty paper maintenance manuals and ring binders on a workshop "
               "shelf, one binder open, pages curling, dim light.",
    "phone-motor": "A technician's gloved hand holding a smartphone close to a humming electric "
                   "motor housing on a factory floor, phone screen glowing lime, motion blur on "
                   "the cooling fins.",
    "bearing-macro": "Macro of a clean steel ball bearing face-on, nine polished balls in a ring, "
                     "exactly one ball glowing bright lime green, the others dark steel.",
    "gearbox": "Inside an industrial gearbox, helical gears and shafts in oil, a single gear "
               "tooth catching a lime rim light.",
    "fan-blades": "Close-up of large industrial axial fan blades in motion, long exposure arcs, "
                  "cyan light through the blades.",
    "warehouse": "A spare-parts warehouse aisle with labelled bins of bearings and seals, shallow "
                 "focus, one bin lit lime.",
    "dawn-plant": "An industrial plant at dawn from a distance, cooling towers and pipe racks, "
                  "first light on the horizon, calm and hopeful.",
    "thumbnail": "A yellowed 1960s patent drawing of a centrifugal pump lying flat on a dark "
                 "table, its ink lines lifting off the paper and turning into a glowing "
                 "lime-green holographic 3D pump floating above it, one bearing inside the "
                 "hologram glowing warm amber (#f0b865), dramatic and high contrast.",
}


def main(names: list[str]) -> None:
    client = OpenAI(base_url="https://api.meta.ai/v1", api_key=os.environ["MODEL_API_KEY"])
    for name in names or list(SHOTS):
        out = HERE / f"{name}.png"
        if out.exists():
            print("skip", name)
            continue
        resp = client.images.generate(model="muse-image-1.0", prompt=f"{SHOTS[name]} {STYLE}",
                                      n=1, size="1792x1024",
                                      extra_body={"output_format": "png"})
        out.write_bytes(base64.b64decode(resp.data[0].b64_json))
        print("wrote", out.name, out.stat().st_size // 1024, "KB", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
