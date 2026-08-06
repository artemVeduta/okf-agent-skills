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
import * as wrapperContract from './cases/wrapper-contract.eval.js';

const CASES = [...ACTIVATION_CASES.map(activationCaseModule), wrapperContract];

// A run that fails for lack of a model provider credential throws an
// OperationFailedError whose own message names the missing provider
// (observed directly against this pinned @flue/runtime version — see
// docs/flue-eval-results.md). Anything else — a skill, sandbox, or fixture
// problem — is a real failure of this eval slice, not a credential gap, and
// must not be reported as one, so the match stays narrow to this one
// documented message rather than any string that merely mentions a
// credential.
const CREDENTIAL_FAILURE = /provider is not configured/i;

async function dispatchAndCollect({ fixtureRoot, prompt }) {
  const activated = [];
  const handle = init(OkfEvalAgent, { id: `eval-${randomUUID()}` });
  try {
    const receipt = await handle.dispatch({ message: prompt, initialData: { cwd: fixtureRoot } });
    await handle.read(receipt, {
      onEvent: (chunk) => {
        if (chunk.type === 'tool-input' && chunk.toolName === 'activate_skill' && chunk.input) {
          if (typeof chunk.input.name === 'string') activated.push(chunk.input.name);
        }
      },
    });
  } catch (error) {
    const reason = error && error.cause && typeof error.cause.message === 'string' ? error.cause.message : error.message;
    if (CREDENTIAL_FAILURE.test(reason)) {
      throw new BlockedCase(`no usable model provider credential: ${reason}`);
    }
    throw error;
  }
  return { activated };
}

async function main() {
  const flue = await start({ agents: [OkfEvalAgent] });
  const records = [];

  try {
    for (const caseModule of CASES) {
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
