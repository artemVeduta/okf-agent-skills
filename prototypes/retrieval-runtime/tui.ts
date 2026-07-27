// PROTOTYPE — throwaway terminal shell. Thin: it renders, it does not decide.
//   node prototypes/retrieval-runtime/tui.ts

import { WORK_DIMENSIONS } from './cost.ts';
import { corpusOf, drive, INITIAL, KEYS, run, step, type World } from './driver.ts';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

function bar(used: number, total: number, width = 34): string {
  const n = total <= 0 ? 0 : Math.min(width, Math.round((used / total) * width));
  return `[${'#'.repeat(n)}${'.'.repeat(Math.max(0, width - n))}]`;
}

export function render(w: World): string {
  const { req, result } = run(w);
  const corpus = corpusOf(w);
  const out: string[] = [];
  const colour = result.outcome === 'ok' ? G : result.outcome === 'degraded' ? Y : R;

  out.push(B('OKF RETRIEVAL RUNTIME — prototype for issue #13') + D('   (throwaway)'));
  out.push('');
  out.push(
    `${B('bundle')} ${corpus.name}   ${B('query')} ${JSON.stringify(req.query)}   ${B('exact')} ${req.exact.length ? req.exact.join(', ') : D('none')}`,
  );
  out.push(
    `${B('task')} ${req.task}   ${B('breadth')} ${result.receipt.breadth}   ${B('seam')} ${req.declaration.seam}   ${B('profile')} ${result.receipt.costProfile}`,
  );
  out.push(
    `${B('coherence')} ${req.dials.coherence}   ${B('informativeness')} ${req.dials.informativeness}   ${B('provenance')} ${req.declaration.provenance}` +
      `   ${B('audit')} ${req.declaration.auditCapable ? 'capable' : R('blind')}`,
  );
  out.push('');
  out.push(colour(B(`OUTCOME  ${result.outcome.toUpperCase()}`)) + (result.reasons.length ? D('  — ' + result.reasons.join('; ')) : ''));
  out.push('');

  // -- ledger 1
  const b = result.budget;
  out.push(B('CONTEXT LEDGER') + D('  (bytes entering model context)'));
  out.push(
    `  allowance ${b.allowance}  reserve ${b.reserve} (${result.receipt.reserveProfile})  spendable ${b.spendable}  floor ${b.floor}`,
  );
  out.push(`  spent ${b.contextSpent} / ${b.spendable}  ${bar(b.contextSpent, b.spendable)}`);
  for (const l of result.receipt.contextLines) {
    const obs = l.observed === null ? D('  observed n/a (audit-blind)') : l.observed > l.bound ? R(`  observed ${l.observed} > bound!`) : D(`  observed ${l.observed}`);
    out.push(D(`    ${l.label.padEnd(34)} ${String(l.charged).padStart(5)}`) + obs);
  }
  out.push('');

  // -- ledger 2
  out.push(B('DISCOVERY-WORK LEDGER') + D(`  (${result.work.envelope.version}; no scalar total — dimensions do not collapse)`));
  for (const dim of WORK_DIMENSIONS) {
    const used = result.work.spent[dim];
    const cap = result.work.envelope[dim];
    const flag = used >= cap ? R(' EXHAUSTED') : '';
    out.push(`  ${dim.padEnd(18)} ${String(used).padStart(7)} / ${String(cap).padEnd(7)} ${bar(used, cap, 18)}${flag}`);
  }
  out.push('');

  // -- selection
  out.push(B('SELECTION'));
  if (result.entries.length === 0) out.push(D('  (nothing — content discarded or refused)'));
  for (const e of result.entries.slice(0, 12)) {
    const tag =
      e.verdict === 'SELECTED' || e.verdict === 'DEMANDED' ? G(e.verdict.padEnd(12)) : e.verdict === 'CLIPPED' || e.verdict === 'UNRESOLVED' ? R(e.verdict.padEnd(12)) : Y(e.verdict.padEnd(12));
    const tier = e.tier ? ` @${e.tier}` : e.askedTier ? D(` (wanted ${e.askedTier})`) : '';
    const secs = e.sections ? D(`  sections ${e.sections.shown.length}/${e.sections.total} shown`) : '';
    out.push(`  ${tag} ${e.id.padEnd(20)}${tier}${secs}`);
    out.push(D(`               ${e.summary} — next: ${e.nextAction}`));
  }
  out.push('');

  // -- omissions
  const o = result.omissions;
  out.push(B('OMISSIONS') + D(`  (form: ${o.form}, cost ${o.cost.bound})`));
  out.push(
    `  clipped ${o.clippedCount}${o.clipped.length ? ' — ' + o.clipped.join(', ') : D(' (counted)')}   filtered ${o.filteredCount}${o.filtered.length ? ' — ' + o.filtered.join(', ') : ''}   miss ${o.missCount} ${D('(count-only)')}`,
  );
  out.push(
    D(`  undiscovered scopes ${JSON.stringify(o.undiscovered.scopes)} channels ${JSON.stringify(o.undiscovered.channels)}`),
  );
  out.push(D(`  unsearched   scopes ${JSON.stringify(o.unsearched.scopes)} channels ${JSON.stringify(o.unsearched.channels)}`));
  if (o.unresolved.length) out.push(R(`  unresolved demands: ${o.unresolved.join(', ')}`));
  for (const u of o.unevaluatedPredicates) out.push(Y(`  ${u.candidates} candidate(s) ranked without ${u.predicate} observed`));
  for (const bw of o.bypassWarnings) out.push(Y(`  ! ${bw}`));
  out.push('');

  out.push(B('RECEIPT') + D(`  bound-status ${result.receipt.boundStatus}; stop: ${result.receipt.stopReason}`));
  if (result.violations.length) out.push(R('  ' + result.violations.join('\n  ')));
  if (result.quarantined) out.push(R(`  quarantined profile ${result.quarantined}`));
  out.push('');
  out.push(D(KEYS.map(([k, h]) => `[${k}] ${h}`).join('  ')));
  return out.join('\n');
}

// --- shell -----------------------------------------------------------------
if (process.argv[2] === '--once') {
  console.log(render(drive(process.argv[3] ?? '')));
} else {
  let world = { ...INITIAL };
  const draw = () => {
    console.clear();
    console.log(render(world));
  };
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key: string) => {
    if (key === '' || key === 'Q') {
      process.stdin.setRawMode?.(false);
      process.exit(0);
    }
    world = step(world, key);
    draw();
  });
  draw();
}
