---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/16
status: draft
type: Research
---

# Can Codex hooks be scoped to specific skills?

Status: source GitHub issue closed.

## Question

Can Codex hooks be scoped to specific skills, and if so, how? Current Codex hooks (in `hooks.json` or `config.toml`) are session-scoped — they fire for all tool use regardless of which skill is active. Investigate whether there is a mechanism to bind hooks to specific skills (e.g., only fire `PostToolUse` when `okf-validate` is loaded), or whether the only option is session-wide hooks that filter by tool name/pattern.

## Comment by artemVeduta

Claiming for resolution.

## Comment by artemVeduta

## Corrected answer — 2026-07-26

**No active-skill scoping mechanism was found.**

Codex hooks have configuration scopes—user, trusted project, and plugin—but that is different from binding a hook to the skill currently in use. Current hook event inputs and matcher fields do not expose an active skill name, and current skill metadata does not embed a hook binding.

Therefore a project hook can filter documented event fields such as tool or event data, but it cannot reliably express “fire only while `okf-validate` is active.” Per-skill lifecycle behavior needs deterministic in-skill steps, a domain-specific project/plugin hook whose broader scope is acceptable, or another approved adapter.

Report: `docs/research/ecosystem-deep/codex-hooks-skill-scoping.md`.

## Comment by artemVeduta

Historical commit pointer retained for local provenance: `0ac066b`. The corrected answer is the resolution comment above; no published remote link is claimed.
