-- Bar chart: latest Claude-judged template % per repo (portfolio view, semantic).
-- One bar per repo that has opted into semantic scoring. Repos that haven't
-- enabled it simply don't appear here.
-- Visualization: Bar chart. Unit = "Percent (0-100)".

SELECT
  SUBSTRING_INDEX(latest.repo_url, '/', -1) AS repo,
  CAST(JSON_EXTRACT(latest.display_title, '$.percentages.template_pct_semantic') AS DECIMAL(5,2)) AS template_pct_semantic,
  CAST(JSON_EXTRACT(latest.display_title, '$.percentages.custom_pct_semantic')   AS DECIMAL(5,2)) AS custom_pct_semantic
FROM (
  SELECT cdc.repo_url, d.display_title, d.started_date,
         ROW_NUMBER() OVER (PARTITION BY cdc.repo_url ORDER BY d.started_date DESC) AS rn
  FROM cicd_deployments d
  JOIN cicd_deployment_commits cdc ON cdc.cicd_deployment_id = d.id
  WHERE d.display_title LIKE '{"schema_version"%'
    AND JSON_EXTRACT(d.display_title, '$.percentages.template_pct_semantic') IS NOT NULL
) latest
WHERE latest.rn = 1
ORDER BY template_pct_semantic DESC;
