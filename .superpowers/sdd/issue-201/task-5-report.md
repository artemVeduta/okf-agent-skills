# Task 5 report: per-section semantic review

## Result

Task 5 extends the existing `validSemanticReview` and `migration-validate`
seam. It accepts fresh read-only review evidence for each source section. The
exact verdicts are `preserved`, `missing`, `duplicated`, and `uncertain`. Only
`preserved` passes.

The result reports these values separately:

- `data.structural_coverage.passed`
- `data.agent_semantic_review.passed`
- `data.semantic_fidelity.assessed`

The runtime does not prompt or run a review agent. `skills/okf-setup/SKILL.md`
tells the procedure to launch a fresh-context read-only reviewer and submit its
complete result through `migration-validate`.

Task 6 candidate conformance and pre-write publication recheck are not part of
this task. Task 7 report aggregation is not part of this task.

## Exact request fields

`migration-validate` keeps these fields:

- `payload.cwd`: working tree path.
- `payload.bundle`: optional staging bundle name.
- `payload.selected`: selected source paths.
- `payload.plan`: accepted executable migration plan.
- `payload.today`: optional deterministic validation date.

Task 5 adds or extends these fields:

- `payload.split_review`: the final accepted `migration-plan`
  `data.split_review`, unmodified.
- `payload.semantic_review.performed`: boolean. It states only whether a human
  assessed semantic fidelity.
- `payload.semantic_review.candidates`: exact current staged Markdown set. Each
  row is `{ path, identity }`. `path` is staging-root-relative. `identity` is
  `sha256:<64 lowercase hexadecimal characters>` for the complete staged file
  bytes.
- `payload.semantic_review.sources`: exactly one row for each accepted reviewed
  source.

Each `semantic_review.sources[]` row has these exact fields:

- `path`: exact accepted source path.
- `source_identity`: exact `split_review[].source_identity` and the current
  source identity.
- `accepted`: exact `{ sections, outputs, proposal }` copied from the matching
  accepted `split_review[]` row.
- `sections`: exactly one review row for each accepted source section.

Each semantic section row has these exact fields:

- `line_start`: accepted 1-based inclusive section start.
- `line_end`: accepted 1-based inclusive section end.
- `verdict`: exactly `preserved`, `missing`, `duplicated`, or `uncertain`.

All accepted source sections need a review row, including residue sections.
Missing, duplicate, extra, malformed, or changed ranges are refused.

The simple `{ performed: true|false }` shape stays valid for migrations with no
accepted split review. The `report` operation still accepts only that simple
human-assessment shape. It does not accept Task 5 evidence fields.

## Exact response fields

A valid review request returns `result: "ok"` and keeps the existing
`migration-validate` data:

- `data.status`: `"complete"` only when structural coverage and agent semantic
  review pass; otherwise `"partial"`.
- `data.publishable`: Task 5 validation result. It is true only when structural
  coverage and agent semantic review pass. It is not Task 6 write authority.
- `data.missing_disposition`: selected sources with no plan disposition.
- `data.concepts_checked`: staged concepts checked by structural validation.
- `data.semantic_fidelity`: `{ assessed }`, from
  `semantic_review.performed` only.

Task 5 adds:

- `data.structural_coverage`: `{ passed }`. Blocking structural or source
  disposition findings make it false.
- `data.agent_semantic_review`: `{ passed }`. It is true only when every section
  verdict is `preserved`.

A malformed or stale review returns `result: "blocked"`,
`data.code: "UNSUPPORTED_INPUT"`, and one blocking finding. It does not guess,
repair, or ignore a row.

## Finding codes

Malformed or stale evidence findings have `origin: "suite"`,
`severity: "error"`, and `blocks: true`:

- `SEMANTIC_REVIEW_MALFORMED`: required rich review is absent, a source,
  candidate, section, or accepted review row has a bad shape, or a verdict is
  not one of the four exact values. `detail.reason` is `review_missing`,
  `row_shape`, `accepted_review_shape`, or `section_shape`; section shape also
  has `detail.path`.
- `SEMANTIC_REVIEW_SOURCE_SET_MISMATCH`: source rows do not exactly cover the
  accepted reviewed sources. Detail has sorted `missing`, `extra`, and
  `duplicate` arrays.
- `SEMANTIC_REVIEW_SECTION_SET_MISMATCH`: section rows do not exactly cover one
  accepted source's ranges. Detail has `path` and sorted `missing`, `extra`, and
  `duplicate` range-key arrays.
- `SEMANTIC_REVIEW_SOURCE_MISMATCH`: submitted source identity differs from the
  accepted or current source. Detail has `path`, `expected`, `submitted`, and
  `actual`.
- `SEMANTIC_REVIEW_ACCEPTED_MISMATCH`: submitted `accepted` value differs from
  the accepted `{ sections, outputs, proposal }`. Detail has `path`.
- `SEMANTIC_REVIEW_CANDIDATE_MISMATCH`: candidate rows do not exactly cover the
  current staged Markdown set, or one submitted identity differs from current
  bytes. Set detail has `missing`, `extra`, and `duplicate`; content detail has
  `path`, `expected`, and `actual`.

Non-preserved verdict findings also have `origin: "suite"`,
`severity: "error"`, and `blocks: true`. Detail has `path`, `line_start`, and
`line_end`:

- `SEMANTIC_SECTION_MISSING`
- `SEMANTIC_SECTION_DUPLICATED`
- `SEMANTIC_SECTION_UNCERTAIN`

`preserved` produces no semantic section finding.

## Freshness identity shape

The review binds all immutable inputs that Task 6 needs for a later staleness
check:

```json
{
  "performed": false,
  "candidates": [
    {
      "path": "install.md",
      "identity": "sha256:<complete staged-file bytes>"
    }
  ],
  "sources": [
    {
      "path": "docs/guide.md",
      "source_identity": "sha256:<complete current source text>",
      "accepted": {
        "sections": "<exact accepted source sections>",
        "outputs": "<exact accepted section-to-output mapping>",
        "proposal": "<exact accepted Task 3 proposal>"
      },
      "sections": [
        {
          "line_start": 1,
          "line_end": 3,
          "verdict": "preserved"
        }
      ]
    }
  ]
}
```

The runtime compares this evidence with:

- the current source through the existing `sections.identify` SHA-256 rule;
- the exact accepted `split_review` sections, outputs, and proposal through
  `node:util.isDeepStrictEqual`;
- the complete current staged Markdown path set;
- each complete current staged file through `node:crypto` SHA-256.

The candidate binding records what the review used. Task 5 does not compare the
candidate set with all accepted proposal fields. That complete conformance gate
belongs to Task 6.

## Changed files

- `scripts/lib/setup.js`: extends `validSemanticReview` for migration evidence,
  validates exact review coverage and freshness, emits verdict findings, and
  returns the three separate flags.
- `skills/okf-setup/SKILL.md`: documents the request, response, findings, and
  fresh-context read-only review procedure. It stops before Task 6 write
  authority.
- `test/issue-201-semantic-review.test.js`: adds deterministic process-seam
  fixtures through the accepted Task 3 proposal, exact Task 4 worker result,
  assembly, and `migration-validate`.
- `test/issue-120-doc-executability.test.js`: permits the documented optional
  `split_review` placeholder.
- `test/issue-136.test.js`: proves `report` refuses Task 5 evidence fields and
  keeps its narrower human-assessment contract.
- `.superpowers/sdd/issue-201/task-5-report.md`: this report.

No dependency or operation was added. The unrelated
`.claude/worktrees/issue-153-parent-dir` path was not read for implementation,
modified, staged, or committed.

## Test evidence

TDD red run before production changes:

```text
node --test "test/issue-201-semantic-review.test.js"
tests 7, pass 0, fail 7
```

The failures were the expected absent result flags and absent semantic review
refusals.

Focused Task 5 and shared-seam regression run after implementation and
self-review:

```text
node --test "test/issue-201-semantic-review.test.js" "test/issue-136.test.js" "test/issue-148.test.js" "test/issue-149.test.js" "test/issue-120-doc-executability.test.js" "test/issue-201-worker-split-mapping.test.js"
tests 75, pass 75, fail 0
```

The process tests cover:

- one fixture for each exact verdict;
- the three separate result flags;
- malformed, missing, duplicate, extra, and mismatched section rows;
- malformed accepted review input;
- changed source identity;
- changed accepted proposal or mapping;
- changed candidate content;
- missing, extra, and changed candidate sets;
- the accepted Task 3 split and exact Task 4 worker result mapping.

Required full suite:

```text
node --test "test/*.test.js"
tests 599, pass 599, fail 0, skipped 0, todo 0
duration_ms 19814.249375
```

`git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'` completed
with no output.

## Self-review

Self-review found and fixed these issues before the final suite:

- Rich Task 5 evidence was first accepted by `report`. The richer shape is now
  valid only at `migration-validate`; `report` keeps `{ performed }` only.
- Malformed accepted `split_review` input could reach nested values before a
  clear refusal. It now returns `SEMANTIC_REVIEW_MALFORMED`.
- The first candidate-set check compared staged paths with accepted outputs.
  That was Task 6 candidate conformance. Task 5 now compares evidence only with
  the complete current staged Markdown set and bytes.
- The procedure could still appear to enter publication after a Task 5 pass.
  It now stops and states that Task 6 must add write authority.

No open Critical, Important, or Minor Task 5 finding remains. There is no Task
6 publication precheck or candidate-conformance implementation and no Task 7
report aggregation. There is no atomicity, rollback, checkpoint, resume, or
recovery claim.
