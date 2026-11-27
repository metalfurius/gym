# Capture recovery: durable identity correction after H9a review

Status: local correction candidate. The independent review of
`9a69595b33d6eb5f49475b5849e4a3e0d2bb0bb3` reproduced a further P1: after an
accepted capture, failure to delete either draft slot let Resume allocate a new
session ID. The preceding RAM-terminal correction remains necessary but was
insufficient. Historical H9a/353 evidence is preserved separately.

## Durable producer contract

A new capture receives a random `captureId`, also used as its persisted session
ID. A resumed unsubmitted capture keeps that identity. Before any journal append
or RPC, both recoverable draft slots contain and read back the same owner,
capture ID and write-ahead `submission: {queueId, payload}`. The payload includes
the original session ID, timestamp and immutable body. Partial local writes
cannot acknowledge a save or start an RPC. Retrying an unconfirmed submission
keeps that queue ID/body/date; editing its fields under the old identity is
blocked. A proven aborted enqueue retains the form and allows a fresh queue
attempt for that capture. Two deliberately started and submitted equal workouts
still receive different capture/session IDs; no content deduplication is used.

The primary key is `gymTracker_inProgressSession:ENCODED_UID`; the owner-labelled
`gymTracker_inProgressSession` remains the compatibility mirror. A superseded,
ID-less same-routine `gym-tracker-backup-session` recovery copy must be retired
and verified absent before enqueue, or the save fails with its form intact.
Other owners' backups are not adopted. Identity/write-ahead metadata is additive
to the draft format and remains outside the Spanish server session schema.

Reconciliation restores the own journal and checks exact session/owner/queue
identity. Verified retained or acknowledged intents consume their linked draft,
even when physical deletion still fails. Merely staged/unknown RAM state does
not authorize deleting the durable write-ahead: if the append never committed,
the draft remains the cold-retry source. Journal read failures fail closed. A
missing routine in an offline cache is not evidence to delete the draft.
Cleanup checks capture ID before deleting a slot, so an older completion cannot
remove a newer capture's draft. Auth, request and capture-generation guards
remain in place across awaits.

The existing journal remains IndexedDB-authoritative where that capability is
expected. This correction changes no journal/order/storage/offline-manager,
cache, session-store, weekly transaction, receipt or barrier implementation.
It adds no localStorage fallback to an IDB failure.
The draft preflight requires usable localStorage for both recoverable draft
slots even when the journal can use IDB; failure blocks enqueue/RPC with the
form retained rather than acknowledging an unlinked capture.

## Caller and PWA compatibility

- `loadInProgressSession(options)` remains synchronous for version-manager and
  release-update backup readers. It preserves `captureId` and the full
  write-ahead, and can hide a linked intent already known in the current realm.
- New named export `reconcileInProgressSession(options)` is asynchronous and
  verifies the restored journal before a draft can be offered or resumed.
- `checkAndOfferResumeSession(routines)` is now asynchronous. Two already-async
  callers in `app.js` await it. Dashboard navigation may invoke it without
  awaiting because it handles errors and guards its own application of results.
  Resume's handler rechecks the draft before opening it. `startSession` also
  reconciles before adopting data; concurrent starts have a request guard.
- Version-manager source/API is unchanged. Synchronous restoration can put an
  old backup back into storage, but it cannot offer/save it without the async
  producer reconciliation. A healthy PWA5 no-ID backup remains recoverable:
  only explicit Resume assigns owner/capture identity, and migration must reach
  both slots before any subsequent save.

Historical limitation: an ID-less draft **already consumed by an older
producer** has no provable link to a historical intent. This change does not
invent that association from matching contents. The parent-owned real PWA5
baseline is a healthy pre-submission draft, not such an ambiguous consumed copy.
The fixture reproduces its numeric/variant values (75.3 kg bodyweight,
pulley, 62.5 kg × 8) with synthetic owner/routine identities only.

## Local verification

All backend transport in these checks is the synthetic Firebase SDK, not live
Firebase acceptance. Chromium uses owned temporary profiles and native
localStorage/IndexedDB. Cold cases open new pages/module realms sharing native
storage; a fixture-only backend snapshot revives the synthetic SDK's timestamps
across those realms. It is not a production backup or actual two-device proof.
No user profile, installed PWA, live account, credential or service was touched.

| Check | Result | Evidence |
| --- | --- | --- |
| Focused actual-app/capture/version-manager regression suite | 4 suites / 79 tests passed before final lint | `tmp-review-9a-focused-final.log` |
| ESLint 10 / no-skips | Both exit 0, zero lint warnings/errors and no skipped tests | `tmp-review-9a-lint-accepted.log`, `tmp-review-9a-no-skips-accepted.log` |
| Actual app / offline recovery | 6 suites / 6 tests and 2 suites / 2 tests passed | `tmp-review-9a-app-accepted.log`, `tmp-review-9a-offline-accepted.log` |
| Complete coverage gate | 74 suites / 1,100 tests passed; statements 80.87%, required >=70% | `tmp-review-9a-coverage-final.log` |
| Final native outbox | Passed all original assertions plus 6 capture cases, 8 primary/mirror × ACK × warm/cold cases, PWA5 no-ID migration and original weekly/barrier cases; zero cleanup errors | `tmp-review-9a-native-accepted.log`; `tmp/outbox-smoke/1795798639558/result.json`, trace and PNGs |
| Actual cleanup-negative child | Verifier exit 0; child exit 1 with final failed evidence, deliberate owner-cleanup error and later connection/server cleanup | `tmp-review-9a-native-negative-accepted.log`; `tmp/outbox-cleanup-negative/1795798810601/negative-verification.json` |
| Release write and two-build integrity | Exit 0, unpublished v2.8.6 / 75 assets, no version bump | `tmp-review-9a-release-write-accepted.log`, `tmp-review-9a-release-check-accepted.log` |
| Chromium PWA upgrade | Exit 0; A → B, session preservation, offline/reconnect | `tmp-review-9a-upgrade-accepted.log`; `tmp/upgrade-smoke/2026-11-27T16-57-20-400Z-17476/` |
| File freeze / unchanged foundations | Whitespace check and all 11 native-proof source hashes matched; audited foundations/version-manager unchanged | `tmp/objective02-capture-9a-handoff.json` |

Node v22.23.5 / Windows; Chromium 158.0.8127.37 in fresh owned profiles. Native
proof records baseline `checkoutSha` H9a because the fix is uncommitted; its 11
LF-normalized runtime/fixture hashes match the files actually executed. The
handoff manifest records every changed WIP file separately.

Measured limits still pending real CI: the final native positive took **170.6
seconds** against its 180-second deadline; the negative child took 133.6 seconds.
No runtime or fixture assertion was changed after that positive. The first
isolated cold coverage run timed out in the unchanged app-user-journey import
hook at its existing 5-second limit (73 suites / 1,099 other tests passed),
retained as `tmp-review-9a-coverage-accepted.log`. One complete repeat with the
instrumentation cache populated passed in 70.903 seconds. No hook timeout,
functional assertion, coverage threshold or lint rule was relaxed. Windows and
Ubuntu CI must still establish those setup/runtime margins on the final SHA.

The first expanded native run reached all eight stale primary/mirror
warm/cold/ACK combinations, then exhausted its 90-second deadline near the PWA5
case. Its failed JSON/trace/PNG remain under
`tmp/outbox-smoke/1795798000652/`. This is not passing evidence. The enlarged
native matrix now has a 180-second absolute deadline and 4-minute CI steps for
both the positive runner and its real cleanup-negative child; cleanup remains
bounded and every original assertion is retained. No test is skipped and no
failure is allowed through the pipeline.

The additional pre-commit-unknown regression first exposed the missing-routine
cache deletion and failed in `tmp-review-9a-unknown-precommit.log`; keeping an
unproven draft fixed it. Final focused evidence above includes that case.
Intermediate native passes before the last write-ahead refinement remain
intermediate, not evidence of the final source.

Parent-owned final commit/rebase, final-source CI, two fresh independent
same-SHA reviews, and real service/device acceptance remain open. This record
does not close objective 2.
