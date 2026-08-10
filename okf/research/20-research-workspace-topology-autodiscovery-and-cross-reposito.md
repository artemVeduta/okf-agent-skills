---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/20
status: draft
type: Research
---

# Research workspace topology, autodiscovery, and cross-repository knowledge routing

Status: source GitHub issue closed.

## Question

How should OKF skills discover, connect, scope, and route knowledge across single repositories, monorepos, nested projects, and several independently versioned repositories that an agent uses together in one working session?

Research current first-party Claude Code, Codex, and OpenCode capabilities for workspace roots, project instructions, settings/config files, hooks, nested configuration, multi-root operation, and session-start discovery. Compare explicit workspace manifests, harness configuration, filesystem and Git autodiscovery, and hybrid approaches. Identify what is reliable, portable, secure, lightweight, and token-efficient; do not assume the harnesses behave identically.

The investigation must cover at least:

1. One monorepo with root knowledge plus any number of child projects.
2. One standalone repository.
3. Several standalone repositories connected for one development workflow.
4. A non-repository workspace root containing a `projects/` folder whose children may be standalone repositories or monorepos.
5. A monorepo with its own OKF bundle alongside a standalone project with its own bundle.
6. Nested Git repositories, submodules, worktrees, symlinked sources, dynamically checked-out repositories, sparse checkouts, generated/vendor directories, and overlapping workspace boundaries.
7. Shared concepts and glossary terms versus project-local knowledge; precedence, conflicts, ownership, provenance, and nearest-bundle routing.
8. The scope of `init`, incremental CRUD, `sync`, migration, indexing, logging, validation, compaction, and pre-PR checks in each topology.
9. Startup performance, token budgets, caching/invalidation, security boundaries, missing repositories, and partial/offline workspaces.
10. Whether an explicit OKF workspace/federation manifest is necessary, optional, or avoidable.

Use these concrete scenarios as acceptance cases:

- A Tilt/Kubernetes workspace has a `project/` folder into which selected Git repositories are loaded dynamically, while the harness starts from the Tilt root.
- A Tilt workspace contains `projects/` with a client, workers, a worker-manager monorepo, a model/database repository, and a UI-component repository consumed through a Git npm package; development spans several projects, but the harness starts from the monorepo root rather than the Tilt root.

The report must define an unambiguous vocabulary for workspace root, repository root, project root, monorepo child, OKF bundle, knowledge scope, and connected workspace; include a topology/behavior comparison matrix; identify unresolved user decisions; and recommend which approaches should be prototyped. Write the deeply cited findings to `docs/research/workspace-topology-and-routing.md`.

## Comment by artemVeduta

## Corrected resolution — 2026-07-26

The report `docs/research/workspace-topology-and-routing.md` analyzes six workspace patterns and the two supplied Tilt/Kubernetes scenarios across Claude Code, OpenAI Codex, and OpenCode.

### What the research establishes

- OKF does not define multi-bundle identity, federation, routing, or write precedence.
- Repository/worktree discovery boundaries differ by harness and must not be treated as permission to walk arbitrary parents or siblings.
- Connected workspaces require an explicit, trusted bootstrap; discovering a manifest above the current Git boundary is not automatically reliable or safe.
- A manifest does not itself grant filesystem access or harness trust to sibling repositories.
- Any implementation must define schema/version handling, expected repository identity, realpath containment, symlink policy, trusted roots, per-harness access, and missing/offline/dynamic-repository states.

### What remains a proposal

- `.okf-workspace.json`, its location, and its schema;
- CUE-style merge/subsumption, shadowing, or independent routing;
- token and cache estimates;
- lazy-loading thresholds;
- shared-glossary delivery;
- nearest-bundle write routing.

The Tilt scenarios were **analytically walked through**, not validated in live harnesses or prototypes. The required prototypes now include workspace bootstrap at Git boundaries, realpath/symlink containment, sibling-access behavior in all three harnesses, dynamic repository transitions, and measured lazy-loading costs.

The unresolved identity, routing, precedence, and trust questions now live in **Define concept identity, cross-bundle routing, precedence, and workspace trust**. The ticket remains closed as research; no manifest or routing policy is treated as adopted product behavior.
