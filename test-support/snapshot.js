/* Shared fixture, process, and snapshot helpers live outside test/ so the
 * test runner does not discover this module as a test file. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const RESPONSE_KEYS = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];
const REQUIRED_BRIEF_FIELDS = [
  'role', 'task_kind', 'operation_class', 'cwd', 'bundle', 'paths',
  'allowed_effects', 'forbidden_effects', 'evidence', 'required_checks',
  'settings', 'expected_result',
];

function snapshot(root) {
  const entries = [];
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      const file = path.join(directory, entry.name);
      entries.push([name, entry.isDirectory() ? 'directory' : 'file', entry.isFile() ? fs.readFileSync(file, 'utf8') : '']);
      if (entry.isDirectory()) visit(file, name);
    }
  }
  visit(root);
  return entries;
}

// #174: one write-evidence observation binding, `{ path, sha256 }`, built from the
// file's current bytes. `relative` is relative to the active Git worktree, the same
// way the runtime resolves it.
function binding(worktree, relative) {
  const bytes = fs.readFileSync(path.resolve(worktree, relative));
  return { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function treeHash(root) {
  const hash = crypto.createHash('sha256');
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const name = path.join(relative, entry.name);
      hash.update(`${name}\0`);
      if (entry.isSymbolicLink()) {
        hash.update('link\0');
        hash.update(fs.readlinkSync(file));
      } else if (entry.isDirectory()) {
        hash.update('directory\0');
        visit(file, name);
      } else if (entry.isFile()) {
        hash.update('file\0');
        hash.update(fs.readFileSync(file));
      } else {
        hash.update('other\0');
      }
    }
  }
  visit(root);
  return hash.digest('hex');
}

function temporaryRoot(t, prefix = 'okf-test-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// #197: a fixed, valid `workspace_id` reused across fixtures that don't care
// about a specific value -- the same constant `issue-47`/`issue-50`'s own
// manifest fixtures already use.
const TEST_WORKSPACE_ID = '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

// #197: One default single-bundle declaration, the `root` matching whatever
// relative path the caller's bundle actually lives at. Overwrites any manifest
// already at `root` -- callers that need a richer (multi-bundle/federated)
// manifest write their own afterward.
function writeManifest(root, relative) {
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: TEST_WORKSPACE_ID,
    repositories: [{ name: 'repo', path: '.', local: true }],
    bundles: [{ alias: 'repo', owner: 'repo', root: relative, okf_version: '0.2', project_mode: 'knowledge-only' }],
  }));
}

function repository(t, prefix = 'okf-test-repo-') {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  return root;
}

function bundle(root, relative = '.', index = '---\nokf_version: "0.2"\n---\n# Bundle\n') {
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'index.md'), index);
  writeManifest(root, relative);
  return target;
}

function spawnWrapper(wrapper, value, options = {}) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    ...options,
  });
  return { ...result, response: result.stdout ? JSON.parse(result.stdout) : undefined };
}

function assertEnvelope(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const response = result.response || JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(response), RESPONSE_KEYS);
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

function runWrapper(wrapper, value, options) {
  return assertEnvelope(spawnWrapper(wrapper, value, options));
}

function runSilent(wrapper, value, options) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
}

const manifests = {
  'claude-code': path.join(repo, 'manifest.json'),
  codex: path.join(repo, 'packages', 'codex', 'manifest.json'),
  opencode: path.join(repo, 'packages', 'opencode', 'manifest.json'),
};

function adapterManifest(harness) {
  return JSON.parse(fs.readFileSync(manifests[harness], 'utf8'));
}

module.exports = {
  REQUIRED_BRIEF_FIELDS,
  RESPONSE_KEYS,
  TEST_WORKSPACE_ID,
  adapterManifest,
  assertEnvelope,
  binding,
  bundle,
  repository,
  runSilent,
  runWrapper,
  snapshot,
  writeManifest,
  spawnWrapper,
  temporaryRoot,
  treeHash,
};
