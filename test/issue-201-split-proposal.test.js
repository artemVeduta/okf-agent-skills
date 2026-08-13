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
  'Install the [tool](other.md).',
  '',
  '## Operate',
  '',
  'Run the tool.',
  '',
].join('\n');

const README = '[Guide](docs/guide.md) and [operations](docs/guide.md#operate).\n';
const OTHER = '---\ntype: Note\n---\n# Other\n';

function repo(t) {
  const root = temporaryRoot(t, 'okf-201-proposal-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, SOURCE), CONTENT);
  fs.writeFileSync(path.join(root, 'README.md'), README);
  fs.writeFileSync(path.join(root, 'docs/other.md'), OTHER);
  return root;
}

function run(value) {
  return runWrapper(wrapper, value);
}

function sources(root, paths = [SOURCE]) {
  return run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root },
  }).data.sources.filter((item) => paths.includes(item.path));
}

function request(root, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources: sources(root), split_requested: [SOURCE], ...extra },
  };
}

function requestFor(root, paths, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources: sources(root, paths), split_requested: [SOURCE], ...extra },
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
    heading_outline: [{ level: 1, text: 'Install' }, { level: 2, text: 'Operate' }],
    reader_purpose_group: group,
    provenance_assignments: provenance,
    link_routes: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md', target: 'docs/other.md' }],
    anchor_routes: [{
      from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
      source_anchor: 'operate', line_start: 10, line_end: 12, target_anchor: 'operate',
    }],
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
    whole_source_link_routes: [{
      from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
      target: { kind: 'output', output: outputs[0].output },
    }],
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
    whole_source_link_routes: [{
      from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
      target: { kind: 'output', output: 'guide' },
    }],
    known_routes: {
      whole_source: [{ from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md' }],
      heading_anchor: [{
        from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
        source_anchor: 'operate', line_start: 10, line_end: 12,
      }],
      ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md' }],
    },
    known_headings: [
      { line: 6, level: 1, text: 'Install', anchor: 'install', line_start: 6, line_end: 9, output: 'guide' },
      { line: 10, level: 2, text: 'Operate', anchor: 'operate', line_start: 10, line_end: 12, output: 'guide' },
    ],
    tree: { root: [{ concept_id: 'guide', path: 'guide.md', title: 'Guide' }], groups: [], unresolved: [] },
  });
});

test('an accepted one-to-many proposal binds accounting outputs and derives different reader-purpose groups', (t) => {
  const root = repo(t);
  const install = output(
    'install', 'operators/install', 'Install',
    navigation('operators', 'Install and operate the service.', 'operators/install', 'Install', 1),
    [{ source_index: 0, support: 'supported' }],
  );
  install.heading_outline = [{ level: 1, text: 'Install' }];
  install.anchor_routes = [];
  const operate = output(
    'operate', 'maintainers/operate', 'Operate',
    navigation('maintainers', 'Maintain the service.', 'maintainers/operate', 'Operate', 1),
  );
  operate.heading_outline = [{ level: 1, text: 'Operations' }];
  operate.link_routes = [];
  operate.anchor_routes[0].target_anchor = 'operations';
  const headingChanges = [{
    line: 10, source_heading: 'Operate', action: 'changed', output: 'operate',
    target_heading: 'Operations', target_level: 1, target_anchor: 'operations',
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
    unresolved: [],
  });
});

test('an ambiguous whole-source link route blocks acceptance until it names an output or group index', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs, {
      whole_source_link_routes: [{
        from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', target: null,
      }],
    }),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
    'SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { path: SOURCE, from: 'README.md' },
  ]]);
});

test('complete accounting derives the first complete refused proposal view without a caller proposal', (t) => {
  const root = repo(t);
  const response = run(request(root, { split_sections: accounting(['guide']) }));
  const proposed = review(response).proposal;

  assert.equal(proposed.status, 'refused');
  assert.equal(proposed.accepted, false);
  assert.equal(proposed.result, 'keep_as_one');
  assert.equal(proposed.outputs[0].output, 'guide');
  assert.equal(proposed.outputs[0].concept_id, 'docs/guide');
  assert.equal(proposed.outputs[0].path, 'docs/guide.md');
  assert.equal(proposed.outputs[0].type, 'Note');
  assert.equal(proposed.outputs[0].title, null);
  assert.deepEqual(proposed.outputs[0].heading_outline, []);
  assert.deepEqual(proposed.outputs[0].reader_purpose_group, {
    key: null,
    purpose: null,
    index_entry: { path: null, title: null },
    child_entry: { concept_id: null, path: null, title: null, order: null },
  });
  assert.deepEqual(proposed.known_routes, {
    whole_source: [{ from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md' }],
    heading_anchor: [{
      from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
      source_anchor: 'operate', line_start: 10, line_end: 12,
    }],
    ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md' }],
  });
  assert.deepEqual(proposed.tree, { root: [], groups: [], unresolved: ['guide'] });
  assert.deepEqual(new Set(splitFindings(response)
    .filter((item) => item.code === 'SPLIT_PROPOSAL_VALUE_UNRESOLVED')
    .map((item) => item.detail.field)), new Set([
    'keep_as_one_reason', 'title', 'heading_outline', 'reader_purpose_group', 'anchor_routes.target_anchor',
  ]));
});

test('route inventory includes local anchors and links from the bundle root', (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(path.join(root, 'okf/index.md'), '[Bundle guide](../docs/guide.md).\n');
  writeManifest(root, 'okf');
  fs.writeFileSync(path.join(root, SOURCE), CONTENT.replace(
    'Install the [tool](other.md).',
    'Install the [tool](other.md) and see [operations](#operate).',
  ));

  const response = run(request(root, { split_sections: accounting(['guide']) }));

  assert.deepEqual(review(response).proposal.known_routes, {
    whole_source: [
      { from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md' },
      { from: 'okf/index.md', line: 1, occurrence: 1, resource: '../docs/guide.md' },
    ],
    heading_anchor: [
      {
        from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
        source_anchor: 'operate', line_start: 10, line_end: 12,
      },
      {
        from: SOURCE, line: 8, occurrence: 2, resource: '#operate',
        source_anchor: 'operate', line_start: 10, line_end: 12,
      },
    ],
    ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md' }],
  });
});

test('an incomplete route inventory walk blocks the proposal with one exact finding', (t) => {
  const root = repo(t);
  fs.symlinkSync(path.join(root, 'README.md'), path.join(root, 'linked.md'));

  const response = run(request(root, { split_sections: accounting(['guide']) }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.deepEqual(splitFindings(response).filter((item) => item.code === 'SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE'), [{
    code: 'SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { path: SOURCE, reason: 'walk_incomplete' },
  }]);
});

test('an unreadable Markdown file blocks route inventory instead of being skipped', (t) => {
  const root = repo(t);
  const unreadable = path.join(root, 'inbound.md');
  fs.writeFileSync(unreadable, '[Guide](docs/guide.md).\n');
  const boundRequest = request(root, { split_sections: accounting(['guide']) });
  fs.chmodSync(unreadable, 0o000);
  let response;
  try {
    response = run(boundRequest);
  } finally {
    fs.chmodSync(unreadable, 0o644);
  }

  assert.deepEqual(splitFindings(response).filter((item) => item.code === 'SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE'), [{
    code: 'SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { path: SOURCE, reason: 'read_failed', from: 'inbound.md' },
  }]);
});

test('duplicate source heading anchors stay visible and block ambiguous routing', (t) => {
  const root = repo(t);
  const duplicate = [
    '---', 'type: Note', '---', '# Operate', '', 'First.', '', '# Operate', '', 'Second.', '',
  ].join('\n');
  fs.writeFileSync(path.join(root, SOURCE), duplicate);
  fs.writeFileSync(path.join(root, 'README.md'), '[Operations](docs/guide.md#operate).\n');
  const splitSections = [{
    path: SOURCE,
    sections: [
      { line_start: 1, line_end: 3, disposition: 'residue' },
      { line_start: 4, line_end: 7, disposition: 'assigned', output: 'guide' },
      { line_start: 8, line_end: 10, disposition: 'assigned', output: 'guide' },
    ],
  }];

  const response = run(request(root, { split_sections: splitSections }));
  const proposed = review(response).proposal;

  assert.deepEqual(proposed.known_headings.map((item) => ({ line: item.line, text: item.text, anchor: item.anchor })), [
    { line: 4, text: 'Operate', anchor: 'operate' },
    { line: 8, text: 'Operate', anchor: 'operate' },
  ]);
  assert.deepEqual(proposed.known_routes.heading_anchor, [{
    from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md#operate',
    source_anchor: 'operate', line_start: null, line_end: null, candidate_lines: [4, 8],
  }]);
  assert.deepEqual(splitFindings(response).filter((item) => item.code === 'SPLIT_HEADING_ANCHOR_AMBIGUOUS'), [{
    code: 'SPLIT_HEADING_ANCHOR_AMBIGUOUS',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: {
      path: SOURCE,
      from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md#operate',
      source_anchor: 'operate', candidate_lines: [4, 8],
    },
  }]);
});

test('a block-boundary fragment inside a heading does not invent a second heading row', (t) => {
  const root = repo(t);
  const divided = ['---', 'type: Note', '---', '# Operate', '', 'First paragraph.', '', 'Second paragraph.'].join('\n');
  fs.writeFileSync(path.join(root, SOURCE), divided);
  fs.writeFileSync(path.join(root, 'README.md'), 'No links.\n');
  const splitSections = [{
    path: SOURCE,
    sections: [
      { line_start: 1, line_end: 3, disposition: 'residue' },
      { line_start: 4, line_end: 7, disposition: 'assigned', output: 'guide' },
      { line_start: 8, line_end: 8, disposition: 'assigned', output: 'guide' },
    ],
  }];

  const response = run(request(root, { split_sections: splitSections }));

  assert.deepEqual(review(response).sections.slice(1).map((item) => [item.kind, item.heading_path]), [
    ['heading', ['Operate']], ['heading', ['Operate']],
  ]);
  assert.deepEqual(review(response).proposal.known_headings, [{
    line: 4, level: 1, text: 'Operate', anchor: 'operate', line_start: 4, line_end: 7, output: 'guide',
  }]);
});

test('missing, extra, and duplicate routes refuse acceptance against the known route inventory', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  outputs[0].link_routes = [];
  outputs[0].anchor_routes.push(outputs[0].anchor_routes[0]);
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs, {
      whole_source_link_routes: [
        {
          from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
          target: { kind: 'output', output: 'guide' },
        },
        {
          from: 'extra.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
          target: { kind: 'output', output: 'guide' },
        },
      ],
    }),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.equal(review(response).proposal.accepted, false);
  assert.deepEqual(new Set(splitFindings(response).map((item) => item.code)), new Set([
    'SPLIT_PROPOSAL_ROUTE_MISSING', 'SPLIT_PROPOSAL_ROUTE_EXTRA', 'SPLIT_PROPOSAL_ROUTE_DUPLICATE',
  ]));
});

test('omitted changed and removed source headings refuse acceptance', (t) => {
  const root = repo(t);
  const changed = output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }]);
  changed.heading_outline = [{ level: 1, text: 'Installation' }, { level: 2, text: 'Operate' }];
  const changedResponse = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', [changed]),
  }));
  const removed = output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }]);
  removed.heading_outline = [{ level: 1, text: 'Install' }];
  const removedResponse = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', [removed]),
  }));

  for (const response of [changedResponse, removedResponse]) {
    assert.equal(review(response).proposal.status, 'refused');
    assert.equal(review(response).proposal.accepted, false);
    assert.ok(splitFindings(response).some((item) => item.code === 'SPLIT_HEADING_CHANGE_MISSING'));
  }
});

test('a refused proposal reports accepted false even when the input says true', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'unclear' }])];
  const response = run(request(root, {
    split_sections: accounting(['guide']),
    split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.equal(review(response).proposal.status, 'refused');
  assert.equal(review(response).proposal.accepted, false);
});

test('two source proposals cannot claim the same target in one call', (t) => {
  const root = repo(t);
  fs.writeFileSync(path.join(root, 'docs/second.md'), CONTENT.replace('Guide', 'Second'));
  const first = output('guide', 'shared', 'Guide', null, [{ source_index: 0, support: 'supported' }]);
  const second = output('second', 'shared', 'Second', null, [{ source_index: 0, support: 'supported' }]);
  const secondProposal = proposal('keep_as_one', [second])[0];
  secondProposal.path = 'docs/second.md';
  secondProposal.whole_source_link_routes = [];
  second.anchor_routes = [];
  second.link_routes[0].from = 'docs/second.md';
  const response = run(requestFor(root, [SOURCE, 'docs/second.md'], {
    split_requested: [SOURCE, 'docs/second.md'],
    split_sections: [
      ...accounting(['guide']),
      { ...accounting(['second'])[0], path: 'docs/second.md' },
    ],
    split_proposals: [...proposal('keep_as_one', [first]), secondProposal],
  }));

  assert.ok(splitFindings(response).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
  assert.equal(response.data.split_review.every((item) => item.proposal.accepted === false), true);
});

test('a proposal cannot claim an unsplit migration target or an existing bundle file', (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf/existing.md'), '---\ntype: Note\n---\n# Existing\n');
  const unsplit = output('guide', 'docs/other', 'Guide', null, [{ source_index: 0, support: 'supported' }]);
  const disk = output('guide', 'existing', 'Guide', null, [{ source_index: 0, support: 'supported' }]);
  const forUnsplit = run(requestFor(root, [SOURCE, 'docs/other.md'], {
    split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', [unsplit]),
  }));
  const forDisk = run(request(root, {
    split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', [disk]),
  }));

  assert.ok(splitFindings(forUnsplit).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
  assert.ok(splitFindings(forDisk).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
});

test('a reversed anchor route range is UNSUPPORTED_INPUT', (t) => {
  const root = repo(t);
  const outputs = [output('guide', 'guide', 'Guide', null, [{ source_index: 0, support: 'supported' }])];
  outputs[0].anchor_routes[0].line_start = 12;
  outputs[0].anchor_routes[0].line_end = 10;
  const response = run(request(root, {
    split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', outputs),
  }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
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
  assert.equal(splitFindings(response).some((item) => item.code === 'SPLIT_PROPOSAL_OUTPUT_MISMATCH'), true);
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
    { first: '# Install', last: 'Install the [tool](other.md).' },
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
