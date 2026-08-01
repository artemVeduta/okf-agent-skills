# Impact analysis: making a federated peer writable

**Proposal under analysis (owner):** in the monorepo example, `ui-components` is drawn as a
`FEDERATED PEER — read-only to worker-manager`. It "must be accessible AND writable."

**Status:** analysis only. Nothing in the repository, the visualization, or any issue was changed.

**Sources read:** issue #22 (resolution + comments), #27 (prototype + Codex correction), #11 (trust
tier matrix), #31 (guard ledger), #35 (`.okf-active` and adapters),
`docs/research/workspace-topology-and-routing.md`, `visualizations/current-state.html` §2.

---

## 1. Why federation was made read-only — the recorded reasoning

The rule is not an omission. It is a stated conclusion with a named failure mode.

**#27, the prototype that proposed it** ("Reads may federate; writes never do"):

> The write target is the nearest admitted bundle at or above cwd **inside the current repository**.
> A federated peer and a non-repository workspace root are never write targets. Consequence:
> **widening read scope can never silently redirect a write**, and discovery stays read-only — it
> never creates `okf/`.

The failure being prevented is named in that sentence: **scope widening silently redirecting a
mutation**. Federation is a *read* convenience — a user declares a peer so that a glossary term
resolves. Under the proposed change that same declaration would also hand the session mutation
authority over a second repository, so the act of improving retrieval would enlarge the blast radius
of every write. #27 records this as the reason the write rule was introduced at all, and flags it as
the prototype's own proposal, not a reading of the research doc: "The research doc states no write
rule at all, so this is the prototype's proposal."

**The same separation, stated twice more:**

- #27, on authority: *"the prototype keeps `access is not authority` as a hard separation in both
  directions: being able to read a path never widens what is looked at, and declaring a path never
  grants permission to read it."* The proposal collapses the first direction.
- #22, on links: *"links never widen discovery, trust, access, or write authority."* The same
  invariant, applied to `okf-workspace://` references.
- #11, on trust: *"Trust is evidence only. It never grants mutation authority."* and *"Trust
  promotion cannot authorize a subsequent operation because trust is not authority."* A peer being
  *trusted* — the strongest state it can reach today — was explicitly designed not to imply
  writability.

**#22 did not merely omit cross-repo writes; it excluded them.** Its final sentence:

> This resolution does not add network discovery, implicit repair, semantic merging,
> **cross-repository writes**, or product-specific concept frontmatter.

That wording matters for §5: this is a stated exclusion, so reversing it is a reversal, not a gap-fill.

A second, independent reason applies to the workspace-root half of the same rule: a non-repository
workspace root has no repository instance identity, so it has no trust key and no canonical bundle
key. #27 lists this as still-open ("what trust key it has when there is no repository identity — the
prototype treats authorizing the root as trusting what has no repo of its own"). Read-only was the
safe default for a thing whose identity was undecided.

---

## 2. What breaks if a federated peer becomes writable

### 2.1 The literal proposal violates two independent read-only rules, not one

In the visualization's own manifest, `ui` is declared `"mode": "vendored"`. #22:

> Generated and vendored bundles require explicit declaration, participate in reads, and are
> **always read-only**.

So `ui-components/okf/` is read-only twice over: once as a federated peer, once as a `vendored`
bundle. Repealing the federation rule alone would not make the example writable. (If `ui-components`
is a first-party sibling the team owns, `vendored` is probably the wrong mode in the example
regardless — see §3.)

The same manifest entry pins `"revision": "9c7f2ab1…"`. A pinned exact Git object is a *read*
contract. Writing into a repo pinned to a revision is incoherent: the write either invalidates the
pin or must advance it, and the pin lives in a file committed to the *other* repository.

### 2.2 Owner-aware writes stop being containable

#22's update rule:

> Updating or deleting an existing concept routes to **its owning bundle**, not the currently
> nearest bundle.

Today that rule is safe because every owning bundle that can be a write target is in the current
repository. Make peers writable and the rule becomes a silent cross-repo dispatcher: broad search
"examines every admitted bundle", so a concept found in `ui` and then edited mutates a repository the
user never opened, in a session whose cwd is elsewhere. The companion rule

> An explicit create override may name another admitted bundle **only in the current repository**

would have to lose its qualifier, at which point the create path is cross-repo too.

### 2.3 The gate ladder has no gate for this

`REACH → PRESENCE → {TRUST, ACCESS}` answers *may this bundle be seen and read*. It has no term that
answers *may this session mutate that repository*:

- **ACCESS** is harness configuration. Per #27's correction, Codex `--add-dir` "grant[s] additional
  directories **write** access alongside the main workspace" — so filesystem writability is already
  achievable and is deliberately not treated as authority.
- **TRUST** is a human decision about repository instance identity, and #11 forbids reading it as
  authority.
- **REACH** already refused the sibling as `SIDEWAYS_SIBLING` unless federation admitted it.

There is therefore no findings code for a refused cross-repo write. The result vocabulary
(`DECLARED_MISSING`, `NOT_A_REPOSITORY`, `BUNDLE_MISSING`, `IDENTITY_MISMATCH`, `UNTRUSTED`,
`ACCESS_DENIED`, `INVALID`) is an *admission* vocabulary; a write refusal would be none of these.
#27's own precedent applies — collapsing a policy decision into `INVALID` "names a policy decision as
a defect."

### 2.4 Project mode cannot be resolved for a foreign bundle

#11: *"Mode is evaluated per affected bundle. Mixed-bundle operations compose strictly. **Unknown
mode permits read, validation, and analysis but blocks mutation.** Repository presence alone never
determines mode."*

`.okf-workspace.json` carries bundle `mode` (`source`/`generated`/`vendored`), which is a *federation*
mode, not the code-backed / knowledge-only **project mode** the matrix is keyed on. That project mode
lives in the peer's own repository configuration. A worker-manager session has no admitted channel to
read it, so every cross-repo write lands on `unknown mode` and is blocked — meaning the proposal, if
adopted without a companion decision, would still not produce a working write.

### 2.5 The guard ledger splits or deadlocks — this is the sharpest breakage

#31 anchors guard state at `<git-common-dir>/okf-agent-skills/guard/<bundle-key>/`, one directory
"per canonical bundle identity", with `<bundle-key>` derived from #22's bundle identity. Today
`<git-common-dir>` is unambiguous because the write target is always in the current repository. With
a cross-repo target there are two readings and both fail:

**(a) Session's common dir (`worker-manager/.git/…`).** The ledger for `ui`'s bundle would then exist
in two places — one under worker-manager for foreign sessions, one under ui-components for its own
sessions. #31's entire concurrency guarantee is per-bundle:

> Several sessions may hold outstanding previews at the same epoch […] execution takes an exclusive
> lock for its full duration […] On success, atomically spend the token, **advance the epoch,
> invalidate all sibling confirmations** […]

Two ledgers means two lock namespaces and two epoch counters for one logical bundle. An agent in
worker-manager and an agent in ui-components would each hold a valid, unexpired confirmation and
execute concurrently against the same files. The stated reason the lock exists — *"Epoch checking
without this lock is insufficient because it cannot stop two already-armed sessions from beginning
together"* — is exactly the property lost.

**(b) Target's common dir (`ui-components/.git/…`).** Correct by the one-ledger-per-bundle rule, but:

- It requires **write access to a second repository's git metadata before any preview is issued** —
  a mutation of the peer that occurs before the user has approved any mutation of the peer.
- #31 fails closed here: *"If the runtime cannot create, secure, lock, or atomically replace the
  ledger, confirmation and execution fail closed."* A read-only mount, a Codex grant that covered the
  worktree but not `.git`, or an absent peer turns a preview into a hard failure.
- An operation touching bundles in both repos needs **two locks held simultaneously**, and #31
  defines no acquisition order — a straightforward deadlock between two sessions approaching from
  opposite repos. No lock-ordering rule exists to cite.
- #31 step 4 advances **one** epoch under **one** lock. A two-repo operation must advance two epochs
  atomically, which the protocol has no construct for.

Interrupted state inherits the same hole: the `in-flight` → `outcome: unknown` recovery record is
scoped to one ledger and one bundle, so a crash mid-cross-repo-operation leaves one repo blocked in
`unknown` and the other with no record that anything happened.

### 2.6 The operation manifest and the approval fingerprint are single-repository objects

#11's PR-approval channel is explicitly bounded:

> PR approval can satisfy preview/approval only for code-backed, **repository-contained** effects
> prepared on an isolated non-authoritative branch.

and its binding fingerprint is singular throughout:

```
explicit operation request ID
base commit SHA
head commit SHA
resulting merge-tree SHA
complete operation-manifest hash
applicable policy/configuration hash
required-check result set
recovery-evidence hash when required
```

A two-repo operation has two base SHAs, two heads, two merge-trees, potentially two policy hashes
and two required-check sets, and — unaddressed — possibly two different human approvers with
different rights. The fingerprint schema has no slot for a set, and "any change expires approval"
gives no rule for the case where one repo's head moves after the other's approval.

### 2.7 Recovery and atomicity have no cross-repo answer

- #11 already classifies any such operation as **broad**: *"An operation is broad when it […]
  **crosses bundles**."* So every cross-repo write is automatically preview + approval + full
  recovery gate, including a *"content-addressed snapshot of affected bundles"* stored *"outside the
  mutation target"* — now two mutation targets, so "outside" must mean outside both.
- **Atomicity does not exist across two git repositories.** #31 says *"Execute atomically"*; there is
  no two-phase commit between repos. Repo A succeeds, repo B fails, and the outcome is a state no
  rule describes: A's ledger records `failed` at an unchanged epoch while A's content has in fact
  changed, and B is untouched. #11's migration invariant (*"write-new-then-swap, never
  mutate-in-place"*) is a per-repository technique and does not compose across two.
- Cross-bundle moves compound it: #22 calls them *"explicit identity-changing migrations with link
  rewriting, never ordinary updates"*, and bundle identity is *owner identity plus bundle-root path*,
  so a move across repos changes identity and requires `okf-workspace://` link rewriting in **both**
  repos — but the peer's manifest is a different file, owned by a repository that never consented.

### 2.8 The manifest schema cannot carry the grant

#22 forbids exactly this class of field:

> **Trust records, harness permissions, caches, and canonical machine paths never enter the portable
> manifest.**

A write grant *is* a permission. It cannot be expressed in `.okf-workspace.json` schema v1 by rule,
not by oversight. And `.okf-workspace.json` lives in and is committed by `worker-manager`: putting a
write grant there would let one repository's committed file unilaterally claim mutation authority
over another repository that has no say in it, and which would inherit that claim through any clone
of worker-manager. `.okf-active` does not help — #35: it is *"a passive, project-local behavior
selector, **not authority, trust, permission, write ownership, or approval**."*

---

## 3. The narrower change — which of the three cases is actually forbidden

| Case | Status today | Notes |
|---|---|---|
| **(a)** The harness can *access* `ui-components`' files at all | **Already allowed** | #27's correction: Codex `--add-dir` grants additional directories write access alongside the main workspace, and the identical federated read that a grant enables succeeds. The only restriction is that a grant "widens filesystem access only; it does not widen discovery authority." Nothing here is forbidden. |
| **(b)** An agent in `worker-manager` writes into `ui-components`' OKF bundle | **Forbidden** | This is the *only* thing the current rules refuse, and §2 is the cost of allowing it. |
| **(c)** An agent invoked with `ui-components` as its own current repository writes there | **Always allowed** | It is its own git root, has its own `.okf-active` at its own worktree root (drawn in the visualization), its own bundle, its own project mode, and its own guard ledger under its own common dir. Zero rules obstruct this; zero changes are needed. |

**What the owner is most likely asking for: (a) + (c), stated as a labelling complaint.**

The visualization's tree line reads `FEDERATED PEER — read-only to worker-manager`, but the ownership
table's column header is the unqualified `Writable from worker-manager?` with the cell `no —
read-only`. Skimmed together, they read as *"`ui-components` is a read-only repository"*, which is
false: it is an ordinary editable repo that is read-only *only when reached as a peer from a
worker-manager session*. The narrow fix is presentational and changes no decision:

1. Qualify the tree label: `read-only when reached as a peer from worker-manager` — not
   "read-only" full stop.
2. Add a row or note stating case (c) explicitly: a session rooted in `ui-components` writes to
   `ui-components/okf/` normally, with its own marker, mode, and guard ledger.
3. Note case (a): harness access to the sibling's files (Codex `--add-dir`, Claude Code equivalents)
   is available and is a *separate* thing from OKF write routing.
4. Reconsider `"mode": "vendored"` in the example manifest. If `ui-components` is a first-party
   sibling the same team owns, `vendored` adds a second, stronger read-only that probably does not
   reflect intent; `source` is the honest declaration and still read-only as a peer.

If the owner confirms (b) is what they meant, §4 applies.

---

## 4. If genuinely cross-repo writes are wanted — what must be re-opened

**Decisions that must be re-opened or amended**

| Where | Clause | Why |
|---|---|---|
| #22 | "Federated peers and non-repository workspace-root bundles are read-only" | Directly reversed. |
| #22 | "An explicit create override may name another admitted bundle only in the current repository" | Qualifier must drop. |
| #22 | Closing exclusion: "does not add […] cross-repository writes" | Stated exclusion must be withdrawn. |
| #22 | "Generated and vendored bundles […] are always read-only" | Only if the peer keeps a non-`source` mode. |
| #22 | Manifest schema v1 + "permissions never enter the portable manifest" | Needs `schema_version: 2` *or* an out-of-manifest grant store; the prohibition points at the latter. |
| #22 | Bundle identity / cross-bundle move semantics | Cross-repo moves change identity and rewrite links in two repos. |
| #27 | "Reads may federate; writes never do"; "access is not authority" (first direction) | The prototype's central write invariant. |
| #27 | Gate ladder + findings vocabulary | Needs a write-authority gate and its own code. |
| #11 | "repository-contained effects" bound on PR approval; the approval fingerprint | Fingerprint is single-repo. |
| #11 | Automatic lifecycle ceiling | Must decide whether the auto-write tier (small evidence-backed create/update) may ever fire into a *foreign* repository. Recommended answer: no. |
| #11 | Recovery gate | Cross-repo is already `broad`; snapshot/restore/rollback must be defined over two repos. |
| #11 | Mode resolution | How a foreign bundle's project mode is obtained without violating discovery authority. |
| #31 | Ledger location rule, lock protocol, epoch advance, `in-flight` recovery record | See §2.5 — the deepest rework. |
| #35 | Whether the target repo's `.okf-active` and adapter install are prerequisites for a foreign write | Marker is per-worktree and currently "not […] write ownership". |
| #32 | Cache invalidation | Revoking a write grant must invalidate admissions, as trust revocation does. |

**New rules that do not exist today and must be written**

1. **Write authority as a distinct concept.** A fourth consideration alongside trust and access —
   evaluated after `ACCESS`, with its own finding (e.g. `WRITE_NOT_AUTHORIZED`) — and a statement
   that neither trust, nor access, nor manifest declaration, nor a link implies it.
2. **Where the grant lives.** It is a permission, so per #22 it must be *local and non-portable*
   (alongside trust records, keyed on repository instance identity), never in the committed manifest.
3. **Target-side consent.** The peer must be able to refuse: a foreign write should require the
   target repo's own opt-in (its `.okf-active` at minimum, plausibly an explicit accepts-foreign-
   writes declaration), so authority is not unilateral from the manifest author's side.
4. **Guard-state location, stated normatively.** One ledger per canonical bundle identity, in the
   **target's** common dir — plus a deterministic multi-lock acquisition order (e.g. by canonical
   bundle key, ascending) to make deadlock impossible, and a rule for advancing two epochs.
5. **No atomicity claim across repositories.** Replace "execute atomically" with an explicit
   ordering, a durable cross-repo journal, and a terminal **`partially-applied`** state that blocks
   all further operations on both bundles until an explicit reconciliation reports what landed. #31's
   existing `unknown` recovery is the right shape — it neither assumes success nor rolls back — but
   must name both repos.
6. **Multi-repo operation manifest and approval fingerprint.** A per-repository section per affected
   repo, an approval fingerprint that is a *set* of per-repo tuples, and a rule for what happens when
   one repo's head moves after approval (must expire the whole approval).
7. **Recovery over two repos.** Snapshot outside *both* mutation targets, restore both into
   disposable locations, verify both hashes, and one rollback procedure that covers a half-applied
   result.
8. **Automatic-invocation prohibition.** Cross-repo writes should be manual-only and never reachable
   from the automatic lifecycle ceiling, regardless of how small the effect is.

Rough weight: this is not one amendment. It is a change to five settled decisions plus one new
authority concept, with #31 requiring the most rework.

---

## 5. Recommendation

**A new ticket that supersedes one clause — not an edit to #22, and not a re-opening of #22.**

An edit is wrong because #22 did not leave cross-repository writes unaddressed; it enumerated them in
its closing sentence as something the resolution deliberately does not add, and #27 recorded the
concrete failure the read-only rule prevents ("widening read scope can never silently redirect a
write"). Editing a resolution to invert a clause it explicitly reasoned its way to would erase the
reasoning rather than answer it. Re-opening #22 is also wrong, and for the opposite reason: #22's
identity layers, read-routing precedence, non-merging ownership, manifest schema and trust model are
untouched by this proposal and are load-bearing for #11, #27, #31 and #35 — putting all of that back
in flight to change one write clause would be disproportionate, and #27's correction precedent
("This correction does not reopen the ticket") shows the project already handles targeted revisions
without re-opening. The right sequence is therefore two steps: **first**, a small presentational
ticket fixing the visualization's unqualified "read-only" label and the example manifest's `vendored`
mode, because cases (a) and (b) show the owner's actual requirement — the sibling being reachable and
being editable *in its own right* — is already satisfied today and the diagram merely misrepresents
it; **then**, only if the owner confirms they mean case (b), a new decision ticket
*"Decide cross-repository write authority"* that explicitly supersedes #22's write-routing clause,
carries the §4 list as its scope, and blocks on amendments to #31 (ledger location and multi-lock
protocol) and #11 (multi-repo approval fingerprint and recovery). #22 should be re-opened only in the
one case where the owner also wants federated reads and writes to share a single authority, since
that collapses the `access is not authority` separation that #22 and #27 both rest on — a change to
the model itself rather than to one of its rules.
