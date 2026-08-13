# Claude Code Skill System Architecture

> Primary source: [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code) (code.claude.com/docs)

## Table of Contents

1. [Skill Discovery & Installation Paths](#1-skill-discovery--installation-paths)
2. [Frontmatter Reference](#2-frontmatter-reference)
3. [Skill File Format & Structure](#3-skill-file-format--structure)
4. [Approval & Permission Model](#4-approval--permission-model)
5. [Hooks & Session Lifecycle](#5-hooks--session-lifecycle)
6. [Subagents & Dynamic Workflows](#6-subagents--dynamic-workflows)
7. [Skill Content Lifecycle & Invocation](#7-skill-content-lifecycle--invocation)
8. [Standards Alignment](#8-standards-alignment)

---

## 1. Skill Discovery & Installation Paths

### Where skills live

Skills are discovered from multiple locations with a defined precedence order:

| Location                          | Path                                                | Applies to                     | Precedence   |
| :-------------------------------- | :-------------------------------------------------- | :----------------------------- | :----------- |
| Enterprise (managed settings)     | Server-managed or MDM-deployed settings              | All users in your organization | 1 (highest)  |
| Personal                          | `~/.claude/skills/<skill-name>/SKILL.md`            | All your projects              | 2            |
| Project                           | `.claude/skills/<skill-name>/SKILL.md`              | This project only              | 3            |
| Plugin                            | `<plugin>/skills/<skill-name>/SKILL.md`             | Where plugin is enabled        | 4 (lowest)   |

Source: [Where skills live](https://docs.anthropic.com/en/docs/claude-code/skills#where-skills-live)

### Discovery rules

- **Parent directory walk**: Project skills load from `.claude/skills/` in your starting directory AND in every parent directory up to the repository root. Starting Claude in a subdirectory still picks up skills defined at the root. Source: [Automatic discovery from parent and nested directories](https://docs.anthropic.com/en/docs/claude-code/skills#automatic-discovery-from-parent-and-nested-directories)
- **Nested/monorepo discovery**: Skills from nested `.claude/skills/` directories below your working directory become available when Claude reads or edits a file in that subdirectory. Nested skills appear under directory-qualified names (`apps/web:deploy`). Requires v2.1.203+. Source: [Where skills live](https://docs.anthropic.com/en/docs/claude-code/skills#where-skills-live)
- **`--add-dir` directories**: `.claude/skills/` within an added directory is loaded automatically. This is an exception to the general rule that `--add-dir` grants file access only. The `permissions.additionalDirectories` setting does NOT load skills. Source: [Skills from additional directories](https://docs.anthropic.com/en/docs/claude-code/skills#skills-from-additional-directories)
- **Legacy `.claude/commands/`**: Files in `.claude/commands/` (e.g., `deploy.md`) still work and create `/deploy`. Custom commands have been merged into skills. If a skill and a command share the same name, the skill takes precedence. Source: [Extend Claude with skills](https://docs.anthropic.com/en/docs/claude-code/skills) (note at top)
- **Symlinks**: A skill directory entry can be a symlink to a directory elsewhere on disk. Claude Code follows the symlink. If the same target is reachable from multiple locations, the skill loads once. Source: [Where skills live](https://docs.anthropic.com/en/docs/claude-code/skills#where-skills-live)
- **Live change detection**: Skill directories are watched for file changes. Adding, editing, or removing a skill takes effect within the current session without restarting. Creating a top-level skills directory that didn't exist when the session started requires restart. Only covers `SKILL.md` text; for skill-as-plugin folders, `hooks/`, `.mcp.json`, `agents/`, and `output-styles/` changes need `/reload-plugins`. Source: [Live change detection](https://docs.anthropic.com/en/docs/claude-code/skills#live-change-detection)

### Cloud and Cowork sessions

- Cowork and cloud sessions don't read `~/.claude/skills/` on your machine
- Cowork loads skills enabled for your claude.ai account (synced at session start)
- Cloud sessions additionally load project skills committed to `.claude/skills/`
- Desktop scheduled tasks run locally and load skills from all standard locations

Source: [Skills in Cowork and cloud sessions](https://docs.anthropic.com/en/docs/claude-code/skills#skills-in-cowork-and-cloud-sessions)

### Name resolution

- The command name comes from the directory name: `.claude/skills/deploy-staging/SKILL.md` → `/deploy-staging`
- The `name` frontmatter field sets only the display label in personal/project skills
- In plugin skills, `name` sets the last segment of the command: `my-plugin/skills/review/SKILL.md` with `name: fancy` → `/my-plugin:fancy`
- Plugin skills use a `plugin-name:skill-name` namespace and cannot conflict with other levels

Source: [How a skill gets its command name](https://docs.anthropic.com/en/docs/claude-code/skills#how-a-skill-gets-its-command-name)

### Plugin-as-skill

A `.claude-plugin/plugin.json` in a skill folder makes it load as a plugin named `<name>@skills-dir`, bundling agents, hooks, and MCP servers. In a project's `.claude/skills/`, this requires accepting workspace trust. Source: [Where skills live](https://docs.anthropic.com/en/docs/claude-code/skills#where-skills-live) (note)

---

## 2. Frontmatter Reference

Skills use YAML frontmatter between `---` markers at the top of `SKILL.md`. All fields are optional; only `description` is recommended.

Source: [Frontmatter reference](https://docs.anthropic.com/en/docs/claude-code/skills#frontmatter-reference)

### Complete field list

| Field                       | Description                                                                                                                                                                                                                       |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | Display name in skill listings. Defaults to directory name.                                                                                                                                                                       |
| `description`               | What the skill does and when to use it. Claude uses this to decide when to auto-invoke. Truncated at 1,536 chars (combined with `when_to_use`) in the skill listing. If omitted, the first paragraph of body is used. Recommended. |
| `when_to_use`               | Additional trigger context. Appended to `description` in skill listing.                                                                                                                                                           |
| `argument-hint`             | Autocomplete hint for expected arguments, e.g. `[issue-number]` or `[filename] [format]`.                                                                                                                                         |
| `arguments`                 | Named positional arguments for `$name` substitution in skill content. Space-separated string or YAML list. Names map to positions in order.                                                                                       |
| `disable-model-invocation`  | Set `true` to prevent Claude from auto-loading. Use for manual-only workflows. Also prevents preloading into subagents. As of v2.1.196, also prevents running from scheduled tasks. Default: `false`.                             |
| `user-invocable`            | Set `false` to hide from `/` menu. For background knowledge. Default: `true`.                                                                                                                                                     |
| `allowed-tools`             | Tools Claude can use without permission during the turn that invokes this skill. Grant clears on next user message. Accepts space/comma-separated string or YAML list.                                                            |
| `disallowed-tools`          | Tools removed from Claude's pool while skill is active. Restriction clears on next user message. Cannot remove `EndConversation` while any other tool remains.                                                                    |
| `model`                     | Model override when skill is active. Applies for the rest of the turn. Accepts model aliases or full IDs, or `inherit` to keep active model. Subject to `availableModels` allowlist.                                              |
| `effort`                    | Effort level: `low`, `medium`, `high`, `xhigh`, `max`. Default: inherits from session.                                                                                                                                            |
| `context`                   | Set to `fork` to run in a forked subagent context (see [Run skills in a subagent](#run-skills-in-a-subagent)).                                                                                                                    |
| `agent`                     | Which subagent type to use when `context: fork` is set.                                                                                                                                                                           |
| `background`                | With `context: fork`, set `false` to wait for result in the invoking turn. Default: `true` (runs asynchronously). Requires v2.1.218+.                                                                                             |
| `hooks`                     | Hooks scoped to this skill's lifecycle. See [Hooks in skills and agents](https://docs.anthropic.com/en/docs/claude-code/hooks#hooks-in-skills-and-agents).                                                                        |
| `paths`                     | Glob patterns limiting when this skill auto-activates. Comma-separated string or YAML list. Same format as path-specific rules.                                                                                                   |
| `shell`                     | Shell for `` !`command` `` and ` ```! ` blocks. Accepts `bash` (default) or `powershell`.                                                                                                                                          |

### Boolean value format

Boolean fields accept `yes`, `no`, `on`, `off`, `1`, `0`, `true`, `false` in any case. Requires v2.1.218+. Before v2.1.218, only `true` and `false`. Source: [Frontmatter reference](https://docs.anthropic.com/en/docs/claude-code/skills#frontmatter-reference) (note)

### String substitutions

Available in skill content and `allowed-tools` Bash rules:

| Variable                 | Description                                                                                                                   |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `$ARGUMENTS`             | All arguments passed when invoking the skill. If not present in content, appended as `ARGUMENTS: <value>`.                    |
| `$ARGUMENTS[N]` / `$N`   | Specific argument by 0-based index. `$0` = first argument. Shell-style quoting supported.                                     |
| `$name`                  | Named argument from `arguments` frontmatter list.                                                                             |
| `${CLAUDE_SESSION_ID}`   | Current session ID.                                                                                                           |
| `${CLAUDE_EFFORT}`       | Current effort level.                                                                                                         |
| `${CLAUDE_SKILL_DIR}`    | Directory containing the skill's `SKILL.md`. For referencing bundled scripts.                                                 |
| `${CLAUDE_PROJECT_DIR}`  | Project root directory. Requires v2.1.196+.                                                                                   |

Source: [Available string substitutions](https://docs.anthropic.com/en/docs/claude-code/skills#available-string-substitutions)

---

## 3. Skill File Format & Structure

### Required structure

Each skill is a **directory** with `SKILL.md` as the entrypoint:

```
my-skill/
├── SKILL.md           # Main instructions (required)
├── template.md        # Template for Claude to fill in
├── examples/
│   └── sample.md      # Example output
└── scripts/
    └── validate.sh    # Script Claude can execute
```

Source: [Create your first skill](https://docs.anthropic.com/en/docs/claude-code/skills#create-your-first-skill)

### SKILL.md format

- **YAML frontmatter** between `---` markers
- **Markdown body** with instructions
- Supporting files referenced from body; Claude loads them on demand via Read tool when mentioned in SKILL.md
- Recommended: keep SKILL.md under 500 lines

Source: [Add supporting files](https://docs.anthropic.com/en/docs/claude-code/skills#add-supporting-files)

### Dynamic context injection

`` !`<command>` `` syntax runs shell commands before skill content is sent to Claude. The command output replaces the placeholder. For multi-line commands, use ` ```! ` fenced code blocks.

- Runs as preprocessing (not something Claude executes)
- Substitution runs once over the original file; command output is not re-scanned
- Recognized only when `!` appears at start of line or after whitespace
- Can be disabled via `disableSkillShellExecution` setting in managed settings

Source: [Inject dynamic context](https://docs.anthropic.com/en/docs/claude-code/skills#inject-dynamic-context)

### Skill stacking

Up to 6 user-invocable skills can be stacked at the start of one message: `/write-tests /fix-issue 123` loads both skills. The trailing text becomes `$ARGUMENTS` for each. Expansion stops at the first non-inline-user-invocable skill (e.g., a forked subagent skill). Requires v2.1.199+.

Source: [Pass arguments to skills](https://docs.anthropic.com/en/docs/claude-code/skills#pass-arguments-to-skills)

---

## 4. Approval & Permission Model

### Skill loading

- Skill descriptions are loaded into context by default so Claude knows what's available
- Full skill content loads when invoked (by user or by Claude)
- No approval prompt for skill loading itself
- `disable-model-invocation: true` prevents Claude from auto-loading AND keeps the description out of context
- `user-invocable: false` hides from `/` menu but description stays in context

Source: [Control who invokes a skill](https://docs.anthropic.com/en/docs/claude-code/skills#control-who-invokes-a-skill)

### Tool execution within skills

- `allowed-tools` grants permission for listed tools during the turn that invokes the skill. Grant clears on next user message. Does NOT restrict which tools are available — every tool remains callable; standard permissions govern unlisted tools.
- `disallowed-tools` removes tools from Claude's pool while the skill is active. Clears on next user message.
- Project skills with `allowed-tools` require workspace trust dialog acceptance (same as `.claude/settings.json` allow rules).
- `Bash(*.sh)`-style rules in `allowed-tools` use the same syntax as permission rules.
- `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` are substituted in `allowed-tools` Bash rules so a skill can reference a bundled script without prompting.

Source: [Pre-approve tools for a skill](https://docs.anthropic.com/en/docs/claude-code/skills#pre-approve-tools-for-a-skill)

### The overall permission system (applies to all tool use)

Claude Code uses a tiered permission system:

| Tool type         | Example          | Approval required                                                                   | "Yes, don't ask again" behavior        |
| :---------------- | :--------------- | :---------------------------------------------------------------------------------- | :------------------------------------- |
| Read-only         | File reads, Grep | No, within working directory and additional directories                             | N/A                                    |
| Bash commands     | Shell execution  | Yes, except a built-in set of read-only commands                                    | Permanently per repository and command |
| File modification | Edit/write files | Yes                                                                                 | Until session end                      |

Source: [Permission system](https://docs.anthropic.com/en/docs/claude-code/permissions#permission-system)

### Bundled skills

Claude Code ships bundled skills (`/doctor`, `/code-review`, `/batch`, `/debug`, `/loop`, `/run`, `/verify`, `/run-skill-generator`, `/claude-api`, `/dataviz`, `/design-sync`, `/deep-research`, etc.). Some auto-invoke (Claude decides); `/verify` and `/code-review` only run when user invokes (since v2.1.215). Bundled skills can be disabled via `disableBundledSkills` setting; `/doctor` stays typable unless explicitly hidden. Source: [Bundled skills](https://docs.anthropic.com/en/docs/claude-code/skills#bundled-skills)

---

## 5. Hooks & Session Lifecycle

### Hook events (20+)

Claude Code supports hooks at many lifecycle points:

| Cadence              | Events                                                                                |
| :------------------- | :------------------------------------------------------------------------------------ |
| Once per session     | `SessionStart`, `SessionEnd`                                                          |
| Once per turn        | `UserPromptSubmit`, `Stop`, `StopFailure`                                             |
| Every tool call      | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` |
| Subagent lifecycle   | `SubagentStart`, `SubagentStop`                                                       |
| Compaction           | `PreCompact`, `PostCompact`                                                           |
| Configuration        | `InstructionsLoaded`, `ConfigChange`                                                  |
| Other                | `PostToolBatch`, `Notification`, `MessageDisplay`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `Elicitation`, `ElicitationResult`, `Setup`, `UserPromptExpansion` |

`EndConversation` tool calls skip both `PreToolUse` and `PostToolUse`. Source: [Hook lifecycle](https://docs.anthropic.com/en/docs/claude-code/hooks#hook-lifecycle)

### Hook configuration

Hooks are JSON-defined with three levels of nesting:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/lint-check.sh"
          }
        ]
      }
    ]
  }
}
```

Source: [Configuration](https://docs.anthropic.com/en/docs/claude-code/hooks#configuration)

### Hook types

| Type       | Description                                              |
| :--------- | :------------------------------------------------------- |
| `command`  | Shell command with JSON input on stdin; JSON output      |
| `http`     | HTTP POST request; JSON body in, JSON response out       |
| `mcp_tool` | Call a tool on an already-connected MCP server           |
| `prompt`   | Send a prompt to a Claude model for single-turn evaluation |
| `agent`    | Spawn a subagent that can use tools (experimental)       |

Source: [Hook handler fields](https://docs.anthropic.com/en/docs/claude-code/hooks#hook-handler-fields)

### Hook locations

| Location                      | Scope                     |
| :---------------------------- | :------------------------ |
| `~/.claude/settings.json`     | All your projects         |
| `.claude/settings.json`       | Single project            |
| `.claude/settings.local.json` | Single project (personal) |
| Managed policy settings       | Organization-wide         |
| Plugin `hooks/hooks.json`     | When plugin is enabled    |
| Skill or agent frontmatter    | While component is active |

Source: [Hook locations](https://docs.anthropic.com/en/docs/claude-code/hooks#hook-locations)

### Hooks in skills

Skills can define hooks in their frontmatter via the `hooks` field. These only run while that skill is active and are cleaned up when it finishes. The `once` field (when `true`) runs a handler once per session then removes it — only honored in skill frontmatter. Source: [Hooks in skills and agents](https://docs.anthropic.com/en/docs/claude-code/hooks#hooks-in-skills-and-agents)

---

## 6. Subagents & Dynamic Workflows

### Overview

Subagents are specialized AI assistants with their own context windows. Claude delegates side tasks to them, keeping exploration and implementation out of the main conversation.

Source: [Create custom subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)

### Built-in subagents

| Agent             | Model    | Tools            | Purpose                       |
| :---------------- | :------- | :--------------- | :---------------------------- |
| Explore           | Inherits | Read-only        | Codebase search and exploration |
| Plan              | Inherits | Read-only        | Codebase research for planning  |
| General-purpose   | Inherits | Full subagent set | Complex multi-step tasks       |
| statusline-setup  | Sonnet   | —                | Status line configuration       |
| claude-code-guide | Haiku    | —                | Claude Code feature questions   |

Explore and Plan skip CLAUDE.md and parent git status. All others load them. Source: [Built-in subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents#built-in-subagents)

### Custom subagent definition

Markdown files with YAML frontmatter, same format as skills:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. When invoked, analyze the code...
```

Source: [Write subagent files](https://docs.anthropic.com/en/docs/claude-code/sub-agents#write-subagent-files)

### Subagent frontmatter fields

| Field             | Required | Description                                                                                                 |
| :---------------- | :------- | :---------------------------------------------------------------------------------------------------------- |
| `name`            | Yes      | Unique identifier (lowercase, hyphens). Sent as `agent_type` in hooks.                                      |
| `description`     | Yes      | When Claude should delegate to this subagent                                                                |
| `tools`           | No       | Tools the subagent can use. Inherits full subagent tool set if omitted.                                     |
| `disallowedTools` | No       | Tools to deny, removed from inherited or specified list                                                     |
| `model`           | No       | `sonnet`, `opus`, `haiku`, `fable`, full model ID, or `inherit`. Default: `inherit`                         |
| `permissionMode`  | No       | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`. Ignored for plugin subagents.     |
| `maxTurns`        | No       | Maximum agentic turns before stopping                                                                       |
| `skills`          | No       | Skills to preload into subagent's context at startup (full content injected)                                |
| `mcpServers`      | No       | MCP servers available to this subagent. Ignored for plugin subagents.                                       |
| `hooks`           | No       | Lifecycle hooks scoped to this subagent. Ignored for plugin subagents.                                      |
| `memory`          | No       | Persistent memory: `user`, `project`, or `local`                                                            |
| `background`      | No       | `true` to always run as background task. When unset, Claude chooses.                                        |
| `effort`          | No       | Effort level: `low`, `medium`, `high`, `xhigh`, `max`                                                       |
| `isolation`       | No       | `worktree` to run in a temporary git worktree                                                               |
| `color`           | No       | Display color in task list/transcript                                                                       |
| `initialPrompt`   | No       | Auto-submitted as first user turn when running as main session agent via `--agent`                          |

Source: [Supported frontmatter fields](https://docs.anthropic.com/en/docs/claude-code/sub-agents#supported-frontmatter-fields)

### Subagent locations and precedence

| Location                     | Scope                   | Priority    |
| :--------------------------- | :---------------------- | :---------- |
| Managed settings             | Organization-wide       | 1 (highest) |
| `--agents` CLI flag          | Current session         | 2           |
| `.claude/agents/`            | Current project         | 3           |
| `~/.claude/agents/`          | All your projects       | 4           |
| Plugin's `agents/` directory | Where plugin is enabled | 5 (lowest)  |

Source: [Choose the subagent scope](https://docs.anthropic.com/en/docs/claude-code/sub-agents#choose-the-subagent-scope)

### Skills running in subagents

Skills can run in a subagent via `context: fork` in the skill's frontmatter. The skill content becomes the prompt driving the subagent. It won't have access to conversation history. By default runs in background (`background: true`); set `background: false` to wait for result synchronously (v2.1.218+).

Source: [Run skills in a subagent](https://docs.anthropic.com/en/docs/claude-code/skills#run-skills-in-a-subagent)

---

## 7. Skill Content Lifecycle & Invocation

### How skills load

- On session start: skill descriptions are loaded into context (unless `disable-model-invocation: true`). Full body is not loaded.
- On invocation: the full rendered `SKILL.md` content enters the conversation as a message and stays for the rest of the session.
- Re-invocation: if content is identical to what's already in context, a short note is added instead of a duplicate. If different (different arguments, new dynamic output), full content is appended again.
- Compaction: skills survive compaction within a token budget. The most recent invocation of each skill is re-attached (first 5,000 tokens each), sharing a 25,000-token budget. Older skills may be dropped.

Source: [Skill content lifecycle](https://docs.anthropic.com/en/docs/claude-code/skills#skill-content-lifecycle)

### Invocation methods

| Method                   | How it works                                                                                           |
| :----------------------- | :----------------------------------------------------------------------------------------------------- |
| User types `/skill-name` | Skill command runs. Arguments passed after the command name.                                           |
| Claude auto-invokes      | Claude reads the description and decides to load the skill when relevant to the conversation.          |
| Subagent preload         | Skills listed in subagent's `skills` frontmatter field are injected at startup (full content).         |
| `context: fork`          | Skill runs as a subagent (see above).                                                                  |

Source: [Control who invokes a skill](https://docs.anthropic.com/en/docs/claude-code/skills#control-who-invokes-a-skill)

### `disable-model-invocation` vs `disableBundledSkills`

- `disable-model-invocation: true` (per-skill frontmatter): prevents Claude from auto-loading a specific skill. User can still invoke it.
- `disableBundledSkills` (setting): disables every bundled skill except `/doctor`.
- `--disable-slash-commands` (CLI flag): disables all skills and commands for the session.

Sources: [Frontmatter reference](https://docs.anthropic.com/en/docs/claude-code/skills#frontmatter-reference), [Bundled skills](https://docs.anthropic.com/en/docs/claude-code/skills#bundled-skills), [CLI flags](https://docs.anthropic.com/en/docs/claude-code/cli-reference)

---

## 8. Standards Alignment

Claude Code skills follow the **Agent Skills** open standard (`agentskills.io`), which works across multiple AI tools. Claude Code extends the standard with additional features:

- Invocation control (`disable-model-invocation`, `user-invocable`)
- Subagent execution (`context: fork`, `agent`, `background`)
- Dynamic context injection (`` !`command` ``)
- Tool pre-approval (`allowed-tools`, `disallowed-tools`)
- Skill-scoped hooks (`hooks` frontmatter field)
- Path-scoped activation (`paths` frontmatter field)
- String substitutions (`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`, etc.)
- Skill stacking (multiple skills in one message)

Source: [Extend Claude with skills](https://docs.anthropic.com/en/docs/claude-code/skills) (opening note about the Agent Skills standard)

### Compatibility note

The Agent Skills standard uses the directory `SKILL.md` convention supported by multiple agents (Claude Code, OpenCode, Codex). Claude Code additionally supports:
- Legacy `.claude/commands/` format (merged into skills)
- Plugin-based skill distribution
- Managed/enterprise skill delivery
- Nested `.claude/skills/` in monorepo subdirectories

No primary source documents the full Agent Skills open standard specification at `agentskills.io` beyond the Claude Code documentation's reference to it.

---

## Summary: Complete Architecture Diagram

```
                     Claude Code Skill System
                            │
            ┌───────────────┼───────────────┐
            │               │               │
       Discovery       Invocation       Execution
            │               │               │
    ┌───────┴───────┐   ┌──┴──┐   ┌────────┴────────┐
    │ ~/.claude/    │   │User │   │  Inline          │
    │ .claude/      │   │ /   │   │  (same context)  │
    │ plugins/      │   │     │   │                  │
    │ --add-dir     │   │Auto │   │  Forked          │
    │ nested/       │   │desc │   │  (context: fork, │
    │ commands/(*)  │   │match│   │   own context)   │
    └───────────────┘   └─────┘   │                  │
                                  │  + allowed-tools  │
                                  │  + hooks (skill-  │
                                  │    scoped)        │
                                  │  + model/effort   │
                                  │    override       │
                                  │  + $ARGUMENTS     │
                                  │  + !`cmd` injection│
                                  └──────────────────┘
```

All findings above are sourced from [code.claude.com/docs](https://code.claude.com/docs/llms.txt).
