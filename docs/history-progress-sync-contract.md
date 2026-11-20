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

The local cache invalidates pending reads synchronously, serializes IndexedDB
writes/deletions and removes matching localStorage keys even on a cold process.
A disk read waits for earlier persistence operations. Returning stale disk data
cannot restore a cache entry after an awaited mutation invalidation.

Drafts use `gymTracker_inProgressSession:<encoded UID>`, with an owned global mirror
for retained PWA shells. A foreign owned draft/upgrade backup is never restored
into another account. An unowned legacy draft stays unowned until its routine has
been loaded for the current account and the user explicitly presses Resume (or
starts that matching routine). Routine names or set values from an unmatched
legacy draft are not rendered. Explicit logout clears only the departing owner's
active draft. Account switches retain separately owned drafts.

## Session mutations and reusable transactions

Capture, Quick Log, replay and deletion use the persisted Firestore document ID.
`writeSessionDocument()` reads the session and `app_data/session_revision` in one
Firestore transaction. A create of an existing ID is an idempotent no-op; a delete
of an absent ID is also a no-op. A real change advances the session revision in
the same commit. Two IDs on the same day remain two sessions.

After a successful commit, `publishSessionMutation({userId, sessionId, source,
kind, replayed})` is the shared boundary for a future editor:

1. Increment the owner's read revision and run registered memory invalidators.
2. Await owner-specific durable invalidation for History, Calendar, Progress and
   Daily Hub. Suggestions are invalidated for that UID before yielding.
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

Online auth/reconnect refreshes paged analytics/calendar caches and rebuilds
suggestions from at most 200 persisted sessions, so another client's changed set
values are observed. These are bounded reads, not complete analytics histories.
The persistent Daily Hub snapshot remains available for offline use. Objective 3
may reduce these reads only while preserving the ownership/revision guarantees.

## Weekly target ordering and conflicts

New intents carry immutable `userId`, `weekKey`, `operationId`, `updatedAtIso`,
`baseRevision` and `baseOperationId`. Per-week records preserve legacy aliases and
metadata. `savesUsed` remains for compatibility and does not limit edits or order
competing devices. Device wall-clock timestamps are never conflict order.

An owned Firestore transaction reads the current preferences and operation
receipt before writing. It merges into the current server document, preserving
unrelated weeks/settings and already frozen historical decisions. A matching
per-week base (revision **and** predecessor operation ID) accepts the intent,
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

All five real account descriptor constructors include `payload.userId`, and their
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
save is not acknowledged if neither local durable store can write. Concurrent
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
| Daily Hub | 52 local weeks, 1,500 displayed + 1 lookahead | Complete only for that window, from a current non-cache/non-pending server snapshot with matching session revision probes. |
| Calendar | one local month, 1,500 displayed + 1 lookahead | A cap/cache/pending source is visibly limited. The exclusive next-month boundary includes the last millisecond of the month. |

The Daily Hub's one-record latest-workout fallback is separately bounded and must
also be authoritative before it can support finalization. Memory/durable/offline
snapshots may render available data but cannot finalize outcomes. An exact cap
without a lookahead proof is not complete. Limited-data messages and the Progress
"Available history" option exist in Spanish and English.

Finalization rechecks `session_revision` and each effective carry-forward target
inside its transaction. A concurrent session mutation or target revision change
prevents freezing those derived outcomes. Existing frozen outcomes are preserved.
All clients participating in concurrent finalization must run the revision-aware
writer; an older deployed writer cannot provide that new revision guarantee.

## Deterministic checks and live completion

Run the repository's common gates, the three `app-sync-*` integration suites,
`weekly-preferences.test.js`, `offline-owner-queue.test.js`, the progress/history/
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

Do not create/export auth tokens or manipulate another user's records. Cleanup is
limited to the exact test records authorized for the run. Attach the observed
server documents/receipts, both client results and original timestamps; a checklist
or mock result is not a substitute for that evidence.
