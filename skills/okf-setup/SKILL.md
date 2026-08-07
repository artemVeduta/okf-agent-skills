---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, including a monorepo's package-per-bundle layout, discovering and classifying candidate source documents, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns eight operations. `init` writes the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle; it is the one exception to the rule that a mutation needs an already-conforming root — it is what makes the root conform in the first place. `inspect` reports the current state of the three config files `/setup` cares about, and `repair` performs an already-approved fix to the two of those files that are plain filesystem actions rather than OKF writes. `plan` and `aggregate` are the monorepo pair (#135): `plan` detects deterministic package boundaries and builds the immutable brief each package sub-agent receives, and `aggregate` collects the per-package results a coordinator's sub-agents returned into one honest summary and the shared root workspace manifest that federates their bundles. `discover` (#142) scans the active project and classifies every candidate source document it finds — `markdown` (a direct parse target: UTF-8 text with compatible optional frontmatter), `unsupported` (a recognised format the migration will not interpret: HTML, PDF, Word, MediaWiki, or Obsidian wikilinks/callouts/Dataview), `other` (not a candidate document format), or `ambiguous` (the evidence on hand does not settle it, carrying a question for the user rather than a guess) — so the migration's compact question round is built from an honest inventory instead of file-by-file guessing. `migration-plan` (#144, #145) turns that inventory into a fully-determined migration plan: every source gets an intentional disposition — `migrate`, `skip`, `residue`, or `blocked_pending_decision` — a `migrate` source gets a type (preserved, deterministically mapped, or approved) and the concept path that type's own canonical directory implies, and a source lands on `blocked_pending_decision` only when its disposition genuinely cannot be inferred, each carrying the one question that would resolve it; feeding the same call `payload.answers` resolves those questions into a plan `data.plan.executable: true`, structurally never before every question is answered. It also carries each `migrate` source's own explicit provenance and link-rewritten body, and the deterministic evidence-retention path for each `residue` source. `report` (#136) turns the migration's own signals — what was migrated, skipped, left ambiguous, or retained as residue, plus link and provenance facts and whether a human reviewed semantic fidelity — into the structured statistics and thresholds behind the post-setup analytics report; it never reads the bundle itself and never writes anything, and rendering its structured data as the Markdown report the user sees is this file's procedure, not the runtime's. None of the eight accepts a delegation brief, and none runs automatically; every one is a direct, explicit invocation, and no other skill reaches any of them on a caller's behalf.

## Wrapper requests

`okf-setup` sends every request to `node <skill-root>/scripts/okf-setup.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

### `init`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "init",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">",
    "project_mode": "<optional \"code-backed\" or \"knowledge-only\">"
  }
}
```

`payload.cwd` is the only required field. `payload.bundle`, when omitted, defaults to `okf`. `payload.project_mode`, when supplied, must be exactly `code-backed` or `knowledge-only`; any other value returns `UNSUPPORTED_INPUT`. Omitting it writes `okf_version` alone, and a later `init` call may add `project_mode` by naming it — the second call merges the new key into the already-valid root rather than refusing it.

### `inspect`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "inspect",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">"
  }
}
```

`inspect` is read-only: it never writes anything, and it reports on the three config files `/setup` bootstraps regardless of their current state, including a state it cannot yet act on. It answers with `result: "ok"` and one entry per file under `data`:

- `data.index_md` — `{ "state": "ok" }`, `{ "state": "missing" }`, or `{ "state": "invalid", "reason": "<string>" }`, computed with the same parser `init` writes against, so the two never disagree on what counts as valid.
- `data.activation` — the same three states for `.okf-active`; an `invalid` reason is `not_zero_byte_regular_file`.
- `data.manifest` — the same three states for `.okf-workspace.json`, checked against the exact validator `scripts/lib/manifest.js` already enforces elsewhere. An `invalid` result also carries `salvage`, which is `{ "workspace_id": "<uuid>" }` when the broken file's own `workspace_id` is at least a well-formed UUIDv4, or `null` when there is nothing worth keeping. Every manifest result, including `ok`, carries `monorepo: true|false` — a hint, computed from `.gitmodules` at the Git root or from a manifest that already declares more than one repository or bundle, never a decision.

`cwd` outside any Git repository answers `not-configured`, the same result every other operation gives with nothing to act on.

### `repair`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "repair",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "targets": ["activation", "manifest"],
    "bundle": "<optional bundle directory name, defaults to \"okf\", used for the manifest template>",
    "manifest": "<optional hand-authored manifest object, for a monorepo>",
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>"
  }
}
```

`payload.targets` is required: a non-empty array naming which of `activation` and `manifest` to repair, with no duplicates and no other values — anything else returns `UNSUPPORTED_INPUT` before either file is touched. `repair` never touches `index.md`; that repair is `init`'s, reached through its own wrapper call. Per file:

- `activation` writes a zero-byte `.okf-active` at the Git root, unless it is already the valid zero-byte regular file `inspect` would report as `ok`, in which case nothing is written.
- `manifest` writes `.okf-workspace.json` at the Git root, unless it is already the valid file `inspect` would report as `ok`, in which case nothing is written and `payload.manifest` or `payload.workspace_id`, if supplied, are ignored. Otherwise, when `payload.manifest` is supplied, it is written only after it passes the same validator `inspect` checks against — a failure returns `UNSUPPORTED_INPUT` and writes nothing. When `payload.manifest` is omitted, `repair` generates the single-bundle template named by the resolution this operation implements: `name` the basename of the Git root, `root` the bundle directory from `payload.bundle` (or `okf`), `mode: "source"`, and `workspace_id` either `payload.workspace_id` (when the caller is keeping a salvaged value) or a fresh UUIDv4.

The response names `applied` when at least one target was actually written, `no-op` when every named target was already `ok`, or `blocked` with `data.code` when the request itself is unsupported. `data.activation` and `data.manifest`, one per named target, each carry `written: true|false`; a written manifest also echoes the `workspace_id` it used.

### `plan`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "plan",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name each package will carry, defaults to \"okf\">",
    "project_mode": "<optional \"code-backed\" or \"knowledge-only\", carried into every brief>",
    "mappings": "<optional array of already-approved source-to-concept mappings, carried into every brief>"
  }
}
```

`plan` is read-only: it never writes anything. It reads the same deterministic evidence `inspect`'s `monorepo` hint gestures at, but goes further — an actual package-boundary rule read from `.gitmodules`, a root `package.json`'s `workspaces` field, a root `pnpm-workspace.yaml`, a root `Cargo.toml`'s `[workspace]` table, or a root `go.work`, in that combined, order-independent set. It answers with `result: "ok"` and:

- `data.monorepo: false` when no signal is present, or exactly one package is found — a single package is not a monorepo, and `data.packages`/`data.briefs` are both empty.
- `data.monorepo: true, data.ambiguous: true` when a signal is present but cannot be resolved deterministically — an unsupported glob, unparseable configuration, or two signals that disagree about the same path. `data.reason` names what could not be resolved and `data.question` is the question to put to the user; `data.packages` and `data.briefs` stay empty. This is never guessed past — no partial or best-effort package list is returned.
- `data.monorepo: true, data.ambiguous: false` when every present signal resolves to the same package list. `data.packages` is one entry per package (`package`, `path`, `separate_repo`), and `data.briefs` is the exact immutable brief each package's sub-agent receives: `package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, and `okf_version`. For a package with its own Git repository (a submodule), `cwd` is that repository's own root and `bundle` is just the bundle directory name; for a package sharing the workspace repository, `cwd` is the workspace root and `bundle` is the package-relative bundle path — either way, the pair is exactly what the worker's own `init` or `okf-write` calls need.

`data.signals` always lists which of the five sources were present, whether or not they resolved. `cwd` outside any Git repository answers `not-configured`, the same result every other operation gives with nothing to act on.

### `aggregate`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "aggregate",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name used for the manifest, defaults to \"okf\", must match the plan call>",
    "results": [
      { "package": "<package alias from plan's data.packages>", "status": "ok" },
      { "package": "<another package alias>", "status": "failed", "reason": "<why that worker did not finish>" }
    ],
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>"
  }
}
```

`aggregate` is read-only: it never writes the manifest itself. `payload.results` must name every package the same deterministic detection `plan` used still reports, exactly once each, and no other package — a result naming an unknown package, a missing package, or a duplicate is `UNSUPPORTED_INPUT` before anything is computed, so a failed package can never be silently dropped from the report. Each result is `{"status": "ok"}` or `{"status": "failed", "reason": "<string>"}` (a `reason` on an `"ok"` result, or a missing one on a `"failed"` result, is also `UNSUPPORTED_INPUT`), plus an optional `warnings` array of strings either way.

The response is `result: "ok"` with:

- `data.status` — `"complete"` only when every named package succeeded, `"partial"` when at least one failed. This operation never reports `"complete"` while a package failed.
- `data.packages` — one entry per package, each carrying its `status`, `reason` (`null` for a succeeded package), and `warnings`.
- `data.failed` — the alias of every failed package, named plainly rather than left for the caller to recompute.
- `data.manifest` — the shared root workspace manifest that federates every package's bundle: one repository entry for the workspace root, plus one more per package with its own Git repository (a submodule); one bundle entry per package, each `required: true` and `mode: "source"`, owned by its own repository (submodule) or by the workspace root at its package-relative path. Every detected package gets a bundle entry regardless of whether its worker succeeded — a package whose worker failed simply has no bundle on disk yet, which is exactly the existing `required` but not `active` case the workspace-federation health check already reports as `degraded`, not silently dropped. This manifest is not written by `aggregate`: pass it as `repair`'s `payload.manifest` to actually persist it, the one place, after every worker has finished, that the shared manifest is ever written.

### `discover`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "discover",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name to exclude from the scan, defaults to \"okf\">"
  }
}
```

`discover` is read-only: it never writes anything. Unlike `inspect`/`repair`/`plan`/`aggregate`/`report`, it does not bypass the activation-marker gate — it scans an already-active bundle's project, so it needs the bundle root to exist to know what to exclude from its own scan, and it only makes sense once `init`/`repair` have already run. `cwd` outside any Git repository, or an inactive or invalid `.okf-active`, answers the same as every other operation on an inactive bundle: `not-configured` or `blocked` with `ACTIVATION_MARKER_INVALID`, nothing scanned.

The scan root is the active repository (the Git root of `payload.cwd`), not `payload.cwd` itself — discovery covers the whole project, not an arbitrary subdirectory a caller happens to pass. Three, and only three, subtrees are excluded from the walk, named here as a discovery-scope choice and not a REACH exclusion rule (`scripts/lib/reach.js` ships no configurable directory-exclusion list, and this is not one): `.git`, `node_modules`, and the bundle directory itself (`payload.bundle`, or `okf`) — a bundle must not be re-discovered as a candidate source for its own migration. Every other file in the project, at any depth, is scanned and classified.

The response is `result: "ok"` with:

- `data.sources` — one entry per discovered file, `{ "path", "category", "format", "reason" }`, plus `"question"` when `category` is `"ambiguous"`. `path` is project-relative with `/` separators. `category` is exactly one of:
  - `"markdown"` — a `.md`/`.markdown` file that decodes as valid UTF-8, carries no Obsidian or MediaWiki construct, and, when it has a frontmatter block, one the shared frontmatter/YAML reader (the same one the write gate uses) accepts. `format` is `"markdown"`; `reason` is `"utf8_markdown"` or `"utf8_markdown_with_frontmatter"`.
  - `"unsupported"` — a recognised format the migration will not interpret, confirmed by content evidence, not extension alone: `format` is `"html"` (a `.html`/`.htm` file whose content actually carries an HTML doctype or root tag), `"pdf"` (a `.pdf` file whose content opens with the PDF magic bytes), `"word"` (a `.doc`/`.docx` file whose content carries the OLE or ZIP container signature), `"mediawiki"` (a `.md`/`.markdown` file carrying MediaWiki markup — bold/heading/`<ref>`/category-link syntax), or `"obsidian"` (a `.md`/`.markdown` file carrying an Obsidian wikilink, callout, or Dataview construct).
  - `"other"` — any file that is none of the above; `format` is its lowercase extension without the dot, or `"no_extension"`. Not a candidate document, but never silently dropped from the inventory.
  - `"ambiguous"` — the evidence available does not settle the file's classification: a `.md`/`.markdown` file that is not valid UTF-8 (`reason: "not_utf8"`), one whose frontmatter block is present but unparseable (`reason: "incompatible_frontmatter:<parser reason>"`), or a file whose extension names a format (`html`/`pdf`/`word`) its content signature does not confirm (`reason: "extension_signature_mismatch:<format>"`). Each carries `question`, the thing to ask the user — this classifier never guesses past it.
- `data.complete` — `services.listFiles()`'s own field, unchanged: `true` when the walk covered everything in scope, `false` when a symlink or an unreadable directory made it partial. `false` degrades the inventory honestly rather than silently: `findings` then carries one `unreadable` finding (`severity: "error"`, non-blocking — the same code and shape `okf-read`'s degraded navigation already uses for a partial admission) naming the gap, and `data.sources` is exactly what the partial walk actually found, no more.

### `migration-plan`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "migration-plan",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">",
    "sources": [
      { "path": "docs/decisions/use-postgres.md", "category": "markdown", "format": "markdown", "reason": "utf8_markdown_with_frontmatter" },
      { "path": "data/config.json", "category": "other", "format": "json", "reason": "not_a_candidate_document_format" }
    ],
    "answers": "<optional, {\"<source path>\": \"<answer>\"} for each question data.questions still names, once the user has decided>"
  }
}
```

`migration-plan` is read-only: it never writes anything. `payload.sources` is required and is exactly `discover`'s own `data.sources` array, unmodified — this operation never re-walks or re-classifies the filesystem itself, it only turns that inventory into a plan. It derives, for every source, exactly one of four intentional dispositions, never splitting or exploding one source into more than one concept (#131's "one selected source produces one output concept"):

- `migrate` — `.type` is set, either preserved or mapped, and `data.plan.entries[].concept` is that type's own bundle-relative concept path (#145): a type with a canonical directory in the OKF data model (#130) — `decisions/`, `constraints/`, `research/`, `playbooks/`, `releases/`, or `references/` — places the source's own basename, extension stripped, in that directory; `Glossary` keeps the source's own directory and renames the file to `glossary`; any other type (`Attested Computation`, a preserved domain-specific type) keeps the source path itself, extension stripped, since #130 names no canonical directory for it and none is invented. `reason: "type_preserved"` when the source's own frontmatter already named a non-empty `type` (read through the same frontmatter/YAML reader `discover` and the write gate both use, and preserved verbatim — never re-guessed); `reason: "type_inferred"` when no explicit `type` was named but a deterministic rule placed it anyway (below); `reason: "type_approved"` when `payload.answers` supplied the type instead.
- `skip` — `reason: "not_a_candidate_document_format"` for a `discover`-category `other` source (never a candidate concept at all), or `reason: "target_collision"` once a target-collision question has been answered (`"skip"` is the only legal answer that question has).
- `residue` — `reason: "unsupported_format"` for a `discover`-category `unsupported` source (a recognised format this migration will never interpret is retained as inert evidence rather than silently dropped from the bundle's graph or left out of the report entirely), or the original `discover`-category `ambiguous` reason once a `discovery_ambiguous` question was answered `"residue"`.
- `blocked_pending_decision` — the disposition genuinely cannot be inferred yet. `reason` is `"type_not_inferable"` (a `markdown` source naming no explicit `type` and matching no deterministic rule below), `"target_collision"` (a `markdown` source whose candidate target file already exists in the bundle), or the original `discover`-category `ambiguous` reason (`"not_utf8"`, `"incompatible_frontmatter:<reason>"`, or `"extension_signature_mismatch:<format>"`) — carried over unanswered.

Every entry always carries a non-empty `reason`, whatever its disposition — nothing here is left implicit. `data.plan.executable` is `true` only when no entry is `blocked_pending_decision`; a plan with even one open question is structurally not executable, so an executor cannot run a half-decided plan by accident. `data.questions` lists exactly the still-open questions, one per `blocked_pending_decision` entry (never more than one question per source — the one compact batched round, not a file-by-file interruption): `{ "id", "path", "kind", "prompt", "options" }`, where `id` equals `path` (one open question per source), `kind` is `"type"`, `"target_collision"`, or `"discovery_ambiguous"`, and `options` is the closed set of legal answers for that kind (`["skip"]` for `target_collision`, `["skip", "residue"]` for `discovery_ambiguous`) or `null` for `"type"`, which instead accepts any non-empty string — OKF's own type taxonomy is deliberately open (#130), so this operation never rejects a legitimate domain-specific type.

**The deterministic `type` table (#145).** A source naming no explicit `type` is placed by evidence only — a conventional directory name, a conventional filename, or a structural template match — never by a judgement about what its prose means; a source matching none of these asks the `"type"` question above rather than falling back to a generic `Note`. Core mappings: a directory segment named `adr` or `decisions`, a filename matching `ADR-<number>-*`, or all four of the headings `Status`/`Context`/`Decision`/`Consequences` (Michael Nygard's own ADR template) → `Decision`; a directory segment named `glossary`, a filename of exactly `glossary.md` or `CONTEXT.md` (the domain-modeling convention), or two or more `**Term**: definition` lines → `Glossary`; a directory segment named `constraints` → `Constraint`; a directory segment named `research` → `Research`; a directory segment named `playbooks` or `runbooks` → `Playbook`; a directory segment named `releases`, or a filename matching `v<major>.<minor>.<patch>.md` → `Release`; a directory segment named `references` → `Reference`; an explicit `runtime` frontmatter field with no explicit `type` → `Attested Computation`.

`data.mapping` — one entry per `migrate` disposition, `{ "path", "concept", "type", "sources", "body" }`: `sources` is exactly what the source's own frontmatter already declared under `sources`, unmodified, or `null` when it declared none — never a default, never a repaired shape, never fabricated (#131's single most important rule in this operation). `body` is the source's own body with its parsed standard Markdown inline links rewritten wherever the mapping is unambiguous: a link whose target resolves, relative to the source's own directory, to another source this same call is migrating is rewritten to that source's new concept path; an external URL, an anchor, a target outside this migration, or anything inside fenced or inline code is left exactly as written. Reference-style link *definitions* (`[label]: target`) are out of scope — neither shared link helper this operation reuses parses that syntax — so a document using it simply keeps those links unrewritten rather than guessed at.

`data.references` — one entry per `residue` disposition, `{ "path", "reference_path" }`: the deterministic `references/<path>` location retained raw evidence would occupy, preserving the source's whole original relative path and extension so two files sharing a basename in different directories never collide the way a flattened concept path would. Deriving this path is not itself a copy — nothing under `references/` is written by this operation.

`data.plan.duplicates` — zero or more `{ "paths": [...] }` groups: two or more `migrate`-disposition sources whose content is byte-for-byte identical are surfaced here as a non-blocking `plan_duplicate_candidate` finding, one group per set of identical sources sorted by path. Surfacing is as far as this operation goes — each source in the group still gets its own distinct concept and keeps its own `migrate` disposition; nothing here is silently merged, renamed, or deduplicated (#131/#22's identity rules), and a duplicate group never affects `data.plan.executable`.

`payload.answers`, when supplied, is a plain object keyed by source path. Every key must still name a question this same `payload.sources` produces and every value must be one of that question's own closed `options` (or, for `"type"`, a non-empty string) — an answer naming a question that is not open, or a value outside the question's own options, is `UNSUPPORTED_INPUT` before anything is computed, never guessed past or silently ignored. Answering only some of the open questions resolves exactly those and leaves the rest open; there is no requirement to answer everything in one call, only no ability to treat the plan as executable until every question is. This operation is a pure function of `payload.sources` and `payload.answers` — nothing is stored between calls — so calling it again with the same two inputs always reproduces the same plan, `data.mapping`, `data.references`, and `data.plan.duplicates` (#131's idempotency without resumability).

Like `discover`, `migration-plan` does not bypass the activation-marker gate: it needs the bundle root to already exist to check a candidate target path for a collision. `cwd` outside any Git repository, or an inactive or invalid `.okf-active`, answers the same as `discover` does on an inactive bundle: `not-configured` or `blocked` with `ACTIVATION_MARKER_INVALID`, nothing derived.

### `report`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "report",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "sources": [
      { "path": "docs/decisions/use-postgres.md", "disposition": "migrated", "concept": "decisions/use-postgres.md", "sources_declared": true },
      { "path": "docs/api-reference.md", "disposition": "skipped", "reason": "code_recoverable" }
    ],
    "links": [
      { "from": "decisions/use-postgres.md", "target": "glossary.md", "resolved": true }
    ],
    "semantic_review": { "performed": false }
  }
}
```

`report` is read-only: it never reads the bundle and never writes anything, in either directory or file form. It is pure classification over the migration's own signals, the same grain as `plan`/`aggregate`: the caller — the `/setup` procedure itself, once its own migration work or every dispatched package sub-agent has finished — supplies what happened, and `report` only totals and classifies it. Exactly one of two payload shapes is accepted; naming both, or naming neither, is `UNSUPPORTED_INPUT` before anything is computed.

**Single-project mode** — `payload.sources` (required, an array; open points 2 and 3):

- Each entry names `path` (the source document) and `disposition`, one of `migrated`, `skipped`, `ambiguous`, or `residue`.
- `migrated` requires `concept` (the concept path it became) and forbids `reason`; an optional `sources_declared: true|false` records whether the produced concept carries structured `sources` frontmatter, the provenance-coverage signal.
- `skipped`, `ambiguous`, and `residue` each require a non-empty `reason` and forbid `concept`/`sources_declared`. `skipped` names an intentional, safe disposition (for example #131's code-recoverable filtering); `ambiguous` names a source whose disposition is still an open question; `residue` names inert, retained-as-evidence material.
- `payload.links`, when supplied, is an array of `{ "from": "<concept>", "target": "<concept-or-path>", "resolved": true|false }` — link integrity (open point 3). Omitted, it defaults to empty.
- `payload.semantic_review` is required: `{ "performed": true|false }`. `false` (or omitted entirely) is not an error — it is the honest default — but it always surfaces the semantic-fidelity-not-assessed disclosure; only an explicit `true` claims a human reviewed the ambiguities, residue, and representative conversions.

**Multi-package mode** — `payload.packages` (required instead of `sources`, a non-empty array composed from `aggregate`'s own per-package results): each entry names `package` and `status` (`"ok"` or `"failed"`, `aggregate`'s own vocabulary), exactly as `aggregate` named it. A `"failed"` entry carries only `reason` and, optionally, `warnings` — a failed worker produced no signals, so `sources`/`links`/`semantic_review` on it are `UNSUPPORTED_INPUT`. An `"ok"` entry carries the same `sources`/`links`/`semantic_review` fields single-project mode does, plus optional `warnings`, and forbids `reason`. A duplicate `package` name is `UNSUPPORTED_INPUT`.

The response is `result: "ok"` with (open points 2, 3, 4, and 6):

- `data.status` — `"complete"` only when every source has a resolved disposition (no `ambiguous` entries) and, in multi-package mode, every package's worker succeeded; `"partial"` otherwise. This is the one warning/error threshold with a boundary: the moment any `ambiguous` source exists, anywhere, the run is `"partial"` — the same "unresolved work is never silently complete" rule `aggregate` already applies to a failed package.
- `data.summary` — `sources_total`, `concepts_created`, `sources_skipped`, `sources_ambiguous`, `sources_residue` (open point 4).
- `data.concepts` — one entry per migrated source: `source`, `concept`, `sources_declared` (open point 3, source-to-concept mapping).
- `data.skipped`, `data.ambiguous`, `data.residue` — one entry per source in that disposition, each `{ "source": "...", "reason": "..." }`.
- `data.provenance` — `{ "total", "with_sources", "without_sources" }` across migrated concepts.
- `data.links` — `{ "total", "resolved", "broken", "broken_detail": [{ "from", "target" }] }`.
- `data.semantic_fidelity` — `{ "assessed": true|false }`, `true` only when `semantic_review.performed` was `true`; a structural report — however green — never sets this to `true` on its own (#131: semantic fidelity must never be claimed by a structural check).
- In multi-package mode, `data.summary`/`data.provenance`/`data.links`/`data.semantic_fidelity` are the sum (and, for semantic fidelity, the logical AND) across every succeeded package, and `data.packages` carries one entry per package: a failed one repeats `aggregate`'s own `{ "package", "status", "reason", "warnings" }`, a succeeded one adds every single-project field above plus `migration_status` (`"complete"`/`"partial"` for that package alone, distinct from its worker `status`).

`report`'s `findings` name the same signals structurally: a `source_skipped` or `link_broken` finding is `severity: "warning"`; a `source_ambiguous` finding is `severity: "error"`; a `semantic_fidelity_not_assessed` finding is `severity: "warning"`. None of them ever `blocks` — `report` only classifies what already happened, it never gates a write.

`report`'s output location (open point 5) is deliberately nowhere on disk: it returns structured JSON on stdout, like every other wrapper response, and nothing else. It does not write into the bundle — a report living inside the bundle would itself have to conform to the OKF model, a cost this operation does not pay — and it does not write a separate file. Rendering the response as the Markdown report a user reads, and deciding whether that Markdown goes to the chat transcript or somewhere the user names, is this file's procedure (step 13), not the runtime's (open point 1: the runtime emits the structured signal set, this file specifies the prose).

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, and the activation-marker gate. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

`inspect` and `repair` run no REACH/TRUST/ACCESS admission and cite no evidence at all: `.okf-active` and `.okf-workspace.json` are plain filesystem actions, not OKF operations through the write gate, so neither carries the `effects` vocabulary bounded writes use. Both run even when the activation marker itself is absent or invalid — that is one of the things `inspect` reports and `repair` fixes — so neither is gated behind the marker the way every mutating operation on an active bundle is. The only preconditions are a Git repository (otherwise `not-configured`, same as every other operation) and, for `repair`, a writable Git root (otherwise a blocked result carrying a `PARENT_DIRECTORY_NOT_WRITABLE` finding).

`plan`, `aggregate`, and `report` run no admission and no write gate at all — like `inspect`, they only read and compute, never write, and all three run whether or not a bundle root, an activation marker, or a manifest yet exist. The only precondition any of them has is a Git repository (otherwise `not-configured`); `aggregate` additionally requires that `plan`'s own deterministic detection still resolves to the same unambiguous package list `payload.results` names, so nothing about the workspace shape changed out from under it between the two calls. `report` carries no such requirement — it never reads the bundle or the workspace shape, only the signals its own payload names, so it never needs to agree with `plan`'s live detection.

`discover` also runs no REACH/TRUST/ACCESS admission and cites no evidence — it only reads and classifies, never writes — but, unlike the four operations above, it does not run before or independently of the activation marker: it shares the ordinary activation gate every read/write operation on an active bundle shares, because it needs the bundle root itself to exist so it can exclude it from the scan. A Git repository with no activation marker yet answers `not-configured`; an invalid marker answers `blocked` with `ACTIVATION_MARKER_INVALID`, the same as any other operation reaching an inactive bundle.

`migration-plan` (#144, #145) shares `discover`'s exact admission: no REACH/TRUST/ACCESS, no evidence, the ordinary activation gate rather than a bypass, because checking a candidate target path for a collision needs the bundle root to exist. It runs no write gate either — it never writes, it only reads each markdown source's own frontmatter and body and probes the bundle for an existing file at the candidate target path.

## Parallel execution (#135)

Package sub-agents run independently and in parallel once `plan` hands out their briefs: each one writes only inside its own package's bundle, through its own ordinary `init`/`okf-write` calls, exactly as any single-project setup would. No lock file, no mutex, and no cross-worker coordination exists or is needed, because no two workers ever target the same bundle root — the write gate's existing compare-and-swap publish (`TARGET_CHANGED` on a changed target) is the only conflict protection any single write already had, and package isolation means it is never exercised across workers. The one piece of genuinely shared state is the root workspace manifest, and it is written exactly once, by the coordinator alone, after every worker has returned — through `aggregate` computing it and `repair` persisting it — never by a worker and never mid-flight.

## Idempotent and repairing

Calling any of the eight operations again is never an error:

- A root that already parses with `okf_version: "0.2"` and the requested `project_mode` (or no requested `project_mode`) is a `no-op` for `init` — nothing is rewritten. A missing, malformed, or wrong-version root is overwritten; an existing Markdown body is preserved when the current root parses, an unparseable root is replaced whole, and a bundle directory that does not exist yet is created.
- `repair` leaves an already-`ok` `.okf-active` or `.okf-workspace.json` untouched and reports `no-op` for that file; it only writes a target reported `missing` or `invalid`.
- `plan`, `aggregate`, `report`, `discover`, and `migration-plan` write nothing, so calling any of them again is always exactly as safe as calling it the first time; `plan` reruns detection fresh rather than remembering a prior call, `aggregate` recomputes the manifest fresh from whatever `payload.results` names this time, `report` recomputes its statistics fresh from whatever `payload.sources`/`payload.packages` names this time, `discover` rescans the project fresh against whatever is on disk this time, and `migration-plan` recomputes the plan fresh from whatever `payload.sources`/`payload.answers` names this time — a source added, removed, or edited between two calls, or an answer changed between two calls, is simply reflected in the next plan, with no memory of a prior call to reconcile against.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing `payload.cwd`, or, for `repair`, a missing or empty `payload.targets`, or, for `aggregate`, a missing or empty `payload.results`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** No operation here ever runs for a delegated caller or runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Inspect before acting.** Send an `inspect` request and read its report. Done when all three files carry a named state; not done while any file's state is assumed rather than reported.
3. **Present the report and get consent.** Show the three states to the user and ask whether to fix all of them or choose which to fix. Done when the user has approved a specific set of repairs, or declined; not done if any file is repaired without that approval, and not done if an already-`ok` file is offered for repair at all.
4. **Repair `index.md` through `init`, when approved.** Call `init` with the bundle named in the report. When `project_mode` is still unknown at this point, ask the user for `code-backed` or `knowledge-only` and call `init` again naming it — the second call merges the mode into the root `init` already wrote. Done when `inspect`, called again, reports `index_md` as `ok`; not done while it still reports `missing` or `invalid`.
5. **Repair `.okf-active` through `repair`, when approved.** Call `repair` with `targets` including `"activation"`. Done when a repeat `inspect` reports `activation` as `ok`.
6. **Repair `.okf-workspace.json` through `repair`, when approved.** Read `inspect`'s report for this file first:
   - An `invalid` file is shown with its validation reason and its `salvage` value, if any, before regeneration; the user's approval is required before the file is overwritten, and a kept `salvage.workspace_id` is passed back as `payload.workspace_id`. Never regenerate an invalid manifest without that approval.
   - A `monorepo: true` hint is a warning, not a decision: call `plan` before asking the user anything. Done when step 9 has run and either produced a deterministic package layout or reported the layout as a question; not done if a single-bundle or hand-written manifest is chosen while `plan` has not yet been tried.
   - When `plan` reports `data.monorepo: false`, or the user prefers a hand-written manifest for a layout `plan` could not resolve, fall back to the pre-#135 choice: the single-bundle template (`repair` with no `manifest` payload) or a manifest hand-drafted with the user and sent as `payload.manifest`.
   - Otherwise, call `repair` with `targets: ["manifest"]` and no other payload field, for the deterministic single-bundle template. Done when a repeat `inspect` reports `manifest` as `ok`.
7. **Discover and classify candidate source documents (#142).** Once config bootstrap (steps 4–6) is done, call `discover`. Done when the response is read and `data.complete` is known; not done while a `data.complete: false` scan is treated as if it were exhaustive — report the gap, do not hide it. Never guess a disposition for a `markdown`, `unsupported`, `other`, or `ambiguous` entry here — `discover` classifies format, not migration disposition; step 8 turns this inventory into dispositions. In a monorepo, `discover` scans the whole workspace when called with a package's own `cwd` that is not its own Git repository — scoping one package sub-agent's discovery to only its own subtree is deferred to the semantic partitioner (#146), so for that case call `discover` once at the coordinator level rather than once per such package.
8. **Derive the migration plan and run the one compact batched question round (#144).** Call `migration-plan` with `payload.sources` set to step 7's `data.sources`, unmodified. Done when a response is read with `data.plan` and `data.questions`; not done while any entry's disposition is assumed rather than read from `data.plan.entries`.
   - `data.plan.executable: true` — every source already has a determined disposition; skip straight to step 9 with nothing to ask.
   - `data.plan.executable: false` — `data.questions` names every still-open question, one per source needing a decision, each with its own `kind`, `prompt`, and closed `options` (or, for `kind: "type"`, any non-empty string). Present the whole batch to the user in one round — never one interruption per question — and call `migration-plan` again with the same `payload.sources` plus `payload.answers: {"<source path>": "<answer>", ...}` built from what the user decided. Repeat until `data.plan.executable` is `true`. Never guess an answer on the user's behalf, and never treat a plan with any `blocked_pending_decision` entry as ready for step 9.
   - A determined plan's entry-level vocabulary (`migrate`/`skip`/`residue`/`blocked_pending_decision`, an intent) is deliberately distinct from `report`'s source-level vocabulary in step 13 (`migrated`/`skipped`/`ambiguous`/`residue`, an outcome): `data.mapping` already carries each `migrate` entry's extracted provenance and link-rewritten body (#145), but dispatching that work to fresh-context workers and actually writing each concept file is the migration worker's job (#146 onward), not this step's, and step 13's payload is always built from what that work actually did, never copied straight from this step's plan.
9. **For a monorepo, detect package boundaries and dispatch one sub-agent per package, in parallel (#135).** Call `plan` with the bundle name and, when already known, `project_mode` and approved `mappings`. Done when the result is one of the three states below and handled accordingly; not done while any state is treated as another.
   - `data.monorepo: false` — proceed as a single-project setup (steps 1–8 as written); this repository has at most one package.
   - `data.ambiguous: true` — show the user `data.reason` and `data.question`; ask them to either name each package root explicitly (feeding a hand-drafted `payload.manifest` into `repair`, as in step 6) or correct the workspace configuration and retry `plan`. Never guess a package list past this point.
   - `data.ambiguous: false` — launch one fresh-context sub-agent per entry in `data.briefs`, all in parallel, each one receiving exactly its own brief object (`package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, `okf_version`) and nothing else: no sibling package's brief, no corpus, no shared mutable state. Each sub-agent runs its own `init` and subsequent `okf-write` calls against its own `cwd`/`bundle` pair exactly as a single-project setup would, and returns its own package's alias, whether it succeeded, and, on failure, why.
10. **Aggregate the sub-agents' results and write the shared manifest once, after all of them return.** Call `aggregate` with one `results` entry per package the sub-agents were dispatched for — every package `plan` named, none omitted, whether it succeeded or failed. Done when `data.status` and `data.manifest` are both read; not done while any dispatched package is missing from `payload.results`.
    - Report `data.status` honestly: `"complete"` only when every package succeeded, `"partial"` otherwise, naming each failed package and its reported reason. Never report overall success while `data.failed` is non-empty.
    - Call `repair` with `targets: ["manifest"]` and `payload.manifest: <aggregate's data.manifest>` to persist it. This is the one and only manifest write for the whole monorepo run; no worker sub-agent ever writes it, and it is never written before every worker has returned. Done when a repeat `inspect` reports `manifest` as `ok`.
11. **Treat a crashed prior setup as an ordinary starting state.** There is no checkpoint, no resume state, and no recovery journal to consult — Git already owns history and rollback for everything this procedure writes. Re-running from step 2 is always correct: whatever `inspect` already reports `ok` is left untouched by step 3's approval gate, and whatever it still reports `missing` or `invalid` is repaired exactly as it would be on a first run; a rerun calls `discover` fresh rather than trusting a prior scan, recomputes the migration plan fresh from that inventory rather than trusting a prior round's answers, and a monorepo re-run calls `plan` again and re-dispatches only the packages still worth acting on.
12. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash. A monorepo run's final report is step 10's `data.status` and per-package detail, never collapsed to a single pass/fail line while any package failed.
13. **Once migration work has actually happened, call `report` and render its response as Markdown for the user (#136).** This step only runs after this setup session did some migration — single-project migration work, or, in a monorepo, after step 10's `aggregate`/`repair` sequence completed. Build `payload.sources` (or, for a monorepo, `payload.packages`, one entry per package dispatched in step 9 using its own `status` from step 10) from exactly what that migration work reported: every selected source's actual disposition and reason, every link actually rewritten or left broken, and `semantic_review.performed: true` only when a human — not this procedure, not a model call — actually reviewed the ambiguities, residue, and representative conversions this session; otherwise leave it `false`. Never invent a disposition, a reason, or a `true` semantic-review flag to make the report look cleaner. Done when `report` answers `result: "ok"`; not done while any known disposition or link outcome was left out of the payload.
    Render the response as Markdown, in this shape, and show it in the chat transcript only — never write it into the bundle (it would itself need to conform to the OKF model) and never write it to a separate file (open point 5):
    - A heading naming `data.status` (`Migration complete` or `Migration partial`).
    - A **Summary** section listing `data.summary`'s five counts.
    - A **Concepts created** section listing `data.concepts`' source → concept pairs, noting any without `sources_declared` as missing provenance.
    - A **Skipped** section listing `data.skipped`'s source/reason pairs, when non-empty.
    - An **Uncertain** section listing `data.ambiguous`'s source/reason pairs as open questions still needing a decision, when non-empty — this is the "what is uncertain" signal, never smoothed into the skipped list.
    - A **Residue** section listing `data.residue`'s source/reason pairs, when non-empty.
    - A **Link integrity** section reporting `data.links`'s counts and listing `data.links.broken_detail`, when any link is broken.
    - A closing **Semantic fidelity** line: when `data.semantic_fidelity.assessed` is `false`, state plainly that semantic fidelity was NOT assessed and structural checks do not establish it; only when it is `true` does this line say a human reviewed it. Never omit this line, and never let a clean `data.status: "complete"` stand in for it.
    - In multi-package mode, repeat the per-package detail under `data.packages`, plus the failed-package list from any `"failed"` entries, before the combined totals above.
