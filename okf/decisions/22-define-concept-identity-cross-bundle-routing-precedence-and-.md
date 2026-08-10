---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/22
status: draft
type: Decision
---

# Define concept identity, cross-bundle routing, precedence, and workspace trust

Status: Closed.

## Question

What stable identity and routing model should connect concepts across standalone repositories, monorepos, nested bundles, and dynamically assembled multi-repository workspaces while preserving clear ownership, precedence, and security boundaries?

**Must resolve:**

- the stable concept identity key and whether moving a file changes identity;
- bundle-local versus globally unique identities;
- cross-bundle links, deduplication, conflict detection, and ownership;
- merge, shadow, or independent routing between parent, child, and sibling bundles;
- shared glossary delivery versus project-local terminology;
- nearest-bundle write routing and explicit overrides;
- workspace-manifest location, schema versioning, discovery, and bootstrap when the harness starts below or outside its root;
- repository/worktree boundary traversal;
- realpath containment, symlink handling, trusted roots, and sibling-repository access;
- missing, offline, dynamically checked-out, generated, and vendored repositories;
- per-harness access constraints and safe failure behavior.

The result must define deterministic lookup and write-routing rules plus a trust model. A proposed `.okf-workspace.json` file is a candidate, not a prior decision.

## Comment by artemVeduta

Unblocked by [#27](https://github.com/artemVeduta/okf-agent-skills/issues/27). The prototype on [`prototype/workspace-discovery`](https://github.com/artemVeduta/okf-agent-skills/tree/prototype/workspace-discovery/prototypes/workspace-discovery) settles the discovery/trust/routing half of this ticket's list and narrows the rest. Carrying the concrete inputs across so the grilling session does not re-derive them.

**Settled by the prototype — treat as inputs, not open questions:**

- *Workspace-manifest discovery and bootstrap when the harness starts below or outside its root.* A manifest above the git root cannot be **discovered**, only **supplied** — finding it would need the very upward walk it is supposed to authorize. The discovery ceiling is the git root, or cwd when there is no repository. This is the §3.3-vs-§6.3.3 contradiction, resolved in a direction, and Tilt Scenario B is exactly the case.
- *Repository/worktree boundary traversal.* Never above the git root, never sideways, on any harness. Monorepo member bundles enter scope only from the monorepo root; standing inside one child does not pull in its siblings. A submodule is excluded as a dependency **of its parent**, not when cwd is inside it.
- *Realpath containment, symlink handling, trusted roots, sibling access.* Containment is recomputed on every call, so an approval cannot be ridden after a retarget. The symlink allowlist **extends the containment envelope** rather than sitting as a separate check before it — written as two sequential tests, the `allowlist` policy value is dead code.
- *Per-harness access constraints and safe failure.* Access is a fallible query whose failure is a first-class status, never an exception. Codex is the floor: outside its sandbox there is no grant to give, so the identical federated read that succeeds on Claude Code refuses on Codex.
- *Nearest-bundle write routing.* Reads may federate; the write target is the nearest admitted bundle at or above cwd **inside the current repository**. A federated peer and a non-repository workspace root are never write targets, so widening read scope can never silently redirect a write.

**Still yours, now sharper:**

1. **Trust is keyed on canonical repository identity — but what *is* that identity?** The prototype's whole trust model rests on it (a moved repository keeps trust; an impostor at the same path inherits nothing) and treats it as an opaque token. §6.2 only says "a directory name alone is insufficient."
2. **What trust key does a non-repository workspace root have?** It has no repository identity. The prototype treats authorizing the root as trusting what has no repo of its own — a placeholder, not a decision.
3. **Does a repository appearing at a declared path auto-activate, or require confirmation?** (§6.2, §7.5.) The prototype activates on re-resolution and has no clock at all, because §7.5 vetoes hard-coding any TTL without prototype data.
4. **Should a harness-native multi-root input count as a bootstrap signal?** §7.3 lists it beside a user-selected root; the prototype deliberately excludes it so that granting access and widening scope stay visibly separate. Reversing this is a one-line change in `pickBootstrap`.
5. **Is a bundle in a directory the monorepo manager does not declare legitimate?** §1 ("not every subdirectory is a child") and §6.3.1 ("walk up looking for `okf/`") both fire. The prototype admits it and flags it.
6. **Which repository owns an overlapping path** when a git repo is nested inside another's working tree. Flagged as an anomaly, never picked.
7. **§6.2's status vocabulary needs a seventh term.** Reachable, present, and readable but not trusted is none of `declared_missing` / `not_a_repository` / `bundle_missing` / `access_denied` / `invalid`. The prototype adds `untrusted`; collapsing it into `invalid` would name a policy decision as a defect. Related: `not_a_repository` turns out to be a claim about a *declaration*, not about a path — it is only reachable when something asserted the path would be a repository.

Cache invalidation, which §7.2 gets wrong, has been split out as [#32](https://github.com/artemVeduta/okf-agent-skills/issues/32) rather than added here.

## Comment by artemVeduta

Correction from [Prototype workspace discovery, trust, and routing state transitions](https://github.com/artemVeduta/okf-agent-skills/issues/27): Codex external access is not categorically unavailable. A candidate independently admitted by discovery authority can be made accessible through repeatable `--add-dir` grants; the grant itself never widens discovery authority. The selected workspace root and two manifest paths are tested authority candidates, not an exhaustive set: whether harness-native multi-root input is a fourth bootstrap signal remains an open decision here. Treat the ticket body’s discovery/access bullets through this corrected boundary.

## Comment by artemVeduta

## Resolution

Identity, federation, routing, and trust are separate layers. The suite uses path-based OKF identity, explicit workspace federation, local instance trust, and deterministic non-merging reads.

### Identity

- **Repository instance identity** carries trust. A UUIDv4 token is created only when trust is granted and stored in the Git common metadata; linked worktrees share it. A non-repository workspace uses a local sidecar. Fresh clones receive fresh instance identities. Unwritable instances may receive session-only trust but cannot persist it.
- **Repository lineage identity** supports routing, not authority. Federated repositories use an explicitly declared canonical fetch remote normalized to `host/path`; SSH and HTTPS forms compare equally, while credentials, query strings, fragments, default ports, trailing slashes, and terminal `.git` are removed. Manifest-declared aliases preserve identity across transfers and approved mirrors. Forks are distinct unless incorrectly and explicitly aliased. Verification reads local Git configuration only and never contacts a network.
- Remote-less repositories may federate under a manifest-scoped alias. They make no global cross-workspace identity claim.
- **Bundle identity** is owner identity plus bundle-root path. Repository-owned bundles use repository lineage; workspace-root bundles use workspace identity. Moving a bundle changes identity.
- The suite retains the OKF v0.2 definition of **Concept ID**: bundle-relative file path without `.md`. The fully qualified key is bundle identity plus Concept ID. Moving or renaming a concept changes identity; no suite UUID or frontmatter extension claims continuity.

### Read routing and ownership

- Concepts never merge across bundles. Every concept has exactly one owning bundle. Matching paths, resources, or content produce diagnostics, not synthetic documents or ownership changes.
- Unqualified exact reads resolve in this order: explicit target, nearest admitted bundle, current-repository ancestors nearest-first, then explicitly federated bundles in manifest order. The selected result discloses lower-precedence matches.
- Broad search examines every admitted bundle; routing order is a deterministic tie-breaker rather than permission to discard relevant results.
- Standard Markdown links resolve only inside their source bundle and never fall through to another bundle.
- Authored cross-bundle links use `okf-workspace://<bundle-alias>/<concept-id>`. The active manifest is the only resolver. Missing or inactive aliases remain broken with diagnostics; links never widen discovery, trust, access, or write authority.
- Shared glossaries are independently owned, manifest-federated read sources. They may be pinned to an exact Git object. Project-local terminology remains independent and takes normal local-first precedence.

### Write routing

- Creating a concept defaults to the nearest admitted bundle at or above CWD in the current repository.
- An explicit create override may name another admitted bundle only in the current repository.
- Updating or deleting an existing concept routes to its owning bundle, not the currently nearest bundle.
- Federated peers and non-repository workspace-root bundles are read-only. Cross-bundle moves are explicit identity-changing migrations with link rewriting, never ordinary updates.
- Generated and vendored bundles require explicit declaration, participate in reads, and are always read-only.

### Workspace manifest

`.okf-workspace.json` is the portable federation declaration and is separate from trust and harness access. One manifest is active: an explicitly supplied manifest wins; otherwise the nearest manifest at or above CWD within the discovery ceiling wins. Manifests never merge or import one another in suite `v0.1.0`. The containing directory is the workspace root.

The exact-versioned schema contains:

- `schema_version: 1`;
- a UUIDv4 `workspace_id`;
- repository records with unique names, relative paths, either canonical remote plus aliases or `local: true`, and an optional exact Git object revision;
- ordered bundle records with unique routing aliases, a repository owner or `null` workspace owner, a relative root path, `required`, and mode `source`, `generated`, or `vendored`.

Unknown keys, duplicate names, malformed identities, unsupported schema versions, absolute paths, `..`, and invalid field combinations reject federation while preserving current-repository local operation. Trust records, harness permissions, caches, and canonical machine paths never enter the portable manifest. No general routing language is added.

### Discovery, trust, and containment

The prototype's ordered gates remain authoritative: `REACH → PRESENCE → {TRUST, ACCESS}`. Access never grants discovery authority. Harness-native multi-root inputs and additional-directory grants are access or candidate signals only; the current repository, an explicitly selected workspace root, or the active manifest establishes discovery authority.

- Discovery never walks above the Git root or sideways implicitly. A manifest above that ceiling must be supplied.
- Contextual upward discovery may admit a nested bundle even when a monorepo manager does not declare its directory. Root sessions do not recursively scan undeclared directories.
- Canonical paths are owned by their deepest containing Git root. Parent access to nested repositories and submodules requires explicit federation.
- Every symlink target must remain within the active workspace root. No external symlink allowlist ships in `v0.1.0`. Realpath containment is recomputed on every resolution; cycles, dangling links, escapes, and retargeting fail safely.
- Declared repositories activate automatically when fresh reach, presence, identity, trust, and access checks all pass. A new clone normally stops at trust; no extra activation prompt or TTL exists.

Candidate results use `active` or `inactive` plus composable findings: `DECLARED_MISSING`, `NOT_A_REPOSITORY`, `BUNDLE_MISSING`, `IDENTITY_MISMATCH`, `UNTRUSTED`, `ACCESS_DENIED`, and `INVALID`. Reach failures short-circuit silently where naming them would disclose unauthorized paths; presence short-circuits later checks; trust and access may report together.

An inactive required member makes workspace health degraded. Exact reads from active bundles and unrelated local writes continue. Federated results must state that they are non-exhaustive, and operations requiring an inactive member fail. Optional inactive members do not degrade completeness.

### Deterministic conflict checks

Suite `v0.1.0` checks duplicate routes to one canonical bundle, same Concept IDs across visible bundles, matching normalized non-empty `resource` values, and byte-identical documents. Only duplicate routes to the identical canonical identity are loaded once. All other matches remain independently owned advisory candidates. Fuzzy similarity and automatic consolidation are excluded.

Cache invalidation remains owned by [Define cache invalidation and freshness semantics for workspace discovery](https://github.com/artemVeduta/okf-agent-skills/issues/32). This resolution does not add network discovery, implicit repair, semantic merging, cross-repository writes, or product-specific concept frontmatter.
