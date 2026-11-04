/* Typed wrappers for the backend API (same origin). */

export interface Step {
  turn: number;
  type: 'tool' | 'text';
  tool?: string;
  args?: any;
  status?: string;
  summary?: string;
  artifacts?: string[];
  text?: string;
}

export interface Finding {
  hypothesis: string;
  component: string;
  evidence_ids: string[];
  reasoning: string;
  contradictions: string;
  next_measurement: string;
}

export interface Trace {
  investigation_id: string;
  recording_id: string;
  status: string;
  steps: Step[];
  finding?: Finding;
  incomplete_reason?: string;
  evidence?: Record<string, any>;
  usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
  latency_s?: number;
  model_id?: string;
  prompt_version?: string;
  mode?: string;
  harness_version?: string;
}

export interface TraceSummary {
  investigation_id: string;
  recording_id: string;
  status: string;
  mode: string;
  hypothesis: string | null;
  component: string | null;
  latency_s?: number;
  n_steps: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
  const body = (await r.json()) as T & { error?: string };
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new Error(String(body.error));
  }
  return body;
}

export interface DemoAsset {
  category: string;
  filename: string;
  url: string;
}

export const api = {
  cases: () => req<{ cases: string[] }>('/api/cases'),
  importCase: (c: string) =>
    req<{ recording_id: string; display_label: string }>('/api/recordings/import', {
      method: 'POST',
      body: JSON.stringify({ case: c }),
    }),
  waveform: (rid: string, maxPoints = 8000) =>
    req<any>(`/api/recordings/${rid}/waveform?max_points=${maxPoints}`),
  investigate: (rid: string, question: string, mode: 'v1' | 'v2' = 'v2', machine = 'rig') =>
    req<{ job_id: string; state: string; investigation_id: string; mode: string }>(
      '/api/investigations',
      { method: 'POST', body: JSON.stringify({ recording_id: rid, question, mode, machine }) },
    ),
  status: (job: string) =>
    req<{ state: string; steps?: Step[]; usage?: Trace['usage']; trace?: Trace }>(
      `/api/investigations/${job}`,
    ),
  traces: () => req<{ traces: TraceSummary[] }>('/api/traces'),
  trace: (invId: string) => req<Trace>(`/api/traces/${invId}`),
  evidence: (inv: string, ev: string): Promise<any> =>
    req(`/api/evidence/${inv}/${ev}`),
  report: (inv: string): Promise<any> => req(`/api/report/${inv}`),
  upload: (filename: string, csvText: string, fs: number, unit: string, rpm: number) =>
    req<{ recording_id: string; display_label: string; n_samples: number }>(
      '/api/recordings/upload',
      {
        method: 'POST',
        body: JSON.stringify({ filename, csv_text: csvText, fs, unit, rpm, machine: 'paderborn-6203-rig' }),
      },
    ),
  reveal: (inv: string) =>
    req<{ frozen: string; documented: string; match: boolean | null; note?: string }>('/api/reveal', {
      method: 'POST',
      body: JSON.stringify({ investigation_id: inv }),
    }),
  packs: () =>
    req<{
      packs: {
        machine: string;
        name: string;
        kind: string;
        components: number;
        dimensions?: Record<string, number>;
      }[];
    }>('/api/packs'),
  pack: (machine: string) => req<Pack>(`/api/packs/${machine}`),
  meta: () => req<Meta>('/api/meta'),
  demoAssets: () => req<{ assets: DemoAsset[] }>('/api/demo-assets'),
};

export interface Meta {
  packs: number;
  components: number;
  checks: number;
  eval_rows: number;
  unsupported_claims: { n: number; of: number } | null;
}

export interface PackComponent {
  id: string;
  name: string;
  pos: string | null;
  parent: string | null;
  role: string;
  role_source: string;
  service_ref: string;
  failure_modes?: string[];
  failure_source?: string | null;
  /** Placement in the drawing plane (normalised, y down), read from the drawing or derived. */
  layout?: {
    cx: number;
    cy: number;
    w: number;
    h: number;
    axis?: 'horizontal' | 'vertical' | 'depth' | 'none';
    revolved?: boolean;
    shape?: string;
    mount?: { on: string; as: 'shaft_ring' | 'bolt_circle' | 'surface' };
    source?: string;
    anchor?: string;
  };
}

export interface PackScenario {
  id: string;
  label: string;
  note: string;
  parts: string[];
  slow: number;
  wobble: number;
  illustrative: boolean;
  source: string;
}

export interface PackAssemblyStep {
  caption: string;
  parts: string[];
}

export interface Pack {
  meta: {
    machine: string;
    name: string;
    kind: string;
    dimensions?: Record<string, number>;
    drawing?: { view?: string; main_axis?: string; image?: string };
  };
  components: PackComponent[];
  playbooks: { id: string; symptom: string; checks: number }[];
  scenarios: PackScenario[];
  assembly: { source?: string; order: PackAssemblyStep[] } | null;
  verification?: { round: number; score: number; issues: string[]; response_id: string | null; at: string } | null;
}

export interface DraftCandidate {
  id: string;
  name: string;
  pos: string | null;
  mentions: number;
  parent?: string | null;
  role?: string | null;
}

export interface Draft {
  id: string;
  machine: string;
  title: string;
  status: string;
  source_kind?: string;
  has_image?: boolean;
  dimensions?: Record<string, number>;
  candidates: DraftCandidate[];
  assessment: {
    score: number;
    n_candidates: number;
    with_pos: number;
    has_exploded: boolean;
    has_steps: boolean;
    questions: string[];
  };
  review: {
    verdict: string;
    confidence: number;
    summary: string;
    questions: string[];
    kind?: string;
  } | null;
}

async function formReq<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(path, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
  const body = (await r.json()) as T & { error?: string };
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new Error(String(body.error));
  }
  return body;
}

export interface AgentTraceItem {
  agent_id: string;
  name: string;
  status: string;
  summary: string;
  latency_ms: number;
}

export interface UiAction {
  type: string;
  payload: Record<string, any>;
}

export interface RepairKit {
  machine: string;
  suspect_component: string;
  primary: InvPart;
  companions: InvPart[];
  reasons: string[];
  alerts: string[];
  estimated_total: number;
  max_lead_days: number;
  draft_order: InvOrder | null;
  sandbox: boolean;
  note: string;
}

export interface AssistTurn {
  session: string;
  reply: string;
  specialists: string[];
  vision: { part_id: string | null; confidence: number; rationale: string } | null;
  sound: Record<string, any> | null;
  chat: { answer: string; citations: { file: string; quote: string }[]; citations_dropped: number };
  playbook: { id: string; symptom: string } | null;
  next_checks: string[];
  needs: string[];
  suspect_component?: string | null;
  suspect_source?: string;
  agent_trace?: AgentTraceItem[];
  ui_actions?: UiAction[];
  repair_kit?: RepairKit | null;
  physics_review?: Record<string, any> | null;
  acoustic_series?: { x: number[]; y: number[]; xlabel: string; ylabel: string } | null;
}

export const assistApi = {
  send: (
    machine: string,
    message: string,
    session: string | null,
    photo: File | null,
    wav: File | null,
    rpm?: number | null,
  ) => {
    const form = new FormData();
    form.append('machine', machine);
    form.append('message', message);
    if (session) form.append('session', session);
    if (rpm && Number.isFinite(rpm)) form.append('rpm', String(Math.round(rpm)));
    if (photo) form.append('photo', photo);
    if (wav) form.append('wav', wav);
    return formReq<AssistTurn>('/api/assist', form);
  },
};

export interface GuideCheck {
  id: string;
  ask: string;
  how?: string;
  expect_ok?: string;
  severe?: boolean;
}

export interface GuideView {
  id: string;
  machine: string;
  playbook: string;
  symptom: string;
  source: string;
  done: boolean;
  outcome: string | null;
  path: { check: string; result: string; note: string }[];
  current: GuideCheck | null;
  remedy?: string;
  severe?: boolean;
}

export interface InvPart {
  id: string;
  component_id?: string;
  name: string;
  sku: string;
  unit_price: number;
  currency: string;
  stock_qty: number;
  lead_days: number;
}

export interface InvOrder {
  id: string;
  status: string;
  total: number;
  confirmation: string | null;
  lines: { part_id: string; qty: number; unit_price: number; name: string; sku: string }[];
}

export const invApi = {
  search: (machine: string, q: string) =>
    req<{ parts: InvPart[] }>(`/api/inventory/search?machine=${machine}&q=${encodeURIComponent(q)}`),
  byComponent: (machine: string, component: string) =>
    req<InvPart>(`/api/inventory/by-component/${machine}/${component}`),
  draft: (machine: string, lines: { part_id: string; qty: number }[], budget: number | null) =>
    req<InvOrder>('/api/inventory/orders', {
      method: 'POST',
      body: JSON.stringify({ machine: machine, lines: lines, budget_cap: budget }),
    }),
  confirm: (id: string) => req<InvOrder>(`/api/inventory/orders/${id}/confirm`, { method: 'POST' }),
  submit: (id: string) => req<InvOrder>(`/api/inventory/orders/${id}/submit`, { method: 'POST' }),
  restock: (machine: string, partId?: string | null, qtyAdd?: number | null) =>
    req<{ machine?: string; updated: number; sandbox: boolean }>('/api/inventory/restock', {
      method: 'POST',
      body: JSON.stringify({ machine, part_id: partId ?? null, qty_add: qtyAdd ?? null }),
    }),
  repairKit: (machine: string, componentId: string, autoDraft = true) =>
    req<RepairKit>('/api/inventory/repair-kit', {
      method: 'POST',
      body: JSON.stringify({ machine, component_id: componentId, auto_draft: autoDraft }),
    }),
};

export const guideApi = {
  start: (machine: string, playbookId: string) =>
    req<GuideView>('/api/guide/start', {
      method: 'POST',
      body: JSON.stringify({ machine: machine, playbook_id: playbookId }),
    }),
  answer: (id: string, result: string, note: string, action: string) =>
    req<GuideView>(`/api/guide/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ result: result, note: note, action: action }),
    }),
};

export interface SegmentResult {
  regions: { id: number; bbox: number[]; area: number; iou: number }[];
  overlay_b64: string;
  image_size: number[];
  device: string;
  elapsed_ms: number;
  note: string;
}

export interface GroundedRegion {
  region_id: number;
  component_id: string;
  component_name: string;
  pos: string | null;
  confidence: number;
  condition: 'healthy' | 'suspect_wear';
  visual_note: string;
}

export interface AssemblyGuideStep {
  step: number;
  region_id: number | null;
  component_id: string;
  component_name: string;
  parts: string[];
  instruction: string;
  torque_or_check: string;
}

export interface AssemblyGuideResult {
  machine: string;
  machine_name: string;
  overlay_b64: string;
  image_size: number[];
  device: string;
  elapsed_ms: number;
  regions: SegmentResult['regions'];
  grounded_regions: GroundedRegion[];
  steps: AssemblyGuideStep[];
  grounding_source: string;
  note: string;
}

export const visionApi = {
  segment: (photo: File) => {
    const form = new FormData();
    form.append('photo', photo);
    return formReq<SegmentResult>('/api/vision/segment', form);
  },
  assemblyGuide: (machine: string, photo: File) => {
    const form = new FormData();
    form.append('machine', machine);
    form.append('photo', photo);
    return formReq<AssemblyGuideResult>('/api/vision/assembly-guide', form);
  },
};

export const draftApi = {
  upload: (machine: string, title: string, file: File) => {
    const form = new FormData();
    form.append('machine', machine);
    form.append('title', title);
    form.append('file', file);
    return formReq<Draft>('/api/packs/draft', form);
  },
  reason: (id: string) =>
    req<{ review: Draft['review']; auto_finalize: boolean; draft?: Draft }>(
      `/api/packs/draft/${id}/reason`,
      { method: 'POST' },
    ),
  answer: (id: string, edits: object[], news: object[], notes = '') =>
    req<Draft>(`/api/packs/draft/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ edits: edits, new_components: news, notes: notes }),
    }),
  finalize: (id: string) =>
    req<{ machine: string; components: number; dropped_by_review: string[]; dimensions?: Record<string, number> }>(
      `/api/packs/draft/${id}/finalize`,
      { method: 'POST' },
    ),
};

export interface RagHit {
  chunk_id: string;
  source: string;
  page?: number | null;
  kind?: string;
  components?: string[];
  text: string;
  score: number;
  via?: string;
}

export const ragApi = {
  search: (machine: string, q: string, componentId?: string | null) =>
    req<{ hits: RagHit[]; stats: { chunks: number; by_kind?: Record<string, number> } }>(
      `/api/rag/search?machine=${encodeURIComponent(machine)}&q=${encodeURIComponent(q)}${
        componentId ? `&component_id=${encodeURIComponent(componentId)}` : ''
      }`,
    ),
  reindex: () =>
    req<{ indexed: any; stats: { chunks: number; by_kind?: Record<string, number> } }>(
      '/api/rag/reindex',
      { method: 'POST' },
    ),
};

export interface HarnessSkill {
  id: string;
  title: string;
  rule: string;
  source?: string;
  origin?: string;
  active?: boolean;
  enabled?: boolean;
}

export interface HarnessLesson {
  id: string;
  ts: number;
  predicted: string;
  actual: string;
  lesson: string;
  threshold_patch?: Record<string, number>;
}

export interface HarnessState {
  machine: string;
  version: string;
  thresholds: Record<string, number>;
  skills: HarnessSkill[];
  lessons: HarnessLesson[];
}

export const harnessApi = {
  get: (machine: string) =>
    req<{ harness: HarnessState; experience: any[] }>(`/api/harness/${machine}`),
  reset: (machine: string, preset: 'v2' | 'v1_naive') =>
    req<{ harness: HarnessState; experience: any[] }>(`/api/harness/${machine}/reset`, {
      method: 'POST',
      body: JSON.stringify({ preset }),
    }),
  distill: (
    machine: string,
    body: {
      predicted: string;
      actual: string;
      reasoning?: string;
      technician_note?: string;
      investigation_id?: string | null;
    },
  ) =>
    req<{ lesson: HarnessLesson; harness: HarnessState; experience: any[] }>(
      `/api/harness/${machine}/distill`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

export interface AgentSpecItem {
  id: string;
  name: string;
  role: string;
  engine: string;
  status: string;
  metrics: Record<string, any>;
}

export const agentsApi = {
  catalog: (machine: string) =>
    req<{
      machine: string;
      agents: AgentSpecItem[];
      rag: { chunks: number; machines: number };
      harness_version: string;
    }>(`/api/agents/catalog?machine=${encodeURIComponent(machine)}`),
  designCopilot: (machine: string, prompt: string, currentInputs?: Record<string, any>) =>
    req<{
      machine: string;
      kind: string;
      patch: Record<string, number>;
      rationale: string;
      before: any;
      after: any;
      ui_actions: UiAction[];
    }>('/api/orchestrate/design', {
      method: 'POST',
      body: JSON.stringify({ machine, prompt, current_inputs: currentInputs ?? null }),
    }),
};

export interface FigureEntry {
  machine: string;
  status: string;
  pages: string[];
  job_id?: string;
  job_state?: string;
}

export interface FigureGate {
  gate: string;
  pass: boolean;
  detail: string;
  ms: number;
}

export interface FigureVerdict {
  publish: boolean;
  score: number;
  reasons: string[];
  missing: string[];
  artifacts: string[];
}

export interface FigureJob {
  state: string;
  machine?: string;
  gates: FigureGate[];
  verdict?: FigureVerdict | null;
  segment?: { regions: number; largest: number; ink: number } | null;
  attempts: number;
}

export const figureApi = {
  index: () => req<{ figures: FigureEntry[] }>('/api/figures'),
  create: (machine: string) =>
    req<{ job_id: string; state: string; machine: string }>('/api/figures', {
      method: 'POST',
      body: JSON.stringify({ machine }),
    }),
  submit: (job: string) =>
    req<{ job_id: string; state: string }>(`/api/figures/${job}/submit`, {
      method: 'POST',
    }),
  status: (job: string) => req<FigureJob>(`/api/figures/${job}`),
  approve: (job: string) =>
    req<{ job_id: string; state: string; machine: string }>(
      `/api/figures/${job}/approve`,
      { method: 'POST' },
    ),
};

/** Primary (dark) built page, or null when the figure has no pages yet. */
export function figurePage(entry: FigureEntry | undefined): string | null {
  const page = entry?.pages.find((p) => !p.endsWith('-light.html'));
  return page ?? null;
}

/** Anonymized label: operating point only, never the bearing code. */
export function labelForCase(c: string, i: number): string {
  const m = c.match(/^(N\d+_M\d+_F\d+)_/);
  return m ? `Recording ${i + 1} — ${m[1]}` : `Recording ${i + 1}`;
}

export interface MobilePeer {
  peer_id: string;
  role: 'desktop' | 'mobile' | string;
  device: string;
  last_seen: number;
}

export interface TunnelStatus {
  url: string | null;
  provider: string | null;
  status: 'idle' | 'starting' | 'ready' | 'error' | string;
  error: string | null;
  updated_at?: number;
}

export interface MobileConnectionInfo {
  room_id: string;
  recommended_url: string;
  is_https: boolean;
  tunnel: TunnelStatus;
  tunnel_companion_url: string | null;
  lan_ips: string[];
  lan_companion_urls: string[];
  peers: MobilePeer[];
}

export interface SyncEvent {
  seq: number;
  room_id: string;
  type: string;
  sender: string;
  ts: number;
  payload: any;
}

export const mobileApi = {
  info: (room: string) =>
    req<MobileConnectionInfo>(`/api/mobile/info?room=${encodeURIComponent(room)}`),
  qrSvgUrl: (targetUrl: string) =>
    `/api/mobile/qr.svg?url=${encodeURIComponent(targetUrl)}`,
  startTunnel: () =>
    req<TunnelStatus>('/api/mobile/tunnel/start', { method: 'POST' }),
  stopTunnel: () =>
    req<TunnelStatus>('/api/mobile/tunnel/stop', { method: 'POST' }),
  setTunnelUrl: (url: string) =>
    req<TunnelStatus>('/api/mobile/tunnel/url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  pollSync: (room: string, since: number, peerId: string, role: string, device = '') =>
    req<{
      room_id: string;
      seq: number;
      machine: string;
      peers: MobilePeer[];
      events: SyncEvent[];
    }>(
      `/api/sync/${encodeURIComponent(room)}?since=${since}&peer_id=${encodeURIComponent(peerId)}&role=${encodeURIComponent(role)}&device=${encodeURIComponent(device)}`,
    ),
  publishSync: (room: string, type: string, payload: Record<string, any>, sender: string) =>
    req<SyncEvent>(`/api/sync/${encodeURIComponent(room)}/event`, {
      method: 'POST',
      body: JSON.stringify({ type, payload, sender }),
    }),
  capture: async (
    roomId: string,
    machine: string,
    message: string,
    session?: string | null,
    photo?: File | null,
    wav?: File | null,
    rpm?: number | null,
    sender = 'mobile',
  ): Promise<AssistTurn> => {
    const fd = new FormData();
    fd.append('room_id', roomId);
    fd.append('machine', machine);
    fd.append('message', message);
    fd.append('sender', sender);
    if (session) fd.append('session', session);
    if (rpm != null) fd.append('rpm', String(rpm));
    if (photo) fd.append('photo', photo);
    if (wav) fd.append('wav', wav);
    const r = await fetch('/api/mobile/capture', { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`HTTP ${r.status} on /api/mobile/capture`);
    const body = (await r.json()) as AssistTurn & { error?: string };
    if (body.error) throw new Error(body.error);
    return body;
  },
  assemblyGuide: async (
    roomId: string,
    machine: string,
    photo: File,
    sender = 'mobile',
  ): Promise<AssemblyGuideResult> => {
    const fd = new FormData();
    fd.append('room_id', roomId);
    fd.append('machine', machine);
    fd.append('sender', sender);
    fd.append('photo', photo);
    const r = await fetch('/api/mobile/assembly-guide', { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`HTTP ${r.status} on /api/mobile/assembly-guide`);
    const body = (await r.json()) as AssemblyGuideResult & { error?: string };
    if (body.error) throw new Error(body.error);
    return body;
  },
  wsUrl: (room: string, peerId: string, role: string, device = '') => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/sync/${encodeURIComponent(room)}?peer_id=${encodeURIComponent(peerId)}&role=${encodeURIComponent(role)}&device=${encodeURIComponent(device)}`;
  },
};
