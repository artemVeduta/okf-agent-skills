---
status: draft
type: Glossary
---
# Identifiers and Labels Glossary

**Concept ID**:
The bundle-relative file path of a concept without its `.md` extension. A
fully qualified concept key is bundle identity plus Concept ID; moving or
renaming a concept changes its identity.
_Avoid_: Concept identity, UUID, fully qualified concept key

**Workspace link scheme (`okf-workspace://`)**:
The `okf-workspace://<bundle-alias>/<concept-id>` URI form required for every
authored cross-bundle link. The active workspace manifest is its only
resolver, and one alias never resolves to more than one target.
_Avoid_: Workspace manifest, inbound link, federation

**Result labels**:
The fixed, closed set of navigation result values: `ok`, `degraded`,
`not-configured`, `unavailable`. A navigation result uses only these labels.
_Avoid_: Lifecycle result, orientation result, match labels

**Match labels**:
The fixed, closed set of navigation match values: `found` and `no match in
searched scope`. A complete no-match claim is limited to its declared scope
and search channel.
_Avoid_: Result labels, finding labels, link resolution

**Finding labels**:
The fixed, closed set of navigation finding values: `missing`, `unreadable`,
`unobservable`, `invalid`. `invalid` is reserved for a verified native-tool
or safety-contract violation.
_Avoid_: Result labels, parse finding, write-authority finding

**Coverage labels**:
The fixed navigation coverage vocabulary: complete for a named scope and
channel, or `non-exhaustive`. Completeness is never claimed beyond the named
scope and channel.
_Avoid_: Support ceiling, match labels

**Verified EOF**:
The evidence a complete-concept claim requires: confirmation that a body was
read to its actual end of file. Without it, the result carries the
`unobservable` finding and is `degraded`; the observable criterion for
verifying it with native tools is an open item.
_Avoid_: Complete read, parse finding

**Parse finding**:
The finding returned when readable bytes carry malformed frontmatter. It
blocks status inference and never triggers repair during a read.
_Avoid_: Finding labels, invalid finding, validation verdict
