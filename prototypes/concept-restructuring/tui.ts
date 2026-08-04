/**
 * PROTOTYPE — throwaway terminal shell over the concept-restructuring machine.
 *
 * Run:  node prototypes/concept-restructuring/tui.ts
 *
 * The WHOLE frame is re-rendered after every action: concept occupancy, the
 * operation manifest, the link graph including redirects, and the recovery
 * state. Every state row is rendered; an individual long line is truncated to
 * fit the terminal width.
 */

import readline from 'node:readline';
import { createWorld, FIXTURES, frameOf, step, violationsOf, type World } from './driver.ts';
import { observeAll } from './corpus.ts';
import { ks, type Frame } from './restructure.ts';

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

let index = 0;
let world: World = createWorld(FIXTURES[0]);

const W = () => Math.max(80, (process.stdout.columns ?? 100) - 1);

function out(s: string): void {
  // Truncate on VISIBLE width, so colour codes never eat the budget.
  let visible = 0;
  let result = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\x1b') {
      const end = s.indexOf('m', i);
      result += s.slice(i, end + 1);
      i = end;
      continue;
    }
    if (visible >= W()) return void console.log(`${result}${R}…`);
    result += s[i];
    visible++;
  }
  console.log(`${result}${R}`);
}

function field(name: string, value: string): string {
  return `${B}${name}${R} ${value}`;
}

function more(shown: number, total: number): string {
  return total > shown ? ` ${D}… ${total - shown} more${R}` : '';
}

function phaseColour(f: Frame): string {
  if (f.classification.cleanliness === 'dirty') return RED;
  if (f.classification.settlement === 'applied' || f.classification.settlement === 'reverted') return GREEN;
  if (f.classification.terminal) return YELLOW;
  return CYAN;
}

function render(): void {
  console.clear();
  const f = frameOf(world);
  const m = f.manifest ?? world.fixture.approved.manifest;
  const cls = f.classification;

  out(
    `${B}CONCEPT RESTRUCTURING${R} ${D}prototype · Prototype concept restructuring and rollback behavior · from APPLY onward${R}`,
  );
  out(
    `${D}fixture ${index + 1}/${FIXTURES.length}${R} ${world.fixture.label}  ` +
      `${phaseColour(f)}${B}[${f.phase}]${R} ${D}settlement=${cls.settlement} ${cls.cleanliness}${cls.terminal ? ' terminal' : ''} · derived, never stored${R}`,
  );

  // --- concepts ------------------------------------------------------------
  out('');
  out(`${B}CONCEPTS${R} ${D}occupancy diff — what sat at each Concept ID, and what sits there now${R}`);
  // Before admission there is no journal to derive from, so the live corpus is
  // shown against itself: the same rendering, with nothing yet changed.
  const live = new Map(observeAll(world.corpus).map((o) => [ks(o.key), o.view]));
  const rows =
    f.identityDiff.length > 0
      ? f.identityDiff
      : [...new Set(m.steps.map((s) => ks(s.movedFrom ?? s.target)))].map((k) => ({
          key: m.steps.find((s) => ks(s.movedFrom ?? s.target) === k)!.movedFrom ??
            m.steps.find((s) => ks(s.target) === k)!.target,
          before: live.get(k) ?? null,
          after: live.get(k) ?? null,
        }));
  for (const r of rows) {
    const show = (v: (typeof rows)[number]['before']) =>
      v === null || v === undefined ? `${D}(absent)${R}` : `${v.status ?? 'stable*'}/${v.tier}`;
    const changed = (r.before === null) !== (r.after === null) || r.before?.status !== r.after?.status;
    out(`  ${ks(r.key).padEnd(34)} ${show(r.before)} ${changed ? YELLOW : D}->${R} ${show(r.after)}`);
  }

  // --- manifest ------------------------------------------------------------
  out('');
  out(
    `${B}MANIFEST${R} ${m.operationId} ${D}plan=${m.plan.kind} revertOf=${m.revertOf ?? '—'} durable=${f.manifestDurable} lineage=${f.lineage.length}${R}`,
  );
  out(
    `  ${D}bundles ${m.bundles.map((b) => `${b.bundle}(${b.mode},${b.writability},epoch ${b.epoch},${b.schema})`).join(' ')}${R}`,
  );
  const obs = new Map(f.steps);
  for (const s of m.steps) {
    const o = obs.get(s.ordinal)?.state ?? 'not-started';
    const colour = o === 'done' ? GREEN : o === 'indeterminate' || o === 'foreign' ? RED : D;
    out(
      `  ${String(s.ordinal).padStart(2)} ${s.kind.padEnd(17)} ${s.action.padEnd(6)} ${s.risk.padEnd(11)} ` +
        `${s.escape.padEnd(16)} ${s.approvalScope.padEnd(9)} ${ks(s.target).padEnd(30)} ${colour}${o}${R}`,
    );
  }
  out(`  ${D}${m.steps.length} step(s); ${m.rollbackSteps.length} approved inverse step(s)${R}`);

  // --- links ---------------------------------------------------------------
  out('');
  out(
    `${B}LINK GRAPH${R} ${D}inbound set complete=${f.linkSetComplete}${m.inboundLinks.incompleteness.length ? ` (${m.inboundLinks.incompleteness.join(', ')})` : ''}${R}`,
  );
  const res = new Map(f.links);
  const links = m.inboundLinks.links;
  for (const l of links) {
    const fate = m.linkFates.find((x) => x.link === l.id)?.fate.fate ?? 'unassigned';
    const state = res.get(l.id)?.state ?? '—';
    const colour = state === 'resolves' ? GREEN : state === 'unexpectedly-broken' ? RED : YELLOW;
    out(
      `  ${l.id} ${ks(l.from).padEnd(28)} -> ${ks(l.to).padEnd(28)} ${D}${l.linkForm.form}/${l.holderWritability}${R} ` +
        `fate=${fate.padEnd(26)} ${colour}${state}${R}`,
    );
  }
  const redirect = m.policies.redirects.value;
  out(
    `  ${field('redirects', redirect.mode === 'off' ? 'off' : `candidate ${redirect.artifact} followable=${redirect.followable} ${RED}${redirect.authorization}${R}`)}` +
      ` ${D}(injected, owned by ${m.policies.redirects.ownedBy})${R}`,
  );

  // --- trust / review ------------------------------------------------------
  out('');
  out(
    `${B}TRUST${R} ${D}evidence, never authority — no reducer guard reads it · per STEP, and predicted until the step lands${R}`,
  );
  for (const t of f.trust) {
    // A row is a PREDICTION until its step is `done`. Rendering every row as an
    // outcome made a `failed-clean` operation — zero bytes moved — report a lost
    // human review, and made a rejected restore report byte-identical success.
    const moved = t.before !== t.after;
    out(
      `  ${String(t.ordinal).padStart(2)} ${ks(t.key).padEnd(31)} ${t.before} ${moved && t.observed ? RED : D}->${R} ${t.after} ` +
        `${t.observed ? `${GREEN}observed${R}` : `${D}predicted (${t.stepState})${R}`} ` +
        `${D}${t.classification.claimAffecting ? `claim-affecting: ${t.classification.reason}` : t.classification.allowlist}${R}` +
        `${t.invalidationReported ? ` ${RED}INVALIDATION reported${R}` : ''}`,
    );
  }
  if (f.trust.length === 0) out(`  ${D}(no trust outcomes until a manifest is admitted)${R}`);
  out(
    `  ${D}review dependencies: ${f.reviewDependencies
      .map((d) => d.finding.kind)
      .join(', ') || 'none'}${R}`,
  );

  // --- recovery ------------------------------------------------------------
  out('');
  const ev = f.recovery;
  out(
    `${B}RECOVERY${R} ${ev === null ? `${D}no gate record yet${R}` : `snapshot=${ev.snapshot?.id ?? RED + 'null' + R} outsideTarget=${ev.snapshotOutsideMutationTarget} disposable=${ev.restoredIntoDisposableLocation} hashVerified=${ev.restoredContentHashVerified} documented=${ev.rollbackProcedureDocumented} bound=${ev.boundToApprovedPreview} stale=${ev.stale}`}`,
  );
  out(
    `  ${D}validation=${f.validation ? `okfValid=${f.validation.okfValid}` : '—'} checks=${f.checks ? `${f.checks.identityChecks}/${f.checks.linkChecks}/${f.checks.dependencyChecks}` : '—'} epochAdvances=${f.epochAdvances.map(([b, e]) => `${b}->${e}`).join(' ') || '—'} settled=${f.settledAs ?? '—'}${R}`,
  );

  // --- anti-silence --------------------------------------------------------
  out('');
  for (const a of f.ambiguities) {
    out(`  ${RED}${B}AMBIGUITY${R} ${a.kind}${a.acknowledgedByHuman ? ` ${D}(acknowledged — acknowledgement is not approval)${R}` : ''}: ${a.statement}`);
  }
  for (const r of f.residue) out(`  ${YELLOW}${B}RESIDUE${R} ${r.escape}: ${r.statement}`);
  for (const hline of f.humanActionRequired) out(`  ${YELLOW}${B}HUMAN${R} ${hline}`);
  const violations = violationsOf(world);
  for (const v of violations) out(`  ${RED}${B}INVARIANT VIOLATED${R} ${v}`);
  if (f.ambiguities.length + f.residue.length + f.humanActionRequired.length + violations.length === 0) {
    out(`  ${D}no ambiguity, no residue, no outstanding human action${R}`);
  }

  // --- last action ---------------------------------------------------------
  out('');
  out(`${B}LAST${R} ${world.lastAction}`);
  if (world.last) {
    const v = world.last.verdict;
    const colour = v === 'ALLOW' ? GREEN : v === 'RECORDED' ? CYAN : RED;
    out(`  ${colour}${B}${v}${R} ${D}${world.last.code}${R}`);
    const detail = [...world.last.drift, ...(f.refusal?.detail ?? [])];
    for (const d of detail.slice(0, 2)) out(`    ${D}· ${d}${R}`);
    if (detail.length > 2) out(`    ${D}${more(2, detail.length).trim()}${R}`);
  }
  for (const notice of f.notice) out(`  ${D}notice: ${notice}${R}`);
  out(`  ${D}open questions handed back: ${f.openQuestions.length} (every injected value renders its owning ticket)${R}`);

  out('');
  out(
    `${B}[ ]${R}${D}fixture${R}  ${B}a${R}${D}dmit${R} ${B}g${R}${D}ate${R}/${B}G${R}${D}bad${R} ${B}l${R}${D}ock${R} ${B}k${R}${D}recheck${R} ${B}m${R}${D}seal${R}/${B}M${R}${D}fail${R} ` +
      `${B}n${R}${D}ext-step${R} ${B}N${R}${D}all${R} ${B}f${R}${D}io-fail${R} ${B}c${R}${D}oncurrent${R} ${B}p${R}${D}deviate${R} ${B}Z${R}${D}unapproved-step${R}`,
  );
  out(
    `${B}v${R}${D}erify${R}/${B}V${R}${D}invalid${R}/${B}w${R}${D}dangling${R}/${B}W${R}${D}cyclic${R}/${B}i${R}${D}dup-id${R}/${B}I${R}${D}advisory${R} ` +
      `${B}x${R}${D}crash${R} ${B}X${R}${D}die-mid-write${R} ${B}r${R}${D}econcile${R} ${B}R${R}${D}ecover${R} ${B}b${R}/${B}B${R}${D}rollback${R} ${B}z${R}${D}bad-evidence${R} ${B}y${R}${D}ack${R}`,
  );
  out(
    `${B}o${R}${D}redirect-followed${R} ${B}O${R}${D}human-verified${R} ${B}u${R}${D}retrieval-served${R} ${B}U${R}${D}superseded${R}  ` +
      `${D}concurrent:${R} ${B}1${R}${D}edit${R} ${B}2${R}${D}verify${R} ${B}3${R}${D}occupy-dest${R} ${B}4${R}${D}move${R} ${B}5${R}${D}holder${R} ${B}6${R}${D}deprecate${R} ${B}7${R}${D}ledger${R} ${B}8${R}${D}output${R}  ${B}q${R}${D}uit${R}`,
  );
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
  const seq: string = key?.sequence ?? str ?? '';
  if (seq === 'q' || (key?.ctrl && key.name === 'c')) {
    console.clear();
    process.exit(0);
  }
  if (seq === '[' || seq === ']') {
    index = (index + (seq === ']' ? 1 : FIXTURES.length - 1)) % FIXTURES.length;
    world = createWorld(FIXTURES[index]);
  } else {
    world = step(world, seq);
  }
  render();
});

render();
