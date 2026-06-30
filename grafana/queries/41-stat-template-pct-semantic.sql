-- Big-number stat: current Claude-judged (semantic) template % for the selected repo.
-- Only repos that have opted into semantic scoring (ANTHROPIC_API_KEY set) appear here.
-- Visualization: Stat. Unit = "Percent (0-100)". Min 0, Max 100.

SELECT CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') AS DECIMAL(5,2)) AS template_pct_semantic
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
  AND JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') IS NOT NULL
ORDER BY d.started_date DESC
LIMIT 1;
