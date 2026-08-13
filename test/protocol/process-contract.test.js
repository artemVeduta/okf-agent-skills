// Domain: protocol. Wrapper process contract (exit 64, envelope, key order,
// activation gating) and delegation brief/receipt dispatch parity.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  RESPONSE_KEYS: responseKeys,
  REQUIRED_BRIEF_FIELDS,
  assertEnvelope,
  binding,
  treeHash,
  writeManifest,
} = require('../../test-support/snapshot');

const repo = path.resolve(__dirname, '..', '..');
const scripts = path.join(repo, 'scripts');

describe('wrapper process contract', () => { // #48
  const ACTIVATION_BLOCKED_DATA = {
    authorization: 'blocked',
    effects: [{ effect: 'concept-revise', authorization: 'blocked', inherited: false }],
    task_kind: 'fix',
    actual_effects: [],
    residue: [],
    evidence: [],
    validation: 'not-run',
    code: 'MANIFEST_INVALID',
  };
  const ACTIVATION_INVALID_FINDING = {
    code: 'MANIFEST_INVALID',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'activation', reason: 'manifest_invalid' },
  };

  function temporaryRoot(t, prefix = 'okf-48-') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
  }

  function activate(root) {
    writeManifest(root, '.');
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

  // `resolve` is a normal gated read, never exempt like `admit` (see the
  // `admit bypasses activation entirely...` test below) -- it is the operation
  // the manifest-placement tests further down drive the gate through.
  function resolveRequest(cwd, target) {
    return request('okf-read', 'resolve', { cwd, candidates: [], target });
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

  test('an invalid manifest takes precedence over automatic mutation blocking', (t) => {
    const root = repository(t, 'okf-48-invalid-marker-automatic-', false);
    bundle(root);
    writeConcept(root);
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
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

  // #197: `admit` is exempt from the activation gate (it is the inspection
  // primitive at which REACH/PRESENCE/TRUST/ACCESS and federation fallback are
  // independently observable -- see `runtime.js`'s `activationBypassOperations`
  // comment). Unlike every other explicit call, it never reports
  // `not-configured`/blocked activation, and this is true regardless of cwd
  // nesting or where a manifest would have had to sit relative to the Git
  // root -- there is no more "activation" state for it to consult at all. This
  // is the accepted cost of the exemption, not an oversight.
  test('admit bypasses activation entirely: it never reports not-configured for a manifest-less repository', (t) => {
    const root = repository(t, 'okf-48-no-marker-', false);
    const nested = path.join(root, 'nested', 'work');
    fs.mkdirSync(nested, { recursive: true });
    const before = treeHash(root);
    for (const cwd of [root, nested]) {
      for (const invocation of [undefined, 'explicit']) {
        const result = runWrapper('okf-read', admitRequest(cwd, invocation));
        assertEnvelope(result);
        assert.equal(result.response.result, 'ok');
        assert.deepEqual(result.response.data, { federation: 'none', candidates: [] });
      }
    }
    assert.equal(treeHash(root), before);
  });

  // #197 fix round 1: `manifest.select()`'s `discover()` is the exact function
  // `activationState()` calls for every non-exempt operation (`resolve` here),
  // so the four placement properties below are load-bearing for the gate
  // itself, not a `resolve`-specific detail. They replace the marker-era
  // "a valid root marker activates a request from a nested cwd" and "markers
  // above, below, and outside a Git root are ignored" tests this file lost
  // when `admit` -- the only operation those drove -- became gate-exempt.
  test('a valid manifest at the repository root activates a request from a nested cwd', (t) => {
    const root = repository(t, 'okf-48-nested-cwd-');
    bundle(root);
    fs.writeFileSync(path.join(root, 'note.md'), '# Note\n');
    const nested = path.join(root, 'nested', 'work');
    fs.mkdirSync(nested, { recursive: true });
    const before = treeHash(root);
    const result = runWrapper('okf-read', resolveRequest(nested, 'note'));
    assertEnvelope(result);
    assert.equal(result.response.result, 'ok');
    assert.equal(result.response.data.selected.bundle_alias, 'repo');
    assert.equal(treeHash(root), before);
  });

  test('a manifest above the Git root is ignored', (t) => {
    const workspace = temporaryRoot(t, 'okf-48-above-root-');
    const root = path.join(workspace, 'repo');
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    bundle(root);
    fs.writeFileSync(path.join(root, 'note.md'), '# Note\n');
    writeManifest(workspace, '.');
    const before = treeHash(workspace);
    assertNotConfigured(runWrapper('okf-read', resolveRequest(root, 'note')));
    assert.equal(treeHash(workspace), before);
  });

  test('a manifest below cwd is ignored', (t) => {
    const root = repository(t, 'okf-48-below-cwd-', false);
    bundle(root);
    fs.writeFileSync(path.join(root, 'note.md'), '# Note\n');
    const child = path.join(root, 'child');
    fs.mkdirSync(child, { recursive: true });
    writeManifest(child, '.');
    const before = treeHash(root);
    assertNotConfigured(runWrapper('okf-read', resolveRequest(root, 'note')));
    assert.equal(treeHash(root), before);
  });

  test('a manifest outside any Git repository does not activate a non-repository cwd', (t) => {
    const workspace = temporaryRoot(t, 'okf-48-outside-root-');
    const plain = path.join(workspace, 'plain');
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'note.md'), '# Note\n');
    writeManifest(plain, '.');
    const before = treeHash(workspace);
    assertNotConfigured(runWrapper('okf-read', resolveRequest(plain, 'note')));
    assert.equal(treeHash(workspace), before);
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

  // #197: a marker's invalidity was a physical-file question (non-empty, a
  // directory, a symlink). A manifest's is a data question: unparseable JSON, or
  // JSON that fails the schema. `directory` still hits the exact same read
  // failure a marker directory did (`services.readFile` throws either way).
  test('malformed JSON, a directory, and a schema-invalid manifest block with the exact activation finding', (t) => {
    const cases = [
      ['malformed-json', (manifestFile) => fs.writeFileSync(manifestFile, 'not json')],
      ['directory', (manifestFile) => fs.mkdirSync(manifestFile)],
      ['schema-invalid', (manifestFile) => fs.writeFileSync(manifestFile, JSON.stringify({ schema_version: 1 }))],
    ];
    for (const [name, setup] of cases) {
      const root = repository(t, `okf-48-invalid-marker-${name}-`, false);
      bundle(root);
      writeConcept(root);
      setup(path.join(root, '.okf-workspace.json'));
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

  test('an explicit candidate still goes through the REACH admission gate', (t) => {
    const root = repository(t, 'okf-48-reach-', false);
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

  test('an explicit candidate still goes through the TRUST admission gate', (t) => {
    const root = repository(t, 'okf-48-trust-', false);
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

  test('an explicit candidate still goes through the ACCESS admission gate', (t) => {
    if (process.getuid && process.getuid() === 0) {
      t.skip('root can read mode-zero fixtures');
      return;
    }

    const root = repository(t, 'okf-48-access-', false);
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
});

describe('delegation brief and receipt dispatch', () => { // #68
  const delegation = require(path.join(scripts, 'lib', 'delegation'));
  const delegateWrapper = path.join(scripts, 'okf-delegate.js');
  const readWrapper = path.join(scripts, 'okf-read.js');
  const writeWrapper = path.join(scripts, 'okf-write.js');

  function bundle(t, mode = 'knowledge-only') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-68-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, 'index.md'), `---\nokf_version: "0.2"\nproject_mode: "${mode}"\n---\n# Bundle\n`);
    fs.writeFileSync(path.join(root, 'evidence.md'), 'observed\n');
    return root;
  }

  function concept(root, text = '---\ntype: Note\ntitle: Before\n---\n# Body\n') {
    fs.writeFileSync(path.join(root, 'note.md'), text);
  }

  // #174: a write-evidence observation binding for the fixture's own `evidence.md`;
  // the brief-shape cases use a synthetic root with no filesystem behind it.
  function evidenceBinding(root) {
    try { return binding(root, 'evidence.md'); } catch { return { path: 'evidence.md', sha256: 'a'.repeat(64) }; }
  }

  function brief(root, overrides = {}) {
    return {
      role: 'okf-writer',
      task_kind: 'fix',
      operation_class: 'revise',
      cwd: root,
      bundle: root,
      paths: ['note.md'],
      changes: { title: 'After' },
      allowed_effects: ['concept-revise'],
      forbidden_effects: ['concept-create', 'format', 'relationship', 'machine-verify'],
      evidence: [evidenceBinding(root)],
      required_checks: ['runtime-preflight'],
      settings: { read_execution: 'inline', write_execution: 'delegated' },
      expected_result: 'note.md revised',
      ...overrides,
    };
  }

  function readBrief(root, overrides = {}) {
    return brief(root, {
      role: 'okf-reader',
      operation_class: 'read',
      changes: undefined,
      allowed_effects: [],
      forbidden_effects: ['concept-create', 'concept-revise', 'format', 'relationship', 'machine-verify'],
      ...overrides,
    });
  }

  function run(wrapper, value) {
    const result = cp.spawnSync(process.execPath, [wrapper], {
      input: JSON.stringify(value), encoding: 'utf8',
    });
    const response = JSON.parse(result.stdout);
    return { status: result.status, stderr: result.stderr, stdout: result.stdout, response };
  }

  function bytes(file) {
    return fs.readFileSync(file);
  }

  test('validateBrief blocks a brief missing any required field as incomplete-brief', () => {
    for (const field of REQUIRED_BRIEF_FIELDS) {
      const value = brief('/repo');
      delete value[field];
      const result = delegation.validateBrief(value);
      assert.equal(result.ok, false, field);
      assert.equal(result.status, 'blocked: incomplete-brief', field);
    }
  });

  test('validateBrief blocks null, empty-string, empty-array, and empty-object required fields', () => {
    const cases = [
      ['cwd', ''],
      ['paths', []],
      ['evidence', null],
      ['settings', {}],
    ];
    for (const [field, value] of cases) {
      const b = brief('/repo', { [field]: value });
      const result = delegation.validateBrief(b);
      assert.equal(result.ok, false, field);
      assert.equal(result.status, 'blocked: incomplete-brief', field);
    }
  });

  test('validateBrief blocks an unknown role as incomplete-brief and never guesses a role', () => {
    const result = delegation.validateBrief(brief('/repo', { role: 'okf-admin' }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked: incomplete-brief');
  });

  test('validateBrief blocks a settings value outside inline|delegated as incomplete-brief', () => {
    const result = delegation.validateBrief(brief('/repo', {
      settings: { read_execution: 'inline', write_execution: 'automatic' },
    }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked: incomplete-brief');
  });

  test('validateBrief blocks an effect present in both allowed and forbidden as conflicting-rules', () => {
    const result = delegation.validateBrief(brief('/repo', {
      allowed_effects: ['concept-revise'],
      forbidden_effects: ['concept-revise'],
    }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked: conflicting-rules');
  });

  test('validateBrief blocks a reader brief that requests any write effect as scope widening', () => {
    const result = delegation.validateBrief(readBrief('/repo', { allowed_effects: ['concept-revise'] }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked: conflicting-rules');
  });

  test('validateBrief blocks a writer brief that requests an effect outside the shipped writer effects', () => {
    const result = delegation.validateBrief(brief('/repo', { allowed_effects: ['concept-revise', 'mechanical-link-maintenance'] }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked: conflicting-rules');
  });

  test('validateBrief blocks a router-table operation owned by the other role, but forwards an operation absent from the table unchanged', () => {
    const readerOnWrite = delegation.validateBrief(readBrief('/repo', { operation_class: 'revise' }));
    assert.equal(readerOnWrite.status, 'blocked: conflicting-rules');

    const notARouterOperation = delegation.validateBrief(brief('/repo', { operation_class: 'delete' }));
    assert.equal(notARouterOperation.ok, true);
    assert.equal(notARouterOperation.request.operation, 'delete');
  });

  test('validateBrief blocks orient on a reader brief: orientation belongs to the session seam, not a delegation brief', () => {
    const result = delegation.validateBrief(readBrief('/repo', { operation_class: 'orient' }));
    assert.equal(result.status, 'blocked: conflicting-rules');
  });

  test('validateBrief accepts a well-formed reader brief and builds the same okf-wrapper/1 request inline execution would send', () => {
    const result = delegation.validateBrief(readBrief('/repo'));
    assert.equal(result.ok, true);
    assert.deepEqual(result.request, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-read',
      operation: 'read',
      task_kind: 'fix',
      invocation: 'explicit',
      payload: { cwd: '/repo', bundle: '/repo', target: 'note.md' },
    });
  });

  test('validateBrief accepts a well-formed writer brief and builds the same okf-wrapper/1 request inline execution would send', () => {
    const result = delegation.validateBrief(brief('/repo'));
    assert.equal(result.ok, true);
    assert.deepEqual(result.request, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation: 'revise',
      task_kind: 'fix',
      invocation: 'explicit',
      payload: { cwd: '/repo', bundle: '/repo', concept: 'note.md', evidence: [evidenceBinding('/repo')], effects: ['concept-revise'], set: { title: 'After' } },
    });
  });

  test('receipt maps runtime applied and no-op to clean, and failed/incomplete to partially-applied', () => {
    const b = brief('/repo');
    assert.equal(delegation.receipt(b, { result: 'applied', data: {}, findings: [] }).status, 'clean');
    assert.equal(delegation.receipt(b, { result: 'no-op', data: {}, findings: [] }).status, 'clean');
    assert.equal(delegation.receipt(b, { result: 'failed/incomplete', data: {}, findings: [] }).status, 'partially-applied');
  });

  test('receipt maps the three drift/mismatch finding codes to their named blocked statuses, and other blocks to failed', () => {
    const b = brief('/repo');
    const withCode = (code) => delegation.receipt(b, { result: 'blocked', data: { code }, findings: [] }).status;
    assert.equal(withCode('WRITE_TARGET_OUTSIDE_WORKTREE'), 'blocked: repository-instance-mismatch');
    assert.equal(withCode('TARGET_CHANGED'), 'blocked: target-conflict');
    assert.equal(withCode('EVIDENCE_UNAVAILABLE'), 'blocked: stale-handoff');
    assert.equal(withCode('EVIDENCE_REQUIRED'), 'failed');
    assert.equal(withCode(undefined), 'failed');
  });

  test('receipt passes a validateBrief refusal straight through as the receipt status', () => {
    const b = brief('/repo');
    const refusal = delegation.validateBrief(brief('/repo', { role: 'okf-admin' }));
    const result = delegation.receipt(b, refusal);
    assert.equal(result.status, 'blocked: incomplete-brief');
    assert.deepEqual(result.findings, refusal.findings);
  });

  test('receipt carries requested and actual effects, evidence, validation, residue, findings, next action, and disclosures', () => {
    const b = brief('/repo', { allowed_effects: ['concept-revise', 'log-append'] });
    const response = {
      result: 'applied',
      data: {
        actual_effects: [{ effect: 'concept-revise', authorization: 'notice', inherited: false }],
        evidence: [evidenceBinding('/repo')],
        validation: 'valid',
        residue: [],
      },
      findings: [{ code: 'INLINE_VERIFICATION_INVALIDATED', origin: 'suite', severity: 'warning', blocks: false }],
      next_action: null,
    };
    const result = delegation.receipt(b, response);
    assert.equal(result.protocol, 'okf-wrapper/1');
    assert.equal(result.receipt, 'okf-delegation/1');
    assert.equal(result.role, 'okf-writer');
    assert.deepEqual(result.operation_identity, { operation: 'revise', task_kind: 'fix', role: 'okf-writer' });
    assert.deepEqual(result.target, { bundle: '/repo', cwd: '/repo', concepts: ['note.md'] });
    assert.deepEqual(result.requested_effects, ['concept-revise', 'log-append']);
    assert.deepEqual(result.actual_effects, response.data.actual_effects);
    assert.deepEqual(result.evidence, response.data.evidence);
    assert.equal(result.validation, 'valid');
    assert.deepEqual(result.residue, []);
    assert.deepEqual(result.disclosures, { writes: 'not serialized', crash_recovery: 'not provided', retry: 'not automatic' });
    assert.deepEqual(result.findings, response.findings);
    assert.equal(result.next_action, null);
  });

  test('okf-delegate rejects malformed JSON input at the process boundary', () => {
    const result = cp.spawnSync(process.execPath, [delegateWrapper], { input: '{not json', encoding: 'utf8' });
    assert.equal(result.status, 64);
    assert.notEqual(result.stderr.trim(), '');
    assert.equal(result.stdout, '');
  });

  test('okf-delegate reports an incomplete brief as blocked: incomplete-brief without dispatching', (t) => {
    const root = bundle(t);
    concept(root);
    const value = brief(root);
    delete value.evidence;
    const { status, stderr, response } = run(delegateWrapper, value);
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.equal(response.receipt, 'okf-delegation/1');
    assert.equal(response.status, 'blocked: incomplete-brief');
  });

  test('okf-delegate reports a scope-widening reader brief as blocked: conflicting-rules without dispatching', (t) => {
    const root = bundle(t);
    const value = readBrief(root, { allowed_effects: ['concept-revise'] });
    const { response } = run(delegateWrapper, value);
    assert.equal(response.status, 'blocked: conflicting-rules');
  });

  test('a delegated read dispatches through the real okf-read wrapper and reports its result', (t) => {
    const root = bundle(t);
    concept(root);
    const inline = run(readWrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'read',
      payload: { cwd: root, target: 'note.md' },
    });
    const delegated = run(delegateWrapper, readBrief(root));
    assert.equal(delegated.status, 0);
    assert.equal(delegated.response.role, 'okf-reader');
    assert.equal(inline.response.result, 'degraded');
    assert.equal(delegated.response.status, 'degraded');
    assert.deepEqual(delegated.response.findings, inline.response.findings);
  });

  test('a delegated write reaches the same #54 runtime preflight as an inline write: a bundle outside the active worktree is repository-instance-mismatch', (t) => {
    const root = bundle(t);
    concept(root);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-68-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.mkdirSync(path.join(outside, '.git'));
    fs.writeFileSync(path.join(outside, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n');
    fs.writeFileSync(path.join(outside, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Body\n');
    fs.writeFileSync(path.join(outside, 'evidence.md'), 'observed\n');

    const inline = run(writeWrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', task_kind: 'fix',
      payload: { cwd: root, bundle: outside, concept: 'note.md', set: { title: 'After' }, evidence: [evidenceBinding(root)] },
    });
    assert.equal(inline.response.data.code, 'WRITE_TARGET_OUTSIDE_WORKTREE');

    const delegated = run(delegateWrapper, brief(root, { bundle: outside }));
    assert.equal(delegated.response.status, 'blocked: repository-instance-mismatch');
    assert.ok(delegated.response.findings.some((f) => f.code === 'WRITE_TARGET_OUTSIDE_WORKTREE'));
    assert.deepEqual(bytes(path.join(outside, 'note.md')), Buffer.from('---\ntype: Note\ntitle: Before\n---\n# Body\n'));
  });

  test('a delegated write with unreadable evidence is blocked: stale-handoff, matching the runtime EVIDENCE_UNAVAILABLE gate', (t) => {
    const root = bundle(t);
    concept(root);
    const { response } = run(delegateWrapper, brief(root, { evidence: [{ path: 'missing-evidence.md', sha256: 'a'.repeat(64) }] }));
    assert.equal(response.status, 'blocked: stale-handoff');
    assert.ok(response.findings.some((f) => f.code === 'EVIDENCE_UNAVAILABLE'));
  });

  test('inline and delegated bounded writes against equivalent fixtures agree at the runtime level', (t) => {
    const inlineRoot = bundle(t);
    concept(inlineRoot);
    const delegatedRoot = bundle(t);
    concept(delegatedRoot);

    const inline = run(writeWrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', task_kind: 'fix',
      payload: { cwd: inlineRoot, bundle: inlineRoot, concept: 'note.md', set: { title: 'After' }, evidence: [evidenceBinding(inlineRoot)] },
    });
    const delegated = run(delegateWrapper, brief(delegatedRoot));

    assert.equal(inline.response.result, 'applied');
    assert.equal(delegated.response.status, 'clean');
    assert.deepEqual(bytes(path.join(inlineRoot, 'note.md')), bytes(path.join(delegatedRoot, 'note.md')));
  });

  test('a writer child that fails to produce a parseable response is reported indeterminate and mutates nothing', (t) => {
    const root = bundle(t);
    concept(root);
    const before = bytes(path.join(root, 'note.md'));
    const value = brief(root, { bundle: 42 });

    const first = run(delegateWrapper, value);
    const second = run(delegateWrapper, value);

    for (const { status, response } of [first, second]) {
      assert.equal(status, 0);
      assert.equal(response.status, 'indeterminate');
    }
    assert.deepEqual(bytes(path.join(root, 'note.md')), before);
  });

  test('delegation never touches .okf-workspace.json', (t) => {
    const root = bundle(t);
    concept(root);
    const workspaceBefore = bytes(path.join(root, '.okf-workspace.json'));

    run(delegateWrapper, brief(root));

    assert.deepEqual(bytes(path.join(root, '.okf-workspace.json')), workspaceBefore);
  });
});
