// The eval runner's case-result shape.
//
// Every case ends in exactly one of three states:
// - pass    — the case ran and its assertions held.
// - fail    — the case ran and an assertion or an unexpected error occurred.
// - blocked — the case could not run to a real answer for a reason outside
//             the case's own logic (today: no model provider credential).
//
// A blocked case is not a failure of this repository's product. It is an
// honest, recorded gap in what this environment can currently prove.

export class BlockedCase extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedCase';
  }
}

export async function runCase(caseDef, fn) {
  const record = {
    id: caseDef.id,
    kind: caseDef.kind,
    description: caseDef.description,
    status: 'pass',
    detail: null,
  };
  try {
    await fn();
  } catch (error) {
    record.status = error instanceof BlockedCase ? 'blocked' : 'fail';
    record.detail = error instanceof Error ? error.message : String(error);
  }
  return record;
}
