# Prototype — portable manual-operation guard

**Throwaway.** Lives on `prototype/manual-operation-guard`, never on `main`. It exists to answer one
question from wayfinder ticket
[#29](https://github.com/artemVeduta/okf-agent-skills/issues/29); the validated decision is what
graduates, not this code.

## The question

When a harness invokes a manual-only operation — `init`, large/full `sync`, migration, compaction —
with or without an explicit user request, a preview of the current scope, and confirmation of that
exact preview, what minimal state machine should allow, refuse, expire, cancel, or restart the
operation so that:

1. the human can always see **why** it is blocked, and
2. a stale confirmation can **never** authorize changed work?

Out of the question's scope, deliberately: whether these operations are manual-only (settled, issue
#1), what a trust tier permits (issue #11), and how the operation executes, backs up, or rolls back
(issues #7 / #19).

## Run it

```bash
node prototypes/manual-operation-guard/tui.ts          # drive it by hand
node prototypes/manual-operation-guard/walkthrough.ts  # replay the 28 hard cases
```

Node 22.6+ (type stripping); no dependencies, no package manager, nothing written to disk.

## Files

| File             | Keep?                                               |
| ---------------- | --------------------------------------------------- |
| `guard.ts`       | **yes** — pure reducer, no I/O, no harness coupling |
| `corpus.ts`      | no — fake in-memory bundle and a crude planner       |
| `driver.ts`      | no — keystroke glue shared by the two shells         |
| `tui.ts`         | no — terminal shell                                  |
| `walkthrough.ts` | no — scripted replay of the catalogue                |

## The model

Facts the guard needs and **no harness provides to skill content** (issues #4 / #16 / #17): that a
preview was shown, that the human confirmed *that* preview, and any staleness signal. The guard
therefore manufactures and persists them itself, and treats everything a harness *might* offer as an
injected, optional input.

**Phases** — one manual operation in flight at a time:

```
idle → requested → previewed → confirmed → executing → completed
                                                    ↘ failed
        any of the above ─(expiry)→ stale ─(re-preview)→ previewed
        any of the above ─(cancel)→ idle
```

**Verdicts** — `ALLOW`, `REFUSE`, `EXPIRE`, `CANCEL`, `RESTART`, plus `RECORDED` for the bookkeeping
steps. The split that carries the design:

- **REFUSE** — the ask does not match authorized work (wrong operation, wrong scope, no request, no
  preview, spent token, truncated or empty preview).
- **EXPIRE** — the ask matches, but what it was confirmed against has moved (scope drift, transform
  bump, another session's run, ttl, session boundary).

**Binding** — a confirmation is bound to a fingerprint over `{operation, selector, transformVersion,
sorted [path, contentHash, plannedAction, riskClass]}`, taken from the plan the human actually saw
and re-verified against a freshly observed plan at execute time. It is the `--force-with-lease` /
`If-Match` expected-old-value shape, not a counter and not a re-read. `mtime` and size are excluded,
so a touch is not a false alarm; planned action and risk class are included, so a `MOVE` that
silently becomes a `DELETE` is.

**Adapters** (`GuardConfig`) — `ttlMs` and `sessionBinding` are hardening a harness may or may not
support. Both off is the portable floor, and the walkthrough covers it: content binding alone still
catches drift.

**Attestation** — `explicit` | `unknown` | `model-initiated`. `model-initiated` can preview (reads
are safe) but can never confirm; `unknown` (OpenCode, issue #17) proceeds through an echoed token and
is recorded as degraded rather than blocked.
