-- Pie chart: template % vs custom % for the latest snapshot of the selected repo.
-- Two rows, one per slice. Visualization: Pie chart (donut variant).
-- Panel settings: unit = "Percent (0-100)".

SELECT 'Template' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
ORDER BY d.started_date DESC
LIMIT 1

UNION ALL

SELECT 'Custom' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.custom_pct') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
ORDER BY d.started_date DESC
LIMIT 1;
