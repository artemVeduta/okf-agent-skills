# Task 6 report: pre-write recheck and honest partial publication

## Result

Task 6 extends the existing `publish` operation. It adds no operation and no
dependency. `publish` is now the only publication authority after Task 5.
Before write 1, it reruns target-bundle validation, source identity, complete
candidate-set equality, and canonical semantic-review freshness. A refusal
writes zero bundle files. A later write failure stops the sequence and reports
successful, failed, and not-attempted concepts separately.

Task 7 report aggregation is not implemented.

## Request fields

`publish` requires:

- `payload.cwd`: active working tree path.
- `payload.bundle`: optional bundle name, default `okf`.
- `payload.task_kind`: `feature work`, `fix`, or `research`.
- `payload.staged`: complete `assemble` `data.staged`, unmodified.
- `payload.plan`: exact accepted `migration-plan` `data.plan`.
- `payload.mapping`: exact accepted `migration-plan` `data.mapping`.
- `payload.split_review`: exact accepted `migration-plan`
  `data.split_review`.
- `payload.semantic_review`: canonical checked `migration-validate`
  `data.semantic_review`, not the submitted Task 5 input.

An unsplit staged row has exact fields `path`, `concept`, `type`, `shard`,
`file`, and `sources`. A split staged row also has:

- `output`: accepted opaque output key.
- `sections`: exact ordered accepted `[{ line_start, line_end }]` assignment.
- `accepted_output`: the complete accepted proposal output row. It binds the
  Concept ID, path, type, title, heading outline, group, index and child row,
  provenance assignments, link routes, and anchor routes.

Malformed rows, malformed canonical review data, incomplete plan/mapping
coverage, or malformed accepted split review return `result: "blocked"` with
`data.code: "UNSUPPORTED_INPUT"` before publication.

## Response fields

A completed write sequence returns `result: "ok"` with:

- `data.status`: `complete` when every write is `clean`; `partial` otherwise.
- `data.published`: concepts whose delegated writes returned `clean`.
- `data.failed`: the first failed attempted write as `{ concept, status }`.
- `data.skipped`: every later write as `{ concept, status: "not-attempted" }`.
- `data.results`: attempted results and explicit not-attempted rows.

A Task 6 precheck refusal returns `result: "blocked"` and
`data.code: "PUBLISH_PRECHECK_FAILED"`. It performs no writer dispatch and
writes zero bundle files.

## Equality model

The validator first derives the accepted candidate list:

- Each accepted reviewed source contributes every proposal output.
- Each unreviewed `migrate` source contributes its required unsplit mapping
  output.
- Skip and residue plan entries contribute no candidate.

It then compares three exact path sets: accepted candidates, complete staged
Markdown files, and `payload.staged`. Missing, extra, duplicate, or different
total count blocks.

For each split candidate, it compares assembly metadata with the accepted
proposal output and reads the actual staged file. It checks:

- output key, Concept ID, path, and type;
- exact source-section assignment and order;
- complete accepted output row, including group, navigation index, child row,
  provenance assignments, link routes, and anchor routes;
- staged `status: draft`, actual frontmatter type, and authored provenance;
- actual H1 title and complete ATX heading outline;
- actual parsed Markdown link targets;
- required accepted target anchors in the actual heading outline.

For each unsplit candidate, it checks the accepted mapping Concept ID, path,
type, source path, staged `status: draft`, and exact authored provenance.

If a field cannot be read or proven, publication blocks. It does not infer a
replacement value.

## Freshness model

The final Task 6 check runs after the delegated target-bundle read and before
write 1. It rechecks:

- every staged source binding against current source bytes;
- each reviewed source against accepted `source_identity` and current bytes;
- canonical review accepted sections, output mapping, and proposal against the
  current accepted `split_review`;
- every canonical candidate path and identity against the current complete
  staged Markdown set and current complete bytes;
- every semantic section verdict; only `preserved` passes.

`semantic_review.human_assessed` stays a separate value. It does not change any
agent verdict and cannot make a stale or non-preserved review pass.

## Finding codes

All codes below have `origin: "suite"`, `severity: "error"`, and
`blocks: true`:

- `PUBLISH_CANDIDATE_SET_MISMATCH`: accepted, staged-file, and staged-metadata
  sets or counts differ.
- `PUBLISH_CANDIDATE_CHANGED`: one candidate field, metadata value,
  frontmatter value, title, heading outline, provenance value, link target, or
  anchor differs.
- `PUBLISH_CANDIDATE_SCAN_INCOMPLETE`: complete staging enumeration failed.
- `PUBLISH_CANDIDATE_READ_FAILED`: a required staged file cannot be read or
  parsed.
- `PUBLISH_SOURCE_CHANGED`: current source bytes differ from their accepted
  identity or staged source binding.
- `PUBLISH_SEMANTIC_REVIEW_STALE`: canonical review source coverage, accepted
  value, verdict, candidate set, or candidate identity is no longer current.

A candidate-set or candidate-field mismatch requires one new complete
proposal. No partial patch is accepted.

## Write semantics

Precheck failure means zero bundle writes. Tests compare complete bundle
snapshots before and after each refusal.

After write 1, publication is sequential. The first failed delegated write
ends the sequence. Earlier clean writes remain in `data.published`; the failed
write appears in `data.failed`; every later concept appears in `data.skipped`
with `status: "not-attempted"`.

There is no atomic publication, rollback, checkpoint, resume, or recovery
behavior or claim.

## Changed files

- `scripts/lib/publication.js`: focused Task 6 boundary validation.
- `scripts/lib/assembly.js`: carries exact split accepted-output metadata and
  emits only accepted per-output provenance.
- `scripts/lib/setup.js`: validates the Task 6 request, runs the final precheck,
  and stops publication at the first failed write.
- `skills/okf-setup/SKILL.md`: makes Task 6 step 11 the sole publication
  authority after Task 5.
- `test/issue-201-publish-precheck.test.js`: deterministic Task 6 process-seam
  fixtures.
- `test/issue-149.test.js`, `test/issue-174.test.js`, and
  `test/issue-189.test.js`: update prior publish tests to the Task 6 boundary;
  remove superseded Task 5-era split publication fixtures.
- `.superpowers/sdd/issue-201/task-6-report.md`: this report.

The unrelated `.claude/worktrees/issue-153-parent-dir` path was not read for
implementation, modified, staged, or committed.

## Test evidence

TDD red run before production changes:

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 6, pass 0, fail 6
```

The failures showed the old publish path accepting extra, missing, changed,
stale, and malformed Task 6 inputs, and continuing after a write failure.

Focused Task 6 process run after implementation:

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 7, pass 7, fail 0
```

It covers an accepted split plus required unsplit output, extra candidate,
missing candidate, changed actual candidate field, changed accepted metadata,
stale review, changed source at the final pre-write check, malformed boundary
input, zero-write refusal, and honest mid-sequence partial publication.

Final focused and full-suite evidence is recorded after the final verification
runs below.

Focused Task 3 through Task 6, publication regression, assembly, and docs run:

```text
node --test "test/issue-120-doc-executability.test.js" "test/issue-201-publish-precheck.test.js" "test/issue-201-semantic-review.test.js" "test/issue-201-worker-split-mapping.test.js" "test/issue-201-split-proposal.test.js" "test/issue-149.test.js" "test/issue-174.test.js" "test/issue-189.test.js" "test/issue-147.test.js"
tests 103, pass 103, fail 0
```

Required full suite before final self-review fix:

```text
node --test "test/*.test.js"
tests 611, pass 611, fail 0, skipped 0, todo 0
duration_ms 23204.328458
```

The final verification run below supersedes this first full-suite run.

Final required suite after self-review fixes:

```text
node --test "test/*.test.js"
tests 611, pass 611, fail 0, skipped 0, todo 0
duration_ms 23609.539959
```

`git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'` completed
with no output.

## Self-review

The first self-review found and fixed:

- assembly copied all source provenance to every split output instead of only
  the accepted output assignments;
- split staged metadata carried only output and ranges, so group, index,
  provenance-route, link-route, and anchor-route equality could not be proven;
- the Task 6 check first ran before the delegated target read instead of as the
  final action before write 1;
- older publish tests still asserted that publication continued after failure;
- older docs allowed narrowing the staged set after a partial publication.
- canonical review boundary validation did not require the exact nested
  `accepted` fields;
- actual link comparison first compared raw Markdown resources instead of
  resolved target paths.
- plan, mapping, and path rows first reused permissive upstream shape checks;
  Task 6 now requires their exact current fields and normalized paths.

No Task 7 reporting aggregation was added.
