-- Bar chart: latest template % per repo (portfolio view).
-- One bar per repo. Does NOT filter by $repo — this is the cross-repo comparison.
-- Visualization: Bar chart. Unit = "Percent (0-100)".

SELECT
  SUBSTRING_INDEX(latest.repo_url, '/', -1) AS repo,
  CAST(JSON_EXTRACT(latest.display_title, '$.percentages.template_pct') AS DECIMAL(5,2)) AS template_pct,
  CAST(JSON_EXTRACT(latest.display_title, '$.percentages.custom_pct')   AS DECIMAL(5,2)) AS custom_pct
FROM (
  SELECT cdc.repo_url, d.display_title, d.started_date,
         ROW_NUMBER() OVER (PARTITION BY cdc.repo_url ORDER BY d.started_date DESC) AS rn
  FROM cicd_deployments d
  JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
  WHERE d.display_title LIKE '{"schema_version"%'
) latest
WHERE latest.rn = 1
ORDER BY template_pct DESC;
