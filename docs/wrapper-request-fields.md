# Top-level `okf-wrapper/1` request fields

`task_kind`, `scope`, and `invocation` are top-level fields. Each sits beside `payload`, never inside it.

## `task_kind`

`task_kind` names the user's selected intent. The suite supports seven task kinds, but only three
are write-eligible: `feature work`, `fix`, and `research`. A mutating operation — `create`,
`revise`, `format`, `relationship`, `machine-verify` — with an absent or non-write-eligible
`task_kind` returns `result: "blocked"` with `data.code: "TASK_KIND_NOT_WRITE_ELIGIBLE"`.

`sync` abstains (`result: "abstained"`) instead of blocking when `task_kind` is absent or not
write-eligible, or when `payload.set` is absent.

## `scope`

`scope` names the concepts a request touches. Its only supported shape is `{ "concepts": [<one
concept path>] }`.

For `okf-write`'s five bounded operations, `scope` is optional. If `scope` is left out, it defaults
to the single concept named in `payload.concept`. If `scope` is supplied, it must name exactly that
same concept — one key, one element — or the request returns `result: "blocked"` with
`data.code: "INVALID_SCOPE"`.

For `okf-lifecycle`'s `sync`, `scope` is required. It must name exactly the concept in
`payload.concept`. A `sync` with no `scope`, or a `scope` naming a different or additional concept,
returns `result: "blocked"` with `data.code: "INVALID_SCOPE"`.

## `invocation`

`invocation` names who sent the request: `"explicit"` for an agent acting on its own request, or
`"automatic"` for an adapter or a hook acting without one. `sync` requires `invocation` — a request
missing it never reaches the runtime.

In an activated bundle, a mutating request carrying `invocation: "automatic"` returns
`result: "blocked"` with `data.code: "AUTOMATIC_MUTATION_BLOCKED"`, even when every other field is
valid. In a bundle with no activation marker, the same request gets no response at all.

## Delegation

Calling a bounded operation directly, on `okf-write`, is write-eligible on its own. Delegating the
same write through `okf-delegate` is only a convenience for the caller. Delegation does not add
privilege.
