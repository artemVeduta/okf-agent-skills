const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repository, runWrapper, spawnWrapper, temporaryRoot, treeHash } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const writeWrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function initRequest(root, payload = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'init',
    payload: { cwd: root, ...payload },
  };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function indexFile(root, bundle = 'okf') {
  return path.join(root, bundle, 'index.md');
}

test('happy path: init on a clean repository creates the bundle root with okf_version and project_mode', (t) => {
  const root = repository(t, 'okf-137-happy-');
  const response = run(initRequest(root, { project_mode: 'code-backed' }));

  assert.equal(response.result, 'applied');
  assert.equal(response.data.authorization, 'notice');
  assert.equal(response.data.validation, 'valid');
  assert.deepEqual(response.data.effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
  assert.deepEqual(response.data.actual_effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
  assert.deepEqual(response.data.evidence, []);
  assert.deepEqual(response.findings, []);

  const written = fs.readFileSync(indexFile(root), 'utf8');
  assert.equal(written, '---\nokf_version: "0.2"\nproject_mode: code-backed\n---\n# Bundle\n');
});

test('init defaults the bundle to "okf" and writes okf_version alone when project_mode is omitted', (t) => {
  const root = repository(t, 'okf-137-default-bundle-');
  const response = run(initRequest(root));

  assert.equal(response.result, 'applied');
  const written = fs.readFileSync(indexFile(root), 'utf8');
  assert.equal(written, '---\nokf_version: "0.2"\n---\n# Bundle\n');
});

test('no-op: init against an already-valid root changes nothing', (t) => {
  const root = repository(t, 'okf-137-noop-');
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(indexFile(root), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const before = treeHash(root);

  const response = run(initRequest(root));

  assert.equal(response.result, 'no-op');
  assert.equal(response.data.authorization, 'notice');
  assert.equal(response.data.validation, 'not-needed');
  assert.deepEqual(response.data.actual_effects, []);
  assert.equal(treeHash(root), before);
});

test('repair: a bundle directory that exists without index.md is completed, not refused', (t) => {
  const root = repository(t, 'okf-137-repair-');
  fs.mkdirSync(path.join(root, 'okf'));

  const response = run(initRequest(root));

  assert.equal(response.result, 'applied');
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
});

test('idempotent both ways: a second call is a no-op, and a corrupted root is repaired by overwrite', (t) => {
  const root = repository(t, 'okf-137-idempotent-');

  const first = run(initRequest(root));
  assert.equal(first.result, 'applied');
  const afterFirst = fs.readFileSync(indexFile(root), 'utf8');

  const second = run(initRequest(root));
  assert.equal(second.result, 'no-op');
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), afterFirst);

  // Corrupt the root out from under init: wrong version and an unparseable variant.
  fs.writeFileSync(indexFile(root), '---\nokf_version: "0.1"\n---\n# Legacy\n');
  const repaired = run(initRequest(root));
  assert.equal(repaired.result, 'applied');
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '---\nokf_version: "0.2"\n---\n# Legacy\n');

  fs.writeFileSync(indexFile(root), '---\nokf_version: "0.2"\n  bad indent\n---\n# Garbage\n');
  const overwritten = run(initRequest(root));
  assert.equal(overwritten.result, 'applied');
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
});

test('preserves the existing Markdown body and merges project_mode into an already-valid root on a second call', (t) => {
  const root = repository(t, 'okf-137-merge-');
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(indexFile(root), '---\nokf_version: "0.2"\n---\n# Custom Bundle\n\nSome hand-authored text.\n');

  const withMode = run(initRequest(root, { project_mode: 'knowledge-only' }));
  assert.equal(withMode.result, 'applied');
  assert.equal(
    fs.readFileSync(indexFile(root), 'utf8'),
    '---\nokf_version: "0.2"\nproject_mode: knowledge-only\n---\n# Custom Bundle\n\nSome hand-authored text.\n',
  );

  const again = run(initRequest(root, { project_mode: 'knowledge-only' }));
  assert.equal(again.result, 'no-op');
});

test('refuses an unsupported project_mode value as UNSUPPORTED_INPUT without writing', (t) => {
  const root = repository(t, 'okf-137-bad-mode-');
  const response = run(initRequest(root, { project_mode: 'sandbox' }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(fs.existsSync(indexFile(root)), false);
});

test('init is refused when combined with a derived effect', (t) => {
  const root = repository(t, 'okf-137-forbidden-combination-');
  const response = run(initRequest(root, { effects: ['init', 'index-maintenance'] }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.deepEqual(response.data.effects, [
    { effect: 'init', authorization: 'blocked', inherited: false },
    { effect: 'index-maintenance', authorization: 'blocked', inherited: true },
  ]);
  assert.equal(fs.existsSync(indexFile(root)), false);
});

test('ownership refusal: a bundle target with no Git ancestry of its own is blocked before any write', (t) => {
  const root = repository(t, 'okf-137-ownership-');
  const foreign = temporaryRoot(t, 'okf-137-no-git-');

  const response = run(initRequest(root, { bundle: foreign }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'WRITE_OWNERSHIP_UNKNOWN');
  assert.equal(fs.existsSync(path.join(foreign, 'index.md')), false);
});

test('calling init entirely outside a Git repository reports not-configured, exactly like every other operation', (t) => {
  const root = temporaryRoot(t, 'okf-137-no-repo-');
  const response = run(initRequest(root));

  assert.equal(response.result, 'not-configured');
  assert.equal(fs.existsSync(path.join(root, 'okf')), false);
});

test('REACH/writability refusal: a non-writable bundle parent blocks init with a blocking finding', (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip('root can write through a read-only directory');
    return;
  }
  const root = repository(t, 'okf-137-readonly-');
  fs.chmodSync(root, 0o555);
  let response;
  try {
    response = run(initRequest(root));
  } finally {
    fs.chmodSync(root, 0o755);
  }

  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'PARENT_DIRECTORY_NOT_WRITABLE'), 'PARENT_DIRECTORY_NOT_WRITABLE');
  assert.equal(fs.existsSync(path.join(root, 'okf')), false);
});

test('round-trip: the written root re-reads to the exact tree init wrote', (t) => {
  const root = repository(t, 'okf-137-round-trip-');
  const response = run(initRequest(root, { project_mode: 'knowledge-only' }));

  assert.equal(response.result, 'applied');
  assert.equal(response.data.validation, 'valid');
  assert.equal(
    response.findings.some((item) => item.code === 'PARSE_TREE_MISMATCH' || item.code === 'POST_WRITE_VALIDATION_FAILED'),
    false,
  );
  // A second call is a clean no-op only if the first call's bytes actually
  // parse back to the tree init believes it wrote.
  const again = run(initRequest(root, { project_mode: 'knowledge-only' }));
  assert.equal(again.result, 'no-op');
});

test('precondition chain: after init succeeds, a normal create passes the full okf-write gate', (t) => {
  const root = repository(t, 'okf-137-chain-');
  const initResponse = run(initRequest(root, { project_mode: 'knowledge-only' }));
  assert.equal(initResponse.result, 'applied');

  fs.writeFileSync(path.join(root, 'okf', 'evidence.md'), 'observed evidence\n');
  const createResponse = spawnWrapper(writeWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'create',
    task_kind: 'feature work',
    payload: {
      cwd: root,
      bundle: path.join(root, 'okf'),
      concept: 'concept.md',
      evidence: ['evidence.md'],
      set: { type: 'Note', title: 'From the chain' },
    },
  }).response;

  assert.equal(createResponse.result, 'applied');
  assert.equal(fs.existsSync(path.join(root, 'okf', 'concept.md')), true);
});
