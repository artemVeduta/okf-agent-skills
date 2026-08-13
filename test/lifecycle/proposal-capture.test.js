// Domain: lifecycle. Covers the documented assisted durable capture and folder-local
// maintenance rules in okf-lifecycle. Document shape only: no fixture here claims that a
// human waited, accepted, or declined at runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const document = fs.readFileSync(path.join(repo, 'skills', 'okf-lifecycle', 'SKILL.md'), 'utf8');

function section(heading) {
  const start = document.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = document.indexOf('\n## ', start + 1);
  return document.slice(start, rest === -1 ? document.length : rest);
}

function states(text, patterns, label) {
  for (const pattern of patterns) assert.match(text, pattern, `${label}: ${pattern}`);
}

test.describe('assisted durable capture is documented', () => { // #199
  test('both sections exist, in order, before the procedure', () => {
    const capture = document.indexOf('\n## Assisted durable capture\n');
    const folder = document.indexOf('\n## Folder-local maintenance\n');
    const procedure = document.indexOf('\n## Procedure\n');
    assert.ok(capture > 0 && capture < folder, 'capture section comes first');
    assert.ok(folder < procedure, 'both sections come before the procedure');
  });

  test('the observed durable concept types are named', () => {
    const text = section('Assisted durable capture');
    for (const type of ['Decision', 'Glossary', 'Constraint', 'Research', 'Playbook']) {
      assert.match(text, new RegExp(`\`${type}\``), `observed type: ${type}`);
    }
    assert.match(text, /open domain-specific concept types/);
  });

  test('the proposal, skip, declined, and assisted-decision rules are stated', () => {
    states(section('Assisted durable capture'), [
      /presents \*\*one\*\* compact proposal/,
      /natural checkpoint, or before the final response/,
      /asks immediately only when missing meaning blocks the current work/,
      /skips a temporary fact, a detail the code already gives, a duplicate, and a weak guess/,
      /declined item is not proposed again in the same task, unless new evidence/,
      /assisted user decision\*\*: help is never acceptance/,
      /No mutation is automatic/,
      /each accepted item becomes one ordinary `okf-write` call/,
    ], 'capture rules');
  });

  test('the word target resolves from the workspace file and stays a soft target', () => {
    states(section('Assisted durable capture'), [
      /resolves the effective `settings\.max_words_per_file` from\s+`\.okf-workspace\.json` over the built-in default/,
      /exact semantic split, or an explicit keep-as-one decision/,
      /target is a soft target/,
      /never warns on a read, and it is never a validation gate/,
    ], 'word target');
  });

  test('the folder-local rules are stated', () => {
    states(section('Folder-local maintenance'), [
      /names exactly one bounded reader-purpose group/,
      /No substantive concept and no glossary sits directly at the bundle root/,
      /root holds only `index\.md` and the optional `log\.md`/,
      /exact index, glossary, local-guidance, and optional local-log change[\s\S]*?explicit no-change disposition/,
      /explicit no-local-terms result/,
      /reads the local glossary and the glossaries that glossary links to/,
      /never changes a term without acceptance/,
      /new group is proposed as one complete package/,
      /no empty glossary, no empty guidance, and no other folder-template scaffolding/,
      /defect in a touched group joins that proposal/,
      /untouched group is reported and offered as a separate restructuring proposal/,
      /names every applied effect, every failed effect, and every skipped effect/,
      /partial result marks the touched group as a group that needs repair/,
      /no automatic retry, no rollback, no checkpoint, and no resume/,
    ], 'folder-local rules');
  });

  test('the procedure keeps the done-when form for the new steps', () => {
    const steps = section('Procedure').split('\n').filter((line) => /^\d+\. /.test(line));
    assert.ok(steps.length >= 13, 'the new steps are present');
    for (const step of steps) {
      assert.match(step, /\bdone (when|only with) /i, `step states done when: ${step.slice(0, 40)}`);
      assert.match(step, /; not done (if|while) /, `step states not done: ${step.slice(0, 40)}`);
    }
  });

  test('the document adds no new contract seam', () => {
    const operations = document.match(/"operation": "([^"]+)"/g) || [];
    assert.deepEqual([...new Set(operations)], ['"operation": "sync"']);
    for (const forbidden of [/proposal token/i, /batch[- ]write/i]) {
      assert.doesNotMatch(document, forbidden, `no new seam: ${forbidden}`);
    }
  });
});
