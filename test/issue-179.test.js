/*
 * #179 (#158): `Glossary` has no content rule.
 *
 * `migration-plan` used to infer `Glossary` from two or more
 * `**Label**: value` lines. That read ordinary emphasis-labelled prose as a term
 * list: a research report using `**Source**:`, `**Implication**:`,
 * `**Prerequisites**:` and `**Dependencies**:` matched on its metadata labels
 * alone. Because a `migrate`-disposition entry carries no open question,
 * `payload.answers` could not correct the wrong type, and every glossary-typed
 * source accepted into one group maps to that group's single `glossary`, so a
 * whole directory of reports collapsed onto one concept path.
 *
 * `Glossary` is now exact structural evidence only -- a `glossary` path segment,
 * `glossary.md`, or `CONTEXT.md` -- with an explicit source `type` still
 * authoritative above it, and the batched `type` question below it. Nothing
 * replaced the removed rule: no semantic test, no dominance ratio, no percentage
 * threshold.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-179-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
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

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function discoverSources(root) {
  return run({ protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } }).data.sources;
}

function entryFor(response, sourcePath) {
  return response.data.plan.entries.find((item) => item.path === sourcePath);
}

function planGrouped(root, sources, placement) {
  return planWithGroups(run, (payload) => planRequest(root, sources, payload), { root, placement }).response;
}

// The exact label shapes 33be98d found in this repository's own research
// reports. None of them is a term definition.
const RESEARCH_REPORT = [
  '# Durable context platforms',
  '',
  '**Source**: the vendor documentation, read 2026-08-01.',
  '',
  '**Prerequisites**: none beyond a bundle root.',
  '',
  '**Dependencies**: the manifest grammar.',
  '',
  '**Implication**: the adapter has to resolve the manifest upward.',
  '',
].join('\n');

// --------------------------------------------- research metadata labels are not terms

test('a research report using emphasis-labelled metadata keeps its Research type: bold-colon lines are no longer Glossary evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/research/durable-context.md', RESEARCH_REPORT);
  const sources = discoverSources(root);
  const response = planGrouped(root, sources, { 'docs/research/durable-context.md': 'research' });

  assert.deepEqual(entryFor(response, 'docs/research/durable-context.md'), {
    path: 'docs/research/durable-context.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'research/durable-context', type: 'Research',
  });
});

test('two label-heavy research reports in one accepted group keep their own concept identities and no longer collapse onto that group\'s single glossary', (t) => {
  const root = repo(t);
  write(root, 'docs/research/alpha.md', RESEARCH_REPORT);
  write(root, 'docs/research/beta.md', RESEARCH_REPORT);
  const sources = discoverSources(root);
  const response = planGrouped(root, sources, {
    'docs/research/alpha.md': 'research',
    'docs/research/beta.md': 'research',
  });

  assert.equal(entryFor(response, 'docs/research/alpha.md').concept, 'research/alpha');
  assert.equal(entryFor(response, 'docs/research/beta.md').concept, 'research/beta');
  for (const source of ['docs/research/alpha.md', 'docs/research/beta.md']) {
    assert.equal(entryFor(response, source).type, 'Research');
    assert.equal(entryFor(response, source).disposition, 'migrate');
  }
});

// ------------------------------------------- exact structural evidence still decides

test('Glossary: a conventional "glossary" path segment is still deterministic evidence, and decides the type on the path alone', (t) => {
  const root = repo(t);
  write(root, 'docs/glossary/terms.md', '# Terms\n\nOrdinary prose with no bold-colon line at all.\n');
  const sources = discoverSources(root);
  const response = planGrouped(root, sources, { 'docs/glossary/terms.md': 'billing' });

  assert.deepEqual(entryFor(response, 'docs/glossary/terms.md'), {
    path: 'docs/glossary/terms.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'billing/glossary', type: 'Glossary',
  });
});

test('Glossary: the CONTEXT.md filename is still deterministic evidence even when the body carries no term line', (t) => {
  const root = repo(t);
  write(root, 'billing/CONTEXT.md', '# Billing context\n\nProse only.\n');
  const sources = discoverSources(root);
  const response = planGrouped(root, sources, { 'billing/CONTEXT.md': 'billing' });

  assert.equal(entryFor(response, 'billing/CONTEXT.md').type, 'Glossary');
  assert.equal(entryFor(response, 'billing/CONTEXT.md').reason, 'type_inferred');
});

// ----------------------------- an unmatched term-definition document asks, never guesses

test('a genuine term-definition document outside every exact structural rule asks the batched type question instead of being inferred Glossary', (t) => {
  const root = repo(t);
  write(root, 'docs/terms.md', '# Terms\n\n**Widget**: a thing we sell.\n\n**Gadget**: another thing we sell.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const entry = entryFor(response, 'docs/terms.md');
  assert.equal(entry.disposition, 'blocked_pending_decision');
  assert.equal(entry.reason, 'type_not_inferable');
  assert.equal(entry.type, null);
  assert.equal(entry.concept, null);

  const question = response.data.questions.find((item) => item.path === 'docs/terms.md');
  assert.equal(question.kind, 'type');
  assert.equal(question.options, null);
});

test('answering that question with Glossary is the sanctioned path to the type, and it is recorded as approved rather than inferred', (t) => {
  const root = repo(t);
  write(root, 'docs/terms.md', '# Terms\n\n**Widget**: a thing we sell.\n\n**Gadget**: another thing we sell.\n');
  const sources = discoverSources(root);
  const response = planWithGroups(run, (payload) => planRequest(root, sources, payload), {
    root,
    placement: { 'docs/terms.md': 'billing' },
    answers: { 'docs/terms.md': { type: 'Glossary' } },
  }).response;

  assert.deepEqual(entryFor(response, 'docs/terms.md'), {
    path: 'docs/terms.md', disposition: 'migrate', reason: 'type_approved',
    concept: 'billing/glossary', type: 'Glossary',
  });
});

// ------------------------------------------------- an explicit type still wins outright

test('an explicit source type is authoritative over the bold-colon shape and is preserved verbatim', (t) => {
  const root = repo(t);
  write(root, 'docs/notes/labels.md', `---\ntype: Research\n---\n${RESEARCH_REPORT}`);
  const sources = discoverSources(root);
  const response = planGrouped(root, sources, { 'docs/notes/labels.md': 'research' });

  assert.deepEqual(entryFor(response, 'docs/notes/labels.md'), {
    path: 'docs/notes/labels.md', disposition: 'migrate', reason: 'type_preserved',
    concept: 'research/labels', type: 'Research',
  });
});

// --------------------------------------------------------- no replacement heuristic

test('no replacement heuristic was added: a term-shaped document is not rescued by term-line count, ratio, or body dominance', (t) => {
  const root = repo(t);
  const many = ['# Terms', ''];
  for (let index = 0; index < 40; index += 1) many.push(`**Term${index}**: definition ${index}.`, '');
  write(root, 'docs/dense-terms.md', many.join('\n'));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const entry = entryFor(response, 'docs/dense-terms.md');
  assert.equal(entry.reason, 'type_not_inferable');
  assert.equal(entry.type, null);
});
