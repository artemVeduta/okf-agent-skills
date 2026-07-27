// PROTOTYPE — throwaway. Query normalization and matching for the retrieval runtime (#13).
//
// #13 forbids nearly everything the #28 prototype did here: no stopword list, no global
// minimum term length, no substring matching, no implicit stemming, no generated synonyms.
// The original query is preserved; normalization produces *additional* structure, never a
// replacement. This module is pure — no I/O, no clock, no randomness.

export type ClauseKind = 'token' | 'phrase' | 'path' | 'identifier';

export interface Clause {
  /** exactly as the user typed it, before any normalization */
  original: string;
  kind: ClauseKind;
  /** NFC + case-folded form used for matching */
  normal: string;
  /**
   * For `identifier`, the parts a reader would recognise (camelCase / snake_case /
   * kebab / dotted splits). #13: "add identifier subterms without replacing the original",
   * so the identifier clause matches on `normal` OR on any subterm — the original never
   * stops being a way to match.
   */
  subterms: string[];
  /** For `phrase` and `path`, the ordered whole tokens the clause must match in sequence. */
  sequence: string[];
}

export interface Query {
  /** #13: "Preserve the original query." Never reconstructed from clauses. */
  raw: string;
  clauses: Clause[];
  /**
   * True when the raw query contains no clause at all. #28's prototype returned `ok` here
   * and claimed every term was explained — a vacuous `[].every(...)`. This is a named state.
   */
  empty: boolean;
}

/**
 * #13: "Normalize searchable text with Unicode NFC and case folding."
 *
 * JavaScript has no full Unicode case-folding primitive; `toLowerCase()` is the closest
 * available and differs from true case folding on a handful of scripts (notably Turkish
 * dotted/dotless I and German sharp s). A production runtime must use a real case-folding
 * table. Recorded here so the prototype does not read as if it had one.
 */
export function fold(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

const PATH_HINT = /[/\\]|\.[a-z0-9]{1,5}$/i;
const IDENTIFIER_HINT = /[A-Z][a-z]|[_\-.](?=[^\s])/;

/** camelCase / PascalCase / snake_case / kebab-case / dotted.path -> recognisable parts. */
function identifierSubterms(original: string): string[] {
  const split = original
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map(fold)
    .filter((p) => p.length > 0);
  // Deduped, and the whole identifier is not itself a subterm — it is `normal`.
  const whole = fold(original);
  return [...new Set(split)].filter((p) => p !== whole);
}

/**
 * Whole tokens of a piece of text. Splits on Unicode non-letter/non-digit runs, so it keeps
 * one-character terms and digits (both explicitly retained by #13) and keeps multilingual
 * text alive — #28's `[^a-z0-9]+` silently destroyed every non-ASCII corpus stratum.
 */
export function tokenize(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

function classify(original: string): ClauseKind {
  if (PATH_HINT.test(original)) return 'path';
  if (IDENTIFIER_HINT.test(original)) return 'identifier';
  return 'token';
}

function makeClause(original: string, kind: ClauseKind): Clause {
  const normal = fold(original);
  return {
    original,
    kind,
    normal,
    subterms: kind === 'identifier' || kind === 'path' ? identifierSubterms(original) : [],
    sequence: kind === 'phrase' || kind === 'path' ? tokenize(original) : [normal],
  };
}

/**
 * Split a raw query into clauses. Quoted runs become `phrase` clauses; everything else is
 * split on whitespace only, so `src/okf/index.md` and `trustTier` survive as single clauses
 * rather than being shredded into tokens.
 *
 * Nothing is dropped. There is no minimum length and no stopword set, so `parseQuery(q).clauses`
 * has one entry per whitespace- or quote-delimited run of the original, in order.
 */
export function parseQuery(raw: string): Query {
  const clauses: Clause[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      const inner = m[1].trim();
      if (inner.length === 0) continue; // `""` carries no clause
      clauses.push(makeClause(inner, 'phrase'));
    } else {
      const bare = m[2];
      // Strip only punctuation that cannot begin or end an identifier or path.
      const trimmed = bare.replace(/^[,;:!?()[\]{}]+|[,;:!?()[\]{}]+$/g, '');
      if (trimmed.length === 0) continue;
      clauses.push(makeClause(trimmed, classify(trimmed)));
    }
  }
  return { raw, clauses, empty: clauses.length === 0 };
}

/** Does an ordered token sequence appear contiguously in a token list? Whole tokens only. */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * #13: "Match normalized whole tokens, phrases, paths, and identifier subterms. Do not use
 * accidental substring stems, implicit stemming, or generated synonyms."
 *
 * Every branch below is a whole-token or whole-sequence comparison. There is deliberately no
 * `includes()` anywhere in this file — that single call is what made #28's matcher match
 * `spec` inside `specification` and `id` inside `identity`.
 */
export function clauseMatches(clause: Clause, text: string): boolean {
  const tokens = tokenize(text);
  switch (clause.kind) {
    case 'phrase':
    case 'path':
      if (containsSequence(tokens, clause.sequence)) return true;
      // A path clause also matches any of its own segments as a whole token, which is how
      // `docs/retrieval.md` finds a concept whose path segment is `retrieval`.
      return clause.kind === 'path' && clause.subterms.some((s) => tokens.includes(s));
    case 'identifier':
      if (tokens.includes(clause.normal)) return true;
      if (containsSequence(tokens, clause.subterms)) return true;
      return clause.subterms.some((s) => tokens.includes(s));
    case 'token':
      return tokens.includes(clause.normal);
  }
}

/** The clauses of `query` that match `text`, by index. Used to build per-candidate coverage. */
export function coveringClauses(query: Query, text: string): Set<number> {
  const hit = new Set<number>();
  query.clauses.forEach((c, i) => {
    if (clauseMatches(c, text)) hit.add(i);
  });
  return hit;
}
