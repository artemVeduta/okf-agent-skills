# 05 — Stable Identity, Duplicate Detection, Redirects, and Link Rewriting

> **Superseded in part — 2026-08-01.** The research below is retained unchanged as the record of
> what was believed and why. An adopted ticket resolution always supersedes a research note; this
> note is evidence, never policy. These claims no longer hold:
>
> - **The two-tier identity model — an immutable `concept_id` (UUID v7) in frontmatter and in the
>   filename, with a mutable path as location and identity-based linking through a bundle-level
>   ID→path index (§1.3, §identity-based linking, D1)** — superseded by
>   [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22):
>   the Concept ID is the bundle-relative path without `.md`, moving or renaming changes identity,
>   and no suite UUID or frontmatter extension claims continuity.
> - **Redirect implementations — stub files at old paths, `aliases` frontmatter, redirect-chain and
>   cycle handling** — superseded by
>   [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24):
>   `redirects` resolves to `{mode: 'off'}` for `v0.1.0`; a retired path vacates outright and
>   safety rests on total inbound-link rewriting.
> - **Automatic duplicate resolution — `-2` suffix renames, keeping the first path and redirecting
>   the second, deleting exact duplicates** — superseded by
>   [Define safe migration of existing knowledge into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/19):
>   exact duplicates are reported as candidates only; near-duplicates, conflicting claims and
>   identifier collisions block until the user chooses, and an existing target-path collision
>   blocks the plan.
>
> Primary-source investigation, 2026-07-26.
>
> **Evidence** = directly supported by a cited source (spec, standard, code, doc).
> **Inference** = interpretation of evidence, not independently proven.
> **Candidate default** = an operational hypothesis requiring prototype or fixture
> benchmarks.
> **Decision required** = unresolved semantics that tooling must not invent.

---

## 1. Stable Identity Strategies

### 1.1 Extrinsic Identifiers (Authoritative Registration)

Digital preservation distinguishes extrinsic (registry-assigned) from intrinsic (content-derived) identifiers.

**DOIs (Digital Object Identifiers):**
Over 200 million DOIs issued. DOIs are persistent but not inherently stable — they require an institutional resolver with a commitment to maintain resolution. The Handle System provides the underlying resolution infrastructure; the DOI Foundation provides policy and metadata.

**Evidence:** Wikipedia [Persistent identifier](https://en.wikipedia.org/wiki/Persistent_identifier) article lists DOI, Handle, ARK, PURL as extrinsic persistent identifier systems. "Persistence is purely a matter of service" — no identifier is inherently persistent; persistence requires someone to commit to resolving them.

**ARKs (Archival Resource Keys):**
8.2 billion ARKs issued. ARKs support hostname-level resolution replacement, meaning the identifier survives even if the host institution changes its domain.

**SWHIDs (Software Hash Identifiers):**
ISO/IEC 18670:2025 standard. Intrinsic identifier — derived from a cryptographic hash of the software artifact's content, forming a Merkle DAG of snapshots, releases, revisions, directories, and content blobs. No external registry required. The scheme `swh:<version>:<object_type>:<object_id>[;qualifiers]` encodes both identity and provenance.

**Evidence:** SWHID [Wikipedia article](https://en.wikipedia.org/wiki/Software_Hash_Identifier): "an intrinsic identifier in the sense that it describes the software based only on the software's intrinsic properties, with no reliance on an external register." [SWHID specification](https://www.swhid.org/specification/v1.2/): qualified identifiers include `origin`, `visit`, `anchor`, `path`, `lines`.

### 1.2 Intrinsic (Content-Derived) Identifiers

**Git's content-addressable model (SHA-1):**
Every object (blob, tree, commit, tag) is identified by the SHA-1 hash of its content. Object identity is immutable — changing content produces a different object. Git does not track file identity across renames in the object model; rename detection is a heuristic performed at query time.

**Evidence:** Wikipedia [Git article](https://en.wikipedia.org/wiki/Git): "Each object is identified by a SHA-1 hash of its contents. Git computes the hash and uses this value for the object's name." Rename detection: "Git addresses the issue by detecting renames while browsing the history of snapshots rather than recording it when making the snapshot."

**Content-addressable storage (CAS):**
CAS generates a cryptographic hash of document content as its key. Identical content produces identical keys, enabling automatic deduplication. CAS is historically used for Write-Once-Read-Many (WORM) archives and compliance storage.

**Evidence:** Wikipedia [Content-addressable storage](https://en.wikipedia.org/wiki/Content-addressable_storage): "CAS systems work by passing the content of the file through a cryptographic hash function to generate a unique key, the 'content address'." "The directory does not map filenames onto locations, but uses the keys instead." "Because an attempt to store the same file will generate the same key, CAS systems ensure that the files within them are unique."

**SHA-256 for content identity:**
SHA-256 is the current standard for cryptographic content hashing. IPFS uses SHA-256-based multihash for content addressing. Nix uses SHA-256 for content-addressed store paths.

**Inference:** An OKF concept could carry a `content_hash` field (SHA-256 of normalized body + key frontmatter fields) enabling content-based identity alongside path-based identity. This allows a concept to be recognized as "the same" even when moved or renamed, paralleling CAS deduplication.

### 1.3 UUID-Based Identity

**UUID (RFC 9562, formerly RFC 4122):**
A 128-bit identifier with negligible collision probability. Key versions:
- **v4 (random):** 122 random bits. 5.3\*10^36 possible values. General purpose.
- **v5 (name-based, SHA-1):** Deterministic from namespace + name. Same inputs always produce the same UUID.
- **v7 (timestamp-ordered, Unix epoch ms):** 48-bit timestamp + 74 bits of randomness/counter. Sortable. Optimized for database keys.

**Evidence:** Wikipedia [UUID article](https://en.wikipedia.org/wiki/Universally_unique_identifier) and RFC 9562: "When generated according to the standards, UUIDs are, for practical purposes, unique. Their uniqueness does not depend on a central registration authority." v4 collision probability: 2.71 quintillion UUIDs needed for 50% collision chance.

### 1.4 Path-Based Identity (Current OKF State)

**OKF v0.2 has no concept-level identity field.** The spec defines no frontmatter field for a stable identifier. Concept identity is implicitly the bundle-relative path. OKF v0.2 states bundle-relative paths are "recommended for stability when documents move" — but a path changes when the document moves, making it inherently unstable as an identity.

**Evidence:** `okf-spec-and-ecosystem.md`: Cross-linking uses two forms: "Absolute (bundle-relative): `[label](/path/to/concept.md)` — recommended for stability when documents move." The `sources[].id` field is described as "a stable join key for footnote-based per-claim attribution" — but this is a source citation key, not a concept identity field.

**Evidence:** `workspace-topology-and-routing.md` §10.2: "Concept identity key: What makes two concepts 'the same'? Options: `resource` field, bundle-relative path, explicit `okf_id` extension. Recommended: `resource` field where available, fall back to bundle-relative path."

**Inference:** OKF tooling that performs move/rename/split/merge operations on concepts needs an identity mechanism that survives path changes. The current path-based identity model is insufficient when concepts need to be restructured.

### 1.5 Zettelkasten ID Patterns

The Zettelkasten tradition records identity orthogonally to location:

1. **Luhmann's folgezettel (sequential branching):** IDs like `1`, `1a`, `1a1`, `1b`, `2`. Branched numerically. Designed for physical index cards. Digital systems don't need the sequential placement aspect.

2. **Timestamp-based:** `YYYYMMDDHHMM` or Unix epoch. Sortable, monotonically increasing, but not collision-proof in concurrent or automated generation.

3. **UUID-based:** Modern digital Zettelkasten tools increasingly default to UUIDs. Decouples identity from content and location.

4. **Redundant ID storage:** Zettelkasten.de recommends placing the note ID in both filename and body to survive tool changes.

**Evidence:** `obsidian-transferable-patterns.md`: "Zettelkasten.de recommends placing the note ID in both the filename and the file body to survive tool changes." "Filename/path identity conflicts with moves; benchmark immutable IDs plus routing/alias metadata against path identity."

**Candidate default:** Two-tier identity: (1) immutable `concept_id` (UUID v7) stored in frontmatter, and (2) mutable `path` as the current location. Cross-links use `concept_id` references; path-based links are resolved at consumption time via a bundle-level identity→path index. The `concept_id` follows Zettelkasten.js redundant storage: in both frontmatter and filename (e.g., `a1b2c3d4-concept-name.md`).

**Candidate default:** UUID v7 over v4 because timestamp-ordering enables sort-by-creation in index files without additional metadata. The 48-bit millisecond timestamp provides ~8,900 years of headroom from Unix epoch.

**Decision required:** Choose how OKF concepts are identified: path-only (current OKF), `resource`-field identity (OKF v0.2's implicit anchor), explicit UUID/URN in frontmatter, or content hash. This decision gates all rename, split, merge, duplicate detection, and redirect behavior.

---

## 2. Duplicate Detection

### 2.1 Exact Match

**Definition:** Two documents are duplicates if their normalized content is byte-for-byte identical.

**Implementation:** Compare SHA-256 hashes of normalized content (whitespace-normalized, YAML frontmatter extracted, Markdown body only). CAS pattern: identical hash = identical document.

**Evidence:** CAS systems (Wikipedia) use the content hash as both identity and deduplication mechanism: "an attempt to store the same file will generate the same key." Git deduplicates blobs automatically: two identical file contents produce the same blob hash.

**Candidate default:** Compute `sha256(normalize(body))` for each concept during migration. A hash collision proves exact duplication. Store the hash as `content_hash` in frontmatter for future incremental deduplication.

### 2.2 Normalized Match (Structural Equivalence)

**Definition:** Two documents are the "same concept" if their normalized content is structurally equivalent, differing only in non-semantic whitespace, comment-style annotations, or markup formatting.

**Implementation:** Strip YAML frontmatter of metadata fields that vary by migration date (e.g., `generated.at`, `migrated_at`). Normalize Markdown to remove trailing whitespace, unify newlines, normalize heading styles, collapse empty lines. Compare SHA-256 of normalized output.

**Candidate default:** Normalize frontmatter to keep only `type`, `title`, `resource`, and `description`. Normalize body to plain text (strip Markdown formatting, code fences kept as content). Use this for initial migration duplicate detection.

### 2.3 Near-Duplicate / Semantic Similarity

**Google-scale prior art:**

- **SimHash (Charikar, 2002):** Used by Google crawler for near-duplicate web page detection. Produces a fixed-size fingerprint where Hamming distance approximates cosine similarity. Efficient for pairwise comparison: sort by hash, compare adjacent items in O(n log n) rather than O(n^2).

  **Evidence:** Wikipedia [SimHash](https://en.wikipedia.org/wiki/SimHash): "SimHash creates hashes that produce similar hashes for similar input data, measured as the bitwise hamming distance between values." "If the SimHash bitwise hamming distance of two phrases is low then their Jaccard coefficient is high."

- **MinHash (Broder, 1997):** Estimates Jaccard similarity between sets (e.g., sets of n-grams or shingles). Used by AltaVista and Google News for duplicate detection. k hash functions produce k-element signature; Jaccard ≈ fraction of matching minimum hashes.

  **Evidence:** Wikipedia [MinHash](https://en.wikipedia.org/wiki/MinHash): "The probability that h_min(A) = h_min(B) is exactly the Jaccard index." Google 2007: SimHash for web crawling, MinHash + LSH for Google News personalization.

- **Locality-sensitive hashing (LSH):** General framework for hashing similar items into the same bucket with high probability. MinHash and SimHash are specific LSH families. Used for approximate nearest neighbor search, clustering, and deduplication at scale.

  **Evidence:** Wikipedia [LSH](https://en.wikipedia.org/wiki/Locality-sensitive_hashing): "A fuzzy hashing technique that hashes similar input items into the same 'buckets' with high probability."

**Practical text similarity approaches for OKF corpus (100s-10,000s of documents):**

1. **w-shingling + MinHash:** Split text into overlapping word n-grams (shingles). Compute MinHash signatures. Documents with high signature overlap are near-duplicate candidates. Accurate but computationally more expensive than SimHash.

2. **TF-IDF + cosine similarity:** Compute TF-IDF vectors for documents. Cosine similarity > threshold (e.g., 0.85) indicates near-duplicate. Computationally expensive for pairwise comparison; use LSH for bucketing first.

3. **SimHash (fingerprint):** Compute 64-bit or 128-bit SimHash of tokenized body. Hamming distance < threshold (e.g., 3 for 64-bit) indicates near-duplicate. Fastest for pairwise comparison.

**Inference:** For an OKF migration tool, exact match (SHA-256) is sufficient for initial deduplication. SimHash or w-shingling + MinHash adds near-duplicate detection but at increased complexity. The vast majority of migration duplicates will be exact copies (same content imported from different sources).

**Candidate default:** Three-tier duplicate detection during migration:
1. **Tier 1 (exact):** SHA-256 of normalized content. Deterministic, zero false positives.
2. **Tier 2 (structural):** SHA-256 of frontmatter-stripped body. Catches documents with identical bodies but different metadata.
3. **Tier 3 (near-duplicate):** SimHash (64-bit) of tokenized body, Hamming distance ≤ 3. Surfaces candidate duplicates for human review. Only run if Tier 1 and Tier 2 find no match.

**Decision required:** Whether to implement near-duplicate detection at migration time (computationally expensive, requires threshold calibration) or defer to post-migration maintenance (run SimHash periodically, surface candidates in a review queue).

### 2.4 Semantic Similarity (LLM-Based)

Modern LLM-based embeddings can detect "same meaning, different words" duplicates.

**Inference:** Embedding models (e.g., text-embedding-3-small) produce dense vectors. Cosine similarity of embeddings captures semantic similarity beyond surface text overlap. This is more expensive and less deterministic than SimHash but catches genuine semantic duplicates that differ in wording.

**Candidate default:** Defer semantic duplicate detection to a post-migration review queue surfaced by the concept `log.md` system. Not part of automated migration decisions.

---

## 3. Conflict Resolution Strategies

When two documents map to the same target path during migration, or when duplicate detection finds a match, a resolution strategy is required.

### 3.1 Strategy Taxonomy

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **First-wins** | First document written to target path wins; subsequent documents at same path are rejected or renamed | Simplest. Suited for migration where source order is meaningful |
| **Last-wins** | Last document written overwrites previous. Earlier content is lost | Not recommended. Loses information |
| **Merge** | Combine frontmatter fields intelligently (merge `sources`, `tags`, keep most recent `generated.at`, merge bodies with demarcation) | When both documents contribute non-overlapping knowledge |
| **Human review queue** | Conflict is surfaced. A human or agent decides merge vs. keep-one vs. split | The safest default |

### 3.2 OKF-Specific Conflict Scenarios

**Scenario A: Same path, same content (exact duplicate).**
**Candidate default:** Accept the first, discard subsequent. Log the discard with reason "exact duplicate" in `log.md`. No human review required.

**Scenario B: Same path, different content (path collision).**
**Candidate default:** Rename the later document with a `-2`, `-3` suffix (WordPress pattern). Add a `redirect_from` / `alias` to the original path in the renamed document's frontmatter. Log the collision and rename in `log.md`.

**Evidence:** WordPress `wp_unique_post_slug()` uses `-2`, `-3`, `-N` suffix pattern: `_truncate_post_slug($slug, 200 - (strlen($suffix) + 1)) . "-$suffix"`. Scope is per post type and optionally per parent.

**Scenario C: Same content hash, different paths (same concept in two locations).**
**Candidate default:** Keep the first path encountered. Create a redirect (frontmatter alias or standalone redirect file) from the second path to the first. This is a "deduplication merge" — the concept exists once; multiple paths redirect to it.

**Scenario D: Different content, same `resource` field.**
**Inference:** Two concepts claiming the same `resource` may represent different perspectives or different snapshots in time. Not automatically a conflict; both may be valid. Surface for review if significant body overlap detected.

**Candidate default:** Three-tier conflict severity:
1. **Resolved automatically:** Exact duplicate (same hash), path collision with similar content (merge tags/sources, keep richer body).
2. **Resolved with rename + redirect:** Path collision with significantly different content.
3. **Surfaced for human review:** Same `resource`, near-duplicate bodies, conflicting `type` fields, contradictory `status` values.

### 3.3 WordPress Slug Uniqueness Pattern

**Evidence:** WordPress `wp_unique_post_slug()` implementation: (1) checks database for existing slug within scope, (2) if collision, appends `-$suffix` with incrementing integer starting at 2, (3) truncates to 200 characters minus suffix length, (4) scope-aware: hierarchical post types only check within same parent, flat post types check globally, attachment slugs check across all types.

**Inference:** This pattern translates directly to filesystem slug uniqueness: append `-2`, `-3` when a filename collision occurs within the same directory. The scope (same-directory vs. bundle-global) is a design choice.

**Candidate default:** Directory-scoped slug uniqueness (like WordPress hierarchical). Two concepts in the same directory with the same slug get `-2`, `-3` suffix. Concepts in different directories may share slugs without conflict (their full paths differ).

---

## 4. Redirect Implementations

### 4.1 HTTP Redirect Semantics

**HTTP 301 - Moved Permanently:**
**Evidence:** RFC 2616 §10.3.2: "If a client has link-editing capabilities, it should update all references to the Request URL. The response is cacheable unless indicated otherwise."

**HTTP 302 - Found (Temporary Redirect):**
Used when the resource is temporarily at a different URI. Clients should NOT update bookmarks/links.

**Filesystem translation:**
A 301-equivalent in a filesystem context means: "this document has permanently moved; update all links pointing here." A 302-equivalent means: "this document is temporarily at this location; do not update your links."

**Candidate default:** Filesystem redirects are always 301-equivalent (permanent). Temporary moves (302-equivalent) are not needed in a plaintext OKF migration — if a document moves, it moves permanently. Temporary link overrides would be handled at consumption time, not migration time.

### 4.2 Hugo Aliases Pattern

**Evidence:** [Hugo URL Management](https://gohugo.io/content-management/urls/#aliases): Frontmatter `aliases` field lists old paths. Hugo generates either (a) client-side HTML redirect files (`meta http-equiv="refresh"`) at each alias path, or (b) server-side redirect rules via the `Aliases` method on `Page` objects.

Key properties:
- Aliases listed in frontmatter of the destination page
- Accepts site-relative (`/old-url`), page-relative (`old-name`), and `../` traversal paths
- Build-time generation: no runtime server needed for client-side redirects
- Server-side redirects are more efficient but require web server configuration

**Inference:** Hugo's model maps directly to OKF migration: the migrated concept's frontmatter records its old paths as `aliases`. A post-migration tool generates redirect artifacts from these aliases.

### 4.3 Jekyll redirect_from Pattern

Jekyll's `jekyll-redirect-from` plugin uses frontmatter `redirect_from` (similar to Hugo aliases). It generates redirect HTML files at the old URLs.

### 4.4 Filesystem Redirect Mechanisms

For a plaintext filesystem corpus (no web server), redirects are implemented as metadata, not HTTP:

| Mechanism | Implementation | Pros | Cons |
|-----------|---------------|------|------|
| **Frontmatter aliases** | `aliases: ["/old/path", "/other/old"]` in moved concept's frontmatter | Self-contained, survives renaming | Requires tooling to consume and resolve |
| **Symlinks** | `ln -s /new/path.md /old/path.md` | OS-native, transparent to any tool | Breaks on filesystems without symlink support (Windows FAT32); git-symlink handling varies |
| **Redirect stub files** | Empty `.md` file at old path containing only `redirect_to: /new/path` in frontmatter | Portable, git-friendly, explicit | Doubles file count for each redirect; requires tooling to interpret |
| **Redirect index (manifest)** | Single `redirects.json` or `redirects.md` mapping old→new paths | Centralized, bulk resolvable | Separated from content; easy to miss stale entries |
| **Frontmatter redirect_from (destination-side)** | Moved document declares its old paths (Hugo/Jekyll pattern) | Self-documenting, easy to discover "where did this go?" | Cannot find redirects by scanning old paths |

**Candidate default:** Two-level redirect mechanism:
1. **Frontmatter `aliases` on the destination concept** (Hugo/Jekyll pattern). This answers "where did the old content go?" when viewing the new document.
2. **Stub redirect files at old paths** containing only `redirect_to: <new-path>` frontmatter. This makes the redirect discoverable by filesystem listing of the old location. A `type: alias` or `type: redirect` could formalize this.

**Candidate default:** Redirect stubs are lightweight: a single YAML frontmatter block, no body. Minimum:
```yaml
---
type: redirect
redirect_to: /new/path/to/concept.md
generated:
  by: migration-tool/0.1.0
  at: 2026-07-26T10:00:00Z
---
```

**Decision required:** Whether redirects are destination-side (Hugo aliases), source-side (stub files at old path), or both. Both is safest but increases file count.

### 4.5 Redirect Chain and Cycle Handling

**Inference:** If concept A redirects to concept B which redirects to concept C, a redirect chain exists. If concept A redirects to concept B which redirects to concept A, a cycle exists. Both are bugs.

**Candidate default:** Migration tool validates redirect entries: (1) resolve all chains to their final target, (2) detect and reject cycles, (3) point alias stubs and frontmatter aliases at the canonical final location (not through intermediate redirects), (4) warn on chains longer than 3 hops.

---

## 5. Link Rewriting

### 5.1 The Core Problem

When documents are moved, renamed, split, or merged during corpus restructuring, all internal links pointing to those documents must be updated. Broken links degrade knowledge quality and agent navigation.

OKF v0.2 defines cross-linking as:
- Bundle-relative absolute: `[label](/path/to/concept.md)` — "recommended for stability when documents move"
- Relative: `[label](./neighbor.md)`

Both forms break when the target moves.

**Evidence:** `okf-spec-and-ecosystem.md`: "Consumers MUST tolerate broken links. A link to a non-existent target may represent not-yet-written knowledge." This spec requirement means broken links are not errors — but they are still undesirable.

### 5.2 Link Rewriting Strategies

| Strategy | Description | Pros | Cons |
|----------|-------------|------|-------|
| **Pre-scan + mapping table** | Before moving files, scan all documents for links, build a `old_path → new_path` mapping table from the planned restructure, then rewrite all links | Deterministic, verifiable, atomic | Requires knowing all moves before executing |
| **Post-scan + backfill** | Move files first, then scan for broken links (where target path does not exist in the new bundle), look up old_path in alias data, rewrite | Simpler workflow, handles incremental moves | May leave broken links if alias data missing |
| **Regex-based path substitution** | Apply regex patterns to rewrite links matching known restructure patterns (e.g., `s|/old-dir/|/new-dir/|`) | Fast, predictable | Fragile for non-pattern restructures; false positives on natural language mentions |
| **Identity-based linking (concept_id)** | Links reference `concept_id` (UUID), not path. A build-time index maps IDs to current paths. No link rewriting needed on move. | Decouples identity from location; links never break on move | Requires build step to render paths; harder for humans to write/read raw Markdown |

**Candidate default:** Pre-scan + mapping table for migration-time restructuring. Identity-based linking (concept_id references) as a forward-looking improvement that would make future restructuring link-stable.

**Candidate default:** Link rewriting flow during migration:
1. Construct mapping table: `{old_path: new_path}` for every moved, renamed, split, or merged document from the restructure plan.
2. Walk all `.md` files in the bundle. For each Markdown link `[text](/path/to/concept.md)`, look up the target path in the mapping table. If found, rewrite the link to the new path.
3. Walk index.md files. Their list entries `* [Title](url)` are also link-bearing and must be rewritten.
4. Log every rewritten link: `old_target → new_target, in file:line`.
5. Validate: after rewriting, scan for broken links (target path does not exist). Report any remaining broken links for human review.

### 5.3 Broken Link Handling During Migration

**Candidate default — broken link severity levels:**

| Scenario | Action |
|----------|--------|
| Target moved (in mapping table) | Rewrite link automatically |
| Target exists in old location, not in mapping table | No rewrite needed |
| Target in mapping table, but new location file also exists (ambiguous) | Surface for review |
| Target not in mapping table, not on disk (genuinely broken) | Preserve as-is (OKF spec: "tolerate broken links"); log warning |
| Target is an external URL (http/https) | Never rewrite; log for manual verification if desired |
| Target has an alias/redirect stub | Resolve alias to final target, rewrite link |

### 5.4 Versioned Content Handling

**Evidence:** `obsidian-transferable-patterns.md`: "If superseded, linked to the superseding note with an explanation. The old note remains as part of the provenance chain." Zettelkasten method: notes are never truly deleted; superseded content is linked to its successor.

OKF v0.2 lifecycle fields:
- `status: deprecated` — "kept for links/history"
- `stale_after: YYYY-MM-DD` — "A concept is stale when today >= stale_after"

**Inference:** OKF already supports the concept of "old but not deleted." During restructuring, deprecated documents should:
1. Not be deleted.
2. Receive `status: deprecated` and a `stale_after` date.
3. Point to their replacement via a `superseded_by` frontmatter field (extension).
4. Have their old links preserved — links TO the deprecated doc should NOT be rewritten to the new doc (the deprecated doc is still there and reachable). Links FROM the deprecated doc should direct the reader to the new version.

**Candidate default:** Four states for restructured content:
1. **Active (moved):** Content moved to new path. Redirect stub at old path. Links rewritten.
2. **Deprecated (superseded):** Content remains at old path with `status: deprecated`, `superseded_by: /new/path`. Links TO old path preserved. Old path's body contains a notice linking to new version.
3. **Merged (source):** Content merged into another document. Original marked `status: deprecated`, `merged_into: /target/path`. Original body may be reduced to a summary with link to merged document.
4. **Deleted (discouraged):** Only for exact duplicates. Content removed. Redirect stub at old path.

**Decision required:** Whether deleted/superseded documents are physically removed or only marked with lifecycle status. Physical removal breaks existing links; lifecycle marking preserves them. OKF philosophy ("kept for links/history") prefers marking over deletion.

---

## 6. OKF v0.2 Identity Patterns (From Spec)

### 6.1 Current State

OKF v0.2 provides identity and linking through:
- **Bundle-relative paths** as the primary concept locator
- **`sources[].id`** as a stable join key for footnote-based attribution within a single document
- **`resource` field** as a canonical URI for the underlying artifact
- **No bundle-level concept identity field** — concepts are identified by path only
- **No built-in redirect/alias mechanism** — the spec does not define how to handle moved or renamed concepts
- **No deduplication semantics** — the spec is silent on what to do when two concepts describe the same thing

**Evidence:** `okf-spec-and-ecosystem.md` §2.3 (Cross-linking), §2.4 Limitation #4 ("No multi-bundle operations"), Limitation #9 ("Link graph is untyped").

### 6.2 `sources[].id` as Identity Pattern

**Evidence:** `okf-spec-and-ecosystem.md` §2.2: "`id` is optional but SHOULD be present when the body cites the source — used as a stable join key for footnote-based per-claim attribution." "stable join keys survive agent-driven list reordering, unlike positional indices."

**Inference:** The `id` field in `sources` entries demonstrates that the spec authors recognize the need for stable identifiers that survive positional changes. This pattern (explicit stable key separate from position) could be extended to concept identity.

### 6.3 Design Premises from OKF Research

**Evidence:** `obsidian-transferable-patterns.md` §Transferability Assessment: "**Decision required:** Filename/path identity conflicts with moves; benchmark immutable IDs plus routing/alias metadata against path identity."

**Evidence:** `workspace-topology-and-routing.md` §4.2: "Concept identity key: What makes two concepts 'the same'? Options: `resource` field, bundle-relative path, explicit `okf_id` extension. Recommended: `resource` field where available, fall back to bundle-relative path."

---

## 7. Source Index

### Primary Web Sources
| Source | URL |
|--------|-----|
| Wikipedia: Persistent identifier | https://en.wikipedia.org/wiki/Persistent_identifier |
| Wikipedia: UUID | https://en.wikipedia.org/wiki/Universally_unique_identifier |
| Wikipedia: SimHash | https://en.wikipedia.org/wiki/SimHash |
| Wikipedia: MinHash | https://en.wikipedia.org/wiki/MinHash |
| Wikipedia: Locality-sensitive hashing | https://en.wikipedia.org/wiki/Locality-sensitive_hashing |
| Wikipedia: Content-addressable storage | https://en.wikipedia.org/wiki/Content-addressable_storage |
| Wikipedia: Git | https://en.wikipedia.org/wiki/Git |
| Wikipedia: Software Hash Identifier | https://en.wikipedia.org/wiki/Software_Hash_Identifier |
| Wikipedia: HTTP 301 | https://en.wikipedia.org/wiki/HTTP_301 |
| Hugo URL Management (Aliases) | https://gohugo.io/content-management/urls/#aliases |
| WordPress: wp_unique_post_slug | https://developer.wordpress.org/reference/functions/wp_unique_post_slug/ |
| Zettelkasten.de Introduction | https://zettelkasten.de/introduction/ |
| Andy Matuschak, Evergreen Notes | https://notes.andymatuschak.org/Evergreen_notes |

### Local Research Sources
| File | Content |
|------|---------|
| `docs/research/okf-spec-and-ecosystem.md` | OKF v0.1/v0.2 identity, cross-linking rules, limitations |
| `docs/research/obsidian-transferable-patterns.md` | Identity decisions, link context, Zettelkasten ID patterns |
| `docs/research/workspace-topology-and-routing.md` | Identity/routing vocabulary, concept identity key options |

---

## 8. Decisions Required (Summary)

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| D1 | **Concept identity mechanism** | Path-only (current), `resource` field, explicit `concept_id` (UUID v7), or content hash | Gates all rename/split/merge/redirect behavior |
| D2 | **Redirect implementation** | Frontmatter aliases only, stub files only, or both | Determines how "where did this go?" is answered |
| D3 | **Duplicate detection depth** | Exact match only (SHA-256), structural normalized match, or near-duplicate (SimHash) | Affects migration tool complexity and false positive rate |
| D4 | **Conflict resolution default** | First-wins + rename, or human review queue for all conflicts | Automation vs. safety tradeoff |
| D5 | **Deletion policy** | Physical deletion (breaks links), or lifecycle marking (`status: deprecated`) | Data preservation vs. clutter |
| D6 | **Link format for stability** | Continue path-based links, or introduce `concept_id`-based links | Forward compatibility of link stability |

