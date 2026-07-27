/**
 * PROTOTYPE — throwaway terminal shell over the manual-operation guard.
 *
 * Run:  node prototypes/manual-operation-guard/tui.ts
 *
 * The whole authorization state is re-rendered after every keystroke, so the
 * question "why is this blocked?" is always answered on screen.
 */

import readline from 'node:readline';
import { createWorld, explainAuthorization, livePlan, step, type World } from './driver.ts';
import { countDestructive } from './guard.ts';

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

let world: World = createWorld();

function verdictColor(verdict: string): string {
  if (verdict === 'ALLOW') return GREEN;
  if (verdict === 'REFUSE' || verdict === 'EXPIRE') return RED;
  if (verdict === 'CANCEL' || verdict === 'RESTART') return YELLOW;
  return '';
}

function render(): void {
  console.clear();
  const g = world.guard;
  const cfg = g.config;

  console.log(`${B}MANUAL-OPERATION GUARD${R} ${D}prototype · Prototype the portable manual-operation guard state machine${R}`);
  console.log(
    `${D}t+${world.now / 60000}min · ${world.sessionId} · epoch ${g.ledger.epoch} · spent confirmations ${g.ledger.spent.length}${R}`,
  );
  console.log(
    `${D}optional adapters: ttl=${cfg.ttlMs === null ? 'off' : `${cfg.ttlMs / 60000}min`} · session-binding=${cfg.sessionBinding ? 'on' : 'off'}${R}`,
  );
  console.log('');

  console.log(`${B}Invocation${R}`);
  console.log(`  operation    ${world.operation}`);
  console.log(`  scope        ${world.selector}`);
  console.log(
    `  attestation  ${world.attestation}${world.attestation === 'unknown' ? ` ${D}(harness cannot tell — e.g. OpenCode)${R}` : ''}`,
  );
  console.log('');

  console.log(`${B}Corpus${R} ${D}transform ${world.corpus.transformVersion}${R}`);
  for (const f of world.corpus.files.slice(0, 8)) {
    console.log(`  ${f.path.padEnd(28)} ${D}${f.content.slice(0, 30).padEnd(30)} mtime ${f.mtime}${R}`);
  }
  if (world.corpus.files.length > 8) console.log(`  ${D}… ${world.corpus.files.length - 8} more${R}`);
  if (world.corpus.files.length === 0) console.log(`  ${D}(empty)${R}`);
  console.log('');

  const plan = livePlan(world);
  console.log(`${B}Live plan${R} ${D}recomputed every frame${R}`);
  if (plan.error) {
    console.log(`  ${RED}${plan.error}${R}`);
  } else if (plan.items.length === 0) {
    console.log(`  ${D}nothing to do${R}`);
  } else {
    for (const i of plan.items.slice(0, 6)) console.log(`  ${i.action.padEnd(7)} ${i.risk.padEnd(12)} ${i.path}`);
    if (plan.items.length > 6) console.log(`  ${D}… ${plan.items.length - 6} more${R}`);
    console.log(`  ${D}${plan.items.length} item(s), ${countDestructive(plan.items)} destructive${R}`);
    if (!plan.complete) console.log(`  ${YELLOW}TRUNCATED — part of this scope was never shown${R}`);
  }
  console.log('');

  console.log(`${B}Authorization state${R} ${B}[${g.state.phase}]${R}`);
  for (const line of explainAuthorization(g)) console.log(`  ${line}`);
  console.log('');

  console.log(`${B}Last action${R} ${D}${world.lastAction}${R}`);
  if (world.last) {
    const c = verdictColor(world.last.verdict);
    console.log(`  ${c}${B}${world.last.verdict}${R} ${D}${world.last.code}${R}  ${world.last.summary}`);
    for (const d of world.last.detail) console.log(`    ${D}· ${d}${R}`);
    console.log(`    ${B}next:${R} ${world.last.nextAction}`);
  }
  console.log('');

  console.log(
    [
      `${B}[1-4]${R}${D}operation${R}  ${B}[s]${R}${D}scope${R}  ${B}[A]${R}${D}attestation${R}`,
      `${B}[a]${R}${D}ask${R} ${B}[p]${R}${D}preview${R} ${B}[c]${R}${D}confirm${R} ${B}[C]${R}${D}confirm-forged${R} ${B}[r]${R}${D}run${R} ${B}[k]${R}${D}run-ok${R} ${B}[f]${R}${D}run-failed${R} ${B}[x]${R}${D}cancel${R}`,
      `${B}[n]${R}${D}add${R} ${B}[e]${R}${D}edit${R} ${B}[D]${R}${D}deprecate${R} ${B}[d]${R}${D}delete${R} ${B}[v]${R}${D}move${R} ${B}[t]${R}${D}touch${R} ${B}[B]${R}${D}corrupt${R} ${B}[E]${R}${D}empty${R} ${B}[G]${R}${D}grow×20${R} ${B}[U]${R}${D}bump-transform${R}`,
      `${B}[o]${R}${D}other-session-runs${R} ${B}[T]${R}${D}+20min${R} ${B}[S]${R}${D}new-session${R} ${B}[w]${R}${D}ttl${R} ${B}[b]${R}${D}session-binding${R} ${B}[q]${R}${D}quit${R}`,
    ].join('\n'),
  );
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
  if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    console.clear();
    process.exit(0);
  }
  world = step(world, key.sequence ?? str);
  render();
});

render();
