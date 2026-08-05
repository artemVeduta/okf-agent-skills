# Agent rules

Read `docs/spec/okf-agent-skills-v0.1.0-completion.md` and
`docs/spec/okf-agent-skills-v0.1.0.md` before making a behavioral change.
These four rules apply on top of anything else read, and are restated
identically in `CLAUDE.md` so either file is sufficient on its own for a
harness that reads only one:

- **Zero dependencies.** Nothing outside the Node.js standard library.
- **One contract seam.** Only a skill's wrapper script, run as a process, is
  a tested contract boundary.
- **No invented value for an open specification row.** An `Open` row in
  `docs/spec/okf-agent-skills-v0.1.0.md`'s open-item table is closed by a
  recorded decision before its behavior is implemented, never by a guess.
- **No new skill without a recorded decision.** See "Repository setup" and
  "Open-item resolutions" in `docs/spec/okf-agent-skills-v0.1.0-completion.md`.

For how to run the suite and what a good test is, see `CONTRIBUTING.md`.
