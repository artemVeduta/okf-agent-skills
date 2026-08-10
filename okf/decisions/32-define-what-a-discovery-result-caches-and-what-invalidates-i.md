---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/32
status: draft
type: Decision
---
# Define what a discovery result caches, and what invalidates it

Status: closed.

## Question

The discovery prototype in [#27](https://github.com/artemVeduta/okf-agent-skills/issues/27) showed that §7.2's proposed cache key — repository identity + git HEAD + bundle content state — does not change when trust is revoked, when the symlink policy tightens, when the harness changes, or when an admitted entry's resolved symlink target moves. Each of those leaves a stale admission cached under an unchanged key, and a cached admission is exactly what the "recompute containment on every call" rule exists to prevent.

What is cached about a discovery result, keyed on what, and invalidated by what?

**Must resolve:**

- Whether an *admission* (a bundle passed all four gates) is ever cached at all, or only the expensive parts underneath it — directory walks, monorepo member lists, parsed frontmatter — with the gates re-run every time.
- What belongs in the key beyond §7.2's three components: trust set, symlink policy and allowlist, active harness and its grants, the resolved canonical targets of every admitted entry, the manifest's own version and mtime.
- Whether the working directory belongs in the key. §7.2's key omits it, which implies changing directory inside one repository at one HEAD hits the same entry — but the admitted set and the write target both depend on cwd.
- Where the cache physically lives. §7.2 proposes `.okf/cache/`, which sits inside the repository and is absent from §7.4's hard-coded exclusion list, so a scan could walk its own cache. Compare with the placement decision in [#31](https://github.com/artemVeduta/okf-agent-skills/issues/31).
- What happens on a cache that is missing, unreadable, or written by a newer version — fail closed and re-resolve is the presumed answer, but it needs stating.
- Whether a `declared_missing → available` transition is detected by watching, polling, or only on the next explicit resolution. §7.5 forbids hard-coding any TTL, "including 60 seconds", without prototype data.

Does not reopen the gate order or the authority model, which #27 settled.

## Comment by artemVeduta

Correction carried from [Prototype workspace discovery, trust, and routing state transitions](https://github.com/artemVeduta/okf-agent-skills/issues/27): cache inputs must include active harness access configuration and explicit additional-directory grants, including Codex `--add-dir`. Cached access state must not treat an access-only grant as discovery bootstrap unless [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22) affirmatively adopts harness-native multi-root input as authority.

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) makes retrieval stateless per call. A discovery cache may improve performance but cannot preserve model memory, authority, admission, or budget spend; cache misses and invalidation may change latency, not retrieval semantics.

## Comment by artemVeduta

## Resolution

Adopt **cache-transparent discovery**: given the same current observable state and configured work envelope, a warm cache and a cold resolution examine the same semantic frontier and produce the same discovery and admission result. Cache state may change latency, CPU use, and observed execution work; it never supplies authority, preserves an admission, or widens scope.

### What persists

Only syntax-level pure derivations may persist across explicit resolutions. The initial v0.1 use is parsed frontmatter or manifest syntax whose output is determined entirely by exact source bytes and a parser contract.

The persistent key is:

```text
cache-format/parser version + artifact kind + cryptographic digest of exact source bytes
```

Cache semantic interpretation, OKF conformance, candidate sets, directory walks, monorepo member lists, presence or absence, repository identity lookups, canonical paths, admission verdicts, or write targets do not persist across resolutions. Semantic validation is deliberately outside the cached pure function.

The repository identity, Git HEAD, trust set, symlink policy and allowlist, active harness and grants, resolved canonical targets, manifest mtime, and cwd therefore do not belong in this parse-cache key. They are either fresh resolution inputs or current filesystem observations. The proposed §7.2 key is not an admission key because no admission is cached.

### What is fresh

Every explicit resolution:

- takes canonical cwd as a required input;
- discovers candidate scope from the current authority inputs;
- observes current presence, repository identity, monorepo membership, and filesystem state;
- resolves each candidate's current canonical target;
- reruns `REACH -> PRESENCE -> {TRUST, ACCESS}` against the current trust set, symlink policy/allowlist, active harness, and grants;
- reruns semantic validation and write-target selection.

Any complete-result memoization inside one resolution transaction is scoped to that exact canonical cwd and immutable authority snapshot. It does not survive the transaction.

This preserves the rule from [Prototype workspace discovery, trust, and routing state transitions](https://github.com/artemVeduta/okf-agent-skills/issues/27): containment is recomputed on every call, and access never becomes discovery authority.

### Work accounting

Deterministic discovery decisions consume a versioned conservative **notional cold-work charge**: what the operation would charge if every pure derivation missed the cache. Cache hits therefore cannot buy additional scopes or concepts before the work frontier.

Track **observed execution work** separately: actual reads, parses, cache hits/misses, elapsed work, and any hard resource protection. Observed work can stop execution for a resource-limit failure, but it cannot authorize work beyond the cache-independent notional frontier. Receipts distinguish the two rather than overloading one "discovery-work" number.

This resolves the accounting dependency left by [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13): cache performance may change observed work, never semantic spend or examined scope.

### Placement, integrity, and concurrency

The persistent cache lives in the suite-owned per-user OS cache directory outside repositories and OKF bundles, shared by harness adapters. On Linux this follows the XDG user-cache convention; on macOS it uses the platform user-cache equivalent. It is not `.okf/cache/`, repository state, harness session state, or the manual-operation guard store being decided by [Decide where manual-operation guard state persists and how concurrent sessions coordinate](https://github.com/artemVeduta/okf-agent-skills/issues/31).

Entries are immutable and atomically published. Exact-byte changes, artifact-kind changes, and parser/cache-format upgrades select new keys or namespaces rather than mutating or actively invalidating old entries. Concurrent writers of the same key are benign because the derivation is deterministic; a losing writer discards its temporary output.

Readers verify the entry envelope, key, digest, schema, and supported cache version. Missing, unreadable, malformed, digest-mismatched, or newer-version entries are cache misses: read the authoritative source and derive afresh. Do not consume, overwrite, or delete a newer-version namespace. A cache write failure returns the freshly derived result without caching it. Cache failure alone never admits or rejects a bundle.

Old unreachable entries are disposable storage residue. Their removal by the OS or an explicit cache-clean operation has no correctness effect; v0.1 adds no TTL or correctness-sensitive garbage collector.

### Refresh behavior

`declared_missing -> available` is detected on the next explicit resolution. Presence and absence are observed afresh on every call, so v0.1 needs no watcher, polling loop, background refresh, or TTL. An explicit resolution is any lifecycle entry point that requires a discovery snapshot, not only a user-issued refresh command.

### End-to-end consequence

If a warm run is followed by a cwd change, trust revocation, symlink retarget, parser upgrade, and creation of a previously missing repository, the next resolution observes all five. It reuses parsing only where exact bytes and parser namespace still match, follows the same semantic work frontier as a cold run, and differs only in observed execution cost.
