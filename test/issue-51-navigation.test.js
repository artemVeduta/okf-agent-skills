const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bundle, repository } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const runtime = require(path.join(repo, 'scripts', 'lib', 'runtime'));
const defaultServices = require(path.join(repo, 'scripts', 'lib', 'services'));

function navigationRepository(t) {
  const root = repository(t, 'okf-51-');
  bundle(root);
  return root;
}

function writeConcept(root, relative, frontmatter, body) {
  const file = path.join(root, relative);
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n${body}\n`);
  return file;
}

function searchRequest(root, query, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation: 'search',
    payload: {
      cwd: root,
      bundle: root,
      candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
      query,
      ...extra,
    },
  };
}

test('search explicitly includes a deprecated concept with a warning and preserves the index', (t) => {
  const root = navigationRepository(t);
  const index = path.join(root, 'index.md');
  const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');
  const before = fs.readFileSync(index);

  const response = runtime.run(
    'okf-read',
    searchRequest(root, 'legacy-query', { include_deprecated: true }),
    { ...defaultServices, search: () => [deprecated] },
  );

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.read.map((record) => record.path), ['old.md']);
  assert.deepEqual(response.findings, [{
    code: 'unreadable',
    origin: 'suite',
    severity: 'warning',
    blocks: false,
    detail: { gate: 'navigation', path: 'old.md', reason: 'deprecated_concept' },
  }]);
  assert.deepEqual(fs.readFileSync(index), before);
});

test('ordinary search excludes observed deprecated concepts and preserves the index', (t) => {
  const root = navigationRepository(t);
  const index = path.join(root, 'index.md');
  const current = writeConcept(root, 'current.md', 'type: Note\nstatus: current', '# Current');
  const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');
  const before = fs.readFileSync(index);

  const response = runtime.run(
    'okf-read',
    searchRequest(root, 'ordinary-query'),
    { ...defaultServices, search: () => [current, deprecated] },
  );

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.read.map((record) => record.path), ['current.md']);
  assert.equal(response.findings.some((item) => item.detail && item.detail.reason === 'deprecated_concept'), false);
  assert.deepEqual(fs.readFileSync(index), before);
});

test('a deprecated-only query and non-literal opt-in exclude observed deprecated concepts', (t) => {
  const root = navigationRepository(t);
  const index = path.join(root, 'index.md');
  const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');

  for (const payload of [{}, { include_deprecated: 'true' }]) {
    const before = fs.readFileSync(index);
    const response = runtime.run(
      'okf-read',
      searchRequest(root, 'deprecated', payload),
      { ...defaultServices, search: () => [deprecated] },
    );

    assert.equal(response.result, 'ok');
    assert.equal(response.data.match, 'no match in searched scope');
    assert.deepEqual(response.data.read, []);
    assert.equal(response.findings.some((item) => item.detail && item.detail.reason === 'deprecated_concept'), false);
    assert.deepEqual(fs.readFileSync(index), before);
  }
});

test('search with unobserved status is degraded and preserves the index', (t) => {
  const root = navigationRepository(t);
  const index = path.join(root, 'index.md');
  const concept = writeConcept(root, 'unknown.md', 'type: Note', '# Unknown');
  const before = fs.readFileSync(index);

  const response = runtime.run(
    'okf-read',
    searchRequest(root, 'unknown-query'),
    { ...defaultServices, search: () => [concept] },
  );

  assert.equal(response.result, 'degraded');
  assert.equal(response.data.coverage, 'non-exhaustive');
  assert.equal(response.data.archive_predicate, 'unevaluated');
  assert.deepEqual(response.data.read.map((record) => record.path), ['unknown.md']);
  assert.deepEqual(fs.readFileSync(index), before);
});
