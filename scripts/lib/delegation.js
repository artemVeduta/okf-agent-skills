const runtime = require('./runtime');

const NEXT_ACTION = 'Correct the reported gate and submit one bounded request.';

const ROLES = {
  'okf-reader': { skill: 'okf-read' },
  'okf-writer': { skill: 'okf-write' },
};

const WRITE_EFFECTS = new Set([...runtime.primaryEffects.values(), ...runtime.derivedEffects]);

const requiredFields = [
  'role', 'task_kind', 'operation_class', 'cwd', 'bundle', 'paths',
  'allowed_effects', 'forbidden_effects', 'evidence', 'required_checks',
  'settings', 'expected_result',
];

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function briefFinding(code, detail) {
  return { code, origin: 'suite', severity: 'error', blocks: true, detail };
}

function incompleteBrief(field) {
  return {
    ok: false,
    status: 'blocked: incomplete-brief',
    findings: [briefFinding('INCOMPLETE_BRIEF', { gate: 'brief', field })],
    next_action: NEXT_ACTION,
  };
}

function conflictingRules(reason) {
  return {
    ok: false,
    status: 'blocked: conflicting-rules',
    findings: [briefFinding('CONFLICTING_RULES', { gate: 'brief', reason })],
    next_action: NEXT_ACTION,
  };
}

function buildRequest(brief) {
  const payload = { cwd: brief.cwd, bundle: brief.bundle };
  if (runtime.primaryEffects.has(brief.operation_class)) {
    payload.concept = brief.paths[0];
    payload.evidence = brief.evidence;
    payload.effects = brief.allowed_effects;
    payload.set = brief.changes;
    // #149: a `create` brief's document body is a deliberate, additive extension of
    // this brief -> request mapping, not a rebuilt parallel path. Every other field
    // above already existed; `body` is new because no caller before the setup
    // orchestration adapter ever needed a delegated `create` to carry one --
    // `okf-writer` briefs in the wild so far only ever revised existing content
    // (`changes` alone). Optional and forwarded only for `create`, so a brief that
    // omits it (every brief before this ticket) builds the exact same request as
    // before.
    if (brief.operation_class === 'create' && typeof brief.body === 'string') payload.body = brief.body;
  } else if (brief.operation_class === 'read') {
    payload.target = brief.paths[0];
  } else if (brief.operation_class === 'search') {
    payload.query = brief.paths[0];
  }
  return {
    protocol: 'okf-wrapper/1',
    skill: ROLES[brief.role].skill,
    operation: brief.operation_class,
    task_kind: brief.task_kind,
    invocation: 'explicit',
    payload,
  };
}

function validateBrief(brief) {
  if (!brief || typeof brief !== 'object') return incompleteBrief(null);
  for (const field of requiredFields) {
    if (!Object.hasOwn(brief, field)) return incompleteBrief(field);
    if (field !== 'allowed_effects' && isEmpty(brief[field])) return incompleteBrief(field);
  }
  if (!Object.hasOwn(ROLES, brief.role)) return incompleteBrief('role');
  if (brief.paths.length !== 1 || typeof brief.paths[0] !== 'string' || brief.paths[0] === '') {
    return incompleteBrief('paths');
  }
  const settings = brief.settings;
  if (typeof settings !== 'object' || Array.isArray(settings) ||
    !['inline', 'delegated'].includes(settings.read_execution) ||
    !['inline', 'delegated'].includes(settings.write_execution)) {
    return incompleteBrief('settings');
  }
  const isWriter = brief.role === 'okf-writer';
  if (isWriter && isEmpty(brief.allowed_effects)) return incompleteBrief('allowed_effects');
  if (isWriter ? isEmpty(brief.changes) : !isEmpty(brief.changes)) return incompleteBrief('changes');

  if (brief.allowed_effects.some((effect) => brief.forbidden_effects.includes(effect))) {
    return conflictingRules('effect_conflict');
  }
  const widensScope = brief.role === 'okf-reader'
    ? brief.allowed_effects.some((effect) => WRITE_EFFECTS.has(effect))
    : brief.allowed_effects.some((effect) => !WRITE_EFFECTS.has(effect));
  if (widensScope) {
    return conflictingRules('scope_widening');
  }
  const owner = runtime.routerOwners.get(brief.operation_class);
  if (brief.operation_class === 'orient' || (owner !== undefined && owner !== ROLES[brief.role].skill)) {
    return conflictingRules('operation_class');
  }

  return { ok: true, request: buildRequest(brief) };
}

function statusFor(response) {
  if (response.result === 'applied' || response.result === 'no-op') return 'clean';
  if (response.result === 'failed/incomplete') return 'partially-applied';
  if (response.result === 'blocked') {
    const code = response.data && response.data.code;
    if (code === 'WRITE_TARGET_OUTSIDE_WORKTREE') return 'blocked: repository-instance-mismatch';
    if (code === 'TARGET_CHANGED') return 'blocked: target-conflict';
    if (code === 'EVIDENCE_UNAVAILABLE') return 'blocked: stale-handoff';
    return 'failed';
  }
  return response.result;
}

function receipt(brief, response) {
  const b = brief || {};
  const status = response.status || statusFor(response);
  const data = response.data || {};
  return {
    protocol: 'okf-wrapper/1',
    receipt: 'okf-delegation/1',
    role: b.role,
    status,
    operation_identity: { operation: b.operation_class, task_kind: b.task_kind, role: b.role },
    target: { bundle: b.bundle, cwd: b.cwd, concepts: b.paths },
    requested_effects: b.allowed_effects,
    actual_effects: data.actual_effects || [],
    evidence: data.evidence || [],
    validation: Object.hasOwn(data, 'validation') ? data.validation : null,
    residue: data.residue || [],
    disclosures: { writes: 'not serialized', crash_recovery: 'not provided', retry: 'not automatic' },
    findings: response.findings || [],
    next_action: response.next_action !== undefined ? response.next_action : null,
  };
}

module.exports = { ROLES, validateBrief, receipt };
