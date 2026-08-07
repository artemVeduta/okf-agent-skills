const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

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

const reviewed = { performed: true };
const notReviewed = { performed: false };

// One entry mirroring `migration-plan`'s own `data.plan.entries` shape
// (#144), the exact input `partition` already demands and this operation
// reuses via `validPartitionPlan` rather than inventing a second schema.
function migrate(sourcePath, concept, type = 'Decision', reason = 'type_preserved') {
  return { path: sourcePath, disposition: 'migrate', reason, concept, type };
}
function skip(sourcePath, reason) {
  return { path: sourcePath, disposition: 'skip', reason, concept: null, type: null };
}

function plan(entries) {
  return { entries, executable: true };
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
  stage(root, 'decisions/a.md', '---\ntype: Decision\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    plan: plan([migrate('docs/a.md', 'decisions/a')]),
    semantic_review: reviewed,
  }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.equal(response.data.publishable, true);
  assert.deepEqual(response.data.missing_disposition, []);
  assert.deepEqual(response.data.semantic_fidelity, { assessed: true });
  assert.deepEqual(response.findings, []);
});

// --------------------------------------------------------------- structural

test('unparseable frontmatter in a staged concept blocks', (t) => {
  const root = repo(t);
  stage(root, 'decisions/a.md', '---\ntype: Decision\n: malformed\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    plan: plan([migrate('docs/a.md', 'decisions/a')]),
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
  stage(root, 'decisions/a.md', '---\ntitle: A\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    plan: plan([migrate('docs/a.md', 'decisions/a')]),
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
    plan: plan([]),
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
  stage(root, 'computation.md', '---\ntype: Attested Computation\n---\n# Computation\n');

  const response = run(request(root, {
    selected: ['docs/computation.md'],
    plan: plan([migrate('docs/computation.md', 'computation', 'Attested Computation')]),
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
    // `docs/a.md` has no entry at all -- silently fell off the plan.
    plan: plan([skip('docs/b.md', 'code_recoverable')]),
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
  stage(root, 'decisions/a.md', '---\ntype: Decision\nsources:\n  - resource: missing.md\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    plan: plan([migrate('docs/a.md', 'decisions/a')]),
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
  stage(root, 'decisions/a.md', '---\ntype: Decision\n---\n# A\n');

  const response = run(request(root, {
    selected: ['docs/a.md'],
    plan: plan([migrate('docs/a.md', 'decisions/a')]),
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

test('rejects a missing or non-executable plan, and a missing or malformed semantic_review', (t) => {
  const root = repo(t);
  const base = { selected: [] };

  const missingPlan = run(request(root, { ...base, semantic_review: reviewed }));
  assert.equal(missingPlan.result, 'blocked');
  assert.equal(missingPlan.data.code, 'UNSUPPORTED_INPUT');

  const openQuestion = run(request(root, {
    ...base,
    plan: { entries: [{ path: 'x.md', disposition: 'blocked_pending_decision', reason: 'type_not_inferable', concept: null, type: null }], executable: false },
    semantic_review: reviewed,
  }));
  assert.equal(openQuestion.result, 'blocked');
  assert.equal(openQuestion.data.code, 'UNSUPPORTED_INPUT');

  for (const semantic_review of [undefined, {}, { performed: 'yes' }, null]) {
    const payload = { ...base, plan: plan([]) };
    if (semantic_review !== undefined) payload.semantic_review = semantic_review;
    const response = run(request(root, payload));
    assert.equal(response.result, 'blocked', JSON.stringify(semantic_review));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(semantic_review));
  }
});

// -------------------------------------------------------------- wrapper wiring

test('migration-validate reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
  const outside = temporaryRoot(t, 'okf-148-no-repo-');
  const bare = { plan: plan([]), selected: [], semantic_review: reviewed };
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
    ...request(root, { plan: plan([]), selected: [], semantic_review: reviewed }),
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
    payload: { plan: plan([]), selected: [], semantic_review: reviewed },
  });
  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
});
