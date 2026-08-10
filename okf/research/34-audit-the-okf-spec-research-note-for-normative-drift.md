---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/34
status: draft
type: Research
---

# Audit the OKF spec research note for normative drift

Status: source GitHub issue closed.

## Question

Does `docs/research/02-okf-v02-spec.md` misstate the normative force of OKF v0.2 requirements anywhere else, and what convention prevents recurrence?

**Why this is a bug, not a nit.** The document is the input every downstream ticket cites instead of re-reading the spec. It restructures the spec's prose into tables — and §10.2 of the real spec is a bullet list with **no status column**. Tabulating it created a "Status" cell for `parameters`, a field the spec marks with nothing at all, and the cell was filled with the invented "Required for this type (implied)". The format manufactured a requirement.

That one instance is fixed. The failure mode is not: the same document tabulates normative prose throughout, including §11 conformance, §5.1 sources, §7 actors, and §12 versioning.

**Must resolve:**

- every table and prose assertion checked against the live spec's verbatim wording, RFC-2119 keyword by keyword;
- each drift classified — `SHOULD` hardened to required, `MAY` hardened to `SHOULD`, an unmarked field given a marker, a `MUST` softened, producer and consumer obligations swapped, conformance tests conflated with other requirements;
- claims with no spec basis at all identified;
- spec text, reference-implementation behavior, and the analysis author's own opinion separated and labelled, since the document currently mixes all three;
- a stated convention that stops tabulation from inventing normative force again.

Verified-clean sections must be named explicitly, so the fix pass knows what not to touch and later readers know what was checked.

**Discovered by** the quality review of [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21), where the resolution proved more accurate than the research note feeding it.

## Comment by artemVeduta

## Resolution

Systemic, not a one-off. **29 findings, 12 of them tabulation-induced normative drift, 3 high severity.** Two of the twelve sat two rows below the `parameters` row that had already been fixed — patching the row had left its twins in place.

Applied in [`6061193`](https://github.com/artemVeduta/okf-agent-skills/commit/6061193). Audited against `okf/SPEC.md` on `main`, read in full rather than summarized, and cross-checked against `okf/README.md` for attribution claims.

### Root cause

The document ran a binary `NORMATIVE` / `editorial` taxonomy. RFC 2119 has five keywords plus *no keyword*. A binary scheme has no slot for `SHOULD`/`RECOMMENDED` — normative but not mandatory — and no slot for "the spec is silent here". So `SHOULD` collapsed into "editorial", which readers correctly parse as ignorable, and silence was backfilled with a guess.

Tabulation then hardened the guess. A rectangular table demands a value in every cell, and a table cell is visually indistinguishable from a quoted requirement. §10.2 of the spec is a **bullet list with no status column**; rendering it as a table with one manufactured the empty cells that got filled with "Required for this type (implied)" and "Optional (but core to model)".

Corroborating the diagnosis: the document **contradicted itself three times**, and in every case the *table* was wrong while the prose or another table was right. That is the signature of the mechanism, not of scattered carelessness.

### High severity

- **A producer obligation was filed as a consumer validation check.** The `human:` actor prefix (§7) sat in a table headed "Normative (MUST validate or MUST NOT reject)". §11 conformance is the three bundle tests only, so a validator built from that table rejects bundles the spec declares conformant — and [#9](https://github.com/artemVeduta/okf-agent-skills/issues/9) is the ticket that builds the validator. Now split into three tables — MUST enforce, MUST NOT reject for, and producer obligations — each carrying an explicit `Who` column, with a callout: a validator MUST NOT fail a bundle for a missing `human:` prefix.
- **`SHOULD` hardened to required.** "Round-trip preservation **required**: all unknown frontmatter keys." §4.1 makes preservation `SHOULD`; only non-rejection is `MUST NOT`. The document's own §11 table already had this right.
- **`executor` and `attester` carried invented statuses.** "Optional (but core to model)" for two fields §10.2 marks with nothing — identical to the `parameters` bug.

### Also corrected

Spec-basis failures: the "the spec and README both emphasize" quote is **README-only** and absent from SPEC.md; the entire Relationship-to-Other-Formats table names seven systems (Obsidian, Notion, MkDocs, DataHub, OpenMetadata, and others) that appear **nowhere** in the spec; three design-principle rows were README framing attributed to the spec; reference-implementation behavior sat inside a table headed "what edge cases does the spec explicitly handle".

An omission worth recording: **§10.5 is explicitly labelled "informative, not normative"** by the spec and contains its most imperative-sounding line — "Gate: refuse to display a failing attestation" — and this document never mentioned §10.5 at all. Anyone mining the spec directly reads "refuse" as a requirement. Now documented with its informative marker and the much weaker normative residue (§11's `SHOULD` surface, not silently drop).

Lower-severity keyword drift: `MAY` dropped from §12's major-bump clause; "typically" dropped from §4.1's unknown-type tolerance, turning an illustration of compliance into the required method; a closed `MUST NOT reject` list generalized into an open principle; §5.1's credibility-propagation `MAY` dropped entirely; a nesting-depth rule invented from an ellipsis in a diagram; `NORMATIVE` banners over §5.3 and §5.5, which are definitional and whose derivation §11 makes `SHOULD`.

### Anti-recurrence conventions

Now stated at the top of the document and binding on every future edit:

1. **Empty stays empty.** A status cell with no corresponding RFC 2119 keyword renders `—`. Never "implied", never "Optional", never "Core". If most of a status column is `—`, the spec did not enumerate that section and the content belongs in prose. This one rule kills five of the twelve drift findings.
2. **Normative claims carry the spec's verbatim words** with a section number. An interpretation never appears without the source text beside it.
3. **Six buckets replace the binary**: `MUST` · `MUST NOT` · `SHOULD` · `MAY` · *definitional* · *not in spec*.
4. **Producer and consumer are labelled, never inferred from table placement.**
5. **Every claim carries a provenance tag**: `[SPEC §x.y]` · `[REF-IMPL]` · `[README]` · `[ANALYSIS]`. Analysis content is gathered under `## Analysis (not spec)` headings so nothing downstream can cite it as a requirement.

One cheap check worth institutionalizing: all three self-contradictions could have been caught by grepping each field name across the document and comparing every occurrence's asserted force — no access to the spec required.

### Verified clean

Twenty-three sections were checked verbatim and left untouched, recorded by line range in the audit. **§5.1's Sources table is the model the rest of the document now follows** — every status cell there traces to an explicit spec marker, which is why it never drifted. The reference-implementation subsections were already correctly labelled; that convention is now applied document-wide rather than only where it happened to be used.

### Scope note

This ticket audited `02-okf-v02-spec.md` only. The other research notes under `docs/research/` were not examined and may carry the same pattern — they were written by the same process, and the mechanism is a formatting habit rather than a one-file mistake. Not ticketed here; flagged for whoever picks up [#8](https://github.com/artemVeduta/okf-agent-skills/issues/8).

## Comment by artemVeduta

## Follow-up: this audit was incomplete — seven further defects found

A line-by-line comparison of `docs/research/02-okf-v02-spec.md` against the
upstream spec (`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md`, pinned at
commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`, blob
`a516d50128f5aa1f5746d1464661a39f7143e875`, md5 `1ad56831bf45687ebb3a47db03f54931`)
found seven defects this audit did not catch. The audit verified 23 sections
clean and those results hold; the gap is in coverage, not in what it checked.

Full evidence, with quotes from both sides, is in
[`docs/research/google-cloud-okf-spec-comparison.md`](docs/research/google-cloud-okf-spec-comparison.md).

**Four of the seven are self-contradictions against the note's own conventions**
— the conventions written in this issue to prevent exactly this class of drift
did not get applied to the whole document.

### Three missing `MAY` permissions

1. **§9** — "A `log.md` file MAY appear at any level of the hierarchy to record
   the history of changes to that scope." The note showed `log.md` only at the
   bundle root.
2. **§3.1** — the "at any level of the hierarchy" scoping clause was dropped
   from the reserved-filename `MUST NOT`.
3. **§6.1** — "Concepts MAY link to other concepts using standard markdown
   links." The note documented the two link forms and the broken-link `MUST`
   but never the base permission.

### Four actor-attribution errors

- **X1** — §9's date-heading `MUST` was filed twice: as a Consumer enforcement
  rule and as a producer obligation. The spec names no actor; §11 test 3
  reaches it as a property of the bundle.
- **X2** — §3.1's `MUST NOT` was filed as both Consumer and Producer. The
  Consumer entry violated the note's own rule that a validator MUST NOT fail a
  bundle for a producer obligation. (Violates convention 4.)
- **X3** — the heading "A consumer MUST enforce" appears nowhere in the spec.
  §11 says "A bundle is conformant with OKF v0.2 if", and in the same section
  tells consumers they MUST NOT reject. The note itself admitted "The gloss is
  this document's" — so a `MUST` heading was wrapping an `[ANALYSIS]` claim.
  (Violates convention 5.)
- **X4** — §8's "Entries SHOULD include the description" was labelled
  "Editorial", while the same rule was filed correctly in the SHOULD table.
  (Violates convention 3, which states there is no normative/editorial binary.)

### What was fixed

All seven, in `docs/research/02-okf-v02-spec.md` only:

- Added the §9 nested-`log.md` `MAY`, the §3.1 "at any level" clause (prose,
  table, and both producer-obligation listings), and the §6.1 base `MAY`.
- Replaced the "A consumer MUST enforce" table with a **Bundle-conformance
  tests (§11)** table whose actor column reads "Bundle property — no actor
  named", listing all three §11 tests. The §9 date `MUST` and the §3.1
  `MUST NOT` no longer appear as consumer checks. The one genuine §11 consumer
  `MUST` (bare `verified` normalization) is now its own table.
- Relabelled the §8 `SHOULD` as normative. Two further "Editorial" labels on
  keyword-free text (§6.1 link semantics, §9 log-entry prose) became
  "Definitional (no RFC 2119 keyword)", per convention 3's six buckets.

Also restored four non-normative omissions: §4.1 `resource`'s actual definition
("A URI that uniquely identifies the underlying asset"), §8's
`* [Subdirectory](subdir/)` entry form, §5's "Their absence carries meaning",
and §10.3's "binding … is the consumer's job".

No status cell was filled where the spec is silent; convention 1 held
throughout. No other repo file was modified, and nothing was committed.

Leaving this issue closed — recording the gap for the record, not reopening.
