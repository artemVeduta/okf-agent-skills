---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/132
status: draft
type: Research
---

# Research: Read delegation through the delegation bridge

Status: source GitHub issue closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

How does OKF read delegation work, matching the write delegation model? The decision: read actions go through the delegation bridge the same way write actions do.

Research scope:
1. How does `scripts/lib/delegation.js` validate a delegation brief? What fields are required?
2. How does `scripts/adapter-bridge.js` spawn a wrapper process for `okf-write`? What changes for `okf-read`?
3. What does `scripts/okf-delegate.js` do? What receipt shape does it return?
4. What is the `okf-read` wrapper current behavior vs behavior under delegation?
5. How does the spec narrowing from issue #91 and #97 affect read delegation?

Primary sources: `scripts/lib/delegation.js`, `scripts/adapter-bridge.js`, `scripts/okf-delegate.js`, `scripts/okf-read.js`, `skills/okf-read/SKILL.md`.

Output: a concrete read delegation contract — what the brief looks like, what the receipt carries, and how read operations route through the bridge.

## Comment by artemVeduta

## Resolution — read delegation contract for `/okf-setup`

Research covered `scripts/lib/delegation.js`, `scripts/adapter-bridge.js`, `scripts/okf-delegate.js`, `scripts/okf-read.js`, `scripts/wrapper.js`, `scripts/lib/protocol.js`, `scripts/lib/runtime.js`, `scripts/lib/routing.js`, `scripts/lib/navigation.js`, `skills/okf-read/SKILL.md`, `agents/okf-reader.md`, the #68 delegation tests/design, and the #91/#97 narrowing.

## Executive decision

Delegated OKF reads use the **same delegation gate as writes**: a caller sends an immutable `okf-reader` brief to `scripts/okf-delegate.js`; that gate validates/narrows the brief, converts it to an ordinary `okf-wrapper/1` request for `okf-read`, dispatches the existing wrapper, and returns one delegation receipt.

Do **not** create a second read-specific runtime or bypass brief validation by invoking `okf-read.js` directly from a delegated worker.

Two current seams must not be conflated:

- `scripts/adapter-bridge.js` is the harness adapter bridge. Today it directly spawns only `okf-read.js` or `okf-write.js` and inherits stdin/stdout.
- `scripts/okf-delegate.js` is the delegation gate. It validates a delegation brief and then `spawnSync`s the selected sibling wrapper.

For setup, “through the delegation bridge” means the delegated path must pass through `okf-delegate.js`. If a harness adapter is the ingress, the implementation must intentionally make that gate reachable; the current adapter bridge is not sufficient.

## 1. Current brief validation

`delegation.js` has 12 required fields:

```text
role
task_kind
operation_class
cwd
bundle
paths
allowed_effects
forbidden_effects
evidence
required_checks
settings
expected_result
```

`changes` is **not** one of those 12 required fields. For `okf-writer` it must be non-empty. For `okf-reader` it must be absent or empty. The clean reader contract is therefore: **omit `changes`**.

Additional current gates:

- `role` must be `okf-reader` or `okf-writer`.
- `paths` must contain exactly one non-empty string.
- `settings.read_execution` and `settings.write_execution` must each be `inline | delegated`.
- `allowed_effects` may be empty for the reader; the writer requires it non-empty.
- an effect cannot appear in both allowed and forbidden lists.
- a reader cannot request any effect in the runtime write-effect set.
- operation ownership is checked against the runtime router table; `orient` is explicitly rejected from delegation.

Current validation is incomplete as a type boundary: several list-shaped fields are checked for presence/non-emptiness but not consistently checked as arrays before list methods are used. Implementation should make malformed list/object shapes produce a normal `blocked: incomplete-brief`/`conflicting-rules` receipt, never `DELEGATION_INTERNAL_FAILURE`.

## 2. Concrete reader brief

For `/okf-setup`, delegated reader scope should remain deliberately narrow: **`read` and `search` only**. `resolve`, `enumerate`, `validate`, `orient`, and unknown operations are not needed for the setup worker contract and should not be accidentally widened into it.

Example read brief:

```json
{
  "role": "okf-reader",
  "task_kind": "setup-migration",
  "operation_class": "read",
  "cwd": "/repo",
  "bundle": "/repo/okf",
  "paths": ["decisions/example"],
  "allowed_effects": [],
  "forbidden_effects": [
    "concept-create",
    "concept-revise",
    "format",
    "relationship",
    "machine-verify",
    "index-maintenance",
    "log-append"
  ],
  "evidence": ["<caller-observed evidence/reference>"],
  "required_checks": ["admission", "navigation-scope"],
  "settings": {
    "read_execution": "delegated",
    "write_execution": "delegated"
  },
  "expected_result": "read admitted OKF concept"
}
```

For search, only these values change:

```json
{
  "operation_class": "search",
  "paths": ["<query>"]
}
```

`paths[0]` remains the single carrier because #91/#97 explicitly preserved the existing brief field set. Do not introduce a parallel `target`/`query` brief schema just for setup.

`settings` remains a required **inert forward seam**. `read_execution: delegated` documents caller intent but does not route anything. The caller chooses delegation by invoking the delegation gate. Do not implement settings precedence/defaults as part of #129 unless that open design is separately settled.

## 3. Brief -> wrapper request

Current `buildRequest()` already has the right read/search lowering:

### read

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-read",
  "operation": "read",
  "task_kind": "setup-migration",
  "invocation": "explicit",
  "payload": {
    "cwd": "/repo",
    "bundle": "/repo/okf",
    "target": "decisions/example"
  }
}
```

### search

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-read",
  "operation": "search",
  "task_kind": "setup-migration",
  "invocation": "explicit",
  "payload": {
    "cwd": "/repo",
    "bundle": "/repo/okf",
    "query": "<query>"
  }
}
```

No read-specific runtime is needed. `okf-read.js` and `okf-write.js` are already symmetric one-line entry points into `wrapper.main(...)`, and the runtime router already owns `read`/`search` under `okf-read`.

## 4. Current adapter bridge behavior

`adapter-bridge.js` already maps both:

```text
okf-read  -> okf-read.js
okf-write -> okf-write.js
```

It validates `(harness, skill)`, then runs:

```text
node <wrapper>
```

with inherited stdio. There is therefore **no missing read-vs-write parity in direct wrapper spawning**.

The actual gap is delegation reachability: #91/#97 deliberately established and test that `adapter-bridge.js` rejects `okf-delegate` with exit 64, no harness installs a delegated agent definition, and `brief.settings` selects no placement. That narrowing remains true today.

Consequently, `/okf-setup` cannot claim fresh-context delegated reads merely because `adapter-bridge.js` knows `okf-read`.

## 5. `okf-delegate.js` behavior

The delegation gate:

1. reads one JSON brief from stdin;
2. parses it;
3. runs `delegation.validateBrief`;
4. lowers a valid brief to `okf-wrapper/1`;
5. `spawnSync`s `scripts/<skill>.js` with the request JSON on stdin;
6. parses the child wrapper response;
7. rejects missing/incompatible child responses;
8. emits one `okf-delegation/1` receipt;
9. never automatically retries an interrupted/indeterminate dispatch.

This is a **process seam**, not a fresh-context sub-agent mechanism. #68/#91 are explicit about that distinction. Setup’s fresh-context worker creation must be supplied by harness/agent orchestration; the delegation process seam is then the guarded OKF I/O path used inside/for that delegated work.

## 6. Critical current defect: read data is discarded

Current `delegation.receipt()` is write-shaped. It carries:

```text
protocol
receipt
role
status
operation_identity
target
requested_effects
actual_effects
evidence
validation
residue
disclosures
findings
next_action
```

For a write, those projected fields describe the mutation outcome.

For a read/search, the underlying `okf-read` wrapper returns the useful navigation result in `response.data` — including fields such as `match`, `scope`, `found`, `read`, `coverage` (and the concept content inside `read`). **The receipt does not copy `response.data`.**

The existing #68 delegated-read test only proves dispatch/status/finding parity (`unavailable` in its fixture). It does not prove result-data parity. A successful delegated read can therefore reach `okf-read` and still return a receipt that contains no content/hits to its caller.

This must be fixed before #129 can depend on delegated reads.

## 7. Receipt contract for delegated reads

Keep one shared delegation receipt model. Add a lossless wrapper-result payload field:

```json
{
  "protocol": "okf-wrapper/1",
  "receipt": "okf-delegation/1",
  "role": "okf-reader",
  "status": "ok",
  "operation_identity": {
    "operation": "read",
    "task_kind": "setup-migration",
    "role": "okf-reader"
  },
  "target": {
    "bundle": "/repo/okf",
    "cwd": "/repo",
    "concepts": ["decisions/example"]
  },
  "requested_effects": [],
  "actual_effects": [],
  "data": {
    "match": "found",
    "scope": {},
    "found": [],
    "read": [],
    "coverage": "complete"
  },
  "evidence": [],
  "validation": null,
  "residue": [],
  "disclosures": {
    "writes": "none",
    "crash_recovery": "not applicable",
    "retry": "not automatic"
  },
  "findings": [],
  "next_action": null
}
```

`data` is the underlying wrapper `response.data` **unchanged**. Do not reinterpret, summarize, or rebuild navigation records in the delegation layer. This preserves read/search semantics and keeps the runtime as the single authority.

For compatibility, the same shared receipt builder can expose `data` for writers too; existing projected write fields remain authoritative/convenient. Documentation/tests that currently call the receipt field list “exact” must be updated with this additive field.

Reader status preserves normal `okf-read` navigation outcomes (`ok`, `degraded`, `not-configured`, `unavailable`) plus delegation-gate outcomes (`blocked: incomplete-brief`, `blocked: conflicting-rules`, `blocked: missing-skill`, `blocked: incompatible-skill`, `indeterminate`).

## 8. Operation narrowing

Current validation has two leaks that setup should not rely on:

1. router-owned reader operations beyond `read`/`search` can pass brief validation;
2. an operation absent from the router table can pass validation and fail later at the wrapper as unknown operation.

There is also a concrete asymmetry: `resolve` can pass delegation ownership validation, but `buildRequest()` does not populate its required `payload.target`; dispatch then fails at the wrapper boundary and becomes `indeterminate` instead of a clean delegation refusal.

For #129, make reader operation authorization explicit at the delegation gate:

```text
okf-reader delegated operation classes = { read, search }
```

Anything else blocks before dispatch. This is a narrowing, not a new capability.

## 9. #91 / #97 narrowing remains binding

Do not regress the settled v0.1.0 facts:

- current installed adapters do not make delegated agents reachable;
- `adapter-bridge.js` currently rejects `okf-delegate`;
- the agent definitions are not themselves permission/authority;
- `brief.settings` is validated but inert;
- no precedence chain/default resolver is shipped;
- `okf-delegate.js` process spawning is not itself a harness-native sub-agent/fresh-context mechanism.

`/okf-setup` is allowed to intentionally implement a later reachable delegation path, but it must do so explicitly. It cannot reinterpret the old manifest `bridge` metadata or settings field as already-active behavior.

## 10. Setup architecture consequence

Required topology:

```text
/okf-setup coordinator
  -> harness creates fresh-context worker(s)
      -> worker/caller submits bounded okf-reader brief
          -> reachable delegation ingress
              -> scripts/okf-delegate.js
                  -> validate/narrow brief
                  -> scripts/okf-read.js
                      -> shared wrapper/runtime/admission/navigation
                  <- okf-wrapper/1 response with data
              <- okf-delegation/1 receipt with data
      <- worker result
  -> coordinator assembles migration plan/shards
```

The same ingress/gate serves `okf-writer`. Do not build a second read bridge.

## 11. Implementation/test consequences

A later implementation ticket should cover at least:

1. make `okf-delegate` intentionally reachable from the setup/harness delegation path, without bypassing brief validation;
2. keep fresh-context worker creation separate from the process seam;
3. restrict delegated reader operations to `read | search`;
4. harden brief field types so malformed lists/objects block cleanly;
5. preserve the existing 12 required brief fields and omit reader `changes`;
6. keep `settings` validated/inert unless separately specified;
7. add `response.data` passthrough to the shared delegation receipt;
8. make reader disclosures truthfully say no writes;
9. test inline-vs-delegated **data parity** for both successful `read` and `search`, not only status/finding parity;
10. test that `resolve`, `enumerate`, `validate`, `orient`, writer operations, and unknown operations block before reader dispatch;
11. test direct `okf-read` invocation is not substituted where a delegation receipt is required.

## Final contract

> `/okf-setup` delegates OKF read/search work with the existing immutable 12-field brief, `role: okf-reader`, exactly one `paths` entry, no `changes`, no allowed write effects, and explicit forbidden write effects. The caller chooses delegated placement explicitly; `brief.settings` remains inert. A reachable delegation ingress sends the brief through `scripts/okf-delegate.js`, which validates/narrows it and dispatches the existing `okf-read.js` wrapper. The receipt preserves normal read/search status, findings, and the underlying wrapper `data` losslessly, with no actual effects. Fresh-context worker creation is a harness/orchestration responsibility; process spawning in `okf-delegate.js` is only the guarded OKF I/O seam. No separate read runtime or direct-wrapper bypass is introduced.
