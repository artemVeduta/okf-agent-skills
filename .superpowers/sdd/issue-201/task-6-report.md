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

---

## Fix report: round 1 of 5

### Result

This round closes all six Critical Task 6 review findings. It adds no operation,
dependency, or Task 7 reporting behavior.

### Critical 1: exact plan, mapping, and candidate coverage

`publication.planMappingCoverage` compares migrate plan source paths and Concept
IDs with mapping rows by exact counted multisets. It rejects duplicate expected
or actual values, missing or extra rows, changed source ownership, changed
Concept ID, and changed type with `PUBLISH_PLAN_MAPPING_MISMATCH`.

Candidate comparison uses counted multisets for accepted candidates, staged
metadata, staged Markdown files, and review candidates. It compares duplicate
values and total counts as well as missing and extra values. Every plan migrate
entry contributes either its exact unsplit candidate or every accepted split
output. The A/B plan with A/A mapping fixture refuses before writer dispatch and
changes zero bundle files.

### Critical 2: canonical review coverage

`scripts/lib/semantic-review.js` is now the shared Task 5 and Task 6 canonical
coverage seam. It checks exact accepted reviewed-source coverage, exact accepted
`{ sections, outputs, proposal }`, exact section ranges including residue,
duplicate, missing, and extra ranges, and every verdict. Only `preserved` passes.

Missing and duplicate semantic section fixtures return
`PUBLISH_SEMANTIC_REVIEW_STALE` and write zero bundle files.

### Critical 3: unsplit source identity

Every migration mapping row now carries `source_identity`, the SHA-256 identity
of the complete current source bytes when migration-plan read them. Assembly
continues to carry the source observation binding, and Task 6 requires exactly
one binding for every one-source concept, including unsplit candidates. The
binding must name the accepted mapping source and digest.

Immediately before write 1, publication rereads every split and unsplit source
and compares it with the accepted identity. Changed, missing, or unreadable
unsplit sources return `PUBLISH_SOURCE_CHANGED` and write zero bundle files.

### Critical 4: complete route equality

Task 6 now compares counted normalized target multisets, not only caller route
metadata. Normalization retains query and fragment suffixes. Expected targets
include:

- every accepted ordinary route target;
- each heading-anchor route's accepted output path and target anchor;
- each whole-source route's accepted output or generated group-index path.

Actual targets come from parsed Markdown link occurrences in the checked
candidate and generated index bytes. Missing, extra, duplicate, wrong target,
and wrong anchor values return `PUBLISH_ROUTE_MISMATCH`. Actual heading outlines
are still checked separately; heading existence does not satisfy route equality.

### Critical 5: actual group, index, and provenance proof

Assembly stages one navigation-only index for every accepted reader-purpose
group. The staged index row carries the accepted group purpose, index entry, and
ordered child entries. Its bytes encode the accepted title, purpose, and ordered
child links. Task 6 requires every index candidate, proves group placement from
the actual output path, and compares the full deterministic index bytes. Missing
or wrong indexes return `PUBLISH_INDEX_MISSING` or
`PUBLISH_INDEX_CHANGED`.

Actual concept frontmatter `sources` must exactly equal the accepted authored
provenance assignment values. Caller metadata cannot replace this proof. A
mismatch returns `PUBLISH_PROVENANCE_MISMATCH`. The accepted complete output row
still binds display-only support explanations through the canonical semantic
review, while actual frontmatter proves the authored values.

### Critical 6: checked bytes and symlink refusal

The precheck reads each staged candidate once through `readBuffer` and returns
its canonical checked bytes, identity, parsed tree, and body. Writer briefs are
built from those checked values; `publish` does not reread staged files before
dispatch. A service-injection fixture changes `readFile` after the check and
proves the checked body is written.

Before collection, Task 6 refuses a symlinked staging root, ancestor, or file
with `PUBLISH_STAGING_SYMLINK`. Before each write, it checks target containment
and symlink ancestry again. Staging ancestor and file fixtures prove zero bundle
writes.

### Changed files

- `scripts/lib/semantic-review.js`: shared exact canonical review coverage.
- `scripts/lib/publication.js`: counted coverage, source identity, route/index/
  provenance proof, checked bytes, and symlink checks.
- `scripts/lib/migration.js`: adds accepted `source_identity` to mapping rows.
- `scripts/lib/assembly.js`: stages accepted navigation index candidates.
- `scripts/lib/setup.js`: reuses shared review coverage and writes only checked
  candidate bytes.
- `skills/okf-setup/SKILL.md`: documents the fixed Task 6 authority.
- `test/issue-201-publish-precheck.test.js`: deterministic fixtures for all six
  bypass groups.
- `test/issue-145.test.js`, `test/issue-149.test.js`, and
  `test/issue-189.test.js`: update affected contract fixtures.
- `.superpowers/sdd/issue-201/task-6-report.md`: this fix report.

### Test evidence

Red Task 6 run before production changes:

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 16, pass 7, fail 9
```

Green Task 6 run after the first implementation pass:

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 16, pass 16, fail 0
```

Focused migration-plan through publication, Task 5, worker mapping, and docs
regressions:

```text
node --test "test/issue-145.test.js" "test/issue-146.test.js" "test/issue-147.test.js" "test/issue-148.test.js" "test/issue-149.test.js" "test/issue-189.test.js" "test/issue-201-worker-split-mapping.test.js" "test/issue-201-semantic-review.test.js" "test/issue-201-publish-precheck.test.js" "test/issue-120-doc-executability.test.js"
tests 124, pass 124, fail 0
```

Final self-review added exact purpose-byte proof, raw-byte source rereads, support
for multiple accepted group indexes, and a route check where an ordinary concept
link targets an indexed child. The final verification evidence follows below.

Final Task 6 run:

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 18, pass 18, fail 0
```

Final complete suite:

```text
node --test "test/*.test.js"
tests 622, pass 622, fail 0
```

Repository whitespace check:

```text
git diff --check
exit 0
```

### Scope

Precheck refusal still writes zero bundle files. A later write failure still
reports earlier successful writes, the failed write, and later not-attempted
writes. No atomicity, rollback, checkpoint, resume, or recovery behavior or
claim was added. Task 7 reporting aggregation remains unimplemented.

---

## Fix report: round 2 of 5

### Result

This round closes all four Important Task 6 review findings. It adds no Task 7
reporting behavior.

### Important 1: per-candidate route ownership

Publication now compares counted route identities that contain both the owning
candidate path and the normalized target. Split ordinary routes use their
accepted output path as owner. Heading-anchor routes use the output that owns the
accepted source section. Whole-source routes use the accepted output or group
index target as owner. Moving an accepted route from one staged output to another
therefore changes both per-candidate multisets and returns
`PUBLISH_ROUTE_MISMATCH` before write 1.

The process fixture removes one accepted link from `install.md`, adds the same
target once to `operate.md`, preserves the global target count, and proves zero
bundle writes.

### Important 2: full ordinary-link suffixes

`mapping.normalizedLinkTarget` is the shared path, query, and fragment
normalization seam. Split route inventory now stores the complete normalized
ordinary target instead of only its path. Proposal validation compares that full
target, and publication compares it with the checked staged bytes.

A process fixture accepts and publishes `other.md?view=full#section`. Changing
only `#section` to `#wrong` returns `PUBLISH_ROUTE_MISMATCH` and writes zero
bundle files. Heading-anchor route validation is unchanged.

### Important 3: unsplit route authority

Every unsplit expected candidate now derives its expected route multiset from
the accepted `mapping.body`. This body is the migration-plan rewrite result, so
it is the existing accepted authority for migrated and retained project targets.
Publication parses it with the same shared link scanner and normalizer used for
checked candidate bytes. It compares the two counted multisets under the unsplit
candidate path and retains query and fragment suffixes.

A linked unsplit concept publishes when it matches the accepted mapping body.
Changing only its staged fragment returns `PUBLISH_ROUTE_MISMATCH` and writes
zero bundle files.

### Important 4: canonical cross-source groups

`scripts/lib/accepted-groups.js` is now the one accepted group collector used by
proposal acceptance, assembly, and publication. It reads every accepted reviewed
source, merges only identical purpose and index definitions, collects every
child, rejects duplicate order, path, title, or Concept ID, and sorts children by
accepted order. Cross-source proposals may share the same group index claim only
when this canonical collector accepts the complete definition.

Assembly renders the canonical group. Publication rebuilds the same canonical
group and compares the staged metadata and full deterministic index bytes. Two
reviewed sources contributing ordered `Alpha` and `Beta` children publish. A
duplicate child order or changed index link blocks before all writes.

### Changed files

- `scripts/lib/accepted-groups.js`: canonical accepted group definitions.
- `scripts/lib/mapping.js`: shared full link-target normalization.
- `scripts/lib/split-proposal.js`: retains suffixes and permits canonical shared
  group-index claims.
- `scripts/lib/assembly.js`: renders only canonical cross-source groups.
- `scripts/lib/publication.js`: per-candidate route proof and unsplit mapping-body
  route authority.
- `scripts/lib/setup.js`: refuses cross-source group conflicts during proposal
  acceptance.
- `skills/okf-setup/SKILL.md`: documents per-candidate and unsplit route proof.
- `test/issue-201-publish-precheck.test.js`: deterministic process fixtures for
  all four Important findings.
- `.superpowers/sdd/issue-201/task-6-report.md`: this round-2 report.

### Red evidence

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 23, pass 18, fail 5
```

The five failures were the route-move bypass, suffix rejection, unsplit-link
rejection, shared-group rejection, and shared-group conflict/tamper fixture.

### Green evidence

```text
node --test "test/issue-201-publish-precheck.test.js"
tests 23, pass 23, fail 0
```

```text
node --test "test/issue-201-split-proposal.test.js"
tests 21, pass 21, fail 0
```

```text
node --test "test/issue-147.test.js" "test/issue-201-worker-split-mapping.test.js"
tests 19, pass 19, fail 0
```

Final focused migration, proposal, assembly, semantic review, publication, and
documentation regressions:

```text
node --test "test/issue-120-doc-executability.test.js" "test/issue-145.test.js" "test/issue-146.test.js" "test/issue-147.test.js" "test/issue-148.test.js" "test/issue-149.test.js" "test/issue-189.test.js" "test/issue-201-split-proposal.test.js" "test/issue-201-worker-split-mapping.test.js" "test/issue-201-semantic-review.test.js" "test/issue-201-publish-precheck.test.js"
tests 152, pass 152, fail 0
```

Final complete suite:

```text
node --test "test/*.test.js"
tests 627, pass 627, fail 0
```

Repository whitespace check:

```text
git diff --check
exit 0
```

### Scope

No Task 7 aggregation, operation, dependency, rollback, recovery, checkpoint, or
resume behavior was added.
