# CLAUDE.md — ds-policy-engine-ui Development Guide

## Project Overview
Static UI for `ds-policy-engine` — vanilla HTML + CSS + ES modules served by nginx. No build step, no framework. Backend URL resolved at container start from `$API_BASE_URL` → `config.js`.

## Layout
```
src/                   UI source (index.html, css/, js/, config.template.js)
Dockerfile             nginx:1.27-alpine + runtime config render
nginx.conf             port 8080, SPA fallback, cache headers
docker-entrypoint.d/   10-render-config.sh (templates config.js at startup)
charts/ds-policy-engine-ui/   Helm chart (published to gh-pages)
tools/version.sh       per-build version derivation
.github/workflows/ui.yaml   CI: lint, build, GHCR, helm-gh-pages
docker-compose.yml     local dev on :8080
```

## Workflow: Commits
Commits must be authored solely by the committer — no co-author trailers.

## Workflow: Pull Requests
- Branch from `develop`. `main` is release-only.
- PR target is `develop`: `gh pr create --base develop`
- Copilot auto-reviews.

### Resolving Copilot/review comments
1. Reply:
   ```bash
   gh api repos/HIRO-MicroDataCenters-BV/ds-policy-engine-ui/pulls/<PR>/comments/<CID>/replies \
     -X POST -f body="Fixed."
   ```
2. **Resolve** the thread (not minimize) via GraphQL `resolveReviewThread`:
   ```bash
   gh api graphql -f query='query { repository(owner:"HIRO-MicroDataCenters-BV", name:"ds-policy-engine-ui") { pullRequest(number:<PR>) { reviewThreads(first:20) { nodes { id isResolved } } } } }'
   gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"<THREAD_ID>"}) { thread { isResolved } } }'
   ```

## Adding a new page/tab
1. Create `src/js/<tabname>.js` exporting a render function.
2. Register it in `src/js/app.js` (nav items + tab registry).
3. Append a `<script type="module" src="./js/<tabname>.js"></script>` to `src/index.html` after the existing ones.

## Why API calls work without hardcoding URLs
`src/js/*` call `fetch('/api/...')` or `apiFetch('/api/...')` with **relative** paths. `src/config.template.js` monkey-patches `window.fetch` at startup so any URL starting with `/` gets prefixed with `window.APP_CONFIG.apiBaseUrl`. Never hardcode `http://ds-policy-engine...` in JS.

## Config placeholder
Any new runtime value must:
1. Be added to `src/config.template.js` with a `__TOKEN__` placeholder.
2. Have a matching `sed` substitution added to `docker-entrypoint.d/10-render-config.sh` driven by an env var.
3. Be exposed from the Helm chart's `values.yaml` under `.Values.config.*` and wired as a container `env:` entry.

CI guards that `__API_BASE_URL__` still exists in the template (`ui.yaml` → Basic sanity checks).

## nginx quirks
- Container listens on port **8080** (not 80) so it can run as non-root in hardened clusters.
- `location = /healthz` serves `ok` for Kubernetes probes.
- `config.js` is always `Cache-Control: no-store` (it's generated per-container).
- All other static assets get `immutable, max-age=1y` — bump `VERSION` to bust caches.

## Local dev
```bash
docker compose up --build
# UI on http://localhost:8080, talks to backend at $API_BASE_URL (default http://localhost:8000).
```

Change backend target without rebuilding:
```bash
API_BASE_URL=http://localhost:9000 docker compose up --force-recreate
```

## Versioning & Release
`VERSION` is the base. `tools/version.sh` (in CI) sed-patches `charts/ds-policy-engine-ui/{Chart.yaml,values.yaml}` with computed versions. Tag `N.N.N` → clean Docker + Helm release + GitHub Release.

## Deployment (GitOps)
Per-site values: `HIRO-MicroDataCenters-BV/ds-gitops` → `{ki,hus,uva}-services/policy-engine-ui/{fleet.yaml,values.yaml}`. Fleet pulls the chart from gh-pages. Each site's `values.yaml` sets `config.apiBaseUrl` to that site's backend.

## CORS
The backend's `DS__CORS_ALLOWED_ORIGINS` must include the UI origin for every site where it's deployed. Check `ds-policy-engine`'s per-site gitops values when adding a new site.
