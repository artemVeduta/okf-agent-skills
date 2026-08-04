const path = require('node:path');
const validation = require('./validation');
const admission = require('./admission');
const routing = require('./routing');

const skills = new Set(['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review']);
const navigationResults = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
const routerOwners = new Map([
  ['enumerate', 'okf-read'], ['search', 'okf-read'], ['read', 'okf-read'], ['validate', 'okf-read'],
  ['create', 'okf-write'], ['revise', 'okf-write'], ['format', 'okf-write'], ['machine-verify', 'okf-write'],
  ['relationship', 'okf-write'], ['status', 'okf-write'], ['archive', 'okf-write'], ['move', 'okf-write'],
  ['rename', 'okf-write'], ['merge', 'okf-write'], ['split', 'okf-write'], ['delete', 'okf-write'],
  ['init', 'okf-lifecycle'], ['sync', 'okf-lifecycle'], ['migrate', 'okf-lifecycle'],
  ['compact', 'okf-lifecycle'], ['rebuild', 'okf-lifecycle'],
  ['review', 'okf-review'], ['staleness', 'okf-review'], ['human-verify', 'okf-review'],
  ['remove-verification', 'okf-review'], ['stale-after', 'okf-review'], ['trust', 'okf-review'],
  ['baseline', 'okf-review'], ['guard-state', 'okf-review'],
]);

function respond(request, result, data, findings) {
  return {
    protocol: 'okf-wrapper/1',
    skill: request.skill,
    operation: request.operation,
    result,
    scope: request.scope || null,
    evidence_limits: null,
    data,
    findings,
    next_action: null,
  };
}

// Both routing operations admit first, then route the admitted data. redact() runs
// on the admission half only; routing results carry authorized paths already.
function admitAndRoute(request, services, router) {
  const admitted = admission.admit(request, services);
  const routed = router(admitted.data, request.payload, services);
  return respond(request, routed.result, { ...admission.redact(admitted.data), ...routed.data }, [...admitted.findings, ...routed.findings]);
}

function admitAndNavigate(request, services, router) {
  const admitted = admission.admitRead(request, services);
  const routed = router(admitted.data, request.payload, services);
  const candidates = Array.isArray(admitted.data.candidates) ? admitted.data.candidates : [];
  const active = candidates.filter((candidate) => candidate.state === 'active');
  const partial = admitted.findings.length > 0 || admitted.data.coverage === 'non-exhaustive' || candidates.some((candidate) => (
    (candidate.required === true && candidate.state !== 'active') ||
    (candidate.state === 'active' && Array.isArray(candidate.findings) && candidate.findings.some((finding) => finding.blocks))
  ));
  const findings = [...routed.findings];
  let data = routed.data;
  let result = navigationResults.has(routed.result) ? routed.result : 'unavailable';
  if (active.length === 0) {
    result = 'unavailable';
    findings.push({
      code: 'unreadable',
      origin: 'suite',
      severity: 'error',
      blocks: false,
      detail: { gate: 'navigation', reason: 'no_admitted_bundle' },
    });
  } else if (partial) {
    result = 'degraded';
    if (data && typeof data === 'object' && Object.hasOwn(data, 'coverage')) {
      data = { ...data, coverage: 'non-exhaustive' };
    }
    findings.push({
      code: 'unreadable',
      origin: 'suite',
      severity: 'error',
      blocks: false,
      detail: { gate: 'navigation', reason: 'admission_incomplete' },
    });
  }
  return respond(request, result, data, findings);
}

function unknownOperation(request) {
  return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);
}

function automaticMutation(skill, request) {
  if (request.invocation !== 'automatic') return false;
  if (skill === 'okf-write' && request.operation === 'revise') return true;
  return skill === 'okf' && routerOwners.get(request.operation) === 'okf-write';
}

function automaticMutationBlocked(request) {
  return respond(request, 'blocked', { code: 'AUTOMATIC_MUTATION_BLOCKED' }, [{
    code: 'AUTOMATIC_MUTATION_BLOCKED',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'invocation', reason: 'automatic_mutation' },
  }]);
}

function writeOperation(skill, request) {
  return (skill === 'okf-write' && request.operation === 'revise') ||
    (skill === 'okf' && routerOwners.get(request.operation) === 'okf-write');
}

function validateRead(request, services) {
  const payload = request.payload;
  const hasBundle = typeof payload.bundle === 'string' && payload.bundle !== '';

  const admittedRequest = hasBundle
    ? {
      ...request,
      payload: {
        ...payload,
        candidates: [{ path: path.resolve(payload.cwd, payload.bundle), bundle: '.', declared: true, named_by_user: true }],
      },
    }
    : request;
  const admitted = admission.admitRead(admittedRequest, services);
  const requestedRoot = hasBundle ? path.resolve(payload.cwd, payload.bundle) : null;
  const candidate = admitted.data.candidates.find((item) => (
    item.state === 'active' && (requestedRoot === null || item.bundle_root === requestedRoot)
  ));
  if (!candidate) {
    return respond(request, hasBundle ? 'blocked' : admitted.result, admission.redact(admitted.data), admitted.findings);
  }
  const read = validation.validateRead(candidate.bundle_root, services, { today: request.payload.today });
  return respond(request, 'ok', { ...admission.redact(admitted.data), ...read.data }, [...admitted.findings, ...read.findings]);
}

function resolvedPath(value, services) {
  const absolute = path.resolve(value);
  try {
    return typeof services.realpath === 'function' ? services.realpath(absolute) : absolute;
  } catch {
    return absolute;
  }
}

function targetOutsideWorktree(request, services) {
  const payload = request.payload || {};
  if (
    typeof payload.cwd !== 'string' || payload.cwd === '' ||
    typeof payload.bundle !== 'string' || payload.bundle === ''
  ) return true;

  const activeRoot = services.gitRootOf(resolvedPath(payload.cwd, services));
  const targetRoot = services.gitRootOf(resolvedPath(payload.bundle, services));
  return !activeRoot || !targetRoot || activeRoot !== targetRoot;
}

function targetOutsideWorktreeBlocked(request) {
  return respond(request, 'blocked', { code: 'WRITE_TARGET_OUTSIDE_WORKTREE' }, [{
    code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'write routing', reason: 'outside_active_worktree' },
  }]);
}

function activationState(request, services) {
  const cwd = request.payload && request.payload.cwd;
  if (typeof cwd !== 'string' || cwd === '') return 'invalid-input';
  const root = services.gitRootOf(cwd);
  if (!root) return 'absent';
  return services.activationMarker(root);
}

function routerRun(request, services) {
  const owner = routerOwners.get(request.operation);
  if (!owner) return unknownOperation(request);
  const routed = runActive(owner, { ...request, skill: owner }, services);
  return { ...routed, skill: request.skill };
}

function runActive(skill, request, services) {
  if (skill === 'okf-read') {
    if (request.operation === 'validate') return validateRead(request, services);
    if (request.operation === 'resolve') return admitAndRoute(request, services, routing.resolve);
    if (request.operation === 'read') return admitAndNavigate(request, services, routing.read);
    if (request.operation === 'search') return admitAndNavigate(request, services, routing.search);
    if (request.operation !== 'admit') return unknownOperation(request);
    const outcome = admission.admit(request, services);
    return respond(request, outcome.result, admission.redact(outcome.data), outcome.findings);
  }
  if (skill === 'okf') return routerRun(request, services);
  if (skill === 'okf-lifecycle' || skill === 'okf-review') return unknownOperation(request);
  if (request.operation === 'route') return admitAndRoute(request, services, routing.routeWrite);
  if (request.operation !== 'revise') return unknownOperation(request);

  const outcome = validation.evaluate(request, services);
  return respond(request, outcome.result, outcome.data, outcome.findings);
}

function run(skill, request, services) {
  if (!skills.has(skill)) return respond(request, 'blocked', { code: 'UNKNOWN_SKILL' }, []);

  const activation = activationState(request, services);
  if (activation === 'absent') {
    if (request.invocation === 'automatic') return null;
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'not-configured', routing.notConfiguredData(request.operation), []);
    }
    return respond(request, 'not-configured', {}, []);
  }
  if (activation === 'invalid-input') return runActive(skill, request, services);
  if (activation !== 'valid') {
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'unavailable', routing.notConfiguredData(request.operation), [{
        code: 'unreadable',
        origin: 'suite',
        severity: 'error',
        blocks: false,
        detail: { gate: 'activation', reason: 'marker_invalid' },
      }]);
    }
    return respond(request, 'blocked', { code: 'ACTIVATION_MARKER_INVALID' }, [{
      code: 'ACTIVATION_MARKER_INVALID',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'activation', reason: 'not_zero_byte_regular_file' },
    }]);
  }
  if (automaticMutation(skill, request)) return automaticMutationBlocked(request);
  if (writeOperation(skill, request) && targetOutsideWorktree(request, services)) {
    return targetOutsideWorktreeBlocked(request);
  }

  return runActive(skill, request, services);
}

module.exports = { run, respond };
