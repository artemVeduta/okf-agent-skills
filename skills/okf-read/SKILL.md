---
name: okf-read
description: Reads admitted OKF bundles by walking the bundle-root index, directory index, and concept body through harness-native file tools, when another skill must invoke it.
---
# okf-read

Safe inspection of an admitted OKF bundle. `okf-read` never writes, never transitions lifecycle state, and never records review evidence — it only reads, validates shape, or performs read-only analysis.

## Navigation path

`okf-read` walks a fixed three-level path: the bundle-root index, then the directory index for the concept's location, then the concept body itself. Each step is a plain file read through the harness's own file tools, and the LLM chooses which entry to descend into by reading the index content in front of it. There is no matcher, ranking, embedding store, tokenizer, budget, reserve, tier, or retrieval ledger anywhere in this skill — none exist, and none should be assumed. If a target cannot be resolved this way, that is a normal `resolve` or `read` result to report, not an internal failure.

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

## Exit conditions

Every call to the `okf-read` wrapper ends exactly one of three ways, and telling them apart is the point:

- **Valid response** — the request parsed and the runtime ran to completion; one JSON line is written to stdout and the process exits 0. A refusal result (for example `blocked`, `not-configured`, `unavailable`) is a valid response, not a failure — it means the read was attempted and the answer is "no."
- **Invalid wrapper input** — the request itself was malformed (wrong `skill`, missing `operation`, missing a required `payload` key, unparsable JSON). Nothing is written to stdout, a short diagnostic goes to stderr, and the process exits 64.
- **Internal failure** — the request parsed but the runtime threw while running it. The wrapper still emits one complete response on stdout (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`), writes a `Runtime failure: ...` diagnostic to stderr, and exits 70.

## Delegation

The Procedure below covers a direct call. When another skill delegates read work to you instead of running `okf-read` directly, load [references/delegation.md](references/delegation.md) for the brief shape `okf-delegate` requires and the receipt it returns.

## Atomic effect owned

`okf-read` owns exactly one atomic effect: **Read, validate, or read-only analysis**. Write effects, lifecycle transitions, and review evidence belong to `okf-write`, `okf-lifecycle`, and `okf-review` respectively — `okf-read` claims none of them.

## Procedure

1. Resolve the bundle-root index for the given working directory. Done when the index's path and its top-level entries are in hand; not done if no bundle root resolves there.
2. Descend to the directory index for the concept being sought, choosing the entry by reading the index content. Done when that directory index has been read and its entries listed; not done if no entry matches the sought concept.
3. Open the concept body at the resolved path. Done when the concept's content is returned; not done if the path does not exist under the bundle root — report that as a `resolve` or `read` result, not as a thrown error.
4. Build the wrapper request with `protocol`, `skill`, `operation`, and exactly the payload keys that operation requires. Done when the object matches the shape above; not done if a required key is missing.
5. Classify the outcome as one of the three exit conditions before reporting it. Done when the report names a valid response (refusal or not), invalid wrapper input, or an internal failure — never blurring a refusal into a crash.
