# OKF v0.2 Specification — Deep Analysis

## Version and Status

- **Version**: 0.2
- **Release date**: 2026-07-24. The v0.2 migration commit
  [`780fe9d`](https://github.com/GoogleCloudPlatform/knowledge-catalog/commit/780fe9d30b)
  and the official Google Cloud announcement were both published on July 24,
  2026. Dates inside examples are example data, not publication metadata.
- **Primary specification**:
  [`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- **Primary announcement**:
  [Google Cloud, “Open Knowledge format v0.2 tackles agentic trust”](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/)
- **License**: Apache 2.0
- **Stability**: Pre-1.0 (`<major>.<minor>` scheme). Breaking changes are reserved for a major version bump (1.0), but as a 0.x spec, the format is still evolving. The spec says v0.2 is a "minor version bump under §12" from v0.1, though it contains two deliberate breaking changes.
- **Reference implementation**: `reference-agent` Python package (v0.1.0), a proof-of-concept producer that generates OKF bundles from BigQuery metadata plus web crawls. Also includes a `visualize` subcommand that renders bundles as interactive Cytoscape.js HTML graphs.

## Purpose and Goals

**Stated purpose** (from §1): OKF is "an open, human- and agent-friendly format for representing *knowledge*: the metadata, context, and curated insight that surrounds data and systems."

The format is explicitly designed for a world where "a knowledge corpus is ... continuously written and maintained by agents." The five questions OKF v0.2 makes first-class:

1. What was this created from, and how was it verified? (**provenance**)
2. How much should I trust it? (**trust**)
3. Is it still true? (**freshness**)
4. Is it the current version? (**lifecycle**)
5. Was this number produced the way we said it must be? (**attestation**)

**Explicit goals** (§1):

1. Define a universal format that producers (people, agents, export pipelines) can write into.
2. Inform how consumers (agents, UIs, search indexes, deterministic code) should read and traverse it.
3. Facilitate exchange of knowledge across systems and organizations.
4. Standardize the small set of frontmatter fields that make an agent-maintained corpus trustable, without prescribing any runtime.

**Explicit non-goals** (§1):

- Defining a fixed taxonomy of concept types.
- Prescribing storage, serving, or query infrastructure.
- Replacing domain-specific schemas (Avro, Protobuf, OpenAPI). OKF *references* them; it does not subsume them.
- Specifying a packaging or invocation standard for executor/attester code. OKF fixes the interface, not the packaging.

## Design Principles

The spec is built around explicit, restated design principles:

| Principle | How it manifests |
|-----------|-----------------|
| **Minimality** | One required field (`type`). No schema registry. No mandatory tooling. "If you can `cat` a file, you can read OKF." |
| **Human- and agent-readable** | Plain markdown files with YAML frontmatter. No SDK or query language required. |
| **Diffable in version control** | Plain text files in a directory hierarchy. Git-native workflows for PRs, blame, review. |
| **Portable across tools, organizations, and time** | A bundle is a directory. Ship as tarball, host in repo, mount from filesystem. No proprietary API. |
| **Minimally opinionated, freely extensible** | Unknown frontmatter keys are tolerated. Unknown `type` values are treated as generic concepts. Producers can extend freely. |
| **Progressive disclosure** | `index.md` files let consumers navigate one level at a time instead of loading the entire bundle. |
| **Graph-shaped, not just tree-shaped** | Markdown links between concepts express relationships richer than parent/child hierarchy. |
| **Trust is derived, not stored** | Trust tiers derived from `verified` field. Credibility inferred from signals on `sources`, not stored as a score. Scores are "subjective, unportable, and go stale." |
| **Structural markdown preferred** | Headings, lists, tables, fenced code blocks over freeform prose — aids both human reading and agent retrieval. |
| **Compatibility by design** | Legacy `timestamp` and `# Citations` body list are tolerated as fallbacks for v0.1 documents (§13.1). |
| **Composes with existing tooling** | Bundle works with Notion, Obsidian, MkDocs, Hugo, Jekyll — anything that reads markdown + YAML frontmatter. |

The spec explicitly says the format is "intentionally minimal" and that OKF standardizes only "the small set of structural conventions needed to make a knowledge corpus self-describing — anything beyond that is left to the producer."

## Data Model / Terminology

### Core entities from §2

| Term | Definition | Normative status |
|------|-----------|-----------------|
| **Knowledge Bundle (bundle)** | A self-contained, hierarchical collection of knowledge documents. The unit of distribution. | Core |
| **Concept** | A single unit of knowledge within a bundle, represented as one markdown document. May describe a tangible asset, an abstract idea, or anything in between. | Core |
| **Concept ID** | The path of the concept's file within the bundle, with the `.md` suffix removed. | Core |
| **Frontmatter** | A YAML metadata block delimited by `---` at the top of a markdown file. | Core |
| **Body** | Everything in the file after the frontmatter. | Core |
| **Link** | A standard markdown link from one concept to another, expressing relationships beyond the implicit parent/child hierarchy. | Core |

### Provenance family (§5.1)

| Term | Definition |
|------|-----------|
| **Source** | A material a concept derives from, external or internal to the bundle, recorded in the `sources` frontmatter field. |
| **Provenance** | The set of sources a concept derives from. |
| **Credibility signal** | An objective, per-source fact (`author`, `usage_count`, `last_modified`) used to infer trust; OKF records the signals, not a verdict. |

### Trust family (§5.2–5.3)

| Term | Definition |
|------|-----------|
| **Actor** | A string identifying who or what performed an action, using the convention `<producer>/<version>` for agents, `human:<id>` for people, and `process:<id>` for automated processes (§7). |
| **Trust tier** | A level derived from a concept's `verified` field: unverified, machine-confirmed, or human-reviewed (§5.3). |

### Computation family (§10)

| Term | Definition |
|------|-----------|
| **Attested Computation** | A concept (`type: Attested Computation`) carrying a sanctioned way to compute a value, so a consumer can confirm the value was produced by running it. |
| **Executor** | Run instructions or code that executes a computation and returns a receipt (§10.2). |
| **Receipt** | The evidence a run returns, shaped by `executor.receipt`; a runtime artifact, not stored in the bundle. |
| **Attester** | Deterministic (no-LLM) code that inspects a receipt and returns a verdict (§10.2). |

**Design note**: The terminology carefully avoids over-engineering. The vocabulary is precise but not exhaustive — it names what is necessary for the spec to be self-consistent, leaving domain-specific taxonomies to producers.

## Bundle Structure

### Directory layout (§3)

```
path/to/bundle/
  index.md                      # Optional. Directory listing.
  log.md                        # Optional. Chronological history.
  <concept>.md                  # A concept at the bundle root.
  <subdirectory>/               # Subdirectories organize concepts.
    index.md
    <concept>.md
    <subdirectory>/
      ...
```

**Key rules**:
- The directory structure is independent of the domain. Producers organize concepts however makes sense.
- A bundle MAY be distributed as: a git repository (recommended), a tarball/zip, or a subdirectory within a larger repository.
- Nesting depth is not constrained.

### Reserved filenames (§3.1) — NORMATIVE

| Filename | Purpose | Constraint |
|----------|---------|-----------|
| `index.md` | Directory listing (§8) | **MUST NOT** be used for concept documents |
| `log.md` | Update history (§9) | **MUST NOT** be used for concept documents |

All other `.md` files are concept documents.

**Notable omission**: There is no reserved filename for tag aggregation. The spec says "Tags remain a first-class concept through the `tags` frontmatter field. OKF does not specify a separate file format for aggregating documents by tag; a consumer that wants a tag-browsing view can synthesize one at consumption time by scanning frontmatter." This is a conscious design choice — tags are metadata, not a structural concern.

### The `references/` convention (§6.3)

`references/` is a **naming convention, not a requirement**. It conventionally mirrors external material, run instructions, or code as first-class concepts within the bundle. Sources, executors, and attesters commonly point into it (e.g., `references/attesters/revenue.py`).

## Concept Documents

### Structure (§4)

Every concept is a UTF-8 markdown file with:
1. A **YAML frontmatter block** delimited by `---` on its own line at beginning and end.
2. A **markdown body** with free-form content.

### Frontmatter fields (§4.1)

**REQUIRED (NORMATIVE)**:

- `type`: A short string identifying the kind of concept. **This is the only always-required key.** A concept carrying just `type` is fully conformant (§11).

  Example values: `BigQuery Table`, `BigQuery Dataset`, `API Endpoint`, `Metric`, `Playbook`, `Reference`, `Attested Computation`.
  
  **NORMATIVE rule for consumers**: MUST tolerate unknown types gracefully, typically by treating them as generic concepts.
  
  **RECOMMENDED for producers**: Pick values that are descriptive and self-explanatory.

**RECOMMENDED (editorial)**:

| Field | Purpose | Consumer behavior |
|-------|---------|-------------------|
| `title` | Human-readable display name | MAY derive from filename if omitted |
| `description` | Single sentence summary | Used by index generators, search snippets, previews |
| `resource` | Canonical URI for underlying asset | Absent for abstract concepts (no physical resource) |
| `tags` | YAML list of short strings | Cross-cutting categorization |

**Optional families** (provenance, trust, lifecycle, computation — detailed in §5 and §10).

**Extensions**: Producers MAY include any additional keys. Consumers SHOULD preserve unknown keys when round-tripping and MUST NOT reject documents with unrecognized fields.

### Body conventions (§4.2)

The body is standard markdown. **RECOMMENDED**: favor structural markdown (headings, lists, tables, fenced code blocks) over freeform prose.

No body sections are required. The following headings have **conventional** (non-normative) meaning:

| Heading | Purpose |
|---------|---------|
| `# Schema` | Structured description of an asset's columns/fields |
| `# Examples` | Concrete usage examples, often as fenced code blocks |
| `# Computation` | The sanctioned computation of an Attested Computation (§10) |

**Per-claim attribution** uses markdown footnotes keyed to `sources[].id` values (§5.1), not a body citations list. The footnote label is the stable `id` join key, making attribution survive list reordering (a deliberate design choice motivated by agent-driven rewrites).

### Reference implementation behavior

The `OKFDocument` class (from `document.py`):
- Parses frontmatter by splitting on `---` delimiters, parsing YAML between them.
- Validates that `type` is present and non-empty.
- `normalize_verified()` converts bare `{by, at}` mappings to one-element lists as required by §5.2.
- `trust_tier()` derives `unverified` / `machine-confirmed` / `human-reviewed` by checking the `human:` prefix on `verified[].by`.
- `is_stale()` compares `date.today() >= stale_after`.
- Serializes with `yaml.safe_dump(sort_keys=False)` to preserve field order.

## Cross-linking (§6)

### Link forms

| Form | Syntax | Interpretation | Recommendation |
|------|--------|---------------|----------------|
| Absolute (bundle-relative) | `[label](/path/to/concept.md)` | Relative to bundle root | **Recommended** — stable when documents are moved within subdirectories |
| Relative | `[label](./neighbor.md)` | Standard markdown relative path | Supported |

### Key semantics and rules

**NORMATIVE**: Consumers MUST tolerate broken links. A link whose target does not exist in the bundle is not malformed; it may represent not-yet-written knowledge.

**Editorial**: A link from concept A to concept B asserts a *relationship*. The specific kind (parent/child, references, joins-with, depends-on) is conveyed by the surrounding prose, not by the link itself. Consumers that build a graph view typically treat all links as directed edges of an untyped relationship.

### Path-valued fields (§6.2)

Fields like `resource`, `sources[].resource`, `computation`, `executor.resource`, `attester.resource` accept:
- An absolute URL (`https://...`)
- A bundle-relative path beginning with `/`
- A relative path (`../computations/revenue.md`)

**Exception**: `sources[].resource` may instead be a population or scope descriptor (§5.1), which is NOT a path (e.g., "all queries in BigQuery project X"). The spec does not define a format for scope descriptors.

## Index Files (§8)

### Format

`index.md` files MAY appear in any directory. They contain **no frontmatter**, with one exception: a bundle-root `index.md` MAY carry an `okf_version` key (§12).

Body structure — one or more sections grouping concepts under headings:

```markdown
# Section / Group Heading
* [Title 1](relative-url-1) - short description of item 1
* [Title 2](relative-url-2) - short description of item 2
```

**Editorial**: Entries SHOULD include the description from the linked concept's frontmatter. Producers MAY generate `index.md` automatically; consumers MAY synthesize one on the fly when none is present.

### Reference implementation behavior (index.py)

- Groups entries by `type` frontmatter field, with "Other" as fallback for missing types.
- Groups directories under a "Subdirectories" heading.
- Links to `subdir/index.md` for subdirectories.
- For a directory with a single child that has a description, reuses that description directly (no LLM synthesis).
- For directories with multiple children, uses an LLM-synthesized description (callable hook, default `synthesize_description`).

## Log Files (§9)

### Format

A flat list of date-grouped entries, newest first:

```markdown
# Directory Update Log

## 2026-05-22
* **Update**: Added ...
* **Creation**: Established ...

## 2026-05-15
* **Initialization**: Created ...
```

**NORMATIVE**: Date headings MUST use ISO 8601 `YYYY-MM-DD` form.

**Editorial**: Log entries are prose. The leading bold word (`**Update**`, `**Creation**`) is a convention, not a requirement.

## Provenance, Trust, and Lifecycle (§5)

### Sources (§5.1)

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

| Field | Status | Description |
|-------|--------|-------------|
| `resource` | **REQUIRED** within each entry | Names a concrete artifact (URL, bundle-relative path, or path into `references/`) OR a population/scope descriptor |
| `id` | Optional | Stable key for per-claim attribution via markdown footnotes. **SHOULD** be present when the body cites the source. |
| `title` | Optional | Human-readable label |
| `author` | Optional (credibility signal) | Who/what produced the source, in actor convention (§7). An authority signal. |
| `usage_count` | Optional (credibility signal) | How often `resource` was exercised over `usage_window`. A liveness signal. |
| `last_modified` | Optional (credibility signal) | When the source last changed (`YYYY-MM-DD`). A recency signal. |
| `usage_window` | Optional sibling of `sources` | A `{from, to}` date range framing every `usage_count`. A single entry MAY carry its own `usage_window` to override the shared one. |

**Key design decision**: Deeper lineage (explicit external `derived_from`, data lineage) is explicitly out of scope for v0.2. Lineage between OKF concepts is expressed through links, not a dedicated field — when a `resource` points to another OKF concept, the derivation edge already exists in the bundle graph.

**Important caveat on `usage_count`**: The spec acknowledges this is a "coarse signal" — "comparable at the alive-versus-dead and order-of-magnitude level, and against a source's own history over time, but not as a precise cross-kind ranking." Consumers SHOULD read it as liveness and trend, not as a score.

**Per-claim attribution mechanism**: Markdown footnotes with labels matching `sources[].id`, e.g. `[^ga4-schema]`. The footnote label is the stable join key. The spec explicitly notes this design choice: "positional index misattributes silently the moment the list is reordered, whereas a stable `id` survives reordering."

### Generated and Verified (§5.2)

```yaml
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
```

- `generated.by`: **REQUIRED within `generated`.** An actor (§7).
- `generated.at`: ISO 8601 datetime marking the content's last meaningful change.

```yaml
verified:
  - { by: human:ahormati, at: 2026-06-25T09:00:00Z }
  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }
```

- `verified`: A list of verification events, each with `by` (actor) and `at` (ISO 8601 datetime).
- **NORMATIVE**: A single verifier MAY be written as one `{by, at}` mapping without the list dash. Consumers MUST treat a bare mapping as a one-element list.
- `verified` is independent of `generated.at`: content can change without re-confirmation, and facts can be re-confirmed without regeneration.

### Trust tiers (§5.3) — NORMATIVE

Consumers derive trust tier from `verified`, lowest to highest:

| Condition | Trust tier |
|-----------|-----------|
| No `verified` key | **unverified** |
| `verified` by non-`human:` actors only | **machine-confirmed** |
| `verified` by a `human:<id>` actor | **human-reviewed** |

**NORMATIVE**: A concept with no trust frontmatter is still consumable; consumers MUST NOT reject it. Trust tiers are advisory signals, not access control.

### Lifecycle (§5.4–5.5)

```yaml
status: stable        # draft | stable | deprecated
```

| Value | Meaning |
|-------|---------|
| `draft` | Not yet reviewed; possibly incomplete |
| `stable` | Default (absent `status` ⇒ `stable`); ready for consumption |
| `deprecated` | Kept for links and history; no longer current |

```yaml
stale_after: 2026-09-23   # absolute date
```

- Optional. An absolute date (`YYYY-MM-DD`).
- **NORMATIVE**: A concept is stale when `today >= stale_after`.
- Design rationale: Absolute date, not relative TTL — "keeps the staleness decision a plain date comparison with no reference to when the concept was read."

## Actor Convention (§7)

Fields that record an identity (`generated.by`, `verified[].by`) use:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `<producer>/<version>` | Agents and tools | `reference_agent/gemini-2.5-pro` |
| `human:<id>` | A person | `human:ahormati` |
| `process:<id>` | Automated process | `process:finance-nightly` |

**NORMATIVE**: Consumers that classify trust (§5.3) key off the `human:` prefix, so producers MUST use it for hand-authored or human-confirmed content.

## Attested Computations (§10)

### Design rationale

An Attested Computation concept carries not just what a value *means* but a sanctioned way to *compute* it. Provenance answers "where did this claim come from"; attestation answers "was this number produced the way we said it must be." OKF records the computation and the means to check it; it does not execute anything itself.

### Why standalone concepts (§10.1)

Three motivations:
1. **`runtime` defines what `parameters` mean** — a parameter is a SQL bind variable, a dbt var, or a Python argument depending on `runtime`. Co-locating `runtime` and `parameters` makes binding semantics self-evident.
2. **One computation, many consumers** — same computation can back a metric, a dashboard, and a report.
3. **Trust state is per computation** — revenue, profit, and margin each verify and attest independently.

### Contract fields (§10.2)

```yaml
type: Attested Computation
runtime: bigquery              # REQUIRED for this type
parameters:                    # Typed, named holes
  - { name: year, type: integer, required: true }
computation: references/computations/lib/revenue.sql  # Optional path to file
executor:
  resource: references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
```

| Field | Status | Description |
|-------|--------|-------------|
| `runtime` | **REQUIRED** for this type | How to run the computation. Defines what `parameters` mean. Examples: `bigquery`, `postgres`, `dbt`, `python`, `Looker` |
| `parameters` | Optional (`runtime` is the only field marked REQUIRED) | List of `{name, type, required}` entries. "A list of the typed, named holes the agent may fill." Binding semantics follow `runtime` |
| `computation` | Optional | Path to a file holding the computation. Absent ⇒ body `# Computation` fence is the computation |
| `executor` | Optional (but core to model) | `resource` names run instructions; `receipt` declares fields a run must return |
| `attester` | Optional (but core to model) | `resource` names deterministic code that takes receipt and returns verdict |

### The computation (§10.3)

Provide in one of two ways:
- **Inline**: fenced code block in body under `# Computation`. Best for short computations reviewed alongside the contract.
- **File**: set `computation` to a path (§6.2) and omit the body fence. Best for long/generated computations shared with non-OKF tooling.

### Security design (§10.3)

The agent MAY only supply *values* for the declared `parameters`; it MUST NOT author or edit the computation. The attester independently re-derives the same binding to compare against what actually ran. "Because the comparison is on the expanded, compiled artifact ... a rewritten query, a swapped computation file, or a mutated dependency fails the check."

### Verification vs attestation (§10.6)

| Aspect | `verified` | Attestation |
|--------|-----------|-------------|
| What it confirms | Definition still matches policy | Single run produced value the sanctioned way |
| When | Doc-level, slow | Per-call, runtime |
| Stored | In the bundle | Not stored in bundle |

### Deferred items (§12)

From the "Considered and deferred" section:
- Full runtime protocol (receipt/verdict wire formats, attestation lifecycle around a run)
- Attester ABI, portability, and sandboxing
- Attestation caching
- Semantic-layer templates (Looker, dbt) where attester comparison shifts from SQL equality to model-and-binding equality

## Citations (now Sources)

**v0.1**: Body `# Citations` list — a flat list of URLs in the markdown body.

**v0.2**: Frontmatter `sources` — structured entries with `resource`, `id`, `title`, and credibility signals. Per-claim attribution via markdown footnotes keyed to `sources[].id`.

**NORMATIVE for consumers**: SHOULD read `sources` and MAY still parse a legacy `# Citations` body list for v0.1 documents.

**Format for per-claim attribution**:
```markdown
... per the recognition policy.[^rev-policy]

[^rev-policy]: Revenue recognition policy
```

The footnote label (`rev-policy`) is the join key into `sources`. Consumers resolve attribution through the matching entry, not by parsing the footnote prose.

## Conformance (§11) — NORMATIVE

A bundle is **conformant** with OKF v0.2 if:

1. Every non-reserved `.md` file in the tree contains a parseable YAML frontmatter block.
2. Every frontmatter block contains a non-empty `type` field.
3. Every reserved filename (`index.md`, `log.md`) follows the structure in §8 and §9 respectively when present.

These are the three **bundle-conformance tests**. They should not be expanded
to include every normative producer or consumer obligation elsewhere in the
spec.

**Conditional producer obligations**:

- Reserved filenames MUST NOT be used as concept documents (§3.1).
- If a `log.md` is present, its date headings MUST use `YYYY-MM-DD` (§9).
- If an actor identifies a human author or confirmer, the producer MUST use
  the `human:` prefix (§7).
- In the Attested Computation workflow, an agent MAY supply only declared
  parameter values and MUST NOT author or edit the sanctioned computation
  (§10.3).
- When an optional provenance, trust, lifecycle, or computation family is
  present, producers SHOULD follow §§5–10 (§11).

**NORMATIVE constraints on consumers** (MUST):

- MUST treat a bare `verified` mapping as a one-element list (§5.2).
- MUST NOT reject a concept for missing any optional family (§5.3).
- MUST NOT reject a bundle because of:
  - Missing optional frontmatter fields.
  - Unknown `type` values.
  - Unknown additional frontmatter keys.
  - Broken cross-links.
  - Missing `index.md` files.

**Expected consumer behavior** (SHOULD):

- SHOULD derive trust tiers and staleness only from the fields specified here.
- SHOULD surface, not silently drop, a failing attestation (§10.5).
- SHOULD treat all other constraints as soft guidance.

**Consumer forbearance** is a separate interoperability obligation, not an
additional condition for declaring a bundle conformant. A consumer can report
the three bundle errors above while still preserving unknown keys and
tolerating optional-family omissions.

## Relationship to Other Formats

OKF occupies a deliberate niche. It is not a replacement for metadata catalogs or data governance platforms; it is a **portable, file-based intermediate format**.

| System | Relationship to OKF | Key difference |
|--------|---------------------|----------------|
| **Obsidian** | Compatible — OKF bundles work in Obsidian. OKF adds conformance rules and agent-focused frontmatter families. | OKF has no plugin ecosystem or graph view out of the box (though the reference impl ships a viz.html generator). |
| **Notion** | Compatible via export/import. OKF is file-system-native; Notion is API/service-native. | OKF is offline-first and git-friendly. |
| **MkDocs / Hugo / Jekyll** | OKF bundles can be rendered by any static-site generator that speaks markdown + YAML frontmatter. | OKF is a content format, not a site generator. |
| **DataHub** | Different layer. DataHub is a real-time metadata platform with ingestion, search, lineage. OKF is a snapshot format. | OKF could be an export target for DataHub, or vice versa. |
| **OpenMetadata** | Same as DataHub — a service, not a format. | OKF has no ingestion framework, API, or UI. |
| **Protobuf / Avro / OpenAPI** | OKF references them but does not subsume them (§1). | Domain-specific schemas vs. general knowledge format. |
| **Data Catalog (Dataplex, Unity Catalog, Collibra)** | OKF is positioned as an export/capture target. The reference agent already produces from BigQuery. | OKF is read-only as a format; catalogs are read-write services. |

The spec and README both emphasize that OKF is "not tied to any particular agent, framework, model provider, or serving system." It is a *format specification*, not a platform.

## Versioning (§12)

### Scheme

Revisions are versioned as `<major>.<minor>`:

- **Minor** bump: backward-compatible additions (new optional fields, new conventional section headings).
- **Major** bump: breaking changes (renaming required fields, changing reserved filenames).

### Bundle version declaration

Bundles MAY declare the version they target with `okf_version: "0.2"` in a **bundle-root** `index.md` frontmatter block. This is the only place frontmatter is permitted in an `index.md`.

**NORMATIVE for consumers**: Consumers that do not understand the declared version SHOULD attempt best-effort consumption rather than refusing the bundle.

### v0.2 is self-contradictory on versioning

The spec claims v0.2 is a "minor version bump under §12" from v0.1, but it introduces two deliberate breaking changes (`timestamp` → `generated.at`, `# Citations` → `sources`). Under its own versioning scheme, this should be a major bump. The spec mitigates this with explicit v0.1 fallback rules (§13.1), but this is a tension in the spec.

## What Changed from v0.1 to v0.2

### Source of comparison

The v0.1 spec is not preserved as a separate document in the repository. All change information comes from §13 of the v0.2 spec and the worked example in Appendix A, which shows the v0.1 form as a "before" migration snapshot.

### Breaking changes (§13.1)

| v0.1 | v0.2 | Fallback |
|------|------|----------|
| `timestamp` frontmatter field | `generated: { by, at }` | Consumers MAY fall back to legacy `timestamp` when `generated` is absent |
| `# Citations` body list | `sources` frontmatter family | Consumers SHOULD read `sources` and MAY still parse a legacy `# Citations` body list |

### Additive changes (§13.2)

All are additive (new optional keys, one new concept type, new conventional heading):

| Addition | Location |
|----------|----------|
| `sources` frontmatter with credibility signals (`author`, `usage_count`, `last_modified`) and `usage_window` | §5.1 |
| `generated`, `verified` frontmatter families | §5.2–5.3 |
| `status`, `stale_after` lifecycle fields | §5.4–5.5 |
| Actor convention (`<producer>/<version>`, `human:<id>`, `process:<id>`) | §7 |
| `Attested Computation` concept type with `runtime`, `parameters`, `computation`, `executor`, `attester` | §10 |
| `# Computation` conventional body heading | §4.2 |

### Carried forward unchanged (§13.2)

Bundle structure, reserved filenames, required `type`, recommended `title`/`description`/`resource`/`tags`, cross-linking, index files, log files, permissive conformance.

### Structural change: v0.1 vs v0.2 architecture

The worked example illustrates a fundamental shift:

- **v0.1 pattern**: Single monolithic concept doc containing multiple figures' computation SQL inline in prose. Citations are a flat list. One `timestamp` covers everything.
- **v0.2 pattern**: Each figure becomes its own `Attested Computation` concept with typed parameters, executor/attester contracts, and independent trust state. A separate narrative concept (`type: Metric`) links to both. The narrative concept is thin ("this concept only narrates them").

This reflects a deeper design shift: v0.2 decomposes the monolithic "trust bundle" into composable, independently-verifiable units. The spec explicitly says "Because each computation is its own concept, revenue can be fresh while profit is past its `stale_after`, and each attests on its own run."

## Strengths and Limitations

### Strengths

1. **Truly minimal core**: One required field (`type`). No schema registry. No required tooling. This is the spec's greatest strength — it lowers the adoption barrier to nearly zero.

2. **Permissive conformance is well-designed**: The "MUST NOT reject" rules for consumers create a graceful-degradation model. An OKF consumer can ingest any OKF bundle and extract whatever it understands, ignoring the rest. This is essential for an interchange format.

3. **Trust is derived, not stored**: Trust tiers are computed from verifiable signals (`verified` by whom) rather than stored as opaque scores. Credibility signals are objective facts (`author`, `usage_count`, `last_modified`), not subjective ratings. This is philosophically sound and avoids the stale-score problem.

4. **Attestation design is elegant**: "Was this number produced the way we said it must be" is a hard problem. OKF's solution — typed parameters, the computation as a read-only artifact, and deterministic attester comparison against the actual executed artifact — is a clean separation of concerns. The agent supplies values but not logic.

5. **Per-claim attribution via stable `id` keys**: Footnotes keyed to `sources[].id` instead of positional indices is a deliberate choice that survives agent-driven rewrites. This shows awareness of the agent-authoring use case.

6. **The actor convention is simple and extensible**: Three prefixes cover agents, humans, and processes. The `human:` prefix doubles as the trust-tier discriminator. Adding a new actor category would not break consumers.

7. **Progressive disclosure via index files**: Index files let consumers navigate one level at a time — a practical consideration for LLM context window limits.

8. **Self-contained specification**: The spec says it "specifies everything needed to produce and consume OKF v0.2." It delivers on this — no external references are required.

9. **Practical fallbacks for v0.1**: The spec explicitly defines how v0.2 consumers should handle v0.1 documents (`timestamp` fallback, `# Citations` parsing), which is pragmatic for adoption.

10. **License**: Apache 2.0, which is permissive and industry-standard.

### Limitations and underspecification

1. **`sources[].resource` dual nature is fuzzy**: A resource can be "a concrete artifact a consumer can follow" OR "a population or scope descriptor it cannot" (e.g., "all queries in BigQuery project X"). The spec gives no format or convention for scope descriptors. A consumer cannot reliably distinguish a broken URL from a scope descriptor.

2. **`usage_count` is underspecified**: The spec says it's "how often `resource` was exercised" — but what counts as an exercise? For a scope descriptor, it's "the number of exercises within the scope that touch the concept." The spec acknowledges it's "coarse" and "not a precise cross-kind ranking." This is honest but leaves the signal semantically weak for automated consumers.

3. **`usage_window` date format is not specified**: The example shows `{from: 2026-06-01, to: 2026-06-30}` but no format is mandated. Are these `YYYY-MM-DD` strings? Date objects? ISO 8601?

4. **No multi-bundle operations**: The spec defines a single bundle as the unit of distribution but says nothing about referencing concepts across bundles, merging bundles, or versioning bundles as a unit. In practice, cross-bundle links would be broken by design (consumer MUST tolerate broken links), but no guidance exists for producers.

5. **No conflict resolution for lifecycle states**: What happens when `status: deprecated` and `stale_after` is in the future? Or `status: draft` but human-verified? The fields are defined independently with no interaction semantics.

6. **`index.md` frontmatter is exceptional but ambiguous**: Only bundle-root `index.md` may have frontmatter (for `okf_version`). Can a non-root `index.md` with frontmatter be rejected? The spec says "index files contain no frontmatter, with one exception" but doesn't specify the penalty for violation.

7. **Executor and attester are opaque pointers**: `executor.resource` and `attester.resource` are paths or URLs. What they contain, how they're invoked, what interface they expect — all deferred. The spec says "OKF fixes the interface, not the packaging" but the interface (receipt fields format, verdict format) is also deferred.

8. **No specified error handling for frontmatter parsing**: The spec says frontmatter must be "parseable YAML" but doesn't say what a consumer should do with unparseable YAML. The reference implementation raises `OKFDocumentError`, but the spec's conformance rules don't address this case for consumers. (Only that "every non-reserved `.md` file ... contains a parseable YAML frontmatter block" — but consumers are told to be permissive.)

9. **Link graph is untyped**: Links are all treated as "directed edges of an untyped relationship." The relationship type is in prose only. This is fine for human reading but limits machine reasoning about the graph.

10. **No standard for bundle metadata**: There's no top-level bundle manifest beyond the root `index.md` (which only carries `okf_version`). Bundle title, description, authorship, creation date — all unstandardized.

11. **Log file semantics are thin**: The log is "a flat list of date-grouped entries" with no standardized entry format, no requirement to include concept IDs, and no interaction with git history. The README says "Pull requests, line-by-line diffs, blame, and review workflows just work" — which makes the explicit log file arguably redundant.

12. **Tag aggregation is consumption-time only**: No index-by-tag file format. Consumers must scan all frontmatter to build a tag view. This is a performance bottleneck for large bundles.

13. **No concept lifecycle state machine**: `status` has three values (`draft`, `stable`, `deprecated`) with no defined transitions, no rules about who can change status, no audit trail for status changes.

14. **Attested Computation parameters have no validation semantics**: Parameters declare `name`, `type`, `required` — but the `type` is a string with no specified vocabulary or validation rules. A parameter of `type: integer` — is `42` valid? `"42"`? `42.0`?

## Reusable Patterns for Implementation

### 1. The permissive consumer model

The most important pattern: **consumers MUST NOT reject documents for unknown content**. This is the foundation of OKF's portability. Any implementation must:
- Parse what it understands
- Preserve what it doesn't (round-trip unknown keys)
- Never error on unknown `type` values or broken links

### 2. Frontmatter as the query surface, body as the read surface

Frontmatter contains the few structured fields meant for filtering, indexing, and routing (`type`, `tags`, `status`, `generated`, `verified`, `stale_after`). The body contains the prose, schemas, and examples that humans and LLMs actually read. Implementations should keep these concerns separate.

### 3. Stable ID-based attribution over positional indices

When attributing claims to sources, use stable keys (`sources[].id`) as the join mechanism, not positional indices (`sources[0]`). This survives reordering caused by agent rewrites.

### 4. Trust derivation from verifiable signals

Trust tiers are computed from `verified` events, not stored as metadata. Implementations should:
- Check `verified[].by` for `human:` prefix to determine tier
- Treat missing `verified` as `unverified` (not an error)
- Never use trust tiers for access control

### 5. Staleness as absolute date comparison

`stale_after` is an absolute date, compared as `today >= stale_after`. No relative TTLs, no "last read" tracking. This is trivially implementable.

### 6. Bare mapping normalization

A `verified` value that is a dictionary `{by, at}` must be treated identically to a one-element list `[{by, at}]`. This is the only structural normalization the spec requires.

### 7. Concept ID ↔ path mapping

From the reference implementation (`paths.py`):
- Concept ID: tuple of path segments, no `.md` suffix
- Path: `bundle_root / *segments / name.md`
- Segment validation: alphanumeric starting with letter/number/underscore, allowing dots and hyphens (`[A-Za-z0-9_][A-Za-z0-9_.\-]*`)

### 8. Index regeneration

From the reference implementation (`index.py`):
- Group entries by `type` frontmatter field
- Use "Other" as fallback for missing types
- Link to `subdir/index.md` for directories
- For single-child directories with description, reuse the description; otherwise synthesize

### 9. YAML serialization conventions

From the reference implementation:
- `yaml.safe_dump(sort_keys=False)` — preserves field order, which matters for human readability
- Frontmatter delimiter on its own line, followed by a blank line, then body

## Implementation Choices

### Metadata model: what fields must a parser/skill support

**Required for basic conformance:**
- `type` (string, non-empty) — the only always-required field

**Required for trust/lifecycle-aware consumption:**
- `verified` (list of `{by, at}` or bare `{by, at}` mapping) — must normalize to list
- `generated.by`, `generated.at` — for freshness signal
- `stale_after` — `YYYY-MM-DD` string, for staleness check
- `status` — `draft` | `stable` | `deprecated`, default `stable`

**Required for provenance:**
- `sources` — list of entries, each with at minimum `resource` (string)
- `sources[].id` — for footnote-based attribution resolution
- `sources[].author`, `sources[].usage_count`, `sources[].last_modified` — credibility signals
- `usage_window` — `{from, to}` date range

**Required for attested computations:**
- `runtime` — string identifying the runtime (the only key the spec marks REQUIRED for this type)
- `parameters` — optional list of `{name, type, required}`
- `computation` — optional path
- `executor.resource`, `executor.receipt` — list of field names
- `attester.resource` — path to deterministic checking code

**Recommended for UX:**
- `title` — display name (fallback: derive from filename)
- `description` — single sentence (used by index generators, search snippets)
- `resource` — canonical URI
- `tags` — list of strings
- `okf_version` — in bundle-root `index.md` frontmatter only

**Round-trip preservation required:**
- All unknown frontmatter keys

### What validation checks are normative vs optional

**Normative (MUST validate or MUST NOT reject):**

| Check | Rule |
|-------|------|
| Type presence | Every concept MUST have a non-empty `type` field |
| Reserved filenames | `index.md` and `log.md` MUST NOT be used for concepts |
| Log date format | Log date headings MUST use `YYYY-MM-DD` |
| Verified normalization | Bare `verified` mapping MUST be treated as one-element list |
| Forgiving consumer | MUST NOT reject for missing optional fields, unknown types, unknown keys, broken links, missing indexes |
| Forgiving consumer | MUST tolerate broken cross-links |
| Actor trust prefix | Producers MUST use `human:` prefix for human-authored/confirmed content |

**Optional / SHOULD (editorial guidance):**

| Check | Rule |
|-------|------|
| Trust tier derivation | Consumers SHOULD derive trust only from specified fields |
| Attestation surfacing | Consumers SHOULD surface, not silently drop, failing attestations |
| Soft guidance | All other constraints are soft guidance |
| Structural markdown | Producers SHOULD favor structural markdown in body |
| Conventional headings | SHOULD use `# Schema`, `# Examples`, `# Computation` when applicable |
| Type values | SHOULD be descriptive and self-explanatory |
| Source IDs | `sources[].id` SHOULD be present when body cites the source |
| Index descriptions | Entries SHOULD include descriptions from frontmatter |
| Round-tripping | Consumers SHOULD preserve unknown keys |

### What edge cases does the spec explicitly handle

| Edge case | Resolution |
|-----------|-----------|
| Missing `type` | Non-conformant (§11) |
| Unknown `type` value | Consumers MUST tolerate, treat as generic |
| Unknown frontmatter keys | Consumers MUST NOT reject, SHOULD preserve on round-trip |
| Broken cross-links | Consumers MUST tolerate |
| Missing `index.md` | Consumers MUST NOT reject; MAY synthesize |
| Missing optional families | Consumers MUST NOT reject (§5.3) |
| Bare `verified` mapping | Consumers MUST treat as one-element list (§5.2) |
| Missing `verified` | Trust tier is `unverified` |
| Missing `status` | Implies `stable` |
| Missing `stale_after` | Concept is never stale |
| Unparseable `stale_after` | Not stale (reference impl returns False) |
| v0.1 `timestamp` presence | Consumers MAY fall back when `generated` absent (§13.1) |
| v0.1 `# Citations` body list | Consumers MAY parse when `sources` absent (§13.1) |
| Multiple verification events | Latest `at` determines "how recently" (§5.2) |
| `computation` absent in Attested Computation | Body `# Computation` fence is the computation (§10.3) |
| Agent supplies own SQL instead of parameterized query | Attester comparison against executed artifact catches this (§10.3) |
| `resource` naming a scope descriptor, not a path | Valid (§5.1); consumer can't dereference it |
| Single entry `usage_window` override | "A single entry MAY carry its own `usage_window` to override the shared one" (§5.1) |

### What edge cases are left ambiguous

| Edge case | Status |
|-----------|--------|
| Scope descriptor format for `sources[].resource` | Unspecified; no format convention given |
| `usage_window` date format | Not specified; example shows `YYYY-MM-DD` but not mandated |
| `parameters[].type` vocabulary | No vocabulary specified; arbitrary strings allowed |
| Index.md with frontmatter at non-root level | Violates the "one exception" rule; no consumer behavior specified |
| Cross-bundle references | Not addressed; likely treated as broken links |
| Bundle-level metadata (title, description, authorship) | Unstandardized beyond `okf_version` |
| Concurrent modification of a bundle | Not addressed |
| Log file interaction with git history | Log is redundant with git; no guidance on which is authoritative |
| Tag namespace / uniqueness | No constraints on tag format or deduplication |
| `status` transitions | No state machine defined; no audit trail |
| Attestation caching and staleness interaction | Explicitly deferred (§12) |
| Attester resource format (what constitutes "deterministic code") | "Deterministic (no-LLM) code" — no further specification |
| Executor resource format (what constitutes "run instructions or code") | No specification of interface or invocation protocol |
| Receipt fields format | Listed as field names in `executor.receipt` — no format for receipt values |
| Verdict format from attester | Not specified |
| Path resolution for `computation` file when both inline and file provided | No precedent rule specified |
| Empty bundle (no concepts, no index) | Conformance rules don't require any concepts to exist |
| Bundle root that is not a directory | Not addressed (e.g., single-file bundle) |
| Non-markdown files in bundle | Not addressed; no prohibition or recommendation |
