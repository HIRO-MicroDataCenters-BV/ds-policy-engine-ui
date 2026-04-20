# ds-policy-engine-ui

Static web UI (vanilla HTML/CSS/ES modules) for [ds-policy-engine](https://github.com/HIRO-MicroDataCenters-BV/ds-policy-engine). Served from an nginx:alpine image that reverse-proxies `/api`, `/health`, `/docs` to the in-cluster backend — so the browser only ever talks to one origin (zero CORS).

> **New users: read the [User Guide](docs/USER_GUIDE.md)** — covers every screen, how to call `/evaluate` from your own service, and troubleshooting. Same content is reachable in-app from the "User Guide" link at the bottom of the sidebar.

## Layout

| Path | Purpose |
|------|---------|
| `src/index.html` | Entry HTML — loads `config.js` first, then ES modules from `src/js/` |
| `src/config.template.js` | Rendered to `config.js` at container start; sets `window.APP_CONFIG.apiBaseUrl` and monkey-patches `fetch()` |
| `src/css/` | Stylesheet |
| `src/js/` | App modules: `app.js`, `tester.js`, `builder.js`, `manager.js`, `database.js`, `reference.js` |
| `Dockerfile` | `nginx:1.27-alpine` + entrypoint renderer |
| `nginx.conf` | Server config (port 8080, SPA fallback, cache headers) |
| `docker-entrypoint.d/10-render-config.sh` | Substitutes `__API_BASE_URL__` into `config.js` at startup |
| `charts/ds-policy-engine-ui/` | Helm chart published to `gh-pages` |
| `tools/version.sh` | Per-build version derivation (same approach as backend) |
| `.github/workflows/ui.yaml` | CI: lint → build → GHCR → helm-gh-pages → GitHub Release |
| `docker-compose.yml` | Local dev: runs nginx on `:8080`, targets `http://localhost:8000` |

## Quickstart — local dev

With the backend already running on `http://localhost:8000` (see ds-policy-engine `docker compose up`):

```bash
docker compose up --build
# UI: http://localhost:8080
```

Point at a different backend:
```bash
API_BASE_URL=http://localhost:9000 docker compose up --build
```

## How the runtime config works

1. `src/config.template.js` contains the literal `__API_BASE_URL__`.
2. At container start, `docker-entrypoint.d/10-render-config.sh` reads `$API_BASE_URL`, runs `sed`, and writes `/usr/share/nginx/html/config.js`.
3. `index.html` loads `config.js` **before** any ES modules — sets `window.APP_CONFIG.apiBaseUrl` and monkey-patches `window.fetch()` so every `fetch('/api/...')` is rewritten to `${apiBaseUrl}/api/...`.
4. No application code changes needed to move between sites — same image, different env var.

## Artifacts (published by CI)

- Docker: `ghcr.io/hiro-microdatacenters-bv/ds-policy-engine-ui`
- Helm: `https://hiro-microdatacenters-bv.github.io/ds-policy-engine-ui/helm-charts/index.yaml`

## Versioning & release

`VERSION` is the base. `tools/version.sh` derives per-build chart/docker versions. Tag `N.N.N` → clean semver release.

## Branching

HIRO uses [GitFlow with Forks](https://hirodevops.notion.site/GitFlow-with-Forks-3b737784e4fc40eaa007f04aed49bb2e). PRs target `develop`.

## Deployment (GitOps)

Per-site values live in `HIRO-MicroDataCenters-BV/ds-gitops` under `{ki,hus,uva}-services/policy-engine-ui/`. Each site sets `config.apiBaseUrl` to the corresponding backend subdomain.

Deployed subdomains per site:

| Site | URL | Calls backend at |
|------|-----|------------------|
| ki  | `http://ds-policy-engine-ui.ki.nextgen.hiro-develop.nl`  | `http://ds-policy-engine.ki.nextgen.hiro-develop.nl` |
| hus | `http://ds-policy-engine-ui.hus.nextgen.hiro-develop.nl` | `http://ds-policy-engine.hus.nextgen.hiro-develop.nl` |
| uva | `http://ds-policy-engine-ui.uva.nextgen.hiro-develop.nl` | `http://ds-policy-engine.uva.nextgen.hiro-develop.nl` |

Backend CORS (`DS__CORS_ALLOWED_ORIGINS`) must include the UI origin for the same site.

## License

MIT — see [LICENSE](LICENSE).
