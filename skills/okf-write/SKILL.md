---
name: okf-write
description: Writes bounded OKF mutations when another skill must invoke it.
---

# okf-write

`okf-write` is the sole path for bounded mutations against an OKF bundle. It owns every write to bundle content — concepts, statuses, relationships, and machine verification — and native file tools (direct file writes, edits, shell redirection) never substitute for it: a change made outside this skill's wrapper is untracked and unverified.

## The wrapper request

`okf-write` constructs a request for its wrapper on `stdin`:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-write",
  "operation": "revise",
  "payload": {
    "cwd": "/path/to/repo",
    "bundle": "bundle-name",
    "concept": "concept-id",
    "evidence": {}
  }
}
```

`protocol` is always the literal `okf-wrapper/1` and `skill` is always the literal `okf-write`. `operation` names one of the five bounded operations this skill performs: `create`, `revise`, `format`, `relationship`, `machine-verify`. Every one of these is bounded, so `payload` always carries non-empty `cwd`, `bundle`, and `concept`, plus whatever keys the operation itself needs — `evidence` for a claim or verification write, `effects` for a relationship change, `set` for a status or field change.

## Three outcomes, not two

A wrapper call ends one of three ways, and telling them apart is how a caller decides what to do next:

- **A response is emitted.** Exit code 0, one JSON line on stdout. This includes a refusal — a `blocked` result carrying a `data.code` such as `ROOT_DECLARATION_NOT_EXACT`, `WRITE_TARGET_OUTSIDE_WORKTREE`, `TARGET_CHANGED`, or `EVIDENCE_UNAVAILABLE` is a completed answer, not a crash.
- **The wrapper input was invalid.** Malformed JSON, a wrong `skill` field, a missing `operation`, or a bounded operation missing `payload.cwd`, `payload.bundle`, or `payload.concept`. Nothing is written to stdout; a short diagnostic goes to stderr; exit code 64.
- **The runtime failed internally after a valid request parsed.** The wrapper still emits one complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) on stdout, writes a `Runtime failure: ...` line to stderr, and exits 70.

## Delegation

The Procedure below covers a direct call. When another skill needs this write performed on its behalf rather than running `okf-write` directly, load [references/delegation.md](references/delegation.md) for the exact `okf-writer` brief shape `okf-delegate` requires and the `okf-delegation/1` receipt it returns.

## Effects this skill owns

`okf-write` performs every atomic effect below, and none of the effects that belong to `okf-read` (read-only analysis), `okf-review` (verification and staleness), or `okf-lifecycle` (standalone broad rebuild):

- Create a small evidence-backed concept
- Small evidence-backed claim update
- Small non-claim metadata or formatting update
- Add qualifying machine verification
- Add machine verification without complete qualifying evidence
- `draft -> stable`, `stable -> deprecated`, `deprecated -> stable`
- Write an unsupported status value
- Add or remove one semantic relationship
- Move or rename
- Broad inbound-link or graph rewrite
- Create merge or split outputs
- Delete a demonstrably redundant concept
- Purge unique durable knowledge
- Introduce redirects or aliases before their semantics are defined
- Edit a sanctioned Attested Computation
- Regenerate a directly affected index
- Append a directly affected log entry
- Repair a directly affected mechanical link

## Not a v0.1.0 operation

`init`, `migrate`, and `compact` are not `v0.1.0` operations. A request naming one of these takes the runtime's unknown-operation result and is refused cleanly — this skill does not improvise a substitute effect for an operation it does not perform.

Decision D5 also bounds every write here: mutation requires a parsed bundle-root declaration of `okf_version: "0.2"`. `v0.1.0` never creates a bundle root — a developer authors that declaration by hand before any suite write can succeed, and no bootstrap exception exists.

## Procedure

1. **Identify the bounded operation.** Match the requested change to one of `create`, `revise`, `format`, `relationship`, or `machine-verify`. Done when the operation and its required payload keys (`cwd`, `bundle`, `concept`, plus the operation-specific key) are known; not done while the change could still map to more than one operation.
2. **Construct and send the wrapper request.** Build the JSON object shown above and pipe it to the `okf-write` wrapper. Done when the process exits and one of the three outcomes above has been observed and named.
3. **Reconcile every requested effect.** Walk the response and account for each requested effect as applied, refused (with its `data.code`), or not run because the process failed before reaching it. A bounded write is done only when every requested effect has one of those three dispositions — one unaccounted effect leaves the write unfinished.
