/**
 * Policy Engine — Main Application Module
 *
 * Manages global state, SVG icon registry, theme system, sidebar rendering,
 * HTML5 drag-and-drop tab reordering, tab switching, and application
 * initialisation.  All other tab modules register themselves via
 * {@link registerTabRenderer}.
 *
 * @module app
 */

// ================================================================
// NAV ITEM DEFINITIONS
// ================================================================

/** @type {Array<{id:string, label:string, icon:string}>} Sidebar navigation items. */
const NAV_ITEMS = [
  { id: 'tester',    label: 'Policy Tester',   icon: 'tester' },
  { id: 'builder',   label: 'Policy Builder',  icon: 'builder' },
  { id: 'manager',   label: 'Policy Manager',  icon: 'manager' },
  { id: 'database',  label: 'DB Explorer',     icon: 'database' },
  { id: 'reference', label: 'API Reference',   icon: 'reference' },
];

// ================================================================
// STATE
// ================================================================

/** @type {string[]} Current ordering of tab IDs (persisted to localStorage). */
let navOrder = JSON.parse(localStorage.getItem('ds-nav-order') || 'null') || NAV_ITEMS.map(n => n.id);

/** @type {string} Currently active tab ID. */
let activeTab = navOrder[0] || 'tester';

/** @type {boolean} Whether the sidebar is collapsed. */
let sidebarCollapsed = localStorage.getItem('ds-sidebar') === 'collapsed';

// ================================================================
// SVG ICONS
// ================================================================

/**
 * Map of tab-id → SVG markup used in the sidebar navigation.
 * @type {Record<string, string>}
 */
const ICONS = {
  tester: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  builder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  manager: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  reference: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>`,
};

// ================================================================
// TAB RENDERER REGISTRY
// ================================================================

/**
 * Registry of tab-id → render function.
 * Tab modules call {@link registerTabRenderer} to register themselves.
 * @type {Record<string, function(HTMLElement): void>}
 */
const tabRenderers = {};

/**
 * Register a render function for a given tab.
 *
 * @param {string}   tabId    - The tab identifier (e.g. "tester").
 * @param {function} renderer - Function that receives the main content element
 *                              and populates it with the tab's UI.
 */
export function registerTabRenderer(tabId, renderer) {
  tabRenderers[tabId] = renderer;
}

// ================================================================
// THEME
// ================================================================

/**
 * Detect the operating system's preferred colour scheme.
 *
 * @returns {"dark"|"light"} The system-level theme preference.
 */
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
}

/**
 * Persist the chosen theme and apply it to the document.
 *
 * @param {"light"|"dark"|"system"} t - Theme preference to save.
 */
function setTheme(t) {
  localStorage.setItem('ds-theme', t);
  applyTheme();
}

/**
 * Read the saved theme preference and apply the correct data-theme
 * attribute to the root element, then highlight the active theme button.
 */
function applyTheme() {
  const saved = localStorage.getItem('ds-theme') || 'system';
  const effective = saved === 'system' ? getSystemTheme() : saved;
  document.documentElement.setAttribute('data-theme', effective);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === saved);
  });
}

// React to OS-level theme changes when set to "system"
window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', applyTheme);
applyTheme();

// Expose to inline onclick handlers in the HTML
window.setTheme = setTheme;

// ================================================================
// SIDEBAR
// ================================================================

/**
 * Toggle the sidebar between expanded and collapsed states, persisting
 * the choice to localStorage.
 */
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('ds-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
}

/**
 * Re-render the sidebar navigation buttons in the current {@link navOrder},
 * highlighting the {@link activeTab} and restoring collapsed state.
 */
function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const ordered = navOrder.map(id => NAV_ITEMS.find(n => n.id === id)).filter(Boolean);
  nav.innerHTML = ordered.map(item => `
    <button class="nav-item ${activeTab === item.id ? 'active' : ''}" data-nav-id="${item.id}"
      draggable="true" data-tooltip="${item.label}"
      onclick="switchTab('${item.id}')"
      ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)">
      <span class="drag-handle">\u2847</span>
      ${ICONS[item.icon]}
      <span class="label">${item.label}</span>
    </button>
  `).join('');
  if (sidebarCollapsed) document.getElementById('sidebar').classList.add('collapsed');
}

// Expose to inline onclick handler
window.toggleSidebar = toggleSidebar;

// ================================================================
// DRAG & DROP
// ================================================================

/** @type {string|null} The nav-id currently being dragged. */
let dragId = null;

/**
 * Handle dragstart on a nav item — record its id and add visual feedback.
 *
 * @param {DragEvent} e - The native dragstart event.
 */
function onDragStart(e) {
  dragId = e.currentTarget.dataset.navId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

/**
 * Handle dragover — allow drop and show drop-target indicator.
 *
 * @param {DragEvent} e - The native dragover event.
 */
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('drag-over'));
  if (target.dataset.navId !== dragId) target.classList.add('drag-over');
}

/**
 * Handle drop — reorder {@link navOrder}, persist, and re-render sidebar.
 *
 * @param {DragEvent} e - The native drop event.
 */
function onDrop(e) {
  e.preventDefault();
  const dropId = e.currentTarget.dataset.navId;
  if (dragId && dropId && dragId !== dropId) {
    const fromIdx = navOrder.indexOf(dragId);
    const toIdx = navOrder.indexOf(dropId);
    navOrder.splice(fromIdx, 1);
    navOrder.splice(toIdx, 0, dragId);
    localStorage.setItem('ds-nav-order', JSON.stringify(navOrder));
    renderSidebar();
  }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('drag-over'));
}

/**
 * Handle dragend — clean up visual indicators.
 *
 * @param {DragEvent} e - The native dragend event.
 */
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('drag-over'));
  dragId = null;
}

// Expose drag handlers for inline event attributes
window.onDragStart = onDragStart;
window.onDragOver  = onDragOver;
window.onDrop      = onDrop;
window.onDragEnd   = onDragEnd;

// ================================================================
// TAB SWITCHING
// ================================================================

/**
 * Switch the active tab and re-render the sidebar and content area.
 *
 * @param {string} id - Tab identifier to activate.
 */
function switchTab(id) {
  activeTab = id;
  renderSidebar();
  renderContent();
}

// Expose for inline onclick
window.switchTab = switchTab;

// ================================================================
// CONTENT RENDERING
// ================================================================

/**
 * Render the main content area by delegating to the registered tab renderer
 * for the currently active tab.
 */
function renderContent() {
  const el = document.getElementById('main-content');
  const renderer = tabRenderers[activeTab];
  if (renderer) {
    renderer(el);
  } else {
    el.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:var(--text-secondary)">Tab not loaded</div>';
  }
}

// ================================================================
// HELPERS
// ================================================================

/**
 * HTML-escape a string to prevent XSS when injecting into innerHTML.
 *
 * @param {string} s - The raw string.
 * @returns {string} The escaped string safe for HTML insertion.
 */
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Also expose globally for inline handlers
window.esc = esc;

// ================================================================
// TOAST NOTIFICATIONS
// ================================================================

/**
 * Show a toast notification at the top-right of the screen.
 *
 * @param {string} message - The message to display.
 * @param {"success"|"error"|"info"} [type="info"] - Toast type for styling.
 * @param {number} [duration=4000] - Auto-dismiss time in milliseconds.
 */
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;max-width:400px';
    document.body.appendChild(container);
  }

  const colors = {
    success: { bg: 'var(--green)', icon: '&#10003;' },
    error:   { bg: 'var(--red)',   icon: '&#10007;' },
    info:    { bg: 'var(--blue)',  icon: '&#8505;'  },
  };
  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border);box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:13px;color:var(--text);opacity:0;transform:translateX(20px);transition:all 0.3s ease`;
  toast.innerHTML = `<span style="color:${bg};font-size:16px;flex-shrink:0">${icon}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  // Auto dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Expose globally
window.showToast = showToast;

// ================================================================
// PROGRESS BAR
// ================================================================

/** @type {number} Number of in-flight API requests. */
let _activeRequests = 0;

/** @type {HTMLElement|null} Progress bar DOM element (created once). */
let _progressBar = null;

/**
 * Get or create the global progress bar element.
 * @returns {HTMLElement}
 */
function getProgressBar() {
  if (!_progressBar) {
    _progressBar = document.createElement('div');
    _progressBar.className = 'progress-bar';
    document.body.appendChild(_progressBar);
  }
  return _progressBar;
}

function showProgress() {
  _activeRequests++;
  getProgressBar().classList.add('active');
}

function hideProgress() {
  _activeRequests = Math.max(0, _activeRequests - 1);
  if (_activeRequests === 0) getProgressBar().classList.remove('active');
}

// ================================================================
// API HELPER
// ================================================================

/**
 * Wrapper around fetch that validates HTTP status and parses the
 * unified ApiResponse envelope.  Shows a progress bar during requests.
 *
 * @param {string} url - Request URL.
 * @param {RequestInit} [options={}] - Fetch options (method, body, etc.).
 * @returns {Promise<Object>} Parsed JSON response body.
 * @throws {Error} On network failure or non-success API response.
 */
export async function apiFetch(url, options = {}) {
  showProgress();
  try {
    const resp = await fetch(url, options);
    const json = await resp.json();

    if (!resp.ok || json.status === 'error') {
      const msg = json.error?.details?.[0]?.reason
        || json.message
        || json.error?.message
        || `Request failed (${resp.status})`;
      throw new Error(msg);
    }

    return json;
  } finally {
    hideProgress();
  }
}

// Expose globally
window.apiFetch = apiFetch;

// ================================================================
// INIT
// ================================================================

/**
 * Bootstrap the application: fetch the service version, render the
 * sidebar, and render the default (first) tab.
 */
async function init() {
  // Load version and node from health endpoint
  try {
    const resp = await fetch('/health');
    const json = await resp.json();
    const v = json.data?.version || '0.1.0';
    const node = json.data?.node || 'local';
    document.getElementById('version-label').textContent = 'v' + v;
    const nodeEl = document.getElementById('node-label');
    if (nodeEl) nodeEl.textContent = 'ds-policy-engine.' + node;
  } catch (_) { /* labels stay at defaults */ }

  renderSidebar();
  renderContent();
}

init();
