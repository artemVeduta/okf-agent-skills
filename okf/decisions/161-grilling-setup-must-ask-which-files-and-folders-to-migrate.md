---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/161
status: draft
type: Decision
---
# Grilling: Setup must ask which files and folders to migrate

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #164

## Question

Setup never asks the user **what** to migrate. It scans, classifies, plans, and publishes. The user's only decisions are per-source type questions and collision answers — all of which assume the source is already in scope.

The dogfood run ([#150](https://github.com/artemVeduta/okf-agent-skills/issues/150)) migrated `docs/` because the invocation named that folder. Nothing in the procedure proposed the rest of the repository. `CONTEXT.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, and `SECURITY.md` were never offered, although:

- `CONTEXT.md` is named in `migration-plan`'s own deterministic type table as a `Glossary` filename convention — the runtime already knows it is a migration candidate.
- `CONTEXT.md` and `AGENTS.md` are both named in [#129](https://github.com/artemVeduta/okf-agent-skills/issues/129)'s repository-setup obligations.

So a file the runtime has a specific rule for was silently outside the migration.

Decide the scope-selection step:

- Does setup **propose a scope** — the folders and files it found that look like durable context — for the user to confirm, extend, or trim, before `migration-plan` runs?
- Where does it sit relative to `discover`? `discover` already classifies everything in the repository; the missing part is presenting that inventory as a scope choice rather than consuming it directly.
- Is a repository-root convention file (`CONTEXT.md`, `AGENTS.md`, `README.md`) proposed by default, or only when the user asks?
- How does this interact with `payload.package_root`, which today is the only scoping control and is a monorepo mechanism, not a user-facing choice?
- What is the default when the user declines to choose — everything, nothing, or the conventional documentation directories only?

The rule this must not break: never migrate a file the user did not agree to migrate.

## Comment by artemVeduta

## Resolution

Setup separates discovery reach from migration consent.

### Scope sequence

1. Discovery scans one **migration scan boundary**: the repository or `payload.package_root`.
2. Setup presents one read-only **migration scope proposal** before `migration-plan`.
3. The user accepts, adds, removes, or rejects sources.
4. The accepted result becomes the exact **migration scope**.
5. Only then does `migration-plan` run. It can produce one later compact round for type, collision, and other semantic decisions. This replaces the earlier one-question-round goal with at most two distinct decisions: scope, then semantics.

`payload.package_root` remains a monorepo scan boundary. It is not an include list and does not approve any source. A requested path outside it requires a wider scan boundary, fresh discovery, and a new proposal.

### Proposal contents

The proposal shows every discovered supported Markdown candidate, known unsupported document format, and ambiguous document-like file. Other repository files appear as a count unless the user names one.

Fresh planning agents inspect the content of every supported candidate. Filenames and directory conventions are hints only; `CONTEXT.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` do not enter the proposed scope from their names alone. For a large corpus, agents divide inspection by semantic locality and return each path, recommendation, and short reason without loading the full corpus into the coordinator context. No file-count threshold is part of the contract.

Setup preselects only content that is likely durable context and is not mechanically recoverable from code. It shows excluded candidates and their reasons so the user can add them. Mixed or uncertain content remains unselected for the later mapping proposal. Unsupported or unreadable content remains unselected and is marked `not inspected` with the exact reason; it can be selected only for an explicit supported disposition such as retained evidence or migration residue, never for guessed semantic conversion.

### Consent rules

- Accepting a file approves that file for migration.
- Accepting a folder approves only the discovered files expanded and shown in the proposal. Files added later are outside the accepted scope.
- A user edit accepts the resulting scope when every added file was already shown. An unseen file or folder must be expanded and shown before acceptance.
- If discovery is incomplete, setup can continue only with a clear warning and the unreadable paths. The user can accept the visible scope, but setup makes no complete-discovery claim.
- If the user rejects the proposal or accepts no source, setup stops cleanly and migrates nothing.
- Setup never migrates a file outside the accepted migration scope.

### Domain language

`CONTEXT.md` now defines **migration scan boundary**, **migration scope proposal**, and **migration scope**.

### Map effect

This resolves source selection without deciding target-tree structure or the structural meaning of repository-root convention files. It creates no new decision ticket.
