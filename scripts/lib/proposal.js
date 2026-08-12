/*
 * #156/#160: the target bundle proposal.
 *
 * The complete, read-only migration plan setup presents after the accepted source
 * scope and semantic planning, and before partition or transformation. Its
 * authoritative record is three tables -- one row per source disposition, one per
 * output concept, one per concept group -- and the tree is only a derived view of
 * them. Nothing downstream of this module invents a target: the accepted proposal
 * binds every output's Concept ID, type, content scope, source anchors, group,
 * target path, provenance assignment, and link decisions before a worker ever sees
 * a brief.
 *
 * Two rules give the module its shape:
 *
 *   - **Type never determines path (#160).** `mapping.js` supplies only a default
 *     basename. Every concept sits at the bundle root or inside a named
 *     reader-purpose group the user declared, and every group carries a
 *     navigation-only `index.md` derived from that group's accepted purpose and its
 *     own child entries. There is no type directory and no source-path mirror.
 *   - **Acceptance is one complete decision.** A proposal with an unresolved
 *     disposition, collision, split provenance, group purpose, or ambiguous link
 *     cannot be accepted; a requested change simply produces a new complete
 *     proposal. Acceptance lives in the caller's own session -- this module issues
 *     no token, writes no state, and remembers nothing between calls.
 *
 * Structural evidence (`./evidence.js`) reaches this module as hints only. A fact
 * annotates the rows an explicit user choice already produced; it never creates a
 * group, moves a concept, or resolves a question.
 */

const path = require('node:path');
const mapping = require('./mapping');
const migration = require('./migration');
const evidence = require('./evidence');
const connector = require('./connector');
const validation = require('./validation');

// ------------------------------------------------------------------ input shapes

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

// A group id is a bundle-relative directory: one or more plain path segments, no
// leading slash, no `.`/`..`, no extension. It is a name a user chose, never a
// source directory this module read off disk.
const GROUP_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validGroupId(value) {
  if (!nonEmptyString(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => GROUP_SEGMENT.test(segment) && segment !== '.' && segment !== '..');
}

const CONCEPT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validGroupDeclaration(item) {
  return isPlainObject(item) && validGroupId(item.group) && nonEmptyString(item.purpose);
}

function validPlacement(value) {
  if (!isPlainObject(value)) return false;
  if (value.group !== undefined && value.group !== '' && !validGroupId(value.group)) return false;
  if (value.name !== undefined && !CONCEPT_NAME.test(String(value.name))) return false;
  return true;
}

function validSplitOutput(item) {
  if (!isPlainObject(item)) return false;
  if (!CONCEPT_NAME.test(String(item.name || ''))) return false;
  if (!nonEmptyString(item.type) || !nonEmptyString(item.content_scope)) return false;
  if (item.group !== undefined && item.group !== '' && !validGroupId(item.group)) return false;
  if (item.provenance !== undefined && item.provenance !== 'inherit' && item.provenance !== 'none') return false;
  return item.anchor === undefined || nonEmptyString(item.anchor);
}

// Every revision field is optional; an ill-formed one is refused outright rather
// than partially applied, so a proposal is never built from half a decision.
function validRevision(revision) {
  if (revision === undefined) return true;
  if (!isPlainObject(revision)) return false;
  if (revision.groups !== undefined && (!Array.isArray(revision.groups) || !revision.groups.every(validGroupDeclaration))) return false;
  if (revision.placements !== undefined) {
    if (!isPlainObject(revision.placements)) return false;
    if (!Object.values(revision.placements).every(validPlacement)) return false;
  }
  if (revision.splits !== undefined) {
    if (!isPlainObject(revision.splits)) return false;
    for (const outputs of Object.values(revision.splits)) {
      if (!Array.isArray(outputs) || outputs.length < 2 || !outputs.every(validSplitOutput)) return false;
    }
  }
  if (revision.link_decisions !== undefined) {
    if (!isPlainObject(revision.link_decisions)) return false;
    if (!Object.values(revision.link_decisions).every(nonEmptyString)) return false;
  }
  return true;
}

// -------------------------------------------------------------------- questions

function question(id, kind, prompt, options = null) {
  return { id, kind, prompt, options };
}

// ------------------------------------------------------------------ group indexes

// A group's navigation-only `index.md`: its accepted purpose and its own child
// entries, and nothing else. No frontmatter -- a nested `index.md` is reserved
// navigation and never a concept (the rule `validation.validateRead` enforces
// unconditionally on the staged bundle).
function renderIndex(group, purpose, children) {
  const title = group.split('/').pop();
  const lines = [`# ${title}`, '', purpose, ''];
  for (const child of children) lines.push(`- [${child.label}](${child.href})`);
  return `${lines.join('\n')}\n`;
}

// -------------------------------------------------------------------- link scan

// Every internal link a migrating source's own body makes, resolved back to the
// source it names. Reuses `validation.markdownLinks`/`bodyLinkPath` -- the same
// non-fenced, non-inline-code, non-image scan `mapping.rewriteLinks` itself is
// built on -- so a link this reports is exactly a link that rewriting can reach.
function internalLinks(sourcePath, body, migratingPaths) {
  const targets = [];
  for (const raw of validation.markdownLinks(body)) {
    const targetPath = validation.bodyLinkPath(raw);
    if (!targetPath) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), targetPath));
    if (migratingPaths.has(resolved) && !targets.includes(resolved)) targets.push(resolved);
  }
  return targets;
}

// ---------------------------------------------------------------------- outputs

// One row per output concept. A source with no split declaration produces exactly
// one output, at the bundle root unless a placement names a group; a split
// declaration produces one output per named part, each with its own exact Concept
// ID, type, and bounded content scope before any transformation begins.
function buildOutputs(entries, revision, read, questions) {
  const placements = revision.placements || {};
  const splits = revision.splits || {};
  const rows = [];

  for (const entry of entries) {
    if (entry.disposition !== 'migrate') continue;
    const placement = placements[entry.path] || {};
    const declared = splits[entry.path];
    const { tree, body } = read(entry.path);
    const inherited = mapping.extractProvenance(tree);

    if (!declared) {
      const group = placement.group || '';
      const name = placement.name || entry.concept;
      rows.push({
        source: entry.path,
        group,
        name,
        type: entry.type,
        content_scope: 'whole_document',
        anchor: null,
        provenance: inherited,
        provenance_assignment: inherited ? 'inherited' : 'none',
      });
      continue;
    }

    for (const output of declared) {
      // A split source that declares provenance of its own forces the decision:
      // #131's provenance rule cannot be satisfied by inheriting the same entries
      // into every part by default, so each part states `inherit` or `none`.
      if (inherited && output.provenance === undefined) {
        questions.push(question(
          `split:${entry.path}:${output.name}`,
          'split_provenance',
          `${entry.path} declares provenance and is split into several concepts. State whether "${output.name}" inherits that provenance ("inherit") or carries none ("none").`,
          ['inherit', 'none'],
        ));
      }
      const carries = inherited && output.provenance === 'inherit';
      rows.push({
        source: entry.path,
        group: output.group || placement.group || '',
        name: output.name,
        type: output.type,
        content_scope: output.content_scope,
        anchor: output.anchor && body.includes(output.anchor) ? output.anchor : null,
        provenance: carries ? inherited : null,
        provenance_assignment: carries ? 'inherited' : output.provenance === 'none' ? 'none_explicit' : 'undecided',
      });
    }
  }

  return rows.map((row, index) => {
    const concept = row.group ? `${row.group}/${row.name}` : row.name;
    return {
      id: `o${index + 1}`,
      origin: 'migration',
      source: row.source,
      concept,
      type: row.type,
      group: row.group,
      name: row.name,
      target_path: `${concept}.md`,
      content_scope: row.content_scope,
      source_anchors: row.anchor ? [row.anchor] : [],
      provenance: row.provenance,
      provenance_assignment: row.provenance_assignment,
      evidence: [],
      links: [],
    };
  });
}

// ----------------------------------------------------------------------- groups

// Every group an output or another group names, with the purpose the user declared
// for it and its own child entries. A group with no declared purpose, and a
// declared group nothing ever lands in, are both unresolved -- neither is guessed
// at and neither is silently dropped.
function buildGroups(outputs, revision, questions) {
  const purposes = new Map((revision.groups || []).map((item) => [item.group, item.purpose]));
  const used = new Set();
  for (const output of outputs) {
    const segments = output.group === '' ? [] : output.group.split('/');
    for (let i = 1; i <= segments.length; i += 1) used.add(segments.slice(0, i).join('/'));
  }
  for (const group of purposes.keys()) used.add(group);

  const groups = [...used].sort().map((group) => {
    const children = [
      ...[...used]
        .filter((other) => other !== group && path.posix.dirname(other) === group)
        .map((other) => ({ label: other.split('/').pop(), href: `${other.split('/').pop()}/index.md`, kind: 'group' })),
      ...outputs
        .filter((output) => output.group === group)
        .map((output) => ({ label: output.name, href: `${output.name}.md`, kind: 'concept' })),
    ].sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0));
    return { group, purpose: purposes.get(group) || null, children, index_path: `${group}/index.md` };
  });

  for (const item of groups) {
    if (item.purpose === null) {
      questions.push(question(
        `group:${item.group}`,
        'group_purpose',
        `Group "${item.group}" has no accepted reader purpose. State the purpose it serves, or place its concepts elsewhere.`,
      ));
    }
    if (item.children.length === 0) {
      questions.push(question(
        `group-empty:${item.group}`,
        'group_empty',
        `Group "${item.group}" holds no concept and no child group. Place at least one concept in it, or remove it from the proposal.`,
      ));
    }
  }
  return groups;
}

// ------------------------------------------------------------------- collisions

function collisionQuestions(outputs, navigation, bundleRoot, services, questions) {
  // A default basename comes from a source filename, which may not be a usable
  // concept name at all. That is asked about, never silently rewritten.
  for (const output of outputs) {
    if (CONCEPT_NAME.test(output.name)) continue;
    questions.push(question(
      `name:${output.id}`,
      'target_invalid',
      `"${output.name}" is not a usable concept name for ${output.source || output.target_path}. Name the concept explicitly.`,
    ));
  }

  const claims = new Map();
  for (const item of [...outputs.map((o) => ({ path: o.target_path, by: o.id })), ...navigation.map((n) => ({ path: n.path, by: n.origin }))]) {
    if (!claims.has(item.path)) claims.set(item.path, []);
    claims.get(item.path).push(item.by);
  }
  for (const [target, by] of [...claims].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (by.length > 1) {
      questions.push(question(
        `collision:${target}`,
        'target_collision',
        `${target} is claimed by more than one proposal row (${by.join(', ')}). Give each row a distinct name or group, or drop one from the proposal.`,
      ));
      continue;
    }
    if (services.exists(path.join(bundleRoot, target))) {
      questions.push(question(
        `collision:${target}`,
        'target_collision',
        `${target} already exists in the bundle. ${by[0]} cannot overwrite, merge with, or rename around it -- give it a distinct target, or drop it from the proposal.`,
      ));
    }
  }
}

// ------------------------------------------------------------------------- tree

// The derived view: concept groups, concept paths, and each navigation-only
// `index.md`. It helps a reader inspect the planned structure; the tables above
// remain authoritative.
function buildTree(paths) {
  // A connector row and its own navigation file name the same file, not two.
  const files = [...new Set(paths)];
  const lines = [];
  const walk = (prefix, depth) => {
    const here = files.filter((file) => path.posix.dirname(file) === (prefix === '' ? '.' : prefix));
    const directories = [...new Set(files
      .filter((file) => (prefix === '' ? true : file.startsWith(`${prefix}/`)))
      .map((file) => path.posix.dirname(file))
      .filter((dir) => dir !== '.' && dir !== prefix)
      .map((dir) => (prefix === '' ? dir.split('/')[0] : `${prefix}/${dir.slice(prefix.length + 1).split('/')[0]}`)))].sort();
    for (const file of here.sort()) lines.push(`${'  '.repeat(depth)}${path.posix.basename(file)}`);
    for (const dir of directories) {
      lines.push(`${'  '.repeat(depth)}${path.posix.basename(dir)}/`);
      walk(dir, depth + 1);
    }
  };
  walk('', 0);
  return lines;
}

// ------------------------------------------------------------------ evidence use

// A fact is bound to the rows a user's own explicit choice already produced --
// never the other way round. `consumed_by` is what Task 3's dual-role report reads
// to name the exact proposal row a structural fact stood next to.
function bindEvidence(facts, outputs) {
  const byId = new Map(outputs.map((item) => [item.id, item]));
  for (const item of facts) {
    const consumed = outputs.filter((output) => (
      item.kind === 'group_suggestion' ? output.group !== '' && output.group.split('/').pop() === item.term
        : item.kind === 'domain_term' ? output.name === item.term
          : output.source === item.file
    )).map((output) => output.id);
    item.consumed_by = consumed;
    for (const id of consumed) byId.get(id).evidence.push(item.id);
  }
}

// ------------------------------------------------------------------------ build

/*
 * `plan` is exactly `migration-plan`'s own executable `data.plan`, unmodified, and
 * `selected` the discovery inventory the user accepted as the migration scope. The
 * result is one complete proposal: a caller that wants a different structure calls
 * again with a changed `revision`, and gets a new complete proposal, never a patch
 * applied to a remembered one.
 */
function build({ plan, selected, revision = {}, gitRoot, bundleRoot, services }) {
  const cache = new Map();
  const read = (sourcePath) => {
    if (!cache.has(sourcePath)) cache.set(sourcePath, migration.readSource(gitRoot, sourcePath, services));
    return cache.get(sourcePath);
  };

  const questions = [];
  const entries = plan.entries;
  const migratingPaths = new Set(entries.filter((item) => item.disposition === 'migrate').map((item) => item.path));

  // A complete source-disposition table is a precondition of acceptance: an
  // accepted source with no plan entry at all is asked about, never assumed
  // out of scope.
  const disposed = new Set(entries.map((item) => item.path));
  for (const item of [...new Set(selected.map((source) => source.path))].sort()) {
    if (disposed.has(item)) continue;
    questions.push(question(
      `disposition:${item}`,
      'source_disposition_missing',
      `${item} is in the accepted source scope but carries no disposition. Give it one before this proposal can be accepted.`,
    ));
  }

  const outputs = buildOutputs(entries, revision, read, questions);
  const groups = buildGroups(outputs, revision, questions);

  // Link decisions. A link into a source this proposal splits has no single
  // target, so it is decided explicitly or it stays open.
  const outputsBySource = new Map();
  for (const output of outputs) {
    if (!outputsBySource.has(output.source)) outputsBySource.set(output.source, []);
    outputsBySource.get(output.source).push(output);
  }
  const decisions = revision.link_decisions || {};
  const chosen = new Map(); // source path -> the one concept a link to it resolves to
  for (const [source, rows] of outputsBySource) {
    if (rows.length === 1) {
      chosen.set(source, rows[0].concept);
      continue;
    }
    const decided = decisions[source];
    if (decided && rows.some((row) => row.concept === decided)) chosen.set(source, decided);
  }

  for (const output of outputs) {
    const { body } = read(output.source);
    for (const target of internalLinks(output.source, body, migratingPaths)) {
      const to = chosen.get(target);
      output.links.push({ target_source: target, target_concept: to || null, decision: to ? 'rewritten' : 'ambiguous' });
      if (!to) {
        questions.push(question(
          `link:${target}`,
          'link_ambiguous',
          `A link points at ${target}, which this proposal splits into ${outputsBySource.get(target).map((row) => row.concept).join(', ')}. Name the concept such a link resolves to.`,
          outputsBySource.get(target).map((row) => row.concept),
        ));
      }
    }
  }

  // Navigation: one `index.md` per group, plus the agent connector when the
  // bundle it is proposed for does not carry it yet (#170 gives it to a *new*
  // root through `init`; an existing root gets it here, through the proposal).
  const navigation = groups
    .filter((item) => item.purpose !== null)
    .map((item) => ({ path: item.index_path, origin: `group:${item.group}`, body: renderIndex(item.group, item.purpose, item.children) }));
  const connectorRows = [];
  if (services.exists(bundleRoot) && !services.exists(path.join(bundleRoot, 'agents', 'okf.md'))) {
    for (const [file, body] of connector.FILES) {
      if (services.exists(path.join(bundleRoot, file))) continue;
      navigation.push({ path: file, origin: 'connector', body });
      connectorRows.push({
        id: `c${connectorRows.length + 1}`,
        origin: 'connector',
        source: null,
        group: 'agents',
        name: path.posix.basename(file, '.md'),
        type: file === 'agents/okf.md' ? 'Playbook' : null,
        concept: file.slice(0, -3),
        target_path: file,
        content_scope: 'connector_text',
        source_anchors: [],
        provenance: null,
        provenance_assignment: 'none',
        evidence: [],
        links: [],
      });
    }
  }

  const groupIndexes = navigation.filter((item) => item.origin.startsWith('group:'));
  collisionQuestions([...outputs, ...connectorRows], groupIndexes, bundleRoot, services, questions);

  // Evidence is non-authoritative (#176), so its advisories are reported beside
  // the proposal and never gate acceptance of it.
  const structural = evidence.collect(gitRoot, selected, migratingPaths, services);
  bindEvidence(structural.facts, outputs);

  const sources = entries.map((item) => ({
    path: item.path,
    disposition: item.disposition,
    reason: item.reason,
    outputs: outputs.filter((output) => output.source === item.path).map((output) => output.id),
  }));

  // The partition-ready projection of the accepted proposal: exactly the shapes
  // `partition` already consumes, with the accepted target paths and each body's
  // links rewritten against them.
  const projectedEntries = [
    ...entries.filter((item) => item.disposition !== 'migrate'),
    ...outputs.map((output) => ({
      path: output.source,
      disposition: 'migrate',
      reason: entries.find((item) => item.path === output.source).reason,
      concept: output.concept,
      type: output.type,
    })),
  ];
  const projectedMapping = outputs.map((output) => {
    const conceptOf = new Map([...chosen, [output.source, output.concept]]);
    return {
      path: output.source,
      concept: output.concept,
      type: output.type,
      sources: output.provenance,
      // The accepted content boundary, carried to the worker that authors this
      // output. Without it a split's parts would reach two fresh-context workers
      // with the identical whole body and produce two duplicate concepts.
      content_scope: output.content_scope,
      source_anchors: output.source_anchors,
      body: mapping.rewriteLinks(output.source, read(output.source).body, conceptOf),
    };
  });

  const acceptable = questions.length === 0;
  return {
    proposal: { sources, outputs: [...outputs, ...connectorRows], groups },
    tree: buildTree([...outputs, ...connectorRows].map((item) => item.target_path).concat(navigation.map((item) => item.path))),
    navigation,
    evidence: structural.facts,
    evidence_advisories: structural.advisories,
    questions,
    acceptable,
    plan: { entries: projectedEntries, executable: acceptable },
    mapping: projectedMapping,
  };
}

// `renderIndex` is exported for exactly one reason (#180): the conformance gate
// re-derives an accepted group index from the same renderer that produced it, so a
// staged or published `index.md` is compared against this module's own output rather
// than against a second renderer's idea of the same body.
module.exports = { build, validRevision, renderIndex };
