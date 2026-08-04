const requestKeys = ['protocol', 'skill', 'operation', 'payload', 'task_kind', 'scope', 'target', 'settings', 'invocation', 'brief'];
const responseKeys = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRequest(text, expectedSkill) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (!isPlainObject(obj)) throw new Error('Request must be a JSON object');
  for (const key of Object.keys(obj)) {
    if (!requestKeys.includes(key)) throw new Error(`Unknown field: ${key}`);
  }
  if (obj.protocol !== 'okf-wrapper/1') throw new Error('Invalid protocol');
  if (obj.skill !== expectedSkill) throw new Error(`Expected skill ${expectedSkill}, got ${obj.skill}`);
  if (!obj.operation) throw new Error('Missing operation');
  if (!isPlainObject(obj.payload)) throw new Error('Missing payload');
  if (obj.invocation !== undefined && !['explicit', 'automatic'].includes(obj.invocation)) {
    throw new Error('Invalid invocation');
  }
  if (obj.operation === 'revise' && (typeof obj.payload.cwd !== 'string' || obj.payload.cwd === '')) {
    throw new Error('Missing payload.cwd');
  }
  if (obj.operation === 'revise' && (
    typeof obj.payload.bundle !== 'string' || obj.payload.bundle === '' ||
    typeof obj.payload.concept !== 'string' || obj.payload.concept === ''
  )) {
    throw new Error('Missing payload.bundle or payload.concept');
  }
  if (obj.operation === 'validate') {
    if (typeof obj.payload.cwd !== 'string' || obj.payload.cwd === '') {
      throw new Error('Missing payload.cwd');
    }
    if (Object.hasOwn(obj.payload, 'bundle') && (
      typeof obj.payload.bundle !== 'string' || obj.payload.bundle === ''
    )) {
      throw new Error('Invalid payload.bundle');
    }
    if (Object.hasOwn(obj.payload, 'candidates') && !Array.isArray(obj.payload.candidates)) {
      throw new Error('Invalid payload.candidates');
    }
    if (typeof obj.payload.bundle !== 'string' && !Array.isArray(obj.payload.candidates)) {
      throw new Error('Missing payload.bundle or payload.candidates');
    }
  }
  if (obj.operation === 'resolve' && typeof obj.payload.target !== 'string') throw new Error('Missing payload.target');
  if (obj.operation === 'route' && typeof obj.payload.concept !== 'string') throw new Error('Missing payload.concept');

  return obj;
}

function serializeResponse(response) {
  const ordered = {};
  for (const key of responseKeys) ordered[key] = response[key];
  return JSON.stringify(ordered);
}

module.exports = { parseRequest, serializeResponse };
