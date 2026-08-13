/*
Evidence domain: trust tiers and staleness, verification promotion, and the
file-binding digests that write evidence is checked against.

Write evidence (#174, decision #167) is an observation binding between material
the resolution actually read and one exact mutation, checked at the wrapper
process seam. A binding is `{ path, sha256 }`, the path relative to the active
Git worktree. The runtime checks only what it can observe: a regular readable
file, real-path containment in the worktree, and the exact bytes still hashing
to the accepted digest. Semantic support is never checked here, and non-file
evidence (a human statement, a tool result) never crosses this seam.
*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RESPONSE_KEYS,
  assertEnvelope,
  binding,
  bundle,
  repository,
  runWrapper,
  temporaryRoot,
  treeHash,
  writeManifest,
} = require('../../test-support/snapshot');

const reviewWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-review.js');
const writeWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-write.js');

describe('trust tiers, staleness, and review dependencies', () => { // #52
  function rootFor(t) {
    const root = repository(t, 'okf-52-');
    bundle(root);
    return root;
  }

  function write(root, name, contents) {
    fs.writeFileSync(path.join(root, name), contents);
  }

  function concept(root, name = 'concept.md', frontmatter = 'type: Note') {
    write(root, name, `---\n${frontmatter}\n---\n# Concept\n`);
  }

  function request(root, conceptPath = 'concept.md', extra = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-review',
      operation: 'review',
      payload: { cwd: root, bundle: root, concept: conceptPath, ...extra },
    };
  }

  function run(value) {
    const result = childProcess.spawnSync(process.execPath, [reviewWrapper], {
      input: typeof value === 'string' ? value : JSON.stringify(value),
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      response: result.stdout ? JSON.parse(result.stdout) : undefined,
    };
  }

  function review(root, conceptPath = 'concept.md', extra = {}) {
    const before = treeHash(root);
    const result = run(request(root, conceptPath, extra));
    assertEnvelope(result);
    assert.equal(treeHash(root), before);
    return result.response;
  }

  function finding(response, code) {
    return response.findings.find((item) => item.code === code);
  }

  test('review requires cwd, bundle, and concept and accepts an optional ISO today', (t) => {
    const root = rootFor(t);
    concept(root);
    const valid = request(root, 'concept.md', { today: '2026-08-04' });
    const before = treeHash(root);
    assertEnvelope(run(valid));

    for (const [name, payload] of [
      ['cwd', { bundle: root, concept: 'concept.md' }],
      ['bundle', { cwd: root, concept: 'concept.md' }],
      ['concept', { cwd: root, bundle: root }],
      ['today', { cwd: root, bundle: root, concept: 'concept.md', today: '04-08-2026' }],
    ]) {
      const result = run({ ...valid, payload });
      assert.equal(result.status, 64, name);
      assert.equal(result.stdout, '', name);
      assert.notEqual(result.stderr, '', name);
    }
    assert.equal(treeHash(root), before);
  });

  test('review derives trust tiers from complete verification events', (t) => {
    const root = rootFor(t);
    concept(root, 'concept.md', 'type: Note\nverified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept');
    let response = review(root);
    assert.equal(response.data.trust_tier, 'machine-confirmed');

    write(root, 'index.md', '---\nokf_version: "0.2"\nreview_verifiers:\n  - "human: reviewer"\n---\n# Bundle\n');
    concept(root, 'concept.md', 'type: Note\nverified:\n  - kind: human\n    verifier: "human: reviewer"\n    coverage: complete-current-concept');
    response = review(root);
    assert.equal(response.data.trust_tier, 'human-reviewed');

    for (const verified of [
      '"machine: check"',
      '\n  - kind: machine\n    by: check',
      '\n  - kind: human\n    verifier: "human: reviewer"',
    ]) {
      concept(root, 'concept.md', `type: Note\nverified: ${verified}`);
      response = review(root);
      assert.equal(response.data.trust_tier, 'unverified', verified);
    }
  });

  test('a written trust tier blocks review', (t) => {
    const root = rootFor(t);
    concept(root, 'concept.md', 'type: Note\ntrust_tier: human-reviewed');
    const response = review(root);
    assert.equal(response.result, 'blocked');
    assert.ok(finding(response, 'WRITTEN_TRUST_TIER'));
  });

  test('review reports staleness at expiry and after expiry', (t) => {
    const root = rootFor(t);
    concept(root, 'concept.md', 'type: Note\nstale_after: "2026-08-04"');
    assert.equal(review(root, 'concept.md', { today: '2026-08-04' }).data.staleness.state, 'stale');
    assert.equal(review(root, 'concept.md', { today: '2026-08-03' }).data.staleness.state, 'current');
    assert.equal(review(root, 'concept.md', { today: '2026-08-05' }).data.staleness.state, 'stale');
    concept(root);
    assert.equal(review(root, 'concept.md', { today: '2026-08-04' }).data.staleness.state, 'not configured');
  });

  test('review reports each configured review-dependency state without mutation or inheritance', (t) => {
    const root = rootFor(t);
    concept(root);
    write(root, 'evidence.md', 'exact text');
    assert.equal(review(root).data.review_dependencies.state, 'not configured');

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'concept.md': { dependencies: [{ path: 'evidence.md', baseline: 'exact text' }] } },
    }));
    assert.equal(review(root).data.review_dependencies.state, 'clean');
    write(root, 'evidence.md', 'changed text');
    assert.equal(review(root).data.review_dependencies.state, 'changed');

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'concept.md': { dependencies: [{ path: 'missing.md', baseline: 'exact text' }] } },
    }));
    assert.equal(review(root).data.review_dependencies.state, 'unavailable');

    for (const dependency of [{ path: 'https://example.test/evidence', baseline: 'exact text' }, { baseline: 'exact text' }]) {
      write(root, '.okf-review.json', JSON.stringify({ concepts: { 'concept.md': { dependencies: [dependency] } } }));
      assert.equal(review(root).data.review_dependencies.state, 'unobservable');
    }

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'concept.md': { dependencies: [{ path: 'evidence.md' }] } },
    }));
    assert.equal(review(root).data.review_dependencies.state, 'review needed: no baseline');
    concept(root, 'other.md', 'type: Note\nverified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept');
    const other = review(root, 'other.md');
    assert.equal(other.data.trust_tier, 'machine-confirmed');
    assert.equal(other.data.review_dependencies.state, 'not configured');
  });

  test('provenance sources do not create review dependencies or staleness', (t) => {
    const root = rootFor(t);
    concept(root, 'concept.md', 'type: Note\nsources:\n  - resource: evidence.md');
    write(root, 'evidence.md', 'changed text');
    const response = review(root, 'concept.md', { today: '2026-08-04' });
    assert.equal(response.data.review_dependencies.state, 'not configured');
    assert.equal(response.data.staleness.state, 'not configured');
  });
});

describe('verification promotion and dependency-state reporting', () => { // #60
  function bundle(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-60-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    return root;
  }

  function write(root, file, text) {
    fs.writeFileSync(path.join(root, file), text);
  }

  function request(root, concept = 'note.md', extra = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-review',
      operation: 'review',
      payload: { cwd: root, bundle: root, concept, ...extra },
    };
  }

  function review(root, concept, extra = {}) {
    const before = treeHash(root);
    const result = childProcess.spawnSync(process.execPath, [reviewWrapper], {
      input: JSON.stringify(request(root, concept, extra)),
      encoding: 'utf8',
    });
    const response = JSON.parse(result.stdout);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(Object.keys(response), RESPONSE_KEYS);
    assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
    assert.equal(treeHash(root), before);
    return response;
  }

  test('review blocks an unauthenticated human verification without side effects', (t) => {
    const root = bundle(t);
    write(root, 'note.md', '---\ntype: Note\nverified:\n  kind: human\n  verifier: "human: reviewer"\n  coverage: complete-current-concept\n---\n# Note\n');

    const response = review(root, 'note.md');

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.trust_tier, 'unverified');
  });

  test('review blocks invalid human verification without promoting it', (t) => {
    const root = bundle(t);
    write(root, 'note.md', '---\ntype: Note\nverified:\n  - kind: human\n    verifier: "human: reviewer"\n    coverage: partial\n---\n# Note\n');

    const response = review(root, 'note.md');

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.trust_tier, 'unverified');
  });

  test('review derives machine confirmation from bare and list-form verification events', (t) => {
    const root = bundle(t);
    const events = [
      'verified:\n  kind: machine\n  by: check\n  coverage: complete-current-concept',
      'verified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept',
    ];

    for (const verified of events) {
      write(root, 'note.md', `---\ntype: Note\n${verified}\n---\n# Note\n`);
      assert.equal(review(root, 'note.md').data.trust_tier, 'machine-confirmed');
    }
  });

  test('review does not promote written trust tiers or partial machine evidence', (t) => {
    const root = bundle(t);
    write(root, 'note.md', '---\ntype: Note\ntrust_tier: human-reviewed\nverified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept\n---\n# Note\n');
    let response = review(root, 'note.md');
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.trust_tier, 'machine-confirmed');

    write(root, 'note.md', '---\ntype: Note\nverified:\n  - kind: machine\n    by: check\n    coverage: partial\n---\n# Note\n');
    response = review(root, 'note.md');
    assert.equal(response.result, 'no-op');
    assert.equal(response.data.trust_tier, 'unverified');
    assert.ok(response.findings.some((finding) => finding.code === 'UNQUALIFIED_VERIFICATION' && finding.detail.reason === 'incomplete machine coverage'));
  });

  test('review marks stale_after as stale at and after its date', (t) => {
    const root = bundle(t);
    write(root, 'note.md', '---\ntype: Note\nstale_after: "2026-08-04"\n---\n# Note\n');

    assert.equal(review(root, 'note.md', { today: '2026-08-03' }).data.staleness.state, 'current');
    assert.equal(review(root, 'note.md', { today: '2026-08-04' }).data.staleness.state, 'stale');
    assert.equal(review(root, 'note.md', { today: '2026-08-05' }).data.staleness.state, 'stale');
  });

  test('review keeps review-dependency states distinct and reports an absent baseline without writing one', (t) => {
    const root = bundle(t);
    write(root, 'note.md', '---\ntype: Note\n---\n# Note\n');
    write(root, 'evidence.md', 'current evidence\n');

    assert.equal(review(root, 'note.md').data.review_dependencies.state, 'not configured');

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'note.md': { dependencies: [{ path: 'evidence.md', baseline: 'previous evidence\n' }] } },
    }));
    let response = review(root, 'note.md');
    assert.equal(response.data.review_dependencies.state, 'changed');
    assert.equal(response.result, 'review needed');

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'note.md': { dependencies: [{ path: 'missing.md', baseline: 'previous evidence\n' }] } },
    }));
    response = review(root, 'note.md');
    assert.equal(response.data.review_dependencies.state, 'unavailable');
    assert.equal(response.result, 'review needed');

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'note.md': { dependencies: [{ path: 'https://example.test/evidence', baseline: 'previous evidence\n' }] } },
    }));
    response = review(root, 'note.md');
    assert.equal(response.data.review_dependencies.state, 'unobservable');
    assert.equal(response.result, 'failed/incomplete');
    assert.ok(response.findings.some((finding) => finding.code === 'REVIEW_DEPENDENCY_UNOBSERVABLE'));

    write(root, '.okf-review.json', JSON.stringify({
      concepts: { 'note.md': { dependencies: [{ path: 'evidence.md' }] } },
    }));
    assert.equal(review(root, 'note.md').data.review_dependencies.state, 'review needed: no baseline');
  });
});

describe('write-evidence file bindings', () => { // #174
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

  // ---------------------------------------------------------- a matched binding

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

  // ----------------------------------------------------------- malformed input

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

  // ------------------------------------------------ unavailable file observations

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

  // ----------------------------------------------------------- worktree escape

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

  // ------------------------------------------------------------- changed bytes

  test('bytes that no longer hash to the accepted identity are EVIDENCE_CHANGED', (t) => {
    const root = repo(t);
    const source = binding(root, path.join('docs', 'source.md'));
    fs.writeFileSync(path.join(root, 'docs', 'source.md'), '# Source\n\nRewritten after the proposal was accepted.\n');

    const response = run(request(root, 'revise', { evidence: [source] }));

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'EVIDENCE_CHANGED');
    assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: Before/);
  });

  // ----------------------------------------------- proposal-only claim writes

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

  // ----------------------------------------------------------- machine-verify

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

  // ----------------------------------------------------- one source, many concepts

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

  // -------------------------------------------------------- response contract

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
});
