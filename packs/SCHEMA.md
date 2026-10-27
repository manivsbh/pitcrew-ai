# Machine-pack schema (expansion Phase 2)

A **machine pack** is the committed, label-safe knowledge unit for one machine.
Raw manuals stay local-only under `data/manuals/` (git-ignored, copyrighted);
only short excerpts, structured registries, and playbooks are committed.

## Layout

```
packs/<machine>/
  pack.json         # machine id, name, kind, sources[], created
  excerpts/*.md     # one file per manual section; see format below
  components.json   # component registry: every modelled part + its role
  playbooks.json    # guided verification playbooks (symptom -> checks)
  inventory.json    # (Phase 6) orderable parts; schema reserved, file optional
  scenarios.json    # run-simulation fault scenarios (part refs + effects)
  assembly.json     # real-world assembly order (steps + captions)
```

## scenarios.json

Array of:

```json
{
  "id": "outer-ring-damage",
  "label": "Outer-ring damage",
  "illustrative": false,
  "parts": ["ring_outer"],
  "slow": 0.85,
  "wobble": 0.6,
  "note": "Outer raceway damage raises energy at the outer-ring fault frequency.",
  "source": "Evaluation label"
}
```

Rules:

- `parts` must resolve to component ids (empty = healthy baseline).
- `slow` in (0, 1]: motion speed factor during the fault.
- `wobble` in [0, 1]: vibration amplitude on affected parts.
- `illustrative: true` marks simulations with no measured data behind
  them (all pump scenarios); the UI must label them as illustrative.

## assembly.json

```json
{
  "source": "CR-H service manual, Reassembly Procedures pp. 11-19",
  "order": [{"parts": ["base-oring", "suction-discharge-base"],
             "caption": "Seat the base O-ring into the base groove."}]
}
```

Rules: every component id appears in exactly one step; captions cite
the manual step or torque where one exists. Machines without this file
fall back to parents-first order with generated captions.

## pack.json

```json
{
  "machine": "cr-pump",
  "name": "Grundfos CR vertical multistage centrifugal pump",
  "kind": "pump",
  "created": "2026-10-27",
  "sources": [
    {"title": "...", "publisher": "...", "doc": "...",
     "file": "data/manuals/grundfos-6135.pdf", "pages": "4-34",
     "note": "local-only reference; excerpts committed under fair use"}
  ]
}
```

## Excerpts

Each `excerpts/*.md` starts with:

```md
# <section title>

> Source: <manual short title>, section <n>, manual pp. <a-b>.
> (File: data/manuals/<file>, PDF pp. <a-b>.)
```

followed by cleaned, label-free section text. Tables preserved as text.

## components.json

Array of:

```json
{
  "id": "impeller",
  "name": "Impeller (stage)",
  "pos": "49",
  "parent": "chamber-stack",
  "qty": "1 per stage",
  "role": "Adds head to the fluid at this stage; stacked impellers sum to rated head.",
  "role_source": "manual",
  "service_ref": "CR Service Manual, Order of Stage Assembly p. 20",
  "failure_modes": ["clogged passage", "wear"],
  "failure_source": "manual §19"
}
```

Rules:

- `id` unique; `parent` must resolve to another component or `null` (root).
- `role` is required and non-empty: what this part does in the machine.
- `role_source`: `manual` (stated or directly implied by manual text) or
  `standard` (widely documented construction, not in our excerpts).
- `failure_modes` only from manual troubleshooting text (`failure_source` cites it);
  never invent failure modes.

## playbooks.json

Array of:

```json
{
  "id": "pump-no-run",
  "symptom": "The pump does not run.",
  "source": "I&O manual §19 problem 1",
  "checks": [
    {"id": "power", "ask": "Is there voltage at the motor terminal box?",
     "how": "Check voltage at motor terminal box; if none, check starter panel for tripped circuits.",
     "expect_ok": "rated voltage present",
     "if_ok": "next: fuses",
     "if_bad": "Reset tripped circuits, then re-check.",
     "severe": false}
  ]
}
```

Rules:

- Every check has `ask`, `if_ok`, and `if_bad`: the "looks OK, switch to
  another" branch is mandatory, never implied.
- `how` cites the manual remedy; `severe: true` marks checks needing
  lockout/power-off first (from manual DANGER/WARNING text).

## Leakage gate for packs

The V1 `docs-pack` gate bans all fault vocabulary because its agent inputs
feed the bearing eval. Packs serve different machines with no eval labels, so
troubleshooting language (`defective`, `worn`, `clogged`, `blown`) is allowed.
The pack gate bans only:

1. Paderborn bearing IDs (`K001`, `KA04`, ...).
2. Eval verdict phrases (`inner-ring damage`, `outer-ring damage`, `healthy
   reference` as a verdict).

`scripts/ingest_manual.py validate` enforces this plus all structural rules.
