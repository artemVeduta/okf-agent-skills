/*
Issue #143 — widen the shared frontmatter reader (`parseYAML` in
`scripts/lib/validation.js`) to cover the YAML constructs OKF v0.2 concept
frontmatter genuinely uses, and to conservatively refuse every other
construct with a specific finding rather than silently parsing it into a
different meaning than a real YAML 1.2 parser would give it.

Every case below drives the one contract seam (`scripts/okf-write.js`'s
`revise` operation, reading an on-disk fixture written by hand as raw YAML
text) so the assertions observe the wrapper's behavior, not the shape of
`scripts/lib/validation.js`. A widened construct is proven by: the revise is
`applied` (which is only possible if the construct parsed and then
round-tripped through the write gate's `roundTripMismatch` check), and the
concept file on disk now shows the correctly-decoded, canonically
re-serialized value. A blocked construct is proven by: the revise is
`blocked` with a `FRONTMATTER_UNPARSEABLE` finding naming the construct, and
the concept file on disk is byte-identical to before the attempt.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper } = require('../test-support/snapshot');

const writeWrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function makeBundle(t, conceptFrontmatter) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'okf-143-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  fs.writeFileSync(path.join(root, 'note.md'), conceptFrontmatter);
  return root;
}

function revise(root, set = { title: 'After' }) {
  return runWrapper(writeWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'revise',
    task_kind: 'fix',
    scope: { concepts: ['note.md'] },
    payload: { cwd: root, bundle: root, concept: 'note.md', set, evidence: ['evidence.md'] },
  });
}

function notePath(root) {
  return path.join(root, 'note.md');
}

// -------------------------------------------------------- widened constructs

function widensTo(t, { given, becomes, set }) {
  const root = makeBundle(t, given);
  const response = revise(root, set);
  assert.equal(response.result, 'applied', JSON.stringify(response.findings));
  const written = fs.readFileSync(notePath(root), 'utf8');
  for (const fragment of becomes) assert.ok(written.includes(fragment), `expected ${JSON.stringify(fragment)} in:\n${written}`);
}

test('widen: YAML 1.2 core-schema capitalized booleans (True/TRUE/False/FALSE) resolve to real booleans', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nflag_a: True\nflag_b: TRUE\nflag_c: False\nflag_d: FALSE\n---\n# Note\n',
    becomes: ['flag_a: true', 'flag_b: true', 'flag_c: false', 'flag_d: false'],
  });
});

test('widen: YAML 1.2 core-schema capitalized nulls (Null/NULL) resolve to real null', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nfield_a: Null\nfield_b: NULL\n---\n# Note\n',
    becomes: ['field_a: null', 'field_b: null'],
  });
});

test('widen: a single-line flow sequence of scalars parses and canonicalizes to block form', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\ntags: [architecture, decision]\n---\n# Note\n',
    becomes: ['tags:\n  - architecture\n  - decision'],
  });
});

test('widen: an empty flow sequence and an empty flow mapping are recognized', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nempty_list: []\nempty_map: {}\n---\n# Note\n',
    becomes: ['empty_list: []', 'empty_map: {}'],
  });
});

test('widen: a flow sequence item that is itself a quoted string containing a comma is not mis-split', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\ntags: ["a,b", c]\n---\n# Note\n',
    becomes: ['tags:\n  - a,b\n  - c'],
  });
});

test('widen: double-quoted escape sequences \\t, \\r, and \\0 decode to their real control characters, not a mangled literal', (t) => {
  const root = makeBundle(t, '---\ntype: Note\nt_field: "a\\tb"\nr_field: "a\\rb"\nz_field: "a\\0b"\n---\n# Note\n');
  const response = revise(root);
  assert.equal(response.result, 'applied', JSON.stringify(response.findings));
  const written = fs.readFileSync(notePath(root), 'utf8');
  assert.ok(written.includes('a\tb'), 'tab must survive as a real tab byte, not the literal text "atb"');
  assert.ok(written.includes('a\rb'), 'CR must survive as a real CR byte, not the literal text "arb"');
  assert.ok(written.includes('a\0b'), 'NUL must survive as a real NUL byte, not the literal text "a0b"');
});

test('widen: double-quoted \\n forces re-quoting on write, and \\\\ / \\" decode to one real character each', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nnl_field: "before\\nafter"\nbs_field: "a\\\\b"\nqt_field: "say \\"hi\\""\n---\n# Note\n',
    becomes: ['nl_field: "before\\nafter"', 'bs_field: a\\b', 'qt_field: say "hi"'],
  });
});

test('widen: a single-quoted doubled quote decodes to one literal quote', (t) => {
  widensTo(t, {
    given: "---\ntype: Note\nphrase: 'it''s here'\n---\n# Note\n",
    becomes: ["phrase: it's here"],
  });
});

test('widen: a non-ASCII key and value survive a read-modify-write unchanged', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nключ: значение\n---\n# Note\n',
    becomes: ['ключ: значение'],
  });
});

test('widen: a sequence of mappings with more than one key per item (the sources[] shape) parses fully', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nsources:\n  - resource: a.md\n    id: x\n  - resource: b.md\n---\n# Note\n',
    becomes: ['sources:\n  - id: x\n    resource: a.md\n  - resource: b.md'],
  });
});

// ---------------------------------------------- already-correct, no change

test('already correct: YAML 1.1 words yes/no/on/off stay plain strings under YAML 1.2, unchanged', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\na: yes\nb: no\nc: on\nd: off\n---\n# Note\n',
    becomes: ['a: yes', 'b: no', 'c: on', 'd: off'],
  });
});

test('already correct: a bare date and a sexagesimal-looking value stay plain strings under YAML 1.2, unchanged', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nd: 2021-01-01\ns: 1:30:00\n---\n# Note\n',
    becomes: ['d: 2021-01-01', 's: 1:30:00'],
  });
});

test('already correct: comments glued to a scalar with no leading space are not treated as comments', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\ncode: 5#not-a-comment\n---\n# Note\n',
    becomes: ['code: "5#not-a-comment"'],
  });
});

test('already correct: a comment after a quoted value containing a hash is stripped correctly', (t) => {
  widensTo(t, {
    given: '---\ntype: Note\nnote: "a # not a comment" # a real comment\n---\n# Note\n',
    becomes: ['note: "a # not a comment"'],
  });
});

// --------------------------------------------------------- blocked, loud

function blocksWith(t, { given, code, reasonIncludes }) {
  const root = makeBundle(t, given);
  const before = fs.readFileSync(notePath(root));
  const response = revise(root);
  assert.equal(response.result, 'blocked');
  const finding = response.findings.find((item) => item.code === code);
  assert.ok(finding, `expected a ${code} finding, got ${JSON.stringify(response.findings)}`);
  assert.equal(finding.origin, 'okf');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.blocks, true);
  assert.equal(finding.detail.path, 'note.md');
  assert.ok(
    finding.detail.reason.includes(reasonIncludes),
    `expected reason to include ${JSON.stringify(reasonIncludes)}, got ${JSON.stringify(finding.detail.reason)}`,
  );
  assert.deepEqual(fs.readFileSync(notePath(root)), before, 'a blocked construct must never reach disk');
  return finding;
}

test('block: a block scalar (|) is refused, not silently flattened', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nbody: |\n  line one\n  line two\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'block scalars are not supported',
  });
});

test('block: a folded block scalar (>) is refused, not silently flattened', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nbody: >\n  line one\n  line two\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'block scalars are not supported',
  });
});

test('block: a non-empty flow mapping is refused, not silently flattened', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nmeta: {a: 1}\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'flow mappings are not supported',
  });
});

test('block: a flow sequence containing a nested flow collection is refused, not silently truncated', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\ntags: [[a], b]\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'nested flow collection is not supported',
  });
});

test('block: an anchor is refused, not silently treated as a plain word', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nfield: &anchor value\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'unsupported construct',
  });
});

test('block: an alias is refused, not silently treated as a plain word', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nfield: *anchor\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'unsupported construct',
  });
});

test('block: an explicit tag is refused, not silently treated as a plain word', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nfield: !!str value\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'unsupported construct',
  });
});

test('block: a bare document-end marker ("...") inside frontmatter is refused by name', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\na: 1\n...\nb: 2\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'multi-document markers are not supported',
  });
});

test('block: nested sequences (a list of lists) are refused, not silently flattened', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nmatrix:\n  - - 1\n    - 2\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'nested sequences are not supported',
  });
});

test('block: duplicate keys are refused, not silently resolved to the last value', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\na: 1\na: 2\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "duplicate key 'a'",
  });
});

test('block: a hex integer literal is refused, not silently kept as its literal text', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nn: 0x1A\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "numeric literal '0x1A' is not supported",
  });
});

test('block: an octal integer literal is refused, not silently kept as its literal text', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nn: 0o17\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "numeric literal '0o17' is not supported",
  });
});

test('block: a leading-zero decimal integer is refused rather than silently demoted to a string', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nn: 007\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "numeric literal '007' cannot be represented exactly",
  });
});

test('block: an integer beyond safe precision is refused rather than silently truncated', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nn: 123456789012345678901234567890\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'cannot be represented exactly',
  });
});

test('block: an unsupported double-quoted escape sequence is refused, not silently stripped of its backslash', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nfield: "a\\x41b"\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "unsupported escape sequence '\\x'",
  });
});

test('block: an unsupported unicode escape sequence is refused, not silently stripped of its backslash', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\nfield: "a\\u0041b"\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: "unsupported escape sequence '\\u'",
  });
});

test('block: an unterminated flow sequence is refused rather than silently absorbing the next line', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\ntags: [a, b\nother: value\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'flow sequence must open and close on the same line',
  });
});

test('block: a trailing comma in a flow sequence is refused rather than silently producing a null entry', (t) => {
  blocksWith(t, {
    given: '---\ntype: Note\ntags: [a, b,]\n---\n# Note\n',
    code: 'FRONTMATTER_UNPARSEABLE',
    reasonIncludes: 'flow sequence item is empty',
  });
});
