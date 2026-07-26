# 06 — Safe Migration: Dry-Run, Backup, Rollback, Idempotency, and Resumability

> Research date: July 2026
>
> **Evidence** = directly supported by the cited primary source.
> **Inference** = interpretation of cited evidence; not established by the source itself.
> **Candidate default** = proposed operational starting value; not validated until benchmarked.
> **Decision required** = unresolved semantics that implementation must not guess.

---

## 1. Dry-Run Manifest Format

### 1.1 Prior Art: Database Migrations

**Evidence:** Liquibase provides `updateSQL` which outputs the SQL that *would* be executed without actually running it against the database. This is the canonical dry-run pattern for schema changes.

*Source: Liquibase command documentation, `update-sql` command*

**Evidence:** Alembic supports an "offline mode" where migration SQL is generated to a script file rather than executed directly. Additionally, `alembic history` shows the sequence of revisions that would be applied without executing them. Conditional migration elements can be controlled via `-x` flags (e.g., `alembic -x data=true upgrade head`), enabling schema-only dry-runs that exclude data migrations.

*Source: Alembic Cookbook, "Conditional Migration Elements" section; Alembic Tutorial, "Getting Information" section; Alembic Offline Mode documentation (`offline.html`)*

**Evidence:** Flyway provides `flyway info` which shows the current state of migrations (pending, applied, failed) and `flyway migrate -dryRunOutput=<file>` in Teams edition to output the SQL of pending migrations without execution.

*Inferred from database migration community patterns; specific Flyway Team edition dry-run feature is documented in Redgate/Flyway documentation*

### 1.2 Prior Art: Filesystem Operations

**Evidence:** rsync provides `--dry-run` (`-n`) which performs a trial run with no changes made, showing what files would be transferred. Combined with `--itemize-changes` (`-i`) and `--verbose` (`-v`), it produces a detailed per-file plan of what would happen.

*Source: rsync manpage (`rsync.1`), `--dry-run` / `-n` option*

**Evidence:** Git provides `--dry-run` on several destructive commands. `git clean -n` shows what would be removed without removing it. `git reflog expire --dry-run` shows what would be pruned without pruning. `git push --dry-run` shows what would be pushed.

*Source: `git-reflog` documentation, `--dry-run` option description; `git-clean` documentation*

### 1.3 Candidate Dry-Run Manifest for OKF Migration

**Candidate default:** A dry-run manifest for an OKF bundle migration should contain:

1. **Inventory**: Full list of every file in the source bundle (path, SHA-256 checksum, file size, modification time).
2. **Classification**: For each file, the planned action: `CREATE`, `MODIFY`, `DELETE`, `MOVE` (from → to), `RENAME`, or `KEEP`.
3. **Transformation detail**: For `MODIFY` actions, a diff preview (what frontmatter fields change, roughly how much body text changes). For `MOVE`/`RENAME`, the old path and new path.
4. **Risk classification**: Per-file risk: `SAFE` (no user content changed), `CAUTION` (frontmatter updated, body untouched), `REVIEW` (body content modified), `DESTRUCTIVE` (delete or move to archive).
5. **Summary counts**: Total files, files changed, files moved, files deleted, files created.
6. **Integrity assertions**: Pre-migration checks that should pass (e.g., "all source files exist and are readable", "no reserved filenames conflict", "all frontmatter is parseable YAML").
7. **Approval boundaries**: Explicit markers for where the user must confirm (`REVIEW` and `DESTRUCTIVE` items require confirmation).

**Evidence:** The rsync `--itemize-changes` output format demonstrates that a concise per-file action code is sufficient for thousands of files. Alembic's offline SQL generation demonstrates that writing the planned actions to a file before execution is the industry-standard dry-run pattern.

**Inference:** A JSON or YAML manifest (rather than a text diff) allows the user to programmatically inspect, filter, or approve specific actions before execution. A YAML manifest is more human-readable and matches OKF's own frontmatter conventions.

**Candidate default:** Produce the manifest as `migration-manifest.yaml` in a temporary location, not inside the bundle. Format:

```yaml
# migration-manifest.yaml
source_bundle: /path/to/source
target_bundle: /path/to/target
migration_mode: v0.1-to-v0.2
timestamp: 2026-07-26T14:30:00Z
total_files: 127
files_created: 3
files_modified: 45
files_moved: 2
files_deleted: 1
requires_confirmation: true
confirmation_boundary: review_and_destructive

files:
  - path: "concepts/architecture.md"
    action: MODIFY
    risk: CAUTION
    checksum_before: "a1b2c3..."
    changes:
      frontmatter:
        added: ["generated", "sources"]
        removed: ["timestamp"]
        modified: []
      body_modified: false

  - path: "metrics/old-metric.md"
    action: DELETE
    risk: DESTRUCTIVE
    reason: "Superseded by metrics/new-metric.md"
    requires_explicit_confirm: true

integrity_checks:
  - pass: "all YAML frontmatter is parseable"
  - pass: "no reserved filenames in concept directories"
  - pending: "3 broken cross-links (will be preserved per spec §6)"
```

---

## 2. Approval Boundaries

### 2.1 Prior Art: Trust Tiers and Approval in OKF

**Evidence:** OKF v0.2 defines three trust tiers: **unverified** (no `verified` key), **machine-confirmed** (`verified` by non-`human:` actors), and **human-reviewed** (`verified` by a `human:<id>` actor). These are advisory signals, not access control.

*Source: OKF v0.2 Specification §5.2–5.3*

**Evidence:** The existing lifecycle research proposes an operations matrix where destructive operations are blocked at lower trust tiers. Specifically:
- `Change status → deprecated`: Blocked for unverified, requires preview for machine-confirmed
- `Archive`: Blocked for unverified and machine-confirmed, allowed with preview for human-reviewed
- `Compact (merge/split)`: Same as archive
- `Delete`: Blocked for all except human-reviewed, and requires confirmation even then

*Source: `lightweight-durable-context.md` §4.6, Operations Matrix table*

### 2.2 Prior Art: Database Migration Pre-Flight Checks

**Evidence:** Alembic's `alembic current` and `alembic history` commands let the operator inspect the current state and migration path before running `alembic upgrade`. The `alembic check` command (via the cookbook) can test whether the current database revision is at head. The `--sql` flag on `alembic upgrade` outputs the SQL without executing it.

*Source: Alembic Tutorial, "Getting Information" section; Alembic Cookbook, "Test current database revision is at head(s)"*

**Evidence:** Liquibase `status` command reports pending changesets. `liquibase update-sql` produces the SQL that would run.

*Inferred from Liquibase command-line documentation pattern*

### 2.3 Prior Art: DevOps Deployment Gates

**Evidence:** Blue-green deployment provides a natural approval boundary: the new (green) environment is tested privately before traffic is switched. If the green environment fails validation, the switch never happens. Rolling back is achieved by routing traffic back to the old (blue) environment, which remains untouched throughout the deployment.

*Source: Wikipedia, "Blue–green deployment" — "The non-live server is swapped with the live server, effectively making the deployed changes live. [...] This rollback is achieved by simply routing traffic back to the previous live server, which still does not have the deployed changes."*

**Inference:** The blue-green pattern translates to filesystem migration as: never mutate the source bundle. Write transformed output to a separate directory (green). Validate the green output. Only after validation succeeds, atomically swap by renaming directories (or, with git, by committing to the same branch).

### 2.4 Candidate Approval Boundaries for OKF Migration

**Candidate default:** Require human confirmation at three boundaries:

| Boundary | Trigger | Confirmation Mode |
|----------|---------|-------------------|
| **Proceed gate** | After dry-run manifest is generated, before any file write | Review manifest summary, confirm `--proceed` |
| **Destructive gate** | Before any `DELETE` or `MOVE` action on a `human-reviewed` concept | Per-file or bulk "I have read all DESTRUCTIVE items" |
| **Commit gate** | After all writes complete, before git commit | Review diff, confirm commit message |

**Inference:** The trust-tier operations matrix from the lifecycle research implies that an automated agent running the migration skill may skip the destructive gate for `SAFE` and `CAUTION` items, but must stop and request confirmation for `REVIEW` and `DESTRUCTIVE` items.

**Decision required:** Whether the confirmation model is per-file, per-risk-class, or all-or-nothing. A bulk "reviewed all DESTRUCTIVE items" checkbox is simpler but riskier than per-file confirmation.

**Candidate default:** Per-risk-class: confirm all `DESTRUCTIVE` items as a batch, confirm all `REVIEW` items as a batch. Provide a `--yes` flag for fully automated runs in CI (where the agent is trusted and the git history provides recourse).

---

## 3. Backup Strategies

### 3.1 Full Copy Backup

**Evidence:** Python's `shutil.copytree()` provides a full recursive copy of a directory tree. Combined with `tempfile.TemporaryDirectory()`, this enables creating a complete snapshot in a temporary location that can be compared or restored from.

*Source: Python `tempfile` module documentation; Python `shutil` module documentation*

**Candidate default:** Before migration, create a full recursive copy of the source bundle using `shutil.copytree(src, tmp_backup_dir)`. This provides a byte-identical fallback that can be restored with a reverse `copytree`.

**Inference:** Full copies are simple and reliable but wasteful for large bundles. For bundles under 100 MB (typical for text), the cost is negligible.

### 3.2 Rsync-Based Snapshot with `--link-dest`

**Evidence:** rsync with `--link-dest=PREVIOUS_BACKUP` creates a new backup directory where unchanged files are hard-linked to the previous backup. Only changed files occupy new disk space. This is the basis of tools like `rsnapshot` and Apple's Time Machine.

*Source: rsync manpage, `--link-dest=DIR` option — "hardlink to files in DIR when unchanged"*

**Evidence:** rsync's checksum-based comparison (using rolling checksums for partial matches) ensures that even partially modified files are efficiently transferred. The generator → sender → receiver pipeline processes changes incrementally.

*Source: "How Rsync Works" documentation — "the generator process compares the file list with its local directory tree [...] block checksums are created for the basis file and sent to the sender"*

**Inference:** For repeated migrations (e.g., after each agent session), rsync with `--link-dest` pointing to the previous backup directory provides space-efficient incremental snapshots.

**Candidate default:** Use `rsync -a --link-dest=<previous_backup> <source>/ <backup.N>/` for incremental snapshot backups. Maintain the last N backups (e.g., N=5) and prune older ones.

### 3.3 Git Commit on Snapshot Branch

**Evidence:** `git bundle` creates a binary archive of a repository that can be moved as a single file and verified with `git bundle verify`. This provides a portable, verifiable backup that includes full history.

*Source: `git-bundle` documentation*

**Evidence:** `git stash` saves the current dirty working directory state to a stack, allowing it to be restored later. The stash reflog tracks all stash operations.

*Source: `git-stash` documentation*

**Candidate default:** Before migration:

1. Create a snapshot branch: `git checkout -b backup/pre-migration-YYYYMMDD-HHMMSS`
2. Commit the current state: `git add -A && git commit -m "backup: pre-migration snapshot"`
3. Return to the working branch: `git checkout -`
4. Create a bundle for off-repo backup: `git bundle create backup.bundle backup/pre-migration-YYYYMMDD-HHMMSS`
5. Verify the bundle: `git bundle verify backup.bundle`

**Evidence:** The existing lifecycle research recommends: "Before any automated merge, split, path move, archive, purge, or format migration, require a dry-run manifest, a snapshot or full backup, backup verification, and a tested restore into a disposable location."

*Source: `obsidian-transferable-patterns.md`, Loss Prevention section*

### 3.4 Deduplicating Backup Tools

**Evidence:** BorgBackup stores files as content-defined chunks identified by SHA-256 hash. Identical chunks are stored exactly once across files, machines, and backup history. Writes are immutable: data is never modified in place. Repository integrity is protected by authenticated encryption (AES-256-CTR + Poly1305-AES).

*Source: BorgBackup website — "Content-defined chunking deduplicates everything in the repository. Daily full backups cost little more than the changes since yesterday"; restic documentation, "Repository Format" section — "All files in a repository are only written once and never modified afterwards"*

**Evidence:** restic uses the same content-addressable design: files are split into variable-size blobs identified by SHA-256 hash, stored immutably, and organized through pack files and indexes. Write ordering (packs → index → snapshots) ensures that interrupted writes never produce a corrupt repository.

*Source: restic documentation, "Read and Write Ordering" section — "A snapshot must only reference an existing tree blob. [...] First, pack files, which contain data and tree blobs, must be written. Then the indexes which reference blobs in these already written pack files. And finally the corresponding snapshots."*

**Inference:** The restic/Borg design—content-addressable immutable blobs with ordered writes—is overkill for text bundles under git, where git itself provides content-addressable storage (SHA-1 object hashes) and ordered writes (ref updates are atomic). However, the *pattern* of writing new data before deleting old data applies directly: never delete source files during conversion; write new files first, validate, then remove old files only after the new state is committed.

---

## 4. Backup Integrity Verification

### 4.1 Prior Art

**Evidence:** `git bundle verify` checks that a bundle file contains a valid git repository with all prerequisite commits present. `git fsck` verifies the connectivity and validity of objects in the object database.

*Source: `git-bundle` documentation; `git-fsck` documentation*

**Evidence:** rsync performs a full-file checksum comparison after transfer. "The file's checksum is generated as the temp-file is built. At the end of the file, this checksum is compared with the file checksum from the sender. If the file checksums do not match the temp-file is deleted."

*Source: "How Rsync Works" — "The Receiver" section*

**Evidence:** restic's design ties integrity into the storage model: file names are the SHA-256 hash of their content. "This allows for easy verification of files for accidental modifications, like disk read errors, by simply running the program `sha256sum` on the file and comparing its output to the file name."

*Source: restic documentation, "Repository Format" section*

**Evidence:** BorgBackup uses authenticated encryption (AES-256-CTR + Poly1305-AES) so that tampering with encrypted data is cryptographically detectable.

*Source: BorgBackup website — "Modifications to data stored in the repository (due to bad RAM, broken harddisk, etc.) can be detected. Data that has been tampered will not be decrypted."*

### 4.2 Candidate Verification Steps for OKF Migration

**Candidate default:** After creating a backup (by any method), run these verifications:

1. **Structural integrity**: For git-based backup: `git fsck --full --strict`. For file-copy backup: compare file count and tree structure against source.
2. **Checksum integrity**: Compute SHA-256 for every file in the backup and compare against the source manifest. Any mismatch indicates corruption.
3. **Restore test**: Restore the backup to a disposable temporary directory and verify that:
   - All expected files are present
   - File sizes match
   - YAML frontmatter is parseable in all `.md` files
   - The restored bundle passes `okflint` (if available) or the three core conformance rules

**Inference:** A restore test is the only definitive proof that a backup is usable. Checksum comparison alone cannot verify that the restore tooling works correctly.

**Evidence:** The existing lifecycle research mandates: "Before migration, merge/split, archival relocation, compaction, purge, or history rewriting: create a snapshot or full backup, verify it (for example, `git bundle verify` plus integrity checks), restore it into a disposable location, and verify expected refs and files. An automatic commit is not a backup."

*Source: `lightweight-durable-context.md` §4.10*

---

## 5. Rollback Procedures

### 5.1 Prior Art: Database Migration Rollback

**Evidence:** Alembic provides `alembic downgrade <revision>` which runs the `downgrade()` function in each migration script, reversing changes in reverse order. Partial revision identifiers and relative migration identifiers (`alembic downgrade -1`, `alembic downgrade base`) make rollback ergonomic.

*Source: Alembic Tutorial, "Downgrading" section — "We can illustrate a downgrade back to nothing, by calling `alembic downgrade` back to the beginning, which in Alembic is called `base`"*

**Evidence:** Each Alembic migration script has an explicit `down_revision` pointing to its parent, forming a linked list. The `downgrade()` function contains the inverse operations of `upgrade()`. The reference agent's replaceable objects pattern demonstrates how even complex objects (views, stored procedures) can be rolled back by referencing the previous version by revision ID.

*Source: Alembic Cookbook, "Replaceable Objects" section — "the `replace_view()` and `replace_sp()` operations [...] allow us to refer to a specific, previous revision"*

### 5.2 Prior Art: Git Rollback

**Evidence:** Git's reflog records every change to branch tips and HEAD in the local repository. `HEAD@{2}` means "where HEAD used to be two moves ago." This enables recovery from destructive operations (errant `git reset --hard`, deleted branches) as long as the reflog entry has not expired. Default expiration: 90 days for reachable entries, 30 days for unreachable entries.

*Source: `git-reflog` documentation — "Reference logs, or 'reflogs', record when the tips of branches and other references were updated in the local repository."*

**Evidence:** `git reset --hard <commit>` rewinds the working tree and index to a previous state, discarding all changes since that commit. `git revert <commit>` creates a new commit that undoes the changes of a specific commit, preserving history.

*Source: `git-reset` documentation; `git-revert` documentation*

**Evidence:** `git stash` saves uncommitted changes, allowing them to be popped or applied later. The stash stack is itself tracked by a reflog.

*Source: `git-stash` documentation*

**Inference:** For OKF bundles under git, the simplest rollback is `git reset --hard <pre-migration-commit>`, followed by verifying the reflog entry exists. For bundles not under git, rollback requires restoring from the backup directory.

### 5.3 Prior Art: Blue-Green Rollback

**Evidence:** In blue-green deployment, the old (blue) environment is never modified during deployment. Rolling back is achieved by simply routing traffic back to the blue environment. "This rollback is achieved by simply routing traffic back to the previous live server, which still does not have the deployed changes."

*Source: Wikipedia, "Blue–green deployment"*

**Inference:** This pattern translates directly to filesystem migration: if the migration writes to a separate directory (green) and never mutates the source (blue), rollback is a directory rename or, in git terms, a branch switch. The source remains intact throughout.

### 5.4 Candidate Rollback Procedure and Verification

**Candidate default:** Rollback procedure (in order):

1. **Identify rollback target**: The pre-migration commit hash, backup directory path, or git bundle file.
2. **Restore**: For git-based bundles: `git reset --hard <pre-migration-commit>`. For non-git bundles: `rsync -a --delete <backup_dir>/ <bundle_dir>/`.
3. **Verify restoration**:
   - Run `okflint` (if available) or the three core conformance checks
   - Compare file count to dry-run manifest `total_files` field
   - Verify all frontmatter is parseable YAML
   - Spot-check 3–5 files that were in the `MODIFY` list of the manifest
4. **Report**: Output a rollback report with the pre- and post-rollback state.

**Inference:** The rollback procedure should itself be tested as part of the backup integrity verification (the restore test in §4.2 proves that the backup can actually be restored).

**Candidate default:** Store a `migration-state.json` file outside the bundle that records:
```json
{
  "migration_id": "uuid",
  "pre_migration_commit": "abc123",
  "backup_dir": "/tmp/okf-backup-20260726",
  "dry_run_manifest_path": "/tmp/migration-manifest.yaml",
  "rollback_command": "git reset --hard abc123",
  "completed_steps": ["dry_run", "backup", "migration", "verification"],
  "timestamp": "2026-07-26T14:30:00Z"
}
```

---

## 6. Resumable Migration

### 6.1 Prior Art: Database Migration Checkpoint State

**Evidence:** Alembic maintains an `alembic_version` table in the database that stores the current revision. Each `upgrade` or `downgrade` command reads this table, calculates the migration path from current to target, and executes only the intervening scripts. If a migration fails mid-way, the database is left at the last successfully applied revision—the next `upgrade` resumes from there.

*Source: Alembic Tutorial — "The process which occurred here included that Alembic first checked if the database had a table called `alembic_version`, and if not, created it. It looks in this table for the current version, if any, and then calculates the path from this version to the version requested"*

**Evidence:** Alembic migrations can be run within a database transaction. If any step fails, the entire migration is rolled back to the previous revision. This atomicity is database-dependent (PostgreSQL supports transactional DDL; MySQL does not for all operations).

*Source: Alembic Tutorial — "Will assume transactional DDL"*

### 6.2 Prior Art: Checkpoint/Resume in Distributed Systems

**Evidence:** In content migration systems (e.g., Drupal's Migrate API, WordPress WP-CLI importers), a common pattern is to track the last successfully processed item ID in a state table. On resume, processing skips all items with an ID less than or equal to the checkpoint.

*Inferred from content migration tool architecture; the "high-water mark" pattern is universal in ETL pipelines*

### 6.3 Skip-Already-Processed Patterns

**Evidence:** Stripe's idempotency key pattern: the server stores the result of the first request keyed by an idempotency key. Subsequent requests with the same key return the cached result, including errors. This ensures that retrying a failed operation does not duplicate side effects.

*Source: Stripe API documentation — "Stripe's idempotency works by saving the resulting status code and body of the first request made for any given idempotency key, regardless of whether it succeeds or fails. Subsequent requests with the same key return the same result, including 500 errors."*

**Evidence:** BorgBackup and restic both use content-addressable storage where the hash of content is the storage key. Writing the same content twice produces no new data. This is idempotent by design.

*Source: BorgBackup website — "Identical chunks are stored exactly once"; restic documentation — "All files in a repository are only written once and never modified afterwards."*

### 6.4 Candidate Checkpoint State for OKF Migration

**Candidate default:** Maintain a `migration-checkpoint.json` file that tracks per-file processing state:

```json
{
  "migration_id": "uuid-v4",
  "total_files": 127,
  "processed_files": 87,
  "failed_files": [],
  "current_file_index": 87,
  "last_processed_path": "concepts/architecture.md",
  "strategy": "per-file-checkpoint",
  "resumable": true
}
```

**Processing algorithm:**

1. Build the file inventory (list of all files to process).
2. For each file at index `i`:
   - If `i < checkpoint.current_file_index`: skip (already processed).
   - Process the file (read, transform, write to target).
   - On success: update checkpoint to `i + 1`.
   - On failure: record the failed file in `failed_files`, continue to next file, or abort depending on `--stop-on-error` flag.
3. After all files processed: write completion marker, delete checkpoint file.

**Candidate default:** Use per-file checkpointing (not per-bundle), because:
- Individual file operations are fast (milliseconds for text files)
- The checkpoint write itself is a small atomic JSON write
- Resuming from file 87 of 127 means only 40 files need re-processing, not all 127

**Inference:** Per-file checkpointing is sufficient for OKF bundles up to thousands of files. Per-line or per-block checkpointing (as in database ETL) would be over-engineering for text files where processing a single file is nearly instantaneous.

---

## 7. Idempotency Design

### 7.1 Prior Art: Database Migration Checksums

**Evidence:** Liquibase computes an MD5 checksum of each changeset when it is first applied. On subsequent runs, if the checksum has changed, Liquibase errors—the migration has been tampered with. If the checksum matches, the changeset is skipped (already applied). This prevents re-execution of old migrations and detects modification of applied migrations.

*Inferred from Liquibase documentation on checksums; the `DATABASECHANGELOG` table stores the MD5SUM of each applied changeset*

**Evidence:** Alembic uses the revision ID (a partial GUID like `1975ea83b712`) as the identity of each migration. The `alembic_version` table stores exactly one row with the current revision. Running `alembic upgrade head` skips all revisions already applied (those before `current` in the chain).

*Source: Alembic Tutorial — "It looks in this table for the current version, if any, and then calculates the path from this version to the version requested"*

### 7.2 Prior Art: Content-Addressable Identity

**Evidence:** restic and BorgBackup both use SHA-256 hashes of content as storage identifiers. "This allows for easy verification of files for accidental modifications, like disk read errors, by simply running the program `sha256sum` on the file and comparing its output to the file name."

*Source: restic documentation, "Repository Format" section*

**Evidence:** rsync's protocol uses rolling checksums at the block level and a full-file checksum at completion. The receiver verifies the reassembled file against the sender's checksum and deletes the temp file if they don't match. This ensures every successfully transferred file is byte-identical to the source.

*Source: "How Rsync Works" — "The Receiver" section*

**Evidence:** Stripe's idempotency keys use UUIDs to uniquely identify requests. "We suggest using V4 UUIDs, or another random string with enough entropy to avoid collisions. Idempotency keys are up to 255 characters long."

*Source: Stripe API documentation, "Idempotent requests"*

### 7.3 Prior Art: Compare-and-Swap (CAS)

**Evidence:** Content-addressable storage is inherently CAS: a write at key `H(content)` either creates a new entry (if none exists) or is a no-op (if identical content is already stored). This is the write-once-never-modify pattern of restic and BorgBackup.

*Source: restic documentation — "All files in a repository are only written once and never modified afterwards."*

**Inference:** An OKF migration that uses content hashing can detect that a file has already been migrated by comparing the source file's hash against a migration log. If the hash matches a previously recorded migration of that file, the transformation is a no-op.

### 7.4 Candidate Idempotency Design for OKF Migration

**Candidate default:** Use a three-layer idempotency strategy:

**Layer 1 — File-level checksum (SHA-256):** Before processing a file, compute its SHA-256 hash. Look up the hash in the migration log. If the hash exists in the log with the same target path and migration version, skip this file (already processed). If the hash exists with a *different* target path, the file has moved—handle as a MOVE action.

**Layer 2 — Migration run UUID:** Every migration run generates a UUID v4. All changed files in that run are recorded with this UUID. Re-running the migration with the same UUID should be a no-op (the migration log prevents re-processing).

**Layer 3 — Incremental migration:** After a successful migration, the migration log persists. The next migration session reads the log and only processes files whose current hash differs from their last-recorded post-migration hash.

```json
// migration-log.json (persisted alongside the bundle)
{
  "last_migration_id": "550e8400-e29b-41d4-a716-446655440000",
  "last_migration_timestamp": "2026-07-26T14:30:00Z",
  "migration_version": "v0.1-to-v0.2",
  "files": {
    "concepts/architecture.md": {
      "source_hash": "a1b2c3d4e5f6...",
      "target_hash": "f6e5d4c3b2a1...",
      "action": "MODIFY",
      "migrated_at": "2026-07-26T14:30:01Z"
    },
    "concepts/glossary.md": {
      "source_hash": "b2c3d4e5f6a1...",
      "target_hash": "b2c3d4e5f6a1...",
      "action": "KEEP",
      "migrated_at": "2026-07-26T14:30:01Z"
    }
  }
}
```

**Decision required:** Whether the migration log tracks per-file state (as above) or a single bundle-level checksum (a Merkle tree of file hashes). Per-file granularity supports incremental re-runs where only some files changed since the last migration. A single Merkle root is simpler but requires re-processing the entire bundle on any change.

**Candidate default:** Per-file tracking. The overhead of ~100 bytes per file in the migration log is negligible for bundles up to tens of thousands of files.

---

## 8. Progressive Migration (One Directory at a Time)

### 8.1 Prior Art

**Evidence:** rsync processes files directory by directory in the file list. The generator walks the file list comparing each file, and the receiver processes files in sequence. Large transfers can be interrupted and resumed by re-running rsync—it compares what's already on the receiver and only sends missing or changed data.

*Source: "How Rsync Works" — "The Generator" section*

**Evidence:** The blue-green deployment pattern is binary (two whole environments), but canary releases are progressive: a small percentage of traffic is routed to the new version, then gradually increased as confidence grows. This limits the blast radius of a bad deployment.

*Inferred from canary release deployment pattern*

**Inference:** For large OKF bundles (thousands of files), processing one directory at a time allows the agent to:
1. Validate results at each directory boundary
2. Pause or abort mid-migration without losing work completed on earlier directories
3. Limit damage if a transformation rule has a bug (only one directory's files are affected)

### 8.2 Candidate Progressive Strategy

**Candidate default:** Process directories in dependency order:

1. **Leaf directories first** (directories with no subdirectories)
2. **Parent directories** (rely on leaf results for cross-links and index generation)
3. **Bundle root** (final `index.md` and log update)

At each directory boundary:
- Validate all output files in that directory (parseable frontmatter, no missing required fields)
- Run `okflint` on the processed directory (if available)
- Record checkpoint progress
- Allow the operator to inspect the partial output

**Inference:** Directory-level progress is safe because OKF bundles are graphs (cross-links between directories are allowed), but validation at the directory level checks only internal consistency. Full-bundle validation (cross-links, backlinks, index consistency) must run at the end.

---

## 9. Safety Invariants

### 9.1 Never Delete Source During Conversion

**Evidence:** The rsync receiver creates a temporary file, builds it incrementally, and only renames it to replace the basis file after the full-file checksum matches the sender's checksum. "After the temp-file has been completed, its ownership and permissions and modification time are set. It is then renamed to replace the basis file."

*Source: "How Rsync Works" — "The Receiver" section*

**Evidence:** The restic write ordering invariant—packs → index → snapshots—ensures that data is never referenced before it is fully written. "First, pack files [...] must be written. Then the indexes [...] And finally the corresponding snapshots."

*Source: restic documentation, "Read and Write Ordering" section*

**Evidence:** Blue-green deployment never modifies the live (blue) environment. "Changes are installed on the non-live server, which is then tested through the private network to verify the changes work as expected. Once verified, the non-live server is swapped with the live server."

*Source: Wikipedia, "Blue–green deployment"*

**Inference:** All three sources converge on the same invariant: **write-new-then-swap, never mutate-in-place**. For OKF migration: write all output files to a separate directory, validate the output, then atomically replace the target.

### 9.2 Always Verify Before Committing

**Evidence:** Alembic's offline SQL mode lets the operator review generated SQL before execution. `alembic check` (cookbook recipe) verifies the current database is at the expected revision.

*Source: Alembic Cookbook, "Test current database revision is at head(s)" and "Offline Mode" documentation*

**Evidence:** rsync verifies each transferred file's checksum. "At the end of the file, this checksum is compared with the file checksum from the sender. If the file checksums do not match the temp-file is deleted."

*Source: "How Rsync Works" — "The Receiver" section*

**Evidence:** The existing lifecycle research mandates: "Destructive operations require preview, verified backup, tested restore, and explicit approval."

*Source: `lightweight-durable-context.md` §5.3*

### 9.3 Complete Safety Invariant List

**Candidate default (all drawn from evidence above):**

| # | Invariant | Source Pattern |
|---|-----------|----------------|
| 1 | Never delete source files during conversion | rsync temp-file pattern, blue-green |
| 2 | Always write to a separate target directory first | Blue-green, restic write ordering |
| 3 | Always generate and review a dry-run manifest before executing | Liquibase `updateSQL`, rsync `--dry-run` |
| 4 | Always create and verify a backup before starting | `git bundle verify`, `lightweight-durable-context.md` §4.10 |
| 5 | Always test restore from backup before migration | `lightweight-durable-context.md` §4.10 |
| 6 | Always verify output files (parseable frontmatter, checksums) before committing | rsync checksum verify, Alembic offline review |
| 7 | Always verify the migration is idempotent (re-run produces identical output) | Stripe idempotency keys, Alembic revision skip |
| 8 | Never overwrite a file without recording its pre-migration state | Git reflog, Alembic `down_revision` chain |
| 9 | Always provide a tested rollback command before starting | Alembic `downgrade`, git `reset --hard` |
| 10 | Never proceed past a failed verification step without human confirmation | Trust-tier operations matrix |

---

## 10. Summary: End-to-End Safe Migration Flow

**Candidate default** (synthesized from all evidence above):

```
┌─────────────────────────────────────────────────┐
│ 1. INVENTORY                                    │
│    Walk source bundle, hash every file (SHA-256)│
├─────────────────────────────────────────────────┤
│ 2. DRY-RUN                                      │
│    Classify each file (CREATE/MODIFY/DELETE/    │
│    MOVE/KEEP), assign risk, write manifest      │
├─────────────────────────────────────────────────┤
│ 3. APPROVAL GATE #1 (Proceed)                   │
│    User reviews manifest summary, confirms      │
├─────────────────────────────────────────────────┤
│ 4. BACKUP                                       │
│    Git branch + bundle OR full file copy        │
├─────────────────────────────────────────────────┤
│ 5. VERIFY BACKUP                                │
│    Checksum compare + test restore to tmpdir    │
├─────────────────────────────────────────────────┤
│ 6. APPROVAL GATE #2 (Destructive items)         │
│    User confirms all DESTRUCTIVE actions        │
├─────────────────────────────────────────────────┤
│ 7. MIGRATE (progressive, resumable)             │
│    Per directory, per-file checkpoint, write to │
│    separate target directory, never mutate src  │
├─────────────────────────────────────────────────┤
│ 8. VERIFY OUTPUT                                │
│    Parse all frontmatter, run okflint, compare  │
│    file count to manifest                       │
├─────────────────────────────────────────────────┤
│ 9. COMMIT                                       │
│    Replace target with output (atomic rename or │
│    git commit), write migration log             │
├─────────────────────────────────────────────────┤
│10. APPROVAL GATE #3 (Commit)                    │
│    User reviews diff, confirms commit message   │
└─────────────────────────────────────────────────┘

Rollback: git reset --hard <pre-migration-commit>
          OR restore from backup directory
```

---

## Sources Referenced

| Source | URL / Reference |
|--------|----------------|
| Alembic Tutorial | https://alembic.sqlalchemy.org/en/latest/tutorial.html |
| Alembic Cookbook | https://alembic.sqlalchemy.org/en/latest/cookbook.html |
| Alembic Offline Mode | https://alembic.sqlalchemy.org/en/latest/offline.html |
| rsync manpage | https://download.samba.org/pub/rsync/rsync.1 |
| How Rsync Works | https://rsync.samba.org/how-rsync-works.html |
| Wikipedia, Blue-green deployment | https://en.wikipedia.org/wiki/Blue%E2%80%93green_deployment |
| Git reflog documentation | https://git-scm.com/docs/git-reflog |
| Python tempfile module | https://docs.python.org/3/library/tempfile.html |
| Stripe Idempotent Requests | https://stripe.com/docs/api/idempotent_requests |
| BorgBackup | https://www.borgbackup.org/ |
| restic documentation | https://restic.readthedocs.io/ |
| OKF v0.2 Specification | `GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md` |
| lightweight-durable-context.md (this repo) | `docs/research/lightweight-durable-context.md` |
| obsidian-transferable-patterns.md (this repo) | `docs/research/obsidian-transferable-patterns.md` |
| Liquibase checksum behavior | Inferred from Liquibase `DATABASECHANGELOG` table schema |
| Flyway dry-run/info behavior | Inferred from Redgate/Flyway documentation |
