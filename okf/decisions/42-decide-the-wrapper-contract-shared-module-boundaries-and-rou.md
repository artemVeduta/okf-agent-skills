---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/42
status: draft
type: Decision
---
# Decide the wrapper contract, shared module boundaries, and router dispatch

Status: closed.

## Parent

Part of #41 — [Spec: okf-agent-skills v0.1.0](https://github.com/artemVeduta/okf-agent-skills/issues/41).

## Question

What exactly does a harness adapter send to a skill wrapper script, what exactly comes back on stdout, what does each exit code mean, what public modules does `scripts/lib/` expose, how does the `okf` router dispatch, and what invocation class does each skill declare?

## Why this is a decision, not a build

This is the one contract seam the specification fixes, and none of its details are settled. Every slice from #4 onward asserts on it, so nothing downstream of the seam can start until it exists. The three slices that need none of it — #1, #2, #3 — are unblocked and can run alongside this.

Every row below is a declared open item in the specification. Section 11 states that an implementation agent MUST raise each one rather than choose a value — *“a plausible invented path or schema is the failure this specification exists to prevent.”* This ticket carries `wayfinder:grilling` for that reason: it is resolved by a human decision, not by an AFK agent picking defaults.

## Open items this closes

- [ ] The wrapper input protocol, stdout schema, exit-code contract, and error-stream contract — needed by adapter execution of the wrapper scripts — (#5)
- [ ] The interface by which a harness returns wrapper stdout to the model as a tool result in context — needed by adapter result handling — (#5)
- [ ] The public filenames and interfaces of the individual `scripts/lib/` shared modules — needed by wrapper scripts and by shared-module reuse across skills — (#5, #36)
- [ ] The router dispatch protocol and the router frontmatter — needed by the `okf` router skill — (#5)
- [ ] The invocation class and reach-clause requirement for each of `okf-read`, `okf-write`, `okf-lifecycle`, `okf-review`, and the `okf` router, including the invocation class of table effects marked not assigned — needed by skill frontmatter, adapter invocation translation, and static description tests — (#26, #5)

## Definition of done

- [ ] Every row above has an adopted value or an explicit deferral with its consequence stated.
- [ ] The decision is recorded so the tickets it unblocks can cite it rather than re-deriving it.
- [ ] No row is closed by observing that an implementation already chose a value.

## Blocked by

- None — can start immediately.

## Comment by artemVeduta

## Resolution

The human adopted this contract through a one-question-at-a-time grilling. It closes every open item listed in this ticket. It does not decide guard-store paths, operation-store schemas, adapter installation, or orientation schemas. Those remain with their owning tickets.

### Wrapper protocol

- Each wrapper reads exactly one UTF-8 JSON object from `stdin` and handles one request per process. `argv` is for process startup only. Environment variables do not carry semantic request data.
- The common envelope requires `protocol`, `skill`, `operation`, and `payload`. It may carry `task_kind`, `scope`, `target`, `settings`, `invocation`, and `brief`. Unknown top-level fields are rejected, and `skill` must match the wrapper.
- Each wrapper emits exactly one newline-terminated JSON object on `stdout`:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-read",
  "operation": "read",
  "result": "ok",
  "scope": {},
  "evidence_limits": [],
  "data": {},
  "findings": [],
  "next_action": null
}
```

- `result` uses the existing operation vocabulary. `data` carries operation-specific fields such as `match`, `coverage`, or a delegation receipt. Stdout contains no log text.
- Exit `0` means that one valid response was emitted, including `blocked`, `approval required`, `abstained`, and `failed/incomplete` results.
- Exit `64` means invalid wrapper input.
- Exit `70` means an internal or serialization failure. It still emits one complete response with `result: "failed/incomplete"` and a safe `RUNTIME_FAILURE` code in `data`.
- `stderr` carries concise diagnostics only for invalid input or internal failure. It is empty for valid domain responses and never carries a result, finding, approval, authority, concept content, secret, or stack trace.
- An adapter parses stdout and returns one native tool result with the same structured response. It may attach exit code and captured stderr as transport metadata, but it must not reinterpret shared decisions.

### Invocation and reach

- The invocation classes are `Model-invoked`, `User-invoked`, `Model-or-user-invoked`, `Inherited from parent`, and `Not invocable`.
- `Read, validate, or read-only analysis` is `Model-invoked`.
- Bounded notice effects are `Model-or-user-invoked`, while explicit task intent, the shared write runtime, and the guard remain required.
- Current-staleness reporting is `Model-invoked`.
- Evidence-based `stale_after` updates are `User-invoked`.
- Always-blocked effects are `Not invocable`.
- Existing manual-only effects remain `User-invoked`, and directly affected derived maintenance remains `Inherited from parent`.
- A router dispatch counts as skill-to-skill invocation. `okf-read`, `okf-write`, `okf-lifecycle`, and `okf-review` therefore have reach clauses. `okf` has no reach clause.
- `okf-read` is `Model-invoked`. `okf-write`, `okf-lifecycle`, and `okf-review` are `Model-or-user-invoked`. `okf` is `Model-or-user-invoked`; model use may prepare or route a request, but only the user path may confirm it.

### Shared modules and wrappers

The public shared modules are:

- `scripts/lib/protocol.js`: `parseRequest(text, expectedSkill)` and `serializeResponse(response)`.
- `scripts/lib/runtime.js`: `run(skill, request, services)`.
- `scripts/lib/admission.js`: `evaluate(request, services)`.
- `scripts/lib/validation.js`: `evaluate(request, context, services)`.
- `scripts/lib/lifecycle.js`: `plan(request, context, services)`.
- `scripts/lib/guard.js`: `prepare(request, plan, services)`, `confirm(request, token_id, attestation, services)`, and `execute(lease, request, services)`.

The modules use stateless CommonJS `.js` interfaces, plain records, and injected services. Expected refusals are structured results. No retrieval module or router policy module is added. Native concept navigation remains an adapter responsibility.

The five wrapper filenames are:

- `scripts/okf.js`
- `scripts/okf-read.js`
- `scripts/okf-write.js`
- `scripts/okf-lifecycle.js`
- `scripts/okf-review.js`

Incremental synchronization is orchestrated by `okf-lifecycle` and `scripts/lib/lifecycle.js`. Any actual concept mutation goes through `okf-write` and the shared guard. Automatic hooks do not write.

### Router dispatch

The router selects an owner only from the fixed `operation` field and a sealed operation table:

| Operations | Owner |
| --- | --- |
| `enumerate`, `search`, `read`, `validate` | `okf-read` |
| `create`, `revise`, `format`, `machine-verify`, `relationship`, `status`, `archive`, `move`, `rename`, `merge`, `split`, `delete` | `okf-write` |
| `init`, `sync`, `migrate`, `compact`, `rebuild` | `okf-lifecycle` |
| `review`, `staleness`, `human-verify`, `remove-verification`, `stale-after`, `trust`, `baseline`, `guard-state` | `okf-review` |

Preview, confirmation, and execution are router and guard phases, not child operations. An unknown operation returns a valid exit-`0` `blocked` response with `data.code: "UNKNOWN_OPERATION"`; an ambiguous table entry uses `AMBIGUOUS_OPERATION`. No child skill or fallback route runs.

The router calls `guard.prepare`, presents the complete preview and exact token, accepts confirmation only with the exact token and explicit attestation, calls `guard.confirm`, and then calls `guard.execute`. The owning skill runs only after fresh guard checks pass. A model may prepare but cannot confirm or execute its own request.

This resolution unblocks [Stand up the wrapper seam and its process-test harness, gated on .okf-active](https://github.com/artemVeduta/okf-agent-skills/issues/48).
