/*
 * #159: `migration-plan` link rewriting must preserve a `#fragment` through the
 * rewrite, and must treat a bare sibling filename exactly like a `./`-prefixed one.
 * Same wrapper seam and fixture shape as #145's own test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-159-repo-');
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

test('a rewritten link keeps its #fragment, in both bare and angle-bracket target syntax', (t) => {
  const root = repo(t);
  write(root, 'docs/adr/0001-first.md', [
    '---', 'type: Decision', '---', '# First', '',
    'See [a section](./0002-second.md#acceptance-evidence) and [angled](<0002-second.md#other>).', '',
  ].join('\n'));
  write(root, 'docs/adr/0002-second.md', '---\ntype: Decision\n---\n# Second\n\nBody.\n');

  const body = mappingFor(planned(root), 'docs/adr/0001-first.md').body;
  assert.ok(body.includes('[a section](0002-second.md#acceptance-evidence)'), body);
  assert.ok(body.includes('[angled](<0002-second.md#other>)'), body);
});

test('a rewritten link keeps a #fragment even when the concept path moves the target to another directory', (t) => {
  const root = repo(t);
  write(root, 'docs/adr/0001-first.md', [
    '---', 'type: Decision', '---', '# First', '',
    'See [the constraint](../spec/limits.md#acceptance-evidence).', '',
  ].join('\n'));
  write(root, 'docs/spec/limits.md', '---\ntype: Constraint\n---\n# Limits\n\nBody.\n');

  const body = mappingFor(planned(root), 'docs/adr/0001-first.md').body;
  assert.ok(body.includes('[the constraint](../constraints/limits.md#acceptance-evidence)'), body);
});

test('a bare sibling filename is rewritten exactly like a ./-prefixed one', (t) => {
  const root = repo(t);
  write(root, 'docs/research/deep/skills.md', [
    '---', 'type: Research', '---', '# Skills', '',
    'Bare [one](symlinks.md), dotted [two](./symlinks.md).', '',
  ].join('\n'));
  write(root, 'docs/research/deep/symlinks.md', '---\ntype: Research\n---\n# Symlinks\n\nBody.\n');

  const response = planned(root);
  assert.equal(response.data.plan.entries.find((i) => i.path === 'docs/research/deep/symlinks.md').concept, 'research/symlinks');
  const body = mappingFor(response, 'docs/research/deep/skills.md').body;
  assert.ok(body.includes('Bare [one](symlinks.md), dotted [two](symlinks.md).'), body);
});

test('a bare sibling filename whose target lands in another type directory is rewritten, not left as a source filename', (t) => {
  const root = repo(t);
  write(root, 'docs/research/deep/skills.md', [
    '---', 'type: Research', '---', '# Skills', '',
    'Bare [one](rules.md), dotted [two](./rules.md).', '',
  ].join('\n'));
  write(root, 'docs/research/deep/rules.md', '---\ntype: Constraint\n---\n# Rules\n\nBody.\n');

  const body = mappingFor(planned(root), 'docs/research/deep/skills.md').body;
  assert.ok(body.includes('Bare [one](../constraints/rules.md), dotted [two](../constraints/rules.md).'), body);
});
