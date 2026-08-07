/*
 * #144: migration plan schema and the batched question round.
 *
 * Turns `discover`'s (#142) source inventory into a fully-determined migration
 * plan: every discovered source gets exactly one intentional disposition --
 * `migrate`, `skip`, `residue`, or `blocked_pending_decision` -- and nothing is
 * left implicit. A source lands on `blocked_pending_decision` only when its
 * disposition genuinely cannot be inferred from evidence already on disk
 * (#131: "never guess an unresolved semantic decision"); every other source
 * gets a deterministic disposition with no question asked at all. A plan with
 * any `blocked_pending_decision` entry is structurally `executable: false`, so
 * a later executor (#145 onward) cannot run a half-decided plan by accident.
 *
 * This module only derives entries and questions and applies answers; it
 * never prompts a human. Asking the question and rendering the compact batch
 * is `skills/okf-setup/SKILL.md`'s job -- the runtime derives and validates,
 * the procedure asks (AGENTS.md's "runtime derives ... it never prompts").
 *
 * Binding rules carried from #131 this module enforces:
 *   - one selected source -> one output concept, never split, exploded, or
 *     restructured;
 *   - an explicit, non-empty `type` on the source is preserved verbatim
 *     rather than re-guessed (`type_preserved`); a source with no explicit
 *     `type` always asks (`type_not_inferable` while open, `type_approved`
 *     once answered) -- the deterministic path/heuristic mapping table that
 *     would close most of these automatically is #145's job, not this
 *     module's;
 *   - a target-path collision always blocks pending a user decision, and the
 *     only legal decision is to skip the source -- never a silent rename,
 *     merge, overwrite, or dedupe;
 *   - explicit provenance is preserved by omission: this module carries no
 *     `sources`, `generated`, `verified`, or freshness field at all, so there
 *     is nothing here that could fabricate one.
 *
 * Concept identity (#131, #22): the bundle-relative path without `.md`, so
 * the target file this module checks for a collision is always exactly
 * `<bundleRoot>/<concept>.md`, matching how `scripts/lib/runtime.js` resolves
 * a concept's file on the write path.
 */

const path = require('node:path');
const validation = require('./validation');

function conceptFor(sourcePath) {
  const ext = path.posix.extname(sourcePath);
  return ext ? sourcePath.slice(0, -ext.length) : sourcePath;
}

// Reads only the `type` field, through the same frontmatter/YAML reader the
// write path and `discover` both use (no second parser). A source `discover`
// already classified `markdown` is guaranteed to be valid UTF-8 with either no
// frontmatter block or one this same reader accepts, so any failure here is
// simply "no type declared" rather than a new kind of ambiguity for this
// module to invent a response to.
function declaredType(gitRoot, sourcePath, services) {
  let text;
  try {
    text = services.readFile(path.join(gitRoot, sourcePath));
  } catch {
    return null;
  }
  let extracted;
  try {
    extracted = validation.parseFrontmatter(text);
  } catch {
    return null;
  }
  let tree;
  try {
    tree = validation.parseYAML(extracted.frontmatter);
  } catch {
    return null;
  }
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
// is already determined returns its entry with no question at all.
function classify(source, gitRoot, bundleRoot, services) {
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
  const concept = conceptFor(source.path);
  const targetFile = path.join(bundleRoot, `${concept}.md`);
  if (services.exists(targetFile)) {
    const q = question(
      source.path,
      'target_collision',
      `${concept}.md already exists in the bundle. ${source.path} cannot overwrite, merge with, or rename around it -- approve skipping it, or resolve the collision outside this plan first.`,
      ['skip'],
    );
    return { entry: entry(source.path, 'blocked_pending_decision', 'target_collision'), question: q };
  }

  const type = declaredType(gitRoot, source.path, services);
  if (type) {
    return { entry: entry(source.path, 'migrate', 'type_preserved', concept, type) };
  }
  const q = question(
    source.path,
    'type',
    `${source.path} has no explicit "type". Name the OKF concept type to migrate it as.`,
    null,
  );
  return { entry: entry(source.path, 'blocked_pending_decision', 'type_not_inferable'), question: q };
}

function validAnswer(q, value) {
  if (q.kind === 'type') return typeof value === 'string' && value.trim() !== '';
  return Array.isArray(q.options) && q.options.includes(value);
}

// A `discovery_ambiguous` answer names the resulting disposition directly
// (`"skip"` or `"residue"`, both already validated against the question's own
// `options`), so no separate mapping table is needed for it.
function resolve(source, entryBefore, q, value) {
  if (q.kind === 'type') return entry(source.path, 'migrate', 'type_approved', conceptFor(source.path), value.trim());
  if (q.kind === 'target_collision') return entry(source.path, 'skip', 'target_collision');
  return entry(source.path, value, entryBefore.reason);
}

// `sources` is exactly `discover`'s (#142) own output shape; this module
// never re-walks or re-classifies the filesystem itself. `answers`, when
// supplied, is a plain object keyed by source path (one open question per
// source, so the path is already that question's own stable id) -- every key
// must still name a question this same `sources` array produces, and every
// value must be one of that question's own closed answers (or, for the
// `type` kind, a non-empty string), or the whole call is refused rather than
// silently ignoring a stale or invented answer. This is a pure function of
// its arguments with nothing stored between calls: rerunning it against the
// same `sources` and `answers` always reproduces the same plan (#131's
// idempotency-without-resumability -- there is no checkpoint to desync from).
function derivePlan(sources, gitRoot, bundleRoot, services, answers) {
  const entries = [];
  const open = new Map();

  for (const source of sources) {
    const outcome = classify(source, gitRoot, bundleRoot, services);
    entries.push(outcome.entry);
    if (outcome.question) open.set(source.path, { source, entry: outcome.entry, question: outcome.question });
  }

  const questions = [];
  if (answers === undefined) {
    for (const item of open.values()) questions.push(item.question);
  } else {
    for (const key of Object.keys(answers)) {
      const item = open.get(key);
      if (!item || !validAnswer(item.question, answers[key])) return { invalid: true };
    }
    for (const [sourcePath, item] of open) {
      if (!Object.hasOwn(answers, sourcePath)) {
        questions.push(item.question);
        continue;
      }
      const resolved = resolve(item.source, item.entry, item.question, answers[sourcePath]);
      entries[entries.findIndex((candidate) => candidate.path === sourcePath)] = resolved;
    }
  }

  return { entries, questions, executable: questions.length === 0 };
}

module.exports = { derivePlan };
