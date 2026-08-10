---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/87
status: draft
type: Decision
---
# Choose the repository OKF bundle topology and evidence boundary

Status: Closed

## Question

Where must this repository place its hand-authored OKF bundle, workspace declaration, and activation marker so the shipped skills can maintain durable context while code and specifications remain valid write evidence?

## Comment by artemVeduta

## Resolution

The repository topology and evidence boundary are decided.

- Put the hand-authored bundle at `okf/`, relative to this repository Git root. Keep its root declaration in `okf/index.md`.
- Put the single active workspace declaration at `.okf-workspace.json` in this repository root. It contains only the local hand-authored bundle. The exact manifest grammar and path-base rules remain a separate decision in [Define the exact .okf-workspace.json grammar and path-base rules](https://github.com/artemVeduta/okf-agent-skills/issues/109).
- Keep `.okf-active` as the required zero-byte file at the Git worktree root. It selects automatic behavior only; it does not grant authority, trust, access, ownership, approval, or write permission.
- Support both `code-backed` and `knowledge-only` project modes. Setup prompts for a bundle mode and writes `project_mode: "code-backed"` or `project_mode: "knowledge-only"` in that bundle root `index.md`. A manifest federation mode is a separate value.
- Set this repository initial `okf/` bundle to `knowledge-only`.
- For a `code-backed` bundle, code, configuration, tests, and accepted specifications below the selected repository Git root may support a write. The write target stays inside its bundle, sources must name exactly what was read, and evidence outside the declared workspace is not allowed.
- For this initial `knowledge-only` bundle, only maintained human-authored repository documents and resolved decision records are documentary authority. Each source must directly support the changed fact, decision, or constraint. Code, configuration, tests, fixtures, generated files, and vendored files can be observed but are not documentary authority.
- A direct human statement must be an explicit human-authored comment in a durable, addressable work or review record. Record its stable resource reference and author through standard `sources`. A bare record title, Git authorship, or an agent summary is not a direct human statement. This provenance does not grant approval, trust, or human verification.

This ticket blocks [Add the initial repository OKF bundle](https://github.com/artemVeduta/okf-agent-skills/issues/99). The new manifest-grammar decision also blocks that work.
