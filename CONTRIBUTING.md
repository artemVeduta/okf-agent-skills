# Contributing

## Run the suite

    node --test "test/*.test.js"

This is the command verified to discover every test file in this repository.
Do not use or document `node --test test/`; it misses files.

## What a good test is here

A test asserts behavior a harness adapter can observe, not the shape of a
runtime module, a private function name, or an internal call order. It is
deterministic: no wall clock, no network, no harness process, no model call.
Full rule set, including what a safety test must assert: "Testing Decisions"
in `docs/spec/okf-agent-skills-v0.1.0-completion.md`.

## Rules that apply to every change

See `AGENTS.md`: zero dependencies, one contract seam, no invented value for an
open specification row, no new skill without a recorded decision.
