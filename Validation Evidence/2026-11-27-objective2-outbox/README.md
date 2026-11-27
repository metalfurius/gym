# Objective 2: cross-tab outbox correction

Historical checkpoint: **c0318eebc37e9377d780eac535761ce22eb6648d**.
These source hashes identify that checkpoint, not subsequent frontend heads.
The later independent pending-barrier finding and its correction are recorded
separately in `../2026-11-27-objective2-barriers/README.md`.

Status: local correction evidence, **not objective closure or permission to
publish**. Base `660aaeb534a051c89d809f4903780e4cd197bc74` passed 996 tests but
was rejected in an independent GPT-6.1-Sol xhigh preliminary audit. Two already
open pages replaced the shared v1 queue with stale whole-array snapshots,
losing an acknowledged pending intent; stale pages could also resurrect an
acknowledged operation. The judge reproduced both boundaries and demonstrated
the lost intent in real Chrome/localStorage/IndexedDB.

## Correction and compatibility

The v2 outbox uses separate durable records for each stable queue identity,
conflict marker and acknowledgement tombstone. It does not infer an
acknowledgement from an operation missing from one tab's snapshot. The existing
v1 array remains a read-only migration source, including work appended late by
an old tab. An acknowledgement permanently dominates imported or stale copies
of its intent. Conflicts survive stale pending snapshots until explicit
resolution acknowledges those IDs. Another tab's additions are not erased.

`getPersistedEntries` enumerates actual durable stores, bypassing the memory
cache. Both durable copies must finish before a save acknowledges success;
superseded writes and unavailable/mismatched storage reject rather than report
durability. Partial writes after a crash remain observable. Each restore
refreshes durable state, including already initialized tabs. Original owner,
timestamps and descriptors survive. Existing owner quarantine and server
receipt/idempotency rules remain in force; no server rule was weakened.

Acknowledgement tombstones are deliberately retained with no TTL. No unsafe
compaction is implemented: quota failure is reported without promising queued
success. A future compactor would need a proof that stale tabs/legacy sources
cannot reintroduce an acknowledged identity.

## Executed validation and limitations

- Full local suite after adding the journal/cache asset: **69 suites / 1005
  tests pass**, 80.22% statements / 82.75% lines. Console log is
  `coverage-before-final-small-adjustment.txt`. This precedes one small final
  change restricting completion tombstones to serializable operations and the
  CI command/fixture wiring. Final-source hosted checks are required separately.
- Final focused queue/cache suite after that change: **4 suites / 62 tests
  pass**; final lint and release integrity pass. The release is still
  **unpublished v2.8.5**, now 73 cached assets, including the new imported module.
- `browser-positive.json`: actual Chrome **158.0.8127.36**, fresh isolated
  profile, multiple pages importing production modules, real localStorage and
  IndexedDB. Close/reopen retains A+B; acknowledgement plus a stale persist
  retains B+C without resurrecting A; conflict survives stale persist; explicit
  resolution retains only C. Durable local/disk event sets match at every
  inspected stage. No Firebase/backend/account data is involved.
- `browser-negative-660.json` and `negative-control.txt`: the same fixture
  copied to a clean detached **660aaeb** worktree exits **1** at the first
  assertion because cold reopen contains only B, missing A. It fails for the
  intended data-loss regression, before calling the new durable enumeration API.
- The first positive launch used an incorrect executable path and failed
  ENOENT before spawning Chrome; the corrected explicit pinned path passed.
  The first broad suite before cache metadata regeneration had **1001 passes /
  3 failures**, all stale asset/import-manifest checks. Adding the required
  cached module and regenerating the unpublished release resolved those
  failures; they were not skipped or relaxed.

Reproduction: `npm run test:e2e:outbox`. The required shared `Run Tests` job now
runs it and uploads full JSON/trace in the Chromium upgrade artifact. Local
trace is retained at
`C:/tmp/gym-roadmap-02-outbox-browser-final/trace.json`; the source manifest
  records its hash. Console logs normalize CRLF and strip trailing table-padding
  whitespace only. This is a multi-tab storage check on one Windows browser,
**not** real Firebase/two-device/iOS evidence.

`source-manifest.json` hashes canonical staged Git source bytes (LF, preserving
any BOM), separately from local artifact bytes. The earlier November 20/27
ledgers remain historical/preintegration evidence. Backend deployment,
attestation, final real-client acceptance and two independent final exact-head
approvals remain outstanding. No merge or publication is authorized by this
local ledger alone.
