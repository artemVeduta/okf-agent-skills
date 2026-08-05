---
name: okf-lifecycle
description: Maintains OKF lifecycle synchronization and explicit reconciliation when another skill must invoke it.
---

# okf-lifecycle

`okf-lifecycle` owns exactly one operation in v0.1.0: `sync`. It runs two distinct kinds of work under that operation and never confuses them.

## Narrow sync vs. explicit reconciliation

Ordinary work triggers **incremental synchronization** automatically: `okf-lifecycle` updates the directly affected concepts, their declared review dependencies, and mechanical derivatives, with no manual gate. This is the only synchronization allowed to run unprompted.

Everything wider is **explicit reconciliation**, and a caller must ask for it by name. `okf-lifecycle` MUST NOT run a broad operation on an automatic trigger. A caller that asks for reconciliation by name gets one of exactly two scopes:

- **Diff-scoped reconciliation** runs pre-PR, over the current diff and its declared knowledge scope.
- **Full-project synchronization** is broad, manual, and recovery-gated.

Neither is a fallback for a narrow sync that returned less than the caller hoped for.

Completion criterion: sync is done when every directly affected concept, every declared review dependency, and every mechanical derivative in scope has been checked or updated — nothing wider and nothing narrower than what the trigger (automatic vs. explicit) authorizes.

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

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — an `abstained` result carrying an `INVALID_SCOPE` finding when the scope cannot be resolved is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, or a missing required `payload` key. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Effects this skill owns

`okf-lifecycle` owns one atomic effect: **Standalone broad rebuild**, a user-invoked action, never an automatic one.

It does not own the derived-maintenance effects that an ordinary `sync` triggers along the way — regenerating a directly affected index, appending a directly affected log entry, repairing a directly affected mechanical link. Those three belong to `okf-write`, inherited from the parent operation's outcome, even though `okf-lifecycle` is the skill a caller invokes to run `sync`.

## Procedure

1. Read the requested operation. `init`, `migrate`, and `compact` are not v0.1.0 operations: if the operation is not `sync`, stop and return the runtime's unknown-operation result. Done when that result is the only thing emitted for the request; not done if any payload has been built or any concept touched for a non-`sync` name.
2. Classify the trigger as automatic (ordinary work) or explicit (reconciliation requested by name). Done when the trigger class is fixed before any payload is built; not done if the class is still undecided or was inferred after the scope was chosen.
3. Build the wrapper request for the scope that trigger class authorizes: narrow for automatic sync, wider only for explicit reconciliation. Done when the request matches the shape above and its scope matches the trigger class from step 2; not done if the scope is wider than the trigger authorizes.
4. Run the `okf-lifecycle` wrapper and name the exit condition the call ended in. Done when the response is reported as a valid response (refusal included), invalid wrapper input, or an internal failure; not done while a refusal is being reported as a crash or a crash as a refusal.
