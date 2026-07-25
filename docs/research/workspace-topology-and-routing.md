# Workspace Topology, Autodiscovery, and Cross-Repository Knowledge Routing

**Date:** 2026-07-26
**Source:** wayfinder:research — [Research workspace topology, autodiscovery, and cross-repository knowledge routing](https://github.com/artemVeduta/okf-agent-skills/issues/20)
**Method:** Parallel fan-out research (4 sub-agents), full primary-source verification
**Report quality:** Deep-researched, source-cited, actionable

---

## 1. Vocabulary

These are the unambiguous terms every part of the OKF skill suite must use. No synonym pairs; each term has exactly one meaning.

| Term | Definition |
|------|-----------|
| **Workspace root** | The directory from which the agent harness was launched (harness CWD). May or may not be a git repository root. |
| **Repository root** | The top-level directory of a git working tree (`git rev-parse --show-toplevel`). |
| **Project root** | A directory within a repository that is a self-contained buildable/testable unit, identified by a build manifest (`package.json`, `go.mod`, `Cargo.toml`, etc.). In a standalone repo, project root = repository root. In a monorepo, it is a workspace member. |
| **Monorepo child** | A project root inside a monorepo, declared as a workspace member by the monorepo manager's manifest (not every subdirectory is a child). |
| **OKF bundle** | A directory tree of `.md` files conforming to the OKF v0.2 spec: one required field (`type`), two reserved filenames (`index.md`, `log.md`). The unit of knowledge scope. |
| **Knowledge scope** | The set of code artifacts and domain concepts that a single OKF bundle is authoritative for. Every concept in the bundle should be traceable to artifacts in this scope. |
| **Connected workspace** | A developer session where two or more independent repositories are open simultaneously and the developer works across them. The workspace root is not a repository root (or is one repo root with peers). |
| **Harness CWD** | The directory the agent harness was launched in — the starting point for OKF discovery. |

---

## 2. Harness Capabilities Comparison

OKF skills must operate across Claude Code, OpenAI Codex, and OpenCode. This section maps what each harness provides for workspace discovery, project instructions, configuration, hooks, nested configuration, multi-root support, and session-start behavior.

**Correction (2026-07-26):** The original investigation incorrectly reported Codex as "discontinued." StackBlitz Codex (`stackblitz-labs/codex`, `codex.docs.stackblitz.com`) is indeed gone, but **OpenAI has repurposed the Codex name** for its own developer agent product, documented at `https://learn.chatgpt.com/codex`. These are entirely unrelated products. OpenAI Codex is actively maintained (July 2026 changelog), deeply integrated with ChatGPT, and uses its own architecture (TOML config, AGENTS.md, hooks.json, agentskills.io skill standard). It is a viable cross-harness target and has been re-added to the comparison.

### 2.1 Capability Matrix

| Capability | Claude Code | OpenAI Codex | OpenCode |
|-----------|-------------|-------------|----------|
| **Workspace root signal** | Working directory + git repo detection | Git root (walks down to CWD); no repo = CWD only | Working directory; walks up to nearest git directory for config |
| **Multi-root** | `--add-dir`, `additionalDirectories`, git worktrees | Git worktrees (desktop app only), cloud environments | `references` config (local dirs + git repos) |
| **Project instruction file** | `CLAUDE.md` (primary); `AGENTS.md` via `@AGENTS.md` import | `AGENTS.md` (only); CLAUDE.md NOT in default fallbacks | `AGENTS.md` (primary); `CLAUDE.md` (fallback) |
| **User instruction file** | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.config/opencode/AGENTS.md` |
| **Local-only instruction file** | `CLAUDE.local.md` (gitignored) | `AGENTS.override.md` (merged on top) | Not supported |
| **Path-scoped rules** | `.claude/rules/*.md` with `paths:` frontmatter | Not supported; single AGENTS.md chain from root to CWD | Not supported; use `instructions` glob patterns in config |
| **Nested config in subdirs** | CLAUDE.md, rules/, skills/, agents/ in subdirectories | AGENTS.md chain (root→CWD concatenated), `config.toml` per-directory | Skills/ only (walked up to worktree root) |
| **Config file** | `.claude/settings.json`, `settings.local.json`, `~/.claude/settings.json` (JSON) | `~/.codex/config.toml` (TOML), `.codex/config.toml` (project), `requirements.toml` (managed) | `opencode.json`, `tui.json`, `~/.config/opencode/opencode.json` (JSON + JSONC) |
| **Hook mechanism** | Shell commands, HTTP, MCP tool, prompt, agent (JSON config, 30+ events) | `hooks.json` / inline `[hooks]` in TOML, 10+ events (SessionStart, SessionEnd, PreToolUse, PostToolUse, PreCompact, PostCompact, etc.) | TypeScript/JS plugins (in-process, ~30 events across 10 categories) |
| **Skills** | `SKILL.md` in `.claude/skills/`, nested support | `SKILL.md` in `.agents/skills/` (CWD→repo root), `~/.agents/skills/`. Open Agent Skills standard (agentskills.io) with `agents/openai.yaml` extras | `SKILL.md` in `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` |
| **Skill metadata** | YAML frontmatter (name, description, tools) | YAML frontmatter (name, description) + optional `agents/openai.yaml` | YAML frontmatter (name, description, license, compatibility) |
| **Auto-memory** | MEMORY.md, auto-learning, per-subagent memory | Memories (`.codex/memories/`, background generation, opt-in), Chronicle (macOS screen capture preview) | None (AGENTS.md is sole persistent store) |
| **Worktree isolation** | `--worktree` flag + `isolation: worktree` for subagents | Git worktrees in desktop app (managed, 15-retention limit, snapshot recovery) | Not supported |
| **MCP** | stdio, HTTP, SSE, WebSocket, OAuth (Full) | stdio + streamable HTTP, Bearer token + OAuth, tool allow/deny lists (Full) | Remote, local, OAuth (Full) |
| **Subagents** | Built-in + custom (`.claude/agents/`), markdown frontmatter | Built-in (default, worker, explorer) + custom (`.codex/agents/*.toml`), TOML config | Built-in (Build, Plan, General, Explore, Scout) + custom (`.opencode/agents/`) |
| **CLI name** | `claude` | `codex` / `codex exec` (non-interactive) | `opencode` |
| **Session-start load** | Managed/user/project CLAUDE.md, rules, skills, MCP, auto-memory, SessionStart hook | Config (system→user→project), AGENTS.md chain (root→CWD concatenated), skills (`.agents/skills/`), hooks, MCP, subagents, rules, memories | Config merged, AGENTS.md discovered, skills from 6 paths, plugins, MCP, references materialized |

**Sources:** Claude Code docs ([docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code/): memory, settings, hooks, skills, sub-agents, MCP, large-codebases, worktrees); OpenAI Codex docs ([learn.chatgpt.com/codex](https://learn.chatgpt.com/codex): configuration, agent-configuration, skills-and-plugins, hooks, environments, CLI, IDE, SDK); OpenCode docs ([opencode.ai](https://opencode.ai/docs/): config, rules, agents, skills, plugins, references, permissions).

### 2.2 Cross-Harness Gaps

1. **Config format divergence:** Claude Code = JSON (`.claude/settings.json`), OpenAI Codex = TOML (`.codex/config.toml`), OpenCode = JSONC (`opencode.json`). No shared config format. Per-harness configuration is unavoidable.

2. **Instruction file divergence:** Codex uses `AGENTS.md` only (no `CLAUDE.md` in default fallbacks). Claude Code uses `CLAUDE.md` primarily. OpenCode uses `AGENTS.md` with `CLAUDE.md` fallback. The common denominator is `AGENTS.md` — but Claude Code needs explicit `@AGENTS.md` import.

3. **Skills at `.agents/skills/` is the convergence point:** Both OpenAI Codex and OpenCode discover skills at `.agents/skills/`. Claude Code uses `.claude/skills/`. For maximum three-harness reach, place `SKILL.md` in both `.claude/skills/` and `.agents/skills/` (symlink acceptable).

4. **SKILL.md standard convergence:** OpenAI Codex explicitly builds on the open Agent Skills standard (agentskills.io). OpenCode also uses SKILL.md. Claude Code uses a custom but compatible format. This is the strongest cross-harness mechanism.

5. **Hook system incompatibility:** All three have different hook systems (Claude Code = JSON, Codex = TOML/hooks.json, OpenCode = TypeScript plugins). OKF lifecycle automation must be per-harness.

6. **Codex has no CLAUDE.md support by default.** To bridge, Claude Code projects must add `CLAUDE.md` to Codex's `project_doc_fallback_filenames` config, or maintain both files.

7. **Codex can import from Claude Code** (`/import` converts `settings.json` → `config.toml`, skills, MCP, hooks, chats). No equivalent import from OpenCode exists yet.

---

## 3. Topology Pattern Analysis

### 3.1 Pattern 1: Monorepo with Root Knowledge + Child Projects

**Structure:** Monorepo root (e.g., Turborepo + pnpm) with an `okf/` bundle at root and optional per-child `okf/` bundles under `packages/<name>/` or `apps/<name>/`.

**Discovery:** `git rev-parse --show-toplevel` → detect monorepo manager manifest (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`) → walk declared workspace members → for each child with an `okf/` directory, register child bundle.

**Knowledge scope:** Root bundle covers cross-cutting concerns, shared glossary, architectural decisions. Child bundle covers child-specific domain. A concept referencing two or more children belongs in the root bundle, not duplicated.

**Routing:** Agent working in a child consults both root and child bundles. Child takes precedence for child-specific concepts. Agent working in a child without its own bundle gets only the root bundle.

**Edge cases:**
- Workspace root ≠ monorepo root when harness started inside a child directory. Discovery must walk UP, not stop at child boundary.
- Turborepo explicitly bans nested packages. OKF should match: no nested child bundles.

### 3.2 Pattern 2: Standalone Repository

**Structure:** Single repo = single project = one `okf/` bundle.

**Discovery:** Trivial. `git rev-parse --show-toplevel` returns the root. One bundle. The simplest case — no routing decisions needed.

### 3.3 Pattern 3: Several Standalone Repositories Connected for One Workflow

**Structure:** Parent directory (non-repo) containing multiple independent git repos, each with its own `okf/`.

**Discovery:** `git rev-parse --show-toplevel` from CWD fails (CWD is not in any git repo). Skill must walk immediate children, detect git repos, check each for `okf/`. A `.okf-workspace.json` manifest (Section 6) provides explicit registration.

**Knowledge routing:** Each repo has its own bundle. No cross-bundle linking in the OKF spec (multi-bundle operations are explicitly out of scope for v0.2). For connected workspaces, the skill should surface that multiple bundles exist and suggest which to consult.

### 3.4 Pattern 4: Non-Repository Workspace Root with `projects/` Folder

**Structure:** A Tilt/Kubernetes workspace root (non-git) containing a `projects/` directory with cloned git repos inside.

**Discovery:** Check for `projects/` directory first, then walk children for git repos and `okf/` bundles. The workspace root itself can have an `okf/` for workspace-level context (valid per spec — a bundle does not require being inside a git repo).

**Dynamic repos:** Tilt may clone repos into `projects/` at `tilt up` time. These repos may not exist when `okf-init` first runs. The skill must handle "repo not yet cloned" as a discovered-but-absent state and re-check when file watchers detect new directories.

### 3.5 Pattern 5: Monorepo + Standalone Project Side by Side

**Structure:** A monorepo and a standalone project in sibling directories, both with independent OKF bundles.

**Knowledge routing:** When working in the monorepo, load monorepo bundles. When working in the standalone, load its bundle. When the monorepo imports the standalone as a dependency (e.g., `@company/design-system`), the skill can resolve through `node_modules` symlinks to discover the standalone's bundle as supplementary context.

### 3.6 Pattern 6: Complex Nesting

| Topology | Detection | OKF Handling |
|----------|-----------|-------------|
| **Nested git repos** (`.git` inside `.git`) | Run `git rev-parse` from workspace root; scan for nested `.git` dirs | Flag as anomaly. The inner repo's files are physically within the outer repo — ambiguous knowledge scope. |
| **Git submodules** | `.gitmodules` file; `git submodule status` | Exclude by default (submodules are vendored dependencies). Include only by explicit opt-in in manifest. |
| **Git worktrees** | `.git` is a file (not dir); `git worktree list` | Multiple worktrees share git history. Each may have different `okf/` versions. Discovery via `git worktree list`. |
| **Symlinked sources** | `realpath` resolution | Resolve to real path. If different from working repo, it's a connected workspace boundary. Flag to user. |
| **Sparse checkouts** | `git sparse-checkout list` | `okf/` may be sparse-checked-out or not. If committed but not on disk, generate from git index. |
| **Generated/vendor dirs** | Path matches `node_modules`, `dist`, `build`, `vendor`, `.venv`, `__pycache__`, etc. | **Always exclude**. Use hard-coded exclusion list + respect `.gitignore` + optional `.okfignore`. |

---

## 4. Knowledge Routing

### 4.1 The Core Problem

OKF v0.2 has **no multi-bundle operations** — this is Limitation #4 in the spec. Cross-bundle links would be broken by design. Every routing decision for the skill suite is greenfield.

### 4.2 Routing Model: Two-Tier with CUE-Style Subsumption

**Base layer — Shared glossary bundles:** A bundle published at a known location defines canonical `type: Term` concepts. These are base definitions.

**Override layer — Project-local bundles:** Each project may *extend* or *narrow* a shared definition but never *contradict* it:

- **Narrowing** (safe): A local concept with the same key adds more specific fields — additional `sources`, tighter `stale_after`, extra `tags`. This is CUE-style subsumption: the local definition is *more specific*.
- **Contradiction** (error): A local concept that changes the `type`, contradicts the `description`, or declares an incompatible `resource`. Produces a surfaced error, not silent override.
- **Override** (for lifecycle fields): The most specific (local) value wins for `status`, `stale_after`. Shared glossaries set defaults; project bundles apply local policy.

**Prior art:** CUE's value lattice (values ordered by subsumption, conflict = ⊥), Nix overlays (later overlays override earlier), Turborepo `extends` chains (replace vs append).

### 4.3 Precedence Rules

1. **Explicit routing > implicit** — a workspace manifest routing rule wins over heuristics.
2. **Nearest bundle wins** — in a hierarchical topology, the bundle physically closest to the files being edited takes precedence. A child project's bundle overrides the parent monorepo's root bundle within the child's scope.
3. **Trust tier as tiebreaker** — between two compatible definitions, `human-reviewed` > `machine-confirmed` > `unverified`.

### 4.4 Provenance Tracking

Every concept that enters a bundle from an external source should carry provenance. Recommended extension fields:

- `imported_from.bundle` — URI of source bundle
- `imported_from.path` — path within source bundle
- `imported_from.at` — timestamp of import
- `overrides.path` — which concept this overrides
- `overrides.fields` — which fields differ

### 4.5 Parent-to-Child Knowledge Propagation

**Default: parent bundles ARE readable from child contexts.** When an agent operates in `monorepo/packages/web/`, it can read from `monorepo/okf/` and `monorepo/packages/web/okf/`. A child's local concept with the same key **shadows** the parent's (prototype chain semantics). A child may opt out entirely via `okf-inherits: false` in its bundle root `index.md` frontmatter.

---

## 5. Lifecycle Scope Per Topology

### 5.1 `init` — Setting Up OKF

| Topology | Behavior |
|----------|----------|
| **Code-backed standalone** | Create `okf/`, root `index.md`, `log.md`, scaffold 3-5 seed concepts from README + package.json. |
| **Knowledge-only standalone** | Same structure, plus domain-specific templates. Content is entirely user-driven. |
| **Monorepo** | Two-level: root `okf/` for cross-cutting + per-package `okf/` for package-specific. Packages that are purely libraries with self-documenting code may not need a bundle. |
| **Connected repos** | Per-repo `init`. `.okf-workspace.json` is the coordination point. |
| **Multi-bundle** | Multiple top-level bundle dirs. Root `okf.json` declares bundle topology. |

### 5.2 Incremental CRUD

- **Code-backed:** The Pocock test applies — "can the agent recover this from code alone?" If yes, don't write it. Agent reads relevant concepts at session start, proposes small evidence-backed updates.
- **Knowledge-only:** All knowledge changes are CRUD. Every write logs to `log.md`. Trust tiers gate destructive operations.

### 5.3 `sync` — Reconciling Knowledge with Code Changes

- Detects drift: for each concept referencing a code file, checks if that file changed since last concept modification (via `git diff`).
- **Session sync:** lightweight, scoped to current changes, pre-PR.
- **CI sync:** full drift detection, all bundles, on schedule.
- **Monorepo:** Scoped to changed packages only (via `git diff --name-only main..HEAD`).
- **Connected repos:** Current repo only. Cross-repo drift detection is opt-in.

### 5.4 Lifecycle Operations Matrix

| Operation | In Scope (Always) | Gated By |
|-----------|-------------------|----------|
| **Create concept** | Any session | Unrestricted |
| **Update body** | Any session | Notice required |
| **Deprecate concept** | When referenced code is removed | Preview + machine-confirmed |
| **Archive concept** | At compaction thresholds (~500 concepts) | Human review |
| **Compact (merge/split)** | When concept count crosses Zettelkasten thresholds | Human review |
| **Delete concept** | Never — archive instead | Human review + confirmation |

**Trust tier gates:**

| Operation | Unverified | Machine-confirmed | Human-reviewed |
|-----------|-----------|-------------------|----------------|
| Create | Allowed | Allowed | Allowed |
| Update body | Allowed (notice) | Allowed (notice) | Allowed (silent) |
| Deprecate | Blocked | Requires preview | Allowed (notice) |
| Archive | Blocked | Blocked | Allowed (preview) |
| Compact | Blocked | Blocked | Allowed (preview) |
| Delete | Blocked | Blocked | Requires confirmation |

### 5.5 Validation & Pre-PR Checks

| Project type | Pre-PR checks | Blocking? |
|-------------|--------------|-----------|
| **Code-backed** | Conformance, staleness, new domain terms documented, rationale updated | Non-blocking (advisory nudge) |
| **Knowledge-only** | Conformance, log.md entries, `generated.by` set, index freshness, trust-tier verification | Blocking (OKF IS the source of truth) |
| **Monorepo** | Scoped to changed packages. Root bundle checked for cross-cutting changes. | Non-blocking |
| **Connected repos** | Per-repo only. Cross-repo link check is opt-in. | Non-blocking |

### 5.6 Compaction Thresholds

Derived from Zettelkasten community patterns ([obsidian-transferable-patterns.md](lightweight-durable-context.md)):

| Concept Count | Action |
|--------------|--------|
| < 500 | Flat structure sufficient; full-text search |
| 500–700 | Create hub notes; tag-based navigation |
| 1000–1500 | Create MOCs (Maps of Content); `type: Map` concepts |
| > 1500 | Meta-MOCs; structural compaction required |

---

## 6. Workspace/Federation Manifest

### 6.1 Explicit Manifest: Necessary, Optional, or Avoidable?

**Verdict: Optional, strongly recommended for monorepos (T3) and connected repos (T4). Avoidable for standalone projects (T1, T2).**

This follows the pattern of every major monorepo tool: no configuration for simple cases, explicit manifests for complex cases.

| Topology | Manifest Needed? | Rationale |
|----------|-----------------|-----------|
| **Standalone (T1, T2)** | No | Autodiscovery of a single `okf/` directory is trivially deterministic |
| **Monorepo (T3)** | Strongly recommended | Root + child bundle routing needs explicit declaration for reliability |
| **Connected repos (T4)** | Required | The only reliable way to know which repos are "connected" |
| **Multi-bundle (T5)** | Required | Bundle topology declaration is the source of truth for routing |

### 6.2 Prior Art

| System | Manifest | What it declares |
|--------|----------|-----------------|
| **VS Code** | `.code-workspace` (JSON) | `folders[]`, `settings`, `launch`, `tasks`, `extensions` — multi-root boundaries |
| **Turborepo** | `turbo.json` | `tasks`, `globalDependencies`, `extends` chains, `boundaries` (dependency rules) |
| **pnpm** | `pnpm-workspace.yaml` | `packages` (globs), `catalog` (shared versions), per-package config |
| **Nx** | `nx.json` | `namedInputs`, `targetDefaults`, `extends`, multi-source merging |
| **Lerna** | `lerna.json` + `nx.json` | `packages`, `version` mode, per-command options |
| **Rush** | `rush.json` | All projects, common folders, phased commands |

**The pattern for OKF:** A manifest follows VS Code's approach — `.okf-workspace.json` with `bundles[]` (each declaring `name`, `path`, `project_type`, `description`, `tags`), `routing` (rules for bundle interaction), `validation` (pre-PR scope, blocking behavior), and `trust_gates` (per-operation trust eligibility).

### 6.3 Autodiscovery (No Manifest) Heuristics

When no manifest exists, the skill uses:

1. **Walk-up:** From CWD, walk up looking for `okf/` directory. First found is the nearest bundle.
2. **Monorepo detection:** If `pnpm-workspace.yaml` / `turbo.json` / `nx.json` found at git root, read workspace members and check each for `okf/`.
3. **Git worktree boundary:** Stop walk-up at `git rev-parse --show-toplevel`. Bundles within the same git repo are "local."
4. **Bundle directory name:** Look for directories named `okf`, `okf-bundle`, `knowledge` at any level within the git worktree.

### 6.4 Explicit vs Implicit Tradeoffs

| Dimension | Explicit Manifest | Implicit Autodiscovery |
|-----------|------------------|----------------------|
| **Token cost** | Lower (O(1) + bundle scanning) | Higher (filesystem walk O(n)) |
| **Reliability** | Higher (authoritative, no ambiguity) | Lower (heuristics can miss bundles) |
| **Portability** | Higher (JSON is universal) | Lower (depends on filesystem layout) |
| **Maintenance** | Higher (must update when bundles change) | Lower (zero config, auto-discovers) |
| **Simple case UX** | Unnecessary overhead | "Just works" |

---

## 7. Performance, Security & Operations

### 7.1 Startup Performance

**Context window capacities** (all three harnesses use 1M+ token models):

- Claude Opus 5 / Sonnet 5 / Fable 5: 1M tokens
- GPT-5.6 Sol / Terra / Luna: 1.05M tokens
- Gemini 2.5 Pro: 2M tokens

The real constraint is not window size but **attention quality degradation over longer contexts**.

**Bundle token costs:**

| Bundle Size | Concepts | Load all | Cost (Opus 5, $5/MTok input) |
|------------|----------|---------|------------------------------|
| Small | 10-30 | 9k-45k tokens | $0.045-$0.225 |
| Medium | 50-100 | 45k-150k tokens | $0.225-$0.75 |
| Large | 200-500 | 150k-750k tokens | $0.75-$3.75 |
| Very large | 1000+ | 750k+ tokens | > $3.75 |

**Loading all bundles at session start is unsustainable.** The solution is **three-tier lazy loading:**

1. **Session start:** Load only bundle root `index.md` files (flat listing of top-level concept types). For 20 bundles: ~12k tokens.
2. **On navigation:** Load subdirectory `index.md` only when the agent accesses that subdirectory.
3. **On concept access:** Load full concept body only when the agent needs specific knowledge.

### 7.2 Caching Strategy

**Recommended: Filesystem cache keyed by git HEAD SHA.**

- Cache store: `.okf/cache/` (or configurable path)
- Invalidated on: git checkout/switch (full), file modification (per-concept), missing repo detection (per-entry)
- Cached content: Parsed frontmatter for all concepts (not bodies), index entries, link graphs, tag maps, staleness status, trust tiers — ~5-10% of full bundle size

### 7.3 Security Boundaries

- **Filesystem access:** OKF skills need the same permissions as a coding agent. Each harness gates filesystem access through its own permission model.
- **Scope control:** Skills should use a configurable `OKF_ROOT` path, defaulting to `./okf/` relative to project root. Sibling repos are intentionally out of scope unless explicitly added.
- **`.gitignore` respect:** Automatic in git repos. Support `.okfignore` for project-specific exclusions.
- **Secrets:** OKF bundles should NEVER contain credentials. Validation should flag common secret patterns.
- **Private repos:** Follow the harness's telemetry exclusion pattern — never log or transmit bundle contents from private repos.

### 7.4 Directory Exclusion

**Always excluded (hard-coded):** `.git/`, `.hg/`, `.svn/`, `node_modules/`, `vendor/`, `.venv/`, `venv/`, `__pycache__/`, `dist/`, `build/`, `target/`, `out/`, `.next/`, `.nuxt/`, `coverage/`, `.idea/`, `.vscode/`, `.DS_Store`

**User-configurable:** `.okfignore` with fnmatch syntax. Override with explicit per-bundle inclusion.

### 7.5 Missing Repos & Offline Operation

- **Missing repo:** Log warning, continue loading available bundles. Do not fail. Surface status: "Loaded: 3/5 bundles. Missing: repo-w (not cloned), repo-v (no okf/)."
- **Offline:** OKF bundles are local files — offline operation works by default. Skip enrichment/validation requiring network. Defer `sources[].resource` URL resolution.
- **Dynamic repos:** File watchers (inotify/FSEvents) detect new directory appearance; short TTL cache (60s) balances freshness.

---

## 8. Tilt/Kubernetes Acceptance Scenarios

### Scenario A: Tilt Workspace with `project/` Folder, Harness from Tilt Root

**Setup:** Tilt root at `/workspace/` with `Tiltfile`. Repos dynamically cloned into `project/` (`api-server`, `worker`, `frontend`). Harness starts from `/workspace/`.

**Discovery walkthrough:**
1. CWD = `/workspace/` — not a git repo.
2. Check for workspace-level `okf/` (create if missing for workspace-level context).
3. Check `project/` directory — each child with `.git/` and `okf/` is registered.
4. Result: 3 repo-scoped bundles mapped. Workspace-level `okf/` for cross-service context.

**Dynamic repos:** Tilt clones repos at `tilt up` time. The skill handles "repo not yet cloned" as a discovered-but-absent state. File watchers detect when repos appear and trigger re-discovery.

### Scenario B: Monorepo in Tilt Workspace, Harness from Monorepo Root

**Setup:** Tilt root at `/workspace/` with `projects/` containing `client`, `workers`, `worker-manager` (Turborepo monorepo), `model` (database repo), `ui-components` (git npm package). Harness starts from `worker-manager/` (monorepo root).

**Discovery walkthrough:**
1. CWD = `/workspace/projects/worker-manager/` — IS a git repo root.
2. Detect monorepo: `turbo.json` + `pnpm-workspace.yaml`. Discover children: `apps/scheduler/`, `apps/dispatcher/`, `packages/shared-utils/`.
3. Root bundle: `worker-manager/okf/`. Child bundles at each child's `okf/`.
4. **Connected workspace discovery:** Monorepo does NOT automatically discover sibling repos (outside its git root). Options:
   - Walk up from CWD to Tilt root, then discover `projects/` peers.
   - Use `.okf-workspace.json` manifest declaring connected bundles.
   - Resolve `package.json` dependencies (`@company/ui-components` → `node_modules` symlink → `../../projects/ui-components/` → discover its `okf/`).

**Knowledge routing:** Agent in `apps/scheduler/` gets monorepo root + scheduler child bundles. UI changes resolve through `node_modules` symlinks to `ui-components/okf/`. Cross-service concerns use workspace-level `okf/` at Tilt root.

---

## 9. Topology/Behavior Comparison Matrix

| Behavior | Standalone (T1/T2) | Monorepo (T3) | Connected Repos (T4) | Multi-Bundle (T5) |
|----------|-------------------|---------------|---------------------|-------------------|
| **Discovery** | Walk up from CWD to git root | Detect monorepo manager, walk declared workspace members | Walk peers from workspace root or use manifest | Read `okf.json` topology declaration |
| **Bundle count** | 1 | 1 root + N child | 1 per repo | N domain bundles |
| **Routing rule** | N/A (single bundle) | Child shadows root; root covers cross-cutting | Each repo is independent; manifest enables cross-refs | Domain-type-based routing from topology |
| **Init scope** | Create single `okf/` | Create root + optionally per-package | Per-repo; manifest coordinates | User-specified domain split |
| **Sync scope** | All concepts | Changed packages only (by git diff) | Current repo only | Per-bundle by domain |
| **Pre-PR scope** | All concepts | Changed packages + root cross-cutting | Current repo only | All bundles |
| **Compaction** | Per-bundle | Per-bundle (root and children independently) | Per-repo independently | Cross-domain merging with user approval |
| **Validation** | Single bundle | All bundles + dedup warning | Per-repo + optional cross-repo | Per-bundle + cross-bundle link check |
| **Manifest** | Not needed | `.okf-workspace.json` at monorepo root (recommended) | `.okf-workspace.json` at workspace root (required) | `okf.json` at project root (required) |

---

## 10. Unresolved User Decisions

These questions must be answered before implementation proceeds:

1. **Routing mode: Merge vs Shadow vs Independent?** Should a child bundle's concept extend the parent (CUE-style merge) or replace it (shadow)? Recommended: merge for glossary terms, shadow for lifecycle fields, independent as opt-out.

2. **Concept identity key:** What makes two concepts "the same"? Options: `resource` field, bundle-relative path, explicit `okf_id` extension. Recommended: `resource` field where available, fall back to bundle-relative path.

3. **Manifest file name and location:** `.okf-workspace.json` at workspace root (following VS Code convention)? JSON vs YAML? Recommended: JSON at workspace root, `okf.json` for multi-bundle projects.

4. **Trust tier gating for code-backed projects:** Should code-backed projects ignore trust tiers entirely (since PR workflow provides its own approval mechanism)? Or should tiers still gate destructive operations?

5. **Shared glossary delivery:** Git submodule, symlink, or manifest reference? Submodule = version-pinned, git-native, high operational cost. Manifest reference = explicit, portable, no filesystem coupling.

6. **`sync` mode:** Session-only (lightweight, pre-PR) or CI (heavy, all bundles)? Both, with different modes.

7. **`index.md` grouping strategy:** By `type` (spec-conformant) or by meaning via Maps of Content (Zettelkasten pattern)? Recommend: support both — type grouping as default, `type: Map` for hand-curated semantic groupings.

---

## 11. Recommended Approaches for Prototyping

Priority-ordered, based on dependency graph and risk:

| Priority | Prototype | Type | Rationale |
|----------|----------|------|-----------|
| **P0** | Autodiscovery for standalone repos (Pattern 2) | `wayfinder:prototype` | Lowest risk, provides the foundation. Must work reliably before anything else. |
| **P0** | Autodiscovery for monorepos (Pattern 1) | `wayfinder:prototype` | Most common complex case. Prove monorepo manager detection + child discovery + bundle routing. |
| **P1** | `.okf-workspace.json` manifest schema + parser | `wayfinder:prototype` | Unblocks connected workspaces (Patterns 3, 4) and acceptance scenarios. |
| **P1** | Connected workspace discovery (Patterns 3, 4) | `wayfinder:prototype` | Tilt acceptance scenarios depend on this. Must handle missing/dynamic repos. |
| **P2** | Three-tier lazy loading + filesystem cache | `wayfinder:prototype` | Token budget and performance are gating factors for real-world use. |
| **P2** | Knowledge routing with CUE-style subsumption | `wayfinder:prototype` | The semantic core of multi-bundle operation. Depends on concept identity key decision. |
| **P3** | Lifecycle scope enforcement per topology | `wayfinder:prototype` | Depends on routing and trust tier decisions. Can be incremental. |
| **P3** | Cross-bundle reference extension (`bundle://` URIs) | `wayfinder:prototype` | Greenfield; OKF v0.2 has no multi-bundle operations. Needs careful design. |

---

## 12. Source Index

### Primary Web Sources (fetched July 2026)
- Claude Code docs: memory, settings, hooks, skills, sub-agents, MCP, large-codebases, worktrees — [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code/)
- OpenAI Codex docs: config, AGENTS.md, subagents, skills, hooks, environments, CLI, IDE, SDK, MCP — [learn.chatgpt.com/codex](https://learn.chatgpt.com/codex)
- OpenCode docs: config, rules, agents, skills, plugins, references, permissions — [opencode.ai](https://opencode.ai/docs/)
- Anthropic models: context windows, context engineering — [docs.anthropic.com](https://docs.anthropic.com/en/docs/about-claude/models)
- OpenAI models: GPT-5.6 capacities — [platform.openai.com](https://platform.openai.com/docs/models)
- VS Code: multi-root workspaces, `.code-workspace` schema, settings layering — [code.visualstudio.com](https://code.visualstudio.com/docs/editor/multi-root-workspaces)
- Turborepo: `turbo.json` config, extends chains, boundaries, `$TURBO_EXTENDS$` — [turbo.build](https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository)
- pnpm: `pnpm-workspace.yaml`, packages globs, catalogs, workspace protocol — [pnpm.io](https://pnpm.io/workspaces)
- Nx: `nx.json`, named inputs, target defaults, multi-source merging — [nx.dev](https://nx.dev/reference/nx-json)
- Lerna: `lerna.json`, configuration, versioning modes — [lerna.js.org](https://lerna.js.org/docs/api-reference/configuration)
- CUE: value lattice, subsumption, unification, conflict as bottom (⊥) — [cuelang.org](https://cuelang.org/docs/concept/the-logic-of-cue/)
- Nixpkgs: overlays, `self: super:`, compose left-to-right — [nixos.org](https://nixos.org/manual/nixpkgs/stable/#chap-overlays)
- git-worktree: manpage — [git-scm.com](https://git-scm.com/docs/git-worktree)
- git-submodule: manpage — [git-scm.com](https://git-scm.com/docs/git-submodule)
- Tilt: getting started, dynamic repos — [docs.tilt.dev](https://docs.tilt.dev/)

### Local Research Sources (this repo)
- `docs/research/okf-spec-and-ecosystem.md` — OKF v0.1/v0.2 specs, limitations, ecosystem catalog
- `docs/research/02-okf-v02-spec.md` — OKF v0.2 full spec investigation
- `docs/research/lightweight-durable-context.md` — lifecycle dimensions, Pocock principles, thresholds
- `docs/research/lifecycle-dimensions.md` — trust tier matrix, compaction, archival, glossary
- `docs/research/cross-harness-skill-architecture.md` — skill architecture, delivery model, topology
- `docs/research/obsidian-transferable-patterns.md` — Zettelkasten MOCs, structural thresholds
- `docs/research/durable-context-platforms.md` — platform comparison, Claude MCP integration
- `docs/research/ecosystem-deep/opencode-symlink-resolution.md` — OpenCode symlink behavior
- `docs/research/ecosystem-deep/opencode-disable-model-invocation.md` — OpenCode permission model
- `docs/research/ecosystem-deep/codex-hooks-skill-scoping.md` — Codex hook-skill integration
- `docs/research/ecosystem-deep/skills.md` — rakibtg/okf-skill patterns, exclusion conventions
- `docs/research/ecosystem-deep/specialized.md` — okforge tool patterns, directory exclusion
- `docs/research/ecosystem-deep/consumers.md` — Kiso consumer, ignorePatterns
- `docs/research/ecosystem-deep/validators.md` — okflint, conformance rules
- `docs/research/ecosystem-deep/skills-cli.md` — skills CLI, private repo telemetry exclusion
