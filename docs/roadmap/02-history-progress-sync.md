# 2. History, progress and sync correctness

Status: planned verification and fixes. Baseline: v2.8.3 / `d4c6d0d`. Requires independent clients on a designated
real test account for final sync evidence. Establish the mutation/account contract consumed by objectives 3, 5 and 6.
Use the [shared checks and two-judge protocol](README.md).

Execution update, November 27: a [real 47-phase Windows/Ubuntu run](../real-sync-47-2026-11-27.md) passed on
unpublished `949c791`. Backend activation is verified. Two review findings still require correction, and both
judges must evaluate all criteria against the final source and its evidence. This objective remains open.

November 28: the [integrated candidate](../sync-integration-2026-11-28.md) contains the two review corrections
and a further reproduced offline-resolution fix. The real runner now has 60 phases while retaining the original
47. Its full real execution and both final same-SHA approvals are still required; the earlier 47-phase result
must not be presented as acceptance of the later source.

## Starting point and invariants

Inspect `js/progress.js`, `js/modules/history-manager.js`, session persistence listeners, calendar caches and
weekly preference paths in `js/app.js`. History has ten-record pages, Progress a 300-session fallback, and Daily Hub
a 52-week/1,500-result bound. These are different data scopes, not interchangeable complete histories. Existing
passing suites do not establish that delayed requests, another account, or another device are safe.

Keep session-based counting, same-day double workouts, idempotent IDs, whole repetitions, decimal loads, variant
identity, Monday-based local weeks and existing frozen historical decisions. Report a bug only after reproducing it.

## Ordered implementation

1. Build controllable deferred-read/write tests around the actual public UI flows. Reproduce selection A -> B,
   old success/error arriving after B, exercise/period/metric changes, concurrent history pagination, logout/login,
   account A -> B -> A and a mutation occurring while a read is pending. Record baseline failures and passing cases.
2. Add explicit owner and request-generation guards at fetch, cache and render boundaries. Invalidate generations
   on selection, mutation, view reset and auth change. Old results must not apply rows/charts/stats, pagination,
   spinner/error state, preferences, frozen outcomes or caches to the current state. Partition in-memory caches
   as well as durable entries by UID; do not solve UI races by silently dropping a valid user's durable queue.
3. Define one successful session-mutation notification/invalidation contract used by capture, Quick Log, replay
   and deletion, and reusable by editing. Refresh history/detail, calendar, Progress selector/chart/statistics,
   exercise suggestions and Daily Hub from the same persisted identity. Await durable invalidation where a stale
   reload could restore deleted data. Exercise first/last page deletion and offline reload after a successful mutation.
4. Replace unsafe whole-state weekly preference overwrites with an atomic read/merge/write strategy. Each target
   operation has immutable owner, week, operation ID and original logical timestamp; retries are idempotent.
   Preserve unrelated weeks and finalized outcomes. Define deterministic ordering for same-week conflicts using
   a verified base revision/atomic revision, with a documented stable tie-break; `savesUsed` alone or unsynchronized
   device wall clocks cannot establish global order. A delayed stale operation must not silently overwrite a
   newer acknowledged value. Surface a conflict for intentional user resolution when automatic ordering cannot
   preserve intent. Keep unlimited target edits and legacy aliases; migrate old queued descriptors compatibly.
5. Use one injectable reference clock for a refresh's month/week/progress/finalization decisions. Test UTC and
   Europe/Paris plus a materially different timezone at Sunday/Monday, month/year changes, the 2026 spring and
   autumn DST transitions and local midnight. Separate elapsed cache age from calendar arithmetic. Preserve
   queued timestamps on retries and prevent background finalization from rewriting a user edit's timestamp.
6. Carry completeness metadata through bounded queries, cached pages, offline fallbacks and derived metrics.
   A hit on an exact limit is conservatively potentially truncated unless a lookahead proves completion.
   Show the relevant limited-data state; never label a capped result all history or freeze a historical result
   from a partial/offline page. Do not introduce unbounded dashboard reads to claim correctness.
7. Run the two-device sequence against the real test backend: same/different-week concurrent edits; one device
   offline with several queued edits; the other saves newer values; reconnect in both orders; retry, reload and
   logout/login. Compare server documents, both UIs, queue state and original timestamps. Repeat key save/delete
   cross-view checks with the same seeded sessions; cleanup only explicitly identified test records.

## Completion criteria and evidence

| ID      | Required result                                                                           | Evidence                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-01 | Latest selection/account wins every result and error race                                 | Deferred integration tests assert chart/table/stats/rows, pagination and loading/error ownership after reversed completions                          |
| SYNC-02 | No user data crosses memory, durable cache, result or queue boundaries                    | A/B fixtures with distinct IDs/targets; offline cold restart and account switch during pending read/write                                            |
| SYNC-03 | Save, Quick Log, replay and delete agree on every affected surface                        | Real app journey with exact session IDs/counts/values before/after, including two sessions on one date and deletion of the last page record          |
| SYNC-04 | Two-device target edits converge without unrelated lost updates or stale replay overwrite | Atomic-conflict/retry tests plus executed real two-device log, final server record and both reloaded UIs                                             |
| SYNC-05 | Clocks, weeks and DST yield consistent values with original replay timestamps             | Fixed-clock timezone matrix with expected week keys/month counts/streaks and timestamp equality                                                      |
| SYNC-06 | Partial histories remain identified and cannot freeze wrong outcomes                      | Empty, exact-limit, over-limit, legacy, offline page and high-volume cases; assertion that no derived preference write is made from incomplete input |
| SYNC-07 | Existing compatibility and release contracts remain green                                 | Focused history/progress/calendar/Quick Log/offline tests, shared gates, release integrity and upgrade smoke                                         |

Keep raw reproduction and before/after results in the evidence record; do not call every risk above a confirmed
bug. The real device/account run is a completion gate, not an optional manual checklist. Both **independent
GPT-6.1-Sol xhigh judges** must approve the identical final SHA and evaluate SYNC-01 through SYNC-07 before closure.
