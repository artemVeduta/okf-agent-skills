// Red-before-green seam: the eval runner's case-result shape.
// This is a pure function. It needs no Flue runtime and no model.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runCase, BlockedCase } from './report.js';

test('runCase records a pass and a null detail when the case function does not throw', async () => {
  const record = await runCase({ id: 'x', kind: 'k', description: 'd' }, async () => {});
  assert.deepEqual(record, { id: 'x', kind: 'k', description: 'd', status: 'pass', detail: null });
});

test('runCase records a fail with the thrown message for an ordinary error', async () => {
  const record = await runCase({ id: 'x', kind: 'k', description: 'd' }, async () => {
    throw new Error('boom');
  });
  assert.equal(record.status, 'fail');
  assert.equal(record.detail, 'boom');
});

test('runCase records blocked, not fail, for a BlockedCase', async () => {
  const record = await runCase({ id: 'x', kind: 'k', description: 'd' }, async () => {
    throw new BlockedCase('no credential');
  });
  assert.equal(record.status, 'blocked');
  assert.equal(record.detail, 'no credential');
});

test('a BlockedCase is an ordinary Error, not a special control-flow value', () => {
  assert.ok(new BlockedCase('x') instanceof Error);
});
