# Changelog

All notable changes to TemplateCodeMetrics are documented here.

## v1.0.0 — Initial release

**Action**
- Composite GitHub Action (`action.yml`) that target repos consume via `uses: StalinChristopher/TemplateCodeMetrics@v1`
- Inputs: `devlake-webhook-url`, `devlake-basic-auth`, `baseline-commit` (optional), `environment` (optional), `fail-on-post-error` (optional)
- Outputs: `template-pct`, `custom-pct`, `current-total-loc`

**Metric script (`scripts/template-metrics.mjs`)**
- Computes template-vs-custom LOC by diffing baseline commit against HEAD
- Language-agnostic default exclusion list covering JS/TS, RN, native iOS/Android, Python, Go, Rust, Java, Ruby, .NET
- Optional `extra_excludes` array in `.template-provenance.json` for project-specific paths
- Baseline auto-resolution: explicit `baseline_commit` → root commit fallback

**Grafana**
- Pre-built dashboard (`grafana/dashboard.json`) with `$repo` variable, stat panel, pie chart, time series, cross-repo bar chart
- Individual SQL queries in `grafana/queries/` for manual panel building

**Docs**
- `docs/SETUP.md` — end-to-end admin setup
- `docs/DEVLAKE.md` — DevLake-specific configuration
- `docs/GRAFANA.md` — dashboard import + `$repo` variable usage
- `docs/BASELINE.md` — choosing a meaningful baseline commit
- `docs/LANGUAGES.md` — default exclusions by ecosystem
- `docs/TROUBLESHOOTING.md` — common failure modes

**Examples**
- Per-language `.template-provenance.json` starting points: RN, native iOS, native Android, Python, Go
- Sample workflow yaml ready to drop in

**AI-assisted onboarding**
- `.claude/commands/setup-template-metrics.md` — Claude Code slash command for one-shot target-repo scaffolding
- `.cursor/rules/template-metrics.mdc` — Cursor rule that responds to natural-language onboarding prompts
- `docs/AI-AGENT-INTEGRATION.md` — install + usage guide for both
