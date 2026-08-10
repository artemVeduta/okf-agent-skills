---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/17
status: draft
type: Research
---

# Does OpenCode have a disable-model-invocation equivalent for skills?

Status: source GitHub issue closed.

## Question

Does OpenCode have a mechanism equivalent to `disable-model-invocation` for preventing the agent from auto-invoking a skill? This is needed for `okf-compact` (destructive, must be human-initiated) and the `okf` router skill (user-invoked pattern per Pocock). Investigate whether `permission.skill: "deny"` hides the skill from the agent entirely vs allowing manual invocation, whether there is a frontmatter field OpenCode recognizes for this, or whether the behavior can be achieved through the permission system alone.

## Comment by artemVeduta

Claiming for resolution.

## Comment by artemVeduta

## Corrected answer — 2026-07-26

**OpenCode has no documented equivalent to `disable-model-invocation`.**

OpenCode ignores the Claude-specific frontmatter field. Ignoring it means the skill remains discoverable, visible to the model, and explicitly loadable; it does **not** become hidden or manual-only.

- `permission.skill: "deny"` prevents the matched skill from loading rather than creating a human-only mode.
- `permission.skill: "ask"` is an approval policy, not an explicit-only invocation policy.
- Disabling the skill tool affects all skills for that agent and has no per-skill granularity.
- Omitting required `description` metadata is an undocumented parser/listing mismatch and is not an acceptable portable workaround.

Manual-only destructive operations therefore require an OpenCode-specific design plus an independent preview/approval gate inside the operation. The ticket remains closed because the researched answer is “no equivalent,” not because a workaround was selected.

Report: `docs/research/ecosystem-deep/opencode-disable-model-invocation.md`.

## Comment by artemVeduta

Historical commit pointer retained for local provenance: `0ac066b`. The corrected answer is the resolution comment above; no published remote link is claimed.

## Comment by artemVeduta

## Correction — 2026-08-01

The resolution above is **wrong on the substance**. Re-verified against `sst/opencode` (redirects to `anomalyco/opencode`) at commit `32f278b48f1a495611165d8a9f1ace0b512933e2`, latest tag `v1.4.11`.

**Still true.** OpenCode recognizes no frontmatter key literally named `disable-model-invocation`. Unknown frontmatter keys are silently ignored, so writing that key has zero effect. Also still true: `permission.skill: "ask"` is an approval policy, not an explicit-only policy, and it degrades to `allow` under `--auto`.

**No longer true.** "The skill remains visible and model-invocable" and "no documented equivalent exists" — meaning no equivalent at all. Two supported configuration/authoring levers produce exactly the `disable-model-invocation` effect: hidden from the model, still invocable by the human.

The reason both mechanisms work is a premise this issue never checked. Since 2026-01-31 — commit `81ac41e0891cf9318af641805e7b1c5af1194be4`, *"feat: make skills invokable as slash commands in the TUI (#11390)"*, first released in `v1.1.48` — `packages/opencode/src/command/index.ts:134-152` loops over `skill.all()` and registers **every** discovered skill as a slash command with `source: "skill"`. No authoring step. The model-facing catalog and the command registry are built from different filters, and only the catalog filters anything:

1. **Omit `description`** (per skill). `Skill.fmt` drops undescribed skills from `<available_skills>` (`const described = list.filter((skill) => skill.description !== undefined)`), and `packages/core/src/skill/guidance.ts:52-54` does the same. The command registry does not filter on description, so `/name` survives.
2. **Deny the skill permission** — per skill, `permission: { skill: { "<name>": "deny" } }`, or globally, `tools: { skill: false }`. `Skill.available()` and `SkillV2.available` filter denied skills out of the catalog and the `skill` tool refuses them, but `Command.init` reads `skill.all()`, not `available()`, so the command survives. The global form additionally makes `SystemPrompt.skills` return early, removing the whole skills block.

In both cases the surviving slash command still runs, because command execution is prompt injection (`packages/opencode/src/session/prompt.ts:1355-1410`), not a `skill` tool call: the skill body becomes the user prompt, so `permission.assert({ action: "skill", ... })` is never evaluated. Two consequences worth knowing: the `<skill_files>` directory listing that the tool attaches is omitted (only a base-directory sentence is appended), and the permission gate that would normally prompt a human for a destructive skill does not fire on this path — so `okf-compact` still needs its own preview/approval step inside the operation. That part of the original resolution's guidance stands, for a different reason than it gave.

Two caveats on these mechanisms. Mechanism 1 rests on undocumented behavior: https://opencode.ai/docs/skills/ documents `description` as required, while the loader treats it as optional, so it may not survive future validation. Whether mechanism 2's survival of the command is intended or an oversight is inferred, not stated — though it is consistent across the TUI, ACP, and HTTP surfaces, none of which filter skill-sourced commands by permission.

**Why we got it wrong.** The capability is six months older than our note (2026-01-31 vs. 2026-07-26) and is entirely undocumented — `commands.mdx` never mentions skills, `skills.mdx` never mentions commands. A docs-led investigation could not see it. Separately, an optional `slash` boolean was added to skill frontmatter on 2026-06-03 (#30617) and is parsed by the v2 core loader, but nothing in the tree reads it. Groundwork, not a feature; a signal to re-check, not something to build on.

Full findings, with source citations: `docs/research/ecosystem-deep/opencode-commands-and-skill-invocation.md`. Retractions have been marked in place in `docs/research/ecosystem-deep/opencode-skills.md` and `docs/research/ecosystem-deep/opencode-disable-model-invocation.md`.

Leaving this issue closed — the question is answered, just with the opposite answer.
