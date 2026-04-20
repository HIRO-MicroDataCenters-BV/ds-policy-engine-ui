// Rendered at container start by docker-entrypoint.d/10-render-config.sh.
// The literal __API_BASE_URL__ token is substituted with the value of $API_BASE_URL.
// Loaded BEFORE any app modules — sets runtime config and monkey-patches fetch().

window.APP_CONFIG = {
  apiBaseUrl: "__API_BASE_URL__"
};

(function () {
  var base = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || "";
  if (!base) return;   // same-origin — no patching needed

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    // Only rewrite absolute-path URLs (start with "/") that aren't protocol-relative ("//").
    if (typeof input === "string" && input.length > 0 && input.charAt(0) === "/" && input.charAt(1) !== "/") {
      input = base.replace(/\/$/, "") + input;
    } else if (input && typeof input === "object" && typeof input.url === "string") {
      // Request object
      var url = input.url;
      if (url.charAt(0) === "/" && url.charAt(1) !== "/") {
        input = new Request(base.replace(/\/$/, "") + url, input);
      }
    }
    return origFetch(input, init);
  };
})();
