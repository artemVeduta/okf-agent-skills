---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/91
status: draft
type: Decision
---
# Decide delegated execution and settings scope for v0.1.0

Status: Closed

## Question

Which delegated execution path and settings-precedence behavior must be reachable after `v0.1.0` installation, and which accepted claims must be narrowed if the shipped adapters cannot expose that path?

## Comment by artemVeduta

## Resolution

`v0.1.0` narrows the delegated-execution and settings claims to what the shipped
code can demonstrate. No dispatch code moves.

### Observed state

- `agents/okf-reader.md` and `agents/okf-writer.md` are in no adapter manifest
  `installs` list. No harness installs a delegated role.
- `scripts/adapter-bridge.js` accepts `okf-read` and `okf-write` only and exits
  64 on any other skill. `scripts/okf-delegate.js` is unreachable from an
  installed adapter. Each manifest `bridge` block is unread data.
- Delegation is `spawnSync` of a sibling wrapper script, not a harness sub-agent.
  `agents/okf-writer.md` already states this.
- `brief.settings` is enum-validated in `scripts/lib/delegation.js` and then
  discarded. `buildRequest` does not copy it and `scripts/lib/runtime.js` does
  not read it. No settings resolver, precedence chain, or default value exists.
- The settings storage, syntax, and scope row stays `Open` in
  `docs/spec/okf-agent-skills-v0.1.0.md`.

### Decision

1. **Reachable path.** The delegated path is not reachable after installation in
   `v0.1.0`. Delegation stays a repository-internal process-seam contract that
   `node --test "test/*.test.js"` covers. Adapters install no agent definition.
   Installing an inert agent file is refused, because its declared `tools`
   allowlist is never in force. Wiring the path would close an `Open` spec row by
   a guess.
2. **`brief.settings`.** The field stays required and enum-validated, and it
   stays inert. It is a reserved forward seam. The receipt contract and the
   documentation must state that it selects no execution placement. The brief
   shape and the twelve-field checks do not change.
3. **Narrowed claims.** `CONTEXT.md:187` (the preference chooses placement) and
   `CONTEXT.md:715` (the four-layer precedence chain with session-override
   expiry) are retained design for a later release, in the same form as the
   `#43` guard items. They are not shipped behavior in `v0.1.0`.

### Evidence that closes it

Documentation, plus one new assertion that no manifest `installs` entry contains
an `agents/` path and that `scripts/adapter-bridge.js` rejects `okf-delegate`.
The bridge rejection is the load-bearing fact behind the narrowed claim and has
no test today. `test/issue-68-agents.test.js` already asserts that installation
copies no agent definition.

### Where the narrowing is written

`CONTEXT.md`, the `README.md` installation section (one sentence, because an
installer is the reader most likely to expect a delegated agent), and the
accepted-claims record in `docs/spec/okf-agent-skills-v0.1.0-completion.md`.

### Effect on other tickets

[Implement delegated execution and settings release scope](https://github.com/artemVeduta/okf-agent-skills/issues/97)
becomes a documentation-and-one-test task with no runtime change. It stays open
with a restated body.
