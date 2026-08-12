/*
 * #180: the proposal-conformance gate.
 *
 * `propose` (#156) already produces the one complete target bundle proposal a user
 * accepts -- every output's Concept ID, type, content scope, group, target path,
 * provenance assignment and link decision bound before a worker ever sees a brief --
 * and `assemble` (#147) already stages one Markdown file per concept beside the
 * bundle. Between those two nothing ever compared the staged set against the
 * accepted one: a worker that dropped a concept, renamed one, stamped the wrong
 * type, or rewrote a link at a target the proposal never named reached `publish`
 * unchallenged, because `validation.validateRead` (#148) only ever asks whether the
 * staging area is *structurally* a bundle, never whether it is *this* bundle. This
 * module is that missing comparison, and nothing else.
 *
 * Two exports, one seam, exactly two callers (`migration-validate` and `publish`):
 *
 *   - `buildInput` is the only thing here that touches a filesystem. It reads,
 *     parses and digests; it decides nothing and produces no finding. Keeping every
 *     read in one function is what lets the second caller run the *identical* gate
 *     before its first write instead of trusting that the first caller already ran
 *     one -- there is no receipt, no cached verdict and no approval token on this
 *     path (#131: git owns recovery, this module owns no state at all).
 *   - `check` is pure: same input, same findings, in the same order, forever. No
 *     `node:fs`, no `services`, no clock, no randomness. Its ordering is the order
 *     of the dimensions below, and within a dimension the sort order of the Concept
 *     ID or source path, so two runs over one staging area are byte-comparable.
 *
 * What this gate is *not*, and must never be read as:
 *
 *   - It is not a semantic judgement. `input.review` is caller-supplied and stays
 *     read-only here. The bindings it carries (body digest, content scope, source
 *     digests) make a *stale* or *mismatched* verdict detectable; a *fabricated*
 *     one is undetectable at this seam, and no code path or field here claims
 *     otherwise. `semantic_fidelity` remains a separate disclosure that
 *     `migration-validate` derives from its own `semantic_review.performed` input --
 *     a clean gate here never sets it and never implies it.
 *   - It never re-derives an accepted decision. An index body is re-rendered through
 *     `proposal.renderIndex`, frontmatter is read through `validation.parseFrontmatter`
 *     /`parseYAML`, and links are scanned through `validation.markdownLinks`
 *     /`bodyLinkPath` -- the same helpers `mapping.rewriteLinks` itself is built on,
 *     so a link this compares is exactly a link rewriting could reach (#172). A
 *     second renderer or a second parser here would be a second authority.
 *   - It never trusts a recorded observation binding. #174's `sources` digests are
 *     recomputed from the source file on disk; the recorded value is only ever the
 *     thing being checked, never the thing being checked against.
 */

const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const validation = require('./validation');
const proposal = require('./proposal');
const monorepo = require('./monorepo');
const { inside } = require('./paths');
const { suiteFinding } = require('./response');

// Every finding this gate raises blocks: an accepted proposal is one complete
// decision (#156), so a staged bundle that does not match it is not a lesser
// version of the accepted one -- it is a different bundle nobody accepted.
const finding = (code, detail) => suiteFinding(code, detail);

function byKey(key) {
  return (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

function sortedBy(items, key) {
  return [...items].sort(byKey(key));
}

// The bundle-relative directory a Concept ID sits in, `''` at the root. Not
// `path.posix.dirname`, which answers `'.'` for a root concept and would compare
// unequal to the `''` an accepted proposal row carries.
function groupOf(concept) {
  const cut = concept.lastIndexOf('/');
  return cut < 0 ? '' : concept.slice(0, cut);
}

// The exact link text the accepted proposal bound for one rewritten row: the same
// expression `mapping.rewriteLinks` writes into the body it hands the worker, minus
// the `?query`/`#fragment` suffix `bodyLinkPath` already strips off both sides of
// the comparison (#159 carries that suffix through untouched, so it identifies a
// section of the target and never the target itself).
function boundLinkText(concept, targetConcept) {
  return path.posix.relative(path.posix.dirname(`${concept}.md`), `${targetConcept}.md`);
}

// ------------------------------------------------------------------- input

function digestOf(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

// One staged file, read exactly the way `publish` itself reads it: a caller-supplied
// relative path normalized and confined to the staging root before anything opens it,
// then the one reader `readTree`/`validateRead`/`stagedConceptContent` already share.
// A file that cannot be read or cannot be parsed records why and carries no tree and
// no body -- `check` names that as its own finding and derives nothing further from
// it, rather than reporting a cascade of consequences of one unreadable file.
function readStaged(item, gitRoot, stagingRoot, services) {
  const rel = monorepo.normalizeRelative(item.file);
  const resolved = rel ? path.resolve(gitRoot, rel) : null;
  if (!resolved || !inside(stagingRoot, resolved)) {
    return { ...item, ok: false, error: 'unreadable' };
  }
  let text;
  try {
    text = services.readFile(resolved);
  } catch {
    return { ...item, ok: false, error: 'unreadable' };
  }
  let tree;
  let body;
  try {
    const extracted = validation.parseFrontmatter(text);
    tree = validation.parseYAML(extracted.frontmatter);
    body = extracted.body;
  } catch {
    return { ...item, ok: false, error: 'unparseable' };
  }
  if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) {
    return { ...item, ok: false, error: 'unparseable' };
  }
  const links = [];
  for (const raw of validation.markdownLinks(body)) {
    const target = validation.bodyLinkPath(raw);
    if (target !== null && !links.includes(target)) links.push(target);
  }
  return { ...item, ok: true, error: null, tree, body, body_sha256: digestOf(body), links };
}

// #174's observation binding, recomputed rather than read back. `null` is an honest
// "this source could not be read now", never a digest carried over from whenever the
// staged file was written.
function observe(sourcePath, gitRoot, services) {
  const rel = monorepo.normalizeRelative(sourcePath);
  if (!rel) return { path: sourcePath, sha256: null };
  try {
    const sha256 = crypto.createHash('sha256').update(services.readBuffer(path.join(gitRoot, rel))).digest('hex');
    return { path: sourcePath, sha256 };
  } catch {
    return { path: sourcePath, sha256: null };
  }
}

function buildInput({ proposal: accepted, navigation, staged, review, gitRoot, stagingRoot, services }) {
  const observed = [];
  const seen = new Set();
  for (const row of accepted.sources) {
    if (seen.has(row.path)) continue;
    seen.add(row.path);
    observed.push(observe(row.path, gitRoot, services));
  }
  return {
    sources: accepted.sources,
    outputs: accepted.outputs,
    groups: accepted.groups,
    navigation,
    staged: staged.map((item) => readStaged(item, gitRoot, stagingRoot, services)),
    observations: observed,
    review,
  };
}

// ------------------------------------------------------------------- check

// The three dispositions an accepted proposal may carry. `blocked_pending_decision`
// -- `migration-plan`'s own fourth value -- is exactly the state acceptance rules
// out, so it reaches here only when something published a proposal nobody could
// have accepted.
const ACCEPTED_DISPOSITIONS = new Set(['migrate', 'skip', 'residue']);

function checkDispositions(input, findings) {
  for (const row of sortedBy(input.sources, (item) => item.path)) {
    if (ACCEPTED_DISPOSITIONS.has(row.disposition)) continue;
    findings.push(finding('SOURCE_DISPOSITION_UNRESOLVED', { path: row.path, disposition: row.disposition }));
  }
}

// Both directions, because either alone hides a whole class of loss: a proposal
// output with nothing staged is a concept the migration silently dropped, and a
// staged file no output names is a concept nobody accepted.
function checkOutputSet(outputs, staged, findings) {
  const stagedConcepts = new Set(staged.map((item) => item.concept));
  const proposedConcepts = new Set(outputs.map((item) => item.concept));
  for (const output of outputs) {
    if (!stagedConcepts.has(output.concept)) findings.push(finding('OUTPUT_NOT_STAGED', { concept: output.concept }));
  }
  for (const item of staged) {
    if (!proposedConcepts.has(item.concept)) findings.push(finding('STAGED_OUTPUT_UNPROPOSED', { concept: item.concept }));
  }
}

function checkStagedFiles(staged, findings) {
  for (const item of staged) {
    if (item.ok === false) findings.push(finding('STAGED_FILE_INVALID', { concept: item.concept, reason: item.error }));
  }
}

// Three values, never two: the proposal row's accepted type, the type the shard
// claimed when `assemble` recorded it, and the type the staged bytes actually
// declare. Folding any pair together would let a worker that stamped one thing and
// reported another pass.
function checkTypes(pairs, findings) {
  for (const [output, item] of pairs) {
    const stagedRefType = item.type === undefined ? null : item.type;
    const frontmatterType = item.tree.type === undefined ? null : item.tree.type;
    if (output.type === stagedRefType && stagedRefType === frontmatterType) continue;
    findings.push(finding('OUTPUT_TYPE_MISMATCH', {
      concept: output.concept,
      proposal_type: output.type === undefined ? null : output.type,
      staged_ref_type: stagedRefType,
      frontmatter_type: frontmatterType,
    }));
  }
}

// #160: type never determines path, so the only thing a Concept ID may derive is its
// own file, and the only thing a group may be is the directory its Concept ID names.
// A proposal row that disagrees with its own Concept ID has two target paths, and
// `publish` writes by Concept ID.
function checkTargets(pairs, findings) {
  for (const [output] of pairs) {
    const actual = `${output.concept}.md`;
    if (actual === output.target_path) continue;
    findings.push(finding('OUTPUT_TARGET_PATH_MISMATCH', { concept: output.concept, expected: output.target_path, actual }));
  }
}

function checkGroups(pairs, findings) {
  for (const [output] of pairs) {
    const derived = groupOf(output.concept);
    if (output.group === derived) continue;
    findings.push(finding('OUTPUT_GROUP_MISMATCH', { concept: output.concept, proposal_group: output.group, derived_group: derived }));
  }
}

// A group's `index.md` is reserved navigation, never a concept, and its body is the
// accepted purpose plus its own children -- re-derived here through the one renderer
// `propose` itself used, so a hand-edited index is a mismatch rather than a new
// authority. A group whose purpose was never resolved cannot have a body derived for
// it at all: `renderIndex` would have to stand in a value for the missing purpose,
// which is exactly the invention this repository refuses, so that group is reported
// unresolved and its body left uncompared.
function checkIndexes(input, findings) {
  const navigationByPath = new Map(input.navigation.map((item) => [item.path, item]));
  for (const group of sortedBy(input.groups, (item) => item.group)) {
    const row = navigationByPath.get(group.index_path);
    if (row === undefined) {
      findings.push(finding('GROUP_INDEX_MISSING', { group: group.group, index_path: group.index_path }));
    } else if (group.purpose !== null && row.body !== proposal.renderIndex(group.group, group.purpose, group.children)) {
      findings.push(finding('GROUP_INDEX_MISMATCH', { group: group.group, index_path: group.index_path }));
    }
    if (group.purpose === null) findings.push(finding('GROUP_PURPOSE_UNRESOLVED', { group: group.group }));
  }
}

// #195: a migrated Glossary is stable by default and carries no `status` at all;
// every other migrated concept is a draft until a human says otherwise. The rule is
// enforced on the staged bytes (`assembly.renderConcept` writes them that way), not
// patched afterwards -- a staged file that disagrees was written by something other
// than this migration.
function checkStatus(pairs, findings) {
  for (const [output, item] of pairs) {
    const expected = output.type === 'Glossary' ? null : 'draft';
    const actual = item.tree.status === undefined ? null : item.tree.status;
    if (actual === expected) continue;
    findings.push(finding('OUTPUT_STATUS_MISMATCH', { concept: output.concept, expected, actual }));
  }
}

// The binding a staged concept carries into `publish` (#174), checked against the
// source file's bytes *now*. Exactly one entry, for exactly the source the accepted
// proposal bound this output to. An unreadable source yields no digest and therefore
// no binding that can hold: `publish` would otherwise promote content whose claimed
// origin nobody can confirm.
function checkSourceBindings(pairs, observations, findings) {
  for (const [output, item] of pairs) {
    const expected = expectedBinding(output, observations);
    const recorded = item.sources === undefined ? [] : item.sources;
    if (observations.get(output.source) && isDeepStrictEqual(recorded, expected)) continue;
    findings.push(finding('SOURCE_BINDING_MISMATCH', { concept: output.concept, expected, recorded }));
  }
}

function expectedBinding(output, observations) {
  const sha256 = observations.has(output.source) ? observations.get(output.source) : null;
  return [{ path: output.source, sha256 }];
}

// #131: provenance is carried verbatim from the source's own frontmatter or omitted
// -- never fabricated, never repaired -- and the accepted proposal already recorded
// which it is. A staged file that added, dropped or edited it re-attributed a
// concept, which is the one thing migration may never do silently.
function checkProvenance(pairs, findings) {
  for (const [output, item] of pairs) {
    const expected = output.provenance === undefined ? null : output.provenance;
    const actual = item.tree.sources === undefined ? null : item.tree.sources;
    if (isDeepStrictEqual(actual, expected)) continue;
    findings.push(finding('PROVENANCE_MISMATCH', { concept: output.concept, expected, actual }));
  }
}

// Link decisions are part of acceptance, not of transformation: the accepted
// proposal already names, for every internal link a migrating body makes, the one
// concept it resolves to. The staged body's own links are compared as a *set*
// against the text those decisions bind, so a worker that invented a target, dropped
// a rewrite, or pointed at a concept the proposal never mentioned is named here
// rather than discovered as a broken link after publication (#148 sees only whether
// a link resolves, never whether it resolves where it was accepted to).
function checkLinks(pairs, findings) {
  for (const [output, item] of pairs) {
    const rows = output.links === undefined ? [] : output.links;
    const expected = new Set(rows.filter((row) => row.decision === 'rewritten').map((row) => boundLinkText(output.concept, row.target_concept)));
    const actual = new Set(item.links);
    const unexpected = [...actual].filter((link) => !expected.has(link)).sort();
    const missing = [...expected].filter((link) => !actual.has(link)).sort();
    if (unexpected.length > 0 || missing.length > 0) {
      findings.push(finding('LINK_TARGET_MISMATCH', { concept: output.concept, unexpected, missing }));
    }
    for (const row of sortedBy(rows.filter((entry) => entry.decision !== 'rewritten'), (entry) => entry.target_source)) {
      findings.push(finding('LINK_DECISION_UNRESOLVED', { concept: output.concept, target_source: row.target_source }));
    }
  }
}

/*
 * The caller-supplied semantic review, read only.
 *
 * This gate cannot read a document and cannot judge whether a migrated concept still
 * means what its source meant; nothing here pretends to. What it can do is hold a
 * verdict to the exact artifact it was given about: an output verdict names the body
 * digest, content scope and source digests it was formed against, and a source
 * verdict names the source digest. Once any of those stops matching what is on disk
 * now, the verdict is about something else -- stale, and blocking, exactly like a
 * missing one. A verdict that was never formed honestly in the first place is
 * invisible to every check below, and this module makes no claim to catch it.
 */
function verdictFindings(kind, subject, verdict, bindings, findings) {
  if (verdict === undefined) {
    findings.push(finding('REVIEW_VERDICT_MISSING', { kind, ...subject }));
    return;
  }
  if (verdict.verdict === 'fail') {
    findings.push(finding('REVIEW_VERDICT_FAILED', { kind, ...subject, verdict: verdict.verdict }));
    return;
  }
  if (verdict.verdict !== 'pass') {
    findings.push(finding('REVIEW_VERDICT_UNCERTAIN', { kind, ...subject, verdict: verdict.verdict }));
    return;
  }
  const broken = bindings.find((binding) => !binding.holds);
  if (broken !== undefined) {
    findings.push(finding('REVIEW_VERDICT_STALE', { kind, ...subject, binding: broken.field }));
  }
}

function checkReview(input, outputs, stagedByConcept, observations, findings) {
  const review = input.review === undefined || input.review === null ? {} : input.review;
  const outputVerdicts = new Map((review.outputs || []).map((item) => [item.concept, item]));
  const sourceVerdicts = new Map((review.sources || []).map((item) => [item.source, item]));

  for (const output of outputs) {
    const item = stagedByConcept.get(output.concept);
    const verdict = outputVerdicts.get(output.concept);
    verdictFindings('output', { concept: output.concept }, verdict, verdict === undefined ? [] : [
      { field: 'body_sha256', holds: item !== undefined && item.ok === true && verdict.body_sha256 === item.body_sha256 },
      { field: 'content_scope', holds: verdict.content_scope === output.content_scope },
      {
        field: 'sources',
        holds: Boolean(observations.get(output.source)) && isDeepStrictEqual(verdict.sources, expectedBinding(output, observations)),
      },
    ], findings);
  }

  for (const row of sortedBy(input.sources.filter((item) => item.disposition === 'migrate'), (item) => item.path)) {
    const verdict = sourceVerdicts.get(row.path);
    const digest = observations.get(row.path);
    verdictFindings('source', { path: row.path }, verdict, verdict === undefined ? [] : [
      { field: 'sha256', holds: Boolean(digest) && verdict.sha256 === digest },
    ], findings);
  }
}

function check(input) {
  const findings = [];
  // A connector row is navigation the proposal publishes directly (#170), never a
  // staged concept, so only migration outputs take part in the join.
  const outputs = sortedBy(input.outputs.filter((item) => item.origin === 'migration'), (item) => item.concept);
  const staged = sortedBy(input.staged, (item) => item.concept);
  const stagedByConcept = new Map(staged.map((item) => [item.concept, item]));
  const observations = new Map(input.observations.map((item) => [item.path, item.sha256]));

  checkDispositions(input, findings);
  checkOutputSet(outputs, staged, findings);
  checkStagedFiles(staged, findings);

  // Everything from here on compares an accepted row against the staged bytes that
  // answer it, so it runs only where both exist and the bytes could be read. The
  // absences themselves are already findings above; repeating them as six derived
  // ones would bury the one thing that actually went wrong.
  const pairs = outputs
    .filter((output) => stagedByConcept.has(output.concept) && stagedByConcept.get(output.concept).ok === true)
    .map((output) => [output, stagedByConcept.get(output.concept)]);

  checkTypes(pairs, findings);
  checkTargets(pairs, findings);
  checkGroups(pairs, findings);
  checkIndexes(input, findings);
  checkStatus(pairs, findings);
  checkSourceBindings(pairs, observations, findings);
  checkProvenance(pairs, findings);
  checkLinks(pairs, findings);
  checkReview(input, outputs, stagedByConcept, observations, findings);

  return { findings };
}

module.exports = { buildInput, check };
