const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');

// `report` runs without a valid `.okf-active` marker, like `inspect`/`plan`/
// `aggregate` (#133/#135/#138), so this builds a bare Git repository directly.
function repo(t) {
  return temporaryRoot(t, 'okf-136-repo-');
}

function git(root) {
  fs.mkdirSync(path.join(root, '.git'));
}

function reportRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'report', payload: { cwd: root, ...payload } };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function migrated(src, concept, sourcesDeclared) {
  const item = { path: src, disposition: 'migrated', concept };
  if (sourcesDeclared !== undefined) item.sources_declared = sourcesDeclared;
  return item;
}

function skipped(src, reason) {
  return { path: src, disposition: 'skipped', reason };
}

function ambiguous(src, reason) {
  return { path: src, disposition: 'ambiguous', reason };
}

function residue(src, reason) {
  return { path: src, disposition: 'residue', reason };
}

const reviewed = { performed: true };
const notReviewed = { performed: false };

// -------------------------------------------------------------- clean migration

test('reports the signal set for a clean migration: every source migrated, complete status, no findings', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [
      migrated('docs/a.md', 'decisions/a.md', true),
      migrated('docs/b.md', 'glossary.md', true),
    ],
    links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.summary, {
    sources_total: 2, concepts_created: 2, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0,
  });
  assert.deepEqual(response.data.concepts, [
    { source: 'docs/a.md', concept: 'decisions/a.md', sources_declared: true },
    { source: 'docs/b.md', concept: 'glossary.md', sources_declared: true },
  ]);
  assert.deepEqual(response.data.provenance, { total: 2, with_sources: 2, without_sources: 0 });
  assert.deepEqual(response.data.links, { total: 1, resolved: 1, broken: 0, broken_detail: [] });
  assert.deepEqual(response.data.semantic_fidelity, { assessed: true });
  assert.deepEqual(response.findings, []);
});

// -------------------------------------------------------------- skipped sources

test('reports each skipped source with its reason, as a warning finding, never blocking', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [
      migrated('docs/a.md', 'decisions/a.md'),
      skipped('docs/legacy.md', 'code_recoverable'),
      skipped('docs/dupe.md', 'duplicate_of_docs_a'),
    ],
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.skipped, [
    { source: 'docs/legacy.md', reason: 'code_recoverable' },
    { source: 'docs/dupe.md', reason: 'duplicate_of_docs_a' },
  ]);
  assert.deepEqual(
    response.findings.map((f) => [f.code, f.severity, f.blocks, f.detail.path, f.detail.reason]),
    [
      ['source_skipped', 'warning', false, 'docs/legacy.md', 'code_recoverable'],
      ['source_skipped', 'warning', false, 'docs/dupe.md', 'duplicate_of_docs_a'],
    ],
  );
});

test('a skipped source without a reason is rejected before anything is computed', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [{ path: 'docs/legacy.md', disposition: 'skipped' }],
    semantic_review: reviewed,
  }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});

// ------------------------------------------------------------ unresolved ambiguity

test('an unresolved ambiguity is reported as uncertain, as an error finding, and flips status to partial', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [
      migrated('docs/a.md', 'decisions/a.md'),
      ambiguous('docs/weird.md', 'type_not_inferable'),
    ],
    semantic_review: reviewed,
  }));

  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.ambiguous, [{ source: 'docs/weird.md', reason: 'type_not_inferable' }]);
  const finding = response.findings.find((f) => f.code === 'source_ambiguous');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.blocks, false);
  assert.equal(finding.detail.path, 'docs/weird.md');
});

test('residue is reported inertly, distinct from a skip or an ambiguity, and does not affect status', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [
      migrated('docs/a.md', 'decisions/a.md'),
      residue('docs/legacy.docx', 'unsupported_format'),
    ],
    semantic_review: reviewed,
  }));
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.residue, [{ source: 'docs/legacy.docx', reason: 'unsupported_format' }]);
  assert.deepEqual(response.data.summary.sources_residue, 1);
});

// --------------------------------------------------------- semantic fidelity

test('discloses semantic fidelity as not assessed whenever human review did not happen', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [migrated('docs/a.md', 'decisions/a.md')],
    semantic_review: notReviewed,
  }));
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
  const finding = response.findings.find((f) => f.code === 'semantic_fidelity_not_assessed');
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.detail.scope, 'project');
});

test('a green structural report never implies semantic fidelity: no ambiguity, no skips, still not assessed without review', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [migrated('docs/a.md', 'decisions/a.md', true)],
    links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
    semantic_review: notReviewed,
  }));
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
});

test('semantic_review is required and must be a well-formed object', (t) => {
  const root = repo(t);
  git(root);
  for (const semantic_review of [undefined, {}, { performed: 'yes' }, null, 'true']) {
    const payload = { sources: [migrated('docs/a.md', 'decisions/a.md')] };
    if (semantic_review !== undefined) payload.semantic_review = semantic_review;
    const response = run(reportRequest(root, payload));
    assert.equal(response.result, 'blocked', JSON.stringify(semantic_review));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(semantic_review));
  }
});

// -------------------------------------------------------------- link integrity

test('reports broken links as non-blocking warnings and counts them separately from resolved links', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    sources: [migrated('docs/a.md', 'decisions/a.md')],
    links: [
      { from: 'decisions/a.md', target: 'glossary.md', resolved: true },
      { from: 'decisions/a.md', target: 'missing.md', resolved: false },
    ],
    semantic_review: reviewed,
  }));
  assert.deepEqual(response.data.links, {
    total: 2, resolved: 1, broken: 1, broken_detail: [{ from: 'decisions/a.md', target: 'missing.md' }],
  });
  const finding = response.findings.find((f) => f.code === 'link_broken');
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.blocks, false);
});

// ----------------------------------------------------------- threshold boundary

test('migration_status/status flips from complete to partial exactly at the first ambiguous source, never before', (t) => {
  const root = repo(t);
  git(root);
  const zero = run(reportRequest(root, {
    sources: [migrated('docs/a.md', 'a.md'), skipped('docs/b.md', 'code_recoverable'), residue('docs/c.md', 'unsupported_format')],
    semantic_review: reviewed,
  }));
  assert.equal(zero.data.status, 'complete');

  const one = run(reportRequest(root, {
    sources: [migrated('docs/a.md', 'a.md'), ambiguous('docs/b.md', 'type_not_inferable')],
    semantic_review: reviewed,
  }));
  assert.equal(one.data.status, 'partial');
});

// --------------------------------------------------------------- validation

test('rejects a payload naming neither sources nor packages, and one naming both', (t) => {
  const root = repo(t);
  git(root);
  const neither = run(reportRequest(root, { semantic_review: reviewed }));
  assert.equal(neither.result, 'blocked');
  assert.equal(neither.data.code, 'UNSUPPORTED_INPUT');

  const both = run(reportRequest(root, { sources: [], packages: [], semantic_review: reviewed }));
  assert.equal(both.result, 'blocked');
  assert.equal(both.data.code, 'UNSUPPORTED_INPUT');
});

test('rejects an unknown disposition and a migrated source missing its concept', (t) => {
  const root = repo(t);
  git(root);
  const cases = [
    [{ path: 'docs/a.md', disposition: 'unknown' }],
    [{ path: 'docs/a.md', disposition: 'migrated' }],
    [{ path: 'docs/a.md', disposition: 'migrated', concept: 'a.md', reason: 'should not be here' }],
    [{ path: '', disposition: 'skipped', reason: 'x' }],
  ];
  for (const sources of cases) {
    const response = run(reportRequest(root, { sources, semantic_review: reviewed }));
    assert.equal(response.result, 'blocked', JSON.stringify(sources));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(sources));
  }
});

test('reports not-configured entirely outside a Git repository', (t) => {
  const root = temporaryRoot(t, 'okf-136-no-repo-');
  const response = run(reportRequest(root, { sources: [], semantic_review: reviewed }));
  assert.equal(response.result, 'not-configured');
});

// -------------------------------------------------------------- multi-package

function twoPackageResults() {
  return [
    {
      package: 'foo',
      status: 'ok',
      sources: [migrated('foo/docs/a.md', 'foo/okf/decisions/a.md', true)],
      links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
      semantic_review: reviewed,
    },
    {
      package: 'bar',
      status: 'ok',
      sources: [
        migrated('bar/docs/a.md', 'bar/okf/decisions/a.md'),
        ambiguous('bar/docs/weird.md', 'type_not_inferable'),
      ],
      semantic_review: notReviewed,
    },
  ];
}

test('composes a multi-package report from aggregate-shaped per-package results, summing statistics honestly', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, { packages: twoPackageResults() }));

  assert.equal(response.result, 'ok');
  // "partial" because bar carries an unresolved ambiguity, even though every
  // package's own worker succeeded (open point 6: never silently "complete").
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.summary, {
    sources_total: 3, concepts_created: 2, sources_skipped: 0, sources_ambiguous: 1, sources_residue: 0,
  });
  assert.deepEqual(response.data.provenance, { total: 2, with_sources: 1, without_sources: 1 });
  // Overall semantic fidelity withheld because "bar" was not reviewed, even
  // though "foo" was (never overstate from a partial check).
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });

  const foo = response.data.packages.find((p) => p.package === 'foo');
  assert.equal(foo.status, 'ok');
  assert.equal(foo.migration_status, 'complete');
  const bar = response.data.packages.find((p) => p.package === 'bar');
  assert.equal(bar.status, 'ok');
  assert.equal(bar.migration_status, 'partial');
  assert.deepEqual(bar.ambiguous, [{ source: 'bar/docs/weird.md', reason: 'type_not_inferable' }]);
});

test('a failed package worker is reported plainly, contributes no signals, and forces overall status to partial', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, {
    packages: [
      { package: 'foo', status: 'ok', sources: [migrated('foo/docs/a.md', 'a.md', true)], semantic_review: reviewed },
      { package: 'bar', status: 'failed', reason: 'worker crashed before finishing' },
    ],
  }));
  assert.equal(response.data.status, 'partial');
  const bar = response.data.packages.find((p) => p.package === 'bar');
  assert.deepEqual(bar, { package: 'bar', status: 'failed', reason: 'worker crashed before finishing', warnings: [] });
  // The failed package contributes nothing to the summed statistics; they
  // reflect only what "foo" actually reported.
  assert.deepEqual(response.data.summary, {
    sources_total: 1, concepts_created: 1, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0,
  });
});

test('rejects a failed package result that also carries signal data, a duplicate package name, and an ok result with a reason', (t) => {
  const root = repo(t);
  git(root);
  const cases = [
    [{ package: 'foo', status: 'failed', reason: 'x', sources: [] }],
    [{ package: 'foo', status: 'ok', sources: [], semantic_review: reviewed }, { package: 'foo', status: 'ok', sources: [], semantic_review: reviewed }],
    [{ package: 'foo', status: 'ok', reason: 'should not be here', sources: [], semantic_review: reviewed }],
    [{ package: 'foo', status: 'failed' }],
  ];
  for (const packages of cases) {
    const response = run(reportRequest(root, { packages }));
    assert.equal(response.result, 'blocked', JSON.stringify(packages));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(packages));
  }
});

test('rejects a structurally empty packages array', (t) => {
  const root = repo(t);
  git(root);
  const response = run(reportRequest(root, { packages: [] }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});

// -------------------------------------------------------- automatic + router

test('automatic invocation of report is silent, matching every other setup operation\'s automatic behavior', (t) => {
  const root = repo(t);
  git(root);
  const request = { ...reportRequest(root, { sources: [], semantic_review: reviewed }), invocation: 'automatic' };
  const result = spawnWrapper(wrapper, request);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('the generic okf router reaches report too, bypassing the activation gate', (t) => {
  const root = repo(t);
  git(root);
  const response = runWrapper(routerWrapper, { ...reportRequest(root, { sources: [], semantic_review: reviewed }), skill: 'okf' });
  assert.equal(response.skill, 'okf');
  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
});

test('rejects a structurally missing payload.cwd at the protocol layer, before the runtime', (t) => {
  const result = spawnWrapper(wrapper, { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'report', payload: { sources: [] } });
  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
});
