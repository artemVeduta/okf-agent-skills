/**
 * PROTOTYPE — throwaway fake world for the manual-operation guard.
 *
 * Not part of the portable module. It exists only so the guard can be driven by
 * hand: an in-memory corpus plus a dumb planner that turns it into the dry-run
 * manifest shape the guard consumes. Everything here is replaced by the real
 * OKF bundle reader and the real planners.
 */

import { createHash } from 'node:crypto';
import { type OperationName, type PlannedItem, type Preview } from './guard.ts';

export interface CorpusFile {
  path: string;
  content: string;
  /** Deliberately NOT part of the fingerprint — a touch must not expire a confirmation. */
  mtime: number;
}

export interface Corpus {
  files: CorpusFile[];
  /** Identity of the transform, flipped by hand to simulate a tool upgrade. */
  transformVersion: string;
}

/** How many items a preview can honestly show before it truncates. */
export const PREVIEW_BUDGET = 8;

export function seedCorpus(): Corpus {
  return {
    transformVersion: 'okf-v0.1-to-v0.2',
    files: [
      { path: 'concepts/architecture.md', content: 'okf: v0.2 root — code-backed durable context', mtime: 100 },
      { path: 'concepts/lifecycle.md', content: 'automatic lifecycle reads and makes small updates', mtime: 100 },
      { path: 'concepts/legacy-sync.md', content: 'deprecated: replaced by incremental sync', mtime: 100 },
      { path: 'notes/scratch.md', content: 'todo', mtime: 100 },
    ],
  };
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function inScope(file: CorpusFile, selector: string): boolean {
  return selector === '.' || file.path.startsWith(selector);
}

/** Plans one operation over the corpus. Deliberately crude — the shape is the point. */
export function computePreview(corpus: Corpus, operation: OperationName, selector: string): Preview {
  const scoped = corpus.files.filter((f) => inScope(f, selector));

  const broken = scoped.find((f) => f.content.startsWith('!!!'));
  if (broken) {
    return {
      operation,
      selector,
      transformVersion: corpus.transformVersion,
      items: [],
      complete: false,
      error: `unreadable source: ${broken.path} (invalid frontmatter)`,
    };
  }

  const planned: PlannedItem[] = [];
  for (const file of scoped) {
    const contentHash = hashContent(file.content);
    switch (operation) {
      case 'init':
        planned.push({
          path: file.path,
          contentHash,
          action: file.content.includes('okf:') ? 'MODIFY' : 'CREATE',
          risk: file.content.includes('okf:') ? 'DESTRUCTIVE' : 'SAFE',
        });
        break;
      case 'sync':
        planned.push({ path: file.path, contentHash, action: 'MODIFY', risk: 'CAUTION' });
        break;
      case 'migration':
        planned.push(
          file.content.includes('deprecated')
            ? { path: file.path, contentHash, action: 'DELETE', risk: 'DESTRUCTIVE' }
            : { path: file.path, contentHash, action: 'MOVE', risk: 'REVIEW' },
        );
        break;
      case 'compaction':
        // Only short concepts are candidates, so an empty plan is reachable.
        if (file.content.length < 40) {
          planned.push({ path: file.path, contentHash, action: 'DELETE', risk: 'DESTRUCTIVE' });
        }
        break;
    }
  }

  if (planned.length > PREVIEW_BUDGET) {
    return {
      operation,
      selector,
      transformVersion: corpus.transformVersion,
      items: planned.slice(0, PREVIEW_BUDGET),
      complete: false,
      error: null,
    };
  }

  return {
    operation,
    selector,
    transformVersion: corpus.transformVersion,
    items: planned,
    complete: true,
    error: null,
  };
}

// --- hand-driven mutations -------------------------------------------------

export function addFile(corpus: Corpus, path: string, content: string, now: number): Corpus {
  return { ...corpus, files: [...corpus.files, { path, content, mtime: now }] };
}

export function editFile(corpus: Corpus, path: string, content: string, now: number): Corpus {
  return {
    ...corpus,
    files: corpus.files.map((f) => (f.path === path ? { ...f, content, mtime: now } : f)),
  };
}

export function removeFile(corpus: Corpus, path: string): Corpus {
  return { ...corpus, files: corpus.files.filter((f) => f.path !== path) };
}

export function moveFile(corpus: Corpus, from: string, to: string, now: number): Corpus {
  return {
    ...corpus,
    files: corpus.files.map((f) => (f.path === from ? { ...f, path: to, mtime: now } : f)),
  };
}

/** Changes only the mtime — the case where expiring would be a false alarm. */
export function touchFile(corpus: Corpus, path: string, now: number): Corpus {
  return { ...corpus, files: corpus.files.map((f) => (f.path === path ? { ...f, mtime: now } : f)) };
}
