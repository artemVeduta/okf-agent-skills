---
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, including a monorepo's package-per-bundle layout, discovering and classifying candidate source documents, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
---

# okf-setup

`okf-setup` owns twelve operations. `init` writes the bundle-root `index.md` that every other skill's write gate requires before it will touch a bundle; it is the one exception to the rule that a mutation needs an already-conforming root — it is what makes the root conform in the first place. `inspect` reports the current state of the two config files `/setup` cares about, and `repair` performs an already-approved fix to the one of those files that is a plain filesystem action rather than an OKF write. `plan` and `aggregate` are the monorepo pair (#135): `plan` detects deterministic package boundaries and builds the immutable brief each package sub-agent receives, and `aggregate` collects the per-package results a coordinator's sub-agents returned into one honest summary and the shared root workspace manifest that federates their bundles. `discover` (#142) scans the active project and classifies every candidate source document it finds — `markdown` (a direct parse target: UTF-8 text with compatible optional frontmatter), `unsupported` (a recognised format the migration will not interpret: HTML, PDF, Word, MediaWiki, or Obsidian wikilinks/callouts/Dataview), `other` (not a candidate document format), or `ambiguous` (the evidence on hand does not settle it, carrying a question for the user rather than a guess) — so the migration's compact question round is built from an honest inventory instead of file-by-file guessing. `migration-plan` (#144, #145) turns that inventory into a fully-determined migration plan: every source gets an intentional disposition — `migrate`, `skip`, `residue`, or `blocked_pending_decision` — a `migrate` source gets a type (preserved, deterministically mapped, or approved) and the concept path that type's own canonical directory implies, and a source lands on `blocked_pending_decision` only when its disposition genuinely cannot be inferred, each carrying the one question that would resolve it; feeding the same call `payload.answers` resolves those questions into a plan `data.plan.executable: true`, structurally never before every question is answered. It also carries each `migrate` source's own explicit provenance and link-rewritten body, the deterministic evidence-retention path for each `residue` source, and, for every `migrate` source, whether it must (or, below the target, may on request) receive split review (#200/#201 task 1) against the bundle's own effective `max_words_per_file`, plus — for a source under review — its bound content identity, its derived sections with their 1-based inclusive line ranges, and, once the caller supplies its own accounting of those sections, whether the ranges cover the complete source once with one disposition each (#200/#201 task 2), refusing an accounting with a gap, an overlap, a doubly assigned range, or a cut inside a visible Markdown block rather than repairing it. `partition` (#146) turns an executable migration plan into the dynamic semantic partitioner and delegated worker protocol: it groups `migration-plan`'s own `migrate`/`residue` entries into shards by directory locality (a heuristic file-count threshold splits a shard only once locality alone can no longer keep it small), builds the exact narrow, immutable brief a fresh-context worker receives for its own shard, surfaces a link between two sources landing in different shards as a `cross_shard_link` warning rather than ever losing it, and, in its other payload shape, validates a worker's returned shard against the brief it was given. `assemble` (#147) combines every validated shard — read from the staging file each one was written to, never re-embedded in this operation's own payload — into the one staged bundle: a source path two different shards both claim is refused outright, a concept path two different shards' own concepts both claim blocks the whole call (`CONCEPT_TARGET_COLLISION`) rather than ever renaming, merging, or overwriting either one, an exact cross-shard content duplicate at two different concept paths is surfaced as a non-blocking candidate, a `cross_shard_link` `partition` reported is resolved once its target concept made it into the assembled set or named as a migration-caused relationship loss when it did not, and a shard's own carried-forward `blockers` mark the result `partial` — staged and reported, never published — rather than blocking assembly outright. `migration-validate` (#148) is the pre-publish gate for whatever `assemble` staged: it reuses the exact same conditional-obligation checks (`sources[].resource`, `generated[].by`, an `Attested Computation`'s own `runtime`, human-prefix) the write gate already runs on a fresh concept, catches a nested `index.md`/`log.md` carrying concept frontmatter the same way an already-live bundle's own `okf-read validate` would, cross-checks every source `discover` found against the disposition its own migration plan actually recorded — never a raw file-count comparison — and never claims semantic fidelity on its own: that stays `false` until a human review is actually declared, however clean the rest of the check comes back. `publish` (#149) is the one operation that turns a validated staged bundle into real bundle concepts: for every staged concept, it builds an `okf-writer` delegation brief carrying that concept's staged frontmatter and body and dispatches it through `scripts/okf-delegate.js` — the identical process boundary a delegated sub-agent's own `create` call uses — so every promoted concept passes the exact same admission, evidence, and write-gate checks any other `okf-write` `create` call would; `publish` itself never writes a bundle concept directly. Before writing anything, it also delegates one `okf-reader` `validate` read through that same bridge to recheck the target bundle's own current state, so a bundle that stopped being viable to write into since `migration-validate` last ran is reported once, plainly, rather than once per staged concept. `report` (#136) turns the migration's own signals — what was migrated, skipped, left ambiguous, or retained as residue, plus link and provenance facts and whether a human reviewed semantic fidelity — into the structured statistics and thresholds behind the post-setup analytics report; it never reads the bundle itself and never writes anything, and rendering its structured data as the Markdown report the user sees is this file's procedure, not the runtime's. None of the twelve accepts a delegation brief, and none runs automatically; every one is a direct, explicit invocation, and no other skill reaches any of them on a caller's behalf. `publish` is the one operation among them that *invokes* the delegation bridge, as a caller — building briefs and dispatching them to `scripts/okf-delegate.js` exactly as any other bridge caller would — which is a different thing from accepting one: `okf-setup` still carries no role in `scripts/lib/delegation.js`'s `ROLES` map and no entry in any adapter manifest's `bridge.skills` (#137's decision stands unchanged). None of the twelve ever spawns or prompts a sub-agent, `partition` and `assemble` included — building a worker's brief, and combining what workers already returned, are both deterministic runtime work, but actually launching the fresh-context worker a brief describes is this file's own procedure (step 9 below), never the runtime's.

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
    "bundle": "<optional bundle directory name, defaults to \"okf\">"
  }
}
```

`payload.cwd` is the only required field. `payload.bundle`, when omitted, defaults to `okf`. `payload.project_mode` is not accepted here at all: `init` refuses any request naming it, `UNSUPPORTED_INPUT` with `{"gate": "project mode", "operation": "init"}`, whatever value is supplied — `project_mode` belongs entirely to the manifest bundle record `repair` writes (step 4), and the navigation-only root `init` writes has no field left to put it in.

When `init` creates a bundle root that did not exist yet, it also writes the **agent connector** (#170): the root body links to `agents/index.md`, `agents/index.md` is navigation only and links to `agents/okf.md`, and `agents/okf.md` is a `Playbook` concept carrying the stable suite rules an external skill needs — read through `okf-read`, prepare one complete proposal through `okf-lifecycle`, call `okf-write` once for each accepted concept, never edit a bundle file directly, treat every nested `index.md` as navigation, keep the type taxonomy open and never default to `Note`, cite only meaningful evidence, own no subtree, and find project-specific agent policy through the `agents` index. The connector holds no wrapper request schema and no executable harness configuration. An `init` call against a root whose `index.md` already exists never adds it: an existing bundle gets the connector through setup's target-tree proposal instead.

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

`inspect` is read-only: it never writes anything, and it reports on the two config files `/setup` bootstraps regardless of their current state, including a state it cannot yet act on. It answers with `result: "ok"` and one entry per file under `data`:

- `data.index_md` — `{ "state": "ok" }`, `{ "state": "missing" }`, or `{ "state": "invalid", "reason": "<string>" }`, computed with the same parser `init` writes against, so the two never disagree on what counts as valid.
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
    "targets": ["manifest"],
    "bundle": "<optional bundle directory name, defaults to \"okf\", used for the manifest template>",
    "manifest": "<optional hand-authored manifest object, for a monorepo>",
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>",
    "project_mode": "<\"code-backed\" or \"knowledge-only\", required when payload.manifest is omitted — every bundle record the deterministic template generates must declare one>"
  }
}
```

`payload.targets` is required: a non-empty array naming `manifest` to repair, with no duplicates and no other values — anything else returns `UNSUPPORTED_INPUT` before the file is touched. `repair` never touches `index.md`; that repair is `init`'s, reached through its own wrapper call. The `manifest` file:

- Writes `.okf-workspace.json` at the Git root, unless it is already the valid file `inspect` would report as `ok`, in which case nothing is written and `payload.manifest`, `payload.workspace_id`, or `payload.project_mode`, if supplied, are ignored. Otherwise, when `payload.manifest` is supplied, it is written only after it passes the same validator `inspect` checks against — a failure returns `UNSUPPORTED_INPUT` and writes nothing, and the hand-authored object must declare its own `project_mode` on every bundle record directly; `payload.project_mode` is not consulted for this path. When `payload.manifest` is omitted, `repair` generates the single-bundle template named by the resolution this operation implements: `name` the basename of the Git root, `root` the bundle directory from `payload.bundle` (or `okf`), `okf_version: "0.2"`, `project_mode` from `payload.project_mode`, and `workspace_id` either `payload.workspace_id` (when the caller is keeping a salvaged value) or a fresh UUIDv4. The manifest grammar requires a non-empty `project_mode` on every bundle record (#196): omitting `payload.project_mode` here still reaches the validator, which reports it as `UNSUPPORTED_INPUT` with an `invalid_field_combination` finding rather than writing a bundle record with no mode — ask the user for `code-backed` or `knowledge-only` before this call, never after.

The response names `applied` when the target was actually written, `no-op` when the manifest was already `ok`, or `blocked` with `data.code` when the request itself is unsupported. `data.manifest` carries `written: true|false`; a written manifest also echoes the `workspace_id` it used.

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
    "workspace_id": "<optional UUIDv4 to keep, e.g. salvaged from a previous manifest>",
    "project_mode": "<\"code-backed\" or \"knowledge-only\", required — every bundle record data.manifest generates must declare one>"
  }
}
```

`aggregate` is read-only: it never writes the manifest itself. `payload.results` must name every package the same deterministic detection `plan` used still reports, exactly once each, and no other package — a result naming an unknown package, a missing package, or a duplicate is `UNSUPPORTED_INPUT` before anything is computed, so a failed package can never be silently dropped from the report. Each result is `{"status": "ok"}` or `{"status": "failed", "reason": "<string>"}` (a `reason` on an `"ok"` result, or a missing one on a `"failed"` result, is also `UNSUPPORTED_INPUT`), plus an optional `warnings` array of strings either way. `payload.project_mode`, exactly like `repair`'s own, is required to build `data.manifest`'s bundle records (#196): a missing or unrecognized value is `UNSUPPORTED_INPUT` before anything is computed, never a manifest with a bundle record missing its mode.

The response is `result: "ok"` with:

- `data.status` — `"complete"` only when every named package succeeded, `"partial"` when at least one failed. This operation never reports `"complete"` while a package failed.
- `data.packages` — one entry per package, each carrying its `status`, `reason` (`null` for a succeeded package), and `warnings`.
- `data.failed` — the alias of every failed package, named plainly rather than left for the caller to recompute.
- `data.manifest` — the shared root workspace manifest that federates every package's bundle: one repository entry for the workspace root, plus one more per package with its own Git repository (a submodule); one bundle entry per package, each declaring `okf_version: "0.2"` and the shared `payload.project_mode` (#197: the grammar carries no separate `required`/`mode` field anymore — every declared bundle is required and source by construction), owned by its own repository (submodule) or by the workspace root at its package-relative path. Every detected package gets a bundle entry regardless of whether its worker succeeded — a package whose worker failed simply has no bundle on disk yet, which is exactly the existing required-but-not-active case the workspace-federation health check already reports as `degraded`, not silently dropped. This manifest is not written by `aggregate`: pass it as `repair`'s `payload.manifest` to actually persist it, the one place, after every worker has finished, that the shared manifest is ever written.

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

`discover` is read-only: it never writes anything. Unlike `inspect`/`repair`/`plan`/`aggregate`/`report`/`partition`/`admit`, it does not bypass the manifest activation gate — it scans an already-active bundle's project, so it needs the bundle root to exist to know what to exclude from its own scan, and it only makes sense once `init`/`repair` have already run. `cwd` outside any Git repository, or an inactive or invalid manifest, answers the same as every other operation on an inactive bundle: `not-configured` or `blocked` with `MANIFEST_INVALID`, nothing scanned.

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
    "answers": "<optional, {\"<source path>\": \"<answer>\"} for each question data.questions still names, once the user has decided>",
    "split_requested": "<optional array of source paths, each already named in payload.sources, that the user wants split review for even though it is at or below the effective target>",
    "split_sections": "<optional array of accountings, one per source under split review: {\"path\", optional \"source_identity\", \"sections\": [{\"line_start\", \"line_end\", \"disposition\", optional \"output\", optional \"order\"}]}>",
    "split_proposals": "<optional array of complete keep-as-one or split proposals, one per reviewed source>"
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

`data.split_review` (#200/#201 task 1) — one entry per `migrate`-disposition source, `{ "path", "word_count", "review_required", "review_reason" }`: `word_count` counts the source's whole raw file, frontmatter and code included, with `scripts/lib/words.js`'s own rule (a Markdown mark is never a letter or number, so it is never counted). `review_reason` is `"above_target"` when `word_count` exceeds `data.settings.max_words_per_file`, `"user_requested"` when it does not but the source's own path is named in `payload.split_requested`, or `null` when neither holds. `review_required` is `true` only for `"above_target"` — the one case #200 makes mandatory; `"user_requested"` (and `"semantic_boundaries"`, reserved for a later task's semantic-boundary detector, not produced by this operation) is a *permitted* review, never forced. Exceeding the target never blocks this call, never fails an untouched source, and never affects `data.plan.executable` — it is advisory only, surfaced for the split-review proposal a later task builds on top of it.

**Source accounting (#200/#201 task 2).** Every `data.split_review` entry also carries `source_identity` — `"sha256:<hex>"` over the source's whole raw bytes — which is the identity #200's accepted proposal binds, so a source edited afterwards can be caught before transformation or publication rather than after. An entry under review (`review_reason` is not `null`) additionally carries `line_count` and its derived `sections`; an entry not under review carries `accounting_status: "not_required"`, `line_count: 0`, and no sections, because #200's default stands for it: one source, one concept. #200 opens a split only through review, so an accounting supplied for a source no trigger opened is refused (`SPLIT_SOURCE_NOT_UNDER_REVIEW`) and still nothing is sectioned for it — put the source under review first, by exceeding the effective target or by naming it in `payload.split_requested`. Each section also carries `boundary_excerpt: { "first", "last" }`: the first and last non-blank line in its range, trimmed and limited to 120 characters, for the split-review view.

Each section is `{ "index", "kind", "heading_path", "line_start", "line_end", "word_count", "boundary_excerpt", "disposition", "output", "output_order" }`. **Line numbers are 1-based and inclusive at both ends** — `{"line_start": 6, "line_end": 11}` holds lines 6 through 11, six lines. `kind` is `"frontmatter"` (the source's own frontmatter block), `"preamble"` (#200's "content before the first heading forms a section"), or `"heading"` (#200's normal unit: a heading and its content, ending at the next heading of any level). `heading_path` carries the hierarchy the flat list itself does not (`["Title", "Details"]` for a `##` under a `#`); a `#` inside a fenced code block is never a heading. **Only ATX headings (`# Title`) are recognised** — a setext heading (`Title` over a row of `=` or `-`) is not, so a setext-headed source derives as one `preamble` section and can be divided only by the block-boundary fallback below. That is a declared limit, not an oversight: telling a setext underline from a thematic break needs the full CommonMark decision this runtime deliberately does not implement, and guessing it would mis-section a source silently. The derived ranges always cover the complete source once, in source order, with no gap and no overlap. Derivation is deterministic and read-only — it decides nothing about outputs, and it never proposes a division on its own.

`payload.split_sections`, when supplied, is the caller's own accounting of a source under review, after the user has decided it: one entry per source (a repeated `path` is `UNSUPPORTED_INPUT`), each with the exact ranges and the one disposition each range takes — `"assigned"` with a non-empty `output` naming the receiving output, or `"residue"` (left at the source path), with no third option and no default. `order`, legal only on an `"assigned"` section, states that section's explicit position within its output. A section shape that is anything else — a non-integer line number, a missing or unknown `disposition`, an `"assigned"` section with no `output`, a `"residue"` section carrying `output` or `order`, an empty `sections` array — is `UNSUPPORTED_INPUT` before anything is computed. `data.split_review[].outputs` reports each output's own accepted section order: `{ "output", "order_explicit", "sections": [{"line_start", "line_end"}] }`, with the sections in exactly the order that output takes them, source order when `order_explicit` is `false` (#200's default) and the declared order when it is `true`. Non-adjacent sections in one output are ordinary, and `data.split_review[].sections[].output_order` gives each section its own position in its output.

`accounting_status` is `"not_required"` (not under review, none supplied), `"derived"` (sections derived, nothing disposed yet), `"complete"` (the supplied accounting covers the complete source once, one disposition each, one accepted output order), or `"refused"` (at least one blocking finding below). A refused accounting is never repaired: no range is moved, merged, extended, or dropped to make it fit, and the caller supplies a corrected complete accounting instead (#200: "Any change creates one new complete proposal. Setup does not apply a partial patch to an old proposal"). Each blocking finding names the exact defect, and each carries `detail.path`:

- `SPLIT_COVERAGE_GAP` (`line_start`, `line_end`) — those lines have no disposition at all. Nothing is silently dropped, including a tail past the last supplied range.
- `SPLIT_COVERAGE_OVERLAP` (`line_start`, `line_end`) — those lines are disposed of more than once.
- `SPLIT_SECTION_ASSIGNED_TWICE` (`line_start`, `line_end`, `count`) — the identical range appears more than once, reported as exactly that rather than as a generic overlap.
- `SPLIT_SECTION_RANGE_INVALID` (`line_start`, `line_end`, `line_count`) — the range is not inside the source at all. It is reported alone: the rest of the coverage arithmetic is meaningless against a range the file does not have.
- `SPLIT_SECTION_BOUNDARY_INVALID` (`line`, `edge`) — a section begins or ends inside a visible Markdown block. `line` is always the line that would have to begin a section: the range's own `line_start` for `edge: "start"`, and the line just past its `line_end` for `edge: "end"`. #200 allows a heading holding several concepts to be divided at a paragraph, list, table, or code-block boundary, and never inside one of those blocks; a boundary landing inside a fence, a table, or a list is refused rather than quietly moved to the nearest legal line.
- `SPLIT_SECTION_SPANS_HEADING` (`line_start`, `line_end`, `heading_line`) — one range swallows a further heading. A heading and its content are one section, so several headings reaching one output are listed as several sections sharing an `output`, never merged into one range. #200 does not settle this row in so many words; refusing is this runtime's own reading of it, chosen because a merged range has no single heading path and #200 defines the unit exactly. It refuses with an exact finding rather than guessing either way, so the row stays open for a later decision to reopen.
- `SPLIT_OUTPUT_ORDER_INCOMPLETE` (`output`) — some of that output's sections declare `order` and some do not. Source order is the default and any other order is explicit, so a half-declared order is refused rather than completed here.
- `SPLIT_OUTPUT_ORDER_INVALID` (`output`, `orders`) — the declared positions are not exactly one per section, counting from 1.
- `SPLIT_SOURCE_CHANGED` (`expected`, `actual`) — `source_identity` was supplied and no longer matches the source on disk. #200: a source change invalidates the proposal before transformation or publication. It is reported alone, with the accounting dropped rather than measured — ranges built against the old bytes say nothing about the new ones — and the entry still carries the current source's own derived sections, so the corrected accounting can be built from the response that refused the stale one.
- `SPLIT_SOURCE_NOT_UNDER_REVIEW` — the accounting names a `migrate` source no split trigger opened. Refused; #200 opens a split only through review.
- `SPLIT_SOURCE_UNKNOWN` — the accounting names a path this plan has no `migrate` entry for. Refused, never quietly discarded.

A blocking split finding refuses the accounting only: the plan itself is untouched, the source keeps its own `migrate` disposition, and `data.plan.executable` keeps its own meaning (every source has a disposition), exactly as exceeding the word target does.

**Complete split proposal (#200/#201 task 3).** `payload.split_proposals` is an optional array with one complete proposal per reviewed source. Each entry has these exact fields:

- `path`; `result: "keep_as_one"|"split"`; `keep_as_one_reason` (non-empty for keep-as-one, otherwise `null`); and `accepted`.
- `outputs`: one or more complete rows with `output` (the exact opaque key from `payload.split_sections`), `concept_id`, `path` (`concept_id + ".md"`), `type`, `title`, `heading_outline: [{"level", "text"}]`, `reader_purpose_group`, `provenance_assignments`, `link_routes`, and `anchor_routes`. Keep-as-one has exactly one output. Split has at least two. Both use this same shape. Each output is one semantic concept, never a fixed-size fragment.
- `reader_purpose_group` is `null` for a root output, or `{ "key", "purpose", "index_entry": {"path", "title"}, "child_entry": {"concept_id", "path", "title", "order"} }`. A root output path has no directory. A grouped output is directly under its group key, and the group index is `<group>/index.md`. Outputs from one source can use different groups.
- `provenance_assignments` rows are `{ "source_index", "support": "supported"|"unclear" }`; `source_index` indexes only the source's authored `data.mapping[].sources`. The response adds that exact entry as `source`. The observed migration path is evidence and is never inserted here. `provenance_exclusions: [{"source_index", "reason"}]` gives an explicit reason for each authored entry assigned to no output. An unclear, missing, conflicting, or out-of-range decision blocks acceptance.
- `link_routes` rows are `{ "from", "line", "occurrence", "resource", "target" }`. `anchor_routes` rows are `{ "from", "line", "occurrence", "resource", "source_anchor", "line_start", "line_end", "target_anchor" }`; their source range must be ordered and belong to that output. `line` and `occurrence` identify the exact parsed Markdown link in its source file.
- `heading_changes` lists every changed or removed source ATX heading. A changed row is `{ "line", "source_heading", "action": "changed", "output", "target_heading", "target_level", "target_anchor" }`. A removed row has `action: "removed"`, names its owning `output`, and has `target_heading: null, target_level: null, target_anchor: null`. Every source heading assigned to an output must either stay in the output outline with the same level and text or have exactly one change row. A changed heading must appear in the output outline at `target_level`, `target_anchor` must be the anchor derived from `target_heading`, and every known inbound heading-anchor link must have a matching route to that anchor.
- `whole_source_link_routes` rows are `{ "from", "line", "occurrence", "resource", "target" }`. `target` is `{ "kind": "output", "output": "<output key>" }` or `{ "kind": "group_index", "group": "<group key>" }`. `target: null` exposes an unresolved whole-source link but blocks acceptance. The runtime never selects a primary output.

When Task 2 first reports `accounting_status: "complete"` and the caller supplies no `split_proposals` entry, the runtime derives the first complete proposal view from that accounting, exact existing `data.mapping` identity/type fields, current source ATX headings, links in the source, inbound links from all discovered project and bundle-root Markdown files, unsplit migration targets, and current files under the bundle root. A source heading is boundary evidence only: it never supplies a title, output outline, group, concept identity, placement, or target anchor. Values not settled by `data.mapping` are `null`, empty, or `"unclear"` and each produces an exact blocking finding. Thus the first complete-accounting response is renderable with `proposal.status: "refused"`, never `proposal: null`.

The runtime returns the validated value at `data.split_review[].proposal` with `status: "ready"` when valid but not accepted, `"accepted"` when valid and input `accepted` is true, or `"refused"` when a blocking proposal finding exists. Response `accepted` is derived: it is true only for a valid proposal whose input says true, and is always false on refusal. `known_routes` is the deterministic complete route inventory (`whole_source`, `heading_anchor`, `ordinary`). It includes local same-source anchors such as `#operate`, links from source content, bundle-root files, and all other discovered Markdown files. Links inside residue stay at the source and are not output-route requirements. Every known route must appear exactly once, and an extra or duplicate route refuses acceptance. `known_headings` contains only actual ATX heading lines; a Task 2 block-boundary fragment retains its `heading_path` but does not create a heading row. If duplicate headings make an anchor ambiguous, all heading rows and one route row with `candidate_lines` remain visible, while acceptance is blocked. It derives `proposal.tree` as `{ "root": [{"concept_id", "path", "title"}], "groups": [{"key", "purpose", "index_entry", "child_entries"}], "unresolved": ["<output key>"] }`; `unresolved` keeps an initial output visible until semantic placement is supplied. The parent split-review row supplies the source path, effective target through `data.settings.max_words_per_file`, source word count, review reason, identity, complete sections, heading paths, line ranges, boundary excerpts, dispositions, and output order. The proposal supplies every output, route, heading change, group purpose, index, and child entry.

All proposal findings block and carry `detail.path`:

- `SPLIT_PROPOSAL_ACCOUNTING_INCOMPLETE` (`accounting_status`), `SPLIT_PROPOSAL_OUTPUT_MISMATCH` (`accounted`, `proposed`), and `SPLIT_PROPOSAL_RESULT_INVALID` (`result`, `outputs`).
- `SPLIT_PROPOSAL_TARGET_COLLISION` (`output` or `group`, `concept_id` when applicable, `target_path`), `SPLIT_PROPOSAL_TARGET_INVALID` (`output` or `group`, `target_path`), and `SPLIT_PROPOSAL_PLACEMENT_INVALID` (`output`, `group`, `target_path`).
- `SPLIT_PROPOSAL_GROUP_CONFLICT` (`group`, and when applicable `order` or `output`).
- `SPLIT_PROPOSAL_VALUE_UNRESOLVED` (`field`, and when applicable `output`) marks an initial-proposal value the runtime cannot derive safely.
- `SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE` has `reason: "walk_incomplete"` when the project Markdown walk is partial, or `reason: "read_failed"` and `from` when a discovered Markdown file cannot be read. The runtime never treats a partial route set as complete.
- `SPLIT_HEADING_ANCHOR_AMBIGUOUS` (`from`, `line`, `occurrence`, `resource`, `source_anchor`, `candidate_lines`) retains an inbound anchor route whose duplicate-heading target cannot be bound without a settled repository anchor convention. The runtime does not guess a suffix.
- `SPLIT_PROVENANCE_ASSIGNMENT_MISSING` (`source_index`), `SPLIT_PROVENANCE_ASSIGNMENT_UNCLEAR` (`output`, `source_index`), and `SPLIT_PROVENANCE_ASSIGNMENT_INVALID` (`source_index`, and when applicable `output`).
- `SPLIT_PROPOSAL_ROUTE_MISSING`, `SPLIT_PROPOSAL_ROUTE_EXTRA`, and `SPLIT_PROPOSAL_ROUTE_DUPLICATE` (`route_kind`) enforce exact route coverage. `SPLIT_PROPOSAL_ROUTE_TARGET_INVALID` (`route_kind`) rejects a target that differs from the known ordinary target or accepted heading-anchor target.
- `SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS` (`from`), `SPLIT_WHOLE_SOURCE_LINK_ROUTE_INVALID` (`from`), `SPLIT_HEADING_CHANGE_MISSING` (`output`, `line`), `SPLIT_HEADING_CHANGE_DUPLICATE` (`line`), `SPLIT_HEADING_CHANGE_INVALID` (`output`, `line`), and `SPLIT_HEADING_CHANGE_NOT_OWNED` (`output`, `line`).
- `SPLIT_PROPOSAL_SOURCE_UNKNOWN` when `path` is not a `migrate` source in this plan.

A malformed `split_proposals` shape, including a reversed anchor range, is `UNSUPPORTED_INPUT`. Target uniqueness is checked across every proposal in the call, every normal unsplit `migrate` output, every group index, and every file already visible under the bundle root. Any user adjustment sends one new complete `split_sections` and `split_proposals` value. The runtime never applies a partial patch and stores no accepted proposal between calls. Transformation starts only on `proposal.status: "accepted"`.

`payload.answers`, when supplied, is a plain object keyed by source path. Every key must still name a question this same `payload.sources` produces and every value must be one of that question's own closed `options` (or, for `"type"`, a non-empty string) — an answer naming a question that is not open, or a value outside the question's own options, is `UNSUPPORTED_INPUT` before anything is computed, never guessed past or silently ignored. Answering only some of the open questions resolves exactly those and leaves the rest open; there is no requirement to answer everything in one call, only no ability to treat the plan as executable until every question is. `payload.split_requested`, when supplied, must be an array of non-empty strings — anything else is `UNSUPPORTED_INPUT` before anything is computed; a path it names that is not a `migrate` source simply has no matching `data.split_review` entry to affect (unlike `payload.split_sections` or `payload.split_proposals`, which refuses an unknown path rather than ignoring it: a request for review that lands nowhere costs nothing, an accounting or proposal that lands nowhere would look validated). This operation is a pure function of `payload.sources`, `payload.answers`, `payload.split_requested`, `payload.split_sections`, `payload.split_proposals`, and the current bytes of the sources it reads — nothing is stored between calls — so calling it again with the same inputs and unchanged sources always reproduces the same plan, `data.mapping`, `data.references`, `data.plan.duplicates`, and `data.split_review`, proposal, section ranges, and `source_identity` included (#131's idempotency without resumability). Nothing carries an accepted accounting or proposal from one call to the next: each call re-derives and re-validates whatever this call was given.

Like `discover`, `migration-plan` does not bypass the manifest activation gate: it needs the bundle root to already exist to check a candidate target path for a collision. `cwd` outside any Git repository, or an inactive or invalid manifest, answers the same as `discover` does on an inactive bundle: `not-configured` or `blocked` with `MANIFEST_INVALID`, nothing derived.

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
      { "path": "docs/decisions/use-postgres.md", "concept": "decisions/use-postgres", "type": "Decision", "sources": null, "source_identity": "sha256:<hex>", "body": "# Use Postgres\n" }
    ],
    "references": [],
    "split_review": [
      {
        "path": "docs/decisions/use-postgres.md",
        "word_count": 3,
        "review_required": false,
        "review_reason": null,
        "source_identity": "sha256:<hex>",
        "line_count": 0,
        "sections": [],
        "outputs": [],
        "accounting_status": "not_required",
        "proposal": null
      }
    ]
  }
}
```

`partition` (#146) is read-only: it never writes anything, never reads a source file, and never spawns or prompts a sub-agent — building a worker's brief is deterministic runtime work; launching the fresh-context worker that brief describes is step 9's job, not this operation's. It accepts exactly one of two payload shapes; naming both, or naming neither, is `UNSUPPORTED_INPUT` before anything is computed, the same discipline `report` already applies to its own two shapes.

**Compute mode** — `payload.plan`, `payload.mapping`, `payload.references`, and `payload.split_review` (required together): exactly `migration-plan`'s own `data.plan` (`{entries, executable}`), `data.mapping`, `data.references`, and complete `data.split_review`, unmodified. `payload.plan.executable` must be `true` — this operation partitions an already fully-determined plan, it never resolves an open question itself, so a plan still carrying a `blocked_pending_decision` entry is `UNSUPPORTED_INPUT`. `payload.mapping`/`payload.references` must correspond, one-for-one, to `payload.plan.entries`' own `migrate`/`residue` sources and their own approved `concept`/`type`. `payload.split_review` must correspond one-for-one to the `migrate` sources. A row not under review has `accounting_status: "not_required"` and `proposal: null`; every reviewed row must have `accounting_status: "complete"`, `proposal.status: "accepted"`, and `proposal.accepted: true`. A `keep_as_one` proposal has exactly one output and a `split` proposal has at least two. Each accepted output has a non-empty key and identity, owns at least one section, and appears in exact accepted order. The parent assigned sections and Task 2 output sections must match one-to-one by range, output owner, and order, with no duplicate range on either side. A mismatched, missing, invented, ready, refused, empty, or duplicate value is `UNSUPPORTED_INPUT` with one exact `SPLIT_WORKER_*` finding before anything is computed. `payload.max_sources_per_shard`, when supplied, must be a positive integer; it overrides the default heuristic threshold (`8`) named in `scripts/lib/partition.js` as `DEFAULT_MAX_SOURCES_PER_SHARD` — an implementation heuristic per #131, never contract.

The response is `result: "ok"` with:

- `data.shards` — one entry per shard: `{ "shard", "sources", "brief" }`. `shard` is a human-readable label — the longest directory prefix shared by that shard's own sources, deduplicated with a `#2`/`#3` suffix on a repeat (a directory the file-count fallback split further). `sources` is that shard's own source paths. `brief` is the exact narrow, immutable context a fresh-context worker for this shard receives (#131 section 11) and nothing more: `shard` (its own id, to echo back), `cwd`, `bundle`, `project_mode`, `okf_version` (the authoring contract's own version tag, `"0.2"` — no corpus, no authoring prose duplicated from the contract, exactly as `plan`'s own package brief already treats it), `sources` (its own assigned source paths), `mapping` (the slice of `payload.mapping` for its own `migrate` sources), `references` (the slice of `payload.references` for its own `residue` sources), `split_review` (the unchanged rows for its own `migrate` sources), and `neighbors` — the target concept path for every link this shard's own sources make into a concept another shard owns, so the worker can still author a correct reference to a concept it will never hold the content of.
- `data.cross_shard_links` — `{ "from", "to", "from_shard", "to_shard" }` for every link between two migrating concepts that landed in different shards. Grouping by directory locality keeps a linked pair together whenever they already share a directory; when they do not, the link is never silently dropped — it is surfaced here, and as a non-blocking `cross_shard_link` finding, exactly the "report the cross-shard link as a warning" half of #131's two sanctioned responses to a split link.
- `data.max_sources_per_shard` — the threshold this call actually used, named plainly rather than left for the caller to recompute.

Grouping is by directory locality first, refined one directory level deeper only when a group is still larger than the threshold, and falls back to plain file-count chunking only once a group can no longer be separated by directory at all — a corpus small enough to fit under the threshold in one shard always stays in one shard, whatever its own directory shape; fan-out only happens once the corpus itself is large enough to need it (#131: "fan-out scales with corpus size and semantic structure").

**Validate mode** — `payload.brief` and `payload.shard` (required together instead of the four compute-mode fields): `brief` is exactly one `data.shards[].brief` this same operation already produced, and `shard` is the candidate output a worker returned for it — `{ "shard", "concepts", "references", "warnings", "blockers" }`, no other field. For a source with `brief.split_review[].proposal: null`, `concepts` has the existing one `{ "path", "concept", "type", "body" }` row and its `concept`/`type` must match `brief.mapping`. For an accepted reviewed source, `concepts` has one row per accepted output, in accepted output order: `{ "path", "output", "concept", "type", "sections", "body" }`. `path` is the source path; `output` is the exact accepted output key; `concept` and `type` are the accepted proposal's `concept_id` and `type`; `sections` is the exact ordered `[{ "line_start", "line_end" }]` array from Task 2 `brief.split_review[].outputs`. The worker transforms only `body`. It cannot add, drop, rename, alter, or reorder an output, and it cannot add, drop, move, alter, or reorder a section range. A source-level `blockers` row cannot replace accepted outputs; that is the same `SHARD_SPLIT_OUTPUT_DROPPED` refusal. `references` is one `{ "path", "reference_path" }` per residue source it retained, matching `brief.references` exactly. `blockers` remains one `{ "path", "reason" }` per unsplit assigned source the worker could not resolve. `warnings` is a plain array of strings. Every source `brief.mapping`/`brief.references` assigned must appear in its exact accepted output set, `references`, or, for an unsplit source, `blockers` — nothing assigned may be silently missing.

The response is `result: "ok"`, `data: { "valid": true }` when the shard matches its own brief exactly. A shard that does not is `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"`, with exactly one blocking finding. Before worker-result checks, compute mode, validate mode, and `assemble` share these upstream findings: `SPLIT_WORKER_REVIEW_SET_MISMATCH` (`missing`, `extra`, `duplicate` source paths), `SPLIT_WORKER_REVIEW_INVALID` (`path`, `reason`), and `SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH` (`path`, `reason`, and `line_start`/`line_end` for a duplicate range). Existing codes remain `SHARD_MALFORMED`, `SHARD_UNKNOWN_FIELD`, `SHARD_IDENTITY_MISMATCH`, `SHARD_SOURCE_NOT_ASSIGNED`, `SHARD_CONCEPT_MISMATCH`, `SHARD_REFERENCE_MISMATCH`, `SHARD_DUPLICATE_ENTRY`, and `SHARD_INCOMPLETE`. Split worker-result codes are: `SHARD_SPLIT_OUTPUT_ADDED` (`path`, `output`), `SHARD_SPLIT_OUTPUT_DROPPED` (`path`, `output`), `SHARD_SPLIT_OUTPUT_CHANGED` (`path`, `output`, `field`, `expected`, `actual`), `SHARD_SPLIT_OUTPUT_REORDERED` (`path`, `output`, `expected_order`, `actual_order`), `SHARD_SPLIT_SECTION_ADDED` or `SHARD_SPLIT_SECTION_DROPPED` (`path`, `output`, `line_start`, `line_end`), `SHARD_SPLIT_SECTION_MOVED` (`path`, `line_start`, `line_end`, `expected_output`, `actual_output`), and `SHARD_SPLIT_SECTION_REORDERED` (`path`, `output`, `line_start`, `line_end`, `expected_order`, `actual_order`). Nothing absorbs or repairs the accepted review or worker result. This checks only accepted mapping identity and the shard envelope; Task 5 semantic preservation and Task 6 complete candidate conformance remain later gates.

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

Once collision-free, `assemble` writes one Markdown file per assembled concept and one navigation-only `index.md` per accepted reader-purpose group to `<Git root>/.okf-staging/<bundle>`. Concept staged rows keep `{ "path", "concept", "type", "shard", "file", "sources" }`; split rows also carry exact accepted output and section metadata. Each concept has exactly one source observation binding for this one-source migration. Index rows are `{ "kind": "index", "path", "file", "group" }`, where `group` carries the accepted purpose, index entry, and ordered child entries. The index bytes encode the accepted title, purpose, and ordered child links. `data.staging_dir` names the staging root, and `data.status` is `"complete"` only when no shard reported a blocker.

`assemble` never deletes a stale file left behind by an earlier call to the same staging directory. It is scratch space that `publish` reads and does not clear. Rerunning `assemble` after a source, answer, or shard output changed overwrites only the staged files produced by that call.

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
    "split_review": "<migration-plan data.split_review, unmodified>",
    "semantic_review": {
      "performed": false,
      "candidates": [
        { "path": "decisions/use-postgres.md", "identity": "sha256:<lowercase SHA-256 of the complete staged file>" }
      ],
      "sources": [
        {
          "path": "docs/decisions/use-postgres.md",
          "source_identity": "sha256:<data.split_review source_identity>",
          "accepted": {
            "sections": "<matching data.split_review sections, unmodified>",
            "outputs": "<matching data.split_review outputs, unmodified>",
            "proposal": "<matching accepted data.split_review proposal, unmodified>"
          },
          "sections": [
            { "line_start": 1, "line_end": 12, "verdict": "preserved" }
          ]
        }
      ]
    }
  }
}
```

`migration-validate` (#148, #201 Task 5) is the read-only validation seam for whatever `assemble` staged at `.okf-staging/<bundle>`, plus source-section semantic review and the semantic-fidelity disclosure #131 requires. It never writes anything, staged content included.

- **Structural, conformance, and link integrity.** Every staged concept is read back through the same shared reader and checked with `checkConcept` — the identical conditional-obligation rules the write gate already runs on a fresh concept: non-empty `type`, `sources[].resource`, `generated[].by`, an `Attested Computation`'s own `runtime`, and the human-prefix rule on `author`/`confirmed`. A nested `index.md`/`log.md` carrying concept frontmatter — reserved navigation is never a concept, at any depth — is caught the same way an already-live bundle's own `okf-read validate` call would catch it. A broken link warns rather than blocks, because upstream permits it (#131).
- **Completeness.** `payload.plan` is exactly `migration-plan`'s own `data.plan` (`{entries, executable}`), and `payload.plan.executable` must be `true` — the same requirement `partition` already has, for the same reason: this operation validates a corpus already fully decided, never one still carrying an open question. Raw file-count parity is never the measure (#131), most visibly for a `code-backed`-filtered source deliberately never migrated: a `skip`-disposition entry with a real reason satisfies completeness exactly as intentionally as a `migrate` one. What no single plan can see on its own is a source that fell off it entirely — an entry simply never recorded — so `payload.selected` (every source `discover` actually found this run) is cross-checked against `plan.entries`' own paths independently; a `selected` path with no matching entry names a `SOURCE_DISPOSITION_MISSING` finding rather than passing unnoticed.
- **Agent semantic review.** When `payload.split_review` contains an accepted proposal, pass it unmodified and extend the existing `payload.semantic_review` value with `candidates` and `sources`. `candidates` is the exact current staged Markdown set the reviewer received, without a claim that this set conforms to the proposal; each row binds the complete staged file bytes with `identity: "sha256:<lowercase digest>"`. `sources` has exactly one row per accepted reviewed source. Each row binds `path`, the exact `source_identity`, and `accepted: { sections, outputs, proposal }` copied unmodified from that source's `data.split_review` row. Its `sections` has exactly one `{ line_start, line_end, verdict }` row for every source section, including residue. The only verdicts are `preserved`, `missing`, `duplicated`, and `uncertain`; only `preserved` passes. Missing, duplicate, extra, malformed, or mismatched rows are refused. A changed source, accepted value, staged candidate, or candidate set is refused as stale. This check binds semantic-review evidence only; complete transformed-candidate conformance is Task 6 and is not claimed here.
- **Human semantic fidelity.** `payload.semantic_review.performed` remains the independent human-review declaration used by `report`. It is never inferred from structural coverage or agent review. A clean structural and agent result still answers `semantic_fidelity: { "assessed": false }`, with its own warning finding, unless a human review was declared.

The response is `result: "ok"` with `data.status`, `data.publishable`, `data.missing_disposition`, `data.concepts_checked`, and three separate flags: `data.structural_coverage: { "passed": true|false }`, `data.agent_semantic_review: { "passed": true|false }`, and `data.semantic_fidelity: { "assessed": true|false }`. It also returns `data.semantic_review`, the canonical checked binding: `{ "human_assessed": true|false, "candidates": [{ "path", "identity" }], "sources": [{ "path", "source_identity", "accepted": { "sections", "outputs", "proposal" }, "sections": [{ "line_start", "line_end", "verdict" }] }] }`. Candidates are sorted by path. Sources are sorted by path, and each source's verdict rows use accepted section order. Every identity and accepted value in this result was checked against current state; it is not an input echo. A non-preserved verdict adds `SEMANTIC_SECTION_MISSING`, `SEMANTIC_SECTION_DUPLICATED`, or `SEMANTIC_SECTION_UNCERTAIN` and makes `data.publishable` false. Bad evidence is `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"`, with `SEMANTIC_REVIEW_MALFORMED`, `SEMANTIC_REVIEW_SOURCE_SET_MISMATCH`, `SEMANTIC_REVIEW_SECTION_SET_MISMATCH`, `SEMANTIC_REVIEW_SOURCE_MISMATCH`, `SEMANTIC_REVIEW_ACCEPTED_MISMATCH`, or `SEMANTIC_REVIEW_CANDIDATE_MISMATCH`. An incomplete staged candidate scan is `SEMANTIC_REVIEW_CANDIDATE_SCAN_INCOMPLETE`; an unreadable staged candidate is `SEMANTIC_REVIEW_CANDIDATE_READ_FAILED`. Both block, and an incomplete scan reports `data.structural_coverage.passed: false`. Accepted review input is first checked through the shared Task 4 `validateSplitReviews` seam; malformed or duplicate accepted sources, ranges, ownership, order, output rows, or proposal rows use its exact blocking `SPLIT_WORKER_*` findings. Parent ranges must cover exact source lines `1..line_count` once in indexed source order; gaps, overlaps, and out-of-bounds ranges are `SPLIT_WORKER_SECTION_ACCOUNTING_MISMATCH` with reason `coverage_gap`, `coverage_overlap`, or `coverage_bounds`. Accepted provenance assignments and exclusions must contain their Task 3 bound `source`. The shared structural reader reports blocking `BUNDLE_SCAN_INCOMPLETE` with `{ "reason": "incomplete_listing" }` when its own file scan is incomplete; this makes structural coverage false independently of the later candidate-binding scan. This operation never recomputes `report` statistics or renders prose.

`migration-validate` runs no admission and no write gate at all — like `partition`/`assemble`, it only reads and computes, requiring nothing more than a Git repository to resolve `cwd` against (otherwise `not-configured`); an absent staging directory (a migration that selected nothing to `migrate`/`residue`) is an empty bundle to check, never a read failure.

### `publish`

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-setup",
  "operation": "publish",
  "task_kind": "feature work",
  "payload": {
    "cwd": "<absolute path to the working tree>",
    "bundle": "<optional bundle directory name, defaults to \"okf\">",
    "task_kind": "feature work",
    "staged": [
      { "path": "docs/decisions/use-postgres.md", "concept": "decisions/use-postgres", "type": "Decision", "shard": "docs/decisions", "file": ".okf-staging/okf/decisions/use-postgres.md", "sources": [{ "path": "docs/decisions/use-postgres.md", "sha256": "<lowercase SHA-256 of that file>" }] }
    ],
    "plan": { "entries": [{ "path": "docs/decisions/use-postgres.md", "disposition": "migrate", "reason": "type_preserved", "concept": "decisions/use-postgres", "type": "Decision" }], "executable": true, "duplicates": [] },
    "mapping": [{ "path": "docs/decisions/use-postgres.md", "concept": "decisions/use-postgres", "type": "Decision", "sources": null, "source_identity": "sha256:<hex>", "body": "# Use PostgreSQL\n" }],
    "split_review": [{ "path": "docs/decisions/use-postgres.md", "accounting_status": "not_required", "proposal": null }],
    "semantic_review": { "human_assessed": false, "candidates": [], "sources": [] }
  }
}
```

`publish` (#149, #201 Task 6) is the only publication authority after Task 5 and the only operation in this skill that reaches the real bundle. It requires `assemble`'s complete `data.staged`, `migration-plan`'s exact `data.plan`, `data.mapping`, and accepted `data.split_review`, and `migration-validate`'s canonical checked `data.semantic_review`. Do not rebuild or narrow these values. A malformed or incomplete boundary value is `UNSUPPORTED_INPUT`. `payload.task_kind` must be `feature work`, `fix`, or `research`; anything else is `TASK_KIND_NOT_WRITE_ELIGIBLE`.

`publish` never writes a concept itself. For every entry in `payload.staged`, it:

1. Resolves every staged file against `<Git root>/.okf-staging/<bundle>`, refuses a symlinked staging root, ancestor, or file, and reads each candidate once as canonical checked bytes. It proves exact one-to-one plan/mapping source and concept coverage, exact candidate path sets and counts, exact canonical review source and section coverage, every current source identity, actual concept frontmatter/body fields, actual authored provenance, actual group placement, and generated index title/purpose/ordered children. Route proof is a counted multiset per owning candidate: split outputs use accepted ordinary, heading-anchor, and whole-source routes; unsplit outputs use the accepted rewritten mapping body. Query and fragment suffixes are retained. A route in one candidate cannot satisfy another candidate's route. A value it cannot prove blocks; it never guesses.
2. Uses the exact checked bytes from step 1. Concept writes build the delegated `okf-writer` brief from the checked frontmatter tree and body without rereading staging. Navigation index writes use the checked index bytes. Immediately before each write, target containment is checked again and any symlinked target ancestor or escape blocks. Each concept carries exactly one accepted source observation binding, and its source bytes are reread in the final precheck before write 1.
3. Records that concept's delegation receipt. The first non-`clean` result stops the sequence. `data.published` lists successful earlier writes, `data.failed` names the one failed write, and `data.skipped` lists every later concept as `not-attempted`.

Immediately before write 1, after the delegated target-bundle read, `publish` reruns all three Task 6 checks against current bytes: every source identity, complete candidate-set equality, and canonical semantic-review freshness. `human_assessed` remains separate and cannot replace the agent review. Precheck codes include `PUBLISH_PLAN_MAPPING_MISMATCH`, `PUBLISH_CANDIDATE_SET_MISMATCH`, `PUBLISH_CANDIDATE_CHANGED`, `PUBLISH_CANDIDATE_SCAN_INCOMPLETE`, `PUBLISH_CANDIDATE_READ_FAILED`, `PUBLISH_SOURCE_CHANGED`, `PUBLISH_SEMANTIC_REVIEW_STALE`, `PUBLISH_ROUTE_MISMATCH`, `PUBLISH_PROVENANCE_MISMATCH`, `PUBLISH_INDEX_MISSING`, `PUBLISH_INDEX_CHANGED`, and `PUBLISH_STAGING_SYMLINK`. A precheck failure writes zero bundle files and a candidate/proposal mismatch requires one new complete proposal.

The response is `result: "ok"` with `data.status` (`complete` or `partial`), `data.candidate_conformance`, `data.published`, `data.failed`, `data.skipped`, `data.results`, and `data.publication_receipt`. `data.candidate_conformance` is the checked Task 6 candidate result: `{ "passed": true, "concepts": [{ "source", "concept", "path", "type" }], "navigation_indexes": [{ "path" }] }`. Concepts and navigation-only indexes stay separate. Results use one sequence: zero or more `clean` rows, at most one first non-clean attempted row, then only `not-attempted` rows. `complete` means every result is clean; `partial` means the sequence contains a failed or not-attempted row. A clean row after failure and a complete result with skipped rows cannot occur.

After the sequence ends, `publish` writes one suite-owned receipt at `.okf-staging/<bundle>/.okf-publication-receipt.json`. The receipt binds SHA-256 identities for the exact accepted plan, mapping, split review, and canonical semantic review; every checked candidate path, source, concept, type, and complete-byte identity; the single ordered result sequence; and its exact published/failed/skipped classification. `data.publication_receipt` is `{ "path", "identity" }` for those receipt bytes. The hash is an integrity check, not an authenticity proof. Independent evidence comes from Task 7 reading the fixed suite-owned file instead of trusting caller-supplied result JSON. Task 7 requires the receipt bytes, identity, artifacts, candidates, result order, and classification to match before it counts an output. A later Task 6 call replaces this one fixed receipt with that call's observed result.

`publish` runs no admission and no write gate of its own — like `assemble`/`migration-validate`, it never touches the bundle directly; every actual mutation happens one level down, inside the delegated `create` call that runs its own admission and write gate with full authority. The only precondition `publish` itself has is a Git repository to resolve `cwd` against (otherwise `not-configured`).

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

`report` is read-only: it never reads or writes the bundle. Legacy source/package reporting is pure classification over supplied signals. Task 7 additionally reads the suite-owned Task 6 receipt under the existing staging directory and refuses caller JSON that does not match it. Exactly one of three payload shapes is accepted: legacy `sources`, multi-package `packages`, or Task 7 `migration`. Naming more than one, or naming none, is `UNSUPPORTED_INPUT` before anything is computed.

**Task 7 migration mode** — `payload.migration` has these exact fields:

- `settings`: exact accepted `migration-plan` `data.settings`, with effective `max_words_per_file`.
- `plan`: exact accepted `migration-plan` `data.plan`.
- `mapping`: exact accepted `migration-plan` `data.mapping`.
- `split_review`: exact final accepted `migration-plan` `data.split_review`, unmodified.
- `validation`: `{ "structural_coverage", "agent_semantic_review", "semantic_fidelity", "semantic_review" }` from the same valid `migration-validate` response. `semantic_review` is its canonical checked result, not the submitted review input.
- `publication`: exact successful Task 6 `publish` `data`, including `candidate_conformance`, `published`, `failed`, `skipped`, `results`, and `publication_receipt`.

The runtime strictly validates every boundary and every cross-artifact identity. It checks exact accepted plan-to-mapping coverage, the accepted split-review shape, effective setting, source report fields, canonical semantic source identity and section coverage, agent-review flag, separate human-assessed flag, candidate-conformance concepts and navigation indexes, checked candidate byte identities, accepted reviewed outputs, exact unreviewed mapping identity, sequential result semantics, and the receipt-backed publication classification. Every substantive candidate source must equal one accepted migrate source. It does not infer a success from an absent failure. A malformed artifact returns `REPORT_ARTIFACT_MALFORMED`; a well-formed but inconsistent artifact returns `REPORT_ARTIFACT_MISMATCH`. Both have `origin: "suite"`, `severity: "error"`, `blocks: true`, and detail `{ "artifact", "reason" }`.

The Task 7 response is `result: "ok"` with:

- `data.status`: exact Task 6 publication status.
- `data.summary`: `sources_total`, `concepts_created`, `concepts_planned`, `writes_failed`, and `writes_skipped`. `concepts_created` counts successful substantive concept outputs. One source published as three outputs counts three. A navigation-only group index is reported separately and does not increase this count. Failed and not-attempted writes do not increase it.
- `data.reviewed_sources`: one row per accepted reviewed source. Each row has `path`, effective `max_words_per_file`, `word_count`, `review_reason`, `accepted_result`, `reason`, every accepted `sections` disposition, every `planned_outputs` row, successful `actual_outputs`, `conformance_result`, `semantic_review_result` with every section verdict, `failed_writes`, and `skipped_writes`.
- `data.writes`: successful, failed, and not-attempted substantive concept writes.
- `data.navigation_writes`: successful, failed, and not-attempted navigation-only index writes.
- `data.structural_coverage`, `data.agent_semantic_review`, and `data.semantic_fidelity`: separate exact validation flags. Human `semantic_fidelity.assessed` never replaces or changes the agent semantic result.

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

`report`'s output location (open point 5) is deliberately nowhere on disk: it returns structured JSON on stdout, like every other wrapper response, and writes nothing. It does not write into the bundle or write a report file. Task 7 only reads Task 6's suite-owned staging receipt. Rendering the response as the Markdown report a user reads, and deciding whether that Markdown goes to the chat transcript or somewhere the user names, is this file's procedure (step 17), not the runtime's (open point 1: the runtime emits the structured signal set, this file specifies the prose).

## Admission

`init` runs its own, narrower admission: ownership (the working tree and the bundle directory must resolve to the same Git root), REACH, TRUST, ACCESS, parent writability, and post-write validation. It skips `PRESENCE` — there is no bundle to find yet — and skips the evidence gate, since bootstrapping the root cites nothing.

`init` is the one bootstrap exception to the manifest gate: an **explicit** `init` runs before `.okf-workspace.json` exists, because there is no bundle yet for a manifest to declare active. `init` still needs a Git repository (otherwise `not-configured`), still writes the bundle-root `index.md` and, for a root that did not exist yet, its agent connector alone, and never creates or repairs `.okf-workspace.json` — manifest creation stays a separate, explicit `repair`. Every other mutation still requires a valid manifest. `init` is never combinable with a derived effect (`index-maintenance`, `log-append`, or any other named effect): an `effects` array that names anything besides `init` returns `UNSUPPORTED_INPUT`.

`inspect` and `repair` run no REACH/TRUST/ACCESS admission and cite no evidence at all: `.okf-workspace.json` is a plain filesystem action, not an OKF operation through the write gate. `inspect` runs even when the manifest is absent or invalid — that is one of the things it reports — and `repair` fixes a manifest that `inspect` reports missing or invalid, so neither is gated behind the manifest the way every mutating operation on an active bundle is. The only preconditions are a Git repository (otherwise `not-configured`, same as every other operation) and, for `repair`, a writable Git root (otherwise a blocked result carrying a `PARENT_DIRECTORY_NOT_WRITABLE` finding).

`plan`, `aggregate`, `report`, `partition`, `assemble`, `migration-validate`, and `publish` run no admission and no write gate of their own at this outer level — like `inspect`, none of them writes into the bundle, or requires a bundle root or a manifest to already exist, before this operation itself starts. The only precondition any of them has is a Git repository (otherwise `not-configured`); `aggregate` additionally requires that `plan`'s own deterministic detection still resolves to the same unambiguous package list `payload.results` names, so nothing about the workspace shape changed out from under it between the two calls. `report`, `partition`, `assemble`, `migration-validate`, and `publish` carry no such requirement — none of them reads the bundle or the workspace shape directly, only the signals, plan, shards, or staged files its own payload names, so none ever needs to agree with `plan`'s live detection. `assemble` is the one operation among these seven that writes anything at all outside a delegated call, and what it writes is its own isolated staging area beside the bundle, never the bundle itself — see its own section above for exactly what and where; `migration-validate` only ever reads that same staging area back. `publish` is the one operation among these seven that reaches the real bundle at all, and it never does so directly: every admission, evidence, and write-gate check happens one level down, inside the `okf-write`/`okf-read` calls it dispatches through `scripts/okf-delegate.js` (see its own section above), each running its own full admission exactly as any other delegated or inline call would.

`discover` also runs no REACH/TRUST/ACCESS admission and cites no evidence — it only reads and classifies, never writes — but, unlike the four operations above, it requires a valid manifest: it shares the ordinary manifest gate every read/write operation on an active bundle shares, because it needs the bundle root itself to exist so it can exclude it from the scan. A Git repository with no manifest yet answers `not-configured`; an invalid manifest answers `blocked` with `MANIFEST_INVALID`.

`migration-plan` (#144, #145) shares `discover`'s exact admission: no REACH/TRUST/ACCESS, no evidence, the ordinary manifest gate, because checking a candidate target path for a collision needs the bundle root to exist. It runs no write gate either — it never writes, it only reads each markdown source's own frontmatter and body and probes the bundle for an existing file at the candidate target path.

## Parallel execution (#135, #146)

Package sub-agents run independently and in parallel once `plan` hands out their briefs: each one writes only inside its own package's bundle, through its own ordinary `init`/`okf-write` calls, exactly as any single-project setup would. No lock file, no mutex, and no cross-worker coordination exists or is needed, because no two workers ever target the same bundle root — the write gate's existing compare-and-swap publish (`TARGET_CHANGED` on a changed target) is the only conflict protection any single write already had, and package isolation means it is never exercised across workers. The one piece of genuinely shared state is the root workspace manifest, and it is written exactly once, by the coordinator alone, after every worker has returned — through `aggregate` computing it and `repair` persisting it — never by a worker and never mid-flight.

Shard sub-agents run the same way once `partition` hands out their briefs (#146): each one only *authors* its own concepts and reference metadata, in memory, and returns them — it never writes into any bundle itself, so two shard workers never claim the same target through a filesystem race, only through the identity conflict `assemble` (#147) checks for once every shard is in. A shard worker's own returned output is validated against its brief through `partition`'s second payload shape before the coordinator ever treats it as trustworthy input to assembly, then written to its own staging file (a plain filesystem action, not an OKF write) so `assemble` can read it back itself rather than the coordinator re-embedding it. The coordinator alone owns cross-shard collision handling and assembly, through `assemble`, once every shard has returned — never a worker, and never mid-flight; final whole-bundle validation is `migration-validate`'s (#148), run by the same coordinator once every shard has been assembled.

## Idempotent and repairing

Calling any of the twelve operations again is never an error:

- A root whose `index.md` already parses — any parseable frontmatter/body, since the root carries no `okf_version`/`project_mode` for `init` to check anymore — is a `no-op`: nothing is rewritten. A root that does not exist yet is created with the agent connector body and its connector files; an existing root whose `index.md` fails to parse is reset whole to a minimal navigational body (`# Bundle\n`), discarding its prior body and frontmatter, and gets no connector of its own.
- `repair` leaves an already-`ok` `.okf-workspace.json` untouched and reports `no-op`; it only writes the manifest when reported `missing` or `invalid`.
- `plan`, `aggregate`, `report`, `discover`, `migration-plan`, `partition`, and `migration-validate` write nothing, so calling any of them again is always exactly as safe as calling it the first time; `plan` reruns detection fresh rather than remembering a prior call, `aggregate` recomputes the manifest fresh from whatever `payload.results` names this time, Task 7 `report` re-reads the exact named publication receipt before recomputing statistics, `discover` rescans the project fresh against whatever is on disk this time, `migration-plan` recomputes the plan fresh from whatever `payload.sources`/`payload.answers` names this time, `partition` recomputes the shard set fresh from whatever `payload.plan`/`payload.mapping`/`payload.references` (or `payload.brief`/`payload.shard`) names this time, and `migration-validate` re-reads the staging area and recomputes completeness fresh from whatever `payload.selected`/`payload.plan` names this time.
- `assemble` recomputes from the current `payload.partition` and `payload.shards`. Calling it again overwrites only the staged concept files the new computation produces. A stale file that the changed shard set no longer produces remains and makes Task 6 candidate-set equality fail.
- `publish` stores only the latest reporting receipt at the fixed staging path. A later call must again supply the complete accepted plan, mapping, split review, staged set, and canonical semantic review, and replaces the prior receipt after its own sequence ends. A concept already created by an earlier call is an ordinary `CONCEPT_ALREADY_EXISTS` refusal. Do not narrow `payload.staged`; candidate-set equality requires the complete accepted set.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. A refusal is a valid response, not a failure — a `blocked` result carrying a `data.code` such as `WRITE_OWNERSHIP_UNKNOWN` or `UNSUPPORTED_INPUT`, or a blocking finding such as `PARENT_DIRECTORY_NOT_WRITABLE`, is a completed answer.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing `payload.cwd`, or, for `repair`, a missing or empty `payload.targets`, for `aggregate`, a missing or empty `payload.results`, for `assemble`, a missing `payload.partition` or a missing or empty `payload.shards`, or, for `publish`, a missing or empty `payload.staged`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Procedure

1. **Confirm direct invocation.** No operation here ever runs for a delegated caller or runs automatically. Done when the request is a direct, explicit call; not done while the caller is another skill or an automatic hook.
2. **Inspect before acting.** Send an `inspect` request and read its report. Done when both files carry a named state; not done while any file's state is assumed rather than reported.
3. **Present the report and get consent.** Show the two states to the user and ask whether to fix all of them or choose which to fix. Done when the user has approved a specific set of repairs, or declined; not done if any file is repaired without that approval, and not done if an already-`ok` file is offered for repair at all.
4. **Repair `.okf-workspace.json` through `repair`, when approved.** Ask the user for `code-backed` or `knowledge-only` first, unless already known: the manifest grammar requires every bundle record to declare a `project_mode` (#196), and both `repair`'s own deterministic template below and a monorepo's `aggregate`-built manifest (step 13) need it before either can be written — `init` (step 5) never accepts it, so this is the only place left to ask. Read `inspect`'s report for this file next:
   - An `invalid` file is shown with its validation reason and its `salvage` value, if any, before regeneration; the user's approval is required before the file is overwritten, and a kept `salvage.workspace_id` is passed back as `payload.workspace_id`. Never regenerate an invalid manifest without that approval.
   - A `monorepo: true` hint is a warning, not a decision: call `plan` before asking the user anything else. Done when step 13 has run and either produced a deterministic package layout or reported the layout as a question; not done if a single-bundle or hand-written manifest is chosen while `plan` has not yet been tried.
   - When `plan` reports `data.monorepo: false`, or the user prefers a hand-written manifest for a layout `plan` could not resolve, fall back to the pre-#135 choice: the single-bundle template (`repair` with `payload.project_mode` set and no other payload field) or a manifest hand-drafted with the user and sent as `payload.manifest` — the hand-drafted object must declare its own `project_mode` on every bundle record directly.
   - Otherwise, call `repair` with `targets: ["manifest"]`, `payload.project_mode` set to what the user just chose, and no other payload field, for the deterministic single-bundle template. Done when a repeat `inspect` reports `manifest` as `ok`.
5. **Repair `index.md` through `init`, when approved.** Call `init` with the bundle named in the report. `project_mode` was already decided in step 4 and belongs entirely to the manifest bundle record `repair` wrote there — `init` writes only a navigational root and refuses a `payload.project_mode` of its own as `UNSUPPORTED_INPUT`, so nothing about it is asked or merged here. Done when `inspect`, called again, reports `index_md` as `ok`; not done while it still reports `missing` or `invalid`. A root created here carries the agent connector (#170); a root that already existed does not, and its connector belongs in the target-tree proposal, not in this step.
6. **Discover and classify candidate source documents (#142).** Once config bootstrap (steps 4–5) is done, call `discover`. Done when the response is read and `data.complete` is known; not done while a `data.complete: false` scan is treated as if it were exhaustive — report the gap, do not hide it. Never guess a disposition for a `markdown`, `unsupported`, `other`, or `ambiguous` entry here — `discover` classifies format, not migration disposition; step 7 turns this inventory into dispositions. For a single-project setup, call it once with no `package_root`, covering the whole repository. A monorepo package sub-agent dispatched in step 12 calls it again on its own — scoped to its own subtree with `payload.package_root` set to its own brief's own `package_root` (#146 settles the per-package scan scope #142 deferred) — rather than the coordinator's own whole-workspace call filtered by hand afterward.
7. **Derive the migration plan and run the one compact batched question round (#144).** Call `migration-plan` with `payload.sources` set to step 6's `data.sources`, unmodified. Done when a response is read with `data.plan` and `data.questions`; not done while any entry's disposition is assumed rather than read from `data.plan.entries`.
   - `data.plan.executable: true` — every source already has a determined disposition; skip straight to step 8 with nothing to ask.
   - `data.plan.executable: false` — `data.questions` names every still-open question, one per source needing a decision, each with its own `kind`, `prompt`, and closed `options` (or, for `kind: "type"`, any non-empty string). Present the whole batch to the user in one round — never one interruption per question — and call `migration-plan` again with the same `payload.sources` plus `payload.answers: {"<source path>": "<answer>", ...}` built from what the user decided. Repeat until `data.plan.executable` is `true`. Never guess an answer on the user's behalf, and never treat a plan with any `blocked_pending_decision` entry as ready for step 8.
   - A determined plan's entry-level vocabulary (`migrate`/`skip`/`residue`/`blocked_pending_decision`, an intent) is deliberately distinct from `report`'s source-level vocabulary in step 16 (`migrated`/`skipped`/`ambiguous`/`residue`, an outcome): `data.mapping` already carries each `migrate` entry's extracted provenance and link-rewritten body (#145); step 8 partitions that same plan, step 9 assembles it, step 10 validates it, and step 11 alone can publish it.
   - Before step 8, handle every `data.split_review` row whose `review_reason` is not `null`. First send one complete `split_sections` accounting. That response derives the first complete proposal view; it is `"refused"` wherever a semantic value cannot be derived safely, with each unresolved field named by an exact finding. Render this existing proposal from the parent row and `proposal`: source path, `data.settings.max_words_per_file`, source word count, review reason, each section's heading path, 1-based inclusive line range, boundary excerpt, disposition and output order; then every output's exact Concept ID, path, type, title, heading outline, root/group placement, provenance assignments, complete ordinary/whole-source/heading-anchor route inventory and decisions; then every unchanged, changed, or removed ATX heading; then `proposal.tree` with every group purpose, navigation index, and ordered child entry. Offer inspection of any complete section before decision. Ask the user to supply the exact unresolved values or describe changes as one new complete `split_sections` and `split_proposals` call, never a partial patch. Then ask for acceptance of the complete valid proposal and call again with `accepted: true`. Proceed only when every reviewed row has `accounting_status: "complete"`, `proposal.status: "accepted"`, and response `proposal.accepted: true`; show every blocking `SPLIT_*` finding and ask only for its exact unresolved value. Never select a whole-source link target or unclear provenance assignment for the user. A keep-as-one result uses this same view and must show its reason. Transformation in step 8 starts only after this gate passes. Carry this final response's complete `data.split_review` to step 8 unmodified.
8. **Partition the executable plan and dispatch one fresh-context worker per shard, in parallel (#146).** Once step 7's plan is executable, call `partition` with `payload.plan`, `payload.mapping`, `payload.references`, and `payload.split_review` set to step 7's own `data.plan`, `data.mapping`, `data.references`, and `data.split_review`, unmodified, plus the bundle name and, when already known, `project_mode`. Done when `data.shards` is read and every shard's own `brief` is known; not done while a shard is dispatched from anything other than `data.shards[].brief` itself.
   - Launch one fresh-context sub-agent per shard, all in parallel, each one receiving exactly its own `brief` object and nothing else: no sibling shard's sources or mapping, no corpus beyond its own assigned slice, no shared mutable state. Each sub-agent authors the concepts and copies the residue evidence its own brief names, uses its own `brief.neighbors` entries to keep an outbound cross-shard link correct without ever being shown that neighbor's own content, and returns a shard object (`shard`, `concepts`, `references`, `warnings`, `blockers`). For an accepted reviewed source, it returns one concept row per accepted output with the exact `path`, `output`, `concept`, `type`, and ordered `sections` from `brief.split_review`; only `body` is transformed.
   - Validate every returned shard against its own brief before trusting it: call `partition` again with `payload.brief`/`payload.shard`. Done when `data.valid: true` is read for a shard, or its specific `SHARD_*` finding is read and reported back to the worker or the user; never treat an unvalidated shard as ready for assembly.
   - Once a shard validates, write its own returned object to its own staging file — a plain filesystem action, not an OKF write, at a path of this procedure's own choosing (for example `.okf-staging/<bundle>/shards/<shard>.json`) — rather than holding it in hand for step 9. Step 9 names that file's own path, never the shard object itself, so assembling a whole corpus never costs more of this session's own context than partitioning it already did.
   - A non-empty `data.cross_shard_links` names a link between two sources that landed in different shards; carry it forward to step 9, which resolves each one or reports why it could not — never silently dropped (#131).
   - This step ends once every shard is validated and staged; combining them into the bundle is step 9's job, not this one's.
9. **Assemble every validated, staged shard into the bundle, resolving any cross-worker collision (#147).** Call `assemble` with `payload.partition` set to step 8's own `data.shards` and `data.cross_shard_links`, unmodified, plus `payload.shards` naming, for every shard from step 8, the staging file it was written to. Done when the response is read and either `data.status` or a blocking `data.code` is known; not done while any shard step 8 produced is missing from `payload.shards`.
    - `result: "blocked"`, `data.code: "CONCEPT_TARGET_COLLISION"` — two shards' own concepts claim the same target path. This is a decision for the user, not something this procedure resolves on its own: show every disputed concept path and `data.collisions`' own claims on it, and do not retry automatically — #131 permits only a user decision here, never a guessed rename, merge, or overwrite. Setup cannot advance past this point until the user decides how to change one of the colliding sources (a different type, a different source, or dropping one from this migration) and the corpus is re-planned from step 7.
    - `result: "blocked"`, `data.code: "UNSUPPORTED_INPUT"` — a shard step 8 produced is missing from `payload.shards`, its staging file could not be read, or it failed the same envelope check step 8's own validation already ran. This is this procedure's own error, not a decision for the user: an earlier step's output was not carried through unmodified. Correct the payload and retry rather than asking the user anything.
    - `result: "ok"` — read `data.duplicates` (report as non-blocking candidates; never merge either concept), `data.links.lost` (report as migration-caused relationship loss, distinct from an ordinary broken link, which is #148's concern) and `data.links.resolved`, and `data.blockers` (report as still-unresolved sources). `data.status: "complete"` and `data.publishable: true` only when `data.blockers` is empty; otherwise `"partial"` and `false` — the staged concepts stay exactly as `data.staged` names them, in `data.staging_dir`, reported but not carried into the later publication step until the blocker is resolved.
10. **Obtain fresh semantic review and validate the staged bundle (#148, #201 Task 5).** Once step 9's `assemble` call has run, compute the source, accepted-proposal, complete staged-Markdown set, and complete staged-file SHA-256 bindings documented above. Launch a fresh-context read-only reviewer with those exact bindings, every complete observed source section, and every bound staged output body. It must return the bindings unmodified and exactly one of `preserved`, `missing`, `duplicated`, or `uncertain` for every source section; it must not edit files or prompt the user. Call `migration-validate` with `payload.selected`, `payload.plan`, and `payload.split_review` set to steps 6 and 7's own values, unmodified, and with the reviewer's complete result as `payload.semantic_review`. Set `semantic_review.performed: true` only if a human also assessed fidelity; the fresh agent review does not set it. Done when the three independent result flags, `data.publishable`, and canonical `data.semantic_review` are read. A non-preserved verdict requires a new transformation under the same accepted proposal; stale or malformed evidence requires a fresh review.
    - A blocking structural finding (`FRONTMATTER_UNPARSEABLE`, `TYPE_MISSING`, `SOURCE_RESOURCE_MISSING`, `GENERATED_BY_MISSING`, `RUNTIME_MISSING`, `HUMAN_PREFIX_MISSING`, or `BUNDLE_FILES_NONCONFORMING`) names a staged concept — or a reserved file wrongly carrying concept frontmatter — that must be corrected at its own source and re-migrated from step 7, never patched by hand in the staging area.
    - A `SOURCE_DISPOSITION_MISSING` finding names a source `discover` found that never reached an intentional disposition; return to step 7 rather than treating it as silently out of scope.
    - `data.agent_semantic_review.passed: false` names at least one non-preserved source section. Show the exact section finding and return to transformation; do not soften `missing`, `duplicated`, or `uncertain` into a pass.
    - `data.publishable: true` is a Task 5 result, not authority to write. Carry its canonical `data.semantic_review` to step 11.
11. **Publish only through the Task 6 authority.** Call `publish` once with step 9's complete `data.staged`, step 7's exact `data.plan`, `data.mapping`, and accepted `data.split_review`, and step 10's canonical `data.semantic_review`. Do not narrow the candidate set. Done when `data.status`, `data.published`, `data.failed`, and `data.skipped` are read. A `PUBLISH_*` precheck finding means zero writes and requires correction before another call; a candidate mismatch requires one new complete proposal. A partial result is final observed state for this call: report every successful, failed, and not-attempted concept exactly.
12. **For a monorepo, detect package boundaries and dispatch one sub-agent per package, in parallel (#135).** Call `plan` with the bundle name and, when already known, `project_mode` and approved `mappings`. Done when the result is one of the three states below and handled accordingly; not done while any state is treated as another.
    - `data.monorepo: false` — proceed as a single-project setup through step 11; this repository has at most one package.
    - `data.ambiguous: true` — show the user `data.reason` and `data.question`; ask them to either name each package root explicitly (feeding a hand-drafted `payload.manifest` into `repair`, as in step 4) or correct the workspace configuration and retry `plan`. Never guess a package list past this point.
    - `data.ambiguous: false` — launch one fresh-context sub-agent per entry in `data.briefs`, all in parallel, each one receiving exactly its own brief object (`package`, `package_root`, `cwd`, `bundle`, `project_mode`, `mappings`, `okf_version`) and nothing else: no sibling package's brief, no corpus, no shared mutable state. Each sub-agent runs its own steps 6–11 against its own `cwd`/`bundle` pair. Only each package's step 11 can publish that package.
13. **Aggregate the sub-agents' results and write the shared manifest once, after all of them return.** Call `aggregate` with one `results` entry per package the sub-agents were dispatched for — every package `plan` named, none omitted, whether it succeeded or failed — and the `project_mode` decided back in step 4, required here for the same reason it is required by `repair`. Done when `data.status` and `data.manifest` are both read; not done while any dispatched package is missing from `payload.results`.
    - Report `data.status` honestly: `"complete"` only when every package succeeded, `"partial"` otherwise, naming each failed package and its reported reason. Never report overall success while `data.failed` is non-empty.
    - Call `repair` with `targets: ["manifest"]` and `payload.manifest: <aggregate's data.manifest>` to persist it. This is the one and only manifest write for the whole monorepo run; no worker sub-agent ever writes it, and it is never written before every worker has returned. Done when a repeat `inspect` reports `manifest` as `ok`.
14. **Treat a crashed prior setup as an ordinary starting state.** There is no checkpoint, resume state, or recovery journal to consult. Start again from current state and rerun discovery, planning, partition, assembly, semantic review, and the step 11 precheck. Report any concepts already on disk as ordinary write refusals; do not claim recovery.
15. **Report within the ceiling.** An `applied` or `no-op` result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A `blocked` or `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash. A monorepo run's final report is step 13's `data.status` and per-package detail, never collapsed to a single pass/fail line while any package failed.
16. **Once migration work has actually happened, call `report` and render its response as Markdown for the user (#136, #201 Task 7).** For the Task 3–6 flow, send `payload.migration.settings`, `plan`, `mapping`, and `split_review` from the accepted step 7 response, `validation` from step 10, and complete `publication` from step 11. Do not rebuild, narrow, or repair these artifacts. The report must read and match step 11's exact suite-owned receipt before counting. Never infer a published output from a planned output or from an absent failure. For old non-Task-7 callers, use the existing `payload.sources` or `payload.packages` form.
    Render the response as Markdown, in this shape, and show it in the chat transcript only — never write it into the bundle (it would itself need to conform to the OKF model) and never write it to a separate file (open point 5):
    - A heading naming `data.status` (`Migration complete` or `Migration partial`).
    - A **Summary** section listing all Task 7 `data.summary` counts. State that concepts are actual successful substantive outputs, not source files or navigation indexes.
    - A **Reviewed sources** section with one subsection per `data.reviewed_sources` row. Show the effective target, source word count, review reason, accepted split or keep-as-one result and reason, every section disposition, every planned output, every actual output, conformance result, agent semantic result and every section verdict, every failed write, and every not-attempted write.
    - A **Writes** section that lists `data.writes.published`, `failed`, and `skipped` separately. A failed or not-attempted concept never appears as actual output.
    - A **Navigation writes** section that lists `data.navigation_writes` separately and does not describe an index as a created concept.
    - A **Validation** section that reports structural coverage and agent semantic review as separate values.
    - For the legacy source/package forms, keep the **Skipped**, **Uncertain**, **Residue**, and **Link integrity** sections from their response fields.
    - A closing **Semantic fidelity** line: when `data.semantic_fidelity.assessed` is `false`, state plainly that human semantic fidelity was NOT assessed; only when it is `true` does this line say a human reviewed it. Never omit this line, never let a clean status stand in for it, and never merge it with the agent semantic-review result.
    - In multi-package mode, repeat the per-package detail under `data.packages`, plus the failed-package list from any `"failed"` entries, before the combined totals above.
