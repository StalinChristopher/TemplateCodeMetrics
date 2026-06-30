# Troubleshooting

Common failure modes and how to fix them. If you hit something not listed here, open an issue.

## "POST to DevLake" step fails with HTTP 401

**Cause**: wrong webhook URL or wrong basic-auth credentials.

Run the same curl manually from your laptop and inspect the response body:

```bash
curl -i -u "devlake:merico" \
  "http://localhost:4000/api/plugins/webhook/connections"
```

Expected response is HTTP 200 with a JSON list of connections.

If you get 401:
- Is the URL on **port 4000** (Config UI + nginx)? Port 8080 will 401 — see [`DEVLAKE.md`](DEVLAKE.md) for why.
- Did you change `ADMIN_PASS` in DevLake's `.env`? Then `devlake:merico` won't work — use your new credentials.
- Is the path right? The webhook is at `/api/plugins/webhook/...`, NOT `/api/rest/plugins/webhook/...`.

If you've created an "API Key" in DevLake's UI thinking it would authorize the webhook — **it won't**. API keys gate the REST API on port 8080. The webhook plugin on port 4000 uses basic auth only. Forget about API keys for this pipeline.

## "POST to DevLake" step fails with HTTP 400

**Cause**: payload shape mismatch.

Check the curl output. If you see validation errors like:
```
Key: 'WebhookDeploymentReq.Environment' Error:Field validation for 'Environment' failed on the 'oneof' tag
```

…it means the JSON body is missing required fields or using wrong field names. The Action's `Build DevLake deployment payload` step should produce a valid payload — if it's still failing, the metric script may have produced an unusable output. Run locally and inspect `metrics.json`.

DevLake expects the deployment-webhook payload in **camelCase JSON** (`startedDate`, `finishedDate`, `deploymentCommits`). The validator error names PascalCase Go struct fields, which is misleading.

## Workflow succeeds but no row in MySQL

**Cause**: usually the "POST to DevLake webhook" step skipped silently because a secret was missing.

Open the Action run, expand the "POST to DevLake" step. If you see:
```
Missing devlake-webhook-url or devlake-basic-auth input — skipping POST.
```

…then `DEVLAKE_WEBHOOK_URL` or `DEVLAKE_BASIC_AUTH` isn't set on the repo (or org). Check **Settings → Secrets and variables → Actions**. Secret names are case-sensitive.

If the POST step DID run, query MySQL directly to confirm the row landed:

```bash
docker compose -f /path/to/devlake/docker-compose.yml exec mysql \
  mysql -umerico -pmerico lake -e "
SELECT id, environment, started_date, SUBSTRING(display_title, 1, 80) AS dt
FROM cicd_deployments
ORDER BY created_at DESC LIMIT 5;"
```

## `template_pct` is 100% even though I've made changes

**Cause**: the metric script needs **full git history**. A shallow checkout breaks the baseline diff.

Make sure your workflow has:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

Without `fetch-depth: 0`, GitHub Actions clones only the latest commit, so the diff against any earlier baseline is empty.

If you already use `fetch-depth: 0` and still see 100%, verify the `baseline_commit` in `.template-provenance.json` actually points to the template baseline (not to a recent commit). See [`BASELINE.md`](BASELINE.md).

## `template_pct` is 0% / `custom_pct` is 100%

**Cause**: the script can't find the baseline commit in your repo's history, so it falls back to comparing against an unrelated SHA.

Check whether the SHA in `baseline_commit` actually exists:

```bash
git cat-file -e <sha-from-provenance>
```

If that errors with "Not a valid object name," your `baseline_commit` value is wrong. Either:
- Update it to a real SHA
- Delete the field and let the script fall back to the root commit

## Numbers wildly inflated (e.g. `current_total_loc` = 500,000 for a small project)

**Cause**: build artifacts are being counted because exclusions don't cover them.

Run the script locally and inspect which paths it's counting:

```bash
node /path/to/template-metrics.mjs | jq '.per_file[] | "\(.template_unchanged + .custom_added) \(.path)"' | sort -rn | head -20
```

The top paths by LOC tell you what's being counted. If you see things like `vendor/`, `dist/`, generated files — add them to `extra_excludes` in your `.template-provenance.json`. See [`LANGUAGES.md`](LANGUAGES.md) for common patterns.

## Dashboard shows nothing in the `$repo` dropdown

**Cause**: no rows in `cicd_deployments` with `display_title` matching `'{"schema_version"%'`.

Run the variable query directly:

```bash
docker compose exec mysql mysql -umerico -pmerico lake -e "
SELECT DISTINCT cdc.repo_url
FROM cicd_deployment_commits cdc
JOIN cicd_deployments d ON cdc.cicd_deployment_id = d.id
WHERE d.display_title LIKE '{\"schema_version\"%';"
```

If this returns no rows, no metrics have been posted yet. Trigger a workflow run on a target repo or POST a manual smoke test (see [`SETUP.md`](SETUP.md)).

## Cloudflare tunnel URL changes every restart

**Cause**: `cloudflared tunnel --url ...` creates an ephemeral URL each time.

For a persistent URL:
1. Sign up for a free Cloudflare account
2. Run `cloudflared tunnel login`
3. `cloudflared tunnel create template-metrics`
4. Configure DNS routing: `cloudflared tunnel route dns template-metrics devlake.example.com`
5. Run as a service: `cloudflared service install`

Or — much better long-term — host DevLake on a real VPS with real DNS.

## Grafana queries return wrong-shaped data

**Cause**: variable interpolation surfaces. The most common is wrapping `$repo` in your own quotes.

Wrong:
```sql
WHERE cdc.repo_url = '$repo'
```

Right:
```sql
WHERE cdc.repo_url = ${repo:sqlstring}
```

The `:sqlstring` formatter handles quoting and escaping properly. Without it, you'll get either no results (if Grafana auto-quotes and your manual quotes double up) or a syntax error.

## `git` errors inside the Action (`fatal: bad revision`, `ambiguous argument`)

**Cause**: the baseline commit isn't reachable from the current HEAD.

Two possible reasons:
1. **Shallow checkout** — add `fetch-depth: 0` to your checkout step.
2. **You force-pushed and rewrote history**, orphaning the baseline. Update `baseline_commit` to a SHA that's actually in your current history.

## "I made the secrets but the action still says they're empty"

GitHub Actions don't expose secrets to PRs from forks. If you're testing via a fork PR, the secrets will be empty by design. Push to a branch in the same repo instead, or use `workflow_dispatch` to trigger manually.
