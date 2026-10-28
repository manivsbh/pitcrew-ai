# Machine Fault Investigator — UI-first web app

## Goal and delivery boundary

Build an interactive web-app prototype that presents the full machine-engineering vision: assembly exploration, blueprint intake, fault investigation, parameter controls, inventory, coordinated agents, and mobile/voice inputs. The deliverable is a working frontend, not a validated engineering simulator or live AI service.

Implement in the current React 19, TypeScript, Vite workspace so the existing preview works. Do not create a sibling project for this UI phase or change preview infrastructure. The repository is an empty scaffold with no existing design system, backend, or supply-chain implementation to preserve.

No backend, credentials, real Meta calls, durable accounts, actual PDF reconstruction, or diagnostic claims are included in this phase. Prominently label the workspace “Demo workspace,” geometry “Illustrative,” and generated investigations “Demo replay.” Provide a capability-status panel separating interactive prototype features from planned integrations.

## Visual direction

A desktop engineering workbench, not a marketing page: graphite navigation and toolbar, restrained dark slate panels, off-white technical text, teal selection accents, amber warnings, fine borders, and disciplined spacing. Use a public Google font for interface text and a monospace face for measurements. Create a small local component/token layer because no design-system package exists. Use consistent SVG icons rather than emojis.

At desktop widths, use a compact left navigation rail, a central 3D workspace and evidence strip, and a right investigation panel. Keep the assembly visually dominant. The top bar shows project, machine, demo status, and report action. Below it show a compact machine-status row with speed, illustrative temperature, load, and asset health.

At tablet widths collapse the rail and put the investigation panel behind a tab. On mobile show Assembly, Evidence, and Agents tabs, with all component selection available through a list rather than only through canvas interaction.

## Information architecture

Primary navigation:

1. **Workspace** — default machine assembly, parameters, evidence, agent conversation.
2. **Blueprints** — upload affordance, sample drawing preview, extracted-dimension review mock.
3. **Investigations** — bundled cases, replay history for the current session, report inspection.
4. **Inventory** — component availability, good/inspect/damaged status, compatibility and assembly suggestions.
5. **Agent lab** — specialist roles, capabilities, simulated handoffs and voice/mobile setup.

Use React state for navigation; a routing library is unnecessary for this prototype. Settings and capability disclosures open in dialogs.

## Assembly and interactive behavior

Use Three.js with React Three Fiber and Drei, after verifying their supported installed/package APIs, for a procedural motor-and-bearing assembly. No external CAD asset is required. Geometry includes motor body, shaft, housing, inner ring, outer ring, rolling elements, cage, and mounting base. Create stable component IDs shared with the component list, inventory, findings, and 3D selection.

Support orbit, zoom, reset view, component selection, isolation, exploded view, and show/hide labels. Canvas selection and the keyboard-accessible component tree update the same inspector. Selected components get a teal outline or material highlight; a suspected component uses amber plus a textual status, never color alone.

Play/pause animates shaft and bearing motion. Speed changes animation rate; load changes a labelled illustrative response indicator. These are visual demonstrations, not calculated stresses or validated physical behavior. Show units, permitted ranges, and reset controls. Do not imply that a moving 3D model is a physics simulation.

Provide a textual fallback if WebGL fails. Dispose resources and stop animation on unmount. Respect reduced-motion preferences.

## Evidence and investigation experience

Bundled anonymous cases: healthy reference, outer-ring suspicion, inner-ring suspicion, and insufficient evidence. All are synthetic fixtures, not Paderborn recordings. Do not borrow dataset identifiers or imply measured provenance.

Evidence tabs display a deterministic example waveform, spectrum, and envelope spectrum using responsive SVG charts. Show units, sample metadata, chart legends, analysis settings, and a “Synthetic demo data” badge. These charts demonstrate the interface; Python/SciPy analysis comes later.

“Start demo investigation” runs a deterministic, cancellable replay:

1. Inspect recording quality.
2. Read a prepared illustrative documentation excerpt.
3. Select and display example numerical analyses.
4. Compare with a synthetic healthy reference.
5. Submit a structured finding or abstain.

Steps reveal their inputs, outputs, timing and evidence links. Selecting evidence opens the appropriate plot or source drawer. Findings link to component IDs and select/highlight the matching geometry. An insufficient-evidence case requests speed or recording metadata and must not produce a confident diagnosis.

A question composer supports prewritten prompts and text input. Responses must come from explicit fixture mappings, with a truthful fallback explaining that live AI is not connected. Do not generate fictitious live model responses.

Allow freeze conclusion, then reveal the fixture's hidden scenario label. Switching cases resets findings and highlights. Export a JSON demo report containing schema version, synthetic provenance, selected case, parameter snapshot, replay steps, evidence IDs, conclusion, limitations, and a clear no-live-model flag.

## Other feature surfaces

### Blueprint studio
Accept a local PDF selection only for filename/type/size preview, with a 20 MB UI limit. Do not upload or parse its contents. Show a bundled illustrative blueprint and editable sample dimensions separately, clearly marked as sample data. Offer a human-confirmation stage and explain that PDF-to-geometry extraction is planned.

### Inventory and assembly suggestions
Use bundled synthetic inventory with search, status/category filters, quantities, compatibility tags, and a details drawer. “Preview assembly” loads the supported motor-bearing configuration, not arbitrary generated machinery. Suggestions are deterministic compatibility examples, not certified design recommendations.

### Agent lab
Show a coordinator and documentation, signal-analysis, assembly, inventory, and design-review specialists. Agent cards reveal inputs, outputs, allowed tools, and future safety boundaries. Display simulated handoffs tied to the demo replay; no live multi-agent claims.

### Voice and mobile
Provide an honest connection/setup panel and a labelled example transcript. No microphone permission or QR pairing is necessary in this phase. Controls explain that live recording, transcription, phone streaming, and voice replies require a later backend; do not show fake connected/listening states.

## Frontend organization and contracts

Suggested modules:

- `src/App.tsx`: shell and navigation.
- `src/components/ui/`: local accessible controls, tabs, dialogs, badges.
- `src/features/assembly/`: scene, component tree, inspector, parameter controls.
- `src/features/investigation/`: replay controller, timeline, findings, report export.
- `src/features/evidence/`: charts and evidence drawer.
- `src/features/blueprints/`, `inventory/`, `agents/`: feature panels.
- `src/data/demo.ts`: synthetic cases, parts, inventory, citations, replay events.
- `src/types.ts`: shared IDs and contracts.
- `src/index.css`: semantic tokens and responsive layout.

Keep user state in memory; reload restores demo defaults. Keep API-ready types explicit:

- `MachineComponent`: id, name, parentId, category, inventoryId, visible.
- `RecordingMetadata`: id, sourceKind, sampleRateHz, durationSeconds, units, speedRpm, qualityFindings.
- `Evidence`: id, kind, sourceKind, parameters, values, limitations.
- `InvestigationStep`: id, role, toolName, status, input, evidenceIds, durationMs.
- `Finding`: condition, componentIds, evidenceIds, contradictions, limitations, nextMeasurement.
- `DemoReport`: schemaVersion, demo flag, modelId null, parameters, steps, evidence, finding.

Use a demo service adapter so a future API can replace fixtures without rewriting the views. Reject unknown component/evidence IDs even in demo fixtures.

## Implementation order

1. Establish design tokens, app shell and synthetic data contracts.
2. Build procedural assembly and shared component selection.
3. Add parameter controls, explode/isolate/reset and accessible component list.
4. Add plots, investigation replay, findings and evidence linking.
5. Add blueprint, inventory, agent and voice/mobile surfaces.
6. Add report export, responsive layouts, failure states and capability disclosures.
7. Verify production build and interactions; fix failures before reporting completion.

## Future implementation with Meta Muse

This is a roadmap, not an assertion that any particular model or endpoint is available. Before integration, verify current official Meta documentation and account availability, then perform a real server-side smoke test for the chosen Muse model, Responses/tool-calling support, usage reporting, and pricing. The earlier proposed `muse-spark-1.3` remains unverified until that test succeeds.

For the eventual local standalone application, use a Python 3.12 FastAPI service with NumPy/SciPy, local recording/report storage, and the built Vite frontend served locally. This is a separate runtime stage, not something the current hosted frontend preview already supports. If live server capability is requested inside Make instead, use the platform backend provisioning flow before implementation rather than pretending a frontend can safely hold secrets.

Core service boundaries:

- Import recordings with strict size, units, channel, sampling-rate and metadata validation.
- Run deterministic numerical tools independently of the language model.
- Expose approved documentation retrieval, recording inspection, vibration analysis, healthy-reference comparison and finding submission.
- Keep secrets server-side and ground-truth labels outside agent inputs.
- Enforce eight tool calls and a two-minute investigation deadline in application code; validate all arguments, outputs, evidence IDs and component IDs.
- Stream progress with server-sent events; support cancellation, incomplete states and replay from saved actual outputs.

Add real capabilities in this order:

1. Verified data acquisition/licensing and baseline numerical tests.
2. One investigating agent with cited, tool-grounded findings and abstention.
3. Blueprint extraction: text/dimension extraction, user confirmation, constrained parametric geometry generation—not arbitrary reliable CAD reconstruction.
4. Parameterized physics: explicitly supported equations, units, assumptions and operating ranges; specialist solvers where required. AI chooses validated tools, not unrestricted executable equations.
5. Mobile audio upload and consent-based voice pipeline, with supported formats, recording quality checks and a separate acoustic benchmark.
6. Inventory persistence, compatibility constraints and human-reviewed design proposals.
7. Multiple specialist agents only after the single-agent baseline works; coordinator owns a shared typed evidence record and bounded tool budget.

Do not promise universal diagnosis, structural safety, manufacturing suitability, repair outcomes, or faithful real-world simulation. Validate each supported machine and analysis independently.

## Acceptance and verification

The UI phase is complete when:

- All five navigation destinations show coherent functional screens.
- Selection synchronizes between geometry, list, finding and inspector.
- Explode, isolate, reset, speed and play/pause work.
- Every bundled replay can finish or abstain, can be cancelled, and resets cleanly.
- Evidence links resolve; hidden labels reveal only after freezing a conclusion.
- Report export produces valid JSON with synthetic/demo provenance.
- File selection reports unsupported type/oversize without claiming extraction.
- Keyboard users can navigate controls, select components and dismiss dialogs; controls have accessible names and visible focus.
- Layout works on desktop and narrow screens; WebGL failure has a usable fallback.
- No control claims live AI, mobile pairing, physical analysis, CAD reconstruction or real recordings when those are not implemented.

Run the repository-prescribed production build (`pnpm build` if pnpm remains the detected package manager). Perform available browser checks of selection, replay, navigation, export and reset; report any checks that cannot be run. No additional server is started manually.
