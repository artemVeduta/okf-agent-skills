// This case reaches a real wrapper process — the product contract the
// research doc calls out — directly, the same way Flue's local() sandbox
// would run it through the model's bash tool: `node <skill-root>/scripts/
// okf-write.js` with the documented stdin JSON. It needs no live model, so
// it runs and is scored today, unlike the activation cases above.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { classifyWrapperExit } from '../lib/wrapper-contract.js';

async function run({ fixtureRoot, repoRoot }) {
  const wrapper = path.join(repoRoot, 'scripts', 'okf-write.js');
  const request = {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'revise',
    task_kind: 'fix',
    scope: { concepts: ['note.md'] },
    payload: {
      cwd: fixtureRoot,
      bundle: fixtureRoot,
      concept: 'note.md',
      set: { title: 'Renamed by the wrapper-contract eval case' },
      evidence: ['evidence.md'],
    },
  };

  const result = spawnSync(process.execPath, [wrapper], { input: JSON.stringify(request), encoding: 'utf8' });
  const outcome = classifyWrapperExit(result);

  if (outcome.exitClass !== 'valid-response') {
    throw new Error(`expected exit class valid-response, got ${outcome.exitClass} (exit ${result.status})`);
  }
  if (outcome.response.result !== 'applied') {
    throw new Error(`expected the fixture bundle write to be applied, got: ${outcome.response.result}`);
  }
}

export const CASE = {
  id: 'okf-write-wrapper-contract',
  kind: 'wrapper-contract',
  description:
    "okf-write's wrapper emits exactly one JSON line and exit 0 for a valid revise request against a fresh fixture bundle.",
  run,
};
