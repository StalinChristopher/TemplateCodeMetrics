-- Time series: template % over time for the selected repo.
-- One line per repo (since this is filtered by $repo, it's a single line).
-- Visualization: Time series. Unit = "Percent (0-100)". Min 0, Max 100.

SELECT d.started_date AS time,
       'template_pct' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
  AND $__timeFilter(d.started_date)

UNION ALL

SELECT d.started_date AS time,
       'custom_pct' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.custom_pct') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
  AND $__timeFilter(d.started_date)

ORDER BY time;
