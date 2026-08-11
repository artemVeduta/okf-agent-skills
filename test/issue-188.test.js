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
const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-188-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
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

function planned(root) {
  const sources = discoverSources(root);
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources } });
}

function mappingFor(response, sourcePath) {
  return response.data.mapping.find((item) => item.path === sourcePath);
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

  const body = mappingFor(planned(root), 'docs/notes.md').body;
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

  const body = mappingFor(planned(root), 'docs/adr/sub/0001-foo.md').body;
  assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
});

test('a root-relative link target is resolved against the repository root, not the source\'s own directory', (t) => {
  const root = repo(t);
  write(root, 'docs/research/notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [the eval setup](/eval/README.md).', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root), 'docs/research/notes.md').body;
  assert.ok(body.includes('[the eval setup](../../eval/README.md)'), body);
});

test('a link to a migrated target still rewrites to that target\'s concept path', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [the comparison](other.md).', '',
  ].join('\n'));
  write(root, 'other.md', '---\ntype: Research\n---\n# Other\n\nBody.\n');

  const body = mappingFor(planned(root), 'notes.md').body;
  assert.ok(body.includes('[the comparison](other.md)'), body);
});

test('a link whose target is not part of this migration at all is still re-expressed from the concept\'s new directory', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    'See [nothing here](missing/nowhere.md).', '',
  ].join('\n'));

  const body = mappingFor(planned(root), 'notes.md').body;
  assert.ok(body.includes('[nothing here](../../missing/nowhere.md)'), body);
});

test('a link inside a fenced code block is left untouched even when the concept moves directories', (t) => {
  const root = repo(t);
  write(root, 'notes.md', [
    '---', 'type: Research', '---', '# Notes', '',
    '```', 'See [the eval setup](eval/README.md).', '```', '',
  ].join('\n'));
  write(root, 'eval/README.md', '# Eval\n');

  const body = mappingFor(planned(root), 'notes.md').body;
  assert.ok(body.includes('```\nSee [the eval setup](eval/README.md).\n```'), body);
});
