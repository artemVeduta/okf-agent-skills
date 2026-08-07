const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// `partition` computes around an already-determined plan and never touches the
// bundle itself, but `discover`/`migration-plan` upstream of it both need an active
// bundle, exactly like #144/#145's own fixtures.
function repo(t) {
  const root = temporaryRoot(t, 'okf-146-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
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

function discoverRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } };
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function partitionRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'partition', payload: { cwd: root, ...payload } };
}

function discoverSources(root, payload = {}) {
  return run(discoverRequest(root, payload)).data.sources;
}

// Runs the real upstream pipeline (#142 -> #144/#145) so this file's own fixtures
// exercise `partition` against exactly the shape `migration-plan` actually produces,
// never a hand-rolled stand-in for it.
function derivedPlan(root) {
  const sources = discoverSources(root);
  const planned = run(planRequest(root, sources));
  assert.equal(planned.data.plan.executable, true, 'fixture must resolve to an executable plan with no open question');
  return planned.data;
}

function partitionCompute(root, planData, options = {}) {
  return run(partitionRequest(root, { plan: planData.plan, mapping: planData.mapping, references: planData.references, ...options }));
}

function shardFor(response, id) {
  return response.data.shards.find((item) => item.shard === id);
}

// ------------------------------------------------------------------- one shard

test('a small corpus stays in exactly one shard', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/refunds.md', '---\ntype: Decision\n---\n# Refunds\n');
  write(root, 'docs/auth/sso.md', '---\ntype: Decision\n---\n# SSO\n');
  write(root, 'research/spike.md', '---\ntype: Research\n---\n# Spike\n');
  const planData = derivedPlan(root);

  const response = partitionCompute(root, planData);
  assert.equal(response.result, 'ok');
  assert.equal(response.data.shards.length, 1);
  assert.deepEqual(
    response.data.shards[0].sources.slice().sort(),
    ['docs/auth/sso.md', 'docs/payments/refunds.md', 'research/spike.md'],
  );
});

// -------------------------------------------------------------------- fan-out

test('a corpus larger than the heuristic threshold fans out into more than one shard', (t) => {
  const root = repo(t);
  for (let i = 0; i < 5; i++) write(root, `docs/payments/p${i}.md`, `---\ntype: Decision\n---\n# P${i}\n`);
  for (let i = 0; i < 5; i++) write(root, `docs/auth/a${i}.md`, `---\ntype: Decision\n---\n# A${i}\n`);
  const planData = derivedPlan(root);

  const response = partitionCompute(root, planData);
  assert.equal(response.result, 'ok');
  assert.ok(response.data.shards.length > 1, 'a 10-source corpus must fan out past the default threshold');
  const totalSources = response.data.shards.reduce((sum, shard) => sum + shard.sources.length, 0);
  assert.equal(totalSources, 10);
});

// ------------------------------------------------------- semantic locality, not count

test('partitioning follows directory locality rather than plain file-count chunking', (t) => {
  const root = repo(t);
  for (let i = 0; i < 4; i++) write(root, `docs/payments/p${i}.md`, `---\ntype: Decision\n---\n# P${i}\n`);
  for (let i = 0; i < 4; i++) write(root, `docs/auth/a${i}.md`, `---\ntype: Decision\n---\n# A${i}\n`);
  const planData = derivedPlan(root);

  // A threshold of 3 forces both directories to split, but never into a shard that
  // mixes the two localities together -- a blind file-count chunk sorted by path
  // would otherwise cross the payments/auth boundary.
  const response = partitionCompute(root, planData, { max_sources_per_shard: 3 });
  assert.equal(response.result, 'ok');
  for (const shard of response.data.shards) {
    const prefixes = new Set(shard.sources.map((p) => path.posix.dirname(p)));
    assert.equal(prefixes.size, 1, `shard ${shard.shard} mixes localities: ${shard.sources.join(', ')}`);
  }
  const totalSources = response.data.shards.reduce((sum, shard) => sum + shard.sources.length, 0);
  assert.equal(totalSources, 8);
});

// ------------------------------------------------------------- cross-shard links

test('a link between two sources forced into different shards is surfaced as a cross_shard_link warning, never dropped', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/a.md', '---\ntype: Decision\n---\n# A\n\nSee [the auth policy](../auth/b.md) for details.\n');
  write(root, 'docs/auth/b.md', '---\ntype: Decision\n---\n# B\n');
  const planData = derivedPlan(root);
  // Sanity: #145 already rewrote the link inside the same migration-plan call.
  const mappedA = planData.mapping.find((item) => item.path === 'docs/payments/a.md');
  assert.match(mappedA.body, /b\.md/);

  const response = partitionCompute(root, planData, { max_sources_per_shard: 1 });
  assert.equal(response.result, 'ok');
  assert.equal(response.data.shards.length, 2);
  assert.equal(response.data.cross_shard_links.length, 1);
  const link = response.data.cross_shard_links[0];
  assert.equal(link.from, 'decisions/a');
  assert.equal(link.to, 'decisions/b');
  assert.notEqual(link.from_shard, link.to_shard);

  const warning = response.findings.find((item) => item.code === 'cross_shard_link');
  assert.ok(warning, 'a cross-shard link must be reported as a finding, not silently dropped');
  assert.equal(warning.blocks, false);
  assert.equal(warning.severity, 'warning');

  // The narrow brief still lets the owning worker know the target concept exists,
  // without handing it any of that concept's own content.
  const fromShard = shardFor(response, link.from_shard);
  assert.deepEqual(fromShard.brief.neighbors, [{ concept: 'decisions/b' }]);
});

test('two sources that link to each other but land in the same shard need no cross-shard warning', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/a.md', '---\ntype: Decision\n---\n# A\n\nSee [B](b.md).\n');
  write(root, 'docs/payments/b.md', '---\ntype: Decision\n---\n# B\n');
  const planData = derivedPlan(root);

  const response = partitionCompute(root, planData);
  assert.equal(response.data.shards.length, 1);
  assert.deepEqual(response.data.cross_shard_links, []);
  assert.deepEqual(response.data.shards[0].brief.neighbors, []);
});

// ------------------------------------------------------------------ worker brief

test('a worker brief carries exactly the narrow context and nothing more', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/refunds.md', '---\ntype: Decision\n---\n# Refunds\n');
  write(root, 'notes/glossary.md', 'not evidence enough to be unsupported, just plain residue candidate');
  const planData = derivedPlan(root);

  const response = partitionCompute(root, planData, { project_mode: 'knowledge-only', bundle: 'docs-bundle' });
  const brief = response.data.shards[0].brief;
  assert.deepEqual(
    Object.keys(brief).sort(),
    ['bundle', 'cwd', 'mapping', 'neighbors', 'okf_version', 'project_mode', 'references', 'shard', 'sources'].sort(),
  );
  assert.equal(brief.cwd, path.resolve(root));
  assert.equal(brief.bundle, 'docs-bundle');
  assert.equal(brief.project_mode, 'knowledge-only');
  assert.equal(brief.okf_version, '0.2');
});

test('partition refuses a non-executable plan, a bundle/project_mode outside the allowed values, and a tampered mapping/references array, without computing anything', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
  const planData = derivedPlan(root);

  const notExecutable = { entries: [{ path: 'x.md', disposition: 'blocked_pending_decision', reason: 'type_not_inferable', concept: null, type: null }], executable: false };
  assert.equal(partitionCompute(root, { ...planData, plan: notExecutable }).result, 'blocked');

  assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: planData.mapping, references: planData.references, project_mode: 'sandbox' })).data.code, 'UNSUPPORTED_INPUT');
  assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: planData.mapping, references: planData.references, bundle: '' })).data.code, 'UNSUPPORTED_INPUT');

  const tamperedMapping = planData.mapping.map((item) => ({ ...item, concept: `${item.concept}-tampered` }));
  assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: tamperedMapping, references: planData.references })).result, 'blocked');
});

test('partition reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
  const outside = temporaryRoot(t, 'okf-146-no-repo-');
  assert.equal(run(partitionRequest(outside, { plan: { entries: [], executable: true }, mapping: [], references: [] })).result, 'not-configured');

  const root = repo(t);
  const request = partitionRequest(root, { plan: { entries: [], executable: true }, mapping: [], references: [] });
  const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

// -------------------------------------------------------- shard protocol validation

function wellFormedShard(brief) {
  return {
    shard: brief.shard,
    concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\nConverted.\n` })),
    references: brief.references.map((item) => ({ path: item.path, reference_path: item.reference_path })),
    warnings: [],
    blockers: [],
  };
}

test('a returned shard matching its own brief validates against the protocol', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
  const planData = derivedPlan(root);
  const brief = partitionCompute(root, planData).data.shards[0].brief;

  const response = run(partitionRequest(root, { brief, shard: wellFormedShard(brief) }));
  assert.equal(response.result, 'ok');
  assert.equal(response.data.valid, true);
  assert.deepEqual(response.findings, []);
});

test('a worker may resolve an assigned source as a blocker instead of converting it', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
  const planData = derivedPlan(root);
  const brief = partitionCompute(root, planData).data.shards[0].brief;

  const shard = wellFormedShard(brief);
  shard.concepts = [];
  shard.blockers = [{ path: 'docs/decisions/a.md', reason: 'ambiguous prose, needs a human decision' }];
  const response = run(partitionRequest(root, { brief, shard }));
  assert.equal(response.result, 'ok');
});

test('a malformed shard is refused with a specific finding, never a bare failure', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
  const planData = derivedPlan(root);
  const brief = partitionCompute(root, planData).data.shards[0].brief;

  const cases = [
    [{ ...wellFormedShard(brief), shard: 'wrong-id' }, 'SHARD_IDENTITY_MISMATCH'],
    [{ ...wellFormedShard(brief), extra: true }, 'SHARD_UNKNOWN_FIELD'],
    [{ ...wellFormedShard(brief), concepts: [{ path: 'not/assigned.md', concept: 'x', type: 'Decision', body: '' }] }, 'SHARD_SOURCE_NOT_ASSIGNED'],
    [{ ...wellFormedShard(brief), concepts: [{ path: 'docs/decisions/a.md', concept: 'decisions/a', type: 'Note', body: '' }] }, 'SHARD_CONCEPT_MISMATCH'],
    [{ ...wellFormedShard(brief), concepts: [] }, 'SHARD_INCOMPLETE'],
  ];
  for (const [shard, expectedCode] of cases) {
    const response = run(partitionRequest(root, { brief, shard }));
    assert.equal(response.result, 'blocked', expectedCode);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', expectedCode);
    assert.equal(response.findings.length, 1, expectedCode);
    assert.equal(response.findings[0].code, expectedCode, expectedCode);
    assert.equal(response.findings[0].blocks, true, expectedCode);
  }
});

// ------------------------------------------------------ per-package scan scope (#142)

test('discover scopes its scan to a package subtree when package_root is supplied, and stays gitRoot-relative', (t) => {
  const root = repo(t);
  write(root, 'apps/web/docs/guide.md', '# Guide\n');
  write(root, 'apps/api/docs/guide.md', '# API guide\n');

  const scoped = discoverSources(root, { package_root: 'apps/web' });
  assert.deepEqual(scoped.map((item) => item.path).sort(), ['apps/web/docs/guide.md']);

  const whole = discoverSources(root);
  assert.deepEqual(
    whole.filter((item) => item.path.endsWith('.md')).map((item) => item.path).sort(),
    ['apps/api/docs/guide.md', 'apps/web/docs/guide.md'],
  );
});

test('discover refuses an unsafe package_root without scanning anything', (t) => {
  const root = repo(t);
  write(root, 'apps/web/docs/guide.md', '# Guide\n');
  for (const packageRoot of ['../escape', '/absolute', '']) {
    const response = run(discoverRequest(root, { package_root: packageRoot }));
    assert.equal(response.result, 'blocked', packageRoot);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', packageRoot);
  }
});
