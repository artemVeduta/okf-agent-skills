const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot, writeManifest } = require('../../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../../test-support/groups');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');

test.describe("sharding and worker briefs", () => {

  // `partition` computes around an already-determined plan and never touches the
  // bundle itself, but `discover`/`migration-plan` upstream of it both need an active
  // bundle, exactly like #144/#145's own fixtures.
  function repo(t) {
    const root = temporaryRoot(t, 'okf-146-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
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
  // never a hand-rolled stand-in for it. #203: every typed source now also needs an
  // accepted reader-purpose group before the plan is executable, so `placement`
  // (`{<source path>: <accepted group key>}`) names one for every migrating source
  // this fixture writes.
  function derivedPlan(root, placement) {
    const sources = discoverSources(root);
    const { response } = planWithGroups(run, (payload) => planRequest(root, sources, payload), { root, placement });
    assert.equal(response.data.plan.executable, true, 'fixture must resolve to an executable plan with no open question');
    return response.data;
  }

  function partitionCompute(root, planData, options = {}) {
    return run(partitionRequest(root, {
      plan: planData.plan, mapping: planData.mapping,
      split_review: planData.split_review, ...options,
    }));
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
    const planData = derivedPlan(root, {
      'docs/payments/refunds.md': 'payments', 'docs/auth/sso.md': 'auth', 'research/spike.md': 'research',
    });

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
    const placement = {};
    for (let i = 0; i < 5; i++) { write(root, `docs/payments/p${i}.md`, `---\ntype: Decision\n---\n# P${i}\n`); placement[`docs/payments/p${i}.md`] = 'payments'; }
    for (let i = 0; i < 5; i++) { write(root, `docs/auth/a${i}.md`, `---\ntype: Decision\n---\n# A${i}\n`); placement[`docs/auth/a${i}.md`] = 'auth'; }
    const planData = derivedPlan(root, placement);

    const response = partitionCompute(root, planData);
    assert.equal(response.result, 'ok');
    assert.ok(response.data.shards.length > 1, 'a 10-source corpus must fan out past the default threshold');
    const totalSources = response.data.shards.reduce((sum, shard) => sum + shard.sources.length, 0);
    assert.equal(totalSources, 10);
  });

  // ------------------------------------------------------- semantic locality, not count

  test('partitioning follows directory locality rather than plain file-count chunking', (t) => {
    const root = repo(t);
    const placement = {};
    for (let i = 0; i < 4; i++) { write(root, `docs/payments/p${i}.md`, `---\ntype: Decision\n---\n# P${i}\n`); placement[`docs/payments/p${i}.md`] = 'payments'; }
    for (let i = 0; i < 4; i++) { write(root, `docs/auth/a${i}.md`, `---\ntype: Decision\n---\n# A${i}\n`); placement[`docs/auth/a${i}.md`] = 'auth'; }
    const planData = derivedPlan(root, placement);

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
    const planData = derivedPlan(root, { 'docs/payments/a.md': 'payments', 'docs/auth/b.md': 'auth' });
    // Sanity: #145 already rewrote the link inside the same migration-plan call.
    const mappedA = planData.mapping.find((item) => item.path === 'docs/payments/a.md');
    assert.match(mappedA.body, /b\.md/);

    const response = partitionCompute(root, planData, { max_sources_per_shard: 1 });
    assert.equal(response.result, 'ok');
    assert.equal(response.data.shards.length, 2);
    assert.equal(response.data.cross_shard_links.length, 1);
    const link = response.data.cross_shard_links[0];
    assert.equal(link.from, 'payments/a');
    assert.equal(link.to, 'auth/b');
    assert.notEqual(link.from_shard, link.to_shard);

    const warning = response.findings.find((item) => item.code === 'cross_shard_link');
    assert.ok(warning, 'a cross-shard link must be reported as a finding, not silently dropped');
    assert.equal(warning.blocks, false);
    assert.equal(warning.severity, 'warning');

    // The narrow brief still lets the owning worker know the target concept exists,
    // without handing it any of that concept's own content.
    const fromShard = shardFor(response, link.from_shard);
    assert.deepEqual(fromShard.brief.neighbors, [{ concept: 'auth/b' }]);
  });

  test('two sources that link to each other but land in the same shard need no cross-shard warning', (t) => {
    const root = repo(t);
    write(root, 'docs/payments/a.md', '---\ntype: Decision\n---\n# A\n\nSee [B](b.md).\n');
    write(root, 'docs/payments/b.md', '---\ntype: Decision\n---\n# B\n');
    const planData = derivedPlan(root, { 'docs/payments/a.md': 'payments', 'docs/payments/b.md': 'payments' });

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
    const planData = derivedPlan(root, { 'docs/payments/refunds.md': 'payments', 'notes/glossary.md': 'notes' });

    const response = partitionCompute(root, planData, { project_mode: 'knowledge-only', bundle: 'docs-bundle' });
    const brief = response.data.shards[0].brief;
    assert.deepEqual(
      Object.keys(brief).sort(),
      ['bundle', 'cwd', 'mapping', 'neighbors', 'okf_version', 'project_mode', 'shard', 'sources', 'split_review'].sort(),
    );
    assert.equal(brief.cwd, path.resolve(root));
    assert.equal(brief.bundle, 'docs-bundle');
    assert.equal(brief.project_mode, 'knowledge-only');
    assert.equal(brief.okf_version, '0.2');
  });

  test('partition refuses a non-executable plan, a bundle/project_mode outside the allowed values, and a tampered mapping array, without computing anything', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
    const planData = derivedPlan(root, { 'docs/decisions/a.md': 'library' });

    const notExecutable = { entries: [{ path: 'x.md', disposition: 'blocked_pending_decision', reason: 'type_not_inferable', concept: null, type: null }], executable: false };
    assert.equal(partitionCompute(root, { ...planData, plan: notExecutable }).result, 'blocked');

    assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: planData.mapping, split_review: planData.split_review, project_mode: 'sandbox' })).data.code, 'UNSUPPORTED_INPUT');
    assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: planData.mapping, split_review: planData.split_review, bundle: '' })).data.code, 'UNSUPPORTED_INPUT');

    const tamperedMapping = planData.mapping.map((item) => ({ ...item, concept: `${item.concept}-tampered` }));
    assert.equal(run(partitionRequest(root, { plan: planData.plan, mapping: tamperedMapping, split_review: planData.split_review })).result, 'blocked');
  });

  test('partition reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
    const outside = temporaryRoot(t, 'okf-146-no-repo-');
    assert.equal(run(partitionRequest(outside, { plan: { entries: [], executable: true }, mapping: [], split_review: [] })).result, 'not-configured');

    const root = repo(t);
    const request = partitionRequest(root, { plan: { entries: [], executable: true }, mapping: [], split_review: [] });
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
      warnings: [],
      blockers: [],
    };
  }

  test('a returned shard matching its own brief validates against the protocol', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
    const planData = derivedPlan(root, { 'docs/decisions/a.md': 'library' });
    const brief = partitionCompute(root, planData).data.shards[0].brief;

    const response = run(partitionRequest(root, { brief, shard: wellFormedShard(brief) }));
    assert.equal(response.result, 'ok');
    assert.equal(response.data.valid, true);
    assert.deepEqual(response.findings, []);
  });

  test('a worker may resolve an assigned source as a blocker instead of converting it', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/a.md', '---\ntype: Decision\n---\n# A\n');
    const planData = derivedPlan(root, { 'docs/decisions/a.md': 'library' });
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
    const planData = derivedPlan(root, { 'docs/decisions/a.md': 'library' });
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
});

test.describe("assembly into staged files", () => {

  function repo(t) {
    const root = temporaryRoot(t, 'okf-147-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
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

  function planRequest(root, sources, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
  }

  // Runs the real upstream pipeline (#142 -> #144/#145) so this file's own
  // fixtures exercise `assemble` against exactly the shape `migration-plan`
  // actually produces, never a hand-rolled stand-in for it. #203: every typed
  // source now also needs an accepted reader-purpose group before the plan is
  // executable, so `placement` (`{<source path>: <accepted group key>}`) names
  // one for every migrating source this fixture writes.
  function derivedPlan(root, placement) {
    const sources = discoverSources(root);
    const { response } = planWithGroups(run, (payload) => planRequest(root, sources, payload), { root, placement });
    assert.equal(response.data.plan.executable, true, 'fixture must resolve to an executable plan with no open question');
    return response.data;
  }

  function partitionCompute(root, planData, options = {}) {
    return run({
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'partition',
      payload: {
        cwd: root, plan: planData.plan, mapping: planData.mapping,
        split_review: planData.split_review, ...options,
      },
    });
  }

  // The shard object a well-behaved fresh-context worker returns for its own
  // brief: one concept per assigned `migrate` source, nothing blocked. #177: a
  // brief never assigns residue, so a shard never returns any.
  function wellFormedShard(brief, suffix = 'Converted.') {
    return {
      shard: brief.shard,
      concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\n${suffix}\n` })),
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

  function assembleRequest(root, partitioned, shardRefs, groupPackages, payload = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'assemble',
      payload: {
        cwd: root,
        partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
        shards: shardRefs,
        group_packages: groupPackages,
        ...payload,
      },
    };
  }

  // Partitions the plan, lets `buildShard` author (and, by default, stage)
  // each shard's own worker output, then calls `assemble`. `buildShard`
  // receives each shard descriptor (`{shard, sources, brief}`) and must return
  // the shard object to stage; the default author is `wellFormedShard`.
  // #203: `assemble` also demands the accepted concept-group packages exactly
  // as `migration-plan` returned them (`planData.group_packages`), the same
  // artifact `derivedPlan` above already carried out of that call.
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
    const response = run(assembleRequest(root, partitioned, shardRefs, planData.group_packages));
    return { partitioned, response };
  }

  function stagingRoot(root, bundle = 'okf') {
    return path.join(root, '.okf-staging', bundle);
  }

  // Every touched group gets its own staged `index.md` alongside its concepts
  // (#203), so a loop that only cares about concept-shaped staged entries reads
  // through this rather than repeating the same `kind !== 'index'` filter.
  function stagedConcepts(response) {
    return response.data.staged.filter((item) => item.kind !== 'index');
  }

  // #174: every staged entry carries the observation binding `publish` cites --
  // the concept's own source file and the SHA-256 of its exact bytes -- so the
  // documented flow (assemble's `data.staged` handed to `publish` unmodified)
  // binds a real source, never filler.
  test('staged entries bind each concept to its own source file identity', (t) => {
    const root = repo(t);
    write(root, 'docs/payments/refunds.md', '---\ntype: Decision\n---\n# Refunds\n');
    const planData = derivedPlan(root, { 'docs/payments/refunds.md': 'payments' });

    const { response } = assembleFixture(root, planData);
    assert.equal(response.result, 'ok');
    assert.ok(response.data.staged.length > 0);

    for (const item of stagedConcepts(response)) {
      const digest = require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(root, item.path))).digest('hex');
      assert.deepEqual(item.sources, [{ path: item.path, sha256: digest }], item.concept);
    }
  });

  // ------------------------------------------------------------- clean assembly

  test('N shards assemble cleanly into one staged file per concept', (t) => {
    const root = repo(t);
    write(root, 'docs/payments/refunds.md', '---\ntype: Decision\n---\n# Refunds\n');
    write(root, 'docs/auth/sso.md', '---\ntype: Decision\n---\n# SSO\n');
    write(root, 'research/spike.md', '# Spike\n');
    const planData = derivedPlan(root, {
      'docs/payments/refunds.md': 'library', 'docs/auth/sso.md': 'library', 'research/spike.md': 'library',
    });

    const { partitioned, response } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
    assert.equal(partitioned.data.shards.length, 3, 'fixture must actually exercise more than one shard');
    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.equal(response.data.publishable, true);
    const concepts = stagedConcepts(response);
    assert.equal(concepts.length, 3);
    // One shared group across all three concepts, so exactly its own one
    // `index.md` is staged alongside them, plus the derived root index the
    // accepted root package names (#203: the root gains that group).
    assert.equal(response.data.staged.length, 5);
    assert.deepEqual(response.data.blockers, []);
    assert.deepEqual(response.data.duplicates, []);

    for (const item of concepts) {
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
    // the same basename-only target within the same accepted group (#203's own
    // `conceptPathFor`), a collision `migration-plan`'s own check cannot see:
    // it only ever compares a candidate path against the bundle already
    // published on disk, never against a sibling entry in the very same plan.
    write(root, 'docs/team-a/decisions/postgres.md', '# Use Postgres (team A)\n');
    write(root, 'docs/team-b/decisions/postgres.md', '# Use Postgres (team B)\n');
    const planData = derivedPlan(root, {
      'docs/team-a/decisions/postgres.md': 'library', 'docs/team-b/decisions/postgres.md': 'library',
    });
    assert.equal(
      planData.mapping.filter((item) => item.concept === 'library/postgres').length,
      2,
      'fixture must actually produce a same-target collision migration-plan alone does not catch',
    );

    const { partitioned, response } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
    assert.equal(partitioned.data.shards.length, 2, 'fixture must force the two colliding sources into different shards');
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'CONCEPT_TARGET_COLLISION');
    assert.equal(response.data.collisions.length, 1);
    assert.equal(response.data.collisions[0].concept, 'library/postgres');
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
    const planData = derivedPlan(root, {
      'docs/team-a/decisions/one.md': 'library', 'docs/team-b/decisions/two.md': 'library',
    });

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
    assert.deepEqual(response.data.duplicates[0].concepts, ['library/one', 'library/two']);
    assert.equal(response.data.duplicates[0].shards.length, 2);
    const finding = response.findings.find((item) => item.code === 'ASSEMBLY_DUPLICATE_CANDIDATE');
    assert.ok(finding);
    assert.equal(finding.blocks, false);

    // Surfacing is as far as it goes: both concepts still stage, distinct.
    assert.deepEqual(stagedConcepts(response).map((item) => item.concept).sort(), ['library/one', 'library/two']);
  });

  test('a near duplicate is never merged, and neither concept is dropped', (t) => {
    const root = repo(t);
    write(root, 'docs/team-a/decisions/one.md', '# One\n');
    write(root, 'docs/team-b/decisions/two.md', '# Two\n');
    const planData = derivedPlan(root, {
      'docs/team-a/decisions/one.md': 'library', 'docs/team-b/decisions/two.md': 'library',
    });

    const { response } = assembleFixture(root, planData, {
      partitionOptions: { max_sources_per_shard: 1 },
      buildShard: (descriptor) => {
        const shard = wellFormedShard(descriptor.brief);
        shard.concepts = shard.concepts.map((item) => ({
          ...item,
          body: item.concept === 'library/one' ? '# Nearly identical, version A\n' : '# Nearly identical, version B\n',
        }));
        return shard;
      },
    });

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.duplicates, []);
    assert.deepEqual(stagedConcepts(response).map((item) => item.concept).sort(), ['library/one', 'library/two']);
    const bodies = stagedConcepts(response).map((item) => fs.readFileSync(path.join(root, item.file), 'utf8'));
    assert.notEqual(bodies[0], bodies[1]);
  });

  // -------------------------------------------------------------------- blockers

  test('a shard carrying a blocker marks the result partial and unpublishable, without losing the rest', (t) => {
    const root = repo(t);
    write(root, 'docs/team-a/decisions/one.md', '# One\n');
    write(root, 'docs/team-b/decisions/two.md', '# Two\n');
    const planData = derivedPlan(root, {
      'docs/team-a/decisions/one.md': 'library', 'docs/team-b/decisions/two.md': 'library',
    });

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
    assert.deepEqual(stagedConcepts(response).map((item) => item.concept), ['library/two']);
  });

  // ---------------------------------------------------------- nothing disappears

  // #177 (#157): "every partitioned source" is exactly the `migrate` set. Residue
  // is never partitioned, so it must be absent from every shard, every brief and
  // the assembled result -- while still being named once in the plan, and the
  // source file itself left untouched at its original path.
  test('every partitioned source is accounted for in the result, and residue is not among them', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/postgres.md', '# Use Postgres\n');
    write(root, 'assets/legacy.html', '<!DOCTYPE html>\n<html><body>legacy</body></html>\n');
    const planData = derivedPlan(root, { 'docs/decisions/postgres.md': 'library' });
    const migrating = planData.plan.entries.filter((entry) => entry.disposition === 'migrate').map((entry) => entry.path);
    const residue = planData.plan.entries.filter((entry) => entry.disposition === 'residue').map((entry) => entry.path);
    assert.ok(migrating.length > 0 && residue.length > 0, 'fixture must exercise both a migrate and a residue source');

    const { response, partitioned } = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
    assert.equal(response.result, 'ok');

    const accounted = [
      ...stagedConcepts(response).map((item) => item.path),
      ...response.data.blockers.map((item) => item.path),
    ].sort();
    assert.deepEqual(accounted, [...migrating].sort());

    // The residue source reaches no shard and no brief at all.
    for (const shard of partitioned.data.shards) {
      for (const source of residue) {
        assert.equal(shard.sources.includes(source), false, `${source} must not be partitioned`);
        assert.equal(shard.brief.mapping.some((item) => item.path === source), false);
      }
    }
    assert.equal(JSON.stringify(response).includes('assets/legacy.html'), false);
    // ...and it is still exactly where it started.
    assert.equal(fs.existsSync(path.join(root, 'assets', 'legacy.html')), true);
  });

  // --------------------------------------------------------- missing shard refused

  test('a shard missing from the set is refused rather than assembled partially', (t) => {
    const root = repo(t);
    write(root, 'docs/team-a/decisions/one.md', '# One\n');
    write(root, 'docs/team-b/decisions/two.md', '# Two\n');
    const planData = derivedPlan(root, {
      'docs/team-a/decisions/one.md': 'library', 'docs/team-b/decisions/two.md': 'library',
    });

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
    const planData = derivedPlan(root, { 'docs/payments/a.md': 'payments', 'docs/auth/b.md': 'auth' });

    const resolved = assembleFixture(root, planData, { partitionOptions: { max_sources_per_shard: 1 } });
    assert.equal(resolved.partitioned.data.cross_shard_links.length, 1, 'fixture must actually split the linked pair across shards');
    assert.equal(resolved.response.result, 'ok');
    assert.deepEqual(resolved.response.data.links.resolved, [{ from: 'payments/a', to: 'auth/b' }]);
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
    assert.equal(lost.response.data.links.lost[0].from, 'payments/a');
    assert.equal(lost.response.data.links.lost[0].to, 'auth/b');
    const finding = lost.response.findings.find((item) => item.code === 'MIGRATION_LINK_LOST');
    assert.ok(finding, 'a lost cross-shard link must name the relationship loss, distinct from an ordinary broken-link warning');
    assert.equal(finding.blocks, false);
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.detail.from, 'payments/a');
    assert.equal(finding.detail.to, 'auth/b');
  });

  // ---------------------------------------------------------------- wrapper wiring

  test('assemble reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
    const outside = temporaryRoot(t, 'okf-147-no-repo-');
    const emptyRequest = {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'assemble',
      payload: {
        cwd: outside,
        partition: { shards: [{ shard: 'x', sources: ['x.md'], brief: { shard: 'x', mapping: [], split_review: [], sources: ['x.md'] } }] },
        shards: [{ shard: 'x', path: 'x.json' }],
        group_packages: { packages: [], root: { purpose: 'Bundle root', index: { disposition: 'unchanged', title: 'Bundle' }, log: { disposition: 'none' }, children: [] }, indexes: [] },
      },
    };
    assert.equal(run(emptyRequest).result, 'not-configured');

    const root = repo(t);
    const request = { ...emptyRequest, payload: { ...emptyRequest.payload, cwd: root } };
    const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });
});

test.describe("worker split output mapping", () => {
  const SOURCE = 'docs/guide.md';
  const CONTENT = [
    '---',
    'type: Note',
    '---',
    '# Install',
    '',
    'Install the tool.',
    '',
    '# Operate',
    '',
    'Operate the tool.',
  ].join('\n');

  // #203 (#202): the shared accepted group every fixture below places both split
  // outputs in.
  const GROUP = 'content';

  function repo(t) {
    const root = temporaryRoot(t, 'okf-201-worker-mapping-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, SOURCE), CONTENT);
    return root;
  }

  function run(operation, root, payload) {
    return runWrapper(wrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
    });
  }

  function proposalOutput(output, title, order) {
    return {
      output,
      concept_id: `${GROUP}/${output}`,
      path: `${GROUP}/${output}.md`,
      type: 'Playbook',
      title,
      heading_outline: [{ level: 1, text: title }],
      reader_purpose_group: {
        key: GROUP,
        purpose: `Reader purpose for ${GROUP}.`,
        index_entry: { path: `${GROUP}/index.md`, title: `${GROUP} index` },
        child_entry: { concept_id: `${GROUP}/${output}`, path: `${GROUP}/${output}.md`, title, order },
      },
      provenance_assignments: [],
      link_routes: [],
      anchor_routes: [],
    };
  }

  function placementAnswers(placement) {
    return Object.fromEntries(
      Object.entries(placement).map(([source, group]) => [source, { reader_purpose_group: group }]),
    );
  }

  // #203 (#202): the two split outputs share one accepted reader-purpose group and
  // `migration-plan` asks for that placement before it derives any split review, so
  // the fixture drives the plan through `planWithGroups`. That seam builds the
  // accepted rows from plan-entry concepts -- for a reviewed source, its one
  // source-level concept -- so, like the other migrated #201 fixtures, the accepted
  // packages are rebuilt here from the real proposal output concepts and the plan
  // is run once more.
  function acceptedPlan(root) {
    const boundSources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
    const payload = {
      split_requested: [SOURCE],
      split_sections: [{
        path: SOURCE,
        sections: [
          { line_start: 1, line_end: 3, disposition: 'residue' },
          { line_start: 4, line_end: 7, disposition: 'assigned', output: 'install' },
          { line_start: 8, line_end: 10, disposition: 'assigned', output: 'operate' },
        ],
      }],
      split_proposals: [{
        path: SOURCE,
        result: 'split',
        keep_as_one_reason: null,
        accepted: true,
        outputs: [proposalOutput('install', 'Install', 1), proposalOutput('operate', 'Operate', 2)],
        provenance_exclusions: [],
        heading_changes: [],
        whole_source_link_routes: [],
      }],
    };
    const placement = { [SOURCE]: GROUP };
    const { response } = planWithGroups(
      (value) => runWrapper(wrapper, value),
      (extra) => ({
        protocol: 'okf-wrapper/1',
        skill: 'okf-setup',
        operation: 'migration-plan',
        payload: { cwd: root, sources: boundSources, ...extra },
      }),
      { root, bundle: 'okf', placement, payload },
    );
    const concepts = response.data.split_review.flatMap((item) => (
      item.proposal === null
        ? [response.data.plan.entries.find((entry) => entry.path === item.path).concept]
        : item.proposal.outputs.map((candidate) => candidate.concept_id)
    ));
    const accepted = packagesFor(root, 'okf', placement, concepts, {});
    const final = run('migration-plan', root, {
      ...accepted, ...payload, sources: boundSources, answers: placementAnswers(placement),
    });
    assert.equal(final.data.split_review[0].proposal.status, 'accepted', 'fixture proposal must be accepted');
    return final.data;
  }

  function partition(root, plan) {
    return run('partition', root, {
      plan: plan.plan,
      mapping: plan.mapping,
      split_review: plan.split_review,
    });
  }

  function workerResult(brief) {
    const review = brief.split_review[0];
    return {
      shard: brief.shard,
      concepts: review.proposal.outputs.map((output) => ({
        path: review.path,
        output: output.output,
        concept: output.concept_id,
        type: output.type,
        sections: review.outputs.find((item) => item.output === output.output).sections.map((section) => ({ ...section })),
        body: `# ${output.title}\n`,
      })),
      warnings: [],
      blockers: [],
    };
  }

  function stage(root, shard) {
    const relative = '.okf-staging/shards/worker.json';
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), JSON.stringify(shard));
    return relative;
  }

  function validate(root, brief, shard) {
    return run('partition', root, { brief, shard });
  }

  function assemble(root, partitioned, shard, plan) {
    return run('assemble', root, {
      partition: {
        shards: partitioned.data.shards,
        cross_shard_links: partitioned.data.cross_shard_links,
      },
      shards: [{ shard: shard.shard, path: stage(root, shard) }],
      group_packages: plan.group_packages,
    });
  }

  function assertRefused(response, code, detail) {
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.equal(response.findings.length, 1);
    assert.equal(response.findings[0].code, code);
    assert.deepEqual(response.findings[0].detail, detail);
    assert.equal(response.findings[0].blocks, true);
  }

  function assertNothingStaged(root) {
    assert.equal(fs.existsSync(path.join(root, '.okf-staging', 'okf')), false);
  }

  test('partition carries the accepted mapping unchanged and assemble accepts its exact worker result', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);

    assert.equal(partitioned.result, 'ok');
    const brief = partitioned.data.shards[0].brief;
    assert.deepEqual(brief.split_review, plan.split_review);

    const shard = workerResult(brief);
    assert.equal(validate(root, brief, shard).data.valid, true);
    const assembled = assemble(root, partitioned, shard, plan);
    assert.equal(assembled.result, 'ok');
    assert.deepEqual(
      assembled.data.staged.filter((item) => item.kind !== 'index').map((item) => item.concept),
      [`${GROUP}/install`, `${GROUP}/operate`],
    );
  });

  test('an added worker output is refused by validation and assembly', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);
    const brief = partitioned.data.shards[0].brief;
    const shard = workerResult(brief);
    shard.concepts.push({
      path: SOURCE, output: 'repair', concept: 'repair', type: 'Playbook',
      sections: [{ line_start: 4, line_end: 7 }], body: '# Repair\n',
    });
    const detail = { path: SOURCE, output: 'repair' };

    assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_ADDED', detail);
    assertRefused(assemble(root, partitioned, shard, plan), 'SHARD_SPLIT_OUTPUT_ADDED', { shard: brief.shard, ...detail });
  });

  test('a dropped worker output is refused by validation and assembly', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);
    const brief = partitioned.data.shards[0].brief;
    const shard = workerResult(brief);
    shard.concepts = shard.concepts.filter((item) => item.output !== 'operate');
    const detail = { path: SOURCE, output: 'operate' };

    assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', detail);
    assertRefused(assemble(root, partitioned, shard, plan), 'SHARD_SPLIT_OUTPUT_DROPPED', { shard: brief.shard, ...detail });
  });

  test('a source-level blocker cannot replace accepted outputs', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);
    const brief = partitioned.data.shards[0].brief;
    const shard = workerResult(brief);
    shard.concepts = [];
    shard.blockers = [{ path: SOURCE, reason: 'worker could not transform the source' }];
    const detail = { path: SOURCE, output: 'install' };

    assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', detail);
    assertRefused(assemble(root, partitioned, shard, plan), 'SHARD_SPLIT_OUTPUT_DROPPED', { shard: brief.shard, ...detail });
  });

  test('a section moved to another worker output is refused by validation and assembly', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);
    const brief = partitioned.data.shards[0].brief;
    const shard = workerResult(brief);
    const moved = shard.concepts[0].sections[0];
    shard.concepts[0].sections = [];
    shard.concepts[1].sections.push(moved);
    const detail = {
      path: SOURCE,
      line_start: 4,
      line_end: 7,
      expected_output: 'install',
      actual_output: 'operate',
    };

    assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_SECTION_MOVED', detail);
    assertRefused(assemble(root, partitioned, shard, plan), 'SHARD_SPLIT_SECTION_MOVED', { shard: brief.shard, ...detail });
  });

  test('worker output identity and accepted section and output order cannot change', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const partitioned = partition(root, plan);
    const brief = partitioned.data.shards[0].brief;
    const cases = [
      [
        (shard) => { shard.concepts[0].concept = 'renamed'; },
        'SHARD_SPLIT_OUTPUT_CHANGED',
        { path: SOURCE, output: 'install', field: 'concept_id', expected: `${GROUP}/install`, actual: 'renamed' },
      ],
      [
        (shard) => { shard.concepts.reverse(); },
        'SHARD_SPLIT_OUTPUT_REORDERED',
        { path: SOURCE, output: 'operate', expected_order: 2, actual_order: 1 },
      ],
      [
        (shard) => { shard.concepts[0].renamed_output = 'install-v2'; },
        'SHARD_UNKNOWN_FIELD',
        { field: 'renamed_output' },
      ],
    ];

    for (const [change, code, detail] of cases) {
      const shard = workerResult(brief);
      change(shard);
      assertRefused(validate(root, brief, shard), code, detail);
      assertRefused(assemble(root, partitioned, shard, plan), code, { shard: brief.shard, ...detail });
    }
  });

  test('an empty accepted proposal is refused at compute, validate, and assemble', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const empty = structuredClone(plan.split_review);
    empty[0].sections = [];
    empty[0].outputs = [];
    empty[0].proposal.outputs = [];
    const detail = { path: SOURCE, reason: 'accepted_output_count' };

    assertRefused(partition(root, { ...plan, split_review: empty }), 'SPLIT_WORKER_REVIEW_INVALID', detail);

    const partitioned = partition(root, plan);
    const brief = structuredClone(partitioned.data.shards[0].brief);
    brief.split_review = empty;
    const shard = workerResult(partitioned.data.shards[0].brief);
    shard.concepts = [];
    assertRefused(validate(root, brief, shard), 'SPLIT_WORKER_REVIEW_INVALID', detail);
    partitioned.data.shards[0].brief = brief;
    assertRefused(assemble(root, partitioned, shard, plan), 'SPLIT_WORKER_REVIEW_INVALID', { shard: brief.shard, ...detail });
    assertNothingStaged(root);
  });

  test('a missing accepted review row is refused by compute, validate, and assemble', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const detail = { missing: [SOURCE], extra: [], duplicate: [] };
    assertRefused(partition(root, { ...plan, split_review: [] }), 'SPLIT_WORKER_REVIEW_SET_MISMATCH', detail);

    const partitioned = partition(root, plan);
    const brief = structuredClone(partitioned.data.shards[0].brief);
    const shard = workerResult(brief);
    brief.split_review = [];

    assertRefused(validate(root, brief, shard), 'SPLIT_WORKER_REVIEW_SET_MISMATCH', detail);
    partitioned.data.shards[0].brief = brief;
    assertRefused(assemble(root, partitioned, shard, plan), 'SPLIT_WORKER_REVIEW_SET_MISMATCH', { shard: brief.shard, ...detail });
    assertNothingStaged(root);
  });

  test('duplicate parent or output section accounting is refused by validate and assemble', (t) => {
    const cases = [
      [
        (review) => review.sections.push({ ...review.sections[1] }),
        { path: SOURCE, reason: 'duplicate_parent_range', line_start: 4, line_end: 7 },
      ],
      [
        (review) => review.outputs[0].sections.push({ ...review.outputs[0].sections[0] }),
        { path: SOURCE, reason: 'duplicate_output_range', line_start: 4, line_end: 7 },
      ],
      [
        (review) => { review.sections[1].output = 'operate'; },
        { path: SOURCE, reason: 'section_assignment' },
      ],
    ];

    for (const [mutate, detail] of cases) {
      const root = repo(t);
      const plan = acceptedPlan(root);
      const partitioned = partition(root, plan);
      const brief = structuredClone(partitioned.data.shards[0].brief);
      const shard = workerResult(brief);
      mutate(brief.split_review[0]);

      assertRefused(validate(root, brief, shard), 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH', detail);
      partitioned.data.shards[0].brief = brief;
      assertRefused(assemble(root, partitioned, shard, plan), 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH', { shard: brief.shard, ...detail });
      assertNothingStaged(root);
    }
  });
});
