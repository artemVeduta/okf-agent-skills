const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { assertEnvelope, bundle, repository, treeHash } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-review.js');

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
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
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
