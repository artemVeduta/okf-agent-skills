/*
 * #176: migration structural evidence.
 *
 * Observed content from any readable file inside the migration scan boundary that
 * can *suggest* a domain term, a reader-purpose group, a classification, or a
 * placement in a target bundle proposal. Three rules hold the whole module up:
 *
 *   - Evidence is a hint, never authority. Nothing here selects a file for
 *     migration, creates a concept group, fixes a placement, or grants trust. The
 *     accepted target bundle proposal remains the only authority; `proposal.js`
 *     reads this module's output only to annotate the rows a user's own explicit
 *     choice already produced.
 *   - Instructions and agent-file imports are inert data. A convention file may
 *     tell an agent to do something, or write `@OTHER.md` to import another file;
 *     this module records those bytes as text and never executes an instruction,
 *     never follows an import, and never reads a file an import names.
 *   - Every fact is bound to exactly where it was read. A known context file's
 *     fact names the exact parsed `field`; any other file's fact names the exact
 *     `heading` and its `line`. A fact with no such binding is not emitted.
 *
 * Priority is the settled order and is carried on each fact as `priority`, lowest
 * first: an explicit user choice (never produced here -- it outranks everything
 * this module can observe), then a known context file's parsed field, then any
 * other file's content. Two facts at the same priority whose *parsed values*
 * actually disagree are a conflict; `collect` returns an advisory for it rather
 * than picking one, exactly as an incomplete parse does. Facts this module never
 * compared -- two definitions of one term, whose prose it does not read -- are
 * not a conflict and produce nothing.
 *
 * Everything this module returns is advisory. Evidence is non-authoritative
 * (#176), so an evidence advisory never gates acceptance of a target bundle
 * proposal; `proposal.js` keeps them out of its own acceptability gate.
 */

const path = require('node:path');
const validation = require('./validation');

// The three known context files, each with a deterministic parser below. A file
// is "known" by its exact Git-root-relative path, never by basename alone: a
// `CONTEXT.md` deeper in the tree is known only when the root `CONTEXT-MAP.md`
// links to it (`linkedContextFiles`), so no filename anywhere ever promotes
// itself into a structural authority.
const ROOT_CONTEXT = 'CONTEXT.md';
const ROOT_CONTEXT_MAP = 'CONTEXT-MAP.md';

const PRIORITY_CONTEXT_FILE = 2;
const PRIORITY_OTHER_CONTENT = 3;

// `**Term**:` at the start of a line -- the domain-modeling convention this repo's
// own root `CONTEXT.md` is written in. The bold run is the exact parsed field the
// fact binds to; whatever follows on the next lines is the term's definition and is
// never interpreted here.
const TERM_ENTRY = /^\*\*([^*\n]+)\*\*:/;

// `- [Label](target)` -- one list entry of a context map. The label is the exact
// parsed field; the target is a path this module records and never opens.
const MAP_ENTRY = /^\s*[-*]\s+\[([^\]\n]+)\]\(\s*<?([^)>\s]+)>?\s*\)/;

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

function readText(gitRoot, rel, services) {
  try {
    const buffer = services.readBuffer(path.join(gitRoot, rel));
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

// Fenced code is stripped by line, not by span, so a fact's `line` stays the
// source file's own 1-based line number rather than an offset into a rewritten
// copy. Reuses `validation.withoutFencedCode`, the same masking every other
// module in this suite reads Markdown through.
function visibleLines(text) {
  return validation.withoutFencedCode(text).split('\n');
}

function fact(file, kind, term, binding, priority, extra = {}) {
  return { file, kind, term, ...binding, priority, ...extra };
}

// Root `CONTEXT.md`: one `domain_term` fact per parsed bold term entry, bound to
// that exact field. A term is a vocabulary hint for naming a group or a concept;
// it never becomes one.
function parseContext(file, text) {
  const facts = [];
  visibleLines(text).forEach((line, index) => {
    const match = TERM_ENTRY.exec(line);
    if (match) facts.push(fact(file, 'domain_term', match[1].trim(), { field: match[1].trim(), line: index + 1 }, PRIORITY_CONTEXT_FILE));
  });
  return facts;
}

// Root `CONTEXT-MAP.md`: one `group_suggestion` fact per parsed list link, bound to
// that entry's exact label and carrying the linked path verbatim. The path is data:
// this module does not open it, and `proposal.js` does not create a group from it.
function parseContextMap(file, text) {
  const facts = [];
  visibleLines(text).forEach((line, index) => {
    const match = MAP_ENTRY.exec(line);
    if (match) {
      facts.push(fact(file, 'group_suggestion', match[1].trim(), { field: match[1].trim(), line: index + 1 }, PRIORITY_CONTEXT_FILE, {
        target: match[2],
      }));
    }
  });
  return facts;
}

// Any other readable file in the scan boundary: one `heading` fact per Markdown
// heading, bound to that exact text span. Independent of migration selection --
// a file this migration will never migrate still supplies structure.
function parseHeadings(file, text) {
  const facts = [];
  visibleLines(text).forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match) facts.push(fact(file, 'heading', match[2], { heading: match[2], line: index + 1 }, PRIORITY_OTHER_CONTENT, { depth: match[1].length }));
  });
  return facts;
}

// A `CONTEXT.md` the root context map links to, inside the scan boundary and
// actually present among the scanned files. Resolution is textual and one level
// deep: the map's own recorded target, joined to the map's directory, and nothing
// followed from there.
function linkedContextFiles(mapFacts, scanned) {
  const linked = [];
  for (const item of mapFacts) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(item.file), item.target));
    if (path.posix.basename(resolved) !== ROOT_CONTEXT) continue;
    if (resolved.startsWith('..') || !scanned.has(resolved) || linked.includes(resolved)) continue;
    linked.push(resolved);
  }
  return linked;
}

// A conflict needs two parsed values that actually disagree. Only a context-map
// entry carries one (its `target`); a domain term's definition is prose this
// module never reads, so two files defining one term are simply two hints, not a
// disagreement this module is in any position to report.
function conflictAdvisories(facts) {
  const byKey = new Map();
  for (const item of facts) {
    if (item.target === undefined) continue;
    const key = `${item.kind}:${item.term}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }
  const advisories = [];
  for (const [key, group] of byKey) {
    const targets = [...new Set(group.map((item) => item.target))];
    if (targets.length < 2) continue;
    advisories.push({
      id: `evidence:${key}`,
      kind: 'evidence_conflict',
      prompt: `Context files disagree about "${group[0].term}": ${targets.join(', ')}. Decide the structure yourself; this evidence settles nothing on its own.`,
      options: null,
    });
  }
  return advisories.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/*
 * `sources` is exactly `discover`'s own inventory, unmodified -- the scan boundary,
 * not a selection. Every readable entry in it may supply evidence, whether or not
 * the migration selected it. `migrating` is the set of source paths the plan gives
 * a `migrate` disposition; a file in both sets is marked `dual_role`, reported once
 * here and once as a migration source, never counted twice as either.
 */
function collect(gitRoot, sources, migrating, services) {
  const scanned = new Set(sources.map((item) => item.path));
  const texts = new Map();
  const textOf = (rel) => {
    if (!texts.has(rel)) texts.set(rel, readText(gitRoot, rel, services));
    return texts.get(rel);
  };

  const mapText = scanned.has(ROOT_CONTEXT_MAP) ? textOf(ROOT_CONTEXT_MAP) : null;
  const mapFacts = mapText === null ? [] : parseContextMap(ROOT_CONTEXT_MAP, mapText);
  const contextFiles = [
    ...(scanned.has(ROOT_CONTEXT) ? [ROOT_CONTEXT] : []),
    ...linkedContextFiles(mapFacts, scanned),
  ];

  const facts = [...mapFacts];
  for (const file of contextFiles) {
    const text = textOf(file);
    if (text !== null) facts.push(...parseContext(file, text));
  }

  const parsed = new Set([ROOT_CONTEXT_MAP, ...contextFiles]);
  for (const source of sources) {
    if (parsed.has(source.path) || source.category === 'other') continue;
    const text = textOf(source.path);
    if (text !== null) facts.push(...parseHeadings(source.path, text));
  }

  // Incomplete evidence: a context file present in the scan but unreadable, or one
  // whose parse produced nothing at all, is reported rather than treated as
  // absent -- a silently empty parse is the one way this module could suggest a
  // structure by omission.
  const advisories = conflictAdvisories(facts);
  for (const file of [ROOT_CONTEXT_MAP, ...contextFiles]) {
    if (!scanned.has(file)) continue;
    if (facts.some((item) => item.file === file)) continue;
    advisories.push({
      id: `evidence:unparsed:${file}`,
      kind: 'evidence_incomplete',
      prompt: `${file} is a known context file but yielded no structural fact in a format this parser recognizes. Read it yourself before relying on it; it suggests nothing here.`,
      options: null,
    });
  }

  return {
    facts: facts.map((item, index) => ({
      id: `e${index + 1}`,
      dual_role: migrating.has(item.file),
      consumed_by: null,
      ...item,
    })),
    advisories,
  };
}

module.exports = { collect };
