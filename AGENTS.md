# Agent rules

- **Zero dependencies.** The shipped runtime, skills, and adapters use
  nothing outside the Node.js standard library, and the deterministic suite
  runs without any `package.json`. The non-gating `eval/` slice is the one
  development-only exception.
- **One contract seam.** Only a skill's wrapper script, run as a process, is
  a tested contract boundary.

## Workflow integration

- **The agent connector** — `okf/agents/index.md` plus the `okf/agents/okf.md`
  playbook. Rread this chain before working in the docs store: `okf/index.md` →
  `okf/agents/index.md` → any playbook it links. Skills that record terms or
  decisions refuse without it.
- **`.agent-workflow.json`** — configures the tracker, SCM, CI and docs for
  workflow skills (`/implement-ticket`, `/deliver-ticket`, `/review-pr`, etc.).
  Edit by hand or re-run `/setup-agent-workflow` to start over.
