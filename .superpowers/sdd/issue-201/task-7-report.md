# Task 7 report: split-aware migration reporting

## Result

Task 7 extends the existing `report` operation and reporting code. It adds a
strict `payload.migration` form that consumes the exact accepted planning,
canonical validation, and publication artifacts from Tasks 3 through 6.

The report counts successful substantive output concepts. One reviewed source
that publishes three outputs reports three concepts. A navigation-only group
index is reported separately. A failed or not-attempted write is not an actual
output and does not increase the concept count.

No operation or dependency was added.

## Request fields

`report` now accepts exactly one of three forms: existing `payload.sources`,
existing `payload.packages`, or Task 7 `payload.migration`. More than one form,
or no form, is `UNSUPPORTED_INPUT`.

`payload.migration` has these exact fields:

- `settings`: exact accepted `migration-plan` `data.settings`.
- `split_review`: exact final accepted `migration-plan` `data.split_review`.
- `validation`: exact selected fields from one valid `migration-validate`
  response:
  - `structural_coverage`
  - `agent_semantic_review`
  - `semantic_fidelity`
  - `semantic_review`
- `publication`: exact successful Task 6 `publish` `data`.

`validation.semantic_review` is the canonical checked response artifact. It is
not the submitted review input. `validation.semantic_fidelity.assessed` stays
separate from `validation.agent_semantic_review.passed`.

Task 6 `publish` now returns this checked result with its existing fields:

```json
{
  "candidate_conformance": {
    "passed": true,
    "concepts": [
      {
        "source": "docs/guide.md",
        "concept": "install",
        "path": "install.md"
      }
    ],
    "navigation_indexes": [
      { "path": "operators/index.md" }
    ]
  }
}
```

`candidate_conformance.concepts` contains each substantive candidate checked by
Task 6. `navigation_indexes` contains each checked group index. The report does
not derive either set from write failures.

## Response fields

A valid Task 7 request returns `result: "ok"` with:

- `data.status`: exact Task 6 publication status.
- `data.summary`:
  - `sources_total`: distinct sources in the Task 6 substantive candidate set.
  - `concepts_created`: successful substantive concept writes.
  - `concepts_planned`: substantive Task 6 candidate concepts.
  - `writes_failed`: failed substantive concept writes.
  - `writes_skipped`: not-attempted substantive concept writes.
- `data.reviewed_sources`: one row for each accepted reviewed source.
- `data.writes`: `published`, `failed`, and `skipped` substantive writes.
- `data.navigation_writes`: `published`, `failed`, and `skipped` navigation
  index writes.
- `data.structural_coverage`: exact Task 5 flag.
- `data.agent_semantic_review`: exact Task 5 flag.
- `data.semantic_fidelity`: exact separate human-assessed flag.

Each `data.reviewed_sources[]` row has these exact fields:

- `path`
- `max_words_per_file`: effective accepted setting.
- `word_count`: accepted source word count.
- `review_reason`
- `accepted_result`: `keep_as_one` or `split`.
- `reason`: keep-as-one reason, or `null` for a split.
- `sections`: every accepted source section with its exact disposition.
- `planned_outputs`: every complete accepted proposal output.
- `actual_outputs`: complete accepted proposal outputs whose Task 6 writes were
  `clean`.
- `conformance_result`: `{ "passed": true }` from Task 6.
- `semantic_review_result`: `{ "passed", "sections" }`, with every canonical
  source-section verdict.
- `failed_writes`: exact Task 6 failed rows for this source's outputs.
- `skipped_writes`: exact Task 6 not-attempted rows for this source's outputs.

The existing human-review disclosure finding remains when
`semantic_fidelity.assessed` is false.

## Validation rules

The Task 7 boundary rejects instead of changing an input artifact. It checks:

- exact top-level fields for every Task 7 artifact;
- positive integer effective `max_words_per_file`;
- exact accepted split-review source coverage and row fields;
- complete section coverage, disposition, output ownership, and order through
  the shared Task 4 validator;
- accepted proposal shape and output cardinality;
- valid source `word_count` and `review_reason`;
- exact canonical semantic source and section coverage;
- the agent semantic flag against canonical verdicts;
- the human assessed flag against canonical `human_assessed`;
- structural and agent publication gates;
- exact Task 6 candidate, result, published, failed, skipped, and status sets;
- exact accepted planned outputs against candidate conformance;
- exact accepted navigation indexes against candidate conformance;
- exact Task 5 candidate paths against Task 6 candidate paths.

The runtime does not treat a missing failure as a success. Each Task 6 result
row must occur in exactly one of the successful, failed, or not-attempted sets.

## Count rules

- `concepts_planned` counts Task 6 substantive candidate concepts.
- `concepts_created` counts only substantive candidates in
  `publication.published`.
- One source with three successful outputs counts three concepts.
- A group `index.md` is a navigation write, not a substantive concept.
- A failed concept is listed in `writes.failed` and is not created.
- A not-attempted concept is listed in `writes.skipped` and is not created.
- `actual_outputs` contains only successful accepted output rows.

## Finding codes

Both Task 7 findings have `origin: "suite"`, `severity: "error"`,
`blocks: true`, and detail `{ "artifact", "reason" }`:

- `REPORT_ARTIFACT_MALFORMED`: an artifact or nested row has the wrong exact
  shape or value type.
- `REPORT_ARTIFACT_MISMATCH`: individually valid artifacts disagree about
  validation flags, accepted outputs, candidates, or write results.

The blocked response has `data.code: "UNSUPPORTED_INPUT"`.

## Changed files

- `scripts/lib/publication.js`: retains each checked concept's source in the
  Task 6 checked result.
- `scripts/lib/setup.js`: returns Task 6 candidate conformance and implements
  strict Task 7 report validation, counting, and source detail.
- `skills/okf-setup/SKILL.md`: documents the Task 7 request, response,
  validation, count rule, findings, and final Markdown output procedure.
- `test/issue-201-split-report.test.js`: deterministic process-seam fixtures.
- `.superpowers/sdd/issue-201/task-7-report.md`: this report.

The unrelated `.claude/worktrees/issue-153-parent-dir` path was not modified or
staged.

## Test evidence

TDD red run before production changes:

```text
node --test "test/issue-201-split-report.test.js"
tests 4, pass 0, fail 4
```

The failures showed the absent Task 6 `candidate_conformance` field and the
existing report refusal of `payload.migration`.

Focused green run after implementation:

```text
node --test "test/issue-201-split-report.test.js"
tests 4, pass 4, fail 0
```

Focused Task 7, existing report, Task 6, Task 5, and documentation run:

```text
node --test "test/issue-201-split-report.test.js" "test/issue-120-doc-executability.test.js" "test/issue-136.test.js" "test/issue-201-publish-precheck.test.js"
tests 65, pass 65, fail 0
```

Required complete suite:

```text
node --test "test/*.test.js"
tests 632, pass 632, fail 0, skipped 0, todo 0
duration_ms 41705.766541
```

Repository whitespace check:

```text
git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'
exit 0
```

## Process fixtures

The Task 7 process tests cover:

- one source to three substantive outputs counted as three;
- a navigation-only group index excluded from concept count;
- accepted keep-as-one result and reason;
- every accepted source-section disposition, including residue and assigned;
- every planned and actual output;
- conformance and per-section semantic-review results;
- partial publication with one successful, one failed, and one not-attempted
  concept;
- failed and not-attempted concepts excluded from actual outputs and count;
- malformed settings and split-review rows;
- mismatched human flag, candidate conformance, and publication success set.

## Self-review

Self-review found and fixed these issues before the final suite:

- An extra top-level split-review field first passed the report boundary. Task
  7 now requires the exact accepted row fields.
- Canonical semantic coverage first let a malformed source or section set look
  like a failed semantic verdict. Only a real non-preserved verdict can produce
  a valid false semantic result; other coverage failures block.
- Candidate conformance first compared only reviewed planned outputs. It now
  also compares the complete Task 5 candidate path set, including unreviewed
  concepts and navigation indexes.
- The human semantic-fidelity disclosure first disappeared from Task 7 output.
  It now uses the existing warning finding while the human flag remains
  separate from agent review.
- Exact split-review row fields first applied only to reviewed rows. They now
  apply to every supplied row.
- Unreviewed rows first had exact keys but did not cross-check `not_required`
  report values against the effective target. They now require the exact null
  reason, false required flag, and empty section/output values.

No open Task 7 finding remains from self-review.
