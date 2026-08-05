const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshot } = require('../test-support/snapshot');

const readWrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');
const responseKeys = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];
const orientationDataKeys = ['activation', 'bundle', 'root_index_path', 'workspace_health', 'occurrence_key'];
const emptyBundleFields = { bundle: null, root_index_path: null, workspace_health: null };

function assertDataKeys(response) {
  assert.deepEqual(Object.keys(response.data), orientationDataKeys);
}

function repository(t, prefix = 'okf-66-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

function activate(root) {
  fs.writeFileSync(path.join(root, '.okf-active'), '');
}

function withIndex(root) {
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  return root;
}

function orientRequest(root, overrides = {}, skill = 'okf-read') {
  return {
    protocol: 'okf-wrapper/1',
    skill,
    operation: 'orient',
    payload: {
      cwd: root,
      harness: 'claude-code',
      context_id: 'ctx-1',
      logical_cause: 'startup',
      ...overrides,
    },
  };
}

function run(wrapper, request) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(request), encoding: 'utf8',
  });
  return result;
}

function runOk(wrapper, request) {
  const result = run(wrapper, request);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const response = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(response), responseKeys);
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

function runSilent(wrapper, request) {
  const result = run(wrapper, request);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
}

test('orient reports not-configured when the activation marker is absent', (t) => {
  const root = repository(t);
  withIndex(root);
  const before = snapshot(root);

  const response = runOk(readWrapper, orientRequest(root));

  assert.equal(response.result, 'not-configured');
  assertDataKeys(response);
  assert.equal(response.data.activation, 'absent');
  assert.deepEqual({ bundle: response.data.bundle, root_index_path: response.data.root_index_path, workspace_health: response.data.workspace_health }, emptyBundleFields);
  assert.equal(typeof response.data.occurrence_key, 'string');
  assert.ok(response.data.occurrence_key.length > 0);
  assert.ok(response.findings.length > 0);
  assert.deepEqual(snapshot(root), before);
});

test('orient reports invalid when the activation marker is malformed', (t) => {
  const root = repository(t);
  withIndex(root);
  fs.writeFileSync(path.join(root, '.okf-active'), 'not empty');
  const before = snapshot(root);

  const response = runOk(readWrapper, orientRequest(root));

  assert.equal(response.result, 'invalid');
  assertDataKeys(response);
  assert.equal(response.data.activation, 'invalid');
  assert.deepEqual({ bundle: response.data.bundle, root_index_path: response.data.root_index_path, workspace_health: response.data.workspace_health }, emptyBundleFields);
  assert.equal(typeof response.data.occurrence_key, 'string');
  assert.deepEqual(snapshot(root), before);
});

test('orient reports invalid for an unknown harness, a suite_version mismatch, and malformed claimed', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);
  const before = snapshot(root);

  const unknownHarness = runOk(readWrapper, orientRequest(root, { harness: 'unknown-harness' }));
  assert.equal(unknownHarness.result, 'invalid');
  assert.equal(unknownHarness.data.activation, 'active');
  assert.equal(unknownHarness.data.occurrence_key, null);

  const mismatch = runOk(readWrapper, orientRequest(root, { suite_version: '9.9.9' }));
  assert.equal(mismatch.result, 'invalid');
  assert.equal(typeof mismatch.data.occurrence_key, 'string');

  const malformedClaimed = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: 'x' }] }));
  assert.equal(malformedClaimed.result, 'invalid');

  assert.deepEqual(snapshot(root), before);
});

test('orient reaches clean when activation, admission, and the root index all pass', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);
  const before = snapshot(root);

  const response = runOk(readWrapper, orientRequest(root));

  assert.equal(response.result, 'clean');
  assertDataKeys(response);
  assert.equal(response.data.activation, 'active');
  assert.deepEqual(response.data.bundle, { bundle_alias: '.', bundle_root: root });
  assert.equal(response.data.root_index_path, 'index.md');
  assert.equal(response.data.workspace_health, 'healthy');
  assert.equal(typeof response.data.occurrence_key, 'string');
  assert.deepEqual(response.findings, []);
  assert.equal(response.next_action, 'Read the root index to begin navigation.');
  assert.deepEqual(snapshot(root), before);
});

test('orient reports unavailable when the root index cannot be read', (t) => {
  const root = repository(t);
  activate(root);
  const before = snapshot(root);

  const response = runOk(readWrapper, orientRequest(root));

  assert.equal(response.result, 'unavailable');
  assertDataKeys(response);
  assert.equal(response.data.activation, 'active');
  assert.deepEqual({ bundle: response.data.bundle, root_index_path: response.data.root_index_path, workspace_health: response.data.workspace_health }, emptyBundleFields);
  assert.ok(response.findings.some((finding) => finding.detail.gate === 'orientation'));
  assert.deepEqual(snapshot(root), before);
});

test('orient reports degraded for a seam unsupported by the harness', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  const response = runOk(readWrapper, orientRequest(root, { harness: 'codex', logical_cause: 'fork' }));

  assert.equal(response.result, 'degraded');
  assertDataKeys(response);
  assert.deepEqual({ bundle: response.data.bundle, root_index_path: response.data.root_index_path, workspace_health: response.data.workspace_health }, emptyBundleFields);
});

test('orient emits nothing for a silent lifecycle cause', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  runSilent(readWrapper, orientRequest(root, { logical_cause: 'session-end' }));
  runSilent(readWrapper, orientRequest(root, { harness: 'opencode', logical_cause: 'session-created' }));
});

test('a duplicate native signal emits no second orientation, and a failed claim is reported but never replayed', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  const first = runOk(readWrapper, orientRequest(root));
  const key = first.data.occurrence_key;

  runSilent(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'delivered' }] }));

  const failedClaim = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'failed' }] }));
  assert.equal(failedClaim.result, 'failed');
  assertDataKeys(failedClaim);
  assert.equal(failedClaim.data.occurrence_key, key);
  assert.deepEqual({ bundle: failedClaim.data.bundle, root_index_path: failedClaim.data.root_index_path, workspace_health: failedClaim.data.workspace_health }, emptyBundleFields);

  const unavailableClaim = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'unavailable' }] }));
  assert.equal(unavailableClaim.result, 'failed');
});

test('a forked child context is not suppressed and rechecks admission independently', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  const parent = runOk(readWrapper, orientRequest(root, { context_id: 'parent-ctx' }));
  const child = runOk(readWrapper, orientRequest(root, { context_id: 'child-ctx', logical_cause: 'fork' }));

  assert.equal(parent.result, 'clean');
  assert.equal(child.result, 'clean');
  assert.notEqual(parent.data.occurrence_key, child.data.occurrence_key);
});

test('the router dispatches orient to okf-read', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  const response = runOk(routerWrapper, orientRequest(root, {}, 'okf'));

  assert.equal(response.skill, 'okf');
  assert.equal(response.result, 'clean');
});

test('an absent marker under automatic invocation stays a silent no-op', (t) => {
  const root = repository(t);
  withIndex(root);

  runSilent(readWrapper, { ...orientRequest(root), invocation: 'automatic' });
});

test('the occurrence key does not collide when a context_id/logical_cause boundary shifts', (t) => {
  const root = repository(t);
  activate(root);
  withIndex(root);

  const a = runOk(readWrapper, orientRequest(root, { context_id: 'a', logical_cause: 'bstartup' }));
  const b = runOk(readWrapper, orientRequest(root, { context_id: 'ab', logical_cause: 'startup' }));

  assert.equal(typeof a.data.occurrence_key, 'string');
  assert.equal(typeof b.data.occurrence_key, 'string');
  assert.notEqual(a.data.occurrence_key, b.data.occurrence_key);
});

test('a degraded workspace is reported degraded, not masked by an unreadable root index, and workspace_health reuses admission vocabulary', (t) => {
  const root = repository(t);
  activate(root);
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    repositories: [{ name: 'app', path: '.', local: true }],
    bundles: [
      { alias: 'root', owner: 'app', root: '.', required: false, mode: 'source' },
      { alias: 'b', owner: 'app', root: 'b', required: true, mode: 'source' },
    ],
  }));
  const before = snapshot(root);

  const response = runOk(readWrapper, orientRequest(root));

  assert.equal(response.result, 'degraded');
  assertDataKeys(response);
  assert.equal(response.data.bundle, null);
  assert.equal(response.data.workspace_health, 'degraded');
  assert.deepEqual(snapshot(root), before);
});

test('orient rejects malformed wrapper input at the process boundary', (t) => {
  const root = repository(t);

  const missingHarness = run(readWrapper, { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', payload: { cwd: root, context_id: 'c', logical_cause: 'startup' } });
  assert.equal(missingHarness.status, 64);
  assert.notEqual(missingHarness.stderr.trim(), '');
});
