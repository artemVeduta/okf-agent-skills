/**
 * PROTOTYPE — portable manual-operation guard (wayfinder ticket
 * "Prototype the portable manual-operation guard state machine").
 *
 * QUESTION BEING PROTOTYPED
 * When a harness invokes a manual-only operation (`init`, large/full `sync`,
 * migration, compaction) — with or without an explicit user request, a preview
 * of the current scope, and confirmation of that exact preview — what minimal
 * state machine allows, refuses, expires, cancels, or restarts the operation so
 * that (1) the human can always see why it is blocked, and (2) a stale
 * confirmation can never authorize changed work?
 *
 * This module is the part worth keeping: a pure reducer with no I/O, no clock,
 * no terminal code and no harness coupling. Every fact it needs — the current
 * time, the session identity, whether the harness could attest an explicit user
 * request, and the freshly observed preview — arrives as data on the action or
 * the environment. The cross-harness architecture and invocation-control
 * research found that no
 * harness exposes (b) "a preview was shown", (c) "the human confirmed *that*
 * preview", or (d) a reliable staleness signal to skill content, so the guard
 * manufactures and persists those facts itself and treats everything a harness
 * *might* provide as an injected, optional hardening input.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Domain vocabulary (CONTEXT.md and the related operation-contract decisions)
// ---------------------------------------------------------------------------

export type OperationName = 'init' | 'sync' | 'migration' | 'compaction';

/** What the harness can say about the invocation that reached the skill. */
export type RequestAttestation =
  | 'explicit' // Claude Code `disable-model-invocation`, Codex `allow_implicit_invocation: false`
  | 'unknown' // OpenCode: the harness cannot tell
  | 'model-initiated'; // the agent decided to do this on its own

export type PlannedAction = 'CREATE' | 'MODIFY' | 'MOVE' | 'DELETE' | 'KEEP';
export type RiskClass = 'SAFE' | 'CAUTION' | 'REVIEW' | 'DESTRUCTIVE';

export interface PlannedItem {
  path: string;
  /** Content hash of the *input*. Deliberately excludes mtime and size. */
  contentHash: string;
  action: PlannedAction;
  risk: RiskClass;
}

/** A dry-run manifest, in the shape docs/research/migration-sections/06 §1.3 describes. */
export interface Preview {
  operation: OperationName;
  /** Path prefix the operation was asked to cover. `.` means the whole bundle. */
  selector: string;
  /** Identity of the transform itself, not of its inputs (e.g. `okf-v0.1-to-v0.2`). */
  transformVersion: string;
  items: PlannedItem[];
  /** False when the planner truncated: an unseen scope can never be confirmed. */
  complete: boolean;
  /** Non-null when the manifest could not be computed at all. */
  error: string | null;
}

export interface PreviewToken {
  /** Short id the human echoes back. Derived from the fingerprint, never random. */
  id: string;
  fingerprint: string;
  operation: OperationName;
  selector: string;
  transformVersion: string;
  items: PlannedItem[];
  complete: boolean;
  request: RequestBinding | null;
  mintedAt: number;
  mintedInSession: string;
  epochAtMint: number;
}

export interface RequestBinding {
  occurrence: number;
  operation: OperationName;
  selector: string;
  attestation: Exclude<RequestAttestation, 'model-initiated'>;
  recordedAt: number;
}

// ---------------------------------------------------------------------------
// Fingerprinting — the binding mechanism
// ---------------------------------------------------------------------------

/**
 * Binds a confirmation to the exact work previewed, in the `--force-with-lease`
 * / `If-Match` shape: an expected old value taken from what the human actually
 * saw, never re-read at execute time. Covers the observed inputs *and* the
 * planned actions and risk classes, so a MODIFY silently becoming a DELETE
 * invalidates the confirmation even when the file set is unchanged.
 */
export function fingerprint(preview: Preview): string {
  const canonical = JSON.stringify({
    operation: preview.operation,
    selector: preview.selector,
    transformVersion: preview.transformVersion,
    items: [...preview.items]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((i) => [i.path, i.contentHash, i.action, i.risk]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function tokenIdFor(fp: string, requestOccurrence: number | null): string {
  const bound = createHash('sha256').update(`${requestOccurrence ?? 'unrequested'}:${fp}`).digest('hex');
  return `P-${bound.slice(0, 8)}`;
}

export function countDestructive(items: PlannedItem[]): number {
  return items.filter((i) => i.risk === 'DESTRUCTIVE').length;
}

/** Human-readable drift: what moved between the confirmed plan and the live one. */
export function describeDrift(confirmed: PlannedItem[], observed: PlannedItem[]): string[] {
  const before = new Map(confirmed.map((i) => [i.path, i]));
  const after = new Map(observed.map((i) => [i.path, i]));
  const drift: string[] = [];

  for (const [path, item] of after) {
    const was = before.get(path);
    if (!was) {
      drift.push(`added to scope: ${path} (${item.action}/${item.risk})`);
      continue;
    }
    if (was.contentHash !== item.contentHash) drift.push(`content changed: ${path}`);
    if (was.action !== item.action) drift.push(`planned action changed: ${path} ${was.action} -> ${item.action}`);
    if (was.risk !== item.risk) drift.push(`risk class changed: ${path} ${was.risk} -> ${item.risk}`);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) drift.push(`removed from scope: ${path}`);
  }
  return drift;
}

// ---------------------------------------------------------------------------
// Guard state
// ---------------------------------------------------------------------------

export type GuardState =
  | { phase: 'idle' }
  | { phase: 'requested'; request: RequestBinding }
  | { phase: 'previewed'; token: PreviewToken }
  | { phase: 'confirmed'; token: PreviewToken; confirmedAt: number; confirmedInSession: string; degraded: boolean }
  | { phase: 'executing'; token: PreviewToken }
  | { phase: 'completed'; operation: OperationName; at: number }
  | { phase: 'failed'; operation: OperationName; at: number; note: string }
  | { phase: 'stale'; operation: OperationName; code: BlockCode; detail: string[] };

/**
 * Hardening a harness *may* supply. The machine must stay correct when both are
 * off, because no harness exposes a staleness signal to skill content today.
 */
export interface GuardConfig {
  /** Wall-clock TTL for a confirmation, or null when no clock is trustworthy. */
  ttlMs: number | null;
  /** Expire a confirmation that crosses a session or context boundary. */
  sessionBinding: boolean;
}

export interface Ledger {
  /** Bumped by any completed manual operation; invalidates outstanding siblings. */
  epoch: number;
  /** Single-use enforcement: a fingerprint may authorize at most one run. */
  spent: string[];
}

export interface GuardModel {
  config: GuardConfig;
  state: GuardState;
  ledger: Ledger;
  requestOccurrences: number;
}

export function initialModel(config: GuardConfig): GuardModel {
  return { config, state: { phase: 'idle' }, ledger: { epoch: 0, spent: [] }, requestOccurrences: 0 };
}

// ---------------------------------------------------------------------------
// Actions, environment, outcomes
// ---------------------------------------------------------------------------

export type GuardAction =
  | { kind: 'request'; operation: OperationName; selector: string }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'confirm'; tokenId: string }
  | { kind: 'execute'; operation: OperationName; selector: string; observed: Preview }
  | { kind: 'executionResult'; ok: boolean; note: string }
  | { kind: 'cancel' }
  | { kind: 'externalExecution'; operation: OperationName };

export interface GuardEnv {
  now: number;
  sessionId: string;
  /** What the current invocation can attest. Injected per harness adapter. */
  attestation: RequestAttestation;
}

export type Verdict = 'ALLOW' | 'REFUSE' | 'EXPIRE' | 'CANCEL' | 'RESTART' | 'RECORDED';

export type BlockCode =
  // refusals — the ask does not match authorized work
  | 'NO_EXPLICIT_REQUEST'
  | 'SELF_CONFIRMED'
  | 'NO_PREVIEW'
  | 'UNKNOWN_TOKEN'
  | 'NOT_CONFIRMED'
  | 'OPERATION_MISMATCH'
  | 'SELECTOR_MISMATCH'
  | 'PREVIEW_INCOMPLETE'
  | 'PREVIEW_FAILED'
  | 'EMPTY_SCOPE'
  | 'TOKEN_SPENT'
  | 'MUST_RESTART'
  // expiries — the ask matches, but what it was confirmed against has moved
  | 'SCOPE_MOVED'
  | 'TRANSFORM_CHANGED'
  | 'CONFIRMATION_AGED_OUT'
  | 'SESSION_BOUNDARY'
  | 'SUPERSEDED_BY_ANOTHER_RUN'
  | 'RUN_FAILED_MIDWAY'
  | 'OK';

export interface Outcome {
  verdict: Verdict;
  code: BlockCode;
  summary: string;
  /** Expected vs observed, and exactly what moved. Never a bare "stale". */
  detail: string[];
  /** The single next action that unblocks the human. */
  nextAction: string;
}

export interface GuardResult {
  model: GuardModel;
  outcome: Outcome;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(model: GuardModel, action: GuardAction, env: GuardEnv): GuardResult {
  switch (action.kind) {
    case 'request':
      return onRequest(model, action.operation, action.selector, env);
    case 'preview':
      return onPreview(model, action.preview, env);
    case 'confirm':
      return onConfirm(model, action.tokenId, env);
    case 'execute':
      return onExecute(model, action, env);
    case 'executionResult':
      return onExecutionResult(model, action.ok, action.note, env);
    case 'cancel':
      return onCancel(model, env);
    case 'externalExecution':
      return onExternalExecution(model, action.operation);
  }
}

function onRequest(model: GuardModel, operation: OperationName, selector: string, env: GuardEnv): GuardResult {
  if (env.attestation === 'model-initiated') {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'NO_EXPLICIT_REQUEST',
      summary: `${operation} is a manual-only operation and this invocation was model-initiated.`,
      detail: ['no explicit user request is on record for this turn'],
      nextAction: `ask the human to request ${operation} explicitly, then re-run the preview`,
    });
  }

  const restarting = model.state.phase === 'stale' || model.state.phase === 'failed' || model.state.phase === 'completed';
  const request: RequestBinding = {
    occurrence: model.requestOccurrences + 1,
    operation,
    selector,
    attestation: env.attestation,
    recordedAt: env.now,
  };
  return {
    model: { ...model, state: { phase: 'requested', request }, requestOccurrences: request.occurrence },
    outcome: {
      verdict: restarting ? 'RESTART' : 'RECORDED',
      code: 'OK',
      summary: `explicit request #${request.occurrence} recorded for ${operation} on '${selector}' (attestation: ${env.attestation}).`,
      detail:
        env.attestation === 'unknown'
          ? ['harness cannot attest explicit invocation; confirmation will require the human to echo the preview token']
          : [],
      nextAction: `compute a preview of ${operation}`,
    },
  };
}

/**
 * A preview is read-only, so it is never refused for authorization reasons —
 * it is refused only when it cannot honestly represent the scope. Minting the
 * token records the exact request occurrence that matches its operation and
 * selector. Ambient attestation is not authorization: a preview without that
 * binding remains read-only even when the current invocation is explicit.
 */
function onPreview(model: GuardModel, preview: Preview, env: GuardEnv): GuardResult {
  const restarting = model.state.phase === 'stale' || model.state.phase === 'failed' || model.state.phase === 'completed';

  if (preview.error) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'PREVIEW_FAILED',
      summary: `preview of ${preview.operation} could not be computed; no token minted.`,
      detail: [preview.error],
      nextAction: 'fix the unreadable source, then preview again',
    });
  }

  const request =
    model.state.phase === 'requested' &&
    model.state.request.operation === preview.operation &&
    model.state.request.selector === preview.selector
      ? model.state.request
      : null;

  const fp = fingerprint(preview);
  const token: PreviewToken = {
    id: tokenIdFor(fp, request?.occurrence ?? null),
    fingerprint: fp,
    operation: preview.operation,
    selector: preview.selector,
    transformVersion: preview.transformVersion,
    items: preview.items,
    complete: preview.complete,
    request,
    mintedAt: env.now,
    mintedInSession: env.sessionId,
    epochAtMint: model.ledger.epoch,
  };

  const warnings: string[] = [];
  if (!preview.complete) warnings.push('preview is TRUNCATED — part of the scope was never shown');
  if (preview.items.length === 0) warnings.push('preview is EMPTY — the operation would do nothing');

  return {
    model: { ...model, state: { phase: 'previewed', token } },
    outcome: {
      verdict: restarting ? 'RESTART' : 'RECORDED',
      code: 'OK',
      summary: `preview ${token.id} minted: ${preview.items.length} item(s), ${countDestructive(preview.items)} destructive.`,
      detail: warnings,
      nextAction: !request
        ? `record an explicit request for ${preview.operation} on '${preview.selector}', then preview again`
        : warnings.length
          ? 'this preview cannot be confirmed as-is; narrow the selector or fix the scope'
          : `confirm ${token.id} to authorize exactly this plan`,
    },
  };
}

function onConfirm(model: GuardModel, tokenId: string, env: GuardEnv): GuardResult {
  if (model.state.phase !== 'previewed') {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'NO_PREVIEW',
      summary: 'there is no outstanding preview to confirm.',
      detail: [`current phase: ${model.state.phase}`],
      nextAction: 'compute a preview first',
    });
  }

  const token = model.state.token;

  if (tokenId !== token.id) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'UNKNOWN_TOKEN',
      summary: `${tokenId} does not name the outstanding preview.`,
      detail: [`expected ${token.id}`, `received ${tokenId}`],
      nextAction: `confirm ${token.id}, or preview again if that is not the plan you saw`,
    });
  }

  if (!token.request) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'NO_EXPLICIT_REQUEST',
      summary: `${token.operation} is manual-only and no matching explicit request backs this preview.`,
      detail: [`previewed operation/scope: ${token.operation} on '${token.selector}'`],
      nextAction: `ask the human to request ${token.operation} on '${token.selector}', then preview again`,
    });
  }

  if (env.attestation === 'model-initiated') {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'SELF_CONFIRMED',
      summary: `${token.operation} is manual-only and the confirmation was model-initiated.`,
      detail: [`preview ${token.id} is bound to request #${token.request.occurrence}, but the agent cannot echo it for the human`],
      nextAction: `ask the human to confirm ${token.id}`,
    });
  }

  if (!token.complete) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'PREVIEW_INCOMPLETE',
      summary: 'the preview was truncated, so confirming it would authorize unseen work.',
      detail: [`${token.items.length} item(s) shown; the planner reported more`],
      nextAction: 'narrow the selector until the whole scope fits in one preview',
    });
  }

  if (token.items.length === 0) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'EMPTY_SCOPE',
      summary: `${token.operation} has nothing to do; there is nothing to authorize.`,
      detail: ['preview contained 0 planned items'],
      nextAction: 'widen the selector, or drop the operation',
    });
  }

  const degraded = token.request.attestation === 'unknown';
  return {
    model: {
      ...model,
      state: { phase: 'confirmed', token, confirmedAt: env.now, confirmedInSession: env.sessionId, degraded },
    },
    outcome: {
      verdict: 'RECORDED',
      code: 'OK',
      summary: `${token.id} confirmed; ${token.operation} is armed for exactly this plan.`,
      detail: degraded
        ? [`request #${token.request.occurrence}: harness could not attest human initiation (recorded as degraded)`]
        : [`bound to explicit request #${token.request.occurrence} for ${token.request.operation} on '${token.request.selector}'`],
      nextAction: `run ${token.operation} on ${token.selector}`,
    },
  };
}

/**
 * The gate. Two independent checks, in this order:
 *   1. identity — is the ask the same work that was confirmed?  (mismatch -> REFUSE)
 *   2. freshness — has that work moved since it was confirmed?  (moved   -> EXPIRE)
 * Freshness is re-verified here, against a preview observed *now*, because a
 * preview without a bound re-check at execute time is only advisory.
 */
function onExecute(
  model: GuardModel,
  action: { operation: OperationName; selector: string; observed: Preview },
  env: GuardEnv,
): GuardResult {
  const phase = model.state.phase;

  if (phase !== 'confirmed') {
    return blocked(model, notConfirmedOutcome(model, action.operation));
  }

  const { token, confirmedAt, confirmedInSession } = model.state;

  if (token.operation !== action.operation) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'OPERATION_MISMATCH',
      summary: `the outstanding confirmation authorizes ${token.operation}, not ${action.operation}.`,
      detail: [`confirmed operation: ${token.operation}`, `requested operation: ${action.operation}`],
      nextAction: `record a request for ${action.operation} on '${action.selector}', then preview and confirm it`,
    });
  }

  if (token.selector !== action.selector) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'SELECTOR_MISMATCH',
      summary: `the confirmation covers scope '${token.selector}', not '${action.selector}'.`,
      detail: [`confirmed scope: ${token.selector}`, `requested scope: ${action.selector}`],
      nextAction: `record a request for ${action.operation} on '${action.selector}', then preview and confirm it`,
    });
  }

  if (model.ledger.spent.includes(token.fingerprint)) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'TOKEN_SPENT',
      summary: `${token.id} has already authorized a run; confirmations are single-use.`,
      detail: ['replaying a confirmation cannot authorize a second execution'],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview again`,
    });
  }

  if (model.ledger.epoch !== token.epochAtMint) {
    return blocked(model, {
      verdict: 'EXPIRE',
      code: 'SUPERSEDED_BY_ANOTHER_RUN',
      summary: 'another manual operation completed after this preview was taken.',
      detail: [`preview taken at epoch ${token.epochAtMint}`, `bundle is now at epoch ${model.ledger.epoch}`],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview again`,
      into: { phase: 'stale', operation: token.operation, code: 'SUPERSEDED_BY_ANOTHER_RUN', detail: [] },
    });
  }

  if (model.config.sessionBinding && env.sessionId !== confirmedInSession) {
    return blocked(model, {
      verdict: 'EXPIRE',
      code: 'SESSION_BOUNDARY',
      summary: 'the confirmation was given in a different session and does not carry over.',
      detail: [`confirmed in session ${confirmedInSession}`, `running in session ${env.sessionId}`],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview and confirm it in this session`,
      into: { phase: 'stale', operation: token.operation, code: 'SESSION_BOUNDARY', detail: [] },
    });
  }

  if (model.config.ttlMs !== null && env.now - confirmedAt > model.config.ttlMs) {
    const ageS = Math.round((env.now - confirmedAt) / 1000);
    return blocked(model, {
      verdict: 'EXPIRE',
      code: 'CONFIRMATION_AGED_OUT',
      summary: `the confirmation is ${ageS}s old; the limit is ${Math.round(model.config.ttlMs / 1000)}s.`,
      detail: [`confirmed at t+${confirmedAt}`, `now t+${env.now}`],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview and confirm the current plan`,
      into: { phase: 'stale', operation: token.operation, code: 'CONFIRMATION_AGED_OUT', detail: [] },
    });
  }

  if (action.observed.error) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'PREVIEW_FAILED',
      summary: 'the current scope cannot be read, so the confirmation cannot be re-verified.',
      detail: [action.observed.error],
      nextAction: 'fix the unreadable source, then run again so the confirmed plan can be freshly re-verified',
    });
  }

  if (!action.observed.complete) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'PREVIEW_INCOMPLETE',
      summary: 'the fresh execute-time preview is incomplete, so the confirmation cannot be re-verified.',
      detail: [`${action.observed.items.length} current item(s) shown; the planner reported more`],
      nextAction: 'narrow the selector until a complete preview can be computed, then request, preview, and confirm again',
    });
  }

  if (action.observed.transformVersion !== token.transformVersion) {
    return blocked(model, {
      verdict: 'EXPIRE',
      code: 'TRANSFORM_CHANGED',
      summary: 'the transform changed after the plan was confirmed.',
      detail: [
        `confirmed transform: ${token.transformVersion}`,
        `current transform: ${action.observed.transformVersion}`,
      ],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview under ${action.observed.transformVersion} and confirm it`,
      into: { phase: 'stale', operation: token.operation, code: 'TRANSFORM_CHANGED', detail: [] },
    });
  }

  const observedFingerprint = fingerprint(action.observed);
  if (observedFingerprint !== token.fingerprint) {
    const drift = describeDrift(token.items, action.observed.items);
    return blocked(model, {
      verdict: 'EXPIRE',
      code: 'SCOPE_MOVED',
      summary: `the scope has changed since ${token.id} was confirmed; the confirmation no longer covers this work.`,
      detail: [
        `confirmed fingerprint ${token.fingerprint.slice(0, 12)}`,
        `observed  fingerprint ${observedFingerprint.slice(0, 12)}`,
        ...drift,
      ],
      nextAction: `record a fresh request for ${action.operation} on '${action.selector}', then preview and confirm the current plan`,
      into: { phase: 'stale', operation: token.operation, code: 'SCOPE_MOVED', detail: drift },
    });
  }

  if (action.observed.items.length === 0) {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'EMPTY_SCOPE',
      summary: `${action.operation} has nothing to do.`,
      detail: ['the current plan contains 0 items'],
      nextAction: 'no action needed',
    });
  }

  return {
    model: {
      ...model,
      state: { phase: 'executing', token },
      ledger: { ...model.ledger, spent: [...model.ledger.spent, token.fingerprint] },
    },
    outcome: {
      verdict: 'ALLOW',
      code: 'OK',
      summary: `${action.operation} authorized by ${token.id}: ${token.items.length} item(s), ${countDestructive(token.items)} destructive.`,
      detail: [`fingerprint ${token.fingerprint.slice(0, 12)} re-verified against the live scope`],
      nextAction: 'execute, then report the result back to the guard',
    },
  };
}

/**
 * Execution reports back. A failed run leaves the bundle in neither the
 * pre- nor the post-state, so the confirmation is dead even if a rollback later
 * restores a byte-identical corpus — the token is already spent.
 */
function onExecutionResult(model: GuardModel, ok: boolean, note: string, env: GuardEnv): GuardResult {
  if (model.state.phase !== 'executing') {
    return blocked(model, {
      verdict: 'REFUSE',
      code: 'MUST_RESTART',
      summary: 'no execution is in flight, so there is no result to record.',
      detail: [`current phase: ${model.state.phase}`],
      nextAction: 'start from a request and a preview',
    });
  }

  const operation = model.state.token.operation;
  if (ok) {
    return {
      model: {
        ...model,
        state: { phase: 'completed', operation, at: env.now },
        ledger: { ...model.ledger, epoch: model.ledger.epoch + 1 },
      },
      outcome: {
        verdict: 'RECORDED',
        code: 'OK',
        summary: `${operation} completed; all outstanding previews are now obsolete.`,
        detail: [`bundle epoch is now ${model.ledger.epoch + 1}`],
        nextAction: 'post-operation verification (outside the guard)',
      },
    };
  }

  return {
    model: { ...model, state: { phase: 'failed', operation, at: env.now, note } },
    outcome: {
      verdict: 'RECORDED',
      code: 'RUN_FAILED_MIDWAY',
      summary: `${operation} failed partway; the bundle is in neither the pre- nor the post-state.`,
      detail: [note, 'the spent confirmation cannot authorize a resume'],
      nextAction: `roll back or repair, then record a fresh request and preview ${operation} again`,
    },
  };
}

function onCancel(model: GuardModel, _env: GuardEnv): GuardResult {
  const had = model.state.phase;
  return {
    model: { ...model, state: { phase: 'idle' } },
    outcome: {
      verdict: 'CANCEL',
      code: 'OK',
      summary: `cancelled from ${had}; any outstanding preview and confirmation are discarded.`,
      detail: ['a cancelled confirmation is destroyed, never parked for later reuse'],
      nextAction: 'start again from an explicit request',
    },
  };
}

function onExternalExecution(model: GuardModel, operation: OperationName): GuardResult {
  return {
    model: { ...model, ledger: { ...model.ledger, epoch: model.ledger.epoch + 1 } },
    outcome: {
      verdict: 'RECORDED',
      code: 'OK',
      summary: `another session completed ${operation}; bundle epoch is now ${model.ledger.epoch + 1}.`,
      detail: ['every confirmation minted before this run is now obsolete'],
      nextAction: 'nothing; outstanding confirmations will expire when used',
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BlockedOutcome extends Outcome {
  into?: GuardState;
}

function blocked(model: GuardModel, outcome: BlockedOutcome): GuardResult {
  const { into, ...rest } = outcome;
  return { model: into ? { ...model, state: into } : model, outcome: rest };
}

function notConfirmedOutcome(model: GuardModel, operation: OperationName): BlockedOutcome {
  const state = model.state;
  switch (state.phase) {
    case 'idle':
      return {
        verdict: 'REFUSE',
        code: 'NO_EXPLICIT_REQUEST',
        summary: `${operation} is manual-only and nothing authorizes it: no request, no preview, no confirmation.`,
        detail: [],
        nextAction: `ask the human to request ${operation}, then preview it`,
      };
    case 'requested':
      return {
        verdict: 'REFUSE',
        code: 'NO_PREVIEW',
        summary: `${operation} was requested but never previewed.`,
        detail: ['a manual-only operation cannot run against an unseen scope'],
        nextAction: `preview ${operation}`,
      };
    case 'previewed':
      return {
        verdict: 'REFUSE',
        code: 'NOT_CONFIRMED',
        summary: `preview ${state.token.id} is outstanding but was never confirmed.`,
        detail: [`${state.token.items.length} item(s) awaiting confirmation`],
        nextAction: `confirm ${state.token.id}`,
      };
    case 'stale':
      return {
        verdict: 'REFUSE',
        code: 'MUST_RESTART',
        summary: `the last confirmation for ${state.operation} expired (${state.code}) and was not replaced.`,
        detail: state.detail,
        nextAction: `record a fresh request for ${state.operation}, then preview and confirm the current plan`,
      };
    case 'executing':
      return {
        verdict: 'REFUSE',
        code: 'MUST_RESTART',
        summary: `${state.token.operation} is already running under ${state.token.id}.`,
        detail: [],
        nextAction: 'wait for the run to report its result',
      };
    case 'completed':
      return {
        verdict: 'REFUSE',
        code: 'TOKEN_SPENT',
        summary: `${state.operation} already completed; its confirmation is spent.`,
        detail: [],
        nextAction: `record a fresh request for ${operation}, then preview again to see whether anything is still to do`,
      };
    case 'failed':
      return {
        verdict: 'REFUSE',
        code: 'RUN_FAILED_MIDWAY',
        summary: `${state.operation} failed partway and its confirmation is spent.`,
        detail: [state.note],
        nextAction: `roll back or repair, then record a fresh request and preview ${operation} again`,
      };
  }
}

/** One-screen description of why the operation is, or is not, authorized. */
export function explainAuthorization(model: GuardModel): string[] {
  const s = model.state;
  switch (s.phase) {
    case 'idle':
      return ['no manual-only operation is authorized (no request on record)'];
    case 'requested':
      return [
        `${s.request.operation} on '${s.request.selector}' requested as #${s.request.occurrence} (attestation: ${s.request.attestation}) — no preview yet`,
      ];
    case 'previewed':
      return [
        `${s.token.operation} previewed as ${s.token.id} on '${s.token.selector}' — awaiting confirmation`,
        `${s.token.items.length} item(s), ${countDestructive(s.token.items)} destructive, transform ${s.token.transformVersion}`,
        s.token.request
          ? `bound to request #${s.token.request.occurrence} for ${s.token.request.operation} on '${s.token.request.selector}'`
          : 'no matching explicit request is bound; this preview cannot be confirmed',
      ];
    case 'confirmed':
      return [
        `${s.token.operation} ARMED by ${s.token.id} on '${s.token.selector}'${s.degraded ? ' (degraded attestation)' : ''}`,
        `bound to fingerprint ${s.token.fingerprint.slice(0, 12)} — re-verified at run time`,
      ];
    case 'executing':
      return [`${s.token.operation} executing under ${s.token.id}`];
    case 'completed':
      return [`${s.operation} completed; nothing is authorized`];
    case 'failed':
      return [`${s.operation} failed partway: ${s.note}; nothing is authorized`];
    case 'stale':
      return [`${s.operation} blocked: ${s.code}`, ...s.detail];
  }
}
