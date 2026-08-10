---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/141
status: draft
type: Decision
---
# Grilling: Setup orchestration — state inspection, report, consent, and repair model

Status: This decision is closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

Define the structured state inspection model that `/okf-setup` runs before any mutation. Setup must inspect three files and produce a structured report with consent/repair actions before proceeding.

**Files inspected:**
1. Root `index.md` — `okf_version` present/valid/missing, `project_mode` present/valid/missing
2. `.okf-active` — zero-byte regular file present, absent, or invalid
3. `.okf-workspace.json` — valid, absent, or invalid JSON

**Open decisions to grill:**
- State matrix: for each combination of the three files, what does setup report? What repair actions are offered?
- Consent model: which repairs require user approval? Which are automatic?
- Invalid `.okf-workspace.json`: offer regeneration from template adjusting salvageable values, require user approval — what values are salvageable?
- Monorepo detection: how does setup detect a monorepo? From `.okf-workspace.json` `packages` key? Filesystem evidence?
- Interaction model: compact/batched questions — what does the question format look like? Text output with numbered choices? Structured JSON?
- Non-interactive behavior: when there is no user to answer, does setup abort or take safe defaults?
- How `init` fits into the state model: does setup run init automatically when bundle root is absent/invalid, or does it ask first?

## Blocked by

None.

## Comment by artemVeduta

Duplicate of [#138](https://github.com/artemVeduta/okf-agent-skills/issues/138). Closing.
