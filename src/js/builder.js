/**
 * Policy Engine — Policy Builder Tab Module
 *
 * Full CRUD interface for policy rules with pagination, client-side
 * search, inline rule editing, permission tagging, Rego preview,
 * and one-click deploy to Policy Agent.
 *
 * Roles and permissions are **dynamic** — the dropdowns are populated
 * from the backend /meta/roles and /meta/permissions endpoints, and
 * users can type custom values directly.
 *
 * @module builder
 */

import { esc, apiFetch, showToast, registerTabRenderer } from './app.js';

// ================================================================
// MODULE STATE
// ================================================================

/** @type {Array<Object>} Rules returned from the current page. */
let builderRules = [];

/** @type {Object} Pagination metadata from the API. */
let builderPagination = {};

/** @type {Object|null} The rule currently being edited, or null. */
let activeRule = null;

/** @type {number} Current page number. */
let builderPage = 1;

/** @type {string[]} Known roles fetched from backend. */
let knownRoles = [];

/** @type {string[]} Known permissions fetched from backend. */
let knownPermissions = [];

/** @type {string[]} Known institutes fetched from backend. */
let knownInstitutes = [];

/** @type {boolean} True when rules changed but not yet deployed. */
let needsDeploy = false;

// ================================================================
// DATA FETCHING
// ================================================================

/**
 * Fetch a page of rules from the backend API.
 *
 * @param {number} [page=1] - Page number to request.
 * @returns {Promise<void>}
 */
async function loadBuilderRules(page = 1) {
  builderPage = page;
  try {
    const json = await apiFetch(`/api/v1/rules?page=${page}&page_size=10&sort_by=created_at&sort_order=asc`);
    builderRules = json.data?.rules || [];
    builderPagination = json.data?.pagination || {};
  } catch (e) {
    showToast('Failed to load rules: ' + e.message, 'error');
    builderRules = [];
    builderPagination = {};
  }
}

/**
 * Fetch known roles and permissions from the meta endpoints.
 *
 * @returns {Promise<void>}
 */
async function loadMeta() {
  try {
    const json = await apiFetch('/api/v1/rules/meta');
    knownRoles = json.data?.roles || [];
    knownInstitutes = json.data?.institutes || [];
    knownPermissions = json.data?.permissions || [];
  } catch (_) {
    /* keep previous values */
  }
}

// ================================================================
// RENDER
// ================================================================

/**
 * Render the Policy Builder tab — rule list with pagination on the left,
 * inline rule editor on the right, and a deploy bar at the bottom.
 *
 * @param {HTMLElement} el - The main content container.
 */
function renderBuilder(el) {
  Promise.all([loadBuilderRules(builderPage), loadMeta()]).then(() => {
    const pg = builderPagination;
    el.innerHTML = `
    <div class="builder-wrapper">
      <div class="builder-grid" style="grid-template-columns:${ruleListWidth}px 6px 1fr">
        <div style="display:flex;flex-direction:column;overflow:hidden">
          <div class="card" style="flex:1;display:flex;flex-direction:column;overflow:hidden;margin-bottom:0;border:1px solid var(--border);border-radius:10px">
            <div class="card-header">Rules<div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" id="refresh-rules-btn" title="Refresh rules">&#8635;</button><button class="btn btn-sm btn-primary" id="new-rule-btn">+ New Rule</button></div></div>
            <div style="margin-bottom:12px"><input id="b-search" placeholder="Search rules..." style="font-size:12px"></div>
            <div class="rule-list-container" id="rule-list" style="flex:1;overflow-y:auto">
              ${builderRules.map(r => `
                <div class="rule-row ${activeRule && activeRule.id === r.id ? 'active' : ''}" data-rule-id="${r.id}" title="${esc(r.name)}">
                  <button class="toggle ${r.enabled !== false ? 'on' : ''}" data-toggle-id="${r.id}"></button>
                  <span class="rule-name">${esc(r.name)}</span>
                  <span class="rule-role badge badge-blue">${esc(r.role)}</span>
                  ${r.institute ? `<span class="badge badge-purple" style="font-size:10px">${esc(r.institute)}</span>` : ''}
                </div>
              `).join('') || '<div style="padding:20px;text-align:center;color:var(--text-secondary)">No rules yet</div>'}
            </div>
            ${pg.total_pages > 1 ? renderPagination(pg) : ''}
          </div>
        </div>
        <div class="col-resize-handle" id="col-resize-handle"></div>
        <div id="rule-editor" style="overflow-y:${activeRule ? 'auto' : 'hidden'};overflow-x:hidden">
          ${activeRule ? renderRuleEditor() : '<div class="card" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary)">Select a rule or create a new one</div>'}
        </div>
      </div>
      <div class="deploy-bar">
        <button class="btn btn-success${needsDeploy ? ' deploy-pulse' : ''}" id="deploy-btn" ${needsDeploy ? '' : 'disabled'}>Deploy Policy${needsDeploy ? ' <span class="deploy-badge">!</span>' : ''}</button>
        <div class="deploy-status" id="deploy-status">${needsDeploy
          ? '<span class="status-dot yellow"></span>Changes pending &mdash; deploy to sync with Policy Agent'
          : '<span class="status-dot green"></span>In sync'}</div>
      </div>
    </div>
    `;

    // Bind events
    document.getElementById('new-rule-btn').addEventListener('click', newRule);
    document.getElementById('refresh-rules-btn').addEventListener('click', () => renderBuilder(document.getElementById('main-content')));
    document.getElementById('deploy-btn').addEventListener('click', deployPolicies);
    document.getElementById('b-search').addEventListener('input', searchRules);

    // Rule list delegation
    document.getElementById('rule-list').addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-toggle-id]');
      if (toggleBtn) { e.stopPropagation(); toggleBuilderRule(toggleBtn.dataset.toggleId); return; }
      const row = e.target.closest('.rule-row');
      if (row) selectRule(row.dataset.ruleId);
    });

    bindEditorEvents();
    initResizableColumn();
  });
}

/**
 * Generate pagination HTML for the rule list.
 *
 * @param {Object} pg - Pagination metadata from the API.
 * @returns {string} HTML string.
 */
function renderPagination(pg) {
  return `<div class="pagination" id="pagination-container">
    <button class="page-btn" data-page="${pg.page - 1}" ${pg.has_previous ? '' : 'disabled'}>&#9664;</button>
    ${Array.from({ length: pg.total_pages }, (_, i) =>
      `<button class="page-btn ${pg.page === i + 1 ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>`
    ).join('')}
    <button class="page-btn" data-page="${pg.page + 1}" ${pg.has_next ? '' : 'disabled'}>&#9654;</button>
  </div>
  <div class="page-info">Showing ${(pg.page - 1) * pg.page_size + 1}-${Math.min(pg.page * pg.page_size, pg.total_items)} of ${pg.total_items} rules</div>`;
}

/**
 * Render the rule editor form.  Role and permission fields use a
 * combination of datalist (for suggestions) and free-text input
 * so that users can either pick existing values or type new ones.
 *
 * @returns {string} HTML string for the editor card.
 */
function renderRuleEditor() {
  const r = activeRule;
  const isNew = !r.id;
  const perms = r.permissions || [];

  // Build dropdown items
  const roleItems = knownRoles.map(role =>
    `<div class="combo-item" data-value="${esc(role)}">${esc(role)}</div>`
  ).join('');

  const instituteItems = knownInstitutes.map(inst =>
    `<div class="combo-item" data-value="${esc(inst)}">${esc(inst)}</div>`
  ).join('');

  // Build permission checkbox options (exclude already-added ones)
  const availPerms = knownPermissions.filter(p => !perms.includes(p));
  const permCheckboxes = availPerms.map(p =>
    `<label class="perm-check-item"><input type="checkbox" value="${esc(p)}" class="perm-cb"><span>${esc(p)}</span></label>`
  ).join('');

  return `<div class="card">
    <div class="card-header">${isNew ? 'New Rule' : 'Edit Rule'}</div>
    <div class="form-grid">
      <div><label>Rule Name</label><input id="r-name" value="${esc(r.name || '')}" placeholder="e.g. Catalog Owner Full Access"></div>
      <div><label>Description</label><input id="r-desc" value="${esc(r.description || '')}"></div>
    </div>
    <div class="form-grid" style="margin-top:12px">
      <div>
        <label>Role <span class="req">*</span></label>
        <div class="combo-box" id="combo-role">
          <input id="r-role" class="combo-input" value="${esc(r.role || '')}" placeholder="Type or select a role..." autocomplete="off">
          <span class="combo-arrow">&#9662;</span>
          <div class="combo-dropdown" id="dropdown-role">${roleItems}</div>
        </div>
        <div class="card-muted" style="margin-top:4px">Type a new role or pick from existing</div>
      </div>
      <div>
        <label>Institute <span class="req">*</span></label>
        <div class="combo-box" id="combo-institute">
          <input id="r-institute" class="combo-input" value="${esc(r.institute || '')}" placeholder="Type or select an institute..." autocomplete="off">
          <span class="combo-arrow">&#9662;</span>
          <div class="combo-dropdown" id="dropdown-institute">${instituteItems}</div>
        </div>
        <div class="card-muted" style="margin-top:4px">Type a new institute or pick from existing</div>
      </div>
    </div>
    <div style="margin-top:12px">
      <label>Permissions</label>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <div class="perm-filter-wrap" style="flex:1">
          <input id="perm-filter" placeholder="Filter permissions..." style="font-size:12px;width:100%">
        </div>
        <button class="btn btn-sm btn-outline" id="perm-select-all" title="Select all visible">All</button>
        <button class="btn btn-sm btn-outline" id="perm-select-none" title="Deselect all">None</button>
        <button class="btn btn-sm btn-primary" id="add-perm-btn">Add Selected</button>
      </div>
      <div id="perm-checklist" class="perm-checklist">
        ${permCheckboxes || '<div style="padding:8px;color:var(--text-secondary);font-size:12px">All permissions already added</div>'}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <input id="r-perm-input" placeholder="Or type custom: resource:action" style="font-size:12px;flex:1">
        <button class="btn btn-sm btn-outline" id="add-custom-perm-btn">Add Custom</button>
      </div>
    </div>
    <div id="r-perms" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
      ${perms.map(p => `<span class="perm-tag">${esc(p)}<span class="x" data-perm="${esc(p)}">&#10005;</span></span>`).join('')}
    </div>
    <div class="section">
      <div class="section-title">Rego Preview</div>
      <div class="code-block" id="r-preview">Click "Preview" to see generated Rego</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" id="save-rule-btn">${isNew ? 'Create Rule' : 'Save Changes'}</button>
      <button class="btn btn-outline" id="preview-rego-btn">Preview Rego</button>
      ${!isNew ? '<button class="btn btn-danger" id="delete-rule-btn">Delete</button>' : ''}
      <button class="btn btn-outline" id="cancel-rule-btn">Cancel</button>
    </div>
  </div>`;
}

/**
 * Bind event listeners inside the rule editor.
 * Attaches click and keyboard handlers for save, preview, delete,
 * cancel, add/remove permission, and pagination controls.
 *
 * @returns {void}
 */
function bindEditorEvents() {
  const saveBtn = document.getElementById('save-rule-btn');
  const previewBtn = document.getElementById('preview-rego-btn');
  const deleteBtn = document.getElementById('delete-rule-btn');
  const cancelBtn = document.getElementById('cancel-rule-btn');
  const addPermBtn = document.getElementById('add-perm-btn');
  const permInput = document.getElementById('r-perm-input');
  const permsEl = document.getElementById('r-perms');
  const paginationEl = document.getElementById('pagination-container');

  if (saveBtn) saveBtn.addEventListener('click', saveRule);
  if (previewBtn) previewBtn.addEventListener('click', previewRego);
  if (deleteBtn) deleteBtn.addEventListener('click', deleteRule);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    activeRule = null;
    renderBuilder(document.getElementById('main-content'));
  });

  // Combo-box dropdowns
  initComboBox('combo-role', 'r-role', 'dropdown-role');
  initComboBox('combo-institute', 'r-institute', 'dropdown-institute');

  // Permission multi-select: add checked permissions
  if (addPermBtn) {
    addPermBtn.addEventListener('click', () => {
      const checked = document.querySelectorAll('#perm-checklist .perm-cb:checked');
      checked.forEach(cb => {
        addBuilderPerm(cb.value);
        cb.closest('.perm-check-item').remove();
      });
    });
  }

  // Permission filter
  const permFilter = document.getElementById('perm-filter');
  if (permFilter) {
    permFilter.addEventListener('input', () => {
      const q = permFilter.value.toLowerCase();
      document.querySelectorAll('#perm-checklist .perm-check-item').forEach(item => {
        const val = item.querySelector('.perm-cb')?.value || '';
        item.style.display = val.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Select all / none
  const selectAllBtn = document.getElementById('perm-select-all');
  const selectNoneBtn = document.getElementById('perm-select-none');
  if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('#perm-checklist .perm-check-item:not([style*="display: none"]) .perm-cb').forEach(cb => cb.checked = true);
  });
  if (selectNoneBtn) selectNoneBtn.addEventListener('click', () => {
    document.querySelectorAll('#perm-checklist .perm-cb').forEach(cb => cb.checked = false);
  });

  // Custom permission input
  const customPermBtn = document.getElementById('add-custom-perm-btn');
  if (customPermBtn && permInput) {
    customPermBtn.addEventListener('click', () => {
      addBuilderPerm(permInput.value.trim());
      permInput.value = '';
    });
    permInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBuilderPerm(permInput.value.trim());
        permInput.value = '';
      }
    });
  }

  // Remove permission tag
  if (permsEl) permsEl.addEventListener('click', (e) => {
    const x = e.target.closest('.x[data-perm]');
    if (x) removeBuilderPerm(x.dataset.perm);
  });

  // Pagination
  if (paginationEl) paginationEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (btn && !btn.disabled) {
      loadBuilderRules(Number(btn.dataset.page)).then(() => renderBuilder(document.getElementById('main-content')));
    }
  });
}

// ================================================================
// CRUD HELPERS
// ================================================================

/**
 * Initialise a blank rule and re-render the builder to show the editor.
 *
 * @returns {void}
 */
function newRule() {
  activeRule = { name: '', description: '', role: '', institute: '', permissions: [], enabled: true };
  renderBuilder(document.getElementById('main-content'));
}

/**
 * Select a rule by ID and re-render the builder to show its editor.
 *
 * @param {string} id - Rule ID.
 */
function selectRule(id) {
  activeRule = builderRules.find(r => r.id === id) || null;
  renderBuilder(document.getElementById('main-content'));
}

/**
 * Read the current permission tags from the editor DOM.
 *
 * @returns {string[]} Array of permission strings.
 */
function getBuilderPerms() {
  return Array.from(document.getElementById('r-perms').querySelectorAll('.perm-tag'))
    .map(t => t.textContent.replace('\u2715', '').trim());
}

/**
 * Append a permission tag to the editor if not already present.
 * Validates the resource:action format before adding.
 *
 * @param {string} v - Permission string (e.g. "catalog:read").
 */
function addBuilderPerm(v) {
  if (!v) return;
  if (getBuilderPerms().includes(v)) return;

  // Basic format check
  if (!/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(v)) {
    showToast('Permission must follow "resource:action" format (e.g. catalog:read)', 'error');
    return;
  }

  const el = document.getElementById('r-perms');
  el.insertAdjacentHTML('beforeend', `<span class="perm-tag">${esc(v)}<span class="x" data-perm="${v}">&#10005;</span></span>`);
}

/**
 * Remove a permission tag from the editor.
 *
 * @param {string} v - Permission string to remove.
 */
function removeBuilderPerm(v) {
  document.querySelectorAll('#r-perms .perm-tag').forEach(t => {
    if (t.textContent.replace('\u2715', '').trim() === v) t.remove();
  });
}

/**
 * Save (create or update) the currently edited rule via the API.
 * Reads form values from the editor DOM, validates required fields,
 * then sends a POST (create) or PUT (update) request to the backend.
 * Re-renders the builder on success.
 *
 * @returns {Promise<void>}
 */
async function saveRule() {
  const role = document.getElementById('r-role').value.trim();
  const institute = document.getElementById('r-institute').value.trim();
  const body = {
    name: document.getElementById('r-name').value,
    description: document.getElementById('r-desc').value,
    role: role,
    institute: institute,
    permissions: getBuilderPerms(),
    enabled: activeRule.enabled !== false,
  };

  // Clear previous highlights
  ['r-name', 'r-role', 'r-institute'].forEach(id => document.getElementById(id)?.classList.remove('field-error'));

  const missing = [];
  if (!body.name) missing.push('r-name');
  if (!body.role) missing.push('r-role');
  if (!body.institute) missing.push('r-institute');
  if (missing.length || !body.permissions.length) {
    missing.forEach(id => document.getElementById(id)?.classList.add('field-error'));
    if (!body.permissions.length) showToast('At least one permission is required', 'error');
    else showToast('Name, Role, and Institute are required', 'error');
    return;
  }

  const isNew = !activeRule.id;
  try {
    const json = await apiFetch(isNew ? '/api/v1/rules' : `/api/v1/rules/${activeRule.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    activeRule = json.data.rule;
    needsDeploy = true;
    showToast(isNew ? 'Rule created successfully' : 'Rule updated successfully', 'success');
    renderBuilder(document.getElementById('main-content'));
  } catch (e) {
    showToast(e.message || 'Error saving rule', 'error');
  }
}

/**
 * Delete the currently selected rule after user confirmation.
 * Sends a DELETE request to the backend and re-renders the builder
 * on success. No-ops if no rule is selected.
 *
 * @returns {Promise<void>}
 */
async function deleteRule() {
  if (!activeRule || !activeRule.id) return;
  if (!confirm(`Delete rule "${activeRule.name}"?`)) return;
  try {
    await apiFetch(`/api/v1/rules/${activeRule.id}`, { method: 'DELETE' });
    needsDeploy = true;
    showToast('Rule deleted successfully', 'success');
    activeRule = null;
    renderBuilder(document.getElementById('main-content'));
  } catch (e) {
    showToast('Failed to delete rule: ' + e.message, 'error');
  }
}

/**
 * Toggle the enabled state of a rule.
 *
 * @param {string} id - Rule ID to toggle.
 */
async function toggleBuilderRule(id) {
  try {
    const json = await apiFetch(`/api/v1/rules/${id}/toggle`, { method: 'PATCH' });
    const enabled = json.data?.rule?.enabled;
    needsDeploy = true;
    showToast(`Rule ${enabled ? 'enabled' : 'disabled'}`, 'success');
    renderBuilder(document.getElementById('main-content'));
  } catch (e) {
    showToast('Failed to toggle rule: ' + e.message, 'error');
  }
}

/**
 * Build a rules array reflecting the current editor state merged with
 * all other saved rules — so the preview shows what "would" be
 * generated if the user saved and deployed.
 *
 * @returns {Object[]} Rules array for preview.
 */
function buildPreviewRules() {
  // Start with all saved rules
  const rules = builderRules.map(r => ({ ...r }));

  if (!activeRule) return rules;

  // Build the "live" version from the editor form
  const liveRule = {
    ...activeRule,
    name: document.getElementById('r-name')?.value || activeRule.name,
    description: document.getElementById('r-desc')?.value || activeRule.description,
    role: document.getElementById('r-role')?.value || activeRule.role,
    institute: document.getElementById('r-institute')?.value || activeRule.institute,
    permissions: getBuilderPerms(),
    enabled: activeRule.enabled !== false,
  };

  if (activeRule.id) {
    // Editing existing — replace it in the list
    const idx = rules.findIndex(r => r.id === activeRule.id);
    if (idx >= 0) rules[idx] = liveRule;
    else rules.push(liveRule);
  } else {
    // New unsaved rule — append it
    rules.push(liveRule);
  }

  return rules;
}

/**
 * Fetch the Rego preview from the backend and display it in the
 * editor preview pane. Sends the current editor state (merged with
 * all saved rules) to POST /api/v1/policies/preview.
 *
 * @returns {Promise<void>}
 */
async function previewRego() {
  const rules = buildPreviewRules();
  try {
    const json = await apiFetch('/api/v1/policies/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    });
    document.getElementById('r-preview').textContent = json.data?.rego || 'No Rego generated';
  } catch (e) {
    showToast('Failed to generate preview: ' + e.message, 'error');
    document.getElementById('r-preview').textContent = 'Error generating preview';
  }
}

/**
 * Deploy all enabled rules to Policy Agent.
 * Shows a confirmation dialog asking for deployer name before proceeding.
 */
async function deployPolicies() {
  // Show deploy confirmation dialog
  const modal = document.getElementById('deploy-modal');
  const modalBody = document.getElementById('deploy-modal-body');

  // Get last used deployer name from localStorage
  const lastDeployer = localStorage.getItem('ds_deployer_name') || '';

  modalBody.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3>Deploy to Policy Agent</h3>
      <button class="btn btn-outline btn-sm" id="cancel-deploy-btn">Cancel</button>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Your Name <span style="color:var(--text-secondary);font-size:11px">(will be recorded in deploy history)</span></label>
      <input id="deploy-user-input" value="${esc(lastDeployer)}" placeholder="e.g. John Doe" style="width:100%;padding:8px 12px;font-size:13px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-success" id="confirm-deploy-btn">Deploy Now</button>
    </div>`;
  modal.classList.add('show');

  // Focus the input
  const userInput = document.getElementById('deploy-user-input');
  userInput.focus();
  userInput.select();

  // Cancel
  document.getElementById('cancel-deploy-btn').addEventListener('click', () => {
    modal.classList.remove('show');
  });

  // Confirm
  document.getElementById('confirm-deploy-btn').addEventListener('click', async () => {
    const deployedBy = userInput.value.trim() || 'anonymous';
    localStorage.setItem('ds_deployer_name', deployedBy);
    modal.classList.remove('show');
    await executeDeploy(deployedBy);
  });

  // Enter key to confirm
  userInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const deployedBy = userInput.value.trim() || 'anonymous';
      localStorage.setItem('ds_deployer_name', deployedBy);
      modal.classList.remove('show');
      await executeDeploy(deployedBy);
    }
  });
}

/**
 * Execute the actual deploy after user confirmation.
 */
async function executeDeploy(deployedBy) {
  const status = document.getElementById('deploy-status');
  status.innerHTML = '<span class="status-dot yellow"></span>Deploying...';
  try {
    const json = await apiFetch('/api/v1/policies/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployed_by: deployedBy }),
    });
    needsDeploy = false;
    const ver = json.data?.version ? `v${json.data.version}` : '';
    status.innerHTML = `<span class="status-dot green"></span>Deployed ${ver}: ${json.data?.deployed_at ? new Date(json.data.deployed_at).toLocaleString() : ''}`;
    showToast(`Successfully deployed ${json.data.rules_count} rules ${ver} by ${deployedBy}`, 'success');
    const deployBtn = document.getElementById('deploy-btn');
    if (deployBtn) { deployBtn.classList.remove('deploy-pulse'); deployBtn.innerHTML = 'Deploy Policy'; deployBtn.disabled = true; }
    document.getElementById('deploy-modal-body').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3>Deploy Successful</h3>
        <button class="btn btn-outline btn-sm" id="close-deploy-modal-btn">Close</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <span class="badge badge-green">${json.data.rules_count} rules deployed</span>
        ${ver ? `<span class="badge badge-blue">${ver}</span>` : ''}
        <span class="badge badge-purple">${esc(deployedBy)}</span>
      </div>
      <div class="section-title">Generated Rego</div>
      <div class="code-block">${esc(json.data?.rego || '')}</div>`;
    document.getElementById('deploy-modal').classList.add('show');
    document.getElementById('close-deploy-modal-btn').addEventListener('click', () => {
      document.getElementById('deploy-modal').classList.remove('show');
    });
  } catch (e) {
    status.innerHTML = '<span class="status-dot red"></span>Deploy failed';
    showToast('Deploy failed: ' + e.message, 'error');
  }
}

/**
 * Client-side filter of rule rows based on the search input.
 */
function searchRules() {
  const q = document.getElementById('b-search').value.toLowerCase();
  document.querySelectorAll('.rule-row').forEach(row => {
    const name = row.querySelector('.rule-name').textContent.toLowerCase();
    row.style.display = name.includes(q) ? '' : 'none';
  });
}

// ================================================================
// COMBO-BOX HELPER
// ================================================================

/**
 * Initialise a combo-box: click arrow to toggle dropdown,
 * filter items on typing, click item to select.
 */
function initComboBox(boxId, inputId, dropdownId) {
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!box || !input || !dropdown) return;

  const arrow = box.querySelector('.combo-arrow');

  function showDropdown() { dropdown.classList.add('open'); }
  function hideDropdown() { dropdown.classList.remove('open'); }

  // Filter items as user types
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    let any = false;
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      const match = item.dataset.value.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
      if (match) any = true;
    });
    if (any) showDropdown(); else hideDropdown();
    input.classList.remove('field-error');
  });

  // Toggle on arrow click
  if (arrow) arrow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) { hideDropdown(); }
    else {
      // Show all items when opening via arrow
      dropdown.querySelectorAll('.combo-item').forEach(item => item.style.display = '');
      showDropdown();
      input.focus();
    }
  });

  // Show on focus
  input.addEventListener('focus', () => {
    dropdown.querySelectorAll('.combo-item').forEach(item => item.style.display = '');
    showDropdown();
  });

  // Select item on click
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.combo-item');
    if (item) {
      input.value = item.dataset.value;
      input.classList.remove('field-error');
      hideDropdown();
    }
  });

  // Hide on outside click — use a one-shot delegated global handler so we
  // don't accumulate document listeners across re-renders. We track the set
  // of active combobox instances and install the listener once.
  if (!window._dsComboBoxes) {
    window._dsComboBoxes = new Set();
    document.addEventListener('click', (e) => {
      window._dsComboBoxes.forEach((cb) => {
        if (!cb.box.contains(e.target)) cb.hide();
      });
    });
  }
  const entry = { box, hide: hideDropdown };
  window._dsComboBoxes.add(entry);
}

// ================================================================
// RESIZABLE COLUMN
// ================================================================

/** Stored column width — persists within session. */
let ruleListWidth = 340;

/**
 * Set up drag-to-resize on the rule list column.
 */
function initResizableColumn() {
  const handle = document.getElementById('col-resize-handle');
  const grid = handle?.parentElement;
  if (!handle || !grid) return;

  // Shared drag state across re-renders so we can install the document
  // mousemove/mouseup listeners exactly once.
  if (!window._dsResize) {
    const st = window._dsResize = { dragging: false, startX: 0, startW: 0, grid: null };
    document.addEventListener('mousemove', (e) => {
      if (!st.dragging || !st.grid) return;
      const delta = e.clientX - st.startX;
      ruleListWidth = Math.max(220, Math.min(600, st.startW + delta));
      st.grid.style.gridTemplateColumns = `${ruleListWidth}px 6px 1fr`;
    });
    document.addEventListener('mouseup', () => {
      if (st.dragging) {
        st.dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const st = window._dsResize;
    st.dragging = true;
    st.startX = e.clientX;
    st.startW = ruleListWidth;
    st.grid = grid;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
}

// ================================================================
// REGISTER
// ================================================================

registerTabRenderer('builder', renderBuilder);
