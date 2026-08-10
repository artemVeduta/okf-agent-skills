# Session Analytics

Session: `/okf-agent-skills:okf-setup` — migrate `docs/` and GitHub issues into the `okf/` bundle
Date: 2026-08-10
Repository: `okf-agent-skills` @ `main` (`b500fc6`)
Analyzed with: `SELF-IMPROVING-SESSION-ANALYTICS.md` (v1)

---

## Executive Summary

**Outcome: PARTIAL**

**Overall score: 71/100**

The migration itself completed and is verifiable: 115 concepts published with `clean` delegation
receipts, zero failures, the bundle validating with no blocking findings, and every concept
reachable from an index. Two genuine defects in the runtime were found and one was root-caused and
fixed with a regression test that provably gates it (507/507 suite green). The session is scored
PARTIAL rather than SUCCESS for one reason: the user, not the agent, caught that `CONTEXT.md` — the
project's own domain glossary, and a file the migration runtime names *explicitly* in its
deterministic type table — had been silently excluded from scope. The agent had seen that file,
listed it in a scope option as excluded, and moved on without weighing it. A second, smaller
failure was self-caught: the first regression test written for the `maxBuffer` fix was vacuous and
passed with the bug present.

---

## Goal

- **Primary goal:** Bootstrap and populate the `okf/` bundle from existing project knowledge —
  `docs/`, the current code context, and the GitHub issue corpus — using a medium-scale
  sub-agent workflow.
- **Constraints (explicit, from the user):**
  - Use a medium-sized workflow with sub-agents for the large decision maps.
  - Do not treat `.okf-wayfinder-export/` as a source of truth; remove it.
  - Remove the stale worktree copy.
  - Source GitHub issues live from `gh`, not from the committed export.
- **Constraints (inherited):** the 17-step `okf-setup` procedure; zero runtime dependencies;
  no invented value for an open specification row; report only what was actually done.
- **Success criteria (implicit):** every durable knowledge source either becomes a concept or gets
  an intentional, stated disposition; nothing silently dropped; semantic fidelity never claimed
  by a structural check.

---

## What Worked

1. **Inspected before acting, and gated every destructive step on consent.** `inspect` ran first
   and reported all three config files already `ok`, so nothing was repaired that did not need it.
   The stale worktree and the export directory were both examined (tracked status, branch state,
   size) and their removal confirmed before execution.
2. **Used `git worktree remove` instead of `rm -rf` for the worktree.** The branch
   `ci-proof/issue-107` carried 3 commits present in no other branch. Directory removal via the
   git command preserved the ref; `rm -rf` would have orphaned them.
3. **Detected duplicate-corpus contamination before planning.** The first whole-repo `discover`
   returned 188 markdown files, roughly half of them a complete second copy of the repository
   under `.claude/worktrees/` plus 51 files under `.okf-wayfinder-export/`. Scoping was raised as
   a user decision instead of planning over a corpus guaranteed to collide with itself.
4. **Caught the `Glossary` type-inference misfire before it blocked assembly.** A self-initiated
   collision check over the plan's `migrate` set found 13 research documents collapsing into 2
   concept paths (`docs/research/glossary` claimed by 6 sources, `.../ecosystem-deep/glossary` by
   7). Evidence was shown to the user (the actual matching `**Bold**:` lines — `**Source**:`,
   `**Implication**:`, `**\`[ANALYSIS]\`**:` ×30) before proposing the fix, and the fix was applied
   at the source, which is the only sanctioned correction: a `migrate`-disposition entry is not an
   open question and `payload.answers` cannot override it.
5. **Kept a 2.1 MB corpus out of agent context.** Shard briefs were written to files and workers
   were instructed to build their shard JSON programmatically rather than retype bodies. All 13
   workers returned valid shards on the first attempt with zero retries; total measured cost
   460,250 sub-agent tokens, longest worker 43.1 s, all parallel.
6. **Root-caused the SIGTERM instead of working around it.** `PUBLISH_PRECHECK_FAILED` /
   `DELEGATED_DISPATCH_FAILED` was traced to `spawnSync` without `maxBuffer` in the shared
   dispatch, reproduced in isolation (2 MiB child → `signal SIGTERM, status null, stdout truncated
   to 1,114,112`; with `maxBuffer` raised → `signal null, status 0, stdout 2,097,152`), and fixed
   in the one shared function every delegated caller routes through.
7. **Verified the fix's test actually gates the fix.** Reverting `maxBuffer` and re-running was an
   explicit step, not an assumption — and it is what exposed the vacuous first test.
8. **Never claimed semantic fidelity.** `semantic_review.performed` was left `false` throughout,
   and the closing line of every report stated plainly that structural checks do not establish it.

---

## What Failed

### E1 — `CONTEXT.md` excluded from scope without being weighed

- **Category:** Reasoning / goal understanding
- **Severity:** high
- **Evidence:** The user's scope request was "docs + current code + gh issues". `discover` was
  invoked with `package_root: "docs"` and `package_root: ".okf-gh"`. `CONTEXT.md` sits at the
  repository root, was therefore never scanned, and 0 plan entries mention it. The agent's own
  scope question named it in an option description ("Excludes ... root README/AGENTS/CONTRIBUTING")
  — so the file was seen and dismissed, not overlooked. The user had to ask "do you migrated
  CONTEXT.md as glossary?" to surface it.
- **Impact:** The single highest-value durable document in the project — 47.7 KB / 1002 lines of
  domain language — was left out of a migration whose stated purpose was to capture durable
  knowledge. The bundle had zero `Glossary` concepts on first completion. `migration-plan`'s
  deterministic table names a filename of exactly `CONTEXT.md` → `Glossary`, so the runtime would
  have placed it with no question asked. The same inference rule that misfired on 13 research
  documents was the one written for this file, and the file was out of scope.
- **Root cause:** Scope options were derived from **where the file count was**, not from **where
  durable knowledge was**. Root-level markdown was compressed into a single dismissive clause in
  an option description instead of being enumerated as its own decision with each file's likely
  type named.
- **Correction (applied):** Migrated in a second pass — `discover` → `migration-plan` (type
  `Glossary` inferred, no question) → shard → `assemble` → `migration-validate` → `publish`.
  Published as `okf/glossary.md`, content byte-identical, receipt `clean`, linked from the root
  index.
- **Prevent next time:** See rule R1.

### E2 — First regression test for the `maxBuffer` fix was vacuous

- **Category:** Execution / verification
- **Severity:** medium-high
- **Evidence:** The first version of `test/delegate-response-size.test.js` asserted the >1 MiB
  premise against a **direct** `okf-read validate` call, but dispatched an `operation_class: 'read'`
  brief through the bridge — a narrow read whose response never approached 1 MiB. It passed with
  the bug present and with the bug fixed.
- **Impact:** Had the revert check been skipped, a test asserting nothing would have shipped as
  proof of a fix — worse than no test, because it reads as coverage.
- **Root cause:** The premise was asserted on a different call than the one under test. No check
  that the *path under test* actually reached the boundary condition.
- **Correction (applied):** Rewritten to dispatch the exact brief `publish` sends
  (`operation_class: 'validate'`, `paths: [bundle]`, read from `publishPrecheckBrief`), and
  confirmed to fail without `maxBuffer` and pass with it.
- **Prevent next time:** See rule R2.

### E3 — Flat concept layout never raised as a design question

- **Category:** Execution / planning
- **Severity:** medium
- **Evidence:** 58 concepts landed directly in `okf/decisions/` and 53 in `okf/research/`, with no
  sub-grouping. The concept paths came from `migration-plan`'s deterministic derivation
  (`<canonical dir>/<basename>`), which the agent treated as the only available layout.
- **Impact:** Two directories with ~55 flat entries each. Navigable, since every entry is indexed,
  but the source corpus had real structure (`docs/research/ecosystem-deep/`,
  `docs/research/migration-sections/`, and the issue-label classes) that was flattened away
  without the user being asked.
- **Root cause:** A deterministic runtime output was accepted as a constraint rather than as a
  default worth surfacing. Organization was never presented as a choice.
- **Correction:** Not applied — this is the user's open question 4 below, not an agent-side fix.
- **Prevent next time:** See rule R3.

### E4 — Cleared `.okf-staging/` after listing it as the user's decision

- **Category:** Instruction following
- **Severity:** low
- **Evidence:** `.okf-staging/` was reported to the user as an outstanding item awaiting their
  say, then removed by the agent one turn later at the start of the `CONTEXT.md` pass. The removal
  was disclosed in the same output, and the directory is regenerable scratch already consumed by
  `publish`, so no data was lost.
- **Impact:** Minor, but it is an inconsistency: an item framed as the user's call was then decided
  unilaterally.
- **Root cause:** Local convenience (a clean staging area for the second pass) overrode a
  commitment made one turn earlier. No re-read of what had been handed to the user as pending.
- **Prevent next time:** See rule R4.

### E5 — Guessed a wrapper operation name

- **Category:** Tool error
- **Severity:** low
- **Evidence:** An `okf-read` `navigate` call returned `blocked` / `UNKNOWN_OPERATION`. The
  operation does not exist; the skill's operation list was not checked first.
- **Impact:** One wasted call, no side effects.
- **Root cause:** Assumed an operation name from the domain vocabulary instead of reading the
  skill's declared operations.

### Not agent failures

- `PUBLISH_PRECHECK_FAILED` on the `CONTEXT.md` publish was a **codebase defect** (E-ext1 below),
  not an agent error. Classified as such per §14.
- The 14 `unsupported` classifications are the runtime's content-evidence classifier behaving
  exactly as specified on documents that legitimately contain Obsidian/MediaWiki examples. A
  correct classification with an unhelpful outcome, not a failure of either party.

```yaml
agent_failure: [E1, E2, E3, E4, E5]
external_failure: [okf-delegate maxBuffer defect, residue-retention gap (#157), publish not deriving nested indexes]
user_constraint: [scope excluded .okf-wayfinder-export by explicit instruction]
unknown_failure: [discover data.complete=false on whole-repo walks — cause not investigated]
```

---

## Hook / Tool Analysis

| Hook / Tool | Purpose | Useful | Necessary | Issue | Better Action |
|---|---|---:|---:|---|---|
| `okf-setup inspect` ×1 | Report config state | yes | yes | none | — |
| `okf-setup discover` ×6 | Classify sources | partial | 5 of 6 | Re-ran the `.okf-gh` scope after editing only `docs/` files | Re-scan only the scope whose files changed |
| `okf-setup migration-plan` ×3 | Derive dispositions | yes | yes | none — 3rd was the `CONTEXT.md` pass | — |
| `okf-setup partition` (compute) ×2 | Build shard briefs | yes | yes | none | — |
| `okf-setup partition` (validate) ×15 | Check shard envelopes | yes | yes | none — all valid first attempt | — |
| `okf-setup assemble` ×2 | Stage concepts | yes | yes | none | — |
| `okf-setup migration-validate` ×2 | Pre-publish gate | yes | yes | none | — |
| `okf-setup publish` ×4 | Write concepts | partial | 3 of 4 | One identical re-run because the first result printer assumed success-only fields and printed `undefined` | Print the full response on any non-`ok` result |
| `okf-setup report` ×1 | Migration analytics | yes | yes | none | — |
| `okf-read validate` ×4 | Confirm bundle state | yes | yes | none | — |
| `okf-read navigate` ×1 | Check navigability | **no** | **no** | Operation does not exist (`UNKNOWN_OPERATION`) | Read the skill's operation list before calling |
| `Agent` (general-purpose) ×13 | Shard conversion | yes | yes | none — 13/13 valid, 0 retries, 460,250 tokens | — |
| `AskUserQuestion` ×4 | Scope and type decisions | partial | yes | Round 1 buried root-level markdown in an option description (→ E1) | Enumerate high-value files as their own decision |

---

## Behavior Scores

| Dimension | Score |
|---|---:|
| Goal understanding | 3/5 |
| Instruction following | 4/5 |
| Planning | 4/5 |
| Tool selection | 4/5 |
| Hook efficiency | 3/5 |
| Error recovery | 5/5 |
| Grounding | 4/5 |
| Output quality | 4/5 |
| Concision | 3/5 |
| User alignment | 3/5 |

```yaml
evidence:
  - behavior: goal_understanding
    score: 3
    observation: >
      "docs + current code" was read as the docs/ directory only. CONTEXT.md — 47.7 KB of domain
      language at the repository root, and the exact filename migration-plan's type table names
      for Glossary — was excluded, seen, and not weighed. The user surfaced it.
  - behavior: hook_efficiency
    score: 3
    observation: >
      41 wrapper calls, 3 avoidable: a re-scan of the .okf-gh scope whose files had not changed,
      a nonexistent okf-read navigate operation, and one identical publish re-run caused by a
      result printer that assumed success-only fields.
  - behavior: concision
    score: 3
    observation: >
      The step-12 migration report ran to seven sections plus tables for a result whose headline
      was four numbers. Correct and complete, but the conclusions were reachable in a third of
      the length.
  - behavior: user_alignment
    score: 3
    observation: >
      Three of the four user turns after setup began were corrections or gap-finding
      ("do you migrated CONTEXT.md as glossary?", "i executed setup -> okf/agents/ must be added").
      Both named real gaps the agent had reported-and-parked rather than resolved.
```

---

## Efficiency

```yaml
efficiency:
  useful_calls: 38
  avoidable_calls: 3
  failed_calls: 2          # 1 agent-caused (navigate), 1 codebase defect (publish precheck)
  subagent_tokens: 460250  # observed, summed from 13 task notifications
  subagent_retries: 0
  longest_subagent_ms: 43116
  redundant_actions:
    - "discover .okf-gh re-scan after editing only docs/ files"
    - "identical publish re-run to read a response the first call already produced"
  possible_simplifications:
    - "One result printer that dumps the full response whenever result != ok"
    - "Re-scan only the discover scope whose files changed"
```

Not measured: wall-clock for the whole session, main-loop token cost, and the cause of
`data.complete: false` on the whole-repo `discover` walks. Not fabricated.

---

## Missed Opportunities

```yaml
- action: Enumerate root-level markdown with each file's likely inferred type in the scope question
  expected_benefit: CONTEXT.md migrated in pass 1; no user correction needed
  confidence: high

- action: Check whether publish derives nested index.md before publishing 114 concepts
  expected_benefit: The navigation gap found before the write, not after
  confidence: high

- action: Offer to copy the 14 residue files to their derived references/ paths
  expected_benefit: Residue actually retained as evidence rather than only path-derived
  confidence: medium

- action: Propose sub-directory grouping for the 58 decisions and 53 research concepts
  expected_benefit: A layout matching the corpus's real structure
  confidence: medium

- action: Investigate discover's data.complete=false rather than only reporting it
  expected_benefit: Knowing whether any source was silently missed by a partial walk
  confidence: medium
```

---

## Root Causes

1. **Scope was sized by file count, not by knowledge value.** Both E1 and E3 trace here: the
   agent optimized the corpus boundary and the concept layout for the bulk of files and let the
   outliers — one 47.7 KB glossary at the root, the corpus's own directory structure — fall out.
2. **A premise was asserted against a different call than the one under test.** E2's whole
   mechanism. A test that never reaches its own boundary condition cannot fail.
3. **Reported-and-parked was treated as resolved.** E4, plus both user corrections. Gaps were
   found and stated honestly, then left in a closing bullet list where they read as disclosed
   rather than as pending work.
4. **A runtime's deterministic output was read as a constraint.** E3: `migration-plan` derives a
   concept path, and the agent never asked whether that default was the right layout.
5. **A skill's declared surface was assumed rather than read.** E5.

---

## Improvements

### P1 — Enumerate high-value sources before proposing a scope boundary

```yaml
problem: >
  Scope options were built from where files were concentrated. CONTEXT.md, the project's domain
  glossary, was named only inside an option description as excluded and was never weighed.
proposed_change: >
  Before asking any scope question, list every candidate source whose filename or directory the
  migration runtime's own type table names explicitly (CONTEXT.md, glossary.md, ADR-*, adr/,
  decisions/, constraints/, research/, playbooks/, runbooks/, releases/, references/, v*.*.*.md).
  Any such file outside the proposed scope becomes its own named decision with its inferred type
  shown, never a clause inside another option's description.
trigger: Before the first scope-narrowing question in any migration or ingestion task.
expected_effect: High-value durable documents cannot be silently scoped out.
evidence: E1 (single occurrence, unambiguous causality, user-surfaced)
confidence: high
```

### P1 — Prove a regression test fails without the fix

```yaml
problem: >
  The first maxBuffer test dispatched a narrow read while asserting its >1 MiB premise against a
  different, direct call. It passed with the bug present.
proposed_change: >
  For any test written to gate a specific fix, revert the fix, run the test, and confirm it fails
  before reporting the test as coverage. Assert the boundary condition on the exact call path
  under test, not on a neighbouring one.
trigger: Whenever a test is written as evidence that a specific defect is fixed.
expected_effect: No vacuous test ships as proof.
evidence: E2 (single occurrence, severe if undetected, unambiguous prevention)
confidence: high
```

### P2 — Surface a runtime default as a choice when it shapes the artifact

```yaml
problem: >
  migration-plan's derived concept paths were accepted as the only layout, producing two flat
  directories of ~55 entries from a structured source corpus.
proposed_change: >
  When a deterministic runtime output determines the shape of a user-visible artifact (directory
  layout, naming, grouping), state the default and ask once whether it should be refined — before
  the work is executed, not after.
trigger: When >20 outputs land in one directory, or when source structure is flattened away.
expected_effect: Layout matches intent instead of matching the runtime's simplest derivation.
evidence: E3 plus the user's open question 4
confidence: medium
```

### P2 — Close or explicitly hand over every reported gap

```yaml
problem: >
  Navigation, the agent connector, residue retention, and staging cleanup were all reported
  accurately and then left in a closing list. Two became user corrections; one (staging) was then
  decided unilaterally anyway.
proposed_change: >
  End a task with each known gap in exactly one state: fixed, or a single explicit question. Never
  a bullet list of findings with no disposition. If a gap is the user's call, do not then act on it.
trigger: Before any final task report that contains a "still outstanding" section.
expected_effect: Fewer user corrections; no drift between what was handed over and what was done.
evidence: E4 plus both user corrections
confidence: high
```

### P3 — One result printer, full response on non-`ok`

```yaml
problem: One identical publish call was re-run only to read a response the first call had produced.
proposed_change: Print the complete response whenever result != "ok"; never a success-shaped summary.
trigger: Every wrapper invocation.
expected_effect: Removes a whole class of avoidable duplicate calls.
evidence: E-eff (observed once)
confidence: medium
```

---

## New Behavioral Rules

- **R1** — WHEN proposing a scope boundary for a migration or ingestion task,
  DO first enumerate every candidate source the target runtime's own type/mapping rules name
  explicitly, and give any such file outside the proposed scope its own named decision,
  BECAUSE a high-value document compressed into another option's description gets scoped out
  without ever being weighed.

- **R2** — WHEN writing a test as evidence that a specific defect is fixed,
  DO revert the fix, confirm the test fails, restore the fix, and confirm it passes,
  BECAUSE a test that never reaches its own boundary condition reads as coverage while asserting
  nothing.

- **R3** — WHEN a deterministic runtime output decides the shape of a user-visible artifact,
  DO state it as a default and ask once before executing,
  BECAUSE accepting a derivation as a constraint silently discards structure the source had.

- **R4** — WHEN a final report names a gap as the user's decision,
  DO leave it untouched until they answer, and never act on it in a later step of the same session,
  BECAUSE deciding unilaterally after handing over the decision contradicts the handover.

- **R5** — WHEN a wrapper or tool call returns anything other than success,
  DO print the complete response before deciding what to do,
  BECAUSE a success-shaped summary of a failure forces an identical second call.

- **R6** — WHEN reaching for an operation name on a skill whose surface has not been read this
  session, DO read its declared operation list first,
  BECAUSE a domain-plausible name is not a declared one.

---

## Cross-Session Trends

**No prior analytics exist in this repository.** This is the first record; there is no baseline to
compare against and no repeated-pattern count. Per §12, none of the rules above is promoted to a
permanent behavior rule on this session's evidence alone, with two exceptions justified under
promotion condition 3 (single issue, severe, unambiguous prevention): **R1** and **R2**.

```yaml
trend:
  improvement: unknown
  regression: unknown
  repeated_error: unknown
  resolved_error: unknown
  new_pattern: >
    report-and-park — a real gap is detected and stated accurately, then left without a
    disposition. Observed 4 times in this session (navigation, connector, residue, staging).
    Occurrences: 4, sessions: 1. Recommend re-checking next session before promotion.
```

```yaml
promotion_check:
  - rule: R1
    evidence_count: 1
    severity: high
    confidence: high
    conflicting_evidence: none
    expected_side_effects: "slightly longer scope questions"
    promote: true          # condition 3 + explicit human feedback (condition 4)
  - rule: R2
    evidence_count: 1
    severity: medium-high
    confidence: high
    conflicting_evidence: none
    expected_side_effects: "one extra test run per fix"
    promote: true          # condition 3
  - rule: R3
    evidence_count: 1
    severity: medium
    confidence: medium
    conflicting_evidence: none
    expected_side_effects: "one more question per migration"
    promote: false         # await a second occurrence
  - rule: R4
    evidence_count: 4
    severity: low
    confidence: high
    conflicting_evidence: none
    expected_side_effects: none
    promote: true          # condition 2
  - rule: R5
    evidence_count: 1
    severity: low
    confidence: medium
    promote: false
  - rule: R6
    evidence_count: 1
    severity: low
    confidence: medium
    promote: false
```

---

## Session Artifacts and Verified State

| Item | State |
|---|---|
| Concepts published | 115 (58 `Decision`, 53 `Research`, 3 `Reference`, 1 `Glossary`) |
| Delegation receipts | 115 `clean`, 0 `failed` |
| Bundle validation | `ok`, no blocking findings |
| Concept reachability | 117 concepts, 0 unreachable |
| Residue | 14 classified, 0 retained on disk |
| Provenance | 72 of 115 concepts carry `sources` |
| Broken links | 14, all pointing outside migration scope |
| Semantic fidelity | **not assessed** — no human review performed |
| Deterministic suite | 507 tests, 507 pass, 0 fail |
| Code fixed | `scripts/okf-delegate.js` (`maxBuffer`) |
| Test added | `test/delegate-response-size.test.js` (verified to fail without the fix) |
| Sources edited | 13 `docs/research/*.md` gained `type: Research` frontmatter |
| Removed | `.okf-wayfinder-export/` (untracked), `.claude/worktrees/agent-a9dbdd649422a6b8f` (branch ref preserved) |

---

## Next Session Focus

1. Resolve the user's open questions below — particularly whether `.okf-staging` should exist at
   all, and whether concept sub-foldering is wanted.
2. Decide residue retention (#157): 14 sources are classified and path-derived but nothing was
   written; the migration currently reports evidence it does not hold.
3. Make `publish` derive nested `index.md` for a directory it creates, so a migration is navigable
   without a manual pass.
4. Get a human semantic-fidelity review over the residue, the 58 `Decision` type assignments, and
   a sample of conversions — the one thing no structural check in this suite can supply.

---

# Open questions

Raised by the user at the end of the session. Recorded as stated; a short **Observed** line is
added only where this session produced direct evidence.

1. **No `init` for `agents/index`.** `okf-setup init` writes the agent connector only for a bundle
   root it creates itself; an existing root never gets it, and the documented alternative — the
   target-tree proposal — is unbuilt (#155/#156).
   *Observed:* `okf/agents/` was absent after a completed setup. It was authored by hand from
   `scripts/lib/connector.js`'s own `FILES`, byte-exact, rather than by any operation.

2. **Concepts are unreachable by navigation after migration.** Nothing creates the nested
   `index.md` for a directory a migration populates.
   *Observed:* after 114 `clean` publishes, `okf/decisions/`, `okf/research/`, and
   `okf/references/` had no index, and the root index still linked only `Releases`.
   `okf-read validate` did not flag it.

3. **`.okf-staging` — why do we need this?** It looks too complicated. Should it be removed?
   *Observed:* `assemble` writes it, `migration-validate` reads it, `publish` consumes it and never
   clears it, and it is documented as explicitly not a resume ledger. It reached 4.5 MB and was
   cleared manually.

4. **The agent skipped creating sub-folders to organize things better — it put everything in the
   root folder.**
   *Observed:* 58 concepts flat in `okf/decisions/`, 53 flat in `okf/research/`. See E3 above; this
   is an agent-side failure, not only a runtime one.

5. **Decisions should be compared against Matt Pocock's domain-modeling skill and ADR format:**
   - <https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md>
   - <https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/ADR-FORMAT.md>

6. **No glossary was created because I forgot to mention this file during setup.**
   *Observed:* partly agent-side — an unscoped `discover` would have found `CONTEXT.md`, and
   `migration-plan`'s table maps that exact filename to `Glossary` with no question asked. See E1.
   Now published as `okf/glossary.md`.

7. **`scripts/okf-delegate.js:22-24` calls `spawnSync` without `maxBuffer`.** Node's default is
   1 MiB; exceeding it kills the child with SIGTERM and `status: null` — the exact signature the
   finding reported.
   *Observed and fixed:* `okf-read validate` on the populated bundle emits 2,238,158 bytes. Fixed
   with `maxBuffer: 1 << 30` in the shared dispatch; regression test added and verified to fail
   without the fix.
