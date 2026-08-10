---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/38
status: draft
type: Decision
---
# Decide inline versus sub-agent OKF maintenance and .okf-* settings

Status: closed.

Part of [Ship a production-ready cross-harness OKF skill suite](https://github.com/artemVeduta/okf-agent-skills/issues/1).

This decision blocks [Write the implementation-ready product specification](https://github.com/artemVeduta/okf-agent-skills/issues/8).

## Question

For in-session OKF reads and bounded writes, when should work stay inline in the main agent context, when may it use a sub-agent, and which user-editable `.okf-*` settings may change that behavior for the current session?

The decision must settle the inline and sub-agent responsibilities, whether a sub-agent may write durable OKF content or only return a proposal, defaults and per-session overrides, settings scope and precedence, and failure handling.

Do not let settings override project mode, trust, access, write authority, approval, recovery, the automatic-write ceiling, `.okf-active`, or `.okf-workspace.json`. Retain the settled rule that automatic hooks are read-only and mutation requires explicit intent and the shared guard.

## Comment by artemVeduta

## Resolution

For `v0.1.0`, in-session OKF reads and bounded writes may run inline in the main session or through an explicitly created sub-agent. A sub-agent may read and write durable OKF content. Delegation changes execution placement only; it never changes project mode, bundle admission, trust, access, write authority, approval, recovery, `.okf-active`, `.okf-workspace.json`, the automatic-write ceiling, or the shared manual-operation guard.

### Placement

| Work | Default | Delegated role | Rule |
| --- | --- | --- | --- |
| Orientation and small read-only work | `inline` | none for automatic hooks | Automatic hooks remain bounded and read-only. |
| Explicit read-only retrieval or analysis | `inline` | `okf-reader` | Delegation is allowed when the effective preference and brief select it. |
| Explicit bounded OKF write | `delegated` | `okf-writer` | Inline execution remains available when the effective preference explicitly selects it. |
| Lifecycle, migration, compaction, archive, merge, split, relocation, delete, and other broad operations | separate manual flow | not covered by this writer contract | Existing preview, approval, recovery, guard, and reconciliation rules apply. |

Both preferences use the same enum:

```yaml
read_execution: inline | delegated
write_execution: inline | delegated
```

The defaults are `read_execution: inline` and `write_execution: delegated`. `delegated` reads use `okf-reader`; `delegated` writes use `okf-writer`. Delegation is a required capability of every supported harness. A missing or mismatched agent installation is an adapter or installation failure, not a normal silent fallback mode.

### Agent package

- The release ships one canonical `agents/` source folder alongside `skills/`.
- `okf-reader` declares `use skill /okf-read`.
- `okf-writer` declares `use skill /okf-write`.
- Claude Code, Codex, and OpenCode expose thin native wrappers around the same agent contract.
- `okf-reader` is read-only. `okf-writer` is the only write-capable sub-agent.
- Each agent declares an explicit tool allowlist. The reader has native read and search tools. The writer has native read and search tools plus the shared guarded write runner.
- Neither role has raw file-write, Git-history, network, or nested-agent authority by default.
- Agent definitions are inert release artifacts. Installation may register them, but it does not invoke a writer, create `.okf-active`, create settings, or grant authority.
- The main session creates the selected agent directly. `okf-writer` is a leaf agent and cannot create another sub-agent.
- All harnesses expose the same roles, skill bindings, brief fields, guard requirements, receipt schema, and status values. Native transport and presentation may differ.

### Delegation brief

The main session must create every delegated operation with an immutable delegation brief. The minimum brief contains the task kind, operation class, exact target bundle and paths, allowed effects, forbidden effects, observed evidence, required approval and guard checks, effective settings, and expected result. The brief is a request and constraint set; it is not approval or authority.

The precedence order is:

```text
shared safety and authority rules > shipped agent rules > per-call delegation brief
```

The brief may narrow shipped rules, but cannot widen scope, remove a check, or authorize a forbidden effect. Missing, ambiguous, or conflicting instructions return `blocked: incomplete-brief` or `blocked: conflicting-rules`; the agent does not guess.

The main session resolves the effective settings, classifies the operation, and owns the user-facing request. The writer verifies the operation class and blocks a mismatch; it cannot downgrade a broad effect to a bounded update. Creating a writer is not approval. Model-initiated work may read or prepare a preview, but mutation requires explicit user intent and the applicable approval and guard gates.

The handoff is bounded. It carries the effective brief, admitted scope, target identities, observed evidence, settings, required gates, and receipt format, not the full conversation history. The writer rechecks the marker, routing, admission, target identity, current content, evidence, operation class, and guard state before execution. A stale handoff or unexpected target change returns `blocked: stale-handoff` or `blocked: target-conflict`.

### Write authority

- Every mutation uses the shared `okf-write` runtime and manual-operation guard. Native tools cannot replace that path.
- The writer may read admitted files and source evidence, but it may write only approved OKF targets and allowed derived artifacts.
- The writer cannot edit source code, commit, push, reset, stash, switch branches, or change unrelated files.
- The writer operates in the exact repository instance and worktree named by the brief. A different instance returns `blocked: repository-instance-mismatch`.
- Only one active guarded writer operation may run for a bundle. Independent bundles may run in parallel when their guards permit it.
- Cross-repository writes are allowed only when exact target-side foreign-write authority already exists for the named source instance, target bundle, and effects. Delegation cannot create or widen that authority.
- The main session or user owns approval. A writer may prepare a complete preview and verify approval, but cannot self-approve.
- Preview, approval, and execution remain bound to one operation identity, bundle epoch, and guard generation. A new writer, session boundary, target change, or preview drift requires a fresh plan and approval.
- Writer execution is synchronous from the main session view. A later user request cannot change an active brief; it starts a new operation.

### Result and failure behavior

The writer returns a structured delegation receipt containing status, operation identity, target identity, requested effects, actual effects, observed evidence, validation result, residue, and next action. The receipt does not replace the sealed operation manifest or observation journal.

The main session validates the receipt and required post-operation checks before reporting success. It reports exact outcomes such as `clean`, `failed`, `partially-applied`, or `indeterminate`; process completion alone is not success.

- Missing required skill: `blocked: missing-skill`.
- Incompatible required skill: `blocked: incompatible-skill`.
- Missing or invalid brief: `blocked: incomplete-brief`.
- Conflicting rules: `blocked: conflicting-rules`.
- Target or evidence drift: `blocked: stale-handoff` or `blocked: target-conflict`.
- Missing foreign-write authority: `blocked: missing-foreign-write-authority`.
- Writer timeout, crash, or interruption: `indeterminate`; no automatic write retry.
- Partial effects: `partially-applied` or `indeterminate`; reconciliation is a fresh guarded operation.
- A transient delegated read failure may fall back to the same bounded read inline with a `degraded` disclosure. This is not a capability or authority fallback.

### Settings

Settings control execution preferences only. They cannot alter project mode, trust, access, admission, authority, approval, recovery, guard behavior, automatic-hook read-only behavior, or the write ceiling.

The precedence is:

```text
adapter defaults < user/global settings < project/worktree settings < current-session override
```

The current-session override expires at session end. `.okf-active` and `.okf-workspace.json` are not general settings and remain outside this hierarchy. Settings are user-authored and suite-read-only: the suite reads and validates them but never creates, repairs, normalizes, or rewrites them. Invalid or unknown values produce a diagnostic and use the next valid lower-precedence value or adapter default. An invalid writer selection cannot silently start a different writer; an explicit write must select a valid execution path.

### Acceptance evidence

`v0.1.0` must include deterministic fixtures for inline and delegated reads, inline and delegated writes, role and tool allowlists, skill binding, brief precedence, incomplete and conflicting briefs, operation-class mismatch, stale handoff, target drift, per-bundle writer locking, same-worktree checks, approval and guard enforcement, structured receipts, partial and indeterminate outcomes, settings precedence, invalid settings, and semantic parity across all three native wrappers. Live cross-harness process tests remain deferred to `v0.2.0`.

This resolution preserves the settled `.okf-active` activation marker, bounded read-only orientation, thin adapter ownership, explicit mutation intent, shared guard, and non-overridable authority rules.
