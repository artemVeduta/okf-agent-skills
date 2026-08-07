---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns three operations: `init`, which writes the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle, `inspect`, which reports the current state of the three config files `/setup` cares about, and `repair`, which performs an already-approved fix to the two of those files that are plain filesystem actions rather than OKF writes. `init` is the one exception to the rule that a mutation needs an already-conforming root — it is what makes the root conform in the first place. None of the three accepts a delegation brief, and none runs automatically; every one is a direct, explicit invocation, and no other skill reaches any of them on a caller's behalf.

## Wrapper requests

`okf-setup` sends every request to `node <skill-root>/scripts/okf-setup.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

### `init`

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

### `inspect`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "inspect",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">"
  }
}
```

`inspect` is read-only: it never writes anything, and it reports on the three config files `/setup` bootstraps regardless of their current state, including a state it cannot yet act on. It answers with `result: "ok"` and one entry per file under `data`:

- `data.index_md` — `{ "state": "ok" }`, `{ "state": "missing" }`, or `{ "state": "invalid", "reason": "<string>" }`, computed with the same parser `init` writes against, so the two never disagree on what counts as valid.
- `data.activation` — the same three states for `.okf-active`; an `invalid` reason is `not_zero_byte_regular_file`.
- `data.manifest` — the same three states for `.okf-workspace.json`, checked against the exact validator `scripts/lib/manifest.js` already enforces elsewhere. An `invalid` result also carries `salvage`, which is `{ "workspace_id": "<uuid>" }` when the broken file's own `workspace_id` is at least a well-formed UUIDv4, or `null` when there is nothing worth keeping. Every manifest result, including `ok`, carries `monorepo: true|false` — a hint, computed from `.gitmodules` at the Git root or from a manifest that already declares more than one repository or bundle, never a decision.

`cwd` outside any Git repository answers `not-configured`, the same result every other operation gives with nothing to act on.

### `repair`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "repair",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "targets": ["activation", "manifest"],
    "bundle": "<optional bundle directory name, defaults to \"okf\", used for the manifest template>",
    "manifest": "<optional hand-authored manifest object, for a monorepo>",
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>"
  }
}
```

`payload.targets` is required: a non-empty array naming which of `activation` and `manifest` to repair, with no duplicates and no other values — anything else returns `UNSUPPORTED_INPUT` before either file is touched. `repair` never touches `index.md`; that repair is `init`'s, reached through its own wrapper call. Per file:

- `activation` writes a zero-byte `.okf-active` at the Git root, unless it is already the valid zero-byte regular file `inspect` would report as `ok`, in which case nothing is written.
- `manifest` writes `.okf-workspace.json` at the Git root, unless it is already the valid file `inspect` would report as `ok`, in which case nothing is written and `payload.manifest` or `payload.workspace_id`, if supplied, are ignored. Otherwise, when `payload.manifest` is supplied, it is written only after it passes the same validator `inspect` checks against — a failure returns `UNSUPPORTED_INPUT` and writes nothing. When `payload.manifest` is omitted, `repair` generates the single-bundle template named by the resolution this operation implements: `name` the basename of the Git root, `root` the bundle directory from `payload.bundle` (or `okf`), `mode: "source"`, and `workspace_id` either `payload.workspace_id` (when the caller is keeping a salvaged value) or a fresh UUIDv4.

The response names `applied` when at least one target was actually written, `no-op` when every named target was already `ok`, or `blocked` with `data.code` when the request itself is unsupported. `data.activation` and `data.manifest`, one per named target, each carry `written: true|false`; a written manifest also echoes the `workspace_id` it used.

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, and the activation-marker gate. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

`inspect` and `repair` run no REACH/TRUST/ACCESS admission and cite no evidence at all: `.okf-active` and `.okf-workspace.json` are plain filesystem actions, not OKF operations through the write gate, so neither carries the `effects` vocabulary bounded writes use. Both run even when the activation marker itself is absent or invalid — that is one of the things `inspect` reports and `repair` fixes — so neither is gated behind the marker the way every mutating operation on an active bundle is. The only preconditions are a Git repository (otherwise `not-configured`, same as every other operation) and, for `repair`, a writable Git root (otherwise a blocked result carrying a `PARENT_DIRECTORY_NOT_WRITABLE` finding).

## Idempotent and repairing

Calling any of the three operations again is never an error:

- A root that already parses with `okf_version: "0.2"` and the requested `project_mode` (or no requested `project_mode`) is a `no-op` for `init` — nothing is rewritten. A missing, malformed, or wrong-version root is overwritten; an existing Markdown body is preserved when the current root parses, an unparseable root is replaced whole, and a bundle directory that does not exist yet is created.
- `repair` leaves an already-`ok` `.okf-active` or `.okf-workspace.json` untouched and reports `no-op` for that file; it only writes a target reported `missing` or `invalid`.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing `payload.cwd`, or, for `repair`, a missing or empty `payload.targets`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** No operation here ever runs for a delegated caller or runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Inspect before acting.** Send an `inspect` request and read its report. Done when all three files carry a named state; not done while any file's state is assumed rather than reported.
3. **Present the report and get consent.** Show the three states to the user and ask whether to fix all of them or choose which to fix. Done when the user has approved a specific set of repairs, or declined; not done if any file is repaired without that approval, and not done if an already-`ok` file is offered for repair at all.
4. **Repair `index.md` through `init`, when approved.** Call `init` with the bundle named in the report. When `project_mode` is still unknown at this point, ask the user for `code-backed` or `knowledge-only` and call `init` again naming it — the second call merges the mode into the root `init` already wrote. Done when `inspect`, called again, reports `index_md` as `ok`; not done while it still reports `missing` or `invalid`.
5. **Repair `.okf-active` through `repair`, when approved.** Call `repair` with `targets` including `"activation"`. Done when a repeat `inspect` reports `activation` as `ok`.
6. **Repair `.okf-workspace.json` through `repair`, when approved.** Read `inspect`'s report for this file first:
   - An `invalid` file is shown with its validation reason and its `salvage` value, if any, before regeneration; the user's approval is required before the file is overwritten, and a kept `salvage.workspace_id` is passed back as `payload.workspace_id`. Never regenerate an invalid manifest without that approval.
   - A `monorepo: true` hint is a warning, not a decision: ask the user to choose the single-bundle template or a hand-written manifest for their actual repository and bundle layout. A hand-written choice is drafted together with the user and sent as `payload.manifest`; the single-bundle choice calls `repair` with no `manifest` payload.
   - Otherwise, call `repair` with `targets: ["manifest"]` and no other payload field, for the deterministic single-bundle template. Done when a repeat `inspect` reports `manifest` as `ok`.
7. **Treat a crashed prior setup as an ordinary starting state.** There is no checkpoint, no resume state, and no recovery journal to consult — Git already owns history and rollback for everything this procedure writes. Re-running from step 2 is always correct: whatever `inspect` already reports `ok` is left untouched by step 3's approval gate, and whatever it still reports `missing` or `invalid` is repaired exactly as it would be on a first run.
8. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash.
