# Policy Engine — User Guide

A hands-on tour of every screen in the Policy Engine UI. Read this once end-to-end the first time you use the app, then come back to the sections you need.

**If you're a developer** looking for build/deploy info, see [README.md](../README.md) and [CLAUDE.md](../CLAUDE.md) instead — this guide is for **users** of the dashboard.

---

## Contents

1. [What the Policy Engine is](#what-the-policy-engine-is)
2. [Opening the dashboard](#opening-the-dashboard)
3. [Layout overview](#layout-overview)
4. [Policy Tester](#1-policy-tester)
5. [Policy Builder](#2-policy-builder)
6. [Policy Manager](#3-policy-manager)
7. [DB Explorer](#4-db-explorer)
8. [API Reference](#5-api-reference)
9. [Verifying a claim from your own service](#verifying-a-claim-from-your-own-service)
10. [Common tasks — quick recipes](#common-tasks--quick-recipes)
11. [Troubleshooting](#troubleshooting)
12. [Glossary](#glossary)

---

## What the Policy Engine is

The Policy Engine is a microservice that decides **"is this user allowed to do this action?"** for the rest of the platform. You configure **rules** here (role + institute → permissions), and other services call `POST /api/v1/policies/evaluate` to get a yes/no + permission list.

Under the hood the rules are compiled to **Rego** and deployed to **OPA (Open Policy Agent)**. You never need to write Rego by hand — the UI does it for you.

Typical actors:

- **Admin** / policy owner — creates roles, defines which permissions each role has per institute, deploys policies.
- **Integrator** — builds another service that calls `/api/v1/policies/evaluate`. Uses this UI mostly to test rules and read the API reference.
- **Operator** / on-call — uses the DB Explorer and deploy history to diagnose why someone was denied.

---

## Opening the dashboard

Depending on how it was deployed:

| Environment | URL |
|-------------|-----|
| Local (docker compose) | `http://localhost:8080` |
| Cluster (internal) | `kubectl -n <site> port-forward svc/ds-policy-engine-ui 8080:80` → `http://localhost:8080` |
| Cluster (public, if enabled) | `https://ds-policy-engine-ui.<site>.nextgen.hiro-develop.nl` |

If the page loads but every button shows a red error toast, see [Troubleshooting → API calls failing](#api-calls-failing).

---

## Layout overview

```
 ┌─────────────────────────────────────────────────────┐
 │ (icon)  Policy Engine                               │  ← topbar
 ├───────────┬─────────────────────────────────────────┤
 │           │                                         │
 │ ≡ Menu    │                                         │
 │           │                                         │
 │ • Tester  │                                         │
 │ • Builder │             Main content                │
 │ • Manager │        (changes per tab)                │
 │ • DB      │                                         │
 │ • API Ref │                                         │
 │           │                                         │
 │  ⚙ theme  │                                         │
 │  node/ver │                                         │
 └───────────┴─────────────────────────────────────────┘
```

- **Sidebar** — five tabs (Tester, Builder, Manager, DB Explorer, API Reference) plus a footer.
  - Click **≡ Menu** to collapse/expand the sidebar.
  - **Drag** nav items to reorder them (order is saved per-browser in `localStorage`).
- **Theme switcher** (bottom of sidebar) — Light / Dark / Auto (follows OS).
- **Node / Version** (bottom of sidebar) — shows which site this UI is pointed at (`ki`, `hus`, `uva`, `local`) and the backend app version.
- **Top progress bar** — animates during any API call in flight.
- **Toasts** — transient notifications (green = success, red = error) slide in from the top-right.

---

## 1. Policy Tester

### What it does

Lets you simulate `POST /api/v1/policies/evaluate` without writing code. You fill in user attributes (role + institute, plus optional name/email), click **Evaluate**, and see which permissions the current policy grants.

Use this when you want to answer questions like "does `catalog_creator` at `hus` have `catalog:delete`?" — it's the fastest way to verify a rule change before calling it done.

### Screen layout

```
┌─ Evaluate policy ─────────────────────────┐
│ Name         : [ alice              ]     │
│ Email        : [ alice@example.com  ]     │
│ Role         : [ catalog_owner  ▾   ]     │
│ Institute    : [ ki             ▾   ]     │
│                                           │
│ [ Evaluate ]    [ Send Raw Request ]      │
└───────────────────────────────────────────┘

┌─ Result ──────────────────────────────────┐
│  ALLOW                                    │
│  Granted permissions:                     │
│    • catalog:read                         │
│    • catalog:create                       │
│    • catalog:update                       │
│    • catalog:delete                       │
└───────────────────────────────────────────┘

┌─ Decision log (most recent first) ────────┐
│ 14:02:31  ALLOW  role=catalog_owner       │
│           institute=ki permissions=[…]    │
│ 14:01:18  DENY   role=catalog_consumer    │
│           institute=hus permissions=[]    │
└───────────────────────────────────────────┘
```

### Step by step

1. Pick a **Role** from the dropdown. The list is fetched from the backend; you can also type a custom value if you're testing a rule that references a role not yet in the meta list.
2. Pick an **Institute** (or leave blank if your rules don't use institutes).
3. Name/Email are optional — they're passed to OPA as `input.name` / `input.email` in case a future rule references them.
4. Click **Evaluate**.
   - **ALLOW** (green header) — the rule returned at least one permission. The full list is shown.
   - **DENY** (red header) — no rules matched or all matching rules were disabled.
5. Every evaluation is appended to the **Decision log** below the form with a timestamp. The log survives tab switches but clears on browser reload.

### Send Raw Request

A button beside **Evaluate** — opens a JSON preview of the exact payload the backend would see. Use this when copying a reproducer into a bug report or when calling the API from your own service.

### Common gotchas

- "Policy engine unreachable" — OPA is down or the deploy hasn't happened yet. Check the Manager tab's deploy history.
- Empty permissions despite the rule being correct — the rule is probably **disabled**. Open the Builder and toggle it on.
- "No matching rule" feels like a bug — confirm you deployed after your last edit. Builder saves are persisted, but **policies don't take effect until you click Deploy in the Manager tab**.

---

## 2. Policy Builder

### What it does

CRUD editor for policy rules. Each rule is a (role, institute, permissions) triple with a friendly name and an optional description. You can preview the Rego the rule will compile to before saving.

### Screen layout

```
┌ Rule list (drag to resize) ┬─ Rule editor ───────────────────────┐
│ ┌─[+ New rule ]─┐          │                                     │
│ │               │          │  Name:        [ KI catalog owners ] │
│ │ KI catalog…   │  ←       │  Description: [ …                ] │
│ │ HUS readers   │          │  Role:        [ catalog_owner  ▾ ] │
│ │ UVA admins    │          │  Institute:   [ ki             ▾ ] │
│ │ …             │          │                                     │
│ │               │          │  Permissions:                       │
│ │               │          │    ☑ catalog:read                   │
│ │               │          │    ☑ catalog:create                 │
│ │               │          │    ☐ catalog:delete                 │
│ │               │          │    [+ custom: resource:action ]     │
│ │               │          │  Selected: [catalog:read ✕]         │
│ │               │          │                                     │
│ │               │          │  Rego preview:                      │
│ │               │          │  ┌────────────────────────────┐     │
│ │               │          │  │ package ds.authz           │     │
│ │               │          │  │ decision := {...}          │     │
│ │               │          │  └────────────────────────────┘     │
│ │               │          │                                     │
│ │               │          │  [Create] [Preview] [Delete] [Cancel] │
└────────────────────────────┴─────────────────────────────────────┘
```

### Creating a new rule

1. Click **+ New rule** at the top of the list.
2. Fill in:
   - **Name** — human-readable, must be unique. E.g. `KI catalog owners`.
   - **Description** — optional free text.
   - **Role** — required. Pick from the dropdown (populated from existing rules + seed vocabulary) or type a new one.
   - **Institute** — optional. Leave blank for cluster-wide rules.
   - **Permissions** — tick the checkboxes for known permissions, or type `resource:action` in the input and click **Add Custom**. Added permissions appear as removable tags below the checklist.
3. (Optional) Click **Preview Rego** — the backend renders the Rego for this single rule so you can eyeball it.
4. Click **Create Rule**. The rule lands in the list and the editor switches to "edit" mode for it.

### Editing a rule

Click any rule in the list to load it into the editor. The button reads **Save Changes** instead of **Create Rule**. All fields are editable. The Rego preview re-renders if you click it.

### Enabling / disabling a rule

Each rule in the list has a toggle. Disabled rules are kept in the DB but excluded from the compiled Rego on deploy. Useful for:

- Temporarily lifting a deny.
- Preparing a future rule and keeping it off until go-live.

Disabled rules appear as a warning in the Manager overview.

### Deleting a rule

**Delete** button in the editor. Prompts for confirmation. The rule is removed from the DB immediately, but **the deployed policy in OPA still contains it until you re-deploy from the Manager tab**.

### Cancel

Discards unsaved edits and clears the editor. Doesn't touch the DB.

### Resizing the rule list

Drag the vertical handle between the list and the editor. Width is kept in memory for the browser session.

### Gotchas

- Two rules with the same (role, institute) but different permission sets show up as a **conflict** in the Manager overview. OPA will apply whichever appears first in the compiled Rego — resolve by merging their permissions or disabling one.
- Permissions are strings; typos will silently create a "new" permission that nothing in the platform actually checks. Prefer the checkbox list.

---

## 3. Policy Manager

### What it does

Big-picture view. Tells you whether your policy set is healthy, what OPA currently has, and lets you push new rules live. Most of the "did we actually ship it?" work happens here.

### Sections

#### Overview

Top of the page: stats (`total_rules`, `enabled_rules`, `disabled_rules`, `roles`, `institutes`, `permissions`), `last_deployed` timestamp, plus two colored callouts:

- **Conflicts** (red) — listed when two enabled rules share (role, institute) but disagree on permissions. Each conflict shows both rule names and the mismatch.
- **Warnings** (amber) — "N rule(s) disabled", "rule X has no permissions", etc. Not blocking but worth a look.

#### Decision matrix

A role × permission grid showing which role has which permission in the currently deployed policy. Hover a cell for the institute breakdown. Use this to spot holes ("does `catalog_consumer` really not have `catalog:read` at uva?") at a glance.

#### Import / Export

| Action | Format | What you get |
|--------|--------|--------------|
| Export | **JSON** | Full rule manifest — name, role, institute, permissions, enabled, timestamps. Round-trippable. |
| Export | **CSV** | One row per rule; permissions comma-joined. Human/spreadsheet-friendly. |
| Export | **Rego** | The compiled Rego that would be deployed right now. Read-only. |
| Import | **JSON** | Bulk-create rules from a manifest. |
| Import | **CSV** | Bulk-create rules from a spreadsheet export. |

Import modes (radio, on the right of the file picker):

- **Append** — add the rules in the file; skip any whose `name` already exists.
- **Replace** — delete all existing rules first, then insert the file's rules. **Destructive.** Confirm before clicking.

On success you get a toast with `imported N, skipped M`.

#### Deploy

The button you've been waiting for. Runs:

1. Read all enabled rules from the DB.
2. Compile to Rego.
3. `PUT /v1/policies/ds_authz` on OPA.
4. Record the event in `deploy_history` with your name, timestamp, and rule count.

A deploy is idempotent — deploying twice with no changes is fine. Always click this after a Builder edit; Builder changes do **not** auto-deploy.

#### Deploy history

Last 10 deploys, newest first. Each row: version #, timestamp, who deployed, number of rules, roles included.

### Gotchas

- Deploying with 0 enabled rules compiles to an "always deny" policy. Every `evaluate` will come back empty. If you meant to blank out a specific site and not break everything, check the disabled-rule warning first.
- Deploy history is stored in the app DB (SQLite/Postgres), not in OPA. Restoring a backup of the DB restores the history; restarting the container doesn't wipe it.

---

## 4. DB Explorer

### What it does

Raw read access to the three app tables: `rules`, `app_metadata`, `deploy_history`. Plus an ad-hoc SQL query box for anything else.

### Sections

#### Stats

Quick counts at the top: how many rows in each table, DB size on disk (SQLite), engine type.

#### Table browsers

Three tabs — one per table. Paginated, sortable. Columns match the SQL schema exactly. Nothing editable — use Builder/Manager for writes.

- **rules** — every rule, enabled or not. Raw permissions JSON in the `permissions_json` column.
- **app_metadata** — key/value pairs the backend uses internally (`version`, `last_deployed`, etc.).
- **deploy_history** — one row per deploy event.

#### SQL console

A text box + **Run** button that posts `{ "sql": "..." }` to `POST /api/v1/db/query`. Results render below as a table.

- **Reads only.** The backend rejects anything that isn't a `SELECT` — no `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ATTACH`/`PRAGMA write`. Safe to experiment.
- Queries are scoped to the app DB only; no cross-database joins.
- Useful snippets:
  ```sql
  -- which rules mention a given permission?
  SELECT id, name, permissions_json FROM rules WHERE permissions_json LIKE '%catalog:delete%';

  -- last 5 deploys with more than 10 rules
  SELECT deployed_at, deployed_by, rules_count FROM deploy_history
  WHERE rules_count > 10 ORDER BY deployed_at DESC LIMIT 5;

  -- roles that are not assigned to any enabled rule
  SELECT DISTINCT role FROM rules WHERE enabled = 1;
  ```

### Gotchas

- The DB is the **app's own** rule store. It is **not** OPA's state. OPA state is only inspected via the API Reference tab or `GET /v1/policies` on OPA directly.
- If `permissions_json` looks empty, the rule is valid but grants nothing — treat it like a placeholder and fix in the Builder.

---

## 5. API Reference

The FastAPI Swagger UI, embedded in an iframe. Equivalent to opening `/docs` directly. Lists every endpoint the backend exposes, with try-it-out support.

Most-used endpoints for integrators:

- `POST /api/v1/policies/evaluate` — the real auth check other services call.
- `GET  /api/v1/rules` — list rules.
- `GET  /api/v1/decision-matrix` — the role×permission grid.
- `POST /api/v1/policies/deploy` — same thing the Manager Deploy button does; useful for CI pipelines.
- `GET  /health` — for load balancers / readiness probes.

The iframe inherits your theme (light/dark) so it stays readable.

---

## Verifying a claim from your own service

If you're building a service (catalog, search, connector, etc.) that needs to ask "is this user allowed to do X?", this is the section for you. The Policy Engine is a plain HTTP service — your code calls one endpoint and reads one field from the response.

### The request

```http
POST /api/v1/policies/evaluate HTTP/1.1
Host: ds-policy-engine.<site>.svc.cluster.local:8000
Content-Type: application/json

{
  "role": "catalog_creator",
  "institute": "ki",
  "name": "alice",
  "email": "alice@example.org"
}
```

Required fields:

| Field | Type | Meaning |
|-------|------|---------|
| `role` | string | The role your caller presents. Comes from your identity provider / JWT claim. |
| `institute` | string | Site/tenant tag. Use `""` (empty string) for cluster-wide checks. |

Optional — passed through to OPA as extra input attributes, useful if a future rule uses them:

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | Display name / username. Logged on the backend. |
| `email` | string | User email. Logged on the backend. |

### The response

HTTP 200 on success (even if the answer is "deny" — deny is a valid answer, not an error):

```json
{
  "status": "success",
  "status_code": 200,
  "message": "Policy evaluated successfully",
  "data": {
    "permissions": ["catalog:read", "catalog:create", "catalog:update"]
  },
  "error": null,
  "metadata": {
    "timestamp": "2026-04-20T07:40:54.260136Z",
    "request_id": "req-fd814169",
    "version": "0.1.0"
  }
}
```

**The single field you care about is `data.permissions`** — a list of `resource:action` strings. Everything else is envelope.

Decision rule in your service:

- `data.permissions` contains the permission you need → **allow**.
- `data.permissions` does not contain it (including the empty list) → **deny**.

HTTP 503 if OPA is unreachable — treat as "deny and retry later":

```json
{
  "status": "error",
  "status_code": 503,
  "message": "Policy engine is not available",
  "error": { "code": "POLICY_ENGINE_UNREACHABLE", ... }
}
```

### Where to point your calls

From another service in the **same namespace** (same site — recommended):

```
http://ds-policy-engine:8000/api/v1/policies/evaluate
```

Same cluster, **different namespace**:

```
http://ds-policy-engine.<site>.svc.cluster.local:8000/api/v1/policies/evaluate
```

Local dev (UI + backend via `docker compose`):

```
http://localhost:8100/api/v1/policies/evaluate   # or whatever POLICY_ENGINE_PORT you set
```

> **Never** hardcode a `https://ds-policy-engine.<site>.nextgen.hiro-develop.nl/...` URL in a service — that path goes out over the public internet even for same-cluster calls. Use the in-cluster DNS name above.

### Examples in code

#### Python (httpx, async)

```python
import httpx

POLICY_ENGINE_URL = "http://ds-policy-engine:8000"

async def check(role: str, institute: str, permission: str) -> bool:
    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.post(
            f"{POLICY_ENGINE_URL}/api/v1/policies/evaluate",
            json={"role": role, "institute": institute},
        )
    if resp.status_code == 503:
        return False  # fail-closed on engine unavailable
    resp.raise_for_status()
    perms = resp.json()["data"]["permissions"]
    return permission in perms

# usage
allowed = await check("catalog_creator", "ki", "catalog:create")
if not allowed:
    raise HTTPException(403, "forbidden")
```

FastAPI dependency pattern:

```python
from fastapi import Depends, HTTPException, Header

def require_permission(perm: str):
    async def _dep(
        role: str = Header(..., alias="X-User-Role"),
        institute: str = Header("", alias="X-User-Institute"),
    ):
        if not await check(role, institute, perm):
            raise HTTPException(403, f"missing permission: {perm}")
    return _dep

@app.post("/catalog/items", dependencies=[Depends(require_permission("catalog:create"))])
async def create_item(...):
    ...
```

#### Python (generated SDK)

If you've published the `ds_policy_engine` PyPI client (see `client/` in the repo), you can skip hand-written HTTP:

```python
from ds_policy_engine import ApiClient, Configuration
from ds_policy_engine.api.default_api import DefaultApi

cfg = Configuration(host="http://ds-policy-engine:8000")
with ApiClient(cfg) as api_client:
    api = DefaultApi(api_client)
    result = api.evaluate_policy({"role": "catalog_creator", "institute": "ki"})
    perms = result.data.permissions
```

#### Node.js (fetch)

```js
async function check(role, institute, permission) {
  const resp = await fetch("http://ds-policy-engine:8000/api/v1/policies/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, institute }),
  });
  if (resp.status === 503) return false;
  if (!resp.ok) throw new Error(`evaluate failed: ${resp.status}`);
  const body = await resp.json();
  return (body.data.permissions || []).includes(permission);
}
```

#### curl (for manual testing)

```bash
curl -sS -X POST http://localhost:8100/api/v1/policies/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"role":"catalog_creator","institute":"ki"}' | jq .data.permissions
```

### Design guidance for callers

1. **Cache the permissions response** for a short window (5–30s) per `(role, institute)` key. The policy changes rarely and a cache hit saves a round-trip on every request.
2. **Fail closed.** If the call errors or times out, deny the action. Never fall back to "allow" on infrastructure failure.
3. **Wire the timeout.** Set an explicit HTTP client timeout (2–5s). The engine is fast but you don't want a hung pod to stall every incoming request.
4. **Log the `request_id`** from `metadata.request_id` into your service's log context when you deny. It's the primary trail when diagnosing "why was I denied?".
5. **Don't call `/evaluate` from hot loops.** One call per incoming API request is fine; N calls inside a page render aren't. If you need to check many permissions at once, fetch the full list for the role once and filter locally.

### Verifying your integration works

1. Open the Policy Engine UI → **Policy Tester** tab.
2. Enter the same `role` + `institute` your service sends. Click **Evaluate**.
3. Confirm the permission you're checking appears in the `Granted permissions` list.
4. From your service, call `/evaluate` with the same payload and confirm the response matches.
5. Then call your own endpoint with a user in that role and confirm it lets them through.

If step 2 passes but step 5 fails, the bug is in your service's check logic (caching, string comparison, header extraction), not in the Policy Engine.

### What the engine does NOT do

Clearing up common misunderstandings:

- It **does not** know who the user is. You tell it the role. Your service authenticates the user (JWT, session, etc.) and extracts the role **before** calling `/evaluate`.
- It **does not** persist user↔role assignments. That's your identity provider's job.
- It **does not** sign tokens. It's a policy decision service, not an auth server.
- It **does not** intercept HTTP traffic. Nothing is implicit — your service explicitly calls it.

---

## Common tasks — quick recipes

### "Add a new role and wire it up"

1. Builder → **+ New rule** → set Role to the new role name, pick institute, tick permissions → **Create**.
2. (Optional) Builder → repeat for other institutes if the role is per-site.
3. Manager → **Deploy**.
4. Tester → Evaluate with the new role to confirm the permissions list.

### "Give one person access for a limited time"

1. Builder → create the rule with the person's institute and the permissions you want.
2. Manager → **Deploy**.
3. When the window expires: Builder → find the rule → **toggle off** → **Deploy** again.

### "Audit: which rules grant `catalog:delete`?"

- DB Explorer → SQL console → `SELECT * FROM rules WHERE permissions_json LIKE '%catalog:delete%';`
- Or Manager → Decision matrix → find the `catalog:delete` column → any row with a check mark has it.

### "Clone the current policy to a new environment"

1. Manager → Export → **JSON** → save the file.
2. Open the target environment's UI.
3. Manager → Import → pick **Replace** → upload the file → confirm.
4. Manager → **Deploy**.

---

## Troubleshooting

### API calls failing

Every API call shows a red toast with the HTTP status. Common causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| Red toast: "Request failed (0)" on every tab | UI can't reach backend | Confirm backend pod is running and the UI's nginx proxy is configured. Visit `/health` in the browser — if it 502s, the proxy target is wrong. |
| "Policy engine unreachable" | OPA down | `kubectl logs` the OPA sidecar; restart the pod. |
| Works in Tester but Builder is blank | `/api/v1/rules/meta` returned empty | Seed the DB via the Import tab, or check that seed_rules.json is mounted in the backend. |
| All tabs work except "API Reference" shows 404 | `/docs` disabled on this site | An operator set `docs.enabled: false` in the gitops values for this environment. Docs are hidden in production by default; use the local/dev UI to explore. |

### Theme didn't stick

The theme is saved in `localStorage` per-browser. Incognito/private windows don't persist it. Clearing site data resets it.

### Sidebar order reset after a reload

Same reason as above — stored in `localStorage`. If you want a specific order for everyone, file a request for a server-side default order (not currently supported).

### "Deploy" succeeded but Tester still returns old permissions

Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R). The Tester caches the roles/permissions meta for the session; new ones won't show up until you reload.

### A rule I just created didn't appear in the deployed policy

You saved but didn't deploy. Builder edits are DB-level; deployment happens only when you click **Deploy** in the Manager tab. This is intentional so you can stage multiple edits and ship them atomically.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Role** | A string like `catalog_owner`. Users present this to the backend when they're authenticated by the upstream identity provider. |
| **Institute** | A site/tenant tag — `ki`, `hus`, `uva`, or blank for cluster-wide. Lets the same role have different permissions at different sites. |
| **Permission** | A `resource:action` string (e.g. `catalog:read`). Other services call `evaluate` and check whether this permission is in the returned list before letting the user proceed. |
| **Rule** | A row in the `rules` table: (name, role, institute, permissions, enabled). One row becomes zero or more Rego clauses depending on `enabled`. |
| **OPA** | [Open Policy Agent](https://openpolicyagent.org) — the engine that runs the compiled Rego and returns the allow/deny decision. Deployed as a sidecar in the policy-engine pod. |
| **Rego** | OPA's policy language. You don't write it; the backend generates it from rules. |
| **Deploy** | Compile → push to OPA → record in deploy_history. Nothing goes live until you deploy. |
| **Decision matrix** | The role × permission grid derived from the currently deployed policy. |
| **Site / node** | A Kubernetes namespace that holds one deployment of the platform. Current sites: `ki`, `hus`, `uva`. |

---

*Questions, corrections, missing sections? Open an issue on the [ds-policy-engine-ui repo](https://github.com/HIRO-MicroDataCenters-BV/ds-policy-engine-ui).*
