# Objective 2 resumed correction evidence — November 27

Status: local implementation/gates passed; ready for parent integration and
candidate freeze. Objective acceptance remains open.

Local worktree `C:\tmp\gym-roadmap-02`, branch `codex/roadmap-02-history-sync`.
Source is intentionally uncommitted on rejected parent head
`a34b337293f4271c8c28dbcd672dd578c7d99b22` (original integration base
`54e83fbfb263be2e601e1db3d2074275329de40e`). Parent owns final integration,
version bump, frozen SHA, backend rules/deployment, live runs and independent
reviews. This implementer has made no backend/account writes, commit, push or
merge. No objective completion or published release is claimed.

## Confirmed reproductions and corrections

The earlier judge findings and raw before outputs are in the
[historical review record](../2026-11-20-objective2/review-fixes/README.md).
They include swallowed IDB deletion failure/cold resurrection, stale Quick Log
continuation erasing B notes, first scalar-7 finalization incorrectly using 3,
Progress initial list cancellation by period changes, legacy semantic merges
retaining revision/operation ID and legacy session writes bypassing the counter.

Two additional real-module/app reproductions were observed during corrections:

- A cache completion failure after an accepted Quick Log returned an error; the
  normal user retry created two different session IDs. Verified preflight barriers
  now preserve the accepted server result, even if cache completion fails.
  `writeSessionDocument()` returns `invalidationVerified:true`; mutation publication
  reuses that proof, bumps memory/read generations and refreshes subscribers.
  The app regression asserts one persisted ID, safe cold cache and recovery after
  reopening without a pending queue entry.
- Create ID → lost acknowledgement → delete ID → replay the original create
  restored the deleted document. The new real-module regression failed with
  `exists:true`, expected false. The [raw before summary](../2026-11-20-objective2/review-fixes/create-delete-replay-before.json)
  records that observed failure. Immutable per-ID receipts and delete tombstones
  now prevent replay resurrection, including legacy IDs and concurrent create/
  delete in either commit order. An actual-app regression deletes through History
  and replays the original Quick Log descriptor, asserting the ID and Hub count
  remain absent/zero.

## Receipt and cache-recovery contract

The parent approved this client/rules contract before implementation:

`users/{uid}/session_mutations/{sessionId}/receipts/{kind}`, `kind=create|delete`,
exactly `{sessionId,kind,changed:boolean,revision:nonnegative integer}`. Receipts
are create-only, immutable and undeletable. A real session change, next counter
with unchanged `{revision,lastSessionId}` schema and receipt commit atomically.
A legacy existing create gets `changed:false`; an absent delete gets a permanent
`changed:false` tombstone. Both preserve the counter. A previous create receipt
or delete tombstone makes any create replay a no-op, even after deletion.

Each client transaction reads four documents and performs three writes for a
real change. A replay with an existing receipt performs zero writes. These SDK
counts are asserted; they do not establish Firestore rules' 10/20 access limits.
Only the parent's real emulator tests can establish those limits and server
enforcement. This checkout contains no new backend rules files.

Pending-cache recovery uses authoritative immutable receipt reads, never current
session existence/absence. Create may settle from its create receipt or a delete
tombstone; delete requires a delete receipt. Ordinary auth/refresh eviction keeps
unknown pending barriers intact. Proof deduplicates per mutation and owner, checks
auth generation and unchanged pending identity, then writes verified eviction
epochs so old data remains rejected while new cache writes can resume. Missing,
cached or pending proof keeps affected data limited; reconnect retries. Routine
recovery with no pending barriers performs no session/receipt reads. Tests cover
unresolved create/delete, cached proof, tombstone recovery and A → B → A.

## Current verification

The parent/judge also reproduced a server-rules ordering case with SDK 11.6.1 and
the real emulator: two concurrent transactions read the same revision, one wins,
the other gets `permission-denied` without an SDK retry. This is emulator evidence
owned separately by the parent, not a reported live incident. The client now has
a bounded, proof-gated retry: only a strictly higher server revision, current
global/UID epoch and original auth generation permit another transaction. The
retried transaction revalidates policy documents; normal success adds no proof
reads. There are at most three external transaction calls. Permanent denial and
invalid proof remain failures. Exhausted owned intents persist without changing
IDs/timestamps/weekly bases, including deletion; derived outcomes retain only an
owner-specific fresh-recompute intent. Generic mock authorization is evaluated
before MVCC preconditions so source tests reproduce the actual error ordering
without implementing workout-specific rules in the mock.

The November 20 942-test run is historical and does not verify these later
changes. The following checks ran against the current uncommitted source. No
application/test source changed after the final full coverage/browser runs;
subsequent edits only close evidence records, hashes and their LF attributes.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | Clean lockfile installation; package/lockfiles unchanged. Existing audit output: 21 vulnerabilities (1 low, 13 moderate, 7 high); no dependency changes in this objective. |
| `npm run lint:ratchet` | 0 | No warnings/errors. |
| `npm run test:no-skips` | 0 | No skipped test declarations. |
| `npm run test:app` | 0 | 6 suites / 6 actual-app journeys. |
| `npm run test:app:offline` | 0 | 2 suites / 2 offline journeys. |
| `npm run release:write` | 0 | Local v2.8.5, 72 cached assets, no version bump. |
| `npm run release:check` | 0 | Current graph verified; deterministic v2.8.5 → v2.8.6 fixture passed. |
| `npm run test:coverage:gate` | 0 | **66 suites / 972 tests passed**, statements **80.09%**, lines **82.56%**; required statements >=70%. |
| `npm run test:e2e:upgrade` | 0 | Controlled Chromium shell upgrade, exact draft preservation, explicit update action, offline restart and online recovery passed. Console/exceptions empty. |
| `git diff --check` | 0 | No whitespace errors. |

An initial resumed full coverage pass before the new denial-retry cases had
954 tests pass and one account-suggestion fixture fail. Its fixed session date
November 19 had expired against the real seven-day suggestion TTL on November
27. The fixture now injects a separately anchored **advancing elapsed clock** at
November 20, independently of the app's calendar reference. Runtime TTL behavior
was unchanged; deferred-UI timeouts still advance. The focused case and final
complete run passed. Early focused checks also caught the weekly UI's permanent-
error path incorrectly dropping a retry-exhausted outbox intent; it now retains
the exact original ID/base/timestamp, with an actual UI regression.

Runtime: Windows NT 10.0.26200.0, Node v24.12.0, npm 11.6.2. Local release metadata
remains **v2.8.5**, regenerated without a version bump; it is not a deployed
release. Parent will regenerate after integration/freeze preparation.

The browser command used PowerShell
`$env:UPGRADE_SMOKE_EVIDENCE_DIR = 'C:/tmp/gym-roadmap-02/Validation Evidence/2026-11-27-objective2/upgrade'`.
Browser: Chrome **158.0.8127.37**. `upgrade/` contains raw evidence/trace and screenshots; simulated labels
v2.7.0 → v2.7.1 describe the controlled fixture, not published app releases. Its
`checkoutSha` is the parent HEAD `a34b337`, while the tested source is this dirty
worktree; it does not attribute fixes to that rejected commit. `source-files.sha256.json`
identifies changed source/test/docs/release bytes (UTF-8 LF text, preserving BOM).
`coverage-summary.json`, `junit.xml` and `artifacts.sha256` preserve/check the fresh
attachments. Final SHA/CI/live evidence must be pinned by the parent after commit.

## SYNC-01 through SYNC-07

| Criterion | Deterministic evidence scope | External acceptance dependency |
| --- | --- | --- |
| SYNC-01 | PASS in the full run: reversed result/error/chart/period/metric/list/library/History/Calendar ownership and initial-list/period regression. | Final frozen-SHA gates and independent reviews; relevant live observations. |
| SYNC-02 | PASS: account A/B/A caches, retained UID queues, owned/legacy drafts and version backup; pending Quick Log and recovery receipt cannot change the next auth generation. | Final real account-switch/reconnect run. |
| SYNC-03 | PASS with mocked backend: shared capture/Quick Log/replay/delete UI journey; exact IDs/counts, two same-day sessions, suggestions/chart/table/stats, first/last-page and offline reload; aborted-delete/recovery and replay-after-delete cases. | Repeat exact-ID/value agreement on designated backend clients. |
| SYNC-04 | PASS deterministic CAS/MVCC and denial recovery: same/different weeks, semantic legacy bases, explicit conflicts, unlimited edits, timestamps, offline chains, receipts and lost acknowledgement. Exhaustion preserves the real UI outbox base. | Final real two-client same/different-week/reconnect/retry sequence. |
| SYNC-05 | PASS fixed UTC/Europe/Paris/America/Los_Angeles/DST/date matrix, local week targets and scalar-7 baseline; TTL elapsed clock remains separate. | Final live boundary/replay observations where required. |
| SYNC-06 | PASS bounded empty/exact/over, stale/offline/legacy, ES/EN, no-proof/no-freeze, policy/marker/outcome revalidation, immutable receipt recovery and fresh derived recompute after exhaustion. | Parent's reviewed/deployed rules, real 10/20-access emulator gate, authoritative policy and backend completeness evidence. |
| SYNC-07 | PASS common local gates, 80.09% coverage, numeric/session/import compatibility, secure IDs, release graph and Chromium upgrade. | Final release regeneration, immutable CI/CodeQL and two independent GPT-6.1-Sol xhigh reviews on identical final SHA. |

The [source contract and live sequence](../../docs/history-progress-sync-contract.md)
give the required backend steps. Parent's preliminary live records from earlier
source do not prove this receipt/fence revision. No unexecuted step is marked as
passed here.
