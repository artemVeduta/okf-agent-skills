---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/156
status: draft
type: Decision
---
# Grilling: Setup proposes the target bundle tree for approval before publishing

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #163

## Question

Setup currently moves a file and adds a header. It never asks whether that file should be one concept or several, nor where concepts should sit relative to each other. The dogfood run published 42 concepts with no approval point at all.

What should setup propose, and how?

- After checking everything and before publishing anything, setup proposes a **target bundle tree** for the user to approve, adjust, or reject:

  ```text
  ├── <concept>.md                  # A concept at the bundle root.
  └── <subdirectory>/               # Subdirectories group concepts.
      ├── index.md
      ├── <concept>.md
      └── <subdirectory>/
          └── …
  ```

- Does the proposal cover **splitting** — one source document becoming several concepts? [#131](https://github.com/artemVeduta/okf-agent-skills/issues/131) forbids automatic splitting "unless explicitly approved". This ticket is that approval path, not a reversal of the rule.
- Does it cover **domain subdirectories** — grouping concepts by domain rather than by the source's own directory shape?
- Does it cover **`index.md` placement** for each subdirectory, given that a nested `index.md` is reserved navigation and never a concept?
- What is the proposal's form — a table, a tree, or both? At what point in the twelve-operation procedure does it run?
- How does the user adjust it? Free-form edit, a batched question round like `migration-plan`'s, or accept/reject only?
- If a split is approved, how does provenance survive? `data.mapping` assumes one source produces one concept, and `sources` frontmatter is per-concept.

Settle the shape of the proposal and the approval interaction. Implementation follows.

## Comment by artemVeduta

## Resolution

Setup adds a **target bundle proposal** after source-scope acceptance and semantic planning, and before partitioning or content transformation.

### Proposal form

The proposal has three authoritative table sections:

1. One source-disposition row for every selected source.
2. One output row for every planned concept, with source path, exact Concept ID, type, bounded content scope, source anchors where available, concept group, provenance assignment, and link decisions.
3. One group row for every concept group, with path, exact purpose text, and planned child entries.

A derived target bundle tree shows all concept paths, concept groups, and navigation-only `index.md` files. The tables remain authoritative. Setup derives each index from its accepted group purpose and child entries.

### Interaction

Setup presents one complete proposal for acceptance or rejection. The user can describe changes in plain language. Setup can use batched closed questions when choices are finite. Every requested change produces a new complete table and tree; partial acceptance is not permitted.

A proposal is not acceptable until every selected source has a disposition, every target path is unique and valid, and every split, provenance, collision, or link ambiguity has an explicit decision.

There is one routine approval. Setup does not ask again after assembly when transformed output matches the accepted proposal. Drift or a required semantic change blocks publication and requires a new complete proposal.

### Splits, provenance, and links

An approved migration split has one proposal row for each output. Approval fixes each output Concept ID, type, content scope, anchors, placement, and provenance before a migration worker runs. Workers cannot make a new concept-boundary decision. Automatic splitting remains forbidden.

Each output receives only the `sources` entries supported by the content it retains. An entry can be assigned to several outputs only when it supports each output. Every unassigned entry needs an explicit exclusion reason or blocks the proposal. The migration source path records conversion lineage and does not automatically become authored `sources` frontmatter.

An exact source anchor can route a rewritten link to one split output. Every ambiguous link needs an accepted target concept or concept-group index. No output becomes an automatic primary target.

### Acceptance and execution

Acceptance permits transformation and publication of only the exact concepts and navigation indexes listed in the proposal. A worker cannot add, remove, rename, regroup, or change the semantic scope of an output. Selected source files remain read-only.

The accepted proposal stays in the current session and passes unchanged through later wrapper operations. `.okf-staging` contains transformed files only; it does not become an approval or plan store. If the session ends, the proposal changes, or staged output drifts, setup must produce a new proposal. There is no persistent approval token, checkpoint, resume state, or new recovery system.

This resolves the proposal-representation and split-provenance fog on [/okf-setup: propose the target bundle before writing it, and report only what it did](https://github.com/artemVeduta/okf-agent-skills/issues/155). It makes the separate staged-semantic-validation question precise; that decision remains for a new child ticket.
