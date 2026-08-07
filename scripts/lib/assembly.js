/*
 * #147: staged shard assembler and cross-worker collision handling.
 *
 * Consumes exactly what #146's `partition` operation already handed out --
 * `data.shards[]` (`{shard, sources, brief}`) and `data.cross_shard_links` --
 * together with each shard's own worker-returned content, and combines them
 * into the one staged bundle every worker's own isolated shard is only ever a
 * fragment of. This module never re-derives a mapping, a type, or a concept
 * path (#144/#145's job, already approved by the time a shard reaches here),
 * never re-parses a source file, and never re-validates a shard's own claims
 * against its brief beyond the defense-in-depth check below (`partition`'s
 * own validate mode already did that, per `skills/okf-setup/SKILL.md`'s own
 * "never treat an unvalidated shard as ready for assembly"). It only combines
 * already-approved, already-individually-validated shard output and enforces
 * the one thing no single shard's own worker can see: whether another shard
 * already claimed the same identity.
 *
 * Binding rules from #131 this module enforces at the cross-shard grain:
 *   - a target-path collision (two shards' own concepts sharing one
 *     `concept` path) always blocks -- never a silent rename, merge,
 *     overwrite, or re-attribution. This is a genuine gap `migration-plan`'s
 *     own collision check cannot see on its own: `scripts/lib/migration.js`'s
 *     `classify()` only ever checks a candidate path against the bundle
 *     already published on disk, never against a sibling entry in the same
 *     plan, so two sources sharing a deterministic target directory-and-
 *     basename (#145's `conceptPathFor`) can both reach `migrate`
 *     disposition undetected until assembly.
 *   - an exact cross-shard content duplicate (identical `body`, different
 *     `concept`) is surfaced as a non-blocking candidate -- #145's own
 *     `deriveDuplicates` precedent, extended across shard boundaries -- never
 *     silently merged, renamed, or deduplicated. A near duplicate (similar
 *     but not byte-identical content) is never even compared here: this
 *     module has no fuzzy-match heuristic to invent one with, so two sources
 *     at two different concept paths simply both stay, exactly as approved.
 *   - a cross-shard link (#146's own `data.cross_shard_links`) that still
 *     resolves once every shard has returned is simply resolved; one whose
 *     target concept never made it into the assembled result (its own shard
 *     blocked that source, or never returned it) is a stronger signal than
 *     an ordinary broken link -- migration-caused relationship loss -- and is
 *     named as its own distinct finding rather than folded into a generic
 *     broken-link warning. Ordinary link integrity beyond this shard-boundary
 *     set is #148's job, not this module's.
 *   - nothing silently disappears: a source path claimed by two different
 *     shards is refused rather than silently accepted from whichever shard
 *     is read first (`scripts/lib/setup.js`'s own shard-set coverage check
 *     refuses a *missing* shard before this module ever runs).
 *   - a shard's own reported `blockers` are carried forward verbatim; their
 *     presence marks the assembled result `partial` (unresolved, not
 *     publishable) rather than blocking assembly outright -- the concepts
 *     every *other* source in the corpus already resolved to are still
 *     staged, exactly #131's "partial work MUST remain staged and reported".
 */

const validation = require('./validation');
const partition = require('./partition');

// A concept file's own frontmatter is exactly its approved `type` and the
// provenance its own source's frontmatter already declared (verbatim, or
// omitted -- never fabricated, see `mapping.js`'s own `extractProvenance`),
// plus `status: "draft"`, the same status every freshly created concept gets
// (`validation.evaluateCreate`). Reuses `validation.serializeFrontmatter`
// rather than a second YAML writer.
function renderConcept(type, sources, body) {
  const tree = { type, status: 'draft' };
  if (Array.isArray(sources) && sources.length > 0) tree.sources = sources;
  return validation.serializeFrontmatter(tree) + body;
}

// Combines every shard's own already-validated content. `shardContents` is a
// `Map<shardId, shardObject>`; `partitionShards` is `partition`'s own
// `data.shards` array (`{shard, sources, brief}`), unmodified. Returns either
// `{ok: false, ...}` naming exactly what was wrong, or `{ok: true, concepts,
// references, blockers, duplicates}` -- `concepts` already carries each
// item's own rendered file text, ready to stage.
function computeAssembly(partitionShards, shardContents) {
  // Defense in depth: `skills/okf-setup/SKILL.md` already requires every
  // shard to pass `partition`'s own validate mode before it is ever staged,
  // but nothing stops a caller from handing this operation a shard that
  // skipped that step, or one edited afterward.
  for (const shard of partitionShards) {
    const result = partition.validateShard(shard.brief, shardContents.get(shard.shard));
    if (!result.ok) return { ok: false, shard: shard.shard, code: result.code, detail: result.detail };
  }

  const concepts = [];
  const references = [];
  const blockers = [];
  const claimed = new Map(); // source path -> the one shard allowed to claim it

  for (const shard of partitionShards) {
    const content = shardContents.get(shard.shard);
    for (const [list, items] of [[concepts, content.concepts], [references, content.references], [blockers, content.blockers]]) {
      for (const item of items) {
        const owner = claimed.get(item.path);
        if (owner !== undefined) {
          return { ok: false, shard: shard.shard, code: 'ASSEMBLY_SOURCE_DUPLICATE', detail: { path: item.path, shards: [owner, shard.shard] } };
        }
        claimed.set(item.path, shard.shard);
        list.push({ ...item, shard: shard.shard });
      }
    }
  }

  const byConcept = new Map();
  for (const item of concepts) {
    if (!byConcept.has(item.concept)) byConcept.set(item.concept, []);
    byConcept.get(item.concept).push(item);
  }
  const collisions = [...byConcept.values()]
    .filter((claims) => claims.length > 1)
    .map((claims) => ({ concept: claims[0].concept, claims: claims.map((c) => ({ path: c.path, shard: c.shard })) }));
  if (collisions.length > 0) return { ok: false, code: 'CONCEPT_TARGET_COLLISION', collisions };

  const byBody = new Map();
  for (const item of concepts) {
    if (!byBody.has(item.body)) byBody.set(item.body, []);
    byBody.get(item.body).push(item);
  }
  const duplicates = [...byBody.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      concepts: group.map((c) => c.concept).sort(),
      shards: [...new Set(group.map((c) => c.shard))].sort(),
    }));

  const briefByShard = new Map(partitionShards.map((shard) => [shard.shard, shard.brief]));
  const rendered = concepts.map((item) => {
    const approved = briefByShard.get(item.shard).mapping.find((entry) => entry.path === item.path);
    const sources = approved ? approved.sources : null;
    return { path: item.path, concept: item.concept, type: item.type, shard: item.shard, rendered: renderConcept(item.type, sources, item.body) };
  });

  return { ok: true, concepts: rendered, references, blockers, duplicates };
}

// #146's own `cross_shard_links` re-checked against the concepts assembly
// actually produced: a link is `resolved` once its target concept made it
// into the assembled set, or `lost` -- migration-caused relationship loss --
// when it did not (the target's own shard blocked that source, or never
// returned it). Ordinary link integrity beyond this shard-boundary set is
// #148's job, not this module's.
function resolveCrossShardLinks(crossShardLinks, concepts) {
  const conceptPaths = new Set(concepts.map((item) => item.concept));
  const resolved = [];
  const lost = [];
  for (const link of crossShardLinks) {
    if (conceptPaths.has(link.to)) resolved.push({ from: link.from, to: link.to });
    else lost.push({ from: link.from, to: link.to, from_shard: link.from_shard, to_shard: link.to_shard });
  }
  return { resolved, lost };
}

module.exports = { renderConcept, computeAssembly, resolveCrossShardLinks };
