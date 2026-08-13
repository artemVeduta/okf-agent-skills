# Agent rules

Read `docs/spec/okf-agent-skills-v0.1.0-completion.md` and
`docs/spec/okf-agent-skills-v0.1.0.md` before a behavioral change. Four rules
apply on top:

- **Zero dependencies.** The shipped runtime, skills, and adapters use
  nothing outside the Node.js standard library, and the deterministic suite
  runs without any `package.json`. The non-gating `eval/` slice is the one
  development-only exception.
- **One contract seam.** Only a skill's wrapper script, run as a process, is
  a tested contract boundary.
- **No invented value for an open specification row.** An `Open` row in
  `docs/spec/okf-agent-skills-v0.1.0.md`'s open-item table is closed by a
  recorded decision before its behavior is implemented, never by a guess.
- **No new skill without a recorded decision.** See "Repository setup" and
  "Open-item resolutions" in `docs/spec/okf-agent-skills-v0.1.0-completion.md`.

## Workflow integration

- **`okf/agents/index.md`** — the agent connector. Read this chain before working in
  the docs store: `okf/index.md` → `okf/agents/index.md` → any playbook it links.
  Skills that record terms or decisions refuse without it.
- **`.agent-workflow.json`** — configures the tracker, SCM, CI and docs for
  workflow skills (`/implement-ticket`, `/deliver-ticket`, `/review-pr`, etc.).
  Edit by hand or re-run `/setup-agent-workflow` to start over.

For how to run the suite and what a good test is, see `CONTRIBUTING.md`.
