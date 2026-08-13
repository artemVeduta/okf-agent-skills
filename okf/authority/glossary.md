---
status: draft
type: Glossary
---
# Write Authority Glossary

**WRITE_AUTHORITY**:
The distinct bundle-admission gate a foreign write must pass after `REACH ->
PRESENCE -> {TRUST, ACCESS}`, testing whether the target holds foreign-write
authority for the exact source instance, target instance, target bundle, and
effects. A refusal at this gate is reported as a write-authority finding,
never as `INVALID` or `ACCESS_DENIED`.
_Avoid_: Foreign-write authority, TRUST gate, ACCESS gate

**WRITE_NOT_AUTHORIZED**:
An example write-authority finding code for a refused `WRITE_AUTHORITY` gate.
The specification gives it only as an example; the final finding-code
vocabulary for a refused foreign write is an open item.
_Avoid_: The settled write-authority finding code, `ACCESS_DENIED`, `INVALID`

**Authority generation**:
The generation counter that foreign-write authority carries at the target,
incremented so a stale grant cannot be replayed after reissue or revocation.
_Avoid_: Grant generation, bundle epoch, ledger generation

**Grant generation**:
The value of the authority generation that a cross-repository approval record
captures at approval time, so a later change to the underlying foreign-write
authority can be detected as drift.
_Avoid_: Authority generation, ledger generation, policy hash

**Target project-mode configuration**:
The requirement that a cross-repository write read its project mode from the
target repository's own configuration rather than from the source side. A
missing or unknown target project mode blocks mutation.
_Avoid_: Project mode, source-side configuration

**Target native adapter**:
The harness adapter installed in the target repository of a cross-repository
operation. It can be absent; only the invoking source-side adapter and a
compatible shared runtime must be present.
_Avoid_: Harness adapter, invoking harness adapter

**Allowed effects**:
The explicit, closed set of effects that a delegation brief or a
foreign-write authority grant authorizes for one operation. It never widens
by itself and is stated alongside, and is distinct from, forbidden effects.
_Avoid_: Tool allowlist, granted permission, effect-matrix outcome

**Target collision**:
The case in which a migration or cross-repository move names a destination
path that an existing concept already occupies. It blocks rather than
triggering an implicit merge.
_Avoid_: Merge conflict, overwrite

**Transformed output**:
Content produced by converting source material into OKF form for migration
or a cross-repository move. It starts as `draft` and unverified, carries only
the provenance its own body supports, and is written to a separate staging
area before acceptance.
_Avoid_: Migration residue, final concept content

**Bootstrap exception**:
The one condition under which a write that creates a bundle root is permitted
without a pre-existing manifest bundle record declaring `okf_version: "0.2"`.
It covers an explicit `okf-setup` `init` alone, inside an existing Git
repository: an automatic request stays silent, an invalid manifest still
blocks, and `init` writes only the navigation-only bundle-root `index.md`. A
separate explicit `repair` writes the manifest, which normally precedes
`init` in the documented setup order.
_Avoid_: Write gate, adoption operation
