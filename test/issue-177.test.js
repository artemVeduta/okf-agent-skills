/*
 * #177 (#157): migration residue is report-only.
 *
 * An unsupported source is named once in `data.plan`, left exactly where it is,
 * and reported at the end as unchanged. It is never given a target path, never
 * copied, never partitioned into a shard, never returned by a worker, never
 * assembled, staged, validated or published. Approved residue is a successful
 * terminal result -- `partial` is reserved for unresolved or failed work.
 *
 * These are wrapper-process tests: every assertion below runs the real
 * `scripts/okf-setup.js` as a process, the one tested contract seam.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// A source `discover` classifies `unsupported`: MediaWiki/Obsidian wikilink
// syntax this migration will never interpret.
const UNSUPPORTED = '# Legacy note\n\nSee [[Other Note]] for background.\n';

function repo(t) {
  const root = temporaryRoot(t, 'okf-177-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(value) {
  return runWrapper(wrapper, value);
}

function discoverSources(root) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } }).data.sources;
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function reportRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'report', payload: { cwd: root, ...payload } };
}

// One migrating source plus one residue source, planned through the real
// upstream so the shapes below are exactly what `migration-plan` produces.
function mixedPlan(t) {
  const root = repo(t);
  write(root, 'docs/decisions/postgres.md', '---\ntype: Decision\n---\n# Use Postgres\n');
  write(root, 'notes/legacy.md', UNSUPPORTED);
  const sources = discoverSources(root);
  const { response } = planWithGroups(run, (payload) => planRequest(root, sources, payload), {
    root,
    placement: { 'docs/decisions/postgres.md': 'library' },
  });
  assert.equal(response.data.plan.executable, true, 'fixture must resolve to an executable plan');
  const residue = response.data.plan.entries.filter((item) => item.disposition === 'residue');
  assert.deepEqual(residue.map((item) => item.path), ['notes/legacy.md'], 'fixture must produce exactly one residue source');
  return { root, planData: response.data };
}

// ------------------------------------------------- no target path, no copy

test('a residue source is recorded once in the plan and given no target path anywhere in the response', (t) => {
  const { root, planData } = mixedPlan(t);

  const entries = planData.plan.entries.filter((item) => item.path === 'notes/legacy.md');
  assert.deepEqual(entries, [
    { path: 'notes/legacy.md', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null },
  ]);

  // The removed `data.references` array is gone outright, and no `references/`
  // target for this source appears anywhere in the response.
  assert.equal(planData.references, undefined);
  assert.equal(JSON.stringify(planData).includes('references/notes/legacy.md'), false);
  assert.equal(JSON.stringify(planData).includes('reference_path'), false);

  // Nothing was copied: the source is untouched, and no `references/` tree exists.
  assert.equal(fs.readFileSync(path.join(root, 'notes', 'legacy.md'), 'utf8'), UNSUPPORTED);
  assert.equal(fs.existsSync(path.join(root, 'references')), false);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'references')), false);
});

// ------------------------------------------------------- never partitioned

test('partition never places a residue source in a shard, and a brief never names one', (t) => {
  const { root, planData } = mixedPlan(t);

  const partitioned = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, plan: planData.plan, mapping: planData.mapping, split_review: planData.split_review },
  });
  assert.equal(partitioned.result, 'ok');

  for (const shard of partitioned.data.shards) {
    assert.equal(shard.sources.includes('notes/legacy.md'), false);
    assert.equal(shard.brief.sources.includes('notes/legacy.md'), false);
    assert.equal(shard.brief.mapping.some((item) => item.path === 'notes/legacy.md'), false);
    // The brief has no residue-carrying field at all.
    assert.equal(Object.prototype.hasOwnProperty.call(shard.brief, 'references'), false);
  }
  assert.equal(JSON.stringify(partitioned).includes('notes/legacy.md'), false);
});

test('partition still accepts a plan whose only non-migrate entry is residue, with no counterpart array supplied', (t) => {
  const { root, planData } = mixedPlan(t);

  const partitioned = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, plan: planData.plan, mapping: planData.mapping, split_review: planData.split_review },
  });
  assert.equal(partitioned.result, 'ok');
  assert.equal(partitioned.data.shards.length > 0, true);
});

// A brief that still carries the removed field is a tampered brief, not a
// supported one: the shard envelope names exactly four fields now.
test('a worker return carrying a references field is refused as an unknown field', (t) => {
  const { root, planData } = mixedPlan(t);
  const partitioned = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, plan: planData.plan, mapping: planData.mapping, split_review: planData.split_review },
  });
  const brief = partitioned.data.shards[0].brief;
  const shard = {
    shard: brief.shard,
    concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\nConverted.\n` })),
    references: [{ path: 'notes/legacy.md', reference_path: 'references/notes/legacy.md' }],
    warnings: [],
    blockers: [],
  };

  const validated = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, brief, shard },
  });
  assert.equal(validated.result, 'blocked');
  const finding = validated.findings.find((item) => item.code === 'SHARD_UNKNOWN_FIELD');
  assert.equal(finding.detail.field, 'references');
});

// ------------------------------------------------------------- exact report

test('the final report names the residue source by its original path, with its reason, and states it was left unchanged', (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
  const response = run(reportRequest(root, {
    sources: [
      { path: 'docs/decisions/postgres.md', disposition: 'migrated', concept: 'library/postgres.md', sources_declared: true },
      { path: 'notes/legacy.md', disposition: 'residue', reason: 'unsupported_format' },
    ],
    semantic_review: { performed: true },
  }));

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.residue, [
    { source: 'notes/legacy.md', reason: 'unsupported_format', unchanged: true },
  ]);
  assert.equal(response.data.summary.sources_residue, 1);
  // Residue is counted once, and only once, in the totals.
  assert.equal(response.data.summary.sources_total, 2);
  assert.equal(response.data.summary.concepts_created, 1);
  assert.equal(response.data.summary.sources_skipped, 0);
  assert.equal(response.data.summary.sources_ambiguous, 0);
});

test('approved residue is a successful terminal result and never makes the run partial', (t) => {
  const root = repo(t);
  const onlyResidue = run(reportRequest(root, {
    sources: [{ path: 'notes/legacy.md', disposition: 'residue', reason: 'unsupported_format' }],
    semantic_review: { performed: true },
  }));
  assert.equal(onlyResidue.data.status, 'complete');

  // ...whereas an unresolved source is exactly what `partial` is for.
  const withAmbiguous = run(reportRequest(root, {
    sources: [
      { path: 'notes/legacy.md', disposition: 'residue', reason: 'unsupported_format' },
      { path: 'docs/weird.md', disposition: 'ambiguous', reason: 'type_not_inferable' },
    ],
    semantic_review: { performed: true },
  }));
  assert.equal(withAmbiguous.data.status, 'partial');
});
