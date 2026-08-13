const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const SOURCE = 'docs/guide.md';
const UNSPLIT_SOURCE = 'docs/decision.md';
// #203: every substantive concept belongs to an accepted reader-purpose group.
// Every fixture below places its reviewed outputs in this one accepted group,
// and its unsplit Decision source in the `decisions` group.
const GROUP = 'operators';
const DECISION_GROUP = 'decisions';

function run(operation, root, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
  });
}

// `planWithGroups` invokes its runner with one full request value, so it gets
// its own value-shaped runner rather than the three-argument one above.
function runValue(value) {
  return runWrapper(wrapper, value);
}

function repo(t, headings, withUnreviewed = false, bundle = 'okf') {
  const root = temporaryRoot(t, 'okf-201-split-report-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, bundle);
  fs.mkdirSync(path.join(root, bundle), { recursive: true });
  fs.writeFileSync(path.join(root, bundle, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, SOURCE), [
    '---', 'type: Playbook', '---',
    ...headings.flatMap((heading) => [`# ${heading}`, '', `${heading} instructions.`]),
  ].join('\n'));
  if (withUnreviewed) {
    fs.writeFileSync(path.join(root, UNSPLIT_SOURCE), '---\ntype: Decision\n---\n# Decision\n\nKeep this decision.\n');
  }
  return root;
}

function output(name, title, group = GROUP) {
  const concept = `${group}/${name}`;
  return {
    output: name,
    concept_id: concept,
    path: `${concept}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: {
      key: group,
      purpose: `Use the ${group} guides.`,
      index_entry: { path: `${group}/index.md`, title: group },
      child_entry: { concept_id: concept, path: `${concept}.md`, title, order: 0 },
    },
    provenance_assignments: [],
    link_routes: [],
    anchor_routes: [],
  };
}

function planRequest(root, extra) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, ...extra },
  };
}

function placementAnswers(placement) {
  return Object.fromEntries(
    Object.entries(placement).map(([source, group]) => [source, { reader_purpose_group: group }]),
  );
}

// `planWithGroups` derives index children from plan-entry concepts, which for a
// reviewed source is its one source-level concept rather than its accepted
// outputs. The accepted rows are therefore rebuilt from the real concept set --
// every accepted proposal output plus every unsplit entry concept -- and the
// plan is run once more, so the accepted package rows this plan carries are
// exactly the ones the conformance gate proves against later.
function acceptedPlan(root, bundle, sources, placement, payload = {}) {
  const { response } = planWithGroups(runValue, (extra) => planRequest(root, extra), {
    root, bundle, placement, payload,
  });
  const concepts = response.data.split_review.flatMap((item) => (
    item.proposal === null
      ? [response.data.plan.entries.find((entry) => entry.path === item.path).concept]
      : item.proposal.outputs.map((candidate) => candidate.concept_id)
  ));
  const accepted = packagesFor(root, bundle, placement, concepts, {});
  const final = runValue(planRequest(root, { ...accepted, ...payload, answers: placementAnswers(placement) }));
  assert.equal(final.result, 'ok', JSON.stringify(final));
  return final.data;
}

function plan(root, outputs, result, keepReason = null, withUnreviewed = false, bundle = 'okf') {
  const acceptedPaths = withUnreviewed ? [SOURCE, UNSPLIT_SOURCE] : [SOURCE];
  const sources = run('discover', root, { bundle }).data.sources.filter((item) => acceptedPaths.includes(item.path));
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
  outputs.forEach((item, index) => { item.reader_purpose_group.child_entry.order = index + 1; });
  const placement = { [SOURCE]: GROUP };
  if (withUnreviewed) placement[UNSPLIT_SOURCE] = DECISION_GROUP;
  const data = acceptedPlan(root, bundle, sources, placement, {
    bundle,
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
  assert.equal(data.split_review.find((item) => item.path === SOURCE).proposal.status, 'accepted', JSON.stringify(data));
  return data;
}

function assemble(root, accepted, bundle = 'okf') {
  const partitioned = run('partition', root, {
    bundle,
    plan: accepted.plan,
    mapping: accepted.mapping,
    references: accepted.references,
    split_review: accepted.split_review,
  });
  const brief = partitioned.data.shards[0].brief;
  const shard = {
    shard: brief.shard,
    concepts: brief.mapping.flatMap((mapping) => {
      const review = brief.split_review.find((item) => item.path === mapping.path);
      if (review.proposal === null) {
        return [{ path: mapping.path, concept: mapping.concept, type: mapping.type, body: mapping.body }];
      }
      return review.proposal.outputs.map((item) => ({
        path: review.path,
        output: item.output,
        concept: item.concept_id,
        type: item.type,
        sections: review.outputs.find((candidate) => candidate.output === item.output).sections.map((section) => ({ ...section })),
        body: `# ${item.title}\n`,
      }));
    }),
    references: [], warnings: [], blockers: [],
  };
  const shardFile = '.okf-staging/shards/report.json';
  fs.mkdirSync(path.dirname(path.join(root, shardFile)), { recursive: true });
  fs.writeFileSync(path.join(root, shardFile), JSON.stringify(shard));
  const response = run('assemble', root, {
    bundle,
    partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
    shards: [{ shard: shard.shard, path: shardFile }],
    group_packages: accepted.group_packages,
  });
  assert.equal(response.result, 'ok', JSON.stringify(response));
  return response.data.staged;
}

function identity(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticInput(root, accepted, bundle = 'okf') {
  const review = accepted.split_review.find((item) => item.path === SOURCE);
  const stagingRoot = path.join(root, '.okf-staging', bundle);
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

function fixture(t, outputs, result = 'split', keepReason = null, withUnreviewed = false, bundle = 'okf') {
  const root = repo(t, outputs.map((item) => item.title), withUnreviewed, bundle);
  const accepted = plan(root, outputs, result, keepReason, withUnreviewed, bundle);
  const staged = assemble(root, accepted, bundle);
  const validated = run('migration-validate', root, {
    bundle,
    selected: [SOURCE],
    plan: accepted.plan,
    split_review: accepted.split_review,
    semantic_review: semanticInput(root, accepted, bundle),
    group_packages: accepted.group_packages,
  });
  assert.equal(validated.data.publishable, true, JSON.stringify(validated));
  return { root, bundle, accepted, staged, validated: validated.data };
}

function publish(value) {
  return run('publish', value.root, {
    bundle: value.bundle,
    task_kind: 'feature work',
    staged: value.staged,
    plan: value.accepted.plan,
    mapping: value.accepted.mapping,
    split_review: value.accepted.split_review,
    semantic_review: value.validated.semantic_review,
    group_packages: value.accepted.group_packages,
  });
}

function report(value, publication) {
  return run('report', value.root, {
    bundle: value.bundle,
    migration: {
      settings: value.accepted.settings,
      plan: value.accepted.plan,
      mapping: value.accepted.mapping,
      split_review: value.accepted.split_review,
      group_packages: value.accepted.group_packages,
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
  const outputs = [output('install', 'Install'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs);
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.result, 'ok');
  assert.deepEqual(publication.data.candidate_conformance, {
    passed: true,
    concepts: outputs.map((item) => ({ source: SOURCE, concept: item.concept_id, path: item.path, type: item.type })),
    navigation_indexes: [{ path: 'index.md' }, { path: 'operators/index.md' }],
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
  assert.deepEqual(response.data.navigation_writes.published, ['index.md', 'operators/index.md']);
  assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
});

test('non-alphabetical accepted output order stays canonical through report', (t) => {
  const outputs = [output('zeta', 'Zeta'), output('alpha', 'Alpha')];
  const value = fixture(t, outputs);
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.result, 'ok', JSON.stringify(publication));
  assert.deepEqual(value.accepted.split_review[0].outputs.map((item) => item.output), ['zeta', 'alpha']);
  assert.deepEqual(value.staged.filter((item) => item.kind !== 'index').map((item) => item.output), ['zeta', 'alpha']);
  assert.deepEqual(publication.data.candidate_conformance.concepts.map((item) => item.concept), outputs.map((item) => item.concept_id));
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.deepEqual(response.data.reviewed_sources[0].planned_outputs.map((item) => item.output), ['zeta', 'alpha']);
  assert.deepEqual(response.data.writes.published, outputs.map((item) => item.concept_id));
});

test('an unsplit migration completes validation, publication, and report with one concept', (t) => {
  const root = repo(t, [], true);
  const sources = run('discover', root, {}).data.sources.filter((item) => item.path === UNSPLIT_SOURCE);
  const accepted = acceptedPlan(root, 'okf', sources, { [UNSPLIT_SOURCE]: DECISION_GROUP }, { bundle: 'okf', sources });
  const staged = assemble(root, accepted);
  const validation = run('migration-validate', root, {
    selected: [UNSPLIT_SOURCE], plan: accepted.plan, split_review: accepted.split_review,
    semantic_review: { performed: false },
    group_packages: accepted.group_packages,
  });
  assert.equal(validation.data.agent_semantic_review.passed, true, JSON.stringify(validation));
  assert.deepEqual(validation.data.semantic_review.sources, []);
  assert.deepEqual(validation.data.semantic_review.candidates.map((item) => item.path), ['decisions/decision.md', 'decisions/index.md', 'index.md']);
  const value = { root, bundle: 'okf', accepted, staged, validated: validation.data };
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.result, 'ok', JSON.stringify(publication));
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.deepEqual(response.data.summary, {
    sources_total: 1, concepts_created: 1, concepts_planned: 1, writes_failed: 0, writes_skipped: 0,
  });
  assert.deepEqual(response.data.reviewed_sources, []);
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
  fs.mkdirSync(path.join(value.root, 'okf', 'operators'), { recursive: true });
  fs.writeFileSync(path.join(value.root, 'okf', 'operators', 'operate.md'), '---\ntype: Playbook\n---\n# Existing\n');
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.data.status, 'partial');
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.summary.concepts_created, 1);
  assert.deepEqual(response.data.reviewed_sources[0].actual_outputs, [outputs[0]]);
  assert.deepEqual(response.data.reviewed_sources[0].failed_writes, [{ concept: 'operators/operate', status: 'failed' }]);
  assert.deepEqual(response.data.reviewed_sources[0].skipped_writes, [{ concept: 'operators/repair', status: 'not-attempted' }]);
  assert.deepEqual(response.data.writes, {
    published: ['operators/install'],
    failed: [{ concept: 'operators/operate', status: 'failed' }],
    skipped: [{ concept: 'operators/repair', status: 'not-attempted' }],
  });
});

test('a partial publication marks every touched group as needing repair with per-effect rows', (t) => {
  const outputs = [output('install', 'Install'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs, undefined, null, true);
  fs.mkdirSync(path.join(value.root, 'okf', 'operators'), { recursive: true });
  fs.writeFileSync(path.join(value.root, 'okf', 'operators', 'operate.md'), '---\ntype: Playbook\n---\n# Existing\n');
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.data.status, 'partial');
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.deepEqual(response.data.group_packages, [
    {
      group: 'decisions',
      purpose: 'Reader purpose for decisions',
      index: { disposition: 'created', target: 'decisions/index.md', result: 'not-attempted' },
      glossary: { disposition: 'none', target: null, result: 'not-planned' },
      guidance: { disposition: 'none', target: null, result: 'not-planned' },
      log: { disposition: 'none', target: null, result: 'not-planned' },
      concepts: { applied: ['decisions/decision'], failed: [], not_attempted: [] },
      needs_repair: true,
    },
    {
      group: 'operators',
      purpose: 'Reader purpose for operators',
      index: { disposition: 'created', target: 'operators/index.md', result: 'not-attempted' },
      glossary: { disposition: 'none', target: null, result: 'not-planned' },
      guidance: { disposition: 'none', target: null, result: 'not-planned' },
      log: { disposition: 'none', target: null, result: 'not-planned' },
      concepts: {
        applied: ['operators/install'],
        failed: [{ concept: 'operators/operate', status: 'failed' }],
        not_attempted: [{ concept: 'operators/repair', status: 'not-attempted' }],
      },
      needs_repair: true,
    },
  ]);
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

test('a coherent failed-to-clean JSON edit cannot fabricate actual publication', (t) => {
  const outputs = [output('install', 'Install'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs);
  fs.mkdirSync(path.join(value.root, 'okf', 'operators'), { recursive: true });
  fs.writeFileSync(path.join(value.root, 'okf', 'operators', 'operate.md'), '---\ntype: Playbook\n---\n# Existing\n');
  const publication = publish(value);
  const changed = structuredClone(publication);
  changed.data.results = changed.data.results.map((item) => ({ ...item, status: 'clean', findings: [] }));
  changed.data.published = changed.data.results.map((item) => item.concept);
  changed.data.failed = [];
  changed.data.skipped = [];
  changed.data.status = 'complete';

  const response = report(value, changed);

  assert.equal(response.result, 'blocked');
  assert.equal(response.findings[0].code, 'REPORT_ARTIFACT_MISMATCH');
  assert.deepEqual(response.findings[0].detail, { artifact: 'publication_receipt', reason: 'data_mismatch' });
});

test('changed suite-owned receipt bytes block even when caller JSON is unchanged', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.');
  const publication = publish(value);
  fs.appendFileSync(path.join(value.root, publication.data.publication_receipt.path), '\n');

  const response = report(value, publication);

  assert.equal(response.result, 'blocked');
  assert.deepEqual(response.findings[0].detail, { artifact: 'publication_receipt', reason: 'identity' });
});

test('report rejects complete-with-skipped and clean-after-failed Task 6 sequences', (t) => {
  const outputs = [output('install', 'Install'), output('operate', 'Operate'), output('repair', 'Repair')];
  const value = fixture(t, outputs);
  const publication = publish(value);
  const cases = [
    ['complete with skipped', (changed) => {
      const last = changed.data.results.at(-1);
      last.status = 'not-attempted';
      changed.data.published.pop();
      changed.data.skipped = [{ concept: last.concept, status: 'not-attempted' }];
    }],
    ['clean after failed', (changed) => {
      changed.data.results[0].status = 'failed';
      changed.data.failed = [{ concept: changed.data.results[0].concept, status: 'failed' }];
      changed.data.published = changed.data.results.slice(1).map((item) => item.concept);
      changed.data.status = 'partial';
    }],
  ];

  for (const [name, mutate] of cases) {
    const changed = structuredClone(publication);
    mutate(changed);
    const response = report(value, changed);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.findings[0].detail.reason, 'result_sequence', name);
  }
});

test('accepted plan and mapping prevent added or reassigned unreviewed candidate inflation', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.', true);
  const publication = publish(value);
  const cases = [
    ['added', (changedValue, changedPublication) => {
      changedValue.accepted.plan.entries.push({
        path: 'docs/added.md', disposition: 'migrate', reason: 'explicit_type', concept: 'added', type: 'Playbook',
      });
      changedValue.accepted.mapping.push({
        path: 'docs/added.md', concept: 'added', type: 'Playbook', sources: null,
        source_identity: `sha256:${'1'.repeat(64)}`, body: '# Added\n',
      });
      changedValue.accepted.split_review.push({
        path: 'docs/added.md', word_count: 2, review_required: false, review_reason: null,
        source_identity: `sha256:${'1'.repeat(64)}`, line_count: 0, sections: [], outputs: [],
        accounting_status: 'not_required', proposal: null,
      });
      changedPublication.data.candidate_conformance.concepts.push({
        source: 'docs/added.md', concept: 'added', path: 'added.md', type: 'Playbook',
      });
      changedPublication.data.results.push({ concept: 'added', status: 'clean', findings: [] });
      changedPublication.data.published.push('added');
      changedValue.validated.semantic_review.candidates.push({ path: 'added.md', identity: `sha256:${'2'.repeat(64)}` });
    }],
    ['reassigned', (changedValue, changedPublication) => {
      const mapping = changedValue.accepted.mapping.find((item) => item.path === UNSPLIT_SOURCE);
      mapping.concept = 'decisions/other';
      const entry = changedValue.accepted.plan.entries.find((item) => item.path === UNSPLIT_SOURCE);
      entry.concept = 'decisions/other';
      const candidate = changedPublication.data.candidate_conformance.concepts.find((item) => item.source === UNSPLIT_SOURCE);
      const oldConcept = candidate.concept;
      candidate.concept = 'decisions/other';
      candidate.path = 'decisions/other.md';
      const result = changedPublication.data.results.find((item) => item.concept === oldConcept);
      result.concept = candidate.concept;
      changedPublication.data.published[changedPublication.data.published.indexOf(oldConcept)] = candidate.concept;
      const semantic = changedValue.validated.semantic_review.candidates.find((item) => item.path === `${oldConcept}.md`);
      semantic.path = candidate.path;
    }],
  ];

  for (const [name, mutate] of cases) {
    const changedValue = structuredClone(value);
    changedValue.root = value.root;
    const changedPublication = structuredClone(publication);
    mutate(changedValue, changedPublication);
    const response = report(changedValue, changedPublication);
    assert.equal(response.result, 'blocked', name);
    assert.equal(response.findings[0].code, 'REPORT_ARTIFACT_MISMATCH', name);
  }
});

test('canonical semantic source identity must equal the accepted reviewed source identity', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.');
  const publication = publish(value);
  value.validated.semantic_review.sources[0].source_identity = `sha256:${'3'.repeat(64)}`;

  const response = report(value, publication);

  assert.equal(response.result, 'blocked');
  assert.deepEqual(response.findings[0].detail, { artifact: 'validation', reason: 'semantic_review' });
});

test('null or string unreviewed section and output arrays block without a runtime failure', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.', true);
  const publication = publish(value);
  for (const [field, bad] of [['sections', null], ['sections', 'none'], ['outputs', null], ['outputs', 'none']]) {
    const changed = structuredClone(value);
    changed.root = value.root;
    changed.accepted.split_review.find((item) => item.path === UNSPLIT_SOURCE)[field] = bad;
    const response = report(changed, publication);
    assert.equal(response.result, 'blocked', `${field}:${bad}`);
    assert.notEqual(response.result, 'failed/incomplete', `${field}:${bad}`);
    assert.equal(response.findings[0].code, 'REPORT_ARTIFACT_MALFORMED', `${field}:${bad}`);
  }
});

test('report refuses a symlinked receipt file or receipt ancestor', (t) => {
  for (const kind of ['receipt', 'staging', 'bundle']) {
    const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.');
    const publication = publish(value);
    const receipt = path.join(value.root, publication.data.publication_receipt.path);
    if (kind === 'receipt') {
      const target = `${receipt}.real`;
      fs.renameSync(receipt, target);
      fs.symlinkSync(target, receipt);
    } else if (kind === 'staging') {
      const ancestor = path.join(value.root, '.okf-staging');
      const target = path.join(value.root, '.okf-staging-real');
      fs.renameSync(ancestor, target);
      fs.symlinkSync(target, ancestor);
    } else {
      const ancestor = path.join(value.root, '.okf-staging', value.bundle);
      const target = path.join(value.root, '.okf-staging', 'real-bundle');
      fs.renameSync(ancestor, target);
      fs.symlinkSync(target, ancestor);
    }

    const response = report(value, publication);

    assert.equal(response.result, 'blocked', kind);
    assert.equal(response.findings[0].code, 'REPORT_ARTIFACT_MALFORMED', kind);
    assert.deepEqual(response.findings[0].detail, { artifact: 'publication_receipt', reason: 'symlink' }, kind);
  }
});

test('a normalized nested bundle uses its exact nested staging receipt path', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.', false, 'docs/bundle');
  const publication = publish(value);
  const response = report(value, publication);

  assert.equal(publication.data.publication_receipt.path, '.okf-staging/docs/bundle/.okf-publication-receipt.json');
  assert.equal(response.result, 'ok', JSON.stringify(response));
  assert.equal(response.data.summary.concepts_created, 1);
});

test('null and nonobject checked candidate receipt rows block without a runtime failure', (t) => {
  const value = fixture(t, [output('guide', 'Guide')], 'keep_as_one', 'One purpose.');
  const publication = publish(value);
  const receiptFile = path.join(value.root, publication.data.publication_receipt.path);
  const original = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  for (const bad of [null, 'bad']) {
    const receipt = structuredClone(original);
    receipt.checked_candidates = [bad];
    fs.writeFileSync(receiptFile, `${JSON.stringify(receipt)}\n`);
    publication.data.publication_receipt.identity = identity(fs.readFileSync(receiptFile));

    const response = report(value, publication);

    assert.equal(response.result, 'blocked', String(bad));
    assert.notEqual(response.result, 'failed/incomplete', String(bad));
    assert.equal(response.findings[0].code, 'REPORT_ARTIFACT_MALFORMED', String(bad));
    assert.deepEqual(response.findings[0].detail, { artifact: 'publication_receipt', reason: 'content' }, String(bad));
  }
});
