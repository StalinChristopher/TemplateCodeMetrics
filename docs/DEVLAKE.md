# DevLake configuration

DevLake-specific notes that go beyond the high-level [`SETUP.md`](SETUP.md).

## Ports and what each one does

DevLake's docker-compose exposes four host ports:

| Port | Service | Auth | Used for |
|---|---|---|---|
| `3306` | MySQL | mysql creds | Grafana reads from here; you can query directly for debugging |
| `3002` | Grafana | configurable | Dashboards (anonymous viewer once enabled in step 3 of SETUP) |
| `4000` | Config UI + nginx | Basic auth (`devlake:merico`) | **Webhook endpoint lives here** + admin UI |
| `8080` | DevLake API | API key | Internal — webhook endpoints do NOT live here |

> The webhook plugin endpoints (`/api/plugins/webhook/...`) are routed through the Config UI's nginx on port 4000. Hitting the DevLake API on 8080 directly with the same path returns 401 because port 8080 only authorizes paths under `/api/rest/.*` via API key — and the webhook endpoint isn't under that prefix. Use port 4000 + basic auth.

## The webhook URL

After creating a webhook connection in the UI, the URL pattern is:

```
http(s)://<host>:<port>/api/plugins/webhook/connections/<connection-id>/deployments
```

For a stock localhost install:
```
http://localhost:4000/api/plugins/webhook/connections/1/deployments
```

The `deployments` suffix matters — DevLake has separate webhook endpoints for `issues`, `incidents`, and `deployments`. We use **`deployments`** because the schema includes a `displayTitle` field that we abuse to stash our metrics JSON.

## The DevLake deployment-webhook payload schema

DevLake's documented schema (from `/api/swagger/doc.json` on a running instance):

```json
{
  "id": "<unique string, max 255 chars>",
  "name": "<human-readable, shown in deployment list>",
  "displayTitle": "<longer text — we use this for our metrics JSON blob>",
  "environment": "PRODUCTION | STAGING | TESTING | DEVELOPMENT",
  "startedDate": "2026-06-30T12:00:00Z",
  "finishedDate": "2026-06-30T12:00:00Z",
  "result": "SUCCESS | FAILURE",
  "deploymentCommits": [
    {
      "repoUrl": "https://github.com/org/repo",
      "commitSha": "abc123...",
      "refName": "main",
      "startedDate": "2026-06-30T12:00:00Z",
      "finishedDate": "2026-06-30T12:00:00Z",
      "result": "SUCCESS"
    }
  ]
}
```

Required (top level): `id`, `startedDate`, `finishedDate`. Field names are **camelCase** despite the validator's error messages referring to Go struct names in PascalCase (`WebhookDeploymentReq.Environment` etc.). Use camelCase in your JSON.

The composite action in [`action.yml`](../action.yml) constructs this payload from `metrics.json` via `jq`.

## Where the data lands in MySQL

A single webhook POST writes rows in two tables:

- `cicd_deployments` — one row per deployment. **Our metrics JSON is in `display_title`.**
- `cicd_deployment_commits` — one row per `deploymentCommits[]` entry. Has `repo_url`, `commit_sha`, `started_date`, etc. Joined to `cicd_deployments` via `cicd_deployment_id`.

This means Grafana queries always need a join:

```sql
SELECT cdc.repo_url, d.display_title
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE d.display_title LIKE '{"schema_version"%';
```

The `LIKE` filter discriminates our rows from any other deployment data that might land in the same table.

## Production hardening (when you move off laptop)

1. **Change `ADMIN_PASS`** in DevLake's `.env` from the `merico` default. This password also becomes the `DEVLAKE_BASIC_AUTH` value GitHub Actions use. Update org/repo secrets after rotating.
2. **Put a real TLS terminator in front** (Caddy is easiest, or whatever your VPS provides). Bind `https://devlake.example.com` to `localhost:4000`. Webhook auth works fine through TLS.
3. **Restrict the MySQL port** (3306) — don't expose it to the public internet. Grafana reaches it on the docker network; you don't need external access.
4. **Set a strong Grafana admin password** even with anonymous viewer enabled. Anonymous role is read-only; admins can still edit.

## Optional: custom DevLake plugin for cleaner storage

The current pipeline stores metrics JSON in `cicd_deployments.display_title` as a string, and Grafana uses `JSON_EXTRACT` to query specific fields. This works but isn't ideal at scale — every query parses the JSON.

A cleaner long-term option is a custom DevLake plugin that exposes a real `template_metrics` table with typed columns (`template_pct`, `custom_pct`, `commit_sha`, `repo_url`, etc.). Defer this until query performance or schema rigidity becomes painful — for tens of repos and thousands of commits, the `JSON_EXTRACT` approach is fine.
