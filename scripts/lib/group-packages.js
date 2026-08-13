/*
 * #203 (#202): folder-local concept-group packages.
 *
 * #202 settled that every substantive concept belongs to an approved concept
 * group -- a bundle subdirectory for one bounded, current reader-purpose area --
 * and that the direct bundle root carries only the required `index.md` and an
 * optional `log.md`. This module owns the *rules* of that accepted package set:
 * what a legal group key is, which group-local files a touched group must take a
 * disposition on, which group owns a term's canonical definition, and which exact
 * navigation index rows the accepted set derives.
 *
 * It is a sibling of `mapping.js` in the same sense `mapping.js` is a sibling of
 * `migration.js`: `setup.js` orchestrates, this module answers "is this accepted
 * package set coherent, and what does it derive". It never reads a source, never
 * writes anything, and never selects a group for a caller -- #202 keeps reader
 * purpose, semantic placement, term ownership, and term meaning human decisions,
 * so a source with no accepted group asks (`migration.js`'s own
 * `reader_purpose_group` question), it is never inferred from a type, a source
 * path, a file count, or a directory depth.
 *
 * Every finding this module returns blocks. There is no repair: #202's own
 * "any change creates one new complete proposal" posture applies here exactly as
 * #200's does to a split accounting.
 */

const path = require('node:path');

const INDEX_FILE = 'index.md';
const GLOSSARY_FILE = 'glossary.md';
const LOG_FILE = 'log.md';

// The four group-local files #202 names. `index` is required of every touched
// group; the other three are only ever present when the group genuinely has that
// need, which is why `none` -- an explicit "this group owns no local terms", "no
// current local guidance", "no independent audit need" -- is a first-class
// disposition rather than an omitted field.
const FILE_ROLES = ['index', 'glossary', 'guidance', 'log'];

const DISPOSITIONS = new Set(['created', 'updated', 'unchanged', 'none']);

const SEGMENT = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function only(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => fields.includes(key));
}

function validTerm(item) {
  return only(item, ['term', 'scope']) && isText(item.term)
    && (item.scope === null || isText(item.scope));
}

function validLink(item) {
  return only(item, ['term', 'owner']) && isText(item.term) && isText(item.owner);
}

function validChild(item) {
  if (!only(item, ['kind', 'concept_id', 'group', 'title', 'order'])) return false;
  if (!isText(item.title) || !Number.isInteger(item.order)) return false;
  if (item.kind === 'concept') return isText(item.concept_id) && item.group === undefined;
  if (item.kind === 'group') return isText(item.group) && item.concept_id === undefined;
  return false;
}

// A group-local file is never *authored* by a migration: a `created` glossary or
// guidance concept is one of this migration's own accepted outputs, landing at
// that exact path, so the disposition names the accepted output rather than
// carrying content of its own. `unchanged` and `none` write nothing at all.
function validRole(value, role) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!DISPOSITIONS.has(value.disposition)) return false;
  if (role === 'index') {
    return only(value, ['disposition', 'title']) && value.disposition !== 'none' && isText(value.title);
  }
  if (role === 'guidance') {
    if (!only(value, ['disposition', 'concept_id'])) return false;
    return value.disposition === 'none' ? value.concept_id === undefined : isText(value.concept_id);
  }
  if (role === 'log') return only(value, ['disposition']);
  if (!only(value, ['disposition', 'terms'])) return false;
  return value.terms === undefined || (Array.isArray(value.terms) && value.terms.every(validTerm));
}

function validPackage(item) {
  if (!only(item, ['group', 'purpose', 'index', 'glossary', 'guidance', 'log', 'children', 'linked_terms'])) return false;
  if (!isText(item.group) || !isText(item.purpose)) return false;
  if (!FILE_ROLES.every((role) => validRole(item[role], role))) return false;
  if (!Array.isArray(item.children) || !item.children.every(validChild)) return false;
  return item.linked_terms === undefined
    || (Array.isArray(item.linked_terms) && item.linked_terms.every(validLink));
}

function validRootPackage(value) {
  if (!only(value, ['purpose', 'index', 'log', 'children'])) return false;
  if (!isText(value.purpose) || !validRole(value.index, 'index') || !validRole(value.log, 'log')) return false;
  return Array.isArray(value.children) && value.children.every(validChild);
}

// Shape only. A malformed value is `UNSUPPORTED_INPUT` before anything is
// computed, the same discipline every other `migration-plan` payload field has.
function validPayload(packages, rootPackage) {
  if (packages !== undefined && (!Array.isArray(packages) || !packages.every(validPackage))) return false;
  return rootPackage === undefined || validRootPackage(rootPackage);
}

// The accepted concept-group artifact every later seam carries, exactly as
// `migration-plan` returned it: the accepted packages, the accepted root package,
// and the derived index rows both navigation rendering and conformance read.
function validAccepted(value) {
  if (!only(value, ['packages', 'root', 'indexes'])) return false;
  if (!Array.isArray(value.packages) || !value.packages.every(validPackage)) return false;
  if (!validRootPackage(value.root)) return false;
  return Array.isArray(value.indexes) && value.indexes.every((item) => only(item, ['key', 'purpose', 'index_entry', 'child_entries'])
    && typeof item.key === 'string' && isText(item.purpose)
    && only(item.index_entry, ['path', 'title']) && isText(item.index_entry.path) && isText(item.index_entry.title)
    && Array.isArray(item.child_entries)
    && item.child_entries.every((child) => only(child, ['concept_id', 'path', 'title', 'order'])
      && isText(child.concept_id) && isText(child.path) && isText(child.title) && Number.isInteger(child.order)));
}

function finding(code, detail) {
  return { code, detail };
}

function groupFile(group, file) {
  return group === '' ? file : `${group}/${file}`;
}

function parentOf(group) {
  const at = group.lastIndexOf('/');
  return at === -1 ? null : group.slice(0, at);
}

// A concept's own group is the directory its accepted concept path already names
// -- the one place placement is ever read from, so nothing downstream can drift
// into deriving a group from a type or a source path again.
function groupOf(conceptPath) {
  const dir = path.posix.dirname(conceptPath);
  return dir === '.' ? '' : dir;
}

function keyFindings(group) {
  if (group.split('/').some((segment) => !SEGMENT.test(segment))) {
    return [finding('GROUP_PACKAGE_KEY_INVALID', { group })];
  }
  // #202: term ownership is canonical and local. A general `shared/` area is the
  // exact fallback that decision refuses, so it is refused by name rather than
  // left to be re-invented per migration.
  if (group.split('/')[0] === 'shared') return [finding('GROUP_SHARED_FALLBACK', { group })];
  return [];
}

// A disposition is a claim about two things at once: the bundle as it is right
// now, and this migration's own accepted output set. `created` needs the target
// absent and an accepted output landing on it; `updated`/`unchanged` need the
// target present and no output landing on it; `none` -- the explicit
// no-local-terms, no-local-guidance, no-local-log result -- needs it absent and
// unclaimed either way. Nothing here repairs a mismatch; it names it.
function dispositionFindings(group, role, value, outputs, bundleRoot, services) {
  if (role === 'log' && value.disposition !== 'none' && value.disposition !== 'unchanged') {
    // ponytail: setup migration publishes no log. #202 gives a group a `log.md`
    // only for a real independent audit need, which is a decision about ongoing
    // history rather than an artifact of one migration; the upgrade path is a
    // lifecycle `log-append` effect, not a staged migration candidate.
    return [finding('GROUP_PACKAGE_DISPOSITION_UNSUPPORTED', { group, file: role, disposition: value.disposition })];
  }
  if (role === 'glossary' && value.disposition === 'updated') {
    // Same ceiling: a migration creates a group's glossary out of a selected
    // Glossary source or leaves it alone. Rewriting an existing glossary in place
    // is lifecycle work with its own review unit (#202).
    return [finding('GROUP_PACKAGE_DISPOSITION_UNSUPPORTED', { group, file: role, disposition: value.disposition })];
  }
  if (role === 'guidance' && value.disposition !== 'none' && !value.concept_id.startsWith(`${group}/`)) {
    return [finding('GROUP_PACKAGE_PLACEMENT_INVALID', { group, file: role, target_path: `${value.concept_id}.md` })];
  }
  if (role === 'guidance' && value.disposition === 'none') return [];
  const file = groupFile(group, role === 'glossary' ? GLOSSARY_FILE : role === 'log' ? LOG_FILE : INDEX_FILE);
  const target = role === 'guidance' ? `${value.concept_id}.md` : file;
  const findings = [];
  const exists = services.exists(path.join(bundleRoot, ...target.split('/')));
  const wanted = value.disposition === 'created' ? false : value.disposition !== 'none';
  if (exists !== wanted) {
    findings.push(finding('GROUP_PACKAGE_DISPOSITION_INVALID', {
      group, file: role, disposition: value.disposition, target_path: target,
    }));
  }
  // A navigation index is never a substantive output, so no accepted output may
  // ever land on one, whatever its disposition.
  const claimed = outputs.has(target);
  if (claimed !== (role !== 'index' && value.disposition === 'created')) {
    findings.push(finding('GROUP_PACKAGE_OUTPUT_MISMATCH', {
      group, file: role, disposition: value.disposition, target_path: target,
    }));
  }
  return findings;
}

function termFindings(packages) {
  const findings = [];
  const owners = new Map(); // term -> [{ group, scope }]
  for (const item of packages) {
    const terms = item.glossary.terms || [];
    if (item.glossary.disposition === 'none' && terms.length > 0) {
      findings.push(finding('GROUP_GLOSSARY_TERMS_MISMATCH', { group: item.group }));
    }
    for (const term of terms) {
      if (!owners.has(term.term)) owners.set(term.term, []);
      owners.get(term.term).push({ group: item.group, scope: term.scope ?? null });
    }
  }
  for (const [term, claims] of owners) {
    if (claims.length === 1) continue;
    // #202: one shared meaning has exactly one canonical owner. Two owners are
    // legal only as two *separate* meanings, and only when each states its own
    // explicit scope -- so an unscoped or repeated scope is a real conflict.
    const scopes = claims.map((claim) => claim.scope);
    if (scopes.some((scope) => scope === null) || new Set(scopes).size !== scopes.length) {
      findings.push(finding('GROUP_TERM_OWNERSHIP_CONFLICT', { term, groups: claims.map((claim) => claim.group) }));
    }
  }
  const ownedBy = new Map([...owners].map(([term, claims]) => [term, claims.map((claim) => claim.group)]));
  for (const item of packages) {
    for (const link of item.linked_terms || []) {
      if (link.owner === item.group) {
        findings.push(finding('GROUP_TERM_LINK_SELF', { group: item.group, term: link.term }));
      } else if (!(ownedBy.get(link.term) || []).includes(link.owner)) {
        findings.push(finding('GROUP_TERM_LINK_UNOWNED', { group: item.group, term: link.term, owner: link.owner }));
      }
    }
  }
  return findings;
}

// One accepted index row per child, in the shape every index renderer and every
// conformance check already reads: a direct concept points at its own file, a
// child group points at that group's own index.
function childRows(children) {
  return children.map((child) => (child.kind === 'concept'
    ? { concept_id: child.concept_id, path: `${child.concept_id}.md`, title: child.title, order: child.order }
    : { concept_id: child.group, path: groupFile(child.group, INDEX_FILE), title: child.title, order: child.order }));
}

// The accepted children of a group are exactly its own direct concepts plus its
// own direct child groups -- the same rows conformance is proved against, so the
// index a reader navigates and the candidate set publication enforces can never
// describe two different trees (#203: "derive every group index and the root index
// from the same accepted rows used for conformance").
function childFindings(group, children, directConcepts, childGroups) {
  const findings = [];
  const declared = new Set(children.map((child) => (child.kind === 'concept' ? child.concept_id : child.group)));
  const derived = new Set([...directConcepts, ...childGroups]);
  const missing = [...derived].filter((key) => !declared.has(key)).sort();
  const extra = [...declared].filter((key) => !derived.has(key)).sort();
  if (missing.length > 0 || extra.length > 0 || declared.size !== children.length) {
    findings.push(finding('GROUP_INDEX_CHILDREN_MISMATCH', { group, missing, extra }));
  }
  const orders = children.map((child) => child.order).sort((left, right) => left - right);
  if (!orders.every((order, index) => order === index + 1)) {
    findings.push(finding('GROUP_INDEX_ORDER_INVALID', { group, orders }));
  }
  return findings;
}

/*
 * `concepts` is every accepted substantive output of this migration --
 * `{ concept_id, path }` for each unsplit `migrate` entry and each accepted split
 * output. `packages`/`rootPackage` are the accepted target-bundle proposal's own
 * concept-group half, already shape-checked by `validPayload`.
 *
 * Returns the blocking findings and the derived navigation rows every index is
 * rendered and proved from. An empty `packages` with no concepts is coherent and
 * derives nothing.
 */
function evaluate({ packages, rootPackage, concepts, bundleRoot, services }) {
  const findings = [];
  const seen = new Set();
  for (const item of packages) {
    if (seen.has(item.group)) findings.push(finding('GROUP_PACKAGE_DUPLICATE', { group: item.group }));
    seen.add(item.group);
    findings.push(...keyFindings(item.group));
  }
  const outputs = new Set(concepts.map((item) => item.path));
  for (const item of packages) {
    const parent = parentOf(item.group);
    if (parent !== null && !seen.has(parent)) {
      findings.push(finding('GROUP_PACKAGE_PARENT_MISSING', { group: item.group, parent }));
    }
    for (const role of FILE_ROLES) {
      findings.push(...dispositionFindings(item.group, role, item[role], outputs, bundleRoot, services));
    }
  }
  findings.push(...termFindings(packages));

  const byGroup = new Map(packages.map((item) => [item.group, []]));
  for (const concept of concepts) {
    const group = groupOf(concept.path);
    if (group === '') {
      // #202 supersedes every earlier permission for a substantive root concept.
      findings.push(finding('GROUP_PACKAGE_ROOT_OUTPUT', { path: concept.path }));
      continue;
    }
    if (!byGroup.has(group)) {
      findings.push(finding('GROUP_ASSIGNMENT_UNKNOWN', { path: concept.path, group }));
      continue;
    }
    byGroup.get(group).push(concept.concept_id);
  }

  const childGroupsOf = new Map(packages.map((item) => [item.group, []]));
  const topLevel = [];
  for (const item of packages) {
    const parent = parentOf(item.group);
    if (parent === null) topLevel.push(item.group);
    else if (childGroupsOf.has(parent)) childGroupsOf.get(parent).push(item.group);
  }

  for (const item of packages) {
    const direct = byGroup.get(item.group) || [];
    const children = childGroupsOf.get(item.group) || [];
    if (direct.length === 0 && children.length === 0) {
      findings.push(finding('GROUP_PACKAGE_UNUSED', { group: item.group }));
    }
    // An `unchanged` index claims the file on disk already carries the derived
    // rows. It cannot, for a group this migration just gained children: a
    // concept or child group added now cannot already be listed by an index
    // written before it existed, so the claim is refused rather than silently
    // leaving the on-disk `index.md` stale.
    if (item.index.disposition === 'unchanged' && (direct.length > 0 || children.length > 0)) {
      findings.push(finding('GROUP_INDEX_UNCHANGED_STALE', {
        group: item.group,
        target_path: groupFile(item.group, INDEX_FILE),
        gained_concepts: direct,
        gained_groups: children,
      }));
    }
    findings.push(...childFindings(item.group, item.children, direct, children));
  }
  findings.push(...childFindings('', rootPackage.children, [], topLevel));
  if (rootPackage.index.disposition === 'unchanged' && topLevel.length > 0) {
    findings.push(finding('GROUP_INDEX_UNCHANGED_STALE', {
      group: '', target_path: INDEX_FILE, gained_concepts: [], gained_groups: topLevel,
    }));
  }
  findings.push(...dispositionFindings('', 'index', rootPackage.index, outputs, bundleRoot, services));
  findings.push(...dispositionFindings('', 'log', rootPackage.log, outputs, bundleRoot, services));

  const rows = [
    ...packages.map((item) => ({ key: item.group, purpose: item.purpose, index: item.index, children: item.children })),
    { key: '', purpose: rootPackage.purpose, index: rootPackage.index, children: rootPackage.children },
  ];
  // Only a `created` or `updated` index is a written candidate; an `unchanged`
  // index is an explicit no-change result and stages nothing.
  const indexes = rows
    .filter((row) => row.index.disposition !== 'unchanged')
    .map((row) => ({
      key: row.key,
      purpose: row.purpose,
      index_entry: { path: groupFile(row.key, INDEX_FILE), title: row.index.title },
      child_entries: childRows(row.children).sort((left, right) => left.order - right.order),
    }))
    .sort((left, right) => left.index_entry.path.localeCompare(right.index_entry.path));

  return { findings, indexes };
}

module.exports = { validPayload, validAccepted, evaluate, keyFindings };
