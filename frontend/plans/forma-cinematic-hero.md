# FORMA — cinematic scroll-driven introduction

## Goal and approved direction

Add a photorealistic, scroll-driven landing page before the existing FORMA workspace. Use the user's uploaded motor film as the visual centerpiece, not the existing simplified procedural model. Explain the product through Blueprint → Simulate → Investigate → Experiment, then lead into the working application.

Preserve the current graphite/lime identity, DM Sans/JetBrains Mono typography, Lucide icons, all three machine options, numerical experiments, and diagnostic demo. No backend, real Muse integration, new photography, or new 3D asset is needed.

The hero video is visual storytelling: it is not an interactive CAD model, a measured diagnostic run, or a validated simulation.

## Environment and inspected asset

React 19 / TypeScript / Vite app. `src/main.tsx` mounts `src/App.tsx`; the latter currently opens the engineering workspace immediately. Dependencies include Three.js/R3F/Drei and Lucide; no motion library is installed. Global styling lives in `src/index.css`; the workspace has broad header/footer selectors, so landing styles must be namespaced and explicitly scoped.

Repository instructions: use existing supervised preview, do not start another server; preserve existing patterns and run relevant checks for this broader change.

Attachment:

- ID: `8c500be5-e36d-46d1-8fde-f50f8d8596db`.
- Resolved source: `/tmp/attachments/8c500be5_Electric_motor_product_film_fa8e9e7e.mp4`.
- Fetch again using `figma attachments get` if the temporary path disappears; never reconstruct its path.
- 2,487,403 bytes; 8.00 seconds; 1280×720, landscape 16:9; H.264 High, 24 fps; AAC stereo audio.
- Visually inspected extracted contact sheet: dark studio motor, green blueprint/dimension overlays, exposed/exploded bearing, amber bearing highlight, then assembled motor.
- The film contains generated dimension markings and a small lower-right mark. Preserve the asset; do not remove watermarks or imply these labels are verified.

The MotionSites “Glint” animation was not visually inspectable; only its site's page content was retrieved earlier. Build an original cinematic treatment rather than claim a pixel-perfect reference recreation.

## Asset preparation

Copy the resolved attachment into `public/media/forma-motor-source.mp4` so the website never depends on `/tmp` at runtime.

Prepare a browser-friendly hero derivative and static stills:

- `public/media/forma-motor-hero.mp4`: same 1280×720 and 24 fps, H.264/yuv420p, audio removed, fast-start metadata, GOP approximately 12 frames for manageable seeking. Preserve visible marks.
- `public/media/forma-motor-poster.jpg`: a sharp opening frame.
- Chapter stills: blueprint, exploded/simulation, investigation highlight, assembled close.

An ffmpeg executable was temporarily obtained at `/tmp/forma-ffmpeg` for inspection because ffmpeg/ffprobe are not installed. It is tooling only, not an application dependency. Verify it exists before reuse; if unavailable use suitable temporary tooling without adding preview infrastructure. Document the exact encoding and still-extraction commands used. If transcoding cannot be completed, use the original MP4 muted with the same failure fallback and disclose that seek optimization remains unverified.

Do not upscale the 720p film or claim 4K quality. Avoid aggressive zooming that reveals compression.

## Landing layout and copy

### Navigation

Minimal fixed navigation above the story: FORMA wordmark, compact “Blueprint / Simulate / Investigate / Experiment” chapter links on desktop, and a persistent “Open workspace” CTA. On small screens retain wordmark, skip-story link and workspace CTA rather than overflow the navigation.

Native anchors and real buttons; no scroll hijacking or locked page scrolling.

### Sticky cinematic story

Desktop structure: a tall narrative container with a sticky viewport-height media stage and five semantic scroll chapters. Approximate total narrative length 500svh, adjustable only for actual readability. Text occupies the left 35–40%; video occupies the right and background with a subtle left-to-right charcoal readability gradient.

Display video with containment rather than indiscriminate cover cropping because the uploaded framing changes during the close-up. Keep the bearing visible throughout; do not conceal essential geometry or existing marks.

Use one video element, one progress rail, and chapter-specific text, with limited opacity/vertical text reveals. Avoid excessive glass panels, particle effects, carousels or decorative sci-fi UI.

Narrative:

1. **Intro — “Every machine has a story. Understand yours.”**
   - Supporting copy: “Explore the assembly. Test a what-if. Follow the evidence.”
   - CTA: “Explore the workflow” scrolls to Blueprint; secondary “Open workspace” enters app.
   - Small label: “FORMA / MACHINE ENGINEERING WORKSPACE”.
2. **Blueprint — “Start with the drawing.”**
   - “Bring dimensions, components and context into one place.”
   - Honest qualifier: “Blueprint intake preview today. Automated reconstruction is planned.”
   - Do not add readable invented dimensions on top of the video's generated markings.
3. **Simulate — “Change a variable. See what follows.”**
   - “Compare explicit equations, input assumptions and calculated outputs.”
   - Small equation treatment: `P = Tω`; no made-up running telemetry.
   - Qualifier: “Simplified frontend models, not validated physical simulation.”
4. **Investigate — “Find the part. Follow the evidence.”**
   - “Connect an investigation step to its signal, source and suspected component.”
   - Qualifier: “Synthetic diagnostic replay. No live Muse connection.”
   - Amber accent may echo the footage; never identify the film's glow as proof of an actual fault.
5. **Experiment — “Ask what if. Decide with context.”**
   - Show one static command: “Increase speed by 20%”.
   - “Review a candidate, compare the baseline and apply it deliberately.”
   - Qualifier: “Typed commands and optional browser speech; configurable limits, not failure predictions.”

### Final conversion section

After the sticky story, a normal-flow compact section: “From understanding to action.”

Three low-key capability summaries: “3 illustrative machines,” “Visible formulas,” “Inspectable evidence.” A prominent “Open engineering workspace” button and “Replay introduction” anchor.

Disclose: “Cinematic illustration. Generated dimension markings are not engineering specifications.”

No fabricated customer counts, benchmarks, accuracy claims, live-agent badges, or production-readiness claims.

## Chapter-to-video mapping

Use the actual 8-second film rather than stretching claims to absent shots. Initial normalized mapping:

- Intro: scroll progress 0–0.16 → video time 0–0.8 s.
- Blueprint: 0.16–0.36 → 0.8–2.6 s.
- Simulate: 0.36–0.56 → 2.6–4.0 s.
- Investigate: 0.56–0.78 → 4.0–5.6 s.
- Experiment/reassembly: 0.78–1.0 → 5.6–7.95 s.

These ranges are explicit starting points grounded in the inspected 0/2/4/6-second contact sheet. Before implementation finalization, inspect the chapter stills and adjust boundaries to the actual appearances if necessary. Keep the mapping in one configuration object with narrative copy and fallback still paths; do not scatter time values throughout components.

Do not label camera movement or a rendered exploded view as the app solving physical equations.

## Scroll and media implementation

No new animation dependency required. Use native scrolling, sticky CSS, requestAnimationFrame, ResizeObserver and IntersectionObserver.

Suggested files:

- `src/LandingExperience.tsx`: top-level landing/workspace switch and loading boundary.
- `src/features/landing/LandingPage.tsx`: navigation, semantic chapters and CTA section.
- `src/features/landing/ScrollFilm.tsx`: media lifecycle, smooth seeking and fallback.
- `src/features/landing/chapters.ts`: copy, chapter positions, video time ranges and still paths.
- `src/features/landing/landing.css`: namespaced `.landing-*` styles.

Main entry renders LandingExperience. Keep App as the workspace implementation; lazy-load it with React.lazy so Three.js and the engineering app do not block the landing hero. Use a small inline loading state and error fallback with a retry control.

Progress calculation:

`p = clamp((scrollY - storyTop) / (storyHeight - viewportHeight), 0, 1)`.

Convert p through the chapter mapping into target video time. Clamp to `[0, duration - 0.05]`. Measure layout on mount, resize and orientation changes; do not read layout continuously in every scroll event.

Media behavior:

- `muted`, `playsInline`, `preload="metadata"`, poster present, no autoplay audio, no loop.
- Wait for loaded metadata before seeking.
- Scroll listeners update a target ref and schedule one animation frame rather than setting React state on every pixel.
- Interpolate target time with a short, bounded smoothing time constant, not a long lag.
- Allow only one seek in flight; on `seeked`, process the latest target instead of queueing stale requests.
- Ignore negligible time deltas; only seek while the story is visible. Cancel listeners, observers, seek timers and RAF on unmount.
- Update React chapter state only when the active chapter changes.
- If seeking does not settle within roughly 1.5 seconds repeatedly, switch to chapter stills and provide a user-initiated “Play film” option.
- Never call continuous `play()` while also trying to scrub `currentTime`.
- If offering normal playback, explicitly switch to playback mode, suspend scrub updates, provide Pause/Return to scroll controls, and resume from scroll mapping on return.

Chapter links scroll to real anchors and remain keyboard accessible; normal page scroll reverses the narrative. Tab focus must not enter invisible overlay content.

## Routing and state preservation

Use a minimal URL-hash distinction: no hash or chapter hashes show landing; `#workspace` shows App.

- “Open workspace” updates the hash and scrolls to top after the destination mounts.
- Chapter links use `#blueprint`, `#simulate`, `#investigate`, `#experiment`; route logic treats these as landing.
- Listen for hash changes so browser Back/Forward work.
- Add a clearly labelled “Introduction” link to the existing workspace header.
- After the workspace has been loaded once, keep its mounted subtree while showing the landing using the HTML `hidden` attribute to preserve session experiments and machine selection. Ensure hidden workspace is absent from focus/accessibility navigation; stop auto-orbit and any active microphone session when exiting the workspace using a visibility prop/effect rather than leaving media work active.
- Do not mount the heavyweight workspace until first entry.
- Document that browser reload resets the existing in-memory workspace, consistent with current app behavior.

If existing broad CSS selectors would affect landing header/footer, use dedicated component classes rather than rewriting unrelated workspace styles.

## Mobile, reduced motion and failures

Mobile under 768px:

- Use normal-flow chapters with the corresponding 16:9 still/video above the copy, not a heavily cropped tall full-screen background.
- No long pinned five-screen sequence; avoid expensive continuous seeking.
- Offer a user-initiated muted film playback control.
- Preserve all narrative text and workspace CTA.

Reduced-motion preference:

- Render static chapter images and immediate, normal anchor navigation.
- No scroll scrubbing, sticky motion, auto-orbit or smooth-scrolling transitions in the landing.
- Watch preference changes and clean up an existing scrub controller.

Data saver where browser detection is available: default to poster/stills and offer explicit film loading. Unsupported save-data APIs are not errors.

Video network/codec failure: chapter stills and copy remain; show a discreet unavailable-video message and keep workspace access usable. If a still also fails, show a styled charcoal fallback with semantic copy, not a broken-image icon.

No loading screen may block navigation or workspace entry. Never guarantee universally seamless seeking until verified on target browsers.

## Accessibility and content integrity

- Semantic main/navigation/sections with ordered headings.
- Skip narrative and open workspace available without scrolling.
- Visible focus and keyboard chapter navigation.
- Every staged message is accessible in semantic document order; decorative video is aria-hidden with an adjacent visual-description sentence.
- No aggressive live announcements for each scroll tick.
- Preserve readable contrast over the video at every stage.
- No microphone requests on landing.
- Keep the small mark in the uploaded footage; do not create an implementation dependency on removing it.

## Implementation sequence

1. Invoke `make/use-design-system` before UI changes and use existing visual tokens/patterns; no design attachment or photography workflow is needed for this user-supplied video.
2. Prepare the derivative, poster and chapter stills; inspect actual frames and finalize shot timing.
3. Add isolated landing components, copy and responsive styling.
4. Implement bounded seek controller and fallback modes.
5. Add lazy workspace entry, hash navigation, return-to-intro link and visibility cleanup without losing workspace session data.
6. Verify production build, TypeScript, existing numerical tests and available browser behavior.

## Verification and acceptance

Commands prescribed/currently used by the repository:

- `pnpm exec tsc --noEmit`
- `pnpm build`
- `node --experimental-strip-types src/physics/models.test.ts`

Verify with available browser tooling, without starting another dev server:

- Initial page displays poster and readable headline before video loads.
- Scrolling forward/back maps correctly to blueprint, explosion, amber highlight and reassembly.
- No audible playback; no microphone permission.
- Chapter links, workspace entry, intro return and browser Back/Forward work.
- Entering workspace still offers all three machines and their working physics/experiments.
- Returning to intro preserves workspace experiments and stops hidden animation/voice capture.
- Mobile retains full machine framing and readable content without forced horizontal scroll.
- Reduced motion uses static sections.
- Media failure and slow seeking do not block content or workspace access.
- Keyboard access and visible focus work; invisible overlays are not focusable.
- No generated video dimensions appear in actual physics inputs or diagnostic evidence.

Report checks actually run and explicitly identify unavailable browser/performance verification. The known existing 3D bundle-size warning is not itself a feature failure; lazy loading should separate workspace cost from the initial landing rather than merely suppress the warning.
