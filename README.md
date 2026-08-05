# OKF Agent Skills

Cross-harness agent skills for maintaining an
[Open Knowledge Format](https://okf.md/) bundle — a lightweight, file-based
knowledge base of Markdown concepts — from Claude Code, OpenAI Codex, and
OpenCode. One `okf` router skill dispatches to four leaf skills:

| Skill | Job |
| --- | --- |
| `okf-read` | Safe inspection: navigate a bundle from its root index to a concept body using ordinary file tools. |
| `okf-write` | The sole path for bounded mutations — create, revise, format, relate, machine-verify. |
| `okf-lifecycle` | Narrow automatic synchronization, plus explicit reconciliation. |
| `okf-review` | Reads, validates, and reports trust tiers and staleness. It never confirms, approves, or mutates. |

The skills are backed by a zero-dependency Node.js runtime (`scripts/lib/`)
driven through one thin wrapper script per skill. See
[`docs/spec/okf-agent-skills-v0.1.0.md`](docs/spec/okf-agent-skills-v0.1.0.md)
for the full behavioral specification and
[`docs/spec/okf-agent-skills-v0.1.0-completion.md`](docs/spec/okf-agent-skills-v0.1.0-completion.md)
for the decisions that closed this release's remaining open items — cited
below as **D5**–**D10**.

## Install

### Base install

```
npx skills add 'artemVeduta/okf-agent-skills#v0.1.0'
```

This is the one documented base install command, exact `#v0.1.0` Git-ref
syntax included. It places the router, the four leaf skills, and their
wrapper scripts into your skills store — the project `.agents/skills/` store
or, with `-g`, the global `~/.agents/skills/` store — and creates
harness-specific links only where a harness requires them.

**The base install only makes the skills discoverable.** It does not wire a
native session-start hook into any harness, does not create the OKF bundle
the skills operate on, and does not turn on any automatic behavior. Three
separate steps close those gaps, and the base install performs none of
them:

1. Install a native adapter (below) to wire the read-only orientation hook
   into a harness's session start.
2. Hand-author your bundle-root `index.md` (below) — this release cannot
   create it for you.
3. Create the `.okf-active` activation marker (below) — nothing runs
   automatically until you do, and installing never does this for you.

### Per-adapter install (native harnesses)

Each native adapter ships inside the `v0.1.0` tag at `adapters/<harness>/`
(decision **D6**) — there is no separate package and no second tag. Get a
checkout of the tag, then run its install script:

```
git clone --branch v0.1.0 https://github.com/artemVeduta/okf-agent-skills.git
cd okf-agent-skills
node scripts/okf-adapter.js install <harness> <target-directory>
```

`<harness>` is one of `claude-code`, `codex`, `opencode`. `<target-directory>`
is a **required argument you supply** — it is never inferred or defaulted —
and the adapter writes only the files its `adapters/<harness>/manifest.json`
lists, and nothing outside that directory. The same script also takes
`disable` and `uninstall` in place of `install`, against the same directory.

Per **D6**, the recommended directory below is a documentation value, drawn
from current, verified, first-party harness evidence
([`docs/research/adapter-install-targets.md`](docs/research/adapter-install-targets.md)),
not a value the code invents or falls back to.

#### Claude Code

```
node scripts/okf-adapter.js install claude-code ~/.claude/skills/okf-agent-skills
```

Recommended: `~/.claude/skills/<name>/`, per-user. Claude Code auto-loads any
folder here that carries a `.claude-plugin/plugin.json`, with no trust
dialog and no marketplace step.

#### Codex

```
node scripts/okf-adapter.js install codex .codex
```

Recommended: `<repo>/.codex/`, per-project — one adapter installation paired
with one bundle's repository. `~/.codex/` (or `$CODEX_HOME`) is an equally
valid, broader-scoped alternative. Either way, Codex loads a project's
`.codex/` layer only when it considers that project trusted; an untrusted
project skips it.

#### OpenCode

```
node scripts/okf-adapter.js install opencode <target-directory>
```

**No single verified target directory makes this adapter fully work today,
and this is a recorded gap, not a recommendation withheld.** See
[`docs/research/adapter-install-targets.md`](docs/research/adapter-install-targets.md#opencode)
for the full evidence: OpenCode's global config loader accepts
`config.json` only inside its one global config directory, never inside a
project's `.opencode/`; and its plugin loader discovers `plugin.js` only one
directory level *below* whichever directory holds the config, in a
`plugin/`/`plugins/` child — a level the manifest's flat `installs` layout
does not create anywhere. No target directory satisfies both rules at once,
so `plugin.js` — the file that actually wires the orientation hook — is not
discovered by the currently shipped layout under either candidate
directory. Fixing the layout is adapter-code work outside this release.

## First run: two steps this release cannot do for you

### 1. Author the bundle-root `index.md` by hand

Decision **D5** reclassified the write-gate bootstrap exception as
deferred, not granted: **`v0.1.0` never creates a bundle root.** There is no
`init`, no `migrate`, and no bootstrap path — a request naming any of those
is refused as an unknown operation. The one write-gate rule is that a
mutation requires the bundle-root `index.md` to already parse with an exact
root version declaration:

```yaml
---
okf_version: "0.2"
---
```

You write that file, at the bundle root, before your first `okf-write` call
can pass the write gate. Nothing in this suite initializes, creates, or
bootstraps a bundle for you.

### 2. Create the zero-byte activation marker

Automatic behavior — the read-only orientation a native adapter injects at
session start — stays off until a zero-byte regular file named
`.okf-active` exists at the Git worktree root:

```
touch .okf-active
```

Neither installing the base suite nor installing a native adapter creates
or modifies this file, and neither does entering a harness session.
Installing an adapter arms nothing by itself. Without the marker, automatic
behavior is a silent no-op and an explicit read reports `not-configured`;
mutation stays blocked either way until the marker exists.

## Limitations

This release discloses the following plainly, rather than leaving them for
a developer to discover by hitting them.

**Support ceiling — provisional.** The declared ceiling is 500 source
files, 100 MB of aggregate exact source bytes, and bundle-relative
directory depth 6. Every appearance of this ceiling in this release,
including here, is labeled **provisional** (decision **D10**): it is an
inclusive claim boundary, not a hard read limit, and this release makes
**no calibrated or measured claim** about it anywhere. Reading may continue
above the ceiling without a completeness claim. The fixture corpora that
would calibrate it are deferred to `v0.2.0`.

**No concurrency control, no crash recovery.** Concurrent writers are not
serialized, and crash recovery is not provided. A recovery snapshot, an
operation store, a rollback path, and crash reconciliation are all
retained design for a later guarded release, not part of `v0.1.0`.

**Deferred scope.** Out of scope for this release:

- The manual-operation guard, guard ledger, guard lock, preview/approval
  flow, durable operation store, recovery snapshots, rollback, and crash
  reconciliation.
- Migration writes, concept merge and split, archive relocation, and
  cross-repository writes.
- A write-gate bootstrap exception for creating a new bundle root
  (**D5**).
- Fixture corpora and scale strata that would calibrate the support
  ceiling (**D10**).
- Live Claude Code, Codex, and OpenCode process tests; the adapter
  fixtures in `test/` are this release's gate instead.

**Unrelated to the other public OKF skill.** This project is unrelated to
[`fabricioctelles/okf-open-knowledge-format`](https://github.com/fabricioctelles/okf-open-knowledge-format)
(decision **D9**). The two share no install name, install path, or
configuration namespace. This release claims no compatibility, no
replacement, and no interoperability with it in either direction.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to run the suite and what
a good test here looks like, [`AGENTS.md`](AGENTS.md) and
[`CLAUDE.md`](CLAUDE.md) for the rules an agent working in this repository
must not violate by reflex, and [`SECURITY.md`](SECURITY.md) to report a
vulnerability privately.

```
node --test "test/*.test.js"
```

## License

[MIT](LICENSE)
