# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hackathon judges and demo viewers deciding whether this agentic
diagnosis approach is credible. They watch a short demo, probe the live
workspace, and check that claims are backed by inspectable evidence.

Secondary (product fiction + real utility): a maintenance technician
diagnosing a motor-and-bearing assembly or pump from vibration recordings,
photos, and manuals on a local machine beside the equipment.

## Product Purpose

A local AI investigation workspace: the technician supplies a vibration
recording or symptom, the system consults cited documentation, runs
numerical analyses, explains the evidence, and highlights suspected
components in interactive 3D. Success for the hackathon: a runnable local
app, an honest evaluation report (including negative results), and a demo
that shows the agent's actual work, not a scripted success.

## Positioning

The agent that shows its work: every number comes from a tool result,
every manual claim carries a verifiable citation, abstention beats a
confident wrong answer, and the evaluation reports the agent losing to
the baseline where it does. A neighboring demo could not truthfully copy
the "0 unsupported claims" standard or the published miss analysis.

## Operating Context

Solo developer, local laptop, localhost only. Meta `muse-spark-1.3` via
Responses API on credits (no paid overage). Paderborn bearing recordings
and vendor manuals stay local-only; only excerpts, registries, and
playbooks are committed. Deadline: Nov 4 6pm London. Demo: select
recording -> investigate -> inspect evidence -> explode 3D -> freeze ->
reveal documented fault.

## Capabilities and Constraints

Confirmed: bounded single-agent vibration investigations with 8 tool-call
cap; supervisor + vision/sound/chat specialists for turn-based assist;
manual-to-pack builder with user Q&A and auto-finalize bar; guided
verification checklists from playbooks; sandbox inventory copilot (no
real ordering); registry-driven 3D for rig, pump, and drafted machines.

Constraints: API key server-side; no DB beyond SQLite inventory; no
vector service; schematic 3D labeled not-to-scale; failure modes only
from manual text; labels never in agent inputs.

Undecided: vision top-1 photo gate (no labeled photo set yet);
dimension-accurate geometry (deferred stage).

## Brand Commitments

Name: Machine Fault Investigator. Existing accents: deep teal and amber
on neutral surfaces; 3D suspect highlight in amber. User made binding:
shadcn/ui design language for the refresh; a dedicated hero page. Voice:
plain, honest, engineering-direct; no superlatives, no hype.

## Evidence on Hand

- `evals/results.jsonl`: 528 evaluation rows; honest negative result
  (agent 10/60 vs fixed 22/60 on final split), 0 unsupported claims.
- `docs/demo-script.md`: demo narrative (video not yet recorded).
- `packs/`: rig (7 components) + Grundfos CR pump (58 components,
  30 playbook checks) registries with manual-grounded roles.
- Live workspace: investigation traces, evidence plots, 3D assembly,
  assistant chat, guided checks, inventory sandbox.
- Absent: demo video, labeled photo set, machines #3/#4. Do not fabricate.

## Product Principles

1. Evidence over assertion: every displayed claim traces to a tool
   result, citation, or recorded run.
2. Abstention is a feature: insufficient evidence ends in an explicit
   request, never a guess.
3. The manual carries the truth: registries, roles, and remedies come
   from documentation, not invention.
4. Local and inspectable: runs on localhost, replays saved traces,
   keeps raw data out of the repo.
5. Report the misses: negative results ship in the evaluation, not in
   a footnote.

## Accessibility & Inclusion

Keyboard-accessible component list and controls; aria-pressed states;
reduced-motion support for 3D pulse and transitions. No product-specific
standard beyond standard web practice.
