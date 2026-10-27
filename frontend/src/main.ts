import './fonts.css';
import './style.css';
import { api, assistApi, draftApi, guideApi, invApi, visionApi, labelForCase, type Draft, type GuideView, type InvOrder, type InvPart, type PackComponent, type Step, type Trace } from './api';
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
  assistSession: string | null;
  speakOn: boolean;
  guide: GuideView | null;
  cart: { part: InvPart; qty: number }[];
  order: InvOrder | null;
  hero: AssemblyHandle | null;
} = { cases: [], recordingId: '', jobId: '', invId: '', trace: null, poller: null, assembly: null, machine: 'rig', components: [], draft: null, assistSession: null, speakOn: false, guide: null, cart: [], order: null, hero: null };

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
    fails +
    `<p class="muted" id="role-stock">Checking stock…</p>`;
  void invApi.byComponent(state.machine, id).then(
    (p) => {
      const s = document.getElementById('role-stock');
      if (s) {
        s.innerHTML =
          'Stock: <strong>' + p.stock_qty + '</strong> × (' + escapeHtml(p.sku) + ') — ' +
          p.unit_price.toFixed(2) + ' ' + escapeHtml(p.currency) + ', ' + p.lead_days + 'd lead (sandbox).';
      }
    },
    () => {
      const s = document.getElementById('role-stock');
      if (s) s.textContent = 'Not orderable (no catalog entry).';
    },
  );
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

function miniMd(s: string): string {
  const esc = escapeHtml(s);
  const lines = esc.split('\n');
  let html = '';
  let inList = false;
  for (const ln of lines) {
    if (ln.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p><strong>' + ln.slice(4) + '</strong></p>';
    } else if (ln.startsWith('- ') || ln.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + ln.slice(2) + '</li>';
    } else if (ln.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + ln.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

async function onAssistSend(): Promise<void> {
  clearError();
  const msg = el<HTMLInputElement>('assist-msg').value.trim();
  const machine = el<HTMLSelectElement>('assist-machine').value;
  if (!msg) return;
  const photo = el<HTMLInputElement>('assist-photo').files?.[0] ?? null;
  const wav = el<HTMLInputElement>('assist-wav').files?.[0] ?? null;
  const out = el('assist-out');
  const wait = document.createElement('p');
  wait.className = 'muted';
  wait.textContent = 'Consulting specialists…';
  out.appendChild(wait);
  try {
    const r = await assistApi.send(machine, msg, state.assistSession, photo, wav);
    state.assistSession = r.session;
    el<HTMLInputElement>('assist-msg').value = '';
    el<HTMLInputElement>('assist-photo').value = '';
    el<HTMLInputElement>('assist-wav').value = '';
    if (state.speakOn) speak(r.reply);
    wait.remove();
    const div = document.createElement('div');
    div.className = 'turn';
    const seen = r.vision && r.vision.part_id
      ? '<p>Photo: <strong>' + escapeHtml(r.vision.part_id) + '</strong> (' +
        r.vision.confidence.toFixed(2) + ') — ' + escapeHtml(r.vision.rationale) + '</p>'
      : '';
    const cites = r.chat.citations
      .map((c) => '<li><span class="cite">' + escapeHtml(c.file) + ':</span> “' + escapeHtml(c.quote) + '”</li>')
      .join('');
    div.innerHTML =
      '<p><span class="who">You:</span> ' + escapeHtml(msg) + '</p>' +
      '<p><span class="who">Assistant</span> <span class="cite">[' +
      r.specialists.map(escapeHtml).join(', ') + ']</span></p>' +
      seen + miniMd(r.reply) +
      (cites ? '<ul>' + cites + '</ul>' : '') +
      (r.playbook ? '<p>Playbook: <strong>' + escapeHtml(r.playbook.id) + '</strong> — ' + escapeHtml(r.playbook.symptom) + '</p>' : '');
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  } catch (e) {
    wait.remove();
    showError('Assist failed: ' + (e as Error).message);
  }
}

async function buildAssistMachines(): Promise<void> {
  try {
    const { packs } = await api.packs();
    const sel = el<HTMLSelectElement>('assist-machine');
    sel.innerHTML = '';
    for (const p of packs) {
      const o = document.createElement('option');
      o.value = p.machine;
      o.textContent = p.name;
      sel.appendChild(o);
    }
  } catch (e) {
    showError('Failed to load machines: ' + (e as Error).message);
  }
}

interface SpeechRecog {
  lang: string;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const plain = text.replace(/[#*_`]/g, '').slice(0, 600);
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(plain));
}

function onMic(): void {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecog;
    webkitSpeechRecognition?: new () => SpeechRecog;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    showError('Speech recognition is not supported in this browser.');
    return;
  }
  clearError();
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.onresult = (e) => {
    el<HTMLInputElement>('assist-msg').value = e.results[0][0].transcript;
  };
  rec.onerror = (e) => showError('Dictation failed: ' + e.error);
  rec.start();
}

async function onVisionSegment(): Promise<void> {
  clearError();
  const photo = el<HTMLInputElement>('assist-photo').files?.[0] ?? null;
  if (!photo) {
    showError('Attach a photo first, then Segment.');
    return;
  }
  const out = el('assist-out');
  const wait = document.createElement('p');
  wait.className = 'muted';
  wait.innerHTML = '<span class="loading-dots">Segmenting locally</span>';
  out.appendChild(wait);
  try {
    const r = await visionApi.segment(photo);
    wait.remove();
    const div = document.createElement('div');
    div.className = 'turn';
    const chips = r.regions
      .map((g) => '<li>#' + g.id + ' — area ' + g.area + 'px, IoU ' + g.iou.toFixed(2) + '</li>')
      .join('');
    div.innerHTML =
      '<p><span class="who">Segmentation</span> <span class="cite">local SAM 2 · ' +
      escapeHtml(r.device) + ' · ' + r.elapsed_ms + 'ms · ' + r.regions.length + ' regions</span></p>' +
      '<img class="seg-overlay" alt="Segmented photo with outlined regions" src="data:image/png;base64,' +
      r.overlay_b64 + '" />' +
      '<ul>' + chips + '</ul>' +
      '<p class="cite">' + escapeHtml(r.note) + '</p>';
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  } catch (e) {
    wait.remove();
    showError('Segment failed: ' + (e as Error).message);
  }
}

function onSpeakToggle(): void {
  state.speakOn = !state.speakOn;
  const b = el<HTMLButtonElement>('assist-say');
  b.textContent = state.speakOn ? 'Speak: on' : 'Speak: off';
  b.setAttribute('aria-pressed', state.speakOn ? 'true' : 'false');
  if (!state.speakOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

async function buildGuideMachines(): Promise<void> {
  try {
    const { packs } = await api.packs();
    const sel = el<HTMLSelectElement>('guide-machine');
    sel.innerHTML = '';
    for (const p of packs) {
      const o = document.createElement('option');
      o.value = p.machine;
      o.textContent = p.name;
      sel.appendChild(o);
    }
    await buildGuidePlaybooks();
  } catch (e) {
    showError('Failed to load machines: ' + (e as Error).message);
  }
}

async function buildGuidePlaybooks(): Promise<void> {
  try {
    const machine = el<HTMLSelectElement>('guide-machine').value;
    const pack = await api.pack(machine);
    const sel = el<HTMLSelectElement>('guide-playbook');
    sel.innerHTML = '';
    for (const p of pack.playbooks) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.symptom + ' (' + p.checks + ' checks)';
      sel.appendChild(o);
    }
  } catch (e) {
    showError('Failed to load playbooks: ' + (e as Error).message);
  }
}

async function onGuideStart(): Promise<void> {
  clearError();
  try {
    const machine = el<HTMLSelectElement>('guide-machine').value;
    const pb = el<HTMLSelectElement>('guide-playbook').value;
    state.guide = await guideApi.start(machine, pb);
    renderGuide();
  } catch (e) {
    showError('Guide failed: ' + (e as Error).message);
  }
}

async function onGuideAnswer(result: string, action: string): Promise<void> {
  if (!state.guide) return;
  clearError();
  try {
    const note = el<HTMLInputElement>('guide-note')?.value ?? '';
    state.guide = await guideApi.answer(state.guide.id, result, note, action);
    renderGuide();
  } catch (e) {
    showError('Guide failed: ' + (e as Error).message);
  }
}

function renderGuide(): void {
  const g = state.guide;
  const box = el('guide-out');
  if (!g) return;
  const path = g.path.map((p) => p.check + ':' + p.result).join(' → ');
  if (g.done) {
    box.innerHTML =
      '<p><strong>Finished.</strong> ' + escapeHtml(g.outcome ?? '') + '</p>' +
      '<p class="path">Path: ' + escapeHtml(path) + '</p>';
    if (state.speakOn) speak('Check complete. ' + (g.outcome ?? ''));
    return;
  }
  const c = g.current;
  if (!c) return;
  const remedy = g.remedy
    ? '<p><strong>Remedy.</strong> ' + escapeHtml(g.remedy) + '</p>' +
      (g.severe ? '<p class="severe">Lock out power before touching this.</p>' : '')
    : '';
  box.innerHTML =
    '<p class="path">' + escapeHtml(g.symptom) + ' — step ' + (g.path.length + 1) + '</p>' +
    '<p><strong>' + escapeHtml(c.ask) + '</strong></p>' +
    (c.how ? '<p>' + escapeHtml(c.how) + '</p>' : '') +
    (c.expect_ok ? '<p>Looks OK means: ' + escapeHtml(c.expect_ok) + '</p>' : '') +
    remedy +
    '<input id="guide-note" type="text" placeholder="Note (optional)" aria-label="Note" />' +
    '<div class="guide-actions">' +
    (g.remedy
      ? '<button id="g-retry" type="button">Retry same check</button>' +
        '<button id="g-skip" type="button">Skip to next</button>' +
        '<button id="g-stop" type="button">Stop</button>'
      : '<button id="g-ok" type="button">Looks OK</button>' +
        '<button id="g-bad" type="button">Problem found</button>') +
    '</div>' +
    '<p class="path">Path: ' + escapeHtml(path || '—') + '</p>';
  if (state.speakOn) speak(c.ask);
  const ok = document.getElementById('g-ok');
  if (ok) ok.addEventListener('click', () => void onGuideAnswer('ok', 'continue'));
  const bad = document.getElementById('g-bad');
  if (bad) bad.addEventListener('click', () => void onGuideAnswer('bad', 'continue'));
  const retry = document.getElementById('g-retry');
  if (retry) retry.addEventListener('click', () => void onGuideAnswer('bad', 'continue'));
  const skip = document.getElementById('g-skip');
  if (skip) skip.addEventListener('click', () => void onGuideAnswer('bad', 'skip'));
  const stop = document.getElementById('g-stop');
  if (stop) stop.addEventListener('click', () => void onGuideAnswer('bad', 'stop'));
}

let invResults: InvPart[] = [];

async function onInvSearch(): Promise<void> {
  clearError();
  try {
    const q = el<HTMLInputElement>('inv-q').value;
    const r = await invApi.search(state.machine, q);
    invResults = r.parts;
    const box = el('inv-results');
    if (!r.parts.length) {
      box.innerHTML = '<p class="muted">No parts found.</p>';
      return;
    }
    const rows = r.parts
      .map(
        (p, i) =>
          '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.sku) + '</td>' +
          '<td>' + p.stock_qty + '</td><td>' + p.unit_price.toFixed(2) + '</td>' +
          '<td><button type="button" data-add="' + i + '">Add</button></td></tr>',
      )
      .join('');
    box.innerHTML = '<table><tr><th>Part</th><th>SKU</th><th>Stock</th><th>USD</th><th></th></tr>' + rows + '</table>';
    box.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const part = invResults[Number(b.dataset.add)];
        const line = state.cart.find((l) => l.part.id === part.id);
        if (line) line.qty += 1;
        else state.cart.push({ part: part, qty: 1 });
        renderCart();
      });
    });
  } catch (e) {
    showError('Search failed: ' + (e as Error).message);
  }
}

function renderCart(): void {
  const box = el('inv-cart');
  if (!state.cart.length) {
    box.innerHTML = '<p class="muted">Cart is empty.</p>';
    return;
  }
  const rows = state.cart
    .map(
      (l) =>
        '<tr><td>' + escapeHtml(l.part.name) + '</td><td>' + l.qty + '</td>' +
        '<td>' + (l.qty * l.part.unit_price).toFixed(2) + '</td></tr>',
    )
    .join('');
  const total = state.cart.reduce((s, l) => s + l.qty * l.part.unit_price, 0);
  box.innerHTML =
    '<table><tr><th>Part</th><th>Qty</th><th>USD</th></tr>' + rows + '</table>' +
    '<p>Total estimate: <strong>' + total.toFixed(2) + '</strong></p>';
}

function invStatus(msg: string): void {
  el('inv-status').textContent = msg;
}

async function onInvDraft(): Promise<void> {
  clearError();
  if (!state.cart.length) {
    showError('Cart is empty.');
    return;
  }
  try {
    const budget = Number(el<HTMLInputElement>('inv-budget').value) || null;
    const lines = state.cart.map((l) => ({ part_id: l.part.id, qty: l.qty }));
    state.order = await invApi.draft(state.machine, lines, budget);
    invStatus('Draft ' + state.order.id + ': ' + state.order.total.toFixed(2) + ' USD — review, then Confirm.');
    el<HTMLButtonElement>('inv-confirm').disabled = false;
  } catch (e) {
    showError('Draft failed: ' + (e as Error).message);
  }
}

async function onInvConfirm(): Promise<void> {
  if (!state.order) return;
  clearError();
  try {
    state.order = await invApi.confirm(state.order.id);
    invStatus('Order ' + state.order.id + ' confirmed — Submit to place (simulated).');
    el<HTMLButtonElement>('inv-submit').disabled = false;
    el<HTMLButtonElement>('inv-confirm').disabled = true;
  } catch (e) {
    showError('Confirm failed: ' + (e as Error).message);
  }
}

async function onInvSubmit(): Promise<void> {
  if (!state.order) return;
  clearError();
  try {
    state.order = await invApi.submit(state.order.id);
    invStatus('Submitted (simulated). Confirmation: ' + (state.order.confirmation ?? '—'));
    el<HTMLButtonElement>('inv-submit').disabled = true;
    state.cart = [];
    renderCart();
  } catch (e) {
    showError('Submit failed: ' + (e as Error).message);
  }
}

const VIEWS = ['investigate', 'assembly', 'assistant', 'guide', 'inventory', 'build'];
let heroInit = false;

function route(): void {
  const m = window.location.hash.match(/^#\/app\/(\w+)/);
  const hero = el('route-hero');
  const app = el('route-app');
  if (!m) {
    hero.hidden = false;
    app.hidden = true;
    state.hero?.setPaused(false);
    document.title = 'Machine Fault Investigator';
    void ensureHero();
    return;
  }
  hero.hidden = true;
  app.hidden = false;
  state.hero?.setPaused(true);
  const view = VIEWS.includes(m[1]) ? m[1] : 'investigate';
  document.querySelectorAll<HTMLElement>('.view').forEach((s) => {
    const on = s.dataset.view === view;
    s.hidden = !on;
    if (on) {
      s.classList.remove('view-enter');
      void s.offsetWidth;
      s.classList.add('view-enter');
    }
  });
  document.querySelectorAll('#view-nav a').forEach((a) => {
    if ((a as HTMLElement).dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = 'MFI — ' + view;
  window.scrollTo(0, 0);
}

async function ensureHero(): Promise<void> {
  if (!heroInit) {
    heroInit = true;
    state.hero = initAssembly(el('hero-assembly'), {
      onSelect: () => {},
      labelFor: (id) => id,
      machine: 'rig',
      components: [],
      orbit: true,
      chrome: false,
    });
  }
  try {
    const meta = await api.meta();
    const unc = meta.unsupported_claims ? meta.unsupported_claims.n + ' of ' + meta.unsupported_claims.of : '—';
    const rows: [string, string][] = [
      ['eval rows', String(meta.eval_rows)],
      ['unsupported claims', unc],
      ['registry components', String(meta.components)],
      ['guided checks', String(meta.checks)],
    ];
    el('hero-stats').innerHTML = rows
      .map(([k, v]) => '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(v) + '</dd>')
      .join('');
  } catch {
    el('hero-stats').innerHTML = '';
  }
  try {
    const { packs } = await api.packs();
    const box = el('machine-cards');
    box.innerHTML = '';
    for (const p of packs) {
      const a = document.createElement('a');
      a.className = 'machine-card';
      a.href = '#/app/assembly';
      a.innerHTML =
        '<h3>' + escapeHtml(p.name) + '</h3>' +
        '<p>' + escapeHtml(p.kind) + ' · ' + p.components + ' components</p>' +
        '<span class="go">Open in Assembly →</span>';
      a.addEventListener('click', () => void switchMachine(p.machine));
      box.appendChild(a);
    }
  } catch {
    el('machine-cards').innerHTML = '';
  }
}

void buildMachineTabs().then(() => switchMachine('rig'));
void buildAssistMachines();
void buildGuideMachines();
window.addEventListener('hashchange', route);
route();
el<HTMLSelectElement>('case').addEventListener('change', () => void onSelectCase());
el<HTMLButtonElement>('go').addEventListener('click', () => void onInvestigate());
el<HTMLButtonElement>('reset').addEventListener('click', onReset);
el<HTMLButtonElement>('export').addEventListener('click', () => void onExport());
el<HTMLButtonElement>('reveal').addEventListener('click', () => void onReveal());
el<HTMLButtonElement>('up-go').addEventListener('click', () => void onUpload());
el<HTMLButtonElement>('draft-go').addEventListener('click', () => void onDraftUpload());
el<HTMLButtonElement>('assist-go').addEventListener('click', () => void onAssistSend());
el<HTMLButtonElement>('assist-seg').addEventListener('click', () => void onVisionSegment());
el<HTMLButtonElement>('assist-mic').addEventListener('click', onMic);
el<HTMLButtonElement>('assist-say').addEventListener('click', onSpeakToggle);
el<HTMLButtonElement>('guide-go').addEventListener('click', () => void onGuideStart());
el<HTMLSelectElement>('guide-machine').addEventListener('change', () => void buildGuidePlaybooks());
el<HTMLButtonElement>('inv-go').addEventListener('click', () => void onInvSearch());
el<HTMLButtonElement>('inv-draft').addEventListener('click', () => void onInvDraft());
el<HTMLButtonElement>('inv-confirm').addEventListener('click', () => void onInvConfirm());
el<HTMLButtonElement>('inv-submit').addEventListener('click', () => void onInvSubmit());
void loadCases();
