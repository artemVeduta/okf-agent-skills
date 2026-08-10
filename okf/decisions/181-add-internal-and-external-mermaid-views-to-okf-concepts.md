---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/181
status: draft
type: Decision
---
# Add internal and external Mermaid views to OKF concepts

Status: Open.

## Destination

An implemented and verified concept-view convention gives each applicable OKF concept an embedded internal Mermaid view and an embedded external relationship view. Applicable current concepts are backfilled, and future concept work maintains the views.

## Notes

Domain: OKF concept authoring, navigation, and lifecycle behavior.

Consult `docs/spec/okf-agent-skills-v0.1.0.md`, `docs/spec/okf-agent-skills-v0.1.0-completion.md`, `/grilling`, and `/domain-modeling` in every decision session. Preserve zero runtime dependencies and the wrapper-process contract seam. Mermaid source remains readable Markdown when a viewer does not render it.

This effort overrides Wayfinder's planning default: specification updates, implementation, verification, and backfill of applicable current concepts remain inside this map.

## Decisions so far

- [Verify Mermaid portability and zero-dependency validation](https://github.com/artemVeduta/okf-agent-skills/issues/186) — Use source-readable `graph TD` Mermaid without a rendering contract or dependency; source review and `git diff --check` are the present checks.

## Not yet specified

- Exact specification and implementation changes across concept writing, lifecycle maintenance, and validation after the two view contracts are settled.
- The exact current concepts that need diagrams and their diagram content after applicability and evidence rules are settled.
- Deterministic acceptance fixtures after the rendering and validation boundary is settled.

## Out of scope

- Building or shipping a Mermaid renderer or viewer.
- Adding a runtime dependency for Mermaid generation, parsing, or rendering.
- Restructuring the OKF bundle for reasons unrelated to concept views.
