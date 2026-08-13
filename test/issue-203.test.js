/*
 * #203 (#202): folder-local concept-group packages in setup migration.
 *
 * Every test here observes a wrapper process response, never a runtime module: the
 * subject is the accepted group-package contract `migration-plan` proves, and the
 * conformance gate `migration-validate` and `publish` reuse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { planWithGroups } = require('../test-support/groups');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

function repo(t) {
  const root = temporaryRoot(t, 'okf-203-repo-');
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

function sourcesOf(root) {
  return run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root },
  }).data.sources;
}

function planner(root, sources) {
  return (payload) => ({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources, ...payload },
  });
}

function plan(root, payload = {}) {
  return run(planner(root, sourcesOf(root))(payload));
}

function findingCodes(response) {
  return response.findings.map((item) => item.code);
}

function entryFor(response, sourcePath) {
  return response.data.plan.entries.find((item) => item.path === sourcePath);
}

// ------------------------------------------------------- placement is asked, never derived

test('a typed source with no accepted group is blocked, and asks which accepted group it belongs to', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const response = plan(root);

  assert.deepEqual(entryFor(response, 'docs/decisions/use-postgres.md'), {
    path: 'docs/decisions/use-postgres.md',
    disposition: 'blocked_pending_decision',
    reason: 'reader_purpose_group_not_assigned',
    concept: null,
    type: 'Decision',
  });
  assert.equal(response.data.plan.executable, false);
  const question = response.data.questions.find((item) => item.path === 'docs/decisions/use-postgres.md');
  assert.equal(question.kind, 'reader_purpose_group');
  assert.deepEqual(question.options, []);
});

test('the group question offers exactly the accepted group keys, and the answer places the concept', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });

  assert.equal(response.data.plan.executable, true);
  assert.deepEqual(entryFor(response, 'docs/decisions/use-postgres.md'), {
    path: 'docs/decisions/use-postgres.md',
    disposition: 'migrate',
    reason: 'type_inferred',
    concept: 'delivery/use-postgres',
    type: 'Decision',
  });
});

test('a type answer and a group answer are one batched entry per source, resolved in one call', (t) => {
  const root = repo(t);
  write(root, 'notes/onboarding.md', '# Onboarding\n\nPlain prose with no type evidence.\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'notes/onboarding.md': 'people' },
    answers: { 'notes/onboarding.md': { type: 'Playbook' } },
  });

  assert.equal(response.data.plan.executable, true);
  assert.deepEqual(entryFor(response, 'notes/onboarding.md'), {
    path: 'notes/onboarding.md',
    disposition: 'migrate',
    reason: 'type_approved',
    concept: 'people/onboarding',
    type: 'Playbook',
  });
});

test('two sources sharing a basename in one accepted group collide, and are never silently renamed', (t) => {
  const root = repo(t);
  write(root, 'okf/delivery/use-postgres.md', '---\ntype: Decision\nstatus: draft\n---\n\n# Existing\n');
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });

  assert.equal(entryFor(response, 'docs/decisions/use-postgres.md').reason, 'target_collision');
  assert.equal(response.data.plan.executable, false);
});

// ------------------------------------------------------------------- root refusal

test('an output accepted at the bundle root is refused, whatever its type', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  // The one thing the accepted proposal may never say: this concept sits at the
  // direct bundle root. Nothing repairs it; it is named and refused.
  const rooted = run(planner(root, sources)({
    group_packages: accepted.group_packages.map((item) => ({
      ...item,
      children: [{ kind: 'concept', concept_id: 'use-postgres', title: 'Use PostgreSQL', order: 1 }],
    })),
    root_package: accepted.root_package,
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: 'delivery' } },
  }));

  assert.ok(findingCodes(rooted).includes('GROUP_INDEX_CHILDREN_MISMATCH'));
});

test('the bundle root keeps only index.md and log.md: a group key is never empty', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const response = plan(root, {
    group_packages: [{
      group: '',
      purpose: 'Root',
      index: { disposition: 'created', title: 'Root' },
      glossary: { disposition: 'none' },
      guidance: { disposition: 'none' },
      log: { disposition: 'none' },
      children: [],
    }],
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});

// ----------------------------------------------------------- package coherence

test('a group package whose parent group is not accepted is refused', (t) => {
  const root = repo(t);
  write(root, 'docs/ci.md', '---\ntype: Playbook\n---\n\n# CI\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/ci.md': 'delivery/ci' },
  });
  const orphaned = run(planner(root, sources)({
    group_packages: accepted.group_packages.filter((item) => item.group !== 'delivery'),
    root_package: { ...accepted.root_package, children: [{ kind: 'group', group: 'delivery/ci', title: 'ci', order: 1 }] },
    answers: { 'docs/ci.md': { reader_purpose_group: 'delivery/ci' } },
  }));

  assert.ok(findingCodes(orphaned).includes('GROUP_PACKAGE_PARENT_MISSING'));
});

test('a reviewed output naming a group the accepted set does not carry is refused as an unknown assignment', (t) => {
  const root = repo(t);
  write(root, 'docs/guide.md', [
    '---', 'type: Playbook', '---', '# Guide', '', 'Guide instructions.',
  ].join('\n'));
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'docs/guide.md': 'alpha' },
    payload: {
      split_requested: ['docs/guide.md'],
      split_sections: [{
        path: 'docs/guide.md',
        sections: [
          { line_start: 1, line_end: 3, disposition: 'residue' },
          { line_start: 4, line_end: 6, disposition: 'assigned', output: 'guide' },
        ],
      }],
      split_proposals: [{
        path: 'docs/guide.md',
        result: 'keep_as_one',
        keep_as_one_reason: 'One reader purpose.',
        accepted: true,
        outputs: [{
          output: 'guide',
          concept_id: 'ghost/guide',
          path: 'ghost/guide.md',
          type: 'Playbook',
          title: 'Guide',
          heading_outline: [{ level: 1, text: 'Guide' }],
          reader_purpose_group: {
            key: 'ghost',
            purpose: 'Use the ghost guides.',
            index_entry: { path: 'ghost/index.md', title: 'ghost' },
            child_entry: { concept_id: 'ghost/guide', path: 'ghost/guide.md', title: 'Guide', order: 1 },
          },
          provenance_assignments: [],
          link_routes: [],
          anchor_routes: [],
        }],
        provenance_exclusions: [],
        heading_changes: [],
        whole_source_link_routes: [],
      }],
    },
  });

  const unknown = response.findings.find((item) => item.code === 'GROUP_ASSIGNMENT_UNKNOWN');
  assert.deepEqual(unknown.detail, { path: 'ghost/guide.md', group: 'ghost' });
});

test('an accepted group with no concept and no child group is refused as unused scaffolding', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  const empty = {
    group: 'someday',
    purpose: 'Nothing yet',
    index: { disposition: 'created', title: 'Someday' },
    glossary: { disposition: 'none' },
    guidance: { disposition: 'none' },
    log: { disposition: 'none' },
    children: [],
  };
  const response = run(planner(root, sources)({
    group_packages: [...accepted.group_packages, empty],
    root_package: {
      ...accepted.root_package,
      children: [
        { kind: 'group', group: 'delivery', title: 'delivery', order: 1 },
        { kind: 'group', group: 'someday', title: 'someday', order: 2 },
      ],
    },
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: 'delivery' } },
  }));

  assert.ok(findingCodes(response).includes('GROUP_PACKAGE_UNUSED'));
});

test('a group index whose children do not match the accepted outputs is refused', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  const response = run(planner(root, sources)({
    group_packages: accepted.group_packages.map((item) => ({ ...item, children: [] })),
    root_package: accepted.root_package,
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: 'delivery' } },
  }));

  const mismatch = response.findings.find((item) => item.code === 'GROUP_INDEX_CHILDREN_MISMATCH');
  assert.deepEqual(mismatch.detail, { group: 'delivery', missing: ['delivery/use-postgres'], extra: [] });
});

test('a clean accepted package set derives one index row per touched group and the root row', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  write(root, 'docs/ci.md', '---\ntype: Playbook\n---\n\n# CI\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root,
    placement: { 'docs/decisions/use-postgres.md': 'delivery', 'docs/ci.md': 'delivery/ci' },
    options: { root_index: 'updated' },
  });

  assert.deepEqual(findingCodes(response), []);
  assert.deepEqual(response.data.group_packages.indexes.map((item) => item.index_entry.path), [
    'delivery/ci/index.md', 'delivery/index.md', 'index.md',
  ]);
  const delivery = response.data.group_packages.indexes.find((item) => item.key === 'delivery');
  assert.deepEqual(delivery.child_entries, [
    { concept_id: 'delivery/use-postgres', path: 'delivery/use-postgres.md', title: 'use-postgres', order: 1 },
    { concept_id: 'delivery/ci', path: 'delivery/ci/index.md', title: 'delivery/ci', order: 2 },
  ]);
});

// ---------------------------------------------------------------- glossary ownership

function packageWith(group, overrides) {
  return {
    group,
    purpose: `Reader purpose for ${group}`,
    index: { disposition: 'created', title: group },
    glossary: { disposition: 'none' },
    guidance: { disposition: 'none' },
    log: { disposition: 'none' },
    children: [{ kind: 'concept', concept_id: `${group}/note`, title: 'note', order: 1 }],
    ...overrides,
  };
}

function twoGroups(root, sources, packages) {
  return run(planner(root, sources)({
    group_packages: packages,
    root_package: {
      purpose: 'Bundle root',
      // The root index already exists on disk and gains alpha/beta this
      // migration, so it is rewritten -- `unchanged` would be the stale-index
      // claim the group-package gate refuses.
      index: { disposition: 'updated', title: 'Bundle' },
      log: { disposition: 'none' },
      children: packages.map((item, index) => ({ kind: 'group', group: item.group, title: item.group, order: index + 1 })),
    },
    answers: {
      'docs/alpha/note.md': { reader_purpose_group: 'alpha' },
      'docs/beta/note.md': { reader_purpose_group: 'beta' },
    },
  }));
}

function twoGroupRepo(t) {
  const root = repo(t);
  write(root, 'docs/alpha/note.md', '---\ntype: Reference\n---\n\n# Alpha\n');
  write(root, 'docs/beta/note.md', '---\ntype: Reference\n---\n\n# Beta\n');
  // Both groups already carry a glossary this migration leaves alone, so a term
  // declaration below is an ownership claim about an existing local glossary
  // rather than a claim that this migration creates one.
  write(root, 'okf/alpha/glossary.md', '---\ntype: Glossary\n---\n\n**Shard**: existing.\n');
  write(root, 'okf/beta/glossary.md', '---\ntype: Glossary\n---\n\n**Shard**: existing.\n');
  return root;
}

test('one shared term has one canonical owning glossary, and a second unscoped owner is a conflict', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: null }] } }),
    packageWith('beta', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: null }] } }),
  ]);

  const conflict = response.findings.find((item) => item.code === 'GROUP_TERM_OWNERSHIP_CONFLICT');
  assert.deepEqual(conflict.detail, { term: 'Shard', groups: ['alpha', 'beta'] });
});

test('two separate meanings stay in two local glossaries when each states its own scope', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: 'storage' }] } }),
    packageWith('beta', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: 'migration' }] } }),
  ]);

  assert.equal(findingCodes(response).filter((code) => code.startsWith('GROUP_')).length, 0);
});

test('a consuming group links to the owning glossary, and a link to an unowned term is refused', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const linked = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: null }] } }),
    packageWith('beta', { glossary: { disposition: 'unchanged' }, linked_terms: [{ term: 'Shard', owner: 'alpha' }] }),
  ]);
  assert.equal(findingCodes(linked).filter((code) => code.startsWith('GROUP_')).length, 0);

  const dangling = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'unchanged', terms: [{ term: 'Shard', scope: null }] } }),
    packageWith('beta', { glossary: { disposition: 'unchanged' }, linked_terms: [{ term: 'Ledger', owner: 'alpha' }] }),
  ]);
  assert.ok(findingCodes(dangling).includes('GROUP_TERM_LINK_UNOWNED'));
});

test('a group linking a term back to itself is refused as a self-ownership claim', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'unchanged' } }),
    packageWith('beta', {
      glossary: { disposition: 'unchanged' },
      linked_terms: [{ term: 'Shard', owner: 'beta' }],
    }),
  ]);

  const self = response.findings.find((item) => item.code === 'GROUP_TERM_LINK_SELF');
  assert.deepEqual(self.detail, { group: 'beta', term: 'Shard' });
});

test('a general shared/ fallback group is refused by name', (t) => {
  const root = repo(t);
  write(root, 'docs/shared/note.md', '---\ntype: Reference\n---\n\n# Note\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/shared/note.md': 'shared' },
  });

  assert.ok(findingCodes(response).includes('GROUP_SHARED_FALLBACK'));
});

test('a group declaring no local glossary declares no terms either', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'none', terms: [{ term: 'Shard', scope: null }] } }),
    packageWith('beta', {}),
  ]);

  assert.ok(findingCodes(response).includes('GROUP_GLOSSARY_TERMS_MISMATCH'));
});

// --------------------------------------------------------------- dispositions

test('an explicit no-change disposition is represented, and a false claim about the bundle is refused', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    // `unchanged` claims the file is already there. It is not.
    packageWith('alpha', { index: { disposition: 'unchanged', title: 'alpha' } }),
    packageWith('beta', {}),
  ]);

  const invalid = response.findings.find((item) => item.code === 'GROUP_PACKAGE_DISPOSITION_INVALID');
  assert.deepEqual(invalid.detail, {
    group: 'alpha', file: 'index', disposition: 'unchanged', target_path: 'alpha/index.md',
  });
});

test('setup migration authors no group log, and says so rather than inventing one', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { log: { disposition: 'created' } }),
    packageWith('beta', {}),
  ]);

  const refused = response.findings.find((item) => item.code === 'GROUP_PACKAGE_DISPOSITION_UNSUPPORTED');
  assert.deepEqual(refused.detail, { group: 'alpha', file: 'log', disposition: 'created' });
});

test('a created glossary must be one of this migration accepted outputs, not an empty file', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', { glossary: { disposition: 'created' } }),
    packageWith('beta', {}),
  ]);

  const mismatch = response.findings.find((item) => item.code === 'GROUP_PACKAGE_OUTPUT_MISMATCH');
  assert.deepEqual(mismatch.detail, {
    group: 'alpha', file: 'glossary', disposition: 'created', target_path: 'alpha/glossary.md',
  });
});

test('a migrated Glossary source becomes its group own glossary', (t) => {
  const root = repo(t);
  write(root, 'docs/alpha/glossary.md', '**Shard**: a slice of a migration.\n**Brief**: what a worker receives.\n');
  const sources = sourcesOf(root);
  const { response } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/alpha/glossary.md': 'alpha' },
  });

  assert.equal(findingCodes(response).filter((code) => code.startsWith('GROUP_')).length, 0);
  assert.equal(entryFor(response, 'docs/alpha/glossary.md').concept, 'alpha/glossary');
});

// ------------------------------------------------------------ guidance dispositions

test('a created guidance concept accepted from one of the migration own outputs passes the group gate', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', {
      glossary: { disposition: 'unchanged' },
      guidance: { disposition: 'created', concept_id: 'alpha/note' },
    }),
    packageWith('beta', { glossary: { disposition: 'unchanged' } }),
  ]);

  assert.equal(findingCodes(response).filter((code) => code.startsWith('GROUP_')).length, 0);
});

test('an unchanged guidance disposition is accepted when the guidance concept is already in the bundle', (t) => {
  const root = twoGroupRepo(t);
  write(root, 'okf/alpha/how-to.md', '---\ntype: Reference\n---\n\n# How to\n');
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', {
      glossary: { disposition: 'unchanged' },
      guidance: { disposition: 'unchanged', concept_id: 'alpha/how-to' },
    }),
    packageWith('beta', { glossary: { disposition: 'unchanged' } }),
  ]);

  assert.equal(findingCodes(response).filter((code) => code.startsWith('GROUP_')).length, 0);
});

test('a created guidance claim with no accepted output landing on it is refused', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', {
      glossary: { disposition: 'unchanged' },
      guidance: { disposition: 'created', concept_id: 'alpha/guide' },
    }),
    packageWith('beta', { glossary: { disposition: 'unchanged' } }),
  ]);

  const mismatch = response.findings.find((item) => item.code === 'GROUP_PACKAGE_OUTPUT_MISMATCH');
  assert.deepEqual(mismatch.detail, {
    group: 'alpha', file: 'guidance', disposition: 'created', target_path: 'alpha/guide.md',
  });
});

test('a guidance concept outside its own group is refused as a placement violation', (t) => {
  const root = twoGroupRepo(t);
  const sources = sourcesOf(root);
  const response = twoGroups(root, sources, [
    packageWith('alpha', {
      glossary: { disposition: 'unchanged' },
      guidance: { disposition: 'created', concept_id: 'beta/guide' },
    }),
    packageWith('beta', { glossary: { disposition: 'unchanged' } }),
  ]);

  const placed = response.findings.find((item) => item.code === 'GROUP_PACKAGE_PLACEMENT_INVALID');
  assert.deepEqual(placed.detail, { group: 'alpha', file: 'guidance', target_path: 'beta/guide.md' });
});

// ------------------------------------------------- the conformance gate downstream

// A plain filesystem action, exactly what `assemble` itself performs -- staging is
// never reached through the write gate (#131, #147).
function stage(root, relative, content) {
  const file = path.join(root, '.okf-staging', 'okf', relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return path.join('.okf-staging', 'okf', relative);
}

function identity(root, relative) {
  return `sha256:${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(root, relative))).digest('hex')}`;
}

// One accepted group holding one migrated concept, staged exactly as `assemble`
// would leave it: the concept plus that group's own navigation index.
function stagedGroup(root, { withIndex = true } = {}) {
  write(root, 'docs/use-postgres.md', '# Use PostgreSQL\n');
  const conceptFile = stage(root, 'delivery/use-postgres.md', '---\ntype: Decision\nstatus: draft\n---\n\n# Use PostgreSQL\n');
  const indexText = '# Delivery\n\nHow this project ships.\n\n- [Use PostgreSQL](use-postgres.md)\n';
  const indexFile = withIndex ? stage(root, 'delivery/index.md', indexText) : null;
  const groupPackages = {
    packages: [{
      group: 'delivery',
      purpose: 'How this project ships.',
      index: { disposition: 'created', title: 'Delivery' },
      glossary: { disposition: 'none' },
      guidance: { disposition: 'none' },
      log: { disposition: 'none' },
      children: [{ kind: 'concept', concept_id: 'delivery/use-postgres', title: 'Use PostgreSQL', order: 1 }],
    }],
    root: {
      purpose: 'Bundle root',
      index: { disposition: 'unchanged', title: 'Bundle' },
      log: { disposition: 'none' },
      children: [{ kind: 'group', group: 'delivery', title: 'Delivery', order: 1 }],
    },
    indexes: [{
      key: 'delivery',
      purpose: 'How this project ships.',
      index_entry: { path: 'delivery/index.md', title: 'Delivery' },
      child_entries: [{ concept_id: 'delivery/use-postgres', path: 'delivery/use-postgres.md', title: 'Use PostgreSQL', order: 1 }],
    }],
  };
  const candidates = [{ path: 'delivery/use-postgres.md', identity: identity(root, conceptFile) }];
  if (indexFile) candidates.push({ path: 'delivery/index.md', identity: identity(root, indexFile) });
  return { conceptFile, indexFile, groupPackages, candidates };
}

function validateRequest(root, fixture, overrides = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: {
      cwd: root,
      selected: ['docs/use-postgres.md'],
      plan: {
        entries: [{
          path: 'docs/use-postgres.md', disposition: 'migrate', reason: 'type_inferred',
          concept: 'delivery/use-postgres', type: 'Decision',
        }],
        executable: true,
      },
      split_review: [{
        path: 'docs/use-postgres.md', accounting_status: 'not_required',
        sections: [], outputs: [], proposal: null,
      }],
      group_packages: fixture.groupPackages,
      semantic_review: { performed: false, candidates: fixture.candidates, sources: [] },
      ...overrides,
    },
  };
}

test('a staged tree that matches the accepted group packages exactly passes the conformance gate', (t) => {
  const root = repo(t);
  const fixture = stagedGroup(root);
  const response = run(validateRequest(root, fixture));

  assert.equal(findingCodes(response).includes('CANDIDATE_GROUP_PACKAGE_MISMATCH'), false);
  assert.equal(response.data.publishable, true);
});

test('a staged tree missing an accepted group index is refused before publication', (t) => {
  const root = repo(t);
  const fixture = stagedGroup(root, { withIndex: false });
  const response = run(validateRequest(root, fixture));

  const mismatch = response.findings.find((item) => item.code === 'CANDIDATE_GROUP_PACKAGE_MISMATCH');
  assert.deepEqual(mismatch.detail.missing, ['delivery/index.md']);
  assert.equal(response.data.publishable, false);
});

test('a staged concept the accepted packages never named is refused as an extra candidate', (t) => {
  const root = repo(t);
  const fixture = stagedGroup(root);
  const strayFile = stage(root, 'delivery/stray.md', '---\ntype: Decision\nstatus: draft\n---\n\n# Stray\n');
  const response = run(validateRequest(root, fixture, {
    semantic_review: {
      performed: false,
      candidates: [...fixture.candidates, { path: 'delivery/stray.md', identity: identity(root, strayFile) }],
      sources: [],
    },
  }));

  const mismatch = response.findings.find((item) => item.code === 'CANDIDATE_GROUP_PACKAGE_MISMATCH');
  assert.deepEqual(mismatch.detail.extra, ['delivery/stray.md']);
  assert.equal(response.data.publishable, false);
});

test('an accepted concept at the direct bundle root is refused at the validation gate too', (t) => {
  const root = repo(t);
  const fixture = stagedGroup(root);
  const response = run(validateRequest(root, fixture, {
    plan: {
      entries: [{
        path: 'docs/use-postgres.md', disposition: 'migrate', reason: 'type_inferred',
        concept: 'use-postgres', type: 'Decision',
      }],
      executable: true,
    },
  }));

  const rooted = response.findings.find((item) => item.code === 'GROUP_PACKAGE_ROOT_OUTPUT');
  assert.deepEqual(rooted.detail, { path: 'use-postgres.md' });
  assert.equal(response.data.publishable, false);
});

// ------------------------------------------------------- unchanged-index staleness

test('an unchanged index claim is refused when the group gains children this migration', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  // The group's own index exists on disk, but this migration adds a concept to
  // it: an `unchanged` claim would silently leave that on-disk index stale.
  write(root, 'okf/delivery/index.md', '# Delivery\n');
  const response = run(planner(root, sources)({
    group_packages: accepted.group_packages.map((item) => ({
      ...item,
      index: { disposition: 'unchanged', title: 'delivery' },
    })),
    root_package: accepted.root_package,
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: 'delivery' } },
  }));

  assert.ok(findingCodes(response).includes('GROUP_INDEX_UNCHANGED_STALE'));
  const stale = response.findings.find((item) => item.code === 'GROUP_INDEX_UNCHANGED_STALE');
  assert.deepEqual(stale.detail, {
    group: 'delivery', target_path: 'delivery/index.md',
    gained_concepts: ['delivery/use-postgres'], gained_groups: [],
  });
});

// ------------------------------------------------------- derived default root package

test('an omitted root package defaults to a valid accepted root derived from the accepted groups', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { accepted } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  const response = run(planner(root, sources)({
    group_packages: accepted.group_packages,
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: 'delivery' } },
  }));

  assert.equal(response.result, 'ok');
  assert.deepEqual(findingCodes(response), []);
  assert.deepEqual(response.data.group_packages.root, {
    purpose: 'Bundle root',
    index: { disposition: 'updated', title: 'Bundle' },
    log: { disposition: 'none' },
    children: [{ kind: 'group', group: 'delivery', title: 'delivery', order: 1 }],
  });
  assert.ok(response.data.group_packages.indexes.some((row) => row.index_entry.path === 'index.md'));
});

// ------------------------------------------------------- group keys before any probe

test('an illegal group key is refused before any placement probe, with its finding', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const response = run(planner(root, sources)({
    group_packages: [{
      group: '../evil',
      purpose: 'Escaped',
      index: { disposition: 'created', title: 'evil' },
      glossary: { disposition: 'none' },
      guidance: { disposition: 'none' },
      log: { disposition: 'none' },
      children: [],
    }],
    answers: { 'docs/decisions/use-postgres.md': { reader_purpose_group: '../evil' } },
  }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.deepEqual(findingCodes(response), ['GROUP_PACKAGE_KEY_INVALID']);
  assert.deepEqual(response.findings[0].detail, { group: '../evil' });
});

// ------------------------------------------------------- concept-vs-index staging collision

test('a shard concept whose id equals a group index path is refused at the staging boundary', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/index.md', '---\ntype: Decision\n---\n# Index\n');
  const sources = sourcesOf(root);
  const { response: planned } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/index.md': 'delivery' },
  });
  const partitioned = run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'partition',
    payload: {
      cwd: root, plan: planned.data.plan, mapping: planned.data.mapping,
      split_review: planned.data.split_review,
    },
  });
  const brief = partitioned.data.shards[0].brief;
  const shard = {
    shard: brief.shard,
    concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\nConverted.\n` })),
    warnings: [],
    blockers: [],
  };
  const shardPath = '.okf-staging/shards/index.json';
  write(root, shardPath, JSON.stringify(shard));
  const response = run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'assemble',
    payload: {
      cwd: root,
      partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
      shards: [{ shard: brief.shard, path: shardPath }],
      group_packages: planned.data.group_packages,
    },
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'ASSEMBLY_INDEX_COLLISION');
  assert.deepEqual(response.findings[0].detail, {
    concept: 'delivery/index', index_path: 'delivery/index.md',
    source: 'docs/decisions/index.md', shard: brief.shard,
  });
  assert.equal(fs.existsSync(path.join(root, '.okf-staging', 'okf')), false);
});

// A worker cannot smuggle a root concept in: shard validation binds every
// concept to the approved mapping, so the root-ness has to come from the
// accepted plan/mapping themselves -- which is exactly the tree assembly
// refuses to stage before anything is written.

test('a shard whose concept has no group prefix is refused before staging', (t) => {
  const root = repo(t);
  write(root, 'docs/decisions/use-postgres.md', '# Use PostgreSQL\n');
  const sources = sourcesOf(root);
  const { response: planned } = planWithGroups(run, planner(root, sources), {
    root, placement: { 'docs/decisions/use-postgres.md': 'delivery' },
  });
  const plan = structuredClone(planned.data.plan);
  const mapping = structuredClone(planned.data.mapping);
  plan.entries[0].concept = 'use-postgres';
  mapping[0].concept = 'use-postgres';
  const partitioned = run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'partition',
    payload: {
      cwd: root, plan, mapping, split_review: planned.data.split_review,
    },
  });
  const brief = partitioned.data.shards[0].brief;
  const shard = {
    shard: brief.shard,
    concepts: brief.mapping.map((item) => ({ path: item.path, concept: item.concept, type: item.type, body: `${item.body}\n\nConverted.\n` })),
    warnings: [],
    blockers: [],
  };
  const shardPath = '.okf-staging/shards/root.json';
  write(root, shardPath, JSON.stringify(shard));
  const response = run({
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'assemble',
    payload: {
      cwd: root,
      partition: { shards: partitioned.data.shards, cross_shard_links: partitioned.data.cross_shard_links },
      shards: [{ shard: brief.shard, path: shardPath }],
      group_packages: planned.data.group_packages,
    },
  });

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(response.findings[0].code, 'ASSEMBLY_ROOT_CONCEPT');
  assert.deepEqual(response.findings[0].detail, {
    path: 'use-postgres.md', source: 'docs/decisions/use-postgres.md',
  });
  assert.equal(fs.existsSync(path.join(root, '.okf-staging', 'okf')), false);
});
