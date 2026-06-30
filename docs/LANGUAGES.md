# Languages and exclusions

The metric script ignores certain paths so build artifacts, lockfiles, and dependencies don't get counted as "code." This page documents what's excluded by default and how to extend the list.

## How exclusions work

The script uses git pathspecs with the exclusion syntax `:!<pattern>`, passed to `git diff --numstat` and `git ls-files`. These respect git's standard ignore patterns.

The default list is built into [`scripts/template-metrics.mjs`](../scripts/template-metrics.mjs). Projects can extend it via `extra_excludes` in `.template-provenance.json`:

```json
{
  "schema_version": 1,
  "baseline_commit": "abc123",
  "extra_excludes": [
    ":!proto/generated/**",
    ":!vendor/third-party/**"
  ]
}
```

The script merges defaults + your extras at runtime.

## Default exclusions by ecosystem

### Lockfiles (all ecosystems)

`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `composer.lock`, `Pipfile.lock`, `go.sum`, `mix.lock`, `flake.lock`.

### JavaScript / TypeScript / Node

- `**/node_modules/**`
- `dist/**`, `build/**`, `coverage/**`
- `.next/**`, `.nuxt/**`, `.svelte-kit/**`, `out/**`
- `.turbo/**`, `.parcel-cache/**`, `.cache/**`

### React Native

- `ios/Pods/**`, `ios/build/**`, `ios/DerivedData/**`
- `android/build/**`, `android/.gradle/**`, `android/app/build/**`
- `.expo/**`, `.expo-shared/**`

### Native iOS / Xcode

- `**/*.xcworkspace/xcuserdata/**`
- `**/*.xcodeproj/xcuserdata/**`
- `DerivedData/**`

You may also want to add via `extra_excludes`:
- `:!Carthage/**` if you use Carthage
- `:!Pods/**` if iOS sources live outside an `ios/` subfolder

### Native Android / Gradle / Kotlin

- `.gradle/**`, `gradle/wrapper/**`
- `**/*.class`
- `bin/**`, `obj/**`

### Python

- `**/__pycache__/**`, `**/*.pyc`, `**/*.pyo`
- `.venv/**`, `venv/**`, `env/**`
- `.tox/**`, `.pytest_cache/**`, `.mypy_cache/**`, `.ruff_cache/**`
- `*.egg-info/**`, `.eggs/**`

For Django projects, consider adding via `extra_excludes`:
- `:!**/migrations/**` if you don't want auto-generated migrations counted
- `:!staticfiles/**`

### Go

- `vendor/**`

For projects using code generation, add:
- `:!**/*.pb.go` (protobuf generated)
- `:!**/zz_generated_*.go` (controller-gen, etc.)

### Rust

- `target/**`

### Java / Maven / Gradle

- `target/**`
- `**/*.class`

### .NET / C#

- `bin/**`, `obj/**`, `packages/**`

### Ruby

- `.bundle/**`, `vendor/bundle/**`

### Editor / OS metadata

- `.idea/**`, `.vscode/**`, `.vs/**`
- `**/.DS_Store`

### Generic build / temp

- `tmp/**`, `.tmp/**`, `logs/**`

## Things you might want to add via `extra_excludes`

These aren't excluded by default because they're project-specific or might be intentional:

| Pattern | When to exclude |
|---|---|
| `:!**/migrations/**` | Django or Rails auto-generated migrations |
| `:!**/__generated__/**` | Relay, Apollo, GraphQL codegen output |
| `:!**/*.pb.go`, `:!**/*.pb.py` | Protobuf-generated code |
| `:!**/*.g.dart`, `:!**/*.freezed.dart` | Flutter/Dart codegen |
| `:!docs/**` | If docs are huge and you don't want them counted |
| `:!**/fixtures/**` | Large test fixtures |
| `:!**/snapshots/**` | Jest/RSpec snapshot files |
| `:!third_party/**`, `:!vendor/**/third_party/**` | Vendored deps not in standard locations |

## Things NOT to exclude

Don't exclude these — they're real code:

- `src/**`, `lib/**`, `app/**`, `tests/**`, `spec/**`
- `**/*.md` (docs are written effort too; only exclude if they dominate the count and you don't care)
- Config files at repo root (`tsconfig.json`, `pyproject.toml`, etc.) — these are part of the project's defined surface

## Debugging exclusions

To see exactly which files the script is counting vs ignoring, run it locally and inspect `per_file`:

```bash
node /path/to/TemplateCodeMetrics/scripts/template-metrics.mjs | jq '.per_file[] | "\(.status) \(.path)"' | sort | uniq -c | sort -rn | head
```

This gives you a count of each `status` (unchanged / modified / added / deleted) per directory. If you see build artifacts in there, add an `extra_excludes` entry and rerun.

## Per-language examples

See [`examples/`](../examples) for sample `.template-provenance.json` files for:
- React Native (`examples/react-native/.template-provenance.json`)
- Native iOS (`examples/native-ios/.template-provenance.json`)
- Native Android (`examples/native-android/.template-provenance.json`)
- Python (`examples/python/.template-provenance.json`)
- Go (`examples/go/.template-provenance.json`)
