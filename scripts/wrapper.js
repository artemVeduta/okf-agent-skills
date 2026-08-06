const protocol = require('./lib/protocol');
const runtime = require('./lib/runtime');

function diagnostic(error, fallback) {
  const text = error && typeof error.message === 'string' ? error.message : String(error || '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;
}

function emit(response) {
  process.stdout.write(protocol.serializeResponse(response) + '\n');
}

function main(skill, services) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let request;
    try {
      request = protocol.parseRequest(input, skill);
    } catch (error) {
      process.stderr.write(diagnostic(error, 'Invalid wrapper input') + '\n');
      process.exitCode = 64;
      return;
    }

    try {
      const response = runtime.run(skill, request, services);
      if (response !== null) emit(response);
      process.exitCode = 0;
    } catch (error) {
      try { emit(runtime.respond(request, 'failed/incomplete', { code: 'RUNTIME_FAILURE' }, [])); } catch {}
      process.stderr.write(`Runtime failure: ${diagnostic(error, 'internal failure')}\n`);
      process.exitCode = 70;
    }
  });
}

module.exports = { diagnostic, main };
