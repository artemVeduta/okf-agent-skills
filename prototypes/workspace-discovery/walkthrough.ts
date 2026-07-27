/**
 * PROTOTYPE — replays the case catalogue through the same keystroke path a human drives.
 *
 * This is not a test suite. A mismatch means the *idea* needs a decision, not that the code
 * has a bug: each case names the invariant it defends, and a case that behaves differently
 * under hand-driving overturns the rule, not the other way round.
 *
 *   node prototypes/workspace-discovery/walkthrough.ts
 */

import { createWorld, step, type World } from './driver.ts';
import type { BlockCode, Verdict } from './discovery.ts';

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

interface Scenario {
  name: string;
  keys: string;
  expect: `${Verdict} ${BlockCode}`;
  why: string;
}

const SCENARIOS: Scenario[] = [
  // --- the boundary: never above, never sideways ---------------------------
  { name: 'standalone repo from a subdirectory', keys: '2r', expect: 'ROUTE OK', why: 'the deterministic base case: walk up, stop at the git root' },
  { name: 'cwd is the parent directory of a repo', keys: '2nnr', expect: 'REFUSE CWD_NOT_A_WORKSPACE', why: 'cwd is an input to discovery, never a workspace by itself' },
  { name: 'selecting that parent as a workspace root', keys: '2nnbr', expect: 'ROUTE OK', why: 'a bootstrap widens the boundary but performs no scan of its own' },
  { name: 'advisory peer scan below a selected root', keys: '2nnbor', expect: 'ROUTE OK', why: 'peer candidates are suggestions; they never enter the routing graph' },
  { name: 'naming a sibling repository from inside one', keys: '2ex', expect: 'REFUSE SIDEWAYS_SIBLING', why: 'siblings are out of scope even when one directory away' },
  { name: 'naming the parent directory from inside a repo', keys: '1eeex', expect: 'REFUSE ABOVE_GIT_ROOT', why: 'never search upward past the repository root' },
  { name: 'monorepo does not reach the Tilt root', keys: '8x', expect: 'REFUSE SIDEWAYS_SIBLING', why: 'a monorepo never silently walks above its own git boundary' },

  // --- monorepo shape ------------------------------------------------------
  { name: 'monorepo child: root + child bundle', keys: '1r', expect: 'ROUTE OK', why: 'discovery walks up from the child, it does not stop at the child boundary' },
  { name: 'monorepo root: the whole member inventory', keys: '1nnr', expect: 'ROUTE OK', why: 'declared members are the child bundles; undeclared subdirectories are not' },
  { name: 'bundle in an undeclared subdirectory', keys: '1nnnr', expect: 'ROUTE OK', why: 'the walk-up finds it and flags it; §1 and §6.3.1 disagree and the doc never reconciles them' },
  { name: 'cwd reached through a node_modules symlink', keys: '1nnnnr', expect: 'ROUTE OK', why: 'cwd is canonicalised first, so the physical location decides the scope' },
  { name: 'monorepo child in a Tilt workspace', keys: '8nr', expect: 'ROUTE OK', why: 'a child sees its own bundle and the root, not its siblings' },
  { name: 'write from a monorepo child', keys: '8nw', expect: 'ROUTE OK', why: 'writes go to the nearest bundle at or above cwd inside this repository' },

  // --- exclusion and repository anomalies ----------------------------------
  { name: 'bundle inside vendor/', keys: '2nnnr', expect: 'ROUTE OK', why: 'excluded directories are refused but reported: they are inside the authorized scope' },
  { name: 'submodule named from the enclosing repo', keys: '6x', expect: 'REFUSE SUBMODULE_EXCLUDED', why: 'a submodule is a vendored dependency of its parent, excluded by default' },
  { name: 'cwd inside that same submodule', keys: '6nnr', expect: 'ROUTE OK', why: 'the submodule is the current repository; excluding it would leave the session blind' },
  { name: 'nested git repo inside another working tree', keys: '6nr', expect: 'FLAG NESTED_REPO_ANOMALY', why: 'ambiguous knowledge scope is a human decision, not a silent pick' },
  { name: 'sparse checkout: bundle committed, not on disk', keys: '6nnnr', expect: 'ROUTE OK', why: 'absence on disk is not a missing bundle when the index has it' },
  { name: 'git worktree with its own bundle', keys: '6nnnnr', expect: 'ROUTE OK', why: 'a worktree is its own repository root for discovery purposes' },

  // --- symlinks ------------------------------------------------------------
  { name: 'link resolving inside the workspace', keys: '1ex', expect: 'ROUTE OK', why: 'containment is checked on the resolved target, not the lexical path' },
  { name: 'dependency symlink escaping the repo', keys: '5x', expect: 'REFUSE SYMLINK_ESCAPE', why: 'dependency presence alone is not authorization' },
  { name: 'symlink cycle', keys: '6eex', expect: 'REFUSE SYMLINK_CYCLE', why: 'cycles are rejected rather than traversed' },
  { name: 'dangling symlink', keys: '6eeex', expect: 'REFUSE SYMLINK_BROKEN', why: 'a broken link is not the same failure as a missing repository' },
  { name: 'symlink policy set to deny', keys: '5bTgsx', expect: 'REFUSE SYMLINK_DENIED', why: 'policy is explicit; trust is never derived from where the link lives' },
  { name: 'allowlisted external target', keys: '5ebTgssax', expect: 'ROUTE OK', why: 'an allowlist is the only way out of the workspace, and it is opt-in' },
  { name: 'link retargeted after being allowed once', keys: '5bTgLx', expect: 'REFUSE SYMLINK_ESCAPE', why: 'containment is recomputed on every call; an earlier approval cannot be ridden' },

  // --- the four gates, one ladder ------------------------------------------
  { name: 'gate 1 of 4: boundary refuses the sibling', keys: '5x', expect: 'REFUSE SYMLINK_ESCAPE', why: 'REACH runs first and short-circuits everything else' },
  { name: 'gate 2 of 4: reachable but untrusted', keys: '5bx', expect: 'REFUSE REPO_UNTRUSTED', why: 'declaring a path widens scope; it does not trust the repository' },
  { name: 'gate 3 of 4: trusted but unreachable by the harness', keys: '5bTx', expect: 'REFUSE HARNESS_NO_ACCESS', why: 'a manifest does not grant filesystem access' },
  { name: 'gate 4 of 4: all four pass', keys: '5bTgx', expect: 'ROUTE OK', why: 'scope, presence, trust, and access are four separate authorizations' },
  { name: 'trust and access both refuse, reported together', keys: '4eex', expect: 'REFUSE REPO_UNTRUSTED', why: 'both fixes are shown at once; the human is not walked through a maze one wall at a time' },

  // --- presence and the missing-repo lifecycle -----------------------------
  { name: 'required entry declared but not cloned', keys: '3Tr', expect: 'INCOMPLETE REPO_ABSENT', why: 'a required entry makes the workspace incomplete, not merely warned about' },
  { name: 'the same entry after Tilt clones it', keys: '3Tcr', expect: 'ROUTE OK', why: 'declared_missing -> available is the one sanctioned transition' },
  { name: 'manifest entry pointing at a plain directory', keys: '3eex', expect: 'REFUSE NOT_A_REPOSITORY', why: 'four distinct failures, four distinct statuses, never one generic "missing"' },
  { name: 'repository present with no bundle', keys: '3ex', expect: 'REFUSE BUNDLE_ABSENT', why: 'no bundle is a presence failure, not a trust or access failure' },
  { name: 'no bundle anywhere in the repository', keys: '2ndw', expect: 'REFUSE NO_LOCAL_BUNDLE', why: 'discovery never creates okf/; init is a manual operation' },

  // --- trust is keyed on identity, not path --------------------------------
  { name: 'trusted repository moved to a new path', keys: '3Tkeeeex', expect: 'ROUTE OK', why: 'trust follows the canonical repository identity across a move' },
  { name: 'different repository at the same declared path', keys: '3TKx', expect: 'REFUSE IDENTITY_CHANGED', why: 'a path string is not an identity; trust must not transfer to an impostor' },

  // --- authority: what may widen scope, and what may not -------------------
  { name: 'manifest on disk at a non-repo cwd', keys: '3r', expect: 'INCOMPLETE REPO_ABSENT', why: 'a manifest at cwd is a bootstrap signal in its own right' },
  { name: 'the same workspace with the manifest removed', keys: '3Mr', expect: 'REFUSE CWD_NOT_A_WORKSPACE', why: 'a folder full of repositories is a convention, not an authorization' },
  { name: 'harness granted access but nothing bootstrapped', keys: '3Mgr', expect: 'REFUSE CWD_NOT_A_WORKSPACE', why: 'access is not authority: being able to read a path does not widen scope' },
  { name: 'manifest above the git root is not discovered', keys: '8r', expect: 'ROUTE OK', why: 'finding it would need the very upward walk it is supposed to authorize' },
  { name: 'the same manifest supplied out of band', keys: '8mTgr', expect: 'ROUTE OK', why: 'an out-of-band bootstrap is how a manifest above the git root legitimately arrives' },
  { name: 'manifest with an unknown major schema version', keys: '3Vr', expect: 'REFUSE MANIFEST_MAJOR_VERSION', why: 'autodiscovery is not a silent fallback for a manifest this build cannot parse' },
  { name: 'Tilt root selected, no manifest present', keys: '7br', expect: 'ROUTE OK', why: 'selecting a root authorizes a boundary; it discovers nothing on its own' },
  { name: 'Tilt root with the manifest supplied', keys: '7mTcr', expect: 'ROUTE OK', why: 'declared, present, trusted, and accessible — the full Scenario A result' },
  { name: 'Tilt root before any of that', keys: '7r', expect: 'REFUSE CWD_NOT_A_WORKSPACE', why: 'Scenario A step 2: require explicit selection, and create nothing while discovering' },

  // --- per-harness divergence ----------------------------------------------
  { name: 'federated peer read under Claude Code', keys: '8eemTgx', expect: 'ROUTE OK', why: 'an explicit additional-directory grant makes an independently authorized peer accessible' },
  { name: 'Codex refuses an authorized peer without an additional-directory grant', keys: '8eemThx', expect: 'REFUSE HARNESS_NO_ACCESS', why: 'the manifest widens discovery authority but does not grant filesystem access' },
  { name: 'Codex admits that peer with an explicit --add-dir-style grant', keys: '8eemTghx', expect: 'ROUTE OK', why: 'the grant widens access after independent manifest authorization; it does not widen discovery authority' },

  // --- write routing never widens ------------------------------------------
  { name: 'write with federated peers readable', keys: '8mTgw', expect: 'ROUTE OK', why: 'read scope may federate; the write target stays inside the current repository' },
  { name: 'write at a non-repository workspace root', keys: '4Tcw', expect: 'REFUSE NO_LOCAL_BUNDLE', why: 'a workspace root is a read boundary, never a write target' },
];

function drive(keys: string): World {
  let world = createWorld();
  for (const key of keys) world = step(world, key);
  return world;
}

let mismatches = 0;

for (const scenario of SCENARIOS) {
  const world = drive(scenario.keys);
  const actual = world.last ? `${world.last.verdict} ${world.last.code}` : 'NONE';
  const ok = actual === scenario.expect;
  if (!ok) mismatches++;

  console.log(`${ok ? `${GREEN}✓${R}` : `${RED}MISMATCH${R}`} ${B}${scenario.name}${R}`);
  console.log(`  ${D}keys${R} ${scenario.keys.split('').join(' ')}   ${D}cwd${R} ${world.cwd}`);
  console.log(`  ${D}expect${R} ${scenario.expect}   ${D}actual${R} ${ok ? actual : `${RED}${actual}${R}`}`);
  if (world.last) {
    console.log(`  ${world.last.summary}`);
    for (const d of world.last.detail.slice(0, 3)) console.log(`    ${D}· ${d}${R}`);
  }
  console.log(`  ${D}defends: ${scenario.why}${R}`);
  console.log('');
}

console.log(
  `${B}${SCENARIOS.length - mismatches}/${SCENARIOS.length}${R} scenarios behaved as designed` +
    (mismatches ? ` ${RED}(${mismatches} need a decision)${R}` : ''),
);
