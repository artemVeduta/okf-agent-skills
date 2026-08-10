---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/36
status: draft
type: Decision
---
# Replace budget-aware retrieval with index navigation

Status: closed.

Part of #1

## Question

What replaces the budget-aware retrieval runtime, given that the owner has ruled the budget model, cost model, and tokenizer out of `v0.1.0`?

## Proposed direction

`okf-read` performs no retrieval of its own. It teaches the bundle layout and lets the agent navigate with its native Read/Grep/Glob tools: bundle-root `index.md`, then a subdirectory index, then the concept body. This is the three-tier lazy loading already in the research, minus every ledger, tier, reserve, receipt, and omission code.

Rejected alternative: an in-skill matcher. It reimplements grep without a tokenizer, and reintroduces the invented-constant problem this ticket exists to remove. It also fails a plain case — with no stopword rule and no informativeness weight, a term-frequency matcher ranks a long document containing `is` forty times above a two-paragraph document containing `retention` twice.

## What this supersedes

- [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) — entirely
- [Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28) — entirely
- [Define what a discovery result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32) — entirely
- [Prototype and verify the adopted retrieval runtime contract](https://github.com/artemVeduta/okf-agent-skills/issues/33) — entirely

## What this amends

- [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) — the "Retrieval, notices, and budgets" subsection and most of "Calibration and release evidence" fall. The safety half (validation, growth, compaction, approval, recovery, manifest) is untouched.
- [Specify the OKF knowledge model and automatic developer lifecycle](https://github.com/artemVeduta/okf-agent-skills/issues/6) — the profile-selection duty, and the outcomes `insufficient` and `invalid`.
- [Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11) — no rule falls; the unconditionally-allowed read row becomes true in practice.
- [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35) — `bounded` in "at most one bounded read-only orientation result" now carries the load budget-awareness carried, and is undefined.

## Must still be settled

- The support ceiling, stated in files and bytes as a known limit rather than an enforced bound. Cutting the tokenizer does not cut the need for a bound; it cuts the ability to state one in the harness's units.
- Whether any disclosure rule survives. Native grep leaves the agent seeing its own results, so there may be nothing to disclose — confirm rather than assume.
- What `bounded` means for the `.okf-active` orientation context.
- Which parts of query normalization survive as guidance now that no matcher consumes it.

## What must survive

Deprecated-concept exclusion, provenance and review dependencies, identity and routing, the guard and restructuring machinery, and the statelessness rule (no memory across compaction).

## Resolves from the architecture review

Blocking findings B1, B2, B3, B4 and finding C1 in `docs/specification-architecture-review.md` are all downstream of budgets and calibration. Analysis: `docs/retrieval-simplification-impact.md`.

## Comment by artemVeduta

## Resolution

Adopt **LLM-guided native navigation** for `v0.1.0`.

The agent uses harness-native file tools to read current OKF content. The suite
does not provide a custom retrieval backend, matcher, ranking service,
embedding store, tokenizer, cost model, budget, reserve, tier allocator,
retrieval receipt, or retrieval ledger. The model chooses navigation steps and
interprets tool results. It does not treat model memory as bundle content.

### End-to-end find/read flow

1. The harness checks `.okf-active`. Automatic behavior is a silent no-op when
   the marker is absent. An explicit read reports `not-configured`.
2. A supported entry seam emits one fixed-schema, read-only orientation result.
   It contains activation, current bundle identity, root index path, aggregate
   workspace health, and one next action. It contains no full index or concept
   body and does not infer a task.
3. An explicit read starts fresh. It rechecks the marker, current routing,
   bundle admission, and current files. It uses no retrieval result, cursor,
   scope, or validation-result cache.
4. Bundle admission runs before concept navigation in the order
   `REACH -> PRESENCE -> {TRUST, ACCESS}`. Native tools may read only admitted
   and routed bundles.
5. Exact targets use the identity and precedence rules from [Define concept
   identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22).
   A bundle-relative Concept ID and an `okf-workspace://` target are valid
   forms. An exact target never falls back to a similar name or broad search.
6. Broad navigation examines every admitted bundle without merging concepts.
   It uses progressive channels: exact path, indexes and paths, frontmatter,
   then body search when the request needs body content or indexes do not
   resolve it.
7. The normal index path is bundle-root `index.md`, relevant directory index,
   then concept body. An index may be missing, stale, or unreadable. The agent
   reports the condition, uses native search inside admitted scope, and never
   repairs an index during a read.
8. A complete concept claim requires verified end of file. If EOF is unknown,
   the body is `unobservable` and the result is degraded. Readable bytes with
   malformed frontmatter are returned with a parse finding; status is not
   inferred and the file is not repaired.
9. Deprecated concepts remain indexed. Ordinary navigation excludes an
   observed `status: deprecated` concept. An exact target or an explicit
   request to include deprecated concepts is allowed with a warning. The word
   `deprecated` in a query alone is not an opt-in.
10. The agent answers only from observed evidence. It names bundle-relative
    paths, keeps observed paths separate from authored `sources[]` provenance,
    and reports degraded or non-exhaustive coverage when required evidence is
    missing.

### Scope and adapter rules

The shared contract defines portable roles for enumerate, search, read, and
scope enforcement. [Specify the harness plugin architecture and `.okf-active`
opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35)
owns native mappings. Exact tool names are not shared policy.

Adapters must validate native paths against the current admitted realpath
envelope. A path escape is a safety-contract violation. If a harness cannot
enforce or observe the boundary, it reports degraded or unavailable behavior
and makes no complete-scope claim. This path guard is not a retrieval backend.

### Support ceiling

The provisional inclusive support ceiling is:

- 500 source files;
- 100 MB aggregate exact source bytes;
- bundle-relative directory depth 6.

File count includes indexes and every source file the read contract may inspect.
Byte count excludes `.git`, suite caches, and external provenance targets.
Depth counts directories below the bundle root; a root file is depth 0 and a
file in `a/b/` is depth 2.

The ceiling is a claim boundary, not a hard read limit. Reading may continue
above it, but completeness and calibration are not claimed. The values are
provisional. Fixture evidence must validate calibrated claims; it does not
block implementation or unrelated exact reads.

### Result and answer contract

Native find/read uses these fixed labels:

- result: `ok`, `degraded`, `not-configured`, `unavailable`;
- match: `found`, `no match in searched scope`;
- findings: `missing`, `unreadable`, `unobservable`, `invalid`;
- coverage: complete for a named scope and channel, or `non-exhaustive`.

`invalid` is reserved for a verified native-tool or safety-contract violation.
Budget-specific `insufficient` and `invalid` meanings are removed. A complete
no-match claim is limited to the declared scope and search channel.

The final answer uses compact Markdown labels: `Status`, `Match`, `Scope`,
`Found`, `Read`, `Coverage`, and `Next` when needed. It always names observed
concept paths. It reports authored provenance only when it was read from
`sources[]`; a read path is not automatically provenance.

### Cache and query rules

Only an immutable, content-addressed syntax-parse cache may remain from [Define
what a discovery result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32).
It cannot preserve authority, widen scope, or replace current admission.
Admission and applicable validation are recomputed for each resolution.

Exact paths, identifiers, digits, and quoted phrases remain navigation guidance.
No shared query normalization, stemming, aliases, synonyms, stopword deletion,
minimum-length rule, or ranking rule is defined.

### Verification and amendments

[Implement and deterministically test the v0.1.0 skill project](https://github.com/artemVeduta/okf-agent-skills/issues/9)
must add deterministic fixtures for exact targets, admission scope, index
fallback, federation gaps, deprecated concepts, malformed frontmatter, EOF
uncertainty, support-ceiling disclosure, result vocabulary, provenance
separation, and adapter scope guards. Live cross-harness process tests remain
deferred to `v0.2.0`. Release may not claim calibrated support-ceiling behavior
without the fixture evidence.

This supersedes the retrieval contracts in [Design agent retrieval model within
context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13),
[Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28),
and [Prototype and verify the adopted retrieval runtime contract](https://github.com/artemVeduta/okf-agent-skills/issues/33).
It supersedes their retrieval-discovery accounting in [Define what a discovery
result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32)
but retains the separate syntax-parse cache.

It amends [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5),
[Specify the OKF knowledge model and automatic developer lifecycle](https://github.com/artemVeduta/okf-agent-skills/issues/6),
[Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7),
and [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35)
by removing budget-aware task retrieval and its profile selection. Admission,
identity, federation, provenance, archive policy, guard, restructuring, and
statelessness remain authoritative.

This resolves [Replace budget-aware retrieval with index navigation](https://github.com/artemVeduta/okf-agent-skills/issues/36)
for `v0.1.0`.
