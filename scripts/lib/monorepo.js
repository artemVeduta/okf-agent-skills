/*
 * #135: monorepo package-boundary detection and sub-agent brief construction.
 *
 * Detection reads only evidence already on disk that a stdlib parser can handle
 * safely: `.gitmodules`, a root `package.json`'s `workspaces` field, a root
 * `pnpm-workspace.yaml`, a root `Cargo.toml`'s `[workspace]` table, and a root
 * `go.work`. Any of these that exists but cannot be resolved deterministically
 * (an unsupported glob, unparseable content, two signals that disagree) makes the
 * whole detection `ambiguous` — reported as a question for the user, never guessed.
 */

const path = require('node:path');
const { parseYAML } = require('./validation');

// ------------------------------------------------------------------ helpers

// null when the path is not usable (absolute, empty, or reaching above the root).
function normalizeRelative(value) {
  const cleaned = String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (cleaned === '' || cleaned.startsWith('/') || cleaned.split('/').includes('..')) return null;
  return cleaned;
}

function aliasFor(relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  return segments[segments.length - 1] || relativePath;
}

// A directory listing, not a general glob engine: a literal path resolves directly,
// and a pattern is accepted only in the single-wildcard `dir/*` shape, expanded by
// listing `dir`'s immediate subdirectories. Anything else (`**`, mid-segment `*`, a
// leading `!` exclusion) is refused rather than guessed at.
function resolveGlobs(name, gitRoot, entries, services) {
  const packages = [];
  for (const raw of entries) {
    if (typeof raw !== 'string' || raw === '') return { name, ok: false, reason: 'invalid_entry' };
    const rel = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!rel.includes('*')) {
      const normalized = normalizeRelative(rel);
      if (!normalized) return { name, ok: false, reason: `invalid_path:${raw}` };
      packages.push({ alias: aliasFor(normalized), path: normalized, separateRepo: false });
      continue;
    }
    if (!rel.endsWith('/*') || rel.slice(0, -2).includes('*')) {
      return { name, ok: false, reason: `unsupported_glob:${raw}` };
    }
    const dir = rel.slice(0, -2);
    const normalizedDir = normalizeRelative(dir);
    if (normalizedDir === null) return { name, ok: false, reason: `invalid_path:${raw}` };
    const dirPath = path.join(gitRoot, normalizedDir);
    if (!services.exists(dirPath)) continue;
    let entryNames;
    try {
      entryNames = services.readdir(dirPath);
    } catch {
      return { name, ok: false, reason: `unreadable_glob_directory:${raw}` };
    }
    for (const entryName of [...entryNames].sort()) {
      const full = path.join(dirPath, entryName);
      if (services.exists(full) && !services.isFile(full)) {
        const normalized = normalizeRelative(`${normalizedDir}/${entryName}`);
        if (normalized) packages.push({ alias: aliasFor(normalized), path: normalized, separateRepo: false });
      }
    }
  }
  return { name, ok: true, packages };
}

// -------------------------------------------------------------------- signals

function parseGitmodules(text) {
  const entries = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const section = line.match(/^\[submodule\s+"([^"]*)"\]$/);
    if (section) { current = { name: section[1] }; entries.push(current); continue; }
    const kv = line.match(/^(\S+)\s*=\s*(.*)$/);
    if (kv && current) current[kv[1]] = kv[2].trim();
  }
  return entries;
}

function gitmodulesSignal(gitRoot, services) {
  const file = path.join(gitRoot, '.gitmodules');
  if (!services.exists(file)) return null;
  const entries = parseGitmodules(services.readFile(file));
  if (entries.length === 0) return { name: 'gitmodules', ok: false, reason: 'no_submodules_declared' };
  const packages = [];
  for (const entry of entries) {
    const normalized = typeof entry.path === 'string' ? normalizeRelative(entry.path) : null;
    if (!normalized) return { name: 'gitmodules', ok: false, reason: 'invalid_submodule_path' };
    packages.push({ alias: aliasFor(normalized), path: normalized, separateRepo: true });
  }
  return { name: 'gitmodules', ok: true, packages };
}

function npmWorkspacesSignal(gitRoot, services) {
  const file = path.join(gitRoot, 'package.json');
  if (!services.exists(file)) return null;
  let pkg;
  try {
    pkg = JSON.parse(services.readFile(file));
  } catch {
    return { name: 'npm-workspaces', ok: false, reason: 'unparseable_package_json' };
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || pkg.workspaces === undefined) return null;
  const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces
    : (pkg.workspaces && typeof pkg.workspaces === 'object' && Array.isArray(pkg.workspaces.packages) ? pkg.workspaces.packages : null);
  if (globs === null) return { name: 'npm-workspaces', ok: false, reason: 'unsupported_workspaces_form' };
  return resolveGlobs('npm-workspaces', gitRoot, globs, services);
}

function pnpmWorkspaceSignal(gitRoot, services) {
  const file = path.join(gitRoot, 'pnpm-workspace.yaml');
  if (!services.exists(file)) return null;
  let parsed;
  try {
    parsed = parseYAML(services.readFile(file));
  } catch {
    return { name: 'pnpm-workspace', ok: false, reason: 'unparseable_pnpm_workspace' };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.packages)) {
    return { name: 'pnpm-workspace', ok: false, reason: 'missing_packages_field' };
  }
  return resolveGlobs('pnpm-workspace', gitRoot, parsed.packages, services);
}

// Only the narrow `[workspace]` + `members = ["a", "b"]` shape is read; workspace
// inheritance, `exclude`, or any other form is refused rather than guessed at.
function cargoWorkspaceSignal(gitRoot, services) {
  const file = path.join(gitRoot, 'Cargo.toml');
  if (!services.exists(file)) return null;
  const text = services.readFile(file);
  if (!/^\[workspace\]\s*$/m.test(text)) return null;
  const match = text.match(/^\s*members\s*=\s*\[([^\]]*)\]/m);
  if (!match) return { name: 'cargo-workspace', ok: false, reason: 'unsupported_members_form' };
  const members = [];
  for (const raw of match[1].split(',').map((s) => s.trim()).filter((s) => s !== '')) {
    const literal = raw.match(/^"([^"]*)"$/);
    if (!literal) return { name: 'cargo-workspace', ok: false, reason: 'unsupported_members_form' };
    members.push(literal[1]);
  }
  if (members.length === 0) return { name: 'cargo-workspace', ok: false, reason: 'unsupported_members_form' };
  return resolveGlobs('cargo-workspace', gitRoot, members, services);
}

function goWorkSignal(gitRoot, services) {
  const file = path.join(gitRoot, 'go.work');
  if (!services.exists(file)) return null;
  const text = services.readFile(file);
  const entries = [];
  const block = text.match(/use\s*\(([^)]*)\)/);
  let remainder = text;
  if (block) {
    for (const line of block[1].split('\n')) {
      const trimmed = line.trim();
      if (trimmed) entries.push(trimmed);
    }
    // The block itself is removed before scanning for single-line `use path`
    // directives, so the block's own opening `use (` line is never re-matched
    // as if it named a path of its own.
    remainder = text.slice(0, block.index) + text.slice(block.index + block[0].length);
  }
  for (const single of remainder.matchAll(/^use\s+(\S+)\s*$/gm)) entries.push(single[1]);
  if (entries.length === 0) return { name: 'go-work', ok: false, reason: 'no_use_directives' };
  return resolveGlobs('go-work', gitRoot, entries, services);
}

const detectors = [gitmodulesSignal, npmWorkspacesSignal, pnpmWorkspaceSignal, cargoWorkspaceSignal, goWorkSignal];

// The deterministic package-boundary rule (#135, open point 1): every present signal
// must resolve to a concrete package list, and every present signal that names the
// same path must agree on whether that path is its own repository. A signal that
// cannot be resolved, or two signals that disagree, makes the whole result
// `ambiguous` — this function never picks a winner on the caller's behalf.
function detect(gitRoot, services) {
  const signals = detectors.map((detector) => detector(gitRoot, services)).filter(Boolean);
  if (signals.length === 0) return { monorepo: false, ambiguous: false, packages: [], signals: [] };

  const names = signals.map((signal) => signal.name);
  const failed = signals.filter((signal) => !signal.ok);
  if (failed.length > 0) {
    return {
      monorepo: true, ambiguous: true, packages: [], signals: names,
      reason: failed.map((signal) => `${signal.name}:${signal.reason}`).join(', '),
    };
  }

  const merged = new Map();
  for (const signal of signals) {
    for (const pkg of signal.packages) {
      const existing = merged.get(pkg.path);
      if (existing && existing.separateRepo !== pkg.separateRepo) {
        return { monorepo: true, ambiguous: true, packages: [], signals: names, reason: `conflicting_signals:${pkg.path}` };
      }
      merged.set(pkg.path, pkg);
    }
  }
  const packages = [...merged.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (packages.length < 2) return { monorepo: false, ambiguous: false, packages, signals: names };
  return { monorepo: true, ambiguous: false, packages, signals: names };
}

// -------------------------------------------------------------- worker briefs

// Open point 2: the brief a package sub-agent receives is exactly this data shape —
// narrow, immutable, and built by the runtime rather than assembled ad hoc by
// agent-level procedure. `cwd`/`bundle` are already the pair a worker's own
// `okf-setup`/`okf-write` wrapper calls need: for a package with its own Git
// repository (a submodule), `cwd` is that repository's own root and `bundle` is
// just the bundle directory name; for a package sharing the workspace repository,
// `cwd` is the workspace root and `bundle` is the package-relative bundle path. The
// worker never receives more than this: no sibling package data, no corpus, no
// authoring prose duplicated from the contract, only its version tag.
function buildBrief(pkg, gitRoot, options) {
  const bundleName = options.bundleName || 'okf';
  const cwd = pkg.separateRepo ? path.join(gitRoot, pkg.path) : gitRoot;
  const bundle = pkg.separateRepo ? bundleName : `${pkg.path}/${bundleName}`;
  return {
    package: pkg.alias,
    package_root: pkg.path,
    cwd,
    bundle,
    project_mode: options.projectMode === undefined ? null : options.projectMode,
    mappings: options.mappings || [],
    okf_version: '0.2',
  };
}

function buildBriefs(packages, gitRoot, options) {
  return packages.map((pkg) => buildBrief(pkg, gitRoot, options));
}

module.exports = { detect, buildBriefs, normalizeRelative };
