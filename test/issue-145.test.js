const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// Same fixture shape as #144's own test/issue-144.test.js: `migration-plan` needs
// an active bundle (it checks a candidate target path for a collision).
function repo(t, { active = true } = {}) {
  const root = temporaryRoot(t, 'okf-145-repo-');
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

function mappingFor(response, sourcePath) {
  return response.data.mapping.find((item) => item.path === sourcePath);
}

function referenceFor(response, sourcePath) {
  return response.data.references.find((item) => item.path === sourcePath);
}

// -------------------------------------------------- deterministic type mapping

test('Decision: a conventional directory name is deterministic evidence, with no explicit type', (t) => {
  const root = repo(t);
  write(root, 'docs/adr/0001-use-queue.md', '# Use a queue\n\nNo frontmatter at all.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/adr/0001-use-queue.md'), {
    path: 'docs/adr/0001-use-queue.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'decisions/0001-use-queue', type: 'Decision',
  });
});

test('Decision: a conventional ADR filename is deterministic evidence outside a conventional directory', (t) => {
  const root = repo(t);
  write(root, 'random/ADR-0007-cache.md', '# Cache invalidation\n\nNo frontmatter.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'random/ADR-0007-cache.md'), {
    path: 'random/ADR-0007-cache.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'decisions/ADR-0007-cache', type: 'Decision',
  });
});

test('Decision: a structural ADR-template match (Status/Context/Decision/Consequences headings) is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'notes/design-review.md', [
    '# Status',
    '',
    'Accepted',
    '',
    '# Context',
    '',
    'We needed a caching layer.',
    '',
    '# Decision',
    '',
    'We chose an in-memory cache.',
    '',
    '# Consequences',
    '',
    'Follow-up work is tracked separately.',
    '',
  ].join('\n'));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'notes/design-review.md'), {
    path: 'notes/design-review.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'decisions/design-review', type: 'Decision',
  });
});

test('Glossary: the domain-modeling CONTEXT.md filename convention is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'billing/CONTEXT.md', '**Invoice**: a billable record.\n\n**Ledger**: the record of transactions.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'billing/CONTEXT.md'), {
    path: 'billing/CONTEXT.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'billing/glossary', type: 'Glossary',
  });
});

test('Glossary: two or more "**Term**: definition" lines is a structural-template match', (t) => {
  const root = repo(t);
  write(root, 'docs/terms.md', '# Terms\n\n**Widget**: a thing we sell.\n\n**Gadget**: another thing we sell.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/terms.md'), {
    path: 'docs/terms.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'docs/glossary', type: 'Glossary',
  });
});

test('Constraint: a conventional directory name is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/constraints/rate-limit.md', '# Rate limit\n\nNo more than 10 requests/second.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/constraints/rate-limit.md'), {
    path: 'docs/constraints/rate-limit.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'constraints/rate-limit', type: 'Constraint',
  });
});

test('Research: a conventional directory name is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/research/spike.md', '# Spike\n\nInvestigated caching strategies.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/research/spike.md'), {
    path: 'docs/research/spike.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'research/spike', type: 'Research',
  });
});

test('Playbook: a conventional directory name is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'ops/playbooks/deploy.md', '# Deploy\n\n1. Build.\n2. Ship.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'ops/playbooks/deploy.md'), {
    path: 'ops/playbooks/deploy.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'playbooks/deploy', type: 'Playbook',
  });
});

test('Release: a conventional directory name and a conventional semver filename are both deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/releases/notes.md', '# Release notes\n\nBug fixes.\n');
  write(root, 'random/v2.0.0.md', '# v2.0.0\n\nBug fixes.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/releases/notes.md'), {
    path: 'docs/releases/notes.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'releases/notes', type: 'Release',
  });
  assert.deepEqual(entryFor(response, 'random/v2.0.0.md'), {
    path: 'random/v2.0.0.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'releases/v2.0.0', type: 'Release',
  });
});

test('Reference: a conventional directory name is deterministic evidence', (t) => {
  const root = repo(t);
  write(root, 'docs/references/external-spec.md', '# External spec\n\nSee the linked resource.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/references/external-spec.md'), {
    path: 'docs/references/external-spec.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'references/external-spec', type: 'Reference',
  });
});

test('Attested Computation: an explicit "runtime" field is structural frontmatter evidence, and it has no canonical directory so the concept path stays the mechanical mirror', (t) => {
  const root = repo(t);
  write(root, 'docs/misc/pipeline.md', '---\nruntime:\n  executor: ci\n  attester: signed\n---\n# Pipeline result\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/misc/pipeline.md'), {
    path: 'docs/misc/pipeline.md', disposition: 'migrate', reason: 'type_inferred',
    concept: 'docs/misc/pipeline', type: 'Attested Computation',
  });
});

test('a source with no deterministic evidence at all is never guessed into a type and never becomes a generic Note -- it becomes a question', (t) => {
  const root = repo(t);
  write(root, 'docs/misc/ramblings.md', '# Ramblings\n\nJust prose, nothing conventional here.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const entry = entryFor(response, 'docs/misc/ramblings.md');
  assert.equal(entry.disposition, 'blocked_pending_decision');
  assert.equal(entry.reason, 'type_not_inferable');
  assert.equal(entry.type, null);
  assert.notEqual(entry.type, 'Note');
  const q = response.data.questions.find((item) => item.path === 'docs/misc/ramblings.md');
  assert.equal(q.kind, 'type');
});

// ------------------------------------------------- explicit type always wins

test('an explicit type is preserved verbatim, including a domain-specific one no core rule names, and keeps the mechanical mirror when its type has no canonical directory', (t) => {
  const root = repo(t);
  write(root, 'docs/misc/req.md', '---\ntype: Requirement\n---\n# Must support SSO\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/misc/req.md'), {
    path: 'docs/misc/req.md', disposition: 'migrate', reason: 'type_preserved',
    concept: 'docs/misc/req', type: 'Requirement',
  });
});

test('an explicit type wins even when the path also carries deterministic evidence for a different type', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/status.md', '---\ntype: Research\n---\n# Investigating the decision backlog\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'docs/decisions/status.md'), {
    path: 'docs/decisions/status.md', disposition: 'migrate', reason: 'type_preserved',
    concept: 'research/status', type: 'Research',
  });
});

// --------------------------------------------------------------- provenance

test('explicit structured provenance is preserved verbatim in data.mapping', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/funding.md', [
    '---',
    'type: Decision',
    'sources:',
    '  - resource: "https://example.test/policy"',
    '    id: policy',
    '---',
    '# Funding approach',
    '',
    'Body text.',
    '',
  ].join('\n'));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const mapped = mappingFor(response, 'docs/decisions/funding.md');
  assert.deepEqual(mapped.sources, [{ resource: 'https://example.test/policy', id: 'policy' }]);
});

test('absent provenance stays absent: no fabricated sources, generated, verified, or actor field ever appears', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/no-provenance.md', '---\ntype: Decision\n---\n# No provenance\n\nBody text.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const mapped = mappingFor(response, 'docs/decisions/no-provenance.md');
  assert.equal(mapped.sources, null);
  assert.deepEqual(Object.keys(mapped).sort(), ['body', 'concept', 'path', 'sources', 'type'].sort());
  for (const forbidden of ['generated', 'verified', 'author', 'confirmed']) {
    assert.equal(Object.hasOwn(mapped, forbidden), false, forbidden);
  }
});

// ------------------------------------------------------------- link rewriting

test('an unambiguous internal link is rewritten to the target concept path, and left alone inside fenced code and inline code', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/adr1.md', [
    '---',
    'type: Decision',
    '---',
    '# First decision',
    '',
    'See [the other decision](./adr2.md) for background.',
    '',
    'Also inline, must stay untouched: `[fake](./not-real.md)`.',
    '',
    '```md',
    '[fenced](./also-not-real.md)',
    '```',
    '',
  ].join('\n'));
  write(root, 'docs/decisions/adr2.md', '---\ntype: Decision\n---\n# Second decision\n\nBody.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.equal(entryFor(response, 'docs/decisions/adr1.md').concept, 'decisions/adr1');
  assert.equal(entryFor(response, 'docs/decisions/adr2.md').concept, 'decisions/adr2');

  const mapped = mappingFor(response, 'docs/decisions/adr1.md');
  assert.ok(mapped.body.includes('[the other decision](adr2.md)'), mapped.body);
  assert.ok(!mapped.body.includes('./adr2.md'), mapped.body);
  assert.ok(mapped.body.includes('`[fake](./not-real.md)`'), mapped.body);
  assert.ok(mapped.body.includes('[fenced](./also-not-real.md)'), mapped.body);
});

test('a link to a target outside this migration is left exactly as written', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/lonely.md', '---\ntype: Decision\n---\n# Lonely decision\n\nSee [elsewhere](../missing.md) and [the web](https://example.test/).\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const mapped = mappingFor(response, 'docs/decisions/lonely.md');
  assert.ok(mapped.body.includes('[elsewhere](../missing.md)'), mapped.body);
  assert.ok(mapped.body.includes('[the web](https://example.test/)'), mapped.body);
});

// ------------------------------------------------------------------- residue

test('an unsupported source is retained as residue, never silently dropped, and gets a deterministic references/ path', (t) => {
  const root = repo(t);
  write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(entryFor(response, 'notes/wiki.md'), {
    path: 'notes/wiki.md', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null,
  });
  assert.deepEqual(referenceFor(response, 'notes/wiki.md'), {
    path: 'notes/wiki.md', reference_path: 'references/notes/wiki.md',
  });
});

// ------------------------------------------------------------------ duplicates

test('an exact content duplicate among migrating sources is surfaced as a candidate, never silently merged', (t) => {
  const root = repo(t);
  const identical = '---\ntype: Decision\n---\n# Use Postgres\n\nSame reasoning, copied twice.\n';
  write(root, 'docs/decisions/first.md', identical);
  write(root, 'docs/decisions/second.md', identical);
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  // Both still migrate, to two distinct concepts -- never merged into one.
  assert.equal(entryFor(response, 'docs/decisions/first.md').disposition, 'migrate');
  assert.equal(entryFor(response, 'docs/decisions/second.md').disposition, 'migrate');
  assert.equal(entryFor(response, 'docs/decisions/first.md').concept, 'decisions/first');
  assert.equal(entryFor(response, 'docs/decisions/second.md').concept, 'decisions/second');
  assert.equal(response.data.plan.executable, true);

  assert.deepEqual(response.data.plan.duplicates, [{ paths: ['docs/decisions/first.md', 'docs/decisions/second.md'] }]);
  assert.ok(response.findings.some((f) => (
    f.code === 'plan_duplicate_candidate' && f.severity === 'warning' && f.blocks === false &&
    JSON.stringify(f.detail.paths) === JSON.stringify(['docs/decisions/first.md', 'docs/decisions/second.md'])
  )), JSON.stringify(response.findings));
});

test('two sources with different content are never reported as duplicates', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/one.md', '---\ntype: Decision\n---\n# One\n');
  write(root, 'docs/decisions/two.md', '---\ntype: Decision\n---\n# Two\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(response.data.plan.duplicates, []);
});
