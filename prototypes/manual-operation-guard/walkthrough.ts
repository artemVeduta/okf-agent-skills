/**
 * PROTOTYPE — scripted walkthrough of the guard's hard cases.
 *
 * Run:  node prototypes/manual-operation-guard/walkthrough.ts
 *
 * This is not a test suite: it is the same keystroke path a human drives in
 * tui.ts, replayed so the whole catalogue can be read in one screen. Each row
 * states the expected verdict; a `MISMATCH` row is the interesting one — it
 * means the idea, not the code, needs a decision.
 */

import { createWorld, step, type World } from './driver.ts';
import type { BlockCode, Verdict } from './guard.ts';

interface Scenario {
  name: string;
  keys: string;
  expect: `${Verdict} ${BlockCode}`;
  why: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'baseline: request + preview + confirm', keys: 'apcr', expect: 'ALLOW OK', why: 'only the full triple authorizes' },
  { name: 'file added under the confirmation', keys: 'apcnr', expect: 'EXPIRE SCOPE_MOVED', why: 'unseen work must never ride along' },
  { name: 'file edited in place (same count)', keys: 'apcer', expect: 'EXPIRE SCOPE_MOVED', why: 'fingerprint is content-based, not count-based' },
  { name: 'file moved, content identical', keys: 'apcvr', expect: 'EXPIRE SCOPE_MOVED', why: 'path/content sameness is undecided (#22/#24)' },
  { name: 'mtime-only touch', keys: 'apctr', expect: 'ALLOW OK', why: 'expiring on noise trains blind reconfirmation' },
  { name: 'confirmation reused for another operation', keys: 'apc4r', expect: 'REFUSE OPERATION_MISMATCH', why: 'confirmation binds the operation' },
  { name: 'scope widened after confirmation', keys: 'sapcssr', expect: 'REFUSE SELECTOR_MISMATCH', why: 'a superset is unpreviewed work' },
  { name: 'scope narrowed after confirmation', keys: 'apcsr', expect: 'REFUSE SELECTOR_MISMATCH', why: 'a subset changes the destructive set' },
  { name: 'risk reclassified (MOVE becomes DELETE)', keys: 'apcDr', expect: 'EXPIRE SCOPE_MOVED', why: 'the plan is fingerprinted, not just the inputs' },
  { name: 'confirmation aged out (ttl adapter on)', keys: 'apcTr', expect: 'EXPIRE CONFIRMATION_AGED_OUT', why: 'staleness is shown as a number' },
  { name: 'session / context boundary crossed', keys: 'apcSr', expect: 'EXPIRE SESSION_BOUNDARY', why: 'the confirming human may be gone' },
  { name: 'model-initiated request', keys: 'AAa', expect: 'REFUSE NO_EXPLICIT_REQUEST', why: 'manual-only means human-initiated' },
  { name: 'model-initiated preview, self-confirmed', keys: 'AApc', expect: 'REFUSE SELF_CONFIRMED', why: 'the agent cannot supply both halves' },
  { name: 'requested but never previewed', keys: 'ar', expect: 'REFUSE NO_PREVIEW', why: 'no run against an unseen scope' },
  { name: 'confirming a token that was never minted', keys: 'apC', expect: 'REFUSE UNKNOWN_TOKEN', why: 'blocks forged / hallucinated ids' },
  { name: 'cancel, then re-invoke', keys: 'apcxr', expect: 'REFUSE NO_EXPLICIT_REQUEST', why: 'cancel destroys, never parks' },
  { name: 'restart after an expiry', keys: 'apcerpcr', expect: 'ALLOW OK', why: 'every refusal has a reachable recovery' },
  { name: 'replay after a successful run', keys: 'apcrkr', expect: 'REFUSE TOKEN_SPENT', why: 'confirmations are single-use' },
  { name: 'retry after a run failed midway', keys: 'apcrfr', expect: 'REFUSE RUN_FAILED_MIDWAY', why: 'the bundle is in neither state' },
  { name: 'another session ran first', keys: 'apcor', expect: 'EXPIRE SUPERSEDED_BY_ANOTHER_RUN', why: 'last-write-wins is caught here or nowhere' },
  { name: 'empty scope', keys: '4aEpc', expect: 'REFUSE EMPTY_SCOPE', why: 'a silent no-op must not report success' },
  { name: 'truncated preview (24 files)', keys: 'Gapc', expect: 'REFUSE PREVIEW_INCOMPLETE', why: 'confirming unseen scope breaks the invariant' },
  { name: 'preview cannot be computed', keys: 'aBp', expect: 'REFUSE PREVIEW_FAILED', why: 'no manifest, no token' },
  { name: 'transform version bumped after confirmation', keys: 'apcUr', expect: 'EXPIRE TRANSFORM_CHANGED', why: 'work identity includes the transform' },
  { name: 'init over a non-empty bundle', keys: '1apcr', expect: 'ALLOW OK', why: 'init is scoped work, not a special case' },
  { name: 'unknown attestation (OpenCode floor)', keys: 'Aapcr', expect: 'ALLOW OK', why: 'degraded attestation is recorded, not fatal' },
  { name: 'no adapters: ttl + session binding off', keys: 'wbapcTSr', expect: 'ALLOW OK', why: 'the machine stays correct on the portable floor' },
  { name: 'no adapters, but the scope moved', keys: 'wbapcTSer', expect: 'EXPIRE SCOPE_MOVED', why: 'content binding is the only portable guard' },
];

function drive(keys: string): World {
  let world = createWorld();
  for (const key of keys) world = step(world, key);
  return world;
}

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

let mismatches = 0;

console.log(`${B}MANUAL-OPERATION GUARD — scripted walkthrough (wayfinder #29)${R}\n`);

for (const scenario of SCENARIOS) {
  const world = drive(scenario.keys);
  const actual = world.last ? `${world.last.verdict} ${world.last.code}` : 'NONE';
  const ok = actual === scenario.expect;
  if (!ok) mismatches++;

  console.log(`${ok ? `${GREEN}✓${R}` : `${RED}MISMATCH${R}`} ${B}${scenario.name}${R}`);
  console.log(`  ${D}keys${R} ${scenario.keys.split('').join(' ')}   ${D}phase${R} ${world.guard.state.phase}`);
  console.log(`  ${D}expected${R} ${scenario.expect}   ${D}actual${R} ${ok ? actual : `${RED}${actual}${R}`}`);
  if (world.last) {
    console.log(`  ${world.last.summary}`);
    for (const d of world.last.detail.slice(0, 3)) console.log(`    ${D}· ${d}${R}`);
    console.log(`    ${D}next:${R} ${world.last.nextAction}`);
  }
  console.log(`  ${D}defends: ${scenario.why}${R}\n`);
}

console.log(
  `${B}${SCENARIOS.length - mismatches}/${SCENARIOS.length}${R} scenarios behaved as designed` +
    (mismatches ? ` ${RED}(${mismatches} need a decision)${R}` : ''),
);
