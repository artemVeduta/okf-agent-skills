---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/21
status: draft
type: Decision
---

# Choose the OKF conformance baseline, compatibility, and extension policy

Status: Closed.

## Question

Which OKF specification version and conformance contract should v0.1.0 implement, and how should the product handle compatibility and project-specific extensions without confusing normative OKF requirements with product policy?

**Must resolve:**

- whether v0.2 is the write target and which v0.1 inputs remain readable or migratable;
- exact bundle-conformance checks versus producer obligations and consumer behavior;
- conditional requirements, including source, generation, and Attested Computation fields;
- strict errors, compatibility diagnostics, and soft warnings;
- preservation or rejection of unknown frontmatter;
- namespacing and validation of product extensions;
- whether output may claim OKF conformance after extensions or fallback conversion;
- version negotiation, migration notices, and future specification changes;
- the policy for repository-specific fields needed by identity, traceability, routing, or lifecycle features.

The result must be an explicit compatibility matrix and extension policy that downstream lifecycle, validation, migration, and specification tickets can apply without inventing semantics.

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) rejects `importance`/`priority` for `v0.1.0` and permits only explicitly authored discoverability aliases, contingent on this ticket approving their representation and extension semantics.

## Comment by artemVeduta

## Resolution

### Baseline and release policy

[`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md` on `main`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) is the canonical specification. Each suite release records the exact upstream revision it reviewed. Suite `v0.1.0` implements OKF v0.2 as reviewed at [`3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828c2f23d109c855ee403c3a4c81f3a96/okf/SPEC.md). Later upstream changes affect suite behavior only through an explicit suite release.

Suite `v0.1.0` emits only OKF v0.2. Mutation eligibility requires a bundle-root `index.md` whose parsed `okf_version` is exactly the string `"0.2"`. Flags and project configuration cannot override it. The writer emits `okf_version: "0.2"`. "Suite-managed" means mutation-eligible, not product-owned.

### Compatibility matrix

| Input state | Probe/read | Audit | Ordinary mutation/rebuild | Repair/migration | Claims |
|---|---|---|---|---|---|
| Exact `"0.2"`, all applicable layers pass | Normal retrieval | Full layered audit | Allowed with canonical v0.2 writer | Optional explicit repair | Independent positive claims supported by evidence |
| Exact `"0.2"` with active legacy content, producer/profile defects, or unsafe concepts | Safe reads continue | Full, scoped findings | Only genuinely unrelated transactions; affected writes block | Previewed explicit repair | `target-v0.2`; other claims only where their layer passes |
| Exact `"0.1"` | Safe reads using v0.2 legacy fallbacks, always disclosed | Compatibility-aware audit | Blocked, including derivative rebuilds | Explicit manual migration to v0.2 | `migration-required-v0.1`; no v0.1 or v0.2 conformance claim before migration |
| No declaration | Migration inventory/preflight only; no ordinary retrieval | Preflight only | Blocked | Explicit migration required | `migration-required-undeclared`; no conformance claim before migration |
| Unsupported declaration | Bounded root probe only; no semantic read | Bounded rejection diagnosis | Blocked | Exact declaration repair only if the declaration is wrong; no generic future-version migration | `unsupported` |
| Malformed declaration, including numeric `0.2` | Bounded root probe only; no coercion | Bounded rejection diagnosis | Blocked | Previewed declaration repair, then fresh classification | `malformed` |

Declared v0.1 concepts within the supported YAML profile are readable through the live v0.2 specification's `timestamp` and `# Citations` fallbacks. Safe concepts remain readable when another concept is blocked. Unknown data is preserved. Fixable defects require explicit repair; unsafe YAML blocks transformation of the affected document. Reports say `v0.1 consumed using v0.2 fallback`, never `v0.1 conformant`.

Undeclared bundles never supply ordinary retrieval context. Unsupported future versions deliberately receive stricter suite behavior than upstream's best-effort-consumption `SHOULD`; this is suite compatibility policy, not base OKF conformance.

### Conformance and findings

Five independent origins are reported:

- **Base conformance**: exactly the three tests in [OKF v0.2 section 11](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md#11-conformance): parseable concept frontmatter, a non-empty `type`, and conforming present `index.md`/`log.md` files.
- **Producer contract**: applicable explicit `MUST`/`REQUIRED` obligations outside those three tests.
- **Compatibility**: version, fallback, migration, legacy conflict, and residue behavior.
- **Suite profile**: declaration eligibility, restricted YAML, preservation, canonical output, and body conventions.
- **Hygiene**: nonblocking integrity and lifecycle warnings.

Every finding carries a stable code, origin, severity, affected scope, and blocked operations. Severities are `error`, `blocker`, `compatibility`, `warning`, and `advisory`; blocking is represented independently from severity.

Only explicit producer `MUST`/`REQUIRED` rules block affected writes. These include present `sources` entries without `resource`, present `generated` without `by`, `type: Attested Computation` without `runtime`, and known human authors or confirmers without `human:`. The suite does not invent a `parameters`, `executor`, or `attester` requirement. Upstream `SHOULD` and editorial guidance remain nonblocking advisories.

The complete transaction write/dependency set defines affected scope. A defect in one concept blocks rewriting or deleting that concept and rebuilding derivatives that depend on it, not an independent concept. Root declaration failure blocks every managed write. Previewed explicit repair or migration is the corrective exception.

The reader accepts bare- or list-form `verified`; the canonical writer emits a list. During Attested Computation invocation, an agent may supply only declared parameter values and must not author or edit the sanctioned computation. That is an operational producer safeguard, not static bundle conformance.

Default warnings are limited to broken internal links and `today >= stale_after`. They never block or alter conformance. Unknown fields/types, missing optional families, missing indexes, and editorial recommendations do not warn by default.

### YAML and preservation

The suite profile is YAML 1.2.2 Core with a restricted tree data model:

- exact frontmatter boundaries and one root mapping;
- unique string mapping keys;
- mappings, sequences, and Core scalar values;
- top-level nonblank string `type`, without coercion;
- no duplicate keys, non-string keys, merge semantics, graph-dependent anchors/aliases, custom or unsafe tags/constructors, or non-finite floats.

Broader YAML may be valid upstream while unsupported for suite mutation; that is a suite-profile finding, not automatically an OKF conformance error.

Unknown third-party frontmatter is preserved semantically: key names, scalar types and values, sequence order, and mapping structure survive. Comments, mapping order, quote style, scalar spelling, and formatting are not guaranteed. If semantic preservation cannot be proved, the affected rewrite blocks.

A real mutation canonicalizes complete frontmatter. A semantic no-op writes nothing. Untouched Markdown body content remains unchanged.

### Extensions, aliases, and operational state

The suite persists and requires no product-specific frontmatter extensions. Unknown third-party extensions remain tolerated and semantically preserved. Non-concept state may be authoritative for operational or configuration concerns, such as workspace routing, caches, guards, manifests, checkpoints, and receipts, but never for durable concept semantics.

An optional authored alias section has this exact grammar:

```markdown
## Discoverability aliases

- customer churn
- subscriber attrition
```

At most one section is allowed. Each item is a nonblank, single-line plain-text phrase; links, nesting, inline code, and generated synonyms are invalid. Retrieval applies the normalization from [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13). Aliases affect discovery only, never identity, paths, redirects, tags, ownership, or precedence. Any index projection is rebuildable and non-authoritative.

Identity, traceability, routing, redirect, archive, and lifecycle decisions must use standard OKF fields, visible Markdown conventions, or non-semantic operational state. They may not invent product frontmatter or a semantic sidecar.

### Migration and residue

Migration is explicitly invoked and emits v0.2 only. Whether the manual entry point is `init` or a dedicated skill belongs to [Define safe migration of existing knowledge into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/19), subject to [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5).

Structured `sources` is authoritative when it coexists with legacy citations. Only structurally unambiguous citations are converted automatically. Existing matching `sources` entries are not overwritten. Conflicts and ambiguous prose are never guessed.

A legacy timestamp never fabricates `generated`, an actor, verification, or provenance. Unresolved timestamp and citation material moves verbatim into a visible, inert `## Migration residue` body section and an operational receipt; active legacy syntax is removed. Migration may remain `partial`, but the concept is no longer mixed-format and permanently blocked.

Every fallback, migration-required state, conflict, or residue emits a structured compatibility finding. Clean target-v0.2 processing remains quiet.

### Claims

Claims are independent and emitted only when their own evidence supports them:

- `OKF v0.2 bundle-conformant`
- `OKF v0.2 producer-compliant`
- version: `target-v0.2`, `migration-required-v0.1`, `migration-required-undeclared`, `unsupported`, or `malformed`
- `suite v0.1.0 profile-valid`
- hygiene: `clean` or `warnings`
- migration: `not-attempted`, `complete`, or `partial`
- semantic fidelity: `not-assessed`, `machine-checked`, or `human-reviewed`

Bundle conformance does not establish producer compliance, migration completeness, or semantic fidelity. Fallback consumption does not establish conformance. Never emit an unqualified `conformant`, `compliant`, `succeeded`, or equivalent claim.

This policy supplies the compatibility and extension boundary for [Specify the OKF knowledge model and automatic developer lifecycle](https://github.com/artemVeduta/okf-agent-skills/issues/6), [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7), and [Define safe migration of existing knowledge into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/19).

## Comment by artemVeduta

## Review: thermo-nuclear quality audit of the resolution — verdict `block`

Reopening. This resolution is being corrected, not discarded. The audit trail is below; the corrected resolution follows in a separate comment.

The review lens was: every normative claim must be grounded in [`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), and the policy must not out-architect a format whose stated principle is minimality — one required field, permissive consumers, "if you can `cat` a file, you can read OKF."

### Verdict

**Block**, on two independent grounds: one spec-fidelity blocker, and an over-architecture failure of roughly 30 concepts where 10 do the same work. Both trace to a single root cause, stated under "the code-judo move" below.

### Spec-fidelity findings

**F4 — Undeclared bundles are denied ordinary retrieval and labelled `migration-required-undeclared`. Blocker.**

§12 says bundles **MAY** declare `okf_version`; §11's three conformance tests do not mention it. An undeclared bundle passing those three tests *is* conformant with OKF v0.2. The resolution refuses to read it, withholds the claim it has earned, and calls it migration-required when nothing needs migrating — writing one line into one file is adoption, not migration. This is also the harshest divergence in the document and, unlike the future-version case, it is not flagged as suite policy; it sits in the matrix indistinguishable from genuine version mismatches. The common case — hand-written bundles and the reference agent's own output — lands here.

**F5 — Unsupported future versions receive a bounded probe with no semantic read. High.**

§12: "Consumers that do not understand the declared version SHOULD attempt best-effort consumption rather than refusing the bundle." The divergence is correctly *flagged* as suite policy, but not *justified*. A bundle declaring `"0.3"` must still pass the same three §11 tests to be readable; §4.1 already compels tolerating unknown keys and unknown types; the write gate already demands exact `"0.2"` and is untouched by relaxing the read. Refusing to read buys no safety and costs the user the entire bundle.

**F7 — The restricted YAML profile is not required by the spec and is stated too broadly. Medium.**

§4 says frontmatter is "a YAML metadata block"; §11 requires it be "parseable". No YAML version, profile, or prohibition list appears anywhere in the spec. The underlying intent is sound — merge keys and graph-shaped anchors genuinely cannot be semantically round-tripped, so blocking a *rewrite* is honest — but an eight-bullet normative surface will drift from what the writer actually does the first time the YAML library is swapped. Separately, the bullet "top-level nonblank string `type`, without coercion" **is §11 test #2** filed under the suite-profile origin, so under the resolution's own model a missing `type` would be reported with the wrong origin.

**F8 — "If semantic preservation cannot be proved, the affected rewrite blocks" is undecidable as written. Medium.**

Nothing defines the proof obligation, the prover, or what discharges it. Exactly one decidable procedure exists — parse, write, re-parse, compare trees — and it has two outcomes, not three. As written the rule licenses blocking on any unease, with no defined unease.

**F10 — Internal contradiction: "no product frontmatter extensions" versus `## Discoverability aliases`. High.**

The resolution declares the suite "may not invent product frontmatter or a semantic sidecar," then two paragraphs earlier defines a product-specific, machine-parsed, grammar-constrained body section whose contents change retrieval behavior. It satisfies the letter (not frontmatter) while defeating the purpose: a non-suite OKF consumer renders it as prose, the suite treats it as index input, and the two consumers disagree about what the document means — precisely what the no-extensions rule exists to prevent.

The irony compounds. §4.1 **explicitly blesses** frontmatter extensions: "Producers MAY include any additional keys. Consumers SHOULD preserve unknown keys … and MUST NOT reject documents with unrecognized fields." A frontmatter `aliases:` key would be *more* spec-conformant than the body section. The resolution invented a rule stricter than the spec, then routed around its own rule using a less conformant mechanism.

**Verified correct, no finding.** The §11 three tests are enumerated exactly, with an explicit refusal to expand them — the single most spec-faithful decision here. All four producer `MUST`s check out against §5.1, §5.2, §7, and §10.2; no `SHOULD` was promoted. Bare-or-list `verified` on read with list on write matches §5.2. The default warning set does not violate the MUST-NOT-reject rules.

**F1 — the resolution was right and the project's own research note was wrong.** The resolution states the suite does not invent a `parameters`, `executor`, or `attester` requirement. Confirmed against the live spec: `runtime` carries the only `REQUIRED for this type` marking, `parameters` carries **no status marker at all**, and §12 lists all five keys among "new optional keys". `docs/research/02-okf-v02-spec.md` asserted `parameters` was "Required for this type (implied)" — invented, now corrected in the working tree. The grilling was more accurate than the research feeding it.

### Over-architecture findings

The document forces roughly **30 distinct concepts** on every downstream implementer of #6, #7, and #19. Seven derive from the spec or `CONTEXT.md`; the other 23 are net-new. Ranked by complexity deleted:

| Mechanism | What breaks if deleted | Collapses to |
|---|---|---|
| The 6 × 5 compatibility matrix | Nothing — row 2 is not a version state at all, it is a findings state already determined by the next section | One write predicate, three read behaviours |
| Five finding origins | Nothing branches on origin except the claim vocabulary, itself under review | Two: `okf` and `suite` |
| Five severities plus an orthogonal blocking flag | Nothing. `severity: blocker, blocks: false` is representable and meaningless; `compatibility` is an origin wearing a severity costume | `{error, warning}` × `blocks: bool` |
| Eight claim vocabularies (~16 values) | Nothing. `semantic fidelity` has two of three values unreachable at ship; `migration` belongs to #19 | Three report lines |
| `## Discoverability aliases` and its six-rule grammar | Nothing in v0.1.0. #13 permitted aliases *conditionally* — permission to say no — and its prototype explicitly did not exercise alias expansion | Deleted; deleting it also resolves F10 |
| The eight-bullet YAML profile | Nothing | One executable round-trip predicate |

**One rule is a one-way door.** *"Migration may remain `partial`, but the concept is no longer mixed-format and permanently blocked."* Read literally, a partially-migrated concept can never be written again, with no stated unblock path and no operation that clears the state. Either the sentence is wrong, or v0.1.0 ships something that permanently bricks concepts on a best-effort operation.

**Scope leak.** Migration is #19's ticket, and #19 is open and blocked by this one. This resolution nonetheless pre-decides #19's body-section name, receipt shape, and state model while claiming only to supply #19's "compatibility and extension boundary."

### The code-judo move

> **`okf_version` is a write gate, not a read gate.**

The resolution treats the declaration as a classifier sorting bundles into six states, and every other mechanism exists to service that classification. Invert it: §11 already classifies bundles — three tests, pass or fail. The declaration answers exactly one further question: *may I mutate this?*

Once inverted, the version state machine has nothing left to do, and the five origins, five severities, and eight claim vocabularies go with it. Concept count drops from ~30 to ~10, while every safety property that matters survives: exact-`"0.2"`-to-write as the real protection against mutating someone else's bundle, producer-`MUST` blocking, semantic-not-lexical preservation, no silent migration, mandatory fallback disclosure, scoped blocking, and no unqualified conformance claims.

### Kept without change

Do not over-correct. These are load-bearing and correct: the three §11 tests enumerated exactly with the refusal to expand them; refusing to invent `parameters`/`executor`/`attester` requirements; exact string `"0.2"` as a non-overridable write gate (only its *scope* was wrong); semantic-not-lexical preservation with the honest list of what is not preserved; the migration safety rules, which are the highest-value content in the document — a legacy timestamp never fabricating `generated`, an actor, verification, or provenance; structured `sources` authoritative over legacy citations; ambiguous prose never guessed; existing matching entries never overwritten; the default warning set and its explicit *non*-warning list; "never emit an unqualified `conformant`"; bare-or-list `verified` handling; and the Attested Computation operational safeguard, correctly labelled operational rather than static bundle conformance.

### Resolution path

Adopted: the full reframe. This ticket is reopened, will be re-resolved against the write-gate model, and closed again. #19, #7, and #6 stay blocked until then — #19's scope in particular *grows*, since the migration state model and residue mechanics relocate to it.

## Comment by artemVeduta

## Resolution (corrected)

Supersedes the earlier resolution on this ticket, which was blocked by the [quality review above](https://github.com/artemVeduta/okf-agent-skills/issues/21#issuecomment-5109123013). The safety properties are unchanged; the mechanism that delivered them collapsed from roughly thirty concepts to ten. What changed and why is recorded at the end.

### Baseline

[`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md` on `main`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) is the canonical specification. Suite `v0.1.0` implements OKF v0.2 as reviewed at [`3fcbb9f`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828c2f23d109c855ee403c3a4c81f3a96/okf/SPEC.md). Each suite release records the upstream revision it reviewed; later upstream changes affect suite behavior only through an explicit suite release.

OKF v0.2 is pre-1.0 and internally inconsistent about its own versioning — §12 calls v0.2 a minor bump while §13.1 ships two breaking changes. Upstream therefore treats the version declaration as advisory: `okf_version` is `MAY` (§12), and consumers that do not understand a declared version `SHOULD` still attempt best-effort consumption (§12). This resolution follows that posture for reads and is deliberately conservative only for writes.

### `okf_version` is a write gate, not a read gate

This is the governing decision; the rest follows from it. §11 already classifies bundles through three tests. The declaration answers exactly one further question: **may the suite mutate this bundle?**

### Reading

The suite reads any bundle, always. It applies the three OKF v0.2 §11 conformance tests — parseable concept frontmatter, a non-empty `type`, and conforming `index.md`/`log.md` where present — and reports the result. It applies the §13.1 legacy fallbacks, `timestamp` when `generated` is absent and `# Citations` when `sources` is absent, and discloses in the report whenever it used one, phrased `v0.1 consumed using v0.2 fallback` and never `v0.1 conformant`.

An absent declaration, an unknown declared version, a declaration that is not the string `"0.2"`, unknown frontmatter keys, unknown `type` values, broken cross-links, and missing `index.md` files never prevent a read and never withhold a conformance claim that §11 has been earned. This is §11 consumer forbearance and §12 best-effort consumption; the suite does not narrow either.

### Writing

The suite writes only where the bundle-root `index.md` frontmatter carries `okf_version` equal to the string `"0.2"`. Any other value — `"0.1"`, an unquoted float, a future version, or no declaration at all — makes the bundle read-only to the suite. Flags and project configuration cannot override this. The writer emits `okf_version: "0.2"` and canonicalizes complete frontmatter on any real mutation; a semantic no-op writes nothing, and untouched body content is left byte-identical.

Adopting an undeclared bundle is an explicit, previewed operation whose only effect is writing the declaration. Migrating v0.1 content is a separate explicit operation owned by [#19](https://github.com/artemVeduta/okf-agent-skills/issues/19). Neither ever happens implicitly, and neither is a precondition for reading.

A write is blocked when, and only when:

1. the concept fails a §11 test;
2. the concept violates an explicit OKF producer `MUST` — a present `sources` entry without `resource` (§5.1), a present `generated` without `by` (§5.2), `type: Attested Computation` without `runtime` (§10.2), or a known human author or confirmer without the `human:` prefix (§7);
3. the suite cannot reproduce the frontmatter's parsed semantics through its own writer, established by re-parsing its own output and comparing parse trees. Unequal trees abort the write and the finding names the construct responsible.

These four are the only producer obligations enforced. The suite does not invent a `parameters`, `executor`, or `attester` requirement: `runtime` carries the sole `REQUIRED for this type` marking in §10.2, and §12 lists all five keys among "new optional keys". Upstream `SHOULD`s and editorial guidance never block.

A block is scoped to the affected concept plus the derivatives being rebuilt from it; independent concepts stay writable. A root-declaration failure blocks every managed write.

Blocking rules 1 and 2 govern the suite acting as a **producer**. They never cause the suite, acting as a consumer, to reject or refuse to read a third-party bundle.

### Reporting

Every finding carries a stable code, an origin of `okf` or `suite`, a severity of `error` or `warning`, and a boolean `blocks`. A run emits at most three lines:

- `OKF v0.2 bundle-conformant: yes | no`
- the blocked operations, with finding codes
- the legacy fallbacks used, if any

Default warnings are broken internal links and `today >= stale_after`. They never block and never affect conformance. Unknown fields and types, missing optional families, missing indexes, and editorial recommendations do not warn. A clean run is quiet.

The suite never emits a bare `conformant`, `compliant`, `succeeded`, or equivalent. Bundle conformance establishes nothing about producer compliance, migration completeness, or semantic fidelity, and fallback consumption establishes no conformance at all.

### Extensions and operational state

The suite persists no product-specific frontmatter and no product-specific body sections. Unknown third-party frontmatter is preserved **semantically**: key names, scalar types and values, sequence order, and mapping structure survive. Comments, mapping order, quote style, scalar spelling, and formatting are not preserved.

The reader accepts bare- or list-form `verified` per §5.2; the canonical writer emits a list.

Non-concept operational state may be authoritative for operational or configuration concerns — workspace routing, caches, guards, manifests, checkpoints, receipts — but never for durable concept semantics. Identity, traceability, routing, redirect, archive, and lifecycle decisions must use standard OKF fields, visible Markdown conventions, or that operational state. They may not invent product frontmatter or a semantic sidecar.

During Attested Computation invocation an agent may supply only declared parameter values and must not author or edit the sanctioned computation (§10.3). This is an operational producer safeguard, not a static bundle-conformance test.

**Discoverability aliases are declined for `v0.1.0`.** [#13](https://github.com/artemVeduta/okf-agent-skills/issues/13) permitted them contingent on this ticket approving a representation; this ticket approves none. [#33](https://github.com/artemVeduta/okf-agent-skills/issues/33) did not exercise alias expansion, so no validated mechanism exists to ship. Should retrieval later demonstrate the gap, the correct mechanism is a frontmatter key, which §4.1 explicitly blesses — "Producers MAY include any additional keys… Consumers SHOULD preserve unknown keys… and MUST NOT reject documents with unrecognized fields" — and which is purely additive. A machine-parsed body section is not, because a non-suite OKF consumer renders it as prose while the suite reads it as index input, leaving two consumers disagreeing about what the document means.

### Migration boundary

These invariants bind [#19](https://github.com/artemVeduta/okf-agent-skills/issues/19); the mechanics are its own.

Migration is explicitly invoked and emits v0.2 only. Structured `sources` is authoritative wherever it coexists with legacy citations. Only structurally unambiguous citations convert automatically; existing matching `sources` entries are never overwritten; conflicts and ambiguous prose are never guessed. A legacy `timestamp` never fabricates `generated`, an actor, verification, or provenance. Material that cannot be converted under these rules must survive somewhere visible and inert rather than being dropped or guessed at.

#19 owns where that material lands, what the operation reports and records, and the migration state model. The superseded resolution's rule that a partially migrated concept becomes *permanently* blocked is **not** carried forward: as written it was a one-way door with no unblock path, and #19 must decide the actual state model deliberately.

### What changed from the superseded resolution

- **Corrected, spec violation.** Undeclared bundles were denied ordinary retrieval and claimed `migration-required-undeclared`. §12 makes the declaration `MAY` and §11 never mentions it, so an undeclared bundle passing the three tests is conformant. It now reads normally and earns the claim; only writes are gated.
- **Corrected, spec violation.** Unsupported future versions received a bounded probe with no semantic read, against §12's best-effort `SHOULD`. Refusing the read bought no safety — the write gate already demands exact `"0.2"` — and cost the user the whole bundle. Future versions now read best-effort with disclosure.
- **Corrected, layering.** "Top-level nonblank string `type`" was filed under the suite profile; it is §11 test #2 and now reports with origin `okf`.
- **Collapsed.** The six-state × five-column compatibility matrix became one write predicate and one read rule. Five finding origins became two. Five severities plus an orthogonal blocking flag became two severities × one boolean. Eight claim vocabularies became three report lines.
- **Deleted.** The eight-bullet restricted YAML profile, replaced by the round-trip predicate in blocking rule 3 — an executable check rather than an enumeration that drifts the first time the YAML library changes. The `## Discoverability aliases` grammar, which also resolved a contradiction with this ticket's own no-extensions rule. The `semantic fidelity` vocabulary, two of whose three values are unreachable in `v0.1.0`.
- **Repaired.** "If semantic preservation cannot be proved, the affected rewrite blocks" was undecidable — no prover, no discharge condition. Replaced by the stated parse-tree comparison.
- **Relocated.** The `## Migration residue` section name, receipt shape, and migration state model moved to #19, whose scope they were.

This policy supplies the compatibility and extension boundary for [#6](https://github.com/artemVeduta/okf-agent-skills/issues/6), [#7](https://github.com/artemVeduta/okf-agent-skills/issues/7), and [#19](https://github.com/artemVeduta/okf-agent-skills/issues/19).
