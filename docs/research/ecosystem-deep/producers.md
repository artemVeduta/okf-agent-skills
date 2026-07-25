# OKF Ecosystem: Bundle Producing Projects — Deep Investigation

> **Research date**: 2026-07-25
> **OKF spec version targeted**: v0.1 (v0.2 released 2026-07-25)
> **Investigators**: Automated deep fetch of all source repos, READMEs, package.json, source files, docs, npm/PyPI, and web pages.

---

## 1. OpenWiki (LangChain)

### Repository
- **URL**: https://github.com/langchain-ai/openwiki
- **Stars**: 13,200+
- **Forks**: 921
- **Commits**: 189 (on `main`)
- **License**: MIT
- **Language**: TypeScript
- **Version (npm)**: 0.2.3
- **npm**: `npm install -g openwiki`
- **Package Manager**: pnpm 10.33.2 (monorepo with `pnpm-workspace.yaml`)
- **Node Engine**: `>=22`

### What It Does
OpenWiki is a CLI that writes and maintains agent documentation for codebases or builds a personal brain wiki from local knowledge sources (Git repos, Notion, Gmail, X/Twitter, Web Search, Hacker News). It uses LangChain's DeepAgents framework to inspect a codebase via an LLM, generate structured Markdown documentation in an `openwiki/` directory, and keep it updated via scheduled CI. It emits **OKF v0.1 conformant bundles** with YAML frontmatter on every concept. It also injects `CLAUDE.md` and `AGENTS.md` blocks at the repo root so coding agents automatically reference the wiki.

### Installation
```bash
npm install -g openwiki

# On Windows with bun, install Visual Studio Build Tools with
# Desktop development with C++ workload for better-sqlite3

# Quick start (no global install):
npx openwiki --init
```

### Full CLI / Command Interface

**Primary invocation**:
```bash
openwiki                    # Interactive chat (code mode)
openwiki "help me..."       # Start with a message
openwiki -p "message"       # One-shot, print and exit (non-interactive)
openwiki --init             # Full credential + mode setup wizard
openwiki --update           # Update docs (also handles first run in CI)
openwiki --help             # Show help
```

**Mode switching**:
```bash
openwiki personal              # Interactive personal brain wiki
openwiki personal --init       # Initialize personal wiki (~/.openwiki/wiki/)
openwiki personal --update     # Update personal wiki
openwiki code --init           # Explicit code mode init
openwiki code --update --print # Code mode update, print output, non-interactive
```

**Authentication**:
```bash
openwiki auth slack            # OAuth for Slack
openwiki auth gmail            # OAuth for Gmail
openwiki auth x                # OAuth for X/Twitter (PKCE)
openwiki auth notion           # OAuth for Notion (dynamic client registration)
openwiki ngrok start           # Start ngrok tunnel for Slack OAuth callback
openwiki ngrok start https://<domain>  # Fixed ngrok domain
```

**Ingestion (personal mode)**:
```bash
openwiki ingest all            # Run all configured connectors
openwiki ingest web-search     # Run all instances of one connector type
openwiki ingest web-search-2   # Run a specific source instance
openwiki personal --update "Refresh from configured connectors"
```

**Chat commands** (runtime):
```
/api-key        Update provider API key (masked prompt)
/langsmith-key  Update LangSmith tracing credentials (masked prompt)
/exit           Close session
```

**Flags**:
| Flag | Description |
|------|-------------|
| `--init` | Full credential + mode setup wizard |
| `--update` | Update existing docs (creates initial if needed) |
| `--print` / `-p` | One-shot non-interactive, prints final assistant output |
| `--help` | Show help |
| `--telemetry-file=<path>` | Write telemetry payload to a local JSON file |
| `--debug` / `OPENWIKI_DEBUG=1` | Show credential diagnostics |

**Environment variables**:
| Variable | Description |
|----------|-------------|
| `OPENWIKI_PROVIDER` | Inference provider (openai, anthropic, openrouter, gemini, gemini-enterprise, bedrock, openai-compatible, openai-chatgpt, nebius, fireworks, baseten, nvidia) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `GEMINI_API_KEY` | Gemini AI Studio key |
| `OPENAI_COMPATIBLE_API_KEY` | Custom provider key |
| `OPENAI_COMPATIBLE_BASE_URL` | Custom provider base URL |
| `OPENAI_BASE_URL` | Alternative OpenAI-compatible endpoint |
| `ANTHROPIC_BASE_URL` | Alternative Anthropic-compatible endpoint |
| `BASETEN_BASE_URL` / `FIREWORKS_BASE_URL` / `NVIDIA_BASE_URL` | Provider-specific base URLs |
| `BEDROCK_AWS_ACCESS_KEY_ID` / `BEDROCK_AWS_SECRET_ACCESS_KEY` / `BEDROCK_AWS_REGION` | AWS Bedrock credentials |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | Gemini Enterprise (Vertex AI) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account key for Vertex |
| `OPENWIKI_MODEL_ID` | Custom model ID |
| `OPENWIKI_OPENROUTER_PROVIDER_ONLY` | Pin OpenRouter to a specific upstream provider |
| `OPENWIKI_PROVIDER_RETRY_ATTEMPTS` | Retry count (default 3) |
| `LANGSMITH_API_KEY` / `LANGCHAIN_TRACING_V2` / `LANGCHAIN_PROJECT` | LangSmith tracing |
| `OPENWIKI_TELEMETRY_DISABLED` / `DO_NOT_TRACK` | Disable telemetry |
| `TAVILY_API_KEY` | Required for web-search connector |

**Configuration file**: `~/.openwiki/.env` — stores provider, API keys, credentials, model preferences. Also `~/.openwiki/onboarding.json` for per-source ingestion notes and schedules. `~/.openwiki/install-id` for anonymous telemetry grouping.

### Multi-Provider LLM Support

OpenWiki supports **12+ inference providers** out of the box:

| Provider | Config Variable | Auth Method | Notes |
|----------|----------------|-------------|-------|
| OpenAI | `openai` | API key (`OPENAI_API_KEY`) | Default; uses Responses API (`/v1/responses`); default model: `gpt-5.6-terra` |
| Anthropic | `anthropic` | API key (`ANTHROPIC_API_KEY`) | Supports `ANTHROPIC_BASE_URL` for alternative endpoints |
| OpenRouter | `openrouter` | API key (`OPENROUTER_API_KEY`) | Provider pinning via `OPENWIKI_OPENROUTER_PROVIDER_ONLY` |
| Gemini (AI Studio) | `gemini` | API key (`GEMINI_API_KEY`) | Google AI Studio |
| Gemini Enterprise | `gemini-enterprise` | ADC (Application Default Credentials) | Vertex AI Model Garden; requires `GOOGLE_CLOUD_PROJECT` |
| AWS Bedrock | `bedrock` | IAM credentials or AWS SDK default chain | Requires `BEDROCK_AWS_REGION` |
| OpenAI-compatible | `openai-compatible` | API key + base URL | Ollama, LM Studio, LiteLLM gateway, 9Router |
| OpenAI (ChatGPT login) | `openai-chatgpt` | Browser OAuth login | Uses ChatGPT Plus/Pro/Team included Codex usage, not metered API |
| Nebius Token Factory | `nebius` | API key | |
| Fireworks | `fireworks` | API key | Supports `FIREWORKS_BASE_URL` |
| Baseten | `baseten` | API key | Supports `BASETEN_BASE_URL` |
| NVIDIA NIM | `nvidia` | API key | Supports `NVIDIA_BASE_URL` |

Each provider includes predefined model options plus support for custom model IDs via `OPENWIKI_MODEL_ID`. Retry handling via LangChain built-in retry; configurable via `OPENWIKI_PROVIDER_RETRY_ATTEMPTS` (default 3).

### How It Reads Codebases

1. **File system traversal**: Reads repository structure using `Glob` and `Grep`-style tools
2. **Git history analysis**: Uses `git log`/`git blame` to understand why code exists and what has changed since last update
3. **Source reading**: Selectively reads representative files from each domain (not every file)
4. **Package analysis**: Parses `package.json`, `README.md`, project root files first
5. **LLM synthesis**: An LLM agent processes the source code and git context, then writes structured documentation

### OKF Bundle Layout (`openwiki/` Directory Structure)

```
openwiki/
├── index.md                   # Root index with `okf_version: "0.1"` (reserved)
├── log.md                     # Chronological change history (reserved)
├── quickstart.md              # Entry point document
├── INSTRUCTIONS.md            # User-authored brief (not generated, not rewritten)
├── architecture/              # System design concepts
│   └── ...
├── workflows/                 # Development processes
│   └── ...
├── domain/                    # Business logic / domain concepts
│   └── ...
├── operations/                # Deployment and infrastructure
│   └── ...
├── integrations/              # External service integrations
│   └── ...
├── testing/                   # Test strategies
│   └── ...
└── source-maps/               # Code-to-concept mapping
    └── ...
```

Each concept `.md` file has YAML frontmatter with a non-empty `type` field. `index.md` and `log.md` are reserved documents (not concepts). Standard Markdown links between concept documents express relationships. The root `index.md` declares `okf_version: "0.1"`.

### Mermaid Diagram Generation

OpenWiki embeds **Mermaid diagrams** automatically wherever they add clarity:
- **Sequence diagrams**: Runtime and request flows
- **ER diagrams**: Data models
- **State diagrams**: Lifecycle states
- **Flowcharts**: Control flow

**Validation and repair loop**:
1. After each run, every `mermaid` fence is validated
2. A failing diagram is converted in place to a plain `text` fence with a short comment explaining why
3. The next `--update` run finds the comment, repairs the diagram from the recorded error, and restores the `mermaid` fence
4. Default validation: lightweight, zero-dependency check
5. Optional high-fidelity validation: `npm install mermaid jsdom` — uses the Mermaid parser to match GitHub rendering exactly

### CI Workflows

**GitHub Actions** (`openwiki-update.yml`):
- Scheduled: `cron: "0 8 * * *"` (daily at 08:00 UTC / midnight PST)
- Manual: `workflow_dispatch`
- Steps: checkout → setup Node 22 → `npm install -g openwiki mermaid jsdom` → `openwiki code --update --print` with provider env vars → create PR with `peter-evans/create-pull-request@v7`
- PR includes: `openwiki/`, `AGENTS.md`, `CLAUDE.md`, `.github/workflows/openwiki-update.yml`
- PR branch: `openwiki/update`, commit: `docs: update OpenWiki`

**GitLab CI** (`openwiki-update.gitlab-ci.yml`):
- Same pattern, adapted for GitLab pipeline
- Include from existing pipeline or standalone `.gitlab-ci.yml`

**Bitbucket Pipelines** (`openwiki-update.bitbucket-pipelines.yml`):
- Custom pipeline scheduled from Repository settings → Pipelines → Schedules
- Same core command: `openwiki code --update --print`

### Agent File Injection (CLAUDE.md / AGENTS.md)

On each code mode run, OpenWiki maintains both `AGENTS.md` and `CLAUDE.md` at the repository root:
- Each file is **created if it does not already exist**
- If the file exists, OpenWiki only rewrites its own `<!-- OPENWIKI:START -->` ... `<!-- OPENWIKI:END -->` block
- Rest of user content is left untouched
- Appends the block on first injection if no block exists
- Content: points agents to `openwiki/quickstart.md` as entry point, with links to architecture, workflows, domain, operations, testing docs
- CI workflow PR includes these files

### Incremental Updates

- `openwiki --update` reads git changes since last metadata snapshot
- Compares current state against saved metadata (`openwiki/metadata.json` equivalent)
- Only updates documentation sections affected by the changes
- Preserves existing good content instead of rewriting everything
- If no docs exist yet, `--update` creates initial docs (CI-friendly)
- Metadata tracks: last update timestamp, model used, hash of source state

### Personal Mode Connectors

Personal mode builds a local brain wiki in `~/.openwiki/wiki/` from configured sources:

| Connector | API/Protocol | Credentials | What It Ingests |
|-----------|-------------|-------------|-----------------|
| `git-repo` | Local filesystem | None | Local repository paths → compact manifests |
| `notion` | Hosted Notion MCP server | OAuth (dynamic client registration) | Notion workspace content |
| `google` (`gmail`) | Gmail API | OAuth user credentials | Recent mail; room for Drive, Calendar later |
| `x` | X/Twitter API | OAuth 2.0 with PKCE | Home timeline, user posts, mentions, bookmarks, list posts |
| `web-search` | Tavily (via LangChain) | `TAVILY_API_KEY` | Web search results |
| `hackernews` | Public HN APIs | None | HN feed and search |

**Multiple instances**: Configure, e.g., `web-search-1` for AI research and `web-search-2` for NBA news. Run all instances with `openwiki ingest all`, one connector with `openwiki ingest web-search`, or one instance with `openwiki ingest web-search-2`.

**On macOS**: Source schedules are installed as user LaunchAgents under `~/Library/LaunchAgents/` with logs under `~/.openwiki/logs/`.

**Connector data flow**: Deterministic connector tools → raw data + manifests under `~/.openwiki/connectors/<connector>/raw/` → source-specific agent runs → synthesized local wiki under `~/.openwiki/wiki/`.

### End-to-End: `openwiki --init` on a TypeScript Project

**Step-by-step what happens**:

1. **User runs**: `openwiki --init`

2. **Credential wizard launches** (interactive TUI via `ink` React components):
   - Select inference provider (default: OpenAI)
   - Enter/paste API key (masked prompt)
   - Select model (default: `gpt-5.6-terra`)
   - Optionally set LangSmith API key (traces runs to "openwiki" project)
   - All saved to `~/.openwiki/.env`

3. **Mode selection** (if not already code mode):
   - Code mode selected → proceeds with repo documentation

4. **Onboarding**:
   - Optionally configure connectors for code-mode evidence
   - Choose wiki template, customize scope
   - Save to `~/.openwiki/onboarding.json`

5. **Setup code mode**:
   - Create `openwiki/` directory if not exists
   - Offer to create CI workflow file (copy `openwiki-update.yml` to `.github/workflows/`)
   - Ensure `AGENTS.md` and `CLAUDE.md` have OpenWiki blocks

6. **Initial documentation run**:
   - The DeepAgents documentation agent is invoked
   - It explores repository structure:
     - Reads `package.json`, `README`, main entry points
     - Uses `git log`/`git blame` for understanding
     - Reads representative files from each domain
   - Generates documentation files:
     - `openwiki/quickstart.md` — entry point
     - `openwiki/architecture/` — system design notes
     - `openwiki/workflows/` — development processes
     - `openwiki/domain/` — business logic concepts
     - `openwiki/operations/` — deployment notes
     - `openwiki/testing/` — test strategies
     - `openwiki/index.md` — root index with `okf_version: "0.1"`
     - `openwiki/log.md` — creation event logged
   - Mermaid diagrams auto-embedded where helpful
   - Validates and repairs diagrams
   - Files have YAML frontmatter with non-empty `type`

7. **Agent injection**:
   - Adds/replaces `<!-- OPENWIKI:START -->...<!-- OPENWIKI:END -->` block in `AGENTS.md` and `CLAUDE.md` at repo root

8. **Telemetry**: If enabled, sends anonymous `openwiki_run` event (command=init, mode=code, provider, success)

9. **Session**: Interactive chat opens (unless `--print` used). Agent waits for follow-up messages.

**Files created**:
```
project-root/
├── openwiki/
│   ├── index.md                   (reserved, okf_version: "0.1")
│   ├── log.md                     (reserved)
│   ├── quickstart.md              (concept)
│   ├── INSTRUCTIONS.md            (user brief, empty template)
│   ├── architecture/*.md          (concepts)
│   ├── workflows/*.md             (concepts)
│   ├── domain/*.md                (concepts)
│   ├── operations/*.md            (concepts)
│   ├── integrations/*.md          (concepts)
│   ├── testing/*.md               (concepts)
│   └── source-maps/*.md           (concepts)
├── AGENTS.md                      (updated with OPENWIKI block)
├── CLAUDE.md                      (updated with OPENWIKI block)
└── .github/workflows/
    └── openwiki-update.yml        (CI workflow, at user's option)
```

**User config**:
```
~/.openwiki/
├── .env                           (API keys, provider, model)
├── onboarding.json                (connector configs, schedules)
├── INSTRUCTIONS.md                (personal wiki instructions)
└── install-id                     (anonymous telemetry ID)
```

---

## 2. pi-openwiki (IBM PI Port)

### Repository
- **URL**: https://github.com/barvhaim/pi-openwiki
- **Stars**: 9
- **Forks**: 1
- **Commits**: 6 (on `master`)
- **License**: MIT
- **Language**: TypeScript
- **Version (npm)**: 1.0.0
- **Author**: Barha (barvhaim)

### What It Does
pi-openwiki is an adaptation of LangChain's OpenWiki for the **IBM PI coding agent** harness. It runs as a PI extension that registers custom commands (`/openwiki:init`, `/openwiki:update`, `/openwiki:chat`) and tools within the PI agent environment. Like the original, it generates structured Markdown documentation in an `openwiki/` directory by analyzing the codebase. It is Git-aware for incremental updates and auto-injects `AGENTS.md`/`CLAUDE.md` references.

### Installation

```bash
# From npm (primary method)
pi install npm:pi-openwiki

# Project-specific (local only)
pi install -l npm:pi-openwiki

# From GitHub
pi install git:github.com/barvhaim/pi-openwiki

# Temporary (this session only)
pi -e git:github.com/barvhaim/pi-openwiki

# Local development
pi -e /path/to/pi-openwiki
```

**Requirements**: PI >= 0.80.0, Git repository, Node.js with TypeScript (peer dependencies: `@earendil-works/pi-coding-agent`, `typebox`).

### Extension Architecture

```
extensions/
├── openwiki.ts                    # Main entry point (orchestrates registration)
└── openwiki/                      # Modular components
    ├── constants.ts               # OPENWIKI_DIR, METADATA_FILE, TypeScript interfaces
    ├── git-utils.ts               # Git repo detection, context collection (status/log/diff)
    ├── metadata.ts                # Metadata load/save/validate
    ├── prompts.ts                 # System prompts for init/update/chat
    ├── commands.ts                # Three command handlers
    ├── tools.ts                   # Two AI tools
    └── events.ts                  # Session start notifications
```

### Commands

**`/openwiki:init`**:
1. Checks if in a git repo (errors if not)
2. Collects git context: log, status, diff, repo structure
3. Constructs a system prompt that instructs the PI LLM to:
   - Explore `package.json`, README, main entry points
   - Use git log/blame to understand code origins
   - Read representative files selectively
   - Create `openwiki/quickstart.md` as entry point
   - Organize into architecture/, workflows/, domain/, etc.
   - Generate Mermaid diagrams
4. Sends the prompt via `pi.sendUserMessage(prompt)` — the agent then processes it with full tool access (read, write, edit, bash, ls, glob, grep)
5. When done, calls `openwiki_save_metadata` with `command: "init"` and model name
6. Calls `openwiki_ensure_agents_md` to update `AGENTS.md`/`CLAUDE.md`

**`/openwiki:update`**:
1. Checks git repo
2. Checks that metadata file exists from previous init
3. Compares current git state against last update metadata
4. If no changes detected, reports "No changes detected since last update. Skipping."
5. If changes found, constructs update prompt with:
   - Last update metadata JSON
   - Git changes since last update
   - Current status and uncommitted changes
6. Instructs the LLM to make surgical updates only to affected sections
7. Calls `openwiki_save_metadata` with `command: "update"`

**`/openwiki:chat <question>`**:
1. Takes a question argument
2. Sends chat-mode prompt to the PI agent
3. Agent answers based on existing docs and codebase exploration
4. Does NOT modify documentation

### Tools

**`openwiki_save_metadata`**:
- Parameters: `command` (`"init"` | `"update"`), `model` (string)
- Computes a snapshot hash of the current repo state
- Saves `{ command, model, timestamp, snapshot }` to `openwiki/metadata.json`
- Used by `/openwiki:update` to detect changes

**`openwiki_ensure_agents_md`**:
- Checks for `AGENTS.md` and `CLAUDE.md` at repo root
- If they exist and lack "## OpenWiki" section → appends it
- If they don't exist → creates with the section
- Section content: points agents to `openwiki/quickstart.md`

### System Prompts

**INIT prompt** (summarized):
- "You are OpenWiki, an expert technical writer, software architect, and product analyst."
- Creates structured docs that are "excellent for both humans and future coding agents"
- Start with exploration: package.json, README, main entry points
- Explain WHAT and WHY, not just file listings
- Include source references for verification
- Capture business logic and product decisions
- Use `openwiki_ensure_agents_md` and `openwiki_save_metadata` when done

**UPDATE prompt** (summarized):
- Only update docs affected by git changes
- Read existing docs first to understand current state
- Make surgical updates, don't rewrite everything
- Add new sections only if new functionality was added

**CHAT prompt** (summarized):
- Answer questions about the repository
- Use existing OpenWiki docs if they exist, otherwise explore codebase
- DO NOT modify documentation unless explicitly asked

### Differences from Original OpenWiki

| Aspect | Original OpenWiki | pi-openwiki |
|--------|-------------------|-------------|
| Runtime | Standalone CLI (Node.js, Ink TUI) | PI coding agent extension |
| Installation | `npm install -g openwiki` | `pi install npm:pi-openwiki` |
| Agent framework | LangChain DeepAgents + LangSmith | IBM PI agent harness |
| LLM provider | Multi-provider (12+), user-configured | Uses PI's configured model |
| Credential setup | Interactive wizard in TUI | Inherits PI's credentials |
| Connectors | Personal mode: Notion, Gmail, X, Web Search, HN | Not implemented |
| CI workflows | GitHub Actions, GitLab CI, Bitbucket Pipelines | Not implemented |
| Diagrams | Mermaid with validation/repair loop | Mermaid (part of LLM generation) |
| Telemetry | Anonymous opt-in | Not implemented |
| Agent file injection | `CLAUDE.md` + `AGENTS.md` with `<!-- OPENWIKI:START -->` block | Simple append of OpenWiki section |
| Update mechanism | Metadata-based file diff | Git-based snapshot hash comparison |
| Interactive mode | Full chat session | Chat command only |

### End-to-End: PI User Invokes `/openwiki:init`

1. **User opens PI**: `pi`
2. **Enters command**: `/openwiki:init`
3. **Extension handler fires**:
   - `commands.ts` → `registerCommands` → `/openwiki:init` handler
4. **Git check**: `isInGitRepo()` → verifies `.git` exists
5. **Context collection**:
   - `collectGitContext()` → runs `git log --oneline -30`, `git status --porcelain`, `git diff --stat`, collects branch info
   - `getRepoStructure()` → lists directory tree (limited depth)
6. **Prompt construction**: Combines `SYSTEM_PROMPT_INIT` (400+ words) with git log, repo structure, current status, diff
7. **Prompt injection**: `pi.sendUserMessage(prompt)` → PI's LLM receives the full context
8. **Agent execution** (by PI's LLM, which has access to tools):
   - Reads `package.json`, `README.md`
   - Explores source directories with `ls`, `glob`, `grep`
   - Creates `openwiki/quickstart.md`
   - Creates `openwiki/architecture/`, `openwiki/workflows/`, `openwiki/domain/`, `openwiki/operations/`, `openwiki/testing/` with respective `.md` files
   - Each file gets YAML frontmatter with `type`
   - Calls `openwiki_save_metadata({ command: "init", model: "..." })`
   - Calls `openwiki_ensure_agents_md({})`
9. **Output displayed**: "Initializing OpenWiki documentation...", then streaming agent output
10. **Files created**:
```
openwiki/
├── quickstart.md
├── architecture/*.md
├── workflows/*.md
├── domain/*.md
├── operations/*.md
├── testing/*.md
└── metadata.json
```
11. **AGENTS.md** and **CLAUDE.md** updated with OpenWiki reference section

---

## 3. leadcraft (Claude Code Planning Plugin)

### Repository
- **URL**: https://github.com/dskst/leadcraft
- **Stars**: 1
- **Forks**: 0
- **Commits**: 3 (on `main`)
- **License**: MIT
- **Language**: Primarily Markdown + YAML (SKILL.md files)
- **Version**: 0.0.1 (`.claude-plugin/plugin.json`)

### What It Does
leadcraft is a Claude Code plugin that helps tech leads write and refine structured planning deliverables (plans, estimates, architecture decisions, design docs). Its output is an **OKF v0.1 conformant Knowledge Bundle** — a YAML frontmatter + Markdown directory tree that is readable by humans and AI agents, version-controllable with git, and portable across organizations. It uses a **5-level planning model** (Objective > Initiative > Epic > Story > Task) and abstracts the tracker backend so Stories can be stored as local markdown (default, zero-dependency) or synced to GitHub Issues.

### 5-Level Planning Model

| Level | What It Represents | Storage Location |
|-------|-------------------|------------------|
| **Objective** | High-level business/product goal (What/Why) | `<root>/<objective>/README.md` |
| **Initiative** | Major effort to realize an Objective (How) — 10 Inception Deck questions | `<root>/<objective>/<initiative>/README.md` |
| **Epic** | Product backlog item grouping multiple Stories | `<root>/<objective>/<initiative>/<epic>/README.md` |
| **Story** | Smallest unit delivering user value | Tracker (default local: `<epic-dir>/<slug>.md`) |
| **Task** | Work items within a Story | Checklist in the Story body |

`<root>` is `output.root_dir` in `.claude/leadcraft.md` (default `docs/objectives`).

### Architecture

```
┌─────────────────────────────────────────────┐
│  Skills (compose-* / quick-stories / …)      │
│  Call tracker operations via "abstract ops"  │
│  (create_item / set_field / add_comment …)   │
└───────────────┬─────────────────────────────┘
                │ references/tracker-contract.md (abstract contract)
        ┌───────┴────────┐
        ▼                ▼
  backends/local.md   backends/github.md
  (default, zero-dep)  (opt-in)
   Story = md          Story = Issue+Projects
        │
        ▼
  <root_dir>/ tree = OKF Knowledge Bundle
  (build-bundle maintains index.md / log.md / okf_version)
```

### Complete Skill Inventory (17+ Skills)

| # | Skill | Role | Type |
|---|-------|------|------|
| 1 | `setup-baseline` | Register Fibonacci estimation reference points (2pt / 8pt) | Setup |
| 2 | `setup-dod` | Register and edit the shared Story Definition of Done | Setup |
| 3 | `compose-objective` | Interactively refine one Objective (KPIs / milestones) | Plan |
| 4 | `compose-initiative` | Refine one Initiative (10 Inception Deck questions) | Plan |
| 5 | `compose-epic` | Refine one Epic (DoD / value hypothesis / user flow) | Plan |
| 6 | `brainstorm-stories` | Roughly list Story candidates into `stories-draft.md` | Plan |
| 7 | `compose-stories` | Detail-design Stories and register to tracker (default local) | Plan |
| 8 | `quick-stories` | Register Stories with minimum steps (rough drafts) | Plan |
| 9 | `compose-hotfix` | File emergency-response Stories with `hotfix` label | Plan |
| 10 | `estimate-points` | PERT / simple point estimation (Fibonacci) | Estimate |
| 11 | `identify-risks` | Risk identification and reflection into PERT pessimistic values | Estimate |
| 12 | `convert-points-to-time` | Convert points to time, compute duration (JUAS formula) | Estimate |
| 13 | `review-stories` | Draft quality gate (6 perspectives) and graduation | Review |
| 14 | `sync-stories` | Upload local Stories → GitHub Issues (github adapter, opt-in) | Sync |
| 15 | `write-adr` | Architecture Decision Record creation | Document |
| 16 | `write-dd` | Design Doc creation (living document) | Document |
| 17 | `build-bundle` | Generate `index.md`/`log.md` and validate OKF conformance | Finalize |

Additional: `estimate-validator` agent (auto-launched after `estimate-points`), `notify-draft-added.sh` hook, `guard-project-field-mutation.sh` hook.

### Tracker Abstraction

**Tracker Contract** (`references/tracker-contract.md`):

| Provider | Output | Status | Story Representation |
|----------|--------|--------|---------------------|
| `local` | `<epic-dir>/<slug>.md` (OKF concept) | **Default** | Markdown file with YAML frontmatter |
| `github` | GitHub Issue + Projects v2 | Opt-in | Issue with Projects fields + labels |

**Abstract operations** (skills use only these, never `gh`):
`create_item`, `update_item`, `get_item`, `list_items`, `add_comment`, `set_field`, `add_label`, `remove_label`, `ensure_label`, `resource_uri`

**Field names** (normalized across providers): `objective`, `initiative`, `epic`, `points`, `risk_score`, `status`

**Labels** (normalized): `story`, `draft`, `quick`, `hotfix`, `ready`, `epic:<epic-id>`

### OKF Conformance (build-bundle)

**3 mandatory conformance conditions** (from `references/okf-conformance.md`):
1. All non-reserved `.md` files have parseable YAML frontmatter
2. All frontmatter has a non-empty `type` field
3. Reserved files (`index.md`, `log.md`) follow the expected structure

**build-bundle skill runs**: index.md generation (progressive disclosure at every hierarchy level), log.md validation, OKF conformance check (ERROR for violations, WARNING for missing recommended fields), absolute link validation (`/`-prefix internal links).

**Flags**: `--check-only` (validation only), `--no-index`, `--no-log`, `--no-links`

### Configuration File

`.claude/leadcraft.md` (committed as team config):
```yaml
output:
  root_dir: "docs/objectives"

tracker:
  provider: local          # or github

okf:
  version: "0.1"
  emit_index: true
  emit_log: true
  link_style: absolute

baseline:
  small:
    points: 2
    reference_story: "..."
    description: "..."
  large:
    points: 8
    reference_story: "..."
    description: "..."

dod:
  - "Code review completed"
  - "Tests pass"
  - "Documentation updated"

issue:
  default_labels:
    - story

story_template: ""         # optional custom template path
```

### Skill Installation

```bash
# Via Claude Code marketplace (after public release)
/plugin marketplace add dskst/leadcraft
/plugin install leadcraft

# Local development
/plugin install /path/to/leadcraft
```

### End-to-End: `compose-objective` → Full Chain → OKF Bundle

**Step 1: Setup**
```
/setup-baseline     → Registers 2pt/8pt reference stories in .claude/leadcraft.md
/setup-dod          → Registers Definition of Done checklist
```

**Step 2: compose-objective** (e.g., "customer-retention-2026")
1. User provides high-level goal description
2. Skill reads template from `${CLAUDE_PLUGIN_ROOT}/skills/compose-objective/templates/objective.md`
3. Determines ID (`customer-retention-2026`), generates 5-char `id_suffix` (e.g., `a1b2c`), sets KPI table
4. Creates: `docs/objectives/customer-retention-2026/README.md`
   - YAML frontmatter: `type: objective`, `id: customer-retention-2026`, `id_suffix: a1b2c`, `status: planning`, `title`, `description`, `tags`, `timestamp`, owner, KPI list
   - Body: Background, success criteria table, milestones, out-of-scope
5. Logs to `<root>/log.md`: "Creation: customer-retention-2026 Objective を作成"
6. If `<root>` not set yet, asks user and saves to `.claude/leadcraft.md`

**Step 3: compose-initiative** (e.g., "framework-modernization")
1. Works through 10 Inception Deck questions to define the initiative
2. Creates: `docs/objectives/customer-retention-2026/framework-modernization-a1b2c/README.md`
   - YAML frontmatter: `type: initiative`, `id: framework-modernization-a1b2c` (appended with Objective's suffix), parent Objective ID
3. Logs to Objective's `log.md`

**Step 4: compose-epic** (e.g., "oauth-login")
1. Creates: `docs/objectives/customer-retention-2026/framework-modernization-a1b2c/oauth-login-a1b2c/README.md`
   - YAML: `type: epic`, DoD, value hypothesis, user flow, acceptance criteria

**Step 5: compose-stories** (detailed stories, local mode)
1. Reads Epic README to understand context
2. User designs 3 stories: "password-reset", "token-refresh", "social-login"
3. For each story, creates `<epic-dir>/<slug>.md`:
   ```markdown
   ---
   type: story
   title: "Password Reset Flow"
   description: "Allow users to reset passwords via email verification"
   tags: ["story", "draft"]
   timestamp: "2026-07-25T10:00:00Z"
   resource: null
   tracker_ref: /customer-retention-2026/framework-modernization-a1b2c/oauth-login-a1b2c/password-reset.md
   status: draft
   objective_id: customer-retention-2026
   initiative_id: framework-modernization-a1b2c
   epic_id: oauth-login-a1b2c
   points: 0
   estimation: { o: 0, m: 0, p: 0, e: 0, stddev: 0, mode: "pert" }
   risk_score: 0
   risks: []
   labels: ["story", "draft"]
   ---
   # Password Reset Flow
   ## Background / Purpose
   ...
   ## Acceptance Criteria
   - [ ] ...
   ## Task Checklist
   - [ ] ...
   ## Definition of Done
   - [ ] ...
   ```
4. Each file is a valid OKF concept (non-empty `type`, parseable frontmatter)
5. Epic's `log.md` updated with creation entries

**Step 6: estimate-points** → estimate-validator
1. Estimates each Story using Fibonacci (1, 2, 3, 5, 8, 13, 21) against the baseline references
2. Sets `points` and `estimation` in frontmatter

**Step 7: identify-risks**
1. Adds risk entries and `risk_score` to frontmatter
2. Reflects risks into PERT pessimistic (P) values

**Step 8: review-stories**
1. Quality gate (6 perspectives)
2. Removes `draft` label → status becomes `ready`

**Step 9: build-bundle**
1. Generates `docs/objectives/index.md` (root index with `okf_version: "0.1"`)
2. Generates per-Objective, per-Initiative `index.md` files
3. Validates all concepts for OKF conformance
4. Validates/repairs `log.md` files
5. Validates absolute links

**Step 10: sync-stories (optional, if github)**
1. Uploads local Story `.md` files to GitHub Issues
2. Sets Projects fields
3. Updates frontmatter `github_issue` and `resource` URLs

**Final OKF bundle structure**:
```
docs/objectives/
├── index.md                                    # okf_version: "0.1"
├── log.md
├── customer-retention-2026/
│   ├── index.md
│   ├── log.md
│   ├── README.md                               # type: objective
│   ├── adr/
│   │   └── 20260725-choose-auth-provider.md    # type: adr
│   └── framework-modernization-a1b2c/
│       ├── index.md
│       ├── log.md
│       ├── README.md                           # type: initiative
│       └── oauth-login-a1b2c/
│           ├── index.md
│           ├── log.md
│           ├── README.md                       # type: epic
│           ├── password-reset.md               # type: story
│           ├── token-refresh.md                # type: story
│           ├── social-login.md                 # type: story
│           └── adr/
│               └── 20260724-structured-logging.md  # type: adr
└── adr/                                        # cross-objective ADRs
    └── 20260720-company-wide-auth-policy.md    # type: adr, level: cross-objective
```

---

## 4. BotsBrief (WordPress Plugin)

### Repository / Source
- **Product page**: https://botsbrief.com/
- **Blog post**: https://suganthan.com/blog/open-knowledge-format/
- **Download**: https://botsbrief.com/botsbrief.zip
- **WordPress Plugin Directory**: In review (not listed yet as of 2026-07-25)
- **License**: GPL v2 or later
- **Author**: Suganthan Mohanadasan
- **Language**: PHP (WordPress plugin)

### What It Does
BotsBrief is a free, open-source WordPress plugin that converts a WordPress site's published content (posts and pages) into an **OKF bundle** and serves it at the `/okf/` URL path. It reads the published content once, strips away theme markup, converts each post/page to clean Markdown with YAML frontmatter, builds a cross-linked knowledge graph, and serves the bundle live. It rebuilds automatically when content is published, edited, or deleted. It respects noindex settings from Rank Math and Yoast SEO plugins by default.

### Installation

```bash
# Option 1: Upload plugin in WordPress dashboard
1. Download botsbrief.zip from https://botsbrief.com/
2. WP Admin → Plugins → Add New → Upload Plugin
3. Choose the zip → Install Now → Activate

# Option 2: Via WP-CLI (when listed on WP Plugin Directory)
wp plugin install botsbrief

# Option 3: Via WordPress Plugin Directory (when listed)
WP Admin → Plugins → Add New → Search "BotsBrief" → Install → Activate
```

**Requirements**: WordPress 6.0+, PHP 7.4+, pretty permalinks enabled (Settings → Permalinks) for clean `/okf/` URL. Without pretty permalinks, the bundle serves at `yoursite.com/?okf=index.md`.

### How It Converts WP Posts to OKF Concepts

1. **Content reading**: Plugin reads all published posts and pages from the WordPress database
2. **HTML stripping**: Strips theme markup, navigation, widgets, scripts, styles, cookie banners, ads — leaves only the actual content
3. **Markdown conversion**: Converts post content to clean Markdown
4. **Frontmatter generation**: Adds YAML frontmatter to each concept file with metadata from the WordPress post
5. **Cross-linking**: Analyzes internal links between posts, builds a graph, adds "Related" sections to each concept
6. **Bundle building**: Creates a directory tree of `.md` files
7. **Serving**: Makes the bundle available at `yoursite.com/okf/`

### What WP Post Metadata Maps to Which OKF Frontmatter Fields

| WordPress Post Field | OKF Frontmatter Field | Notes |
|---------------------|----------------------|-------|
| Post type (`post`/`page`) | `type` | Maps to `Article` for posts, `Page` for pages; non-empty, OKF mandatory |
| Post title | `title` | Recommended field |
| Post excerpt or first paragraph | `description` | 1-sentence summary; recommended |
| Post permalink (URL) | `resource` | Points back to original WP post |
| Post tags + categories | `tags` | Combined as array |
| Post modified date | `timestamp` | ISO 8601; `updated` field also present |
| Post published date | `generated.at` | v0.2 provenance field |
| Post author | — | May be used in `generated: { by: "..." }` |
| Content body | (document body) | Full post content as clean Markdown |
| Internal links | (cross-links in body) | Standard Markdown links between concept files |

Example output for a WordPress post:
```markdown
---
type: Article
title: "Getting Started with WordPress SEO"
description: "A beginner's guide to optimizing your WordPress site for search engines"
resource: https://yoursite.com/blog/getting-started-with-wordpress-seo/
tags: [seo, wordpress, beginners]
timestamp: 2026-07-15T10:30:00Z
updated: 2026-07-15T10:30:00Z
---

# Getting Started with WordPress SEO

The body of the post, as clean Markdown...

## Related
- [How to Install Yoast SEO](install-yoast-seo.md)
- [10 SEO Tips for Bloggers](seo-tips-bloggers.md)
```

### Settings Page

From the WordPress admin dashboard, the plugin adds an "OKF" menu with:
- **Bundle status**: Shows the bundle is live, total concepts count
- **Content type settings**: Toggle which post types to include (posts, pages, custom post types)
- **noindex handling**: Default respects Rank Math / Yoast noindex; can be changed
- **llms.txt**: Option to publish an `llms.txt` file pointing to the bundle
- **Head hint**: Option to add a `<meta>` tag for agent discovery

### Internal Link Graph

The plugin analyzes all internal links between posts in the content body:
- Builds a knowledge graph of how content connects
- Displays an interactive visualization in the dashboard (drag, zoom, click to open page)
- Identifies orphan pages (no incoming links)
- Computes internal authority (PageRank over the link graph)
- Shows link opportunities
- Graph can be exported to CSV

### Bundle Serving
- Served at `yoursite.com/okf/` with correct Markdown content type
- `yoursite.com/okf/index.md` is the entry point listing all concepts
- Cached — no rebuild on every request; regenerated only when content changes
- `?okf=index.md` fallback for plain permalink sites
- Each concept file accessible at `yoursite.com/okf/<slug>.md`

### Rebuild Triggers
The bundle rebuilds automatically when:
- A post is published
- A post is edited (updated)
- A post is deleted
- A page is published/edited/deleted
- Settings are changed (which post types to include)

No manual rebuild step is needed.

### Key Properties
- **No external calls**: Everything generated and served from the user's own server
- **Read-only**: Reads published content, never edits or deletes posts
- **Cached**: Bundle stored on disk, served from cache
- **Safe removal**: Deactivating/deleting the plugin leaves all WP content unchanged

### End-to-End: Install Plugin → Create a Post → What Appears

1. **Install**: Upload `botsbrief.zip` → Activate
2. **Verify**: New "OKF" menu appears in WP Admin sidebar
3. **Initial build**: Plugin immediately builds the bundle from existing published posts/pages
4. **Check bundle**: Navigate to `yoursite.com/okf/index.md`
   ```
   # Knowledge Bundle for yoursite.com
   ## Concepts
   - [Hello World](hello-world.md)
   - [About](about.md)
   ```
5. **Create a new post**: "How to Train Your Puppy" with categories `[dogs, training]`
6. **Publish the post**:
   - Bundle rebuilds automatically
   - New file created: `okf/how-to-train-your-puppy.md`
   - `okf/index.md` updated to include new entry
   - Internal links detected: if the post links to other posts, those links become cross-references in the bundle
   - If other posts link to this new post, their "Related" sections get updated
7. **View the new concept file**:
   ```markdown
   ---
   type: Article
   title: "How to Train Your Puppy"
   description: "Essential tips for training your new puppy in the first month"
   resource: https://yoursite.com/blog/how-to-train-your-puppy/
   tags: [dogs, training]
   timestamp: 2026-07-25T14:00:00Z
   updated: 2026-07-25T14:00:00Z
   ---
   
   # How to Train Your Puppy
   
   Bringing home a new puppy is exciting...
   
   ## Related
   - [Puppy Nutrition Guide](puppy-nutrition-guide.md)
   - [Best Dog Toys for 2026](best-dog-toys-2026.md)
   ```
8. **Dashboard graph**: Shows the new node and its connections in the knowledge graph

---

## 5. Suganthan Web Converter (OKF Bundle Generator)

### Web Page
- **URL**: https://suganthan.com/free-seo-tools/okf-generator/
- **Author**: Suganthan Mohanadasan
- **License**: Free tool (no registration required)

### What It Does
The OKF Bundle Generator is a free web-based tool that crawls any publicly accessible website and converts its content into an **OKF v0.2** bundle. It reads up to 100 pages, converts each to a clean Markdown concept with YAML frontmatter, cross-links them into a knowledge graph, and delivers everything as a downloadable ZIP file. It also renders an interactive graph visualization of the site's internal link structure. It is the same engine used on Suganthan's own site at `suganthan.com/okf/`.

### Input Methods

1. **Single URL**: Paste `https://yoursite.com` or `https://yoursite.com/blog/`
2. **Sitemap URL**: Paste `https://yoursite.com/sitemap.xml` — follows sitemap to discover pages

### Crawling Logic

- **Cap**: 100 pages maximum (enough for most sites; for larger sites, point at a specific sitemap subset like `/blog/sitemap.xml`)
- **JavaScript-only pages**: Cannot be read (server-rendered content required)
- **Login-protected pages**: Cannot be read
- **Respects basic crawling etiquette** (details not documented, but presumably reasonable rate limiting)
- **Extraction quality**: Depends on how cleanly the site is built

### How Content Becomes OKF Concepts

1. **URL discovery**: From the provided URL or sitemap, the tool discovers up to 100 page URLs
2. **Page fetching**: Fetches each page's HTML content
3. **Content extraction**: Strips navigation, ads, scripts, styles, and other non-content markup; extracts the main content body
4. **Markdown conversion**: Converts the extracted HTML content to clean Markdown
5. **Metadata extraction**: Extracts page title, description, publication date, tags, author
6. **Concept type assignment**: Assigns appropriate `type` based on page context (likely `Article`, `Page`, `Documentation`, etc.)
7. **Frontmatter generation**: Creates YAML frontmatter with OKF v0.2 fields
8. **Cross-linking**: Analyzes internal links, builds cross-references between concept files

### Concept Types Used
Based on the blog post examples and the site's own bundle:
- `Article` — Blog posts, articles
- `Page` — Static pages (About, Contact, etc.)
- Other types as determined by content analysis

### OKF v0.2 Specific Fields
Each concept records:
- `generated`: How it was produced (`{ by: "crawl", at: "..." }`)
- `sources`: The original page URL it came from
- Nothing is marked `verified` (a crawl reads a page, it does not confirm it — the tool explicitly states this; the user must add verification claims themselves)
- `stale_after`: Not set by the tool (user's responsibility)
- `status`: Not set by the tool by default

Example concept output:
```markdown
---
type: Article
title: "How ChatGPT Actually Picks Sources"
description: "An investigation into how ChatGPT selects and ranks source material"
resource: https://example.com/blog/how-chatgpt-picks-sources/
tags: [geo, ai-seo, chatgpt]
generated:
  by: "crawl"
  at: "2026-07-25T00:00:00.000Z"
sources:
  - https://example.com/blog/how-chatgpt-picks-sources/
---

# How ChatGPT Actually Picks Sources

The body of the page as clean Markdown...

## Related
- [How AI Search Works](how-ai-search-works.md)
- [SEO in the Age of LLMs](seo-llm-age.md)
```

### Cross-Linking
- Internal links found in page content become standard Markdown links between concept files
- A "Related" section is added to each concept showing linked pages
- Links survive as a graph, so an agent sees both the pages and how they connect

### ZIP Delivery
- The user receives a `.zip` file containing the complete OKF bundle
- Contents:
```
okf-bundle.zip
└── (site name)/
    ├── index.md              # Root index listing all concepts
    ├── log.md                # Build log
    ├── (page-1-slug).md      # First concept
    ├── (page-2-slug).md      # Second concept
    └── ...                   # Up to 100 concept files
```

### Graph Visualization
- The tool also renders an interactive graph: each dot = a page, each line = an internal link
- Hover to see page titles
- Visual audit: orphan pages (no links in/out) are immediately visible
- Same engine as the internal link graph in the BotsBrief WordPress plugin

### Hosting the Bundle
After downloading, users are instructed to:
1. Unzip the bundle
2. Upload the folder to `yoursite.com/okf/` on their web server
3. Static hosts (Cloudflare, Netlify, Vercel): drop in public directory
4. WordPress: upload via FTP or file manager to `/okf/` path, or use a static-file plugin
5. Add a line to `llms.txt` pointing at `/okf/index.md`
6. Wix, Squarespace, closed platforms: usually cannot serve files at a custom path yet

### Limitations
- **100 page cap**: For sites >100 pages, use a targeted sitemap (e.g., only the blog section)
- **No JavaScript rendering**: SPAs and JS-heavy sites cannot be read
- **No login**: Cannot access authenticated pages
- **Extraction imperfect**: Quality depends on site structure cleanliness
- **No verification claims**: Tool-generated concepts are marked with crawl provenance, never marked `verified` (users must add that themselves)
- **v0.2 draft**: OKF is a v0.2 draft spec; nothing reads these bundles yet — this is "being early"

### End-to-End: Generate a Bundle for a Blog

1. **User visits**: https://suganthan.com/free-seo-tools/okf-generator/
2. **Input**: Pastes `https://myblog.com/blog/`
3. **Starts generation**: Clicks "Generate bundle"
4. **Crawling phase** (seconds to minutes, depending on site):
   - Tool discovers up to 100 URLs from the blog
   - Fetches each page HTML
   - Extracts content, strips markup
   - Converts to Markdown
5. **Processing phase**:
   - Analyzes internal links
   - Builds cross-references
   - Assigns concept types
   - Generates YAML frontmatter with v0.2 fields
   - Adds `generated` provenance (`by: "crawl"`)
   - Adds `sources` array (original URLs)
6. **Graph display**: Interactive visualization renders showing all pages and their link connections
7. **Download**: User clicks "Download bundle (.zip)"
8. **ZIP contents**:
```
myblog-bundle.zip
└── myblog/
    ├── index.md
    ├── log.md
    ├── getting-started.md
    ├── advanced-tips.md
    ├── troubleshooting.md
    └── ... (up to 100 files)
```
9. **Deployment**: User uploads to `myblog.com/okf/`, adds line to `llms.txt`

---

## Cross-Project Comparison

| Feature | OpenWiki | pi-openwiki | leadcraft | BotsBrief | Web Converter |
|---------|----------|-------------|-----------|-----------|---------------|
| **Primary use** | Codebase docs | Codebase docs (PI agent) | Tech lead planning docs | WP site → OKF | Any site → OKF |
| **Runtime** | Standalone CLI | PI agent extension | Claude Code plugin | WordPress plugin | Web tool |
| **OKF version** | v0.1 | v0.1 | v0.1 | v0.2 | v0.2 |
| **Input source** | Source code + git | Source code + git | User interview + code | WP database | Web crawl |
| **Output** | `openwiki/` dir | `openwiki/` dir | `<root_dir>/` tree | `/okf/` route | ZIP download |
| **LLM used** | Multi-provider (12+) | PI's model | Claude Code's model | None (deterministic) | Server-side crawl |
| **Auto-update** | CI scheduled | Manual command | Manual skills | On WP publish/edit | One-shot manual |
| **Graph visualization** | No | No | No | Yes (dashboard) | Yes (tool output) |
| **Connectors** | Git, Notion, Gmail, X, Web Search, HN | Git only | None | WordPress DB | Web crawl |
| **Agent injection** | CLAUDE.md + AGENTS.md | AGENTS.md + CLAUDE.md | .claude/leadcraft.md config | llms.txt + head hint | Manual upload |
| **License** | MIT | MIT | MIT | GPL v2 | Free (closed) |
| **Stars** | 13,200+ | 9 | 1 | N/A | N/A |
| **Install** | `npm install -g openwiki` | `pi install npm:pi-openwiki` | `/plugin install leadcraft` | WP plugin upload | Visit URL |
| **Dependencies** | Node >=22, DeepAgents, LangChain, Ink, LangSmith | PI >=0.80, typebox, Node | Claude Code | WP 6.0+, PHP 7.4+ | Browser |

---

## Summary

Five distinct approaches to producing OKF bundles:

1. **OpenWiki** is the most mature and feature-rich: a full CLI with 12+ LLM providers, dual mode (code + personal), CI integration, connectors to 6 knowledge sources, diagram generation, and a polished TUI. It produces v0.1 bundles for codebases and personal knowledge.

2. **pi-openwiki** is a focused port adapting OpenWiki's core codebase documentation workflow to the IBM PI agent ecosystem, with simpler architecture and fewer features but full integration with PI's command system.

3. **leadcraft** is unique: it produces OKF bundles from _planning artifacts_ (objectives, initiatives, epics, stories, ADRs, design docs) created through structured Claude Code skills, with full tracker abstraction and a 5-level hierarchy model.

4. **BotsBrief** is the only production-deployable solution that makes an existing website's content available as an OKF bundle _automatically and continuously_, rebuilding on every content change and serving live at `/okf/`.

5. **Web Converter** is the simplest entry point: a free web tool that produces a one-shot OKF bundle from any public website in under a minute, ideal for static sites or quick experimentation with the format.
