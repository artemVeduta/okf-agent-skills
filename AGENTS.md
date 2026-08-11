## Workflow integration

- **`okf/agents/index.md`** — the agent connector. Read this chain before working in
  the docs store: `okf/index.md` → `okf/agents/index.md` → any playbook it links.
  Skills that record terms or decisions refuse without it.
- **`.agent-workflow.json`** — configures the tracker, SCM, CI and docs for
  workflow skills (`/implement-ticket`, `/deliver-ticket`, `/review-pr`, etc.).
  Edit by hand or re-run `/setup-agent-workflow` to start over.

For how to run the suite and what a good test is, see `CONTRIBUTING.md`.
