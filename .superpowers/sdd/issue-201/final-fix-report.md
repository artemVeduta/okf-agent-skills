# Issue 201 final review fix report

## Status

All eight Critical or Important findings are fixed in one change. The fixes use the existing operation seams and shared validators. No dependency or operation was added. The unrelated `.claude/worktrees/issue-153-parent-dir` change was not modified or staged.

## Findings and root fixes

### Critical 1: route ownership across proposal and publication

Root fix:

- Route rows now model `origin` separately from the accepted destination.
- Ordinary links use the output that contains the source link occurrence as `origin`.
- Anchor routes also use `target_output`, which names the output that owns the accepted destination heading.
- Whole-source routes use `origin: null` for external inbound links and an output key for links inside transformed source content.
- Publication checks only routes whose `origin` names an actual transformed candidate. External inbound rows keep their accepted destination decision but do not invent a link in that destination candidate.
- Accepted route validation checks exact row shape, route placement, output origin, target output, and whole-source target existence before publication.

Exact tests:

- `external inbound anchor decisions do not invent a candidate link, but an invented link blocks`
- `external inbound whole-source decisions do not invent a candidate self-link, but an invented link blocks`
- `a route cannot move to another accepted output with the same global target count`
- `a local anchor link in output A routes to its accepted heading in output B`
- `accepted whole-source routes require exact existing targets at every later boundary`
- `malformed accepted route rows fail closed at publication without throwing`

### Critical 2: no-reviewed-source default migration cannot report

Root fix:

- `migration-validate` now builds the canonical candidate list from the complete staged Markdown set even when there are zero reviewed sources.
- The simple `{ "performed": false }` input remains valid for no-review migrations. The canonical response contains all staged candidate paths and identities, with `sources: []`.
- Publication compares the exact Task 5 canonical candidate paths for reviewed and unreviewed migrations.

Exact tests:

- `an unsplit migration completes validation, publication, and report with one concept`
- `a clean staged bundle validates: complete, publishable, no findings`
- Updated legacy unsplit publication fixtures in `test/issue-149.test.js` and `test/issue-189.test.js` bind complete candidate bytes.

### Critical 3: post-write receipt persistence failure hides partial state

Root fix:

- Receipt removal remains a pre-dispatch failure with zero write outcomes.
- Receipt persistence failure after dispatch returns `failed/incomplete`, `PUBLICATION_RECEIPT_WRITE_FAILED`, `status: "partial"`, the actual `published`, `failed`, `skipped`, `results`, and `candidate_conformance` values, plus `phase: "post-dispatch"` on the receipt finding.
- The response does not contain `publication_receipt` because no receipt exists.

Exact tests:

- `a receipt removal failure is reported without a runtime failure or reportable receipt`
- `a receipt persistence failure after dispatch reports every actual write outcome`

### Important 1: output order drifts

Root fix:

- Task 2 accounting keeps first source occurrence order instead of sorting output keys.
- An accepted proposal's `outputs` array becomes the canonical output order.
- The accepted review's accounting output rows are reordered to that proposal order.
- Existing partition, assembly, publication, receipt, and report paths preserve that order.

Exact tests:

- `proposal output order becomes canonical without alphabetical reordering`
- `non-alphabetical accepted output order stays canonical through report`
- Existing worker output reorder tests remain green.

### Important 2: semantic_boundaries has no input

Root fix:

- Added `payload.semantic_boundary_sources`, a unique array of selected `migrate` paths derived by the setup procedure during source inspection.
- The runtime validates shape and exact migrate-path coverage. It does not detect semantic boundaries.
- Reason precedence is `above_target`, then `user_requested`, then `semantic_boundaries`.
- The report carries the accepted `review_reason` unchanged.

Exact tests:

- `setup-derived semantic boundaries open review without becoming a user request`
- `above-target and user-request reasons take precedence over derived semantic boundaries`
- `semantic boundary sources require unique selected migrate paths`

### Important 3: frontmatter and pre-heading prose are separate sections

Root fix:

- Section derivation now emits one `preamble` from line 1 through the line before the first ATX heading.
- Frontmatter is included in that preamble and no longer creates a disposition section.
- A no-heading source is one complete preamble.

Exact tests:

- `a source under split review carries one complete preamble before its heading sections`
- `a source with no heading at all is one indivisible preamble including frontmatter`
- `frontmatter without a heading is the complete preamble section`
- CRLF, setext-limit, fenced-heading, complete-coverage, and source-identity fixtures were updated and remain green.

### Important 4: block fallback applies to preamble

Root fix:

- Supplied subdivisions are valid only when all ranges stay inside one derived heading section.
- A preamble is indivisible, including a whole no-heading source.
- Legal visible block boundaries inside a heading section remain accepted. Fence, table, and list interior cuts remain refused.
- Added `SPLIT_SECTION_SUBDIVISION_INVALID` for subdivision outside one heading section.

Exact tests:

- `a preamble cannot be divided at a visible block boundary`
- `a heading section may be divided at a visible block boundary`
- Existing fence and table refusal fixtures remain green.

### Important 5: accepted whole-source routes can have null or unknown targets

Root fix:

- `validAccepted` requires every whole-source route target to be non-null and to name an exact accepted output or accepted group index.
- Accepted ordinary and anchor routes also require exact origin and destination output bindings.
- Refused renderable proposal input can still carry `target: null`; accepted downstream artifacts cannot.
- Publication receives malformed accepted artifacts through the shared boundary refusal and does not perform unsafe nested access.

Exact tests:

- `accepted whole-source routes require exact existing targets at every later boundary` covers null, unknown output, unknown group, and malformed targets.
- `malformed accepted route rows fail closed at publication without throwing`

## Changed files

- `scripts/lib/sections.js`
- `scripts/lib/split-proposal.js`
- `scripts/lib/publication.js`
- `scripts/lib/partition.js`
- `scripts/lib/setup.js`
- `skills/okf-setup/SKILL.md`
- `test/issue-120-doc-executability.test.js`
- `test/issue-148.test.js`
- `test/issue-149.test.js`
- `test/issue-189.test.js`
- `test/issue-201-split-trigger.test.js`
- `test/issue-201-source-sections.test.js`
- `test/issue-201-split-proposal.test.js`
- `test/issue-201-semantic-review.test.js`
- `test/issue-201-publish-precheck.test.js`
- `test/issue-201-split-report.test.js`
- `.superpowers/sdd/issue-201/final-fix-report.md`

## Test output

Focused final-review seam run:

```text
node --test "test/issue-120-doc-executability.test.js" "test/issue-148.test.js" "test/issue-149.test.js" "test/issue-189.test.js" "test/issue-201-split-trigger.test.js" "test/issue-201-source-sections.test.js" "test/issue-201-split-proposal.test.js" "test/issue-201-worker-split-mapping.test.js" "test/issue-201-semantic-review.test.js" "test/issue-201-publish-precheck.test.js" "test/issue-201-split-report.test.js"
tests 172
pass 172
fail 0
duration_ms 60674.485041
```

Required full suite after self-review:

```text
node --test "test/*.test.js"
tests 653
pass 653
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 82223.118959
```

Whitespace check:

```text
git diff --check -- . ':!.claude/worktrees/issue-153-parent-dir'
exit 0
```

## Self-review

- Confirmed accepted route validators reject null, unknown, malformed, wrong-origin, and wrong-target rows before publication nested access.
- Confirmed cross-output A to B anchor routes compare the actual link under A with the accepted heading under B.
- Confirmed external inbound README routes do not become self-links in the target candidate.
- Confirmed no-review semantic validation produces complete candidate identities and zero reviewed sources.
- Confirmed proposal output order is preserved end to end.
- Confirmed receipt consistency language makes no authenticity claim.
- Confirmed no atomicity, rollback, checkpoint, resume, or recovery behavior or claim was added.

## Concerns

- The receipt remains a workspace consistency artifact only. A caller with workspace write access can rewrite workspace artifacts coherently; no authenticity authority exists in this architecture.
- Setext headings remain outside section derivation, as already documented. They stay in the indivisible preamble unless a later recorded decision adds a CommonMark-capable heading rule.
