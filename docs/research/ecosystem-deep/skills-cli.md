# `npx skills` CLI — Deep Investigation

> Exhaustive research from primary sources: npm registry, GitHub repository, specification site, and source code (v1.5.20).

---

## 1. Package Identity

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/vercel-labs/skills |
| **npm** | https://www.npmjs.com/package/skills |
| **Stars** | 27.2k |
| **Forks** | 2.3k |
| **Commits** | 430 |
| **License** | MIT |
| **Language** | TypeScript |
| **Version** | 1.5.20 (published 4 days ago) |
| **Weekly Downloads** | ~10.7M |
| **Publishers** | [rauchg](https://www.npmjs.com/~rauchg), [quuu](https://www.npmjs.com/~quuu) — Vercel |
| **Node Requirement** | Node.js >= 22.20.0 |
| **Package Manager** | pnpm 10.17.1 |
| **Dependencies** | `yaml` (^2.8.3) only runtime dependency |
| **Build Tool** | `obuild` (bundled distribution) |
| **Homepage** | https://skills.sh |
| **Specification Site** | https://agentskills.io |

**Sources**: [npm registry](https://www.npmjs.com/package/skills), [GitHub repo](https://github.com/vercel-labs/skills), [package.json](https://raw.githubusercontent.com/vercel-labs/skills/main/package.json)

### Binary

The package exposes two CLI bins:
- `skills` → `./bin/cli.mjs`
- `add-skill` → `./bin/cli.mjs` (alias)

**Source**: [package.json bin field](https://raw.githubusercontent.com/vercel-labs/skills/main/package.json)

---

## 2. Commands

All commands are documented in the npm README, GitHub README, and the CLI `--help` output.

### `npx skills add <source>` (alias: `a`, `install`, `i`)

Install agent skills from a repository, URL, or local path.

**Source formats**:
- GitHub shorthand: `vercel-labs/agent-skills`
- Full GitHub URL: `https://github.com/vercel-labs/agent-skills`
- Direct skill path: `https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines`
- GitLab URL: `https://gitlab.com/org/repo`
- Any git URL: `git@github.com:vercel-labs/agent-skills.git`
- Local path: `./my-local-skills`
- Well-known URL (RFC 8615): Any URL with `/.well-known/agent-skills/index.json` or `/.well-known/skills/index.json`
- Ref/branch/tag: `'vercel-labs/agent-skills#v0.1.0'`
- Skill filter: `vercel-labs/agent-skills@skill-name`
- Ref plus skill filter: `'vercel-labs/agent-skills#v0.1.0@skill-name'`

Quote sources containing `#` in shell examples because an unquoted `#` starts a shell comment in common shells. Current `source-parser.ts` parses the URL fragment as the git ref and the `@` suffix as an optional skill filter.

**Source**: [npm README "Source Formats"](https://www.npmjs.com/package/skills), [src/source-parser.ts](https://github.com/vercel-labs/skills/blob/main/src/source-parser.ts)

**Options**:

| Option | Description |
|---|---|
| `-g, --global` | Install to user home directory instead of project |
| `-a, --agent <agents...>` | Target specific agents (e.g., `claude-code`, `codex`). Use `'*'` for all |
| `-s, --skill <skills...>` | Install specific skills by name. Use `'*'` for all |
| `-l, --list` | List available skills without installing |
| `--copy` | Copy files instead of symlinking |
| `-y, --yes` | Skip all confirmation prompts |
| `--all` | Shorthand for `--skill '*' --agent '*' -y` |
| `--full-depth` | Search all subdirectories even when root SKILL.md exists |
| `--metadata <json>` | Attach valid JSON to the install telemetry event |
| `--subagent <names>` | Install to Eve subagents (use `'root'` for the root agent) |

**Source**: [npm README "Options"](https://www.npmjs.com/package/skills), [src/cli.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/cli.ts)

### `npx skills use <source>@<skill>` (alias: none)

Generate a prompt for one skill without installing it. Writes skill files to a temporary directory, prints the generated prompt to stdout. With `--agent`, starts a supported coding agent interactively.

**Options**: `-s, --skill <skill>`, `-a, --agent <agent>`, `--full-depth`, `--dangerously-accept-openclaw-risks`

**Source**: [npm README "Use a Skill Without Installing"](https://www.npmjs.com/package/skills), [src/use.ts](https://github.com/vercel-labs/skills/blob/main/src/use.ts)

### `npx skills list` (alias: `ls`)

List all installed skills (project and global). Similar to `npm ls`.

**Options**: `-g, --global` (global only), `-a, --agent <agents>` (filter by agent), `--json` (machine-readable output)

**Source**: [npm README "skills list"](https://www.npmjs.com/package/skills), [src/list.ts](https://github.com/vercel-labs/skills/blob/main/src/list.ts)

### `npx skills find [query]` (alias: `search`, `f`, `s`)

Search for skills interactively (fzf-style) or by keyword.

**Options**: `--owner <owner>` (search only repos from a GitHub owner)

**Source**: [npm README "skills find"](https://www.npmjs.com/package/skills), [src/find.ts](https://github.com/vercel-labs/skills/blob/main/src/find.ts)

### `npx skills remove [skills...]` (alias: `rm`, `r`)

Remove installed skills from agents.

**Options**: `-g, --global` (from global scope), `-a, --agent <agents>` (from specific agents, `'*'` for all), `-s, --skill <skills>` (specific skills, `'*'` for all), `-y, --yes` (skip confirmation), `--all` (shorthand for `--skill '*' --agent '*' -y`)

**Source**: [npm README "skills remove"](https://www.npmjs.com/package/skills), [src/remove.ts](https://github.com/vercel-labs/skills/blob/main/src/remove.ts)

### `npx skills update [skills...]` (alias: `upgrade`, `check`)

Update installed skills to latest versions.

**Options**: `-g, --global` (global only), `-p, --project` (project only), `-y, --yes` (auto-detect scope)

**Source**: [npm README "skills update"](https://www.npmjs.com/package/skills), [src/update.ts](https://github.com/vercel-labs/skills/blob/main/src/update.ts)

### `npx skills init [name]`

Create a new SKILL.md template. If no name given, creates `./SKILL.md`. If name given, creates `<name>/SKILL.md`.

**Source**: [npm README "skills init"](https://www.npmjs.com/package/skills), [src/cli.ts `runInit`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/cli.ts)

### `npx skills experimental_install`

Restore skills from `skills-lock.json` into `.agents/skills/`. Reads the lock file, groups skills by source, and calls `runAdd` for each group.

**Source**: [src/install.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/install.ts), [src/cli.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/cli.ts)

### `npx skills experimental_sync`

Sync skills from `node_modules` into agent directories.

**Options**: `-a, --agent <agents>`, `-y, --yes`

**Source**: [src/cli.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/cli.ts), [src/sync.ts](https://github.com/vercel-labs/skills/blob/main/src/sync.ts)

---

## 3. Installation Model

### How `npx skills add` Works

The installation pipeline (from source to disk):

1. **Source parsing** (`source-parser.ts`): Parses the source argument into a `ParsedSource` with type (`github` | `gitlab` | `git` | `local` | `well-known`), URL, subpath, ref, and optional skill filter
2. **Fetching**:
   - **GitHub repos**: First tries a fast "blob install" via `skills.sh` download API for whitelisted repos (`vercel`, `vercel-labs`, `heygen-com` and repos listed in `BLOB_ALLOWED_REPOS`). Falls back to `git clone` into a temp directory.
   - **Other git/URL sources**: Clones repository via `simple-git` into temp directory
   - **Local paths**: Reads from filesystem directly
   - **Well-known URLs**: Fetches `/.well-known/agent-skills/index.json` (preferred) or `/.well-known/skills/index.json` (legacy)
3. **Skill discovery** (`skills.ts`): Recursively walks the repo for `SKILL.md` files. Searches at 2 levels deep for catalog layouts, plus agent-specific directories. Parses frontmatter for `name` and `description`.
4. **Installation** (`installer.ts`):
   - Skills are copied from source to a **canonical directory**: `<project>/.agents/skills/<skill-name>/` (project) or `~/.agents/skills/<skill-name>/` (global)
   - Then symlinked or copied from canonical to agent-specific directories

**Source**: [src/add.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/add.ts), [src/installer.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/installer.ts)

### Directory Structure After Installation

**Project install** (`npx skills add owner/repo`):
```
.agents/skills/<skill-name>/     # canonical copy (universal agents read from here)
.claude/skills/<skill-name>      # symlink → .agents/skills/<skill-name> (non-universal agents)
.cursor/skills/<skill-name>      # symlink → .agents/skills/<skill-name>
.kiro/skills/<skill-name>        # symlink → .agents/skills/<skill-name>
```

**Global install** (`npx skills add owner/repo -g`):
```
~/.agents/skills/<skill-name>/   # canonical copy in default symlink mode
~/.claude/skills/<skill-name>    # symlink → ~/.agents/skills/<skill-name> when Claude Code is selected
```

In current symlink-mode source, agents whose project `skillsDir` is `.agents/skills` are treated as universal at both project and global scope. Codex and OpenCode therefore use `~/.agents/skills/` directly in this mode; the installer does not create `~/.codex/skills/` or `~/.config/opencode/skills/` links for them. The README's agent table lists each agent's native global path, but that table does not describe the installer's canonical-store shortcut. With `--copy`, files instead go directly to each selected agent's configured directory.

### "Universal" vs Non-Universal Agents

The CLI distinguishes two agent categories:

- **Universal agents** (`skillsDir === '.agents/skills'`): Codex, OpenCode, and the other agents in this CLI category use the canonical `.agents/skills/` project path. The current installer extends that shortcut to global symlink-mode installs and writes them to `~/.agents/skills/`.

- **Non-universal agents** (agent-specific `skillsDir`): Claude Code (`.claude/skills/`), Kiro CLI (`.kiro/skills/`), Windsurf (`.windsurf/skills/`), etc. — each gets a symlink from their agent-specific directory to the canonical `.agents/skills/<skill-name>/`.

**Source**: [src/agents.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts), [src/installer.ts `getAgentBaseDir`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/installer.ts)

### Lock File: `skills-lock.json`

Project-level installs write a `skills-lock.json` file tracking installed skill locations, source URLs, and hashes. Restore with `npx skills experimental_install`.

**Source**: [src/local-lock.ts](https://github.com/vercel-labs/skills/blob/main/src/local-lock.ts), [src/install.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/install.ts)

---

## 4. Symlink Behavior

### Symlink Mode (Recommended, Default)

1. Skill files are **copied** from source into the canonical `.agents/skills/<skill-name>/` directory
2. For each non-universal agent, a **relative symlink** is created from the agent-specific directory to the canonical directory
3. If symlink creation fails (e.g., Windows without Developer Mode), the CLI **falls back to copy** automatically

**Code evidence** (from `installer.ts`):
```
// Symlink mode: copy to canonical location and symlink to agent location
await cleanAndCreateDirectory(canonicalDir);
await copyDirectory(skill.path, canonicalDir, agentType);

// ... non-universal agents get symlinks:
const symlinkCreated = await createSymlink(canonicalDir, agentDir);
if (!symlinkCreated) {
  // Symlink failed, fall back to copy
  await cleanAndCreateDirectory(agentDir);
  await copyDirectory(skill.path, agentDir, agentType);
  // Returns success with symlinkFailed: true
}
```

### Copy Mode (`--copy` flag)

Skips the canonical directory entirely. Skill files are copied directly into each agent's directory. No symlinks created.

### Skipped Symlinks (Project Installs)

For non-universal agents whose config directory doesn't exist in the project (e.g., `.windsurf/` not present), the CLI skips creating the symlink and agent directory. The skill remains available in `.agents/skills/`. Exception: Claude Code gets a symlink even if `.claude/` doesn't exist yet.

**Source**: [src/installer.ts `installSkillForAgent`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/installer.ts)

### Eve Special Case

Eve skills are written directly to `agent/skills/` or `agent/subagents/<name>/skills/` as flat `.md` files. Eve does NOT use symlinks — skill content is always copied. Eve also strips non-Eve-compatible frontmatter fields from SKILL.md during installation.

**Source**: [src/installer.ts `stripIgnoredEveFrontmatter`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/installer.ts), [src/add.ts `installSkillForAgent`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/add.ts)

### No Built-in `link` Command

There is no `npx skills link` command for local development. For local skills, use `npx skills add ./my-local-skills` which copies from the local path into the canonical directory.

---

## 5. Skill Format

### Specification

The Agent Skills specification lives at https://agentskills.io/specification. The format was originally developed by Anthropic and released as an open standard.

- **Source**: https://agentskills.io, https://github.com/agentskills/agentskills

### Directory Structure
```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
└── ...               # Any additional files or directories
```

**Source**: [agentskills.io specification](https://agentskills.io/specification)

### Required Frontmatter Fields

| Field | Constraints |
|---|---|
| `name` | 1-64 chars. Lowercase letters, numbers, hyphens only. Must not start/end with hyphen. Must not contain consecutive hyphens. Must match parent directory name. |
| `description` | 1-1024 chars. Non-empty. Describes what the skill does and when to use it. |

### Optional Frontmatter Fields

| Field | Constraints |
|---|---|
| `license` | Short string — license name or reference to bundled license file |
| `compatibility` | 1-500 chars. Indicates environment requirements |
| `metadata` | Arbitrary key-value map (string → string). Custom keys, e.g., `metadata.internal: true` |
| `allowed-tools` | Space-separated string of pre-approved tools (experimental) |

### Body Content

Markdown after frontmatter. No format restrictions. Recommended sections: step-by-step instructions, examples, common edge cases. Recommended under 500 lines (for progressive disclosure). Keep main SKILL.md focused; move detailed reference material to separate files in `references/`.

**Source**: [agentskills.io specification](https://agentskills.io/specification)

### Discovery Pattern

The CLI searches these locations for `SKILL.md` files:
- Root directory (if it contains `SKILL.md`)
- `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`
- Every agent-specific directory (`.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, etc.)
- Plugin manifests: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`

Walk depth: 1 level for flat (`skills/<name>/SKILL.md`), 2 levels for catalog (`skills/<category>/<name>/SKILL.md`). `--full-depth` disables depth limits and searches recursively.

**Source**: [npm README "Skill Discovery"](https://www.npmjs.com/package/skills), [npm README "Plugin Manifest Discovery"](https://www.npmjs.com/package/skills)

---

## 6. Release Packaging

### No Built-in Publish Command

There is **no** `npx skills publish` command. The CLI does not manage versioning, publishing, or distribution of skill packages. Skill authors publish skills by:

1. Pushing a git repository (GitHub/GitLab/any git host) containing `SKILL.md` files
2. Users install via `npx skills add <owner>/<repo>`

This means **"publishing" is entirely git-based** — no npm registry, no version registry, no signing. Versioning is via git tags/branches/commits using a URL fragment, for example `npx skills add 'owner/repo#v1.0.0'`. The `@` suffix selects a skill, not a ref.

### Skills.sh Directory (skills.sh)

https://skills.sh is a central discovery directory maintained by Vercel. It is **NOT a registry with publishing APIs** — it's a leaderboard/listing site that indexes skills from GitHub repositories. The CLI's `npx skills find` command queries it.

- Shows install counts, trending rankings
- Lists skills by repository and individual skill pages
- No formal publishing workflow beyond having a public GitHub repo with SKILL.md files

**Source**: https://skills.sh

### Well-Known Endpoints (RFC 8615)

For URL-based skill sources, the CLI fetches `/.well-known/agent-skills/index.json` (preferred) or `/.well-known/skills/index.json` (legacy fallback). These endpoints serve a list of available skills with their files.

**Source**: [src/providers/wellknown.ts](https://github.com/vercel-labs/skills/blob/main/src/providers/wellknown.ts), [npm README](https://www.npmjs.com/package/skills)

### Blob Install (Fast Path)

For whitelisted repos (Vercel, Heygen), the CLI downloads pre-packaged skill snapshots via `skills.sh` download API instead of cloning the full repo. This is implemented in `src/blob.ts` and provides a faster install for high-traffic skill repositories.

**Source**: [src/blob.ts](https://github.com/vercel-labs/skills/blob/main/src/blob.ts)

---

## 7. Registry / Discovery

### skills.sh — Central Skill Directory

**URL**: https://skills.sh
**Maintained by**: Vercel

This is a leaderboard and discovery site, not a formal package registry. It:
- Ranks skills by 8-week activity and total installs
- Shows trending (24h) and hot skills
- Provides search across skills and repositories
- Has per-skill detail pages (e.g., https://skills.sh/vercel-labs/skills/find-skills)
- Shows topics, official badges, and security audit information

**Source**: https://skills.sh

### `npx skills find` — CLI Search

The `find` command queries skills.sh for interactive (fzf-style) or keyword-based search. `--owner <owner>` filters to repositories from a specific GitHub owner.

**Source**: [src/find.ts](https://github.com/vercel-labs/skills/blob/main/src/find.ts)

### No Formal Registry Protocol

There is no package registry API, no `registry` field in SKILL.md frontmatter, no centralized authentication, no version registry. The ecosystem is:
- **GitHub-hosted**: Skills live in public git repositories
- **Git-based versioning**: Users reference tags/branches/commits
- **skills.sh indexing**: Leaderboard and search, not a registry
- **Well-known endpoints**: For URL-based skill sources
- **No lockfile ecosystem**: `skills-lock.json` tracks installed sources but there's no shared registry of skill versions

---

## 8. Agent Compatibility

The CLI supports **70+ agents**, auto-detects which are installed, and installs skills to each agent's skills directory. Feature compatibility varies:

| Feature | Support |
|---|---|
| Basic skills (name + description) | 70+ agents |
| `allowed-tools` (pre-approved tool list) | The CLI preserves the optional field but does not prove or enforce host runtime support. Verify per harness; current Codex docs do not document support and OpenCode ignores unknown skill fields. |
| `context: fork` (forked sub-context) | Claude Code only |
| Hooks | Claude Code, Kiro CLI |
| `compatibility` (environment requirements) | Agent-dependent |
| `metadata` (arbitrary key-value) | Agent-dependent |

**Source**: [npm README "Compatibility" table](https://www.npmjs.com/package/skills), [npm README "Supported Agents" table](https://www.npmjs.com/package/skills)

### Agent Directory Layouts

Each agent has a project and global skills path. The CLI maps 74 specific agents plus a `universal` agent. Key examples:

| Agent | `--agent` | Project Path | Global Path |
|---|---|---|---|
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| Codex | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` |
| Kiro CLI | `kiro-cli` | `.kiro/skills/` | `~/.kiro/skills/` |
| Roo Code | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| Eve | `eve` | `agent/skills/` | N/A (project-only) |

**Source**: [src/agents.ts](https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts), [npm README "Supported Agents"](https://www.npmjs.com/package/skills)

---

## 9. Environment Variables & Telemetry

| Variable | Description |
|---|---|
| `INSTALL_INTERNAL_SKILLS` | Set to `1` or `true` to show skills with `metadata.internal: true` |
| `DISABLE_TELEMETRY` | Disable anonymous usage telemetry |
| `DO_NOT_TRACK` | Alternative telemetry disable |
| `GITHUB_TOKEN` | Used for GitHub API rate limiting |
| `CLAUDE_CONFIG_DIR` | Override Claude Code config directory |
| `CODEX_HOME` | Override Codex home directory |
| `VIBE_HOME`, `HERMES_HOME`, `AUTOHAND_HOME`, `GROK_HOME` | Override respective agent home directories |

Telemetry is automatically disabled in CI environments. The CLI sends `install` events with source, skills, agents, scope, and optional metadata. Private repos are excluded from telemetry.

**Source**: [npm README "Environment Variables"](https://www.npmjs.com/package/skills), [src/telemetry.ts](https://github.com/vercel-labs/skills/blob/main/src/telemetry.ts), [src/add.ts `isRepoPrivate`](https://raw.githubusercontent.com/vercel-labs/skills/main/src/add.ts)

---

## 10. Source Layout

```
src/
├── cli.ts              # CLI entry point, command dispatcher, --help, init
├── add.ts              # `skills add` command — full install pipeline
├── use.ts              # `skills use` command — one-shot without installing
├── remove.ts           # `skills remove` command
├── list.ts             # `skills list` command
├── find.ts             # `skills find` command (interactive/keyword search)
├── update.ts           # `skills update` command
├── install.ts          # `skills experimental_install` — restore from lock
├── sync.ts             # `skills experimental_sync` — sync from node_modules
├── installer.ts        # Core install logic: symlink, copy, canonical dirs
├── agents.ts           # 74 agent configs, detection, universal/non-universal
├── skills.ts           # Skill discovery (SKILL.md walking & parsing)
├── source-parser.ts    # Source URL parsing (GitHub, GitLab, git, local, well-known)
├── git.ts              # Git clone via simple-git
├── blob.ts             # Fast blob install from skills.sh download API
├── github-host.ts      # GitHub host provider
├── frontmatter.ts      # YAML frontmatter parsing
├── types.ts            # Type definitions (Skill, AgentType, AgentConfig, etc.)
├── constants.ts        # AGENTS_DIR, SKILLS_SUBDIR constants
├── skill-lock.ts       # Global skill lock (update tracking)
├── local-lock.ts       # Project skills-lock.json (restore tracking)
├── telemetry.ts        # Anonymous telemetry + security audits
├── detect-agent.ts     # AI agent detection (for non-interactive mode)
├── update-source.ts    # Source URL reconstruction for updates
├── sanitize.ts         # Terminal escape code stripping
├── plugin-manifest.ts  # Claude Code plugin marketplace manifest parsing
├── prompts/            # Prompt templates
├── providers/          # Well-known endpoint provider + others
└── tests/              # Test files alongside source (vitest)
```

**Source**: [GitHub repo file tree](https://github.com/vercel-labs/skills), [package.json scripts](https://raw.githubusercontent.com/vercel-labs/skills/main/package.json)

---

## Key Design Decisions (Source-Verified)

1. **No npm-based publishing**: Skills are git repos, not npm packages. No `skills publish` command exists.
2. **No centralized registry**: skills.sh is a leaderboard, not a registry. No package API, no authentication.
3. **Git-based versioning**: Users pin via a quoted `#ref` source fragment, for example `'owner/repo#v1.0.0'`. No `version` field in SKILL.md frontmatter.
4. **Copy from source, symlink to agents**: Skills are always **copied** from the source repo into a canonical directory, then **symlinked** from canonical to agent-specific directories. Never symlinked directly from source.
5. **Universal agents skip symlinks**: `.agents/skills/` is the canonical directory for universal agents — no symlink needed.
6. **Fallback to copy**: Symlink failure always falls back to copying. Designed for cross-platform (Windows) compatibility.
7. **Eve is special**: Flat `.md` file install, no symlinks, stripped frontmatter.
8. **No `link` command**: No explicit local development symlink command. Use `npx skills add ./path` for local skills.
9. **FAST blob path**: For high-traffic repos (Vercel, Heygen), pre-packaged tarballs served from skills.sh avoid git clone.
10. **RFC 8615 well-known**: URL-based skill sources use `/.well-known/agent-skills/index.json`.
11. **Telemetry gated for private repos**: Install events for private repos are excluded from telemetry.
12. **AI agent detection**: When run inside an AI agent, the CLI switches to non-interactive mode and auto-selects the detected agent.
