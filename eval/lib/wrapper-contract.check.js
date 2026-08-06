// The wrapper-process contract classifier's pure branches. The gated suite
// under `test/` owns the real wrapper spawn (AGENTS.md, one contract seam).
// This file checks only `classifyWrapperExit` against literal fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyWrapperExit } from './wrapper-contract.js';

test('classifyWrapperExit reports valid-response for exit 0 with one JSON line on stdout', () => {
  const outcome = classifyWrapperExit({ status: 0, stdout: `${JSON.stringify({ result: 'applied' })}\n`, stderr: '' });
  assert.equal(outcome.exitClass, 'valid-response');
  assert.equal(outcome.response.result, 'applied');
});

test('classifyWrapperExit reports invalid-input for exit 64 with nothing on stdout', () => {
  const outcome = classifyWrapperExit({ status: 64, stdout: '', stderr: 'diagnostic\n' });
  assert.equal(outcome.exitClass, 'invalid-input');
  assert.equal(outcome.diagnostic, 'diagnostic');
});

test('classifyWrapperExit throws for exit 64 with something on stdout', () => {
  assert.throws(() => classifyWrapperExit({ status: 64, stdout: 'unexpected', stderr: '' }));
});

test('classifyWrapperExit reports internal-failure for the documented exit-70 shape', () => {
  const literal = {
    status: 70,
    stdout: `${JSON.stringify({ result: 'failed/incomplete', data: { code: 'RUNTIME_FAILURE' } })}\n`,
    stderr: 'Runtime failure: boom\n',
  };
  const outcome = classifyWrapperExit(literal);
  assert.equal(outcome.exitClass, 'internal-failure');
  assert.equal(outcome.response.data.code, 'RUNTIME_FAILURE');
});

test('classifyWrapperExit throws on an exit code outside the three documented conditions', () => {
  assert.throws(() => classifyWrapperExit({ status: 1, stdout: '', stderr: '' }));
});
