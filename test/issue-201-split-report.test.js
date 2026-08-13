const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const SOURCE = 'docs/guide.md';

function run(operation, root, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
  });
}

function repo(t, headings) {
  const root = temporaryRoot(t, 'okf-201-split-report-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, 'okf');
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, SOURCE), [
    '---', 'type: Playbook', '---',
    ...headings.flatMap((heading) => [`# ${heading}`, '', `${heading} instructions.`]),
  ].join('\n'));
  return root;
}

function output(name, title, group = null) {
  const concept = group ? `${group}/${name}` : name;
  return {
    output: name,
    concept_id: concept,
    path: `${concept}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: group === null ? null : {
      key: group,
      purpose: 'Use these operator guides.',
      index_entry: { path: `${group}/index.md`, title: 'Operator guides' },
      child_entry: { concept_id: concept, path: `${concept}.md`, title, order: 1 },
    },
    provenance_assignments: [],
    link_routes: [],
    anchor_routes: [],
  };
}

function plan(root, outputs, result, keepReason = null) {
  const sources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
  const sections = [{ line_start: 1, line_end: 3, disposition: 'residue' }];
  for (let index = 0; index < outputs.length; index++) {
    const lineStart = 4 + (index * 3);
    sections.push({
      line_start: lineStart,
      line_end: lineStart + 2,
      disposition: 'assigned',
      output: outputs[index].output,
    });
  }
  const response = run('migration-plan', root, {
    sources,
    split_requested: [SOURCE],
    split_sections: [{ path: SOURCE, sections }],
    split_proposals: [{
      path: SOURCE,
      result,
      keep_as_one_reason: keepReason,
      accepted: true,
      outputs,
      provenance_exclusions: [],
      heading_changes: [],
      whole_source_link_routes: [],
    }],
  });
  assert.equal(response.data.split_review[0].proposal.status, 'accepted', JSON.stringify(response));
  return response.data;
}

function assemble(root, accepted) {
  const partitioned = run('partition', root, {
    plan: accepted.plan,
    mapping: accepted.mapping,
    references: accepted.references,
    split_review: accepted.split_review,
  });
  const brief = partitioned.data.shards[0].brief;
  const review = brief.split_review[0];
  const shard = {
    shard: brief.shard,
    concepts: review.proposal.outputs.map((item) => ({
      path: review.path,
      output: item.output,
      concept: item.concept_id,
      type: item.type,
      sections: review.outputs.find((candidate) => candidate.output === item.output).sections.map((section) => ({ ...section })),
      body: `# ${item.title}\n`,
    })),
    references: [], warnings: [], blockers: [],
  };
  const shardFile = '.okf-staging/shards/report.json';
  fs.mkdirSync(path.dirname(path.join(root, shardFile)), { recursive: true });
  fs.writeFileSync(path.join(root, shardFile), JSON.stringify(shard));
  const response = run('assemble', root, {
    partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
    shards: [{ shard: shard.shard, path: shardFile }],
  });
  assert.equal(response.result, 'ok', JSON.stringify(response));
  return response.data.staged;
}

function identity(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticInput(root, accepted) {
  const review = accepted.split_review[0];
  const stagingRoot = path.join(root, '.okf-staging', 'okf');
  const candidates = fs.readdirSync(stagingRoot, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.md'))
    .map((item) => {
      const candidatePath = path.relative(stagingRoot, path.join(item.parentPath, item.name)).split(path.sep).join('/');
      return { path: candidatePath, identity: identity(fs.readFileSync(path.join(stagingRoot, candidatePath))) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
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

function fixture(t, outputs, result = 'split', keepReason = null) {
  const root = repo(t, outputs.map((item) => item.title));
  const accepted = plan(root, outputs, result, keepReason);
  const staged = assemble(root, accepted);
  const validated = run('migration-validate', root, {
    selected: [SOURCE],
    plan: accepted.plan,
    split_review: accepted.split_review,
    semantic_review: semanticInput(root, accepted),
  });
  assert.equal(validated.data.publishable, true, JSON.stringify(validated));
  return { root, accepted, staged, validated: validated.data };
}

function publish(value) {
  return run('publish', value.root, {
    task_kind: 'feature work',
    staged: value.staged,
    plan: value.accepted.plan,
    mapping: value.accepted.mapping,
    split_review: value.accepted.split_review,
    semantic_review: value.validated.semantic_review,
  });
}

function report(value, publication) {
  return run('report', value.root, {
    migration: {
      settings: value.accepted.settings,
      split_review: value.accepted.split_review,
      validation: {
        structural_coverage: value.validated.structural_coverage,
        agent_semantic_review: value.validated.agent_semantic_review,
        semantic_fidelity: value.validated.semantic_fidelity,
        semantic_review: value.validated.semantic_review,
      },
      publication: publication.data,
    },
  });
}

test('one reviewed source with three published outputs counts three concepts and not its navigation index', (t) => {
  const outputs = [output('install', 'Install', 'operators'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs);
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.result, 'ok');
  assert.deepEqual(publication.data.candidate_conformance, {
    passed: true,
    concepts: outputs.map((item) => ({ source: SOURCE, concept: item.concept_id, path: item.path })),
    navigation_indexes: [{ path: 'operators/index.md' }],
  });
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.equal(response.data.summary.sources_total, 1);
  assert.equal(response.data.summary.concepts_created, 3);
  assert.equal(response.data.reviewed_sources[0].max_words_per_file, value.accepted.settings.max_words_per_file);
  assert.equal(response.data.reviewed_sources[0].word_count, value.accepted.split_review[0].word_count);
  assert.equal(response.data.reviewed_sources[0].review_reason, 'user_requested');
  assert.equal(response.data.reviewed_sources[0].accepted_result, 'split');
  assert.deepEqual(response.data.reviewed_sources[0].sections, value.accepted.split_review[0].sections);
  assert.deepEqual(response.data.reviewed_sources[0].planned_outputs, outputs);
  assert.deepEqual(response.data.reviewed_sources[0].actual_outputs, outputs);
  assert.deepEqual(response.data.reviewed_sources[0].conformance_result, { passed: true });
  assert.deepEqual(response.data.reviewed_sources[0].semantic_review_result, {
    passed: true,
    sections: value.validated.semantic_review.sources[0].sections,
  });
  assert.deepEqual(response.data.navigation_writes.published, ['operators/index.md']);
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
});

test('a keep-as-one report retains its accepted result and reason', (t) => {
  const reason = 'The source has one reader purpose.';
  const item = output('guide', 'Guide');
  const value = fixture(t, [item], 'keep_as_one', reason);
  const response = report(value, publish(value));

  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.equal(response.data.summary.concepts_created, 1);
  assert.equal(response.data.reviewed_sources[0].accepted_result, 'keep_as_one');
  assert.equal(response.data.reviewed_sources[0].reason, reason);
  assert.deepEqual(response.data.reviewed_sources[0].planned_outputs, [item]);
  assert.deepEqual(response.data.reviewed_sources[0].actual_outputs, [item]);
});

test('partial publication reports actual, failed, and not-attempted outputs without counting the latter two', (t) => {
  const outputs = [output('install', 'Install'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs);
  fs.writeFileSync(path.join(value.root, 'okf', 'operate.md'), '---\ntype: Playbook\n---\n# Existing\n');
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.data.status, 'partial');
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.summary.concepts_created, 1);
  assert.deepEqual(response.data.reviewed_sources[0].actual_outputs, [outputs[0]]);
  assert.deepEqual(response.data.reviewed_sources[0].failed_writes, [{ concept: 'operate', status: 'failed' }]);
  assert.deepEqual(response.data.reviewed_sources[0].skipped_writes, [{ concept: 'repair', status: 'not-attempted' }]);
  assert.deepEqual(response.data.writes, {
    published: ['install'],
    failed: [{ concept: 'operate', status: 'failed' }],
    skipped: [{ concept: 'repair', status: 'not-attempted' }],
  });
});

test('malformed or inconsistent reporting artifacts block with an exact finding', (t) => {
  const build = () => {
    const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.');
    const publication = publish(value);
    return { value, publication };
  };
  const cases = [
    ['malformed settings', ({ value }) => { delete value.accepted.settings.max_words_per_file; }, 'REPORT_ARTIFACT_MALFORMED'],
    ['extra split-review field', ({ value }) => { value.accepted.split_review[0].unexpected = true; }, 'REPORT_ARTIFACT_MALFORMED'],
    ['human flag mismatch', ({ value }) => { value.validated.semantic_fidelity.assessed = true; }, 'REPORT_ARTIFACT_MISMATCH'],
    ['candidate mismatch', ({ publication }) => {
      publication.data.candidate_conformance.concepts[0].concept = 'other';
      publication.data.candidate_conformance.concepts[0].path = 'other.md';
    }, 'REPORT_ARTIFACT_MISMATCH'],
    ['false success', ({ publication }) => { publication.data.published = []; }, 'REPORT_ARTIFACT_MISMATCH'],
  ];

  for (const [name, mutate, code] of cases) {
    const item = build();
    mutate(item);
    const response = report(item.value, item.publication);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', name);
    assert.equal(response.findings[0].code, code, name);
    assert.equal(response.findings[0].blocks, true, name);
  }
});
