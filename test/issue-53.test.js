const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scripts = path.join(__dirname, '..', 'scripts');
const runtime = require(path.join(scripts, 'lib', 'runtime'));
const services = require(path.join(scripts, 'lib', 'services'));

function bundle(t, mode = 'knowledge-only') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-53-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), `---\nokf_version: "0.2"\nproject_mode: "${mode}"\n---\n# Bundle\n`);
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  return root;
}

function concept(root, name = 'note.md') {
  fs.writeFileSync(path.join(root, name), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
}

function request(root, skill, operation, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill,
    operation,
    task_kind: 'fix',
    scope: { concepts: ['note.md'] },
    invocation: 'explicit',
    payload: {
      cwd: root,
      bundle: root,
      concept: 'note.md',
      set: { title: 'After' },
      evidence: ['evidence.md'],
      ...extra,
    },
  };
}

function run(value) {
  const result = cp.spawnSync(process.execPath, [path.join(scripts, `${value.skill}.js`)], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr, response: result.stdout ? JSON.parse(result.stdout) : null };
}

function digest(root) {
  const hash = crypto.createHash('sha256');
  for (const entry of fs.readdirSync(root).sort()) {
    const file = path.join(root, entry);
    if (fs.statSync(file).isFile()) hash.update(entry).update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

test('writer applies a bounded evidence-backed revision and reports its atomic outcome', (t) => {
  const root = bundle(t);
  concept(root);
  const response = run(request(root, 'okf-write', 'revise')).response;
  assert.equal(response.result, 'applied');
  assert.equal(response.data.authorization, 'notice');
  assert.deepEqual(response.data.evidence, ['evidence.md']);
  assert.deepEqual(response.data.effects.map((item) => item.effect), ['concept-revise']);
  assert.deepEqual(response.evidence_limits, { writes: 'not serialized', crash_recovery: 'not provided' });
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: After/);
});

test('writer rechecks the saved bundle through its filesystem service', (t) => {
  const cases = [
    ['root version', (root) => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.1"\nproject_mode: "knowledge-only"\n---\n# Bundle\n'), 'failed/incomplete', 'ROOT_DECLARATION_NOT_EXACT'],
    ['project mode', (root) => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "other"\n---\n# Bundle\n'), 'failed/incomplete', 'PROJECT_MODE_INVALID'],
    ['link', (root) => fs.rmSync(path.join(root, 'source.md')), 'applied', 'UNRESOLVED_INTERNAL_LINK'],
    ['upstream', (root) => fs.writeFileSync(path.join(root, 'source.md'), '---\ntitle: Source\n---\n# Source\n'), 'failed/incomplete', 'DEPENDS_ON_BLOCKED_CONCEPT'],
  ];

  for (const [, change, result, code] of cases) {
    const root = bundle(t);
    concept(root);
    fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\n# Source\n');
    const response = runtime.run('okf-write', request(root, 'okf-write', 'revise', {
      set: { title: 'After', sources: [{ resource: 'source.md' }] },
    }), {
      ...services,
      publishFile(file, data, expected) {
        services.publishFile(file, data, expected);
        change(root);
      },
    });
    assert.equal(response.result, result);
    assert.ok(response.findings.some((finding) => finding.code === code));
  }
});

test('direct scope is inferred and requested derivatives append to a frontmatter-free log', (t) => {
  const root = bundle(t);
  concept(root);
  fs.writeFileSync(path.join(root, 'log.md'), '# Log\n');
  const value = request(root, 'okf-write', 'revise', {
    effects: ['concept-revise', 'index-maintenance', 'log-append'],
  });
  delete value.scope;
  const response = run(value).response;
  assert.deepEqual(response.scope, { concepts: ['note.md'] });
  assert.deepEqual(response.data.effects.map((item) => item.inherited), [false, true, true]);
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /- \[note.md\]\(note.md\)/);
  assert.match(fs.readFileSync(path.join(root, 'log.md'), 'utf8'), /- revise: \[note.md\]\(note.md\)/);
});

test('writer refuses unsupported composites before writing', (t) => {
  const root = bundle(t);
  concept(root);
  const before = digest(root);
  const response = run(request(root, 'okf-write', 'revise', { effects: ['concept-revise', 'delete'] })).response;
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.ok(response.findings.some((item) => item.code === 'UNSUPPORTED_INPUT' && item.blocks));
  assert.equal(digest(root), before);
});

test('lifecycle plans a narrow sync through the writer and automatic requests do not write', (t) => {
  const root = bundle(t);
  concept(root);
  const sync = request(root, 'okf-lifecycle', 'sync');
  const response = run(sync).response;
  assert.equal(response.result, 'applied');
  const before = digest(root);
  const automatic = run({ ...sync, invocation: 'automatic' }).response;
  assert.equal(automatic.result, 'blocked');
  assert.equal(automatic.data.code, 'AUTOMATIC_MUTATION_BLOCKED');
  assert.equal(digest(root), before);
});

test('bounded primary effects create, format, relate, and machine-verify through the writer', (t) => {
  const root = bundle(t);
  const create = request(root, 'okf-write', 'create', { concept: 'new.md', set: { type: 'Note' } });
  create.scope = { concepts: ['new.md'] };
  assert.equal(run(create).response.result, 'applied');
  assert.match(fs.readFileSync(path.join(root, 'new.md'), 'utf8'), /status: draft/);

  concept(root);
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\n# Source\n');
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  assert.equal(run(request(root, 'okf-write', 'format', { set: {}, evidence: undefined })).response.result, 'applied');
  assert.equal(run(request(root, 'okf-write', 'relationship', { evidence: ['source.md'], set: { sources: [{ resource: 'source.md' }] } })).response.result, 'applied');
  assert.equal(run(request(root, 'okf-write', 'machine-verify', {
    set: { verified: [{ kind: 'machine', by: 'check', coverage: 'complete-current-concept' }] },
  })).response.result, 'applied');
});

test('no-op, abstained, and failed bounded outcomes do not hide their state', (t) => {
  const root = bundle(t);
  concept(root);
  const revise = request(root, 'okf-write', 'revise');
  assert.equal(run(revise).response.result, 'applied');
  assert.equal(run(revise).response.result, 'no-op');

  const abstain = request(root, 'okf-lifecycle', 'sync');
  delete abstain.payload.set;
  const abstained = run(abstain).response;
  assert.equal(abstained.result, 'abstained');
  assert.equal(abstained.data.authorization, 'allowed');
  const noScope = request(root, 'okf-lifecycle', 'sync'); delete noScope.scope;
  assert.equal(run(noScope).response.data.code, 'INVALID_SCOPE');

  const failed = request(root, 'okf-write', 'create', { concept: 'missing/note.md', set: { type: 'Note' } });
  failed.scope = { concepts: ['missing/note.md'] };
  assert.equal(run(failed).response.result, 'failed/incomplete');
});

test('mode, scope, ownership, evidence, and semantic gates block only the request', (t) => {
  const root = bundle(t);
  concept(root);
  const cases = [
    ['missing mode', () => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n'), 'PROJECT_MODE_INVALID'],
    ['invalid mode', () => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "other"\n---\n# Bundle\n'), 'PROJECT_MODE_INVALID'],
    ['conflicting mode', () => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\nproject_mode: "code-backed"\n---\n# Bundle\n'), 'PROJECT_MODE_INVALID'],
  ];
  for (const [, setup, code] of cases) {
    setup();
    const response = run(request(root, 'okf-write', 'revise')).response;
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, code);
    assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8').includes('After'), false);
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  }
  assert.equal(run(request(root, 'okf-write', 'revise', { evidence: [] })).response.data.code, 'EVIDENCE_REQUIRED');
  const invalidScope = request(root, 'okf-write', 'revise'); invalidScope.scope = { concepts: ['other.md'] };
  assert.equal(run(invalidScope).response.data.code, 'INVALID_SCOPE');
  assert.equal(run(request(root, 'okf-write', 'revise', { set: { huge: 1e21 } })).response.result, 'blocked');

  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-53-outside-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  const ownership = request(root, 'okf-write', 'revise', { bundle: outside });
  assert.equal(run(ownership).response.data.code, 'WRITE_OWNERSHIP_UNKNOWN');
});

test('unknown operations differ from unsupported bounded effects and no state files are created', (t) => {
  const root = bundle(t, 'code-backed');
  concept(root);
  const unknown = run(request(root, 'okf-write', 'archive')).response;
  assert.equal(unknown.data.code, 'UNKNOWN_OPERATION');
  const recoverable = run(request(root, 'okf-write', 'revise', { code_recoverable: true })).response;
  assert.equal(recoverable.data.code, 'CODE_RECOVERABLE_MATERIAL');
  const unsupported = run(request(root, 'okf-write', 'revise', { set: { status: 'stable' } })).response;
  assert.equal(unsupported.data.code, 'UNSUPPORTED_INPUT');
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes('guard') || name.includes('ledger') || name.includes('manifest')), []);
});
