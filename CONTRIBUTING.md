# Contributing

## Run the suite

    node --test "test/*.test.js"

This is the command verified to discover every test file in this repository.
`node --test test/` misses files and MUST NOT be used or documented instead.
A correct run reports zero `fail`, zero `cancelled`, and a `pass` count equal
to `tests` in the runner's own summary line.

## What a good test is here

A test asserts behavior a harness adapter can observe, not the shape of a
runtime module, a private function name, or an internal call order. It is
deterministic: no wall clock, no network, no harness process, no model call.
Full rule set, including what a safety test must assert: "Testing Decisions"
in `docs/spec/okf-agent-skills-v0.1.0-completion.md`.

## Rules that apply to every change

- **One contract seam.** The only tested boundary is a skill's wrapper
  script, driven as a process and asserted on its stdout. Same spec section
  above states what unit tests under `scripts/lib/` may and may not carry.
- **Zero dependencies.** Nothing outside the Node.js standard library, ever.
  See "Repository setup" in the same document.
- **Decision before behavior.** A decision closes an `Open` row of
  `docs/spec/okf-agent-skills-v0.1.0.md`'s open-item table before the
  behavior it blocks is implemented. Don't invent a value for an open row.
