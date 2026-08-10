---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/109
status: draft
type: Decision
---
# Define the exact .okf-workspace.json grammar and path-base rules

Status: This decision is closed.

## Question

What exact JSON grammar shall `.okf-workspace.json` accept, including required and optional fields, types, ordering, uniqueness, and rejection rules? What is the base directory for each relative path field, including `repositories[].path` and `bundles[].root`?

## Comment by artemVeduta

## Resolution

`.okf-workspace.json` uses one strict, exact-key JSON grammar. Structural validation and runtime admission are separate stages.

### JSON and root object

- Input is UTF-8 JSON without a BOM. Duplicate object member names, comments, trailing commas, and trailing data are invalid.
- The root object has exactly four required members: `schema_version`, `workspace_id`, `repositories`, and `bundles`. Unknown members are invalid at every level. Object member order has no meaning.
- `schema_version` is a JSON number whose parsed value is `1`.
- `workspace_id` is a canonical lower-case UUIDv4. The reader does not generate or repair it.
- `repositories` is an array and may be empty. Its order has no semantic meaning.
- `bundles` is a non-empty array. Its order sets federated read precedence.

### Repository record

A repository record requires `name` and `path`, and exactly one of `remote` or `local`. `revision` is optional. `aliases` is optional and is valid only with `remote`. `local`, when present, is the literal `true`.

- `name` matches `[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?`.
- `path` follows the relative-path grammar below.
- `remote` and each `aliases` item store a canonical repository-lineage identity in `host/path` form, not a fetch URL.
- A canonical remote host is a lower-case ASCII DNS host or IPv4 address, with an optional canonical decimal port. The repository path has one or more non-empty `/`-separated segments. Each segment uses ASCII letters, digits, `.`, `_`, `~`, or `-`, and cannot be `.` or `..`. Path case is preserved. Schemes, credentials, IPv6 literals, escapes, queries, fragments, trailing slashes, and terminal `.git` are invalid.
- If `aliases` is present, it is a non-empty array of unique canonical identities. Alias order has no meaning. An alias cannot equal its record `remote`.
- `revision`, when present, is a full lower-case Git object ID: 40 hexadecimal characters for SHA-1 or 64 for SHA-256. Branch names, tag names, abbreviations, and revision expressions are invalid. This rule defines syntax only; admission enforcement is a separate decision.

### Bundle record

A bundle record requires exactly `alias`, `owner`, `root`, `required`, and `mode`.

- `alias` uses the same grammar and byte-for-byte comparison as repository `name`. This makes it safe as one `okf-workspace://` authority segment.
- `owner` is `null` or an exact declared repository `name`.
- `root` follows the relative-path grammar below.
- `required` is a JSON boolean.
- `mode` is exactly `source`, `generated`, or `vendored`.

All strings are non-empty and have no leading or trailing whitespace.

### Relative paths and bases

Paths use `/`. `.` is valid only as the complete path. Empty paths, absolute paths, `..`, inner `.` segments, backslashes, repeated separators, trailing separators, NUL, and control characters are invalid. Dot-prefixed names remain valid. Lexical path comparison is byte-for-byte and preserves case.

- `repositories[].path` is relative to the directory that contains the active manifest.
- A repository-owned `bundles[].root` is relative to the resolved owner repository root.
- A `bundles[].root` with `owner: null` is relative to the directory that contains the active manifest.
- Realpath containment is checked each time a path is used.

### Uniqueness

- Repository names and lexical repository paths are unique.
- Each repository `remote` plus `aliases` forms one identity set. Values are unique within the set. Identity sets from different repository records cannot intersect.
- Bundle aliases are unique.
- An exact duplicate `owner` plus `root` pair is invalid.
- If different valid declarations resolve to one canonical bundle identity, the runtime loads that identity once. Different repository declarations that resolve to one Git root produce an identity mismatch.

### Rejection and admission

Structural validation rejects the complete federation. It does not repair the file or load a valid subset. Current-repository local operation remains available. Validation returns the first manifest-level `INVALID` finding in this fixed order: JSON text, root object, root fields, repositories in array order, cross-repository uniqueness, bundles in array order, and cross-bundle uniqueness. Existing stable field-level reasons remain; implementation adds only reasons needed for duplicate JSON members and the new canonical-value checks.

Filesystem and Git checks occur during admission, not structural validation. A missing repository, non-repository path, missing bundle, remote mismatch, revision mismatch, owner mismatch, or access failure makes only that candidate inactive under the existing admission findings. An active repository path must be its exact Git root. An active bundle owner must match the deepest Git root that contains the bundle. `owner: null` can be active only when the bundle is outside every Git repository. A nested repository or submodule therefore needs its own repository record.

This decision closes the exact manifest grammar, alias grammar needed by that manifest, and all manifest-relative path-base rules. It does not decide workspace-ID lifecycle or revision enforcement beyond accepted syntax.
