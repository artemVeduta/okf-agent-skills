# Google Cloud `okf/SPEC.md` vs. This Project's Normative Note

Comparison of the upstream OKF specification against
`docs/research/02-okf-v02-spec.md`, and an impact check against the adopted
conformance baseline in issue #21.

## Provenance

| Item | Value |
|---|---|
| Fetch date | 2026-08-01 |
| Spec URL (raw) | `https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md` |
| Spec URL (browse) | `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md` |
| Repo | `GoogleCloudPlatform/knowledge-catalog` |
| Repo description | "Google Cloud Knowledge Catalog Tools and Samples" |
| Repo homepage | `https://cloud.google.com/products/knowledge-catalog` |
| Repo created | 2026-05-04T16:36:24Z |
| Repo license | Apache-2.0 (`LICENSE.md`, and `okf/LICENSE.md` separately) |
| Repo is a fork | No (`fork: false`) |
| Default branch | `main` |
| `main` HEAD at fetch | `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` (2026-07-24T16:45:43Z, "Update SPEC.md") |
| `okf/SPEC.md` blob SHA | `a516d50128f5aa1f5746d1464661a39f7143e875` |
| `okf/SPEC.md` size | 37544 bytes |
| `okf/SPEC.md` md5 | `1ad56831bf45687ebb3a47db03f54931` |

Full commit history of `okf/SPEC.md` (verified via GitHub API, all commits):

```
3fcbb9f828c2  2026-07-24T16:45:43Z  Update SPEC.md
780fe9d30b5b  2026-07-24T16:45:07Z  okf: migrate format and tooling to Open Knowledge Format v0.2 (#227)
ee67a5ca2704  2026-06-12T05:02:31Z  Import Open Knowledge Format reference enrichment agent (#28)
```

Repo top level: `okf/`, `samples/`, `toolbox/`, `README.md`, `LICENSE.md`,
`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
`okf/` contains: `SPEC.md`, `README.md`, `LICENSE.md`, `pyproject.toml`,
`src/`, `tests/`, `bundles/`, `samples/`.

**Verified vs. inferred.** Everything in the table above was read directly from
the GitHub API or from the fetched bytes on 2026-08-01. The publisher is
inferred from the org (`GoogleCloudPlatform`) and the repo homepage; the spec
document itself names no author, no organization, and **no date**.

---

## Q1 — Is this the same document as an "openknowledgeformat.org v0.2 spec"?

**There is no openknowledgeformat.org specification.** The premise of the
question does not hold.

Verified 2026-08-01:

- `openknowledgeformat.org` resolves to `192.64.119.39`; the apex over HTTPS
  times out. `https://www.openknowledgeformat.org/` returns HTTP 200 and serves
  a **Namecheap parked-domain page**: "has been recently registered with
  namecheap.com", "Want a domain name like this? Discover domains on auction
  now". MX records point at `eforward{1..5}.registrar-servers.com` (Namecheap).
  No specification, no OKF content, no navigation beyond Namecheap auctions.
- A code search across `GoogleCloudPlatform/knowledge-catalog` for the string
  `openknowledgeformat` returns **0 results**. Upstream never references that
  domain.
- This project's own research notes reference **`openknowledgeformat.com`**
  (a community browser validator — see `07-ecosystem-projects.md:270`,
  `ecosystem-deep/specialized.md:365`), not `.org`. The `.org` domain appears
  nowhere in this repo.

**Therefore the Google Cloud `okf/SPEC.md` is not a fork, superset, subset, or
competitor of anything at that domain — it is the sole normative OKF v0.2
specification**, and it is already the one `02-okf-v02-spec.md` documents.

Version strings and dates, quoted:

- Spec, line 3: `**Version 0.2**`
- Spec §12: "This document specifies OKF version **0.2**."
- Spec §13: "v0.2 supersedes OKF v0.1 and is a minor version bump under §12,
  except for two deliberate breaking changes called out below."
- Spec self-description, lines 15–17: "This document is self-contained: it
  specifies everything needed to produce and consume OKF v0.2."
- **The spec contains no publication date.** The only dates in the file are
  example data inside YAML snippets (`2026-05-28`, `2026-06-20`, `2026-09-23`,
  etc.).
- `02-okf-v02-spec.md:33-36` claims "**Release date**: 2026-07-24". The commit
  dates confirm this: `780fe9d30b5b` (the v0.2 migration) landed
  2026-07-24T16:45:07Z and `3fcbb9f` 36 seconds later. **Verified.** The same
  note's claim that "the official Google Cloud announcement was published on
  July 24, 2026" was **not** independently verified here (the blog was not
  fetched; one third-party summary asserts 25 July 2026 instead).

The relationship the note already records in `05-google-cloud-kc.md` holds and
is confirmed: the spec is format-only and names no Google service. `okf/README.md`
states OKF is "a **universal, vendor-neutral format** … **not tied to any
particular agent, framework, model provider, or serving system**" and calls the
reference agent "a **proof of concept**". The reference agent is
`reference-agent` version `0.1.0` (`okf/pyproject.toml`) — matching
`02-okf-v02-spec.md:43`.

---

## Q2 — Normative requirements present upstream but absent from our note; and contradictions

Method: every RFC 2119 keyword occurrence in the fetched `SPEC.md` was extracted
by line number and checked against `02-okf-v02-spec.md`.

### 2a. Requirements in `SPEC.md` that our note does NOT contain

Only three, all `MAY`-level, all concerning *where* reserved/link constructs may
appear:

| # | Spec | Verbatim spec text | Status in `02-okf-v02-spec.md` |
|---|---|---|---|
| G1 | §9 (L532) | "A `log.md` file **MAY** appear at any level of the hierarchy to record the history of changes to that scope." | **Absent.** The note's §9 section (L281-300) never states that `log.md` may be nested, and its §3 directory sketch (L139-149) places `log.md` only at the bundle root, with subdirectories showing only `index.md` and `<concept>.md`. `grep -i "any level"` over the note returns 0 hits. |
| G2 | §3.1 (L136-137) | "The following filenames have defined meaning **at any level of the hierarchy** and MUST NOT be used for concept documents" | **Partially absent.** The note (L156-163) carries the `MUST NOT`, but drops the "at any level of the hierarchy" scoping clause. |
| G3 | §6.1 (L438) | "Concepts **MAY** link to other concepts using standard markdown links." | **Absent as a permission.** The note's §6 (L233-246) documents the two link *forms* and the broken-link `MUST`, but never records the base `MAY`. `grep "MAY link"` returns 0 hits. |

Two further omissions are non-normative but worth recording:

- §4.1 `resource` — spec: "A URI that uniquely identifies the underlying asset
  the concept describes. Absent for concepts that describe abstract ideas rather
  than physical resources." The note (L198) quotes **only the second sentence**,
  so the field's actual definition is missing from the note's frontmatter table.
- §8 index example — the spec's own example includes an entry linking to a bare
  directory: `* [Subdirectory](subdir/) - short description of the subdirectory`.
  The note documents only the reference implementation's `subdir/index.md` form
  (L277) and never shows the spec's form.
- §5 preamble — spec: "All are optional. **Their absence carries meaning**: an
  unverified concept is distinguishable from a verified one, but is never
  rejected (§11)." The note carries "All are optional" (L750-752) but not the
  absence-carries-meaning clause.
- §10.3 — spec: "Binding `computation` with the parameter values into the
  executable artifact is **the consumer's job**." The note (L449) records the
  agent's MUST NOT but not this role allocation.

Everything else checks out. All of the following were verified present and
accurately stated in the note: §3 distribution `MAY`; §3.1 reserved-filename
`MUST NOT`; §4.1 `type` REQUIRED, producer `SHOULD` pick descriptive values,
consumer `MUST` tolerate unknown types, consumer `MAY` derive title from
filename, producer `MAY` add keys, consumer `SHOULD` preserve unknown keys,
consumer `MUST NOT` reject unrecognized fields; §4.2 both `SHOULD`s; §5.1
`resource` REQUIRED in entry, `id` `SHOULD`, per-entry `usage_window` `MAY`,
`usage_count` read-as-liveness `SHOULD`, recursion `MAY`; §5.2 `generated.by`
REQUIRED, bare-mapping `MAY` write / `MUST` read; §5.3 `MUST NOT` reject; §6.1
broken-link `MUST`; §7 `human:` prefix producer `MUST`; §8 index `MAY` anywhere,
root `okf_version` `MAY`, description `SHOULD`, generate/synthesize `MAY`s; §9
date-heading `MUST`; §10.2 `runtime` REQUIRED-for-type, `computation` Optional;
§10.3 parameter-only `MAY`/`MUST NOT`; §11 all clauses; §12 `okf_version` `MAY`
and best-effort `SHOULD`; §13.1 both fallbacks.

The note's most valuable correct calls, re-verified against the fetched bytes:

- §10.2 marks **only** `runtime` as `REQUIRED for this type`. `parameters`,
  `executor`, and `attester` carry **no RFC 2119 keyword at all**; `computation`
  is marked `Optional`. §12 lists all five among "new optional keys". The note's
  refusal to fill those status cells (L427-437) is correct.
- §10.5 does open "This subsection is informative, not normative." Its
  "**Gate**: refuse to display a failing attestation" is therefore **not** a
  requirement. The note's warning (L451-462) is correct.
- §5.3 states the trust tiers with no RFC 2119 keyword; only §11 makes the
  derivation normative, at `SHOULD`. Correct (L352-357).

### 2b. Where the two contradict

No contradiction was found between the note and the spec on any *substantive
rule*. Four defects are attribution/actor errors, three of which are also
self-contradictions inside the note.

**X1 — Log date `MUST` is assigned to the consumer in one table and the producer
in another.**

- Spec §9 (L547): "Date headings **MUST** use ISO 8601 `YYYY-MM-DD` form."
  No actor is named.
- Note L795, under the heading "**A consumer MUST enforce** — these are the §11
  bundle-conformance tests":
  `| Log date format | Log date headings MUST use YYYY-MM-DD (§9) | Consumer |`
- Note L512, under "**Conditional producer obligations**":
  "If a `log.md` is present, its date headings MUST use `YYYY-MM-DD` (§9)."

The same rule is filed as a consumer enforcement duty and a producer obligation.
The spec supports the producer reading; §11 test 3 is about `index.md`/`log.md`
"follow[ing] the structure in §8 and §9", which is a property of the bundle, not
a duty the spec lays on consumers.

**X2 — The §3.1 reserved-filename `MUST NOT` is likewise double-filed.**

- Spec §3.1 (L136-137): reserved filenames "**MUST NOT** be used for concept
  documents" — a constraint on whoever writes the files.
- Note L794 (consumer-MUST-enforce table):
  `| Reserved filenames | index.md and log.md MUST NOT be used for concepts (§3.1) | Consumer |`
- Note L813 (producer-obligation table):
  `| Reserved filenames | Producers MUST NOT use index.md/log.md as concept documents (§3.1) | Producer |`

The note's own L816-818 rule — "§11 conformance is the three bundle tests only.
**A validator MUST NOT fail a bundle for a missing `human:` prefix**, or for any
other producer obligation in this table" — is violated by its own L794 entry.

**X3 — "A consumer MUST enforce type presence" is not in the spec.**

- Note L789-794 heading: "**A consumer MUST enforce** — these are the §11
  bundle-conformance tests", with row
  `| Type presence | Every concept MUST have a non-empty type field | Consumer |`.
- Spec §11 states the three tests as properties of a *bundle*
  ("A bundle is **conformant** with OKF v0.2 if: …"). It never directs a consumer
  to enforce them, and in the same section directs consumers to be permissive:
  "Consumers **SHOULD** treat all other constraints as soft guidance. In
  particular, consumers **MUST NOT** reject a bundle because of: …".

The note's own L504-507 says the three tests "should not be expanded to include
every normative producer or consumer obligation" and admits "The gloss is this
document's". The "A consumer MUST enforce" heading is therefore an unlabelled
`[ANALYSIS]` claim wearing a `MUST` label — exactly the failure mode the note's
own convention 5 (L24-25) forbids.

**X4 — A spec `SHOULD` is labelled "Editorial", against the note's own binding
convention.**

- Spec §8 (L524-526): "Entries **SHOULD** include the description from the linked
  concept's frontmatter."
- Note L271: "**Editorial**: Entries SHOULD include the description from the
  linked concept's frontmatter."
- Note convention 3 (L16-20), stated as binding on every future edit: "There is
  no 'normative / editorial' binary — `SHOULD` and `RECOMMENDED` are normative
  but not mandatory, and demoting them to 'editorial' reads as 'ignorable'."
- Note L833 files the identical rule correctly in the SHOULD table:
  `| Index descriptions | Entries SHOULD include descriptions from frontmatter (§8) | Producer |`.

**Not a contradiction (checked, cleared):** the note's `[ANALYSIS]`,
`[README]`, and `[REF-IMPL]`-tagged material (design principles table, the
"Relationship to Other Formats" table, strengths/limitations, ambiguity lists)
is correctly fenced and explicitly disclaimed as non-spec. Its claim that
Obsidian/Notion/MkDocs/DataHub appear nowhere in `SPEC.md` was re-verified —
correct; the only formats §1 names are Avro, Protobuf, and OpenAPI. The note's
`Stability: Pre-1.0` line (L42) is an inference — the spec uses no such word —
but it is a fair reading of the `<major>.<minor>` scheme in §12.

---

## Q3 — Does adopting the Google Cloud `SPEC.md` break issue #21's write gate?

**No. It cannot, because issue #21 already adopts exactly this document at
exactly this commit.** "Adopting the Google Cloud SPEC.md as the required
inherited spec" is a no-op relative to the current decision.

Issue #21's corrected resolution ("Baseline") states verbatim:

> `GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md` on `main` is the canonical
> specification. Suite `v0.1.0` implements OKF v0.2 as reviewed at `3fcbb9f`.

Verified 2026-08-01:

- `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` **is** the current `main` HEAD.
- `GET /compare/3fcbb9f...main` returns
  `{"status":"identical","ahead_by":0,"behind_by":0,"files":[]}`.
- `SPEC.md` fetched at `main` and at `3fcbb9f` are byte-identical
  (`md5 1ad56831bf45687ebb3a47db03f54931`, `diff` empty).

So there is no upstream drift to absorb, and no new requirement to reconcile.

**Does the spec's own text conflict with the write gate?** No, and #21 already
handled the one place it could have.

- Spec §12: "Bundles **MAY** declare the version they target with
  `okf_version: \"0.2\"` in a bundle-root `index.md` frontmatter block …
  Consumers that do not understand the declared version **SHOULD** attempt
  best-effort consumption rather than refusing the bundle."
- §11's three conformance tests do not mention `okf_version` at all.

Both sentences constrain **reading**. #21's corrected resolution scopes the gate
to **writing** only — "`okf_version` is a write gate, not a read gate" — and
states "The suite reads any bundle, always", with "An absent declaration, an
unknown declared version, a declaration that is not the string `\"0.2\"` … never
prevent a read and never withhold a conformance claim that §11 has been earned."
That is compatible with §12 and §11 as written. The earlier, superseded
resolution *did* conflict (findings F4/F5 in the review comment), and was
corrected for precisely this reason.

Two residual points, both suite policy rather than spec conflict, and both
already acknowledged in #21:

1. **Requiring exact `"0.2"` before mutating is stricter than the spec.** The
   spec places no obligation on any producer to declare `okf_version` — it is
   `MAY`. Being stricter about what the suite is willing to *write to* imposes
   nothing on third-party bundles and violates no `MUST`/`SHOULD`, because the
   spec has no producer obligations about mutation at all.
2. **Treating a numeric `0.2` as malformed is not stated by the spec.** §12's
   example writes the quoted string `okf_version: "0.2"`, which supports the
   string form, but the spec never says an unquoted YAML float is invalid. #21's
   corrected text keeps this as an explicit suite rule ("Any other value — `"0.1"`,
   an unquoted float, a future version, or no declaration at all — makes the
   bundle read-only to the suite"), which is the correct framing.

**One item to fix as a consequence of Q2**, not of adoption: #21's blocking
rule 2 enumerates four producer `MUST`s (§5.1 `sources[].resource`, §5.2
`generated.by`, §10.2 `runtime`, §7 `human:` prefix). Re-verified against the
fetched spec — all four are real and correctly quoted, and the refusal to invent
`parameters`/`executor`/`attester` requirements is correct. No change needed.
The X1/X2/X3 defects above live in `02-okf-v02-spec.md`, not in #21; #21's
"Base conformance … exactly the three tests" framing is already right.

---

## Q4 — What to pin

Pin **both** a commit and a blob, because they answer different questions.

| Kind | Value | Why |
|---|---|---|
| Commit SHA (primary) | `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` | Already the identifier of record in issue #21. Dated 2026-07-24T16:45:43Z, message "Update SPEC.md". Permalink: `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828c2f23d109c855ee403c3a4c81f3a96/okf/SPEC.md` |
| Blob SHA (content pin) | `a516d50128f5aa1f5746d1464661a39f7143e875` | Git object hash of `okf/SPEC.md` itself. Survives history rewrites and force-pushes that would strand a commit SHA, and is what a drift check should actually compare. |
| Content hash (belt-and-braces) | `md5 1ad56831bf45687ebb3a47db03f54931`, 37544 bytes | Verifiable without git, from the raw URL. |

Declared format version to record alongside it: **OKF `0.2`** (spec line 3,
`**Version 0.2**`; §12 "This document specifies OKF version **0.2**").

Recommended one-line drift check:

```sh
test "$(gh api repos/GoogleCloudPlatform/knowledge-catalog/contents/okf/SPEC.md --jq .sha)" \
  = a516d50128f5aa1f5746d1464661a39f7143e875
```

---

## Summary of what was verified vs. inferred

**Verified directly on 2026-08-01** (raw fetch, GitHub API, DNS/HTTP probe):
the full text of `okf/SPEC.md`; that `main` HEAD equals `3fcbb9f` and the file is
byte-identical at both refs; the blob SHA, size, and md5; the complete
three-commit history of the file; repo metadata (owner, description, homepage,
license, created date, not-a-fork); `okf/` and repo top-level contents;
`okf/README.md` vendor-neutrality wording; `okf/LICENSE.md` is Apache 2.0;
`reference-agent` version `0.1.0` in `okf/pyproject.toml`; zero occurrences of
`openknowledgeformat` anywhere in the repo; that
`www.openknowledgeformat.org` serves a Namecheap parked page and the apex times
out; every RFC 2119 keyword occurrence in the spec and its presence or absence in
`02-okf-v02-spec.md`; the full text of issue #21 including the superseded
resolution, the blocking review, and the corrected resolution.

**Inferred, not verified:** that Google Cloud is the publisher (from the
`GoogleCloudPlatform` org and the repo homepage — the spec document itself names
no author or organization); the 2026-07-24 Google Cloud blog announcement date
asserted in `02-okf-v02-spec.md:39-40` (the blog was not fetched; a third-party
summary asserts 25 July 2026 instead — treat the note's announcement date as
unconfirmed); the note's `Stability: Pre-1.0` characterization (a reasonable
reading of §12's `<major>.<minor>` scheme, but the spec never says "pre-1.0").

**Nothing outside this file was modified.** No GitHub issue was touched, and
nothing was committed.
