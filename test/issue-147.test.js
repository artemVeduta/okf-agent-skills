const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-147-repo-');
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

function discoverSources(root, payload = {}) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } }).data.sources;
}

// Runs the real upstream pipeline (#142 -> #144/#145) so this file's own
// fixtures exercise `assemble` against exactly the shape `migration-plan`
// actually produces, never a hand-rolled stand-in for it.
function derivedPlan(root) {
  const sources = discoverSources(root);
  const planned = run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources } });
  assert.equal(planned.data.plan.executable, true, 'fixture must resolve to an executable plan with no open question');
  return planned.data;
}

function partitionCompute(root, planData, options = {}) {
  return run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'partition',
    payload: { cwd: root, plan: planData.plan, mapping: planData.mapping, references: planData.references, ...options },
  });
}

// The shard object a well-behaved fresh-context worker returns for its own
// brief: one concept per assigned `migrate` source, one reference per
// assigned `residue` source, nothing blocked.
function wellFormedShard(brief, suffix = 'Converted.') {
  return {
    shard: brief.shard,
    concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\n${suffix}\n` })),
    references: brief.references.map((item) => ({ path: item.path, reference_path: item.reference_path })),
    warnings: [],
    blockers: [],
  };
}

// Writes a shard's own returned object to its own staging file -- a plain
// filesystem action, exactly as skills/okf-setup/SKILL.md's own step 9
// describes -- and returns the cwd-relative path `assemble` reads it back
// from, so the shard's own concept bodies never flow through this file's own
// `assemble` request a second time.
function stageShard(root, shard) {
  const relative = `.okf-staging/shards/${shard.shard.replace(/[\\/#]/g, '-')}.json`;
  write(root, relative, JSON.stringify(shard));
  return relative;
}

function assembleRequest(root, partitioned, shardRefs, payload = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'assemble',
    payload: {
      cwd: root,
      partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
      shards: shardRefs,
      ...payload,
    },
  };
}

// Partitions the plan, lets `buildShard` author (and, by default, stage)
// each shard's own worker output, then calls `assemble`. `buildShard`
// receives each shard descriptor (`{shard, sources, brief}`) and must return
// the shard object to stage; the default author is `wellFormedShard`.
function assembleFixture(root, planData, options = {}) {
  const { partitionOptions = {}, buildShard = (descriptor) => wellFormedShard(descriptor.brief), skip = [] } = options;
  const partitioned = partitionCompute(root, planData, partitionOptions);
  assert.equal(partitioned.result, 'ok', 'fixture partition call must succeed');
  const shardRefs = [];
  for (const descriptor of partitioned.data.shards) {
    const shard = buildShard(descriptor);
    const relative = stageShard(root, shard);
    if (!skip.includes(descriptor.shard)) shardRefs.push({ shard: descriptor.shard, path: relative });
  }
  const response = run(assembleRequest(root, partitioned, shardRefs));
  return { partitioned, response };
}

function stagingRoot(root, bundle = 'okf') {
  return path.join(root, '.okf-staging', bundle);
}

// ------------------------------------------------------------- clean assembly

test('N shards assemble cleanly into one staged file per concept', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/refunds.md', '---\ntype: Decision\n---\n# Refunds\n');
  write(root, 'docs/auth/sso.md', '---\ntype: Decision\n---\n# SSO\n');
  write(root, 'research/spike.md', '# Spike\n');
  const planData = derivedPlan(root);

  const { partitioned, response } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
  assert.equal(partitioned.data.shards.length, 3, 'fixture must actually exercise more than one shard');
  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.equal(response.data.publishable, true);
  assert.equal(response.data.staged.length, 3);
  assert.deepEqual(response.data.blockers, []);
  assert.deepEqual(response.data.duplicates, []);

  for (const item of response.data.staged) {
    const text = fs.readFileSync(path.join(root, item.file), 'utf8');
    assert.match(text, /^---\n/);
    assert.match(text, new RegExp(`type: ${item.type}\\n`));
    assert.match(text, /status: draft\n/);
    assert.match(text, /Converted\.\n$/);
  }
  assert.equal(response.data.staging_dir, path.relative(root, stagingRoot(root)));

  // The staging area a completed `assemble` call leaves behind must not turn
  // into a candidate source for a later `discover` scan of the same project.
  const rescanned = discoverSources(root);
  assert.ok(!rescanned.some((item) => item.path.startsWith('.okf-staging/')), 'staged output was re-discovered as source material');
});

// ------------------------------------------------------------- target collision

test('two shards claiming the same concept path block, never silently renamed or overwritten', (t) => {
  const root = repo(t);
  // Both are inferred `Decision` by directory alone and both strip down to
  // the same basename-only target (#145's own `conceptPathFor`), a collision
  // `migration-plan`'s own check cannot see: it only ever compares a
  // candidate path against the bundle already published on disk, never
  // against a sibling entry in the very same plan.
  write(root, 'docs/team-a/decisions/postgres.md', '# Use Postgres (team A)\n');
  write(root, 'docs/team-b/decisions/postgres.md', '# Use Postgres (team B)\n');
  const planData = derivedPlan(root);
  assert.equal(
    planData.mapping.filter((item) => item.concept === 'decisions/postgres').length,
    2,
    'fixture must actually produce a same-target collision migration-plan alone does not catch',
  );

  const { partitioned, response } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
  assert.equal(partitioned.data.shards.length, 2, 'fixture must force the two colliding sources into different shards');
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'CONCEPT_TARGET_COLLISION');
  assert.equal(response.data.collisions.length, 1);
  assert.equal(response.data.collisions[0].concept, 'decisions/postgres');
  assert.deepEqual(
    response.data.collisions[0].claims.map((claim) => claim.path).sort(),
    ['docs/team-a/decisions/postgres.md', 'docs/team-b/decisions/postgres.md'],
  );
  const finding = response.findings.find((item) => item.code === 'CONCEPT_TARGET_COLLISION');
  assert.ok(finding);
  assert.equal(finding.blocks, true);
  assert.equal(finding.severity, 'error');

  assert.equal(fs.existsSync(stagingRoot(root)), false, 'a blocked collision must stage nothing at all');
});

// ------------------------------------------------------------------ duplicates

test('an exact cross-shard duplicate is surfaced as a candidate, never merged', (t) => {
  const root = repo(t);
  write(root, 'docs/team-a/decisions/one.md', '# One\n');
  write(root, 'docs/team-b/decisions/two.md', '# Two\n');
  const planData = derivedPlan(root);

  const { response } = assembleFixture(root, planData, {
    partitionOptions: { max_sources_per_shard: 1 },
    buildShard: (descriptor) => {
      const shard = wellFormedShard(descriptor.brief);
      shard.concepts = shard.concepts.map((item) => ({ ...item, body: '---\ntype: Decision\nstatus: draft\n---\n\nByte-identical content.\n' }));
      return shard;
    },
  });

  assert.equal(response.result, 'ok');
  assert.equal(response.data.duplicates.length, 1);
  assert.deepEqual(response.data.duplicates[0].concepts, ['decisions/one', 'decisions/two']);
  assert.equal(response.data.duplicates[0].shards.length, 2);
  const finding = response.findings.find((item) => item.code === 'ASSEMBLY_DUPLICATE_CANDIDATE');
  assert.ok(finding);
  assert.equal(finding.blocks, false);

  // Surfacing is as far as it goes: both concepts still stage, distinct.
  assert.deepEqual(response.data.staged.map((item) => item.concept).sort(), ['decisions/one', 'decisions/two']);
});

test('a near duplicate is never merged, and neither concept is dropped', (t) => {
  const root = repo(t);
  write(root, 'docs/team-a/decisions/one.md', '# One\n');
  write(root, 'docs/team-b/decisions/two.md', '# Two\n');
  const planData = derivedPlan(root);

  const { response } = assembleFixture(root, planData, {
    partitionOptions: { max_sources_per_shard: 1 },
    buildShard: (descriptor) => {
      const shard = wellFormedShard(descriptor.brief);
      shard.concepts = shard.concepts.map((item) => ({
        ...item,
        body: item.concept === 'decisions/one' ? '# Nearly identical, version A\n' : '# Nearly identical, version B\n',
      }));
      return shard;
    },
  });

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.duplicates, []);
  assert.deepEqual(response.data.staged.map((item) => item.concept).sort(), ['decisions/one', 'decisions/two']);
  const bodies = response.data.staged.map((item) => fs.readFileSync(path.join(root, item.file), 'utf8'));
  assert.notEqual(bodies[0], bodies[1]);
});

// -------------------------------------------------------------------- blockers

test('a shard carrying a blocker marks the result partial and unpublishable, without losing the rest', (t) => {
  const root = repo(t);
  write(root, 'docs/team-a/decisions/one.md', '# One\n');
  write(root, 'docs/team-b/decisions/two.md', '# Two\n');
  const planData = derivedPlan(root);

  const { response } = assembleFixture(root, planData, {
    partitionOptions: { max_sources_per_shard: 1 },
    buildShard: (descriptor) => {
      const shard = wellFormedShard(descriptor.brief);
      if (descriptor.sources.includes('docs/team-a/decisions/one.md')) {
        shard.concepts = [];
        shard.blockers = [{ path: 'docs/team-a/decisions/one.md', reason: 'ambiguous prose, needs a human decision' }];
      }
      return shard;
    },
  });

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.publishable, false);
  assert.equal(response.data.blockers.length, 1);
  assert.equal(response.data.blockers[0].path, 'docs/team-a/decisions/one.md');
  assert.equal(response.data.blockers[0].reason, 'ambiguous prose, needs a human decision');
  const warning = response.findings.find((item) => item.code === 'ASSEMBLY_SOURCE_BLOCKED');
  assert.ok(warning);
  assert.equal(warning.blocks, false);

  // The other source's own shard still resolved and still stages.
  assert.deepEqual(response.data.staged.map((item) => item.concept), ['decisions/two']);
});

// ---------------------------------------------------------- nothing disappears

test('every partitioned source is accounted for in the result', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/postgres.md', '# Use Postgres\n');
  write(root, 'assets/legacy.html', '<!DOCTYPE html>\n<html><body>legacy</body></html>\n');
  const planData = derivedPlan(root);
  const migrating = planData.plan.entries.filter((entry) => entry.disposition === 'migrate').map((entry) => entry.path);
  const residue = planData.plan.entries.filter((entry) => entry.disposition === 'residue').map((entry) => entry.path);
  assert.ok(migrating.length > 0 && residue.length > 0, 'fixture must exercise both a migrate and a residue source');

  const { response } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
  assert.equal(response.result, 'ok');

  const accounted = [
    ...response.data.staged.map((item) => item.path),
    ...response.data.references.map((item) => item.path),
    ...response.data.blockers.map((item) => item.path),
  ].sort();
  assert.deepEqual(accounted, [...migrating, ...residue].sort());
});

// --------------------------------------------------------- missing shard refused

test('a shard missing from the set is refused rather than assembled partially', (t) => {
  const root = repo(t);
  write(root, 'docs/team-a/decisions/one.md', '# One\n');
  write(root, 'docs/team-b/decisions/two.md', '# Two\n');
  const planData = derivedPlan(root);

  const { partitioned, response } = assembleFixture(root, planData, {
    partitionOptions: { max_sources_per_shard: 1 },
    // Shard ids are the longest shared directory prefix (#146); the two
    // single-source shards this fixture forces are labeled exactly this way.
    skip: ['docs/team-a/decisions'],
  });

  assert.equal(partitioned.data.shards.length, 2);
  assert.ok(partitioned.data.shards.some((shard) => shard.shard === 'docs/team-a/decisions'), 'fixture assumption: shard id naming');
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.data.missing_shards.length, 1);
  assert.deepEqual(response.data.unknown_shards, []);
  const finding = response.findings.find((item) => item.code === 'ASSEMBLY_SHARD_SET_MISMATCH');
  assert.ok(finding);
  assert.equal(finding.blocks, true);

  assert.equal(fs.existsSync(stagingRoot(root)), false, 'a refused shard set must stage nothing, not the shards that were present');
});

// -------------------------------------------------------------- cross-shard links

test('a cross-shard link resolves once both shards return, and is carried as a named relationship-loss warning when one does not', (t) => {
  const root = repo(t);
  write(root, 'docs/payments/a.md', '---\ntype: Decision\n---\n# A\n\nSee [the auth policy](../auth/b.md) for details.\n');
  write(root, 'docs/auth/b.md', '---\ntype: Decision\n---\n# B\n');
  const planData = derivedPlan(root);

  const resolved = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
  assert.equal(resolved.partitioned.data.cross_shard_links.length, 1, 'fixture must actually split the linked pair across shards');
  assert.equal(resolved.response.result, 'ok');
  assert.deepEqual(resolved.response.data.links.resolved, [{ from: 'decisions/a', to: 'decisions/b' }]);
  assert.deepEqual(resolved.response.data.links.lost, []);

  const lost = assembleFixture(root, planData, {
    partitionOptions: { max_sources_per_shard: 1 },
    buildShard: (descriptor) => {
      const shard = wellFormedShard(descriptor.brief);
      if (descriptor.sources.includes('docs/auth/b.md')) {
        shard.concepts = [];
        shard.blockers = [{ path: 'docs/auth/b.md', reason: 'could not resolve' }];
      }
      return shard;
    },
  });
  assert.equal(lost.response.result, 'ok');
  assert.deepEqual(lost.response.data.links.resolved, []);
  assert.equal(lost.response.data.links.lost.length, 1);
  assert.equal(lost.response.data.links.lost[0].from, 'decisions/a');
  assert.equal(lost.response.data.links.lost[0].to, 'decisions/b');
  const finding = lost.response.findings.find((item) => item.code === 'MIGRATION_LINK_LOST');
  assert.ok(finding, 'a lost cross-shard link must name the relationship loss, distinct from an ordinary broken-link warning');
  assert.equal(finding.blocks, false);
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.detail.from, 'decisions/a');
  assert.equal(finding.detail.to, 'decisions/b');
});

// ---------------------------------------------------------------- wrapper wiring

test('assemble reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
  const outside = temporaryRoot(t, 'okf-147-no-repo-');
  const emptyRequest = {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'assemble',
    payload: { cwd: outside, partition: { shards: [{ shard: 'x', sources: ['x.md'], brief: { shard: 'x', mapping: [], references: [], sources: ['x.md'] } }] }, shards: [{ shard: 'x', path: 'x.json' }] },
  };
  assert.equal(run(emptyRequest).result, 'not-configured');

  const root = repo(t);
  const request = { ...emptyRequest, payload: { ...emptyRequest.payload, cwd: root } };
  const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
