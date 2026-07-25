# Cross-Harness Skill Architecture and Lifecycle Integration

> Synthesized from 5 parallel fanout research investigations into Claude Code, Codex, OpenCode, the skills CLI (`npx skills`), and skill-authoring guidance (Anthropic + Matt Pocock). All underlying claims are cited in the source reports under `docs/research/ecosystem-deep/`.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Common Ground: What All Three Harnesses Share](#the-common-ground-what-all-three-harnesses-share)
3. [Dimension-by-Dimension Map](#dimension-by-dimension-map)
4. [Architecture Decision: Converge on the Standard](#architecture-decision-converge-on-the-standard)
5. [Cross-Harness Delivery via `npx skills`](#cross-harness-delivery-via-npx-skills)
6. [Scripts, Runtime Boundaries, and Release Packaging](#scripts-runtime-boundaries-and-release-packaging)
7. [Recommended Skill Topology for `okf-agent-skills`](#recommended-skill-topology-for-okf-agent-skills)
8. [Compatibility Table](#compatibility-table)
9. [Open Questions](#open-questions)

---

## Executive Summary

All three harnesses — Claude Code, Codex, and OpenCode — share a common skill format: a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) and a Markdown body. This format is the **Agent Skills** open standard (`agentskills.io`), originally developed by Anthropic and now adopted by 70+ agents.

**The architecture for cross-harness OKF behavior is: author to the standard, deliver through `npx skills`, and conditionally extend per-harness features through frontmatter fields each harness ignores silently.** The `npx skills` CLI provides the installation layer — it copies skills into a canonical `.agents/skills/` directory (read by Codex and OpenCode) and symlinks them into `.claude/skills/` (read by Claude Code). A single skill directory works across all three without modification.

Beyond the shared core, harnesses diverge on hooks, subagents, approval models, and frontmatter extensions. The architecture must avoid coupling to any harness-specific feature, using the standard frontmatter fields that all three silently ignore when unsupported.

---

## The Common Ground: What All Three Harnesses Share

Every claim below is verified against primary documentation for all three harnesses. See source reports for citations.

### Shared Format

```
skill-name/
├── SKILL.md          # YAML frontmatter + Markdown body (required)
├── scripts/          # Executable code (optional)
├── references/       # Documentation loaded on demand (optional)
├── assets/           # Templates, resources (optional)
└── agents/           # Agent-specific metadata (optional)
```

### Shared Frontmatter

| Field | Required | Constraints | Claude Code | Codex | OpenCode |
|-------|----------|-------------|-------------|-------|----------|
| `name` | Standard-required | 1-64 chars, `[a-z0-9]+(-[a-z0-9]+)*`, must match directory name | Supported | Supported | Supported |
| `description` | Standard-required | 1-1024 chars, third person | Supported | Supported | Supported |
| `license` | Optional | Short string | Supported | Supported | Supported |
| `compatibility` | Optional | 1-500 chars | Unknown | Supported | Supported |
| `metadata` | Optional | `string -> string` map | Unknown | Supported | Supported |

### Shared Discovery

All three harnesses scan the filesystem for `SKILL.md` files:

| Location | Claude Code | Codex | OpenCode |
|----------|-------------|-------|----------|
| Project `.claude/skills/` | Yes (primary) | No | Yes (compat) |
| Project `.agents/skills/` | No | Yes (primary) | Yes (compat) |
| Project `.opencode/skills/` | No | No | Yes (primary) |
| Global `~/.claude/skills/` | Yes | No | Yes (compat) |
| Global `~/.agents/skills/` | No | Yes | Yes (compat) |
| Global `~/.config/opencode/skills/` | No | No | Yes |
| Global `/etc/codex/skills/` | No | Yes | No |
| Walk-up (CWD to git root) | Yes (parent dirs) | Yes (to repo root) | Yes (to git worktree) |

### Shared Loading Mechanism

- Skill descriptions are loaded at session start (included in context or tool description)
- Full `SKILL.md` body loads on invocation (either agent-decided or user-invoked)
- All three support `disable-model-invocation: true` (or equivalent) to prevent agent auto-invocation
- All three honor the standard's progressive disclosure: metadata -> instructions -> resources

---

## Dimension-by-Dimension Map

### 1. Skill Discovery

| Feature | Claude Code | Codex | OpenCode | Verdict |
|---------|-------------|-------|----------|---------|
| Filesystem scanning | Yes | Yes | Yes | Compatible |
| Walk-up from CWD | Yes (parent dirs) | Yes (to root) | Yes (to git worktree) | Compatible |
| Symlink support | Yes | Yes | Not documented | Probably compatible |
| Live reload on change | Yes | Yes (restart sometimes needed) | Not documented | Assume restart |
| Config-based discovery | No (filesystem-only) | No (filesystem-only) | No (filesystem-only) | Compatible |

**Implication**: Skills placed in any of `.claude/skills/`, `.agents/skills/`, or `.opencode/skills/` are discovered. The `npx skills` CLI handles placing skills into the right directories for each agent.

### 2. Frontmatter

Common denominator: `name` + `description`. Everything else is harness-specific and must be treated as optional.

| Feature | Claude Code | Codex | OpenCode |
|---------|-------------|-------|----------|
| `disable-model-invocation` | Yes | Yes (via `allow_implicit_invocation` in `openai.yaml`) | Not documented |
| `user-invocable` | Yes | No equivalent | No equivalent |
| `allowed-tools` | Yes (mature) | Yes (experimental) | Not documented for skills |
| `disallowed-tools` | Yes | No | No |
| `model` / `effort` overrides | Yes | No | No |
| `context: fork` (subagent) | Yes | No | No |
| `hooks` (skill-scoped) | Yes | No | No |
| `paths` (glob activation) | Yes | No | No |
| `arguments` / `argument-hint` | Yes | No | No |
| String substitution (`$ARGUMENTS`, etc.) | Yes | No | No |
| Dynamic context injection (`` !`cmd` ``) | Yes | No | No |

**Design rule**: Never depend on a frontmatter field that isn't in the common denominator. Extension fields are safe to *include* (harnesses ignore unknown fields silently) but must not be load-bearing for the skill's core behavior.

### 3. Hooks / Session Lifecycle

This is the **largest gap** — the three harnesses have fundamentally different hook architectures:

| Harness | Hook Mechanism | Configuration | Skill-Scoped? |
|---------|---------------|---------------|---------------|
| Claude Code | 20+ lifecycle events in `settings.json` or frontmatter | JSON, hooks defined in `hooks/` directory or inline | Yes (via `hooks` frontmatter in SKILL.md) |
| Codex | 10+ lifecycle events | `hooks.json` or `config.toml` with `[[hooks]]` tables | No (session-scoped only, not skill-scoped) |
| OpenCode | Plugin-based TypeScript event subscriptions | `.opencode/plugins/` with `tool.execute.before`/`.after` and session events | No (plugin-scoped, not skill-scoped) |

**Implication**: Skill-level hooks cannot be portable. OKF lifecycle behavior (auto-read on session start, small evidence-backed updates on code review, compaction guards) must be implemented differently per harness:

- **Claude Code**: Use `hooks` in skill frontmatter or project-level `settings.json`
- **Codex**: Use project-level `hooks.json` with `PreToolUse` / `PostToolUse` matchers
- **OpenCode**: Implement as a TypeScript plugin subscribing to `tool.execute.before` / `experimental.session.compacting`

This is a **feature gap** rather than a format divergence — hooks deliver the same *intent* (react to lifecycle events) through different *mechanisms*. A cross-harness architecture must acknowledge this as a per-harness implementation concern.

### 4. Subagents / Dynamic Workflows

| Feature | Claude Code | Codex | OpenCode |
|---------|-------------|-------|----------|
| Subagent definition format | Markdown + YAML frontmatter | TOML files | Markdown + YAML frontmatter or JSON config |
| Built-in subagents | Explore, Plan, General-purpose | default, worker, explorer | general, explore, scout |
| Skills preloaded in subagents | Yes (`skills` frontmatter field) | Yes (`skills.config` in agent TOML) | Agent-configured (no skill-specific field) |
| Skills running AS subagents | Yes (`context: fork`) | Not documented | Not documented |
| Subagent depth control | No limit found | Yes (`max_concurrent_threads_per_session`) | Yes (`subagent_depth`, default 1) |

**Implication**: An OKF lifecycle subagent (reading/writing documents, validating, detecting drift) can be defined as a standalone agent in each harness's format, or as a skill that Claude Code runs in a forked context. A subagent-based architecture is viable across all three but requires per-harness agent definitions. The skill itself (the knowledge and instructions) can be shared; the agent wrapper is harness-specific.

### 5. Installation & Directory Paths

| Dimension | Claude Code | Codex | OpenCode |
|-----------|-------------|-------|----------|
| Primary project dir | `.claude/skills/` | `.agents/skills/` | `.opencode/skills/` |
| Compat project dirs | None | None | `.claude/skills/`, `.agents/skills/` |
| Primary global dir | `~/.claude/skills/` | `~/.agents/skills/`, `/etc/codex/skills/` | `~/.config/opencode/skills/` |
| Compat global dirs | None | None | `~/.claude/skills/`, `~/.agents/skills/` |
| Symlink support | Yes | Yes | Not documented (assume yes) |
| CLI for skill mgmt | `npx skills` (third-party) | `$skill-installer` built-in | None (filesystem only) |

**Key insight**: OpenCode reads from `.claude/skills/` and `.agents/skills/` as compatibility paths. This means a single `.claude/skills/` or `.agents/skills/` directory serves all three harnesses — the only question is which approach to use as canonical.

### 6. Approval / Permission Model

| Feature | Claude Code | Codex | OpenCode |
|---------|-------------|-------|----------|
| Skill loading approval | No approval needed (description always in context) | No approval needed | Configurable via `permission.skill` (allow/ask/deny) |
| Tool execution within skill | `allowed-tools` / `disallowed-tools` frontmatter | `allowed-tools` (experimental), sandbox modes | Per-tool permission patterns + agent-specific overrides |
| Per-skill permissions | Yes (frontmatter) | Not documented (session-level only) | Yes (`permission.skill` with glob patterns) |
| Auto mode (skip approvals) | Yes (via permission rules) | Yes (sandbox + approval mode combos) | Yes (`--auto` or `permission: allow`) |
| Agent-specific overrides | Yes (subagent `permissionMode`) | Yes (custom agent `sandbox_mode`) | Yes (per-agent `permission` in config) |

**Implication**: The approval model is tightly coupled to each harness. The skill itself can declare `allowed-tools` for Claude Code and (experimentally) Codex, but the actual gatekeeping lives in each harness's configuration layer. An OKF skill's instructions must acknowledge this: document what permissions the skill *needs* (reads, writes, bash execution) without assuming how they'll be granted.

---

## Architecture Decision: Converge on the Standard

### Decision

**Author `okf-agent-skills` to the Agent Skills standard (`agentskills.io`).** Use the common denominator format (`SKILL.md` with `name` + `description` frontmatter, Markdown body) as the authoritative source. Deliver through `npx skills` which handles placement across all three harness directories. Treat harness-specific features (hooks, subagents, `allowed-tools`, `context: fork`, `paths`) as per-harness configuration, not part of the skill itself.

### Rationale

1. **Maximum reach**: The standard format is supported by 70+ agents, not just the target three. Future-proof.
2. **Single source of truth**: One `SKILL.md` per skill, with `npx skills` handling directory placement (copy to `.agents/skills/`, symlink to `.claude/skills/`).
3. **No locking**: Harnesses silently ignore unknown frontmatter fields, so including Claude Code-specific fields (e.g., `allowed-tools`, `model`) doesn't break Codex or OpenCode.
4. **Clear separation of concerns**: The skill is *what* the agent should know and *how* to think about OKF. The harness configuration is *when* and *with what permissions* this knowledge loads.
5. **Pocock's predictability principle**: Skills that vary behavior by harness are unpredictable. Skills that carry the same content everywhere, with harness differences isolated to configuration, are predictable.

### What this means concretely

- **Skill files** carry only standard frontmatter + Markdown instructions. No harness-specific logic in the skill body.
- **Harness configuration files** (`.claude/settings.json`, `.codex/hooks.json`, `.opencode/plugins/`) carry lifecycle hooks, permission rules, and subagent definitions.
- **A single `npx skills add` command** installs the entire OKF suite into all detected agents.
- **The skill suite is a git repo** with `SKILL.md` files, following the `npx skills` convention for discovery (root-level or `skills/` directory with `SKILL.md`).

---

## Cross-Harness Delivery via `npx skills`

### How `npx skills` bridges the gap

The `skills` CLI (`npx skills`) from Vercel Labs solves the distribution and directory-placement problem:

1. **Install**: `npx skills add artemVeduta/okf-agent-skills` clones the repo, discovers all `SKILL.md` files, copies them into `.agents/skills/<name>/` (canonical), then creates symlinks into `.claude/skills/<name>/`.
2. **Universal agents** (Codex, OpenCode, Cursor, Gemini CLI, etc.) read directly from `.agents/skills/` — no symlink needed. The canonical directory IS the agent's directory.
3. **Non-universal agents** (Claude Code, Windsurf, Kiro CLI) get symlinks from their agent-specific directory to the canonical `.agents/skills/<name>/`.
4. **Updates**: `npx skills update` pulls the latest git version and refreshes copies.
5. **Lock file**: `skills-lock.json` tracks installed versions for reproducibility.

### Installation layout produced by `npx skills`

After `npx skills add artemVeduta/okf-agent-skills`:

```
<project>/
├── .agents/skills/                    # canonical copy (Codex, OpenCode read here)
│   ├── okf-init/
│   │   └── SKILL.md
│   ├── okf-sync/
│   │   └── SKILL.md
│   └── okf-lifecycle/
│       └── SKILL.md
├── .claude/skills/                    # symlinks → .agents/skills/ (Claude Code reads here)
│   ├── okf-init → ../.agents/skills/okf-init
│   ├── okf-sync → ../.agents/skills/okf-sync
│   └── okf-lifecycle → ../.agents/skills/okf-lifecycle
├── .opencode/skills/                  # OpenCode also reads .claude/skills/ compat path
│   ...                                # (OpenCode finds skills via .claude/skills/ compat)
├── skills-lock.json                   # installed versions and source URLs
└── ...
```

OpenCode reads from `.claude/skills/` as a compatibility path, so symlinks there serve both Claude Code and OpenCode.

### Symlink mechanics (source-verified)

- `npx skills` **never symlinks from a git clone**. It always copies from source into `.agents/skills/`, then symlinks from agent-specific dirs to `.agents/skills/`.
- Symlink targets are **relative**, not absolute (portable).
- Symlink failure falls back to copy automatically (Windows compatibility).
- OpenCode and Codex are universal agents — they read `.agents/skills/` directly, so no symlink needed for them. The symlinks only exist for Claude Code's `.claude/skills/` directory.

### What `npx skills` does NOT do

- No npm publishing: skills are git repos, not npm packages
- No centralized registry: skills.sh is a leaderboard, not a registry
- No `link` command: local development requires `npx skills add ./path`
- No hook installation: hooks, subagents, and permissions must be configured separately per harness

### Recommendation for `okf-agent-skills`

Structure the repo so `npx skills` discovers all OKF skills:

```
okf-agent-skills/
├── skills/                    # root-level skills directory (convention)
│   ├── okf-init/
│   │   └── SKILL.md
│   ├── okf-sync/
│   │   └── SKILL.md
│   ├── okf-lifecycle/
│   │   └── SKILL.md
│   └── ...
├── .claude/                   # harness-specific config (not installed by npx skills)
│   ├── settings.json          # Claude Code hooks, permissions
│   └── agents/                # Claude Code subagent definitions
├── .codex/                    # harness-specific config
│   └── hooks.json             # Codex hooks
├── .opencode/                 # harness-specific config
│   └── plugins/               # OpenCode plugin (hook equivalents)
├── package.json               # optional: for dev tooling, not for npx skills
├── README.md
└── LICENSE
```

The harness-specific config directories (`.claude/`, `.codex/`, `.opencode/`) contain configuration that users must manually apply — they are NOT installed by `npx skills`. The README documents the manual setup per harness.

---

## Scripts, Runtime Boundaries, and Release Packaging

### Scripts

Skills may include a `scripts/` directory with executable code. Cross-harness considerations:

| Concern | Guidance |
|---------|----------|
| **Language** | Bash scripts are most portable (all three harnesses execute bash). Python requires a pre-installed interpreter. Node.js scripts require Node. |
| **Path references** | Use `${CLAUDE_SKILL_DIR}/scripts/...` in Claude Code. Codex and OpenCode have no equivalent variable — use relative paths from the skill directory, assuming CWD is the project root during execution. |
| **Approval** | Script execution is governed by each harness's permission model, not the skill. Document what scripts do and why they need execution permission. |
| **Error handling** | Anthropic guidance: "Solve, don't defer." Scripts should handle errors internally, not throw to the agent. |
| **Documentation** | List script dependencies in `compatibility` frontmatter field (e.g., `compatibility: requires python3, jq`). |

### Runtime boundaries

Skills are **instructions**, not runtime processes. The boundary is:

- **Skill**: Knowledge, steps, constraints — what the agent should know and how it should think.
- **Scripts**: Deterministic, testable executable logic that the skill tells the agent to invoke.
- **Hooks/Plugins**: Harness-specific lifecycle interceptors that trigger skills or scripts at specific events.
- **Subagents**: Isolated agent sessions with their own context, preloaded with relevant skills, used for expensive or side-effect-heavy operations.

**Anti-pattern**: Putting execution logic (bash commands, validation scripts) inline in the skill body. This duplicates code, can't be tested independently, and bloats the skill. Extract into `scripts/` and reference from the skill.

### Release packaging

The `npx skills` ecosystem uses **git-based distribution**, not npm or containers:

1. Push tagged commits to the public GitHub repo.
2. Users install via `npx skills add artemVeduta/okf-agent-skills@v0.1.0`.
3. The `skills-lock.json` file records the exact source and ref for reproducibility.
4. Updates: `npx skills update` pulls the latest tagged version.

**No `version` field in SKILL.md frontmatter** — versioning is purely git-based. The repo's git tags are the release versions.

**For CI/CD**: A pre-release checklist ensures all `SKILL.md` files validate against the agentskills.io spec (`npx skills-ref validate`), all scripts pass their unit tests, and the harness config files are in sync with the skill suite.

---

## Recommended Skill Topology for `okf-agent-skills`

Based on the common denominator format, the existing research (issues `#2`, `#3`), and the authoring guidance from both Anthropic and Pocock:

### Skills (model-invoked, standard format)

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `okf-init` | Model-invoked (requires discovery) | Set up OKF directory structure, create initial bundle for a project type (code-backed vs knowledge-only). Must be reachable when user says "set up OKF" or "initialize documentation." |
| `okf-sync` | Model-invoked | Read project state, produce evidence-backed diffs for OKF documents. Handles drift detection and small updates. Large/full syncs remain manual. |
| `okf-compact` | User-invoked (`disable-model-invocation: true`) | Compaction and archival of OKF documents — destructive enough that it must be human-initiated per the map's Notes. |
| `okf-validate` | Model-invoked | Validate OKF documents against the v0.2 spec, check links, surface drift. |
| `okf-review` | Model-invoked | Code review aide: reads OKF context, checks if changes align with documented intent, flags gaps. |

### Skills (user-invoked, router pattern per Pocock)

| Skill | Purpose |
|-------|---------|
| `okf` | Router skill. Points at all other OKF skills, naming each and when to use it. Cures cognitive load as the suite grows. |

### Per-harness configuration (not in skills)

| Harness | File | Contents |
|---------|------|----------|
| Claude Code | `.claude/settings.json` | `allowed-tools` rules for OKF skills, hooks for session-start context loading, `PostToolUse` hooks for automatic drift detection after file edits |
| Codex | `.codex/hooks.json` | `PostToolUse` hooks matching `Edit\|Write` tools, triggering `okf-lifecycle` validation |
| Codex | `.codex/agents/okf.toml` | Subagent definition for OKF validation and sync tasks, preloaded with `okf-*` skills |
| OpenCode | `.opencode/plugins/okf-lifecycle.ts` | TypeScript plugin subscribing to `tool.execute.after` and `experimental.session.compacting`, loading OKF context and running validation |
| OpenCode | `.opencode/agents/okf.md` | Subagent for deep OKF operations, with `okf-*` skill permissions |

---

## Compatibility Table

| Feature | Portability | Notes |
|---------|-------------|-------|
| `SKILL.md` format | Fully portable | All three use the identical standard format |
| `name` + `description` frontmatter | Fully portable | The only required fields in the standard |
| `metadata` frontmatter | Modestly portable | Supported by Codex and OpenCode; Claude Code support unknown |
| `license` frontmatter | Fully portable | Supported by all three |
| `compatibility` frontmatter | Modestly portable | Supported by Codex, OpenCode; Claude Code unknown |
| Skill discovery | Fully portable | All scan filesystems; `npx skills` handles placement |
| `allowed-tools` frontmatter | **Not portable** | Mature in Claude Code, experimental in Codex, absent in OpenCode |
| `disable-model-invocation` | **Not portable** | Claude Code and Codex have it; OpenCode has no documented equivalent |
| Hooks | **Not portable** | Fundamentally different mechanisms per harness |
| Subagents | **Not portable** | Different definition formats per harness |
| `context: fork` | **Claude Code only** | Not available in Codex or OpenCode |
| `paths` (glob activation) | **Claude Code only** | Not available in Codex or OpenCode |
| String substitution | **Claude Code only** | `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`, etc. not available elsewhere |
| Dynamic injection (`` !`cmd` ``) | **Claude Code only** | Not available in Codex or OpenCode |

---

## Open Questions

These surfaced during synthesis and may inform future tickets or fog:

1. **OpenCode's `disable-model-invocation` equivalent**: No primary source found for how to prevent OpenCode from auto-loading a skill. This matters for `okf-compact` and `okf` router.
2. **Codex skill-scoped hooks**: The current hooks system is session-scoped. Can hooks be scoped to specific skills? No primary source found.
3. **OpenCode's symlink behavior**: Not explicitly documented. Does OpenCode follow symlinks in its skill directories? If not, the `.claude/skills/` compat symlinks may not work.
4. **OpenCode's `permission.skill` and auto-invocation**: Does `permission.skill: "allow"` combined with a skill being listed in `<available_skills>` result in the agent auto-invoking it, or does it only remove the approval prompt for manual invocation?
5. **Codex `allowed-tools` maturity**: Marked "experimental" in the Agent Skills spec. When does it exit experimental? What's the current behavior in Codex?
6. **Standard evolution**: The Agent Skills standard is maintained by Anthropic with contributions from Vercel and others. How does it evolve? What's the governance model? This matters for long-term architecture stability.

---

## Sources

All claims in this report are backed by the following primary-source investigations:

| Report | File |
|--------|------|
| Claude Code Skill System Architecture | `docs/research/ecosystem-deep/claude-code-skills.md` |
| Codex Skill System Architecture | `docs/research/ecosystem-deep/codex-skills.md` |
| OpenCode Skill System Architecture | `docs/research/ecosystem-deep/opencode-skills.md` |
| `npx skills` CLI Investigation | `docs/research/ecosystem-deep/skills-cli.md` |
| Skill-Authoring Guidance Survey | `docs/research/ecosystem-deep/skill-authoring-guidance.md` |
