const path = require('node:path');
const validation = require('./validation');
const admission = require('./admission');
const routing = require('./routing');
const lifecycle = require('./lifecycle');
const orientation = require('./orientation');

const skills = new Set(['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review']);
const navigationResults = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
const routerOwners = new Map([
  ['enumerate', 'okf-read'], ['search', 'okf-read'], ['read', 'okf-read'], ['validate', 'okf-read'],
  ['orient', 'okf-read'],
  ['create', 'okf-write'], ['revise', 'okf-write'], ['format', 'okf-write'], ['machine-verify', 'okf-write'],
  ['relationship', 'okf-write'], ['sync', 'okf-lifecycle'], ['review', 'okf-review'],
]);

const primaryEffects = new Map([
  ['create', 'concept-create'], ['revise', 'concept-revise'], ['format', 'format'],
  ['relationship', 'relationship'], ['machine-verify', 'machine-verify'],
]);
const derivedEffects = new Set(['index-maintenance', 'log-append']);
const forbiddenEffectKeys = ['deprecate', 'move', 'rename', 'rewrite'];
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

function writeResponse(request, result, authorization, effects, evidence, validationState, findings = [], code = undefined, scope = request.scope || null, completedEffects = [], residue = []) {
  const completed = new Set(completedEffects);
  const data = {
    authorization,
    effects,
    task_kind: request.task_kind === undefined ? null : request.task_kind,
    actual_effects: effectRecords(effects.filter(({ effect }) => completed.has(effect)).map(({ effect }) => effect), 'notice'),
    residue,
    evidence,
    validation: validationState,
  };
  if (code !== undefined) data.code = code;
  const nextAction = result === 'applied' || result === 'no-op' ? null : 'Correct the reported gate and submit one bounded request.';
  return respond(request, result, data, findings, { scope, evidence_limits: writeLimits, next_action: nextAction });
}

function effectRecords(effects, authorization) {
  return effects.map((effect, index) => ({ effect, authorization, inherited: index > 0 }));
}

function boundedEffects(operation, payload) {
  const primary = primaryEffects.get(operation);
  if (!primary) return { invalid: true, effects: [] };
  if (payload.effects === undefined) return { effects: [primary] };
  if (!Array.isArray(payload.effects) || payload.effects.length === 0) return { invalid: true, effects: [] };
  const requested = payload.effects;
  const valid = requested.includes(primary) && requested.every((effect) => effect === primary || derivedEffects.has(effect));
  if (!valid || new Set(requested).size !== requested.length) return { invalid: true, effects: requested };
  return { effects: [primary, ...requested.filter((effect) => effect !== primary)] };
}

function scopeFor(request, requireScope) {
  const concept = request.payload.concept;
  const scope = request.scope;
  if (scope === undefined && !requireScope) return { scope: { concepts: [concept] } };
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).length !== 1 ||
    !Array.isArray(scope.concepts) || scope.concepts.length !== 1 || scope.concepts[0] !== concept) return { invalid: true, scope: scope || null };
  return { scope };
}

function modeOf(bundleRoot, services) {
  return validation.projectMode(bundleRoot, services);
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function readEvidence(payload, bundleRoot, services) {
  const required = ['create', 'revise', 'relationship', 'machine-verify'].includes(payload._operation);
  if (!required) return { evidence: [] };
  if (!Array.isArray(payload.evidence) || payload.evidence.length === 0 || payload.evidence.some((item) => typeof item !== 'string' || item === '')) return { invalid: true, evidence: [] };
  const evidence = [];
  for (const relative of payload.evidence) {
    const file = path.resolve(bundleRoot, relative);
    if (!inside(bundleRoot, file)) return { invalid: true, evidence };
    try { services.readFile(file); } catch { return { unavailable: true, evidence }; }
    evidence.push(relative.split(path.sep).join('/'));
  }
  return { evidence };
}

function unsupportedPayload(payload, operation) {
  const set = payload.set;
  if (set !== undefined && (set === null || typeof set !== 'object' || Array.isArray(set))) return true;
  if ([payload, set].some((value) => value && forbiddenEffectKeys.some((key) => Object.hasOwn(value, key)))) return true;
  if ([payload, set].some((value) => value && (value.effects === 'link-rewrite' || Array.isArray(value.effects) && value.effects.includes('link-rewrite')))) return true;
  if (['delete', 'status', 'redirect', 'alias', 'purge'].some((key) => Object.hasOwn(payload, key))) return true;
  if (set && (Object.hasOwn(set, 'status') || Object.hasOwn(set, 'stale_after'))) return true;
  if (set && Object.hasOwn(set, 'verified') && operation !== 'machine-verify') return true;
  if (operation === 'machine-verify' && set && Object.hasOwn(set, 'verified')) {
    const events = Array.isArray(set.verified) ? set.verified : [set.verified];
    if (events.some((event) => !event || typeof event !== 'object' || event.kind !== 'machine')) return true;
  }
  return false;
}

function derivativeLine(effect, operation, concept) {
  return effect === 'index-maintenance'
    ? `- [${concept}](${concept})`
    : `- ${operation}: [${concept}](${concept})`;
}

function appendDerivative(effect, operation, bundleRoot, concept, services) {
  const file = path.join(bundleRoot, effect === 'index-maintenance' ? 'index.md' : 'log.md');
  if (!services.exists(file)) return { written: false };
  const current = services.readFile(file);
  const line = derivativeLine(effect, operation, concept);
  const parsed = current.split('\n', 1)[0].replace(/\r$/, '') === '---'
    ? validation.parseFrontmatter(current)
    : null;
  if (parsed) validation.parseYAML(parsed.frontmatter);
  const body = parsed ? parsed.body : current;
  if (body.split('\n').some((entry) => entry.replace(/\r$/, '') === line)) return { written: false };
  const rendered = `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${line}\n`;
  if (parsed) validation.parseYAML(validation.parseFrontmatter(rendered).frontmatter);
  services.publishFile(file, rendered, current);
  if (parsed) validation.parseYAML(validation.parseFrontmatter(services.readFile(file)).frontmatter);
  return { written: true };
}

function executeBounded(request, services, operation, requireScope = false) {
  const effectsResult = boundedEffects(operation, request.payload);
  const provisionalEffects = effectsResult.effects.length ? effectsResult.effects : [primaryEffects.get(operation)].filter(Boolean);
  if (effectsResult.invalid || unsupportedPayload(request.payload, operation)) {
    const finding = suiteFinding('UNSUPPORTED_INPUT', { gate: 'effects', operation });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'UNSUPPORTED_INPUT');
  }
  if (!lifecycle.isWritableTaskKind(request.task_kind)) {
    const finding = suiteFinding('TASK_KIND_NOT_WRITE_ELIGIBLE', {
      gate: 'task kind',
      task_kind: request.task_kind === undefined ? null : request.task_kind,
    });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'TASK_KIND_NOT_WRITE_ELIGIBLE');
  }
  const scoped = scopeFor(request, requireScope);
  if (scoped.invalid) {
    const finding = suiteFinding('INVALID_SCOPE', { gate: 'scope' });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'INVALID_SCOPE', scoped.scope);
  }
  const payload = request.payload;
  const bundleRoot = path.resolve(payload.cwd, payload.bundle);
  const activeRoot = services.gitRootOf(path.resolve(payload.cwd));
  const targetRoot = services.gitRootOf(bundleRoot);
  if (!activeRoot || !targetRoot) {
    const finding = suiteFinding('WRITE_OWNERSHIP_UNKNOWN', { gate: 'ownership', reason: 'unknown_or_non_local' });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'WRITE_OWNERSHIP_UNKNOWN', scoped.scope);
  }
  if (activeRoot !== targetRoot) return targetOutsideWorktreeBlocked({ ...request, scope: scoped.scope });

  const admitted = admission.admit({ ...request, scope: scoped.scope, payload: {
    ...payload,
    candidates: [{
      path: activeRoot,
      bundle: path.relative(activeRoot, bundleRoot) || '.',
      declared: true,
      named_by_user: true,
      requires_repository: true,
    }],
  } }, services);
  const candidate = admitted.data.candidates && admitted.data.candidates.find((item) => item.state === 'active' && item.bundle_root === bundleRoot);
  if (!candidate) {
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', admitted.findings, 'BUNDLE_NOT_ADMITTED', scoped.scope);
  }
  const mode = modeOf(bundleRoot, services);
  if (!mode) {
    const finding = suiteFinding('PROJECT_MODE_INVALID', { gate: 'project mode' });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'PROJECT_MODE_INVALID', scoped.scope);
  }
  if (mode === 'code-backed' && payload.code_recoverable === true) {
    const finding = suiteFinding('CODE_RECOVERABLE_MATERIAL', { gate: 'project mode' });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), [], 'not-run', [finding], 'CODE_RECOVERABLE_MATERIAL', scoped.scope);
  }
  const observed = readEvidence({ ...payload, _operation: operation }, bundleRoot, services);
  if (observed.invalid || observed.unavailable) {
    const code = observed.unavailable ? 'EVIDENCE_UNAVAILABLE' : 'EVIDENCE_REQUIRED';
    const finding = suiteFinding(code, { gate: 'evidence' });
    return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), observed.evidence, 'not-run', [finding], code, scoped.scope);
  }

  let outcome;
  try {
    const writerRequest = { ...request, scope: scoped.scope, payload: { ...payload, bundle: bundleRoot } };
    outcome = operation === 'create' ? validation.evaluateCreate(writerRequest, services) : validation.evaluate(writerRequest, services);
  } catch (error) {
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' });
    return writeResponse(request, 'failed/incomplete', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'failed', [finding], undefined, scoped.scope);
  }
  if (outcome.result === 'blocked') return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), observed.evidence, 'not-run', outcome.findings, undefined, scoped.scope);
  if (outcome.result === 'failed/incomplete') return writeResponse(request, 'failed/incomplete', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'failed', outcome.findings, undefined, scoped.scope);
  if (!outcome.data.written) return writeResponse(request, 'no-op', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'not-needed', outcome.findings, undefined, scoped.scope);
  const completedEffects = new Set();
  try {
    services.publishFile(outcome.data.file, outcome.data.rendered, outcome.data.expected);
    completedEffects.add(primaryEffects.get(operation));
  } catch (error) {
    if (error && error.code === 'TARGET_CHANGED') {
      const finding = suiteFinding('TARGET_CHANGED', { gate: 'target', path: payload.concept, reason: error.message });
      return writeResponse(request, 'blocked', 'blocked', effectRecords(provisionalEffects, 'blocked'), observed.evidence, 'not-run', [...outcome.findings, finding], 'TARGET_CHANGED', scoped.scope);
    }
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' });
    return writeResponse(request, 'failed/incomplete', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'failed', [...outcome.findings, finding], undefined, scoped.scope, completedEffects);
  }
  const checked = validation.postWrite(bundleRoot, payload.concept, services, outcome.data.tree);
  if (!checked.valid) return writeResponse(request, 'failed/incomplete', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'failed', [...outcome.findings, ...checked.findings], undefined, scoped.scope, completedEffects);
  for (const effect of provisionalEffects.filter((item) => item === 'index-maintenance' || item === 'log-append')) {
    try {
      if (appendDerivative(effect, operation, bundleRoot, payload.concept, services).written) {
        completedEffects.add(effect);
      }
    } catch (error) {
      const reason = error.message || 'derivative write failed';
      const finding = suiteFinding('DERIVATIVE_WRITE_FAILED', { gate: 'derivative', effect, reason });
      return writeResponse(request, 'failed/incomplete', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'failed', [...outcome.findings, ...checked.findings, finding], undefined, scoped.scope, completedEffects, [{ effect, reason }]);
    }
  }
  return writeResponse(request, 'applied', 'notice', effectRecords(provisionalEffects, 'notice'), observed.evidence, 'valid', [...outcome.findings, ...checked.findings], undefined, scoped.scope, completedEffects);
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
  const { active, partial } = admission.completeness(admitted);
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
  if (request.skill === 'okf-write' || request.skill === 'okf-lifecycle' || request.skill === 'okf') {
    return writeResponse(request, 'blocked', 'blocked', [], [], 'not-run', [], 'UNKNOWN_OPERATION');
  }
  return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);
}

function automaticMutation(skill, request) {
  return request.invocation === 'automatic' && (
    (skill === 'okf-write' && primaryEffects.has(request.operation)) ||
    (skill === 'okf-lifecycle' && request.operation === 'sync') ||
    (skill === 'okf' && (primaryEffects.has(request.operation) || request.operation === 'sync'))
  );
}

function automaticMutationBlocked(request) {
  const effect = primaryEffects.get(request.operation) || 'concept-revise';
  return writeResponse(request, 'blocked', 'blocked', effectRecords([effect], 'blocked'), [], 'not-run', [{
    code: 'AUTOMATIC_MUTATION_BLOCKED',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'invocation', reason: 'automatic_mutation' },
  }], 'AUTOMATIC_MUTATION_BLOCKED');
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

function enumerateRead(request, services) {
  const payload = request.payload;
  const hasBundle = typeof payload.bundle === 'string' && payload.bundle !== '';
  const admittedRequest = hasBundle && payload.candidates === undefined
    ? {
      ...request,
      payload: {
        ...payload,
        candidates: [{ path: path.resolve(payload.cwd, payload.bundle), bundle: '.', declared: true, named_by_user: true }],
      },
    }
    : request;
  return admitAndNavigate(admittedRequest, services, routing.enumerate);
}

function targetOutsideWorktreeBlocked(request) {
  const effect = primaryEffects.get(request.operation) || 'concept-revise';
  return writeResponse(request, 'blocked', 'blocked', effectRecords([effect], 'blocked'), [], 'not-run', [{
    code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: { gate: 'write routing', reason: 'outside_active_worktree' },
  }], 'WRITE_TARGET_OUTSIDE_WORKTREE', request.scope || null);
}

function orientRespond(request, services, marker) {
  const outcome = orientation.orient(request, services, marker);
  return outcome === null ? null : respond(request, outcome.result, outcome.data, outcome.findings, { next_action: outcome.next_action });
}

function activationState(request, services) {
  const cwd = request.payload && request.payload.cwd;
  if (typeof cwd !== 'string' || cwd === '') return 'invalid-input';
  const root = services.gitRootOf(cwd);
  if (!root) return 'absent';
  return services.activationMarker(root);
}

function isWriteOperation(skill, request) {
  return (skill === 'okf-write' || skill === 'okf') && primaryEffects.has(request.operation);
}

function routerRun(request, services) {
  const owner = routerOwners.get(request.operation);
  if (!owner) return unknownOperation(request);
  const routed = runActive(owner, { ...request, skill: owner }, services);
  return { ...routed, skill: request.skill };
}

function runActive(skill, request, services) {
  if (skill === 'okf-read') {
    if (request.operation === 'orient') return orientRespond(request, services, 'valid');
    if (request.operation === 'validate') return validateRead(request, services);
    if (request.operation === 'enumerate') return enumerateRead(request, services);
    if (request.operation === 'resolve') return admitAndRoute(request, services, routing.resolve);
    if (request.operation === 'read') return admitAndNavigate(request, services, routing.read);
    if (request.operation === 'search') return admitAndNavigate(request, services, routing.search);
    if (request.operation !== 'admit') return unknownOperation(request);
    const outcome = admission.admit(request, services);
    return respond(request, outcome.result, admission.redact(outcome.data), outcome.findings);
  }
  if (skill === 'okf') return routerRun(request, services);
  if (skill === 'okf-review') {
    if (request.operation === 'review') {
      const outcome = validation.evaluateReview(request, services);
      return respond(request, outcome.result, outcome.data, outcome.findings);
    }
    return unknownOperation(request);
  }
  if (skill === 'okf-lifecycle') {
    if (request.operation !== 'sync') return unknownOperation(request);
    const context = { bundle_root: path.resolve(request.payload.cwd, request.payload.bundle) };
    const planned = lifecycle.plan(request, context, services);
    if (planned.result === 'abstained') {
      const scoped = scopeFor(request, true);
      if (scoped.invalid) {
        const finding = suiteFinding('INVALID_SCOPE', { gate: 'scope' });
        return writeResponse(request, 'blocked', 'blocked', effectRecords([primaryEffects.get(planned.operation)], 'blocked'), [], 'not-run', [finding], 'INVALID_SCOPE', scoped.scope);
      }
      return writeResponse(request, 'abstained', 'allowed', effectRecords([primaryEffects.get(planned.operation)], 'allowed'), [], 'not-run', [], undefined, scoped.scope);
    }
    return executeBounded(planned.request, services, planned.operation, true);
  }
  if (!primaryEffects.has(request.operation)) return unknownOperation(request);
  return executeBounded(request, services, request.operation);
}

function run(skill, request, services) {
  if (!skills.has(skill)) return respond(request, 'blocked', { code: 'UNKNOWN_SKILL' }, []);

  const activation = activationState(request, services);
  if (activation === 'absent') {
    if (request.invocation === 'automatic') return null;
    if (request.operation === 'orient') return orientRespond(request, services, 'absent');
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'not-configured', routing.notConfiguredData(request.operation), []);
    }
    return respond(request, 'not-configured', {}, []);
  }
  if (activation === 'invalid-input') return runActive(skill, request, services);
  if (activation !== 'valid') {
    if (request.operation === 'orient') return orientRespond(request, services, 'invalid');
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'unavailable', routing.notConfiguredData(request.operation), [{
        code: 'unreadable',
        origin: 'suite',
        severity: 'error',
        blocks: false,
        detail: { gate: 'activation', reason: 'marker_invalid' },
      }]);
    }
    if (isWriteOperation(skill, request)) {
      const effect = primaryEffects.get(request.operation);
      return writeResponse(request, 'blocked', 'blocked', effectRecords([effect], 'blocked'), [], 'not-run', [{
        code: 'ACTIVATION_MARKER_INVALID',
        origin: 'suite',
        severity: 'error',
        blocks: true,
        detail: { gate: 'activation', reason: 'not_zero_byte_regular_file' },
      }], 'ACTIVATION_MARKER_INVALID');
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
  return runActive(skill, request, services);
}

module.exports = { run, respond };
