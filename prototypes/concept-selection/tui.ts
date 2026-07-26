/**
 * PROTOTYPE — one-command terminal shell. Renders the whole budget and the whole selection after
 * every key, so nothing about the spend is hidden between frames.
 *
 *   node prototypes/concept-selection/tui.ts
 */

import * as readline from 'node:readline';
import { INITIAL, KEYS, run, step, type World } from './driver.ts';
import { FIXTURES } from './corpus.ts';
import type { Entry, Plan, SpendLine, Verdict } from './selection.ts';

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

let world: World = INITIAL;

const VERDICT_COLOR: Record<Verdict, string> = {
  PINNED: BLUE,
  SELECTED: GREEN,
  CLIPPED: YELLOW,
  MISS: '',
  UNDISCOVERED: YELLOW,
  UNSEARCHED: '',
  FILTERED: '',
  UNRESOLVED: RED,
};

const BAR_CHAR: Record<SpendLine['kind'], string> = {
  RESERVE: '▒',
  DISCOVERY: '·',
  PIN: '█',
  RANKED: '▓',
  NOTICE: '─',
};

function bar(plan: Plan, width = 64): string {
  const { total } = plan.budget;
  let out = '';
  const push = (kind: SpendLine['kind'], n: number) => {
    out += BAR_CHAR[kind].repeat(Math.max(0, Math.round((n / total) * width)));
  };
  push('RESERVE', plan.budget.reserve);
  for (const kind of ['DISCOVERY', 'PIN', 'RANKED', 'NOTICE'] as SpendLine['kind'][]) {
    push(kind, plan.lines.filter((l) => l.kind === kind).reduce((n, l) => n + l.cost, 0));
  }
  const free = width - out.length;
  return out + ' '.repeat(Math.max(0, free));
}

function entryLine(e: Entry): string {
  const c = VERDICT_COLOR[e.verdict];
  const score = e.score === Number.POSITIVE_INFINITY ? 'pin' : String(e.score);
  const tier = e.tier ? e.tier.padEnd(7) : '—      ';
  const cost = e.cost ? String(e.cost).padStart(5) : '    ·';
  return `  ${c}${e.verdict.padEnd(13)}${R}${tier} ${cost}  ${D}${score.padStart(4)}${R}  ${e.id}`;
}

function render(): void {
  console.clear();
  const corpus = FIXTURES[world.fixture];
  const { plan, req } = run(world);
  const d = req.dials;

  console.log(`${B}BUDGET-AWARE CONCEPT SELECTION${R} ${D}prototype · wayfinder #28${R}`);
  console.log(`${D}${corpus.name} — ${corpus.note}${R}`);
  console.log('');

  console.log(`${B}Request${R}`);
  console.log(`  query      "${req.query}"  ${D}terms: ${plan.terms.join(' ') || 'none'}${R}`);
  console.log(`  exact      ${req.exact.join(', ') || `${D}none${R}`}`);
  console.log(`  task       ${req.task}  ${D}reserve ${Math.round(d.reserveFraction[req.task] * 100)}%${R}`);
  console.log(
    `  budget     ${plan.budget.total} ${plan.budget.source === 'unknown' ? `${YELLOW}(harness reported none — floor)${R}` : `${D}(explicit)${R}`}  ${D}estimator ${plan.budget.estimator}${R}`,
  );
  console.log(
    `  dials      ${D}probe=${d.allowProbe} discovery=${d.exhaustiveDiscovery ? 'exhaustive' : 'satisfice'} deprecated=${d.includeDeprecated} drafts=${d.includeDraft} maxRankedTier=${d.maxRankedTier} noticeCap=${d.noticeShareCap}${R}`,
  );
  console.log('');

  const oc = plan.outcome === 'ok' ? GREEN : plan.outcome === 'degraded' ? YELLOW : RED;
  console.log(`${B}Budget${R} ${oc}${plan.outcome.toUpperCase()}${R}`);
  console.log(`  [${bar(plan)}]`);
  console.log(
    `  ${D}▒reserve ${plan.budget.reserve}  ·discovery  █pins  ▓ranked  ─notice   spent ${plan.budget.spent}/${plan.budget.spendable}  free ${plan.budget.free}${R}`,
  );
  console.log(`  ${D}real cost of the same selection: ${plan.budget.actualSpent} (+ reserve ${plan.budget.reserve} = ${plan.budget.actualSpent + plan.budget.reserve} of ${plan.budget.total})${R}`);
  console.log('');

  console.log(`${B}Ledger${R}`);
  for (const l of plan.lines) {
    console.log(`  ${String(l.cost).padStart(6)}  ${l.kind.padEnd(9)} ${l.label}`);
    console.log(`          ${D}${l.why}${R}`);
  }
  console.log('');

  console.log(`${B}Selection${R} ${D}verdict / tier / tokens / score${R}`);
  const order: Verdict[] = ['PINNED', 'SELECTED', 'CLIPPED', 'UNRESOLVED', 'FILTERED'];
  const shown = plan.entries.filter((e) => order.includes(e.verdict));
  if (shown.length === 0) console.log(`  ${D}(nothing)${R}`);
  for (const v of order) {
    for (const e of shown.filter((x) => x.verdict === v)) {
      console.log(entryLine(e));
      console.log(`                        ${D}${e.detail}${R}`);
      if (e.nextAction !== 'none') console.log(`                        ${B}next:${R} ${e.nextAction}`);
    }
  }
  console.log('');

  console.log(`${B}Notice${R} ${D}${plan.notice.form}, ${plan.notice.cost} tokens${R}`);
  if (plan.notice.form === 'counted')
    console.log(`  ${YELLOW}collapsed${R} ${plan.notice.clipped.length} clipped, ${plan.notice.filtered.length} filtered, ${plan.notice.undiscovered.length} directories unread, ${plan.notice.unresolved.length} unresolved`);
  console.log(`  ${plan.notice.missed} concept(s) looked at and not matched ${D}(counted, never named — naming them costs what loading them costs)${R}`);
  if (plan.notice.unstatused > 0)
    console.log(`  ${YELLOW}${plan.notice.unstatused}${R} ranked without their frontmatter read — status and tags were invisible`);
  if (plan.notice.undiscovered.length > 0)
    console.log(`  ${YELLOW}unaffordable${R} directories never read: ${plan.notice.undiscovered.join(', ')} ${D}(raise the budget)${R}`);
  if (plan.notice.unsearched.length > 0)
    console.log(`  ${D}unsearched${R} directories never opened: ${plan.notice.unsearched.join(', ')} ${D}(the query was already explained — [s] for exhaustive)${R}`);
  for (const r of plan.reasons) console.log(`  ${D}· ${r}${R}`);
  console.log('');

  if (plan.violations.length > 0) {
    console.log(`${B}${RED}Violations${R}`);
    for (const v of plan.violations) console.log(`  ${RED}${v}${R}`);
    console.log('');
  }

  console.log(`${D}last: ${world.log.at(-1) ?? 'start'}${R}`);
  console.log(KEYS.map(([k, h]) => `${B}[${k}]${R}${D}${h}${R}`).join('  '));
  console.log(`${B}[C-c]${R}${D}quit${R}`);
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
  if (key?.ctrl && key?.name === 'c') {
    console.clear();
    process.exit(0);
  }
  world = step(world, key?.sequence ?? str);
  render();
});

render();
