const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// Same fixture shape as #145's own test/issue-145.test.js: `migration-plan`
// needs an active bundle (it checks a candidate target path for a collision).
function repo(t, { active = true } = {}) {
  const root = temporaryRoot(t, 'okf-179-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  if (active) fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function discoverRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } };
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function discoverSources(root, payload = {}) {
  return run(discoverRequest(root, payload)).data.sources;
}

function entryFor(response, sourcePath) {
  return response.data.plan.entries.find((item) => item.path === sourcePath);
}

// #179: the content heuristic (two or more `**Label**: value` lines) misfires
// on research metadata blocks -- removed. Only the three exact structural
// signals remain: a `glossary` directory segment, a `glossary.md` filename,
// or `CONTEXT.md`.

test('a research-metadata document with two or more "**Label**: value" lines no longer infers Glossary', (t) => {
  const root = repo(t);
  write(root, 'docs/research/spike.md', [
    '# Spike',
    '',
    '**Author**: Jordan',
    '',
    '**Date**: 2026-01-05',
    '',
    'Investigated caching strategies.',
    '',
  ].join('\n'));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  // `research` directory segment is still exact structural evidence -- for
  // `Research`, never `Glossary`.
  assert.deepEqual(entryFor(response, 'docs/research/spike.md'), {
    path: 'docs/research/spike.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'spike', type: 'Research',
  });
});

test('Glossary: a "glossary" directory segment is still exact structural evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/glossary/terms.md', '# Terms\n\n**Widget**: a thing we sell.\n\n**Gadget**: another thing we sell.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/glossary/terms.md'), {
    path: 'docs/glossary/terms.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'glossary', type: 'Glossary',
  });
});

test('Glossary: a "glossary.md" filename is still exact structural evidence', (t) => {
  const root = repo(t);
  write(root, 'billing/glossary.md', '**Invoice**: a billable record.\n\n**Ledger**: the record of transactions.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'billing/glossary.md'), {
    path: 'billing/glossary.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'glossary', type: 'Glossary',
  });
});

test('Glossary: a "CONTEXT.md" filename is still exact structural evidence', (t) => {
  const root = repo(t);
  write(root, 'billing/CONTEXT.md', '**Invoice**: a billable record.\n\n**Ledger**: the record of transactions.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'billing/CONTEXT.md'), {
    path: 'billing/CONTEXT.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'glossary', type: 'Glossary',
  });
});

test('a term-definition document outside any structural signal reaches the batched "type" question, never a guess', (t) => {
  const root = repo(t);
  write(root, 'docs/terms.md', '# Terms\n\n**Widget**: a thing we sell.\n\n**Gadget**: another thing we sell.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const entry = entryFor(response, 'docs/terms.md');
  assert.equal(entry.disposition, 'blocked_pending_decision');
  assert.equal(entry.reason, 'type_not_inferable');
  assert.equal(entry.type, null);

  const q = response.data.questions.find((item) => item.path === 'docs/terms.md');
  assert.equal(q.kind, 'type');
  assert.equal(q.options, null);
});
