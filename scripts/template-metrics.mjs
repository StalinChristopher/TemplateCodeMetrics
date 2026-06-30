#!/usr/bin/env node
// Measure how much of a repo's code came from a baseline commit (the "template"
// snapshot) vs was added/modified by hand. Language-agnostic.
//
// Deterministic algorithm:
//   baseline = .template-provenance.json#baseline_commit, or the root commit
//   diff baseline..HEAD with --numstat -M -C -w --ignore-blank-lines, excluding
//   lockfiles + build artifacts. Whitespace-only edits and renames are absorbed
//   into "template" rather than counted as customization.
//
//   for each tracked file at HEAD:
//     unchanged file        -> all current lines counted as template
//     modified file         -> (orig_loc - removed) template + added custom
//     renamed file          -> same modified-file math against the OLD path's blob
//     newly added file      -> all added lines counted as custom
//   for each file that existed at baseline but not at HEAD (and isn't the
//   source side of a rename):
//     deleted               -> orig_loc counted as template_removed (churn only)
//
//   template_pct = template_unchanged / (template_unchanged + custom_added)
//   custom_pct   = custom_added       / (template_unchanged + custom_added)
//
// Optional Claude-judged semantic score (opt-in per repo):
//   When ANTHROPIC_API_KEY is present, each modified/added file's unified diff
//   is sent to Claude with a structured-output tool. Claude classifies each
//   added/removed line as "substantive" (logic/behavior) or "cosmetic"
//   (formatting/rename/comment). The semantic percentage discounts cosmetic
//   adds. Failures (rate limit, malformed response, missing key, oversize
//   diff) leave the semantic fields null without breaking the deterministic
//   path.
//
// Configuration via .template-provenance.json (all optional):
//   baseline_commit  — SHA to diff against. Defaults to root commit.
//   extra_excludes   — array of git pathspecs to exclude on top of defaults.
//                      e.g. [":!generated/**", ":!vendor/grpc/**"]
//
// Environment (semantic path):
//   ANTHROPIC_API_KEY        — if absent, semantic path is skipped silently.
//   SEMANTIC_MODEL           — defaults to claude-haiku-4-5-20251001.
//   SEMANTIC_MAX_DIFF_LINES  — defaults to 10000; skip semantic above this.

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
  // -z: NUL-delimited output so renames don't collide with paths containing tabs
  // -M -C: rename and copy detection (default 50% similarity threshold)
  // -w + --ignore-blank-lines: drop whitespace-only and blank-line-only edits
  // --diff-algorithm=histogram: better at recognizing moved blocks; fewer false
  //   "everything shifted" positives than the default Myers algorithm
  const raw = execFileSync(
    'git',
    [
      'diff', '--numstat', '-z',
      '-M', '-C',
      '-w', '--ignore-blank-lines',
      '--diff-algorithm=histogram',
      baselineSha, 'HEAD', '--', '.', ...excludes,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const records = raw.split('\0');
  const map = new Map();
  // -z output shape:
  //   normal file:  one record = "added\tremoved\tpath"
  //   rename/copy:  three records = "added\tremoved\t", then oldPath, then newPath
  for (let i = 0; i < records.length; ) {
    const rec = records[i];
    if (!rec) { i++; continue; }
    const firstTab = rec.indexOf('\t');
    const secondTab = rec.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) { i++; continue; }
    const a = rec.slice(0, firstTab);
    const r = rec.slice(firstTab + 1, secondTab);
    const trailing = rec.slice(secondTab + 1);
    const binary = a === '-' || r === '-';
    if (trailing === '') {
      // Rename or copy: next two records are oldPath, newPath
      const oldPath = records[i + 1];
      const newPath = records[i + 2];
      if (!binary && newPath) {
        map.set(newPath, { added: parseInt(a, 10), removed: parseInt(r, 10), oldPath });
      }
      i += 3;
    } else {
      if (!binary) {
        map.set(trailing, { added: parseInt(a, 10), removed: parseInt(r, 10) });
      }
      i += 1;
    }
  }
  return map;
}

const SEMANTIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const SEMANTIC_DEFAULT_MAX_DIFF_LINES = 10000;
const SEMANTIC_PER_FILE_LINE_CAP = 2000;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function runSemantic({ perFile, baselineSha, headSha, currentTotalLoc, customAddedLoc }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.SEMANTIC_MODEL || SEMANTIC_DEFAULT_MODEL;
  const maxDiffLines = parseInt(process.env.SEMANTIC_MAX_DIFF_LINES || '', 10) || SEMANTIC_DEFAULT_MAX_DIFF_LINES;

  const nullResult = (skipped_reason) => ({
    enabled: false,
    model: null,
    skipped_reason,
    files_classified: 0,
    diff_lines_sent: 0,
    semantic_custom_added_loc: null,
    template_pct_semantic: null,
    custom_pct_semantic: null,
  });

  if (!apiKey) return nullResult('no_api_key');

  const totalChangedLines = perFile.reduce(
    (s, f) => s + (f.template_modified || 0) + (f.custom_added || 0),
    0,
  );
  if (totalChangedLines > maxDiffLines) {
    return {
      ...nullResult(`diff_exceeds_max (${totalChangedLines} > ${maxDiffLines})`),
      enabled: true,
      model,
    };
  }
  if (totalChangedLines === 0) {
    return {
      enabled: true,
      model,
      skipped_reason: null,
      files_classified: 0,
      diff_lines_sent: 0,
      semantic_custom_added_loc: 0,
      template_pct_semantic: 100,
      custom_pct_semantic: 0,
    };
  }

  let substantiveAdded = 0;
  let filesClassified = 0;
  let diffLinesSent = 0;

  for (const f of perFile) {
    if (f.status !== 'modified' && f.status !== 'added' && f.status !== 'renamed') continue;
    if ((f.custom_added || 0) === 0 && (f.template_modified || 0) === 0) continue;

    let unifiedDiff;
    try {
      unifiedDiff = execFileSync(
        'git',
        [
          'diff', '--unified=3',
          '-w', '--ignore-blank-lines',
          '--diff-algorithm=histogram',
          baselineSha, headSha, '--', f.path,
        ],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      );
    } catch {
      continue;
    }
    if (!unifiedDiff || !unifiedDiff.trim()) continue;

    const chunks = chunkDiff(unifiedDiff, SEMANTIC_PER_FILE_LINE_CAP);
    let fileFailed = false;
    for (const chunk of chunks) {
      const verdict = await classifyDiff(chunk, f.path, { apiKey, model });
      if (!verdict) {
        fileFailed = true;
        break;
      }
      substantiveAdded += verdict.substantive_added || 0;
      diffLinesSent += chunk.split('\n').length;
    }
    if (fileFailed) {
      return {
        ...nullResult('api_error'),
        enabled: true,
        model,
      };
    }
    filesClassified++;
  }

  // Semantic accounting: any "added" line Claude labeled cosmetic is reabsorbed
  // into template. We clamp because Claude's counts can drift slightly from the
  // raw line count on edge cases (trailing blank lines, hunk-edge context).
  const semanticCustom = Math.min(Math.max(substantiveAdded, 0), customAddedLoc);
  const semanticTemplateLoc = currentTotalLoc - semanticCustom;
  const denom = semanticTemplateLoc + semanticCustom;
  const templatePctSemantic = denom === 0 ? 0 : (semanticTemplateLoc / denom) * 100;
  const customPctSemantic = denom === 0 ? 0 : (semanticCustom / denom) * 100;

  return {
    enabled: true,
    model,
    skipped_reason: null,
    files_classified: filesClassified,
    diff_lines_sent: diffLinesSent,
    semantic_custom_added_loc: semanticCustom,
    template_pct_semantic: +templatePctSemantic.toFixed(2),
    custom_pct_semantic: +customPctSemantic.toFixed(2),
  };
}

async function classifyDiff(unifiedDiff, path, { apiKey, model }) {
  const body = {
    model,
    max_tokens: 512,
    temperature: 0,
    tools: [
      {
        name: 'report_diff_classification',
        description:
          'Report counts of substantive vs cosmetic + / - lines in the diff. ' +
          'Substantive = real logic/behavior change (new code, control flow, API changes, business logic). ' +
          'Cosmetic = formatting, whitespace, identifier rename, comment edit, import reordering, file moves.',
        input_schema: {
          type: 'object',
          properties: {
            substantive_added: { type: 'integer', minimum: 0 },
            substantive_removed: { type: 'integer', minimum: 0 },
            cosmetic_added: { type: 'integer', minimum: 0 },
            cosmetic_removed: { type: 'integer', minimum: 0 },
            reasoning: { type: 'string' },
          },
          required: [
            'substantive_added',
            'substantive_removed',
            'cosmetic_added',
            'cosmetic_removed',
            'reasoning',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_diff_classification' },
    messages: [
      {
        role: 'user',
        content:
          `Classify each '+' and '-' line in this unified diff of file ${path}. ` +
          `Count substantive (logic/behavior) and cosmetic (formatting, renames, comments, import order) lines separately. ` +
          `Return your counts via the report_diff_classification tool.\n\n` +
          '```diff\n' + unifiedDiff + '\n```',
      },
    ],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const data = await res.json();
      const toolUse = Array.isArray(data?.content)
        ? data.content.find(c => c?.type === 'tool_use')
        : null;
      if (!toolUse?.input) return null;
      return toolUse.input;
    } catch {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function chunkDiff(unifiedDiff, maxLines) {
  const lines = unifiedDiff.split('\n');
  if (lines.length <= maxLines) return [unifiedDiff];
  const headerLines = [];
  const bodyLines = [];
  let inBody = false;
  for (const line of lines) {
    if (!inBody && (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ') ||
        line.startsWith('similarity index') || line.startsWith('rename from') ||
        line.startsWith('rename to') || line.startsWith('new file mode') ||
        line.startsWith('deleted file mode'))) {
      headerLines.push(line);
      continue;
    }
    inBody = true;
    bodyLines.push(line);
  }
  // Split body on hunk headers (@@ ...) so each chunk is whole-hunk-aligned.
  const chunks = [];
  let buf = [];
  for (const line of bodyLines) {
    if (line.startsWith('@@') && buf.length >= maxLines) {
      chunks.push([...headerLines, ...buf].join('\n'));
      buf = [];
    }
    buf.push(line);
  }
  if (buf.length) chunks.push([...headerLines, ...buf].join('\n'));
  return chunks.length ? chunks : [unifiedDiff];
}

async function main() {
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

  const renameOldPaths = new Set();
  for (const entry of diff.values()) {
    if (entry.oldPath) renameOldPaths.add(entry.oldPath);
  }

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
    // Rename: read baseline LOC from the OLD path, then apply modified-file math.
    // For a pure rename (added=0, removed=0) this gives unchanged=origLoc.
    if (d.oldPath) {
      const origLoc = countLines(blobAtRef(baselineSha, d.oldPath) ?? '');
      const removed = Math.min(d.removed, origLoc);
      const unchanged = Math.max(0, origLoc - removed);
      templateUnchangedLoc += unchanged;
      templateModifiedLoc += removed;
      customAddedLoc += d.added;
      perFile.push({ path, status: 'renamed', old_path: d.oldPath, template_unchanged: unchanged, template_modified: removed, custom_added: d.added });
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
    if (headSet.has(path) || renameOldPaths.has(path)) continue;
    const origLoc = countLines(blobAtRef(baselineSha, path) ?? '');
    if (!origLoc) continue;
    templateRemovedLoc += origLoc;
    perFile.push({ path, status: 'deleted', template_unchanged: 0, template_modified: origLoc, custom_added: 0 });
  }

  const denom = templateUnchangedLoc + customAddedLoc;
  const templatePct = denom === 0 ? 0 : (templateUnchangedLoc / denom) * 100;
  const customPct = denom === 0 ? 0 : (customAddedLoc / denom) * 100;
  const currentTotalLoc = templateUnchangedLoc + customAddedLoc;

  const semantic = await runSemantic({
    perFile,
    baselineSha,
    headSha,
    currentTotalLoc,
    customAddedLoc,
  });

  const out = {
    schema_version: 2,
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
      current_total_loc: currentTotalLoc,
      semantic_custom_added_loc: semantic.semantic_custom_added_loc,
    },
    percentages: {
      template_pct: +templatePct.toFixed(2),
      custom_pct: +customPct.toFixed(2),
      template_pct_semantic: semantic.template_pct_semantic,
      custom_pct_semantic: semantic.custom_pct_semantic,
    },
    semantic: {
      enabled: semantic.enabled,
      model: semantic.model,
      skipped_reason: semantic.skipped_reason,
      files_classified: semantic.files_classified,
      diff_lines_sent: semantic.diff_lines_sent,
    },
    per_file: perFile,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`template-metrics: ${err?.stack ?? err}\n`);
  process.exit(1);
});
