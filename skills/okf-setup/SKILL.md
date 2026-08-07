---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, including a monorepo's package-per-bundle layout, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns six operations. `init` writes the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle; it is the one exception to the rule that a mutation needs an already-conforming root — it is what makes the root conform in the first place. `inspect` reports the current state of the three config files `/setup` cares about, and `repair` performs an already-approved fix to the two of those files that are plain filesystem actions rather than OKF writes. `plan` and `aggregate` are the monorepo pair (#135): `plan` detects deterministic package boundaries and builds the immutable brief each package sub-agent receives, and `aggregate` collects the per-package results a coordinator's sub-agents returned into one honest summary and the shared root workspace manifest that federates their bundles. `report` (#136) turns the migration's own signals — what was migrated, skipped, left ambiguous, or retained as residue, plus link and provenance facts and whether a human reviewed semantic fidelity — into the structured statistics and thresholds behind the post-setup analytics report; it never reads the bundle itself and never writes anything, and rendering its structured data as the Markdown report the user sees is this file's procedure, not the runtime's. None of the six accepts a delegation brief, and none runs automatically; every one is a direct, explicit invocation, and no other skill reaches any of them on a caller's behalf.

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

### `plan`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "plan",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name each package will carry, defaults to \"okf\">",
    "project_mode": "<optional \"code-backed\" or \"knowledge-only\", carried into every brief>",
    "mappings": "<optional array of already-approved source-to-concept mappings, carried into every brief>"
  }
}
```

`plan` is read-only: it never writes anything. It reads the same deterministic evidence `inspect`'s `monorepo` hint gestures at, but goes further — an actual package-boundary rule read from `.gitmodules`, a root `package.json`'s `workspaces` field, a root `pnpm-workspace.yaml`, a root `Cargo.toml`'s `[workspace]` table, or a root `go.work`, in that combined, order-independent set. It answers with `result: "ok"` and:

- `data.monorepo: false` when no signal is present, or exactly one package is found — a single package is not a monorepo, and `data.packages`/`data.briefs` are both empty.
- `data.monorepo: true, data.ambiguous: true` when a signal is present but cannot be resolved deterministically — an unsupported glob, unparseable configuration, or two signals that disagree about the same path. `data.reason` names what could not be resolved and `data.question` is the question to put to the user; `data.packages` and `data.briefs` stay empty. This is never guessed past — no partial or best-effort package list is returned.
- `data.monorepo: true, data.ambiguous: false` when every present signal resolves to the same package list. `data.packages` is one entry per package (`package`, `path`, `separate_repo`), and `data.briefs` is the exact immutable brief each package's sub-agent receives: `package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, and `okf_version`. For a package with its own Git repository (a submodule), `cwd` is that repository's own root and `bundle` is just the bundle directory name; for a package sharing the workspace repository, `cwd` is the workspace root and `bundle` is the package-relative bundle path — either way, the pair is exactly what the worker's own `init` or `okf-write` calls need.

`data.signals` always lists which of the five sources were present, whether or not they resolved. `cwd` outside any Git repository answers `not-configured`, the same result every other operation gives with nothing to act on.

### `aggregate`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "aggregate",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name used for the manifest, defaults to \"okf\", must match the plan call>",
    "results": [
      { "package": "<package alias from plan's data.packages>", "status": "ok" },
      { "package": "<another package alias>", "status": "failed", "reason": "<why that worker did not finish>" }
    ],
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>"
  }
}
```

`aggregate` is read-only: it never writes the manifest itself. `payload.results` must name every package the same deterministic detection `plan` used still reports, exactly once each, and no other package — a result naming an unknown package, a missing package, or a duplicate is `UNSUPPORTED_INPUT` before anything is computed, so a failed package can never be silently dropped from the report. Each result is `{"status": "ok"}` or `{"status": "failed", "reason": "<string>"}` (a `reason` on an `"ok"` result, or a missing one on a `"failed"` result, is also `UNSUPPORTED_INPUT`), plus an optional `warnings` array of strings either way.

The response is `result: "ok"` with:

- `data.status` — `"complete"` only when every named package succeeded, `"partial"` when at least one failed. This operation never reports `"complete"` while a package failed.
- `data.packages` — one entry per package, each carrying its `status`, `reason` (`null` for a succeeded package), and `warnings`.
- `data.failed` — the alias of every failed package, named plainly rather than left for the caller to recompute.
- `data.manifest` — the shared root workspace manifest that federates every package's bundle: one repository entry for the workspace root, plus one more per package with its own Git repository (a submodule); one bundle entry per package, each `required: true` and `mode: "source"`, owned by its own repository (submodule) or by the workspace root at its package-relative path. Every detected package gets a bundle entry regardless of whether its worker succeeded — a package whose worker failed simply has no bundle on disk yet, which is exactly the existing `required` but not `active` case the workspace-federation health check already reports as `degraded`, not silently dropped. This manifest is not written by `aggregate`: pass it as `repair`'s `payload.manifest` to actually persist it, the one place, after every worker has finished, that the shared manifest is ever written.

### `report`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "report",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "sources": [
      { "path": "docs/decisions/use-postgres.md", "disposition": "migrated", "concept": "decisions/use-postgres.md", "sources_declared": true },
      { "path": "docs/api-reference.md", "disposition": "skipped", "reason": "code_recoverable" }
    ],
    "links": [
      { "from": "decisions/use-postgres.md", "target": "glossary.md", "resolved": true }
    ],
    "semantic_review": { "performed": false }
  }
}
```

`report` is read-only: it never reads the bundle and never writes anything, in either directory or file form. It is pure classification over the migration's own signals, the same grain as `plan`/`aggregate`: the caller — the `/setup` procedure itself, once its own migration work or every dispatched package sub-agent has finished — supplies what happened, and `report` only totals and classifies it. Exactly one of two payload shapes is accepted; naming both, or naming neither, is `UNSUPPORTED_INPUT` before anything is computed.

**Single-project mode** — `payload.sources` (required, an array; open points 2 and 3):

- Each entry names `path` (the source document) and `disposition`, one of `migrated`, `skipped`, `ambiguous`, or `residue`.
- `migrated` requires `concept` (the concept path it became) and forbids `reason`; an optional `sources_declared: true|false` records whether the produced concept carries structured `sources` frontmatter, the provenance-coverage signal.
- `skipped`, `ambiguous`, and `residue` each require a non-empty `reason` and forbid `concept`/`sources_declared`. `skipped` names an intentional, safe disposition (for example #131's code-recoverable filtering); `ambiguous` names a source whose disposition is still an open question; `residue` names inert, retained-as-evidence material.
- `payload.links`, when supplied, is an array of `{ "from": "<concept>", "target": "<concept-or-path>", "resolved": true|false }` — link integrity (open point 3). Omitted, it defaults to empty.
- `payload.semantic_review` is required: `{ "performed": true|false }`. `false` (or omitted entirely) is not an error — it is the honest default — but it always surfaces the semantic-fidelity-not-assessed disclosure; only an explicit `true` claims a human reviewed the ambiguities, residue, and representative conversions.

**Multi-package mode** — `payload.packages` (required instead of `sources`, a non-empty array composed from `aggregate`'s own per-package results): each entry names `package` and `status` (`"ok"` or `"failed"`, `aggregate`'s own vocabulary), exactly as `aggregate` named it. A `"failed"` entry carries only `reason` and, optionally, `warnings` — a failed worker produced no signals, so `sources`/`links`/`semantic_review` on it are `UNSUPPORTED_INPUT`. An `"ok"` entry carries the same `sources`/`links`/`semantic_review` fields single-project mode does, plus optional `warnings`, and forbids `reason`. A duplicate `package` name is `UNSUPPORTED_INPUT`.

The response is `result: "ok"` with (open points 2, 3, 4, and 6):

- `data.status` — `"complete"` only when every source has a resolved disposition (no `ambiguous` entries) and, in multi-package mode, every package's worker succeeded; `"partial"` otherwise. This is the one warning/error threshold with a boundary: the moment any `ambiguous` source exists, anywhere, the run is `"partial"` — the same "unresolved work is never silently complete" rule `aggregate` already applies to a failed package.
- `data.summary` — `sources_total`, `concepts_created`, `sources_skipped`, `sources_ambiguous`, `sources_residue` (open point 4).
- `data.concepts` — one entry per migrated source: `source`, `concept`, `sources_declared` (open point 3, source-to-concept mapping).
- `data.skipped`, `data.ambiguous`, `data.residue` — one entry per source in that disposition, each `{ "source": "...", "reason": "..." }`.
- `data.provenance` — `{ "total", "with_sources", "without_sources" }` across migrated concepts.
- `data.links` — `{ "total", "resolved", "broken", "broken_detail": [{ "from", "target" }] }`.
- `data.semantic_fidelity` — `{ "assessed": true|false }`, `true` only when `semantic_review.performed` was `true`; a structural report — however green — never sets this to `true` on its own (#131: semantic fidelity must never be claimed by a structural check).
- In multi-package mode, `data.summary`/`data.provenance`/`data.links`/`data.semantic_fidelity` are the sum (and, for semantic fidelity, the logical AND) across every succeeded package, and `data.packages` carries one entry per package: a failed one repeats `aggregate`'s own `{ "package", "status", "reason", "warnings" }`, a succeeded one adds every single-project field above plus `migration_status` (`"complete"`/`"partial"` for that package alone, distinct from its worker `status`).

`report`'s `findings` name the same signals structurally: a `source_skipped` or `link_broken` finding is `severity: "warning"`; a `source_ambiguous` finding is `severity: "error"`; a `semantic_fidelity_not_assessed` finding is `severity: "warning"`. None of them ever `blocks` — `report` only classifies what already happened, it never gates a write.

`report`'s output location (open point 5) is deliberately nowhere on disk: it returns structured JSON on stdout, like every other wrapper response, and nothing else. It does not write into the bundle — a report living inside the bundle would itself have to conform to the OKF model, a cost this operation does not pay — and it does not write a separate file. Rendering the response as the Markdown report a user reads, and deciding whether that Markdown goes to the chat transcript or somewhere the user names, is this file's procedure (step 11), not the runtime's (open point 1: the runtime emits the structured signal set, this file specifies the prose).

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, and the activation-marker gate. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

`inspect` and `repair` run no REACH/TRUST/ACCESS admission and cite no evidence at all: `.okf-active` and `.okf-workspace.json` are plain filesystem actions, not OKF operations through the write gate, so neither carries the `effects` vocabulary bounded writes use. Both run even when the activation marker itself is absent or invalid — that is one of the things `inspect` reports and `repair` fixes — so neither is gated behind the marker the way every mutating operation on an active bundle is. The only preconditions are a Git repository (otherwise `not-configured`, same as every other operation) and, for `repair`, a writable Git root (otherwise a blocked result carrying a `PARENT_DIRECTORY_NOT_WRITABLE` finding).

`plan`, `aggregate`, and `report` run no admission and no write gate at all — like `inspect`, they only read and compute, never write, and all three run whether or not a bundle root, an activation marker, or a manifest yet exist. The only precondition any of them has is a Git repository (otherwise `not-configured`); `aggregate` additionally requires that `plan`'s own deterministic detection still resolves to the same unambiguous package list `payload.results` names, so nothing about the workspace shape changed out from under it between the two calls. `report` carries no such requirement — it never reads the bundle or the workspace shape, only the signals its own payload names, so it never needs to agree with `plan`'s live detection.

## Parallel execution (#135)

Package sub-agents run independently and in parallel once `plan` hands out their briefs: each one writes only inside its own package's bundle, through its own ordinary `init`/`okf-write` calls, exactly as any single-project setup would. No lock file, no mutex, and no cross-worker coordination exists or is needed, because no two workers ever target the same bundle root — the write gate's existing compare-and-swap publish (`TARGET_CHANGED` on a changed target) is the only conflict protection any single write already had, and package isolation means it is never exercised across workers. The one piece of genuinely shared state is the root workspace manifest, and it is written exactly once, by the coordinator alone, after every worker has returned — through `aggregate` computing it and `repair` persisting it — never by a worker and never mid-flight.

## Idempotent and repairing

Calling any of the six operations again is never an error:

- A root that already parses with `okf_version: "0.2"` and the requested `project_mode` (or no requested `project_mode`) is a `no-op` for `init` — nothing is rewritten. A missing, malformed, or wrong-version root is overwritten; an existing Markdown body is preserved when the current root parses, an unparseable root is replaced whole, and a bundle directory that does not exist yet is created.
- `repair` leaves an already-`ok` `.okf-active` or `.okf-workspace.json` untouched and reports `no-op` for that file; it only writes a target reported `missing` or `invalid`.
- `plan`, `aggregate`, and `report` write nothing, so calling any of them again is always exactly as safe as calling it the first time; `plan` reruns detection fresh rather than remembering a prior call, `aggregate` recomputes the manifest fresh from whatever `payload.results` names this time, and `report` recomputes its statistics fresh from whatever `payload.sources`/`payload.packages` names this time.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing `payload.cwd`, or, for `repair`, a missing or empty `payload.targets`, or, for `aggregate`, a missing or empty `payload.results`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** No operation here ever runs for a delegated caller or runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Inspect before acting.** Send an `inspect` request and read its report. Done when all three files carry a named state; not done while any file's state is assumed rather than reported.
3. **Present the report and get consent.** Show the three states to the user and ask whether to fix all of them or choose which to fix. Done when the user has approved a specific set of repairs, or declined; not done if any file is repaired without that approval, and not done if an already-`ok` file is offered for repair at all.
4. **Repair `index.md` through `init`, when approved.** Call `init` with the bundle named in the report. When `project_mode` is still unknown at this point, ask the user for `code-backed` or `knowledge-only` and call `init` again naming it — the second call merges the mode into the root `init` already wrote. Done when `inspect`, called again, reports `index_md` as `ok`; not done while it still reports `missing` or `invalid`.
5. **Repair `.okf-active` through `repair`, when approved.** Call `repair` with `targets` including `"activation"`. Done when a repeat `inspect` reports `activation` as `ok`.
6. **Repair `.okf-workspace.json` through `repair`, when approved.** Read `inspect`'s report for this file first:
   - An `invalid` file is shown with its validation reason and its `salvage` value, if any, before regeneration; the user's approval is required before the file is overwritten, and a kept `salvage.workspace_id` is passed back as `payload.workspace_id`. Never regenerate an invalid manifest without that approval.
   - A `monorepo: true` hint is a warning, not a decision: call `plan` before asking the user anything. Done when step 7 has run and either produced a deterministic package layout or reported the layout as a question; not done if a single-bundle or hand-written manifest is chosen while `plan` has not yet been tried.
   - When `plan` reports `data.monorepo: false`, or the user prefers a hand-written manifest for a layout `plan` could not resolve, fall back to the pre-#135 choice: the single-bundle template (`repair` with no `manifest` payload) or a manifest hand-drafted with the user and sent as `payload.manifest`.
   - Otherwise, call `repair` with `targets: ["manifest"]` and no other payload field, for the deterministic single-bundle template. Done when a repeat `inspect` reports `manifest` as `ok`.
7. **For a monorepo, detect package boundaries and dispatch one sub-agent per package, in parallel (#135).** Call `plan` with the bundle name and, when already known, `project_mode` and approved `mappings`. Done when the result is one of the three states below and handled accordingly; not done while any state is treated as another.
   - `data.monorepo: false` — proceed as a single-project setup (steps 1–6 as written); this repository has at most one package.
   - `data.ambiguous: true` — show the user `data.reason` and `data.question`; ask them to either name each package root explicitly (feeding a hand-drafted `payload.manifest` into `repair`, as in step 6) or correct the workspace configuration and retry `plan`. Never guess a package list past this point.
   - `data.ambiguous: false` — launch one fresh-context sub-agent per entry in `data.briefs`, all in parallel, each one receiving exactly its own brief object (`package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, `okf_version`) and nothing else: no sibling package's brief, no corpus, no shared mutable state. Each sub-agent runs its own `init` and subsequent `okf-write` calls against its own `cwd`/`bundle` pair exactly as a single-project setup would, and returns its own package's alias, whether it succeeded, and, on failure, why.
8. **Aggregate the sub-agents' results and write the shared manifest once, after all of them return.** Call `aggregate` with one `results` entry per package the sub-agents were dispatched for — every package `plan` named, none omitted, whether it succeeded or failed. Done when `data.status` and `data.manifest` are both read; not done while any dispatched package is missing from `payload.results`.
   - Report `data.status` honestly: `"complete"` only when every package succeeded, `"partial"` otherwise, naming each failed package and its reported reason. Never report overall success while `data.failed` is non-empty.
   - Call `repair` with `targets: ["manifest"]` and `payload.manifest: <aggregate's data.manifest>` to persist it. This is the one and only manifest write for the whole monorepo run; no worker sub-agent ever writes it, and it is never written before every worker has returned. Done when a repeat `inspect` reports `manifest` as `ok`.
9. **Treat a crashed prior setup as an ordinary starting state.** There is no checkpoint, no resume state, and no recovery journal to consult — Git already owns history and rollback for everything this procedure writes. Re-running from step 2 is always correct: whatever `inspect` already reports `ok` is left untouched by step 3's approval gate, and whatever it still reports `missing` or `invalid` is repaired exactly as it would be on a first run; a monorepo re-run calls `plan` again and re-dispatches only the packages still worth acting on.
10. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash. A monorepo run's final report is step 8's `data.status` and per-package detail, never collapsed to a single pass/fail line while any package failed.
11. **Once migration work has actually happened, call `report` and render its response as Markdown for the user (#136).** This step only runs after this setup session did some migration — single-project migration work, or, in a monorepo, after step 8's `aggregate`/`repair` sequence completed. Build `payload.sources` (or, for a monorepo, `payload.packages`, one entry per package dispatched in step 7 using its own `status` from step 8) from exactly what that migration work reported: every selected source's actual disposition and reason, every link actually rewritten or left broken, and `semantic_review.performed: true` only when a human — not this procedure, not a model call — actually reviewed the ambiguities, residue, and representative conversions this session; otherwise leave it `false`. Never invent a disposition, a reason, or a `true` semantic-review flag to make the report look cleaner. Done when `report` answers `result: "ok"`; not done while any known disposition or link outcome was left out of the payload.
    Render the response as Markdown, in this shape, and show it in the chat transcript only — never write it into the bundle (it would itself need to conform to the OKF model) and never write it to a separate file (open point 5):
    - A heading naming `data.status` (`Migration complete` or `Migration partial`).
    - A **Summary** section listing `data.summary`'s five counts.
    - A **Concepts created** section listing `data.concepts`' source → concept pairs, noting any without `sources_declared` as missing provenance.
    - A **Skipped** section listing `data.skipped`'s source/reason pairs, when non-empty.
    - An **Uncertain** section listing `data.ambiguous`'s source/reason pairs as open questions still needing a decision, when non-empty — this is the "what is uncertain" signal, never smoothed into the skipped list.
    - A **Residue** section listing `data.residue`'s source/reason pairs, when non-empty.
    - A **Link integrity** section reporting `data.links`'s counts and listing `data.links.broken_detail`, when any link is broken.
    - A closing **Semantic fidelity** line: when `data.semantic_fidelity.assessed` is `false`, state plainly that semantic fidelity was NOT assessed and structural checks do not establish it; only when it is `true` does this line say a human reviewed it. Never omit this line, and never let a clean `data.status: "complete"` stand in for it.
    - In multi-package mode, repeat the per-package detail under `data.packages`, plus the failed-package list from any `"failed"` entries, before the combined totals above.
