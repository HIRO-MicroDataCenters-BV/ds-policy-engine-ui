/**
 * Policy Engine — API Reference Tab Module
 *
 * Embeds the FastAPI auto-generated Swagger UI (/docs) inside an iframe.
 * A CSS override is injected into the iframe to fix dark-mode readability
 * since Swagger UI ships with a light-only colour scheme.
 *
 * @module reference
 */

import { registerTabRenderer } from './app.js';

// ================================================================
// RENDER
// ================================================================

/**
 * Render the API Reference tab by embedding a full-page iframe that
 * points to the FastAPI /docs endpoint.  Once the iframe loads, a
 * dark-mode stylesheet is injected so that text remains legible when
 * the dashboard is in dark mode.
 *
 * @param {HTMLElement} el - The main content container.
 */
function renderReference(el) {
  el.innerHTML = `<iframe class="docs-frame" id="docs-iframe" src="/docs"></iframe>`;

  const iframe = document.getElementById('docs-iframe');
  iframe.addEventListener('load', () => {
    try {
      injectDarkModeStyles(iframe);
    } catch (_) {
      /* cross-origin restrictions — silently ignore */
    }
  });
}

/**
 * Inject a comprehensive dark-mode stylesheet into the Swagger UI iframe.
 * Covers every visible Swagger UI element: headers, text, inputs, tables,
 * modals, code blocks, models, responses, and more.
 *
 * @param {HTMLIFrameElement} iframe - The docs iframe element.
 */
function injectDarkModeStyles(iframe) {
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  if (!doc) return;

  // Only inject if parent is in dark mode
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  if (!isDark) return;

  const style = doc.createElement('style');
  style.textContent = `
    /* Policy Engine — Swagger UI dark-mode overrides */

    /* === Global === */
    html, body { background: #0d1117 !important; }
    body, .swagger-ui { background: #0d1117 !important; color: #e6edf3 !important; }
    .swagger-ui * { color: inherit; }

    /* === Info section === */
    .swagger-ui .info .title,
    .swagger-ui .info h1, .swagger-ui .info h2, .swagger-ui .info h3,
    .swagger-ui .info h4, .swagger-ui .info h5 { color: #e6edf3 !important; }
    .swagger-ui .info p, .swagger-ui .info li,
    .swagger-ui .info a { color: #8b949e !important; }
    .swagger-ui .info a:hover { color: #58a6ff !important; }
    .swagger-ui .info .base-url { color: #8b949e !important; }

    /* === Scheme container === */
    .swagger-ui .scheme-container { background: #161b22 !important; box-shadow: none !important; border-bottom: 1px solid #30363d !important; }
    .swagger-ui .scheme-container .schemes > label { color: #8b949e !important; }

    /* === Tag/group headers === */
    .swagger-ui .opblock-tag { color: #e6edf3 !important; border-bottom-color: #30363d !important; }
    .swagger-ui .opblock-tag small { color: #8b949e !important; }
    .swagger-ui .opblock-tag:hover { background: rgba(88,166,255,0.04) !important; }
    .swagger-ui .opblock-tag svg { fill: #8b949e !important; }

    /* === Operation blocks (collapsed) === */
    .swagger-ui .opblock { background: #161b22 !important; border-color: #30363d !important; }
    .swagger-ui .opblock .opblock-summary { border-color: #30363d !important; }
    .swagger-ui .opblock .opblock-summary-description { color: #c9d1d9 !important; }
    .swagger-ui .opblock .opblock-summary-path,
    .swagger-ui .opblock .opblock-summary-path span,
    .swagger-ui .opblock .opblock-summary-path a { color: #e6edf3 !important; }
    .swagger-ui .opblock .opblock-summary-operation-id { color: #8b949e !important; }

    /* === Operation blocks (expanded) === */
    .swagger-ui .opblock .opblock-section-header { background: #1c2129 !important; border-color: #30363d !important; }
    .swagger-ui .opblock .opblock-section-header h4,
    .swagger-ui .opblock .opblock-section-header label { color: #e6edf3 !important; }
    .swagger-ui .opblock-body { background: #161b22 !important; }
    .swagger-ui .opblock-description-wrapper,
    .swagger-ui .opblock-description-wrapper p,
    .swagger-ui .opblock-external-docs-wrapper,
    .swagger-ui .opblock-external-docs-wrapper p { color: #8b949e !important; }

    /* === Parameters table === */
    .swagger-ui table { background: transparent !important; }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #8b949e !important; border-bottom-color: #30363d !important; }
    .swagger-ui table tbody tr td { color: #e6edf3 !important; border-bottom-color: #21262d !important; }
    .swagger-ui .parameter__name { color: #e6edf3 !important; }
    .swagger-ui .parameter__name.required span { color: #f85149 !important; }
    .swagger-ui .parameter__name.required::after { color: #f85149 !important; }
    .swagger-ui .parameter__type { color: #8b949e !important; }
    .swagger-ui .parameter__in { color: #6e7681 !important; }
    .swagger-ui .parameter__deprecated { color: #f85149 !important; }

    /* === Form inputs === */
    .swagger-ui select,
    .swagger-ui textarea,
    .swagger-ui input[type=text],
    .swagger-ui input[type=search],
    .swagger-ui input[type=email],
    .swagger-ui input[type=file],
    .swagger-ui input[type=password] {
      background: #0d1117 !important;
      color: #e6edf3 !important;
      border: 1px solid #30363d !important;
    }
    .swagger-ui select:focus, .swagger-ui input:focus, .swagger-ui textarea:focus {
      border-color: #58a6ff !important;
      outline: none !important;
    }

    /* === Buttons === */
    .swagger-ui .btn { color: #e6edf3 !important; border-color: #30363d !important; background: #21262d !important; }
    .swagger-ui .btn:hover { background: #30363d !important; }
    .swagger-ui .btn.execute { background: #58a6ff !important; color: #fff !important; border-color: #58a6ff !important; }
    .swagger-ui .btn.cancel { background: transparent !important; border-color: #f85149 !important; color: #f85149 !important; }
    .swagger-ui .btn-group .btn { background: #21262d !important; }
    .swagger-ui .try-out__btn { border-color: #58a6ff !important; color: #58a6ff !important; background: transparent !important; }

    /* === Responses === */
    .swagger-ui .responses-wrapper { background: transparent !important; }
    .swagger-ui .response-col_status { color: #e6edf3 !important; }
    .swagger-ui .response-col_description,
    .swagger-ui .response-col_description p,
    .swagger-ui .response-col_description span { color: #c9d1d9 !important; }
    .swagger-ui .response-col_links { color: #8b949e !important; }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #e6edf3 !important; }
    .swagger-ui .responses-table thead td { color: #8b949e !important; }
    .swagger-ui .response-control-media-type__accept-message { color: #58a6ff !important; }

    /* === Code / highlight === */
    .swagger-ui .highlight-code, .swagger-ui .microlight,
    .swagger-ui pre, .swagger-ui code {
      background: #0d1117 !important;
      color: #e6edf3 !important;
      border-color: #30363d !important;
    }
    .swagger-ui .highlight-code .microlight { background: transparent !important; }
    .swagger-ui .copy-to-clipboard { background: #21262d !important; }
    .swagger-ui .copy-to-clipboard button { background: #21262d !important; }

    /* === Models === */
    .swagger-ui section.models { border-color: #30363d !important; background: transparent !important; }
    .swagger-ui section.models h4 { color: #e6edf3 !important; border-bottom-color: #30363d !important; }
    .swagger-ui section.models h4 svg { fill: #8b949e !important; }
    .swagger-ui .model-title { color: #e6edf3 !important; }
    .swagger-ui .model { color: #c9d1d9 !important; }
    .swagger-ui .model-box { background: #161b22 !important; }
    .swagger-ui .model-toggle::after { background: none !important; }
    .swagger-ui .prop-type { color: #58a6ff !important; }
    .swagger-ui .prop-format { color: #8b949e !important; }

    /* === Markdown === */
    .swagger-ui .markdown p, .swagger-ui .markdown li,
    .swagger-ui .markdown td, .swagger-ui .markdown th { color: #c9d1d9 !important; }
    .swagger-ui .markdown h1, .swagger-ui .markdown h2,
    .swagger-ui .markdown h3, .swagger-ui .markdown h4 { color: #e6edf3 !important; }
    .swagger-ui .markdown a { color: #58a6ff !important; }
    .swagger-ui .renderedMarkdown p { color: #c9d1d9 !important; }

    /* === Misc UI === */
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .loading-container .loading::after { color: #8b949e !important; }
    .swagger-ui .dialog-ux .modal-ux { background: #161b22 !important; border-color: #30363d !important; }
    .swagger-ui .dialog-ux .modal-ux-header h3 { color: #e6edf3 !important; }
    .swagger-ui .dialog-ux .modal-ux-content p { color: #8b949e !important; }
    .swagger-ui .arrow { fill: #8b949e !important; }
    .swagger-ui svg:not(:root) { fill: #8b949e !important; }
    .swagger-ui .expand-operation svg { fill: #8b949e !important; }

    /* === Authorization === */
    .swagger-ui .auth-wrapper { background: transparent !important; }
    .swagger-ui .authorization__btn svg { fill: #8b949e !important; }

    /* === JSON schema / example value tabs === */
    .swagger-ui .tab li { color: #8b949e !important; }
    .swagger-ui .tab li.active { color: #e6edf3 !important; }
    .swagger-ui .tab li button.tablinks { color: inherit !important; background: transparent !important; }
    .swagger-ui .tab li button.tablinks.active { border-bottom-color: #58a6ff !important; }

    /* === Scrollbar === */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #0d1117; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #484f58; }
  `;
  doc.head.appendChild(style);
}

// ================================================================
// REGISTER
// ================================================================

registerTabRenderer('reference', renderReference);
