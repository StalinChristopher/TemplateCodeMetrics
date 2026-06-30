-- Time series: Claude-judged template % over time for the selected repo.
-- Compare against the deterministic timeseries (20-timeseries.sql) — the gap
-- between the two lines shows how much of the apparent "customization" was
-- actually formatting/renames that the semantic pass forgave.
-- Visualization: Time series. Unit = "Percent (0-100)". Min 0, Max 100.

SELECT d.started_date AS time,
       'template_pct_semantic' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url IN (${repo:sqlstring})
  AND d.display_title LIKE '{"schema_version"%'
  AND JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') IS NOT NULL
  AND $__timeFilter(d.started_date)

UNION ALL

SELECT d.started_date AS time,
       'custom_pct_semantic' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.custom_pct_semantic') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url IN (${repo:sqlstring})
  AND d.display_title LIKE '{"schema_version"%'
  AND JSON_EXTRACT(d.display_title, '$.percentages.custom_pct_semantic') IS NOT NULL
  AND $__timeFilter(d.started_date)

ORDER BY time;
