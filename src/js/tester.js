/**
 * Policy Engine — Policy Tester Tab Module
 *
 * Three subtabs:
 *   1. Single Test   — manual form-based evaluation (default)
 *   2. Scenario Library — presets, edge cases, batch "Run All"
 *   3. Request / Response — raw JSON editor + full response inspector
 *
 * The Decision Log panel is shared across all subtabs.
 *
 * @module tester
 */

import { esc, apiFetch, showToast, registerTabRenderer } from './app.js';

// ================================================================
// MODULE STATE
// ================================================================

/** @type {Array<{time:string, role:string, institute:string, permissions:string[]}>} */
let decisionLog = [];

/** @type {string[]} Known roles (fetched from backend). */
let testerRoles = [];

/** @type {string[]} Known permissions (fetched from backend). */
let knownPermissions = [];

/** @type {string[]} Known institutes (fetched from backend). */
let knownInstitutes = [];

/** @type {Array<{role:string, institute:string, name:string}>} Role-institute pairs from rules. */
let ruleScenarios = [];

/** @type {'single'|'scenarios'|'request'} Active subtab. */
let activeSubtab = 'single';

/** @type {Array<{role:string, inst:string, label:string, group:string, status:string|null, permissions:string[]|null}>} */
let scenarioItems = [];

/** @type {string} Last raw JSON request sent (for Request/Response tab). */
let lastRawRequest = '';

/** @type {string} Last raw JSON response received. */
let lastRawResponse = '';

/** @type {string} Current content of the JSON editor. */
let jsonEditorContent = '';

// ================================================================
// RENDER — main entry
// ================================================================

async function renderTester(el) {
  // Fetch rule metadata (roles, permissions, institute) in one call
  try {
    const json = await apiFetch('/api/v1/rules/meta');
    testerRoles = json.data?.roles || [];
    knownInstitutes = json.data?.institutes || [];
    knownPermissions = json.data?.permissions || [];
    ruleScenarios = json.data?.rule_scenarios || [];
  } catch (_) { /* keep previous */ }

  // Rebuild scenarios when meta data changes
  const metaKey = ruleScenarios.map(r => `${r.role}:${r.institute}`).join(',');
  if (!scenarioItems.length || scenarioItems._metaKey !== metaKey) {
    buildScenarioItems();
    scenarioItems._metaKey = metaKey;
  }

  // Seed JSON editor with template if empty
  if (!jsonEditorContent) {
    jsonEditorContent = JSON.stringify({
      name: 'John Doe',
      email: 'user@example.nl',
      role: testerRoles[0] || 'catalog_consumer',
      institute: knownInstitutes[0] || '',
    }, null, 2);
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;height:calc(100vh - var(--topbar-h) - 48px)">
      <div style="display:flex;flex-direction:column;overflow:hidden">
        <div class="htab-strip">
          <button class="htab${activeSubtab === 'single' ? ' active' : ''}" data-subtab="single">Single Test</button>
          <button class="htab${activeSubtab === 'scenarios' ? ' active' : ''}" data-subtab="scenarios">Scenario Library</button>
          <button class="htab${activeSubtab === 'request' ? ' active' : ''}" data-subtab="request">Request / Response</button>
          <button class="btn btn-sm btn-outline" id="refresh-tester-btn" title="Refresh data" style="margin-left:auto;font-size:14px;padding:4px 10px">&#8635;</button>
        </div>
        <div class="htab-content" id="subtab-content">
          ${renderSubtabContent()}
        </div>
      </div>
      <div class="log-panel">
        <div class="log-header">
          <h3>Decision Log</h3>
          <button class="btn btn-sm btn-outline" id="clear-log-btn">Clear</button>
        </div>
        <div class="log-entries" id="decision-log">
          ${decisionLog.length ? decisionLog.map(renderLogEntry).join('') : '<div style="padding:20px;color:var(--text-secondary);text-align:center">No evaluations yet.</div>'}
        </div>
      </div>
    </div>
  `;

  // Subtab switching
  el.querySelector('.htab-strip').addEventListener('click', (e) => {
    const btn = e.target.closest('.htab');
    if (btn && btn.dataset.subtab !== activeSubtab) {
      activeSubtab = btn.dataset.subtab;
      el.querySelectorAll('.htab').forEach(b => b.classList.toggle('active', b.dataset.subtab === activeSubtab));
      document.getElementById('subtab-content').innerHTML = renderSubtabContent();
      bindSubtabEvents();
    }
  });

  // Refresh — re-fetch meta and re-render
  document.getElementById('refresh-tester-btn').addEventListener('click', () => {
    scenarioItems = []; // force rebuild
    renderTester(el);
  });

  // Clear log
  document.getElementById('clear-log-btn').addEventListener('click', () => {
    decisionLog = [];
    document.getElementById('decision-log').innerHTML = '<div style="padding:20px;color:var(--text-secondary);text-align:center">No evaluations yet.</div>';
  });

  bindSubtabEvents();
}

// ================================================================
// SUBTAB CONTENT ROUTER
// ================================================================

function renderSubtabContent() {
  if (activeSubtab === 'single') return renderSingleTest();
  if (activeSubtab === 'scenarios') return renderScenarioLibrary();
  if (activeSubtab === 'request') return renderRequestResponse();
  return '';
}

// ================================================================
// SUBTAB 1 — SINGLE TEST
// ================================================================

function renderSingleTest() {
  const roleOptions = testerRoles.map(r =>
    `<option value="${esc(r)}">${esc(r)}</option>`
  ).join('');

  const MAX_QUICK = 8;
  const defaultInst = knownInstitutes[0] || '';
  const edgeCases = [
    { role: 'unknown_role', inst: '', label: 'Unknown Role', edge: true },
    { role: '', inst: '', label: 'Empty Input', edge: true },
  ];
  const maxRoles = MAX_QUICK - edgeCases.length;
  quickScenarioData = testerRoles.slice(0, maxRoles).map(role => {
    const label = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { role, inst: defaultInst, label, edge: false };
  });
  quickScenarioData.push(...edgeCases);

  const chips = quickScenarioData.map((s, i) =>
    `<button class="scenario-btn${s.edge ? ' edge' : ''}" data-qs="${i}">${esc(s.label)}</button>`
  ).join('');

  return `
    <div class="form-grid">
      <div><label>Name</label><input id="t-name" value="John Doe" placeholder="Full name"></div>
      <div><label>Email</label><input id="t-email" value="user@example.nl" placeholder="email@institute.nl"></div>
    </div>
    <div class="form-grid" style="margin-top:12px">
      <div><label>Role <span class="req">*</span></label>
        <select id="t-role">
          ${roleOptions || '<option value="">No roles configured</option>'}
        </select></div>
      <div><label>Institute <span class="req">*</span></label><input id="t-institute" value="${esc(knownInstitutes[0] || '')}" placeholder="${knownInstitutes.length ? 'e.g. ' + knownInstitutes.join(', ') : 'Enter institute name'}"></div>
    </div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="evaluate-btn">Evaluate Policy</button>
    </div>
    <div style="margin-top:16px">
      <label>Quick Scenarios</label>
      <div class="scenarios">${chips}</div>
    </div>
    <div id="t-result"></div>
    <div style="margin-top:16px;padding:10px 14px;background:var(--surface2);border-radius:6px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--text)">How it works:</strong>
      Sends POST <code>/api/v1/policies/evaluate</code> with {name, email, role, institute}.
      Policy Agent returns permissions for the role. If permissions &gt; 0 the result is <strong style="color:var(--green)">ALLOWED</strong>,
      otherwise <strong style="color:var(--red)">DENIED</strong>. All evaluations are logged on the right.
    </div>
  `;
}

/** @type {Array<{role:string, inst:string, label:string, edge:boolean}>} Quick scenario data for Single Test chips. */
let quickScenarioData = [];

// ================================================================
// SUBTAB 2 — SCENARIO LIBRARY
// ================================================================

function buildScenarioItems() {
  const items = [];
  const allInstitutes = [...knownInstitutes];
  const allRoles = [...testerRoles];
  const validPairs = new Set(ruleScenarios.map(rs => `${rs.role}|${rs.institute}`));

  // 1. VALID — exact role+institute from rules (expect allow)
  for (const rs of ruleScenarios) {
    const label = rs.name || rs.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    items.push({ role: rs.role, inst: rs.institute, label, group: 'valid', expect: 'allow', status: null, permissions: null });
  }

  // 2. CROSS-INSTITUTE — each role tested against institutes it doesn't belong to (expect deny)
  for (const rs of ruleScenarios) {
    for (const inst of allInstitutes) {
      if (inst !== rs.institute && !validPairs.has(`${rs.role}|${inst}`)) {
        const label = `${rs.role} + ${inst}`;
        items.push({ role: rs.role, inst, label, group: 'cross-inst', expect: 'deny', status: null, permissions: null });
      }
    }
  }

  // 3. CROSS-ROLE — each institute tested with roles it doesn't have (expect deny)
  const instRoleMap = {};
  for (const rs of ruleScenarios) {
    (instRoleMap[rs.institute] ??= new Set()).add(rs.role);
  }
  for (const inst of allInstitutes) {
    const assignedRoles = instRoleMap[inst] || new Set();
    for (const role of allRoles) {
      if (!assignedRoles.has(role) && !validPairs.has(`${role}|${inst}`)) {
        // Avoid duplicating cross-institute entries
        if (!items.some(it => it.role === role && it.inst === inst)) {
          const label = `${role} + ${inst}`;
          items.push({ role, inst, label, group: 'cross-role', expect: 'deny', status: null, permissions: null });
        }
      }
    }
  }

  // 4. EDGE CASES — boundary conditions
  const defaultInst = allInstitutes[0] || 'test';
  const edgeCases = [
    { role: 'unknown_role', inst: defaultInst, label: 'Unknown Role', group: 'edge', expect: 'deny', status: null, permissions: null },
    { role: allRoles[0] || 'catalog_consumer', inst: 'nonexistent_institute', label: 'Nonexistent Institute', group: 'edge', expect: 'deny', status: null, permissions: null },
    { role: '', inst: '', label: 'Empty Input', group: 'edge', expect: 'deny', status: null, permissions: null },
    { role: 'admin', inst: defaultInst, label: 'Privileged Role Probe', group: 'edge', expect: 'deny', status: null, permissions: null },
  ];
  items.push(...edgeCases);

  scenarioItems = items;
}

function renderScenarioLibrary() {
  const groupLabels = {
    'valid': { title: 'Valid Rules (expect Allow)', color: 'var(--green)', icon: '&#10003;' },
    'cross-inst': { title: 'Cross-Institute (expect Deny)', color: 'var(--yellow)', icon: '&#8644;' },
    'cross-role': { title: 'Cross-Role (expect Deny)', color: 'var(--yellow)', icon: '&#8645;' },
    'edge': { title: 'Edge Cases (expect Deny)', color: 'var(--red)', icon: '&#9888;' },
  };
  const groupOrder = ['valid', 'cross-inst', 'cross-role', 'edge'];

  let rows = '';
  let lastGroup = '';
  scenarioItems.forEach((s, i) => {
    // Group header
    if (s.group !== lastGroup) {
      lastGroup = s.group;
      const g = groupLabels[s.group] || { title: s.group, color: 'var(--text)', icon: '' };
      rows += `<tr><td colspan="7" style="padding:10px 12px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${g.color};border-bottom:2px solid ${g.color}">${g.icon} ${g.title}</td></tr>`;
    }

    let statusBadge = '<span class="badge" style="background:var(--surface3);color:var(--text-secondary)">Not run</span>';
    if (s.status === 'allow') statusBadge = '<span class="badge badge-green">ALLOW</span>';
    else if (s.status === 'deny') statusBadge = '<span class="badge badge-red">DENY</span>';
    else if (s.status === 'error') statusBadge = '<span class="badge badge-red">ERROR</span>';
    else if (s.status === 'running') statusBadge = '<span class="badge badge-blue">...</span>';

    // Check if result matches expectation
    let matchIcon = '';
    if (s.status && s.status !== 'running') {
      const passed = (s.expect === 'allow' && s.status === 'allow') || (s.expect === 'deny' && (s.status === 'deny' || s.status === 'error'));
      matchIcon = passed
        ? '<span style="color:var(--green);font-size:13px" title="As expected">&#10003;</span>'
        : '<span style="color:var(--red);font-size:13px" title="Unexpected result">&#10007;</span>';
    }

    const permCount = s.permissions ? s.permissions.length : '-';
    const isEdgy = s.group !== 'valid';
    const rowStyle = isEdgy ? ' style="opacity:.8"' : '';

    rows += `<tr${rowStyle}>
      <td style="font-size:12px">${esc(s.label)}</td>
      <td><span class="badge badge-purple" style="font-size:10px">${esc(s.role || '(empty)')}</span></td>
      <td style="font-size:12px">${esc(s.inst || '(empty)')}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${esc(s.expect)}</td>
      <td>${statusBadge} ${matchIcon}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${permCount}</td>
      <td>
        <button class="btn btn-sm btn-outline scenario-run-btn" data-idx="${i}">Run</button>
        <button class="btn btn-sm btn-outline scenario-fill-btn" data-idx="${i}" title="Fill into Single Test">Fill</button>
      </td>
    </tr>`;
  });

  const totalRun = scenarioItems.filter(s => s.status && s.status !== 'running').length;
  const totalAllow = scenarioItems.filter(s => s.status === 'allow').length;
  const totalDeny = scenarioItems.filter(s => s.status === 'deny' || s.status === 'error').length;
  const totalPassed = scenarioItems.filter(s => {
    if (!s.status || s.status === 'running') return false;
    return (s.expect === 'allow' && s.status === 'allow') || (s.expect === 'deny' && (s.status === 'deny' || s.status === 'error'));
  }).length;
  const totalFailed = totalRun - totalPassed;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" id="run-all-btn">Run All (${scenarioItems.length})</button>
        <button class="btn btn-sm btn-outline" id="reset-scenarios-btn">Reset</button>
      </div>
    </div>
    ${totalRun ? `<div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px;flex-wrap:wrap">
      <span style="color:var(--text-secondary)">Tested: <strong style="color:var(--text)">${totalRun}/${scenarioItems.length}</strong></span>
      <span style="color:var(--green)">Passed: <strong>${totalPassed}</strong></span>
      ${totalFailed ? `<span style="color:var(--red)">Failed: <strong>${totalFailed}</strong></span>` : ''}
      <span style="color:var(--text-secondary)">Allow: <strong>${totalAllow}</strong></span>
      <span style="color:var(--text-secondary)">Deny: <strong>${totalDeny}</strong></span>
    </div>` : ''}
    <div style="overflow-x:auto">
      <table class="matrix-table" style="font-size:12px">
        <tr>
          <th>Scenario</th><th>Role</th><th>Institute</th>
          <th>Expected</th><th>Result</th><th>Perms</th><th style="width:120px">Actions</th>
        </tr>
        ${rows}
      </table>
    </div>
    <div style="margin-top:16px;padding:10px 14px;background:var(--surface2);border-radius:6px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--text)">Scenario Library:</strong>
      Auto-generated test matrix covering valid rules, cross-institute/cross-role mismatches, and edge cases.
      <strong>Run All</strong> evaluates every scenario and checks results against expectations.
      <span style="color:var(--green)">&#10003;</span> = as expected, <span style="color:var(--red)">&#10007;</span> = unexpected result.
    </div>
  `;
}

// ================================================================
// SUBTAB 3 — REQUEST / RESPONSE
// ================================================================

function renderRequestResponse() {
  return `
    <div>
      <label>Request Body (JSON)</label>
      <textarea id="json-editor" rows="8"
        style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;width:100%;resize:vertical;
        padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">${esc(jsonEditorContent)}</textarea>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-sm btn-primary" id="send-raw-btn">Send to /api/v1/policies/evaluate</button>
      <button class="btn btn-sm btn-outline" id="format-json-btn">Format JSON</button>
    </div>
    ${lastRawRequest ? `
    <div style="margin-top:16px">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">REQUEST SENT</div>
      <div class="code-block" style="font-size:12px">${esc(lastRawRequest)}</div>
    </div>` : ''}
    ${lastRawResponse ? `
    <div style="margin-top:16px">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">RESPONSE RECEIVED</div>
      <div class="code-block" style="font-size:12px">${esc(lastRawResponse)}</div>
    </div>` : ''}
    <div style="margin-top:16px;padding:10px 14px;background:var(--surface2);border-radius:6px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--text)">Advanced mode:</strong>
      Edit the raw JSON payload and send it directly to the evaluate endpoint.
      Use this to test edge cases, malformed input, or custom fields beyond the standard form.
      Press <kbd style="padding:1px 6px;background:var(--surface3);border:1px solid var(--border);border-radius:3px;font-size:11px">Ctrl+Enter</kbd> to send.
    </div>
  `;
}

// ================================================================
// EVENT BINDING (per subtab)
// ================================================================

function bindSubtabEvents() {
  if (activeSubtab === 'single') {
    const evalBtn = document.getElementById('evaluate-btn');
    if (evalBtn) evalBtn.addEventListener('click', evaluatePolicy);

    // Clear red highlight on input/change
    ['t-role', 't-institute'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => el.classList.remove('field-error'));
    });

    // Quick scenario chips — pre-fill form only
    document.querySelectorAll('.scenario-btn[data-qs]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = quickScenarioData[parseInt(btn.dataset.qs)];
        if (!s) return;
        document.getElementById('t-role').value = s.role;
        document.getElementById('t-institute').value = s.inst;
        document.getElementById('t-name').value = s.role ? s.role.replace(/_/g, ' ') + ' user' : '';
        document.getElementById('t-email').value = s.inst ? `user@${s.inst}.nl` : '';
        // Clear any error highlights
        ['t-role', 't-institute'].forEach(id => document.getElementById(id).classList.remove('field-error'));
      });
    });
  }

  if (activeSubtab === 'scenarios') {
    const runAllBtn = document.getElementById('run-all-btn');
    if (runAllBtn) runAllBtn.addEventListener('click', runAllScenarios);

    const resetBtn = document.getElementById('reset-scenarios-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      scenarioItems.forEach(s => { s.status = null; s.permissions = null; });
      document.getElementById('subtab-content').innerHTML = renderScenarioLibrary();
      bindSubtabEvents();
    });

    // Individual run / fill buttons
    document.querySelectorAll('.scenario-run-btn').forEach(btn => {
      btn.addEventListener('click', () => runSingleScenario(parseInt(btn.dataset.idx)));
    });
    document.querySelectorAll('.scenario-fill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = scenarioItems[parseInt(btn.dataset.idx)];
        activeSubtab = 'single';
        document.getElementById('subtab-content').innerHTML = renderSubtabContent();
        document.querySelectorAll('.htab').forEach(b => b.classList.toggle('active', b.dataset.subtab === 'single'));
        bindSubtabEvents();
        // Fill form fields
        document.getElementById('t-role').value = s.role;
        document.getElementById('t-institute').value = s.inst;
        document.getElementById('t-name').value = s.role.replace(/_/g, ' ') + ' user';
        document.getElementById('t-email').value = `user@${s.inst}.nl`;
      });
    });
  }

  if (activeSubtab === 'request') {
    const sendBtn = document.getElementById('send-raw-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendRawRequest);

    const formatBtn = document.getElementById('format-json-btn');
    if (formatBtn) formatBtn.addEventListener('click', () => {
      const editor = document.getElementById('json-editor');
      try {
        const parsed = JSON.parse(editor.value);
        editor.value = JSON.stringify(parsed, null, 2);
        jsonEditorContent = editor.value;
      } catch (_) {
        showToast('Invalid JSON — cannot format', 'error');
      }
    });

    const editor = document.getElementById('json-editor');
    if (editor) {
      editor.addEventListener('input', () => { jsonEditorContent = editor.value; });
      editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          sendRawRequest();
        }
      });
    }
  }
}

// ================================================================
// LOG ENTRY
// ================================================================

function renderLogEntry(entry) {
  const isAllow = entry.permissions && entry.permissions.length > 0;
  const cls = isAllow ? 'allow' : 'deny';
  return `<div class="log-entry ${cls}">
    <span class="log-time">${entry.time}</span>
    <span class="log-status ${cls}">${isAllow ? 'ALLOW' : 'DENY'}</span>
    <span style="margin-left:6px">role=${esc(entry.role)}</span>
    <div class="log-detail">institute=${esc(entry.institute)} permissions=[${(entry.permissions || []).map(esc).join(', ')}]</div>
  </div>`;
}

function appendToLog(role, institute, permissions) {
  const now = new Date();
  decisionLog.unshift({ time: now.toLocaleTimeString(), role, institute, permissions });
  const logEl = document.getElementById('decision-log');
  if (logEl) logEl.innerHTML = decisionLog.map(renderLogEntry).join('');
}

// ================================================================
// SINGLE TEST — EVALUATE
// ================================================================

async function evaluatePolicy() {
  const fields = {
    't-role': document.getElementById('t-role'),
    't-institute': document.getElementById('t-institute'),
  };

  // Clear previous highlights
  Object.values(fields).forEach(el => el.classList.remove('field-error'));

  // Validate mandatory fields
  const missing = Object.entries(fields).filter(([, el]) => !el.value.trim());
  if (missing.length) {
    missing.forEach(([, el]) => el.classList.add('field-error'));
    const names = missing.map(([id]) => id === 't-role' ? 'Role' : 'Institute');
    showToast(`${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} required`, 'error');
    return;
  }

  const body = {
    name: document.getElementById('t-name').value,
    email: document.getElementById('t-email').value,
    role: fields['t-role'].value,
    institute: fields['t-institute'].value,
  };
  try {
    const json = await apiFetch('/api/v1/policies/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const perms = json.data?.permissions || [];
    const isAllow = perms.length > 0;
    document.getElementById('t-result').innerHTML = `
      <div class="result-card ${isAllow ? 'allowed' : 'denied'}">
        <div class="result-status">${isAllow ? '<span style="color:var(--green)">&#10003; ALLOWED</span>' : '<span style="color:var(--red)">&#10007; DENIED</span>'}</div>
        <div class="card-muted">Permissions (${perms.length})</div>
        <div class="result-perms">${perms.map(p => `<span class="perm-tag">${esc(p)}</span>`).join('') || '<span class="card-muted">No permissions granted</span>'}</div>
      </div>`;
    appendToLog(body.role, body.institute, perms);
  } catch (e) {
    showToast(e.message, 'error');
    document.getElementById('t-result').innerHTML = `<div class="result-card denied"><div class="result-status" style="color:var(--red)">Error: ${esc(e.message)}</div></div>`;
  }
}

// ================================================================
// SCENARIO LIBRARY — RUN
// ================================================================

async function runSingleScenario(idx) {
  const s = scenarioItems[idx];
  s.status = 'running';
  refreshScenarioTable();

  const body = {
    name: s.role.replace(/_/g, ' ') + ' user',
    email: `user@${s.inst}.nl`,
    role: s.role,
    institute: s.inst,
  };

  try {
    const json = await apiFetch('/api/v1/policies/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const perms = json.data?.permissions || [];
    s.status = perms.length > 0 ? 'allow' : 'deny';
    s.permissions = perms;
    appendToLog(body.role, body.institute, perms);
  } catch (_) {
    s.status = 'error';
    s.permissions = [];
  }
  refreshScenarioTable();
}

async function runAllScenarios() {
  const runAllBtn = document.getElementById('run-all-btn');
  if (runAllBtn) { runAllBtn.disabled = true; runAllBtn.textContent = 'Running...'; }

  for (let i = 0; i < scenarioItems.length; i++) {
    await runSingleScenario(i);
  }

  if (runAllBtn) { runAllBtn.disabled = false; runAllBtn.textContent = 'Run All'; }
}

function refreshScenarioTable() {
  const content = document.getElementById('subtab-content');
  if (content && activeSubtab === 'scenarios') {
    content.innerHTML = renderScenarioLibrary();
    bindSubtabEvents();
  }
}

// ================================================================
// REQUEST / RESPONSE — SEND
// ================================================================

async function sendRawRequest() {
  const editor = document.getElementById('json-editor');
  const raw = editor.value.trim();
  jsonEditorContent = raw;

  if (!raw) {
    showToast('Enter a JSON request body first', 'info');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    showToast('Invalid JSON — fix the syntax and try again', 'error');
    return;
  }

  lastRawRequest = JSON.stringify(parsed, null, 2);
  lastRawResponse = 'Sending...';

  // Re-render to show request
  document.getElementById('subtab-content').innerHTML = renderRequestResponse();
  bindSubtabEvents();

  try {
    const response = await fetch('/api/v1/policies/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const json = await response.json();
    lastRawResponse = JSON.stringify(json, null, 2);

    // Log it
    const perms = json.data?.permissions || [];
    appendToLog(parsed.role || '(raw)', parsed.institute || '(raw)', perms);
  } catch (e) {
    lastRawResponse = JSON.stringify({ error: e.message }, null, 2);
  }

  document.getElementById('subtab-content').innerHTML = renderRequestResponse();
  bindSubtabEvents();
}

// ================================================================
// REGISTER
// ================================================================

registerTabRenderer('tester', renderTester);
