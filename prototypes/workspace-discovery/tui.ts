/**
 * PROTOTYPE — one-command terminal shell. Renders the whole resolution after every key,
 * so nothing about the decision is hidden between frames.
 *
 *   node prototypes/workspace-discovery/tui.ts
 */

import * as readline from 'node:readline';
import { currentResolution, createWorld, explainScope, namedPath, step, type World } from './driver.ts';
import type { Entry, Verdict } from './discovery.ts';

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

let world: World = createWorld();

function colorFor(v: Verdict): string {
  if (v === 'ROUTE') return GREEN;
  if (v === 'REFUSE') return RED;
  if (v === 'CLIP' || v === 'INCOMPLETE' || v === 'FLAG') return YELLOW;
  return '';
}

function entryLine(e: Entry): string {
  const d = e.distance === Infinity ? 'peer' : `d=${e.distance}`;
  const gates = e.failed.length > 0 ? ` ${RED}${e.failed.join('+')}${R}` : '';
  return `  ${D}${d.padEnd(5)}${R} ${e.status.padEnd(16)} ${e.path}${gates} ${D}${e.code === 'OK' ? e.source : e.code}${R}`;
}

function render(): void {
  console.clear();
  const r = currentResolution(world);
  const a = world.auth;

  console.log(`${B}WORKSPACE DISCOVERY${R} ${D}prototype · wayfinder #27${R}`);
  console.log(`${D}${world.fixture.name}${R}`);
  console.log(`${D}${world.fixture.note}${R}`);
  console.log('');

  console.log(`${B}Session${R}`);
  console.log(`  cwd        ${world.cwd}`);
  console.log(`  named      ${namedPath(world)} ${D}(the path [x] adjudicates)${R}`);
  console.log(
    `  harness    ${a.harness}  ${D}symlink=${a.symlinkPolicy} allowlist=${a.allowlist.join(',') || 'none'} grants=${a.grants.join(',') || 'none'} peer-scan=${a.peerScan}${R}`,
  );
  console.log(
    `  authority  ${D}root=${a.selectedRoot ?? 'none'} manifest-on-disk=${world.fs.manifestAt ?? 'none'} supplied=${a.manifestSupplied} schema=${world.fs.manifest?.schemaVersion ?? '-'}${R}`,
  );
  console.log(`  trusted    ${D}${a.trusted.join(', ') || 'none (the current repository needs no grant)'}${R}`);
  console.log('');

  console.log(`${B}Scope${R} ${D}[${r.phase}]${R}`);
  for (const line of explainScope(r)) console.log(`  ${line}`);
  console.log('');

  console.log(`${B}Bundles${R} ${D}recomputed every frame${R}`);
  if (r.admitted.length === 0) console.log(`  ${D}(none admitted)${R}`);
  for (const e of [...r.admitted, ...r.refused]) {
    console.log(entryLine(e));
    if (e.note) console.log(`         ${D}${e.note}${R}`);
  }
  if (r.undisclosed > 0) {
    console.log(`  ${D}${r.undisclosed} path(s) beyond the boundary were not examined and are not named here${R}`);
  }
  for (const note of r.anomalies) console.log(`  ${YELLOW}anomaly${R} ${note}`);
  console.log('');

  console.log(`${B}Routing${R}`);
  console.log(`  read       ${r.admitted.length} bundle(s), nearest first · ${r.complete ? 'complete' : `${YELLOW}incomplete${R}`}`);
  console.log(`  write      ${r.writeTarget ? r.writeTarget.path : `${RED}${r.writeCode}${R}`}`);
  console.log(`  cache      ${D}proposed(§7.2)=${r.docCacheKey}  with-trust-and-links=${r.cacheKey}${R}`);
  console.log('');

  console.log(`${B}Last action${R} ${D}${world.lastAction}${R}`);
  if (world.last) {
    const c = colorFor(world.last.verdict);
    console.log(`  ${c}${B}${world.last.verdict}${R} ${D}${world.last.code}${R}  ${world.last.summary}`);
    for (const d of world.last.detail) console.log(`    ${D}· ${d}${R}`);
    console.log(`    ${B}next:${R} ${world.last.nextAction}`);
  }
  console.log('');

  console.log(
    [
      `${D}fixtures${R} ${B}[1-8]${R}${D}topology${R}  ${B}[n/p]${R}${D}cd${R}  ${B}[e]${R}${D}named path${R}`,
      `${D}query   ${R} ${B}[r]${R}${D}read scope${R}  ${B}[w]${R}${D}route a write${R}  ${B}[x]${R}${D}reach the named path${R}`,
      `${D}scope   ${R} ${B}[b/B]${R}${D}select/clear root${R}  ${B}[m]${R}${D}manifest supplied${R}  ${B}[M]${R}${D}manifest on disk${R}  ${B}[V]${R}${D}schema major${R}  ${B}[o]${R}${D}peer scan${R}`,
      `${D}trust   ${R} ${B}[t]${R}${D}trust named${R}  ${B}[T]${R}${D}trust all${R}  ${B}[u]${R}${D}revoke${R}  ${B}[s]${R}${D}symlink policy${R}  ${B}[a]${R}${D}allowlist /opt${R}`,
      `${D}access  ${R} ${B}[h]${R}${D}harness${R}  ${B}[g/G]${R}${D}grant/revoke${R}`,
      `${D}world   ${R} ${B}[c]${R}${D}clone missing${R}  ${B}[d]${R}${D}drop bundle${R}  ${B}[k]${R}${D}move repo${R}  ${B}[K]${R}${D}swap identity${R}  ${B}[L]${R}${D}retarget links${R}  ${B}[H]${R}${D}checkout${R}  ${B}[f]${R}${D}edit bundle${R}  ${B}[q]${R}${D}quit${R}`,
    ].join('\n'),
  );
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
  if (key?.name === 'q' || (key?.ctrl && key?.name === 'c')) {
    console.clear();
    process.exit(0);
  }
  world = step(world, key?.sequence ?? str);
  render();
});

render();
