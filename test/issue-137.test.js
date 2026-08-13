const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { binding, repository, runWrapper, spawnWrapper, temporaryRoot, treeHash, writeManifest } = require('../test-support/snapshot');

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

// #196/#197: the bundle root `init` creates is navigation only now -- no
// `okf_version`/`project_mode` frontmatter, both of which moved entirely to the
// manifest bundle record `repair` writes. `init` never accepts `project_mode`
// anymore either: there is no field left on the root to put it in.
test('happy path: init on a clean repository creates a navigation-only bundle root, defaulting the bundle to "okf"', (t) => {
  const root = repository(t, 'okf-137-happy-');
  const response = run(initRequest(root));

  assert.equal(response.result, 'applied');
  assert.equal(response.data.authorization, 'notice');
  assert.equal(response.data.validation, 'valid');
  assert.deepEqual(response.data.effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
  assert.deepEqual(response.data.actual_effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
  assert.deepEqual(response.data.evidence, []);
  assert.deepEqual(response.findings, []);

  const written = fs.readFileSync(indexFile(root), 'utf8');
  // #170: a bundle root created here is a new bundle, so it carries the agent connector.
  assert.equal(written, '# Bundle\n\n- [Agents](agents/index.md)\n');
  assert.equal(fs.readFileSync(path.join(root, 'okf', 'agents', 'okf.md'), 'utf8').includes('type: Playbook'), true);
});

test('no-op: init against an already-parseable root changes nothing', (t) => {
  const root = repository(t, 'okf-137-noop-');
  fs.mkdirSync(path.join(root, 'okf'));
  // Legacy frontmatter, an existing hand-authored body, or nothing at all --
  // navigation only means `init` no longer inspects the content, only whether
  // it parses.
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
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '# Bundle\n\n- [Agents](agents/index.md)\n');
});

test('idempotent both ways: a second call is a no-op, and a corrupted root is repaired by overwrite', (t) => {
  const root = repository(t, 'okf-137-idempotent-');

  const first = run(initRequest(root));
  assert.equal(first.result, 'applied');
  const afterFirst = fs.readFileSync(indexFile(root), 'utf8');

  const second = run(initRequest(root));
  assert.equal(second.result, 'no-op');
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), afterFirst);

  // Corrupt the root out from under init: unterminated frontmatter is genuinely
  // unparseable, whatever it once declared.
  fs.writeFileSync(indexFile(root), '---\nokf_version: [\n---\n# Legacy\n');
  const repaired = run(initRequest(root));
  assert.equal(repaired.result, 'applied');
  // Repairing an existing (non-fresh) root resets it to the plain navigational
  // body alone.
  assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '# Bundle\n');
});

// #196/#197: `project_mode` moved entirely to the manifest bundle record, so
// `init` refuses it outright now -- a recognized value is refused exactly like
// an unrecognized one, because the field itself no longer belongs here.
test('refuses any project_mode payload as UNSUPPORTED_INPUT without writing, recognized value or not', (t) => {
  for (const projectMode of ['code-backed', 'sandbox']) {
    const root = repository(t, 'okf-137-bad-mode-');
    const response = run(initRequest(root, { project_mode: projectMode }));

    assert.equal(response.result, 'blocked', projectMode);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', projectMode);
    assert.equal(fs.existsSync(indexFile(root)), false, projectMode);
  }
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

test('round-trip: the written root re-reads to the exact bytes init wrote', (t) => {
  const root = repository(t, 'okf-137-round-trip-');
  const response = run(initRequest(root));

  assert.equal(response.result, 'applied');
  assert.equal(response.data.validation, 'valid');
  assert.equal(
    response.findings.some((item) => item.code === 'PARSE_TREE_MISMATCH' || item.code === 'POST_WRITE_VALIDATION_FAILED'),
    false,
  );
  // A second call is a clean no-op only if the first call's bytes actually
  // re-parse the way `init` believes they do.
  const again = run(initRequest(root));
  assert.equal(again.result, 'no-op');
});

test('precondition chain: after init succeeds, a normal create passes the full okf-write gate', (t) => {
  const root = repository(t, 'okf-137-chain-');
  // `init` here defaults to the `okf` bundle name; the write gate needs the
  // manifest's declared bundle root to match where `init` actually creates it.
  writeManifest(root, 'okf');
  const initResponse = run(initRequest(root));
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
      evidence: [binding(root, path.join('okf', 'evidence.md'))],
      set: { type: 'Note', title: 'From the chain' },
    },
  }).response;

  assert.equal(createResponse.result, 'applied');
  assert.equal(fs.existsSync(path.join(root, 'okf', 'concept.md')), true);
});
