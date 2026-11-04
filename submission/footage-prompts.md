# Landing footage: Muse Wonder + Muse Image prompts

The current landing film and stills in `frontend/public/media/forma-motor-*` were
generated with Google Veo and carry its watermark. Replace them with Meta-generated
footage so the product and the demo video show only Meta models.

## Drop-in specs (no code changes needed if you keep these names)

| File | What | Spec |
|---|---|---|
| `forma-motor-hero.mp4` | scroll-scrubbed hero film | 8.0 s, 16:9, 1280×720 or 1920×1080, 24 fps, no audio |
| `forma-motor-source.mp4` | same film (fallback copy) | identical to hero |
| `forma-motor-poster.jpg` | first frame | 1280×720 JPEG |
| `forma-motor-blueprint.jpg` | still at ~1.7 s | 1280×720 JPEG |
| `forma-motor-simulate.jpg` | still at ~3.3 s | 1280×720 JPEG |
| `forma-motor-investigate.jpg` | still at ~4.8 s | 1280×720 JPEG |
| `forma-motor-experiment.jpg` | still at ~6.8 s | 1280×720 JPEG |

Composition rules (the page overlays text on the left):

- Background near-black `#101314`, matte, no gradient banding. The page fades the
  left 40% into this color, so keep the subject in the right two-thirds.
- One continuous shot, no cuts, slow constant camera move. The film is scrubbed by
  scroll, so every frame must look finished on its own.
- No text, logos, UI, people, or watermarks in frame.
- Accent light color lime `#c5f292`; secondary cyan `#67d4ff`; warm amber `#f0b865`
  only for the "fault" moment.

After you generate, I'll re-encode for smooth scrubbing (short keyframe interval) and
grab the stills from the exact chapter times:

```powershell
ffmpeg -i wonder.mp4 -t 8 -vf "scale=1280:720,fps=24" -c:v libx264 -crf 20 -g 6 -an frontend/public/media/forma-motor-hero.mp4
Copy-Item frontend/public/media/forma-motor-hero.mp4 frontend/public/media/forma-motor-source.mp4
foreach ($s in @(@{n="poster";t=0.1},@{n="blueprint";t=1.7},@{n="simulate";t=3.3},@{n="investigate";t=4.8},@{n="experiment";t=6.8})) { ffmpeg -y -ss $s.t -i frontend/public/media/forma-motor-hero.mp4 -frames:v 1 -q:v 3 "frontend/public/media/forma-motor-$($s.n).jpg" }
```

## Muse Wonder prompt (the 8-second hero film)

> Cinematic product film, 8 seconds, one continuous shot, 24 fps, 16:9. A compact
> industrial centrifugal pump with an electric motor sits on a matte black plinth in
> a dark studio (background #101314). The camera starts in a slow three-quarter
> orbit from the motor end and drifts toward the pump casing at constant speed.
> 0–0.8 s: the assembled machine, soft rim light, lime-green (#c5f292) edge glow.
> 0.8–2.6 s: thin glowing cyan (#67d4ff) technical-drawing lines trace the outline
> of the casing, shaft and bearings, like a blueprint projected onto the metal.
> 2.6–4.0 s: the outer casing and impeller separate slightly along the shaft axis
> in a clean exploded view; parts float a few centimetres apart, perfectly aligned.
> 4.0–5.6 s: one bearing ring near the shaft glows warm amber (#f0b865) with a faint
> pulsing vibration ripple around it; everything else stays cool and dim.
> 5.6–8.0 s: the parts glide back together into the assembled pump and the amber
> glow fades to lime; the camera settles into a calm hero angle. Photoreal brushed
> steel and cast iron, shallow depth of field, no text, no people, no logos, no UI.
> Subject in the right two-thirds of the frame; left third stays dark and empty.

If the model drifts in later frames, generate two 4-second halves with the same
prompt split at the 4.0 s line and the last frame of part 1 as the start frame of
part 2, then concatenate.

## Muse Image prompts (stills, if you'd rather generate them than grab frames)

Shared suffix for all five: *photoreal studio product shot, matte black background
#101314, subject in the right two-thirds, left third empty and dark, 16:9, 1280×720,
no text, no people, no logos.*

1. **Poster:** "A compact centrifugal pump and electric motor on a black plinth,
   three-quarter view, soft rim light with a thin lime-green edge glow."
2. **Blueprint:** "The same pump with glowing cyan technical-drawing lines traced over
   the casing, shaft and bearings, as if a blueprint is projected onto the metal."
3. **Simulate:** "The same pump in a clean exploded view along the shaft axis, casing,
   impeller, shaft sleeve and bearings floating a few centimetres apart, aligned."
4. **Investigate:** "The same exploded pump; one bearing ring glows warm amber with a
   faint vibration ripple around it; every other part stays cool and dim."
5. **Experiment:** "The same pump reassembled, calm hero angle, lime-green glow, a few
   faint floating numeric gauge rings around the shaft, no readable text."

## Demo-video intro shot (optional, 4 s)

> Macro close-up, 4 seconds: a steel ball bearing spinning in near darkness; one ball
> catches a lime-green light and glows while the others stay dark (this mirrors the
> PITCREW.ai "Lit Bearing" logo). Slow push-in, shallow depth of field, black
> background, no text.
