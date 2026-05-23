# Read-Optimized Weekly Consistency Plan

Last updated: May 23, 2026
Status: Active (v1.1 stabilization and read reduction)

## Purpose

Reduce Firestore reads for weekly consistency features while preserving accurate streak/progress behavior in Daily Hub.

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

Implemented in this iteration:

1. Daily Hub session results are cached through `localFirstCache` by user.
2. Normal dashboard navigation reuses fresh Daily Hub cache instead of forcing a Firestore read.
3. Offline Daily Hub rendering can use stale cached weekly-window sessions when no history cache is available.
4. Replayed weekly-target writes preserve their queued `updatedAtIso` and skip immediate outcome-freezing writes that would overwrite replay metadata.

Follow-up refactor:

1. Split Quick Log capture utilities, Daily Hub state assembly, and weekly consistency calculations into clearer modules.
2. Keep public behavior and Firestore contracts unchanged while moving shared streak logic out of `js/utils/quick-log.js`.

Out of scope:

1. Social sharing, challenges, or leaderboards.
2. Nutrition/body-composition schema additions.
3. Destructive migrations or historical backfill.
4. Replacing existing session contract fields in `sesiones_entrenamiento`.

## Validation Gates

Required before merge:

1. `npm run lint:ratchet`
2. `npm run test:app`
3. `npm run test:app:offline`
4. `npm run test:coverage:gate`
5. `npm run test:no-skips`
6. `npm run format:check`
7. Read-usage verification:
   - no unbounded weekly-window session query in Daily Hub path
   - measurable read reduction versus pre-v1.1 baseline for repeated dashboard refresh scenarios
