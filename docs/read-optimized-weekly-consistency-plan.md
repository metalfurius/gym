# Read-Optimized Weekly Consistency Plan

Last reviewed: November 20, 2026
Status: Partial on published `main`; additional implementation exists locally and is not merged

## Purpose

Reduce Firestore reads for weekly consistency features while preserving accurate streak/progress behavior in Daily Hub.

Priority and delivery status are owned by [the roadmap](../UPGRADE-PLAN.md). The reviewed published baseline is
v2.8.3 (`d4c6d0d`). Local commit `9a6d883` on `codex/stabilize-read-optimized-v1` is not an ancestor of `main`;
its presence in the workspace is not evidence that the full optimization has shipped.

## Published Foundations

1. Weekly metrics are computed locally from session records with a bounded 52-week query (limit 1,500).
2. Daily Hub has a short-lived in-memory session cache and can fall back to available history/memory offline.
3. Weekly target preferences are cached per user; queued target writes preserve their timestamps.
4. Firebase usage telemetry exists for measuring reads and writes.
5. Session-based counting, historical outcomes, and v2.8.3 target initialization/edit behavior are already shipped.

Still missing from the complete v1.1 outcome: a persistent Daily Hub session snapshot, reuse across normal
navigation instead of forced refreshes, caching of empty results, and read-budget regression evidence on current `main`.

## Scope (v1.1)

In scope:

1. Local-first weekly consistency computation:
    - continue computing streak/progress locally from cached session history
    - avoid persisting streak values as source-of-truth documents
2. Bounded read strategy:
    - keep deterministic query limits for weekly-window session fetches
    - reduce forced refresh paths that trigger high-frequency re-reads
    - reuse fresh Daily Hub cache on routine dashboard navigation
3. Cloud sync behavior:
    - keep `users/{uid}/app_data/user_preferences` as canonical weekly-target storage
    - sync only compact preference or minimal derived metadata when required for cross-device coherence
4. Reliability parity:
    - preserve offline queue/replay behavior for weekly-target writes
    - preserve timestamp consistency for replayed preference writes

## Implemented Locally, Awaiting Integration

The stabilization branch contains the following changes. Port and revalidate them on current `main`, preserving
the later session-counting, numeric-input, PWA release, routine-import, and weekly-target fixes:

1. Daily Hub session results are cached through `localFirstCache` by user.
2. Normal dashboard navigation reuses fresh Daily Hub cache instead of forcing a Firestore read.
3. Offline Daily Hub rendering can use stale cached weekly-window sessions when no history cache is available.
4. Replayed weekly-target writes preserve their queued `updatedAtIso` and skip immediate outcome-freezing writes that would overwrite replay metadata.

## Follow-up Refactor

1. Split Quick Log capture utilities, Daily Hub state assembly, and weekly consistency calculations into clearer modules.
2. Keep public behavior and Firestore contracts unchanged while moving shared streak logic out of `js/utils/quick-log.js`.

## Out of Scope

1. Social sharing, challenges, or leaderboards.
2. Nutrition/body-composition schema additions.
3. Destructive migrations or historical backfill.
4. Replacing existing session contract fields in `sesiones_entrenamiento`.

## Validation Gates

Acceptance before marking the complete milestone delivered:

1. Record the pre-change read baseline from current `main`, not from an older local implementation.
2. Repeated dashboard navigation within the cache lifetime adds no session reads, including for an empty account.
3. A cold offline start restores the last valid per-user snapshot without mixing users' data.
4. Expiry, explicit refresh, save/delete, reconnect, and account changes invalidate or refresh the right data.
5. Overlapping refreshes do not create duplicate requests or let stale results replace a newer user's state.
6. Query limits remain bounded; truncated data does not freeze incomplete historical weekly outcomes.
7. Existing app/offline journeys, lint, no-skipped-tests checks, and the >= 70% coverage gate pass.
8. Cached-asset changes pass release-integrity and PWA upgrade checks. Run the target checkout's available
   commands; do not treat the unmerged local `merge-ready` proposal as an already-published gate.

## Completion Record

After merge, add the PR/release and before/after read counts here and mark the milestone done in the roadmap.
Until that evidence exists, keep the full v1.1 status partial.
