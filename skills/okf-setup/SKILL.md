---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, including a monorepo's package-per-bundle layout, discovering and classifying candidate source documents, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns eleven operations. `init` writes the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle; it is the one exception to the rule that a mutation needs an already-conforming root — it is what makes the root conform in the first place. `inspect` reports the current state of the three config files `/setup` cares about, and `repair` performs an already-approved fix to the two of those files that are plain filesystem actions rather than OKF writes. `plan` and `aggregate` are the monorepo pair (#135): `plan` detects deterministic package boundaries and builds the immutable brief each package sub-agent receives, and `aggregate` collects the per-package results a coordinator's sub-agents returned into one honest summary and the shared root workspace manifest that federates their bundles. `discover` (#142) scans the active project and classifies every candidate source document it finds — `markdown` (a direct parse target: UTF-8 text with compatible optional frontmatter), `unsupported` (a recognised format the migration will not interpret: HTML, PDF, Word, MediaWiki, or Obsidian wikilinks/callouts/Dataview), `other` (not a candidate document format), or `ambiguous` (the evidence on hand does not settle it, carrying a question for the user rather than a guess) — so the migration's compact question round is built from an honest inventory instead of file-by-file guessing. `migration-plan` (#144, #145) turns that inventory into a fully-determined migration plan: every source gets an intentional disposition — `migrate`, `skip`, `residue`, or `blocked_pending_decision` — a `migrate` source gets a type (preserved, deterministically mapped, or approved) and the concept path that type's own canonical directory implies, and a source lands on `blocked_pending_decision` only when its disposition genuinely cannot be inferred, each carrying the one question that would resolve it; feeding the same call `payload.answers` resolves those questions into a plan `data.plan.executable: true`, structurally never before every question is answered. It also carries each `migrate` source's own explicit provenance and link-rewritten body, and the deterministic evidence-retention path for each `residue` source. `partition` (#146) turns an executable migration plan into the dynamic semantic partitioner and delegated worker protocol: it groups `migration-plan`'s own `migrate`/`residue` entries into shards by directory locality (a heuristic file-count threshold splits a shard only once locality alone can no longer keep it small), builds the exact narrow, immutable brief a fresh-context worker receives for its own shard, surfaces a link between two sources landing in different shards as a `cross_shard_link` warning rather than ever losing it, and, in its other payload shape, validates a worker's returned shard against the brief it was given. `assemble` (#147) combines every validated shard — read from the staging file each one was written to, never re-embedded in this operation's own payload — into the one staged bundle: a source path two different shards both claim is refused outright, a concept path two different shards' own concepts both claim blocks the whole call (`CONCEPT_TARGET_COLLISION`) rather than ever renaming, merging, or overwriting either one, an exact cross-shard content duplicate at two different concept paths is surfaced as a non-blocking candidate, a `cross_shard_link` `partition` reported is resolved once its target concept made it into the assembled set or named as a migration-caused relationship loss when it did not, and a shard's own carried-forward `blockers` mark the result `partial` — staged and reported, never published — rather than blocking assembly outright. `migration-validate` (#148) is the pre-publish gate for whatever `assemble` staged: it reuses the exact same conditional-obligation checks (`sources[].resource`, `generated[].by`, an `Attested Computation`'s own `runtime`, human-prefix) the write gate already runs on a fresh concept, catches a nested `index.md`/`log.md` carrying concept frontmatter the same way an already-live bundle's own `okf-read validate` would, cross-checks every source `discover` found against the disposition its own migration plan actually recorded — never a raw file-count comparison — and never claims semantic fidelity on its own: that stays `false` until a human review is actually declared, however clean the rest of the check comes back. `report` (#136) turns the migration's own signals — what was migrated, skipped, left ambiguous, or retained as residue, plus link and provenance facts and whether a human reviewed semantic fidelity — into the structured statistics and thresholds behind the post-setup analytics report; it never reads the bundle itself and never writes anything, and rendering its structured data as the Markdown report the user sees is this file's procedure, not the runtime's. None of the eleven accepts a delegation brief, and none runs automatically; every one is a direct, explicit invocation, and no other skill reaches any of them on a caller's behalf. None of the eleven ever spawns or prompts a sub-agent, `partition` and `assemble` included — building a worker's brief, and combining what workers already returned, are both deterministic runtime work, but actually launching the fresh-context worker a brief describes is this file's own procedure (step 9 below), never the runtime's.

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
    "bundle": "<optional bundle directory name to exclude from the scan, defaults to \"okf\">",
    "package_root": "<optional gitRoot-relative package subtree to scan instead of the whole repository>"
  }
}
```

`discover` is read-only: it never writes anything. Unlike `inspect`/`repair`/`plan`/`aggregate`/`report`/`partition`, it does not bypass the activation-marker gate — it scans an already-active bundle's project, so it needs the bundle root to exist to know what to exclude from its own scan, and it only makes sense once `init`/`repair` have already run. `cwd` outside any Git repository, or an inactive or invalid `.okf-active`, answers the same as every other operation on an inactive bundle: `not-configured` or `blocked` with `ACTIVATION_MARKER_INVALID`, nothing scanned.

`payload.package_root` (#146) is the per-package scan scope #142 deferred: for a monorepo package sharing the workspace repository rather than owning its own (`monorepo.buildBrief` keeps `cwd` at the workspace root for that case, so `cwd` alone cannot narrow the scan), naming the package's own `gitRoot`-relative directory here starts the walk there instead of at the repository root. Every returned `path` stays exactly as `gitRoot`-relative as an unscoped scan's, unchanged, because every downstream consumer — `migration-plan`'s concept-path derivation, its bundle-collision check, `partition`'s own locality grouping — already assumes that identity. `payload.package_root` is validated with the same path-safety rule `plan`'s own package paths already use: an absolute path, an empty string, or a path reaching above the repository root is `UNSUPPORTED_INPUT`, nothing scanned. Omitting it scans the whole repository, exactly as before.

The scan root is the active repository (the Git root of `payload.cwd`), not `payload.cwd` itself — discovery covers the whole project, not an arbitrary subdirectory a caller happens to pass. Four, and only four, subtrees are excluded from the walk, named here as a discovery-scope choice and not a REACH exclusion rule (`scripts/lib/reach.js` ships no configurable directory-exclusion list, and this is not one): `.git`, `node_modules`, `.okf-staging` (#147's own pre-publication staging area, written beside the bundle rather than inside it — see `assemble` below), and the bundle directory itself (`payload.bundle`, or `okf`) — a bundle must not be re-discovered as a candidate source for its own migration, and neither must the staging area a prior `assemble` call already produced. Every other file in the project, at any depth, is scanned and classified.

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

### `partition`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "partition",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name carried into every brief, defaults to \"okf\">",
    "project_mode": "<optional \"code-backed\" or \"knowledge-only\", carried into every brief>",
    "max_sources_per_shard": 8,
    "plan": {
      "entries": [
        { "path": "docs/decisions/use-postgres.md", "disposition": "migrate", "reason": "type_preserved", "concept": "decisions/use-postgres", "type": "Decision" }
      ],
      "executable": true
    },
    "mapping": [
      { "path": "docs/decisions/use-postgres.md", "concept": "decisions/use-postgres", "type": "Decision", "sources": null, "body": "# Use Postgres\n" }
    ],
    "references": []
  }
}
```

`partition` (#146) is read-only: it never writes anything, never reads a source file, and never spawns or prompts a sub-agent — building a worker's brief is deterministic runtime work; launching the fresh-context worker that brief describes is step 9's job, not this operation's. It accepts exactly one of two payload shapes; naming both, or naming neither, is `UNSUPPORTED_INPUT` before anything is computed, the same discipline `report` already applies to its own two shapes.

**Compute mode** — `payload.plan`, `payload.mapping`, and `payload.references` (required together): exactly `migration-plan`'s own `data.plan` (`{entries, executable}`), `data.mapping`, and `data.references`, unmodified. `payload.plan.executable` must be `true` — this operation partitions an already fully-determined plan, it never resolves an open question itself, so a plan still carrying a `blocked_pending_decision` entry is `UNSUPPORTED_INPUT`. `payload.mapping`/`payload.references` must correspond, one-for-one, to `payload.plan.entries`' own `migrate`/`residue` sources and their own approved `concept`/`type` — a mismatched, missing, or invented entry is `UNSUPPORTED_INPUT` before anything is computed, since nothing stops a caller from hand-assembling or tampering with the three pieces separately. `payload.max_sources_per_shard`, when supplied, must be a positive integer; it overrides the default heuristic threshold (`8`) named in `scripts/lib/partition.js` as `DEFAULT_MAX_SOURCES_PER_SHARD` — an implementation heuristic per #131, never contract.

The response is `result: "ok"` with:

- `data.shards` — one entry per shard: `{ "shard", "sources", "brief" }`. `shard` is a human-readable label — the longest directory prefix shared by that shard's own sources, deduplicated with a `#2`/`#3` suffix on a repeat (a directory the file-count fallback split further). `sources` is that shard's own source paths. `brief` is the exact narrow, immutable context a fresh-context worker for this shard receives (#131 section 11) and nothing more: `shard` (its own id, to echo back), `cwd`, `bundle`, `project_mode`, `okf_version` (the authoring contract's own version tag, `"0.2"` — no corpus, no authoring prose duplicated from the contract, exactly as `plan`'s own package brief already treats it), `sources` (its own assigned source paths), `mapping` (the slice of `payload.mapping` for its own `migrate` sources), `references` (the slice of `payload.references` for its own `residue` sources), and `neighbors` — the target concept path for every link this shard's own sources make into a concept another shard owns, so the worker can still author a correct reference to a concept it will never hold the content of.
- `data.cross_shard_links` — `{ "from", "to", "from_shard", "to_shard" }` for every link between two migrating concepts that landed in different shards. Grouping by directory locality keeps a linked pair together whenever they already share a directory; when they do not, the link is never silently dropped — it is surfaced here, and as a non-blocking `cross_shard_link` finding, exactly the "report the cross-shard link as a warning" half of #131's two sanctioned responses to a split link.
- `data.max_sources_per_shard` — the threshold this call actually used, named plainly rather than left for the caller to recompute.

Grouping is by directory locality first, refined one directory level deeper only when a group is still larger than the threshold, and falls back to plain file-count chunking only once a group can no longer be separated by directory at all — a corpus small enough to fit under the threshold in one shard always stays in one shard, whatever its own directory shape; fan-out only happens once the corpus itself is large enough to need it (#131: "fan-out scales with corpus size and semantic structure").

**Validate mode** — `payload.brief` and `payload.shard` (required together instead of the three compute-mode fields): `brief` is exactly one `data.shards[].brief` this same operation already produced, and `shard` is the candidate output a worker returned for it — `{ "shard", "concepts", "references", "warnings", "blockers" }`, no other field. `concepts` is one `{ "path", "concept", "type", "body" }` per source the worker converted, each `path` naming one of `brief.mapping`'s own sources and its `concept`/`type` matching that entry's own approved values exactly — a worker cannot invent a different target than what was approved. `references` is one `{ "path", "reference_path" }` per residue source it retained, matching `brief.references` exactly the same way. `blockers` is one `{ "path", "reason" }` per assigned source the worker could not resolve — #131's own "ambiguities/blockers" — naming one of `brief.sources`. `warnings` is a plain array of strings. Every source `brief.mapping`/`brief.references` assigned must appear in exactly one of `concepts`/`references`/`blockers` — nothing assigned may be silently missing.

The response is `result: "ok"`, `data: { "valid": true }` when the shard matches its own brief exactly. A shard that does not — a wrong `shard` id, an unknown field, a claim outside what the brief assigned, a mismatched `concept`/`type`/`reference_path`, a duplicate entry, or an assigned source missing from all three arrays — is `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"`, with exactly one specific finding naming what was wrong: `SHARD_MALFORMED`, `SHARD_UNKNOWN_FIELD`, `SHARD_IDENTITY_MISMATCH`, `SHARD_SOURCE_NOT_ASSIGNED`, `SHARD_CONCEPT_MISMATCH`, `SHARD_REFERENCE_MISMATCH`, `SHARD_DUPLICATE_ENTRY`, or `SHARD_INCOMPLETE`. This checks only the shard *envelope* against its own brief; OKF concept-content conformance is #148's job, and cross-worker collision handling and bundle assembly is #147's, neither of which this operation performs.

`partition` runs no admission and no write gate at all — like `plan`/`aggregate`/`report`, it only reads and computes, requiring nothing more than a Git repository to resolve `cwd` against (otherwise `not-configured`); it never touches the bundle itself in either payload shape.

### `assemble`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "assemble",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\", used only for the staging path>",
    "partition": {
      "shards": [
        {
          "shard": "docs/decisions",
          "sources": ["docs/decisions/use-postgres.md"],
          "brief": "<exactly this shard's own data.shards[].brief from the partition call that produced it>"
        }
      ],
      "cross_shard_links": [
        { "from": "decisions/use-postgres", "to": "glossary", "from_shard": "docs/decisions", "to_shard": "docs" }
      ]
    },
    "shards": [
      { "shard": "docs/decisions", "path": ".okf-staging/okf/shards/docs-decisions.json" }
    ]
  }
}
```

`assemble` (#147) never reads a worker's own returned content from this operation's own payload: `payload.partition.shards[].brief` is exactly `partition`'s own `data.shards[].brief` (already known to the caller from that earlier call — nothing new), but `payload.shards[].path` names, per shard, only *where* the worker's own validated shard object was written on disk, a `cwd`-relative path with the same safety rule `payload.package_root` already uses (an absolute path, an empty string, or a path reaching above the Git root is `UNSUPPORTED_INPUT`). This operation reads that file itself — the coordinator never re-embeds a worker's own concept bodies in a wrapper request a second time, so assembling a whole corpus never costs more of the coordinator's own context than partitioning it already did.

`payload.partition.shards` must name each shard exactly once, and `payload.shards` must cover that exact same set — a shard `payload.partition` names with no matching `payload.shards` entry, or a `payload.shards` entry naming a shard `payload.partition` never produced, is `UNSUPPORTED_INPUT` with an `ASSEMBLY_SHARD_SET_MISMATCH` finding before anything is read, never assembled partially from whichever shards happened to show up. A shard file this operation cannot read or parse as JSON is `UNSUPPORTED_INPUT` with an `ASSEMBLY_SHARD_UNREADABLE` finding naming it.

Every shard is first checked against its own brief through exactly `partition`'s own validate-mode rule (`scripts/lib/partition.js`'s `validateShard`) — defense in depth, since `skills/okf-setup/SKILL.md`'s own procedure already requires this before a shard is ever staged. A shard that fails is `UNSUPPORTED_INPUT` with that same specific `SHARD_*` finding partition's own validate mode would have reported.

Once every shard's own envelope is trustworthy, `assemble` combines them:

- **Source claimed twice.** A source path two different shards both report (as a concept, a reference, or a blocker) is `UNSUPPORTED_INPUT` with an `ASSEMBLY_SOURCE_DUPLICATE` finding naming the path and both shards — nothing here decides which shard is right, because a partition never legitimately produces this on its own; it is refused rather than silently resolved by read order.
- **Concept target collision.** Two shards' own concepts naming the same `concept` path is `result: "blocked"`, `data.code: "CONCEPT_TARGET_COLLISION"`, with one `CONCEPT_TARGET_COLLISION` finding per disputed path naming every claim on it (`{ "path", "shard" }` each) — #131's "target collisions block, or require a user decision" binding rule, extended across shard boundaries: `migration-plan`'s own collision check only ever compares a candidate path against the bundle already published on disk, never against a sibling entry in the same plan, so two sources sharing a deterministic target directory-and-basename can both reach `migrate` disposition undetected until here. Nothing is staged while a collision is open — no rename, no merge, no overwrite, no "first one wins".
- **Exact duplicate candidate.** Two concepts at two *different* concept paths whose `body` is byte-for-byte identical are surfaced in `data.duplicates` (`{ "concepts": [...], "shards": [...] }`) as a non-blocking `ASSEMBLY_DUPLICATE_CANDIDATE` finding — #145's own `plan_duplicate_candidate` precedent, extended across shard boundaries. Surfacing is as far as this goes: both concepts are still staged, distinct and unmerged. A near duplicate is never even compared; this operation has no similarity heuristic to invent one with.
- **Cross-shard links.** Every `payload.partition.cross_shard_links` entry is re-checked against the concepts actually assembled: `data.links.resolved` (`{ "from", "to" }`) for one whose target concept made it in, `data.links.lost` (`{ "from", "to", "from_shard", "to_shard" }`) — plus a non-blocking `MIGRATION_LINK_LOST` finding — for one whose target did not (its own shard blocked that source, or never returned it). This is a stronger signal than an ordinary broken link, and is named as such rather than folded into one; ordinary link integrity beyond this shard-boundary set is #148's job.
- **Blockers carried forward.** Every shard's own `blockers` are carried into `data.blockers` (`{ "path", "reason", "shard" }`) verbatim, each surfaced as a non-blocking `ASSEMBLY_SOURCE_BLOCKED` finding. Their presence never blocks assembly itself — the concepts every *other* source in the corpus already resolved to are still staged — but it sets `data.status: "partial"` and `data.publishable: false`: partial work stays staged and reported until the blocker is resolved, never published (#131).

Once collision-free, `assemble` writes one Markdown file per assembled concept — `type` and `status: "draft"` frontmatter, plus `sources` only when that concept's own approved mapping declared it, exactly as `evaluateCreate` writes a freshly created concept — to `<Git root>/.okf-staging/<bundle>/<concept>.md`, a plain filesystem staging area beside the bundle, never inside it and never through the write gate: this is pre-publication scratch space, not itself required to be a conforming OKF bundle yet, and #148's later validation and a later publication step are what promote it into one. `data.staged` names one `{ "path", "concept", "type", "shard", "file" }` per file actually written, `data.staging_dir` names the staging root (`Git`-root-relative), and `data.status` is `"complete"` (`data.publishable: true`) only when no shard reported a blocker.

`assemble` never deletes a stale file left behind by an earlier call to the same staging directory — it is scratch space cleared by the publication step that eventually consumes it, not a resume ledger `/setup` reads state back out of, and it is never treated as one: rerunning `assemble` after a source, an answer, or a shard's own worker output changed simply overwrites the staged files that changed, the same "no memory of a prior call" idempotency `partition`'s own recompute already has.

`assemble` runs no admission and no write gate at all — like `partition`, it only reads, computes, and writes its own isolated staging area, requiring nothing more than a Git repository to resolve `cwd` against (otherwise `not-configured`); it never touches the bundle itself.

### `migration-validate`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "migration-validate",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\", used only for the staging path>",
    "selected": ["docs/decisions/use-postgres.md", "docs/api-reference.md"],
    "plan": {
      "entries": [
        { "path": "docs/decisions/use-postgres.md", "disposition": "migrate", "reason": "type_preserved", "concept": "decisions/use-postgres", "type": "Decision" },
        { "path": "docs/api-reference.md", "disposition": "skip", "reason": "code_recoverable", "concept": null, "type": null }
      ],
      "executable": true
    },
    "semantic_review": { "performed": false }
  }
}
```

`migration-validate` (#148) is the pre-publish validation gate for whatever `assemble` staged at `.okf-staging/<bundle>`, plus the completeness and semantic-fidelity disclosure #131 requires before that staged content may ever reach the real bundle. It is read-only: it never writes anything, staged content included. Three checks, none of them a second implementation of a rule this suite already has:

- **Structural, conformance, and link integrity.** Every staged concept is read back through the same shared reader and checked with `checkConcept` — the identical conditional-obligation rules the write gate already runs on a fresh concept: non-empty `type`, `sources[].resource`, `generated[].by`, an `Attested Computation`'s own `runtime`, and the human-prefix rule on `author`/`confirmed`. A nested `index.md`/`log.md` carrying concept frontmatter — reserved navigation is never a concept, at any depth — is caught the same way an already-live bundle's own `okf-read validate` call would catch it. A broken link warns rather than blocks, because upstream permits it (#131).
- **Completeness.** `payload.plan` is exactly `migration-plan`'s own `data.plan` (`{entries, executable}`), and `payload.plan.executable` must be `true` — the same requirement `partition` already has, for the same reason: this operation validates a corpus already fully decided, never one still carrying an open question. Raw file-count parity is never the measure (#131), most visibly for a `code-backed`-filtered source deliberately never migrated: a `skip`-disposition entry with a real reason satisfies completeness exactly as intentionally as a `migrate` one. What no single plan can see on its own is a source that fell off it entirely — an entry simply never recorded — so `payload.selected` (every source `discover` actually found this run) is cross-checked against `plan.entries`' own paths independently; a `selected` path with no matching entry names a `SOURCE_DISPOSITION_MISSING` finding rather than passing unnoticed.
- **Semantic fidelity.** `payload.semantic_review` is required and is exactly `report`'s own shape, `{ "performed": true|false }` — never inferred `true` from a clean structural pass. This is the loudest rule in the operation: a bundle with zero structural findings and zero missing dispositions still answers `semantic_fidelity: { "assessed": false }`, with its own warning finding, unless a human review was actually declared.

The response is `result: "ok"` with `data.status` (`"complete"` only when nothing found above blocks, `"partial"` otherwise), `data.publishable` (the same test, named plainly), `data.missing_disposition` (every `selected` path this call could not find a plan entry for), `data.concepts_checked` (every staged path this call actually read), and `data.semantic_fidelity`. This operation never recomputes `report`'s own summary statistics or renders any prose; a caller who wants the post-setup analytics still calls `report` itself, separately, once this gate is satisfied.

`migration-validate` runs no admission and no write gate at all — like `partition`/`assemble`, it only reads and computes, requiring nothing more than a Git repository to resolve `cwd` against (otherwise `not-configured`); an absent staging directory (a migration that selected nothing to `migrate`/`residue`) is an empty bundle to check, never a read failure.

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

`report`'s output location (open point 5) is deliberately nowhere on disk: it returns structured JSON on stdout, like every other wrapper response, and nothing else. It does not write into the bundle — a report living inside the bundle would itself have to conform to the OKF model, a cost this operation does not pay — and it does not write a separate file. Rendering the response as the Markdown report a user reads, and deciding whether that Markdown goes to the chat transcript or somewhere the user names, is this file's procedure (step 15), not the runtime's (open point 1: the runtime emits the structured signal set, this file specifies the prose).

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, and the activation-marker gate. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

`inspect` and `repair` run no REACH/TRUST/ACCESS admission and cite no evidence at all: `.okf-active` and `.okf-workspace.json` are plain filesystem actions, not OKF operations through the write gate, so neither carries the `effects` vocabulary bounded writes use. Both run even when the activation marker itself is absent or invalid — that is one of the things `inspect` reports and `repair` fixes — so neither is gated behind the marker the way every mutating operation on an active bundle is. The only preconditions are a Git repository (otherwise `not-configured`, same as every other operation) and, for `repair`, a writable Git root (otherwise a blocked result carrying a `PARENT_DIRECTORY_NOT_WRITABLE` finding).

`plan`, `aggregate`, `report`, `partition`, `assemble`, and `migration-validate` run no admission and no write gate at all — like `inspect`, none of them writes into the bundle or requires a bundle root, an activation marker, or a manifest to already exist. The only precondition any of them has is a Git repository (otherwise `not-configured`); `aggregate` additionally requires that `plan`'s own deterministic detection still resolves to the same unambiguous package list `payload.results` names, so nothing about the workspace shape changed out from under it between the two calls. `report`, `partition`, `assemble`, and `migration-validate` carry no such requirement — none of them reads the bundle or the workspace shape, only the signals, plan, or shards its own payload names, so none ever needs to agree with `plan`'s live detection. `assemble` is the one operation among these six that writes anything at all, and what it writes is its own isolated staging area beside the bundle, never the bundle itself — see its own section above for exactly what and where; `migration-validate` only ever reads that same staging area back.

`discover` also runs no REACH/TRUST/ACCESS admission and cites no evidence — it only reads and classifies, never writes — but, unlike the four operations above, it does not run before or independently of the activation marker: it shares the ordinary activation gate every read/write operation on an active bundle shares, because it needs the bundle root itself to exist so it can exclude it from the scan. A Git repository with no activation marker yet answers `not-configured`; an invalid marker answers `blocked` with `ACTIVATION_MARKER_INVALID`, the same as any other operation reaching an inactive bundle.

`migration-plan` (#144, #145) shares `discover`'s exact admission: no REACH/TRUST/ACCESS, no evidence, the ordinary activation gate rather than a bypass, because checking a candidate target path for a collision needs the bundle root to exist. It runs no write gate either — it never writes, it only reads each markdown source's own frontmatter and body and probes the bundle for an existing file at the candidate target path.

## Parallel execution (#135, #146)

Package sub-agents run independently and in parallel once `plan` hands out their briefs: each one writes only inside its own package's bundle, through its own ordinary `init`/`okf-write` calls, exactly as any single-project setup would. No lock file, no mutex, and no cross-worker coordination exists or is needed, because no two workers ever target the same bundle root — the write gate's existing compare-and-swap publish (`TARGET_CHANGED` on a changed target) is the only conflict protection any single write already had, and package isolation means it is never exercised across workers. The one piece of genuinely shared state is the root workspace manifest, and it is written exactly once, by the coordinator alone, after every worker has returned — through `aggregate` computing it and `repair` persisting it — never by a worker and never mid-flight.

Shard sub-agents run the same way once `partition` hands out their briefs (#146): each one only *authors* its own concepts and reference metadata, in memory, and returns them — it never writes into any bundle itself, so two shard workers never claim the same target through a filesystem race, only through the identity conflict `assemble` (#147) checks for once every shard is in. A shard worker's own returned output is validated against its brief through `partition`'s second payload shape before the coordinator ever treats it as trustworthy input to assembly, then written to its own staging file (a plain filesystem action, not an OKF write) so `assemble` can read it back itself rather than the coordinator re-embedding it. The coordinator alone owns cross-shard collision handling and assembly, through `assemble`, once every shard has returned — never a worker, and never mid-flight; final whole-bundle validation is `migration-validate`'s (#148), run by the same coordinator once every shard has been assembled.

## Idempotent and repairing

Calling any of the eleven operations again is never an error:

- A root that already parses with `okf_version: "0.2"` and the requested `project_mode` (or no requested `project_mode`) is a `no-op` for `init` — nothing is rewritten. A missing, malformed, or wrong-version root is overwritten; an existing Markdown body is preserved when the current root parses, an unparseable root is replaced whole, and a bundle directory that does not exist yet is created.
- `repair` leaves an already-`ok` `.okf-active` or `.okf-workspace.json` untouched and reports `no-op` for that file; it only writes a target reported `missing` or `invalid`.
- `plan`, `aggregate`, `report`, `discover`, `migration-plan`, `partition`, and `migration-validate` write nothing, so calling any of them again is always exactly as safe as calling it the first time; `plan` reruns detection fresh rather than remembering a prior call, `aggregate` recomputes the manifest fresh from whatever `payload.results` names this time, `report` recomputes its statistics fresh from whatever `payload.sources`/`payload.packages` names this time, `discover` rescans the project fresh against whatever is on disk this time, `migration-plan` recomputes the plan fresh from whatever `payload.sources`/`payload.answers` names this time, `partition` recomputes the shard set fresh from whatever `payload.plan`/`payload.mapping`/`payload.references` (or `payload.brief`/`payload.shard`) names this time, and `migration-validate` re-reads the staging area and recomputes completeness fresh from whatever `payload.selected`/`payload.plan` names this time — a source added, removed, or edited between two calls, or an answer changed between two calls, is simply reflected in the next plan, partition, or validation, with no memory of a prior call to reconcile against.
- `assemble` recomputes its own decision fresh from whatever `payload.partition`/`payload.shards` names this time, exactly like `partition` — but, unlike the seven operations above, it does write: calling it again overwrites whichever staged concept files the new computation actually produces. This is deliberately not a resume ledger: `assemble` never consults a prior call's own output to decide what to do this time, and a stale file a changed shard set no longer produces is left in the staging directory rather than swept — scratch space a later publication step consumes and clears, not state `/setup` reads back to decide what already happened.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing `payload.cwd`, or, for `repair`, a missing or empty `payload.targets`, for `aggregate`, a missing or empty `payload.results`, or, for `assemble`, a missing `payload.partition` or a missing or empty `payload.shards`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** No operation here ever runs for a delegated caller or runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Inspect before acting.** Send an `inspect` request and read its report. Done when all three files carry a named state; not done while any file's state is assumed rather than reported.
3. **Present the report and get consent.** Show the three states to the user and ask whether to fix all of them or choose which to fix. Done when the user has approved a specific set of repairs, or declined; not done if any file is repaired without that approval, and not done if an already-`ok` file is offered for repair at all.
4. **Repair `index.md` through `init`, when approved.** Call `init` with the bundle named in the report. When `project_mode` is still unknown at this point, ask the user for `code-backed` or `knowledge-only` and call `init` again naming it — the second call merges the mode into the root `init` already wrote. Done when `inspect`, called again, reports `index_md` as `ok`; not done while it still reports `missing` or `invalid`.
5. **Repair `.okf-active` through `repair`, when approved.** Call `repair` with `targets` including `"activation"`. Done when a repeat `inspect` reports `activation` as `ok`.
6. **Repair `.okf-workspace.json` through `repair`, when approved.** Read `inspect`'s report for this file first:
   - An `invalid` file is shown with its validation reason and its `salvage` value, if any, before regeneration; the user's approval is required before the file is overwritten, and a kept `salvage.workspace_id` is passed back as `payload.workspace_id`. Never regenerate an invalid manifest without that approval.
   - A `monorepo: true` hint is a warning, not a decision: call `plan` before asking the user anything. Done when step 12 has run and either produced a deterministic package layout or reported the layout as a question; not done if a single-bundle or hand-written manifest is chosen while `plan` has not yet been tried.
   - When `plan` reports `data.monorepo: false`, or the user prefers a hand-written manifest for a layout `plan` could not resolve, fall back to the pre-#135 choice: the single-bundle template (`repair` with no `manifest` payload) or a manifest hand-drafted with the user and sent as `payload.manifest`.
   - Otherwise, call `repair` with `targets: ["manifest"]` and no other payload field, for the deterministic single-bundle template. Done when a repeat `inspect` reports `manifest` as `ok`.
7. **Discover and classify candidate source documents (#142).** Once config bootstrap (steps 4–6) is done, call `discover`. Done when the response is read and `data.complete` is known; not done while a `data.complete: false` scan is treated as if it were exhaustive — report the gap, do not hide it. Never guess a disposition for a `markdown`, `unsupported`, `other`, or `ambiguous` entry here — `discover` classifies format, not migration disposition; step 8 turns this inventory into dispositions. For a single-project setup, call it once with no `package_root`, covering the whole repository. A monorepo package sub-agent dispatched in step 12 calls it again on its own — scoped to its own subtree with `payload.package_root` set to its own brief's own `package_root` (#146 settles the per-package scan scope #142 deferred) — rather than the coordinator's own whole-workspace call filtered by hand afterward.
8. **Derive the migration plan and run the one compact batched question round (#144).** Call `migration-plan` with `payload.sources` set to step 7's `data.sources`, unmodified. Done when a response is read with `data.plan` and `data.questions`; not done while any entry's disposition is assumed rather than read from `data.plan.entries`.
   - `data.plan.executable: true` — every source already has a determined disposition; skip straight to step 9 with nothing to ask.
   - `data.plan.executable: false` — `data.questions` names every still-open question, one per source needing a decision, each with its own `kind`, `prompt`, and closed `options` (or, for `kind: "type"`, any non-empty string). Present the whole batch to the user in one round — never one interruption per question — and call `migration-plan` again with the same `payload.sources` plus `payload.answers: {"<source path>": "<answer>", ...}` built from what the user decided. Repeat until `data.plan.executable` is `true`. Never guess an answer on the user's behalf, and never treat a plan with any `blocked_pending_decision` entry as ready for step 9.
   - A determined plan's entry-level vocabulary (`migrate`/`skip`/`residue`/`blocked_pending_decision`, an intent) is deliberately distinct from `report`'s source-level vocabulary in step 16 (`migrated`/`skipped`/`ambiguous`/`residue`, an outcome): `data.mapping` already carries each `migrate` entry's extracted provenance and link-rewritten body (#145); step 9 partitions that same plan into the shards fresh-context workers actually convert, step 10 assembles what those workers actually returned, step 11 validates what was assembled, and step 16's payload is always built from what that work actually did, never copied straight from this step's plan.
9. **Partition the executable plan and dispatch one fresh-context worker per shard, in parallel (#146).** Once step 8's plan is executable, call `partition` with `payload.plan`, `payload.mapping`, and `payload.references` set to step 8's own `data.plan`, `data.mapping`, and `data.references`, unmodified, plus the bundle name and, when already known, `project_mode`. Done when `data.shards` is read and every shard's own `brief` is known; not done while a shard is dispatched from anything other than `data.shards[].brief` itself.
   - Launch one fresh-context sub-agent per shard, all in parallel, each one receiving exactly its own `brief` object and nothing else: no sibling shard's sources or mapping, no corpus beyond its own assigned slice, no shared mutable state. Each sub-agent authors the concepts and copies the residue evidence its own brief names, uses its own `brief.neighbors` entries to keep an outbound cross-shard link correct without ever being shown that neighbor's own content, and returns a shard object (`shard`, `concepts`, `references`, `warnings`, `blockers`).
   - Validate every returned shard against its own brief before trusting it: call `partition` again with `payload.brief`/`payload.shard`. Done when `data.valid: true` is read for a shard, or its specific `SHARD_*` finding is read and reported back to the worker or the user; never treat an unvalidated shard as ready for assembly.
   - Once a shard validates, write its own returned object to its own staging file — a plain filesystem action, not an OKF write, at a path of this procedure's own choosing (for example `.okf-staging/<bundle>/shards/<shard>.json`) — rather than holding it in hand for step 10. Step 10 names that file's own path, never the shard object itself, so assembling a whole corpus never costs more of this session's own context than partitioning it already did.
   - A non-empty `data.cross_shard_links` names a link between two sources that landed in different shards; carry it forward to step 10, which resolves each one or reports why it could not — never silently dropped (#131).
   - This step ends once every shard is validated and staged; combining them into the bundle is step 10's job, not this one's.
10. **Assemble every validated, staged shard into the bundle, resolving any cross-worker collision (#147).** Call `assemble` with `payload.partition` set to step 9's own `data.shards` and `data.cross_shard_links`, unmodified, plus `payload.shards` naming, for every shard from step 9, the staging file it was written to. Done when the response is read and either `data.status` or a blocking `data.code` is known; not done while any shard step 9 produced is missing from `payload.shards`.
    - `result: "blocked"`, `data.code: "CONCEPT_TARGET_COLLISION"` — two shards' own concepts claim the same target path. This is a decision for the user, not something this procedure resolves on its own: show every disputed concept path and `data.collisions`' own claims on it, and do not retry automatically — #131 permits only a user decision here, never a guessed rename, merge, or overwrite. Setup cannot advance past this point until the user decides how to change one of the colliding sources (a different type, a different source, or dropping one from this migration) and the corpus is re-planned from step 8.
    - `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"` — a shard step 9 produced is missing from `payload.shards`, its staging file could not be read, or it failed the same envelope check step 9's own validation already ran. This is this procedure's own error, not a decision for the user: an earlier step's output was not carried through unmodified. Correct the payload and retry rather than asking the user anything.
    - `result: "ok"` — read `data.duplicates` (report as non-blocking candidates; never merge either concept), `data.links.lost` (report as migration-caused relationship loss, distinct from an ordinary broken link, which is #148's concern) and `data.links.resolved`, and `data.blockers` (report as still-unresolved sources). `data.status: "complete"` and `data.publishable: true` only when `data.blockers` is empty; otherwise `"partial"` and `false` — the staged concepts stay exactly as `data.staged` names them, in `data.staging_dir`, reported but not carried into the later publication step until the blocker is resolved.
11. **Validate the staged bundle before publication (#148).** Once step 10's `assemble` call has run, call `migration-validate` with `payload.selected` set to step 7's own `data.sources` paths, `payload.plan` set to step 8's own `data.plan`, unmodified, and `payload.semantic_review` — honestly, not yet claiming a review that has not happened, since that comes only at step 16. Done when `data.status` and `data.publishable` are both read; not done while a structural finding, a `SOURCE_DISPOSITION_MISSING` finding, or a `data.publishable: false` is treated as anything other than blocking the next step.
    - A blocking structural finding (`FRONTMATTER_UNPARSEABLE`, `TYPE_MISSING`, `SOURCE_RESOURCE_MISSING`, `GENERATED_BY_MISSING`, `RUNTIME_MISSING`, `HUMAN_PREFIX_MISSING`, or `BUNDLE_FILES_NONCONFORMING`) names a staged concept — or a reserved file wrongly carrying concept frontmatter — that must be corrected at its own source and re-migrated from step 8, never patched by hand in the staging area.
    - A `SOURCE_DISPOSITION_MISSING` finding names a source `discover` found that never reached an intentional disposition; return to step 8 rather than treating it as silently out of scope.
    - `data.publishable: true` with no blocking finding is this procedure's own signal that step 16's later publication may proceed; it never proceeds while `data.publishable: false`.
12. **For a monorepo, detect package boundaries and dispatch one sub-agent per package, in parallel (#135).** Call `plan` with the bundle name and, when already known, `project_mode` and approved `mappings`. Done when the result is one of the three states below and handled accordingly; not done while any state is treated as another.
    - `data.monorepo: false` — proceed as a single-project setup (steps 1–11 as written); this repository has at most one package.
    - `data.ambiguous: true` — show the user `data.reason` and `data.question`; ask them to either name each package root explicitly (feeding a hand-drafted `payload.manifest` into `repair`, as in step 6) or correct the workspace configuration and retry `plan`. Never guess a package list past this point.
    - `data.ambiguous: false` — launch one fresh-context sub-agent per entry in `data.briefs`, all in parallel, each one receiving exactly its own brief object (`package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, `okf_version`) and nothing else: no sibling package's brief, no corpus, no shared mutable state. Each sub-agent runs its own steps 7–11 (`discover` scoped to its own `package_root`, `migration-plan`, `partition` dispatching its own shard workers in turn, `assemble`, and `migration-validate`) against its own `cwd`/`bundle` pair, exactly as a single-project setup would, and returns its own package's alias, whether it succeeded, and, on failure, why.
13. **Aggregate the sub-agents' results and write the shared manifest once, after all of them return.** Call `aggregate` with one `results` entry per package the sub-agents were dispatched for — every package `plan` named, none omitted, whether it succeeded or failed. Done when `data.status` and `data.manifest` are both read; not done while any dispatched package is missing from `payload.results`.
    - Report `data.status` honestly: `"complete"` only when every package succeeded, `"partial"` otherwise, naming each failed package and its reported reason. Never report overall success while `data.failed` is non-empty.
    - Call `repair` with `targets: ["manifest"]` and `payload.manifest: <aggregate's data.manifest>` to persist it. This is the one and only manifest write for the whole monorepo run; no worker sub-agent ever writes it, and it is never written before every worker has returned. Done when a repeat `inspect` reports `manifest` as `ok`.
14. **Treat a crashed prior setup as an ordinary starting state.** There is no checkpoint, no resume state, and no recovery journal to consult — Git already owns history and rollback for everything this procedure writes. Re-running from step 2 is always correct: whatever `inspect` already reports `ok` is left untouched by step 3's approval gate, and whatever it still reports `missing` or `invalid` is repaired exactly as it would be on a first run; a rerun calls `discover` fresh rather than trusting a prior scan, recomputes the migration plan fresh from that inventory rather than trusting a prior round's answers, recomputes the partition fresh rather than trusting a prior shard set, recomputes the assembled bundle fresh rather than trusting a prior staging run (simply overwriting whichever staged files the new computation still produces), revalidates the staged bundle fresh rather than trusting a prior `migration-validate` call, and a monorepo re-run calls `plan` again and re-dispatches only the packages still worth acting on.
15. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash. A monorepo run's final report is step 13's `data.status` and per-package detail, never collapsed to a single pass/fail line while any package failed.
16. **Once migration work has actually happened, call `report` and render its response as Markdown for the user (#136).** This step only runs after this setup session did some migration — single-project migration work through step 11, or, in a monorepo, after step 13's `aggregate`/`repair` sequence completed. Build `payload.sources` (or, for a monorepo, `payload.packages`, one entry per package dispatched in step 12 using its own `status` from step 13) from exactly what that migration work reported: every selected source's actual disposition and reason, every link actually rewritten or left broken, and `semantic_review.performed: true` only when a human — not this procedure, not a model call — actually reviewed the ambiguities, residue, and representative conversions this session; otherwise leave it `false`. Never invent a disposition, a reason, or a `true` semantic-review flag to make the report look cleaner. Done when `report` answers `result: "ok"`; not done while any known disposition or link outcome was left out of the payload.
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
