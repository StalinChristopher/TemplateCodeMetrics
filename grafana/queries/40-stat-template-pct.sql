-- Big-number stat: current template % for the selected repo.
-- Returns a single value. Visualization: Stat. Unit = "Percent (0-100)". Min 0, Max 100.
-- Suggested as the dashboard's headline panel.

SELECT CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct') AS DECIMAL(5,2)) AS template_pct
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url IN (${repo:sqlstring})
  AND d.display_title LIKE '{"schema_version"%'
ORDER BY d.started_date DESC
LIMIT 1;
