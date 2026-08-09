/*
 * #145: source-to-concept mapping engine, provenance extraction, reference-path
 * derivation, and link rewriting.
 *
 * Sibling of `migration.js` rather than an extension of it (SRP): `migration.js`
 * owns plan orchestration -- dispositions, questions, applying answers; this module
 * owns the mapping *rules* that orchestration consumes -- what type a source with
 * no explicit `type` deterministically is, what default concept basename a source
 * carries, what provenance a source's own frontmatter already carries
 * verbatim, where retained raw evidence deterministically lives under `references/`,
 * and how a migrating body's own Markdown links are rewritten when the mapping is
 * unambiguous. `migration.js` calls this module; this module never calls back.
 *
 * Binding rules from #131 this module enforces:
 *   - an ambiguous type is never guessed: every rule below is evidence -- a
 *     conventional directory name, a conventional filename, or a structural
 *     template signature -- never a judgement about a document's prose meaning.
 *     A source this module cannot place stays undetermined; #144's own question
 *     round is the only path from there to a type, never a guess here. There is
 *     deliberately no generic `Note` fallback: a source with no evidence returns
 *     `null`, full stop.
 *   - never fabricate `sources`, `generated`, `verified`, actors, or freshness:
 *     `extractProvenance` returns exactly what a source's own frontmatter already
 *     declares, or `null`. It manufactures nothing and repairs nothing.
 *   - rewrite only parsed standard Markdown links, only when the mapping is
 *     unambiguous, and never inside fenced or inline code -- reusing
 *     `validation.js`'s own `withoutFencedCode` and `bodyLinkPath` rather than a
 *     second link parser.
 */

const path = require('node:path');
const validation = require('./validation');

// ------------------------------------------------------- type inference (deterministic)

function dirSegments(sourcePath) {
  const dir = path.posix.dirname(sourcePath);
  return dir === '.' ? [] : dir.toLowerCase().split('/');
}

const ADR_FILENAME = /^adr[-_]?\d+/i;
const RELEASE_FILENAME = /^v?\d+\.\d+\.\d+\.md$/i;

// Michael Nygard's ADR template's own four headings, exactly as documented in
// #130's research (`docs/spec` migration mapping). All four, as their own heading
// line, is a structural fingerprint of that specific template -- not a guess about
// what the prose under them means.
const ADR_HEADINGS = ['Status', 'Context', 'Decision', 'Consequences'];

function hasHeading(strippedBody, text) {
  return new RegExp(`^#{1,6}[ \\t]+${text}[ \\t]*$`, 'mi').test(strippedBody);
}

function isAdrTemplate(strippedBody) {
  return ADR_HEADINGS.every((heading) => hasHeading(strippedBody, heading));
}

function hasRuntimeField(tree) {
  return Boolean(tree) && tree.runtime !== undefined && tree.runtime !== null && tree.runtime !== '';
}

// Ordered, evidence-only rules. First match wins; the evidence classes below do
// not overlap in practice, and none of them reads or judges prose meaning -- a
// conventional directory name, a conventional filename, or one of #130's own
// documented structural templates, nothing else. A source matching none of these
// returns `null`: #144's own question round is the only legitimate path from
// there to a type (never a guess here, never a generic `Note` fallback).
function inferType(sourcePath, tree, body) {
  const dirs = dirSegments(sourcePath);
  const base = path.posix.basename(sourcePath);
  const stripped = validation.withoutFencedCode(body || '');

  if (dirs.includes('adr') || dirs.includes('decisions') || ADR_FILENAME.test(base) || isAdrTemplate(stripped)) {
    return 'Decision';
  }
  if (dirs.includes('glossary') || base.toLowerCase() === 'glossary.md' || base === 'CONTEXT.md') {
    return 'Glossary';
  }
  if (dirs.includes('constraints') || dirs.includes('constraint')) return 'Constraint';
  if (dirs.includes('research')) return 'Research';
  if (dirs.includes('playbooks') || dirs.includes('playbook') || dirs.includes('runbooks') || dirs.includes('runbook')) return 'Playbook';
  if (dirs.includes('releases') || dirs.includes('release') || RELEASE_FILENAME.test(base)) return 'Release';
  if (dirs.includes('references') || dirs.includes('reference')) return 'Reference';
  if (hasRuntimeField(tree)) return 'Attested Computation';
  return null;
}

// -------------------------------------------------------------------- concept basename

// #160: type never determines path, and a source path is never mirrored into the
// bundle. All this module still derives is a *default basename* -- the source's own
// filename with its extension stripped, or `glossary` for the one type whose
// basename the data model fixes (#162). Where that basename lands -- the bundle root
// or a named reader-purpose group -- is decided only by the accepted target bundle
// proposal (`./proposal.js`), never here.
function conceptBasename(sourcePath, type) {
  if (type === 'Glossary') return 'glossary';
  const base = path.posix.basename(sourcePath);
  const ext = path.posix.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

// ------------------------------------------------------------------------- provenance

// Exactly what the source's own frontmatter already declares under `sources`,
// unmodified, or `null`. Never a default, never a repaired shape, never an
// invented entry -- a non-array value is not "structured provenance" per #131 and
// is treated as absent rather than coerced into one.
function extractProvenance(tree) {
  return tree && Array.isArray(tree.sources) ? tree.sources : null;
}

// -------------------------------------------------------------- reference-path derivation

// Retained raw/unsupported evidence keeps its whole original relative path and
// extension under `references/` -- an archival mirror, not a concept identity, so
// two files sharing a basename in different source directories never collide here
// the way concept placement (which does flatten into a type directory) safely
// asks about instead.
function referencePathFor(sourcePath) {
  return `references/${sourcePath}`;
}

// ------------------------------------------------------------------------ link rewriting

const LINK_PATTERN = /(\[[^\]\n]*\]\()(\s*)(?:<([^>\n]*)>|([^\s)\n]+))/g;

// Rewrites only a link this migration can resolve unambiguously: a parsed,
// non-fenced, non-inline-code, non-image standard Markdown inline link (reusing
// `validation.js`'s own `withoutFencedCode`/`bodyLinkPath` rather than a second
// parser) whose target resolves, relative to the source file's own directory, to
// exactly one other source in `conceptOf`. Anything else -- an external URL, an
// anchor, a target outside this migration, fenced or inline code, an image -- is
// left exactly as written, byte for byte.
//
// Reference-style link *definitions* (`[label]: target`) are out of scope: neither
// shared helper parses that syntax, and writing a second link parser to reach it
// is exactly what reusing `validation.js` is meant to avoid. A document using that
// syntax simply keeps those links unrewritten, which is safe (unresolved is a
// tolerated warning, never silent corruption) rather than lossy.
//
// `conceptOf` is a `Map<sourcePath, conceptPath>` covering every source this same
// migration call is placing (`disposition: "migrate"`), keyed by the source's own
// project-relative path -- exactly the identity #22/#131 already use.
function rewriteLinks(sourcePath, body, conceptOf) {
  const ownConcept = conceptOf.get(sourcePath);
  const lines = body.split('\n');
  const maskLines = validation.withoutFencedCode(body).split('\n');

  return lines.map((line, index) => {
    if (line !== '' && maskLines[index] === '') return line; // inside a fenced code block
    return line.replace(LINK_PATTERN, (whole, prefix, ws, angled, bare, offset) => {
      if (line[offset - 1] === '!' || line[offset - 1] === '\\') return whole; // image or escaped
      const before = line.slice(0, offset);
      if (((before.match(/`/g) || []).length) % 2 === 1) return whole; // inside inline code

      const rawTarget = angled !== undefined ? angled : bare;
      const targetPath = validation.bodyLinkPath(rawTarget);
      if (!targetPath || !ownConcept) return whole;

      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), targetPath));
      const targetConcept = conceptOf.get(resolved);
      if (!targetConcept) return whole;

      // The `?query`/`#fragment` suffix identifies a section of the target, not the
      // target itself: it is carried through untouched (#159). `bodyLinkPath`
      // returns only the path part, so whatever follows it in the raw target is
      // exactly that suffix.
      const suffix = rawTarget.slice(targetPath.length);
      const newTarget = path.posix.relative(path.posix.dirname(`${ownConcept}.md`), `${targetConcept}.md`) + suffix;
      return `${prefix}${ws}${angled !== undefined ? `<${newTarget}>` : newTarget}`;
    });
  }).join('\n');
}

module.exports = { inferType, conceptBasename, extractProvenance, referencePathFor, rewriteLinks };
