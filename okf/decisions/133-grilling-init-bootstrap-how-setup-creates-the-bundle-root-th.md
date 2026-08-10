---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/133
status: draft
type: Decision
---
# Grilling: Init bootstrap — how /setup creates the bundle root through the write gate

Status: This decision is closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

How does `/setup` create the first bundle root `index.md` with `okf_version: "0.2"` when the write gate requires that exact declaration to permit any write? This is the core chicken-and-egg problem.

Decision already made: auto-bootstrap — the user does not hand-author the bundle root, `/setup` creates it.

Open: the mechanism. Options to grill through:
- A new `init` operation with a bootstrap exception to the write gate
- A two-phase approach: a special init mode that bypasses the write gate for the first file only, then reverts to normal
- Relaxing the write gate for a bundle that does not yet exist
- A separate bootstrap protocol that is not a write operation at all

The write gate today: `scripts/lib/runtime.js` enforces `okf_version: "0.2"` at the bundle root before any mutation. The spec (D5) explicitly deferred the bootstrap exception and states "v0.1.0 never creates a bundle root."

## Blocked by

- [Research: OKF bundle data model — for code-backed and knowledge-only projects](https://github.com/artemVeduta/okf-agent-skills/issues/130) — need to know what init writes before deciding how

## Comment by artemVeduta

## Resolution

The bootstrap mechanism for `/setup` creating the bundle root through the write gate.

**`init` operation:**
- New entry in the sealed router (`scripts/lib/runtime.js`); primary effect `init`, derived effects none
- Goes through the write gate pipeline: ownership (same git repo), admission (REACH + TRUST + ACCESS, skip PRESENCE — no bundle yet), skip evidence (nothing to cite), then `evaluateInit`
- `evaluateInit` validates: parent directory writable, root `index.md` not already valid, round-trip parse-tree match via canonical YAML writer
- Writes `index.md` with `okf_version: "0.2"` and optionally `project_mode: "<mode>"`
- Idempotent: overwrites if `okf_version` is wrong/absent/missing; no-op if already valid
- `project_mode` can be added via a second init call — init merges new keys with existing valid root
- Forbidden effects (`deprecate`, `move`, `rename`, `rewrite`, `delete`, `status`, `redirect`, `alias`, `purge`) remain forbidden; init is not combinable with other effect types

**`/setup` orchestration:**
1. Inspect current state of three config files → structured report per file (`ok`, `missing`, `invalid (<reason>)`)
2. User consent to repair/create all needing repair
3. `init` (through write gate) → `index.md` with `okf_version: "0.2"`
4. If `project_mode` unknown at this point → ask user ("code-backed" or "knowledge-only") → `init` again with mode
5. `touch .okf-active` — plain filesystem action, not an OKF operation (zero-byte file at git root)
6. Generate/repair `.okf-workspace.json` — plain filesystem action. For invalid existing manifest: report validation error, offer to regenerate template adjusting salvageable previous values, require user approval before overwrite. For single-bundle projects template is deterministic (repo name = directory basename, bundle alias/root = okf, mode: source, fresh UUIDv4). For detected monorepo: warn user, offer singe-project template or manual monorepo manifest.
7. Migration of concepts per #131 contract
8. Global validation → publish

**Not in scope for bootstrapping:**
- Init never touches concept files; it only creates/repairs `index.md`
- `.okf-active` and `.okf-workspace.json` are `/setup`-level plain-fs actions, not OKF operations
- No atomic writes, no journal, no checkpoint — if prior setup crashed, inspect state → repair → continue

**Spec impact:**
- The open-item row "New-bundle write-gate bootstrap exception" (Deferred, D5) is resolved by this decision
- Only `/setup` (explicit user-initiated bootstrap) may create `.okf-active` and `.okf-workspace.json`; installers, adapters, session entry, and delegation still must not
- `project_mode` remains on root `index.md` alongside `okf_version` — no separate carrier file for v0.2

**Test coverage** (flow tests for `init`):
- Happy path: init on clean repo → `index.md` with `okf_version` + `project_mode`
- Reject: init when valid `index.md` already exists
- Reject: init when `okf/` directory exists but `index.md` absent
- Reject: init outside a git repo (ownership gate)
- Reject: init to read-only directory (REACH gate)
- Reject: init to untrusted repo (TRUST gate)
- Round-trip: init writes, post-write re-reads, confirms parse-tree match
- Precondition chain: after init succeeds, normal `create` passes the full write gate
