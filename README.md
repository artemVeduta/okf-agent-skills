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
wrapper scripts into one of the two canonical skills stores — the project
`.agents/skills/` store or the global `~/.agents/skills/` store — and creates
harness-specific links only where a harness requires them. Each skill carries
its own copy of the runtime under `<skill-root>/scripts/`, and each `SKILL.md`
runs `node <skill-root>/scripts/<skill-name>.js`, so an installed skill is
independently executable and never resolves its wrapper from your working
directory or `PATH`.

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
lists — including the canonical runtime tree it copies to
`<target-directory>/okf-agent-skills/scripts/` — and nothing outside that
directory. The installed hook runs that target-local copy, so the tag checkout
is not a runtime dependency after installation. The same script also takes
`disable` and `uninstall` in place of `install`, against the same directory.
No manifest lists an `agents/` path: `v0.1.0` installs no delegated agent
definition, and the delegated execution path is not reachable after
installation.

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

`<target-directory>` names the OpenCode configuration root and stays a
required argument you supply — never inferred. Two shapes are supported:

- **Project scope:** `<repo>/.opencode/`.
- **Global scope:** `$OPENCODE_CONFIG_DIR` when set; otherwise
  `$XDG_CONFIG_HOME/opencode/`, defaulting to `~/.config/opencode/`.

Install places the plugin below OpenCode's native `plugins/` directory under
an OKF-specific filename — `<target-directory>/plugins/okf-agent-skills.js`
— never flat alongside the config file, and it never creates, replaces,
merges, or removes `opencode.json`, `opencode.jsonc`, or the legacy global
`config.json`.

**A successful `install` is not a working adapter by itself.** OpenCode
configuration is a required manual step this release does not perform: merge
the effective `permission.skill: deny` rules for `okf`, `okf-read`,
`okf-write`, `okf-lifecycle`, and `okf-review` — shown below — into your own
`opencode.json` or `opencode.jsonc`, after any broader permission pattern,
since OpenCode applies the last matching rule:

```json
{
  "permission": {
    "skill": {
      "okf": "deny",
      "okf-read": "deny",
      "okf-write": "deny",
      "okf-lifecycle": "deny",
      "okf-review": "deny"
    }
  }
}
```

`install`'s response reports this merge as its `next_action` and never
claims the adapter is ready. `disable` and `uninstall` touch only
receipt-owned adapter files under `<target-directory>` and never read or
write `opencode.json`, `opencode.jsonc`, or `config.json`:

```
node scripts/okf-adapter.js disable opencode <target-directory>
node scripts/okf-adapter.js uninstall opencode <target-directory>
```

No live OpenCode process test gates this release; deterministic fixtures
(`test/issue-105.test.js`, alongside `test/issue-66-adapters.test.js`) prove
the paths above, file ownership, the non-overwrite guarantee, the reported
`next_action`, disablement, and removal.

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
- Windows. This release targets macOS and Linux only.
- A CLI binary and an npm package. The skills install from this
  repository, and the only executables are the wrapper scripts.

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
