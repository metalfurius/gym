# 3. Complete the read-optimized Daily Hub

Status: partial on published main; completion planned. Baseline: v2.8.3 / `d4c6d0d`. Depends on objective 2's
account, mutation, clock and completeness contracts. See [the detailed reference](../read-optimized-weekly-consistency-plan.md)
and the [shared review protocol](README.md#two-judge-merge-protocol).

## Starting point and read budget

`js/app.js` has a 30-second memory cache, a bounded 52-week/1,500-document query and a one-record latest-session
fallback when the weekly window is empty. A nonempty-array freshness check misses valid empty results; dashboard
navigation can force refresh. `localFirstCache` and usage telemetry already exist. Local commit `9a6d883` contains
unmerged snapshot work; port selected behavior onto current main instead of merging an older orchestrator wholesale.

Keep the 52-week bound, existing fallback semantics, local computation, session counting, preference replay and
historical outcomes. Do not persist streaks as a new source of truth or read all history for dashboard navigation.

## Ordered implementation

1. Record current-main read/request counts for seeded nonempty, empty, old-history-only and 1,500+ accounts.
   Run login -> dashboard -> history -> dashboard -> routines -> dashboard and overlapping dashboard refreshes.
   Record `dashboard.dailyHub`, `dashboard.dailyHubLatestWorkout`, preference and calendar labels separately.
2. Define a versioned durable per-UID snapshot containing serialized sessions, fetched-at time, window/reference
   information, source and completeness/truncation metadata. Distinguish absent, successful empty, stale and
   invalid entries explicitly. Validate owner/schema/dates before use; corrupted or future/incompatible entries
   cannot become fresh. Reuse the existing serializer without normalizing away valid values.
3. Hydrate from memory or durable storage, including fresh empty snapshots. Keep the current 30-second TTL unless
   measurements justify a separately stated change. Normal navigation, language changes and routine selection
   recompute presentation from fresh sessions with **zero new session reads**. Preserve a stale snapshot for
   an offline cold start and show its freshness/limited-data state honestly.
4. Deduplicate in-flight reads by UID/window/generation so concurrent refreshes share one valid request. Clear
   pending entries on success and failure. Forced refresh supersedes stale work without letting an older response
   repopulate invalidated storage. Guard both cached and network results against auth changes and mutations.
5. Connect save, Quick Log, delete, edit and replay to the objective 2 invalidation contract. Explicit refresh,
   expiry, reconnect with stale data, a changed calendar window and mutation must fetch once when online. A
   preference-only edit recomputes with existing fresh sessions. Define the replacement policy before adding
   any optimistic snapshot patch; mutation invalidation must survive reload, not merely clear an array.
6. Preserve complete/truncated metadata through persistence and fallback. Never use a history page as a complete
   weekly window. Skip historical freezing on incomplete data. Query caps remain enforced; an empty weekly window
   may use at most one bounded latest-workout fallback in a fetch cycle, including for an entirely empty account.
7. Rerun the same deterministic scenario/clock/fixtures against the candidate. Include real-browser reload and
   offline cold-start evidence with a previously stored snapshot, then reconnect. Compare telemetry to mocked
   Firestore call counts so measurement omissions do not masquerade as savings.

## Completion criteria and evidence

| ID      | Required result                                                                                  | Evidence                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| READ-01 | Before/after measurement uses current main and identical scenarios                               | SHA-pinned baseline/candidate table with request and document reads by label, fixture size and cache clock                         |
| READ-02 | Repeated navigation while fresh performs zero additional session reads, including empty accounts | Exact assertions after each navigation; initial empty query plus optional one latest fallback is recorded separately               |
| READ-03 | Concurrent refreshes share one session fetch cycle                                               | Deferred overlap tests count one weekly query and at most one required fallback; failure followed by retry works                   |
| READ-04 | Per-user snapshots survive an offline cold start without leakage                                 | Persistent-storage/browser restart run with nonempty, empty, stale, corrupt and another-user entries; snapshot timestamps retained |
| READ-05 | Expiry/explicit refresh/window changes/mutations refresh the correct generation once             | Mutation-during-fetch, auth switch, preference-only edit and reload cases; cache invalidation evidence and request ceilings        |
| READ-06 | High-volume/partial data cannot corrupt historical outcomes                                      | Exact/over-limit tests preserve truncation flags across restart; no freezing write; counting and queued timestamps unchanged       |
| READ-07 | Existing app/offline/PWA behavior remains valid                                                  | Shared checks, focused local-first/Quick Log/session integration tests, release integrity and two-version upgrade smoke            |

The fresh-cache budget is **0 incremental session queries and 0 incremental session document reads** for the
stated navigation sequence, regardless of whether results are empty. A required online refresh permits one bounded
weekly query and, only when needed, one limit-1 fallback; report preference/other reads rather than hiding them.
An offline cold start permits no network session reads. Do not promise a fixed billed-read reduction without measurement.

Only mark full v1.1 delivered after READ-01 through READ-07 and **two independent GPT-6.1-Sol xhigh approvals
of the same final commit**. Update both roadmap and detailed reference with measured counts and merged evidence.
