import './style.css';
import { api, labelForCase, type Step, type Trace } from './api';
import { COMPONENTS, initAssembly, type AssemblyHandle } from './assembly';
import { clearPlot, linePlot } from './plots';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const state: {
  cases: string[];
  recordingId: string;
  jobId: string;
  invId: string;
  trace: Trace | null;
  poller: number | null;
  assembly: AssemblyHandle | null;
} = { cases: [], recordingId: '', jobId: '', invId: '', trace: null, poller: null, assembly: null };

function showError(msg: string): void {
  const box = el('error');
  box.hidden = false;
  box.textContent = msg;
}

function clearError(): void {
  el('error').hidden = true;
}

function setStatus(msg: string): void {
  el('status').textContent = msg;
}

function renderSteps(steps: Step[]): void {
  const ol = el('steps');
  ol.innerHTML = '';
  for (const s of steps) {
    const li = document.createElement('li');
    if (s.type === 'tool') {
      const ok = s.status === 'success';
      li.innerHTML =
        `<span class="tool">${s.tool}</span> ` +
        `<span class="${ok ? 'ok' : 'bad'}">${s.status}</span><br/>` +
        `${escapeHtml(s.summary ?? '')}`;
    } else {
      li.textContent = `note: ${(s.text ?? '').slice(0, 200)}`;
    }
    ol.appendChild(li);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function syncList(id: string): void {
  document.querySelectorAll<HTMLButtonElement>('#components button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.comp === id ? 'true' : 'false');
  });
}

function selectComponent(id: string): void {
  syncList(id);
  state.assembly?.select(id);
}

function buildComponentList(): void {
  const ul = el('components');
  ul.innerHTML = '';
  for (const c of COMPONENTS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = c;
    b.dataset.comp = c;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => selectComponent(c));
    li.appendChild(b);
    ul.appendChild(li);
  }
}

async function loadCases(): Promise<void> {
  const sel = el<HTMLSelectElement>('case');
  try {
    const { cases } = await api.cases();
    state.cases = cases;
    sel.innerHTML = '<option value="">Select a recording…</option>';
    cases.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = labelForCase(c, i);
      sel.appendChild(o);
    });
    setStatus(cases.length ? 'Select a recording to begin.' : 'No bundled recordings found.');
  } catch (e) {
    showError(`Failed to load cases: ${(e as Error).message}`);
  }
}

async function onSelectCase(): Promise<void> {
  clearError();
  const sel = el<HTMLSelectElement>('case');
  if (sel.value === '') return;
  try {
    const imp = await api.importCase(state.cases[Number(sel.value)]);
    await showRecording(imp.recording_id, imp.display_label);
  } catch (e) {
    showError(`Import failed: ${(e as Error).message}`);
  }
}

async function onInvestigate(): Promise<void> {
  clearError();
  el<HTMLButtonElement>('go').disabled = true;
  try {
    const q = el<HTMLInputElement>('question').value;
    const r = await api.investigate(state.recordingId, q);
    state.jobId = r.job_id;
    state.invId = r.investigation_id;
    setStatus('Investigating… steps appear as the agent works.');
    state.poller = window.setInterval(poll, 2000);
    await poll();
  } catch (e) {
    showError(`Investigation failed: ${(e as Error).message}`);
    el<HTMLButtonElement>('go').disabled = false;
  }
}

async function poll(): Promise<void> {
  try {
    const s = await api.status(state.jobId);
    if (s.steps) renderSteps(s.steps);
    if (s.state === 'running') {
      setStatus(`Investigating… ${(s.steps ?? []).length} steps so far.`);
      return;
    }
    if (state.poller !== null) window.clearInterval(state.poller);
    state.poller = null;
    if (s.state === 'complete' && s.trace) {
      state.trace = s.trace;
      renderSteps(s.trace.steps);
      renderFinding(s.trace);
    } else if (s.trace) {
      state.trace = s.trace;
      renderSteps(s.trace.steps);
      setStatus(`Incomplete: ${s.trace.incomplete_reason ?? 'unknown'}`);
      renderReport();
    } else {
      setStatus(`Job ended: ${s.state}`);
    }
    el<HTMLButtonElement>('go').disabled = false;
  } catch (e) {
    if (state.poller !== null) window.clearInterval(state.poller);
    showError(`Status poll failed: ${(e as Error).message}`);
  }
}

function renderFinding(t: Trace): void {
  const f = t.finding;
  if (!f) return;
  setStatus(`Complete in ${t.steps.length} steps, ${(t.latency_s ?? 0).toFixed(0)}s.`);
  selectComponent(f.component);
  const suspect = f.component === 'ring_inner' || f.component === 'ring_outer' ? f.component : null;
  state.assembly?.setSuspect(suspect);
  if (suspect) state.assembly?.setExplode(0.85);
  const box = el('evidence-list');
  box.innerHTML = '';
  for (const eid of Object.keys(t.evidence ?? {})) {
    const b = document.createElement('button');
    b.textContent = `${eid} (${t.evidence?.[eid]?.kind ?? '?'})`;
    b.addEventListener('click', () => void showEvidence(eid, b));
    box.appendChild(b);
  }
  const first = Object.keys(t.evidence ?? {}).find(
    (k) => ['spectrum', 'envelope', 'fault_match', 'psd'].includes(t.evidence?.[k]?.kind),
  );
  if (first) {
    const btn = box.querySelector('button');
    void showEvidence(first, btn as HTMLButtonElement | null);
  }
  renderReport();
}

async function showEvidence(eid: string, btn: HTMLButtonElement | null): Promise<void> {
  document.querySelectorAll('#evidence-list button').forEach((b) => b.classList.remove('active'));
  btn?.classList.add('active');
  const detail = el('evidence-detail');
  try {
    const d = await api.evidence(state.invId, eid);
    if (d.x && d.y) {
      linePlot(el('plot'), d, eid);
      detail.innerHTML = peaksTable(d.peaks) + targetsTable(d.targets, d.hits);
    } else if (d.kind === 'document') {
      clearPlot(el('plot'));
      detail.innerHTML =
        `<p><strong>${escapeHtml(d.data?.title ?? eid)}</strong><br/>` +
        `Source: <code>${escapeHtml(d.data?.source_file ?? '')}</code></p>` +
        `<pre>${escapeHtml((d.data?.text ?? '').slice(0, 3000))}</pre>`;
    } else {
      clearPlot(el('plot'));
      detail.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.data ?? d, null, 1).slice(0, 3000))}</pre>`;
    }
  } catch (e) {
    showError(`Evidence failed: ${(e as Error).message}`);
  }
}

function peaksTable(peaks: { freq: number; amp: number }[] | undefined): string {
  if (!peaks || !peaks.length) return '';
  const rows = peaks
    .slice(0, 10)
    .map((p) => `<tr><td>${p.freq.toFixed(2)} Hz</td><td>${p.amp}</td></tr>`)
    .join('');
  return `<table><tr><th>Peak</th><th>Amp</th></tr>${rows}</table>`;
}

function targetsTable(
  targets: Record<string, number> | undefined,
  hits: Record<string, { freq: number } | null> | undefined,
): string {
  if (!targets) return '';
  const rows = Object.entries(targets)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v.toFixed(2)} Hz</td><td>${hits?.[k]?.freq.toFixed(2) ?? '—'} Hz</td></tr>`)
    .join('');
  return `<table><tr><th>Target</th><th>Expected</th><th>Hit</th></tr>${rows}</table>`;
}

function renderReport(): void {
  const t = state.trace;
  const box = el('report');
  if (!t) return;
  if (t.status !== 'complete' || !t.finding) {
    box.innerHTML = `<p class="muted">Incomplete investigation: ${escapeHtml(t.incomplete_reason ?? '')}</p>`;
    return;
  }
  const f = t.finding;
  const cls = f.hypothesis === 'healthy' ? 'good' : f.hypothesis === 'insufficient_evidence' ? 'warn' : 'bad';
  box.innerHTML =
    `<p class="finding ${cls}">${escapeHtml(f.hypothesis)} — ${escapeHtml(f.component)}</p>` +
    `<p><strong>Reasoning.</strong> ${escapeHtml(f.reasoning)}</p>` +
    `<p><strong>Contradictions.</strong> ${escapeHtml(f.contradictions)}</p>` +
    `<p><strong>Next measurement.</strong> ${escapeHtml(f.next_measurement)}</p>` +
    `<p class="muted">Model ${escapeHtml(t.model_id ?? '')} · prompt ${escapeHtml(t.prompt_version ?? '')} · ` +
    `${t.usage?.input_tokens ?? 0} in / ${t.usage?.output_tokens ?? 0} out tokens · ` +
    `${(t.latency_s ?? 0).toFixed(0)}s · evidence: ${(f.evidence_ids ?? []).join(', ')}</p>`;
  el<HTMLButtonElement>('export').disabled = false;
  el<HTMLButtonElement>('reveal').disabled = false;
}

async function onReveal(): Promise<void> {
  const out = el('reveal-out');
  try {
    const r = await api.reveal(state.invId);
    const verdict = r.match === null ? 'UNSCORED' : r.match ? 'MATCH' : 'MISMATCH';
    out.innerHTML =
      `<p>Frozen: <strong>${escapeHtml(r.frozen)}</strong> — ` +
      `Documented: <strong>${escapeHtml(r.documented)}</strong> — ` +
      `<strong>${verdict}</strong>${r.note ? ` (${escapeHtml(r.note)})` : ''}</p>`;
  } catch (e) {
    showError(`Reveal failed: ${(e as Error).message}`);
  }
}

async function showRecording(rid: string, label: string): Promise<void> {
  state.recordingId = rid;
  setStatus(`Imported ${rid}: ${label}`);
  const wf = await api.waveform(rid);
  linePlot(el('plot'), wf, 'waveform');
  el<HTMLButtonElement>('go').disabled = false;
}

async function onUpload(): Promise<void> {
  clearError();
  const fileInput = el<HTMLInputElement>('up-file');
  const file = fileInput.files?.[0];
  if (!file) {
    showError('Choose a CSV file first.');
    return;
  }
  if (file.size > 2000000) {
    showError('File exceeds the 2 MB upload cap.');
    return;
  }
  try {
    const text = await file.text();
    const fs = Number(el<HTMLInputElement>('up-fs').value);
    const rpm = Number(el<HTMLInputElement>('up-rpm').value);
    const unit = el<HTMLInputElement>('up-unit').value;
    const r = await api.upload(file.name, text, fs, unit, rpm);
    const sel = el<HTMLSelectElement>('case');
    const o = document.createElement('option');
    o.textContent = r.display_label;
    o.selected = true;
    sel.appendChild(o);
    await showRecording(r.recording_id, r.display_label);
  } catch (e) {
    showError(`Upload failed: ${(e as Error).message}`);
  }
}

async function onExport(): Promise<void> {
  try {
    const r = await api.report(state.invId);
    const blob = new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.invId}.json`;
    a.click();
  } catch (e) {
    showError(`Export failed: ${(e as Error).message}`);
  }
}

function onReset(): void {
  if (state.poller !== null) window.clearInterval(state.poller);
  state.recordingId = '';
  state.jobId = '';
  state.invId = '';
  state.trace = null;
  state.poller = null;
  el<HTMLSelectElement>('case').value = '';
  el<HTMLButtonElement>('go').disabled = true;
  el<HTMLButtonElement>('export').disabled = true;
  el<HTMLButtonElement>('reveal').disabled = true;
  el('reveal-out').innerHTML = '';
  el('steps').innerHTML = '';
  el('evidence-list').innerHTML = '';
  el('evidence-detail').innerHTML = '';
  el('report').innerHTML = '<p class="muted">No investigation yet.</p>';
  clearPlot(el('plot'));
  state.assembly?.setSuspect(null);
  state.assembly?.setExplode(0);
  syncList('');
  clearError();
  setStatus('Select a recording to begin.');
}

state.assembly = initAssembly(el('assembly'), { onSelect: (id) => syncList(id) });
buildComponentList();
el<HTMLSelectElement>('case').addEventListener('change', () => void onSelectCase());
el<HTMLButtonElement>('go').addEventListener('click', () => void onInvestigate());
el<HTMLButtonElement>('reset').addEventListener('click', onReset);
el<HTMLButtonElement>('export').addEventListener('click', () => void onExport());
el<HTMLButtonElement>('reveal').addEventListener('click', () => void onReveal());
el<HTMLButtonElement>('up-go').addEventListener('click', () => void onUpload());
void loadCases();
