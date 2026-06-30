# Grafana SQL queries

Individual SQL files behind each panel of the dashboard. Use these if you'd rather build panels manually instead of importing `../dashboard.json`.

| File | Panel | Visualization |
|---|---|---|
| `00-variable-repos.sql` | The `$repo` dropdown variable | Variable (not a panel) |
| `10-pie-current.sql` | Template vs custom — current snapshot | Pie chart (donut) |
| `11-pie-current-semantic.sql` | Template vs custom — semantic (Claude-judged) | Pie chart (donut) |
| `20-timeseries.sql` | Template % over time | Time series |
| `21-timeseries-semantic.sql` | Template % over time — semantic | Time series |
| `30-cross-repo-bar.sql` | All repos comparison | Bar chart |
| `31-cross-repo-bar-semantic.sql` | All repos comparison — semantic | Bar chart |
| `40-stat-template-pct.sql` | Headline template % number | Stat |
| `41-stat-template-pct-semantic.sql` | Headline semantic template % number | Stat |

The `*-semantic.sql` files all filter rows where `JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') IS NOT NULL`, so only repos that have opted into Claude-judged scoring (by setting the `anthropic-api-key` action input) appear in those panels. Repos that haven't enabled it simply don't show up — they aren't counted as 0%.

## Variable interpolation

All queries that filter by a specific repo use `${repo:sqlstring}`. This is Grafana's safe SQL formatter — it handles quoting and escaping the value from the `$repo` variable. **Don't** wrap it in your own quotes like `'$repo'` — that doubles up and breaks.

## Datasource

All queries run against the **MySQL (lake)** datasource that DevLake's docker-compose creates automatically.

## Data shape

All metric rows live in `cicd_deployments` with our JSON in `display_title`. The `LIKE '{"schema_version"%'` filter discriminates our rows from any other deployment data DevLake might collect (e.g. from a GitHub Actions plugin connection).

`cicd_deployment_commits` is the per-commit child table; join via `cicd_deployment_id`. The `repo_url` lives there.
