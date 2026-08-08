// The one shape every wrapper response takes, shared by the routing/read/write half of
// `runtime.js` and by `setup.js`. It holds only response construction: no admission, no
// gate, and no operation of its own.

const primaryEffects = new Map([
  ['create', 'concept-create'], ['revise', 'concept-revise'], ['format', 'format'],
  ['relationship', 'relationship'], ['machine-verify', 'machine-verify'], ['init', 'init'],
]);
const derivedEffects = new Set(['index-maintenance', 'log-append']);
const writeLimits = { writes: 'not serialized', crash_recovery: 'not provided' };

function respond(request, result, data, findings, options = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: request.skill,
    operation: request.operation,
    result,
    scope: options.scope === undefined ? request.scope || null : options.scope,
    evidence_limits: options.evidence_limits === undefined ? null : options.evidence_limits,
    data,
    findings,
    next_action: options.next_action === undefined ? null : options.next_action,
  };
}

function suiteFinding(code, detail) {
  return { code, origin: 'suite', severity: 'error', blocks: true, detail };
}

// Node system errors put absolute paths and temp names in `.message`. Prefer the
// stable `.code` token; keep a path-free synthetic message; otherwise a fixed fallback.
function writeFailureReason(error, fallback = 'write failed') {
  if (error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.code)) return error.code;
  if (error && typeof error.message === 'string' && error.message !== ''
    && !/[\\/]/.test(error.message) && !/\.tmp/.test(error.message)) {
    return error.message;
  }
  return fallback;
}

// A write result determines its own authorization and validation state, so callers
// name the result only and cannot desynchronise the trio.
const authorizationByResult = new Map([
  ['blocked', 'blocked'], ['abstained', 'allowed'], ['applied', 'notice'],
  ['no-op', 'notice'], ['failed/incomplete', 'notice'],
]);
const validationByResult = new Map([
  ['blocked', 'not-run'], ['abstained', 'not-run'], ['applied', 'valid'],
  ['no-op', 'not-needed'], ['failed/incomplete', 'failed'],
]);

function effectRecords(effects, authorization) {
  return effects.map((effect, index) => ({ effect, authorization, inherited: index > 0 }));
}

function writeResponse(request, options) {
  const {
    result, effects = [], evidence = [], findings = [], code,
    scope = request.scope || null, completed: completedEffects = [], residue = [],
  } = options;
  const completed = new Set(completedEffects);
  const data = {
    authorization: authorizationByResult.get(result),
    effects,
    task_kind: request.task_kind === undefined ? null : request.task_kind,
    actual_effects: effectRecords(effects.filter(({ effect }) => completed.has(effect)).map(({ effect }) => effect), 'notice'),
    residue,
    evidence,
    validation: validationByResult.get(result),
  };
  if (code !== undefined) data.code = code;
  const nextAction = result === 'applied' || result === 'no-op' ? null : 'Correct the reported gate and submit one bounded request.';
  return respond(request, result, data, findings, { scope, evidence_limits: writeLimits, next_action: nextAction });
}

function targetOutsideWorktreeBlocked(request, effects) {
  return writeResponse(request, {
    result: 'blocked',
    effects: effectRecords(effects, 'blocked'),
    findings: [{
      code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'write routing', reason: 'outside_active_worktree' },
    }],
    code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
  });
}

module.exports = {
  respond, suiteFinding, writeFailureReason, effectRecords, writeResponse, targetOutsideWorktreeBlocked,
  primaryEffects, derivedEffects, writeLimits,
};
