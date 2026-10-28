# Machine Fault Investigator — Realistic Exploded Pump–Motor Assembly: Visual PRD

> Request: *"also this machine doesn't look realistic it misses a lot of parts is it possible to make it realistic as it shows in blueprints? with all the nuts and bolts? like this blueprint just in 3D — yeah lets go along with running simulation to see how each component is working to see"*
>
> Deliverable: a photorealistic, fully-fastened 3D vertical multistage centrifugal pump + electric motor assembly (hero.png) with its motor sub-assembly (side.jpg), shown assembled, in blueprint-style exploded view, and as a running cutaway simulation in which every component visibly does its job. No part visible in either reference may be omitted, merged into a blob, or faked with texture.

## 1. Goal and visual pillars

Build one dimensionally consistent 3D machine — a vertical, motor-on-top, multistage centrifugal pump — that a viewer can (a) recognise as the exact machine in hero.png and side.jpg, (b) explode along its shaft axis to reveal every internal part including every nut, bolt, washer, O-ring, spring and bearing ball, and (c) run, with the shaft, coupling, impellers, bearings, seal and cooling fan all moving at mechanically correct relative speeds while fluid rises stage by stage. The model serves engineering-fault investigation, so a missing fastener or a merged bearing is a defect, not a simplification.

Pillars:
- **Blueprint completeness:** every callout leader in hero.png (≈38 leaders: 19 left, 19 right) and side.jpg (10 leaders) maps to at least one real, separately modelled part; the exploded view must read line-for-line against hero.png.
- **Real fasteners, real geometry:** hex heads with 6 flats, threaded shanks (helical or normal-mapped thread, visible at close zoom), hex nuts, flat washers, lock washers, circlips, O-rings as true tori — never decals, never smooth cylinders pretending to be bolts.
- **Machined-metal realism:** cast housings are slightly rough painted metal with visible parting lines and raised ribs; turned parts (shaft, sleeves, flanges) carry concentric machining marks and sharp chamfers; no plastic-looking flat shading anywhere.
- **One machine, two references:** the motor in hero.png (blue-grey) and side.jpg (sage green) is the same motor; hero.png wins for pump geometry, side.jpg wins for motor internals and bearing construction.
- **Simulation legibility:** in run mode each component's function is visible — rotation, rolling, pumping, sealing, cooling — at a glance, without labels needing to explain motion that is not there.

## 2. Reference index

| File | Shows | Authoritative for | Source |
|---|---|---|---|
| refs/hero.png (1920×1280) | Vertical exploded view of complete pump+motor, shaft axis vertical, motor at top, volute casing at bottom, on seamless light-grey studio ground | Whole-machine silhouette, part stack order top→bottom, part counts, pump colours, exploded spacing, camera; wins all conflicts about the pump | User-supplied blueprint render |
| refs/side.jpg (1920×1280) | Horizontal exploded view of the electric motor alone, shaft axis horizontal, fan cover left, bearing set right, loose fasteners below | Motor internals (fan cover, endshield, finned stator housing, terminal box, shaft/rotor, bearing construction), fastener style/count, sage-green motor colour; wins all conflicts about the motor and bearings | User-supplied blueprint render |

Colour sampling note: hex values below are base (albedo) colours derived from region-averaged pixel samples of the references (e.g. hero.png motor lit flank sampled #6F8294, shadow flank #546472 → albedo ≈ #4A627A; side.jpg fin lit #616D64, shadow #353D38 → albedo ≈ #55665A). Lit pixel values always read brighter than albedo; acceptance checks compare rendered lit colour against the sampled lit value, not the albedo.

Assumptions for parts no reference shows:
- Assembled state: neither reference shows the machine assembled. Assembled lengths are derived by collapsing hero.png exploded gaps to metal-to-metal contact in stack order; total assembled height is set to 0.54 × the exploded height (see §4.1).
- Rear of volute casing and motor: mirrored from the visible front (flange bolt circles continue at the same pitch all round; motor terminal box sits on top, as in hero.png).
- Impeller internal vane curvature: backward-curved vanes, 6 per impeller, inferred from the 6-point star silhouette visible in hero.png; vane count is checkable, exact vane angle is not claimed.
- Rotor/stator windings inside the motor are not visible in either reference; in cutaway they are shown as a standard laminated core + copper end-windings and are explicitly *not* acceptance-checked against a reference.
- Thread pitch: standard coarse metric pitch for each nominal diameter (M8×1.25, M10×1.5, M12×1.75); references show thread presence, not pitch.

## 3. Global look

- **Style:** photorealistic PBR product render, blueprint-render finish — clean machined metal, no rust, no oil stains, no scratches beyond faint machining marks; every edge chamfered or filleted (no razor CG edges). Minimum chamfer 0.002 L on turned parts, 0.004 L cast-edge fillets.
- **Palette (albedo / sampled lit value):**
  - Pump cast blue (volute, bearing bracket, diffusers): albedo #48647E, lit flank #576B7F–#6F8294 (hero.png), metallic 0.15 (painted cast iron), roughness 0.55.
  - Motor blue-grey in hero.png: albedo #4A627A, lit #6F8294, shadow #546472, metallic 0.15, roughness 0.5.
  - Motor sage green in side.jpg: albedo #55665A, lit fin #616D64–#889087, shadow #353D38, metallic 0.15, roughness 0.55. (Same motor mesh; colourway selectable, default = hero.png blue-grey so the assembled machine matches hero.png.)
  - Bright steel (shaft, sleeves, flange faces, bearing rings): albedo #B9BDC2, lit #CBCBCC (side.jpg shaft), metallic 1.0, roughness 0.28; turned finish with anisotropic-looking concentric grooves.
  - Dark steel (coupling hubs, small hardware): albedo #6E7276, lit #72767A–#7E8185 (hero.png shaft/sleeve), metallic 1.0, roughness 0.4.
  - Brass/bronze (impellers, wear rings, bearing cage): albedo #A67C3F, lit #EBD4A3 highlight / #8F744F mid (hero.png), metallic 1.0, roughness 0.35.
  - Black elastomer (O-rings, seal faces): #1C1C1E, metallic 0.0, roughness 0.6.
  - Background / ground: seamless #F0EFEF (hero.png edge sample) to #F5F5F5 (side.jpg), roughness 1.0, shadow-catcher only.
- **Lighting:** one large soft key from front-left-above (≈45° azimuth, 55° elevation, size ≈ 2× subject height) giving the soft single shadow seen in both references; cool-white fill from right at 25% of key; faint top rim; white world strength 0.55. Soft contact shadow directly under the lowest part, darkest at contact, no floating gap, shadow length ≈ 0.06 L toward back-right (matches hero.png pump shadow).
- **Camera (hero view):** front, very slightly right and above the exploded stack (the references are near-orthographic elevations, not dramatic perspectives): elevation 8° above mid-height, azimuth 12° right of front, long lens ≈ 85 mm feel (near-isometric, ≤3% perspective size difference top-to-bottom); subject fills 92% of frame height, 30% of frame width, centred on x = 0.50 of frame. Leaders/callout circles are *not* part of the 3D scene (they belong to the 2D blueprint overlay, out of scope).
- **Camera (side view):** elevation 6°, azimuth 10° right of front, 85 mm feel; exploded motor fills 88% of frame width.
- **Render:** 1920×1280 px minimum per still; PBR metallic/roughness workflow; ACES/filmic tone mapping with exposure matched so background renders #F0EFEF ± #050505; soft shadows (PCF/ray-traced), ambient occlusion in every crevice and under every washer.

## 4. Objects

Base unit: **L = 1.0 = total exploded height of the hero.png stack**, from the underside of the volute casing (y = 0) to the top of the motor terminal box (y = 1.0). All sizes are fractions of L; the shaft axis is the Y axis at (0, 0) in plan. Nominal real-world scale: L ≈ 1.55 m exploded; assembled height ≈ 0.54 L ≈ 840 mm; volute flange Ø ≈ 0.16 L ≈ 250 mm. Counts below are the minimum visible counts counted directly off the references; where a bolt circle is partially hidden, the full circle count is stated.

### 4.1 Complete pump–motor assembly (refs: hero.png — authoritative; side.jpg for motor)

Shape: a strict vertical stack of coaxial rotational parts. Reading hero.png top→bottom, the stack occupies y = 1.00 (motor top) down to y = 0.00 (casing feet); the central column is 0.10–0.17 L wide; the widest elements are the motor body (Ø 0.105 L at y ≈ 0.93), the perforated coupling guard (Ø 0.075 L at y ≈ 0.83) and the volute casing (0.20 L wide × 0.11 L high at y = 0.02–0.13). Exploded gaps between neighbouring parts are 0.008–0.025 L — parts hover in register on the axis, never offset sideways by more than 0.15 L (only the small hardware clusters sit off-axis, exactly as in hero.png).

Parts (in hero.png stack order, top → bottom):

| Part | Count | Size (in L) | Position (centre y) | Material | Notes |
|---|---|---|---|---|---|
| Motor, complete (§4.2) | 1 | Ø 0.105 × 0.115 high | 0.945 | Blue-grey painted cast (§3) | Terminal box on top 0.035×0.030×0.025; shaft stub protrudes 0.015 below |
| Coupling guard, perforated | 1 | Ø 0.075 × 0.055 high | 0.835 | Dark steel, perforated | ≥ 120 visible perforations Ø 0.004 in staggered rows; open seam at back; 4 guard screws M5 at rim |
| Coupling hub, motor side | 1 | Ø 0.048 × 0.035 | 0.845 | Dark steel | Keyway + 1 grub screw M6 |
| Coupling hub, pump side | 1 | Ø 0.048 × 0.035 | 0.795 | Dark steel | Keyway + 1 grub screw M6; elastomer spider (6-lobe, black) between hubs |
| Coupling small hardware cluster | 8 pcs | M5–M6 | y 0.80–0.86, x ±0.06–0.09 | Steel | 4 bolts, 2 dowel pins Ø0.004×0.018, 2 washers — the loose screws shown either side of the coupling in hero.png |
| Bearing bracket / lantern (blue flange housing) | 1 | Ø 0.085 flange, 0.045 high | 0.755 | Pump cast blue | 6-bolt flange circle; central bore Ø 0.038; 1 triangular side bracket with 2 bolt holes at x −0.075 (as in hero.png left) |
| Seal gland studs + nuts | 4 + 4 | M8 | 0.735 | Steel | At bracket underside, 90° apart |
| Coil springs | 5 | Ø 0.012 × 0.020 free | 0.715 | Spring steel, dark | 5 visible in hero.png row (3 centre, 1 each side); ≥ 6 helical turns each |
| O-rings, bracket/seal | 4 | Ø 0.030–0.036, cord Ø 0.003 | 0.705 | Black elastomer | True tori, sitting in register under the springs |
| Shaft sleeve (upper) | 1 | Ø 0.052 × 0.055 | 0.655 | Bright steel | The large plain cylinder right of centre in hero.png |
| Shaft (pump) | 1 | Ø 0.020 main, 0.30 long | 0.50 (spans 0.35–0.65) | Bright steel, polished | Stepped: Ø 0.014 top journal, Ø 0.024 lower boss, keyway 0.004 wide × 0.10 long, threaded top end M12×1.75 × 0.02 |
| Needle/sleeve bearings (small cylinders left column) | 2 | Ø 0.016 × 0.018 | 0.625, 0.595 | Dark steel | Ribbed outer surface (≥ 12 axial ribs) as in hero.png |
| Retaining rings / circlips | 3 | Ø 0.030–0.034 | 0.635, 0.685, 0.415 | Steel / black | Flat annuli with visible gap |
| Impellers (brass, star) | 2 | Ø 0.038 × 0.012 | 0.565, 0.525 | Brass | 6 backward-curved vanes each; hub bore keyed to shaft |
| Wear rings (brass) | 3 | Ø 0.036, cord 0.004 | 0.545, 0.505, 0.435 | Brass | Flat tori between impellers and diffusers |
| Diffuser stack (blue bowls) | 5 | Ø 0.052 × 0.016 each | 0.475 → 0.395 (pitch 0.020) | Pump cast blue | 5 stacked bowls exactly as hero.png; each with 6 internal guide vanes and a central eye Ø 0.020 |
| Bearing set, lower (races + sleeve) | 3 rings | Ø 0.048–0.055 | 0.345, 0.325, 0.305 | Bright steel + brass cage ring | Two machined race rings over one brass-ringed race (§4.3 construction) |
| Mechanical seal assembly | 1 set (≈7 pcs) | Ø 0.040 × 0.035 | 0.265 | Steel/brass/black | Rotating face, stationary face, seal spring (≥ 8 turns), 2 O-rings, drive ring — the clustered brass/steel group at hero.png y ≈ 0.24 |
| Volute pump casing | 1 | 0.20 wide × 0.13 deep × 0.11 high | 0.065 | Pump cast blue | Spiral volute body; top suction neck Ø 0.055 with flange; side discharge flange Ø 0.075 at right, inlet flange Ø 0.085 at left (both faces bright-machined); 2 casing feet |
| Casing flange bolts (per flange) | 8 + 8 | M10 hex + nut + washer | On both flange faces | Steel | Full circles, 45° pitch, heads outboard |
| Casing drain/foot bolts + loose hardware at base | 10 pcs | M8–M12 | y 0.00–0.04 | Steel | The scattered bolts/nuts/washers around the casing feet in hero.png, each a full hex+thread+washer set |

Details: flange faces show circular machining grooves; casing carries a raised cast boss and parting line at mid-height; every blue casting has a 0.004 L edge fillet and matte-cast micro-normal (roughness variation ±0.08, no orange-peel larger than 0.001 L). Nothing in the left/right small-hardware columns of hero.png (pins at y≈0.60/0.52/0.47, nuts at 0.68/0.55/0.28, bolts at 0.30/0.13) may be dropped: ≥ 18 loose fasteners float in register beside the stack in exploded view.

### 4.2 Electric motor (refs: side.jpg — authoritative; hero.png for colourway and top position)

Base unit for this section: **M = 1.0 = motor length along its shaft axis** in side.jpg exploded layout, fan cover left (x = 0) to shaft tip right (x = 1.0). Assembled motor length ≈ 0.52 M. In hero.png the same motor sits vertically, shaft down, at the top of the stack (§4.1).

Shape: horizontal-axis cylinder Ø 0.34 M with deep axial cooling fins; exploded order left→right: fan cover → rear endshield with bearing → finned stator housing (shaft/rotor protruding right) → terminal box floating above → bearing set and loose fasteners at right/below.

| Part | Count | Size (in M) | Position (centre x) | Material | Notes |
|---|---|---|---|---|---|
| Fan cowl / cover | 1 | Ø 0.36 × 0.10 deep | 0.07 | Sage green (or blue-grey) painted steel | Domed disc with concentric-ring + radial vent slots: ≥ 40 slots in 3 rings; 4 mounting lugs at 90°; 4 cowl screws M5 |
| Cooling fan (inside cowl) | 1 | Ø 0.30 × 0.05 | 0.15 | Dark polymer/steel | ≥ 9 backward blades; on shaft; visible through cowl slots and in cutaway |
| Rear endshield | 1 | Ø 0.36 × 0.09 | 0.24 | Sage green cast | Central bearing pocket Ø 0.14; 8 hex bolts M8 on Ø 0.31 circle (8 visible in side.jpg), each with washer |
| Rear bearing (in endshield) | 1 | Ø 0.13 (§4.3) | 0.24 | Steel/brass | Pressed in pocket, balls visible from inside |
| Stator housing with fins | 1 | Ø 0.34 × 0.42 long | 0.47 | Sage green cast | ≥ 24 axial cooling fins, fin height 0.025 M, pitch ≈ 0.045 of circumference; 4 tie-rod bosses; 2 feet with 4 foot holes Ø 0.03; lifting eye on top |
| Terminal box | 1 | 0.16 × 0.13 × 0.14 | 0.66, above housing (y +0.28) | Sage green cast | Hollow open box as in side.jpg, lid + 4 lid screws M5, cable gland below: brass, threaded M20×1.5, 0.05 long |
| Shaft + rotor | 1 | Ø 0.075 shaft, 0.55 long overall | 0.62 (tip at 1.0) | Bright steel shaft; laminated rotor core | Stepped shaft (3 diameters), keyway 0.02 wide at tip, threaded centre hole in tip face; rotor core Ø 0.20 × 0.30 with visible lamination lines |
| Stator windings (cutaway only) | 1 | Ø 0.30 bore | 0.47 | Copper #B87333 + slot insulation | Shown only in cutaway/run mode; not reference-checked (see §2 assumptions) |
| Front bearing set (exploded right) | 1 set | Ø 0.30 M max (§4.3 scaled) | 0.88 | Steel/brass | Housing ring top, cage + loose balls centre, assembled bearing bottom — the three-part group at right of side.jpg |
| Loose fastener group (below housing) | 11 pcs | M6–M10 | x 0.18–0.42, below | Steel | Exactly as side.jpg foreground: 3 hex bolts standing (2 with nuts threaded on), 5 hex nuts, 3 flat washers, 1 small nut — every piece hex + thread + washer-faced |

Details: fin roots filleted 0.004 M; endshield bolt heads all clocked randomly ±15° (not CG-aligned); shaft tip chamfer 0.006 M × 45°; a grease nipple on the front bearing housing. The motor nameplate is a plain 0.10 × 0.06 M plate with 4 rivets — blank (references show no legible text; no fake text may be invented).

### 4.3 Deep-groove ball bearing (refs: side.jpg — authoritative; hero.png lower bearing set)

Base unit: **B = 1.0 = bearing outer diameter**. This single parametric bearing is reused at motor rear, motor front, and (scaled) in the hero.png lower bearing set — same construction, three sizes.

| Part | Count | Size (in B) | Position | Material | Notes |
|---|---|---|---|---|---|
| Outer ring | 1 | OD 1.00 B, width 0.22 B, bore 0.86 B | Centre | Bright steel, ground | Internal raceway groove radius 0.055 B; chamfers 0.02 B |
| Inner ring | 1 | OD 0.62 B, ID 0.50 B, width 0.22 B | Coaxial | Bright steel, ground | External raceway groove; sits inside outer ring with visible 0.02 B side gap in exploded view |
| Balls | 10 | Ø 0.115 B each | On pitch Ø 0.74 B, 36° pitch | Chrome steel, roughness 0.08 | In side.jpg ≈ 5 balls are shown loose/floating beside the cage and the rest seated — exploded view must show ≥ 4 balls displaced out of the cage, assembled view all 10 seated |
| Cage (brass, two halves shown separated) | 2 halves | Annulus Ø 0.66–0.82 B, 10 pockets | Either side of ball row | Brass (§3) | The gold C-shaped split cage in side.jpg; 10 hemispherical pockets; halves riveted in assembled state |
| Bearing housing / cartridge (front) | 1 | Ø 1.06 B × 0.30 B | Around outer ring | Machined steel, brushed | 4-bolt flange (4 holes), 2 studs protruding below as in side.jpg bottom-right; top loose ring in side.jpg is this housing's cover ring |
| Seals/shields | 2 | Ø 0.84 B annulus | Both faces | Dark steel / black | Optional closed variant; open variant (references) shows balls — default open |

### 4.4 Fastener family (refs: hero.png and side.jpg — both authoritative)

Every fastener in the scene is built from this family; no other bolt style may appear.

| Fastener | Sizes used | Geometry (in head-width units) | Material | Notes |
|---|---|---|---|---|
| Hex-head bolt | M5, M6, M8, M10, M12 | Head across-flats 1.6 × thread Ø, head height 0.65 × Ø; shank with helical thread (pitch = coarse metric, §2); washer face under head; tip chamfer | Steel, roughness 0.35 | Thread must resolve as geometry or normal detail at 200% zoom — a smooth shank fails |
| Hex nut | M5–M12 | Across-flats 1.6 × Ø, height 0.8 × Ø, chamfered both faces, internal thread suggested by dark bore | Steel | 6 flats, no cylinders |
| Flat washer | For M5–M12 | OD 2.0 × Ø, ID 1.1 × Ø, thickness 0.15 × Ø | Steel | Present under ≥ 90% of bolt heads and nuts in exploded view, as scattered in both references |
| Spring/lock washer | M8, M10 | Split ring, offset ends | Dark steel | On casing flange bolts |
| Grub/set screw | M6 | Socket hex recess 0.5 × Ø | Dark steel | Coupling hubs only |
| Stud + 2 nuts | M8 | For seal gland and bearing housing | Steel | §4.1, §4.3 |

Total fastener budget for the full exploded assembly: ≥ 120 individual fastener pieces (bolts, nuts, washers, pins, screws), each independently modelled and each flying to its own hole in the assemble animation. Hero.png alone shows ≈ 45 loose or visible fasteners; side.jpg shows 11 in the foreground group plus 8 endshield bolts plus cowl screws — the model must meet or exceed both counts simultaneously.

## 5. Simulation and interaction

This section replaces the template's games section: the deliverable is a working-machine simulation, not a game.

- **Modes:** (1) Assembled — machine whole, hero.png camera; (2) Exploded — parts separated along the shaft axis to the exact hero.png spacing, slider or toggle, 1.2 s ease-in-out travel per part, staggered top-to-bottom; (3) Run — assembled (or 50% exploded) with cutaway; (4) Cutaway toggle independent of mode: front quarter of volute, diffusers, motor housing and bearing housings clipped so internals are visible.
- **What moves in Run mode, and how fast (shaft speed = 1.0× reference, default 2900 rpm visualised slowed to 240°/s so motion is readable, with a true-speed toggle):**
  - Shaft, coupling hubs + spider, rotor, cooling fan: rotate together at 1.0× — one rigid speed group, no relative slip.
  - Impellers (×2): rotate with shaft at 1.0×; fluid particles enter the volute neck axially, are flung radially in each impeller eye, rise through all 5 diffuser bowls in sequence, and exit the side discharge flange — particle speed increases 1.6× at each impeller exit (visible acceleration per stage), loop ≥ 200 particles.
  - Bearing balls (every bearing): orbit the shaft axis at 0.42× shaft speed (cage speed) while spinning on their own axes; cage halves rotate with the balls at 0.42×; inner ring at 1.0×, outer ring stationary — the three speeds must be simultaneously distinguishable in a 5 s observation.
  - Mechanical seal: rotating face turns at 1.0× against the stationary face; a 0.001 L fluid film sheen is visible at the interface in cutaway; seal spring rotates with the shaft group.
  - Cooling fan + airflow: fan at 1.0×; faint airflow streaks (≥ 30) enter the cowl slots and exit along the housing fins.
  - Motor electricals (cutaway only): a rotating field indicator sweeps the stator at 1.03× shaft speed (visible slip), so the rotor visibly *almost* keeps up — the one deliberate non-rigid motion.
- **Fault-investigation hooks (the product's purpose):** clicking any part in any mode selects it (outline + name + spec readout); three preset faults must be demonstrable — (a) worn bearing: selected bearing's balls orbit with 8% radial wobble and cage speed drops to 0.35×; (b) seal leak: particle stream escapes at the seal gland at 12% of main flow; (c) blocked impeller stage: stage-3 diffuser particles stall and recirculate. Each fault affects *only* its component's motion — everything else keeps correct motion, so the fault is diagnosable from behaviour.
- **Controls:** orbit (drag), zoom (wheel, to 200% fastener close-up without clipping), pan; Explode slider 0–100%; Run/Pause; speed slider 0.1×–2×; Cutaway toggle; Fault menu (None / Bearing wear / Seal leak / Blocked stage 3); Part labels toggle (leader lines echoing the blueprint callouts, text = part names from §4).
- **States:** load → Assembled (static, hero framing) → any mode; a persistent mode bar shows current mode, shaft rpm and selected part. No start screen, no score, no game-over — this is an instrument.
- **Feedback:** selected part pulses once (150 ms, teal #0E6B5E outline at 60% opacity — the host app's accent); faulted part carries a steady amber #B45309 marker dot (the host app's suspect colour) until cleared; motion never uses screen shake or decorative easing.

## 6. Technical constraints

- **Tool/engine:** three.js (WebGL) in the host app for interactive modes, PBR metallic/roughness materials, ACES tone mapping; geometry generated procedurally (lathe/extrude/custom) — no external model files. A Blender/Cycles offline render of the same proportions is acceptable for the static hero still if pixel-matched to §3, but the interactive simulation is the primary deliverable.
- **Required outputs:** interactive scene at the host app's existing 3D viewport; still renders `visual-plan/renders/hero-exploded.png` (hero.png framing), `visual-plan/renders/motor-exploded.png` (side.jpg framing), `visual-plan/renders/assembled.png` — each 1920×1280.
- **Geometry budget:** ≤ 1.2 M triangles total scene; any single bearing ≤ 60 k tris; fastener threads may use normal maps below 0.5 m viewing distance but must be true helical geometry at close zoom range. Explode/run animation must hold 60 fps on an integrated-GPU laptop at 1920×1080; particle system ≤ 500 instances.
- **Determinism:** part names in code must match §4 names exactly (e.g. `diffuser_3`, `bearing_front.ball_07`, `bolt_M10_casing_flange_04`) so an acceptance failure maps to the object that owns it.
- **Accessibility/motion:** `prefers-reduced-motion` pauses rotation and explode animation at the current state; all controls keyboard-reachable.

## 7. Work breakdown

1. Camera, framing, ground/background (#F0EFEF shadow-catcher), 3-point lighting rig; grey placeholder stack of 8 cylinders matched to §4.1 proportions.
2. Primary forms: volute casing with both flanges, finned motor housing, bearing bracket — silhouette check against hero.png.
3. Rotating group: stepped shaft, coupling hubs + spider + guard, 2 brass impellers, 5 diffuser bowls.
4. Bearing factory (§4.3): one parametric bearing (rings, 10 balls, split brass cage, housing), instanced at front/rear motor and pump lower set; seal assembly.
5. Fastener factory (§4.4): hex bolt/nut/washer/stud generator with true threads; populate all bolt circles and the ≥ 18 loose hero.png hardware pieces + 11 side.jpg foreground pieces.
6. Materials and colours per §3; machining-groove and cast micro-normal detail.
7. Explode system (per-part target offsets = §4 positions), assemble reverse, labels.
8. Run simulation: speed groups (1.0× / 0.42× cage / 0× outer / 1.03× field), stage-by-stage fluid particles, fan airflow, cutaway clipping.
9. Fault presets (bearing wobble, seal leak, blocked stage 3), part picking/readout; final render settings and the three required stills.

## 8. Acceptance criteria

Each criterion is checked in a render or a 5 s run-mode observation, against the named reference. One criterion checks one thing.

- AC-01 (hero.png): In the hero-exploded still, the stack reads top→bottom in the exact hero.png order — motor, coupling guard/hubs, bearing bracket, springs/O-rings, sleeve, shaft, impellers, 5 diffusers, bearing set, seal, volute — with no part missing and no part added.
- AC-02 (hero.png): Exactly 5 blue diffuser bowls are stacked above the volute; counting them in the render gives 5, not 4 or 6.
- AC-03 (hero.png): Exactly 2 brass star impellers sit above the diffuser stack, each showing 6 vanes.
- AC-04 (hero.png): The motor at top is Ø 0.105 ± 0.01 L and the volute at bottom is 0.20 ± 0.015 L wide; the whole stack height ÷ volute width = 5.0 ± 0.3.
- AC-05 (hero.png): Pump castings render lit-flank colour #576B7F ± #0A0A0A and brass renders highlight #EBD4A3 ± #101008 under the §3 lighting (sampled in the render, not the material editor).
- AC-06 (hero.png): ≥ 18 loose fasteners (bolts, nuts, washers, pins) float beside the stack in exploded view, matching the left/right hardware columns of hero.png in type and approximate height.
- AC-07 (hero.png): The perforated coupling guard shows ≥ 120 individual perforations as real holes (light passes through in a backlit check), not a dot texture.
- AC-08 (side.jpg): In the motor-exploded still, exploded order left→right is fan cowl, rear endshield, finned housing with protruding shaft, terminal box above, bearing group right, fastener group below — matching side.jpg positions within 0.05 M.
- AC-09 (side.jpg): The rear endshield carries exactly 8 hex bolts on its bolt circle, each with a washer; heads are 6-flat hexagons at 200% zoom.
- AC-10 (side.jpg): The finned housing shows ≥ 24 axial fins; the shaft is stepped in 3 diameters with a keyway at the tip and a centred hole in the tip face.
- AC-11 (side.jpg): The foreground loose group contains exactly 11 pieces (3 bolts, 6 nuts/nut-on-bolt units counted as shown, 3 washers, 1 small nut as itemised in §4.2) — a viewer can count 11 separate pieces.
- AC-12 (side.jpg): The front bearing group shows all three sub-assemblies — housing/cover ring, split brass cage with ≥ 4 displaced loose balls (Ø 0.115 ± 0.01 B), and one assembled bearing with 10 balls seated on a Ø 0.74 ± 0.02 B pitch circle.
- AC-13 (side.jpg): Motor sage-green colourway renders lit-fin #616D64 ± #0A0A0A; switching to hero.png colourway renders #6F8294 ± #0A0A0A, with no geometry change.
- AC-14 (hero.png + side.jpg): At 200% zoom on any bolt (one from hero.png casing flange, one from side.jpg endshield), thread turns are visible as geometry/normal relief and the nut shows 6 flats with chamfered faces; a smooth-shanked bolt fails.
- AC-15 (hero.png): Explode slider at 100% reproduces hero.png exploded gaps (neighbouring-part gaps 0.008–0.025 L, all parts on-axis within 0.15 L); at 0% every flange face, washer and O-ring is in contact with no visible gap and no interpenetration.
- AC-16 (hero.png): Soft contact shadow sits directly under the volute with no floating gap, on a background rendering #F0EFEF ± #050505, in the hero framing (stack fills 92% ± 3% of frame height).
- AC-17 (run mode, vs side.jpg bearing): In a 5 s observation of the front bearing, inner ring + balls' cage orbit at 0.42 ± 0.03× shaft speed while the outer ring is stationary and balls remain seated in cage pockets.
- AC-18 (run mode, vs hero.png): Fluid particles enter at the volute neck, accelerate at each of the 2 impellers, pass through all 5 diffuser stages in order, and exit the side discharge flange; no particle skips a stage.
- AC-19 (run mode, vs side.jpg): The cooling fan rotates at shaft speed behind the cowl and airflow streaks enter through the cowl slots (≥ 40 slots visible) and travel along the fins.
- AC-20 (faults): With Bearing wear selected, only that bearing wobbles (8% radial) and slows to 0.35× cage speed; with Seal leak, particles escape only at the seal gland; with Blocked stage 3, particles recirculate only in diffuser 3 — in each case all other components keep AC-17/AC-18 motion.
- AC-final (hero.png, then side.jpg): Side by side with each reference in turn, a viewer identifies the render as the same machine in the same exploded arrangement, and a fastener-by-fastener spot check (5 random callouts per reference) finds every nut, bolt, washer, ball and O-ring present and modelled — no major visible difference remains.

## Polish round 1

Differences are merged from [accept-r1-shape.md](reviews/accept-r1-shape.md) and [accept-r1-look.md](reviews/accept-r1-look.md), duplicates removed, highest impact first. The code owner is the part or block in [assembly.ts](../frontend/src/assembly.ts) that owns each difference. Callout circles and leader lines stay out of scope: PRD §3 assigns them to the 2D blueprint overlay, not the 3D scene, so the "31 callouts" shape note is not a 3D geometry item. Where the reviews ask for a horizontal motor at the top and PRD §4.1/§4.2 requires the same motor coaxial and vertical (shaft down) in the pump stack, the PRD stack order wins; the motor stays vertical and its proportions, fins and terminal box are corrected in place.

### Framing, silhouette and missing or added parts

- [major] Framing and camera: the subject filled ~57% of frame height and ~18% of frame width from a dead-front 0° elevation, against 92% ± 3% of frame height at azimuth 12° right, elevation 8° above mid-height, near-orthographic (≤3% top-to-bottom size difference). Owner: `initAssembly` camera setup and `frameCamera()` in `assembly.ts` (perspective camera, its position and controls target).
- [major] Tie rods added: 4 full-height tie rods flanked the stack (~45% of assembly height) where the references show none. Owner: `buildPump` staybolt block (`staybolt` part). Fix: no full-height rods; only short flange studs, nuts and washers at the bracket and volute flange zones remain.
- [major] Base plate added: a dark-grey base plate ~110% of casing width sat under the volute where the references show volute feet only. Owner: `buildPump` mounting-base block (`mounting-base` part) and the volute parting-line plate. Fix: plate removed; casing feet and foot bolts only.
- [major] Motor silhouette: a smooth vertical cylinder with a flat cap and a small side terminal box, where the references show a compact finned housing (length ~1.1× diameter), stepped end rings, dense axial cooling fins and a top terminal box. Owner: `buildPump` motor block (`motor` part). Fix: 28 axial fins, stepped endshields, terminal box moved to the top.
- [major] Central shaft mostly hidden (~5% of assembly height exposed) against an exposed stepped shaft (~22%, bright steel, with keyway and threaded top). Owner: `buildPump` shaft block (`shaft` part) and shaft-sleeve block (`sleeve` part). Fix: shorter sleeve, brighter and slightly thicker stepped shaft so the exposed column reads between sleeve and seal.
- [major] Volute casing read as a front-symmetric barrel with coaxial side nozzles, against a three-quarter spiral volute with a top suction neck, left inlet flange and front-right discharge flange. Owner: `buildPump` volute block (`suction-discharge-base` part), corrected together with the 12° camera azimuth so flange faces show depth.
- [major] Diffuser stack counted 4 visible bowls against exactly 5 stacked bowls. Owner: `buildPump` chamber block (`chamber` part, `DIFF_Y`). Fix: five bowls on a wider pitch with a distinct rim and O-ring gap per bowl.
- [major] Impellers read as 2 flattened discs with no vane relief, against 2 brass star impellers with 6 backward-curved vanes each and clear separation. Owner: `buildPump` impeller block (`impeller` part). Fix: thinner discs, taller protruding vanes, wider stage separation, distinct wear rings.
- [major] Coupling guard showed ~30 dark dots on a solid drum, against ≥120 real perforations in staggered rows in the guard plus 2 coupling hubs with an elastomer spider. Owner: `buildPump` coupling and guard blocks (`coupling-half`, `coupling-guard` parts, `makePerfTexture`). Fix: denser staggered perforation alpha texture so light passes through the holes.
- [major] Bearing set read as plain grey rings with no balls or cage, against a parametric deep-groove bearing (ground rings, 10 balls, split brass cage). Owner: `makeBearing` factory and the `bearing-housing` / `bearing-cage` / `bearing-balls` parts in `buildPump`. Fix: displaced loose balls added beside the seated set in exploded view.
- [major] Mechanical seal read as a single ring pair, against a ~7-piece seal set (rotating and stationary faces, ≥8-turn spring, 2 O-rings, drive ring, gland studs and nuts). Owner: `buildPump` seal block (`shaft-seal` part).
- [moderate] Springs read as 4 coils in one row and no O-rings in register, against 5 coil springs (≥6 turns) plus 4 black O-ring tori in register under the bracket. Owner: `buildPump` sleeve block (`sleeve` part, `spring` and `oring` helpers). Fix: larger 7-turn springs and a fourth O-ring.
- [moderate] Perforated coupling drum was compressed (~4% of assembly height) under the motor, against ~6% of assembly height. Owner: `coupling-guard` part in `buildPump`. Fix: taller guard drum.
- [moderate] Fasteners floated scattered at random heights and angles, against ≥18 loose fasteners in left and right register columns at 0.008–0.025 L exploded gaps, grouped adjacent to flange zones, plus full hex bolt circles on every flange. Owner: `buildPump` loose-hardware block (`loose-hardware` part) and the `bolt` / `nut` / `washer` fastener factory. Fix: loose hardware re-registered into two columns aligned to the volute, diffuser, bracket and coupling heights.
- [moderate] Exploded gaps were uneven, with hardware floating far off-axis, against uniform 0.008–0.025 L neighbour gaps and all coaxial parts on-axis. Owner: per-part `explodeX` / `explodeY` values passed to `makePart` throughout `buildPump`.

### Colour and material

- [major] Pump and motor cast blue rendered light powder blue (~#7FB0DC–#8FB9E2 lit flank, ~30% too light) against lit flank #576B7F–#6F8294 with albedo #48647E / #4A627A. Owner: `COL` palette, the `blue` / `motorBlue` materials in `buildPump`, and scene environment and exposure in `initAssembly`. Fix: darker cast albedo and reduced environment intensity and exposure.
- [moderate] Bright steel rendered flat matte mid-grey with no machined reflection, against metallic 1.0, roughness 0.28, lit #CBCBCC with concentric machining grooves. Owner: `MAT_STEEL` and the `steel` material in `buildPump`. Fix: lower roughness and flange-face groove rings.
- [moderate] Dark steel rendered as uniform flat grey plastic, indistinguishable from painted castings, against metallic 1.0, roughness 0.40, lit #72767A–#7E8185. Owner: `MAT_DARK` in the fastener factory section.
- [moderate] Brass rendered flat mustard with no metallic highlight, against albedo #A67C3F with highlight #EBD4A3 and mid #8F744F, including 3 brass wear rings between impellers and diffusers. Owner: `MAT_BRASS` and the impeller wear rings in `buildPump`.

### Lighting, shadow and background

- [major] Ground shadow was a hard-edged dark blob extending ~0.30 L to the right of the volute with detached splatter blobs, against a soft contact shadow directly under the volute, darkest at contact, ~0.06 L toward back-right. Owner: key light, shadow settings and `ShadowMaterial` ground in `initAssembly`. Fix: higher, softer key and a tighter, lighter contact shadow; removing the base plate (above) removes the splatter source.
- [moderate] Lighting was flat ambient with no ambient occlusion or rim separation, against a large soft key from front-left-above, cool fill from the right at 25% of key, faint top rim and white world 0.55. Owner: hemisphere, key, fill and rim lights in `initAssembly`.
- [minor] Background rendered warm off-white (~#F3F1EE), against seamless #F0EFEF ± #050505. Owner: `scene.background` in `initAssembly`.

### Detail

- [moderate] Flange faces were plain flat discs with no bolt circles or machining grooves, against 8 M10 hex bolts with nuts and washers per casing flange on a 45° pitch circle, machining grooves on every flange face and a 6-bolt circle on the bearing bracket. Owner: volute and bracket flange code in `buildPump`. Fix: groove rings added to flange faces; bolt circles already present and retained.
- [moderate] All cast edges were razor-sharp low-poly facet junctions, against smooth-shaded castings with 0.004 L edge fillets and cast micro-normal roughness variation. Owner: casting geometries in `buildPump` (diffuser bowls, volute, bracket, motor housing). Partially addressed by higher segment counts and rim tori; true fillets remain a known gap.
- [moderate] Terminal box internals from side.jpg (hollow box, lid, 4 lid screws, brass M20 gland below) were only a solid side box. Owner: motor block in `buildPump`. Fix: top terminal box with lid, 4 lid screws and brass gland.
- [minor] Motor-to-volute width ratio read ~1:1.4 with the motor too narrow, against motor Ø 0.105 L versus volute 0.20 L wide (ratio ~1:1.9) and total stack height ÷ volute width = 5.0 ± 0.3. Owner: motor and volute dimensions in `buildPump`, checked after the framing fix.
