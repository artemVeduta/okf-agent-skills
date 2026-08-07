const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RESPONSE_KEYS: responseKeys, assertEnvelope, treeHash } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const scripts = path.join(repo, 'scripts');
const ACTIVATION_BLOCKED_DATA = {
  authorization: 'blocked',
  effects: [{ effect: 'concept-revise', authorization: 'blocked', inherited: false }],
  task_kind: 'fix',
  actual_effects: [],
  residue: [],
  evidence: [],
  validation: 'not-run',
  code: 'ACTIVATION_MARKER_INVALID',
};
const ACTIVATION_INVALID_FINDING = {
  code: 'ACTIVATION_MARKER_INVALID',
  origin: 'suite',
  severity: 'error',
  blocks: true,
  detail: { gate: 'activation', reason: 'not_zero_byte_regular_file' },
};

function temporaryRoot(t, prefix = 'okf-48-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function activate(root) {
  fs.writeFileSync(path.join(root, '.okf-active'), '');
}

function repository(t, prefix = 'okf-48-repo-', active = true) {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  if (active) activate(root);
  return root;
}

function bundle(root, relative = '.') {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  return dir;
}

function request(skill, operation, payload, fields = {}) {
  return { protocol: 'okf-wrapper/1', skill, operation, payload, ...fields };
}

function admitRequest(root, invocation) {
  return request('okf-read', 'admit', { cwd: root, candidates: [] }, invocation === undefined ? {} : { invocation });
}

function reviseRequest(root, invocation) {
  return request('okf-write', 'revise', {
    cwd: root,
    bundle: root,
    concept: 'concept.md',
    set: { title: 'Changed' },
  }, { task_kind: 'fix', ...(invocation === undefined ? {} : { invocation }) });
}

function writeConcept(root) {
  fs.writeFileSync(path.join(root, 'concept.md'), '---\ntype: Note\ntitle: Original\n---\n# Concept\n');
}

function runWrapper(skill, value) {
  const run = cp.spawnSync(process.execPath, [path.join(scripts, `${skill}.js`)], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
  });
  let response;
  try {
    response = run.stdout ? JSON.parse(run.stdout) : undefined;
  } catch {
    response = undefined;
  }
  return {
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    status: run.status,
    response,
  };
}

function assertDiagnostic(stderr) {
  assert.ok(stderr.trim().length > 0);
  assert.equal(stderr.trim().includes('\n'), false);
  assert.equal(stderr.includes('\n    at '), false);
}

function unknownRequest(root, skill = 'okf-read', operation = 'not-shipped') {
  return request(skill, operation, { cwd: root });
}

function assertNotConfigured(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.response);
  assert.equal(result.response.result, 'not-configured');
}

function scriptFiles(directory = scripts) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scriptFiles(file) : [file];
  });
}

test('ships exactly six process wrappers without skill or guard modules', () => {
  const wrappers = ['okf.js', 'okf-read.js', 'okf-write.js', 'okf-lifecycle.js', 'okf-review.js', 'okf-setup.js'];
  const topLevelWrappers = fs.readdirSync(scripts)
    .filter((file) => /^okf(?:-(?:read|write|lifecycle|review|setup))?\.js$/.test(file))
    .sort();
  assert.deepEqual(topLevelWrappers, wrappers.slice().sort());
  for (const file of wrappers) assert.equal(fs.statSync(path.join(scripts, file)).isFile(), true, file);
  const libraryFiles = scriptFiles(path.join(scripts, 'lib')).map((file) => path.basename(file));
  assert.equal(libraryFiles.includes('guard.js'), false);
  assert.equal(libraryFiles.some((file) => /^okf-/.test(file)), false);
});

test('invalid wrapper input exits 64 without stdout or a stack trace', () => {
  const valid = { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'not-shipped', payload: { cwd: '/tmp' } };
  const cases = [
    ['protocol', { ...valid, protocol: 'wrong/1' }],
    ['skill', { ...valid, skill: 'okf-write' }],
    ['unknown field', { ...valid, extra: true }],
    ['malformed JSON', '{'],
    ['array', '[]'],
    ['null', 'null'],
    ['concatenated JSON', '{}{}'],
  ];

  for (const [name, input] of cases) {
    const result = runWrapper('okf-read', input);
    assert.equal(result.status, 64, name);
    assert.equal(result.stdout, '', name);
    assertDiagnostic(result.stderr);
  }
});

test('revise rejects non-string and empty bundle or concept values at the wrapper boundary', (t) => {
  const root = repository(t, 'okf-48-revise-input-');
  bundle(root);
  writeConcept(root);
  const base = reviseRequest(root);
  const before = treeHash(root);
  const cases = [
    ['non-string bundle', { bundle: 7 }],
    ['empty bundle', { bundle: '' }],
    ['non-string concept', { concept: 7 }],
    ['empty concept', { concept: '' }],
  ];

  for (const [name, change] of cases) {
    const result = runWrapper('okf-write', { ...base, payload: { ...base.payload, ...change } });
    assert.equal(result.status, 64, name);
    assert.equal(result.stdout, '', name);
    assertDiagnostic(result.stderr);
  }
  assert.equal(treeHash(root), before);
});

test('revise rejects missing, empty, and non-string cwd before writing', (t) => {
  const root = repository(t, 'okf-48-revise-cwd-');
  bundle(root);
  writeConcept(root);
  const base = reviseRequest(root);
  const before = treeHash(root);
  const cases = [
    ['missing cwd', {}],
    ['empty cwd', { cwd: '' }],
    ['non-string cwd', { cwd: 7 }],
  ];

  for (const [name, change] of cases) {
    const payload = { ...base.payload, ...change };
    if (!Object.hasOwn(change, 'cwd')) delete payload.cwd;
    const result = runWrapper('okf-write', { ...base, payload });
    assert.equal(result.status, 64, name);
    assert.equal(result.stdout, '', name);
    assertDiagnostic(result.stderr);
  }
  assert.equal(treeHash(root), before);
});

test('write targets must stay in the active worktree for direct and routed revise', (t) => {
  const source = repository(t, 'okf-48-write-source-');
  bundle(source);
  writeConcept(source);
  const external = repository(t, 'okf-48-write-external-');
  bundle(external);
  writeConcept(external);
  const payload = { ...reviseRequest(source).payload, bundle: external };
  const expected = {
    code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'write routing', reason: 'outside_active_worktree' },
  };
  const before = treeHash(external);

  for (const [skill, value] of [
    ['okf-write', request('okf-write', 'revise', payload, { task_kind: 'fix' })],
    ['okf', request('okf', 'revise', payload, { task_kind: 'fix' })],
  ]) {
    const result = runWrapper(skill, value);
    assertEnvelope(result);
    assert.equal(result.response.result, 'blocked', skill);
    assert.equal(result.response.data.code, 'WRITE_TARGET_OUTSIDE_WORKTREE', skill);
    assert.deepEqual(result.response.findings, [expected], skill);
    assert.equal(treeHash(external), before, skill);
  }
});

test('invalid invocation values are rejected at the wrapper boundary', (t) => {
  const root = repository(t, 'okf-48-invocation-');
  bundle(root);
  writeConcept(root);
  const base = reviseRequest(root);
  const before = treeHash(root);
  for (const invocation of [null, 'implicit', 1, {}]) {
    const result = runWrapper('okf-write', { ...base, invocation });
    assert.equal(result.status, 64, JSON.stringify(invocation));
    assert.equal(result.stdout, '', JSON.stringify(invocation));
    assertDiagnostic(result.stderr);
  }
  assert.equal(treeHash(root), before);
});

test('automatic revise is blocked without changing the concept', (t) => {
  const root = repository(t, 'okf-48-automatic-revise-');
  bundle(root);
  writeConcept(root);
  const target = path.join(root, 'concept.md');
  const beforeTarget = fs.readFileSync(target);
  const beforeTree = treeHash(root);
  const result = runWrapper('okf-write', reviseRequest(root, 'automatic'));

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.response);
  assert.equal(result.response.result, 'blocked');
  assert.equal(result.response.data.code, 'AUTOMATIC_MUTATION_BLOCKED');
  assert.equal(result.response.findings.some((item) => item.code === 'AUTOMATIC_MUTATION_BLOCKED'), true);
  assert.deepEqual(fs.readFileSync(target), beforeTarget);
  assert.equal(treeHash(root), beforeTree);
});

test('an invalid activation marker takes precedence over automatic mutation blocking', (t) => {
  const root = repository(t, 'okf-48-invalid-marker-automatic-', false);
  bundle(root);
  writeConcept(root);
  fs.writeFileSync(path.join(root, '.okf-active'), 'invalid');
  const target = path.join(root, 'concept.md');
  const beforeTarget = fs.readFileSync(target);
  for (const [skill, value] of [
    ['okf-write', reviseRequest(root, 'automatic')],
    ['okf', { ...reviseRequest(root, 'automatic'), skill: 'okf' }],
  ]) {
    const result = runWrapper(skill, value);
    assertEnvelope(result);
    assert.equal(result.response.result, 'blocked', skill);
    assert.deepEqual(result.response.data, ACTIVATION_BLOCKED_DATA, skill);
    assert.deepEqual(result.response.findings, [ACTIVATION_INVALID_FINDING], skill);
    assert.deepEqual(fs.readFileSync(target), beforeTarget, skill);
  }
});

test('valid refusal has the fixed envelope, key order, newline, and empty stderr', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  const result = runWrapper('okf-read', unknownRequest(root));
  assertEnvelope(result);
  assert.equal(result.response.result, 'blocked');
  assert.deepEqual(result.response.data, { code: 'UNKNOWN_OPERATION' });
  assert.deepEqual(result.response.findings, []);
  assert.equal(result.response.next_action, null);
  assert.equal(treeHash(root), before);
});

test('identical valid requests produce byte-identical stdout', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  const payload = unknownRequest(root);
  const first = runWrapper('okf-read', payload);
  const second = runWrapper('okf-read', payload);
  assertEnvelope(first);
  assertEnvelope(second);
  assert.equal(first.stdout, second.stdout);
  assert.equal(treeHash(root), before);
});

test('accepts every allowed top-level request key', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  const result = runWrapper('okf-read', request('okf-read', 'not-shipped', { cwd: root }, {
    task_kind: 'exploration',
    scope: { paths: ['.'] },
    target: { bundle: '.' },
    settings: {},
    invocation: 'explicit',
    brief: {},
  }));

  assertEnvelope(result);
  assert.equal(result.response.result, 'blocked');
  assert.deepEqual(result.response.data, { code: 'UNKNOWN_OPERATION' });
  assert.equal(treeHash(root), before);
});

test('guard operations are valid UNKNOWN_OPERATION refusals and no guard module ships', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  for (const operation of ['guard.prepare', 'guard.confirm', 'guard.execute']) {
    const result = runWrapper('okf', unknownRequest(root, 'okf', operation));
    assertEnvelope(result);
    assert.equal(result.response.result, 'blocked', operation);
    assert.equal(result.response.data.code, 'UNKNOWN_OPERATION', operation);
    assert.deepEqual(result.response.findings, [], operation);
  }

  const guardFiles = scriptFiles().filter((file) => path.basename(file) === 'guard.js');
  assert.deepEqual(guardFiles, []);
  assert.equal(treeHash(root), before);
});

test('absent activation marker reports not-configured for default and explicit invocation', (t) => {
  const root = repository(t, 'okf-48-no-marker-', false);
  const before = treeHash(root);
  assertNotConfigured(runWrapper('okf-read', admitRequest(root)));
  assertNotConfigured(runWrapper('okf-read', admitRequest(root, 'explicit')));
  assert.equal(treeHash(root), before);
});

test('absent activation marker is silent for exactly automatic invocation', (t) => {
  const root = repository(t, 'okf-48-auto-no-marker-', false);
  const before = treeHash(root);
  const result = runWrapper('okf-read', admitRequest(root, 'automatic'));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.response, undefined);
  assert.equal(treeHash(root), before);
});

test('a valid root marker activates a request from a nested cwd', (t) => {
  const root = repository(t);
  const nested = path.join(root, 'nested', 'work');
  fs.mkdirSync(nested, { recursive: true });
  const before = treeHash(root);
  const result = runWrapper('okf-read', admitRequest(nested));
  assertEnvelope(result);
  assert.equal(result.response.result, 'ok');
  assert.deepEqual(result.response.data, { federation: 'none', candidates: [] });
  assert.equal(treeHash(root), before);
});

test('markers above, below, and outside a Git root are ignored', (t) => {
  const workspace = temporaryRoot(t, 'okf-48-marker-placement-');
  const root = path.join(workspace, 'repo');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  activate(workspace);

  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  activate(nested);

  const plain = path.join(workspace, 'plain');
  fs.mkdirSync(plain);
  activate(plain);
  const before = treeHash(workspace);
  assertNotConfigured(runWrapper('okf-read', admitRequest(nested)));
  assertNotConfigured(runWrapper('okf-read', admitRequest(plain)));
  assert.equal(treeHash(workspace), before);
});

test('non-empty, directory, and symlink markers block with the exact activation finding', (t) => {
  const cases = [
    ['non-empty', (marker) => fs.writeFileSync(marker, 'active')],
    ['directory', (marker) => fs.mkdirSync(marker)],
    ['symlink', (marker) => {
      const target = path.join(path.dirname(marker), 'marker-target');
      fs.writeFileSync(target, '');
      fs.symlinkSync(target, marker);
    }],
  ];
  for (const [name, setup] of cases) {
    const root = repository(t, `okf-48-invalid-marker-${name}-`, false);
    bundle(root);
    writeConcept(root);
    setup(path.join(root, '.okf-active'));
    const target = path.join(root, 'concept.md');
    const beforeTarget = fs.readFileSync(target);
    const beforeTree = treeHash(root);
    const result = runWrapper('okf-write', reviseRequest(root));
    assert.equal(result.status, 0, name);
    assert.equal(result.stderr, '', name);
    assert.ok(result.response, name);
    assert.deepEqual(Object.keys(result.response), responseKeys, name);
    assert.equal(result.response.result, 'blocked', name);
    assert.deepEqual(result.response.data, ACTIVATION_BLOCKED_DATA, name);
    assert.deepEqual(result.response.findings, [ACTIVATION_INVALID_FINDING], name);
    assert.equal(fs.readFileSync(target).equals(beforeTarget), true, name);
    assert.equal(treeHash(root), beforeTree, name);
  }
});

test('activation checks do not change the marker tree', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  const result = runWrapper('okf-read', unknownRequest(root));
  assertEnvelope(result);
  assert.equal(treeHash(root), before);
});

test('a valid marker does not bypass the REACH admission gate', (t) => {
  const root = repository(t);
  const before = treeHash(root);
  const result = runWrapper('okf-read', request('okf-read', 'admit', {
    cwd: root,
    candidates: [{ path: '..' }],
  }));
  assertEnvelope(result);
  assert.equal(result.response.result, 'blocked');
  assert.equal(result.response.data.candidates[0].failed_gate, 'REACH');
  assert.equal(result.response.data.candidates[0].findings[0].code, 'ABOVE_GIT_ROOT');
  assert.equal(treeHash(root), before);
});

test('a valid marker does not bypass the TRUST admission gate', (t) => {
  const root = repository(t);
  const peer = path.join(root, 'peer');
  fs.mkdirSync(path.join(peer, '.git'), { recursive: true });
  activate(peer);
  bundle(peer);
  const before = treeHash(root);
  const result = runWrapper('okf-read', request('okf-read', 'admit', {
    cwd: root,
    candidates: [{ path: 'peer', declared: true, requires_repository: true }],
  }));
  assertEnvelope(result);
  assert.equal(result.response.result, 'blocked');
  assert.equal(result.response.data.candidates[0].failed_gate, 'TRUST');
  assert.equal(result.response.data.candidates[0].findings.some((item) => item.code === 'UNTRUSTED'), true);
  assert.equal(treeHash(root), before);
});

test('a valid marker does not bypass the ACCESS admission gate', (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip('root can read mode-zero fixtures');
    return;
  }

  const root = repository(t);
  const peer = path.join(root, 'peer');
  const inaccessible = bundle(peer, 'knowledge');
  fs.mkdirSync(path.join(peer, '.git'), { recursive: true });
  activate(peer);
  const before = treeHash(root);
  let result;
  fs.chmodSync(inaccessible, 0o000);
  try {
    result = runWrapper('okf-read', request('okf-read', 'admit', {
      cwd: root,
      candidates: [{ path: 'peer', bundle: 'knowledge', declared: true, requires_repository: true }],
    }));
  } finally {
    fs.chmodSync(inaccessible, 0o755);
  }
  assertEnvelope(result);
  assert.equal(result.response.result, 'blocked');
  assert.equal(result.response.data.candidates[0].findings.some((item) => item.code === 'ACCESS_DENIED'), true);
  assert.equal(treeHash(root), before);
});
