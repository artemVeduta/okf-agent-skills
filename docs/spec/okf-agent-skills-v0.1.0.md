# okf-agent-skills `v0.1.0` — implementation-ready specification

> Decision #43 post-dates every rule in this file. For `v0.1.0`, the manual-operation guard, guard ledger, guard lock, preview/approval flow, durable operation store, recovery snapshots, rollback, crash reconciliation, migration writes, merge and split, archive relocation, and all cross-repository writes are cut. Tickets #56, #57, #58, #59, #61, #63, #65, and #69 are `NOT_PLANNED` for this release (#43, #44). Sections 5, 6, 7, and the guarded rows of section 10 are retained as accepted design for a later guarded release and are NOT `v0.1.0` obligations.

Resolves [#8](https://github.com/artemVeduta/okf-agent-skills/issues/8). Synthesized from the 34
closed decision tickets of the wayfinder map
[Ship a production-ready cross-harness OKF skill suite](https://github.com/artemVeduta/okf-agent-skills/issues/1).

Every normative statement carries the issue that decided it, as `(#N)`. A statement with no
citation is an error, with one deliberate exception: the testing method, which no ticket settles
and which this document authors explicitly and says so in place. Where two tickets conflict, the
winner is marked `[precedence: #LATER over #EARLIER]`. What no ticket settles is listed in
**Open Items** and MUST be raised rather than invented.

## Problem Statement

A developer works with an agent across Claude Code, OpenAI Codex, and OpenCode. Knowledge that the
agent needs — domain language, rationale, rejected alternatives, constraints, invariants, ownership,
navigation, and reusable operational workflows — does not survive between sessions. Code records
executable behavior, so an agent can recover that. It cannot recover why a decision was made, what
was rejected, or what the team means by a word.

Open Knowledge Format (OKF) gives that knowledge a document format. It does not give an agent a way
to work with it. Today the developer has four problems:

1. **The agent does not consult existing knowledge.** Durable context sits in the repository and the
   agent never reads it, so the same explanation is retyped every session.
2. **The agent cannot maintain the knowledge safely.** An agent that is allowed to edit knowledge
   documents will mirror the code into them, invent meaning, or quietly destroy an authored concept
   during a rename.
3. **Nothing is the same across harnesses.** Each harness has different discovery, hooks,
   permissions, invocation controls, and session seams. Behavior written for one does not carry.
4. **Broad operations are unrecoverable.** Migration, restructuring, and archiving touch many files
   at once. Without a preview, an approval bound to that exact preview, and verified recovery, one
   agent mistake loses authored knowledge with no way back.

The developer needs the agent to read the right durable context automatically, make only small
evidence-backed updates automatically, and refuse everything else until a human explicitly asks,
sees the complete list of effects, approves that exact list, and has a restore that has been proven
to work.

## Solution

`okf-agent-skills` is a monorepo of Agent Skills plus a shared zero-dependency Node.js runtime that
gives all three harnesses one CRUD contract for OKF bundles (#5, #4).

From the developer's side:

- **Opt in per project.** A zero-byte `.okf-active` file at the worktree root turns on automatic
  behavior. Without it, nothing happens (#35).
- **Session entry orients, and reads nothing else.** At a supported session seam the adapter emits
  one bounded, read-only orientation carrying activation, current bundle identity, the root index
  path, aggregate workspace health, and one next action. It never mutates and never guesses the
  task (#35, #36, #39).
- **Reading is native.** The agent navigates admitted bundle indexes and concept bodies with the
  harness's own file and search tools. The suite ships no retrieval engine (#36).
- **Writing is bounded.** During ordinary feature or fix work the agent may create or revise a small,
  evidence-backed concept. Every other effect needs a human (#6, #11).
- **Broad work is gated.** `init`, full synchronization, migration, restructuring, archiving, and
  compaction are manual-only. Each requires an explicit request, a complete dry-run preview,
  a single-use confirmation bound to that preview, and — where the effect is broad, destructive, or
  changes identity — recovery evidence that has actually been restored and verified (#11, #29, #7).
- **The same rules everywhere.** The runtime decides authority, admission, validation, and guard
  outcomes. Adapters translate invocation, discovery, permissions, hooks, and presentation, and
  nothing else. Where a harness cannot provide a required safeguard, the adapter fails closed
  rather than claiming a control it does not have (#26, #35).

Two authority models exist side by side. In a **code-backed project** code stays authoritative and
OKF holds only what code cannot express. In a **knowledge-only project** the bundle is the complete
source of truth (#6).

## User Stories

### Knowledge model, project modes, and the automatic lifecycle

1. As a developer using an agent in a code-backed project, I want code, configuration, and tests to remain authoritative for executable behavior, so that OKF does not become a conflicting implementation mirror.
2. As a knowledge-base owner in a knowledge-only project, I want the bundle to hold complete substantive knowledge, so that my documents remain the source of truth.
3. As a developer using an agent in a mixed workspace, I want mode evaluated per bundle, so that one repository-wide assumption cannot write the wrong bundle.
4. As a developer using an agent, I want an unknown mode to allow inspection but block mutation, so that configuration uncertainty cannot corrupt my knowledge.
5. As a knowledge-base owner, I want temporary ledgers, receipts, caches, manifests, journals, and plans kept outside concept content, so that execution residue does not become durable meaning.
6. As a reviewer, I want the durable-context boundary to reject recoverable, duplicated, transient, speculative, and unsupported information, so that the bundle stays compact and trustworthy.
7. As an implementation agent building the suite, I want the seven task kinds fixed, so that task behavior is not inferred from file events.
8. As a developer using an agent, I want ambiguous work to remain read-only, so that the agent does not choose a mutation policy for me.
9. As a developer using an agent, I want feature work to consult context at entry and phase changes, so that implementation decisions use relevant durable knowledge.
10. As a developer using an agent, I want verified fixes to update reusable operational knowledge, so that a hypothesis cannot silently become a rule.
11. As the agent, I want debugging to require an explicit transition before mutation, so that cause analysis and correction remain separate.
12. As a developer exploring a codebase, I want exploration to require promotion before originating durable context, so that temporary investigation notes do not become policy.
13. As a researcher, I want uncertainty and unadopted numbers preserved as candidates, so that evidence is not promoted into product behavior.
14. As a reviewer, I want review to report without mutating its subject, so that accepting a finding starts a visible separate change.
15. As a developer preparing a pull request, I want pre-PR synchronization to inspect only the diff and declared knowledge scope, so that it does not perform an implicit broad rewrite.
16. As the agent, I want lifecycle moments ordered from scope and consultation through evidence choice, authorization, validation, and derivative maintenance, so that each write has a visible safety boundary.
17. As an adapter author, I want automatic hooks to remain read-only, so that a session-entry seam cannot mutate a bundle.
18. As a developer using delegated work, I want every child context to receive fresh orientation and fresh admission checks, so that it cannot inherit stale authority or scope.
19. As a developer using an agent, I want every mutation to use explicit intent, the shared write runtime, and the guard, so that native tools or delegation cannot bypass safety.
20. As an implementation agent building the suite, I want evidence-backed update preconditions to include ownership, bounded scope, evidence, mapping, and post-write validation, so that I do not invent a weaker write gate.
21. As a developer using an agent, I want new agent-originated concepts to be draft and unverified, so that generated knowledge is not silently published as reviewed.
22. As a reviewer, I want claim-affecting edits to invalidate verification, so that old evidence cannot endorse changed claims.
23. As a developer using an agent, I want trust tiers to remain advisory, so that verification evidence cannot become mutation permission.
24. As a knowledge-base owner, I want automatic effects listed explicitly, so that the agent cannot expand a small update into an archive or delete operation.
25. As a reviewer, I want automatic hooks barred from all mutation even when a bounded effect is eligible, so that background behavior cannot surprise me with a write.
26. As a developer using an agent, I want initialization, full synchronization, migration, compaction, archive, restructuring, deletion, and status changes to use manual flows, so that consequential work receives the required gates.
27. As a developer using an agent, I want manual invocation to remain necessary but insufficient, so that a command cannot bypass preview, approval, recovery, validation, or guard checks.
28. As a developer using an agent, I want synchronization to reconcile an explicit scope instead of mirroring sources, so that the lifecycle preserves judgment about durable context.
29. As a developer preparing a pull request, I want diff-scoped synchronization to report or propose before a follow-up mutation, so that review can inspect the intended knowledge change.
30. As a knowledge-base owner, I want full synchronization to require inventory, plan, preview, approval, recovery, and validation, so that a broad no-op is safe and a broad write is recoverable.
31. As the agent, I want no synchronization write when evidence is incomplete, ownership is unknown, or identity conflicts remain, so that missing facts produce abstention instead of guessed content.
32. As a developer using an agent, I want read-only work to report a stale or missing index without repairing it, so that reading cannot change my bundle.
33. As a reviewer, I want `log.md` to record only accepted knowledge mutations, so that reads and guard state do not look like authored history.
34. As an implementation agent building the suite, I want the lifecycle result values and required fields fixed, so that adapters report the same outcome vocabulary.
35. As a developer using an agent, I want results to carry task kind, scope, evidence limits, and next action, so that I can understand both the outcome and its limits.
36. As a reviewer, I want authored provenance separated from observed evidence, so that reading a file cannot fabricate a source declaration.
37. As a developer using an agent, I want provenance represented only by standard `sources` entries, so that the suite does not create a second derivation language.
38. As a reviewer, I want review dependencies selected explicitly, so that a source change does not silently become a freshness claim.
39. As a knowledge-base owner, I want review dependencies distinct from provenance, so that operational review tracking cannot change authored meaning.
40. As an implementation agent building the suite, I want baselines based on accepted dependency content identities, so that timestamps and Git position cannot substitute for review.
41. As a reviewer, I want a new or retargeted dependency reported as `review needed: no baseline`, so that setup cannot silently claim review.
42. As a reviewer, I want `changed`, `unavailable`, and `unobservable` kept distinct, so that the agent does not report inaccessible evidence as unchanged.
43. As a developer using an agent, I want review findings not to mutate status, freshness, verification, or trust, so that observation cannot silently rewrite lifecycle state.
44. As a knowledge-base owner, I want review evidence to propagate only over declared dependency edges, so that links and provenance cannot create unexpected review obligations.
45. As a reviewer, I want a concept with no dependencies reported as `not configured`, so that absence of tracking is not misreported as clean.
46. As an implementation agent building the suite, I want no implicit elapsed-time threshold, so that the release does not invent a stale policy.

### OKF conformance, the suite profile, and validation

47. As a developer using an agent in a code-backed project, I want every reachable bundle read, including broken and future-version content, so that compatibility problems do not hide my knowledge.
48. As a knowledge-base owner in a knowledge-only project, I want safe concepts read when another concept is blocked, so that one damaged document does not hide the rest of my bundle.
49. As a reviewer, I want the three OKF v0.2 section 11 tests applied exactly, so that bundle conformance is not expanded by product policy.
50. As a developer using an agent in a code-backed project, I want legacy fallbacks disclosed with their exact phrase, so that fallback consumption is not mistaken for v0.1 conformance.
51. As an implementation agent building the suite, I want absent, legacy, future, malformed, and non-string declarations treated as read-only rather than unreadable, so that the write gate is not implemented as a read gate.
52. As a knowledge-base owner in a knowledge-only project, I want unknown fields, types, links, and missing indexes tolerated for reads, so that consumer forbearance protects content I did not author with this suite.
53. As the agent, I want malformed frontmatter returned with a parse finding and no inferred status, so that I cannot silently repair or misclassify a broken concept.
54. As a developer using an agent in a code-backed project, I want only an exact root `okf_version: "0.2"` to permit mutation, so that flags cannot make the suite write an unsupported bundle.
55. As a reviewer, I want the write blockers closed and explicit, so that upstream recommendations cannot become accidental hard failures.
56. As an implementation agent building the suite, I want concept blockers scoped to dependent derivatives and independent concepts, so that one defective concept does not block unrelated work.
57. As a knowledge-base owner in a knowledge-only project, I want undeclared-bundle adoption to write only the declaration after preview, so that adoption cannot hide an implicit migration.
58. As a reviewer, I want the four producer obligations named separately, so that producer responsibility is not confused with consumer conformance.
59. As the agent, I want Attested Computation invocation limited to declared parameter values and a sanctioned computation left untouched, so that execution cannot alter authored computation.
60. As an implementation agent building the suite, I want parse, write, re-parse, and parse-tree comparison required, so that semantic preservation has a deterministic failure condition.
61. As a knowledge-base owner in a knowledge-only project, I want unknown third-party frontmatter preserved semantically, so that a suite rewrite does not destroy data from another producer.
62. As a developer using an agent in a code-backed project, I want comments, formatting, and quote style not promised as preserved, so that semantic preservation is not overstated as byte preservation.
63. As a reviewer, I want product-specific concept frontmatter, body sections, and semantic sidecars rejected by policy, so that operational state cannot change durable concept meaning.
64. As an implementation agent building the suite, I want origins, severities, scopes, blocked operations, and finding codes carried by one reporter, so that conformance errors and safety gates remain distinguishable.
65. As a reviewer, I want an explicit `OKF v0.2 bundle-conformant` line and no bare conformance claim, so that one claim cannot imply producer compliance or migration fidelity.
66. As a developer using an agent in a code-backed project, I want default link and staleness warnings nonblocking, so that hygiene findings do not alter conformance or stop safe work.
67. As a reviewer, I want review findings separate from conformance findings, so that a changed review dependency is not reported as an OKF format error.
68. As an implementation agent building the suite, I want validation scope fixed for reads, small local work, broad work, and post-operation checks, so that each lifecycle moment has a deterministic validation boundary.
69. As a developer using an agent in a code-backed project, I want missing required evidence to produce degraded or indeterminate results and block dependent writes, so that the suite cannot claim clean evidence it did not observe.
70. As a reviewer, I want review-dependency states kept distinct and provenance not treated as freshness, so that review need is not fabricated from a source entry.
71. As a knowledge-base owner in a knowledge-only project, I want growth signals to recommend review without rewriting my bundle, so that maintenance pressure cannot trigger data loss.
72. As an implementation agent building the suite, I want growth inputs limited to observed evidence until fixtures show causality, so that arbitrary counts do not become hidden thresholds.
73. As a knowledge-base owner in a knowledge-only project, I want compaction manual, lossless, recovery-gated, and limited to derived artifacts, so that authored meaning remains unchanged.
74. As a reviewer, I want every compaction artifact listed and one bundle selected explicitly, so that a compact operation cannot expand into an unseen federated write.
75. As the agent, I want semantic, identity, provenance, source, and review changes excluded from compaction or sent through fresh review, so that compaction cannot change trust by implication.
76. As an implementation agent building the suite, I want normative wording, keyword force, actor roles, empty statuses, and provenance tags controlled, so that the specification and implementation cannot invent requirements through tables or labels.
77. As a reviewer, I want the deleted safe retrieval fallback requirement recorded as dead rather than reintroduced, so that superseded budget behavior does not return through validation policy.

### Identity, workspace federation, and bundle admission

78. As a developer using an agent in a code-backed project, I want trust to follow my repository when I move it on disk, so that I do not re-grant trust after reorganizing my machine.
79. As a developer using an agent in a code-backed project, I want a fresh clone to inherit no trust, so that a replacement repository at a familiar path cannot ride an old approval.
80. As a developer using an agent in a code-backed project, I want linked worktrees to share one repository instance identity, so that trust and coordination behave the same in every worktree.
81. As a developer working on a read-only checkout, I want session-only trust that is never persisted, so that an unwritable instance still works without leaving durable authority behind.
82. As a knowledge-base owner in a knowledge-only project without a Git repository, I want my workspace instance to hold its trust state in a local sidecar, so that federation works without a repository.
83. As a developer using an agent in a code-backed project, I want SSH and HTTPS remote forms to resolve to one lineage, so that my teammates and I route to the same logical repository.
84. As a developer using an agent in a code-backed project, I want lineage verification to read only local Git configuration, so that resolving a workspace never sends a network request.
85. As a developer maintaining a fork, I want my fork to stay a distinct lineage, so that upstream concepts are never mistaken for mine.
86. As a developer who moved a repository to a new host, I want a manifest-declared alias to preserve lineage, so that my authored workspace links keep resolving.
87. As a knowledge-base owner in a knowledge-only project, I want a remote-less repository to federate under a manifest-scoped alias, so that I can use a local-only bundle without inventing a remote.
88. As a developer using an agent in a code-backed project, I want a Concept ID to be the bundle-relative path without `.md`, so that identity is visible in the filesystem and needs no extra metadata.
89. As a knowledge-base owner, I want the suite to refuse to add a UUID or product frontmatter to my concepts, so that my bundle stays plain OKF that other tools can read.
90. As a reviewer, I want a move to record source history only as operation evidence, so that nobody can claim a renamed concept is still the same concept.
91. As a developer using an agent in a code-backed project, I want exactly one workspace manifest active, so that two manifests can never disagree about which bundles exist.
92. As a developer whose harness starts inside a repository, I want a manifest above the Git root to require out-of-band supply, so that discovery never performs the upward walk it is supposed to authorize.
93. As a developer using an agent in a code-backed project, I want manifests never to merge or import one another, so that reading one file tells me the whole federation.
94. As a knowledge-base owner, I want an unknown key or a `..` path in my manifest to reject federation instead of being ignored, so that a typo cannot silently change which bundles are read.
95. As a developer using an agent in a code-backed project, I want a rejected manifest to leave current-repository operation intact, so that a broken federation declaration does not stop my local work.
96. As a reviewer, I want the manifest to contain no trust records, permissions, caches, machine paths, or operation records, so that the file can be shared without leaking or granting anything.
97. As a target repository owner, I want another repository's manifest to grant it nothing over mine, so that declaring my repository cannot make it writable.
98. As an implementation agent building the suite, I want the four admission gates in a fixed order with fixed outputs, so that I can implement admission without guessing what a failure means.
99. As a developer using an agent in a code-backed project, I want reach failures to short-circuit before any stat or trust check, so that an out-of-scope path is never touched.
100. As a security-conscious developer, I want reach codes withheld when naming them would disclose an unauthorized path, so that a refusal message cannot be used to probe my filesystem.
101. As a developer who typed a path myself, I want the refusal to name that path, so that I can act on the error I caused.
102. As a developer standing in a monorepo child, I want sibling packages excluded, so that entering one package does not silently widen my scope.
103. As a developer standing inside a submodule, I want its bundle usable, so that the parent's exclusion rule does not leave me with no knowledge at all.
104. As a developer with a nested repository inside a working tree, I want the deepest containing Git root to own the overlapping path, so that ownership is deterministic and the anomaly is still reported.
105. As a developer using symlinked sources, I want containment recomputed on every resolution, so that a symlink retargeted after an approval is refused on the next call.
106. As a developer using an agent in a code-backed project, I want trust and access failures reported together, so that I am not walked through a maze one wall at a time.
107. As a developer using an agent in a code-backed project, I want an untrusted but readable repository classified `UNTRUSTED` and not `INVALID`, so that a policy decision is not reported to me as a defect.
108. As a developer who declared a repository that is not one, I want `NOT_A_REPOSITORY` to describe my declaration, so that the finding points at the file I can fix.
109. As a developer using an agent in a code-backed project, I want a declared repository to activate automatically once every fresh check passes, so that I am not asked to confirm the same workspace repeatedly.
110. As a developer using an agent in a code-backed project, I want no activation TTL, so that my workspace does not expire on a clock nobody measured.
111. As a developer with one required member offline, I want workspace health degraded and dependent operations blocked, so that I never receive a confident answer built on missing knowledge.
112. As a developer with one required member offline, I want exact reads and unrelated local writes to keep working, so that one missing repository does not stop my day.
113. As a developer receiving a federated answer, I want it labelled non-exhaustive when a member is inactive, so that I know the coverage is incomplete.
114. As an adapter author, I want filesystem access and discovery authority kept strictly separate in both directions, so that my adapter cannot accidentally widen scope by granting a read.
115. As a Codex user, I want an independently authorized candidate refused with no additional-directory grant, so that the harness sandbox boundary stays honest.
116. As a Codex user, I want a repeatable `--add-dir` grant to supply access without widening discovery, so that granting a read never enlarges what the agent looks at.
117. As a developer moving between harnesses, I want the same read to be allowed in one and refused in another purely on access, so that harness limits are visible rather than silently worked around.
118. As a developer using an agent in a code-backed project, I want an unqualified exact read resolved in one fixed precedence order, so that the same request returns the same concept every time.
119. As a developer using an agent in a code-backed project, I want lower-precedence matches disclosed, so that I can see the alternative I did not get.
120. As a developer running a broad search, I want every admitted bundle examined, so that routing order never hides a relevant result.
121. As a knowledge-base owner, I want plain Markdown links to stay inside my bundle, so that a relative path cannot silently reach into another project.
122. As a knowledge-base owner, I want cross-bundle links written explicitly as `okf-workspace://` links, so that every cross-project reference is visible in the source.
123. As a knowledge-base owner, I want a missing alias to stay broken with a diagnostic, so that the suite never invents a target for a link I got wrong.
124. As a developer sharing a glossary, I want the glossary independently owned and pinnable to an exact Git object, so that shared terminology moves only when I choose.
125. As a developer with a local override of a shared term, I want project-local terminology to keep local-first precedence, so that my project's meaning wins in my project.
126. As a reviewer, I want two identical concepts in two bundles kept separate with a diagnostic, so that nobody silently deduplicates two teams' documents.
127. As a reviewer, I want fuzzy similarity and automatic consolidation forbidden, so that no heuristic can decide two concepts are the same.
128. As a developer using an agent in a code-backed project, I want writes to route to the nearest admitted bundle inside my current repository, so that widening read scope can never silently redirect a write.
129. As a developer using an agent in a code-backed project, I want updates and deletes routed to the owning bundle, so that editing a federated concept never lands in the wrong project.
130. As a knowledge-base owner of a vendored or generated bundle, I want it read-only, so that a downstream agent cannot edit content that a build step will overwrite.
131. As a target repository owner, I want cross-repository writes to require my own explicit consent, so that another repository cannot claim authority over mine.
132. As a target repository owner, I want consent bound to exact source and target instances, a target bundle, allowed effects, and an authority generation, so that a grant cannot be reused for another source, another bundle, or another effect.
133. As a target repository owner, I want consent stored uncommitted under my Git common directory, so that cloning my repository never distributes my grant.
134. As a target repository owner, I want to revoke consent at any time, so that I can stop a federated writer without editing anyone else's files.
135. As a target repository owner, I want consent to carry no TTL, so that a grant does not expire silently at an unmeasured interval.
136. As a target repository owner, I want a refused foreign write to return a write-authority finding rather than `INVALID` or `ACCESS_DENIED`, so that the agent tells me a policy decision rather than reporting a defect.
137. As a developer using an agent in a code-backed project, I want cross-repository writes barred from automatic lifecycle work, so that no hook can ever mutate a second repository.
138. As a developer running a cross-repository move, I want preflight to validate both repositories before the first write, so that a predictable failure stops before anything changes.
139. As a developer running a cross-repository move, I want the target published and validated before the source changes, so that a failed publication leaves my source untouched.
140. As a knowledge-base owner losing a concept to another repository, I want the source deprecated in place with a successor notice and an explicit workspace link, so that readers of the old path are led to the new one.
141. As a knowledge-base owner, I want source deletion to be a separate explicit effect under project-mode deletion rules, so that a move never quietly deletes my content.
142. As a reviewer, I want prose and code mentions left alone, so that an automated link update cannot rewrite my sentences or my source files.
143. As a target repository owner, I want a target path collision to block by default, so that a move can never implicitly merge into a concept I already have.
144. As a target repository owner, I want a transformed output to start as `draft` and unverified with only the provenance its body supports, so that no verification or review state is imported from a repository I do not control.
145. As an implementation agent building the suite, I want every affected bundle to use its own guard ledger and one deterministic canonical lock order, so that two repositories cannot deadlock or execute simultaneously.
146. As a reviewer, I want one sealed operation manifest and one append-only observation journal stored outside both mutation targets, so that the plan and the observations cannot be edited by the operation they describe.
147. As a reviewer, I want a per-repository approval record binding identity, revisions, content identity, hashes, grant generation, checks, and recovery evidence, so that approving a plan approves exactly that plan.
148. As a reviewer, I want any relevant change to expire the approval, so that a stale approval cannot execute against moved content.
149. As a target repository owner, I want an ordinary source pull-request approval to be insufficient, so that my repository is never mutated on the strength of a review in someone else's project.
150. As a reviewer, I want commit authorship, local Git identity, filesystem access, trust, and model self-approval all rejected as approval, so that only an authorized human or configured verifier can approve.
151. As a developer recovering from a crash mid-move, I want a proven partial result classified `partially-applied` and an unknown result classified `indeterminate`, so that the suite never claims an atomicity Git cannot provide.
152. As a developer recovering from a crash mid-move, I want both classifications to block further mutation until explicit reconciliation, so that I cannot compound the damage with a second write.
153. As a developer recovering from a crash mid-move, I want rollback and repair to be new operations with their own approval and recovery gates, so that undoing a change is as carefully checked as making it.
154. As an implementation agent building the suite, I want a fixture list covering revoked consent, wrong identity, missing markers, unknown mode, collisions, lock contention, and both failure orders, so that I know when the cross-repository move is done.
155. As a developer using an agent in a code-backed project, I want a warm cache and a cold run to produce the same result, so that performance state can never change what the agent is allowed to see.
156. As a developer using an agent in a code-backed project, I want admission verdicts, authority, and write targets never cached, so that revoking trust takes effect on the very next resolution.
157. As a developer using an agent in a code-backed project, I want the persistent cache outside my repository and outside my bundle, so that a scan cannot walk its own cache and my repository stays clean.
158. As a developer using an agent in a code-backed project, I want a corrupt or newer-version cache entry treated as a miss, so that a bad cache degrades speed rather than correctness.
159. As a developer using an agent in a code-backed project, I want a newer-version cache namespace left untouched, so that an older runtime cannot damage state a newer one wrote.
160. As a developer who just cloned a previously missing repository, I want the next explicit resolution to see it, so that no watcher, polling loop, or TTL is needed to notice.
161. As an implementation agent building the suite, I want every budget, tier, tokenizer, cost model, and retrieval ledger explicitly excluded from discovery, admission, and caching, so that I do not resurrect deleted policy.

### Concept navigation and reading

162. As a developer using an agent in a code-backed project, I want the agent to read my OKF concepts with the harness's own file and search tools, so that no extra retrieval service has to be installed or trusted.
163. As a developer using an agent in a code-backed project, I want the agent to start at the bundle-root `index.md`, then the relevant directory index, then the concept body, so that I can predict which files a question will open.
164. As a developer using an agent in a code-backed project, I want an exact Concept ID read to return exactly that concept, so that a typo never silently returns a different document.
165. As a developer using an agent in a code-backed project, I want an unresolved exact target reported as missing, so that I learn my reference is wrong instead of reading a plausible substitute.
166. As a knowledge-base owner in a knowledge-only project, I want broad questions to examine every admitted bundle, so that a relevant concept in a federated bundle is not skipped.
167. As a knowledge-base owner in a knowledge-only project, I want concepts never merged across bundles, so that each concept keeps one owner and one identity.
168. As a knowledge-base owner in a knowledge-only project, I want routing order used only as a tie-breaker, so that a lower-precedence bundle's relevant answer is still shown to me.
169. As a developer using an agent in a code-backed project, I want lower-precedence matches disclosed with the selected exact result, so that I can see when two bundles offer the same Concept ID.
170. As a knowledge-base owner in a knowledge-only project, I want an `okf-workspace://` link to resolve only through the active workspace manifest, so that a link can never reach a bundle I have not federated.
171. As a knowledge-base owner in a knowledge-only project, I want a plain Markdown link to resolve only inside its own bundle, so that my internal links cannot leak into another owner's content.
172. As a developer using an agent in a code-backed project, I want a broken alias reported as broken, so that I can fix the manifest instead of trusting a silent fallback.
173. As the agent, I want to refuse to fall back from an exact target to a similar name or a broad search, so that I cannot answer a precise question with an approximate document.
174. As the agent, I want to read only admitted and routed bundles, so that concept discovery cannot widen what the user admitted.
175. As the agent, I want concept discovery to grant no trust, access, write ownership, approval, or permission, so that finding a file never becomes authority over it.
176. As the agent, I want to recheck the activation marker, routing, admission, and files on every explicit read, so that a stale earlier result cannot decide a current answer.
177. As the agent, I want to treat my own memory as not being bundle content, so that I never report a remembered concept as a read one.
178. As a developer using an agent in a code-backed project, I want a missing, stale, or unreadable index reported rather than repaired, so that a read operation never quietly edits my bundle.
179. As a knowledge-base owner in a knowledge-only project, I want the agent to fall back to native search inside admitted scope when an index does not resolve my request, so that a bad index does not hide my content.
180. As a developer using an agent in a code-backed project, I want body search used when my question needs body evidence, so that a body-only term is still findable without any index entry.
181. As the agent, I want every native path validated against the current admitted realpath envelope, so that I cannot read outside the admitted scope.
182. As the agent, I want a path escape treated as a safety-contract violation and labelled `invalid`, so that a boundary breach is never presented as an ordinary read failure.
183. As an adapter author, I want to own only the native tool mappings, so that I never have to restate authority, trust, admission, or mutation rules in my adapter.
184. As an adapter author, I want to report degraded or unavailable behavior when my harness cannot enforce or observe the scope boundary, so that I never claim complete scope I cannot prove.
185. As an adapter author, I want the exact native tool names kept out of shared policy, so that my harness's tool naming can change without changing the product contract.
186. As an adapter author, I want the path guard defined as a guard rather than a retrieval backend, so that I do not build a search engine to satisfy a safety rule.
187. As a reviewer, I want the agent to answer only from observed evidence, so that I can check every claim against a named path.
188. As a reviewer, I want observed paths kept separate from authored `sources[]` provenance, so that reading a file never fabricates provenance for a concept.
189. As a reviewer, I want a complete-concept claim to require a verified end of file, so that "I read the whole concept" is an evidence claim and not an assumption.
190. As a reviewer, I want an unverified end of file reported as `unobservable` with a degraded result, so that partial reading is visible instead of implied.
191. As a developer using an agent in a code-backed project, I want malformed frontmatter returned with a parse finding and left unrepaired, so that a read cannot corrupt my document while explaining it.
192. As a developer using an agent in a code-backed project, I want status never inferred from an unread or malformed file, so that lifecycle state is only ever reported from observed data.
193. As a reviewer, I want a complete no-match claim limited to the declared scope and channel, so that "nothing found" cannot be read as "nothing exists".
194. As an implementation agent building the suite, I want the fixed result, match, finding, and coverage labels listed in full, so that I do not invent a fifth outcome word.
195. As an implementation agent building the suite, I want `insufficient` and the budget meaning of `invalid` explicitly removed, so that I do not restore a refusal path that `v0.1.0` deleted.
196. As an implementation agent building the suite, I want the compact answer labels named, so that every skill emits the same answer shape.
197. As an implementation agent building the suite, I want an exhaustive list of what `v0.1.0` does not ship, so that I do not rebuild the deleted budget runtime from research notes.
198. As an implementation agent building the suite, I want each deleted concept recorded as declined with its origin ticket, so that I can tell a decision from an omission.
199. As an implementation agent building the suite, I want only an immutable, content-addressed syntax-parse cache permitted, so that I do not add a discovery cache that preserves stale authority.
200. As the agent, I want admission and validation recomputed for every resolution, so that a cache hit can never stand in for a current permission check.
201. As a knowledge-base owner in a knowledge-only project, I want deprecated concepts kept in indexes, so that my history stays visible and my links stay resolvable.
202. As a knowledge-base owner in a knowledge-only project, I want ordinary navigation to exclude concepts observed as deprecated, so that superseded knowledge does not answer today's questions.
203. As a developer using an agent in a code-backed project, I want an exact read of a deprecated concept to succeed with a warning, so that I can still inspect retired knowledge when I name it.
204. As a developer using an agent in a code-backed project, I want the word "deprecated" in my question to not opt me into deprecated concepts, so that asking about deprecation does not change the corpus I search.
205. As a reviewer, I want an unobserved status to produce a degraded, unfiltered result with a disclosed unevaluated archive predicate, so that a filter that never ran is never reported as applied.
206. As a knowledge-base owner in a knowledge-only project, I want deprecation to have no effect on link resolution, so that inbound links to retired concepts keep working.
207. As a knowledge-base owner in a knowledge-only project, I want a successor notice treated as ordinary Markdown, so that a non-suite reader sees the same meaning my agent does.
208. As a developer using an agent in a code-backed project, I want the support ceiling stated as 500 source files, 100 MB of aggregate exact source bytes, and depth 6, so that I know where calibrated claims stop.
209. As a developer using an agent in a code-backed project, I want reads to continue above the ceiling without a completeness claim, so that a large bundle degrades honestly instead of refusing.
210. As a reviewer, I want the ceiling values marked provisional and gated on fixture evidence, so that no release advertises calibration nobody measured.
211. As an implementation agent building the suite, I want the required deterministic fixture list named, so that I know exactly which behaviors must be proven before a calibrated claim.
212. As a developer using an agent in a code-backed project, I want one bounded orientation per entry that names activation, bundle identity, root index path, workspace health, and one next action, so that a new session starts oriented without loading my bundle.
213. As a developer using an agent in a code-backed project, I want orientation to emit no index and no concept body, so that session entry stays small and predictable.
214. As the agent, I want orientation to make no token-budget estimate, so that no invented cost number decides what I show.
215. As the agent, I want a fresh orientation in every forked or delegated child context, so that I never act on an inherited and possibly stale view.
216. As the agent, I want a non-clean orientation to block mutation and claim nothing clean, so that a failed entry cannot become a licence to write.
217. As a developer using an agent in a code-backed project, I want an absent activation marker to make automatic behavior a silent no-op and explicit reads report `not-configured`, so that an unopted project stays untouched and I still get a clear answer when I ask.

### Operation risk, approval, the manual-operation guard, and recovery

218. As a developer using an agent in a code-backed project, I want every command expanded into atomic effects before authorization, so that a friendly command name cannot hide a deletion.
219. As a developer using an agent in a code-backed project, I want a composite operation to take the strictest atomic outcome, so that one dangerous step cannot ride along inside a safe-looking batch.
220. As a knowledge-base owner in a knowledge-only project, I want deletion blocked outright, so that my authoritative bundle cannot lose knowledge that exists nowhere else.
221. As a knowledge-base owner in a knowledge-only project, I want purge of unique durable knowledge blocked in both project modes, so that no mode setting can trade away irreplaceable context.
222. As a developer using an agent in a code-backed project, I want deletion allowed only when the preview proves supersession or redundancy and recovery checks pass, so that removal is always provably safe.
223. As a reviewer, I want the risk matrix stated as a complete table, so that I can audit any single effect without reconstructing policy from prose.
224. As an implementation agent building the suite, I want the twelve-step authorization order fixed, so that two implementations reach the same verdict for the same request.
225. As a developer using an agent in a code-backed project, I want an unknown project mode to permit reading and block mutation, so that an unconfigured repository cannot be written by accident.
226. As the agent itself, I want the automatic-execution ceiling stated as an explicit allowlist and denylist, so that I know exactly which maintenance I may perform without asking.
227. As a developer using an agent in a code-backed project, I want automatic execution barred from status changes, moves, merges, deletions, and sanctioned-computation edits, so that background work can never restructure my knowledge.
228. As a knowledge-base owner in a knowledge-only project, I want manual invocation to be necessary but not sufficient, so that typing a command never bypasses preview, approval, or recovery.
229. As a reviewer, I want trust tiers to be advisory evidence only, so that a promoted concept never becomes a permission to mutate it.
230. As a reviewer, I want trust tiers recomputed from verification events and never written directly, so that no actor can grant itself a higher tier.
231. As a knowledge-base owner in a knowledge-only project, I want a claim-affecting edit to clear `verified` and report the invalidation, so that stale human review cannot silently endorse changed content.
232. As a reviewer, I want a closed non-claim allowlist, so that the boundary between a formatting fix and a claim change is not a judgment call.
233. As a reviewer, I want human verification recorded only after explicit confirmation with a qualifying identity, so that commit authorship cannot be laundered into review evidence.
234. As a reviewer, I want approval bound to a full fingerprint of request, revisions, manifest, policy, checks, and recovery evidence, so that nothing I did not see can ride on my approval.
235. As a reviewer, I want any change to scope, content, evidence, policy, or recovery evidence to expire my approval, so that I cannot silently authorize different work than I read.
236. As a reviewer using pull requests, I want pull-request approval limited to code-backed repository-contained effects on an isolated branch, so that merging a branch cannot authorize unseen external effects.
237. As a reviewer using pull requests, I want a general pull-request approval never to create a human verification event, so that a routine merge does not fabricate review evidence.
238. As a developer using an agent in a code-backed project, I want the guard's eight states and transitions fixed, so that I can always see why an operation is blocked.
239. As a developer using an agent in a code-backed project, I want a preview created without a matching request to stay read-only, so that a preview I never asked for cannot become executable.
240. As a developer using an agent in a code-backed project, I want repeated identical requests to receive distinct occurrence-bound token IDs, so that one confirmation cannot cover two asks.
241. As a developer using an agent in a code-backed project, I want refusal and expiry reported as distinct classes with distinct codes, so that "you did not ask for this" reads differently from "the world moved".
242. As a developer using an agent in a code-backed project, I want every guard outcome to carry a summary, an expected-versus-observed detail, and a next action, so that I never have to guess my next step.
243. As the agent itself, I want confirmation refused when I initiated the request, so that I cannot approve my own work.
244. As a developer using an agent on OpenCode, I want attestation recorded as `unknown` and `degraded` rather than blocked, so that manual operations remain reachable while the weaker guarantee stays visible and auditable.
245. As a reviewer, I want an `unknown` attestation never to claim that a human explicitly invoked or confirmed the operation, so that an audit trail cannot overstate what actually happened.
246. As a developer using an agent on OpenCode, I want the shared guard mandatory on the prompt-injection command path, so that a bypassed harness permission gate does not become an unguarded mutation.
247. As a developer using an agent in a code-backed project, I want an incomplete preview refused before confirmation, so that I cannot approve a plan that omitted effects.
248. As a developer using an agent in a code-backed project, I want completeness rechecked at execution, so that a plan that became incomplete after my confirmation cannot run.
249. As a developer using an agent in a code-backed project, I want the fingerprint to exclude modification time and file size, so that a harmless touch does not train me to reconfirm blindly.
250. As a developer using an agent in a code-backed project, I want planned action and risk class inside the fingerprint, so that a move that becomes a delete invalidates my confirmation.
251. As an implementation agent building the suite, I want the expected fingerprint taken from the shown plan and never re-derived at execution, so that the guard is a real lease rather than the appearance of one.
252. As a knowledge-base owner in a knowledge-only project, I want a completed run to advance the bundle epoch and invalidate sibling confirmations, so that a second armed session cannot execute against a changed bundle.
253. As a knowledge-base owner in a knowledge-only project, I want a spent token never resurrected by a byte-identical rollback, so that one approval can never authorize two runs.
254. As an adapter author, I want content binding to be the portable expiry mechanism and time-to-live and session binding to be optional adapters, so that my harness is correct even without native staleness signals.
255. As an implementation agent building the suite, I want the exact execution-time recheck list, so that I recheck generation, epoch, token, operation, selector, completeness, and fingerprint in every implementation.
256. As a developer using an agent in a code-backed project, I want content or verification drift during an effect to abort the operation and record foreign mutation, so that a concurrent human review is never overwritten.
257. As a developer using an agent in a code-backed project, I want no in-place retry and no silent merge after drift, so that recovery from a conflict is always visible.
258. As a knowledge-base owner in a knowledge-only project, I want guard state stored outside my bundle, so that safety state never becomes knowledge content.
259. As a developer using an agent in a code-backed project, I want the ledger stored under the Git common directory, so that linked worktrees coordinate for the same logical bundle.
260. As a knowledge-base owner in a knowledge-only project working without Git, I want a workspace-root sidecar ledger, so that the guard still works outside a repository.
261. As a developer using an agent in a code-backed project, I want the ledger never committed, so that a fresh clone or CI checkout inherits no confirmation, epoch, or replay history.
262. As a reviewer, I want the ledger to hold hashes and never source content, so that safety state cannot leak knowledge into an uncommitted sidecar.
263. As an implementation agent building the suite, I want fail-closed behavior when the ledger cannot be created, secured, locked, or atomically replaced, so that a broken environment refuses instead of guessing.
264. As a developer using an agent in a code-backed project, I want execution to hold an exclusive per-bundle lock for its full duration, so that two already-armed sessions cannot start together.
265. As an implementation agent building the suite, I want epoch checking declared insufficient without locking, so that I do not ship a race the epoch cannot catch.
266. As a knowledge-base owner in a knowledge-only project, I want spent records bounded to the previous epoch instead of a permanent fingerprint blacklist, so that legitimate byte-identical content can be re-approved after a rollback.
267. As a developer using an agent in a code-backed project, I want missing ledger state at execution to refuse with `STATE_MISSING`, so that authorization is never reconstructed from what the caller claims.
268. As a developer using an agent in a code-backed project, I want corrupt, insecure, or newer-schema ledger state to refuse without being rewritten, so that a broken guard cannot repair itself into a permissive state.
269. As a developer using an agent in a code-backed project, I want an interrupted run to block confirmation and execution until explicit recovery, so that an unknown outcome is never treated as success.
270. As a developer using an agent in a code-backed project, I want crash recovery to report the operation, token, fingerprint, and start time, advance the epoch, and record `outcome: unknown`, so that I can decide what happened rather than have the tool decide for me.
271. As a developer using an agent in a code-backed project, I want recovery never to roll back automatically, so that a machine guess cannot destroy work that actually landed.
272. As an implementation agent building the suite, I want the operation manifest, observation journal, workspace manifest, and dry-run preview named as four separate artifacts, so that I never store resume state in a sealed record.
273. As an implementation agent building the suite, I want checkpoints and resume state located in the observation journal, so that the sealed manifest stays immutable inside the approval fingerprint.
274. As a developer using an agent in a code-backed project, I want the operation manifest stored outside every mutation target, so that an operation cannot destroy its own recovery record.
275. As a developer using an agent in a code-backed project, I want the operation store to survive repository replacement and the writing machine, so that a crashed operation is still reconstructible.
276. As a developer using an agent in a code-backed project, I want a missing, torn, corrupt, or truncated manifest to produce `indeterminate` and block, so that a partial record never supports a recovery claim.
277. As an implementation agent building the suite, I want restructuring phase derived from an append-only journal, so that recorded phase can never disagree with what happened.
278. As an implementation agent building the suite, I want each effect journaled as intent, then mutation, then outcome, so that a crash between the write and the append leaves a visible dangling intent.
279. As a developer using an agent in a code-backed project, I want `observedHash` compared at recheck and again before every intent, so that a concurrent verification aborts the write at the moment of writing.
280. As an implementation agent building the suite, I want phase guards expressed as one transition table read as data, so that a state cannot be reachable in code and forbidden in the design.
281. As a knowledge-base owner in a knowledge-only project, I want identity continuity never claimed across a move, so that a relocated file does not silently inherit review and trust it did not earn.
282. As an implementation agent building the suite, I want cross-bundle merge, cross-bundle split, and bundle-root moves unconstructible as plan types, so that the dangerous plan cannot be built rather than merely refused.
283. As a developer using an agent in a code-backed project, I want token spend and epoch advance placed strictly between the last outcome and settlement, so that a verification failure leaves my token unspent.
284. As a reviewer, I want terminals classified as settlement crossed with cleanliness, so that "succeeded but left residue" is a nameable result instead of a rounding error.
285. As a reviewer, I want a dirty terminal without a notice to fail invariant validation, so that silence is impossible by construction.
286. As a reviewer, I want an unrecognised loss classified as `unclassified-loss`, so that a loss the taxonomy missed degrades to a named state rather than to nothing.
287. As a developer using an agent in a code-backed project, I want rollback to always require fresh approval, so that a parent approval cannot authorize an undo I never saw.
288. As a knowledge-base owner in a knowledge-only project, I want rollback to restore bytes only and never reserialize, so that recovery cannot rewrite my formatting or frontmatter.
289. As a developer using an agent in a code-backed project, I want the inverse manifest built from what actually landed, so that rollback matches the partially applied world instead of the plan.
290. As a developer using an agent in a code-backed project, I want an empty inverse to block with `NOTHING_TO_ROLL_BACK`, so that a no-op undo cannot settle as applied.
291. As a developer using an agent in a code-backed project, I want `rollback-failed` to be a loud terminal with no automatic repair or inverse retry, so that the loudest failure cannot become the quietest with one keystroke.
292. As a developer using an agent in a code-backed project, I want repair to start as a new operation with its own preview, approval, snapshot, and recovery gate, so that fixing a half-restored corpus is as visible as breaking it.
293. As a knowledge-base owner in a knowledge-only project, I want recovery evidence to require a verified disposable restore and content-identity equality, so that a backup that merely exists cannot pass the gate.
294. As a developer using an agent in a code-backed project, I want Git history, reflogs, automatic commits, and `git archive` excluded as sole recovery evidence, so that uncommitted and untracked knowledge is really protected.
295. As a developer using an agent in a code-backed project, I want failed, stale, missing, or invalid recovery evidence to block execution, so that I cannot start a destructive operation I cannot undo.
296. As a reviewer, I want rollback residue recorded and the result forced to dirty or indeterminate, so that an unreversible external effect can never be reported as clean.
297. As an implementation agent building the suite, I want byte-identity brittleness recorded as an accepted cost, so that I do not add a normalizing step that turns ordinary rollbacks into failures.
298. As a developer working across two repositories, I want a distinct `WRITE_AUTHORITY` gate after reach, presence, trust, and access, so that read access to a sibling repository never becomes write authority.
299. As a knowledge-base owner in a knowledge-only project, I want cross-repository writes barred from automatic lifecycle work, so that no background task can mutate a peer bundle.
300. As a developer working across two repositories, I want every affected ledger reread under lock in a deterministic canonical order and held through settlement, so that two repositories cannot be armed and executed independently.
301. As a reviewer, I want a dedicated cross-repository approval with one record per affected repository, so that approving a source pull request cannot authorize a foreign write.
302. As a reviewer, I want a proven partial cross-repository result classified `partially-applied` and an unknown one `indeterminate`, with both blocking further mutation, so that no atomicity is claimed that Git cannot deliver.
303. As a developer using an agent in any project, I want automatic hooks to stay read-only and every mutation to pass the shared guard, so that native invocation controls are never the only safeguard.
304. As a developer using an agent in any project, I want a command invocation treated as a request rather than approval, so that running a slash command cannot publish a mutation.
305. As a developer using an agent in any project, I want settings unable to alter approval, recovery, or guard behavior, so that a convenience preference cannot weaken safety.
306. As the agent itself, I want to be unable to self-approve as a delegated writer, so that delegation never manufactures the approval it needs.
307. As an adapter author, I want a harness that cannot attest a complete preview or explicit confirmation to block the operation, so that I am never tempted to weaken the contract to fit my harness.
308. As an implementation agent building the suite, I want deterministic fixtures required for every safety gate, so that a regression in the guard fails a test rather than a user's bundle.

### Migration

309. As a developer using an agent in a code-backed project, I want to select one source root and explicit include and exclude rules, so that migration cannot scan or import an unintended workspace.
310. As a knowledge-base owner in a knowledge-only project, I want the project mode stated in the request, so that the accepted bundle becomes the clear active authority.
311. As an adapter author, I want external sources admitted only through existing read access, trust, and containment checks, so that migration cannot widen access or escape a source boundary.
312. As a developer using an agent in a code-backed project, I want only durable context migrated, so that implementation details are not copied into the knowledge bundle.
313. As the agent itself, I want migration kept separate from automatic lifecycle synchronization and initialization, so that background behavior cannot import an entire corpus.
314. As an implementation agent building the suite, I want parsing limited to supported Markdown inputs, so that I do not invent unsupported format semantics.
315. As a developer using an agent, I want one selected document to produce one concept by default, so that the tool does not split or invent meaning without my mapping.
316. As a reviewer, I want path-derived Concept IDs and no UUID v7 identity, so that migration follows the settled OKF identity model.
317. As a knowledge-base owner, I want target collisions to block, so that migration cannot overwrite an existing concept.
318. As a reviewer, I want explicit source types preserved and ambiguous types refused, so that the migration does not guess classification.
319. As a developer using an agent, I want attachments copied byte-for-byte with hashes, so that migrated references retain their source bytes.
320. As a knowledge-base owner, I want unsupported files retained as residue rather than interpreted or deleted, so that no source knowledge disappears silently.
321. As a reviewer, I want structured `sources` to take precedence over legacy citations, so that migration does not overwrite authoritative provenance.
322. As a knowledge-base owner, I want ambiguous citations and conflicts reported for my decision, so that the agent cannot fabricate provenance or reattribute claims.
323. As an implementation agent building the suite, I want residue visible in concepts or retained in the source corpus with a receipt entry, so that every unrepresented input remains findable and inert.
324. As a knowledge-base owner, I want originals immutable and cleanup separate, so that migration cannot destroy my source evidence.
325. As a developer using an agent, I want missing targets reported as warnings, so that a tolerated broken link is visible without blocking safe conversion.
326. As a reviewer, I want ambiguous link rewrites and dropped parsed references to block, so that navigation is not silently changed.
327. As a documentation author, I want paths in prose and code examples left untouched, so that migration does not rewrite non-link text.
328. As a reviewer, I want semantic fidelity separated from bundle conformance, so that a structurally valid bundle is not falsely presented as meaning-preserving.
329. As a knowledge-base owner, I want semantic fidelity claimed only after review of conflicts, residue, and high-risk conversions, so that machine checks cannot overstate preservation of my meaning.
330. As an implementation agent building the suite, I want all output staged and validated before atomic write-new-then-swap publication, so that a failed conversion cannot leave an incomplete bundle visible.
331. As a developer using an agent, I want partial work retained in staging and reported, so that I can narrow the request or resolve a blocker without losing the plan.
332. As a reviewer, I want the complete migration gate order fixed, so that every implementation checks authorization, evidence, approval, recovery, and validation in the same sequence.
333. As a developer using an agent, I want the preview to enumerate every selected input, transformation, conflict, residue item, output identity, hash, and recovery fact, so that approval covers the complete operation.
334. As a developer using an agent, I want incomplete previews refused before confirmation and checked again at execution, so that omitted work cannot run under a partial approval.
335. As a reviewer, I want confirmation bound to the request and content-bound plan, so that approval cannot authorize changed scope or changed actions.
336. As a knowledge-base owner, I want independent snapshots restored and verified before migration, so that a backup that merely exists cannot pass the recovery gate.
337. As a developer using an agent, I want failed or stale recovery evidence to block, so that migration never starts without a usable rollback basis.
338. As an adapter author, I want a harness unable to attest preview completeness or explicit confirmation to block migration, so that a weak integration cannot weaken the safety contract.
339. As an adapter author, I want lack of a native explicit-invocation control distinguished from inability to attest, so that I can provide reliable shared-runtime evidence without inventing a platform feature.
340. As a developer using an agent, I want model-initiated confirmation refused, so that the agent cannot approve its own migration.
341. As a developer using an agent, I want an interrupted migration to require explicit recovery and a fresh preview, so that unknown outcomes are never treated as success.
342. As a knowledge-base owner, I want a completed migration rerun to be an idempotent no-op, so that retrying a finished plan cannot duplicate or rewrite my knowledge.
343. As an implementation agent building the suite, I want request, scope, and content drift to invalidate a plan, so that resume cannot apply stale work.
344. As a reviewer, I want the receipt to include dispositions, mappings, provenance, residue, hashes, recovery, validation, and outcome, so that I can audit what migration actually did.
345. As a knowledge-base owner, I want the receipt kept outside OKF semantics, so that operational reporting cannot become an unreviewed concept or provenance source.

### Restructuring, archiving, and links

346. As a developer in a code-backed project, I want to merge two overlapping concepts under one preview and approval, so that I can consolidate durable context without hand-editing every reference.
347. As a developer in a code-backed project, I want a merge to expand into a complete effect plan, so that a friendly command name cannot hide a deletion or an identity change from me.
348. As a developer in a code-backed project, I want merge and split sources deleted only after the eligibility proof passes, so that I never lose unique durable context to a convenience operation.
349. As a knowledge-base owner in a knowledge-only project, I want deletion of a merge source refused, so that my authoritative bundle cannot be reduced by an automated step.
350. As a knowledge-base owner in a knowledge-only project, I want the deprecated merge source to keep its full original text, so that nothing I wrote disappears when I reorganize.
351. As a knowledge-base owner in a knowledge-only project, I want the deprecated source to carry a visible Markdown successor notice, so that a reader who lands on the old account learns where the knowledge went.
352. As a knowledge-base owner in a knowledge-only project, I want `leave` refused for a merge source, so that I never end with two unmarked concepts asserting the same knowledge.
353. As the agent, I want source disposition fixed by project mode, so that I cannot choose a weaker fate for a source because it is convenient in the moment.
354. As the agent, I want to refuse any restructuring when project mode is unknown, so that I cannot mutate a bundle whose authority model I have not established.
355. As a developer using an agent, I want no redirect artifact to ship, so that my bundle does not fill with stubs that resolve nothing.
356. As a developer using an agent, I want a retired path to vacate completely, so that the corpus never contains an identifier that pretends to still be a concept.
357. As a reviewer, I want the silent death of external references to a retired path recorded as an accepted cost, so that I judge a restructuring plan with the real consequence in front of me.
358. As an implementation agent, I want the exact list of inbound-link carriers, so that I build one discovery pass instead of guessing which references are load-bearing.
359. As an implementation agent, I want frontmatter `sources[].resource` counted as an inbound link, so that a move cannot sever the sole provenance edge while reporting a clean result.
360. As a documentation author, I want a path shown inside a code fence left untouched, so that a rewrite does not corrupt the example my document exists to illustrate.
361. As a developer using an agent, I want rewriting confined to the byte range of a parsed reference, so that a rename cannot alter unrelated prose.
362. As the agent, I want an incomplete `InboundLinkSet` to be inadmissible for rewriting, so that I cannot claim a total rewrite over evidence I do not hold.
363. As a developer using an agent, I want relocation blocked when link discovery is incomplete, so that I cannot move a concept out from under references nobody enumerated.
364. As a developer using an agent, I want in-place deprecation to proceed without complete link evidence, so that the cheap and safe archive operation is not priced like a move.
365. As the agent, I want every discovered link to carry an explicit fate, so that no reference is left silently unresolved after an approved operation.
366. As an adapter author, I want a `rewrite` fate on a read-only destination refused with `DESTINATION_BUNDLE_READ_ONLY`, so that a federated peer is never written through a link-maintenance step.
367. As a developer using an agent, I want a split to refuse to infer which output inherits a link, so that the machine does not silently pick a meaning I never approved.
368. As the agent, I want link resolution decided only by file existence, so that the same corpus always yields the same verdict.
369. As a reviewer, I want concept status excluded from link resolution, so that a link to a deprecated concept is reported as living, exactly as the format intends.
370. As a developer using an agent, I want cross-bundle references to require the workspace form, so that a plain Markdown link never reaches silently into another bundle.
371. As a knowledge-base owner, I want a missing workspace alias to stay broken with a diagnostic, so that a broken federation is visible rather than papered over.
372. As a reviewer, I want each restructuring output to carry exactly the sources its retained footnotes cite, so that no output claims evidence it does not use.
373. As a reviewer, I want provenance assignment rendered as a table keyed by output inside the preview, so that I approve the attribution I actually read.
374. As the agent, I want to refuse with `PROVENANCE_UNASSIGNED` when a source entry has no citing output, so that I never guess concept-level provenance.
375. As a developer using an agent, I want an identifier collision to block the operation, so that a merged document cannot carry two meanings for one footnote label.
376. As a developer using an agent, I want a resource collision reported as a notice with both entries retained, so that deduplication does not break the citations that depend on either entry.
377. As a knowledge-base owner, I want body text never rewritten to resolve a source collision, so that an operation approved for restructuring cannot re-attribute my claims.
378. As a knowledge-base owner, I want normal archive to mean in-place deprecation, so that archiving does not silently become an identity-changing move.
379. As a developer using an agent, I want relocation to require an explicit same-bundle destination, so that no `archive/` directory appears that I never asked for.
380. As a developer using an agent, I want relocation to refuse a destination collision and refuse to auto-suffix, so that I cannot overwrite or shadow an existing concept by accident.
381. As a knowledge-base owner, I want no `superseded_by`, `deprecation_reason`, or `retain_until` added, so that my bundle stays readable by any conformant OKF consumer.
382. As a reader of a bundle, I want the successor notice to be ordinary visible Markdown, so that a non-suite consumer sees the same navigation I do.
383. As the agent, I want deprecated concepts kept in indexes, so that a reader can still find history without a special tool.
384. As a developer using an agent, I want ordinary navigation to exclude observed deprecated concepts, so that superseded accounts do not compete with current ones.
385. As a developer using an agent, I want an exact path to still reach a deprecated concept with a warning, so that I can read history deliberately.
386. As the agent, I want a query containing the word `deprecated` to not count as an opt-in, so that I do not surface retired content on a coincidence of wording.
387. As the agent, I want to return a degraded unfiltered result and disclose the unevaluated archive predicate when status was not observed, so that I never claim a filter I did not apply.
388. As a knowledge-base owner, I want deprecated concepts retained indefinitely, so that age alone never destroys my history.
389. As a knowledge-base owner, I want archive recommendations to be read-only, so that a policy signal can prompt review but never mutate my content.
390. As a knowledge-base owner, I want automatic deletion of archived or deprecated concepts forbidden, so that no background behavior can purge my bundle.
391. As a developer using an agent, I want restoring a deprecated concept to stable to require preview and approval, so that reactivation is as deliberate as retirement.
392. As an implementation agent, I want restructuring state derived from an append-only journal, so that a recorded phase can never disagree with what actually happened.
393. As an implementation agent, I want the operation manifest sealed before the first mutation and stored outside every mutation target, so that recovery does not depend on the files the operation is changing.
394. As a developer using an agent, I want rollback built from effects that actually landed, so that a partial failure is reversed against the world as it is.
395. As a developer using an agent, I want rollback to restore bytes rather than reserialize a parsed view, so that recovery cannot quietly produce a different document.
396. As a reviewer, I want escaped retrieval and external-index observations reported as residue, so that a rolled-back operation is never presented as clean when it was not.
397. As an implementation agent, I want a concurrent content or verification change to abort the operation, so that I never overwrite work a human verified while my plan was in flight.

### Suite architecture, distribution, and skill authoring

398. As a developer using an agent in a code-backed project, I want one install command to add the router, the four skills, and the wrapper scripts, so that I do not assemble the suite by hand.
399. As a developer using an agent in a code-backed project, I want the suite to have no dependencies beyond the Node.js standard library, so that installing it cannot pull an unreviewed package into my project.
400. As a developer using an agent in a code-backed project, I want no CLI binary and no npm package, so that there is exactly one delivery path to keep current.
401. As a developer using an agent in a code-backed project, I want one Git tag per release, so that I can name the exact suite release version I installed.
402. As a developer using an agent in a code-backed project, I want `okf-read` to inspect my bundle with the harness's own file tools, so that no hidden retrieval backend decides what I am allowed to see.
403. As a developer using an agent in a code-backed project, I want `init`, `migrate`, and `compact` to be manual-gated, so that a broad or destructive lifecycle operation cannot start without me.
404. As a developer using an agent in a code-backed project, I want incremental synchronization to stay narrow automatic maintenance, so that routine work keeps directly affected derivatives current without a ceremony for every small change.
405. As a developer using an agent in a code-backed project, I want automatic hooks to stay read-only, so that a session-entry seam cannot write to my bundle.
406. As a developer using an agent in a code-backed project, I want every mutation to pass the shared write runtime and guard, so that no native tool can bypass the safety path.
407. As a knowledge-base owner in a knowledge-only project, I want migration to be an explicitly requested `okf-lifecycle` operation, so that my corpus is never converted as a side effect of ordinary work.
408. As a knowledge-base owner in a knowledge-only project, I want `okf-review` to own trust tiers and review baselines, so that review evidence lives in one place instead of being scattered across operations.
409. As a knowledge-base owner in a knowledge-only project, I want a review task kind to read, validate, and report only, so that reviewing my bundle cannot quietly rewrite it.
410. As a knowledge-base owner in a knowledge-only project, I want a mismatched or partial installation to fail closed, so that half-installed OKF behavior cannot act on my bundle.
411. As a knowledge-base owner in a knowledge-only project, I want adapter installation and removal to touch nothing but the harness, so that uninstalling an adapter cannot alter my markers, manifests, guard state, or content.
412. As the agent, I want the router to dispatch to exactly four sub-skills, so that I can reach the right capability without guessing.
413. As the agent, I want every skill to declare an explicit invocation design, so that I know which capabilities I may reach on my own and which need the human.
414. As the agent, I want each description to state distinct trigger branches once in third-person language, so that routing stays cheap and unambiguous.
415. As the agent, I want universal steps and completion gates inline in `SKILL.md`, so that I never need a second load to know how to finish safely.
416. As the agent, I want branch-specific material behind a context pointer that says when and why to load it, so that I load only what the current branch needs.
417. As the agent, I want every procedural step to end with a checkable completion criterion, so that I can prove a step is done instead of assuming it.
418. As the agent, I want an explicit bounded stopping condition for open-ended work, so that I do not claim exhaustive coverage I never had.
419. As the agent, I want `okf-reader` and `okf-writer` to bind to `okf-read` and `okf-write`, so that delegated placement reuses the same shared behavior as inline work.
420. As the agent, I want to be refused when a required safeguard is unavailable on the current harness, so that I cannot present degraded behavior as a clean result.
421. As an implementation agent building the suite, I want `scripts/lib/` to hold pure-function shared modules and no skills, so that the module boundary and the skill boundary never blur.
422. As an implementation agent building the suite, I want one thin wrapper script per skill over the shared library, so that adapters have a single execution surface.
423. As an implementation agent building the suite, I want shared admission, validation, lifecycle, and guard behavior owned by shared modules, so that I write each rule once.
424. As an implementation agent building the suite, I want the deleted retrieval runtime declared dead, so that I do not build a matcher, ranking service, tokenizer, budget, or retrieval ledger nobody asked for.
425. As an implementation agent building the suite, I want the release gate to be `node --test` with deterministic fixture-based contract tests, so that I know exactly what must pass before a tag.
426. As an implementation agent building the suite, I want live cross-harness process tests deferred, so that I do not block `v0.1.0` on a later acceptance phase.
427. As an implementation agent building the suite, I want the three test classes named and separated, so that I test metadata statically, workflow states by fixture, and adapters only against verified behavior.
428. As an implementation agent building the suite, I want to be told to stop and report an open item rather than invent a module filename or a wrapper schema, so that the specification stays trustworthy.
429. As a reviewer, I want to trace every normative rule from source and status through scope, consequence, verification, and unsupported behavior, so that no rule enters the suite unbacked.
430. As a reviewer, I want to inspect actual files and tests for drift, duplication, sediment, no-ops, negation, vague criteria, and false parity, so that review checks the artifact and not the intention.
431. As a reviewer, I want each meaning to have exactly one authoritative source, so that I can delete a duplicate instead of reconciling two versions of it.
432. As a reviewer, I want no-op sentences deleted rather than shortened, so that pruning removes cost instead of hiding it.
433. As a reviewer, I want research notes treated as evidence and never as policy, so that an unadopted finding cannot become a shipped rule.
434. As an adapter author, I want the portable core limited to `SKILL.md` plus its referenced files and scripts, so that I know exactly what I may not change.
435. As an adapter author, I want discovery, hooks, subagents, permissions, invocation policy, config trust, and loading semantics declared adapter concerns, so that I can translate them natively without forking the shared contract.
436. As an adapter author, I want to execute the wrapper script and read its stdout, so that my adapter carries no independent authority, retrieval, or guard semantics.
437. As an adapter author, I want semantic parity defined as equal decisions and safety outcomes, so that I can use native triggers and presentation without claiming identical behavior.
438. As an adapter author, I want the Codex `allowed-tools` and active-skill hook facts marked unverified, so that I do not build a control the harness never enforced.
439. As an adapter author, I want OpenCode explicit-only behavior to use per-skill `permission.skill: deny` with metadata intact, so that I do not depend on undocumented parser behavior.
440. As an adapter author, I want mutation on the OpenCode command path to still pass the shared runtime and guard, so that prompt injection cannot skip a safety gate.
441. As an adapter author, I want to be refused the right to grant write permissions, trust hooks, guard state, project files, or workspace configuration at install time, so that installing my adapter cannot silently arm a mutation.
442. As an adapter author, I want symlink-following treated as a tested topology fact rather than a general guarantee, so that my installation fixtures prove the layout instead of assuming it.

### Harness adapters, session entry, and delegated agents

443. As a developer using an agent in a code-backed project, I want automatic OKF behavior only in worktrees where I placed `.okf-active`, so that my other repositories are untouched.
444. As a developer using an agent in a code-backed project, I want installation to leave `.okf-active` alone, so that installing an adapter never silently activates a project.
445. As a knowledge-base owner in a knowledge-only project, I want marker creation to be a separate explicit step, so that activation is always my decision.
446. As a reviewer, I want `.okf-active` to grant no trust, authority, access, filesystem access, discovery authority, write ownership, foreign-write authority, approval, or permission, so that a one-byte file can never be read as consent.
447. As a developer using an agent in a code-backed project, I want a project without the marker to stay silent in automatic paths and report `not-configured` when I ask directly, so that I am never confused about whether the suite is on.
448. As a developer using an agent in a code-backed project, I want a malformed marker to produce a diagnostic and block mutation, so that I cannot silently corrupt my bundle through a broken setup.
449. As a knowledge-base owner in a knowledge-only project, I want workspace, federation, and routing declarations to stay in `.okf-workspace.json`, so that activation and federation remain separable.
450. As a reviewer, I want a cross-repository operation to require valid markers in both worktrees, so that one repository cannot reach into another that never opted in.
451. As an adapter author, I want to know that the target side needs no native adapter while the invoking side does, so that I do not require an unnecessary install on the peer.
452. As an adapter author, I want a defined list of what my adapter may own, so that I add native registration and presentation without touching shared semantics.
453. As an adapter author, I want a defined list of what my adapter must not redefine, so that authority, trust, guard, and mutation rules stay in one place.
454. As an implementation agent building the suite, I want adapters to invoke the shared runtime rather than reimplement it, so that three harnesses cannot drift into three products.
455. As a reviewer, I want an unsupported seam reported as degraded, so that a missing capability is never presented as working behavior.
456. As a developer using an agent in a code-backed project, I want a mismatched adapter and suite version to fail closed, so that a partial upgrade cannot half-apply safety rules.
457. As a developer using an agent in a code-backed project, I want my namespaced adapter configuration preserved across updates, so that upgrading does not erase my settings.
458. As a developer using an agent in a code-backed project, I want local overrides limited to presentation, admitted-bundle selection, and adapter capabilities, so that I cannot accidentally disable a safety rule.
459. As a knowledge-base owner in a knowledge-only project, I want removing an adapter to leave markers, content, manifests, and guard state untouched, so that uninstalling is safe.
460. As a reviewer, I want semantic parity defined as agreement on shared decisions and safety outcomes, so that nobody claims identical native behavior the harnesses do not have.
461. As the agent, I want one bounded, read-only orientation at session entry, so that I know where the bundle is without reading it all.
462. As a developer using an agent in a code-backed project, I want orientation limited to activation, bundle identity, root index path, aggregate workspace health, and one next action, so that session entry stays cheap and predictable.
463. As a developer using an agent in a code-backed project, I want orientation to carry no full index and no concept body, so that entering a session does not dump my knowledge base into context.
464. As a knowledge-base owner in a knowledge-only project, I want orientation to infer no task and perform no maintenance, so that opening a session never edits my documents.
465. As the agent, I want orientation to grant no authority, approval, brief, or writer permission, so that I never mistake a status summary for consent.
466. As the agent, I want every explicit read to start fresh and recheck the marker, routing, admission, and current files, so that I never answer from a stale session view.
467. As the agent, I want each forked or delegated child context to get its own orientation, so that I never inherit a parent's stale claim about a different scope.
468. As a reviewer, I want a child context to recheck activation, scope, routing, and admission, so that a delegated agent cannot ride a parent's admission decision.
469. As an adapter author, I want to own an occurrence key containing harness, repository instance, context ID, logical cause, and native event ID, so that I can deduplicate native events correctly.
470. As a developer using an agent in a code-backed project, I want duplicate native signals to produce one orientation, so that compaction does not repeat the same block twice.
471. As a developer using an agent in a code-backed project, I want a failed orientation attempt reported and never replayed automatically, so that a broken seam cannot loop.
472. As a reviewer, I want occurrence state kept out of OKF content and the guard ledger, so that session bookkeeping cannot contaminate safety state.
473. As an adapter author, I want the exact Claude Code seam named, so that I hook `SessionStart` for startup, resume, clear, compact, and fork without inventing a trigger.
474. As an adapter author, I want the exact Codex seam named, so that I use `SessionStart` for re-entry and `SubagentStart` for child contexts.
475. As an adapter author, I want the rule that Codex must not infer `fork` without a fork signal, so that I never fabricate a lifecycle cause.
476. As an adapter author, I want the exact OpenCode seam named, so that I inject orientation only through the awaited `experimental.chat.system.transform`.
477. As an adapter author, I want `session.created` and `session.compacted` classified as lifecycle signals only, so that I do not treat a fire-and-forget callback as proof of session mode.
478. As a developer using an agent in an OpenCode project, I want `PreCompact`, `PostCompact`, `SessionEnd`, and ordinary prompts to emit no second orientation, so that my context is not repeatedly re-primed.
479. As a developer using an agent in an OpenCode project, I want native `/okf-*` commands as the explicit entry path, so that I can start OKF work deliberately.
480. As a reviewer, I want per-skill `permission.skill: deny` selected as the model-invocation policy and required metadata kept, so that the explicit-only mechanism is documented and not an undocumented trick.
481. As a reviewer, I want a command treated as a request rather than approval, so that a slash command cannot publish a mutation.
482. As a developer using an agent in an OpenCode project, I want command-path mutation to pass the shared runtime, preview, confirmation, approval, recovery, and guard checks, so that a prompt-injected command cannot bypass the harness permission gate and corrupt my bundle.
483. As an implementation agent building the suite, I want the six orientation results fully enumerated with their required behavior, so that I do not invent a seventh state.
484. As a developer using an agent in a code-backed project, I want the host session to continue after a non-clean orientation, so that a knowledge-layer problem never blocks my ordinary work.
485. As a reviewer, I want a non-clean result to claim no clean evidence and permit no mutation, so that degraded conditions cannot be laundered into success.
486. As a developer using an agent in a code-backed project, I want bounded writes delegated by default and reads inline by default, so that the common path is fast and the risky path is isolated.
487. As a developer using an agent in a code-backed project, I want to switch either path with `read_execution` and `write_execution`, so that I can choose placement without changing safety.
488. As a knowledge-base owner in a knowledge-only project, I want `okf-reader` restricted to admitted read and search work, so that an analysis request can never write.
489. As a reviewer, I want `okf-writer` to be the only write-capable role and a leaf agent, so that write capability cannot fan out through nested agents.
490. As a reviewer, I want explicit tool allowlists per role with no raw file-write, Git-history, network, or nested-agent authority, so that capability is visible in the definition rather than emergent.
491. As a developer using an agent in a code-backed project, I want agent definitions inert until I use them, so that installing the suite grants nothing.
492. As the agent, I want an immutable delegation brief naming task kind, operation class, exact targets, allowed and forbidden effects, evidence, required gates, settings, and expected result, so that I know my exact bounds.
493. As the agent, I want a brief that may narrow but never widen shipped rules, so that a prompt cannot enlarge my authority.
494. As the agent, I want to return `blocked: incomplete-brief` or `blocked: conflicting-rules` instead of guessing, so that I cannot silently corrupt a bundle from an ambiguous instruction.
495. As the agent, I want to recheck marker, routing, admission, target identity, content, evidence, operation class, and guard state before execution, so that I never write against a stale handoff.
496. As a developer using an agent in a code-backed project, I want `blocked: stale-handoff` and `blocked: target-conflict` on drift, so that a changed target aborts instead of overwriting.
497. As a developer using an agent in a code-backed project, I want `blocked: repository-instance-mismatch` when the writer is not in the named worktree, so that a write cannot land in the wrong clone.
498. As a reviewer, I want only one active guarded writer operation per bundle, so that two sessions cannot arm and execute at once.
499. As a knowledge-base owner in a knowledge-only project, I want the writer barred from editing source code, committing, pushing, resetting, stashing, switching branches, or touching unrelated files, so that a documentation write stays a documentation write.
500. As a reviewer, I want approval owned by the main session or the user and self-approval forbidden, so that a delegated agent cannot authorize itself.
501. As a reviewer, I want preview, approval, and execution bound to one operation identity, bundle epoch, and guard generation, so that an approval cannot be replayed after drift.
502. As a developer using an agent in a code-backed project, I want a structured delegation receipt with status, identities, requested and actual effects, evidence, validation, residue, and next action, so that I can verify what actually happened.
503. As a developer using an agent in a code-backed project, I want process completion alone rejected as success, so that a finished agent run is not mistaken for a validated write.
504. As a developer using an agent in a code-backed project, I want a writer crash reported as `indeterminate` with no automatic retry, so that an interrupted write cannot be doubled.
505. As a developer using an agent in a code-backed project, I want partial effects reported as `partially-applied` and reconciled through a fresh guarded operation, so that repair is deliberate.
506. As the agent, I want a transient delegated read failure to fall back inline with a `degraded` disclosure, so that a flaky sub-agent does not block a safe read while the disclosure keeps the result honest.
507. As a developer using an agent in a code-backed project, I want a missing agent installation reported as an installation failure, so that my chosen execution path does not silently change.
508. As a developer using an agent in a code-backed project, I want settings precedence from adapter defaults up to a session override, so that I can tune one session without editing project files.
509. As a developer using an agent in a code-backed project, I want my session override to expire at session end, so that a temporary choice does not become permanent.
510. As a knowledge-base owner in a knowledge-only project, I want the suite to read and validate settings but never rewrite them, so that my configuration files stay mine.
511. As a developer using an agent in a code-backed project, I want an invalid setting to produce a diagnostic and fall back to the next valid value, so that a typo never turns into an invented behavior.
512. As a reviewer, I want delegation to change execution placement only, so that moving work into a sub-agent cannot change mode, admission, trust, access, authority, approval, recovery, markers, the write ceiling, or the guard.
513. As an adapter author, I want the Codex hook-scoping fact stated with its consequence, so that I build per-skill behavior from deterministic in-skill steps instead of an impossible matcher.
514. As an adapter author, I want the corrected OpenCode invocation facts stated, so that I do not repeat the retracted claim that no explicit-only equivalent exists.
515. As an adapter author, I want the OpenCode symlink fact stated with its narrow scope, so that I test my exact installation topology rather than assume every layout works.
516. As a reviewer, I want a skill never classified manual-only just because a harness ignores a frontmatter field, so that ignored metadata is not mistaken for enforcement.
517. As an implementation agent building the suite, I want the deterministic fixture list for delegation and settings, so that I know when `v0.1.0` is testable and complete.

### The operation map

518. As an implementation agent building the suite, I want one atomic-effect table with skill ownership, runtime responsibility, invocation class, and both project-mode outcomes, so that I do not invent placement behavior.
519. As a reviewer, I want every matrix cell to match section 05, so that operation authorization has one source of truth.
520. As a developer using an agent in a code-backed project, I want the router to dispatch to one owning skill, so that behavior does not split across competing implementations.
521. As the agent itself, I want reads and read-only analysis owned by `okf-read`, so that safe inspection uses native navigation without a custom retrieval backend.
522. As a knowledge-base owner in a knowledge-only project, I want bounded mutations to use the guarded write path, so that delegated or inline placement cannot bypass safety.
523. As a reviewer, I want shared admission, validation, lifecycle, and guard responsibilities named, so that harness adapters cannot duplicate authority.
524. As a developer using an agent in a code-backed project, I want incremental synchronization kept narrow and automatic, so that ordinary work does not trigger a broad manual operation.
525. As an implementation agent building the suite, I want diff-scoped and full-project synchronization distinguished from incremental synchronization, so that their gates cannot be mixed.
526. As a knowledge-base owner in a knowledge-only project, I want full-project synchronization to require preview, approval, recovery evidence, and validation, so that a broad reconciliation cannot silently rewrite my bundle.
527. As a knowledge-base owner in a knowledge-only project, I want migration to remain an explicit `okf-lifecycle` operation, so that source conversion never starts as lifecycle side effect.
528. As a developer using an agent in a code-backed project, I want archive, merge, and split to expose their atomic effects, so that deletion and identity changes cannot hide behind a command name.
529. As an implementation agent building the suite, I want composite outcomes to use strictest-outcome composition, so that one blocked or approval-gated effect controls the whole operation.
530. As a reviewer, I want directly affected indexes, logs, and mechanical links to inherit their parent outcome, so that derived maintenance does not create an approval bypass.
531. As a developer using an agent in a code-backed project, I want a standalone broad rebuild to receive the broad modifier, so that rebuilding derived artifacts receives the correct safeguards.
532. As a knowledge-base owner in a knowledge-only project, I want an unknown project mode to block all mutation, including derived artifacts, so that uncertain authority cannot write.
533. As the agent itself, I want the shared guard runtime to own confirmation state, so that no skill or adapter can create a second confirmation protocol.
534. As a developer using an agent in a code-backed project, I want the router to own the user-facing confirmation sequence, so that request, preview, confirmation, and execution remain one occurrence.
535. As a reviewer, I want `okf-review` to report guard state without mutating the reviewed subject, so that review remains non-mutating despite its reporting role.
536. As a reviewer, I want `okf-review` barred from self-approval and execution, so that review cannot authorize the operation it examines.
537. As the agent itself, I want model-initiated requests limited to preview preparation, so that I cannot confirm or execute my own work.
538. As a developer using an agent in a code-backed project, I want incomplete previews refused before confirmation and rechecked at execution, so that omitted effects cannot run.
539. As an implementation agent building the suite, I want unknown effects reported as open rather than assigned by analogy, so that unsupported behavior is visible.
540. As a reviewer, I want code-backed redundant deletion conditional on proof and recovery, so that only demonstrably safe removal can proceed.
541. As a knowledge-base owner in a knowledge-only project, I want deletion and unique-knowledge purge blocked, so that the authoritative bundle cannot lose irreplaceable knowledge.
542. As an adapter author, I want adapters to invoke the shared runtime and only transport results, so that native presentation cannot change operation outcomes.
543. As an implementation agent building the suite, I want invocation classes left open where the corpus does not assign them, so that skill metadata is not invented from a guessed default.

### Declared open items

544. As an implementation agent building the suite, I want every unsupplied rule listed in one table, so that I can tell a decided rule from a hole without re-reading the ticket corpus.
545. As an implementation agent building the suite, I want each hole to name the smallest decision that closes it, so that I can ask one question instead of guessing a design.
546. As an implementation agent building the suite, I want the table to say what each hole blocks, so that I can build everything it does not block.
547. As an implementation agent building the suite, I want to be refused permission to invent an operation-store path, so that I cannot place the only durable recovery record inside the target the operation may destroy.
548. As an implementation agent building the suite, I want to be refused permission to invent a schema version, so that a future runtime cannot silently accept records it does not understand.
549. As an implementation agent building the suite, I want to be refused permission to invent a retention window, so that recovery records are not pruned before anyone decided they could be.
550. As an implementation agent building the suite, I want to be refused permission to invent a snapshot mechanism, so that I cannot ship a restore path that reserializes content and turns an ordinary rollback into a failure.
551. As an implementation agent building the suite, I want to be refused permission to invent post-operation pass criteria, so that I cannot ship a check that reports success on evidence nobody accepted.
552. As an implementation agent building the suite, I want to be refused permission to invent a crash-recovery action, so that an interrupted operation is never resumed on a guess.
553. As an implementation agent building the suite, I want to be refused permission to invent a bootstrap exception to the write gate, so that I cannot weaken the exact `okf_version: "0.2"` mutation gate to make initialization reachable.
554. As an implementation agent building the suite, I want to be refused permission to invent a `<bundle-key>` encoding, so that two different bundles cannot silently share one guard ledger.
555. As an implementation agent building the suite, I want to be refused permission to invent a lock ordering key, so that two cross-repository operations cannot deadlock or interleave.
556. As an implementation agent building the suite, I want to be refused permission to invent a write-authority finding code, so that a refused foreign write is never reported as a defect in the target bundle.
557. As an implementation agent building the suite, I want to be refused permission to invent a wrapper output schema, so that three adapters do not each parse a different result shape and break semantic parity.
558. As a reviewer, I want the settled list beside the open list, so that I do not reopen a decision the corpus already made.
559. As a reviewer, I want each precedence-settled rule to name both tickets and the winner, so that I can check the ruling rather than trust it.
560. As a reviewer, I want the list of terms `CONTEXT.md` does not define, so that I can catch an implementation that invented a meaning for one of them.
561. As an adapter author, I want the missing adapter package location and install command declared open, so that I do not publish an installation path the suite later contradicts.
562. As an adapter author, I want the OpenCode explicit-only mechanism recorded as settled, so that I implement the permission lever and not the undocumented one.
563. As a developer using an agent in a code-backed project, I want the suite to refuse a broad operation whose recovery contract is unresolved, so that I cannot lose durable context to an unspecified snapshot.
564. As a developer using an agent in a code-backed project, I want the support ceiling labelled provisional, so that I do not read a completeness claim into a result the release cannot support.
565. As a knowledge-base owner in a knowledge-only project, I want the bundle-move orphan case declared open, so that moving my bundle root during an operation is refused rather than reconciled by guesswork.
566. As a knowledge-base owner in a knowledge-only project, I want the identical-byte concurrent-write label declared open, so that no operation reports clean on bytes it may not have written.
567. As the agent, I want every unresolved item to block the dependent claim rather than the whole session, so that I can still read, validate, and report while a decision is missing.
568. As the agent, I want research notes ruled out as closers of an open item, so that I do not adopt an unpromoted hypothesis as policy.

## Implementation Decisions

### 1. Knowledge model, project modes, and the automatic lifecycle

#### Project mode

- Each affected bundle MUST declare exactly one project mode: `code-backed` or `knowledge-only`. (#6)
- Project mode MUST be evaluated separately for each affected bundle. (#6)
- A mixed-scope operation MUST partition its work by bundle mode. (#6)
- Project mode MUST identify the authority model for durable knowledge and MUST NOT grant trust, access, write ownership, approval, or permission. (#6)
- Repository presence MUST NOT determine project mode. (#11)
- In a `code-backed project`, code, configuration, and tests MUST remain authoritative for executable behavior. (#6)
- In a `code-backed project`, OKF MUST contain only durable context that is not mechanically recoverable from authoritative artifacts. (#6)
- In a `knowledge-only project`, the OKF bundle MAY contain the complete substantive project knowledge. (#6)
- A `knowledge-only project` mutation MUST have documentary evidence or a direct human statement. (#11)
- An unknown or conflicting project mode MUST permit reading, validation, and analysis. (#6)
- An unknown or conflicting project mode MUST block every mutation, including index and log maintenance. (#6)
- Federated reads MUST NOT grant write authority. (#6)
- Generated and vendored bundles MUST remain read-only. (#22)

#### Durable context boundary

- Durable context MUST preserve knowledge that remains useful across agent sessions and is not duplicated from authoritative implementation. (#6)
- Durable context MAY contain domain language, rationale, rejected alternatives, constraints, invariants, ownership, navigation, and reusable operational workflows. (#6)
- Agents MUST abstain or return `no-op` when information is recoverable from authoritative artifacts, transient, speculative, duplicated, semantically unchanged, outside owner scope, or unsupported by sufficient evidence. (#6)
- Agents MUST NOT mirror implementation, constants, configuration, or behavior already expressed by code. (#6, #11)
- Temporary execution state MUST NOT become OKF concept content. (#6)
- Guard ledgers, receipts, caches, recovery manifests, operation manifests, observation journals, and temporary plans MUST remain outside OKF concept meaning. (#6, #21)
- The suite MUST persist no product-specific frontmatter, product-specific body sections, or semantic sidecars for concept meaning. (#21)
- Identity, traceability, routing, archive, and lifecycle information MUST use standard OKF fields, visible Markdown conventions, or non-semantic operational state. (#21)
- A real mutation MUST preserve frontmatter parsed semantics through write, re-parse, and parse-tree comparison. (#21)
- A failed semantic-preservation comparison MUST block the affected write. (#21)
- A semantic no-op MUST write nothing. (#21)
- Untouched Markdown body content MUST remain byte-identical after a mutation. (#21)

#### Task kinds

- The task kind MUST be selected from explicit user intent. (#6)
- The task kind MUST NOT be inferred from file events. (#6)
- Ambiguous work MUST remain read-only until the user clarifies the task kind. (#6)
- A phase transition MAY change the task kind within one work episode. (#6)
- The supported task kinds MUST be exactly `feature work`, `fix`, `debugging`, `exploration`, `research`, `review`, and `pre-PR synchronization`. (#6)

| Task kind | Permitted lifecycle behavior | Required refusal or transition |
| --- | --- | --- |
| `feature work` | The lifecycle MUST consult relevant context at entry and phase transitions and MAY create or revise bounded durable context after a meaningful result when evidence supports it. (#6) | The lifecycle MUST abstain from unsupported, duplicated, transient, or unrecoverable context. (#6) |
| `fix` | The lifecycle MUST consult troubleshooting and domain context and MAY update bounded reusable operational knowledge after the defect and correction are verified. (#6) | A fix hypothesis MUST NOT become durable context. (#6) |
| `debugging` | The lifecycle MUST read and analyze until the cause is established. (#6) | Mutation MUST wait for an explicit transition to `fix` or documentation. (#6) |
| `exploration` | The lifecycle MUST read and analyze by default. (#6) | Originating durable context MUST require explicit promotion or a phase transition. (#6) |
| `research` | The lifecycle MUST read and assess sources and MAY create or revise a sourced draft when source and reuse gates pass. (#6) | Uncertainty MUST be preserved, and unadopted numbers MUST remain candidates. (#6) |
| `review` | The lifecycle MUST read, validate, and report. (#6) | The reviewed subject MUST NOT be mutated as a side effect, and an accepted finding MUST start a separate update transition. (#6) |
| `pre-PR synchronization` | The lifecycle MUST inspect the diff and declared knowledge scope, validate, and report or propose. (#6) | Knowledge changes MUST require an explicit follow-up mutation. (#6) |

#### Lifecycle moments

- At task entry or phase transition, the lifecycle MUST establish scope and consult relevant context without mutating. (#6)
- At task entry or phase transition, automatic behavior MUST first pass activation, routing, scope, and bundle-admission checks. (#35, #36, #39)
- At an evidence checkpoint or task completion, the lifecycle MUST choose exactly one of `create`, `revise`, `no-op`, or `abstain`. (#6)
- Before mutation, the lifecycle MUST check owner, project mode, scope, evidence, and authorization. (#6)
- Every bounded `v0.1.0` mutation MUST require explicit user intent and MUST use the shared `okf-write` runtime; the manual-operation guard is retained design for a later guarded release. (#38, #43)
- Automatic hooks MUST remain read-only. (#35)
- Orientation MUST remain bounded, read-only, and separate from task-specific lifecycle work. (#35, #36)
- Orientation MUST NOT infer task intent, perform lifecycle maintenance, initialize state, retrieve task-specific context, or mutate OKF content. (#35, #36)
- Each forked or delegated child context MUST receive a fresh orientation and MUST recheck activation, scope, routing, and bundle admission. (#39)
- A non-clean orientation result MUST NOT claim clean evidence or permit mutation. (#39)
- After an accepted mutation, the lifecycle MUST validate the result. (#6)
- After an accepted mutation, the lifecycle MAY maintain only directly affected navigation and history derivatives. (#6)

#### Evidence-backed updates

- An evidence-backed update MUST be bounded, supported by authoritative or explicitly adopted evidence, owned by a known owner, and followed by post-write validation. (#6)
- A concept MAY be originated only when reusable durable knowledge is missing, ownership is known, and evidence supports a bounded concept. (#6)
- An agent-originated concept MUST begin as `draft` and unverified. (#6, #11)
- A concept MAY be revised only when its meaning or provenance-bearing metadata materially changes, the concept is owned, and evidence supports the revision. (#6)
- An automatic update MUST have task intent, a clear concept mapping, no unresolved conflict or unavailable dependency, bounded scope, and post-write validation. (#6)
- `Small` MUST mean structurally bounded and MUST NOT be defined by an invented numeric threshold. (#6)
- Automatic lifecycle execution MAY read, validate, create a small evidence-backed draft concept, make a small evidence-backed update, add independently reproducible machine verification, maintain directly affected indexes, and append an existing or policy-required log. (#11)
- Automatic lifecycle execution MUST NOT record human verification, independently remove verification, change status, move or rename concepts, perform broad link rewrites, archive, merge, split, synchronize broadly, migrate, compact, delete, purge, or edit a sanctioned computation. (#11)
- Automatic lifecycle work MUST NOT alter `status`, `verified`, trust tier, `stale_after`, review baselines, or concept identity. (#6)
- Claim-affecting edits MUST invalidate `verified` on the resulting concept. (#11)
- Trust tiers MUST be recomputed from verification events and MUST NOT be directly promoted or written as authority. (#11)
- Trust tiers MUST NOT grant mutation authority. (#11)
- Only a human actor MAY add human verification. (#12)

#### Automatic and manual effects

- Automatic hooks MUST perform no mutation, even when a bounded lifecycle effect is otherwise eligible. (#35)
- An explicitly authorized bounded lifecycle execution MAY perform only the automatic effect allowlist in this section. (#11, #38)
- `init`, large synchronization, full-project synchronization, migration, and compaction MUST be manual-only. (#11)
- Archive, merge, split, relocation, move, rename, delete, purge, status changes, human verification, broad link rewrites, and sanctioned-computation edits MUST be manual-only. (#6, #11)
- Manual-only MUST mean that explicit invocation is necessary but not sufficient. (#11)
- Manual-only operations MUST still pass their applicable matrix, preview, approval, recovery, validation, and guard gates. (#11)
- Broad, destructive, identity-affecting, or human-owned work MUST be handed off to a manual flow and MUST NOT be partially executed by the lifecycle. (#6)
- Cross-repository writes MUST never be automatic lifecycle work. (#37)

#### Scoped synchronization

- Synchronization MUST reconcile authoritative evidence and durable context within an explicit scope. (#6)
- Synchronization MUST NOT mirror sources. (#6)
- Incremental synchronization MUST be narrow automatic maintenance for directly affected concepts, declared review dependencies, and mechanical derivatives during ordinary work. (#6)
- Diff-scoped synchronization MUST be explicit pre-PR reconciliation over the current diff and its declared knowledge scope. (#6)
- Full-project synchronization MUST be explicit and manual. (#6)
- Full-project synchronization MUST require inventory, plan, complete preview, approval, recovery evidence, broad writes, and post-operation validation. (#6)
- Full-project synchronization MAY validly produce no writes. (#6)
- No synchronization MAY write when there is no semantic change, there is only a source-review signal, observation is incomplete, ownership is unknown, or an identity conflict remains unresolved. (#6)
- Read-only work MUST report a stale or missing index and MUST NOT silently repair it. (#6)
- Directly affected index entries MAY be maintained only after an accepted mutation. (#6)
- `index.md` MUST be treated as a progressive-disclosure navigation derivative. (#6)
- `log.md` MUST contain human-readable knowledge-change history. (#6)
- `log.md` MUST be appended only for accepted knowledge mutations. (#6)
- Reads, no-ops, declined writes, guard state, recovery manifests, and Git history MUST NOT be appended to `log.md`. (#6)

#### Lifecycle results

- A lifecycle result MUST use exactly one value from `applied`, `no-op`, `abstained`, `review needed`, `approval required`, `blocked`, or `failed/incomplete`. (#6)
- Every lifecycle result MUST carry the task kind. (#6)
- Every lifecycle result MUST carry the affected scope. (#6)
- Every lifecycle result MUST carry the limits of the observed evidence. (#6)
- Every lifecycle result MUST carry the next action. (#6)
- A harness adapter MAY render or transport a lifecycle result but MUST NOT change its authority or trust meaning. (#6)
- A non-clean orientation result MUST NOT be represented as clean lifecycle evidence. (#39)

#### Provenance and observed evidence

- Authored provenance MUST use only a standard OKF `sources` entry. (#12)
- A `sources[].resource` MUST identify evidence that supports the concept. (#12)
- A provenance source MUST NOT by itself assert that a source change makes a concept stale. (#12)
- The suite MUST NOT add `source_files`, `derived_from`, namespaced frontmatter, or a machine-parsed body convention for derivation. (#12)
- Observed evidence MUST be limited to files, paths, or tool results actually read during a resolution. (#12)
- Observed evidence MUST NOT be treated as authored provenance, a review baseline, or a freshness claim. (#12)
- Code-backed and knowledge-only projects MUST use the same provenance semantics. (#12)

#### Review dependencies and baselines

- A review dependency MUST be selected explicitly as an operationally tracked artifact or scope whose change may require review. (#12)
- The suite MUST NOT watch every provenance source automatically as a review dependency. (#12)
- A review dependency MAY reference a standard `sources[].id` or directly name a local file, recursive directory, OKF concept, or external resource. (#12)
- A review dependency MUST remain distinct from authored provenance and MUST NOT assert semantic freshness. (#12)
- A review baseline MUST be the accepted content identity of all review dependencies at an evidence-backed review. (#12)
- Git history, `HEAD`, file timestamps, and the concept's last edit MUST NOT define a review baseline. (#12)
- A newly added or retargeted dependency MUST report `review needed: no baseline` until explicitly reviewed. (#12)
- A policy-authorized machine or human MAY advance a baseline only after complete evidence review. (#12)
- An accepted baseline record MUST identify the reviewer, review time, concept content identity, every observed dependency identity, and disposition. (#12)
- A baseline disposition MUST be one of `unchanged`, `concept updated`, or `mapping repaired`. (#12)
- `changed` and `unavailable` dependencies MUST produce review-needed findings. (#12)
- `unobservable` dependencies MUST produce an indeterminate diagnostic. (#12)
- `changed`, `unavailable`, and `unobservable` findings MUST NOT mutate `status`, `stale_after`, `verified`, or trust tier. (#12)
- Review evidence MUST propagate only across explicitly declared review-dependency edges. (#12)
- Provenance and Markdown links MUST NOT imply review-state propagation. (#12)
- A concept with no review dependencies MUST be reported as `not configured`, not clean or stale. (#12)
- `stale_after` MUST retain its OKF meaning: the concept is stale when `today >= stale_after`. (#12)
- The suite MUST NOT provide an implicit elapsed-time threshold. (#12)
- A configured review cadence MAY produce `review due` but MUST NOT synthesize `stale_after`. (#12)
- Project mode MUST NOT convert review evidence into semantic staleness. (#12)
- Dependencies absent because of a sparse checkout, an inactive federation member, a missing permission, or a partial workspace MUST be `unobservable`, never assumed unchanged or deleted; a positively established existence failure MUST be `unavailable`. (#12)

### 2. OKF conformance, the suite profile, and validation

#### Read policy

- The suite MUST read every reachable bundle, including undeclared, legacy, future-version, unknown, and broken content. (#21)
- The suite MUST apply the three OKF v0.2 section 11 tests: parseable concept frontmatter, a non-empty `type`, and conforming present `index.md` and `log.md` files. (#21)
- The suite MUST apply the OKF v0.2 section 13.1 fallbacks of `timestamp` when `generated` is absent and `# Citations` when `sources` is absent. (#21)
- The suite MUST report each used fallback as `v0.1 consumed using v0.2 fallback`. (#21)
- The suite MUST NOT report fallback consumption as `v0.1 conformant`. (#21)
- The suite MUST NOT refuse a read because `okf_version` is absent, unknown, not the string `"0.2"`, or future. (#21)
- The suite MUST NOT refuse a read because of unknown frontmatter keys, unknown `type` values, broken cross-links, or missing `index.md`. (#21)
- The suite MUST continue reading safe concepts when another concept is blocked. (#21)
- The suite MUST return readable bytes with malformed frontmatter together with a parse finding. (#36)
- The suite MUST NOT infer status from malformed frontmatter. (#36)
- The suite MUST NOT repair malformed content during a read. (#36)
- Consumer tolerance MUST NOT turn a read finding into permission to mutate the affected content. (#21)

#### Write gate

- The suite MUST mutate only a bundle whose bundle-root `index.md` declares parsed `okf_version` exactly as the string `"0.2"`. (#21)
- The suite MUST treat an absent declaration, `"0.1"`, a future version, an unquoted numeric `0.2`, and every other value as read-only. (#21)
- Flags and project configuration MUST NOT override the exact declaration requirement. (#21)
- The writer MUST emit `okf_version: "0.2"`. (#21)
- Adopting an undeclared bundle MUST be an explicit, previewed operation whose only write is the declaration. (#21)
- Migration MUST be a separate explicit operation and MUST NOT happen implicitly. (#21)
- A concept write MUST be blocked if the affected concept fails an OKF section 11 test. (#21)
- A concept write MUST be blocked if the affected concept violates an enforced producer obligation. (#21)
- A concept write MUST be blocked if the suite writer cannot reproduce the frontmatter parse tree. (#21)
- The three concept-level blockers above MUST be the complete concept-level write blockers; upstream `SHOULD` rules and editorial guidance MUST NOT block a write. (#21)
- The conformance write gate MUST block only a root declaration failure, an affected concept's section 11 failure, an affected concept's enforced producer-obligation failure, a frontmatter parse-tree mismatch, or a derivative rebuild that depends on a blocked concept. (#21)
- A root declaration failure MUST block every managed write. (#21)
- A concept blocker MUST extend to derivatives rebuilt from that concept and MUST NOT block independent concepts. (#21)
- A semantic no-op MUST write nothing. (#21)
- Untouched Markdown body content MUST remain byte-identical. (#21)
- Producer-side write blockers MUST NOT cause the suite, acting as a consumer, to reject or refuse a third-party bundle. (#21)

#### Producer obligations

- A present `sources` entry MUST contain `resource`. (#21)
- A present `generated` entry MUST contain `by`. (#21)
- A concept with `type: Attested Computation` MUST contain `runtime`. (#21)
- A known human author or confirmer MUST use the `human:` prefix. (#21)
- The suite MUST NOT invent `parameters`, `executor`, or `attester` requirements. (#21)
- During Attested Computation invocation, an agent MUST supply only declared parameter values. (#21)
- During Attested Computation invocation, an agent MUST NOT author or edit the sanctioned computation. (#21)
- The Attested Computation invocation safeguard MUST be reported as an operational producer obligation, not as static bundle conformance. (#21)

#### Semantic preservation

- A real mutation MUST canonicalize complete frontmatter. (#21)
- The suite MUST establish semantic preservation by writing the output, parsing the output again, and comparing parse trees. (#21)
- An unequal parse tree MUST abort the affected write. (#21)
- A parse-tree finding MUST identify the responsible construct when the trees differ. (#21)
- Semantic preservation MUST retain YAML key names, scalar types and values, sequence order, and mapping structure. (#21)
- Semantic preservation MUST NOT promise retention of comments, mapping order, quote style, scalar spelling, or formatting. (#21)
- The suite MUST preserve unknown third-party frontmatter semantically. (#21)
- The suite MUST persist no product-specific frontmatter and no product-specific body section. (#21)
- The reader MUST accept bare or list-form `verified`. (#21)
- The canonical writer MUST emit `verified` as a list. (#21)

#### Suite profile

- The suite profile MUST impose exactly two rules beyond OKF bundle conformance: mutation requires the exact root declaration `okf_version: "0.2"`, and a rewrite must reproduce frontmatter parsed semantics through the suite writer. (#21)
- A suite-profile finding MUST use origin `suite`. (#21)
- A suite-profile finding MUST NOT be reported as an OKF conformance error. (#21)
- A suite-profile finding MUST carry severity `error` or `warning` and an independent `blocks` boolean. (#21)
- The suite MUST persist no product-specific frontmatter, product-specific body section, or semantic sidecar for durable concept meaning. (#21)
- Non-concept operational state MAY hold operational or configuration concerns, but MUST NOT become durable concept semantics. (#21)

#### Finding report

- Every finding MUST carry a stable code, an origin of `okf` or `suite`, a severity of `error` or `warning`, and a boolean `blocks`. (#21)
- The reporter MUST distinguish an OKF conformance error from a producer obligation, a suite-profile finding, and a safety gate. (#21, #7)
- An OKF conformance error MUST use origin `okf`. (#21)
- A producer obligation MUST be reported separately from the three OKF section 11 tests and MUST block only the affected producer write when enforced. (#21)
- A suite-profile finding MUST use origin `suite` and MUST remain separate from OKF conformance. (#21)
- An operation-specific check for identity, inbound links, provenance, review evidence, approval, recovery, conflicts, or post-operation state MUST be reported as a safety gate, not an OKF conformance error. (#7)
- A report MUST include the line `OKF v0.2 bundle-conformant: yes | no`. (#21)
- A report MUST identify blocked operations with finding codes. (#21)
- A report MUST identify legacy fallbacks when a fallback was used. (#21)
- The suite MUST NOT emit an unqualified `conformant`, `compliant`, `succeeded`, or equivalent claim. (#21)
- Bundle conformance MUST NOT establish producer compliance, migration completeness, or semantic fidelity. (#21)
- Fallback consumption MUST NOT establish bundle conformance. (#21)
- Default warnings MUST include unresolved internal links and `today >= stale_after`. (#21, #7)
- Default warnings MUST NOT block a write or change bundle conformance. (#21)
- Unknown fields and types, missing optional families, missing indexes, and editorial recommendations MUST NOT produce default warnings. (#21)
- Review findings MUST be reported separately from conformance findings. (#7)

#### Validation moments and scope

- Read validation MUST run the OKF section 11 tests and applicable legacy fallback handling. (#21)
- At task entry or phase transition, the suite MUST validate the read scope without mutating content. (#6)
- Before a mutation, the suite MUST validate the bundle root, affected concepts, owner, mode, scope, evidence, authorization, and applicable write gates. (#6, #21)
- Before mutation, validation MUST be re-run under the relevant guard. (#7)
- Small local work MUST validate the bundle root, affected concepts, and direct derived artifacts. (#7)
- Broad, destructive, identity-changing, or completeness-claiming work MUST use exhaustive validation. (#7)
- After an accepted mutation, the suite MUST validate the affected concepts and directly affected navigation and history derivatives. (#6)
- Post-operation validation MUST be bound to the approved plan. (#7)
- Missing or unobservable required evidence MUST produce `degraded` or `indeterminate` for reads. (#7)
- Missing or unobservable required evidence MUST block dependent mutation. (#7)
- Safe inspection MAY continue when missing evidence is not required for that operation. (#7)
- A review dependency MAY block only when the operation claims current or complete review evidence or requires that dependency for its safety claim. (#7)
- Provenance MUST NOT by itself infer semantic staleness. (#7)
- Review-dependency states `not configured`, `changed`, `unavailable`, and `unobservable` MUST remain distinct. (#7)

#### Growth signals

- Normative growth inputs MUST be observed work, bytes, files, parse failures, link findings, review-dependency findings, index coverage, and held-out retrieval results. (#7)
- Concept count, word count, age, tag overlap, and result count MUST remain descriptive until deterministic fixtures demonstrate a causal problem. (#7)
- A growth signal MAY report a condition or recommend manual review or compaction. (#7)
- A growth signal MUST NOT automatically compact, archive, purge, delete, or rewrite knowledge. (#7)

#### Compaction

- Compaction MUST be manual, recovery-gated, and lossless. (#7)
- Compaction MUST operate only on selected derived artifacts, such as indexes and link-maintenance data. (#7)
- Compaction MUST use one explicit bundle and a finite, fully enumerated selector. (#7)
- A compaction preview MUST list every affected artifact. (#7)
- Compaction MUST NOT expand into an implicit workspace-wide or federated write. (#7)
- Compaction MUST NOT summarize bodies, semantically merge concepts, deduplicate, delete, relocate, or change authored concept meaning. (#7)
- Compaction MUST satisfy the applicable preview, approval, recovery-evidence, and post-operation validation gates. (#7, #11)
- Compaction MAY preserve trust and accepted review state only after proving semantic no-op behavior. (#7)
- Claim, provenance, source, or identity changes MUST require fresh review. (#7)
- Restructuring outputs MUST start as `draft` and unverified. (#7)
- A review-dependency proposal MUST be non-authoritative. (#7)
- Explicit review MUST precede acceptance of a review-dependency proposal. (#7)
- A review baseline MUST NOT transfer automatically to a restructuring output. (#7)

#### Normative-drift controls

- Every future edit of the audited research note MUST reproduce normative OKF wording with its section number when stating an OKF requirement. (#34)
- This specification and its implementation MUST distinguish `MUST`, `MUST NOT`, `SHOULD`, `MAY`, definitional text, and text not present in the specification. (#34)
- A status with no corresponding RFC 2119 keyword MUST render as `—`, and MUST NOT render as `implied`, `Optional`, or `Core`. (#34)
- Producer and consumer roles MUST be labelled explicitly and MUST NOT be inferred from table placement. (#34)
- Every claim MUST carry one provenance tag from `[SPEC §x.y]`, `[REF-IMPL]`, `[README]`, or `[ANALYSIS]`. (#34)
- Analysis MUST appear under an `## Analysis (not spec)` heading. (#34)
- Future edits MUST apply these controls to the entire audited document. (#34)

### 3. Identity, workspace federation, and bundle admission

#### Repository instance identity

- Trust MUST attach to a repository instance identity. (#22)
- Trust MUST NOT attach to a filesystem path. (#22)
- A repository instance identity MUST be a UUIDv4. (#22)
- The suite MUST create that UUIDv4 only when trust is granted. (#22)
- The suite MUST store the UUIDv4 in Git common metadata. (#22)
- Linked worktrees MUST share one repository instance identity. (#22)
- Moving a repository instance MUST preserve its repository instance identity. (#22)
- Moving a repository instance MUST preserve its trust. (#22)
- A fresh clone MUST receive a new repository instance identity. (#22)
- A replacement repository at a previously trusted path MUST receive a new repository instance identity and MUST inherit no trust. (#22, #27)
- An unwritable repository instance MAY receive session-only trust. (#22)
- An unwritable repository instance MUST NOT persist trust. (#22)
- A non-repository workspace instance MUST hold its repository-instance-equivalent trust state in a local sidecar. (#22)
- The current repository MUST be trusted implicitly. (#27)
- No other candidate MAY be trusted implicitly. (#27)

#### Repository lineage identity

- The suite MUST use repository lineage identity for routing. (#22)
- The suite MUST NOT use repository lineage identity for authority or trust. (#22)
- A repository lineage identity MUST derive from an explicitly declared canonical fetch remote normalized to `host/path`. (#22)
- SSH and HTTPS remote forms MUST compare equally after normalization. (#22)
- Lineage normalization MUST remove remote credentials, query strings, fragments, default ports, trailing slashes, and a terminal `.git`. (#22)
- Manifest-declared aliases MAY preserve lineage identity across transfers and approved mirrors. (#22)
- Independently owned forks MUST remain distinct lineages. (#22)
- The suite MUST NOT infer fork equivalence. (#22)
- Lineage verification MUST read local Git configuration only. (#22)
- Lineage verification MUST NOT contact a network. (#22)
- A remote-less repository MAY federate under a manifest-scoped alias. (#22)
- A remote-less repository MUST make no global cross-workspace identity claim. (#22)

#### Workspace identity

- A workspace identity MUST be the active manifest's UUIDv4 `workspace_id`. (#22)

#### Bundle identity

- A bundle identity MUST be the pair of owner identity and bundle-root path. (#22)
- A repository-owned bundle MUST use repository lineage identity as its owner identity. (#22)
- A workspace-root bundle MUST use workspace identity as its owner identity. (#22)
- Moving a bundle root MUST change bundle identity. (#22)

#### Concept identity

- A Concept ID MUST be the bundle-relative file path without the `.md` extension. (#22)
- A fully qualified concept key MUST be bundle identity plus Concept ID. (#22)
- Moving a concept MUST change its identity. (#22)
- Renaming a concept MUST change its identity. (#22)
- The suite MUST NOT claim concept continuity through a UUID in frontmatter. (#22)
- The suite MUST NOT claim concept continuity through any product-specific frontmatter extension or semantic sidecar. (#11, #21, #22, #23)
- A move, merge, split, or migration MUST record source history only as operation evidence. (#22, #24)
- A move, merge, split, or migration MUST NOT claim identity continuity. (#22, #24)

#### What changes and what preserves each identity

The implementation MUST apply this table exactly. (#22)

| Identity | Derived from | Preserved by | Changed by |
|---|---|---|---|
| Repository instance identity | UUIDv4 minted at trust grant, stored in Git common metadata | moving the instance; adding or removing a linked worktree | a fresh clone; a replacement repository at the same path |
| Repository lineage identity | declared canonical fetch remote normalized to `host/path` | SSH/HTTPS form change; credential, query, fragment, default-port, trailing-slash or `.git` differences; a manifest-declared alias across a transfer or approved mirror | a different canonical remote that no manifest alias maps back |
| Workspace identity | the active manifest's UUIDv4 `workspace_id` | manifest edits that keep `workspace_id` | a different `workspace_id`; a different active manifest |
| Bundle identity | owner identity plus bundle-root path | edits inside the bundle; concept moves inside the bundle | moving the bundle root; a change of owner identity |
| Concept identity | bundle identity plus bundle-relative path without `.md` | edits to file content; frontmatter edits | moving the file; renaming the file; moving it to another bundle |

#### The workspace manifest: location and selection

- The workspace manifest MUST be the file `.okf-workspace.json`. (#22)
- The workspace manifest MUST be user-authored. (#22)
- The workspace manifest MUST remain separate from trust, harness access, and write authority. (#22, #37)
- The directory containing `.okf-workspace.json` MUST be the workspace root. (#22)
- Exactly one workspace manifest MUST be active. (#22)
- An explicitly supplied manifest MUST take precedence over a discovered manifest. (#22)
- Without an explicitly supplied manifest, the nearest manifest at or above CWD within the discovery ceiling MUST be selected. (#22)
- The discovery ceiling MUST be the Git root, or CWD when there is no repository. (#27)
- A manifest above the discovery ceiling MUST be supplied out of band. (#22, #27)
- A manifest above the discovery ceiling MUST NOT be found by upward walking. (#22, #27)
- Manifests MUST NOT merge one another in suite `v0.1.0`. (#22)
- Manifests MUST NOT import one another in suite `v0.1.0`. (#22)
- `.okf-workspace.json` MUST remain outside the general settings hierarchy. (#38)

#### The workspace manifest: schema

The implementation MUST accept exactly these declarations and MUST NOT accept others. (#22)

| Record | Field | Requirement |
|---|---|---|
| root | `schema_version` | MUST be exactly `1` |
| root | `workspace_id` | MUST be a UUIDv4 |
| repository | name | MUST be unique across repository records |
| repository | relative path | MUST be unique across repository records; MUST be relative |
| repository | identity | MUST be either a canonical remote with aliases, or `local: true` |
| repository | revision | MAY be an exact Git object revision |
| bundle | ordering | bundle records MUST be ordered |
| bundle | routing alias | MUST be unique across bundle records |
| bundle | owner | MUST be either a repository owner or `null` for a workspace owner |
| bundle | root path | MUST be a relative path |
| bundle | `required` | MUST be present |
| bundle | mode | MUST be one of `source`, `generated`, `vendored` |

- An unknown key MUST reject federation. (#22)
- A duplicate name MUST reject federation. (#22)
- A malformed identity MUST reject federation. (#22)
- An unsupported schema version MUST reject federation. (#22)
- An absolute path MUST reject federation. (#22)
- A `..` path segment MUST reject federation. (#22)
- An invalid field combination MUST reject federation. (#22)
- Rejected federation MUST preserve current-repository local operation. (#22)
- A `generated` or `vendored` bundle MUST be explicitly declared to participate in reads. (#22)

#### The workspace manifest: what it never contains and never grants

- The manifest MUST NOT contain trust records. (#22)
- The manifest MUST NOT contain harness permissions. (#22)
- The manifest MUST NOT contain caches. (#22)
- The manifest MUST NOT contain canonical machine paths. (#22)
- The manifest MUST NOT contain operation records. (#22)
- The manifest MUST NOT contain general routing language. (#22)
- The manifest MUST NOT grant trust. (#20, #22)
- The manifest MUST NOT grant filesystem access. (#20, #22)
- The manifest MUST NOT grant discovery authority to a path it merely names. (#20, #22)
- The manifest MUST NOT grant write ownership. (#20, #22)
- The manifest MUST NOT grant approval or permission. (#20, #22)
- The manifest MUST NOT grant foreign-write authority. (#37)

#### Bundle admission: gate order

- Bundle admission MUST be a bundle-level decision. (#22)
- Bundle admission MUST NOT locate, rank, or read concepts. (#22)
- Bundle admission MUST evaluate gates in the order `REACH -> PRESENCE -> {TRUST, ACCESS}`. (#22, #27)
- Bundle admission MUST run before concept navigation. (#36)
- A foreign write MUST pass a distinct `WRITE_AUTHORITY` gate after `REACH -> PRESENCE -> {TRUST, ACCESS}`. (#37)

The implementation MUST apply this gate table exactly. (#22, #27, #37)

| Gate | What it tests | Reporting behavior | How a human fixes it |
|---|---|---|---|
| `REACH` | Git-root boundaries, workspace containment, symlink policy, exclusion rules, submodule and nesting shape, repository topology | short-circuits before stat, trust, identity, and access checks; the refused path stays unnamed when naming it would disclose an unauthorized path | widen scope through explicit scope authority |
| `PRESENCE` | whether a declared candidate exists, is a repository when required, and contains the declared bundle | short-circuits `TRUST` and `ACCESS` | clone the repository, or initialize the bundle |
| `TRUST` | trust for the canonical repository instance identity | evaluated together with `ACCESS`; both failures reported at once | grant trust to the repository instance |
| `ACCESS` | current harness filesystem access | evaluated together with `TRUST`; both failures reported at once | reconfigure the harness, including an additional-directory grant |
| `WRITE_AUTHORITY` | target-side foreign-write consent for the exact source instance, target instance, target bundle, and effects | reports a write-authority finding, never `INVALID` or `ACCESS_DENIED` | the target owner issues consent through the target-owner or administrator workflow |

#### Bundle admission: `REACH`

- `REACH` MUST be widened only by explicit scope authority. (#27)
- Discovery MUST NOT walk above the Git root. (#22, #27)
- Discovery MUST NOT walk sideways implicitly. (#22, #27)
- Monorepo member bundles MUST enter scope from the monorepo root. (#27)
- Entering one monorepo child MUST NOT pull in its siblings. (#27)
- Contextual upward discovery MAY admit a nested bundle even when the monorepo manager does not declare its directory. (#22)
- A root session MUST NOT recursively scan undeclared directories. (#22)
- A submodule MUST be excluded as a dependency of its parent. (#27)
- A submodule MUST remain usable when CWD is inside that submodule. (#27)
- A canonical path MUST be owned by its deepest containing Git root. (#22, #27) [precedence: #22 over #27]
- Parent access to a nested repository MUST require explicit federation. (#22)
- Parent access to a submodule MUST require explicit federation. (#22)
- Every symlink target MUST remain within the active workspace root. (#22)
- The suite MUST NOT ship an external symlink allowlist in `v0.1.0`. (#22)
- Realpath containment MUST be recomputed on every resolution. (#22, #27)
- A symlink cycle MUST fail safely. (#22)
- A dangling symlink MUST fail safely. (#22)
- A symlink escape MUST fail safely. (#22)
- A symlink retargeted after an earlier successful resolution MUST be refused on the next resolution. (#22, #27)
- `REACH` failures MUST short-circuit before stat, trust, identity, or access checks. (#27)
- A reach failure MUST remain unnamed when reporting it would disclose an unauthorized path. (#27)
- A reach failure MAY be named when the user already named the path. (#27)
- A refusal that describes something inside the authorized scope MUST be reported in full. (#27)

These reach codes MUST be withheld when they would disclose something outside the authorized scope. (#27)

| Withheld reach code | Condition |
|---|---|
| `ABOVE_GIT_ROOT` | the candidate sits above the Git root |
| `SIDEWAYS_SIBLING` | the candidate is a sibling reached without authority |
| `OUTSIDE_WORKSPACE` | the candidate falls outside the active workspace root |
| `SYMLINK_ESCAPE` | a symlink target leaves the active workspace root |
| `CWD_NOT_A_WORKSPACE` | CWD supplies no repository and no bootstrap authority |

#### Bundle admission: `PRESENCE`

- `PRESENCE` MUST test whether a declared candidate exists. (#27)
- `PRESENCE` MUST test whether a declared candidate is a repository when a repository is required. (#27)
- `PRESENCE` MUST test whether a declared candidate contains the declared bundle. (#27)
- `PRESENCE` failures MUST short-circuit trust and access checks. (#22)
- `NOT_A_REPOSITORY` MUST describe a declaration and MUST NOT describe an undeclared path. (#22, #27)
- A path that nobody declared MUST only ever be reported as missing a bundle. (#27)

#### Bundle admission: `TRUST` and `ACCESS`

- `TRUST` MUST test trust for the canonical repository instance identity. (#27)
- `ACCESS` MUST test current harness filesystem access. (#27)
- `TRUST` and `ACCESS` MUST be evaluated together. (#27)
- `TRUST` and `ACCESS` MUST report both failures when both fail. (#27)
- An access check MUST be a fallible query whose failure is a first-class status. (#27)
- An access check MUST NOT surface its failure as an exception. (#27)

#### Candidate results and finding vocabulary

- A candidate result MUST contain `active` or `inactive` plus composable findings. (#22)

The implementation MUST use this finding vocabulary. (#22, #27, #37)

| Finding | Meaning | Gate |
|---|---|---|
| `DECLARED_MISSING` | a declared candidate is absent | `PRESENCE` |
| `NOT_A_REPOSITORY` | a declaration asserted a repository and the path is not one | `PRESENCE` |
| `BUNDLE_MISSING` | the repository is present and the declared bundle is absent | `PRESENCE` |
| `IDENTITY_MISMATCH` | the candidate carries an unexpected repository identity | identity check; gate assignment undecided |
| `UNTRUSTED` | the candidate is reachable, present and readable but not trusted | `TRUST` |
| `ACCESS_DENIED` | the current harness cannot access the candidate | `ACCESS` |
| `INVALID` | manifest or candidate data is invalid | data validity |
| write-authority finding | a readable and trusted target carries no foreign-write authority | `WRITE_AUTHORITY` |

- A reachable, present, readable but untrusted candidate MUST produce `UNTRUSTED` and MUST NOT produce `INVALID`. (#22, #27)
- An inaccessible candidate MUST produce `ACCESS_DENIED` and MUST NOT produce `HARNESS_NO_ACCESS`. (#22, #27) [precedence: #22 over #27]
- A refused foreign write MUST produce a write-authority finding and MUST NOT produce `INVALID` or `ACCESS_DENIED`. (#37)

#### Activation and workspace health

- A reachable declared repository MUST activate automatically when fresh reach, presence, identity, trust, and access checks all pass. (#22)
- A new clone MUST normally stop at trust. (#22)
- A new clone MUST NOT require an additional activation prompt. (#22)
- Activation MUST NOT use a time-to-live. (#22)
- An inactive required member MUST degrade workspace health. (#22)
- An inactive required member MUST block operations that require that member. (#22)
- Exact reads from active bundles MAY continue while another required member is inactive. (#22)
- Unrelated local writes MAY continue while another required member is inactive. (#22)
- A federated result produced with inactive members MUST state that its coverage is non-exhaustive. (#22)
- An optional inactive member MUST NOT degrade completeness. (#22)

#### Reach, presence, trust, and access are separate

- Reach, presence, trust, and access MUST remain separate decisions with separate failure meanings. (#27)
- Filesystem access MUST NOT grant discovery authority. (#22, #27)
- Discovery authority MUST NOT grant filesystem access. (#20, #27)
- Discovery authority MUST be established only by the current repository, an explicitly selected workspace root, or the active manifest. (#22)
- CWD MUST NOT automatically become the workspace root. (#27)
- A `projects/` directory MUST NOT establish discovery authority. (#27)
- A dependency symlink MUST NOT establish discovery authority. (#27)
- A harness filesystem grant MUST NOT establish discovery authority. (#22, #27)
- Harness-native multi-root inputs and additional-directory grants MUST be treated as access or candidate signals only. (#22, #27) [precedence: #22 over #27]
- No repository, no bootstrap and zero bundles MUST be a correct, supported state. (#27)
- The suite MUST behave correctly with every harness adapter switched off. (#27)

#### The Codex additional-directory case

- In Codex, an independently discovered, trusted, federated candidate MUST be refused when no additional-directory grant exists. (#27)
- In Codex, a repeatable `--add-dir <path>` grant MAY provide filesystem access to that independently authorized candidate. (#27)
- Codex `--add-dir` MUST NOT widen discovery authority. (#27)
- A candidate reached only through `--add-dir` MUST still be independently authorized for discovery by a selected workspace root or the active manifest. (#27)
- The same federated read MAY succeed in Claude Code and fail in Codex solely because current harness access differs. (#22)

#### Read routing

- Federation MUST be read-time composition of explicitly admitted bundles that retain independent identity and ownership. (#22)
- Concepts MUST NOT merge across bundles. (#22)
- Every concept MUST have exactly one owning bundle. (#22)
- Matching paths, resources, or content MUST produce diagnostics. (#22)
- Matching paths, resources, or content MUST NOT create synthetic documents. (#22)
- Matching paths, resources, or content MUST NOT change ownership. (#22)
- Broad search MUST examine every admitted bundle. (#22)
- Routing order MAY break ties. (#22)
- Routing order MUST NOT discard relevant results. (#22)
- The selected result MUST disclose lower-precedence matches. (#22)

An unqualified exact read MUST resolve in this order. (#22)

| Order | Source |
|---|---|
| 1 | the explicit target, when the caller named one |
| 2 | the nearest admitted bundle |
| 3 | current-repository ancestors, nearest first |
| 4 | explicitly federated bundles, in manifest order |

#### Cross-bundle links and alias resolution

- A standard Markdown link MUST resolve only within its source bundle. (#22)
- A standard Markdown link MUST NOT fall through to another bundle. (#22)
- An authored cross-bundle link MUST use the form `okf-workspace://<bundle-alias>/<concept-id>`. (#22)
- The active manifest MUST be the only resolver for `okf-workspace://` links. (#22)
- A missing or inactive alias MUST remain broken. (#22)
- A missing or inactive alias MUST produce a diagnostic. (#22)
- A workspace link MUST NOT widen discovery authority. (#22)
- A workspace link MUST NOT widen trust, access, or write authority. (#22)
- An exact read MUST accept a bundle-relative Concept ID or an `okf-workspace://<bundle-alias>/<concept-id>` target. (#36)
- An `okf-workspace://<alias>/<concept-id>` reference MUST count as an inbound link. (#24)

#### Shared glossaries

- A shared glossary MUST remain an independently owned, manifest-federated read source. (#22)
- A shared glossary MAY be pinned to an exact Git object. (#22)
- Project-local terminology MUST remain independent. (#22)
- Project-local terminology MUST retain normal local-first precedence. (#22)

#### Collision and conflict behavior

Suite `v0.1.0` MUST apply exactly these deterministic conflict checks. (#22)

| Condition | Required behavior |
|---|---|
| duplicate routes to one canonical bundle identity | load the bundle once |
| the same Concept ID in two visible bundles | keep both as separate advisory candidates and emit a diagnostic |
| matching normalized non-empty `resource` values | keep both as separate advisory candidates and emit a diagnostic |
| byte-identical documents in independently owned bundles | keep both as separate advisory candidates and emit a diagnostic |

- Fuzzy similarity MUST NOT be used for conflict detection. (#22)
- Automatic consolidation MUST NOT be performed. (#22)
- An overlapping canonical path under a nested repository MUST be reported as an anomaly. (#27)

#### Write routing inside the current repository

- Creating a concept MUST default to the nearest admitted bundle at or above CWD inside the current repository. (#22)
- An explicit create override MAY name another admitted bundle only inside the current repository. (#22)
- Updating an existing concept MUST route to its owning bundle. (#22)
- Deleting an existing concept MUST route to its owning bundle. (#22)
- Widening read scope MUST NOT redirect a write target. (#22, #27)
- Discovery MUST NOT create a bundle directory. (#27)
- A non-repository workspace-root bundle MUST be read-only. (#22, #37)
- A `generated` bundle MUST be read-only. (#22, #37)
- A `vendored` bundle MUST be read-only. (#22, #37)
- A federated peer MUST be read-only except for the bounded foreign-write operation defined below. (#22, #37) [precedence: #37 over #22]
- A cross-bundle move MUST be an explicit identity-changing migration with link rewriting. (#22)
- A cross-bundle move MUST NOT be treated as an ordinary update. (#22)

#### Cross-repository write authority: scope of the grant

- A cross-repository move MUST name exactly one source repository. (#37)
- A cross-repository move MUST name exactly one target repository. (#37)
- A cross-repository move MUST name exactly one source bundle. (#37)
- A cross-repository move MUST name exactly one target bundle. (#37)
- A cross-repository move MUST name a finite set of source paths and a finite set of target paths. (#37)
- A target path MAY differ from its source path only when that transformation is part of the approved plan. (#37)
- One grant MUST NOT authorize fan-out to several foreign targets. (#37)
- One grant MUST NOT imply unrelated broad rewrites. (#37)
- One grant MUST NOT imply an implicit cross-repository merge or split. (#37)

The grant MUST permit exactly these effects and MUST forbid the rest. (#37)

| Effect | Permitted by the grant |
|---|---|
| target concept creation | yes |
| transformed content updates in the target | yes |
| directly derived target link maintenance | yes |
| directly derived target index maintenance | yes |
| unrelated deletion in the target | no |
| purge in the target | no |
| merge in the target | no |
| split in the target | no |
| broad rewrites in the target | no |

#### Cross-repository write authority: the target-side grant

- The target repository MUST issue explicit consent through an authorized target-owner or administrator workflow. (#37)
- Foreign-write consent MUST bind the exact source repository instance. (#37)
- Foreign-write consent MUST bind the exact target repository instance. (#37)
- Foreign-write consent MUST bind the target bundle identity. (#37)
- Foreign-write consent MUST bind the allowed effects. (#37)
- Foreign-write consent MUST bind an authority generation. (#37)
- Consent MUST be stored as uncommitted target-local state under the target Git common directory. (#37)
- Consent MUST be stored separately from the workspace manifest. (#37)
- Consent MUST be stored separately from the manual-operation guard ledger. (#37)
- Consent MUST remain valid until explicit revocation, identity invalidation, or policy invalidation. (#37)
- Consent MUST NOT carry a time-to-live in `v0.1.0`. (#37)
- An authorized target owner MUST be able to revoke foreign-write consent. (#37)
- A workspace manifest MUST NOT grant foreign-write authority. (#37)
- A filesystem grant MUST NOT grant foreign-write authority. (#37)
- Repository trust MUST NOT grant foreign-write authority. (#37)
- An `.okf-active` marker MUST NOT grant foreign-write authority. (#37)
- A project mode MUST NOT grant foreign-write authority. (#37)
- An approval MUST NOT grant foreign-write authority. (#37)
- A guard ledger MUST NOT grant foreign-write authority. (#37)
- Delegation MUST NOT create or widen foreign-write authority. (#38)
- A delegated cross-repository write MUST require pre-existing exact target-side authority for the named source instance, target bundle, and effects. (#38)
- A delegated cross-repository write with no such authority MUST be blocked and reported as missing foreign-write authority. (#38)

#### Cross-repository write authority: preconditions

- Both affected worktrees MUST have valid `.okf-active` markers. (#37)
- The invoking harness adapter MUST be present. (#37)
- A compatible shared runtime MUST be present. (#37)
- A target native adapter MAY be absent. (#37)
- The target project mode MUST come from target-owned configuration. (#37)
- A missing or unknown target project mode MUST block mutation. (#37)
- A foreign write MUST NOT run as automatic lifecycle work. (#37)
- A foreign write MUST require explicit manual invocation. (#37)
- A foreign write MUST require a complete preview. (#37)
- A foreign write MUST require dedicated approval. (#37)
- A foreign write MUST require fresh execution checks. (#37)
- A foreign write MUST require recovery evidence. (#37)
- Preflight MUST validate both repositories before the first write. (#37)
- Any required path, identity, conformance, link, provenance, mode, or recovery error MUST block the complete operation. (#37)

#### Cross-repository move: execution order

The implementation MUST execute these phases in this order. (#37)

| Phase | Required behavior |
|---|---|
| 1. Preflight | validate both repositories completely; any required error blocks the complete operation |
| 2. Lock | acquire every affected bundle lock in one deterministic canonical order and reread every ledger under lock |
| 3. Publish target | write and validate the target before changing the source |
| 4. Settle source | deprecate source concepts in place by default, with a visible successor notice carrying an explicit workspace link |
| 5. Derived maintenance | update only the parsed inbound links, indexes, and operation logs listed in the operation manifest |
| 6. Journal and release | record outcomes in the append-only observation journal, then release the locks |

- The target MUST be published and validated before the source is changed. (#37)
- If target publication fails, the source MUST remain unchanged. (#37)
- Source concepts MUST be deprecated in place by default. (#37)
- A deprecated source concept MUST receive a visible successor notice with an explicit workspace link. (#37)
- Source deletion MUST be a separately explicit effect. (#37)
- Source deletion MUST remain subject to project-mode deletion rules. (#37)
- Directly affected parsed inbound links, indexes, and operation logs MAY be updated only when the operation manifest lists them. (#37)
- Prose mentions MUST NOT be rewritten automatically. (#37)
- Code mentions MUST NOT be rewritten automatically. (#37)

#### Cross-repository move: target collisions and transformed output

- A target path collision MUST block by default. (#37)
- An existing target MAY change only when the operation names it explicitly with its complete transformation and recovery evidence. (#37)
- A target collision MUST NOT cause an implicit merge. (#37)
- A transformed target output MUST retain only provenance supported by its retained body. (#37)
- A transformed target output MUST start as `draft`. (#37)
- A transformed target output MUST start unverified. (#37)
- Source verification state MUST NOT transfer to the target. (#37)
- Source review state MUST NOT transfer to the target. (#37)

#### Cross-repository move: locks, ledgers, manifest, and journal

- Each affected bundle MUST use its own authoritative guard ledger in its Git common directory. (#37, #31)
- Missing, unreadable, insecure, or unlockable target guard state MUST fail closed. (#37)
- All affected bundle locks MUST be acquired in one deterministic canonical order. (#37)
- The operation MUST reread every affected ledger under lock. (#37)
- The locks MUST be held through fresh validation, mutation, journaling, and settlement. (#37)
- One sealed operation manifest MUST cover the complete move. (#37)
- One append-only observation journal MUST cover the complete move. (#37)
- The operation manifest and observation journal MUST live in a durable operation store outside both mutation targets. (#37)
- The operation manifest and observation journal MUST live outside all affected guard ledgers. (#37)

#### Cross-repository move: approval

- Approval MUST cover the complete operation. (#37)
- Approval MUST include an approval record for each affected repository. (#37)
- Each approval record MUST bind repository identity and revisions. (#37)
- Each approval record MUST bind the resulting content identity. (#37)
- Each approval record MUST bind the operation hash and the policy hash. (#37)
- Each approval record MUST bind the grant generation. (#37)
- Each approval record MUST bind the required checks. (#37)
- Each approval record MUST bind the recovery evidence. (#37)
- Any relevant change MUST expire the approval. (#37)
- Ordinary approval of a source pull request MUST NOT substitute for dedicated cross-repository approval. (#37)
- A pull-request review MAY supply checks or evidence for a cross-repository approval. (#37)
- Each affected repository MUST have an authorized human or a configured verifier. (#37)
- Commit authorship MUST NOT satisfy approval. (#37)
- Local Git identity MUST NOT satisfy approval. (#37)
- Filesystem access MUST NOT satisfy approval. (#37)
- Repository trust MUST NOT satisfy approval. (#37)
- Model self-approval MUST NOT satisfy approval. (#37)

#### Cross-repository move: recovery and terminal classification

- Recovery evidence MUST cover both repositories. (#37)
- Recovery evidence MUST cover relevant untracked files. (#37)
- Recovery evidence MUST include independent snapshots. (#37)
- Recovery evidence MUST include verified disposable restores. (#37)
- Recovery evidence MUST include content identity checks. (#37)
- Recovery evidence MUST include applicable conformance and operation checks. (#37)
- Recovery evidence MUST include rollback instructions. (#37)
- Recovery evidence MUST include post-operation validation. (#37)
- The implementation MUST NOT claim cross-repository atomic commit. (#37)
- A proven partial result MUST be classified `partially-applied`. (#37)
- An unknown result MUST be classified `indeterminate`. (#37)
- A `partially-applied` result MUST block further mutation on the affected bundles until explicit reconciliation. (#37)
- An `indeterminate` result MUST block further mutation on the affected bundles until explicit reconciliation. (#37)
- Rollback MUST be a new operation with a fresh request, preview, approval, and recovery gate. (#37)
- Repair MUST be a new operation with a fresh request, preview, approval, and recovery gate. (#37)
- Deterministic `v0.1.0` fixtures MUST cover a valid transformed move, source deprecation and successor notice, provenance reset, link and index maintenance, missing or revoked consent, wrong identity, missing markers, unknown mode, target collision, an inaccessible target ledger, stale content, a stale grant, a stale approval, lock contention, target-first failure, source-after-target failure, unknown crash state, recovery, and reconciliation. (#37)
- Live cross-harness process tests MUST be deferred to `v0.2.0`. (#37)

#### Caching: the transparency rule

- Discovery caching MUST be cache-transparent: with the same current observable state, a warm resolution and a cold resolution MUST produce the same admission and discovery result. (#32, #36)
- Cache state MAY change latency, CPU use, and observed execution work. (#32)
- Cache state MUST NOT supply authority. (#32)
- Cache state MUST NOT preserve an admission. (#32)
- Cache state MUST NOT widen scope. (#32)
- Cache state MUST NOT preserve model memory, admission, scope, or write permission. (#32, #36)

#### Caching: what persists

- Persistent caching MUST be limited to syntax-level pure derivations whose output is determined by exact source bytes and a parser contract. (#32)
- The initial `v0.1.0` syntax cache MAY hold parsed frontmatter or parsed manifest syntax. (#32)

The persistent key settled by #32 is exactly:

```text
cache-format/parser version + artifact kind + cryptographic digest of exact source bytes
```

- The persistent cache MUST live in the suite-owned per-user OS cache directory, outside repositories and outside OKF bundles. (#32)
- On Linux the persistent cache MUST follow the XDG user-cache convention. (#32)
- On macOS the persistent cache MUST use the platform user-cache equivalent. (#32)
- The persistent cache MUST NOT live inside a bundle cache directory, repository state, harness session state, or the manual-operation guard store. (#32)
- The persistent cache MAY be shared by harness adapters. (#32)

#### Caching: what is never cached

The implementation MUST NOT persist any of these across resolutions. (#32, #36)

| Never cached |
|---|
| admission verdicts |
| authority |
| filesystem observations |
| directory walks |
| monorepo member lists |
| presence or absence |
| repository identity lookups |
| canonical paths |
| semantic interpretation |
| OKF conformance results |
| candidate sets |
| write targets |
| retrieval results |
| cursors |
| scopes |
| validation-result state |

- Repository identity, Git HEAD, the trust set, symlink policy, the active harness and its grants, resolved canonical targets, manifest mtime, and CWD MUST NOT enter the persistent cache key. (#32)
- Semantic validation MUST remain outside the cached pure function. (#32)

#### Caching: what every explicit resolution recomputes

- Each explicit resolution MUST take canonical CWD as a required input. (#32)
- Each explicit resolution MUST discover candidate scope from the current authority inputs. (#32)
- Each explicit resolution MUST observe current presence, repository identity, monorepo membership, and filesystem state. (#32)
- Each explicit resolution MUST resolve each candidate's current canonical symlink target. (#32)
- Each explicit resolution MUST rerun `REACH -> PRESENCE -> {TRUST, ACCESS}` against the current trust set, symlink policy, active harness, and grants. (#32)
- Each explicit resolution MUST rerun semantic validation. (#32)
- Each explicit resolution MUST recompute write-target selection. (#32)
- Complete-result memoization inside one resolution transaction MUST be scoped to that exact canonical CWD and immutable authority snapshot. (#32)
- Complete-result memoization MUST NOT survive its resolution transaction. (#32)
- A native read MUST start fresh and MUST recheck the marker, current routing, admission, and current files. (#36)
- A native read MUST use no retrieval-result, cursor, scope, or validation-result cache. (#36)

#### Caching: integrity, failure, and refresh

- Cache entries MUST be immutable. (#32)
- Cache entries MUST be atomically published. (#32)
- An exact-byte change, an artifact-kind change, or a parser/cache-format upgrade MUST select a new key or namespace rather than mutate an existing entry. (#32)
- Concurrent writers of the same key MUST be treated as benign, and a losing writer MUST discard its temporary output. (#32)
- A reader MUST verify the entry envelope, key, digest, schema, and supported cache version. (#32)
- A missing, unreadable, malformed, digest-mismatched, or newer-version entry MUST be treated as a cache miss. (#32)
- A cache miss MUST read the authoritative source and derive afresh. (#32)
- A newer-version namespace MUST NOT be consumed, overwritten, or deleted. (#32)
- A cache write failure MUST return the freshly derived result without caching it. (#32)
- Cache failure alone MUST NOT admit a bundle. (#32)
- Cache failure alone MUST NOT reject a bundle. (#32)
- Old unreachable cache entries MAY be removed without any correctness effect. (#32)
- The suite MUST NOT add a TTL or a correctness-sensitive garbage collector in `v0.1.0`. (#32)
- A `DECLARED_MISSING -> available` transition MUST be detected on the next explicit resolution. (#32)
- The suite MUST NOT use a watcher, polling loop, or background refresh to detect that transition. (#32)
- An explicit resolution MUST mean any lifecycle entry point that requires a discovery snapshot, not only a user-issued refresh command. (#32)

#### Rejected proposals

- Implementers MUST NOT apply CUE-style merge or subsumption semantics between bundles. (#20, #22) [precedence: #22 over #20]
- Implementers MUST NOT use merge, shadow, or synthetic cross-bundle ownership routing. (#20, #22) [precedence: #22 over #20]
- Implementers MUST NOT treat token figures, cache estimates, lazy-loading thresholds, or budget proposals as policy. (#20, #36) [precedence: #36 over #20]
- Implementers MUST NOT implement budgets, reserves, tiers, tokenizers, cost models, ranking, retrieval receipts, or retrieval ledgers in the discovery, admission, or caching path. (#32, #36) [precedence: #36 over #32]
- Implementers MUST NOT add network discovery. (#22)
- Implementers MUST NOT add implicit repair of a candidate, a manifest, or a bundle. (#22)
- Implementers MUST NOT add semantic merging of concepts. (#22)

### 4. Concept navigation and reading

#### Navigation model

- `v0.1.0` MUST use LLM-guided native navigation. (#36)
- The agent MUST use harness-native file and search tools to read current OKF content. (#36)
- The model MUST choose the navigation steps. (#36)
- The model MUST interpret the tool results. (#36)
- The agent MUST NOT treat model memory as bundle content. (#36)
- The suite MUST supply portable scope, admission, enumeration, search, read, and scope-enforcement rules. (#36)
- The suite MUST NOT supply a custom retrieval backend, matcher, ranking service, tokenizer, embedding store, retrieval cache, cost model, or ledger. (#36)
- The harness adapter MUST supply the native tool mappings. (#36)
- The harness adapter MUST NOT redefine shared authority, trust, admission, or mutation rules. (#36)
- Exact native tool names MUST remain harness-specific. (#36)
- Exact native tool names MUST NOT become shared policy. (#36)
- Concept discovery MUST locate candidate concepts only inside bundles that bundle admission already admitted. (#36)

#### Preconditions before any concept navigation

- The harness MUST check the `.okf-active` activation marker before automatic behavior. (#35)
- Automatic behavior MUST be a silent no-op when the marker is absent. (#35, #36)
- An explicit read MUST report `not-configured` when the marker is absent. (#35, #36)
- A malformed marker MUST produce a diagnostic, inactive behavior, and blocked mutation. (#35)
- Bundle admission MUST run before concept navigation. (#36)
- Bundle admission MUST run in the fixed order `REACH -> PRESENCE -> {TRUST, ACCESS}`. (#36)
- Native tools MUST read only admitted and routed bundles. (#36)
- Concept discovery MUST NOT widen bundle admission. (#22, #36)
- Concept discovery MUST NOT grant trust, access, write ownership, approval, or permission. (#22)
- An explicit read MUST start fresh. (#36)
- An explicit read MUST recheck the activation marker, current routing, bundle admission, and the current files. (#36)
- An explicit read MUST NOT use a retrieval result, cursor, retrieval scope, or validation-result cache. (#36)
- A read MUST assume that nothing returned by an earlier read remains available. (#36)

#### Exact-reference reads

- An exact read MUST accept a bundle-relative Concept ID as a target form. (#36)
- An exact read MUST accept an `okf-workspace://<bundle-alias>/<concept-id>` target form. (#36)
- A Concept ID MUST be the bundle-relative file path without the `.md` suffix. (#22)
- The fully qualified concept key MUST be bundle identity plus Concept ID. (#22)
- An exact read MUST apply the identity and precedence rules of concept routing. (#22, #36)
- An unqualified exact read MUST resolve in this order: explicit target, nearest admitted bundle, current-repository ancestors nearest-first, then explicitly federated bundles in manifest order. (#22)
- A selected exact result MUST disclose the lower-precedence matches. (#22)
- An exact target MUST NOT fall back to a similar name. (#36)
- An exact target MUST NOT fall back to broad search. (#36)
- An exact target that does not resolve MUST be reported with the `missing` finding. (#36)
- An unresolved exact target MUST NOT be substituted by another concept. (#22, #36)
- An exact read MUST be permitted even where the release cannot claim a calibrated support ceiling. (#36)
- A standard Markdown link MUST resolve only inside its source bundle. (#22)
- A standard Markdown link MUST NOT fall through to another bundle. (#22)
- An authored cross-bundle link MUST use the `okf-workspace://<bundle-alias>/<concept-id>` form. (#22)
- The active workspace manifest MUST be the only resolver for `okf-workspace://` targets. (#22)
- A missing or inactive alias MUST remain broken and MUST be reported with a diagnostic. (#22)
- A link MUST NOT widen discovery, trust, access, or write authority. (#22)
- Link resolution MUST be decided only by whether the target file exists. (#14)
- Concept status MUST NOT be an input to link resolution. (#14)

#### Broad navigation across admitted bundles

- Broad navigation MUST examine every admitted bundle. (#36)
- Broad navigation MUST NOT merge concepts across bundles. (#36)
- Every concept MUST retain exactly one owning bundle. (#22)
- Matching paths, resources, or content across bundles MUST produce diagnostics rather than a synthetic document or an ownership change. (#22)
- Broad search MUST use routing order only as a deterministic tie-breaker. (#22)
- Broad search MUST NOT discard a relevant result because of routing precedence. (#22)
- Broad navigation MUST use the progressive channels in the order exact path, indexes and paths, frontmatter, then body search. (#36)
- Broad navigation MUST use body search when the request requires body evidence. (#36)
- Broad navigation MUST use body search when the indexes do not resolve the request. (#36)
- Broad navigation MUST report coverage as `non-exhaustive` when a required federated member is inactive. (#22, #36)
- An optional inactive federated member MUST NOT by itself make coverage `non-exhaustive`. (#22)

##### Navigation channels

| Channel | Used when | Reveals |
| --- | --- | --- |
| Exact path | The request names a Concept ID, a path, or an `okf-workspace://` target (#36) | The named concept file (#36) |
| Indexes and paths | The request is not an exact target, and index navigation can resolve it (#36) | Path segments and Concept IDs (#36) |
| Frontmatter | The request needs authored frontmatter evidence such as `tags`, `type`, or `status` (#36) | The concept's authored frontmatter (#28) |
| Body search | The request requires body content, or the indexes do not resolve it (#36) | Body words that the indexes and frontmatter do not carry (#28) |

- An index MUST NOT be treated as evidence of a concept's `tags`, `type`, or `status`. (#36)
- Frontmatter evidence MUST be read from the concept's frontmatter. (#28, #36)

#### The normal index path

- The normal index path MUST be bundle-root `index.md`, then the relevant directory index, then the concept body. (#36)
- A read MUST report an index that is missing. (#36)
- A read MUST report an index that is stale. (#36)
- A read MUST report an index that is unreadable. (#36)
- A read MUST NOT repair an index. (#36)
- A read MUST NOT rewrite, regenerate, or reorder an index. (#36)
- Native search MUST be used inside admitted scope when an index is missing, stale, unreadable, or insufficient. (#36)
- Native search MUST be used inside admitted scope when the request requires body content. (#36)
- A no-match claim reached through the index channel MUST be limited to that channel. (#36)

#### Native search and the scope guard

- Native paths MUST be validated against the current admitted realpath envelope. (#36)
- Realpath containment MUST be recomputed on every resolution. (#22)
- Every symlink target MUST remain within the active workspace root. (#22)
- `v0.1.0` MUST NOT ship an external symlink allowlist. (#22)
- A path escape MUST be treated as a safety-contract violation. (#36)
- A verified safety-contract violation MUST be reported with the `invalid` finding. (#36)
- An adapter that cannot enforce or observe the scope boundary MUST report degraded or unavailable behavior. (#36)
- An adapter that cannot enforce or observe the scope boundary MUST NOT claim complete scope. (#36)
- The path guard MUST NOT be implemented as a retrieval backend. (#36)

#### Query handling

- Exact paths, identifiers, digits, and quoted phrases MUST remain navigation guidance for the model. (#36)
- The suite MUST NOT define shared query normalization. (#13, #36) [precedence: #36 over #13]
- The suite MUST NOT define stemming, aliases, synonyms, stopword deletion, a minimum term length, or a ranking rule. (#13, #36) [precedence: #36 over #13]
- A query that shares no token with a concept's title, description, or body MAY fail to reach that concept, and this gap is accepted for `v0.1.0`. (#13, #21)

#### Reading a concept and evidence discipline

- The agent MUST answer only from observed evidence. (#36)
- Observed paths MUST remain separate from authored `sources[]` provenance. (#36)
- A read path MUST NOT automatically become a provenance source. (#36)
- Authored provenance MUST be reported only when it was read from `sources[]`. (#36)
- A complete concept claim MUST require a verified end of file. (#36)
- A body whose end of file is unknown MUST be reported with the `unobservable` finding. (#36)
- A result whose body end of file is unknown MUST be `degraded`. (#36)
- Readable bytes with malformed frontmatter MUST be returned with a parse finding. (#36)
- Concept status MUST NOT be inferred from a malformed or unread file. (#36)
- A file with malformed frontmatter MUST NOT be repaired during a read. (#36)
- A final answer MUST name the observed concept paths. (#36)
- Observed concept paths MUST be named as bundle-relative paths. (#36)

#### Result and answer contract

The fixed navigation vocabulary is:

| Dimension | Fixed labels | Meaning constraint |
| --- | --- | --- |
| result | `ok`, `degraded`, `not-configured`, `unavailable` | `not-configured` covers an absent activation marker on an explicit read (#35, #36) |
| match | `found`, `no match in searched scope` | A complete no-match claim is limited to the declared scope and search channel (#36) |
| findings | `missing`, `unreadable`, `unobservable`, `invalid` | `invalid` is reserved for a verified native-tool or safety-contract violation (#36) |
| coverage | complete for a named scope and channel, or `non-exhaustive` | Completeness is claimed only for a named scope and channel (#36) |

- A navigation result MUST use only the fixed result labels. (#36)
- A navigation match MUST use only the fixed match labels. (#36)
- A navigation finding MUST use only the fixed finding labels. (#36)
- Coverage MUST be reported as complete for a named scope and channel, or as `non-exhaustive`. (#36)
- `invalid` MUST be reserved for a verified native-tool or safety-contract violation. (#36)
- The budget-specific `insufficient` result MUST NOT exist. (#13, #36) [precedence: #36 over #13]
- The budget-specific meaning of `invalid` MUST NOT exist. (#13, #33, #36) [precedence: #36 over #13, #33]
- A complete no-match claim MUST be limited to its declared scope and search channel. (#36)
- A final answer MUST use the compact Markdown labels `Status`, `Match`, `Scope`, `Found`, `Read`, and `Coverage`. (#36)
- A final answer MUST use the compact Markdown label `Next` when a next action is needed. (#36)

#### Permitted cache

- The suite MAY retain an immutable, content-addressed syntax-parse cache. (#36)
- The suite MUST NOT retain any other retrieval or discovery cache. (#32, #36) [precedence: #36 over #32]
- The syntax-parse cache MUST NOT preserve authority. (#36)
- The syntax-parse cache MUST NOT widen scope. (#36)
- The syntax-parse cache MUST NOT replace current admission. (#36)
- The syntax-parse cache MUST NOT replace current validation. (#36)
- Admission and applicable validation MUST be recomputed for each resolution. (#36)

#### Deprecated-concept exclusion

- Deprecated concepts MUST remain in indexes. (#14)
- Deprecated concepts MUST be retained indefinitely by default. (#14)
- An index MAY label a concept deprecated only after observing its status. (#14)
- Ordinary navigation MUST exclude a concept whose observed status is `deprecated`. (#36)
- An exact path read MAY include a deprecated concept with a warning. (#14)
- A concept-identity read MAY include a deprecated concept with a warning. (#14)
- An explicit request to include deprecated concepts MAY include them with a warning. (#36)
- The word `deprecated` in a query alone MUST NOT opt into deprecated concepts. (#36)
- A result produced without observing status MUST be degraded. (#14)
- A result produced without observing status MUST be unfiltered. (#14)
- An unobserved status MUST be disclosed as an unevaluated archive predicate. (#14)
- An unobserved status MUST NOT be reported as an applied exclusion. (#14)
- An unobserved status MUST NOT be reported with the retired omission codes `FILTERED`, `UNSEARCHED`, `UNDISCOVERED`, or `UNRESOLVED`. (#14, #36) [precedence: #36 over #14]
- Deprecated status MUST NOT affect link resolution. (#14)
- A successor notice MUST be treated as ordinary Markdown navigation. (#14)
- A successor notice MUST NOT be parsed as a machine-readable relationship. (#14)
- Navigation MUST NOT read `superseded_by`, `deprecation_reason`, or `retain_until` fields, because `v0.1.0` does not define them. (#14)

##### Deprecated-concept inclusion matrix

| Request form | Observed status | Behavior |
| --- | --- | --- |
| Ordinary navigation | `deprecated` observed | Exclude the concept (#36) |
| Ordinary navigation | status not observed | Return an unfiltered, degraded result and disclose the unevaluated archive predicate (#14) |
| Exact path or concept-identity read | `deprecated` observed | Include the concept with a warning (#14) |
| Explicit request to include deprecated concepts | `deprecated` observed | Include the concept with a warning (#36) |
| Query containing the word `deprecated` only | `deprecated` observed | Treat as ordinary navigation and exclude the concept (#36) |
| Inbound link resolution | any | Resolve if and only if the target file exists (#14) |

#### Support ceiling

| Dimension | Inclusive ceiling | What it counts |
| --- | --- | --- |
| Source files | 500 | Indexes and every source file the read contract may inspect (#36) |
| Aggregate exact source bytes | 100 MB | Exact source bytes, excluding `.git`, suite caches, and external provenance targets (#36) |
| Bundle-relative directory depth | 6 | Directories below the bundle root; a root file is depth 0 and a file in `a/b/` is depth 2 (#36) |

- The support ceiling MUST be treated as an inclusive claim boundary. (#36)
- The support ceiling MUST NOT be treated as a hard read limit. (#36)
- Reads MAY continue above the ceiling. (#36)
- Outside the ceiling, the suite MUST NOT claim completeness. (#36)
- Outside the ceiling, the suite MUST NOT claim calibrated behavior. (#36)
- The stated ceiling values MUST be treated as provisional. (#36)
- A release MUST NOT claim calibrated support-ceiling behavior without the required deterministic fixture evidence. (#36)
- Missing fixture evidence MUST NOT block implementation. (#36)
- Missing fixture evidence MUST NOT block unrelated exact reads. (#36)
- Deterministic fixtures MUST cover exact targets, admission scope, index fallback, federation gaps, deprecated concepts, malformed frontmatter, EOF uncertainty, support-ceiling disclosure, result vocabulary, provenance separation, and adapter scope guards. (#36)
- Live cross-harness process tests MUST remain deferred to `v0.2.0`. (#36)

#### Orientation reading and emission

- A supported session-entry seam MUST emit at most one fixed-schema, bounded, read-only orientation result per orientation occurrence. (#35)
- Orientation MUST emit activation, current bundle identity, root index path, aggregate workspace health, and one next action. (#36)
- Orientation MUST NOT emit a full index. (#36)
- Orientation MUST NOT emit a concept body. (#36)
- Orientation MUST NOT infer task intent. (#36)
- Orientation MUST NOT perform task-specific retrieval. (#36)
- Orientation MUST NOT perform lifecycle maintenance, initialize state, or mutate OKF content. (#35)
- Orientation MUST NOT estimate or report a retrieval token budget. (#36)
- Orientation boundedness MUST be established by the fixed emitted content, not by a token estimate. (#36)
- Each forked or delegated child context MUST receive a fresh orientation. (#39)
- A child context MUST NOT inherit the parent orientation result. (#39)
- A child orientation MUST recheck activation, scope, routing, and bundle admission. (#39)
- A non-clean orientation result MUST NOT claim clean evidence. (#39)
- A non-clean orientation result MUST NOT permit mutation. (#39)

#### Normative negative list — not shipped in `v0.1.0`

- The suite MUST NOT ship a custom retrieval backend. (#36)
- The suite MUST NOT ship an in-skill matcher. (#36)
- The suite MUST NOT ship a ranking service. (#36)
- The suite MUST NOT ship an embedding store. (#36)
- The suite MUST NOT ship a tokenizer. (#36)
- The suite MUST NOT ship a cost model. (#36)
- The suite MUST NOT ship a retrieval budget. (#36)
- The suite MUST NOT ship an operation context allowance. (#36)
- The suite MUST NOT ship a context reserve or reserve allocator. (#36)
- The suite MUST NOT ship a tier allocator. (#36)
- The suite MUST NOT ship the `LINE`, `CARD`, `SECTION`, or `FULL` allocation tiers. (#13, #28, #36) [precedence: #36 over #13, #28]
- The suite MUST NOT ship budget-based progressive allocation using `(concept, tier)` pairs. (#36)
- The suite MUST NOT ship retrieval receipts. (#36)
- The suite MUST NOT ship retrieval ledgers, a context ledger, or a discovery-work ledger. (#36)
- The suite MUST NOT ship budget-aware task profiles, reserve profiles, work profiles, fallback allowances, or calibrated budget defaults. (#36)
- The suite MUST NOT ship budget provenance values such as `explicit`, `estimated`, or `unknown`. (#36)
- The suite MUST NOT ship an honest retrieval floor or a budget refusal. (#36)
- The suite MUST NOT ship exact-demand degradation down an allocation ladder. (#36)
- The suite MUST NOT ship satisficing or exhaustive discovery-breadth modes selected by budget. (#36)
- The suite MUST NOT ship ranking weights, score thresholds, confidence thresholds, margin thresholds, or query-clause informativeness thresholds. (#36)
- The suite MUST NOT ship a character-per-token divisor or any conservative token bound. (#36)
- The suite MUST NOT ship tokenizer calibration or a tokenizer profile registry. (#36)
- The suite MUST NOT ship omission codes such as `CLIPPED`, `MISS`, `UNDISCOVERED`, `UNSEARCHED`, or `FILTERED` as budget-retrieval outputs. (#36)
- The suite MUST NOT ship an `insufficient` result meaning. (#36)
- The suite MUST NOT ship a budget-specific `invalid` result meaning. (#36)
- The suite MUST NOT ship cross-call retrieval state, cursors, retrieval scopes, or retrieval-result memory. (#36)
- The suite MUST NOT ship a retrieval-discovery accounting cache. (#36)
- The suite MUST NOT ship a retrieval result cache or its invalidation semantics. (#32, #36) [precedence: #36 over #32]
- The suite MUST NOT ship a prototype retrieval runtime interface. (#33, #36) [precedence: #36 over #33]
- The suite MUST NOT ship semantic or vector retrieval. (#13, #28, #33, #36)
- The suite MUST NOT ship implicit stemming. (#13)
- The suite MUST NOT ship generated synonyms. (#13)
- The suite MUST NOT ship stopword deletion. (#13)
- The suite MUST NOT ship a global minimum query-term length. (#13)
- The suite MUST NOT ship query aliases or discoverability aliases. (#13, #21)
- The suite MUST NOT ship an `importance` or `priority` field for concepts. (#13, #28)
- The suite MUST NOT ship product-specific concept frontmatter or semantic sidecars for navigation. (#21)
- The suite MUST NOT ship automatic index repair during reads. (#36)
- The suite MUST NOT ship automatic deprecated-concept removal from indexes. (#14)
- The suite MUST NOT ship redirects, stubs, or tombstones for relocated concepts. (#14)
- The suite MUST NOT ship fuzzy similarity matching or automatic consolidation of matching concepts. (#22)
- The suite MUST NOT ship an external symlink allowlist. (#22)
- The suite MUST NOT ship live cross-harness process tests in `v0.1.0`. (#36)

#### Declined and recorded

- Budget-aware retrieval runtime — declined; origin `#13`. (#36)
- Operation context allowance and retrieval reserve — declined; origin `#13`. (#36)
- Context ledger and discovery-work ledger — declined; origin `#13`. (#36)
- Budget provenance and calibrated budget fallback — declined; origin `#13`. (#36)
- Honest retrieval floor and budget refusal — declined; origin `#13`. (#36)
- Budgeted `(concept, tier)` allocation — declined; origins `#13` and `#28`. (#36)
- Deterministic ranking and tier-selection runtime — declined; origin `#13`. (#36)
- Budget-priced discovery channels — declined; origin `#28`. (#36)
- Budget-priced probe and notice accounting — declined; origins `#28` and `#33`. (#36)
- Retrieval omission accounting and omission receipts — declined; origins `#13`, `#28`, and `#33`. (#36)
- Retrieval result cache and its invalidation semantics — declined; origin `#32`; only the separate syntax-parse cache survives. (#36)
- Prototype retrieval runtime interface — declined; origin `#33`. (#36)
- Exact-demand degradation and budget refusal — declined; origins `#13`, `#28`, and `#33`. (#36)
- Budget-specific `ok`, `degraded`, `insufficient`, and `invalid` semantics — declined; origins `#13` and `#33`. (#36)
- Tokenizer ownership, conservative token bounds, and tokenizer calibration — declined; origins `#13`, `#28`, and `#33`. (#36)
- Task profiles, reserve fractions, ranking weights, stop thresholds, notice caps, and numeric retrieval defaults — declined; origins `#13`, `#28`, and `#33`. (#36)
- Semantic retrieval — declined; origins `#13`, `#28`, and `#33`. (#36)
- Discoverability alias expansion — declined; origins `#13`, `#21`, and `#33`. (#36)
- Producer-authored `importance` or `priority` fields — declined; origins `#13` and `#28`. (#36)
- Shared query normalization, including NFC folding, case folding, and identifier subterm expansion — declined; origin `#13`. (#36)

### 5. Operation risk, approval, the manual-operation guard, and recovery

> Decision #43: this section is retained design for a later guarded release and is not a `v0.1.0` obligation.

#### Outcome vocabulary and composition

- A command MUST expand into atomic effects before authorization is decided (#11).
- A composite operation MUST receive the strictest outcome of its atomic effects (#11).
- The outcome ordering MUST be `blocked > preview/approval > notice > allowed` (#11).
- A friendly command name MUST NOT conceal deletion, identity changes, or graph rewrites (#11).
- `archive`, `merge`, `split`, `sync`, `migration`, and `compaction` MUST each expand into a complete effect plan (#11).
- The runtime MUST implement this outcome contract (#11):

| Outcome | Meaning |
|---|---|
| `allowed` | Execute without special interaction and return ordinary results. |
| `notice` | Execute without prior approval, then report the operation, affected concepts, evidence, status and trust effects, validation, and recovery result. |
| `preview/approval` | Require an occurrence-bound explicit request, a complete content-bound preview, single-use approval, fresh execution checks, and a completion notice. |
| `blocked` | Do not mutate. Approval cannot override the result. Read-only explanation remains permitted. |

- Approval MUST NOT override a `blocked` outcome (#11).
- A `blocked` outcome MUST still permit read-only explanation (#11).

#### Atomic effect risk matrix

- The runtime MUST decide each atomic effect from this matrix (#11).
- In the matrix, `A` means allowed, `N` means notice, `P` means preview and approval, `R` means verified recovery required, and `B` means blocked (#11).
- The `U`, `M`, and `H` columns are the target concept's pre-operation trust tier: unverified, machine-confirmed, and human-reviewed (#11).
- Creation has no input tier and MUST always create an unverified `draft` concept (#11).

| Atomic effect | Code-backed U | Code-backed M | Code-backed H | Knowledge-only U | Knowledge-only M | Knowledge-only H |
|---|---|---|---|---|---|---|
| Read, validate, or read-only analysis | A | A | A | A | A | A |
| Create a small evidence-backed concept | N | N | N | N | N | N |
| Small evidence-backed claim update | N | N | N | N | N | N |
| Small non-claim metadata or formatting update | N | N | N | N | N | N |
| Add qualifying machine verification | N | N | N | N | N | N |
| Add machine verification without complete qualifying evidence | B | B | B | B | B | B |
| Record exact human verification | P | P | P | P | P | P |
| Infer or fabricate human verification | B | B | B | B | B | B |
| Standalone removal of verification | A | P | P | A | P | P |
| Derive or display current staleness | A | A | A | A | A | A |
| Set `stale_after` from explicit evidence | N | N | N | N | N | N |
| Choose or change `stale_after` by judgment | P | P | P | P | P | P |
| `draft -> stable` | P | P | P | P | P | P |
| `stable -> deprecated` | P | P | P | P | P | P |
| `deprecated -> stable` | P | P | P | P | P | P |
| Write an unsupported status value | B | B | B | B | B | B |
| Add or remove one semantic relationship | N | N | N | N | N | N |
| Move or rename | P+R | P+R | P+R | P+R | P+R | P+R |
| Broad inbound-link or graph rewrite | P+R | P+R | P+R | P+R | P+R | P+R |
| Create merge or split outputs | P+R | P+R | P+R | P+R | P+R | P+R |
| Delete a demonstrably redundant concept | Conditional P+R | Conditional P+R | Conditional P+R | B | B | B |
| Purge unique durable knowledge | B | B | B | B | B | B |
| Introduce redirects or aliases | B | B | B | B | B | B |
| Edit a sanctioned Attested Computation | B | B | B | B | B | B |

- Code-backed deletion MUST be allowed only when the dry-run preview proves that the concept is superseded or redundant, proves that it holds no unique durable context, and recovery checks pass (#11).
- Knowledge-only deletion MUST be blocked (#11).
- Purging unique durable knowledge MUST be blocked in both project modes (#11).
- Introducing a redirect or alias MUST be blocked as a decided outcome rather than as a pending one, and a redirect-publish effect MUST be unconstructible as a plan type (#11, #24).
- An agent MUST supply only declared parameter values to an Attested Computation and MUST NOT author or edit the sanctioned computation (#11).

#### Matrix modifiers and derived effects

- Directly affected index regeneration, log append, and mechanical link repair MUST inherit the parent operation's outcome and MUST NOT require separate approval (#11).
- A standalone broad rebuild MUST receive the broad-operation modifier (#11).
- An operation MUST be classified broad when it semantically changes multiple concepts, uses an open-ended selector, crosses bundles, or causes cascading graph rewrites (#11).
- One concept plus mechanically derived index, log, and direct link maintenance MUST be classified small (#11).
- An operation MUST be classified destructive when it deletes or overwrites source content, independently removes verification, rewrites history, or causes a non-file side effect that file restoration cannot reverse (#11).
- A path move and a graph restructuring MUST be classified identity-affecting and MUST use the recovery gate (#11).
- Multi-concept work MUST NOT compute an aggregate or inherited trust tier (#11).
- Each existing concept in a multi-concept operation MUST be evaluated from its own pre-operation state (#11).
- The runtime MUST evaluate authorization in this exact order (#11):

1. Parse the per-bundle project mode and the current concept state.
2. Expand the workflow into atomic effects.
3. Enforce direct OKF specification requirements and prohibitions.
4. Check evidence and verifier-identity prerequisites.
5. Look up each effect in the base matrix.
6. Compose the strictest outcome.
7. Apply the automatic or manual invocation ceiling.
8. Apply the broad, destructive, identity, and external-effect modifiers.
9. Enforce the preview, approval, and recovery gates.
10. Accept a qualifying pull request as the approval channel when applicable.
11. Recheck content, scope, evidence, approval, and recovery immediately before execution.
12. Execute atomically, validate, log when applicable, and report the notice or the failure and rollback status.

#### Project mode and the automatic-execution ceiling

- Read and validation MUST behave identically in both project modes (#11).
- Project mode MUST be evaluated per affected bundle (#11).
- A mixed-bundle operation MUST compose project modes strictly (#11).
- An unknown project mode MUST permit read, validation, and analysis, and MUST block mutation (#11).
- Repository presence alone MUST NOT determine project mode (#11).
- In a knowledge-only project, a mutation MUST have documentary evidence or a direct human statement (#11).
- Automatic execution MAY read, validate, create a small evidence-backed draft concept, make a small evidence-backed update, add independently reproducible machine verification, maintain directly affected indexes, and append an existing or policy-required log (#11).
- Automatic execution MUST NOT record human verification, independently remove verification, change status, move or rename, perform broad link rewrites, archive, merge, split, synchronize, migrate, compact, delete, purge, or edit a sanctioned computation (#11).
- `init`, large or full synchronization, migration, and compaction MUST be manual-only (#11).
- Manual-only MUST mean that explicit invocation is necessary but not sufficient, and the matrix, preview, approval, and recovery gates MUST still apply (#11).
- `init` MUST require preview and approval, MUST initialize an admitted bundle only through its guarded manual flow, and MUST NOT manage harness hooks, permissions, agents, instruction blocks, workspace manifests, or adapter configuration (#11, #35) [precedence: #35 over #11].
- Full synchronization, migration, compaction, identity-affecting archive, and restore MUST require preview and approval plus recovery evidence (#11).
- Migration MUST use write-new-then-swap and MUST NOT mutate in place (#11).
- A restore MUST first snapshot the current state (#11).

#### Trust tiers

- A trust tier MUST be treated as advisory evidence only (#11).
- A trust tier MUST NOT grant authority, approval, access, or permission (#11).
- A trust promotion MUST NOT authorize a later operation (#11).
- A trust tier MUST be recomputed from verification events and MUST NOT be written or directly promoted (#11).
- An agent-created or synthesized concept MUST start with `status: draft` and no `verified` (#11).
- The absent-status default MUST NOT be used to publish generated content as stable (#11).
- A deterministic or independently reproducible check MAY add a non-human verification event only when its declared coverage includes the complete current concept (#11).
- A partial check MUST remain a validation result and MUST NOT promote a trust tier (#11).
- A human verification event MUST be recorded only after explicit confirmation of the exact current concept against its sources or resource (#11).
- The verifier identity MUST come from an authenticated review provider or a project-configured verifier ID (#11).
- Commit authorship, local Git configuration, merge status, and an arbitrary actor string MUST NOT be accepted as a verifier identity (#11).
- A claim-affecting edit MUST clear `verified` from the resulting concept and MUST report the invalidation (#11).
- That invalidation MUST be part of the edit and MUST NOT be treated as a standalone revocation (#11).
- A standalone removal of verification from unchanged content MUST require preview and approval (#11).
- The non-claim allowlist MUST be closed and MUST contain exactly: formatting with parsed semantics unchanged; lifecycle updates to `status` and `stale_after`; `generated` and `verified` event maintenance governed by their own rules; byte-identical path moves; manifest-bound link-target substitution to the same moved target; and index and log maintenance (#11).
- A change to the body, `type`, `title`, `description`, `resource`, `tags`, `sources`, an unregistered extension field, or synthesis output MUST be treated as claim-affecting (#11).
- An unchanged concept in a multi-concept operation MUST retain its verification (#11).
- A synthesized output MUST be `draft` and unverified (#11).
- A byte-identical restoration MUST preserve the snapshot's verification state (#11).
- Computing `today >= stale_after` MUST be allowed (#11).
- Adding an explicit `status: stable` where `status` is absent is unnecessary because the specification already defines the default (#11).

#### Approval binding

- A preview/approval operation MUST have an occurrence-bound explicit request, a complete content-bound dry-run preview, single-use approval, fresh execution checks, and a completion notice (#11).
- Approval MUST bind all of the following (#11):

```text
explicit operation request ID
base commit SHA
head commit SHA
resulting merge-tree SHA
complete operation-manifest hash
applicable policy or configuration hash
required-check result set
recovery-evidence hash when recovery is required
```

- Any change to the approved operation, scope, content, evidence, policy, or recovery evidence MUST expire the approval (#11).
- A dry-run preview MUST enumerate every intended effect (#7).
- Preview completeness MUST be explicit data and MUST NOT be inferred from a sentinel item or any other convention (#7, #29).
- An incomplete preview MUST be refused before confirmation (#29, #7).
- Preview completeness MUST be checked again at execution (#29, #7).
- Broad, destructive, or identity-changing work MUST require a complete preview, explicit approval, an independent recoverable snapshot, deterministic rollback instructions, and post-operation verification (#7).
- A user MAY tighten scope and approval rules (#7).
- A user MUST NOT weaken conformance, recovery, identity, authority, omission, or audit guarantees (#7).

#### Pull-request approval

- Pull-request approval MAY satisfy preview and approval only for code-backed, repository-contained effects prepared on an isolated non-authoritative branch (#11).
- Pull-request approval MUST authorize publication or merge only (#11).
- Pull-request approval MUST NOT authorize unseen external effects (#11).
- Pull-request approval MUST NOT replace a recovery safeguard (#11).
- A general pull-request approval MUST NOT create a human verification event unless the reviewer explicitly confirms the exact current concept against its sources or resource with a qualifying identity (#11).

#### The manual-operation guard state machine

- The manual-operation guard MUST use exactly these eight states: `idle`, `requested`, `previewed`, `confirmed`, `executing`, `completed`, `failed`, and `stale` (#29).
- The guard MUST implement these transitions (#29):

```text
idle -> requested -> previewed -> confirmed -> executing -> completed
                                                        -> failed
any state -(expiry)-> stale
any state -(cancel)-> idle
stale -(re-preview)-> previewed
```

- At most one manual-only operation MUST be in flight for one bundle at a time (#29, #31, #38).
- A read-only dry-run preview MAY be created from `idle` without a recorded request (#29).
- A preview created without a matching recorded request occurrence MUST remain read-only and MUST NOT become confirmable (#29).
- A request occurrence MUST bind the operation and the selector to the preview token (#29).
- Repeated matching requests MUST receive distinct occurrence-bound token IDs (#29).
- A preview whose operation or selector differs from the recorded request MUST NOT be confirmed (#29).
- Cancellation MUST destroy the outstanding confirmation and return the guard to `idle` (#29).
- Cancellation MUST NOT park a confirmation for later use (#29).
- Re-preview from `stale`, `failed`, or `completed` MUST use the fresh-request recovery path and MUST produce a new operation occurrence (#29).
- Scope movement, transform change, another completed run, confirmation aging, and session-boundary expiry MUST produce expiry to `stale` rather than refusal (#29).
- Every guard outcome MUST carry a summary, an expected-versus-observed detail, and a next action (#29).

#### Guard verdict classes

- The guard MUST report two distinct block classes, `REFUSE` and `EXPIRE`, and MUST NOT collapse them into one (#29).
- `REFUSE` MUST mean that the ask does not match authorized work, and MUST use these codes (#29):

```text
NO_EXPLICIT_REQUEST
SELF_CONFIRMED
NO_PREVIEW
NOT_CONFIRMED
UNKNOWN_TOKEN
OPERATION_MISMATCH
SELECTOR_MISMATCH
PREVIEW_INCOMPLETE
PREVIEW_FAILED
EMPTY_SCOPE
TOKEN_SPENT
MUST_RESTART
```

- `EXPIRE` MUST mean that the ask matches but what it was confirmed against has moved, and MUST use these codes (#29):

```text
SCOPE_MOVED
TRANSFORM_CHANGED
SUPERSEDED_BY_ANOTHER_RUN
CONFIRMATION_AGED_OUT
SESSION_BOUNDARY
```

- `CANCEL` MUST be the verdict that destroys an outstanding confirmation (#29).
- `RESTART` MUST be the verdict on re-previewing out of `stale`, `failed`, or `completed` (#29).

#### Attestation

- An attestation value MUST be recorded for every confirmation (#29).
- Attestation MUST be a three-valued injected input with the values `explicit`, `model-initiated`, and `unknown` (#29).
- Claude Code `disable-model-invocation` and Codex `allow_implicit_invocation: false` MAY provide the `explicit` attestation (#29).
- A `model-initiated` request MAY prepare a dry-run preview but MUST NOT confirm or execute it (#29).
- A `model-initiated` echo MUST NOT confirm a preview that a valid explicit request previously backed (#29).
- An `unknown` attestation MUST proceed through an echoed token and MUST NOT be blocked for that reason alone (#29).
- An `unknown` attestation MUST NOT claim that a human explicitly invoked or confirmed the operation (#29).
- The shared runtime and manual-operation guard MUST remain mandatory on the OpenCode prompt-injection command path, where the harness permission gate does not fire (#35, #39).

#### Confirmation fingerprint and single use

- Confirmation MUST echo the exact occurrence-bound token ID (#29).
- An unknown, forged, spent, mismatched, or otherwise invalid token echo MUST be refused (#29).
- A dry-run preview with `complete: false` MUST be refused before confirmation (#29).
- A confirmation MUST bind a fingerprint over exactly (#29):

```text
operation
selector
transformVersion
sorted [path, contentHash, plannedAction, riskClass]
```

- The fingerprint MUST be taken from the plan the human actually saw (#29).
- The fingerprint MUST exclude modification time and file size (#29).
- A modification-time-only touch MUST NOT expire a confirmation (#29).
- A change of planned action or risk class MUST invalidate the confirmation even when the file set is unchanged (#29).
- The expected fingerprint MUST NOT be derived by re-reading content at execution time (#29).
- A completed run MUST advance the bundle epoch and MUST obsolete every outstanding sibling confirmation (#29).
- A spent token MUST NOT authorize a second run (#29).
- A rollback that restores a byte-identical corpus MUST NOT resurrect a spent token (#29, #31).
- Content binding MUST be the portable expiry mechanism, and time-to-live and session binding MUST be optional adapters (#29).
- The guard MUST remain correct with both the time-to-live adapter and the session-binding adapter disabled (#29).

#### Execution-time recheck and settlement

- At execution, the guard MUST acquire the exclusive per-bundle lock, reread the authoritative ledger state, reject a mismatched generation, reject an obsolete epoch, reject a missing or spent token, reject an operation or selector mismatch, recompute the complete current plan under the lock, verify that the fresh preview is `complete: true`, and compare the fresh plan with the confirmed fingerprint (#31, #29).
- Execution MUST recheck current content, scope, evidence, approval, and recovery immediately before mutation (#11).
- Execution MUST record `in-flight` atomically before mutation begins (#31).
- A successful execution MUST atomically spend the occurrence-bound token, advance the bundle epoch, invalidate every sibling confirmation, clear `in-flight`, and release the lock (#31).
- A handled failure MUST atomically replace `in-flight` with `failed` before releasing the lock (#31).
- A handled failure MUST NOT spend the token and MUST NOT advance the epoch (#31).
- Every retry and every sibling execution MUST replan under the lock (#31).
- A partial mutation MUST expire a mismatched confirmation (#31).
- Drift observed before the first effect MUST expire the approval (#7).
- A content or verification change during an effect MUST abort the operation and MUST record foreign mutation (#7, #30).
- There MUST be no in-place retry and no silent merge after drift (#7).

#### The manual-operation guard ledger

- The authoritative guard state MUST be a local, uncommitted, bundle-scoped manual-operation guard ledger held outside the OKF bundle and outside harness session storage (#31).
- Harness session storage MAY cache the ledger but MUST NOT be authoritative (#31).
- In a Git repository, the ledger MUST be stored in one directory per canonical bundle identity at (#31):

```text
<git-common-dir>/okf-agent-skills/guard/<bundle-key>/
```

- In a non-repository workspace, the ledger MUST be stored at (#31):

```text
<workspace-root>/.okf-agent-skills/guard/<bundle-key>/
```

- `<bundle-key>` MUST derive from the canonical bundle identity and MUST NOT derive from a display name (#31).
- Linked worktrees MUST coordinate through the same ledger for the same logical bundle, and MUST conservatively invalidate one another even when their checked-out content differs (#31).
- The ledger MUST NOT be committed (#31).
- A fresh clone, a replacement repository instance, and a CI checkout MUST inherit no confirmation, no epoch, and no replay history (#31).
- A fresh clone, a replacement repository instance, and a CI checkout MUST NOT execute a token issued elsewhere (#31).
- The ledger MUST be schema-versioned (#31).
- The ledger MUST store its generation, the bundle epoch, the outstanding occurrence-bound preview tokens with their plans and attestations, the current or interrupted execution state, and bounded spent records (#31).
- The ledger MAY store paths, actions, risk classes, and content hashes (#31).
- The ledger MUST NOT store source content (#31).
- The lock MUST live beside the ledger (#31).
- Ledger files MUST use owner-only permissions where the platform supports them (#31).
- Ledger writes MUST use write-temporary, flush, and atomic-replace discipline (#31).
- Confirmation and execution MUST fail closed if the runtime cannot create, secure, lock, or atomically replace the ledger (#31).

#### Ledger concurrency

- Several sessions MAY hold outstanding previews at the same epoch (#31).
- A short ledger update MUST hold the per-bundle lock (#31).
- Execution MUST hold an exclusive lock for its full duration (#31).
- A waiting session MUST acquire the lock, reread the ledger, observe the advanced epoch, and preview again (#31).
- Epoch checking without the lock MUST NOT be treated as sufficient concurrency control (#31).
- Only one active guarded writer operation MUST run for one bundle (#38).
- Independent bundles MAY run guarded operations in parallel when their guards permit it (#38).

#### Replay retention

- A spent record MUST contain the token occurrence ID, the fingerprint, and the execution epoch (#31).
- A raw content fingerprint MUST NOT be permanently blacklisted (#31).
- After a successful epoch advance, the ledger MUST retain the record just spent in the immediately preceding epoch and MUST prune older spent records (#31).
- An immediate replay MUST receive `TOKEN_SPENT` (#31).
- An older token MUST remain unauthorized because it is no longer outstanding and carries an obsolete generation or epoch (#31).
- A fresh dry-run preview MAY authorize byte-identical content that legitimately recurs after a rollback (#31).

#### Missing, unreadable, and incompatible ledger state

- Missing ledger state during preview MUST initialize a new random generation at epoch zero and MUST issue only a fresh token (#31).
- Missing ledger state during execution MUST refuse with `STATE_MISSING` (#31).
- The runtime MUST NOT reconstruct authorization from caller-supplied token data (#31).
- Unreadable, corrupt, insecure, or newer-schema ledger state MUST refuse confirmation and execution (#31).
- The runtime MUST NOT rewrite unreadable, corrupt, insecure, or newer-schema ledger state (#31).
- Recovery from unusable ledger state MUST be restoring access, using a compatible runtime, or explicitly resetting the ledger (#31).
- An explicit ledger reset MUST create a new random generation and MUST invalidate every prior confirmation (#31).
- An explicit ledger reset MUST NOT import authorization presented by the caller (#31).
- Unknown fields MAY be preserved within a supported schema version (#31).
- An unsupported schema version MUST fail closed (#31).

#### Interrupted execution and crash recovery

- An execution interrupted with an unknown outcome MUST block confirmation and execution until explicit recovery (#31).
- A process-disappearance recovery MUST report the recorded operation, the token, the fingerprint, and the start time (#31).
- A process-disappearance recovery MUST advance the epoch, clear every outstanding confirmation, and record the interrupted token with `outcome: unknown` (#31).
- Ledger recovery MUST NOT assume success (#31).
- Ledger recovery MUST NOT perform a rollback automatically (#31).
- The next attempt after recovery MUST require a fresh dry-run preview against current content (#31).

#### The four durable artifacts

- The suite MUST keep four distinct artifacts and MUST NOT conflate them: the operation manifest, the observation journal, the workspace manifest, and the dry-run preview (#7, #30).
- The operation manifest MUST be the sealed durable record of the approved plan and identity of one broad, destructive, or identity-changing operation (#30).
- The observation journal MUST be the append-only record of one operation's intents, outcomes, and later observations (#30).
- The workspace manifest MUST be the user-authored federation declaration and MUST record no operation (#22, #30).
- The dry-run preview MUST be the complete enumerated statement of intended effects presented for human confirmation, and MUST last only until its confirmation expires (#29, #7).
- The dry-run preview MUST NOT grant approval (#11, #29).
- Checkpoints, content identities, resume state, and later observations MUST be recorded in the observation journal, and the sealed operation manifest MUST carry none of them (#30, #37) [precedence: #37 over #19].
- The observation journal MUST be stored beside its operation manifest, outside the bundle and outside every manual-operation guard ledger (#19, #30).
- An unchanged plan MAY resume after an interruption (#19).
- Repeating a completed plan MUST be an idempotent no-op (#19).
- Any request, scope, or content drift MUST invalidate the plan (#19).

#### The durable operation store

- The operation manifest MUST be stored in a separate durable operation store outside every mutation target and outside every manual-operation guard ledger (#7, #30).
- The operation store MUST outlive the process and the machine that created it (#7).
- The operation store MUST survive repository replacement (#7).
- The operation manifest MUST be written completely, flushed, atomically published, and content-verified (#7).
- The operation manifest MUST be immutable after publication (#30).
- The operation manifest MUST be sealed at `MANIFEST_DURABLE` (#30).
- A later observation MUST be appended to the observation journal and MUST NOT amend the sealed operation manifest (#30).
- A missing, torn, corrupt, truncated, or unknown-schema operation manifest MUST produce `indeterminate` and MUST block execution and recovery claims (#7, #30).
- Recovery from a crashed restructuring operation MUST route through the operation manifest rather than through a guard ledger (#7, #30).

#### Restructuring state and ordering

- Restructuring state MUST be derived from the append-only observation journal and MUST NOT be stored as independently authoritative phase state (#30).
- The phase and the terminal classification MUST both be computed from the journal (#30).
- `settled` MUST be true if and only if a durable `SETTLED` record exists (#30).
- Lineage MUST be durable before the first mutation (#30).
- Each effect MUST durably record `INTENT{undo}`, then mutate, then record `OUTCOME`, in that order (#30).
- `observedHash` MUST be computed as (#30):

```text
observedHash = H(contentHash, verificationHash)
```

- The operation MUST compare `observedHash` at the initial recheck and again before every `INTENT` (#30).
- A concurrent verification change MUST abort the operation exactly as a concurrent content change does (#30).
- Phase guards MUST be expressed as one transition table read as data, and MUST NOT be written as inline conditions inside individual transition cases (#30).
- Identity continuity MUST NOT be claimed across a move (#30).
- `movedFrom` MAY record where bytes came from and MUST NOT assert identity continuity (#30).
- Cross-bundle merge, cross-bundle split, and bundle-root moves MUST be unconstructible as plan types (#30).
- Token spend and epoch advance MUST occur strictly after the last `OUTCOME` and strictly before `SETTLED` (#30).
- A verification failure before settlement MUST leave the token unspent (#30).
- A rollback MUST NOT use a spent token (#30).

#### Terminal classification

- The terminal classification MUST be the product of two independent axes (#30):

```text
settlement:  applied | reverted | failed
cleanliness: clean | dirty
```

- A dirty terminal MUST carry an ambiguity or residue notice (#30).
- A terminal without a notice MUST fail invariant validation (#30).
- A dirty terminal with an empty ambiguity list MUST fail invariant validation (#30).
- A loss the taxonomy does not recognise MUST be classified `unclassified-loss` and MUST NOT be omitted (#30).
- A proven partial result MUST be classified `partially-applied` (#37).
- An unknown result MUST be classified `indeterminate` (#37).
- `partially-applied` and `indeterminate` MUST both block further mutation on the affected bundles until explicit reconciliation (#37).
- Every human-only terminal MUST be exited through a new operation with its own request, dry-run preview, approval, and recovery gate (#30).
- Observed bytes equal to `afterHash` MUST be read as done, and reconciliation MUST NOT claim which session authored them (#30).

#### Rollback

- Rollback MUST always require fresh approval (#7, #30) [precedence: #7 over #30].
- Parent approval MUST be treated as context only and MUST NOT authorize a later rollback (#7).
- Rollback MUST restore bytes only (#30).
- The snapshot entry MUST be the sole input to restoration (#30).
- A parsed view of restored content MUST be render-only (#30).
- Rollback MUST NOT reserialize content (#30).
- The snapshot and restore mechanism MUST NOT itself reserialize content (#7).
- Rollback MUST use a real inverse manifest built from what actually landed and MUST NOT use the planned effects (#30).
- Each inverse `beforeHash` MUST be corrected to the hash held by the partially applied world (#30).
- An empty inverse MUST block with `NOTHING_TO_ROLL_BACK` and MUST NOT enter a rolling-back state (#30).
- `rollback-failed` MUST be a loud terminal (#7).
- Automatic repair MUST NOT occur after `rollback-failed` (#7).
- Inverse retry MUST NOT occur after `rollback-failed` (#7).
- A repair MUST start as a new operation with a new dry-run preview, approval, snapshot, recovery gate, and post-operation checks (#7).

#### Recovery evidence

- Recovery evidence MUST pass only when every one of the following holds (#11, #7):

```text
an independent content-addressed snapshot of the affected bundles and relevant untracked files
the snapshot is stored outside the mutation target
a restore into a disposable location succeeds
restored bytes or restored content hashes match
applicable OKF validation passes
applicable suite checks pass
operation-specific identity checks pass
inbound-link checks pass
provenance checks pass
trust checks pass
deterministic rollback instructions are documented
snapshot and restore evidence is bound to the approved dry-run preview
post-operation validation bound to the approved plan passes
```

- A backup that merely exists MUST NOT qualify as recovery evidence (#11).
- A backup that cannot be restored and verified MUST NOT qualify as recovery evidence (#7).
- Git history, reflogs, automatic commits, and `git archive` MUST NOT alone satisfy recovery evidence (#11, #7).
- A trust tier, a confirmation, and a pull-request approval MUST NOT override the recovery gate (#11).
- Failed, stale, missing, or invalid recovery evidence MUST block execution (#11).

#### Rollback residue

- An effect that rollback cannot reverse MUST be recorded as rollback residue (#7).
- Rollback residue MUST make the terminal result `dirty` or `indeterminate` (#7).
- Rollback residue MUST NOT be reported with a `clean` terminal result (#7).
- Byte-identity brittleness MUST be accepted, and a tool that normalizes line endings or reserializes frontmatter MUST turn an ordinary rollback into `rollback-failed` (#30).

#### Cross-repository guard, approval, and recovery

- A cross-repository write MUST pass a distinct `WRITE_AUTHORITY` gate after reach, presence, trust, and access (#37).
- A cross-repository write MUST NOT be automatic lifecycle work (#37).
- A cross-repository write MUST require explicit manual invocation, a complete dry-run preview, approval, fresh execution checks, and recovery evidence (#37).
- Each affected bundle MUST use its own authoritative manual-operation guard ledger in its Git common directory (#37).
- Missing, unreadable, insecure, or unlockable target guard state MUST fail closed (#37).
- All affected bundle locks MUST be acquired in one deterministic canonical order (#37).
- The operation MUST reread every ledger under lock and MUST hold every lock through fresh validation, mutation, journaling, and settlement (#37).
- One sealed operation manifest and one append-only observation journal MUST cover the complete cross-repository operation (#37).
- The cross-repository operation manifest and journal MUST live in the durable operation store outside both mutation targets and outside every guard ledger (#37).
- Approval MUST cover the complete cross-repository operation and MUST include an approval record for each affected repository (#37).
- Each approval record MUST bind repository identity and revisions, resulting content identity, operation and policy hashes, grant generation, required checks, and recovery evidence (#37).
- Any relevant change MUST expire the cross-repository approval (#37).
- Ordinary approval of a source pull request MUST NOT satisfy cross-repository approval (#37).
- A pull-request review MAY supply checks or evidence for a cross-repository operation (#37).
- Each affected repository MUST have an authorized human or configured verifier (#37).
- Commit authorship, local Git identity, filesystem access, trust, and model self-approval MUST NOT satisfy the cross-repository verifier requirement (#37).
- Cross-repository recovery evidence MUST cover both repositories and relevant untracked files (#37).
- Cross-repository atomicity MUST NOT be claimed (#37, #30).
- Cross-repository rollback or repair MUST be a new operation with a fresh request, dry-run preview, approval, and recovery gate (#37).

#### Invocation is not approval

- Every automatic hook MUST remain read-only (#35).
- Every bounded `v0.1.0` mutation MUST require explicit user intent, regardless of native invocation controls. The shared manual-operation guard is retained design for a later guarded release. (#35, #43)
- A harness adapter MUST NOT contain independent guard semantics (#35).
- Installing, disabling, or uninstalling an adapter MUST NOT alter guard state (#35).
- A command invocation MUST be treated as a request and MUST NOT be treated as approval, authority, or proof that mutation is safe (#39).
- Delegation MUST NOT change approval, recovery, write authority, the automatic-write ceiling, or the shared manual-operation guard (#38).
- A user setting MUST NOT alter approval, recovery, or guard behavior (#38).
- Creating a delegated writer MUST NOT constitute approval (#38).
- A delegated writer MAY prepare a complete dry-run preview and verify approval, and MUST NOT self-approve (#38).
- A delegated writer MUST recheck the marker, routing, admission, target identity, current content, evidence, operation class, and guard state before execution (#38).
- A delegated writer MUST verify the operation class, MUST block a mismatch, and MUST NOT downgrade a broad effect to a bounded update (#38).
- Preview, approval, and execution MUST stay bound to one operation identity, one bundle epoch, and one guard generation (#38).
- A new writer, a session boundary, a target change, or preview drift MUST require a fresh plan and fresh approval (#38).
- Every bounded `v0.1.0` mutation MUST use the shared write path, and native tools MUST NOT replace it. The guarded write path is retained design for a later guarded release. (#38, #43)
- A harness that cannot attest a complete preview or an explicit confirmation MUST block the operation rather than weaken it (#19).

#### Release evidence for this section

- The release MUST ship deterministic fixtures for every safety gate defined here (#7).
- Data loss, nondeterminism, false-clean status, unreported omission, and invalid recovery MUST have zero tolerance (#7).
- Missing or unobservable required evidence MUST be reported as `degraded` or `indeterminate` for reads, and a dependent mutation MUST be blocked (#7).
- Safe inspection MUST remain possible when the missing evidence is not required for that operation (#7).
- Validation MUST be scoped to the bundle root, the affected concepts, and the direct derived artifacts for small local work (#7).
- Broad, destructive, identity-changing, or completeness-claiming work MUST require exhaustive validation (#7).

### 6. Migration

> Decision #43: this section is retained design for a later guarded release and is not a `v0.1.0` obligation.

#### Request and scope

- Migration MUST be a manual, explicitly requested `okf-lifecycle` operation (#19).
- Migration MUST NOT be automatic lifecycle synchronization, a new skill, a CLI, or implicit initialization (#19).
- Migration MUST emit only OKF v0.2 (#19, #21).
- A migration request MUST name exactly one source root, one explicit project mode, and explicit include and exclude rules (#19).
- Migration MUST NOT scan an entire workspace or discover source material implicitly (#19).
- An external source root MAY be used only when the active harness already grants read access and the canonical path passes existing trust and containment checks (#19).
- Migration MUST NOT widen access, follow an escaping symlink, or write to an external source (#19).
- An unknown project mode MUST block migration mutation (#11).
- Code-backed projects MUST migrate only durable context that code cannot recover, including rationale, domain language, constraints, decisions, and workflows (#19).
- Migration MUST NOT import implementation-recoverable or generated material into a code-backed project (#19).
- In a knowledge-only project, the accepted OKF bundle MUST become the active authority for migrated durable context (#19).
- Originals MUST remain immutable evidence or archive and MUST NOT remain a second active source (#19).
- Code MUST remain authoritative for executable behavior in a code-backed project (#19).

#### Admission and mapping

- Direct parsing MUST be limited to UTF-8 Markdown, optional YAML frontmatter, standard Markdown links, and reference definitions (#19).
- Migration MUST leave unsupported formats as source material or inert residue (#19).
- Migration MUST NOT add a v0.1.0 parser for HTML, PDF, Word, MediaWiki, Obsidian syntax, wikilinks, plugins, or Dataview (#19).
- One selected source document MUST map to one output concept by default (#19).
- Migration MUST NOT automatically extract glossary entries, split documents, or invent concepts (#19).
- An explicit mapping or a separate restructuring operation MUST be used for glossary extraction, splitting, or other such transformations (#19).
- Output identity MUST be the deterministic normalized form of the selected source's relative path (#19).
- Migration MUST NOT invent UUID continuity, silently rename, auto-merge, or overwrite concepts (#19).
- An existing target-path collision MUST block the plan (#19).
- A Concept ID MUST remain the bundle-relative file path without `.md`; moving or renaming a concept MUST change its identity (#22).
- The UUID v7 frontmatter identity proposal MUST NOT be implemented (#22).
- An explicit source type MUST be preserved (#19).
- A source-class-to-OKF-type mapping MUST be human-approved (#19).
- An ambiguous or missing source type MUST NOT be guessed (#19).
- An unknown explicit OKF type MUST remain valid (#19).
- Existing OKF target concepts MUST NOT be implicitly merged or replaced (#19).
- Unrelated target concepts MUST remain unchanged (#19).
- Selected or referenced attachments MUST be copied byte-for-byte to deterministic `references/` paths with content hashes (#19).
- Unsupported files MUST NOT be interpreted, embedded, converted, or deleted (#19).

#### Provenance and residue

- Structured `sources` MUST be authoritative when it coexists with legacy citations (#19, #21).
- Only structurally unambiguous citations MAY be converted automatically (#19).
- Existing matching `sources` entries MUST NOT be overwritten (#21).
- Ambiguous prose, conflicting citations, and unassigned provenance MUST be reported and require explicit handling (#19, #21).
- Migration MUST NOT fabricate `generated`, actors, `verified`, freshness, or review baselines (#19, #21).
- A legacy `timestamp` MUST NOT fabricate `generated`, an actor, verification, or provenance (#21).
- Exact duplicates MUST be reported as candidates (#19).
- Near-duplicates, conflicting claims, identifier collisions, and ambiguous mappings MUST block until the user chooses a result (#19).
- Migration MUST NOT silently deduplicate, delete, or reattribute evidence (#19).
- Material that cannot be safely represented as OKF semantics MUST remain visible and inert (#19).
- Textual migration residue MUST be retained in a `## Migration residue` section (#19, #21).
- Separate unsupported files MUST remain in the source corpus as residue (#19).
- Migration residue MUST NOT be active concept meaning (#19).
- The external operational receipt MUST record each residue source path, reason, and disposition (#19).
- Originals MUST NOT be mutated, relocated, or deleted by migration (#19).
- Cleanup MUST be a separate recovery-gated operation (#19).

#### Links and semantic fidelity

- Missing link targets MUST be tolerated and reported as non-blocking warnings (#19).
- Parsed links MAY be rewritten only when their target mapping is unambiguous (#19).
- An ambiguous link rewrite or a dropped parsed reference MUST block the affected plan (#19).
- Paths in prose, inline code, and fenced code MUST NOT be treated as links (#19).
- Migration link handling MUST use the inbound-link carriers and exclusions defined by the restructuring and links section (#24).
- Structural checks, frontmatter parse-tree round trips, file counts, link handling, and bundle conformance MUST NOT establish semantic fidelity (#19).
- A semantic-fidelity claim MUST require human review of all conflicts and residue plus representative high-risk conversions (#19).
- Without that evidence, semantic fidelity MUST be reported as not assessed (#19).
- Bundle conformance MUST NOT establish migration completeness or semantic fidelity (#21).

#### Write-new-then-swap

- Migration MUST write all transformed output to a separate staging area (#19).
- Migration MUST validate staged output before publication (#19).
- Migration MUST publish through an atomic write-new-then-swap operation (#19).
- The exact bundle-root `okf_version: "0.2"` write gate MUST remain in force for migration (#21).
- Migration MUST NOT weaken the exact bundle-root `okf_version: "0.2"` write gate to make bootstrap publication reachable (#19, #21).
- Migration MUST NOT mutate sources or targets in place (#19).
- Migration MUST NOT publish incomplete work (#19).
- Partial work MUST remain staged and reported until the request is narrowed or the blocker is resolved (#19).
- A migration MUST be `complete` only when every selected input has a safe disposition, including inert residue (#19).
- A migration MUST be `partial` when selected work remains unresolved (#19).
- Recovery or post-operation uncertainty MUST produce `failed` or `indeterminate`, never success (#19).
- The operation MUST use the bundle-scoped operation lock, fresh source and target identity and content checks, a separate staging area, validation, and atomic publication (#19).
- Drift after preview MUST abort without target mutation and MUST require a new preview (#19).

#### Ordered migration gates

1. The evaluator MUST parse project mode and current concept state for every affected bundle before evaluating migration effects (#11).
2. The evaluator MUST expand migration into a complete atomic effect plan (#11).
3. The evaluator MUST enforce direct OKF requirements and prohibitions (#11).
4. The evaluator MUST check evidence and verifier-identity prerequisites (#11).
5. The evaluator MUST evaluate every atomic effect in the operation matrix (#11).
6. The evaluator MUST compose the strictest result, ordered as `blocked` over `preview/approval`, over `notice`, over `allowed` (#11).
7. The evaluator MUST apply the manual-only invocation ceiling (#11).
8. The evaluator MUST apply broad, destructive, identity-affecting, and external-effect modifiers (#11).
9. Migration MUST require a recorded matching explicit request before its preview becomes confirmable (#29).
10. The preview MUST enumerate every selected input and its disposition, scope, project mode, classifications, paths, transformations, links, provenance, residue, conflicts, attachments, retained originals, output identities, hashes, and recovery evidence (#19).
11. Preview completeness MUST be explicit data and MUST NOT be inferred from a sentinel item or another convention (#29, #7).
12. An incomplete preview MUST NOT mint confirmation (#19, #29).
13. Confirmation MUST bind to the explicit request and complete plan (#19).
14. Confirmation MUST bind to the operation, selector, transform version, and sorted `[path, contentHash, plannedAction, riskClass]` entries (#29).
15. Preview completeness and the content-bound plan MUST be rechecked at execution (#29).
16. Migration MUST require explicit approval (#19).
17. Broad, destructive, or identity-changing migration MUST require an independent content-addressed snapshot of affected bundles and relevant untracked files (#11).
18. The snapshot MUST be stored outside the mutation target (#11).
19. The snapshot MUST be restored successfully into a disposable location (#11).
20. Restored bytes or hashes MUST be verified (#11).
21. OKF validation and operation-specific identity, link, provenance, and trust checks MUST pass (#11, #7).
22. A documented rollback procedure MUST exist (#11).
23. Snapshot and restore evidence MUST be bound to the approved preview (#11).
24. A qualifying pull request MAY satisfy migration preview and approval only when the general pull-request approval conditions apply (#11).
25. Content, scope, evidence, approval, and recovery MUST be rechecked immediately before execution (#11).
26. Migration MUST execute atomically, validate the result, and perform post-operation validation before reporting success (#11).
27. Failed or stale recovery evidence MUST block migration (#11).
28. Trust tier, confirmation, Git history, pull-request approval, reflogs, automatic commits, and `git archive` MUST NOT alone satisfy recovery (#11).
29. Migration MUST use the operation manifest, observation journal, and dry-run preview as distinct artifacts under the general operation-record rules (#7, #30).
30. A missing, torn, corrupt, truncated, or unknown-schema operation record MUST produce `indeterminate` and MUST block execution or recovery claims (#7, #30).

#### Harness attestation

- A harness MUST block migration when the shared runtime cannot attest that the preview is complete or that the confirmation is explicit (#19, #29) [precedence: #19 over #29].
- For migration, "cannot attest" MUST mean that the runtime has no reliable observed fact for either preview completeness or explicit confirmation; it MUST NOT mean only that the harness lacks a native explicit-invocation control (#19, #29) [precedence: #19 over #29].
- A harness adapter MUST NOT weaken the shared migration request, preview, confirmation, execution, or outcome semantics (#19).
- A model-initiated request MAY prepare a dry-run preview but MUST NOT confirm or execute migration (#29).

#### Re-runs and reporting

- An unchanged approved migration plan MAY resume after interruption (#19).
- Repeating a completed migration plan MUST be an idempotent no-op (#19).
- Request, scope, or content drift MUST invalidate the plan (#19).
- A completed guarded migration MUST spend its occurrence-bound token and advance the bundle epoch (#31).
- A completed guarded migration MUST invalidate sibling confirmations (#31).
- Immediate replay of a spent token MUST be refused (#31).
- A fresh preview MAY authorize byte-identical content after rollback (#31).
- An interrupted migration with unknown outcome MUST block confirmation and execution until explicit recovery (#31).
- Explicit recovery MUST NOT assume success or perform rollback (#31).
- The next migration attempt after unknown outcome MUST use a fresh preview against current content (#31).
- The external operational receipt MUST record source and target identities, dispositions, mappings, conflicts, residue, link outcomes, provenance assignments, hashes, recovery checks, validation findings, and final outcome (#19).
- The operational receipt MUST NOT be OKF content or a semantic sidecar (#19).

### 7. Restructuring, archiving, and links

> Decision #43: this section is retained design for a later guarded release and is not a `v0.1.0` obligation.

#### Restructuring scope for `v0.1.0`

- `v0.1.0` MUST ship merge and split as manual composite operations (#11).
- The composite workflows `archive`, `merge`, and `split` MUST expand into a complete effect plan before execution (#11).
- A command name MUST NOT conceal deletion, an identity change, or a graph rewrite (#11).
- Automatic lifecycle behavior MUST NOT archive, merge, split, move, rename, delete, change status, or perform a broad link rewrite (#11).
- Merge and split MUST NOT combine concepts across bundles (#22).
- Cross-bundle merge and split MUST be unconstructible as a plan type (#22, #24).
- Concept identity MUST be bundle identity plus the bundle-relative Concept ID (#22).
- Moving or renaming a concept MUST change its identity (#22).
- The suite MUST NOT claim identity continuity across a move through a suite identifier or a frontmatter extension (#21, #22).
- Creating merge or split outputs MUST require preview, approval, and verified recovery in both project modes at every pre-operation trust tier (#11).
- Merge and split outputs MUST be created with `status: draft` and no `verified` (#11).
- Restructuring MUST NOT transfer trust (#11).
- A restructuring output MUST NOT inherit a review baseline (#7, #12).
- Restructuring MAY show proposed review-dependency mappings in its preview (#7).
- A proposed review-dependency mapping MUST be non-authoritative and MUST require explicit review before acceptance (#7).
- A merge, split, relocation, archive, or delete MUST be blocked when the project mode of an affected bundle is unknown (#11).
- Index regeneration, log append, and mechanical link repair directly affected by a restructuring operation MUST inherit the parent approval and MUST NOT require separate approval (#11).
- A standalone broad index rebuild or broad link rewrite MUST acquire the broad modifier (#11).
- A concurrent content or verification change MUST abort the operation and MUST require a fresh preview (#11).

#### Redirects and retired paths

- `redirects` MUST resolve to `{mode: "off"}` for `v0.1.0` (#24).
- `v0.1.0` MUST NOT publish a redirect file, redirect frontmatter, a redirect index entry, an alias, or a follow rule (#24).
- Redirect publication MUST be unconstructible as a plan type (#11, #24).
- Introducing a redirect or a discoverability alias MUST remain blocked in both project modes at every trust tier (#11, #21, #24).
- The suite MUST NOT ship an ordinary deprecated concept as a redirect stub (#24).
- A retired concept path MUST vacate (#24).
- A retired path MUST become indistinguishable from an identifier that never existed (#24).
- Navigation MUST NOT contain a redirect-resolution step (#24, #36).
- An external reference to a retired path MAY die silently without successor tracing (#24).
- The suite MUST NOT create an artifact whose purpose is to preserve an external reference to a retired path (#24).

#### What counts as an inbound link

- An inbound link MUST be a parsed, resolvable path reference to a concept (#24).
- Discovery MUST include every carrier marked included and MUST exclude every carrier marked excluded in the table below (#24).

| Carrier | Verdict |
| --- | --- |
| Markdown inline link | Included |
| Markdown reference-style link definition | Included |
| Frontmatter `resource` | Included |
| Frontmatter `sources[].resource` | Included |
| Frontmatter `computation` | Included |
| Frontmatter `executor.resource` | Included |
| Frontmatter `attester.resource` | Included |
| `index.md` list entry | Included |
| `okf-workspace://<alias>/<concept-id>` link | Included |
| Bare path mentioned in ordinary prose | Excluded |
| Path inside a fenced code block | Excluded |
| Path inside an inline code span | Excluded |

- A discovery result MUST identify every included reference with a byte offset (#24).
- A substitution MUST be confined to the byte range of the parsed reference (#24).
- The suite MUST NOT rewrite a path occurrence in prose, in a fenced block, or in an inline code span (#24).

#### Inbound-link discovery and fates

- An `InboundLinkSet` MUST carry an explicit completeness flag and the reasons for incompleteness (#24).
- An incomplete `InboundLinkSet` MUST be inadmissible for in-bundle rewriting (#24).
- Relocation MUST be blocked when inbound-link discovery is incomplete (#14).
- In-place deprecation MUST NOT require complete inbound-link evidence (#14).
- Every discovered inbound link MUST receive an explicit fate (#24).
- The fate values are exactly `rewrite` and `knowingly-broken-approved` (#24).
- A writable in-bundle link holder MUST receive the `rewrite` fate when its target moves (#24).
- A non-writable link holder MUST NOT receive the `rewrite` fate and MAY receive `knowingly-broken-approved` (#24).
- A `rewrite` fate on a holder in a read-only destination bundle MUST be refused with `DESTINATION_BUNDLE_READ_ONLY` (#24).
- A split MUST NOT infer which output inherits an inbound link (#24).
- An `okf-workspace://` alias MUST NOT resolve to more than one target (#24).

#### Totality of in-bundle rewriting

- In-bundle rewriting MUST be total over every included carrier in the inbound-link table (#24).
- A dangling in-bundle link after a move MUST be unconstructible (#24).
- A relocated concept MUST have every discovered writable in-bundle reference rewritten before the operation succeeds (#24).
- A retired path MUST have zero remaining in-bundle inbound links after the operation (#24).
- A retired path MUST NOT be reachable through any in-bundle carrier, and no in-bundle repair of an external reference MUST be attempted (#24).

#### Link resolution

- A link MUST resolve if and only if its target file exists (#24).
- Concept `status` MUST NOT be an input to link resolution (#24).
- A navigation or retrieval observation MUST NOT be an input to link resolution (#24, #36).
- A deprecated concept MUST continue to satisfy an inbound link while its file exists (#14, #24).
- A retired path with no remaining file MUST fail link resolution (#24).
- The link-resolution verdict values are exactly `resolves`, `unexpectedly-broken`, and `knowingly-broken-approved` (#24, #30).
- Standard Markdown links MUST resolve only inside their source bundle and MUST NOT fall through to another bundle (#22).
- An authored cross-bundle link MUST use `okf-workspace://<bundle-alias>/<concept-id>` (#22).
- The active workspace manifest MUST be the only resolver for a workspace link (#22).
- A missing or inactive workspace alias MUST remain broken and MUST report a diagnostic (#22).
- A link MUST NOT widen discovery, trust, access, or write authority (#22).
- An operation MUST report the `links-split-across-old-and-new` ambiguity whenever an old carrier and a new carrier are both live (#24).
- An unresolved internal link MUST raise a default soft warning (#7).

#### Provenance assignment

- `sources` MUST remain the only authored provenance representation (#12).
- Each restructuring output MUST be pre-filled with exactly the `sources` entries cited by footnotes in its retained body (#24).
- The footnote attribution key MUST be the OKF specification's `[^id]` key (#24).
- Merge provenance MUST be the union derived from the retained body's footnotes (#24).
- Split provenance MUST be the partition derived from each output's retained-body footnotes (#24).
- The suite MUST NOT copy every input source entry to every output (#24).
- The suite MUST NOT guess concept-level provenance (#24).
- A source entry that no output footnotes MUST be assigned explicitly by a human, or the operation MUST refuse with `PROVENANCE_UNASSIGNED` (#24).
- Provenance assignment MUST be represented as a table keyed by output and MUST NOT be a function (#24).
- Provenance assignment MUST appear in the dry-run preview and MUST be bound into the approval fingerprint (#24).
- Observed evidence read during a restructuring operation MUST NOT become authored provenance (#12, #36).

#### Source-entry collisions and duplicate resources

| Collision | Verdict | Effect |
| --- | --- | --- |
| `same-id-different-resource` — one identifier carrying different resources | Block | The operation refuses. The remedy is to re-key one input and re-preview. |
| `same-resource-different-id` — one resource carried by different identifiers | Notice | Both entries are retained. |

- A provenance identifier collision where one identifier carries different resources MUST block the operation (#24).
- A resource collision where one resource carries different identifiers MUST produce a notice and MUST retain both entries (#24).
- The suite MUST NOT deduplicate colliding source entries (#24).
- The suite MUST NOT silently re-attribute a claim to resolve a source collision (#24).
- The suite MUST NOT rewrite body text to resolve a source collision inside an operation approved for something else (#24).
- Matching Concept IDs across visible bundles, matching normalized non-empty `resource` values, and byte-identical documents MUST remain independently owned advisory candidates (#22).
- Only duplicate routes to one identical canonical bundle identity MUST be loaded once (#22).
- Duplicate detection MUST NOT produce a synthetic document, an ownership change, or an automatic consolidation (#22).

#### Source disposition

| Project mode | Disposition of a merge or split source | Precondition |
| --- | --- | --- |
| Code-backed | `delete` | The preview proves the concept is superseded or redundant, proves it holds no unique durable context, and recovery checks pass. |
| Knowledge-only | `deprecate` | In-place deprecation under preview and approval; deletion is blocked because the bundle is authoritative. |
| Either mode | `leave` is refused | None; the disposition is unavailable. |

- Source disposition MUST be determined by project mode and MUST NOT be chosen per operation (#24).
- A merge or split source MUST use `delete` in a code-backed project only after the deletion eligibility proof passes (#11, #24).
- A merge or split source MUST use `deprecate` in a knowledge-only project (#11, #24).
- `leave` MUST be refused for merge and split sources in both project modes (#24).
- Purging unique durable knowledge MUST be blocked in both project modes (#11).
- Rollback MUST restore a merge or split source byte-for-byte under either disposition (#24, #30).

#### Archive operations

- Normal `archive` MUST mean in-place deprecation in both project modes (#14).
- In-place deprecation MUST retain the concept's current path (#14).
- In-place deprecation MUST set standard `status: deprecated` (#14).
- In-place deprecation MUST preserve bundle-relative identity and path-based link resolution (#14, #24).
- Every in-place deprecation MUST require an explicit request, a complete preview, approval, a fresh recheck, a sealed manifest, and an exact before-image (#14).
- Relocation MUST be a separate explicit operation (#14).
- Relocation MUST require an explicit destination inside the same bundle (#14).
- Relocation MUST NOT infer an `archive/` destination (#14).
- Relocation MUST NOT overwrite a destination collision (#14).
- Relocation MUST NOT auto-suffix a destination path (#14).
- Relocation MUST be treated as an identity-changing operation (#14).
- Relocation MUST require complete inbound-link evidence and complete rewriting (#14).
- Relocation MUST require link and index validation (#14).
- Relocation MUST require an independent snapshot and a verified disposable restore (#14).
- Relocation MUST satisfy the recovery-evidence gate (#14).
- Relocation MUST vacate the old path outright, with no stub and no indirection (#14, #24).
- A cross-bundle move MUST be an explicit identity-changing migration with link rewriting and MUST NOT be an ordinary update (#22).
- Compaction MUST NOT relocate, delete, summarize, merge, or deduplicate a concept (#7).

#### Archive content and successor notice

- Only the standard `status: deprecated` value MUST be used as authored lifecycle metadata (#14).
- `v0.1.0` MUST NOT add `superseded_by`, `deprecation_reason`, or `retain_until` (#14).
- The suite MUST NOT persist a product-specific frontmatter key or a machine-parsed body section to represent supersession (#14, #21).
- A machine-parsed supersede edge MUST NOT exist in `v0.1.0` (#14).
- When a successor is known, a deprecated concept MUST contain a visible ordinary Markdown successor notice with one or more links (#14).
- A successor notice MUST be navigation only (#14).
- A successor notice MUST NOT be a redirect, an identity-continuity claim, or a machine-parsed relationship (#14).

#### Deprecated concepts in indexes and navigation

- Deprecated concepts MUST remain in indexes (#14).
- An index MAY label a concept deprecated only after observing its status (#14).
- Ordinary navigation MUST exclude an observed `status: deprecated` concept (#14, #36).
- An exact path or Concept ID target MAY retrieve a deprecated concept, and the result MUST carry a warning (#14, #36).
- An explicit request to include deprecated concepts MAY retrieve them, and the result MUST carry a warning (#36).
- The word `deprecated` in a query MUST NOT by itself opt into deprecated concepts (#36).
- If status was not observed, the result MUST be unfiltered and MUST disclose the unevaluated archive predicate (#14).
- An unobserved status MUST NOT support a filtered result or a complete archive-exclusion claim (#14).
- The unobserved-status disclosure MUST use the navigation result vocabulary and MUST report the result as `degraded` (#14, #36) [precedence: #36 over #14].
- An index MUST NOT be repaired during a read (#6, #36).
- Directly affected index entries MUST be maintained only after an accepted mutation (#6).

#### Retention, recommendations, and restoration

- Deprecated concepts MUST be retained indefinitely by default (#14).
- Age MUST NOT trigger an automatic purge (#14).
- `stale_after` MUST NOT trigger an automatic purge (#14).
- An inbound-link count MUST NOT trigger an automatic purge (#14).
- The suite MUST NOT automatically delete an archived or deprecated concept (#14).
- Knowledge-only authoritative content MUST NOT be automatically deleted (#11).
- Archive recommendations MUST be read-only (#14).
- `stale_after`, changed review dependencies, complete orphan evidence, and configured policy MAY prompt review and MUST NOT mutate content (#14).
- A growth signal MUST NOT automatically archive, purge, delete, compact, or rewrite knowledge (#7).
- Trust tiers MUST remain advisory for every archive decision (#11, #14).
- `stable -> deprecated` MUST require preview and approval at every trust tier in both project modes (#11).
- `deprecated -> stable` MUST require preview and approval at every trust tier in both project modes (#11).

#### The knowledge-only merge and split orphan

- A knowledge-only merge or split source MUST retain its full original text after deprecation (#14).
- A knowledge-only merge or split source MUST have zero inbound links after total rewriting (#14).
- A knowledge-only merge or split source MUST receive a visible ordinary Markdown successor notice linking to its outputs when the successor is known (#14).
- A knowledge-only merge or split source MUST NOT rely on a redirect or a machine-parsed supersede edge (#14).
- A knowledge-only merge or split source MUST remain in indexes after deprecation (#14).

#### Operation records, journal, and rollback for restructuring

- Restructuring state MUST be derived from an append-only observation journal and MUST NOT be stored independently (#30).
- Phase and terminal classification MUST be derived from the journal (#30).
- The operation manifest MUST be sealed before the first mutation and MUST be immutable thereafter (#30).
- The operation manifest MUST be stored outside every mutation target and outside the manual-operation guard ledger (#7, #30).
- The operation manifest MUST be published atomically and MUST survive repository replacement and the machine that wrote it (#7, #30).
- A later observation MUST be appended to the observation journal and MUST NOT amend the sealed operation manifest (#30).
- Each effect MUST durably record `INTENT{undo}` before its mutation and `OUTCOME` after its mutation (#30).
- `observedHash` MUST be compared at recheck and again before every mutation intent (#30).
- Rollback MUST be represented by a new inverse manifest built from the effects that actually landed (#30).
- Rollback MUST correct each inverse `beforeHash` to the state actually present after partial execution (#30).
- Rollback MUST restore bytes from snapshot entry data and MUST NOT reserialize a parsed view (#30).
- An empty inverse MUST block with `NOTHING_TO_ROLL_BACK` (#30).
- Rollback MUST require fresh approval (#7).
- Retrieval, external-index, and external-link observations that escaped before rollback MUST be reported as rollback residue (#14).
- Rollback residue MUST make the result `dirty` or `indeterminate` and MUST NOT be reported as `clean` (#7, #14).
- A human-only terminal MUST be exited only by a new operation with its own preview, approval, and recovery gate (#30).

### 8. Suite architecture, distribution, and skill authoring

#### Suite inventory

- The project MUST ship as one monorepo named `artemVeduta/okf-agent-skills`. (#5)
- The suite MUST ship one `okf` router skill and exactly four skills: `okf-read`, `okf-write`, `okf-lifecycle`, and `okf-review`. (#5)
- The `okf` router `SKILL.md` MUST dispatch to the four sub-skills. (#5)
- The suite MUST NOT ship a separate guard skill or a separate retrieval skill. (#5)
- Guard behavior and shared runtime behavior MUST be implemented as shared modules, not as skills. (#5)
- Separate repositories per skill MUST NOT be used. (#5)

#### Responsibility boundary of each skill

- `okf-read` MUST own safe inspection. (#5)
- `okf-read` MUST navigate admitted bundle indexes and concept bodies through harness-native file tools. (#36)
- `okf-read` MUST NOT provide a custom retrieval backend, matcher, ranking service, embedding store, tokenizer, cost model, budget, reserve, tier allocator, retrieval receipt, or retrieval ledger. (#36)
- `okf-write` MUST own bounded bundle mutations. (#5)
- Every mutation MUST use the shared `okf-write` runtime and the manual-operation guard. (#38)
- Native harness tools MUST NOT replace the shared write path. (#38)
- `okf-lifecycle` MUST own `init`, `sync`, `migrate`, and `compact`. (#5)
> Decision #129: `init` is owned by `okf-setup`, not by `okf-lifecycle`, and it carries its own admission (ownership, REACH, TRUST, ACCESS) instead of the `okf-lifecycle` manual gate. `sync` and `compact` are unchanged. See record D11.
- `init`, `migrate`, and `compact` MUST be manual-gated operations. (#5)
- Migration MUST be a manual, explicitly requested `okf-lifecycle` operation. (#19)
- Migration MUST NOT be a new skill, a CLI, an automatic lifecycle synchronization, or an implicit part of initialization. (#19)
> Decision #129: migration is an internal phase of an explicitly invoked `okf-setup` session, carried by the `discover`, `migration-plan`, `partition`, `assemble`, `migration-validate`, and `publish` operations. The "not a new skill" clause is superseded: the sealed skill set grows from five to six. The rest of the rule stands — there is no CLI, no automatic synchronization, and no implicit initialization, and there is no user-facing `migrate` operation at all. See record D11.
- Incremental synchronization MUST be narrow automatic maintenance for directly affected concepts, declared review dependencies, and mechanical derivatives during ordinary work, and it MUST NOT carry the manual gate that applies to `init`, `migrate`, and `compact`. (#5, #6) [precedence: #6 over #5]
- Diff-scoped synchronization MUST be explicit pre-PR reconciliation over the current diff and its declared knowledge scope. (#6)
- Full-project synchronization MUST be explicit and manual. (#6)
- `okf-review` MUST own trust tiers and review baselines, and MUST read, validate, and report guard state, but MUST NOT confirm, self-approve, or execute the reviewed operation. (#5, #6, #29, #38) [precedence: #38 over #5]
- A review task kind MUST read, validate, and report, and MUST NOT mutate the reviewed subject as a side effect. (#6)

#### Shared runtime modules

- `scripts/lib/` MUST contain pure-function shared modules. (#5)
- `scripts/lib/` MUST NOT contain skills. (#5)
- Shared runtime modules MUST own shared admission, validation, and lifecycle behavior. The manual-operation guard is retained design for a later guarded release. (#4, #35, #43)
- The `v0.1.0` shared modules with a fixed public interface MUST be `protocol.js`, `runtime.js`, `admission.js`, `validation.js`, and `lifecycle.js`; other modules under `scripts/lib/` are internal to them. `scripts/lib/guard.js` MUST NOT ship. (#42, #43, #41)
- Harness adapters MUST NOT duplicate or reimplement shared runtime semantics. (#4, #35)
- A harness adapter MUST NOT contain independent authority or retrieval semantics. Guard semantics are retained design for a later guarded release. (#35, #43)
- The previously planned shared retrieval runtime MUST NOT be implemented; LLM-guided native navigation replaces it. (#5, #36) [precedence: #36 over #5]

#### Dependencies

- The shipped runtime MUST have zero dependencies beyond the Node.js standard library. (#5)
- A `package.json` MUST NOT be required to install or run the suite. (#5)
- The suite MUST NOT add a third-party YAML dependency. (#5)

#### Delivery shape

- Runtime delivery MUST be library-only. (#5)
- Each skill MUST have one thin wrapper script under `scripts/` that imports the shared library. (#5)
- The suite MUST NOT ship a CLI binary. (#5)
- The suite MUST NOT publish an npm package. (#5)

#### Installation and release artifacts

- The base install MUST install the four skills, the router, and the wrapper scripts with exactly `npx skills add 'artemVeduta/okf-agent-skills#v0.1.0'`. (#4, #5)
- The installation reference MUST use the `#ref` Git-ref syntax of the skills CLI. (#4)
- `@value` MUST be treated as a skill filter, not as a Git ref. (#4)
- In default symlink mode the canonical stores MUST be the project `.agents/skills/` store and the global `~/.agents/skills/` store. (#4)
- Agent-specific links MUST be created only where a harness requires them. (#4)
- The skills CLI native-path table MUST NOT be confused with its canonical-store installation shortcut. (#4)
- The release MUST use one Git tag, `v0.1.0`. (#5)
- The release MUST NOT use changelog automation or produce sub-artifacts. (#5)
- The release MUST also provide three thin, separately installable native adapters for Claude Code, Codex, and OpenCode from the same tag. (#35)
- The release MUST ship one canonical `agents/` source folder alongside `skills/`, containing the inert `okf-reader` and `okf-writer` definitions. (#35, #38)
- `okf-reader` MUST declare `use skill /okf-read`. (#38)
- `okf-writer` MUST declare `use skill /okf-write`. (#38)
- Agent definitions MUST be inert release artifacts, and registration MUST NOT grant permission, trust, authority, approval, or write ownership. (#35, #38)
- Exact compatible suite versions MUST be required, and a missing, partial, or mismatched installation MUST fail closed for OKF behavior. (#35)
- Adapter install, disablement, and uninstall MUST be harness-local. (#35)
- Adapter install, disablement, and uninstall MUST NOT alter markers, OKF content, manifests, guard state, project files, or other adapters. (#35)
- A native adapter MUST configure only native registration, shared skill and runtime wiring, and the supported orientation seam. (#5, #35) [precedence: #35 over #5]
- A native adapter MUST NOT grant write permissions, trust hooks, initialize guard state, create project files, or generate workspace configuration. (#5, #35) [precedence: #35 over #5]
- Base-install harness integration beyond adapter defaults MUST remain manual and documented in the README. (#5)
- Per-project opt-in MUST use the `.okf-active` marker. (#5, #35)
- OpenCode skill-directory symlink following MAY be relied upon only after installation fixtures test the exact project and global layout this repository uses. (#18)
- OpenCode symlink behavior MUST NOT be generalized to broken or cyclic links, links escaping trusted roots, sibling repositories, or future versions. (#18)

#### Adapter invocation and results

- A harness adapter MUST execute the skill wrapper script and read its stdout. (#5)
- A harness adapter MUST invoke the shared runtime. (#35)
- Adapters MUST preserve semantic parity: equal shared-runtime decisions and safety outcomes with different native triggers, configuration, and presentation. (#4, #35)
- Adapters MUST NOT claim identical native behavior or unsupported feature parity. (#4, #35)
- Adapters MUST fail closed when a required safeguard is unavailable. (#26)
- Adapters MUST NOT claim a control that was not verified. (#26)
- Automatic hooks and orientation seams MUST remain read-only. (#35)
- Every bounded `v0.1.0` mutation MUST require explicit user intent, regardless of native invocation controls. The shared manual-operation guard is retained design for a later guarded release. (#35, #43)

#### Shared skill source versus harness adapters

- The Agent Skills directory format MUST be treated as the shared source format for Claude Code, OpenAI Codex, and OpenCode. (#4)
- The shared source format MUST NOT be treated as evidence of identical harness behavior. (#4)
- The portable core MUST be `SKILL.md` with the standard required metadata plus its referenced files and scripts. (#4)
- Discovery locations, hooks, subagents, permissions, invocation policy, configuration trust, and loading semantics MUST be treated as harness adapters. (#4)
- Claude Code adapters MAY use `disable-model-invocation`. (#4)
- Codex adapters MUST express implicit invocation through `agents/openai.yaml` and its `allow_implicit_invocation` field. (#4)
- Codex `allowed-tools` support MUST be treated as unverified, and the field's presence in the generic specification MUST NOT be treated as evidence that Codex enforces it. (#4)
- Codex hooks MUST NOT be scoped to an active skill, so per-skill lifecycle behavior MUST use deterministic in-skill steps, an acceptably broad project or plugin hook, or another approved adapter. (#16)
- OpenCode MUST NOT be expected to recognize a `disable-model-invocation` frontmatter key, because it ignores unknown frontmatter keys. (#4, #17)
- OpenCode adapters MUST use per-skill `permission.skill: deny` to prevent model-driven skill-tool invocation. (#39)
- OpenCode adapters MUST keep required skill metadata present, and an omitted `description` MUST NOT be the explicit-only policy. (#17, #39) [precedence: #39 over #17]
- Native `/okf-*` commands MUST remain the explicit OpenCode entry path. (#39)
- A native command MUST be treated as a request, and it MUST NOT be treated as approval, authority, or proof that mutation is safe. (#39)
- Mutation reached through the OpenCode prompt-injected command path MUST still pass the shared runtime and explicit-intent checks. Preview, approval, recovery, and guard gates are retained design for a later guarded release. (#35, #39, #43)

#### Authoring contract: governing objective

- Predictability MUST be the governing authoring objective: for the same class of request, the agent MUST follow the same intended process and safety gates. (#26)
- Predictability MUST NOT require identical prose, files, or other output when the input differs. (#26)
- Every authoring choice MUST be judged by whether it improves that repeatable process or protects an explicit OKF invariant. (#26)

#### Authoring contract: evidence classification

The following classification governs adoption. (#26)

| Evidence | Status and use |
| --- | --- |
| Current OKF specification and accepted OKF suite decisions | Normative for OKF semantics and suite policy. |
| Current, verified first-party harness documentation or source | Normative only for the corresponding harness adapter fact. It does not establish cross-harness parity. |
| Matt Pocock's pinned `writing-great-skills` source | The primary authoring reference. Its adopted principles are normative for this suite only where this resolution explicitly adopts them. |
| The verified transcript of "Building Great Agent Skills: The Missing Manual" | Advisory rationale, vocabulary, and examples. It is not independent corroboration and does not create product policy by itself. |
| Earlier OKF research notes and local experiments | Evidence and hypotheses until an accepted repository decision promotes a finding. |
| `CONTEXT.md` | Canonical domain vocabulary. It is not an implementation specification or automatic authoring policy. |

- Current OKF decisions MUST govern OKF behavior when sources conflict. (#26)
- Current first-party evidence MUST govern adapter facts only. (#26)
- This adopted contract MUST govern the suite's authoring policy. (#26)
- A changed source or harness fact MUST trigger review, and it MUST NOT silently mutate the contract. (#26)
- Unsupported parity claims, duplicated policy, and rules placed outside their destination MUST be rejected. (#26)
- The transcript captured for the authoring talk MUST be treated as advisory rationale, vocabulary, and examples, and it MUST NOT create product policy by itself. (#25, #26)
- `CONTEXT.md` MUST be treated as canonical domain vocabulary, and it MUST NOT be treated as an implementation specification or automatic authoring policy. (#26)

#### Authoring contract: invocation and loads

- Every skill MUST have an explicit invocation design. (#26)
- Model invocation MUST be used only when the agent or another skill must reach the skill autonomously. (#26)
- User invocation MUST be used when human intent or approval is essential, especially for destructive, broad, migratory, or otherwise consequential operations. (#26)
- Context load MUST be treated as the model-facing cost of exposing invocation descriptions. (#26)
- Cognitive load MUST be treated as the human-facing cost of remembering user-invoked skills. (#26)
- Context load and cognitive load MUST be used as design tradeoffs, and they MUST NOT be turned into universal numeric budgets. (#26)
- Invocation intent MUST be portable, and its enforcement MUST be translated separately for Claude Code, Codex, and OpenCode. (#26)
- A skill MUST NOT be classified as manual-only merely because one harness ignores a particular frontmatter field. (#26)

#### Authoring contract: descriptions and frontmatter

- Portable frontmatter MUST be limited to shared, verified Agent Skills metadata. (#26)
- `name` and `description`, including their standard constraints, MUST be treated as portable contract fields. (#26)
- An optional frontmatter field MAY be treated as portable only when the target capability matrix verifies it. (#26)
- A description MUST state the capability in third-person language. (#26)
- A description MUST remain concise routing metadata. (#26)
- A model-invoked description MUST front-load the leading word. (#26)
- A model-invoked description MUST state each genuinely distinct trigger branch once. (#26)
- A description MUST add a reach clause only when another skill must invoke the skill. (#26)
- A user-invoked description MUST be human-facing, and it MUST NOT pretend to control model routing. (#26)
- A description MUST NOT repeat the procedure, identity, or reference material. (#26)
- Synonyms that rename one branch MUST NOT be counted as separate trigger branches. (#26)
- `disable-model-invocation`, `context: fork`, hooks, and execution restrictions MUST be treated as Claude Code adapter concerns. (#26)
- `agents/openai.yaml` MUST be treated as a Codex adapter concern. (#26)
- OpenCode permissions and plugins MUST be treated as OpenCode adapter concerns. (#26)
- The presence of `allowed-tools`, or of any other generic field, MUST NOT be treated as evidence that every host enforces it. (#26)
- Harness-only fields MUST be kept in adapters, and they MUST NOT be treated as universal. (#26)

#### Authoring contract: boundaries and granularity

- A skill MUST describe one coherent job. (#26)
- A skill boundary MUST be earned by an independent leading word or invocation trigger, a meaningful branch with distinct references or safeguards, or a sequence boundary that prevents an observed premature-completion failure. (#26)
- A skill MUST NOT be split merely to mirror code modules, to reduce line count, or to satisfy a harness directory layout. (#26)
- Unrelated jobs MUST NOT be hidden in a generic monolith. (#26)
- The authoring contract MUST be used to judge the suite inventory, and it MUST NOT be used to choose that inventory. (#26)

#### Authoring contract: steps, reference, and disclosure

- Steps MUST be the ordered work the agent must perform. (#26)
- Reference MUST be the definitions, rules, facts, or examples consulted during that work. (#26)
- A skill MAY be all steps, all reference, or both. (#26)
- Facts MUST NOT be disguised as procedural steps. (#26)
- Progressive disclosure MUST be applied at the shallowest useful level. (#26)
- Metadata MUST support discovery and invocation. (#26)
- `SKILL.md` MUST contain the universal steps, completion gates, and essential rules. (#26)
- Branch-specific or on-demand material MUST be placed in one-level-deep references, scripts, or assets. (#26)
- Material that every branch needs MUST remain inline. (#26)
- Material used by only some branches MUST sit behind an explicit context pointer. (#26)
- A context pointer MUST state when and why to load its target. (#26)
- Related definitions, rules, and caveats SHOULD remain co-located. (#26)
- Pointer chains MUST remain shallow. (#26)
- Material required by every branch MUST NOT be hidden merely to shorten a file. (#26)

#### Authoring contract: leading words

- Leading words MUST be treated as compact behavioral anchors and shared vocabulary. (#26)
- Leading words SHOULD reuse existing OKF, repository, and harness terms instead of invented jargon. (#26)
- A leading word MUST be advisory by default. (#26)
- A leading word MUST become normative only when the repository defines its semantics and verifies them. (#26)
- A leading word MUST NOT replace an explicit safeguard or completion criterion for risky work. (#26)

#### Authoring contract: completion, legwork, and sequence

- Every procedural step MUST end with a checkable completion criterion. (#26)
- A completion criterion MUST state observable evidence for done and for not-done. (#26)
- A completion criterion MUST name evidence rather than aspiration. (#26)
- A completion criterion MUST be exhaustive whenever a bounded scope or safety obligation makes an omission dangerous, such as every modified concept, every affected link, or each failed check. (#26)
- Open-ended work MUST carry an explicit bounded stopping condition instead of a false exhaustive claim. (#26)
- When an agent rushes, the author MUST first strengthen the current completion criterion. (#26)
- The author MUST then add the required legwork and evidence to that criterion. (#26)
- The author MUST split the sequence only when the rush remains an observed, irreducible problem. (#26)
- Legwork and premature completion MUST be used as shared review vocabulary. (#26)
- Hiding future steps MUST be evidence-driven, MUST NOT be a default, and MUST NOT conceal information the current step genuinely needs. (#26)

#### Authoring contract: pruning

- Pruning MUST be treated as a normative review gate. (#26)
- Each meaning MUST have exactly one authoritative source. (#26)
- Stale or irrelevant sediment MUST be removed rather than layered over. (#26)
- Genuine sprawl MUST be addressed through disclosure or a justified boundary. (#26)
- A no-op sentence MUST be deleted when it does not change model behavior, rather than cosmetically shortened. (#26)
- Positive target behavior SHOULD be preferred over negation. (#26)
- An unavoidable hard prohibition MUST be paired with the action that should happen instead. (#26)

#### Authoring contract: harness translation

- Adapters MUST translate invocation, discovery, permissions, hooks, subagents, installation, and unsupported-capability behavior. (#26)
- Adapters MUST preserve the portable intent of the shared skill source. (#26)
- Adapters MUST fail closed where a required safeguard is unavailable. (#26)
- Adapters MUST NOT claim a control that was not verified. (#26)

#### Authoring contract: test classes and release gate

- Static tests MUST cover metadata, names, descriptions, links, layout, and known policy boundaries. (#26)
- Fixture tests MUST cover bounded workflow states, safety gates, reports, and failure handling. (#26)
- Capability tests MUST cover each adapter only against verified behavior. (#26)
- Model evaluation MUST use scenarios and evidence, and it MUST NOT use exact prose matching. (#26)
- CI MUST gate the release with `node --test` and deterministic fixture-based contract tests. (#5, #26)
- Live cross-harness process acceptance tests MUST be deferred to `v0.2.0`. (#5, #26, #38)
- The implementation work MUST apply this authoring contract as the single source of truth for invocation, granularity, descriptions, information hierarchy, completion criteria, pruning, harness translation, tests, and review. (#9, #26)
- Every skill MUST be verified against its fixtures and deterministic contract tests before it is treated as complete. (#9)

#### Authoring contract: review obligations

- Independent reviewers MUST trace every normative rule from source and status through scope, implementation consequence, verification, and failure or unsupported behavior. (#26)
- Reviewers MUST inspect the actual files and tests for drift, duplication, sediment, no-ops, negation, vague criteria, and false parity. (#26)

#### Authoring contract: limits

- The authoring contract MUST NOT be read as choosing the final skill count, the exact runtime, hook installation, session-start injection, numeric context thresholds, the migration state model, or the release sequence. (#26)
- A file under `docs/research/` MUST be treated as evidence, and it MUST NOT be treated as policy. (#26)
- A source link MUST be treated as an evidence pointer, and the accepted policy MUST be the adopted resolution rather than a transcript, a research note, or a copied authoring skill. (#26)

### 9. Harness adapters, session entry, and delegated agents

#### Activation marker

- The activation marker MUST be a zero-byte regular file named `.okf-active`. (#35)
- The marker MUST sit at the Git worktree root. (#35)
- The marker MUST be a passive, project-local behavior selector. (#35)
- The marker MUST select only whether harness adapters provide automatic OKF behavior. (#35)
- Installation MUST NOT create or modify `.okf-active`. (#35)
- Session entry MUST NOT create or modify `.okf-active`. (#35)
- Marker creation MUST be a separate explicit setup action. (#35)
- `.okf-active` MUST NOT grant trust, authority, access, filesystem access, discovery authority, write ownership, foreign-write authority, approval, or permission. (#35, #37)
- A valid marker in a target worktree MUST NOT be treated as foreign-write authority. (#37)
- `.okf-workspace.json` MUST remain a separate user-authored workspace, bundle, federation, and routing manifest. (#35)
- `.okf-active` MUST remain activation-only and MUST NOT carry workspace, federation, or routing declarations. (#35)
- The guarded bundle-initialization flow MAY initialize an admitted bundle, and it MUST NOT manage harness hooks, permissions, agents, instruction blocks, workspace manifests, or adapter configuration. (#35)

#### Marker states and their behavior

- An absent marker MUST make automatic behavior a silent no-op. (#35, #36, #39)
- An absent marker MUST make an explicit read report `not-configured`. (#35, #36, #39)
- An absent marker MUST block mutation. (#35)
- A malformed marker MUST produce a diagnostic. (#35, #39)
- A malformed marker MUST leave OKF behavior inactive. (#35)
- A malformed marker MUST block mutation. (#35, #39)
- A valid marker with an admitted bundle MUST produce bounded orientation under ordinary shared-runtime policy. (#35)
- A valid marker MUST NOT remove the explicit guard requirement for mutation. (#35)

#### Cross-repository activation

- A cross-repository operation MUST require a valid `.okf-active` marker in both affected worktrees. (#37)
- A native adapter on the target side MAY be absent for a cross-repository operation. (#37)
- The invoking adapter MUST be present for a cross-repository operation. (#37)
- A compatible shared runtime MUST be present for a cross-repository operation. (#37)

#### Harness adapter scope

- Each release MUST provide thin native adapters for Claude Code, OpenAI Codex, and OpenCode from the same suite tag. (#35)
- The adapters MUST be separately installable from the portable base install. (#35)
- An adapter MAY own native registration, shared skill and runtime wiring, the supported orientation seam, presentation, admitted-bundle selection, and adapter capability settings. (#35)
- An adapter MUST invoke the shared runtime. (#35)
- An adapter MUST NOT contain independent authority, retrieval, or guard semantics. (#35)
- An adapter MUST NOT redefine shared authority, trust, access, discovery, write-ownership, approval, recovery, or mutation rules. (#35)
- An adapter MUST translate invocation, discovery, permissions, hooks, subagents, installation, and unsupported-capability behavior. (#26)
- An adapter MUST preserve the portable intent of the shared skills. (#26)
- An adapter MUST fail closed where a required safeguard is unavailable. (#26)
- An adapter MUST NOT claim a native control that was not verified for that harness. (#26)
- Exact compatible suite versions MUST be required across the base install and its adapters. (#35)
- A missing, partial, or mismatched installation MUST fail closed for OKF behavior. (#35)

#### Adapter defaults, configuration, and overrides

- Adapter defaults MUST be adapter-owned and read-only. (#35)
- An adapter MUST NOT silently grant write permissions. (#35)
- An adapter MUST NOT trust hooks on the user's behalf. (#35)
- An adapter MUST NOT initialize manual-operation guard state. (#5, #35) [precedence: #35 over #5]
- An adapter MUST NOT create project files during installation. (#5, #35) [precedence: #35 over #5]
- An adapter MUST NOT generate workspace configuration during installation. (#5, #35) [precedence: #35 over #5]
- Optional helper isolation MUST be read-only. (#35)
- Optional helper isolation MUST be supplied only where the harness supports it. (#35)
- An adapter MUST NOT silently generate or authorize write-capable agents or project agent files. (#35, #38)
- User configuration MUST be namespaced. (#35)
- User configuration MUST be preserved across adapter updates. (#35)
- Local overrides MAY change presentation, admitted-bundle selection, and adapter capabilities only. (#35)
- Local overrides MUST NOT change authority, trust, ownership, guard, approval, discovery, or manual-operation rules. (#35)

#### Adapter installation, disablement, and removal

- Adapter installation, disablement, and removal MUST be harness-local. (#35)
- Adapter installation, disablement, and removal MUST NOT alter markers, OKF content, manifests, guard state, project files, or other adapters. (#35)
- The suite MUST ship the `okf-reader` and `okf-writer` agent definitions as reviewed release artifacts of the same tag as the skills. (#35, #38)
- Harness adapters MAY expose those agent definitions through thin native wrappers. (#35, #38)
- Agent registration MUST NOT invoke a writer, create `.okf-active`, create settings, or grant permission, trust, authority, approval, or write ownership. (#35, #38)

#### Semantic parity

- Semantic parity MUST mean agreement on shared runtime decisions and safety outcomes. (#35)
- Semantic parity MUST allow different native triggers, configuration, and presentation. (#35)
- An adapter MUST NOT claim identical native behavior. (#35)
- An adapter MUST NOT claim unsupported feature parity. (#35)
- An unsupported or unavailable native seam MUST be reported as degraded. (#35)
- An unsupported or unavailable native seam MUST NOT be presented as equivalent behavior. (#35)
- All harnesses MUST expose the same delegated roles, skill bindings, brief fields, guard requirements, receipt schema, and status values. (#38)
- Native transport and presentation MAY differ between harnesses. (#38)
- Capability tests MUST cover each adapter only against verified behavior. (#26)
- Verified first-party harness evidence MUST govern only the corresponding adapter fact. (#26)
- Verified first-party harness evidence MUST NOT establish cross-harness parity. (#26)

#### Automatic behavior ceiling

- Automatic hooks MUST remain read-only. (#35)
- Orientation seams MUST remain read-only. (#35)
- Every bounded `v0.1.0` mutation MUST require explicit user intent, regardless of native invocation controls. The shared manual-operation guard is retained design for a later guarded release. (#35, #43)
- Automatic orientation MUST be marker-gated on every harness. (#35)

#### Orientation context

- A supported session-entry seam MUST emit one fixed-schema, bounded, read-only orientation result. (#35, #36)
- The orientation MUST be emitted after activation and bundle-admission checks. (#36)
- The orientation schema MUST contain activation, current bundle identity, root index path, aggregate workspace health, and one next action. (#36)
- The orientation MUST carry exactly one next action. (#36)
- The orientation MUST NOT contain a full index. (#36)
- The orientation MUST NOT contain a concept body. (#36)
- The orientation MUST NOT infer task intent. (#35, #36)
- The orientation MUST NOT perform task-specific retrieval. (#35, #36)
- The orientation MUST NOT perform lifecycle maintenance. (#35, #36)
- The orientation MUST NOT initialize state. (#35)
- The orientation MUST NOT mutate OKF content. (#35, #36)
- The orientation MUST NOT create authority, approval, a delegation brief, or writer permission. (#39)
- The orientation MUST provide navigation and status only. (#36)
- An explicit read MUST start fresh. (#36)
- An explicit read MUST recheck the marker, the current routing, bundle admission, and the current files. (#36)

#### Fresh orientation for child contexts

- Each forked or delegated child context MUST receive a fresh read-only orientation. (#39)
- A child context MUST NOT inherit the parent orientation result. (#39)
- A child context MUST NOT suppress orientation. (#39)
- A child context MUST recheck activation, scope, routing, and bundle admission. (#39)
- A delegated writer child MUST still require explicit intent and the shared guard after its own orientation. (#39)

#### Orientation occurrence and at-most-once delivery

- The harness adapter MUST own the orientation occurrence key. (#39)
- The occurrence key MUST contain the harness, the repository instance, the context ID, the logical cause, and the native event ID when one exists. (#39)
- The adapter MUST claim an occurrence before dispatch. (#39)
- Orientation delivery MUST be at-most-once for one occurrence. (#39)
- Duplicate native signals MUST NOT emit a second orientation for one occurrence. (#39)
- Repeated system transforms MUST NOT emit a second orientation for one occurrence. (#39)
- A later native event carrying a new native event ID MAY form a new occurrence and emit another orientation. (#39)
- A failed or unavailable claimed attempt MUST be reported. (#39)
- A failed or unavailable claimed attempt MUST NOT be replayed automatically. (#39)
- Occurrence state MUST remain separate from OKF content. (#39)
- Occurrence state MUST remain separate from the manual-operation guard ledger. (#39)
- An occurrence identity MUST NOT grant authority or approval. (#39, CONTEXT.md)
- An orientation occurrence MUST remain distinct from a native harness event, a prompt, and a manual-operation occurrence. (#39, CONTEXT.md)

#### Session-entry seam — Claude Code

- The Claude Code adapter MUST use a marker-gated `SessionStart` hook inside a native plugin bundle. (#35)
- The Claude Code adapter MUST treat `SessionStart(source=startup|resume|clear|compact)` as the orientation seam. (#35, #39)
- The Claude Code adapter MUST use `SessionStart(source=fork)` for a forked session. (#39)

#### Session-entry seam — OpenAI Codex

- The Codex adapter MUST use a marker-gated `SessionStart` hook inside a native plugin bundle. (#35)
- The Codex adapter MUST treat `SessionStart(source=startup|resume|clear|compact)` as the orientation seam. (#35, #39)
- The Codex adapter MUST use `SubagentStart` to identify a child context. (#39)
- The Codex adapter MUST NOT infer `fork` when Codex supplies no fork signal. (#39)
- Codex hook trust MUST remain user-controlled. (#35)
- After Codex compaction, `SessionStart(source=compact)` MUST emit one orientation before the next model request. (#39)

#### Session-entry seam — OpenCode

- The OpenCode adapter MUST treat `session.created` and `session.compacted` as lifecycle signals only. (#39)
- The OpenCode adapter MUST NOT use `session.created` or `session.compacted` to inject orientation. (#39)
- The OpenCode adapter MUST NOT use `session.created` or `session.compacted` to prove startup, resume, clear, compact, or fork mode. (#39)
- The OpenCode adapter MUST use the awaited `experimental.chat.system.transform` as the only automatic orientation injection seam. (#35, #39) [precedence: #39 over #35]
- The OpenCode adapter MUST create an adapter generation from a lifecycle signal. (#39)
- The next eligible system transform MUST claim that adapter generation. (#39)
- A failed OpenCode transform MUST leave that generation degraded. (#39)
- A failed OpenCode transform MUST NOT be retried automatically. (#39)
- The OpenCode adapter MAY use `experimental.session.compacting` to change the compaction prompt. (#39)
- The OpenCode adapter MUST NOT treat `experimental.session.compacting` as an orientation seam. (#39)
- Fire-and-forget session events MUST NOT be treated as reliable startup injection. (#35)

#### Adjacent seams that never re-emit

- `PreCompact`, `PostCompact`, `SessionEnd`, ordinary prompts, and fire-and-forget event callbacks MUST NOT emit a second orientation. (#39)

#### OpenCode explicit entry

- Automatic orientation MUST remain outside the OpenCode skill-command path. (#39)
- Native `/okf-*` commands MUST remain the explicit OpenCode entry path. (#39)
- The OpenCode adapter MUST use per-skill `permission.skill: deny` to prevent model-driven skill-tool invocation. (#17, #39) [precedence: #39 over #17]
- Required skill metadata MUST remain present on OpenCode. (#39)
- An omitted `description` MUST NOT be the explicit-only policy. (#17, #39) [precedence: #39 over #17]
- A command MUST be treated as a request, and MUST NOT be treated as approval, authority, or proof that mutation is safe. (#39)
- Mutation reached through the OpenCode command path MUST still pass the shared runtime, explicit intent, complete preview, confirmation, approval, recovery, and guard checks. (#35, #39)

#### Orientation results

- The adapter MUST support exactly the results `not-configured`, `invalid`, `unavailable`, `degraded`, `failed`, and `clean`. (#39)

| Result | Meaning | Required behavior |
| --- | --- | --- |
| `not-configured` | `.okf-active` is absent. | Automatic behavior is silent; an explicit read reports `not-configured`. |
| `invalid` | The marker, adapter contract, or required configuration is malformed. | Emit a diagnostic, emit no orientation, and block mutation. |
| `unavailable` | The bundle, runtime, or required admission evidence cannot be read. | Emit a diagnostic, emit no orientation, and block mutation. |
| `degraded` | The seam is unsupported or untrusted, or the logical cause is unobservable. | Continue the host session without claiming clean orientation, and block mutation. |
| `failed` | An accepted seam was invoked but orientation dispatch failed. | Report the failure, do not retry the claimed occurrence, and block mutation. |
| `clean` | Activation, admission, scope, runtime, and injection all pass. | Emit the orientation result. |

- A non-clean orientation result MUST NOT claim clean evidence. (#39)
- A non-clean orientation result MUST NOT permit mutation. (#39)
- The host session MUST continue for a non-clean orientation result. (#35, #39)
- A failure path MUST NOT perform repair. (#35)
- A failure path MUST NOT report unavailable evidence as clean. (#35)

#### Delegation contract

- Delegation MUST be an explicit choice by the main session to assign bounded work to a separate agent under a delegation brief. (#38, CONTEXT.md)
- Delegation MUST change execution placement only. (#38)
- Delegation MUST be a required capability of every supported harness. (#38)
- The main session MUST create the selected agent directly. (#38)
- The main session MUST resolve the effective settings, classify the operation, and own the user-facing request. (#38)
- Creating a writer MUST NOT be treated as approval. (#38)
- Writer execution MUST be synchronous from the main session's view. (#38)
- A later user request MUST NOT change an active brief, and MUST start a new operation instead. (#38)

#### Execution placement

- Placement MUST follow this table. (#38)

| Work | Default | Delegated role | Rule |
| --- | --- | --- | --- |
| Orientation and small read-only work | `inline` | none for automatic hooks | Automatic hooks remain bounded and read-only. |
| Explicit read-only retrieval or analysis | `inline` | `okf-reader` | Delegation is allowed when the effective preference and brief select it. |
| Explicit bounded OKF write | `delegated` | `okf-writer` | Inline execution remains available when the effective preference explicitly selects it. |
| Lifecycle, migration, compaction, archive, merge, split, relocation, delete, and other broad operations | separate manual flow | not covered by this writer contract | Existing preview, approval, recovery, guard, and reconciliation rules apply. |

#### Delegated agent roles

- `okf-reader` MUST be restricted to admitted read and search work. (#38, CONTEXT.md)
- `okf-reader` MUST NOT mutate OKF content. (#38)
- `okf-reader` MUST declare `use skill /okf-read`. (#38)
- `okf-writer` MUST be the only write-capable delegated role. (#38)
- `okf-writer` MUST declare `use skill /okf-write`. (#38)
- `okf-writer` MUST be a leaf agent. (#38)
- `okf-writer` MUST NOT create another agent. (#38)
- Each agent MUST declare an explicit tool allowlist. (#38)
- The reader's allowlist MUST contain native read and search tools only. (#38)
- The writer's allowlist MUST contain native read and search tools plus the shared write runner. (#38, #43)
- Neither role MUST have raw file-write, Git-history, network, or nested-agent authority by default. (#38)
- Agent definitions MUST be inert release artifacts until explicit use. (#38)
- A transient delegated read failure MAY fall back to the same bounded read inline with a `degraded` disclosure. (#38)
- That inline fallback MUST NOT be treated as an authority or capability fallback. (#38)

#### Delegation brief

- Every delegated operation MUST carry an immutable delegation brief created by the main session. (#38)
- The brief MUST contain the task kind, the operation class, the exact target bundle and paths, the allowed effects, the forbidden effects, the observed evidence, the required approval and guard checks, the effective settings, and the expected result. (#38)
- The brief MUST be treated as a request and constraint set. (#38)
- The brief MUST NOT be treated as approval or authority. (#38)
- The handoff MUST carry the effective brief, admitted scope, target identities, observed evidence, settings, required gates, and receipt format. (#38)
- The handoff MUST NOT carry the full conversation history. (#38)
- Rule precedence MUST follow this order, from #38:

```text
shared safety and authority rules > shipped agent rules > per-call delegation brief
```

- A brief MAY narrow shipped rules. (#38)
- A brief MUST NOT widen scope, remove a check, or authorize a forbidden effect. (#38)
- A delegated agent MUST NOT guess when brief instructions are missing, ambiguous, or conflicting. (#38)

#### Writer preflight and write authority

- The writer MUST recheck the marker, routing, admission, target identity, current content, evidence, and operation class before execution. Guard-state checks are retained design for a later guarded release. (#38, #43)
- The writer MUST verify the operation class and MUST block a mismatch. (#38)
- The writer MUST NOT downgrade a broad effect to a bounded update. (#38)
- Every bounded `v0.1.0` mutation MUST use the shared `okf-write` runtime. (#38, #43)
- Native tools MUST NOT replace the shared write path. (#38, #43)
- The writer MAY read admitted files and source evidence. (#38)
- The writer MUST write only approved OKF targets and allowed derived artifacts. (#38)
- The writer MUST NOT edit source code, commit, push, reset, stash, switch branches, or change unrelated files. (#38)
- The writer MUST operate in the exact repository instance and worktree named by the brief. (#38)
- The one-active-guarded-writer rule is retained design for a later guarded release. (#38, #43)
- Parallel guarded writer operations are retained design for a later guarded release. (#38, #43)
- A cross-repository write MUST require exact pre-existing target-side foreign-write authority for the named source instance, target bundle, and effects. (#38, #37)
- Delegation MUST NOT create or widen foreign-write authority. (#38)
- The main session or the user MUST own approval. (#38)
- A writer MAY prepare a complete preview and verify approval. (#38)
- A writer MUST NOT self-approve. (#38)
- Preview, approval, and execution MUST remain bound to one operation identity, one bundle epoch, and one guard generation. (#38)
- A new writer, a session boundary, a target change, or preview drift MUST require a fresh plan and a fresh approval. (#38)
- Model-initiated work MAY read or prepare a preview, and mutation MUST still require explicit user intent and the applicable approval and guard gates. (#38)

#### Delegation receipt and outcomes

- The writer MUST return a structured delegation receipt. (#38)
- The receipt MUST contain status, operation identity, target identity, requested effects, actual effects, observed evidence, validation result, residue, and next action. (#38)
- The receipt MUST NOT replace the sealed operation manifest or the observation journal. (#38)
- The main session MUST validate the receipt and the required post-operation checks before reporting success. (#38)
- Process completion alone MUST NOT be reported as success. (#38)
- The main session MUST report an exact outcome such as `clean`, `failed`, `partially-applied`, or `indeterminate`. (#38)
- Failure conditions MUST map to these statuses, from #38:

| Condition | Status |
| --- | --- |
| Missing required skill | `blocked: missing-skill` |
| Incompatible required skill | `blocked: incompatible-skill` |
| Missing or invalid brief | `blocked: incomplete-brief` |
| Conflicting rules | `blocked: conflicting-rules` |
| Target or evidence drift | `blocked: stale-handoff` or `blocked: target-conflict` |
| Repository instance mismatch | `blocked: repository-instance-mismatch` |
| Missing foreign-write authority | `blocked: missing-foreign-write-authority` |
| Writer timeout, crash, or interruption | `indeterminate` |
| Partial effects | `partially-applied` or `indeterminate` |

- A writer timeout, crash, or interruption MUST NOT trigger an automatic write retry. (#38)
- Reconciliation after a partial or indeterminate result MUST be a fresh guarded operation. (#38)

#### Execution preferences and settings

- Eligible reads and bounded writes MUST support `inline` and `delegated` execution. (#38)
- Both preferences MUST use this enum, from #38:

```yaml
read_execution: inline | delegated
write_execution: inline | delegated
```

- The default `read_execution` value MUST be `inline`. (#38)
- The default `write_execution` value MUST be `delegated`. (#38)
- A delegated read MUST use `okf-reader`. (#38)
- A delegated write MUST use `okf-writer`. (#38)
- A missing or mismatched agent installation MUST be reported as an adapter or installation failure. (#38)
- A missing or mismatched agent installation MUST NOT become a silent normal fallback mode. (#38)
- Settings MUST control execution preferences only. (#38)
- Settings MUST NOT alter project mode, trust, access, admission, authority, approval, recovery, guard behavior, automatic-hook read-only behavior, or the automatic-write ceiling. (#38)
- Settings precedence MUST follow this order, from #38:

```text
adapter defaults < user/global settings < project/worktree settings < current-session override
```

- A current-session override MUST expire at session end. (#38)
- `.okf-active` and `.okf-workspace.json` MUST remain outside this settings hierarchy. (#38)
- Settings MUST be user-authored. (#38)
- The suite MUST read and validate settings. (#38)
- The suite MUST NOT create, repair, normalize, or rewrite settings. (#38)
- An invalid or unknown setting value MUST produce a diagnostic. (#38)
- An invalid or unknown setting value MUST fall back to the next valid lower-precedence value or to the adapter default. (#38)
- An invalid writer selection MUST NOT silently start a different writer. (#38)
- An explicit write MUST select a valid execution path. (#38)

#### What delegation does not change

- Delegation MUST NOT change project mode. (#38)
- Delegation MUST NOT change bundle admission. (#38)
- Delegation MUST NOT change trust. (#38)
- Delegation MUST NOT change access. (#38)
- Delegation MUST NOT change write authority. (#38)
- Delegation MUST NOT change approval. (#38)
- Delegation MUST NOT change recovery requirements. (#38)
- Delegation MUST NOT change `.okf-active`. (#38)
- Delegation MUST NOT change `.okf-workspace.json`. (#38)
- Delegation MUST NOT change the automatic-write ceiling. (#38)
- Delegation MUST NOT change the retained-design manual-operation guard. (#38, #43)

#### Harness capability facts and their adapter consequences

- Codex hook event inputs and matcher fields MUST be treated as exposing no active-skill name. (#16)
- Codex skill metadata MUST be treated as embedding no hook binding. (#16)
- A Codex adapter MUST NOT express "fire only while a named skill is active" through a hook. (#16)
- Per-skill lifecycle behavior on Codex MUST use deterministic in-skill steps, a project or plugin hook whose broader scope is acceptable, or another approved adapter. (#16)
- The corrected #16 capability fact MUST be treated as current, because no later issue retracts it. (#16)
- Codex hooks MAY be configured at user, trusted-project, and plugin scope, and that scoping MUST NOT be treated as skill binding. (#4, #16)
- Codex runtime support for `allowed-tools` MUST be treated as unverified. (#4)
- Claude Code MUST be treated as supporting `disable-model-invocation`. (#4)
- Codex MUST be treated as expressing implicit-invocation policy through `allow_implicit_invocation` in `agents/openai.yaml`. (#4)
- OpenCode MUST be treated as recognizing no frontmatter key literally named `disable-model-invocation`. (#17)
- OpenCode MUST be treated as silently ignoring unknown frontmatter keys. (#17)
- Writing a `disable-model-invocation` key for OpenCode MUST be treated as having no effect. (#17)
- OpenCode MUST be treated as registering every discovered skill as a slash command. (#17)
- The original #17 conclusion that OpenCode has no explicit-only equivalent MUST be treated as retracted and corrected. (#17)
- The #4 statement that OpenCode has no true `disable-model-invocation` equivalent MUST be treated as superseded. (#4, #17) [precedence: #17 over #4]
- `permission.skill: ask` MUST NOT be used as an explicit-only control. (#17)
- A global skill-tool disable MUST NOT be used where per-skill control is required. (#17)
- OpenCode command execution MUST be treated as prompt injection rather than a skill-tool call. (#17, #35)
- The skill-tool permission assertion MUST be treated as not evaluated on the OpenCode command path. (#17, #35)
- The `<skill_files>` listing MUST be treated as absent on the OpenCode command path. (#17)
- A destructive OpenCode operation MUST carry its own preview and approval step inside the operation. (#17, #35, #39)
- The optional `slash` frontmatter boolean MUST NOT be relied on. (#17)
- Current OpenCode source MUST be treated as following directory symlinks during skill discovery. (#18)
- An adapter MAY rely on that symlink behavior for the exact tested installation topology. (#18)
- Installation fixtures MUST test the exact project and global layout used by this repository. (#18)
- The symlink fact MUST NOT be generalized to broken or cyclic links, links that escape trusted roots, sibling-repository access, or future OpenCode versions. (#18)
- The original #18 conclusion MUST be treated as corrected and narrowed, and the corrected fact MUST be treated as current. (#18)
- A skill MUST NOT be classified as manual-only merely because a harness ignores a frontmatter field. (#26)

#### Acceptance evidence

- `v0.1.0` MUST include deterministic wrapper-seam fixtures for inline and delegated reads, inline and delegated writes, role and tool allowlists, skill binding, brief precedence, incomplete and conflicting briefs, operation-class mismatch, stale handoff, target drift, same-worktree checks, structured receipts, partial and indeterminate outcomes, settings precedence, invalid settings, and semantic parity across all three native wrappers. Adapter fixtures are the release gate; a real harness is exercised manually for dogfooding and publish, not as a CI process test. (#38, #66, #5, #26, #10, #15)
- Live cross-harness process tests MUST remain deferred to `v0.2.0`. (#38)

### 10. The operation map

#### Atomic operation map

The table uses `A` for allowed, `N` for notice, `P` for occurrence-bound preview and approval, `R` for verified recovery required, and `B` for blocked. `U`, `M`, and `H` are the target concept's pre-operation trust tiers: unverified, machine-confirmed, and human-reviewed. (#11)

| Atomic effect | Owning skill | Shared runtime responsibility | Invocation class | Code-backed U | Code-backed M | Code-backed H | Knowledge-only U | Knowledge-only M | Knowledge-only H |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| Read, validate, or read-only analysis | `okf-read` | Bundle admission, native navigation, and validation | Not assigned | A | A | A | A | A | A |
| Create a small evidence-backed concept | `okf-write` | Evidence, mode, ownership, and semantic-preservation validation | Not assigned | N | N | N | N | N | N |
| Small evidence-backed claim update | `okf-write` | Evidence, mode, ownership, and semantic-preservation validation | Not assigned | N | N | N | N | N | N |
| Small non-claim metadata or formatting update | `okf-write` | Semantic-preservation validation | Not assigned | N | N | N | N | N | N |
| Add qualifying machine verification | `okf-write` | Verification-evidence validation | Not assigned | N | N | N | N | N | N |
| Add machine verification without complete qualifying evidence | `okf-write` | Verification-evidence validation and fail-closed write checks | Not assigned | B | B | B | B | B | B |
| Record exact human verification | `okf-review` | Review-evidence and verifier-identity validation, then guarded write execution | User-invoked | P | P | P | P | P | P |
| Infer or fabricate human verification | `okf-review` | Verification validation and refusal reporting | Not assigned | B | B | B | B | B | B |
| Standalone removal of verification | `okf-review` | Verification-event validation and write checks | User-invoked | A | P | P | A | P | P |
| Derive or display current staleness | `okf-review` | Review-dependency observation and staleness evaluation | Not assigned | A | A | A | A | A | A |
| Set `stale_after` from explicit evidence | `okf-review` | Evidence validation and write checks | Not assigned | N | N | N | N | N | N |
| Choose or change `stale_after` by judgment | `okf-review` | Review policy, preview, approval, and guarded write checks | User-invoked | P | P | P | P | P | P |
| `draft -> stable` | `okf-write` | Status validation, preview, approval, and guarded write checks | User-invoked | P | P | P | P | P | P |
| `stable -> deprecated` | `okf-write` | Status validation, preview, approval, and guarded write checks | User-invoked | P | P | P | P | P | P |
| `deprecated -> stable` | `okf-write` | Status validation, preview, approval, and guarded write checks | User-invoked | P | P | P | P | P | P |
| Write an unsupported status value | `okf-write` | OKF validation and fail-closed write checks | Not assigned | B | B | B | B | B | B |
| Add or remove one semantic relationship | `okf-write` | Relationship validation and write checks | Not assigned | N | N | N | N | N | N |
| Move or rename | `okf-write` | Identity, link, recovery, operation-manifest, journal, and guarded write checks | User-invoked | P+R | P+R | P+R | P+R | P+R | P+R |
| Broad inbound-link or graph rewrite | `okf-write` | Link, identity, recovery, operation-manifest, journal, and guarded write checks | User-invoked | P+R | P+R | P+R | P+R | P+R | P+R |
| Create merge or split outputs | `okf-write` | Restructuring, provenance, identity, recovery, operation-manifest, journal, and guarded write checks | User-invoked | P+R | P+R | P+R | P+R | P+R | P+R |
| Delete a demonstrably redundant concept | `okf-write` | Mode, supersession, unique-context, recovery, operation-manifest, journal, and guarded write checks | User-invoked | Conditional P+R | Conditional P+R | Conditional P+R | B | B | B |
| Purge unique durable knowledge | `okf-write` | Destructive-operation validation and refusal reporting | User-invoked | B | B | B | B | B | B |
| Introduce redirects or aliases before their semantics are defined | `okf-write` | Plan validation and refusal reporting | User-invoked | B | B | B | B | B | B |
| Edit a sanctioned Attested Computation | `okf-write` | Attested Computation parameter and refusal validation | User-invoked | B | B | B | B | B | B |
| Regenerate a directly affected index | `okf-write` | Derived-artifact maintenance after accepted mutation | Inherited from parent | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome |
| Append a directly affected log entry | `okf-write` | Knowledge-change history append after accepted mutation | Inherited from parent | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome |
| Repair a directly affected mechanical link | `okf-write` | Derived link maintenance after accepted mutation | Inherited from parent | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome | Parent outcome |
| Standalone broad rebuild | `okf-lifecycle` | Broad-plan, preview, approval, recovery, and guarded execution checks | User-invoked | Broad modifier | Broad modifier | Broad modifier | Broad modifier | Broad modifier | Broad modifier |

#### Atomic-effect ownership (D7)

The runtime module is the same for every effect and is therefore stated once here rather than
repeated as a column: every atomic effect enters `scripts/lib/runtime.js`, which delegates
internally — routing and navigation for reads, validation for the write gates, and lifecycle for
synchronization and rebuild planning.

| Atomic effect | Owning skill | Invocation class |
|---|---|---|
| Read, validate, or read-only analysis | `okf-read` | Not assigned |
| Create a small evidence-backed concept | `okf-write` | Not assigned |
| Small evidence-backed claim update | `okf-write` | Not assigned |
| Small non-claim metadata or formatting update | `okf-write` | Not assigned |
| Add qualifying machine verification | `okf-write` | Not assigned |
| Add machine verification without complete qualifying evidence | `okf-write` | Not assigned |
| Record exact human verification | `okf-review` | User-invoked |
| Infer or fabricate human verification | `okf-review` | Not assigned |
| Standalone removal of verification | `okf-review` | User-invoked |
| Derive or display current staleness | `okf-review` | Not assigned |
| Set `stale_after` from explicit evidence | `okf-review` | Not assigned |
| Choose or change `stale_after` by judgment | `okf-review` | User-invoked |
| `draft -> stable` | `okf-write` | User-invoked |
| `stable -> deprecated` | `okf-write` | User-invoked |
| `deprecated -> stable` | `okf-write` | User-invoked |
| Write an unsupported status value | `okf-write` | Not assigned |
| Add or remove one semantic relationship | `okf-write` | Not assigned |
| Move or rename | `okf-write` | User-invoked |
| Broad inbound-link or graph rewrite | `okf-write` | User-invoked |
| Create merge or split outputs | `okf-write` | User-invoked |
| Delete a demonstrably redundant concept | `okf-write` | User-invoked |
| Purge unique durable knowledge | `okf-write` | User-invoked |
| Introduce redirects or aliases before their semantics are defined | `okf-write` | User-invoked |
| Edit a sanctioned Attested Computation | `okf-write` | User-invoked |
| Regenerate a directly affected index | `okf-write` | Inherited from parent |
| Append a directly affected log entry | `okf-write` | Inherited from parent |
| Repair a directly affected mechanical link | `okf-write` | Inherited from parent |
| Standalone broad rebuild | `okf-lifecycle` | User-invoked |

#### Post-write validation checks (D8)

These twelve checks are the primary-concept boundary `validation.postWrite` runs against the
saved concept immediately after a bounded write publishes it. They are narrower than the
post-operation checks named elsewhere in this specification (OKF conformance, suite checks,
identity, link, provenance, trust, and validation bound to the approved plan): this table
validates the primary concept only, not the later index and log derivative writes a composite
operation also performs.

Six of the twelve — Reserved bundle files, Required concept type, Source resource, Generated-by
value, Attested Computation runtime, and Human actor prefix — are defense-in-depth copies of the
same shared gates the pre-write path already runs before publication. The pre-write copy blocks a
normal invalid request before anything is written; the post-write copy stays in place as
defense-in-depth for a changed saved state.

| Check | Pass observation | Fail observation |
|---|---|---|
| Exact root declaration | No `ROOT_DECLARATION_NOT_EXACT` finding; the bundle-root `index.md` parses with `okf_version: "0.2"`. | A `ROOT_DECLARATION_NOT_EXACT` finding. |
| Project mode | No `PROJECT_MODE_INVALID` finding; the root declares `code-backed` or `knowledge-only`. | A `PROJECT_MODE_INVALID` finding. |
| Saved concept read | The saved concept exists and its frontmatter parses. | A `FRONTMATTER_UNPARSEABLE` finding. |
| Saved-tree comparison | When an expected tree is supplied, the saved tree is equal to it. | A `POST_WRITE_VALIDATION_FAILED` finding with `reason: "saved tree mismatch"`. |
| Reserved bundle files | Present `index.md` and `log.md` files parse. | A `BUNDLE_FILES_NONCONFORMING` finding. |
| Required concept type | The saved `type` is neither `undefined` nor `""`. | A `TYPE_MISSING` finding when `type` is `undefined` or `""`. |
| Source resource | Each truthy object in a `sources` array has a `resource` other than `undefined`, `null`, or `""`; a non-array `sources` value is ignored. | A `SOURCE_RESOURCE_MISSING` finding when such an entry has a `resource` of `undefined`, `null`, or `""`. |
| Generated-by value | Each truthy object in a `generated` array has a `by` value other than `undefined`, `null`, or `""`; a non-array `generated` value is ignored. | A `GENERATED_BY_MISSING` finding when such an entry has a `by` value of `undefined`, `null`, or `""`. |
| Attested Computation runtime | When `type` is exactly `"Attested Computation"`, `runtime` is not `undefined`, `null`, or `""`. | A `RUNTIME_MISSING` finding when `type` is exactly `"Attested Computation"` and `runtime` is `undefined`, `null`, or `""`. |
| Human actor prefix | Each non-empty string `author` or `confirmed` value, or array item, uses `human:` or a recognized non-human prefix; non-string values are ignored. | A `HUMAN_PREFIX_MISSING` finding for a non-empty string value without one of those prefixes. |
| Source link | Each source resource resolves inside the bundle to an existing file; a directory is not an existing file for this check. | An `UNRESOLVED_INTERNAL_LINK` warning; `valid` can remain `true`. |
| Upstream source | No readable source resource has a blocking concept finding. | A `DEPENDS_ON_BLOCKED_CONCEPT` finding. |

A check fail is that check's Validation Verdict, not itself the lifecycle result. The runtime
aggregates every reachable verdict into the write's lifecycle result and its `data.validation`
aggregate state:

| Reachable case | Lifecycle result | `data.validation` |
|---|---|---|
| Every post-write check passes. | `applied` | `valid` |
| A blocking post-write check fails after publication. | `failed/incomplete` | `failed` |
| A shared gate finds normal invalid input before publication (the pre-write copy of a defense-in-depth check). | `blocked` | `not-run` |
| Only the non-blocking Source link check fails. | `applied` | `valid` |

The exception handler around this boundary is error containment, not a thirteenth check: it has
no pass observation of its own, only the fail observation of an unexpected post-write error being
reported as `failed/incomplete` instead of crashing the process. It is not counted in the twelve
and carries no Validation Verdict.

#### Composite operation placement

- The `okf` router MUST dispatch each request to the owning skill in the table and MUST NOT implement a second authorization rule. (#5, #35)
- Router dispatch MUST select the owner only from the request's fixed `operation` field against the sealed operation table. An unrecognized operation MUST return the defined unknown-operation result. The `guard.prepare`, `guard.confirm`, and `guard.execute` operations MUST NOT be in the `v0.1.0` table. (#42, #43, #41)
- `okf-lifecycle` MUST own `init`, diff-scoped synchronization, full-project synchronization, migration, and compaction. (#5, #6, #19)
- Incremental synchronization MUST be automatic narrow maintenance for directly affected concepts, declared review dependencies, and mechanical derivatives during ordinary work, and MUST be owned by `okf-lifecycle` without the manual gate used by broad synchronization. (#5, #6) [precedence: #6 over #5]
- Diff-scoped synchronization MUST be explicit pre-PR reconciliation over the current diff and its declared knowledge scope. (#6)
- Full-project synchronization MUST be explicit, manual, broad, and recovery-gated. (#6, #11)
- Migration MUST be an explicitly requested manual `okf-lifecycle` operation and MUST NOT be automatic synchronization or implicit initialization. (#19)
- `init`, migration, and compaction MUST be user-invoked manual operations. (#5, #11, #19)
- `archive`, `merge`, and `split` MUST route through `okf-write` for their atomic mutations, while `okf-lifecycle` MAY route their lifecycle request to that write operation. (#5, #11)
- A composite operation MUST expand into its complete atomic effect plan before authorization. (#11)
- A composite operation MUST receive the strictest outcome of its atomic effects in this order: `blocked > preview/approval > notice > allowed`. (#11)
- Directly affected index regeneration, log append, and mechanical link repair MUST inherit the parent operation's outcome and MUST NOT require separate approval. (#11)
- A standalone broad rebuild MUST receive the broad-operation modifier. (#11)
- Unknown or conflicting project mode MUST permit reading, validation, and analysis only and MUST block every mutation, including derived index and log maintenance. (#6, #11)

#### Guard confirmation placement

> Decision #43: this subsection is deferred design for a later guarded release and is not a `v0.1.0` obligation.

- The shared guard runtime's occurrence-bound request, preview, confirmation, execution, token, epoch, and ledger checks are retained design for a later guarded release. (#29, #31, #43)
- The `okf` router MUST own the user-invoked confirmation sequence and MUST dispatch the confirmed operation to its owning skill; no separate guard skill MAY be added. (#5, #29, #35, #38) [precedence: #38 over #5]
- `okf-review` MUST read, validate, and report guard state, and MUST NOT mutate the reviewed subject as a side effect. (#5, #6)
- `okf-review` MAY prepare or report a preview and MAY verify that approval exists, but MUST NOT confirm, self-approve, or execute the reviewed operation. (#29, #38)
- A model-initiated request MAY prepare a preview but MUST NOT confirm or execute it. (#29)
- Confirmation MUST belong to the same occurrence-bound request, preview, and execution sequence. (#29)
- A preview with `complete: false` MUST be refused before confirmation and MUST be checked again at execution. (#29)
- The exact occurrence-bound token ID MUST be echoed for confirmation. (#29)

#### Reading the map

- The runtime MUST evaluate project mode per affected bundle and MUST evaluate each existing concept from its own pre-operation trust tier. (#6, #11)
- The runtime MUST apply direct OKF requirements and prohibitions before it looks up an atomic effect in the table. (#11)
- The runtime MUST check evidence and verifier identity before it composes the table outcomes. (#11)
- The runtime MUST apply the automatic or manual invocation ceiling after it composes the table outcome. (#11)
- The runtime MUST apply broad, destructive, identity, and external-effect modifiers before execution. (#11)
- A `P+R` result MUST require the complete preview, explicit approval, verified recovery evidence, fresh execution checks, and post-operation validation. (#7, #11)
- A `blocked` result MUST not mutate, and approval MUST NOT override it. (#11)
- A `notice` result MUST execute without prior approval and MUST report the operation, affected concepts, evidence, status and trust effects, validation, and recovery result. (#11)
- A `Conditional P+R` deletion result MUST proceed only when the code-backed preview proves supersession or redundancy, proves that no unique durable context exists, and recovery checks pass. (#11)
- Knowledge-only deletion MUST remain blocked because the bundle is authoritative. (#11)
- An effect not listed in this table MUST NOT be implemented, assigned an outcome, or inferred from a similar effect; it MUST be reported as an open item until an adopted decision supplies its placement and outcome. (#8)
- The implementation MUST use the shared runtime responsibilities named in this table and MUST NOT create a separate retrieval or guard skill. (#5, #36)

## Testing Decisions

### What makes a good test here

No closed ticket specifies a testing method. The rules in this subsection and the next are
therefore **authored by this specification**, not carried from a decision, and they are written
without a ticket citation for exactly that reason. Every rule elsewhere in this document that
carries no citation is an error; here it is the point. #9 may revise these; nothing else may.

- A test SHOULD assert behavior a harness adapter can observe, rather than the shape of a shared
  runtime module, a private function name, or an internal call order.
- A test MUST be deterministic. No wall-clock dependence, no network, no harness process, no model
  call (#5).
- A safety test MUST assert the refusal, the reason, and the origin of the refusal — not only that
  the operation did not happen. A write that fails for the wrong reason is a defect.

### The seam

- There MUST be exactly one contract seam: a skill's wrapper script, driven as a process and
  asserted on its stdout. Harness adapters exec the wrapper scripts and read their stdout, so that
  stdout is the surface the shipped contract actually presents (#5).
- Unit tests on shared runtime modules are permitted and are NOT a second seam. They carry no
  contract. No behavior that the wrapper seam can express MAY rely on a unit test as its only
  coverage, and a unit test that obstructs a refactor of `scripts/lib/` is deleted rather than
  defended. This reconciles the one-seam rule with the unit tests #9 requires.
> Decision #43: the fixture rule for staging guard, journal, or recovery state on disk is deferred design for a later guarded release and is not a `v0.1.0` obligation.

### Test classes

The skill-authoring contract fixes three classes, and all three ship in `v0.1.0` (#26).

- **Static tests** MUST cover skill metadata, names, descriptions, links, layout, and known policy
  boundaries (#26).
- **Fixture tests** MUST cover bounded workflow states, every safety gate, every report shape, and
  failure handling (#26).
- **Capability tests** MUST test each adapter only against verified harness behavior, and MUST NOT
  assert a control that was not verified (#26).

### Coverage obligations

> Decision #43: the fixture obligation for every operation-map approval or recovery cell is deferred design for a later guarded release and is not a `v0.1.0` obligation.
> Decision #43: the fixture obligation for every fail-closed guard-state condition is deferred design for a later guarded release and is not a `v0.1.0` obligation.
- Every orientation result value MUST have a fixture test, including the degraded and failed cases
  (#39).
- Bundle admission MUST have a fixture test per gate outcome (#27).
- The write gate MUST have fixture tests for an undeclared bundle, a future-version bundle, a
  legacy bundle, and a conforming bundle (#21).
- Semantic preservation MUST have a round-trip fixture test whose failure blocks the write (#21).

### Runner and release gate

- Tests MUST run under `node --test` with no dependency outside the Node.js standard library (#5).
- CI MUST gate the release on the full deterministic suite (#5).
- Live Claude Code, Codex, and OpenCode process tests are deferred to `v0.2.0` and MUST NOT gate
  `v0.1.0` (#5, #26).

### Prior art

There is none in this repository. `v0.1.0` is the first code on `main`. The five prototypes behind
#27, #28, #29, #30, and #33 are committed on throwaway `prototype/*` branches that were never
merged, so they are evidence for behavior and not a testing pattern to copy.

## Out of Scope

Out of scope for `v0.1.0`, each already ruled out by a decision:

- Custom retrieval backends, matchers, ranking, embedding or semantic retrieval, tokenizers, cost
  models, budgets, reserves, tier allocators, retrieval receipts, retrieval ledgers, implicit
  stemming, generated synonyms, and producer-authored priority metadata (#36). Trust tiers are a
  separate, in-scope concept and are not affected.
- Any redirect artifact. A retired path vacates (#24).
- Windows support (map #1).
- Obsidian syntax, wikilinks, plugins, and application integration. Only transferable
  knowledge-management practice informs the design (map #1).
- Live Claude Code, Codex, and OpenCode process tests, deferred to `v0.2.0` (#5, #26).
- StackBlitz Codex. The target named Codex is OpenAI Codex (map #1).
- A CLI binary and an npm package (#5).
- Product-specific OKF frontmatter, product-specific body sections, and semantic sidecars (#21).
- Concept merging across bundles (#22).
- Automatic mutation from any hook (#35).
- Automatic archive, deletion, compaction, or rewrite triggered by a growth signal (#7).
- Introducing Husky into a target project. Integrate only where it already exists (map #1).
- The manual-operation guard, guard ledger, guard lock, preview/approval flow, durable operation store,
  recovery snapshot, rollback, crash reconciliation, migration writes, merge and split, archive
  relocation, and cross-repository writes (#43, #44; #56, #57, #58, #59, #61, #63, #65, #69).

## Further Notes

Decision #43 implementation sequence, derived from the surviving blocking graph, is:

- Wave 1: #45, #46, #48.
- Wave 2: #47, #49, #52.
- Wave 3: #50, #53.
- Wave 4: #51, #54, #60, #66.
- Wave 5: #55, #62, #64, #67, #68.

Tickets inside one wave MAY run in parallel. (#41)


## Open Items

#### Status of this list

- An implementation agent MUST NOT invent a value, path, schema, threshold, interface, or vocabulary for any row of the open-item table below (#7).
- An implementation agent MUST treat every row below as unresolved product policy, not as a detail it may pick later (#7).
- The release MUST NOT claim complete or calibrated behavior for any capability that depends on an unresolved row below (#7, #36).
- Each row below MUST be closed by an explicit recorded decision before the behavior it blocks is implemented (#7).
- A file under `docs/research/` MUST NOT close a row below; a research note is evidence and hypothesis until an accepted repository decision promotes it (#26).
- A row that is closed later MUST be closed by naming the decision, not by observing that an implementation already chose a value (#26).
- A `Deferred` row blocks no `v0.1.0` work; only an `Open` row MAY block a ticket. (#43)

#### Open-item table

| Item | Status | What it blocks | Why no ticket supplies it | Smallest decision that closes it |
|---|---|---|---|---|
| Durable operation-store location | Deferred (#43) | Every broad, destructive, identity-changing, and cross-repository operation; all crash recovery | #7 requires a separate durable store outside all mutation targets and outside the guard ledger that survives repository replacement and the writing machine, and #37 repeats the requirement for cross-repository moves, but neither names a location; #31 names a location only for the guard ledger, which the store must sit outside of | Name one filesystem location for the operation store that is outside every bundle, outside every Git common directory used for guard state, and outside the repository |
| Operation-store schema version identifier | Deferred (#43) | Fail-closed handling of unknown-schema records; forward compatibility of stored operations | #7 says unknown-schema data is `indeterminate` and blocks execution or recovery claims, but names no version value and no accepted-version set; #31 versions the guard ledger schema without naming a value either | Name the schema version value `v0.1.0` writes and the set of versions it accepts |
| Operation-store record framing and torn-record detection | Deferred (#43) | Distinguishing a complete record from a valid-looking prefix after a crash | #7 requires the record be written completely, flushed, atomically replaced, and content-verified, and classifies torn or truncated data as `indeterminate`, but supplies no framing or integrity check by which torn data is recognized; #30 records that a torn manifest with a valid-looking prefix is unhandled | Name the per-record integrity check that a reader applies before accepting a record as complete |
| Operation-store retention window | Deferred (#43) | Pruning policy; disk growth; how long a settled operation stays recoverable | No ticket states a retention period; #7 requires survival across repository replacement but sets no upper bound; #31 sets a retention rule only for guard spent records | Name how long a settled operation's manifest and journal are retained, and what removes them |
| Operation-store behavior when bundle identity changes mid-operation | Deferred (#43) | Resume and reconciliation after a bundle root is moved while an operation is in flight | Bundle identity is owner identity plus bundle-root path and moving the root changes identity (`CONTEXT.md`, #22); #31 keys guard state on that identity; #7 and #37 key operations on target identity; no ticket states what happens to an in-flight operation whose target identity no longer exists | State whether an operation whose bundle identity changed is reconciled, orphaned and blocked, or discarded, and what the operator must do next |
| Recovery snapshot storage location and mechanism | Deferred (#43) | Every recovery gate; every rollback | #11 requires a content-addressed snapshot outside the mutation target and #7 requires an independent snapshot with a disposable restore, but neither names a storage location or mechanism; #7 and #30 add only the constraint that the mechanism must not reserialize content | Name where snapshots are stored and the mechanism that captures and restores bytes without reserializing them |
| Recovery snapshot scope selector | Deferred (#43) | What a snapshot must contain before an operation may execute | #11 requires a snapshot of the affected bundles and "relevant untracked files" and #37 repeats it for both repositories; neither defines which untracked files are relevant | Define the rule that decides which untracked paths enter the snapshot |
| Recovery snapshot content addressing and completeness proof | Deferred (#43) | The pass condition of recovery evidence; the claim that a snapshot covers its declared scope | #7 requires an independent content-addressed snapshot and matching restored bytes or hashes, but names no content-address algorithm and no record that proves the snapshot covers the declared scope | Name the content-address algorithm and the completeness record a snapshot carries |
| Recovery snapshot discard timing | Deferred (#43) | Cleanup after a settled operation; whether a snapshot survives to a later repair | No ticket states when a snapshot may be discarded; #7 requires it for the recovery gate and #37 requires it for both repositories, and both stop there | State the event after which a snapshot may be discarded |
| Enumerated post-operation checks and per-check pass criteria | Closed (D8) | Every claim that an operation succeeded; the `ValidationVerdict` and `PostOpChecks` results | #7 names the check families — OKF conformance, suite checks, identity, link, provenance, trust, and post-operation validation bound to the approved plan — but enumerates no individual check and states no per-check pass condition; #30 carried these across as explicitly opaque | **Adopted (D8):** the post-write validation check table enumerates the checks in `scripts/lib/validation.js` and their observable pass and fail conditions. |
| Crash-point reconciliation table | Deferred (#43) | Recovery from every interrupted operation | #30 supplies the record ordering (`INTENT{undo}` → mutate → `OUTCOME`, sealed manifest before the first mutation, spend and epoch advance between the last `OUTCOME` and `SETTLED`) and #31 supplies the ledger `in-flight`/`failed`/unknown outcomes, but no ticket maps every crash point to a next action; #7 classifies missing, torn, corrupt, truncated, and unknown-schema data as `indeterminate` without stating the reconciliation step | Publish one table mapping each crash point — including a missing manifest, a torn record, a dangling `INTENT`, a partial inverse, and ambiguous filesystem state — to its next action |
| Result label for a reconciled identical-byte concurrent foreign write | Deferred (#43) | Whether an operation may settle clean after a foreign session produced identical bytes | #30 records that reconciliation cannot distinguish authorship and reads bytes equal to the expected hash as done, and lists this as an accepted cost rather than a reported outcome; #7 records foreign mutation only on observed drift; #37 defines `partially-applied` and `indeterminate` for other cross-repository outcomes | State whether this case settles `clean` or is recorded as an ambiguity that makes the terminal `dirty` |
| New-bundle write-gate bootstrap exception | Closed (D11) | `okf init`; migration into a repository with no bundle; adoption of a bundle root that does not yet exist | #21 gates mutation on a pre-existing bundle-root `index.md` whose parsed `okf_version` is exactly `"0.2"` and defines an adoption operation only for a bundle root that already exists; #19 creates new bundles through migration; #35 allows guarded initialization; none states the predicate under which the first write to a non-existent bundle root is permitted | State the exact condition under which creating a bundle root is permitted without a pre-existing `okf_version: "0.2"` declaration, and the atomicity requirement for that first write |
| Guard ledger schema version identifier | Deferred (#43) | Fail-closed handling of unreadable or newer ledger state | #31 requires a schema-versioned ledger and fails closed on an unsupported version, but names no version value and no accepted-version set | Name the ledger schema version value `v0.1.0` writes and the set of versions it accepts |
| Guard lock filename and locking mechanism | Deferred (#43) | Concurrent-session coordination; the exclusive execution lock | #31 says the lock lives beside the ledger and that failure to lock fails closed, but names neither the lock artifact nor the operating-system mechanism | Name the lock artifact and the mechanism that acquires and releases it |
| `<bundle-key>` encoding | Deferred (#43) | The guard ledger directory name; whether two bundles can collide on one key | #31 says `<bundle-key>` derives from the canonical bundle identity rather than a display name; #22 defines bundle identity as owner identity plus bundle-root path; no ticket defines the encoding from that identity to a filesystem-safe key | Define the encoding from bundle identity to `<bundle-key>`, including its collision property |
| Canonical multi-bundle lock ordering key | Deferred (#43) | Cross-repository moves; any operation holding more than one bundle lock | #37 requires all affected bundle locks to use one deterministic canonical order but names no ordering key | Name the value the lock order sorts on |
| Write-authority finding code set | Deferred (#43) | The reported outcome of a refused foreign write | #37 requires a distinct `WRITE_AUTHORITY` gate and gives `WRITE_NOT_AUTHORIZED` only as an example, explicitly excluding `INVALID` and `ACCESS_DENIED`; #22 fixes the admission finding set with no write-authority code | Enumerate the write-authority finding codes and the condition that emits each |
| Wrapper input protocol | Closed (#42) | Every harness adapter invocation of the shared runtime | #5 says harness adapters exec the per-skill wrapper scripts and read stdout, and stops there; no ticket states how the operation, target, and settings reach the wrapper | **Adopted (#42):** a wrapper reads exactly one UTF-8 JSON object from `stdin` and handles one request per process; `argv` is startup only and environment variables carry no semantic request data. |
| Wrapper stdout schema | Closed (#42) | Adapter parsing of every result; semantic parity across harnesses | #5 says adapters read stdout; #6, #36, #38, and #39 fix result vocabularies but no ticket fixes the serialization the adapter parses | **Adopted (#42):** exactly one newline-terminated JSON object on `stdout`, carrying `protocol`, `skill`, `operation`, `result`, `scope`, `evidence_limits`, `data`, `findings`, and `next_action`. Stdout carries no log text. |
| Wrapper exit-code contract | Closed (#42) | Adapter distinction between a reported refusal and a runtime failure | No ticket assigns meaning to a wrapper exit code; #5 mentions only stdout | **Adopted (#42):** `0` one valid response was emitted, including `blocked`, `abstained`, and `failed` results; `64` invalid wrapper input; `70` internal or serialization failure, which still emits one complete response. |
| Router dispatch protocol | Closed (#42) | Every routed operation; behavior on an unknown sub-command | #5 says the router `SKILL.md` dispatches to sub-skills; no ticket states the dispatch grammar, the argument shape, or the result when no sub-skill matches | **Adopted (#42):** the router selects an owner only from the fixed `operation` field against a sealed operation table, and returns the defined unknown-operation result when no entry matches. Per #43 and the #41 decision record, `guard.prepare`, `guard.confirm`, and `guard.execute` are not entries of the `v0.1.0` table. |
| Shared module public interfaces | Closed (#42) | Every skill and adapter that calls admission, validation, lifecycle, or guard behavior | #5 makes the shared modules library-only pure functions and assigns them admission, validation, lifecycle, and guard behavior; #36 defines portable roles for enumerate, search, read, and scope enforcement but states that exact tool names are not shared policy; no ticket fixes a module boundary or a callable signature | **Adopted (#42):** the modules with a fixed public interface are `protocol.js`, `runtime.js`, `admission.js`, `validation.js`, `lifecycle.js`; other modules under `scripts/lib/` are internal to them. Per #43 and the #41 decision record, `scripts/lib/guard.js` does **not** ship. |
| Adapter package location and per-adapter install command | Closed (D6) | Installation and upgrade of the three native adapters | #5 fixes the base install command and says the three plugins are installed globally; #35 says three thin adapters are separately installable from the same tag; #4 records the base install syntax only; no ticket gives a per-adapter package location or command | **Adopted (D6):** each native adapter ships at `adapters/<harness>/` in the same tag for `claude-code`, `codex`, and `opencode`; all three install through the one adapter entry script, which takes `install \| disable \| uninstall`, a harness name, and a target directory the user supplies. |
| Complete atomic-effect ownership table | Closed (D7) | Assigning every effect to a skill, a runtime module, and an invocation class | #11 enumerates the atomic effects and their authorization outcomes; #5 assigns broad operation groups to four skills; #38 assigns bounded writes to `okf-writer`; no ticket maps every atomic effect to an owning skill, runtime module, and invocation class | **Adopted (D7):** the atomic-effect ownership table assigns each atomic effect one owning skill and one invocation class; the runtime module is `scripts/lib/runtime.js` for every effect and is stated once above the table instead of as a constant column. |
| Owning skill for incremental synchronization | Closed (#42) | Where automatic narrow maintenance executes | #6 defines incremental synchronization as automatic narrow maintenance; #5 assigns `sync` to the manual-gated `okf-lifecycle` skill without separating the modes; no ticket names the skill or module that performs the incremental mode | **Adopted (#42):** `okf-lifecycle` with `scripts/lib/lifecycle.js` orchestrates incremental synchronization; every mutation goes through `okf-write`. |
| Implementation sequence | Closed (#41) | The order in which the skills, shared runtime, guard state machine, and adapters reach completion | #1 records the sequence as not yet specified and assigns it to the specification and implementation tickets; no closed ticket supplies it | **Adopted (#41):** wave 1 — #45, #46, #48; wave 2 — #47, #49, #52; wave 3 — #50, #53; wave 4 — #51, #54, #60, #66; wave 5 — #55, #62, #64, #67, #68. Derived from the blocking graph; tickets inside a wave may run in parallel. |
| Coexistence with the existing third-party OKF skill | Closed (D9) | Release positioning and installation conflicts | #1 records that whether to replace, extend, or coexist with `fabricioctelles/okf-open-knowledge-format` is not yet specified; no closed ticket supplies it | **Adopted (D9):** closed by explicit deferral. `v0.1.0` makes no claim about `fabricioctelles/okf-open-knowledge-format`; positioning is revisited only if a real install conflict is observed. |
| Support-ceiling fixture corpora and strata | Deferred (D10) | Any calibrated claim about the declared support ceiling | #36 requires fixture evidence before a calibrated support-ceiling claim and lists the fixture subjects, but names no corpora, no scale strata, and no acceptance condition; #1 records the fixture evidence as not yet specified | Name the fixture corpora and strata, and the observation that makes the ceiling calibrated |

#### Terms formerly undefined, now in `CONTEXT.md` (#9)

The terms below were the gap list this specification opened against `CONTEXT.md`. Every one of them
now has an authoritative `CONTEXT.md` entry, so the list is a discharge record, not a blocking gap.
`target-owner consent` is intentionally not a separate entry: the `Foreign-write authority` entry
names the same grant and lists `target-owner consent` under `_Avoid_`.

The two rules stand for any *future* normative term:

- A term this specification uses normatively MUST receive one authoritative definition in `CONTEXT.md` before an implementation uses it normatively (#26).
- Such a term MUST NOT be given a synonym for a concept `CONTEXT.md` already defines (#26).

Authority and consent: `WRITE_AUTHORITY`, `WRITE_NOT_AUTHORIZED`, authority generation, grant generation, target-owner consent, target project-mode configuration, target native adapter, allowed effects, target collision, transformed output, bootstrap exception (#37, #21).

Operation and approval: operation identity, operation class, atomic effect, approval record, approval fingerprint, policy hash, required checks, manual-operation occurrence, bundle epoch, ledger generation, preview token, spent record, invocation attestation (#11, #29, #31, #37, #38).

Durable state: operation store, schema version, retention window, snapshot handle, recovery window, validation verdict, post-operation checks, settlement, cleanliness, residue classification, bundle-move orphan state, canonical lock order (#7, #30, #37).

Delivery and harness: skill binding, tool allowlist, native wrapper, router, session override, effective settings, supported entry seam, logical cause, native event ID, adapter generation (#5, #38, #39).

Read and reporting: Concept ID, workspace link scheme (`okf-workspace://`), result labels, match labels, finding labels, coverage labels, verified EOF, parse finding (#22, #36).

#### Settled, do not reopen

- Redirects MUST NOT ship in `v0.1.0`; a retired concept path vacates, `REDIRECT_PUBLISH` remains unconstructible, and `REDIRECT_RETIRE` ordering in `beginRollback` becomes unreachable (#24, #14).
- Budgets, reserves, tiers, tokenizers, cost models, ranking weights, retrieval receipts, and retrieval ledgers MUST NOT be implemented; they are deleted, not unset (#36).
- Rollback MUST require fresh approval, and a parent approval MUST NOT authorize a later rollback (#7).
- Repair MUST NOT retry an inverse automatically; `rollback-failed` MUST start a new operation with its own preview, approval, snapshot, recovery gate, and post-operation checks (#7).
- Review-dependency mappings shown for a restructuring output MUST remain non-authoritative proposals, and no review baseline MUST transfer automatically (#7, #12).
- Restoring a snapshot over a live bundle MUST be a new operation with its own preview, approval, and recovery gate (#7).
- The disposable verification restore MUST execute under the operation's own recovery gate and requires no separate restore authority (#11, #7).
- A harness-native multi-root input MUST NOT establish discovery authority; it is an access or candidate signal only (#22, #27) [precedence: #22 over #27].
- OpenCode explicit-only invocation MUST use per-skill `permission.skill: deny`, and omitting `description` MUST NOT be used as the mechanism (#39, #35) [precedence: #39 over #35].
- The shared runtime and manual-operation guard MUST apply on the OpenCode prompt-injection command path (#39, #35) [precedence: #39 over #35].
- A harness that cannot attest a complete preview or explicit confirmation MUST block migration rather than execute it degraded (#19, #29) [precedence: #19 over #29].
- The operation manifest MUST carry only the sealed plan and identity; checkpoints, resume state, and later observations MUST live in the observation journal (#37, #19) [precedence: #37 over #19].
- The `v0.1.0` suite inventory MUST be four skills behind an `okf` router (#5, #26) [precedence: #5 over #26].
- Incremental synchronization MUST remain automatic narrow maintenance and MUST NOT be gated as a manual operation (#6, #5) [precedence: #6 over #5].

#### Provisional support ceiling

- The release MUST state the support ceiling as 500 source files, 100 MB aggregate exact source bytes, and bundle-relative directory depth 6 (#36).
- The release MUST label these three values provisional (#36).
- The release MUST NOT claim calibrated support-ceiling behavior until deterministic fixture evidence validates it (#36).
- Reading MAY continue above the ceiling, but the result MUST NOT claim completeness or calibration (#36).
- The evidence that makes the ceiling calibrated MUST include deterministic fixtures that exercise exact targets, admission scope, index fallback, federation gaps, deprecated concepts, malformed frontmatter, EOF uncertainty, support-ceiling disclosure, the result vocabulary, provenance separation, and adapter scope guards (#36).
- The corpora, scale strata, and acceptance condition for those fixtures remain unspecified and MUST be decided before a calibrated claim (#1, #36).

### Open items declared by each section

Each entry below was raised by the section that needs it. It repeats nothing decided above.

#### Knowledge model, project modes, and the automatic lifecycle

- The authoritative configuration path and schema for declaring `code-backed` or `knowledge-only` mode — needed by project-mode parsing and mutation admission — last touched by (#6, #22)
- The exact input interface for task intent and phase transitions — needed by task-kind selection and lifecycle entry — last touched by (#6)
- The exact evidence-sufficiency predicates for a meaningful result, material change, and bounded concept — needed by create, revise, and abstain decisions — last touched by (#6)
- The exact lifecycle-result schema and transport format beyond task kind, affected scope, evidence limits, and next action — needed by deterministic result serialization and adapter integration — last touched by (#6)

#### OKF conformance, the suite profile, and validation

- The complete stable finding-code vocabulary is not supplied — needed by deterministic finding reports and fixtures — last touched by (#21)
- The exact report syntax for blocked-operation and legacy-fallback lines is not supplied beyond their required contents — needed by one reporter and report fixtures — last touched by (#21)
- The exact schemas for validation verdicts and post-operation checks are not supplied — needed by lifecycle validation and post-operation verification — last touched by (#7)
- The exact identity and review-evidence checks for each operation are not supplied, beyond the restructuring inbound-link, provenance-assignment, and collision checks adopted in #24 — needed by operation-specific safety gates — last touched by (#7, #24)
- Growth-signal thresholds are not adopted — needed by any threshold-based growth warning — last touched by (#7)
- The exact compaction-selector schema and selection thresholds are not adopted — needed by compaction planning and preview — last touched by (#7)
- The exact parse-tree comparison interface and supported writer/parser implementation are not supplied — needed by the semantic-preservation write gate — last touched by (#21)
- The adopted safe retrieval fallback requirement deleted from #7 has no replacement — needed by any safe retrieval fallback behavior — last touched by (#36, #7)

#### Identity, workspace federation, and bundle admission

- The exact JSON schema grammar, field optionality, field types, and path-base rules for `.okf-workspace.json` — needed by manifest parsing, validation, and the federation-rejection rules — last touched by (#22)
- The derivation, persistence, and replacement rules for `workspace_id` beyond its required UUIDv4 form — needed by workspace identity and workspace-root bundle identity — last touched by (#22)
- The permitted character set and comparison rule for a bundle routing alias — needed by manifest uniqueness validation and `okf-workspace://` resolution — last touched by (#22)
- The mechanism by which a user explicitly selects a workspace root or supplies an out-of-band manifest — needed by discovery-authority bootstrap above the discovery ceiling — last touched by (#22, #27)
- The interface for granting, inspecting, and revoking repository trust, and the exact storage location of the instance UUIDv4 inside Git common metadata — needed by the `TRUST` gate and by trust survival across a move — last touched by (#22)
- The physical location of the workspace-level bundle of a non-repository workspace root, and the location and format of its trust sidecar — needed by non-repository workspace admission and trust — last touched by (#22, #27)
- The exact `REACH` exclusion rule list, and whether it is fixed or configurable — needed by the `REACH` gate — last touched by (#27)
- Whether a manifest-declared exact Git object revision is enforced at admission, and which finding a revision mismatch produces — needed by pinned shared glossaries and pinned repository records — last touched by (#22)
- The value vocabulary for aggregate workspace health, including the label for the degraded state caused by an inactive required member — needed by workspace-health reporting and orientation output — last touched by (#22, #36)
- The exact per-user OS cache directory path for each supported operating system — needed by persistent syntax-cache placement — last touched by (#32)
- The syntax-cache entry envelope format, digest algorithm, schema identifier, and cache-format version numbering — needed by the reader verification and cache-miss rules — last touched by (#32)
- The final finding code for a refused foreign write; `WRITE_NOT_AUTHORIZED` is an example only — needed by the `WRITE_AUTHORITY` gate output vocabulary — last touched by (#37)
- The target-side consent workflow and the authorized target-owner or administrator approval interface — needed by issuing and revoking foreign-write authority — last touched by (#37)
- The foreign-write grant-file schema, the authority-generation representation, and the revocation record format — needed by binding and invalidating consent — last touched by (#37)
- The canonical lock ordering algorithm and its ordering key for multiple affected bundles — needed by deadlock-free cross-repository lock acquisition — last touched by (#37)
- The operation-store path, the sealed operation-manifest schema, and the observation-journal schema for cross-repository moves — needed by phases 2 through 6 of the cross-repository move — last touched by (#37)
- The approval-record and approval-fingerprint set schema covering every affected repository, and the exact definition of a relevant change that expires it — needed by cross-repository approval and its expiry — last touched by (#37)
- The `<bundle-key>` encoding derived from canonical bundle identity — needed by per-bundle guard-ledger directory paths — last touched by (#31)

#### Concept navigation and reading

- The fixed-schema field names, types, and serialization of the orientation result are not supplied — needed by adapter implementation and orientation fixtures — last touched by (#36)
- The path syntax and schema of a "relevant directory index" are not supplied — needed by the normal index path — last touched by (#36)
- The observable test that classifies an index as stale is not supplied — needed by the index-condition report on the normal index path — last touched by (#36)
- The observable criterion for a verified end of file with native tools is not supplied — needed by complete-concept claims and the `unobservable` finding — last touched by (#36)
- The exact native tool mapping for each harness is not supplied and is not shared policy — needed by every adapter's enumerate, search, and read roles — last touched by (#36, #35)
- The scope-envelope representation and the path-validation interface are not supplied — needed by the adapter scope guard — last touched by (#36)
- The exact rendering of the compact answer labels, including their order and how findings attach to them, is not supplied — needed by deterministic result-vocabulary fixtures — last touched by (#36)
- The required form of the warning that accompanies an included deprecated concept is not supplied — needed by exact reads and explicit include-deprecated requests — last touched by (#14, #36)
- The explicit opt-in form for including deprecated concepts is not supplied — needed by include-deprecated navigation — last touched by (#36)
- The schema for degraded disclosure of incomplete archive-status observation is not supplied — needed by unobserved-status reporting — last touched by (#14)
- The calibrated support-ceiling evidence and the release profile that would justify the provisional values are not supplied — needed by any calibrated-support claim at release — last touched by (#36)

#### Operation risk, approval, the manual-operation guard, and recovery

- The exact `bundle-key` encoding derived from canonical bundle identity — needed by manual-operation guard ledger directory naming and cross-worktree coordination — last touched by (#31)
- The supported manual-operation guard ledger schema version — needed by the newer-schema fail-closed check — last touched by (#31)
- The exact manual-operation guard ledger filenames, serialization format, and field schema — needed by ledger read, atomic replace, and cross-implementation parity — last touched by (#31)
- The exact lock filename and locking mechanism used beside the ledger — needed by exclusive per-bundle execution locking — last touched by (#31)
- The default confirmation time-to-live value and the default session-binding behavior for the optional expiry adapters — needed by `CONFIRMATION_AGED_OUT` and `SESSION_BOUNDARY` expiry — last touched by (#29)
- The exact durable operation-store path for the repository and non-repository cases — needed by operation-manifest and observation-journal placement outside mutation targets and ledgers — last touched by (#7, #30)
- The durable operation-store schema version — needed by the unknown-schema `indeterminate` classification — last touched by (#7, #30)
- The durable operation-store retention window — needed by operation-store pruning and by how long a recovery claim stays reconstructible — last touched by (#7, #30)
- The exact operation-manifest and observation-journal filenames and publication mechanism — needed by atomic publication, content verification, and crash reconciliation — last touched by (#7, #30)
- The exact reconciliation procedure for a torn, truncated, or corrupt operation manifest beyond classifying it `indeterminate` — needed by crash recovery of a broad operation — last touched by (#7, #30)
- The exact content-addressing algorithm for snapshots and content hashes — needed by `observedHash`, fingerprint hashing, and restored-content equality — last touched by (#7)
- The exact operation-manifest hash encoding used in the approval fingerprint — needed by approval binding and expiry detection — last touched by (#11)
- The exact snapshot format and restore mechanism for the independent recoverable snapshot — needed by the disposable-restore step of recovery evidence — last touched by (#7)
- The exact pass criteria for post-operation identity, inbound-link, provenance, and trust checks — needed by the recovery-evidence conjunction and post-operation validation — last touched by (#7)
- The deterministic canonical lock order for cross-repository guard ledgers — needed by deadlock-free multi-bundle locking — last touched by (#37)
- The exact per-repository approval-record schema for a cross-repository operation — needed by cross-repository approval binding and expiry — last touched by (#37)
- Whether OpenCode still yields an `unknown` attestation and a `degraded` record, now that #17's no-explicit-invocation finding is retracted and #39 adopts per-skill `permission.skill: deny` — needed by the guard attestation input and by migration reachability on OpenCode — last touched by (#29, #17, #39)

#### Migration

- How migration stages and publishes a new bundle root before an exact root `okf_version: "0.2"` declaration exists — needed by first migration publication without weakening the suite write gate — last touched by (#19, #21)
- The include and exclude rule syntax and selector schema — needed by expressing and validating a bounded migration request — last touched by (#19)
- The relative-path normalization algorithm — needed by deterministic output identity and collision detection — last touched by (#19)
- The source-class-to-OKF-type mapping table — needed by human-approved type conversion — last touched by (#19)
- The deterministic `references/` path scheme and content-hash algorithm — needed by byte-for-byte attachment publication and verification — last touched by (#19)
- The preview manifest schema — needed by complete preview enumeration and confirmation binding — last touched by (#19)
- The operation receipt schema — needed by migration reporting and post-operation audit — last touched by (#19)
- The external operation-manifest and observation-journal store location — needed by interruption recovery and resumable migration — last touched by (#7)
- The staging-area and atomic swap mechanism — needed by write-new-then-swap publication — last touched by (#19)
- The snapshot, disposable-restore, and content-identity mechanisms — needed by recovery evidence — last touched by (#7)
- The explicit approval interface and approval-record schema — needed by migration approval and binding — last touched by (#11)
- Whether an `unknown` attestation counts as inability to attest for migration: #19 blocks a harness that cannot attest a complete preview or explicit confirmation, and #29 records `unknown` as degraded and never maps it to inability — needed by migration reachability on a harness without native explicit invocation — last touched by (#19, #29)

#### Restructuring, archiving, and links

- The `InboundLinkSet` schema, its completeness representation, and the discovery interface — needed by admissibility of in-bundle rewriting and by the relocation block on incomplete discovery — last touched by (#24)
- The merge and split body-partition rules and the construction of a retained body — needed by footnote-derived provenance assignment and by output content — last touched by (#24)
- The interface by which a split's inbound-link rewrite target is chosen among multiple outputs — needed by total in-bundle rewriting on split — last touched by (#24)
- The fate of an inbound link whose target is deleted rather than moved, including whether it is rewritten to an output or removed — needed by code-backed merge and split source deletion — last touched by (#24)
- The relocation destination syntax and the path-selection interface — needed by relocation execution and destination-collision detection — last touched by (#14)
- Whether relocation also sets `status: deprecated` on the relocated concept — needed by archive relocation content rules — last touched by (#14)
- The successor-notice wording, heading, and Markdown template — needed by knowledge-only merge and split source deprecation and by relocation navigation — last touched by (#14)
- The archive-recommendation policy and every numeric threshold it would use — needed by review prompts from `stale_after`, changed review dependencies, and orphan evidence — last touched by (#14)
- The exact hash algorithm and serialization for content hashes, verification hashes, and `observedHash` — needed by recheck comparison and byte-identity rollback checks — last touched by (#30)
- The exact durable location, schema version, and record format of the operation manifest and the observation journal — needed by restructuring recovery, resume, and rollback — last touched by (#7)

#### Suite architecture, distribution, and skill authoring

- The invocation class and reach-clause requirement for each of `okf-read`, `okf-write`, `okf-lifecycle`, `okf-review`, and the `okf` router — needed by skill frontmatter, adapter invocation translation, and static description tests — last touched by (#26, #5)
- The public filenames and interfaces of the individual `scripts/lib/` shared modules — needed by wrapper scripts and by shared-module reuse across skills — last touched by (#5, #36)
- The wrapper input protocol, stdout schema, exit-code contract, and error-stream contract — needed by adapter execution of the wrapper scripts — last touched by (#5)
- The interface by which a harness returns wrapper stdout to the model as a tool result in context — needed by adapter result handling — last touched by (#5)
- The router dispatch protocol and the router frontmatter — needed by the `okf` router skill — last touched by (#5)
- The native adapter package identifiers and the adapter-specific installation commands — needed by adapter distribution from the `v0.1.0` tag — last touched by (#35)
- Whether the base install command also installs the `agents/` definitions, or whether agent registration is a separate step — needed by availability of delegated reads and writes — last touched by (#38, #35)
- Whether development-only or CI-only tooling dependencies are permitted outside the shipped runtime — needed by repository build and CI setup — last touched by (#5)
- Which skill hosts automatic incremental synchronization writes, given that automatic hooks are read-only and `okf-lifecycle` owns `sync` — needed by placement of automatic maintenance mutations — last touched by (#35, #6)
- The target capability matrix that verifies whether an optional frontmatter field is portable — needed by portable-frontmatter linting in static tests — last touched by (#26)

#### Harness adapters, session entry, and delegated agents

- The serialized schema, field types, and value vocabulary for the orientation fields `activation`, `current bundle identity`, `root index path`, `aggregate workspace health`, and `next action` — needed by orientation emission and cross-adapter parity fixtures — last touched by (#36)
- The meaning of `bounded` for the orientation context, stated as an observable limit — needed by the "one bounded orientation result" requirement — last touched by (#36)
- The occurrence-key serialization, the logical-cause vocabulary, the native event-ID format, and where occurrence state persists — needed by at-most-once orientation delivery and duplicate suppression — last touched by (#39)
- The signal that identifies a delegated child context on Claude Code and a forked or delegated child context on OpenCode — needed by the fresh-orientation rule for child contexts on those two harnesses — last touched by (#39)
- The diagnostic payload schema for `invalid`, `unavailable`, `degraded`, and `failed` orientation results — needed by non-clean orientation reporting and its fixtures — last touched by (#39)
- The adapter registration interface and the native agent-wrapper interface for Claude Code, Codex, and OpenCode, including the supported entry-seam identifier each adapter reports — needed by adapter installation and delegated-agent exposure — last touched by (#38)
- The storage location, file syntax, and scope resolution for user/global, project/worktree, and current-session execution settings — needed by the settings precedence chain — last touched by (#38)
- The supported adapter-capability setting vocabulary beyond `read_execution` and `write_execution` — needed by the local-override rule that permits changing adapter capabilities — last touched by (#35)
- The serialized delegation-receipt schema and the complete status enumeration it may carry — needed by main-session receipt validation and the delegated-write fixtures — last touched by (#38)

#### The operation map

- The exact invocation class for `okf-read`, `okf-write`, `okf-lifecycle`, `okf-review`, and the `okf` router, including the invocation class of table effects marked not assigned — needed by skill frontmatter, adapter translation, and invocation tests — last touched by (#26, #5, #8)
- The exact public filenames and interfaces of the shared runtime modules named by responsibility — needed by wrappers and skill dispatch — last touched by (#5, #36)
- The exact router dispatch protocol and the interface between router confirmation and the shared guard runtime — needed by the occurrence-bound request, preview, confirmation, and execution sequence — last touched by (#5, #29, #31)
- The exact operation-manifest and observation-journal paths and schemas — needed by broad synchronization, restructuring, migration, and recovery execution — last touched by (#7, #19, #30)
