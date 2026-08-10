---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/18
status: draft
type: Research
---

# Does OpenCode follow symlinks when scanning skill directories?

Status: source GitHub issue closed.

## Question

Does OpenCode follow symlinks when scanning skill directories in its compatibility paths (`.claude/skills/`, `.agents/skills/`)? The `npx skills` delivery model places skill files in `.agents/skills/` (canonical) and creates symlinks in `.claude/skills/`. OpenCode reads `.claude/skills/` as a compatibility path — but if it does not follow symlinks, the symlinks from `.claude/skills/` to `.agents/skills/` would be invisible and skills would not load. Verify against OpenCode source or documentation whether symlink resolution is supported in skill directory scanning.

## Comment by artemVeduta

Claiming for resolution.

## Comment by artemVeduta

## Corrected answer — 2026-07-26

**Current OpenCode source follows directory symlinks during skill discovery.**

The audited source passes `symlink: true` to skill globbing and uses directory checks that dereference symlinks. This supports valid skill-directory symlinks in the tested discovery path.

This source-level fact is narrower than the previous conclusion: it does not guarantee every `npx skills` topology, broken or cyclic symlinks, links escaping trusted roots, sibling-repository access, or future OpenCode versions. Installation fixtures must still test the exact project/global layout used by this repository.

Report: `docs/research/ecosystem-deep/opencode-symlink-resolution.md`.

## Comment by artemVeduta

Historical commit pointer retained for local provenance: `0ac066b`. The corrected answer is the resolution comment above; no published remote link is claimed.
