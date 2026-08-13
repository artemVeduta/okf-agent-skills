/*
 * #144: migration plan schema and the batched question round.
 * #145: source-to-concept mapping engine, provenance, and residue handling.
 *
 * Turns `discover`'s (#142) source inventory into a fully-determined migration
 * plan: every discovered source gets exactly one intentional disposition --
 * `migrate`, `skip`, `residue`, or `blocked_pending_decision` -- and nothing is
 * left implicit. A source lands on `blocked_pending_decision` only when its
 * disposition genuinely cannot be inferred from evidence already on disk
 * (#131: "never guess an unresolved semantic decision"); every other source
 * gets a deterministic disposition with no question asked at all. A plan with
 * any `blocked_pending_decision` entry is structurally `executable: false`, so
 * a later executor (#146 onward) cannot run a half-decided plan by accident.
 *
 * This module only derives entries, questions, mappings, and residue-evidence
 * paths, and applies answers; it never prompts a human. Asking the question and
 * rendering the compact batch is `skills/okf-setup/SKILL.md`'s job -- the runtime
 * derives and validates, the procedure asks (AGENTS.md's "runtime derives ... it
 * never prompts").
 *
 * The type-mapping table, provenance extraction, reference-path derivation,
 * and link rewriting are `./mapping.js`'s job (#145, SRP split), and so is
 * building a concept path from the accepted reader-purpose group (#203) --
 * there is no type-directory mapping left to claim: this module owns plan
 * orchestration -- classification, questions, answers -- and calls that module
 * for the mapping *rules* rather than duplicating them.
 *
 * Binding rules carried from #131 this module enforces:
 *   - one selected source -> one output concept by default (#200 supersedes
 *     #131's absolute "never split" for a source that receives split review
 *     and an accepted split proposal; this module still emits exactly one
 *     `migrate` entry per source unchanged -- the split itself is a later
 *     stage's job, #201 tasks 2 onward, built on top of this module's plan
 *     rather than inside it);
 *   - an explicit, non-empty `type` on the source is preserved verbatim rather
 *     than re-guessed (`type_preserved`); otherwise a deterministic type-mapping
 *     rule may apply (`type_inferred`, #145's job); a source with no explicit
 *     type and no deterministic evidence always asks (`type_not_inferable` while
 *     open, `type_approved` once answered) -- there is no generic `Note`
 *     fallback;
 *   - a target-path collision always blocks pending a user decision, and the
 *     only legal decision is to skip the source -- never a silent rename,
 *     merge, overwrite, or dedupe; an exact content duplicate among sources this
 *     same call is migrating is surfaced as a non-blocking candidate, never
 *     silently merged either;
 *   - explicit provenance is preserved by omission at the plan-entry level: this
 *     module carries no `sources`, `generated`, `verified`, or freshness field on
 *     an entry itself, so there is nothing here that could fabricate one; the
 *     provenance a source's own frontmatter actually declares is surfaced
 *     separately, verbatim, in `data.mapping` (#145).
 *
 * Concept identity (#131, #22): the bundle-relative path without `.md`, so the
 * target file this module checks for a collision is always exactly
 * `<bundleRoot>/<concept>.md`, matching how `scripts/lib/setup.js` resolves a
 * concept's file on the write path.
 */

const path = require('node:path');
const validation = require('./validation');
const mapping = require('./mapping');
const sections = require('./sections');

// Reads a markdown source's own frontmatter tree and body exactly once, through
// the same reader the write path and `discover` both use (no second parser). A
// source `discover` already classified `markdown` is guaranteed to be valid
// UTF-8 with either no frontmatter block or one this same reader accepts, so any
// failure here is simply "nothing declared" rather than a new kind of ambiguity
// for this module to invent a response to.
function readSource(gitRoot, sourcePath, services) {
  let raw;
  try {
    raw = services.readFile(path.join(gitRoot, sourcePath));
  } catch {
    return { raw: null, tree: {}, body: '' };
  }
  let extracted;
  try {
    extracted = validation.parseFrontmatter(raw);
  } catch (error) {
    if (error.reason === 'missing opening frontmatter delimiter') return { raw, tree: {}, body: raw };
    return { raw, tree: {}, body: '' };
  }
  let tree;
  try {
    tree = validation.parseYAML(extracted.frontmatter);
  } catch {
    tree = {};
  }
  return { raw, tree: tree && typeof tree === 'object' && !Array.isArray(tree) ? tree : {}, body: extracted.body };
}

function explicitType(tree) {
  const type = tree && typeof tree.type === 'string' ? tree.type.trim() : '';
  return type || null;
}

function entry(sourcePath, disposition, reason, concept = null, type = null) {
  return { path: sourcePath, disposition, reason, concept, type };
}

// `options` is the closed set of legal answers for a kind that has one;
// `null` marks the one kind (`type`) that instead accepts any non-empty
// string, because OKF's own type taxonomy is deliberately open (#130).
function question(sourcePath, kind, prompt, options) {
  return { id: sourcePath, path: sourcePath, kind, prompt, options };
}

// One source produces at most one open question -- #131's "one compact
// batched round", not one interruption per file. A source whose disposition
// is already determined returns its entry with no question at all. `read`
// is a memoizing reader (see `derivePlan`) so a markdown source is parsed once
// per `derivePlan` call, not once per consumer of its content.
// #203 (#202): the target-collision check is the last gate a placed concept
// passes, and the one helper that runs it. `classify` never places a concept --
// a typed source with no accepted group stops at `pendingGroup`, which asks for
// that group -- so only `resolve`, answering a `reader_purpose_group` question,
// reaches this helper, and the rule exists in exactly one place.
function placed(sourcePath, reason, type, group, bundleRoot, services) {
  const concept = mapping.conceptPathFor(sourcePath, type, group);
  if (services.exists(path.join(bundleRoot, `${concept}.md`))) {
    const q = question(
      sourcePath,
      'target_collision',
      `${concept}.md already exists in the bundle. ${sourcePath} cannot overwrite, merge with, or rename around it -- approve skipping it, or resolve the collision outside this plan first.`,
      ['skip'],
    );
    return { entry: entry(sourcePath, 'blocked_pending_decision', 'target_collision'), question: q };
  }
  return { entry: entry(sourcePath, 'migrate', reason, concept, type) };
}

// #203 (#202): reader purpose is a human decision. A typed source with no
// accepted group is asked which accepted group it belongs to -- never placed by
// its type, its source directory, a file count, or a directory depth -- and the
// closed option set is exactly the accepted group keys of the proposal in hand,
// so answering can only ever name a group the same proposal already describes.
function groupQuestion(sourcePath, groupKeys) {
  return question(
    sourcePath,
    'reader_purpose_group',
    `${sourcePath} has no accepted reader-purpose group. Name the accepted group it belongs to, or add its group to the target-bundle proposal first.`,
    groupKeys,
  );
}

function classify(source, read, bundleRoot, services, groups) {
  if (source.category === 'other') {
    return { entry: entry(source.path, 'skip', 'not_a_candidate_document_format') };
  }
  if (source.category === 'unsupported') {
    // Recognised-but-unparseable is a deterministic fact, not a guess: this
    // module always knows an `unsupported` source can never become a concept,
    // so retaining it as inert evidence needs no question (#131: "retain it as
    // source/evidence or inert migration residue"; residue is the safer,
    // non-lossy default over silently leaving it out of the bundle's graph).
    return { entry: entry(source.path, 'residue', 'unsupported_format') };
  }
  if (source.category === 'ambiguous') {
    // The evidence genuinely does not settle this one -- `discover` already
    // said so with its own `question`, which this module reuses rather than
    // writing a second one, and offers the two safe, non-lossy resolutions.
    const q = question(source.path, 'discovery_ambiguous', source.question, ['skip', 'residue']);
    return { entry: entry(source.path, 'blocked_pending_decision', source.reason), question: q };
  }

  // source.category === 'markdown'
  const { tree, body } = read(source.path);
  const explicit = explicitType(tree);
  const type = explicit || mapping.inferType(source.path, tree, body);
  if (!type) {
    const q = question(
      source.path,
      'type',
      `${source.path} has no explicit "type". Name the OKF concept type to migrate it as.`,
      null,
    );
    return { entry: entry(source.path, 'blocked_pending_decision', 'type_not_inferable'), question: q };
  }

  return pendingGroup(source.path, type, explicit ? 'type_preserved' : 'type_inferred', groups);
}

// A typed source still waiting on its accepted group. The type and the reason it
// was reached by are carried on the pending record, never on the entry: the
// entry's own `reason` always names why it is blocked right now.
function pendingGroup(sourcePath, type, reason, groups) {
  return {
    entry: entry(sourcePath, 'blocked_pending_decision', 'reader_purpose_group_not_assigned', null, type),
    question: groupQuestion(sourcePath, groups),
    placement: { type, reason },
  };
}

// A source keeps exactly one open question at a time, but resolving one can open
// the next -- an approved type still needs an accepted reader-purpose group, and
// that group still has to clear a target collision. So an answer is either a plain
// value for the question open right now, or, for a source whose decision genuinely
// takes more than one step, an object keyed by question kind holding each step's
// own answer. Either way it stays one `answers` entry per source: #131's one
// compact batched round, never one interruption per question.
function answerFor(answers, sourcePath, kind) {
  const value = answers[sourcePath];
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.hasOwn(value, kind) ? { supplied: true, value: value[kind] } : { supplied: false };
  }
  return { supplied: true, value };
}

function validAnswer(q, value) {
  if (q.kind === 'type') return typeof value === 'string' && value.trim() !== '';
  return Array.isArray(q.options) && q.options.includes(value);
}

// Every step an answers entry names must be a legal answer to the step it names,
// and the entry as a whole must at least answer the question open right now --
// a stale or invented step is refused rather than silently ignored.
function validAnswerEntry(value, kind) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return true;
  return Object.hasOwn(value, kind) && Object.keys(value).every((step) => ANSWERABLE.has(step));
}

const ANSWERABLE = new Set(['type', 'reader_purpose_group', 'target_collision', 'discovery_ambiguous']);

// A `discovery_ambiguous` answer names the resulting disposition directly
// (`"skip"` or `"residue"`, both already validated against the question's own
// `options`), so no separate mapping table is needed for it.
//
// Resolving one question can open the next one for the same source -- an approved
// type still needs its accepted group, and an accepted group still has to clear a
// target collision. Each source keeps exactly one open question at a time (#131's
// one compact batched round), so a newly opened question is simply asked in the
// next round rather than answered inside this one.
function resolve(source, item, value, bundleRoot, services, groups) {
  const q = item.question;
  if (q.kind === 'type') return pendingGroup(source.path, value.trim(), 'type_approved', groups);
  if (q.kind === 'reader_purpose_group') {
    return placed(source.path, item.placement.reason, item.placement.type, value, bundleRoot, services);
  }
  if (q.kind === 'target_collision') return { entry: entry(source.path, 'skip', 'target_collision') };
  return { entry: entry(source.path, value, item.entry.reason) };
}

// One entry per `migrate` disposition: `path` -> `concept`, the exact identity
// (#22/#131) a link's own resolved target is checked against below.
function conceptIndex(entries) {
  const index = new Map();
  for (const item of entries) {
    if (item.disposition === 'migrate') index.set(item.path, item.concept);
  }
  return index;
}

// #145: for every `migrate` entry, the provenance its own frontmatter already
// declares (verbatim, or `null` -- never fabricated, see `mapping.js`) and its
// body with links rewritten against every other source this same call is
// migrating. Read-only and purely derivational, exactly like the rest of this
// module: nothing here is written anywhere. `bundleDir` (the bundle root's own
// project-relative path, e.g. `"okf"`) lets `rewriteLinks` (#188) place a
// migrated concept at its real project-relative directory when re-expressing a
// link to a target that stays outside this migration.
function deriveMapping(entries, bundleDir, read) {
  const conceptOf = conceptIndex(entries);
  const mapped = [];
  for (const item of entries) {
    if (item.disposition !== 'migrate') continue;
    const { tree, body, raw } = read(item.path);
    mapped.push({
      path: item.path,
      concept: item.concept,
      type: item.type,
      sources: mapping.extractProvenance(tree),
      source_identity: raw === null ? null : sections.identify(raw),
      body: mapping.rewriteLinks(item.path, body, conceptOf, bundleDir),
    });
  }
  return mapped;
}

// #145: the deterministic `references/` path for every `residue` entry's raw
// evidence, so retaining it (a later, separate copy step) never has to invent
// where it goes. Every `unsupported`-format source is `residue` (see `classify`
// above), so this covers exactly the "retain it as evidence" half of #131's
// residue rule; the "retain it as source" half needs no path at all, the source
// never moved from where it already sits.
function deriveReferences(entries) {
  return entries
    .filter((item) => item.disposition === 'residue')
    .map((item) => ({ path: item.path, reference_path: mapping.referencePathFor(item.path) }));
}

// #145: exact content duplicates among the sources this call is migrating,
// surfaced as candidates -- never silently merged, never blocking (#131: "exact
// duplicates may be surfaced as candidates; near duplicates/conflicting claims
// are not silently merged" -- surfacing is exactly as far as this module goes).
function deriveDuplicates(entries, read) {
  const byContent = new Map();
  for (const item of entries) {
    if (item.disposition !== 'migrate') continue;
    const { raw } = read(item.path);
    if (raw === null) continue;
    if (!byContent.has(raw)) byContent.set(raw, []);
    byContent.get(raw).push(item.path);
  }
  const groups = [];
  for (const paths of byContent.values()) {
    if (paths.length > 1) groups.push({ paths: paths.slice().sort() });
  }
  return groups;
}

// #188 bullet 4: a link that resolves to nothing, found before anything is
// written -- the same seam `deriveDuplicates` already reports through
// (`derivePlan`'s return, mapped to a finding by `setup.js`), not a second
// mechanism. `rewriteLinks` stays a pure string transform with no filesystem
// access (see `mapping.js`); this function is where `services`/`gitRoot` -- the
// only place in this call that can ask "does that file actually exist" -- get
// used for that question.
//
// For every `migrate` entry's own (pre-rewrite) body, every link target this
// migration would otherwise rewrite (`mapping.resolveLinkTarget`, the same
// resolution `rewriteLinks` itself uses, so the two never disagree about what a
// link "means") is checked two ways, mirroring the brief's own two rewrite
// classes: is it another source this call is migrating (`conceptOf` has it --
// bullet 2, fine, not reported), or does it exist as a real file in the project
// (`services.exists`/`isFile` against `gitRoot` -- bullet 3, fine, not reported).
// Neither holds: the link resolves to nothing, and is reported with a `class` --
// the resolved path's own disposition (`skip`, `residue`,
// `blocked_pending_decision`) when it names a source this same call already
// classified one way or the other, or `unknown` when it names no source this
// call has ever seen at all. `migrate` never appears as a class: a `migrate`
// target is always in `conceptOf`, so it never reaches this branch.
function deriveUnresolvedLinks(entries, gitRoot, services, read) {
  const conceptOf = conceptIndex(entries);
  const dispositionOf = new Map(entries.map((item) => [item.path, item.disposition]));
  const unresolved = [];
  for (const item of entries) {
    if (item.disposition !== 'migrate') continue;
    const { body } = read(item.path);
    for (const resource of validation.markdownLinks(body)) {
      const targetPath = validation.bodyLinkPath(resource);
      if (!targetPath) continue;
      const resolved = mapping.resolveLinkTarget(item.path, targetPath);
      if (conceptOf.has(resolved)) continue;
      const onDisk = path.join(gitRoot, resolved);
      if (services.exists(onDisk) && services.isFile(onDisk)) continue;
      unresolved.push({ path: item.path, resource, class: dispositionOf.get(resolved) || 'unknown' });
    }
  }
  return unresolved;
}

// `sources` is exactly `discover`'s (#142) own output shape, unmodified; this
// module never re-walks or re-classifies the filesystem itself. `answers`, when
// supplied, is a plain object keyed by source path (one open question per
// source, so the path is already that question's own stable id) -- every key
// must still name a question this same `sources` array produces, and every
// value must be one of that question's own closed answers (or, for the `type`
// kind, a non-empty string), or the whole call is refused rather than silently
// ignoring a stale or invented answer. This is a pure function of its arguments
// with nothing stored between calls: rerunning it against the same `sources`
// and `answers` always reproduces the same plan (#131's idempotency-without-
// resumability -- there is no checkpoint to desync from).
function derivePlan(sources, gitRoot, bundleRoot, services, answers, groups = []) {
  const cache = new Map();
  const read = (sourcePath) => {
    if (!cache.has(sourcePath)) cache.set(sourcePath, readSource(gitRoot, sourcePath, services));
    return cache.get(sourcePath);
  };

  const entries = [];
  const open = new Map();

  for (const source of sources) {
    const outcome = classify(source, read, bundleRoot, services, groups);
    entries.push(outcome.entry);
    if (outcome.question) {
      open.set(source.path, { source, entry: outcome.entry, question: outcome.question, placement: outcome.placement });
    }
  }

  const questions = [];
  if (answers === undefined) {
    for (const item of open.values()) questions.push(item.question);
  } else {
    for (const key of Object.keys(answers)) {
      const item = open.get(key);
      if (!item || !validAnswerEntry(answers[key], item.question.kind)) return { invalid: true };
      const first = answerFor(answers, key, item.question.kind);
      if (!validAnswer(item.question, first.value)) return { invalid: true };
    }
    for (const [sourcePath, item] of open) {
      if (!Object.hasOwn(answers, sourcePath)) {
        questions.push(item.question);
        continue;
      }
      // Each answered step can open the next one for the same source; the chain
      // stops as soon as a step has no answer, and that step is asked instead.
      let current = item;
      let resolved = null;
      while (current !== null) {
        const answer = answerFor(answers, sourcePath, current.question.kind);
        if (!answer.supplied || !validAnswer(current.question, answer.value)) break;
        resolved = resolve(current.source, current, answer.value, bundleRoot, services, groups);
        current = resolved.question ? { ...current, ...resolved, source: current.source } : null;
      }
      if (resolved === null) {
        questions.push(item.question);
        continue;
      }
      entries[entries.findIndex((candidate) => candidate.path === sourcePath)] = resolved.entry;
      if (current !== null) questions.push(current.question);
    }
  }

  const bundleDir = path.relative(gitRoot, bundleRoot).split(path.sep).join('/');
  return {
    entries,
    questions,
    executable: questions.length === 0,
    mapping: deriveMapping(entries, bundleDir, read),
    references: deriveReferences(entries),
    duplicates: deriveDuplicates(entries, read),
    unresolvedLinks: deriveUnresolvedLinks(entries, gitRoot, services, read),
  };
}

module.exports = { derivePlan };
