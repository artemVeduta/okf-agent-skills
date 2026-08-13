const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, snapshot, temporaryRoot, writeManifest } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const SPLIT_SOURCE = 'docs/guide.md';
const UNSPLIT_SOURCE = 'docs/decision.md';
const SPLIT_CONTENT = [
  '---',
  'type: Playbook',
  '---',
  '# Install',
  '',
  'Install the tool.',
  '',
  '# Operate',
  '',
  'Operate the tool.',
].join('\n');
const UNSPLIT_CONTENT = '---\ntype: Decision\n---\n# Decision\n\nKeep this decision.\n';

function run(operation, root, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
  });
}

function repo(t) {
  const root = temporaryRoot(t, 'okf-201-publish-precheck-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, 'okf');
  fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, SPLIT_SOURCE), SPLIT_CONTENT);
  fs.writeFileSync(path.join(root, UNSPLIT_SOURCE), UNSPLIT_CONTENT);
  return root;
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
  const sources = run('discover', root, {}).data.sources
    .filter((item) => [SPLIT_SOURCE, UNSPLIT_SOURCE].includes(item.path));
  const response = run('migration-plan', root, {
    sources,
    split_requested: [SPLIT_SOURCE],
    split_sections: [{
      path: SPLIT_SOURCE,
      sections: [
        { line_start: 1, line_end: 3, disposition: 'residue' },
        { line_start: 4, line_end: 7, disposition: 'assigned', output: 'install' },
        { line_start: 8, line_end: 10, disposition: 'assigned', output: 'operate' },
      ],
    }],
    split_proposals: [{
      path: SPLIT_SOURCE,
      result: 'split',
      keep_as_one_reason: null,
      accepted: true,
      outputs: [proposalOutput('install', 'Install'), proposalOutput('operate', 'Operate')],
      provenance_exclusions: [],
      heading_changes: [],
      whole_source_link_routes: [],
    }],
  });
  assert.equal(response.data.split_review.find((item) => item.path === SPLIT_SOURCE).proposal.status, 'accepted');
  return response.data;
}

function assemble(root, plan) {
  const partitioned = run('partition', root, {
    plan: plan.plan,
    mapping: plan.mapping,
    references: plan.references,
    split_review: plan.split_review,
  });
  const shards = partitioned.data.shards.map((item, index) => {
    const concepts = item.brief.mapping.flatMap((mapping) => {
      const review = item.brief.split_review.find((candidate) => candidate.path === mapping.path);
      if (review.proposal === null) {
        return [{ path: mapping.path, concept: mapping.concept, type: mapping.type, body: mapping.body }];
      }
      return review.proposal.outputs.map((output) => ({
        path: review.path,
        output: output.output,
        concept: output.concept_id,
        type: output.type,
        sections: review.outputs.find((candidate) => candidate.output === output.output).sections.map((section) => ({ ...section })),
        body: `# ${output.title}\n`,
      }));
    });
    const shard = { shard: item.shard, concepts, references: [], warnings: [], blockers: [] };
    const shardPath = `.okf-staging/shards/${index}.json`;
    fs.mkdirSync(path.dirname(path.join(root, shardPath)), { recursive: true });
    fs.writeFileSync(path.join(root, shardPath), JSON.stringify(shard));
    return { shard: item.shard, path: shardPath };
  });
  const response = run('assemble', root, {
    partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
    shards,
  });
  assert.equal(response.result, 'ok', JSON.stringify(response));
  return response.data.staged;
}

function identity(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticInput(root, plan) {
  const review = plan.split_review.find((item) => item.path === SPLIT_SOURCE);
  const stagingRoot = path.join(root, '.okf-staging', 'okf');
  const candidates = fs.readdirSync(stagingRoot, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.md'))
    .map((item) => {
      const candidatePath = path.relative(stagingRoot, path.join(item.parentPath, item.name)).split(path.sep).join('/');
      return { path: candidatePath, identity: identity(fs.readFileSync(path.join(stagingRoot, candidatePath))) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    performed: false,
    candidates,
    sources: [{
      path: review.path,
      source_identity: review.source_identity,
      accepted: structuredClone({ sections: review.sections, outputs: review.outputs, proposal: review.proposal }),
      sections: review.sections.map((section) => ({
        line_start: section.line_start, line_end: section.line_end, verdict: 'preserved',
      })),
    }],
  };
}

function fixture(t) {
  const root = repo(t);
  const plan = acceptedPlan(root);
  const staged = assemble(root, plan);
  const validated = run('migration-validate', root, {
    selected: [SPLIT_SOURCE, UNSPLIT_SOURCE],
    plan: plan.plan,
    split_review: plan.split_review,
    semantic_review: semanticInput(root, plan),
  });
  assert.equal(validated.data.publishable, true, JSON.stringify(validated));
  return {
    root,
    plan,
    staged,
    semantic_review: validated.data.semantic_review,
  };
}

function publish(value, payload = {}) {
  return run('publish', value.root, {
    task_kind: 'feature work',
    staged: value.staged,
    plan: value.plan.plan,
    mapping: value.plan.mapping,
    split_review: value.plan.split_review,
    semantic_review: value.semantic_review,
    ...payload,
  });
}

function assertPrecheckRefusal(response, code) {
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'PUBLISH_PRECHECK_FAILED');
  assert.equal(response.findings[0].code, code);
  assert.equal(response.findings[0].blocks, true);
}

test('publish accepts the complete split and unsplit candidate set after all pre-write checks pass', (t) => {
  const value = fixture(t);
  const response = publish(value);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.published, value.staged.map((item) => item.concept));
  assert.deepEqual(response.data.failed, []);
  assert.deepEqual(response.data.skipped, []);
});

test('an extra, missing, or changed real candidate blocks publication and requires a new proposal', (t) => {
  const cases = [
    ['extra', (value) => fs.writeFileSync(path.join(value.root, '.okf-staging/okf/extra.md'), '---\ntype: Playbook\n---\n# Extra\n'), 'PUBLISH_CANDIDATE_SET_MISMATCH'],
    ['missing', (value) => fs.rmSync(path.join(value.root, '.okf-staging/okf/operate.md')), 'PUBLISH_CANDIDATE_SET_MISMATCH'],
    ['changed', (value) => fs.writeFileSync(path.join(value.root, '.okf-staging/okf/install.md'), '---\ntype: Research\nstatus: draft\n---\n# Install\n'), 'PUBLISH_CANDIDATE_CHANGED'],
  ];

  for (const [name, mutate, code] of cases) {
    const value = fixture(t);
    const before = snapshot(path.join(value.root, 'okf'));
    mutate(value);
    const response = publish(value);
    assertPrecheckRefusal(response, code, name);
    assert.deepEqual(snapshot(path.join(value.root, 'okf')), before, `${name} must write zero bundle files`);
  }
});

test('a changed accepted candidate field blocks even when the staged bytes still match review', (t) => {
  const value = fixture(t);
  value.staged.find((item) => item.output === 'install').accepted_output.title = 'Changed title';
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assertPrecheckRefusal(response, 'PUBLISH_CANDIDATE_CHANGED');
  assert.equal(response.findings[0].detail.field, 'accepted_output');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('a stale semantic review blocks before every write even when human_assessed is true', (t) => {
  const value = fixture(t);
  value.semantic_review.human_assessed = true;
  value.semantic_review.candidates[0].identity = `sha256:${'0'.repeat(64)}`;
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assertPrecheckRefusal(response, 'PUBLISH_SEMANTIC_REVIEW_STALE');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('changed source bytes at the final pre-write check block every write', (t) => {
  const value = fixture(t);
  fs.appendFileSync(path.join(value.root, SPLIT_SOURCE), '\nChanged after review.\n');
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assertPrecheckRefusal(response, 'PUBLISH_SOURCE_CHANGED');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('malformed Task 6 publication input is refused at the boundary with zero writes', (t) => {
  const value = fixture(t);
  value.semantic_review.sources[0].accepted.unexpected = true;
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('a later write failure reports successful, failed, and unattempted writes exactly', (t) => {
  const value = fixture(t);
  value.staged.sort((left, right) => ['install', 'operate', 'decisions/decision'].indexOf(left.concept)
    - ['install', 'operate', 'decisions/decision'].indexOf(right.concept));
  const existing = '---\ntype: Playbook\n---\n# Existing operate\n';
  fs.writeFileSync(path.join(value.root, 'okf', 'operate.md'), existing);

  const response = publish(value);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, ['install']);
  assert.deepEqual(response.data.failed, [{ concept: 'operate', status: 'failed' }]);
  assert.deepEqual(response.data.skipped, [{ concept: 'decisions/decision', status: 'not-attempted' }]);
  assert.equal(fs.existsSync(path.join(value.root, 'okf', 'install.md')), true);
  assert.equal(fs.readFileSync(path.join(value.root, 'okf', 'operate.md'), 'utf8'), existing);
  assert.equal(fs.existsSync(path.join(value.root, 'okf', 'decisions', 'decision.md')), false);
});
