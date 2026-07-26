# OpenCode Skill System Architecture

> Primary sources: [opencode.ai/docs](https://opencode.ai/docs), [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)

---

## 1. Skill Discovery

### Directory Scanning

OpenCode searches **six location categories** for skills — three project-local, three global:

- **Project-local** (walked upward from CWD to git worktree root):
  - `.opencode/skills/<name>/SKILL.md`
  - `.claude/skills/<name>/SKILL.md` — Claude Code compatible
  - `.agents/skills/<name>/SKILL.md` — Generic agent compatible
- **Global:**
  - `~/.config/opencode/skills/<name>/SKILL.md`
  - `~/.claude/skills/<name>/SKILL.md`
  - `~/.agents/skills/<name>/SKILL.md`

Source: https://opencode.ai/docs/skills/#place-files, https://opencode.ai/docs/skills/#understand-discovery

### Walk-up Behavior

For project-local paths, OpenCode walks **up from CWD until it reaches the git worktree**, loading matching `skills/*/SKILL.md` in `.opencode/`, `.claude/skills/`, and `.agents/skills/` along the way.

Source: https://opencode.ai/docs/skills/#understand-discovery

Current source passes `symlink: true` to skill-directory globbing, so valid directory symlinks are followed. This is source-verified behavior rather than a documented compatibility promise; see [opencode-symlink-resolution.md](opencode-symlink-resolution.md).

### Configuration

Skills are **not declared in `opencode.json`**. They are discovered automatically from the filesystem locations listed above. No config entry is needed for a skill to be loaded.

The `.opencode/` directory (and `~/.config/opencode/`) uses **plural names** for subdirectories: `skills/`, `agents/`, `commands/`, `modes/`, `plugins/`, `tools/`, `themes/`. Singular names (e.g., `skill/`) are supported for backwards compatibility.

Source: https://opencode.ai/docs/config/#precedence-order

### Environment Control

Two env vars control Claude Code compatibility loading:
- `OPENCODE_DISABLE_CLAUDE_CODE` — Disables reading from `.claude` (prompt + skills)
- `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` — Disables only `.claude/skills` loading

Source: https://opencode.ai/docs/cli/#environment-variables

---

## 2. Frontmatter Format

Each `SKILL.md` must start with **YAML frontmatter** (delimited by `---`). Recognized fields:

| Field | Required | Type | Constraints |
|-------|----------|------|-------------|
| `name` | Yes | string | 1–64 chars, lowercase alphanumeric + single hyphens, no start/end `-`, no consecutive `--`. Must match directory name. |
| `description` | Yes | string | 1–1024 chars |
| `license` | No | string | Freeform |
| `compatibility` | No | string | Freeform (e.g., `opencode`, `general`) |
| `metadata` | No | string-to-string map | Arbitrary key-value pairs |

**Unknown fields are silently ignored.**

Consequently, `disable-model-invocation: true` is not an OpenCode policy. It is ignored, and a valid described skill remains in `<available_skills>` for the model to choose and load. `permission.skill: "ask"` adds an approval prompt but does not hide the skill; `deny` hides and rejects it for everyone. There is no supported explicit-only/manual-only per-skill state.

Source: https://opencode.ai/docs/skills/#write-frontmatter, https://opencode.ai/docs/skills/#validate-names, https://opencode.ai/docs/skills/#follow-length-rules

### Name Validation Regex

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

Source: https://opencode.ai/docs/skills/#validate-names

### Example Frontmatter

```yaml
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---
```

Source: https://opencode.ai/docs/skills/#use-an-example

---

## 3. The `skill` Tool & Loading Mechanism

Skills are surfaced to the agent as a **built-in tool** called `skill`. Available skills are listed in the tool's description as XML:

```xml
<available_skills>
  <skill>
    <name>git-release</name>
    <description>Create consistent releases and changelogs</description>
  </skill>
</available_skills>
```

The agent loads a skill by calling the tool:
```
skill({ name: "git-release" })
```

When loaded, the entire `SKILL.md` content (frontmatter stripped) is injected into the conversation context.

Source: https://opencode.ai/docs/skills/#recognize-tool-description

---

## 4. Hooks / Session Lifecycle

OpenCode does **not** have a dedicated "hooks" concept in the traditional sense (pre/post tool execution callbacks configured declaratively). Instead, the **Plugin system** provides event hooks.

### Plugin Events (session lifecycle hooks)

Plugins hook into these session-related events:
- `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated`

### Plugin Events (tool lifecycle hooks)
- `tool.execute.before` — intercept before tool execution
- `tool.execute.after` — intercept after tool execution

### Plugin Events (other)
- `command.executed`, `file.edited`, `file.watcher.updated`, `installation.updated`
- `lsp.client.diagnostics`, `lsp.updated`
- `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated`
- `permission.asked`, `permission.replied`, `server.connected`
- `shell.env`, `todo.updated`
- `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`
- `experimental.session.compacting` — fires before compaction LLM generation

Source: https://opencode.ai/docs/plugins/#events

There is **no primary source evidence** of pre/post tool hooks configured directly in `opencode.json` or `SKILL.md` — hooks are exclusively a plugin feature.

---

## 5. Subagents / Dynamic Workflows

### Agent Types

Two categories:
- **Primary agents** — Main assistants, cycleable via `Tab` key. Built-in: `build` (default, full access), `plan` (read-only/restricted)
- **Subagents** — Specialized assistants invoked by primary agents or via `@mention`. Built-in: `general`, `explore`, `scout`

Source: https://opencode.ai/docs/agents/#types

### Built-in Subagents

| Name | Type | Access |
|------|------|--------|
| `general` | subagent | Full tool access (except todo). Multi-step research/complex tasks. |
| `explore` | subagent | Read-only codebase exploration. No file modifications. |
| `scout` | subagent | Read-only external docs/dependency research. |

Also three hidden primary agents: `compaction` (context summarization), `title` (session titles), `summary` (session summaries) — these run automatically and are not user-selectable.

Source: https://opencode.ai/docs/agents/#built-in

### Configuration

Agents are configured in either:
- **JSON** (`opencode.json` under `agent` key)
- **Markdown files**: `~/.config/opencode/agents/<name>.md` or `.opencode/agents/<name>.md`

Markdown agent format: YAML frontmatter with `description`, `mode` (`primary`/`subagent`/`all`), `model`, `temperature`, `permission`, `hidden`, `color`, `steps`, `top_p`; body = system prompt.

Source: https://opencode.ai/docs/agents/#configure

### Task Delegation

Primary agents invoke subagents via the **Task tool** (`task` permission). Subagent invocation can be controlled with granular task permissions using glob patterns:

```json
{
  "agent": {
    "orchestrator": {
      "permission": {
        "task": {
          "*": "deny",
          "orchestrator-*": "allow",
          "code-reviewer": "ask"
        }
      }
    }
  }
}
```

Source: https://opencode.ai/docs/agents/#task-permissions

### Subagent Depth

Configurable via `subagent_depth` (default: `1`). Controls how deeply subagents can invoke other subagents. `0` = no subagent launches.

Source: https://opencode.ai/docs/config/#subagent-depth

### Hidden Subagents

Subagents can be hidden from the `@` autocomplete menu with `hidden: true`. Only applicable to `mode: subagent`. Still invocable via Task tool.

Source: https://opencode.ai/docs/agents/#hidden

### Agent Creation CLI

```
opencode agent create
```

Interactive command: prompts for location, description, generates prompt/identifier, lets you select allowed permissions (anything not selected = denied), writes a markdown file.

Source: https://opencode.ai/docs/agents/#create-agents

---

## 6. Installation Paths

### Skills
- **Project**: `.opencode/skills/<name>/SKILL.md` (walked upward to git worktree)
- **Global**: `~/.config/opencode/skills/<name>/SKILL.md`
- Also: `.claude/skills/` and `.agents/skills/` (project and `~/` variants)
- No CLI for skill management was found in primary sources. `opencode agent create` exists but there is **no `opencode skill` command**.

Source: https://opencode.ai/docs/skills/#place-files

### Agents
- **Project**: `.opencode/agents/<name>.md`
- **Global**: `~/.config/opencode/agents/<name>.md`
- **CLI**: `opencode agent create` (interactive), `opencode agent list`

Source: https://opencode.ai/docs/agents/#configure

### Plugins
- **Project**: `.opencode/plugins/`
- **Global**: `~/.config/opencode/plugins/`
- **npm**: Declared in `opencode.json` under `plugin` array
- **CLI**: `opencode plugin <module>` / `opencode plug <module>`

Source: https://opencode.ai/docs/plugins/#use-a-plugin

### Custom Tools
- **Project**: `.opencode/tools/`
- **Global**: `~/.config/opencode/tools/`
- **No primary source found** for a CLI command to manage tools beyond `opencode agent create --permissions`.

Source: https://opencode.ai/docs/custom-tools/#location

### Config Directory Customization
- `OPENCODE_CONFIG` — custom config file path
- `OPENCODE_CONFIG_DIR` — custom config directory (replaces `.opencode/` scanning)
- `OPENCODE_CONFIG_CONTENT` — inline JSON config (highest non-managed precedence)

Source: https://opencode.ai/docs/config/#precedence-order

---

## 7. Approval Model / Permissions

### Permission System

Permissions are controlled through `permission` in `opencode.json`, with three actions:
- `"allow"` — run without approval
- `"ask"` — prompt user for approval
- `"deny"` — block the action

Source: https://opencode.ai/docs/permissions/#overview

### Skill-Specific Permissions

Skills have their own permission key `"skill"`, supporting pattern-based access:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

- `allow` — skill loads immediately
- `deny` — skill hidden from agent entirely
- `ask` — user prompted before loading

Supports wildcards: `internal-*` matches `internal-docs`, `internal-tools`, etc.

Source: https://opencode.ai/docs/skills/#configure-permissions

### Per-Agent Skill Overrides

In custom agent frontmatter:
```yaml
---
permission:
  skill:
    "documents-*": "allow"
---
```

For built-in agents in `opencode.json`:
```json
{
  "agent": {
    "plan": {
      "permission": {
        "skill": { "internal-*": "allow" }
      }
    }
  }
}
```

Source: https://opencode.ai/docs/skills/#override-per-agent

### Disabling Skills Per Agent

```yaml
---
tools:
  skill: false
---
```

When disabled, `<available_skills>` is omitted from the tool description entirely.

Source: https://opencode.ai/docs/skills/#disable-the-skill-tool

### General Permission Keys

`read`, `edit` (covers write/edit/apply_patch), `glob`, `grep`, `bash`, `task`, `skill`, `lsp`, `question`, `webfetch`, `websearch`, `external_directory`, `doom_loop`, `todowrite`

Source: https://opencode.ai/docs/permissions/#available-permissions

### Granular Rules

Most permissions support object syntax with glob patterns for input matching:

```json
{
  "permission": {
    "bash": {
      "*": "ask",
      "git *": "allow",
      "rm *": "deny"
    }
  }
}
```

Rules evaluated in order, **last matching rule wins**.

Source: https://opencode.ai/docs/permissions/#granular-rules-object-syntax

### Auto Mode

`opencode --auto` or `opencode run --auto "..."`: automatically approves permission requests that are not explicitly `"deny"`. Explicit denies are still enforced.

Source: https://opencode.ai/docs/permissions/#auto-mode

---

## 8. Skill File Format

**Markdown file with YAML frontmatter**:

```
---\n<YAML frontmatter>\n---\n<Markdown body>\n
```

- File name: `SKILL.md` (must be exactly this, in all caps)
- Directory: `<name>/SKILL.md` where `<name>` must match frontmatter `name`
- The body is freeform Markdown, injected as agent instructions when the skill is loaded
- No `.json` or `.yaml` config file format for skills exists in primary sources

Source: https://opencode.ai/docs/skills/#use-an-example, https://opencode.ai/docs/skills/#troubleshoot-loading

---

## 9. MCP Servers

### Relationship to Skills

MCP servers are **independent** from the skills system. They are configured in `opencode.json` under the `mcp` key and provide tools to the LLM as a different mechanism.

### Configuration

```json
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true,
      "environment": { "MY_ENV_VAR": "value" }
    }
  }
}
```

Supports:
- **Local** servers (`type: "local"`) — subprocess with command array
- **Remote** servers (`type: "remote"`) — HTTP endpoint with headers
- **OAuth** — automatic detection, dynamic client registration, manual `opencode mcp auth <name>`
- **Timeout**: configurable per-server (default 5000ms)

Source: https://opencode.ai/docs/mcp-servers/

### MCP Tool Management

MCP tools are registered with server name as prefix (e.g., `context7_search`). They can be:
- Enabled/disabled per server via `enabled: true/false`
- Managed via `tools` glob patterns in permissions (e.g., `"mymcp_*": false`)
- Enabled per-agent by disabling globally and re-enabling in agent config

Source: https://opencode.ai/docs/mcp-servers/#manage

### CLI

```
opencode mcp add          # interactive server configuration
opencode mcp list         # list servers and status
opencode mcp auth <name>  # OAuth authentication
opencode mcp logout <name>
opencode mcp debug <name> # debug connectivity/OAuth
```

Source: https://opencode.ai/docs/mcp-servers/#authenticating

### MCP vs Skills — Key Distinction

| Feature | Skills | MCP Servers |
|---------|--------|------------|
| Format | Markdown file (SKILL.md) | JSON config + process/HTTP |
| Purpose | Inject instructions into context | Provide executable tools |
| Mechanism | `skill` tool loads file content | Subprocess/HTTP tools exposed natively |
| Directories | `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` | Configured in `opencode.json` only |
| Permission key | `skill` | Tool name (e.g., `mymcp_search`) |

---

## 10. Plugins (Related Extension Mechanism)

Plugins are **JavaScript/TypeScript modules** that hook into OpenCode events. They are the closest analog to "hooks" and can add custom tools.

### Locations
- `.opencode/plugins/` (project)
- `~/.config/opencode/plugins/` (global)
- npm packages (declared in `opencode.json` `plugin` array)

### Capabilities
- Subscribe to session, tool, file, message, permission, LSP, and TUI events
- Inject environment variables into shell execution (`shell.env`)
- Intercept tool calls (`tool.execute.before`/`tool.execute.after`)
- Add custom tools (same namespace as built-ins; plugin tools take precedence)
- Inject context during compaction (`experimental.session.compacting`)

Source: https://opencode.ai/docs/plugins/

---

## 11. Config Schema Summary

### Config Files & Formats
- `opencode.json` or `opencode.jsonc` — main config
- `tui.json` or `tui.jsonc` — TUI-specific settings
- `$schema`: `https://opencode.ai/config.json` (config) or `https://opencode.ai/tui.json` (TUI)

### Precedence Order (1=lowest, 8=highest)
1. Remote config (`.well-known/opencode`)
2. Global config (`~/.config/opencode/opencode.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`opencode.json` in project)
5. `.opencode/` directories
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)
7. Managed config files (`/Library/Application Support/opencode/` on macOS)
8. macOS managed preferences (`.mobileconfig` via MDM)

Configs are **merged**, not replaced. Later sources override earlier ones only for conflicting keys.

Source: https://opencode.ai/docs/config/#precedence-order

### Top-Level Keys in opencode.json
`$schema`, `model`, `small_model`, `default_agent`, `subagent_depth`, `provider`, `mcp`, `agent`, `plugin`, `command`, `permission`, `instructions`, `tools`, `share`, `shell`, `formatter`, `lsp`, `theme` (legacy), `keybinds` (legacy), `tui` (legacy), `compaction`, `watcher`, `server`, `snapshot`, `autoupdate`, `attachment`, `disabled_providers`, `enabled_providers`, `experimental`, `references`

Source: https://opencode.ai/docs/config/#schema

---

## 12. What's NOT Found (Gaps)

- **No `opencode skill` CLI command** — no dedicated subcommand for skill management (install, list, create). Skills are filesystem-discovered only. `opencode agent create` exists for agents but no equivalent for skills.
- **No "hooks" in `opencode.json`** — pre/post-execution hooks for tools/sessions are exclusively a plugin feature, not a declarative config option.
- **No skill lifecycle hooks** — plugins have no `skill.load` or `skill.execute` event. Skills are loaded on-demand via the `skill` tool, not trigger-based.
- **No skill dependency management** — skills cannot declare dependencies on other skills or MCP servers.
- **No deterministic host-side auto-trigger rule** — OpenCode does not execute a skill merely because a prompt matches. The model sees each described skill and may decide to call the `skill` tool, which is still model invocation.
- **No skill nesting** — skills cannot include or reference other skills. Each SKILL.md is standalone.
- **No `permission.skill` for plugins** — plugins cannot register as skill providers or extend the skill mechanism.
