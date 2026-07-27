# Prototype — workspace discovery, trust, and routing

**Throwaway.** Lives on `prototype/workspace-discovery`, never on `main`. It exists to answer one
question from wayfinder ticket [#27](https://github.com/artemVeduta/okf-agent-skills/issues/27);
the validated decision is what graduates, not this code.

## The question

When a user drives the harness working directory across the six workspace topologies and both
Tilt scenarios, which deterministic discovery and routing transitions feel safe and unsurprising:

1. the machine must **never read above or sideways** from a repository unless explicitly
   authorized — and must not name back what it refused to look at; and
2. the human must always be able to see **which gate** refused, because each gate has a different
   fix and may require harness-specific configuration.

Out of the question's scope, deliberately: what happens when two bundles define the same concept —
merge, shadow, or subsumption semantics and the concept identity key are issues
[#22](https://github.com/artemVeduta/okf-agent-skills/issues/22) /
[#24](https://github.com/artemVeduta/okf-agent-skills/issues/24). This prototype decides which
bundles are **in scope and in what order**; it never opens one, never compares two concepts, and
never answers "are these the same concept?".

## Run it

```bash
node prototypes/workspace-discovery/tui.ts          # drive it by hand
node prototypes/workspace-discovery/walkthrough.ts  # replay the 52 hard cases
```

Node 22.6+ (type stripping); no dependencies, no package manager, nothing written to disk.

## Files

| File              | Keep?                                                              |
| ----------------- | ------------------------------------------------------------------ |
| `discovery.ts`    | **yes** — pure resolver, no I/O, no clock, no harness coupling      |
| `world.ts`        | no — eight fake filesystems and the mutations that perturb them     |
| `driver.ts`       | no — keystroke glue shared by the TUI and the walkthrough           |
| `tui.ts`          | no — terminal shell                                                 |
| `walkthrough.ts`  | no — scripted replay of the case catalogue                          |

## The model

**Four gates, in a fixed order.** A candidate bundle passes `REACH → PRESENCE → {TRUST, ACCESS}`.
Reach is the boundary; presence is the world; trust is a human decision about a repository
identity; access is a harness configuration. Each has a different fix, so collapsing any two of
them produces a message the human cannot act on.

**Reach short-circuits and stays silent; the in-scope gates do not.** A path the boundary refused
is not stat-ed, not trust-checked, and not named back — unless the human named it first, in which
case naming it back discloses nothing. Only the codes that describe something *outside* the
authorized scope are withheld (`ABOVE_GIT_ROOT`, `SIDEWAYS_SIBLING`, `OUTSIDE_WORKSPACE`,
`SYMLINK_ESCAPE`, `CWD_NOT_A_WORKSPACE`); everything refused from inside the scope is reported in
full. Trust and access, by contrast, are evaluated together and both failures are shown at once.

**Scope phases.**

```
unscoped ─(cd into a repo)────────────→ repo ─(explicit bootstrap)──→ federated
   │                                      │                              │
   └─(explicit bootstrap)─────────────────┴──────────────────────────────┘
                            any of the above ─(manifest major version)→ rejected
```

`unscoped` is the portable floor — without an explicit additional-directory grant, Codex gives a
skill nothing above cwd when there is no repository (§2.1), so the machine must be correct with
zero adapters. The **current repository is trusted implicitly**; nothing else is.

**The tested authority candidates are short, not exhaustive.** This prototype exercises a
user-selected workspace root, a manifest at or below the ceiling, and a manifest supplied out of
band. Not cwd. Not a `projects/` folder. Not a dependency symlink. Not an access-only harness grant
— **access is not authority**: being able to read a path never widens what is looked at, and
declaring a path never grants permission to read it (§7.3, "a manifest does not grant filesystem
access"). Whether harness-native multi-root bootstrap is a fourth authority source remains open.

Codex CLI does have an access fix for paths outside its native workspace: start it with repeatable
`--add-dir <path>` flags. The first-party CLI reference says this grants additional directories
write access alongside the main workspace. In this model that flag contributes an access grant
only; a selected root or manifest must independently authorize discovery. Source checked
2026-07-27: [OpenAI Codex CLI reference](https://developers.openai.com/codex/developer-commands/?surface=cli).

**Reads may federate; writes never do.** The write target is the nearest admitted bundle at or
above cwd *inside the current repository*. A federated peer and a non-repository workspace root are
never write targets, so widening read scope can never silently redirect a write. The research doc
states no write rule at all — this is the prototype's proposal.

**Trust is keyed on canonical repository identity** (§7.3), so a trusted repository that moves
stays trusted, and a different repository appearing at a trusted path does not inherit the grant.
These two look identical on the filesystem and must behave oppositely.

**Containment is recomputed on every call.** A symlink validated once and retargeted afterwards is
refused on the next call, because nothing caches an admission.

## What the prototype changed about the proposal

Three rules in `docs/research/workspace-topology-and-routing.md` did not survive contact:

- **The symlink allowlist and workspace containment are one check, not two.** Written as two
  sequential tests (§7.3 symlink policy, then §7.3 containment) the `allowlist` policy value is
  dead code: every target it admits is by definition outside the workspace, so the containment
  test rejects everything the allowlist just allowed. §3.5's "reject escape from the declared
  workspace *unless explicitly allowed*" is the reading that makes the policy mean anything.
- **§6.2's six statuses have no word for "untrusted".** A repository that is reachable, present,
  and readable but not trusted is none of `declared_missing` / `not_a_repository` /
  `bundle_missing` / `access_denied` / `invalid`. The prototype adds `untrusted` rather than
  collapsing it into `invalid`, which would name a policy decision as a defect.
- **§7.2's cache key is incomplete.** Keyed on repository identity + git HEAD + bundle content
  state, it does not change when trust is revoked, when the symlink policy tightens, when the
  harness changes, or when an admitted entry's resolved symlink target moves — so a stale
  admission survives every one of those. Driving `[u]` in the TUI shows the proposed key unchanged
  beside a key that moves.

And three of the doc's own contradictions were resolved in a direction, not left open:

- **A manifest above the git root cannot be discovered**, only supplied. §3.3 permits "a manifest
  at/above CWD"; §6.3.3 and §7.3 forbid the upward walk that would find it. Discovery ceiling is
  the git root (or cwd when there is no repository); above that, the manifest must arrive out of
  band. Tilt Scenario B is exactly this case.
- **A submodule is excluded as a dependency *of its parent*, not when cwd is inside it.** §3.6's
  blanket "exclude by default" would leave a session standing in a submodule with no bundle at all.
- **Monorepo member bundles enter scope only from the monorepo root.** Standing inside one child
  does not pull in its siblings — the same sideways rule as between repositories, one level down
  (§9 "child shadows root", §5.3 "scoped to changed packages only").

## Surfaced, not resolved

- **A bundle in a directory the monorepo manager does not declare.** §1 says not every
  subdirectory is a child; §6.3.1 walks up to any `okf/`. Both fire. The prototype admits it via
  the walk-up and flags it; which rule wins is a scoping decision, not a discovery one.
- **Whether a repository appearing at a declared path auto-activates or requires confirmation**
  (§6.2, §7.5). The prototype activates on re-resolution; §7.5 pre-emptively vetoes hard-coding
  any TTL, so no clock exists here at all.
- **Whether a harness-native multi-root input should count as a bootstrap signal.** §7.3 lists it
  alongside a user-selected root; the prototype deliberately treats `--add-dir`-style grants as
  access-only so that granting access and widening scope stay visibly separate. A distinct
  harness-native multi-root bootstrap signal remains a candidate authority source, not a ruled-out
  one. Testing that policy requires a distinct authority signal and corresponding
  `pickBootstrap` handling.
- **Which repository owns an overlapping path** when a git repo is nested inside another's working
  tree. The prototype flags the anomaly and refuses to pick (§3.6).
- **Where the workspace-level bundle of a non-repository root physically lives**, and what trust
  key it has when there is no repository identity to key on. The prototype treats authorizing the
  root as trusting what has no repo of its own.
