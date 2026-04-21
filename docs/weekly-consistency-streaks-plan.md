# Weekly Consistency Streaks Plan

Last updated: April 21, 2026  
Status: In progress (major feature draft PR)

## Purpose

Define the current major feature milestone after Session Variants + ES/EN:

1. Show meaningful weekly consistency streaks in Daily Hub.
2. Let each user define a custom workout-days-per-week target.
3. Keep weekly target synced in cloud with offline replay safety.

## Scope (v1)

In scope:

1. Daily Hub metrics:
   - this-week progress (`activeDays/targetDays`)
   - current weekly streak
   - best weekly streak
2. Weekly model:
   - Monday-based weeks
   - distinct active days (multiple sessions same day count once)
   - rolling 52-week analysis window
3. Weekly target preference:
   - default `3` days/week
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
  "weeklyTargetDays": 3,
  "schemaVersion": 1,
  "updatedAt": "<Firestore Timestamp>"
}
```

Rules:

1. `weeklyTargetDays` is clamped to `1..7`.
2. Missing preference falls back to `3`.
3. Target changes recompute streak metrics immediately.

## Validation Gates

Required before merge:

1. `npm run lint:ratchet`
2. `npm run test:app`
3. `npm run test:app:offline`
4. `npm run test:coverage:gate`
5. `npm run test:no-skips`
