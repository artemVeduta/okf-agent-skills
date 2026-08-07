/*
 * #146: dynamic semantic partitioner and delegated worker protocol.
 *
 * Upstream is exactly `migration-plan`'s (#144/#145) own output shape, unmodified:
 * `plan.entries` (`{path, disposition, reason, concept, type}`), `mapping` (one
 * `{path, concept, type, sources, body}` per `migrate` entry, already link-rewritten
 * against every other source that same call migrated), and `references` (one
 * `{path, reference_path}` per `residue` entry). This module never re-reads a source
 * file and never re-derives a disposition or a type -- it only groups an already-
 * determined plan into shards small and local enough for a fresh-context worker to
 * convert without the coordinator ever holding the whole corpus in its own context
 * (#131's "must not load a large docs corpus into its own context" is the entire
 * point of delegation).
 *
 * Grouping is by directory locality first (#131's own example: `docs/payments/**`,
 * `docs/auth/**`, `docs/architecture/**`, `research/**`, `ADR/**`), refined one
 * directory level deeper only when a group is still oversized, and only falls back to
 * plain file-count chunking once a group can no longer be split by directory at all.
 * `DEFAULT_MAX_SOURCES_PER_SHARD` is a named, overridable heuristic (`options.
 * maxSourcesPerShard`), never a magic number buried in a condition -- #131 is
 * explicit that the exact threshold is an implementation heuristic, not contract.
 *
 * A link between two migrating sources that #145 already rewrote (because the
 * target was resolvable in that same call) can still end up split across two
 * shards once this module groups them. That is never silently dropped:
 * `crossShardLinks()` re-resolves every migrated body's own already-rewritten links
 * (reusing `validation.markdownLinks`/`bodyLinkPath`, not a second parser) against
 * the full concept index, and a resolved target landing in a different shard is
 * surfaced as a `cross_shard_link` warning -- the "report the cross-shard link as a
 * warning" half of #131's two sanctioned responses to this problem. The other half,
 * keeping connected sources together, is exactly what grouping by shared directory
 * already does whenever two linked sources live side by side, which is the common
 * case the whole `docs/payments/**` example is built on.
 *
 * `buildBrief()` is the narrow, immutable context a worker receives (#131 section
 * 11): project mode, its own assigned sources and their approved mapping/type, its
 * own assigned residue evidence, the OKF version -- the authoring contract's own
 * version tag, exactly as `monorepo.buildBrief` already treats "no corpus, no
 * authoring prose duplicated from the contract, only its version tag" -- the target
 * `cwd`/`bundle`, and `neighbors`: the target concept path for every cross-shard
 * link this shard's own sources make, so a worker can still author a correct
 * reference to a concept it will never hold the content of, without being handed
 * any of that concept's own body.
 *
 * `validateShard()` checks a worker's returned shard against this same protocol:
 * every field present and correctly shaped, and, critically, that the worker
 * claimed nothing outside what its own brief actually assigned it. This guards only
 * the shard *envelope* -- the coordinator's own cross-worker collision handling and
 * assembly is #147's job, and whole-bundle OKF v0.2 conformance is #148's; neither
 * is this function's concern.
 */

const path = require('node:path');
const validation = require('./validation');

// ponytail: file-count chunking is the last-resort heuristic split, consulted only
// once semantic locality can no longer separate a group -- not the primary rule.
// Override via `options.maxSourcesPerShard` when a corpus's own shape warrants it.
const DEFAULT_MAX_SOURCES_PER_SHARD = 8;

// ------------------------------------------------------------------- path helpers

function dirOf(sourcePath) {
  const dir = path.posix.dirname(sourcePath);
  return dir === '.' ? '' : dir;
}

function depthOf(sourcePath) {
  const dir = dirOf(sourcePath);
  return dir === '' ? 0 : dir.split('/').length;
}

function localityKey(sourcePath, depth) {
  const dir = dirOf(sourcePath);
  return dir === '' ? '' : dir.split('/').slice(0, depth).join('/');
}

function byPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

// ------------------------------------------------------------- locality grouping

function groupByLocality(items, depth) {
  const groups = new Map();
  for (const item of items) {
    const key = localityKey(item.path, depth);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function chunkByCount(items, size) {
  const sorted = items.slice().sort(byPath);
  const chunks = [];
  for (let i = 0; i < sorted.length; i += size) chunks.push(sorted.slice(i, i + size));
  return chunks;
}

// A group at or under `maxSize` is accepted as-is, whatever its own directory
// structure -- semantic locality only refines a group the size heuristic actually
// requires refining, it never splits further than that. An oversized group is
// regrouped one directory level deeper wherever that separates it; once every item
// left in a group has run out of directory segments to refine on (`exhausted`),
// further recursion would reproduce the exact same single group forever, so this
// falls back to the plain file-count heuristic split instead.
function refine(items, maxSize, depth) {
  if (items.length <= maxSize) return [items];
  const groups = groupByLocality(items, depth);
  if (groups.size > 1) {
    const result = [];
    for (const group of groups.values()) result.push(...refine(group, maxSize, depth + 1));
    return result;
  }
  const [only] = groups.values();
  const exhausted = only.every((item) => depthOf(item.path) <= depth);
  return exhausted ? chunkByCount(only, maxSize) : refine(only, maxSize, depth + 1);
}

function localityGroups(items, maxSize) {
  if (items.length === 0) return [];
  return refine(items.slice().sort(byPath), maxSize, 1);
}

// The longest shared directory prefix across a group's own sources -- a human-
// readable shard label ("docs/payments"), not an identity: uniqueness against a
// sibling group with the same prefix (a directory split further only by the
// file-count fallback) is handled by the caller.
function commonPrefixLabel(items) {
  const segmentLists = items.map((item) => dirOf(item.path).split('/').filter(Boolean));
  let prefix = segmentLists[0] || [];
  for (const segments of segmentLists.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < segments.length && prefix[i] === segments[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.join('/') || '(root)';
}

function labelShards(groups) {
  const seen = new Map();
  return groups.map((group) => {
    const label = commonPrefixLabel(group);
    const count = (seen.get(label) || 0) + 1;
    seen.set(label, count);
    return { id: count === 1 ? label : `${label}#${count}`, items: group };
  });
}

// ------------------------------------------------------------------- link graph

// For every `migrate` entry, the set of other migrating concepts its own
// (already-rewritten) body actually links to. Reuses `validation.markdownLinks`/
// `bodyLinkPath` -- the same shared, non-fenced, non-inline-code, non-image link
// scan `mapping.js` itself is built on -- rather than a second parser. A rewritten
// link's target is always `path.posix.relative(dirname(ownConcept.md),
// targetConcept.md)` (`mapping.rewriteLinks`'s own contract), so resolving it back
// against `dirname(ownConcept.md)` recovers exactly the target concept, with no
// extra file reads and no access to any other shard's own source content.
function linkedConcepts(concept, body, conceptFiles) {
  const ownDir = path.posix.dirname(`${concept}.md`);
  const targets = new Set();
  for (const raw of validation.markdownLinks(body)) {
    const targetPath = validation.bodyLinkPath(raw);
    if (!targetPath) continue;
    const resolved = path.posix.normalize(path.posix.join(ownDir, targetPath));
    const target = conceptFiles.get(resolved);
    if (target && target !== concept) targets.add(target);
  }
  return [...targets].sort();
}

// ----------------------------------------------------------------------- shards

function conceptEntries(entries) {
  return entries.filter((entry) => entry.disposition === 'migrate');
}

function residueEntries(entries) {
  return entries.filter((entry) => entry.disposition === 'residue');
}

function mappingByPath(mapping) {
  return new Map(mapping.map((item) => [item.path, item]));
}

function referencesByPath(references) {
  return new Map(references.map((item) => [item.path, item]));
}

// The deterministic partition (#146's own job): one shard per locality group,
// carrying only the slice of `mapping`/`references` its own sources need, plus the
// cross-shard links its own sources make into a concept some other shard owns.
// `plan.executable` must already be `true` -- this module partitions a fully
// determined plan, it never resolves an open question itself.
function computePartition(plan, mapping, references, options = {}) {
  const maxSize = options.maxSourcesPerShard || DEFAULT_MAX_SOURCES_PER_SHARD;
  const mapped = mappingByPath(mapping);
  const referenced = referencesByPath(references);

  const items = [
    ...conceptEntries(plan.entries).map((entry) => ({ path: entry.path, kind: 'concept', concept: entry.concept })),
    ...residueEntries(plan.entries).map((entry) => ({ path: entry.path, kind: 'residue' })),
  ];
  const shards = labelShards(localityGroups(items, maxSize));

  const conceptFiles = new Map(); // "<concept>.md" -> concept
  const shardOfConcept = new Map(); // concept -> shard id
  for (const shard of shards) {
    for (const item of shard.items) {
      if (item.kind !== 'concept') continue;
      conceptFiles.set(`${item.concept}.md`, item.concept);
      shardOfConcept.set(item.concept, shard.id);
    }
  }

  const crossShardLinks = [];
  const neighborsByShard = new Map(shards.map((shard) => [shard.id, new Set()]));
  for (const shard of shards) {
    for (const item of shard.items) {
      if (item.kind !== 'concept') continue;
      const entry = mapped.get(item.path);
      if (!entry) continue;
      for (const target of linkedConcepts(item.concept, entry.body, conceptFiles)) {
        const targetShard = shardOfConcept.get(target);
        if (targetShard && targetShard !== shard.id) {
          neighborsByShard.get(shard.id).add(target);
          crossShardLinks.push({ from: item.concept, to: target, from_shard: shard.id, to_shard: targetShard });
        }
      }
    }
  }

  const result = shards.map((shard) => {
    const sources = shard.items.map((item) => item.path).sort();
    const shardMapping = shard.items.filter((item) => item.kind === 'concept').map((item) => mapped.get(item.path));
    const shardReferences = shard.items.filter((item) => item.kind === 'residue').map((item) => referenced.get(item.path));
    const neighbors = [...neighborsByShard.get(shard.id)].sort().map((concept) => ({ concept }));
    return {
      shard: shard.id,
      sources,
      brief: buildBrief(shard.id, sources, shardMapping, shardReferences, neighbors, options),
    };
  });

  return { shards: result, crossShardLinks, maxSourcesPerShard: maxSize };
}

// ------------------------------------------------------------------- worker brief

// The narrow, immutable context a worker receives (#131 section 11) -- nothing
// beyond its own assigned sources, their approved mapping, its own residue
// evidence, the target namespace it writes into, and the minimal cross-shard
// neighbor index needed to keep an outbound link semantically correct. No sibling
// shard's sources, no corpus, no authoring prose duplicated from the contract.
function buildBrief(shardId, sources, mapping, references, neighbors, options) {
  return {
    shard: shardId,
    cwd: options.cwd,
    bundle: options.bundle === undefined ? 'okf' : options.bundle,
    project_mode: options.projectMode === undefined ? null : options.projectMode,
    okf_version: '0.2',
    sources,
    mapping,
    references,
    neighbors,
  };
}

// ---------------------------------------------------------------- shard protocol

const SHARD_FIELDS = new Set(['shard', 'concepts', 'references', 'warnings', 'blockers']);

function invalid(code, detail) {
  return { ok: false, code, detail };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

// Validates a worker's returned shard against the exact protocol this module's own
// `buildBrief()` promised it: every concept and reference the brief assigned is
// accounted for (converted, or explicitly named in `blockers` -- never silently
// missing), and nothing claims a source, concept, or reference path outside what
// the brief actually assigned. This checks the shard *envelope* only -- OKF
// concept-content conformance is #148's job, not this function's.
function validateShard(brief, shard) {
  if (!isPlainObject(shard)) return invalid('SHARD_MALFORMED', { reason: 'not_an_object' });
  for (const field of Object.keys(shard)) {
    if (!SHARD_FIELDS.has(field)) return invalid('SHARD_UNKNOWN_FIELD', { field });
  }
  if (shard.shard !== brief.shard) return invalid('SHARD_IDENTITY_MISMATCH', { expected: brief.shard, actual: shard.shard });

  const assignedMapping = new Map(brief.mapping.map((item) => [item.path, item]));
  const assignedReferences = new Map(brief.references.map((item) => [item.path, item]));
  const assignedSources = new Set(brief.sources);

  if (!Array.isArray(shard.concepts)) return invalid('SHARD_MALFORMED', { field: 'concepts' });
  const concepts = new Set();
  for (const item of shard.concepts) {
    if (!isPlainObject(item) || !nonEmptyString(item.path) || !nonEmptyString(item.concept) ||
      !nonEmptyString(item.type) || typeof item.body !== 'string') {
      return invalid('SHARD_MALFORMED', { field: 'concepts', path: item && item.path });
    }
    const approved = assignedMapping.get(item.path);
    if (!approved) return invalid('SHARD_SOURCE_NOT_ASSIGNED', { path: item.path });
    if (item.concept !== approved.concept || item.type !== approved.type) {
      return invalid('SHARD_CONCEPT_MISMATCH', { path: item.path, expected: approved.concept, actual: item.concept });
    }
    if (concepts.has(item.path)) return invalid('SHARD_DUPLICATE_ENTRY', { path: item.path });
    concepts.add(item.path);
  }

  if (!Array.isArray(shard.references)) return invalid('SHARD_MALFORMED', { field: 'references' });
  const refs = new Set();
  for (const item of shard.references) {
    if (!isPlainObject(item) || !nonEmptyString(item.path) || !nonEmptyString(item.reference_path)) {
      return invalid('SHARD_MALFORMED', { field: 'references', path: item && item.path });
    }
    const approved = assignedReferences.get(item.path);
    if (!approved) return invalid('SHARD_SOURCE_NOT_ASSIGNED', { path: item.path });
    if (item.reference_path !== approved.reference_path) {
      return invalid('SHARD_REFERENCE_MISMATCH', { path: item.path, expected: approved.reference_path, actual: item.reference_path });
    }
    if (refs.has(item.path)) return invalid('SHARD_DUPLICATE_ENTRY', { path: item.path });
    refs.add(item.path);
  }

  if (!Array.isArray(shard.warnings) || shard.warnings.some((item) => typeof item !== 'string')) {
    return invalid('SHARD_MALFORMED', { field: 'warnings' });
  }

  if (!Array.isArray(shard.blockers)) return invalid('SHARD_MALFORMED', { field: 'blockers' });
  const blocked = new Set();
  for (const item of shard.blockers) {
    if (!isPlainObject(item) || !nonEmptyString(item.path) || !nonEmptyString(item.reason)) {
      return invalid('SHARD_MALFORMED', { field: 'blockers', path: item && item.path });
    }
    if (!assignedSources.has(item.path)) return invalid('SHARD_SOURCE_NOT_ASSIGNED', { path: item.path });
    blocked.add(item.path);
  }

  for (const sourcePath of assignedMapping.keys()) {
    if (!concepts.has(sourcePath) && !blocked.has(sourcePath)) return invalid('SHARD_INCOMPLETE', { path: sourcePath });
  }
  for (const sourcePath of assignedReferences.keys()) {
    if (!refs.has(sourcePath) && !blocked.has(sourcePath)) return invalid('SHARD_INCOMPLETE', { path: sourcePath });
  }

  return { ok: true };
}

module.exports = { DEFAULT_MAX_SOURCES_PER_SHARD, computePartition, buildBrief, validateShard };
