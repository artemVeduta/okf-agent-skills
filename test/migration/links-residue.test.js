/*
 * Domain: migration (spans evidence for the residue report shape).
 *
 * `migration-plan` link rewriting across directories and fragments, immunity of
 * fenced code blocks, and residue that is recorded once, never partitioned and
 * never copied.
 *
 * These are wrapper-process tests: every assertion below runs the real
 * `scripts/okf-setup.js` as a process, the one tested contract seam.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../../test-support/snapshot');
const { planWithGroups } = require('../../test-support/groups');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');

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

function mappingFor(response, sourcePath) {
  return response.data.mapping.find((item) => item.path === sourcePath);
}

test.describe('a rewritten link keeps its #fragment, and a bare sibling name is treated like a ./-prefixed one', () => {
  // #159. Only the two `#fragment` tests pin a fix. The two bare-sibling tests
  // are regression pins, not fix proof: `path.posix.join` already normalized
  // `x.md` and `./x.md` identically, so they pass against the pre-fix rewriter
  // too. The defect the issue reported for a bare sibling had another cause,
  // and these tests hold the behavior that was never broken.

  function repo(t) {
    const root = temporaryRoot(t, 'okf-159-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    // #203: an accepted root package's default `index` disposition is
    // `unchanged`, which claims `okf/index.md` already exists -- so every
    // fixture needs one.
    fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
    return root;
  }

  // #203: every source below needs its own accepted reader-purpose group before
  // it can migrate -- `placement` names it the same way `test-support/groups.js`
  // expects, `{ '<source path>': '<accepted group key>' }`.
  function planned(root, placement) {
    const sources = discoverSources(root);
    const request = (payload) => planRequest(root, sources, payload);
    return planWithGroups(run, request, { root, placement }).response;
  }

  test('a rewritten link keeps its #fragment, in both bare and angle-bracket target syntax', (t) => {
    const root = repo(t);
    write(root, 'docs/adr/0001-first.md', [
      '---', 'type: Decision', '---', '# First', '',
      'See [a section](./0002-second.md#acceptance-evidence) and [angled](<0002-second.md#other>).', '',
    ].join('\n'));
    write(root, 'docs/adr/0002-second.md', '---\ntype: Decision\n---\n# Second\n\nBody.\n');

    const placement = { 'docs/adr/0001-first.md': 'decisions', 'docs/adr/0002-second.md': 'decisions' };
    const body = mappingFor(planned(root, placement), 'docs/adr/0001-first.md').body;
    assert.ok(body.includes('[a section](0002-second.md#acceptance-evidence)'), body);
    assert.ok(body.includes('[angled](<0002-second.md#other>)'), body);
  });

  test('a rewritten link keeps a #fragment even when the concept path moves the target to another directory', (t) => {
    const root = repo(t);
    write(root, 'docs/adr/0001-first.md', [
      '---', 'type: Decision', '---', '# First', '',
      'See [the constraint](../spec/limits.md#acceptance-evidence).', '',
    ].join('\n'));
    write(root, 'docs/spec/limits.md', '---\ntype: Constraint\n---\n# Limits\n\nBody.\n');

    const placement = { 'docs/adr/0001-first.md': 'decisions', 'docs/spec/limits.md': 'constraints' };
    const body = mappingFor(planned(root, placement), 'docs/adr/0001-first.md').body;
    assert.ok(body.includes('[the constraint](../constraints/limits.md#acceptance-evidence)'), body);
  });

  test('a bare sibling filename is rewritten exactly like a ./-prefixed one', (t) => {
    const root = repo(t);
    write(root, 'docs/research/deep/skills.md', [
      '---', 'type: Research', '---', '# Skills', '',
      'Bare [one](symlinks.md), dotted [two](./symlinks.md).', '',
    ].join('\n'));
    write(root, 'docs/research/deep/symlinks.md', '---\ntype: Research\n---\n# Symlinks\n\nBody.\n');

    const placement = { 'docs/research/deep/skills.md': 'research', 'docs/research/deep/symlinks.md': 'research' };
    const response = planned(root, placement);
    assert.equal(response.data.plan.entries.find((i) => i.path === 'docs/research/deep/symlinks.md').concept, 'research/symlinks');
    const body = mappingFor(response, 'docs/research/deep/skills.md').body;
    assert.ok(body.includes('Bare [one](symlinks.md), dotted [two](symlinks.md).'), body);
  });

  test('a bare sibling filename whose target lands in another type directory is rewritten, not left as a source filename', (t) => {
    const root = repo(t);
    write(root, 'docs/research/deep/skills.md', [
      '---', 'type: Research', '---', '# Skills', '',
      'Bare [one](rules.md), dotted [two](./rules.md).', '',
    ].join('\n'));
    write(root, 'docs/research/deep/rules.md', '---\ntype: Constraint\n---\n# Rules\n\nBody.\n');

    const placement = { 'docs/research/deep/skills.md': 'research', 'docs/research/deep/rules.md': 'constraints' };
    const body = mappingFor(planned(root, placement), 'docs/research/deep/skills.md').body;
    assert.ok(body.includes('Bare [one](../constraints/rules.md), dotted [two](../constraints/rules.md).'), body);
  });
});

test.describe('a link is re-expressed from the concept\'s new directory depth', () => {
  // #188: link rewriting keyed the target path only on whether it collapsed
  // inside the bundle, ignoring the change of directory depth between a
  // source's own directory and its concept's directory. A link whose target was
  // not itself migrated (stays at its original project path) was returned
  // untouched, which is only correct when source and concept sit at the same
  // depth.

  function repo(t) {
    const root = temporaryRoot(t, 'okf-188-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    // #203: an accepted root package's default `index` disposition is
    // `unchanged`, which claims `okf/index.md` already exists -- so every
    // fixture needs one.
    fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
    return root;
  }

  // #203: every source below needs its own accepted reader-purpose group before
  // it can migrate -- `placement` names it the same way `test-support/groups.js`
  // expects, `{ '<source path>': '<accepted group key>' }`. `sources`, when
  // supplied, overrides the discovered set (the disposition-class test
  // hand-builds extra entries).
  function planned(root, placement, sources) {
    const request = (payload) => planRequest(root, sources || discoverSources(root), payload);
    return planWithGroups(run, request, { root, placement }).response;
  }

  function unresolvedLinkFindings(response) {
    return response.findings.filter((f) => f.code === 'plan_link_unresolved');
  }

  test('a link to an unmigrated target is re-expressed from the concept\'s new (deeper) directory', (t) => {
    const root = repo(t);
    // Source sits one level below the repo root ("docs/"); its concept
    // ("research/notes") sits under the bundle at "okf/research/", two levels
    // deep. This is the exact evidence case #188 cites.
    write(root, 'docs/notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      'See [the eval setup](../eval/README.md).', '',
    ].join('\n'));
    write(root, 'eval/README.md', '# Eval\n');

    const body = mappingFor(planned(root, { 'docs/notes.md': 'research' }), 'docs/notes.md').body;
    assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
  });

  test('a link to an unmigrated target is re-expressed from the concept\'s new (shallower) directory', (t) => {
    const root = repo(t);
    // Source sits three levels below the repo root; its concept ("decisions/foo")
    // sits under the bundle at "okf/decisions/", only two levels deep.
    write(root, 'docs/adr/sub/0001-foo.md', [
      '---', 'type: Decision', '---', '# Foo', '',
      'See [the eval setup](../../../eval/README.md).', '',
    ].join('\n'));
    write(root, 'eval/README.md', '# Eval\n');

    const body = mappingFor(planned(root, { 'docs/adr/sub/0001-foo.md': 'decisions' }), 'docs/adr/sub/0001-foo.md').body;
    assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
  });

  test('a root-relative link target is resolved against the repository root, not the source\'s own directory', (t) => {
    const root = repo(t);
    write(root, 'docs/research/notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      'See [the eval setup](/eval/README.md).', '',
    ].join('\n'));
    write(root, 'eval/README.md', '# Eval\n');

    const body = mappingFor(planned(root, { 'docs/research/notes.md': 'research' }), 'docs/research/notes.md').body;
    assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
  });

  test('a link to a migrated target still rewrites to that target\'s concept path, and is not reported unresolved', (t) => {
    const root = repo(t);
    write(root, 'notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      'See [the comparison](other.md).', '',
    ].join('\n'));
    write(root, 'other.md', '---\ntype: Research\n---\n# Other\n\nBody.\n');

    const response = planned(root, { 'notes.md': 'research', 'other.md': 'research' });
    const body = mappingFor(response, 'notes.md').body;
    assert.ok(body.includes('[the comparison](other.md)'), body);
    assert.deepEqual(unresolvedLinkFindings(response), []);
  });

  test('a link whose target is not part of this migration at all is still re-expressed from the concept\'s new directory, and reported unresolved as class "unknown" before anything is written', (t) => {
    const root = repo(t);
    write(root, 'notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      'See [nothing here](missing/nowhere.md).', '',
    ].join('\n'));

    const response = planned(root, { 'notes.md': 'research' });
    const body = mappingFor(response, 'notes.md').body;
    assert.ok(body.includes('[nothing here](../../missing/nowhere.md)'), body);
    assert.deepEqual(unresolvedLinkFindings(response), [{
      code: 'plan_link_unresolved',
      origin: 'suite',
      severity: 'warning',
      blocks: false,
      detail: { path: 'notes.md', resource: 'missing/nowhere.md', class: 'unknown' },
    }]);
  });

  // #188 bullet 4: a link's target can also name a source this same batch already
  // classified one way or the other -- its own disposition is the reported class,
  // distinguishing "this used to be reachable and this migration decided not to
  // bring it in" from "this never existed at all" (the `unknown` class above).
  // The target source is never written to disk: `classify` reads a markdown
  // source's own file gracefully-empty when it is missing (see `readSource` in
  // migration.js), and a non-markdown `sources` entry is never read at all, so a
  // hand-built entry exercises this without needing a real file on disk -- the
  // same fixture shape discovery.js's own classifiers would have produced.
  test('a link to a source this batch chose not to migrate is reported unresolved with that source\'s own disposition as its class', (t) => {
    const root = repo(t);
    write(root, 'notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      'See [an unsupported note](wiki.md) and [an unresolved type](untyped.md).', '',
    ].join('\n'));

    const sources = [
      ...discoverSources(root),
      { path: 'wiki.md', category: 'unsupported', format: 'obsidian', reason: 'obsidian_construct' },
      { path: 'untyped.md', category: 'markdown', format: 'markdown', reason: 'markdown' },
    ];
    const response = planned(root, { 'notes.md': 'research' }, sources);

    const classes = unresolvedLinkFindings(response).map((f) => f.detail).sort((a, b) => (a.path + a.resource).localeCompare(b.path + b.resource));
    assert.deepEqual(classes, [
      { path: 'notes.md', resource: 'untyped.md', class: 'blocked_pending_decision' },
      { path: 'notes.md', resource: 'wiki.md', class: 'residue' },
    ]);
  });

  test('a link inside a fenced code block is left untouched even when the concept moves directories', (t) => {
    const root = repo(t);
    write(root, 'notes.md', [
      '---', 'type: Research', '---', '# Notes', '',
      '```', 'See [the eval setup](eval/README.md).', '```', '',
    ].join('\n'));
    write(root, 'eval/README.md', '# Eval\n');

    const body = mappingFor(planned(root, { 'notes.md': 'research' }), 'notes.md').body;
    assert.ok(body.includes('```\nSee [the eval setup](eval/README.md).\n```'), body);
  });
});

test.describe('migration residue is report-only', () => {
  // #177 (#157). An unsupported source is named once in `data.plan`, left
  // exactly where it is, and reported at the end as unchanged. It is never given
  // a target path, never copied, never partitioned into a shard, never returned
  // by a worker, never assembled, staged, validated or published. Approved
  // residue is a successful terminal result -- `partial` is reserved for
  // unresolved or failed work.

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

  // ----------------------------------------------- no target path, no copy

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

  // ----------------------------------------------------- never partitioned

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

  // --------------------------------------------------------- exact report

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
});
