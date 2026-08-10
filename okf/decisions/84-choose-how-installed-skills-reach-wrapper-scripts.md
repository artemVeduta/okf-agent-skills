---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/84
status: draft
type: Decision
---
# Choose how installed skills reach wrapper scripts

Status: closed.

## Question

What shipped layout and installation behavior will make every installed skill wrapper path executable while preserving zero dependencies, one contract seam, and explicit installation targets?

## Comment by artemVeduta

## Resolution

Every installed skill and native adapter receives a self-contained copy of the repository’s canonical `scripts/` tree. The repository keeps one runtime source; installation copies it to each supported execution location.

### Skill installation

- Each source skill contains a `scripts` directory symlink to the repository-level `scripts/` tree.
- The supported `skills` installer behavior dereferences that symlink and copies the complete tree into the installed skill. The release relies on this behavior only for the tested project and global layouts.
- Each `SKILL.md` invokes `node <skill-root>/scripts/<skill-name>.js`, where `<skill-root>` is the directory that contains the loaded `SKILL.md`. It never resolves the wrapper from the user project’s current directory or from `PATH`.
- Each installed skill is independently executable. A filtered or partial installation does not need a sibling skill as a runtime carrier.

### Native adapter installation

- The adapter command remains `node scripts/okf-adapter.js install <harness> <target-directory>`. No second target or inferred path is added.
- The adapter manifest copies the complete canonical `scripts/` tree under `<target-directory>/okf-agent-skills/scripts/`, together with the harness-specific files. All writes remain inside the explicit target and all files remain receipt-owned.
- The installed adapter hook executes its target-local `okf-read` wrapper as a child process and reads its stdout. It does not call the shared runtime in-process. Automatic adapter behavior remains read-only orientation only.
- The tag checkout is not a runtime dependency after adapter installation.

### Failure and verification

- A missing, partial, or suite-version-mismatched copy fails closed under the existing compatibility rule.
- Deterministic fixtures must use the actual shipped skill tree and prove project and global installation paths, wrapper execution, adapter target containment, process-boundary output, version mismatch, disablement, and uninstall ownership.
- Copying the full tree grants no new authority. Invocation rules and runtime gates still decide which wrapper operations can run.

This preserves zero external dependencies, one wrapper-process contract seam, one canonical runtime source, and explicit installation targets.
