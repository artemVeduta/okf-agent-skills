// Extracts okf-wrapper/1 request objects embedded as JSON text inside a
// shell command string. The eval only observes the model's `bash` tool
// input as a plain string — never re-parsed by a shell — so the JSON can
// arrive single-quoted, double-quoted with backslash-escaped inner quotes,
// or as a heredoc body with no escaping at all. Rather than modelling shell
// quoting rules, this scans for balanced `{...}` regions, treating every
// literal `"` as a string-boundary toggle regardless of a preceding
// backslash — the backslash before an inner quote in a double-quoted `echo`
// is shell-level escaping, not a JSON string escape, so treating it as one
// desynchronises the string/brace tracking and can miss the closing brace
// entirely. Each candidate is then parsed as-is, and — because that
// shell-level backslash is still sitting in the slice — with backslash-quote
// unescaped as a fallback.

function candidateSlices(text) {
  const slices = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          slices.push(text.slice(i, j + 1));
          break;
        }
      }
    }
  }
  return slices;
}

function parseCandidate(slice) {
  for (const candidate of [slice, slice.replace(/\\"/g, '"')]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Not valid JSON either way — not a candidate, try the next variant.
    }
  }
  return null;
}

// Returns the okf-wrapper/1 request objects found in `text`, in the order
// they appear.
export function extractWrapperRequests(text) {
  return candidateSlices(text)
    .map(parseCandidate)
    .filter((obj) => obj && typeof obj === 'object' && obj.protocol === 'okf-wrapper/1');
}
