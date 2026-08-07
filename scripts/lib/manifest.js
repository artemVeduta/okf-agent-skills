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
const bundleKeys = new Set(['alias', 'owner', 'root', 'required', 'mode']);
const rootKeys = new Set(['schema_version', 'workspace_id', 'repositories', 'bundles']);

function invalid(reason) {
  return { code: 'INVALID', origin: 'suite', severity: 'error', blocks: true, detail: { gate: 'data validity', reason } };
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
    if (typeof bundle.required !== 'boolean' || !['source', 'generated', 'vendored'].includes(bundle.mode)) return invalid('invalid_field_combination');
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
  return { state: 'ok', monorepo };
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
// is `required: true` and `mode: "source"` — the workspace declares every
// detected package as an intended bundle, so a package whose worker did not yet
// produce one is `degraded`, not silently absent, through the same federation
// health check every other required-but-inactive bundle already gets.
function template({ repoName, bundleAlias, workspaceId, packages, bundleName }) {
  if (!packages) {
    return {
      schema_version: 1,
      workspace_id: workspaceId,
      repositories: [{ name: repoName, path: '.', local: true }],
      bundles: [{ alias: bundleAlias, owner: repoName, root: bundleAlias, required: true, mode: 'source' }],
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
      bundles.push({ alias: pkg.alias, owner: pkg.alias, root: directory, required: true, mode: 'source' });
    } else {
      bundles.push({ alias: pkg.alias, owner: repoName, root: `${pkg.path}/${directory}`, required: true, mode: 'source' });
    }
  }
  return { schema_version: 1, workspace_id: workspaceId, repositories, bundles };
}

module.exports = { select, inspect, template, validate };
