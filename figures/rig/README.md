# rig-6203 pilot figure (anatomy evaluation)

Exploded 6203 test-bearing rig built with the anatomy skill
(`skills/anatomy`) from `packs/rig` + the verified geometry excerpt.
Status: pilot for evaluation only. Verdict: `visual-plan/reviews/anatomy-pilot-rig.md`.

Rebuild: `node build.mjs` and `node build.mjs --light` (Node 20.10+).
Checks: `node ../../skills/anatomy/scripts/lines.mjs rig-6203.html`
must print `line ends: 0` (needs Chrome; sandboxed shells must escalate).

Numbers: `model.mjs` mirrors `backend/app/analysis.py fault_frequencies`;
raceways/pitch/balls/count verified, ring shoulders + rig furniture illustrative,
motion slowed 30x with a true readout.
