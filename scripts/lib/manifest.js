/*
 * PROVISIONAL (spec section 11 open item): manifest grammar, path bases,
 * workspace_id replacement, workspace selection, alias characters, health
 * vocabulary, trust storage, revision enforcement, and INVALID gate assignment
 * are invented here only where the normative rules require behavior. Revision
 * is parsed and ignored. INVALID is emitted only for malformed data. Finding
 * reason strings are provisional and stable for fixture assertions.
 */

const path = require('node:path');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const repositoryKeys = new Set(['name', 'path', 'remote', 'aliases', 'local', 'revision']);
const bundleKeys = new Set(['alias', 'owner', 'root', 'okf_version', 'project_mode']);
const rootKeys = new Set(['schema_version', 'workspace_id', 'repositories', 'bundles', 'settings']);

// The suite's current per-bundle format target (#197). `manifest.template()` stamps
// every bundle it generates with this constant, the same value `partition.js` and
// `monorepo.js` already hardcode for the worker-brief `okf_version` field.
const OKF_VERSION = '0.2';

// #200: one built-in default per setting, one optional `.okf-workspace.json`
// override, no other precedence layer.
const DEFAULT_SETTINGS = { max_words_per_file: 1000 };
const settingKeys = new Set(Object.keys(DEFAULT_SETTINGS));

function invalid(reason) {
  return { code: 'INVALID', origin: 'suite', severity: 'error', blocks: true, detail: { gate: 'data validity', reason } };
}

function settingFinding(reason, key) {
  return { code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false, detail: { gate: 'settings', reason, key } };
}

// Resolves `raw.settings` (already known to be an object or absent -- `validate()`
// rejects any other shape as `invalid_field_combination` before this runs) against
// the built-in defaults. An unknown key or an out-of-range value never blocks: it
// reports one finding and the built-in default stays effective for that key (#200).
function resolveSettings(settings) {
  const effective = { ...DEFAULT_SETTINGS };
  const findings = [];
  if (!settings) return { effective, findings };
  for (const key of Object.keys(settings)) {
    if (!settingKeys.has(key)) findings.push(settingFinding('unknown_setting_key', key));
  }
  if (Object.hasOwn(settings, 'max_words_per_file')) {
    const value = settings.max_words_per_file;
    if (Number.isInteger(value) && value > 0) effective.max_words_per_file = value;
    else findings.push(settingFinding('invalid_setting_value', 'max_words_per_file'));
  }
  return { effective, findings };
}

// null when the value is a usable relative path, otherwise the reason it is not.
function relativePathReason(value) {
  if (typeof value !== 'string' || value === '') return 'missing_path';
  if (path.isAbsolute(value)) return 'absolute_path';
  if (value.split(/[\\/]/).includes('..')) return 'parent_segment';
  return null;
}

function unknown(value, allowed) {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('invalid_field_combination');
  if (unknown(raw, rootKeys)) return invalid('unknown_key');
  if (raw.schema_version !== 1) return invalid('unsupported_schema_version');
  if (typeof raw.workspace_id !== 'string' || !uuid.test(raw.workspace_id)) return invalid('invalid_field_combination');
  if (!Array.isArray(raw.repositories) || !Array.isArray(raw.bundles)) return invalid('invalid_field_combination');
  if (raw.settings !== undefined && (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings))) return invalid('invalid_field_combination');

  const names = new Set();
  const paths = new Set();
  for (const repo of raw.repositories) {
    if (!repo || typeof repo !== 'object' || Array.isArray(repo) || unknown(repo, repositoryKeys)) return invalid('unknown_key');
    if (typeof repo.name !== 'string' || repo.name === '' || names.has(repo.name)) return invalid('duplicate_repository_name');
    const pathReason = paths.has(repo.path) ? 'duplicate_repository_path' : relativePathReason(repo.path);
    if (pathReason) return invalid(pathReason);
    const remote = typeof repo.remote === 'string' && repo.remote !== '';
    const local = repo.local === true;
    if (remote === local) return invalid('malformed_identity');
    if (repo.aliases !== undefined && (!remote || !Array.isArray(repo.aliases) || repo.aliases.some((x) => typeof x !== 'string'))) return invalid('invalid_field_combination');
    if (repo.local !== undefined && typeof repo.local !== 'boolean') return invalid('invalid_field_combination');
    if (repo.revision !== undefined && typeof repo.revision !== 'string') return invalid('invalid_field_combination');
    names.add(repo.name); paths.add(repo.path);
  }

  const aliases = new Set();
  for (const bundle of raw.bundles) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || unknown(bundle, bundleKeys)) return invalid('unknown_key');
    if (typeof bundle.alias !== 'string' || bundle.alias === '' || aliases.has(bundle.alias)) return invalid('duplicate_bundle_alias');
    const rootReason = relativePathReason(bundle.root);
    if (rootReason) return invalid(rootReason);
    // Structural presence and non-emptiness only: `okf_version`/`project_mode` are
    // the format and authority-model target, not an admission decision, and the
    // manifest grants no trust or write authority (#196). Neither is enum-checked
    // here -- the runtime's existing read tolerance for an unsupported format or
    // project mode, and the write gate that requires a recognized one, both stay
    // untouched. `project_mode` is always one of the two named values or another
    // non-empty string; #196 defines it as a required, always-present, two-valued
    // field, so `null` (a silent third "undecided" state, not itself a value #196
    // names) is not accepted -- every `template()` caller must supply a real one.
    if (typeof bundle.okf_version !== 'string' || bundle.okf_version === '') return invalid('invalid_field_combination');
    if (typeof bundle.project_mode !== 'string' || bundle.project_mode === '') return invalid('invalid_field_combination');
    if (bundle.owner !== null && (typeof bundle.owner !== 'string' || !names.has(bundle.owner))) return invalid('invalid_field_combination');
    aliases.add(bundle.alias);
  }
  return null;
}

function read(file, services) {
  let raw;
  try { raw = JSON.parse(services.readFile(file)); } catch { return { finding: invalid('invalid_json') }; }
  const finding = validate(raw);
  return finding ? { finding } : { manifest: raw, root: path.dirname(file), path: file };
}

function discover(cwd, gitRoot, services) {
  const ceiling = gitRoot || cwd;
  let current = cwd;
  while (true) {
    const file = path.join(current, '.okf-workspace.json');
    if (services.exists(file)) return file;
    if (current === ceiling || current === path.dirname(current)) return null;
    current = path.dirname(current);
  }
}

function select(payload, context, services) {
  const file = payload.manifest_path ? path.resolve(payload.manifest_path) : discover(context.cwd, context.gitRoot, services);
  if (!file) return { manifest: null, root: null, path: null, finding: null };
  return read(file, services);
}

// A `monorepo` hint, never a decision (#133/#138): either the manifest itself
// already declares more than one repository or bundle, or the Git root carries
// `.gitmodules`. `/setup`'s procedure is the one place that acts on the hint —
// it warns and asks the user to choose a template, it never guesses for them.
function monorepoSignal(gitRoot, raw, services) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray(raw.repositories) && raw.repositories.length > 1) return true;
    if (Array.isArray(raw.bundles) && raw.bundles.length > 1) return true;
  }
  return services.exists(path.join(gitRoot, '.gitmodules'));
}

// `/setup`'s deterministic three-state report for `.okf-workspace.json`: `missing`,
// `ok`, or `invalid` carrying the validator's own reason. An invalid file's own
// `workspace_id` is surfaced as `salvage` when it is at least a well-formed UUIDv4,
// so a regenerated manifest can keep workspace identity instead of minting a new one
// — `/setup`'s procedure decides whether to use it, this function only reports it.
// An `ok` manifest also carries the resolved `settings` (#200): the effective value
// for every supported setting, and one finding per unknown key or invalid override.
// This reports the resolution; using the effective value to change setup or
// proposal-first behavior is exposure, left to the task that owns it.
function inspect(file, gitRoot, services) {
  if (!services.exists(file)) {
    return { state: 'missing', monorepo: services.exists(path.join(gitRoot, '.gitmodules')) };
  }
  let raw;
  try {
    raw = JSON.parse(services.readFile(file));
  } catch {
    return { state: 'invalid', reason: 'invalid_json', salvage: null, monorepo: monorepoSignal(gitRoot, null, services) };
  }
  const finding = validate(raw);
  const monorepo = monorepoSignal(gitRoot, raw, services);
  if (finding) {
    const salvage = raw && typeof raw === 'object' && !Array.isArray(raw) &&
      typeof raw.workspace_id === 'string' && uuid.test(raw.workspace_id) ? { workspace_id: raw.workspace_id } : null;
    return { state: 'invalid', reason: finding.detail.reason, salvage, monorepo };
  }
  const resolved = resolveSettings(raw.settings);
  return { state: 'ok', monorepo, settings: resolved.effective, settingsFindings: resolved.findings };
}

// The single-bundle template named by #133's resolution: one repository — the
// workspace root itself — owning one source bundle. Always run back through
// `validate()` by the caller before it is written; this builder does not
// special-case its own output.
//
// #135 open point 6: the multi-package form, chosen with `packages` (the shape
// `scripts/lib/monorepo.js`'s `detect()` returns). A package with its own Git
// repository (a submodule, `separateRepo: true`) gets its own repository entry
// and owns its bundle directly; a package sharing the workspace repository is
// owned by the root repository at its package-relative bundle path. Every bundle
// is required and `source` by construction now (#197: those fields are gone from
// the grammar). `projectMode` is the caller's own already-validated
// `code-backed`/`knowledge-only` decision (`setup.js`'s `repair`/`aggregate`
// validate `payload.project_mode` the same way `init`/`plan` already do, before
// reaching here) -- every generated bundle in one call shares it, the same way
// `monorepo.buildBriefs()` already applies one `project_mode` to every package
// brief. This builder never invents a value: an omitted `projectMode` becomes
// `undefined` here, which fails `validate()`'s required-field check the same as
// any other missing required field, exactly as intended. The workspace still
// declares every detected package as an intended bundle, so a package whose
// worker did not yet produce one is `degraded`, not silently absent, through the
// same federation health check every other required-but-inactive bundle gets.
function template({ repoName, bundleAlias, workspaceId, packages, bundleName, projectMode }) {
  if (!packages) {
    return {
      schema_version: 1,
      workspace_id: workspaceId,
      repositories: [{ name: repoName, path: '.', local: true }],
      bundles: [{ alias: bundleAlias, owner: repoName, root: bundleAlias, okf_version: OKF_VERSION, project_mode: projectMode }],
    };
  }
  const directory = bundleName || 'okf';
  const repositories = [{ name: repoName, path: '.', local: true }];
  const seenRepositories = new Set([repoName]);
  const bundles = [];
  for (const pkg of packages) {
    if (pkg.separateRepo) {
      if (!seenRepositories.has(pkg.alias)) {
        repositories.push({ name: pkg.alias, path: pkg.path, local: true });
        seenRepositories.add(pkg.alias);
      }
      bundles.push({ alias: pkg.alias, owner: pkg.alias, root: directory, okf_version: OKF_VERSION, project_mode: projectMode });
    } else {
      bundles.push({ alias: pkg.alias, owner: repoName, root: `${pkg.path}/${directory}`, okf_version: OKF_VERSION, project_mode: projectMode });
    }
  }
  return { schema_version: 1, workspace_id: workspaceId, repositories, bundles };
}

module.exports = { select, inspect, template, validate };
