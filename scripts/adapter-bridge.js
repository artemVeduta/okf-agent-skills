const childProcess = require('node:child_process');
const path = require('node:path');
const orientation = require('./lib/orientation');

const harnesses = orientation.validHarnesses;
const wrappers = new Map([
  ['okf-read', 'okf-read.js'],
  ['okf-write', 'okf-write.js'],
]);

function main(argv) {
  const [harness, skill] = argv;
  const wrapper = wrappers.get(skill);
  if (!harnesses.has(harness) || !wrapper) {
    process.stderr.write('Unsupported adapter bridge request\n');
    process.exitCode = 64;
    return;
  }

  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, wrapper)], { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write('Adapter bridge failure\n');
  }
  process.exitCode = result.error || result.status === null ? 70 : result.status;
}

main(process.argv.slice(2));
