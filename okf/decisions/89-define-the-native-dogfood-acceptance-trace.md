---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/89
status: draft
type: Decision
---
# Define the native dogfood acceptance trace

Status: Closed

## Question

Which exact orientation, read, review, bounded-write, lifecycle, refusal, and validation observations must one clean Claude Code run record before `v0.1.0` publication?

## Comment by artemVeduta

## Resolution

Use one connected, strict native acceptance trace.

### Run boundary

- Complete setup before the measured run. Use the exact protected `main` commit from [Merge the v0.1.0 release candidate to main](https://github.com/artemVeduta/okf-agent-skills/issues/95), after [Verify exact-main installation in a clean clone](https://github.com/artemVeduta/okf-agent-skills/issues/104).
- Record the commit, Claude Code version, model, install commands, and a clean starting `git status` and diff.
- Start one fresh Claude Code session at the repository root. Use one writer, no fork, no subagent, and no in-session retry.
- Send every user operation through the installed `okf` router and record the owning leaf skill that it selects.

### Prepared concept

[Add the initial repository OKF bundle](https://github.com/artemVeduta/okf-agent-skills/issues/99) prepares `okf/releases/v0.1.0.md` as a `Note` with:

- body heading `OKF Agent Skills v0.1.0 release`;
- initial frontmatter title `v0.1.0 release candidate`;
- no `verified`, `stale_after`, or review dependency;
- the same human-authored concept available as evidence for its metadata correction.

The bounded write changes only the frontmatter title to `OKF Agent Skills v0.1.0 release`.

### Required evidence

For each prompted operation, record the exact prompt, selected leaf skill, wrapper request, wrapper response, wrapper exit code, visible Claude result, and before-and-after file effects. The orientation step is the only exception: the native hook hides the child wrapper JSON, so record plugin loading, the one visible orientation line, and the absence of repository effects. Deterministic wrapper tests retain the raw orientation request, response, and exit proof.

Store the accepted record as a dated Markdown report under `docs/research/`. Include the environment, start and end Git state, final diff, and a pass or fail result for each step. Do not commit a raw Claude transcript, secrets, or machine-specific absolute paths.

### Fixed trace

1. **Startup orientation**
   - Prompt: none; observe the native `SessionStart` startup event.
   - Expect one clean orientation line naming the local bundle and `index.md`, no second orientation for the occurrence, and no repository change.

2. **Read**
   - Prompt: `Use the OKF read operation. Start at the bundle-root index, then the releases directory index, then read concept releases/v0.1.0. Report its title, type, and observed path. Do not change anything.`
   - Route: `okf` to `okf-read`, operation `read`, target `releases/v0.1.0`.
   - Expect exit `0`, result `ok`, match `found`, complete coverage, the initial title and type `Note`, observed bundle-relative paths, no findings, and no file change.

3. **Review**
   - Prompt: `Use the OKF review operation. Review okf/releases/v0.1.0.md. Report its trust tier, staleness, and review-dependency state. Do not verify, approve, or edit anything.`
   - Route: `okf` to `okf-review`, operation `review`.
   - Expect exit `0`, result `no-op`, trust tier `unverified`, staleness `not configured`, review dependencies `not configured`, no findings, and no file change.

4. **Bounded write and post-write validation**
   - Prompt: `Use the OKF write operation with task kind fix. Revise only okf/releases/v0.1.0.md. Change its frontmatter title from v0.1.0 release candidate to OKF Agent Skills v0.1.0 release so it matches the human-authored body heading. Use releases/v0.1.0.md as the observed evidence. Do not write files directly and make no other change.`
   - Route: `okf` to `okf-write`, operation `revise`, task kind `fix`, explicit invocation, scope containing only `releases/v0.1.0.md`, set containing only the final title, and evidence containing only `releases/v0.1.0.md`.
   - Expect exit `0`, result `applied`, authorization `notice`, actual effect `concept-revise`, validation `valid`, no findings or residue, and a diff that changes only the title in `okf/releases/v0.1.0.md`.

5. **Lifecycle no-op**
   - Prompt: `Use the OKF lifecycle operation with task kind fix. Run narrow incremental synchronization for okf/releases/v0.1.0.md with invocation explicit. Submit the same title and evidence from the accepted write. Do not widen scope or run full synchronization.`
   - Route: `okf` to `okf-lifecycle`, operation `sync`, task kind `fix`, invocation `explicit`, the same one-concept scope, title set, and evidence.
   - Expect exit `0`, result `no-op`, validation `not-needed`, no actual effects, no findings, and no new file change.

6. **Unsupported-operation refusal**
   - Prompt: `Use the OKF lifecycle route to request init for this already prepared repository. Record the refusal. Do not create files or run setup.`
   - Route: `okf`, operation `init`.
   - Expect exit `0`, result `blocked`, data code `UNKNOWN_OPERATION`, validation `not-run`, no actual effects, no findings, and no file change. This is a valid domain refusal, not a process failure.

7. **Whole-bundle validation**
   - Prompt: `Use the OKF validation operation to validate the whole local bundle after the write. Report the conformance line and all findings. Do not repair files.`
   - Route: `okf` to `okf-read`, operation `validate`.
   - Expect exit `0`, result `ok`, `OKF v0.2 bundle-conformant: yes`, no blocking or non-blocking findings, and no file change.

### Acceptance and publication

Accept the trace only when every expected result, finding set, exit code, and file effect matches. The final measured diff must contain only the title change. Stop at the first difference, preserve the state, and open one precise defect ticket. Do not accept a warning or retry inside the same session.

Publish the concept change and dated run report through [Publish dogfood changes through a protected pull request](https://github.com/artemVeduta/okf-agent-skills/issues/101) before the final release gate.
