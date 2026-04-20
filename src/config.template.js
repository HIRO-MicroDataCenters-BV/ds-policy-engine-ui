// Rendered at container start by docker-entrypoint.d/10-render-config.sh
// via `envsubst '${API_BASE_URL}'`. Safe against special characters in the
// substituted value (envsubst handles escaping, unlike raw sed).
//
// With Option B (nginx in-pod reverse-proxy), API_BASE_URL is empty — the
// UI calls same-origin paths like "/api/v1/...", nginx proxies them to the
// in-cluster backend. The monkey-patch below is a no-op when apiBaseUrl is "".
//
// If you ever want the UI to call a different origin directly (skipping the
// nginx proxy), set API_BASE_URL to that origin and the monkey-patch kicks in.

window.APP_CONFIG = {
  apiBaseUrl: "${API_BASE_URL}"
};

(function () {
  var base = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || "";
  if (!base) return;   // same-origin — no patching needed
  base = base.replace(/\/$/, "");

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    // Only rewrite absolute-path string URLs (e.g. "/api/v1/...").
    // Request objects and already-absolute URLs are passed through untouched —
    // per spec, re-constructing a Request with a Request as init doesn't
    // reliably preserve method/headers/body across browsers.
    if (typeof input === "string" && input.length > 0
        && input.charAt(0) === "/" && input.charAt(1) !== "/") {
      input = base + input;
    }
    return origFetch(input, init);
  };
})();
