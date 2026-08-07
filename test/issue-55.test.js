const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const skills = path.join(repo, 'skills');
const inventory = ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review', 'okf-setup'];
const reachClause = /\bwhen another skill must invoke it\b/i;
// `okf` and `okf-setup` are the two directly-invoked skills: `okf` is the router a user
// selects an operation through, and `okf-setup` accepts no delegation brief (#134). Every
// other inventory member is delegate-only and carries the generic reach clause instead.
const directInvocationSkills = new Set(['okf', 'okf-setup']);
const routerTable = '| Operations | Owner |';
const routerRoutes = [['read', 'okf-read'], ['write', 'okf-write'], ['lifecycle', 'okf-lifecycle'], ['review', 'okf-review'], ['init', 'okf-setup']];

function writeSkill(t, name, source, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-55-'));
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), source);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return directory;
}

function frontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? { text: match[1], body: source.slice(match[0].length) } : null;
}

function field(frontmatterText, name) {
  const match = frontmatterText.match(new RegExp(`^${name}:([^\\r\\n]*)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim();
  if (value === '|' || value === '>') {
    const block = frontmatterText.slice(match.index + match[0].length).match(/^\r?\n(?:[ \t]+.+(?:\r?\n|$))*/);
    return block ? block[0].trim() : '';
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function withoutFencedCode(markdown) {
  let fenced = false;
  return markdown.split(/(?<=\n)/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  }).join('');
}

function withoutInlineCode(markdown) {
  let result = '';
  for (let index = 0; index < markdown.length;) {
    if (markdown[index] !== '`') {
      result += markdown[index++];
      continue;
    }
    let end = index;
    while (markdown[end] === '`') end += 1;
    const delimiter = markdown.slice(index, end);
    const close = markdown.indexOf(delimiter, end);
    if (close === -1) {
      result += delimiter;
      index = end;
    } else {
      index = close + delimiter.length;
    }
  }
  return result;
}

function markdownDestinations(markdown) {
  const destinations = [];
  const pattern = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  for (const match of withoutInlineCode(withoutFencedCode(markdown)).matchAll(pattern)) {
    destinations.push(match[1] === undefined ? match[2] : match[1]);
  }
  return destinations;
}

function scriptReferences(markdown) {
  const visible = withoutFencedCode(markdown).replace(
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (link, enclosed, plain) => isExternal(enclosed ?? plain) ? '' : link,
  );
  return [...visible.matchAll(/\bscripts\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*/g)]
    .map((match) => match[0]);
}

function repeatedNormativeStatements(markdown) {
  const seen = new Set();
  const repeated = [];
  for (const statement of withoutFencedCode(markdown).matchAll(/[^\n]*\b(?:MUST|MUST NOT|SHALL|SHALL NOT)\b[^\n]*/g)) {
    const normalized = statement[0].replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(normalized)) repeated.push(normalized);
    seen.add(normalized);
  }
  return repeated;
}

function routerOwners(markdown) {
  const table = markdown.indexOf(routerTable);
  if (table === -1) return [];
  return [...markdown.slice(table + routerTable.length).matchAll(/^\|\s*`([^`\r\n]+)`\s*\|\s*`([^`\r\n]+)`\s*\|\s*$/gm)]
    .map((match) => [match[1], match[2]]);
}

function validateInventory(directory) {
  const shipped = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return [
    ...inventory.filter((name) => !shipped.includes(name)).map((name) => `SKILL_REQUIRED:${name}`),
    ...shipped.filter((name) => !inventory.includes(name)).map((name) => `SKILL_UNEXPECTED:${name}`),
  ];
}

function isExternal(destination) {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(destination);
}

function existsAt(directory, destination) {
  const file = destination.split(/[?#]/, 1)[0];
  if (!file || isExternal(file)) return true;
  try {
    return fs.existsSync(path.resolve(directory, decodeURIComponent(file)));
  } catch {
    return false;
  }
}

// This validator is intentionally local: skill directories are its only seam.
function validateSkill(directory) {
  const file = path.join(directory, 'SKILL.md');
  if (!fs.existsSync(file)) return ['SKILL_FILE_REQUIRED'];

  const source = fs.readFileSync(file, 'utf8');
  const parsed = frontmatter(source);
  if (!parsed) return ['FRONTMATTER_REQUIRED'];

  const errors = [];
  const name = field(parsed.text, 'name');
  const description = field(parsed.text, 'description');
  const directoryName = path.basename(directory);
  if (!name) errors.push('FRONTMATTER_NAME_REQUIRED');
  else if (name !== directoryName) errors.push('FRONTMATTER_NAME_MISMATCH');
  if (!description) errors.push('FRONTMATTER_DESCRIPTION_REQUIRED');

  if (description) {
    const firstWord = description.match(/^\s*([A-Za-z]+)\b/)?.[1];
    if (!firstWord || !/s$/i.test(firstWord)) errors.push('DESCRIPTION_NOT_THIRD_PERSON');
    if ((description.match(/\bwhen\b/gi) || []).length !== 1) errors.push('DESCRIPTION_TRIGGER_BRANCH_COUNT');
    if (reachClause.test(description)) {
      if (!inventory.includes(directoryName) || directInvocationSkills.has(directoryName)) errors.push('REACH_CLAUSE_FORBIDDEN');
    } else if (inventory.includes(directoryName) && !directInvocationSkills.has(directoryName)) {
      errors.push('REACH_CLAUSE_REQUIRED');
    }
  }

  if (directoryName === 'okf') {
    const routes = routerOwners(parsed.body);
    for (const [operation, owner] of routerRoutes) {
      if (!routes.some(([actualOperation, actualOwner]) => actualOperation === operation && actualOwner === owner)) {
        errors.push(`ROUTER_ROUTE_REQUIRED:${owner}`);
      }
    }
  }

  for (const destination of markdownDestinations(parsed.body)) {
    if (!existsAt(directory, destination)) errors.push(`LINK_NOT_FOUND:${destination}`);
  }
  for (const script of scriptReferences(parsed.body)) {
    if (!existsAt(directory, script)) errors.push(`SCRIPT_NOT_FOUND:${script}`);
  }
  for (const statement of repeatedNormativeStatements(parsed.body)) {
    errors.push(`NORMATIVE_MEANING_REPEATED:${statement}`);
  }
  return errors;
}

function validSkill(name = 'okf-read') {
  const descriptions = {
    okf: 'Routes OKF requests when a user selects an operation.',
    'okf-read': 'Reads admitted OKF bundles when another skill must invoke it.',
    'okf-write': 'Writes bounded OKF updates when another skill must invoke it.',
    'okf-lifecycle': 'Maintains OKF lifecycle work when another skill must invoke it.',
    'okf-review': 'Reviews OKF evidence when another skill must invoke it.',
    'okf-setup': 'Bootstraps an OKF bundle when a user explicitly invokes setup.',
  };
  const dispatch = name === 'okf'
    ? `\n## Dispatch\n\n${routerTable}\n| --- | --- |\n| \`read\` | \`okf-read\` |\n| \`write\` | \`okf-write\` |\n| \`lifecycle\` | \`okf-lifecycle\` |\n| \`review\` | \`okf-review\` |\n| \`init\` | \`okf-setup\` |\n`
    : '';
  return `---\nname: ${name}\ndescription: ${descriptions[name] || 'Reads bounded material when a task requires it.'}\n---\n# Skill\n${dispatch}`;
}

test('rejects absent and empty required frontmatter fields', (t) => {
  const cases = [
    ['absent name', '---\ndescription: Reads material when a task requires it.\n---\n', 'FRONTMATTER_NAME_REQUIRED'],
    ['empty name', '---\nname: ""\ndescription: Reads material when a task requires it.\n---\n', 'FRONTMATTER_NAME_REQUIRED'],
    ['absent description', '---\nname: okf-read\n---\n', 'FRONTMATTER_DESCRIPTION_REQUIRED'],
    ['empty description', '---\nname: okf-read\ndescription: ""\n---\n', 'FRONTMATTER_DESCRIPTION_REQUIRED'],
  ];
  for (const [label, source, error] of cases) {
    assert.ok(validateSkill(writeSkill(t, 'okf-read', source)).includes(error), label);
  }
});

test('rejects a frontmatter name that does not match its skill directory', (t) => {
  assert.ok(validateSkill(writeSkill(t, 'okf-read', validSkill().replace('name: okf-read', 'name: okf-write')))
    .includes('FRONTMATTER_NAME_MISMATCH'));
});

test('rejects each static description violation', (t) => {
  const cases = [
    ['third-person wording', validSkill().replace('Reads admitted', 'Read admitted'), 'DESCRIPTION_NOT_THIRD_PERSON'],
    ['multiple trigger branches', validSkill().replace('when another skill must invoke it', 'when a user requests inspection and when another skill must invoke it'), 'DESCRIPTION_TRIGGER_BRANCH_COUNT'],
  ];
  for (const [label, source, error] of cases) assert.ok(validateSkill(writeSkill(t, 'okf-read', source)).includes(error), label);
});

test('requires reach clauses only for the delegate-only leaf skills', (t) => {
  assert.ok(validateSkill(writeSkill(t, 'okf-read', validSkill().replace('when another skill must invoke it', 'when a task requires it')))
    .includes('REACH_CLAUSE_REQUIRED'));
  assert.ok(validateSkill(writeSkill(t, 'okf', validSkill('okf').replace('when a user selects an operation', 'when another skill must invoke it')))
    .includes('REACH_CLAUSE_FORBIDDEN'));
  assert.ok(validateSkill(writeSkill(t, 'okf-setup', validSkill('okf-setup').replace('when a user explicitly invokes setup', 'when another skill must invoke it')))
    .includes('REACH_CLAUSE_FORBIDDEN'));
});

test('requires each documented dispatch-table operation and owner pair', (t) => {
  assert.deepEqual(validateSkill(writeSkill(t, 'okf', validSkill('okf'))), []);
  assert.ok(validateSkill(writeSkill(t, 'okf', validSkill('okf').replace('| `review` | `okf-review` |', '| `review` | `okf-read` |')))
    .includes('ROUTER_ROUTE_REQUIRED:okf-review'));
  assert.ok(validateSkill(writeSkill(t, 'okf', validSkill('okf')
    .replace('| `read` | `okf-read` |', '| `read` | `okf-write` |')
    .replace('| `write` | `okf-write` |', '| `write` | `okf-read` |')))
    .includes('ROUTER_ROUTE_REQUIRED:okf-read'));
});

test('rejects a broken Markdown relative link but ignores external URLs and anchors', (t) => {
  const source = `${validSkill()}\n[broken](references/missing.md)\n[site](https://okf.md/)\n[section](#skill)\n\`\`[example](ignored.md)\`\`\n\`\`\`md\n[fenced](also-ignored.md)\n\`\`\`\n`;
  assert.deepEqual(validateSkill(writeSkill(t, 'okf-read', source)), ['LINK_NOT_FOUND:references/missing.md']);
});

test('rejects a missing explicit script reference but ignores fenced examples and external links', (t) => {
  assert.deepEqual(validateSkill(writeSkill(t, 'okf-read', `${validSkill()}\nRun \`scripts/check.js\`.\n[external](https://example.test/scripts/ignored.js)\n\n\`\`\`sh\nnode scripts/example.js\n\`\`\`\n`)), [
    'SCRIPT_NOT_FOUND:scripts/check.js',
  ]);
});

test('resolves Markdown links and explicit script references from the skill directory', (t) => {
  const source = `${validSkill()}\n[reference](references/rule.md)\nRun \`scripts/check.js\`.\n`;
  assert.deepEqual(validateSkill(writeSkill(t, 'okf-read', source, {
    'references/rule.md': '# Rule\n',
    'scripts/check.js': 'process.exitCode = 0;\n',
  })), []);
});

test('rejects a repeated normative statement', (t) => {
  const statement = 'Agents MUST record the observed evidence.';
  assert.ok(validateSkill(writeSkill(t, 'okf-read', `${validSkill()}\n${statement}\n${statement}\n`))
    .includes(`NORMATIVE_MEANING_REPEATED:${statement.toLowerCase()}`));
});

test('defines the required skill inventory with fixtures', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-55-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of inventory) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'SKILL.md'), validSkill(name));
  }
  assert.deepEqual(validateInventory(root), []);
  fs.rmSync(path.join(root, 'okf-review'), { recursive: true });
  assert.deepEqual(validateInventory(root), ['SKILL_REQUIRED:okf-review']);
  fs.mkdirSync(path.join(root, 'extra'));
  assert.deepEqual(validateInventory(root), ['SKILL_REQUIRED:okf-review', 'SKILL_UNEXPECTED:extra']);
});

test('validates the exact shipped inventory before each skill', () => {
  assert.deepEqual(validateInventory(skills), [], 'skills inventory');
  for (const name of inventory) {
    const directory = path.join(skills, name);
    assert.deepEqual(validateSkill(directory), [], path.relative(repo, directory));
  }
});
