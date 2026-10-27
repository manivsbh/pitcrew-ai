/* Typed wrappers for the backend API (same origin). */

export interface Step {
  turn: number;
  type: 'tool' | 'text';
  tool?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence?: Record<string, any>;
  usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
  latency_s?: number;
  model_id?: string;
  prompt_version?: string;
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

export const api = {
  cases: () => req<{ cases: string[] }>('/api/cases'),
  importCase: (c: string) =>
    req<{ recording_id: string; display_label: string }>('/api/recordings/import', {
      method: 'POST',
      body: JSON.stringify({ case: c }),
    }),
  waveform: (rid: string, maxPoints = 8000) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req<any>(`/api/recordings/${rid}/waveform?max_points=${maxPoints}`),
  investigate: (rid: string, question: string) =>
    req<{ job_id: string; state: string; investigation_id: string }>(
      '/api/investigations',
      { method: 'POST', body: JSON.stringify({ recording_id: rid, question }) },
    ),
  status: (job: string) =>
    req<{ state: string; steps?: Step[]; usage?: Trace['usage']; trace?: Trace }>(
      `/api/investigations/${job}`,
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: (inv: string, ev: string): Promise<any> =>
    req(`/api/evidence/${inv}/${ev}`),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    req<{ packs: { machine: string; name: string; kind: string; components: number }[] }>(
      '/api/packs',
    ),
  pack: (machine: string) => req<Pack>(`/api/packs/${machine}`),
};

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
}

export interface Pack {
  meta: { machine: string; name: string; kind: string };
  components: PackComponent[];
  playbooks: { id: string; symptom: string; checks: number }[];
}

export interface DraftCandidate {
  id: string;
  name: string;
  pos: string | null;
  mentions: number;
  parent?: string | null;
}

export interface Draft {
  id: string;
  machine: string;
  title: string;
  status: string;
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

export interface AssistTurn {
  session: string;
  reply: string;
  specialists: string[];
  vision: { part_id: string | null; confidence: number; rationale: string } | null;
  sound: Record<string, unknown> | null;
  chat: { answer: string; citations: { file: string; quote: string }[]; citations_dropped: number };
  playbook: { id: string; symptom: string } | null;
  next_checks: string[];
  needs: string[];
}

export const assistApi = {
  send: (machine: string, message: string, session: string | null, photo: File | null, wav: File | null) => {
    const form = new FormData();
    form.append('machine', machine);
    form.append('message', message);
    if (session) form.append('session', session);
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

export const draftApi = {
  upload: (machine: string, title: string, file: File) => {
    const form = new FormData();
    form.append('machine', machine);
    form.append('title', title);
    form.append('file', file);
    return formReq<Draft>('/api/packs/draft', form);
  },
  reason: (id: string) =>
    req<{ review: Draft['review']; auto_finalize: boolean }>(
      `/api/packs/draft/${id}/reason`,
      { method: 'POST' },
    ),
  answer: (id: string, edits: object[], news: object[]) =>
    req<Draft>(`/api/packs/draft/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ edits: edits, new_components: news }),
    }),
  finalize: (id: string) =>
    req<{ machine: string; components: number; dropped_by_review: string[] }>(
      `/api/packs/draft/${id}/finalize`,
      { method: 'POST' },
    ),
};

/** Anonymized label: operating point only, never the bearing code. */
export function labelForCase(c: string, i: number): string {
  const m = c.match(/^(N\d+_M\d+_F\d+)_/);
  return m ? `Recording ${i + 1} — ${m[1]}` : `Recording ${i + 1}`;
}
