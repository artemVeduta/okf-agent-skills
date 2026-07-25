# Durable Context in AI Coding Platforms — Research Report

> Research date: July 2026
> Scope: Primary sources (official docs, source repos, spec files) for major AI coding platforms

---

## 1. OpenCode (AnomalyCo / Kyle Tryon)

**Source**: https://opencode.ai/docs/ (official documentation, last updated Jul 24, 2026)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **AGENTS.md** (rules) | Project root: `./AGENTS.md` | Project-level instructions |
| **AGENTS.md** (global) | `~/.config/opencode/AGENTS.md` | Personal, all projects |
| **opencode.json** (instructions) | Project: `./opencode.json`, Global: `~/.config/opencode/opencode.json` | Declarative instruction file paths |
| **Skills** | `.opencode/skills/<name>/SKILL.md`, `~/.config/opencode/skills/<name>/SKILL.md` | Reusable behavior on demand |
| **Agents** | `.opencode/agents/<name>.md`, `~/.config/opencode/agents/<name>.md` | Custom agent definitions |
| **References** | Configured in `opencode.json` | External directories/repos with descriptions |
| **CLAUDE.md** (compatibility) | Project: `./CLAUDE.md`, Global: `~/.claude/CLAUDE.md` | Fallback if no AGENTS.md |
| **CLAUDE.md skills** (compatibility) | `.claude/skills/`, `~/.claude/skills/` | Fallback skill locations |
| **Agent-compatible skills** (compatibility) | `.agents/skills/`, `~/.agents/skills/` | Third fallback for skills |

### Discovery and Loading

- **AGENTS.md**: Loaded automatically at session start. Searched by walking up from current directory. First match in each category wins (no concatenation).
- **Skills**: Loaded on-demand via the `skill` tool. Agent sees skill names and descriptions in tool prompt; loads full content only when invoked.
- **opencode.json instructions**: Can reference local files with glob patterns (`packages/*/AGENTS.md`) or remote URLs (fetched with 5s timeout). Combined with AGENTS.md content.
- **References**: Appear in TUI `@` autocomplete. Those with descriptions are advertised to agents in system context as resolvable paths.
- **/init**: Scans project, creates or improves AGENTS.md with build/lint/test commands, architecture notes, conventions, and references to existing instruction sources (Cursor, Copilot rules).

### Lifecycle Management

- No explicit staleness detection or verification mechanism documented.
- `/init` improves AGENTS.md in place rather than replacing — acts as a maintenance helper.
- Skills watch their file directories for live changes during a session (reloading without restart).
- No approval gating on instruction loading (AGENTS.md is always injected).

### Anti-patterns / Warnings

- **Claude Code compatibility fallbacks**: Can be disabled via `OPENCODE_DISABLE_CLAUDE_CODE` env vars to avoid unintentional loading of wrong instructions.
- OpenCode docs do not explicitly warn against documentation-code conflict, but the `/init` process is designed to capture what code inspection alone cannot — avoiding redundant documentation.
- Skill `description` must be specific enough for the agent to select the right one; vague descriptions lead to incorrect skill selection.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR or glossary mechanism.
- **References** with `description` fields serve as a lightweight way to point agents at external documentation directories.
- The `instructions` field in `opencode.json` can include documentation files like `docs/guidelines.md` or `CONTRIBUTING.md`.
- The AGENTS.md manual instruction pattern supports `@docs/something.md` references instructing the agent to read files as needed.

---

## 2. Claude Code (Anthropic)

**Source**: https://docs.anthropic.com/en/docs/claude-code/memory (official documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **CLAUDE.md** (managed policy) | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS), `/etc/claude-code/CLAUDE.md` (Linux) | Organization-wide, managed by IT |
| **CLAUDE.md** (user) | `~/.claude/CLAUDE.md` | Personal, all projects |
| **CLAUDE.md** (project) | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared, version-controlled |
| **CLAUDE.local.md** | `./CLAUDE.local.md` | Personal per-project (gitignored) |
| **Auto Memory** | `~/.claude/projects/<project>/memory/MEMORY.md` | Per-repo, Claude-written, machine-local |
| **Rules** (`/.claude/rules/`) | `.claude/rules/*.md`, `~/.claude/rules/*.md` | Modular, path-scoped instructions |
| **Skills** | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md` | On-demand workflow instructions |
| **Hooks** | Defined in settings JSON | Lifecycle-triggered shell/HTTP commands |
| **CLAUDE.md imports** | `@path/to/file` syntax within CLAUDE.md | Inline import of other markdown files |
| **AGENTS.md** (compatibility) | Imported via `@AGENTS.md` in CLAUDE.md or symlinked | Bridge to other agents |

### Discovery and Loading

- **CLAUDE.md**: Walks up directory tree from CWD, checks each directory for CLAUDE.md and CLAUDE.local.md. All discovered files are **concatenated** (not overridden). Ordered from filesystem root down to CWD. Subdirectory CLAUDE.md files load on-demand when files in those directories are accessed.
- **Auto memory**: `MEMORY.md` loaded at session start (first 200 lines or 25KB). Topic files in the memory directory loaded on demand. AutoMemory writes `modified` frontmatter timestamps (ISO 8601) for staleness awareness.
- **Rules**: All `.md` files in `.claude/rules/` loaded at launch (if no `paths` frontmatter) or conditionally when matching files are opened (if `paths` frontmatter set).
- **Skills**: Full body loads only when invoked. Description always in context. Frontmatter controls invocation — `disable-model-invocation: true` prevents auto-loading; `user-invocable: false` hides from slash menu.
- **CLAUDE.md imports**: Expanded at load time. Maximum 4-hop recursion. Markdown code blocks are skipped. External imports show approval dialog on first encounter.

### Lifecycle Management

- **Auto memory staleness**: `modified` frontmatter timestamps track when each memory file was last written. Claude Code measures MEMORY.md against 200-line/25KB read limits and reminds Claude to shorten it when near limits.
- **/compact**: Project-root CLAUDE.md survives compaction and is re-read from disk. Nested CLAUDE.md files reload on next file access in subdirectory. Auto memory is re-attached after compaction.
- **/doctor**: Proposes trims for checked-in CLAUDE.md (v2.1.206+), removing content Claude can derive from code.
- **/memory**: UI command to browse, open, and edit all memory files.
- **Hooks**: `InstructionsLoaded` hook fires when CLAUDE.md or rules files are loaded — enables logging/verification.
- **Live reload**: Skill directories are watched for changes during session.
- **Import approval dialog**: External imports in project CLAUDE.md trigger approval on first encounter (protection against malicious imports).

### Anti-patterns / Warnings

- **Size**: "Target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence." Use path-scoped rules or skills instead for detailed instructions.
- **Conflict between rules**: "If two rules contradict each other, Claude may pick one arbitrarily." Periodic review recommended.
- **CAUTION about enforcement**: "CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer." Use hooks for enforcement.
- **Confusion between mechanisms**: "A section of CLAUDE.md that has grown into a procedure rather than a fact" should become a skill.
- **Auto memory is NOT shared**: Machine-local only. Not synced across machines or cloud. Subagent memory is separate.
- **Monorepo contamination**: `claudeMdExcludes` setting needed to skip CLAUDE.md from other teams.
- **Context window competition**: Every line of CLAUDE.md consumes tokens; specificity matters over volume.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR or glossary mechanism.
- Auto memory topic files (`api-conventions.md`, `debugging.md`, `patterns.md`) serve as ad hoc durable knowledge stores written by Claude.
- Rules offer path-specific scoping — conventions per directory/file type (e.g., `src/api/**/*.ts` triggers API-specific rules).
- Skills are the recommended home for procedural knowledge; CLAUDE.md for declarative knowledge.
- `/init` (with `CLAUDE_CODE_NEW_INIT=1`) reads Cursor, Copilot, AGENTS.md, Devin, Windsurf rules and incorporates them.

---

## 3. Codex (OpenAI)

**Source**: https://learn.chatgpt.com/codex (official Codex documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **AGENTS.md** (project) | `./AGENTS.md` at repo root or nested directories | Project-level, team-shared, version-controlled |
| **AGENTS.override.md** | Any directory alongside AGENTS.md | Temporary override without deleting base file |
| **AGENTS.md** (global) | `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md`) | Personal, all projects |
| **config.toml** (user) | `~/.codex/config.toml` | Personal defaults (model, approval, sandbox, etc.) |
| **config.toml** (project) | `.codex/config.toml` | Project-level config (trusted projects only) |
| **config.toml** (system) | `/etc/codex/config.toml` | System-wide, all users |
| **Memories** | `~/.codex/memories/` | Per-machine, auto-generated from prior chats |
| **Chronicle memories** (research preview) | `~/.codex/memories_extensions/chronicle/` | Screen-context-augmented memories, macOS-only |
| **Skills** | `.agents/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` | Reusable workflows with scripts, references, assets |
| **Subagents** | Configured in Codex | Specialized agents with different roles/tools |
| **MCP** | Configured in `config.toml` or via plugins | External tools and context providers |
| **Hooks** | `~/.codex/hooks.json`, `.codex/hooks.json`, inline in `config.toml` | Lifecycle-triggered scripts (SessionStart, PreToolUse, PostToolUse, Stop, etc.) |
| **Rules** | `~/.codex/rules/default.rules`, `<repo>/.codex/rules/` | Command execution rules (Starlark-based), control which commands run outside sandbox |
| **Record & Replay** | Built-in | Record session to YAML for replay/debugging |
| **Markdown session export** | Desktop app UI | Export entire session as Markdown transcript |

### Discovery and Loading

- **AGENTS.md**: Loaded at session start (once per run, once per TUI session). Discovery walks from git root to CWD: checks each directory for `AGENTS.override.md` then `AGENTS.md` then fallback filenames. At global scope (`~/.codex/`), reads `AGENTS.override.md` if present, else `AGENTS.md`. All files concatenated from root down with blank lines — later files near CWD override earlier. Max 32 KiB combined (`project_doc_max_bytes`). Configurable fallback filenames (`project_doc_fallback_filenames`). Customizable with `CODEX_HOME` env var.
- **config.toml**: Precedence: CLI flags > project `.codex/config.toml` (closest to CWD) > profile files > `~/.codex/config.toml` > `/etc/codex/config.toml` > built-in defaults. Project `.codex/` layers load only for trusted projects. Managed config also enforced via `requirements.toml`.
- **Memories**: Off by default (experimental, `memories = true` feature flag). Codex turns useful context from eligible prior chats into local memory files. Background processing — skips active/short-lived sessions, waits for idle period, redacts secrets. Per-chat control via `/memories` command. Generation skips when rate-limit remaining below configured threshold (`memories.min_rate_limit_remaining_percent`). Configurable extraction and consolidation models.
- **Chronicle**: Opt-in research preview (Pro subscribers, macOS only). Captures screen context periodically, runs sandboxed background agents to generate memories. Screen captures are ephemeral (deleted after 6 hours). Uses `consolidation_model` from config.
- **Skills**: Progressive disclosure — metadata (`name`, `description`) always in context; full `SKILL.md` loaded only when chosen. Supports `scripts/`, `references/`, `assets/` subdirectories. Codex can discover and choose skills implicitly when task matches description. Repo skills in `.agents/skills`; global in `~/.agents/skills`.
- **Hooks**: Discovered next to active config layers (user, project, system, plugin). Loaded from `hooks.json` or inline `[hooks]` in `config.toml`. Non-managed command hooks must be reviewed and trusted per-hash before first run. Managed hooks (from `requirements.toml`) are pre-trusted and cannot be disabled. Lifecycle events include SessionStart, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit, SubagentStart, SubagentStop, Stop, SessionEnd.
- **Import**: Dedicated import flow from Claude Code, Claude Cowork — imports instruction files, settings, skills, plugins, MCP config, hooks, subagents, project folders, and recent chats (last 30 days). Maps `settings.json` to `config.toml`, instructions to `AGENTS.md`, slash commands to skills.

### Lifecycle Management

- **AGENTS.md freshness**: Rebuilt on every run — "no cache to clear manually." Verify with `codex --ask-for-approval never "Summarize the current instructions."`. Nested AGENTS.md files provide scoped overrides; closest to CWD takes precedence.
- **Staleness awareness**: Scheduled tasks (`/codex/automations`) can run recurring drift checks to identify guidance gaps. Docs recommend treating AGENTS.md as a feedback loop: correct the agent and ask it to update AGENTS.md so the fix persists.
- **Memory lifecycle**: Background generation with idle detection. Chronicles' screen captures auto-deleted after 6 hours. Memories are unencrypted Markdown files — users can inspect and manually prune. Configurable rate-limit gating prevents quota exhaustion.
- **Hook trust management**: Hash-based trust tracking — any change to a hook marks it for re-review. `/hooks` command for inspection, trust, and disable. `--dangerously-bypass-hook-trust` for one-off automation.
- **Config layer trust**: Project `.codex/` layers (config, hooks, rules) load only for trusted projects. Untrusted projects skip project-scoped layers but still load user/system config.
- **Session transcripts**: Markdown export from desktop app provides durable session record. Simon Willison publishes these as gists (e.g., https://gist.github.com/simonw/ab8256b81646ad967a601975e206de64).

### Anti-patterns / Warnings

- **Memories as source of truth**: "Keep required team guidance in `AGENTS.md` or checked-in documentation. Treat memories as a helpful recall layer, not as the only source for rules that must always apply." Memories are machine-local, not synced.
- **Context bloat**: "Keep it small" for AGENTS.md. Codex stops adding files at 32 KiB limit. Suggests splitting large instructions across nested directories.
- **Prompt injection via Chronicle**: "Using Chronicle increases risk to prompt injection attacks from screen content. For instance, if you browse a site with malicious agent instructions, Codex may follow those instructions."
- **Not enforcement**: "Pair `AGENTS.md` with infrastructure that enforces those rules: pre-commit hooks, linters, and type checkers catch issues before you see them."
- **Secrets in memories**: Codex redacts secrets from generated memory fields, but docs still warn to review memory files before sharing. Chronicle screen captures may contain sensitive visible information.
- **Chronicle rate limits**: Background agents for Chronicle "currently consume rate limits quickly."
- **Duplicate hooks across layers**: If a single layer has both `hooks.json` and inline `[hooks]`, Codex warns at startup. Also warns about conflicting personality settings.
- **Fallback filenames confusion**: Multiple AGENTS.md-equivalent files must be explicitly configured in `project_doc_fallback_filenames` — not auto-discovered.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR/glossary mechanism.
- **AGENTS.md** serves as the primary durable knowledge store — build/test commands, repo conventions, directory-specific instructions. Docs frame it as a "feedback loop": codify recurring review feedback, put guidance in the closest directory where it applies.
- **Skills** are the recommended home for procedural knowledge — repeatable workflows, team-specific expertise, procedures needing examples/references. Skills support richer instructions, scripts, and references.
- **Memories + Chronicle** form a screen-context layer that captures implicit working knowledge (tools, workflows, recent context) without manual authoring — but docs position this as a complement to explicit AGENTS.md, not a replacement.
- **Code review rules**: AGENTS.md supports a `## Code Review Rules` section scoped to the closest directory, feeding into Codex's GitHub code review integration. Rules describe behaviors to flag and safe paths.
- **Managed configuration** for enterprises: `requirements.toml` can enforce agent config, hooks, and rules across the organization.

### Notable Community Use

Simon Willison uses Codex Desktop extensively for agentic engineering and has praised its "Markdown session transcript export feature I've always wanted" (https://simonwillison.net, May 2026). He publishes full session transcripts as GitHub gists (e.g., GPT-5.6 Sol xhigh session building sqlite-utils transforms at https://gist.github.com/simonw/ab8256b81646ad967a601975e206de64). This practice treats session transcripts as a form of durable context — reproducible records of agent reasoning, tool use, and decisions across sessions.

---

## 4. Cursor

**Source**: https://docs.cursor.com/context/rules-for-ai (official documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **Rules for AI** (new) | `.cursor/rules/*.mdc` | Project-level, per-directory scope |
| **.cursorrules** (deprecated) | `./.cursorrules` (root only) | Legacy single-file, project-wide |
| **Agent Skills** | `.cursor/skills/<name>/SKILL.md` | On-demand workflows |
| **MCP** | `.cursor/mcp.json` | Tool integration |
| **AGENTS.md** | Project root or nested directories | Agent instructions |

### Discovery and Loading

- **Rules**: Cursor traverses the workspace directory structure. Each `.cursor/rules/*.mdc` file includes frontmatter that defines glob patterns for when the rule applies. Rules matching the current file are injected into context.
- **.cursorrules**: Legacy single file at project root. Being deprecated in favor of the directory-based `.cursor/rules/` approach.
- **Skills**: Follow the Agent Skills open standard (SKILL.md with frontmatter name/description).
- **AGENTS.md**: Works like Cursor rules — root-level is always-on, subdirectory is auto-glob for that directory.

### Lifecycle Management

- Rules include a `description` field that helps the agent determine relevance (model-decision mode).
- Rules can be set as `always`, `auto` (agent decides), or `agent-requested` (agent explicitly loads).
- No explicit staleness or verification mechanism documented.

### Anti-patterns / Warnings

- **.cursorrules being deprecated**: Official docs indicate migration to `.cursor/rules/` directory.
- Generic/broad rules that apply everywhere increase token usage without commensurate value.
- No explicit warnings about code-documentation divergence.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR/glossary mechanism.
- The rules-per-directory pattern allows domain-specific knowledge files near relevant code.
- MCP integration allows connecting external knowledge sources (docs, wikis).

---

## 5. GitHub Copilot

**Source**: https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot (official GitHub documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **Repository-wide instructions** | `.github/copilot-instructions.md` | All requests in the repository |
| **Path-specific instructions** | `.github/instructions/<NAME>.instructions.md` | Files matching glob patterns |
| **AGENTS.md** | Any directory in repo | Directory-scoped agent instructions |
| **CLAUDE.md / GEMINI.md** | Repo root | Single root-level agent instructions |
| **Organization instructions** | GitHub org settings | All repos in org |
| **Personal instructions** | User settings | All repos for user |

### Discovery and Loading

- **Priority**: Personal > Repository > Organization. All relevant sets are provided (not exclusive).
- **Path-specific instructions**: Frontmatter `applyTo` field with glob syntax (`"src/**/*.ts"`) controls scope. Multiple `NAME.instructions.md` files can coexist with different scopes.
- **AGENTS.md**: Nearest AGENTS.md in directory tree takes precedence. Multiple allowed.
- **Automatic generation**: Copilot cloud agent can auto-generate `copilot-instructions.md` from a prompt that analyzes the entire repository.
- **Exclusions**: `excludeAgent` frontmatter field can exclude instructions from `"code-review"` or `"cloud-agent"`.

### Lifecycle Management

- Instructions take effect immediately on file save.
- Custom instructions can be toggled on/off per repository (for code review).
- PR review reads instructions from the **head branch** (the branch being merged), allowing testing of instruction changes in the same PR.
- References panel shows when custom instructions were used in a response.

### Anti-patterns / Warnings

- **Conflict**: "Try to avoid providing conflicting sets of instructions." If multiple sources conflict, priority determines which wins.
- **Length**: Auto-generation prompt specifies "Instructions must be no longer than 2 pages" and "must not be task specific."
- **Static duplication**: The auto-generation prompt warns agents to record build steps once so future agents don't re-discover them.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR/glossary mechanism.
- The auto-generation prompt for `copilot-instructions.md` explicitly asks for: project architecture, build instructions, validation steps, dependency information, key source file contents — essentially a durable knowledge index.
- AGENTS.md convention bridges Copilot with other agent tools.

---

## 6. Aider (Paul Gauthier)

**Source**: https://aider.chat/docs/ (official documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **Conventions file** | Any path, loaded via `--read` or `/read` | Read-only reference |
| **Config file** | `.aider.conf.yml` (home or repo root) | All settings including auto-loaded conventions |
| **.env file** | `.env` (repo root) | Environment variables |
| **Read-only files** | Via `/read` or `/read-only` commands | Files in chat for reference only |
| **Repository map** | Auto-generated | LLM receives repo structure automatically |

### Discovery and Loading

- **Conventions**: Explicitly loaded by user via `aider --read CONVENTIONS.md` or `/read CONVENTIONS.md` in chat. Not automatic.
- **Auto-load**: Can configure in `.aider.conf.yml` with `read: CONVENTIONS.md` or `read: [CONVENTIONS.md, anotherfile.txt]` to always load.
- **Read-only marking**: Files added via `--read` or `/read` are marked read-only — aider won't edit them. They are also cached if prompt caching is enabled.
- **Repository map**: Automatically generated. Uses graph ranking on file dependencies to select most relevant 1k tokens. Dynamically adjusted based on chat state.

### Lifecycle Management

- **No automatic staleness**: Conventions are static files; users must update them manually.
- **Repo map refresh**: `/map-refresh` forces regeneration. Otherwise computed per session.
- **No verification mechanism** for conventions content.

### Anti-patterns / Warnings

- Documentation does not warn about conventions diverging from actual code. The conventions file is a simple markdown file — it can go stale silently.
- The community convention repository (https://github.com/Aider-AI/conventions) encourages sharing and versioning of conventions files.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR/glossary mechanism.
- The **repository map** serves as an always-up-to-date structural understanding of the code, reducing the need for manually maintained architecture documentation.
- Conventions files are the recommended home for coding standards, library preferences, and style guides.

---

## 7. Windsurf / Cascade (Devin Desktop by Cognition AI)

**Source**: https://docs.windsurf.com/windsurf/cascade/memories (official documentation)

### Files and Mechanisms

| Mechanism | Location | Scope |
|-----------|----------|-------|
| **Memories** (auto) | `~/.codeium/windsurf/memories/` | Per-workspace, auto-generated by Cascade |
| **Rules** (workspace) | `.devin/rules/*.md` (preferred) or `.windsurf/rules/*.md` (legacy) | Project-level, version-controlled |
| **Rules** (global) | `~/.codeium/windsurf/memories/global_rules.md` | All workspaces, 6000 char limit |
| **Rules** (system/enterprise) | `/Library/Application Support/Devin/rules/*.md` (macOS), `/etc/devin/rules/*.md` (Linux) | Organization-wide, read-only |
| **AGENTS.md** | Any directory in workspace | Automatic, directory-scoped |
| **Legacy .windsurfrules** | Workspace root (single file) | Legacy fallback |
| **Workflows** | Defined in UI | Manual-only prompt templates |
| **Skills** | `.devin/skills/` or defined in UI | Reusable procedures with supporting files |

### Discovery and Loading

- **Memories**: Auto-generated during conversations. Cascade decides what to remember. Stored locally, not shared. Retrieval is automatic when relevant.
- **Rules discovery**: Searches all `.devin/rules/` (and legacy `.windsurf/rules/`) directories in workspace, sub-directories, and parent directories up to git root. Deduplicated with shortest relative path.
- **Activation modes** (via frontmatter `trigger:` field):
  - `always_on`: Full rule in system prompt every message.
  - `model_decision`: Only description in system prompt; full content loaded when agent decides it's relevant.
  - `glob`: Applied when Cascade reads/edits files matching `globs` pattern.
  - `manual`: Only when user types `@rule-name`.
- **AGENTS.md**: Root-level = always-on, subdirectory = auto-glob for that directory.
- **Strong recommendation** in docs: "For knowledge you want Cascade to reliably reuse, write it as a Rule or add it to AGENTS.md rather than relying on auto-generated Memories."

### Lifecycle Management

- **Memories are ephemeral-ish**: Auto-generated, live only on your machine, not committed, not available across workspaces. Docs recommend Rules/AGENTS.md for durable knowledge.
- **Rules are version-controlled** (when in `.devin/rules/`) — shared with team through git.
- **Live refresh**: Rules can be edited from within Cascade UI. Take effect immediately.
- **Migrating from legacy**: `.devin/` takes precedence over `.windsurf/`; `.windsurfrules` (single file) still read as fallback.

### Anti-patterns / Warnings

- **Auto-memory vs. durable knowledge**: Docs explicitly warn: "For knowledge you want Cascade to reliably reuse, write it as a Rule or add it to AGENTS.md." Auto memory is treated as an unstable scratchpad.
- **Rule length limits**: 12,000 characters per workspace rule file, 6,000 for global rules.
- **Generic rules**: "There's no need to add generic rules (e.g. 'write good code'), as these are already baked into Cascade's training data."
- **Precedence during migration**: `.devin/` > `.windsurf/` but both are loaded. Could lead to duplication during transition.

### ADRs, Glossaries, Durable Knowledge

- No dedicated ADR/glossary mechanism.
- Rules are the primary system for durable knowledge. Four activation modes offer fine-grained control over when knowledge loads.
- AGENTS.md provides zero-config directory-scoped knowledge.
- Skills with supporting files (scripts, templates, examples) handle procedural durable knowledge.
- System-level rules support enterprise knowledge distribution.

---

## 8. Additional Platforms (Summary)

### Cline / Roo Code (VS Code Extensions)

- `.clinerules` file at workspace root (customizable location).
- Plain markdown instructions loaded as system prompt prefix.
- `.claude/CLAUDE.md` compatibility for workspace instructions.
- MCP server integration for external context sources.

### Continue (VS Code/JetBrains)

- `.continuerc.json` configuration with `systemMessage`, `slashCommands`.
- `@docs` context provider for documentation indexing.
- `@folder` context provider for directory structure awareness.
- No dedicated file-based durable context; relies on IDE-native configuration.

### Amazon Q Developer

- `.amazonq/rules/` directory with markdown files (similar to Cursor/Claude Code rules).
- `amazonqignore` for exclusion patterns.
- Workspace-level instructions with glob-based scoping.

---

## 9. Community Patterns and Discourse

### The "Rules" File Pattern

A clear cross-platform convention has emerged: **markdown files at predictable paths that inject instructions into agent context**. The community has converged on:

1. **Root-level files**: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules` — each originally platform-specific but increasingly interoperable.
2. **Directory-based rules**: `.cursor/rules/`, `.claude/rules/`, `.devin/rules/`, `.windsurf/rules/`, `.amazonq/rules/` — modular, scoped by glob patterns.
3. **Path-specific scoping**: Frontmatter `paths`/`applyTo`/`globs` fields control when rules load, reducing context waste.

The `AGENTS.md` file has become a de facto standard bridge — Claude Code, OpenCode, Copilot, Windsurf, and Cursor all support it directly or through import.

**Source**: Primary docs from all platforms; cross-referenced with the `agents.md` spec at https://github.com/agentsmd/agents.md (referenced in GitHub Copilot docs).

### RAG-based Memory Approaches

- **Aider's repo map**: A graph-based relevance ranking algorithm on the codebase. Not RAG per se, but the same principle — select relevant context from a large corpus dynamically.
- **Windsurf auto-memories**: Cascade auto-generates memories and retrieves them when "relevant" — this is essentially a RAG retrieval with relevance determined by the model.
- **Claude Code auto memory**: Claude writes and reads from MEMORY.md and topic files. Topic files are loaded on demand when relevant, functioning as a lightweight RAG system.
- **Cursor's codebase indexing**: Background indexing of the codebase for semantic search and context retrieval — a RAG approach to code understanding.

**Source**: Primary docs for each platform.

### Code vs. Documentation: The Ephemerality Tension

A significant discourse in the community centers on the tension between:

> "Code is the source of truth; documentation is a mirror that can lie."

Key perspectives from the community:

1. **James Shore** (https://simonwillison.net, May 2026): "You Need AI That Reduces Maintenance Costs" — AI-generated code that doubles output without halving maintenance costs creates a net negative. Durable context (documentation, conventions) that helps AI write maintainable code is essential.

2. **Lalit Maganti** (https://simonwillison.net, Apr 2026): "AI made me procrastinate on key design decisions" — cheap refactoring removed the pressure to get architecture right upfront. Durable design documentation becomes MORE important, not less, when AI generates code quickly.

3. **Bryan Cantrill** (https://simonwillison.net, Apr 2026): "The peril of laziness lost" — "LLMs inherently lack the virtue of laziness. Work costs nothing to an LLM." Human laziness forces crisp abstractions; AI doesn't have that pressure, so durable context about design intent is critical.

4. **Armin Ronacher** (https://simonwillison.net, Jul 2026): "The shared language of a software project is not English or Python but it is the common understanding of what its concepts mean." This understanding is rarely written in one place; agents need it to be.

5. **Charity Majors** (https://simonwillison.net, Jun 2026): "Lines of code went from treasured to disposable. AI demands more engineering discipline. Not less."

### Hamel Husain on Evals

Hamel Husain's blog (https://hamel.dev/) focuses on **evals** (evaluation frameworks) as a form of durable context:

- "Evals Skills for Coding Agents" (Mar 2026): Argues that evals are a form of durable knowledge — they encode what "good" looks like.
- "What We've Learned From A Year of Building with LLMs" (Jun 2024): Emphasizes that prompts, system instructions, and evals together form the "specification" for AI behavior.

### The Agents.md Specification

The `agents.md` specification (https://github.com/agentsmd/agents.md) is an emerging community standard:

- Defines AGENTS.md as a "universal instruction file for coding agents"
- Hierarchical: nearest AGENTS.md in directory tree takes precedence
- Supported by: GitHub Copilot, Windsurf/Cascade (and implicitly by Claude Code, OpenCode via import/compatibility)
- Purpose: "One file that works across multiple coding agents" — reducing duplication

---

## 10. Design Principles (Cross-Platform Patterns)

### 1. Hierarchical Context Loading

Every platform loads context from multiple scopes, ordered from broadest to most specific:

```
Organization/Managed → User/Personal → Project → Local (per-directory)
```

This allows organizations to set baselines, teams to add project conventions, and individuals to overlay personal preferences — without any layer needing to duplicate content from broader layers.

### 2. On-Demand vs. Always-Loaded Context

Platforms uniformly distinguish between:

- **Always-loaded** (small, always relevant): Root rules, CLAUDE.md, AGENTS.md at project root. Loaded at session start and surviving compaction.
- **On-demand** (detailed, conditional): Skills, path-scoped rules, topic-specific memory files. Loaded only when relevant, keeping context windows lean.

The threshold for "always-loaded" is typically 200 lines or page-count.

### 3. Auto-Discovery from Directory Structure

Rather than requiring explicit configuration, platforms walk the filesystem:
- Up from CWD to find parent rules/instructions
- Down into subdirectories to find nested rules
- Along the git tree to find repo-level conventions

This makes context "location-aware" — editing files in `packages/frontend/` triggers frontend-specific rules.

### 4. Declarative Scoping via Frontmatter

Path-specific rules use YAML frontmatter `paths`/`applyTo`/`globs` fields with glob syntax. This pattern appears in Claude Code, Cursor, Copilot, and Windsurf — suggesting convergence toward a shared convention.

### 5. Skills as Procedural Knowledge

Every major platform now supports "skills" — named, reusable instruction blocks loaded on demand. Skills bridge the gap between "always-on context" (too much for infrequent use) and "conversation instructions" (lost after session). The Agent Skills open standard (agentskills.io) represents an attempt to standardize this.

### 6. Code as Authoritative, Documentation as Clarifying

Across platforms, the pattern is:
- **Build/test commands** belong in durable context (they can't be reverse-engineered from code)
- **Architecture decisions and rationale** belong in durable context (they can't be reverse-engineered)
- **Directory layout** should NOT be duplicated (agents can read the file tree)
- **Code standards** belong in durable context when they deviate from language defaults
- **API reference documentation** should NOT be maintained if code has type annotations/intellisense

Claude Code's `/doctor` feature (v2.1.206+) embodies this principle by automatically trimming CLAUDE.md content that can be derived from the codebase.

### 7. Auto-Memory as a Scratchpad, Not Source of Truth

Platforms that offer auto-generated memory (Claude Code, Windsurf) consistently position it as a convenience feature, not a source of truth:
- Claude Code: Auto memory is a separate system from CLAUDE.md; limited to 200 lines loaded; contains "learnings and patterns" Claude discovers.
- Windsurf: "For knowledge you want Cascade to reliably reuse, write it as a Rule or add it to AGENTS.md rather than relying on auto-generated Memories."

---

## 11. Anti-patterns (Cross-Platform Failure Modes)

### 1. Context Bloat

The most common anti-pattern across all platforms: dumping everything into a single instruction file. Consequences:
- Token budget consumed by low-value instructions
- Model attention diluted across too many directives
- Reduced adherence to any single instruction

**Mitigations**: Path-scoped rules, skills for procedural knowledge, length limits (200 lines).

### 2. Redundant Architecture Documentation

Documenting what agents can derive from the code itself (directory structure, dependency lists, class hierarchies). This creates maintenance burden without value. Claude Code's `/doctor` explicitly identifies and trims this content.

**Mitigation**: Documentation should capture rationale, intent, and conventions — not structural facts.

### 3. Conflicting Rules Across Scopes

When organization, project, and user rules contradict each other, models pick arbitrarily. No platform currently offers conflict detection.

**Mitigation**: Periodic review of all instruction files. Explicit priority rules (e.g., Windsurf's "Devin > Windsurf" precedence).

### 4. Stale Conventions Files

Static conventions files (Aider's CONVENTIONS.md, manual rules files) have no automatic staleness detection. They can silently diverge from actual code practices.

**Mitigation**: Code review processes that treat instruction file changes as part of the change; CI checks that verify conventions are followed by actual code.

### 5. Auto-Memory as Permanent Storage

Treating auto-generated memories as durable knowledge leads to:
- Non-deterministic behavior (machines have different auto memories)
- Stale accumulated knowledge (memories not updated when code changes)
- Phantom context (memories from deleted experiments persist)

**Mitigation**: Explicit migration of valuable auto memories to version-controlled rules.

### 6. Instruction Files as Enforcement

Using CLAUDE.md/AGENTS.md for security-critical rules (e.g., "never commit secrets"). These are context, not enforcement. A model can ignore them.

**Mitigation**: Hooks (Claude Code), permissions (OpenCode), CI checks, git hooks — all operate at a layer below model decision-making.

### 7. Eager Rule Loading

Loading all rules regardless of current task. Every platform's docs warn against this: "keep rules concise," "use path-scoped rules," "generic rules aren't needed."

### 8. Documentation-Code Divergence

When instructions say one thing and code does another, the model faces ambiguity. This is the classic "docs lie" problem amplified because agents treat instruction files as authoritative.

**Mitigation**: Treat instruction files as code — review them in PRs, keep them near the code they describe, use path-scoping to localize responsibility.

---

## Sources

1. OpenCode docs: https://opencode.ai/docs/ (Rules: /docs/rules/, Agents: /docs/agents/, Skills: /docs/skills/, References: /docs/references/)
2. Claude Code docs: https://docs.anthropic.com/en/docs/claude-code/memory (Memory, Skills, Hooks pages)
3. GitHub Copilot docs: https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot
4. Aider docs: https://aider.chat/docs/ (Conventions: /docs/usage/conventions.html, Config: /docs/config.html, Repo Map: /docs/repomap.html, Commands: /docs/usage/commands.html)
5. Windsurf/Cascade docs: https://docs.windsurf.com/windsurf/cascade/memories (Memories & Rules, Cascade Overview)
6. Cursor docs: https://docs.cursor.com/context/rules-for-ai
7. OpenAI Codex: https://learn.chatgpt.com/codex (official docs — Configuration: /codex/configuration, Customization: /codex/customization/overview, Memories: /codex/customization/memories, Chronicle: /codex/customization/chronicle, AGENTS.md: /codex/agent-configuration/agents-md, Rules: /codex/agent-configuration/rules, Config basics: /codex/config-file/config-basic, Hooks: /codex/hooks, Import: /codex/import)
8. Agent Skills standard: https://agentskills.io
9. AGENTS.md spec: https://github.com/agentsmd/agents.md
10. Simon Willison's blog: https://simonwillison.net/tags/ai-assisted-programming/ (400+ posts, quoted extensively)
11. Hamel Husain's blog: https://hamel.dev/ (Evals, coding agents)
