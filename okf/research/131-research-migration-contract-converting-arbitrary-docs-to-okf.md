---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/131
status: draft
type: Research
---

# Research: Migration contract — converting arbitrary docs to OKF concepts

Status: source GitHub issue closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

Synthesize the 8 existing migration sub-reports under `docs/research/migration-sections/` into a v0.2 migration contract spec. What are the safety invariants, concept boundary detection rules, provenance preservation requirements, idempotency guarantees, and approved source-to-concept mappings?

Research scope:
1. Safety invariants (never-mutate-source, write-new-then-swap, dry-run manifest)
2. Concept boundary detection — how a document becomes one or many concepts
3. Provenance preservation — what survives conversion (sources, authorship, timestamps)
4. Idempotency and resumability — migration-log.json, migration-checkpoint.json
5. Validation gates — conformance, completeness, link integrity, semantic fidelity
6. Source classification — what kinds of docs are supported (Markdown, Obsidian, etc.)

Primary sources: the 8 files under `docs/research/migration-sections/` plus `docs/research/knowledge-corpus-migration.md`.

Output: a concrete migration contract spec that feeds later grilling and implementation tickets.

## Comment by artemVeduta

## Resolution — migration contract for `/okf-setup`

Research synthesized from the 8 reports under `docs/research/migration-sections/`, `docs/research/knowledge-corpus-migration.md`, OKF v0.2, #19, #22, #24, #29, #130, current lifecycle/runtime/validator behavior, and current-repo dogfood.

### Decision

Migration is not a standalone user workflow. The user invokes `/okf-setup`; setup discovers existing documentation, asks only the semantic questions it cannot safely infer, delegates conversion to fresh-context sub-agents, validates the assembled OKF bundle, and publishes the result.

The user-facing flow is intentionally small:

```text
/okf-setup
  -> inspect project and discover documentation
  -> classify/select source material
  -> ask a compact set of unresolved semantic questions
  -> dynamically delegate migration to fresh-context workers
  -> assemble staged OKF bundle
  -> validate whole bundle
  -> publish
  -> done
```

There is no user-facing `/migrate`, `/resume`, `/restore`, or checkpoint workflow.

## 1. Recovery model: Git is the recovery system

The earlier migration research over-designed recovery for this product. For both setup migration and `okf-lifecycle`, OKF must not implement a second source-control/recovery system.

Remove from the migration/lifecycle contract:

- `migration-checkpoint.json`
- migration resume state
- per-file recovery journals
- backup creation/verification
- restore commands/testing
- rollback snapshots
- recovery manifests
- custom undo history

Assumption:

> The workspace is version-controlled by Git. Repository-level history, rollback, and disaster recovery belong to Git, not OKF.

If an operation fails, report the failure precisely. The user can inspect/revert with Git and rerun `/okf-setup` from the beginning.

This deliberately simplifies/supersedes the backup/checkpoint/resume parts of earlier #19/#29 research for setup/lifecycle.

## 2. Safety invariants

Keep only safety mechanisms that protect the current operation:

1. **Never mutate migration source documents.** Existing docs remain read-only inputs.
2. **Stage generated OKF output before publication.** Workers produce isolated staged output; incomplete work is not intentionally published.
3. **Do not guess unresolved semantic decisions.** Ambiguous mappings are collected and asked in one compact interaction where possible.
4. **Validate the assembled bundle before publication.** Whole-bundle structural/conformance checks run after worker merge.
5. **Fail loudly and restart cleanly.** A failed run has no checkpoint/resume contract; rerunning `/okf-setup` performs fresh discovery and migration.
6. **Use write-new-then-replace/atomic-ish writes where practical.** This is consistency protection, not rollback infrastructure.

Git remains responsible if the workspace needs restoration after any published write.

## 3. Source selection and classification

`/okf-setup` discovers candidate documentation, but the selected migration scope must be explicit to the user. It must not silently treat every file in the repository as durable knowledge.

### Directly supported semantic input

The safe portable parser target remains deliberately narrow:

- UTF-8 Markdown
- optional compatible YAML frontmatter
- standard Markdown inline/reference links

The old reports about automatic Pandoc, HTML, PDF, Word, MediaWiki, Obsidian wikilink/callout/Dataview conversion are useful source-format research but **not the migration policy**.

Extended/non-standard files may be classified, retained as source evidence/resources, or surfaced as unsupported/ambiguous input. They are not automatically interpreted as active OKF semantics.

### Important implementation constraint

The current validator/runtime frontmatter reader supports only a provisional YAML subset. The migration implementation therefore cannot honestly promise arbitrary YAML frontmatter unless the shared reader is widened. Unsupported YAML constructs must either block semantic parsing or be treated conservatively rather than silently normalized.

## 4. Concept boundary detection

Default rule:

> **One selected source document -> one output concept.**

Do not automatically explode paragraphs/headings into many concepts. Do not auto-extract glossary entries, decisions, constraints, or research fragments merely because a classifier thinks they exist.

Splitting one document into multiple concepts requires either:

- an explicit source structure/mapping already approved by the user, or
- a separate restructuring operation later.

This keeps migration distinct from compaction/restructuring and avoids semantic invention.

## 5. Durable-context filter

For `code-backed` projects, migrate only durable context that is not mechanically recoverable from authoritative code.

Useful durable categories from the research:

- rationale and decisions
- domain terminology/glossary
- externally imposed constraints
- rejected alternatives/tradeoffs
- exploratory research and conclusions
- runbooks/troubleshooting/operator knowledge
- intentionally curated navigation/context that code cannot reconstruct

Usually code-recoverable and therefore not worth duplicating in OKF:

- API signatures/reference generated from code
- package/class/file hierarchy
- config listings
- build commands already mechanically discoverable
- prose mirrors of implementation behavior

For `knowledge-only` projects, accepted OKF becomes active durable authority; original documents still remain immutable source/evidence unless the user later cleans them up separately.

## 6. Approved source -> concept mappings

Use explicit existing source type when present. Otherwise source-class -> OKF type mappings must be deterministic/human-approved; ambiguous type is not guessed.

Core mappings:

| Source semantics | OKF type |
| --- | --- |
| ADR / durable decision | `Decision` |
| CONTEXT terminology / canonical vocabulary | `Glossary` |
| externally imposed non-code rule/invariant | `Constraint` |
| exploratory investigation / research report | `Research` |
| operational runbook / procedure | `Playbook` |
| release record | `Release` |
| retained external material/resource wrapper | `Reference` |
| computation with real execution/runtime provenance | `Attested Computation` |
| explicit domain-specific source type | preserve/use domain-specific OKF type |

Unknown explicit OKF types remain valid under v0.2. There is no generic producer-default `Note` fallback. If the type is genuinely ambiguous, ask/block rather than inventing one.

## 7. Identity, collisions, redirects, dedupe

Identity follows the settled path-based OKF v0.2 model from #22:

- Concept ID = bundle-relative path without `.md`
- no UUID continuity layer
- deterministic output path derived from approved source mapping
- no silent rename/merge/overwrite of an existing target concept

Target collisions block or require a user decision.

Redirect machinery remains off per #24. Migration does not create redirect stubs/aliases.

Duplicates:

- exact duplicates may be reported as candidates
- near duplicates/conflicting claims/identifier collisions are not silently merged
- no automatic deletion, re-attribution, or dedupe that changes meaning

## 8. Provenance preservation

Structured OKF `sources` is the authoritative provenance mechanism when a source relationship is structurally clear.

Rules:

- preserve explicit, unambiguous provenance
- copy/translate a citation into structured `sources` only when the relationship is clear
- ambiguous/conflicting/unassigned provenance is surfaced, not fabricated
- never invent `generated`, actors, `verified`, freshness, review dates, or provenance claims
- provenance and review state remain separate
- if suite-created migrated concepts are unreviewed, `draft` is the safe authoring status; preserve explicit valid source status where appropriate rather than manufacturing review evidence

## 9. Raw research and attachments

Raw/adopted evidence should not be copied wholesale into active `Research` prose just to preserve bytes.

Preferred treatment:

- durable synthesized conclusions -> `Research` concept
- selected external/raw evidence worth retaining -> deterministic path under `references/`
- attachments selected/referenced by migrated content -> copy byte-for-byte with content identity/hash where useful for integrity
- unsupported/transient source material -> remain original source or inert retained resource, not interpreted as active semantics

If unsafe/unrepresentable text must accompany a converted concept, retain it visibly/inertly as migration residue rather than silently dropping or converting its meaning.

## 10. Links

Only parsed standard Markdown links/reference definitions are candidates for rewriting.

- unambiguous source -> target rewrites are allowed
- ambiguous rewrites must be surfaced/block the affected mapping
- prose strings, inline code, and fenced code are not link targets
- broken OKF links are tolerated by the upstream spec, so unresolved links are generally warnings unless migration itself would drop/change a known parsed relationship

## 11. Dynamic sub-agent migration is mandatory architecture

A docs folder may contain many documents. The setup coordinator must not ingest the full corpus into one long context and attempt migration serially.

Every non-trivial migration uses delegated fresh-context workers. Parallelism/fan-out scales dynamically with corpus size and semantic structure.

Conceptual topology:

```text
/okf-setup coordinator
  -> inventory/classification workers
  -> semantic partitioning
      -> docs/payments/** worker
      -> docs/auth/** worker
      -> docs/architecture/** worker
      -> research/** worker(s)
      -> ADR/** worker
  -> collect proposed mappings/ambiguities
  -> one batched user decision round where possible
  -> fresh migration workers
  -> assemble staged bundle
  -> global validation
  -> publish
```

Partition by **semantic locality**, not arbitrary file-number chunks. Related documents should normally share a worker context. Very large domains can recursively fan out.

The exact file-count thresholds are implementation heuristics, not contract. Contract principle:

> Migration must dynamically delegate enough fresh-context work to finish the selected corpus in one setup session without polluting the coordinator context with the entire documentation set.

### Worker input

Each worker receives only what it needs:

- project mode/authority profile
- assigned source files
- approved source -> type/path mappings
- OKF v0.2 authoring contract
- target namespace
- relevant neighboring metadata needed for semantic/link consistency

### Worker output

Each worker returns an isolated staged shard:

- converted concepts
- references/assets
- source -> target mapping
- warnings
- ambiguities/blockers

Workers must not race on global shared files such as root indexes/workspace metadata. The coordinator owns global assembly and collision resolution.

## 12. Two-phase setup interaction

Prefer two agent phases:

### Discovery/planning

Workers inspect/classify sources and produce proposed mappings without converting the entire corpus in coordinator context.

### User decision

Coordinator batches unresolved decisions into the smallest practical question set: project mode, selected docs, ambiguous type/boundary mappings, collisions, etc.

### Migration

Fresh workers receive the resolved contract and generate staged OKF output.

Goal: **one question round, then migration finishes**, rather than agents interrupting every few files.

## 13. Idempotency without checkpoint machinery

Do not implement resumability.

Operational expectation is simpler:

- rerunning setup performs fresh discovery against current repository state
- deterministic mappings should naturally produce the same logical result for unchanged inputs/answers
- existing target collisions are handled explicitly, never silently overwritten
- a failed prior run contributes no special continuation state

That is sufficient. No `migration-log.json`, `migration-checkpoint.json`, epoch, or resume token is required.

## 14. Validation gates

Validation remains layered, but claims must be precise.

### Structural/conformance

Validate OKF v0.2 rules:

- concept frontmatter parses
- every concept has non-empty `type`
- reserved `index.md` / `log.md` structures are valid
- conditional frontmatter obligations are satisfied (`sources[].resource`, `generated.by`, attested runtime metadata, human actor prefixes, etc.)

### Completeness

Every selected source must have an intentional disposition: migrated concept, retained reference/evidence, excluded by approved rule, or surfaced blocker. Raw file-count parity is **not** a universal success criterion, especially in code-backed mode where recoverable docs should intentionally be filtered.

### Links

Resolve/recheck generated OKF paths and rewritten standard Markdown links. Broken links may warn because upstream permits them; migration-caused loss/ambiguity is stronger.

### Semantic fidelity

Structural validation does **not** prove semantic fidelity.

A semantic-fidelity claim requires human review of ambiguities/conflicts/residue plus representative high-risk conversions. Otherwise report semantic fidelity as not assessed rather than pretending conformance/file counts prove it.

## 15. `/okf-setup` vs `okf-lifecycle`

The user experience belongs to the new `okf-setup` skill from #129.

Recommended architecture is still one semantic contract seam rather than duplicated migration behavior:

- `okf-setup` owns discovery, UX, user questions, orchestration, dynamic delegation, and final setup flow
- shared runtime/lifecycle primitives may perform guarded OKF mutations/validation internally
- no separate migration command needs to be exposed to the user

The current `okf-lifecycle` implementation only owns `sync`; adding setup/migration behavior will require an intentional runtime seam rather than pretending current `sync` dispatch already supports it.

For `okf-lifecycle` generally, apply the same recovery rule: **no backup/restore/checkpoint system; Git owns recovery**.

## 16. Current-repo dogfood implications

The final setup dogfood should catch/settle at least these currently observed issues:

1. `okf/releases/index.md` currently carries concept frontmatter; nested `index.md` is reserved navigation and should follow the v0.2 index rules.
2. root `okf/index.md` currently carries `project_mode: code-backed`; #130 identified project mode as suite authority metadata whose proper carrier still needs to be settled rather than extending strict upstream index semantics accidentally.
3. current validator/runtime do not yet enforce every reserved/index rule and use a limited frontmatter parser; setup validation work must close that implementation gap.
4. `okf/releases/v0.1.0.md` currently uses `type: Note`; producer semantics from #130 make this a `Release`.

## 17. Superseded findings from the old migration reports

Keep the old reports as evidence, but the following are **not** current contract defaults:

- automatic Pandoc/non-Markdown conversion
- automatic Obsidian wikilink/callout/Dataview conversion
- MediaWiki/HTML conversion pipeline
- UUID-based concept identity
- redirect aliases/stubs
- automatic duplicate resolution
- paragraph/heading-level concept splitting
- automatic type inference when semantics are ambiguous
- backup/restore engine
- checkpoint/resume machinery
- structural/file-count checks presented as semantic-fidelity proof

## 18. Implementation consequences / ticket split

The settled contract naturally decomposes into:

1. setup discovery + source classifier
2. migration plan schema / batched question UX
3. safe Markdown/frontmatter reader compatibility
4. source -> concept mapping + provenance/residue handling
5. dynamic semantic partitioner + delegated worker protocol
6. staged shard assembler / collision handling
7. OKF v0.2 validation + final reporting
8. setup orchestration adapter over one shared semantic contract seam
9. current-repo dogfood + fixtures

No backup, restore, checkpoint, or resume subsystem should be created.

## Final contract

> `/okf-setup` discovers user-selected existing documentation, proposes source-to-OKF mappings, obtains only required semantic decisions in a compact interaction, then delegates migration to dynamically partitioned fresh-context sub-agents. One selected source document maps to one concept by default unless the approved plan says otherwise. Workers produce isolated staged output; the coordinator assembles and validates the complete OKF v0.2 bundle and publishes it after whole-bundle success. Source documents are never intentionally mutated. Git is the recovery/rollback mechanism for setup and lifecycle; OKF maintains no backup, restore, checkpoint, or resume system. Failed setup runs restart from `/okf-setup` using fresh repository state.
