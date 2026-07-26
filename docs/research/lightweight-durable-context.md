# Lightweight Durable Context Lifecycle for OKF Skills

> Research date: July 2026  
> Sources: Primary platform documentation, Matt Pocock's directly linked YouTube video and timed captions, OKF v0.2 specification, and the supporting research notes linked below

### Claim labels

- **Evidence** — directly supported by the cited primary source or repository state.
- **Inference** — interpretation of cited evidence; not established by the source itself.
- **Candidate default** — a proposed operational starting value or policy. It is not validated until benchmarked against representative fixtures.
- **Decision required** — unresolved product semantics that implementation must not guess.

Numeric triggers in this report, including note counts, percentages, word counts, TTLs, context budgets, and retention periods, are **candidate defaults**. Before adoption, benchmark them on small, medium, and large code-backed and knowledge-only fixture bundles, measuring retrieval recall, precision, latency, token use, false-positive rate, and recovery success.

---

## Executive Summary

**Evidence:** Agent sessions start with bounded, newly assembled context. Code preserves executable behavior and many structural facts, but it does not necessarily encode decision rationale, rejected alternatives, intended domain meanings, or non-executable invariants.

**Evidence:** The platforms sampled in §2 support Markdown instruction or rule files at predictable repository paths. Several, but not all, also document scoped loading, concise instructions, or the distinction between behavioral guidance and enforcement.

**Inference:** The sampled platform documentation does not define an end-to-end lifecycle combining provenance, freshness, migration, identity, merge/split, archival, and restore verification. Individual products cover subsets, so this is a scoped research gap rather than proof that no platform anywhere has such a lifecycle.

**Candidate default:** Evaluate a **trust-gated, source-tracked lifecycle** separately for code-backed and knowledge-only fixtures. Threshold-driven behavior remains experimental until benchmarked. Migration is a twelfth lifecycle dimension; identity, routing, redirect, and merge/split semantics remain **decision required** items.

---

## 1. Transcript Analysis — Matt Pocock's Design Principles

**Evidence source:** Matt Pocock, ["Delete (most of) your docs"](https://www.youtube.com/watch?v=Fj8DKMbdIzU), YouTube, published 2026-07-16, duration 2:04. Timestamp links below map each claim to YouTube's timed auto-captions; the quotations were checked against those captions. No repository-local transcript is required for provenance.

### The Core Argument

**Evidence (00:39–01:08):** Pocock identifies a pattern in which people create a full layer of Markdown documentation for coding agents to rely on rather than making code self-explanatory. He describes the resulting conflict as a dual-source-of-truth problem. [Open at 00:39](https://www.youtube.com/watch?v=Fj8DKMbdIzU&t=39s)

> "Those docs... are usually not executable. They're not testable against the code. And so they can drift away from the code. The docs can say one thing, but the actual code, the source of truth, can say another. And this is really bad because if there are two sources of truth and they conflict, then AI won't know which one is the real one."

### What Pocock Is NOT Against

**Evidence (01:17–01:57):** Pocock explicitly says he is not against all documentation and names three useful categories. [Open at 01:17](https://www.youtube.com/watch?v=Fj8DKMbdIzU&t=77s)

1. **Alternatives considered** (01:28–01:36) → Architectural Decision Records. [Open at 01:28](https://www.youtube.com/watch?v=Fj8DKMbdIzU&t=88s)
2. **Domain language** (01:36–01:48) → Glossary. [Open at 01:36](https://www.youtube.com/watch?v=Fj8DKMbdIzU&t=96s)
3. **Navigation** (01:48–01:57) → Thin index/navigation layer. [Open at 01:48](https://www.youtube.com/watch?v=Fj8DKMbdIzU&t=108s)

### Design Principles Extracted

| Principle | Implication for OKF Skills |
|-----------|---------------------------|
| **Single source of truth** | **Inference:** Treat code as authoritative for executable behavior. Do not duplicate implementation facts unless a fixture demonstrates that the duplication is necessary and can be verified. |
| **Docs that diverge are harmful** | **Candidate default:** Track sources and surface suspected drift; the appropriate freshness rule depends on source type. |
| **Rationale > Structure** | **Inference:** Prefer rationale and meaning that are not reliably recoverable from code. |
| **Glossary** | **Inference:** Record domain meanings when names or usages alone are ambiguous. |
| **Thin navigation layer** | **Candidate default:** Start with a compact index and benchmark whether it improves task success and exploration cost. |
| **Resist documenting everything** | **Candidate default:** Require a concept to state what non-obvious knowledge it preserves. |

### The Implicit Warning

**Inference:** The transcript implies that an authoritative documentation layer which diverges from code creates ambiguity. Source tracking, drift signals, and review states are candidate mitigations; the video does not validate any particular lifecycle design.

---

## 2. Durable Context Across AI Coding Platforms

Full primary-source investigation at: `docs/research/durable-context-platforms.md`

### Scoped Convergence Points

**Evidence:** The six sampled platforms below all support persistent file-based guidance or conventions, but their discovery, precedence, limits, and memory behavior differ materially. This table does not establish industry-wide convergence.

| Platform | File | Scope | Auto-Memory |
|----------|------|-------|-------------|
| **Claude Code** | `CLAUDE.md` | Org → User → Project → Directory (concat) | Auto `MEMORY.md` (machine-local, ephemeral) |
| **OpenCode** | `AGENTS.md` | User → Project (first match wins) | References, Instructions field |
| **Cursor** | `.cursor/rules/*.mdc` | Directory-scoped glob patterns | None |
| **Copilot** | `.github/copilot-instructions.md` | Project-level | None |
| **Windsurf** | `.windsurfrules` (legacy), Rules | User → Project → Enterprise | Cascade Memories |
| **Aider** | `CONVENTIONS.md` | Project-level | Read-only files, repo map |

### Repeated Patterns in the Sample

**Evidence and inference:** The cited platform documents support different subsets of these concerns. They are cross-source synthesis, not universal warnings attributable to every platform.

1. **Context bloat**: Dumping everything into one file → diluted attention, reduced adherence
2. **Documenting structural facts**: "Agents can derive architecture from code" — don't document directory trees, dependency lists, or class hierarchies
3. **Auto-memory as permanent storage**: Machine-local, non-deterministic, stale — explicitly NOT durable context
4. **Documentation-code divergence**: When instructions say one thing and code does another, the model faces ambiguous authority
5. **Instruction files as enforcement**: Models can ignore instructions — hooks and CI checks are the real enforcement layer

### Gaps in the Sampled Documentation

- **Lifecycle management — Inference:** No sampled product documents an end-to-end lifecycle across all dimensions in this report.
- **Size controls — Evidence:** Anthropic advises targeting fewer than 200 lines per `CLAUDE.md`; separately, Claude auto-memory loads only the first 200 lines or 25 KB. Windsurf documents 12,000-character workspace-rule and 6,000-character global-rule limits, while Codex documents a configurable aggregate project-instruction byte cap. These are product/file-specific facts, not context-window constants.
- **Conflict handling — Inference:** The sampled docs warn about conflicts or define precedence, but no reviewed source documents semantic contradiction detection across all scopes.
- **Provenance — Inference:** Version control can record file authorship, while the sampled instruction formats do not themselves require per-claim provenance or review dates.

### The Implication for OKF Skills

**Inference:** OKF skills could add lifecycle behavior not documented as a complete system in the sampled products. Platform permissions and tool availability vary, so write capability must be detected rather than assumed.

---

## 3. Obsidian Knowledge Management — Transferable Patterns

Full primary-source investigation at: `docs/research/obsidian-transferable-patterns.md`

### HIGH Transferability (Adopt)

| Pattern | OKF Mapping |
|---------|------------|
| **Atomicity** (one concept per file) | One `.md` file per concept in the OKF bundle |
| **Maps of Content** (curated link lists) | `index.md` files, but grouped by meaning not just `type` |
| **YAML frontmatter for metadata** | Already core to OKF — `type`, `title`, `description`, `tags` |
| **Stable identifiers** | **Decision required:** paths are locators, but using them as identity conflicts with move/archive/merge stability; choose immutable IDs, path identity, or an explicit alias/redirect model |
| **Link context** (explain _why_ links exist) | Annotated links in concept bodies |
| **Progressive disclosure** (index → sub-index → leaf) | OKF's `index.md` → directory → concept flow |
| **Freshness metadata** (`reviewed`, `status`, `confidence`) | Maps to OKF `status`, `stale_after`, `verified` |
| **Organic structure emergence** | **Candidate default:** start flat; introduce MOCs when fixture measurements show navigation or retrieval degradation |
| **Write in your own words** | Agents should synthesize, not copy-paste source material |

### Anecdotal Structural Counts, Not Thresholds

The cited Zettelkasten.de article is one practitioner's retrospective. It does not establish general thresholds, and its observations must not directly trigger OKF mutations.

| Anecdotal note count | Reported pattern in that vault |
|---------------|-------------------|
| fewer than roughly 500 | The author used simpler navigation |
| roughly 500–700 | The author introduced hub-like notes |
| roughly 1,000–1,500 | The author observed structure notes |
| beyond that range | The author added structures that organize structure notes |

**Candidate default:** Treat these counts only as benchmark points when building fixtures. Recommend structure based on measured search failure, retrieval quality, navigation cost, and user feedback—not concept count alone.

### MEDIUM Transferability (Implement with Effort)

- **Backlinks** (reverse navigation): Requires a build-step grep or graph tool. OKF's `index.md` generator already does partial backlinking.
- **Automated freshness queries**: Requires scheduled or hook-driven metadata inspection. Solvable with a skill.
- **Orphan detection**: Requires constructing a link graph. Solvable with a static analysis tool.
- **Three-layer structural emergence**: Layers emerge naturally but require an agent that recognizes thresholds.

### Do NOT Adopt (Obsidian-Specific)

- Wikilink syntax (`[[double brackets]]`)
- Obsidian URI scheme (`obsidian://`)
- Plugin dependency model (Dataview query language, Templater, Calendar)
- Graph visualizations (textual summaries deliver same information)
- Obsidian Sync / Publish (vendor-locked)

---

## 4. Lifecycle Dimensions — Deep-Dive Analysis

Full primary-source investigation at: `docs/research/lifecycle-dimensions.md`

For each dimension: what the community does, what OKF v0.2 provides, what gaps remain, and how code-backed vs knowledge-only projects differ.

### 4.1 Concept Depth

**OKF status**: No constraints on granularity. `type` field identifies concept kind; no size limits.

**Key findings:**
- ADR community: one decision per record (direct parallel to OKF's one-concept-per-file)
- Google design-doc author: anecdotal 10–20-page "sweet spot"; useful only as a fixture input
- dbt: a three-layer transformation model; it does not establish an OKF depth limit
- OKF v0.1→v0.2 shift is instructive: Attested Computation pattern splits when lifecycle/trust signals diverge

**Gaps**: No minimum viable concept size, no maximum, no splitting criteria, no navigation depth limits.

**Candidate default:** Evaluate the heuristic "split when lifecycle/trust signals need to diverge." Benchmark any nesting-depth or word-count warning on fixtures; `3–4` levels and `5,000` words are hypotheses, not validated limits.

**Candidate default:** Fixture-test thin code-backed concepts and lateral links
for knowledge-only bundles. Three levels is a benchmark case, not a typical or
maximum depth established by evidence.

### 4.2 Glossaries

**OKF status**: No dedicated glossary mechanism. No reserved `type` for terms. No link typing. No code-drift detection.

**Key findings:**
- DDD Ubiquitous Language: same terms must appear in code and documentation
- GitLab: word list as companion to style guide; Vale lint rules enforce consistency
- dbt: auto-generated from YAML annotations, hand-curated for semantics
- The `description` field (single sentence) is insufficient as a glossary definition

**Gaps**: No term/concept distinction, no backlink tracking, no code-drift detection, no definition format convention.

**Candidate default:**
- Reserve `type: Term` for glossary entries with extended body for full definitions
- Provide a `okf glossary check` skill that verifies code references match OKF definitions
- Test glossary-index generation from cross-link density; choose `N` only from fixture results
- In code-backed projects: glossary captures only ambiguous terms. In knowledge-only: every term must be defined.

### 4.3 Logs

**OKF status**: `log.md` with date-grouped entries, newest first. No standardized entry format, no requirement to include concept IDs.

**Key findings:**
- ADR community: decision log = immutable, write-once-supersede-never-delete
- Google design docs: amend original doc, link to amendments
- Hermes-OKF: auto-generated log entries via decorators, structured commit prefixes
- **Central tension**: git history makes `log.md` arguably redundant — unresolved

**Gaps**: Log vs git tension, granularity (per-directory vs bundle-level), auto-generation, retention, entry-to-concept linking.

**Candidate default:**
- **Code-backed**: `log.md` auto-generated from commit messages. Git is authoritative. Structured commit prefixes (`[session]`, `[decision]`, `[plan]`).
- **Knowledge-only**: `log.md` IS the primary audit trail. Every modification produces a log entry with concept ID reference. Per-directory logs for large bundles.
- Adopt the rakibtg convention: `* **{kind}**: {text}` entries.

### 4.4 Provenance

**OKF status**: Rich provenance model — `sources` with credibility signals (`author`, `usage_count`, `last_modified`), `usage_window`, per-claim attribution via footnotes. Explicitly defers `derived_from` chains.

**Key findings:**
- W3C PROV: three core types (Entity, Activity, Agent) with relationships
- OpenLineage: automated capture of pipeline lineage
- signed-okf: Ed25519 signatures for cryptographic provenance
- Git: implicit provenance via `git blame`

**Gaps**: No derivation chains, no `created_because` field, fuzzy `resource` semantics (URL vs scope descriptor), no multi-bundle provenance, no source freshness propagation.

**Candidate default:**
- Add an optional `derived_from` frontmatter field for agent-synthesized concepts
- Auto-populate `sources` from `git blame` in code-backed projects
- In knowledge-only fixtures, test the reference agent's "four-gate test";
  its thresholds and quality effects are not validated

### 4.5 Freshness

**OKF status**: `stale_after` (absolute date), `status` (draft/stable/deprecated). No interaction semantics between fields.

**Key findings:**
- ADR community: immutability model — supersede, never change
- okforge: git-delta-based staleness (file changed since last concept update)
- Wikipedia: human-assigned freshness templates
- Absolute dates are either too aggressive or too conservative — no perfect model

**Gaps**: No relative TTL, no combination semantics (status × stale_after × verified), no re-verification triggers, no staleness cascade.

**Candidate default:**
- **Code-backed**: Use git deltas as review signals, not proof of staleness.
  A source change may be semantically irrelevant, while semantic drift may
  occur without a source-file delta.
- **Knowledge-only**: Benchmark absolute review intervals on fixtures. `30–90 days` is only a candidate range. A stale source may flag dependents for review, but automatic status cascades are a **decision required** semantic.

### 4.6 Approvals and Notices

**OKF status**: Three trust tiers (unverified → machine-confirmed → human-reviewed). Advisory signals, not access control.

**Key findings:**
- ADR community: Proposed → Accepted / Rejected / Superseded with explicit approvals
- Git workflows: PR approval = human-reviewed
- okforge: "nudge" as gentler alternative to approval — non-blocking reminder

**Gaps**: **This is the #1 priority gap.** No tiered operational model, no notice mechanism, no conflict resolution, no approval workflow states, no differential trust, no quorum.

**Decision required:** Define and fixture-test an operations matrix. The following is a candidate policy, not validated behavior:

| Operation | Unverified | Machine-confirmed | Human-reviewed |
|-----------|-----------|-------------------|----------------|
| Read | Allowed | Allowed | Allowed |
| Validate | Allowed | Allowed | Allowed |
| Create concept | Allowed | Allowed | Allowed |
| Add verification | Allowed | Allowed | Human-only |
| Update body | Allowed (notice) | Allowed (notice) | Allowed (silent) |
| Change status → deprecated | Blocked | Requires preview | Allowed (notice) |
| Archive | Blocked | Blocked | Allowed (preview) |
| Compact (merge/split) | Blocked | Blocked | Allowed (preview) |
| Delete | Blocked | Blocked | Requires confirmation |

**Code-backed**: Use PR workflow for approval. Trust tiers less critical.
**Knowledge-only**: Strictly enforce tier gates. Only human actors can promote to `human-reviewed`.

### 4.7 Growth Management

**OKF status**: No growth management mechanisms. `index.md` progressive disclosure is the only navigation aid.

**Key findings:**
- Zettelkasten thresholds: <500 (tags), 500–700 (hubs), 1000–1500 (MOCs), >1500 (meta-MOCs)
- Wikipedia: notability guidelines, deletion debates, merge/split proposals
- dbt: exactly one place per transformation — duplicates are structural smell

**Gaps**: No bundle size thresholds, no deduplication, no merge/split tooling, no noise detection.

**Candidate default:** A skill may monitor concept count, average body length, cross-link density, directory depth, and creation rate. Do not mutate or recommend solely from the anecdotal counts. Benchmark candidate alert points—including 500 concepts, 1,000 concepts, and 80% similarity—against labeled fixtures before selecting defaults.

### 4.8 Compaction

**OKF status**: No compaction mechanisms. `status: deprecated` is logical deletion without relocation or merge.

**Key findings:**
- Wikipedia: merge proposals with redirects preserving inbound links
- Zettelkasten: buffer notes → permanent notes, structure notes as compaction artifacts
- ADR: immutable records, never edited, only superseded

**Gaps**: No merge semantics (redirect handling, link rewriting), no summarization patterns, no compaction safety rules, no compression provenance.

**Decision required:** Define merge and split semantics before implementation. Unresolved choices include immutable identity versus path identity; whether aliases or redirect concepts are format-level; redirect-chain and cycle handling; whether inbound links are rewritten; routing after moves; source and target trust; log/provenance shape; and rollback behavior. `type: Redirect`, `redirects_to`, and `compacted_from` are examples only, not established fields.

**Candidate default:** Compaction should be preview-only until a dry-run, snapshot/backup, and tested restore succeed on a representative fixture. Human review and trust-tier gates do not replace restore verification.

### 4.9 Archiving

**OKF status**: Only `status: deprecated`. No `archive/` directory convention. No deletion semantics. No archival metadata.

**Key findings:**
- ADR/decision log: supersede in place, never delete
- Hermes-OKF: `plans/archive/` convention for completed plans
- Unix: `archive/` directory — simple relocation

**Gaps**: No convention, no deletion semantics, no archival metadata, no retention policy, no deprecation cascade.

**Decision required:** Choose in-place deprecation versus relocation. Because bundle-relative paths may currently act as identifiers, moving a concept to `archive/` can change identity and break inbound links. `archive/`, `deprecation_reason`, `superseded_by`, and `retain_until` are candidate conventions only.
- **Code-backed**: Follow code lifecycle. Archive when code entity is removed.
- **Knowledge-only candidate:** Benchmark archival-candidate rules. `stale_after + 90 days` and zero inbound links are unvalidated starting points and must never trigger an automatic move.

### 4.10 Loss Prevention

**OKF status**: Inherits git's capabilities. No soft-delete, undo, conflict detection, or staging area.

**Key findings:**
- Git commits provide versioned history for committed content. `git revert` creates a new commit that reverses a commit's changes.
- Reflogs are local logs of ref updates, not backups. Entries expire and unreachable objects can later be pruned; recovery is therefore conditional and time-limited.
- `git archive` exports a tree snapshot and does not preserve repository history or reflogs.
- Hermes-OKF: `git_revert(ref)` for explicit undo
- okforge: Stop-hook nudge prevents silent drift
- Wikipedia: soft-delete with admin visibility

**Gaps:** Git helps only when the relevant state was committed and the repository or a verified backup remains available. Sufficiency depends on threat model, remote/backup policy, and tested recovery—not project type alone.

**Candidate default:** Require `--dry-run` for destructive operations. Before migration, merge/split, archival relocation, compaction, purge, or history rewriting: create a snapshot or full backup, verify it (for example, `git bundle verify` plus integrity checks), restore it into a disposable location, and verify expected refs and files. An automatic commit is not a backup.

**Decision required:** Choose trash, retention, and undo semantics after fixtures validate restoration. `30-day` purge is only a candidate value; no automatic purge should ship without recovery tests.

### 4.11 Retrieval

**OKF status**: Three primitives — `index.md` (grouped by `type`), cross-links (untyped), tags (consumption-time filtering only).

**Key findings:**
- RAG: dominant paradigm for semantic retrieval
- okforge graph API: programmatic traversal without loading all concepts
- Hermes-OKF SearchIndex: BM25 keyword retrieval
- Zettelkasten MOCs: hand-curated semantic navigation

**Gaps**: No relevance ranking, no context-window budget management, no MOC pattern (only structural grouping by `type`), no embedding storage convention.

**Candidate default:**
- Implement a `context build` experiment: given a query, return ranked concepts within a configurable budget
- Support retrieval modes: exact match (resource URI), tag filter, keyword search, semantic search (optional RAG layer)
- Introduce `type: Map` or `type: Overview` for hand-curated MOCs
- Code-backed: retrieval is code-driven (find concept by source file path). Knowledge-only: retrieval IS the interface.

---

## 5. Synthesis: A Proposed OKF Skill Lifecycle

**Candidate default:** The following architecture is a design premise to test, not a validated result.

### 5.1 Two Modes

| Aspect | Code-Backed | Knowledge-Only |
|--------|------------|----------------|
| **Source of truth** | Code. OKF captures rationale, domain language, invariants. | OKF is the complete source of truth. |
| **Concept depth** | Thin wrappers; benchmark depth. | Primary artifact; benchmark hierarchy versus links. |
| **Freshness driver** | Git deltas may flag review; source change does not prove semantic staleness. | Benchmark review intervals and prompts. |
| **Glossary** | Only ambiguous terms. Code is the primary glossary. | Every term must be defined. |
| **Log** | Auto-generated from commits. Git authoritative. | Manual + auto-generated. Primary audit trail. |
| **Approval** | PR workflow. Trust tiers advisory. | Strict tier gates. Human-only for `human-reviewed`. |
| **Growth trigger** | Self-limiting (bounded by code artifacts) | Unbounded. Monitor counts, density, creation rate. |
| **Compaction** | Rare. Archive when code removed. | Essential. Merge-similar, summarize-directory, archive-stale. |
| **Archival** | Follow code lifecycle. | Formal ceremony: reason + successor + retention. |
| **Loss prevention** | Committed Git history plus independently verified backup/restore appropriate to the threat model. | Same, with a candidate trash/undo UX. |
| **Retrieval** | Code-driven (find by source path). | Query-driven (semantic search, tags, MOCs). |

### 5.2 Priority Gaps

Ranked by urgency — these must be resolved before implementation:

1. **Operational trust tier model** (§4.6): What operations require which approval level? The matrix in §4.6 is a starting point.
2. **Concept ↔ source traceability** (§4.4): Every concept needs an optional `derived_from` or `source_files` field.
3. **Retrieval model within context window limits** (§4.11): How does progressive disclosure map to token budgets?
4. **Merge and split semantics** (§4.8): Redirect conventions, link rewriting, provenance recording.
5. **Archive lifecycle and discoverability** (§4.9): `archive/` convention, `deprecation_reason`, `superseded_by`, `retain_until`.

### 5.3 Design Premises to Validate

Distilled from all four research streams:

1. **Inference:** Avoid unverifiable duplication of implementation.
2. **Candidate default:** Require every concept to state what it preserves beyond readily recoverable code facts.
3. **Candidate default:** Surface suspected staleness; do not equate elapsed time or source change with proof of staleness.
4. **Candidate default:** Destructive operations require preview, verified backup, tested restore, and explicit approval.
5. **Candidate default:** Start with minimal structure and add navigation when fixture metrics show degradation; no count alone is decisive.
6. **Inference:** Annotated links preserve more relationship meaning than bare links.
7. **Decision required:** Plain Markdown and YAML maximize portability, but identity and redirect semantics must still be specified.

### 5.4 Migration Research Gap

**Evidence:** Codex documents a dedicated import flow from Claude Code/Cowork; Claude Code's `/init` can read several other products' rule files; Cursor and Windsurf document legacy-rule transitions. These are product-specific import or file-layout migrations, not a shared durable-context migration protocol.

**Decision required:** Define inventory, source precedence, identity mapping, path moves, aliases/redirects, conflict reporting, provenance retention, trust reset/preservation, validation, rollback, and idempotent re-runs. Migration must begin with a dry-run and verified backup, then prove restoration in a disposable location before modifying the live bundle.

### 5.5 Candidate Exclusions

- Don't create an Obsidian plugin or adopt wikilink syntax
- Don't build a documentation site — agents need files, not HTML
- Don't implement auto-memory that drifts silently — freshness checks or nothing
- Don't treat OKF concepts as a second codebase — they are the complement, not the mirror
- Don't automate destruction — archive, don't delete; merge with redirect, don't absorb silently

---

## Sources

- Matt Pocock, ["Delete (most of) your docs"](https://www.youtube.com/watch?v=Fj8DKMbdIzU), published 2026-07-16; timestamp mapping in §1
- Matt Pocock, [`writing-great-skills` at commit `ed37663cc5fbef691ddfecd080dff42f7e7e350d`](https://github.com/mattpocock/skills/tree/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/writing-great-skills) — pinned upstream snapshot used as a design-premise reference, not validation evidence
- Git, [`git-reflog`](https://git-scm.com/docs/git-reflog), [`git-archive`](https://git-scm.com/docs/git-archive), and [`git-bundle`](https://git-scm.com/docs/git-bundle) documentation
- OKF v0.2 Specification — `GoogleCloudPlatform/knowledge-catalog`,
  `okf/SPEC.md`; migration commit 2026-07-24 and official announcement
  2026-07-25
- `docs/research/okf-spec-and-ecosystem.md` — existing ecosystem analysis (this repo)
- `docs/research/durable-context-platforms.md` — platform patterns investigation (this repo)
- `docs/research/obsidian-transferable-patterns.md` — Obsidian KM patterns investigation (this repo)
- `docs/research/lifecycle-dimensions.md` — lifecycle dimensions deep-dive (this repo)
- Claude Code Memory docs — https://docs.anthropic.com/en/docs/claude-code/memory
- OpenCode docs — https://opencode.ai/docs/
- Cursor Rules for AI — https://docs.cursor.com/context/rules-for-ai
- Zettelkasten.de — https://zettelkasten.de/introduction/
- Andy Matuschak, Evergreen Notes — https://notes.andymatuschak.org/
- Google Design Docs (Malte Ubl) — https://industrialempathy.com/posts/design-docs-at-google/
- AWS ADR Process — https://docs.aws.amazon.com/prescriptive-guidance/
- W3C PROV Data Model — https://www.w3.org/TR/prov-overview/
