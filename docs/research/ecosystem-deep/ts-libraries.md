# TypeScript/JavaScript OKF Libraries — Deep Investigation

> Auto-generated research document. All source code was retrieved from npm registry tarballs
> and GitHub on 2026-07-25. Each API is documented from the actual distribution files.

---

## 1. @equationalapplications/core-okf

- **npm**: `@equationalapplications/core-okf` v4.22.0
- **License**: MIT
- **Repository**: [equationalapplications/expo-llm-wiki](https://github.com/equationalapplications/expo-llm-wiki) — `packages/okf/`
- **Repo Stats**: 21 stars, monorepo (6+ packages)
- **Language**: TypeScript
- **Node**: >= 20
- **Published by**: GitHub Actions (SLSA provenance)

### What it does

At the research snapshot this package was v4.22.0. It is a
**zero-dependency** set of pure functions for
serializing/parsing OKF frontmatter, building concept documents, generating `index.md` and
`log.md` files, extracting markdown cross-links, and managing "Related" sections. It is a
**builder/primitives** library — it does not read/write the filesystem, validate bundles, or
provide a bundle-class abstraction. It is the raw building block used by
`@equationalapplications/core-llm-wiki` (persistent episodic memory for LLM agents).

### Installation

```bash
npm install @equationalapplications/core-okf
```

**Zero peer dependencies.** No runtime dependencies.

### Full API Reference

All exports are **pure functions** (no classes, no filesystem access).

#### Types

```typescript
// --- Core Frontmatter ---
type OkfFrontmatterScalar = string | number | boolean | null;
type OkfFrontmatterValue = OkfFrontmatterScalar | OkfFrontmatterScalar[];

interface OkfFrontmatter {
    type: string;                      // REQUIRED
    title?: string;
    description?: string;
    resource?: string;
    tags?: string[];
    timestamp?: string;
    [key: string]: OkfFrontmatterValue | undefined;  // extension keys
}

// --- Index Builder Types ---
interface OkfIndexEntry {
    path: string;                      // relative path to concept, e.g. "facts/fact_123.md"
    title: string;                     // display title
    description?: string;
}

interface OkfIndexSection {
    heading: string;                   // e.g. "Facts", "Tasks"
    entries: OkfIndexEntry[];
}

// --- Log Builder Types ---
interface OkfLogEntry {
    date: string;                      // "YYYY-MM-DD"
    text: string;                      // bullet text
}

// --- Related Section Types ---
interface OkfMarkdownLink {
    text: string;                      // link display text
    path: string;                      // target path (excludes http/mailto)
}

interface OkfFile {
    path: string;
    content: string;
}
```

#### Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `serializeFrontmatter` | `(fm: OkfFrontmatter) => string` | Produces YAML frontmatter block (`---` delimited). Scalars are auto-quoted when needed. Arrays become YAML block lists. Handles `undefined` (omitted), `null`, booleans, numbers, strings. |
| `parseFrontmatter` | `(content: string) => { frontmatter: OkfFrontmatter; rest: string }` | Parses the subset of YAML that `serializeFrontmatter` produces. **Not** a general YAML parser. Flow collections, multi-line block scalars (`\|`, `>`), anchors, aliases not recognized. Unknown lines are silently skipped (never throws). `rest` is everything after `---`. |
| `buildConceptDocument` | `(fm: OkfFrontmatter, body: string) => string` | Combines frontmatter + markdown body into a complete `.md` file string. |
| `parseConcept` | `(content: string) => { frontmatter: OkfFrontmatter; body: string }` | Reverse of `buildConceptDocument`. Strips the leading blank-line separator between frontmatter and body. |
| `buildIndexMd` | `(sections: OkfIndexSection[]) => string` | Generates a directory-level `index.md`: `## heading` sections with bullet `* [title](path)` entries. |
| `buildRootIndexMd` | `(okfVersion: string, sections: OkfIndexSection[], options?: { profile?: string }) => string` | Generates a bundle-root `index.md` with `okf_version` and optional `profile` frontmatter, followed by sections. |
| `parseRootIndexMd` | `(content: string) => { okf_version?: string; profile?: string }` | Reads the `okf_version` and `profile` from root index frontmatter. |
| `buildEntityIndexMd` | `(options: { summary?: string; sections: OkfIndexSection[] }) => string` | Generates an entity-level index with optional summary prose and a `[Event log](./log.md)` footer link. |
| `parseEntityIndexMd` | `(content: string) => { summary: string; sections: OkfIndexSection[] }` | Parses an entity index back into summary text + sections. Skips the event log link. |
| `buildLogMd` | `(entries: OkfLogEntry[]) => string` | Serializes log entries grouped by date (`## YYYY-MM-DD`) with `- text` bullets, newest first. |
| `parseLogMd` | `(content: string) => OkfLogEntry[]` | Best-effort reverse of `buildLogMd`. Lines not matching `## YYYY-MM-DD` or `- text` are silently skipped. |
| `appendEventIdComment` | `(text: string, eventId: string) => string` | Appends `<!-- id: <eventId> -->` to a log entry text for deduplication. Validates eventId is `[A-Za-z0-9._-]+`. |
| `parseEventIdComment` | `(text: string) => { text: string; eventId?: string }` | Splits an event ID comment from log text (reverse of `appendEventIdComment`). |
| `appendRelatedSection` | `(body: string, links: Array<{ edge_type: string; path: string }>) => string` | Appends a `## Related` section with bullet links `- [edge_type](path)`. Handles body trimming/padding. |
| `splitRelatedSection` | `(body: string) => { body: string; relatedLinks: OkfMarkdownLink[] }` | Splits off the `## Related` section, returning the main body and parsed link objects. Only relative/local paths (non-http, non-mailto). |
| `extractMarkdownLinks` | `(body: string) => OkfMarkdownLink[]` | Extracts inline `[text](url)` links from markdown body. Excludes fenced code blocks, `http(s):` and `mailto:` targets. Only relative/local paths returned. Single-line regex, not a full CommonMark parser. |
| `isAllowedOkfPath` | `(filePath: string) => boolean` | Path allowlist for the llm-wiki profile. Only allows `index.md`, `entities/<name>/index.md`, `entities/<name>/log.md`, `entities/<name>/facts/*.md`, `entities/<name>/tasks/*.md`. Rejects `..` traversal. |

### Dependencies

**Zero runtime dependencies.** Dev deps: `tsup`, `typescript`, `vitest`.

### End-to-End Code Example

```typescript
import {
  serializeFrontmatter,
  parseFrontmatter,
  buildConceptDocument,
  parseConcept,
  buildIndexMd,
  buildLogMd,
  extractMarkdownLinks,
  buildRootIndexMd,
} from "@equationalapplications/core-okf";

// 1. Create frontmatter
const yaml = serializeFrontmatter({
  type: "BigQuery Table",
  title: "Orders",
  description: "Customer order records",
  tags: ["sales", "revenue"],
  resource: "https://console.cloud.google.com/bigquery/...",
  timestamp: "2026-06-23T09:00:00Z",
});

// 2. Parse frontmatter back
const { frontmatter, rest } = parseFrontmatter(yaml);
// frontmatter.type === "BigQuery Table"

// 3. Build a complete concept document
const doc = buildConceptDocument(
  { type: "BigQuery Table", title: "Orders" },
  "# Schema\n\n| Column | Type |\n|--------|------|\n| id | INTEGER |"
);

// 4. Parse a concept back
const { frontmatter: fm, body } = parseConcept(doc);

// 5. Extract cross-links (for graph edges)
const links = extractMarkdownLinks(body);
// [{ text: "customers", path: "tables/customers.md" }]

// 6. Build an index.md for a directory
const index = buildIndexMd([
  {
    heading: "Tables",
    entries: [
      { path: "orders.md", title: "Orders", description: "Customer orders" },
      { path: "customers.md", title: "Customers" },
    ],
  },
]);

// 7. Build the bundle root index.md
const rootIndex = buildRootIndexMd("0.1", [
  { heading: "Tables", entries: [{ path: "tables/orders.md", title: "Orders" }] },
], { profile: "llm-wiki/1" });

// 8. Build a log.md
const log = buildLogMd([
  { date: "2026-06-23", text: "Discovered customers table" },
  { date: "2026-06-23", text: "Documented orders schema" },
  { date: "2026-06-22", text: "Initialized OKF bundle" },
]);
```

---

## 2. js-okf

- **npm**: `js-okf` v0.3.1
- **License**: MIT
- **Author**: Prabhay Gupta (prabhay759)
- **Repository**: [prabhay759/js-okf](https://github.com/prabhay759/js-okf)
- **Repo Stats**: 0 stars, 13 commits
- **Language**: TypeScript
- **Node**: >= 18

### What it does

A TypeScript-first library that gives JS/TS code (and AI coding agents) a clean API to
**create, update (upsert), read, and list** concept files in OKF bundles. Designed to be
called by AI agents (Claude Code, Cursor, Copilot) as tool calls to persist knowledge across
sessions. Includes an HTTP server with a D3.js mind-map visualization, SSE live-reload, and
markdown rendering (`marked` + `highlight.js`).

### Installation

```bash
npm install js-okf
```

**Dependencies**: `chokidar`, `gray-matter`, `highlight.js`, `js-yaml`, `marked`.
**Required**: Node.js >= 18.

### Full API Reference

#### Types

```typescript
interface OKFMatter {
    type: string;                      // REQUIRED
    title?: string;
    description?: string;
    resource?: string;
    tags?: string[];
    timestamp?: string;                // auto-managed by js-okf
    [key: string]: unknown;            // custom extension keys
}

interface OKFConcept {
    id: string;                        // concept ID (path minus .md)
    matter: OKFMatter;
    body: string;
}

interface UpsertConceptInput {
    id: string;                        // REQUIRED, e.g. "tables/users" or "tables/users.md"
    matter: OKFMatter;                 // REQUIRED, must include `type`
    body?: string;                     // default "" on create
    bodyStrategy?: "replace" | "preserve";  // default "replace"
}

interface UpsertResult {
    id: string;                        // normalized concept ID
    filePath: string;                  // absolute path of written file
    created: boolean;                  // true if newly created
    concept: OKFConcept;               // final concept as stored on disk
}

interface BundleOptions { createIfMissing?: boolean; }
interface ListOptions { excludeSpecial?: boolean; }  // default true

interface LogEntry {
    message: string;                   // REQUIRED
    conceptId?: string;
    action?: "created" | "updated" | "deleted";
    timestamp?: string;                // ISO 8601, defaults to now
}

interface ServeOptions {
    port?: number;                     // default 3000
    host?: string;                     // default "localhost"
    open?: boolean;
}
```

#### Class: `OKFBundle`

```typescript
class OKFBundle {
    readonly root: string;

    // Open/create a bundle directory
    constructor(bundleRoot: string, options?: BundleOptions);

    // Create or update a concept. On create: parent dirs auto-created,
    // timestamp set to now. On update: matter shallow-merged, tags
    // union-merged (existing tags never dropped), timestamp refreshed.
    upsert(input: UpsertConceptInput): Promise<UpsertResult>;

    // Upsert multiple concepts in parallel
    upsertMany(inputs: UpsertConceptInput[]): Promise<UpsertResult[]>;

    // Read a concept. Returns null if not found.
    read(id: string): Promise<OKFConcept | null>;

    // List all concept IDs, sorted. Excludes "index" and "log" by default.
    list(options?: ListOptions): Promise<string[]>;

    // Regenerate index.md from all concepts. Groups by top-level directory.
    updateIndex(): Promise<void>;

    // Append a timestamped entry to log.md. Creates log.md on first call.
    appendLog(entry: LogEntry): Promise<void>;
}
```

#### Standalone Functions

```typescript
// Read a concept by absolute file path + id
function readConcept(filePath: string, id: string): Promise<OKFConcept | null>;

// One-shot upsert (same semantics as bundle.upsert())
function upsertConcept(bundleRoot: string, input: UpsertConceptInput): Promise<UpsertResult>;
```

#### Errors

```typescript
class OKFError extends Error {}
class OKFValidationError extends OKFError { readonly filePath: string; }
class OKFMissingTypeError extends OKFValidationError {}  // thrown when type is missing
```

#### HTTP Server

```typescript
// Returns { start(), stop() }. Serves a mind-map viewer at http://host:port
// with SSE live-reload (chokidar watches *.md files).
function createServer(bundleRoot: string, options?: ServeOptions): {
    start(): Promise<void>;
    stop(): Promise<void>;
};
```

**Server endpoints**: `/` (HTML mind-map viewer), `/api/concepts` (list all), `/api/concept?id=...` (read one), `/api/events` (SSE), `/vendor/d3.js`, `/vendor/marked.js`, `/vendor/hljs.js`, `/vendor/hljs.css`.

**Important note on `bodyStrategy`**: When `"preserve"` is set, updating a concept
keeps the existing body unchanged — only frontmatter is merged. When `"replace"` (default),
the body is overwritten with the new value (or kept if `body` is `undefined`).

**Tag union-merge semantics**: Tags from the incoming `matter` are union-merged with
existing tags. No existing tags are ever dropped. `timestamp` is always refreshed to
`new Date().toISOString()` on every upsert.

### Dependencies

Runtime: `chokidar ^4.0.3`, `gray-matter ^4.0.3`, `highlight.js ^11.11.1`, `js-yaml ^5.0.0`, `marked ^18.0.5`.
Vendor bundle (dev): `d3 ^7.9.0`, `puppeteer ^25.2.0`.

### End-to-End Code Example

```typescript
import { OKFBundle } from "js-okf";

// Create or open a bundle
const bundle = new OKFBundle("./knowledge", { createIfMissing: true });

// Add a new concept
await bundle.upsert({
  id: "api/authentication",
  matter: {
    type: "api",
    title: "Authentication API",
    description: "Handles JWT-based login and token refresh",
    tags: ["auth", "security"],
  },
  body: "## POST /auth/login\nAccepts email + password, returns JWT.\n\n## POST /auth/refresh\nAccepts refresh token, returns new access token.",
});

// Update — tags are union-merged, timestamp refreshed
await bundle.upsert({
  id: "api/authentication",
  matter: { type: "api", tags: ["oauth"] },
});
// tags → ["auth", "security", "oauth"]

// Read back
const concept = await bundle.read("api/authentication");
console.log(concept?.matter.tags); // ["auth", "security", "oauth"]

// Regenerate index.md
await bundle.updateIndex();

// Append to log.md
await bundle.appendLog({
  message: "Added OAuth tag to authentication concept",
  conceptId: "api/authentication",
  action: "updated",
});

// Start the visual viewer (optional)
const server = createServer("./knowledge", { port: 3000, open: true });
await server.start();
```

---

## 3. okf-tool

- **npm**: `okf-tool` v0.2.0
- **License**: Apache-2.0
- **Author**: Han Fang (hanfang5057)
- **Repository**: Listed as `hanfang/okf-tool` (404 on GitHub — likely private or renamed)
- **Language**: TypeScript
- **Node**: >= 18
- **Published with**: SLSA provenance

### What it does

A comprehensive OKF library with **pluggable filesystem abstraction** (Node.js native + in-memory
for testing/browser). Provides `OKFBundle` class for loading/saving bundles, CRUD on concepts,
full-text search with scoring, link graph analysis (forward links + backlinks), validation
against OKF v0.1 spec, and serialization (parse/write concepts, index.md, log.md).

### Installation

```bash
npm install okf-tool
```

Dependencies: `gray-matter ^4.0.3`, `js-yaml ^4.1.0`. Dev deps include Jest and TypeScript.

### Full API Reference

#### Core Types

```typescript
interface OKFFrontmatter {
    type: string;                  // REQUIRED — concept kind
    title?: string;
    description?: string;
    resource?: string;             // URI for described asset
    tags?: string[];
    timestamp?: string;            // ISO 8601
    okf_version?: string;          // bundle format version (root index only)
    [key: string]: unknown;        // preserved on round-trip
}

interface Concept {
    id: string;                    // file path minus .md, e.g. "tables/orders"
    frontmatter: OKFFrontmatter;
    body: string;                  // raw markdown after frontmatter
    filePath: string;              // e.g. "tables/orders.md"
}

interface IndexEntry { title: string; url: string; description?: string; }
interface IndexFile {
    sections: Map<string, IndexEntry[]>;   // "" = before first heading
    version?: string;
    frontmatter?: Record<string, unknown>;
}

interface LogEntry { date: string; changes: string[]; }
interface BundleManifest { rootPath: string; okfVersion: string; conceptCount: number; }

interface SearchQuery {
    type?: string | string[];      // exact match or match-any
    tags?: string[];               // AND semantics
    keyword?: string;              // case-insensitive, space-split AND
    titlePattern?: string | RegExp;
    resource?: string;
    linkTarget?: string;           // concepts linking TO this
    linkedFrom?: string;           // concepts linked FROM this
}

interface SearchResult { concept: Concept; score: number; }

interface ConceptLink {
    url: string; text: string; line: number;
    isExternal: boolean; isBundleRelative: boolean;
    targetConceptId?: string; targetFilePath?: string;
}

interface LinkGraph {
    forwardLinks: Map<string, ConceptLink[]>;
    backlinks: Map<string, string[]>;
}

interface Citation {
    number: number; text: string; url: string;
    isBundleReference: boolean; targetConceptId?: string;
}

type ValidationSeverity = "error" | "warning";
interface ValidationIssue { severity: ValidationSeverity; file: string; message: string; }
interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

interface FileStat { isDirectory(): boolean; isFile(): boolean; }

interface OKFFileSystem {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<FileStat>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    unlink(path: string): Promise<void>;
    rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
}
```

#### Class: `OKFBundle`

```typescript
class OKFBundle {
    // Static factories
    static load(rootPath: string, options?: LoadOptions): Promise<OKFBundle>;
    static init(rootPath: string, options?: InitOptions): Promise<OKFBundle>;

    // Manifest
    get manifest(): BundleManifest;

    // CRUD
    getConcept(id: string): Concept | undefined;
    listConcepts(filter?: { type?: string; tags?: string[]; resource?: string }): Concept[];
    conceptsByType(type: string): Concept[];
    get types(): string[];
    get tags(): string[];
    addConcept(concept: Concept): Promise<void>;
    updateConcept(id: string, updates: Partial<Pick<Concept, "frontmatter" | "body">>): Promise<void>;
    removeConcept(id: string): Promise<void>;
    mkdir(dirPath: string): Promise<void>;

    // Persistence
    save(): Promise<void>;
    saveConcept(id: string): Promise<void>;
    reload(): Promise<void>;

    // Search
    search(query: SearchQuery): SearchResult[];
    searchSimple(query: SearchQuery): Concept[];

    // Link graph
    get linkGraph(): LinkGraph;
    getLinks(conceptId: string): ConceptLink[];
    getBacklinks(conceptId: string): string[];

    // Citations (from # Citations section)
    getCitations(conceptId: string): Citation[];

    // Index management
    getIndex(): IndexFile | undefined;
    setIndex(index: IndexFile): void;
    generateIndex(): IndexFile;
    syncConceptToIndex(id: string): void;
    removeConceptFromIndex(id: string): void;

    // Sub-directory index/log
    getSubIndex(dir: string): IndexFile | undefined;
    setSubIndex(dir: string, index: IndexFile): void;
    generateSubIndex(dir: string): IndexFile;
    get subIndexDirs(): string[];
    syncConceptToSubIndex(id: string): void;
    removeConceptFromSubIndex(id: string): void;
    getSubLog(dir: string): LogEntry[] | undefined;
    appendSubLog(dir: string, action: string, description: string): void;

    // Log
    getLog(): LogEntry[];
    setLog(entries: LogEntry[]): void;
    appendLog(action: string, description: string): void;

    // Validation
    validate(): Promise<ValidationResult>;
}

interface LoadOptions { fs?: OKFFileSystem; skipValidation?: boolean; }
interface InitOptions {
    fs?: OKFFileSystem;
    okfVersion?: string;               // default "0.1"
    title?: string;                    // default "Knowledge Bundle"
    subdirectories?: string[];
}
```

#### Parse Functions

```typescript
// Parse a single concept file
function parseConcept(content: string, filePath: string): Concept;

// Parse concept — returns null instead of throwing on invalid frontmatter
function parseConceptSafe(content: string, filePath: string): Concept | null;

// Parse index.md into sections Map
function parseIndex(content: string): IndexFile;

// Parse log.md (## YYYY-MM-DD groupings)
function parseLog(content: string): LogEntry[];

// Parse citations from # Citations section (e.g. "[1] [Display](url)")
function parseCitations(body: string): Citation[];
```

#### Serialize Functions

```typescript
// Concept → OKF .md string (YAML frontmatter + body)
function serializeConcept(concept: Concept): string;

// IndexFile → index.md string
function serializeIndex(index: IndexFile): string;

// LogEntry[] → log.md string
function serializeLog(entries: LogEntry[], title?: string): string;
```

#### Link Graph Functions

```typescript
// Extract all [text](url) links from body (with line numbers)
function extractLinks(body: string): Array<{ url: string; text: string; line: number }>;

// Resolve a link URL relative to source concept
function resolveLink(url: string, sourceFilePath: string, knownPaths: Set<string>): {
    isExternal: boolean;
    isBundleRelative: boolean;
    targetConceptId?: string;
    targetFilePath?: string;
};

// Build forward + reverse link graph for all concepts
function buildLinkGraph(concepts: Concept[]): LinkGraph;

function getForwardLinks(graph: LinkGraph, conceptId: string): ConceptLink[];
function getBacklinks(graph: LinkGraph, conceptId: string): string[];
```

#### Search Functions

```typescript
// Ranked search with scoring
function searchConcepts(concepts: Concept[], query: SearchQuery, linkGraph?: LinkGraph): SearchResult[];

// Simple search returning concepts directly
function searchConceptsSimple(concepts: Concept[], query: SearchQuery, linkGraph?: LinkGraph): Concept[];
```

#### Validation

```typescript
// Validate full bundle directory against OKF v0.1 spec
function validateBundle(rootPath: string, fs: OKFFileSystem): Promise<ValidationResult>;
```

**Validation rules**: As a "permissive consumer" model, unknown types and broken links produce
warnings, not errors. Only structural violations (missing required fields in certain profiles)
produce errors.

#### Filesystem Adapters

```typescript
class NodeFileSystem implements OKFFileSystem { /* fs/promises backed */ }
class MemoryFileSystem implements OKFFileSystem { /* in-memory, for testing/browser */ }
function createNodeFileSystem(): NodeFileSystem;
```

#### Utilities

```typescript
const RESERVED_FILENAMES: Set<string>;  // {"index.md", "log.md"}
function isReservedFilename(name: string): boolean;
function conceptIdFromPath(filePath: string): string;     // "tables/orders.md" → "tables/orders"
function conceptPathFromId(id: string): string;           // "tables/orders" → "tables/orders.md"
function dirname(p: string): string;
function basename(p: string): string;
function joinPath(...segments: string[]): string;
function titleFromFilename(name: string): string;          // "customer_orders" → "Customer Orders"
function effectiveTitle(filePath: string, frontmatterTitle?: string): string;
function isISODate(s: string): boolean;
function isISODateTime(s: string): boolean;
function nowISO(): string;                                 // "2026-06-22T14:30:00Z"
function isoToLocal(iso: string): string;                  // → "2026-06-22 14:30:00 CST"
```

### Dependencies

Runtime: `gray-matter ^4.0.3`, `js-yaml ^4.1.0`.
Dev: `jest`, `ts-jest`, `typescript`.

### End-to-End Code Example

```typescript
import {
  OKFBundle,
  createNodeFileSystem,
  MemoryFileSystem,
} from "okf-tool";

// Use real filesystem
const fs = createNodeFileSystem();

// Initialize a new bundle
const bundle = await OKFBundle.init("./my-bundle", {
  fs,
  title: "My Knowledge Base",
  subdirectories: ["tables", "playbooks", "metrics"],
});

// Add concepts
await bundle.addConcept({
  id: "tables/orders",
  frontmatter: {
    type: "BigQuery Table",
    title: "Orders",
    tags: ["sales", "revenue"],
    resource: "https://console.cloud.google.com/bigquery/...",
  },
  body: "# Schema\n\n| Column | Type |\n|--------|------|\n| order_id | INTEGER |",
  filePath: "tables/orders.md",
});

await bundle.addConcept({
  id: "tables/customers",
  frontmatter: { type: "BigQuery Table", title: "Customers", tags: ["sales"] },
  body: "# Joins\n\nJoined with [Orders](/tables/orders.md) on `customer_id`.",
  filePath: "tables/customers.md",
});

// Search
const results = bundle.search({ keyword: "orders", tags: ["sales"] });
console.log(results.map(r => `${r.concept.id}: ${r.score}`));

// Link graph — find what links to "tables/orders"
const backlinks = bundle.getBacklinks("tables/orders");
console.log(backlinks); // ["tables/customers"]

// Persist to disk
await bundle.save();

// Validate
const validation = await bundle.validate();
console.log(validation.isValid, validation.issues);
```

---

## 4. @turbomem/okf

- **npm**: `@turbomem/okf` v1.0.0
- **License**: Apache-2.0
- **Author**: Arneesh Aima (arneeshaima)
- **Repository**: [turbomem/turbomem](https://github.com/turbomem/turbomem) — `packages/okf/`
- **Repo Stats**: 6 stars, 153 commits, monorepo
- **Language**: TypeScript
- **Node**: >= 18 (from turbomem)

### What it does

The OKF parser/validator/writer package within the **turbomem** ecosystem (embedded agent memory
for TypeScript). Bridges OKF bundles to turbomem's memory system (`bundleToFacts`, `addFromBundle`).
Provides document parsing (with `remark`/`unified` for full AST-based parsing), validation
using `zod` schemas, serialization to markdown, link graph construction, and memory-scope
integration. **Tagged as "Experimental"** in the turbomem README.

### Installation

```bash
npm install @turbomem/okf
```

**Peer dependency**: `turbomem >= 0.8.0` (optional). **Dependencies**: `fast-glob ^3.3.3`,
`gray-matter ^4.0.3`, `remark ^15.0.1`, `remark-parse ^11.0.0`, `unified ^11.0.5`,
`unist-util-visit ^5.0.0`, `zod ^3.22.0`.

### Full API Reference

#### Types

```typescript
interface OKFFrontmatter {
    type: string;              // REQUIRED
    title?: string;
    description?: string;
    resource?: string;
    tags?: string[];
    timestamp?: string;
    [key: string]: unknown;
}

interface OKFLink {
    text: string;
    href: string;
    resolvedPath?: string;     // absolute if resolved
}

interface OKFDocument {
    path: string;              // absolute path on disk
    relativePath: string;      // relative to bundle root
    frontmatter: OKFFrontmatter;
    body: string;
    links: OKFLink[];          // extracted from body
}

interface OKFBundle {
    root: string;              // bundle root directory
    documents: OKFDocument[];
    index: Map<string, OKFDocument>;   // relativePath → OKFDocument
}

interface OKFNode {
    document: OKFDocument;
    outgoing: OKFEdge[];
    incoming: OKFEdge[];
}

interface OKFEdge {
    from: OKFDocument;
    to: OKFDocument;
    linkText: string;
}

interface OKFGraph {
    nodes: Map<string, OKFNode>;
    edges: OKFEdge[];
}

interface OKFValidationResult {
    valid: boolean;
    errors: OKFValidationError[];
    warnings: OKFValidationWarning[];
}

interface OKFValidationError {
    path: string;
    message: string;
    rule: string;              // machine-readable rule code
}

interface OKFValidationWarning {
    path: string;
    message: string;
    rule: string;
}

interface ParseOptions {
    ignore?: string[];         // files/dirs to skip
    followLinks?: boolean;     // whether to resolve links
}

interface WriteOptions {
    overwrite?: boolean;       // default false — throws if file exists
}

// Memory integration types
interface OKFMemoryScope {
    userId?: string;
    agentId?: string;
    sessionId?: string;
}

interface OKFMemory {
    addFacts: (facts: string[], scope: OKFMemoryScope) => Promise<unknown[]>;
}
```

#### Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `parseDocument` | `(filePath: string, bundleRoot: string, options?: ParseOptions) => Promise<OKFDocument>` | Parse a single `.md` file into an OKFDocument. Extracts frontmatter (via gray-matter) and links (via remark/unified AST). |
| `parseBundle` | `(rootDir: string, options?: ParseOptions) => Promise<OKFBundle>` | Walk a directory recursively (fast-glob), parse all `.md` files. Builds an index Map. Skips reserved filenames and `ignore` globs. |
| `validateDocument` | `(doc: OKFDocument) => { errors: OKFValidationError[]; warnings: OKFValidationWarning[] }` | Validates a single document (required fields, valid values, link integrity). |
| `validateBundle` | `(bundle: OKFBundle) => OKFValidationResult` | Validates all documents in a bundle. `valid` is true when zero errors. Each issue has a machine-readable `rule` code. |
| `serializeDocument` | `(frontmatter: OKFFrontmatter, body: string) => string` | Produces a complete OKF `.md` string with `---` frontmatter delimiters. |
| `writeDocument` | `(outputPath: string, frontmatter: OKFFrontmatter, body: string, options?: WriteOptions) => Promise<void>` | Writes a serialized document to disk. Creates parent directories. Respects `overwrite` option. |
| `writeIndex` | `(dirPath: string, title: string, description: string, options?: WriteOptions) => Promise<void>` | Writes an `index.md` with frontmatter (`type: "index"`, title, description). |
| `buildGraph` | `(bundle: OKFBundle) => OKFGraph` | Builds a full directed graph from all documents and their links. Nodes have incoming/outgoing edges. |
| `reachableFrom` | `(graph: OKFGraph, startRelativePath: string) => string[]` | Returns relative paths of all nodes reachable (via BFS/DFS) from the given start node. |
| `documentToFacts` | `(doc: OKFDocument) => string[]` | Converts an OKF document into turbomem-compatible fact strings. |
| `bundleToFacts` | `(bundle: OKFBundle) => string[]` | Converts all documents in a bundle into fact strings. |
| `addFromBundle` | `(memory: OKFMemory, bundle: OKFBundle, scope?: OKFMemoryScope) => Promise<unknown[]>` | Ingests an entire OKF bundle into turbomem's memory system. Scoped by user/agent/session. |

### Dependencies

Runtime: `fast-glob ^3.3.3`, `gray-matter ^4.0.3`, `remark ^15.0.1`, `remark-parse ^11.0.0`,
`unified ^11.0.5`, `unist-util-visit ^5.0.0`, `zod ^3.22.0`.
Peer: `turbomem >= 0.8.0` (optional — only needed for `addFromBundle`).

### End-to-End Code Example

```typescript
import {
  parseBundle,
  validateBundle,
  buildGraph,
  serializeDocument,
  writeDocument,
  bundleToFacts,
  reachableFrom,
} from "@turbomem/okf";

// 1. Parse an existing bundle from disk
const bundle = await parseBundle("./knowledge", {
  ignore: ["**/drafts/**"],
  followLinks: true,
});

console.log(`Loaded ${bundle.documents.length} documents`);

// 2. Validate
const validation = validateBundle(bundle);
if (!validation.valid) {
  for (const err of validation.errors) {
    console.error(`[${err.rule}] ${err.path}: ${err.message}`);
  }
}

// 3. Build a graph and find reachable concepts
const graph = buildGraph(bundle);
const reachable = reachableFrom(graph, "tables/orders");
console.log("Reachable from orders:", reachable);

// 4. Serialize a new document
const md = serializeDocument(
  { type: "BigQuery Table", title: "New Table", tags: ["experimental"] },
  "# Schema\n\nTBD"
);

// 5. Write to disk
await writeDocument("./knowledge/tables/new_table.md",
  { type: "BigQuery Table", title: "New Table" },
  "# Schema\n\nTBD",
  { overwrite: false }
);

// 6. Convert bundle to facts (for turbomem ingestion)
const facts = bundleToFacts(bundle);

// 7. Ingest into turbomem memory (requires `turbomem` peer dep)
import { TurboMemory } from "turbomem";
const memory = new TurboMemory({ /* ... config ... */ });
await memory.init();
// Use addFromBundle to ingest OKF bundle into memory with scoping
// import { addFromBundle } from "@turbomem/okf";
// await addFromBundle(memory, bundle, { userId: "user_123" });
```

---

## 5. @sorane/okf

- **npm**: `@sorane/okf` v0.5.0
- **License**: MIT
- **Author**: masanork (GitHub Actions published, SLSA provenance)
- **Repository**: [masanork/sorane](https://github.com/masanork/sorane) — `packages/okf/`
- **Repo Stats**: 0 stars, 261 commits, monorepo
- **Language**: TypeScript (source-distributed, no compile step — requires Node >= 23.6 for native TS)
- **Node**: >= 23.6

### What it does

The OKF parsing/validation/serialization package for the **sorane (空音)** static site
generator — an OKF-native SSG that builds static sites from markdown concept documents.
Provides sorane-specific OKF profiles (`sorane-okf/0.1` through `0.3`), JSON Schema-based
validation (via `ajv`), AI content disclosure fields (`digitalSourceType`, `euAiLabel`,
`aiDisclosureNote`, `aiSystems`), legacy key migration (`kind` → `type`, `publishedAt`/`date`
→ `timestamp`), and OKF bundle tar.gz generation. All comments and errors are in Japanese.

### Installation

```bash
npm install @sorane/okf
```

**Dependencies**: `ajv ^8.17.1`, `ajv-formats ^3.0.1`, `js-yaml ^4.1.0`.
**Requires**: Node.js >= 23.6 (runs TypeScript sources natively via `exports: { ".": "./src/index.ts" }`).

### Full API Reference

#### Types

```typescript
// --- Normalized OKF concept ---
interface OkfConcept {
    readonly type: string;         // REQUIRED — resolved from type/kind/layout
    readonly title: string;        // resolved from frontmatter or first markdown heading
    readonly body: string;
    readonly frontmatter: Record<string, unknown>;  // extension keys (type/title/timestamp removed)
    readonly timestamp?: string;   // ISO 8601, normalized
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly resource?: string;
    readonly profile?: string;     // e.g. "sorane-okf/0.3"
    readonly warnings: readonly string[];  // migration/deprecation warnings
}

// --- Parsed concept with validation ---
interface ParsedConcept {
    readonly concept: OkfConcept;
    readonly file: string;         // filename identifier
    readonly relPath: string;      // relative path
    readonly validation: ValidationResult;
}

// --- Validation ---
interface ValidationIssue {
    readonly where: "structure" | "frontmatter" | "type" | "profile";
    readonly message: string;
    readonly instancePath?: string;
}

interface ValidationResult {
    readonly file: string;
    readonly ok: boolean;          // true when zero issues
    readonly type?: string;
    readonly issues: readonly ValidationIssue[];
    readonly warnings: readonly string[];
}

type UnknownTypePolicy = "warn" | "error";

interface ValidateOptions {
    readonly defaultProfile?: string;     // e.g. from sorane.yaml
    readonly unknownType?: UnknownTypePolicy;  // default "warn"
}

// --- Bundle building ---
interface BundleEntry {
    readonly path: string;         // "{type}/{slug}.md"
    readonly content: string;      // OKF markdown
    readonly mtime: number;        // unix timestamp
}

interface BundleConcept {
    readonly concept: OkfConcept;
    readonly slug: string;
}

// --- Digital source / AI disclosure ---
type EuAiLabel = "basic" | "fully-generated" | "partially-modified";

interface ResolvedDigitalSourceType {
    readonly uri: string;          // IPTC URI
    readonly code: string;         // IPTC code, e.g. "trainedAlgorithmicMedia"
    readonly warnings: readonly string[];
}

interface AiSystemRef {
    readonly name: string;
    readonly version?: string;
    readonly provider?: string;
}

// --- Profile ---
const SUPPORTED_PROFILE_RE: RegExp;   // /^sorane-okf\/(0\.[123])$/
const DEFAULT_PROFILE: "sorane-okf/0.1";
const TYPES_01_02: Set<string>;       // {"article", "index"}
const TYPES_03: Set<string>;          // {"article", "index", "dataset", "reference", "glossary", "glossary-term", "faq"}
const BUILDABLE_CONTENT_TYPES: Set<string>;  // TYPES_03 minus "index"
```

#### Extraction

```typescript
interface ExtractResult {
    readonly frontmatter: string | null;  // raw YAML between --- delimiters
    readonly body: string;                // everything after closing ---
}

// Extract frontmatter block and body from markdown source
function extract(source: string): ExtractResult;

// Strip frontmatter, return body only
function stripFrontmatter(source: string): string;
```

#### YAML (using js-yaml CORE_SCHEMA)

```typescript
// Parse YAML with CORE_SCHEMA (prevents automatic Date conversion)
function parseYaml(source: string): unknown;

// Dump YAML with CORE_SCHEMA, no line wrapping, no refs, double-quote style
function dumpYaml(value: unknown): string;
```

#### Normalization

```typescript
// Normalize raw frontmatter + body into OkfConcept
// Handles legacy key migration: kind→type, layout:blog→type:index,
// layout:article→type:article, publishedAt→timestamp, date→timestamp
function normalizeConcept(raw: Record<string, unknown>, body: string, fallbackTitle: string): OkfConcept;
```

#### Parsing

```typescript
// Parse markdown source into normalized concept with validation
function parseConcept(
    file: string,
    relPath: string,
    source: string,
    options?: ValidateOptions,
): ParsedConcept;
```

#### Serialization

```typescript
// Format a single YAML scalar value with auto-quoting
function formatScalar(value: unknown): string;

// Build YAML frontmatter lines in OKF key order (type, title, timestamp,
// description, resource, tags, profile, digitalSourceType, euAiLabel,
// aiDisclosureNote, aiSystems, then extension keys sorted)
function toOkfFrontmatterLines(concept: OkfConcept): string[];

// Concept → full OKF markdown string (--- frontmatter + body)
function conceptToOkfMarkdown(concept: OkfConcept): string;
```

**Key ordering** in serialized frontmatter is deterministic:
`type → title → timestamp → description → resource → tags → profile → digitalSourceType → euAiLabel → aiDisclosureNote → aiSystems → [rest alphabetically]`.

#### Validation

```typescript
// Validate profile format string (only sorane-okf/0.1, 0.2, 0.3 supported)
function validateProfileFormat(profile: string | undefined): ValidationIssue | null;

// Resolve a profile to its JSON Schema file path
function resolveProfileSchema(profile: string): string;

// Full source validation: extracts frontmatter, parses YAML, validates
// structure, type, profile schema (via ajv), AI disclosure fields
function validateSource(file: string, source: string, options?: ValidateOptions): ValidationResult;
```

#### Profile Resolution

```typescript
// Check if profile is sorane-okf/0.3
function isProfile03(profile: string | undefined): boolean;

// Resolve effective type (0.3 unknown types → "article")
function resolveEffectiveType(type: string, profile: string | undefined): string;

// Check if type is a buildable content type (excludes "index")
function isBuildableContentType(type: string, profile: string | undefined): boolean;

// Resolve profile for validation (concept profile > site default > DEFAULT_PROFILE)
function resolveProfileForValidation(
    profile: string | undefined,
    siteDefaultProfile?: string,
): string;
```

#### Digital Source Type / AI Disclosure

```typescript
const IPTC_BASE: "http://cv.iptc.org/newscodes/digitalsourcetype";
const PHASE1_CODES: Set<string>;
// {"trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia",
//  "compositeSynthetic", "algorithmicMedia", "humanEdits", "digitalCreation"}

// Resolve raw string or URI to IPTC digital source type
function resolveDigitalSourceType(raw: string): ResolvedDigitalSourceType | null;

// Infer EU AI Act label from IPTC code (e.g. "trainedAlgorithmicMedia" → "fully-generated")
function inferEuLabel(code: string, override?: EuAiLabel): EuAiLabel | undefined;

// Check if an EU AI badge should be shown for this code
function showsEuBadge(code: string, override?: EuAiLabel): boolean;

// Parse euAiLabel string value
function parseEuAiLabel(raw: unknown): EuAiLabel | undefined;

// Parse aiSystems array of { name, version?, provider? }
function parseAiSystems(raw: unknown): AiSystemRef[] | undefined;

// Check if frontmatter has any AI disclosure fields
function hasDisclosureKeys(frontmatter: Record<string, unknown>): boolean;

// Validate AI disclosure fields (digitalSourceType required when other fields present)
function validateDisclosureFields(
    frontmatter: Record<string, unknown>,
    strictCodes: boolean,
): { readonly issues: DisclosureValidationIssue[]; readonly warnings: string[] };
```

#### Bundle Building

```typescript
// Convert concepts to OKF bundle entries ({type}/{slug}.md), sorted by type+slug
function buildBundleEntries(concepts: readonly BundleConcept[]): BundleEntry[];

// Build a gzip-compressed tar archive (USTAR format) of the full bundle
function buildOkfBundle(concepts: readonly BundleConcept[]): Promise<Buffer>;
```

### Dependencies

Runtime: `ajv ^8.17.1`, `ajv-formats ^3.0.1`, `js-yaml ^4.1.0`.

### End-to-End Code Example

```typescript
import {
  parseConcept,
  validateSource,
  extract,
  stripFrontmatter,
  normalizeConcept,
  conceptToOkfMarkdown,
  toOkfFrontmatterLines,
  formatScalar,
  buildOkfBundle,
  buildBundleEntries,
  resolveDigitalSourceType,
  inferEuLabel,
  validateDisclosureFields,
} from "@sorane/okf";

const source = `---
type: article
title: Hello OKF World
timestamp: 2026-07-25T10:30:00Z
tags:
  - sorane
  - okf
profile: sorane-okf/0.3
digitalSourceType: compositeWithTrainedAlgorithmicMedia
aiDisclosureNote: Draft reviewed and edited with an LLM; facts verified by the author.
---

Markdown body content here.

## Section One

Content for section one.

## Section Two

More content.
`;

// 1. Validate the source
const validation = validateSource("hello-okf.md", source, {
  defaultProfile: "sorane-okf/0.3",
});
console.log("Validation OK:", validation.ok);
console.log("Issues:", validation.issues);
console.log("Warnings:", validation.warnings);

// 2. Parse into a normalized concept
const parsed = parseConcept("hello-okf.md", "hello-okf.md", source);
console.log("Type:", parsed.concept.type);       // "article"
console.log("Title:", parsed.concept.title);      // "Hello OKF World"
console.log("Profile:", parsed.concept.profile);  // "sorane-okf/0.3"
console.log("Deprecation warnings:", parsed.concept.warnings);

// 3. Check AI disclosure
const disclosure = validateDisclosureFields(parsed.concept.frontmatter, true);
console.log("Disclosure issues:", disclosure.issues);

// 4. Resolve digital source type to IPTC
const dst = resolveDigitalSourceType("compositeWithTrainedAlgorithmicMedia");
if (dst) {
  const euLabel = inferEuLabel(dst.code);
  console.log("EU AI Label:", euLabel);  // "partially-modified"
}

// 5. Serialize back to OKF markdown
const markdown = conceptToOkfMarkdown(parsed.concept);

// 6. Build a tar.gz bundle (for distribution/export)
const bundle = await buildOkfBundle([
  { concept: parsed.concept, slug: "hello-okf" },
]);
// bundle is a Buffer containing gzip-compressed tar
console.log("Bundle size:", bundle.length, "bytes");
```

---

## 6. okf-toolkit

- **npm**: `okf-toolkit` v0.1.0
- **License**: Apache-2.0
- **Author**: Ruben Lazarus (rubenlazarus)
- **Repository**: Not listed on npm (may not be public on GitHub)
- **Language**: TypeScript
- **Node**: >= 18

### What it does

Parse, validate, and chunk Open Knowledge Format bundles — specifically designed for
**RAG (Retrieval-Augmented Generation) pipelines**. Turns OKF bundles into
vector-store-agnostic chunks with full metadata preservation and per-chunk link
attribution. It is NOT an embeddings or vector DB client — it produces data ready to
feed into any embeddings API and vector store. Also includes a CLI (`npx okf-toolkit`).

### RAG Chunking Strategy

This is the only library in the ecosystem designed specifically for RAG chunking. Its approach:

1. **Heading-boundary splitting**: Splits at `#`, `##`, `###`, etc. headings first, so each chunk
   stays topically coherent (e.g. "Schema", "Joins", "Notes" sections).

2. **Oversized section splitting**: When a single heading section exceeds `maxChunkChars`
   (default 1800), further splits on sentence/paragraph boundaries with `overlapChars`
   (default 150) overlap between chunks.

3. **Frontmatter → per-chunk metadata**: Every chunk carries frontmatter fields (`type`, `title`,
   `tags`, `resource`, `timestamp`) in its `metadata` object — ready for vector store metadata
   filtering at query time.

4. **Per-chunk link attribution**: Cross-links are attributed only to the specific chunk whose
   text contains them (not smeared across all chunks of a concept). This enables graph-aware
   retrieval: if a retrieved chunk links to another concept, the system can optionally fetch
   that concept too.

5. **Stable chunk IDs**: Each chunk gets a deterministic ID (`${conceptId}#${index}`), useful for
   incremental updates and deduplication.

### Installation

```bash
npm install okf-toolkit
```

**Dependencies**: `gray-matter ^4.0.3`, `yaml ^2.5.0` (uses `yaml` for writing, `gray-matter` for parsing).

### Full API Reference

#### Types

```typescript
const RESERVED_FILENAMES: Set<string>;  // {"index.md", "log.md"}

interface OkfFrontmatter {
    type: string;              // REQUIRED
    title?: string;
    description?: string;
    resource?: string;
    tags?: string[];
    timestamp?: string;
    [key: string]: unknown;    // extension fields
}

interface OkfLink {
    text: string;                              // display text
    target: string;                            // raw target path e.g. "/tables/customers.md"
    resolvedConceptId: string | null;           // concept ID if internal link
}

interface OkfConcept {
    conceptId: string;         // file path minus .md — the identity
    filePath: string;          // absolute or bundle-relative path
    frontmatter: OkfFrontmatter;
    body: string;              // raw markdown after frontmatter
    links: OkfLink[];          // extracted cross-links
    depth: number;             // directory depth, 0 = bundle root
}

interface OkfSpecialFile {
    kind: "index" | "log";
    filePath: string;
    dir: string;               // directory relative to bundle root
    content: string;
}

interface OkfBundle {
    root: string;
    concepts: OkfConcept[];
    specialFiles: OkfSpecialFile[];  // index.md / log.md files (not concepts)
}

type Severity = "error" | "warning";

interface ValidationIssue {
    severity: Severity;
    code: string;              // machine-readable: "MISSING_TYPE", "BROKEN_LINK", etc.
    message: string;
    conceptId?: string;
    filePath?: string;
}

interface ValidationResult {
    valid: boolean;            // true = zero errors (warnings don't affect)
    issues: ValidationIssue[];
    errorCount: number;
    warningCount: number;
}

interface OkfChunk {
    chunkId: string;           // deterministic: `${conceptId}#${index}`
    conceptId: string;
    headingPath: string[];     // e.g. ["Schema", "Joins"]
    text: string;              // chunk text content
    metadata: {
        type: string;
        title?: string;
        description?: string;
        resource?: string;
        tags?: string[];
        timestamp?: string;
        sourcePath: string;     // original .md file path
        headingPath: string[];  // duplicate of above for convenience
        chunkIndex: number;
        totalChunksInConcept: number;
    };
    linksTo: string[];         // concept IDs this chunk links to (subset of concept links)
}

interface ChunkOptions {
    maxChunkChars?: number;          // default 1800
    overlapChars?: number;           // default 150
    includeHeadingContext?: boolean; // default true — prepends "Section > Subsection"
}
```

#### Parser Functions

```typescript
interface ParseOptions {
    strict?: boolean;  // throw on first parse error instead of recording
}

// Walk a directory, parse all .md files. index.md/log.md → specialFiles.
// Everything else → concepts with parsed frontmatter, extracted links.
function parseBundle(rootDir: string): OkfBundle;

// Parse a single concept from a raw string (no filesystem).
// Useful for API-fetched or dynamically generated OKF content.
function parseConcept(conceptId: string, raw: string): OkfConcept;
```

#### Validator

```typescript
function validateBundle(bundle: OkfBundle): ValidationResult;
```

**Validation rules** (OKF v0.1 spec):

| Code | Severity | Description |
|------|----------|-------------|
| `MISSING_TYPE` | error | Concept has no `type` frontmatter field |
| `INVALID_TAGS_FIELD` | error | `tags` is present but not an array |
| `DUPLICATE_CONCEPT_ID` | error | Two documents resolve to the same concept ID |
| `BROKEN_LINK` | warning | Link doesn't resolve to any concept (OKF allows partial bundles) |
| `MISSING_INDEX` | warning | Directory has concepts but no index.md |
| `EMPTY_BODY` | warning | Concept has frontmatter but no body |
| `UNPARSEABLE_TIMESTAMP` | warning | `timestamp` field is not a parseable date |

`result.valid` is `true` only when there are zero errors. Warnings don't affect validity.
The CLI exits non-zero on errors.

#### Chunker

```typescript
// Chunk a single concept into RAG-ready pieces
function chunkConcept(concept: OkfConcept, options?: ChunkOptions): OkfChunk[];

// Chunk all concepts in a bundle. Order follows bundle.concepts order.
function chunkBundle(bundle: OkfBundle, options?: ChunkOptions): OkfChunk[];
```

**How chunking works** (from source analysis):

1. Split body at `#`, `##`, `###`, etc. heading boundaries → headed sections.
2. For each section: if text length <= `maxChunkChars`, emit as one chunk.
3. If section exceeds limit: split on sentence boundaries (`/(?<=[.!?])\s+/`), then further on
   paragraph boundaries (`\n\n`), creating chunks of `maxChunkChars` size with `overlapChars`
   overlap.
4. For each chunk: resolve which links from the concept's `links` appear in this chunk's text
   → populate `linksTo`.
5. Optionally prepend `"Section > Subsection"` heading context to chunk text (if
   `includeHeadingContext` is `true`, default).

### CLI

```bash
# Validate a bundle
npx okf-toolkit validate ./my-bundle
# or: okf validate ./my-bundle

# Chunk a bundle to JSON
npx okf-toolkit chunk ./my-bundle -o chunks.json --pretty
# or: okf chunk ./my-bundle -o chunks.json --pretty
```

CLI exits with code 1 on validation errors.

### Dependencies

Runtime: `gray-matter ^4.0.3`, `yaml ^2.5.0`.
Dev: `typescript ^5.5.0`, `@types/node ^20.14.0`.

### End-to-End Code Example

```typescript
import { parseBundle, validateBundle, chunkBundle } from "okf-toolkit";

// 1. Parse a bundle from disk
const bundle = parseBundle("./my-knowledge-bundle");
console.log(`Concepts: ${bundle.concepts.length}, Special files: ${bundle.specialFiles.length}`);

// 2. Validate
const validation = validateBundle(bundle);
if (!validation.valid) {
  for (const issue of validation.issues) {
    console.error(`[${issue.severity}] ${issue.code}: ${issue.message}`);
  }
}

// 3. Chunk for RAG
const chunks = chunkBundle(bundle, {
  maxChunkChars: 1500,        // tighter than default 1800
  overlapChars: 200,           // more overlap for better context preservation
  includeHeadingContext: true, // prepend "Schema > Joins" to chunk text
});

console.log(`Produced ${chunks.length} chunks`);

// 4. Wire into a real RAG pipeline (pseudo-code)
for (const chunk of chunks) {
  // const embedding = await yourEmbeddingModel.embed(chunk.text);
  // await vectorStore.upsert({
  //   id: chunk.chunkId,
  //   vector: embedding,
  //   metadata: {
  //     ...chunk.metadata,
  //     conceptId: chunk.conceptId,
  //     linksTo: chunk.linksTo,  // for graph-aware retrieval
  //   },
  // });
}

// Example: show chunk details
for (const chunk of chunks) {
  console.log(`${chunk.chunkId}: ${chunk.headingPath.join(" > ")} (${chunk.linksTo.length} links)`);
}
```

---

## Comparison Matrix

| Feature | core-okf | js-okf | okf-tool | turbomem/okf | sorane/okf | okf-toolkit |
|---------|----------|--------|----------|--------------|------------|-------------|
| **Version** | 4.22.0 | 0.3.1 | 0.2.0 | 1.0.0 | 0.5.0 | 0.1.0 |
| **Weekly DL** | 3,100 | 819 | 322 | 439 | 195 | 152 |
| **Dependencies** | **0** | 5 | 2 | 7 | 3 | 2 |
| **Frontmatter parse** | Custom YAML subset | gray-matter | gray-matter | gray-matter | js-yaml (CORE_SCHEMA) | gray-matter |
| **Frontmatter serialize** | Custom (zero-dep) | js-yaml | js-yaml | gray-matter | js-yaml (CORE_SCHEMA) | yaml (eemeli/yaml) |
| **Concept parse** | Yes (in-memory string) | Yes (file + string) | Yes (file + string) | Yes (file) | Yes (file + validation) | Yes (directory + string) |
| **Concept write** | Build-only (string output) | Yes (file system) | Yes (filesystem adapters) | Yes (file system) | Yes (build to string) | No |
| **Bundle CRUD** | No (primitives only) | Yes (OKFBundle class) | Yes (OKFBundle class) | No (parse + graph only) | No | No (parse only) |
| **Search** | No | No | Yes (with scoring) | No | No | No |
| **Link graph** | Extract only | No | Yes (forward + back) | Yes (with reachability) | No | Extract only |
| **Validation** | No | Basic (missing type) | Yes (spec v0.1) | Yes (zod rules) | Yes (ajv JSON Schema) | Yes (spec v0.1) |
| **Index.md** | Build + parse | Auto-generate | Full CRUD + auto-generate | Write only | No | No |
| **Log.md** | Build + parse | Append | Full CRUD | No | No | No |
| **RAG chunking** | No | No | No | No | No | **Yes** |
| **CLI** | No | Yes (viewer server) | No | No | No | Yes (validate, chunk) |
| **Browser** | Yes (zero-dep) | No (fs) | Yes (MemoryFileSystem) | No | No (fs reads) | No (fs reads) |
| **AI disclosure** | No | No | No | No | Yes (IPTC, EU AI Act) | No |
| **Memory bridge** | Via core-llm-wiki | No | No | Yes (turbomem) | No | No |
| **Bundle export** | No | No | No | No | Yes (tar.gz) | No |
| **Profile system** | Via profile key | No | No | No | Yes (sorane-okf/0.1-0.3) | No |
