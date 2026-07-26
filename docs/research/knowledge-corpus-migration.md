# Safe Migration of Existing Knowledge Corpora into OKF

> Research date: July 2026. Wayfinder research ticket: [Research safe migration of existing knowledge corpora into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/23)
>
> This report synthesizes findings from 8 parallel sub-agent investigations. Each section is backed by a detailed supporting report under `docs/research/migration-sections/`. Citations below reference those reports; consult each for full primary-source chains.
>
> **Evidence** = directly supported by a cited primary source. **Inference** = interpretation of cited evidence; not established by the source. **Candidate default** = proposed operational value; requires benchmarking. **Decision required** = unresolved semantics that implementation must not guess.

## 1. Executive Summary

**Evidence:** Existing migration tooling (Pandoc, `obsidian-export`, okflint) handles per-file format conversion but does not provide the end-to-end safety, inventory, identity, or validation needed for a trustworthy corpus migration into OKF. No single tool in the combined ecosystems of Pandoc, Obsidian community tools, and wiki exporters implements dry-run manifests, backup verification, rollback, or idempotent/resumable migration.

**Evidence:** The OKF v0.2 specification defines bundle structure, reserved filenames, required `type`, and cross-linking conventions, but is silent on concept identity beyond bundle-relative paths, on redirect/alias mechanisms, and on deduplication semantics. These gaps must be filled by extension or precedent before automated migration is safe.

**Inference:** A safe migration pipeline has five phases: inventory/classify → dry-run manifest → backup/verify → convert (writing to a separate target, never mutating source) → validate/gate. Each phase is informed by battle-tested patterns from database migration (Alembic checkpointing, Liquibase dry-run SQL), filesystem operations (rsync `--dry-run` and checksum verification), deployment infrastructure (blue-green never-mutate-source), and content tooling (Pandoc's golden-file test patterns).

**Candidate default:** Write all migrated output to a temporary directory, validate, then atomically commit (git commit or directory rename). Never mutate the source corpus during conversion.

**Decision required (summary of all 8 investigations):** The single most impactful decision is concept identity (path-based vs UUID vs content hash). This gates all redirect, deduplication, link rewriting, and rename behavior. Six other decisions span attachment structure, callout conversion, auto-type assignment, block reference handling, duplicate detection depth, and approval boundaries.

---

## 2. Corpus Inventory and Classification

**Full report:** `migration-sections/01-corpus-inventory.md`

**Evidence:** Pandoc has 40+ input readers but no corpus-level inventory capability. Existing OKF tools (okflint, fabricioctelles conversion guide) assume the user has already surveyed their corpus. Migration tools must wrap Pandoc with a pre-pass that classifies the source corpus before conversion.

**Evidence:** Five distinct corpus types have reliable detection signals: Obsidian vaults (`.obsidian/` dir), documentation trees (mkdocs.yml, docusaurus.config.js, conf.py), MediaWiki exports (`<mediawiki>` XML root), Confluence backups (ZIP with `entities.xml`), and mixed folders (fallback when no specific signal fires).

**Candidate default — classification order:**
1. XML file with `<mediawiki>` root → MediaWiki export
2. ZIP with `entities.xml` → Confluence backup
3. `.obsidian/` present → Obsidian vault
4. Doc-framework config present → Documentation tree
5. Otherwise → Mixed folder

Classification should recurse into subdirectories. A monorepo root may be "mixed" while its `docs/` subdirectory is a "documentation tree." Report a classification tree, not a single label.

**Candidate default — file-type taxonomy:**
Markdown variants (`.md`, `.mdx`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdwn`, `.mdtxt`, `.mdtext`, `.rmd`) → convert to concept. Images, diagrams, PDFs → copy as attachments. Office documents → extract text, reference file. Config, scripts → skip in code-backed projects.

**Candidate default — key inventory metrics:**
File count by category, Markdown file count, total bytes, directory count, maximum nesting depth, frontmatter presence rate (with `type` field rate), broken link count, image/asset count. Report size alerts: >500 MD files (will need sub-index files), >50% files without frontmatter (large untagged volume), >20% assets (attachment-heavy).

**Candidate default — dry-run manifest format:**
A YAML file containing per-file action assignments (`convert_to_concept`, `copy_asset`, `skip`, `warn_manual`), risk classifications (`SAFE`/`CAUTION`/`REVIEW`/`DESTRUCTIVE`), integrity assertions, and a summary section. Must be generated before any file modification occurs. Written to a temporary location outside the bundle.

---

## 3. Markdown and Frontmatter Parsing Fidelity

**Full report:** `migration-sections/02-parsing-fidelity.md`

**Evidence:** YAML type coercion is the #1 data-loss risk during migration. Frontmatter values matching YAML type patterns (`country: no` → boolean `false`, `version: 1.10` → float `1.1`) are silently altered by schema-based parsers. This affects Obsidian vaults heavily (Dataview metadata, version strings, country codes).

**Evidence:** Multi-document `---` confusion is a real migration bug: a second `---` in a Markdown body can be misinterpreted as a YAML document separator, silently truncating content. CommonMark has no concept of syntax errors, so dialect deviations (GFM tables, Obsidian callouts, Pandoc fenced divs) degrade to paragraphs with no warning.

**Evidence:** Wikilink resolution fragility has a platform-dependency dimension: case-sensitivity differences between macOS and Linux filesystems cause silent failures; placeholder wikilinks to non-existent notes are lost when tools eagerly resolve links.

**Candidate default — safest ingestion strategy:**
- Use Failsafe schema (treats all scalars as strings, no type coercion) during ingestion, then apply schema resolution as a separate auditable pass.
- Use a single-document parser; warn on ambiguity when a second `---` delimiter is encountered in the body.
- Normalize encoding to UTF-8 without BOM; strip BOM; reject/replace `\0` bytes.
- Normalize line endings to LF; normalize `#\tHeading` to `# Heading`.
- Detect and report dialect-specific constructs before conversion (wikilinks, callouts, tags, strikethrough, tables, task lists, math, raw HTML).

**Candidate default — loss classification taxonomy for audit trail:**
- **Fatal:** Unparseable YAML, encoding errors → content cannot be migrated
- **Lossy:** Dialect-specific constructs converted to nearest equivalent (e.g., Obsidian callout → GFM alert)
- **Lossy-with-comment:** Original text preserved in HTML comment alongside converted form
- **Dropped:** Information discarded with warning (Dataview queries, `%%comments%%`)
- **Warning:** Migrated fully but worth reviewing (type-coerced values, BOM presence, mixed line endings)

---

## 4. Obsidian Vault Migration

**Full report:** `migration-sections/03-obsidian-migration.md`

**Evidence:** Wikilinks (`[[link]]`, `[[link|alias]]`, `[[link#heading]]`, `[[link#^block]]`) are the highest-volume migration concern. `obsidian-export` (Rust, v25.3.0, BSD-2-Clause Plus Patent) is the best starting point for automated conversion; it converts wikilinks and embeds to CommonMark and supports custom `Postprocessor` functions. `okflint` can validate link integrity post-migration.

**Evidence:** Callouts have partial GFM alert compatibility: `[!note]`, `[!tip]`, `[!warning]`, `[!danger]` map to GFM `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]` (case differs). Eight other built-in callout types and all custom types have no GFM equivalent. Block references (`#^block-id`) have no standard Markdown equivalent — the most concerning structural loss.

**Evidence:** Dataview queries represent the largest functional gap post-migration. Vaults using auto-populated MOCs and freshness queries will appear broken. Pre-rendering via Obsidian + Dataview before export is the only way to preserve rendered output. OKF v0.2's `stale_after` and `index.md` provide structural equivalents for some Dataview use cases.

**Candidate default — three-stage pipeline:**
1. **Pre-flight (diagnostic):** Run `okflint audit --vault` to inventory the vault; collect wikilink count, callout count, Dataview query count, attachment count.
2. **Conversion (automated):** Run `obsidian-export` for wikilinks/embeds; apply post-processing for callout normalization, inline tag extraction, comment removal, block reference conversion, attachment relocation.
3. **Validation (gate):** Run `okflint validate` against an OKF manifest; diff against original vault; generate `index.md` and `log.md`.

**Candidate default for key transformations:**
- Wikilinks → bundle-relative Markdown links: `[[Note Name]]` → `[Note Name](/path/to/note-name.md)`
- Callouts → GFM alerts for 4 mapped types; bold-header blockquotes for remaining types
- Block references → plain links with warning; block embeds → inlined blockquote with source attribution
- Image embeds → standard `![alt](path)`; drop width parameters
- Note embeds → prominent link blocks with source reference
- Inline tags → extracted to frontmatter `tags` list
- `%%comments%%` → removed
- Obsidian Properties → preserved in frontmatter (OKF tolerates unknown keys)

**Seven open decisions identified:** Ambiguous wikilink resolution priority, callout conversion strategy, block embed handling, inline tag treatment, attachment relocation structure, auto-type assignment vs manual classification, and whether to pre-render Dataview queries.

---

## 5. Wiki and Mixed-Folder Migration

**Full report:** `migration-sections/04-wiki-migration.md`

**Evidence:** Pandoc supports all three major wiki formats as input (`mediawiki`, `dokuwiki`, `jira` for Confluence) but explicitly warns: "conversions from formats more expressive than pandoc's Markdown can be expected to be lossy." The intermediate AST cannot represent wiki-specific constructs. DokuWiki is the easiest to migrate (plain `.txt` files on disk, simpler syntax). Confluence is the hardest (Storage Format XML richer than what the `jira` reader handles; use REST API `export_view` HTML instead).

**Evidence:** Templates and transclusion are the critical blockers for MediaWiki. Without server-side template expansion (via `Special:Export?templates=1`), template-heavy wikis produce unusable output. Open pandoc bugs exist for image filename parsing and table `data-*` attributes.

**Evidence:** Wiki-specific constructs with no Markdown equivalent span categories (→ frontmatter `tags`), namespaces (→ directory hierarchy), interwiki links (→ expanded URLs via interwiki map), info boxes (→ expanded via template resolution), image sizing attributes (→ stripped), redirects (→ frontmatter aliases or stub files), and revision history (→ discard; record one-time migration metadata).

**Candidate default — three-phase pipeline for wikis:**
1. **Extract** (platform-specific): MediaWiki via `Special:Export` + XML parse + wikitext extraction; Confluence via REST API `export_view` HTML; DokuWiki via filesystem copy of `data/pages/*.txt`.
2. **Convert** (format-specific): MediaWiki wikitext → `pandoc -f mediawiki -t gfm`; Confluence HTML → `pandoc -f html -t gfm`; DokuWiki → `pandoc -f dokuwiki -t gfm`.
3. **Bundle** (OKF-specific): Map namespaces to directories, titles to filenames, categories to `tags`, inject `type`/`title`/`description`/`resource`/`generated`, download and store attachments, generate `index.md`/`log.md`.

**Decision required for eight wiki constructs:** Template expansion strategy, category treatment, namespace mapping, interwiki map, info box handling, image attribute preservation, redirect implementation, and authorship attribution.

---

## 6. Identity, Duplicates, Redirects, and Link Rewriting

**Full report:** `migration-sections/05-identity-duplicates-redirects.md`

**Evidence:** OKF v0.2 has no concept-level identity field. Identity is implicitly the bundle-relative path, which changes when documents move. Digital preservation distinguishes extrinsic identifiers (DOIs, ARKs — require institutional commitment) from intrinsic identifiers (SWHIDs, content hashes — self-certifying). Git's content-addressable model (SHA-1 blob hashes) and CAS systems demonstrate that content hashing alone can serve as identity with deduplication as a natural side effect.

**Evidence:** CAS systems and BorgBackup/restic demonstrate: identical content hash = identical document = automatic deduplication. For near-duplicate detection, production-proven algorithms (SimHash, MinHash + LSH) are available but add complexity.

**Evidence:** Redirect patterns from static site generators (Hugo aliases, Jekyll `redirect_from`) map directly to filesystem contexts: frontmatter `aliases` on the destination concept plus optional stub redirect files at old paths. WordPress's `-2`, `-3` suffix pattern provides a battle-tested slug uniqueness strategy.

**Candidate default — three-tier identity:**
1. **Immutable `concept_id` (UUID v7):** Stored in frontmatter. Survives moves and renames. UUID v7 chosen over v4 for timestamp-ordered sort.
2. **Mutable `path`:** The current bundle-relative location.
3. **`content_hash` (SHA-256):** Computed from normalized body + key frontmatter fields. Enables deduplication and content-based identity.

**Candidate default — duplicate detection during migration:**
- **Tier 1 (exact):** SHA-256 of normalized content. Deterministic, zero false positives.
- **Tier 2 (structural):** SHA-256 of frontmatter-stripped body. Catches same-body/different-metadata.
- **Tier 3 (near-duplicate):** SimHash (64-bit), Hamming distance ≤ 3. Candidate defaults; only run if Tier 1 and Tier 2 find no match. Surface candidates for human review.

**Candidate default — conflict resolution:**
- Exact duplicate → accept first, discard subsequent, log.
- Path collision, similar content → rename with `-2` suffix, add `aliases` frontmatter and redirect stub at old path.
- Path collision, different content → human review queue.
- Same content hash, different paths → keep first path, redirect second.

**Candidate default — four states for restructured content:**
1. **Active (moved):** New path, redirect stub at old path, links rewritten.
2. **Deprecated (superseded):** `status: deprecated`, `superseded_by: /new/path`. Links to old path preserved.
3. **Merged:** Original marked `status: deprecated`, `merged_into: /target/path`. Body reduced to summary with link.
4. **Deleted:** Only for exact duplicates. Redirect stub at old path.

**Six open decisions:** Concept identity mechanism, redirect implementation, duplicate detection depth, conflict resolution default, deletion policy, and link format for stability (path-based vs concept_id-based).

---

## 7. Safe Migration: Dry-Run, Backup, Rollback, Idempotency

**Full report:** `migration-sections/06-safe-migration.md`

**Evidence:** Three independent sources converge on the same invariant: **write-new-then-swap, never mutate-in-place**. This is the single most important safety pattern for OKF migration. rsync creates temp files and renames on checksum match; blue-green deployment never touches the live environment; restic writes packs → indexes → snapshots in dependency order. All three write to a separate target and atomically commit.

**Evidence:** Alembic's `alembic_version` table provides the canonical checkpoint/resume pattern: track the last successfully applied revision, skip it on re-run. For OKF, this translates to per-file SHA-256 checksums in a `migration-log.json` — if a file's hash matches a prior successful migration, skip it. Stripe's idempotency keys + restic's content-addressable storage provide the idempotency foundation: UUID-per-run + content hash per file.

**Evidence:** An automatic git commit is not a backup. The only proof a backup works is restoring it to a disposable location and verifying the files. Three approval gates (proceed after dry-run, confirm destructive items, review diff before commit) map to the trust-tier operations matrix from lifecycle research.

**Candidate default — end-to-end safe migration flow:**
1. **Inventory** — Walk source, hash every file (SHA-256)
2. **Dry-run** — Classify each file action, assign risk, write manifest
3. **Approval #1 (Proceed)** — User reviews manifest summary
4. **Backup** — Git snapshot branch + `git bundle` OR full file copy
5. **Verify backup** — Checksum compare + test restore to tmpdir
6. **Approval #2 (Destructive)** — User confirms all DESTRUCTIVE actions
7. **Migrate** — Per directory, per-file checkpoint, write to separate target directory, never mutate source
8. **Verify output** — Parse all frontmatter, run okflint, compare file count to manifest
9. **Commit** — Replace target with output, write migration log
10. **Approval #3 (Commit)** — User reviews diff

**Candidate default — idempotency through migration-log.json:**
Track per-file source hash, target hash, action, and timestamp. Re-running with the same migration run UUID is a no-op (all files already in log). A subsequent migration session reads the log and only processes files whose source hash changed.

**Candidate default — checkpoint state:**
Per-file checkpoint file (`migration-checkpoint.json`) tracking processed file count and last processed path. On resume, skip all files at indices below the checkpoint. Write the checkpoint atomically after each file.

---

## 8. Durable Context Detection

**Full report:** `migration-sections/07-durable-context-detection.md`

**Evidence:** A recoverability spectrum exists from code-inferable to irrecoverable. At one end: API references, class diagrams, directory structure docs, and build command listings are mechanically extractable from code (via AST, import graph, filesystem, package.json). At the other end: design rationale, rejected alternatives, domain glossary definitions, constraints, and operational runbooks cannot be recovered from code — code preserves the outcome but never the rejected paths or the "why."

**Evidence:** The ADR format (Context, Decision, Consequences) and the (WH)Y statement format ("In the context of..., facing..., we decided for..., to achieve..., accepting...") are canonical durable context templates. They explicitly encode what code cannot express, and their structured format provides high-confidence template-level detection signals.

**Evidence:** Claude Code's `/doctor` is the closest operational precedent for automated durable-vs-code-recoverable classification — it "identifies content Claude can derive from the codebase and proposes trimming suggestions." No existing tool implements a general-purpose classifier.

**Candidate default — classification algorithm:**
**Phase 1 (syntactic, fast, deterministic):**
1. Frontmatter check: `type: Decision/ADR/Term/Constraint/Runbook` → DURABLE; `type: API Reference/Schema/Example` → CODE-RECOVERABLE.
2. Identifier density: Extract code artifact references; match against codebase AST. >60% paragraphs with ≥1 match → likely CODE-RECOVERABLE. 0 matches → likely DURABLE.
3. Linguistic signal check: Rationale signals (because, chose, decided, rejected, must not, constraint) vs declarative signals (is, has, contains, consists of). Rationale ratio > 0.3 → DURABLE.
4. Link analysis: >50% links to source code → likely CODE-RECOVERABLE.

**Phase 2 (LLM-based, for ambiguous cases, optional):** Prompt classification of ambiguous documents as DURABLE, CODE-RECOVERABLE, or HYBRID with line ranges.

**Candidate default — project mode changes the default:**
- **Code-backed:** Default to DISCARD. Require evidence of durability (rationale, alternatives, domain meaning, constraints not in code). Burden of proof on migration.
- **Knowledge-only:** Default to MIGRATE. Only discard demonstrably auto-generated boilerplate or stale/corrupted content.

**Four open decisions:** Classification thresholds (60%, 0.3, 50% are candidate defaults requiring fixture benchmarking), whether to implement LLM-based Phase 2, minimum viable classification accuracy, and whether classification operates at file, section, or paragraph level.

---

## 9. Post-Migration Validation and Approval

**Full report:** `migration-sections/08-post-migration-validation.md`

**Evidence:** Five validation layers form a gate hierarchy:
1. **Conformance (L1):** OKF v0.2 three core tests (parseable frontmatter, non-empty `type`, reserved file structure). BLOCKING in all projects.
2. **Completeness (L2):** File-count parity, content-size parity, attachment parity. BLOCKING for knowledge-only; advisory for code-backed.
3. **Link integrity (L3):** Internal link resolution, external link HTTP check. WARNING per spec (consumers MUST tolerate broken links).
4. **Diff review (L5):** Frontmatter structured diff, content diff. BLOCKING for knowledge-only; advisory for code-backed.
5. **Semantic spot-check (L4):** Sample-based manual review, embedding similarity, LLM-assisted review (opt-in). Optional; manual review required for human-verified concepts.

**Evidence:** `okflint` is the most mature validator (18 rules, 3 tiers, partial v0.2 support). `markdown-link-check` and `htmltest` are proven external link checkers. No tool does internal bundle-relative `.md` link resolution — this needs building. Pandoc's golden-file test pattern (source → canonical format → compare to expected) is the established regression-test approach.

**Evidence — three components need building:**
1. **OKF link resolver:** Resolves bundle-relative paths, validates `#heading` fragments, handles `.md` extension variance.
2. **Completeness reporter:** Cross-references source manifest against migrated bundle.
3. **Frontmatter structured differ:** Deep-compares YAML frontmatter, reports only semantic field-level diffs.

**Candidate default:** Use `okflint` for conformance, `markdown-link-check` for external links, a custom resolver for internal links, and `git diff -w` for content review. LLM-assisted review is optional and per-concept, not a default gate.

---

## 10. Cross-Cutting Decision Matrix

The following 13 decisions recur across multiple investigations and gate implementation:

| # | Decision | Investigations | Stakes |
|---|----------|---------------|--------|
| D1 | **Concept identity mechanism** (path vs UUID vs content hash) | 05, 06 | Gates all rename, split, merge, redirect, dedup behavior |
| D2 | **Redirect implementation** (frontmatter aliases vs stub files vs both) | 05, 03, 04 | How "where did this go?" is answered |
| D3 | **Duplicate detection depth** (exact vs structural vs near-duplicate) | 05, 06 | Tool complexity and false positive rate |
| D4 | **Conflict resolution default** (first-wins+rename vs human review queue) | 05, 01 | Automation vs safety tradeoff |
| D5 | **Deletion policy** (physical deletion vs lifecycle marking) | 05 | Data preservation vs bundle clutter |
| D6 | **Approval gate model** (per-file vs per-risk-class vs all-or-nothing) | 06, 08 | Migration UX and automation ceiling |
| D7 | **Callout conversion strategy** (GFM normalization vs plain blockquotes) | 03, 02 | Readability on GitHub vs any renderer |
| D8 | **Block embed handling** (inline content vs link with label) | 03 | Content duplication and staleness risk |
| D9 | **Attachment relocation** (flat vs preserve hierarchy) | 03, 04, 01 | URL length and collision rate |
| D10 | **Auto-type assignment** (heuristics vs manual pre-classification) | 03, 07 | Migration automation level |
| D11 | **Dataview query preservation** (pre-render vs accept loss vs OKF-native) | 03 | Content completeness; requires Obsidian tooling |
| D12 | **Classification granularity** (file vs section vs paragraph level) | 07 | Implementation complexity vs output quality |
| D13 | **Durable context classification thresholds** (syntactic vs LLM-based) | 07 | Accuracy, cost, non-determinism |

---

## 11. Open Source Tool Index

| Tool | Role | Key capability |
|------|------|---------------|
| **Pandoc 3.x** | Universal format converter | 40+ input formats, 3 wiki readers, 8 Markdown dialects. "Conversions from formats more expressive than pandoc's Markdown can be expected to be lossy." |
| **`obsidian-export`** | Obsidian → CommonMark | Handles `[[wikilinks]]`, `![[embeds]]`, recursive embed detection. Custom `Postprocessor` API. Rust library. |
| **`okflint`** | OKF linter + wikilink resolver | 18 rules, 3 tiers, partial v0.2. `--vault` flag resolves Obsidian wikilinks. Generates `index.md`. |
| **`python-frontmatter`** | YAML frontmatter extraction | Lazy-loads from first `---` pair. Returns `Post(metadata, content)`. |
| **`js-yaml` v5** | YAML parsing | YAML 1.2. Configurable schema (Core, JSON, Failsafe, YAML11). `maxAliases` limit. |
| **`markdown-link-check`** | External link validation | HTTP status checking, JUnit reporter, CI integrations. |
| **`markdownlint`** | Markdown syntax linting | 50+ rules, VS Code + pre-commit + GitHub Action integrations. |
| **`htmltest`** | Link integrity testing | Checks HTML links, images, scripts. 2000+ files in <10s. Caching with `refcache.json`. |
| **`mwparserfromhell`** | MediaWiki wikitext parser | Robust Python parser with proper AST. Handles templates, links, tables, tags. |
| **BorgBackup / restic** | Deduplicating backup | Content-addressable immutable blobs, cryptographic integrity verification. |
| **Alembic / Liquibase** | Database migration patterns | Checkpoint/resume, dry-run SQL, checksum-based idempotency, downgrade/rollback.|

---

## 12. Source Reports

Each investigation below is a full primary-source research report in `docs/research/migration-sections/`:

| # | Section | File |
|---|---------|------|
| 01 | Corpus Inventory and Classification | `migration-sections/01-corpus-inventory.md` |
| 02 | Markdown and Frontmatter Parsing Fidelity | `migration-sections/02-parsing-fidelity.md` |
| 03 | Obsidian Vault Migration | `migration-sections/03-obsidian-migration.md` |
| 04 | Wiki and Mixed-Folder Migration | `migration-sections/04-wiki-migration.md` |
| 05 | Identity, Duplicates, Redirects, Link Rewriting | `migration-sections/05-identity-duplicates-redirects.md` |
| 06 | Safe Migration Patterns | `migration-sections/06-safe-migration.md` |
| 07 | Durable Context Detection | `migration-sections/07-durable-context-detection.md` |
| 08 | Post-Migration Validation | `migration-sections/08-post-migration-validation.md` |
