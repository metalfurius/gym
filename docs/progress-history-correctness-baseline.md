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

## Pre-existing validation failure and approved scope exception

The full integration/app gates were run before the CI repair. The same unrelated failure occurred locally and in CI:

```text
tests/integration/app-offline-recovery.test.js:212
Expected: 2026-04-22T08:00:00.000Z
Received: current wall-clock timestamp
```

The queued payload retained the fixed weekly-rule timestamp, but `refreshDailyHub()` finalized past weekly outcomes with the wall clock and overwrote the preference document's `updatedAt` during replay. The approved scope exception was the smallest causal repair: pass the existing `getCurrentDateForWeeklyRules()` clock only to `finalizePastWeeklyOutcomes()`. Daily Hub's ordinary month-count clock remains unchanged; no schema, stored data, read bounds, or product scope changed.

## Regression evidence after the repair

The offline replay assertion now passes and proves that the persisted preference timestamp remains identical to the queued timestamp. Clean-install validation on July 21, 2026 produced:

```text
npm ci                                      passed
npm run lint:ratchet                        passed
npm run test:no-skips                       passed
npm run test:unit                           35 suites, 644 tests passed
npm run test:integration                    7 suites, 45 tests passed
npm run test:coverage:gate                  42 suites, 689 tests passed; 72.63% statements; gate passed
npm run test:app                            5 suites, 5 tests passed
npm run test:app:offline                    2 suites, 2 tests passed
```

Repository-wide `format:check` remains a pre-existing baseline failure across 57 files. `npm audit --audit-level=high` remains a pre-existing dependency-tree failure with six high-severity advisories; neither gate was weakened or changed for this task.
