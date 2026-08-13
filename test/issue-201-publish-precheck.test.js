const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, snapshot, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { packagesFor } = require('../test-support/groups');
const runtime = require('../scripts/lib/runtime');
const defaultServices = require('../scripts/lib/services');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const SPLIT_SOURCE = 'docs/guide.md';
const UNSPLIT_SOURCE = 'docs/decision.md';
const SPLIT_GROUP = 'guides';
const UNSPLIT_GROUP = 'decisions';
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

function proposalOutput(output, title, group, order) {
  return {
    output,
    concept_id: `${group}/${output}`,
    path: `${group}/${output}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: {
      key: group,
      purpose: `Use ${group}.`,
      index_entry: { path: `${group}/index.md`, title: group },
      child_entry: { concept_id: `${group}/${output}`, path: `${group}/${output}.md`, title, order },
    },
    provenance_assignments: [],
    link_routes: [],
    anchor_routes: [],
  };
}

function acceptedPlan(root, installRoute = null, installAnchorRoute = null) {
  const sources = run('discover', root, {}).data.sources
    .filter((item) => [SPLIT_SOURCE, UNSPLIT_SOURCE].includes(item.path));
  const accepted = packagesFor(root, 'okf', {
    [SPLIT_SOURCE]: SPLIT_GROUP,
    [UNSPLIT_SOURCE]: UNSPLIT_GROUP,
  }, [`${SPLIT_GROUP}/install`, `${SPLIT_GROUP}/operate`, `${UNSPLIT_GROUP}/decision`], {});
  const response = run('migration-plan', root, {
    sources,
    ...accepted,
    answers: {
      [SPLIT_SOURCE]: { reader_purpose_group: SPLIT_GROUP },
      [UNSPLIT_SOURCE]: { reader_purpose_group: UNSPLIT_GROUP },
    },
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
      outputs: [
        {
          ...proposalOutput('install', 'Install', SPLIT_GROUP, 1),
          link_routes: installRoute === null ? [] : [installRoute],
          anchor_routes: installAnchorRoute === null ? [] : [installAnchorRoute],
        },
        proposalOutput('operate', 'Operate', SPLIT_GROUP, 2),
      ],
      provenance_exclusions: [],
      heading_changes: [],
      whole_source_link_routes: [],
    }],
  });
  assert.equal(response.findings.filter((item) => item.blocks).length, 0, JSON.stringify(response));
  assert.equal(response.data.split_review.find((item) => item.path === SPLIT_SOURCE).proposal.status, 'accepted');
  return response.data;
}

function assemble(root, plan, bodies = {}) {
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
        body: bodies[`${review.path}:${output.output}`] || `# ${output.title}\n`,
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
    group_packages: plan.group_packages,
  });
  assert.equal(response.result, 'ok', JSON.stringify(response));
  return response.data.staged;
}

function identity(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticInput(root, plan) {
  const reviews = plan.split_review.filter((item) => item.proposal !== null);
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
    sources: reviews.map((review) => ({
      path: review.path,
      source_identity: review.source_identity,
      accepted: structuredClone({ sections: review.sections, outputs: review.outputs, proposal: review.proposal }),
      sections: review.sections.map((section) => ({
        line_start: section.line_start, line_end: section.line_end, verdict: 'preserved',
      })),
    })),
  };
}

function fixture(t, options = {}) {
  const root = repo(t);
  if (options.prepare) options.prepare(root);
  const plan = acceptedPlan(root, options.installRoute || null, options.installAnchorRoute || null);
  const staged = assemble(root, plan, options.bodies);
  const validated = run('migration-validate', root, {
    selected: [SPLIT_SOURCE, UNSPLIT_SOURCE],
    plan: plan.plan,
    split_review: plan.split_review,
    group_packages: plan.group_packages,
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
    group_packages: value.plan.group_packages,
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
  for (const row of value.semantic_review.sources) {
    const review = value.plan.split_review.find((item) => item.path === row.path);
    row.accepted = structuredClone({
      sections: review.sections,
      outputs: review.outputs,
      proposal: review.proposal,
    });
  }
}

function refreshCandidate(value, candidatePath) {
  const file = path.join(value.root, '.okf-staging/okf', candidatePath);
  value.semantic_review.candidates.find((item) => item.path === candidatePath).identity = identity(fs.readFileSync(file));
}

// ------------------------------------------------------- accepted group packages

function rebuildGroupPackages(value) {
  const concepts = new Map();
  const meta = new Map();
  for (const entry of value.plan.plan.entries.filter((item) => item.disposition === 'migrate')) {
    const review = value.plan.split_review.find((item) => item.path === entry.path);
    const proposal = review && review.proposal;
    if (!proposal || proposal.status !== 'accepted') {
      concepts.set(entry.concept, { title: path.posix.basename(entry.concept), order: 1 });
      continue;
    }
    for (const output of proposal.outputs) {
      const group = output.reader_purpose_group;
      concepts.set(output.concept_id, {
        title: group ? group.child_entry.title : output.title,
        order: group ? group.child_entry.order : 1,
      });
      if (group) meta.set(group.key, { purpose: group.purpose, title: group.index_entry.title });
    }
  }
  const byDir = new Map();
  for (const conceptId of concepts.keys()) {
    const dir = path.posix.dirname(conceptId);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(conceptId);
  }
  const all = [...byDir.keys()].sort();
  const top = all.filter((group) => !group.includes('/'));
  const packages = all.map((group) => {
    const direct = byDir.get(group).slice().sort();
    const children = all.filter((item) => item !== group && path.posix.dirname(item) === group).sort();
    const row = meta.get(group);
    return {
      group,
      purpose: row ? row.purpose : `Reader purpose for ${group}`,
      index: { disposition: 'created', title: row ? row.title : group },
      glossary: { disposition: 'none' },
      guidance: { disposition: 'none' },
      log: { disposition: 'none' },
      children: [
        ...direct.map((conceptId) => ({ kind: 'concept', concept_id: conceptId, ...concepts.get(conceptId) })),
        ...children.map((child) => ({ kind: 'group', group: child, title: child, order: 0 })),
      ].map((child, index) => ({ ...child, order: index + 1 })),
    };
  });
  const childRows = (children) => children.map((child) => (child.kind === 'concept'
    ? { concept_id: child.concept_id, path: `${child.concept_id}.md`, title: child.title, order: child.order }
    : { concept_id: child.group, path: `${child.group}/index.md`, title: child.title, order: child.order }));
  const indexes = packages.map((item) => ({
    key: item.group,
    purpose: item.purpose,
    index_entry: { path: `${item.group}/index.md`, title: item.index.title },
    child_entries: childRows(item.children).slice().sort((left, right) => left.order - right.order),
  }));
  // The root package is derived like `test-support/groups.js` derives it: the
  // root gains the accepted top-level groups, so its index disposition is
  // `updated` when the bundle already carries `index.md`, and the derived set
  // includes the root row.
  const rootIndexExists = fs.existsSync(path.join(value.root, 'okf', 'index.md'));
  indexes.push({
    key: '',
    purpose: 'Bundle root',
    index_entry: { path: 'index.md', title: 'Bundle' },
    child_entries: top.map((group, index) => ({ concept_id: group, path: `${group}/index.md`, title: group, order: index + 1 })),
  });
  indexes.sort((left, right) => left.index_entry.path.localeCompare(right.index_entry.path));
  value.plan.group_packages = {
    packages,
    root: {
      purpose: 'Bundle root',
      index: { disposition: rootIndexExists ? 'updated' : 'created', title: 'Bundle' },
      log: { disposition: 'none' },
      children: top.map((group, index) => ({ kind: 'group', group, title: group, order: index + 1 })),
    },
    indexes,
  };
  return value.plan.group_packages;
}

function indexText(row) {
  return `# ${row.index_entry.title}\n\n${row.purpose}\n\n${row.child_entries.map((child) => {
    const target = path.posix.relative(path.posix.dirname(row.index_entry.path), child.path);
    return `- [${child.title}](${target})`;
  }).join('\n')}\n`;
}

function syncStagedIndexes(value) {
  const stagingRoot = path.join(value.root, '.okf-staging', 'okf');
  const rows = value.plan.group_packages.indexes;
  for (const row of rows) {
    const existing = value.staged.find((item) => item.kind === 'index' && item.path === row.index_entry.path);
    if (!existing) continue;
    const file = path.join(stagingRoot, row.index_entry.path);
    fs.writeFileSync(file, indexText(row));
    existing.group = row;
    existing.file = path.relative(value.root, file);
    const candidate = value.semantic_review.candidates.find((item) => item.path === row.index_entry.path);
    candidate.identity = identity(fs.readFileSync(file));
  }
  for (const item of value.staged.filter((entry) => entry.kind === 'index')) {
    if (!rows.some((row) => row.index_entry.path === item.path)) {
      fs.rmSync(path.join(value.root, item.file), { force: true });
    }
  }
  value.staged = value.staged.filter((item) => item.kind !== 'index' || rows.some((row) => row.index_entry.path === item.path));
  value.semantic_review.candidates = value.semantic_review.candidates
    .filter((item) => value.staged.some((row) => row.path === item.path) || !item.path.endsWith('/index.md'))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function moveOutputToGroup(value, outputName, key, purpose, title) {
  const review = acceptedSource(value);
  const output = review.proposal.outputs.find((item) => item.output === outputName);
  output.concept_id = `${key}/${outputName}`;
  output.path = `${key}/${outputName}.md`;
  output.reader_purpose_group = {
    key,
    purpose,
    index_entry: { path: `${key}/index.md`, title },
    child_entry: { concept_id: output.concept_id, path: output.path, title: output.title, order: 1 },
  };
  const staged = value.staged.find((item) => item.output === outputName);
  const oldFile = path.join(value.root, staged.file);
  const newFile = path.join(value.root, '.okf-staging/okf', output.path);
  fs.mkdirSync(path.dirname(newFile), { recursive: true });
  fs.renameSync(oldFile, newFile);
  const candidate = value.semantic_review.candidates.find((item) => item.path === `${SPLIT_GROUP}/${outputName}.md`);
  staged.concept = output.concept_id;
  staged.file = path.relative(value.root, newFile);
  staged.accepted_output = structuredClone(output);
  candidate.path = output.path;
  candidate.identity = identity(fs.readFileSync(newFile));
  rebuildGroupPackages(value);
  syncStagedIndexes(value);
}

function grouped(value) {
  moveOutputToGroup(value, 'install', 'operators', 'Operate the service.', 'Operators');
}

function groupOutput(value, outputName, key, title) {
  moveOutputToGroup(value, outputName, key, `Use ${key}.`, title);
  const row = value.plan.group_packages.indexes.find((item) => item.key === key);
  const file = path.join(value.root, '.okf-staging/okf', `${key}/index.md`);
  fs.writeFileSync(file, indexText(row));
  value.staged.push({ kind: 'index', path: row.index_entry.path, file: path.relative(value.root, file), group: row });
  value.semantic_review.candidates.push({ path: row.index_entry.path, identity: identity(fs.readFileSync(file)) });
  value.semantic_review.candidates.sort((left, right) => left.path.localeCompare(right.path));
}

function addAnchorRoute(value, targetAnchor = 'install') {
  const review = acceptedSource(value);
  const output = review.proposal.outputs.find((item) => item.output === 'install');
  output.anchor_routes.push({
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md#install',
    origin: null, target_output: 'install', source_anchor: 'install', line_start: 4, line_end: 7, target_anchor: targetAnchor,
  });
  value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
  bindAcceptedReview(value);
}

function addWholeSourceRoute(value, target = 'install') {
  acceptedSource(value).proposal.whole_source_link_routes.push({
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
    origin: null, target: { kind: 'output', output: target },
  });
  bindAcceptedReview(value);
}

function sharedGroupFixture(t) {
  const root = repo(t);
  const reviewed = [
    { path: 'docs/alpha.md', output: 'alpha', title: 'Alpha', order: 1 },
    { path: 'docs/beta.md', output: 'beta', title: 'Beta', order: 2 },
  ];
  for (const item of reviewed) fs.writeFileSync(path.join(root, item.path), `---\ntype: Playbook\n---\n# ${item.title}\n\n${item.title}.\n`);
  const sources = run('discover', root, {}).data.sources.filter((item) => reviewed.some((source) => source.path === item.path));
  const group = 'common';
  const accepted = packagesFor(root, 'okf', Object.fromEntries(reviewed.map((item) => [item.path, group])),
    reviewed.map((item) => `${group}/${item.output}`), {});
  accepted.group_packages[0].purpose = 'Use the shared concepts.';
  accepted.group_packages[0].index = { disposition: 'created', title: 'Shared' };
  accepted.group_packages[0].children = reviewed.map((item) => ({
    kind: 'concept', concept_id: `${group}/${item.output}`, title: item.title, order: item.order,
  }));
  const plan = run('migration-plan', root, {
    sources,
    ...accepted,
    answers: Object.fromEntries(reviewed.map((item) => [item.path, { reader_purpose_group: group }])),
    split_requested: reviewed.map((item) => item.path),
    split_sections: reviewed.map((item) => ({
      path: item.path,
      sections: [
        { line_start: 1, line_end: 3, disposition: 'residue' },
        { line_start: 4, line_end: 6, disposition: 'assigned', output: item.output },
      ],
    })),
    split_proposals: reviewed.map((item) => ({
      path: item.path,
      result: 'keep_as_one',
      keep_as_one_reason: 'This source is one coherent concept.',
      accepted: true,
      outputs: [{
        ...proposalOutput(item.output, item.title, group, item.order),
        reader_purpose_group: {
          key: group, purpose: 'Use the shared concepts.',
          index_entry: { path: `${group}/index.md`, title: 'Shared' },
          child_entry: {
            concept_id: `${group}/${item.output}`, path: `${group}/${item.output}.md`,
            title: item.title, order: item.order,
          },
        },
      }],
      provenance_exclusions: [], heading_changes: [], whole_source_link_routes: [],
    })),
  }).data;
  assert.equal(plan.split_review.every((item) => item.proposal?.status === 'accepted'), true, JSON.stringify(plan));
  const staged = assemble(root, plan);
  const validated = run('migration-validate', root, {
    selected: reviewed.map((item) => item.path), plan: plan.plan,
    split_review: plan.split_review, group_packages: plan.group_packages,
    semantic_review: semanticInput(root, plan),
  });
  assert.equal(validated.data.publishable, true, JSON.stringify(validated));
  return { root, plan, staged, semantic_review: validated.data.semantic_review };
}

test('publish accepts the complete split and unsplit candidate set after all pre-write checks pass', (t) => {
  const value = fixture(t);
  const response = publish(value);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.published, value.staged.map((item) => (item.kind === 'index' ? item.path : item.concept)));
  assert.deepEqual(response.data.failed, []);
  assert.deepEqual(response.data.skipped, []);
  assert.match(response.data.publication_receipt.path, /^\.okf-staging\/okf\//);
  assert.match(response.data.publication_receipt.identity, /^sha256:[0-9a-f]{64}$/);
  const receipt = JSON.parse(fs.readFileSync(path.join(value.root, response.data.publication_receipt.path), 'utf8'));
  assert.equal(receipt.protocol, 'okf-publication-receipt/1');
  assert.equal(Object.values(receipt.artifacts).every((item) => /^sha256:[0-9a-f]{64}$/.test(item)), true);
  assert.deepEqual(receipt.checked_candidates.map((item) => ({
    kind: item.kind, path: item.path, identity: /^sha256:[0-9a-f]{64}$/.test(item.identity),
  })), [
    { kind: 'concept', path: 'decisions/decision.md', identity: true },
    { kind: 'concept', path: 'guides/install.md', identity: true },
    { kind: 'concept', path: 'guides/operate.md', identity: true },
    { kind: 'index', path: 'decisions/index.md', identity: true },
    { kind: 'index', path: 'guides/index.md', identity: true },
    { kind: 'index', path: 'index.md', identity: true },
  ]);
  assert.deepEqual(receipt.classification, {
    status: response.data.status,
    published: response.data.published,
    failed: response.data.failed,
    skipped: response.data.skipped,
  });
});

test('an extra, missing, or changed real candidate blocks publication and requires a new proposal', (t) => {
  const cases = [
    ['extra', (value) => fs.writeFileSync(path.join(value.root, '.okf-staging/okf/extra.md'), '---\ntype: Playbook\n---\n# Extra\n'), 'PUBLISH_CANDIDATE_SET_MISMATCH'],
    ['missing', (value) => fs.rmSync(path.join(value.root, '.okf-staging/okf/guides/operate.md')), 'PUBLISH_CANDIDATE_SET_MISMATCH'],
    ['missing index', (value) => fs.rmSync(path.join(value.root, '.okf-staging/okf/guides/index.md')), 'PUBLISH_INDEX_MISSING'],
    ['changed', (value) => fs.writeFileSync(path.join(value.root, '.okf-staging/okf/guides/install.md'), '---\ntype: Research\nstatus: draft\n---\n# Install\n'), 'PUBLISH_CANDIDATE_CHANGED'],
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

test('a staged candidate at the bundle root is refused at the only write authority with zero writes', (t) => {
  const value = fixture(t);
  value.plan.mapping.find((item) => item.path === UNSPLIT_SOURCE).concept = 'decision';
  value.plan.plan.entries.find((item) => item.path === UNSPLIT_SOURCE).concept = 'decision';
  const staged = value.staged.find((item) => item.path === UNSPLIT_SOURCE);
  staged.concept = 'decision';
  const moved = path.join(value.root, '.okf-staging/okf/decision.md');
  fs.renameSync(path.join(value.root, staged.file), moved);
  staged.file = '.okf-staging/okf/decision.md';
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assertPrecheckRefusal(response, 'PUBLISH_ROOT_CONCEPT');
  assert.deepEqual(response.findings[0].detail, {
    path: 'decision.md', source: UNSPLIT_SOURCE, new_proposal_required: true,
  });
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
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

test('malformed accepted route rows fail closed at publication without throwing', (t) => {
  const value = fixture(t);
  acceptedSource(value).proposal.whole_source_link_routes.push({
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null, target: null,
  });
  bindAcceptedReview(value);
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('an accepted whole-source route with an unknown origin fails closed at publication without writing', (t) => {
  const value = fixture(t);
  acceptedSource(value).proposal.whole_source_link_routes.push({
    from: 'README.md',
    line: 1,
    occurrence: 1,
    resource: 'docs/guide.md',
    origin: 'missing',
    target: { kind: 'output', output: 'install' },
  });
  bindAcceptedReview(value);
  const before = snapshot(path.join(value.root, 'okf'));

  const response = publish(value);

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.findings[0].code, 'SPLIT_WORKER_REVIEW_INVALID');
  assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
});

test('a later write failure reports successful, failed, and unattempted writes exactly', (t) => {
  const value = fixture(t);
  const rank = (item) => (item.kind === 'index' ? 1 : 0);
  const order = ['guides/install', 'guides/operate', 'decisions/decision'];
  value.staged.sort((left, right) => rank(left) - rank(right)
    || order.indexOf(left.concept) - order.indexOf(right.concept));
  const existing = '---\ntype: Playbook\n---\n# Existing operate\n';
  fs.mkdirSync(path.join(value.root, 'okf', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(value.root, 'okf', 'guides', 'operate.md'), existing);

  const response = publish(value);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, ['guides/install']);
  assert.deepEqual(response.data.failed, [{ concept: 'guides/operate', status: 'failed' }]);
  assert.deepEqual(response.data.skipped, [
    { concept: 'decisions/decision', status: 'not-attempted' },
    { concept: 'decisions/index.md', status: 'not-attempted' },
    { concept: 'guides/index.md', status: 'not-attempted' },
    { concept: 'index.md', status: 'not-attempted' },
  ]);
  assert.equal(fs.existsSync(path.join(value.root, 'okf', 'guides', 'install.md')), true);
  assert.equal(fs.readFileSync(path.join(value.root, 'okf', 'guides', 'operate.md'), 'utf8'), existing);
  assert.equal(fs.existsSync(path.join(value.root, 'okf', 'decisions', 'decision.md')), false);
  const receipt = JSON.parse(fs.readFileSync(path.join(value.root, response.data.publication_receipt.path), 'utf8'));
  assert.deepEqual(receipt.results, response.data.results);
  assert.deepEqual(receipt.classification, {
    status: 'partial',
    published: ['guides/install'],
    failed: [{ concept: 'guides/operate', status: 'failed' }],
    skipped: [
      { concept: 'decisions/decision', status: 'not-attempted' },
      { concept: 'decisions/index.md', status: 'not-attempted' },
      { concept: 'guides/index.md', status: 'not-attempted' },
      { concept: 'index.md', status: 'not-attempted' },
    ],
  });
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

test('external inbound anchor decisions do not invent a candidate link, but an invented link blocks', (t) => {
  const inbound = fixture(t);
  addAnchorRoute(inbound);
  assert.equal(publish(inbound).data.status, 'complete');

  const wrong = fixture(t);
  assertZeroWriteRefusal(wrong, (value) => {
    addAnchorRoute(value);
    const file = path.join(value.root, '.okf-staging/okf/guides/install.md');
    fs.appendFileSync(file, '\n[route](install.md#wrong)\n');
    const row = value.semantic_review.candidates.find((item) => item.path === 'guides/install.md');
    row.identity = identity(fs.readFileSync(file));
  }, 'PUBLISH_ROUTE_MISMATCH');
});

test('external inbound whole-source decisions do not invent a candidate self-link, but an invented link blocks', (t) => {
  const inbound = fixture(t);
  addWholeSourceRoute(inbound);
  assert.equal(publish(inbound).data.status, 'complete');

  const wrong = fixture(t);
  assertZeroWriteRefusal(wrong, (value) => {
    addWholeSourceRoute(value);
    const file = path.join(value.root, '.okf-staging/okf/guides/install.md');
    fs.appendFileSync(file, '\n[route](operate.md)\n');
    const row = value.semantic_review.candidates.find((item) => item.path === 'guides/install.md');
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
    const row = value.plan.group_packages.indexes.find((item) => item.key === 'operators');
    const file = path.join(value.root, '.okf-staging/okf/operators/index.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Wrong\n\n- [Wrong](wrong.md)\n');
    value.staged.push({
      kind: 'index', path: row.index_entry.path, file: '.okf-staging/okf/operators/index.md',
      group: row,
    });
    value.semantic_review.candidates.push({ path: row.index_entry.path, identity: identity(fs.readFileSync(file)) });
    value.semantic_review.candidates.sort((left, right) => left.path.localeCompare(right.path));
    bindAcceptedReview(value);
  }, 'PUBLISH_INDEX_CHANGED');
});

test('an accepted generated group index publishes from its checked bytes', (t) => {
  const value = fixture(t);
  grouped(value);
  const output = acceptedSource(value).proposal.outputs.find((item) => item.output === 'install');
  value.staged.find((item) => item.output === 'install').accepted_output = structuredClone(output);
  const row = value.plan.group_packages.indexes.find((item) => item.key === 'operators');
  const indexFile = path.join(value.root, '.okf-staging/okf/operators/index.md');
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, '# Operators\n\nOperate the service.\n\n- [Install](install.md)\n');
  value.staged.push({
    kind: 'index', path: row.index_entry.path, file: '.okf-staging/okf/operators/index.md',
    group: row,
  });
  value.semantic_review.candidates.push({ path: row.index_entry.path, identity: identity(fs.readFileSync(indexFile)) });
  value.semantic_review.candidates.sort((left, right) => left.path.localeCompare(right.path));
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
    resource: 'docs/decision.md', origin: 'operate', target: 'okf/operators/install.md',
  });
  value.staged.find((item) => item.output === 'operate').accepted_output = structuredClone(routeOwner);
  const routeFile = path.join(value.root, '.okf-staging/okf/runbooks/operate.md');
  fs.appendFileSync(routeFile, '\n[Install](../operators/install.md)\n');
  value.semantic_review.candidates.find((item) => item.path === 'runbooks/operate.md').identity = identity(fs.readFileSync(routeFile));
  value.semantic_review.candidates.sort((left, right) => left.path.localeCompare(right.path));
  bindAcceptedReview(value);

  const response = publish(value);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.equal(fs.existsSync(path.join(value.root, 'okf/operators/index.md')), true);
  assert.equal(fs.existsSync(path.join(value.root, 'okf/runbooks/index.md')), true);
});

test('a route cannot move to another accepted output with the same global target count', (t) => {
  const value = fixture(t, {
    prepare(root) {
      fs.writeFileSync(path.join(root, 'docs/other.md'), '# Other\n');
      fs.writeFileSync(path.join(root, SPLIT_SOURCE), SPLIT_CONTENT.replace('Install the tool.', 'Install [other](other.md).'));
    },
    installRoute: {
      from: SPLIT_SOURCE, line: 6, occurrence: 1,
      resource: 'other.md', origin: 'install', target: 'docs/other.md',
    },
    bodies: { [`${SPLIT_SOURCE}:install`]: '# Install\n\n[Other](../../docs/other.md)\n' },
  });
  const installFile = path.join(value.root, '.okf-staging/okf/guides/install.md');
  const operateFile = path.join(value.root, '.okf-staging/okf/guides/operate.md');
  fs.writeFileSync(installFile, fs.readFileSync(installFile, 'utf8').replace('\n[Other](../../docs/other.md)\n', '\n'));
  fs.appendFileSync(operateFile, '\n[Other](../../docs/other.md)\n');
  refreshCandidate(value, 'guides/install.md');
  refreshCandidate(value, 'guides/operate.md');

  assertZeroWriteRefusal(value, () => {}, 'PUBLISH_ROUTE_MISMATCH');
});

test('a local anchor link in output A routes to its accepted heading in output B', (t) => {
  const value = fixture(t, {
    prepare(root) {
      fs.writeFileSync(path.join(root, SPLIT_SOURCE), SPLIT_CONTENT.replace(
        'Install the tool.', 'Install the tool and see [operations](#operate).',
      ));
    },
    installAnchorRoute: {
      from: SPLIT_SOURCE, line: 6, occurrence: 1, resource: '#operate',
      origin: 'install', target_output: 'operate', source_anchor: 'operate',
      line_start: 8, line_end: 10, target_anchor: 'operate',
    },
    bodies: { [`${SPLIT_SOURCE}:install`]: '# Install\n\n[Operations](operate.md#operate)\n' },
  });

  const response = publish(value);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
});

test('an ordinary split route retains its accepted query and fragment', (t) => {
  const resource = 'other.md?view=full#section';
  const value = fixture(t, {
    prepare(root) {
      fs.writeFileSync(path.join(root, 'docs/other.md'), '# Other\n\n## Section\n');
      fs.writeFileSync(path.join(root, SPLIT_SOURCE), SPLIT_CONTENT.replace('Install the tool.', `Install [other](${resource}).`));
    },
    installRoute: {
      from: SPLIT_SOURCE, line: 6, occurrence: 1, resource, origin: 'install',
      target: 'docs/other.md?view=full#section',
    },
    bodies: { [`${SPLIT_SOURCE}:install`]: '# Install\n\n[Other](../../docs/other.md?view=full#section)\n' },
  });

  assert.equal(publish(value).data.status, 'complete');

  const wrong = fixture(t, {
    prepare(root) {
      fs.writeFileSync(path.join(root, 'docs/other.md'), '# Other\n\n## Section\n');
      fs.writeFileSync(path.join(root, SPLIT_SOURCE), SPLIT_CONTENT.replace('Install the tool.', `Install [other](${resource}).`));
    },
    installRoute: {
      from: SPLIT_SOURCE, line: 6, occurrence: 1, resource, origin: 'install',
      target: 'docs/other.md?view=full#section',
    },
    bodies: { [`${SPLIT_SOURCE}:install`]: '# Install\n\n[Other](../../docs/other.md?view=full#section)\n' },
  });
  assertZeroWriteRefusal(wrong, (current) => {
    const file = path.join(current.root, '.okf-staging/okf/guides/install.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('#section', '#wrong'));
    refreshCandidate(current, 'guides/install.md');
  }, 'PUBLISH_ROUTE_MISMATCH');
});

test('an unsplit candidate proves its rewritten links from the accepted mapping body', (t) => {
  const options = {
    prepare(root) {
      fs.writeFileSync(path.join(root, 'docs/other.md'), '# Other\n\n## Section\n');
      fs.writeFileSync(path.join(root, UNSPLIT_SOURCE), UNSPLIT_CONTENT.replace(
        'Keep this decision.', 'Keep [this decision](other.md?view=full#section).',
      ));
    },
  };
  const value = fixture(t, options);
  assert.equal(publish(value).data.status, 'complete');

  const wrong = fixture(t, options);
  assertZeroWriteRefusal(wrong, (current) => {
    const candidatePath = 'decisions/decision.md';
    const file = path.join(current.root, '.okf-staging/okf', candidatePath);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('#section', '#wrong'));
    refreshCandidate(current, candidatePath);
  }, 'PUBLISH_ROUTE_MISMATCH');
});

test('two reviewed sources can contribute ordered children to one accepted group index', (t) => {
  const value = sharedGroupFixture(t);

  const response = publish(value);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.equal(fs.readFileSync(path.join(value.root, 'okf/common/index.md'), 'utf8'), [
    '# Shared', '', 'Use the shared concepts.', '', '- [Alpha](alpha.md)', '- [Beta](beta.md)', '',
  ].join('\n'));
});

test('a conflicting accepted group index definition or index tamper blocks every write', (t) => {
  const conflict = sharedGroupFixture(t);
  assertZeroWriteRefusal(conflict, (value) => {
    const row = value.plan.group_packages.indexes.find((item) => item.key === 'common');
    row.child_entries.find((item) => item.concept_id === 'common/beta').order = 1;
  }, 'PUBLISH_CANDIDATE_CHANGED');

  const tamper = sharedGroupFixture(t);
  assertZeroWriteRefusal(tamper, (value) => {
    const file = path.join(value.root, '.okf-staging/okf/common/index.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('[Beta](beta.md)', '[Beta](wrong.md)'));
    refreshCandidate(value, 'common/index.md');
  }, 'PUBLISH_INDEX_CHANGED');
});

test('writer dispatch uses the exact candidate bytes checked by the precheck', (t) => {
  const value = fixture(t);
  const stagedFile = path.join(value.root, '.okf-staging/okf/guides/install.md');
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
      split_review: value.plan.split_review, group_packages: value.plan.group_packages,
      semantic_review: value.semantic_review,
    },
  }, services);

  assert.equal(response.data.status, 'complete', JSON.stringify(response));
  assert.match(checked, /# Install/);
  assert.match(fs.readFileSync(path.join(value.root, 'okf/guides/install.md'), 'utf8'), /# Install/);
  assert.doesNotMatch(fs.readFileSync(path.join(value.root, 'okf/guides/install.md'), 'utf8'), /# Replaced/);
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
      const stagedFile = path.join(value.root, '.okf-staging/okf/guides/install.md');
      const target = path.join(value.root, '.okf-staging/okf/guides/install-real.md');
      fs.renameSync(stagedFile, target);
      fs.symlinkSync(target, stagedFile);
    }
    const response = publish(value);
    assertPrecheckRefusal(response, 'PUBLISH_STAGING_SYMLINK');
    assert.deepEqual(snapshot(path.join(value.root, 'okf')), before);
  }
});

test('a receipt removal failure is reported without a runtime failure or reportable receipt', (t) => {
  const value = fixture(t);
  const receiptFile = path.join(value.root, '.okf-staging', 'okf', '.okf-publication-receipt.json');
  const response = runtime.run('okf-setup', {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'publish',
    payload: {
      cwd: value.root, task_kind: 'feature work', staged: value.staged,
      plan: value.plan.plan, mapping: value.plan.mapping,
      split_review: value.plan.split_review, group_packages: value.plan.group_packages,
      semantic_review: value.semantic_review,
    },
  }, {
    ...defaultServices,
    remove(file) {
      if (path.resolve(file) === receiptFile) throw Object.assign(new Error('receipt directory unavailable'), { code: 'EACCES' });
      return defaultServices.remove(file);
    },
  });

  assert.equal(response.result, 'failed/incomplete');
  assert.equal(response.data.code, 'PUBLICATION_RECEIPT_WRITE_FAILED');
  assert.equal(response.data.publication_receipt, undefined);
  assert.equal(response.findings[0].code, 'PUBLICATION_RECEIPT_WRITE_FAILED');
  assert.equal(fs.existsSync(path.join(value.root, 'okf/guides/install.md')), false);
});

test('a receipt persistence failure after dispatch reports every actual write outcome', (t) => {
  const value = fixture(t);
  const rank = (item) => (item.kind === 'index' ? 1 : 0);
  const order = ['guides/install', 'guides/operate', 'decisions/decision'];
  value.staged.sort((left, right) => rank(left) - rank(right)
    || order.indexOf(left.concept) - order.indexOf(right.concept));
  const receiptFile = path.join(value.root, '.okf-staging', 'okf', '.okf-publication-receipt.json');
  const response = runtime.run('okf-setup', {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'publish',
    payload: {
      cwd: value.root, task_kind: 'feature work', staged: value.staged,
      plan: value.plan.plan, mapping: value.plan.mapping,
      split_review: value.plan.split_review, group_packages: value.plan.group_packages,
      semantic_review: value.semantic_review,
    },
  }, {
    ...defaultServices,
    writeFile(file, content) {
      if (path.resolve(file) === receiptFile) throw Object.assign(new Error('receipt unavailable'), { code: 'EACCES' });
      return defaultServices.writeFile(file, content);
    },
  });

  assert.equal(response.result, 'failed/incomplete');
  assert.equal(response.data.code, 'PUBLICATION_RECEIPT_WRITE_FAILED');
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, [
    'guides/install', 'guides/operate', 'decisions/decision', 'decisions/index.md', 'guides/index.md', 'index.md',
  ]);
  assert.deepEqual(response.data.failed, []);
  assert.deepEqual(response.data.skipped, []);
  assert.deepEqual(response.data.results.map(({ concept, status }) => ({ concept, status })), [
    { concept: 'guides/install', status: 'clean' },
    { concept: 'guides/operate', status: 'clean' },
    { concept: 'decisions/decision', status: 'clean' },
    { concept: 'decisions/index.md', status: 'clean' },
    { concept: 'guides/index.md', status: 'clean' },
    { concept: 'index.md', status: 'clean' },
  ]);
  assert.equal(response.data.candidate_conformance.passed, true);
  assert.equal(response.data.publication_receipt, undefined);
  assert.equal(response.findings.at(-1).code, 'PUBLICATION_RECEIPT_WRITE_FAILED');
  assert.equal(fs.existsSync(path.join(value.root, 'okf/guides/install.md')), true);
  assert.equal(fs.existsSync(path.join(value.root, 'okf/guides/operate.md')), true);
  assert.equal(fs.existsSync(path.join(value.root, 'okf/decisions/decision.md')), true);
});
