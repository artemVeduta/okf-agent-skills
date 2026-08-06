// Classifies a finished wrapper-process run into the three exit conditions
// every skill's SKILL.md documents under "Exit conditions":
//
// 1. valid response      — exit 0, exactly one JSON line on stdout.
// 2. invalid wrapper input — exit 64, nothing on stdout, a diagnostic on stderr.
// 3. internal failure    — exit 70, one complete response still on stdout,
//                           a diagnostic on stderr.
//
// This function takes a plain { status, stdout, stderr } record — the same
// shape node:child_process.spawnSync returns — so it works equally against
// a real spawned wrapper and against a literal fixture.

function onlyJsonLine(stdout) {
  const lines = stdout.split('\n').filter((line) => line.length > 0);
  if (lines.length !== 1) {
    throw new Error(`expected exactly one JSON line on stdout, got ${lines.length}`);
  }
  return JSON.parse(lines[0]);
}

export function classifyWrapperExit({ status, stdout, stderr }) {
  if (status === 0) {
    return { exitClass: 'valid-response', response: onlyJsonLine(stdout) };
  }
  if (status === 64) {
    if (stdout !== '') {
      throw new Error('expected nothing on stdout for invalid wrapper input');
    }
    return { exitClass: 'invalid-input', diagnostic: stderr.trim() };
  }
  if (status === 70) {
    return { exitClass: 'internal-failure', response: onlyJsonLine(stdout), diagnostic: stderr.trim() };
  }
  throw new Error(`exit code ${status} is none of the three documented exit conditions (0, 64, 70)`);
}
