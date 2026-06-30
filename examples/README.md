# Examples

Drop-in starting points for adopting TemplateCodeMetrics in your repo.

## What's here

| File | Use when |
|---|---|
| `workflow-template-metrics.yml` | The GitHub Actions workflow every target repo needs. Copy to `.github/workflows/template-metrics.yml` in the target. |
| `react-native/.template-provenance.json` | RN apps generated from `ct-react-native-template`. |
| `native-ios/.template-provenance.json` | Native Xcode projects (Swift/Obj-C), incl. Carthage/Fastlane exclusions. |
| `native-android/.template-provenance.json` | Gradle-based Android projects with Proguard, captures, and local.properties exclusions. |
| `python/.template-provenance.json` | Django/Flask/etc. projects. Excludes migrations and staticfiles. |
| `go/.template-provenance.json` | Go projects with protobuf and mock codegen excluded. |

## How to use

1. Pick the example matching your project type
2. Copy it to your target repo's root as `.template-provenance.json`
3. Replace `REPLACE_WITH_YOUR_BASELINE_SHA` with your actual baseline commit (see [`../docs/BASELINE.md`](../docs/BASELINE.md))
4. Copy `workflow-template-metrics.yml` to `.github/workflows/template-metrics.yml`
5. Set the two GitHub secrets (`DEVLAKE_WEBHOOK_URL`, `DEVLAKE_BASIC_AUTH`)
6. Commit, push, watch the dashboard

## Adding examples for new languages

If your stack isn't covered, add a new directory here with a `.template-provenance.json` that lists the right `extra_excludes` for your ecosystem. The default exclusion list in [`../scripts/template-metrics.mjs`](../scripts/template-metrics.mjs) covers most cases; `extra_excludes` is for things specific to your project (generated code paths, vendored deps in non-standard locations, etc.).

PRs welcome.
