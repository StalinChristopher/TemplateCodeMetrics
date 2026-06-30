#!/usr/bin/env node
// Measure how much of a repo's code came from a baseline commit (the "template"
// snapshot) vs was added/modified by hand. Language-agnostic.
//
// Algorithm:
//   baseline = .template-provenance.json#baseline_commit, or the root commit
//   diff baseline..HEAD with --numstat, excluding lockfiles + build artifacts
//   for each tracked file at HEAD:
//     unchanged file        -> all current lines counted as template
//     modified file         -> (orig_loc - removed) template + added custom
//     newly added file      -> all added lines counted as custom
//   for each file that existed at baseline but not at HEAD:
//     deleted               -> orig_loc counted as template_removed (churn only)
//
//   template_pct = template_unchanged / (template_unchanged + custom_added)
//   custom_pct   = custom_added       / (template_unchanged + custom_added)
//
// Configuration via .template-provenance.json (all optional):
//   baseline_commit  — SHA to diff against. Defaults to root commit.
//   extra_excludes   — array of git pathspecs to exclude on top of defaults.
//                      e.g. [":!generated/**", ":!vendor/grpc/**"]

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_EXCLUDES = [
  // Lockfiles (every ecosystem)
  ':!**/package-lock.json', ':!**/yarn.lock', ':!**/pnpm-lock.yaml',
  ':!**/Cargo.lock', ':!**/Gemfile.lock', ':!**/poetry.lock', ':!**/composer.lock',
  ':!**/Pipfile.lock', ':!**/go.sum', ':!**/mix.lock', ':!**/flake.lock',
  // JS / TS / Node
  ':!**/node_modules/**', ':!dist/**', ':!build/**', ':!coverage/**',
  ':!.next/**', ':!.nuxt/**', ':!.svelte-kit/**', ':!out/**', ':!.turbo/**',
  ':!.parcel-cache/**', ':!.cache/**',
  // React Native / mobile
  ':!ios/Pods/**', ':!ios/build/**', ':!ios/DerivedData/**',
  ':!android/build/**', ':!android/.gradle/**', ':!android/app/build/**',
  ':!.expo/**', ':!.expo-shared/**',
  // Native iOS / Xcode
  ':!**/*.xcworkspace/xcuserdata/**', ':!**/*.xcodeproj/xcuserdata/**',
  ':!DerivedData/**',
  // Native Android / Gradle
  ':!.gradle/**', ':!gradle/wrapper/**',
  // Python
  ':!**/__pycache__/**', ':!**/*.pyc', ':!**/*.pyo',
  ':!.venv/**', ':!venv/**', ':!env/**',
  ':!.tox/**', ':!.pytest_cache/**', ':!.mypy_cache/**', ':!.ruff_cache/**',
  ':!*.egg-info/**', ':!.eggs/**',
  // Go
  ':!vendor/**',
  // Rust
  ':!target/**',
  // Java / Maven / Kotlin
  ':!target/**', ':!**/*.class',
  // .NET / C#
  ':!bin/**', ':!obj/**', ':!packages/**',
  // Ruby
  ':!.bundle/**', ':!vendor/bundle/**',
  // Editor + OS noise
  ':!.idea/**', ':!.vscode/**', ':!.vs/**',
  ':!**/.DS_Store',
  // Generic build/temp
  ':!tmp/**', ':!.tmp/**', ':!logs/**',
];

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...opts }).replace(/\n$/, '');
}

function tryGit(args) {
  try { return git(args); } catch { return null; }
}

function readProvenance() {
  const p = resolve(process.cwd(), '.template-provenance.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function resolveBaseline(provenance) {
  if (provenance?.baseline_commit) return provenance.baseline_commit;
  const roots = git(['rev-list', '--max-parents=0', 'HEAD']).split('\n').filter(Boolean);
  if (!roots.length) throw new Error('Cannot determine baseline: no root commit found.');
  return roots[0];
}

function resolveExcludes(provenance) {
  const extras = Array.isArray(provenance?.extra_excludes) ? provenance.extra_excludes : [];
  // Sanity-check extras follow git pathspec exclusion syntax (start with :!)
  const sanitized = extras.filter(e => typeof e === 'string' && e.startsWith(':!'));
  return [...DEFAULT_EXCLUDES, ...sanitized];
}

function countLines(text) {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  if (text.length && text.charCodeAt(text.length - 1) !== 10) n++;
  return n;
}

function blobAtRef(sha, path) {
  try {
    return execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8' });
  } catch { return null; }
}

function workingTreeContent(path) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return null; }
}

function fileExistsAt(sha, path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}:${path}`], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function parseNumstat(baselineSha, excludes) {
  const raw = execFileSync(
    'git',
    ['diff', '--numstat', baselineSha, 'HEAD', '--', '.', ...excludes],
    { encoding: 'utf8' },
  );
  const map = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [a, r, ...rest] = parts;
    const path = rest.join('\t');
    if (a === '-' || r === '-') continue; // binary
    map.set(path, { added: parseInt(a, 10), removed: parseInt(r, 10) });
  }
  return map;
}

function main() {
  const provenance = readProvenance();
  const baselineSha = resolveBaseline(provenance);
  const excludes = resolveExcludes(provenance);
  const headSha = git(['rev-parse', 'HEAD']);
  const remote = tryGit(['config', '--get', 'remote.origin.url']);
  const repoSlug = (() => {
    if (!remote) return null;
    const m = remote.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  })();

  const diff = parseNumstat(baselineSha, excludes);
  const headFiles = git(['ls-files', '--', '.', ...excludes]).split('\n').filter(Boolean);
  const headSet = new Set(headFiles);

  let templateUnchangedLoc = 0;
  let templateModifiedLoc = 0;
  let customAddedLoc = 0;
  let templateRemovedLoc = 0;
  const perFile = [];

  for (const path of headFiles) {
    const d = diff.get(path);
    if (!d) {
      const loc = countLines(workingTreeContent(path) ?? '');
      templateUnchangedLoc += loc;
      perFile.push({ path, status: 'unchanged', template_unchanged: loc, template_modified: 0, custom_added: 0 });
      continue;
    }
    if (!fileExistsAt(baselineSha, path)) {
      customAddedLoc += d.added;
      perFile.push({ path, status: 'added', template_unchanged: 0, template_modified: 0, custom_added: d.added });
      continue;
    }
    const origLoc = countLines(blobAtRef(baselineSha, path) ?? '');
    const removed = Math.min(d.removed, origLoc);
    const unchanged = Math.max(0, origLoc - removed);
    templateUnchangedLoc += unchanged;
    templateModifiedLoc += removed;
    customAddedLoc += d.added;
    perFile.push({ path, status: 'modified', template_unchanged: unchanged, template_modified: removed, custom_added: d.added });
  }

  const baselineFiles = tryGit(['ls-tree', '-r', '--name-only', baselineSha])?.split('\n').filter(Boolean) ?? [];
  for (const path of baselineFiles) {
    if (headSet.has(path)) continue;
    const origLoc = countLines(blobAtRef(baselineSha, path) ?? '');
    if (!origLoc) continue;
    templateRemovedLoc += origLoc;
    perFile.push({ path, status: 'deleted', template_unchanged: 0, template_modified: origLoc, custom_added: 0 });
  }

  const denom = templateUnchangedLoc + customAddedLoc;
  const templatePct = denom === 0 ? 0 : (templateUnchangedLoc / denom) * 100;
  const customPct = denom === 0 ? 0 : (customAddedLoc / denom) * 100;

  const out = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    repo: { remote_url: remote, slug: repoSlug },
    commit_sha: headSha,
    baseline_commit: baselineSha,
    template: {
      package: provenance?.template_package ?? null,
      version: provenance?.template_version ?? null,
      commit_sha: provenance?.template_commit_sha ?? null,
      generated_at: provenance?.generated_at ?? null,
    },
    counts: {
      template_unchanged_loc: templateUnchangedLoc,
      template_modified_loc: templateModifiedLoc,
      custom_added_loc: customAddedLoc,
      template_removed_loc: templateRemovedLoc,
      current_total_loc: templateUnchangedLoc + customAddedLoc,
    },
    percentages: {
      template_pct: +templatePct.toFixed(2),
      custom_pct: +customPct.toFixed(2),
    },
    per_file: perFile,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main();
