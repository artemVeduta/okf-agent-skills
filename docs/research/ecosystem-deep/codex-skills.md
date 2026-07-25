# OKF Ecosystem Deep-Dive: Codex Skill System Architecture

> Research based on primary sources: OpenAI Codex docs (developers.openai.com/codex), Codex CLI repo (github.com/openai/codex), Agent Skills spec (agentskills.io/specification). All claims cited below. "No primary source found" where docs are silent.

---

## 1. Skill Discovery

### Directory scanning

- **REPO** (`$CWD/.agents/skills`): Current working directory where Codex is launched.
- **REPO** (`$CWD/../.agents/skills`): Parent folders up the tree (within a Git repo).
- **REPO** (`$REPO_ROOT/.agents/skills`): Topmost Git root folder.
- **USER** (`$HOME/.agents/skills`): Per-user skills applying to any repo.
- **ADMIN** (`/etc/codex/skills`): Machine-wide shared system location.
- **SYSTEM**: Bundled with Codex by OpenAI (built-ins like `skill-creator`).

Source: "Where Codex loads local skills" table in [Build skills](https://developers.openai.com/codex/build-skills).

- Codex scans `.agents/skills` in every directory from CWD up to repo root. If two skills share the same `name`, Codex does NOT merge them; both can appear in selectors.
- Codex supports **symlinked skill folders** and follows the symlink target when scanning.
- Codex detects skill changes automatically. "If an update doesn't appear, restart Codex."
- There is **no** `.codex.yaml`-based skill discovery. Skills are found purely by directory scanning.

### Context budget for skill listing

- The initial skills list uses **at most 2% of the model's context window**, or **8,000 characters** when context is unknown.
- If many skills exist, Codex shortens descriptions first. For large sets, Codex may omit some skills and show a warning.
- This budget applies only to the initial list. When Codex selects a skill, it still reads the full `SKILL.md`.

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Skills use progressive disclosure" paragraph.

---

## 2. Frontmatter / Metadata Format

### Required fields

Per the Agent Skills spec at [agentskills.io/specification](https://agentskills.io/specification):

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase, numbers, hyphens only. Must not start/end with hyphen. No consecutive hyphens. Must match parent directory name. |
| `description` | Yes | Max 1024 chars. Non-empty. Describes what the skill does and when to use it. |

### Optional fields

| Field | Constraints |
|-------|-------------|
| `license` | No constraints specified beyond "short" recommendation. |
| `compatibility` | Max 500 chars. Environment requirements (product, packages, network access). |
| `metadata` | Arbitrary key-value mapping (string → string). |
| `allowed-tools` | Space-separated string of pre-approved tools. (Experimental.) |

### Codex-specific additions

Codex adds an optional `agents/openai.yaml` file within the skill directory for UI metadata in the ChatGPT desktop app:

```yaml
interface:
  display_name: "Optional user-facing name"
  short_description: "Optional user-facing description"
  icon_small: "./assets/small-logo.svg"
  icon_large: "./assets/large-logo.png"
  brand_color: "#3B82F6"
  default_prompt: "Optional surrounding prompt to use the skill with"

policy:
  allow_implicit_invocation: false  # default: true

dependencies:
  tools:
    - type: "mcp"
      value: "openaiDeveloperDocs"
      description: "OpenAI Docs MCP server"
      transport: "streamable_http"
      url: "https://developers.openai.com/mcp"
```

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Optional metadata" section.

### Format

YAML frontmatter (bounded by `---`) at the top of `SKILL.md`, followed by free-form Markdown body. No other formats are supported.

Source: [Specification](https://agentskills.io/specification), "SKILL.md format" section.

### Frontmatter example

```markdown
---
name: skill-name
description: Explain exactly when this skill should and should not trigger.
---

Skill instructions for ChatGPT or Codex to follow.
```

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Create a skill" section.

---

## 3. Hooks / Session Lifecycle

Codex has a **complete hooks system** independent from skills. Hooks are NOT part of the skill format — they are a separate extensibility framework.

### Hook events

| When | Events |
|------|--------|
| **During a turn** | `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop` |
| **Session/subagent start** | `SessionStart`, `SubagentStart` |
| **Main thread ends** | `SessionEnd` |

Source: [Hooks](https://developers.openai.com/codex/hooks), "Hooks run at different points" table.

### Hook discovery

Codex discovers hooks at these locations:
- `~/.codex/hooks.json`
- `~/.codex/config.toml` (inline `[[hooks]]` tables)
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`
- Plugin-bundled hooks (from enabled plugins)

Source: [Hooks](https://developers.openai.com/codex/hooks), "Where Codex looks for hooks" section.

### Configuration format

Hooks use a JSON or TOML config shape with three levels: event → matcher group → handlers.

```json
{
  "description": "Optional lifecycle hooks for this workspace.",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.codex/hooks/session_start.py",
            "statusMessage": "Loading session notes"
          }
        ]
      }
    ]
  }
}
```

`matcher` is a regex applied to event-specific fields (tool name for `PreToolUse`/`PostToolUse`, source for `SessionStart`, etc.).

Only `type: "command"` handlers run today. `prompt` and `agent` types are parsed but skipped.

Source: [Hooks](https://developers.openai.com/codex/hooks), "Config shape" section.

### Input/Output

Every command hook receives one JSON object on `stdin` with fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, and event-specific fields (`tool_name`, `tool_input`, `tool_response`, etc.).

Hooks return JSON on `stdout` supporting: `continue`, `stopReason`, `systemMessage`, `suppressOutput`, and for `PreToolUse`: `permissionDecision` (`allow`/`deny`/`ask`), `permissionDecisionReason`, `updatedInput`, `additionalContext`.

Source: [Hooks](https://developers.openai.com/codex/hooks), "Common input fields" and "Common output fields" sections.

### Trust model

Non-managed command hooks must be reviewed and trusted before they run. Codex records trust against the hook's current hash. New or changed hooks are marked for review and skipped until trusted. Use `/hooks` in the CLI to inspect and trust hooks.

Source: [Hooks](https://developers.openai.com/codex/hooks), "Review and trust hooks" section.

---

## 4. Subagents / Dynamic Workflows

### Built-in agents

Codex ships with three built-in agents: `default` (general-purpose), `worker` (execution-focused), and `explorer` (read-heavy exploration).

Source: [Subagents](https://developers.openai.com/codex/agent-configuration/subagents), "Custom agents" section.

### Custom agent format

Custom agents are standalone **TOML files** placed under `~/.codex/agents/` (personal) or `.codex/agents/` (project-scoped). Each file defines one agent with these required fields:

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Agent identifier used when spawning |
| `description` | Yes | Human-facing guidance for when to use |
| `developer_instructions` | Yes | Core behavior instructions |

Optional supported config keys: `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`.

```toml
name = "reviewer"
description = "PR reviewer focused on correctness, security, and missing tests."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = """
Review code like an owner.
Prioritize correctness, security, behavior regressions, and missing test coverage.
"""
```

Source: [Subagents](https://developers.openai.com/codex/agent-configuration/subagents), "Custom agent file schema" and example sections.

### Global subagent settings

Under `[agents]` in `config.toml`:

| Field | Purpose |
|-------|---------|
| `agents.enabled` | Default `true`. Disable multi-agent tools. |
| `agents.max_concurrent_threads_per_session` | Cap concurrently open agent threads. |
| `agents.default_subagent_model` | Default model for spawned agents. |
| `agents.default_subagent_reasoning_effort` | Default reasoning effort. |
| `agents.interrupt_message` | Default `true`. Record model-visible interruption message. |

Source: [Subagents](https://developers.openai.com/codex/agent-configuration/subagents), "Global settings" section.

### Triggering

Subagents are triggered by direct request (e.g., "spawn two agents," "use one agent per point") or by applicable `AGENTS.md` / skill instructions. Ultra intelligence enables proactive delegation in ChatGPT Work.

Source: [Subagents](https://developers.openai.com/codex/agent-configuration/subagents), "Triggering subagent workflows" section.

### Approval inheritance

Subagents inherit the sandbox policy and permission mode from the parent session. Custom agents can override `sandbox_mode` explicitly.

Source: [Subagents](https://developers.openai.com/codex/agent-configuration/subagents), "Approvals and sandbox controls" section.

---

## 5. Installation Paths

### Directories by scope

| Scope | Location | Use |
|-------|----------|-----|
| REPO | `$CWD/.agents/skills` | Working-folder skills |
| REPO | `$CWD/../.agents/skills` | Parent-folder skills (up tree) |
| REPO | `$REPO_ROOT/.agents/skills` | Repo-root skills |
| USER | `$HOME/.agents/skills` | Personal cross-repo skills |
| ADMIN | `/etc/codex/skills` | Machine-wide skills |
| SYSTEM | Bundled | Codex built-ins |

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Where Codex loads local skills" table.

### Skill installation

Use the `$skill-installer` built-in to download curated skills:

```
$skill-installer linear
```

For one-off skill creation, use `$skill-creator` which generates the directory + `SKILL.md` for you.

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Install curated skills for local use" and "Create a skill" sections.

### Plugin-based distribution

For reusable, distributable skills (especially those bundled with MCP connectors), use **plugins** via `codex plugin install`. Plugin structure is defined at [Build plugins](https://developers.openai.com/plugins/build/plugins).

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Distribute skills with plugins" section.

### Enable/disable

Use `[[skills.config]]` entries in `~/.codex/config.toml` to disable a skill without deleting it:

```toml
[[skills.config]]
path = "/path/to/skill/SKILL.md"
enabled = false
```

Restart Codex after changing. Custom agents can also override `skills.config`.

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Enable or disable local Codex skills" section.

---

## 6. Approval / Permission Model

### Skill invocation

Skills have **two invocation modes**:
1. **Explicit**: User mentions skill via `$skill-name` in Codex or `@skill-name` in ChatGPT.
2. **Implicit**: Codex/ChatGPT chooses a skill when the task matches the `description` field.

`allow_implicit_invocation` in `agents/openai.yaml` can be set to `false` to disable implicit invocation (default `true`).

Source: [Build skills](https://developers.openai.com/codex/build-skills), "How ChatGPT and Codex use skills" and "Optional metadata" sections.

### Skill scripts

Skills may include `scripts/` directories with executable code. **No primary source found** describing a specific approval gate that blocks skill script execution — skills load into the agent's context and their scripts are invoked by the agent within the existing permission/sandbox boundary of the session. Scripts run under whatever sandbox and approval mode is active.

### Overall permission system

Codex's permission model is independent from skills:
- **Sandbox modes**: `read-only`, `workspace-write`, `danger-full-access`
- **Approval modes**: `Ask for approval`, `Approve for me` (auto-review), `Full access`, `Custom (config.toml)`
- Sandbox and approvals are two independent controls; changing reviewer doesn't expand the sandbox.

Source: [Permissions](https://developers.openai.com/codex/permission-modes).

### vs Claude Code

**No primary source found** directly comparing Codex's skill approval model to Claude Code's. Key differences inferred from documented architectures:
- Claude Code skills use `.claude/settings.json` for permission configuration. Codex has no equivalent settings.json for skills.
- Codex skills are trust-based via progressive disclosure and sandbox enforcement. Claude Code skills have explicit permission declarations.
- Codex's `allowed-tools` frontmatter field is **experimental** and support varies between agent implementations per the Agent Skills spec.

### Admin controls

Admins can control skill distribution via:
- **Skill controls** ([enterprise skill controls](https://developers.openai.com/codex/enterprise/skills)) for workspace-level management
- **Managed configuration** via `requirements.toml` for enterprise enforcement

---

## 7. Skill Format

### File format

Skills are directories with a **`SKILL.md`** file. The `SKILL.md` format is **YAML frontmatter + Markdown body**.

Source: [Specification](https://agentskills.io/specification), "SKILL.md format" section.

### Directory structure

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code (Python, Bash, JS)
├── references/       # Optional: documentation loaded on demand
├── assets/           # Optional: templates, images, schemas
├── agents/           # Optional: Codex-specific
│   └── openai.yaml   # Optional: UI metadata, policy, dependencies
└── ...               # Any additional files or directories
```

Source: [Specification](https://agentskills.io/specification) and [Build skills](https://developers.openai.com/codex/build-skills).

### Progressive disclosure design

1. **Metadata** (~100 tokens): `name` + `description` loaded at startup for all skills
2. **Instructions** (< 5000 tokens recommended): Full `SKILL.md` body loaded when skill is activated
3. **Resources** (as needed): Files in `scripts/`, `references/`, `assets/` loaded on demand

Source: [Specification](https://agentskills.io/specification), "Progressive disclosure" section.

### Validation

Use the `skills-ref` reference library:
```bash
skills-ref validate ./my-skill
```

Checks frontmatter validity and naming conventions. From [github.com/agentskills/agentskills](https://github.com/agentskills/agentskills/tree/main/skills-ref).

Source: [Specification](https://agentskills.io/specification), "Validation" section.

---

## Additional Architecturally Relevant Details

### Record & Replay integration

You can record a workflow and Codex auto-generates a skill from it:

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Create a skill" section. Also docs at [Record & Replay](https://developers.openai.com/codex/extend/record-and-replay).

### AGENTS.md integration

Separate from skills, `AGENTS.md` provides repository-level instructions. Codex discovers `AGENTS.md` files from:
1. `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md` (global)
2. Walking from project root to CWD, checking each directory for `AGENTS.override.md`, then `AGENTS.md`, then fallback names

Files are concatenated from root down. Max combined size: `project_doc_max_bytes` (default 32 KiB).

Source: [AGENTS.md docs](https://developers.openai.com/codex/agent-configuration/agents-md).

### Config layers

Codex configuration has layered precedence:
- `~/.codex/config.toml` for user-level
- `.codex/config.toml` for project-level
- `requirements.toml` for enterprise-managed
- Environment variables for overrides

Source: [Config basics](https://developers.openai.com/codex/config-file/config-basic).

---

## Summary Table: Codex vs Claude Code vs OpenCode Skills

| Dimension | Codex | Claude Code | OpenCode |
|-----------|-------|-------------|----------|
| Skill format | `SKILL.md` (YAML frontmatter + Markdown) | `SKILL.md` (YAML frontmatter + Markdown) | JSON/YAML config + Markdown |
| Discovery paths | `.agents/skills/`, `$HOME/.agents/skills/`, `/etc/codex/skills/`, system | `.claude/skills/`, `$HOME/.claude/skills/` | `.opencode/skills/`, `~/.config/opencode/skills/` |
| Frontmatter required | `name`, `description` | `name`, `description` | Defined in JSON skills.json |
| Hooks | Separate `hooks.json` / `config.toml` system (10+ events) | Hooks in settings.json + hooks/hooks.json | N/A (different architecture) |
| Subagents | TOML files in `.codex/agents/` + built-ins | Sub-agents via system prompt | Subagents via skills.json config |
| Plugin system | `codex plugin install` (unified plugin directory) | `npx skills add` for skills | Skills loaded from config directory |
| Approval | Sandbox modes + approval modes; `allowed-tools` (experimental) | Permission rules in settings.json | Permission rules in opencode.json |
| Context budget | 2% of context or 8000 chars max for skill list | ~100 tokens per skill at startup | Configurable |

---

## Open Questions (No Primary Source Found)

- **Skill script sandboxing**: No primary source explains whether scripts in `scripts/` run with the same sandbox as the parent session or receive a separate sandbox.
- **Hook-to-skill binding**: No mechanism found in primary sources to bind hooks to specific skills (hooks are session-scoped, not skill-scoped).
- **Skill dependency ordering**: No primary source describes how Codex resolves dependencies between skills when both are loaded.
- **`allowed-tools` implementation status**: Marked "Experimental" in the Agent Skills spec. No Codex-specific docs describe its current behavior.
