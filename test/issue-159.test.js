/*
 * #159: `migration-plan` link rewriting must preserve a `#fragment` through the
 * rewrite, and must treat a bare sibling filename exactly like a `./`-prefixed one.
 * Same wrapper seam and fixture shape as #145's own test.
 *
 * Only the two `#fragment` tests pin a fix. The two bare-sibling tests are
 * regression pins, not fix proof: `path.posix.join` already normalized `x.md`
 * and `./x.md` identically, so they pass against the pre-fix rewriter too. The
 * defect the issue reported for a bare sibling had another cause, and these
 * tests hold the behavior that was never broken.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-159-repo-');
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
// expects, `{ '<source path>': '<accepted group key>' }`.
function planned(root, placement) {
  const sources = discoverSources(root);
  const request = (payload) => planRequest(root, sources, payload);
  return planWithGroups(run, request, { root, placement }).response;
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

  const placement = { 'docs/adr/0001-first.md': 'decisions', 'docs/adr/0002-second.md': 'decisions' };
  const body = mappingFor(planned(root, placement), 'docs/adr/0001-first.md').body;
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

  const placement = { 'docs/adr/0001-first.md': 'decisions', 'docs/spec/limits.md': 'constraints' };
  const body = mappingFor(planned(root, placement), 'docs/adr/0001-first.md').body;
  assert.ok(body.includes('[the constraint](../constraints/limits.md#acceptance-evidence)'), body);
});

test('a bare sibling filename is rewritten exactly like a ./-prefixed one', (t) => {
  const root = repo(t);
  write(root, 'docs/research/deep/skills.md', [
    '---', 'type: Research', '---', '# Skills', '',
    'Bare [one](symlinks.md), dotted [two](./symlinks.md).', '',
  ].join('\n'));
  write(root, 'docs/research/deep/symlinks.md', '---\ntype: Research\n---\n# Symlinks\n\nBody.\n');

  const placement = { 'docs/research/deep/skills.md': 'research', 'docs/research/deep/symlinks.md': 'research' };
  const response = planned(root, placement);
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

  const placement = { 'docs/research/deep/skills.md': 'research', 'docs/research/deep/rules.md': 'constraints' };
  const body = mappingFor(planned(root, placement), 'docs/research/deep/skills.md').body;
  assert.ok(body.includes('Bare [one](../constraints/rules.md), dotted [two](../constraints/rules.md).'), body);
});
