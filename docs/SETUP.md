# Setup — end-to-end

This is the one-time **admin** setup. After this, devs only need to add the workflow + provenance JSON + secrets per target repo (see the main [`README.md`](../README.md)).

Estimated time: ~1 hour for a fresh VM, ~15 minutes if DevLake is already running.

## Prerequisites

- A machine where DevLake + Grafana will live (cloud VM ≥ 2GB RAM, or your laptop for prototyping)
- Docker + Docker Compose
- A way to expose DevLake to the public internet (for GitHub Actions to reach it). Options:
  - **Production**: real DNS + TLS (Caddy, Cloudflare, your VPS's load balancer) → `https://devlake.example.com`
  - **Prototype**: `cloudflared tunnel --url http://localhost:4000` → ephemeral `*.trycloudflare.com` URL

## Step 1 — Run DevLake

Clone Apache DevLake's docker-compose:

```bash
git clone https://github.com/apache/incubator-devlake.git
cd incubator-devlake
docker compose up -d
```

This starts four services:
- `mysql` (port 3306) — data store
- `devlake` (port 8080) — backend API
- `config-ui` (port 4000) — admin UI + nginx-protected webhook endpoints
- `grafana` (port 3002) — dashboards

Wait ~30 seconds, then open `http://localhost:4000` (login `devlake` / `merico` by default — change in `.env` for production).

## Step 2 — Create the webhook connection

In DevLake's Config UI:

1. **Data Connections → Webhook → Create new connection**
2. Name it `template-metrics` (or anything descriptive)
3. Save

Note the **connection ID** that gets assigned (typically `1` for your first one). You'll need it for the webhook URL.

The full webhook URL becomes:

```
http://localhost:4000/api/plugins/webhook/connections/<id>/deployments
```

…or with your public hostname:

```
https://devlake.example.com/api/plugins/webhook/connections/<id>/deployments
```

> **Important**: the webhook endpoint lives behind the Config UI's nginx on port **4000**, not the DevLake API on port 8080. See [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md) for why.

## Step 3 — Enable Grafana anonymous viewer (so leadership can view without logins)

Edit DevLake's `docker-compose.yml`, find the `grafana` service, add to its `environment:` block:

```yaml
GF_AUTH_ANONYMOUS_ENABLED: "true"
GF_AUTH_ANONYMOUS_ORG_ROLE: "Viewer"
GF_SERVER_ROOT_URL: "https://devlake.example.com/grafana"   # use your real URL
```

Restart Grafana:

```bash
docker compose up -d grafana
```

Anyone with the dashboard URL can now view (no edit).

## Step 4 — Import the dashboard

The pre-built dashboard with pie chart, time series, and cross-repo bar chart lives at [`grafana/dashboard.json`](../grafana/dashboard.json) in this repo.

1. Open Grafana → **Dashboards → New → Import**
2. **Upload JSON file** → select `grafana/dashboard.json`
3. When prompted for a datasource, pick **MySQL (lake)** (DevLake creates it automatically)
4. Click **Import**

The dashboard's `$repo` dropdown will start empty — it auto-populates the first time any target repo POSTs a snapshot.

If you'd rather build the panels by hand, the queries are individually in [`grafana/queries/`](../grafana/queries/) — see [`docs/GRAFANA.md`](GRAFANA.md).

## Step 5 — Configure GitHub secrets

Two options:

### Option A — Org-level secrets (recommended if all target repos live in one org)

In your GitHub org → **Settings → Secrets and variables → Actions → New organization secret**:

| Name | Value |
|---|---|
| `DEVLAKE_WEBHOOK_URL` | `https://devlake.example.com/api/plugins/webhook/connections/1/deployments` |
| `DEVLAKE_BASIC_AUTH` | `devlake:<your-pass>` |

Every new repo in the org inherits them automatically.

### Option B — Per-repo secrets

Same idea but on each target repo's settings page. Useful for external orgs or one-off repos.

## Step 6 — Adopt in a target repo

In any repo you want to track, add two files:

### `.github/workflows/template-metrics.yml`

```yaml
name: Template Metrics
on:
  push:
    branches: [main]
  pull_request:
    types: [closed]
  workflow_dispatch:

jobs:
  measure:
    if: github.event_name != 'pull_request' || github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: codeandtheory/TemplateCodeMetrics@v1
        with:
          devlake-webhook-url: ${{ secrets.DEVLAKE_WEBHOOK_URL }}
          devlake-basic-auth:  ${{ secrets.DEVLAKE_BASIC_AUTH }}
```

### `.template-provenance.json`

```json
{
  "schema_version": 1,
  "baseline_commit": "<your-baseline-sha>",
  "extra_excludes": []
}
```

For how to pick `baseline_commit` and which `extra_excludes` to add for your language, see [`docs/BASELINE.md`](BASELINE.md) and [`docs/LANGUAGES.md`](LANGUAGES.md). Per-language examples are under [`examples/`](../examples).

Commit, push to main, and within ~1 minute the workflow run completes and your repo appears in the Grafana dashboard's `$repo` dropdown.

## Step 6b — Optional: enable semantic (Claude-judged) scoring

Alongside the deterministic git-diff score, the action can also compute a Claude-judged **semantic** score that discounts cosmetic-only changes (Prettier reformats, renames, comment edits, import reorderings). This shows up as a second row of panels in Grafana.

It's opt-in per repo: if you don't set the API key, the semantic fields are emitted as `null` and the Grafana semantic panels simply skip this repo.

1. Get an Anthropic API key from https://console.anthropic.com (or use an org-level key).
2. Add it as a GitHub Actions secret named `ANTHROPIC_API_KEY` (repo-level, or org-level so all opt-in repos inherit it).
3. Add the input to the target repo's workflow:
   ```yaml
   - uses: codeandtheory/TemplateCodeMetrics@v1
     with:
       devlake-webhook-url: ${{ secrets.DEVLAKE_WEBHOOK_URL }}
       devlake-basic-auth:  ${{ secrets.DEVLAKE_BASIC_AUTH }}
       anthropic-api-key:   ${{ secrets.ANTHROPIC_API_KEY }}    # opt-in
   ```

Cost is roughly 1 cent per commit on the default model (`claude-haiku-4-5-20251001`). The action will skip the semantic step automatically when the diff exceeds 10,000 changed lines (configurable via `semantic-max-diff-lines`) as a runaway-cost guardrail, and falls back gracefully on API failures without breaking the deterministic path.

## Step 7 — Share with leadership

Send leadership the public Grafana URL:

```
https://devlake.example.com/grafana/d/<dashboard-uid>/template-code-metrics
```

Optional: deep-link to a specific repo with `?var-repo=<repo-url>`.

## Verification

You're done when:
- [ ] `http://localhost:4000` reachable with `devlake`/`merico`
- [ ] Webhook connection ID known
- [ ] Anonymous Grafana enabled (open Grafana URL in incognito → dashboards visible read-only)
- [ ] Dashboard imported from `grafana/dashboard.json`
- [ ] At least one target repo has the workflow + provenance + secrets
- [ ] After a push to that repo, the `$repo` dropdown in Grafana shows it

If any step blocks, see [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
