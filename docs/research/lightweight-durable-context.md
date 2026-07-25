# Lightweight Durable Context Lifecycle for OKF Skills

> Research date: July 2026  
> Sources: Three fanout research sub-agents (AI coding platforms, Obsidian KM patterns, lifecycle dimensions), Matt Pocock YouTube Short transcript, OKF v0.2 specification, existing ecosystem analysis

---

## Executive Summary

**The problem:** Agents lose their memory across sessions. Code is unrecoverable context — agents can re-read code, but they cannot recover _why_ decisions were made, what alternatives were considered, what domain language means, or what invariants must hold. Without durable context, every session starts from scratch.

**What works:** The industry has converged on Markdown instruction files (CLAUDE.md, AGENTS.md, .cursorrules) as the mechanism for persisting agent context across sessions. Every platform warns the same way: document rationale, not structure. The Zettelkasten method and Obsidian community provide decades of battle-tested patterns for managing knowledge at scale — atomicity, Maps of Content, progressive disclosure, freshness metadata, and link-first organization.

**What's missing:** No platform has a lifecycle for this knowledge. Auto-generated memories are silently stale. Instruction files are never verified. No one knows when enough is enough. The OKF v0.2 spec provides trust tiers, provenance, and freshness primitives — but no operational model for when to apply them. This report fills that gap.

**The answer:** OKF skills should implement a **trust-gated, source-tracked, threshold-driven lifecycle** that differs fundamentally between code-backed projects (code is authoritative; OKF captures rationale and domain language) and knowledge-only projects (OKF is the complete source of truth). Eleven lifecycle dimensions are analyzed below. Five priority gaps require immediate design decisions before implementation.

---

## 1. Transcript Analysis — Matt Pocock's Design Principles

Source: YouTube Short `Fj8DKMbdIzU`, transcript at `/trans.txt`

### The Core Argument

Pocock identifies a "really annoying pattern": people create a full layer of Markdown documentation for their AI coding agents to rely on, rather than making their code self-explanatory. The core problem is **dual source of truth**:

> "Those docs... are usually not executable. They're not testable against the code. And so they can drift away from the code. The docs can say one thing, but the actual code, the source of truth, can say another. And this is really bad because if there are two sources of truth and they conflict, then AI won't know which one is the real one."

### What Pocock Is NOT Against

"Some people will read this and think that I'm against all docs... No, that's not true." He enumerates the **three things code cannot explain**:

1. **Alternatives considered** — "code can't tell you what alternatives were considered instead of the code that's there." → Architectural Decision Records (ADRs)
2. **Domain language** — "it also can't really explain the domain language that you're using to work with your code. Does it know what an order is in your codebase? Probably not." → Glossary
3. **Navigation** — "a thin layer of docs just to navigate around the main aspects of your code is really helpful just to speed up AI's exploration of your code." → Index / Navigation layer

### Design Principles Extracted

| Principle | Implication for OKF Skills |
|-----------|---------------------------|
| **Single source of truth** | Code is authoritative for executable behavior. OKF must never mirror implementation (configs, constants, class hierarchies). |
| **Docs that diverge are worse than no docs** | Every OKF concept needs a freshness check. Stale concepts poison agent decisions. |
| **Rationale > Structure** | ADRs capture why. Code already says what. OKF concepts should answer "why" and "what it means," not "how it works." |
| **Glossary > Code comments** | A shared vocabulary is the bridge between code and agent understanding. Domain language must be defined once, referenced everywhere. |
| **Thin navigation layer** | An index that agents can scan quickly — not a full documentation site. The "table of contents for agents" use case. |
| **Resist the pull to document everything** | The discipline is subtraction, not addition. Every concept in the bundle must justify its existence against "can the agent recover this from code alone?" |

### The Implicit Warning

The transcript contains an unstated premise: **if you build a documentation layer that agents treat as authoritative, and it drifts from code, you have multiplied your problems, not solved them.** A durable-context lifecycle must be designed from first principles to _prevent_ drift — through source tracking, freshness detection, and trust tiers — rather than assuming it won't happen.

---

## 2. Durable Context Across AI Coding Platforms

Full primary-source investigation at: `docs/research/durable-context-platforms.md`

### Convergence Points

Every major AI coding platform has independently converged on the same architecture:

| Platform | File | Scope | Auto-Memory |
|----------|------|-------|-------------|
| **Claude Code** | `CLAUDE.md` | Org → User → Project → Directory (concat) | Auto `MEMORY.md` (machine-local, ephemeral) |
| **OpenCode** | `AGENTS.md` | User → Project (first match wins) | References, Instructions field |
| **Cursor** | `.cursor/rules/*.mdc` | Directory-scoped glob patterns | None |
| **Copilot** | `.github/copilot-instructions.md` | Project-level | None |
| **Windsurf** | `.windsurfrules` (legacy), Rules | User → Project → Enterprise | Cascade Memories |
| **Aider** | `CONVENTIONS.md` | Project-level | Read-only files, repo map |

### The Universal Anti-Patterns

Every platform's documentation converges on the same warnings:

1. **Context bloat**: Dumping everything into one file → diluted attention, reduced adherence
2. **Documenting structural facts**: "Agents can derive architecture from code" — don't document directory trees, dependency lists, or class hierarchies
3. **Auto-memory as permanent storage**: Machine-local, non-deterministic, stale — explicitly NOT durable context
4. **Documentation-code divergence**: When instructions say one thing and code does another, the model faces ambiguous authority
5. **Instruction files as enforcement**: Models can ignore instructions — hooks and CI checks are the real enforcement layer

### What No Platform Has Solved

- **Lifecycle management**: No platform has staleness detection, freshness tracking, or verification for instruction files
- **Growth management**: Only Claude Code has a size limit (200 lines), and it's advisory, not enforced
- **Conflict detection**: No platform detects contradictory rules across scopes
- **Provenance**: No platform tracks who wrote which instruction or when it should be reviewed

### The Implication for OKF Skills

OKF skills have an opportunity to fill what every platform leaves as a gap: a lifecycle for durable context. The permission to read and write OKF bundles already exists in every platform. What's missing is _when_ to write, _what_ to write, and _when to stop_.

---

## 3. Obsidian Knowledge Management — Transferable Patterns

Full primary-source investigation at: `docs/research/obsidian-transferable-patterns.md`

### HIGH Transferability (Adopt)

| Pattern | OKF Mapping |
|---------|------------|
| **Atomicity** (one concept per file) | One `.md` file per concept in the OKF bundle |
| **Maps of Content** (curated link lists) | `index.md` files, but grouped by meaning not just `type` |
| **YAML frontmatter for metadata** | Already core to OKF — `type`, `title`, `description`, `tags` |
| **Stable identifiers** | Bundle-relative file paths as concept IDs |
| **Link context** (explain _why_ links exist) | Annotated links in concept bodies |
| **Progressive disclosure** (index → sub-index → leaf) | OKF's `index.md` → directory → concept flow |
| **Freshness metadata** (`reviewed`, `status`, `confidence`) | Maps to OKF `status`, `stale_after`, `verified` |
| **Organic structure emergence** | Start flat, add MOCs when navigation pain is felt (~500 concepts) |
| **Write in your own words** | Agents should synthesize, not copy-paste source material |

### Structural Thresholds (from Zettelkasten.de)

| Concept Count | Navigation Pattern |
|---------------|-------------------|
| <500 | Flat tags and full-text search sufficient |
| 500–700 | Hub notes become necessary |
| 1000–1500 | Structure notes (MOCs) become necessary |
| >1500 | Meta-MOCs (structure notes that organize structure notes) |

These thresholds should inform OKF skill behavior: monitor concept count, recommend structure when thresholds are crossed.

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
- Google design docs: 10–20 pages is the sweet spot; split beyond that
- dbt: three layers (staging → intermediate → marts); beyond 3–4 levels is a refactoring smell
- OKF v0.1→v0.2 shift is instructive: Attested Computation pattern splits when lifecycle/trust signals diverge

**Gaps**: No minimum viable concept size, no maximum, no splitting criteria, no navigation depth limits.

**Recommendation**: Adopt the heuristic "split when lifecycle/trust signals need to diverge." Maximum 3–4 nesting levels. Concepts exceeding ~5K words should trigger a split suggestion.

**Code-backed vs knowledge-only**: Code-backed concepts are thin wrappers (3 levels depth typical). Knowledge-only concepts are the primary artifact — deeper nesting warranted but favor lateral links over hierarchy.

### 4.2 Glossaries

**OKF status**: No dedicated glossary mechanism. No reserved `type` for terms. No link typing. No code-drift detection.

**Key findings:**
- DDD Ubiquitous Language: same terms must appear in code and documentation
- GitLab: word list as companion to style guide; Vale lint rules enforce consistency
- dbt: auto-generated from YAML annotations, hand-curated for semantics
- The `description` field (single sentence) is insufficient as a glossary definition

**Gaps**: No term/concept distinction, no backlink tracking, no code-drift detection, no definition format convention.

**Recommendation**:
- Reserve `type: Term` for glossary entries with extended body for full definitions
- Provide a `okf glossary check` skill that verifies code references match OKF definitions
- Auto-generate glossary indexes from cross-link density (>N concepts reference the same concept → it's de facto a glossary term)
- In code-backed projects: glossary captures only ambiguous terms. In knowledge-only: every term must be defined.

### 4.3 Logs

**OKF status**: `log.md` with date-grouped entries, newest first. No standardized entry format, no requirement to include concept IDs.

**Key findings:**
- ADR community: decision log = immutable, write-once-supersede-never-delete
- Google design docs: amend original doc, link to amendments
- Hermes-OKF: auto-generated log entries via decorators, structured commit prefixes
- **Central tension**: git history makes `log.md` arguably redundant — unresolved

**Gaps**: Log vs git tension, granularity (per-directory vs bundle-level), auto-generation, retention, entry-to-concept linking.

**Recommendation**:
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

**Recommendation**:
- Add an optional `derived_from` frontmatter field for agent-synthesized concepts
- Auto-populate `sources` from `git blame` in code-backed projects
- In knowledge-only projects, enforce the reference agent's "four-gate test" for source quality

### 4.5 Freshness

**OKF status**: `stale_after` (absolute date), `status` (draft/stable/deprecated). No interaction semantics between fields.

**Key findings:**
- ADR community: immutability model — supersede, never change
- okforge: git-delta-based staleness (file changed since last concept update)
- Wikipedia: human-assigned freshness templates
- Absolute dates are either too aggressive or too conservative — no perfect model

**Gaps**: No relative TTL, no combination semantics (status × stale_after × verified), no re-verification triggers, no staleness cascade.

**Recommendation**:
- **Code-backed**: Freshness from git deltas. `okf stale` command checks: "has source code changed since last concept modification?" Use `stale_after` only for external references.
- **Knowledge-only**: Absolute dates with aggressive defaults (30–90 days). Periodic review prompts. Status changes should cascade — if source goes stale, derived concepts should flag.

### 4.6 Approvals and Notices

**OKF status**: Three trust tiers (unverified → machine-confirmed → human-reviewed). Advisory signals, not access control.

**Key findings:**
- ADR community: Proposed → Accepted / Rejected / Superseded with explicit approvals
- Git workflows: PR approval = human-reviewed
- okforge: "nudge" as gentler alternative to approval — non-blocking reminder

**Gaps**: **This is the #1 priority gap.** No tiered operational model, no notice mechanism, no conflict resolution, no approval workflow states, no differential trust, no quorum.

**Recommendation**: Define an operations matrix:

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

**Recommendation**: A skill should monitor concept count, average body length, cross-link density, directory depth, and creation rate. Trigger recommendations at established thresholds:
- **>500 concepts**: Recommend MOCs
- **>1000 concepts**: Recommend meta-MOCs
- **Deduplication**: Flag concepts with >80% tag overlap or semantic similarity

### 4.8 Compaction

**OKF status**: No compaction mechanisms. `status: deprecated` is logical deletion without relocation or merge.

**Key findings:**
- Wikipedia: merge proposals with redirects preserving inbound links
- Zettelkasten: buffer notes → permanent notes, structure notes as compaction artifacts
- ADR: immutable records, never edited, only superseded

**Gaps**: No merge semantics (redirect handling, link rewriting), no summarization patterns, no compaction safety rules, no compression provenance.

**Recommendation**:
- Define merge/split as first-class operations with redirect concepts (`type: Redirect`, `redirects_to: <path>`)
- Never auto-compact without human review for `unverified` concepts
- `human-reviewed` concepts may be auto-compacted with preview
- Record compaction provenance: `compacted_from: [path1, path2]`

### 4.9 Archiving

**OKF status**: Only `status: deprecated`. No `archive/` directory convention. No deletion semantics. No archival metadata.

**Key findings:**
- ADR/decision log: supersede in place, never delete
- Hermes-OKF: `plans/archive/` convention for completed plans
- Unix: `archive/` directory — simple relocation

**Gaps**: No convention, no deletion semantics, no archival metadata, no retention policy, no deprecation cascade.

**Recommendation**:
- Adopt `archive/` directory convention. Move `status: deprecated` concepts there.
- Add frontmatter: `deprecation_reason`, `superseded_by`, `retain_until`
- **Code-backed**: Follow code lifecycle. Archive when code entity is removed.
- **Knowledge-only**: Auto-detect candidates (stale_after + 90 days, zero inbound links). Require reason + successor reference for deprecation.

### 4.10 Loss Prevention

**OKF status**: Inherits git's capabilities. No soft-delete, undo, conflict detection, or staging area.

**Key findings:**
- Git is the baseline — `git revert`, `git reflog` for recovery
- Hermes-OKF: `git_revert(ref)` for explicit undo
- okforge: Stop-hook nudge prevents silent drift
- Wikipedia: soft-delete with admin visibility

**Gaps**: Git sufficient for code-backed projects; insufficient for knowledge-only.

**Recommendation**:
- **Code-backed**: Git is sufficient. Add structured commit messages by operation type.
- **Knowledge-only**: Add `.trash/` convention (30-day auto-purge), `okf undo` command, `--dry-run` on all destructive operations, auto-commit before compaction/archival runs.

### 4.11 Retrieval

**OKF status**: Three primitives — `index.md` (grouped by `type`), cross-links (untyped), tags (consumption-time filtering only).

**Key findings:**
- RAG: dominant paradigm for semantic retrieval
- okforge graph API: programmatic traversal without loading all concepts
- Hermes-OKF SearchIndex: BM25 keyword retrieval
- Zettelkasten MOCs: hand-curated semantic navigation

**Gaps**: No relevance ranking, no context-window budget management, no MOC pattern (only structural grouping by `type`), no embedding storage convention.

**Recommendation**:
- Implement a `context build` operation: given a query, return N most relevant concepts within a token budget
- Support retrieval modes: exact match (resource URI), tag filter, keyword search, semantic search (optional RAG layer)
- Introduce `type: Map` or `type: Overview` for hand-curated MOCs
- Code-backed: retrieval is code-driven (find concept by source file path). Knowledge-only: retrieval IS the interface.

---

## 5. Synthesis: A Proposed OKF Skill Lifecycle

Based on the cross-cutting analysis of all four research streams, a lightweight durable-context lifecycle for OKF skills should have the following architecture:

### 5.1 Two Modes

| Aspect | Code-Backed | Knowledge-Only |
|--------|------------|----------------|
| **Source of truth** | Code. OKF captures rationale, domain language, invariants. | OKF is the complete source of truth. |
| **Concept depth** | Thin wrappers. 3 levels max. | Primary artifact. Deeper nesting ok, prefer links. |
| **Freshness driver** | Git deltas (source file changed → concept stale) | Absolute dates + periodic review prompts |
| **Glossary** | Only ambiguous terms. Code is the primary glossary. | Every term must be defined. |
| **Log** | Auto-generated from commits. Git authoritative. | Manual + auto-generated. Primary audit trail. |
| **Approval** | PR workflow. Trust tiers advisory. | Strict tier gates. Human-only for `human-reviewed`. |
| **Growth trigger** | Self-limiting (bounded by code artifacts) | Unbounded. Monitor counts, density, creation rate. |
| **Compaction** | Rare. Archive when code removed. | Essential. Merge-similar, summarize-directory, archive-stale. |
| **Archival** | Follow code lifecycle. | Formal ceremony: reason + successor + retention. |
| **Loss prevention** | Git sufficient. Structured commits. | Git + `.trash/` + `undo` + `--dry-run`. |
| **Retrieval** | Code-driven (find by source path). | Query-driven (semantic search, tags, MOCs). |

### 5.2 Priority Gaps

Ranked by urgency — these must be resolved before implementation:

1. **Operational trust tier model** (§4.6): What operations require which approval level? The matrix in §4.6 is a starting point.
2. **Concept ↔ source traceability** (§4.4): Every concept needs an optional `derived_from` or `source_files` field.
3. **Retrieval model within context window limits** (§4.11): How does progressive disclosure map to token budgets?
4. **Merge and split semantics** (§4.8): Redirect conventions, link rewriting, provenance recording.
5. **Archive lifecycle and discoverability** (§4.9): `archive/` convention, `deprecation_reason`, `superseded_by`, `retain_until`.

### 5.3 The Non-Negotiable Principles

Distilled from all four research streams:

1. **Never mirror implementation.** Code already says what. OKF captures why.
2. **Every concept justifies itself.** The test: "Can an agent recover this from code alone?" If yes, don't write it.
3. **Freshness is non-negotiable.** A stale concept is worse than no concept.
4. **Trust gates protect against entropy.** Unverified concepts should never be auto-deleted, merged, or archived.
5. **Structure emerges from content, not the reverse.** Start flat. Add MOCs when navigation pain is felt (~500 concepts).
6. **Links with context, not bare connections.** The _why_ of a connection is the knowledge.
7. **Plaintext over everything.** Markdown + YAML frontmatter. No proprietary formats, no vendor lock-in.

### 5.4 What NOT To Do

- Don't create an Obsidian plugin or adopt wikilink syntax
- Don't build a documentation site — agents need files, not HTML
- Don't implement auto-memory that drifts silently — freshness checks or nothing
- Don't treat OKF concepts as a second codebase — they are the complement, not the mirror
- Don't automate destruction — archive, don't delete; merge with redirect, don't absorb silently

---

## Sources

- Matt Pocock, YouTube Short `Fj8DKMbdIzU` — transcript at `trans.txt` (this repo)
- OKF v0.2 Specification — `GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md` (2026-06-30)
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
