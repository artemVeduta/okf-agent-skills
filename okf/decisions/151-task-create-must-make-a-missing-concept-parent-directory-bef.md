---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/151
status: draft
type: Decision
---
# Task: create must make a missing concept parent directory before publish can work

Status: This decision is closed.

## Parent

- #129

## Question

`okf-write` `create` does not make a missing parent directory for a concept. See the `missing/note.md` case in `test/issue-53.test.js`.

This blocks the destination of the map. The mapping engine of #145 puts concepts into canonical type directories (`decisions/`, `research/`, `playbooks/`, and so on). A fresh bundle has none of those directories. Thus the `publish` operation of #149 reports a failure for the first concept of each type, and a first migration into a new bundle cannot finish.

Settle:

1. Does `create` make the missing parent directory, or does a separate step make it?
2. If `create` makes it, what limits apply? The directory must stay inside the bundle root, and it must not escape through a symbolic link.
3. Which operation makes the directory if `create` does not: `publish`, `init`, or a new one?
4. What does the write gate report when the parent directory cannot be made?

This changes behavior for every caller of `create`, not only for `publish`, thus it needs a recorded decision before implementation.

Found while resolving [#149](https://github.com/artemVeduta/okf-agent-skills/issues/149).

## Blocked by

Nothing. It blocks [#150](https://github.com/artemVeduta/okf-agent-skills/issues/150).

## Comment by artemVeduta

## Resolution

`create` makes the missing parent directory. The directory is not a thing in the OKF model: a concept identity is a path (#22), thus a directory is only how the filesystem stores that path. Making it belongs to the act of writing the file.

### 1. Which operation makes it

`services.publishFile()` (`scripts/lib/services.js:17`) makes the parent with a recursive `mkdir`, immediately before it writes its temporary file.

It is put there, and not in `create` alone, because `create` is not the only writer that hits the wall. `revise` (`scripts/lib/lifecycle.js:14`) and the index/log append (`scripts/lib/runtime.js:122`) route through the same function. This is also the established pattern of this codebase: `init` does `services.mkdir(bundleRoot)` at `scripts/lib/setup.js:101`, and `assemble` does the same for a staged file at `scripts/lib/setup.js:949`.

Refused alternatives:

- **`publish` makes it** — it puts a write of bundle content outside the write gate, against the one-contract-seam rule.
- **`init` makes all canonical type directories** — it guesses a directory list, makes empty directories a project may never use, and helps no bundle made before this change. A type with no canonical directory keeps the #144 mirror and can nest at any depth, thus a fixed list cannot be complete.
- **A new `ensure-dir` operation** — a sealed operation that decides nothing.

### 2. Limits

The mkdir is not permitted to create structure behind an unexamined symbolic link.

Containment for a concept path at `scripts/lib/validation.js:630` is a **lexical** prefix test only. REACH applies `realpath` to the bundle root (`scripts/lib/reach.js:44`), never to the concept path. Thus a symbolic link in a sub-directory inside the bundle is not examined before the write today. This is a defect found by this ticket, and the spec is explicit that realpath containment is recomputed at every resolution (`docs/spec/okf-agent-skills-v0.1.0.md:1130`).

The gate therefore adds a `realpath` re-check of the deepest existing ancestor of the concept path, reusing the walk-up function that `scripts/lib/reach.js:44` already has, and refuses with `SYMLINK_ESCAPE` when the ancestor is outside the bundle root.

The check lives in the gate (`scripts/lib/validation.js`), beside the existing lexical `inside()`, **not** in `publishFile`. `publishFile` stores bytes; the gate decides. An admission rule below the seam would be hidden from every gate test. Consequence, stated and not implied: the check must be added to the evaluator of `create`, of `revise`, and of the derivative append.

### 3. Which operation if not `create`

Not applicable — `create` makes it, through the shared write function.

### 4. What the gate reports

Today a missing parent gives `POST_WRITE_VALIDATION_FAILED` with the raw Node text, which leaks an absolute path and a temporary filename, although `scripts/lib/reach.js:16` already redacts a path the user did not name. The label is also untrue: nothing was validated after a write, because no write occurred.

Three causes are separated, each refused **before** any write, with nothing written:

| Cause | Code |
| --- | --- |
| The nearest existing ancestor is not writable | `PARENT_DIRECTORY_NOT_WRITABLE` (already used by `init`, `scripts/lib/validation.js:680`) |
| A file occupies a path segment, for example `decisions` is a file and the concept is `decisions/x` | `CONCEPT_PARENT_NOT_A_DIRECTORY` (new) |
| The path leaves the bundle through a symbolic link | `SYMLINK_ESCAPE` |

`CONCEPT_PARENT_NOT_A_DIRECTORY` is the one new code. The two first causes need different repairs, thus they must not share one code: "not writable" would send the user to change the permissions of a directory that does not exist.

### 5. Consequences

- **`test/issue-53.test.js:180`** — the `missing/note.md` case now succeeds and thus fails the test. Its purpose is to prove that a failed bounded outcome does not hide its state; it needs some failing write, not this one. The case changes to a parent that truly cannot be made — a read-only bundle directory, which gives `PARENT_DIRECTORY_NOT_WRITABLE`. The purpose of the test is kept.
- New tests pin each of the three codes, and prove that no absolute path and no temporary filename appears in the finding.
- **No rollback.** If the write fails after the mkdir, the empty directory stays. An empty directory carries no OKF meaning — no `index.md`, no identity, and the validator ignores it. Git records nothing for it. Removing it would start the rollback subsystem this map forbids.
- **The made directory is not reported in the outcome.** The outcome names the concept, and the concept is the path. Reporting a directory would invent an artifact the model does not have.

### 6. Specification status

No `Open` row blocks this. The open-item table (`docs/spec/okf-agent-skills-v0.1.0.md:3646`) holds only `Deferred` and `Closed` rows, and the `Closed (D11)` bootstrap row covers the creation of the **bundle root**, not a concept parent directory. The reserved REACH item is the exclusion rule list only, not directory creation. Thus this recorded decision is sufficient, and it unblocks #150.

## Comment by artemVeduta

## Implementation status (session complete)

#151's decision is **fully implemented** and merged via #154 (work ticket #153).

### Done

| Decision item | Status |
| --- | --- |
| `publishFile` recursive parent `mkdir` | shipped (`87b7c9d`) |
| Gate pre-check: `PARENT_DIRECTORY_NOT_WRITABLE` | shipped |
| Gate pre-check: `CONCEPT_PARENT_NOT_A_DIRECTORY` (new) | shipped |
| `realpath` re-check → `SYMLINK_ESCAPE` on create / revise / derivative append | shipped (`4f8ca27`) |
| issue-53 `missing/note.md` → read-only parent (blocked) | shipped |
| No absolute path / temp name in findings | shipped + hardened (`5981dd0`, `writeFailureReason`) |
| No rollback of empty dirs; dir not named in outcome | held |

### Review close-out (`5981dd0`)

- Invented-codes header lists `CONCEPT_PARENT_NOT_A_DIRECTORY`
- Write-failure reasons use errno codes, not path-leaking `error.message`
- `escapesBundle` rethrows EACCES/EPERM/EROFS/EIO (not SYMLINK_ESCAPE)
- Dead `services.mkdir(bundleRoot)` removed from init (covered by `publishFile`)
- Derivative `SYMLINK_ESCAPE` branch has a dedicated test

### Verification

`node --test "test/*.test.js"` — **474 pass, 0 fail**

### Tickets

- #153 — implementation work (closes with #154)
- #150 — unblocked by this decision + merge
