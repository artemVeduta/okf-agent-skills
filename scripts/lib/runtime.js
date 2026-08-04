/*
PROVISIONAL (spec section 11 open item): the UNKNOWN_SKILL, UNKNOWN_OPERATION and
RUNTIME_FAILURE data codes are invented pending the #42 wrapper contract decision.
*/

const validation = require('./validation');
const admission = require('./admission');
const routing = require('./routing');

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

function run(skill, request, services) {
  if (skill === 'okf-read') {
    if (request.operation === 'resolve') return admitAndRoute(request, services, routing.resolve);
    if (request.operation !== 'admit') return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);
    const outcome = admission.admit(request, services);
    return respond(request, outcome.result, admission.redact(outcome.data), outcome.findings);
  }
  if (skill !== 'okf-write') return respond(request, 'blocked', { code: 'UNKNOWN_SKILL' }, []);
  if (request.operation === 'route') return admitAndRoute(request, services, routing.routeWrite);
  if (request.operation !== 'revise') return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);

  const outcome = validation.evaluate(request, services);
  return respond(request, outcome.result, outcome.data, outcome.findings);
}

module.exports = { run, respond };
