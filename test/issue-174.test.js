/*
Issue #174 (decision #167) — write evidence is an observation binding between
material the resolution actually read and one exact mutation, checked at the
wrapper process seam. A binding is `{ path, sha256 }`, the path relative to the
active Git worktree. The runtime checks only what it can observe: a regular
readable file, real-path containment in the worktree, and the exact bytes still
hashing to the accepted digest. Semantic support is never checked here, and
non-file evidence (a human statement, a tool result) never crosses this seam.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { binding, runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');

const writeWrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');
const setupWrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

const DIGEST = 'a'.repeat(64);

function repo(t, prefix = 'okf-174-') {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'source.md'), '# Source\n\nThe observed material.\n');
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  fs.writeFileSync(path.join(root, 'related.md'), '---\ntype: Note\ntitle: Related\n---\n# Related\n');
  return root;
}

function request(root, operation, payload = {}, scope) {
  const concept = payload.concept || 'note.md';
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation,
    task_kind: 'fix',
    invocation: 'explicit',
    scope: scope || { concepts: [concept] },
    payload: { cwd: root, bundle: root, concept, set: { title: 'After' }, ...payload },
  };
}

function run(value) {
  return runWrapper(writeWrapper, value);
}

// ------------------------------------------------------------ a matched binding

test('one matched file binding applies the write and is listed in data.evidence', (t) => {
  const root = repo(t);
  const source = binding(root, path.join('docs', 'source.md'));

  const response = run(request(root, 'revise', { evidence: [source] }));

  assert.equal(response.result, 'applied');
  assert.deepEqual(response.data.evidence, [source]);
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: After/);
});

test('a binding outside the bundle but inside the active worktree is valid material', (t) => {
  const root = temporaryRoot(t, 'okf-174-nested-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, 'okf');
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.writeFileSync(path.join(root, 'okf', 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  fs.writeFileSync(path.join(root, 'OUTSIDE.md'), '# Migration source\n');

  const source = binding(root, 'OUTSIDE.md');
  const value = request(root, 'revise', { evidence: [source] });
  value.payload.bundle = path.join(root, 'okf');

  const response = run(value);
  assert.equal(response.result, 'applied');
  assert.deepEqual(response.data.evidence, [source]);
});

// ------------------------------------------------------------- malformed input

test('a string entry, an absolute path, a "..", and a malformed digest are UNSUPPORTED_INPUT', (t) => {
  const root = repo(t);
  const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
  const cases = [
    ['string entry', 'docs/source.md'],
    ['null entry', null],
    ['absolute path', { path: path.join(root, 'docs', 'source.md'), sha256: DIGEST }],
    ['parent segment', { path: '../source.md', sha256: DIGEST }],
    ['empty path', { path: '', sha256: DIGEST }],
    ['short digest', { path: 'docs/source.md', sha256: 'abc' }],
    ['uppercase digest', { path: 'docs/source.md', sha256: 'A'.repeat(64) }],
    ['missing digest', { path: 'docs/source.md' }],
  ];
  for (const [label, entry] of cases) {
    const response = run(request(root, 'revise', { evidence: [entry] }));
    assert.equal(response.result, 'blocked', label);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', label);
    assert.deepEqual(response.data.evidence, [], label);
  }
  const notAList = run(request(root, 'revise', { evidence: 'docs/source.md' }));
  assert.equal(notAList.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before);
});

// -------------------------------------------------- unavailable file observations

test('a missing file is EVIDENCE_UNAVAILABLE', (t) => {
  const root = repo(t);
  const response = run(request(root, 'revise', { evidence: [{ path: 'docs/absent.md', sha256: DIGEST }] }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'EVIDENCE_UNAVAILABLE');
});

test('a directory is EVIDENCE_UNAVAILABLE: a binding requires a regular file', (t) => {
  const root = repo(t);
  const response = run(request(root, 'revise', { evidence: [{ path: 'docs', sha256: DIGEST }] }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'EVIDENCE_UNAVAILABLE');
});

test('an unreadable file is EVIDENCE_UNAVAILABLE', (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip('root reads a mode 000 file');
    return;
  }
  const root = repo(t);
  const source = binding(root, path.join('docs', 'source.md'));
  fs.chmodSync(path.join(root, 'docs', 'source.md'), 0o000);
  try {
    const response = run(request(root, 'revise', { evidence: [source] }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'EVIDENCE_UNAVAILABLE');
  } finally {
    fs.chmodSync(path.join(root, 'docs', 'source.md'), 0o644);
  }
});

// ------------------------------------------------------------- worktree escape

test('a binding reached through a symbolic link that leaves the worktree is SYMLINK_ESCAPE', (t) => {
  const root = repo(t);
  const outside = temporaryRoot(t, 'okf-174-outside-');
  fs.writeFileSync(path.join(outside, 'material.md'), '# Elsewhere\n');
  fs.symlinkSync(path.join(outside, 'material.md'), path.join(root, 'linked.md'));

  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(outside, 'material.md'))).digest('hex');
  const response = run(request(root, 'revise', { evidence: [{ path: 'linked.md', sha256: sha }] }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'SYMLINK_ESCAPE');
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: Before/);
});

// --------------------------------------------------------------- changed bytes

test('bytes that no longer hash to the accepted identity are EVIDENCE_CHANGED', (t) => {
  const root = repo(t);
  const source = binding(root, path.join('docs', 'source.md'));
  fs.writeFileSync(path.join(root, 'docs', 'source.md'), '# Source\n\nRewritten after the proposal was accepted.\n');

  const response = run(request(root, 'revise', { evidence: [source] }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'EVIDENCE_CHANGED');
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: Before/);
});

// ------------------------------------------------- proposal-only claim writes

test('a claim write with an empty file-binding list is valid: proposal evidence never crosses this seam', (t) => {
  const root = repo(t);

  const revised = run(request(root, 'revise', { evidence: [] }));
  assert.equal(revised.result, 'applied');
  assert.deepEqual(revised.data.evidence, []);

  const created = run(request(root, 'create', {
    concept: 'new.md', evidence: [], set: { type: 'Note', title: 'Fresh' },
  }));
  assert.equal(created.result, 'applied');
  assert.deepEqual(created.data.evidence, []);

  const related = run(request(root, 'relationship', {
    evidence: [], set: { sources: [{ resource: 'related.md' }] },
  }));
  assert.equal(related.result, 'applied', JSON.stringify(related.findings));
});

test('format and an omitted evidence key need no binding at all', (t) => {
  const root = repo(t);
  const formatted = run(request(root, 'format', { set: {} }));
  assert.equal(formatted.result, 'applied');
  assert.deepEqual(formatted.data.evidence, []);
});

// ------------------------------------------------------------- machine-verify

test('machine-verify without a qualifying file binding is EVIDENCE_REQUIRED', (t) => {
  const root = repo(t);
  const verify = { verified: [{ kind: 'machine', by: 'check', coverage: 'complete-current-concept' }] };

  const empty = run(request(root, 'machine-verify', { evidence: [], set: verify }));
  assert.equal(empty.result, 'blocked');
  assert.equal(empty.data.code, 'EVIDENCE_REQUIRED');

  const omitted = run(request(root, 'machine-verify', { set: verify }));
  assert.equal(omitted.data.code, 'EVIDENCE_REQUIRED');

  const bound = run(request(root, 'machine-verify', {
    evidence: [binding(root, path.join('docs', 'source.md'))], set: verify,
  }));
  assert.equal(bound.result, 'applied');
});

// ------------------------------------------------------- one source, many concepts

test('one source file binds to more than one concept: uniqueness is not a validity rule', (t) => {
  const root = repo(t);
  const source = binding(root, path.join('docs', 'source.md'));

  for (const concept of ['first.md', 'second.md']) {
    const response = run(request(root, 'create', {
      concept, evidence: [source], set: { type: 'Note', title: concept },
    }));
    assert.equal(response.result, 'applied', concept);
    assert.deepEqual(response.data.evidence, [source], concept);
  }
});

// ---------------------------------------------------------- response contract

test('evidence_limits always states the two things the runtime does not verify', (t) => {
  const root = repo(t);
  const response = run(request(root, 'revise', { evidence: [binding(root, path.join('docs', 'source.md'))] }));
  assert.deepEqual(response.evidence_limits, {
    writes: 'not serialized',
    crash_recovery: 'not provided',
    semantic_support: 'not runtime-verified',
    non_file_evidence: 'accepted proposal only',
  });
});

// ------------------------------------------------------------ setup publication

function migrationRepo(t) {
  const root = temporaryRoot(t, 'okf-174-publish-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, 'okf');
  fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# Original A\n');
  return root;
}

function stagedRef(root, concept, sources) {
  const file = path.join(root, '.okf-staging', 'okf', `${concept}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\ntype: Decision\n---\n# A\n\nBody text.\n');
  return { path: 'docs/a.md', concept, type: 'Decision', shard: 'x', file: path.relative(root, file), sources };
}

function publish(root, staged) {
  return runWrapper(setupWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'publish',
    payload: { cwd: root, task_kind: 'feature work', staged },
  });
}

test('publish binds each concept to its actual source file, and one source serves a split', (t) => {
  const root = migrationRepo(t);
  const source = binding(root, path.join('docs', 'a.md'));
  const staged = [
    stagedRef(root, 'decisions/a', [source]),
    stagedRef(root, 'decisions/b', [source]),
  ];

  const response = publish(root, staged);

  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.published, ['decisions/a', 'decisions/b']);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'a.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'b.md')), true);
});

test('publish carries the real binding to the write gate: a stale source identity blocks the concept', (t) => {
  const root = migrationRepo(t);
  const staged = [stagedRef(root, 'decisions/a', [{ path: 'docs/a.md', sha256: DIGEST }])];

  const response = publish(root, staged);

  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, []);
  assert.ok(response.findings.some((finding) => finding.code === 'EVIDENCE_CHANGED'), JSON.stringify(response.findings));
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'a.md')), false);
});
