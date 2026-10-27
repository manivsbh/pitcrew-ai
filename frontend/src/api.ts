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
};

/** Anonymized label: operating point only, never the bearing code. */
export function labelForCase(c: string, i: number): string {
  const m = c.match(/^(N\d+_M\d+_F\d+)_/);
  return m ? `Recording ${i + 1} — ${m[1]}` : `Recording ${i + 1}`;
}
