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
  'sources:',
  '  - resource: https://example.com/guide',
  '---',
  '# Install',
  '',
  'Install the tool.',
  '',
  '## Operate',
  '',
  'Run the tool.',
  '',
].join('\n');

function repo(t) {
  const root = temporaryRoot(t, 'okf-201-proposal-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, SOURCE), CONTENT);
  return root;
}

function run(value) {
  return runWrapper(wrapper, value);
}

function sources(root) {
  return run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root },
  }).data.sources;
}

function request(root, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources: sources(root), split_requested: [SOURCE], ...extra },
  };
}

function accounting(outputs) {
  return [{
    path: SOURCE,
    sections: [
      { line_start: 1, line_end: 5, disposition: 'residue' },
      { line_start: 6, line_end: 9, disposition: 'assigned', output: outputs[0] },
      { line_start: 10, line_end: 12, disposition: 'assigned', output: outputs[1] || outputs[0] },
    ],
  }];
}

function navigation(key, purpose, conceptId, title, order) {
  return {
    key,
    purpose,
    index_entry: { path: `${key}/index.md`, title: `${title} index` },
    child_entry: { concept_id: conceptId, path: `${conceptId}.md`, title, order },
  };
}

function output(key, conceptId, title, group = null, provenance = []) {
  return {
    output: key,
    concept_id: conceptId,
    path: `${conceptId}.md`,
    type: 'Playbook',
    title,
    heading_outline: [{ level: 1, text: title }],
    reader_purpose_group: group,
    provenance_assignments: provenance,
    link_routes: [],
    anchor_routes: [],
  };
}

function proposal(result, outputs, extra = {}) {
  return [{
    path: SOURCE,
    result,
    keep_as_one_reason: result === 'keep_as_one' ? 'The source is one coherent operating guide.' : null,
    accepted: true,
    outputs,
    provenance_exclusions: [],
    heading_changes: [],
    whole_source_link_routes: [],
    ...extra,
  }];
}

function review(response) {
  return response.data.split_review.find((item) => item.path === SOURCE);
}

function splitFindings(response) {
  return response.findings.filter((item) => item.code.startsWith('SPLIT_'));
}

test('an accepted keep-as-one proposal carries the complete output shape and its reason', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.deepEqual(splitFindings(response), []);
  assert.equal(review(response).accounting_status, 'complete');
  assert.deepEqual(review(response).proposal, {
    status: 'accepted',
    result: 'keep_as_one',
    keep_as_one_reason: 'The source is one coherent operating guide.',
    accepted: true,
    outputs: outputs.map((item) => ({
      ...item,
      provenance_assignments: item.provenance_assignments.map((assignment) => ({
        ...assignment,
        source: { resource: 'https://example.com/guide' },
      })),
    })),
    provenance_exclusions: [],
    heading_changes: [],
    whole_source_link_routes: [],
    tree: { root: [{ concept_id: 'guide', path: 'guide.md', title: 'Guide' }], groups: [] },
  });
});

test('an accepted one-to-many proposal binds accounting outputs and derives different reader-purpose groups', (t) => {
  const root = repo(t);
  const install = output(
    'install', 'operators/install', 'Install',
    navigation('operators', 'Install and operate the service.', 'operators/install', 'Install', 1),
    [{ source_index: 0, support: 'supported' }],
  );
  const operate = output(
    'operate', 'maintainers/operate', 'Operate',
    navigation('maintainers', 'Maintain the service.', 'maintainers/operate', 'Operate', 1),
  );
  operate.anchor_routes.push({
    from: 'docs/checklist.md', source_anchor: 'operate', line_start: 10, line_end: 12, target_anchor: 'operations',
  });
  operate.heading_outline = [{ level: 1, text: 'Operations' }];
  const headingChanges = [{
    line: 10, source_heading: 'Operate', action: 'changed', output: 'operate',
    target_heading: 'Operations', target_anchor: 'operations',
  }];
  const response = run(request(root, {
    split_sections: accounting(['install', 'operate']),
    split_proposals: proposal('split', [install, operate], { heading_changes: headingChanges }),
  }));

  assert.deepEqual(splitFindings(response), []);
  assert.equal(review(response).proposal.status, 'accepted');
  assert.deepEqual(review(response).proposal.heading_changes, headingChanges);
  assert.deepEqual(review(response).proposal.tree, {
    root: [],
    groups: [
      {
        key: 'maintainers', purpose: 'Maintain the service.',
        index_entry: { path: 'maintainers/index.md', title: 'Operate index' },
        child_entries: [{ concept_id: 'maintainers/operate', path: 'maintainers/operate.md', title: 'Operate', order: 1 }],
      },
      {
        key: 'operators', purpose: 'Install and operate the service.',
        index_entry: { path: 'operators/index.md', title: 'Install index' },
        child_entries: [{ concept_id: 'operators/install', path: 'operators/install.md', title: 'Install', order: 1 }],
      },
    ],
  });
});

test('an ambiguous whole-source link route blocks acceptance until it names an output or group index', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs, {
      whole_source_link_routes: [{ from: 'README.md', target: null }],
    }),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
    'SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { path: SOURCE, from: 'README.md' },
  ]]);
});

test('an unclear authored provenance assignment blocks acceptance', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'unclear' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
    'SPLIT_PROVENANCE_ASSIGNMENT_UNCLEAR', { path: SOURCE, output: 'guide', source_index: 0 },
  ]]);
});

test('a proposal must bind the exact opaque output keys from complete source accounting', (t) => {
  const root = repo(t);
  const outputs = [output('other', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).map((item) => item.code), ['SPLIT_PROPOSAL_OUTPUT_MISMATCH']);
});

test('a proposal refuses a reserved concept path instead of accepting it as an output', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'index', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
    'SPLIT_PROPOSAL_TARGET_INVALID', { path: SOURCE, output: 'guide', target_path: 'index.md' },
  ]]);
});

test('section rows carry deterministic short boundary excerpts for the split-review view', (t) => {
  const root = repo(t);
  const response = run(request(root));

  assert.deepEqual(review(response).sections.map((item) => item.boundary_excerpt), [
    { first: '---', last: '---' },
    { first: '# Install', last: 'Install the tool.' },
    { first: '## Operate', last: 'Run the tool.' },
  ]);
});

test('a user adjustment is one new complete proposal, not a partial patch of a prior call', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const accepted = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));
  assert.equal(review(accepted).proposal.status, 'accepted');

  const partial = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: [{ path: SOURCE, accepted: true, outputs: [{ output: 'guide', title: 'Renamed' }] }],
  }));
  assert.equal(partial.result, 'blocked');
  assert.equal(partial.data.code, 'UNSUPPORTED_INPUT');
});
