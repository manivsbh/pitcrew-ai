# Cinematic introduction

The user-provided 8-second H.264 film is preserved in `public/media/forma-motor-source.mp4`.
Generated dimension markings and the existing corner mark remain part of the film, not engineering evidence.

The derivative is silent, 720p, 24 fps, with half-second keyframes and fast-start metadata.
Prepared using a temporary ffmpeg executable, not an application dependency:

```sh
/tmp/forma-ffmpeg -hide_banner -loglevel error \
  -i public/media/forma-motor-source.mp4 -an -c:v libx264 -crf 19 \
  -preset fast -pix_fmt yuv420p -g 12 -keyint_min 12 -sc_threshold 0 \
  -movflags +faststart public/media/forma-motor-hero.mp4 -y

for pair in '0 poster' '1 blueprint' '2.8 simulate' '4.2 investigate' '6.5 experiment'; do
  set -- $pair
  /tmp/forma-ffmpeg -hide_banner -loglevel error -ss "$1" \
    -i public/media/forma-motor-source.mp4 -frames:v 1 -q:v 2 \
    "public/media/forma-motor-$2.jpg" -y
done
```

`chapters.ts` owns film ranges and narrative copy. Desktop native scroll seeks one video;
mobile/reduced-motion/data-saver modes use chapter stills. User-initiated playback is optional.
No footage dimension is supplied to engineering models.

`#workspace` lazy-loads the existing app. Its mounted subtree is retained after first entry;
returning to the introduction stops auto-orbit, investigation timers and voice recognition.
Reload still clears the app's existing in-memory experiments.

Checks:

```sh
pnpm exec tsc --noEmit
pnpm build
node --experimental-strip-types src/physics/models.test.ts
node --experimental-strip-types src/features/landing/chapters.test.ts
```
