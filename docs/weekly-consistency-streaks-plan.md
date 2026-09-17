# Weekly Consistency Streaks Plan

Last updated: April 22, 2026  
Status: Implemented on branch (pending merge to `main`)

## Purpose

Define the current major feature milestone after Session Variants + ES/EN:

1. Show meaningful weekly consistency streaks in Daily Hub.
2. Let each user define a custom workout-sessions-per-week target.
3. Keep weekly target synced in cloud with offline replay safety.

## Delivered

This milestone is implemented on branch with the following behaviors:

1. Daily Hub weekly metrics are implemented (`this-week progress`, `current weekly streak`, `best weekly streak`).
2. Weekly model is implemented with Monday-based weeks, persisted-session counting, duplicate-delivery protection, and a rolling 52-week analysis window.
3. Weekly target preference is implemented in Settings and cloud-synced at `users/{uid}/app_data/user_preferences` with offline queue/replay.
4. Post-review hardening is implemented for timestamp consistency in offline queued target writes and bounded Daily Hub weekly-window query reads.

## Scope (v1)

In scope:

1. Daily Hub metrics:
   - this-week progress (`sessionCount/targetSessions`)
   - current weekly streak
   - best weekly streak
2. Weekly model:
   - Monday-based weeks
   - persisted session counts (multiple sessions on the same day count separately; duplicate delivery is ignored)
   - rolling 52-week analysis window
3. Weekly target preference:
   - default `3` sessions/week
   - editable in Settings modal
   - cloud-synced at `users/{uid}/app_data/user_preferences`
4. Offline support:
   - target writes use durable queue and replay on reconnect
5. ES/EN copy coverage for new dashboard/settings strings.

Out of scope:

1. Social sharing, challenges, or leaderboards.
2. Nutrition/body-composition schema additions.
3. Migration/backfill of older session documents.

## Data Contract Additions

Path: `users/{uid}/app_data/user_preferences`

Document shape:

```json
{
  "weeklyTargetSessions": 3,
  "weeklyTargetDays": 3,
  "weeklyTargetsByWeek": {
    "2026-04-20": {
      "targetSessions": 3,
      "targetDays": 3,
      "savesUsed": 1,
      "updatedAtIso": "2026-04-22T10:00:00.000Z"
    }
  },
  "weeklyOutcomesByWeek": {
    "2026-04-13": {
      "targetSessions": 3,
      "targetDays": 3,
      "sessionCount": 2,
      "activeSessions": 2,
      "activeDays": 2,
      "met": false,
      "lockedAtIso": "2026-04-22T10:00:00.000Z"
    }
  },
  "schemaVersion": 2,
  "updatedAt": "<Firestore Timestamp>"
}
```

Rules:

1. `weeklyTargetSessions` is clamped to `1..7` and resolved from carry-forward week target state. `weeklyTargetDays` remains a read/write compatibility alias.
2. `weeklyTargetsByWeek` stores week-scoped target edits (`targetSessions`, `targetDays`, `savesUsed`, `updatedAtIso`).
3. `weeklyOutcomesByWeek` stores frozen historical week outcomes (`sessionCount`, `activeSessions`, `activeDays`, and both target aliases) used to prevent retroactive streak drift.
4. Missing preference still falls back to `3`.

Session identity and counting:

- New session and Quick Log writes generate a stable `sessionId` and use it as the Firestore document ID.
- Daily Hub weekly progress counts distinct persisted session IDs, so two sessions on the same local day count twice while a repeated queue delivery counts once.
- `activeDays` is retained as a diagnostic/legacy field; it is not the weekly qualification metric.

## Validation Gates

Historical completion criteria for this milestone:

1. `npm run lint:ratchet`
2. `npm run test:app`
3. `npm run test:app:offline`
4. `npm run test:coverage:gate`
5. `npm run test:no-skips`
