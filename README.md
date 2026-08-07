# OKF Agent Skills

Cross-harness agent skills for maintaining an
[Open Knowledge Format](https://okf.md/) bundle — a lightweight, file-based
knowledge base of Markdown concepts — from Claude Code, OpenAI Codex, and
OpenCode. One `okf` router skill dispatches to five leaf skills:

| Skill | Job |
| --- | --- |
| `okf-read` | Safe inspection: navigate a bundle from its root index to a concept body using ordinary file tools. |
| `okf-write` | The sole path for bounded mutations — create, revise, format, relate, machine-verify. |
| `okf-lifecycle` | Narrow automatic synchronization, plus explicit reconciliation. |
| `okf-review` | Reads, validates, and reports trust tiers and staleness. It never confirms, approves, or mutates. |
| `okf-setup` | Inspects the three `/setup` config files and, once approved, bootstraps the bundle-root `index.md` via `init` and repairs `.okf-active`/`.okf-workspace.json`; for a monorepo, `plan` detects package boundaries and builds one sub-agent brief per package and `aggregate` reports their results into the shared workspace manifest; `discover` scans the active project (or, scoped to one monorepo package, its own subtree) and classifies each candidate source document as markdown, unsupported, other, or ambiguous; `migration-plan` turns that inventory into a fully-determined migration plan — migrate, skip, retain as residue, or blocked pending one compact batched round of user decisions; `partition` groups an executable plan into shards by directory locality, builds each shard's fresh-context worker brief, and validates a worker's returned shard against it; `assemble` combines every validated shard into one staged bundle, blocking on a cross-shard concept-target collision, surfacing an exact cross-shard duplicate as a candidate, resolving a cross-shard link or naming the migration-caused relationship loss when it cannot, and marking the result `partial` while any shard blocker remains; `report` turns migration signals into post-setup analytics for the agent to render. Direct invocation only. |

The skills are backed by a zero-dependency Node.js runtime (`scripts/lib/`)
driven through one thin wrapper script per skill. See
[`docs/spec/okf-agent-skills-v0.1.0.md`](docs/spec/okf-agent-skills-v0.1.0.md)
for the full behavioral specification and
[`docs/spec/okf-agent-skills-v0.1.0-completion.md`](docs/spec/okf-agent-skills-v0.1.0-completion.md)
for the decisions that closed this release's remaining open items — cited
below as **D5**–**D10**.

## Install

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

### Claude Code

The repo root is a self-contained Claude Code plugin. After base install the
repo lands at `~/.claude/skills/okf-agent-skills/` and Claude Code
auto-discovers `.claude-plugin/plugin.json` at startup. No separate adapter
install step.

If the base install skipped Claude Code linkage, install from the
marketplace inside an active Claude Code session:

```
/plugin marketplace add artemVeduta/okf-agent-skills
/plugin install okf-agent-skills@okf-agent-skills
```

Hook approval must be enabled in Claude Code for the `SessionStart` hook to
fire. The hook runs `node ${CLAUDE_PLUGIN_ROOT}/scripts/adapter-hook.js
claude-code ${CLAUDE_PLUGIN_ROOT}/manifest.json` — all paths resolved
relative to the plugin install root, no target directory placeholder.

### OpenCode

Install the `@artemVeduta/okf-agent-skills-opencode` npm package as a plugin.
Either:

```
opencode plug @artemVeduta/okf-agent-skills-opencode
```

Or add it to your `opencode.json` or `opencode.jsonc`:

```json
{ "plugin": ["@artemVeduta/okf-agent-skills-opencode"] }
```

**A successful install is not a working adapter by itself.** Permission rules
are a required manual step this release does not perform. Merge the
`permission.skill` deny rules from
[`packages/opencode/config.json`](packages/opencode/config.json) into your
opencode config, after any broader permission pattern, since OpenCode applies
the last matching rule.

### Codex

Copy `packages/codex/` from the release tag into the Codex plugin directory.
One install command is not yet available; the directory copy is the supported
path until the marketplace end-to-end flow hardens.

```
git clone --branch v0.1.0 https://github.com/artemVeduta/okf-agent-skills.git
cp -r okf-agent-skills/packages/codex ~/.codex/plugins/okf-agent-skills
```

The `.codex-plugin/plugin.json` at the plugin root declares skills and hooks
paths; hooks use `${PLUGIN_ROOT}` for all path resolution. Codex loads the
plugin layer only for trusted projects.

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

## License

[MIT](LICENSE)
