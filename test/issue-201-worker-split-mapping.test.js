const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
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
    references: plan.references,
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
    references: [],
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
