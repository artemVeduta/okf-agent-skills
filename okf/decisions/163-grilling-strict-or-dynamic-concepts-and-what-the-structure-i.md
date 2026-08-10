---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/163
status: draft
type: Decision
---
# Grilling: Strict or dynamic concepts, and what the structure inside okf/ means

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #164

## Question

The bundle's structural model has never been decided in one place. It has been decided in fragments, and the dogfood run ([#150](https://github.com/artemVeduta/okf-agent-skills/issues/150)) made the fragments visible:

- Six types have a canonical directory. Every other type keeps its source path, so `okf/docs/` now exists inside the bundle, mirroring the project folder the migration read from.
- `Glossary` alone keeps its directory and renames its file.
- The type taxonomy is deliberately **open** ([#130](https://github.com/artemVeduta/okf-agent-skills/issues/130)), so a user may name any type — but the directory model is **closed**, with a fixed list of six.

An open taxonomy over a closed directory model is the tension that produced both of the dogfood run's structural surprises.

Decide the model:

- **Strict.** A closed set of concept types, each with one canonical directory. A type outside the set is refused, not placed. Predictable structure; the open taxonomy in [#130](https://github.com/artemVeduta/okf-agent-skills/issues/130) would need revising, which is a real cost.
- **Dynamic.** An open taxonomy where structure follows domain rather than type. The user (or the target-tree proposal) decides where concepts sit. Flexible; needs a rule that stops the bundle drifting into an arbitrary tree.
- **Hybrid.** A canonical directory for known types, an explicit placement decision for unknown ones — never a silent fallback to the source path.

Then settle what follows from it:

- What does the directory tree inside `okf/` mean? Is a subdirectory a **domain**, a **type**, or just a folder?
- Is a nested `index.md` navigation only, and must it exist for every subdirectory?
- Is a mirrored project path (`okf/docs/…`) ever legitimate, or always a symptom of a missing decision?
- How deep may nesting go, and does depth carry meaning?

This is the foundational ticket on this map. The target-tree proposal ([#156](https://github.com/artemVeduta/okf-agent-skills/issues/156)) cannot be designed without it: whether the user is approving a constrained tree or an arbitrary one changes the whole interaction.

Invoke `/grilling` and `/domain-modeling`.

## Comment by artemVeduta

## Resolution

Use a **dynamic concept structure** across setup, migration, and later lifecycle changes.

- Concept type and concept path are independent. The open type taxonomy remains. The six known types no longer imply canonical directories.
- Placement is a separate decision in the approved target tree. A subdirectory is a **concept group**: concepts collected for one current, named reader purpose.
- Each concept group must contain at least one concept directly or through child groups. A one-concept group is valid when it helps navigation. Empty groups for possible future content are invalid.
- Every concept group must contain a navigation-only `index.md` that states its purpose. The index is not a concept. Suite consumers remain tolerant of a missing or stale index and fall back to native search.
- Source paths can inform a proposal but never determine placement and never act as a fallback. A target path can match a source path only when every concept group was selected independently for the bundle reader structure.
- Nesting expresses containment only. Levels have no fixed semantic meaning. The current depth of six remains a suite support ceiling, not an OKF validity limit; deeper valid bundles are read with degraded coverage.
- Concepts can remain at the bundle root. A group exists only when it improves current navigation.

This revises the canonical producer-directory convention from [Research: OKF bundle data model](https://github.com/artemVeduta/okf-agent-skills/issues/130), but preserves its open taxonomy decision. It also removes the silent unknown-type source-path fallback exposed by the dogfood migration.

The target-tree interaction and proposal representation remain with [Grilling: Setup proposes the target bundle tree](https://github.com/artemVeduta/okf-agent-skills/issues/156). Glossary count and placement remain with [Grilling: How is a glossary stored?](https://github.com/artemVeduta/okf-agent-skills/issues/162).
