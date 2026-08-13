// Domain: migration. What opens split review for a migrate source (word
// target, explicit user request, derived semantic boundaries) and how a source
// under review is sectioned and its section accounting validated.
const test = require('node:test');
const { describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runWrapper, temporaryRoot, writeManifest, TEST_WORKSPACE_ID } = require('../../test-support/snapshot');
const { planWithGroups } = require('../../test-support/groups');
const { countWords } = require('../../scripts/lib/words');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');

function run(value) {
  return runWrapper(wrapper, value);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function discoverSources(root) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } }).data.sources;
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function reviewFor(response, sourcePath) {
  return response.data.split_review.find((item) => item.path === sourcePath);
}

describe('what opens split review', () => {
  // Same fixture shape as #144/#145's own migration-plan tests: `migration-plan`
  // needs an active bundle (it checks a candidate target path for a collision),
  // so it is not bypass-gated -- a plain `.git` directory plus a manifest is
  // enough, no bundle-root directory has to actually exist for these fixtures
  // (the default bundle name resolves to `<root>/okf`, disjoint from wherever
  // `write()` below puts a source).
  function repo(t) {
    const root = temporaryRoot(t, 'okf-201-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    return root;
  }

  // #200's settings grammar (`schema_version`, `workspace_id`, `repositories`,
  // `bundles`, `settings`), hand-written the same way the manifest-grammar
  // tests do -- the shared `writeManifest` helper writes a fixed manifest with
  // no `settings` key, so a settings-override fixture needs its own writer.
  function writeManifestWithSettings(root, settings) {
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: TEST_WORKSPACE_ID,
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
      settings,
    }));
  }

  // #203: every migrate source now needs an accepted reader-purpose group before
  // `migration-plan` derives anything for it, including its split review -- so
  // every fixture below places its sources in one shared accepted group. Which
  // group they land in is orthogonal to the word-target trigger these tests
  // actually exercise.
  function placeAll(sources, group = 'content') {
    return Object.fromEntries(sources.map((item) => [item.path, group]));
  }

  function planned(root, sources, payload = {}) {
    return planWithGroups(run, (extra) => planRequest(root, sources, extra), {
      root, placement: placeAll(sources), payload,
    }).response;
  }

  // An explicit `type` keeps every fixture's disposition deterministically
  // `migrate` with no open question, whatever its size -- split review is
  // entirely orthogonal to #145's type inference.
  function markdownSource(bodyWordCount) {
    const body = Array.from({ length: bodyWordCount }, (_, i) => `word${i}`).join(' ');
    return `---\ntype: Note\n---\n# Heading\n\n${body}\n`;
  }

  // ---------------------------------------------------------- above the target

  test('a source above the effective target must receive split review, reason above_target', (t) => {
    const root = repo(t);
    const content = markdownSource(1200);
    write(root, 'docs/big.md', content);
    const sources = discoverSources(root);
    const response = planned(root, sources);

    assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
    const review = reviewFor(response, 'docs/big.md');
    assert.equal(review.word_count, countWords(content));
    assert.ok(review.word_count > 1000, review.word_count);
    assert.equal(review.review_required, true);
    assert.equal(review.review_reason, 'above_target');
  });

  // -------------------------------------------------------- at/below, no trigger

  test('a source at or below the target, with no boundaries found and no user request, gets no review', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    const sources = discoverSources(root);
    const response = planned(root, sources);

    const review = reviewFor(response, 'docs/small.md');
    assert.ok(review.word_count <= 1000, review.word_count);
    assert.equal(review.review_required, false);
    assert.equal(review.review_reason, null);
  });

  // ------------------------------------------------------ at/below, user request

  test('a source at or below the target with an explicit user request gets a permitted (not required) review, reason user_requested', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    const sources = discoverSources(root);
    const response = planned(root, sources, { split_requested: ['docs/small.md'] });

    const review = reviewFor(response, 'docs/small.md');
    assert.equal(review.review_required, false);
    assert.equal(review.review_reason, 'user_requested');
  });

  test('split_requested naming a source that stays at or below the target never upgrades review_required to true', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    write(root, 'docs/other.md', markdownSource(10));
    const sources = discoverSources(root);
    const response = planned(root, sources, { split_requested: ['docs/small.md'] });

    assert.equal(reviewFor(response, 'docs/other.md').review_reason, null);
  });

  test('setup-derived semantic boundaries open review without becoming a user request', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    const sources = discoverSources(root);
    const response = planned(root, sources, { semantic_boundary_sources: ['docs/small.md'] });

    const review = reviewFor(response, 'docs/small.md');
    assert.equal(review.review_required, false);
    assert.equal(review.review_reason, 'semantic_boundaries');
  });

  test('above-target and user-request reasons take precedence over derived semantic boundaries', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    write(root, 'docs/big.md', markdownSource(1200));
    const sources = discoverSources(root);
    const response = planned(root, sources, {
      split_requested: ['docs/small.md'],
      semantic_boundary_sources: ['docs/small.md', 'docs/big.md'],
    });

    assert.equal(reviewFor(response, 'docs/small.md').review_reason, 'user_requested');
    assert.equal(reviewFor(response, 'docs/big.md').review_reason, 'above_target');
  });

  test('semantic boundary sources require unique selected migrate paths', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    const sources = discoverSources(root);
    for (const semantic_boundary_sources of [
      'docs/small.md',
      [''],
      ['docs/small.md', 'docs/small.md'],
      ['docs/missing.md'],
    ]) {
      const response = run(planRequest(root, sources, { semantic_boundary_sources }));
      assert.equal(response.result, 'blocked', JSON.stringify(semantic_boundary_sources));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    }
  });

  // ------------------------------------------------------- invalid settings override

  test('an invalid max_words_per_file override leaves the built-in default (1000) effective, and the trigger uses it', (t) => {
    const root = repo(t);
    writeManifestWithSettings(root, { max_words_per_file: -5 });
    const content = markdownSource(1200);
    write(root, 'docs/big.md', content);
    const sources = discoverSources(root);
    const response = planned(root, sources);

    assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
    const review = reviewFor(response, 'docs/big.md');
    assert.equal(review.word_count, countWords(content));
    assert.equal(review.review_required, true);
    assert.equal(review.review_reason, 'above_target');
  });

  // -------------------------------------------------------- exceeding never blocks

  test('a source above the target still migrates, executable stays true, and nothing about the plan itself is blocked', (t) => {
    const root = repo(t);
    write(root, 'docs/big.md', markdownSource(1200));
    const sources = discoverSources(root);
    const response = planned(root, sources);

    assert.equal(response.result, 'ok');
    assert.equal(response.data.plan.executable, true);
    const entry = response.data.plan.entries.find((item) => item.path === 'docs/big.md');
    assert.equal(entry.disposition, 'migrate');
  });

  // ------------------------------------------------------------ payload validation

  test('a non-array split_requested is UNSUPPORTED_INPUT before anything is computed', (t) => {
    const root = repo(t);
    write(root, 'docs/small.md', markdownSource(10));
    const sources = discoverSources(root);
    const response = run(planRequest(root, sources, { split_requested: 'docs/small.md' }));

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });
});

describe('how a source under review is sectioned and accounted for', () => {
  // #203: `migration-plan` derives a split review only for a source with an
  // accepted reader-purpose group, so every fixture below places the one
  // fixture source here -- which accepted group it lands in is orthogonal to
  // the section-accounting subject these tests exercise.
  const GROUP = 'content';

  function repo(t) {
    const root = temporaryRoot(t, 'okf-201-sections-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    return root;
  }

  function codes(response, code) {
    return response.findings.filter((item) => item.code === code);
  }

  // The one fixture document every accounting case below is written against.
  // Line numbers are 1-based and inclusive at both ends, exactly as the runtime
  // reports them:
  //
  //   1 ---
  //   2 type: Note
  //   3 ---
  //   4 Preamble sentence.
  //   5
  //   6 # Title
  //   7
  //   8 First paragraph.
  //   9
  //  10 Second paragraph.
  //  11
  //  12 ## Details
  //  13
  //  14 ```js
  //  15 const a = 1;
  //  16
  //  17 const b = 2;
  //  18 ```
  //  19
  //  20 | a | b |
  //  21 | - | - |
  //  22 | 1 | 2 |
  //  23
  //  24 ## Notes
  //  25
  //  26 Last words.
  const FIXTURE = [
    '---', 'type: Note', '---',
    'Preamble sentence.', '',
    '# Title', '',
    'First paragraph.', '',
    'Second paragraph.', '',
    '## Details', '',
    '```js', 'const a = 1;', '', 'const b = 2;', '```', '',
    '| a | b |', '| - | - |', '| 1 | 2 |', '',
    '## Notes', '',
    'Last words.',
    '',
  ].join('\n');

  const SOURCE = 'docs/big.md';

  function fixtureRepo(t, content = FIXTURE) {
    const root = repo(t);
    write(root, SOURCE, content);
    return root;
  }

  // Split review is what makes a source need sections; the fixture is small, so
  // the user's own explicit request is the trigger (#200's third condition).
  function plan(root, extra = {}) {
    const sources = discoverSources(root);
    return planWithGroups(run, (payload) => planRequest(root, sources, payload), {
      root, placement: { [SOURCE]: GROUP }, payload: { split_requested: [SOURCE], ...extra },
    }).response;
  }

  function residue(lineStart, lineEnd) {
    return { line_start: lineStart, line_end: lineEnd, disposition: 'residue' };
  }

  function assigned(lineStart, lineEnd, output, order) {
    const section = { line_start: lineStart, line_end: lineEnd, disposition: 'assigned', output };
    if (order !== undefined) section.order = order;
    return section;
  }

  // A complete, legal accounting of the whole fixture: every line disposed once.
  function completeAccounting() {
    return [residue(1, 5), residue(6, 9), residue(10, 11), residue(12, 23), residue(24, 26)];
  }

  function withAccounting(root, sections, identity) {
    const entry = { path: SOURCE, sections };
    if (identity !== undefined) entry.source_identity = identity;
    return plan(root, { split_sections: [entry] });
  }

  // ---------------------------------------------------------------- derivation

  test('a source under split review carries one complete preamble before its heading sections', (t) => {
    const root = fixtureRepo(t);
    const review = reviewFor(plan(root), SOURCE);

    assert.equal(review.line_count, 26);
    assert.equal(review.accounting_status, 'derived');
    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 5],
      ['heading', 6, 11],
      ['heading', 12, 23],
      ['heading', 24, 26],
    ]);
    assert.deepEqual(review.sections.map((item) => item.heading_path), [
      [], ['Title'], ['Title', 'Details'], ['Title', 'Notes'],
    ]);
    assert.deepEqual(review.sections.map((item) => item.disposition), [null, null, null, null]);
  });

  test('derived section ranges cover the complete source once, with no gap and no overlap', (t) => {
    const root = fixtureRepo(t);
    const review = reviewFor(plan(root), SOURCE);

    let cursor = 1;
    for (const section of review.sections) {
      assert.equal(section.line_start, cursor);
      cursor = section.line_end + 1;
    }
    assert.equal(cursor - 1, review.line_count);
  });

  test('a source that is not under split review is not sectioned at all', (t) => {
    const root = fixtureRepo(t);
    const response = plan(root, { split_requested: [] });
    const review = reviewFor(response, SOURCE);

    assert.equal(review.review_reason, null);
    assert.equal(review.accounting_status, 'not_required');
    assert.deepEqual(review.sections, []);
  });

  test('a source with no heading at all is one indivisible preamble including frontmatter', (t) => {
    const root = fixtureRepo(t, '---\ntype: Note\n---\njust a line\n\nand another\n');
    const review = reviewFor(plan(root), SOURCE);

    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 6],
    ]);
  });

  test('a CRLF source is sectioned exactly like its LF twin, and a CRLF accounting validates', (t) => {
    const root = fixtureRepo(t, FIXTURE.split('\n').join('\r\n'));
    const derived = reviewFor(plan(root), SOURCE);

    assert.equal(derived.line_count, 26);
    assert.deepEqual(derived.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 5], ['heading', 6, 11], ['heading', 12, 23], ['heading', 24, 26],
    ]);
    assert.deepEqual(derived.sections.map((item) => item.heading_path), [
      [], ['Title'], ['Title', 'Details'], ['Title', 'Notes'],
    ]);
    assert.equal(reviewFor(withAccounting(root, completeAccounting()), SOURCE).accounting_status, 'complete');
  });

  test('frontmatter without a heading is the complete preamble section', (t) => {
    const root = fixtureRepo(t, '---\ntype: Note\n---');
    const review = reviewFor(plan(root), SOURCE);

    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [['preamble', 1, 3]]);
  });

  // #200's "a Markdown heading and its content form the normal source section"
  // is implemented for ATX headings only, and SKILL.md declares that limit: a
  // setext-headed source is one preamble, divisible only by the block-boundary
  // fallback, rather than silently mis-sectioned.
  test('a setext heading is not a section boundary, exactly as documented', (t) => {
    const root = fixtureRepo(t, '---\ntype: Note\n---\nTitle\n=====\n\nbody\n');
    const review = reviewFor(plan(root), SOURCE);

    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 7],
    ]);
  });

  test('a heading inside a fenced code block never starts a section', (t) => {
    const root = fixtureRepo(t, ['---', 'type: Note', '---', '# Real', '', '```', '# Not a heading', '```', '', 'tail', ''].join('\n'));
    const review = reviewFor(plan(root), SOURCE);

    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 3], ['heading', 4, 10],
    ]);
  });

  // ---------------------------------------------------------- source identity

  test('the source identity is a deterministic content hash of the source bytes', (t) => {
    const root = fixtureRepo(t);
    const review = reviewFor(plan(root), SOURCE);

    assert.equal(review.source_identity, `sha256:${crypto.createHash('sha256').update(FIXTURE, 'utf8').digest('hex')}`);
    assert.equal(reviewFor(plan(root), SOURCE).source_identity, review.source_identity);
  });

  test('an accounting that binds the current source identity is accepted', (t) => {
    const root = fixtureRepo(t);
    const identity = reviewFor(plan(root), SOURCE).source_identity;
    const review = reviewFor(withAccounting(root, completeAccounting(), identity), SOURCE);

    assert.equal(review.accounting_status, 'complete');
  });

  test('a changed source invalidates an accounting bound to the old identity, and is the only finding reported', (t) => {
    const root = fixtureRepo(t);
    const identity = reviewFor(plan(root), SOURCE).source_identity;
    // The source shrinks under the accounting: every range past line 11 now
    // names lines the file no longer has. None of that is measured -- ranges
    // built against the old bytes say nothing about the new ones.
    write(root, SOURCE, FIXTURE.split('\n').slice(0, 11).join('\n'));
    const response = withAccounting(root, completeAccounting(), identity);
    const review = reviewFor(response, SOURCE);

    const finding = codes(response, 'SPLIT_SOURCE_CHANGED');
    assert.equal(finding.length, 1);
    assert.equal(finding[0].blocks, true);
    assert.equal(finding[0].detail.path, SOURCE);
    assert.equal(finding[0].detail.expected, identity);
    assert.equal(finding[0].detail.actual, review.source_identity);
    assert.equal(review.accounting_status, 'refused');
    assert.deepEqual(response.findings.filter((item) => item.code.startsWith('SPLIT_')).map((item) => item.code), ['SPLIT_SOURCE_CHANGED']);
    // The current source's own sections are still reported, so the caller can
    // build the new accounting the refusal asks for.
    assert.deepEqual(review.sections.map((item) => item.disposition), [null, null]);
  });

  // ----------------------------------------- review the target itself opened

  // #200's one mandatory trigger, reached with no user request at all: the
  // source is over the effective `max_words_per_file`, so it is under review and
  // carries sections on that basis alone.
  const OVER_TARGET = [
    '---', 'type: Note', '---',
    '# Title', '',
    Array.from({ length: 600 }, (_, i) => `alpha${i}`).join(' '), '',
    '## Second', '',
    Array.from({ length: 600 }, (_, i) => `beta${i}`).join(' '),
    '',
  ].join('\n');

  test('a source the word target itself put under review carries its sections, with no user request involved', (t) => {
    const root = fixtureRepo(t, OVER_TARGET);
    const review = reviewFor(plan(root, { split_requested: [] }), SOURCE);

    assert.equal(review.review_required, true);
    assert.equal(review.review_reason, 'above_target');
    assert.equal(review.accounting_status, 'derived');
    assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
      ['preamble', 1, 3], ['heading', 4, 7], ['heading', 8, 10],
    ]);
  });

  test('an accounting for a source the word target put under review is validated on that basis alone', (t) => {
    const root = fixtureRepo(t, OVER_TARGET);
    const response = plan(root, {
      split_requested: [],
      split_sections: [{ path: SOURCE, sections: [residue(1, 3), assigned(4, 7, 'concept-a'), assigned(8, 10, 'concept-b')] }],
    });

    assert.equal(reviewFor(response, SOURCE).accounting_status, 'complete');
    assert.deepEqual(response.findings.filter((item) => item.code.startsWith('SPLIT_')
      && !item.code.startsWith('SPLIT_PROPOSAL_')), []);
  });

  test('an accounting for a source under no split review is refused, and nothing is sectioned for it', (t) => {
    const root = fixtureRepo(t);
    const response = plan(root, { split_requested: [], split_sections: [{ path: SOURCE, sections: completeAccounting() }] });
    const review = reviewFor(response, SOURCE);

    assert.equal(review.review_reason, null);
    assert.deepEqual(codes(response, 'SPLIT_SOURCE_NOT_UNDER_REVIEW')[0].detail, { path: SOURCE });
    assert.equal(review.accounting_status, 'refused');
    assert.equal(review.line_count, 0);
    assert.deepEqual(review.sections, []);
  });

  // ------------------------------------------------------------ one disposition

  test('a complete accounting reports one disposition for every section and no finding', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 9, 'concept-a'), assigned(10, 11, 'concept-a'),
      assigned(12, 23, 'concept-b'), residue(24, 26),
    ]);
    const review = reviewFor(response, SOURCE);

    assert.equal(response.result, 'ok');
    assert.equal(review.accounting_status, 'complete');
    assert.deepEqual(review.sections.map((item) => [item.line_start, item.line_end, item.disposition, item.output]), [
      [1, 5, 'residue', null], [6, 9, 'assigned', 'concept-a'],
      [10, 11, 'assigned', 'concept-a'], [12, 23, 'assigned', 'concept-b'], [24, 26, 'residue', null],
    ]);
    assert.deepEqual(review.sections.map((item) => item.heading_path), [
      [], ['Title'], ['Title'], ['Title', 'Details'], ['Title', 'Notes'],
    ]);
  });

  // ---------------------------------------------------------- block boundaries

  test('a heading section may be divided at a visible block boundary', (t) => {
    const root = fixtureRepo(t);
    // 6-9 and 10-11 divide the `# Title` section between its two paragraphs.
    const review = reviewFor(withAccounting(root, completeAccounting()), SOURCE);

    assert.equal(review.accounting_status, 'complete');
  });

  test('a preamble cannot be divided at a visible block boundary', (t) => {
    const root = fixtureRepo(t, '---\ntype: Note\n---\nFirst paragraph.\n\nSecond paragraph.\n');
    const response = withAccounting(root, [residue(1, 5), residue(6, 6)]);

    assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
    assert.equal(codes(response, 'SPLIT_SECTION_SUBDIVISION_INVALID').length, 2);
  });

  test('a boundary inside a fenced code block is refused, never quietly moved', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), residue(6, 9), residue(10, 11),
      residue(12, 14), residue(15, 23), residue(24, 26),
    ]);

    const finding = codes(response, 'SPLIT_SECTION_BOUNDARY_INVALID').find((item) => item.detail.line === 15);
    assert.ok(finding, JSON.stringify(response.findings));
    assert.equal(finding.blocks, true);
    assert.equal(finding.detail.path, SOURCE);
    assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
  });

  test('a boundary inside a table is refused', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), residue(6, 9), residue(10, 11),
      residue(12, 20), residue(21, 23), residue(24, 26),
    ]);

    assert.ok(codes(response, 'SPLIT_SECTION_BOUNDARY_INVALID').some((item) => item.detail.line === 21), JSON.stringify(response.findings));
  });

  test('one range swallowing a second heading is refused', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), residue(6, 9), residue(10, 11), residue(12, 26),
    ]);

    const finding = codes(response, 'SPLIT_SECTION_SPANS_HEADING');
    assert.equal(finding.length, 1);
    assert.equal(finding[0].detail.heading_line, 24);
    assert.equal(finding[0].detail.path, SOURCE);
  });

  // ------------------------------------------------------------------- coverage

  test('a missing range is a refusal naming the exact uncovered lines', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), residue(6, 9), residue(12, 23), residue(24, 26),
    ]);

    const finding = codes(response, 'SPLIT_COVERAGE_GAP');
    assert.equal(finding.length, 1);
    assert.equal(finding[0].blocks, true);
    assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 10, line_end: 11 });
    assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
  });

  test('an accounting that stops before the end of the source is a refusal, never a silently dropped tail', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [residue(1, 5), residue(6, 9), residue(10, 11), residue(12, 23)]);

    assert.deepEqual(codes(response, 'SPLIT_COVERAGE_GAP')[0].detail, { path: SOURCE, line_start: 24, line_end: 26 });
  });

  test('an overlapping range is a refusal naming the exact overlapping lines', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 11, 'concept-a'), assigned(10, 11, 'concept-b'), residue(12, 23), residue(24, 26),
    ]);

    const finding = codes(response, 'SPLIT_COVERAGE_OVERLAP');
    assert.equal(finding.length, 1);
    assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 10, line_end: 11 });
    assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
  });

  test('a doubly assigned section is refused as exactly that, not as a generic overlap', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), residue(6, 9),
      assigned(10, 11, 'concept-a'), assigned(10, 11, 'concept-b'),
      residue(12, 23), residue(24, 26),
    ]);

    const finding = codes(response, 'SPLIT_SECTION_ASSIGNED_TWICE');
    assert.equal(finding.length, 1);
    assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 10, line_end: 11, count: 2 });
    assert.equal(codes(response, 'SPLIT_COVERAGE_OVERLAP').length, 0);
  });

  test('a range outside the source is refused against the real line count', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [residue(1, 5), residue(6, 11), residue(12, 40)]);

    const finding = codes(response, 'SPLIT_SECTION_RANGE_INVALID');
    assert.equal(finding.length, 1);
    assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 12, line_end: 40, line_count: 26 });
  });

  // ------------------------------------------------------------ output order

  test('an output taking non-adjacent sections keeps source order by default', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 9, 'concept-a'), residue(10, 11),
      residue(12, 23), assigned(24, 26, 'concept-a'),
    ]);
    const review = reviewFor(response, SOURCE);

    assert.equal(review.accounting_status, 'complete');
    assert.deepEqual(review.outputs, [{
      output: 'concept-a',
      order_explicit: false,
      sections: [{ line_start: 6, line_end: 9 }, { line_start: 24, line_end: 26 }],
    }]);
  });

  test('a different output order must be explicit, and is reported exactly as accepted', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 9, 'concept-a', 2), residue(10, 11),
      residue(12, 23), assigned(24, 26, 'concept-a', 1),
    ]);
    const review = reviewFor(response, SOURCE);

    assert.equal(review.accounting_status, 'complete');
    assert.deepEqual(review.outputs, [{
      output: 'concept-a',
      order_explicit: true,
      sections: [{ line_start: 24, line_end: 26 }, { line_start: 6, line_end: 9 }],
    }]);
    assert.deepEqual(review.sections.filter((item) => item.output === 'concept-a').map((item) => [item.line_start, item.output_order]), [[6, 2], [24, 1]]);
  });

  test('an output ordering only some of its sections is refused', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 9, 'concept-a', 1), residue(10, 11),
      residue(12, 23), assigned(24, 26, 'concept-a'),
    ]);

    assert.deepEqual(codes(response, 'SPLIT_OUTPUT_ORDER_INCOMPLETE')[0].detail, { path: SOURCE, output: 'concept-a' });
  });

  test('an output order that is not one position per section is refused', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [
      residue(1, 5), assigned(6, 9, 'concept-a', 1), residue(10, 11),
      residue(12, 23), assigned(24, 26, 'concept-a', 3),
    ]);

    assert.deepEqual(codes(response, 'SPLIT_OUTPUT_ORDER_INVALID')[0].detail, { path: SOURCE, output: 'concept-a', orders: [1, 3] });
  });

  // ------------------------------------------------------------ payload gates

  test('an accounting for a path that is no migrate source of this plan is refused, never silently dropped', (t) => {
    const root = fixtureRepo(t);
    const response = plan(root, { split_sections: [{ path: 'docs/absent.md', sections: [residue(1, 1)] }] });

    assert.deepEqual(codes(response, 'SPLIT_SOURCE_UNKNOWN')[0].detail, { path: 'docs/absent.md' });
  });

  test('a malformed split_sections payload is UNSUPPORTED_INPUT before anything is computed', (t) => {
    const root = fixtureRepo(t);
    for (const value of [
      'docs/big.md',
      [{ path: SOURCE }],
      [{ path: SOURCE, sections: [{ line_start: 1, line_end: 3 }] }],
      [{ path: SOURCE, sections: [{ line_start: 1, line_end: 3, disposition: 'assigned' }] }],
      [{ path: SOURCE, sections: [{ line_start: '1', line_end: 3, disposition: 'residue' }] }],
      [{ path: SOURCE, sections: [{ line_start: 1, line_end: 3, disposition: 'residue', order: 1 }] }],
      [{ path: SOURCE, sections: [] }],
      [{ path: SOURCE, sections: [residue(1, 3)] }, { path: SOURCE, sections: [residue(1, 3)] }],
    ]) {
      const response = plan(root, { split_sections: value });
      assert.equal(response.result, 'blocked', JSON.stringify(value));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    }
  });

  test('a blocking split accounting finding never rewrites the plan itself', (t) => {
    const root = fixtureRepo(t);
    const response = withAccounting(root, [residue(1, 5), residue(6, 11), residue(12, 23)]);

    assert.equal(response.result, 'ok');
    assert.equal(response.data.plan.entries.find((item) => item.path === SOURCE).disposition, 'migrate');
  });
});
