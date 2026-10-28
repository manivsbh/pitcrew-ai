# FORMA — frontend physics, design and experiments

## Agreed scope

Extend the existing React/Vite workspace with functional Physics, Design and Experiments panels for all three supported machines: motor-and-bearing assembly, small combustion engine, and electric motor.

Calculations execute deterministically in the browser. Typed questions and optional browser speech recognition can propose supported experiments. There is no backend, live Muse integration, arbitrary code execution, persistent storage, or validated physical-failure prediction.

The interface must distinguish:

- **Calculated:** results derived from visible equations and inputs.
- **Assumed:** illustrative coefficients, reference properties and operating limits.
- **Unsupported:** conclusions requiring measurements or a higher-fidelity solver.

Use “Within configured limits,” “Limit exceeded,” “Invalid input,” or “Insufficient inputs,” never an unqualified prediction that a physical machine fails or is safe.

## Repository grounding

The app uses React 19, TypeScript, Vite, Three.js/React Three Fiber/Drei and Lucide icons. `src/App.tsx` owns the shell, machine selector, speed/load controls, demo investigation and modal guidance. `src/machines.tsx` defines machine metadata and additional procedural assemblies. `src/index.css` contains the existing dark slate/lime technical visual language.

Current speed/load controls are illustrative. “Preview motion” rotates the camera through OrbitControls; it is not physical shaft animation. Existing vibration plots and diagnostic findings are synthetic fixtures. Preserve their provenance and do not connect them to computed physics results.

Retain the supervised preview; do not start a server or provision a backend.

## User experience

Add a connected engineering panel below the assembly, above the component/evidence row, with tabs:

1. **Physics:** equations, inputs with units, substituted values, results and assumptions.
2. **Design:** supported geometry variables and a confirmation preview.
3. **Experiments:** baseline/candidate comparison, operating-limit checks and session history.

The investigation copilot composer accepts supported what-if commands in addition to its existing diagnostic demo. Add prompt chips such as “What if speed increases by 20%?”, “Increase shaft diameter to 25 mm,” and “How can I improve efficiency?”

A proposed experiment must be reviewed before it changes inputs or geometry. Controls: **Calculate**, **Apply candidate**, **Discard**, **Reset defaults**, and **Set current as baseline**. Show baseline versus candidate output, absolute changes and appropriate percentage changes. Avoid percentages when baseline is zero.

Keep investigation replay separate from engineering experiments. Physics experiments work on all three machines even though diagnostic replay remains bearing-only.

## State and data flow

Create modules:

- `src/physics/types.ts`: typed inputs, results, formula metadata, checks and snapshots.
- `src/physics/models.ts`: machine defaults, validated pure calculation functions and design bounds.
- `src/physics/commands.ts`: allowlisted typed-text intent parser and deterministic suggestion generation.
- `src/features/engineering/EngineeringPanel.tsx`: Physics/Design/Experiments UI.
- `src/features/engineering/useVoiceInput.ts`: optional speech-recognition lifecycle.

Refactor only the relevant state boundaries in App; avoid an unrelated shell rewrite.

Maintain separate baseline, applied inputs, draft inputs, and optional pending proposal for each machine. Switching machines restores that machine's in-memory state and cancels active speech recognition or unreviewed voice commands. Retain at most 20 experiment records per machine during the current session. Reload resets defaults.

Use discriminated input/result types, not one untyped bag of arbitrary parameters:

- `CalculationResult`: model/version, machineId, input snapshot, outputs with SI units, formula traces, checks, assumptions, limitations.
- `ExperimentProposal`: id, machineId, origin (`typed`/`voice`/`control`), parsed command, validated input patch, explanation and unsupported portions.
- `ExperimentRecord`: id, ISO timestamp, immutable baseline/candidate snapshots, computed results, status and applied flag.
- `LimitCheck`: id, quantity, actual value, configured threshold, comparison, status, related component IDs.

All output values come from the pure models. No language response supplies numbers independently.

## Model 1: motor-and-bearing assembly

Purpose: demonstrate rotational transmission and idealized solid-shaft torsion. This is not a bearing-life or vibration-diagnosis model.

Inputs and defaults:

- Speed `n`: 1500 rpm, editable 0–12000.
- Transmitted torque `T`: 5 N·m, editable 0–500.
- Shaft diameter `d`: 20 mm, editable 5–80.
- Shaft length `L`: 200 mm, editable 50–1000.
- Shear modulus `G`: 79 GPa, editable 1–200.
- Assumed allowable shear stress: 80 MPa, editable 1–500.
- Configured speed limit: 3000 rpm, editable 100–12000.
- Assumed bearing radial load `F`: 500 N, editable 0–10000; displayed as context only, not used in a fabricated life calculation.

Equations, converting all dimensional inputs to SI first:

- Angular velocity `ω = 2πn / 60`.
- Mechanical power `P = Tω`.
- Polar second moment `J = πd⁴ / 32`.
- Ideal maximum shaft shear `τ = 16T / (πd³)`.
- Ideal twist `θ = TL / (JG)`; display radians and degrees.
- Shear utilization `τ / τ_allowable`; avoid calling this a certified safety factor.

Limit checks: speed and ideal shear versus user-configured thresholds. Map exceeded shear to Drive shaft. Missing verified bearing geometry prevents expected fault-frequency calculations. No bearing efficiency or life claims.

## Model 2: electric motor

Purpose: illustrate output power and an explicit loss-budget approximation. No motor curve, magnetic saturation, temperature, starting transient, power factor or real supply behavior is simulated.

Inputs/defaults:

- Speed: 1500 rpm, 0–12000.
- Torque: 4 N·m, 0–100.
- RMS current: 4 A, 0–100.
- Phase resistance: 1 Ω, 0.01–20.
- Phase count fixed at 3 and explicitly shown.
- Assumed fixed losses: 30 W, 0–500.
- Assumed speed-loss coefficient `k`: 0.0005 W/(rad/s)², editable 0–0.05.
- Configured current limit: 8 A, 0.1–100.
- Configured speed limit: 3000 rpm, 100–12000.
- Shaft diameter: 20 mm, 5–80; visual design input only for this motor model.

Equations:

- `ω = 2πn / 60`.
- `P_out = Tω`.
- `P_copper = 3I²R`.
- `P_speed = kω²`.
- `P_loss = P_copper + P_fixed + P_speed`.
- `P_in = P_out + P_loss`.
- `η = P_out / P_in`, undefined when input is zero.

Current and torque are independent prescribed inputs in this simplified loss-budget model. The UI must state that their electromagnetic relationship is not modeled; this is not proof that any operating point can actually be produced.

Limit checks: current and speed. Link current excess to Stator windings. Explicitly do not derive overheating without a thermal model.

Efficiency suggestion: propose reducing assumed phase resistance by 10% while holding output torque, speed and prescribed current fixed. Show that this is a sensitivity study requiring winding/thermal feasibility verification, not a manufacturing recommendation. Never automatically reduce useful output to claim better efficiency.

## Model 3: small combustion engine

Purpose: estimate four-stroke displacement, power and fuel-energy accounting with an assumed brake mean effective pressure (BMEP). No combustion dynamics or component failure is predicted.

Inputs/defaults:

- Speed: 3000 rpm, 0–12000.
- Bore: 52 mm, 20–120.
- Stroke: 58 mm, 20–120.
- Cylinder count: integer 1–8, default 1.
- Assumed BMEP: 600 kPa, 0–1500.
- Fuel mass flow: 0.3 g/s, 0–10.
- Lower heating value: 43 MJ/kg, 1–50.
- Configured speed limit: 6000 rpm, 100–12000.
- Configured BMEP limit: 1000 kPa, 1–1500.

Equations:

- Total displacement `Vd = (π/4) bore² × stroke × cylinders`.
- Four-stroke brake power `P_brake = BMEP × Vd × n / 120`.
- Torque `T = BMEP × Vd / (4π)`, avoiding a zero-speed divide.
- Fuel power `P_fuel = massFlow × LHV`.
- Brake thermal efficiency `η_b = P_brake / P_fuel`.

Zero fuel flow with positive predicted power is inconsistent and must not produce a valid efficiency. If predicted output exceeds fuel power, mark the operating point inconsistent, show the energy-balance contradiction and withhold valid efficiency, rather than clamp to 100%. At rest, annotate torque as the BMEP-derived estimate, not demonstrated starting torque.

Limit checks: speed and assumed BMEP; map BMEP to Cylinder block. These are configured limits, not physical damage thresholds.

Efficiency suggestion: explain that lowering fuel flow or raising BMEP independently is not evidence of a feasible improvement. Offer a transparent sensitivity experiment, retaining equal brake output, and require confirmation of any changed assumption. Do not assert a credible optimum without calibration data.

## Existing speed/load controls

The engineering panel becomes the authoritative owner of actual engineering inputs. Synchronize the existing speed control and displayed rpm with the active machine's applied speed.

Relabel the existing percentage load control to “Visual load indicator — not used in equations,” or remove it from the calculation context. Do not silently interpret a percentage as torque, radial load or BMEP. Each physics model has explicit unit-bearing inputs.

Top machine status must distinguish the active calculated limit status from synthetic diagnostic status. Show “Configured limits” with the model result and keep bearing diagnostic warnings separately labelled.

## Design and 3D integration

Supported visual changes:

- Bearing assembly: shaft diameter and length.
- Electric motor: output-shaft diameter.
- Engine: cylinder bore and stroke; show total calculated displacement.

Normalize procedural geometry to each model's default dimensions; show that visual dimensions are scaled illustrations, not manufacturing CAD. Pass typed design props to Machine and AdditionalMachine instead of directly mutating scene objects. Scale only related components, not the entire machine.

Keep exploded view, isolation and selection working. The current illustrative engine exposes its piston beside the block; retain that pedagogical layout and note it is a cutaway/exposed arrangement.

On a limit violation, provide an explicit “Inspect affected component” action using validated component IDs. Do not animate a breakage event or imply measured component damage.

Do not use rotating the camera as evidence that shaft motion follows an equation. Rename the existing motion control to “Auto-orbit” unless actual component animation is implemented; actual motion simulation is outside this scope.

## Typed what-if commands and guidance

Use a deterministic parser, labelled “Local command assistant — not live AI.” Normalize case and units; accept allowlisted commands:

- Set/increase/decrease speed to a numeric rpm.
- Increase/decrease speed by a percentage.
- Set torque in N·m where supported.
- Set shaft diameter in mm for bearing/motor.
- Set bore or stroke in mm for engine.
- Set current in A or phase resistance in Ω for motor.
- “Improve efficiency” / “increase efficiency” returns the machine-specific guidance described above.
- “Reset parameters” proposes restoring current-machine defaults.

Bound percentage changes, reject nonfinite/out-of-range values, and require an explicit unit for absolute values. Support one input change per command initially. Multiple or ambiguous changes ask the user to use the form or split the request; do not partially apply a command.

Show interpreted intent, original and proposed value, resulting calculations, assumptions, and **Apply**/**Discard**. Unsupported requests such as “optimize every component” or “simulate a broken piston” explain the limitation without invented results.

Suggestions and parsed commands never bypass the normal validation and proposal workflow.

## Voice input

Use feature detection for `SpeechRecognition` / `webkitSpeechRecognition` through local TypeScript interfaces. Voice is optional transcription of commands, not Muse speech or a voice-call agent.

- User must explicitly press the microphone.
- Show listening state, transcript, stop/cancel, permission errors and unsupported-browser fallback.
- Only process final transcripts and require normal confirmation before applying.
- State before use that browser speech recognition may send audio to the browser vendor; it is not guaranteed local/offline. Offer typing with identical capabilities.
- Handle denied permission, missing microphone, no speech, network error and aborted sessions.
- Stop recognition on unmount and machine switch. Never auto-restart.
- No recording storage, upload, spoken response or background listening.

## Experiments and reporting

Each Calculate action produces an immutable baseline/candidate comparison without applying geometry changes until Apply. Repeated calculations use the same pure functions and input snapshots. No random outcomes.

Experiments display:

- machine and model version;
- input delta and source (form/typed/voice);
- baseline versus candidate power, available efficiency, stresses or displacement as applicable;
- equation traces with units;
- per-limit checks;
- model contradictions and limitations.

Candidate edits mark prior results stale; recalculate before applying. Changing configured thresholds is itself an explicit recorded input change, never a hidden route to a passing result.

Extend JSON report export with `physicsModelVersion`, machine-specific applied inputs, baseline, calculation result, and session experiment records. Keep `modelId: null` and demo provenance for diagnostic fixtures. Physics output provenance is “deterministic simplified frontend calculation,” not “synthetic measured evidence.”

## Validation and numerical behavior

All model functions validate inputs independently of form HTML constraints. Enforce finite numbers, positive denominators, integer cylinder count, ranges, required fields and machine compatibility. Never substitute zero for missing/blank required values.

Use SI internally; display kW, W, N·m, MPa, degrees, cc and percent as appropriate. Keep unrounded results for comparisons and round only at presentation. Never display NaN/Infinity. Distinguish invalid input from an exceeded configured limit and an inconsistent model operating point.

A candidate with invalid inputs cannot calculate or apply. Limit-exceeded candidates may be applied as explicit hypothetical experiments, with a warning confirmation and affected-component action. An inconsistent energy-balance scenario may be explored but cannot be labelled within valid operating limits.

## Visual and accessibility requirements

Reuse the current semantic colors, panel treatments, fonts and Lucide icons. Invoke the design-system skill before UI implementation and preserve existing visual language.

Use unit-labelled number inputs, inline validation, readable equations, keyboard-accessible tabs, visible focus and text badges in addition to color. Announce calculation/listening/error changes with polite live regions. Small screens stack equation and comparison columns; retain accessible component selection.

## Implementation sequence

1. Add pure model types, defaults, validations, equations and numerical checks.
2. Build the connected Physics/Design/Experiments panel and machine-specific session state.
3. Synchronize speed, apply visual design props and connect result/limit component selection.
4. Integrate deterministic typed command proposals into the copilot without breaking bearing replay.
5. Add optional voice transcription and explicit vendor-processing notice.
6. Extend exports and capability documentation; remove stale statements that no calculations exist.
7. Verify models, compile/build and perform available interaction checks.

## Verification and acceptance

Add a small numerical test entry point runnable with the available Node runtime's TypeScript support, keeping production model imports compatible with that runner. No new test framework is necessary. Use `node --experimental-strip-types` with the explicit test file if supported by the installed Node; inspect the runtime before choosing that invocation and document the exact command.

Required numeric cases:

- 60 rpm yields 2π rad/s.
- Torque × angular velocity gives the expected power and valid zero-speed behavior.
- Doubling solid-shaft diameter reduces shear by a factor of eight and twist by sixteen with other inputs fixed.
- Motor copper losses match `3I²R`; efficiency is bounded for consistent nonnegative inputs.
- Four-stroke displacement/power conversions are correct and engine torque remains finite at zero rpm.
- Zero fuel with positive power and output exceeding fuel input are explicit contradictions.
- Blank/nonfinite/negative/out-of-range inputs and unsupported patches are rejected.
- All three models reproduce exactly for identical input snapshots.
- Command parsing covers units, percentage changes, ambiguous commands and machine-specific restrictions.

Run `pnpm exec tsc --noEmit` and `pnpm build` after broader changes. The existing large-bundle warning is known; do not make unrelated bundle restructuring part of this feature.

Where a browser-check capability is available, verify all three machines, baseline/candidate apply/discard, geometry updates, limit exceedance, insufficient inputs, typed proposals, unsupported voice fallback, machine-switch reset behavior, JSON export, keyboard and narrow layout. Do not claim browser or microphone checks ran if unavailable.

Done means all three machines have visible, reproducible calculations and honest what-if comparisons; supported design changes update the scene; voice is optional and permission-based; no result implies live AI, validated real-world failure or guaranteed efficiency improvements.
