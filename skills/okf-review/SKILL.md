---
name: okf-review
description: Reviews trust tiers and review baselines, verifying human verification claims and staleness state, when another skill must invoke it.
---

# okf-review

## What this skill does

`okf-review` reads a bundle's trust tier and review baseline, validates claims made about it, and reports its findings. It never confirms, self-approves, executes, or mutates the subject it reviews: a review can never become a write. Every result it produces — including a refusal — is a report, not an action taken on the reviewed bundle.

## Constructing the review request

`okf-review` builds one wrapper request, for the `review` operation:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-review",
  "operation": "review",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<bundle identifier>",
    "concept": "<concept identifier>",
    "today": "<optional ISO YYYY-MM-DD date>"
  }
}
```

`payload.cwd`, `payload.bundle`, and `payload.concept` are required non-empty strings. `payload.today`, if present, must be a valid calendar date in `YYYY-MM-DD` form.

## Reading the result

Three exit conditions, and telling them apart is how a caller knows what happened:

1. **Valid response** — the wrapper writes exactly one JSON line to stdout and exits `0`. A refusal (for example, a rejected human-verification claim, or a `stale_after` judgment call outside `okf-review`'s authority) is a valid response, not a failure: the `result` field simply carries the refusal.
2. **Invalid wrapper input** — the request itself is malformed (bad JSON, wrong `skill`, missing `operation`, or a missing or invalid `payload` field). Nothing is written to stdout; a short diagnostic goes to stderr; exit code is `64`.
3. **Internal failure** — the request was valid but the runtime threw while handling it. The wrapper still emits one complete JSON response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`), writes a diagnostic to stderr, and exits `70`.

Only conditions 2 and 3 mean something went wrong with the request or the runtime. Condition 1 is `okf-review` having done its job, whatever the verdict.

## Delegation

The Procedure below covers a direct call. When another skill delegates review work on an agent's behalf instead of running `okf-review` directly, load [references/delegation.md](references/delegation.md) for what `okf-delegate` validates and returns.

## Effects this skill owns

`okf-review` is the sole owner of each of the following atomic effects:

- Recording an exact human verification.
- Rejecting an inferred or fabricated human-verification claim — `okf-review` is the authority that catches and refuses this, never the one that performs it.
- Standalone removal of a recorded verification.
- Deriving or displaying current staleness.
- Setting `stale_after` from explicit evidence.
- Choosing or changing `stale_after` by judgment call.

`okf-review` claims none of the read-only-analysis effects owned by `okf-read`, none of the create, revise, relationship, or move mutation effects owned by `okf-write`, and none of the standalone broad-rebuild effect owned by `okf-lifecycle`.

## Procedure

1. Confirm the caller supplied `cwd`, `bundle`, and `concept`, and that any `today` is a well-formed date. Done when the request either matches this shape or has been rejected as invalid wrapper input.
2. Construct and issue the `review` wrapper request shown above. Done when exactly one of the three exit conditions has been observed.
3. Read the response's `result` and relay it to the caller verbatim, refusal or not. Done when the caller has the complete result and no further action has been taken on the reviewed bundle.
