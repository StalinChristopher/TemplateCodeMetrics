# AI-assisted onboarding (Claude + Cursor)

For developers who want their AI assistant to set up template-metrics in a target repo automatically, this project ships two integration files:

| File | Tool | What it does |
|---|---|---|
| [`.claude/commands/setup-template-metrics.md`](../.claude/commands/setup-template-metrics.md) | Claude Code | Adds a `/setup-template-metrics` slash command |
| [`.cursor/rules/template-metrics.mdc`](../.cursor/rules/template-metrics.mdc) | Cursor | Adds an importable rule that responds to prompts like "Set up template metrics" |

Both do the same thing: detect the target repo's project type, ask one question (which baseline commit?), then scaffold the workflow + provenance JSON + print the secrets checklist. No file in the target repo is modified beyond the two new ones. No `git commit` or `gh secret set` is run automatically — those stay in the user's hands.

## Install the Claude command into a target repo

You have two install scopes — project-only (visible only in that repo) or global (visible in every repo).

### Project-only install

From the target repo's root:

```bash
mkdir -p .claude/commands
curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.claude/commands/setup-template-metrics.md \
  -o .claude/commands/setup-template-metrics.md
```

Or, if you've cloned this repo locally:

```bash
cp /path/to/TemplateCodeMetrics/.claude/commands/setup-template-metrics.md \
   .claude/commands/setup-template-metrics.md
```

In a Claude Code session inside that repo, type `/setup-template-metrics` — the command appears in the picker.

### Global install (available in every repo)

```bash
mkdir -p ~/.claude/commands
curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.claude/commands/setup-template-metrics.md \
  -o ~/.claude/commands/setup-template-metrics.md
```

Now `/setup-template-metrics` is available in any Claude Code session.

### Using it

In the target repo, in a Claude Code session:

```
/setup-template-metrics
```

Claude will:
1. Inspect the repo and detect language/framework
2. Ask you which baseline commit to use
3. Create `.template-provenance.json` and `.github/workflows/template-metrics.yml`
4. Print the checklist of remaining steps (set 2 GitHub secrets, commit, push)

Review the diff before committing.

## Install the Cursor rule into a target repo

Cursor rules are project-scoped — install them per repo.

```bash
mkdir -p .cursor/rules
curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.cursor/rules/template-metrics.mdc \
  -o .cursor/rules/template-metrics.mdc
```

Or copy from a local clone:

```bash
cp /path/to/TemplateCodeMetrics/.cursor/rules/template-metrics.mdc \
   .cursor/rules/template-metrics.mdc
```

### Using it

Open the target repo in Cursor. In the AI chat panel (Cmd/Ctrl+L), prompt:

> "Set up template metrics for this repo"

…or any natural variant ("Onboard this repo to TemplateCodeMetrics", "Add template-code tracking", etc.). Cursor's AI loads the rule, follows the steps, and produces the same scaffold + checklist as the Claude command.

Cursor rules are stored in your repo under `.cursor/rules/` — you can commit it so teammates inherit the same AI-assisted onboarding, or `.gitignore` it if you'd rather not.

## Comparison: command vs rule vs manual

| Method | Best when |
|---|---|
| **Claude command** | You're working with Claude Code and want a deterministic slash command |
| **Cursor rule** | You're working in Cursor and prefer natural-language prompts |
| **Manual** | You don't use either AI tool, or you want explicit control — follow [`docs/SETUP.md`](SETUP.md) step 6 |

All three produce the **same artifacts**: `.template-provenance.json` and `.github/workflows/template-metrics.yml` at repo root, with appropriate `extra_excludes` for the detected language. The AI-assisted paths just save you ~5 minutes per repo and reduce the chance of typoing the workflow YAML.

## What if I want a one-liner install for both?

Add this to your shell rc, or run it once per target repo:

```bash
target_repo_install_template_metrics() {
  mkdir -p .claude/commands .cursor/rules
  curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.claude/commands/setup-template-metrics.md \
    -o .claude/commands/setup-template-metrics.md
  curl -fsSL https://raw.githubusercontent.com/StalinChristopher/TemplateCodeMetrics/main/.cursor/rules/template-metrics.mdc \
    -o .cursor/rules/template-metrics.mdc
  echo "Installed. Now open this repo in Claude Code (/setup-template-metrics) or Cursor (prompt: 'Set up template metrics')."
}
```

## Keeping the AI integrations in sync

These files are versioned alongside the rest of TemplateCodeMetrics. If the workflow template, exclusion list, or required secrets change in this canonical repo, re-fetch via the curl commands above to refresh your local copies in each target repo.

If you'd rather pin to a specific version, replace `/main/` in the raw URLs with `/v1.0.0/` (or whatever tag you trust).
