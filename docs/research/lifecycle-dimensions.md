# Lifecycle Dimensions of Lightweight Durable Context

> Research into state-of-the-art patterns for lifecycle management of agent-facing knowledge.
> Prepared for the OKF skill suite design.

---

## 1. Concept Depth

### (a) Community Patterns

The **Zettelkasten Method** (Luhmann, popularized by Ahrens) establishes the
"Principle of Atomicity" as foundational: "put things that belong together into
a single note, give it an ID, but limit its content to that single topic"
[zettelkasten.de, "Principles"]. Each Zettel should be self-contained enough to
be understood independently, yet small enough that its relationship to other
notes is unambiguous.

The **C4 model** for software architecture (Brown) defines four hierarchical
levels of abstraction: System Context → Container → Component → Code. Each
level answers a different question for a different audience. The principle is
that depth should match reader need — executives read System Context, while
developers drill into Component and Code diagrams [c4model.com, "Abstractions"].

The **dbt project structure** guide recommends three layers: Staging (atomic
building blocks from source), Intermediate (purpose-built transformation
steps), and Marts (business-defined entities). The key insight: "stacking our
transformations in optimized, modular layers means we can apply each
transformation in only one place" [docs.getdbt.com, "How we structure our dbt
projects"]. Deep nesting beyond 3-4 levels is considered a smell indicating
need for refactoring.

Google's **design doc** practice advises: "The sweet spot for a larger project
seems to be around 10-20ish pages. If you get way beyond that, it might make
sense to split up the problem into more manageable sub problems." Short "mini
design docs" of 1-3 pages are explicitly encouraged for incremental work
[industrialempathy.com, "Design Docs at Google"].

The **ADR community** (Nygard, adr.github.io) enforces one decision per record:
"Each ADR should be about one AD, not multiple ADs" — a direct parallel to
OKF's one-concept-per-file rule [github.com/joelparkerhenderson, "Suggestions
for writing good ADRs"].

### (b) OKF v0.2 Status

OKF v0.2 defines a **concept** as "a single unit of knowledge within a bundle"
with no constraints on granularity [02-okf-v02-spec.md: §2]. The spec
deliberately does not prescribe concept depth — producers "organize concepts
however makes sense." Nesting depth is unconstrained [02-okf-v02-spec.md: §3].

The v0.1→v0.2 structural shift is instructive: v0.1 used monolithic concept
docs with inline SQL for multiple figures; v0.2 decomposes into composable
`Attested Computation` concepts, each independently verifiable, with a thin
narrative concept (`type: Metric`) linking to both. The spec notes: "Because
each computation is its own concept, revenue can be fresh while profit is past
its `stale_after`, and each attests on its own run" [02-okf-v02-spec.md:
§13.2]. This demonstrates an emergent depth heuristic: **split when
lifecycle/trust signals need to diverge**.

### (c) Gaps

No guidance exists for:
- **Minimum viable concept size**: what separates a concept from a fleeting
  note? A concept with only a title and `generated` timestamp but no body is
  technically conformant — is that useful?
- **Maximum concept size**: when does a concept become too long for an agent's
  context window? The spec is silent.
- **Splitting criteria**: when should a concept be split into children? The
  Attested Computation pattern is the only example, but no general heuristic
  exists (e.g., "split when frontmatter fields diverge," "split when body
  exceeds N tokens").
- **Navigation depth limits**: no practical guidance for when directory nesting
  becomes unwieldy. Zettelkasten's "structural layers" (content → structure
  notes → main structure notes → double hashes) provide a model for layering
  abstraction [zettelkasten.de, "Scaling your note archive"] but OKF has no
  analogue of "structure notes" or "MOCs."
- **Concept equivalence testing**: how to detect when two concepts in different
  parts of the tree describe the same thing.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Concepts should be thin wrappers around code artifacts —
schema descriptions, architectural rationale, metric definitions. The code is
authoritative; the concept records *why* and *what context cannot be
recovered*. Depth map: table-level concepts (schema, query patterns) are the
atom; dataset-level concepts aggregate them; architectural decisions sit at a
third level. Three levels depth is typical.

**Knowledge-only**: Concepts are the primary artifact. Deeper nesting may be
warranted because knowledge is structured for human/agent navigation, not
mirroring a code structure. However, the Zettelkasten lesson applies: **favor
lateral links over deep hierarchy**. When concepts form a dense graph of
cross-references, directory depth beyond 3-4 levels should raise a compaction
flag.

---

## 2. Glossaries

### (a) Community Patterns

The **ADR community** has converged on a "decision log" concept that functions
as much as a glossary of past decisions as a log. "Project members skim the
headlines of each ADR to get an overview of the project context" [AWS
Prescriptive Guidance, "ADR Process"].

**GitLab's documentation style guide** mandates a "word list" as a companion to
the style guide — a canonical reference for terminology decisions
[docs.gitlab.com, "Style Guide"]. Terms are defined once, linked to from
anywhere, and reviewed for consistency programmatically via Vale lint rules.

The **Domain-Driven Design** community (Evans) treats the Ubiquitous Language
as a living glossary that evolves with the codebase. Key practice: the same
terms must appear in code (class names, method names) and documentation. Drift
between them is a design smell.

**dbt's** approach to documentation is a blended model: YAML files define
column descriptions and tests alongside model SQL, and a static site generator
produces browsable documentation. The glossary is auto-generated from code
annotations but hand-curated for semantic precision [docs.getdbt.com, "How we
build our metrics"].

**Inkeep Open Knowledge** (inkeep/open-knowledge) provides a WYSIWYG editor
that treats glossary terms as first-class concepts with bidirectional linking
— type a term, and it auto-links to the definition [07-ecosystem-projects.md:
Consumers].

### (b) OKF v0.2 Status

OKF has no dedicated glossary mechanism. Concepts carry `type`, `title`,
`description`, and `tags`, which collectively *could* serve as glossary
entries, but there is:
- No reserved `type` value for glossary entries (e.g., `type: Term` is
  producer-defined, not normative).
- No link typing — links are undirected/untagged, so a `[term](glossary/term.md)`
  link is indistinguishable from any other cross-reference.
- No mechanism to declare that code entity X is governed by concept Y, making
  code↔glossary drift detection impossible at the format level.
- No convention for inline term definitions vs. separate glossary files vs.
  definition lists in body.

The `description` field is "a single sentence summary" — insufficient as a
glossary definition [02-okf-v02-spec.md: §4.1].

### (c) Gaps

- **No term/concept distinction**: a glossary term is a special kind of concept
  (referenced by many other concepts, relatively stable, short body). No
  frontmatter field distinguishes this role.
- **No backlink tracking**: consumers must scan all concepts to find which ones
  reference a given term — there is no reverse-index convention.
- **No code-drift detection**: OKF is filesystem-only; it has no awareness of
  code artifacts. A skill suite could bridge this: given a concept `type: Term`
  and a codebase, verify that the term's usage in code matches its OKF
  definition.
- **No definition format**: body content for glossary entries could be
  markdown definition lists (`<dl>`), but no convention exists. The spec
  recommends structural markdown generally, but glossary semantics require
  specific conventions (term, definition, aliases, see-also).
- **Auto-generation tension**: auto-generated glossaries (e.g., from code
  comments) risk being low-quality; hand-curated glossaries risk going stale.
  The spec offers no guidance.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Code is the primary glossary. OKF should only capture terms
where the codebase meaning is ambiguous or the rationale for naming is
non-obvious. Drift between code and glossary is detected at code-review time by
a skill that checks: "Does this PR introduce a new term? If so, does it have a
corresponding or updated OKF entry?" The okforge "Stop-hook nudge" pattern
(remind when source changes but docs don't) maps directly here
[ecosystem-deep/skills.md: okforge].

**Knowledge-only**: The glossary IS the authoritative vocabulary. Every term
must have a definition. The glossary is a dense sub-graph of highly
cross-referenced concepts. Index regeneration should treat glossary entries
specially (always listed, never collapsed) and auto-detect when a concept is
referenced by >N other concepts (it is de facto a glossary term).

---

## 3. Logs

### (a) Community Patterns

The **ADR community** treats the collection of ADRs as a "decision log" — "the
collection of ADRs created and maintained in a project constitute its decision
log" [adr.github.io, "Motivation and Definitions"]. The log is implicitly
ordered by creation date, and ADRs are immutable once accepted. To change a
decision, you create a new ADR that supersedes the old one. This is a
**write-once, supersede-never-delete** model.

In **Google's design doc lifecycle**, explicit maintenance is expected: "As
plans collide with reality, it is inevitable that shortcomings ... surface, and
require changing the design. It is strongly recommended to update the design
doc." However, the article acknowledges "humans are bad at updating documents,
and ... changes are often isolated into new documents" — leading to an
"amendments" model [industrialempathy.com, "Implementation and iteration"].

The **Hermes-OKF** agent memory system implements a practical model: log
entries are appended automatically via decorator (`@memorize_decision`,
`@memorize_tool`), sessions are tracked per-directory, and git history serves
as an additional audit layer. Log entries carry structured metadata (kind,
category, timestamp) while the body is prose [ecosystem-deep/skills.md:
hermes-okf].

**GitLab's docs-first methodology** positions documentation as the "single
source of truth (SSoT)" — the documentation IS the log, updated continuously
via merge requests. The process is: "When you encounter information that's not
available in GitLab documentation, create a merge request (MR) to add the
information" [docs.gitlab.com, "Documentation Style Guide"].

### (b) OKF v0.2 Status

OKF defines `log.md` as a reserved filename for "update history" with a
normative format: date-grouped entries (`## YYYY-MM-DD`), newest first, with
prose entries beginning with a bold keyword [02-okf-v02-spec.md: §9].

This is deliberately thin, and the existing research identifies a key tension:
"The log is 'a flat list of date-grouped entries' with no standardized entry
format, no requirement to include concept IDs, and no interaction with git
history. The README says 'Pull requests, line-by-line diffs, blame, and review
workflows just work' — which makes the explicit log file arguably redundant"
[02-okf-v02-spec.md: Limitations #11].

The rakibtg/okf-skill `add_log_entry.py` implements a practical convention:
entries format is `* **{kind}**: {text}`, auto-inserts under today's date
heading, creates `log.md` if absent, supports per-subdirectory log files
[ecosystem-deep/skills.md: rakibtg/okf-skill].

### (c) Gaps

- **Log vs. git tension unresolved**: when both `log.md` and git history exist,
  which is authoritative? If `log.md` is auto-generated from git commits, why
  exist at all? If it's hand-written, how to prevent drift from actual changes?
- **Granularity**: per-directory `log.md` vs. single bundle-level log. Both are
  supported but no guidance on when to use which.
- **Auto-generation**: the rakibtg skill and reference agent both auto-generate
  log entries, but the spec has no field for "this entry was auto-generated."
- **Retention**: no guidance on log trimming or compaction. A log that grows
  unboundedly becomes noise.
- **Entry-to-concept linking**: entries lack structured pointers to the
  concepts they affect. "Updated the schema" — which concept? A consumer
  cannot trace log entries to specific concepts without parsing prose.
- **No event typing**: beyond the bold keyword convention (which is
  non-normative), there are no standard event types (Created, Updated,
  Deprecated, Verified, Split, Merged, Archived).

### (d) Code-backed vs Knowledge-only

**Code-backed**: `log.md` should be auto-generated and minimal. Git commit
history is the primary log; `log.md` serves as a human-readable summary of
notable changes. A skill should generate log entries from commit messages
matching a pattern (e.g., `okf: Updated concept tables/users`). The Hermes-OKF
model of structured commit prefixes (`[session]`, `[decision]`, `[plan]`) is
the right pattern [ecosystem-deep/skills.md: HermesOKF].

**Knowledge-only**: `log.md` IS the primary change history. Every modification
to a concept must produce a log entry with a reference to the concept ID. The
log is the audit trail. Per-directory logs are appropriate for large bundles;
a root-level `log.md` aggregates significant cross-cutting changes.

---

## 4. Provenance

### (a) Community Patterns

The **W3C PROV Data Model** (PROV-DM, 2013) is the most mature standard for
provenance: "Provenance is information about entities, activities, and agents
involved in producing a piece of data, which can be used to form assessments
about its quality, reliability, or trustworthiness." It defines three core
types — Entity, Activity, Agent — and relationships: `wasDerivedFrom`,
`wasGeneratedBy`, `wasAttributedTo`, `wasInformedBy`
[wikipedia.org, "Data provenance"].

The **data lineage** community distinguishes three granularities: coarse-grain
(job-level: "which file produced this output"), fine-grain (record-level:
"which input record produced this output record"), and end-to-end (across
multiple systems). The Ibis model introduces containment hierarchies:
operators can be contained within other operators, enabling queries across
granularities [wikipedia.org, "Data lineage"].

The **OpenLineage** standard models lineage as jobs, runs, and datasets for
automated capture from modern data pipelines [openlineage.io]. This is
relevant: OKF provenance could be enriched by pipeline metadata.

**Git's** commit model provides implicit provenance: every change has an
author, timestamp, and message. `git blame` gives line-level attribution. This
is the baseline that any file-based format inherits.

**signed-okf** (DynamicFeed) adds Ed25519 cryptographic signatures to concept
files and bundles, with JWKS key distribution and optional OriginTrail DKG
anchoring for on-chain provenance [07-ecosystem-projects.md: Trust and
Provenance].

### (b) OKF v0.2 Status

OKF v0.2 has a rich provenance model:

| Field | Purpose |
|-------|---------|
| `sources[].resource` | Required. Concrete artifact (URL/path) or scope descriptor |
| `sources[].id` | Stable key for per-claim attribution via footnotes |
| `sources[].title` | Human-readable label |
| `sources[].author` | Credibility signal — who produced the source |
| `sources[].usage_count` | Liveness signal — how often exercised |
| `sources[].last_modified` | Recency signal — when last changed |
| `usage_window` | Date range framing `usage_count` |

Key design decisions:
- Credibility signals are objective facts, not subjective scores: "Scores are
  subjective, unportable, and go stale."
- Per-claim attribution via markdown footnotes `[^id]` keyed to `sources[].id`
  — survives agent-driven list reordering
- Deeper lineage (explicit `derived_from`, data lineage) is explicitly **out of
  scope** for v0.2. "When a `resource` points to another OKF concept, the
  derivation edge already exists in the bundle graph"
  [02-okf-v02-spec.md: §5.1].

### (c) Gaps

- **No derivation chain**: `derived_from` is explicitly deferred. Concepts
  cannot declare "I was derived from concept X, which was derived from source
  Y." This matters for agent-generated content — when an agent writes a concept
  based on reading three other concepts, that chain of reasoning is lost.
- **No `created_because` field**: there is no frontmatter field for the
  rationale of why a concept was created (the ADR "Context" section). The body
  can contain this, but frontmatter fields drive retrieval and filtering.
- **`sources[].resource` dual nature is fuzzy**: scope descriptors ("all
  queries in BigQuery project X") are not dereferenceable, but a consumer
  cannot distinguish them from broken URLs.
- **No multi-bundle provenance**: cross-bundle references are not addressed. A
  concept in bundle A cannot cite a source in bundle B.
- **No actor provenance for concept creation**: `generated.by` records the
  agent, but there is no field for "commissioned by human:X" or "requested in
  issue #N."
- **No source freshness propagation**: if a source's `last_modified` changes,
  the concept's `stale_after` does not auto-adjust. There is no cascade
  mechanism.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Sources are primarily code artifacts (file paths, commit
hashes, API reference URLs). The `sources[].resource` is typically a
repo-relative path or permalink. A skill should auto-populate `sources` from
`git blame` of the code that motivated the concept. The okforge
"folder-to-source mapping" (`.okforge.config.json`) is the right pattern:
declare which source files a concept is derived from, enabling stale detection
[ecosystem-deep/skills.md: okforge].

**Knowledge-only**: Sources are external references (URLs, books, papers,
interviews). Provenance is more important because there is no code to serve as
ground truth. The "four-gate test" from the reference agent's web pass
(referenceable entity, non-bundle-meta, supports concrete citation, reusable by
2+ concepts) is the right filter for source quality
[03-reference-agent.md: Web Pass].

---

## 5. Freshness

### (a) Community Patterns

**Google's design docs** acknowledge staleness as inevitable: "design docs,
like all documentation, tend to get out of sync with reality over time." The
practice is: update the doc while the system hasn't shipped yet; afterwards,
link to amendments from the original [industrialempathy.com, "Implementation
and iteration"]. No formal freshness mechanism exists — it relies on author
discipline.

The **ADR community** follows an immutability model: accepted ADRs are never
changed. If a decision needs revision, a new ADR supersedes the old. Freshness
is handled through supersession, not TTL. AWS Prescriptive Guidance:
"Changes to an existing ADR requires creating a new ADR ... If the team
approves the new ADR, the owner should change the state of the old ADR to
**Superseded**" [AWS, "ADR process"].

The **okforge** tool introduces "stale detection" as a CI concept: a folder is
stale if its declared source files changed since HEAD while the OKF folder was
not edited. This is a relative, git-delta-based freshness model rather than an
absolute TTL [ecosystem-deep/skills.md: okforge CLI].

**Wikipedia** uses a template-based freshness system: `{{update}}`,
`{{outdated}}`, `{{current}}` templates are placed on articles by human editors
when content is suspected to be stale. There is no automated staleness
detection — it relies on community vigilance.

### (b) OKF v0.2 Status

OKF v0.2 defines two freshness mechanisms:

1. **`stale_after`**: An absolute date (`YYYY-MM-DD`). A concept is stale when
   `today >= stale_after`. Design rationale: "keeps the staleness decision a
   plain date comparison with no reference to when the concept was read"
   [02-okf-v02-spec.md: §5.5]. Missing `stale_after` means the concept is
   never stale.

2. **`status`**: Three values — `draft` (not yet reviewed), `stable` (default),
   `deprecated` (kept for links/history, no longer current)
   [02-okf-v02-spec.md: §5.4].

These are independent fields with no defined interaction semantics — the
research notes: "What happens when `status: deprecated` and `stale_after` is in
the future? ... Fields are defined independently with no interaction semantics"
[02-okf-v02-spec.md: Limitations #5].

### (c) Gaps

- **No relative TTL**: `stale_after` is absolute; there is no "review within 30
  days of last modification" concept. For concepts that describe fast-moving
  domains, absolute dates are either too aggressive (stale before actually
  outdated) or too conservative (stale after outdated).
- **No combination semantics**: how do `status`, `stale_after`, and
  `verified[].at` interact? A concept verified yesterday but past
  `stale_after` — is it trustworthy? No guidance.
- **No re-verification triggers**: what event should cause an agent to
  re-verify a concept? OKF identifies "is it still true?" as a first-class
  question but provides no mechanism for *when* to ask it. The answer is
  implicitly "at `stale_after`," but that only covers time-based triggers, not
  event-based ones.
- **No staleness cascade**: if concept A links to concept B, and B goes stale,
  does A inherit staleness? No mechanism. In practice, consumers must traverse
  the graph to assess transitive freshness.
- **No "true as of" semantics**: the spec has `generated.at` (when content
  last meaningfully changed) but no field for "this information was accurate as
  of date X." A concept written in 2026 describing a 2024 system state has no
  way to encode that temporal scope.
- **`usage_count` staleness**: the credibility signal `usage_count` can itself
  go stale if `usage_window` ends. No mechanism to signal that the usage count
  needs refreshing.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Freshness should be derived from git history, not absolute
dates. A skill should compute staleness as: "has the source code this concept
describes changed since this concept was last modified?" The okforge
`okforge stale` command pattern is the right model
[ecosystem-deep/skills.md: okforge CLI]. `stale_after` is a fallback for
concepts that describe external systems or business logic not visible in code.

**Knowledge-only**: Absolute dates are more appropriate because there is no
code signal for freshness. `stale_after` should be set aggressively (30-90
days) with a skill that periodically prompts for review. The Wikipedia model
(human-assigned freshness flags) is more appropriate than automated detection.

---

## 6. Approvals and Notices

### (a) Community Patterns

The **ADR community** defines clear state transitions: Proposed → Accepted /
Rejected / Superseded. "If the team approves the ADR, the owner adds a
timestamp, version, and list of stakeholders. The owner then updates the state
to **Accepted**" [AWS Prescriptive Guidance, "ADR process"]. Reviews involve
dedicated read time (10-15 min), comment discussion, and explicit approval.

**Google's design doc** lifecycle has a review phase: "On the heavy side of
reviews, are formal design review meetings in which the author presents the doc
... to an often very senior engineering audience." But it also offers a
lightweight alternative: "simply sending out the doc to the (wider) team-list"
[industrialempathy.com, "Review"]. No formal approval gates — consensus is
social.

**Git-based workflows** (pull requests) provide implicit approval: code review
approval → merge. For OKF bundles in git repos, PR approval is the natural
approval mechanism for human-reviewed content. The OKF README explicitly
acknowledges this: "Pull requests, line-by-line diffs, blame, and review
workflows just work" [okf-spec-and-ecosystem.md: Design Principles].

The **okforge** tool introduces "nudge" as a gentler alternative to approval: a
Stop-hook that displays a non-blocking reminder when source files changed but
docs weren't touched. "Silent if `.okf/` was already modified that session"


[ecosystem-deep/skills.md: okforge Nudge].

### (b) OKF v0.2 Status

OKF v0.2 defines three trust tiers derived from `verified`:

| Condition | Trust Tier |
|-----------|-----------|
| No `verified` key | **unverified** |
| `verified` by non-`human:` actors only | **machine-confirmed** |
| `verified` by a `human:<id>` actor | **human-reviewed** |

Key properties:
- Trust tiers are advisory signals, not access control: "A concept with no
  trust frontmatter is still consumable; consumers MUST NOT reject it"
  [02-okf-v02-spec.md: §5.3].
- `verified` is a list of verification events, each with `by` (actor) and `at`
  (timestamp). Multiple verifiers accumulate.
- The `human:` prefix on the actor string is the trust discriminator. It is
  normative: producers MUST use it for human-authored/confirmed content.

The reference agent's `write_concept_doc()` auto-fills `generated: {by, at}`
but does not auto-fill `verified`. This means all auto-generated content starts
as `unverified` — a correct default.

### (c) Gaps

- **No tiered operational model**: beyond trust tiers, there is no model for
  *what operations require which approval level*. Can an agent auto-archive an
  `unverified` concept? Can an agent change `status: stable → deprecated`
  without human review? The spec is silent.
- **No notice mechanism**: when an agent modifies a concept, should any humans
  be notified? No convention for `notify` fields, watch-lists, or
  subscription.
- **No conflict resolution**: if two agents produce conflicting verification
  events (one says machine-confirmed, another says stale), which wins? The spec
  treats all verification events as additive — consumers derive the highest
  tier — but conflicting claims at the same tier have no resolution.
- **No approval workflow states**: `status: draft → stable` implies approval
  happened, but there is no explicit `approved` status, no approver identity,
  no approval timestamp distinct from verification.
- **No differential trust**: all claims in a concept share the same trust tier.
  A concept could have 90% machine-confirmed claims and 10% human-reviewed
  claims, but the whole concept gets the highest tier (human-reviewed).
  Per-claim trust tiers (parallel to per-claim attribution) would be more
  precise.
- **No quorum / threshold**: a concept with three human verifiers is not
  distinguished from one with a single human verifier. There is no concept of
  "needs N approvals" or "approved by quorum."
- **Agent disagreement model**: the spec has no mechanism for two agents to
  record conflicting assessments of the same concept. The `verified` list
  accumulates events; a consumer cannot tell if two verifiers agree or
  disagree.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Trust tiers are less critical because code is authoritative.
Agent modifications should follow the PR model: propose changes in a branch,
request human review via PR, merge on approval. The git workflow IS the
approval mechanism. The skill suite should provide a `propose` operation that
creates a branch with proposed OKF changes and opens a PR, rather than writing
directly to `main`.

**Knowledge-only**: Trust tiers ARE the authority. A concept at `unverified`
carries significantly less weight than `human-reviewed`. The skill suite should
enforce tier-gated operations: agents can create concepts at `unverified`,
promote to `machine-confirmed` by running validation, but cannot promote to
`human-reviewed` — only a human actor can add that verification event. The
`status: draft → stable` transition should require at minimum
`machine-confirmed` trust.

---

## 7. Growth Management

### (a) Community Patterns

The **Zettelkasten** community addresses growth through structural layers:
Content notes (bottom layer) → Structure notes (middle layer) → Main structure
notes and double hashes (top layer). "Structure notes" serve as indexes/hubs
that group related notes, enabling navigation without loading the entire
archive [zettelkasten.de, "Scaling your note archive"]. Growth is managed
through abstraction, not deletion.

**Wikipedia** manages growth through a complex ecosystem of policies: notability
guidelines, deletion debates, merging proposals, splitting proposals, and
template-based cleanup categories. The key threshold pattern: when a section
grows too large, it is split into a child article with a summary left in the
parent. When articles overlap, they are merged.

**dbt's** project structure addresses growth through layering: "As we move
along that arc, we'll understand how stacking our transformations in optimized,
modular layers means we can apply each transformation in only one place"
[docs.getdbt.com]. Growth is managed by enforcing that transformations live in
exactly one place — duplicates are a structural smell.

The **ADR community** suggests maintaining a "decision todo list that
complements the product todo list" — a backlog of decisions that need to be
made, implying that the decision log should be curated, not exhaustive
[github.com/joelparkerhenderson, "How to start using ADRs"].

### (b) OKF v0.2 Status

OKF has no growth management mechanisms. There are no:
- Maximum bundle size thresholds
- Duplicate detection rules
- Merge/split conventions
- Auto-summarization guidance
- Concept count warnings
- Incremental loading strategies beyond `index.md` progressive disclosure

The `index.md` progressive disclosure model is the only growth-management
feature: "index.md files let consumers navigate one level at a time instead
of loading the entire bundle" [02-okf-v02-spec.md: Design Principles].
This is a navigation pattern, not a growth-management pattern.

### (c) Gaps

- **No bundle size thresholds**: at what point does a bundle become too large
  for an agent's context window? A threshold of ~100K tokens (roughly 50-75
  dense concepts) is a practical constraint, but OKF has no concept of this
  limit.
- **No deduplication**: if two agents independently create concepts describing
  the same thing, there is no mechanism to detect or resolve the duplication.
- **No merge/split tooling**: the spec defines no operations on the bundle
  graph beyond create/update. Merging two concepts (preserving inbound links)
  and splitting a concept into children (creating stub parents) are undefined.
- **No "noise" detection**: concepts that are never linked to, never read, and
  past `stale_after` are dead weight. No mechanism identifies or surfaces them.
- **No auto-summarization**: when a directory has 20+ children, the `index.md`
  list becomes unwieldy. The LLM synthesis from the reference agent's
  `synthesizer.py` is a stitched one-sentence summary — useful but fragile.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Growth is self-limiting because concepts are coupled to code
artifacts. The number of code artifacts bounds the number of concepts. A skill
should periodically audit: "does every concept have a living code source?" If
not, flag for archival.

**Knowledge-only**: Growth is unbounded. A skill should monitor: concept count,
average body length, cross-link density, directory depth, and concept creation
rate. Thresholds should trigger compaction recommendations: merge similar,
archive stale, summarize verbose.

---

## 8. Compaction

### (a) Community Patterns

**Wikipedia's** merging and splitting processes are the most mature compaction
model: when two articles overlap substantially, a merge proposal is created,
discussed, and executed — redirects are left in place for the absorbed article.
When an article grows too large, sections are split into child articles with
summary sections in the parent. Redirects preserve inbound links.

The **Zettelkasten** method uses "buffer notes" as temporary collection points
before content is distributed to permanent notes, and "structure notes" as
compaction artifacts — they don't contain new information, only links and brief
context to organize existing notes [zettelkasten.de, "Scaling your note
archive"]. Compaction is reorganization, not deletion.

The **ADR immutable records** model avoids compaction altogether: records are
never edited, only superseded. The collection grows monotonically.

**Google's design doc** practice of linking amendments rather than rewriting the
original is a form of append-only compaction: "This leads to an eventual state
more akin to the US constitution with a bunch of amendments rather than one
consistent piece of documentation" [industrialempathy.com, "Implementation and
iteration"].

### (b) OKF v0.2 Status

OKF has no compaction mechanisms. The spec defines `status: deprecated` (kept
for links and history) which is a form of logical deletion, but:
- There is no merge concept
- No split concept
- No body summarization convention
- No "this concept was compacted from X" provenance

The `index.md` regeneration pattern (from the reference agent and rakibtg
skill) provides lightweight compaction at the index level: outdated entries are
automatically dropped when concepts are removed. But concept-level compaction
is entirely unspecified.

### (c) Gaps

- **No merge semantics**: what happens to inbound links to the absorbed
  concept? Should they be rewritten? Should a redirect concept be left in
  place? The spec says consumers MUST tolerate broken links — but preserving
  navigation during merge requires explicit redirect support.
- **No summarization patterns**: when a verbose concept body should be
  compacted, what is the target length? What structure should a summary
  preserve? There is no `# Summary` conventional heading.
- **No compaction safety rules**: what should NEVER be auto-compacted? Without
  this, an agent could summarize a security policy or delete a critical
  constraint.
- **No compaction provenance**: if concept A is compacted from concepts B + C,
  there is no field to record this lineage. A future consumer cannot
  reconstruct the full history.
- **No granularity guidelines**: should compaction produce one summary concept
  per directory? Per type? Per tag cluster? No heuristic exists.
- **No human-in-the-loop for compaction**: auto-compaction is dangerous without
  review. The spec's trust tier model could gate compaction: only
  `human-reviewed` concepts may be auto-compacted, and only to produce
  `unverified` summaries that must be promoted.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Compaction is rarely needed. Concepts are thin wrappers; if
code changes, update the concept. If code is deleted, archive the concept. The
primary compaction operation is archiving concepts whose code sources are
removed.

**Knowledge-only**: Compaction is essential for long-term health. The skill
suite should provide: (a) merge-similar (detect overlapping concepts,
propose merge with redirect), (b) summarize-directory (create a meta-concept
from a directory's children, leaving children in place but adding
"summarized-by" links), (c) archive-stale (move concepts past `stale_after` +
grace period to `archive/`).

---

## 9. Archiving

### (a) Community Patterns

The **ADR/decision log** model uses supersession rather than archival: a
superseded ADR is kept in place with its status changed. "The team uses the
ADRs as a reference during code and architectural reviews where possible" [AWS
Prescriptive Guidance, "ADR process"]. Old decisions are retained for context,
not deleted.

**Wikipedia** has a "deletion policy" with multiple tiers: speedy deletion
(vandalism, test pages), proposed deletion (uncontroversial), and articles for
deletion (community debate). Deleted articles are not truly deleted — they are
hidden from public view but retained in the database. This is "soft delete"
with admin visibility.

The **Unix filesystem** convention of `archive/` directories is the simplest
model: move files that are no longer active but potentially useful into an
archive location. No metadata changes, just relocation.

**Hermes-OKF** implements `plans/archive/` as a convention for completed plan
concepts: moved from the active directory to an archive subdirectory,
preserving all metadata [ecosystem-deep/skills.md: HermesAgent].

**Git** itself provides implicit archival: deleted files remain in history. The
`git archive` command can produce a snapshot of the bundle at any point. This
is the ultimate fallback: nothing is truly lost.

### (b) OKF v0.2 Status

OKF defines `status: deprecated` — "kept for links and history; no longer
current" [02-okf-v02-spec.md: §5.4]. This is the only archival mechanism. Key
properties:
- Deprecated concepts remain in place in the directory tree
- Broken links to deprecated concepts are tolerated (as all broken links are)
- There is no `archive/` directory convention
- There is no concept deletion mechanism
- `status: deprecated` has no expiry — a deprecated concept lives forever

### (c) Gaps

- **No `archive/` convention**: should deprecated concepts stay in their
  original location or move to a designated archive directory? Moving them
  would break links, but the spec already tolerates broken links.
- **No deletion semantics**: the spec has no concept of deletion at all. A
  concept file can be removed from the filesystem — but consumers MUST
  tolerate broken links, so no error occurs. Is deletion by filesystem removal
  the intended deletion mechanism?
- **No archival metadata**: a deprecated concept has no field for "why
  deprecated," "what superseded it," "when can it be safely deleted." This
  information lives only in prose.
- **No retention policy**: does archived/deprecated knowledge ever expire? A
  bundle that never deletes concepts grows infinitely. For code-backed
  projects, this mirrors the git "never delete history" model — acceptable. For
  knowledge-only projects, infinite retention eventually harms retrieval
  signal-to-noise.
- **No deprecation cascade**: if concept A is deprecated and concept B links to
  it, should B also be flagged? No mechanism.
- **No discoverability of deprecated concepts**: should `index.md` list
  deprecated concepts? The reference agent's index regeneration includes all
  concepts regardless of status — deprecated concepts pollute the index.
  Consumers should be able to filter index views by status.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Archiving should follow the code's lifecycle. If the code
entity is removed, the concept moves to `archive/` or gets `status:
deprecated`. Git history preserves everything. The `archive/` convention is
appropriate because it reduces noise in active directories while keeping
content accessible.

**Knowledge-only**: Archiving needs more ceremony. Deprecation should require a
reason, a superseding concept reference, and a retention period. A skill
should automatically: (a) detect concepts past `stale_after` + 90 days with no
inbound links → propose archival, (b) update `index.md` to hide archived
concepts by default with a "show archived" toggle, (c) maintain a
`references/deprecations.md` index mapping deprecated concepts to their
successors.

---

## 10. Loss Prevention

### (a) Community Patterns

**Git** is the baseline: every change is versioned, `git revert` undoes
mistakes, `git reflog` recovers deleted branches. For file-based knowledge,
git provides strong loss prevention out of the box. The OKF README acknowledges
this: "Pull requests, line-by-line diffs, blame, and review workflows just
work" [02-okf-v02-spec.md: Design Principles].

**Hermes-OKF** adds explicit undo on top of git: `GitOKFBundle.git_revert(ref)`
checks out files from a previous ref and commits the restored state. It also
provides snapshot/restore functionality for agent state, and structured commit
messages for easy identification of what each commit contains
[ecosystem-deep/skills.md: GitOKFBundle].

The **okforge** tool's Stop-hook nudge is a loss-prevention pattern: it detects
when source files changed but docs were not updated, preventing the "silent
drift" form of knowledge loss. The nudge is gentle and non-blocking to avoid
friction [ecosystem-deep/skills.md: okforge Nudge].

**Wikipedia** uses a soft-delete model: deleted pages are hidden from public
view but retained in the database. Administrators can view and restore deleted
pages. "What links here" reports help prevent broken links after deletion.
Edit-history is preserved even after deletion.

**Database** community patterns: write-ahead logging (WAL), snapshots,
point-in-time recovery. These are heavyweight but provide the strongest
guarantees.

### (b) OKF v0.2 Status

OKF has no explicit loss-prevention mechanisms beyond inheriting git's
capabilities. The spec is built on the assumption that bundles are in git
repositories:

- No soft-delete or trash convention
- No undo semantics in the format
- No conflict detection for concurrent edits (two agents modifying the same
  file)
- No staging area before concepts become "live" in the bundle
- No "draft" location separate from published concepts (`status: draft` is
  metadata, not location-based)

### (c) Gaps

- **Is git sufficient?** For code-backed projects where developers are
  git-savvy, yes. For knowledge-only projects where non-technical users
  contribute, no. The skill suite should provide an `undo` operation that wraps
  `git revert` with user-friendly messaging.
- **No soft-delete**: a concept accidentally removed from the filesystem is
  recoverable via git, but only if the user knows to look there. A
  `.trash/` convention or a skill-level `recover` command would provide a
  friendlier safety net.
- **No concurrent edit detection**: if two agents or a human and an agent
  modify the same concept simultaneously, the last write wins silently.
  Frontmatter could include a `version` or `etag` field for optimistic
  concurrency control.
- **No staging/draft area**: `status: draft` marks a concept as draft, but it
  still lives in the same directory as stable concepts. A `drafts/` directory
  convention would provide location-based separation.
- **No compaction safety**: auto-compaction without human review could destroy
  information. The spec's trust tier model should gate destructive operations:
  only `human-reviewed` operations may delete or significantly reduce concept
  bodies.
- **No backup verification**: no convention for verifying that git backups are
  intact. A skill-level `verify-backup` operation could check that `git fsck`
  passes and all expected files exist.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Git is sufficient. The skill suite should rely on git
operations (`git revert`, `git log`, `git diff`) for loss prevention. The
Hermes-OKF pattern of structured commit messages by operation type is the
right addition.

**Knowledge-only**: Git is necessary but not sufficient. The skill suite should
add: (a) a `.trash/` convention with 30-day auto-purge, (b) an `okf undo`
command that lists recent operations and reverts them, (c) a `--dry-run` flag
on all destructive operations, (d) automatic `git commit` before any automated
compaction or archival run.

---

## 11. Retrieval

### (a) Community Patterns

**RAG (Retrieval-Augmented Generation)** is the dominant paradigm for
agent-facing knowledge retrieval. The pattern: chunk documents → embed →
store in vector DB → retrieve by semantic similarity → inject into LLM
context. Key tension: what is the optimal chunk size for OKF concepts?
[Google Cloud Knowledge Catalog uses this for semantic search,
05-google-cloud-kc.md].

**Progressive disclosure** is an alternative pattern: load only what the
agent needs, when it needs it. OKF's `index.md` is explicitly designed for
this: "index.md files let consumers navigate one level at a time instead of
loading the entire bundle" [02-okf-v02-spec.md: Design Principles].

**MOCs (Maps of Content)** are the Zettelkasten community's navigation pattern:
a "structure note" that links to related notes with brief context. MOCs are
hand-curated, not auto-generated, and represent the note author's mental model
of a topic [zettelkasten.de, "Scaling your note archive"]. Unlike `index.md`
(which groups by `type`), MOCs group by *meaning*.

**Concept-graph queries** as implemented by okforge: a JSON-based graph API
(`overview`, `neighbors`, `orphans`, `broken`, `path`) that enables
programmatic traversal by agent skills. The query skill reads the graph API
output instead of loading every concept into context [ecosystem-deep/skills.md:
okforge graph command].

**GitLab's docs** use topic types (concept, task, reference, troubleshooting)
to organize content, enabling users to filter by what they need: conceptual
understanding vs. step-by-step instructions vs. API reference
[docs.gitlab.com, "Topic types"].

**Full-text search with TF-IDF / BM25** (Hermes-OKF `SearchIndex`) provides
keyword-based retrieval without the computational cost of embeddings. The
inverted index approach is sufficient for small-to-medium bundles (hundreds
of concepts) and avoids vector DB dependencies [ecosystem-deep/skills.md:
SearchIndex].

### (b) OKF v0.2 Status

OKF provides three retrieval primitives:

1. **`index.md` progressive disclosure**: directory-level indexes grouped by
   `type` with descriptions. Agents navigate one level at a time. No
   cross-directory retrieval pattern is defined.
2. **Cross-links**: markdown links between concepts form an implicit graph.
   Links are untyped, so traversal by relationship type (e.g., "find all
   depends-on links") requires parsing prose context.
3. **Tags in frontmatter**: consumers can filter by tag, but "tag aggregation
   is consumption-time only" — no index-by-tag file format exists
   [02-okf-v02-spec.md: Limitations #12].

The `index.md` regeneration (reference agent `regenerate_indexes()`, rakibtg
`gen_index.py`) groups by `type` only. It does not support grouping by tag,
by freshness status, by trust tier, or by cross-link density.

The visualizer (`viz.html`) demonstrates graph-based retrieval: force-directed
layout, node search, type filter, backlinks. But this is a visual tool, not a
programmatic retrieval API for agents.

### (c) Gaps

- **No relevance ranking**: when an agent asks "find concepts about
  authentication," there is no retrieval model. An agent must either (a) scan
  all frontmatter for tag/title matches, (b) do full-text search on concept
  bodies, or (c) use an external embedding/RAG system. The format provides no
  retrieval assistance.
- **No context-window budget management**: an agent with 100K token context
  window can hold ~50 dense concepts. But there is no mechanism to say "these
  are the most important 50 concepts in this bundle." `index.md` provides
  summaries, but no priority signal.
- **No retrieval relevance feedback**: when an agent reads a concept and finds
  it irrelevant, there is no way to record "this concept is not relevant for
  query X" to improve future retrieval. A `relevance` signal could accumulate
  over time.
- **No MOC pattern**: `index.md` groups by `type`, which is structural. There
  is no equivalent for semantic grouping (e.g., "everything about billing,"
  "everything about authentication"). MOCs would require hand-curation.
- **No embedding storage convention**: if an embedding/RAG system is used,
  where do vector embeddings live? They are not part of the OKF format. A
  `.okf/embeddings/` convention (similar to okforge's `.okf/`) could be
  standardized.
- **No chunk/summary distinction**: when a concept is too long for a context
  window, should the agent read a summary or chunk it? The spec has no
  `# Summary` conventional heading. Chunking by heading is unreliable without
  structural conventions.
- **No retrieval audit**: no mechanism to track which concepts an agent has
  consulted, in what order, and whether they were useful. This meta-knowledge
  about retrieval patterns could improve future retrieval.

### (d) Code-backed vs Knowledge-only

**Code-backed**: Retrieval is code-driven. An agent starts by reading the code,
then looks up relevant OKF concepts by file path or resource URI. The
folder-to-source mapping (okforge pattern) enables precise retrieval: given a
source file, find its OKF concept. Full-text search is secondary.

**Knowledge-only**: Retrieval is the primary interface. The skill suite should
provide: (a) semantic search via embeddings (optional RAG layer), (b) tag-based
filtering with auto-generated tag indexes, (c) MOC support via `type: Map` or
`type: Overview` concepts that are hand-curated navigation hubs, (d) a
`context build` operation that takes a query and returns the N most relevant
concepts within a token budget, using a combination of exact match (resource,
filename), tag overlap, cross-link density, and semantic similarity.

---

## Priority Gaps

Ranked by urgency for the skill suite design — these gaps must be resolved
first because other design decisions depend on them:

### 1. Operational trust tier model (Approvals and Notices — gap 6c)

The most critical gap. Without deciding *what operations require what approval
level*, the skill suite cannot define safe automation boundaries. Specifically:
can agents auto-archive? auto-merge? auto-deprecate? can agents promote trust
tiers? The decision directly impacts loss prevention, compaction, and archival
designs. A matrix of (operation × trust_tier → allowed/disallowed/requires_review)
must be the first design artifact.

### 2. Concept ↔ source traceability (Provenance — gap 4c)

The second most critical gap because it underlies freshness, growth management,
and compaction. Without knowing which code (or external source) a concept
derives from, freshness detection is impossible for code-backed projects, and
deduplication is guesswork. The okforge `.okforge.config.json` mapping pattern
is the starting point, but it must be generalized: every concept needs an
optional `derived_from` or `source_files` field, and the skill suite needs a
`trace` operation.

### 3. Retrieval model within context window constraints (Retrieval — gap 11c)

Agents have fixed context windows (100K–200K tokens). Without a retrieval
model, either: (a) too many concepts are loaded, wasting tokens on irrelevant
knowledge, or (b) too few are loaded, missing critical context. The design
must address: what is the default retrieval breadth? How does progressive
disclosure map to token budgets? Should concepts carry an `importance` or
`priority` field? This decision affects every operation the skill suite
performs.

### 4. Merge and split semantics (Compaction — gap 8c)

As bundles grow, concepts will need to be merged (two agents independently
create overlapping concepts) or split (a concept grows too large). Without
defined merge/split semantics — including redirect handling, link rewriting,
provenance recording, and trust tier assignment — the bundle graph degrades.
This is the most technically complex compaction sub-problem and blocks
auto-compaction.

### 5. Archive lifecycle and discoverability (Archiving — gap 9c)

The simplest to resolve but highest daily impact: every bundle will accumulate
stale content. Without an archival convention (directory, metadata fields,
retention policy, discoverability rules), stale content silently pollutes
retrieval. `status: deprecated` exists but is insufficient without operational
semantics: where do deprecated concepts go? When can they be safely deleted?
Should indexes show them by default? A concrete `archive/` convention with
metadata fields (`deprecation_reason`, `superseded_by`, `retain_until`) would
unblock all freshness-dependent operations.

---

## Bibliography

- OKF v0.2 Specification. GoogleCloudPlatform/knowledge-catalog, `okf/SPEC.md`.
  2026-06-30.
- OKF Reference Agent. GoogleCloudPlatform/knowledge-catalog,
  `okf/src/reference_agent/`. 2026.
- AWS Prescriptive Guidance. "Architectural Decision Record Process."
  docs.aws.amazon.com.
- adr.github.io. "Architectural Decision Records." 2025.
- Malte Ubl. "Design Docs at Google." industrialempathy.com, 2020-07-06.
- zettelkasten.de. "Getting Started: The Zettelkasten Method." 2024.
- dbt Labs. "How we structure our dbt projects." docs.getdbt.com, 2026.
- Simon Brown. "The C4 Model for Visualising Software Architecture."
  c4model.com.
- Joel Parker Henderson. "Architecture Decision Record (ADR)."
  github.com/joelparkerhenderson/architecture-decision-record.
- Wikipedia. "Data Lineage." en.wikipedia.org, 2026.
- W3C. "PROV-Overview: An Overview of the PROV Family of Documents." 2013.
- GitLab. "Documentation Style Guide." docs.gitlab.com, 2026.
- EliaszDev/hermes-okf. "Agent Memory System on OKF." github.com, 2026.
- okforge (jetienne). "Claude Code OKF Skill." npm: okforge, 2026.
- rakibtg/okf-skill. "Agent Skill for OKF." github.com, 2026.
- fabricioctelles/skills. "OKF Open Knowledge Format Skill." github.com, 2026.
- Michael Nygard. "Documenting Architecture Decisions." thinkrelevance.com,
  2011.
- OpenLineage. "About OpenLineage." openlineage.io.
