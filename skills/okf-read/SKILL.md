---
name: okf-read
description: Reads, validates, and analyses admitted OKF bundles without mutating them, when another skill must invoke it.
---

# okf-read

Safe inspection of an admitted OKF bundle. `okf-read` never writes, never transitions lifecycle state, and never records review evidence — it only reads, validates shape, or performs read-only analysis.

## Navigation path

`okf-read` walks a fixed three-level path: the bundle-root index, then the directory index for the concept's location, then the concept body itself. Each step is a plain file read through the harness's own file tools, and the LLM chooses which entry to descend into by reading the index content in front of it — no retrieval machinery of any kind sits behind this skill. If a target cannot be resolved this way, that is a normal `resolve` or `read` result to report, not an internal failure.

## Wrapper request

`okf-read` constructs one JSON object per call:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-read",
  "operation": "read",
  "payload": { "cwd": "<working directory>", "target": "<path or id>" }
}
```

`protocol` and `skill` are always the literal strings above; `operation` and the required `payload` keys change per call:

- `enumerate` — `payload` an object; no further key is required.
- `validate` — `payload.cwd`, plus at least one of `payload.bundle` or `payload.candidates`.
- `resolve` — `payload.target`.
- `read` — `payload.cwd` and `payload.target`.
- `search` — `payload.cwd` and `payload.query`.
- `orient` — `payload.cwd`, `payload.harness`, `payload.context_id`, and `payload.logical_cause`.

Any request missing a required key for its operation, or carrying the wrong `skill` value, is invalid input and never reaches the runtime.

`okf-read` runs this request through `node <skill-root>/scripts/okf-read.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked`, `not-configured`, or `unavailable` result means the read was attempted and the answer is "no."
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, or a missing required `payload` key. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Delegation

The Procedure below covers a direct call. When another skill delegates read work instead of running `okf-read` directly, the call goes to the `okf-delegate` entry point with `role: "okf-reader"` and no `changes` key, and it returns one `okf-delegation/1` receipt in place of a bare wrapper response. Allowlisting the `okf-read` wrapper directly skips brief validation and hands back that bare response where a receipt was expected.

## Effects this skill owns

`okf-read` owns exactly one atomic effect: **Read, validate, or read-only analysis**.

## Procedure

1. Build the wrapper request with `protocol`, `skill`, `operation`, and exactly the payload keys that operation requires. Done when the object matches the shape above; not done if a required key is missing.
2. Run the wrapper and classify the outcome as one of the three exit conditions before reporting it. Done when the report names a valid response (refusal or not), invalid wrapper input, or an internal failure; not done while a refusal is being reported as a crash.
3. For a `resolve` or `read` outcome, walk the three levels above — bundle-root index, then the directory index for the concept's location, then the concept body — choosing each entry by reading the index content in front of you. Done when the concept's content is in hand; not done if no bundle root resolves, no index entry matches, or the path does not exist under the bundle root, each of which is reported as a `resolve` or `read` result rather than a thrown error.
