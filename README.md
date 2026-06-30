# Template Code Metrics

A drop-in GitHub Action that tells you **what percentage of a repo is still its original/template code, and how much has been customized.** Works for any language or framework.

It writes per-commit snapshots to [Apache DevLake](https://devlake.apache.org/) so you can visualize the breakdown over time in Grafana — pie charts, time series, cross-repo comparison.

```
┌────────────────────┐    ┌──────────────────┐    ┌──────────────┐
│  Your repo's CI    │ ─▶ │  DevLake webhook │ ─▶ │  Grafana     │
│  (this Action)     │    │  + MySQL         │    │  dashboard   │
└────────────────────┘    └──────────────────┘    └──────────────┘
```

## What you get

For each push, the Action computes:

| Metric | Meaning |
|---|---|
| `template_pct` | % of current code that came verbatim from the baseline commit |
| `custom_pct` | % of current code added or modified since the baseline |
| per-file breakdown | which files were unchanged / modified / added / deleted |

These get POSTed to DevLake and become queryable in Grafana.

## Use in any repo (target side)

Once your admin has set up DevLake + the GitHub secrets (see [`docs/SETUP.md`](docs/SETUP.md)), every target repo needs **one workflow file + one provenance JSON**.

**Fast path — let your AI assistant do it.** TemplateCodeMetrics ships a Claude Code slash command and a Cursor rule that scaffold the workflow + provenance for you after asking one question (which baseline?). See [`docs/AI-AGENT-INTEGRATION.md`](docs/AI-AGENT-INTEGRATION.md). One-liner per target repo:

```bash
mkdir -p .claude/commands .cursor/rules
curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/update-action-file/.claude/commands/setup-template-metrics.md \
  -o .claude/commands/setup-template-metrics.md
curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.cursor/rules/template-metrics.mdc \
  -o .cursor/rules/template-metrics.mdc
```

Then in Claude Code type `/setup-template-metrics`, or in Cursor prompt "Set up template metrics for this repo."

**Manual path** — copy the two files yourself:

### `.github/workflows/template-metrics.yml`

```yaml
name: Template Metrics
on:
  push:
    branches: [main]
  pull_request:
    types: [closed]
  workflow_dispatch:

jobs:
  measure:
    if: github.event_name != 'pull_request' || github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0           # required — needs full history

      - uses: StalinChristopher/TemplateCodeMetrics@v1
        with:
          devlake-webhook-url: ${{ secrets.DEVLAKE_WEBHOOK_URL }}
          devlake-basic-auth:  ${{ secrets.DEVLAKE_BASIC_AUTH }}
```

### `.template-provenance.json`

```json
{
  "schema_version": 1,
  "baseline_commit": "<sha-of-your-baseline>",
  "extra_excludes": []
}
```

Pick the baseline commit — usually a tagged release, a known-good state, or the project's root commit. See [`docs/BASELINE.md`](docs/BASELINE.md).

For projects where the default exclusions miss something specific to your stack, list extra git pathspecs in `extra_excludes` (e.g. `:!proto/generated/**`). See [`docs/LANGUAGES.md`](docs/LANGUAGES.md) for what's excluded by default in each ecosystem.

### Secrets

Add these to the target repo (or as org-level secrets so all your repos inherit them):

| Secret | Value |
|---|---|
| `DEVLAKE_WEBHOOK_URL` | The webhook URL your admin gives you (looks like `https://devlake.example.com/api/plugins/webhook/connections/1/deployments`) |
| `DEVLAKE_BASIC_AUTH` | `user:pass` for the DevLake config UI (default `devlake:merico` on stock installs) |

That's it. Push to main, watch the workflow run, check the dashboard.

## Repo layout

| Path | Purpose |
|---|---|
| `action.yml` | The composite GitHub Action manifest — what target repos consume |
| `scripts/template-metrics.mjs` | The actual metric computation (multi-language, language-agnostic) |
| `grafana/dashboard.json` | Exported Grafana dashboard — import once into your DevLake instance |
| `grafana/queries/*.sql` | The SQL queries each panel runs, in case you want to build panels by hand |
| `.claude/commands/setup-template-metrics.md` | Claude Code slash command — `/setup-template-metrics` scaffolds onboarding in any target repo |
| `.cursor/rules/template-metrics.mdc` | Cursor rule — natural-language onboarding via "Set up template metrics" prompt |
| `docs/SETUP.md` | End-to-end setup walkthrough (admin task, once) |
| `docs/AI-AGENT-INTEGRATION.md` | How to install/use the Claude command + Cursor rule in any target repo |
| `docs/DEVLAKE.md` | How to host / configure DevLake for this pipeline |
| `docs/GRAFANA.md` | How to import the dashboard and use the `$repo` dropdown |
| `docs/BASELINE.md` | How to pick a meaningful baseline commit for different project shapes |
| `docs/LANGUAGES.md` | Default exclusions per ecosystem + how to extend |
| `docs/TROUBLESHOOTING.md` | Common failure modes (401s, payload errors, empty dashboard, …) |
| `examples/` | Per-language sample `.template-provenance.json` + workflow snippets |

## Quick start by role

- **You're an admin standing this up for the first time** → [`docs/SETUP.md`](docs/SETUP.md)
- **You're a dev adding metrics to your repo** → [Use in any repo](#use-in-any-repo-target-side) above
- **You're leadership viewing the dashboard** → Bookmark the Grafana URL your admin shares. No setup.
- **You're debugging a problem** → [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

## How it works (briefly)

1. The Action runs `node scripts/template-metrics.mjs` in your repo
2. The script reads `.template-provenance.json` for the baseline commit
3. It runs `git diff --numstat <baseline> HEAD` over all tracked files (minus exclusions)
4. It classifies each file: unchanged → all template; modified → template + custom; added → all custom; deleted → template removed
5. It computes `template_pct` and `custom_pct` based on current LOC
6. The Action wraps the JSON in DevLake's deployment-webhook schema and POSTs it
7. DevLake stores the row in `cicd_deployments` (with our full metrics JSON in `display_title`)
8. Grafana panels `JSON_EXTRACT` from `display_title` to render the dashboard

No tracking beacons, no per-repo dashboards, no manual data wrangling. One Action, one JSON file, two secrets.

## Status

Validated against React Native template apps. The exclusion list and `extra_excludes` mechanism are designed to handle Python, Go, Java/Kotlin, Rust, Ruby, .NET, native iOS/Android out of the box — see `docs/LANGUAGES.md`.
