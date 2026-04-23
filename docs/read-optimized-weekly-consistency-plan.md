# Read-Optimized Weekly Consistency Plan

Last updated: April 22, 2026
Status: Planned (next major feature milestone)

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
3. Cloud sync behavior:
   - keep `users/{uid}/app_data/user_preferences` as canonical weekly-target storage
   - sync only compact preference or minimal derived metadata when required for cross-device coherence
4. Reliability parity:
   - preserve offline queue/replay behavior for weekly-target writes
   - preserve timestamp consistency for replayed preference writes

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
6. Read-usage verification:
   - no unbounded weekly-window session query in Daily Hub path
   - measurable read reduction versus pre-v1.1 baseline for repeated dashboard refresh scenarios
