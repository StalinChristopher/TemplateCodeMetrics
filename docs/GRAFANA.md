# Grafana — dashboard, queries, and the `$repo` variable

Two ways to use this:
- **Fast path**: import [`grafana/dashboard.json`](../grafana/dashboard.json), done
- **Manual path**: build the panels using the SQL queries in [`grafana/queries/`](../grafana/queries/)

## Fast path — import the dashboard

1. Open Grafana → **Dashboards → New → Import**
2. Click **Upload JSON file** and pick [`grafana/dashboard.json`](../grafana/dashboard.json)
3. Datasource: pick **MySQL (lake)** (created automatically by DevLake's compose)
4. Click **Import**

Done. The dashboard's `$repo` dropdown is empty until your first repo POSTs.

## The `$repo` variable — auto-discovers new repos

The dashboard uses a Grafana template variable named `repo` that populates itself from existing data. Once you have N repos POSTing, the dropdown shows N entries — no per-repo configuration.

**Variable definition** (Dashboard Settings → Variables):

| Field | Value |
|---|---|
| Name | `repo` |
| Type | `Query` |
| Datasource | `MySQL (lake)` |
| Refresh | `On dashboard load` |
| Multi-value | off |
| Include All option | on (for cross-repo views) |
| Query | See [`grafana/queries/00-variable-repos.sql`](../grafana/queries/00-variable-repos.sql) |

## Manual path — build panels yourself

If you'd rather not import the JSON, here are the SQL files behind each panel.

### Pie chart — template vs custom (latest snapshot for the selected repo)

File: [`grafana/queries/10-pie-current.sql`](../grafana/queries/10-pie-current.sql)

Visualization: **Pie chart** (donut variant). Unit: percent (0-100).

### Time series — template % over time (selected repo)

File: [`grafana/queries/20-timeseries.sql`](../grafana/queries/20-timeseries.sql)

Visualization: **Time series**. Unit: percent (0-100). Min 0, Max 100.

### Bar chart — all repos compared

File: [`grafana/queries/30-cross-repo-bar.sql`](../grafana/queries/30-cross-repo-bar.sql)

Visualization: **Bar chart**. Don't filter this by `$repo` — it's a portfolio view.

### Big-number stat — current template % for the selected repo

File: [`grafana/queries/40-stat-template-pct.sql`](../grafana/queries/40-stat-template-pct.sql)

Visualization: **Stat**. Unit: percent. Use it as the headline number on the dashboard.

### Semantic row — Claude-judged panels (opt-in repos only)

The dashboard has a second row of four panels titled **"Semantic (Claude-judged — opt-in repos only)"** that mirror the deterministic panels but read `template_pct_semantic` and `custom_pct_semantic` from the metrics JSON. Files:

- [`grafana/queries/41-stat-template-pct-semantic.sql`](../grafana/queries/41-stat-template-pct-semantic.sql)
- [`grafana/queries/11-pie-current-semantic.sql`](../grafana/queries/11-pie-current-semantic.sql)
- [`grafana/queries/21-timeseries-semantic.sql`](../grafana/queries/21-timeseries-semantic.sql)
- [`grafana/queries/31-cross-repo-bar-semantic.sql`](../grafana/queries/31-cross-repo-bar-semantic.sql)

Each query filters on `JSON_EXTRACT(..., '$.percentages.template_pct_semantic') IS NOT NULL`. Repos that haven't enabled semantic scoring (no `ANTHROPIC_API_KEY` secret) won't appear in these panels — they aren't counted as 0%. This means:

- The **stat / pie / timeseries** panels show blank for the selected repo when it's opt-out — that's correct behavior.
- The **cross-repo bar chart** only lists opt-in repos. To know which repos are opt-in at a glance, that bar chart is the canonical view.

The most useful comparison is the timeseries pair: the gap between the deterministic and semantic lines on the same repo tells you how much of the apparent "customization" was actually formatting passes.

## Important: variable interpolation in SQL

Always use Grafana's `:sqlstring` format for the `$repo` variable:

```sql
WHERE cdc.repo_url = ${repo:sqlstring}
```

**Don't** wrap it in your own quotes like `WHERE cdc.repo_url = '$repo'` — Grafana auto-quotes it for the default formatter, and you'll get doubled quotes and a SQL syntax error. The `:sqlstring` formatter handles quoting and escaping correctly.

## Deep-linking per repo

The dashboard URL accepts the variable as a query param:

```
https://devlake.example.com/grafana/d/<uid>/template-code-metrics?var-repo=https://github.com/codeandtheory/MetricsTestApp
```

This is how you give different teams a bookmarkable view of "their repo" using the same dashboard. Behind the scenes, one dashboard serves everyone.

## When you want a separate dashboard per repo (you probably don't)

If a particular repo needs a fundamentally different view (different metrics, different panels), duplicate the dashboard in Grafana and remove the `$repo` variable. But for "the same panels filtered to repo X," the variable + URL param approach is strictly better:

| Approach | Adding a new repo | Updating panel design |
|---|---|---|
| Per-repo dashboards | Duplicate, find-replace SQL (5 min × N repos) | Edit N dashboards |
| Variable + deep-link | Zero — dropdown auto-populates | Edit one panel; everyone benefits |

## Exporting your dashboard (for committing back to this repo)

If you build new panels or modify the dashboard, export and re-commit:

1. Dashboard → **Settings → JSON Model → Copy**
2. Paste into [`grafana/dashboard.json`](../grafana/dashboard.json) and commit

Treat the dashboard as code.
