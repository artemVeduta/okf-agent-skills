const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
  const root = temporaryRoot(t, 'okf-201-semantic-review-');
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
  const response = run('migration-plan', root, {
    sources,
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
      outputs: [proposalOutput('install', 'Install'), proposalOutput('operate', 'Operate')],
      provenance_exclusions: [],
      heading_changes: [],
      whole_source_link_routes: [],
    }],
  });
  assert.equal(response.data.split_review[0].proposal.status, 'accepted', 'fixture proposal must be accepted');
  return response.data;
}

function assemble(root, plan) {
  const partitioned = run('partition', root, {
    plan: plan.plan,
    mapping: plan.mapping,
    references: plan.references,
    split_review: plan.split_review,
  });
  const brief = partitioned.data.shards[0].brief;
  const review = brief.split_review[0];
  const shard = {
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
  const shardPath = '.okf-staging/shards/worker.json';
  fs.mkdirSync(path.dirname(path.join(root, shardPath)), { recursive: true });
  fs.writeFileSync(path.join(root, shardPath), JSON.stringify(shard));
  const response = run('assemble', root, {
    partition: {
      shards: partitioned.data.shards,
      cross_shard_links: partitioned.data.cross_shard_links,
    },
    shards: [{ shard: shard.shard, path: shardPath }],
  });
  assert.equal(response.result, 'ok', 'fixture assembly must pass');
}

function identity(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function accepted(review) {
  return {
    sections: structuredClone(review.sections),
    outputs: structuredClone(review.outputs),
    proposal: structuredClone(review.proposal),
  };
}

function candidateBindings(root) {
  return ['install.md', 'operate.md'].map((candidatePath) => ({
    path: candidatePath,
    identity: identity(fs.readFileSync(path.join(root, '.okf-staging', 'okf', candidatePath))),
  }));
}

function semanticReview(root, plan, verdict = 'preserved', performed = false) {
  const review = plan.split_review[0];
  return {
    performed,
    candidates: candidateBindings(root),
    sources: [{
      path: review.path,
      source_identity: review.source_identity,
      accepted: accepted(review),
      sections: review.sections.map((section) => ({
        line_start: section.line_start,
        line_end: section.line_end,
        verdict,
      })),
    }],
  };
}

function validate(root, plan, semantic_review) {
  return run('migration-validate', root, {
    selected: [SOURCE],
    plan: plan.plan,
    split_review: plan.split_review,
    semantic_review,
  });
}

function fixture(t) {
  const root = repo(t);
  const plan = acceptedPlan(root);
  assemble(root, plan);
  return { root, plan };
}

for (const [verdict, passed] of [
  ['preserved', true],
  ['missing', false],
  ['duplicated', false],
  ['uncertain', false],
]) {
  test(`a ${verdict} section verdict ${passed ? 'passes' : 'fails'} agent semantic review`, (t) => {
    const { root, plan } = fixture(t);
    const response = validate(root, plan, semanticReview(root, plan, verdict));

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.agent_semantic_review, { passed });
    assert.equal(response.data.publishable, passed);
    const semanticFindings = response.findings.filter((item) => item.code.startsWith('SEMANTIC_SECTION_'));
    assert.equal(semanticFindings.length, passed ? 0 : plan.split_review[0].sections.length);
    if (!passed) assert.ok(semanticFindings.every((item) => item.code === `SEMANTIC_SECTION_${verdict.toUpperCase()}`));
  });
}

test('structural coverage, agent review, and human fidelity are reported separately', (t) => {
  const { root, plan } = fixture(t);
  fs.writeFileSync(path.join(root, '.okf-staging', 'okf', 'install.md'), '---\ntitle: no type\n---\n# Install\n');
  const response = validate(root, plan, semanticReview(root, plan, 'preserved', false));

  assert.deepEqual(response.data.structural_coverage, { passed: false });
  assert.deepEqual(response.data.agent_semantic_review, { passed: true });
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
  assert.equal(response.data.publishable, false);
});

test('section review coverage refuses malformed, missing, duplicate, extra, and mismatched rows', (t) => {
  const { root, plan } = fixture(t);
  const cases = [
    ['malformed', (review) => { review.sources[0].sections[0].verdict = 'pass'; }, 'SEMANTIC_REVIEW_MALFORMED'],
    ['missing', (review) => { review.sources[0].sections.pop(); }, 'SEMANTIC_REVIEW_SECTION_SET_MISMATCH'],
    ['duplicate', (review) => { review.sources[0].sections.push({ ...review.sources[0].sections[0] }); }, 'SEMANTIC_REVIEW_SECTION_SET_MISMATCH'],
    ['extra', (review) => { review.sources[0].sections.push({ line_start: 11, line_end: 12, verdict: 'preserved' }); }, 'SEMANTIC_REVIEW_SECTION_SET_MISMATCH'],
    ['mismatched', (review) => { review.sources[0].sections[0].line_end += 1; }, 'SEMANTIC_REVIEW_SECTION_SET_MISMATCH'],
  ];

  for (const [name, mutate, code] of cases) {
    const review = semanticReview(root, plan);
    mutate(review);
    const response = validate(root, plan, review);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
    assert.equal(response.findings[0].code, code, name);
  }
});

test('a malformed accepted review is refused instead of causing a runtime failure', (t) => {
  const { root, plan } = fixture(t);
  const split_review = structuredClone(plan.split_review);
  delete split_review[0].proposal.outputs;
  const response = run('migration-validate', root, {
    selected: [SOURCE], plan: plan.plan, split_review, semantic_review: semanticReview(root, plan),
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.findings[0].code, 'SEMANTIC_REVIEW_MALFORMED');
});

test('freshness refuses changed source, accepted mapping, candidate content, or candidate set bindings', (t) => {
  const { root, plan } = fixture(t);
  const cases = [
    ['source', (review) => { review.sources[0].source_identity = identity('old source'); }, 'SEMANTIC_REVIEW_SOURCE_MISMATCH'],
    ['accepted', (review) => { review.sources[0].accepted.proposal.outputs[0].title = 'Old title'; }, 'SEMANTIC_REVIEW_ACCEPTED_MISMATCH'],
    ['candidate content', (review) => { review.candidates[0].identity = identity('old candidate'); }, 'SEMANTIC_REVIEW_CANDIDATE_MISMATCH'],
    ['candidate set', (review) => { review.candidates.pop(); }, 'SEMANTIC_REVIEW_CANDIDATE_MISMATCH'],
    ['changed candidate set', (_review, fixtureRoot) => {
      fs.writeFileSync(path.join(fixtureRoot, '.okf-staging', 'okf', 'extra.md'), '---\ntype: Note\n---\n# Extra\n');
    }, 'SEMANTIC_REVIEW_CANDIDATE_MISMATCH'],
  ];

  for (const [name, mutate, code] of cases) {
    const review = semanticReview(root, plan);
    mutate(review, root);
    const response = validate(root, plan, review);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
    assert.equal(response.findings[0].code, code, name);
  }
});
