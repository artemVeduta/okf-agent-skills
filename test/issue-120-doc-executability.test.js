const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const protocol = require('../scripts/lib/protocol');
const runtime = require('../scripts/lib/runtime');

const repo = path.join(__dirname, '..');
const skillsRoot = path.join(repo, 'skills');
const skills = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// Per-operation payload fields come from protocol.js instead of being duplicated here.
// The third top-level field, `invocation`, has no code here: parseRequest refuses a
// `sync` that omits it before the runtime runs, so runWrapper's exit-0 assertion catches it.
const TOP_LEVEL_FIELD_CODES = new Set(['TASK_KIND_NOT_WRITE_ELIGIBLE', 'INVALID_SCOPE']);
const FIXTURE_KEYS = new Set(['cwd', 'bundle', 'concept', 'target']);

function skillDoc(name) {
  return fs.readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
}

// Every fenced `json` block in a SKILL.md that parses as an okf-wrapper/1 request.
function wrapperExamples(markdown) {
  const examples = [];
  for (const match of markdown.matchAll(/```json\n([\s\S]*?)```/g)) {
    let value;
    try {
      value = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (value && value.protocol === 'okf-wrapper/1') examples.push(value);
  }
  return examples;
}

function isPlaceholder(value) {
  return typeof value === 'string' && /^<.*>$/.test(value);
}

// `today` is documented as optional (skills/okf-review/SKILL.md), and so are
// `project_mode`, `manifest`, `workspace_id`, `mappings`, and `answers`
// (skills/okf-setup/SKILL.md); any other placeholder this fixture can't fill is a
// doc/runtime mismatch, not something to hide.
const OPTIONAL_PLACEHOLDER_KEYS = new Set(['today', 'project_mode', 'manifest', 'workspace_id', 'mappings', 'answers']);

function fixtureRequest(example, fixture) {
  const payload = {};
  for (const [key, value] of Object.entries(example.payload || {})) {
    if (FIXTURE_KEYS.has(key)) {
      payload[key] = fixture[key];
    } else if (isPlaceholder(value)) {
      assert.ok(OPTIONAL_PLACEHOLDER_KEYS.has(key), `${example.operation}'s example payload.${key} is a placeholder ("${value}") this fixture cannot fill`);
    } else {
      payload[key] = value;
    }
  }
  const request = { ...example, payload };
  if (request.scope && Array.isArray(request.scope.concepts)) {
    request.scope = { ...request.scope, concepts: request.scope.concepts.map((value) => (isPlaceholder(value) ? fixture.concept : value)) };
  }
  return request;
}

function bundle(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-120-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  return root;
}

function fixtureFor(root) {
  return { cwd: root, bundle: root, concept: 'note.md', target: 'note.md' };
}

function runWrapper(skill, request) {
  const wrapper = path.join(repo, 'scripts', `${skill}.js`);
  const result = cp.spawnSync(process.execPath, [wrapper], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.equal(result.status, 0, `${skill} rejected the request as invalid wrapper input: ${result.stderr}`);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('every skill doc is accounted for: which carry a request example and which do not', () => {
  const withExample = new Set();
  const withoutExample = [];
  for (const name of skills) {
    if (wrapperExamples(skillDoc(name)).length > 0) withExample.add(name);
    else withoutExample.push(name);
  }
  // Every skill runtime.routerOwners names as an owner performs an operation directly
  // and must carry an example; a skill that owns nothing (the `okf` router) is not held
  // to that bar, so gaining or losing an example never flips this assertion by accident.
  const leafSkills = new Set(runtime.routerOwners.values());
  const missingExample = [...leafSkills].filter((name) => !withExample.has(name)).sort();
  assert.deepEqual(missingExample, [], `a leaf skill with no request example is a gap, not a silently accepted state (currently without one: ${withoutExample.join(', ') || 'none'})`);
});

// Most skills document exactly one operation with one example. `okf-setup` owns
// five (#138: `init`, `inspect`, `repair`; #135: `plan`, `aggregate`), each with its
// own example, so this runs once per documented example rather than assuming one
// example per skill.
for (const name of skills) {
  const examples = wrapperExamples(skillDoc(name));
  const operations = examples.map((example) => example.operation);
  assert.deepEqual(operations, [...new Set(operations)], `${name}/SKILL.md documents more than one okf-wrapper/1 example for the same operation`);

  for (const example of examples) {
    test(`${name}'s documented request example for ${example.operation} is not blocked by a gate it could have satisfied`, (t) => {
      const root = bundle(t);
      const request = fixtureRequest(example, fixtureFor(root));

      const required = protocol.requiredPayload.get(example.operation) || [];
      for (const key of required) {
        assert.ok(typeof request.payload[key] === 'string' && request.payload[key] !== '', `${name}'s example for ${example.operation} omits payload.${key} after fixture substitution, required per scripts/lib/protocol.js`);
      }

      const response = runWrapper(example.skill, request);
      const code = response.data && response.data.code;
      if (response.result === 'blocked' && TOP_LEVEL_FIELD_CODES.has(code)) {
        const finding = response.findings.find((item) => item.code === code);
        assert.fail(`${name} (${example.operation}): blocked by ${code} (gate: ${finding && finding.detail && finding.detail.gate}) — the documented example could have named this top-level field itself`);
      }
    });
  }
}

// enumerate and validate are the only okf-read operations whose SKILL.md bullet
// documents a `payload.bundle` this fixture can resolve directly, with no workspace
// manifest and no `payload.candidates` the doc never mentions. resolve, read, and
// search need one of those to admit anything, and checking them here would mean
// inventing candidate data the doc does not document, so they are left unchecked.
const SELF_LOCATING_OPERATIONS = {
  enumerate(response) {
    const gap = response.findings.find((item) => item.code === 'unreadable' && item.detail && item.detail.reason === 'no_admitted_bundle');
    assert.equal(gap, undefined, 'found no admitted bundle');
  },
  validate(response) {
    assert.equal(response.result, 'ok', `got result "${response.result}" instead of "ok" — no admitted bundle for the documented payload`);
  },
};

function documentedOperationBullets(markdown) {
  const bullets = new Map();
  for (const match of markdown.matchAll(/^- `(\w+)` — (.+)$/gm)) bullets.set(match[1], match[2]);
  return bullets;
}

test("okf-read's self-locating entries name a key that makes the result usable", (t) => {
  const bullets = documentedOperationBullets(skillDoc('okf-read'));
  const root = bundle(t);
  const fixture = fixtureFor(root);

  for (const [operation, checkAdmitted] of Object.entries(SELF_LOCATING_OPERATIONS)) {
    const text = bullets.get(operation);
    assert.ok(text, `okf-read/SKILL.md must document the ${operation} operation`);
    const payload = {};
    for (const match of text.matchAll(/`payload\.(\w+)`/g)) {
      if (Object.hasOwn(fixture, match[1])) payload[match[1]] = fixture[match[1]];
    }

    const response = runWrapper('okf-read', { protocol: 'okf-wrapper/1', skill: 'okf-read', operation, payload });
    checkAdmitted(response);
  }
});
