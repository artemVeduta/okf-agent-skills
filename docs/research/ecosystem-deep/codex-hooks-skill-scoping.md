# Codex Hooks Skill-Scoping Research

> Research based on primary sources: OpenAI Codex Hooks docs, Build Skills docs, Codex CLI source repository (github.com/openai/codex), Agent Skills spec (agentskills.io/specification). All claims cited below. "No primary source found" where docs are silent.

## Answer: No

**Codex hooks are session-scoped only.** There is no mechanism to bind hooks to specific skills. You must filter by tool name/regex in the matcher.

---

## 1. The `matcher` system does not support skill names

The `matcher` field is a regex filter applied to **event-specific fields**. Per the [Hooks docs](https://developers.openai.com/codex/hooks), "Matcher patterns" section, the supported fields are:

| Event | What `matcher` filters |
|-------|----------------------|
| `PreToolUse` | `tool_name` |
| `PostToolUse` | `tool_name` |
| `PermissionRequest` | `tool_name` |
| `SessionStart` | `source` (`startup`, `resume`, `clear`, `compact`) |
| `SessionEnd` | `reason` (currently only `other`) |
| `PreCompact` | compaction trigger (`manual`, `auto`) |
| `PostCompact` | compaction trigger (`manual`, `auto`) |
| `SubagentStart` | `agent_type` |
| `SubagentStop` | `agent_type` |
| `UserPromptSubmit` | Not supported |
| `Stop` | Not supported |

**No event accepts a skill name or skill identifier in its matcher.** The matcher for tool events (`PreToolUse`, `PostToolUse`, `PermissionRequest`) can only match `tool_name` values like `Bash`, `apply_patch`, `Edit`, `Write`, or MCP tool names like `mcp__filesystem__read_file`.

Source: [Hooks docs](https://developers.openai.com/codex/hooks), "Matcher patterns" and "Tool coverage" sections.

## 2. No `hooks` frontmatter field in SKILL.md

The Agent Skills spec defines these frontmatter fields: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. There is **no `hooks` field**.

Source: [Agent Skills Spec](https://agentskills.io/specification), "Frontmatter" section.

The Codex [Build skills](https://developers.openai.com/codex/build-skills) docs confirm the same set of frontmatter fields and add no hooks-related extension.

**Contrast with Claude Code:** Claude Code's skill system supports a `hooks` frontmatter field in SKILL.md, documented at [Claude Code Hooks docs](https://docs.claude.codes/en/hooks#hooks-in-skills-and-agents). This is a Claude Code-specific extension not available in Codex.

## 3. No hook discovery from skill directories

Codex discovers hooks only at these locations:

- `~/.codex/hooks.json`
- `~/.codex/config.toml` (inline `[[hooks]]` tables)
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`
- Plugin-bundled hooks (via `hooks/hooks.json` in plugin root)

Source: [Hooks docs](https://developers.openai.com/codex/hooks), "Where Codex looks for hooks" section.

There is **no mechanism** for Codex to discover a `hooks.json` or hooks configuration inside a skill directory (`.agents/skills/<skill-name>/hooks.json`). The hooks system and the skills system are architecturally independent.

**Contrast with Claude Code:** Claude Code supports hooks within a skill directory when the skill folder is treated as a plugin via a `.claude-plugin/plugin.json` manifest. Changes to `hooks/` within such a skill folder require `/reload-plugins` to take effect. Codex has no equivalent.

## 4. `agents/openai.yaml` has no hook configuration

The Codex-specific `agents/openai.yaml` file supports only:

```yaml
interface:
  display_name: "..."
  short_description: "..."
  icon_small: "..."
  icon_large: "..."
  brand_color: "..."
  default_prompt: "..."

policy:
  allow_implicit_invocation: false  # default: true

dependencies:
  tools:
    - type: "mcp"
      value: "..."
      description: "..."
      transport: "..."
      url: "..."
```

Source: [Build skills](https://developers.openai.com/codex/build-skills), "Optional metadata" section.

No `hooks` key exists in this schema. No hook-related configuration is possible through `agents/openai.yaml`.

## 5. Hook input does not expose skill context

The JSON input object sent to hook commands on stdin includes fields like `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `tool_name`, `tool_input`, and `tool_response`. There is **no field** identifying the currently active or loaded skill.

Source: [Hooks docs](https://developers.openai.com/codex/hooks), "Common input fields" section.

A hook script cannot determine at runtime which skill triggered the tool call it is intercepting.

## 6. No changelog or source evidence of hooks+skills integration

A review of the [Codex changelog](https://developers.openai.com/codex/changelog) and the [openai/codex](https://github.com/openai/codex) repository reveals **no mentions** of skill-scoped hooks, hooks-in-skills, or any integration between the two systems. The hooks system and the skills system are documented and implemented as separate, independent concerns.

---

## Workarounds

Since Codex hooks cannot be skill-scoped, the only available workaround is to filter within hook scripts by examining tool input content for skill-specific patterns. For example, a `PreToolUse` hook matching `Bash` could inspect the `tool_input.command` field for commands characteristic of a particular skill's workflow (e.g., running a script in the skill's `scripts/` directory). This is inherently fragile and not a substitute for proper skill-scoped hooks.

A plugin-bundled approach provides partial scoping: if you bundle a skill and its hooks together in a plugin, the hooks will only load when the plugin is enabled. However, the hooks still fire for all tool use in the session — not just when the bundled skill is active.

---

## Summary

| Capability | Codex | Claude Code |
|-----------|-------|-------------|
| Hooks in SKILL.md frontmatter (`hooks` field) | No | Yes |
| Hooks discovered from within skill directories | No | Yes (via `.claude-plugin/plugin.json`) |
| Matcher supports skill name | No | N/A (Claude Code hooks are scoped to skill lifecycle) |
| Hook input exposes currently active skill | No | N/A (Claude Code hooks only fire when skill is active) |
| `agents/openai.yaml` hook configuration | No | N/A (Claude Code equivalent is `.claude-plugin/plugin.json`) |

The Codex hooks and skills systems are **architecturally independent** with no integration points between them as of the latest documentation.
