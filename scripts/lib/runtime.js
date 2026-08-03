/*
PROVISIONAL (spec section 11 open item): the UNKNOWN_SKILL, UNKNOWN_OPERATION and
RUNTIME_FAILURE data codes are invented pending the #42 wrapper contract decision.
*/

const validation = require('./validation');

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

function run(skill, request, services) {
  if (skill !== 'okf-write') return respond(request, 'blocked', { code: 'UNKNOWN_SKILL' }, []);
  if (request.operation !== 'revise') return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);

  const outcome = validation.evaluate(request, services);
  return respond(request, outcome.result, outcome.data, outcome.findings);
}

module.exports = { run, respond };
