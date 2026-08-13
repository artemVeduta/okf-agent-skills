const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../../test-support/groups');
const runtime = require('../../scripts/lib/runtime');
const defaultServices = require('../../scripts/lib/services');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');
const SOURCE = 'docs/guide.md';
// #203 (#202): every substantive output belongs to an accepted reader-purpose
// group, and `migration-plan` asks for that group rather than deriving it, so
// every fixture below drives its plan through `planWithGroups` with one accepted
// group for both split outputs.
const GROUP = 'content';
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
  // The accepted root package's derived index disposition names the root index
  // (`updated`: the bundle carries one and the root gains the accepted group),
  // so the bundle root must actually carry one.
  fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
  return root;
}

function run(operation, root, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
  });
}

// Both outputs of one proposal claim the same group, so they must carry the
// same group definition -- one shared index row for the group they share.
const GROUP_PURPOSE = 'How people use the tool.';
const GROUP_INDEX = { path: `${GROUP}/index.md`, title: `${GROUP} index` };

function navigationFor(conceptId, title, order) {
  return {
    key: GROUP,
    purpose: GROUP_PURPOSE,
    index_entry: GROUP_INDEX,
    child_entry: { concept_id: conceptId, path: `${conceptId}.md`, title, order },
  };
}

function proposalOutput(output, title, order) {
  const conceptId = `${GROUP}/${output}`;
  return {
    output,
    concept_id: conceptId,
    path: `${conceptId}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: navigationFor(conceptId, title, order),
    provenance_assignments: [],
    link_routes: [],
    anchor_routes: [],
  };
}

function acceptedPlan(root) {
  const sources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
  // The accepted package set names the two split outputs as the group's own
  // children -- the same rows the conformance gate later proves the staged
  // tree against.
  const packages = packagesFor(root, 'okf', { [SOURCE]: GROUP }, [`${GROUP}/install`, `${GROUP}/operate`], {});
  const { response } = planWithGroups((value) => runWrapper(wrapper, value), (extra) => ({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources, ...extra },
  }), {
    root,
    placement: { [SOURCE]: GROUP },
    payload: {
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
      ...packages,
    },
  });
  assert.equal(response.data.split_review[0].proposal.status, 'accepted', 'fixture proposal must be accepted');
  return response.data;
}

function assemble(root, plan) {
  const partitioned = run('partition', root, {
    plan: plan.plan,
    mapping: plan.mapping,
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
    group_packages: plan.group_packages,
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
  // The staged tree is the two split concepts, the group's own navigation
  // index, and the derived root index, in the sorted order the canonical
  // candidate scan reports.
  return ['index.md', `${GROUP}/index.md`, `${GROUP}/install.md`, `${GROUP}/operate.md`]
    .sort()
    .map((candidatePath) => ({
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
    group_packages: plan.group_packages,
  });
}

function validateWith(root, plan, semantic_review, split_review, services) {
  return runtime.run('okf-setup', {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: {
      cwd: root,
      selected: [SOURCE],
      plan: plan.plan,
      split_review,
      semantic_review,
      group_packages: plan.group_packages,
    },
  }, { ...defaultServices, ...services });
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
  fs.writeFileSync(path.join(root, '.okf-staging', 'okf', `${GROUP}/install.md`), '---\ntitle: no type\n---\n# Install\n');
  const response = validate(root, plan, semanticReview(root, plan, 'preserved', false));

  assert.deepEqual(response.data.structural_coverage, { passed: false });
  assert.deepEqual(response.data.agent_semantic_review, { passed: true });
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
  assert.equal(response.data.publishable, false);
});

test('the result returns a canonical checked semantic review binding', (t) => {
  const { root, plan } = fixture(t);
  const submitted = semanticReview(root, plan, 'preserved', true);
  submitted.candidates.reverse();
  const response = validate(root, plan, submitted);
  const acceptedReview = plan.split_review[0];

  assert.deepEqual(response.data.semantic_review, {
    human_assessed: true,
    candidates: candidateBindings(root),
    sources: [{
      path: SOURCE,
      source_identity: acceptedReview.source_identity,
      accepted: accepted(acceptedReview),
      sections: acceptedReview.sections.map((section) => ({
        line_start: section.line_start,
        line_end: section.line_end,
        verdict: 'preserved',
      })),
    }],
  });
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
    group_packages: plan.group_packages,
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID');
});

test('accepted whole-source routes require exact existing targets at every later boundary', (t) => {
  for (const [name, target] of [
    ['null', null],
    ['unknown output', { kind: 'output', output: 'missing' }],
    ['unknown group', { kind: 'group_index', group: 'missing' }],
    ['malformed', { kind: 'output' }],
  ]) {
    const { root, plan } = fixture(t);
    const splitReview = structuredClone(plan.split_review);
    splitReview[0].proposal.whole_source_link_routes = [{
      from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null, target,
    }];
    const response = validateWith(root, plan, semanticReview(root, plan), splitReview, {});

    assert.equal(response.result, 'blocked', name);
    assert.notEqual(response.result, 'failed/incomplete', name);
    assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID', name);
    assert.equal(response.findings[0].detail.reason, 'proposal_shape', name);
  }
});

test('accepted whole-source routes require a null or accepted origin at every later boundary', (t) => {
  for (const [name, origin] of [['unknown output', 'missing'], ['group key', 'guides']]) {
    const { root, plan } = fixture(t);
    const splitReview = structuredClone(plan.split_review);
    splitReview[0].proposal.whole_source_link_routes = [{
      from: 'README.md',
      line: 1,
      occurrence: 1,
      resource: 'docs/guide.md',
      origin,
      target: { kind: 'output', output: splitReview[0].proposal.outputs[0].output },
    }];
    const response = validateWith(root, plan, semanticReview(root, plan), splitReview, {});

    assert.equal(response.result, 'blocked', name);
    assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID', name);
    assert.equal(response.findings[0].detail.reason, 'proposal_shape', name);
  }
});

test('null, malformed, and duplicate accepted review rows and ranges are refused before evidence comparison', (t) => {
  const cases = [
    ['null row', (rows) => rows.push(null), 'SPLIT_WORKER_REVIEW_SET_MISMATCH'],
    ['duplicate path', (rows) => rows.push(structuredClone(rows[0])), 'SPLIT_WORKER_REVIEW_SET_MISMATCH'],
    ['string range', (rows) => { rows[0].sections[0].line_start = '1'; }, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH'],
    ['zero range', (rows) => { rows[0].sections[0].line_start = 0; }, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH'],
    ['reversed range', (rows) => { rows[0].sections[0].line_start = 3; rows[0].sections[0].line_end = 1; }, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH'],
    ['duplicate residue range', (rows) => { rows[0].sections.push({ ...rows[0].sections[0] }); }, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH'],
    ['malformed output range', (rows) => { rows[0].outputs[0].sections[0].line_end = '7'; }, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH'],
    ['malformed nested proposal output', (rows) => { rows[0].proposal.outputs[0].heading_outline[0].level = '1'; }, 'SPLIT_WORKER_REVIEW_INVALID'],
  ];

  for (const [name, mutate, code] of cases) {
    const { root, plan } = fixture(t);
    const splitReview = structuredClone(plan.split_review);
    mutate(splitReview);
    const response = validateWith(root, plan, semanticReview(root, plan), splitReview, {});
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
    assert.equal(response.findings[0].code, code, name);
  }
});

test('gapped, overlapping, and out-of-bounds accepted coverage is refused before evidence comparison', (t) => {
  const cases = [
    ['gap', (row) => { row.sections[0].line_end = 2; }, 'coverage_gap'],
    ['overlap', (row) => { row.sections[0].line_end = 4; }, 'coverage_overlap'],
    ['out of bounds', (row) => {
      row.sections[2].line_end = 11;
      row.outputs[1].sections[0].line_end = 11;
    }, 'coverage_bounds'],
  ];

  for (const [name, mutate, reason] of cases) {
    const { root, plan } = fixture(t);
    const splitReview = structuredClone(plan.split_review);
    mutate(splitReview[0]);
    const response = validateWith(root, plan, semanticReview(root, plan), splitReview, {});
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.findings[0].code, 'SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH', name);
    assert.equal(response.findings[0].detail.reason, reason, name);
  }
});

test('an accepted provenance assignment without its bound source is refused', (t) => {
  const { root, plan } = fixture(t);
  const splitReview = structuredClone(plan.split_review);
  splitReview[0].proposal.outputs[0].provenance_assignments.push({ source_index: 0, support: 'supported' });
  const response = validateWith(root, plan, semanticReview(root, plan), splitReview, {});

  assert.equal(response.result, 'blocked');
  assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID');
  assert.deepEqual(response.findings[0].detail, { path: SOURCE, reason: 'proposal_shape' });
});

test('an incomplete candidate scan is refused and cannot report structural coverage passed', (t) => {
  const { root, plan } = fixture(t);
  const stagingRoot = path.join(root, '.okf-staging', 'okf');
  const response = validateWith(root, plan, semanticReview(root, plan), plan.split_review, {
    listFiles(scanRoot, skipDir) {
      const listed = defaultServices.listFiles(scanRoot, skipDir);
      return path.resolve(scanRoot) === stagingRoot ? { ...listed, complete: false } : listed;
    },
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.findings[0].code, 'SEMANTIC_REVIEW_CANDIDATE_SCAN_INCOMPLETE');
  assert.deepEqual(response.data.structural_coverage, { passed: false });
});

test('an incomplete structural scan blocks structural coverage even when the candidate evidence scan is complete', (t) => {
  const { root, plan } = fixture(t);
  const stagingRoot = path.join(root, '.okf-staging', 'okf');
  let stagingScans = 0;
  const response = validateWith(root, plan, semanticReview(root, plan), plan.split_review, {
    listFiles(scanRoot, skipDir) {
      const listed = defaultServices.listFiles(scanRoot, skipDir);
      if (path.resolve(scanRoot) !== stagingRoot) return listed;
      stagingScans++;
      return stagingScans === 1 ? { ...listed, complete: false } : listed;
    },
  });

  assert.equal(stagingScans, 2);
  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.structural_coverage, { passed: false });
  assert.deepEqual(response.data.agent_semantic_review, { passed: true });
  assert.equal(response.data.publishable, false);
  assert.deepEqual(response.findings.find((item) => item.code === 'BUNDLE_SCAN_INCOMPLETE'), {
    code: 'BUNDLE_SCAN_INCOMPLETE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { reason: 'incomplete_listing' },
  });
});

test('a candidate read failure is refused explicitly', (t) => {
  const { root, plan } = fixture(t);
  const failed = path.join(root, '.okf-staging', 'okf', `${GROUP}/install.md`);
  const response = validateWith(root, plan, semanticReview(root, plan), plan.split_review, {
    readBuffer(file) {
      if (path.resolve(file) === failed) throw new Error('unreadable candidate');
      return defaultServices.readBuffer(file);
    },
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.findings[0].code, 'SEMANTIC_REVIEW_CANDIDATE_READ_FAILED');
  assert.deepEqual(response.findings[0].detail, { path: `${GROUP}/install.md` });
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
