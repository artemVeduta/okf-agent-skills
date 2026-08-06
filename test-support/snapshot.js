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

function repository(t, prefix = 'okf-test-repo-') {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function bundle(root, relative = '.', index = '---\nokf_version: "0.2"\n---\n# Bundle\n') {
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'index.md'), index);
  fs.writeFileSync(path.join(root, '.okf-active'), '');
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

function adapterManifest(harness) {
  return JSON.parse(fs.readFileSync(path.join(repo, 'adapters', harness, 'manifest.json'), 'utf8'));
}

function runAdapterCli(args) {
  const result = childProcess.spawnSync(process.execPath, [path.join(repo, 'scripts', 'okf-adapter.js'), ...args], { encoding: 'utf8' });
  assert.equal(result.stdout.endsWith('\n'), true);
  assert.equal(result.stdout.split('\n').length, 2);
  return { status: result.status, stderr: result.stderr, response: JSON.parse(result.stdout) };
}

module.exports = {
  REQUIRED_BRIEF_FIELDS,
  RESPONSE_KEYS,
  adapterManifest,
  assertEnvelope,
  bundle,
  repository,
  runAdapterCli,
  runSilent,
  runWrapper,
  snapshot,
  spawnWrapper,
  temporaryRoot,
  treeHash,
};
