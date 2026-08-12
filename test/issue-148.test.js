const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  NO_MIGRATION, acceptedMigration, runWrapper, spawnWrapper, temporaryRoot,
} = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-148-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function stage(root, relative, content, bundle = 'okf') {
  const file = path.join(root, '.okf-staging', bundle, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// The source a migration output was accepted for has to exist on disk: #180's gate
// recomputes its observation binding from its current bytes rather than trusting the
// digest a staged ref recorded, so a fixture that never wrote the source is a
// fixture whose binding can never hold.
function source(root, relative, content = '# Original\n') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return relative;
}

const reviewed = { performed: true };
const notReviewed = { performed: false };

// #180: the accepted proposal replaced `payload.plan` here outright. A source's
// disposition is now read from the one table its user accepted, never from
// `migration-plan`'s own upstream projection of it.
function skipped(sourcePath, reason) {
  return { path: sourcePath, reason };
}

function request(root, payload = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: { cwd: root, ...payload },
  };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function findingCodes(response) {
  return response.findings.map((item) => item.code);
}

// -------------------------------------------------------------- clean bundle

test('a clean staged bundle validates: complete, publishable, no findings', (t) => {
  const root = repo(t);
  source(root, 'docs/a.md');
  stage(root, 'decisions/a.md', '---\ntype: Decision\nstatus: draft\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    ...acceptedMigration(root, [{ source: 'docs/a.md', concept: 'decisions/a', type: 'Decision' }]),
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.equal(response.data.publishable, true);
  assert.deepEqual(response.data.missing_disposition, []);
  assert.deepEqual(response.data.conformance, { checked: true, findings: 0 });
  assert.deepEqual(response.data.semantic_fidelity, { assessed: true });
  assert.deepEqual(response.findings, []);
});

// --------------------------------------------------------------- structural

test('unparseable frontmatter in a staged concept blocks', (t) => {
  const root = repo(t);
  source(root, 'docs/a.md');
  stage(root, 'decisions/a.md', '---\ntype: Decision\n: malformed\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    ...acceptedMigration(root, [{ source: 'docs/a.md', concept: 'decisions/a', type: 'Decision' }]),
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.publishable, false);
  const finding = response.findings.find((item) => item.code === 'FRONTMATTER_UNPARSEABLE');
  assert.ok(finding);
  assert.equal(finding.blocks, true);
  assert.equal(finding.detail.path, 'decisions/a.md');
});

test('a staged concept with no type blocks', (t) => {
  const root = repo(t);
  source(root, 'docs/a.md');
  stage(root, 'decisions/a.md', '---\ntitle: A\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    ...acceptedMigration(root, [{ source: 'docs/a.md', concept: 'decisions/a', type: 'Decision' }]),
    semantic_review: reviewed,
  }));

  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.publishable, false);
  assert.deepEqual(
    response.findings.find((item) => item.code === 'TYPE_MISSING'),
    { code: 'TYPE_MISSING', origin: 'okf', severity: 'error', blocks: true, detail: { path: 'decisions/a.md' } },
  );
});

// dogfood: `okf/releases/index.md` on this very repo wrongly carries concept
// frontmatter although a nested `index.md` is reserved navigation (#131).
test('a nested index.md carrying concept frontmatter is caught, the dogfood case', (t) => {
  const root = repo(t);
  stage(root, 'releases/index.md', '---\ntitle: Releases\ntype: Index\n---\n# Releases\n');

  const response = run(request(root, {
    selected: [],
    ...NO_MIGRATION,
    semantic_review: reviewed,
  }));

  assert.equal(response.data.status, 'partial');
  const finding = response.findings.find((item) => item.code === 'BUNDLE_FILES_NONCONFORMING');
  assert.ok(finding);
  assert.equal(finding.blocks, true);
  assert.equal(finding.detail.file, 'releases/index.md');
});

test('an Attested Computation staged without runtime blocks', (t) => {
  const root = repo(t);
  source(root, 'docs/computation.md');
  stage(root, 'computation.md', '---\ntype: Attested Computation\n---\n# Computation\n');

  const response = run(request(root, {
    selected: ['docs/computation.md'],
    ...acceptedMigration(root, [{ source: 'docs/computation.md', concept: 'computation', type: 'Attested Computation' }]),
    semantic_review: reviewed,
  }));

  assert.equal(response.data.status, 'partial');
  assert.deepEqual(
    response.findings.find((item) => item.code === 'RUNTIME_MISSING'),
    { code: 'RUNTIME_MISSING', origin: 'okf', severity: 'error', blocks: true, detail: { path: 'computation.md' } },
  );
});

// -------------------------------------------------------------- completeness

test('a source with no disposition fails completeness while a deliberately-filtered code-backed source does not', (t) => {
  const root = repo(t);
  // Nothing needs to be staged: `docs/b.md` was intentionally filtered out
  // (code-recoverable, #131), so `assemble` never produced a concept for it.
  fs.mkdirSync(path.join(root, '.okf-staging', 'okf'), { recursive: true });

  const response = run(request(root, {
    selected: ['docs/a.md', 'docs/b.md'],
    // `docs/a.md` has no row at all -- silently fell off the accepted proposal.
    ...acceptedMigration(root, [], { skipped: [skipped('docs/b.md', 'code_recoverable')] }),
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.publishable, false);
  assert.deepEqual(response.data.missing_disposition, ['docs/a.md']);
  const finding = response.findings.find((item) => item.code === 'SOURCE_DISPOSITION_MISSING');
  assert.ok(finding);
  assert.equal(finding.blocks, true);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.detail.path, 'docs/a.md');
  assert.equal(findingCodes(response).filter((code) => code === 'SOURCE_DISPOSITION_MISSING').length, 1);
});

// -------------------------------------------------------------- link integrity

test('a broken link in a staged concept warns, and never blocks publication on its own', (t) => {
  const root = repo(t);
  source(root, 'docs/a.md');
  stage(root, 'decisions/a.md', '---\ntype: Decision\nstatus: draft\nsources:\n  - resource: missing.md\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    ...acceptedMigration(root, [{
      source: 'docs/a.md', concept: 'decisions/a', type: 'Decision', provenance: [{ resource: 'missing.md' }],
    }]),
    semantic_review: reviewed,
  }));

  assert.equal(response.data.status, 'complete');
  assert.equal(response.data.publishable, true);
  const finding = response.findings.find((item) => item.code === 'UNRESOLVED_INTERNAL_LINK');
  assert.ok(finding);
  assert.equal(finding.blocks, false);
  assert.equal(finding.severity, 'warning');
});

// ----------------------------------------------------------- semantic fidelity

test('a structurally clean bundle still reports semantic fidelity as not assessed when no human review is declared', (t) => {
  const root = repo(t);
  source(root, 'docs/a.md');
  stage(root, 'decisions/a.md', '---\ntype: Decision\nstatus: draft\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    ...acceptedMigration(root, [{ source: 'docs/a.md', concept: 'decisions/a', type: 'Decision' }]),
    semantic_review: notReviewed,
  }));

  // Structurally spotless -- no missing disposition, no structural finding --
  // and still, publication readiness never implies semantic fidelity.
  assert.equal(response.data.status, 'complete');
  assert.equal(response.data.publishable, true);
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
  assert.deepEqual(response.findings, [
    { code: 'semantic_fidelity_not_assessed', origin: 'suite', severity: 'warning', blocks: false, detail: { scope: 'bundle' } },
  ]);
});

// -------------------------------------------------------------------- shape

test('rejects a missing or malformed accepted proposal, navigation, staged set or review, and a missing or malformed semantic_review', (t) => {
  const root = repo(t);
  const base = { selected: [], ...NO_MIGRATION, semantic_review: reviewed };

  // #180: every field the conformance gate runs on is required outright. There is
  // no default for any of them, because a default would be an invented answer to a
  // row the accepted proposal already settled.
  const malformed = {
    'no proposal at all': { proposal: undefined },
    // The plan is `propose`'s own upstream and never stands in for what was
    // accepted: a payload carrying it and nothing else is refused exactly as one
    // carrying neither is.
    'the plan instead of the accepted proposal': {
      proposal: undefined,
      plan: { entries: [{ path: 'x.md', disposition: 'migrate', reason: 'type_preserved', concept: 'x', type: 'Decision' }], executable: true },
    },
    'a proposal missing its groups table': { proposal: { sources: [], outputs: [] } },
    'a proposal that is not an object': { proposal: [] },
    'no navigation': { navigation: undefined },
    'a navigation row with no body': { navigation: [{ path: 'decisions/index.md' }] },
    'no staged set': { staged: undefined },
    'a staged ref with no concept': { staged: [{ file: '.okf-staging/okf/a.md' }] },
    'no review': { review: undefined },
    'a review missing its source verdicts': { review: { outputs: [] } },
  };

  for (const [name, override] of Object.entries(malformed)) {
    const response = run(request(root, { ...base, ...override }));
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
  }

  for (const semantic_review of [undefined, {}, { performed: 'yes' }, null]) {
    const payload = { ...base, semantic_review };
    const response = run(request(root, payload));
    assert.equal(response.result, 'blocked', JSON.stringify(semantic_review));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(semantic_review));
  }
});

// -------------------------------------------------------------- wrapper wiring

test('migration-validate reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
  const outside = temporaryRoot(t, 'okf-148-no-repo-');
  const bare = { ...NO_MIGRATION, selected: [], semantic_review: reviewed };
  assert.equal(run(request(outside, bare)).result, 'not-configured');

  const root = repo(t);
  const result = spawnWrapper(wrapper, { ...request(root, bare), invocation: 'automatic' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('the generic okf router reaches migration-validate too, bypassing the activation gate', (t) => {
  const root = repo(t);
  const response = runWrapper(routerWrapper, {
    ...request(root, { ...NO_MIGRATION, selected: [], semantic_review: reviewed }),
    skill: 'okf',
  });
  assert.equal(response.skill, 'okf');
  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
});

test('rejects a structurally missing payload.cwd at the protocol layer, before the runtime', (t) => {
  const result = spawnWrapper(wrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: { ...NO_MIGRATION, selected: [], semantic_review: reviewed },
  });
  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
});
