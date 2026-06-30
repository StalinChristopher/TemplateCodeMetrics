# Picking a baseline commit

The `baseline_commit` in `.template-provenance.json` is the most important configuration choice — it defines what "template code" means for your repo.

There's no universally correct answer. The right baseline depends on what question you're trying to answer.

## Common scenarios

### 1. New project generated from a template

Use the **root commit** (the first commit of the repo, which is the unmodified template scaffold).

```bash
git rev-list --max-parents=0 HEAD
```

You can leave `baseline_commit` unset in `.template-provenance.json` — the script falls back to this automatically.

**What you'll measure**: how much of the current code is still the original template, vs how much has been added/modified since generation.

### 2. Long-running project, measure "drift since the last major release"

Use the **commit at a specific tag**:

```bash
git rev-list -n 1 v2.0.0
```

Put that SHA in `baseline_commit`.

**What you'll measure**: how much the codebase has changed since v2.0.0. Useful for tracking accumulated change between releases.

### 3. Long-running project, measure "total code since project inception"

Use the **root commit** (same as scenario 1).

**What you'll measure**: how much of today's code was present in the very first commit. For an established project, this is usually close to 0% (most code was added later). Probably not what you want — scenario 2 is more useful.

### 4. Fork of an upstream template — measure divergence from upstream

Use the **last upstream commit that was merged in**:

```bash
git log --grep "merge" --pretty=format:"%H %s" | grep -i upstream | head -1
```

Or whatever convention you use to mark "synced with upstream." Put that SHA in `baseline_commit`.

**What you'll measure**: how much your fork has diverged from upstream — useful for evaluating merge cost.

### 5. Monorepo where each package has a different baseline

The metric script doesn't natively support per-package baselines. You have two options:

- **Use one baseline for the whole repo** — the simplest, gives a portfolio number
- **Run the workflow N times in a matrix**, each `cd`-ing into a different package and using a different `.template-provenance.json` and `repoUrl` — more work but more accurate

Open an issue if you need first-class monorepo support; it's a worthwhile evolution.

## When to update the baseline

The baseline should be **stable** — moving it changes the meaning of every historical snapshot. Update it only when:

- **You merge a major upstream sync** that you want to treat as a "new starting point"
- **You bump a major version** and want to track drift from that version going forward
- **You realize the original baseline was wrong** (e.g. you picked a commit that already had local changes)

When you do change it, the dashboard's time series will appear to "jump" — earlier data points reflect the old baseline. Document it in your repo's CHANGELOG.

## Verifying your baseline is reasonable

After setting `baseline_commit`, run the metric script locally to sanity-check:

```bash
node /path/to/TemplateCodeMetrics/scripts/template-metrics.mjs | jq '.percentages, .counts'
```

For a fresh repo from a template, expect `template_pct: 100, custom_pct: 0` initially. For a project that's been heavily customized, expect `template_pct` to be lower.

If you see `current_total_loc: 0` or absurdly low numbers, your exclusions may be too aggressive — see [`LANGUAGES.md`](LANGUAGES.md). If you see absurdly high numbers, you're probably counting build artifacts; check that `extra_excludes` covers your repo's generated paths.
