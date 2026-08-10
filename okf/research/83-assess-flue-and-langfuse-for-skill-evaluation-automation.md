---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/83
status: draft
type: Research
---

# Assess Flue and Langfuse for skill evaluation automation

Status: source GitHub issue closed.

## Question

Can Flue, Langfuse, or a smaller evaluation path reduce manual Agent Skill testing before `v0.1.0` without changing the zero-dependency product, the one wrapper-process contract seam, or the deterministic release gate?

## Comment by artemVeduta

## Resolution

Use Flue before `v0.1.0` as a non-gating evaluation of the portable skill layer. Start with five to ten positive, negative, routing, wrapper, refusal, and file-effect cases. Keep the deterministic `node --test` suite as the only release gate and retain one native Claude Code smoke run. A Flue pass is not evidence of Claude Code, Codex, or OpenCode adapter parity. Keep results local for the first slice and defer Langfuse until shared trace storage or comparison becomes a demonstrated need.

Research artifacts:

- `docs/research/flue-skill-evaluation.md`
- `docs/research/langfuse-coding-agent-skill-evaluation.md`
- `docs/research/agent-skill-evaluation-automation.md`
