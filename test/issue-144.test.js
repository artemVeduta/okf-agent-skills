const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');

// `migration-plan` needs an active bundle, exactly like `discover` (#142): it checks
// the bundle for a target-path collision, so it is not bypass-gated.
function repo(t, { active = true } = {}) {
  const root = temporaryRoot(t, 'okf-144-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  if (active) fs.writeFileSync(path.join(root, '.okf-active'), '');
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

function discoverRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } };
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function discoverSources(root, payload = {}) {
  return run(discoverRequest(root, payload)).data.sources;
}

function entryFor(response, sourcePath) {
  return response.data.plan.entries.find((item) => item.path === sourcePath);
}

function questionFor(response, sourcePath) {
  return response.data.questions.find((item) => item.path === sourcePath);
}

// ---------------------------------------------------- deterministic, no questions

test('derives a fully determined, executable plan from a discovery inventory needing no questions', (t) => {
  const root = repo(t);
  write(root, 'data/config.json', '{"key":"value"}\n');
  write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n');
  write(root, 'docs/decisions/use-postgres.md', '---\ntype: Decision\ntitle: Use Postgres\n---\n# Use Postgres\n');
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.plan.executable, true);
  assert.deepEqual(response.data.questions, []);
  assert.deepEqual(response.findings, []);
  assert.deepEqual(entryFor(response, 'data/config.json'), {
    path: 'data/config.json', disposition: 'skip', reason: 'not_a_candidate_document_format', concept: null, type: null,
  });
  assert.deepEqual(entryFor(response, 'notes/wiki.md'), {
    path: 'notes/wiki.md', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null,
  });
  // #145: the concept path comes from the type's own canonical directory
  // (`decisions/`), not a mechanical mirror of the source's own directory.
  assert.deepEqual(entryFor(response, 'docs/decisions/use-postgres.md'), {
    path: 'docs/decisions/use-postgres.md', disposition: 'migrate', reason: 'type_preserved',
    concept: 'decisions/use-postgres', type: 'Decision',
  });
});

test('the one-source-one-concept default holds: every source produces exactly one plan entry, never more', (t) => {
  const root = repo(t);
  write(root, 'docs/glossary.md', '---\ntype: Glossary\n---\n**Term**: definition.\n\n**Other**: another.\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.equal(response.data.plan.entries.length, sources.length);
  const entry = entryFor(response, 'docs/glossary.md');
  assert.equal(entry.disposition, 'migrate');
  assert.equal(entry.concept, 'docs/glossary');
});

// -------------------------------------------------- questions, only where needed

test('a question is derived only for a genuinely undecidable source, never for a deterministic one', (t) => {
  const root = repo(t);
  write(root, 'data/config.json', '{"key":"value"}\n'); // other -> deterministic skip
  write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n'); // unsupported -> deterministic residue
  write(root, 'docs/decisions/use-postgres.md', '---\ntype: Decision\n---\n# Use Postgres\n'); // explicit type -> deterministic migrate
  write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n'); // markdown, no type -> question
  fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])); // ambiguous -> question
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources));

  assert.equal(response.data.plan.executable, false);
  const openPaths = response.data.questions.map((q) => q.path).sort();
  assert.deepEqual(openPaths, ['docs/notes.md', 'garbled.md']);

  assert.deepEqual(entryFor(response, 'data/config.json'), {
    path: 'data/config.json', disposition: 'skip', reason: 'not_a_candidate_document_format', concept: null, type: null,
  });
  assert.deepEqual(entryFor(response, 'notes/wiki.md'), {
    path: 'notes/wiki.md', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null,
  });
  assert.equal(entryFor(response, 'docs/decisions/use-postgres.md').disposition, 'migrate');

  const typeQuestion = questionFor(response, 'docs/notes.md');
  assert.equal(typeQuestion.kind, 'type');
  assert.equal(typeQuestion.options, null);
  assert.equal(typeof typeQuestion.prompt, 'string');
  assert.ok(typeQuestion.prompt.length > 0);
  assert.equal(entryFor(response, 'docs/notes.md').disposition, 'blocked_pending_decision');
  assert.equal(entryFor(response, 'docs/notes.md').reason, 'type_not_inferable');

  const ambiguousQuestion = questionFor(response, 'garbled.md');
  assert.equal(ambiguousQuestion.kind, 'discovery_ambiguous');
  assert.deepEqual(ambiguousQuestion.options, ['skip', 'residue']);
  assert.equal(entryFor(response, 'garbled.md').disposition, 'blocked_pending_decision');
  assert.equal(entryFor(response, 'garbled.md').reason, 'not_utf8');

  // Every open question surfaces as a non-blocking, informational finding.
  assert.deepEqual(
    response.findings.map((f) => [f.code, f.severity, f.blocks]).sort(),
    [['plan_question_open', 'warning', false], ['plan_question_open', 'warning', false]],
  );
});

// ------------------------------------------------------------- target collision

test('a target-path collision blocks pending a user decision, offering only "skip"', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/collide.md', '---\ntype: Decision\n---\n# Collide\n');
  // #145: the pre-existing bundle file must sit at the type-directory-mapped
  // concept path (`decisions/collide.md`), not the old mechanical-mirror path,
  // for the collision below to actually occur.
  write(root, 'okf/decisions/collide.md', '---\ntype: Decision\n---\n# Already here\n');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources));

  assert.equal(response.data.plan.executable, false);
  assert.deepEqual(entryFor(response, 'docs/decisions/collide.md'), {
    path: 'docs/decisions/collide.md', disposition: 'blocked_pending_decision', reason: 'target_collision', concept: null, type: null,
  });
  const q = questionFor(response, 'docs/decisions/collide.md');
  assert.equal(q.kind, 'target_collision');
  assert.deepEqual(q.options, ['skip']);
});

// ------------------------------------------------------------- answers applied

test('answers are applied, producing a fully determined and executable plan', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/collide.md', '---\ntype: Decision\n---\n# Collide\n');
  // #145: the pre-existing bundle file must sit at the type-directory-mapped
  // concept path (`decisions/collide.md`), not the old mechanical-mirror path,
  // for the collision below to actually occur.
  write(root, 'okf/decisions/collide.md', '---\ntype: Decision\n---\n# Already here\n');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n');
  fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  const sources = discoverSources(root);

  const answers = {
    'docs/decisions/collide.md': 'skip',
    'docs/notes.md': 'Playbook',
    'garbled.md': 'residue',
  };
  const response = run(planRequest(root, sources, { answers }));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.plan.executable, true);
  assert.deepEqual(response.data.questions, []);
  assert.deepEqual(response.findings, []);
  assert.deepEqual(entryFor(response, 'docs/decisions/collide.md'), {
    path: 'docs/decisions/collide.md', disposition: 'skip', reason: 'target_collision', concept: null, type: null,
  });
  // #145: an approved type also goes through the type-directory mapping.
  assert.deepEqual(entryFor(response, 'docs/notes.md'), {
    path: 'docs/notes.md', disposition: 'migrate', reason: 'type_approved', concept: 'playbooks/notes', type: 'Playbook',
  });
  assert.deepEqual(entryFor(response, 'garbled.md'), {
    path: 'garbled.md', disposition: 'residue', reason: 'not_utf8', concept: null, type: null,
  });
});

test('a partial answer set resolves what it names and leaves the rest open', (t) => {
  const root = repo(t);
  write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n');
  fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources, { answers: { 'docs/notes.md': 'Playbook' } }));

  assert.equal(response.data.plan.executable, false);
  assert.equal(entryFor(response, 'docs/notes.md').disposition, 'migrate');
  assert.equal(entryFor(response, 'garbled.md').disposition, 'blocked_pending_decision');
  assert.deepEqual(response.data.questions.map((q) => q.path), ['garbled.md']);
});

// ------------------------------------------------- unanswered plans are not executable

test('a plan with unanswered questions is structurally not executable', (t) => {
  const root = repo(t);
  write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n');
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources));

  assert.equal(response.data.plan.executable, false);
  assert.ok(response.data.plan.entries.some((entry) => entry.disposition === 'blocked_pending_decision'));
  assert.ok(response.data.questions.length > 0);
});

// -------------------------------------------------- every disposition kind, with reason

test('every disposition kind can be present at once, and each entry always carries a non-empty reason', (t) => {
  const root = repo(t);
  write(root, 'data/config.json', '{"key":"value"}\n'); // -> skip
  write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n'); // -> residue
  write(root, 'docs/decisions/use-postgres.md', '---\ntype: Decision\n---\n# Use Postgres\n'); // -> migrate
  write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n'); // -> blocked_pending_decision
  const sources = discoverSources(root);

  const response = run(planRequest(root, sources));
  const dispositions = new Map(response.data.plan.entries.map((e) => [e.disposition, e]));

  assert.deepEqual(new Set(dispositions.keys()), new Set(['skip', 'residue', 'migrate', 'blocked_pending_decision']));
  for (const entry of response.data.plan.entries) {
    assert.equal(typeof entry.reason, 'string', JSON.stringify(entry));
    assert.ok(entry.reason.length > 0, JSON.stringify(entry));
  }
});

// --------------------------------------------------------------- validation

test('rejects a malformed source item without computing anything', (t) => {
  const root = repo(t);
  const cases = [
    [{ path: 'a.md', category: 'unknown', format: 'markdown', reason: 'x' }],
    [{ path: '', category: 'other', format: 'json', reason: 'x' }],
    [{ path: 'a.md', category: 'markdown', format: 'markdown', reason: '' }],
    [{ path: 'a.md', category: 'ambiguous', format: 'markdown', reason: 'not_utf8' }], // missing required question
    [{ path: 'a.md', category: 'markdown', format: 'markdown', reason: 'utf8_markdown', question: 'stray' }],
  ];
  for (const sources of cases) {
    const response = run(planRequest(root, sources));
    assert.equal(response.result, 'blocked', JSON.stringify(sources));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(sources));
  }
});

test('rejects a malformed payload.answers shape', (t) => {
  const root = repo(t);
  write(root, 'docs/notes.md', '# Notes\n\nJust prose.\n');
  const sources = discoverSources(root);
  for (const answers of [[], 'x', 1, null]) {
    const response = run(planRequest(root, sources, { answers }));
    assert.equal(response.result, 'blocked', JSON.stringify(answers));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(answers));
  }
});

test('rejects an answer that names a question this source set does not have open', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '---\ntype: Decision\n---\n# Use Postgres\n');
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, { answers: { 'docs/decisions/use-postgres.md': 'Decision' } }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});

test('rejects an answer value outside the question\'s own closed options, and an empty type answer', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/collide.md', '---\ntype: Decision\n---\n# Collide\n');
  // #145: the pre-existing bundle file must sit at the type-directory-mapped
  // concept path (`decisions/collide.md`), not the old mechanical-mirror path,
  // for the collision below to actually occur.
  write(root, 'okf/decisions/collide.md', '---\ntype: Decision\n---\n# Already here\n');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  write(root, 'docs/notes.md', '# Notes\n\nJust prose.\n');
  const sources = discoverSources(root);

  const badCollisionAnswer = run(planRequest(root, sources, { answers: { 'docs/decisions/collide.md': 'proceed_anyway' } }));
  assert.equal(badCollisionAnswer.result, 'blocked');
  assert.equal(badCollisionAnswer.data.code, 'UNSUPPORTED_INPUT');

  const emptyType = run(planRequest(root, sources, { answers: { 'docs/notes.md': '   ' } }));
  assert.equal(emptyType.result, 'blocked');
  assert.equal(emptyType.data.code, 'UNSUPPORTED_INPUT');
});

test('rejects a structurally missing or non-array payload.sources at the protocol layer', (t) => {
  const root = repo(t);
  const missing = spawnWrapper(wrapper, { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root } });
  assert.equal(missing.status, 64);
  assert.equal(missing.stdout, '');

  const notArray = spawnWrapper(wrapper, { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources: 'nope' } });
  assert.equal(notArray.status, 64);
  assert.equal(notArray.stdout, '');
});

// --------------------------------------------------------------- activation gate

test('migration-plan reports not-configured entirely outside a Git repository', (t) => {
  const root = temporaryRoot(t, 'okf-144-no-repo-');
  const response = run(planRequest(root, []));
  assert.equal(response.result, 'not-configured');
});

test('migration-plan does not bypass the activation gate: an inactive bundle answers not-configured', (t) => {
  const root = repo(t, { active: false });
  const response = run(planRequest(root, []));
  assert.equal(response.result, 'not-configured');
  assert.equal(response.data.plan, undefined);
});

test('migration-plan reports ACTIVATION_MARKER_INVALID like every other setup operation on a broken marker', (t) => {
  const root = repo(t, { active: false });
  fs.mkdirSync(path.join(root, '.okf-active'));
  const response = run(planRequest(root, []));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'ACTIVATION_MARKER_INVALID');
});

// -------------------------------------------------------- automatic + router

test('automatic invocation of migration-plan is silent, matching every other setup operation\'s automatic behavior', (t) => {
  const root = repo(t);
  const result = spawnWrapper(wrapper, { ...planRequest(root, []), invocation: 'automatic' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('the generic okf router reaches migration-plan too, still behind the activation gate', (t) => {
  const active = repo(t);
  write(active, 'docs/decisions/use-postgres.md', '---\ntype: Decision\n---\n# Use Postgres\n');
  const sources = discoverSources(active);
  const ok = runWrapper(routerWrapper, { ...planRequest(active, sources), skill: 'okf' });
  assert.equal(ok.skill, 'okf');
  assert.equal(ok.result, 'ok');
  assert.equal(ok.data.plan.executable, true);

  const inactive = repo(t, { active: false });
  const notConfigured = runWrapper(routerWrapper, { ...planRequest(inactive, []), skill: 'okf' });
  assert.equal(notConfigured.result, 'not-configured');
});
