---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/186
status: draft
type: Research
---

# Verify Mermaid portability and zero-dependency validation

Status: source GitHub issue closed.

## Question

Across the repository's supported Markdown surfaces and primary Mermaid documentation, what Mermaid syntax can remain portable and readable as source, what rendering behavior can be relied on, and what deterministic validation is possible without adding a shipped or test dependency?

## Comment by artemVeduta

Research context: branch `research/mermaid-portability`; findings target `docs/research/mermaid-concept-views.md`. The isolated branch starts from commit `43fff42`. Its baseline suite has one existing failure in `test/issue-177.test.js` because the main worktree carries an uncommitted `scripts/lib/setup.js` change; this research must not modify runtime code.

## Comment by artemVeduta

## Answer

Research is captured on local branch `research/mermaid-portability` at commit `d625992`, in `docs/research/mermaid-concept-views.md`.

Primary-source findings:

- GitHub currently renders fenced `mermaid` blocks, but GitHub owns the Mermaid version and gives no pinned visual compatibility contract.
- Claude Code, Codex, and OpenCode document Markdown skill loading, but none documents Mermaid rendering as a harness contract.
- Mermaid syntax parsing requires the Mermaid package, and Mermaid CLI rendering requires its npm package. Neither fits this repository's zero-dependency deterministic gate.

Decision-ready result:

- Use a source-readable subset: a `mermaid` fence with a simple `graph TD`, ASCII node identifiers and labels, and `-->` edges.
- Require the prose and relationship meaning to remain understandable without rendering.
- Treat GitHub rendering as hosted presentation, not a release contract.
- For now, use source review and `git diff --check`. A Node standard-library static profile check remains a separate product decision and cannot claim Mermaid parse or render validity.
