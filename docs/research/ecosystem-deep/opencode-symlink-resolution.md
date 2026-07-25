# OpenCode Symlink Resolution for Skill Directories

> **Answer: YES** — OpenCode follows symlinks when scanning skill directories.
> The `npx skills` delivery model (symlink `.claude/skills/` → `.agents/skills/`) is safe.

---

## 1. Primary Source Code Evidence

### 1.1 The `scan` function — `symlink: true`

`packages/opencode/src/skill/index.ts` — lines ~130–145 (the `scan` function):

```typescript
const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,          // <-- KEY: explicitly set to true
        dot: opts?.dot,
      }),
    catch: (error) => error,
  })
  // ...
})
```

Source: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/skill/index.ts

The `symlink: true` option is passed **for all skill directory scanning** — both `.opencode/skills/` patterns and `.claude/skills/` / `.agents/skills/` patterns. There is no conditional logic that would disable symlink following for compatibility paths.

### 1.2 The `Glob.toGlobOptions` function — `symlink` → `follow`

`packages/core/src/util/glob.ts` — the entire file (lines 1–49):

```typescript
import { glob, globSync, type GlobOptions } from "glob"
import { minimatch } from "minimatch"

export namespace Glob {
  export interface Options {
    cwd?: string
    absolute?: boolean
    include?: "file" | "all"
    dot?: boolean
    symlink?: boolean
  }

  function toGlobOptions(options: Options): GlobOptions {
    return {
      cwd: options.cwd,
      absolute: options.absolute,
      dot: options.dot,
      follow: options.symlink ?? false,   // <-- KEY: symlink maps to "follow"
      nodir: options.include !== "all",
    }
  }

  export async function scan(pattern: string, options: Options = {}): Promise<string[]> {
    return glob(pattern, toGlobOptions(options)) as Promise<string[]>
  }

  export function scanSync(pattern: string, options: Options = {}): string[] {
    return globSync(pattern, toGlobOptions(options)) as string[]
  }

  export function match(pattern: string, filepath: string): boolean {
    return minimatch(filepath, pattern, { dot: true })
  }
}
```

Source: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/util/glob.ts

The `symlink` option is translated to the `follow` option of the `glob` npm package. When `symlink: true` → `follow: true`, the `glob` library follows symlinked directories during traversal.

### 1.3 The `glob` npm package — `follow` documentation

From the [glob README](https://github.com/isaacs/node-glob#options):

> **`follow`** — Follow symlinked directories when expanding `**` patterns. This can result in a lot of duplicate references in the presence of cyclic links, and make performance quite bad.
>
> By default, a `**` in a pattern will follow 1 symbolic link if it is not the first item in the pattern, or none if it is the first item in the pattern, following the same behavior as Bash.

With `follow: true` (as OpenCode always passes), the glob library will follow **all** symlinked directories, not just the Bash-default of 1. This is the maximally permissive setting.

### 1.4 `isDir()` directory detection — uses `fs.stat`, not `fs.lstat`

`packages/core/src/fs-util.ts` — the `isDir` function:

```typescript
const isDir = Effect.fn("FileSystem.isDir")(function* (path: string) {
  const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void))
  return info?.type === "Directory"
})
```

Source: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/fs-util.ts

Node.js `fs.stat` (and Effect's `FileSystem.stat`) **dereferences symlinks** by default — it returns information about the target, not the symlink itself. If `.claude/skills/` is a symlink to `.agents/skills/`, `isDir(".claude/skills/")` returns `true` because the target is a directory.

This matters because `discoverSkills()` in `skill/index.ts` calls `isDir()` to check whether `.claude/` and `.agents/` directories exist before scanning:

```typescript
const root = path.join(global.home, dir)
if (!(yield* fsys.isDir(root))) continue
yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
```

Similarly, `fsys.exists()` (used in the `up` function for walk-up discovery) follows symlinks.

---

## 2. Documentation Evidence

### 2.1 OpenCode docs — NO mention of symlinks

The OpenCode skills documentation at https://opencode.ai/docs/skills/ was reviewed in full. There is **zero mention** of:
- "symlink", "symbolic link", "link"
- "follow", "dereference", "resolve"
- Any `OPENCODE_DISABLE_SYMLINKS` or equivalent environment variable

The "Understand discovery" section:
> For project-local paths, OpenCode walks up from your current working directory until it reaches the git worktree. It loads any matching `skills/*/SKILL.md` in `.opencode/` and any matching `.claude/skills/*/SKILL.md` or `.agents/skills/*/SKILL.md` along the way.

No mention of whether directory entries are symlinks or real directories. The behavior is undefined in documentation — but resolved in source code.

### 2.2 Claude Code docs — EXPLICIT symlink support

From the Claude Code skills documentation at https://docs.anthropic.com/en/docs/claude-code/skills:

> A `<skill-name>` entry in the enterprise, personal, or project locations can be a symlink to a directory elsewhere on disk. Claude Code follows the symlink and reads `SKILL.md` from the target directory, and if the same target is reachable from more than one location, Claude Code loads the skill once.

Claude Code explicitly documents symlink support. Claude Code also provides `CLAUDE_CODE_DISABLE_SYMLINKS` env var to disable it.

OpenCode has **no equivalent `DISABLE_SYMLINKS` env var** and no documentation of this behavior.

---

## 3. The `npx skills` Delivery Model — Verified Safe

The delivery model works as follows:
1. `npx skills` installs skill files to `.agents/skills/<name>/SKILL.md`
2. `npx skills` creates a symlink: `.claude/skills/<name>` → `../.agents/skills/<name>`
3. OpenCode reads `.claude/skills/` as a compatibility path

**Why this works in OpenCode:**

| Step | Mechanism | Status |
|------|-----------|--------|
| Directory detection | `isDir(".claude/skills/")` uses `fs.stat` → follows symlinks | ✅ Works |
| Directory detection | `isDir(".claude/skills/<name>/")` for each skill subdir | ✅ Works |
| Globbing | `Glob.scan("skills/**/SKILL.md", { symlink: true })` → `follow: true` | ✅ Works |
| Walk-up discovery | `fsys.up()` uses `fs.exists()` → follows symlinks | ✅ Works |
| Global scan | Same `symlink: true` for `~/.claude/skills/` and `~/.agents/skills/` | ✅ Works |

### Potential edge case: Two paths to same skill

With `npx skills`, a single skill at `.agents/skills/my-skill/SKILL.md` is reachable via two scans:
1. `.claude/skills/` → symlink → `.agents/skills/my-skill/SKILL.md`
2. `.agents/skills/` → direct → `.agents/skills/my-skill/SKILL.md`

OpenCode's `add()` function handles this by logging a warning for duplicate skill names but **both paths resolve to the same logical path** after symlink resolution, so the same SKILL.md file is parsed twice. The second parse overwrites the first in the `state.skills` map with identical content — functionally no issue.

```typescript
if (state.skills[md.data.name]) {
  yield* Effect.logWarning("duplicate skill name", {
    name: md.data.name,
    existing: state.skills[md.data.name].location,
    duplicate: match,
  })
}
```

The warning is cosmetic; the skill still loads correctly.

---

## 4. No Environment Variable to Disable Symlink Resolution

OpenCode has no equivalent of Claude Code's `CLAUDE_CODE_DISABLE_SYMLINKS`. The environment variables that control skill loading are:

| Variable | Purpose |
|----------|---------|
| `OPENCODE_DISABLE_CLAUDE_CODE` | Disables all `.claude/` loading (prompt + skills) |
| `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` | Disables only `.claude/skills/` loading |

Source: https://opencode.ai/docs/cli/#environment-variables

Neither variable distinguishes between real directories and symlinks.

---

## 5. Empirical Verification (Recommended Test)

While the source code is definitive, an empirical test provides operational confidence:

```bash
# Setup
mkdir -p .agents/skills/test-symlink
cat > .agents/skills/test-symlink/SKILL.md << 'EOF'
---
name: test-symlink
description: Verify symlink following for npx skills delivery model
---

This skill was loaded via a symlink from .claude/skills/
EOF

mkdir -p .claude/skills
ln -s ../../.agents/skills/test-symlink .claude/skills/test-symlink

# Run opencode and check: the skill should appear in <available_skills>
```

If the skill appears, symlink resolution is confirmed operative in your environment.

---

## 6. Summary

| Question | Answer | Confidence |
|----------|--------|------------|
| Does OpenCode follow symlinks when scanning skill directories? | **Yes** | Source-code confirmed |
| Is this documented? | **No** | Docs mention no symlink behavior |
| Does the `npx skills` delivery model work with OpenCode? | **Yes** | All code paths follow symlinks |
| Can symlink following be disabled? | **No** | No env var or config option exists |
| Claude Code comparison | Claude Code explicitly documents symlink support + has `DISABLE_SYMLINKS` env var | OpenCode has neither docs nor disable mechanism |

### Source Code References

| File | Line/Area | What it shows |
|------|-----------|---------------|
| `packages/opencode/src/skill/index.ts` | `scan()` function | `symlink: true` passed to `Glob.scan()` |
| `packages/core/src/util/glob.ts` | `toGlobOptions()` | `symlink` → `follow` mapping for `glob` npm |
| `packages/core/src/fs-util.ts` | `isDir()` function | Uses `fs.stat` (follows symlinks), not `fs.lstat` |
| `packages/core/src/fs-util.ts` | `up()` function | Uses `fs.exists()` (follows symlinks) for walk-up |
| https://github.com/isaacs/node-glob | README Options | `follow: true` follows symlinked directories |
| https://opencode.ai/docs/skills/ | Full page | No mention of symlinks |
| https://docs.anthropic.com/en/docs/claude-code/skills | Where skills live | Explicit symlink documentation |

### Previous Research Reference

The existing file `opencode-skills.md` at `docs/research/ecosystem-deep/opencode-skills.md` notes symlink behavior as "not documented" — this research resolves that gap with source-code-confirmed behavior.
