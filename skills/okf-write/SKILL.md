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

`okf-write` sends this request to `node <skill-root>/scripts/okf-write.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `ROOT_DECLARATION_NOT_EXACT`, `WRITE_TARGET_OUTSIDE_WORKTREE`, `TARGET_CHANGED`, or `EVIDENCE_UNAVAILABLE` is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, or a missing required `payload` key. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Delegation

The Procedure below covers a direct call. When another skill needs this write performed on its behalf rather than running `okf-write` directly, load [references/delegation.md](references/delegation.md) for the exact `okf-writer` brief shape `okf-delegate` requires and the `okf-delegation/1` receipt it returns.

## Effects this skill owns

`okf-write` performs each atomic effect below:

- Create a small evidence-backed concept
- Small evidence-backed claim update
- Small non-claim metadata or formatting update
- Add qualifying machine verification
- `draft -> stable`, `stable -> deprecated`, `deprecated -> stable`
- Add or remove one semantic relationship
- Move or rename
- Broad inbound-link or graph rewrite
- Create merge or split outputs
- Delete a demonstrably redundant concept
- Regenerate a directly affected index
- Append a directly affected log entry
- Repair a directly affected mechanical link

Each atomic effect below is owned here so that it is refused here: `okf-write` is the authority that catches the request, never the one that performs it.

- Add machine verification without complete qualifying evidence
- Write an unsupported status value
- Purge unique durable knowledge
- Introduce redirects or aliases before their semantics are defined
- Edit a sanctioned Attested Computation

## The bundle-root precondition

Decision D5 also bounds every write here: mutation requires a parsed bundle-root declaration of `okf_version: "0.2"`. `v0.1.0` never creates a bundle root — a developer authors that declaration by hand before any suite write can succeed, and no bootstrap exception exists.

## Procedure

1. **Identify the bounded operation.** Match the requested change to one of `create`, `revise`, `format`, `relationship`, or `machine-verify`. Done when the operation and its required payload keys (`cwd`, `bundle`, `concept`, plus the operation-specific key) are known; not done while the change could still map to more than one operation.
2. **Construct and send the wrapper request.** Build the JSON object shown above and pipe it to the `okf-write` wrapper. Done when the process exits and one of the three outcomes above has been observed and named; not done while the outcome is unnamed or a refusal is being treated as a crash.
3. **Reconcile every requested effect.** Walk the response and account for each requested effect as applied, refused (with its `data.code`), or not run because the process failed before reaching it. A bounded write is done only when every requested effect has one of those three dispositions — one unaccounted effect leaves the write unfinished.
