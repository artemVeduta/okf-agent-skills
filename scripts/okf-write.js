/*
Wrapper that reads one JSON request from stdin and emits one JSON response on stdout.
*/

const protocol = require('./lib/protocol');
const runtime = require('./lib/runtime');
const services = require('./lib/services');

function emit(response) {
  process.stdout.write(protocol.serializeResponse(response) + '\n');
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  let request;
  try {
    request = protocol.parseRequest(input, 'okf-write');
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exitCode = 64;
    return;
  }

  try {
    emit(runtime.run('okf-write', request, services));
    process.exitCode = 0;
  } catch {
    emit(runtime.respond(request, 'failed/incomplete', { code: 'RUNTIME_FAILURE' }, []));
    process.exitCode = 70;
  }
});
