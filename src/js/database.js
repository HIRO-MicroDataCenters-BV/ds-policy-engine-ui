/**
 * Policy Engine — Database Explorer Tab Module
 *
 * Provides a read-only DB viewer showing table stats, table browser,
 * and a SQL query editor with built-in queries and free-form input.
 *
 * @module database
 */

import { esc, apiFetch, showToast, registerTabRenderer } from './app.js';

// ================================================================
// STATE
// ================================================================

/** @type {"rules"|"metadata"|"deploy_history"} Currently selected table. */
let activeTable = 'rules';

/** @type {string} Current SQL in the query editor. */
let currentQuery = '';

// ================================================================
// BUILT-IN QUERIES
// ================================================================

/** @type {Array<{label:string, sql:string}>} Pre-built queries for quick access. */
const BUILT_IN_QUERIES = [
  { label: 'All Rules', sql: 'SELECT id, name, role, permissions_json, enabled, created_at, updated_at FROM rules ORDER BY created_at' },
  { label: 'Enabled Rules', sql: 'SELECT id, name, role, permissions_json, created_at FROM rules WHERE enabled = 1 ORDER BY name' },
  { label: 'Disabled Rules', sql: 'SELECT id, name, role, permissions_json, created_at FROM rules WHERE enabled = 0 ORDER BY name' },
  { label: 'Rules per Role', sql: 'SELECT role, COUNT(*) as rule_count, SUM(enabled) as enabled, COUNT(*) - SUM(enabled) as disabled FROM rules GROUP BY role ORDER BY rule_count DESC' },
  { label: 'Recent Changes', sql: 'SELECT id, name, role, updated_at FROM rules ORDER BY updated_at DESC LIMIT 10' },
  { label: 'All Metadata', sql: 'SELECT * FROM app_metadata ORDER BY key' },
  { label: 'Deploy History', sql: 'SELECT id, version, deployed_at, deployed_by, rules_count, roles_json FROM deploy_history ORDER BY id DESC LIMIT 20' },
  { label: 'Table Schema', sql: "SELECT name, type, pk FROM pragma_table_info('rules')" },
];

// ================================================================
// RENDER
// ================================================================

/**
 * Render the Database Explorer tab.
 *
 * @param {HTMLElement} el - The main content container.
 */
async function renderDatabase(el) {
  el.innerHTML = '<div class="card"><div class="card-header">Loading database...</div></div>';

  // Fetch stats
  let stats = null;
  try {
    const json = await apiFetch('/api/v1/db/stats');
    stats = json.data;
  } catch (e) {
    showToast('Failed to load DB stats: ' + e.message, 'error');
    el.innerHTML = `<div class="card"><div class="card-header">Database Explorer</div><div class="card-muted">Error: ${esc(e.message)}</div></div>`;
    return;
  }

  const rulesStats = stats.tables.rules;
  const metaStats = stats.tables.app_metadata;
  const deployStats = stats.tables.deploy_history || { total: 0 };

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        Database Explorer
        <button class="btn btn-sm btn-outline" id="db-refresh-btn" title="Refresh data" style="font-size:14px;padding:4px 10px">&#8635;</button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div class="db-stat-card">
          <div class="db-stat-value">${esc(stats.engine)}</div>
          <div class="db-stat-label">Engine</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value">${rulesStats.total}</div>
          <div class="db-stat-label">Total Rules</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value" style="color:var(--green)">${rulesStats.enabled}</div>
          <div class="db-stat-label">Enabled</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value" style="color:var(--red)">${rulesStats.disabled}</div>
          <div class="db-stat-label">Disabled</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value">${stats.roles_count}</div>
          <div class="db-stat-label">Distinct Roles</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value">${metaStats.total}</div>
          <div class="db-stat-label">Metadata Keys</div>
        </div>
        <div class="db-stat-card">
          <div class="db-stat-value">${deployStats.total}</div>
          <div class="db-stat-label">Deployments</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm ${activeTable === 'rules' ? 'btn-primary' : 'btn-outline'}" id="tab-rules-btn">rules</button>
          <button class="btn btn-sm ${activeTable === 'metadata' ? 'btn-primary' : 'btn-outline'}" id="tab-meta-btn">app_metadata</button>
          <button class="btn btn-sm ${activeTable === 'deploy_history' ? 'btn-primary' : 'btn-outline'}" id="tab-deploy-btn">deploy_history</button>
        </div>
      </div>
      <div id="db-table-container"><div class="card-muted">Loading...</div></div>
    </div>

    <div class="card">
      <div class="card-header">SQL Query Editor <span style="font-size:11px;color:var(--text-secondary);font-weight:400">(read-only — SELECT only)</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${BUILT_IN_QUERIES.map((q, i) => `<button class="scenario-btn" data-qi="${i}">${esc(q.label)}</button>`).join('')}
      </div>
      <textarea id="sql-editor" rows="3" placeholder="SELECT * FROM rules WHERE role = 'catalog_owner'"
        style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;width:100%;resize:vertical;
        padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">${esc(currentQuery)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sm btn-primary" id="run-query-btn">Run Query</button>
        <button class="btn btn-sm btn-outline" id="clear-query-btn">Clear</button>
      </div>
      <div id="query-result" style="margin-top:12px"></div>
    </div>
  `;

  // Bind events
  document.getElementById('db-refresh-btn').addEventListener('click', () => {
    renderDatabase(document.getElementById('main-content'));
  });
  document.getElementById('tab-rules-btn').addEventListener('click', () => {
    activeTable = 'rules';
    renderDatabase(document.getElementById('main-content'));
  });
  document.getElementById('tab-meta-btn').addEventListener('click', () => {
    activeTable = 'metadata';
    renderDatabase(document.getElementById('main-content'));
  });
  document.getElementById('tab-deploy-btn').addEventListener('click', () => {
    activeTable = 'deploy_history';
    renderDatabase(document.getElementById('main-content'));
  });

  // Built-in query buttons
  el.querySelectorAll('.scenario-btn[data-qi]').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = BUILT_IN_QUERIES[parseInt(btn.dataset.qi)];
      document.getElementById('sql-editor').value = q.sql;
      currentQuery = q.sql;
      runQuery();
    });
  });

  document.getElementById('run-query-btn').addEventListener('click', runQuery);
  document.getElementById('clear-query-btn').addEventListener('click', () => {
    document.getElementById('sql-editor').value = '';
    document.getElementById('query-result').innerHTML = '';
    currentQuery = '';
  });

  // Ctrl+Enter to run
  document.getElementById('sql-editor').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });

  // Load table data
  loadTable();
}

// ================================================================
// TABLE RENDERING
// ================================================================

/**
 * Fetch and render the currently selected table into the container.
 *
 * @returns {Promise<void>}
 */
async function loadTable() {
  const container = document.getElementById('db-table-container');

  try {
    if (activeTable === 'rules') {
      const json = await apiFetch('/api/v1/db/tables/rules');
      const rows = json.data?.rows || [];
      if (!rows.length) {
        container.innerHTML = '<div class="card-muted">No rules in database</div>';
        return;
      }

      container.innerHTML = `
        <div style="overflow-x:auto">
          <table class="matrix-table" style="font-size:12px">
            <tr>
              <th>ID</th><th>Name</th><th>Role</th>
              <th>Permissions</th><th>Enabled</th>
              <th>Created</th><th>Updated</th>
            </tr>
            ${rows.map(r => `
              <tr>
                <td><code style="font-size:11px;color:var(--text-secondary)">${esc(r.id ?? '-')}</code></td>
                <td><strong>${esc(r.name ?? '-')}</strong></td>
                <td>${r.role ? `<span class="badge badge-purple">${esc(r.role)}</span>` : '<span class="card-muted">-</span>'}</td>
                <td>${Array.isArray(r.permissions) && r.permissions.length ? r.permissions.map(p => `<span class="perm-tag" style="font-size:10px">${esc(p)}</span>`).join(' ') : '<span class="card-muted">none</span>'}</td>
                <td>${r.enabled == null ? '<span class="card-muted">-</span>' : r.enabled ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>'}</td>
                <td style="font-size:11px;white-space:nowrap">${esc(formatDate(r.created_at))}</td>
                <td style="font-size:11px;white-space:nowrap">${esc(formatDate(r.updated_at))}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        <div class="card-muted" style="margin-top:8px">${rows.length} row(s)</div>
      `;
    } else if (activeTable === 'metadata') {
      const json = await apiFetch('/api/v1/db/tables/metadata');
      const rows = json.data?.rows || [];
      if (!rows.length) {
        container.innerHTML = '<div class="card-muted">No metadata entries</div>';
        return;
      }

      container.innerHTML = `
        <table class="matrix-table" style="font-size:12px">
          <tr><th>Key</th><th>Value</th></tr>
          ${rows.map(r => `
            <tr>
              <td><code>${esc(r.key)}</code></td>
              <td>${r.value != null ? `<code>${esc(r.value)}</code>` : '<code style="color:var(--text-secondary);opacity:0.5">NULL</code>'}</td>
            </tr>
          `).join('')}
        </table>
        <div class="card-muted" style="margin-top:8px">${rows.length} row(s)</div>
      `;
    } else {
      const json = await apiFetch('/api/v1/db/tables/deploy_history');
      const rows = json.data?.rows || [];
      if (!rows.length) {
        container.innerHTML = '<div class="card-muted">No deployments yet</div>';
        return;
      }

      container.innerHTML = `
        <div style="overflow-x:auto">
          <table class="matrix-table" style="font-size:12px">
            <tr><th>ID</th><th>Version</th><th>Deployed At</th><th>Deployed By</th><th>Rules</th><th>Roles</th></tr>
            ${rows.map(r => `
              <tr>
                <td><code style="font-size:11px;color:var(--text-secondary)">${r.id}</code></td>
                <td><span class="badge badge-blue" style="font-size:10px">v${r.version}</span></td>
                <td style="font-size:11px;white-space:nowrap">${esc(formatDate(r.deployed_at))}</td>
                <td style="font-size:12px">${esc(r.deployed_by || '-')}</td>
                <td style="text-align:center">${r.rules_count}</td>
                <td>${Array.isArray(r.roles) && r.roles.length ? r.roles.map(role => `<span class="badge badge-purple" style="font-size:10px">${esc(role)}</span>`).join(' ') : '<span class="card-muted">-</span>'}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        <div class="card-muted" style="margin-top:8px">${rows.length} row(s)</div>
      `;
    }
  } catch (e) {
    container.innerHTML = `<div class="card-muted">Error: ${esc(e.message)}</div>`;
  }
}

// ================================================================
// SQL QUERY RUNNER
// ================================================================

/**
 * Execute the SQL from the editor via the /api/v1/db/query endpoint
 * and render the result as a table.
 */
async function runQuery() {
  const editor = document.getElementById('sql-editor');
  const resultEl = document.getElementById('query-result');
  const sql = editor.value.trim();
  currentQuery = sql;

  if (!sql) {
    showToast('Enter a SQL query first', 'info');
    return;
  }

  resultEl.innerHTML = '<div class="card-muted">Running query...</div>';

  try {
    const json = await apiFetch('/api/v1/db/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit: 200 }),
    });

    const { columns, rows, count } = json.data;

    if (!rows.length) {
      resultEl.innerHTML = '<div class="card-muted">Query returned 0 rows</div>';
      return;
    }

    resultEl.innerHTML = `
      <div style="overflow-x:auto">
        <table class="matrix-table" style="font-size:12px">
          <tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
          ${rows.map(r => `<tr>${columns.map(c => {
            const v = r[c];
            if (v == null) return '<td><code style="font-size:11px;color:var(--text-secondary);opacity:0.5">NULL</code></td>';
            return `<td><code style="font-size:11px">${esc(String(v))}</code></td>`;
          }).join('')}</tr>`).join('')}
        </table>
      </div>
      <div class="card-muted" style="margin-top:8px">${count} row(s) returned</div>
    `;
  } catch (e) {
    resultEl.innerHTML = `<div style="padding:10px;background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.2);border-radius:6px;font-size:12px;color:var(--red)">${esc(e.message)}</div>`;
  }
}

// ================================================================
// HELPERS
// ================================================================

/**
 * Format an ISO date string for display.
 *
 * @param {string} iso - ISO date string.
 * @returns {string} Formatted date.
 */
function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
}

// ================================================================
// REGISTER
// ================================================================

registerTabRenderer('database', renderDatabase);
