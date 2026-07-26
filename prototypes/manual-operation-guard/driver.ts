/**
 * PROTOTYPE — throwaway glue between a keystroke and the guard.
 *
 * Kept separate from the terminal so the interactive shell (tui.ts) and the
 * scripted walkthrough (walkthrough.ts) drive the guard through exactly the
 * same path. Nothing here is portable; the guard is.
 */

import {
  addFile,
  computePreview,
  editFile,
  moveFile,
  removeFile,
  seedCorpus,
  touchFile,
  type Corpus,
} from './corpus.ts';
import {
  explainAuthorization,
  initialModel,
  reduce,
  type GuardAction,
  type GuardConfig,
  type GuardEnv,
  type GuardModel,
  type OperationName,
  type Outcome,
  type RequestAttestation,
} from './guard.ts';

export const OPERATIONS: OperationName[] = ['init', 'sync', 'migration', 'compaction'];
export const SELECTORS = ['.', 'concepts/', 'notes/'];
export const ATTESTATIONS: RequestAttestation[] = ['explicit', 'unknown', 'model-initiated'];

export const DEFAULT_CONFIG: GuardConfig = { ttlMs: 15 * 60 * 1000, sessionBinding: true };

export interface World {
  corpus: Corpus;
  guard: GuardModel;
  operation: OperationName;
  selector: string;
  attestation: RequestAttestation;
  sessionId: string;
  now: number;
  last: Outcome | null;
  lastAction: string;
}

export function createWorld(config: GuardConfig = DEFAULT_CONFIG): World {
  return {
    corpus: seedCorpus(),
    guard: initialModel(config),
    operation: 'migration',
    selector: '.',
    attestation: 'explicit',
    sessionId: 'session-1',
    now: 0,
    last: null,
    lastAction: '(none)',
  };
}

function env(world: World): GuardEnv {
  return { now: world.now, sessionId: world.sessionId, attestation: world.attestation };
}

function dispatch(world: World, label: string, action: GuardAction): World {
  const { model, outcome } = reduce(world.guard, action, env(world));
  return { ...world, guard: model, last: outcome, lastAction: label };
}

function firstScoped(world: World): string | null {
  const f = world.corpus.files.find((x) => world.selector === '.' || x.path.startsWith(world.selector));
  return f ? f.path : null;
}

/** One keystroke, one new world. Unknown keys are ignored. */
export function step(world: World, key: string): World {
  const scoped = firstScoped(world);

  switch (key) {
    case '1':
    case '2':
    case '3':
    case '4': {
      const operation = OPERATIONS[Number(key) - 1];
      return { ...world, operation, lastAction: `operation -> ${operation}`, last: null };
    }
    case 's': {
      const selector = SELECTORS[(SELECTORS.indexOf(world.selector) + 1) % SELECTORS.length];
      return { ...world, selector, lastAction: `scope -> ${selector}`, last: null };
    }
    case 'A': {
      const attestation = ATTESTATIONS[(ATTESTATIONS.indexOf(world.attestation) + 1) % ATTESTATIONS.length];
      return { ...world, attestation, lastAction: `attestation -> ${attestation}`, last: null };
    }

    case 'a':
      return dispatch(world, `ask ${world.operation}`, { kind: 'request', operation: world.operation });
    case 'p':
      return dispatch(world, `preview ${world.operation} '${world.selector}'`, {
        kind: 'preview',
        preview: computePreview(world.corpus, world.operation, world.selector),
      });
    case 'c': {
      const outstanding = world.guard.state.phase === 'previewed' ? world.guard.state.token.id : 'P-none';
      return dispatch(world, `confirm ${outstanding}`, { kind: 'confirm', tokenId: outstanding });
    }
    case 'C':
      // Confirm a token that was never minted (forged / hallucinated id).
      return dispatch(world, 'confirm P-deadbeef', { kind: 'confirm', tokenId: 'P-deadbeef' });
    case 'r':
      return dispatch(world, `run ${world.operation} '${world.selector}'`, {
        kind: 'execute',
        operation: world.operation,
        selector: world.selector,
        observed: computePreview(world.corpus, world.operation, world.selector),
      });
    case 'k':
      return dispatch(world, 'report run ok', { kind: 'executionResult', ok: true, note: '' });
    case 'f':
      return dispatch(world, 'report run failed', {
        kind: 'executionResult',
        ok: false,
        note: 'failed at item 3 of 4',
      });
    case 'x':
      return dispatch(world, 'cancel', { kind: 'cancel' });
    case 'o':
      return dispatch(world, 'another session completed an operation', {
        kind: 'externalExecution',
        operation: world.operation,
      });

    case 'n': {
      const path = `concepts/new-${world.corpus.files.length}.md`;
      return {
        ...world,
        corpus: addFile(world.corpus, path, 'a freshly written concept body', world.now),
        lastAction: `add ${path}`,
        last: null,
      };
    }
    case 'e':
      return scoped
        ? {
            ...world,
            corpus: editFile(world.corpus, scoped, `edited at t+${world.now}`, world.now),
            lastAction: `edit ${scoped}`,
            last: null,
          }
        : world;
    case 'D':
      // Edit that flips a planned MOVE into a planned DELETE (risk reclassification).
      return scoped
        ? {
            ...world,
            corpus: editFile(world.corpus, scoped, 'deprecated: superseded', world.now),
            lastAction: `deprecate ${scoped}`,
            last: null,
          }
        : world;
    case 'd':
      return scoped
        ? { ...world, corpus: removeFile(world.corpus, scoped), lastAction: `delete ${scoped}`, last: null }
        : world;
    case 'v':
      return scoped
        ? {
            ...world,
            corpus: moveFile(world.corpus, scoped, `moved/${scoped}`, world.now),
            lastAction: `move ${scoped}`,
            last: null,
          }
        : world;
    case 't':
      return scoped
        ? {
            ...world,
            corpus: touchFile(world.corpus, scoped, world.now + 1),
            lastAction: `touch ${scoped} (mtime only)`,
            last: null,
          }
        : world;
    case 'B':
      return scoped
        ? {
            ...world,
            corpus: editFile(world.corpus, scoped, '!!! broken frontmatter', world.now),
            lastAction: `corrupt ${scoped}`,
            last: null,
          }
        : world;
    case 'E':
      return { ...world, corpus: { ...world.corpus, files: [] }, lastAction: 'empty the corpus', last: null };
    case 'G': {
      let corpus = world.corpus;
      for (let i = 0; i < 20; i++) corpus = addFile(corpus, `concepts/bulk-${i}.md`, `bulk concept body ${i}`, world.now);
      return { ...world, corpus, lastAction: 'grow corpus by 20 files', last: null };
    }
    case 'U':
      return {
        ...world,
        corpus: { ...world.corpus, transformVersion: 'okf-v0.2-to-v0.3' },
        lastAction: 'transform -> okf-v0.2-to-v0.3',
        last: null,
      };

    case 'T':
      return { ...world, now: world.now + 20 * 60 * 1000, lastAction: 'clock +20min', last: null };
    case 'S':
      return {
        ...world,
        sessionId: `session-${Number(world.sessionId.split('-')[1]) + 1}`,
        lastAction: 'session/context boundary',
        last: null,
      };
    case 'w':
      return {
        ...world,
        guard: {
          ...world.guard,
          config: { ...world.guard.config, ttlMs: world.guard.config.ttlMs === null ? DEFAULT_CONFIG.ttlMs : null },
        },
        lastAction: 'toggle ttl adapter',
        last: null,
      };
    case 'b':
      return {
        ...world,
        guard: {
          ...world.guard,
          config: { ...world.guard.config, sessionBinding: !world.guard.config.sessionBinding },
        },
        lastAction: 'toggle session-binding adapter',
        last: null,
      };
    default:
      return world;
  }
}

export function livePlan(world: World) {
  return computePreview(world.corpus, world.operation, world.selector);
}

export { explainAuthorization };
