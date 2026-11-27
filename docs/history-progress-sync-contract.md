# History, progress and synchronization contract

This describes the objective 2 implementation candidate. It does **not** close the
[roadmap objective](roadmap/02-history-progress-sync.md). Real backend/two-client
verification, final release integration, CodeQL and both independent reviews are
required before closure. The local evidence record is
[here](../Validation%20Evidence/2026-11-20-objective2/README.md).

## Ownership and asynchronous work

`auth-state.js` provides a bootstrap-free `getCurrentUser()`; `auth.js` re-exports
it. `beginAccountSession(uid)` starts a new generation for every auth transition,
including A → B → A. `captureAccountScope(uid)` includes the UID, auth generation
and current session-mutation revision. `isAccountScopeCurrent(scope, currentUid)`
is required before accepting read results, errors, cache writes or UI changes.
Writes capture an immutable owner and an auth generation but do not use a session
read revision as a write order.

History, detail, calendar, exercise-list and chart requests additionally own their
render generation. Selection changes invalidate delayed chart-library callbacks
as well as reads. Older requests cannot hide the latest spinner or apply an error.
In-memory exercise lists/data and calendar bounds are reset on auth changes.
History keeps only the current owner's page. All durable session, preference and
suggestion entries are UID-specific. Progress invalidates its exact UID key so
UID `A` cannot remove UID `AB`.

The local cache invalidates pending reads synchronously and serializes durable
writes/deletions. Each exact-key or prefix invalidation writes a new random epoch
to localStorage and IndexedDB, where supported, and verifies both durable copies.
Cache entries carry the applicable epochs. A cold read rejects an older entry
even when a physical IndexedDB deletion aborted. An unverified or mismatched
barrier blocks the affected cache; it cannot count as a successful invalidation.
Metadata reads use an IndexedDB prefix range rather than loading cached history.

`withSessionMutation(uid, operation)` writes verified pending barriers for all
session surfaces **before** invoking the backend. These block stale reads/cache
writes during the RPC. It completes the barriers only after the RPC succeeds.
If preflight cannot write/verify an expected durable store, no backend transaction
starts. A post-commit storage failure leaves pending barriers across restart and
retains acknowledgement of the already accepted backend write; this prevents a
new-ID retry from duplicating a capture/Quick Log. `writeSessionDocument` returns
`invalidationVerified:true`, passed as the second argument to
`publishSessionMutation(detail, mutationResult)` to reuse that durable proof.
Without the proof, the publisher must perform its own verified invalidation.
Retrying the persisted session ID is idempotent and recovers the barriers.
Physical cleanup can fail after a verified invalidation
without resurrecting old data. Per-UID Web Locks span preflight/RPC/completion in
supporting browsers; the fallback serializes within the current realm. Pending
barriers remain conservative if a tab dies. Auth/reconnect recovery reads only
the affected immutable receipts with `getDocFromServer`, under the UID lock and
original auth generation. A create receipt or delete tombstone settles an old
create; only a delete tombstone settles a delete. Current session presence or
absence is never proof. Authoritative proof rotates the blocked epoch to a fresh
eviction epoch, preserving rejection of old entries and allowing fresh writes.
Missing/cached/pending proof or unavailable storage keeps affected caches limited;
reconnect retries. Ordinary auth/refresh eviction cannot settle an unknown RPC.
Reads are deduplicated per intent and counted under `sync.cacheRecovery`; routine
recovery with no barrier makes no session/receipt reads. Auth generation is
retained across persistence waits and receipt reads, including A → B → A.

Drafts use `gymTracker_inProgressSession:<encoded UID>`, with an owned global mirror
for retained PWA shells. A foreign owned draft/upgrade backup is never restored
into another account. An unowned legacy draft stays unowned until its routine has
been loaded for the current account and the user explicitly presses Resume (or
starts that matching routine). Routine names or set values from an unmatched
legacy draft are not rendered. Explicit logout clears only the departing owner's
active draft. Account switches retain separately owned drafts.

## Session mutations and reusable transactions

Capture, Quick Log, replay and deletion use the persisted Firestore document ID.
`writeSessionDocument()` reads the session, `app_data/session_revision` and both
per-ID immutable receipts in one Firestore transaction (four document reads).
A create with an existing create receipt or delete tombstone is an idempotent
no-op even when the session no longer exists. A create of a legacy existing ID
writes a no-op create receipt without changing data/revision. A delete of an
absent ID writes a no-op delete tombstone without advancing the revision, so an
older in-flight create must retry and remain blocked. A real change writes its
receipt, session create/delete and counter (three writes), advances the revision and
sets `lastSessionId` to that document ID in the same commit. Two IDs on the same
day remain two sessions. Session, queue, target-operation and invalidation IDs
use `crypto.randomUUID()` or 128 bits from `crypto.getRandomValues()`; there is no
`Math.random()` fallback.

Receipts use `users/{uid}/session_mutations/{sessionId}/receipts/{kind}`, where
`kind` is `create` or `delete`, with exactly `{sessionId,kind,changed,revision}`.
They are create-only, immutable and undeletable. New create acceptance requires
neither receipt to exist before the commit; deletion records a permanent
tombstone. Thus create → lost acknowledgement → delete → replay-create stays
deleted, including legacy IDs. Source tests exercise both concurrent commit
orders. Same-ID correction uses a future edit API and must not reuse the create
operation. Companion rules validate atomic receipt/session/counter relationships;
client SDK read counts do not prove server 10/20 access limits, which require the
real emulator gate.

After a successful commit, `publishSessionMutation({userId, sessionId, source,
kind, replayed})` is the shared boundary for a future editor:

1. Increment the owner's read revision and run registered memory invalidators.
2. Use the verified preflight result for History, Calendar, Progress and Daily
   Hub, or await verified owner-specific invalidation when no preflight result
   was supplied. Suggestions are invalidated for that UID before yielding.
3. Run refresh subscribers. The app rebuilds bounded suggestions, refreshes the
   dashboard/calendar and refreshes visible History or Progress, including chart,
   accessible table and statistics. Session detail is closed after a mutation.

A new same-ID editor must use this notification and the owned transaction
foundation; it must not route edits through the idempotent **create** API.

`runOwnedTransaction()` verifies auth ownership on every Firestore callback/retry.
Its reducer has no cache/UI side effects. Reads are counted on every retry and
writes only after the accepted commit (`session.mutation.*`,
`preferences.weeklyTarget.*`, `preferences.weeklyOutcomes.*`). Dashboard revision
probes use `dashboard.dailyHubRevision` separately from the bounded session query.

Firestore rules can return `permission-denied` against a concurrently advanced
counter before the SDK exposes an optimistic conflict. The owned wrapper permits
at most **three transaction calls** in this case (each SDK call keeps its bounded
five native `ABORTED` attempts). It retries only when an authoritative server read
shows the relevant `session_revision.revision` or `preferencesRevision` strictly
greater than the last callback observed, both server global/UID policies match
the supported epoch, and the original UID/auth generation still holds. The
retried transaction also reads those policies so the proof remains in its read
set through commit. No extra proof reads occur on ordinary success. Proof reads
are labeled `*.deniedProof`; an equal revision, failed/stale proof or permanent
denial preserves the original rejection. IDs, payloads, original timestamps,
weekly base revision/op/fingerprint and outcome expectations are never rebased.

If three proven-denial attempts exhaust, `sync/retry-exhausted` retains the owned
serializable intent durably: capture/Quick Log/weekly target use their original
descriptor, and History deletion uses `session.delete` with `{userId,sessionId}`.
An unavailable durable store is an error, never an acknowledged queue. Replaying
exhausted work preserves its ID/time/base. Derived finalization queues only a
`preferences.syncWeeklyState` recompute descriptor with `{userId}`, deduplicated
for that owner; it cannot persist/replay an old outcomes snapshot. A failed queued
recompute stays in the queue. Same-week target retries still produce explicit
conflicts, and finalization revalidates session/target/fence expectations before
freezing anything. This is client recovery for a reproduced emulator behavior,
not a claim of a live incident or relaxed backend authorization.

Online auth/reconnect refreshes paged analytics/calendar caches and rebuilds
suggestions from at most 200 persisted sessions, so another client's changed set
values are observed. These are bounded reads, not complete analytics histories.
The persistent Daily Hub snapshot remains available for offline use. Objective 3
may reduce these reads only while preserving the ownership/revision guarantees.

## Weekly target ordering and conflicts

New intents carry immutable `userId`, `weekKey`, `operationId`, `updatedAtIso`,
`baseRevision`, `baseOperationId` and `baseFingerprint`. The fingerprint covers
both target aliases independently, `savesUsed` and the original timestamp. It
detects legacy recursive merges that change the target while retaining revision
and operation ID. Per-week records preserve legacy aliases and
metadata. `savesUsed` remains for compatibility and does not limit edits or order
competing devices. Device wall-clock timestamps are never conflict order.

An owned Firestore transaction reads the current preferences and operation
receipt before writing. It merges into the current server document, preserving
unrelated weeks/settings and already frozen historical decisions. A matching
per-week base (revision, predecessor operation ID **and** semantic fingerprint) accepts the intent,
assigns the next per-week revision and next global `preferencesRevision`, and
writes its receipt atomically. Thus accepted commits have a stable total order;
accepted records are ordered lexicographically by `(commitRevision, operationId)`.
Atomic commit revisions are unique for new acceptances, so the stable operation-ID
tie-break never silently arbitrates two edits from the same stale base.

- Different weeks can both commit; a Firestore retry re-merges the other week.
- Competing same-week operations from the same base do not silently pick a winner
  by local time. The first atomic acceptance advances the revision; the other
  gets a durable `conflict` receipt and an actionable settings notice.
- An offline chain uses each preceding operation as the next verified base. It
  replays in queue order. If another client changed that base, dependent intents
  conflict as well; they are never automatically rebased over acknowledged work.
- Retry of an accepted operation returns its receipt and current preferences.
  It cannot reapply its old target. Reusing an ID for different intent data fails.
- A target for an already finalized week conflicts instead of rewriting that
  historical decision. Unrelated finalized outcomes remain unchanged.
- The UI shows the acknowledged current value and asks the user to review/save
  again. A deliberate new save uses the displayed server revision and clears the
  resolved week's conflict entries after acceptance. Permanent server failures
  restore the acknowledged value; network failures retain the original intent.

Settings and the Hub resolve the effective target for their captured local week,
not the most future map entry. The wire aliases still carry the most future known
week for compatibility. `weeklyTargetBaselineSessions` preserves the scalar
legacy goal before the first dated target; unfrozen earlier weeks use that known
baseline, while existing frozen outcomes remain unchanged. Older maps without
this field retain their previous default-3 fallback.

`updatedAtIso` and the Firestore `updatedAt` mirror the accepted intent's original
logical timestamp even after retries. Atomic revisions define order when device
clocks disagree. Background finalization never rewrites user-edit timestamps.

Legacy target descriptors receive a deterministic receipt ID. With no verifiable
base they can initialize a missing week or recognize the exact original intent;
they conflict with an existing different value. Legacy derived-state descriptors
are recomputed from a fresh bounded read, never copied as a whole stale map.
Legacy session descriptors receive a stable ID from their durable queue entry,
so separate same-day queue entries are not collapsed.
An earlier revision-bearing descriptor lacking a fingerprint cannot prove its
base and remains an explicit conflict unless an immutable receipt already proves
acceptance. Its payload/timestamp remains retained for review; the client never
invents a semantic base from the current server value.

All six real account descriptor constructors include `payload.userId`, and their
handlers also reject missing owners. The queue boundary additionally quarantines
an unverifiable/mismatched owner as `status: "unowned"`: it stays on disk, is
identified by `getUnownedCount()`, and is neither executed nor counted for the next
account. Unknown descriptor types default to account scope. A genuinely non-account
handler must explicitly register `{scope: "global"}`; generic inline callbacks
must explicitly queue with that scope (or an explicit owner). Reserved account
types cannot be registered as global. Legacy valid UID descriptors remain usable.

The durable queue retains operations for other UIDs, conflicts, original payload
and enqueue timestamps. Reconnect processes only the active owner; auth changes
never clear another owner's work. An operation remains on disk while in flight
and is removed only after acknowledgement. Persistence is serialized and a queued
save is not acknowledged if an expected durable store cannot write. Concurrent
processing calls coalesce; destruction does not erase serializable work.

## Calendar reference and completeness

Each refresh captures one `calendarNow()` Date and passes it to window selection,
month/week metrics, progress filtering and outcome finalization. Monday weeks use
local calendar arithmetic; UTC day strings are not used to group local charts.
`setCalendarClock()` is the injection point; the previous test override remains
compatible. Elapsed cache age uses `Date.now()` independently of this clock.

| Source | Bound | Completeness rule |
| --- | --- | --- |
| History | 10 displayed + 1 lookahead, per page | Only a fresh first page with no next record could be all history; offline pages stay cached/limited. |
| Progress | 300 displayed + 1 lookahead | 300 exact results are complete only because the 301st lookahead is absent; legacy/offline/stale arrays are limited. |
| Daily Hub | 52 local weeks, 1,500 displayed + 1 lookahead | Complete only for that window, from a current non-cache/non-pending server snapshot, verified server fence and matching session revision probes. |
| Calendar | one local month, 1,500 displayed + 1 lookahead | A cap/cache/pending source is visibly limited. The exclusive next-month boundary includes the last millisecond of the month. |

The Daily Hub's one-record latest-workout fallback is separately bounded and must
also be authoritative before it can support finalization. Memory/durable/offline
snapshots may render available data but cannot finalize outcomes. An exact cap
without a lookahead proof is not complete. Limited-data messages and the Progress
"Available history" option exist in Spanish and English.

The server fence uses admin-owned `runtime_config/sync_protocol` exactly
`{version:1, epoch:"gym-sync-v1-2026-11"}`. The client first reads it with
`getDocFromServer`, then validates it again in an owned transaction. That
transaction creates `users/{uid}/app_data/sync_protocol` with the exact same two
fields once, alongside `session_revision` initialized from its existing
nonnegative integer revision (or zero), with `lastSessionId:null`. Existing UID
policies are immutable; the client never resets an activated marker. Global proof
reads are counted under `sync.protocol.serverProof`, transaction reads/commits
under `sync.protocol.*`.

The companion server rules must reject unversioned session writes after UID
activation, require atomic counter `old+1`/matching `lastSessionId`, and require
schema 3/exact `preferencesRevision+1` for preference writes. UID activation
applies if the policy exists before **or after** the commit, including when the
global document is later removed. Marker initialization with `lastSessionId:null`
is allowed only in the policy-create commit. Old clients may still read; their
unfenced writes are rejected for activated UIDs. This rules prerequisite and its
deployment are owned and verified separately from this client change.

Without authoritative global/UID proof, data may render as limited but cannot
freeze outcomes. Matching counters alone do not establish completeness while
legacy writers can bypass them. Finalization rechecks both policies/epoch,
`session_revision`, semantic target bases and each effective carry-forward target
inside its transaction. A concurrent change prevents freezing the affected
derived outcomes. Derived writes use schema 3 and next preference revision while
preserving user-edit timestamps and existing frozen outcomes.

## Deterministic checks and live completion

Run the repository's common gates, the three `app-sync-*` integration suites,
`weekly-preferences.test.js`, `sync-protocol.test.js`, `local-first-cache.test.js`,
`app-sync-review-regressions.test.js`, `offline-owner-queue.test.js`, the progress/history/
calendar suites, and `calendar-clock.test.js`. The clock test runs fixed expected
cases in UTC, Europe/Paris and America/Los_Angeles, including both 2026 DST changes,
Sunday/Monday, local midnight and month/year transitions.

`node scripts/reproduce-sync-baseline.mjs` loads baseline `4a0f141...` modules into
temporary files, runs the same new race tests, records the expected failures, and
removes the temporary files. It never replaces the working candidate modules.
The expected failures are reproduction evidence, not a passing implementation gate.

For real-backend completion, use the designated test account and two isolated
clients running the same candidate. Record deployed/candidate SHA, release,
redacted UID/client identifiers, UTC times and only explicitly identified test IDs:

1. Save distinct sessions on one date, including a decimal strength capture and
   Quick Log. Compare exact IDs/counts/values across server, History/detail,
   Calendar, Daily Hub, Progress selector/chart/table/stats and suggestions.
2. With both clients on the same verified target revision, edit the same week on
   both. One acceptance and one visible durable conflict are expected. Reload;
   review/save the conflict deliberately, then confirm both UIs/server converge.
3. Edit different weeks concurrently using controlled calendar clocks. Both
   weeks, unknown metadata, aliases and historical outcomes must survive. Reload
   both clients and compare commit revisions and original timestamps.
4. Put A offline and save several same/different-week intents. Save a newer
   same-week target on B. Cold-reload A offline, then reconnect A/B in both orders.
   Old queued work must conflict rather than overwrite B; unaffected weeks must
   survive. Resolve intentionally and compare both reloaded UIs, receipts and queue.
5. Repeat lost-ack retry, ordinary reload and logout/login. Switch to a different
   account with a pending read/write and cold-restart offline; neither data nor
   pending-count/conflict notices may cross the UID boundary.
6. Delete first/last-page records and the latest strength session. Reload offline;
   the deleted IDs must stay absent, suggestions must fall back, and all counts
   must agree. Repeat key cases at a calendar boundary and with capped/stale data.
7. Before enabling the admin global policy, verify history renders as limited
   and no outcome is frozen. With the reviewed rules and global policy deployed,
   verify first auth atomically creates UID policy and marker. A legacy write
   without marker, a standalone/reset marker, legacy preference merge and mutable
   receipt must each be rejected. Verify normal create/delete/target/outcome
   transactions still succeed, including retry and offline replay. Record the
   rules source/hash, deployed policy epoch and exact client SHA; client mocks
   cannot prove that a real server enforces this fence.

Do not create/export auth tokens or manipulate another user's records. Cleanup is
limited to the exact test records authorized for the run. Attach the observed
server documents/receipts, both client results and original timestamps; a checklist
or mock result is not a substitute for that evidence.
