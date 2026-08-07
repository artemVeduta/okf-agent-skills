// Runs the Flue eval slice against the working tree and prints one JSON
// result record per line (see lib/report.js for the shape), followed by one
// summary line. Non-gating: nothing here is called from
// `node --test "test/*.test.js"` or from CI.
import { randomUUID } from 'node:crypto';

import { init } from '@flue/runtime';
import { start } from '@flue/runtime/node';

import { OkfEvalAgent } from './agent.js';
import { createFixture, repoRoot } from './lib/fixture.js';
import { BlockedCase, runCase } from './lib/report.js';

import { CASES as ACTIVATION_CASES, activationCaseModule } from './cases/activation.eval.js';
import { CASE as wrapperContract } from './cases/wrapper-contract.eval.js';
import { CASE as taskKindTopLevel } from './cases/wrapper-request-field-placement.eval.js';

const CASES = [...ACTIVATION_CASES.map(activationCaseModule), wrapperContract, taskKindTopLevel];

// A run that cannot get a model throws an OperationFailedError. Two
// conditions are credential gaps, not defects of the OKF skills. The runtime
// reports an absent credential as "Provider is not configured". It reports a
// rejected credential as a 401 from the provider. Both were observed
// directly against this pinned @flue/runtime version — see
// docs/flue-eval-results.md. Anything else — a skill, sandbox, or fixture
// problem — is a real failure of this eval slice and must not be reported as
// a credential gap, so the match stays narrow to these two conditions.
const CREDENTIAL_FAILURE = /provider is not configured|\b401\b|invalid api key/i;

// The provider can also drop a stream or rate-limit the run. That is outside
// the case's own logic, so it reports `blocked`, not `fail`. A `fail` must
// mean the OKF skills did something wrong. The runtime reports a dropped
// stream as "Stream ended without finish_reason"; recorded runs are in
// docs/flue-eval-results.md.
const PROVIDER_TRANSPORT_FAILURE =
  /stream ended without finish_reason|overloaded|rate limit|too many requests|internal server error|bad gateway|service unavailable|gateway timeout/i;

// The runtime puts the provider's own words in `meta.reason`. It leaves
// `cause` undefined for both conditions above.
function failureReason(error) {
  if (!error) return '';
  const parts = [error.message, error.meta && error.meta.reason, error.cause && error.cause.message];
  return parts.filter((part) => typeof part === 'string').join(' | ');
}

// The pinned @flue/runtime's local() sandbox exposes exactly one shell tool
// to the model: the pinned runtime's createBashTool names the tool "bash",
// with a "command" parameter — so chunk.input.command below is the model's
// literal shell command text. There is no second shell-ish tool name to
// account for.
async function dispatchAndCollect({ fixtureRoot, prompt }) {
  const activated = [];
  const shellCommands = [];
  const handle = init(OkfEvalAgent, { id: `eval-${randomUUID()}` });
  try {
    const receipt = await handle.dispatch({ message: prompt, initialData: { cwd: fixtureRoot } });
    await handle.read(receipt, {
      onEvent: (chunk) => {
        if (chunk.type !== 'tool-input' || !chunk.input) return;
        if (chunk.toolName === 'activate_skill') {
          if (typeof chunk.input.name === 'string') activated.push(chunk.input.name);
        } else if (chunk.toolName === 'bash') {
          if (typeof chunk.input.command === 'string') shellCommands.push(chunk.input.command);
        }
      },
    });
  } catch (error) {
    const reason = failureReason(error);
    if (CREDENTIAL_FAILURE.test(reason)) {
      throw new BlockedCase(`no usable model provider credential: ${reason}`);
    }
    if (PROVIDER_TRANSPORT_FAILURE.test(reason)) {
      throw new BlockedCase(`the model provider did not complete the run: ${reason}`);
    }
    // The runtime's own message says only that the run failed. The provider's
    // words are in `meta.reason`. Report both, or the record says nothing.
    throw new Error(reason || String(error), { cause: error });
  }
  return { activated, shellCommands };
}

async function main() {
  const flue = await start({ agents: [OkfEvalAgent] });
  const records = [];

  try {
    // One optional argument selects cases whose id contains it. Use it to
    // repeat one case, because a model run is not deterministic.
    const only = process.argv[2];
    for (const caseModule of CASES.filter((c) => !only || c.id.includes(only))) {
      const fixture = createFixture();
      try {
        const record = await runCase(caseModule, () =>
          caseModule.run({
            fixtureRoot: fixture.root,
            repoRoot,
            dispatchAndCollect: (prompt) => dispatchAndCollect({ fixtureRoot: fixture.root, prompt }),
          }),
        );
        records.push(record);
        process.stdout.write(`${JSON.stringify(record)}\n`);
      } finally {
        fixture.cleanup();
      }
    }
  } finally {
    await flue.stop();
  }

  const summary = {
    total: records.length,
    pass: records.filter((r) => r.status === 'pass').length,
    fail: records.filter((r) => r.status === 'fail').length,
    blocked: records.filter((r) => r.status === 'blocked').length,
  };
  process.stdout.write(`${JSON.stringify({ summary })}\n`);

  process.exitCode = summary.fail > 0 ? 1 : 0;
}

await main();
