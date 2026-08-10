---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/158
status: draft
type: Decision
---
# Grilling: Narrow, reorder, or remove the Glossary type-inference rule

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #162

## Question

The deterministic `type` table infers `Glossary` from "two or more `**Term**: definition` lines". In the dogfood run this matched metadata bullets — `**URL**:`, `**Stars**:`, `**Research date**:` — in 13 research documents that define no terms at all.

`Glossary` keeps the source's directory and renames the file to `glossary`. All 13 therefore collided on 2 target paths. `assemble` blocked correctly with `CONCEPT_TARGET_COLLISION`, which is the system working. The workaround was to add explicit `type: Research` frontmatter to 13 source files — a patch that expires the moment another research corpus arrives.

What should the rule be?

- **Narrow it** — require the bold-label lines to be the document's dominant structure, not incidental bullets; or exclude a document that also matches a directory-segment rule such as `research`.
- **Order it** — let a directory segment (`research`, `decisions`) win over a content heuristic, since a directory is stronger evidence of intent than a formatting coincidence.
- **Remove it** — drop `Glossary` content inference entirely and let an unmatched document ask the `type` question, which is the table's own honest fallback.

Note the interaction: a content heuristic that fires wrongly is worse than one that does not fire, because an unmatched document asks the user, and a wrongly-matched one does not.

## Comment by artemVeduta

## Resolution

Remove the `Glossary` content heuristic that infers type from two or more `**Label**: value` lines.

### Rule

- Explicit source `type` remains authoritative.
- Exact structural evidence remains valid: a `glossary` directory segment, a `glossary.md` filename, or the exact `CONTEXT.md` filename can infer `Glossary`.
- Bold-label content does not infer `Glossary`, even when such lines dominate the document.
- A Markdown source with no remaining type evidence uses the existing batched `type` question. Setup does not add a replacement semantic or percentage-based heuristic.

### Reason

Formatting does not prove that labels are terms. A false positive suppresses the type question, assigns the wrong concept identity, and can create target collisions. A false negative only asks the user to name the type. The safe failure mode is therefore to ask.

This decision does not change glossary count, placement, or term-conflict rules. Those remain governed by [Grilling: How is a glossary stored: how many, and where?](https://github.com/artemVeduta/okf-agent-skills/issues/162) and [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163).

Implementation must pin the reported research-metadata case, preserve exact structural inference, and show that an otherwise unmatched term-definition document now asks the `type` question.
