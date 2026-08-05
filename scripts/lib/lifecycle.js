const path = require('node:path');

function plan(request, context, services) {
  const concept = request.payload.concept;
  const file = path.resolve(context.bundle_root, concept);
  return {
    result: Object.hasOwn(request.payload, 'set') ? null : 'abstained',
    operation: services.exists(file) ? 'revise' : 'create',
    request: { ...request, payload: { ...request.payload, concept } },
  };
}

module.exports = { plan };
