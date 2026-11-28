# Objective 2: capture and weekly projection review corrections

Status: local correction candidate, not objective closure. Both independent
reviews requested changes on `353d569152a7aa20b1df06ec566d0da34e6d5755`
(base main `3cf38202`). This record covers only their two distinct causes. The
V3 journal, opaque descriptors, causal ordering, receipts, barriers and backend
protocol remain unchanged. Earlier evidence stays historical.

## Capture acceptance and identity

A normal routine capture previously stayed open after `sync/queued`. A second
Save in that same form generated another session ID. The corrected producer
makes the capture terminal before fallible cleanup when either the server
accepts or the manager retains the immutable queued intent. Routine/form/timer
cleanup is attempted independently. A cleanup exception cannot turn the old
capture into a new-ID retry. Queued feedback does not invoke the online success
callback or publish a server-persisted event; actual replay keeps its existing
notification contract.

Queued means that the original intent/identity is retained by the manager. An
unknown journal or RPC acknowledgement does not prove server acceptance and
does not allocate a replacement identity. A proven enqueue abort still leaves
the form and owned draft available for an explicit retry with no ghost or RPC.
Two deliberate `startSession` actions remain distinct, even for identical data;
there is no content deduplication. Auth generation plus a separate capture
generation prevent a late result from clearing a newer A/B/A or same-account
capture.

## Authoritative queued weekly projection

The preferences document cache is advisory. An accepted journal append can
survive a failed preferences-cache write. Fetch now restores the own journal
and overlays its eligible operations in causal order before applying cached
offline preferences or a memory-cache hit. Creating the next weekly operation
also requires that restore and uses the overlaid record as its original CAS
base. A journal read failure cannot construct or acknowledge a new intent.
Owner/request guards are checked after each new asynchronous boundary.

A successfully read server preference is applied independently of its cache
write; an advisory write failure cannot revert it to an older cached value.
These changes do not assert complete session history, infer acceptance from
storage absence, or relax a target conflict.

## Reproduction and verification

The new actual-app regression cases were run against unchanged H353 runtime
before implementation: **6 failed / 12 passed** in
`tmp-review-353-baseline-fixed-harness.log`. They reproduced the open-capture
queued paths and the offline target reverting from journal 4 to cache 3. An
earlier attempt paused the journal while waiting for auth and was terminated;
the corrected harness pauses only delivery of an already retained result. That
attempt is not passing evidence.

All verification here uses synthetic Firebase SDK transport. Native Chromium
tests use real loopback app modules, native localStorage/IndexedDB, owned
temporary profiles, real abort/complete events and network-offline emulation.
They are not production Firebase or two physical-device acceptance evidence.
The parent separately owns deployed-backend and real-service verification.

| Check | Result | Local evidence |
| --- | --- | --- |
| Focused actual app/capture/journal/weekly cases | 5 suites / 122 tests passed before final additional guards | `tmp-review-353-focused.log` |
| Initial expanded native outbox | Passed all original journal assertions plus routine capture, native abort/retry, unknown ACK, cleanup fault, A/B/A and advisory-cache restore | `tmp-review-353-native-first.log`; `tmp/outbox-smoke/1795795083510/` |
| ESLint 10 ratchet / no-skips | Both exit 0; zero lint warnings/errors, no skipped tests | `tmp-review-353-lint.log`, `tmp-review-353-no-skips.log` |
| Actual app integration / offline recovery | 6 suites / 6 tests and 2 suites / 2 tests passed | `tmp-review-353-app.log`, `tmp-review-353-offline.log` |
| Complete coverage gate | 73 suites / 1,083 tests passed; statements 80.76%, required >=70% | `tmp-review-353-coverage-final.log` |
| Final expanded native outbox | Passed all original assertions and both review causes, including same-auth new-capture generation and retained original IDs/timestamps; all cleanup stages passed | `tmp-review-353-native-final.log`; `tmp/outbox-smoke/1795795225302/result.json`, trace and PNGs |
| Actual cleanup negative child | Verifier exit 0; real child exit 1, final failed evidence, expected owner-cleanup error and later connection/server cleanup retained | `tmp-review-353-native-negative.log`; `tmp/outbox-cleanup-negative/1795795263438/negative-verification.json` |
| Release write / two-build integrity | Exit 0; unchanged unpublished v2.8.6 with 75 assets; verification simulates v2.8.6 → v2.8.7 in isolated builds | `tmp-review-353-release-write.log`, `tmp-review-353-release-check.log` |
| Chromium PWA upgrade | Exit 0, A → B and preserved session/offline/reconnect assertions | `tmp-review-353-upgrade.log`; `tmp/upgrade-smoke/2026-11-27T16-00-26-379Z-20100/` |
| File freeze and contract preservation | SHA-256 manifest of seven changed files; whitespace check; journal/order/storage/manager/cache/weekly protocol/session-store sources unchanged | `tmp/objective02-review-353-handoff.json` |

Commands use Node v22.23.5 on Windows and owned Chromium 158.0.8127.37. Native
result JSON includes LF-normalized hashes of the unchanged journal foundations
and both changed runtime modules. Its `checkoutSha` is the baseline H353 because
this work is uncommitted; the handoff manifest identifies the WIP files actually
executed, rather than attributing them to the unchanged baseline tree.

The first full coverage run, concurrent with browser checks, timed out in the
unchanged app-user-journey `beforeAll` module import at its existing 5-second
limit (72 other suites passed). Its failed log is preserved as
`tmp-review-353-coverage.log`. The complete gate was repeated without concurrent
browser work and passed in 64.71 seconds. No timeout, assertion, coverage
threshold or lint rule was relaxed.

Final-source CI, both fresh independent exact-SHA reviews and the parent-owned
real multi-client/device acceptance remain open. No live service, credential,
other worktree or published release was changed by this correction.
