// Deterministic check for extractWrapperRequests, no Flue, no model. Covers
// the shell shapes a model's bash tool input can actually take: single
// quotes, double quotes with backslash-escaped inner quotes, and a heredoc
// body with no escaping.
import test from 'node:test';
import assert from 'node:assert/strict';

import { extractWrapperRequests } from './wrapper-request.js';

test('extractWrapperRequests reads a single-quoted echo', () => {
  const command = `echo '{"protocol":"okf-wrapper/1","task_kind":"fix","payload":{}}' | node wrapper.js`;
  const requests = extractWrapperRequests(command);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].task_kind, 'fix');
});

test('extractWrapperRequests reads a double-quoted echo with backslash-escaped inner quotes', () => {
  const command = `echo "{\\"protocol\\":\\"okf-wrapper/1\\",\\"task_kind\\":\\"fix\\",\\"payload\\":{}}" | node wrapper.js`;
  const requests = extractWrapperRequests(command);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].task_kind, 'fix');
});

test('extractWrapperRequests reads a heredoc body with no escaping', () => {
  const command = [
    'node wrapper.js <<\'EOF\'',
    '{"protocol":"okf-wrapper/1","task_kind":"fix","payload":{}}',
    'EOF',
  ].join('\n');
  const requests = extractWrapperRequests(command);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].task_kind, 'fix');
});

test('extractWrapperRequests ignores JSON objects with a different or missing protocol', () => {
  const command = `echo '{"protocol":"other/1","task_kind":"fix"}' | node x.js; echo '{"task_kind":"fix"}' | node y.js`;
  assert.deepEqual(extractWrapperRequests(command), []);
});

test('extractWrapperRequests preserves the order requests appear in the command', () => {
  const command = [
    `echo '{"protocol":"okf-wrapper/1","task_kind":"first","payload":{}}' | node wrapper.js`,
    `echo '{"protocol":"okf-wrapper/1","task_kind":"second","payload":{}}' | node wrapper.js`,
  ].join(' && ');
  const requests = extractWrapperRequests(command);
  assert.deepEqual(
    requests.map((r) => r.task_kind),
    ['first', 'second'],
  );
});

test('extractWrapperRequests finds task_kind nested in payload too, unfiltered', () => {
  const command = `echo '{"protocol":"okf-wrapper/1","payload":{"task_kind":"fix"}}' | node wrapper.js`;
  const requests = extractWrapperRequests(command);
  assert.equal(requests.length, 1);
  assert.equal('task_kind' in requests[0], false);
  assert.equal(requests[0].payload.task_kind, 'fix');
});
