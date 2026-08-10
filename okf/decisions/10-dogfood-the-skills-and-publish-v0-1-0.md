---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/10
status: draft
type: Decision
---
# Dogfood the skills and publish v0.1.0

Status: Closed.

## Destination

A permanent `v0.1.0` tag points at protected `main` after the accepted deterministic release gates pass, this repository maintains its own OKF bundle through the shipped skills, a non-gating Flue evaluation checks the portable skill layer, one real Claude Code smoke run succeeds, and tag-based installation is verified.

## Notes

This map carries execution through publication. Consult `CONTEXT.md`, `CONTRIBUTING.md`, `docs/spec/okf-agent-skills-v0.1.0.md`, `docs/spec/okf-agent-skills-v0.1.0-completion.md`, `docs/transcript.md`, and the evaluation reports under `docs/research/`.

The only release gate remains `node --test "test/*.test.js"` and its required GitHub CI check. Flue evidence is non-gating and tests the portable skill layer. One Claude Code run tests a native harness. Live automation across all three supported harnesses stays outside this release. Use one writer at a time because `v0.1.0` has no writer serialization or crash recovery. Treat the public tag as permanent.

## Decisions so far

- [Assess Flue and Langfuse for skill evaluation automation](https://github.com/artemVeduta/okf-agent-skills/issues/83) — Add a small non-gating Flue slice before `v0.1.0`, retain native smoke testing, and defer Langfuse.
- [Decide automatic synchronization invocation semantics](https://github.com/artemVeduta/okf-agent-skills/issues/82) — Agent-selected narrow synchronization uses an explicit process request, while automatic hook invocations stay read-only and every lifecycle sync states its invocation.
- [Reconcile D8 with reachable post-write validation results](https://github.com/artemVeduta/okf-agent-skills/issues/86) - D8 validates the primary saved concept with twelve checks; fixtures cover reachable verdict and result pairs, while the outer catch stays separate error handling.
- [Decide the OpenCode adapter contract for v0.1.0](https://github.com/artemVeduta/okf-agent-skills/issues/85) — Support project and global config-root targets, install only namespaced adapter files, and require a manual permission merge without claiming readiness.
- [Choose how installed skills reach wrapper scripts](https://github.com/artemVeduta/okf-agent-skills/issues/84) - Install each skill and native adapter with a self-contained copy of the canonical scripts tree, resolve wrappers from the install root, and keep adapter dispatch at the wrapper-process seam.
- [Choose the repository OKF bundle topology and evidence boundary](https://github.com/artemVeduta/okf-agent-skills/issues/87) — Use `okf/` with a repository-local workspace and root marker; the initial bundle is knowledge-only and future code-backed bundles use Git-root evidence.
- [Decide delegated execution and settings scope for v0.1.0](https://github.com/artemVeduta/okf-agent-skills/issues/91) — The delegated path is not reachable after installation; `brief.settings` stays validated and inert; the placement and precedence claims become retained design.
- [Prototype the first portable Flue evaluation slice](https://github.com/artemVeduta/okf-agent-skills/issues/88) — Nine cases spanning positive, negative, routing, wrapper, refusal, and file effect, asserting the two-hop `okf` route, run once each and recorded as observations in a committed `docs/research/flue-eval-<date>.md` run record.
- [Make installed skills and adapters execute wrapper scripts](https://github.com/artemVeduta/okf-agent-skills/issues/96) — Each skill ships its own `scripts/` copy invoked as `node <skill-root>/scripts/<name>.js`, each adapter copies the canonical tree to `<target>/okf-agent-skills/scripts/`, and hooks run that target-local `okf-read` wrapper as a process.
- [Choose the protected-main release policy](https://github.com/artemVeduta/okf-agent-skills/issues/90) - Require PR-only changes to `main`, the current GitHub Actions `test` gate, resolved conversations, admin enforcement, and no force-push or deletion.
- [Protect main with the required CI policy](https://github.com/artemVeduta/okf-agent-skills/issues/92) — Applied the policy: PR-only, zero-approval reviews, resolved conversations, `test` status check from `CI`, up-to-date branches, admin enforcement, and no force-push or deletion.
- [Define the exact .okf-workspace.json grammar and path-base rules](https://github.com/artemVeduta/okf-agent-skills/issues/109) - Use strict exact-key JSON, canonical names and lineage identities, portable owner-relative paths, and separate structural rejection from runtime candidate admission.
- [Define the native dogfood acceptance trace](https://github.com/artemVeduta/okf-agent-skills/issues/89) — Use one clean routed Claude Code session over a release concept, with one applied title fix, an explicit lifecycle no-op, an unsupported-init refusal, and strict native and file-effect evidence.
- [Add the initial repository OKF bundle](https://github.com/artemVeduta/okf-agent-skills/issues/99) - Hand-authored the active local knowledge-only bundle, workspace declaration, navigation indexes, and prepared v0.1.0 release concept.
- [Requalify pull request 81 as the release candidate](https://github.com/artemVeduta/okf-agent-skills/issues/108) — Reviewed the full PR, applied 85-file fix commit `2549c23`, confirmed 259/259 deterministic suite, clean syntax and diff; PR #81 is the v0.1.0 release candidate.
- [Merge the v0.1.0 release candidate to main](https://github.com/artemVeduta/okf-agent-skills/issues/95) — Merged PR #81 at commit `62a41f8`; 259/259 suite, clean merge state, no branch protection bypassed.

- [Verify exact-main installation in a clean clone](https://github.com/artemVeduta/okf-agent-skills/issues/104) — Qualified commit `62a41f8` installs clean: five skills with SKILL.md + scripts, adapter install/disable/uninstall cycle passes, 259/259 suite green.

- [Package OpenCode as an npm-installable plugin](https://github.com/artemVeduta/okf-agent-skills/issues/111) — Created `packages/opencode/` with ESM plugin entry point, config hook that registers skills, and `__dirname`-relative path resolution.
- [Restructure Claude Code adapter as a self-contained plugin](https://github.com/artemVeduta/okf-agent-skills/issues/112) — Repo root is the plugin directory: `.claude-plugin/plugin.json` with author, `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, `manifest.json` stripped of install fields.
- [Package Codex as a self-contained plugin](https://github.com/artemVeduta/okf-agent-skills/issues/113) — Created `packages/codex/` with `.codex-plugin/plugin.json`, hooks using `${PLUGIN_ROOT}`, and `marketplace.json` at repo root.
- [Remove __OKF_TARGET_DIR__ and the install-script adapter model](https://github.com/artemVeduta/okf-agent-skills/issues/114) — Stripped install/disable/uninstall from `adapters.js`, deleted `okf-adapter.js` and `adapters/` directory; 225/225 tests pass.
- [Update test suite to match per-harness plugin packages](https://github.com/artemVeduta/okf-agent-skills/issues/115) — Removed install-dependent test fixtures; static layout assertions replace the install-cycle tests.
- [Dogfood the repository OKF bundle in Claude Code](https://github.com/artemVeduta/okf-agent-skills/issues/103) — The trace succeeded under every constraint; its one defect is that no skill doc names `task_kind`, `scope`, and `invocation` as top-level request fields, which blocks any doc-exact write or sync. Repaired test-first through three child tickets.
- [Publish dogfood changes through a protected pull request](https://github.com/artemVeduta/okf-agent-skills/issues/101) — Merged PR #125 at `8fef99a` on the backend of the doc-contract repairs from the dogfood trace; both required `test` checks passed before merge. Wired npm publish CI on `v*` tags in PR #126.
- [Run the final deterministic v0.1.0 release gate](https://github.com/artemVeduta/okf-agent-skills/issues/93) — Clean tree on `main` at commit `9ccc135`, 231/231 deterministic suite green, CI success; this commit may receive the permanent `v0.1.0` tag.
- [Publish the permanent v0.1.0 tag](https://github.com/artemVeduta/okf-agent-skills/issues/98) — Annotated tag `v0.1.0` created at commit `9ccc135` and pushed to origin.

- [Verify installation from the v0.1.0 tag](https://github.com/artemVeduta/okf-agent-skills/issues/106) — Installation verified: all 5 skills, adapter lifecycle (hook/disabling/re-enable), all wrappers execute, 231/231 suite passes, `protocol.js` missing test-only `requiredPayload` export is non-blocking.

## Not yet specified

- Claude Code marketplace registration — docs mention `/plugin marketplace add`, exact mechanics for publishing a plugin to the discoverable marketplace need verification.
- Codex marketplace end-to-end install flow — `marketplace.json` syntax confirmed, ChatGPT desktop app install flow needs testing.
- OpenCode permission injection — confirm whether the config hook can write `permission.skill: deny` keys or if that's explicitly excluded (ponytail doesn't inject permissions either).
- Repair work exposed by contract reconciliation, clean installation, or Flue evaluation. Create a precise child ticket only after a failure identifies the defect.
- Whether `target`, `settings`, and `brief` should stay in the request parser's top-level allowlist. Nothing reads them today, so the choice is between deleting the dead surface and documenting it as reserved. Cleanup, not on the route to the tag.
- Whether a sync that lacks a writable `task_kind` should abstain silently or refuse like the write path, and whether write operations should demand a top-level `scope` as sync does. The docs record current behaviour; changing the behaviour is a later decision.

## Out of scope

- Automated live evaluation across Claude Code, Codex, and OpenCode; this remains in [Add live cross-harness acceptance testing for v0.2.0](https://github.com/artemVeduta/okf-agent-skills/issues/15).
- Langfuse integration, statistical thresholds, model judges, and a gating non-deterministic evaluation job.
- The deferred guard, approval, recovery, migration, merge, split, archive relocation, and cross-repository write families.
- Windows support, support-ceiling calibration, a CLI binary, changelog automation, and GitHub release assets.

## Comment by artemVeduta

## Scope update

Dogfood and release checks must use the reduced #43 boundary: bounded notice writes and incremental bounded synchronization only. Broad, destructive, identity-changing, recovery-dependent, and cross-repository writes are deferred. The release must verify the disclosed lack of concurrent-writer serialization and crash recovery rather than treating it as a hidden capability.

## Comment by artemVeduta

Unblocked. #9 is closed and all its scope is in https://github.com/artemVeduta/okf-agent-skills/pull/81.

What is left here, in order:

1. Merge https://github.com/artemVeduta/okf-agent-skills/pull/81 to `main`. The specification records `v0.1.0` as the first code on `main`; the branch is 40 commits ahead.
2. Protect `main`. It is unprotected today, and CI is now available as a required check.
3. Dogfood in a real harness. D4 makes a manual real-harness run the pre-release gate, and the suite deliberately starts no harness process, so no test covers this.
4. Tag `v0.1.0`, so the documented install command `npx skills add 'artemVeduta/okf-agent-skills#v0.1.0'` resolves. No tag exists yet, so both the base install command and the per-adapter `git clone --branch v0.1.0` in the README are release-time text that does not yet work.

One item worth settling before the tag: #73 asks for a job log showing a red run from one deliberately broken assertion. Only the green half exists. It needs a commit that knowingly breaks a test, pushed and allowed to finish before the revert goes up, because `cancel-in-progress` kills an in-flight run and a cancelled run is not a red run.

## Comment by artemVeduta

## Destination reached

All six destination conditions satisfied:

- [Publish the permanent v0.1.0 tag](https://github.com/artemVeduta/okf-agent-skills/issues/98) — `v0.1.0` at commit `9ccc135`
- [Run the final deterministic v0.1.0 release gate](https://github.com/artemVeduta/okf-agent-skills/issues/93) — 231/231 suite green
- [Add the initial repository OKF bundle](https://github.com/artemVeduta/okf-agent-skills/issues/99) — Active local knowledge-only bundle with workspace declaration and indexes
- [Prototype the first portable Flue evaluation slice](https://github.com/artemVeduta/okf-agent-skills/issues/88) — Nine cases passing, non-gating, run record committed
- [Dogfood the repository OKF bundle in Claude Code](https://github.com/artemVeduta/okf-agent-skills/issues/103) — Trace passed under all constraints
- [Verify installation from the v0.1.0 tag](https://github.com/artemVeduta/okf-agent-skills/issues/106) — All skills, wrappers, and adapter lifecycle verified

### Remaining fog (deferred to later efforts)

- Claude Code marketplace registration
- Codex marketplace end-to-end install flow
- OpenCode permission injection
- Repair work from contract reconciliation, clean installation, or Flue evaluation
- `target`/`settings`/`brief` top-level allowlist cleanup
- Sync abstention vs refusal for missing `task_kind`

### Seed ticket

[Seed: bring an existing docs folder under OKF](https://github.com/artemVeduta/okf-agent-skills/issues/124) — holds the adoption gap; becomes its own map now that the tag is published.
