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
import {
  ks,
  type ConceptKey,
  type ConceptView,
  type EffectStep,
  type Frame,
  type LinkResolution,
  type OperationManifest,
  type StepObservation,
} from './restructure.ts';

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
      if (end === -1) {
        result += s.slice(i);
        break;
      }
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

function json(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

function phaseColour(f: Frame): string {
  if (f.classification.cleanliness === 'dirty') return RED;
  if (f.classification.settlement === 'applied' || f.classification.settlement === 'reverted') return GREEN;
  if (f.classification.terminal) return YELLOW;
  return CYAN;
}

function keyOrNone(key: ConceptKey | null): string {
  return key === null ? '(none)' : ks(key);
}

function renderStepObservation(observation: StepObservation | null): string {
  if (observation === null) return '(not observed in this segment)';
  return observation.state === 'foreign'
    ? `${observation.state} observedHash=${observation.observedHash}`
    : observation.state;
}

function renderConceptView(label: string, view: ConceptView | null): void {
  if (view === null) {
    out(`${label} absent status=null statusExplicit=null effectiveStatus=null tier=null`);
    out(`${label} verification=(none)`);
    out(`${label} sources=(none)`);
    return;
  }

  out(
    `${label} identity=${ks(view.key)} status=${view.status ?? 'null'} ` +
      `statusExplicit=${view.statusExplicit} effectiveStatus=${view.status ?? 'stable'} tier=${view.tier}`,
  );
  if (view.verification.events.length === 0) {
    out(`${label} verification=(none)`);
  } else {
    for (const event of view.verification.events) {
      out(`${label} verification actor=${event.actor} at=${event.at}`);
    }
  }
  if (view.sources.length === 0) {
    out(`${label} sources=(none)`);
  } else {
    for (const source of view.sources) {
      out(`${label} source id=${source.id} resource=${source.resource}`);
    }
  }
}

function inverseReference(step: EffectStep): string {
  return step.inverseOf === null ? 'forwardStep=(none)' : `forwardStep=${step.inverseOf}`;
}

function renderEffectStep(
  label: string,
  step: EffectStep,
  observation: string,
  inverseStepReference: string,
): void {
  out(
    `  ${label} ordinal=${step.ordinal} kind=${step.kind} bundle=${step.bundle} target=${ks(step.target)} ` +
      `action=${step.action} risk=${step.risk} escape=${step.escape} approvalScope=${step.approvalScope}`,
  );
  out(
    `    observation=${observation} beforeHash=${step.beforeHash ?? 'null'} ` +
      `sourceBeforeHash=${step.sourceBeforeHash ?? 'null'} afterHash=${step.afterHash ?? 'null'} ` +
      `byteOrigin=${keyOrNone(step.movedFrom)}`,
  );
  out(
    `    inverseOf=${step.inverseOf ?? 'null'} ` +
      `inverseReference=${inverseStepReference}`,
  );
  out(`    classification=${json(step.classification)} deletionProof=${json(step.deletionProof)}`);
  out(
    `    link=${json(step.link)} indexScope=${step.indexScope ?? 'null'} ` +
      `outputDraft=${json(step.outputDraft)} statusTo=${step.statusTo ?? 'null'} ` +
      `linkReplacementTarget=${json(step.linkReplacementTarget)} rationale=${step.rationale}`,
  );
}

function renderManifest(
  title: string,
  manifest: OperationManifest,
  states: ReadonlyMap<number, StepObservation> | null,
  inverseSteps: readonly EffectStep[],
  durable: boolean,
  stepLabel: string,
): void {
  out('');
  out(
    `${B}${title}${R} operationId=${manifest.operationId} manifestHash=${manifest.manifestHash} ` +
      `revertOf=${manifest.revertOf ?? 'null'} durable=${durable}`,
  );
  out(`  plan=${json(manifest.plan)}`);
  if (manifest.bundles.length === 0) {
    out('  bundles=(none)');
  } else {
    for (const bundle of manifest.bundles) {
      out(
        `  bundle=${bundle.bundle} ledgerKey=${bundle.ledgerKey} mode=${bundle.mode} ` +
          `writability=${bundle.writability} epoch=${bundle.epoch} generation=${bundle.generation} schema=${bundle.schema}`,
      );
    }
  }

  out(`  ${stepLabel} steps=${manifest.steps.length}`);
  if (manifest.steps.length === 0) {
    out('    (none)');
  } else {
    for (const step of manifest.steps) {
      const inverse = inverseSteps.find((candidate) => candidate.inverseOf === step.ordinal);
      const reference = manifest.revertOf !== null
        ? inverseReference(step)
        : inverse
          ? `inverseStep=${inverse.ordinal} target=${ks(inverse.target)}`
          : 'inverseStep=(none)';
      renderEffectStep(
        stepLabel,
        step,
        renderStepObservation(states?.get(step.ordinal) ?? null),
        reference,
      );
    }
  }

  out(`  approved inverse steps=${manifest.rollbackSteps.length}`);
  if (manifest.rollbackSteps.length === 0) {
    out('    (none)');
  } else {
    for (const step of manifest.rollbackSteps) {
      renderEffectStep('inverse-approved', step, '(approved inverse)', inverseReference(step));
    }
  }
}

function renderLineage(title: string, lineage: OperationManifest['lineage']): void {
  out('');
  out(`${B}${title}${R}`);
  if (lineage.length === 0) {
    out('  (none)');
    return;
  }
  for (const record of lineage) {
    out(
      `  retired=${ks(record.retiredIdentity)} minted=${record.mintedIdentities.map(ks).join(', ') || '(none)'} ` +
        `reason=${record.reason}`,
    );
    out(`    continuity=${record.continuity}`);
  }
}

function renderInjected(
  name: string,
  injected: { readonly value: unknown; readonly ownedBy: string; readonly openQuestion: string },
): void {
  out(`  ${name} value=${json(injected.value)} owner=${injected.ownedBy}`);
  out(`    openQuestion=${injected.openQuestion}`);
  if (!Array.isArray(injected.value)) return;
  if (injected.value.length === 0) {
    out('    valueEntry=(none)');
    return;
  }
  for (const entry of injected.value) out(`    valueEntry=${json(entry)}`);
}

function renderPolicies(manifest: OperationManifest): void {
  out('');
  out(`${B}INJECTED POLICIES${R} value, owner, and open question are all rendered`);
  const policies = manifest.policies;
  renderInjected('redirects', policies.redirects);
  renderInjected('archive', policies.archive);
  renderInjected('sourceDisposition', policies.sourceDisposition);
  renderInjected('supersedeEdge', policies.supersedeEdge);
  renderInjected('rollbackAuthorization', policies.rollbackAuthorization);
  renderInjected('deprecatedHiddenFromIndex', policies.deprecatedHiddenFromIndex);
  renderInjected('inboundLinkFates', policies.inboundLinkFates);
  renderInjected('provenanceAssignment', policies.provenanceAssignment);
}

function renderProvenance(manifest: OperationManifest): void {
  out('');
  out(`${B}PROVENANCE${R} assignments and collisions`);
  if (manifest.provenance.length === 0) {
    out('  assignment=(none)');
  } else {
    for (const assignment of manifest.provenance) {
      out(
        `  assignment output=${assignment.output} sourceId=${assignment.entry.id} ` +
          `resource=${assignment.entry.resource}`,
      );
    }
  }
  if (manifest.provenanceCollisions.length === 0) {
    out('  collision=(none)');
  } else {
    for (const collision of manifest.provenanceCollisions) {
      out(`  collision kind=${collision.kind}`);
      for (const entry of collision.entries) {
        out(`    collisionEntry id=${entry.id} resource=${entry.resource}`);
      }
    }
  }
}

function renderReviewDependency(label: string, dependency: OperationManifest['reviewImpact'][number]): void {
  out(
    `  ${label} owner=${ks(dependency.owner)} locator=${dependency.locator} ` +
      `hasBaseline=${dependency.hasBaseline}`,
  );
  out(`    finding=${json(dependency.finding)}`);
  out(`    capturedObservation=${json(dependency.capturedObservation)}`);
  if (dependency.openFindings.length === 0) {
    out('    openFinding=(none)');
  } else {
    for (const finding of dependency.openFindings) out(`    openFinding=${finding}`);
  }
  if (dependency.structuralInvalidity.length === 0) {
    out('    structuralInvalidity=(none)');
  } else {
    for (const detail of dependency.structuralInvalidity) out(`    structuralInvalidity=${detail}`);
  }
}

function renderReview(manifest: OperationManifest): void {
  out('');
  out(`${B}REVIEW DEPENDENCIES${R} mappings and scheduled repairs`);
  if (manifest.reviewImpact.length === 0) {
    out('  dependency=(none)');
  } else {
    for (const dependency of manifest.reviewImpact) renderReviewDependency('dependency', dependency);
  }
  if (manifest.scheduledRepairs.length === 0) {
    out('  scheduledRepair=(none)');
  } else {
    for (const repair of manifest.scheduledRepairs) {
      out(
        `  scheduledRepair oldLocator=${repair.oldLocator} newLocator=${repair.newLocator ?? 'null'} ` +
          `becomes=${json(repair.becomes)} evidence=${repair.evidence}`,
      );
      renderReviewDependency('scheduledRepair.mapping', repair.mapping);
    }
  }
}

function renderLinks(frame: Frame, manifest: OperationManifest): void {
  out('');
  out(
    `${B}LINK GRAPH${R} complete=${manifest.inboundLinks.complete} ` +
      `frameLinkSetComplete=${frame.linkSetComplete}`,
  );
  if (manifest.inboundLinks.incompleteness.length === 0) {
    out('  incompleteness=(none)');
  } else {
    for (const detail of manifest.inboundLinks.incompleteness) out(`  incompleteness=${detail}`);
  }
  const resolutions = new Map(frame.links);
  if (manifest.inboundLinks.links.length === 0) {
    out('  inboundLink=(none)');
  } else {
    for (const link of manifest.inboundLinks.links) {
      const fate = manifest.linkFates.filter((entry) => entry.link === link.id);
      const resolution = resolutions.get(link.id);
      out(
        `  inboundLink id=${link.id} from=${ks(link.from)} to=${ks(link.to)} ` +
          `form=${json(link.linkForm)} holderWritability=${link.holderWritability} occurrence=${link.occurrence}`,
      );
      if (fate.length === 0) {
        out('    fate=(none)');
      } else {
        for (const entry of fate) out(`    fate=${json(entry.fate)}`);
      }
      out(
        resolution
          ? `    actualResolution state=${resolution.state} details=${json(resolution)}`
          : '    actualResolution=(not observed)',
      );
    }
  }
  for (const [id, resolution] of frame.links) {
    if (manifest.inboundLinks.links.some((link) => link.id === id)) continue;
    out(`  actualResolution id=${id} state=${resolution.state} details=${json(resolution)}`);
  }
  if (manifest.approvedBreakage.length === 0) {
    out('  approvedBreakage=(none)');
  } else {
    for (const id of manifest.approvedBreakage) out(`  approvedBreakage=${id}`);
  }
}

function resolutionDetails(resolution: LinkResolution): string {
  return resolution.state === 'resolves'
    ? '(none)'
    : resolution.state === 'knowingly-broken-approved'
      ? resolution.approvedInPlanAs
      : resolution.detail;
}

function renderRecovery(frame: Frame): void {
  out('');
  out(`${B}RECOVERY${R}`);
  if (frame.recovery === null) {
    out('  evidence=(none)');
    return;
  }
  const evidence = frame.recovery;
  const conjuncts: readonly (readonly [string, boolean])[] = [
    ['previewComplete', evidence.previewComplete],
    ['snapshotOutsideMutationTarget', evidence.snapshotOutsideMutationTarget],
    ['restoredIntoDisposableLocation', evidence.restoredIntoDisposableLocation],
    ['restoredContentHashVerified', evidence.restoredContentHashVerified],
    ['rollbackProcedureDocumented', evidence.rollbackProcedureDocumented],
    ['boundToApprovedPreview', evidence.boundToApprovedPreview],
    ['stale', evidence.stale],
  ];
  for (const [name, value] of conjuncts) out(`  ${name}=${value}`);
  out(`  evidenceHash=${evidence.evidenceHash}`);
  if (evidence.snapshot === null) {
    out('  snapshot=(null)');
  } else {
    out(`  snapshot id=${evidence.snapshot.id}`);
    if (evidence.snapshot.entries.length === 0) {
      out('    snapshotEntry=(none)');
    } else {
      for (const entry of evidence.snapshot.entries) {
        out(`    snapshotEntry key=${ks(entry.key)} existedBefore=${entry.existedBefore}`);
        out(
          `    snapshotEntry contentHash=${entry.contentHash} verificationHash=${entry.verificationHash} ` +
            `observedHash=${entry.observedHash}`,
        );
        out(`    snapshotEntry bytesRef=${entry.bytesRef ?? 'null'}`);
      }
    }
  }
}

function renderValidation(frame: Frame): void {
  out('');
  out(`${B}VALIDATION AND CHECKS${R}`);
  if (frame.validation === null) {
    out('  validation=(none)');
  } else {
    out(`  validation okfValid=${frame.validation.okfValid}`);
    if (frame.validation.detail.length === 0) {
      out('    validationDetail=(none)');
    } else {
      for (const detail of frame.validation.detail) out(`    validationDetail=${detail}`);
    }
  }
  if (frame.checks === null) {
    out('  checks=(none)');
    return;
  }
  const checks = frame.checks;
  out(
    `  checkGroup identityChecks=${checks.identityChecks} linkChecks=${checks.linkChecks} ` +
      `dependencyChecks=${checks.dependencyChecks}`,
  );
  if (checks.linkResolutions.length === 0) {
    out('    checkLinkResolution=(none)');
  } else {
    for (const [id, resolution] of checks.linkResolutions) {
      out(
        `    checkLinkResolution id=${id} state=${resolution.state} ` +
          `details=${resolutionDetails(resolution)} record=${json(resolution)}`,
      );
    }
  }
  if (checks.findings.length === 0) {
    out('    checkFinding=(none)');
  } else {
    for (const finding of checks.findings) out(`    checkFinding=${finding}`);
  }
  if (checks.structuralInvalidity.length === 0) {
    out('    structuralInvalidity=(none)');
  } else {
    for (const detail of checks.structuralInvalidity) out(`    structuralInvalidity=${detail}`);
  }
  out(
    `    contentCoverage checkableByValidation=${checks.contentCoverage.checkableByValidation} ` +
      `diff=${checks.contentCoverage.diff}`,
  );
}

function renderAmbiguities(frame: Frame): void {
  out('');
  out(`${B}AMBIGUITIES${R}`);
  if (frame.ambiguities.length === 0) {
    out('  (none)');
  } else {
    for (const ambiguity of frame.ambiguities) {
      out(`  kind=${ambiguity.kind} acknowledgedByHuman=${ambiguity.acknowledgedByHuman}`);
      out(`    concepts=${ambiguity.concepts.map(ks).join(', ') || '(none)'}`);
      if (ambiguity.paths.length === 0) {
        out('    path=(none)');
      } else {
        for (const path of ambiguity.paths) out(`    path=${path}`);
      }
      out(`    statement=${ambiguity.statement}`);
    }
  }
}

function renderAntiSilence(frame: Frame, violations: readonly string[]): void {
  out('');
  out(`${B}RESIDUE${R}`);
  if (frame.residue.length === 0) {
    out('  (none)');
  } else {
    for (const residue of frame.residue) {
      out(`  ordinal=${residue.ordinal} escape=${residue.escape} statement=${residue.statement}`);
    }
  }

  out('');
  out(`${B}HUMAN ACTIONS${R}`);
  if (frame.humanActionRequired.length === 0) {
    out('  (none)');
  } else {
    for (const action of frame.humanActionRequired) out(`  ${action}`);
  }

  out('');
  out(`${B}INVARIANTS${R}`);
  if (violations.length === 0) {
    out('  (none)');
  } else {
    for (const violation of violations) out(`  ${RED}${violation}${R}`);
  }
}

function renderNotices(frame: Frame): void {
  out('');
  out(`${B}NOTICES${R}`);
  if (frame.notice.length === 0) {
    out('  (none)');
  } else {
    for (const notice of frame.notice) out(`  ${notice}`);
  }
}

function renderEpochAndSettlement(frame: Frame): void {
  out('');
  out(
    `${B}EPOCH AND SETTLEMENT${R} settledAs=${frame.settledAs ?? 'null'} ` +
      `settlement=${frame.classification.settlement} cleanliness=${frame.classification.cleanliness}`,
  );
  if (frame.epochAdvances.length === 0) {
    out('  epochAdvance=(none)');
  } else {
    for (const [bundle, to] of frame.epochAdvances) out(`  epochAdvance bundle=${bundle} to=${to}`);
  }
}

function render(): void {
  console.clear();
  const f = frameOf(world);
  const forward = world.fixture.approved.manifest;
  const active = f.manifest ?? forward;
  const currentIsInverse = f.manifest !== null && f.manifest.revertOf !== null;
  const currentStates: ReadonlyMap<number, StepObservation> | null = f.manifest
    ? new Map(f.steps)
    : null;
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
  out(`${B}CONCEPTS${R} ${D}occupancy diff — every identity row includes status, verification, trust, and sources${R}`);
  // Before admission there is no journal to derive from, so the live corpus is
  // shown against itself: the same rendering, with nothing yet changed.
  const live = new Map(observeAll(world.corpus).map((o) => [ks(o.key), o.view]));
  const preAdmissionKeys = [...new Map(
    forward.steps
      .flatMap((s) => s.movedFrom === null ? [s.target] : [s.movedFrom, s.target])
      .map((key) => [ks(key), key] as const),
  ).values()];
  const rows =
    f.identityDiff.length > 0
      ? f.identityDiff
      : preAdmissionKeys.map((key) => ({
          key,
          before: live.get(ks(key)) ?? null,
          after: live.get(ks(key)) ?? null,
        }));
  if (rows.length === 0) {
    out('  (none)');
  } else {
    for (const row of rows) {
      const changed = json(row.before) !== json(row.after);
      out(`  identity=${ks(row.key)} changed=${changed}`);
      renderConceptView('    before', row.before);
      renderConceptView('    after', row.after);
    }
  }

  // --- manifest ------------------------------------------------------------
  const forwardStates = currentIsInverse ? null : currentStates;
  renderManifest(
    'FORWARD MANIFEST',
    forward,
    forwardStates,
    forward.rollbackSteps,
    currentIsInverse || f.manifestDurable,
    'forward',
  );
  if (currentIsInverse && f.manifest) {
    renderManifest('ACTIVE INVERSE MANIFEST', f.manifest, currentStates, [], f.manifestDurable, 'inverse-active');
  }
  renderLineage('LINEAGE', f.lineage.length > 0 ? f.lineage : forward.lineage);

  out('');
  out(`${B}VISIBILITY INTENTS${R}`);
  if (active.visibilityIntents.length === 0) {
    out('  (none)');
  } else {
    for (const intent of active.visibilityIntents) out(`  ${intent}`);
  }
  out(`  supersedeChainDepth=${f.supersedeChainDepth}`);
  if (active.supersedeChain.length === 0) {
    out('  supersedeChain=(none)');
  } else {
    for (const identity of active.supersedeChain) out(`  supersedeChain=${ks(identity)}`);
  }

  renderProvenance(active);
  renderPolicies(active);
  renderReview(active);

  // --- links ---------------------------------------------------------------
  renderLinks(f, active);

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
  for (const dependency of f.reviewDependencies) renderReviewDependency('frame dependency', dependency);

  // --- recovery ------------------------------------------------------------
  renderRecovery(f);
  renderValidation(f);
  renderEpochAndSettlement(f);

  // --- anti-silence --------------------------------------------------------
  renderAmbiguities(f);
  const violations = violationsOf(world);
  renderAntiSilence(f, violations);

  renderNotices(f);

  // --- last action ---------------------------------------------------------
  out('');
  out(`${B}LAST ACTION${R} ${world.lastAction}`);
  if (world.last) {
    const v = world.last.verdict;
    const colour = v === 'ALLOW' ? GREEN : v === 'RECORDED' ? CYAN : RED;
    out(`  ${colour}${B}${v}${R} ${D}${world.last.code}${R}`);
    if (world.last.drift.length === 0) {
      out('    drift=(none)');
    } else {
      for (const detail of world.last.drift) out(`    drift=${detail}`);
    }
  } else {
    out('  reducerResult=(none; action changed the fixture world without a reducer record)');
  }
  if (f.drift.length === 0) {
    out('  frameDrift=(none)');
  } else {
    for (const detail of f.drift) out(`  frameDrift=${detail}`);
  }
  if (f.refusal === null) {
    out('  refusal=(none)');
  } else {
    out(`  refusalCode=${f.refusal.code}`);
    if (f.refusal.detail.length === 0) {
      out('  refusalDetail=(none)');
    } else {
      for (const detail of f.refusal.detail) out(`  refusalDetail=${detail}`);
    }
  }
  out('');
  out(`${B}OPEN QUESTIONS HANDED BACK${R}`);
  if (f.openQuestions.length === 0) {
    out('  (none)');
  } else {
    for (const question of f.openQuestions) out(`  ${question}`);
  }

  out('');
  out(
    `${B}[ ]${R}${D}fixture${R}  ${B}a${R}${D}dmit${R} ${B}g${R}${D}ate${R}/${B}G${R}${D}bad${R} ${B}l${R}${D}ock${R} ${B}k${R}${D}recheck${R} ${B}m${R}${D}seal${R}/${B}M${R}${D}fail${R} ` +
      `${B}n${R}${D}begin/complete one step${R} ${B}N${R}${D}begin/complete all steps${R} ${B}f${R}${D}io-fail${R} ${B}F${R}${D}partial-fail${R} ${B}c${R}${D}oncurrent${R} ${B}p${R}${D}deviate${R} ${B}Z${R}${D}unapproved-step${R}`,
  );
  out(
    `${B}v${R}${D}erify${R}/${B}V${R}${D}invalid${R}/${B}w${R}${D}dangling${R}/${B}W${R}${D}cyclic${R}/${B}i${R}${D}dup-id${R}/${B}I${R}${D}advisory${R} ` +
      `${B}x${R}${D}crash${R} ${B}X${R}${D}die-mid-write${R} ${B}r${R}${D}econcile${R} ${B}R${R}${D}ecover${R} ${B}b${R}/${B}B${R}${D}rollback${R} ${B}z${R}${D}bad-evidence${R} ${B}y${R}${D}ack${R}`,
  );
  out(
    `${B}o${R}${D}redirect-followed${R} ${B}O${R}${D}human-verified${R} ${B}u${R}${D}retrieval-served${R} ${B}U${R}${D}superseded${R}  ` +
      `${D}concurrent:${R} ${B}1${R}${D}edit${R} ${B}2${R}${D}verify${R} ${B}3${R}${D}occupy-dest${R} ${B}4${R}${D}move${R} ${B}5${R}${D}holder${R} ${B}6${R}${D}deprecate${R} ${B}7${R}${D}ledger${R} ${B}8${R}${D}output${R} ${B}9${R}${D}move-source${R}  ${B}q${R}${D}uit${R}`,
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
