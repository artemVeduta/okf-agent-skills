const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../../test-support/groups');
const splitProposal = require('../../scripts/lib/split-proposal');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');
const SOURCE = 'docs/guide.md';

// #203 (#202): a split output's own `reader_purpose_group` can no longer be
// `null` -- a substantive output can no longer land at the bundle root, whatever
// its type -- and the source itself now needs its own accepted group before
// `migration-plan` computes a split review for it at all. Every fixture below
// that does not deliberately exercise a different group placement uses this one
// shared accepted group, for the source-level placement answer and for a
// single-output proposal's own `reader_purpose_group` alike.
const GROUP = 'content';

describe('proposal shape, route inventory and canonical order', () => {
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

  // Every request below carries an accepted reader-purpose-group placement for
  // every source it names -- `migration-plan` asks for one before it will derive
  // anything else for a source, split review included -- so this one helper
  // wraps `planWithGroups` (the required test seam for that) rather than every
  // test rebuilding the same two-call dance. `boundSources` lets a fixture that
  // needs its `discover` call to happen before some later filesystem change
  // (an unreadable file, say) supply that frozen list directly.
  function plannedFrom(root, boundSources, payload = {}, bundle = 'okf') {
    return planWithGroups(run, (extra) => ({
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'migration-plan',
      payload: { cwd: root, sources: boundSources, split_requested: [SOURCE], ...extra },
    }), {
      root, bundle, placement: Object.fromEntries(boundSources.map((item) => [item.path, GROUP])), payload,
    }).response;
  }

  function planned(root, paths, payload = {}, bundle = '.') {
    return plannedFrom(root, sources(root, paths), payload, bundle);
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

  // The one accepted group most fixtures below place their single output in --
  // `conceptId` must already carry the `${GROUP}/` prefix `navigation` needs to
  // agree with `output`'s own `concept_id`.
  function groupFor(conceptId, title, order = 1) {
    return navigation(GROUP, `Reader purpose for ${GROUP}.`, conceptId, title, order);
  }

  function output(key, conceptId, title, group, provenance = []) {
    return {
      output: key,
      concept_id: conceptId,
      path: `${conceptId}.md`,
      type: 'Playbook',
      title,
      heading_outline: [{ level: 1, text: 'Install' }, { level: 2, text: 'Operate' }],
      reader_purpose_group: group,
      provenance_assignments: provenance,
      link_routes: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md', origin: key, target: 'docs/other.md' }],
      anchor_routes: [{
        from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
        origin: null, target_output: key, source_anchor: 'operate', line_start: 10, line_end: 12, target_anchor: 'operate',
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
        origin: null, target: { kind: 'output', output: outputs[0].output },
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
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });

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
        origin: null, target: { kind: 'output', output: 'guide' },
      }],
      known_routes: {
        whole_source: [{ from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null }],
        heading_anchor: [{
          from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
          origin: null, target_output: 'guide', source_anchor: 'operate', line_start: 10, line_end: 12,
        }],
        ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md', origin: 'guide' }],
      },
      known_headings: [
        { line: 6, level: 1, text: 'Install', anchor: 'install', line_start: 6, line_end: 9, output: 'guide' },
        { line: 10, level: 2, text: 'Operate', anchor: 'operate', line_start: 10, line_end: 12, output: 'guide' },
      ],
      tree: {
        root: [],
        groups: [{
          key: GROUP, purpose: `Reader purpose for ${GROUP}.`,
          index_entry: { path: `${GROUP}/index.md`, title: 'Guide index' },
          child_entries: [{ concept_id: `${GROUP}/guide`, path: `${GROUP}/guide.md`, title: 'Guide', order: 1 }],
        }],
        unresolved: [],
      },
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
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['install', 'operate']),
      split_proposals: proposal('split', [install, operate], { heading_changes: headingChanges }),
    });

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
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs, {
        whole_source_link_routes: [{
          from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null, target: null,
        }],
      }),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
      'SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { path: SOURCE, from: 'README.md' },
    ]]);
  });

  test('complete accounting derives the first complete refused proposal view without a caller proposal', (t) => {
    const root = repo(t);
    const response = planned(root, [SOURCE], { split_sections: accounting(['guide']) });
    const proposed = review(response).proposal;

    assert.equal(proposed.status, 'refused');
    assert.equal(proposed.accepted, false);
    assert.equal(proposed.result, 'keep_as_one');
    assert.equal(proposed.outputs[0].output, 'guide');
    assert.equal(proposed.outputs[0].concept_id, `${GROUP}/guide`);
    assert.equal(proposed.outputs[0].path, `${GROUP}/guide.md`);
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
      whole_source: [{ from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null }],
      heading_anchor: [{
        from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
        origin: null, target_output: 'guide', source_anchor: 'operate', line_start: 10, line_end: 12,
      }],
      ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md', origin: 'guide' }],
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

    const response = planned(root, [SOURCE], { split_sections: accounting(['guide']) }, 'okf');

    assert.deepEqual(review(response).proposal.known_routes, {
      whole_source: [
        { from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null },
        { from: 'okf/index.md', line: 1, occurrence: 1, resource: '../docs/guide.md', origin: null },
      ],
      heading_anchor: [
        {
          from: 'README.md', line: 1, occurrence: 2, resource: 'docs/guide.md#operate',
          origin: null, target_output: 'guide', source_anchor: 'operate', line_start: 10, line_end: 12,
        },
        {
          from: SOURCE, line: 8, occurrence: 2, resource: '#operate',
          origin: 'guide', target_output: 'guide', source_anchor: 'operate', line_start: 10, line_end: 12,
        },
      ],
      ordinary: [{ from: SOURCE, line: 8, occurrence: 1, resource: 'other.md', origin: 'guide' }],
    });
  });

  test('a case-variant Markdown extension contributes a required route', (t) => {
    const root = repo(t);
    fs.writeFileSync(path.join(root, 'inbound.MARKDOWN'), '[Guide](docs/guide.md).\n');
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const complete = proposal('keep_as_one', outputs);
    complete[0].whole_source_link_routes.push({
      from: 'inbound.MARKDOWN', line: 1, occurrence: 1, resource: 'docs/guide.md',
      origin: null, target: { kind: 'output', output: 'guide' },
    });

    const accepted = planned(root, [SOURCE], {
      split_sections: accounting(['guide']), split_proposals: complete,
    });
    const omitted = planned(root, [SOURCE], {
      split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(review(accepted).proposal.status, 'accepted');
    assert.deepEqual(review(accepted).proposal.known_routes.whole_source, [
      { from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null },
      { from: 'inbound.MARKDOWN', line: 1, occurrence: 1, resource: 'docs/guide.md', origin: null },
    ]);
    assert.equal(splitFindings(omitted).some((item) => item.code === 'SPLIT_PROPOSAL_ROUTE_MISSING'), true);
    assert.equal(review(omitted).proposal.accepted, false);
  });

  test('an incomplete route inventory walk blocks the proposal with one exact finding', (t) => {
    const root = repo(t);
    const outside = temporaryRoot(t, 'okf-201-outside-');
    fs.writeFileSync(path.join(outside, 'material.md'), '# Elsewhere\n');
    fs.symlinkSync(path.join(outside, 'material.md'), path.join(root, 'linked.md'));

    const response = planned(root, [SOURCE], { split_sections: accounting(['guide']) });

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
    const boundSources = sources(root, [SOURCE]);
    fs.chmodSync(unreadable, 0o000);
    let response;
    try {
      response = plannedFrom(root, boundSources, { split_sections: accounting(['guide']) });
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

    const response = planned(root, [SOURCE], { split_sections: splitSections });
    const proposed = review(response).proposal;

    assert.deepEqual(proposed.known_headings.map((item) => ({ line: item.line, text: item.text, anchor: item.anchor })), [
      { line: 4, text: 'Operate', anchor: 'operate' },
      { line: 8, text: 'Operate', anchor: 'operate' },
    ]);
    assert.deepEqual(proposed.known_routes.heading_anchor, [{
      from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md#operate',
      origin: null, target_output: null, source_anchor: 'operate', line_start: null, line_end: null, candidate_lines: [4, 8],
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

  test('a block fragment starting #not-a-heading does not invent a heading row', (t) => {
    const root = repo(t);
    const divided = ['---', 'type: Note', '---', '# Operate', '', 'First paragraph.', '', '#not-a-heading'].join('\n');
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

    const response = planned(root, [SOURCE], { split_sections: splitSections });

    assert.deepEqual(review(response).sections.slice(1).map((item) => [item.kind, item.heading_path]), [
      ['heading', ['Operate']], ['heading', ['Operate']],
    ]);
    assert.deepEqual(review(response).proposal.known_headings, [{
      line: 4, level: 1, text: 'Operate', anchor: 'operate', line_start: 4, line_end: 7, output: 'guide',
    }]);
    assert.equal(splitFindings(response).some((item) => item.code.startsWith('SPLIT_HEADING_CHANGE_')), false);
  });

  test('missing, extra, and duplicate routes refuse acceptance against the known route inventory', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    outputs[0].link_routes = [];
    outputs[0].anchor_routes.push(outputs[0].anchor_routes[0]);
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs, {
        whole_source_link_routes: [
          {
            from: 'README.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
            origin: null, target: { kind: 'output', output: 'guide' },
          },
          {
            from: 'extra.md', line: 1, occurrence: 1, resource: 'docs/guide.md',
            origin: null, target: { kind: 'output', output: 'guide' },
          },
        ],
      }),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.equal(review(response).proposal.accepted, false);
    assert.deepEqual(new Set(splitFindings(response).map((item) => item.code)), new Set([
      'SPLIT_PROPOSAL_ROUTE_MISSING', 'SPLIT_PROPOSAL_ROUTE_EXTRA', 'SPLIT_PROPOSAL_ROUTE_DUPLICATE',
    ]));
  });

  test('omitted changed and removed source headings refuse acceptance', (t) => {
    const root = repo(t);
    const changed = output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }]);
    changed.heading_outline = [{ level: 1, text: 'Installation' }, { level: 2, text: 'Operate' }];
    const changedResponse = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', [changed]),
    });
    const removed = output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }]);
    removed.heading_outline = [{ level: 1, text: 'Install' }];
    const removedResponse = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', [removed]),
    });

    for (const response of [changedResponse, removedResponse]) {
      assert.equal(review(response).proposal.status, 'refused');
      assert.equal(review(response).proposal.accepted, false);
      assert.ok(splitFindings(response).some((item) => item.code === 'SPLIT_HEADING_CHANGE_MISSING'));
    }
  });

  test('a refused proposal reports accepted false even when the input says true', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'unclear' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.equal(review(response).proposal.accepted, false);
  });

  test('two source proposals cannot claim the same target in one call', (t) => {
    const root = repo(t);
    fs.writeFileSync(path.join(root, 'docs/second.md'), CONTENT.replace('Guide', 'Second'));
    const first = output('guide', `${GROUP}/shared`, 'Guide', groupFor(`${GROUP}/shared`, 'Guide'), [{ source_index: 0, support: 'supported' }]);
    const second = output('second', `${GROUP}/shared`, 'Second', groupFor(`${GROUP}/shared`, 'Second'), [{ source_index: 0, support: 'supported' }]);
    const secondProposal = proposal('keep_as_one', [second])[0];
    secondProposal.path = 'docs/second.md';
    secondProposal.whole_source_link_routes = [];
    second.anchor_routes = [];
    second.link_routes[0].from = 'docs/second.md';
    const response = planned(root, [SOURCE, 'docs/second.md'], {
      split_requested: [SOURCE, 'docs/second.md'],
      split_sections: [
        ...accounting(['guide']),
        { ...accounting(['second'])[0], path: 'docs/second.md' },
      ],
      split_proposals: [...proposal('keep_as_one', [first]), secondProposal],
    });

    assert.ok(splitFindings(response).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
    assert.equal(response.data.split_review.every((item) => item.proposal.accepted === false), true);
  });

  test('a shared group conflict refuses only proposals that claim that group', (t) => {
    const root = repo(t);
    const paths = [SOURCE, 'docs/second.md', 'docs/third.md'];
    fs.writeFileSync(path.join(root, paths[1]), CONTENT.replace('guide', 'second'));
    fs.writeFileSync(path.join(root, paths[2]), CONTENT.replace('guide', 'third'));

    const first = output('first', 'shared/first', 'First', navigation(
      'shared', 'First purpose.', 'shared/first', 'First', 1,
    ), [{ source_index: 0, support: 'supported' }]);
    const second = output('second', 'shared/second', 'Second', navigation(
      'shared', 'Conflicting purpose.', 'shared/second', 'Second', 2,
    ), [{ source_index: 0, support: 'supported' }]);
    const third = output('third', `${GROUP}/third`, 'Third', groupFor(`${GROUP}/third`, 'Third'), [{ source_index: 0, support: 'supported' }]);
    const proposals = proposal('keep_as_one', [first]);
    for (const [sourcePath, item] of [[paths[1], second], [paths[2], third]]) {
      item.link_routes[0].from = sourcePath;
      item.anchor_routes = [];
      const row = proposal('keep_as_one', [item])[0];
      row.path = sourcePath;
      row.whole_source_link_routes = [];
      proposals.push(row);
    }
    const response = planned(root, paths, {
      split_requested: paths,
      split_sections: paths.map((sourcePath, index) => ({
        ...accounting([[first, second, third][index].output])[0], path: sourcePath,
      })),
      split_proposals: proposals,
    });

    assert.equal(splitFindings(response).every((item) => item.blocks === true), true);
    assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [
      ['SPLIT_PROPOSAL_GROUP_CONFLICT', { path: SOURCE, group: 'shared', reason: 'definition' }],
      ['SPLIT_PROPOSAL_GROUP_CONFLICT', { path: paths[1], group: 'shared', reason: 'definition' }],
    ]);
    assert.deepEqual(response.data.split_review.map((item) => [
      item.path, item.proposal.status, item.proposal.accepted,
    ]), [
      [SOURCE, 'refused', false],
      [paths[1], 'refused', false],
      [paths[2], 'accepted', true],
    ]);
  });

  test('a proposal cannot claim an unsplit migration target or an existing bundle file', (t) => {
    const root = repo(t);
    // #144's own default bundle directory ("okf") applies here exactly as it does
    // everywhere else `migration-plan` runs without an explicit `bundle` override.
    fs.mkdirSync(path.join(root, 'okf', GROUP), { recursive: true });
    fs.writeFileSync(path.join(root, 'okf', GROUP, 'existing.md'), '---\ntype: Note\n---\n# Existing\n');
    const unsplit = output('guide', `${GROUP}/other`, 'Guide', groupFor(`${GROUP}/other`, 'Guide'), [{ source_index: 0, support: 'supported' }]);
    const disk = output('guide', `${GROUP}/existing`, 'Guide', groupFor(`${GROUP}/existing`, 'Guide'), [{ source_index: 0, support: 'supported' }]);
    const forUnsplit = planned(root, [SOURCE, 'docs/other.md'], {
      split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', [unsplit]),
    });
    const forDisk = planned(root, [SOURCE], {
      split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', [disk]),
    });

    assert.ok(splitFindings(forUnsplit).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
    assert.ok(splitFindings(forDisk).some((item) => item.code === 'SPLIT_PROPOSAL_TARGET_COLLISION'));
  });

  test('a reversed anchor route range is UNSUPPORTED_INPUT', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    outputs[0].anchor_routes[0].line_start = 12;
    outputs[0].anchor_routes[0].line_end = 10;
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']), split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });

  test('an unclear authored provenance assignment blocks acceptance', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'unclear' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
      'SPLIT_PROVENANCE_ASSIGNMENT_UNCLEAR', { path: SOURCE, output: 'guide', source_index: 0 },
    ]]);
  });

  test('a proposal must bind the exact opaque output keys from complete source accounting', (t) => {
    const root = repo(t);
    const outputs = [output('other', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.equal(splitFindings(response).some((item) => item.code === 'SPLIT_PROPOSAL_OUTPUT_MISMATCH'), true);
  });

  test('proposal output order becomes canonical without alphabetical reordering', (t) => {
    const root = repo(t);
    const zeta = output('zeta', `${GROUP}/zeta`, 'Zeta', groupFor(`${GROUP}/zeta`, 'Zeta', 1), [{ source_index: 0, support: 'supported' }]);
    zeta.heading_outline = [{ level: 1, text: 'Install' }];
    zeta.anchor_routes = [];
    const alpha = output('alpha', `${GROUP}/alpha`, 'Alpha', groupFor(`${GROUP}/alpha`, 'Alpha', 2));
    alpha.heading_outline = [{ level: 2, text: 'Operate' }];
    alpha.link_routes = [];
    // Two outputs of one proposal claim the same group, so they must carry the
    // same group definition -- one shared index row for the group they share.
    alpha.reader_purpose_group.index_entry = zeta.reader_purpose_group.index_entry = { path: `${GROUP}/index.md`, title: `${GROUP} index` };
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['zeta', 'alpha']),
      split_proposals: proposal('split', [zeta, alpha]),
    });

    assert.equal(review(response).proposal.status, 'accepted', JSON.stringify(response));
    assert.deepEqual(review(response).outputs.map((item) => item.output), ['zeta', 'alpha']);
    assert.deepEqual(review(response).proposal.outputs.map((item) => item.output), ['zeta', 'alpha']);
  });

  test('a proposal refuses a reserved concept path instead of accepting it as an output', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/log`, 'Guide', groupFor(`${GROUP}/log`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const response = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });

    assert.equal(review(response).proposal.status, 'refused');
    assert.deepEqual(splitFindings(response).map((item) => [item.code, item.detail]), [[
      'SPLIT_PROPOSAL_TARGET_INVALID', { path: SOURCE, output: 'guide', target_path: `${GROUP}/log.md` },
    ]]);
  });

  test('section rows carry deterministic short boundary excerpts for the split-review view', (t) => {
    const root = repo(t);
    const response = planned(root, [SOURCE]);

    assert.deepEqual(review(response).sections.map((item) => item.boundary_excerpt), [
      { first: '---', last: '---' },
      { first: '# Install', last: 'Install the [tool](other.md).' },
      { first: '## Operate', last: 'Run the tool.' },
    ]);
  });

  test('a user adjustment is one new complete proposal, not a partial patch of a prior call', (t) => {
    const root = repo(t);
    const outputs = [output('guide', `${GROUP}/guide`, 'Guide', groupFor(`${GROUP}/guide`, 'Guide'), [{ source_index: 0, support: 'supported' }])];
    const accepted = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: proposal('keep_as_one', outputs),
    });
    assert.equal(review(accepted).proposal.status, 'accepted');

    const partial = planned(root, [SOURCE], {
      split_sections: accounting(['guide']),
      split_proposals: [{ path: SOURCE, accepted: true, outputs: [{ output: 'guide', title: 'Renamed' }] }],
    });
    assert.equal(partial.result, 'blocked');
    assert.equal(partial.data.code, 'UNSUPPORTED_INPUT');
  });
});

/*
 * A source ATX heading that lands in a residue section.
 *
 * `sourceHeadings` builds `known_headings` from the accepted accounting and
 * carries each heading's own owning output, which is `null` for a heading inside
 * a `residue` section -- `headingChangeFindings` already assumes exactly that,
 * filtering `item.output !== null` before it asks for a change row. `validAccepted`
 * disagreed with both: it required a non-empty `output` on every known heading, so
 * `migration-plan` accepted such a proposal and `partition` then refused the same
 * value as `proposal_shape`, leaving every source with a residue heading
 * unpublishable at that seam.
 */
describe('a residue section that keeps the source heading', () => {
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

  // `# Install` (line 4) stays at the source as residue; only `# Operate` migrates,
  // so the accepted proposal is a keep-as-one carrying one residue-owned heading.
  const SECTIONS = [
    { line_start: 1, line_end: 3, disposition: 'residue' },
    { line_start: 4, line_end: 7, disposition: 'residue' },
    { line_start: 8, line_end: 10, disposition: 'assigned', output: 'operate' },
  ];

  function repo(t) {
    const root = temporaryRoot(t, 'okf-201-residue-heading-');
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

  function proposal() {
    return {
      path: SOURCE,
      result: 'keep_as_one',
      keep_as_one_reason: 'Only the operating instructions carry durable context.',
      accepted: true,
      outputs: [{
        output: 'operate',
        concept_id: `${GROUP}/operate`,
        path: `${GROUP}/operate.md`,
        type: 'Playbook',
        title: 'Operate',
        heading_outline: [{ level: 1, text: 'Operate' }],
        reader_purpose_group: {
          key: GROUP,
          purpose: `Reader purpose for ${GROUP}.`,
          index_entry: { path: `${GROUP}/index.md`, title: `${GROUP} index` },
          child_entry: {
            concept_id: `${GROUP}/operate`, path: `${GROUP}/operate.md`, title: 'Operate', order: 1,
          },
        },
        provenance_assignments: [],
        link_routes: [],
        anchor_routes: [],
      }],
      provenance_exclusions: [],
      heading_changes: [],
      whole_source_link_routes: [],
    };
  }

  function acceptedPlan(root) {
    const sources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
    const payload = {
      split_requested: [SOURCE],
      split_sections: [{ path: SOURCE, sections: SECTIONS }],
      split_proposals: [proposal()],
    };
    const placement = { [SOURCE]: GROUP };
    const request = (extra) => ({
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'migration-plan',
      payload: { cwd: root, sources, ...extra },
    });
    const { response } = planWithGroups(
      (value) => runWrapper(wrapper, value),
      request,
      { root, bundle: 'okf', placement, payload },
    );
    const concepts = response.data.split_review[0].proposal.outputs.map((item) => item.concept_id);
    const accepted = packagesFor(root, 'okf', placement, concepts, {});
    return run('migration-plan', root, {
      ...accepted,
      ...payload,
      sources,
      answers: { [SOURCE]: { reader_purpose_group: GROUP } },
    }).data;
  }

  test('an accepted proposal keeps a residue-owned source heading and still partitions', (t) => {
    const root = repo(t);
    const plan = acceptedPlan(root);
    const review = plan.split_review[0];

    assert.equal(review.accounting_status, 'complete');
    assert.equal(review.proposal.status, 'accepted');

    const residue = review.proposal.known_headings.find((item) => item.line === 4);
    assert.equal(residue.output, null, 'a heading inside a residue section owns no output');
    assert.ok(splitProposal.validAccepted(review.proposal), 'the accepted proposal must stay shape-valid');

    const partitioned = run('partition', root, {
      plan: plan.plan, mapping: plan.mapping, split_review: plan.split_review,
    });
    assert.equal(partitioned.result, 'ok', JSON.stringify(partitioned.findings));
    assert.equal(partitioned.data.shards.length, 1);
  }); // #201 Task 3/4
});
