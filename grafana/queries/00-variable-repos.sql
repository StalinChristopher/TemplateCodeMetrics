-- Populates the $repo dropdown in the dashboard.
-- Returns one row per unique repo URL that has ever posted a template-metrics snapshot.
-- Auto-discovers new repos: as soon as a target repo POSTs its first snapshot, it appears here.

SELECT DISTINCT cdc.repo_url
FROM cicd_deployment_commits cdc
JOIN cicd_deployments d ON cdc.cicd_deployment_id = d.id
WHERE d.display_title LIKE '{"schema_version"%'
ORDER BY cdc.repo_url;
