import './style.css';
import { api, draftApi, labelForCase, type Draft, type PackComponent, type Step, type Trace } from './api';
import { initAssembly, type AssemblyHandle } from './assembly';
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
  machine: string;
  components: PackComponent[];
  draft: Draft | null;
} = { cases: [], recordingId: '', jobId: '', invId: '', trace: null, poller: null, assembly: null, machine: 'rig', components: [], draft: null };

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

function compById(id: string): PackComponent | undefined {
  return state.components.find((c) => c.id === id);
}

function labelFor(id: string): string {
  const c = compById(id);
  return c ? c.name : id;
}

function selectComponent(id: string): void {
  syncList(id);
  state.assembly?.select(id);
  renderRole(id);
}

function renderRole(id: string): void {
  const box = el('role');
  const c = compById(id);
  if (!c) {
    box.innerHTML = '<p class="muted">Select a component to see its role.</p>';
    return;
  }
  const fails = (c.failure_modes ?? []).length
    ? `<p><strong>Known failure modes.</strong> ${escapeHtml(c.failure_modes?.join('; ') ?? '')} ` +
      `<span class="muted">(${escapeHtml(c.failure_source ?? '')})</span></p>`
    : '';
  box.innerHTML =
    `<p><strong>${escapeHtml(c.name)}</strong>` +
    `${c.pos ? ` <span class="muted">Pos. ${escapeHtml(c.pos)}</span>` : ''}</p>` +
    `<p>${escapeHtml(c.role)}</p>` +
    `<p class="muted">Ref: ${escapeHtml(c.service_ref)}</p>` +
    fails;
}

function buildComponentList(): void {
  const ul = el('components');
  ul.innerHTML = '';
  for (const c of state.components) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = c.pos ? `${c.name} (${c.pos})` : c.name;
    b.dataset.comp = c.id;
    b.title = c.role;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => selectComponent(c.id));
    li.appendChild(b);
    ul.appendChild(li);
  }
}

async function switchMachine(machine: string): Promise<void> {
  clearError();
  try {
    const pack = await api.pack(machine);
    state.machine = machine;
    state.components = pack.components;
    state.assembly?.dispose();
    state.assembly = initAssembly(el('assembly'), {
      onSelect: (id) => selectComponent(id),
      labelFor,
      machine,
      components: pack.components,
    });
    buildComponentList();
    renderRole('');
    document.querySelectorAll<HTMLButtonElement>('#machine-tabs button').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.machine === machine ? 'true' : 'false');
    });
  } catch (e) {
    showError(`Failed to load machine ${machine}: ${(e as Error).message}`);
  }
}

async function buildMachineTabs(): Promise<void> {
  try {
    const { packs } = await api.packs();
    const tabs = el('machine-tabs');
    tabs.innerHTML = '';
    for (const p of packs) {
      const b = document.createElement('button');
      b.textContent = `${p.name} (${p.components})`;
      b.dataset.machine = p.machine;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => void switchMachine(p.machine));
      tabs.appendChild(b);
    }
  } catch (e) {
    showError(`Failed to load machines: ${(e as Error).message}`);
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

async function onDraftUpload(): Promise<void> {
  clearError();
  const box = el('draft');
  const file = el<HTMLInputElement>('draft-file').files?.[0];
  const machine = el<HTMLInputElement>('draft-machine').value.trim();
  const title = el<HTMLInputElement>('draft-title').value.trim() || machine;
  if (!file || !machine) {
    showError('Enter a machine id and choose a PDF manual first.');
    return;
  }
  box.innerHTML = '<p class="muted">Extracting candidates…</p>';
  try {
    state.draft = await draftApi.upload(machine, title, file);
    renderDraft();
  } catch (e) {
    showError(`Draft failed: ${(e as Error).message}`);
  }
}

function renderDraft(): void {
  const d = state.draft;
  const box = el('draft');
  if (!d) return;
  const a = d.assessment;
  const rev = d.review
    ? `<p><strong>Agent review: ${escapeHtml(d.review.verdict)}</strong> ` +
      `(confidence ${(d.review.confidence ?? 0).toFixed(2)}) — ${escapeHtml(d.review.summary ?? '')}</p>` +
      '<ul>' +
      (d.review.questions ?? []).map((q) => '<li>' + escapeHtml(q) + '</li>').join('') +
      '</ul>'
    : '<p class="muted">No agent review yet.</p>';
  const rows = d.candidates
    .map(
      (c) =>
        `<tr><td><input type="checkbox" data-drop="${c.id}" aria-label="Drop ${escapeHtml(c.id)}" /></td>` +
        `<td><input type="text" data-name="${c.id}" value="${escapeHtml(c.name)}" aria-label="Name" /></td>` +
        `<td>${escapeHtml(c.pos ?? '—')}</td>` +
        `<td><input type="text" data-parent="${c.id}" value="${escapeHtml(c.parent ?? '')}" ` +
        `placeholder="parent id" aria-label="Parent" /></td></tr>`,
    )
    .join('');
  box.innerHTML =
    `<p><strong>${escapeHtml(d.title)}</strong> — readiness <strong>${a.score}/100</strong> ` +
    `(${a.n_candidates} parts, ${a.with_pos} numbered, ` +
    `${a.has_exploded ? 'parts-list found' : 'no parts-list'}, ${a.has_steps ? 'steps found' : 'no steps'})</p>` +
    '<ul>' +
    a.questions.map((q) => '<li>' + escapeHtml(q) + '</li>').join('') +
    '</ul>' +
    rev +
    `<table class="draft-table"><tr><th>Drop</th><th>Name</th><th>Pos</th><th>Parent</th></tr>${rows}</table>` +
    `<div class="draft-actions"><button id="draft-reason" type="button">Ask agent</button> ` +
    `<button id="draft-save" type="button">Save answers</button> ` +
    `<button id="draft-final" type="button">Finalize pack</button></div>`;
  el<HTMLButtonElement>('draft-reason').addEventListener('click', () => void onDraftReason());
  el<HTMLButtonElement>('draft-save').addEventListener('click', () => void onDraftSave());
  el<HTMLButtonElement>('draft-final').addEventListener('click', () => void onDraftFinalize());
}

function collectEdits(): object[] {
  const edits: object[] = [];
  document.querySelectorAll<HTMLInputElement>('#draft input[data-drop]').forEach((chk) => {
    const id = chk.dataset.drop ?? '';
    const name = document.querySelector<HTMLInputElement>(`#draft input[data-name="${id}"]`)?.value ?? '';
    const parent = document.querySelector<HTMLInputElement>(`#draft input[data-parent="${id}"]`)?.value ?? '';
    edits.push({ id, drop: chk.checked, name, parent: parent || null });
  });
  return edits;
}

async function onDraftReason(): Promise<void> {
  if (!state.draft) return;
  clearError();
  try {
    const r = await draftApi.reason(state.draft.id);
    if (state.draft) state.draft.review = r.review;
    renderDraft();
    const box = el('draft');
    const p = document.createElement('p');
    p.innerHTML = r.auto_finalize
      ? '<strong>Draft passes the auto-finalize bar.</strong> Review the list, then Finalize.'
      : '<strong>Below the auto bar</strong> — please correct the list above, Save, then Finalize.';
    box.prepend(p);
  } catch (e) {
    showError(`Agent review failed: ${(e as Error).message}`);
  }
}

async function onDraftSave(): Promise<void> {
  if (!state.draft) return;
  clearError();
  try {
    state.draft = await draftApi.answer(state.draft.id, collectEdits(), []);
    renderDraft();
  } catch (e) {
    showError(`Save failed: ${(e as Error).message}`);
  }
}

async function onDraftFinalize(): Promise<void> {
  if (!state.draft) return;
  clearError();
  try {
    state.draft = await draftApi.answer(state.draft.id, collectEdits(), []);
    const r = await draftApi.finalize(state.draft.id);
    const dropped = r.dropped_by_review ?? [];
    el('draft').innerHTML =
      '<p>Pack <strong>' + escapeHtml(r.machine) + '</strong> built: ' +
      r.components + ' components' +
      (dropped.length
        ? ' (' + dropped.length + ' dropped by agent review: ' + escapeHtml(dropped.join(', ')) + ')'
        : '') +
      '.</p>';
    state.draft = null;
    await buildMachineTabs();
    await switchMachine(r.machine);
  } catch (e) {
    showError(`Finalize failed: ${(e as Error).message}`);
  }
}

void buildMachineTabs().then(() => switchMachine('rig'));
el<HTMLSelectElement>('case').addEventListener('change', () => void onSelectCase());
el<HTMLButtonElement>('go').addEventListener('click', () => void onInvestigate());
el<HTMLButtonElement>('reset').addEventListener('click', onReset);
el<HTMLButtonElement>('export').addEventListener('click', () => void onExport());
el<HTMLButtonElement>('reveal').addEventListener('click', () => void onReveal());
el<HTMLButtonElement>('up-go').addEventListener('click', () => void onUpload());
el<HTMLButtonElement>('draft-go').addEventListener('click', () => void onDraftUpload());
void loadCases();
