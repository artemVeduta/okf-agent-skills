/*
PROVISIONAL (spec section 11 open item): the specification leaves the reader/writer
implementation, the parse-tree comparison interface and the finding-code vocabulary
undecided. Invented here, pending a decision:
  - the YAML subset the reader accepts and the canonical form the writer emits
  - the parse-tree comparison interface (deep structural equality, first differing
    path reported as the responsible construct)
  - the finding codes ROOT_DECLARATION_NOT_EXACT, FRONTMATTER_UNPARSEABLE,
    TYPE_MISSING, BUNDLE_FILES_NONCONFORMING, SOURCE_RESOURCE_MISSING,
    GENERATED_BY_MISSING, RUNTIME_MISSING, HUMAN_PREFIX_MISSING,
    PARSE_TREE_MISMATCH, DEPENDS_ON_BLOCKED_CONCEPT, and the two added in this pass,
    CONCEPT_OUTSIDE_BUNDLE (blocking) and UNRESOLVED_INTERNAL_LINK (non-blocking)
  - the set of recognized non-human actor prefixes (NON_HUMAN_ACTORS below)
  - upstream findings propagate one level only; cycles are therefore not walked
*/

const path = require('node:path');
const { inside } = require('./reach');

const NON_HUMAN_ACTORS = ['agent:', 'tool:'];

// ---------------------------------------------------------------- frontmatter

function extractFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') {
    return { unterminated: false, missing: true, frontmatter: '', body: text };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, '') !== '---') continue;
    return {
      unterminated: false,
      frontmatter: lines.slice(1, i).map((l) => l.replace(/\r$/, '')).join('\n'),
      body: lines.slice(i + 1).join('\n'),
    };
  }
  return { unterminated: true, frontmatter: '', body: '' };
}

// --------------------------------------------------------------------- reader

function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i);
    }
  }
  return s;
}

function parseYAML(text) {
  const lines = text.split('\n');
  let idx = 0;

  function fail(line, reason) {
    const err = new Error(reason);
    err.line = line;
    err.reason = reason;
    throw err;
  }

  function indentOf(i) {
    const ws = lines[i].match(/^[ \t]*/)[0];
    if (ws.includes('\t')) fail(i + 1, 'tab indentation is not supported');
    return ws.length;
  }

  function skipBlank() {
    while (idx < lines.length && (lines[idx].trim() === '' || lines[idx].trimStart().startsWith('#'))) idx++;
  }

  function isSeqText(t) {
    return t === '-' || t.startsWith('- ');
  }

  function quoteEnd(s, line) {
    const q = s[0];
    for (let i = 1; i < s.length; i++) {
      if (q === '"' && s[i] === '\\') i++;
      else if (s[i] === q) {
        if (q === "'" && s[i + 1] === "'") i++;
        else return i;
      }
    }
    return fail(line, 'unterminated quoted scalar');
  }

  // YAML 1.2 Core Schema tag resolution (spec 1.2.2 section 10.3.2): only these
  // exact-case words are null/bool; every other capitalization (`Yes`, `on`, ...)
  // is a plain string, and is returned as one below.
  const NULL_WORDS = new Set(['~', 'null', 'Null', 'NULL']);
  const TRUE_WORDS = new Set(['true', 'True', 'TRUE']);
  const FALSE_WORDS = new Set(['false', 'False', 'FALSE']);

  // Core Schema double-quote escapes this reader supports. Anything else
  // (`\xNN`, `\uNNNN`, `\a`, `\N`, ...) is refused rather than silently
  // stripped of its backslash, which would change the string's meaning.
  const DOUBLE_QUOTE_ESCAPES = { '\\': '\\', '"': '"', n: '\n', t: '\t', r: '\r', '0': '\0' };

  function decodeDoubleQuoted(body, line) {
    let out = '';
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c !== '\\') { out += c; continue; }
      i += 1;
      const esc = body[i];
      if (esc === undefined) fail(line, 'unterminated escape sequence in a double-quoted scalar');
      if (!Object.hasOwn(DOUBLE_QUOTE_ESCAPES, esc)) fail(line, `unsupported escape sequence '\\${esc}' in a double-quoted scalar`);
      out += DOUBLE_QUOTE_ESCAPES[esc];
    }
    return out;
  }

  // Splits the inside of a single-line `[ ... ]` flow sequence on top-level
  // commas, respecting quotes. A nested `[` or `{` is refused rather than
  // partially parsed, since this reader supports flow sequences of scalars
  // only (the OKF v0.2 frontmatter model uses them only for lists like
  // `tags: [architecture]`).
  function splitFlowSeq(inner, line) {
    const items = [];
    let cur = '';
    let quote = null;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (quote) {
        cur += c;
        if (quote === '"' && c === '\\') { i += 1; cur += inner[i] ?? ''; }
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '[' || c === '{') fail(line, 'a nested flow collection is not supported');
      if (c === ',') { items.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (quote) fail(line, 'unterminated quoted scalar in a flow sequence');
    items.push(cur.trim());
    if (items.some((item) => item === '')) fail(line, 'a flow sequence item is empty');
    return items;
  }

  function decode(t, line) {
    if (NULL_WORDS.has(t) || t === '') return null;
    if (TRUE_WORDS.has(t)) return true;
    if (FALSE_WORDS.has(t)) return false;
    if (t === '[]') return [];
    if (t === '{}') return {};
    if (t[0] === '"' || t[0] === "'") {
      if (quoteEnd(t, line) !== t.length - 1) fail(line, 'unexpected text after a quoted scalar');
      const body = t.slice(1, -1);
      return t[0] === '"' ? decodeDoubleQuoted(body, line) : body.replace(/''/g, "'");
    }
    if (isSeqText(t)) fail(line, 'nested sequences are not supported');
    if ('|>'.includes(t[0])) fail(line, 'block scalars are not supported');
    if (t[0] === '[') {
      if (t[t.length - 1] !== ']') fail(line, 'a flow sequence must open and close on the same line');
      return splitFlowSeq(t.slice(1, -1), line).map((item) => decode(item, line));
    }
    if (t[0] === '{') fail(line, 'flow mappings are not supported');
    if ('&*!%@`'.includes(t[0])) fail(line, `unsupported construct: ${t[0]}`);
    if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(t) || /^[-+]?0[oO][0-7]+$/.test(t)) {
      fail(line, `numeric literal '${t}' is not supported; quote it as a string`);
    }
    if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
      if (String(Number(t)) === t) return Number(t);
      fail(line, `numeric literal '${t}' cannot be represented exactly; quote it as a string`);
    }
    return t;
  }

  // Returns { key, value } when the text opens a mapping entry, null when it is a scalar.
  function splitKey(s, line) {
    let colon = -1;
    if (s[0] === '"' || s[0] === "'") {
      const end = quoteEnd(s, line);
      if (s[end + 1] !== ':' || (end + 2 < s.length && s[end + 2] !== ' ')) return null;
      colon = end + 1;
    } else {
      for (let i = 0; i < s.length; i++) {
        if (s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ')) { colon = i; break; }
      }
      if (colon < 0) return null;
      if (s.slice(0, colon).includes(':')) fail(line, 'a colon inside a key requires quoting');
    }
    const raw = s.slice(0, colon).trim();
    if (raw === '') fail(line, 'empty key');
    return { key: decode(raw, line), value: s.slice(colon + 1).trim() };
  }

  function assign(obj, seen, kv, ownIndent, line) {
    if (seen.has(kv.key)) fail(line, `duplicate key '${kv.key}'`);
    seen.add(kv.key);
    if (kv.value !== '') {
      obj[kv.key] = decode(kv.value, line);
      return;
    }
    skipBlank();
    if (idx < lines.length && indentOf(idx) === ownIndent && isSeqText(lines[idx].trim())) {
      obj[kv.key] = parseSeq(ownIndent);
    } else {
      obj[kv.key] = parseNode(ownIndent + 1);
    }
  }

  function parseNode(minIndent) {
    skipBlank();
    if (idx >= lines.length) return null;
    const ind = indentOf(idx);
    if (ind < minIndent) return null;
    return isSeqText(lines[idx].trim()) ? parseSeq(ind) : parseMapInto(ind, {}, new Set());
  }

  function parseSeq(indent) {
    const arr = [];
    for (;;) {
      skipBlank();
      if (idx >= lines.length || indentOf(idx) !== indent || !isSeqText(lines[idx].trim())) break;
      const trimmed = stripComment(lines[idx]).trim();
      const after = trimmed.slice(1);
      const keyCol = indent + 1 + (after.length - after.trimStart().length);
      const rest = after.trim();
      idx += 1;
      if (rest === '') {
        arr.push(parseNode(indent + 1));
        continue;
      }
      const kv = splitKey(rest, idx);
      if (!kv) {
        arr.push(decode(rest, idx));
        continue;
      }
      const obj = {};
      const seen = new Set();
      assign(obj, seen, kv, keyCol, idx);
      parseMapInto(keyCol, obj, seen);
      arr.push(obj);
    }
    return arr;
  }

  function parseMapInto(indent, obj, seen) {
    for (;;) {
      skipBlank();
      if (idx >= lines.length) break;
      const ind = indentOf(idx);
      if (ind > indent) fail(idx + 1, 'unexpected indentation');
      if (ind < indent || isSeqText(lines[idx].trim())) break;
      const line = stripComment(lines[idx]).trim();
      idx += 1;
      if (line === '...') fail(idx, 'multi-document markers are not supported in frontmatter');
      const kv = splitKey(line, idx);
      if (!kv) fail(idx, 'expected "key: value"');
      assign(obj, seen, kv, indent, idx);
    }
    return obj;
  }

  const root = parseNode(0);
  skipBlank();
  if (idx < lines.length) fail(idx + 1, 'unexpected content after the document');
  if (root === null) return {};
  if (Array.isArray(root)) fail(1, 'a top-level sequence is not supported');
  return root;
}

// --------------------------------------------------------------------- writer

function needsQuoting(s) {
  return (
    s === '' ||
    s === 'null' || s === 'true' || s === 'false' || s === '~' ||
    s !== s.trim() ||
    /^-?\d+(\.\d+)?$/.test(s) ||
    /:( |$)/.test(s) ||
    s.includes('#') ||
    s.includes('\n') ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s)
  );
}

function quote(s) {
  if (!needsQuoting(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function canonicalYAML(value) {
  function isEmpty(v) {
    return (Array.isArray(v) && v.length === 0) || (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  }

  function write(val, indent) {
    const sp = ' '.repeat(indent);
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'string') return quote(val);
    if (typeof val !== 'object') return String(val);

    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      return val.map((item) => {
        const s = write(item, 0);
        if (!s.includes('\n')) return `${sp}- ${s}`;
        const ls = s.split('\n');
        return `${sp}- ${ls[0]}\n${ls.slice(1).map((x) => `${sp}  ${x}`).join('\n')}`;
      }).join('\n');
    }

    const keys = Object.keys(val).sort();
    if (!keys.length) return '{}';
    return keys.map((key) => {
      const v = val[key];
      if (v === null || typeof v !== 'object' || isEmpty(v)) return `${sp}${quote(key)}: ${write(v, 0)}`;
      const nested = write(v, 0).split('\n').map((x) => `${sp}  ${x}`).join('\n');
      return `${sp}${quote(key)}:\n${nested}`;
    }).join('\n');
  }

  return write(value, 0);
}

function serializeFrontmatter(tree) {
  return `---\n${canonicalYAML(tree)}\n---\n`;
}

function parseFrontmatter(text) {
  const extracted = extractFrontmatter(text);
  const reason = extracted.missing
    ? 'missing opening frontmatter delimiter'
    : extracted.unterminated
      ? 'unterminated frontmatter block'
      : null;
  if (reason !== null) {
    const err = new Error(reason);
    err.line = 0;
    err.reason = reason;
    throw err;
  }
  return extracted;
}

// ----------------------------------------------------------- tree comparison

function parseTreeEqual(a, b, at = '') {
  const here = at || 'root';
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { equal: a === b, path: here };
  }
  if (Array.isArray(a) !== Array.isArray(b)) return { equal: false, path: here };

  if (Array.isArray(a)) {
    if (a.length !== b.length) return { equal: false, path: here };
    for (let i = 0; i < a.length; i++) {
      const r = parseTreeEqual(a[i], b[i], at ? `${at}[${i}]` : `[${i}]`);
      if (!r.equal) return r;
    }
    return { equal: true };
  }

  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  for (const k of ka) {
    if (!kb.includes(k)) return { equal: false, path: at ? `${at}.${k}` : k };
  }
  for (const k of kb) {
    if (!ka.includes(k)) return { equal: false, path: at ? `${at}.${k}` : k };
  }
  for (const k of ka) {
    const r = parseTreeEqual(a[k], b[k], at ? `${at}.${k}` : k);
    if (!r.equal) return r;
  }
  return { equal: true };
}

// -------------------------------------------------------------------- gate

const blocker = (code, origin, detail) => ({ code, origin, severity: 'error', blocks: true, detail });
const warn = (code, origin, detail) => ({ code, origin, severity: 'warning', blocks: false, detail });

function sortFindings(findings) {
  const key = (f) => `${f.code} ${JSON.stringify(f.detail)}`;
  return findings.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

function rootFinding(observed) {
  let observedType = 'absent';
  if (observed !== undefined) {
    if (observed === null) observedType = 'null';
    else if (Array.isArray(observed)) observedType = 'sequence';
    else if (typeof observed === 'object') observedType = 'mapping';
    else observedType = typeof observed;
  }
  return blocker('ROOT_DECLARATION_NOT_EXACT', 'suite', {
    observed: observed === undefined ? null : observed,
    observed_type: observedType,
  });
}

function readTree(file, services) {
  const text = services.readFile(file);
  const extracted = extractFrontmatter(text);
  if (extracted.unterminated) {
    const err = new Error('unterminated frontmatter block');
    err.line = 0;
    err.reason = err.message;
    throw err;
  }
  return { tree: parseYAML(extracted.frontmatter), body: extracted.body, text };
}

// Step 1: the bundle root must declare exactly the string "0.2".
function checkRoot(bundleRoot, services) {
  const indexPath = path.join(bundleRoot, 'index.md');
  if (!services.exists(indexPath)) return rootFinding(undefined);
  let tree = {};
  try {
    tree = readTree(indexPath, services).tree;
  } catch {
    tree = {};
  }
  return tree.okf_version === '0.2' ? null : rootFinding(tree.okf_version);
}

function projectMode(bundleRoot, services) {
  try {
    const tree = readTree(path.join(bundleRoot, 'index.md'), services).tree;
    return tree.project_mode === 'code-backed' || tree.project_mode === 'knowledge-only' ? tree.project_mode : null;
  } catch {
    return null;
  }
}

// Step 2: the concept must resolve inside the bundle root. `inside` comes from reach.js.

function readConcept(file, rel, services) {
  if (!services.exists(file)) {
    return { finding: blocker('FRONTMATTER_UNPARSEABLE', 'okf', { path: rel, line: 1, reason: 'file not found' }) };
  }
  try {
    return readTree(file, services);
  } catch (err) {
    if (err.reason === undefined) throw err;
    return {
      finding: blocker('FRONTMATTER_UNPARSEABLE', 'okf', { path: rel, line: err.line + 1, reason: err.reason }),
    };
  }
}

// Step 3, section 11 test 3: a present index.md or log.md must parse.
function checkBundleFiles(bundleRoot, services, findings) {
  for (const name of ['index.md', 'log.md']) {
    const file = path.join(bundleRoot, name);
    if (!services.exists(file)) continue;
    try {
      readTree(file, services);
    } catch (err) {
      if (err.reason === undefined) throw err;
      findings.push(blocker('BUNDLE_FILES_NONCONFORMING', 'okf', { file: name, line: err.line + 1, reason: err.reason }));
    }
  }
}

// Step 3: section 11 test 2 and the four producer obligations, on the merged tree.
function checkConcept(tree, rel, findings) {
  if (tree.type === undefined || tree.type === '') {
    findings.push(blocker('TYPE_MISSING', 'okf', { path: rel }));
  }

  const entries = (key) => (Array.isArray(tree[key]) ? tree[key] : []);
  const missing = (v) => v === undefined || v === null || v === '';

  entries('sources').forEach((source, index) => {
    if (source && typeof source === 'object' && missing(source.resource)) {
      findings.push(blocker('SOURCE_RESOURCE_MISSING', 'okf', { path: rel, index }));
    }
  });

  entries('generated').forEach((item, index) => {
    if (item && typeof item === 'object' && missing(item.by)) {
      findings.push(blocker('GENERATED_BY_MISSING', 'okf', { path: rel, index }));
    }
  });

  if (tree.type === 'Attested Computation' && missing(tree.runtime)) {
    findings.push(blocker('RUNTIME_MISSING', 'okf', { path: rel }));
  }

  for (const field of ['author', 'confirmed']) {
    const values = Array.isArray(tree[field]) ? tree[field] : [tree[field]];
    for (const value of values) {
      if (typeof value !== 'string' || value === '') continue;
      if (value.startsWith('human:') || NON_HUMAN_ACTORS.some((p) => value.startsWith(p))) continue;
      findings.push(blocker('HUMAN_PREFIX_MISSING', 'okf', { path: rel, field, value }));
    }
  }
}

function sourceLinks(tree) {
  return (Array.isArray(tree.sources) ? tree.sources : [])
    .filter((s) => s && typeof s === 'object' && typeof s.resource === 'string' && s.resource !== '')
    .map((s) => s.resource);
}

// A directory is not an existing file for source-link resolution purposes.
function resolvesToFile(file, bundleRoot, services) {
  return Boolean(file) && inside(file, bundleRoot) && services.exists(file) && services.isFile(file);
}

function checkLinks(tree, rel, bundleRoot, services, findings) {
  for (const resource of sourceLinks(tree)) {
    const file = internalResourcePath(bundleRoot, resource);
    if (!file) continue;
    if (!resolvesToFile(file, bundleRoot, services)) {
      findings.push(warn('UNRESOLVED_INTERNAL_LINK', 'okf', { path: rel, resource }));
    }
  }
}

// Step 4: a concept rebuilt from a blocked upstream is blocked too. Upstream findings
// that do not block are surfaced unchanged so a SHOULD violation stays visible.
function checkUpstreams(tree, rel, bundleRoot, services, findings) {
  for (const resource of sourceLinks(tree)) {
    const file = internalResourcePath(bundleRoot, resource);
    if (!file || !resolvesToFile(file, bundleRoot, services)) continue;
    const upstream = readConcept(file, resource, services);
    const upstreamFindings = [];
    if (upstream.finding) {
      upstreamFindings.push(upstream.finding);
    } else {
      checkConcept(upstream.tree, resource, upstreamFindings);
      checkLinks(upstream.tree, resource, bundleRoot, services, upstreamFindings);
    }
    if (upstreamFindings.some((f) => f.blocks)) {
      findings.push(blocker('DEPENDS_ON_BLOCKED_CONCEPT', 'suite', { path: rel, blocked_concept: resource }));
    } else {
      findings.push(...upstreamFindings);
    }
  }
}

// Step 6: the canonical bytes must re-parse to the same tree.
function roundTripMismatch(tree, serialized) {
  let reparsed;
  try {
    reparsed = parseYAML(extractFrontmatter(serialized).frontmatter);
  } catch (err) {
    return { construct: 'unknown', reason: err.reason || err.message };
  }
  const comparison = parseTreeEqual(tree, reparsed);
  return comparison.equal ? null : { construct: comparison.path, reason: 'tree mismatch' };
}

function evaluate(request, services) {
  const bundleRoot = path.resolve(request.payload.bundle);
  const rel = request.payload.concept;
  const findings = [];
  const done = (result, data) => ({ result, data, findings: sortFindings(findings) });

  const root = checkRoot(bundleRoot, services);
  if (root) {
    findings.push(root);
    return done('blocked', {});
  }

  const conceptPath = path.resolve(bundleRoot, rel);
  if (!inside(conceptPath, bundleRoot)) {
    findings.push(blocker('CONCEPT_OUTSIDE_BUNDLE', 'suite', { path: rel }));
    return done('blocked', { path: rel });
  }

  const current = readConcept(conceptPath, rel, services);
  if (current.finding) {
    findings.push(current.finding);
    return done('blocked', { path: rel });
  }

  const set = request.payload.set || {};
  const tree = { ...current.tree, ...set };
  if (Object.hasOwn(tree, 'trust_tier')) {
    findings.push(blocker('WRITTEN_TRUST_TIER', 'suite', { path: rel }));
    return done('blocked', { path: rel });
  }
  checkBundleFiles(bundleRoot, services, findings);
  checkConcept(tree, rel, findings);
  checkLinks(tree, rel, bundleRoot, services, findings);
  checkUpstreams(tree, rel, bundleRoot, services, findings);
  if (findings.some((f) => f.blocks)) return done('blocked', { path: rel });

  const verificationPreservingFields = new Set(['status', 'stale_after', 'generated', 'verified', 'format']);
  const verificationInvalidated = Object.keys(set).some((field) => (
    !verificationPreservingFields.has(field) && !parseTreeEqual(current.tree[field], set[field]).equal
  ));
  if (verificationInvalidated) {
    delete tree.verified;
    findings.push(warn('INLINE_VERIFICATION_INVALIDATED', 'suite', { path: rel }));
  }

  if ('verified' in tree && !Array.isArray(tree.verified)) tree.verified = [tree.verified];

  const serialized = serializeFrontmatter(tree);
  const mismatch = roundTripMismatch(tree, serialized);
  if (mismatch) {
    findings.push(blocker('PARSE_TREE_MISMATCH', 'suite', { path: rel, ...mismatch }));
    return done('blocked', { path: rel });
  }

  const rendered = serialized + current.body;
  if (rendered === current.text) return done('ok', { written: false, path: rel, tree });

  return done('ok', { written: true, path: rel, tree, rendered, expected: current.text, file: conceptPath });
}

function evaluateCreate(request, services) {
  const bundleRoot = path.resolve(request.payload.bundle);
  const rel = request.payload.concept;
  const findings = [];
  const done = (result, data) => ({ result, data, findings: sortFindings(findings) });
  const root = checkRoot(bundleRoot, services);
  if (root) {
    findings.push(root);
    return done('blocked', { path: rel });
  }

  const conceptPath = path.resolve(bundleRoot, rel);
  if (!inside(conceptPath, bundleRoot) || conceptPath === bundleRoot) {
    findings.push(blocker('CONCEPT_OUTSIDE_BUNDLE', 'suite', { path: rel }));
    return done('blocked', { path: rel });
  }
  if (services.exists(conceptPath)) {
    findings.push(blocker('CONCEPT_ALREADY_EXISTS', 'suite', { path: rel }));
    return done('blocked', { path: rel });
  }

  const tree = { ...(request.payload.set || {}), status: 'draft' };
  if (Object.hasOwn(tree, 'trust_tier')) {
    findings.push(blocker('WRITTEN_TRUST_TIER', 'suite', { path: rel }));
    return done('blocked', { path: rel });
  }
  checkBundleFiles(bundleRoot, services, findings);
  checkConcept(tree, rel, findings);
  if (findings.some((finding) => finding.blocks)) return done('blocked', { path: rel });

  const serialized = serializeFrontmatter(tree);
  const mismatch = roundTripMismatch(tree, serialized);
  if (mismatch) {
    findings.push(blocker('PARSE_TREE_MISMATCH', 'suite', { path: rel, ...mismatch }));
    return done('blocked', { path: rel });
  }
  return done('ok', {
    written: true,
    path: rel,
    tree,
    rendered: serialized + (typeof request.payload.body === 'string' ? request.payload.body : ''),
    expected: null,
    file: conceptPath,
  });
}

// `init` parses the root text directly rather than through `readTree`, because an
// existing-but-unparseable root is a valid input here (whole-file overwrite), not a
// thrown error the way it is for every other reader in this module.
function parseTreeFromText(text) {
  const extracted = extractFrontmatter(text);
  if (extracted.unterminated) {
    const err = new Error('unterminated frontmatter block');
    err.line = 0;
    err.reason = err.message;
    throw err;
  }
  return { tree: parseYAML(extracted.frontmatter), body: extracted.body };
}

// Walks up from `dir` to the nearest ancestor that exists, mirroring the bootstrap
// reality that the bundle directory itself may not exist yet.
function nearestExistingDir(dir, services) {
  let current = dir;
  for (;;) {
    if (services.exists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

// `init` writes only the bundle root. It is idempotent (a valid root with nothing
// to add is a no-op, not an error) and repairing (an absent, wrong, or unparseable
// `okf_version` is overwritten). `project_mode` is optional and merges into an
// already-valid root on a second call.
function evaluateInit(request, services) {
  const bundleRoot = path.resolve(request.payload.bundle);
  const indexPath = path.join(bundleRoot, 'index.md');
  const findings = [];
  const done = (result, data) => ({ result, data, findings: sortFindings(findings) });

  if (!services.writable(nearestExistingDir(bundleRoot, services))) {
    findings.push(blocker('PARENT_DIRECTORY_NOT_WRITABLE', 'suite', { gate: 'init', path: 'index.md' }));
    return done('blocked', {});
  }

  let currentText = null;
  let currentTree = null;
  let currentBody = null;
  let parseable = false;
  if (services.exists(indexPath)) {
    currentText = services.readFile(indexPath);
    try {
      const parsed = parseTreeFromText(currentText);
      currentTree = parsed.tree;
      currentBody = parsed.body;
      parseable = true;
    } catch {
      parseable = false;
    }
  }

  const projectMode = request.payload.project_mode;
  const baseTree = parseable ? currentTree : {};
  const tree = { ...baseTree, okf_version: '0.2' };
  if (projectMode !== undefined) tree.project_mode = projectMode;

  const alreadyValid = parseable && currentTree.okf_version === '0.2' &&
    (projectMode === undefined || currentTree.project_mode === projectMode);
  if (alreadyValid) return done('ok', { written: false, tree: currentTree });

  const serialized = serializeFrontmatter(tree);
  const mismatch = roundTripMismatch(tree, serialized);
  if (mismatch) {
    findings.push(blocker('PARSE_TREE_MISMATCH', 'suite', { path: 'index.md', ...mismatch }));
    return done('blocked', {});
  }

  const body = parseable ? currentBody : '# Bundle\n';
  return done('ok', {
    written: true,
    tree,
    rendered: serialized + body,
    expected: currentText,
    file: indexPath,
  });
}

// Post-write for `init` re-reads only the root declaration and confirms the saved
// parse tree matches what was written; it is not a concept, so `postWrite`'s
// concept-shaped checks (type, sources, links, upstreams) do not apply.
function postWriteInit(bundleRoot, services, expectedTree) {
  const findings = [];
  try {
    const current = readTree(path.join(bundleRoot, 'index.md'), services);
    const comparison = parseTreeEqual(expectedTree, current.tree);
    if (!comparison.equal) {
      findings.push(blocker('POST_WRITE_VALIDATION_FAILED', 'suite', { path: 'index.md', construct: comparison.path, reason: 'saved tree mismatch' }));
    }
    return { valid: !findings.some((finding) => finding.blocks), findings: sortFindings(findings) };
  } catch (error) {
    return { valid: false, findings: [blocker('POST_WRITE_VALIDATION_FAILED', 'suite', { path: 'index.md', reason: error.message || 'read failed' })] };
  }
}

// Read-only counterpart to `evaluateInit`: `/setup`'s inspection report for the
// bundle root. Reuses the same parser as `evaluateInit` so the two never drift on
// what counts as parseable or valid; unlike `evaluateInit` it never touches disk.
function inspectIndex(bundleRoot, services) {
  const indexPath = path.join(bundleRoot, 'index.md');
  if (!services.exists(indexPath)) return { state: 'missing' };
  let tree;
  try {
    tree = parseTreeFromText(services.readFile(indexPath)).tree;
  } catch (error) {
    return { state: 'invalid', reason: error.reason || 'unparseable_frontmatter' };
  }
  if (tree.okf_version !== '0.2') return { state: 'invalid', reason: 'missing_or_wrong_okf_version' };
  return { state: 'ok' };
}

function postWrite(bundleRoot, rel, services, expectedTree) {
  const findings = [];
  const file = path.resolve(bundleRoot, rel);
  try {
    const root = checkRoot(bundleRoot, services);
    if (root) findings.push(root);
    if (!projectMode(bundleRoot, services)) {
      findings.push(blocker('PROJECT_MODE_INVALID', 'suite', { gate: 'project mode' }));
    }
    const current = readConcept(file, rel, services);
    if (current.finding) {
      findings.push(current.finding);
      return { valid: false, findings: sortFindings(findings) };
    }
    if (expectedTree !== undefined) {
      const comparison = parseTreeEqual(expectedTree, current.tree);
      if (!comparison.equal) findings.push(blocker('POST_WRITE_VALIDATION_FAILED', 'suite', { path: rel, construct: comparison.path, reason: 'saved tree mismatch' }));
    }
    checkBundleFiles(bundleRoot, services, findings);
    checkConcept(current.tree, rel, findings);
    checkLinks(current.tree, rel, bundleRoot, services, findings);
    checkUpstreams(current.tree, rel, bundleRoot, services, findings);
    return { valid: !findings.some((finding) => finding.blocks), findings: sortFindings(findings) };
  } catch (error) {
    return { valid: false, findings: [blocker('POST_WRITE_VALIDATION_FAILED', 'suite', { path: rel, reason: error.message || 'read failed' })] };
  }
}

function parseReadText(text) {
  const extracted = parseFrontmatter(text);
  return { tree: parseYAML(extracted.frontmatter), body: extracted.body };
}

function parseReservedText(text) {
  const extracted = extractFrontmatter(text);
  if (extracted.missing) return;
  if (extracted.unterminated) {
    const err = new Error('unterminated frontmatter block');
    err.line = 0;
    err.reason = err.message;
    throw err;
  }
  parseYAML(extracted.frontmatter);
}

function parseFinding(code, file, error) {
  return blocker(code, 'okf', {
    [code === 'BUNDLE_FILES_NONCONFORMING' ? 'file' : 'path']: file,
    line: Number.isInteger(error.line) ? error.line + 1 : 1,
    reason: error.reason || error.message || 'read failure',
  });
}

function listedPath(bundleRoot, value) {
  const file = typeof value === 'string' ? value : value && value.path;
  if (typeof file !== 'string') return null;
  const absolute = path.resolve(bundleRoot, file);
  const relative = path.relative(bundleRoot, absolute);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  return {
    file: absolute,
    path: relative.split(path.sep).join('/'),
  };
}

function readEntries(bundleRoot, services) {
  const { files } = services.listFiles(bundleRoot);
  return files
    .map((file) => listedPath(bundleRoot, file))
    .filter(Boolean)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function readText(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function withoutFencedCode(body) {
  let fence = null;
  return body.split('\n').map((raw) => {
    const line = raw.replace(/\r$/, '');
    const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) {
        fence = { marker: match[1][0], length: match[1].length };
      } else if (
        match[1][0] === fence.marker &&
        match[1].length >= fence.length &&
        match[2].trim() === ''
      ) {
        fence = null;
      }
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function internalResourcePath(bundleRoot, resource) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)) return null;
  const target = resource.split(/[?#]/, 1)[0];
  if (target === '') return null;
  const relative = target.startsWith('/') ? `.${target}` : target;
  return path.resolve(bundleRoot, relative);
}

function citationsHeading(body) {
  const lines = withoutFencedCode(body).split('\n');
  const heading = lines.findIndex((line) => /^(?:[ \t]{0,3})# Citations[ \t]*$/.test(line));
  if (heading < 0) return false;
  for (let i = heading + 1; i < lines.length; i++) {
    if (/^(?:[ \t]{0,3})#[ \t]+/.test(lines[i])) break;
    if (/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+\S/.test(lines[i])) return true;
  }
  return false;
}

function markdownLinks(body) {
  const visible = withoutFencedCode(body)
    .split('\n')
    .map((line) => line.replace(/`[^`\n]*`/g, ''))
    .join('\n');
  const links = [];
  const pattern = /\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^\s)\n]+))/g;
  for (const match of visible.matchAll(pattern)) {
    const previous = visible[match.index - 1];
    if (previous === '!' || previous === '\\') continue;
    links.push(match[1] === undefined ? match[2] : match[1]);
  }
  return links;
}

function bodyLinkPath(resource) {
  if (
    resource === '' ||
    resource.startsWith('#') ||
    resource.startsWith('?') ||
    resource.startsWith('//') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)
  ) return null;
  const target = resource.split(/[?#]/, 1)[0];
  return target === '' ? null : target;
}

function linkVerdict(root, target, services) {
  return inside(target, root) && services.exists(target) && services.isFile(target) ? 'resolves' : 'unexpectedly-broken';
}

function validateRead(bundleRoot, services, options = {}) {
  const root = services.realpath(path.resolve(bundleRoot));
  const entries = readEntries(root, services);
  const findings = [];
  const concepts = [];
  const linkVerdicts = [];
  const today = typeof options.today === 'string' ? options.today : new Date().toISOString().slice(0, 10);
  let legacyFallback = false;

  for (const entry of entries) {
    if (!entry.path.endsWith('.md')) continue;
    const reserved = ['index.md', 'log.md'].includes(path.posix.basename(entry.path));

    let bytes;
    let parsed;
    let readSucceeded = false;
    try {
      bytes = readText(services.readFile(entry.file));
      readSucceeded = true;
      parsed = reserved ? parseReservedText(bytes) : parseReadText(bytes);
    } catch (error) {
      const code = reserved ? 'BUNDLE_FILES_NONCONFORMING' : 'FRONTMATTER_UNPARSEABLE';
      const finding = parseFinding(code, entry.path, error);
      findings.push(finding);
      if (code === 'FRONTMATTER_UNPARSEABLE') {
        concepts.push({ path: entry.path, bytes: readSucceeded ? bytes : null, findings: [finding] });
      }
      continue;
    }

    if (reserved) continue;

    const conceptFindings = [];
    const tree = parsed.tree;
    if (typeof tree.type !== 'string' || tree.type === '') {
      conceptFindings.push(blocker('TYPE_MISSING', 'okf', { path: entry.path }));
    }

    const recordLink = (resource, target) => {
      const verdict = linkVerdict(root, target, services);
      linkVerdicts.push({ path: entry.path, resource, verdict });
      if (verdict === 'unexpectedly-broken') {
        conceptFindings.push(warn('UNRESOLVED_INTERNAL_LINK', 'okf', {
          path: entry.path,
          resource,
        }));
      }
    };

    for (const resource of sourceLinks(tree)) {
      const target = internalResourcePath(root, resource);
      if (target) recordLink(resource, target);
    }

    for (const resource of markdownLinks(parsed.body)) {
      const targetPath = bodyLinkPath(resource);
      if (!targetPath) continue;
      recordLink(resource, targetPath.startsWith('/')
        ? path.resolve(root, `.${targetPath}`)
        : path.resolve(path.dirname(entry.file), targetPath));
    }

    if (typeof tree.stale_after === 'string' && tree.stale_after <= today) {
      conceptFindings.push(warn('STALE_AFTER_REACHED', 'okf', {
        path: entry.path,
        stale_after: tree.stale_after,
        today,
      }));
    }

    if (tree.generated === undefined && tree.timestamp !== undefined) legacyFallback = true;
    if (tree.sources === undefined && citationsHeading(parsed.body)) legacyFallback = true;

    const concept = { path: entry.path, bytes, findings: sortFindings(conceptFindings) };
    if (Object.hasOwn(tree, 'status')) concept.status = tree.status;
    concepts.push(concept);
    findings.push(...conceptFindings);
  }

  const report = [`OKF v0.2 bundle-conformant: ${legacyFallback || findings.some((finding) => finding.blocks) ? 'no' : 'yes'}`];
  if (legacyFallback) report.push('v0.1 consumed using v0.2 fallback');

  return {
    result: 'ok',
    data: { concepts, report, link_verdicts: linkVerdicts },
    findings: sortFindings(findings),
  };
}

function reviewFinding(code, blocks, detail) {
  return { code, origin: 'suite', severity: blocks ? 'error' : 'warning', blocks, detail };
}

function reviewVerifiers(bundleRoot, services) {
  try {
    const index = readTree(path.join(bundleRoot, 'index.md'), services).tree.review_verifiers;
    return typeof index === 'string' ? [index] : Array.isArray(index) ? index.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function verificationTier(tree, rel, verifiers, findings) {
  const events = tree.verified === undefined ? [] : (Array.isArray(tree.verified) ? tree.verified : [tree.verified]);
  let machine = false;
  let human = false;
  const unqualified = (index, reason, blocks = false) => findings.push(reviewFinding('UNQUALIFIED_VERIFICATION', blocks, { path: rel, index, reason }));

  events.forEach((event, index) => {
    if (typeof event === 'string') return unqualified(index, 'legacy string event', event.startsWith('human:'));
    if (!event || typeof event !== 'object' || Array.isArray(event)) return unqualified(index, 'invalid event');
    if (event.kind === 'machine') {
      if (typeof event.by !== 'string' || event.by === '') return unqualified(index, 'missing machine by');
      if (event.by.startsWith('human:')) return unqualified(index, 'human identity declared for machine verification', true);
      if (event.coverage !== 'complete-current-concept') return unqualified(index, 'incomplete machine coverage');
      machine = true;
      return;
    }
    if (event.kind === 'human') {
      if (typeof event.verifier !== 'string' || event.verifier === '') return unqualified(index, 'missing human verifier', true);
      if (event.coverage !== 'complete-current-concept') return unqualified(index, 'incomplete human coverage', true);
      if (!verifiers.includes(event.verifier)) return unqualified(index, 'unapproved human verifier', true);
      human = true;
      return;
    }
    unqualified(index, 'unknown verification kind', (typeof event.verifier === 'string' && event.verifier.startsWith('human:')) || (typeof event.by === 'string' && event.by.startsWith('human:')));
  });

  return human ? 'human-reviewed' : machine ? 'machine-confirmed' : 'unverified';
}

function configuredReview(bundleRoot, rel, services) {
  const configPath = path.join(bundleRoot, '.okf-review.json');
  if (!services.exists(configPath)) return { state: 'not configured' };
  let config;
  try {
    config = JSON.parse(readText(services.readFile(configPath)));
  } catch {
    return { state: 'unobservable' };
  }
  const dependencies = config && config.concepts && config.concepts[rel] && config.concepts[rel].dependencies;
  if (!Array.isArray(dependencies) || dependencies.length === 0) return { state: 'not configured' };

  const observed = dependencies.map((dependency) => {
    if (!dependency || typeof dependency.path !== 'string' || dependency.path === '') return { state: 'unobservable' };
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(dependency.path)) return { path: dependency.path, state: 'unobservable' };
    const file = path.resolve(bundleRoot, dependency.path);
    if (!inside(file, bundleRoot) || file === bundleRoot) return { path: dependency.path, state: 'unobservable' };
    if (!services.exists(file)) return { path: dependency.path, state: 'unavailable' };
    if (!Object.hasOwn(dependency, 'baseline')) return { path: dependency.path, state: 'review needed: no baseline' };
    try {
      return { path: dependency.path, state: readText(services.readFile(file)) === dependency.baseline ? 'clean' : 'changed' };
    } catch {
      return { path: dependency.path, state: 'unobservable' };
    }
  });
  const states = observed.map((dependency) => dependency.state);
  const state = states.includes('unobservable') ? 'unobservable'
    : states.includes('review needed: no baseline') ? 'review needed: no baseline'
      : states.includes('changed') ? 'changed'
        : states.includes('unavailable') ? 'unavailable' : 'clean';
  return { state, dependencies: observed };
}

function evaluateReview(request, services) {
  const bundleRoot = path.resolve(request.payload.bundle);
  const rel = request.payload.concept;
  const conceptPath = path.resolve(bundleRoot, rel);
  const findings = [];
  const fallback = {
    path: rel,
    trust_tier: 'unverified',
    staleness: { state: 'not configured' },
    review_dependencies: { state: 'unobservable' },
  };
  if (!inside(conceptPath, bundleRoot) || conceptPath === bundleRoot || !services.exists(conceptPath)) {
    return { result: 'failed/incomplete', data: fallback, findings };
  }

  let tree;
  try {
    tree = readTree(conceptPath, services).tree;
  } catch {
    return { result: 'failed/incomplete', data: fallback, findings };
  }
  const today = typeof request.payload.today === 'string' ? request.payload.today : new Date().toISOString().slice(0, 10);
  const staleness = typeof tree.stale_after === 'string'
    ? { state: today >= tree.stale_after ? 'stale' : 'current', stale_after: tree.stale_after }
    : { state: 'not configured' };
  const reviewDependencies = configuredReview(bundleRoot, rel, services);
  if (reviewDependencies.state === 'unobservable') {
    findings.push(reviewFinding('REVIEW_DEPENDENCY_UNOBSERVABLE', false, { path: rel }));
  }
  const data = {
    path: rel,
    trust_tier: verificationTier(tree, rel, reviewVerifiers(bundleRoot, services), findings),
    staleness,
    review_dependencies: reviewDependencies,
  };
  if (Object.hasOwn(tree, 'trust_tier')) {
    findings.push(reviewFinding('WRITTEN_TRUST_TIER', true, { path: rel }));
  }
  const result = findings.some((finding) => finding.blocks) ? 'blocked'
    : reviewDependencies.state === 'unobservable' ? 'failed/incomplete'
      : ['review needed: no baseline', 'changed', 'unavailable'].includes(reviewDependencies.state) ? 'review needed' : 'no-op';
  return { result, data, findings: sortFindings(findings) };
}

module.exports = {
  evaluate, evaluateCreate, evaluateInit, evaluateReview,
  inspectIndex,
  parseFrontmatter, parseYAML, serializeFrontmatter,
  postWrite, postWriteInit, projectMode, validateRead,
  withoutFencedCode, markdownLinks, bodyLinkPath,
};
