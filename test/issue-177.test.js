/*
Issue #177 (decisions #157, #176) — migration residue is report-only.

A source dispositioned `residue` stays exactly where it already sits. Setup never
copies it into the bundle, never derives a `references/<path>` target for it, and
never routes it through a partition brief, a worker return, assembly, validation,
or publication. The final report names the source path and the reason and states
that setup left the file unchanged; approved residue is a successful terminal
result, not `partial` work.

A file setup reads for structural meaning (#176) and also migrates has two
separate roles. The report names the structural fact and the target proposal row
that consumed it, and still counts the source once in the migration totals — an
evidence read is not a second migration.

Everything here runs through the `okf-setup` wrapper as a process — the one tested
contract seam — and is deterministic: fixtures on disk, no clock, no network, no
model call.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function run(value) {
  return runWrapper(wrapper, value);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function repo(t) {
  const root = temporaryRoot(t, 'okf-177-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Agents](agents/index.md)\n');
  write(root, 'okf/agents/index.md', '# Agents\n\n- [OKF agent connector](okf.md)\n');
  write(root, 'okf/agents/okf.md', '---\ntitle: OKF agent connector\ntype: Playbook\n---\n# OKF agent connector\n');
  return root;
}

function discoverSources(root) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } }).data.sources;
}

function planned(root, sources) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources } }).data;
}

function propose(root, plan, selected, payload = {}) {
  return run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'propose',
    payload: { cwd: root, plan: { entries: plan.entries, executable: plan.executable }, selected, ...payload },
  });
}

// One migrating Markdown source and one unsupported source, which classifies as
// residue with no question asked.
function residueFixture(t) {
  const root = repo(t);
  write(root, 'docs/billing.md', '---\ntype: Reference\n---\n# Billing\n\nHow money moves.\n');
  write(root, 'assets/legacy.html', '<!DOCTYPE html>\n<html><body>legacy</body></html>\n');
  return root;
}

function everyFileUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => path.relative(dir, path.join(item.parentPath, item.name)));
}

// ----------------------------------------------------- no residue target is derived

test('a residue source gets no bundle target path from migration-plan or propose', (t) => {
  const root = residueFixture(t);
  const sources = discoverSources(root);
  const plan = planned(root, sources);

  const entry = plan.plan.entries.find((item) => item.path === 'assets/legacy.html');
  assert.deepEqual(entry, {
    path: 'assets/legacy.html', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null,
  });
  assert.equal(Object.hasOwn(plan, 'references'), false);
  assert.deepEqual(plan.mapping.map((item) => item.path), ['docs/billing.md']);

  const accepted = propose(root, plan.plan, sources, { decision: 'accept' }).data;
  assert.equal(accepted.status, 'accepted');
  assert.equal(Object.hasOwn(accepted, 'references'), false);

  // The residue row is complete and addressable in both the authoritative table
  // and the projected plan, and produces no output row at all.
  assert.deepEqual(accepted.proposal.sources.find((item) => item.path === 'assets/legacy.html'), {
    path: 'assets/legacy.html', disposition: 'residue', reason: 'unsupported_format', outputs: [],
  });
  assert.deepEqual(accepted.plan.entries.find((item) => item.path === 'assets/legacy.html'), entry);
  assert.equal(accepted.proposal.outputs.some((item) => item.source === 'assets/legacy.html'), false);

  // Nothing anywhere in the accepted proposal names a `references/` location for it.
  assert.equal(JSON.stringify(accepted).includes('references/assets/legacy.html'), false);
});

// -------------------------------------------- no residue reaches a worker or staging

test('a residue source reaches no worker brief, no staged file, and is left byte-for-byte unchanged', (t) => {
  const root = residueFixture(t);
  const before = fs.readFileSync(path.join(root, 'assets/legacy.html'));
  const sources = discoverSources(root);
  const plan = planned(root, sources);
  const accepted = propose(root, plan.plan, sources, { decision: 'accept' }).data;

  const partitioned = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, plan: accepted.plan, mapping: accepted.mapping },
  });
  assert.equal(partitioned.result, 'ok', JSON.stringify(partitioned.findings));

  for (const shard of partitioned.data.shards) {
    assert.equal(shard.sources.includes('assets/legacy.html'), false);
    assert.equal(Object.hasOwn(shard.brief, 'references'), false);
    assert.deepEqual(
      Object.keys(shard.brief).sort(),
      ['bundle', 'cwd', 'mapping', 'neighbors', 'okf_version', 'project_mode', 'shard', 'sources'].sort(),
    );
  }

  const shardFiles = partitioned.data.shards.map((shard) => {
    const converted = {
      shard: shard.shard,
      concepts: shard.brief.mapping.map((item) => ({
        path: item.path, concept: item.concept, type: item.type, body: `# ${item.concept}\n\nConverted.\n`,
      })),
      warnings: [],
      blockers: [],
    };
    const validated = run({
      protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'partition',
      payload: { cwd: root, brief: shard.brief, shard: converted },
    });
    assert.equal(validated.data.valid, true, JSON.stringify(validated.findings));
    const file = path.join(root, '.okf-staging', 'okf', 'shards', `${shard.shard.replace(/\W/g, '-')}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(converted));
    return { shard: shard.shard, path: path.relative(root, file) };
  });

  const assembled = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'assemble',
    payload: {
      cwd: root,
      partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
      shards: shardFiles,
    },
  });
  assert.equal(assembled.data.status, 'complete', JSON.stringify(assembled.findings));
  assert.equal(Object.hasOwn(assembled.data, 'references'), false);
  assert.deepEqual(assembled.data.staged.map((item) => item.concept), ['billing']);

  const validated = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: { cwd: root, selected: sources.map((item) => item.path), plan: accepted.plan, semantic_review: { performed: false } },
  });
  assert.equal(validated.result, 'ok', JSON.stringify(validated.findings));

  // No copy exists anywhere: not in staging, not in the bundle. The original file
  // is still exactly where it was, with exactly the bytes it had.
  assert.deepEqual(everyFileUnder(path.join(root, '.okf-staging', 'okf')).filter((item) => item.endsWith('.md')), ['billing.md']);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'references')), false);
  assert.equal(fs.existsSync(path.join(root, '.okf-staging', 'okf', 'references')), false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'assets/legacy.html')), before);
});

// ------------------------------------------------------------------- final report

test('the report names each residue source, its reason, and that setup left it unchanged', (t) => {
  const root = repo(t);
  const response = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'report',
    payload: {
      cwd: root,
      sources: [
        { path: 'docs/billing.md', disposition: 'migrated', concept: 'billing.md', sources_declared: false },
        { path: 'assets/legacy.html', disposition: 'residue', reason: 'unsupported_format' },
      ],
      semantic_review: { performed: false },
    },
  });

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.residue, [
    { source: 'assets/legacy.html', reason: 'unsupported_format', unchanged: true },
  ]);
  assert.deepEqual(response.data.summary, {
    sources_total: 2, concepts_created: 1, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 1,
  });
  // Approved residue is a successful terminal result: `partial` is reserved for
  // unresolved or failed work.
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.evidence, []);
  assert.equal(response.findings.some((item) => item.blocks), false);
  assert.equal(response.findings.some((item) => item.detail && item.detail.path === 'assets/legacy.html'), false);
});

// ---------------------------------------------------------------- dual-role file

test('a file read for structure and migrated is reported in both roles and counted once', (t) => {
  const root = repo(t);
  write(root, 'docs/billing.md', '---\ntype: Reference\n---\n# Billing\n\nHow money moves.\n');
  const sources = discoverSources(root);
  const plan = planned(root, sources);
  const accepted = propose(root, plan.plan, sources, { decision: 'accept' }).data;

  const fact = accepted.evidence.find((item) => item.file === 'docs/billing.md' && item.heading === 'Billing');
  assert.equal(fact.dual_role, true);
  const output = accepted.proposal.outputs.find((item) => item.source === 'docs/billing.md');
  assert.deepEqual(fact.consumed_by, [output.id]);

  const response = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'report',
    payload: {
      cwd: root,
      sources: [{ path: 'docs/billing.md', disposition: 'migrated', concept: output.target_path, sources_declared: false }],
      evidence: accepted.evidence,
      semantic_review: { performed: false },
    },
  });

  assert.equal(response.result, 'ok');
  // One migration, whatever the file also supplied as structure.
  assert.deepEqual(response.data.summary, {
    sources_total: 1, concepts_created: 1, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0,
  });
  assert.deepEqual(response.data.concepts, [
    { source: 'docs/billing.md', concept: output.target_path, sources_declared: false },
  ]);
  // The structural role is reported separately, naming the fact, the file, and the
  // exact target proposal row that used it.
  assert.deepEqual(response.data.evidence.find((item) => item.fact === fact.id), {
    fact: fact.id, file: 'docs/billing.md', kind: 'heading', consumed_by: [output.id], migration_disposition: 'migrated',
  });
});

test('a structural fact from a file no migration touched carries no migration disposition', (t) => {
  const root = repo(t);
  const response = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'report',
    payload: {
      cwd: root,
      sources: [{ path: 'docs/billing.md', disposition: 'migrated', concept: 'billing.md', sources_declared: false }],
      evidence: [{ id: 'e1', file: 'CONTEXT.md', kind: 'domain_term', term: 'Invoice', consumed_by: [] }],
      semantic_review: { performed: false },
    },
  });

  assert.deepEqual(response.data.evidence, [
    { fact: 'e1', file: 'CONTEXT.md', kind: 'domain_term', consumed_by: [], migration_disposition: null },
  ]);
  assert.equal(response.data.summary.sources_total, 1);
});

test('an ill-formed evidence entry is refused before anything is totalled', (t) => {
  const root = repo(t);
  const response = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'report',
    payload: {
      cwd: root,
      sources: [{ path: 'docs/billing.md', disposition: 'migrated', concept: 'billing.md' }],
      evidence: [{ id: 'e1', file: 'CONTEXT.md', kind: 'domain_term' }],
      semantic_review: { performed: false },
    },
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});
