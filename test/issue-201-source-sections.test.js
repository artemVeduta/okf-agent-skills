const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// Same fixture shape as #144/#145's own migration-plan tests and
// `test/issue-201-split-trigger.test.js`: `migration-plan` is not bypass-gated,
// so a `.git` directory plus a manifest is all a fixture needs.
function repo(t) {
  const root = temporaryRoot(t, 'okf-201-sections-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(value) {
  return runWrapper(wrapper, value);
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
  return run(planRequest(root, sources, { split_requested: [SOURCE], ...extra }));
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
  return [residue(1, 3), residue(4, 5), residue(6, 9), residue(10, 11), residue(12, 23), residue(24, 26)];
}

function withAccounting(root, sections, identity) {
  const entry = { path: SOURCE, sections };
  if (identity !== undefined) entry.source_identity = identity;
  return plan(root, { split_sections: [entry] });
}

// ------------------------------------------------------------------ derivation

test('a source under split review carries its derived sections: frontmatter, the preamble before the first heading, then one section per heading', (t) => {
  const root = fixtureRepo(t);
  const review = reviewFor(plan(root), SOURCE);

  assert.equal(review.line_count, 26);
  assert.equal(review.accounting_status, 'derived');
  assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
    ['frontmatter', 1, 3],
    ['preamble', 4, 5],
    ['heading', 6, 11],
    ['heading', 12, 23],
    ['heading', 24, 26],
  ]);
  assert.deepEqual(review.sections.map((item) => item.heading_path), [
    [], [], ['Title'], ['Title', 'Details'], ['Title', 'Notes'],
  ]);
  assert.deepEqual(review.sections.map((item) => item.disposition), [null, null, null, null, null]);
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

test('a source with no heading at all is one preamble section covering everything after its frontmatter', (t) => {
  const root = fixtureRepo(t, '---\ntype: Note\n---\njust a line\n\nand another\n');
  const review = reviewFor(plan(root), SOURCE);

  assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
    ['frontmatter', 1, 3], ['preamble', 4, 6],
  ]);
});

test('a heading inside a fenced code block never starts a section', (t) => {
  const root = fixtureRepo(t, ['---', 'type: Note', '---', '# Real', '', '```', '# Not a heading', '```', '', 'tail', ''].join('\n'));
  const review = reviewFor(plan(root), SOURCE);

  assert.deepEqual(review.sections.map((item) => [item.kind, item.line_start, item.line_end]), [
    ['frontmatter', 1, 3], ['heading', 4, 10],
  ]);
});

// ------------------------------------------------------------ source identity

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

test('a changed source invalidates an accounting bound to the old identity', (t) => {
  const root = fixtureRepo(t);
  const identity = reviewFor(plan(root), SOURCE).source_identity;
  write(root, SOURCE, `${FIXTURE}\nAn added line.\n`);
  const response = withAccounting(root, [...completeAccounting().slice(0, 5), residue(24, 28)], identity);

  const finding = codes(response, 'SPLIT_SOURCE_CHANGED');
  assert.equal(finding.length, 1);
  assert.equal(finding[0].blocks, true);
  assert.equal(finding[0].detail.path, SOURCE);
  assert.equal(finding[0].detail.expected, identity);
  assert.equal(finding[0].detail.actual, reviewFor(response, SOURCE).source_identity);
  assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
});

// -------------------------------------------------------------- one disposition

test('a complete accounting reports one disposition for every section and no finding', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), assigned(6, 9, 'concept-a'), assigned(10, 11, 'concept-a'),
    assigned(12, 23, 'concept-b'), residue(24, 26),
  ]);
  const review = reviewFor(response, SOURCE);

  assert.equal(response.result, 'ok');
  assert.equal(review.accounting_status, 'complete');
  assert.deepEqual(review.sections.map((item) => [item.line_start, item.line_end, item.disposition, item.output]), [
    [1, 3, 'residue', null], [4, 5, 'residue', null], [6, 9, 'assigned', 'concept-a'],
    [10, 11, 'assigned', 'concept-a'], [12, 23, 'assigned', 'concept-b'], [24, 26, 'residue', null],
  ]);
  assert.deepEqual(review.sections.map((item) => item.heading_path), [
    [], [], ['Title'], ['Title'], ['Title', 'Details'], ['Title', 'Notes'],
  ]);
});

// ------------------------------------------------------------ block boundaries

test('a heading section may be divided at a visible block boundary', (t) => {
  const root = fixtureRepo(t);
  // 6-9 and 10-11 divide the `# Title` section between its two paragraphs.
  const review = reviewFor(withAccounting(root, completeAccounting()), SOURCE);

  assert.equal(review.accounting_status, 'complete');
});

test('a boundary inside a fenced code block is refused, never quietly moved', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), residue(6, 9), residue(10, 11),
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
    residue(1, 3), residue(4, 5), residue(6, 9), residue(10, 11),
    residue(12, 20), residue(21, 23), residue(24, 26),
  ]);

  assert.ok(codes(response, 'SPLIT_SECTION_BOUNDARY_INVALID').some((item) => item.detail.line === 21), JSON.stringify(response.findings));
});

test('one range swallowing a second heading is refused', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), residue(6, 9), residue(10, 11), residue(12, 26),
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
    residue(1, 3), residue(4, 5), residue(6, 9), residue(12, 23), residue(24, 26),
  ]);

  const finding = codes(response, 'SPLIT_COVERAGE_GAP');
  assert.equal(finding.length, 1);
  assert.equal(finding[0].blocks, true);
  assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 10, line_end: 11 });
  assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
});

test('an accounting that stops before the end of the source is a refusal, never a silently dropped tail', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [residue(1, 3), residue(4, 5), residue(6, 9), residue(10, 11), residue(12, 23)]);

  assert.deepEqual(codes(response, 'SPLIT_COVERAGE_GAP')[0].detail, { path: SOURCE, line_start: 24, line_end: 26 });
});

test('an overlapping range is a refusal naming the exact overlapping lines', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), assigned(6, 11, 'concept-a'), assigned(10, 11, 'concept-b'), residue(12, 23), residue(24, 26),
  ]);

  const finding = codes(response, 'SPLIT_COVERAGE_OVERLAP');
  assert.equal(finding.length, 1);
  assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 10, line_end: 11 });
  assert.equal(reviewFor(response, SOURCE).accounting_status, 'refused');
});

test('a doubly assigned section is refused as exactly that, not as a generic overlap', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), residue(6, 9),
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
  const response = withAccounting(root, [residue(1, 3), residue(4, 5), residue(6, 11), residue(12, 40)]);

  const finding = codes(response, 'SPLIT_SECTION_RANGE_INVALID');
  assert.equal(finding.length, 1);
  assert.deepEqual(finding[0].detail, { path: SOURCE, line_start: 12, line_end: 40, line_count: 26 });
});

// -------------------------------------------------------------- output order

test('an output taking non-adjacent sections keeps source order by default', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), assigned(6, 9, 'concept-a'), residue(10, 11),
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
    residue(1, 3), residue(4, 5), assigned(6, 9, 'concept-a', 2), residue(10, 11),
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
    residue(1, 3), residue(4, 5), assigned(6, 9, 'concept-a', 1), residue(10, 11),
    residue(12, 23), assigned(24, 26, 'concept-a'),
  ]);

  assert.deepEqual(codes(response, 'SPLIT_OUTPUT_ORDER_INCOMPLETE')[0].detail, { path: SOURCE, output: 'concept-a' });
});

test('an output order that is not one position per section is refused', (t) => {
  const root = fixtureRepo(t);
  const response = withAccounting(root, [
    residue(1, 3), residue(4, 5), assigned(6, 9, 'concept-a', 1), residue(10, 11),
    residue(12, 23), assigned(24, 26, 'concept-a', 3),
  ]);

  assert.deepEqual(codes(response, 'SPLIT_OUTPUT_ORDER_INVALID')[0].detail, { path: SOURCE, output: 'concept-a', orders: [1, 3] });
});

// -------------------------------------------------------------- payload gates

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
  const response = withAccounting(root, [residue(1, 3), residue(4, 5), residue(6, 11), residue(12, 23)]);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.plan.entries.find((item) => item.path === SOURCE).disposition, 'migrate');
});
