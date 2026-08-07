---
name: okf-review
description: Reviews trust tiers and review baselines, verifying human verification claims and staleness state, when another skill must invoke it.
---

# okf-review

`okf-review` reads a bundle's trust tier and review baseline, validates claims made about it, and reports its findings. It never confirms, self-approves, executes, or mutates the subject it reviews: a review can never become a write. Every result it produces — including a refusal — is a report, not an action taken on the reviewed bundle.

## Wrapper request

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

`okf-review` sends this request to `node <skill-root>/scripts/okf-review.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a rejected human-verification claim, or a `stale_after` judgment call outside `okf-review`'s authority, is carried in the `result` field.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, or a missing or invalid required `payload` key. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Effects this skill owns

`okf-review` is the sole owner of each of the following atomic effects:

- Record exact human verification.
- Infer or fabricate human verification.
- Standalone removal of verification.
- Derive or display current staleness.
- Set `stale_after` from explicit evidence.
- Choose or change `stale_after` by judgment.

The second effect is owned here so that it is refused here: `okf-review` is the authority that catches an inferred or fabricated human-verification claim, never the one that performs it.

## Procedure

1. Confirm the caller supplied `cwd`, `bundle`, and `concept`, and that any `today` is a well-formed date. Done when the request either matches this shape or has been rejected as invalid wrapper input; not done while a missing or malformed field is being defaulted or guessed.
2. Construct and issue the `review` wrapper request shown above. Done when exactly one of the three exit conditions has been observed and named; not done while the process has not exited or the condition is unnamed.
3. Read the response's `result`. A clean `no-op` result is done when reported as one line naming the operation and result, nothing else, with no further action taken on the reviewed bundle; not done if the full response is shown. Every other result — `blocked`, `failed/incomplete`, or `review needed` — is relayed to the caller verbatim, refusal or not: done when the caller has the complete result and no further action has been taken on the reviewed bundle; not done if it is summarized, softened, reported as a crash, or followed by any change to the reviewed bundle. Show the full response for any result if the caller asks.
