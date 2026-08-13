/*
 * #200/#201 task 2: the source side of a migration split, exactly.
 *
 * This module owns one thing: how a single Markdown source is divided into
 * accountable sections, and whether a proposed accounting of those sections
 * covers that source once. It decides nothing about the outputs a split
 * produces -- Concept IDs, titles, groups, anchors, link routes, and
 * provenance are later tasks' work -- and it never repairs anything: a gap, an
 * overlap, a doubly assigned range, a cut inside a visible Markdown block, or
 * a changed source is reported as an exact finding for the caller to fix, per
 * #200's "no source section can be missing or assigned twice".
 *
 * Line numbers are 1-based and inclusive at both ends, everywhere: a section
 * `{ line_start: 6, line_end: 11 }` holds lines 6, 7, 8, 9, 10, and 11.
 *
 * #200's section rules, implemented here:
 *
 *   - "A Markdown heading and its content form the normal source section" ->
 *     one section per heading, from its own line to the line before the next
 *     heading of any level. `heading_path` carries the hierarchy the flat
 *     section list itself does not.
 *   - "Content before the first heading forms a section" -> the `preamble`
 *     section. A frontmatter block is not prose, so it is its own
 *     `frontmatter` section rather than part of the preamble -- it still has
 *     to be disposed of, because the ranges must cover the *complete* source.
 *   - "setup can divide it only at visible Markdown block boundaries such as
 *     paragraphs, lists, tables, or code blocks. It never cuts one of those
 *     blocks only to meet the word target" -> a supplied range may begin only
 *     where a visible block begins (or where a derived section begins). A
 *     boundary that falls inside a fence, a table, or a list is refused.
 *
 * No second Markdown parser: frontmatter comes from `validation.parseFrontmatter`
 * and fenced-code state from `validation.fencedLines`, the same scan
 * `withoutFencedCode` masks from.
 */

const crypto = require('node:crypto');
const validation = require('./validation');
const { countWords } = require('./words');

const HEADING = /^[ \t]{0,3}#{1,6}(?:[ \t]|$)/;
const HEADING_TEXT = /^[ \t]{0,3}(#{1,6})[ \t]*(.*)$/;
const LIST_ITEM = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/;
const CONTINUATION = /^(?: {2,}|\t)/;

// The proposal binds this, and publication rechecks it (#200: "a source change
// invalidates the proposal"). `node:crypto` is stdlib -- no dependency.
function identify(raw) {
  return `sha256:${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

// A file's final newline terminates its last line, it does not open an empty
// one, so `line_count` is the number of lines a reader actually sees.
function splitLines(raw) {
  if (raw === '') return [];
  const lines = raw.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// The 1-based line of the closing `---`, or 0 when there is no frontmatter
// block this repo's own reader accepts. Derived from the reader's own body
// rather than re-scanned here.
function frontmatterEnd(raw) {
  let extracted;
  try {
    extracted = validation.parseFrontmatter(raw);
  } catch {
    return 0;
  }
  return raw.split('\n').length - extracted.body.split('\n').length;
}

function headingText(line) {
  const match = line.match(HEADING_TEXT);
  return match[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
}

function sectionRow(index, kind, headingPath, lineStart, lineEnd, lines) {
  return {
    index,
    kind,
    heading_path: headingPath,
    line_start: lineStart,
    line_end: lineEnd,
    word_count: countWords(lines.slice(lineStart - 1, lineEnd).join('\n')),
    disposition: null,
    output: null,
    output_order: null,
  };
}

function deriveSections(raw, lines) {
  const fenced = validation.fencedLines(raw);
  const sections = [];
  const push = (kind, headingPath, start, end) => {
    sections.push(sectionRow(sections.length, kind, headingPath, start, end, lines));
  };

  const frontmatter = frontmatterEnd(raw);
  if (frontmatter > 0) push('frontmatter', [], 1, frontmatter);

  const stack = [];
  let start = frontmatter + 1;
  let kind = 'preamble';
  let headingPath = [];
  for (let i = frontmatter; i < lines.length; i++) {
    if (fenced[i] || !HEADING.test(lines[i])) continue;
    const line = i + 1;
    if (line > start) push(kind, headingPath, start, line - 1);
    const level = lines[i].match(HEADING_TEXT)[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text: headingText(lines[i]) });
    start = line;
    kind = 'heading';
    headingPath = stack.map((item) => item.text);
  }
  if (lines.length >= start) push(kind, headingPath, start, lines.length);
  return sections;
}

// Every 1-based line at which a visible Markdown block begins. A section may
// begin only here. The rule is deliberately conservative -- a line that merely
// *continues* the previous block (a further item of a loose list, an indented
// continuation) is not a boundary -- because refusing a legal cut costs the
// user one adjustment, while allowing an illegal one silently severs a table
// or a code block.
function blockStarts(raw, lines) {
  const fenced = validation.fencedLines(raw);
  const blank = (i) => !fenced[i] && lines[i].trim() === '';
  const starts = new Set();
  let previous = null;
  for (let i = 0; i < lines.length; i++) {
    if (blank(i)) continue;
    const opensFence = fenced[i] && (i === 0 || !fenced[i - 1]);
    if (fenced[i] && !opensFence) continue;
    const heading = !fenced[i] && HEADING.test(lines[i]);
    const fresh = i === 0 || blank(i - 1) || heading || fenced[i - 1] !== fenced[i];
    if (!fresh) continue;
    const continues = previous !== null && !heading
      && (CONTINUATION.test(lines[i]) || (LIST_ITEM.test(lines[i]) && LIST_ITEM.test(lines[previous])));
    if (continues) continue;
    starts.add(i + 1);
    previous = i;
  }
  return starts;
}

function containing(sections, line) {
  return sections.find((item) => item.line_start <= line && line <= item.line_end) || null;
}

function suppliedRow(index, derived, supplied, lines) {
  const holder = containing(derived, supplied.line_start);
  const row = sectionRow(
    index,
    holder === null ? null : holder.kind,
    holder === null ? [] : holder.heading_path,
    supplied.line_start,
    supplied.line_end,
    lines,
  );
  row.disposition = supplied.disposition;
  row.output = supplied.disposition === 'assigned' ? supplied.output : null;
  return row;
}

const rangeKey = (section) => `${section.line_start}:${section.line_end}`;

function coverageFindings(ordered, lineCount) {
  const findings = [];
  const seen = new Map();
  for (const section of ordered) seen.set(rangeKey(section), (seen.get(rangeKey(section)) || 0) + 1);
  for (const [key, count] of seen) {
    if (count < 2) continue;
    const [lineStart, lineEnd] = key.split(':').map(Number);
    findings.push({ code: 'SPLIT_SECTION_ASSIGNED_TWICE', detail: { line_start: lineStart, line_end: lineEnd, count } });
  }

  // The same range twice is reported once, as the assignment it is, rather
  // than a second time as a generic overlap of itself.
  let cursor = 1;
  let reach = 0;
  for (const section of ordered) {
    if (section.line_start > cursor) {
      findings.push({ code: 'SPLIT_COVERAGE_GAP', detail: { line_start: cursor, line_end: section.line_start - 1 } });
    } else if (section.line_start <= reach && seen.get(rangeKey(section)) < 2) {
      findings.push({
        code: 'SPLIT_COVERAGE_OVERLAP',
        detail: { line_start: section.line_start, line_end: Math.min(reach, section.line_end) },
      });
    }
    reach = Math.max(reach, section.line_end);
    cursor = reach + 1;
  }
  if (cursor <= lineCount) {
    findings.push({ code: 'SPLIT_COVERAGE_GAP', detail: { line_start: cursor, line_end: lineCount } });
  }
  return findings;
}

function boundaryFindings(ordered, derived, starts, lineCount) {
  const headings = new Set(derived.filter((item) => item.kind === 'heading').map((item) => item.line_start));
  const findings = [];
  for (const section of ordered) {
    if (!starts.has(section.line_start)) {
      findings.push({ code: 'SPLIT_SECTION_BOUNDARY_INVALID', detail: { line: section.line_start, edge: 'start' } });
    }
    if (section.line_end < lineCount && !starts.has(section.line_end + 1)) {
      findings.push({ code: 'SPLIT_SECTION_BOUNDARY_INVALID', detail: { line: section.line_end + 1, edge: 'end' } });
    }
    for (const heading of headings) {
      if (heading > section.line_start && heading <= section.line_end) {
        findings.push({
          code: 'SPLIT_SECTION_SPANS_HEADING',
          detail: { line_start: section.line_start, line_end: section.line_end, heading_line: heading },
        });
      }
    }
  }
  return findings;
}

// #200: "One output can use non-adjacent sections when they form one concept.
// The proposal lists their exact output order. Source order is the default; a
// different order must be explicit." Explicit means every section of that
// output declares its own position, and the positions are exactly one per
// section -- a half-declared or skipping order is refused, not completed here.
function outputGroups(ordered, rows) {
  const groups = new Map();
  ordered.forEach((section, index) => {
    if (section.disposition !== 'assigned') return;
    if (!groups.has(section.output)) groups.set(section.output, []);
    groups.get(section.output).push({ order: section.order, row: rows[index] });
  });

  const findings = [];
  const outputs = [...groups.keys()].sort().map((output) => {
    const items = groups.get(output);
    const declared = items.filter((item) => Number.isInteger(item.order));
    const explicit = declared.length === items.length;
    if (declared.length > 0 && !explicit) {
      findings.push({ code: 'SPLIT_OUTPUT_ORDER_INCOMPLETE', detail: { output } });
    } else if (explicit) {
      const sorted = declared.map((item) => item.order).sort((a, b) => a - b);
      if (!sorted.every((value, index) => value === index + 1)) {
        findings.push({ code: 'SPLIT_OUTPUT_ORDER_INVALID', detail: { output, orders: items.map((item) => item.order) } });
      }
    }
    const inOrder = explicit ? [...items].sort((a, b) => a.order - b.order) : items;
    inOrder.forEach((item, index) => { item.row.output_order = index + 1; });
    return {
      output,
      order_explicit: explicit,
      sections: inOrder.map((item) => ({ line_start: item.row.line_start, line_end: item.row.line_end })),
    };
  });
  return { outputs, findings };
}

/*
 * `supplied` is `null` for a source that is only being sectioned (no
 * disposition decided yet), or the caller's own complete accounting:
 * `[{ line_start, line_end, disposition: 'assigned'|'residue', output?, order? }]`,
 * already shape-checked by the caller.
 *
 * Returns `{ line_count, sections, outputs, findings }`. `findings` are
 * `{ code, detail }` pairs the caller turns into wrapper findings; an empty
 * `findings` on a supplied accounting means it covers the complete source
 * once, with one disposition each and one accepted output order.
 */
function account(raw, supplied) {
  const lines = splitLines(raw);
  const derived = deriveSections(raw, lines);
  if (supplied === null) {
    return { line_count: lines.length, sections: derived, outputs: [], findings: [] };
  }

  const ordered = [...supplied].sort((a, b) => a.line_start - b.line_start || a.line_end - b.line_end);
  const rows = ordered.map((section, index) => suppliedRow(index, derived, section, lines));
  const outside = ordered.filter((section) => section.line_start < 1
    || section.line_end < section.line_start || section.line_end > lines.length);
  if (outside.length > 0) {
    return {
      line_count: lines.length,
      sections: rows,
      outputs: [],
      findings: outside.map((section) => ({
        code: 'SPLIT_SECTION_RANGE_INVALID',
        detail: { line_start: section.line_start, line_end: section.line_end, line_count: lines.length },
      })),
    };
  }

  // A derived section's own first line is a legal boundary by construction --
  // a preamble opening right under a frontmatter block starts no visible block
  // of its own, but the accounting still has to be able to begin there.
  const starts = blockStarts(raw, lines);
  for (const section of derived) starts.add(section.line_start);

  const grouped = outputGroups(ordered, rows);
  return {
    line_count: lines.length,
    sections: rows,
    outputs: grouped.outputs,
    findings: [
      ...coverageFindings(ordered, lines.length),
      ...boundaryFindings(ordered, derived, starts, lines.length),
      ...grouped.findings,
    ],
  };
}

module.exports = { identify, account };
