const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RESPONSE_KEYS: responseKeys, treeHash } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-review.js');

function bundle(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-60-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
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
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(request(root, concept, extra)),
    encoding: 'utf8',
  });
  const response = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(Object.keys(response), responseKeys);
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
