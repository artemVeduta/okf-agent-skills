# Task 4 report: workers stay inside the accepted mapping

## Result

Task 4 carries the accepted split mapping through the existing `partition`
brief and validates the worker result through the existing `partition`
validate mode. `assemble` uses the same validator again before it stages any
concept. No operation, worker mechanism, or dependency was added.

Workers can transform only the accepted output bodies. They cannot add, drop,
change, rename, or reorder an output. They cannot add, drop, move, alter, or
reorder a section range. The runtime refuses a mismatch. It does not absorb or
repair it.

Tasks 5, 6, and 7 are not implemented. This task does not check semantic
preservation, complete publication-candidate conformance, or final reporting.

## Exact request and response fields

`partition` compute mode now requires these exact upstream fields:

- `payload.plan`: `migration-plan` response `data.plan`.
- `payload.mapping`: `migration-plan` response `data.mapping`.
- `payload.references`: `migration-plan` response `data.references`.
- `payload.split_review`: the same accepted `migration-plan` response
  `data.split_review`, unmodified.

`payload.split_review` must have one row per `migrate` source. A source not
under review has `accounting_status: "not_required"` and `proposal: null`. A
reviewed source must have `accounting_status: "complete"`,
`proposal.status: "accepted"`, and `proposal.accepted: true`. The runtime also
checks that:

- `split_review[].outputs[].output` exactly equals the proposal output keys;
- `split_review[].outputs[].sections[]` exactly equals the assigned
  `split_review[].sections[]` ranges, ownership, and `output_order`;
- each proposal output has a non-empty `concept_id`, matching `path`,
  non-empty `type`, and non-empty `title`.

Each `data.shards[].brief` now has `split_review`, the unchanged subset for
that shard's sources. The other brief fields remain `shard`, `cwd`, `bundle`,
`project_mode`, `okf_version`, `sources`, `mapping`, `references`, and
`neighbors`.

`partition` validate mode keeps the request fields `payload.brief` and
`payload.shard`. A worker result keeps the exact top-level fields:

- `shard`
- `concepts`
- `references`
- `warnings`
- `blockers`

For an accepted reviewed source, each `payload.shard.concepts[]` row has these
exact fields:

- `path`: accepted source path.
- `output`: accepted opaque output key.
- `concept`: accepted `proposal.outputs[].concept_id`.
- `type`: accepted `proposal.outputs[].type`.
- `sections`: exact ordered `[{ line_start, line_end }]` from the matching
  Task 2 `split_review[].outputs[]` row.
- `body`: worker-transformed output body.

An unsplit source keeps the existing exact concept row fields `path`,
`concept`, `type`, and `body`.

A valid response remains `result: "ok"` with `data.valid: true`. A refused
worker result remains `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"`,
and one blocking finding. `assemble` returns the same finding with
`detail.shard` added because it validates staged shard files through the same
seam.

## Finding codes

All findings have `origin: "suite"`, `severity: "error"`, and `blocks: true`.

- `SHARD_SPLIT_OUTPUT_ADDED`: `detail.path`, `detail.output`.
- `SHARD_SPLIT_OUTPUT_DROPPED`: `detail.path`, `detail.output`.
- `SHARD_SPLIT_OUTPUT_CHANGED`: `detail.path`, `detail.output`,
  `detail.field`, `detail.expected`, `detail.actual`.
- `SHARD_SPLIT_OUTPUT_REORDERED`: `detail.path`, `detail.output`,
  `detail.expected_order`, `detail.actual_order`.
- `SHARD_SPLIT_SECTION_ADDED`: `detail.path`, `detail.output`,
  `detail.line_start`, `detail.line_end`.
- `SHARD_SPLIT_SECTION_DROPPED`: `detail.path`, `detail.output`,
  `detail.line_start`, `detail.line_end`.
- `SHARD_SPLIT_SECTION_MOVED`: `detail.path`, `detail.line_start`,
  `detail.line_end`, `detail.expected_output`, `detail.actual_output`.
- `SHARD_SPLIT_SECTION_REORDERED`: `detail.path`, `detail.output`,
  `detail.line_start`, `detail.line_end`, `detail.expected_order`,
  `detail.actual_order`.

`SHARD_UNKNOWN_FIELD` also refuses an extra field in a concept row. A malformed
split concept or section row uses the existing `SHARD_MALFORMED` code.

## Changed files

- `scripts/lib/setup.js`: validates the accepted `payload.split_review` input,
  passes it to `partition`, and validates it again on `assemble` input.
- `scripts/lib/partition.js`: slices accepted reviews into worker briefs and
  validates exact worker output keys, target identity, ranges, ownership, and
  order.
- `scripts/lib/assembly.js`: permits several accepted outputs from one source
  in one shard, while retaining the existing cross-shard and cross-kind source
  duplicate refusal.
- `skills/okf-setup/SKILL.md`: documents the changed partition request, brief,
  worker result, findings, and procedure handoff.
- `test/issue-201-worker-split-mapping.test.js`: deterministic process-seam
  tests for accepted transfer and refusals.
- `test/issue-146.test.js`, `test/issue-147.test.js`, and
  `test/issue-149.test.js`: update existing fixtures to carry the real upstream
  `split_review` field.
- `.superpowers/sdd/issue-201/task-4-report.md`: this report.

`.claude/worktrees/issue-153-parent-dir` was not read for implementation,
modified, staged, or committed.

## Test evidence

TDD red run before production changes:

```text
node --test "test/issue-201-worker-split-mapping.test.js"
tests 4, pass 0, fail 4
```

The expected missing behavior was `brief.split_review`.

Focused Task 4 and partition/assemble regression run after implementation and
self-review:

```text
node --test "test/issue-201-worker-split-mapping.test.js" "test/issue-146.test.js" "test/issue-147.test.js"
tests 29, pass 29, fail 0
```

Task 4 process tests cover:

- accepted `data.split_review` carried unchanged into the brief;
- exact split worker result accepted by validate mode and `assemble`;
- added output refused by both seams;
- dropped output refused by both seams;
- moved section refused by both seams;
- source-level blocker refused when it replaces accepted outputs;
- changed output identity refused;
- changed output order refused;
- unknown worker mapping field refused.

Documentation request seam:

```text
node --test "test/issue-120-doc-executability.test.js"
tests 18, pass 18, fail 0
```

Required final suite after self-review:

```text
node --test "test/*.test.js"
tests 588, pass 588, fail 0, skipped 0, todo 0
duration_ms 13848.555125
```

`git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'` completed
with no output.

## Self-review

Self-review found and fixed these Task 4 issues before the final run:

- accepted proposal output keys could repeat while still passing a set check;
- output and section order needed an explicit worker-result check;
- split concept rows and section rows needed exact field allowlists;
- assembly's old one-source-to-one-concept duplicate rule needed a narrow
  exception for accepted outputs from the same source and shard;
- the existing source-level blocker seam could replace all accepted outputs;
- one old hand-built assemble fixture did not carry the new required brief
  field.

No open Task 4 finding remains. Tasks 5 through 7 must build on
`brief.split_review`, the split worker concept row fields above, and these exact
finding codes. They must not treat Task 4 validation as semantic preservation,
candidate conformance, review, publication safety, atomicity, rollback,
checkpoint, resume, or recovery.
