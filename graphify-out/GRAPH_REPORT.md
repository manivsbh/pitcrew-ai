# Graph Report - machine-fault-investigator  (2026-10-27)

## Corpus Check
- Corpus is ~17,534 words - fits in a single context window. You may not need a graph.

## Summary
- 406 nodes · 878 edges · 16 communities (14 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Agent Loop & CLI Entry
- Vibration Analysis Core
- Recording Registry & Uploads
- Test Fakes & Fixtures
- Frontend API Client
- Evidence Series & Traces
- Eval Corpus & Hashes
- Frontend Dependencies
- Docs Store & Acquisition
- Agent Tools & Evidence
- 3D Assembly Viewer
- TypeScript Config
- Favicon Artwork
- Icon Sprite Sheet
- Vendor Type Shims

## God Nodes (most connected - your core abstractions)
1. `Store` - 26 edges
2. `run()` - 24 edges
3. `el()` - 17 edges
4. `compilerOptions` - 16 edges
5. `FakeStore` - 16 edges
6. `load_recording()` - 14 edges
7. `DocsStore` - 14 edges
8. `FakeDocs` - 14 edges
9. `save_trace()` - 11 edges
10. `execute()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `References Do Not Transfer Across Bearings (Root Cause)` --semantically_similar_to--> `Derived Sampling Rate Rule (1% Deviation)`  [INFERRED] [semantically similar]
  evals/analysis.md → docs-pack/excerpts/sampling.md
- `Abstention / insufficient_evidence` --semantically_similar_to--> `Evaluation Metrics (Balanced Accuracy, Abstention)`  [INFERRED] [semantically similar]
  docs/demo-script.md → evals/README.md
- `_run_job()` --indirect_call--> `refs()`  [INFERRED]
  backend/app/main.py → tests/_fakes.py
- `one()` --indirect_call--> `refs()`  [INFERRED]
  scripts/run_eval.py → tests/_fakes.py
- `test_loop_happy_path()` --calls--> `run()`  [EXTRACTED]
  tests/test_agent.py → backend/app/agent.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Arm Evaluation Flow** — machine_fault_investigator_evals_readme_three_arm_comparison, machine_fault_investigator_evals_protocol_frozen_protocol, machine_fault_investigator_evals_report_evaluation_report, machine_fault_investigator_evals_analysis_agent_did_not_beat_fixed [EXTRACTED 1.00]
- **Label-Free Investigation Pipeline** — machine_fault_investigator_docs_pack_readme_documentation_pack, machine_fault_investigator_data_readme_label_leakage_rule, machine_fault_investigator_docs_pack_excerpts_test_rig_6203_geometry_bearing_6203_geometry, machine_fault_investigator_evals_protocol_investigate_arm [INFERRED 0.85]
- **Demo Investigation Flow** — machine_fault_investigator_docs_demo_script_demo_script, machine_fault_investigator_frontend_index_frontend_ui, machine_fault_investigator_docs_demo_script_freeze_and_reveal, machine_fault_investigator_docs_demo_script_abstention_insufficient_evidence [EXTRACTED 1.00]

## Communities (16 total, 2 thin omitted)

### Community 0 - "Agent Loop & CLI Entry"
Cohesion: 0.08
Nodes (26): _accumulate(), default_client_factory(), _is_retryable(), new_investigation_id(), run(), model_api_key(), DocsStore, append_result() (+18 more)

### Community 1 - "Vibration Analysis Core"
Cohesion: 0.09
Nodes (25): Channel, envelope_spectrum(), fault_frequencies(), g_to_ms2(), load_recording(), match_peaks(), parse_filename(), psd_welch() (+17 more)

### Community 2 - "Recording Registry & Uploads"
Cohesion: 0.09
Nodes (12): save_trace(), Store, test_agent_view_has_no_bearing_code(), needs_sample(), test_evidence_recompute_deterministic(), test_import_waveform_and_evidence_roundtrip(), needs_sample(), sine_csv() (+4 more)

### Community 3 - "Test Fakes & Fixtures"
Cohesion: 0.12
Nodes (23): FakeDocs, FakeStore, refs(), synth_recording(), Call, ctx(), Resp, StubClient (+15 more)

### Community 4 - "Frontend API Client"
Cohesion: 0.15
Nodes (32): api, Finding, labelForCase(), Step, Trace, buildComponentList(), clearError(), el() (+24 more)

### Community 5 - "Evidence Series & Traces"
Cohesion: 0.10
Nodes (21): load_trace(), _decimate(), series_for(), waveform(), cases(), create_investigation(), evidence_series(), _hashes() (+13 more)

### Community 6 - "Eval Corpus & Hashes"
Cohesion: 0.06
Nodes (28): Bearing Archives SHA256 Hashes (K001-KB23), Bearing Splits (Dev/Validation/Final), scripts/fetch_sample.py Acquisition, Abstention / insufficient_evidence, Demo Script (7 Beats), Freeze & Reveal Documented Fault, Filename Encoding N/M/F Codes, Operating Conditions (4 Fixed Settings) (+20 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (22): dependencies, plotly.js-dist@^4.1.2, three@^0.186.1, devDependencies, @types/plotly.js@^3.0.15, @types/three@^0.186.0, typescript@~7.0.2, vite@^8.3.5 (+14 more)

### Community 8 - "Docs Store & Acquisition"
Cohesion: 0.15
Nodes (7): main(), sha256_of(), main(), download(), main(), sha256_of(), unrar_tool()

### Community 9 - "Agent Tools & Evidence"
Cohesion: 0.25
Nodes (12): _err(), EvidenceStore, execute(), _ok(), _ref_dicts(), _t_analyze(), _t_compare(), _t_docs() (+4 more)

### Community 10 - "3D Assembly Viewer"
Cohesion: 0.14
Nodes (10): AssemblyHandle, COMPONENTS, initAssembly(), materialsOf(), repaint(), SELECTED, std(), SUSPECT (+2 more)

### Community 11 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 12 - "Favicon Artwork"
Cohesion: 0.43
Nodes (7): Alpha Mask Bolt Silhouette, Blurred Aurora Gradient Fill, Machine Fault Investigator Favicon, Machine Fault Investigator Frontend, Gaussian Blur Filters (b-p), Purple Lightning Bolt Glyph, Violet and Blue Color Palette (#863bff, #7e14ff, #ede6ff, #47bfff)

### Community 13 - "Icon Sprite Sheet"
Cohesion: 0.43
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social Icon, Icons SVG Sprite Sheet, X Icon

## Knowledge Gaps
- **11 isolated node(s):** `scripts/fetch_sample.py Acquisition`, `Bearing Archives SHA256 Hashes (K001-KB23)`, `Filename Encoding N/M/F Codes`, `Freeze & Reveal Documented Fault`, `Submission Checklist` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 123 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Store` connect `Recording Registry & Uploads` to `Agent Loop & CLI Entry`, `Vibration Analysis Core`, `Test Fakes & Fixtures`, `Evidence Series & Traces`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Store` (e.g. with `Channel` and `Recording`) actually correct?**
  _`Store` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `scripts/fetch_sample.py Acquisition`, `Bearing Archives SHA256 Hashes (K001-KB23)`, `Filename Encoding N/M/F Codes` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Loop & CLI Entry` be split into smaller, more focused modules?**
  _Cohesion score 0.08055152394775036 - nodes in this community are weakly interconnected._
- **Why does `run()` connect `Agent Loop & CLI Entry` to `Agent Tools & Evidence`, `Recording Registry & Uploads`, `Test Fakes & Fixtures`, `Evidence Series & Traces`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Vibration Analysis Core` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._
- **Why does `DocsStore` connect `Agent Loop & CLI Entry` to `Docs Store & Acquisition`, `Recording Registry & Uploads`, `Test Fakes & Fixtures`, `Evidence Series & Traces`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._