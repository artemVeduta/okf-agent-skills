const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scripts = path.join(__dirname, '..', 'scripts');
const runtime = require(path.join(scripts, 'lib', 'runtime'));
const services = require(path.join(scripts, 'lib', 'services'));

function bundle(t, mode = 'knowledge-only') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-54-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), `---\nokf_version: "0.2"\nproject_mode: "${mode}"\n---\n# Bundle\n`);
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed\n');
  return root;
}

function concept(root, text = '---\ntype: Note\ntitle: Before\n---\n# Body\n') {
  fs.writeFileSync(path.join(root, 'note.md'), text);
}

function request(root, operation = 'revise', extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation,
    task_kind: 'fix',
    scope: { concepts: [extra.concept || 'note.md'] },
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
  const result = cp.spawnSync(process.execPath, [path.join(scripts, 'okf-write.js')], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function bytes(file) {
  return fs.readFileSync(file);
}

test('writer applies a valid bounded revision and reports planned and actual effects', (t) => {
  const root = bundle(t);
  concept(root);
  const response = run(request(root));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.task_kind, 'fix');
  assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise']);
  assert.deepEqual(response.data.residue, []);
});

test('writer creates a draft without verification from readable evidence', (t) => {
  const root = bundle(t);
  const value = request(root, 'create', { concept: 'new.md', set: { type: 'Note' } });
  value.scope = { concepts: ['new.md'] };
  const response = run(value);
  assert.equal(response.result, 'applied');
  const saved = fs.readFileSync(path.join(root, 'new.md'), 'utf8');
  assert.match(saved, /status: draft/);
  assert.doesNotMatch(saved, /verified:/);
});

test('writer accepts each allowed task kind', (t) => {
  for (const taskKind of ['feature work', 'fix', 'research']) {
    const root = bundle(t);
    concept(root);
    const value = request(root);
    value.task_kind = taskKind;
    assert.equal(run(value).result, 'applied', taskKind);
  }
});

test('writer invalidates verification on a material claim revision and preserves body and unknown frontmatter', (t) => {
  const root = bundle(t);
  const body = '# Exact body\r\n\r\nUnchanged.\r\n';
  concept(root, `---\ntype: Note\ntitle: Before\nunknown:\n  nested: kept\nverified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept\n---\n${body}`);
  const response = run(request(root));
  const saved = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
  assert.equal(response.result, 'applied');
  assert.ok(response.findings.some((finding) => finding.code === 'INLINE_VERIFICATION_INVALIDATED'));
  assert.doesNotMatch(saved, /verified:/);
  assert.match(saved, /nested: kept/);
  assert.ok(saved.endsWith(body));
});

test('writer reports a semantic no-op without publication', (t) => {
  const root = bundle(t);
  concept(root);
  const first = run(request(root));
  assert.equal(first.result, 'applied');
  const before = bytes(path.join(root, 'note.md'));
  const response = run(request(root));
  assert.equal(response.result, 'no-op');
  assert.deepEqual(response.data.actual_effects, []);
  assert.deepEqual(bytes(path.join(root, 'note.md')), before);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.tmp')), []);
});

test('writer blocks every task kind outside the bounded write contract without changes', (t) => {
  const root = bundle(t);
  concept(root);
  const before = bytes(path.join(root, 'note.md'));
  for (const taskKind of [undefined, 'debugging', 'exploration', 'pre-PR synchronization', 'review', 'other']) {
    const value = request(root);
    if (taskKind === undefined) delete value.task_kind;
    else value.task_kind = taskKind;
    const response = run(value);
    const finding = response.findings.find((item) => item.code === 'TASK_KIND_NOT_WRITE_ELIGIBLE');
    assert.equal(response.result, 'blocked', String(taskKind));
    assert.equal(finding.detail.task_kind, taskKind === undefined ? null : taskKind);
    assert.deepEqual(bytes(path.join(root, 'note.md')), before);
  }
});

test('writer blocks root, evidence, mode, and scope gates before publication', (t) => {
  const root = bundle(t);
  concept(root);
  const cases = [
    ['root', () => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.1"\nproject_mode: "knowledge-only"\n---\n'), 'ROOT_DECLARATION_NOT_EXACT'],
    ['mode', () => fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "invalid"\n---\n'), 'PROJECT_MODE_INVALID'],
    ['evidence', () => {}, 'EVIDENCE_REQUIRED', { evidence: [] }],
    ['scope', () => {}, 'INVALID_SCOPE', {}, { concepts: ['other.md'] }],
  ];
  for (const [label, setup, code, extra, scope] of cases) {
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n');
    setup();
    const value = request(root, 'revise', extra);
    if (scope) value.scope = scope;
    const response = run(value);
    assert.ok(response.findings.some((finding) => finding.code === code), label);
    assert.equal(response.data.actual_effects.length, 0, label);
  }
});

test('writer refuses unimplemented mechanical link maintenance', (t) => {
  const root = bundle(t);
  concept(root);
  const before = bytes(path.join(root, 'note.md'));
  const response = run(request(root, 'revise', {
    effects: ['concept-revise', 'mechanical-link-maintenance'],
  }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.deepEqual(response.data.actual_effects, []);
  assert.deepEqual(bytes(path.join(root, 'note.md')), before);
});

test('writer stops before rename when its primary target changes', (t) => {
  const root = bundle(t);
  concept(root);
  const response = runtime.run('okf-write', request(root), {
    ...services,
    publishFile(file, data, expected) {
      fs.writeFileSync(file, '---\ntype: Note\ntitle: Concurrent\n---\n# Body\n');
      services.publishFile(file, data, expected);
    },
  });
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'TARGET_CHANGED');
  assert.deepEqual(response.data.actual_effects, []);
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /Concurrent/);
});

test('writer publishes the primary before derivatives and reports a derivative residue', (t) => {
  const root = bundle(t);
  concept(root);
  fs.writeFileSync(path.join(root, 'log.md'), '---\nkind: Log\n---\n# Log\n');
  const response = runtime.run('okf-write', request(root, 'revise', {
    effects: ['concept-revise', 'log-append'],
  }), {
    ...services,
    publishFile(file, data, expected) {
      if (path.basename(file) === 'log.md') throw new Error('log device failed');
      services.publishFile(file, data, expected);
    },
  });
  assert.equal(response.result, 'failed/incomplete');
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: After/);
  assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise']);
  assert.deepEqual(response.data.residue, [{ effect: 'log-append', reason: 'log device failed' }]);
  assert.ok(response.findings.some((finding) => finding.code === 'DERIVATIVE_WRITE_FAILED'));
});

test('writer reports actual derivatives in requested effect order through the process seam', (t) => {
  const root = bundle(t);
  concept(root);
  fs.writeFileSync(path.join(root, 'log.md'), '---\nkind: Log\n---\n# Log\n');
  const value = request(root, 'revise', {
    effects: ['log-append', 'concept-revise', 'index-maintenance'],
  });
  const response = run(value);
  assert.equal(response.result, 'applied');
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /- \[note.md\]\(note.md\)/);
  assert.match(fs.readFileSync(path.join(root, 'log.md'), 'utf8'), /- revise: \[note.md\]\(note.md\)/);
  assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise', 'log-append', 'index-maintenance']);
  assert.deepEqual(response.data.actual_effects.map((item) => item.inherited), [false, true, true]);
  const repeat = run(value);
  assert.equal(repeat.result, 'no-op');
  assert.equal((fs.readFileSync(path.join(root, 'log.md'), 'utf8').match(/- revise: \[note.md\]\(note.md\)/g) || []).length, 1);
});

test('publishFile removes its temporary file after every failed stage', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-54-publish-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalWrite = fs.writeFileSync;
  const originalRename = fs.renameSync;

  function assertNoTemporary() {
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.tmp')), []);
  }

  const partial = path.join(root, 'partial.md');
  fs.writeFileSync(partial, 'old');
  fs.writeFileSync = (file, data, options) => {
    originalWrite(file, data, options);
    throw new Error('partial write failed');
  };
  try {
    assert.throws(() => services.publishFile(partial, 'new', 'old'), /partial write failed/);
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(fs.readFileSync(partial, 'utf8'), 'old');
  assertNoTemporary();

  const changed = path.join(root, 'changed.md');
  fs.writeFileSync(changed, 'changed');
  assert.throws(() => services.publishFile(changed, 'new', 'old'), { code: 'TARGET_CHANGED' });
  assert.equal(fs.readFileSync(changed, 'utf8'), 'changed');
  assertNoTemporary();

  const rename = path.join(root, 'rename.md');
  fs.writeFileSync(rename, 'old');
  fs.renameSync = () => { throw new Error('rename failed'); };
  try {
    assert.throws(() => services.publishFile(rename, 'new', 'old'), /rename failed/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(fs.readFileSync(rename, 'utf8'), 'old');
  assertNoTemporary();
});
