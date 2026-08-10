---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/162
status: draft
type: Decision
---
# Grilling: How is a glossary stored — how many, and where?

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #163

## Question

`migration-plan` gives `Glossary` a placement rule unlike every other type: it keeps the source's own directory and renames the file to `glossary`. Every other canonical type moves the concept into one shared directory (`decisions/`, `research/`, …).

That rule is why the dogfood run collided. Thirteen documents inferred as `Glossary` across two directories produced exactly two target paths, `docs/research/glossary` and `docs/research/ecosystem-deep/glossary`, and `assemble` blocked.

The collision was caused by a bad inference ([#158](https://github.com/artemVeduta/okf-agent-skills/issues/158)), but it exposed a question the inference rule does not answer: **how many glossaries does a bundle have, and where do they live?**

- **One per bundle** — a single `glossary.md` at the bundle root. Simple identity, one place to look. Forces every domain's terms into one file.
- **One per subdirectory** — the current implicit model. Terms live next to the concepts that use them. Requires a rule for which directory owns a term defined in two places.
- **One per domain** — glossaries follow domain boundaries rather than directory boundaries, which may not be the same thing.
- **A glossary is not a file at all** — terms are concepts, and a glossary is an index over them. This is closest to the OKF model's own "identity is the path" rule, and furthest from how the migration currently treats it.

Also settle: when two sources both define the same term, is that a collision, a merge, or two concepts? Merging is forbidden by [#131](https://github.com/artemVeduta/okf-agent-skills/issues/131)'s identity rules unless explicitly approved.

This is blocked by the strict-or-dynamic decision, because "one per bundle" and "one per subdirectory" are only meaningful once the bundle's structural model is settled.

## Comment by artemVeduta

## Resolution

A glossary remains one normal, multi-term OKF concept. Its document has one Concept ID and lifecycle; its terms do not become separate concepts.

### Count and placement

- A bundle can contain zero or more glossary concepts.
- Each glossary sits at the bundle root or in a concept group selected for its reader purpose.
- `Glossary` is the one intentional exception to the dynamic type/path rule from [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163): its basename is always `glossary.md`.
- Therefore, the bundle root and each concept group can contain at most one glossary concept. Another glossary needs another valid concept group; a group cannot exist only to bypass the limit.
- This preserves the multi-term authoring contract from [Research: OKF bundle data model — for code-backed and knowledge-only projects](https://github.com/artemVeduta/okf-agent-skills/issues/130). A glossary is not an index over term concepts.

### Term conflicts

Setup checks the complete proposed outcome: existing target glossary concepts plus all proposed glossary concepts. It creates a term-conflict candidate by trimming and comparing names without case sensitivity. The check covers canonical term labels and names recorded in `_Avoid_`. Fuzzy semantic matching does not gate migration.

Every candidate requires an explicit semantic decision:

- **Shared meaning:** the approved target contains one canonical definition. The plan records its final text, actual provenance, and the disposition of every duplicate source term. This does not merge the complete source documents unless the user separately approves that restructure.
- **Separate meanings:** the definitions remain in separate glossary concepts with distinct reader purposes. Each definition states its scope and boundary. One glossary concept cannot contain two meanings for the same label.

No term is merged, overwritten, or deduplicated without approval. Existing Concept ID collisions remain hard target collisions. This keeps the no-automatic-merge rule from [Research: Migration contract — converting arbitrary docs to OKF concepts](https://github.com/artemVeduta/okf-agent-skills/issues/131).

The target-tree proposal must apply this rule when it assigns glossary concepts to concept groups.
