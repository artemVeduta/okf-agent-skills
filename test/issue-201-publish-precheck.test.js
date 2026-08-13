const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, snapshot, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const runtime = require('../scripts/lib/runtime');
const defaultServices = require('../scripts/lib/services');

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

function assertZeroWriteRefusal(value, mutate, code) {
  const before = snapshot(path.join(value.root, 'okf'));
  mutate(value);
  const response = publish(value);
  assertPrecheckRefusal(response, code);
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
  return response;
}

function acceptedSource(value) {
  return value.plan.split_review.find((item) => item.path === SPLIT_SOURCE);
}

function bindAcceptedReview(value) {
  value.semantic_review.sources[0].accepted = structuredClone({
    sections: acceptedSource(value).sections,
    outputs: acceptedSource(value).outputs,
    proposal: acceptedSource(value).proposal,
  });
}

function grouped(value) {
  const review = acceptedSource(value);
  const output = review.proposal.outputs.find((item) => item.output === 'install');
  output.concept_id = 'operators/install';
  output.path = 'operators/install.md';
  output.reader_purpose_group = {
    key: 'operators',
    purpose: 'Operate the service.',
    index_entry: { path: 'operators/index.md', title: 'Operators' },
    child_entry: { concept_id: 'operators/install', path: 'operators/install.md', title: 'Install', order: 1 },
  };
  const staged = value.staged.find((item) => item.output === 'install');
  const oldFile = path.join(value.root, staged.file);
  const newFile = path.join(value.root, '.okf-staging/okf/operators/install.md');
  fs.mkdirSync(path.dirname(newFile), { recursive: true });
  fs.renameSync(oldFile, newFile);
  staged.concept = 'operators/install';
  staged.file = '.okf-staging/okf/operators/install.md';
  const candidate = value.semantic_review.candidates.find((item) => item.path === 'install.md');
  candidate.path = 'operators/install.md';
  candidate.identity = identity(fs.readFileSync(newFile));
  value.semantic_review.candidates.sort((a, b) => a.path.localeCompare(b.path));
}

function groupOutput(value, outputName, key, title) {
  const review = acceptedSource(value);
  const output = review.proposal.outputs.find((item) => item.output === outputName);
  output.concept_id = `${key}/${outputName}`;
  output.path = `${key}/${outputName}.md`;
  output.reader_purpose_group = {
    key,
    purpose: `Use ${key}.`,
    index_entry: { path: `${key}/index.md`, title },
    child_entry: { concept_id: output.concept_id, path: output.path, title: output.title, order: 1 },
  };
  const staged = value.staged.find((item) => item.output === outputName);
  const oldFile = path.join(value.root, staged.file);
  const newFile = path.join(value.root, '.okf-staging/okf', output.path);
  fs.mkdirSync(path.dirname(newFile), { recursive: true });
  fs.renameSync(oldFile, newFile);
  staged.concept = output.concept_id;
  staged.file = path.relative(value.root, newFile);
  staged.accepted_output = structuredClone(output);
  const candidate = value.semantic_review.candidates.find((item) => item.path === `${outputName}.md`);
  candidate.path = output.path;
  candidate.identity = identity(fs.readFileSync(newFile));
  const indexFile = path.join(value.root, '.okf-staging/okf', `${key}/index.md`);
  fs.writeFileSync(indexFile, `# ${title}\n\nUse ${key}.\n\n- [${output.title}](${outputName}.md)\n`);
  const group = {
    key, purpose: `Use ${key}.`, index_entry: { path: `${key}/index.md`, title },
    child_entries: [output.reader_purpose_group.child_entry],
  };
  value.staged.push({ kind: 'index', path: `${key}/index.md`, file: path.relative(value.root, indexFile), group });
  value.semantic_review.candidates.push({ path: `${key}/index.md`, identity: identity(fs.readFileSync(indexFile)) });
}

function addAnchorRoute(value, targetAnchor = 'install') {
  const review = acceptedSource(value);
  const output = review.proposal.outputs.find((item) => item.output === 'install');
  output.anchor_routes.push({
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md#install',
    source_anchor: 'install', line_start: 4, line_end: 7, target_anchor: targetAnchor,
  });
  value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
  bindAcceptedReview(value);
}

function addWholeSourceRoute(value, target = 'install') {
  acceptedSource(value).proposal.whole_source_link_routes.push({
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
    target: { kind: 'output', output: target },
  });
  bindAcceptedReview(value);
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

test('duplicate mapping sources cannot omit a required migrate plan entry', (t) => {
  const value = fixture(t);
  assertZeroWriteRefusal(value, (current) => {
    current.plan.mapping[1] = structuredClone(current.plan.mapping[0]);
  }, 'PUBLISH_PLAN_MAPPING_MISMATCH');
});

test('canonical review must cover every accepted section exactly once', (t) => {
  for (const mutate of [
    (value) => { value.semantic_review.sources[0].sections = []; },
    (value) => { value.semantic_review.sources[0].sections.push({ ...value.semantic_review.sources[0].sections[0] }); },
  ]) {
    const value = fixture(t);
    assertZeroWriteRefusal(value, mutate, 'PUBLISH_SEMANTIC_REVIEW_STALE');
  }
});

test('an unsplit candidate requires its exact current source binding', (t) => {
  for (const mutateSource of [
    (root) => fs.appendFileSync(path.join(root, UNSPLIT_SOURCE), '\nChanged.\n'),
    (root) => fs.rmSync(path.join(root, UNSPLIT_SOURCE)),
  ]) {
    const value = fixture(t);
    assertZeroWriteRefusal(value, (current) => {
      current.staged.find((item) => item.path === UNSPLIT_SOURCE).sources = [];
      mutateSource(current.root);
    }, 'PUBLISH_SOURCE_CHANGED');
  }
});

test('missing or wrong heading-anchor routes block publication', (t) => {
  const missing = fixture(t);
  assertZeroWriteRefusal(missing, (value) => addAnchorRoute(value), 'PUBLISH_ROUTE_MISMATCH');

  const wrong = fixture(t);
  assertZeroWriteRefusal(wrong, (value) => {
    addAnchorRoute(value);
    const file = path.join(value.root, '.okf-staging/okf/install.md');
    fs.appendFileSync(file, '\n[route](install.md#wrong)\n');
    const row = value.semantic_review.candidates.find((item) => item.path === 'install.md');
    row.identity = identity(fs.readFileSync(file));
  }, 'PUBLISH_ROUTE_MISMATCH');
});

test('missing or wrong whole-source targets block publication', (t) => {
  const missing = fixture(t);
  assertZeroWriteRefusal(missing, (value) => addWholeSourceRoute(value), 'PUBLISH_ROUTE_MISMATCH');

  const wrong = fixture(t);
  assertZeroWriteRefusal(wrong, (value) => {
    addWholeSourceRoute(value);
    const file = path.join(value.root, '.okf-staging/okf/install.md');
    fs.appendFileSync(file, '\n[route](operate.md)\n');
    const row = value.semantic_review.candidates.find((item) => item.path === 'install.md');
    row.identity = identity(fs.readFileSync(file));
  }, 'PUBLISH_ROUTE_MISMATCH');
});

test('coherent caller metadata cannot replace actual authored provenance', (t) => {
  const value = fixture(t);
  assertZeroWriteRefusal(value, (current) => {
    const output = acceptedSource(current).proposal.outputs.find((item) => item.output === 'install');
    output.provenance_assignments = [{ source_index: 0, support: 'supported', source: { resource: 'https://example.com/source' } }];
    current.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
    bindAcceptedReview(current);
  }, 'PUBLISH_PROVENANCE_MISMATCH');
});

test('a required group index must exist and match its accepted title and ordered child links', (t) => {
  const missing = fixture(t);
  assertZeroWriteRefusal(missing, (value) => {
    grouped(value);
    const output = acceptedSource(value).proposal.outputs.find((item) => item.output === 'install');
    value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
    bindAcceptedReview(value);
  }, 'PUBLISH_INDEX_MISSING');

  const wrong = fixture(t);
  assertZeroWriteRefusal(wrong, (value) => {
    grouped(value);
    const output = acceptedSource(value).proposal.outputs.find((item) => item.output === 'install');
    value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
    const file = path.join(value.root, '.okf-staging/okf/operators/index.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Wrong\n\n- [Wrong](wrong.md)\n');
    value.staged.push({
      kind: 'index', path: 'operators/index.md', file: '.okf-staging/okf/operators/index.md',
      group: {
        key: 'operators', purpose: 'Operate the service.',
        index_entry: { path: 'operators/index.md', title: 'Operators' },
        child_entries: [{ concept_id: 'operators/install', path: 'operators/install.md', title: 'Install', order: 1 }],
      },
    });
    value.semantic_review.candidates.push({ path: 'operators/index.md', identity: identity(fs.readFileSync(file)) });
    value.semantic_review.candidates.sort((a, b) => a.path.localeCompare(b.path));
    bindAcceptedReview(value);
  }, 'PUBLISH_INDEX_CHANGED');
});

test('an accepted generated group index publishes from its checked bytes', (t) => {
  const value = fixture(t);
  grouped(value);
  const output = acceptedSource(value).proposal.outputs.find((item) => item.output === 'install');
  value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
  const indexFile = path.join(value.root, '.okf-staging/okf/operators/index.md');
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, '# Operators\n\nOperate the service.\n\n- [Install](install.md)\n');
  value.staged.push({
    kind: 'index', path: 'operators/index.md', file: '.okf-staging/okf/operators/index.md',
    group: {
      key: 'operators', purpose: 'Operate the service.',
      index_entry: { path: 'operators/index.md', title: 'Operators' },
      child_entries: [{ concept_id: 'operators/install', path: 'operators/install.md', title: 'Install', order: 1 }],
    },
  });
  value.semantic_review.candidates.push({ path: 'operators/index.md', identity: identity(fs.readFileSync(indexFile)) });
  value.semantic_review.candidates.sort((a, b) => a.path.localeCompare(b.path));
  bindAcceptedReview(value);

  const response = publish(value);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.equal(fs.readFileSync(path.join(value.root, 'okf/operators/index.md'), 'utf8'), fs.readFileSync(indexFile, 'utf8'));
});

test('multiple group indexes and a concept route to an indexed child publish', (t) => {
  const value = fixture(t);
  groupOutput(value, 'install', 'operators', 'Operators');
  groupOutput(value, 'operate', 'runbooks', 'Runbooks');
  const routeOwner = acceptedSource(value).proposal.outputs.find((item) => item.output === 'operate');
  routeOwner.link_routes.push({
    from: SPLIT_SOURCE, line: 8, occurrence: 1,
    resource: 'docs/decision.md', target: 'okf/operators/install.md',
  });
  value.staged.find((item) => item.output === 'operate').accepted_output = structuredClone(routeOwner);
  const routeFile = path.join(value.root, '.okf-staging/okf/runbooks/operate.md');
  fs.appendFileSync(routeFile, '\n[Install](../operators/install.md)\n');
  value.semantic_review.candidates.find((item) => item.path === 'runbooks/operate.md').identity = identity(fs.readFileSync(routeFile));
  value.semantic_review.candidates.sort((a, b) => a.path.localeCompare(b.path));
  bindAcceptedReview(value);

  const response = publish(value);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.equal(fs.existsSync(path.join(value.root, 'okf/operators/index.md')), true);
  assert.equal(fs.existsSync(path.join(value.root, 'okf/runbooks/index.md')), true);
});

test('writer dispatch uses the exact candidate bytes checked by the precheck', (t) => {
  const value = fixture(t);
  const stagedFile = path.join(value.root, '.okf-staging/okf/install.md');
  const checked = fs.readFileSync(stagedFile, 'utf8');
  let reads = 0;
  const services = {
    ...defaultServices,
    readFile(file) {
      if (file === stagedFile && ++reads > 1) return '---\ntype: Playbook\nstatus: draft\n---\n# Replaced\n';
      return defaultServices.readFile(file);
    },
  };

  const response = runtime.run('okf-setup', {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'publish',
    payload: {
      cwd: value.root, task_kind: 'feature work', staged: value.staged,
      plan: value.plan.plan, mapping: value.plan.mapping,
      split_review: value.plan.split_review, semantic_review: value.semantic_review,
    },
  }, services);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.match(checked, /# Install/);
  assert.match(fs.readFileSync(path.join(value.root, 'okf/install.md'), 'utf8'), /# Install/);
  assert.doesNotMatch(fs.readFileSync(path.join(value.root, 'okf/install.md'), 'utf8'), /# Replaced/);
});

test('symlinked staging ancestors and files refuse with zero writes', (t) => {
  for (const kind of ['ancestor', 'file']) {
    const value = fixture(t);
    const before = snapshot(path.join(value.root, 'okf'));
    if (kind === 'ancestor') {
      const staging = path.join(value.root, '.okf-staging/okf');
      const target = path.join(value.root, '.okf-staging/real-okf');
      fs.renameSync(staging, target);
      fs.symlinkSync(target, staging);
    } else {
      const stagedFile = path.join(value.root, '.okf-staging/okf/install.md');
      const target = path.join(value.root, '.okf-staging/okf/install-real.md');
      fs.renameSync(stagedFile, target);
      fs.symlinkSync(target, stagedFile);
    }
    const response = publish(value);
    assertPrecheckRefusal(response, 'PUBLISH_STAGING_SYMLINK');
    assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
  }
});
