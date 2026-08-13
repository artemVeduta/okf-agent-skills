/*
Issue #180 (decisions #131, #156, #174, #195) — the staged bundle is compared
against the accepted proposal before anything is published.

`propose` produces the one target bundle a user accepts; `assemble` stages one
Markdown file per accepted concept beside the bundle. Nothing ever compared the two,
so a worker that dropped a concept, renamed one, stamped the wrong type, rebound a
source, or rewrote a link at a target nobody accepted reached `publish` unchallenged.
The conformance gate is that comparison, and it runs at both seams that can still act
on it: `migration-validate` reports it, and `publish` reruns the identical gate before
its first write rather than trusting that the first one ever ran.

Everything here runs through the `okf-setup` wrapper as a process — the one tested
contract seam — and is deterministic: fixtures on disk, no clock, no network, no
model call.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  acceptedMigration, binding, passingReview, runWrapper, temporaryRoot,
} = require('../test-support/snapshot');
// The staged bytes a fixture writes are the bytes `assemble` itself writes, from the
// one renderer it uses -- never a second copy of that frontmatter shape. That is what
// makes #195's "a migrated Glossary carries no `status`" rule testable here at all: a
// renderer that started stamping one again would fail the clean cases below rather
// than quietly agreeing with a hand-typed fixture. The module has no load-time effect.
const { renderConcept } = require('../scripts/lib/assembly');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function run(value) {
  return runWrapper(wrapper, value);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// The bundle lives at `<root>/okf`, so `.okf-staging/okf/...` and `okf/...` sit side
// by side exactly as they do in a real project. `okf-write`'s own `create` never
// makes a concept's directory, so a fixture that publishes into a group pre-creates
// it, the same way an already-migrated bundle would already carry it.
function repo(t, groups = []) {
  const root = temporaryRoot(t, 'okf-180-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  for (const group of groups) fs.mkdirSync(path.join(root, 'okf', group), { recursive: true });
  return root;
}

/*
 * One accepted migration, on disk. Each row is `{source, concept, type}` plus the
 * optional accepted fields `acceptedMigration` already understands (`content_scope`,
 * `provenance`, `links`) and two fixture-only ones: `body`, the staged Markdown body,
 * and `staged`, the exact staged bytes to write when a case needs bytes that disagree
 * with what the accepted row says.
 *
 * The source file is written because the gate rehashes it: a recorded binding is only
 * ever the thing being checked, never the thing it is checked against.
 */
function migration(root, rows, options = {}) {
  for (const row of rows) {
    write(root, row.source, row.source_body === undefined ? `# Source of ${row.concept}\n` : row.source_body);
    write(root, path.join('.okf-staging', 'okf', `${row.concept}.md`), row.staged === undefined
      ? renderConcept(row.type, row.provenance === undefined ? null : row.provenance, row.body === undefined ? `# ${row.concept}\n` : row.body)
      : row.staged);
  }
  return acceptedMigration(root, rows, options);
}

function decision(source, concept, extra = {}) {
  return { source, concept, type: 'Decision', ...extra };
}

function validate(root, migrated, payload = {}) {
  return run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: { cwd: root, semantic_review: { performed: true }, ...migrated, ...payload },
  });
}

function publish(root, migrated, payload = {}) {
  return run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'publish',
    payload: { cwd: root, task_kind: 'feature work', ...migrated, ...payload },
  });
}

function codes(response) {
  return response.findings.map((item) => item.code);
}

function detailFor(response, code) {
  return response.findings.find((item) => item.code === code).detail;
}

// A conforming migration answers with nothing at all -- which is what makes every
// case below a statement about the one binding it broke.
function assertBlocked(response, expected) {
  assert.deepEqual(codes(response), expected, JSON.stringify(response.findings));
  assert.equal(response.data.publishable, false);
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.conformance, { findings: expected.length });
}

// ------------------------------------------------------------------ conforming

test('a staged bundle that matches the accepted proposal answers with no conformance finding at all', (t) => {
  const root = repo(t);
  const migrated = migration(root, [
    decision('docs/a.md', 'decisions/a'),
    // #195: a migrated Glossary is stable by default and carries no `status`. The
    // staged bytes say so because `assemble` writes them that way, not because
    // anything patches them afterwards.
    { source: 'docs/terms.md', concept: 'terms', type: 'Glossary' },
  ]);

  const response = validate(root, migrated);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.publishable, true);
  assert.deepEqual(response.findings, []);
  assert.deepEqual(response.data.conformance, { findings: 0 });
  assert.equal(fs.readFileSync(path.join(root, '.okf-staging', 'okf', 'terms.md'), 'utf8'), '---\ntype: Glossary\n---\n# terms\n');
});

// ------------------------------------------------------- 1. source dispositions

test('a source whose disposition nobody settled is never silently dropped', (t) => {
  const root = repo(t);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
  // The one value acceptance rules out: a proposal carrying it is one nobody could
  // have accepted.
  migrated.proposal.sources[0].disposition = 'blocked_pending_decision';

  const response = validate(root, migrated);

  assertBlocked(response, ['SOURCE_DISPOSITION_UNRESOLVED']);
  assert.deepEqual(detailFor(response, 'SOURCE_DISPOSITION_UNRESOLVED'), { path: 'docs/a.md', disposition: 'blocked_pending_decision' });
});

// --------------------------------------------------------- 2. the output set

test('a concept the migration dropped and a concept nobody accepted are both reported', (t) => {
  const root = repo(t);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
  const dropped = { ...migrated, staged: [] };

  // Dropped: the accepted proposal names a concept nothing staged. Its verdict is
  // now about a body that does not exist, which is exactly as stale as any other
  // verdict whose artifact moved.
  const droppedResponse = validate(root, dropped);
  assertBlocked(droppedResponse, ['OUTPUT_NOT_STAGED', 'REVIEW_VERDICT_STALE']);
  assert.deepEqual(detailFor(droppedResponse, 'OUTPUT_NOT_STAGED'), { concept: 'decisions/a' });

  // Unproposed: a staged file no accepted output names.
  write(root, '.okf-staging/okf/decisions/extra.md', renderConcept('Decision', null, '# Extra\n'));
  const extra = {
    ...migrated,
    staged: [...migrated.staged, { path: 'docs/a.md', concept: 'decisions/extra', type: 'Decision', shard: 'x', file: '.okf-staging/okf/decisions/extra.md', sources: [] }],
  };
  const extraResponse = validate(root, extra);
  assertBlocked(extraResponse, ['STAGED_OUTPUT_UNPROPOSED']);
  assert.deepEqual(detailFor(extraResponse, 'STAGED_OUTPUT_UNPROPOSED'), { concept: 'decisions/extra' });
});

// ------------------------------------------------------ 3. staged readability

test('a staged file that cannot be read is named once, never as six derived findings', (t) => {
  const root = repo(t);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
  migrated.staged[0].file = '.okf-staging/okf/decisions/gone.md';

  const response = validate(root, migrated);

  // Dimensions 4-10 are skipped for this concept -- no type, path, group, status,
  // binding, provenance or link finding cascades out of the one unreadable file --
  // while its verdict still cannot hold against bytes nobody could read.
  assertBlocked(response, ['STAGED_FILE_INVALID', 'REVIEW_VERDICT_STALE']);
  assert.deepEqual(detailFor(response, 'STAGED_FILE_INVALID'), { concept: 'decisions/a', reason: 'unreadable' });
});

// ------------------------------------------- 4-6. type, target path, and group

test('a proposal row disagreeing with its own staged concept blocks on the exact binding that broke', (t) => {
  const root = repo(t);

  const cases = [
    ['type', (proposal) => { proposal.outputs[0].type = 'Reference'; }, 'OUTPUT_TYPE_MISMATCH',
      { concept: 'decisions/a', proposal_type: 'Reference', staged_ref_type: 'Decision', frontmatter_type: 'Decision' }],
    ['target path', (proposal) => { proposal.outputs[0].target_path = 'elsewhere/a.md'; }, 'OUTPUT_TARGET_PATH_MISMATCH',
      { concept: 'decisions/a', expected: 'elsewhere/a.md', actual: 'decisions/a.md' }],
    ['group', (proposal) => { proposal.outputs[0].group = 'notes'; }, 'OUTPUT_GROUP_MISMATCH',
      { concept: 'decisions/a', proposal_group: 'notes', derived_group: 'decisions' }],
  ];

  for (const [label, mutate, code, detail] of cases) {
    const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
    mutate(migrated.proposal);
    const response = validate(root, migrated);
    assertBlocked(response, [code]);
    assert.deepEqual(detailFor(response, code), detail, label);
  }
});

// ------------------------------------------------------------- 7. group indexes

test('a group index that is absent, hand-edited, or has no accepted purpose each block on their own', (t) => {
  const root = repo(t);
  const rows = [decision('docs/a.md', 'decisions/a')];

  const missing = migration(root, rows);
  missing.navigation = [];
  const missingResponse = validate(root, missing);
  assertBlocked(missingResponse, ['GROUP_INDEX_MISSING']);
  assert.deepEqual(detailFor(missingResponse, 'GROUP_INDEX_MISSING'), { group: 'decisions', index_path: 'decisions/index.md' });

  // Re-derived through `propose`'s own renderer, so a body edited after acceptance
  // is a mismatch rather than a new authority.
  const edited = migration(root, rows);
  edited.navigation[0].body = '# decisions\n\nSomething someone typed later.\n';
  const editedResponse = validate(root, edited);
  assertBlocked(editedResponse, ['GROUP_INDEX_MISMATCH']);
  assert.deepEqual(detailFor(editedResponse, 'GROUP_INDEX_MISMATCH'), { group: 'decisions', index_path: 'decisions/index.md' });

  // A purpose nobody resolved has no body to derive at all: reported, never invented.
  const unresolved = migration(root, rows, { purposes: { decisions: null } });
  const unresolvedResponse = validate(root, unresolved);
  assertBlocked(unresolvedResponse, ['GROUP_PURPOSE_UNRESOLVED']);
  assert.deepEqual(detailFor(unresolvedResponse, 'GROUP_PURPOSE_UNRESOLVED'), { group: 'decisions' });
});

// --------------------------------------------------------- 8. required status

test('#195 is enforced on the staged bytes: a draft Glossary and an unstamped concept both block', (t) => {
  const root = repo(t);

  const stamped = migration(root, [{
    source: 'docs/terms.md', concept: 'terms', type: 'Glossary', staged: '---\nstatus: draft\ntype: Glossary\n---\n# terms\n',
  }]);
  const stampedResponse = validate(root, stamped);
  assertBlocked(stampedResponse, ['OUTPUT_STATUS_MISMATCH']);
  assert.deepEqual(detailFor(stampedResponse, 'OUTPUT_STATUS_MISMATCH'), { concept: 'terms', expected: null, actual: 'draft' });

  const unstamped = migration(root, [decision('docs/a.md', 'decisions/a', { staged: '---\ntype: Decision\n---\n# decisions/a\n' })]);
  const unstampedResponse = validate(root, unstamped);
  assertBlocked(unstampedResponse, ['OUTPUT_STATUS_MISMATCH']);
  assert.deepEqual(detailFor(unstampedResponse, 'OUTPUT_STATUS_MISMATCH'), { concept: 'decisions/a', expected: 'draft', actual: null });
});

// ------------------------------------------------- 9. source observation binding

test('a staged concept bound to a digest its own source never had blocks', (t) => {
  const root = repo(t);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
  const recorded = [{ path: 'docs/a.md', sha256: '0'.repeat(64) }];
  migrated.staged[0].sources = recorded;

  const response = validate(root, migrated);

  assertBlocked(response, ['SOURCE_BINDING_MISMATCH']);
  assert.deepEqual(detailFor(response, 'SOURCE_BINDING_MISMATCH'), {
    concept: 'decisions/a',
    expected: [binding(root, 'docs/a.md')],
    recorded,
  });
});

// ------------------------------------------------ 10. provenance and link targets

test('a staged concept that re-attributed itself blocks', (t) => {
  const root = repo(t);
  // The accepted row carries the provenance the source's own frontmatter declared;
  // the staged bytes dropped it.
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a', {
    provenance: [{ resource: 'docs/a.md' }],
    staged: '---\nstatus: draft\ntype: Decision\n---\n# decisions/a\n',
  })]);

  const response = validate(root, migrated);

  assertBlocked(response, ['PROVENANCE_MISMATCH']);
  assert.deepEqual(detailFor(response, 'PROVENANCE_MISMATCH'), {
    concept: 'decisions/a',
    expected: [{ resource: 'docs/a.md' }],
    actual: null,
  });
});

/*
 * The one provenance shape this comparison could otherwise never agree on, driven
 * through the real operations rather than a hand-written proposal: a source whose own
 * frontmatter declares `sources: []` declares no attribution at all, so the accepted
 * row and the staged bytes must both say so. `assemble`'s renderer writes a `sources`
 * key only for a non-empty list, so an accepted row carrying `[]` would block a
 * correct migration on a mismatch no user could resolve without editing the source.
 */
test('a source declaring an empty provenance list migrates and publishes with no provenance finding', (t) => {
  const root = repo(t);
  write(root, 'docs/a.md', '---\ntype: Decision\nsources: []\n---\n# A\n');

  const sources = run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } }).data.sources;
  const plan = run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources } }).data.plan;
  const accepted = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'propose',
    payload: { cwd: root, plan: { entries: plan.entries, executable: plan.executable }, selected: sources, decision: 'accept' },
  }).data;

  assert.equal(accepted.proposal.outputs[0].provenance, null);
  assert.equal(accepted.proposal.outputs[0].provenance_assignment, 'none');

  // Staged through the same renderer and the same approved mapping `assemble` uses,
  // so the two sides of the comparison are the two the migration really produces.
  const mapped = accepted.mapping[0];
  write(root, '.okf-staging/okf/a.md', renderConcept(mapped.type, mapped.sources, mapped.body));
  const staged = [{
    path: mapped.path,
    concept: mapped.concept,
    type: mapped.type,
    shard: 'x',
    file: path.join('.okf-staging', 'okf', 'a.md'),
    sources: [binding(root, 'docs/a.md')],
  }];
  const migrated = {
    proposal: accepted.proposal,
    navigation: accepted.navigation,
    staged,
    review: passingReview(root, accepted.proposal, staged),
  };

  const validated = validate(root, migrated);
  assert.equal(validated.data.publishable, true, JSON.stringify(validated.findings));

  const published = publish(root, migrated);
  assert.equal(published.result, 'ok', JSON.stringify(published.findings));
  assert.deepEqual(published.data.published, ['a']);
  assert.equal(fs.readFileSync(path.join(root, 'okf', 'a.md'), 'utf8'), '---\nstatus: draft\ntype: Decision\n---\n# A\n');
});

test('an accepted link rewrite the staged body lost, and a link at a target nobody bound, both block', (t) => {
  const root = repo(t);
  const rewritten = [{ target_source: 'docs/b.md', target_concept: 'decisions/b', decision: 'rewritten' }];

  // Lost: the migration promised to preserve this relationship and did not.
  const lost = migration(root, [
    decision('docs/a.md', 'decisions/a', { links: rewritten }),
    decision('docs/b.md', 'decisions/b'),
  ]);
  const lostResponse = validate(root, lost);
  assertBlocked(lostResponse, ['LINK_TARGET_MISMATCH']);
  assert.deepEqual(detailFor(lostResponse, 'LINK_TARGET_MISMATCH'), { concept: 'decisions/a', unexpected: [], missing: ['b.md'] });

  // Invented: the staged body lands on another accepted output's own target with no
  // accepted row of its own behind it.
  const invented = migration(root, [
    decision('docs/a.md', 'decisions/a', { body: '# decisions/a\n\nSee [B](b.md).\n' }),
    decision('docs/b.md', 'decisions/b'),
  ]);
  const inventedResponse = validate(root, invented);
  assertBlocked(inventedResponse, ['LINK_TARGET_MISMATCH']);
  assert.deepEqual(detailFor(inventedResponse, 'LINK_TARGET_MISMATCH'), { concept: 'decisions/a', unexpected: ['b.md'], missing: [] });

  // A link decision that was never settled means the proposal was never acceptable.
  const unresolved = migration(root, [
    decision('docs/a.md', 'decisions/a', { links: [{ target_source: 'docs/b.md', target_concept: null, decision: 'ambiguous' }] }),
    decision('docs/b.md', 'decisions/b'),
  ]);
  const unresolvedResponse = validate(root, unresolved);
  assertBlocked(unresolvedResponse, ['LINK_DECISION_UNRESOLVED']);
  assert.deepEqual(detailFor(unresolvedResponse, 'LINK_DECISION_UNRESOLVED'), { concept: 'decisions/a', target_source: 'docs/b.md' });
});

// ------------------------------------------------------- 11. the semantic review

test('a verdict formed against something else no longer holds, on whichever binding moved', (t) => {
  const root = repo(t);

  const cases = [
    ['body digest', (migrated) => { migrated.review.outputs[0].body_sha256 = '0'.repeat(64); }, { kind: 'output', concept: 'decisions/a', binding: 'body_sha256' }],
    ['content scope', (migrated) => { migrated.review.outputs[0].content_scope = 'a bounded part'; }, { kind: 'output', concept: 'decisions/a', binding: 'content_scope' }],
    ['source bindings', (migrated) => { migrated.review.outputs[0].sources = [{ path: 'docs/a.md', sha256: '0'.repeat(64) }]; }, { kind: 'output', concept: 'decisions/a', binding: 'sources' }],
    ['source digest', (migrated) => { migrated.review.sources[0].sha256 = '0'.repeat(64); }, { kind: 'source', path: 'docs/a.md', binding: 'sha256' }],
  ];

  for (const [label, mutate, detail] of cases) {
    const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);
    mutate(migrated);
    const response = validate(root, migrated);
    assertBlocked(response, ['REVIEW_VERDICT_STALE']);
    assert.deepEqual(detailFor(response, 'REVIEW_VERDICT_STALE'), detail, label);
  }
});

test('a migrating source or an accepted output with no verdict at all blocks, exactly as a failed one does', (t) => {
  const root = repo(t);

  const noOutput = migration(root, [decision('docs/a.md', 'decisions/a')]);
  noOutput.review.outputs = [];
  const noOutputResponse = validate(root, noOutput);
  assertBlocked(noOutputResponse, ['REVIEW_VERDICT_MISSING']);
  assert.deepEqual(detailFor(noOutputResponse, 'REVIEW_VERDICT_MISSING'), { kind: 'output', concept: 'decisions/a' });

  const noSource = migration(root, [decision('docs/a.md', 'decisions/a')]);
  noSource.review.sources = [];
  const noSourceResponse = validate(root, noSource);
  assertBlocked(noSourceResponse, ['REVIEW_VERDICT_MISSING']);
  assert.deepEqual(detailFor(noSourceResponse, 'REVIEW_VERDICT_MISSING'), { kind: 'source', path: 'docs/a.md' });
});

test('a failed verdict and an unsettled one each block under their own code', (t) => {
  const root = repo(t);

  const failed = migration(root, [decision('docs/a.md', 'decisions/a')]);
  failed.review.outputs[0].verdict = 'fail';
  const failedResponse = validate(root, failed);
  assertBlocked(failedResponse, ['REVIEW_VERDICT_FAILED']);
  assert.deepEqual(detailFor(failedResponse, 'REVIEW_VERDICT_FAILED'), { kind: 'output', concept: 'decisions/a', verdict: 'fail' });

  const uncertain = migration(root, [decision('docs/a.md', 'decisions/a')]);
  uncertain.review.sources[0].verdict = 'uncertain';
  const uncertainResponse = validate(root, uncertain);
  assertBlocked(uncertainResponse, ['REVIEW_VERDICT_UNCERTAIN']);
  assert.deepEqual(detailFor(uncertainResponse, 'REVIEW_VERDICT_UNCERTAIN'), { kind: 'source', path: 'docs/a.md', verdict: 'uncertain' });
});

// ------------------------------------------------------------ the second caller

test('publish refuses the same malformed payload migration-validate refuses, and a staged set naming one concept twice', (t) => {
  const root = repo(t, ['decisions']);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);

  const malformed = {
    'no proposal at all': { proposal: undefined },
    'a proposal missing its groups table': { proposal: { sources: [], outputs: [] } },
    'no navigation': { navigation: undefined },
    'a navigation row with no body': { navigation: [{ path: 'decisions/index.md' }] },
    'no review': { review: undefined },
    'a review missing its source verdicts': { review: { outputs: [] } },
    // Both callers refuse this one at the same seam: a staged set is addressed by
    // Concept ID, so two refs claiming one leave every dimension of the gate with
    // two answers and no way to report the ambiguity.
    'two staged refs claiming one Concept ID': { staged: [migrated.staged[0], { ...migrated.staged[0] }] },
  };

  for (const [name, override] of Object.entries(malformed)) {
    const response = publish(root, migrated, override);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
  }
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'a.md')), false);
});

test('publish reruns the gate itself: a staging area that drifted after a clean validation writes nothing', (t) => {
  const root = repo(t, ['decisions']);
  const migrated = migration(root, [decision('docs/a.md', 'decisions/a')]);

  assert.equal(validate(root, migrated).data.publishable, true);

  // The staged bytes now declare a type nobody accepted. `publish` holds no receipt
  // from the run above and re-reads everything itself.
  write(root, '.okf-staging/okf/decisions/a.md', renderConcept('Reference', null, '# decisions/a\n'));
  const drifted = publish(root, migrated);
  assert.equal(drifted.result, 'blocked');
  assert.equal(drifted.data.code, 'PROPOSAL_CONFORMANCE_FAILED');
  assert.deepEqual(codes(drifted), ['OUTPUT_TYPE_MISMATCH']);

  // And the same for the other side of the binding: the source itself changed, so
  // nothing published can honestly cite it.
  write(root, '.okf-staging/okf/decisions/a.md', renderConcept('Decision', null, '# decisions/a\n'));
  write(root, 'docs/a.md', '# Rewritten after acceptance\n');
  const rehashed = publish(root, migrated);
  assert.equal(rehashed.data.code, 'PROPOSAL_CONFORMANCE_FAILED');
  assert.deepEqual(codes(rehashed), ['SOURCE_BINDING_MISMATCH', 'REVIEW_VERDICT_STALE', 'REVIEW_VERDICT_STALE']);

  // Nothing at all was written: not the concept, not the group's own index.
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'a.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'decisions', 'index.md')), false);
});

test('a conforming staged bundle publishes end to end, concepts and navigation alike', (t) => {
  const root = repo(t, ['decisions']);
  const migrated = migration(root, [
    decision('docs/a.md', 'decisions/a'),
    { source: 'docs/terms.md', concept: 'terms', type: 'Glossary' },
  ]);

  assert.equal(validate(root, migrated).data.publishable, true);
  const response = publish(root, migrated);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete', JSON.stringify(response.data));
  assert.deepEqual(response.data.published, ['decisions/a', 'terms']);
  assert.deepEqual(response.data.failed, []);
  assert.deepEqual(response.findings, []);
  assert.deepEqual(response.data.navigation.map((item) => [item.path, item.status]), [['decisions/index.md', 'written']]);
  assert.equal(fs.readFileSync(path.join(root, 'okf', 'decisions', 'index.md'), 'utf8'), migrated.navigation[0].body);

  // The staged Glossary carried no `status`, and the delegated `create` write gate
  // assigns its own `status: "draft"` to every concept it creates. #195's
  // stable-by-default rule is therefore enforced on the staged bytes by this gate
  // and not yet at the write gate -- a limit recorded, not an invented value.
  assert.equal(fs.readFileSync(path.join(root, 'okf', 'terms.md'), 'utf8'), '---\nstatus: draft\ntype: Glossary\n---\n# terms\n');
  assert.equal(fs.readFileSync(path.join(root, 'okf', 'decisions', 'a.md'), 'utf8'), '---\nstatus: draft\ntype: Decision\n---\n# decisions/a\n');
});
