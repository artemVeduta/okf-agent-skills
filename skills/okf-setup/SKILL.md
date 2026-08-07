---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns the `init` operation: writing the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle. It is the one exception to the rule that a mutation needs an already-conforming root — `init` is what makes the root conform in the first place. It accepts no delegation brief and runs only as a direct, explicit invocation; no other skill reaches it on a caller's behalf.

## Wrapper request

`okf-setup` builds one wrapper request, for the `init` operation:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "init",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">",
    "project_mode": "<optional \"code-backed\" or \"knowledge-only\">"
  }
}
```

`payload.cwd` is the only required field. `payload.bundle`, when omitted, defaults to `okf`. `payload.project_mode`, when supplied, must be exactly `code-backed` or `knowledge-only`; any other value returns `UNSUPPORTED_INPUT`. Omitting it writes `okf_version` alone, and a later `init` call may add `project_mode` by naming it — the second call merges the new key into the already-valid root rather than refusing it.

`okf-setup` sends this request to `node <skill-root>/scripts/okf-setup.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, and the activation-marker gate. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

## Idempotent and repairing

Calling `init` again is never an error:

- A root that already parses with `okf_version: "0.2"` and the requested `project_mode` (or no requested `project_mode`) is a `no-op` — nothing is rewritten.
- A missing, malformed, or wrong-version root is overwritten. An existing Markdown body is preserved when the current root parses; an unparseable root is replaced whole.
- A bundle directory that does not exist yet is created.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, or a missing `payload.cwd`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** `init` never runs for a delegated caller and never runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Construct and send the wrapper request.** Build the JSON object shown above, defaulting `bundle` to `okf` when the caller named none, and pipe it to the `okf-setup` wrapper. Done when the process exits and one of the three exit conditions above has been observed and named; not done while the outcome is unnamed or a refusal is being treated as a crash.
3. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash.
