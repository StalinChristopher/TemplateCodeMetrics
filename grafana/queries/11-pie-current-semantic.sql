-- Pie chart: Claude-judged template % vs custom % for the latest snapshot of the selected repo.
-- Cosmetic-only diffs (Prettier reformats, renames, comment edits) are absorbed back into template.
-- Only opt-in repos appear (NULL semantic fields are filtered out).
-- Visualization: Pie chart (donut variant). Unit = "Percent (0-100)".

SELECT 'Template (semantic)' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
  AND JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') IS NOT NULL
ORDER BY d.started_date DESC
LIMIT 1

UNION ALL

SELECT 'Custom (semantic)' AS metric,
       CAST(JSON_EXTRACT(d.display_title, '$.percentages.custom_pct_semantic') AS DECIMAL(5,2)) AS value
FROM cicd_deployments d
JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
WHERE cdc.repo_url = ${repo:sqlstring}
  AND d.display_title LIKE '{"schema_version"%'
  AND JSON_EXTRACT(d.display_title, '$.percentages.custom_pct_semantic') IS NOT NULL
ORDER BY d.started_date DESC
LIMIT 1;
