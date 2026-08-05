---
name: okf-lifecycle
description: Maintains OKF lifecycle synchronization and explicit reconciliation when another skill must invoke it.
---

# okf-lifecycle

`okf-lifecycle` owns exactly one operation in v0.1.0: `sync`. It runs two distinct kinds of work under that operation and never confuses them.

## Narrow sync vs. explicit reconciliation

Ordinary work triggers **incremental synchronization** automatically: `okf-lifecycle` updates the directly affected concepts, their declared review dependencies, and mechanical derivatives, with no manual gate. This is the only synchronization allowed to run unprompted.

Everything wider is **explicit reconciliation**, and a caller must ask for it by name:
- **Diff-scoped reconciliation** runs pre-PR, over the current diff and its declared knowledge scope.
- **Full-project synchronization** is broad, manual, and recovery-gated.

`okf-lifecycle` MUST NOT run a broad operation on an automatic trigger — narrow sync stays narrow unless a caller explicitly requests the wider scope.

Completion criterion: sync is done when every directly affected concept, every declared review dependency, and every mechanical derivative in scope has been checked or updated — nothing wider and nothing narrower than what the trigger (automatic vs. explicit) authorizes.

## init, migrate, and compact are not v0.1.0 operations

These three names are not valid `operation` values for `okf-lifecycle` in this release. A request naming any of them gets the runtime's unknown-operation result — a clean refusal, not an improvised attempt to run them.

## The wrapper request

For `sync`, `okf-lifecycle` constructs:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-lifecycle",
  "operation": "sync",
  "payload": {
    "cwd": "<absolute working directory>",
    "bundle": "<bundle identifier>",
    "concept": "<concept identifier>"
  }
}
```

`sync` is a bounded operation: `payload.cwd`, `payload.bundle`, and `payload.concept` are all required, non-empty strings, and a request missing any of them fails before the runtime ever sees it.

## Three exit conditions

A caller distinguishes exactly three outcomes:

1. **Valid response emitted.** Exit code 0, one JSON line on stdout. A refusal — for example an `abstained` result carrying an `INVALID_SCOPE` finding when the scope cannot be resolved — is a completed, valid answer here, not a failure.
2. **Invalid wrapper input.** The request never parsed (bad JSON, wrong `skill`, missing `operation`, or a missing bounded-payload field). Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed but the runtime threw. One complete `failed/incomplete` response with `data.code: "RUNTIME_FAILURE"` still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Effect ownership

`okf-lifecycle` owns one atomic effect: **standalone broad rebuild**, a user-invoked action, never an automatic one.

It does not own the derived-maintenance effects that an ordinary `sync` triggers along the way — regenerating a directly affected index, appending a directly affected log entry, repairing a directly affected mechanical link. Those three belong to `okf-write`, inherited from the parent operation's outcome, even though `okf-lifecycle` is the skill a caller invokes to run `sync`. `okf-lifecycle` also does not own any read-only-analysis effect or any verification/staleness effect — those sit with `okf-read` and `okf-review` respectively.

## Steps

1. Read the requested operation. If it is not `sync`, stop and return the unknown-operation result. Done when that result is the only thing emitted for the request.
2. If it is `sync`, classify the trigger as automatic (ordinary work) or explicit (reconciliation requested by name). Done when the trigger class is fixed before any payload is built.
3. Build the wrapper request for the scope that trigger class authorizes: narrow for automatic sync, diff-scoped or full-project only for explicit reconciliation. Done when the request matches the shape above and its scope matches the trigger class from step 2.
4. Dispatch through `okf-delegate` rather than allowlisting the `okf-lifecycle` wrapper directly — only `okf-delegate` validates the brief before dispatching, and the direct wrapper path returns a raw response where a receipt is required. Done when a receipt covering `status`, `actual_effects`, and `next_action` has reached the caller.
