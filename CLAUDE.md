# Agent rules

This project's canonical agent contract is `AGENTS.md` — read it first. The
same four rules apply here, restated so this file is sufficient on its own:

- Zero dependencies: nothing outside the Node.js standard library.
- One contract seam: only a skill's wrapper script, run as a process.
- No invented value for an open specification row in
  `docs/spec/okf-agent-skills-v0.1.0.md`.
- No new skill without a recorded decision (see `AGENTS.md`).
