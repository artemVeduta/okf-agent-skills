const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');

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

function proposalOutput(output, title) {
  return {
    output,
    concept_id: output,
    path: `${output}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: null,
    provenance_assignments: [],
    link_routes: [],
    anchor_routes: [],
  };
}

function acceptedPlan(root) {
  const sources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
  const split_sections = [{
    path: SOURCE,
    sections: [
      { line_start: 1, line_end: 3, disposition: 'residue' },
      { line_start: 4, line_end: 7, disposition: 'assigned', output: 'install' },
      { line_start: 8, line_end: 10, disposition: 'assigned', output: 'operate' },
    ],
  }];
  const split_proposals = [{
    path: SOURCE,
    result: 'split',
    keep_as_one_reason: null,
    accepted: true,
    outputs: [proposalOutput('install', 'Install'), proposalOutput('operate', 'Operate')],
    provenance_exclusions: [],
    heading_changes: [],
    whole_source_link_routes: [],
  }];
  const response = run('migration-plan', root, {
    sources, split_requested: [SOURCE], split_sections, split_proposals,
  });
  assert.equal(response.data.split_review[0].proposal.status, 'accepted', 'fixture proposal must be accepted');
  return response.data;
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

function assemble(root, partitioned, shard) {
  return run('assemble', root, {
    partition: {
      shards: partitioned.data.shards,
      cross_shard_links: partitioned.data.cross_shard_links,
    },
    shards: [{ shard: shard.shard, path: stage(root, shard) }],
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

test('partition carries the accepted mapping unchanged and assemble accepts its exact worker result', (t) => {
  const root = repo(t);
  const plan = acceptedPlan(root);
  const partitioned = partition(root, plan);

  assert.equal(partitioned.result, 'ok');
  const brief = partitioned.data.shards[0].brief;
  assert.deepEqual(brief.split_review, plan.split_review);

  const shard = workerResult(brief);
  assert.equal(validate(root, brief, shard).data.valid, true);
  const assembled = assemble(root, partitioned, shard);
  assert.equal(assembled.result, 'ok');
  assert.deepEqual(assembled.data.staged.map((item) => item.concept), ['install', 'operate']);
});

test('an added worker output is refused by validation and assembly', (t) => {
  const root = repo(t);
  const partitioned = partition(root, acceptedPlan(root));
  const brief = partitioned.data.shards[0].brief;
  const shard = workerResult(brief);
  shard.concepts.push({
    path: SOURCE, output: 'repair', concept: 'repair', type: 'Playbook',
    sections: [{ line_start: 4, line_end: 7 }], body: '# Repair\n',
  });
  const detail = { path: SOURCE, output: 'repair' };

  assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_ADDED', detail);
  assertRefused(assemble(root, partitioned, shard), 'SHARD_SPLIT_OUTPUT_ADDED', { shard: brief.shard, ...detail });
});

test('a dropped worker output is refused by validation and assembly', (t) => {
  const root = repo(t);
  const partitioned = partition(root, acceptedPlan(root));
  const brief = partitioned.data.shards[0].brief;
  const shard = workerResult(brief);
  shard.concepts = shard.concepts.filter((item) => item.output !== 'operate');
  const detail = { path: SOURCE, output: 'operate' };

  assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', detail);
  assertRefused(assemble(root, partitioned, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', { shard: brief.shard, ...detail });
});

test('a source-level blocker cannot replace accepted outputs', (t) => {
  const root = repo(t);
  const partitioned = partition(root, acceptedPlan(root));
  const brief = partitioned.data.shards[0].brief;
  const shard = workerResult(brief);
  shard.concepts = [];
  shard.blockers = [{ path: SOURCE, reason: 'worker could not transform the source' }];
  const detail = { path: SOURCE, output: 'install' };

  assertRefused(validate(root, brief, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', detail);
  assertRefused(assemble(root, partitioned, shard), 'SHARD_SPLIT_OUTPUT_DROPPED', { shard: brief.shard, ...detail });
});

test('a section moved to another worker output is refused by validation and assembly', (t) => {
  const root = repo(t);
  const partitioned = partition(root, acceptedPlan(root));
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
  assertRefused(assemble(root, partitioned, shard), 'SHARD_SPLIT_SECTION_MOVED', { shard: brief.shard, ...detail });
});

test('worker output identity and accepted section and output order cannot change', (t) => {
  const root = repo(t);
  const partitioned = partition(root, acceptedPlan(root));
  const brief = partitioned.data.shards[0].brief;
  const cases = [
    [
      (shard) => { shard.concepts[0].concept = 'renamed'; },
      'SHARD_SPLIT_OUTPUT_CHANGED',
      { path: SOURCE, output: 'install', field: 'concept_id', expected: 'install', actual: 'renamed' },
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
    assertRefused(assemble(root, partitioned, shard), code, { shard: brief.shard, ...detail });
  }
});
