---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/130
status: draft
type: Research
---

# Research: OKF bundle data model — for code-backed and knowledge-only projects

Status: source GitHub issue closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

What is the concrete OKF bundle data model for code-backed and knowledge-only projects, adopting the full Google Knowledge Catalog OKF v0.2 SPEC.md format?

Surface:
1. The folder layout for each bundle type (code-backed vs knowledge-only)
2. Concept types appropriate for software projects
3. Which v0.2 frontmatter families apply per concept type and per bundle mode
4. Default frontmatter values and conventions
5. How the domain-modeling skill vocabulary maps into OKF concept types

Primary sources:
- https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/ADR-FORMAT.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/CONTEXT-FORMAT.md

Context: the current `okf-agent-skills` bundle at `okf/` is a minimal shell (`index.md` + `releases/`). The data model must cover a populated code-backed bundle and a knowledge-only bundle that holds the complete source of truth.

---

# Research result

## Executive decision

Use **one OKF v0.2 structural schema with two authority profiles**:

- **code-backed**: code remains authoritative for implementation behavior; OKF stores durable context that cannot be recovered adequately from code: domain language, rationale, constraints, durable decisions, research, workflows, and similar knowledge.
- **knowledge-only**: the OKF bundle is the complete active source of truth for durable project knowledge.

The two modes do **not** need separate OKF schemas or separate concept taxonomies. Their difference is authority/coverage, not document shape.

Suite conventions should remain a thin producer profile on top of OKF v0.2. Upstream OKF intentionally does not define a centralized fixed `type` taxonomy; unknown concept types and extension fields are valid and must remain tolerable.

## Upstream OKF v0.2 constraints that shape the model

- A bundle is a directory of Markdown concepts with YAML frontmatter.
- `index.md` and `log.md` are reserved filenames at any hierarchy level.
- Every non-reserved concept Markdown file requires non-empty `type` frontmatter.
- `type` is the only universally required concept key.
- Common optional/recommended families are `title`, `description`, `resource`, `tags`, `sources`, `usage_window`, `generated`, `verified`, `status`, and `stale_after`.
- `status` values are `draft | stable | deprecated`; absence means `stable` in the upstream format.
- `stale_after` is an absolute date and is optional.
- `verified` is evidence/trust metadata and must not be fabricated.
- `generated.by` is required when `generated` is present; generation metadata must describe actual generation.
- `sources[].resource` is required for each source entry; source IDs are useful when the body cites them.
- `references/` is a convention, not a required directory. It is appropriate for mirrored/adopted external material, executable helpers, or other resources a concept points at.
- Root `index.md` may declare `okf_version: "0.2"`. Other indexes are navigation/progressive-disclosure documents and should not carry concept frontmatter.
- Consumers must tolerate unknown optional fields/types and broken links.

## Folder model

Folders are a **producer/navigation convention**, not OKF semantics. Create them lazily. Do not create empty taxonomy directories just to satisfy a template.

### Code-backed project

```text
okf/
  index.md
  glossary.md
  decisions/
  constraints/
  research/
  playbooks/
  releases/
  references/
  log.md
```

For larger/multi-domain projects, ordinary hierarchy can scope knowledge without introducing a separate context-map data structure:

```text
okf/
  index.md
  ordering/
    index.md
    glossary.md
    decisions/
    constraints/
    research/
  billing/
    index.md
    glossary.md
    decisions/
    constraints/
    research/
  playbooks/
  releases/
  references/
  log.md
```

`index.md` answers **where should I look?**. Normal OKF links answer **what is related to this?**. We do not need a first-class `Context Map` concept because OKF linking already provides the semantic graph; maintaining a separate map would duplicate relationships and create drift risk.

### Knowledge-only project

Use the same basic producer profile, but allow domain-oriented directories to become the primary information architecture because the bundle itself is authoritative:

```text
okf/
  index.md
  glossary.md
  decisions/
  constraints/
  research/
  playbooks/
  references/
  <domain-oriented directories>/
  log.md
```

Do not force everything under a generic `knowledge/` directory. Arbitrary domain concepts are valid OKF concepts and should be organized for progressive disclosure.

## Core producer concept types

Keep the default taxonomy intentionally small:

```text
Glossary
Decision
Constraint
Research
Playbook
Release
Reference
Attested Computation
+ domain-specific types when genuinely useful
```

Do **not** use a generic `Note` as the producer default. Upstream permits it, but the suite should prefer a type that communicates durable intent.

### ADR is merged into Decision

There is no separate `ADR` producer type. Architecture decisions are just consequential decisions, optionally tagged:

```yaml
---
type: Decision
title: Use PostgreSQL for durable state
status: stable
tags: [architecture]
---
```

This removes overlapping semantics and avoids a lifecycle collision between Matt Pocock ADR statuses (`proposed | accepted | deprecated | superseded`) and OKF lifecycle status (`draft | stable | deprecated`).

If importing an existing ADR vocabulary:

- `proposed` -> `status: draft`
- `accepted` -> `status: stable`
- `deprecated` -> `status: deprecated`
- `superseded by ADR-NNNN` -> `status: deprecated` + a normal link to the replacement Decision

## Concept authoring contract

Primary principle: **optimize for retrieval density, not documentation completeness**. Prefer small durable facts plus links over essays. Word counts are authoring heuristics, not OKF conformance rules.

### Glossary

Purpose: canonical project/domain language.

Format:

```md
**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account

**Authorization**:
Issuer approval reserving funds for a future capture.
_Avoid_: Payment approval
```

Rules:

- one or two sentences per term;
- define what the concept **is**, not all behavior around it;
- choose one canonical term when synonyms compete;
- `_Avoid_` explicitly records competing, ambiguous, or discouraged synonyms;
- omit `_Avoid_` when there is no meaningful alternative;
- `_Avoid_` means “do not use these terms for this concept,” not a global forbidden-word list;
- include only project/domain-specific vocabulary, not generic programming concepts;
- when ambiguity matters, define boundaries and what the term is not;
- group naturally when a glossary becomes large; split by domain when one glossary becomes unwieldy.

Typical size: about 10–40 words per term; one or two sentences is the stronger rule.

### Decision

Purpose: preserve a durable, non-obvious choice and why it was made.

Default body should follow the minimal ADR philosophy: **1–3 sentences** containing only the context needed to understand what was chosen and why.

```md
---
type: Decision
title: Use PostgreSQL for durable state
status: stable
tags: [architecture]
---

We use PostgreSQL because orders and payments require transactional consistency and the team already operates it. DynamoDB was considered, but its consistency/modeling trade-offs add complexity we do not need.
```

Rules:

- title states the chosen outcome;
- body gives the missing context and rationale;
- no mandatory `Context`, `Decision`, `Why`, `Alternatives`, or `Consequences` headings;
- add `Considered Options` only when rejected alternatives are worth remembering;
- add `Consequences` only when non-obvious downstream effects matter;
- prefer a linked Research concept when the evidence/investigation is lengthy;
- architecture is `Decision` + optional `architecture` tag, not a different type;
- externally imposed rules normally belong in `Constraint`, not `Decision`.

Creation threshold, adapted from the domain-modeling ADR discipline: normally record a Decision only when the choice is costly/hard to reverse, surprising without context, and the result of a real trade-off. This prevents `decisions/` becoming a changelog of trivial implementation choices.

Typical size: **30–100 words**, normally **1–3 sentences**. Soft ceiling around **200 words** before supporting detail should move to Research or linked concepts.

### Constraint

Purpose: state what must remain true.

Rules:

- state the invariant/rule first;
- explain scope and reason/source only as needed;
- make exceptions explicit;
- use `sources` when imposed by regulation, contract, external system, policy, etc.;
- do not duplicate the implementation that enforces the constraint;
- if a choice was made because of the constraint, link the Decision to the Constraint.

Typical size: **30–100 words**, usually 1–3 sentences.

### Research

Purpose: preserve investigation, evidence, uncertainty, and recommendations that are useful beyond the immediate session.

Useful sections when warranted:

```text
Question
Findings
Evidence
Open questions
Recommendation
```

Rules:

- begin with a concrete research question;
- distinguish evidence from interpretation;
- cite real sources;
- preserve unresolved uncertainty;
- a recommendation may live here, but an adopted durable choice becomes a linked Decision;
- raw/adopted external material should live under `references/` when retained rather than being copied wholesale into the Research body;
- do not permanently narrate implementation details that code already answers in code-backed mode.

Typical size: **200–1,500 words**. Split around ~2,500 words when the investigation has independently useful subquestions.

### Playbook

Purpose: repeatable operational procedure for a human or agent.

Rules:

- say when to use it;
- give ordered actionable steps;
- include prerequisites when material;
- define success/failure checks;
- include rollback/recovery when relevant;
- link to Decisions/Constraints instead of duplicating rationale;
- keep theory out unless required to execute correctly.

Typical size: as short as executable, usually **100–800 words**.

### Release

Purpose: durable release knowledge that should remain queryable outside git history.

Rules:

- summarize meaningful changes and impact;
- include migration/compatibility notes when relevant;
- link to relevant Decisions/Constraints/Research;
- do not duplicate commit-by-commit changelog data;
- in code-backed mode, store only release knowledge worth retaining beyond code/history.

Typical size: **50–300 words**.

### Reference

Purpose: identify and explain an underlying authoritative/mirrored resource.

Rules:

- normally provide `resource`;
- body should explain why the resource matters to the project;
- do not summarize the whole external resource;
- mirrored/adopted files may live under `references/` and be linked by `resource`.

Typical size: **1–3 sentences**.

### Attested Computation

Use upstream OKF semantics directly. `runtime` is required. Keep explanatory prose minimal; the computation/executor/attester contract is the important part.

## Shared authoring rules

1. **One concept = one durable idea/responsibility.**
2. Lead with the information an agent needs most; details follow progressively.
3. Prefer links over duplicated prose.
4. In code-backed projects, do not restate information reliably recoverable from code.
5. Use `sources` only for actual provenance/evidence, not generic “related links.”
6. Never fabricate `verified`, `generated`, actors, freshness, source provenance, or review state.
7. Suite-created unreviewed concepts should explicitly start `status: draft`; reviewed durable concepts become `stable`.
8. `deprecated` concepts remain addressable and should link to replacements where applicable.
9. Split when parts have independent lifecycle, ownership, provenance, or retrieval value.
10. Size guidance is a quality heuristic, never an OKF validity rule.

## Frontmatter profile

`type` is the only universal concept requirement. Apply other fields only when they carry real information.

| Type | Common/recommended frontmatter |
|---|---|
| Glossary | `type`, `title`, `status`, optional `tags`, `sources` when terminology is externally grounded |
| Decision | `type`, `title`, `status`, optional `tags`, `sources`; `verified` only when actual review evidence exists |
| Constraint | `type`, `title`, `status`, often `sources`, optional `stale_after` when the constraint can expire/change |
| Research | `type`, `title`, `status`, usually `sources`, optional `stale_after` for time-sensitive research |
| Playbook | `type`, `title`, `status`, optional `stale_after`, `sources`, `resource` when backed by an executable/resource |
| Release | `type`, `title`, `status`, optional `tags`, `sources`, `resource` for an actual release asset/page |
| Reference | `type`, `title`, normally `resource`, optional `sources`, `status` |
| Attested Computation | upstream Attested Computation fields; `runtime` required |

Conventions:

- `verified`: no default; only real verification.
- `generated`: no default; only actual generation, with real actor/time where available.
- `stale_after`: no blanket default. Apply only when freshness has semantic value.
- `resource`: use only for an actual underlying asset/resource, not as a generic related link.
- `sources`: preserve true provenance; migration must not invent it.

## Domain-modeling vocabulary mapping

Matt Pocock's domain-modeling discipline maps cleanly without copying its filesystem model literally:

- `CONTEXT.md` language -> an OKF `Glossary` concept.
- canonical term + `_Avoid_` synonyms -> preserve directly in Glossary body.
- multiple domain contexts -> ordinary OKF hierarchy + `index.md` navigation + semantic links; **no required Context Map concept**.
- ADR -> OKF `Decision`.
- ADR considered alternatives/consequences -> optional Decision sections only when they add real retrieval value.
- an externally imposed non-code rule -> `Constraint`.
- exploratory investigation -> `Research`.
- code cross-checks -> evidence/source links where useful, not prose mirrors of code.

Migration must preserve the existing #19 decision: one selected source document maps to one output concept by default. Do not automatically explode a legacy `CONTEXT.md` into one concept per glossary term, automatically split sources, invent types, or infer provenance/trust metadata. Restructuring is a separate explicit operation.

## Mode-specific authority rules

### Code-backed

Store only durable context that code cannot adequately recover, including:

- canonical domain language and `_Avoid_` synonyms;
- rationale/trade-offs behind durable Decisions;
- external/business/system Constraints;
- Research evidence and uncertainty worth retaining;
- operational Playbooks not derivable safely from implementation;
- durable release context.

Avoid API signatures, directory trees, config inventories, generated descriptions, class/function summaries, or other implementation mirrors unless there is independent durable knowledge not recoverable from code.

### Knowledge-only

The accepted OKF bundle becomes the active authority for durable project knowledge. Migrated originals remain immutable evidence/archive, not a second competing active source of truth.

Domain-specific concept types are especially appropriate here when they improve retrieval (`Policy`, `Requirement`, `Metric`, etc.); the suite must not reject them simply because they are outside the default producer taxonomy.

## Current-repo findings / dogfood implications

The current bundle exposes two conformance/ownership issues to address during `/setup` dogfood migration:

1. `okf/releases/index.md` currently has concept-style frontmatter (`title`, `type: Index`). Under the upstream index model, non-root indexes are reserved navigation files and should not carry concept frontmatter.
2. Root `okf/index.md` currently stores `project_mode: code-backed` alongside `okf_version`. The strict upstream root-index exception is for the bundle version declaration. `project_mode` is suite authority metadata, not core OKF index metadata; its durable carrier should be resolved by `/setup` outside reserved index semantics.
3. Current validation reads `project_mode` from the root index and does not fully enforce all reserved-file/index shape rules, so adopting the stricter model requires runtime/validator follow-up, not only content edits.
4. `okf/releases/v0.1.0.md` currently uses `type: Note`; dogfood migration should use the producer type `Release`.

Do not invent a new authority metadata file in this research ticket. `/setup` should settle the carrier together with bootstrap/mutation-gate semantics.

## Resolved questions

- **Separate schemas for code-backed and knowledge-only?** No. One schema, two authority profiles.
- **Context Map concept?** No default Context Map. Use hierarchy/index navigation + OKF links.
- **ADR concept?** No. Merge into `Decision`; architecture is a tag/semantic subset.
- **Decision verbosity?** Minimal: normally 1–3 sentences / ~30–100 words, following the ADR-format philosophy.
- **Glossary synonym handling?** Preserve `_Avoid_` explicitly and make canonical vocabulary opinionated.
- **Word-count enforcement?** Guidance/warnings only, never conformance failure.
- **Fixed OKF type taxonomy?** No. Small producer defaults + tolerate domain-specific/unknown types as required by upstream extensibility.

## Follow-up implications for #129

This research graduates the **exact folder layout/data-model** uncertainty on the parent map. Remaining `/setup` work still needs to decide, among other things:

- the external carrier and mutation rules for `project_mode` authority metadata;
- raw research/reference handling during setup beyond the already-set migration contract;
- setup wizard/CLI flow;
- monorepo analytics composition;
- dogfood migration implementation and validation updates;
- grilling-with-docs and pre-PR sync behavior once their remaining dependencies are settled.
