# Spec: `v0.1.0` completion — skills, open items, and repository setup

Scope owner: issue #9 *Implement and deterministically test the v0.1.0 skill project*.

This document is a **delta** on `docs/spec/okf-agent-skills-v0.1.0.md`. That file stays the
authority for OKF semantics, the wrapper contract, the authorization matrix, and the authoring
contract. This document adds only what #9 still needs: the recorded decisions that close the
remaining `Open` rows of that spec's open-item table, the contract for the five `SKILL.md` files,
and the repository-setup obligations.

Nothing here reopens a row marked `Settled, do not reopen`.

---

## Problem Statement

State at authoring time (2026-08-05), before #9 landed. A developer could not use this project.
The suite that gives the repository its name was not installable and not invocable.

- `skills/` did not exist. There were zero `SKILL.md` files. `npx skills add
  'artemVeduta/okf-agent-skills#v0.1.0'` — the single documented install command — had nothing to
  install.
- The runtime behind the skills was complete and green: 15 modules under `scripts/lib/`, five
  per-skill wrapper scripts, three native adapters, two inert agent definitions, 19 test files,
  **220 tests passing under `node --test`** (verified 2026-08-05, exit 0).
- The whole injected orientation payload was one pointer line. The rules for maintaining durable
  context were never meant to live there — they belong in the `SKILL.md` files a harness loads
  through its own discovery mechanism. Orientation points at the knowledge, skills carry the
  rules, native navigation fetches the content. Two of the three were built.
- The absence was invisible to the suite. `test/issue-55.test.js` carried an
  `if (!fs.existsSync(skills)) return;` early return, so the one test that checks the shipped
  inventory passed **because** `skills/` was missing. A green suite was no evidence about the
  skills.
- Six rows of the pinned spec's open-item table were still `Open`. Each MUST be closed by a
  recorded decision before the behavior it blocks is implemented, and an implementation agent MUST
  NOT invent a value for any of them. All six are closed below by D5–D10, and the pinned spec's
  table now carries those statuses.
- There was no `.github/`, so no CI, while the release gate is *"CI MUST gate the release on the
  full deterministic suite"*. There was no `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, or
  in-repo `CLAUDE.md`, and `README.md` was a research-phase placeholder.
- `CONTEXT.md` defined 71 terms and none of the seven checked terms the pinned spec uses
  normatively (`Concept ID`, `operation store`, `atomic effect`, `WRITE_AUTHORITY`, `verified
  EOF`, `adapter generation`, `skill binding`). The spec's own gap list — the section
  "Terms used normatively that `CONTEXT.md` does not define" — named roughly fifty such terms and
  required one authoritative definition before normative use.

## Solution

Finish `v0.1.0` inside the repository, in this order:

1. Close the six `Open` rows by recorded decision. Four are closed by this document. Two require
   authored spec text, because their closing decision *is* a table.
2. Author the five `SKILL.md` files — `okf`, `okf-read`, `okf-write`, `okf-lifecycle`,
   `okf-review` — and delete the `existsSync` skip so the inventory test becomes load-bearing.
3. Add the missing deterministic coverage the pinned spec obliges: installation-layout fixtures,
   write-gate fixtures for the four bundle classes, and the semantic-preservation round trip whose
   failure blocks the write.
4. Bring the repository to public-project quality: CI on the full deterministic suite, a real
   README that documents install and every disclosed limitation, `CONTRIBUTING.md`,
   `SECURITY.md`, `AGENTS.md`, in-repo `CLAUDE.md`, and the `CONTEXT.md` definitions.

Merging to `main`, protecting `main`, dogfooding, and tagging `v0.1.0` stay with issue #10.

---

## Open-item resolutions

These close the `Open` rows at lines 3569, 3572, 3583, 3584, 3587, 3588 of the pinned spec. They
are recorded decisions, not observations that an implementation already picked a value.

### D5 — New-bundle write-gate bootstrap exception is reclassified `Deferred`, not answered

Row L3572 blocks `okf init`, migration into a repository with no bundle, and adoption of a bundle
root that does not yet exist. Decision #43 and record D2 already removed all three from the
`v0.1.0` surface: `init` and `migrate` are not entries in the sealed router operation table, so
they receive the existing unknown-operation result. A `Deferred` row blocks no `v0.1.0` work
(L3554).

The row is therefore reclassified `Deferred (#9)`. No bootstrap exception is defined, and the
write gate keeps exactly one rule: mutation requires a parsed root declaration of
`okf_version: "0.2"`.

The consequence is a real, disclosed limitation and MUST be documented as one, not hidden:
`v0.1.0` never creates a bundle root. A developer authors the bundle-root `index.md` — including
the `okf_version: "0.2"` declaration — by hand before any suite write can succeed. The README MUST
carry that as an explicit first-run step, and MUST NOT describe the suite as able to initialize a
bundle.

### D6 — Adapter location is `adapters/<harness>/` in the same tag; the install command is the adapter script with a user-supplied target directory

Row L3583 is closed as follows.

- **Location.** Each native adapter ships in the `v0.1.0` tag at `adapters/<harness>/` for
  `claude-code`, `codex`, and `opencode`. There is no separate package, no npm artifact, and no
  second tag — consistent with the library-only delivery shape.
- **Install command.** All three adapters install through the one adapter entry script, which
  takes the harness name and an explicit target directory:
  `install | disable | uninstall`, a harness, and a target directory the **user** supplies.
  The target directory is a required argument, never inferred, and the adapter writes nothing
  outside it. Install is driven entirely by each adapter's `manifest.json` `installs` list.
- **Recommended target directory per harness is a documentation value, not a code value.** It
  MUST come from current verified first-party harness evidence at the time the install
  documentation is written, and MUST NOT be invented. A research ticket supplies the three
  verified paths; it blocks the install documentation only, and blocks no `SKILL.md` work.

### D7 — The atomic-effect ownership table is authored into this repository's specification

Row L3584 asks for one table with a row for every atomic effect in the authorization matrix, and
columns for owning skill, runtime module, and invocation class. Its closing decision *is* that
table, so it cannot be closed by prose here.

Decision: the table is authored as a section of the pinned spec, and it is a **transcription, not
an invention**. Every row is derived from material that already exists — the sealed atomic
operation map, the router owner table, and the runtime's declared primary and derived effects. An
effect that appears in none of those sources MUST be reported as an open item, and MUST NOT be
implemented, assigned an outcome, or inferred from a similar effect.

The table blocks the `SKILL.md` work: a skill cannot state which effects it owns before the table
says so. It is therefore the first authored artifact of this spec.

### D8 — Post-operation checks are enumerated from the shipped post-write validation, one observable pass condition each

Row L3569 blocks every claim that an operation succeeded. Its closing decision is also a table.

Decision: the enumerated set is exactly the checks the shared post-write validation already
performs. Each is written with one observable pass condition — what a reader can see that says
`pass`, and what it sees that says `fail`. No check is added that the runtime does not perform, and
no check the runtime performs is left out of the enumeration.

Issue #86 refines the fixture obligation this decision states: a wrapper-seam fixture is required
for each *reachable* pass/fail observable, not for every internal defensive branch. Several of the
twelve — the post-write copies of the six shared gates, the saved-concept re-read, and the
saved-tree comparison — cannot be driven to their fail branch through `postWrite` by a normal
wrapper request, because the pre-write gate already returns `blocked` for that same input before
publication. Those checks keep a fixture at the boundary that is actually reachable (the pre-write
`blocked` case) and stay documented, not fixture-forced, at their unreachable post-write fail
branch. The outer exception handler around `postWrite` is error containment, not a thirteenth
check, and is not fixture-forced either.

### D9 — Coexistence with the third-party OKF skill is closed by explicit deferral

Row L3587 permits an explicit deferral as a closing decision, and that is what is recorded.

`v0.1.0` makes no claim about `fabricioctelles/okf-open-knowledge-format`. The two projects share
no install name, no install path, and no configuration namespace. The README MUST state that they
are unrelated projects and MUST NOT claim compatibility, replacement, or interoperability in
either direction. Positioning is revisited only if a real install conflict is observed.

### D10 — The support ceiling ships labeled provisional; its fixture corpora are deferred

Row L3588 blocks any *calibrated* claim about the declared ceiling of 500 source files, 100 MB
aggregate exact source bytes, and bundle-relative depth 6.

Decision: `v0.1.0` ships the ceiling labeled **provisional** everywhere it appears, and makes no
calibrated claim anywhere in the release — README included. Reading MAY continue above the ceiling
without claiming completeness. Naming the fixture corpora and strata is deferred to `v0.2.0`.

### D11 — `okf-setup` is the sixth skill; it closes the bootstrap row D5 deferred, and carries migration as an internal phase

Map #129 and its grillings (#133, #134) and research (#131) supersede D5's deferral and two
responsibility-boundary rules of the pinned spec. This record closes row L3656 and states what
replaces them. D5 stands as the history of the earlier deferral, and is superseded here only on
the points below.

- **The sealed skill set grows from five to six.** `skills/` holds `okf`, `okf-read`, `okf-write`,
  `okf-lifecycle`, `okf-review`, and `okf-setup`. This is the recorded decision the "no new skill
  without a decision" rule requires. No seventh skill follows from it.
- **The bootstrap exception is defined, not deferred.** `init` is a sealed router operation owned
  by `okf-setup`. It creates or repairs the bundle-root `index.md` with an exact
  `okf_version: "0.2"` declaration. It is idempotent: it overwrites an invalid root and is a no-op
  on a valid one. It runs ownership, REACH, TRUST, and ACCESS, and skips PRESENCE and the evidence
  gate, because there is no bundle to find yet and nothing to cite. The write gate keeps exactly
  one rule for every other mutation.
- **`init` moves off `okf-lifecycle`.** Pinned-spec line 2748 is superseded on `init` alone.
  `sync` and `compact` are unchanged, and `compact` still takes the unknown-operation result.
- **Migration is a phase, not an operation.** There is no user-facing `migrate`, and no
  `/migrate`, `/resume`, or `/restore`. An explicitly invoked `okf-setup` session carries it as
  `discover`, `migration-plan`, `partition`, `assemble`, `migration-validate`, and `publish`.
  Pinned-spec line 2751 is superseded on its "not a new skill" clause alone; the clauses that
  forbid a CLI, automatic synchronization, and implicit initialization stand.
- **No operation of `okf-setup` runs automatically.** An automatic caller gets silence, which is
  what every other operation gives on an inactive bundle.
- **`publish` never writes a concept directly.** It delegates one `okf-write` `create` call per
  concept through the same delegation bridge a sub-agent uses, so each concept passes the full
  admission, evidence gate, and write gate. `okf-setup` creates delegation briefs and never
  accepts one: it carries no role in the delegation bridge.
- **Git owns recovery.** No checkpoint file, resume state, recovery journal, snapshot, backup, or
  undo history ships with setup or migration. A failed attempt restarts from `okf-setup` against
  the repository's current state. This keeps Decision #43's deferred guard family deferred.
- **Migration never modifies a source document**, never guesses an unresolved semantic decision —
  it batches the questions into one compact round — and stages the whole bundle for validation
  before publication.

The consequence for the README is the reverse of D5's: the first-run section MUST NOT state that
the suite cannot create a bundle root. It states the one write-gate rule and names both ways to
satisfy it — `okf-setup` `init`, or an `index.md` the developer authors.

---

## User Stories

**Installing and first run**

1. As a developer, I want the documented install command to place six skills and their wrapper
   scripts into my skills store, so that my harness can discover them at all.
2. As a developer, I want the README to tell me the one rule the write gate applies and both ways
   to satisfy it — `okf-setup` `init`, or the bundle-root `index.md` I author myself — so that my
   first write does not fail against the write gate for a reason I cannot diagnose.
3. As a developer, I want the README to tell me that automatic behavior stays off until I create
   the zero-byte activation marker at my worktree root, so that nothing touches my repository
   before I opt in.
4. As a developer, I want one install command per native adapter, with the target directory as an
   explicit argument I supply, so that installing an adapter never writes somewhere I did not name.
5. As a developer, I want the README to state plainly that concurrent writers are not serialized
   and that crash recovery is not provided, so that I judge the release on what it does rather
   than on what I assumed.
6. As a developer, I want the README to state that this project is unrelated to the other public
   OKF skill, so that I do not expect one to substitute for the other.

**Reaching the skills**

7. As an agent, I want a router skill whose description routes me to the right owner skill, so
   that I do not have to know which module handles an operation.
8. As an agent, I want the router's `SKILL.md` to carry a dispatch table naming the owner of read,
   write, lifecycle, and review work, so that dispatch is readable rather than guessed.
9. As an agent, I want `okf-read` to tell me to navigate natively from the bundle-root index to a
   directory index to a concept body, so that I do not attempt a retrieval backend that does not
   exist.
10. As an agent, I want `okf-write` to tell me which effects it owns and which are simply not
    `v0.1.0` operations, so that I refuse cleanly instead of improvising a broad change.
11. As an agent, I want `okf-lifecycle` to distinguish narrow automatic synchronization from
    explicit reconciliation, so that I never run a broad operation on an automatic trigger.
12. As an agent, I want `okf-review` to tell me it reports and never confirms, approves, or
    mutates the subject it reviews, so that a review cannot become a write.
13. As an agent, I want each leaf skill's description to carry the reach clause, so that another
    skill can invoke it, while the router carries no reach clause.
14. As an agent, I want every procedural step in a `SKILL.md` to end with an observable completion
    criterion, so that I can tell done from nearly-done without guessing.
15. As an agent, I want branch-specific material behind a one-level-deep reference with a pointer
    that says when and why to load it, so that I pay for it only when my branch needs it.
16. As an agent, I want a `SKILL.md` to name the exact wrapper request it must construct and the
    exit codes it must distinguish, so that I read a refusal as a refusal and a crash as a crash.
17. As a delegating agent, I want the skills to route delegated work through the delegation entry
    point rather than the write wrapper directly, so that brief validation is never skipped.

**Trusting the suite**

18. As a maintainer, I want the inventory test to fail when a skill is missing, misnamed, or extra,
    so that the shipped inventory is asserted rather than assumed.
19. As a maintainer, I want the inventory test to stop skipping itself when the skills directory is
    absent, so that a green suite is evidence about the skills.
20. As a maintainer, I want every relative link and every script path inside a `SKILL.md` to be
    checked against disk, so that a shipped skill cannot point at a file that does not exist.
21. As a maintainer, I want a duplicated normative statement across a `SKILL.md` to fail the suite,
    so that one meaning keeps exactly one authoritative source.
22. As a maintainer, I want installation fixtures covering the exact project and global layout this
    repository uses, so that an install claim rests on an observation.
23. As a maintainer, I want write-gate fixtures for an undeclared bundle, a future-version bundle,
    a legacy bundle, and a conforming bundle, so that the one write gate is proven at its four
    boundaries rather than incidentally.
24. As a maintainer, I want a semantic-preservation round-trip fixture whose failure blocks the
    write, so that a frontmatter rewrite cannot silently change meaning.
25. As a maintainer, I want a fixture per enumerated post-write validation check, so that a success claim
    rests on a named observable rather than on absence of error.
26. As a maintainer, I want every safety test to assert the refusal, its reason, and its origin,
    so that a write that fails for the wrong reason is caught as the defect it is.

**Running the project in public**

27. As a maintainer, I want CI to run the full deterministic suite on every push and pull request
    and to fail the build on any failing test, so that the release gate is mechanical.
28. As a maintainer, I want CI to need nothing outside the Node.js standard library, so that the
    zero-dependency promise is enforced by the gate rather than stated in prose.
29. As a contributor, I want `CONTRIBUTING.md` to tell me how to run the suite, what a good test
    here looks like, and that a decision is recorded before the behavior it blocks is implemented,
    so that my first pull request follows the project's own rules.
30. As a security reporter, I want `SECURITY.md` to give me a private reporting route and the
    supported-version statement, so that I do not disclose in public by default.
31. As an agent working on this repository, I want `AGENTS.md` and `CLAUDE.md` to state the
    zero-dependency rule, the single test seam, and the decision-before-implementation rule, so
    that I do not add a dependency or a second seam by reflex.
32. As a reader of the specification, I want every term the specification uses normatively to have
    one authoritative definition in the domain model, so that a `MUST` never rests on an undefined
    word.

---

## Implementation Decisions

### The skill inventory and each skill's job

`skills/` holds exactly six directories, no more and no fewer: `okf`, `okf-read`, `okf-write`,
`okf-lifecycle`, `okf-review`, and `okf-setup` (D11). Each holds a `SKILL.md`. `okf` is the
router; the other five are leaves. No guard skill and no retrieval skill ships. Guard and shared
runtime behavior stay modules.

Responsibility boundaries are already settled by the pinned spec and are restated here only as the
authoring target:

- `okf-read` — safe inspection. Navigation is LLM-guided through harness-native file tools along
  the fixed path bundle-root index → directory index → concept body. It describes no matcher,
  ranking, embedding store, tokenizer, budget, reserve, tier, or retrieval ledger, because none
  exist.
- `okf-write` — bounded mutations, all of them through the shared write path. Native file tools
  never substitute for it.
- `okf-lifecycle` — narrow automatic synchronization, plus explicit reconciliation. `compact` is
  not a `v0.1.0` operation and takes the unknown-operation result. `init` belongs to `okf-setup`
  (D11), and there is no `migrate` operation at all.
- `okf-review` — trust tiers and review baselines. It reads, validates, and reports. It never
  confirms, self-approves, executes, or mutates the reviewed subject.
- `okf-setup` — explicitly invoked project setup: bootstrap through `init`, config inspection and
  repair, monorepo planning, and the migration phase from discovery through publication (D11). No
  operation of it runs automatically, and none of them writes a concept directly.

### The router's dispatch table is a map, not the authorization rule

The router's `SKILL.md` carries a dispatch table of sixteen user-facing operation categories, each
naming its owner skill: read, write, lifecycle, and review, plus the twelve `okf-setup` operations
(D11). The runtime's sealed operation table is the finer-grained one, keyed on the request's fixed
`operation` field. The `SKILL.md` table is the human- and agent-facing map, and it MUST NOT be
presented as the authorization rule. The router implements no second authorization rule.

### Frontmatter is the portable minimum

Each `SKILL.md` declares `name` and `description` and nothing that a target capability matrix has
not verified. `name` equals the directory name. Harness-only fields — model-invocation switches,
fork context, hooks, execution restrictions, the Codex agents file, OpenCode permissions and
plugins — stay in the adapters, which already ship. The presence of a generic field in any
harness's schema is not evidence that the harness enforces it.

Descriptions are third-person capability statements that front-load the leading word, state each
genuinely distinct trigger branch exactly once, and repeat neither procedure nor identity nor
reference material. The four leaf skills carry the reach clause; the router MUST NOT.

### Information hierarchy inside each skill

`SKILL.md` holds the universal steps, the completion gates, and the essential rules. Branch-specific
or on-demand material goes one level deep into a reference file, reached by a pointer that states
when and why to load it. Material every branch needs stays inline even if that lengthens the file.
Pointer chains stay shallow. Facts are not dressed up as procedural steps.

Every procedural step ends with a checkable completion criterion naming observable evidence for
done and not-done. Where a bounded scope or a safety obligation makes an omission dangerous, the
criterion is exhaustive — every modified concept, every affected link, each failed check. Where
work is genuinely open-ended, it carries an explicit bounded stopping condition instead of a false
exhaustive claim.

There is no numeric size limit on a `SKILL.md`, and none is introduced. Load is a design tradeoff,
not a budget.

### What a skill says about the seam

Each skill names the wrapper request it constructs — the protocol field, the skill, the operation,
and the payload keys that operation requires — and distinguishes the three exit conditions: a
valid response emitted (including a refusal), invalid wrapper input, and internal failure that
still emits one complete response. A refusal reported on a valid response is a result, not a
crash, and a skill that conflates them is defective.

Delegated work goes through the delegation entry point so that brief validation runs. A skill MUST
NOT tell an agent to allowlist the write wrapper directly, because that path skips brief validation
and returns a wrapper response where a receipt is required.

### Making the inventory test load-bearing

The `existsSync` early return in the inventory test is deleted. After deletion the test asserts,
against the real tree: the exact six-directory inventory; a `SKILL.md` in each; a frontmatter
block with non-empty `name` and `description`; `name` matching the directory; a third-person
description with exactly one trigger branch marker; the reach clause present on the five leaves and
absent from the router; the router's dispatch rows; every relative link resolving on disk;
every referenced script path existing relative to the skill directory; and no normative statement
repeated. The test's fixture-driven cases already pass and are untouched.

### Missing deterministic coverage

Three obligations of the pinned spec have no dedicated home and get one:

- **Installation layout** — fixtures covering the exact project store and global store layout this
  repository uses. Symlink-following behavior may be relied on only for that tested layout, and
  MUST NOT be generalized to broken or cyclic links, links escaping trusted roots, sibling
  repositories, or future harness versions.
- **The write gate at its four boundaries** — an undeclared bundle, a future-version bundle, a
  legacy bundle, and a conforming bundle. Coverage today is incidental inside two unrelated test
  files; it becomes a named file.
- **Semantic preservation** — a round-trip fixture whose failure blocks the write. A mismatch
  blocks that concept and MUST NOT propagate to a derivative.

Every one of these asserts at the wrapper seam.

### Repository setup

- **CI** — one workflow, on push and on pull request, running the full deterministic suite under
  `node --test` with nothing outside the Node.js standard library, failing the build on any failing
  test. No live harness process runs in CI; adapter fixtures are the release gate. A `package.json`
  MUST NOT become required to install or run the suite; if one is added for a development-only
  convenience, CI MUST still pass without it.
- **README** — replaces the placeholder. It documents: what the suite does; the one install
  command; the manual harness integration steps that the base install deliberately leaves manual;
  the per-adapter install command with its explicit target directory; the two ways to satisfy the
  write gate's root rule from D11; activation by the zero-byte marker, which installation and session
  entry never create; the provisional support ceiling from D10 with no calibrated claim; the
  disclosed absence of concurrent-writer serialization and crash recovery; the deferred scope; and
  the unrelated-project statement from D9.
- **`CONTRIBUTING.md`** — how to run the suite, what a good test here is, the one-seam rule, the
  zero-dependency rule, and the rule that a decision is recorded before the behavior it blocks is
  implemented.
- **`SECURITY.md`** — private reporting route and supported-version statement.
- **`AGENTS.md`** and in-repo **`CLAUDE.md`** — the same handful of rules an agent must not
  violate by reflex: zero dependencies, one contract seam, no invented value for an open row, no
  new skill without a decision.
- **`CONTEXT.md`** — one authoritative definition for each term the specification uses normatively
  and the domain model does not define, starting with the seven confirmed absent and continuing
  through the specification's own gap list. A definition MUST NOT be a synonym for a term the
  domain model already defines. The gap list's `invocation class` row is stale — the domain model
  does define it — and is removed rather than defined twice.

---

## Testing Decisions

The pinned spec's testing decisions stand, and #9 is the only ticket permitted to revise them.
This document revises none of them; it adds where they are silent.

**What makes a good test here.** A test asserts behavior a harness adapter can observe, not the
shape of a runtime module, a private function name, or an internal call order. A test is
deterministic: no wall clock, no network, no harness process, no model call. A safety test asserts
the refusal, its reason, and its origin — a write that fails for the wrong reason is a defect.

**The seam.** There remains exactly one contract seam: a skill's wrapper script, driven as a
process and asserted on its stdout. Unit tests on `scripts/lib/` are permitted, carry no contract,
and are deleted rather than defended when they obstruct a refactor.

**Static skill tests are not a second seam.** The inventory and authoring-contract tests assert the
content of authored files, not runtime behavior. They are the static test class the authoring
contract already requires. Nothing the wrapper seam can express may rely on a static test as its
only coverage.

**Modules under test.** The five wrapper scripts as processes; the authored `skills/` tree as
static input; the three adapter manifests and their install, disable, and uninstall behavior as
fixtures; the two installation layouts as fixtures.

**Prior art in this repository.** The 19 existing test files are the pattern to follow: fixtures
built under the OS temporary directory, the wrapper driven as a child process, assertions on the
single JSON line it writes. The inventory test already contains the fixture harness for authoring
assertions; the new work extends it to the real tree rather than inventing a second harness. The
five prototype branches are evidence about behavior and are not a testing pattern to copy.

**Runner and gate.** `node --test`, standard library only, CI gating the release on the full
deterministic suite. Live Claude Code, Codex, and OpenCode process tests stay deferred and MUST NOT
gate `v0.1.0`.

---

## Narrowed claims (issue #91, issue #97)

Issue #91 asked which delegated-execution and settings-precedence behavior must be reachable
after `v0.1.0` installation. No adapter manifest installs `agents/okf-reader.md` or
`agents/okf-writer.md` (`test/issue-68-agents.test.js`), `scripts/adapter-bridge.js` accepts only
`okf-read` and `okf-write`, and `scripts/lib/delegation.js` validates `brief.settings` and then
discards it. Two accepted claims are narrowed to what that shipped code can demonstrate, and no
dispatch code moves:

- **Execution preference and session override.** `CONTEXT.md`'s `Execution preference` and
  `Session override` entries are retained design for a later release, in the same form as the
  `#43` guard items. Delegation stays a repository-internal process-seam contract that
  `node --test "test/*.test.js"` covers; it is not reachable after installation in `v0.1.0`.
- **`brief.settings`.** The field stays required and enum-validated and stays inert: it selects
  no execution placement. The brief shape and the twelve-field checks do not change.

This narrows accepted claims; it closes no `Open` row. The settings storage, syntax, and scope
row (`docs/spec/okf-agent-skills-v0.1.0.md` line 3836) stays `Open`, last touched by (#38).
Line 3360's `v0.1.0` MUST for deterministic wrapper-seam fixtures covering "settings precedence,
invalid settings" is narrowed with this claim: invalid settings stays fixture-covered
(`scripts/lib/delegation.js:67-71`, `test/issue-68.test.js:236`), but settings precedence does
not, since `v0.1.0` resolves no precedence chain to have a fixture cover.

Evidence: `test/issue-68-agents.test.js` already asserts installation copies no agent definition.
Issue #97 adds the one assertion this narrowing was missing — that no adapter manifest `installs`
entry names an `agents/` path and that `scripts/adapter-bridge.js` rejects `okf-delegate` — in
`test/issue-97-delegation-narrowing.test.js`.

---

## Out of Scope

Everything the pinned spec's out-of-scope section already excludes stays excluded: Windows, a CLI
binary, an npm package, live cross-harness process tests, introducing Husky into a project that
does not already have it, and the whole deferred guard family — manual-operation guard, ledger,
lock, preview and approval flow, durable operation store, recovery snapshots, rollback, crash
reconciliation, migration writes, merge and split, archive relocation, and cross-repository writes.

Additionally out of scope for this document:

- **A bootstrap exception for the write gate.** Deferred by D5. `v0.1.0` never creates a bundle
  root.
- **Fixture corpora and strata for the support ceiling.** Deferred by D10; the ceiling ships
  provisional.
- **Positioning against the third-party OKF skill.** Deferred by D9.
- **Merging to `main`, protecting `main`, dogfooding, and tagging `v0.1.0`.** These belong to issue
  #10. This document ends at a repository whose default-branch merge is ready, not merged.
- **Reopening any `Settled, do not reopen` row**, in particular the four-skills-behind-a-router
  inventory, the removal of budgets and retrieval ledgers, and the automatic status of incremental
  synchronization.

---

## Further Notes

**Verified state at the time of writing.** Branch `feat/issue-41-spec-v0.1.0`, working tree clean.
`node --test "test/*.test.js"` → 220 tests, 220 pass, 0 fail, exit 0. `find . -name SKILL.md` → 0
results. No `.github/` directory. Note that `node --test test/` does not work in this repository as
written; CI MUST use an invocation verified to discover all 19 files.

**Sequencing.** The atomic-effect ownership table from D7 is authored first, because a skill cannot
state which effects it owns before the table exists. The post-write validation check enumeration from D8
is authored next, because it is what a completion criterion in `okf-write` points at. The five
`SKILL.md` files follow, and the `existsSync` deletion lands with them so that the suite is never
green about skills that do not exist. Repository setup is independent of all of it and may run in
parallel, except that the install documentation waits on the verified per-harness target
directories from D6.

**Evidence classification is unchanged.** Accepted decisions govern OKF behavior. Current verified
first-party harness evidence governs an adapter fact and establishes no cross-harness parity. The
pinned authoring reference is normative only where the authoring contract adopts it. Files under
`docs/research/` are evidence, never policy, and never close an open row.
