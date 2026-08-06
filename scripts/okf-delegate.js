const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const delegation = require('./lib/delegation');

const NEXT_ACTION = 'Retry the delegated request or escalate to a human.';

function emit(value) {
  process.stdout.write(JSON.stringify(value) + '\n');
}

function dispatchFinding(code, skill, extra) {
  return { code, origin: 'suite', severity: 'error', blocks: true, detail: { gate: 'delegation', skill, ...extra } };
}

function dispatch(request) {
  const skill = request.skill;
  const wrapperPath = path.join(__dirname, `${skill}.js`);
  if (!fs.existsSync(wrapperPath)) {
    return { status: 'blocked: missing-skill', findings: [dispatchFinding('MISSING_SKILL', skill)], next_action: NEXT_ACTION };
  }
  const result = childProcess.spawnSync(process.execPath, [wrapperPath], {
    input: JSON.stringify(request), encoding: 'utf8',
  });
  let response = null;
  try { response = JSON.parse(result.stdout); } catch { response = null; }
  if (result.signal || !response) {
    return { status: 'indeterminate', findings: [dispatchFinding('DELEGATED_DISPATCH_FAILED', skill, { signal: result.signal, exit_code: result.status })], next_action: NEXT_ACTION };
  }
  if (response.protocol !== 'okf-wrapper/1') {
    return { status: 'blocked: incompatible-skill', findings: [dispatchFinding('INCOMPATIBLE_SKILL', skill)], next_action: NEXT_ACTION };
  }
  return response;
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let brief;
    try {
      brief = JSON.parse(input);
    } catch {
      process.stderr.write('Invalid wrapper input\n');
      process.exitCode = 64;
      return;
    }
    try {
      const validated = delegation.validateBrief(brief);
      const response = validated.ok ? dispatch(validated.request) : validated;
      emit(delegation.receipt(brief, response));
      process.exitCode = 0;
    } catch (error) {
      try {
        emit(delegation.receipt(brief, { status: 'indeterminate', findings: [dispatchFinding('DELEGATION_INTERNAL_FAILURE', null, { reason: error && error.message })] }));
      } catch {}
      process.stderr.write(`Delegation failure: ${(error && error.message) || String(error)}\n`);
      process.exitCode = 70;
    }
  });
}

main();
