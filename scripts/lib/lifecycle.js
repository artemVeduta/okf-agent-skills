const path = require('node:path');

const writableTaskKinds = new Set(['feature work', 'fix', 'research']);

function isWritableTaskKind(taskKind) {
  return writableTaskKinds.has(taskKind);
}

function plan(request, context, services) {
  const concept = request.payload.concept;
  const file = path.resolve(context.bundle_root, concept);
  return {
    result: Object.hasOwn(request.payload, 'set') && isWritableTaskKind(request.task_kind) ? null : 'abstained',
    operation: services.exists(file) ? 'revise' : 'create',
  };
}

module.exports = { plan, isWritableTaskKind };
