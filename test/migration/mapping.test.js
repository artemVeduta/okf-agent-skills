/*
 * Domain: migration -- `migration-plan` derivation.
 *
 * Plan derivation from a discovery inventory, the type evidence and provenance
 * rules that decide each entry, the open questions a genuinely undecidable
 * source raises, and the structural-only `Glossary` evidence rule.
 */

const test = require('node:test');
const { describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot, writeManifest, TEST_WORKSPACE_ID } = require('../../test-support/snapshot');
const { planWithGroups } = require('../../test-support/groups');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf.js');

// `migration-plan` needs an active bundle, exactly like `discover` (#142): it checks
// the bundle for a target-path collision, so it is not bypass-gated.
function repo(t, { active = true } = {}) {
  const root = temporaryRoot(t, 'okf-migration-mapping-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  if (active) {
    writeManifest(root, '.');
    // #203: an accepted root package's default `index` disposition is
    // `unchanged`, which claims `okf/index.md` already exists -- so every
    // active fixture needs one, exactly like the setup-migration group
    // packages' own `repo()`.
    fs.mkdirSync(path.join(root, 'okf'), { recursive: true });
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '# Bundle\n');
  }
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

// #203: `planWithGroups` (test-support/groups.js) needs a request builder that
// takes only the extra payload -- `root`/`sources` are already fixed by the
// time a test reaches for an accepted group.
function planner(root, sources) {
  return (payload) => planRequest(root, sources, payload);
}

// #203: many tests below just need one or more sources placed into their own
// accepted reader-purpose group before they can migrate -- this wraps
// `planWithGroups` for that common shape and returns only the final response.
function planGrouped(root, sources, placement) {
  return planWithGroups(run, planner(root, sources), { root, placement }).response;
}

function entryFor(response, sourcePath) {
  return response.data.plan.entries.find((item) => item.path === sourcePath);
}

function questionFor(response, sourcePath) {
  return response.data.questions.find((item) => item.path === sourcePath);
}

function mappingFor(response, sourcePath) {
  return response.data.mapping.find((item) => item.path === sourcePath);
}

describe('migration-plan derivation, questions and gating', () => { // #144
  // ---------------------------------------------------- deterministic, no questions

  test('derives a fully determined, executable plan from a discovery inventory needing no questions', (t) => {
    const root = repo(t);
    write(root, 'data/config.json', '{"key":"value"}\n');
    write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n');
    write(root, 'docs/decisions/use-postgres.md', '---\ntype: Decision\ntitle: Use Postgres\n---\n# Use Postgres\n');
    const sources = discoverSources(root);

    // #203: a typed source still needs an accepted reader-purpose group before
    // it can migrate -- `decisions` is this call's own accepted answer to that.
    const { response } = planWithGroups(run, planner(root, sources), {
      root, placement: { 'docs/decisions/use-postgres.md': 'decisions' },
    });

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
    // #203: the concept path comes from the accepted reader-purpose group
    // (`decisions`), not a type-directory mapping or a mechanical mirror of the
    // source's own directory.
    assert.deepEqual(entryFor(response, 'docs/decisions/use-postgres.md'), {
      path: 'docs/decisions/use-postgres.md', disposition: 'migrate', reason: 'type_preserved',
      concept: 'decisions/use-postgres', type: 'Decision',
    });
  });

  test('the one-source-one-concept default holds: every source produces exactly one plan entry, never more', (t) => {
    const root = repo(t);
    write(root, 'docs/glossary.md', '---\ntype: Glossary\n---\n**Term**: definition.\n\n**Other**: another.\n');
    const sources = discoverSources(root);
    const { response } = planWithGroups(run, planner(root, sources), {
      root, placement: { 'docs/glossary.md': 'docs' },
    });

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

    // #203: the Decision source above is deterministic evidence, but still
    // needs its accepted group answered before it can migrate.
    const { response } = planWithGroups(run, planner(root, sources), {
      root, placement: { 'docs/decisions/use-postgres.md': 'decisions' },
    });

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
    // #203: the pre-existing bundle file must sit at the accepted-group concept
    // path (`decisions/collide.md`), not a type-directory or mechanical-mirror
    // path, for the collision below to actually occur.
    write(root, 'okf/decisions/collide.md', '---\ntype: Decision\n---\n# Already here\n');
    write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
    const sources = discoverSources(root);

    // #203: the collision check is the last gate a placed concept passes, one
    // round after its accepted group is answered -- so reaching it here first
    // answers `docs/decisions/collide.md` into the accepted `decisions` group.
    const { response } = planWithGroups(run, planner(root, sources), {
      root, placement: { 'docs/decisions/collide.md': 'decisions' },
    });

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
    // #203: the pre-existing bundle file must sit at the accepted-group concept
    // path (`decisions/collide.md`), not a type-directory or mechanical-mirror
    // path, for the collision below to actually occur.
    write(root, 'okf/decisions/collide.md', '---\ntype: Decision\n---\n# Already here\n');
    write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
    write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n');
    fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    const sources = discoverSources(root);

    // #203: each source's own decision is now a chain -- `docs/decisions/collide.md`
    // needs its accepted group before the collision it hits can even be asked
    // about, and `docs/notes.md` needs its accepted group once its answered type
    // is approved -- so every answer names every step its own round opens.
    const { response } = planWithGroups(run, planner(root, sources), {
      root,
      placement: { 'docs/decisions/collide.md': 'decisions', 'docs/notes.md': 'playbooks' },
      answers: {
        'docs/decisions/collide.md': { target_collision: 'skip' },
        'docs/notes.md': 'Playbook',
        'garbled.md': { discovery_ambiguous: 'residue' },
      },
    });

    assert.equal(response.result, 'ok');
    assert.equal(response.data.plan.executable, true);
    assert.deepEqual(response.data.questions, []);
    // `decisions` carries no eventual output -- its only source resolved to
    // `skip` through the collision it was answered into -- so the accepted
    // group this round needed is now genuinely unused. That is real, expected
    // #203 behavior (an answer round cannot know a later collision is coming),
    // not the leftover-open-question noise this assertion originally guarded.
    assert.deepEqual(response.findings.map((f) => f.code), ['GROUP_PACKAGE_UNUSED']);
    assert.deepEqual(entryFor(response, 'docs/decisions/collide.md'), {
      path: 'docs/decisions/collide.md', disposition: 'skip', reason: 'target_collision', concept: null, type: null,
    });
    // #203: an approved type also goes through the accepted-group mapping.
    assert.deepEqual(entryFor(response, 'docs/notes.md'), {
      path: 'docs/notes.md', disposition: 'migrate', reason: 'type_approved', concept: 'playbooks/notes', type: 'Playbook',
    });
    assert.deepEqual(entryFor(response, 'garbled.md'), {
      path: 'garbled.md', disposition: 'residue', reason: 'not_utf8', concept: null, type: null,
    });
  });

  test('a partial answer set resolves what it names, but a scalar only answers the one question open right now', (t) => {
    const root = repo(t);
    write(root, 'docs/notes.md', '# Notes\n\nJust prose, no frontmatter.\n');
    fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    const sources = discoverSources(root);

    const response = run(planRequest(root, sources, { answers: { 'docs/notes.md': 'Playbook' } }));

    assert.equal(response.data.plan.executable, false);
    // #203: a scalar answers only the question open right now. The approved
    // type opens a *new* `reader_purpose_group` question the same round, which
    // this one scalar answer cannot also settle -- so the source stays blocked,
    // now on its own accepted group rather than its type.
    assert.deepEqual(entryFor(response, 'docs/notes.md'), {
      path: 'docs/notes.md', disposition: 'blocked_pending_decision', reason: 'reader_purpose_group_not_assigned', concept: null, type: 'Playbook',
    });
    assert.equal(entryFor(response, 'garbled.md').disposition, 'blocked_pending_decision');
    assert.deepEqual(response.data.questions.map((q) => q.path).sort(), ['docs/notes.md', 'garbled.md']);
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

    const { response } = planWithGroups(run, planner(root, sources), {
      root, placement: { 'docs/decisions/use-postgres.md': 'decisions' },
    });
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
    // #203: no group package is supplied, so no collision occurs below anymore --
    // `docs/decisions/collide.md`'s open question is `reader_purpose_group` with an
    // empty accepted-group option set, and `proceed_anyway` fails that question's
    // option validation before any concept path or disk check is ever derived. The
    // pre-existing bundle file stays as inert fixture from the pre-#203 collision
    // shape; the refusal below never consults it.
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
    const root = temporaryRoot(t, 'okf-migration-mapping-no-repo-');
    const response = run(planRequest(root, []));
    assert.equal(response.result, 'not-configured');
  });

  test('migration-plan does not bypass the activation gate: an inactive bundle answers not-configured', (t) => {
    const root = repo(t, { active: false });
    const response = run(planRequest(root, []));
    assert.equal(response.result, 'not-configured');
    assert.equal(response.data.plan, undefined);
  });

  test('migration-plan reports MANIFEST_INVALID like every other setup operation on a broken manifest', (t) => {
    const root = repo(t, { active: false });
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
    const response = run(planRequest(root, []));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'MANIFEST_INVALID');
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
    const routerRun = (value) => runWrapper(routerWrapper, { ...value, skill: 'okf' });
    const { response: ok } = planWithGroups(routerRun, planner(active, sources), {
      root: active, placement: { 'docs/decisions/use-postgres.md': 'decisions' },
    });
    assert.equal(ok.skill, 'okf');
    assert.equal(ok.result, 'ok');
    assert.equal(ok.data.plan.executable, true);

    const inactive = repo(t, { active: false });
    const notConfigured = runWrapper(routerWrapper, { ...planRequest(inactive, []), skill: 'okf' });
    assert.equal(notConfigured.result, 'not-configured');
  });

  // -------------------------------------------------------- settings exposure (#197)

  // `migration-plan` is the proposal `/setup`'s migration flow builds, so the
  // effective `max_words_per_file` value must reach it the same way `inspect`
  // already reports it for the manifest itself -- this writes the manifest
  // directly (rather than through `repo()`'s fixed template) so each test
  // controls its own `settings` block.
  function writeManifestWithSettings(root, settings) {
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: TEST_WORKSPACE_ID,
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
      ...(settings === undefined ? {} : { settings }),
    }));
  }

  test('migration-plan exposes the built-in max_words_per_file default when the manifest declares no settings', (t) => {
    const root = repo(t, { active: false });
    writeManifestWithSettings(root, undefined);

    const response = run(planRequest(root, []));
    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
    assert.deepEqual(response.data.settings_findings, []);
  });

  test('migration-plan exposes an override value from .okf-workspace.json as the effective max_words_per_file', (t) => {
    const root = repo(t, { active: false });
    writeManifestWithSettings(root, { max_words_per_file: 250 });

    const response = run(planRequest(root, []));
    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.settings, { max_words_per_file: 250 });
    assert.deepEqual(response.data.settings_findings, []);
  });

  test('migration-plan keeps the built-in max_words_per_file default effective and reports SETTING_INVALID when the override is invalid', (t) => {
    const root = repo(t, { active: false });
    writeManifestWithSettings(root, { max_words_per_file: 0 });

    const response = run(planRequest(root, []));
    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
    assert.deepEqual(response.data.settings_findings, [{
      code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
      detail: { gate: 'settings', reason: 'invalid_setting_value', key: 'max_words_per_file' },
    }]);
    // The invalid override never invalidates the manifest or the plan itself --
    // the same non-blocking guarantee `inspect` already gives (#197 task 1).
    assert.equal(response.data.plan.executable, true);
  });
});

describe('type evidence, provenance, link rewriting and duplicates', () => { // #145
  // -------------------------------------------------- deterministic type mapping

  test('Decision: a conventional directory name is deterministic evidence, with no explicit type', (t) => {
    const root = repo(t);
    write(root, 'docs/adr/0001-use-queue.md', '# Use a queue\n\nNo frontmatter at all.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/adr/0001-use-queue.md': 'decisions' });

    assert.deepEqual(entryFor(response, 'docs/adr/0001-use-queue.md'), {
      path: 'docs/adr/0001-use-queue.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'decisions/0001-use-queue', type: 'Decision',
    });
  });

  test('Decision: a conventional ADR filename is deterministic evidence outside a conventional directory', (t) => {
    const root = repo(t);
    write(root, 'random/ADR-0007-cache.md', '# Cache invalidation\n\nNo frontmatter.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'random/ADR-0007-cache.md': 'decisions' });

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
    const response = planGrouped(root, sources, { 'notes/design-review.md': 'decisions' });

    assert.deepEqual(entryFor(response, 'notes/design-review.md'), {
      path: 'notes/design-review.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'decisions/design-review', type: 'Decision',
    });
  });

  test('Glossary: the domain-modeling CONTEXT.md filename convention is deterministic evidence', (t) => {
    const root = repo(t);
    write(root, 'billing/CONTEXT.md', '**Invoice**: a billable record.\n\n**Ledger**: the record of transactions.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'billing/CONTEXT.md': 'billing' });

    assert.deepEqual(entryFor(response, 'billing/CONTEXT.md'), {
      path: 'billing/CONTEXT.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'billing/glossary', type: 'Glossary',
    });
  });

  test('Constraint: a conventional directory name is deterministic evidence', (t) => {
    const root = repo(t);
    write(root, 'docs/constraints/rate-limit.md', '# Rate limit\n\nNo more than 10 requests/second.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/constraints/rate-limit.md': 'constraints' });

    assert.deepEqual(entryFor(response, 'docs/constraints/rate-limit.md'), {
      path: 'docs/constraints/rate-limit.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'constraints/rate-limit', type: 'Constraint',
    });
  });

  test('Research: a conventional directory name is deterministic evidence', (t) => {
    const root = repo(t);
    write(root, 'docs/research/spike.md', '# Spike\n\nInvestigated caching strategies.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/research/spike.md': 'research' });

    assert.deepEqual(entryFor(response, 'docs/research/spike.md'), {
      path: 'docs/research/spike.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'research/spike', type: 'Research',
    });
  });

  test('Playbook: a conventional directory name is deterministic evidence', (t) => {
    const root = repo(t);
    write(root, 'ops/playbooks/deploy.md', '# Deploy\n\n1. Build.\n2. Ship.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'ops/playbooks/deploy.md': 'playbooks' });

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
    const response = planGrouped(root, sources, { 'docs/releases/notes.md': 'releases', 'random/v2.0.0.md': 'releases' });

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
    const response = planGrouped(root, sources, { 'docs/references/external-spec.md': 'references' });

    assert.deepEqual(entryFor(response, 'docs/references/external-spec.md'), {
      path: 'docs/references/external-spec.md', disposition: 'migrate', reason: 'type_inferred',
      concept: 'references/external-spec', type: 'Reference',
    });
  });

  // #203: Attested Computation has no canonical directory or accepted-group
  // rule of its own -- #202 never derives a group from a type, so this one
  // still needs an accepted placement like any other typed source. Placing it
  // into the nested group `docs/misc` (matching its own source directory)
  // reproduces the same concept path the pre-#203 mechanical mirror used to.
  test('Attested Computation: an explicit "runtime" field is structural frontmatter evidence, and its accepted group -- never a type-directory or a mirror of its source path -- decides its concept path', (t) => {
    const root = repo(t);
    write(root, 'docs/misc/pipeline.md', '---\nruntime:\n  executor: ci\n  attester: signed\n---\n# Pipeline result\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/misc/pipeline.md': 'docs/misc' });

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

  test('an explicit type is preserved verbatim, including a domain-specific one no core rule names, and still needs its own accepted group', (t) => {
    const root = repo(t);
    write(root, 'docs/misc/req.md', '---\ntype: Requirement\n---\n# Must support SSO\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/misc/req.md': 'docs/misc' });

    assert.deepEqual(entryFor(response, 'docs/misc/req.md'), {
      path: 'docs/misc/req.md', disposition: 'migrate', reason: 'type_preserved',
      concept: 'docs/misc/req', type: 'Requirement',
    });
  });

  test('an explicit type wins even when the path also carries deterministic evidence for a different type', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/status.md', '---\ntype: Research\n---\n# Investigating the decision backlog\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/decisions/status.md': 'research' });

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
    const response = planGrouped(root, sources, { 'docs/decisions/funding.md': 'decisions' });

    const mapped = mappingFor(response, 'docs/decisions/funding.md');
    assert.deepEqual(mapped.sources, [{ resource: 'https://example.test/policy', id: 'policy' }]);
  });

  test('absent provenance stays absent: no fabricated sources, generated, verified, or actor field ever appears', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/no-provenance.md', '---\ntype: Decision\n---\n# No provenance\n\nBody text.\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/decisions/no-provenance.md': 'decisions' });

    const mapped = mappingFor(response, 'docs/decisions/no-provenance.md');
    assert.equal(mapped.sources, null);
    assert.deepEqual(Object.keys(mapped).sort(), ['body', 'concept', 'path', 'source_identity', 'sources', 'type'].sort());
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
    const response = planGrouped(root, sources, {
      'docs/decisions/adr1.md': 'decisions', 'docs/decisions/adr2.md': 'decisions',
    });

    assert.equal(entryFor(response, 'docs/decisions/adr1.md').concept, 'decisions/adr1');
    assert.equal(entryFor(response, 'docs/decisions/adr2.md').concept, 'decisions/adr2');

    const mapped = mappingFor(response, 'docs/decisions/adr1.md');
    assert.ok(mapped.body.includes('[the other decision](adr2.md)'), mapped.body);
    assert.ok(!mapped.body.includes('./adr2.md'), mapped.body);
    assert.ok(mapped.body.includes('`[fake](./not-real.md)`'), mapped.body);
    assert.ok(mapped.body.includes('[fenced](./also-not-real.md)'), mapped.body);
  });

  // #188: a target outside this migration is not left as written -- its link is
  // re-expressed from the concept's own new directory (see the dedicated
  // coverage of that rewrite) -- only a target this rewriter cannot parse as an
  // internal path at all -- an external URL -- is left untouched.
  test('a link to a target outside this migration is re-expressed for the concept\'s new directory; an external URL is left exactly as written', (t) => {
    const root = repo(t);
    write(root, 'docs/decisions/lonely.md', '---\ntype: Decision\n---\n# Lonely decision\n\nSee [elsewhere](../missing.md) and [the web](https://example.test/).\n');
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, { 'docs/decisions/lonely.md': 'decisions' });

    const mapped = mappingFor(response, 'docs/decisions/lonely.md');
    assert.ok(mapped.body.includes('[elsewhere](../../docs/missing.md)'), mapped.body);
    assert.ok(mapped.body.includes('[the web](https://example.test/)'), mapped.body);
  });

  // ------------------------------------------------------------------- residue

  // #177 (#157): residue is report-only. The source is recorded once in the plan,
  // left exactly where it is, and given no target path of any kind -- there is no
  // `data.references` on the response at all, and no `references/` copy is ever
  // derived, staged or published.
  test('an unsupported source is recorded as residue once in the plan, never silently dropped, and is given no target path', (t) => {
    const root = repo(t);
    write(root, 'notes/wiki.md', '# Note\n\nSee [[Other Note]] for background.\n');
    const sources = discoverSources(root);
    const response = run(planRequest(root, sources));

    const residue = response.data.plan.entries.filter((item) => item.disposition === 'residue');
    assert.deepEqual(residue, [
      { path: 'notes/wiki.md', disposition: 'residue', reason: 'unsupported_format', concept: null, type: null },
    ]);
    assert.equal(response.data.references, undefined);
    assert.equal(JSON.stringify(response).includes('references/notes/wiki.md'), false);
    // The source itself is untouched where it always was.
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'wiki.md'), 'utf8'), '# Note\n\nSee [[Other Note]] for background.\n');
  });

  // ------------------------------------------------------------------ duplicates

  test('an exact content duplicate among migrating sources is surfaced as a candidate, never silently merged', (t) => {
    const root = repo(t);
    const identical = '---\ntype: Decision\n---\n# Use Postgres\n\nSame reasoning, copied twice.\n';
    write(root, 'docs/decisions/first.md', identical);
    write(root, 'docs/decisions/second.md', identical);
    const sources = discoverSources(root);
    const response = planGrouped(root, sources, {
      'docs/decisions/first.md': 'decisions', 'docs/decisions/second.md': 'decisions',
    });

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
});

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
describe('Glossary is structural evidence only, never a content heuristic', () => { // #179
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
    const response = planWithGroups(run, planner(root, sources), {
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
});
