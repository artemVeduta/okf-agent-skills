# Open Knowledge Format — Specification and Ecosystem Report

> Deep primary-source investigation. All claims cite their origin.

## 1. Executive Summary

The **Open Knowledge Format (OKF)** is an Apache 2.0-licensed open specification for representing organizational knowledge as plain Markdown files with YAML frontmatter. Created by Sam McVeety and Amir Hormati (Data Analytics Engineering, Google Cloud) and announced June 12, 2026, OKF is designed for a world where knowledge corpora are "continuously written and maintained by agents" (02-okf-v02-spec.md: §1).

The format is intentionally minimal: **one required field (`type`)**, two reserved filenames (`index.md`, `log.md`), three conformance rules. A bundle is a directory tree of `.md` files. That is the entire format. No SDK, no schema registry, no build step is required (01-okf-site-pages.md: Quickstart).

**Two versions of the specification exist:**

- **v0.1** (June 12, 2026): The minimal core — `type`, `title`, `description`, `resource`, `tags`, `timestamp`, body `# Citations`, three conformance rules. Documented on okf.md as "An Annotated Guide" and in the `okf/SPEC.md` history (08-okf-site-full.md: Spec page).
- **v0.2** (June 30, 2026): Adds provenance (`sources` with credibility signals), trust (`generated`/`verified` → trust tiers), lifecycle (`status`/`stale_after`), Attested Computations, and an actor convention. The spec claims it's a "minor version bump" but introduces two deliberate breaking changes (`timestamp` → `generated.at`, `# Citations` → `sources`), with explicit v0.1 fallback rules (02-okf-v02-spec.md: §13.1).

The **ecosystem** has grown rapidly: 22+ projects across Python, TypeScript, Go, Java, and PHP emerged within 6 weeks of the spec's publication. Key tools include `okflint` (the gold-standard deterministic linter), `superops-team/okf` (Go CLI for Git-aware bundle generation), `Kiso` (Java publishing engine), `LangChain OpenWiki` (13.2k stars, production-grade codebase → OKF wiki), and 20+ npm packages. Harrison Chase has endorsed OKF as "an OPEN standard for memory" (01-okf-site-pages.md: LangChain OpenWiki).

**Google Cloud Knowledge Catalog** (formerly Dataplex) is a sibling product from the same team — it can ingest and export OKF bundles, but OKF is explicitly vendor-neutral. Bundles work on any filesystem, with any static file server, in Obsidian, and with any LLM that can read text (05-google-cloud-kc.md).

**Key implications for a skill suite:** Build against v0.2 for trust/lifecycle signals while maintaining v0.1 fallback compatibility. The ecosystem lacks a unified multi-skill suite, automatic lifecycle implementation, and an MCP validation server — these are the primary opportunities (07-ecosystem-projects.md: Gaps).

---

## 2. The OKF Specification

### 2.1 v0.1 Spec (okf.md Annotated Guide)

**Purpose and design principles:** OKF v0.1 defines a "universal format for enrichment agents, consumer agents, and exchange" with explicit non-goals: no fixed taxonomy of concept types, no storage infrastructure, no replacement for domain schemas (08-okf-site-full.md: Spec page; 02-okf-v02-spec.md: §1).

| Principle | Manifestation |
|-----------|--------------|
| **Minimality** | One required field (`type`). No schema registry. "If you can `cat` a file, you can read OKF." |
| **Human- and agent-readable** | Plain Markdown + YAML frontmatter. No SDK or query language required. |
| **Diffable in version control** | Plain text in directory hierarchy. Git-native PRs, blame, review. |
| **Portable** | A bundle is a directory. Ship as tarball, host in repo, mount from filesystem. |
| **Minimally opinionated, freely extensible** | Unknown frontmatter keys tolerated. Unknown `type` values treated as generic. |
| **Progressive disclosure** | `index.md` files enable one-level-at-a-time navigation. |
| **Graph-shaped, not just tree-shaped** | Markdown links between concepts express relationships richer than hierarchy. |
| **Format, not platform** | Not tied to any cloud, database, model provider, or agent framework. |

(02-okf-v02-spec.md: Design Principles table; 08-okf-site-full.md: Spec page)

**Bundle structure:** A directory tree of `.md` files with two reserved filenames that MUST NOT be used for concepts (02-okf-v02-spec.md: §3.1):

| Filename | Purpose | Constraint |
|----------|---------|-----------|
| `index.md` | Directory listing (§8) | MUST NOT carry concept content; no frontmatter (except bundle-root for `okf_version`) |
| `log.md` | Update history (§9) | MUST NOT carry concept content |

```
bundle/
  index.md
  log.md
  <concept>.md
  <subdirectory>/
    index.md
    <concept>.md
```

Distribution formats: git repository (recommended), tarball/zip, subdirectory within a larger repo (02-okf-v02-spec.md: §3). Nesting depth is unconstrained.

**Concept documents:** Every concept is a UTF-8 Markdown file with YAML frontmatter delimited by `---` followed by a free-form Markdown body (02-okf-v02-spec.md: §4).

**Frontmatter fields (v0.1):**

| Field | Status | Description |
|-------|--------|-------------|
| `type` | **REQUIRED** | Short string identifying the concept kind. The only always-required key. |
| `title` | Recommended | Human-readable display name |
| `description` | Recommended | Single-sentence summary |
| `resource` | Recommended | Canonical URI for underlying asset |
| `tags` | Recommended | YAML list of short strings |
| `timestamp` | Recommended | ISO 8601 datetime |

Extensions: producers MAY include any additional keys. Consumers MUST preserve unknown keys on round-trip and MUST NOT reject documents with unrecognized fields (02-okf-v02-spec.md: §4.1).

**Body conventions:** Standard Markdown. RECOMMENDED: favor structural Markdown (headings, lists, tables, fenced code blocks) over freeform prose. Conventional (non-normative) heading meanings: `# Schema`, `# Examples`, `# Citations` (02-okf-v02-spec.md: §4.2).

**Cross-linking:** Two forms:
- Absolute (bundle-relative): `[label](/path/to/concept.md)` — **recommended** for stability when documents move
- Relative: `[label](./neighbor.md)` — standard Markdown

NORMATIVE: Consumers MUST tolerate broken links. A link to a non-existent target may represent not-yet-written knowledge (02-okf-v02-spec.md: §6).

**Index files (§8):** No frontmatter. Body organized as sections grouping concepts under headings, each entry being `* [Title](url) - description`. Entries SHOULD include the description from the linked concept's frontmatter. Producers MAY auto-generate; consumers MAY synthesize when none is present (02-okf-v02-spec.md: §8).

**Log files (§9):** Flat list of date-grouped entries, newest first. NORMATIVE: Date headings MUST use ISO 8601 `YYYY-MM-DD` form. Example:
```markdown
# Directory Update Log
## 2026-05-22
* **Update**: Added ...
* **Creation**: Established ...
```

(02-okf-v02-spec.md: §9)

**Citations (v0.1):** A numbered list under `# Citations` in the body. Can contain URLs, bundle-relative paths, or `references/` subdirectory references (08-okf-site-full.md: Spec page).

**Conformance rules (v0.1):**
1. Every non-reserved `.md` file has parseable YAML frontmatter
2. Every frontmatter has a non-empty `type` field
3. Reserved files (`index.md`, `log.md`) follow §6/§7 structure when present

Consumers MUST be lenient: tolerate missing optional fields, unknown `type` values, broken links, and absent `index.md` (02-okf-v02-spec.md: §11; 08-okf-site-full.md: Spec).

**Versioning:** `<major>.<minor>`. Minor = backward-compatible additions. Major = breaking changes. Bundles MAY declare `okf_version: "0.1"` in bundle-root `index.md` frontmatter (02-okf-v02-spec.md: §12).

**Design opinions (Appendix C):** The okf.md annotated guide explicitly calls out: untyped links are limiting, no body schema is both a strength and weakness, `resource` field is underspecified, and frontmatter-only validation is "genius" for its simplicity (08-okf-site-full.md: Spec page Appendices).

### 2.2 v0.2 Spec (SPEC.md in knowledge-catalog Repo)

**What changed from v0.1:** The v0.2 spec makes five questions first-class that v0.1 left implicit (02-okf-v02-spec.md: §1):
1. What was this created from, and how was it verified? (**provenance**)
2. How much should I trust it? (**trust**)
3. Is it still true? (**freshness**)
4. Is it the current version? (**lifecycle**)
5. Was this number produced the way we said it must be? (**attestation**)

**Breaking changes (§13.1):**

| v0.1 | v0.2 | Fallback |
|------|------|----------|
| `timestamp` frontmatter field | `generated: { by, at }` | Consumers MAY fall back to legacy `timestamp` when `generated` is absent |
| `# Citations` body list | `sources` frontmatter family | Consumers SHOULD read `sources` and MAY still parse a legacy `# Citations` body list |

(02-okf-v02-spec.md: §13.1)

**Additive changes (§13.2):**

| Addition | Location |
|----------|----------|
| `sources` frontmatter with credibility signals (`author`, `usage_count`, `last_modified`) and `usage_window` | §5.1 |
| `generated`, `verified` frontmatter families | §5.2–5.3 |
| `status`, `stale_after` lifecycle fields | §5.4–5.5 |
| Actor convention (`<producer>/<version>`, `human:<id>`, `process:<id>`) | §7 |
| `Attested Computation` concept type with `runtime`, `parameters`, `computation`, `executor`, `attester` | §10 |
| `# Computation` conventional body heading | §4.2 |

(02-okf-v02-spec.md: §13.2)

**Carried forward unchanged:** Bundle structure, reserved filenames, required `type`, recommended `title`/`description`/`resource`/`tags`, cross-linking, index files, log files, permissive conformance (02-okf-v02-spec.md: §13.2).

**Sources and provenance (§5.1):**
```yaml
sources:
  - id: ga4-schema
    resource: https://developers.google.com/analytics/bigquery/export-schema
    title: GA4 BigQuery Export schema
    author: team:ga4-docs
    usage_count: 5000
    last_modified: 2026-05-30
usage_window: { from: 2026-06-01, to: 2026-06-30 }
```

Key design decisions:
- `resource` is **required** within each source entry — names a concrete artifact (URL, path) OR a population/scope descriptor
- `id` is optional but SHOULD be present when the body cites the source — used as a stable join key for footnote-based per-claim attribution
- `author`, `usage_count`, `last_modified` are credibility **signals** (objective facts), not scores
- `usage_count` is acknowledged as a "coarse signal" — "comparable at the alive-versus-dead and order-of-magnitude level" (02-okf-v02-spec.md: §5.1)
- Deeper lineage (explicit `derived_from`, data lineage) is explicitly out of scope for v0.2
- Per-claim attribution uses Markdown footnotes `[^id]` keyed to `sources[].id` — stable join keys survive agent-driven list reordering, unlike positional indices (02-okf-v02-spec.md: §5.1)

**Trust tiers (§5.2–5.3):**
```yaml
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }

verified:
  - { by: human:ahormati, at: 2026-06-25T09:00:00Z }
  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }
```

NORMATIVE trust tier derivation from `verified`:
- No `verified` key → **unverified**
- `verified` by non-`human:` actors only → **machine-confirmed**
- `verified` by a `human:<id>` actor → **human-reviewed**

A concept with no trust frontmatter is still consumable; consumers MUST NOT reject it. Trust tiers are advisory signals, not access control (02-okf-v02-spec.md: §5.3).

NORMATIVE normalization: A bare `verified` mapping `{by, at}` MUST be treated as a one-element list `[{by, at}]` (02-okf-v02-spec.md: §5.2).

**Lifecycle (§5.4–5.5):**
```yaml
status: stable        # draft | stable | deprecated
stale_after: 2026-09-23
```

- `status`: `draft` (not yet reviewed), `stable` (default when absent), `deprecated` (kept for links/history)
- `stale_after`: Optional absolute date (`YYYY-MM-DD`). A concept is stale when `today >= stale_after`
- Design rationale for absolute date over relative TTL: "keeps the staleness decision a plain date comparison with no reference to when the concept was read" (02-okf-v02-spec.md: §5.5)

**Actor convention (§7):**

| Prefix | Meaning | Example |
|--------|---------|---------|
| `<producer>/<version>` | Agents and tools | `reference_agent/gemini-2.5-pro` |
| `human:<id>` | A person | `human:ahormati` |
| `process:<id>` | Automated process | `process:finance-nightly` |

NORMATIVE: Consumers that classify trust key off the `human:` prefix, so producers MUST use it for hand-authored or human-confirmed content (02-okf-v02-spec.md: §7).

**Attested Computations (§10):** A concept type (`type: Attested Computation`) that carries a sanctioned way to compute a value, so a consumer can confirm the value was produced by running it. Key fields:
```yaml
type: Attested Computation
runtime: bigquery              # REQUIRED
parameters:
  - { name: year, type: integer, required: true }
computation: references/computations/lib/revenue.sql
executor:
  resource: references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
```

Three motivations for standalone concepts (02-okf-v02-spec.md: §10.1):
1. `runtime` defines what `parameters` mean — co-location makes binding semantics self-evident
2. One computation can back a metric, dashboard, and report
3. Trust state is per computation — revenue, profit, margin each verify independently

Security design: agent MAY only supply *values* for declared `parameters`; MUST NOT author or edit the computation. The attester independently re-derives the binding to compare against what actually ran (02-okf-v02-spec.md: §10.3).

**What's deferred (§12):** Full runtime protocol, attester ABI/portability/sandboxing, attestation caching, semantic-layer templates.

**Structural shift from v0.1 to v0.2:** The worked example illustrates a fundamental change — v0.1 used a single monolithic concept doc with inline SQL for multiple figures; v0.2 decomposes into composable, independently-verifiable `Attested Computation` concepts with a thin narrative concept (`type: Metric`) linking to both. "Because each computation is its own concept, revenue can be fresh while profit is past its `stale_after`, and each attests on its own run" (02-okf-v02-spec.md: §13.2).

### 2.3 Normative Requirements Summary

**MUST rules (validator/enforcer MUST check, consumers MUST obey):**

| # | Rule | Source |
|---|------|--------|
| 1 | Every non-reserved `.md` file MUST have parseable YAML frontmatter | §11 |
| 2 | Every frontmatter MUST have a non-empty `type` field | §11 |
| 3 | `index.md` and `log.md` MUST NOT be used for concept documents | §3.1 |
| 4 | Log date headings MUST use ISO 8601 `YYYY-MM-DD` | §9 |
| 5 | Bare `verified` mapping `{by, at}` MUST be treated as one-element list `[{by, at}]` | §5.2 |
| 6 | Producers MUST use `human:` prefix for human-authored/confirmed content | §7 |
| 7 | Consumers MUST NOT reject a concept for missing any optional family | §5.3 |
| 8 | Consumers MUST NOT reject a bundle for: missing optional fields, unknown `type` values, unknown frontmatter keys, broken cross-links, missing `index.md` files | §11 |
| 9 | Consumers MUST tolerate broken cross-links | §6 |
| 10 | Consumers that do not understand a declared `okf_version` SHOULD attempt best-effort consumption | §12 |

(02-okf-v02-spec.md: §11, Conformance; 02-okf-v02-spec.md: Summary of normative vs optional checks)

**SHOULD rules (editorial guidance):**

| # | Rule | Source |
|---|------|--------|
| 1 | Consumers SHOULD derive trust tiers and staleness only from specified fields | §5.3 |
| 2 | Consumers SHOULD surface, not silently drop, failing attestations | §10.5 |
| 3 | Producers SHOULD favor structural Markdown in body | §4.2 |
| 4 | Producers SHOULD use `# Schema`, `# Examples`, `# Computation` headings when applicable | §4.2 |
| 5 | `type` values SHOULD be descriptive and self-explanatory | §4.1 |
| 6 | `sources[].id` SHOULD be present when body cites the source | §5.1 |
| 7 | Index entries SHOULD include descriptions from frontmatter | §8 |
| 8 | Consumers SHOULD preserve unknown keys when round-tripping | §4.1 |
| 9 | Consumers SHOULD read `sources` and MAY parse legacy `# Citations` for v0.1 documents | §13.1 |
| 10 | Consumers MAY fall back to legacy `timestamp` when `generated` is absent | §13.1 |

(02-okf-v02-spec.md: Summary of normative vs optional checks)

### 2.4 Underspecified Areas and Ambiguities

1. **`sources[].resource` dual nature**: Can be a concrete artifact (URL/path) OR a population/scope descriptor (e.g., "all queries in BigQuery project X"). No format or convention for scope descriptors. A consumer cannot reliably distinguish a broken URL from a scope descriptor (02-okf-v02-spec.md: Limitations and underspecification #1).

2. **`usage_count` semantics**: Defined as "how often `resource` was exercised" — but what counts as an exercise is unspecified. For scope descriptors: "the number of exercises within the scope that touch the concept." The spec acknowledges this is "coarse" and "not a precise cross-kind ranking" (02-okf-v02-spec.md: Limitations #2).

3. **`usage_window` date format**: Example shows `{from: 2026-06-01, to: 2026-06-30}` but no format is mandated. Are these `YYYY-MM-DD` strings? Date objects? ISO 8601? (02-okf-v02-spec.md: Limitations #3).

4. **`parameters[].type` vocabulary**: Attested Computation parameters declare a `type` field, but no vocabulary or validation rules are specified. Arbitrary strings are allowed (02-okf-v02-spec.md: Limitations #14).

5. **No multi-bundle operations**: No specification for referencing concepts across bundles, merging bundles, or versioning bundles as a unit. Cross-bundle links would be broken by design (02-okf-v02-spec.md: Limitations #4).

6. **No conflict resolution for lifecycle states**: What happens when `status: deprecated` and `stale_after` is in the future? Or `status: draft` but human-verified? Fields are defined independently with no interaction semantics (02-okf-v02-spec.md: Limitations #5).

7. **`index.md` frontmatter exception**: Only bundle-root `index.md` may have frontmatter (for `okf_version`). No consumer behavior specified for non-root `index.md` with frontmatter (02-okf-v02-spec.md: Limitations #6).

8. **Executor and attester as opaque pointers**: `executor.resource` and `attester.resource` are paths or URLs. Contents, invocation, interface — all deferred. The spec says "OKF fixes the interface, not the packaging" but the interface itself (receipt fields format, verdict format) is also deferred (02-okf-v02-spec.md: Limitations #7).

9. **Link graph is untyped**: All links are "directed edges of an untyped relationship." Relationship type is in prose only — fine for human reading, limiting for machine reasoning (02-okf-v02-spec.md: Limitations #9).

10. **No bundle-level metadata**: Beyond `okf_version`, no standard for bundle title, description, authorship, creation date (02-okf-v02-spec.md: Limitations #10).

11. **Log file redundancy with git**: Log entries are prose with no standardized format, no requirement to include concept IDs, and no guidance on whether git history or `log.md` is authoritative (02-okf-v02-spec.md: Limitations #11).

12. **Tag aggregation is consumption-time only**: No index-by-tag file format. Consumers must scan all frontmatter to build a tag view (02-okf-v02-spec.md: Limitations #12).

13. **No concept lifecycle state machine**: Three `status` values with no defined transitions, no rules about who can change status, no audit trail (02-okf-v02-spec.md: Limitations #13).

14. **v0.2 versioning self-contradiction**: The spec claims v0.2 is a "minor version bump" but introduces two deliberate breaking changes (`timestamp` → `generated.at`, `# Citations` → `sources`). Under its own versioning scheme, this should be a major bump. Mitigated by explicit v0.1 fallback rules, but the tension remains (02-okf-v02-spec.md: Limitations — versioning).

15. **No specified error handling for frontmatter parsing**: The spec says frontmatter must be "parseable YAML" but doesn't specify consumer behavior for unparseable YAML. The reference implementation raises an error, but the spec's conformance rules address this only for producers (02-okf-v02-spec.md: Limitations #8).

---

## 3. Reference Implementation

### 3.1 Reference Agent (knowledge-catalog/okf/src)

The reference agent (`reference_agent`) is a proof-of-concept Python CLI that produces OKF bundles by running Gemini (via Google ADK) against a BigQuery dataset and optional web documentation (03-reference-agent.md: Overview).

**Architecture — two-pass design:**

1. **BQ pass**: One LLM call per concept, using BigQuery metadata tools to generate concept `.md` files (dataset + tables with schema, queries, cross-links). Five tools: `list_concepts`, `read_concept_raw`, `sample_rows`, `read_existing_doc`, `write_concept_doc`. Prompt from `reference_instruction.md` mandates specific frontmatter (`type`, `title`, `description`, `resource`, `tags`) and body sections (prose, `# Schema`, `# Common query patterns`) (03-reference-agent.md: BQ Pass).

2. **Web pass**: A single long-running LLM session that crawls seed URLs, fetches pages, and decides to (a) enrich existing concepts, (b) mint new `references/` docs via a four-gate test, or (c) skip. The LLM drives its own crawl; the `fetch_url()` tool enforces host allow-list, path filters, depth limits, and page budget inside the tool (the LLM cannot override them) (03-reference-agent.md: Web Pass).

After both passes, `regenerate_indexes()` walks the bundle and writes auto-generated `index.md` files at each directory level, grouping entries by `type` frontmatter (03-reference-agent.md: Bundle Generation — Index regeneration).

**Source code structure:**
```
okf/src/reference_agent/
├── bundle/          # OKFDocument, paths, index, synthesizer
├── sources/          # Source ABC, BigQuerySource
├── tools/            # bundle_tools, source_tools, web_tools, context
├── prompts/          # reference_instruction.md, web_ingestion_instruction.md
├── viewer/           # Cytoscape.js visualization generator
├── web/              # URL fetcher (urllib → markdownify)
├── cli.py            # argparse: enrich + visualize subcommands
├── agent.py          # build_bq_agent(), build_web_agent()
└── runner.py         # orchestrates passes
```

(03-reference-agent.md: Source Code Structure)

**Key modules:**
- `bundle/document.py`: OKF v0.2 document model — parse/serialize YAML frontmatter, validate (`type` required), `trust_tier()`, `is_stale()`, `normalize_verified()` (03-reference-agent.md: Key module responsibilities)
- `bundle/paths.py`: Maps `tuple[str,...]` concept IDs to filesystem paths
- `bundle/index.py`: Walks bundle, groups concepts by `type`, writes `index.md`. Uses LLM `synthesizer.py` for directory descriptions when >1 child; falls back to static summary on LLM failure
- `tools/bundle_tools.py`: `write_concept_doc()` auto-fills `generated`, reorders frontmatter to canonical order, validates, enforces augmentation guards during web pass (schema shrinkage and sources shrinkage rejection for `BigQuery Table` docs)
- `tools/web_tools.py`: `fetch_url()` enforces all crawl limits inside the tool

**CLI:**
```bash
# Produce bundles
python -m reference_agent enrich --source bq --dataset <project.dataset> --out ./bundles/<name>
    [--web-seed URL] [--web-max-pages 100] [--no-web] [--concept tables/events_]

# Consume bundles
python -m reference_agent visualize --bundle ./bundles/<name> [--out viz.html]
```

(03-reference-agent.md: CLI Interface)

**Design patterns worth adopting:**
1. **Concept-aware write tool** — understands OKF format invariants, enforces augmentation guards
2. **Web crawl state as tool-enforced dataclass** — LLM cannot hallucinate around limits
3. **Canonical frontmatter key order** — `_PREFERRED_KEY_ORDER` ensures consistent diffable output
4. **Separate prompt files** — loaded as package resources, versionable independently of code
5. **Validation at write time, not read time** — `write_concept_doc()` validates before writing
6. **Idempotent writes** — `read_existing_doc()` + `write_concept_doc()` allows re-running without data loss
7. **Bundle format self-description** — viz generator reads any OKF bundle, no separate schema

(03-reference-agent.md: Design patterns worth adopting)

**What is agent-specific (not needed in a skill):**
- Google ADK dependency (`google.adk.Agent`, `Runner`, `InMemorySessionService`)
- `BigQuerySource` (only source implementation)
- Module-level globals for context (`_ctx`, `_web`)
- Inline LLM for index synthesis (skill delegates to host agent)
- SDK-specific `FunctionTool` wrapping

(03-reference-agent.md: What is different)

### 3.2 Example Bundles

Four bundles checked into the repo (03-reference-agent.md: Available bundles):

| Bundle | Dataset | Concepts | Notes |
|--------|---------|----------|-------|
| `ga4/` | `ga4_obfuscated_sample_ecommerce` | 1 dataset, 1 table family (`events_*`), 7 metric references | Sharded daily tables, e-commerce |
| `stackoverflow/` | `stackoverflow` | 1 dataset, ~10 tables, references | Independent entities, multi-concept enrichment |
| `crypto_bitcoin/` | `crypto_bitcoin` | 1 dataset, 4 tables, references | Tightly related fact tables, FK relationships |
| `acme_retail/` | Unknown | Present in bundles directory | Additional example |

**GA4 bundle structure** (idiomatic example):
```
bundles/ga4/
├── index.md
├── viz.html
├── datasets/
│   ├── index.md
│   └── ga4_obfuscated_sample_ecommerce.md
├── tables/
│   ├── index.md
│   └── events_.md
└── references/
    ├── index.md
    └── metrics/
        ├── index.md
        ├── purchasers.md
        ├── n_day_active_users.md
        ├── n_day_inactive_users.md
        ├── frequently_active_users.md
        ├── highly_active_users.md
        ├── acquired_users.md
        └── google_acquired_cohorts.md
```

(03-reference-agent.md: Bundle structure)

**Concept patterns observed** (03-reference-agent.md: Concept file examination):

- **Dataset concepts**: `type: BigQuery Dataset`, resource URI, prose description, `# Schema` (references children), `# Common query patterns` (SQL), footnotes keyed to `sources[].id`
- **Table concepts**: `type: BigQuery Table`, wildcard resource for sharded families, `# Schema` (HTML table with nested RECORD fields indented), `# Common query patterns` (fenced SQL), `# Metrics` (bullet links to references)
- **Metric references**: `type: Reference`, source page URL as `resource`, one-sentence definition, `# Common query patterns` (fenced SQL), footnote attribution

**Eight patterns across all okf.md example bundles** (01-okf-site-pages.md: Examples):
1. `type` is domain-specific — no fixed list (e.g., `Metric`, `Laravel Model`, `WordPress Post Type`, `Constraint`, `Astro Page`)
2. Cross-links are generous — concepts form a graph, not just a folder
3. `index.md` is a map, not a junk drawer
4. Extra frontmatter fields are free
5. `# Citations` at the end — external links for verification
6. Body is structured — headings, tables, code blocks over freeform prose
7. One concept per file — never mix concerns
8. `resource` field anchors to reality — `repo://`, `dashboard://`, `wp-admin:`, URLs

### 3.3 Visualizer

The `visualize` subcommand produces a self-contained HTML file with an interactive Cytoscape.js force-directed graph (03-reference-agent.md: Visualizer).

**How it works:**
1. Walks bundle, skips `index.md`, parses each `.md` file as `OKFDocument`
2. Builds `Concept` objects extracting all v0.2 signals: `status`, `trust_tier`, `stale`, `generated`, `verified`, `sources`
3. Extracts cross-links via regex, resolves relative to doc's directory
4. Builds graph — nodes with type-based color palette (BigQuery Dataset `#8b5cf6`, BigQuery Table `#3b82f6`, Reference `#10b981`), edges from cross-links
5. Embeds graph as `window.BUNDLE = <JSON>` in a single HTML file with inlined CSS/JS

**Viewer features:**
- Node styling: colored by type, size proportional to body length, stale nodes get dashed red border, deprecated nodes get 55% opacity
- Search: filters by label/id/tags substring match
- Type filter: dropdown of all types in bundle
- Layout switcher: cose (force-directed), concentric, breadthfirst, circle, grid
- Detail panel: frontmatter (type chip, title, ID, badges), description, resource link, tags, generated/verified/sources, rendered body (via marked.js), backlinks
- Internal link rewriting: links matching `/<path>.md` navigate within viewer

(03-reference-agent.md: Cytoscape.js integration)

**What it demonstrates about consumption:** The viz generator reads any OKF bundle without a separate schema — it extracts whatever frontmatter keys exist and renders accordingly. This permissive consumption model is the spec's central conformance principle in action (03-reference-agent.md: Bundle format self-description).

---

## 4. Tools and Ecosystem

### 4.1 Google-Originated Tools

| Tool | Description | Status | Source |
|------|-------------|--------|--------|
| **Reference Enrichment Agent** | Two-pass (BQ + web) Python agent producing OKF bundles from BigQuery metadata via Gemini/ADK | 🟡 Functional PoC | 03-reference-agent.md |
| **Static HTML Visualizer** | `visualize` subcommand → self-contained Cytoscape.js graph with detail panel, search, filters | 🟢 Ready | 03-reference-agent.md |
| **kcmd CLI + MCP Server** | TypeScript bidirectional sync tool between local metadata and Google Cloud Knowledge Catalog. "Git for metadata." MCP tools: pull, push, list-entries, lookup-entry, modify-entry | 🟡 Early product | 04-toolbox-and-samples.md: kcmd |
| **Google Cloud Knowledge Catalog** | GCP product (formerly Dataplex). AI-powered metadata catalog with native OKF ingestion, Gemini enrichment, semantic search, context APIs | 🟢 GA | 05-google-cloud-kc.md |
| **Data Agent Kit** | Open-source bundle of secure MCP tools, native IDE plugins, data engineering/data science skills. Connects to AlloyDB, BigQuery, Spanner, Cloud SQL, KC, Apache Spark | 🟢 Released | 05-google-cloud-kc.md: Data Agent Kit |
| **Data Cloud Agents** | Suite of first-party agents (Data Engineering, Data Science, Database Onboarding, Database Observability, Deep Research) using KC context | 🟢 Released | 05-google-cloud-kc.md: Data Cloud Agents |
| **md-fileset MCP Server** | Built-in MCP server in toolbox/enrichment providing `list_fileset_contents`, `read_fileset_file`, `search_fileset_content` over Markdown directories | 🟡 Bundled | 04-toolbox-and-samples.md: md-fileset |
| **kcagent** | TypeScript + ADK enrichment agent with dynamic MCP tool loading and skill-based instruction system | 🟡 Preview | 04-toolbox-and-samples.md: Enrichment Agent |
| **Discovery Agent** | Python + ADK search agent on Knowledge Catalog Semantic Search APIs. Uses SKILL.md system instruction pattern | 🟡 Sample | 04-toolbox-and-samples.md: Discovery Agent |

(01-okf-site-pages.md: Tools; 04-toolbox-and-samples.md; 05-google-cloud-kc.md)

Key architectural insight: The `GoogleCloudPlatform/knowledge-catalog` repository serves two distinct products — **Knowledge Catalog** (the GCP service, `toolbox/` and `samples/`) and **OKF** (the open format, `okf/`). The toolbox does NOT directly operate on OKF format; it operates on Knowledge Catalog metadata in a proprietary YAML/Markdown format. They share a philosophy but serve different scopes (04-toolbox-and-samples.md: Critical Architectural Insight).

### 4.2 Community Ecosystem (by category)

#### Producers (generate OKF bundles)

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **OpenWiki 0.2** (LangChain) | Reads codebase → OKF wiki → wires into CLAUDE.md, .cursorrules, AGENTS.md. Personal mode: local brain wiki from Git, Gmail, Notion, X/Twitter | 🟢 Production (13.2k stars) | TypeScript/Node.js, MIT | github.com/langchain-ai/openwiki |
| **superops-team/okf** | Go CLI: scans git repos → OKF bundles. Incremental via git hooks, linter (13 rules), query engine | 🟢 Released (v1.2.0) | Go, Apache 2.0 | github.com/superops-team/okf |
| **WordPress Plugin** (Suganthan) | Auto-generates OKF from WP posts/pages at `/okf/`. Watches publish/edit, rebuilds on every update | 🟢 Ready | PHP 7.4+, GPL | uploads.suganthan.com/4AECBACE-open-knowledge-format.zip |
| **Suganthan Web Converter** | URL/sitemap → crawls up to 100 pages → OKF concepts with cross-links → ZIP with visual graph | 🟡 Functional | Web tool | suganthan.com/free-seo-tools/okf-generator/ |
| **leadcraft** | Claude Code plugin writing structured deliverables (plans, ADRs) as OKF v0.1 bundle | 🟡 Early (v0.1) | Python, MIT | github.com/dskst/leadcraft |
| **pi-openwiki** | OpenWiki ported to IBM PI harness | 🟡 Fresh port (v0.1) | TypeScript, MIT | github.com/barvhaim/pi-openwiki |
| **AgentFitech** | Built OKF producer + consumer within 24 hours of spec release | 🟡 Blog post | Unknown | medium.com/@AgentFitech |
| **kb.duyet.net** | Personal knowledge base converted to strict-conformant OKF | 🟢 Live | Markdown | kb.duyet.net |
| **okfy-ai** | Convert docs → OKF bundles + serve to MCP agents | 🟡 (v0.3.3, 2.1k weekly downloads) | npm, MIT | npm: okfy-ai |
| **okfgen** | Generate + validate OKF bundles with LangChain + any model provider | 🟡 (v0.0.3) | npm, MIT | npm: okfgen |
| **@docmd/plugin-okf** | Generate OKF bundle from docmd site. Most popular OKF npm package by downloads (5.5k/week) | 🟡 (v0.8.17) | npm, MIT | npm: @docmd/plugin-okf |
| **auto-okf** | Multi-writer OKF bundles | 🟡 (v0.0.1) | npm, Apache 2.0 | npm: auto-okf |

#### Consumers (read/query/render OKF bundles)

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **Kiso** | Java CLI: `check` (validate) + `build` (static site with llms.txt + sitemap.xml). DaisyUI themes, publishing profiles, GitHub Action | 🟢 Released (v0.1.5) | Java, Apache 2.0 | github.com/oak-invest/kiso |
| **Inkeep Open Knowledge** | WYSIWYG editor + LLM wiki. macOS app + web UI. OKF starter pack. MCP + skills + agentic search | 🟡 Preview (v0.9+, 3.1k stars) | TypeScript/React, GPL-3.0 | github.com/inkeep/open-knowledge |
| **okapi-okf** | OKF Knowledge Studio: visualize, explore, audit, edit, query bundles | 🟡 (v0.2.1) | npm, MIT | npm: okapi-okf |
| **okf-viewer** | Browse OKF bundle via local CLI + Next.js viewer | 🟡 (v0.4.1) | npm, MIT | npm: okf-viewer |

#### Validators and Linters

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **okflint** | Deterministic, LLM-free Python linter. Three-tier rules (OKF Core / Profile / Hygiene), 18 documented rules, manifest profiles, Obsidian wikilink resolution, index generation | 🟢 Released (v0.3.1) | Python 3.12+, MIT | github.com/mattdav/okflint |
| **openknowledgeformat.com** | Browser-based frontmatter validator + starter templates + interactive examples. Zero install | 🟢 Ready | Web | openknowledgeformat.com |
| **okf.md /validator** | Browser validator (paste/upload ZIP). Listed as "Coming Soon" | 🟡 Not yet launched | Browser (client-side) | okf.md/validator |

#### Trust and Provenance

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **signed-okf** (DynamicFeed) | Ed25519 signatures on concept files + bundles. JWKS key distribution. Optional OriginTrail DKG anchoring | 🟡 Early (v0.2.1) | Python, Apache 2.0 | github.com/dynamicfeed/signed-okf |
| **OriginTrail DKG + OKF** | On-chain provenance via OriginTrail Decentralized Knowledge Graph. npm package `@origintrail-official/dkg-okf` (1,730 weekly downloads) | 🟡 Functional (v10.0.9) | TypeScript, Apache 2.0 | npm: @origintrail-official/dkg-okf |

#### Agent Memory and Skills

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **hermes-okf** | Filesystem-based memory for Hermes agent ecosystem. Types: Decision, Observation, Context, Plan, Session, ToolCall. Git-backed history, RAG integration, hot/cold memory | 🟡 Functional (v0.5.9, 26 stars) | Python 3.9+, MIT | github.com/EliaszDev/hermes-okf |
| **okf-skill** (rakibtg) | Single SKILL.md + Python 3 stdlib scripts (no dependencies). Teaches agents to produce/consume OKF. Installable via `npx skills add` | 🟡 Functional (v1.0) | Python, Apache 2.0 | github.com/rakibtg/okf-skill |
| **okforge** | OKF skill for Claude Code: bundle mechanics + Stop-hook (1.9k weekly downloads) | 🟡 (v1.0.12) | npm, MIT | npm: okforge |

#### MCP Servers / Integrations

| Project | Description | Maturity | Stack | Repo |
|---------|-------------|----------|-------|------|
| **@copperbox/okf-mcp** | MCP server providing OKF backend to coding agents (2.8k weekly downloads, v0.20.0) | 🟡 Active | npm, ISC | npm: @copperbox/okf-mcp |
| **caedora-mcp** | MCP server for reading/maintaining OKF bundles | 🟡 (v0.2.0) | npm, MPL-2.0 | npm: caedora-mcp |

#### Libraries and SDKs

| Project | Description | Maturity | Stack |
|---------|-------------|----------|-------|
| **@equationalapplications/core-okf** | Zero-dependency TypeScript OKF primitives: frontmatter, concepts, index/log builders (3.1k weekly downloads, v4.22.0) | 🟡 Mature | npm, MIT |
| **@turbomem/okf** | OKF parser, validator, writer for Node.js | 🟡 (v1.0.0) | npm, Apache 2.0 |
| **js-okf** | TypeScript library for creating/updating OKF bundles (819 weekly downloads) | 🟡 (v0.3.1) | npm, MIT |
| **okf-tool** | TypeScript OKF library: parse, write, search, validate | 🟡 (v0.2.0) | npm, Apache 2.0 |
| **okf-toolkit** | Parse, validate, chunk OKF bundles for RAG pipelines | 🟡 (v0.1.0) | npm, Apache 2.0 |
| **okf-toolset** | Filesystem-first OKF toolkit: embeddings, search, MCP, refiner, Git helpers | 🟡 (v0.3.0) | npm, MIT |
| **@sorane/okf** | OKF parsing, validation, serialization for sorane | 🟡 (v0.5.0) | npm, MIT |
| **@quatrain/okf** | OKF flat file storage adapter (540 weekly downloads) | 🟡 (v1.0.5) | npm, AGPL-3.0 |
| **@fastrag/okf** | Convert doc corpora → OKF bundles + graph-first Viewer Workbenches | 🟡 (v0.1.0) | npm, MIT |

#### Domain Profiles

| Project | Description | Maturity | Repo |
|---------|-------------|----------|------|
| **W3C Holon CG — DataBook** | Formal OKF profile for semantic web. Adds IRI identity, typed RDF/SPARQL/SHACL fenced blocks, push to SPARQL triplestore, SHACL validation gating | 🟡 Proposal | ontologist.substack.com |
| **knowledge-template** (Open Science) | Conformant OKF bundle scaffold for scientific knowledge. Types: dataset, dataset-gotcha, recipe, convention. CC-BY-4.0 | 🟢 Ready (v1.0) | github.com/open-science-pillars/knowledge-template |

(01-okf-site-pages.md: Tools + Ecosystem Map; 07-ecosystem-projects.md: Projects + npm/PyPI discoveries; 08-okf-site-full.md: Tools page)

### 4.3 The Existing OKF Skill

**fabricioctelles/skills/skills/okf-open-knowledge-format/** is the most mature OKF agent skill implementation (06-fabricio-skills-repo.md: OKF Skill Deep Dive).

**Structure:**
```
okf-open-knowledge-format/
├── SKILL.md              # 14.7 KB — 8-step workflow
├── references/
│   ├── spec-v01.md       # 15 KB — complete OKF v0.1 specification
│   ├── examples.md       # 6.4 KB — 3 domain-specific bundles
│   └── conversion.md     # 4.2 KB — Notion, Obsidian, CSV guides
└── scripts/
    └── validate.sh       # 3 core conformance checks, zero dependencies
```

(06-fabricio-skills-repo.md: OKF Skill Deep Dive — Structure)

**Capabilities:**

| Capability | Description |
|------------|-------------|
| Create | Generate conformant OKF bundles from scratch |
| Validate | Check 3 conformance rules, report errors and warnings (prefers okflint, falls back to validate.sh) |
| Enrich | Add schema, citations, cross-links, fill recommended fields |
| Generate | Auto-create index.md and log.md files |
| Convert | Transform Notion exports, Obsidian vaults, or CSVs into OKF |
| Serve | Push bundles to Google Cloud Knowledge Catalog via kcmd CLI/MCP |

(01-okf-site-pages.md: Skill; 06-fabricio-skills-repo.md: What it teaches agents)

**Harness support:** Claude Code / Kiro CLI (`npx skills add fabricioctelles/skills/okf-open-knowledge-format`), Cursor / Windsurf (raw URL), any agent (direct SKILL.md reference). Uses the Agent Skills standard format — YAML frontmatter + Markdown body, with `references/`, `scripts/`, `templates/` directories loaded via progressive disclosure (06-fabricio-skills-repo.md: Integration Points).

**Key integration points:**
- okflint (preferred validator over built-in bash script)
- kcmd CLI/MCP (Google Cloud Knowledge Catalog sync)
- Knowledge Catalog (enterprise serving path)
- Reference Enrichment Agent (auto-generate bundles from BigQuery)

(06-fabricio-skills-repo.md: Key integration points)

**Relationship to rakibtg/okf-skill:** Two independent OKF skills exist — fabricioctelles (more comprehensive, 14.7KB SKILL.md with full spec copy + conversion guides) and rakibtg (cleaner, Python 3 stdlib scripts, vendored SPEC.md, cheatsheet.md). The rakibtg skill is a good reference for clean progressive disclosure design (07-ecosystem-projects.md: Reference Implementations).

### 4.4 Ecosystem Gaps

| Gap | Description | Source |
|-----|-------------|--------|
| **No unified skill suite** | Existing skills are single-SKILL.md files. No one has built a multi-skill suite covering: init → author → validate → enrich → publish → maintain | 07-ecosystem-projects.md: Gaps |
| **No automatic lifecycle implementation** | OKF describes "automatic lifecycle" as a concept but no tool implements: reading context at session start, identifying updates during session, validating and committing | 07-ecosystem-projects.md: Gaps |
| **No MCP server for OKF validation** | Several MCP servers for storage/retrieval exist, none provide deterministic validation as an MCP tool | 07-ecosystem-projects.md: Gaps |
| **No incremental multi-source enrichment** | Google enrichment agent is BigQuery-only. No tool enriches from codebases, APIs, issue trackers, etc. | 07-ecosystem-projects.md: Gaps |
| **No Obsidian plugin** | Natural compatibility but no dedicated plugin for validation + templates | 01-okf-site-pages.md: Ecosystem Map — Gaps |
| **No VS Code extension** | No lint-on-save or preview pane for OKF bundles | 01-okf-site-pages.md: Ecosystem Map — Gaps |
| **No public bundle registry/gallery** | No central place to discover, share, or remix OKF bundles | 01-okf-site-pages.md: Ecosystem Map — Gaps |
| **No OKF → schema.org/JSON-LD bridge** | Semantic web interop at proposal stage only (DataBook) | 01-okf-site-pages.md: Ecosystem Map — Gaps |
| **No CI-native GitHub Action** | okflint runs in CI but no pre-packaged `okf-validate@v1` action | 07-ecosystem-projects.md: Gaps |
| **Snowflake/Databricks producer missing** | Only BigQuery producer exists | 01-okf-site-pages.md: Ecosystem Map — Gaps |
| **No official coding agent skill from Google** | OKF README + SPEC.md are readable by LLMs, but no official `.md` skill, generation-time validation, or reusable templates | 01-okf-site-pages.md: Tools — Coding Agents |
| **No Rust, .NET, or Ruby tooling** | Most tools are Python or TypeScript | 07-ecosystem-projects.md: Gaps |
| **v0.2 spec support gap** | Most tools target v0.1 only. Only the reference agent and okflint (partial) support v0.2 trust/lifecycle fields | Inferred from 07-ecosystem-projects.md tool descriptions |

### 4.5 Key Ecosystem Repositories

| Repo | Description | Stars | License |
|------|-------------|-------|---------|
| [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog) | OKF spec + reference agent + bundles + Google Knowledge Catalog toolbox | — | Apache 2.0 |
| [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) | Codebase → OKF wiki + agent instruction injection | 13.2k | MIT |
| [inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) | WYSIWYG OKF editor + LLM wiki | 3.1k | GPL-3.0 |
| [fabricioctelles/skills](https://github.com/fabricioctelles/skills) | Agent skills marketplace (OKF skill + okf.md site source) | 36 | Apache 2.0 |
| [superops-team/okf](https://github.com/superops-team/okf) | Go CLI for git-aware OKF bundle generation | 16 | Apache 2.0 |
| [oak-invest/kiso](https://github.com/oak-invest/kiso) | Java publishing engine (bundles → static sites) | 16 | Apache 2.0 |
| [mattdav/okflint](https://github.com/mattdav/okflint) | Python deterministic linter (v0.3.1) | 4 | MIT |
| [EliaszDev/hermes-okf](https://github.com/EliaszDev/hermes-okf) | Agent memory system on OKF (v0.5.9) | 26 | MIT |
| [rakibtg/okf-skill](https://github.com/rakibtg/okf-skill) | Agent skill for producing/consuming OKF | 4 | Apache 2.0 |
| [dynamicfeed/signed-okf](https://github.com/dynamicfeed/signed-okf) | Cryptographic trust layer for OKF | 2 | Apache 2.0 |
| [open-science-pillars/knowledge-template](https://github.com/open-science-pillars/knowledge-template) | OKF template for scientific knowledge | 1 | CC-BY-4.0 |
| [dskst/leadcraft](https://github.com/dskst/leadcraft) | Claude Code plugin → OKF structured deliverables | 1 | MIT |
| [barvhaim/pi-openwiki](https://github.com/barvhaim/pi-openwiki) | IBM PI port of OpenWiki | 9 | MIT |
| npm: @equationalapplications/core-okf | Zero-dep TypeScript OKF library (3.1k dls/wk) | — | MIT |
| npm: @copperbox/okf-mcp | MCP server for OKF (2.8k dls/wk) | — | ISC |
| npm: @docmd/plugin-okf | OKF bundle generator (5.5k dls/wk) | — | MIT |
| npm: okfy-ai | Docs-to-OKF + MCP (2.1k dls/wk) | — | MIT |
| npm: okforge | Claude Code skill for OKF (1.9k dls/wk) | — | MIT |
| npm: @origintrail-official/dkg-okf | OKF → DKG mapper (1.7k dls/wk) | — | Apache 2.0 |

(07-ecosystem-projects.md; 01-okf-site-pages.md; 08-okf-site-full.md; 03-reference-agent.md)

---

## 5. Knowledge Catalog ↔ OKF Relationship

**Google Cloud Knowledge Catalog** (KC, formerly Dataplex) and **Open Knowledge Format** (OKF) are sibling projects from the same team within Google Cloud's Data Analytics organization. Sam McVeety is Tech Lead on both (05-google-cloud-kc.md: Team relationship).

**KC is a product/service; OKF is an open format specification.** They are not architecturally coupled:

| Dimension | Knowledge Catalog | OKF |
|-----------|-------------------|-----|
| **Type** | Google Cloud service | Open specification + file format |
| **Storage** | GCP proprietary service | Markdown files in directories |
| **Portability** | Locked to GCP | Any filesystem, git repo, static server |
| **Trust signals** | Internal to service | First-class frontmatter: `generated`, `verified`, `status`, `stale_after`, `sources` |
| **Agent access** | MCP tools, Gemini CLI extension, REST API | Direct file reading, git clones, any tool reading Markdown |
| **Pricing** | Free tier + usage-based | Free (Apache 2.0) |

(05-google-cloud-kc.md: Summary Table)

**Does KC produce OKF?** Not directly. The OKF reference agent produces OKF from BigQuery metadata. KC stores metadata in its own service, not as OKF bundles. However, the OKF README explicitly lists Dataplex/KC as a source that *could* export to OKF (05-google-cloud-kc.md: Does KC produce OKF?).

**Does KC consume OKF?** Yes. "A Knowledge Catalog demo shows a bundle round-tripping through Google Cloud's Knowledge Catalog: clean OKF on disk, trust and provenance signals preserved through the catalog and back" (05-google-cloud-kc.md: Does KC consume OKF?).

**Is OKF independent of KC?** Yes, by design. The OKF README states: "OKF is a universal, vendor-neutral format ... not tied to any particular agent, framework, model provider, or serving system." It explicitly mentions Unity Catalog and Collibra as alternative export sources. OKF bundles work on any filesystem (05-google-cloud-kc.md: Is OKF independent?).

**The repo relationship:** The OKF spec, reference agent, and sample bundles live inside `GoogleCloudPlatform/knowledge-catalog` at `okf/`. This co-location is practical (same team) but not architectural coupling — the OKF spec itself (SPEC.md) does not mention Knowledge Catalog, Dataplex, or any Google service by name (05-google-cloud-kc.md: What the OKF spec says about KC).

**The toolbox does NOT operate on OKF format.** `toolbox/mdcode/` (kcmd) and `toolbox/enrichment/` (kcagent) operate on Knowledge Catalog metadata in a proprietary YAML/Markdown format oriented toward Dataplex entries (04-toolbox-and-samples.md: How Toolbox Relates to OKF).

**MCP tool paths to KC:**
1. Pre-built `dataplex` tool in `googleapis/mcp-toolbox` (Go) — `search_entries`, `lookup_entry`, `search_aspect_types`, `lookup_context`
2. Gemini CLI Extension (`gemini-cli-extensions/knowledge-catalog`)
3. Claude Code plugin: `knowledge-catalog@claude-plugins-official`
4. Remote MCP server (general KC) + data lineage remote MCP server
5. Data Agent Kit (bundles MCP Toolbox + IDE plugins + skills)

(05-google-cloud-kc.md: MCP Toolbox / Agent Integrations)

**None of the Data Cloud Agents documentation mentions OKF.** They consume context from KC's service API, not from OKF bundles. OKF bundles can round-trip through KC, but this is an interop path, not a dependency (05-google-cloud-kc.md: OKF relevance).

---

## 6. Implications for a Cross-Harness OKF Skill Suite

### 6.1 What to Implement

Based on the v0.2 spec requirements and ecosystem analysis, a comprehensive skill suite should implement:

**Core conformance (v0.1 baseline, still valid):**
- Frontmatter validation: Every non-reserved `.md` has parseable YAML with non-empty `type`
- Reserved file validation: `index.md` and `log.md` follow defined structure
- Permissive consumer: never reject for missing optional fields, unknown types, unknown keys, broken links

**v0.2 trust signals:**
- `verified` normalization: bare mapping → one-element list
- Trust tier derivation: `unverified` / `machine-confirmed` / `human-reviewed` from `verified[].by` prefixes
- `generated` and fallback to legacy `timestamp`
- `stale_after` staleness check: `today >= stale_after`
- `status` lifecycle: `draft` / `stable` / `deprecated`
- Sources with credibility signals: `sources[].resource`, `id`, `author`, `usage_count`, `last_modified`
- `usage_window` date range parsing
- Per-claim attribution resolution: footnotes `[^id]` → `sources[].id`
- Legacy `# Citations` body list parsing (v0.1 fallback)

**Attested Computations:**
- Validate `type: Attested Computation` has `runtime`, `parameters` (each with `name`, `type`, `required`)
- Validate `computation` path exists (when file-based)
- Validate `executor.resource` and `attester.resource` paths
- Surface failed attestations (SHOULD per spec)

**Index and log management:**
- Auto-generate `index.md`: group concepts by `type`, synthesize directory descriptions
- Auto-generate `log.md`: date-grouped entries in `YYYY-MM-DD` format
- Generate `okf_version` declaration in root `index.md`
- Incremental index updates (don't regenerate all on every change)

**Multi-harness support:**
- SKILL.md entry point for each harness (Claude Code, opencode, Cursor, Windsurf, Gemini CLI, Pi)
- Shared reference files (spec copy, examples, conversion guides)
- Harness-agnostic validation scripts (Python 3 stdlib, like rakibtg/okf-skill)
- MCP server for validation (wrap okflint or custom validator)

**Lifecycle management:**
- Read relevant OKF context at session start (progressive disclosure via `index.md`)
- Identify updates during session (concepts changed, new concepts needed)
- Validate changes before committing (okflint or built-in)
- Update `generated.at` and `log.md` on write
- Mark stale concepts (compare `stale_after` vs today)

### 6.2 What Patterns to Adopt

**From the reference agent (03-reference-agent.md):**
1. **Concept-aware write tool** — understand OKF format invariants, enforce augmentation guards
2. **Canonical frontmatter key order** — consistent output for git diffability
3. **Validation at write time, not read time** — catch missing required keys early
4. **Idempotent writes** — `read_existing_doc()` + `write_concept_doc()` pattern
5. **Separate prompt files** — versionable independently of skill code
6. **Tool-enforced limits** — crawl budget, host allow-list, augmentation guards in tools, not in prompts

**From fabricioctelles skill (06-fabricio-skills-repo.md):**
1. **Progressive disclosure** — SKILL.md as entry, `references/` loaded on demand
2. **Dual validator fallback** — prefer okflint, fall back to built-in bash script
3. **Conversion guides as reference material** — Notion, Obsidian, CSV conversion patterns
4. **Knowledge Catalog integration** — kcmd CLI/MCP workflow documentation
5. **Multi-harness installation instructions** — npx, git clone, raw URL, settings.json

**From okflint (07-ecosystem-projects.md — okflint):**
1. **Three-tier rule system** — Core (errors, exit 1), Profile (team-specific rules), Hygiene (warnings, exit 0)
2. **Manifest profiles** — `okf-base.yaml` for declaring required fields, status vocabularies, custom types
3. **`audit` vs `validate`** — descriptive (always exit 0) vs normative (exit 1 on failure)
4. **JSON output** — structured output for CI pipeline parsing

**From hermes-okf (07-ecosystem-projects.md — hermes-okf):**
1. **Type system for agent concepts** — Decision, Observation, Context, Plan, Session, ToolCall
2. **Decorator pattern** — `@memorize_decision`, `@memorize_tool` for automatic recording
3. **Git-backed history** — `GitOKFBundle` with auto-commit, diff, revert
4. **Hot/cold memory model** — recent context in hot buffer, older context on disk

**From the ecosystem generally (01-okf-site-pages.md: Examples):**
1. **One concept per file** — never mix concerns
2. **Cross-links are generous** — bundles are graphs, not just folders
3. **`resource` field anchors to reality** — `repo://`, `dashboard://`, URLs, whatever references the actual thing
4. **Structural body > freeform prose** — headings, tables, code blocks for better agent retrieval
5. **`# Citations` at end of concepts** — external links for verification
6. **`index.md` is a map, not a junk drawer**

### 6.3 What Design Decisions Remain

**From underspecified areas (02-okf-v02-spec.md: Limitations):**

1. **`sources[].resource` scope descriptors**: How to represent population/scope descriptors vs URLs? A skill suite must decide whether to validate these differently or treat them uniformly.

2. **`usage_window` date format**: The spec shows `YYYY-MM-DD` but doesn't mandate it. A skill must choose a format and validate accordingly.

3. **`parameters[].type` vocabulary**: For Attested Computations, define a minimum set of types (`integer`, `string`, `float`, `boolean`, `date`) and validate against it, while tolerating unknown types per the permissive consumer rule.

4. **Lifecycle state interactions**: When `status: deprecated` and `stale_after` is in the future — surface both signals, treat `deprecated` as the stronger one (but flag the contradiction).

5. **Non-root `index.md` with frontmatter**: Surface as a warning (not error), per spirit of permissive conformance.

6. **Log file vs git history**: Skill should maintain `log.md` for portability (bundles without VCS) but recommend git for primary history. When both exist, `log.md` is a curated summary; git is the full audit trail.

7. **Tag aggregation**: Since the spec leaves tag views to consumption-time synthesis, a skill should include a tag index generator (scan all frontmatter, produce tag → concept mapping).

**From ecosystem gaps (07-ecosystem-projects.md: Gaps):**

8. **Multi-harness skill format**: Different harnesses have different skill formats (SKILL.md for Claude/openCode, instruction strings for Cursor/Windsurf, extension packages for Gemini CLI/Pi). The suite should maintain a canonical SKILL.md and generate harness-specific wrappers.

9. **Cross-bundle references**: The spec doesn't address multi-bundle operations. A skill must decide: treat cross-bundle links as validated references to a known bundle registry path, or leave them as broken links (tolerated per spec).

10. **Automatic lifecycle triggers**: Should the skill proactively check `stale_after` on session start and flag stale concepts? Or only when explicitly asked? Proactive checking is more useful but adds session overhead for large bundles.

11. **Validation gating**: okflint is the gold standard validator. Should the skill always require okflint (adding a Python dependency) or maintain a built-in lightweight validator as fallback? The fabricioctelles approach (prefer okflint, fall back to bash) is pragmatic.

12. **v0.1 vs v0.2 target**: Most ecosystem tools target v0.1. A skill suite targeting v0.2 gains trust/lifecycle/provenance signals but may be incompatible with v0.1-only consumers. Recommendation: produce v0.2 documents; include v0.1 fallback fields (`timestamp`, `# Citations`) for backward compatibility; declare `okf_version: "0.2"` in root `index.md`.

13. **MCP server scope**: Several MCP servers exist for OKF storage/retrieval. A validation MCP server (wrapping okflint) fills a clear gap. Should the MCP server also provide index generation, lifecycle management, and enrichment? This creates a tension between a focused validation tool and a comprehensive OKF management server.

14. **Skill composition vs monolithic skill**: The ecosystem has single-SKILL.md skills. A multi-skill suite covering init/author/validate/enrich/publish/maintain could be composed as separate skills (each with its own SKILL.md) with a coordinator. This follows the SoC principle and allows harnesses to load only what's needed.

15. **Integration with existing tooling**: Should the skill integrate with kcmd/Knowledge Catalog (GCP-dependent), or remain vendor-neutral? Recommendation: vendor-neutral by default, with optional integration instructions for GCP users.

---

## 7. References

### Specification Sources
- [OKF v0.2 SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) — Authoritative specification (02-okf-v02-spec.md)
- [okf.md — Annotated Spec v0.1](https://okf.md/spec/) — Annotated guide with developer commentary (08-okf-site-full.md)
- [OKF README](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) — Project documentation (02-okf-v02-spec.md)

### Reference Implementation
- [Reference Agent source](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/src) — Python producer + visualizer (03-reference-agent.md)
- [Reference Agent tests](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/tests) — pytest suite (03-reference-agent.md)
- [Example bundles (GA4, Stack Overflow, Bitcoin, Acme Retail)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles) — Generated samples (03-reference-agent.md)

### Google Cloud Knowledge Catalog
- [Knowledge Catalog product page](https://cloud.google.com/products/knowledge-catalog) — GCP service (05-google-cloud-kc.md)
- [KC announcement blog (April 22, 2026)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — Product launch (05-google-cloud-kc.md)
- [kcmd / Metadata as Code](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode) — CLI + MCP server (04-toolbox-and-samples.md)
- [Toolbox enrichment agent](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/enrichment) — kcagent (04-toolbox-and-samples.md)
- [Data Agent Kit](https://github.com/GoogleCloudPlatform/data-agent-kit) — MCP tools + IDE plugins (05-google-cloud-kc.md)
- [MCP Toolbox](https://github.com/googleapis/mcp-toolbox) — Pre-built MCP tools for GCP services (05-google-cloud-kc.md)
- [Gemini CLI Knowledge Catalog extension](https://github.com/gemini-cli-extensions/knowledge-catalog) — Native Gemini CLI integration (05-google-cloud-kc.md)

### OKF Website (okf.md)
- [okf.md Homepage](https://okf.md/) — Landing page (08-okf-site-full.md)
- [okf.md Quickstart](https://okf.md/quickstart/) — Tutorial (01-okf-site-pages.md)
- [okf.md Examples](https://okf.md/examples/) — 8 production-ready bundles (01-okf-site-pages.md)
- [okf.md Tools](https://okf.md/tools/) — Ecosystem inventory (01-okf-site-pages.md)
- [okf.md Ecosystem Map](https://okf.md/ecosystem-map/) — Visual map + timeline (01-okf-site-pages.md)
- [okf.md FAQ](https://okf.md/faq/) — 22 questions (01-okf-site-pages.md)
- [okf.md Validator](https://okf.md/validator/) — Browser validator (01-okf-site-pages.md)
- [okf.md Skill](https://okf.md/skill/) — Skill installation (01-okf-site-pages.md)
- [okf.md Terms](https://okf.md/terms/) — MIT license, Brazilian law (08-okf-site-full.md)
- [okf.md Privacy](https://okf.md/privacy/) — Plausible + GA4 (08-okf-site-full.md)
- [okf.md GitHub (fabricioctelles/skills)](https://github.com/fabricioctelles/skills) — Site source + skill repo (08-okf-site-full.md)

### Community Tools
- [superops-team/okf CLI](https://github.com/superops-team/okf) — Go CLI, git-aware bundle generator (07-ecosystem-projects.md)
- [okflint — mattdav/okflint](https://github.com/mattdav/okflint) — Python deterministic linter, PyPI (07-ecosystem-projects.md)
- [okflint docs](https://mattdav.github.io/okflint/) — API documentation (01-okf-site-pages.md)
- [okflint on PyPI](https://pypi.org/project/okflint/) — Package (07-ecosystem-projects.md)
- [Kiso — oak-invest/kiso](https://github.com/oak-invest/kiso) — Java publishing engine (07-ecosystem-projects.md)
- [Kiso website](https://oak-invest.github.io/kiso/) — Documentation (01-okf-site-pages.md)
- [LangChain OpenWiki](https://github.com/langchain-ai/openwiki) — Codebase → OKF wiki (07-ecosystem-projects.md)
- [LangChain OpenWiki 0.2 announcement](https://www.langchain.com/blog/openwiki-0-2-adds-okf-support) — OKF support blog (01-okf-site-pages.md)
- [signed-okf — dynamicfeed/signed-okf](https://github.com/dynamicfeed/signed-okf) — Cryptographic trust layer (07-ecosystem-projects.md)
- [hermes-okf — EliaszDev/hermes-okf](https://github.com/EliaszDev/hermes-okf) — Agent memory system (07-ecosystem-projects.md)
- [hermes-okf on PyPI](https://pypi.org/project/hermes-okf/) — Package (07-ecosystem-projects.md)
- [Inkeep Open Knowledge](https://github.com/inkeep/open-knowledge) — WYSIWYG editor (07-ecosystem-projects.md)
- [knowledge-template — open-science-pillars](https://github.com/open-science-pillars/knowledge-template) — Science template (07-ecosystem-projects.md)
- [rakibtg/okf-skill](https://github.com/rakibtg/okf-skill) — Agent skill (07-ecosystem-projects.md)
- [leadcraft — dskst/leadcraft](https://github.com/dskst/leadcraft) — Planning plugin (07-ecosystem-projects.md)
- [pi-openwiki — barvhaim/pi-openwiki](https://github.com/barvhaim/pi-openwiki) — IBM PI port (07-ecosystem-projects.md)
- [openknowledgeformat.com](https://openknowledgeformat.com/) — Browser validator (07-ecosystem-projects.md)
- [Suganthan Web Converter](https://suganthan.com/free-seo-tools/okf-generator/) — Website → OKF (07-ecosystem-projects.md)
- [Suganthan WordPress Plugin](https://suganthan.com/blog/open-knowledge-format/) — WP OKF export (07-ecosystem-projects.md)

### Articles and Coverage
- [Google Cloud OKF announcement (June 12, 2026)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — Official launch (01-okf-site-pages.md)
- [Karpathy LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Predecessor pattern (01-okf-site-pages.md)
- [AgentFitech — "Shipped in a Day"](https://medium.com/@AgentFitech/google-just-standardized-how-ai-agents-read-the-web-heres-how-we-shipped-it-in-a-day-6bbfd3024320) — 24-hour implementation (01-okf-site-pages.md)
- [kb.duyet.net OKF conversion](https://kb.duyet.net/m/tech-okf-open-knowledge-format) — Personal KB → OKF (01-okf-site-pages.md)
- [W3C Holon CG / DataBook Profile](https://ontologist.substack.com/p/the-format-convergence) — Semantic web profile proposal (01-okf-site-pages.md)
- [OriginTrail DKG + OKF](https://blog.prototypr.io/googles-okf-comes-to-the-origintrail-dkg-a-memory-ai-agents-can-trust-43c6d87e1de8) — On-chain provenance (07-ecosystem-projects.md)

### Standards and Specifications
- [Agent Skills specification](https://agentskills.io) — Skill format standard (08-okf-site-full.md)
- [auth.md protocol](https://auth-md.com) — Agent authentication (08-okf-site-full.md)
- [DESIGN.md specification](https://github.com/google-labs-code/design.md) — Design doc format (08-okf-site-full.md)

### npm Packages (significant)
- [@equationalapplications/core-okf](https://www.npmjs.com/package/@equationalapplications/core-okf) — TypeScript OKF primitives (07-ecosystem-projects.md)
- [@copperbox/okf-mcp](https://www.npmjs.com/package/@copperbox/okf-mcp) — MCP server for OKF (07-ecosystem-projects.md)
- [@docmd/plugin-okf](https://www.npmjs.com/package/@docmd/plugin-okf) — OKF bundle generator (07-ecosystem-projects.md)
- [okforge](https://www.npmjs.com/package/okforge) — Claude Code skill (07-ecosystem-projects.md)
- [okfy-ai](https://www.npmjs.com/package/okfy-ai) — Docs-to-OKF + MCP (07-ecosystem-projects.md)
- [@origintrail-official/dkg-okf](https://www.npmjs.com/package/@origintrail-official/dkg-okf) — OKF → DKG mapper (07-ecosystem-projects.md)

---

*Report compiled from 8 primary-source research files (01–08) dated July 25, 2026. All claims cite their originating research file. The OKF ecosystem was approximately 6 weeks old at time of research.*
