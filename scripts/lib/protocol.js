const requestKeys = ['protocol', 'skill', 'operation', 'payload', 'task_kind', 'scope', 'target', 'settings', 'invocation', 'brief'];
const responseKeys = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];
const requiredPayload = new Map([
  ['create', ['cwd', 'bundle', 'concept']],
  ['revise', ['cwd', 'bundle', 'concept']],
  ['format', ['cwd', 'bundle', 'concept']],
  ['relationship', ['cwd', 'bundle', 'concept']],
  ['machine-verify', ['cwd', 'bundle', 'concept']],
  ['sync', ['cwd', 'bundle', 'concept']],
  ['review', ['cwd', 'bundle', 'concept']],
  ['init', ['cwd']],
  ['inspect', ['cwd']],
  ['repair', ['cwd']],
  ['resolve', ['cwd']],
  ['read', ['cwd', 'target']],
  ['search', ['cwd', 'query']],
  ['orient', ['cwd', 'harness', 'context_id', 'logical_cause']],
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
  if (obj.operation === 'sync' && obj.invocation === undefined) {
    throw new Error('Missing invocation');
  }
  for (const field of requiredPayload.get(obj.operation) || []) {
    if (typeof obj.payload[field] !== 'string' || obj.payload[field] === '') {
      throw new Error(`Missing payload.${field}`);
    }
  }
  if (obj.operation === 'review') {
    if (Object.hasOwn(obj.payload, 'today') && (typeof obj.payload.today !== 'string' || !isISODate(obj.payload.today))) {
      throw new Error('Invalid payload.today');
    }
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
  if (obj.operation === 'repair') {
    if (!Array.isArray(obj.payload.targets) || obj.payload.targets.length === 0) {
      throw new Error('Missing payload.targets');
    }
  }
  if (obj.operation === 'resolve' && typeof obj.payload.target !== 'string') throw new Error('Missing payload.target');

  return obj;
}

function serializeResponse(response) {
  const ordered = {};
  for (const key of responseKeys) ordered[key] = response[key];
  return JSON.stringify(ordered);
}

module.exports = { parseRequest, serializeResponse, requiredPayload };
