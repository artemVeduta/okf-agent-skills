/*
 * #188: `migration-plan` link rewriting keyed the target path only on whether it
 * collapsed inside the bundle, ignoring the change of directory depth between a
 * source's own directory and its concept's directory. A link whose target was not
 * itself migrated (stays at its original project path) was returned untouched,
 * which is only correct when the source and the concept sit at the same depth.
 * Same wrapper seam and fixture shape as #145/#159's own tests.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-188-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  // #203: an accepted root package's default `index` disposition is
  // `unchanged`, which claims `okf/index.md` already exists -- so every
  // fixture needs one, exactly like `test/issue-203.test.js`'s own `repo()`.
  fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
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

// #203: every source below needs its own accepted reader-purpose group before
// it can migrate -- `placement` names it the same way `test-support/groups.js`
// expects, `{ '<source path>': '<accepted group key>' }`. `sources`, when
// supplied, overrides the discovered set (test 6 hand-builds extra entries).
function planned(root, placement, sources) {
  const request = (payload) => planRequest(root, sources || discoverSources(root), payload);
  return planWithGroups(run, request, { root, placement }).response;
}

function mappingFor(response, sourcePath) {
  return response.data.mapping.find((item) => item.path === sourcePath);
}

function unresolvedLinkFindings(response) {
  return response.findings.filter((f) => f.code === 'plan_link_unresolved');
}

test('a link to an unmigrated target is re-expressed from the concept\'s new (deeper) directory', (t) => {
  const root = repo(t);
  // Source sits one level below the repo root ("docs/"); its concept
  // ("research/notes") sits under the bundle at "okf/research/", two levels
  // deep. This is the exact evidence case #188 cites.
  write(root, 'docs/notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [the eval setup](../eval/README.md).', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root, { 'docs/notes.md': 'research' }), 'docs/notes.md').body;
  assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
});

test('a link to an unmigrated target is re-expressed from the concept\'s new (shallower) directory', (t) => {
  const root = repo(t);
  // Source sits three levels below the repo root; its concept ("decisions/foo")
  // sits under the bundle at "okf/decisions/", only two levels deep.
  write(root, 'docs/adr/sub/0001-foo.md', [
    '---', 'type: Decision', '---', '# Foo', '',
    'See [the eval setup](../../../eval/README.md).', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root, { 'docs/adr/sub/0001-foo.md': 'decisions' }), 'docs/adr/sub/0001-foo.md').body;
  assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
});

test('a root-relative link target is resolved against the repository root, not the source\'s own directory', (t) => {
  const root = repo(t);
  write(root, 'docs/research/notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [the eval setup](/eval/README.md).', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root, { 'docs/research/notes.md': 'research' }), 'docs/research/notes.md').body;
  assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
});

test('a link to a migrated target still rewrites to that target\'s concept path, and is not reported unresolved', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [the comparison](other.md).', '',
  ].join('\n'));
  write(root, 'other.md', '---\ntype: Research\n---\n# Other\n\nBody.\n');

  const response = planned(root, { 'notes.md': 'research', 'other.md': 'research' });
  const body = mappingFor(response, 'notes.md').body;
  assert.ok(body.includes('[the comparison](other.md)'), body);
  assert.deepEqual(unresolvedLinkFindings(response), []);
});

test('a link whose target is not part of this migration at all is still re-expressed from the concept\'s new directory, and reported unresolved as class "unknown" before anything is written', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [nothing here](missing/nowhere.md).', '',
  ].join('\n'));

  const response = planned(root, { 'notes.md': 'research' });
  const body = mappingFor(response, 'notes.md').body;
  assert.ok(body.includes('[nothing here](../../missing/nowhere.md)'), body);
  assert.deepEqual(unresolvedLinkFindings(response), [{
    code: 'plan_link_unresolved',
    origin: 'suite',
    severity: 'warning',
    blocks: false,
    detail: { path: 'notes.md', resource: 'missing/nowhere.md', class: 'unknown' },
  }]);
});

// #188 bullet 4: a link's target can also name a source this same batch already
// classified one way or the other -- its own disposition is the reported class,
// distinguishing "this used to be reachable and this migration decided not to
// bring it in" from "this never existed at all" (the `unknown` class above).
// The target source is never written to disk: `classify` reads a markdown
// source's own file gracefully-empty when it is missing (see `readSource` in
// migration.js), and a non-markdown `sources` entry is never read at all, so a
// hand-built entry exercises this without needing a real file on disk -- the
// same fixture shape discovery.js's own classifiers would have produced.
test('a link to a source this batch chose not to migrate is reported unresolved with that source\'s own disposition as its class', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [an unsupported note](wiki.md) and [an unresolved type](untyped.md).', '',
  ].join('\n'));

  const sources = [
    ...discoverSources(root),
    { path: 'wiki.md', category: 'unsupported', format: 'obsidian', reason: 'obsidian_construct' },
    { path: 'untyped.md', category: 'markdown', format: 'markdown', reason: 'markdown' },
  ];
  const response = planned(root, { 'notes.md': 'research' }, sources);

  const classes = unresolvedLinkFindings(response).map((f) => f.detail).sort((a, b) => (a.path + a.resource).localeCompare(b.path + b.resource));
  assert.deepEqual(classes, [
    { path: 'notes.md', resource: 'untyped.md', class: 'blocked_pending_decision' },
    { path: 'notes.md', resource: 'wiki.md', class: 'residue' },
  ]);
});

test('a link inside a fenced code block is left untouched even when the concept moves directories', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    '```', 'See [the eval setup](eval/README.md).', '```', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root, { 'notes.md': 'research' }), 'notes.md').body;
  assert.ok(body.includes('```\nSee [the eval setup](eval/README.md).\n```'), body);
});
