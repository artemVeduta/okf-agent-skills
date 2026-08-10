---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/5
status: draft
type: Decision
---
# Choose the skill bundle, runtime, and distribution architecture

Status: closed.

## Question

Given the OKF ecosystem and cross-harness research, should the product be one skill, a coordinated suite of skills, a shared CLI/runtime with thin skills, or another composition—and what exact repository, installation, hook, dependency, and release boundaries best satisfy SOLID, DRY, KISS, YAGNI, separation of concerns, and identical harness behavior?

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) now requires one stateless shared retrieval runtime behind thin skill and harness adapters. This ticket still owns whether that implementation ships as a CLI, script, library, or another package shape.

## Comment by artemVeduta

## Resolution

Six architecture decisions, validated with the human:

### 1. Skill composition
Four-skill split behind an `okf` router: `okf-read` (safe inspection) / `okf-write` (bundle mutations) / `okf-lifecycle` (init, sync, migrate, compact — manual-gated) / `okf-review` (trust tiers, baselines, guard confirmation).

The shared retrieval runtime and guard-state machine are `scripts/lib/` modules, not skills. The router `SKILL.md` dispatches to sub-skills.

### 2. Repository topology
Single monorepo (`artemVeduta/okf-agent-skills`). One `npx skills add` covers all four skills, the router, and `scripts/`.

### 3. Runtime delivery shape
Library-only. Pure function modules in `scripts/lib/`. Thin wrapper scripts per skill (`scripts/okf-read.js` etc.) import the library. Harness adapters exec the wrapper scripts and read stdout. No CLI binary, no npm package.

### 4. Installation boundaries
- **Base install:** `npx skills add 'artemVeduta/okf-agent-skills#v0.1.0'` installs skills + router + scripts. All harness integration (hooks, permissions, subagents, guard dir) is manual, documented in README.
- **Harness plugins:** Three plugins — Claude Code, Codex, OpenCode — installed globally. Per-project opt-in via `.okf-active` marker. Each plugin auto-configures session-start injection, subagent definitions, permissions, and guard directory bootstrap. Local config overrides supported.

### 5. Dependencies
Zero dependencies beyond Node.js stdlib. No `package.json` required.

### 6. Release boundaries
Single Git tag (`v0.1.0`). CI gate: `node --test` with deterministic fixture-based contract tests. No changelog automation, no sub-artifacts. Live cross-harness process tests deferred to `v0.2.0` per map scope.

### Rejected alternatives
- Six-skill split (adds `okf-guard`, `okf-retrieve`): guard and retrieval are code modules, not skills → YAGNI
- Separate repos per skill: no consumer installs one without the others → KISS
- CLI binary delivery: a pure function with no I/O doesn't earn a CLI → KISS
- Per-project plugin bootstrap: boilerplate the user may never touch → YAGNI
- `yaml` dependency: stdlib covers parsing needs for the retrieval runtime → KISS
