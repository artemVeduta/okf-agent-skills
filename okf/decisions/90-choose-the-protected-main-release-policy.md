---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/90
status: draft
type: Decision
---
# Choose the protected-main release policy

Status: Closed

## Question

Which branch protection rules and required CI check must govern `main` before dogfood changes and the permanent `v0.1.0` tag are published?

## Comment by artemVeduta

## Resolution

Before dogfood changes enter `main` or the permanent `v0.1.0` tag is created, apply one classic branch-protection rule to the exact `main` branch:

- Require changes through a pull request.
- Require zero approving reviews because this is a single-maintainer repository.
- Require all review conversations to be resolved.
- Require the `test` check, bound to the GitHub Actions app.
- Require the pull-request branch to be current with `main` before merge.
- Enforce the rule for administrators, with no normal bypass.
- Reject force pushes and branch deletion.
- Do not require code-owner review, stale-approval dismissal, approval of the last push, linear history, or signed commits.

The required `test` check is the existing deterministic job that runs `node --test "test/*.test.js"` on Node 22. An administrator can repair or replace a broken protection rule, but cannot bypass it during normal dogfood or release work.
