---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/129
status: draft
type: Decision
---
# /setup: bring projects under OKF with auto-bootstrap and migration

Status: Closed.

## Destination

A working `/setup` command — spec + build + dogfood — that brings any project (empty, existing with docs, monorepo) under OKF: an `okf-setup` skill with auto-bootstrapped bundle root, migration of existing documentation, post-setup analytics, and the current `okf-agent-skills` repo migrated as proof.

The intended user experience is deliberately small:

```text
/okf-setup
  -> inspect project
  -> discover/classify existing docs
  -> ask a compact set of unresolved semantic questions
  -> dynamically delegate migration to fresh-context sub-agents
  -> assemble staged OKF bundle
  -> validate whole bundle
  -> publish
  -> done
```

There is no user-facing `/migrate`, `/resume`, `/restore`, or checkpoint workflow.

## Notes

- This map carries execution through a working setup command; it does not stop at a specification (same model as map #1).
- Data model: adopt the full Google Knowledge Catalog OKF v0.2 SPEC.md model for both code-backed and knowledge-only bundles. Reference: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md and https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md
- Monorepo model: one bundle per package, shared root workspace manifest, sub-agent per package running in parallel.
- Skill architecture: new `okf-setup` skill (recorded decision on this map).
- Read delegation: same model as write — through the delegation bridge.
- The spec v0.1.0 rules apply: zero dependencies, one contract seam, no invented value for an open row.
- Use the Wayfinder, research, domain-modeling, grilling, prototype, implement, tdd, and ponytail skills when their phase is active.
- Recovery model: Git is the repository-level history/rollback/disaster-recovery system. Setup and `okf-lifecycle` do **not** implement backups, restore commands, checkpoints, resume state, rollback snapshots, or a second recovery ledger.

## Decisions so far

### [Grilling: Init bootstrap — how /setup creates the bundle root through the write gate](https://github.com/artemVeduta/okf-agent-skills/issues/133)

- New `init` operation in the sealed router: creates/repairs root `index.md` with `okf_version: \"0.2\"` ± `project_mode`; idempotent (overwrites invalid, no-op if valid); skips PRESENCE and evidence gates; runs REACH, TRUST, ACCESS.
- `/setup` inspects all three config files (`index.md`, `.okf-active`, `.okf-workspace.json`), reports status, repairs with user consent.
- `.okf-active` and `.okf-workspace.json` are plain filesystem actions by `/setup`, not OKF operations through the write gate.
- For invalid existing `.okf-workspace.json`: report validation error, offer to regenerate from template adjusting salvageable values, require user approval.
- For detected monorepo: warn and ask user to choose single-project template or manual monorepo manifest.
- Only `/setup` (explicit user-initiated bootstrap) may create `.okf-active` and `.okf-workspace.json`; installers, adapters, session entry, and delegation still must not.
- `project_mode` stays on root `index.md` alongside `okf_version` — no separate carrier file for v0.2.
- No atomic writes, no journal, no checkpoint — if prior setup crashed, inspect state → repair → continue.
- Flow test coverage: happy path, reject valid root exists, reject outside git repo, reject read-only dir, reject untrusted repo, round-trip parse-tree, init→create precondition chain.

### [Grilling: okf-setup skill architecture — operations, contract boundaries, delegation](https://github.com/artemVeduta/okf-agent-skills/issues/134)

- One runtime operation (`init`, `init → okf-setup` in the router), one skill-level invocation (`/okf-setup`). `setup` is agent-level orchestration, not a runtime operation.
- `init` owned by `okf-setup` — its own admission (git repo, writable, root absent/invalid), not routed through `okf-write`. `project_mode` is not in the `init` payload; added later via `okf-write` `revise`.
- `init` payload: `{cwd}` only.
- `okf-setup` does not accept delegation briefs; no `okf-setup` role in the delegation bridge. Setup itself creates delegation briefs to dispatch worker sub-agents.
- `okf-lifecycle` unchanged; `okf-write` unchanged.
- SKILL.md: `name: okf-setup`, description front-loads bootstrap and migration capability, reach clause `when a user explicitly invokes setup`.
- Sealed skill set grows from 5 to 6.

### [Research: migration contract](https://github.com/artemVeduta/okf-agent-skills/issues/131)

Full research resolution is recorded on #131. The implementation contract carried forward by this map is:

#### User flow

- Migration is an internal phase of explicitly invoked `/okf-setup`; there is no separate user-facing migration workflow.
- Setup discovers candidate docs, asks only questions whose semantic answer cannot safely be inferred, then finishes migration in the same setup session.
- Prefer one compact/batched question round rather than repeated interruptions during conversion.

#### Recovery / operational complexity

- **Git owns history, rollback, and disaster recovery.**
- No `migration-checkpoint.json`, migration resume state, per-file recovery journal, backup/restore subsystem, rollback snapshot, recovery manifest, or custom undo history.
- The same rule applies to `okf-lifecycle`: do not build a second source-control/recovery system.
- Failed setup attempts restart from `/okf-setup` against fresh repository state.

#### Safety

- Migration source docs are never intentionally modified or deleted.
- Generated output is staged/isolated before publication where practical.
- Validate the assembled OKF bundle before publication.
- Use write-new-then-replace/atomic-ish writes where useful for consistency, but not as recovery infrastructure.
- Never guess unresolved semantic decisions; surface/batch them for the user.

#### Source classification

- Direct semantic parsing target is deliberately narrow: UTF-8 Markdown, compatible optional YAML frontmatter, and standard Markdown links/reference definitions.
- Do not automatically interpret/convert HTML, PDF, Word, MediaWiki, Obsidian wikilinks/callouts/Dataview, or other extended formats as active OKF semantics.
- Unsupported/non-standard material can remain source evidence, be retained under `references/` when selected, or be surfaced as unsupported/ambiguous.
- Current validator frontmatter parsing is narrower than arbitrary YAML; implementation must widen the shared reader or conservatively block unsupported YAML constructs rather than silently changing meaning.

#### Concept boundaries and authority

- Default: **one selected source document -> one output concept**.
- No automatic paragraph/heading splitting, glossary extraction, concept explosion, or restructuring during migration unless explicitly approved.
- `code-backed`: migrate durable context that is not mechanically recoverable from authoritative code; do not mirror code-recoverable facts.
- `knowledge-only`: accepted OKF becomes active durable authority; originals remain source/evidence unless separately cleaned up later.

#### Source -> concept mapping

- Preserve explicit valid type when present.
- Otherwise mapping must be deterministic/human-approved; ambiguous type is not guessed.
- Core mappings:
  - ADR / durable decision -> `Decision`
  - canonical vocabulary/context terminology -> `Glossary`
  - external non-code invariant -> `Constraint`
  - investigation/research report -> `Research`
  - runbook/procedure -> `Playbook`
  - release record -> `Release`
  - retained external material wrapper -> `Reference`
  - computation with real runtime provenance -> `Attested Computation`
  - explicit domain-specific type -> preserve/use domain-specific OKF type
- No generic `Note` producer fallback.

#### Identity / collision / redirect / duplicate rules

- Concept identity is path-based per #22: bundle-relative path without `.md`.
- No UUID continuity layer.
- No silent rename, merge, overwrite, re-attribution, or dedupe.
- Target collisions block or require a user decision.
- Redirect artifacts/aliases remain off per #24.
- Exact duplicates may be surfaced as candidates; near duplicates/conflicting claims are not silently merged.

#### Provenance / research / attachments

- Preserve explicit unambiguous provenance in structured `sources`.
- Never fabricate `generated`, actors, `verified`, freshness, review dates, or provenance claims.
- Raw research evidence should not be copied wholesale into active `Research` prose just to preserve bytes.
- Durable conclusions -> `Research`; selected raw/external evidence -> deterministic `references/` paths; selected attachments copied byte-for-byte where retained.
- Unsupported/unrepresentable content must not silently disappear or gain active meaning; retain it as source/evidence or inert migration residue as appropriate.

#### Links

- Rewrite only parsed standard Markdown links/reference definitions when mapping is unambiguous.
- Do not treat prose strings, inline code, or fenced code as links.
- Broken OKF links are generally warnings because upstream permits them; migration-caused relationship loss/ambiguity is stronger.

#### Mandatory fresh-context delegation

Migration must not load a large docs corpus into the setup coordinator context.

Every non-trivial migration dynamically delegates to fresh-context workers, scaling fan-out with corpus size and semantic structure so the selected migration can finish in one setup session.

Partition by semantic locality, for example:

```text
/okf-setup coordinator
  -> inventory/classification workers
  -> semantic partitioning
      -> docs/payments/** worker
      -> docs/auth/** worker
      -> docs/architecture/** worker
      -> research/** worker(s)
      -> ADR/** worker
  -> collect proposed mappings/ambiguities
  -> one batched user decision round where possible
  -> fresh migration workers
  -> assemble staged bundle
  -> global validation
  -> publish
```

Exact file-count thresholds are implementation heuristics, not contract. Principle: use enough fresh-context delegated work to avoid coordinator context pollution and complete the selected corpus in one session.

Workers receive narrow immutable context: project mode, assigned sources, approved mappings, OKF authoring contract, target namespace, and only relevant neighboring metadata. Workers return isolated staged shards: concepts, references/assets, source->target mapping, warnings, ambiguities/blockers.

The coordinator owns global/shared files, assembly, cross-worker collision handling, final validation, and publication.

#### Idempotency without resumability

- No checkpoint/resume semantics.
- Rerunning setup performs fresh discovery against current repository state.
- Deterministic mappings should naturally produce the same logical result for unchanged inputs/answers.
- Existing target collisions are explicit; no silent overwrite.

#### Validation

- Structural/conformance: parseable concept frontmatter, non-empty `type`, reserved index/log rules, conditional frontmatter obligations.
- Completeness: every selected source has an intentional disposition; raw file-count parity is not universal success, especially for code-backed filtering.
- Link integrity: resolve generated paths and rewritten standard Markdown links; broken links may warn.
- Semantic fidelity: structural checks do not prove it. Human review of ambiguities/conflicts/residue and representative high-risk conversions is required before claiming semantic fidelity; otherwise report it as not assessed.

#### Architecture consequence

- `okf-setup` owns discovery, UX, questions, dynamic delegation, orchestration, and setup completion.
- Reuse one shared semantic/runtime contract seam for OKF mutation/validation rather than duplicating migration semantics.
- Current `okf-lifecycle` only owns `sync`; implementation must intentionally extend the runtime seam rather than pretending `sync` already provides migration.

#### Current-repo dogfood implications

Final dogfood must catch/settle at least:

1. `okf/releases/index.md` has concept frontmatter although nested `index.md` is reserved navigation.
2. `okf/releases/v0.1.0.md` uses `type: Note`; producer semantics make it `Release`.

### [Research: OKF bundle data model — for code-backed and knowledge-only projects](https://github.com/artemVeduta/okf-agent-skills/issues/130)

- One OKF v0.2 structural schema, with `code-backed` and `knowledge-only` as authority profiles rather than separate schemas.
- Folder hierarchy/indexes provide progressive-disclosure navigation; OKF links provide semantic relationships. No required `Context Map` concept.
- Core producer concepts: `Glossary`, `Decision`, `Constraint`, `Research`, `Playbook`, `Release`, `Reference`, `Attested Computation`, while tolerating domain-specific/unknown OKF types.
- ADR is merged into `Decision`; architecture is an optional tag/semantic subset. Decisions are intentionally terse (normally 1–3 sentences / ~30–100 words) following the domain-modeling ADR philosophy.
- Glossary preserves canonical terminology and `_Avoid_` synonyms explicitly; definitions remain 1–2 sentences.
- Concept authoring rules, frontmatter guidance, word-size heuristics, code-backed vs knowledge-only authority rules recorded in #130.

### [Research: Read delegation through the delegation bridge](https://github.com/artemVeduta/okf-agent-skills/issues/132)

Closed — read delegation same model as write: through the delegation bridge.

### [Task: Implement \`init\` operation](https://github.com/artemVeduta/okf-agent-skills/issues/137)

- Sealed skill set grows to six with `okf-setup`; `init` routed to it, executed by its own `executeInit()` with `admitInit()` (REACH, TRUST, ACCESS; PRESENCE and evidence skipped).
- `init` payload is `{cwd, bundle?, project_mode?}`; `bundle` defaults to `okf`. `init` writes `project_mode` inline, because the #134 plan to add it by a later `okf-write` `revise` is refused by the write gate and cannot operate.
- `okf-setup` stays off `bridge.skills` in every adapter manifest.

### [Task: Implement /setup state inspection and config-file repair](https://github.com/artemVeduta/okf-agent-skills/issues/138)

- Two new sealed operations owned by `okf-setup`: `inspect` reports `ok`/`missing`/`invalid` for `<bundle>/index.md`, `.okf-active` and `.okf-workspace.json`; `repair` writes the two plain config files.
- Both operate before the activation-marker gate, because they repair that marker. An automatic caller still gets silence, thus only an explicit `/setup` can create those files.
- Consent questions stay in `skills/okf-setup/SKILL.md`. The runtime reports state and does an approved repair; it never asks a question.
- Monorepo detection is a hint only: `.gitmodules`, or a manifest that declares more than one repository or bundle.

### [Task: Monorepo setup](https://github.com/artemVeduta/okf-agent-skills/issues/135)

- New `scripts/lib/monorepo.js`; two new sealed operations owned by `okf-setup`: `plan` (one worker brief per package) and `aggregate` (per-package results into one summary plus the manifest).
- Boundaries come from five on-disk signals (`.gitmodules`, `package.json` workspaces, `pnpm-workspace.yaml`, Cargo `[workspace]`, `go.work`). Only literal paths and one trailing `/*` expand; anything wider is `ambiguous` with a question for the user, never a guess.
- Each worker writes only in its own bundle, thus no lock is needed. The coordinator alone writes the shared manifest, once, after all workers return.
- A failed package is always named with its reason; `status` is `complete` only when every package succeeded. No rollback, no checkpoint.

### [Task: Post-setup analytics report](https://github.com/artemVeduta/okf-agent-skills/issues/136)

- New sealed read-only operation `report` owned by `okf-setup`. The runtime gives JSON; `skills/okf-setup/SKILL.md` gives the Markdown rendering.
- Signals: `concepts`, `skipped`, `ambiguous`, `residue`, each with a `reason`; plus per-concept source-to-concept paths, provenance coverage and link counts.
- Output is standard output only — never written into the bundle, because bundle content must itself conform to OKF.
- A skip or a broken link warns; an ambiguity errors and turns `status` to `partial`.
- `semantic_fidelity.assessed` is true only when the caller declares a human review. For a monorepo it is the AND across packages.
- The skip and ambiguity `reason` vocabulary stays open for #142 to #149.

### [Task: Setup discovery and source classifier](https://github.com/artemVeduta/okf-agent-skills/issues/142)

- New `scripts/lib/discovery.js` and sealed operation `discover`. Four labels: `markdown`, `unsupported`, `other`, `ambiguous`. An ambiguous file carries a `question`; the classifier never guesses.
- Frontmatter is examined with the same reader the write path uses, thus classifier and write gate can never disagree.
- Scan excludes only `.git`, `node_modules` and the bundle folder, marked in code as discovery-scope, not a REACH rule. The open REACH exclusion item stays open.
- An incomplete walk gives `complete: false` with a warning; it is never hidden.
- `discover` keeps the activation gate and refuses automatic callers.

### [Task: Safe Markdown/frontmatter reader compatibility](https://github.com/artemVeduta/okf-agent-skills/issues/143)

- The audit found real defects in the shared reader, not only migration gaps: capitalized `True`/`NULL` were kept as strings; double-quote escapes beyond `\n \" \\` were decoded wrongly and lost data; hex, octal, leading-zero and oversized numbers fell through to strings; and `tags: [architecture]` — used by the v0.2 `Decision` example — was refused.
- Widened: capitalized booleans and nulls, single-line flow sequences of scalars, the escapes `\\ \" \n \t \r \0`.
- Blocked with a specific reason: non-empty flow mappings, hex/octal/leading-zero/oversized/`+`-signed numbers, every other escape, and a bare `...` marker.
- **Residual, recorded not guessed:** unquoted scientific notation (`1e21`) still reads as a string. A write is safe — the round-trip guard refuses it — but a read of an existing document diverges from YAML. Closing it needs two pinned tests changed.

### [Task: Migration plan schema and batched question UX](https://github.com/artemVeduta/okf-agent-skills/issues/144)

- New `scripts/lib/migration.js` with a pure `derivePlan()`, behind the sealed operation `migration-plan` (`plan` was already taken by #135).
- Plan entry: `{path, disposition, reason, concept, type}`. Dispositions are `migrate`, `skip`, `residue`, `blocked_pending_decision`, each with a fixed reason vocabulary.
- `plan.executable` is true only when nothing is `blocked_pending_decision`, thus a half-decided plan cannot be executed by accident.
- Question shape `{id, path, kind, prompt, options}`; answers keyed by source path. An answer to a closed question, or outside its options, is refused before any computation.
- Plan vocabulary states intent; `report` vocabulary states outcome. They stay separate on purpose.
- Judgment recorded, not guessed: an `unsupported` file becomes `residue`, not `skip`; a collision can only be answered `skip`.

### [Task: Source-to-concept mapping, provenance, and residue](https://github.com/artemVeduta/okf-agent-skills/issues/145)

- New `scripts/lib/mapping.js`, folded into the existing `migration-plan` operation rather than a new one.
- Type rules use evidence only — directory, filename, structural template, explicit frontmatter. Everything else becomes a question (`type_not_inferable`). No prose classifier, no generic `Note` fallback.
- Concept paths use the canonical directory the data model names (`docs/adr/0001-x.md` becomes `decisions/0001-x`). A type with no canonical directory keeps the #144 mirror. No directory is invented.
- Provenance is copied exactly as written or left absent. A test asserts no fabricated key appears.
- A link is rewritten only when it resolves to exactly one other source in the same call; fenced and inline code are untouched. Residue gets a deterministic `references/` location. Byte-identical sources are surfaced as duplicate candidates, never merged.

### [Task: Dynamic semantic partitioner and delegated worker protocol](https://github.com/artemVeduta/okf-agent-skills/issues/146)

- New `scripts/lib/partition.js` and sealed operation `partition`. Grouping is by directory (semantic locality), refined deeper when a group is too large; a plain count split happens only when directory structure is exhausted. The threshold `DEFAULT_MAX_SOURCES_PER_SHARD = 8` is named as a heuristic and is per-call adjustable.
- Worker brief: `{shard, cwd, bundle, project_mode, okf_version, sources, mapping, references, neighbors}` — no corpus. `neighbors` carries the target concept path for each outbound cross-shard link.
- Staged shard: `{shard, concepts, references, warnings, blockers}`; every assigned source lands in exactly one bucket, and a shard cannot claim a source outside its assignment. This is what #147 and #148 consume.
- A cross-shard link is never lost: it appears in `cross_shard_links` and as a non-blocking finding.
- Closes the #142 deferral: `discover` accepts `payload.package_root` for a per-package scan scope.

### [Task: Staged shard assembler and cross-worker collision handling](https://github.com/artemVeduta/okf-agent-skills/issues/147)

- New `scripts/lib/assembly.js` and sealed operation `assemble`.
- Staging is real files at `<git root>/.okf-staging/<bundle>/<concept>.md`, beside the bundle and gitignored. It is not a resume ledger: `assemble` never reads its own earlier output, and each call recomputes fully. A directory was chosen so worker-authored text reaches the runtime from disk instead of passing through the coordinator context a second time.
- Two shards claiming one target path refuse the whole call (`CONCEPT_TARGET_COLLISION`) and write nothing. This closes a real gap — `migration-plan` compares a candidate only against the bundle on disk and cannot see two sources in one plan colliding.
- Byte-identical concepts at different paths surface as candidates, never merged. A near duplicate is not compared, because no fuzzy rule is recorded.
- A cross-shard link whose target did not survive is `lost` with `MIGRATION_LINK_LOST`, kept separate from an ordinary broken link.
- A missing or double-claimed shard refuses the call; there is no partial assembly.

### [Task: OKF v0.2 validation and final reporting](https://github.com/artemVeduta/okf-agent-skills/issues/148)

- New sealed operation `migration-validate`. It reuses the existing validator: `validateRead` gets a `strict` mode that runs the same `checkConcept` the write gate runs. No second checker exists.
- Closes the dogfood defect #131 recorded: a reserved `index.md` or `log.md` at any depth that carries a `type` key is now refused. The fix is in the shared reader, thus it also protects the live `okf-read validate` path.
- Completeness means every discovered source has a plan entry with any disposition, including a reasoned `skip`. Counts are never compared.
- `semantic_fidelity.assessed` can be true only when the caller declares a human review. A test proves a structurally clean bundle still reports `assessed: false`.

### [Task: Setup orchestration adapter over shared semantic contract seam](https://github.com/artemVeduta/okf-agent-skills/issues/149)

- The audit found the real gap: no operation moved a staged concept into the real bundle. New `publish` closes it. `publish` never writes a bundle file itself — it sends a write brief to `scripts/okf-delegate.js` as a separate process, which runs `okf-write` `create` under the full write gate, after one read brief confirms the bundle is still active.
- Two tests prove the gate cannot be avoided: an existing concept gives `CONCEPT_ALREADY_EXISTS` with the file unchanged, and a missing activation marker gives `PUBLISH_PRECHECK_FAILED` with nothing written.
- `assemble` writing staged files directly is justified, not converged: staging is outside the bundle and the write gate acts only on an admitted bundle. `migration-validate` shares one `validateRead` function with `okf-read`, which cannot reach staging because staging has no marker. Both reasons are comments in the code.
- The delegation bridge is unchanged. `okf-setup` has no role and stays off `bridge.skills`; `publish` calls the delegation process as an outside caller, which is not the same as being a target.
- One planned addition to the shared seam: an optional `body` field on the write brief, used only by `create`.

### [Grilling: `create` must make a missing concept parent directory](https://github.com/artemVeduta/okf-agent-skills/issues/151)

- `services.publishFile()` makes the missing parent with a recursive `mkdir` — the one point every writer passes through, thus `create`, `revise` and the derivative append are all fixed once. A directory is not a thing in the model: identity is the path (#22), thus making it belongs to the act of writing the file. Refused: `publish` making it (a bundle write off the seam), `init` making canonical type directories (a guessed list that a mirrored path can never complete), a new `ensure-dir` operation (it decides nothing).
- **Defect found, not scope growth:** concept-path containment is a lexical prefix test only, and `realpath` is applied to the bundle root but never to the concept path. A `realpath` re-check of the deepest existing ancestor is added, refusing with `SYMLINK_ESCAPE`. It lives in the gate, not in `publishFile`: the service stores bytes, the gate decides.
- Three causes are refused before any write, each with its own code: `PARENT_DIRECTORY_NOT_WRITABLE` (reused from `init`), the new `CONCEPT_PARENT_NOT_A_DIRECTORY`, and `SYMLINK_ESCAPE`. This replaces the untrue `POST_WRITE_VALIDATION_FAILED` and its leak of an absolute path and a temporary filename.
- The `missing/note.md` case in `test/issue-53.test.js` changes to a read-only parent, which keeps what the test is for. No rollback of a made directory, and the directory is not named in the outcome.

### [Task: Current-repo dogfood migration and fixtures](https://github.com/artemVeduta/okf-agent-skills/issues/150)

- The dogfood migration is done. `/okf-setup` ran the full twelve-operation procedure over `docs/`: 56 sources found, 42 concepts published with `clean` receipts, 14 classified as residue, 0 failures.
- Both fixtures are settled. `okf/releases/index.md` loses its concept frontmatter, because a nested `index.md` is reserved navigation. `okf/releases/v0.1.0.md` becomes `type: Release` through `okf-write` `revise`.
- `okf-read validate` on the bundle goes from 1 blocking finding to **0**. The bundle is valid OKF v0.2. The 13 remaining findings are non-blocking `UNRESOLVED_INTERNAL_LINK` warnings that point outside the bundle.
- **Four defects found, each needing its own decision:** residue is never retained under `references/`; the `Glossary` type rule falsely matched metadata bullets in 13 files; link rewriting drops `#anchor` fragments and misses some relative links; a non-canonical type keeps its source path, putting `okf/docs/` inside the bundle.
- Semantic fidelity is **not** assessed. A 10-agent parallel shard review found two of the four defects; structural checks establish neither.

## Implementation work

Child tickets carry the detail; the map only indexes them:

- [Task: Implement \`init\` operation — runtime router, validation, flow tests](https://github.com/artemVeduta/okf-agent-skills/issues/137) — **done** (`d57b06a`)
- [Task: Implement /setup state inspection and config-file repair](https://github.com/artemVeduta/okf-agent-skills/issues/138) — **done** (`0cc11c6`)
- [Task: Monorepo setup — sub-agent per package, parallel execution, shared manifest](https://github.com/artemVeduta/okf-agent-skills/issues/135) — **done** (`b40cee5`)
- [Task: Post-setup analytics report — format, signals, output](https://github.com/artemVeduta/okf-agent-skills/issues/136) — **done** (`9b1ea15`)
- [Task: Setup discovery and source classifier](https://github.com/artemVeduta/okf-agent-skills/issues/142) — **done** (`3483a81`)
- [Task: Safe Markdown/frontmatter reader compatibility](https://github.com/artemVeduta/okf-agent-skills/issues/143) — **done**
- [Task: Migration plan schema and batched question UX](https://github.com/artemVeduta/okf-agent-skills/issues/144) — **done**
- [Task: Source-to-concept mapping, provenance, and residue handling](https://github.com/artemVeduta/okf-agent-skills/issues/145) — **done**
- [Task: Dynamic semantic partitioner and delegated worker protocol](https://github.com/artemVeduta/okf-agent-skills/issues/146) — **done**
- [Task: Staged shard assembler and cross-worker collision handling](https://github.com/artemVeduta/okf-agent-skills/issues/147) — **done** (`bd7b290`)
- [Task: OKF v0.2 validation and final reporting](https://github.com/artemVeduta/okf-agent-skills/issues/148) — **done** (`dbf4d61`)
- [Task: Setup orchestration adapter over shared semantic contract seam](https://github.com/artemVeduta/okf-agent-skills/issues/149) — **done** (`8bf3659`)
- [Grilling: `create` must make a missing concept parent directory](https://github.com/artemVeduta/okf-agent-skills/issues/151) — **decided**; implementation open
- [Task: Implement concept parent-directory creation and concept-path realpath containment](https://github.com/artemVeduta/okf-agent-skills/issues/153) — open; blocks dogfood
- [Task: Current-repo dogfood migration and fixtures](https://github.com/artemVeduta/okf-agent-skills/issues/150) — **done**; bundle validates with 0 blocking findings

**Do not create backup, restore, checkpoint, or resume subsystems.**

## Not yet specified

- Whether to close the `1e21` scientific-notation read divergence in the shared reader, which requires changing the pinned tests in `test/write-gate.test.js` and `test/issue-53.test.js`

- Grilling-with-docs — grilling skill writes OKF concepts during session (bundle data model is settled; setup/runtime integration still needs execution decision)
- Pre-PR sync — migration semantics are now settled; graduate this into concrete lifecycle/runtime design when that phase is opened

## Out of scope

- Compaction, archiving, restructuring — not v0.1.0 operations, remain deferred per the spec
- OKF-managed backup/restore/checkpoint/resume systems — Git is the recovery mechanism

## Comment by artemVeduta

### [x] #132 — read delegation contract resolved

Research resolution is recorded on #132. Carry-forward contract for `/okf-setup`:

- Delegated OKF reads use the same gate as writes: bounded `role: okf-reader` brief -> reachable delegation ingress -> `scripts/okf-delegate.js` -> existing `scripts/okf-read.js` -> shared runtime/admission/navigation -> `okf-delegation/1` receipt.
- Fresh-context worker creation is a harness/orchestration concern. `okf-delegate.js` is only the guarded process/I/O seam; its `spawnSync` is not itself a fresh-context sub-agent.
- Preserve the existing 12 required brief fields from #91/#97. Reader brief omits `changes`, carries exactly one `paths` value, permits empty `allowed_effects`, and forbids write effects.
- For setup, narrow delegated reader operations to `read | search`; block `resolve`, `enumerate`, `validate`, `orient`, writer operations, and unknown operations before dispatch.
- `brief.settings` stays required, enum-validated, and inert unless separately specified. It does not choose placement.
- Current `adapter-bridge.js` already has direct `okf-read`/`okf-write` wrapper parity, but it deliberately rejects `okf-delegate` under #91/#97. `/okf-setup` must intentionally make the delegation gate reachable; direct `okf-read` execution is not a substitute for delegated read semantics.
- Critical implementation gap: current delegation receipt drops the underlying read/search `response.data`. Successful delegated reads can dispatch correctly yet return no concept/search data. The shared receipt must preserve wrapper `data` losslessly (additive field), with reader `actual_effects: []` and truthful no-write disclosures.
- Harden delegation brief type validation so malformed fields return normal blocked receipts rather than internal delegation failure.
- Required tests: inline-vs-delegated successful `read` and `search` **data parity**, operation narrowing, malformed brief shapes, and prevention of direct-wrapper bypass where a receipt is required.

Architecture consequence: build one reachable delegation ingress/gate shared by reader and writer. Do not create a second read runtime or read-specific bridge.
