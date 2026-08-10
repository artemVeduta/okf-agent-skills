---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/4
status: draft
type: Research
---

# Determine the cross-harness skill architecture and lifecycle integration

Status: source GitHub issue closed.

## Question

What architecture can deliver identical OKF behavior across Claude Code, Codex, and OpenCode while respecting each harness's current skill discovery, frontmatter, hooks/session lifecycle, subagent or dynamic-workflow support, local/global installation paths, and approval model—and how should `npx skills`, symlinks, scripts, and release packaging be used?

Research current first-party harness documentation and source where available, Anthropic skill-authoring guidance, the skills CLI's authoritative behavior, and Matt Pocock's `writing-great-skills` skill. Determine the verified capabilities and constraints without assuming feature parity. Write the cited report to `docs/research/cross-harness-skill-architecture.md`.

## Comment by artemVeduta

Claiming this ticket for resolution now.

## Comment by artemVeduta

## Corrected resolution — 2026-07-26

The Agent Skills directory format is the shared source format for Claude Code, OpenAI Codex, and OpenCode. This supports one portable skill body and shared deterministic scripts, **not identical harness behavior**.

### Corrected architecture facts

- The portable core is `SKILL.md` with the standard required metadata and referenced files/scripts.
- Discovery locations, hooks, subagents, permissions, invocation policy, config trust, and loading semantics are harness adapters.
- Claude Code supports `disable-model-invocation`. Codex uses `agents/openai.yaml` with `allow_implicit_invocation`. OpenCode ignores the Claude field and has no true equivalent.
- Codex runtime support for `allowed-tools` is unsupported/unverified; the field's presence in the generic specification is not evidence that Codex enforces it.
- Codex hooks can be configured at user/project/plugin scopes, but current hook matchers do not expose an active-skill field.
- OpenCode's current source follows skill-directory symlinks, but that does not prove every installer topology or grant access to sibling repositories.

### Corrected installation facts

Current `skills` CLI git-ref syntax uses `#ref`; `@value` is a skill filter. The release example is:

```sh
npx skills add 'artemVeduta/okf-agent-skills#v0.1.0'
```

In default symlink mode the canonical stores are project `.agents/skills/` and global `~/.agents/skills/`; agent-specific links are created only where required. The CLI's native-path table must not be confused with its canonical-store installation shortcut.

The final skill count, runtime boundary, hook installation, and manual-operation adapters remain decisions in **Choose the skill bundle, runtime, and distribution architecture**. The ticket remains closed; this comment corrects the research record without claiming feature parity.

## Comment by artemVeduta

Historical note corrected: the architecture reports were created in local commit `3364649`, but the authoritative resolution is the corrected comment above and the current local files under `docs/research/`. No claim of an already published remote commit is made here.
