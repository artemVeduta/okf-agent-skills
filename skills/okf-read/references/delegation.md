# Delegated read work

When another skill delegates read work rather than running `okf-read` directly, the call goes
through the `okf-delegate` entry point instead of the direct Procedure in `SKILL.md`.

`okf-delegate` validates the brief before dispatching anything: role, task kind, operation class,
working directory, bundle, paths, allowed and forbidden effects, evidence, required checks,
settings, and expected result.

It then returns one receipt carrying a status, the requested and actual effects, evidence,
validation, residue, disclosures, findings, and next action.

A skill MUST NOT tell an agent to allowlist the `okf-read` wrapper directly for delegated work,
because that path skips brief validation and returns a bare wrapper response where a receipt is
required.
