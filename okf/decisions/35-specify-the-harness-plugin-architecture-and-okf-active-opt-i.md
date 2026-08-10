---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/35
status: draft
type: Decision
---
# Specify the harness plugin architecture and .okf-active opt-in contract

Status: closed.

## Question

Given the four-skill suite (okf-read, okf-write, okf-lifecycle, okf-review) and the stateless shared retrieval runtime decided in [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5), what does each harness plugin (Claude Code, Codex, OpenCode) configure, how does the per-project `.okf-active` opt-in work, what defaults are generated, what remains user-editable, and how do installation and session-start failure modes behave?

## Comment by artemVeduta

## Resolution

The harness plugin architecture and `.okf-active` contract are settled as follows.

### Activation

- `.okf-active` is a zero-byte regular file at the Git worktree root.
- It is a passive, project-local behavior selector, not authority, trust, permission, write ownership, or approval.
- Installation and session start never create or modify it.
- Marker creation is a separate explicit setup step. `okf init` may initialize an admitted bundle only through its guarded manual flow; it never manages harness hooks, permissions, agents, instruction blocks, workspace manifests, or adapter configuration.
- The marker is activation-only. `.okf-workspace.json` remains a separate user-authored manifest for workspace, bundle, federation, and routing declarations.

### Installation and artifacts

- The portable base install provides the shared four skills, router, and library-only runtime.
- Each release also provides three thin, separately installable native adapters from the same tag: Claude Code, Codex, and OpenCode.
- Native adapters invoke the shared runtime and contain no independent authority, retrieval, or guard semantics.
- Adapter install, disablement, and uninstall are harness-local. They do not alter markers, OKF content, manifests, guard state, project files, or other adapters.
- Exact compatible suite versions are required. Missing, partial, or mismatched installations fail closed for OKF behavior.

### Native seams

- Claude Code uses a marker-gated `SessionStart` hook in a native plugin bundle.
- Codex uses a marker-gated `SessionStart` hook in a native plugin bundle; hook trust remains user-controlled.
- OpenCode uses a marker-gated prompt-time system transformation. Fire-and-forget session events are not treated as reliable startup injection.
- Unsupported or unavailable seams are reported as degraded rather than presented as equivalent behavior.

### Defaults and overrides

- Plugin defaults are adapter-owned and read-only: registration, shared skill/runtime wiring, and the supported orientation seam.
- Plugins do not silently grant write permissions, trust hooks, initialize guard state, create project files, or generate workspace configuration.
- Optional helper isolation is read-only and supplied only where a harness supports it; no write-capable agents or project agent files are generated.
- User configuration is namespaced and preserved across adapter updates. Local overrides may change presentation, admitted bundle selection, and adapter capabilities only.
- Authority, trust, ownership, guard, approval, discovery, and manual-operation rules are not overridable.

### Runtime behavior

- Each supported startup, resume, clear/compact, fork, or prompt-time re-entry rechecks the marker and emits at most one bounded, read-only orientation result.
- Orientation does not infer a task, perform lifecycle maintenance, initialize state, or mutate concepts. Task-specific retrieval and writes require explicit user intent.
- All automatic hooks remain read-only. Every mutation requires explicit user intent and the shared manual-operation guard, regardless of native invocation controls.
- Cross-harness consistency means equal shared-runtime decisions and safety outcomes, not identical native triggers or presentation.

### Failure behavior

- Missing marker: silent automatic no-op; explicit reads report `not-configured`; mutation is blocked.
- Valid marker and admitted bundle: bounded orientation; ordinary shared-runtime policy applies; mutation still requires the explicit guard.
- Malformed marker: diagnostic, inactive behavior, and blocked mutation.
- Missing or invalid bundle, mode, ownership, retrieval evidence, hook trust, guard state, or compatible runtime: degraded or failed diagnostic, no automatic orientation where unsafe, and blocked mutation.
- Host sessions continue for ordinary work. No failure path performs repair or reports unavailable evidence as clean.

This refines the high-level installation decision in [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5) into a concrete, capability-honest contract for [the cross-harness skill architecture](https://github.com/artemVeduta/okf-agent-skills/issues/4). The shared runtime and guard remain authoritative.

## Comment by artemVeduta

## Amendment — 2026-08-01

The OpenCode adapter in this resolution was designed as a **prompt-time transform** because the research held that OpenCode had no command surface and no explicit-invocation control. Both beliefs are now retracted.

Verified in source at `32f278b48f1a495611165d8a9f1ace0b512933e2` (v1.4.11):

- `packages/opencode/src/command/index.ts:134-152` loops `skill.all()` and registers **every skill as a slash command** with `source: "skill"`. Landed 2026-01-31 in commit `81ac41e0891cf9318af641805e7b1c5af1194be4`, first released in v1.1.48 — six months before our note. Undocumented; `commands.mdx` never mentions skills.
- Explicit-invocation-only is achievable two ways: omit `description`, which filters the skill out of `<available_skills>` in both `Skill.fmt` and `core/src/skill/guidance.ts` while leaving the command registered (`Command.init` reads `skill.all()`, not `available()`); or deny the skill permission per-skill or globally.

Two consequences for this resolution:

1. The prompt-time transform is no longer the only option. The native skill-command is a closer match to the Claude Code and Codex adapters, which improves semantic parity rather than merely claiming it.
2. **Commands are prompt-injected** (`session/prompt.ts:1355-1410`), so the `skill` tool is never called and its `permission.assert` gate is bypassed, and `<skill_files>` is omitted. Any guarded mutation reached through the command path does not pass that gate. The fail-closed guarded-mutation requirement in this resolution needs to state how it holds on a path that bypasses the harness permission check.

Not reopening. The marker semantics, the read-only orientation contract, the thin-adapter shape, and the non-overridable authority/trust/guard rules all stand. The OpenCode adapter's mechanism is what changes, and the choice between the two explicit-only levers is open.

Evidence: `docs/research/ecosystem-deep/opencode-commands-and-skill-invocation.md`. Correction also recorded on [Does OpenCode have a disable-model-invocation equivalent for skills?](https://github.com/artemVeduta/okf-agent-skills/issues/17).

## Comment by artemVeduta

## Amendment -- 2026-08-02

The resolution of [Decide inline versus sub-agent OKF maintenance and `.okf-*` settings](https://github.com/artemVeduta/okf-agent-skills/issues/38) refines the installation wording for agent definitions.

The suite may ship a canonical `agents/` source folder alongside `skills/`, including inert `okf-reader` and `okf-writer` definitions. Harness adapters may expose those definitions through thin native wrappers. These are release artifacts, not silently generated project configuration. Registration does not grant permission, trust, authority, approval, or write ownership.

The following decisions remain unchanged: `.okf-active` is activation only; automatic hooks are read-only; installation does not create or modify project markers or settings; the shared runtime and manual-operation guard own all mutation safety; and explicit user intent is required for mutation. The writer is inert until the main session explicitly creates it with a valid delegation brief.

The earlier phrase that no write-capable agents or project agent files are generated therefore means adapters do not silently generate or authorize them. It does not prohibit shipping explicit, user-invocable agent definitions as part of the reviewed suite release.
