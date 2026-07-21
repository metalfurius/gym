# Progress History Correctness Baseline

Captured July 21, 2026 on planning commit `d4339dd7388d66b8439971ec847401fd262fd8be`, branch `codex/gym-progress-history-correctness-v1`.

## Reproduction

The deterministic harness seeded three `Bench Press` sessions at 14, 30, and 365 days old, plus ten recent `Squat` sessions. Before cleanup, the exercise cache contained 3 Bench Press records and 10 Squat records. Running the login-time `ExerciseCacheManager.cleanOldEntries()` removed the Bench Press entry because `maxCacheAge` is seven days, while retaining the six Squat records still inside the window. A new cache manager then returned zero Bench Press records, reproducing the offline/restart loss.

Observed result:

```json
{
  "before": { "benchSessions": 3, "squatSessions": 10 },
  "after": { "benchPresent": false, "squatSessions": 6 },
  "offlineRestart": { "benchSessions": 0 },
  "maxCacheAgeDays": 7
}
```

The online login path currently performs a narrow `limit(10)` integrity query and only rebuilds when one of those recent sessions references a missing exercise. With ten newer sessions for another exercise, the old Bench Press history is outside that check and is not rebuilt. The Progress selector also requires at least three cached records per exercise, so the truncated entry is not selectable.

## Baseline validation

Focused suites passed before implementation changes:

```text
Test Suites: 5 passed, 5 total
Tests:       75 passed, 75 total
```

Command:

```text
node --experimental-vm-modules node_modules\\jest\\bin\\jest.js tests\\unit\\exercise-cache.test.js tests\\unit\\progress-flow.test.js tests\\unit\\history-manager.test.js tests\\unit\\session-manager.test.js tests\\unit\\quick-log.test.js --runInBand
```

These passing tests do not cover long-history retention after login, restart, or offline Progress loading. Existing source telemetry labels the narrow integrity query as `exerciseCache.verifyIntegrity` and the bounded rebuild as `exerciseCache.buildFromHistory`; the Progress fallback is labeled `progress.sessionHistoryFallback` with a 300-session limit.

## Pre-existing validation failures

The full integration/app gates were run after the baseline and implementation checkpoint. The same unrelated failure occurred in both runs:

```text
tests/integration/app-offline-recovery.test.js:212
Expected: 2026-04-22T08:00:00.000Z
Received: current wall-clock timestamp
```

The failure is in the weekly-target timestamp fixture; `js/app.js` is unchanged by this task. The remaining integration result was 6 suites passed, 44 tests passed, 1 test failed. `app-offline-retry.test.js`, the app user journey, auth/navigation, language, and Firebase integration suites passed. Repository-wide `format:check` also reports 57 pre-existing files, while `lint:ratchet`, the focused suites, and the unit suite remain green.
