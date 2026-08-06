# CI gate proof — issue #107

Date: 2026-08-06.

## Purpose

This document is evidence. It proves the CI job `test` fails on a broken
test assertion. It also proves the same job passes when the assertion is
restored. It proves no release behavior changed.

Branch protection is not configured in this repository. No status check is
enforced on merge. This proof shows the job result, not merge enforcement.

## Scope of the proof

- Workflow: `.github/workflows/ci.yml`, workflow name `CI`.
- Job: `test`.
- Gate command: `node --test "test/*.test.js"`.
- Branch: `ci-proof/issue-107`.
- Branch point: commit `34be353cc6460e15a5fe0b6c271a3479486353d4` on
  `feat/issue-41-spec-v0.1.0`.

## The one-line break

File: `test/issue-105.test.js`, line 60.

Before:

    assert.equal(fs.existsSync(path.join(targetDir, 'opencode.json')), false);

After (the break):

    assert.equal(fs.existsSync(path.join(targetDir, 'opencode.json')), true);

This assertion checks that the OpenCode adapter install step does not create
an `opencode.json` file. The break inverts the expected boolean. It does not
touch product code. It does not touch `skills/`, `scripts/`, `adapters/`, or
`agents/`.

## Local red run

Command: `node --test "test/*.test.js"`.

Result: 259 pass, 1 fail.

Failing test:

    test at test/issue-105.test.js:52:1
    ✖ installing the OpenCode adapter creates no opencode.json, opencode.jsonc, or config.json inside the target, and places the plugin under plugins/

Failure detail:

    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    false !== true
        at TestContext.<anonymous> (test/issue-105.test.js:60:10)

## Red commit and CI run

- Commit SHA: `a3fc3ea5fa447e89b59b6e2106773cbaecff8ab5`.
- Commit message: `test: break issue-105 opencode.json assertion (CI red proof, issue #107)`.
- Run ID: `31081599682`.
- Run URL: https://github.com/artemVeduta/okf-agent-skills/actions/runs/31081599682
- Job name: `test`.
- Job URL: https://github.com/artemVeduta/okf-agent-skills/actions/runs/31081599682/job/92551439693
- Conclusion: `failure`.
- CI test summary: `# tests 260`, `# pass 259`, `# fail 1`.
- CI failing test: `not ok 2 - installing the OpenCode adapter creates no opencode.json, opencode.jsonc, or config.json inside the target, and places the plugin under plugins/`.
- CI failure location: `test/issue-105.test.js:60:10`.
- CI assertion output:

      Expected values to be strictly equal:
      false !== true
      code: 'ERR_ASSERTION'
      expected: true
      actual: false
      operator: 'strictEqual'

The CI failure is the one assertion this proof breaks. No other test failed
in this run.

## Restore commit

The restore reverts the one line in a new commit. It does not amend the red
commit. The red commit stays in the branch history.

File: `test/issue-105.test.js`, line 60, restored to:

    assert.equal(fs.existsSync(path.join(targetDir, 'opencode.json')), false);

Local run after restore: `node --test "test/*.test.js"`, result: 260 pass,
0 fail.

- Commit SHA: `a578feeddd6f7cc0cf12457a63d0b66c5135b2bc`.
- Commit message: `test: restore issue-105 opencode.json assertion (CI green proof, issue #107)`.

## Green CI run

- Run ID: `31081674869`.
- Run URL: https://github.com/artemVeduta/okf-agent-skills/actions/runs/31081674869
- Job name: `test`.
- Job URL: https://github.com/artemVeduta/okf-agent-skills/actions/runs/31081674869/job/92551683741
- Conclusion: `success`.

The same job, `test`, returns green on the restore commit.

The workflow sets `concurrency` with `cancel-in-progress: true`. A fast second
push can cancel a pending run. This did not occur here. Both runs completed.
Neither run was cancelled.

## Proof of no release-behavior change

Each command below is pinned to a commit SHA. Each one is reproducible.

Command:

    git diff --stat 34be353..a578fee

Output: empty. The red commit and the restore commit cancel exactly. The
tree at the restore commit is identical to the branch point.

Command:

    git diff 34be353..origin/ci-proof/issue-107 -- . ':!docs/'

Output: empty. No file outside `docs/` changed at any point on this branch.

Command:

    git diff --stat 34be353..origin/ci-proof/issue-107

Output:

     docs/ci-gate-proof.md | 140 ++++++++++++++++++++++++++++++++++++++++++++++++++
     1 file changed, 140 insertions(+)

The `ci-proof/issue-107` branch carries the original 140-line copy of this
file. The copy on the release branch was extended after that, so the diffstat
is evidence about that branch, not about this file as it now stands.

This proves the branch adds no release-behavior change. The branch tip adds
this evidence file only.

## Conclusion

The `test` job in the `CI` workflow:

- Fails when one test assertion is broken.
- Reports the exact broken assertion as the failure.
- Passes again when the assertion is restored.
- Runs all 260 tests in the suite.

The `ci-proof/issue-107` branch and its two commits stay in the repository
as evidence.
