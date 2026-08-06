const services = require('./lib/services');
const adapters = require('./lib/adapters');
const wrapper = require('./wrapper');

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function main(argv) {
  const [action, harness, targetDir] = argv;
  if (!['install', 'disable', 'uninstall'].includes(action) || !adapters.harnesses.has(harness) || typeof targetDir !== 'string' || targetDir === '') {
    emit({ ok: false, code: 'INVALID_ARGS' });
    process.exitCode = 64;
    return;
  }

  let outcome;
  try {
    outcome = adapters[action](harness, targetDir, services);
  } catch (error) {
    emit({ ok: false, code: 'ADAPTER_CLI_FAILURE' });
    process.stderr.write(`${wrapper.diagnostic(error, 'internal failure')}\n`);
    process.exitCode = 70;
    return;
  }

  emit(outcome);
  process.exitCode = outcome.ok ? 0 : 1;
}

main(process.argv.slice(2));
