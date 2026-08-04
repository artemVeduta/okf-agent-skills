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

function relative(value) {
  return typeof value === 'string' && value !== '' && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
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
    if (!relative(repo.path) || paths.has(repo.path)) return invalid(paths.has(repo.path) ? 'duplicate_repository_path' : (repo.path && path.isAbsolute(repo.path) ? 'absolute_path' : 'parent_segment'));
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
    if (!relative(bundle.root)) return invalid(bundle.root && path.isAbsolute(bundle.root) ? 'absolute_path' : 'parent_segment');
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

module.exports = { select };
