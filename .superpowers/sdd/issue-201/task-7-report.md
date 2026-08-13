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

---

## Fix report: round 1 of 5

### Result

This round makes Task 7 count only from a suite-owned Task 6 receipt. It also
closes impossible sequence states, binds unreviewed candidates to the accepted
plan and mapping, strengthens canonical semantic identity checks, and refuses
malformed unreviewed rows before nested access.

### Trustworthy publication receipt

No signed or opaque harness receipt exists for the `publish` operation. Task 6
already owns `.okf-staging/<bundle>` as its suite-managed publication seam, so
it now writes one fixed `.okf-publication-receipt.json` there after the ordered
write sequence ends.

The receipt has:

- `protocol: "okf-publication-receipt/1"`;
- SHA-256 identities of the canonical JSON forms of the exact accepted `plan`,
  `mapping`, `split_review`, and canonical `semantic_review`;
- every checked substantive candidate's source, Concept ID, path, type, and
  checked complete-byte identity;
- every checked navigation index path and complete-byte identity;
- the single ordered Task 6 result sequence;
- the exact status, published, failed, and not-attempted classification.

Task 6 returns `data.publication_receipt: { path, identity }`. Task 7 requires
that path to be the fixed receipt under `.okf-staging/<bundle>`, reads its bytes,
checks their identity, parses the exact receipt shape, and compares every bound
artifact and outcome. Caller JSON cannot change a failed row to clean without
disagreeing with the suite-owned receipt. The hash is an integrity check, not an
authenticity proof. Independent evidence comes from reading the fixed
suite-owned file instead of trusting caller result JSON.

A later Task 6 call replaces the fixed receipt with that later call's observed
result. The receipt is a reporting artifact only.

### Sequential result semantics

Task 7 now requires one exact Task 6 sequence:

- zero or more `clean` attempted rows;
- at most one first non-clean attempted row;
- every later row is `not-attempted`;
- no clean row can follow a failed row;
- `complete` means every row is clean and failed/skipped are empty;
- `partial` means the sequence contains a failed or not-attempted row and the
  classification arrays exactly match the sequence.

Substantive concepts and navigation indexes share this one dispatch order.
`REPORT_ARTIFACT_MISMATCH` with `artifact: "publication"` and
`reason: "result_sequence"` refuses impossible states.

### Accepted candidate coverage

Task 7 `payload.migration` now also requires the exact accepted `plan` and
`mapping`. The existing Task 6 plan/mapping coverage validator runs first. The
report then derives every expected substantive candidate:

- a reviewed source contributes every accepted proposal output with exact
  source, Concept ID, path, and type;
- an unreviewed source contributes its exact mapping source, Concept ID, path,
  and type.

The complete derived candidate set must equal the receipt-backed Task 6
candidate set. The candidate source set therefore equals the accepted migrate
source set, and caller-added or reassigned source/concept rows cannot increase
report counts.

### Semantic and unreviewed boundaries

The shared canonical semantic coverage seam now compares each semantic source's
`source_identity` with the matching accepted `split_review.source_identity`
before it checks accepted values and exact section verdict coverage. A changed
but valid SHA-256 value blocks as a semantic-review mismatch.

The shared Task 4 split-review validator now requires an unreviewed row's
`sections` and `outputs` to be exact empty arrays. Null or string values return a
normal blocking response and do not reach nested access.

### Finding codes

The existing Task 7 codes remain:

- `REPORT_ARTIFACT_MALFORMED`
- `REPORT_ARTIFACT_MISMATCH`

New receipt reasons are `path`, `unavailable`, `identity`, `content`,
`accepted_artifacts`, `data_mismatch`, and `checked_candidates`. Impossible
Task 6 order uses `result_sequence`.

If Task 6 cannot write its suite-owned receipt after the publication sequence,
it returns `failed/incomplete` with `PUBLICATION_RECEIPT_WRITE_FAILED` and no
reportable Task 7 publication result.

### Changed files

- `scripts/lib/publication.js`: canonical artifact identities and receipt
  construction.
- `scripts/lib/setup.js`: receipt persistence, receipt validation, sequential
  result validation, exact plan/mapping candidate coverage, and Task 7 counting
  from verified evidence.
- `scripts/lib/partition.js`: exact empty arrays for unreviewed rows.
- `scripts/lib/semantic-review.js`: exact reviewed source identity comparison.
- `skills/okf-setup/SKILL.md`: receipt, request, sequence, and final procedure
  contract.
- `test/issue-201-split-report.test.js`: deterministic Task 7 bypass and boundary
  fixtures.
- `test/issue-201-publish-precheck.test.js`: complete and partial receipt content.
- `test/issue-149.test.js` and `test/issue-189.test.js`: exact unreviewed response
  fixtures.
- `.superpowers/sdd/issue-201/task-7-report.md`: this fix report.

The unrelated `.claude/worktrees/issue-153-parent-dir` path was not modified or
staged.

### Red evidence

```text
node --test "test/issue-201-split-report.test.js" "test/issue-201-publish-precheck.test.js"
tests 32, pass 21, fail 11
```

The failures showed the absent durable receipt, report acceptance of coherent
failed-to-clean edits and impossible result order, missing plan/mapping input,
missing semantic source identity comparison, and unsafe unreviewed nested
values.

### Green evidence

```text
node --test "test/issue-201-split-report.test.js" "test/issue-201-publish-precheck.test.js"
tests 32, pass 32, fail 0
```

Focused report, Task 4/5, Task 6, legacy publication, oversized receipt, and
documentation regressions:

```text
node --test "test/issue-136.test.js" "test/issue-201-split-report.test.js" "test/issue-201-publish-precheck.test.js" "test/issue-201-semantic-review.test.js" "test/issue-201-worker-split-mapping.test.js" "test/issue-149.test.js" "test/issue-189.test.js" "test/issue-120-doc-executability.test.js"
tests 104, pass 104, fail 0
```

Requested focused report run:

```text
node --test "test/issue-201-split-report.test.js" "test/issue-136.test.js"
tests 30, pass 30, fail 0
```

Requested Task 6 run:

```text
node --test "test/issue-201-publish-precheck.test.js" "test/issue-149.test.js" "test/issue-189.test.js"
tests 33, pass 33, fail 0
```

Final complete suite:

```text
node --test "test/*.test.js"
tests 638, pass 638, fail 0, skipped 0, todo 0
duration_ms 40117.587917
```

Repository whitespace check:

```text
git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'
exit 0
```

### Self-review

Self-review found and fixed these follow-up issues:

- Receipt path validation first allowed any normalized repository-relative path
  with the correct basename. It now requires the exact three-part
  `.okf-staging/<bundle>/.okf-publication-receipt.json` shape.
- Receipt envelope validation first did not strictly check nested artifact
  identities and checked-candidate rows. Every nested row now has exact fields,
  normalized identity values, and valid SHA-256 values.
- Candidate and result membership first used exact sets without separately
  proving their common Task 6 order. The receipt now requires result identities
  in the exact checked candidate order shared by concepts and indexes.
- Older publication fixtures carried abbreviated unreviewed rows. They now use
  exact empty `sections` and `outputs` arrays; production validation remains
  strict.
- The first contract text could imply that the receipt hash supplied
  authenticity. It now states that the hash checks integrity and that the
  independent evidence is the suite-owned on-disk receipt.

No open Critical or Important fix-round finding remains.

---

## Fix report: round 2 of 5

### Result

This round closes the four concrete receipt boundary defects. It adds no trust
mechanism and makes no authenticity claim.

### Receipt path safety

Task 7 now applies Task 6's `safePath` lstat walk to the receipt and all of its
ancestors, then resolves the existing Git root and receipt with `realpath` and
requires real containment. A symlinked receipt file, `.okf-staging` ancestor, or
bundle ancestor returns `REPORT_ARTIFACT_MALFORMED` with
`artifact: "publication_receipt"` and `reason: "symlink"`.

The expected receipt path is now derived from normalized `payload.bundle`:

```text
.okf-staging/<normalized payload.bundle>/.okf-publication-receipt.json
```

This permits a nested bundle such as `docs/bundle` and still requires the exact
fixed basename and staging convention. An invalid or different path uses
`reason: "path"`.

### Nested receipt rows

Every `checked_candidates` value is now checked as a non-null plain object before
the runtime reads `kind`. Null, strings, arrays, bad fields, invalid relative
paths, and invalid identities return `REPORT_ARTIFACT_MALFORMED` with
`reason: "content"`; they do not cause `RUNTIME_FAILURE`.

### Receipt I/O boundary

Receipt removal now runs inside the same owned failure boundary as receipt
writing and runs before the first publication dispatch. A remove or directory
error returns:

```text
result: failed/incomplete
data.code: PUBLICATION_RECEIPT_WRITE_FAILED
finding: PUBLICATION_RECEIPT_WRITE_FAILED
```

No publication write is attempted and no `data.publication_receipt` is returned.

### Authenticity concern: BLOCKED

There is no legitimate caller-inaccessible authenticity seam in the current
architecture:

- every wrapper and delegated wrapper runs with the same workspace permissions
  available to the caller;
- the Task 6 receipt, staging files, bundle files, and request artifacts are all
  in that writable workspace;
- `okf-delegation/1` receipts are plain JSON and have no opaque harness token;
- the runtime has no privileged process, signer, protected key, external store,
  or other authority unavailable to a caller with full workspace write access;
- the project requires a stateless zero-dependency request/response runtime.

A caller with full workspace write access can rewrite both the receipt file and
the matching request JSON. No local hash can distinguish that coherent rewrite.
Adding a machine-local secret, keychain, remote service, caller-stored hash, or
new signing infrastructure would be a new trust architecture and is explicitly
out of scope.

The retained receipt is therefore a consistency and accidental-tamper check,
not an authenticity proof. The original Task 7 brief required exact prior
response artifacts and strict mismatch refusal. It did not require adversarial
authenticity against a caller who controls all workspace bytes. That stronger
property is BLOCKED until the system supplies a genuinely privileged evidence
authority.

### Changed files

- `scripts/lib/publication.js`: existing-path lstat and realpath safety reuse.
- `scripts/lib/setup.js`: normalized nested receipt paths, symlink refusal,
  null-safe nested validation, and receipt removal failure handling.
- `skills/okf-setup/SKILL.md`: exact path, symlink, consistency, and authenticity
  limits.
- `test/issue-201-split-report.test.js`: receipt/ancestor symlinks, nested bundle,
  and null/nonobject receipt rows.
- `test/issue-201-publish-precheck.test.js`: injected receipt removal failure.
- `.superpowers/sdd/issue-201/task-7-report.md`: this round-2 report.

The unrelated `.claude/worktrees/issue-153-parent-dir` path was not modified or
staged.

### Red evidence

```text
node --test "test/issue-201-split-report.test.js" "test/issue-201-publish-precheck.test.js"
tests 37, pass 33, fail 4
```

The failures were the unhandled remove exception, accepted receipt symlink,
rejected valid nested bundle fixture, and null receipt-row runtime failure.

### Green evidence

```text
node --test "test/issue-201-split-report.test.js" "test/issue-201-publish-precheck.test.js"
tests 37, pass 37, fail 0
```

Final focused, full-suite, and self-review evidence follows after verification.

Requested focused report run:

```text
node --test "test/issue-201-split-report.test.js" "test/issue-136.test.js"
tests 33, pass 33, fail 0
```

Requested Task 6 run:

```text
node --test "test/issue-201-publish-precheck.test.js" "test/issue-149.test.js" "test/issue-189.test.js"
tests 34, pass 34, fail 0
```

Documentation request seam:

```text
node --test "test/issue-120-doc-executability.test.js"
tests 18, pass 18, fail 0
```

Final complete suite:

```text
node --test "test/*.test.js"
tests 642, pass 642, fail 0, skipped 0, todo 0
duration_ms 54441.204083
```

Repository whitespace check:

```text
git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'
exit 0
```

### Self-review

Self-review confirmed:

- expected receipt paths come from the same normalized bundle value and staging
  convention that Task 6 uses, including nested bundle paths;
- the existing-path check rejects a symlink at the receipt, bundle staging root,
  or `.okf-staging` ancestor and also proves realpath containment in the Git root;
- nested receipt row validation tests object shape before reading `kind`;
- receipt removal happens before dispatch and inside the receipt I/O failure
  boundary, so a removal failure cannot publish or return a receipt;
- all receipt language describes consistency and accidental-tamper detection,
  not authenticity.

No open concrete round-2 finding remains. Adversarial authenticity remains the
explicit BLOCKED architectural concern above.
