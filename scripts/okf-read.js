/*
Wrapper that reads one JSON request from stdin and emits one JSON response on stdout.
*/

const fs = require('fs');
const path = require('path');
const protocol = require('./lib/protocol');
const runtime = require('./lib/runtime');
const admission = require('./lib/admission');

function gitRootOf(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

const services = {
  exists: fs.existsSync,
  realpath: fs.realpathSync,
  isLink,
  gitRootOf,
};

function emit(response) {
  process.stdout.write(protocol.serializeResponse(response) + '\n');
}

function respond(request, result, data, findings) {
  const response = runtime.respond(request, result, data, findings);
  response.next_action = 'TRUST and ACCESS are not implemented in this slice';
  return response;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  let request;
  try {
    request = protocol.parseRequest(input, 'okf-read');
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exitCode = 64;
    return;
  }

  try {
    if (request.operation !== 'admit') {
      emit(respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []));
    } else {
      const outcome = admission.admit(request, services);
      emit(respond(request, outcome.result, outcome.data, outcome.findings));
    }
    process.exitCode = 0;
  } catch {
    emit(respond(request, 'failed/incomplete', { code: 'RUNTIME_FAILURE' }, []));
    process.exitCode = 70;
  }
});
