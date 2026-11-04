# Graph Report - pitcrew-ai  (2026-11-04)

## Corpus Check
- 352 files · ~1,692,199 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 23 file(s) not represented in the graph (top: .css 9, (none) 5, .csv 5)

## Summary
- 4392 nodes · 9367 edges · 213 communities (164 shown, 49 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 399 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b3a109e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- run_eval.py
- Vibration Analysis Core
- json
- test_agent.py
- api.ts
- main.py
- Eval Corpus & Hashes
- frontend/package.json
- spot-plate/geometry.ts
- Agent Tools & Evidence
- raptor-engine/build.mjs
- TypeScript Config
- Favicon Artwork
- Icon Sprite Sheet
- test-rig/geometry.ts
- spot-plate/rig.ts
- audit.mjs
- arcade-cabinet/build.mjs
- test-rig/rig.ts
- iso-kit.mjs
- turn-build.mjs
- ripple-tank/build.mjs
- iso-kit.ts
- lathe.mjs
- turning-dial/build.mjs
- assist.py
- cr-pump/build.mjs
- push-button/build.mjs
- mobile_sync.py
- sys
- ref_node_fs
- best/assembly.ts
- arcade-cabinet/live.js
- tubePieces
- publish.mjs
- raptor-engine/live.js
- record.mjs
- App.tsx
- os
- rag.py
- stress.mjs
- turn-audit.mjs
- turn-fixed.mjs
- inventory.py
- print-sheet.mjs
- turn.mjs
- rig/build.mjs
- Kit API
- time
- desk-computer/build.mjs
- ripple-tank/live.js
- test_guide.py
- segment.py
- post
- test_packbuilder.py
- 12. The audit (`kit/audit.mjs`)
- tubePieces
- audit-projection.test.mjs
- models.ts
- test_latency.py
- sim/assembly.ts
- draw.tsx
- turning
- speech.py
- turning-dial/live.js
- ref_node_fs
- Design System: Machine Fault Investigator
- test_inventory.py
- inline-kit.mjs
- dial-indicator/build.mjs
- ripple-tank/model.mjs
- react
- test_validation.py
- at
- t3EmitRound
- re
- Verify
- buildPlanar
- anatomy/README.md
- react-readout-first-write.test.mjs
- FORMA — frontend physics, design and experiments
- AssemblyHandle
- Motion and interaction
- t3EmitRound
- turn-fidelity.mjs
- turn-bench.mjs
- Machine Fault Investigator — UI-first web app
- packbuilder.py
- S
- FORMA — cinematic scroll-driven introduction
- test_figures.py
- layout.py
- meta_calls.py
- profile_latency.py
- WebGL inside the drawing
- t3EmitBall
- figma-make-app
- test_render_verify.py
- agent.py
- t3Mount
- t3EmitBall
- Centrifugal pump blueprint — Blueprint & Component Specification
- initAssembly
- Contributor Covenant Code of Conduct
- canvas-painter.mjs
- MetaCallLog.tsx
- Changelog
- t3Emit
- vite.config.ts
- ingest_manual.py
- Product
- test_meta_calls.py
- Machine-pack schema (expansion Phase 2)
- BASE
- Walkthrough: the test rig (Fig 6)
- devDependencies
- coverage
- Printable sheets (A4)
- harnessRoute
- gl.mjs
- gl-shared.mjs
- t3EmitTube
- t3Emit
- t3EmitTube
- Spindle 6203 blueprint — Blueprint & Component Specification
- lines.mjs
- V6 engine blueprint — Blueprint & Component Specification
- 3-Minute Winning Live Demo Choreography
- buildPump
- 3. Parts vocabulary, with recipes
- Contributing to Anatomy
- t3Poses
- t3Poses
- 7. Craft rules, each with the bug that taught it
- 8. Light theme
- tick
- audit-order-convergence.test.mjs
- Anatomy
- Eval: figure publish readiness
- dependencies
- test_speech.py
- blueprint-to-3d.md
- makeParts
- clampTo
- Figures demo + test plan (cr-pump first, rig second)
- RenderSkillsPanel.tsx
- Pack-builder contract (FINAL — accepted 2026-10-27)
- Landing footage: Muse Wonder + Muse Image prompts
- Verdict: anatomy pilot (rig-6203 figure)
- bezelPt
- onBody
- steer
- PULL_REQUEST_TEMPLATE.md
- running
- Security
- Latency profile (offline replay, no model calls)
- scripts
- v6-engine-blueprint.png — Blueprint & Component Specification
- Wilfley centrifugal pump (US 3,402,671) — Blueprint & Component Specification
- pdf-button.mjs
- poses
- faceMarkup
- Publishing a figure to the community gallery
- FigmaSiteConfiguration
- _QuietCallLogPolls
- cpPoint
- cone
- FTP
- raptor-engine/sheet.mjs
- FA
- Surface brief: hero + app shell (impeccable)
- chPoint
- chuteZ
- f2
- stack
- screen.mjs
- bell
- throat
- armRing
- photos/README.md
- rig/README.md
- .figma/README.md
- landing/README.md
- io-diagnosing-problems.md
- io-maintaining.md
- io-mechanical-installation.md
- io-motor-replacement.md
- io-startup.md
- svc-coupling-height.md
- svc-dismantling.md
- svc-reassembly.md
- svc-replacement-criteria.md
- svc-stage-assembly.md
- svc-torque-table.md
- start_mobile_demo.sh
- puck
- [RA, RB]
- pitcrew-ai
- Falk speed reducer (US 3,348,430) — Blueprint & Component Specification
- Rotron fan motor (US 3,513,339) — Blueprint & Component Specification

## God Nodes (most connected - your core abstractions)
1. `Setup` - 42 edges
2. `dot3()` - 39 edges
3. `iso()` - 34 edges
4. `tubePieces()` - 31 edges
5. `pathOf()` - 30 edges
6. `pathOf()` - 30 edges
7. `add3()` - 30 edges
8. `mul3()` - 30 edges
9. `sub3()` - 29 edges
10. `Store` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Blueprint to 3D` --references--> `depth()`  [INFERRED]
  evals/blueprint-to-3d.md → .claude/skills/anatomy/examples/push-button/build.mjs
- `Styling` --references--> `body()`  [INFERRED]
  frontend/AGENTS.md → .claude/skills/anatomy/kit/audit.mjs
- `scenarios.json` --references--> `wobble()`  [INFERRED]
  packs/SCHEMA.md → .claude/skills/anatomy/kit/audit.mjs
- `components.json` --references--> `role()`  [INFERRED]
  packs/SCHEMA.md → backend/app/meta_calls.py
- `Graders` --references--> `segment_photo()`  [INFERRED]
  evals/figures-publish.md → backend/app/segment.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Demo Investigation Flow** — machine_fault_investigator_docs_demo_script_demo_script, machine_fault_investigator_frontend_index_frontend_ui, machine_fault_investigator_docs_demo_script_freeze_and_reveal, machine_fault_investigator_docs_demo_script_abstention_insufficient_evidence [EXTRACTED 1.00]
- **Three-Arm Evaluation Flow** — machine_fault_investigator_evals_readme_three_arm_comparison, machine_fault_investigator_evals_protocol_frozen_protocol, machine_fault_investigator_evals_report_evaluation_report, machine_fault_investigator_evals_analysis_agent_did_not_beat_fixed [EXTRACTED 1.00]
- **Label-Free Investigation Pipeline** — machine_fault_investigator_docs_pack_readme_documentation_pack, machine_fault_investigator_data_readme_label_leakage_rule, machine_fault_investigator_docs_pack_excerpts_test_rig_6203_geometry_bearing_6203_geometry, machine_fault_investigator_evals_protocol_investigate_arm [INFERRED 0.85]

## Communities (213 total, 49 thin omitted)

### Community 0 - "run_eval.py"
Cohesion: 0.20
Nodes (14): append_result(), arm_baseline(), cases(), fixed_bundle(), _investigate_one(), load_results(), main(), majority() (+6 more)

### Community 1 - "Vibration Analysis Core"
Cohesion: 0.05
Nodes (31): Channel, envelope_spectrum(), fault_frequencies(), g_to_ms2(), harmonic_snr(), load_recording(), match_peaks(), multi_band_probe() (+23 more)

### Community 2 - "json"
Cohesion: 0.07
Nodes (31): speech_speak(), ws_sync(), _first_json_object(), add_skills(), apply_patch(), clean_skill(), _decode_image(), layout_table() (+23 more)

### Community 3 - "test_agent.py"
Cohesion: 0.16
Nodes (17): FakeDocs, Call, ctx(), Resp, StubClient, StubResponses, test_analyze_happy_paths(), test_analyze_rejects_bad_inputs() (+9 more)

### Community 4 - "api.ts"
Cohesion: 0.06
Nodes (40): agentsApi, AgentSpecItem, AgentTraceItem, api, AssemblyGuideResult, AssemblyGuideStep, assistApi, DemoAsset (+32 more)

### Community 5 - "main.py"
Cohesion: 0.05
Nodes (56): load_trace(), new_investigation_id(), series_for(), agents_catalog(), assist_history(), cases(), create_figure(), create_investigation() (+48 more)

### Community 6 - "Eval Corpus & Hashes"
Cohesion: 0.06
Nodes (28): Bearing Archives SHA256 Hashes (K001-KB23), Bearing Splits (Dev/Validation/Final), scripts/fetch_sample.py Acquisition, Abstention / insufficient_evidence, Demo Script (7 Beats), Freeze & Reveal Documented Fault, Filename Encoding N/M/F Codes, Operating Conditions (4 Fixed Settings) (+20 more)

### Community 7 - "frontend/package.json"
Cohesion: 0.15
Nodes (12): name, private, type, version, oxfmt, @react-three/drei, @react-three/fiber, tailwindcss (+4 more)

### Community 8 - "spot-plate/geometry.ts"
Cohesion: 0.06
Nodes (46): rings(), BASE_ART, BASE_SCREWS, BOTTLE_ART, clean(), DECK_ART, DECK_SCREWS, FEET (+38 more)

### Community 9 - "Agent Tools & Evidence"
Cohesion: 0.25
Nodes (13): _err(), EvidenceStore, execute(), _ok(), _ref_dicts(), _t_analyze(), _t_compare(), _t_docs() (+5 more)

### Community 10 - "raptor-engine/build.mjs"
Cohesion: 0.01
Nodes (136): across, along, ARM, ARM_Y, back, backSvg, balance, beamBolts (+128 more)

### Community 11 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleResolution (+10 more)

### Community 12 - "Favicon Artwork"
Cohesion: 0.43
Nodes (7): Alpha Mask Bolt Silhouette, Blurred Aurora Gradient Fill, Machine Fault Investigator Favicon, Machine Fault Investigator Frontend, Gaussian Blur Filters (b-p), Purple Lightning Bolt Glyph, Violet and Blue Color Palette (#863bff, #7e14ff, #ede6ff, #47bfff)

### Community 13 - "Icon Sprite Sheet"
Cohesion: 0.43
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social Icon, Icons SVG Sprite Sheet, X Icon

### Community 14 - "test-rig/geometry.ts"
Cohesion: 0.03
Nodes (110): cyl(), ring(), ARM, BARS, barScrews(), barTicks(), BASE_ART, BASE_SCREWS (+102 more)

### Community 15 - "spot-plate/rig.ts"
Cohesion: 0.04
Nodes (102): LiquidArt(), atTop(), cache, concaveRuns(), ease(), GlassShape, Glint, glintsOf() (+94 more)

### Community 16 - "audit.mjs"
Cohesion: 0.08
Nodes (75): Fixed, audit(), auditOrExit(), baseSdf(), belongs(), bodyDepth(), boundsOf(), box() (+67 more)

### Community 17 - "arcade-cabinet/build.mjs"
Cohesion: 0.02
Nodes (89): ANODE_F, anodeAt, anodeN, back, BAND, bd, BEZEL_B, BEZEL_OPEN (+81 more)

### Community 18 - "test-rig/rig.ts"
Cohesion: 0.04
Nodes (82): apply(), clamp(), ease(), Hand, Nodes, Props, RESTING_TEXT, restShown() (+74 more)

### Community 19 - "iso-kit.mjs"
Cohesion: 0.06
Nodes (61): slab(), attrs(), axesAt(), axisVector(), AZIMUTH, cameraOf(), circleRing(), coil() (+53 more)

### Community 20 - "turn-build.mjs"
Cohesion: 0.13
Nodes (31): attrs(), build(), out, closest(), dotsMarkup(), esc(), gjk(), groupData() (+23 more)

### Community 21 - "ripple-tank/build.mjs"
Cohesion: 0.03
Nodes (70): ARM_LENGTH, ARM_N, ARM_U, at16, at28, back, backSvg, BAR (+62 more)

### Community 22 - "iso-kit.ts"
Cohesion: 0.05
Nodes (71): fit(), cylinder(), fit(), Camera, ExtrudeOptions, Faded, FadeLineStyle, FigureOptions (+63 more)

### Community 23 - "lathe.mjs"
Cohesion: 0.11
Nodes (63): orientedBox(), iso(), pathOf(), sideRing(), angleToward(), arcOf(), bandOf(), bandOfProfile() (+55 more)

### Community 24 - "turning-dial/build.mjs"
Cohesion: 0.03
Nodes (62): along(), argv, BACK, backSvg, BALL, BODY, BREAK_END, CONN (+54 more)

### Community 25 - "assist.py"
Cohesion: 0.03
Nodes (53): assist_turn(), _decimate_spectrum(), load_pack_files(), load_session(), match_playbook(), norm(), parse_signal_csv(), parse_wav() (+45 more)

### Community 26 - "cr-pump/build.mjs"
Cohesion: 0.05
Nodes (62): Runtime (`kit/turn.mjs`, inlined with `turnScript()`), scene(), at(), base(), BASEP, body, byDepth(), coupling() (+54 more)

### Community 27 - "push-button/build.mjs"
Cohesion: 0.13
Nodes (29): at(), BASE, body, BRIDGE, cap(), CELL, column(), COLUMNS (+21 more)

### Community 28 - "mobile_sync.py"
Cohesion: 0.06
Nodes (25): mobile_tunnel_start(), mobile_tunnel_stop(), _bch_format_bits(), _bch_version_bits(), _clean_room(), detect_lan_ips(), encode_qr_matrix(), _apply_format() (+17 more)

### Community 29 - "sys"
Cohesion: 0.09
Nodes (18): _sha(), main(), sha256_of(), main(), download(), main(), sha256_of(), unrar_tool() (+10 more)

### Community 30 - "ref_node_fs"
Cohesion: 0.06
Nodes (46): route(), fixtures, P, execute, capture(), execute, pngOf(), capture() (+38 more)

### Community 31 - "best/assembly.ts"
Cohesion: 0.06
Nodes (37): AssemblyHandle, bolt(), buildGeneric(), buildPump(), buildRig(), COL, DIFF_Y, geoCache (+29 more)

### Community 32 - "arcade-cabinet/live.js"
Cohesion: 0.07
Nodes (50): at(), chuteZ(), CLIP_DOOR, CLIP_MECH, coinPose(), drawCoins(), drawPile(), drawPulses() (+42 more)

### Community 33 - "tubePieces"
Cohesion: 0.09
Nodes (37): elbow(), cable(), explodeStates(), keyAt(), liftOf(), orderKeys(), prefixStates(), reversalsOf() (+29 more)

### Community 34 - "publish.mjs"
Cohesion: 0.08
Nodes (43): 5. Registering shader content to the SVG, fingerprintOf(), fingerprintOfSkill(), KIT_FILES(), sha256(), walk(), AGENTS, confirm() (+35 more)

### Community 35 - "raptor-engine/live.js"
Cohesion: 0.06
Nodes (45): out(), announce(), burn, canvas, clamp(), describe(), engine, fireButton (+37 more)

### Community 36 - "record.mjs"
Cohesion: 0.04
Nodes (31): playwright, all, listed, OUT, pageErrors, results, wav, OUT (+23 more)

### Community 37 - "App.tsx"
Cohesion: 0.11
Nodes (41): AssistTurn, figurePage(), harnessApi, InvPart, labelForCase(), mobileApi, MobileConnectionInfo, MobilePeer (+33 more)

### Community 38 - "os"
Cohesion: 0.08
Nodes (12): build_audio_and_csv(), build_blueprints(), build_workbench_photos(), _draw_blueprint_canvas(), _impulse_train(), _make_searchable_pdf(), build_corrupted_assets(), build_exotic_audio() (+4 more)

### Community 39 - "rag.py"
Cohesion: 0.07
Nodes (29): chat_answer(), _ensure_rag(), rag_reindex(), rag_search(), list_packs(), backfill_manual_sources(), chunk_text(), _committed_docs() (+21 more)

### Community 40 - "stress.mjs"
Cohesion: 0.06
Nodes (36): argv, BACK, backSvg, BENCH, body, FINGER_Y, follow(), groupsOf (+28 more)

### Community 41 - "turn-audit.mjs"
Cohesion: 0.09
Nodes (40): frameOf(), apply(), areaOfPath(), back(), clipArea(), continuity(), convexHull(), EYE (+32 more)

### Community 42 - "turn-fixed.mjs"
Cohesion: 0.08
Nodes (35): T3_EB, T3_EYE, T3_LB, T3_MAT_KEYS, T3_MAT_TUBE, T3_MATERIALS, T3_ROOT, T3_SHINE (+27 more)

### Community 43 - "inventory.py"
Cohesion: 0.12
Nodes (26): _audit(), audit_trail(), cancel(), confirm(), connect(), create_draft(), get_order(), _heuristic_pricing() (+18 more)

### Community 44 - "print-sheet.mjs"
Cohesion: 0.12
Nodes (42): 11. Static layers and a messy workshop around a turntable, capture(), captureScript(), chromePath(), DRIVE, HERE, main(), printPdf() (+34 more)

### Community 45 - "turn.mjs"
Cohesion: 0.07
Nodes (43): T3_EB, T3_EYE, T3_LB, T3_MAT_KEYS, T3_MAT_TUBE, T3_MATERIALS, T3_ROOT, T3_SHINE (+35 more)

### Community 46 - "rig/build.mjs"
Cohesion: 0.12
Nodes (30): at(), ballAt(), balls(), body, byDepth(), cage(), D(), HERE (+22 more)

### Community 47 - "Kit API"
Cohesion: 0.09
Nodes (23): [1.1.0] - 2026-10-12, Added, Fixed, FaceText(), Solid(), 11. Shaders, 1. What "crafted" means, 2. Anti-patterns (+15 more)

### Community 48 - "time"
Cohesion: 0.10
Nodes (21): _append_experience(), _bump_version(), default_harness(), distill_lesson(), evaluate_probe(), _exp_path(), _harness_path(), list_experience() (+13 more)

### Community 49 - "desk-computer/build.mjs"
Cohesion: 0.12
Nodes (33): House rules, at(), BEZEL, byDepth(), cable(), CASE, COIL, computer() (+25 more)

### Community 50 - "ripple-tank/live.js"
Cohesion: 0.06
Nodes (29): bar, bytes, crestPath, eccentric, farDipper, FIXED, freq, front (+21 more)

### Community 51 - "test_guide.py"
Cohesion: 0.14
Nodes (22): answer(), _check(), get_playbook(), _load(), _next_after(), _path(), _save(), start() (+14 more)

### Community 52 - "segment.py"
Cohesion: 0.12
Nodes (15): decode_photo(), device(), draw_overlay(), get_model(), masks_to_regions(), segment_photo(), test_ec17_textless_blueprint_sam_segmentation(), square_mask() (+7 more)

### Community 53 - "post"
Cohesion: 0.28
Nodes (13): default_client_factory(), model_api_key(), assist(), draft_upload(), harness_distill(), mobile_assembly_guide(), mobile_capture(), orchestrate_design() (+5 more)

### Community 54 - "test_packbuilder.py"
Cohesion: 0.06
Nodes (33): pack_derive(), assess(), classify_kind(), derive_assembly(), derive_scenarios(), extract_candidates(), fill_layout_from_assembly(), fill_layout_from_text() (+25 more)

### Community 55 - "12. The audit (`kit/audit.mjs`)"
Cohesion: 0.21
Nodes (25): at(), ballAt(), band(), boss(), boxAt(), cable(), clampAt(), Dots() (+17 more)

### Community 56 - "tubePieces"
Cohesion: 0.08
Nodes (25): body(), cylinder(), disc(), lathe(), ring(), slide(), solid(), traced() (+17 more)

### Community 58 - "models.ts"
Cohesion: 0.13
Nodes (24): EngineeringPanel(), formatValue(), propose(), RecordEntry, BearingInput, calculate(), Common, defaults (+16 more)

### Community 59 - "test_latency.py"
Cohesion: 0.15
Nodes (13): arm_fixed(), _Call, _fixed_client(), _Resp, _StubClient, _StubResponses, test_baseline_arm_under_budget_offline(), test_fixed_arm_abstains_on_invalid_output() (+5 more)

### Community 60 - "sim/assembly.ts"
Cohesion: 0.08
Nodes (26): PackComponent, COL, Cov, DIFF_Y, EngPulse, EngRefs, findComps(), FIRE6 (+18 more)

### Community 61 - "draw.tsx"
Cohesion: 0.12
Nodes (23): StretchArt(), TestRigFigure(), Frame, GlassPaths, PULLED, Flat, KeyMark, LegendKey (+15 more)

### Community 62 - "turning"
Cohesion: 0.08
Nodes (24): digit(), frameOf(), convexOrThrow(), fine(), finePath(), frameFrom(), hull2(), roundedPolygon() (+16 more)

### Community 63 - "speech.py"
Cohesion: 0.15
Nodes (9): _int_words(), _load_asr(), _load_tts(), _mono_16k(), _number_words(), speak(), speakable(), transcribe() (+1 more)

### Community 64 - "turning-dial/live.js"
Cohesion: 0.12
Nodes (20): backLayer, controller, describe(), first, hold(), ignite(), paint(), random() (+12 more)

### Community 65 - "ref_node_fs"
Cohesion: 0.15
Nodes (18): chromePath(), main(), parse(), problemWith(), usage(), chromePort(), chromePath(), main() (+10 more)

### Community 66 - "Design System: Machine Fault Investigator"
Cohesion: 0.08
Nodes (23): Buttons, Cards / Containers, Chips, Colors, Components, Design System: Machine Fault Investigator, Do:, Do's and Don'ts (+15 more)

### Community 68 - "inline-kit.mjs"
Cohesion: 0.22
Nodes (14): clear(), canvas(), 13. The WebGL layer (`kit/gl.mjs`), 14. Tools, 8. Card and page, 6. API and a minimal page, fixedScript(), glScript() (+6 more)

### Community 69 - "dial-indicator/build.mjs"
Cohesion: 0.17
Nodes (20): at(), BLOCKS, body, byDepth(), CARRIAGE, D(), DIAL, fixture() (+12 more)

### Community 70 - "ripple-tank/model.mjs"
Cohesion: 0.14
Nodes (19): amplitudeOf(), BEAT, causticOf(), clippedRunsOf(), focusOf(), GLASS, magnificationOf(), nodalCount() (+11 more)

### Community 71 - "react"
Cohesion: 0.15
Nodes (13): chapters, mapProgress(), mapScroll(), tops, LandingPage(), Still(), LandingExperience(), Workspace (+5 more)

### Community 72 - "test_validation.py"
Cohesion: 0.18
Nodes (13): FakeStore, refs(), synth_recording(), test_tool_crash_becomes_error_result(), needs_sample(), sine_csv(), test_missing_speed_withholds_fault_match(), test_nonfinite_analyses_refuse() (+5 more)

### Community 73 - "at"
Cohesion: 0.15
Nodes (21): at(), ball(), bead, board(), boltHeads, box(), cable(), chip() (+13 more)

### Community 74 - "t3EmitRound"
Cohesion: 0.24
Nodes (21): t3Arcs(), t3At(), t3BoxOf(), t3Broken(), t3EmitLathe(), t3EmitPrism(), t3EmitRibs(), t3EmitRound() (+13 more)

### Community 75 - "re"
Cohesion: 0.08
Nodes (19): one_shot(), parse_json_blob(), vision_identify(), meta(), role(), agent_catalog(), enrich_assist_turn(), infer_suspect_component() (+11 more)

### Community 76 - "Verify"
Cohesion: 0.12
Nodes (16): wobble(), Shading and textures on curved surfaces, Turned parts: think in meridians, Capture, Checklist for 3D figures, Close-ups, Common faults and fixes, Light-theme shaders (+8 more)

### Community 77 - "buildPlanar"
Cohesion: 0.20
Nodes (19): bankPt(), buildEngine(), buildGeneric(), buildPlanar(), buildRig(), classify(), fitTemplate(), levelsOf() (+11 more)

### Community 78 - "anatomy/README.md"
Cohesion: 0.15
Nodes (12): Contributing, Examples, Gallery, How it works, Install, License, Limits, Quick start (+4 more)

### Community 79 - "react-readout-first-write.test.mjs"
Cohesion: 0.07
Nodes (24): directory, React, { renderToStaticMarkup }, require, ts, alias, { build }, directory (+16 more)

### Community 80 - "FORMA — frontend physics, design and experiments"
Cohesion: 0.11
Nodes (17): Agreed scope, Design and 3D integration, Existing speed/load controls, Experiments and reporting, FORMA — frontend physics, design and experiments, Implementation sequence, Model 1: motor-and-bearing assembly, Model 2: electric motor (+9 more)

### Community 82 - "Motion and interaction"
Cohesion: 0.12
Nodes (16): shutdown(), Announcing phases, Arming, Critically damped settle, CSS motion, Depth re-sorting of moving parts, Envelopes for one-shot events, Exploded views (+8 more)

### Community 83 - "t3EmitRound"
Cohesion: 0.27
Nodes (18): t3Arcs(), t3At(), t3BoxOf(), t3Broken(), t3Dome(), t3EmitLathe(), t3EmitRibs(), t3EmitRound() (+10 more)

### Community 84 - "turn-fidelity.mjs"
Cohesion: 0.73
Nodes (5): identity(), restValues(), rootOf(), rounds(), tubes()

### Community 85 - "turn-bench.mjs"
Cohesion: 0.12
Nodes (15): angles, argv, cams, cpuFrames, frames, frameTimes, kinds, median() (+7 more)

### Community 86 - "Machine Fault Investigator — UI-first web app"
Cohesion: 0.12
Nodes (16): Acceptance and verification, Agent lab, Assembly and interactive behavior, Blueprint studio, Evidence and investigation experience, Frontend organization and contracts, Future implementation with Meta Muse, Goal and delivery boundary (+8 more)

### Community 87 - "packbuilder.py"
Cohesion: 0.10
Nodes (18): draft_finalize(), draft_reason(), apply_edits(), extract_blueprint_dimensions(), load_draft(), merge_vision_candidates(), new_draft(), normalize_blueprint_image() (+10 more)

### Community 88 - "S"
Cohesion: 0.20
Nodes (16): at(), cornerPost(), dipper(), Dots(), glassLines(), Ln(), pillar(), postSeg() (+8 more)

### Community 89 - "FORMA — cinematic scroll-driven introduction"
Cohesion: 0.12
Nodes (15): Accessibility and content integrity, Asset preparation, Chapter-to-video mapping, Environment and inspected asset, Final conversion section, FORMA — cinematic scroll-driven introduction, Goal and approved direction, Implementation sequence (+7 more)

### Community 90 - "test_figures.py"
Cohesion: 0.05
Nodes (56): build_spec(), check_segment_rules(), _context(), _excerpt_entry(), extract_dimensions(), figure_dir(), _find_pages(), ink_coverage() (+48 more)

### Community 91 - "layout.py"
Cohesion: 0.15
Nodes (10): clean_drawing(), clean_entry(), clean_layout(), clean_mount(), from_legacy(), infer_mount(), normalize_components(), unit() (+2 more)

### Community 92 - "meta_calls.py"
Cohesion: 0.12
Nodes (5): make(), inflight(), record(), RecordingClient, _RecordingResponses

### Community 93 - "profile_latency.py"
Cohesion: 0.20
Nodes (8): DocsStore, arm_stats(), main(), _pct(), replay_trace(), _rows(), test_docs_store_clean(), test_docs_pack_has_no_labels()

### Community 94 - "WebGL inside the drawing"
Cohesion: 0.15
Nodes (13): draw(), podAt(), 10. Performance, 2. The layer stack, 3. The camera contract, 4. Ray-marching in the iso camera, 8b. Shaders on a turning group, 9. Verify (+5 more)

### Community 95 - "t3EmitBall"
Cohesion: 0.16
Nodes (15): t3ArcPoints(), t3ClipConvex(), t3Dome(), t3EmitBall(), t3Enclose(), t3Grown(), t3Hull(), t3HullOut() (+7 more)

### Community 96 - "figma-make-app"
Cohesion: 0.33
Nodes (5): Dependencies, Development Server, figma-make-app, Project Structure, Styling

### Community 97 - "test_render_verify.py"
Cohesion: 0.17
Nodes (6): _Client, _components(), test_attach_rejects_unknown_or_self_targets_and_bad_mounts(), test_patch_touches_only_known_callouts_and_clamps_values(), test_round_that_lowers_the_score_restores_the_previous_layout(), test_verify_round_writes_patch_log_and_skills()

### Community 98 - "agent.py"
Cohesion: 0.18
Nodes (9): _accumulate(), _is_retryable(), list_traces(), run(), save_trace(), _run_job(), traces_list(), test_list_traces_always_reports_mode_and_step_count() (+1 more)

### Community 99 - "t3Mount"
Cohesion: 0.16
Nodes (14): t3Anchor(), t3Apart(), t3Camera(), t3Cams(), t3Cover(), t3Disjoint(), t3Frame(), t3Gjk() (+6 more)

### Community 100 - "t3EmitBall"
Cohesion: 0.20
Nodes (11): t3ArcPoints(), t3ClipConvex(), t3EmitBall(), t3Grown(), t3Hull(), t3HullOut(), t3LatheMid(), t3LatheOutline() (+3 more)

### Community 102 - "Centrifugal pump blueprint — Blueprint & Component Specification"
Cohesion: 0.40
Nodes (4): Assembly Sequence, Centrifugal pump blueprint — Blueprint & Component Specification, Confirmed Components, Extracted Dimensions & Ratings

### Community 103 - "initAssembly"
Cohesion: 0.24
Nodes (11): initAssembly(), applyExplode(), assembleSteps(), frameCamera(), materialsOf(), repaint(), setLayout(), syncLoose() (+3 more)

### Community 104 - "Contributor Covenant Code of Conduct"
Cohesion: 0.17
Nodes (12): 1. Correction, 2. Warning, 3. Temporary Ban, 4. Permanent Ban, Attribution, Contributor Covenant Code of Conduct, Enforcement, Enforcement Guidelines (+4 more)

### Community 105 - "canvas-painter.mjs"
Cohesion: 0.31
Nodes (12): CANVAS2D, cpCompilePart(), cpCss(), cpGeometry(), cpMatrixOf(), cpMount(), cpMul(), cpRgba() (+4 more)

### Community 106 - "MetaCallLog.tsx"
Cohesion: 0.24
Nodes (11): Avatar(), CREW, CrewCall, CrewDock(), CrewMember, memberFor(), clock(), initialOpen() (+3 more)

### Community 107 - "Changelog"
Cohesion: 0.17
Nodes (11): [1.0.0] - 2026-10-10, 2026-10-08, Added, Added, Added, Changed, Changed, Changed (+3 more)

### Community 108 - "t3Emit"
Cohesion: 0.29
Nodes (12): t3Box(), t3Emit(), t3EmitDots(), t3EmitFixed(), t3EmitPlanes(), t3EmitPrism(), t3Fix(), t3Grow() (+4 more)

### Community 109 - "vite.config.ts"
Cohesion: 0.18
Nodes (5): figmaLinkedPackageSourcemaps(), figmaReactRefreshBoundaryFallback(), @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 110 - "ingest_manual.py"
Cohesion: 0.23
Nodes (6): clean(), cmd_draft_pos(), cmd_extract(), cmd_validate(), _fail(), read_pages()

### Community 111 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 112 - "test_meta_calls.py"
Cohesion: 0.29
Nodes (7): recent(), _client(), _Responses, test_endpoint_returns_calls_after_cursor(), test_failed_call_is_recorded_and_reraised(), test_successful_call_is_recorded_with_role_and_usage(), test_wrapper_passes_through_other_attributes()

### Community 113 - "Machine-pack schema (expansion Phase 2)"
Cohesion: 0.22
Nodes (8): assembly.json, components.json, Excerpts, Layout, Leakage gate for packs, Machine-pack schema (expansion Phase 2), pack.json, scenarios.json

### Community 114 - "BASE"
Cohesion: 0.29
Nodes (11): at(), backPosts(), BASE, byDepth(), cable(), D(), L(), midStatic() (+3 more)

### Community 115 - "Walkthrough: the test rig (Fig 6)"
Cohesion: 0.20
Nodes (9): 1. Truth, 2. Object, 3. Parts list (53 solids), 4. Camera and layout (`view.ts`), 5. Geometry (`geometry.ts`, `pose.ts`), 6. Painter's order (`live.tsx`), 7. Live behaviour (`live.tsx`), 8. Card (+1 more)

### Community 116 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, oxfmt, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, typescript (+2 more)

### Community 117 - "coverage"
Cohesion: 0.26
Nodes (13): areaOf(), attributeOf(), boxOfPoints(), boxOfShape(), cornersOfBox(), coverage(), markupBox(), matrixOf() (+5 more)

### Community 118 - "Printable sheets (A4)"
Cohesion: 0.22
Nodes (8): coin(), A PDF link on the figure, Check it, Longer detailed sheets, Printable sheets (A4), The spec, The three formats, raster()

### Community 119 - "harnessRoute"
Cohesion: 0.28
Nodes (9): CLAMPS, harnessRoute(), JACKET_BOSS, laneR(), laneS(), lugBall(), plug(), polar() (+1 more)

### Community 120 - "gl.mjs"
Cohesion: 0.25
Nodes (5): burst(), glCamera(), GLSL_ISO, GLSL_TURN, smooth()

### Community 121 - "gl-shared.mjs"
Cohesion: 0.25
Nodes (4): burst(), GLSL_ISO, GLSL_TURN, smooth()

### Community 122 - "t3EmitTube"
Cohesion: 0.31
Nodes (9): t3Basis(), t3Cloud(), t3EmitTube(), t3PrepareBall(), t3Pts(), t3Sides(), t3StripeEnd(), t3TubeCap() (+1 more)

### Community 123 - "t3Emit"
Cohesion: 0.36
Nodes (9): t3Emit(), t3EmitDots(), t3EmitFixed(), t3EmitPlanes(), t3Fix(), t3Grow(), t3Matrix(), t3Num() (+1 more)

### Community 124 - "t3EmitTube"
Cohesion: 0.20
Nodes (14): t3Basis(), t3Cloud(), t3Cut(), t3EmitTube(), t3PointAlong(), t3PrepareBall(), t3PrepareTube(), t3Pts() (+6 more)

### Community 125 - "Spindle 6203 blueprint — Blueprint & Component Specification"
Cohesion: 0.40
Nodes (4): Assembly Sequence, Confirmed Components, Extracted Dimensions & Ratings, Spindle 6203 blueprint — Blueprint & Component Specification

### Community 126 - "lines.mjs"
Cohesion: 0.22
Nodes (7): actions, argv, child, out, select, tolerance, wait

### Community 127 - "V6 engine blueprint — Blueprint & Component Specification"
Cohesion: 0.40
Nodes (4): Assembly Sequence, Confirmed Components, Extracted Dimensions & Ratings, V6 engine blueprint — Blueprint & Component Specification

### Community 128 - "3-Minute Winning Live Demo Choreography"
Cohesion: 0.22
Nodes (8): 3-Minute Winning Live Demo Choreography, Beat 1 (0:00 – 0:45) · 2D Blueprint Image → 3D Parametric Machine & Physics, Beat 2 (0:45 – 1:25) · Image-to-Assembly Guide (Meta SAM 2.1 + `muse-spark-1.3`), Beat 3 (1:25 – 2:15) · Live Voice & 5s Acoustic Fault Diagnosis → Auto-Drafted Repair Kit PO, Beat 4 (2:15 – 3:00) · Self-Evolving `Harness²` (`16.7% → 76.2%`) + Zero-Hallucination RAG, PITCREW ⚡ AI — Giving Heavy Machinery a Brain (Cerebral Valley × Meta Hackathon Stage Script), Quick Launch (Before Walking on Stage), Where to Drop Your Real-World Photos (Optional — 4 Shots)

### Community 129 - "buildPump"
Cohesion: 0.28
Nodes (9): bolt(), buildPump(), helix(), looseBolt(), makePerfTexture(), mapVisual(), oring(), spring() (+1 more)

### Community 130 - "3. Parts vocabulary, with recipes"
Cohesion: 0.15
Nodes (13): 3. Parts vocabulary, with recipes, Base plate on feet, Coil spring around a rod (split for painter's order), Dial gauge (face up), Drawer with a pull and label holder, Knurled knob with a pointer, Lamp, probe and finger, Perforations, vents and a pulsing dot grid (+5 more)

### Community 131 - "Contributing to Anatomy"
Cohesion: 0.29
Nodes (7): Building the examples, Changing the skill's text, Contributing to Anatomy, Pull requests, Reporting a bug or asking for a figure, Setup, The checks

### Community 132 - "t3Poses"
Cohesion: 0.29
Nodes (8): t3Apply(), t3Compose(), t3FreeRot(), t3Mul(), t3Poses(), t3PosesMap(), t3Quat(), t3Rot()

### Community 133 - "t3Poses"
Cohesion: 0.29
Nodes (8): t3Apply(), t3Compose(), t3FreeRot(), t3Mul(), t3Poses(), t3PosesMap(), t3Quat(), t3Rot()

### Community 134 - "7. Craft rules, each with the bug that taught it"
Cohesion: 0.25
Nodes (8): 7. Craft rules, each with the bug that taught it, Fallback, Layering and blending, No hard spatial cut-offs, Reduced motion, Render only while it matters, Tonemap and dither, World space, in the camera

### Community 135 - "8. Light theme"
Cohesion: 0.29
Nodes (7): 8.2 Ink grows with light, 8.3 A ground for the light, 8.4 Recipes by phenomenon, 8.5 The SVG and the fallback in light, 8.6 Where the ink meets a line, 8.7 What the reviewers saw, and the fix, 8. Light theme

### Community 136 - "tick"
Cohesion: 0.29
Nodes (7): angleOf(), drawFallback(), drawSvg(), record(), remember(), tick(), tourAt()

### Community 137 - "audit-order-convergence.test.mjs"
Cohesion: 0.33
Nodes (4): at(), cam, chain(), P

### Community 138 - "Anatomy"
Cohesion: 0.25
Nodes (7): 3D: figures that turn (beta), Anatomy, Printable sheets (A4), References, The one idea that matters, WebGL inside the drawing, Workflow

### Community 139 - "Eval: figure publish readiness"
Cohesion: 0.29
Nodes (6): Capability evals, Eval: figure publish readiness, Graders, Metrics, Regression evals, Run history

### Community 140 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, lucide-react, react, react-dom, @react-three/drei, @react-three/fiber, three

### Community 143 - "makeParts"
Cohesion: 0.47
Nodes (5): makeParts(), stickLower(), stickUpper(), switchesClosed(), UP()

### Community 144 - "clampTo"
Cohesion: 0.33
Nodes (6): aimOf(), clampTo(), drawGl(), packHistory(), put(), Nothing pops

### Community 145 - "Figures demo + test plan (cr-pump first, rig second)"
Cohesion: 0.33
Nodes (5): 0. Setup (once per terminal), Figures demo + test plan (cr-pump first, rig second), Part A — Demo script (~12 min), Part B — Test plan (do in order, tick off), Sign-off

### Community 146 - "RenderSkillsPanel.tsx"
Cohesion: 0.40
Nodes (5): describe(), RenderSkillsPanel(), Skill, RenderSkill, lucide-react

### Community 147 - "Pack-builder contract (FINAL — accepted 2026-10-27)"
Cohesion: 0.33
Nodes (5): Done means (proposed), Open questions, Pack-builder contract (FINAL — accepted 2026-10-27), Scope boundary (proposed, needs acceptance), Settled decisions

### Community 148 - "Landing footage: Muse Wonder + Muse Image prompts"
Cohesion: 0.33
Nodes (5): Demo-video intro shot (optional, 4 s), Drop-in specs (no code changes needed if you keep these names), Landing footage: Muse Wonder + Muse Image prompts, Muse Image prompts (stills, if you'd rather generate them than grab frames), Muse Wonder prompt (the 8-second hero film)

### Community 149 - "Verdict: anatomy pilot (rig-6203 figure)"
Cohesion: 0.33
Nodes (5): Decision (gate), Is it better and more deterministic than ours?, Reproduce, Scope notes (deviations from plan, all honest), Verdict: anatomy pilot (rig-6203 figure)

### Community 150 - "bezelPt"
Cohesion: 0.40
Nodes (5): bezelMatrix(), bezelPt(), faceClip, openClip, planeMatrix()

### Community 151 - "onBody"
Cohesion: 0.50
Nodes (5): DOME_BOSS, domeAt(), onBody(), radiusOn(), slopeOn()

### Community 152 - "steer"
Cohesion: 0.50
Nodes (5): announce(), hold(), run(), steer(), Taking over from the tour

### Community 153 - "PULL_REQUEST_TEMPLATE.md"
Cohesion: 0.40
Nodes (4): Checks, Screenshots, What this changes, Why

### Community 154 - "running"
Cohesion: 0.50
Nodes (4): meta_call_log(), running(), test_inflight_lists_running_calls_until_they_finish(), create()

### Community 155 - "Security"
Cohesion: 0.40
Nodes (4): Reporting a vulnerability, Security, Supported versions, What is in scope

### Community 156 - "Latency profile (offline replay, no model calls)"
Cohesion: 0.40
Nodes (4): final per-arm latency (seconds), investigate/val replay attribution (n=60), Latency profile (offline replay, no model calls), val per-arm latency (seconds)

### Community 157 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, format, preview

### Community 158 - "v6-engine-blueprint.png — Blueprint & Component Specification"
Cohesion: 0.40
Nodes (4): Assembly Sequence, Confirmed Components, Extracted Dimensions & Ratings, v6-engine-blueprint.png — Blueprint & Component Specification

### Community 159 - "Wilfley centrifugal pump (US 3,402,671) — Blueprint & Component Specification"
Cohesion: 0.40
Nodes (4): Assembly Sequence, Confirmed Components, Extracted Dimensions & Ratings, Wilfley centrifugal pump (US 3,402,671) — Blueprint & Component Specification

### Community 160 - "pdf-button.mjs"
Cohesion: 0.67
Nodes (3): escape(), PDF_BUTTON_CSS, pdfButton()

### Community 162 - "poses"
Cohesion: 0.50
Nodes (4): breakAt(), follow(), poses(), tapAt()

### Community 163 - "faceMarkup"
Cohesion: 0.67
Nodes (4): faceMarkup(), ringPath(), tick(), wheelFace()

### Community 164 - "Publishing a figure to the community gallery"
Cohesion: 0.50
Nodes (3): Publishing a figure to the community gallery, Steps, What the gallery rejects

### Community 167 - "cpPoint"
Cohesion: 0.67
Nodes (3): cpPoint(), cpTop(), overlay

### Community 168 - "cone"
Cohesion: 0.67
Nodes (3): cone(), coneShare(), coneSlope()

### Community 169 - "FTP"
Cohesion: 0.67
Nodes (3): FTP, FTP_HOUSING, FTP_LOW

### Community 171 - "FA"
Cohesion: 0.67
Nodes (3): FA(), knobAt(), needleAt()

### Community 211 - "Falk speed reducer (US 3,348,430) — Blueprint & Component Specification"
Cohesion: 0.50
Nodes (3): Assembly Sequence, Confirmed Components, Falk speed reducer (US 3,348,430) — Blueprint & Component Specification

### Community 212 - "Rotron fan motor (US 3,513,339) — Blueprint & Component Specification"
Cohesion: 0.50
Nodes (3): Assembly Sequence, Confirmed Components, Rotron fan motor (US 3,513,339) — Blueprint & Component Specification

## Knowledge Gaps
- **20 isolated node(s):** `@react-three/drei`, `@react-three/fiber`, `@types/node`, `@types/react`, `@types/react-dom` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1780 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `api.ts`, `App.tsx`, `frontend/package.json`, `spot-plate/geometry.ts`, `MetaCallLog.tsx`, `test-rig/geometry.ts`, `spot-plate/rig.ts`, `react-readout-first-write.test.mjs`, `test-rig/rig.ts`, `RenderSkillsPanel.tsx`, `models.ts`, `draw.tsx`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **What connects `@react-three/drei`, `@react-three/fiber`, `@types/node` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Vibration Analysis Core` be split into smaller, more focused modules?**
  _Cohesion score 0.05387861084063616 - nodes in this community are weakly interconnected._
- **Why does `12. The audit (`kit/audit.mjs`)` connect `12. The audit (`kit/audit.mjs`)` to `tubePieces`, `inline-kit.mjs`, `re`, `Verify`, `Kit API`, `audit.mjs`, `test-rig/rig.ts`, `lathe.mjs`, `cr-pump/build.mjs`, `ref_node_fs`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Should `json` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Why does `meta()` connect `re` to `12. The audit (`kit/audit.mjs`)`, `main.py`, `rag.py`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._