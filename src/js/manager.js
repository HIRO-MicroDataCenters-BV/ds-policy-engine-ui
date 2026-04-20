/**
 * Policy Engine — Policy Manager Tab Module
 *
 * Displays policy overview stats, live decision matrix, rule conflicts/warnings,
 * deploy history, and export/import controls.
 *
 * @module manager
 */

import { esc, apiFetch, showToast, registerTabRenderer } from './app.js';

// ================================================================
// STATE
// ================================================================

let matrixFilter = '';
let matrixData = null;
let overviewData = null;

// ================================================================
// RENDER
// ================================================================

async function renderManager(el) {
  el.innerHTML = '<div class="card"><div class="card-header">Loading...</div></div>';

  // Fetch overview + matrix in parallel
  try {
    const [ovJson] = await Promise.all([
      apiFetch('/api/v1/policies/overview'),
    ]);
    overviewData = ovJson.data;
  } catch (e) {
    overviewData = null;
  }

  const stats = overviewData?.stats || {};
  const conflicts = overviewData?.conflicts || [];
  const warnings = overviewData?.warnings || [];
  const history = overviewData?.deploy_history || [];

  // Format last deployed
  let lastDeployedStr = 'Never';
  if (stats.last_deployed) {
    try {
      const d = new Date(stats.last_deployed);
      lastDeployedStr = d.toLocaleString();
    } catch (_) {
      lastDeployedStr = stats.last_deployed;
    }
  }

  // Conflicts + Warnings HTML
  let alertsHtml = '';
  if (conflicts.length) {
    alertsHtml += `<div class="card" style="border-left:3px solid var(--red);padding:12px 16px">
      <div style="font-weight:600;color:var(--red);margin-bottom:8px">&#9888; Conflicts (${conflicts.length})</div>
      ${conflicts.map(c => `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">${esc(c.message)}</div>`).join('')}
    </div>`;
  }
  if (warnings.length) {
    alertsHtml += `<div class="card" style="border-left:3px solid var(--yellow);padding:12px 16px">
      <div style="font-weight:600;color:var(--yellow);margin-bottom:8px">&#9888; Warnings (${warnings.length})</div>
      ${warnings.map(w => `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">${esc(w.message)}</div>`).join('')}
    </div>`;
  }

  // Deploy history rows
  const historyRows = history.length
    ? history.map(h => {
        let ts = h.deployed_at || '';
        try { ts = new Date(h.deployed_at).toLocaleString(); } catch (_) {}
        const roles = (h.roles || []).map(r => `<span class="badge badge-purple" style="font-size:10px">${esc(r)}</span>`).join(' ');
        const ver = h.version != null ? `<span class="badge badge-blue" style="font-size:10px">v${h.version}</span>` : '';
        return `<tr>
          <td style="font-size:12px;white-space:nowrap">${ver}</td>
          <td style="font-size:12px;white-space:nowrap">${esc(ts)}</td>
          <td style="font-size:12px">${esc(h.deployed_by || '-')}</td>
          <td style="font-size:12px;text-align:center">${h.rules_count ?? '-'}</td>
          <td>${roles || '<span style="color:var(--text-secondary);font-size:11px">-</span>'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);font-size:12px;padding:16px">No deployments yet</td></tr>';

  el.innerHTML = `
    <div class="manager-view">
    <div class="manager-stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total_rules ?? '-'}</div>
        <div class="stat-label">Total Rules</div>
        <div class="stat-detail"><span style="color:var(--green)">${stats.enabled_rules ?? 0} enabled</span> &middot; <span style="color:var(--text-secondary)">${stats.disabled_rules ?? 0} disabled</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.roles ?? '-'}</div>
        <div class="stat-label">Roles</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.institutes ?? '-'}</div>
        <div class="stat-label">Institutes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.permissions ?? '-'}</div>
        <div class="stat-label">Permissions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:14px">${esc(lastDeployedStr)}</div>
        <div class="stat-label">Last Deployed</div>
      </div>
    </div>

    ${alertsHtml}

    <div class="card">
      <div class="card-header">Decision Matrix<button class="btn btn-sm btn-outline" id="refresh-matrix-btn" title="Refresh matrix" style="font-size:14px;padding:4px 10px">&#8635;</button></div>
      <div style="margin-bottom:12px">
        <input type="text" id="matrix-filter" placeholder="Filter by role or permission (wildcard: catalog*)" value="${esc(matrixFilter)}"
          style="width:100%;max-width:400px;padding:7px 12px;font-size:13px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
      </div>
      <div id="matrix-container"><div class="card-muted">Loading...</div></div>
    </div>

    <div class="manager-bottom-grid">
      <div class="card">
        <div class="card-header">Deploy History</div>
        <div style="max-height:300px;overflow-y:auto;overflow-x:auto">
          <table class="matrix-table" style="font-size:12px">
            <thead style="position:sticky;top:0;background:var(--surface);z-index:1">
              <tr><th>Version</th><th>Timestamp</th><th>Deployed By</th><th>Rules</th><th>Roles</th></tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">Export / Import</div>
        <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
          <div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Export rules in different formats</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm btn-outline" id="export-json-btn">&#8615; JSON</button>
              <button class="btn btn-sm btn-outline" id="export-csv-btn">&#8615; CSV</button>
              <button class="btn btn-sm btn-outline" id="export-rego-btn">&#8615; Rego</button>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:12px">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Import rules from JSON or CSV</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="file" id="import-file" accept=".json,.csv" style="font-size:12px;max-width:220px">
              <select id="import-mode" style="font-size:12px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                <option value="merge">Merge (skip existing)</option>
                <option value="replace">Replace (delete all first)</option>
              </select>
              <button class="btn btn-sm btn-primary" id="import-btn">&#8613; Import</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  // Bind events
  document.getElementById('refresh-matrix-btn').addEventListener('click', () => {
    matrixData = null;
    loadMatrix();
  });
  document.getElementById('matrix-filter').addEventListener('input', (e) => {
    matrixFilter = e.target.value;
    renderMatrix();
  });
  document.getElementById('export-json-btn').addEventListener('click', () => exportRules('json'));
  document.getElementById('export-csv-btn').addEventListener('click', () => exportRules('csv'));
  document.getElementById('export-rego-btn').addEventListener('click', () => exportRules('rego'));
  document.getElementById('import-btn').addEventListener('click', importRules);

  loadMatrix();
}

// ================================================================
// DECISION MATRIX
// ================================================================

async function loadMatrix() {
  try {
    const json = await apiFetch('/api/v1/decision-matrix');
    matrixData = json.data;
    renderMatrix();
  } catch (e) {
    document.getElementById('matrix-container').innerHTML = `<div class="card-muted">Error: ${esc(e.message)}</div>`;
  }
}

function renderMatrix() {
  const container = document.getElementById('matrix-container');
  if (!matrixData) return;

  const matrix = matrixData.matrix || [];
  let permissions = matrixData.permissions || [];

  if (!matrix.length) {
    container.innerHTML = '<div class="card-muted">Deploy policies first to see the matrix</div>';
    return;
  }

  const filter = matrixFilter.trim().toLowerCase();
  let filteredMatrix = matrix;
  let filteredPerms = permissions;

  if (filter) {
    const regex = new RegExp('^' + filter.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    const matchingPerms = permissions.filter(p => regex.test(p));
    const matchingRoles = matrix.filter(m => regex.test(m.role));

    if (matchingPerms.length > 0 && matchingRoles.length === 0) {
      filteredPerms = matchingPerms;
      filteredMatrix = matrix;
    } else if (matchingRoles.length > 0 && matchingPerms.length === 0) {
      filteredMatrix = matchingRoles;
      filteredPerms = permissions;
    } else if (matchingPerms.length > 0 && matchingRoles.length > 0) {
      filteredMatrix = matchingRoles;
      filteredPerms = matchingPerms;
    } else {
      const partial = filter.replace(/\*/g, '');
      filteredMatrix = matrix.filter(m => m.role.toLowerCase().includes(partial));
      filteredPerms = permissions.filter(p => p.toLowerCase().includes(partial));
      if (!filteredPerms.length) filteredPerms = permissions;
      if (!filteredMatrix.length) filteredMatrix = matrix;
    }
  }

  const headerCells = filteredPerms.map(p => `<th>${esc(p)}</th>`).join('');

  const rows = filteredMatrix.map(m => {
    const cells = filteredPerms.map(perm => {
      const key = perm.replace(/:/g, '_').replace(/-/g, '_');
      const has = m[key];
      const badge = has
        ? (perm.includes('decentralized') || perm.includes('federated')
          ? '<span class="badge badge-cyan">Yes</span>'
          : '<span class="badge badge-green">Yes</span>')
        : '<span class="badge badge-red">No</span>';
      return `<td>${badge}</td>`;
    }).join('');
    const instBadge = m.institute ? `<span class="badge badge-blue" style="font-size:10px">${esc(m.institute)}</span>` : '';
    return `<tr><td><span class="badge badge-purple">${esc(m.role)}</span> ${instBadge}</td>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="matrix-table">
        <tr><th>Role</th>${headerCells}</tr>
        ${rows}
      </table>
    </div>
    <div class="card-muted" style="margin-top:8px">${filteredMatrix.length} role(s) &times; ${filteredPerms.length} permission(s)</div>
  `;
}

// ================================================================
// EXPORT / IMPORT
// ================================================================

/**
 * Export rules in the specified format.
 * @param {'json'|'csv'|'rego'} format
 */
async function exportRules(format) {
  try {
    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const json = await apiFetch('/api/v1/rules/export/json');
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `policy-rules-${dateStr}.json`);
    } else if (format === 'csv') {
      const resp = await fetch('/api/v1/rules/export/csv');
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`CSV export failed (${resp.status}): ${text.slice(0, 200)}`);
      }
      const blob = new Blob([text], { type: 'text/csv' });
      downloadBlob(blob, `policy-rules-${dateStr}.csv`);
    } else if (format === 'rego') {
      const resp = await fetch('/api/v1/rules/export/rego');
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`Rego export failed (${resp.status}): ${text.slice(0, 200)}`);
      }
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `policy-${dateStr}.rego`);
    }

    showToast(`Exported rules as ${format.toUpperCase()}`, 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import rules from JSON or CSV file.
 */
async function importRules() {
  const fileInput = document.getElementById('import-file');
  const mode = document.getElementById('import-mode').value;
  const file = fileInput.files?.[0];

  if (!file) {
    showToast('Please select a file first', 'error');
    return;
  }

  const text = await file.text();
  const isCSV = file.name.endsWith('.csv');

  try {
    let json;
    if (isCSV) {
      json = await apiFetch('/api/v1/rules/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_content: text, mode }),
      });
    } else {
      const data = JSON.parse(text);
      const rules = data.rules ?? data;
      if (!Array.isArray(rules)) {
        throw new Error('JSON import must be an array of rules or an object with a "rules" array');
      }
      json = await apiFetch('/api/v1/rules/import/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, mode }),
      });
    }

    const result = json.data;
    showToast(`Imported ${result.imported} rule(s), skipped ${result.skipped}`, 'success');
    fileInput.value = '';
    renderManager(document.getElementById('main-content'));
  } catch (e) {
    showToast('Import failed: ' + e.message, 'error');
  }
}

// ================================================================
// REGISTER
// ================================================================

registerTabRenderer('manager', renderManager);
