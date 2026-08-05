const childProcess = require('node:child_process');
const path = require('node:path');

const harnesses = new Set(['claude-code', 'codex', 'opencode']);
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

  const child = childProcess.spawn(process.execPath, [path.join(__dirname, wrapper)], { stdio: ['pipe', 'pipe', 'pipe'] });
  process.stdin.pipe(child.stdin);
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', () => {
    process.stderr.write('Adapter bridge failure\n');
    process.exitCode = 70;
  });
  child.on('close', (code) => { process.exitCode = code === null ? 70 : code; });
}

main(process.argv.slice(2));
